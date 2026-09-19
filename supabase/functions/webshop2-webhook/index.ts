// De verkoopmelding van de TWEEDE webshop (groothandel).
//
// Shopify stuurt hierheen zodra er iets besteld/betaald wordt op de tweede shop.
// Verkoopt iemand een bundel-product, dan zetten we die bundel op verkocht en
// halen we alle laptops erin uit de voorraad. Zo hoef je dat niet handmatig te
// doen en verkoop je een laptop nooit twee keer.
//
// Los van de eerste-shop-webhook (shopify-webhook, kanaal 'shopify'): deze werkt
// op kanaal 'shopify2' en op de bundels-tabel. Shopify ondertekent de melding met
// het client secret van de app; daarmee controleren we dat hij echt van Shopify komt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sleutel() {
  const rauw = Deno.env.get("KOPPELING_SLEUTEL");
  if (!rauw) throw new Error("KOPPELING_SLEUTEL ontbreekt");
  const bytes = Uint8Array.from(atob(rauw), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["decrypt"]);
}
async function ontsleutel(pakket: string) {
  const k = await sleutel();
  const bytes = Uint8Array.from(atob(pakket), (c) => c.charCodeAt(0));
  const uit = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, k, bytes.slice(12));
  return new TextDecoder().decode(uit);
}
async function hmacBase64(geheim: string, tekst: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(geheim),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(tekst)));
  return btoa(String.fromCharCode(...sig));
}
// In vaste tijd vergelijken, zodat de snelheid van het antwoord niet verklapt hoeveel klopte.
function gelijk(a: string, b: string) {
  if (a.length !== b.length) return false;
  let v = 0; for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}

// Een bundel en al zijn laptops als verkocht wegzetten.
async function bundelVerkocht(v: any, via: string) {
  const { data: leden } = await admin.from("refurbish_apparaten")
    .select("id, team_id, hardware_id, merk, model, categorie, serienummer, specs, grade, inkoop, code, status")
    .eq("voorraad_batch_id", v.id);
  const aantal = (leden || []).length || 1;
  const perStuk = Math.round(((Number(v.vraagprijs) || 0) / aantal) * 100) / 100;
  const nu = new Date().toISOString();

  for (const a of (leden || [])) {
    if (a.hardware_id) {
      // Klaar-voor-verkoop laptop: de hardware-rij op verkocht.
      await admin.from("hardware").update({
        status: "verkocht", verkocht_op: nu, verkocht_via: via, verkocht_betaal: "webshop",
        verkoop: perStuk, bijgewerkt_op: nu,
      }).eq("id", a.hardware_id);
    } else {
      // Zat nog als 'te controleren' in de bundel: maak nu een hardware-rij, meteen
      // verkocht, en haal het toestel van de werkbank af (status overgedragen, zodat
      // het niet meer in Te controleren of in de voorraad staat).
      const { data: hw } = await admin.from("hardware").insert({
        team_id: a.team_id, merk: a.merk, model: a.model, categorie: a.categorie,
        serienummer: a.serienummer, specs: a.specs || {}, staat: a.grade || "B",
        inkoop: Number(a.inkoop) || 0, verkoop: perStuk, garantie: 12, code: a.code,
        status: "verkocht", verkocht_op: nu, verkocht_via: via, verkocht_betaal: "webshop",
        aangemaakt_op: nu,
      }).select("id").single();
      await admin.from("refurbish_apparaten")
        .update({ hardware_id: hw?.id || null, status: "overgedragen", bijgewerkt_op: nu })
        .eq("id", a.id);
    }
  }
  await admin.from("refurbish_voorraad_batches").update({ status: "verkocht" }).eq("id", v.id);
}

Deno.serve(async (req) => {
  // Altijd 200 teruggeven bij een verwerkt of genegeerd bericht, zodat Shopify niet
  // eindeloos opnieuw stuurt. Alleen bij een ongeldige handtekening weigeren we.
  if (req.method !== "POST") return new Response("ok");
  const url = new URL(req.url);
  const pad = url.pathname.split("/").filter(Boolean).pop() || "";
  const body = await req.text();

  const { data: k } = await admin.from("winkel_koppelingen")
    .select("id, team_id, token_versleuteld").eq("kanaal", "shopify2").eq("webhook_pad", pad).maybeSingle();
  if (!k) return new Response("ok");   // onbekend pad: negeren, niet blijven proberen

  try {
    const secret = await ontsleutel(k.token_versleuteld);
    const gegeven = req.headers.get("X-Shopify-Hmac-Sha256") || "";
    const berekend = await hmacBase64(secret, body);
    if (!gegeven || !gelijk(berekend, gegeven)) return new Response("ongeldig", { status: 401 });
  } catch (e) {
    console.error("webshop2-webhook hmac", e);
    return new Response("ok");
  }

  const topic = req.headers.get("X-Shopify-Topic") || "";
  if (!/orders\/(create|paid)/i.test(topic)) return new Response("ok");

  let order: any = {};
  try { order = JSON.parse(body); } catch { return new Response("ok"); }

  const nummers = new Set<string>();
  for (const li of (order.line_items || [])) {
    if (li && li.product_id != null) nummers.add(String(li.product_id));
  }
  if (!nummers.size) return new Response("ok");

  const { data: bundels } = await admin.from("refurbish_voorraad_batches")
    .select("*").eq("team_id", k.team_id).neq("status", "verkocht");
  for (const v of (bundels || [])) {
    const nummer = v.shopify && v.shopify.nummer != null ? String(v.shopify.nummer) : null;
    if (nummer && nummers.has(nummer)) {
      try { await bundelVerkocht(v, "webshop2"); } catch (e) { console.error("bundelVerkocht", v.id, e); }
    }
  }
  return new Response("ok");
});
