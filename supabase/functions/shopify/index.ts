// Zet een toestel op de webshop, of haalt hem er weer af.
//
// Het probleem dat dit oplost: één laptop staat op Shopify, op Marktplaats en
// in de winkel. Verkoop je hem aan de balie, dan moet hij binnen een minuut
// overal offline. Anders verkoop je hem twee keer en mag je een klant bellen
// dat het toch niet doorgaat.
//
// Alles gaat via de GraphQL Admin API. De REST-endpoints voor producten zijn
// door Shopify afgeschreven; daarop bouwen zou betekenen dat dit binnen een
// jaar stilvalt.
//
// Het token komt uit de koppeling van díé winkel en komt nooit in de browser.

import { admin, cors, fout, wieBelt, graphql, letOp, koppelingVan } from "../_gedeeld/shopify.ts";

// De omschrijving die op de webshop komt te staan. Specificaties als lijstje,
// want dat is wat een koper van tweedehands hardware wil zien.
function beschrijving(h: any) {
  const specs = h.specs && typeof h.specs === "object" ? h.specs : {};
  const regels = Object.entries(specs)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `<li><b>${k}:</b> ${String(v)}</li>`)
    .join("");
  const staat: Record<string, string> = {
    A: "Als nieuw, nauwelijks gebruikssporen",
    B: "Gebruikt, in goede staat",
    C: "Zichtbare gebruikssporen, werkt naar behoren",
  };
  return [
    h.omschrijving ? `<p>${h.omschrijving}</p>` : "",
    regels ? `<h3>Specificaties</h3><ul>${regels}</ul>` : "",
    h.staat ? `<p><b>Staat:</b> ${staat[h.staat] || h.staat}</p>` : "",
    h.garantie ? `<p><b>Garantie:</b> ${h.garantie} maanden</p>` : "",
    h.serienummer ? `<p class="serie"><small>Serienummer ${h.serienummer}</small></p>` : "",
  ].filter(Boolean).join("\n");
}

/* Een toestel is altijd één stuk met één uitvoering. Shopify wil toch een
   optie hebben; die heet dan "Titel" met één waarde, precies zoals Shopify het
   zelf doet bij een product zonder varianten. */
const ENIGE_OPTIE = { optionName: "Title", name: "Default Title" };

async function fotosVan(h: any) {
  const lijst = Array.isArray(h.fotos) ? h.fotos.filter((u: any) => typeof u === "string" && u.startsWith("http")) : [];
  return lijst.slice(0, 10).map((u: string) => ({
    originalSource: u, alt: [h.merk, h.model].filter(Boolean).join(" "), contentType: "IMAGE",
  }));
}

/* Ligt dit toestel op de winkellocatie, of in het magazijn of de werkplaats? Dat
   bepaalt op de productpagina of "ophalen in de winkel" aangeklikt mag worden.
   We schrijven het als metafield refuro.winkelvoorraad (1 of 0); het thema leest
   dat en zet de ophaaloptie aan of grijs. Soort "winkel" is de fysieke winkel. */
async function ligtInWinkel(locatieId: string | null): Promise<boolean> {
  if (!locatieId) return false;
  const { data: loc } = await admin.from("hardware_locaties")
    .select("soort").eq("id", locatieId).maybeSingle();
  return loc?.soort === "winkel";
}

// Eén regel voor het metafield, hergebruikt bij online zetten en bij verplaatsen.
function winkelvoorraadMetafield(inWinkel: boolean) {
  return { namespace: "refuro", key: "winkelvoorraad", type: "number_integer", value: inWinkel ? "1" : "0" };
}

/* Een nieuwe accu is een verkoopargument: het thema toont er een badge en de
   regel "nieuwe accu, 69 euro bespaard" bij. Storvo weet alleen of er een nieuwe
   accu in zit; het bedrag hoort bij het losse accu-product en staat in het thema. */
function nieuweAccuMetafield(nieuw: boolean) {
  return { namespace: "refuro", key: "nieuwe_accu", type: "number_integer", value: nieuw ? "1" : "0" };
}

/* De gebruik-tags voeden de filters in het mega-menu en de laptop-adviseur
   (gebruik-thuis, gebruik-studie, gebruik-werk, gebruik-programmeren,
   gebruik-creatief, gebruik-gaming). We leiden ze grof af uit de specs. Alleen
   voor computers; telefoons, tablets en monitoren hebben deze filters niet. Beter
   een paar kloppende tags dan lege filters; fijnslijpen kan later in deze functie. */
function eersteGetal(s: unknown): number {
  const m = String(s ?? "").match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : 0;
}
/* Het thema leest per product een paar metafields die Storvo tot nu toe niet
   meestuurde, waardoor de staat-badge, de spec-regels op de kaart en het
   groeperen van hetzelfde model leeg bleven. We sturen ze nu mee, op één set
   sleutels zodat push en thema niet uit elkaar lopen. Staat blijft A/B/C (het
   thema mapt dat naar Uitstekend/Zeer goed/Prima). */
