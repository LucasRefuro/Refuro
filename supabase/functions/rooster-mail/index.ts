// Rooster-mails die door een handeling in de app ontstaan (niet de cron). Drie soorten:
//  - doorgegeven: een medewerker geeft zijn week door -> de beheerders krijgen een mail.
//  - goedgekeurd: een beheerder keurt de week goed -> de medewerker krijgt een bevestiging.
//  - afgekeurd:   een beheerder keurt af -> de medewerker krijgt een mail met de reden.
//
// De statuswijziging in de tabel doet de app zelf (RLS staat dat toe: eigen rijen voor de
// medewerker, en de policy "beheer keurt beschikbaarheid goed" voor de beheerder). Deze
// functie stuurt alleen de mail, en zoekt de adressen server-side op zodat de client geen
// e-mailadressen hoeft te kennen of mee te sturen.
//
// Aanroep: altijd met een ingelogde sessie (Authorization: Bearer <token>). verify_jwt staat
// aan. Verstuurt via Zoho SMTP vanaf info@refuro.nl.
//
// Geheimen: MAIL_INKOOP_USER, MAIL_INKOOP_PASS, MAIL_SMTP_HOST (val: smtppro.zoho.eu).

import nodemailer from "npm:nodemailer@6.9.14";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
function nlDatum(ymd: string): string {
  const d = new Date(ymd + "T12:00:00Z");
  return `${d.getUTCDate()} ${MAANDEN[d.getUTCMonth()]}`;
}
function weekLabel(maandag: string): string {
  const ma = new Date(maandag + "T12:00:00Z");
  const zo = new Date(ma.getTime() + 6 * 864e5);
  const zoYmd = zo.toISOString().slice(0, 10);
  return `maandag ${nlDatum(maandag)} tot en met zondag ${nlDatum(zoYmd)}`;
}
const LINK = "https://storvo.app/app  (ga naar Rooster)";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const user = Deno.env.get("MAIL_INKOOP_USER");
  const pass = Deno.env.get("MAIL_INKOOP_PASS");
  const smtpHost = Deno.env.get("MAIL_SMTP_HOST") || "smtppro.zoho.eu";
  if (!user || !pass) return fout("De mailkoppeling is nog niet ingesteld.", 503);

  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);
  const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: bevoegd } } });
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return fout("Niet ingelogd", 401);
  const { data: ik } = await admin.from("accounts").select("id,team_id,rol,naam,email").eq("id", wie.user.id).maybeSingle();
  if (!ik?.team_id) return fout("Geen team gevonden", 400);

  let body: any = {};
  try { body = await req.json(); } catch (_e) { /* leeg */ }
  const actie = String(body.actie || "");
  const maandag = String(body.maandag || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(maandag)) return fout("Geen geldige week", 400);
  const week = weekLabel(maandag);

  const transporter = nodemailer.createTransport({ host: smtpHost, port: 465, secure: true, auth: { user, pass } });
  const { data: klantRij } = await admin.from("klanten").select("naam").eq("id", ik.team_id).maybeSingle();
  const shop = klantRij?.naam || "Storvo";

  if (actie === "doorgegeven") {
    const { data: leden } = await admin.from("accounts").select("email,rol,actief")
      .eq("team_id", ik.team_id).eq("actief", true).not("email", "is", null);
    const beheerders = (leden || []).filter((l: any) => ["eigenaar", "beheerder"].includes(String(l.rol || "").toLowerCase()) && l.email);
    if (!beheerders.length) return new Response(JSON.stringify({ ok: true, verstuurd: 0 }), { headers: cors });
    const tekst =
      `${ik.naam || "Een teamlid"} heeft de beschikbaarheid doorgegeven voor de week van ${week}.\n\n` +
      `Keur het goed of stuur het terug in Storvo.\n\nBekijken: ${LINK}\n\n${shop}`;
    let n = 0;
    for (const b of beheerders) {
      try { await transporter.sendMail({ from: user, to: b.email, subject: `${ik.naam || "Een teamlid"} heeft beschikbaarheid doorgegeven`, text: tekst }); n++; } catch (_e) { /* overslaan */ }
    }
    return new Response(JSON.stringify({ ok: true, verstuurd: n }), { headers: cors });
  }

  if (actie === "goedgekeurd" || actie === "afgekeurd") {
    if (!["eigenaar", "beheerder"].includes(String(ik.rol || "").toLowerCase())) return fout("Alleen een beheerder kan dit", 403);
    const doelId = String(body.account_id || "");
    if (!doelId) return fout("Geen medewerker", 400);
    const { data: doel } = await admin.from("accounts").select("naam,email").eq("id", doelId).eq("team_id", ik.team_id).maybeSingle();
    if (!doel?.email) return new Response(JSON.stringify({ ok: true, verstuurd: 0 }), { headers: cors });
    let onderwerp = "", tekst = "";
    if (actie === "goedgekeurd") {
      onderwerp = "Je beschikbaarheid is goedgekeurd";
      tekst = `Hoi ${doel.naam || ""},\n\nJe beschikbaarheid voor de week van ${week} is goedgekeurd.\n\nGroet,\n${shop}`;
    } else {
      const reden = String(body.reden || "").trim();
      onderwerp = "Pas je beschikbaarheid aan";
      tekst = `Hoi ${doel.naam || ""},\n\nJe beschikbaarheid voor de week van ${week} is nog niet goedgekeurd.\n` +
        (reden ? `\nReden: ${reden}\n` : "") +
        `\nPas het aan en geef het opnieuw door in Storvo.\n\nInvullen: ${LINK}\n\nGroet,\n${shop}`;
    }
    let n = 0;
    try { await transporter.sendMail({ from: user, to: doel.email, subject: onderwerp, text: tekst }); n = 1; } catch (_e) { /* */ }
    return new Response(JSON.stringify({ ok: true, verstuurd: n }), { headers: cors });
  }

  return fout("Onbekende actie", 400);
});
