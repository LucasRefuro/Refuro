// Verwijdert mails: verplaatst ze naar de Prullenbak (Trash) van de mailbox en markeert ze
// in Storvo als verwijderd. Omkeerbaar (ze staan in de prullenbak, niet definitief weg).
// Alleen door een INGELOGDE gebruiker; de gebruiker klikt dit zelf aan.
//
// Body: { ids: [bericht_id, ...] }  (mail_berichten-id's van dit team)
//
// Geheimen: MAIL_INKOOP_HOST, MAIL_INKOOP_USER, MAIL_INKOOP_PASS, MAIL_INKOOP_TEAM.

import { ImapFlow } from "npm:imapflow@1.0.171";
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
function metTimeout<T>(p: Promise<T>, ms: number): Promise<T | "__TO__"> {
  return Promise.race([p, new Promise<"__TO__">((r) => setTimeout(() => r("__TO__"), ms))]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const host = Deno.env.get("MAIL_INKOOP_HOST");
  const user = Deno.env.get("MAIL_INKOOP_USER");
  const pass = Deno.env.get("MAIL_INKOOP_PASS");
  const team = Deno.env.get("MAIL_INKOOP_TEAM");
  if (!host || !user || !pass || !team) return fout("De mailkoppeling is nog niet ingesteld.", 503);

  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);
  const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: bevoegd } } });
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return fout("Niet ingelogd", 401);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const ids: string[] = Array.isArray(lijf?.ids) ? lijf.ids.map((x: any) => String(x)).slice(0, 200) : [];
  if (!ids.length) return fout("Geen berichten opgegeven.");

  // De uids van deze berichten ophalen (alleen van dit team, alleen INBOX).
  const { data: rijen } = await admin.from("mail_berichten").select("id,uid").eq("team_id", team).eq("map", "INBOX").in("id", ids);
  const teDoen = (rijen || []).filter((r: any) => Number(r.uid) > 0);
  if (!teDoen.length) { return new Response(JSON.stringify({ ok: true, verwijderd: 0 }), { headers: cors }); }

  const geluktIds: string[] = [];
  let client: any = null;
  const nieuw = async () => {
    const c = new ImapFlow({ host, port: 993, secure: true, auth: { user, pass }, logger: false });
    await c.connect();
    await c.mailboxOpen("INBOX"); // schrijfbaar: we verplaatsen naar Trash
    return c;
  };
  const sluit = async (c: any) => {
    try { await metTimeout(c.logout(), 3000); } catch (_e) { /* niets */ }
    try { await metTimeout(c.close?.(), 1500); } catch (_e) { /* niets */ }
  };
  try {
    client = await nieuw();
    for (const r of teDoen) {
      // Naar Trash verplaatsen; blijft het hangen, dan verbinding vernieuwen en doorgaan.
      const res = await metTimeout(client.messageMove(String(r.uid), "Trash", { uid: true }), 12000);
      if (res === "__TO__") {
        await sluit(client); client = await nieuw();
        continue;
      }
      geluktIds.push(r.id);
    }
  } catch (e) {
    if (client) await sluit(client);
    // Wat al gelukt is, markeren we alsnog.
    if (geluktIds.length) await admin.from("mail_berichten").update({ verwijderd: true }).eq("team_id", team).in("id", geluktIds);
    return fout("Verwijderen deels mislukt: " + String(e).slice(0, 180), 502);
  }
  if (client) await sluit(client);

  if (geluktIds.length) {
    await admin.from("mail_berichten").update({ verwijderd: true }).eq("team_id", team).in("id", geluktIds);
  }
  return new Response(JSON.stringify({ ok: true, verwijderd: geluktIds.length }), { headers: cors });
});
