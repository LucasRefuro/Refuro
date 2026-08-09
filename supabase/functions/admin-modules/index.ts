// Bijkoopmodules per winkel aan- en uitzetten, vanuit het beheerpaneel.
//
// Een module is iets wat niet iedereen nodig heeft en dus niet in de pakketten
// zit. Wie hem koopt krijgt hem hier aangezet; de app kijkt bij het inloggen
// welke modules er in de lijst staan.

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

// Wat er te koop is. Staat hier en niet in de database, want het is code:
// elke module hoort bij een stuk software dat we hebben gebouwd.
const MODULES = ["refurbish"];

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

  const { data: baas } = await admin.from("platform_admins")
    .select("id").eq("id", wie.user.id).maybeSingle();
  if (!baas) return fout("Geen toegang tot het beheerpaneel", 403);

  if (req.method === "POST") {
    let lijf: any;
    try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
    const id = String(lijf?.team_id || "");
    const module = String(lijf?.module || "");
    const aan = lijf?.aan === true;
    if (!id) return fout("Geen winkel meegegeven");
    if (!MODULES.includes(module)) return fout("Onbekende module");

    const { data: k } = await admin.from("klanten")
      .select("modules").eq("id", id).maybeSingle();
    if (!k) return fout("Winkel niet gevonden", 404);

    const nu: string[] = Array.isArray(k.modules) ? k.modules : [];
    const nieuw = aan ? [...new Set([...nu, module])] : nu.filter((m) => m !== module);

    const { error } = await admin.from("klanten").update({ modules: nieuw }).eq("id", id);
    if (error) {
      console.error("modules bijwerken", error);
      return fout("Kon het niet opslaan", 500);
    }
    return new Response(JSON.stringify({ ok: true, modules: nieuw }), { headers: cors });
  }

  const { data, error } = await admin.from("klanten")
    .select("id, naam, plan, status, modules")
    .order("naam");
  if (error) {
    console.error("modules lezen", error);
    return fout("Kon de winkels niet laden", 500);
  }

  return new Response(JSON.stringify({
    ok: true, beschikbaar: MODULES, winkels: data || [],
  }), { headers: cors });
});
