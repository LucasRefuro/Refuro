// Mailt een uitnodigingslink naar een nieuwe collega. De eigenaar/beheerder maakt in de
// app een invite aan (tabel invites) en roept deze functie aan met de token + het
// e-mailadres. De functie controleert dat de beller eigenaar/beheerder is van het team
// waar de invite bij hoort, en mailt dan de link via Resend. Zo hoeft de winkelier niets
// te kopieren; na het instellen van zijn wachtwoord (redeem-invite) staat de collega in
// het team.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}
async function wieBelt(req: Request) {
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return null;
  const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } });
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return null;
  const { data: acc } = await admin.from("accounts").select("id, team_id, rol").eq("id", wie.user.id).maybeSingle();
  return acc as { id: string; team_id: string; rol: string } | null;
}
function inviteHtml(bedrijfsnaam: string, url: string) {
  return "<div style='font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif; color:#17201E; max-width:520px; margin:0 auto; font-size:15px; line-height:1.6'>"
    + "<div style='font-family:Sora,Segoe UI,Arial,sans-serif; font-size:22px; font-weight:800; color:#0B5B52; margin-bottom:16px'>storvo</div>"
    + "<h1 style='font-size:22px; margin:0 0 12px'>Je bent uitgenodigd</h1>"
    + "<p style='color:#475350'>Je bent uitgenodigd om mee te werken in <strong>" + bedrijfsnaam + "</strong> op Storvo. Klik op de knop om je account af te maken en je eigen wachtwoord in te stellen. De link is 14 dagen geldig.</p>"
    + "<p style='margin:24px 0'><a href='" + url + "' style='display:inline-block; padding:13px 26px; background:#E88A1D; color:#fff; text-decoration:none; border-radius:100px; font-weight:700'>Account afmaken</a></p>"
    + "<p style='color:#8A938F; font-size:13px'>Werkt de knop niet? Open deze link:<br><a href='" + url + "' style='color:#0B5B52; word-break:break-all'>" + url + "</a></p>"
    + "<p style='color:#8A938F; font-size:12.5px; border-top:1px solid #ECEAE4; padding-top:12px; margin-top:22px'>" + bedrijfsnaam + " werkt met Storvo</p></div>";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const acc = await wieBelt(req);
  if (!acc) return fout("Niet ingelogd", 401);
  if (!["eigenaar", "beheerder"].includes(acc.rol)) return fout("Alleen de winkel mag dit", 403);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const token = String(lijf?.token || "");
  const naar = String(lijf?.naar || "").trim().toLowerCase();
  if (!token) return fout("Geen uitnodiging opgegeven");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(naar)) return fout("Ongeldig e-mailadres");

  const { data: invite } = await admin.from("invites").select("team_id, gebruikt, verloopt_op").eq("token", token).maybeSingle();
  if (!invite || invite.gebruikt || new Date(invite.verloopt_op) < new Date()) return fout("Uitnodiging is ongeldig of verlopen", 400);
  if (invite.team_id !== acc.team_id) return fout("Deze uitnodiging hoort niet bij jouw winkel", 403);

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return fout("E-mail is nog niet ingesteld.", 503);

  const { data: team } = await admin.from("klanten").select("naam").eq("id", invite.team_id).maybeSingle();
  const basis = (Deno.env.get("APP_URL") || "https://storvo.app").replace(/\/$/, "");
  const url = basis + "/app/?invite=" + encodeURIComponent(token);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM") || "Storvo <welkom@storvo.app>",
        to: [naar],
        subject: `Uitnodiging voor ${team?.naam || "je team"} op Storvo`,
        html: inviteHtml(team?.naam || "je team", url),
      }),
    });
    const uit = await res.json();
    if (!res.ok) return fout(uit?.message || `Resend gaf ${res.status}`, 502);
    return new Response(JSON.stringify({ ok: true, id: uit?.id }), { headers: cors });
  } catch (e) {
    console.error("uitnodiging-mail:", e);
    return fout("Er ging iets mis bij het versturen.", 500);
  }
});
