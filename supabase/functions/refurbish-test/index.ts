// Functionele testuitslag van de telefoon aannemen zonder inloggen op dat toestel.
//
// Zelfde idee als refurbish-foto: op de pc maak je in de controle een code aan die
// een half uur geldig is en in een QR staat. De telefoon-in-de-hand opent die link,
// loopt de tests langs (touch, scherm, luidspreker, microfoon, camera, trillen,
// sensoren) en stuurt de uitslag hierheen met de code erbij. Deze functie zet de
// uitslag op de juiste testcode-rij. De code is het enige wat de telefoon heeft en
// vervalt vanzelf.

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

// De testsleutels die de telefoon mag terugsturen. Onbekende sleutels negeren we.
const TESTEN = [
  "touch", "scherm", "luidspreker", "oorspeaker", "microfoon",
  "camera_achter", "camera_voor", "trilfunctie", "sensoren",
];

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

  const { data: sleutel } = await admin.from("refurbish_testcodes")
    .select("*").eq("code", code).maybeSingle();
  if (!sleutel) return fout("Deze code bestaat niet", 404);
  if (new Date(sleutel.vervalt) < new Date()) {
    return fout("Deze code is verlopen. Maak op de pc een nieuwe aan.", 410);
  }

  const { data: a } = await admin.from("refurbish_apparaten")
    .select("id, merk, model, categorie, code").eq("id", sleutel.apparaat_id).maybeSingle();
  if (!a) return fout("Het apparaat is niet gevonden", 404);

  // Alleen kijken welk apparaat het is: de telefoon moet weten waar hij op mikt.
  if (lijf?.actie === "kijken") {
    return new Response(JSON.stringify({
      ok: true,
      apparaat: { merk: a.merk, model: a.model, categorie: a.categorie, code: a.code },
    }), { headers: cors });
  }

  // De uitslag: een object met testsleutel -> 'ok' | 'fout'. Alleen bekende
  // sleutels en geldige waarden bewaren we, zodat er niets vreemds op de rij komt.
  const binnen = (lijf?.resultaat && typeof lijf.resultaat === "object") ? lijf.resultaat : null;
  if (!binnen) return fout("Geen uitslag meegegeven");
  const schoon: Record<string, string> = {};
  for (const k of TESTEN) {
    const w = binnen[k];
    if (w === "ok" || w === "fout") schoon[k] = w;
  }
  if (!Object.keys(schoon).length) return fout("Geen bruikbare uitslag");

  const { error } = await admin.from("refurbish_testcodes")
    .update({ resultaat: schoon }).eq("code", code);
  if (error) {
    console.error("testuitslag vastleggen", error);
    return fout("De uitslag kon niet vastgelegd worden", 500);
  }

  return new Response(JSON.stringify({ ok: true }), { headers: cors });
});
