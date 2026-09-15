// Leest de mailbox (INBOX) en zet elke nieuwe mail in de tabel mail_berichten, met een
// categorie die de AI kiest uit de ingestelde categorieën (mail_categorieen). Zo heeft Storvo
// een eigen postvak met AI-sortering. De mailbox wordt ALLEEN-LEZEN geopend.
//
// Betrouwbaarheid: dezelfde aanpak als inkoop-mail (zie [[valkuil-imapflow-zoho-edge]] in de
// notities). imapflow op de edge met Zoho laat commando's soms hangen; daarom halen we de
// inhoud per mail op een VERSE verbinding op met harde time-out, en vernieuwen we de
// verbinding als er één blijft hangen. Per ronde een kleine batch; 'meer' = true als er nog
// meer klaarstaat (de client roept dan door).
//
// Aanroepen: cron (X-Cron-Secret == MAIL_CRON_SECRET) of ingelogde gebruiker.
// Geheimen: MAIL_INKOOP_HOST, MAIL_INKOOP_USER, MAIL_INKOOP_PASS, MAIL_INKOOP_TEAM,
//           ANTHROPIC_API_KEY, MAIL_CRON_SECRET.

import { ImapFlow } from "npm:imapflow@1.0.171";
import { simpleParser } from "npm:mailparser@3.7.1";
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

function metTimeout<T>(p: Promise<T>, ms: number): Promise<T | "__TO__"> {
  return Promise.race([p, new Promise<"__TO__">((r) => setTimeout(() => r("__TO__"), ms))]);
}
async function nieuweClient(host: string, user: string, pass: string) {
  const c = new ImapFlow({ host, port: 993, secure: true, auth: { user, pass }, logger: false });
  await c.connect();
  await c.mailboxOpen("INBOX", { readOnly: true });
  return c;
}
async function sluit(c: any) {
  try { await metTimeout(c.logout(), 3000); } catch (_e) { /* niets */ }
  try { await metTimeout(c.close?.(), 1500); } catch (_e) { /* niets */ }
}

