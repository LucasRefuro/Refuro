// Stelt een concept-antwoord voor op een e-mail. De winkelier past het aan en verstuurt het
// zelf (via mail-verstuur); dit schrijft alleen een voorstel, verstuurt niets. Alleen door een
// ingelogde gebruiker.
//
// Body: { onderwerp, van, tekst, instructie? }  (instructie = optionele hint van de gebruiker)
// Antwoord: { ok, concept }
//
// Geheimen: ANTHROPIC_API_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);
  const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: bevoegd } } });
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return fout("Niet ingelogd", 401);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return fout("De AI is nog niet ingesteld (ANTHROPIC_API_KEY ontbreekt).", 503);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const onderwerp = String(lijf?.onderwerp || "").slice(0, 300);
  const van = String(lijf?.van || "").slice(0, 200);
  const tekst = String(lijf?.tekst || "").slice(0, 6000);
  const instructie = String(lijf?.instructie || "").slice(0, 500);

  const prompt =
    "Je bent de eigenaar van een telefoon- en laptopreparatiewinkel en schrijft een kort, " +
    "vriendelijk en professioneel antwoord in het Nederlands op de onderstaande e-mail. " +
    "Korte zinnen, geen jargon. Sluit af met een nette groet zonder een verzonnen naam " +
    "(gebruik 'Met vriendelijke groet,'). Geef ALLEEN de tekst van het antwoord terug, " +
    "zonder onderwerp en zonder uitleg.\n\n" +
    (instructie ? ("Wat de winkelier ongeveer wil zeggen: " + instructie + "\n\n") : "") +
    "Van: " + van + "\nOnderwerp: " + onderwerp + "\n\nBericht:\n" + tekst;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 700, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] }),
    });
  } catch (e) {
    return fout("De AI kon niet worden bereikt: " + String(e).slice(0, 150), 502);
  }
  if (!res.ok) return fout("De AI kon geen antwoord maken: " + (await res.text()).slice(0, 150), 502);
  const uit = await res.json().catch(() => null);
  const concept = ((uit?.content || []) as any[]).map((c) => c?.text || "").join("").trim();
  return new Response(JSON.stringify({ ok: true, concept }), { headers: cors });
});
