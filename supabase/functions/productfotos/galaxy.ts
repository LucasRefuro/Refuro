// Van "Galaxy S23, groen" naar de productcodes waarop Icecat een Samsung kent.
//
// Waarom dit bestaat: Samsung zet zijn telefoons in de gratis Icecat, met vijf tot
// negen fabrieksfoto's per toestel. Maar Icecat zoekt alleen op de volle
// fabriekscode (SM-S911BZGDEUB), niet op "Galaxy S23" en ook niet op het kale
// modelnummer SM-S911B. Een winkel typt de naam, niet de code. Die code is wel
// voorspelbaar opgebouwd:
//
//   SM-S911B   het modelnummer (staat ook in Instellingen > Over de telefoon)
//   ZG         de kleur (ZK zwart, ZG groen, ZE crème, ...)
//   D          de uitvoering (opslag, per serie een andere letter)
//   EUB        het land: EUB is Benelux, EEB de zakelijke Benelux-versie,
//              PHN Nederland bij de oudere toestellen
//
// We maken dus zelf de kandidaten en laten Icecat zeggen welke bestaat. Een treffer
// is per definitie het goede model, want het modelnummer zit vooraan in de code.
// Het risico zit alleen in de lijst hieronder (naam naar modelnummer); die is op
// 2 nov 2026 nagelopen tegen Icecat zelf. Het gros staat erin, van de S10 tot de S25,
// Note, Fold en Flip en de meeste A-modellen. Een paar (A40, A50, A71, de 5G-varianten
// van A22 en A32) vonden we niet; die geven gewoon "niet gevonden" en dan vult de
// winkel ze zelf.
//
// Geen Deno-imports hier, zodat tests/productfotos-telefoon.js dit bestand gewoon met
// node kan laden.

// Naam (zoals galaxySleutel hem maakt) naar het Europese modelnummer.
export const GALAXY_MODELLEN: Record<string, string> = {
  // S-serie
  "s10e": "SM-G970F", "s10": "SM-G973F", "s10+": "SM-G975F", "s10lite": "SM-G770F",
  "s20": "SM-G980F", "s205g": "SM-G981B", "s20+": "SM-G985F", "s20+5g": "SM-G986B",
  "s20ultra": "SM-G988B", "s20fe": "SM-G780F", "s20fe5g": "SM-G781B",
  "s21": "SM-G991B", "s21+": "SM-G996B", "s21ultra": "SM-G998B", "s21fe": "SM-G990B",
  "s22": "SM-S901B", "s22+": "SM-S906B", "s22ultra": "SM-S908B",
  "s23": "SM-S911B", "s23+": "SM-S916B", "s23ultra": "SM-S918B", "s23fe": "SM-S711B",
  "s24": "SM-S921B", "s24+": "SM-S926B", "s24ultra": "SM-S928B", "s24fe": "SM-S721B",
  "s25": "SM-S931B", "s25+": "SM-S936B", "s25ultra": "SM-S938B", "s25edge": "SM-S937B",
  "s25fe": "SM-S731B",
  // Note
  "note10": "SM-N970F", "note10+": "SM-N975F", "note10lite": "SM-N770F",
  "note20": "SM-N980F", "note205g": "SM-N981B", "note20ultra": "SM-N986B",
  // Z (vouwtelefoons)
  "flip3": "SM-F711B", "flip4": "SM-F721B", "flip5": "SM-F731B", "flip6": "SM-F741B",
  "flip7": "SM-F766B", "flip7fe": "SM-F761B",
  "fold3": "SM-F926B", "fold4": "SM-F936B", "fold5": "SM-F946B", "fold6": "SM-F956B",
  "fold7": "SM-F966B",
  // A-serie
  "a40": "SM-A405FN", "a50": "SM-A505FN", "a51": "SM-A515F", "a71": "SM-A715F",
  "a12": "SM-A125F", "a22": "SM-A225F", "a225g": "SM-A226B",
  "a32": "SM-A325F", "a325g": "SM-A326B", "a42": "SM-A426B",
  "a52": "SM-A525F", "a525g": "SM-A526B", "a52s": "SM-A528B", "a72": "SM-A725F",
  "a13": "SM-A135F", "a135g": "SM-A136B", "a23": "SM-A235F", "a235g": "SM-A236B",
  "a33": "SM-A336B", "a53": "SM-A536B",
  "a14": "SM-A145R", "a145g": "SM-A146P", "a24": "SM-A245F", "a34": "SM-A346B", "a54": "SM-A546B",
  "a15": "SM-A155F", "a155g": "SM-A156B", "a25": "SM-A256B", "a35": "SM-A356B", "a55": "SM-A556B",
  "a16": "SM-A165F", "a165g": "SM-A166B", "a26": "SM-A266B", "a36": "SM-A366B", "a56": "SM-A566B",
  // XCover
  "xcover5": "SM-G525F", "xcover6pro": "SM-G736B", "xcover7": "SM-G556B",
};

