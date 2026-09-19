// Het klantportaal: inloglinks en uitnodigingen.
//
// Waarom een eigen functie en niet signInWithOtp in de browser:
// 1. Dan kan iedereen met een willekeurig e-mailadres een Supabase-account aanmaken.
//    Hier krijgt alleen een bekende, actieve portaalgebruiker een link.
// 2. De standaardmail van Supabase is die van Storvo. De klant van de winkel hoort een
//    mail te krijgen in de huisstijl van de winkel (bijv. Reloop it), niet van Storvo.
//
// Openbaar (verify_jwt uit): de actie 'inloglink' heeft geen login nodig. 'uitnodigen'
// controleert zelf wie er belt: eigenaar/beheerder van de winkel, of een beheerder
// van de organisatie in het portaal.
//
// Geheimen: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, RESEND_API_KEY,
// APP_URL (standaard https://storvo.app), RESEND_FROM (reserve-afzender).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP_URL = (Deno.env.get("APP_URL") || "https://storvo.app").replace(/\/$/, "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const antwoord = (lijf: unknown, code = 200) => new Response(JSON.stringify(lijf), { status: code, headers: cors });
const fout = (bericht: string, code = 400) => antwoord({ ok: false, error: bericht }, code);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const schoon = (s: unknown, max = 200) => String(s ?? "").trim().slice(0, max);
/* ilike zonder jokers: _ en % in een e-mailadres mogen niet als wildcard werken. */
const letterlijk = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);
const html = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

type Instellingen = {
  team_id: string; merknaam: string; logo_url: string | null; kleur: string; accent: string; inkt: string;
  contact_email: string | null; contact_telefoon: string | null; domein: string | null; afzender: string | null; actief: boolean;
};

async function instellingenVan(team_id: string): Promise<Instellingen | null> {
  const { data } = await admin.from("klantportaal_instellingen").select("*").eq("team_id", team_id).maybeSingle();
  return data && data.actief ? data as Instellingen : null;
}

/* Waar de link naartoe gaat. Het eigen domein als dat er is, anders de Storvo-route met
   de slug van de winkel. Een adres dat de browser meestuurt nemen we NIET over: dan kon
   iemand een inloglink naar zijn eigen site laten wijzen. */
