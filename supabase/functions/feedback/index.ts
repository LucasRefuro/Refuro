// Neemt feedback van een winkel aan, bewaart hem en mailt hem door.
//
// Twee redenen om dit via de server te doen in plaats van rechtstreeks vanuit
// de app naar de tabel:
//   1. er moet een mail uit naar info@storvo.nl, en daar hoort een sleutel bij
//      die niet in de browser thuishoort
//   2. de winkel bepaalt zo niet zelf wat er in de velden komt te staan
//
// Gaat het mailen mis, dan is dat geen ramp: de regel staat dan nog steeds in
// de tabel en je ziet hem in het beheerpaneel.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SOORTEN = ["opmerking", "review", "vertrek"];
const KOP: Record<string, string> = {
  opmerking: "Nieuwe opmerking",
  review: "Nieuwe beoordeling",
  vertrek: "Een winkel stopt",
};

function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}
function veilig(s: unknown, max: number) {
  return String(s ?? "").trim().slice(0, max);
}
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function mail(rij: any, account: any) {
  const sleutel = Deno.env.get("RESEND_API_KEY");
  const naar = Deno.env.get("FEEDBACK_NAAR") || "info@storvo.nl";
  if (!sleutel) return;

  const sterren = rij.sterren ? "★".repeat(rij.sterren) + "☆".repeat(5 - rij.sterren) : "";
  const onderwerp = `${KOP[rij.soort]}${rij.winkel ? " · " + rij.winkel : ""}${sterren ? " · " + rij.sterren + "/5" : ""}`;

  const regels = [
    ["Winkel", rij.winkel || "onbekend"],
    ["Pakket", rij.plan || "onbekend"],
    ["Van", `${account?.naam || "onbekend"}${account?.email ? " · " + account.email : ""}`],
    sterren ? ["Beoordeling", `${sterren} (${rij.sterren}/5)`] : null,
    rij.reden ? ["Reden", rij.reden] : null,
    ["Mag je mailen", rij.mag_contact ? "ja" : "nee"],
  ].filter(Boolean) as [string, string][];

  const html = `<div style="font-family:'Instrument Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#17201E;max-width:560px">
  <h2 style="font-family:'Sora',Helvetica,Arial,sans-serif;font-size:19px;margin:0 0 14px">${esc(KOP[rij.soort])}</h2>
  <table style="border-collapse:collapse;margin-bottom:16px">
    ${regels.map(([k, v]) =>
      `<tr><td style="padding:3px 16px 3px 0;color:#5B6663">${esc(k)}</td><td style="padding:3px 0"><b>${esc(v)}</b></td></tr>`
    ).join("")}
  </table>
  ${rij.tekst
    ? `<div style="background:#F7F6F3;border-radius:12px;padding:16px 18px;white-space:pre-wrap">${esc(rij.tekst)}</div>`
    : `<p style="color:#8A938F">Geen toelichting meegegeven.</p>`}
  <p style="color:#8A938F;font-size:13px;margin-top:20px">Verwerken doe je in het beheerpaneel op storvo.app/admin.</p>
</div>`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + sleutel, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM") || "Storvo <welkom@storvo.app>",
        to: [naar],
        reply_to: rij.mag_contact && account?.email ? account.email : undefined,
        subject: onderwerp,
        html,
      }),
    });
  } catch (e) {
    console.error("feedbackmail mislukt", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);

  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return fout("Niet ingelogd", 401);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }

  const soort = veilig(lijf?.soort, 20);
  if (!SOORTEN.includes(soort)) return fout("Onbekende soort feedback");

  const sterren = Number(lijf?.sterren);
  const rij = {
    soort,
    sterren: sterren >= 1 && sterren <= 5 ? Math.round(sterren) : null,
    reden: veilig(lijf?.reden, 200) || null,
    tekst: veilig(lijf?.tekst, 4000) || null,
    mag_contact: lijf?.mag_contact === true,
  };
  if (!rij.tekst && !rij.reden && !rij.sterren) return fout("Er is niets ingevuld");

  // Winkel en pakket halen we er zelf bij; die laten we de app niet meesturen.
  const { data: acc } = await admin.from("accounts")
    .select("id, team_id, naam, email").eq("id", wie.user.id).maybeSingle();
  if (!acc) return fout("Je account is niet gevonden", 403);

  const { data: winkel } = await admin.from("klanten")
    .select("naam, plan").eq("id", acc.team_id).maybeSingle();

  const volledig = Object.assign({}, rij, {
    team_id: acc.team_id,
    account_id: acc.id,
    plan: winkel?.plan || null,
    winkel: winkel?.naam || null,
  });

  const { error } = await admin.from("feedback").insert(volledig);
  if (error) {
    console.error("feedback opslaan", error);
    return fout("Kon de feedback niet opslaan", 500);
  }

  // De mail mag het antwoord niet ophouden.
  try { EdgeRuntime.waitUntil(mail(volledig, acc)); } catch { await mail(volledig, acc); }

  return new Response(JSON.stringify({ ok: true }), { headers: cors });
});