// Kleurwoord (Nederlands of de Engelse marketingnaam) naar Samsungs kleurcodes. Een
// kleur heeft er soms meer dan één: de A-serie gebruikt L-codes (LV, LG, LB) waar
// de S-serie Z-codes heeft. De volgorde is de kans: de gangbaarste eerst.
// Zwart probeert ook ZA (donkergrijs): de S20, S21 en S21 FE bestaan niet in ZK, hun
// donkerste kleur heet Phantom Gray of Graphite, en die noemt iedereen gewoon zwart.
const KLEUR_CODES: [RegExp, string[]][] = [
  [/zwart|black|graphite|grafiet|onyx|midnight|middernacht|phantom ?black|antraciet/, ["ZK", "ZA"]],
  [/grijs|gray|grey|titanium|marble|graniet/, ["ZA", "ZT"]],
  [/wit|white/, ["ZW"]],
  [/zilver|silver/, ["ZS"]],
  [/blauw|blue|navy|cobalt|kobalt|icy/, ["ZB", "DB", "LB"]],
  [/groen|green|mint|lime|olijf|olive/, ["ZG", "LG"]],
  // LI is de lavendel van de Flip5 en de S23, LV de violet van de A-serie.
  [/paars|purple|violet|lavendel|lavender|lila|lilac/, ["ZV", "LI", "LV", "ZP"]],
  [/roze|pink|rose/, ["ZI", "ZP"]],
  [/cr[eè]me|cream|beige|zand|sand/, ["ZE"]],
  [/geel|yellow|amber/, ["ZY"]],
  [/rood|red|burgundy/, ["ZR"]],
  [/oranje|orange/, ["ZO"]],
  [/goud|gold|brons|bronze/, ["ZD", "ZN"]],
];
// De uitvoeringsletter verschilt per serie (S23 128 GB is D, A54 128 GB is C, A53 is
// N, A12 en A51 zijn V). Deze volgorde komt uit het nalopen van de lijst tegen
// Icecat: D en G bij de S-serie, C, B en A bij de A-serie en de Fold, V en U bij de
// oudere A-modellen. De foto's zijn per kleur gelijk, dus elke uitvoering in de goede
// kleur is goed genoeg.
const UITVOERING = ["D", "G", "C", "B", "A", "N", "H", "E", "F", "V", "U"];
// Benelux eerst met alle uitvoeringen, dan de zakelijke Benelux-versie en de oude
// Nederlandse code (PHN, van voor de S20) met alleen de gangbaarste letters.
const REGIO: [string, string[]][] = [
  ["EUB", UITVOERING],
  ["EEB", ["D", "G", "C", "B"]],
  ["PHN", ["D", "G"]],
];

const KLEURWOORDEN = /\b(zwart|black|graphite|grafiet|onyx|phantom|midnight|middernacht|antraciet|grijs|gray|grey|titanium|marble|graniet|wit|white|zilver|silver|blauw|blue|navy|cobalt|kobalt|icy|groen|green|mint|lime|olijf|olive|paars|purple|violet|lavendel|lavender|lila|lilac|roze|pink|rose|cr[eè]me|cream|beige|zand|sand|geel|yellow|amber|rood|red|burgundy|oranje|orange|goud|gold|brons|bronze)\b/g;

export function isGalaxy(merk: string, model: string): boolean {
  const t = `${merk || ""} ${model || ""}`.toLowerCase();
  return /samsung|galaxy/.test(t) || /\bsm-[a-z]\d{3}/.test(t);
}