// De AI laat een reeks mails in één keer indelen bij de ingestelde categorieën. Eén aanroep
// voor de hele batch houdt het snel en goedkoop.
async function categoriseer(key: string, cats: { naam: string; ai_hint: string }[], mails: { i: number; van: string; onderwerp: string; fragment: string }[], voorbeelden: { van: string; onderwerp: string; categorie: string }[]) {
  const lijst = cats.map((c) => `- ${c.naam}: ${c.ai_hint || ""}`).join("\n");
  const items = mails.map((m) => `#${m.i} | van: ${m.van} | onderwerp: ${m.onderwerp} | tekst: ${(m.fragment || "").slice(0, 200)}`).join("\n");
  // Een paar eerder ingedeelde mails als voorbeeld: zo volgt de AI de keuzes die de winkelier
  // zelf heeft gemaakt (die correcties overschrijven de categorie, dus dit "leert" mee).
  const vb = voorbeelden.length
    ? "\n\nZo zijn eerdere mails ingedeeld (volg deze stijl):\n" + voorbeelden.map((v) => `- van ${v.van} | ${v.onderwerp} -> ${v.categorie}`).join("\n")
    : "";
  const prompt =
    "Je sorteert e-mails van een reparatiewinkel. Kies voor elke mail de best passende " +
    "categorie uit deze lijst (gebruik exact de naam):\n" + lijst + vb + "\n\nDe mails:\n" + items +
    '\n\nGeef ALLEEN JSON terug: {"0":"<categorienaam>","1":"<categorienaam>", ...} voor elk #nummer.';
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1000, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] }),
  });
  if (!res.ok) return {};
  const uit = await res.json().catch(() => null);
  const tekst = ((uit?.content || []) as any[]).map((c) => c?.text || "").join("").trim();
  const m = tekst.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : "{}"); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const host = Deno.env.get("MAIL_INKOOP_HOST");
  const user = Deno.env.get("MAIL_INKOOP_USER");
  const pass = Deno.env.get("MAIL_INKOOP_PASS");
  const team = Deno.env.get("MAIL_INKOOP_TEAM");
  const aiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!host || !user || !pass || !team) return fout("De mailkoppeling is nog niet ingesteld (MAIL_INKOOP_HOST/USER/PASS/TEAM ontbreekt).", 503);
  if (!aiKey) return fout("ANTHROPIC_API_KEY ontbreekt.", 503);

  const cronSecret = Deno.env.get("MAIL_CRON_SECRET");
  const isCron = !!cronSecret && (req.headers.get("x-cron-secret") || "") === cronSecret;
  if (!isCron) {
    const bevoegd = req.headers.get("Authorization") || "";
    if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);
    const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: bevoegd } } });
    const { data: wie } = await klant.auth.getUser();
    if (!wie?.user) return fout("Niet ingelogd", 401);
  }

  // Categorieën ophalen (met een "Overig"-terugval).
  const { data: cats } = await admin.from("mail_categorieen").select("id,naam,ai_hint,volgorde").eq("team_id", team).order("volgorde");
  const catLijst = cats || [];
  const catOpNaam = new Map(catLijst.map((c: any) => [String(c.naam).toLowerCase(), c.id]));
  const overigId = (catLijst.find((c: any) => /overig/i.test(c.naam)) || catLijst[catLijst.length - 1])?.id || null;

  const { data: stand } = await admin.from("mail_sync_stand").select("laatste_uid").eq("team_id", team).eq("map", "INBOX").maybeSingle();
  const laatsteUid = Number(stand?.laatste_uid || 0);

  const start = Date.now();
  const TIJD_BUDGET = 45000;
  const MAX_PER_RONDE = 12;

  // Stap 1: welke UIDs (alleen search; geen bulk-structuurfetch, die vergiftigt de verbinding).
  let uids: number[] = [];
  let venster: number[] = [];
  try {
    const c1 = await nieuweClient(host, user, pass);
    try {
      if (laatsteUid > 0) {
        uids = await c1.search({ uid: `${laatsteUid + 1}:*` }, { uid: true }) as number[];
        uids = (uids || []).filter((u) => u > laatsteUid);
      } else {
        const sinds = new Date(Date.now() - 3 * 864e5); // eerste keer: laatste 3 dagen
        uids = await c1.search({ since: sinds }, { uid: true }) as number[];
        uids = (uids || []).filter((u) => u > laatsteUid);
      }
      uids = (uids || []).sort((a, b) => a - b);
    } finally { await sluit(c1); }
  } catch (e) {
    return fout("Mailbox lezen mislukte (zoeken): " + String(e).slice(0, 200), 502);
  }
  venster = uids;
  let meer = false;
  if (uids.length > MAX_PER_RONDE) { meer = true; uids = uids.slice(0, MAX_PER_RONDE); }

  // Stap 2: per mail de inhoud ophalen op een verse verbinding (met vernieuwen-bij-hangen).
  const nieuw: any[] = [];
  let bekeken = 0, gemist = 0, maxUid = laatsteUid, stopte = false;
  let client: any = null;
  try {
    client = await nieuweClient(host, user, pass);
    for (const uid of uids) {
      if (Date.now() - start > TIJD_BUDGET) { stopte = true; meer = true; break; }
      bekeken++;
      const msg: any = await metTimeout(client.fetchOne(String(uid), { source: true }, { uid: true }), 12000);
      if (msg === "__TO__" || !msg?.source) {
        gemist++;
        await sluit(client);
        client = await nieuweClient(host, user, pass);
        if (uid > maxUid) maxUid = uid;
        continue;
      }
      const p: any = await metTimeout(simpleParser(msg.source), 12000);
      if (p !== "__TO__" && p) {
        const van = p.from?.value?.[0] || {};
        const tekst = String(p.text || "").slice(0, 20000);
        const html = String(p.html || "").slice(0, 200000);
        const bijlagen = (p.attachments || []).map((a: any) => ({ naam: a.filename || "bijlage", type: a.contentType || "", grootte: a.size || (a.content?.length || 0) }));
        nieuw.push({
          uid, van_naam: (van.name || "").slice(0, 200), van_adres: (van.address || "").slice(0, 200),
          aan: (p.to?.text || "").slice(0, 300), onderwerp: (p.subject || "").slice(0, 400),
          datum: p.date ? new Date(p.date).toISOString() : null,
          fragment: (tekst || "").replace(/\s+/g, " ").trim().slice(0, 300),
          tekst, html, bijlagen, message_id: (p.messageId || "").slice(0, 300),
        });
      }
      if (uid > maxUid) maxUid = uid;
    }
    if (!stopte && venster.length === uids.length) {
      const laatste = Math.max(...venster, maxUid);
      if (laatste > maxUid) maxUid = laatste;
    }
  } catch (e) {
    if (client) await sluit(client);
    return fout("Mailbox lezen mislukte: " + String(e).slice(0, 200), 502);
  }
  if (client) await sluit(client);

  // Stap 3: de nieuwe mails in één AI-aanroep laten indelen.
  let indeling: any = {};
  if (nieuw.length && catLijst.length) {
    // Recente, al ingedeelde mails als leer-voorbeelden (weerspiegelt correcties van de winkelier).
    const catNaamOpId = new Map(catLijst.map((c: any) => [String(c.id), c.naam]));
    const { data: eerder } = await admin.from("mail_berichten")
      .select("van_naam,van_adres,onderwerp,categorie_id")
      .eq("team_id", team).not("categorie_id", "is", null)
      .order("aangemaakt_op", { ascending: false }).limit(12);
    const voorbeelden = (eerder || []).map((r: any) => ({
      van: (r.van_naam || r.van_adres || "").slice(0, 60), onderwerp: (r.onderwerp || "").slice(0, 80),
      categorie: catNaamOpId.get(String(r.categorie_id)) || "",
    })).filter((v: any) => v.categorie);
    indeling = await categoriseer(aiKey, catLijst as any, nieuw.map((m, i) => ({ i, van: m.van_naam || m.van_adres, onderwerp: m.onderwerp, fragment: m.fragment })), voorbeelden);
  }

  // Stap 4: opslaan (service-role; upsert op team+map+uid zodat dubbel niks doet).
  let opgeslagen = 0;
  for (let i = 0; i < nieuw.length; i++) {
    const m = nieuw[i];
    const naam = String(indeling?.[String(i)] || indeling?.[i] || "").toLowerCase();
    const catId = catOpNaam.get(naam) || overigId;
    const { error } = await admin.from("mail_berichten").upsert({
      team_id: team, uid: m.uid, map: "INBOX",
      van_naam: m.van_naam, van_adres: m.van_adres, aan: m.aan, onderwerp: m.onderwerp,
      datum: m.datum, fragment: m.fragment, tekst: m.tekst, html: m.html, bijlagen: m.bijlagen,
      categorie_id: catId, message_id: m.message_id,
    }, { onConflict: "team_id,map,uid", ignoreDuplicates: true });
    if (!error) opgeslagen++;
  }

  if (maxUid > laatsteUid) {
    await admin.from("mail_sync_stand").upsert({ team_id: team, map: "INBOX", laatste_uid: maxUid, bijgewerkt_op: new Date().toISOString() });
  }
  return new Response(JSON.stringify({ ok: true, bekeken, nieuw: opgeslagen, gemist, meer }), { headers: cors });
});
