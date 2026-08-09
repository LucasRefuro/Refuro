// Zoekt de specificaties bij een merk en model.
//
// Twee bronnen, in deze volgorde:
//
//   1. de gedeelde modellenlijst. Wat een andere winkel ooit heeft ingevuld
//      staat er al in, en dat is gratis en meteen goed.
//   2. AI, als het model nog nieuw is. Het antwoord gaat daarna de lijst in,
//      zodat we het maar één keer hoeven te vragen.
//
// Specificaties van een laptopmodel zijn openbare feiten. Er gaat niets over
// de winkel of de klant mee, alleen merk en model.

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

// Alleen deze velden slaan we op. Zo blijft de lijst overzichtelijk en kan een
// verkeerd antwoord niet van alles bijzetten.
const VELDEN = ["Processor", "Geheugen", "Opslag", "Scherm", "Videokaart", "Touchscreen", "Bouwjaar"];

// Per onderdeel alles wat er voor dit model verkocht is. Van een zakelijke
// laptop bestaan tien processors en vier schermen; welke er voor je staat weet
// je pas als Windows draait. Eén "meest voorkomende uitvoering" is dan precies
// het verkeerde antwoord.
const KEUZEVELDEN = ["Processor", "Geheugen", "Opslag", "Videokaart", "Scherm"];

