// Verstuurt een e-mail namens de winkel via Zoho SMTP (smtppro.zoho.eu). Wordt alleen door
// een INGELOGDE gebruiker aangeroepen: versturen is een handeling die de winkelier zelf doet
// (op Versturen klikt), nooit automatisch. Antwoorden blijven in de thread via In-Reply-To.
//
// Body: { aan, onderwerp, tekst, html?, in_reply_to?, references?, bericht_id? }
//   bericht_id: als dit een antwoord is op een opgeslagen mail, markeren we die als beantwoord.
//
// Geheimen: MAIL_SMTP_HOST (of anders smtppro.zoho.eu), MAIL_INKOOP_USER, MAIL_INKOOP_PASS,
//           MAIL_INKOOP_TEAM.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const user = Deno.env.get("MAIL_INKOOP_USER");
  const pass = Deno.env.get("MAIL_INKOOP_PASS");
  const team = Deno.env.get("MAIL_INKOOP_TEAM");
  const smtpHost = Deno.env.get("MAIL_SMTP_HOST") || "smtppro.zoho.eu";
  if (!user || !pass || !team) return fout("De mailkoppeling is nog niet ingesteld.", 503);

  // Alleen een ingelogde gebruiker van dit team mag versturen.
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);
  const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: bevoegd } } });
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return fout("Niet ingelogd", 401);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const aan = String(lijf?.aan || "").trim();
  const onderwerp = String(lijf?.onderwerp || "").trim();
  const tekst = String(lijf?.tekst || "");
  const html = lijf?.html ? String(lijf.html) : "";
  const inReplyTo = lijf?.in_reply_to ? String(lijf.in_reply_to) : "";
  const references = lijf?.references ? String(lijf.references) : "";
  const berichtId = lijf?.bericht_id ? String(lijf.bericht_id) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(aan)) return fout("Geen geldig e-mailadres bij 'aan'.");
  if (!onderwerp && !tekst && !html) return fout("Lege mail.");

  const transporter = nodemailer.createTransport({
    host: smtpHost, port: 465, secure: true, auth: { user, pass },
  });
  const headers: any = {};
  if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
  if (references || inReplyTo) headers["References"] = (references || inReplyTo);

  try {
    await transporter.sendMail({
      from: user, to: aan, subject: onderwerp || "(geen onderwerp)",
      text: tekst || undefined, html: html || undefined, headers,
    });
  } catch (e) {
    return fout("Versturen mislukte: " + String(e).slice(0, 200), 502);
  }

  // Was het een antwoord op een opgeslagen mail? Markeer die als beantwoord (binnen het team).
  if (berichtId) {
    try { await admin.from("mail_berichten").update({ beantwoord: true }).eq("id", berichtId).eq("team_id", team); } catch (_e) { /* niets */ }
  }
  return new Response(JSON.stringify({ ok: true }), { headers: cors });
});
