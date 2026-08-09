// Schrijft een verkooptitel en een omschrijving voor een tweedehands toestel.
//
// Dit is precies het werk waar niemand zin in heeft en waar iedereen dus te
// weinig tijd in steekt: een advertentie waar de koper wat aan heeft. De
// specificaties staan al in het systeem, dus laat de tekst daaruit rollen.

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

const STAAT: Record<string, string> = {
  A: "als nieuw, nauwelijks gebruikssporen",
  B: "gebruikt maar in goede staat",
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

  const { data: h } = await admin.from("hardware")
    .select("*").eq("id", String(lijf?.hardware_id || ""))
    .eq("team_id", acc.team_id).maybeSingle();
  if (!h) return fout("Dit toestel is niet gevonden", 404);

  const specs = h.specs && typeof h.specs === "object" ? h.specs : {};
  const specregels = Object.entries(specs)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `- ${k}: ${v}`).join("\n");

  const prompt = `Schrijf een advertentie voor een tweedehands apparaat.

Merk: ${h.merk || "onbekend"}
Model: ${h.model}
Categorie: ${h.categorie || "Laptop"}
Staat: ${STAAT[h.staat] || h.staat || "gebruikt"}
Garantie: ${h.garantie || 0} maanden
${specregels ? "Specificaties:\n" + specregels : "Geen specificaties bekend."}

Schrijf in het Nederlands, voor een particuliere koper. Eerlijk en concreet,
geen superlatieven, geen uitroeptekens, geen verkooppraat. Noem wat het apparaat
in de praktijk aankan. Wees eerlijk over de staat. Vier tot zes zinnen.

Antwoord uitsluitend met JSON in deze vorm:
{"titel": "...", "omschrijving": "..."}

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
        max_tokens: 900,
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
      titel: String(j.titel || "").slice(0, 120),
      omschrijving: String(j.omschrijving || "").slice(0, 3000),
    }), { headers: cors });
  } catch (e) {
    console.error("hardware-tekst", e);
    return fout(e instanceof Error ? e.message : "Het schrijven mislukte", 502);
  }
});
