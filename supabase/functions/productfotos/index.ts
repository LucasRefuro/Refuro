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

// Een fabrieksfoto opslaan. Bron kan zijn: een gevonden Icecat-foto, een geplakte
// fabrikantslink, of een upload (base64). De browser mag niet rechtstreeks bij een
// externe CDN (CORS blokkeert dat), dus doet de server het.
//
// Met heelModel=true hoort de foto bij het hele model (apparaat_id leeg): je vult
// hem één keer en elk volgend toestel van dat model krijgt hem vanzelf, omdat
// fotosLaden de modelfoto's meeleest.
async function overnemen(lijf: any, teamId: string) {
  const heelModel = !!lijf?.heelModel;
  const apparaatId = String(lijf?.apparaat_id || "");
  const model = String(lijf?.model || "").trim();
  const merk = String(lijf?.merk || "").trim();
  const aanzicht = String(lijf?.aanzicht || "open");
  if (!heelModel && !apparaatId) return fout("Geen toestel meegegeven");
  if (heelModel && !model) return fout("Geen model meegegeven");

  let bytes: Uint8Array;
  let type = "image/jpeg";
  const data = String(lijf?.data || "");
  if (data.startsWith("data:")) {
    // Een upload komt als base64 binnen: geen externe fetch nodig.
    const komma = data.indexOf(",");
    type = data.slice(5, data.indexOf(";")) || "image/jpeg";
    try { bytes = Uint8Array.from(atob(data.slice(komma + 1)), (c) => c.charCodeAt(0)); }
    catch { return fout("De afbeelding kon niet gelezen worden"); }
  } else {
    // Een link (Icecat of de fabrikant). Nooit een intern adres ophalen (SSRF).
    let u: URL;
    try { u = new URL(String(lijf?.url || "")); } catch { return fout("Ongeldige foto-URL"); }
    if (u.protocol !== "https:" && u.protocol !== "http:") return fout("Alleen http(s)-adressen");
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") ||
        /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.includes(":")) {
      return fout("Dit adres kan niet worden opgehaald");
    }
    const res = await fetch(u.href);
    if (!res.ok) return fout("De foto kon niet opgehaald worden", 502);
    type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return fout("Dat adres is geen afbeelding");
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  if (bytes.length > 12_000_000) return fout("De afbeelding is te groot");

  const sleutel = (heelModel ? `model_${merk}-${model}` : apparaatId).replace(/[^\w.-]+/g, "_");
  const pad = `${teamId}/${sleutel}/${aanzicht}-${Date.now()}.jpg`;
  const { error: opslagFout } = await admin.storage.from("refurbish-fotos")
    .upload(pad, bytes, { contentType: type });
  if (opslagFout) return fout("De foto opslaan mislukte: " + opslagFout.message, 502);

  const { error: rijFout } = await admin.from("refurbish_fotos").insert({
    team_id: teamId, apparaat_id: heelModel ? null : apparaatId,
    merk: merk || null, model: model || null,
    aanzicht, pad, volgorde: AANZICHTEN.indexOf(aanzicht),
  });
  if (rijFout) return fout("De foto in de lijst zetten mislukte: " + rijFout.message, 502);

  return new Response(JSON.stringify({ ok: true, pad }), { headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

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

  // Een foto overnemen (Icecat, upload of link) loopt via dezelfde functie,
  // server-side. Dat werkt ook zonder Icecat-account.
  if (lijf?.actie === "overnemen") return await overnemen(lijf, acc.team_id);

  // Vanaf hier is het zóeken in de catalogus; daar is het Icecat-account voor nodig.
  const gebruiker = Deno.env.get("ICECAT_GEBRUIKER");
  if (!gebruiker) {
    return fout("De fotocatalogus is nog niet gekoppeld. Maak een gratis account op icecat.biz en zet de gebruikersnaam in Supabase.", 503);
  }

  const merk = String(lijf?.merk || "").trim();
  const model = String(lijf?.model || "").trim();
  if (!merk || !model) return fout("Vul merk en model in");

  // Icecat matcht op de GTIN of de artikelcode van de fabrikant, niet op de
  // modelnaam. Hebben we een EAN (vaak bij accessoires, zelden bij een gebruikte
  // laptop), dan is dat veruit de beste kans, dus die eerst. Daarna een paar
  // schrijfwijzen van de modelnaam: zoals ingevoerd, zonder spaties, met
  // streepjes, en in hoofdletters. Dat dekt het grootste deel.
  const ean = String(lijf?.ean || lijf?.gtin || "").replace(/\D/g, "");
  // De fabrikant-artikelcode (bv. HP '3JX01EA') die de laptop zelf ophaalt is veruit de
  // beste match: Icecat indexeert daarop. Die proberen we dus als eerste, nog voor de
  // schrijfwijzen van de modelnaam.
  const productcode = String(lijf?.productcode || "").trim();
  const pogingen: { soort: "gtin" | "code"; waarde: string }[] = [];
  if (ean) pogingen.push({ soort: "gtin", waarde: ean });
  if (productcode) {
    pogingen.push({ soort: "code", waarde: productcode });
    if (productcode.toUpperCase() !== productcode) pogingen.push({ soort: "code", waarde: productcode.toUpperCase() });
  }
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
