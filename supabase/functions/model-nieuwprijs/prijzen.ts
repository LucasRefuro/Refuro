// De rekenhulpjes van model-nieuwprijs, apart van de functie zelf zodat de test ze zonder
// Deno en zonder Claude kan laden (tests/nieuwprijs.js).

// "128 GB", "128GB", "1 tb" wordt "128GB" en "1TB": zo staat de opslag in model_nieuwprijzen.
// De modellenlijst schrijft "128 GB", een getypt toestel soms "128gb". Leeg als er geen maat in staat.
export function normOpslag(s: unknown): string {
  const m = String(s ?? "").match(/(\d+(?:[.,]\d+)?)\s*(GB|TB)\b/i);
  return m ? m[1].replace(",", ".") + m[2].toUpperCase() : "";
}

// Hoeveel GB, om de maten te kunnen vergelijken (1TB is meer dan 512GB).
function inGB(opslag: string): number {
  const m = opslag.match(/^([\d.]+)(GB|TB)$/);
  return m ? Number(m[1]) * (m[2] === "TB" ? 1024 : 1) : 0;
}

// Wat Claude teruggeeft, schoon. Een verkeerde nieuwprijs op een prijskaartje is misleidend,
// dus liever een maat te weinig dan een gok:
//   alleen opslag die het model heeft en die we vroegen
//   een heel bedrag tussen 100 en 4000 euro (daarbuiten is het een leesfout: dollars, centen,
//   een abonnement per maand)
//   met de link van de bron erbij
//   en meer opslag kost meer. Klopt dat niet, dan heeft hij twee lijsten door elkaar gehaald
//   (bijvoorbeeld de Plus en de gewone), en dan nemen we niets.
export function schonePrijzen(lijst: unknown, gevraagd: string[]) {
  const mag = new Set(gevraagd.map(normOpslag).filter(Boolean));
  const uit: { opslag: string; prijs: number; bron_url: string }[] = [];
  for (const r of Array.isArray(lijst) ? lijst : []) {
    const opslag = normOpslag((r as any)?.opslag);
    const prijs = Math.round(Number((r as any)?.prijs));
    const url = String((r as any)?.bron_url ?? "").trim();
    if (!mag.has(opslag) || uit.some((x) => x.opslag === opslag)) continue;
    if (!Number.isFinite(prijs) || prijs < 100 || prijs > 4000) continue;
    if (!/^https?:\/\/\S+$/i.test(url)) continue;
    uit.push({ opslag, prijs, bron_url: url.slice(0, 500) });
  }
  uit.sort((a, b) => inGB(a.opslag) - inGB(b.opslag));
  for (let i = 1; i < uit.length; i++) {
    if (uit[i].prijs <= uit[i - 1].prijs) return [];
  }
  return uit;
}

// ── Laptops en desktops ──
// De nieuwprijs van een laptop hangt af van de uitvoering: een EliteBook 840 G10 met een i5 en
// 8 GB kostte iets anders dan met een i7 en 32 GB. De sleutel van een uitvoering is daarom
// processor, geheugen en opslag, zo geschreven dat "Intel Core i5-1335U" en "i5-1335U" hetzelfde
// zijn, en "16 GB DDR5" en "16GB" ook. Het scherm telt niet mee: dat scheelt meestal weinig, en
// anders vinden we bijna nooit een prijs. De winkelapp heeft precies dezelfde rekenregel
// (nwlSleutel); tests/laptop-toevoegen.js legt ze naast elkaar.
export function laptopProcessor(s: unknown): string {
  return String(s ?? "").toLowerCase()
    .replace(/®|™|\((?:r|tm)\)/g, " ")
    .replace(/\b(intel|amd|apple|qualcomm|core|processor)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function uitvoeringSleutel(processor: unknown, geheugen: unknown, opslag: unknown): string {
  const p = laptopProcessor(processor), g = normOpslag(geheugen), o = normOpslag(opslag);
  return p && g && o ? p + "|" + g + "|" + o : "";
}

// Wat Claude voor één uitvoering teruggeeft, schoon: alleen als hij hem echt zag, een heel bedrag
// tussen 150 en 8000 euro (daarbuiten is het een leesfout), met de link van de bron.
export function schoneLaptopPrijs(r: unknown): { prijs: number; bron_url: string } | null {
  if (!r || (r as any).gevonden !== true) return null;
  const prijs = Math.round(Number((r as any).prijs));
  const url = String((r as any).bron_url ?? "").trim();
  if (!Number.isFinite(prijs) || prijs < 150 || prijs > 8000) return null;
  if (!/^https?:\/\/\S+$/i.test(url)) return null;
  return { prijs, bron_url: url.slice(0, 500) };
}
