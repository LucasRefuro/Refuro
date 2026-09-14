// Kijkt de mailbox na en pakt er zelf de facturen uit. Voor elke nieuwe mail met een
// PDF/foto-bijlage laat het de AI bepalen of het een inkoopfactuur is en leest het de
// velden uit; is het een factuur, dan wordt hij als CONCEPT klaargezet (tabel
// inkoop_concepten) om in Storvo te bevestigen. De factuur zelf gaat in de privé-bucket.
//
// De mailbox wordt ALLEEN-LEZEN geopend: we raken de gelezen/ongelezen-status van je
// gewone inbox niet aan. Om niets dubbel te doen onthouden we per team de laatst verwerkte
// UID (tabel inkoop_mail_stand).
//
// Aanroepen kan met een cron (header X-Cron-Secret == MAIL_CRON_SECRET) of door een
// ingelogde gebruiker (knop "Haal facturen op uit e-mail"). In beide gevallen verwerken we
// de mailbox van MAIL_INKOOP_TEAM.
//
// Geheimen: MAIL_INKOOP_HOST, MAIL_INKOOP_USER, MAIL_INKOOP_PASS, MAIL_INKOOP_TEAM,
//           ANTHROPIC_API_KEY, MAIL_CRON_SECRET (optioneel).

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

// Vraag de AI of een bijlage een inkoopfactuur is en lees de velden uit.
async function leesFactuur(key: string, media: string, b64: string) {
  const bron = media === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: media, data: b64 } };
  const prompt =
    "Bekijk dit document. Geef ALLEEN JSON terug: " +
    '{"factuur": <true als dit een inkoopfactuur/bonnetje is, anders false>, ' +
    '"bedrag": <totaal inclusief btw als getal of null>, "btw": <21, 9 of 0>, ' +
    '"leverancier": "<bedrijfsnaam afzender of null>", "datum": "<YYYY-MM-DD of null>", ' +
    '"factuurnummer": "<of null>", "omschrijving": "<max 6 woorden of null>"}';
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 400, messages: [{ role: "user", content: [bron, { type: "text", text: prompt }] }] }),
  });
  if (!res.ok) return null;
  const uit = await res.json().catch(() => null);
  const tekst = ((uit?.content || []) as any[]).map((c) => c?.text || "").join("").trim();
  const m = tekst.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : tekst); } catch { return null; }
}

async function bestaatAl(team: string, factuurnummer: string, leverancier: string, bedrag: number, datum: string) {
  if (factuurnummer) {
    const { data } = await admin.from("inkoop_concepten").select("id").eq("team_id", team).eq("factuurnummer", factuurnummer).limit(1);
    if (data && data.length) return true;
  }
  const { data } = await admin.from("inkoop_concepten").select("id").eq("team_id", team).eq("leverancier", leverancier).eq("bedrag", bedrag).eq("datum", datum).limit(1);
  return !!(data && data.length);
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

  // Toegang: cron-geheim, of een ingelogde gebruiker.
  const cronSecret = Deno.env.get("MAIL_CRON_SECRET");
  const gegevenSecret = req.headers.get("x-cron-secret") || "";
  const isCron = !!cronSecret && gegevenSecret === cronSecret;
  if (!isCron) {
    const bevoegd = req.headers.get("Authorization") || "";
    if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);
    const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: bevoegd } } });
    const { data: wie } = await klant.auth.getUser();
    if (!wie?.user) return fout("Niet ingelogd", 401);
  }

  const { data: stand } = await admin.from("inkoop_mail_stand").select("laatste_uid").eq("team_id", team).maybeSingle();
  const laatsteUid = Number(stand?.laatste_uid || 0);

  const client = new ImapFlow({ host, port: 993, secure: true, auth: { user, pass }, logger: false });
  let gevonden = 0, dubbel = 0, bekeken = 0, maxUid = laatsteUid;
  try {
    await client.connect();
    await client.mailboxOpen("INBOX", { readOnly: true });

    // Welke berichten: op de eerste keer alleen de laatste 30 dagen, daarna alles nieuwer
    // dan de laatst verwerkte UID.
    let uids: number[] = [];
    if (laatsteUid > 0) {
      uids = await client.search({ uid: `${laatsteUid + 1}:*` }, { uid: true }) as number[];
    } else {
      const sinds = new Date(Date.now() - 30 * 864e5);
      uids = await client.search({ since: sinds }, { uid: true }) as number[];
    }
    uids = (uids || []).filter((u) => u > laatsteUid).sort((a, b) => a - b).slice(0, 40);

    for (const uid of uids) {
      bekeken++;
      if (uid > maxUid) maxUid = uid;
      let bericht: any = null;
      for await (const m of client.fetch({ uid: String(uid) }, { uid: true, source: true }, { uid: true })) bericht = m;
      if (!bericht?.source) continue;
      const parsed: any = await simpleParser(bericht.source).catch(() => null);
      const bijlagen = (parsed?.attachments || []).filter((a: any) =>
        (a.contentType === "application/pdf" || String(a.contentType || "").startsWith("image/")) && (a.size || (a.content?.length || 0)) > 4000);
      for (let i = 0; i < bijlagen.length; i++) {
        const a = bijlagen[i];
        const media = a.contentType === "application/pdf" ? "application/pdf" : String(a.contentType);
        const bytes = new Uint8Array(a.content);
        let b64 = "";
        { let s = ""; const chunk = 0x8000; for (let j = 0; j < bytes.length; j += chunk) s += String.fromCharCode(...bytes.subarray(j, j + chunk)); b64 = btoa(s); }
        const velden = await leesFactuur(aiKey, media, b64);
        if (!velden || velden.factuur !== true) continue;
        const bedrag = Number(velden.bedrag) || 0;
        const datum = /^\d{4}-\d{2}-\d{2}$/.test(String(velden.datum || "")) ? velden.datum : (parsed?.date ? new Date(parsed.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
        const leverancier = velden.leverancier ? String(velden.leverancier).slice(0, 100) : (parsed?.from?.value?.[0]?.name || "");
        const factuurnummer = velden.factuurnummer ? String(velden.factuurnummer).slice(0, 60) : "";
        if (bedrag && await bestaatAl(team, factuurnummer, leverancier, bedrag, datum)) { dubbel++; continue; }
        const id = crypto.randomUUID();
        const ext = media === "application/pdf" ? "pdf" : (media.split("/")[1] || "jpg");
        const pad = `${team}/${id}.${ext}`;
        await admin.storage.from("inkoopfacturen").upload(pad, bytes, { contentType: media, upsert: true });
        await admin.from("inkoop_concepten").insert({
          id, team_id: team, datum, wat: velden.omschrijving || leverancier || (a.filename || "Inkoop"),
          leverancier, bedrag, btw: [21, 9, 0].includes(Number(velden.btw)) ? Number(velden.btw) : 21,
          factuurnummer, factuur_pad: pad, bron: "mail", mail_uid: String(uid),
        });
        gevonden++;
      }
    }
    try { await client.logout(); } catch (_e) {}
  } catch (e) {
    try { await client.close(); } catch (_e) {}
    return fout("Mailbox lezen mislukte: " + String(e).slice(0, 250), 502);
  }

  if (maxUid > laatsteUid) {
    await admin.from("inkoop_mail_stand").upsert({ team_id: team, laatste_uid: maxUid, bijgewerkt_op: new Date().toISOString() });
  }
  return new Response(JSON.stringify({ ok: true, bekeken, gevonden, dubbel }), { headers: cors });
});
