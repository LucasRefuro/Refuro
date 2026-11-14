// Het rooster delen via een link in de groep, zonder in te loggen.
//
// De winkel heeft twee vaste links (tabel rooster_links), die hij elke week in de
// WhatsApp-groep zet:
//   beschikbaarheid  je tikt je naam aan en geeft door wanneer je kunt (de komende week)
//   rooster          je ziet wie wanneer werkt, maar alleen van weken die de eigenaar deelde
// Zolang inloggen_verplicht uit staat, werkt alles met alleen de link. Staat hij aan, dan
// moet je ingelogd zijn en geef je alleen je eigen beschikbaarheid door.
//
// verify_jwt staat UIT: de link is het toegangsbewijs. Daarom controleren we hier alles
// zelf: het token, dat de naam bij dit team hoort, en dat de dagen in de goede week vallen.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { vandaagNL, maandagVan, komendeMaandag, weekDagen, plusDagen, schoneDagen, geldigToken } from "./week.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}
function klaar(uit: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...uit }), { headers: cors });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function linkVan(token: string) {
  if (!geldigToken(token)) return null;
  const { data } = await admin.from("rooster_links")
    .select("team_id, token_beschikbaarheid, token_rooster, inloggen_verplicht")
    .or(`token_beschikbaarheid.eq.${token},token_rooster.eq.${token}`).limit(1);
  const l = data?.[0];
  if (!l) return null;
  return { ...l, soort: l.token_beschikbaarheid === token ? "beschikbaarheid" : "rooster" };
}

// Wie belt er (alleen nodig als de winkel inloggen verplicht heeft gezet).
async function ingelogdAccount(req: Request) {
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return null;
  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data } = await klant.auth.getUser();
  if (!data?.user) return null;
  const { data: acc } = await admin.from("accounts").select("id, naam, team_id").eq("id", data.user.id).maybeSingle();
  return acc || null;
}

async function teamMensen(teamId: string) {
  const { data } = await admin.from("accounts").select("id, naam").eq("team_id", teamId);
  return (data || [])
    .map((a: any) => ({ id: a.id, naam: String(a.naam || "").trim() || "Teamlid" }))
    .sort((a: any, b: any) => a.naam.localeCompare(b.naam, "nl"));
}

async function winkelNaam(teamId: string) {
  const { data } = await admin.from("klanten").select("naam").eq("id", teamId).maybeSingle();
  return data?.naam || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const link = await linkVan(String(lijf?.token || ""));
  if (!link) return fout("Deze link werkt niet meer. Vraag om de nieuwe link.", 404);

  const actie = String(lijf?.actie || "info");
  const winkel = await winkelNaam(link.team_id);
  let ik: any = null;
  if (link.inloggen_verplicht) {
    ik = await ingelogdAccount(req);
    if (!ik || ik.team_id !== link.team_id) {
      if (actie === "info") return klaar({ soort: link.soort, winkel, inloggen: true });
      return fout("Log eerst in", 401);
    }
  }

  try {
    // ── beschikbaarheid ──
    if (link.soort === "beschikbaarheid") {
      const maandag = komendeMaandag(vandaagNL());
      const dagen = weekDagen(maandag);

      if (actie === "info") {
        let mensen = await teamMensen(link.team_id);
        if (ik) mensen = mensen.filter((m: any) => m.id === ik.id);
        const { data: besch } = await admin.from("beschikbaarheid")
          .select("account_id, datum, beschikbaar, van, tot")
          .eq("team_id", link.team_id).gte("datum", dagen[0]).lte("datum", dagen[6]);
        const ids = new Set(mensen.map((m: any) => m.id));
        const ingevuld: Record<string, any[]> = {};
        for (const b of (besch || [])) {
          if (!ids.has(b.account_id)) continue;
          (ingevuld[b.account_id] ||= []).push({ datum: b.datum, beschikbaar: b.beschikbaar, van: b.van, tot: b.tot });
        }
        return klaar({ soort: "beschikbaarheid", winkel, maandag, dagen, mensen, ingevuld });
      }

      if (actie === "doorgeven") {
        const accountId = String(lijf?.account_id || "");
        if (!UUID.test(accountId)) return fout("Kies eerst je naam");
        if (ik && ik.id !== accountId) return fout("Je kunt alleen je eigen beschikbaarheid doorgeven", 403);
        const { data: acc } = await admin.from("accounts").select("id, team_id").eq("id", accountId).maybeSingle();
        if (!acc || acc.team_id !== link.team_id) return fout("Deze naam hoort niet bij dit team", 403);
        const schoon = schoneDagen(lijf?.dagen, maandag);
        if (!schoon.length) return fout("Je hebt nog geen dagen aangetikt");
        const nu = new Date().toISOString();
        // status 'ingediend': zo kleurt het planbord hem groen. Goedkeuren is er niet meer.
        const rijen = schoon.map((d) => ({
          team_id: link.team_id, account_id: accountId, datum: d.datum, beschikbaar: d.beschikbaar,
          van: d.van, tot: d.tot, status: "ingediend", afwijs_reden: null, bijgewerkt_op: nu,
        }));
        const { error } = await admin.from("beschikbaarheid").upsert(rijen, { onConflict: "account_id,datum" });
        if (error) throw new Error("Opslaan lukte niet");
        return klaar({ opgeslagen: rijen.length, maandag });
      }
      return fout("Onbekende actie");
    }

    // ── rooster bekijken ──
    if (actie !== "info") return fout("Met deze link kun je alleen kijken", 403);
    const deze = maandagVan(vandaagNL());
    const maandagen = [deze, plusDagen(deze, 7)];
    const { data: wkn } = await admin.from("rooster_weken")
      .select("maandag, gedeeld").eq("team_id", link.team_id).in("maandag", maandagen);
    const mensen = await teamMensen(link.team_id);
    const naamVan = new Map(mensen.map((m: any) => [m.id, m.naam]));
    const weken = [];
    for (const maandag of maandagen) {
      const gedeeld = !!(wkn || []).find((w: any) => w.maandag === maandag && w.gedeeld);
      const dagen = weekDagen(maandag);
      let diensten: any[] = [];
      if (gedeeld) {
        const { data } = await admin.from("rooster")
          .select("account_id, datum, van, tot")
          .eq("team_id", link.team_id).gte("datum", dagen[0]).lte("datum", dagen[6])
          .order("datum").order("van");
        // De notitie bij een dienst laten we weg: die schrijft de eigenaar voor zichzelf.
        diensten = (data || []).map((d: any) => ({
          naam: naamVan.get(d.account_id) || "Teamlid", account_id: d.account_id,
          datum: d.datum, van: d.van, tot: d.tot,
        }));
      }
      weken.push({ maandag, dagen, gedeeld, diensten });
    }
    return klaar({ soort: "rooster", winkel, weken, ik: ik ? ik.id : null });
  } catch (e) {
    console.error("rooster-link", e);
    return fout(e instanceof Error ? e.message : "Er ging iets mis", 500);
  }
});
