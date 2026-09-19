// Rooster-herinneringen. Personeel geeft twee weken vooruit hun beschikbaarheid door;
// deze functie mailt wie dat nog niet deed, met een oplopend schema: normaal om de dag,
// en in de laatste drie dagen voor een week ingaat elke dag. Daarnaast krijgt de beheerder
// drie dagen voor de komende week een mail wie er nog niets invulde.
//
// Aanroepen: cron (X-Cron-Secret == MAIL_CRON_SECRET) verwerkt alle teams met aan=true; een
// ingelogde gebruiker verwerkt alleen zijn eigen team. Verstuurt via Zoho SMTP vanaf
// info@refuro.nl. Verstuurt niets tot de eigenaar het aanzet (rooster_instelling.aan).
//
// Geheimen: MAIL_INKOOP_USER, MAIL_INKOOP_PASS, MAIL_SMTP_HOST (val: smtppro.zoho.eu), MAIL_CRON_SECRET.

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

// Verwerk één team: bepaal de komende week (M1) en de week daarop (M2, twee weken vooruit),
// mail elke werker over de dichtstbijzijnde week die hij nog niet doorgaf (om de dag, in de
// laatste 3 dagen dagelijks), en waarschuw de beheerder 3 dagen voor de komende week.
async function verwerkTeam(inst: any, transporter: any, vanAdres: string): Promise<number> {
  const team = inst.team_id;
  const now = new Date();
  const dow = now.getUTCDay();                 // 0=zo..6=za
  const totM1 = ((8 - dow) % 7) || 7;          // dagen tot de maandag van de KOMENDE week (1..7)
  const totM2 = totM1 + 7;                      // maandag van de week DAAROP (8..14) = twee weken vooruit
  const dagBij = (n: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n));
  const M1 = dagBij(totM1), M1zo = new Date(M1.getTime() + 6 * 864e5);
  const M2 = dagBij(totM2), M2zo = new Date(M2.getTime() + 6 * 864e5);
  const vandaagYmd = ymd(now);

  const { data: leden } = await admin.from("accounts").select("id,naam,email,rol,actief")
    .eq("team_id", team).eq("actief", true).not("email", "is", null);
  const werkers = (leden || []).filter((l: any) => String(l.rol || "").toLowerCase() !== "eigenaar" && l.email);
  const beheerders = (leden || []).filter((l: any) => ["eigenaar", "beheerder"].includes(String(l.rol || "").toLowerCase()) && l.email);
  if (!werkers.length) return 0;

  const ids = werkers.map((w: any) => w.id);
  // Wie gaf de komende week (M1) en/of de week daarop (M2) al door?
  // Alleen een echt doorgegeven (of goedgekeurde) week telt als "ingevuld". Een losse
  // concept-rij (iemand tikte een dag aan maar gaf niks door) of een teruggestuurde week
  // (afgekeurd) mag de herinnering NIET stilzetten; juist die mensen hebben een duw nodig.
  const { data: besch } = await admin.from("beschikbaarheid").select("account_id,datum")
    .in("account_id", ids).gte("datum", ymd(M1)).lte("datum", ymd(M2zo))
    .in("status", ["ingediend", "goedgekeurd"]);
  const filledM1 = new Set<string>(), filledM2 = new Set<string>();
  for (const b of (besch || [])) {
    if (b.datum >= ymd(M1) && b.datum <= ymd(M1zo)) filledM1.add(b.account_id);
    if (b.datum >= ymd(M2) && b.datum <= ymd(M2zo)) filledM2.add(b.account_id);
  }

  const { data: klant } = await admin.from("klanten").select("naam").eq("id", team).maybeSingle();
  const shop = klant?.naam || "je winkel";

  // Om-de-dag-poort op teamniveau: minstens twee dagen sinds de vorige herinnering.
  const laatst = inst.laatst_herinnerd_op ? new Date(inst.laatst_herinnerd_op + "T00:00:00Z") : null;
  const magOmDeDag = !laatst || Math.floor((now.getTime() - laatst.getTime()) / 864e5) >= 2;

  let verstuurd = 0;
  for (const w of werkers) {
    let doelMa: Date | null = null, doelZo: Date | null = null, dagenTot = 0;
    if (!filledM1.has(w.id)) { doelMa = M1; doelZo = M1zo; dagenTot = totM1; }
    else if (!filledM2.has(w.id)) { doelMa = M2; doelZo = M2zo; dagenTot = totM2; }
    if (!doelMa) continue;                       // alles al doorgegeven
    const dagelijks = dagenTot <= 3;             // laatste 3 dagen voor die week: elke dag
    if (!dagelijks && !magOmDeDag) continue;     // anders: om de dag
    const tekst =
      `Hoi ${w.naam || ""},\n\n` +
      `Vul je beschikbaarheid in voor de week van maandag ${ymd(doelMa)} t/m zondag ${ymd(doelZo!)} in Storvo, ` +
      `zodat het rooster op tijd rond is.\n\n` +
      `Invullen: https://storvo.app/app  (ga naar Rooster)\n\n` +
      `Groet,\n${shop}`;
    try {
      await transporter.sendMail({ from: vanAdres, to: w.email, subject: "Vul je beschikbaarheid in", text: tekst });
      verstuurd++;
    } catch (_e) { /* deze overslaan */ }
  }

  // Beheerder-melding, 3 dagen voor de komende week (op vrijdag, totM1===3): wie vulde niks in.
  if (totM1 === 3 && beheerders.length) {
    const achter = werkers.filter((w: any) => !filledM1.has(w.id));
    if (achter.length) {
      const namen = achter.map((w: any) => w.naam || w.email).join(", ");
      const tekst =
        `Over 3 dagen begint de week van maandag ${ymd(M1)}, en deze teamleden hebben hun ` +
        `beschikbaarheid nog niet doorgegeven:\n\n${namen}\n\n` +
        `Bekijk het rooster: https://storvo.app/app  (ga naar Rooster)\n\nStorvo`;
      for (const b of beheerders) {
        try { await transporter.sendMail({ from: vanAdres, to: b.email, subject: "Nog niet iedereen heeft beschikbaarheid doorgegeven", text: tekst }); } catch (_e) { /* */ }
      }
    }
  }

  if (verstuurd > 0) {
    await admin.from("rooster_instelling").update({ laatst_herinnerd_op: vandaagYmd, bijgewerkt_op: new Date().toISOString() }).eq("team_id", team);
  }
  return verstuurd;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const user = Deno.env.get("MAIL_INKOOP_USER");
  const pass = Deno.env.get("MAIL_INKOOP_PASS");
  const smtpHost = Deno.env.get("MAIL_SMTP_HOST") || "smtppro.zoho.eu";
  if (!user || !pass) return fout("De mailkoppeling is nog niet ingesteld.", 503);

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
