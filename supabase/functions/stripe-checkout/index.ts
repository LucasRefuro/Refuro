// Zet een winkel van proefperiode naar abonnement.
//
// Maakt een Stripe Checkout Session en stuurt de winkel daarheen. Er zijn twee
// smaken: gewoon, en met de kortingsbon voor wie op het laatste moment twijfelt.
//
// De prijs en de bon staan als instelling in Supabase, niet in de code. Zo kun
// je een actie starten of stoppen zonder iets opnieuw uit te rollen.
//
// Wat er daarna gebeurt regelt de webhook: die zet de status op actief zodra
// Stripe zegt dat er betaald is. Deze functie doet niets aan de administratie.

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

// Stripe praat met gewone formuliervelden, geen JSON.
async function stripe(pad: string, velden: Record<string, string>) {
  const sleutel = Deno.env.get("STRIPE_SECRET_KEY")!;
  const res = await fetch("https://api.stripe.com/v1/" + pad, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + sleutel,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(velden),
  });
  const uit = await res.json();
  if (!res.ok) throw new Error(uit?.error?.message || "Stripe gaf een fout");
  return uit;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  if (!Deno.env.get("STRIPE_SECRET_KEY")) return fout("Stripe is nog niet ingesteld", 503);
  const prijsId = Deno.env.get("STRIPE_PRIJS_ID");
  if (!prijsId) return fout("Er is nog geen abonnementsprijs ingesteld", 503);

  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);

  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return fout("Niet ingelogd", 401);

  let lijf: any = {};
  try { lijf = await req.json(); } catch { /* mag leeg zijn */ }
  const metKorting = lijf?.korting === true;

  // Alleen de eigenaar mag een abonnement afsluiten.
  const { data: acc } = await admin.from("accounts")
    .select("team_id, rol, email, naam").eq("id", wie.user.id).maybeSingle();
  if (!acc) return fout("Je account is niet gevonden", 403);
  if (acc.rol !== "eigenaar") return fout("Alleen de eigenaar kan het abonnement regelen", 403);

  const { data: winkel } = await admin.from("klanten")
    .select("id, naam, email, stripe_customer_id, status").eq("id", acc.team_id).maybeSingle();
  if (!winkel) return fout("Je winkel is niet gevonden", 404);
  if (winkel.status === "actief") return fout("Je hebt al een lopend abonnement", 409);

  try {
    // Eén Stripe-klant per winkel, zodat facturen bij elkaar blijven.
    let klantId = winkel.stripe_customer_id;
    if (!klantId) {
      const gemaakt = await stripe("customers", {
        email: winkel.email || acc.email || "",
        name: winkel.naam || "",
        "metadata[team_id]": winkel.id,
      });
      klantId = gemaakt.id;
      await admin.from("klanten").update({ stripe_customer_id: klantId }).eq("id", winkel.id);
    }

    const basis = Deno.env.get("APP_URL") || "https://storvo.app";
    const velden: Record<string, string> = {
      mode: "subscription",
      customer: klantId!,
      "line_items[0][price]": prijsId,
      "line_items[0][quantity]": "1",
      success_url: basis + "/app/?abo=gelukt",
      cancel_url: basis + "/app/?abo=gestopt",
      locale: "nl",
      allow_promotion_codes: metKorting ? "false" : "true",
      "subscription_data[metadata][team_id]": winkel.id,
      "metadata[team_id]": winkel.id,
    };

    // De kortingsbon zit er alleen in als de winkel er recht op heeft. Staat
    // hij niet ingesteld, dan gaat het gewoon zonder korting door; beter dan
    // een foutmelding op het moment dat iemand net wil betalen.
    const bon = Deno.env.get("STRIPE_KORTING_COUPON");
    if (metKorting && bon) velden["discounts[0][coupon]"] = bon;

    const sessie = await stripe("checkout/sessions", velden);
    return new Response(JSON.stringify({ ok: true, url: sessie.url }), { headers: cors });
  } catch (e) {
    console.error("checkout mislukt", e);
    return fout(e instanceof Error ? e.message : "Het afrekenen kon niet gestart worden", 502);
  }
});
