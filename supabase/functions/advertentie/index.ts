// Schrijft de advertentie voor een apparaat, volgens het sjabloon van de winkel.
//
// Waarom een sjabloon en niet gewoon "schrijf iets": zonder vaste opbouw komt
// er elke keer een andere tekst uit en ziet je webshop er rommelig uit. Met een
// sjabloon staat de volgorde vast en vult de AI alleen de gaten. Dat leest
// beter, en je klant herkent na drie advertenties jouw manier van doen.

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

// Het sjabloon dat een winkel krijgt als hij er zelf geen heeft ingesteld.
// De haakjes worden door de AI ingevuld; de rest blijft letterlijk staan.
const STANDAARD_SJABLOON = `{merk} {model} — {kernpunt}

{intro van twee zinnen: wat is dit voor apparaat en voor wie is het geschikt}

Specificaties
{specificaties als lijstje met streepjes}

Staat
{eerlijke beschrijving van de staat, hoort bij grade {grade}}

Wat je krijgt
- Getest en schoon geïnstalleerd met Windows
- {garantie} maanden garantie
- Oplader inbegrepen

{afsluiter van één zin, zonder uitroeptekens}`;

const STAAT: Record<string, string> = {
  A: "als nieuw, nauwelijks gebruikssporen",
  B: "gebruikt maar in nette staat",
  C: "zichtbare gebruikssporen, werkt naar behoren",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const sleutel = Deno.env.get("ANTHROPIC_API_KEY");
  if (!sleutel) return fout("Het schrijven is nog niet ingesteld", 503);

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

  const { data: a } = await admin.from("refurbish_apparaten")
    .select("*").eq("id", String(lijf?.apparaat_id || ""))
    .eq("team_id", acc.team_id).maybeSingle();
  if (!a) return fout("Dit apparaat is niet gevonden", 404);

  const { data: inst } = await admin.from("refurbish_instellingen")
    .select("ad_sjabloon, ad_toon").eq("team_id", acc.team_id).maybeSingle();

  const sjabloon = (inst?.ad_sjabloon || "").trim() || STANDAARD_SJABLOON;
  const toon = (inst?.ad_toon || "zakelijk en eerlijk").trim();

  const specs = a.specs && typeof a.specs === "object" ? a.specs : {};
  const specregels = Object.entries(specs)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `- ${k}: ${v}`).join("\n");

  const kanaal = String(lijf?.kanaal || "webshop");
  const kanaalUitleg = kanaal === "marktplaats"
    ? `Dit is voor Marktplaats. Hou het wat losser en korter dan voor een webshop,
       en schrijf de titel zoals mensen zoeken: merk, model, en de belangrijkste
       specificaties. Geen opsommingen met opmaak, gewoon regels tekst.`
    : `Dit is voor de webshop. Netjes opgebouwd, met de specificaties als lijstje.`;

  const prompt = `Schrijf een advertentie voor een tweedehands apparaat.

Merk: ${a.merk || "onbekend"}
Model: ${a.model}
Categorie: ${a.categorie || "Laptop"}
Grade: ${a.grade || "B"} (${STAAT[a.grade] || "gebruikt"})
${a.accu ? `Accucapaciteit: ${a.accu}% van nieuw` : ""}
${a.notitie ? `Bijzonderheid: ${a.notitie}` : ""}
${specregels ? "Specificaties:\n" + specregels : "Geen specificaties bekend."}

Hou je exact aan dit sjabloon. Alles tussen accolades vervang je; de rest laat
je letterlijk staan, inclusief de koppen en de volgorde.

--- sjabloon ---
${sjabloon}
--- einde sjabloon ---

${kanaalUitleg}

Toon: ${toon}. Schrijf in het Nederlands, voor een particuliere koper. Geen
superlatieven, geen uitroeptekens, geen verkooppraat. Wees eerlijk over de
staat: wat je verzwijgt komt terug als retour.

Antwoord uitsluitend met JSON:
{"titel":"...","tekst":"...","zoekwoorden":["...","..."]}

De titel is maximaal 70 tekens en bevat merk, model en de belangrijkste
specificaties.`;

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
    if (!res.ok) throw new Error(uit?.error?.message || "Het schrijven mislukte");

    const tekst = (uit?.content || []).map((c: any) => c.text || "").join("").trim();
    const m = tekst.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Er kwam geen bruikbare tekst terug");
    const j = JSON.parse(m[0]);

    return new Response(JSON.stringify({
      ok: true,
      kanaal,
      titel: String(j.titel || "").slice(0, 140),
      tekst: String(j.tekst || "").slice(0, 6000),
      zoekwoorden: (Array.isArray(j.zoekwoorden) ? j.zoekwoorden : [])
        .map((z: any) => String(z).slice(0, 40)).slice(0, 12),
    }), { headers: cors });
  } catch (e) {
    console.error("advertentie", e);
    return fout(e instanceof Error ? e.message : "Het schrijven mislukte", 502);
  }
});