function mfText(key: string, val: unknown) {
  return { namespace: "refuro", key, type: "single_line_text_field", value: String(val) };
}
function slug(s: string) {
  return String(s || "").toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function themaMetafields(h: any) {
  const sp = (h.specs && typeof h.specs === "object") ? h.specs : {};
  const out: any[] = [];
  if (h.staat) out.push(mfText("staat", h.staat));
  if (sp.Processor) out.push(mfText("cpu", sp.Processor));
  if (sp.Geheugen) out.push(mfText("ram", sp.Geheugen));
  if (sp.Opslag) out.push(mfText("opslag", sp.Opslag));
  if (sp.Scherm) out.push(mfText("scherm", sp.Scherm));
  const mk = slug([h.merk, h.model].filter(Boolean).join(" "));
  if (mk) out.push(mfText("model_key", mk));
  if (h.nieuwprijs != null && h.nieuwprijs !== "") {
    out.push({ namespace: "refuro", key: "nieuwprijs", type: "number_decimal", value: String(Number(h.nieuwprijs)) });
  }
  return out;
}

function gebruikTags(h: any): string[] {
  if (!["Laptop", "Desktop"].includes(h.categorie || "")) return [];
  const sp = (h.specs && typeof h.specs === "object") ? h.specs : {};
  const cpu = String(sp.Processor || sp.CPU || "").toLowerCase();
  const gpuVeld = String(sp.Videokaart || sp.GPU || "").toLowerCase();
  const ram = eersteGetal(sp.Geheugen || sp.RAM);
  const ssd = /ssd|nvme|m\.?2/.test(String(sp.Opslag || "").toLowerCase());

  // CPU grofweg: 3 = sterk, 2 = degelijk, 1 = instap.
  let cpuNiv = 2;
  if (/i7|i9|ryzen 7|ryzen 9|\bm[1-9]\b|xeon|ultra [79]/.test(cpu)) cpuNiv = 3;
  else if (/i3|ryzen 3|celeron|pentium|athlon|atom|\bn\d{3,4}\b/.test(cpu)) cpuNiv = 1;
  else if (/i5|ryzen 5|ultra 5/.test(cpu)) cpuNiv = 2;

  // Een aparte videokaart maakt gaming en zwaar creatief werk mogelijk.
  const losseGpu = /gtx|rtx|geforce|radeon rx|\brx ?\d|arc a\d|quadro/.test(gpuVeld) ||
                   /gtx|rtx|geforce|radeon rx/.test(cpu);

  const t = new Set<string>();
  if (ram >= 4) t.add("gebruik-thuis");
  if (cpuNiv >= 2 && ram >= 8 && ssd) { t.add("gebruik-studie"); t.add("gebruik-werk"); }
  if (cpuNiv >= 2 && ram >= 16 && ssd) t.add("gebruik-programmeren");
  if (cpuNiv >= 3 && ram >= 16) t.add("gebruik-creatief");
  if (losseGpu && ram >= 8) t.add("gebruik-gaming");
  return [...t];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const acc = await wieBelt(req);
  if (!acc) return fout("Niet ingelogd", 401);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const actie = String(lijf?.actie || "");
  const id = String(lijf?.hardware_id || "");
  if (!id) return fout("Geen toestel meegegeven");

  const k = await koppelingVan(acc.team_id);
  if (!k) {
    return fout("Er is nog geen webshop gekoppeld. Dat doe je bij Instellingen, onder Webshop.", 409);
  }

  // Altijd zelf ophalen, zodat de browser niet kan bepalen wat er verkocht wordt.
  const { data: h } = await admin.from("hardware")
    .select("*").eq("id", id).eq("team_id", acc.team_id).maybeSingle();
  if (!h) return fout("Dit toestel is niet gevonden", 404);

  const kanalen = (h.kanalen && typeof h.kanalen === "object") ? { ...h.kanalen } : {};

  try {
    if (actie === "online") {
      if (h.verkoop == null) return fout("Vul eerst een vraagprijs in");
      const titel = h.titel || [h.merk, h.model].filter(Boolean).join(" ");
      const bestaand = kanalen.shopify?.id || null;
      const inWinkel = await ligtInWinkel(h.locatie_id);

      /* productSet doet in één keer wat vroeger vier aanroepen kostte: het
         product, de variant, de prijs en de voorraad. Dat scheelt niet alleen
         tijd; het scheelt vooral half-aangemaakte producten als er onderweg
         iets misgaat. */
      const invoer: any = {
        title: titel,
        descriptionHtml: beschrijving(h),
        vendor: h.merk || "Storvo",
        productType: h.categorie || "Laptop",
        status: "ACTIVE",
        tags: ["refurbished", h.staat ? "staat-" + h.staat : "", h.code || "", ...gebruikTags(h)].filter(Boolean),
        metafields: [winkelvoorraadMetafield(inWinkel), nieuweAccuMetafield(!!h.nieuwe_accu), ...themaMetafields(h)],
        productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
        variants: [{
          price: String(h.verkoop),
          sku: h.code || h.serienummer || undefined,
          inventoryPolicy: "DENY",
          optionValues: [ENIGE_OPTIE],
          ...(k.locatie_id ? {
            inventoryQuantities: [{ locationId: k.locatie_id, name: "available", quantity: 1 }],
          } : {}),
        }],
      };
      if (bestaand) invoer.id = bestaand;

      const files = await fotosVan(h);
      if (files.length && !bestaand) invoer.files = files;

      const uit = await graphql(k, `
        mutation($input: ProductSetInput!) {
          productSet(input: $input, synchronous: true) {
            product { id handle title onlineStoreUrl
              variants(first: 1) { nodes { id } } }
            userErrors { field message }
          }
        }`, { input: invoer });
      const p = letOp(uit?.productSet, "Het aanmaken op de webshop").product;
      if (!p?.id) throw new Error("Shopify gaf geen product terug");
      const variant = p?.variants?.nodes?.[0]?.id || null;

      /* Aanmaken is niet hetzelfde als zichtbaar zijn. Zonder deze stap staat
         het toestel keurig in je Shopify-beheer en ziet geen enkele klant het.
         Dat is de fout die je pas ontdekt als iemand vraagt waar die laptop
         nou staat. */
      let zichtbaar = false;
      if (k.publicatie_id) {
        const pub = await graphql(k, `
          mutation($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) {
              userErrors { field message }
            }
          }`, { id: p.id, input: [{ publicationId: k.publicatie_id }] });
        letOp(pub?.publishablePublish, "Het zichtbaar maken in de webshop");
        zichtbaar = true;
      }

      const nummer = String(p.id).split("/").pop();
      kanalen.shopify = {
        id: p.id,
        nummer,
        variant,
        url: p.onlineStoreUrl || (p.handle ? `https://${k.domein}/products/${p.handle}` : null),
        beheer: `https://${k.domein}/admin/products/${nummer}`,
        zichtbaar,
        sinds: new Date().toISOString(),
      };
      await admin.from("hardware").update({
        kanalen, bijgewerkt_op: new Date().toISOString(),
      }).eq("id", id);

      return new Response(JSON.stringify({
        ok: true, kanalen,
        waarschuwing: zichtbaar ? null
          : "Het toestel staat op Shopify maar is nog niet in de webshop gepubliceerd. " +
            "Kijk bij Instellingen of de koppeling het verkoopkanaal heeft gevonden.",
      }), { headers: cors });
    }

    if (actie === "offline") {
      const s = kanalen.shopify;
      if (s?.id) {
        // Verwijderen in plaats van op nul zetten: een verkocht toestel komt
        // nooit meer terug, en een lege productpagina is slechter dan geen.
        try {
          const uit = await graphql(k, `
            mutation($input: ProductDeleteInput!) {
              productDelete(input: $input) { deletedProductId userErrors { field message } }
            }`, { input: { id: s.id } });
          letOp(uit?.productDelete, "Het weghalen van de webshop");
        } catch (e) {
          // Al weg bij Shopify is geen fout: dan klopt onze administratie juist.
          console.error("shopify verwijderen", e);
        }
      }
      delete kanalen.shopify;
      await admin.from("hardware").update({
        kanalen, bijgewerkt_op: new Date().toISOString(),
      }).eq("id", id);
      return new Response(JSON.stringify({ ok: true, kanalen }), { headers: cors });
    }

    if (actie === "prijs") {
      const s = kanalen.shopify;
      if (!s?.id || !s?.variant) return fout("Dit toestel staat niet op de webshop");
      const uit = await graphql(k, `
        mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id price }
            userErrors { field message }
          }
        }`, {
        productId: s.id,
        variants: [{ id: s.variant, price: String(h.verkoop ?? 0) }],
      });
      letOp(uit?.productVariantsBulkUpdate, "Het bijwerken van de prijs");
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (actie === "locatie") {
      // Alleen de ophaal-indicator op de productpagina bijwerken nadat een toestel
      // is verplaatst. Staat het niet online, dan is er niets te doen.
      const s = kanalen.shopify;
      if (!s?.id) return new Response(JSON.stringify({ ok: true, overgeslagen: true }), { headers: cors });
      const inWinkel = await ligtInWinkel(h.locatie_id);
      const uit = await graphql(k, `
        mutation($mf: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $mf) {
            userErrors { field message }
          }
        }`, { mf: [{ ownerId: s.id, ...winkelvoorraadMetafield(inWinkel) }] });
      letOp(uit?.metafieldsSet, "Het bijwerken van de winkelvoorraad");
      return new Response(JSON.stringify({ ok: true, winkelvoorraad: inWinkel ? 1 : 0 }), { headers: cors });
    }

    return fout("Onbekende actie");
  } catch (e) {
    console.error("shopify", actie, e);
    const melding = e instanceof Error ? e.message : "De webshop reageerde niet";
    /* Een token dat niet meer werkt is geen incident maar een toestand. Zetten
       we dat niet vast, dan blijft de winkelier het proberen zonder te weten
       waarom het niet lukt. */
    if (/token niet meer/i.test(melding)) {
      await admin.from("winkel_koppelingen")
        .update({ status: "fout", fout: melding, laatst_gecontroleerd: new Date().toISOString() })
        .eq("team_id", acc.team_id).eq("kanaal", "shopify");
    }
    return fout(melding, 502);
  }
});
