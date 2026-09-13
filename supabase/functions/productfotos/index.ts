// Zoekt officiële productfoto's bij een merk en model.
//
// Bron: Icecat. Dat is een catalogus waar fabrikanten zelf hun productfoto's en
// specificaties in zetten, en die je met een gratis account mag gebruiken. Dat
// is iets heel anders dan willekeurige plaatjes van internet plukken: deze
// foto's zijn er juist voor bedoeld en je mag ze gebruiken.
//
// Wat je krijgt zijn foto's van het model, niet van dit exemplaar. Precies goed
// voor een webshop; voor Marktplaats wil een koper ook echte foto's zien van
// het apparaat dat hij koopt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Icecat noemt zijn aanzichten anders dan wij. Dit is de vertaling, zodat de
// foto's in dezelfde volgorde staan als bij een set die je zelf maakt.
const AANZICHTEN = ["dicht", "open", "toetsenbord", "links", "rechts", "onderkant"];
function aanzichtVan(nr: number) {
  return AANZICHTEN[nr] || "overig";
}

// Een gevonden fabrieksfoto overnemen. De browser mag niet rechtstreeks bij de
// Icecat-CDN (CORS blokkeert dat), dus halen we hem hier server-side op en zetten
// hem in de eigen opslag — daarna is het net zo'n foto als een die je zelf maakt.
async function overnemen(lijf: any, teamId: string) {
  const url = String(lijf?.url || "");
  const apparaatId = String(lijf?.apparaat_id || "");
  const aanzicht = String(lijf?.aanzicht || "overig");
  if (!apparaatId) return fout("Geen toestel meegegeven");

  // Alleen Icecat-adressen ophalen; nooit een willekeurige URL (dan zou iemand de
  // server naar een eigen adres kunnen laten fetchen).
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return fout("Ongeldige foto-URL"); }
  if (!/(^|\.)icecat\.biz$/.test(host)) return fout("Alleen Icecat-foto's kunnen worden overgenomen");

  const res = await fetch(url);
  if (!res.ok) return fout("De foto kon niet opgehaald worden bij Icecat", 502);
  const type = res.headers.get("content-type") || "image/jpeg";
  const bytes = new Uint8Array(await res.arrayBuffer());

  const pad = `${teamId}/${apparaatId}/${aanzicht}-${Date.now()}.jpg`;
  const { error: opslagFout } = await admin.storage.from("refurbish-fotos")
    .upload(pad, bytes, { contentType: type });
  if (opslagFout) return fout("De foto opslaan mislukte: " + opslagFout.message, 502);

  const { error: rijFout } = await admin.from("refurbish_fotos").insert({
    team_id: teamId, apparaat_id: apparaatId,
    merk: lijf?.merk || null, model: lijf?.model || null,
    aanzicht, pad, volgorde: AANZICHTEN.indexOf(aanzicht),
  });
  if (rijFout) return fout("De foto in de lijst zetten mislukte: " + rijFout.message, 502);

  return new Response(JSON.stringify({ ok: true, pad }), { headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const gebruiker = Deno.env.get("ICECAT_GEBRUIKER");
  if (!gebruiker) {
    return fout("De fotocatalogus is nog niet gekoppeld. Maak een gratis account op icecat.biz en zet de gebruikersnaam in Supabase.", 503);
  }

  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);

  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return fout("Niet ingelogd", 401);

  const { data: acc } = await admin.from("accounts")
    .select("team_id").eq("id", wie.user.id).maybeSingle();
  if (!acc) return fout("Je account is niet gevonden", 403);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }

  // Een gevonden foto overnemen loopt via dezelfde functie, server-side.
  if (lijf?.actie === "overnemen") return await overnemen(lijf, acc.team_id);

  const merk = String(lijf?.merk || "").trim();
  const model = String(lijf?.model || "").trim();
  if (!merk || !model) return fout("Vul merk en model in");

  // Icecat matcht op de GTIN of de artikelcode van de fabrikant, niet op de
  // modelnaam. Hebben we een EAN (vaak bij accessoires, zelden bij een gebruikte
  // laptop), dan is dat veruit de beste kans, dus die eerst. Daarna een paar
  // schrijfwijzen van de modelnaam: zoals ingevoerd, zonder spaties, met
  // streepjes, en in hoofdletters. Dat dekt het grootste deel.
  const ean = String(lijf?.ean || lijf?.gtin || "").replace(/\D/g, "");
  const pogingen: { soort: "gtin" | "code"; waarde: string }[] = [];
  if (ean) pogingen.push({ soort: "gtin", waarde: ean });
  for (const c of [model, model.replace(/\s+/g, ""), model.replace(/\s+/g, "-"), model.toUpperCase()]) {
    pogingen.push({ soort: "code", waarde: c });
  }

  for (const p of pogingen) {
    const sleutel = p.soort === "gtin"
      ? `&GTIN=${encodeURIComponent(p.waarde)}`
      : `&Brand=${encodeURIComponent(merk)}&ProductCode=${encodeURIComponent(p.waarde)}`;
    const adres = `https://live.icecat.biz/api?UserName=${encodeURIComponent(gebruiker)}` +
      `&Language=nl${sleutel}&Content=Gallery,GeneralInfo`;
    try {
      const res = await fetch(adres, { headers: { "Accept": "application/json" } });
      if (!res.ok) continue;
      const uit = await res.json();
      const galerij = uit?.data?.Gallery;
      if (!Array.isArray(galerij) || !galerij.length) continue;

      const fotos = galerij
        .map((g: any, i: number) => ({
          url: g?.Pic || g?.HighPic || g?.LowPic || null,
          klein: g?.ThumbPic || g?.LowPic || g?.Pic || null,
          aanzicht: aanzichtVan(i),
        }))
        .filter((f: any) => f.url)
        .slice(0, 8);

      if (!fotos.length) continue;

      return new Response(JSON.stringify({
        ok: true, bron: "icecat", gevonden: p.waarde,
        titel: uit?.data?.GeneralInfo?.Title || null,
        fotos,
      }), { headers: cors });
    } catch (e) {
      console.error("icecat", p.waarde, e);
    }
  }

  return new Response(JSON.stringify({
    ok: true, bron: "icecat", fotos: [],
    melding: "Dit model staat niet in de catalogus. Maak zelf foto's, of probeer het model anders te schrijven.",
  }), { headers: cors });
});
