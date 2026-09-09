// Verstuurt een factuur of offerte per e-mail namens de winkel, met de factuur in de
// mail. Via Resend. De ingelogde winkelier wordt gecontroleerd (JWT), zodat dit geen
// open mailrelay is. Afzender is het geverifieerde Storvo-adres met de winkelnaam als
// weergavenaam; reply-to gaat naar de winkel zodat antwoorden daar binnenkomen.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function afzender(naam: string) {
  const std = Deno.env.get("RESEND_FROM") || "Storvo <welkom@storvo.app>";
  const m = std.match(/<([^>]+)>/);
  const adres = m ? m[1] : std;
  const disp = String(naam || "").replace(/[<>"]/g, "").trim();
  return disp ? `${disp} <${adres}>` : std;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Alleen POST" }), { status: 405, headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (error || !user) return new Response(JSON.stringify({ error: "Niet ingelogd." }), { status: 401, headers: cors });
    const { data: profiel } = await admin.from("accounts").select("team_id").eq("id", user.id).maybeSingle();
    if (!profiel) return new Response(JSON.stringify({ error: "Geen winkel gevonden." }), { status: 403, headers: cors });

    const { naar, onderwerp, html, replyTo, afzendernaam } = await req.json();
    if (!naar || !onderwerp || !html) return new Response(JSON.stringify({ error: "Onvolledige opdracht." }), { status: 400, headers: cors });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(naar))) return new Response(JSON.stringify({ error: "Ongeldig e-mailadres." }), { status: 400, headers: cors });

    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return new Response(JSON.stringify({ error: "E-mail is nog niet ingesteld." }), { status: 503, headers: cors });

    const payload: Record<string, unknown> = { from: afzender(afzendernaam), to: [naar], subject: String(onderwerp).slice(0, 200), html: String(html) };
    if (replyTo && /@/.test(String(replyTo))) payload.reply_to = replyTo;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const uit = await res.json();
    if (!res.ok) return new Response(JSON.stringify({ error: uit?.message || `Resend gaf ${res.status}` }), { status: 502, headers: cors });
    return new Response(JSON.stringify({ ok: true, id: uit?.id }), { status: 200, headers: cors });
  } catch (e) {
    console.error("factuur-mail:", e);
    return new Response(JSON.stringify({ error: "Er ging iets mis bij het versturen." }), { status: 500, headers: cors });
  }
});
