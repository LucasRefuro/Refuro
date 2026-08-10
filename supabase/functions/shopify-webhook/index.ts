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

import { admin, graphql, ontsleutel, meldingKlopt } from "../_gedeeld/shopify.ts";

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
     dan was de melding niet echt en gebeurt er niets. */
  let order: any = null;
  try {
    const token = await ontsleutel(kop.token_versleuteld);
    const d = await graphql({ domein: kop.domein, token }, `
      query($id: ID!) {
        order(id: $id) {
          id name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
          customer { displayName email }
          email
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

  /* ── de toestellen uit deze bestelling ──
     Herkennen doen we aan het product-ID dat we bij het publiceren hebben
     opgeslagen. Het korte nummer op de sku is de reservemanier, bijvoorbeeld
     als iemand het product in Shopify zelf opnieuw heeft aangemaakt. */
  const gevonden: { id: string; naam: string; code: string | null }[] = [];

  for (const r of regels) {
    const productId = r?.product?.id || null;
    const sku = r?.sku || null;

    let rij: any = null;
    if (productId) {
      const { data } = await admin.from("hardware")
        .select("id, status, kanalen, merk, model, code")
        .eq("team_id", kop.team_id)
        .eq("kanalen->shopify->>id", String(productId))
        .maybeSingle();
      rij = data;
    }
    if (!rij && sku) {
      const { data } = await admin.from("hardware")
        .select("id, status, kanalen, merk, model, code")
        .eq("team_id", kop.team_id)
        .or(`code.eq.${sku},serienummer.eq.${sku}`)
        .maybeSingle();
      rij = data;
    }
    if (!rij) continue;

    gevonden.push({
      id: rij.id,
      naam: [rij.merk, rij.model].filter(Boolean).join(" "),
      code: rij.code || null,
    });

    /* Geannuleerd betekent: hij is er weer. Zet hem terug op voorraad, want
       anders staat er een laptop in je magazijn die het systeem verkocht denkt
       te hebben. */
    if (geannuleerd) {
      if (rij.status === "verkocht") {
        await admin.from("hardware").update({
          status: "voorraad", verkocht_op: null, verkocht_via: null,
          bijgewerkt_op: new Date().toISOString(),
        }).eq("id", rij.id);
        console.log("shopify-webhook: bestelling geannuleerd, toestel", rij.id, "terug op voorraad");
      }
      continue;
    }

    if (rij.status === "verkocht") continue;

    const kanalen = (rij.kanalen && typeof rij.kanalen === "object") ? { ...rij.kanalen } : {};
    delete kanalen.shopify;

    await admin.from("hardware").update({
      status: "verkocht",
      verkocht_op: order.createdAt || new Date().toISOString(),
      verkocht_via: "webshop",
      kanalen,
      bijgewerkt_op: new Date().toISOString(),
    }).eq("id", rij.id);
    console.log("shopify-webhook: toestel", rij.id, "verkocht in de webshop");
  }

  /* ── de bestelling zelf bewaren ──
     Zodat je in Storvo ziet wat er besteld is en niet alleen dat er iets uit de
     voorraad verdwenen is. */
  const nummer = String(bestellingId).split("/").pop();
  const rij = {
    team_id: kop.team_id, kanaal: "shopify",
    bestelling_id: String(bestellingId),
    nummer: order.name || null,
    klant: order.customer?.displayName || null,
    email: order.customer?.email || order.email || null,
    bedrag: geld(order.totalPriceSet),
    valuta: order.totalPriceSet?.shopMoney?.currencyCode || kop.valuta || null,
    status: geannuleerd ? "geannuleerd" : (verzonden ? "verzonden" : (betaald ? "betaald" : "open")),
    betaald, verzonden, geannuleerd,
    regels: regels.map((r: any) => ({
      titel: r.title, sku: r.sku || null, aantal: r.quantity,
      bedrag: geld(r.originalTotalSet),
    })),
    toestellen: gevonden,
    beheer_url: `https://${kop.domein}/admin/orders/${nummer}`,
    geplaatst_op: order.createdAt || new Date().toISOString(),
    bijgewerkt_op: new Date().toISOString(),
  };

  const { data: bestaand } = await admin.from("webshop_bestellingen")
    .select("id").eq("team_id", kop.team_id).eq("kanaal", "shopify")
    .eq("bestelling_id", String(bestellingId)).maybeSingle();

  if (bestaand) {
    await admin.from("webshop_bestellingen").update(rij).eq("id", bestaand.id);
  } else {
    await admin.from("webshop_bestellingen").insert(rij);
  }

  return klaar();
});
