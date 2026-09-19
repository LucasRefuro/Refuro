// De TWEEDE webshop: een aparte Shopify-winkel (groothandel) waar hele bundels
// als een lot verkocht worden.
//
// Bewust losgekoppeld van de eerste webshop: die draait via de functies shopify,
// shopify-koppelen en shopify-installeren op kanaal 'shopify'. Deze functie raakt
// die niet aan en werkt op kanaal 'shopify2', zodat er niets kan breken aan de
// winkel die al verkoopt. Koppelen gaat met een toegangstoken uit een custom app
// in de tweede winkel (geen OAuth, geen gedeelde app-instellingen).
//
// Een bundel is EEN product op deze tweede shop: een titel, een omschrijving, de
// geuploade foto's en de totale vraagprijs. De laptops erin staan in Storvo per
// stuk voor vraagprijs/aantal, maar op de shop is het een lot.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API = "2026-07";
const KANAAL = "shopify2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// De rechten die de tweede winkel nodig heeft, zelfde set als de eerste.
const RECHTEN: Record<string, string> = {
  read_products: "producten terugzien op de webshop",
  write_products: "producten aanmaken en aanpassen",
  read_inventory: "de voorraad uitlezen",
  write_inventory: "de voorraad op een stuk zetten",
  read_locations: "je winkellocaties uitlezen",
  read_orders: "zien wat er besteld is",
  write_publications: "het product zichtbaar maken in de webshop",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function fout(bericht: string, code = 400, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: false, error: bericht, ...(extra || {}) }),
    { status: code, headers: cors });
}

// Het winkeladres opschonen: mensen plakken van alles (https, streepjes, de admin-URL).
function domeinOpschonen(rauw: string) {
  let d = String(rauw || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\s+/g, "");
  if (!d) return "";
  const m = d.match(/^admin\.shopify\.com\/store\/([a-z0-9-]+)/);
  if (m) d = m[1] + ".myshopify.com";
  if (!d.includes(".")) d = d + ".myshopify.com";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d)) return "";
  return d;
}

// Het token versleuteld opslaan met KOPPELING_SLEUTEL (AES-GCM), net als de eerste shop.
async function sleutel() {
  const rauw = Deno.env.get("KOPPELING_SLEUTEL");
  if (!rauw) throw new Error("De instelling KOPPELING_SLEUTEL ontbreekt.");
  const bytes = Uint8Array.from(atob(rauw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("KOPPELING_SLEUTEL moet 32 bytes zijn, base64 opgeslagen");
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function versleutel(tekst: string) {
  const k = await sleutel();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const uit = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(tekst)));
  const samen = new Uint8Array(iv.length + uit.length);
  samen.set(iv); samen.set(uit, iv.length);
  return btoa(String.fromCharCode(...samen));
}
async function ontsleutel(pakket: string) {
  const k = await sleutel();
  const bytes = Uint8Array.from(atob(pakket), (c) => c.charCodeAt(0));
  const uit = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, k, bytes.slice(12));
  return new TextDecoder().decode(uit);
}

function nieuwPad() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 28);
}

