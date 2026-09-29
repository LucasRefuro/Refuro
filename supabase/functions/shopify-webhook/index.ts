// Shopify meldt hier wat er in de webshop gebeurt: een bestelling, een
// betaling, een annulering, een verzending.
//
// Twee dingen doen we ermee. Het toestel gaat uit de voorraad, want anders
// verkoop je hem een uur later nog een keer aan de balie. En de bestelling zelf
// komt in Storvo te staan, zodat je ziet dát er iets besteld is en door wie, in
// plaats van dat er een laptop uit je lijst verdwijnt zonder uitleg.
//
// Dit adres staat open op internet, dus er zitten vier sloten op:
//
//   1. Het adres bevat een geheim stukje dat bij één winkel hoort.
//   2. De handtekening van Shopify over de hele inhoud moet kloppen. Die maakt
//      hij met het geheim van onze app, dus alleen Shopify kan hem zetten.
//   3. Het winkeladres in de melding moet bij dat geheim horen.
//   4. En we geloven de inhoud niet op zijn woord: we halen de bestelling zelf
//      op bij Shopify voordat er iets verandert.
//
// Dat laatste is het slot dat er echt toe doet. Ook als de andere drie ooit
// falen, kan niemand hiermee jouw voorraad leegtrekken: de bestelling bestaat
// aan de andere kant gewoon niet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Zelfstandig gehouden (helpers exact overgenomen uit _gedeeld/shopify.ts), zodat de
// deploy uit één bestand bestaat en niet het hele gedeelde bestand hoeft mee te sturen.
const API = "2026-07";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function cryptoSleutel() {
  const rauw = Deno.env.get("KOPPELING_SLEUTEL");
  if (!rauw) throw new Error("KOPPELING_SLEUTEL ontbreekt");
  const bytes = Uint8Array.from(atob(rauw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("KOPPELING_SLEUTEL moet 32 bytes zijn, base64 opgeslagen");
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function ontsleutel(pakket: string) {
  const k = await cryptoSleutel();
  const bytes = Uint8Array.from(atob(pakket), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const rest = bytes.slice(12);
  const uit = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, rest);
  return new TextDecoder().decode(uit);
}
async function graphql(k: { domein: string; token: string }, query: string, variabelen?: unknown) {
  const res = await fetch(`https://${k.domein}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": k.token, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query, variables: variabelen || {} }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Shopify accepteert het token niet meer. Koppel de webshop opnieuw.");
  if (res.status === 429) throw new Error("Shopify vraagt om even te wachten. Probeer het over een halve minuut nog eens.");
  const tekst = await res.text();
  let uit: any = {};
  try { uit = tekst ? JSON.parse(tekst) : {}; } catch { /* leeg antwoord mag */ }
  if (!res.ok) throw new Error("Shopify gaf status " + res.status);
  if (Array.isArray(uit.errors) && uit.errors.length) throw new Error(uit.errors.map((e: any) => e.message).join(" · "));
  return uit.data || {};
}
// Handtekening van Shopify in vaste tijd vergelijken (exact uit _gedeeld/shopify.ts).
function gelijk(a: string, b: string) {
  if (a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return verschil === 0;
}
async function hmac(geheim: string, bericht: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(geheim), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, bericht));
}
async function hmacBase64(geheim: string, tekst: string) {
  const bytes = await hmac(geheim, new TextEncoder().encode(tekst));
  return btoa(String.fromCharCode(...bytes));
}
async function meldingKlopt(lijf: string, gegeven: string | null, geheim: string) {
  if (!gegeven) return false;
  return gelijk(await hmacBase64(geheim, lijf), gegeven);
}

function klaar(tekst = "ok", status = 200) {
  return new Response(tekst, { status });
}

function geld(w: any) {
  const n = Number(w?.shopMoney?.amount ?? w?.amount ?? w);
  return isNaN(n) ? null : n;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return klaar("Alleen POST", 405);

  const pad = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "";
  if (!pad || pad === "shopify-webhook") {
    console.error("shopify-webhook: aanroep zonder geheim in het adres");
    return klaar("Ongeldig", 401);
  }

  const { data: kop } = await admin.from("winkel_koppelingen")
    .select("*").eq("webhook_pad", pad).eq("kanaal", "shopify").maybeSingle();
  if (!kop) {
    console.error("shopify-webhook: onbekend geheim");
    return klaar("Ongeldig", 401);
  }

  const winkel = (req.headers.get("X-Shopify-Shop-Domain") || "").toLowerCase();
  if (winkel && winkel !== String(kop.domein).toLowerCase()) {
    console.error("shopify-webhook: melding van", winkel, "hoort niet bij", kop.domein);
    return klaar("Ongeldig", 401);
  }

  const lijf = await req.text();

  /* De handtekening. Alleen te controleren als de koppeling via onze eigen app
     loopt; bij een geplakt token van iemands eigen app hebben wij dat geheim
     niet. Dan vallen we terug op de andere drie sloten, waarvan het ophalen van
     de bestelling het sterkste is. */
  const appGeheim = Deno.env.get("SHOPIFY_CLIENT_SECRET");
  if (kop.via === "oauth" && appGeheim) {
    const goed = await meldingKlopt(lijf, req.headers.get("X-Shopify-Hmac-Sha256"), appGeheim);
    if (!goed) {
      console.error("shopify-webhook: handtekening klopt niet voor", kop.domein);
      return klaar("Ongeldig", 401);
    }
  }

  let melding: any;
  try { melding = JSON.parse(lijf); } catch { return klaar("Onleesbaar", 400); }

  const bestellingId = melding?.admin_graphql_api_id
    || (melding?.id ? `gid://shopify/Order/${melding.id}` : null);
  if (!bestellingId) return klaar();

  /* De bestelling zelf ophalen. Dit is meteen de controle: bestaat hij niet,
     dan was de melding niet echt en gebeurt er niets.
     LET OP: geen customer/email opvragen. Die velden eisen de scope read_customers
     (Shopify: "Access denied for customer field"); hebben we die niet, dan faalt de
     HELE query met 500 en synct de verkoop nooit. De naam/adres van de koper zie je
     via beheer_url (de Shopify-orderlink). Wil je klantnaam in Storvo: voeg
     read_customers toe aan de app-scopes en koppel opnieuw, dan kan dit veld terug. */
  let order: any = null;
  let klantNaam: string | null = null, klantEmail: string | null = null;
  try {
    const token = await ontsleutel(kop.token_versleuteld);
    const d = await graphql({ domein: kop.domein, token }, `
      query($id: ID!) {
        order(id: $id) {
          id name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 100) {
            nodes {
              title sku quantity
              originalTotalSet { shopMoney { amount } }
              product { id }
              variant { id }
            }
          }
        }
      }`, { id: bestellingId });

    if (!d?.order) {
      console.error("shopify-webhook: bestelling", bestellingId, "bestaat niet bij Shopify");
      return klaar("Ongeldig", 401);
    }
    order = d.order;
    /* Klantnaam is best-effort en apart: alleen als het token read_customers heeft.
       Faalt deze query (geen scope), dan blijft de naam leeg en loopt de verkoop-sync
       gewoon door. Zo kan deze extra nooit de hele sync breken, zoals de read_customers-
       500 dat vroeger deed toen customer/email in de hoofdquery zat. */
    try {
      const c = await graphql({ domein: kop.domein, token }, `query($id: ID!){ order(id: $id){ customer { displayName email } email } }`, { id: bestellingId });
      klantNaam = c?.order?.customer?.displayName || null;
      klantEmail = c?.order?.customer?.email || c?.order?.email || null;
    } catch (_e) { /* geen read_customers: klant blijft leeg, sync gaat door */ }
  } catch (e) {
    console.error("shopify-webhook: bestelling ophalen mislukt", e);
    /* Een fout van onze kant is geen reden om Shopify te laten stoppen met
       proberen. Een foutstatus zorgt dat Shopify het later opnieuw stuurt. */
    return klaar("Later opnieuw", 500);
  }

  const regels = order.lineItems?.nodes || [];
  const geannuleerd = !!order.cancelledAt;
  const betaald = String(order.displayFinancialStatus || "").toUpperCase() === "PAID";
  const verzonden = String(order.displayFulfillmentStatus || "").toUpperCase() === "FULFILLED";

  /* De eerder bewaarde bestelling is onze betrouwbare terugval: daarin staan de
     hardware-id's van de toestellen. Nodig omdat we bij de verkoop de
     shopify-marker uit het toestel halen; een toestel zonder code/serienummer is
     daarna niet meer via de melding te matchen, en paid/cancelled/fulfilled komen
     als losse meldingen binnen. */
  const { data: bestaand } = await admin.from("webshop_bestellingen")
    .select("id, toestellen").eq("team_id", kop.team_id).eq("kanaal", "shopify")
    .eq("bestelling_id", String(bestellingId)).maybeSingle();
  const eerderToestellen: any[] = Array.isArray(bestaand?.toestellen) ? bestaand.toestellen : [];

  /* ── de toestellen uit deze bestelling ──
     Bij grade-varianten hangen meerdere toestellen aan één product; de verkochte
     VARIANT wijst het juiste exemplaar aan. Per regel pakken we de oudste onverkochte
     exemplaren van die variant (FIFO), zo veel als er verkocht zijn. Terugval: het oude
     model (één product = één toestel) op product-id, of de sku als iemand het product in
     Shopify zelf opnieuw heeft aangemaakt.

     Idempotent bij herhaalde meldingen (created/paid/fulfilled komen los binnen): we tellen
     wat er al aan de bestelling hangt (per variant én totaal) en verkopen nooit meer dan de
     bestelde aantallen, zodat een tweede melding niet stiekem een tweede toestel meepakt. */
  const gevonden: { id: string; naam: string; code: string | null; variant?: string | null }[] = [];
  const gedaan = new Set<string>();
  const totaalNodig = regels.reduce((n: number, r: any) => n + Math.max(1, Math.floor(Number(r?.quantity) || 1)), 0);
  const alGedaanIds = new Set<string>(eerderToestellen.map((t: any) => t?.id).filter(Boolean));
  let toegewezen = eerderToestellen.length;

  for (const r of regels) {
    if (geannuleerd) continue;             // een annulering loopt via de bewaarde bestelling hieronder
    if (toegewezen >= totaalNodig) break;  // genoeg toestellen aan de bestelling; niets dubbels

    const variantId = r?.variant?.id || null;
    const productId = r?.product?.id || null;
    const sku = r?.sku || null;
    const aantal = Math.max(1, Math.floor(Number(r?.quantity) || 1));

    // Zoveel van deze variant hangen er al aan de bestelling; die hoeven we niet nog eens.
    const alReeds = variantId ? eerderToestellen.filter((t: any) => t?.variant && String(t.variant) === String(variantId)).length : 0;
    let nodig = Math.min(aantal - alReeds, totaalNodig - toegewezen);
    if (nodig <= 0) continue;

    let rijen: any[] = [];
    if (variantId) {
      const { data } = await admin.from("hardware")
        .select("id, status, kanalen, merk, model, code")
        .eq("team_id", kop.team_id)
        .eq("kanalen->shopify->>variant", String(variantId))
        .eq("status", "voorraad")
        .order("aangemaakt_op", { ascending: true }).limit(nodig + 5);
      rijen = data || [];
    }
    if (!rijen.length && productId) {
      const { data } = await admin.from("hardware")
        .select("id, status, kanalen, merk, model, code")
        .eq("team_id", kop.team_id)
        .eq("kanalen->shopify->>id", String(productId))
        .eq("status", "voorraad")
        .order("aangemaakt_op", { ascending: true }).limit(nodig + 5);
      rijen = data || [];
    }
    if (!rijen.length && sku) {
      const { data } = await admin.from("hardware")
        .select("id, status, kanalen, merk, model, code")
        .eq("team_id", kop.team_id)
        .or(`code.eq.${sku},serienummer.eq.${sku}`)
        .eq("status", "voorraad").limit(nodig + 5);
      rijen = data || [];
    }

    for (const rij of rijen) {
      if (nodig <= 0) break;
      if (alGedaanIds.has(rij.id) || gedaan.has(rij.id) || rij.status === "verkocht") continue;

      const kanalen = (rij.kanalen && typeof rij.kanalen === "object") ? { ...rij.kanalen } : {};
      delete kanalen.shopify;
      await admin.from("hardware").update({
        status: "verkocht",
        verkocht_op: order.createdAt || new Date().toISOString(),
        verkocht_via: "webshop",
        kanalen,
        bijgewerkt_op: new Date().toISOString(),
      }).eq("id", rij.id);
      gevonden.push({ id: rij.id, naam: [rij.merk, rij.model].filter(Boolean).join(" "), code: rij.code || null, variant: variantId });
      gedaan.add(rij.id);
      nodig--; toegewezen++;
      console.log("shopify-webhook: toestel", rij.id, "verkocht in de webshop (variant", variantId, ")");
    }
  }

  /* Toestellen die we deze melding niet meer konden matchen (marker weg, geen
     sku) halen we uit de eerder bewaarde bestelling. Bij een annulering zetten
     we ze alsnog terug op voorraad; en de toestellenlijst van de bestelling mag
     nooit leeglopen op een vervolgmelding. */
  const toestellenSamen: any[] = [...gevonden];
  for (const t of eerderToestellen) {
    if (!t?.id || gedaan.has(t.id)) continue;
    toestellenSamen.push(t);
    if (geannuleerd) {
      const { data: hw } = await admin.from("hardware")
        .select("id, status").eq("team_id", kop.team_id).eq("id", t.id).maybeSingle();
      if (hw && hw.status === "verkocht") {
        await admin.from("hardware").update({
          status: "voorraad", verkocht_op: null, verkocht_via: null,
          bijgewerkt_op: new Date().toISOString(),
        }).eq("id", hw.id);
        console.log("shopify-webhook: geannuleerd (via bewaarde bestelling), toestel", hw.id, "terug op voorraad");
      }
    }
  }

  /* ── de bestelling zelf bewaren ──
     Zodat je in Storvo ziet wat er besteld is en niet alleen dat er iets uit de
     voorraad verdwenen is. */
  const nummer = String(bestellingId).split("/").pop();
  const rij = {
    team_id: kop.team_id, kanaal: "shopify",
    bestelling_id: String(bestellingId),
    nummer: order.name || null,
    klant: klantNaam,
    email: klantEmail,
    bedrag: geld(order.totalPriceSet),
    valuta: order.totalPriceSet?.shopMoney?.currencyCode || kop.valuta || null,
    status: geannuleerd ? "geannuleerd" : (verzonden ? "verzonden" : (betaald ? "betaald" : "open")),
    betaald, verzonden, geannuleerd,
    regels: regels.map((r: any) => ({
      titel: r.title, sku: r.sku || null, aantal: r.quantity,
      bedrag: geld(r.originalTotalSet),
    })),
    toestellen: toestellenSamen,
    beheer_url: `https://${kop.domein}/admin/orders/${nummer}`,
    geplaatst_op: order.createdAt || new Date().toISOString(),
    bijgewerkt_op: new Date().toISOString(),
  };

  if (bestaand) {
    await admin.from("webshop_bestellingen").update(rij).eq("id", bestaand.id);
  } else {
    await admin.from("webshop_bestellingen").insert(rij);
  }

  return klaar();
});
