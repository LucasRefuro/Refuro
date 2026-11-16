// Extra's bij een toestel op de webshop zetten, met de voorraad uit de winkelapp.
//
// Een eigen functie en geen actie in "shopify": die is groot en wordt ook vanuit de webshop-chat
// uitgerold. Zo raken twee mensen elkaars werk niet bij een redeploy. De paar hulpjes hieronder
// zijn exact overgenomen uit _gedeeld/shopify.ts (net als in shopify-webhook), zodat de deploy
// uit één bestand bestaat.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API = "2026-07";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}
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
  const uit = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, k, bytes.slice(12));
  return new TextDecoder().decode(uit);
}
async function koppelingVan(teamId: string) {
  const { data } = await admin.from("winkel_koppelingen")
    .select("*").eq("team_id", teamId).eq("kanaal", "shopify").maybeSingle();
  if (!data) return null;
  return { ...data, token: await ontsleutel(data.token_versleuteld) };
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
function letOp(blok: any, wat: string) {
  const f = blok?.userErrors;
  if (Array.isArray(f) && f.length) throw new Error(wat + ": " + f.map((e: any) => e.message).join(" · "));
  return blok;
}
async function bestaatProduct(gql: (q: string, v?: unknown) => Promise<any>, productId: string) {
  const d = await gql(`query($id: ID!) { product(id: $id) { id } }`, { id: productId });
  return !!d?.product?.id;
}
async function wieBelt(req: Request) {
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return null;
  const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } });
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return null;
  const { data: acc } = await admin.from("accounts").select("id, team_id, rol").eq("id", wie.user.id).maybeSingle();
  return acc || null;
}

