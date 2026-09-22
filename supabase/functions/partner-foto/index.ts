// Foto's van de telefoon aannemen voor een partner-product, zonder inloggen op die telefoon.
// De partner maakt op de pc een code (30 min geldig, in een QR); de telefoon opent die link
// en stuurt de foto's met de code. Zelfde idee als de refurbish-foto-companion.
// verify_jwt: false — de telefoon heeft geen Supabase-login; de code is het bewijs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const EMMER = "refurbish-fotos";   // hergebruikt de bestaande openbare foto-opslag

function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}
function ok(d: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, ...d }), { headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }

  const code = String(lijf?.code || "").trim().toUpperCase();
  if (!code) return fout("Geen code meegegeven");

  const { data: sleutel } = await admin.from("partner_fotocodes").select("*").eq("code", code).maybeSingle();
  if (!sleutel) return fout("Deze code bestaat niet", 404);
  if (new Date(sleutel.vervalt) < new Date()) {
    return fout("Deze code is verlopen. Maak op de pc een nieuwe aan.", 410);
  }

  // Het model erbij zoeken (uit de partner-blob) zodat de telefoon weet waar hij op mikt.
  let model = "Toestel";
  const { data: partner } = await admin.from("partners").select("data").eq("id", sleutel.partner_id).maybeSingle();
  const producten: any[] = (partner?.data && Array.isArray((partner.data as any).products)) ? (partner.data as any).products : [];
  const prod = producten.find((p) => String(p?.id) === String(sleutel.product_id));
  if (prod?.model) model = String(prod.model);

  if (lijf?.actie === "kijken") {
    return ok({ product: { model } });
  }

  const beeld = String(lijf?.foto || "");
  const m = beeld.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) return fout("Dit is geen bruikbare foto");
  const soort = m[1];
  const bytes = Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0));
  if (bytes.length > 8 * 1024 * 1024) return fout("Deze foto is te groot");

  const ext = soort === "image/png" ? "png" : (soort === "image/webp" ? "webp" : "jpg");
  const pad = `partner/${sleutel.partner_id}/${sleutel.product_id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const { error: opslagfout } = await admin.storage.from(EMMER).upload(pad, bytes, { contentType: soort, upsert: false });
  if (opslagfout) { console.error("partner foto opslaan", opslagfout); return fout("De foto kon niet opgeslagen worden", 500); }

  const { data: openbaar } = admin.storage.from(EMMER).getPublicUrl(pad);
  const url = openbaar?.publicUrl || null;

  const { error } = await admin.from("partner_fotos").insert({
    code, partner_id: sleutel.partner_id, product_id: sleutel.product_id, url,
  });
  if (error) { console.error("partner foto vastleggen", error); return fout("De foto is opgeslagen maar niet vastgelegd", 500); }

  return ok({ url });
});
