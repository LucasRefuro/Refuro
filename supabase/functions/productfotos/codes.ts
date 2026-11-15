// Hulpjes voor laptopfoto's via een opgezochte artikelcode. Apart van index.ts zodat de test ze
// zonder Deno en zonder Claude kan laden (tests/laptop-toevoegen.js).
//
// Het probleem: Icecat vindt een laptop alleen op de artikelcode van de fabrikant, niet op de
// modelnaam. Zoekt Claude die codes op het web op, dan kan er een tussen zitten van een ander model
// (een andere generatie, een broertje uit dezelfde serie). Dan staan er foto's van een andere laptop
// op de advertentie. Daarom kijken we wat Icecat zelf zegt dat het is (de titel) en nemen we hem
// alleen als die bij de modelnaam past.

function plat(s: unknown): string {
  return " " + String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
}

// Past de titel van Icecat bij deze modelnaam?
//   Elk stuk met een cijfer erin ("v320", "840", "e15", "5420") is een kenmerk. Minstens één daarvan
//   moet in de titel staan.
//   Een generatie ("G10", "Gen 2") moet er precies zo in staan: een EliteBook 840 G8 is een andere
//   laptop dan een 840 G10, ook al lijken de namen op elkaar.
//   Een modelnaam zonder cijfers kunnen we niet controleren; dan liever geen foto's.
export function titelPastBij(titel: unknown, model: unknown): boolean {
  const t = plat(titel);
  const m = plat(model);
  const generaties: string[] = [];
  m.replace(/ gen (\d+) /g, (_x, n) => { generaties.push(n); return " "; });
  m.replace(/ g(\d+) /g, (_x, n) => { generaties.push(n); return " "; });
  const kenmerken = m.trim().split(" ")
    .filter((x) => /\d/.test(x) && x.length >= 2 && !/^g\d+$/.test(x));
  if (!kenmerken.length && !generaties.length) return false;
  const genOk = generaties.every((n) => t.includes(" g" + n + " ") || t.includes(" gen " + n + " ") || t.includes(" gen" + n + " "));
  const vast = t.replace(/ /g, "");
  const kenOk = !kenmerken.length || kenmerken.some((k) => t.includes(" " + k + " ") || vast.includes(k));
  return genOk && kenOk;
}

// Wat Claude als artikelcodes teruggeeft, schoon: letters en cijfers met hooguit - . / # erin,
// 4 tot 25 tekens, uniek (hoofdletters tellen niet), hooguit vijf.
export function schoneCodes(lijst: unknown): string[] {
  const uit: string[] = [];
  for (const r of Array.isArray(lijst) ? lijst : []) {
    const ruw = String((r && typeof r === "object") ? (r as any).code : r ?? "").trim();
    // Een paar spaties mag ("81AH 0011 MH"), een zin is geen code.
    if ((ruw.match(/\s+/g) || []).length > 2) continue;
    const c = ruw.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9][A-Za-z0-9#./-]{2,23}[A-Za-z0-9]$/.test(c)) continue;
    if (!/\d/.test(c)) continue;
    if (uit.some((x) => x.toUpperCase() === c.toUpperCase())) continue;
    uit.push(c);
    if (uit.length >= 5) break;
  }
  return uit;
}

// Het model in de modellenlijst (hardware_modellen) bij wat er getypt is. De lijst schrijft de
// nette naam ("ThinkPad Yoga 370"), de winkel typt soms meer ("Thinkpad yoga 370 tp00078b"). Eerst
// precies (zonder hoofdletters, spaties en streepjes); anders de langste naam uit de lijst die in het
// getypte staat. Die moet een cijfer hebben en minstens vier tekens, anders past "yoga" op elke Yoga.
function vlak(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
export function kiesModelRij<T extends { model: string }>(rijen: T[], model: unknown): T | null {
  const doel = vlak(model);
  if (!doel) return null;
  const precies = rijen.find((r) => vlak(r.model) === doel);
  if (precies) return precies;
  const binnen = rijen
    .filter((r) => { const v = vlak(r.model); return v.length >= 4 && /\d/.test(v) && doel.includes(v); })
    .sort((a, b) => vlak(b.model).length - vlak(a.model).length);
  return binnen[0] || null;
}
