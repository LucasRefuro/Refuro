// Na een reservering de Shopify-voorraad van precies die grade-variant weer goed zetten.
//
// Een eigen bestand zonder Deno-imports, met de database en Shopify van buiten aangereikt,
// zodat tests/reservering-voorraad.js de hele weg na annuleren en vervallen kan nalopen.
//
// Wat er mis ging, en wat dit daarom anders doet:
// 1. Een fout werd alleen gelogd en de winkelapp zei toch "weer online". Nu komt de uitkomst
//    terug, met een zin die de winkelier kan lezen.
// 2. De variant uit de reservering kan verouderd zijn. Werd de advertentie intussen opnieuw
//    aangemaakt (tot edge shopify v27 gooide de sync het product weg als het laatste exemplaar
//    gereserveerd stond), dan wees het vrijgegeven toestel naar een variant die niet meer bestaat
//    en gebeurde er stil niets. We pakken daarom de variant van die grade uit webshop_producten
//    en hangen het toestel daar weer aan.
// 3. Het product kan op "niet vermeld" of concept staan. Komt er weer een exemplaar vrij, dan
//    moet het weer gewoon te koop zijn en in de lijsten staan.

type Gql = (query: string, variabelen?: unknown) => Promise<any>;

export type Deps = {
  gql: Gql | null;                 // null: geen webshop gekoppeld
  locatieId: string | null;
  registratie: (sleutel: string) => Promise<{ product_id: string; varianten: Record<string, string> } | null>;
  hardware: (id: string) => Promise<any | null>;
  herkoppel: (id: string, kanalen: Record<string, unknown>) => Promise<void>;
  tel: (variantGid: string) => Promise<number>;
};

export type Uitkomst = { ok: boolean; melding: string | null; variant?: string; van?: number; naar?: number; geactiveerd?: boolean };

export const MELDING = {
  geenWebshop: "Er is geen webshop gekoppeld, dus de webshop is niet bijgewerkt.",
  geenLocatie: "De webshop heeft geen winkellocatie voor de voorraad. Zet het toestel opnieuw online.",
  nietGevonden: "Dit toestel staat niet meer op de webshop. Zet het opnieuw online.",
};

/* Zet de voorraad van één variant absoluut op het doel (niet een delta: dat loopt nooit uit de
   pas met Storvo). Deze API-versie wil de huidige waarde erbij (changeFromQuantity) en een
   @idempotent-sleutel. Komt er voorraad bij en staat het product niet op actief, dan weer actief. */
export async function zetVariantVoorraad(gql: Gql, locatieId: string, variantGid: string, doelAantal: number) {
  const d = await gql(`query($id: ID!, $loc: ID!) {
    productVariant(id: $id) {
      product { id status }
      inventoryItem { id inventoryLevel(locationId: $loc) { quantities(names: ["available"]) { name quantity } } }
    }
  }`, { id: variantGid, loc: locatieId });
  const v = d?.productVariant;
  const item = v?.inventoryItem;
  if (!item?.id) return { gevonden: false, van: 0, naar: 0, geactiveerd: false };

  const q = (item.inventoryLevel?.quantities || []).find((x: any) => x?.name === "available");
  const van = q ? Number(q.quantity) : 0;
  const naar = Math.max(0, Math.round(Number(doelAantal) || 0));
  if (van !== naar) {
    const uit = await gql(`
      mutation($input: InventorySetQuantitiesInput!, $key: String!) {
        inventorySetQuantities(input: $input) @idempotent(key: $key) { userErrors { field message } }
      }`, {
      input: {
        name: "available", reason: "correction",
        quantities: [{ inventoryItemId: item.id, locationId: locatieId, quantity: naar, changeFromQuantity: van }],
      },
      key: crypto.randomUUID(),
    });
    const f = uit?.inventorySetQuantities?.userErrors || [];
    if (f.length) throw new Error("De voorraad op de webshop zetten lukte niet: " + f.map((e: any) => e.message).join(" · "));
  }

  let geactiveerd = false;
  if (naar > 0 && v.product?.id && v.product.status !== "ACTIVE") {
    const u = await gql(`
      mutation($p: ProductUpdateInput!) {
        productUpdate(product: $p) { product { id status } userErrors { field message } }
      }`, { p: { id: v.product.id, status: "ACTIVE" } });
    const f = u?.productUpdate?.userErrors || [];
    if (f.length) throw new Error("Het toestel weer zichtbaar maken lukte niet: " + f.map((e: any) => e.message).join(" · "));
    geactiveerd = true;
  }
  return { gevonden: true, van, naar, geactiveerd };
}

/* De variant waar deze grade NU op staat: uit de registratie als die er is, anders die van de
   reservering zelf. */
export async function variantVoor(deps: Deps, r: any) {
  let variant: string | null = r?.variant_id || null;
  let product: string | null = r?.product_id || null;
  if (r?.sleutel && r?.grade) {
    const reg = await deps.registratie(r.sleutel);
    const nu = reg?.varianten?.[r.grade];
    if (nu) { variant = nu; product = reg!.product_id || product; }
  }
  return { variant, product };
}

/* Na annuleren of vervallen: het toestel aan de huidige variant hangen en de voorraad van die
   variant gelijk zetten aan wat er in Storvo op voorraad staat. */
export async function herstelNaVrijgeven(deps: Deps, r: any): Promise<Uitkomst> {
  if (!deps.gql) return { ok: false, melding: MELDING.geenWebshop };
  if (!deps.locatieId) return { ok: false, melding: MELDING.geenLocatie };
  const { variant, product } = await variantVoor(deps, r);
  if (!variant) return { ok: false, melding: MELDING.nietGevonden };

  // Alleen een toestel dat echt weer vrij is en aan de webshop hangt. Is het intussen verkocht,
  // dan laten we het met rust; tellen gaat hieronder toch goed.
  if (r?.hardware_id) {
    const h = await deps.hardware(r.hardware_id);
    const sh = h?.kanalen?.shopify;
    if (h && h.status === "voorraad" && sh && (sh.variant !== variant || (product && sh.id !== product))) {
      const id = product || sh.id;
      await deps.herkoppel(h.id, { ...h.kanalen, shopify: { ...sh, variant, id, nummer: String(id || "").split("/").pop() } });
    }
  }

  const doel = await deps.tel(variant);
  const z = await zetVariantVoorraad(deps.gql, deps.locatieId, variant, doel);
  if (!z.gevonden) return { ok: false, melding: MELDING.nietGevonden };
  return { ok: true, melding: null, variant, van: z.van, naar: z.naar, geactiveerd: z.geactiveerd };
}
