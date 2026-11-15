// Inruil-aanvraag vanuit de refuro.nl-webshop. Verving het Shopify
// contactformulier, dat op hCaptcha vastliep ("Missing CAPTCHA token").
//
// Publiek endpoint (geen inlog): de webshop is statisch en publiek leesbaar,
// dus een gedeeld secret in de themabron is geen echte auth. De bescherming is
// de combinatie: server-side validatie, een honeypot, een soft rate-limit per
// e-mail, en het feit dat er niets gevoeligs terugkomt -- de functie schrijft
// alleen weg en seint de winkel. Zie de valkuil in de repo: nooit terug naar
// Shopify's contactform met f.submit(), dat is juist de reden van de vastloper.
//
// GET geeft de inruilprijzen (tabel inruil_prijzen, ingevuld in Storvo onder Inruil en
// inname > Inruilprijzen). De webshop rekent daarmee de prijs uit terwijl de klant de vragen
// beantwoordt. Bij een POST rekenen we de prijs hier opnieuw uit uit dezelfde tabel en slaan
// we die op: wat de browser meestuurt is maar een tekst die iedereen kan aanpassen.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Eén winkel (Storvo/Refuro). Bij een tweede winkel: verhuis de tenant-selectie
// naar een pad-geheim in winkel_koppelingen (zie shopify-webhook).
const TEAM = Deno.env.get("INRUIL_TEAM_ID") || "ce975142-a7d9-4fb2-9cb5-9cc1fe1d7f65";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("INRUIL_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "content-type, x-inruil-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
// Alles wat de klant intypt gaat de mail in; zonder escapen kan iemand er opmaak of links in zetten.
function h(x: unknown) {
  return String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

// De vijf staten, in de volgorde van de vragen op de webshop en de kolommen in Storvo.
const STATEN = ["nieuw", "goed", "gebruikt", "kapot", "dood"];
const STAAT_NAAM: Record<string, string> = {
  nieuw: "Als nieuw", goed: "Goed", gebruikt: "Gebruikt", kapot: "Er is iets kapot", dood: "Gaat niet meer aan",
};
const KOLOMMEN = "soort,merk,model,opslag,prijs_nieuw,prijs_goed,prijs_gebruikt,prijs_kapot,prijs_dood,volgorde";
type PrijsRij = Record<string, unknown>;
const euro = (n: number) => "\u20ac" + n.toLocaleString("nl-NL");

// De prijslijst voor de webshop: alleen actieve regels van deze winkel, compact (p = de vijf
// staten in vaste volgorde, null = geen bedrag). Twee minuten cache, zodat niet elke bezoeker
// de database raakt; een nieuwe prijs in Storvo staat er dus binnen een paar minuten.
async function prijslijst() {
  const { data, error } = await admin.from("inruil_prijzen").select(KOLOMMEN)
    .eq("team_id", TEAM).eq("actief", true).order("volgorde").limit(1000);
  if (error) return fout("De prijzen laden lukte niet.", 500);
  const modellen = (data || []).map((r: PrijsRij) => ({
    s: r.soort, m: r.merk, n: r.model, o: r.opslag,
    p: STATEN.map((st) => (r["prijs_" + st] as number | null) ?? null),
  }));
  return new Response(JSON.stringify({ ok: true, staten: STATEN, modellen }), {
    headers: { ...cors, "Cache-Control": "public, max-age=120" },
  });
}

// De prijs bij een aanvraag, uit de tabel. Opslag onbekend = de laagste tot de hoogste van dat
// model in die staat. Niets gevonden of geen bedrag: null, dan bewaren we de tekst van de klant
// niet als prijs maar "op aanvraag".
async function lijstprijs(soort: string, merk: string, model: string, opslag: string, staat: string) {
  if (!soort || !model || !STATEN.includes(staat)) return null;
  let q = admin.from("inruil_prijzen").select("opslag,prijs_" + staat)
    .eq("team_id", TEAM).eq("actief", true).eq("soort", soort).eq("model", model);
  if (merk) q = q.eq("merk", merk);
  const { data } = await q;
  const rijen = (data || []) as PrijsRij[];
  if (!rijen.length) return null;
  const deze = opslag ? rijen.filter((r) => r.opslag === opslag) : rijen;
  const bedragen = (deze.length ? deze : rijen)
    .map((r) => r["prijs_" + staat] as number | null)
    .filter((n): n is number => typeof n === "number" && n > 0);
  if (!bedragen.length) return { laag: null, hoog: null };
  return { laag: Math.min(...bedragen), hoog: Math.max(...bedragen) };
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
  const r = (k: string) => h(rij[k] ?? "-");
  const rj = (rij.ruwe_json ?? {}) as Record<string, unknown>;
  const uitLabel = rj.uitbetaling === "tegoed" ? "Winkeltegoed" : "Op rekening (IBAN)";
  const inlever = rj.inleveren === "winkel" ? "Brengt hem langs in de winkel" : "Stuurt hem op";
  const html = `
    <h2 style="margin:0 0 12px">Nieuwe inruilaanvraag</h2>
    <p><b>Toestel:</b> ${r("toestel")}<br>
       <b>Richtprijs:</b> ${r("schatting")}<br>
       ${rj.staat_naam ? `<b>Staat:</b> ${h(rj.staat_naam)}<br>` : ""}
       ${rj.kapot ? `<b>Wat is er kapot:</b> ${h(rj.kapot)}<br>` : ""}
       <b>Inleveren:</b> ${inlever}</p>
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
      subject: `Inruilaanvraag - ${String(rij.toestel ?? "").slice(0, 120)}`,
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
  const naam = h(String(rij.naam || "").split(" ")[0]);
  const toestel = h(rij.toestel || "");
  const schatting = h(rij.schatting || "");
  const winkel = rj.inleveren === "winkel";
  const regel = (label: string, waarde: string) => waarde ? `<b>${label}:</b> ${waarde}<br>` : "";

  const onderwerp = en ? "We received your trade-in request" : "We hebben je inruilaanvraag ontvangen";
  const html = en
    ? `<div style="font-family:system-ui,Arial,sans-serif;color:#1B2254;line-height:1.55">
        <h2 style="margin:0 0 12px">Thanks, we received your request</h2>
        <p>Hi ${naam || "there"}, we received your trade-in request.</p>
        <p>${regel("Device", toestel)}${regel("Estimate", schatting)}<b>Payout:</b> ${tegoed ? "store credit" : "to your bank account"}</p>
        <p>${winkel
          ? "Bring the device to our shop in Rijen. We check it with you and confirm the price."
          : "You will hear from us within one working day with the fixed price and how to send the device to us for free."} Turn off Find My or your Google account so we can take it over right away.</p>
        <p>The estimate is based on your answers. We confirm the final price after a quick check. No obligation.</p>
        <p>Kind regards,<br>Refuro</p>
      </div>`
    : `<div style="font-family:system-ui,Arial,sans-serif;color:#1B2254;line-height:1.55">
        <h2 style="margin:0 0 12px">Bedankt, we hebben je aanvraag</h2>
        <p>Hoi ${naam || "daar"}, we hebben je inruilaanvraag goed ontvangen.</p>
        <p>${regel("Toestel", toestel)}${regel("Richtprijs", schatting)}<b>Uitbetaling:</b> ${tegoed ? "winkeltegoed" : "op je rekening"}</p>
        <p>${winkel
          ? "Breng het toestel langs in onze winkel in Rijen. We kijken het samen met je na en bevestigen dan de prijs."
          : "Je hoort binnen één werkdag van ons met de vaste prijs en hoe je het toestel gratis opstuurt."} Zet alvast Zoek mijn of je Google-account uit, dan kunnen we het meteen overnemen.</p>
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
  if (req.method === "GET") return prijslijst();
  if (req.method !== "POST") return fout("Alleen GET en POST", 405);

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

  // De prijs uit de tabel. Vindt de server het model, dan wint zijn bedrag; anders bewaren we
  // wat de webshop liet zien (een oude pagina of een model dat net uit de lijst ging).
  const soort = knip(lijf["soort"], 20), merk = knip(lijf["merk"], 60), model = knip(lijf["model"], 120);
  const opslag = knip(lijf["opslag"], 12), staat = knip(lijf["staat"], 12);
  const lp = await lijstprijs(soort, merk, model, opslag, staat);
  let schatting = knip(lijf["schatting"], 60);
  if (lp && lp.laag != null && lp.hoog != null) {
    schatting = lp.laag === lp.hoog ? euro(lp.laag) : euro(lp.laag) + " tot " + euro(lp.hoog);
  } else if (lp) schatting = "Op aanvraag";

  const rij = {
    team_id: TEAM,
    toestel,
    schatting,
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
      inleveren: knip(lijf["inleveren"], 12) === "winkel" ? "winkel" : "opsturen",
      soort, merk, model, opslag,
      staat: STATEN.includes(staat) ? staat : "",
      staat_naam: STAAT_NAAM[staat] || "",
      kapot: knip(lijf["kapot"], 400),
      lijstprijs: lp,
      schatting_webshop: knip(lijf["schatting"], 60),
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
