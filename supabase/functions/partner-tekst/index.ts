// Schrijft een advertentietekst voor de partner-app uit een kant-en-klare prompt.
//
// De bestaande advertentie-functie is vastgekoppeld aan refurbish_apparaten en dus
// niet bruikbaar voor de partner, die zijn eigen producten heeft. Deze functie is
// bewust generiek: de partner-app bouwt de prompt op (met het eigen sjabloon en de
// productgegevens) en krijgt hier alleen de tekst terug. Alleen voor partners.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const authH = req.headers.get("Authorization") || "";
  if (!authH) return fout("Niet ingelogd", 401);
  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authH } } },
  );
  const { data: { user } } = await klant.auth.getUser();
  if (!user) return fout("Niet ingelogd", 401);
  const { data: acc } = await admin.from("accounts").select("rol").eq("id", user.id).maybeSingle();
  if (!acc || acc.rol !== "partner") return fout("Alleen voor partners", 403);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const prompt = String(lijf?.prompt || "").slice(0, 4000);
  if (!prompt) return fout("Geen prompt meegegeven");

  const sleutel = Deno.env.get("ANTHROPIC_API_KEY");
  if (!sleutel) return fout("De AI is niet ingesteld", 503);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": sleutel, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001",
        max_tokens: 900,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const uit = await res.json();
    if (!res.ok) throw new Error(uit?.error?.message || "Het schrijven mislukte");
    const tekst = (uit?.content || []).map((c: any) => c.text || "").join("").trim();
    if (!tekst) throw new Error("Er kwam geen tekst terug");
    return new Response(JSON.stringify({ ok: true, tekst }), { headers: cors });
  } catch (e) {
    return fout("De AI-aanroep mislukte: " + (e as Error).message, 502);
  }
});
