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
function aanzichtVan(nr: number) {
  return ["dicht", "open", "toetsenbord", "links", "rechts", "onderkant"][nr] || "overig";
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

  const merk = String(lijf?.merk || "").trim();
  const model = String(lijf?.model || "").trim();
  if (!merk || !model) return fout("Vul merk en model in");

  // Icecat matcht op de artikelcode van de fabrikant. Wij hebben alleen de
  // modelnaam, dus we proberen een paar schrijfwijzen: zoals ingevoerd, zonder
  // spaties, en in hoofdletters. Dat dekt het grootste deel.
  const pogingen = [model, model.replace(/\s+/g, ""), model.toUpperCase()];

  for (const code of pogingen) {
    const adres = `https://live.icecat.biz/api?UserName=${encodeURIComponent(gebruiker)}` +
      `&Language=nl&Brand=${encodeURIComponent(merk)}&ProductCode=${encodeURIComponent(code)}` +
      `&Content=Gallery,GeneralInfo`;
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
        ok: true, bron: "icecat", gevonden: code,
        titel: uit?.data?.GeneralInfo?.Title || null,
        fotos,
      }), { headers: cors });
    } catch (e) {
      console.error("icecat", code, e);
    }
  }

  return new Response(JSON.stringify({
    ok: true, bron: "icecat", fotos: [],
    melding: "Dit model staat niet in de catalogus. Maak zelf foto's, of probeer het model anders te schrijven.",
  }), { headers: cors });
});
