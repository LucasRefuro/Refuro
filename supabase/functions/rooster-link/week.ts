// Rekenen met weken voor de rooster-links. Geen Deno-imports, zodat tests/rooster-link.js
// dit in Node kan laden.
//
// Alles op 'YYYY-MM-DD'-tekst en UTC-rekenen, nooit lokale Date-tijden: de server draait in
// UTC en de winkel in Nederland. Rond middernacht gaf lokaal rekenen anders net de verkeerde
// dag, en dan stond het rooster een dag verschoven.

// Vandaag in Nederland, als 'YYYY-MM-DD'.
export function vandaagNL(nu: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(nu);
}

function alsUTC(ymd: string): Date {
  const [j, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, d));
}
function naarYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function plusDagen(ymd: string, n: number): string {
  const d = alsUTC(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return naarYmd(d);
}

// De maandag van de week waar deze dag in valt.
export function maandagVan(ymd: string): string {
  const dag = (alsUTC(ymd).getUTCDay() + 6) % 7;   // maandag = 0
  return plusDagen(ymd, -dag);
}

// De week waar de beschikbaarheid-link over gaat: altijd de volgende week. Je stuurt hem op
// zaterdag in de groep voor de week die maandag begint; ook op maandag zelf gaat hij nog
// over de week erna, want de lopende week is dan al ingepland.
export function komendeMaandag(vandaag: string): string {
  return plusDagen(maandagVan(vandaag), 7);
}

export function weekDagen(maandag: string): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => plusDagen(maandag, i));
}

const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;

// Wat een medewerker doorgeeft, gecontroleerd: alleen dagen uit deze week, kan/kan niet als
// echte ja of nee, en tijden alleen als ze kloppen (anders leeg = de hele dag). Wat niet
// klopt valt weg in plaats van de hele inzending te weigeren.
export function schoneDagen(dagen: unknown, maandag: string) {
  const week = new Set(weekDagen(maandag));
  const uit: { datum: string; beschikbaar: boolean; van: string | null; tot: string | null }[] = [];
  for (const d of (Array.isArray(dagen) ? dagen : [])) {
    const datum = String((d as any)?.datum || "");
    if (!week.has(datum) || uit.some((x) => x.datum === datum)) continue;
    const beschikbaar = (d as any)?.beschikbaar === true;
    const van = beschikbaar && TIJD.test(String((d as any)?.van || "")) ? String((d as any).van) : null;
    const tot = beschikbaar && TIJD.test(String((d as any)?.tot || "")) ? String((d as any).tot) : null;
    uit.push({ datum, beschikbaar, van, tot });
  }
  return uit;
}

// Een link-token is 32 hexadecimale tekens (een uuid zonder streepjes). Alles anders is geen
// token; dat controleren we voordat het in een databasevraag komt.
export function geldigToken(t: unknown): boolean {
  return /^[a-f0-9]{32}$/.test(String(t || ""));
}
