// Leest de feedback van winkels uit, voor het beheerpaneel van Storvo zelf.
//
// De tabel is met opzet dichtgetimmerd: winkels mogen erin schrijven en er
// verder niets uit lezen, ook niet hun eigen regels. Alleen deze functie kijkt
// mee, en die controleert eerst of de beller in platform_admins staat.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);

  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return fout("Niet ingelogd", 401);

  // Alleen medewerkers van Storvo zelf.
  const { data: baas } = await admin.from("platform_admins")
    .select("id").eq("id", wie.user.id).maybeSingle();
  if (!baas) return fout("Geen toegang tot het beheerpaneel", 403);

  const { data, error } = await admin.from("feedback")
    .select("id, soort, sterren, reden, tekst, mag_contact, plan, winkel, aangemaakt_op, team_id")
    .order("aangemaakt_op", { ascending: false })
    .limit(300);
  if (error) {
    console.error("feedback lezen", error);
    return fout("Kon de feedback niet laden", 500);
  }

  // Een gemiddelde is aardig, maar alleen als er genoeg beoordelingen zijn om
  // iets te betekenen. Onder de vijf zegt het niets en laten we het weg.
  const reviews = (data || []).filter((r) => r.soort === "review" && r.sterren);
  const gemiddeld = reviews.length >= 5
    ? Math.round(reviews.reduce((n, r) => n + (r.sterren || 0), 0) / reviews.length * 10) / 10
    : null;

  return new Response(JSON.stringify({
    ok: true,
    rijen: data || [],
    aantal: (data || []).length,
    reviews: reviews.length,
    gemiddeld,
  }), { headers: cors });
});
