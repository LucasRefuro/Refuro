// Kijkt de mailbox na en pakt er zelf de facturen uit. Voor elke nieuwe mail met een
// PDF/foto-bijlage laat het de AI bepalen of het een inkoopfactuur is en leest het de velden
// uit; is het een factuur, dan wordt hij als CONCEPT klaargezet (tabel inkoop_concepten) om
// in Storvo te bevestigen. De factuur zelf gaat in de privé-bucket.
//
// Waarom het zo omslachtig is (dit heeft veel tijd gekost): imapflow op de Deno-edge met
// Zoho heeft twee valkuilen. (1) Een bulk-FETCH van de structuur van veel mails "vergiftigt"
// de verbinding: elk volgend commando blijft in de wachtrij hangen. (2) Bij sommige losse
// mails blijft het ophalen van de inhoud hangen, en dat blokkeert daarna alle andere
// commando's op diezelfde verbinding (ook logout). Daarom:
//   - Stap 1 (welke mails hebben een bijlage) doen we op een APARTE verbinding die we daarna
//     weggooien.
//   - Stap 2 (inhoud ophalen) doen we op een VERSE verbinding; blijft een mail hangen, dan
//     vernieuwen we de verbinding en slaan we die mail over.
//   - Elke stap heeft een harde time-out, zodat een ronde ALTIJD op tijd terugkomt.
//
// Per ronde hooguit MAX_KANDIDATEN mails; is er meer, dan 'meer' = true en roept de client
// vanzelf door (of doet de dagelijkse ronde de rest). ALLEEN-LEZEN geopend; voortgang per
// team in inkoop_mail_stand. Cron (X-Cron-Secret == MAIL_CRON_SECRET) of ingelogde gebruiker.
// Optioneel periode: body { sinds, tot } (YYYY-MM-DD).
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

function metTimeout<T>(p: Promise<T>, ms: number): Promise<T | "__TO__"> {
  return Promise.race([p, new Promise<"__TO__">((r) => setTimeout(() => r("__TO__"), ms))]);
}

