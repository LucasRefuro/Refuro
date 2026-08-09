// Zoekt de vier hoeken van het beeldscherm in een foto van een open laptop.
//
// Waarom dit met AI en niet met een vaste berekening: een laptop staat nooit
// twee keer hetzelfde op tafel, het scherm spiegelt, en de rand loopt soms weg
// tegen het tafelblad. Een model dat het beeld begrijpt komt daar veel verder
// mee dan een randdetector.
//
// Waarom het daarna nog bijgesteld moet kunnen worden: precies om dezelfde
// reden. Het antwoord is meestal goed en soms een centimeter naast. Vier punten
// verslepen kost drie seconden; een scheve foto op je webshop kost een klant.

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

// Een punt in procenten van de breedte en hoogte, zodat het niets uitmaakt op
// welke grootte de browser de foto laat zien.
function punt(p: any) {
  const x = Number(p?.x), y = Number(p?.y);
  if (!isFinite(x) || !isFinite(y)) return null;
  return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const sleutel = Deno.env.get("ANTHROPIC_API_KEY");
  if (!sleutel) return fout("Dit is nog niet ingesteld", 503);

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

  const beeld = String(lijf?.foto || "");
  const m = beeld.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) return fout("Dit is geen bruikbare foto");
  if (m[3].length > 6_000_000) return fout("Deze foto is te groot");

  const prompt = `Op deze foto staat een laptop met het scherm open.

Geef de vier hoeken van het zichtbare beeldscherm: het glas, dus de rand van
het beeld zelf, niet de buitenrand van het deksel.

Gebruik procenten van de breedte en de hoogte van de foto, waarbij 0,0 linksboven
is en 100,100 rechtsonder. Geef ze in deze volgorde: linksboven, rechtsboven,
rechtsonder, linksonder.

Staat er geen laptop met een open scherm op, geef dan gevonden op false.

Antwoord uitsluitend met JSON:
{"gevonden": true, "hoeken": [{"x":18,"y":12},{"x":82,"y":12},{"x":86,"y":66},{"x":14,"y":66}], "zeker": "hoog of midden of laag"}`;

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
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: m[1], data: m[3] } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });
    const uit = await res.json();
    if (!res.ok) throw new Error(uit?.error?.message || "Het kijken mislukte");

    const tekst = (uit?.content || []).map((c: any) => c.text || "").join("").trim();
    const j = JSON.parse((tekst.match(/\{[\s\S]*\}/) || ["{}"])[0]);

    const hoeken = Array.isArray(j.hoeken) ? j.hoeken.map(punt).filter(Boolean) : [];
    if (!j.gevonden || hoeken.length !== 4) {
      return new Response(JSON.stringify({
        ok: true, gevonden: false,
        melding: "Ik zie hier geen open scherm. Zet de punten zelf op de hoeken.",
      }), { headers: cors });
    }

    return new Response(JSON.stringify({
      ok: true, gevonden: true, hoeken,
      zeker: ["hoog", "midden", "laag"].includes(j.zeker) ? j.zeker : "midden",
    }), { headers: cors });
  } catch (e) {
    console.error("scherm-hoeken", e);
    return fout(e instanceof Error ? e.message : "Het kijken mislukte", 502);
  }
});
