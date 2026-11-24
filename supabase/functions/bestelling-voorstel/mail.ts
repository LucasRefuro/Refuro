// De mail aan een webshopklant waarvan het toestel er niet meer is: sorry, en een paar toestellen
// die erop lijken, in de stijl van Refuro (navy, oranje knop, lichtblauw).
//
// Een eigen bestand zonder Deno-imports, zodat tests/bestelling-niet-op-voorraad.js de mail kan
// opbouwen en nalopen. De browser stuurt alleen id's en een korte tekst; de mail zelf bouwen we
// hier, zodat niemand via Storvo willekeurige html uit naam van Refuro kan versturen.
//
// Mailprogramma's zijn streng: alleen tabellen en inline stijl, geen svg (Gmail laat hem weg),
// geen webfont. Het logo is daarom een png op storvo.app.

export type VoorstelToestel = {
  code?: string | null;
  merk?: string | null;
  model?: string | null;
  categorie?: string | null;
  staat?: string | null;
  accu?: number | null;
  specs?: Record<string, unknown> | null;
  prijs?: number | null;
  url?: string | null;
  foto?: string | null;
};

export type VoorstelInvoer = {
  nummer: string;            // "#1032"
  naam?: string | null;      // voornaam van de klant, mag leeg
  tekst: string;             // wat de winkelier zelf schreef (platte tekst)
  besteld: string;           // "HP EliteBook 840 G8"
  toestellen: VoorstelToestel[];
  logo: string;              // url van het logo (png)
};

const NAVY = "#1B2254";
const ORANJE = "#E8421A";
const LUCHT = "#D6E8F5";
const LUCHT_ZACHT = "#EDF5FB";
const GRIJS = "#4A5079";

/* Dezelfde namen als op de webshop (GRADE_NAAM in _gedeeld/shopify.ts). */
export const GRADE_NAAM: Record<string, string> = { A: "Uitstekend", B: "Zeer goed", C: "Prima", N: "Nieuw" };

const EIGEN_NAAM = /^(iphone|ipad|ipod|macbook|imac|mac\s?mini|mac\s?studio|mac\s?pro|apple\s?watch|airpods|galaxy|pixel)\b/i;
/* Zoals toestelTitel in de winkelapp: "iPhone 13" en "Galaxy S24" zonder merk ervoor. */
export function titel(merk: unknown, model: unknown) {
  const mk = String(merk ?? "").trim().replace(/\s+/g, " ");
  let md = String(model ?? "").trim().replace(/\s+/g, " ");
  if (mk && md.toLowerCase().startsWith(mk.toLowerCase() + " ")) md = md.slice(mk.length + 1).trim();
  if (!md) return mk;
  return EIGEN_NAAM.test(md) ? md : (mk ? mk + " " + md : md);
}