async function nieuweClient(host: string, port: number, user: string, pass: string) {
  const c = new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });
  await c.connect();
  await c.mailboxOpen("INBOX", { readOnly: true });
  return c;
}
// Verbinding netjes (en begrensd) sluiten; nooit laten hangen.
async function sluit(c: any) {
  try { await metTimeout(c.logout(), 3000); } catch (_e) { /* niets */ }
  try { await metTimeout(c.close?.(), 1500); } catch (_e) { /* niets */ }
}

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

  let lijf: any = {};
  try { lijf = await req.json(); } catch { lijf = {}; }
  const sindsIn = /^\d{4}-\d{2}-\d{2}$/.test(String(lijf?.sinds || "")) ? String(lijf.sinds) : "";
  const totIn = /^\d{4}-\d{2}-\d{2}$/.test(String(lijf?.tot || "")) ? String(lijf.tot) : "";
  const periodeModus = !!sindsIn;

  const { data: stand } = await admin.from("inkoop_mail_stand").select("laatste_uid").eq("team_id", team).maybeSingle();
  const laatsteUid = Number(stand?.laatste_uid || 0);

  const start = Date.now();
  const TIJD_BUDGET = 45000;
  const STRUCT_MAX = 300;
  const MAX_KANDIDATEN = 8;
  const MAX_MAILGROOTTE = 8_000_000;

  let gevonden = 0, dubbel = 0, bekeken = 0, gemist = 0, maxUid = laatsteUid, meer = false;
  const P = 993;

  // Stap 1: welke mails hebben een PDF/foto-bijlage. Aparte verbinding, want de bulk-FETCH
  // van de structuur vergiftigt de verbinding voor volgende commando's.
  let kandidaten: { uid: number; grootte: number }[] = [];
  let uidsInVenster: number[] = [];
  try {
    const c1 = await nieuweClient(host, P, user, pass);
    try {
      let uids: number[] = [];
      if (periodeModus) {
        const zoek: any = { since: new Date(sindsIn + "T00:00:00Z") };
        if (totIn) zoek.before = new Date(new Date(totIn + "T00:00:00Z").getTime() + 864e5);
        uids = await c1.search(zoek, { uid: true }) as number[];
        uids = (uids || []).sort((a, b) => a - b);
      } else if (laatsteUid > 0) {
        uids = await c1.search({ uid: `${laatsteUid + 1}:*` }, { uid: true }) as number[];
        uids = (uids || []).filter((u) => u > laatsteUid).sort((a, b) => a - b);
      } else {
        const sinds = new Date(Date.now() - 14 * 864e5);
        uids = await c1.search({ since: sinds }, { uid: true }) as number[];
        uids = (uids || []).filter((u) => u > laatsteUid).sort((a, b) => a - b);
      }
      if (uids.length > STRUCT_MAX) { meer = true; uids = uids.slice(0, STRUCT_MAX); }
      uidsInVenster = uids;
      if (uids.length) {
        for await (const m of c1.fetch(uids as any, { uid: true, size: true, bodyStructure: true }, { uid: true })) {
          let heeft = false;
          const loop = (node: any) => {
            if (!node || heeft) return;
            if (Array.isArray(node.childNodes) && node.childNodes.length) { node.childNodes.forEach(loop); return; }
            const type = String(node.type || "").toLowerCase();
            const size = Number(node.size || 0);
            const disp = String(node.disposition || "").toLowerCase();
            if (size > 4000 && (type === "application/pdf" || (type.startsWith("image/") && disp === "attachment"))) heeft = true;
          };
          loop((m as any).bodyStructure);
          const g = Number((m as any).size || 0);
          if (heeft && g > 0 && g <= MAX_MAILGROOTTE) kandidaten.push({ uid: Number(m.uid), grootte: g });
        }
      }
    } finally { await sluit(c1); }
  } catch (e) {
    return fout("Mailbox lezen mislukte (structuur): " + String(e).slice(0, 200), 502);
  }
  kandidaten.sort((a, b) => a.uid - b.uid);

  if (lijf?.ping) {
    return new Response(JSON.stringify({ ok: true, ping: true, venster: uidsInVenster.length, kandidaten: kandidaten.length, ms: Date.now() - start }), { headers: cors });
  }

  const teDoen = kandidaten.slice(0, MAX_KANDIDATEN);
  if (kandidaten.length > teDoen.length) meer = true;

  // Stap 2: per kandidaat de inhoud ophalen op een verse verbinding. Blijft er één hangen,
  // dan vernieuwen we de verbinding en slaan we die mail over (we schuiven wél door, anders
  // blokkeert één rotte mail alle nieuwere).
  let client: any = null;
  try {
    client = await nieuweClient(host, P, user, pass);
    let stopte = false;
    for (const { uid } of teDoen) {
      if (Date.now() - start > TIJD_BUDGET) { stopte = true; meer = true; break; }
      bekeken++;
      const msg: any = await metTimeout(client.fetchOne(String(uid), { source: true }, { uid: true }), 12000);
      if (msg === "__TO__" || !msg?.source) {
        // Hing of leeg: verbinding is nu mogelijk vergiftigd → vernieuwen en deze overslaan.
        gemist++;
        await sluit(client);
        client = await nieuweClient(host, P, user, pass);
        if (!periodeModus && uid > maxUid) maxUid = uid;
        continue;
      }
      const parsed: any = await metTimeout(simpleParser(msg.source), 12000);
      if (parsed !== "__TO__" && parsed) {
        const bijlagen = (parsed.attachments || []).filter((a: any) =>
          (a.contentType === "application/pdf" || String(a.contentType || "").startsWith("image/")) && (a.size || (a.content?.length || 0)) > 4000);
        for (const a of bijlagen) {
          if (Date.now() - start > TIJD_BUDGET) { stopte = true; meer = true; break; }
          const media = a.contentType === "application/pdf" ? "application/pdf" : String(a.contentType);
          const bytes = new Uint8Array(a.content);
          if (bytes.length > MAX_MAILGROOTTE) continue;
          let s = ""; const chunk = 0x8000; for (let j = 0; j < bytes.length; j += chunk) s += String.fromCharCode(...bytes.subarray(j, j + chunk));
          const b64 = btoa(s);
          const velden: any = await metTimeout(leesFactuur(aiKey, media, b64), 25000);
          if (velden === "__TO__" || !velden || velden.factuur !== true) continue;
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
      if (!periodeModus && uid > maxUid) maxUid = uid;
    }
    // Alle kandidaten van het venster gedaan én niet vroegtijdig gestopt: schuif door tot de
    // laatste UID (ook mails zonder bijlage), zodat we die niet steeds opnieuw langslopen.
    if (!periodeModus && !stopte && teDoen.length === kandidaten.length && uidsInVenster.length) {
      const laatste = Math.max(...uidsInVenster);
      if (laatste > maxUid) maxUid = laatste;
    }
  } catch (e) {
    if (client) await sluit(client);
    return fout("Mailbox lezen mislukte: " + String(e).slice(0, 200), 502);
  }
  if (client) await sluit(client);

  if (!periodeModus && maxUid > laatsteUid) {
    await admin.from("inkoop_mail_stand").upsert({ team_id: team, laatste_uid: maxUid, bijgewerkt_op: new Date().toISOString() });
  }
  return new Response(JSON.stringify({ ok: true, bekeken, gevonden, dubbel, gemist, meer }), { headers: cors });
});