// Een ingang voor GraphQL, met dezelfde foutafhandeling als de eerste shop.
async function graphql(k: { domein: string; token: string }, query: string, variabelen?: unknown) {
  const res = await fetch(`https://${k.domein}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": k.token, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query, variables: variabelen || {} }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Shopify accepteert het token niet. Koppel de tweede webshop opnieuw.");
  if (res.status === 429) throw new Error("Shopify vraagt om even te wachten. Probeer het over een halve minuut nog eens.");
  const tekst = await res.text();
  let uit: any = {};
  try { uit = tekst ? JSON.parse(tekst) : {}; } catch { /* leeg mag */ }
  if (!res.ok) throw new Error("Shopify gaf status " + res.status);
  if (Array.isArray(uit.errors) && uit.errors.length) throw new Error(uit.errors.map((e: any) => e.message).join(" · "));
  return uit.data || {};
}
function letOp(blok: any, wat: string) {
  const f = blok?.userErrors;
  if (Array.isArray(f) && f.length) throw new Error(wat + ": " + f.map((e: any) => e.message).join(" · "));
  return blok;
}

async function effectieveScopes(k: { domein: string; token: string }): Promise<string[]> {
  const d = await graphql(k, `query { currentAppInstallation { accessScopes { handle } } }`);
  return (d?.currentAppInstallation?.accessScopes || []).map((s: any) => String(s.handle));
}

// Waar de winkel publiceert en waar de voorraad ligt.
async function winkelVerkennen(k: { domein: string; token: string }) {
  const d = await graphql(k, `
    query {
      shop { name currencyCode myshopifyDomain }
      publications(first: 25) { nodes { id name } }
      locations(first: 25, includeInactive: false) { nodes { id name isActive shipsInventory } }
    }`);
  const publicaties = d?.publications?.nodes || [];
  const online = publicaties.find((p: any) => /online\s*store|onlinewinkel|online winkel/i.test(p.name)) || publicaties[0] || null;
  const locaties = (d?.locations?.nodes || []).filter((l: any) => l.isActive !== false);
  const locatie = locaties.find((l: any) => l.shipsInventory) || locaties[0] || null;
  return {
    naam: d?.shop?.name || null, valuta: d?.shop?.currencyCode || null,
    domein: d?.shop?.myshopifyDomain || k.domein,
    publicatie: online?.id || null, publicatieNaam: online?.name || null,
    locatie: locatie?.id || null, locatieNaam: locatie?.name || null,
  };
}

// Wie belt er: de ingelogde winkelier, via zijn eigen sessie-token.
async function wieBelt(req: Request) {
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return null;
  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return null;
  const { data: acc } = await admin.from("accounts").select("id, team_id, rol").eq("id", wie.user.id).maybeSingle();
  return acc || null;
}

async function koppeling(teamId: string) {
  const { data } = await admin.from("winkel_koppelingen").select("*").eq("team_id", teamId).eq("kanaal", KANAAL).maybeSingle();
  if (!data) return null;
  return { ...data, token: await ontsleutel(data.token_versleuteld) };
}

// Wat de browser mag zien: nooit het token, wel of het goed staat.
function veiligeStand(rij: any, extra?: Record<string, unknown>) {
  if (!rij) return { ok: true, gekoppeld: false, rechten: RECHTEN, ...(extra || {}) };
  const mist = Object.keys(RECHTEN).filter((r) => !(rij.scopes || []).includes(r));
  return {
    ok: true, gekoppeld: true, via: rij.via, domein: rij.domein, winkelnaam: rij.winkelnaam,
    valuta: rij.valuta, token_staart: rij.token_staart, status: rij.status, fout: rij.fout,
    mist, rechten: RECHTEN, publicatie: !!rij.publicatie_id, locatie: !!rij.locatie_id,
    ...(extra || {}),
  };
}

function esc(s: unknown) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}
function fotosVan(fotos: any) {
  const lijst = Array.isArray(fotos) ? fotos.filter((u: any) => typeof u === "string" && u.startsWith("http")) : [];
  return lijst.slice(0, 12).map((u: string) => ({ originalSource: u, contentType: "IMAGE" }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const acc = await wieBelt(req);
  if (!acc) return fout("Niet ingelogd", 401);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const actie = String(lijf?.actie || "status");

  try {
    if (actie === "status") {
      const { data } = await admin.from("winkel_koppelingen").select("*").eq("team_id", acc.team_id).eq("kanaal", KANAAL).maybeSingle();
      return new Response(JSON.stringify(veiligeStand(data)), { headers: cors });
    }

    // Koppelen met een geplakt token: eerst 'testen' (laat zien welke winkel het is
    // en welke rechten er missen), dan 'opslaan'.
    if (actie === "testen" || actie === "opslaan") {
      const domein = domeinOpschonen(lijf?.domein);
      const token = String(lijf?.token || "").trim();
      if (!domein) return fout("Dat winkeladres herken ik niet. Het ziet eruit als jouwwinkel.myshopify.com");
      if (!token) return fout("Vul het toegangstoken in");
      if (!/^shp(at|ca|ss)_[A-Za-z0-9]+$/.test(token)) {
        return fout("Dit lijkt geen Shopify-token. Een token begint met shpat_ en staat onder API-referenties in je custom app.");
      }

      let scopes: string[];
      try { scopes = await effectieveScopes({ domein, token }); }
      catch (e) {
        const m = e instanceof Error ? e.message : "";
        if (/token/i.test(m)) return fout("Shopify herkent dit token niet. Kijk of je hem helemaal hebt gekopieerd.");
        throw e;
      }
      const mist = Object.keys(RECHTEN).filter((r) => !scopes.includes(r));
      if (mist.length && actie === "testen") {
        // Nog even door met de winkelinfo als het kan, maar meld wel de missende rechten.
        return new Response(JSON.stringify({ ok: true, geldig: true, domein, winkelnaam: null, scopes, mist, rechten: RECHTEN }), { headers: cors });
      }
      const winkel = await winkelVerkennen({ domein, token });

      if (actie === "testen") {
        return new Response(JSON.stringify({
          ok: true, geldig: true, domein: winkel.domein, winkelnaam: winkel.naam, valuta: winkel.valuta,
          scopes, mist, rechten: RECHTEN, publicatie: winkel.publicatieNaam, locatie: winkel.locatieNaam,
        }), { headers: cors });
      }

      if (mist.length) return fout("Er ontbreken nog rechten in je Shopify-app", 400, { mist, rechten: RECHTEN });

      const { data: oud } = await admin.from("winkel_koppelingen").select("id, webhook_pad").eq("team_id", acc.team_id).eq("kanaal", KANAAL).maybeSingle();
      const basis: Record<string, unknown> = {
        team_id: acc.team_id, kanaal: KANAAL, via: "token", client_id: null,
        domein: winkel.domein, token_versleuteld: await versleutel(token), token_staart: token.slice(-4),
        winkelnaam: winkel.naam, valuta: winkel.valuta, scopes,
        publicatie_id: winkel.publicatie, locatie_id: winkel.locatie,
        status: "actief", fout: null, laatst_gecontroleerd: new Date().toISOString(),
        gekoppeld_door: acc.id, bijgewerkt_op: new Date().toISOString(),
      };
      if (oud) await admin.from("winkel_koppelingen").update(basis).eq("id", oud.id);
      else await admin.from("winkel_koppelingen").insert({ ...basis, webhook_pad: nieuwPad() });

      const { data: nu } = await admin.from("winkel_koppelingen").select("*").eq("team_id", acc.team_id).eq("kanaal", KANAAL).maybeSingle();
      return new Response(JSON.stringify(veiligeStand(nu, { publicatieNaam: winkel.publicatieNaam, locatieNaam: winkel.locatieNaam })), { headers: cors });
    }

    if (actie === "loskoppelen") {
      await admin.from("winkel_koppelingen").delete().eq("team_id", acc.team_id).eq("kanaal", KANAAL);
      return new Response(JSON.stringify({ ok: true, gekoppeld: false }), { headers: cors });
    }

    // Een bundel als EEN product op de tweede shop zetten, of er weer af halen.
    if (actie === "bundel_online" || actie === "bundel_offline") {
      const bundelId = String(lijf?.bundel_id || "");
      if (!bundelId) return fout("Geen bundel meegegeven");
      const { data: v } = await admin.from("refurbish_voorraad_batches")
        .select("*").eq("id", bundelId).eq("team_id", acc.team_id).maybeSingle();
      if (!v) return fout("Deze bundel is niet gevonden", 404);
      const k = await koppeling(acc.team_id);
      if (!k) return fout("Er is nog geen tweede webshop gekoppeld. Doe dat eerst bij Instellingen.", 409);

      if (actie === "bundel_offline") {
        const s = v.shopify;
        if (s?.id) {
          try {
            const uit = await graphql(k, `mutation($input: ProductDeleteInput!){ productDelete(input: $input){ deletedProductId userErrors { message } } }`, { input: { id: s.id } });
            letOp(uit?.productDelete, "Het weghalen van de webshop");
          } catch (e) { console.error("bundel verwijderen", e); }
        }
        await admin.from("refurbish_voorraad_batches").update({ shopify: null, status: "concept" }).eq("id", bundelId);
        return new Response(JSON.stringify({ ok: true }), { headers: cors });
      }

      // bundel_online
      const { count } = await admin.from("refurbish_apparaten")
        .select("id", { count: "exact", head: true }).eq("voorraad_batch_id", bundelId).eq("team_id", acc.team_id);
      const aantal = count || 0;
      if (!aantal) return fout("Deze bundel heeft nog geen laptops");
      if (v.vraagprijs == null || Number(v.vraagprijs) <= 0) return fout("Vul eerst een totale vraagprijs in");

      const titel = v.titel || v.nummer || ("Bundel van " + aantal + " laptops");
      const bestaand = v.shopify?.id || null;
      const oms = String(v.omschrijving || "");
      const invoer: any = {
        title: titel,
        descriptionHtml: oms ? "<p>" + esc(oms).replace(/\n/g, "<br>") + "</p>" : "",
        vendor: "Storvo", productType: "Laptops (bundel)", status: "ACTIVE",
        tags: ["bundel", "groothandel", v.code || ""].filter(Boolean),
        productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
        variants: [{
          price: String(Number(v.vraagprijs)),
          inventoryPolicy: "DENY",
          optionValues: [{ optionName: "Title", name: "Default Title" }],
          ...(k.locatie_id ? { inventoryQuantities: [{ locationId: k.locatie_id, name: "available", quantity: 1 }] } : {}),
        }],
      };
      if (bestaand) invoer.id = bestaand;
      const files = fotosVan(v.fotos);
      if (files.length && !bestaand) invoer.files = files;

      const uit = await graphql(k, `
        mutation($input: ProductSetInput!) {
          productSet(input: $input, synchronous: true) {
            product { id handle title onlineStoreUrl variants(first: 1) { nodes { id } } }
            userErrors { field message }
          }
        }`, { input: invoer });
      const p = letOp(uit?.productSet, "Het aanmaken op de webshop").product;
      if (!p?.id) throw new Error("Shopify gaf geen product terug");
      const variant = p?.variants?.nodes?.[0]?.id || null;

      let zichtbaar = false;
      if (k.publicatie_id) {
        const pub = await graphql(k, `
          mutation($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) { userErrors { field message } }
          }`, { id: p.id, input: [{ publicationId: k.publicatie_id }] });
        letOp(pub?.publishablePublish, "Het zichtbaar maken in de webshop");
        zichtbaar = true;
      }

      const nummer = String(p.id).split("/").pop();
      const shopify = {
        id: p.id, nummer, variant,
        url: p.onlineStoreUrl || (p.handle ? `https://${k.domein}/products/${p.handle}` : null),
        beheer: `https://${k.domein}/admin/products/${nummer}`,
        zichtbaar, sinds: new Date().toISOString(),
      };
      await admin.from("refurbish_voorraad_batches").update({ shopify, status: "online" }).eq("id", bundelId);
      return new Response(JSON.stringify({
        ok: true, shopify, zichtbaar,
        waarschuwing: zichtbaar ? null : "De bundel staat op Shopify maar is nog niet gepubliceerd. Kijk of de koppeling het verkoopkanaal heeft gevonden.",
      }), { headers: cors });
    }

    return fout("Onbekende actie");
  } catch (e) {
    console.error("webshop2", actie, e);
    return fout(e instanceof Error ? e.message : "De tweede webshop reageerde niet", 502);
  }
});
