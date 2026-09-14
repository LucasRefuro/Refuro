// Leest een geüploade factuur (PDF of foto) uit met AI en geeft de velden terug om een
// inkoop mee in te vullen: bedrag incl. btw, btw%, leverancier, datum, factuurnummer en
// een korte omschrijving. De AI-sleutel staat als geheim ANTHROPIC_API_KEY; de browser
// ziet 'm nooit. Alleen een ingelogde Storvo-gebruiker mag deze functie aanroepen.

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
  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return fout("Niet ingelogd", 401);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return fout("De factuurlezer is nog niet ingesteld (ANTHROPIC_API_KEY ontbreekt).", 503);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const data = String(lijf?.bestand || "");
  if (!data.startsWith("data:")) return fout("Geen bestand meegegeven");

  const media = data.slice(5, data.indexOf(";")) || "application/pdf";
  const b64 = data.slice(data.indexOf(",") + 1);
  const bron = media === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: media, data: b64 } };

  const prompt =
    "Dit is een inkoopfactuur. Geef ALLEEN JSON terug, zonder uitleg, in dit formaat:\n" +
    '{"bedrag": <totaalbedrag inclusief btw als getal>, "btw": <21, 9 of 0>, ' +
    '"leverancier": "<bedrijfsnaam van de afzender>", "datum": "<YYYY-MM-DD>", ' +
    '"factuurnummer": "<factuurnummer>", "omschrijving": "<korte omschrijving, max 6 woorden>"}\n' +
    "Weet je een veld niet zeker, zet dan null. Het bedrag is het te betalen totaal inclusief btw. " +
    "Kies bij btw het hoofdtarief van de factuur (meestal 21).";

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: [bron, { type: "text", text: prompt }] }],
      }),
    });
  } catch (e) {
    return fout("De factuurlezer kon niet worden bereikt: " + String(e).slice(0, 150), 502);
  }
  if (!res.ok) return fout("AI kon de factuur niet lezen: " + (await res.text()).slice(0, 200), 502);

  const uit = await res.json().catch(() => null);
  const tekst = ((uit?.content || []) as any[]).map((c) => c?.text || "").join("").trim();
  const m = tekst.match(/\{[\s\S]*\}/);
  let velden: any = null;
  try { velden = JSON.parse(m ? m[0] : tekst); } catch { return fout("Kon het antwoord van de factuurlezer niet lezen."); }

  // Netjes normaliseren zodat het formulier er direct mee kan vullen.
  const btw = [21, 9, 0].includes(Number(velden?.btw)) ? Number(velden.btw) : 21;
  const schoon = {
    bedrag: velden?.bedrag != null && !isNaN(Number(velden.bedrag)) ? Number(velden.bedrag) : null,
    btw,
    leverancier: velden?.leverancier ? String(velden.leverancier).slice(0, 100) : "",
    datum: /^\d{4}-\d{2}-\d{2}$/.test(String(velden?.datum || "")) ? velden.datum : "",
    factuurnummer: velden?.factuurnummer ? String(velden.factuurnummer).slice(0, 60) : "",
    omschrijving: velden?.omschrijving ? String(velden.omschrijving).slice(0, 80) : "",
  };
  return new Response(JSON.stringify({ ok: true, velden: schoon }), { headers: cors });
});