function optiesOpschonen(rauw: any) {
  const uit: Record<string, string[]> = {};
  if (!rauw || typeof rauw !== "object") return uit;
  for (const veld of KEUZEVELDEN) {
    const lijst = Array.isArray(rauw[veld]) ? rauw[veld] : [];
    const schoon: string[] = [];
    for (const w of lijst) {
      const t = String(w ?? "").trim();
      if (!t || t.length > 90) continue;
      if (t.toLowerCase() === "onbekend") continue;
      // Dubbelen eruit, hoofdletters ongevoelig: "16 GB" en "16 gb" is hetzelfde.
      if (schoon.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
      schoon.push(t);
      if (schoon.length >= 14) break;
    }
    if (schoon.length) uit[veld] = schoon;
  }
  return uit;
}

function opschonen(rauw: any) {
  const uit: Record<string, string> = {};
  if (!rauw || typeof rauw !== "object") return uit;
  for (const veld of VELDEN) {
    const w = rauw[veld];
    if (w == null) continue;
    const t = String(w).trim();
    if (t && t.toLowerCase() !== "onbekend" && t.length < 120) uit[veld] = t;
  }
  return uit;
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

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }

  const merk = String(lijf?.merk || "").trim().slice(0, 60);
  const model = String(lijf?.model || "").trim().slice(0, 120);
  const categorie = String(lijf?.categorie || "Laptop").trim().slice(0, 40);
  if (!model) return fout("Vul eerst een model in");

  // 1. Staat het er al?
  const { data: bekend } = await admin.from("hardware_modellen")
    .select("merk, model, categorie, specs, varianten, opties")
    .ilike("model", model)
    .ilike("merk", merk || "%")
    .maybeSingle();

  // Alleen teruggeven als we ook de keuzelijsten hebben. Staat er een model in
  // van voor deze wijziging, dan halen we die er alsnog bij; anders zou een
  // winkel voor altijd met één uitvoering blijven zitten.
  if (bekend && Object.keys(bekend.specs || {}).length
             && Object.keys(bekend.opties || {}).length) {
    return new Response(JSON.stringify({
      ok: true, bron: "lijst", merk: bekend.merk, model: bekend.model,
      specs: bekend.specs, opties: bekend.opties, varianten: bekend.varianten || [],
    }), { headers: cors });
  }

  // 2. Anders het aan de AI vragen.
  const sleutel = Deno.env.get("ANTHROPIC_API_KEY");
  if (!sleutel) return fout("Dit model staat nog niet in de lijst", 404);

  const prompt = `Welke uitvoeringen bestaan er van dit apparaat?

Merk: ${merk || "onbekend"}
Model: ${model}
Soort: ${categorie}

Iemand staat met dit apparaat voor zich en leest op het scherm af wat erin zit.
Hij moet zijn uitvoering kunnen aanklikken. Geef daarom per onderdeel ALLE
uitvoeringen die van dit model zijn verkocht, niet alleen de meest voorkomende:

- Processor: elke processor die in dit model is geleverd, van traag naar snel
- Geheugen: elke geheugengrootte, van klein naar groot
- Opslag: elke opslagoptie, met soort erbij, van klein naar groot
- Videokaart: elke videokaart, met de geïntegreerde erbij
- Scherm: elke schermuitvoering, met maat en resolutie

Liever een lijst te lang dan te kort: een uitvoering die er niet bij staat kan
hij niet aanklikken. Maar verzin niets. Weet je van een onderdeel niets zeker,
laat die lijst dan leeg.

Geef daarnaast in "specs" de meest voorkomende uitvoering, als startpunt.

Antwoord uitsluitend met JSON:
{"merk":"...","model":"...",
 "specs":{"Processor":"...","Geheugen":"...","Opslag":"...","Scherm":"...","Videokaart":"...","Touchscreen":"ja of nee","Bouwjaar":"..."},
 "opties":{"Processor":["...","..."],"Geheugen":["...","..."],"Opslag":["...","..."],"Videokaart":["...","..."],"Scherm":["...","..."]}}

Schrijf het geheugen als "16 GB", de opslag als "512 GB SSD" en het scherm als
"14 inch Full HD". Corrigeer een typefout in het model als je zeker weet welk
apparaat bedoeld wordt.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": sleutel,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001",
        max_tokens: 1600,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const uit = await res.json();
    if (!res.ok) throw new Error(uit?.error?.message || "Het opzoeken mislukte");

    const tekst = (uit?.content || []).map((c: any) => c.text || "").join("").trim();
    const m = tekst.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Er kwam geen bruikbaar antwoord terug");
    const j = JSON.parse(m[0]);

    const specs = opschonen(j.specs);
    const opties = optiesOpschonen(j.opties);

    // Wat als startpunt is gekozen hoort ook in de lijst te staan, anders staat
    // het veld ingevuld met iets wat je niet kunt aanklikken.
    for (const veld of KEUZEVELDEN) {
      const w = specs[veld];
      if (!w) continue;
      if (!opties[veld]) opties[veld] = [];
      if (!opties[veld].some((x) => x.toLowerCase() === w.toLowerCase())) {
        opties[veld].unshift(w);
      }
    }
    const merkUit = String(j.merk || merk || "").trim().slice(0, 60);
    const modelUit = String(j.model || model).trim().slice(0, 120);

    if (!Object.keys(specs).length && !Object.keys(opties).length) {
      return new Response(JSON.stringify({
        ok: true, bron: "ai", merk: merkUit, model: modelUit, specs: {}, opties: {},
        melding: "Dit model is niet herkend, vul het zelf even in",
      }), { headers: cors });
    }

    // Onthouden voor de volgende keer, voor iedereen. Gaat via een functie en
    // niet via een gewone upsert, omdat het unieke slot op kleine letters staat
    // en dat kun je met een upsert niet aanwijzen.
    await admin.rpc("model_bewaren", {
      merk_in: merkUit || "Onbekend", model_in: modelUit,
      categorie_in: categorie, specs_in: specs,
    });
    if (Object.keys(opties).length) {
      await admin.rpc("model_opties_bewaren", {
        merk_in: merkUit || "Onbekend", model_in: modelUit, opties_in: opties,
      });
    }

    return new Response(JSON.stringify({
      ok: true, bron: "ai", merk: merkUit, model: modelUit, specs, opties,
    }), { headers: cors });
  } catch (e) {
    console.error("model-specs", e);
    return fout(e instanceof Error ? e.message : "Het opzoeken mislukte", 502);
  }
});
