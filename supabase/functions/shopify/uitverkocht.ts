// Het laatste exemplaar van een advertentie is weg. Het product blijft bestaan, maar niet te koop.
//
// Vroeger ging het product dan weg (productDelete). Dat maakte de link een foutpagina, precies
// op het moment dat iemand hem open had of net gedeeld had, en dan was er ook geen plek meer om
// een vergelijkbaar toestel aan te raden. Nu: voorraad naar 0 en de status "niet vermeld"
// (UNLISTED). Dan staat hij niet meer in de categorieën, de zoekfunctie en de aanbevelingen,
// maar de link werkt nog en het thema toont daar "Net verkocht" met vergelijkbare toestellen.
// Komt dezelfde uitvoering terug, dan pakt synchroniseerAdvertentie via webshop_producten
// hetzelfde product weer op: zelfde link, weer gewoon in de lijsten.
//
// Geen Deno-imports en de GraphQL-aanroep komt van buiten, zodat tests/webshop-uitverkocht.js
// dit in Node kan laden met een nagebootste Shopify.

type Gql = (query: string, variabelen?: unknown) => Promise<any>;
export type Status = "UNLISTED" | "DRAFT" | "ACTIVE";

/* Welke status het product krijgt als er geen exemplaar meer te koop is. */
export function statusNaLaatste(o: { verkocht: boolean; gereserveerd: number }): Status {
  // Een open reservering kan nog vervallen. Dan moet hij meteen weer te koop zijn, gewoon in
  // de lijsten; de reservering-edge zet alleen de voorraad terug, niet de status.
  if (o.gereserveerd > 0) return "ACTIVE";
  // Verkocht: de pagina blijft, met "Net verkocht" en de alternatieven.
  if (o.verkocht) return "UNLISTED";
  // Zelf offline gehaald of verwijderd (een fout gevonden): dan hoort er geen "verkocht" te
  // staan. Concept is onzichtbaar, maar houdt het product voor als hij terugkomt.
  return "DRAFT";
}

/* Voorraad van elke variant op 0, dan de status. In die volgorde: lukt de status niet, dan is
   hij in elk geval niet meer te koop. Geeft { bestaat: false } als het product in Shopify al
   weg is (met de hand verwijderd); dan moet de registratie op. */
export async function zetUitverkocht(gql: Gql, locatieId: string | null, productId: string, status: Status) {
  const velden = locatieId
    ? `inventoryItem { id inventoryLevel(locationId: $loc) { quantities(names: ["available"]) { name quantity } } }`
    : `inventoryItem { id }`;
  const d = await gql(
    `query($id: ID!${locatieId ? ", $loc: ID!" : ""}) { product(id: $id) { id status variants(first: 20) { nodes { id ${velden} } } } }`,
    locatieId ? { id: productId, loc: locatieId } : { id: productId },
  );
  const p = d?.product;
  if (!p?.id) return { bestaat: false, status: null, opNul: 0 };

  // Alleen wat nog niet op 0 staat. Deze API-versie wil per regel de huidige waarde
  // (changeFromQuantity) en een @idempotent-sleutel, zie ook reservering/index.ts.
  const regels: any[] = [];
  if (locatieId) {
    for (const v of (p.variants?.nodes || [])) {
      const item = v?.inventoryItem;
      const q = (item?.inventoryLevel?.quantities || []).find((x: any) => x?.name === "available");
      if (item?.id && q && Number(q.quantity) !== 0) {
        regels.push({ inventoryItemId: item.id, locationId: locatieId, quantity: 0, changeFromQuantity: Number(q.quantity) });
      }
    }
  }
  if (regels.length) {
    const uit = await gql(`
      mutation($input: InventorySetQuantitiesInput!, $key: String!) {
        inventorySetQuantities(input: $input) @idempotent(key: $key) { userErrors { field message } }
      }`, { input: { name: "available", reason: "correction", quantities: regels }, key: crypto.randomUUID() });
    const f = uit?.inventorySetQuantities?.userErrors || [];
    if (f.length) throw new Error("De voorraad op 0 zetten lukte niet: " + f.map((e: any) => e.message).join(" · "));
  }

  if (p.status !== status) {
    const u = await gql(`
      mutation($p: ProductUpdateInput!) {
        productUpdate(product: $p) { product { id status } userErrors { field message } }
      }`, { p: { id: productId, status } });
    const f = u?.productUpdate?.userErrors || [];
    if (f.length) throw new Error("De status op de webshop zetten lukte niet: " + f.map((e: any) => e.message).join(" · "));
  }
  return { bestaat: true, status, opNul: regels.length };
}

/* Bestaat het product uit de registratie nog in Shopify? Een verkocht product blijft nu staan,
   dus de kans is groter dat de winkelier het ooit met de hand weggooit. Dan maakt de volgende
   sync een nieuw product in plaats van vast te lopen op een id dat niet meer bestaat. */
export async function bestaatProduct(gql: Gql, productId: string): Promise<boolean> {
  const d = await gql(`query($id: ID!) { product(id: $id) { id } }`, { id: productId });
  return !!d?.product?.id;
}
