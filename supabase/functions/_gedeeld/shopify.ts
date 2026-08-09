// Alles wat met de webshopkoppeling te maken heeft, op één plek.
//
// Drie functies leunen hierop: het koppelen zelf, het online zetten van een
// toestel, en de melding die Shopify terugstuurt als er iets verkocht is. Die
// moeten het over dezelfde dingen eens zijn, anders krijg je de situatie waarin
// het koppelen zegt dat alles goed staat en het publiceren toch niet werkt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* De REST Admin API is sinds oktober 2024 een legacy-API en de endpoints voor
   producten en varianten zijn afgeschreven. Alles gaat daarom via GraphQL.
   Shopify brengt elk kwartaal een versie uit die twaalf maanden meegaat; deze
   staat hier één keer zodat het bijwerken één regel is. */
export const API = "2026-07";

/* Wat we nodig hebben, en waarvoor. Deze lijst staat ook in het scherm waar je
   koppelt, zodat de winkelier precies deze vinkjes aanzet en niet meer. */
export const RECHTEN: Record<string, string> = {
  read_products: "toestellen terugzien op de webshop",
  write_products: "toestellen aanmaken en aanpassen",
  read_inventory: "de voorraad uitlezen",
  write_inventory: "de voorraad op één stuk zetten",
  read_orders: "zien wanneer er iets verkocht is",
  write_publications: "het toestel zichtbaar maken in de webshop",
};

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