async function portaalAdres(ins: Instellingen) {
  // Direct naar /klantportaal: de voorpagina van het domein is de Storvo-site.
  if (ins.domein) return "https://" + ins.domein.replace(/^https?:\/\//, "").replace(/\/.*$/, "") + "/klantportaal";
  const { data: k } = await admin.from("klanten").select("slug").eq("id", ins.team_id).maybeSingle();
  return APP_URL + "/klantportaal/?w=" + encodeURIComponent(k?.slug || "");
}

function mailHtml(ins: Instellingen, kop: string, tekst: string, knop: string, url: string) {
  const merk = html(ins.merknaam);
  const kleur = /^#[0-9a-f]{3,8}$/i.test(ins.kleur) ? ins.kleur : "#0F6B4B";
  const accent = /^#[0-9a-f]{3,8}$/i.test(ins.accent) ? ins.accent : "#C6F36B";
  const inkt = /^#[0-9a-f]{3,8}$/i.test(ins.inkt) ? ins.inkt : "#10231B";
  const logo = ins.logo_url && /^https:\/\//.test(ins.logo_url)
    ? `<img src="${html(ins.logo_url)}" alt="${merk}" height="32" style="height:32px;display:block;margin-bottom:22px">`
    : `<div style="font-size:22px;font-weight:800;color:${kleur};margin-bottom:22px">${merk}</div>`;
  const contact = [ins.contact_telefoon, ins.contact_email].filter(Boolean).map((x) => html(String(x))).join(" · ");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${inkt};max-width:520px;margin:0 auto;font-size:15px;line-height:1.6">`
    + logo
    + `<h1 style="font-size:22px;margin:0 0 12px">${html(kop)}</h1>`
    + `<p style="color:#475350;margin:0">${tekst}</p>`
    + `<p style="margin:26px 0"><a href="${html(url)}" style="display:inline-block;padding:13px 26px;background:${kleur};color:#fff;text-decoration:none;border-radius:100px;font-weight:700">${html(knop)}</a></p>`
    + `<p style="color:#8A938F;font-size:13px">De link werkt één keer en is een uur geldig. Heb je dit niet aangevraagd, dan kun je deze mail negeren.</p>`
    + `<p style="color:#8A938F;font-size:12.5px;border-top:1px solid #ECEAE4;padding-top:12px;margin-top:22px">${merk}${contact ? " · " + contact : ""}`
    + `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${accent};margin-left:8px"></span></p></div>`;
}

async function verstuur(ins: Instellingen, naar: string, onderwerp: string, inhoud: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("E-mail is nog niet ingesteld.");
  const van = ins.afzender || `${ins.merknaam} <${Deno.env.get("RESEND_FROM_ADRES") || "portaal@storvo.app"}>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: van, to: [naar], subject: onderwerp, html: inhoud, reply_to: ins.contact_email || undefined }),
  });
  if (!res.ok) {
    const uit = await res.json().catch(() => ({}));
    throw new Error(uit?.message || `Resend gaf ${res.status}`);
  }
}

/* Een eenmalige inloglink. Bestaat de gebruiker nog niet in auth, dan maakt 'invite'
   hem aan; bestaat hij wel, dan geeft 'magiclink' een link en de user terug. */
async function maakLink(email: string, terug: string) {
  const eerst = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: terug } });
  if (!eerst.error && eerst.data?.properties?.action_link) return { link: eerst.data.properties.action_link, user: eerst.data.user };
  const nieuw = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: terug } });
  if (nieuw.error || !nieuw.data?.properties?.action_link) throw new Error(nieuw.error?.message || "Kon geen link maken");
  return { link: nieuw.data.properties.action_link, user: nieuw.data.user };
}

async function wieBelt(req: Request) {
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return null;
  const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } });
  const { data } = await klant.auth.getUser();
  return data?.user || null;
}

/* ═══ inloglink: openbaar ═══
   Antwoordt altijd hetzelfde, of het adres nu bekend is of niet. Anders kun je met
   deze functie uitzoeken wie er klant is. */
async function inloglink(lijf: any) {
  const email = schoon(lijf?.email, 320).toLowerCase();
  const neutraal = antwoord({ ok: true });
  if (!EMAIL.test(email)) return fout("Vul een geldig e-mailadres in.");

  let q = admin.from("klantportaal_instellingen").select("*").eq("actief", true);
  const domein = schoon(lijf?.domein, 200).toLowerCase();
  const slug = schoon(lijf?.slug, 100);
  let ins: Instellingen | null = null;
  if (domein) { const { data } = await q.ilike("domein", letterlijk(domein)).maybeSingle(); ins = data as Instellingen | null; }
  if (!ins && slug) {
    const { data: k } = await admin.from("klanten").select("id").eq("slug", slug).maybeSingle();
    if (k) ins = await instellingenVan(k.id);
  }
  if (!ins) return neutraal;

  const { data: gb } = await admin.from("klantportaal_gebruikers").select("user_id, naam, inloglink_op, actief")
    .eq("team_id", ins.team_id).eq("email", email).eq("actief", true).maybeSingle();
  if (!gb) return neutraal;
  // Hooguit één link per minuut per persoon.
  if (gb.inloglink_op && Date.now() - new Date(gb.inloglink_op).getTime() < 60_000) return neutraal;
  await admin.from("klantportaal_gebruikers").update({ inloglink_op: new Date().toISOString() }).eq("user_id", gb.user_id);

  try {
    const { link } = await maakLink(email, await portaalAdres(ins));
    await verstuur(ins, email, `Inloggen bij ${ins.merknaam}`,
      mailHtml(ins, "Je inloglink", `Hallo${gb.naam ? " " + html(gb.naam) : ""}, klik op de knop om in je klantportaal van ${html(ins.merknaam)} te komen.`, "Inloggen", link));
  } catch (e) {
    console.error("klantportaal inloglink:", e);
  }
  return neutraal;
}

/* ═══ uitnodigen: winkel of beheerder van de organisatie ═══ */
async function uitnodigen(req: Request, lijf: any) {
  const user = await wieBelt(req);
  if (!user) return fout("Niet ingelogd", 401);

  const email = schoon(lijf?.email, 320).toLowerCase();
  const naam = schoon(lijf?.naam, 120) || null;
  const rol = lijf?.rol === "beheerder" ? "beheerder" : "lezer";
  if (!EMAIL.test(email)) return fout("Vul een geldig e-mailadres in.");

  // Wie belt er: iemand van de winkel, of een beheerder in het portaal?
  const { data: acc } = await admin.from("accounts").select("id, team_id, rol").eq("id", user.id).maybeSingle();
  let organisatie_id = schoon(lijf?.organisatie_id, 40);
  let team_id: string;
  if (acc?.team_id && ["eigenaar", "beheerder"].includes(acc.rol)) {
    const { data: org } = await admin.from("klantportaal_organisaties").select("id, team_id").eq("id", organisatie_id).maybeSingle();
    if (!org || org.team_id !== acc.team_id) return fout("Deze organisatie hoort niet bij jouw winkel", 403);
    team_id = org.team_id;
  } else {
    const { data: ik } = await admin.from("klantportaal_gebruikers").select("organisatie_id, team_id, rol, actief").eq("user_id", user.id).maybeSingle();
    if (!ik || !ik.actief || ik.rol !== "beheerder") return fout("Alleen een beheerder mag collega's uitnodigen", 403);
    organisatie_id = ik.organisatie_id;
    team_id = ik.team_id;
  }

  const ins = await instellingenVan(team_id);
  if (!ins) return fout("Het klantportaal staat uit voor deze winkel", 409);

  /* Een medewerker van een winkel mag geen portaalgebruiker worden met hetzelfde adres:
     dan zou één login twee heel verschillende rechten hebben. */
  const { data: isMedewerker } = await admin.from("accounts").select("id").ilike("email", letterlijk(email)).limit(1).maybeSingle();
  if (isMedewerker) return fout("Dit e-mailadres is al een Storvo-account. Gebruik een ander adres.", 409);

  let link: string, uid: string;
  try {
    const r = await maakLink(email, await portaalAdres(ins));
    link = r.link; uid = r.user!.id;
  } catch (e) {
    console.error("klantportaal uitnodigen:", e);
    return fout("Kon geen uitnodiging maken. Probeer het opnieuw.", 500);
  }

  const { data: bestaand } = await admin.from("klantportaal_gebruikers").select("organisatie_id, actief").eq("user_id", uid).maybeSingle();
  if (bestaand && bestaand.organisatie_id !== organisatie_id) return fout("Dit e-mailadres hoort al bij een andere organisatie.", 409);
  const { error } = await admin.from("klantportaal_gebruikers").upsert({
    user_id: uid, organisatie_id, team_id, email, naam, rol, actief: true, uitgenodigd_op: new Date().toISOString(),
  });
  if (error) { console.error(error); return fout("Opslaan mislukt", 500); }

  const { data: org } = await admin.from("klantportaal_organisaties").select("naam").eq("id", organisatie_id).maybeSingle();
  try {
    await verstuur(ins, email, `Je klantportaal bij ${ins.merknaam}`,
      mailHtml(ins, "Welkom in je klantportaal",
        `Je bent uitgenodigd voor het klantportaal van <strong>${html(org?.naam || "je organisatie")}</strong> bij ${html(ins.merknaam)}. `
        + `Daar volg je elke partij: ophaling, wissen, testen en betaling, met alle certificaten en rapporten.`,
        "Portaal openen", link));
  } catch (e) {
    return fout(String((e as Error).message || e), 502);
  }
  return antwoord({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);
  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  if (lijf?.actie === "inloglink") return inloglink(lijf);
  if (lijf?.actie === "uitnodigen") return uitnodigen(req, lijf);
  return fout("Onbekende actie");
});
