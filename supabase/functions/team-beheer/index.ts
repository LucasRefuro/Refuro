// Gebruikersbeheer vanuit het eigenaar-account: teamleden aanmaken met e-mail en
// wachtwoord, hun rol en paginarechten bijwerken, een wachtwoord instellen, en een
// account verwijderen. Vervangt het losse pincode-systeem.
//
// Alleen een eigenaar of beheerder mag dit, en alleen binnen zijn eigen winkel.
// De eigenaar zelf en het aanmaken van een tweede eigenaar of een partner lopen niet
// via deze functie.

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
async function wieBelt(req: Request) {
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return null;
  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return null;
  const { data: acc } = await admin.from("accounts").select("id, team_id, rol").eq("id", wie.user.id).maybeSingle();
  return acc as { id: string; team_id: string; rol: string } | null;
}
const ROLLEN = ["medewerker", "beheerder"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const acc = await wieBelt(req);
  if (!acc) return fout("Niet ingelogd", 401);
  if (!["eigenaar", "beheerder"].includes(acc.rol)) return fout("Alleen de winkel mag dit", 403);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const actie = String(lijf?.actie || "");

  // Het doel-account ophalen en checken dat het in dezelfde winkel zit.
  async function doelInTeam(id: string) {
    const { data } = await admin.from("accounts").select("id, team_id, rol").eq("id", id).maybeSingle();
    if (!data || data.team_id !== acc.team_id) return null;
    return data as { id: string; team_id: string; rol: string };
  }
  const schoneTabs = (t: any) => Array.isArray(t) ? t.filter((x) => typeof x === "string") : null;

  if (actie === "aanmaken") {
    const naam = String(lijf.naam || "").trim();
    const email = String(lijf.email || "").trim().toLowerCase();
    const gebruikersnaam = String(lijf.gebruikersnaam || "").trim().toLowerCase() || email;
    const ww = String(lijf.wachtwoord || "");
    const rol = ROLLEN.includes(lijf.rol) ? lijf.rol : "medewerker";
    const tabs = schoneTabs(lijf.tabs);
    if (!naam) return fout("Vul een naam in");
    if (!email.includes("@")) return fout("Vul een geldig e-mailadres in");
    if (ww.length < 8) return fout("Kies een wachtwoord van minstens 8 tekens");

    const { data: gemaakt, error: uErr } = await admin.auth.admin.createUser({ email, password: ww, email_confirm: true });
    if (uErr || !gemaakt?.user) {
      return fout("Aanmaken mislukt: " + (uErr?.message || "onbekend") +
        (uErr?.message?.includes("already") ? " (dit e-mailadres bestaat al)" : ""), 400);
    }
    const { error: aErr } = await admin.from("accounts").upsert({
      id: gemaakt.user.id, naam, gebruikersnaam, email, rol, team_id: acc.team_id,
      tabs, onboarding_klaar: true,
    });
    if (aErr) return fout("Account opslaan mislukt: " + aErr.message, 500);
    return new Response(JSON.stringify({ ok: true, email }), { headers: cors });
  }

  if (actie === "bijwerken") {
    const id = String(lijf.account_id || "");
    const doel = await doelInTeam(id);
    if (!doel) return fout("Dit account is niet gevonden", 404);
    if (doel.rol === "eigenaar") return fout("De eigenaar kun je hier niet wijzigen");
    const wijz: Record<string, unknown> = {};
    if (ROLLEN.includes(lijf.rol)) wijz.rol = lijf.rol;
    if ("tabs" in lijf) wijz.tabs = schoneTabs(lijf.tabs);
    if (!Object.keys(wijz).length) return fout("Niets om bij te werken");
    const { error } = await admin.from("accounts").update(wijz).eq("id", id);
    if (error) return fout("Bijwerken mislukt: " + error.message, 500);
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  if (actie === "wachtwoord") {
    const id = String(lijf.account_id || "");
    const ww = String(lijf.nieuw_wachtwoord || "");
    if (ww.length < 8) return fout("Wachtwoord moet minstens 8 tekens zijn");
    const doel = await doelInTeam(id);
    if (!doel) return fout("Dit account is niet gevonden", 404);
    if (doel.rol === "eigenaar" && doel.id !== acc.id) return fout("Alleen de eigenaar zelf mag zijn eigen wachtwoord wijzigen");
    const { error } = await admin.auth.admin.updateUserById(id, { password: ww });
    if (error) return fout("Wachtwoord wijzigen mislukt: " + error.message, 500);
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  if (actie === "verwijderen") {
    const id = String(lijf.account_id || "");
    if (id === acc.id) return fout("Je kunt je eigen account niet verwijderen");
    const doel = await doelInTeam(id);
    if (!doel) return fout("Dit account is niet gevonden", 404);
    if (doel.rol === "eigenaar") return fout("De eigenaar kun je niet verwijderen");
    await admin.from("accounts").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  return fout("Onbekende actie");
});
