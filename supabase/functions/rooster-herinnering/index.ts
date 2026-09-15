// Fase 4 van het rooster: herinnert personeel per e-mail om hun beschikbaarheid voor de
// KOMENDE week (maandag t/m zondag) in te vullen, X dagen van tevoren (instelbaar per team in
// tabel rooster_instelling). Alleen teamleden die nog niets doorgaven krijgen een mail.
// Verstuurt niets tot de eigenaar het aanzet (rooster_instelling.aan). Verstuurt via Zoho SMTP
// vanaf info@refuro.nl; geen nieuwe geheimen nodig.
//
// Aanroepen: cron (X-Cron-Secret == MAIL_CRON_SECRET) verwerkt alle teams met aan=true; een
// ingelogde gebruiker verwerkt alleen zijn eigen team.
//
// Geheimen: MAIL_INKOOP_USER, MAIL_INKOOP_PASS, MAIL_SMTP_HOST (val: smtppro.zoho.eu),
//           MAIL_CRON_SECRET.

import nodemailer from "npm:nodemailer@6.9.14";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

// Verwerk één team: bepaal de komende week, wie nog niets doorgaf, en mail die (indien in het
// venster en nog niet verstuurd voor deze week). Geeft het aantal verstuurde mails terug.
async function verwerkTeam(inst: any, transporter: any, vanAdres: string): Promise<number> {
  const team = inst.team_id;
  const dagen = Math.max(0, Math.min(60, Number(inst.herinner_dagen) || 3));

  const now = new Date();
  const dow = now.getUTCDay(); // 0=zo..6=za
  const totMaandag = ((8 - dow) % 7) || 7; // 1..7 dagen tot de volgende maandag
  if (totMaandag > dagen) return 0; // nog niet binnen het herinner-venster

  const maandag = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + totMaandag));
  const zondag = new Date(maandag.getTime() + 6 * 864e5);
  const maandagYmd = ymd(maandag);
  if (inst.laatst_verstuurd_voor === maandagYmd) return 0; // al gedaan voor deze week

  // Teamleden die een rooster invullen (niet de eigenaar), actief en met e-mail.
  const { data: leden } = await admin.from("accounts").select("id,naam,email,rol,actief")
    .eq("team_id", team).eq("actief", true).not("email", "is", null);
  const werkers = (leden || []).filter((l: any) => String(l.rol || "").toLowerCase() !== "eigenaar" && l.email);
  if (!werkers.length) {
    await admin.from("rooster_instelling").update({ laatst_verstuurd_voor: maandagYmd, bijgewerkt_op: new Date().toISOString() }).eq("team_id", team);
    return 0;
  }

  // Wie gaf al iets door voor die week (beschikbaar=true of expliciet niet)?
  const ids = werkers.map((w: any) => w.id);
  const { data: besch } = await admin.from("beschikbaarheid").select("account_id")
    .in("account_id", ids).gte("datum", maandagYmd).lte("datum", ymd(zondag));
  const heeftIngevuld = new Set((besch || []).map((b: any) => b.account_id));
  const teHerinneren = werkers.filter((w: any) => !heeftIngevuld.has(w.id));

  const { data: klant } = await admin.from("klanten").select("naam").eq("id", team).maybeSingle();
  const shop = klant?.naam || "je winkel";

  let verstuurd = 0;
  for (const w of teHerinneren) {
    const tekst =
      `Hoi ${w.naam || ""},\n\n` +
      `Vergeet niet je beschikbaarheid voor volgende week (maandag ${maandagYmd} t/m zondag ${ymd(zondag)}) in te vullen in Storvo, ` +
      `zodat het rooster op tijd rond is.\n\n` +
      `Invullen: https://storvo.app/app  (ga naar Rooster)\n\n` +
      `Groet,\n${shop}`;
    try {
      await transporter.sendMail({
        from: vanAdres, to: w.email,
        subject: "Vul je beschikbaarheid in voor volgende week",
        text: tekst,
      });
      verstuurd++;
    } catch (_e) { /* deze overslaan, de rest gaat door */ }
  }
  await admin.from("rooster_instelling").update({ laatst_verstuurd_voor: maandagYmd, bijgewerkt_op: new Date().toISOString() }).eq("team_id", team);
  return verstuurd;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const user = Deno.env.get("MAIL_INKOOP_USER");
  const pass = Deno.env.get("MAIL_INKOOP_PASS");
  const smtpHost = Deno.env.get("MAIL_SMTP_HOST") || "smtppro.zoho.eu";
  if (!user || !pass) return fout("De mailkoppeling is nog niet ingesteld.", 503);

  // Toegang: cron-geheim (alle teams) of ingelogde gebruiker (eigen team).
  const cronSecret = Deno.env.get("MAIL_CRON_SECRET");
  const isCron = !!cronSecret && (req.headers.get("x-cron-secret") || "") === cronSecret;
  let teams: any[] = [];
  if (isCron) {
    const { data } = await admin.from("rooster_instelling").select("*").eq("aan", true);
    teams = data || [];
  } else {
    const bevoegd = req.headers.get("Authorization") || "";
    if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);
    const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: bevoegd } } });
    const { data: wie } = await klant.auth.getUser();
    if (!wie?.user) return fout("Niet ingelogd", 401);
    const { data: acc } = await admin.from("accounts").select("team_id,rol").eq("id", wie.user.id).maybeSingle();
    if (!acc?.team_id) return fout("Geen team gevonden", 400);
    const { data } = await admin.from("rooster_instelling").select("*").eq("team_id", acc.team_id).eq("aan", true);
    teams = data || [];
  }
  if (!teams.length) return new Response(JSON.stringify({ ok: true, verstuurd: 0, teams: 0 }), { headers: cors });

  const transporter = nodemailer.createTransport({ host: smtpHost, port: 465, secure: true, auth: { user, pass } });
  let totaal = 0;
  for (const inst of teams) {
    try { totaal += await verwerkTeam(inst, transporter, user); } catch (_e) { /* team overslaan */ }
  }
  return new Response(JSON.stringify({ ok: true, verstuurd: totaal, teams: teams.length }), { headers: cors });
});
