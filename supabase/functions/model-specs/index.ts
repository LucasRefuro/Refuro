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
    .select("merk, model, categorie, specs")
    .ilike("model", model)
    .ilike("merk", merk || "%")
    .maybeSingle();

  if (bekend && Object.keys(bekend.specs || {}).length) {
    return new Response(JSON.stringify({
      ok: true, bron: "lijst", merk: bekend.merk, model: bekend.model, specs: bekend.specs,
    }), { headers: cors });
  }

  // 2. Anders het aan de AI vragen.
  const sleutel = Deno.env.get("ANTHROPIC_API_KEY");
  if (!sleutel) return fout("Dit model staat nog niet in de lijst", 404);

  const prompt = `Wat zijn de gebruikelijke specificaties van dit apparaat?

Merk: ${merk || "onbekend"}
Model: ${model}
Soort: ${categorie}

Geef de meest voorkomende uitvoering. Weet je het niet zeker, laat het veld dan
weg; een leeg veld is beter dan een verzonnen antwoord.

Antwoord uitsluitend met JSON:
{"merk":"...","model":"...","specs":{"Processor":"...","Geheugen":"...","Opslag":"...","Scherm":"...","Videokaart":"...","Touchscreen":"ja of nee","Bouwjaar":"..."}}

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
        max_tokens: 700,
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
    const merkUit = String(j.merk || merk || "").trim().slice(0, 60);
    const modelUit = String(j.model || model).trim().slice(0, 120);

    if (!Object.keys(specs).length) {
      return new Response(JSON.stringify({
        ok: true, bron: "ai", merk: merkUit, model: modelUit, specs: {},
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

    return new Response(JSON.stringify({
      ok: true, bron: "ai", merk: merkUit, model: modelUit, specs,
    }), { headers: cors });
  } catch (e) {
    console.error("model-specs", e);
    return fout(e instanceof Error ? e.message : "Het opzoeken mislukte", 502);
  }
});