// "Samsung Galaxy S23 Ultra 5G 256GB - Groen" -> "s23ultra". Alles wat niets over
// het model zegt gaat eraf (merk, opslag, kleur, dual sim), "plus" wordt "+", en
// "Z Flip 5" en "Flip5" worden allebei "flip5".
export function galaxySleutel(merk: string, model: string): string {
  let t = `${merk || ""} ${model || ""}`.toLowerCase();
  t = t.split(" - ")[0];                          // oude invoer: "Galaxy S23 - Groen"
  t = t.replace(/\(.*?\)/g, " ")
    .replace(/samsung|galaxy|dual ?sim|duos|enterprise ?edition/g, " ")
    .replace(/\b\d+\s*(gb|tb)\b/g, " ")
    .replace(KLEURWOORDEN, " ")
    .replace(/\bplus\b/g, "+")
    .replace(/\bz\s*(flip|fold)/g, "$1");
  return t.replace(/[\s\-_]+/g, "");
}

// Het modelnummer zonder kleur, uitvoering en land. Een code die de winkel zelf bij
// de specs heeft gezet gaat voor (dan hoeft de lijst hem niet te kennen); anders de
// lijst. Bestaat een naam alleen als 5G-versie ("A54 5G"), dan vinden we hem ook
// zonder die 5G.
export function galaxyModelnummer(merk: string, model: string, productcode = ""): string | null {
  const tekst = `${productcode} ${model}`;
  // Uit een volle code knippen we de laatste zes tekens (kleur, uitvoering, land) af.
  const vol = galaxyVolleCode(tekst);
  if (vol) return vol.slice(0, -6);
  const eigen = tekst.toUpperCase().match(/\bSM-[A-Z]\d{3}[A-Z]{0,2}\b/);
  if (eigen) return eigen[0];
  const s = galaxySleutel(merk, model);
  if (!s) return null;
  if (GALAXY_MODELLEN[s]) return GALAXY_MODELLEN[s];
  if (s.endsWith("5g") && GALAXY_MODELLEN[s.slice(0, -2)]) return GALAXY_MODELLEN[s.slice(0, -2)];
  return null;
}

// Heeft de winkel de volle fabriekscode al (van de doos of uit de specs), dan is dat
// de enige poging die we nodig hebben.
export function galaxyVolleCode(productcode = ""): string | null {
  const m = String(productcode).toUpperCase().match(/\bSM-[A-Z]\d{3}[A-Z0-9]?[A-Z]{2}[A-Z0-9][A-Z]{3}\b/);
  return m ? m[0] : null;
}

export function kleurCodes(kleur: string): string[] {
  const k = String(kleur || "").toLowerCase();
  if (!k.trim()) return [];
  for (const [patroon, codes] of KLEUR_CODES) if (patroon.test(k)) return codes;
  return [];
}

// De kleur uit wat er ingevuld is: het kleurveld, de specs, of (oude invoer) achter
// het streepje in de modelnaam.
export function kleurVan(kleur: string, model: string): string {
  if (String(kleur || "").trim()) return String(kleur).trim();
  const achter = String(model || "").split(" - ")[1];
  return achter ? achter.trim() : "";
}

// Alle codes om te proberen, in volgorde van kans. Alleen in de kleur van het toestel:
// een zwarte foto bij een groene telefoon is erger dan geen foto, want de koper krijgt
// dan iets anders dan hij zag. Zonder (bekende) kleur proberen we dus niets, behalve
// een volle code die de winkel zelf heeft ingevuld. Begrensd, want Icecat remt af als
// je het te veel tegelijk vraagt (bij het nalopen van de lijst gaf het na een paar
// honderd vragen alleen nog niets terug).
export function galaxyKandidaten(p: { merk: string; model: string; kleur?: string; productcode?: string }, max = 40): string[] {
  const vol = galaxyVolleCode(`${p.productcode || ""} ${p.model || ""}`);
  const basis = galaxyModelnummer(p.merk, p.model, p.productcode || "");
  const uit: string[] = [];
  if (vol) uit.push(vol);
  if (!basis) return uit;
  const codes = kleurCodes(kleurVan(p.kleur || "", p.model));
  for (const [regio, letters] of REGIO) {
    for (const kc of codes) {
      for (const u of letters) {
        const c = `${basis}${kc}${u}${regio}`;
        if (!uit.includes(c)) uit.push(c);
      }
    }
  }
  return uit.slice(0, max);
}
