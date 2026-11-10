// Welke kleuren bestaan er van een telefoon- of tabletmodel.
//
// Een telefoon zoekt zijn fabrieksfoto's op kleur, en de webshop zet de kleur in de
// sleutel van de advertentie. Eerst moest de winkelier de kleurnaam zelf opzoeken en
// overtypen ("Onyx Black" of toch "Zwart"?). Nu kiest hij hem uit een lijst.
//
// Twee bronnen, in deze volgorde:
//   1. de tabel model_kleuren, gedeeld door alle winkels. Wat er al in staat komt
//      meteen terug en kost niets.
//   2. Claude, als het model nog nieuw is. Het antwoord gaat de tabel in, zodat elk
//      model maar één keer wordt opgezocht.
//
// Kleuren van een model zijn openbare feiten: er gaat alleen merk en model mee, niets
// over de winkel of de klant. Een lege lijst bewaren we niet: dan was het een typefout
// of een onbekend model, en een volgende poging met de goede naam moet gewoon kunnen.

import Anthropic from "npm:@anthropic-ai/sdk";
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
function klaar(uit: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...uit }), { headers: cors });
}

// Het antwoord ligt vast in een schema (structured outputs): dan is het altijd geldige
// JSON en hoeven we geen tekst te ontleden.
const SCHEMA = {
  type: "object",
  properties: { kleuren: { type: "array", items: { type: "string" } } },
  required: ["kleuren"],
  additionalProperties: false,
};

// Dubbelen eruit (hoofdletters tellen niet), lege en rare lange namen weg, en begrensd:
// een lijst van zestig "kleuren" is geen antwoord maar een fout.
function schoon(lijst: unknown): string[] {
  const uit: string[] = [];
  for (const w of Array.isArray(lijst) ? lijst : []) {
    const t = String(w ?? "").trim().replace(/\s+/g, " ");
    if (!t || t.length > 40) continue;
    if (uit.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    uit.push(t);
    if (uit.length >= 16) break;
  }
  return uit;
}

async function vraagKleuren(merk: string, model: string, categorie: string): Promise<string[]> {
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
  const prompt = `Welke kleuren bestaan er van dit toestel?

Merk: ${merk}
Model: ${model}
Soort: ${categorie || "Telefoon"}

Geef alle kleuren waarin dit model officieel is verkocht, met de naam die de fabrikant er
in Nederland aan geeft. Apple gebruikt Nederlandse namen, bijvoorbeeld Middernacht,
Sterrenlicht of (PRODUCT)RED. Samsung gebruikt de namen van zijn Nederlandse site,
bijvoorbeeld Onyx Black of Marble Grey. Neem ook kleuren mee die alleen online of bij één
winkel te koop waren.

Verzin niets. Ken je dit model niet zeker, geef dan een lege lijst.`;

  // Opus 5.5 met lage effort: een feitenvraag, geen puzzel. fallbacks "default": weigert
  // het model om een veiligheidsreden, dan beantwoordt een ander model de vraag in
  // dezelfde aanroep, zodat een kleurenlijst niet stilvalt op een onterechte weigering.
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  } as any);

  if (res.stop_reason === "refusal") return [];
  if (res.stop_reason === "max_tokens") throw new Error("Het antwoord werd afgekapt");
  const tekst = (res.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
  return schoon(JSON.parse(tekst || "{}").kleuren);
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
  const categorie = String(lijf?.categorie || "Telefoon").trim().slice(0, 40);
  if (!merk || !model) return fout("Vul eerst merk en model in");

  // 1. Staat het er al? ilike zonder jokertekens = gelijk, ongeacht hoofdletters.
  const { data: bekend } = await admin.from("model_kleuren")
    .select("id, kleuren").ilike("merk", merk).ilike("model", model).limit(1);
  const rij = bekend?.[0];
  if (rij && Array.isArray(rij.kleuren) && rij.kleuren.length) {
    return klaar({ kleuren: rij.kleuren, bron: "lijst" });
  }

  // 2. Anders opzoeken en bewaren.
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return klaar({ kleuren: [], bron: "geen" });
  try {
    const kleuren = await vraagKleuren(merk, model, categorie);
    if (kleuren.length) {
      const nu = new Date().toISOString();
      const { error } = rij
        ? await admin.from("model_kleuren").update({ kleuren, bijgewerkt_op: nu }).eq("id", rij.id)
        : await admin.from("model_kleuren").insert({ merk, model, kleuren, bijgewerkt_op: nu });
      // Tegelijk door een ander opgezocht (uniek slot): dan staat hij er al, prima.
      if (error && !/duplicate|unique/i.test(error.message)) console.error("model-kleuren bewaren", error);
    }
    return klaar({ kleuren, bron: "ai" });
  } catch (e) {
    console.error("model-kleuren", e);
    return fout(e instanceof Error ? e.message : "Het opzoeken mislukte", 502);
  }
});
