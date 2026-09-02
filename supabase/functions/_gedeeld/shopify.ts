// Alles wat met de webshopkoppeling te maken heeft, op één plek.
//
// Vier functies leunen hierop: het koppelen starten, het afronden na Shopify,
// het online zetten van een toestel, en de melding die Shopify terugstuurt als
// er iets besteld is. Die moeten het over dezelfde dingen eens zijn, anders
// krijg je de situatie waarin het koppelen zegt dat alles goed staat en het
// publiceren toch niet werkt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* De REST Admin API is sinds oktober 2024 een legacy-API en de endpoints voor
   producten en varianten zijn afgeschreven. Alles gaat daarom via GraphQL.
   Shopify brengt elk kwartaal een versie uit die twaalf maanden meegaat; deze
   staat hier één keer zodat het bijwerken één regel is. */
export const API = "2026-07";

/* Wat we nodig hebben, en waarvoor. Deze lijst staat ook in het scherm waar je
   koppelt, zodat de winkelier ziet waar hij ja tegen zegt. */
export const RECHTEN: Record<string, string> = {
  read_products: "toestellen terugzien op de webshop",
  write_products: "toestellen aanmaken en aanpassen",
  read_inventory: "de voorraad uitlezen",
  write_inventory: "de voorraad op één stuk zetten",
  read_locations: "je winkellocaties uitlezen voor de voorraad",
  read_orders: "zien wat er besteld is",
  write_publications: "het toestel zichtbaar maken in de webshop",
};
export const SCOPES = Object.keys(RECHTEN).join(",");

export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export function fout(bericht: string, code = 400, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: false, error: bericht, ...(extra || {}) }),
    { status: code, headers: cors });
}

/* ── het adres van de winkel ──
   Mensen plakken van alles: de hele URL uit de adresbalk, met https ervoor, met
   een schuine streep erachter, of alleen het stukje voor .myshopify.com. Dat
   maken we hier recht in plaats van er een foutmelding over te geven. */
export function domeinOpschonen(rauw: string) {
  let d = String(rauw || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\s+/g, "");
  if (!d) return "";
  /* Sinds een paar jaar zie je in de adresbalk admin.shopify.com/store/naam
     staan in plaats van naam.myshopify.com. Voor de API hebben we het tweede
     nodig, dus dat rekenen we om. */
  const m = d.match(/^admin\.shopify\.com\/store\/([a-z0-9-]+)/);
  if (m) d = m[1] + ".myshopify.com";
  if (!d.includes(".")) d = d + ".myshopify.com";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d)) return "";
  return d;
}

/* ── het token beschermen ──
   Versleuteld opslaan is geen vervanging voor goede rechten op de tabel, maar
   het scheelt wel: een databasedump, een back-up of een verkeerd ingestelde
   export levert dan geen werkende webshopsleutels op. */
async function sleutel() {
  const rauw = Deno.env.get("KOPPELING_SLEUTEL");
  if (!rauw) {
    throw new Error(
      "De instelling KOPPELING_SLEUTEL ontbreekt. Zonder die sleutel weigeren " +
      "we een webshoptoken op te slaan, want dan zou het leesbaar in de database staan.");
  }
  const bytes = Uint8Array.from(atob(rauw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("KOPPELING_SLEUTEL moet 32 bytes zijn, base64 opgeslagen");
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function versleutel(tekst: string) {
  const k = await sleutel();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const uit = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, k, new TextEncoder().encode(tekst)));
  const samen = new Uint8Array(iv.length + uit.length);
  samen.set(iv); samen.set(uit, iv.length);
  return btoa(String.fromCharCode(...samen));
}

export async function ontsleutel(pakket: string) {
  const k = await sleutel();
  const bytes = Uint8Array.from(atob(pakket), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const rest = bytes.slice(12);
  const uit = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, rest);
  return new TextDecoder().decode(uit);
}

/* ── handtekeningen van Shopify ──
   Shopify ondertekent zowel de terugkomst na het installeren als elke melding
   met het geheim van de app. Vergelijken doen we in vaste tijd; wie dat met een
   gewone === doet, verklapt met de snelheid van het antwoord hoeveel tekens er
   al klopten. */
function gelijk(a: string, b: string) {
  if (a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return verschil === 0;
}

async function hmac(geheim: string, bericht: Uint8Array) {
  const k = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(geheim),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, bericht));
}

