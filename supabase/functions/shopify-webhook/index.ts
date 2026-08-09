// Shopify meldt hier dat er iets verkocht is in de webshop.
//
// Zonder deze functie loopt je voorraad uit de pas: iemand koopt online een
// laptop, en jij verkoopt hem een uur later nog een keer aan de balie.
//
// Er zitten drie sloten op deze deur, want dit is een adres dat iedereen op
// internet kan aanroepen:
//
//   1. Het adres zelf bevat een geheim stukje dat bij één winkel hoort. Wie dat
//      niet heeft, komt niet binnen.
//   2. Shopify vertelt bij elke melding om welke winkel het gaat. Klopt die
//      niet met de winkel achter dat geheim, dan doen we niets.
//   3. En het belangrijkste: we geloven de inhoud van de melding niet. We
//      halen de bestelling zelf op bij Shopify, met ons eigen token. Iemand die
//      een valse melding stuurt krijgt dus niets voor elkaar, want de
//      bestelling bestaat daar niet.
//
// Dat derde slot is wat dit anders maakt dan alleen een handtekening
// controleren: ook als het geheim ooit uitlekt, kan niemand hiermee jouw
// voorraad leegtrekken.

import { admin, graphql, ontsleutel } from "../_gedeeld/shopify.ts";

function klaar(tekst = "ok", status = 200) {
  return new Response(tekst, { status });
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
  let melding: any;
  try { melding = JSON.parse(lijf); } catch { return klaar("Onleesbaar", 400); }

  const orderNummer = melding?.admin_graphql_api_id
    || (melding?.id ? `gid://shopify/Order/${melding.id}` : null);
  if (!orderNummer) return klaar();

  /* De bestelling zelf ophalen. Dit is meteen de controle: bestaat hij niet,
     dan was de melding niet echt en gebeurt er niets. */
  let regels: any[] = [];
  try {
    const token = await ontsleutel(kop.token_versleuteld);
    const d = await graphql({ domein: kop.domein, token }, `
      query($id: ID!) {
        order(id: $id) {
          id name cancelledAt
          lineItems(first: 100) {
            nodes { sku quantity product { id } variant { id } }
          }
        }
      }`, { id: orderNummer });

    if (!d?.order) {
      console.error("shopify-webhook: bestelling", orderNummer, "bestaat niet bij Shopify");
      return klaar("Ongeldig", 401);
    }
    if (d.order.cancelledAt) return klaar();
    regels = d.order.lineItems?.nodes || [];
  } catch (e) {
    console.error("shopify-webhook: bestelling ophalen mislukt", e);
    /* Een fout van onze kant is geen reden om Shopify te laten stoppen met
       proberen. Een foutstatus zorgt dat Shopify het later opnieuw stuurt. */
    return klaar("Later opnieuw", 500);
  }

  for (const r of regels) {
    const productId = r?.product?.id || null;
    const sku = r?.sku || null;

    /* We herkennen het toestel aan het product-ID dat we bij het publiceren
       hebben opgeslagen. De sku is het korte nummer van het toestel en dient
       als reservemanier, bijvoorbeeld als iemand het product in Shopify zelf
       opnieuw heeft aangemaakt. */
    let rij: any = null;
    if (productId) {
      const { data } = await admin.from("hardware")
        .select("id, status, kanalen")
        .eq("team_id", kop.team_id)
        .eq("kanalen->shopify->>id", String(productId))
        .maybeSingle();
      rij = data;
    }
    if (!rij && sku) {
      const { data } = await admin.from("hardware")
        .select("id, status, kanalen")
        .eq("team_id", kop.team_id)
        .or(`code.eq.${sku},serienummer.eq.${sku}`)
        .neq("status", "verkocht")
        .maybeSingle();
      rij = data;
    }
    if (!rij || rij.status === "verkocht") continue;

    const kanalen = (rij.kanalen && typeof rij.kanalen === "object") ? { ...rij.kanalen } : {};
    delete kanalen.shopify;

    await admin.from("hardware").update({
      status: "verkocht",
      verkocht_op: new Date().toISOString(),
      verkocht_via: "webshop",
      kanalen,
      bijgewerkt_op: new Date().toISOString(),
    }).eq("id", rij.id);

    console.log("shopify-webhook: toestel", rij.id, "verkocht in de webshop");
  }

  return klaar();
});
