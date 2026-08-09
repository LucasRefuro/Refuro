// Foto's van de telefoon aannemen zonder dat er op die telefoon iemand hoeft in
// te loggen.
//
// Hoe het werkt: op de pc maak je een code aan die een half uur geldig is en in
// een QR staat. De telefoon opent die link, stuurt de foto hierheen met de code
// erbij, en deze functie zet hem in de opslag van de juiste winkel. De code is
// het enige wat de telefoon heeft, en die vervalt vanzelf.

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

const EMMER = "refurbish-fotos";
const AANZICHTEN = ["dicht", "open", "toetsenbord", "links", "rechts", "onderkant", "scherm", "overig"];

function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }

  const code = String(lijf?.code || "").trim().toUpperCase();
  if (!code) return fout("Geen code meegegeven");

  const { data: sleutel } = await admin.from("refurbish_fotocodes")
    .select("*").eq("code", code).maybeSingle();
  if (!sleutel) return fout("Deze code bestaat niet", 404);
  if (new Date(sleutel.vervalt) < new Date()) {
    return fout("Deze code is verlopen. Maak op de pc een nieuwe aan.", 410);
  }

  const { data: a } = await admin.from("refurbish_apparaten")
    .select("id, merk, model, code").eq("id", sleutel.apparaat_id).maybeSingle();
  if (!a) return fout("Het apparaat is niet gevonden", 404);

  // Alleen kijken welk apparaat het is: de telefoon moet weten waar hij op mikt.
  if (lijf?.actie === "kijken") {
    return new Response(JSON.stringify({
      ok: true, apparaat: { merk: a.merk, model: a.model, code: a.code },
      aanzichten: AANZICHTEN,
    }), { headers: cors });
  }

  const aanzicht = AANZICHTEN.includes(String(lijf?.aanzicht)) ? String(lijf.aanzicht) : "overig";
  const beeld = String(lijf?.foto || "");
  const m = beeld.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) return fout("Dit is geen bruikbare foto");

  const soort = m[1];
  const bytes = Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0));
  if (bytes.length > 8 * 1024 * 1024) return fout("Deze foto is te groot");

  const ext = soort === "image/png" ? "png" : (soort === "image/webp" ? "webp" : "jpg");
  const pad = `${sleutel.team_id}/${a.id}/${aanzicht}-${Date.now()}.${ext}`;

  const { error: opslagfout } = await admin.storage.from(EMMER)
    .upload(pad, bytes, { contentType: soort, upsert: false });
  if (opslagfout) {
    console.error("foto opslaan", opslagfout);
    return fout("De foto kon niet opgeslagen worden", 500);
  }

  const { error } = await admin.from("refurbish_fotos").insert({
    team_id: sleutel.team_id,
    apparaat_id: a.id,
    merk: a.merk, model: a.model,
    aanzicht, pad,
    volgorde: AANZICHTEN.indexOf(aanzicht),
  });
  if (error) {
    console.error("foto vastleggen", error);
    return fout("De foto is opgeslagen maar niet vastgelegd", 500);
  }

  const { data: openbaar } = admin.storage.from(EMMER).getPublicUrl(pad);

  return new Response(JSON.stringify({
    ok: true, pad, url: openbaar?.publicUrl || null, aanzicht,
  }), { headers: cors });
});