/* ═══ Extra's bij een toestel ═══
   Stekker, glas, hoesje, beschermset, muis, sleeve en de dienst "klaar voor gebruik", die de
   klant op de webshop bij een toestel aanvinkt (november 2026). Wat er is en wat het kost staat
   in de tabel webshop_extras; de voorraad is die van de producten in de winkelapp. De winkelapp
   stuurt die mee (voorraad per barcode), want alleen hij kent de laatste stand van de blob.

   Eén voorraad voor winkel en webshop: verkoop je een glas aan de balie, dan stuurt de winkelapp
   de nieuwe stand en gaat hij hier ook online omlaag. Een webshopverkoop die de winkelapp nog niet
   van de voorraad heeft gehaald (extras_boeking leeg) trekken we er hier eerst af. Anders zou de
   winkelapp in dat gat de oude, hogere stand terugzetten en verkoop je hem online twee keer.

   Per uitvoering zijn er delen (glas, hoesje), elk met alternatieven: het product dat al in de
   winkel ligt en de Xssive van de inkooplijst. Een uitvoering is er zolang van elk deel iets ligt.
   Afboeken gaat steeds uit het eerste alternatief met voorraad; de winkelapp doet het net zo.

   Het thema leest het metafield refuro.extra (bij welk soort toestel, welke modellen per
   uitvoering) en toont alleen wat bij het toestel past en er is. Verborgen voor zoeken, net als
   de nieuwe accu: los heeft het geen zin. Een uitgezette extra wordt een concept. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);
  const acc = await wieBelt(req);
  if (!acc) return fout("Niet ingelogd", 401);
  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }

  const kk = await koppelingVan(acc.team_id);
  if (!kk) return fout("Er is nog geen webshop gekoppeld.", 409);
  const voorraad: Record<string, number> = (lijf?.voorraad && typeof lijf.voorraad === "object") ? lijf.voorraad : {};
  const alleen: string[] | null = Array.isArray(lijf?.sleutels) ? lijf.sleutels.map(String) : null;

  const { data: extras, error: e1 } = await admin.from("webshop_extras")
    .select("*").eq("team_id", acc.team_id).order("volgorde", { ascending: true });
  if (e1) return fout("De extra's ophalen lukte niet", 500);

  const over: Record<string, number> = {};
  for (const [bc, n] of Object.entries(voorraad)) over[String(bc)] = Math.max(0, Math.floor(Number(n) || 0));
  const { data: open } = await admin.from("webshop_bestellingen").select("extras")
    .eq("team_id", acc.team_id).is("extras_boeking", null).eq("geannuleerd", false);
  for (const b of open || []) {
    for (const e of (Array.isArray(b.extras) ? b.extras : [])) {
      const n = Math.max(1, Math.floor(Number(e?.aantal) || 1));
      for (const deel of (Array.isArray(e?.delen) ? e.delen : [])) {
        let rest = n;
        for (const bc of (Array.isArray(deel) ? deel : [])) {
          if (rest <= 0) break;
          const k = Math.min(rest, over[String(bc)] || 0);
          over[String(bc)] = (over[String(bc)] || 0) - k; rest -= k;
        }
      }
    }
  }
  const aantalVan = (v: any) => {
    const delen = Array.isArray(v?.delen) ? v.delen : [];
    if (!delen.length) return 0;
    return Math.min(...delen.map((d: any) => (Array.isArray(d) ? d : []).reduce((n: number, bc: any) => n + (over[String(bc)] || 0), 0)));
  };
  const slug = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const html = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const uitslag: any[] = [];
  for (const x of extras || []) {
    if (alleen && !alleen.includes(x.sleutel)) continue;
    const varianten: any[] = Array.isArray(x.varianten) ? x.varianten : [];
    if (!varianten.length) continue;
    try {
      const dienst = x.soort === "dienst";
      const enkel = varianten.length === 1;
      const optie = enkel ? "Title" : "Uitvoering";
      const bestaand: Record<string, any> = (x.shopify_varianten && typeof x.shopify_varianten === "object") ? x.shopify_varianten : {};

      let productId: string | null = x.shopify_product_id || null;
      if (productId && !(await bestaatProduct((q: string, v?: unknown) => graphql(kk, q, v), productId))) productId = null;
      if (!productId) {
        const d = await graphql(kk, `query($q: String!){ products(first: 1, query: $q){ nodes { id handle } } }`, { q: "handle:extra-" + x.sleutel });
        const n = d?.products?.nodes?.[0];
        if (n && n.handle === "extra-" + x.sleutel) productId = n.id;
      }

      const vs = varianten.map((v: any) => {
        const label = String(v?.label || "Standaard");
        const r: any = {
          optionValues: [{ optionName: optie, name: enkel ? "Default Title" : label }],
          price: Number(v?.prijs ?? x.prijs).toFixed(2),
          sku: ("EXTRA-" + x.sleutel + "-" + slug(label)).toUpperCase().slice(0, 100),
          taxable: true,
        };
        if (dienst) {
          r.inventoryPolicy = "CONTINUE";
          r.inventoryItem = { tracked: false, requiresShipping: false };
        } else {
          r.inventoryPolicy = "DENY";
          r.inventoryItem = { tracked: true, requiresShipping: true };
          if (kk.locatie_id) r.inventoryQuantities = [{ locationId: kk.locatie_id, name: "available", quantity: x.actief ? aantalVan(v) : 0 }];
        }
        if (productId && bestaand[label]?.id) r.id = bestaand[label].id;
        return r;
      });

      const voorThema = {
        sleutel: x.sleutel, soort: x.soort, voor: x.voor || [], alleen_ophalen: !!x.alleen_ophalen,
        varianten: varianten.map((v: any) => ({
          label: String(v?.label || "Standaard"), modellen: Array.isArray(v?.modellen) ? v.modellen : [],
          ...(Array.isArray(v?.inch) ? { inch: v.inch } : {}), ...(v?.categorie ? { categorie: v.categorie } : {}),
        })),
      };
      const invoer: any = {
        title: x.naam, handle: "extra-" + x.sleutel,
        descriptionHtml: x.omschrijving ? "<p>" + html(String(x.omschrijving)) + "</p>" : "",
        vendor: "Refuro", productType: "Extra", status: x.actief ? "ACTIVE" : "DRAFT",
        tags: ["extra", "extra-" + x.sleutel, ...(dienst ? ["dienst"] : [])],
        productOptions: [{ name: optie, values: vs.map((v: any) => ({ name: v.optionValues[0].name })) }],
        variants: vs,
        metafields: [
          { namespace: "seo", key: "hidden", type: "number_integer", value: "1" },
          { namespace: "refuro", key: "extra", type: "json", value: JSON.stringify(voorThema) },
        ],
      };
      if (productId) invoer.id = productId;
      const uit = await graphql(kk, `
        mutation($input: ProductSetInput!) {
          productSet(input: $input, synchronous: true) {
            product { id handle variants(first: 100) { nodes { id sku } } }
            userErrors { field message }
          }
        }`, { input: invoer });
      const p = letOp(uit?.productSet, "Extra op de webshop zetten").product;
      if (kk.publicatie_id && p?.id && x.actief) {
        const pub = await graphql(kk, `mutation($id: ID!, $input: [PublicationInput!]!){ publishablePublish(id: $id, input: $input){ userErrors { field message } } }`, { id: p.id, input: [{ publicationId: kk.publicatie_id }] });
        letOp(pub?.publishablePublish, "Extra zichtbaar maken");
      }
      // Per uitvoering het variant-id en de sku terug, zodat de webhook een verkochte regel herkent.
      const perSku: Record<string, string> = {};
      for (const n of p?.variants?.nodes || []) if (n?.sku) perSku[String(n.sku)] = n.id;
      const sv: Record<string, any> = {};
      vs.forEach((v: any, i: number) => {
        const label = String(varianten[i]?.label || "Standaard");
        if (perSku[v.sku]) sv[label] = { id: perSku[v.sku], sku: v.sku };
      });
      await admin.from("webshop_extras").update({ shopify_product_id: p.id, shopify_varianten: sv, bijgewerkt_op: new Date().toISOString() })
        .eq("id", x.id).eq("team_id", acc.team_id);
      uitslag.push({ sleutel: x.sleutel, ok: true, product_id: p.id,
        op_voorraad: dienst ? null : varianten.filter((v: any) => aantalVan(v) > 0).length, uitvoeringen: varianten.length });
    } catch (e) {
      uitslag.push({ sleutel: x.sleutel, ok: false, fout: e instanceof Error ? e.message : String(e) });
    }
  }
  return new Response(JSON.stringify({ ok: true, uitslag }), { headers: cors });
});
