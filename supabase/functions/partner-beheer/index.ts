// Partner-beheer vanuit de winkel: een partner aanmaken, hardware toewijzen, en een
// toestel zichtbaar maken in het eigen partner-dashboard.
//
// Acties:
//   uitnodigen     - (eigenaar/beheerder) maakt een partner-account (eigen login, rol
//                    'partner', GEEN winkel-team zodat hij niets van de winkel ziet)
//                    plus een partners-rij. De winkel kiest een begin-wachtwoord.
//   toewijzen      - (eigenaar/beheerder) kopieert een toestel naar een EXTERNE partner
//                    (consignatie met winstverdeling): zet hardware.partner_id +
//                    status 'toegewezen', en legt het vast in voorraad_verplaatsingen.
//   dashboard_aan  - (elk winkel-teamlid) maakt een toestel zichtbaar op de pagina
//                    "Online zetten" van het EIGEN dashboard van de winkel. Puur om de
//                    advertentie-tool te gebruiken: geen winstverdeling, het toestel
//                    blijft gewoon in de voorraad (status en partner_id blijven staan).
//                    De vlag komt op hardware.kanalen.partner = { id: <product> }.
//   dashboard_uit  - (elk winkel-teamlid) haalt hem daar weer weg.
//
// Het "eigen dashboard" van de winkel is de werkruimte van de eigenaar (partners-rij
// met id = het account van de eigenaar). Zo landt alles wat een medewerker zichtbaar
// maakt in hetzelfde dashboard dat de eigenaar opent, niet in losse werkruimtes.
//
// De partner leest hardware NIET; het toestel wordt gekopieerd. De service_role doet
// alle kanten veilig, want alleen deze functie mag in de partner-data schrijven.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}
async function wieBelt(req: Request) {
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return null;
  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return null;
  const { data: acc } = await admin.from("accounts").select("id, team_id, rol").eq("id", wie.user.id).maybeSingle();
  return acc as { id: string; team_id: string; rol: string } | null;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function pad4(n: number) { return String(n).padStart(4, "0"); }

// Bouwt uit een hardware-rij het StockDeck-product dat in partners.data.products gaat.
// Gedeeld door toewijzen (met winstverdeling in extra) en dashboard_aan (zonder).
function maakPartnerProduct(h: any, nr: number, extra: Record<string, unknown>) {
  const sp = (h.specs && typeof h.specs === "object") ? h.specs : {};
  return {
    id: uid(),
    type: h.categorie === "Laptop" ? "laptop" : "anders",
    model: [h.merk, h.model].filter(Boolean).join(" ") || (h.model || "Toestel"),
    adnummer: pad4(nr),
    inkoop: Number(h.inkoop) || 0,
    kosten: 0,
    vraagprijs: h.verkoop != null ? Number(h.verkoop) : null,
    specs: { cpu: sp.Processor || "", ram: sp.Geheugen || "", opslag: sp.Opslag || "", scherm: sp.Scherm || "" },
    grade: h.staat || "",
    titel: h.titel || [h.merk, h.model].filter(Boolean).join(" "),
    adtekst: h.omschrijving || "",
    adKosten: 0,
    fb: false, mp: false,
    adsOffline: { fb: false, mp: false },
    notitie: h.serienummer ? "Serienummer: " + h.serienummer : "",
    fotos: Array.isArray(h.fotos) ? h.fotos.filter((u: any) => typeof u === "string") : [],
    hardware_id: h.id,
    units: [{ id: uid(), defect: "", extra: "", extraKosten: 0, verkocht: false }],
    ...extra,
  };
}

// Het gedeelde winkel-dashboard = de werkruimte van de eigenaar van dit team.
async function winkelWerkruimte(teamId: string): Promise<string | null> {
  const { data } = await admin.from("accounts")
    .select("id").eq("team_id", teamId).eq("rol", "eigenaar").limit(1).maybeSingle();
  return (data as { id: string } | null)?.id || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const acc = await wieBelt(req);
  if (!acc) return fout("Niet ingelogd", 401);
  // Een partner (team_id null) heeft hier niets te zoeken; dit is winkelbeheer.
  if (!acc.team_id) return fout("Alleen een winkelaccount kan dit", 403);
  const magBeheer = ["eigenaar", "beheerder"].includes(acc.rol);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const actie = String(lijf?.actie || "");

  // ---- een partner aanmaken ----
  if (actie === "uitnodigen") {
    if (!magBeheer) return fout("Alleen de winkel mag dit", 403);
    const naam = String(lijf.naam || "").trim();
    const email = String(lijf.email || "").trim().toLowerCase();
    const ww = String(lijf.wachtwoord || "");
    if (!naam) return fout("Vul een naam in");
    if (!email.includes("@")) return fout("Vul een geldig e-mailadres in");
    if (ww.length < 8) return fout("Kies een begin-wachtwoord van minstens 8 tekens");

    const { data: gemaakt, error: uErr } = await admin.auth.admin.createUser({
      email, password: ww, email_confirm: true,
    });
    if (uErr || !gemaakt?.user) {
      return fout("Aanmaken mislukt: " + (uErr?.message || "onbekend") +
        (uErr?.message?.includes("already") ? " (dit e-mailadres bestaat al)" : ""), 400);
    }
    const id = gemaakt.user.id;
    // team_id BEWUST null: zo matcht de partner geen enkele winkel-RLS.
    const { error: aErr } = await admin.from("accounts").upsert({
      id, naam, rol: "partner", team_id: null, email, gebruikersnaam: email,
    });
    if (aErr) { return fout("Account opslaan mislukt: " + aErr.message, 500); }
    const { error: pErr } = await admin.from("partners").upsert({
      id, team_id: acc.team_id, naam, data: {},
    });
    if (pErr) { return fout("Partner opslaan mislukt: " + pErr.message, 500); }
    return new Response(JSON.stringify({ ok: true, email }), { headers: cors });
  }

  // ---- een toestel toewijzen aan een partner ----
  if (actie === "toewijzen") {
    if (!magBeheer) return fout("Alleen de winkel mag dit", 403);
    const hardwareId = String(lijf.hardware_id || "");
    const partnerId = String(lijf.partner_id || "");
    const deelType = lijf.deel_type === "eur" ? "eur" : "pct";
    const deelWaarde = Number(lijf.deel_waarde);
    const deel = Number.isFinite(deelWaarde) ? deelWaarde : 50;
    if (!hardwareId || !partnerId) return fout("Toestel en partner zijn nodig");

    // Alleen eigen toestel en eigen partner.
    const { data: h } = await admin.from("hardware")
      .select("*").eq("id", hardwareId).eq("team_id", acc.team_id).maybeSingle();
    if (!h) return fout("Dit toestel is niet gevonden", 404);
    if (h.partner_id) return fout("Dit toestel is al aan een partner toegewezen");
    const { data: partner } = await admin.from("partners")
      .select("id, data").eq("id", partnerId).eq("team_id", acc.team_id).maybeSingle();
    if (!partner) return fout("Deze partner is niet gevonden", 404);

    const data = (partner.data && typeof partner.data === "object") ? partner.data : {};
    const settings = Object.assign({ nextAd: 1, template: "", labW: 62, labH: 32 }, data.settings || {});
    const producten = Array.isArray(data.products) ? data.products : [];

    const nr = Math.max(1, parseInt(settings.nextAd) || 1);
    const product = maakPartnerProduct(h, nr, { deelType, deelWaarde: deel });
    producten.unshift(product);
    settings.nextAd = nr + 1;

    const { error: pErr } = await admin.from("partners")
      .update({ data: { products: producten, settings }, bijgewerkt_op: new Date().toISOString() })
      .eq("id", partnerId);
    if (pErr) return fout("Toewijzen mislukt: " + pErr.message, 500);

    await admin.from("hardware")
      .update({ partner_id: partnerId, status: "toegewezen", bijgewerkt_op: new Date().toISOString() })
      .eq("id", hardwareId);

    // Vastleggen wie welk toestel kreeg (bestaande verplaatsingen-tabel).
    await admin.from("voorraad_verplaatsingen").insert({
      team_id: acc.team_id, hardware_id: hardwareId,
      door: acc.id, reden: "toegewezen aan partner",
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  // ---- een toestel zichtbaar maken in het eigen winkel-dashboard (Online zetten) ----
  if (actie === "dashboard_aan" || actie === "dashboard_uit") {
    const hardwareId = String(lijf.hardware_id || "");
    if (!hardwareId) return fout("Toestel is nodig");

    const { data: h } = await admin.from("hardware")
      .select("*").eq("id", hardwareId).eq("team_id", acc.team_id).maybeSingle();
    if (!h) return fout("Dit toestel is niet gevonden", 404);

    const werkruimteId = (await winkelWerkruimte(acc.team_id)) || acc.id;

    // De werkruimte ophalen. Aanmaken alleen als hij nog niet bestaat, nooit
    // overschrijven: anders wis je de producten die er al in staan.
    let { data: partner } = await admin.from("partners")
      .select("id, data").eq("id", werkruimteId).maybeSingle();
    if (!partner) {
      await admin.from("partners").insert({ id: werkruimteId, team_id: acc.team_id, naam: "Winkel", data: {} });
      partner = { id: werkruimteId, data: {} } as any;
    }
    const data = (partner!.data && typeof partner!.data === "object") ? partner!.data : {};
    const settings = Object.assign({ nextAd: 1, template: "", labW: 62, labH: 32 }, data.settings || {});
    let producten = Array.isArray(data.products) ? data.products : [];
    const kanalen = Object.assign({}, (h.kanalen && typeof h.kanalen === "object") ? h.kanalen : {});

    if (actie === "dashboard_uit") {
      producten = producten.filter((p: any) => p.hardware_id !== h.id);
      delete kanalen.partner;
    } else {
      // Een consignatie-toestel (al aan een externe partner) hoort niet óók in het
      // eigen dashboard: dan zou je het op twee plekken tegelijk online zetten.
      if (h.partner_id) return fout("Dit toestel is toegewezen aan een partner");
      const bestaat = producten.find((p: any) => p.hardware_id === h.id);
      if (bestaat) {
        kanalen.partner = { id: bestaat.id };
      } else {
        const nr = Math.max(1, parseInt(settings.nextAd) || 1);
        const product = maakPartnerProduct(h, nr, { deelType: "eur", deelWaarde: 0, eigenDashboard: true });
        producten.unshift(product);
        settings.nextAd = nr + 1;
        kanalen.partner = { id: product.id };
      }
    }

    const { error: pErr } = await admin.from("partners")
      .update({ data: { products: producten, settings }, bijgewerkt_op: new Date().toISOString() })
      .eq("id", werkruimteId);
    if (pErr) return fout("Opslaan in het dashboard mislukt: " + pErr.message, 500);

    await admin.from("hardware")
      .update({ kanalen, bijgewerkt_op: new Date().toISOString() }).eq("id", hardwareId);

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  return fout("Onbekende actie");
});