export async function hmacHex(geheim: string, tekst: string) {
  const bytes = await hmac(geheim, new TextEncoder().encode(tekst));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacBase64(geheim: string, tekst: string) {
  const bytes = await hmac(geheim, new TextEncoder().encode(tekst));
  return btoa(String.fromCharCode(...bytes));
}

/* De terugkomst na het installeren. Shopify hangt er een handtekening aan over
   alle andere parameters, alfabetisch op een rij. */
export async function terugkomstKlopt(url: URL, geheim: string) {
  const gegeven = url.searchParams.get("hmac") || "";
  if (!gegeven) return false;
  const paren: string[] = [];
  url.searchParams.forEach((w, n) => { if (n !== "hmac" && n !== "signature") paren.push(n + "=" + w); });
  paren.sort();
  return gelijk(await hmacHex(geheim, paren.join("&")), gegeven);
}

export async function meldingKlopt(lijf: string, gegeven: string | null, geheim: string) {
  if (!gegeven) return false;
  return gelijk(await hmacBase64(geheim, lijf), gegeven);
}

/* ── praten met Shopify ── */

export type Koppeling = {
  id: string; team_id: string; domein: string; token: string;
  publicatie_id: string | null; locatie_id: string | null;
  webhook_pad: string; scopes: string[];
};

export async function koppelingVan(teamId: string): Promise<Koppeling | null> {
  const { data } = await admin.from("winkel_koppelingen")
    .select("*").eq("team_id", teamId).eq("kanaal", "shopify").maybeSingle();
  if (!data) return null;
  return { ...data, token: await ontsleutel(data.token_versleuteld) };
}

/* Eén ingang voor alle GraphQL-aanroepen, zodat foutafhandeling en snelheids-
   limieten op één plek staan.

   Shopify geeft twee soorten fouten terug en die zien er heel anders uit:
   `errors` is "je vraag klopt niet" en `userErrors` is "je vraag klopt maar dit
   mag niet". Allebei komen met een status 200 binnen. Wie alleen op de status
   kijkt, denkt dat het gelukt is terwijl er niets gebeurd is. */
export async function graphql(k: {domein: string; token: string}, query: string, variabelen?: unknown) {
  const res = await fetch(`https://${k.domein}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": k.token,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ query, variables: variabelen || {} }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Shopify accepteert het token niet meer. Koppel de webshop opnieuw.");
  }
  if (res.status === 429) {
    throw new Error("Shopify vraagt om even te wachten. Probeer het over een halve minuut nog eens.");
  }
  const tekst = await res.text();
  let uit: any = {};
  try { uit = tekst ? JSON.parse(tekst) : {}; } catch { /* leeg antwoord mag */ }
  if (!res.ok) throw new Error("Shopify gaf status " + res.status);
  if (Array.isArray(uit.errors) && uit.errors.length) {
    throw new Error(uit.errors.map((e: any) => e.message).join(" · "));
  }
  return uit.data || {};
}

/* userErrors zitten per mutatie in het antwoord. Deze helper haalt ze eruit en
   maakt er een leesbare zin van, want "field: [variants, 0, price]" zegt de
   winkelier niets. */
export function letOp(blok: any, wat: string) {
  const f = blok?.userErrors;
  if (Array.isArray(f) && f.length) {
    throw new Error(wat + ": " + f.map((e: any) => e.message).join(" · "));
  }
  return blok;
}

/* ── wat er in de winkel te vinden is ──
   Waar de webshop publiceert en waar de voorraad ligt. Beide hebben we later
   nodig en beide kunnen we nu al opzoeken, zodat de winkelier het nooit hoeft
   in te vullen. */
export async function winkelVerkennen(k: { domein: string; token: string }) {
  const d = await graphql(k, `
    query {
      shop { name currencyCode myshopifyDomain }
      publications(first: 25) { nodes { id name } }
      locations(first: 25, includeInactive: false) { nodes { id name isActive shipsInventory } }
    }`);

  const publicaties = d?.publications?.nodes || [];
  /* Het kanaal heet in het Nederlands "Onlinewinkel" en in het Engels "Online
     Store". Op de naam zoeken is daarom wankel; we nemen de eerste die er als
     webshop uitziet en anders gewoon de eerste. Beter iets dan niets. */
  const online = publicaties.find((p: any) => /online\s*store|onlinewinkel|online winkel/i.test(p.name))
    || publicaties[0] || null;

  const locaties = (d?.locations?.nodes || []).filter((l: any) => l.isActive !== false);
  const locatie = locaties.find((l: any) => l.shipsInventory) || locaties[0] || null;

  return {
    naam: d?.shop?.name || null,
    valuta: d?.shop?.currencyCode || null,
    domein: d?.shop?.myshopifyDomain || k.domein,
    publicatie: online?.id || null,
    publicatieNaam: online?.name || null,
    locatie: locatie?.id || null,
    locatieNaam: locatie?.name || null,
    aantalLocaties: locaties.length,
  };
}

/* ── de meldingen ──
   Bestellingen zijn het belangrijkst: zonder die melding staat een verkochte
   laptop nog een uur in de winkel te koop. Betaald, geannuleerd en verzonden
   erbij, zodat de bestellingenlijst in Storvo klopt en niet alleen "er is iets
   besteld" zegt. Dubbel binnenkomen is geen probleem; we werken per bestelling
   bij en kijken of het toestel al op verkocht staat. */
export const MELDINGEN = [
  "ORDERS_CREATE", "ORDERS_PAID", "ORDERS_CANCELLED", "ORDERS_FULFILLED",
];

export function webhookAdres(pad: string) {
  return `${Deno.env.get("SUPABASE_URL")!}/functions/v1/shopify-webhook/${pad}`;
}

export function nieuwPad() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 28);
}

export async function webhooksZetten(k: { domein: string; token: string }, pad: string) {
  const adres = webhookAdres(pad);

  /* Eerst opruimen wat er van ons al staat. Koppel je opnieuw, dan krijg je
     anders elke keer een melding extra en gaat de teller vrolijk door. */
  const bestaand = await graphql(k, `
    query { webhookSubscriptions(first: 100) {
      nodes { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } } }`);
  for (const w of (bestaand?.webhookSubscriptions?.nodes || [])) {
    const url = w?.endpoint?.callbackUrl || "";
    if (url.includes("/functions/v1/shopify-webhook")) {
      await graphql(k, `mutation($id: ID!){ webhookSubscriptionDelete(id: $id){ userErrors { message } } }`,
        { id: w.id });
    }
  }

  const gezet: { topic: string; id: string }[] = [];
  for (const topic of MELDINGEN) {
    const uit = await graphql(k, `
      mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
          webhookSubscription { id }
          userErrors { field message }
        }
      }`, { topic, sub: { callbackUrl: adres, format: "JSON" } });
    const blok = uit?.webhookSubscriptionCreate;
    if (blok?.webhookSubscription?.id) {
      gezet.push({ topic, id: blok.webhookSubscription.id });
    } else {
      // Niet fataal: zonder melding werkt alles nog, alleen moet je zelf zien
      // dat er iets verkocht is. Dat zeggen we dan ook eerlijk.
      console.error("webhook", topic, JSON.stringify(blok?.userErrors || []));
    }
  }
  return gezet;
}

/* ── wie belt er ── */
export async function wieBelt(req: Request) {
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return null;
  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return null;
  const { data: acc } = await admin.from("accounts")
    .select("id, team_id, rol").eq("id", wie.user.id).maybeSingle();
  return acc || null;
}

/* ── de metafields voor de productpagina ──
   Het thema (sections/hoofd-product.liquid en snippets/product-kaart.liquid) leest
   per product een reeks refuro-metafields: de spec-chips (cpu, ram, opslag, scherm,
   gpu, accu), de staatkeuze, de "wat wij zagen"-tekst en de nieuwprijs. Staan die
   niet gevuld, dan valt de pagina terug op een kale weergave. Deze bouwer zet alles
   op één plek, zodat het online zetten (shopify) en de test niet uit elkaar lopen.

   Twee dingen komen niet van de hardware-rij maar uit de controle (refurbish_apparaten):
   het accupercentage en de conditie-items voor de toelichting. Die geven we los mee. */

// De grade A/B/C zoals de winkelier hem kent, naar de code die het thema mapt naar
// Uitstekend/Zeer goed/Prima (zie snippets/staat-naam.liquid). Stuur je A/B/C rauw,
// dan valt het thema terug op de letter zelf.
export function staatCode(staat: string) {
  const s = String(staat || "").toUpperCase();
  return s === "A" ? "uitstekend" : s === "B" ? "zeer_goed" : s === "C" ? "prima" : "";
}

// "Wat wij zagen": eerst de conditie-items die de winkelier bij de controle zelf
// heeft ingevuld (Behuizing, Scherm, Toetsenbord, Scharnieren), anders een vaste
// zin per grade. Zo staat er altijd iets echts, niet alleen "grade A".
export function staatToelichting(h: any, refurbish: any) {
  const CONDITIE = ["behuizing", "scherm", "toetsenbord", "scharnieren en deksel"];
  const cl = refurbish?.checklist;
  if (Array.isArray(cl)) {
    const items = cl
      .filter((x: any) => x && x.a && CONDITIE.includes(String(x.v || "").toLowerCase()))
      .map((x: any) => `${x.v}: ${String(x.a).toLowerCase()}`);
    const uniek = [...new Set(items)];
    if (uniek.length) return uniek.join(". ") + ".";
  }
  const perGrade: Record<string, string> = {
    A: "Als nieuw. Je moet de gebruikssporen echt zoeken.",
    B: "Lichte gebruikssporen, netjes verzorgd. Werkt zoals het hoort.",
    C: "Zichtbare gebruikssporen. Werkt helemaal naar behoren.",
  };
  return perGrade[String(h.staat || "").toUpperCase()] || "Volledig nagekeken en klaar voor gebruik.";
}

function mfText(key: string, val: unknown) {
  return { namespace: "refuro", key, type: "single_line_text_field", value: String(val) };
}
function mfInt(key: string, val: number) {
  return { namespace: "refuro", key, type: "number_integer", value: String(Math.round(val)) };
}
function slug(s: string) {
  // Merk en model zijn hier altijd ASCII; geen NFKD nodig, dan ook geen
  // onzichtbare combineertekens in de bron.
  return String(s || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Losstaand, zodat het verplaatsen van een toestel alleen deze ene hoeft bij te werken.
export function winkelvoorraadMetafield(inWinkel: boolean) {
  return mfInt("winkelvoorraad", inWinkel ? 1 : 0);
}

export function bouwProductMetafields(h: any, refurbish: any, inWinkel: boolean) {
  const sp = (h.specs && typeof h.specs === "object") ? h.specs : {};
  const out: any[] = [];
  out.push(winkelvoorraadMetafield(inWinkel));
  out.push(mfInt("nieuwe_accu", h.nieuwe_accu ? 1 : 0));

  const code = staatCode(h.staat);
  if (code) out.push(mfText("staat", code));
  out.push(mfText("staat_toelichting", staatToelichting(h, refurbish)));

  // De spec-sleutels van de refurbish-app zijn Nederlands; het thema leest ze
  // onder de Engelse metafield-namen die de spec-chips en de spec-tabel vullen.
  if (sp.Processor) out.push(mfText("cpu", sp.Processor));
  if (sp.Geheugen) out.push(mfText("ram", sp.Geheugen));
  if (sp.Opslag) out.push(mfText("opslag", sp.Opslag));
  if (sp.Scherm) out.push(mfText("scherm", sp.Scherm));
  if (sp.Videokaart) out.push(mfText("gpu", sp.Videokaart));
  if (sp.Besturingssysteem) out.push(mfText("os", sp.Besturingssysteem));
  if (sp.Toetsenbord) out.push(mfText("toetsenbord", sp.Toetsenbord));
  if (sp.Poorten) out.push(mfText("poorten", sp.Poorten));
  if (sp.Gewicht) out.push(mfText("gewicht", sp.Gewicht));
  if (sp.Bouwjaar) out.push(mfText("bouwjaar", sp.Bouwjaar));

  const accu = refurbish?.accu;
  if (accu != null && Number.isFinite(Number(accu))) out.push(mfInt("accu_gezondheid", Number(accu)));

  if (h.garantie != null && h.garantie !== "") out.push(mfInt("garantie_maanden", Number(h.garantie)));

  // Zelfde model, verschillende exemplaren horen op de collectiepagina bij elkaar.
  const mk = slug([h.merk, h.model].filter(Boolean).join(" "));
  if (mk) out.push(mfText("model_key", mk));
  // Het btw-regime voor de administratie; op de webshop staat de prijs altijd inclusief.
  out.push(mfText("btw", h.marge === false ? "normaal" : "marge"));
  // De nieuwprijs voedt de doorstreepprijs en de "onder de nieuwprijs"-regel.
  if (h.nieuwprijs != null && h.nieuwprijs !== "") {
    out.push({ namespace: "refuro", key: "nieuwprijs", type: "number_decimal", value: String(Number(h.nieuwprijs)) });
  }
  return out;
}