export function veilig(x: unknown) {
  return String(x ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function euro(n: unknown) {
  const x = Number(n);
  if (!isFinite(x) || x <= 0) return "";
  const heel = Math.round(x * 100) % 100 === 0;
  return "€ " + x.toLocaleString("nl-NL", { minimumFractionDigits: heel ? 0 : 2, maximumFractionDigits: 2 }) + (heel ? ",-" : "");
}
/* Alleen een gewone webadres mag een knop worden; al het andere (javascript:, data:) valt weg. */
function webadres(u: unknown) {
  const s = String(u ?? "").trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : "";
}

/* Twee korte regels specs, zoals op het prijskaartje: wat een koper als eerste wil weten. */
export function specRegels(t: VoorstelToestel): string[] {
  const sp = (t.specs && typeof t.specs === "object") ? t.specs as Record<string, unknown> : {};
  const w = (k: string) => String(sp[k] ?? "").trim();
  const cat = String(t.categorie || "");
  const regels: string[] = [];
  if (/telefoon|tablet/i.test(cat)) {
    const r = [w("Opslag"), w("Kleur")].filter(Boolean).join(" · ");
    if (r) regels.push(r);
  } else {
    const r = [w("Processor") || w("Chip"), w("Geheugen") ? w("Geheugen") + " geheugen" : "", w("Opslag")].filter(Boolean).join(" · ");
    if (r) regels.push(r);
    const touch = /^(ja|1|true|waar)$/i.test(w("Touchscreen"));
    const r2 = [w("Scherm"), touch ? "Touchscreen" : "", w("Kleur")].filter(Boolean).join(" · ");
    if (r2) regels.push(r2);
  }
  const staat = String(t.staat || "").toUpperCase();
  const accu = Number(t.accu);
  if (staat !== "N" && isFinite(accu) && accu > 0) regels.push("Accu " + Math.round(accu) + "%");
  return regels;
}

function kaart(t: VoorstelToestel) {
  const naam = titel(t.merk, t.model);
  const staat = String(t.staat || "").toUpperCase();
  const grade = GRADE_NAAM[staat] || "";
  const url = webadres(t.url);
  const foto = webadres(t.foto);
  const prijs = euro(t.prijs);
  const specs = specRegels(t).map((r) => `<div style="font-size:14px;line-height:1.5;color:${GRIJS}">${veilig(r)}</div>`).join("");
  const knop = url
    ? `<a href="${veilig(url)}" style="display:inline-block;background:${ORANJE};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:11px 20px;border-radius:999px">Bekijk dit toestel</a>`
    : `<div style="font-size:14px;color:${GRIJS}">Interesse? Antwoord op deze mail.</div>`;
  return `
  <tr><td style="padding:0 0 14px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LUCHT};border-radius:16px;border-collapse:separate">
      <tr>
        ${foto ? `<td width="132" valign="top" style="padding:16px 0 16px 16px">
          <img src="${veilig(foto)}" width="116" alt="${veilig(naam)}" style="display:block;width:116px;height:auto;border-radius:10px;background:#ffffff">
        </td>` : ""}
        <td valign="top" style="padding:16px">
          <div style="font-size:17px;font-weight:700;color:${NAVY};line-height:1.3">${veilig(naam)}</div>
          ${grade ? `<div style="margin:6px 0 8px"><span style="display:inline-block;background:${LUCHT};color:${NAVY};font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px">${veilig(grade)}</span></div>` : ""}
          ${specs}
          ${prijs ? `<div style="font-size:21px;font-weight:800;color:${NAVY};margin:10px 0 12px">${veilig(prijs)}</div>` : `<div style="height:12px"></div>`}
          ${knop}
        </td>
      </tr>
    </table>
  </td></tr>`;
}

export function voorstelMail(o: VoorstelInvoer) {
  const nummer = String(o.nummer || "").trim();
  const naam = String(o.naam || "").trim().split(/\s+/)[0] || "";
  const onderwerp = `Sorry, we hebben een fout gemaakt met je bestelling ${nummer}`.replace(/\s+/g, " ").trim();
  const alineas = String(o.tekst || "").trim().split(/\n\s*\n/).map((a) => a.trim()).filter(Boolean)
    .map((a) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${NAVY}">${veilig(a).replace(/\n/g, "<br>")}</p>`).join("");
  const kaarten = (o.toestellen || []).map(kaart).join("");
  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${veilig(onderwerp)}</title></head>
<body style="margin:0;padding:0;background:${LUCHT_ZACHT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LUCHT_ZACHT}">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;font-family:Arial,Helvetica,sans-serif">
      <tr><td style="padding:28px 28px 8px">
        <img src="${veilig(webadres(o.logo))}" width="150" height="28" alt="Refuro" style="display:block;width:150px;height:28px;border:0">
      </td></tr>
      <tr><td style="padding:16px 28px 4px">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${NAVY}">Sorry, dit hebben we fout gedaan</h1>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${NAVY}">Hoi${naam ? " " + veilig(naam) : ""},</p>
        ${alineas}
      </td></tr>
      ${kaarten ? `<tr><td style="padding:8px 28px 4px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${kaarten}</table>
      </td></tr>` : ""}
      <tr><td style="padding:8px 28px 28px">
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${NAVY}">Liever je geld terug? Antwoord op deze mail, dan storten we het hele bedrag terug.</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:${NAVY}">Nogmaals sorry,<br><b>Refuro</b></p>
      </td></tr>
      <tr><td style="padding:16px 28px;background:${NAVY};border-radius:0 0 20px 20px;color:#ffffff;font-size:13px;line-height:1.5">
        Refurbished telefoons en laptops met garantie | <a href="https://refuro.nl" style="color:#ffffff">refuro.nl</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  /* Een tekstversie erbij: sommige mailprogramma's tonen geen html, en spamfilters vertrouwen
     een mail met alleen html minder. */
  const tekst = [
    `Hoi${naam ? " " + naam : ""},`, "",
    String(o.tekst || "").trim(), "",
    ...(o.toestellen || []).flatMap((t) => {
      const g = GRADE_NAAM[String(t.staat || "").toUpperCase()];
      return [titel(t.merk, t.model) + (g ? " (" + g + ")" : ""), ...specRegels(t), euro(t.prijs), webadres(t.url)]
        .filter(Boolean).concat("");
    }),
    "Liever je geld terug? Antwoord op deze mail, dan storten we het hele bedrag terug.", "",
    "Nogmaals sorry,", "Refuro", "https://refuro.nl",
  ].join("\n");
  return { onderwerp, html, tekst };
}
