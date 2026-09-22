// De partner klopt zijn eigen voorraad af tegen de winkel. hardware.partner_id (een echte
// kolom, gezet door de winkel bij toewijzen) is LEIDEND; de blob partners.data is fragiel
// (last-write-wins, zie de blob-lost-update-valkuil). Elk toestel dat aan deze partner is
// toegewezen maar niet in zijn data.products staat, zetten we er (opnieuw) in. Zo herstelt
// een toestel dat door een sync-race verdween vanzelf zodra de partner zijn dashboard laadt.
//
// De partner leest hardware NIET zelf (RLS blokkeert dat); deze functie doet dat met de
// service_role en kopieert alleen wat aan hemzelf toegewezen is. verify_jwt MOET false zijn:
// we controleren de Bearer hieronder zelf met wieBelt.

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
function ok(d: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, ...d }), { headers: cors });
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
  const { data: acc } = await admin.from("accounts").select("id, team_id, rol, naam").eq("id", wie.user.id).maybeSingle();
  return acc as { id: string; team_id: string | null; rol: string; naam: string | null } | null;
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function pad4(n: number) { return String(n).padStart(4, "0"); }

// Zelfde vorm als partner-beheer.maakPartnerProduct, zodat een hersteld product niet van een
// vers toegewezen product te onderscheiden is.
function maakPartnerProduct(h: any, nr: number) {
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
    deelType: "pct", deelWaarde: 50,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const acc = await wieBelt(req);
  if (!acc) return fout("Niet ingelogd", 401);

  const partnerId = acc.id;

  // Alle aan deze partner toegewezen toestellen (service_role; de partner mag hardware niet lezen).
  const { data: hw } = await admin.from("hardware").select("*").eq("partner_id", partnerId);
  const toestellen = hw || [];

  let { data: partner } = await admin.from("partners").select("id, data").eq("id", partnerId).maybeSingle();
  if (!partner) {
    await admin.from("partners").insert({ id: partnerId, team_id: null, naam: acc.naam || "Partner", data: {} });
    partner = { id: partnerId, data: {} } as any;
  }
  const data = (partner!.data && typeof partner!.data === "object") ? partner!.data : {};
  const settings = Object.assign({ nextAd: 1, template: "", labW: 62, labH: 32 }, data.settings || {});
  const producten = Array.isArray(data.products) ? data.products : [];
  const aanwezig = new Set(producten.map((p: any) => p && p.hardware_id).filter(Boolean));

  let toegevoegd = 0;
  for (const h of toestellen) {
    if (!h?.id || aanwezig.has(h.id)) continue;
    const nr = Math.max(1, parseInt(settings.nextAd) || 1);
    producten.unshift(maakPartnerProduct(h, nr));
    settings.nextAd = nr + 1;
    aanwezig.add(h.id);
    toegevoegd++;
  }

  if (toegevoegd) {
    const { error } = await admin.from("partners")
      .update({ data: { ...data, products: producten, settings }, bijgewerkt_op: new Date().toISOString() })
      .eq("id", partnerId);
    if (error) return fout("Voorraad bijwerken mislukt: " + error.message, 500);
  }

  return ok({ toegevoegd });
});
