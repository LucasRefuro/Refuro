// Inruil-aanvraag vanuit de refuro.nl-webshop. Verving het Shopify
// contactformulier, dat op hCaptcha vastliep ("Missing CAPTCHA token").
//
// Publiek endpoint (geen inlog): de webshop is statisch en publiek leesbaar,
// dus een gedeeld secret in de themabron is geen echte auth. De bescherming is
// de combinatie: server-side validatie, een honeypot, een soft rate-limit per
// e-mail, en het feit dat er niets gevoeligs terugkomt -- de functie schrijft
// alleen weg en seint de winkel. Zie de valkuil in de repo: nooit terug naar
// Shopify's contactform met f.submit(), dat is juist de reden van de vastloper.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Eén winkel (Storvo/Refuro). Bij een tweede winkel: verhuis de tenant-selectie
// naar een pad-geheim in winkel_koppelingen (zie shopify-webhook).
const TEAM = Deno.env.get("INRUIL_TEAM_ID") || "ce975142-a7d9-4fb2-9cb5-9cc1fe1d7f65";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("INRUIL_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "content-type, x-inruil-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}
function knip(x: unknown, max: number) {
  return x == null ? "" : String(x).slice(0, max).trim();
}

// Notificatie naar de winkel. Ontvanger wordt server-side bepaald: env-override,
// anders het in de app ingestelde winkeladres, anders het klant-e-mailadres.
async function mail(rij: Record<string, unknown>) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return; // e-mail nog niet ingesteld: de rij staat er al, sla stil over

  // Inruilmeldingen gaan naar het zakelijke adres van Refuro; overschrijfbaar
  // met het geheim INRUIL_NAAR.
  const naar = Deno.env.get("INRUIL_NAAR") || "info@refuro.nl";

  const van = Deno.env.get("RESEND_FROM") || "Storvo <welkom@storvo.app>";
  const r = (k: string) => String(rij[k] ?? "-");
  const rj = (rij.ruwe_json ?? {}) as Record<string, unknown>;
  const uitLabel = rj.uitbetaling === "tegoed" ? "Winkeltegoed" : "Op rekening (IBAN)";
  const html = `
    <h2 style="margin:0 0 12px">Nieuwe inruilaanvraag</h2>
    <p><b>Toestel:</b> ${r("toestel")}<br>
       <b>Richtprijs:</b> ${r("schatting")}<br>
       <b>Accu:</b> ${r("accu")}</p>
    <p><b>Naam:</b> ${r("naam")}<br>
       <b>E-mail:</b> ${r("email")}<br>
       <b>Telefoon:</b> ${r("telefoon")}<br>
       <b>Adres:</b> ${r("adres")}<br>
       <b>Uitbetaling:</b> ${uitLabel}<br>
       <b>IBAN:</b> ${r("iban")}<br>
       <b>Nieuwsbrief:</b> ${rij.nieuwsbrief ? "ja" : "nee"}</p>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: van,
      to: [naar],
      reply_to: rij.email ? String(rij.email) : undefined,
      subject: `Inruilaanvraag - ${r("toestel")}`,
      html,
    }),
  });
}

// Bevestiging naar de klant zelf. Kort en geruststellend, in de taal van de
// webshop. Van een Refuro-afzender, met de winkel als antwoordadres, zodat een
// reactie van de klant bij de winkel binnenkomt en niet bij de storvo-afzender.
async function klantMail(rij: Record<string, unknown>, taal: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const naar = String(rij.email || "");
  if (!naar) return;

  const van = Deno.env.get("RESEND_KLANT_FROM") || "Refuro <welkom@storvo.app>";
  const antwoord = Deno.env.get("INRUIL_NAAR") || "info@refuro.nl";
  const rj = (rij.ruwe_json ?? {}) as Record<string, unknown>;
  const tegoed = rj.uitbetaling === "tegoed";
  const en = taal === "en";
  const naam = String(rij.naam || "").split(" ")[0];
  const toestel = String(rij.toestel || "");
  const schatting = String(rij.schatting || "");
  const regel = (label: string, waarde: string) => waarde ? `<b>${label}:</b> ${waarde}<br>` : "";

  const onderwerp = en ? "We received your trade-in request" : "We hebben je inruilaanvraag ontvangen";
  const html = en
    ? `<div style="font-family:system-ui,Arial,sans-serif;color:#1B2254;line-height:1.55">
        <h2 style="margin:0 0 12px">Thanks, we received your request</h2>
        <p>Hi ${naam || "there"}, we received your trade-in request.</p>
        <p>${regel("Device", toestel)}${regel("Estimate", schatting)}<b>Payout:</b> ${tegoed ? "store credit" : "to your bank account"}</p>
        <p>You will hear from us within one working day with the fixed price. After that you bring the device to our shop in Rijen or send it in for free. Turn off Find My or your Google account so we can take it over right away.</p>
        <p>The estimate is based on your answers. We confirm the final price after a quick check. No obligation.</p>
        <p>Kind regards,<br>Refuro</p>
      </div>`
    : `<div style="font-family:system-ui,Arial,sans-serif;color:#1B2254;line-height:1.55">
        <h2 style="margin:0 0 12px">Bedankt, we hebben je aanvraag</h2>
        <p>Hoi ${naam || "daar"}, we hebben je inruilaanvraag goed ontvangen.</p>
        <p>${regel("Toestel", toestel)}${regel("Richtprijs", schatting)}<b>Uitbetaling:</b> ${tegoed ? "winkeltegoed" : "op je rekening"}</p>
        <p>Je hoort binnen één werkdag van ons met de vaste prijs. Daarna breng je het toestel langs in Rijen of stuur je het gratis op. Zet alvast Zoek mijn of je Google-account uit, dan kunnen we het meteen overnemen.</p>
        <p>De richtprijs is een schatting op basis van je antwoorden. De definitieve prijs bevestigen we na een korte controle. Zonder verplichting.</p>
        <p>Groeten,<br>Refuro</p>
      </div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: van, to: [naar], reply_to: antwoord, subject: onderwerp, html }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  // Gedeeld secret is optioneel. Staat het geconfigureerd, dan moet de webshop
  // het meesturen; het is een drempel tegen blinde bots, geen echte auth.
  const secret = Deno.env.get("INRUIL_SECRET");
  if (secret && req.headers.get("x-inruil-secret") !== secret) return fout("Ongeldig", 401);

  let lijf: Record<string, unknown>;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }

  // Honeypot: een veld dat een mens nooit invult. Gevuld = bot -> doe alsof het
  // lukte (200), maar sla niets op.
  if (knip(lijf["bedrijf"], 100)) return new Response(JSON.stringify({ ok: true }), { headers: cors });

  const naam = knip(lijf["naam"], 120);
  const email = knip(lijf["email"], 200);
  const telefoon = knip(lijf["telefoon"], 40);
  const toestel = knip(lijf["toestel"], 200);
  if (!naam || !/.+@.+\..+/.test(email) || !telefoon || !toestel) {
    return fout("Vul je naam, e-mailadres, telefoonnummer en toestel in.");
  }

  // Soft rate-limit: max 3 aanvragen per e-mail per 10 minuten.
  const sinds = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin.from("webshop_inruil_aanvragen")
    .select("id", { count: "exact", head: true })
    .eq("team_id", TEAM).eq("email", email).gte("aangemaakt_op", sinds);
  if ((count ?? 0) >= 3) return fout("Je hebt net al een aanvraag gestuurd. Probeer het straks nog eens.", 429);

  const rij = {
    team_id: TEAM,
    toestel,
    schatting: knip(lijf["schatting"], 60),
    accu: knip(lijf["accu"], 40) || null,
    naam,
    email,
    telefoon,
    adres: knip(lijf["adres"], 300),
    iban: knip(lijf["iban"], 40),
    nieuwsbrief: lijf["nieuwsbrief"] === true || lijf["nieuwsbrief"] === "ja",
    ruwe_json: {
      onderwerp: "Inleveraanvraag (inruil)",
      postcode: knip(lijf["postcode"], 12),
      huisnr: knip(lijf["huisnr"], 12),
      toevoeging: knip(lijf["toevoeging"], 12),
      straat: knip(lijf["straat"], 120),
      plaats: knip(lijf["plaats"], 120),
      akkoord: lijf["akkoord"] === true,
      uitbetaling: knip(lijf["uitbetaling"], 20) === "tegoed" ? "tegoed" : "contant",
      ip: req.headers.get("x-forwarded-for") || "",
      ua: req.headers.get("user-agent") || "",
    },
  };

  const { error } = await admin.from("webshop_inruil_aanvragen").insert(rij);
  if (error) return fout("Opslaan mislukte, probeer het zo nog eens.", 500);

  // Notificatie mag het antwoord niet ophouden; een mailfout is geen 500. Twee
  // mails: eentje naar de winkel, eentje als bevestiging naar de klant zelf.
  const taal = knip(lijf["taal"], 5).toLowerCase().startsWith("en") ? "en" : "nl";
  try { EdgeRuntime.waitUntil(mail(rij)); } catch { /* geen waitUntil beschikbaar: laat lopen */ }
  try { EdgeRuntime.waitUntil(klantMail(rij, taal)); } catch { /* laat lopen */ }

  return new Response(JSON.stringify({ ok: true }), { headers: cors });
});
