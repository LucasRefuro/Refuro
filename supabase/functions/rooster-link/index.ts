// Het rooster delen via een link in de groep, zonder in te loggen.
//
// De winkel heeft twee vaste links (tabel rooster_links), die hij elke week in de
// WhatsApp-groep zet:
//   beschikbaarheid  je tikt je naam aan en geeft door wanneer je kunt (de komende vier weken)
//   rooster          je ziet wie wanneer werkt, maar alleen van weken die de eigenaar deelde,
//                    en zet je eigen diensten met één knop in je agenda (GET, zie onder)
// Zolang inloggen_verplicht uit staat, werkt alles met alleen de link. Staat hij aan, dan
// moet je ingelogd zijn en geef je alleen je eigen beschikbaarheid door.
//
// verify_jwt staat UIT: de link is het toegangsbewijs. Daarom controleren we hier alles
// zelf: het token, dat de naam bij dit team hoort, en dat de dagen in de goede week vallen.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { vandaagNL, maandagVan, doorgeefMaandagen, weekDagen, plusDagen, schoneDagen, geldigToken, agendaIcs } from "./week.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

// Deze en volgende week, met de diensten van de weken die de eigenaar deelde.
async function gedeeldeWeken(teamId: string) {
  const deze = maandagVan(vandaagNL());
  const maandagen = [deze, plusDagen(deze, 7)];
  const { data: wkn } = await admin.from("rooster_weken")
    .select("maandag, gedeeld").eq("team_id", teamId).in("maandag", maandagen);
  const mensen = await teamMensen(teamId);
  const naamVan = new Map(mensen.map((m: any) => [m.id, m.naam]));
  const weken = [];
  for (const maandag of maandagen) {
    const gedeeld = !!(wkn || []).find((w: any) => w.maandag === maandag && w.gedeeld);
    const dagen = weekDagen(maandag);
    let diensten: any[] = [];
    if (gedeeld) {
      const { data } = await admin.from("rooster")
        .select("id, account_id, datum, van, tot")
        .eq("team_id", teamId).gte("datum", dagen[0]).lte("datum", dagen[6])
        .order("datum").order("van");
      // De notitie bij een dienst laten we weg: die schrijft de eigenaar voor zichzelf.
      diensten = (data || []).map((d: any) => ({
        id: d.id, naam: naamVan.get(d.account_id) || "Teamlid", account_id: d.account_id,
        datum: d.datum, van: d.van, tot: d.tot,
      }));
    }
    weken.push({ maandag, dagen, gedeeld, diensten });
  }
  return weken;
}

async function agendaVoor(teamId: string, accountId: string) {
  const weken = await gedeeldeWeken(teamId);
  const mijn = weken.flatMap((w: any) => w.diensten).filter((d: any) => d.account_id === accountId);
  return agendaIcs(mijn, await winkelNaam(teamId));
}

async function winkelNaam(teamId: string) {
  const { data } = await admin.from("klanten").select("naam").eq("id", teamId).maybeSingle();
  return data?.naam || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Zet in je agenda: de knop op de rooster-pagina is een gewone link hierheen, zodat de
  // telefoon het agendabestand zelf opent (op een iPhone "Voeg alles toe"). Een bestand dat
  // de pagina zelf maakt, belandt op een iPhone eerst in Downloads. Alleen met de rooster-link
  // en alleen als inloggen niet verplicht is; anders vraagt de pagina het met POST op.
  if (req.method === "GET") {
    const tekstKop = { "Content-Type": "text/plain; charset=utf-8" };
    const u = new URL(req.url);
    const link = await linkVan(String(u.searchParams.get("token") || ""));
    const wie = String(u.searchParams.get("wie") || "");
    if (!link || link.soort !== "rooster" || !UUID.test(wie)) return new Response("Deze link werkt niet meer.", { status: 404, headers: tekstKop });
    if (link.inloggen_verplicht) return new Response("Log in en open het rooster opnieuw.", { status: 401, headers: tekstKop });
    try {
      const ics = await agendaVoor(link.team_id, wie);
      return new Response(ics, { headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="rooster.ics"',
        "Cache-Control": "no-store",
      } });
    } catch (e) {
      console.error("rooster-link agenda", e);
      return new Response("Er ging iets mis. Probeer het zo nog eens.", { status: 500, headers: tekstKop });
    }
  }
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
      // Meerdere weken vooruit (doorgeefMaandagen). Een inzending gaat over één week tegelijk.
      const maandagen = doorgeefMaandagen(vandaagNL());
      const weken = maandagen.map((m) => ({ maandag: m, dagen: weekDagen(m) }));
      const eerste = weken[0].dagen[0];
      const laatste = weken[weken.length - 1].dagen[6];

      if (actie === "info") {
        let mensen = await teamMensen(link.team_id);
        if (ik) mensen = mensen.filter((m: any) => m.id === ik.id);
        const { data: besch } = await admin.from("beschikbaarheid")
          .select("account_id, datum, beschikbaar, van, tot")
          .eq("team_id", link.team_id).gte("datum", eerste).lte("datum", laatste);
        const ids = new Set(mensen.map((m: any) => m.id));
        const ingevuld: Record<string, any[]> = {};
        for (const b of (besch || [])) {
          if (!ids.has(b.account_id)) continue;
          (ingevuld[b.account_id] ||= []).push({ datum: b.datum, beschikbaar: b.beschikbaar, van: b.van, tot: b.tot });
        }
        // maandag en dagen (de eerste week) blijven erbij voor een pagina die nog van voor de
        // weken komt en in iemands browser openstaat.
        return klaar({ soort: "beschikbaarheid", winkel, maandag: weken[0].maandag, dagen: weken[0].dagen, weken, mensen, ingevuld });
      }

      if (actie === "doorgeven") {
        // Zonder maandag (oude pagina) is het de komende week. Een maandag die niet meer in
        // het rijtje valt (pagina bleef over het weekend open) weigeren we met uitleg, in
        // plaats van de dagen stil weg te gooien.
        const gevraagd = String(lijf?.maandag || "");
        if (gevraagd && !maandagen.includes(gevraagd)) return fout("Deze week kun je niet meer doorgeven. Open de link opnieuw.");
        const maandag = gevraagd || maandagen[0];
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
    // Met inloggen verplicht haalt de pagina het agendabestand hier op (voor jezelf).
    if (actie === "agenda" && ik) return klaar({ ics: await agendaVoor(link.team_id, ik.id) });
    if (actie !== "info") return fout("Met deze link kun je alleen kijken", 403);
    const weken = await gedeeldeWeken(link.team_id);
    return klaar({ soort: "rooster", winkel, weken, ik: ik ? ik.id : null, verplicht: !!link.inloggen_verplicht });
  } catch (e) {
    console.error("rooster-link", e);
    return fout(e instanceof Error ? e.message : "Er ging iets mis", 500);
  }
});
