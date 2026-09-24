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

import {
  admin, cors, fout, wieBelt, graphql, letOp, koppelingVan,
  bouwProductMetafields,
  webshopSleutel, gradeLetter, gradeSchat, GRADE_LETTERS, GRADE_NAAM,
} from "../_gedeeld/shopify.ts";

/* De categorie-collecties van het thema zijn HANDMATIG (geen slimme regels op
   producttype), dus vullen ze zich niet vanzelf. Storvo zet een toestel daarom zelf
   in de juiste collectie(s), anders staat het wel online maar in geen categorie en
   vindt niemand het. Handles komen uit het thema: laptops + macbooks/windows-laptops,
   telefoons, tablets, smartwatches. Desktop/Monitor/Overig hebben geen categorie in
   het design. */
function collectieHandles(h: any): string[] {
  const c = String(h.categorie || "").toLowerCase();
  const tekst = (String(h.merk || "") + " " + String(h.model || "")).toLowerCase();
  if (c === "laptop") return ["laptops", /apple|macbook/.test(tekst) ? "macbooks" : "windows-laptops"];
  if (c === "telefoon") return ["telefoons"];
  if (c === "tablet") return ["tablets"];
  if (c === "smartwatch" || c === "horloge") return ["smartwatches"];
  return [];
}
async function inCollectiesZetten(k: any, productId: string, h: any): Promise<string[]> {
  const gelukt: string[] = [];
  for (const handle of collectieHandles(h)) {
    try {
      const cd = await graphql(k, `query($q: String!){ collections(first: 1, query: $q){ nodes { id } } }`,
        { q: "handle:" + handle });
      const cid = cd?.collections?.nodes?.[0]?.id;
      if (!cid) continue;
      const add = await graphql(k, `
        mutation($id: ID!, $productIds: [ID!]!) {
          collectionAddProductsV2(id: $id, productIds: $productIds) {
            job { id } userErrors { field message }
          }
        }`, { id: cid, productIds: [productId] });
      letOp(add?.collectionAddProductsV2, "Het toevoegen aan de collectie " + handle);
      gelukt.push(handle);
    } catch (e) { console.error("collectie", handle, e); }
  }
  return gelukt;
}

// De omschrijving op de webshop is alleen het verhaaltje. De specificaties, de staat
// en de garantie staan als metafields in hun eigen blokken op de productpagina; die
// zetten we hier NIET nog eens in de tekst, anders staat alles dubbel.
function beschrijving(h: any) {
  // Bij een telefoon of tablet is het serienummer meestal het IMEI; dat laten we weg.
  // Bij een laptop helpt het serienummer de koper juist met de echtheid.
  const toonSerie = !["Telefoon", "Tablet"].includes(h.categorie || "");
  return [
    h.omschrijving ? `<p>${h.omschrijving}</p>` : "",
    h.serienummer && toonSerie ? `<p class="serie"><small>Serienummer ${h.serienummer}</small></p>` : "",
  ].filter(Boolean).join("\n");
}

function fotosVan(h: any) {
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

/* De accu en de conditie-items staan niet op de hardware-rij maar op de controle
   (refurbish_apparaten). Die halen we erbij zodat de accu-badge en de "wat wij
   zagen"-tekst op de productpagina kloppen. Geen controle gevonden (een toestel
   dat handmatig in de voorraad is gezet)? Dan blijven die twee gewoon leeg. */
async function controleBij(hardwareId: string) {
  const { data } = await admin.from("refurbish_apparaten")
    .select("accu, checklist, grade, notitie").eq("hardware_id", hardwareId).limit(1);
  return data?.[0] ?? null;
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

/* ── één advertentie synchroniseren ──
   Het hart van de grade-varianten: alle beschikbare exemplaren van dezelfde uitvoering (sleutel)
   staan op ÉÉN Shopify-product met drie grade-varianten (Uitstekend/Zeer goed/Prima). De prijs per
   grade komt uit webshop_grade_prijzen (of geschat), de voorraad per grade is het aantal onverkochte
   exemplaren van die grade. Zo wordt een tweede exemplaar geen nieuwe advertentie maar voorraad +1,
   en verschijnt een grade die je nog niet had zodra er een binnenkomt. Zijn er geen exemplaren meer,
   dan gaat het product weg. Bron van waarheid: de tabel webshop_producten (sleutel -> product + de
   variant-id's per grade), zodat de webhook een verkochte variant kan terugvertalen. */
async function synchroniseerAdvertentie(k: any, teamId: string, sleutel: string) {
  const { data: exemplaren } = await admin.from("hardware")
    .select("*").eq("team_id", teamId).eq("status", "voorraad").eq("kanalen->shopify->>sleutel", sleutel);
  const beschikbaar: any[] = exemplaren || [];
  const reg = (await admin.from("webshop_producten").select("*").eq("team_id", teamId).eq("sleutel", sleutel).maybeSingle()).data;

  // Geen exemplaren meer: het product weg en de registratie op.
  if (!beschikbaar.length) {
    if (reg?.product_id) {
      try {
        await graphql(k, `mutation($input: ProductDeleteInput!){ productDelete(input: $input){ deletedProductId userErrors { field message } } }`, { input: { id: reg.product_id } });
      } catch (_e) { /* al weg is prima */ }
    }
    await admin.from("webshop_producten").delete().eq("team_id", teamId).eq("sleutel", sleutel);
    return { leeg: true } as any;
  }

  const perGrade: Record<string, any[]> = { A: [], B: [], C: [] };
  for (const e of beschikbaar) (perGrade[gradeLetter(e.staat)] || (perGrade[gradeLetter(e.staat)] = [])).push(e);

  // Representatief exemplaar: het oudste beschikbare (voor titel, tekst, foto's, staat-toelichting).
  const rep = beschikbaar.slice().sort((a, b) => String(a.aangemaakt_op || "").localeCompare(String(b.aangemaakt_op || "")))[0];

  // Grade-prijzen uit de tabel; ontbrekende grades schatten we uit het representatieve exemplaar.
  const { data: gpRij } = await admin.from("webshop_grade_prijzen")
    .select("prijs_a, prijs_b, prijs_c").eq("team_id", teamId).eq("sleutel", sleutel).maybeSingle();
  const prijzen: Record<string, number | null> = gpRij ? { A: gpRij.prijs_a, B: gpRij.prijs_b, C: gpRij.prijs_c } : { A: null, B: null, C: null };
  const geschat = gradeSchat(gradeLetter(rep.staat), Number(rep.verkoop) || 0);
  for (const g of GRADE_LETTERS) if (prijzen[g] == null) prijzen[g] = geschat[g];

  const inWinkel = (await Promise.all(beschikbaar.map((e: any) => ligtInWinkel(e.locatie_id)))).some(Boolean);
  const nieuwprijs = rep.nieuwprijs != null && rep.nieuwprijs !== "" ? Number(rep.nieuwprijs) : null;
  const bestaandeVar: Record<string, string> = (reg?.varianten && typeof reg.varianten === "object") ? reg.varianten : {};

  const variants = GRADE_LETTERS.map((g) => {
    const prijs = prijzen[g] != null ? Number(prijzen[g]) : 0;
    const aantal = (perGrade[g] || []).length;
    const vergelijk = nieuwprijs != null && nieuwprijs > prijs ? String(nieuwprijs) : undefined;
    const v: any = {
      optionValues: [{ optionName: "Staat", name: GRADE_NAAM[g] }],
      price: String(prijs),
      ...(vergelijk ? { compareAtPrice: vergelijk } : {}),
      sku: (sleutel + "-" + g).slice(0, 100),
      inventoryPolicy: "DENY",
      ...(k.locatie_id ? { inventoryQuantities: [{ locationId: k.locatie_id, name: "available", quantity: aantal }] } : {}),
    };
    if (bestaandeVar[g]) v.id = bestaandeVar[g];
    return v;
  });

  const titel = rep.titel || [rep.merk, rep.model].filter(Boolean).join(" ");
  const controle = await controleBij(rep.id);
  const invoer: any = {
    title: titel,
    descriptionHtml: beschrijving(rep),
    vendor: rep.merk || "Storvo",
    productType: rep.categorie || "Laptop",
    status: "ACTIVE",
    tags: ["refurbished", rep.code || "", ...gebruikTags(rep)].filter(Boolean),
    metafields: bouwProductMetafields(rep, controle, inWinkel),
    productOptions: [{ name: "Staat", values: GRADE_LETTERS.map((g) => ({ name: GRADE_NAAM[g] })) }],
    variants,
  };
  if (reg?.product_id) invoer.id = reg.product_id;
  const files = fotosVan(rep);
  if (files.length && !reg) invoer.files = files;

  const uit = await graphql(k, `
    mutation($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) {
        product { id handle title onlineStoreUrl
          variants(first: 10) { nodes { id selectedOptions { name value } } } }
        userErrors { field message }
      }
    }`, { input: invoer });
  const p = letOp(uit?.productSet, "Het bijwerken op de webshop").product;
  if (!p?.id) throw new Error("Shopify gaf geen product terug");

  const naamNaarGrade: Record<string, string> = { "Uitstekend": "A", "Zeer goed": "B", "Prima": "C" };
  const variantIds: Record<string, string> = {};
  for (const vn of (p?.variants?.nodes || [])) {
    const staatW = (vn.selectedOptions || []).find((o: any) => o.name === "Staat")?.value || "";
    const g = naamNaarGrade[staatW];
    if (g) variantIds[g] = vn.id;
  }

  let zichtbaar = false;
  if (k.publicatie_id) {
    const pub = await graphql(k, `mutation($id: ID!, $input: [PublicationInput!]!){ publishablePublish(id: $id, input: $input){ userErrors { field message } } }`, { id: p.id, input: [{ publicationId: k.publicatie_id }] });
    letOp(pub?.publishablePublish, "Het zichtbaar maken in de webshop");
    zichtbaar = true;
  }
  const collecties = await inCollectiesZetten(k, p.id, rep);

  const nummer = String(p.id).split("/").pop();
  const url = p.onlineStoreUrl || (p.handle ? `https://${k.domein}/products/${p.handle}` : null);
  const beheer = `https://${k.domein}/admin/products/${nummer}`;
  await admin.from("webshop_producten").upsert({
    team_id: teamId, sleutel, product_id: p.id, varianten: variantIds,
    handle: p.handle || null, url, beheer, categorie: rep.categorie || null, bijgewerkt_op: new Date().toISOString(),
  }, { onConflict: "team_id,sleutel" });

  // Elk beschikbaar exemplaar koppelen aan het product + zijn grade-variant, zodat de webhook
  // een verkochte variant kan terugvertalen naar een echt toestel.
  for (const e of beschikbaar) {
    const eg = gradeLetter(e.staat);
    const ek = (e.kanalen && typeof e.kanalen === "object") ? { ...e.kanalen } : {};
    ek.shopify = { id: p.id, nummer, variant: variantIds[eg] || null, grade: eg, sleutel, url, beheer, zichtbaar, collecties, sinds: (ek.shopify && ek.shopify.sinds) || new Date().toISOString() };
    await admin.from("hardware").update({ kanalen: ek, bijgewerkt_op: new Date().toISOString() }).eq("id", e.id);
  }

  return { leeg: false, product_id: p.id, nummer, url, beheer, zichtbaar, collecties, variantIds } as any;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const acc = await wieBelt(req);
  if (!acc) return fout("Niet ingelogd", 401);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const actie = String(lijf?.actie || "");

  /* Verzenden gaat over een BESTELLING, niet over een toestel. Daarom hier apart, nog
     voor de hardware_id-controle. We halen de fulfillmentOrders van de order op en
     markeren de open ervan als vervuld; Shopify stuurt daarna zelf ORDERS_FULFILLED
     terug, waarmee de bestellingenlijst in Storvo vanzelf op verzonden komt. */
  if (actie === "verzenden") {
    const orderIn = String(lijf?.order_id || "");
    if (!orderIn) return fout("Geen bestelling meegegeven");
    const kk = await koppelingVan(acc.team_id);
    if (!kk) return fout("Er is nog geen webshop gekoppeld.", 409);
    const gid = orderIn.startsWith("gid://") ? orderIn : `gid://shopify/Order/${orderIn}`;
    const d = await graphql(kk, `
      query($id: ID!) { order(id: $id) { id fulfillmentOrders(first: 20) { nodes { id status } } } }`, { id: gid });
    const fos = (d?.order?.fulfillmentOrders?.nodes || [])
      .filter((f: any) => ["OPEN", "IN_PROGRESS", "SCHEDULED"].includes(String(f.status || "").toUpperCase()));
    if (!fos.length) return new Response(JSON.stringify({ ok: true, verzonden: true, aantal: 0 }), { headers: cors });
    let gedaan = 0;
    for (const fo of fos) {
      const uit = await graphql(kk, `
        mutation($f: FulfillmentV2Input!) {
          fulfillmentCreateV2(fulfillment: $f) {
            fulfillment { id status }
            userErrors { field message }
          }
        }`, { f: { lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: fo.id }], notifyCustomer: false } });
      letOp(uit?.fulfillmentCreateV2, "Verzenden");
      if (uit?.fulfillmentCreateV2?.fulfillment?.id) gedaan++;
    }
    return new Response(JSON.stringify({ ok: true, verzonden: gedaan > 0, aantal: gedaan }), { headers: cors });
  }

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
      const sleutel = webshopSleutel(h);
      const gLetter = gradeLetter(h.staat);
      // Dit exemplaar koppelen aan de sleutel/grade, zodat de synchronisatie het meerekent.
      kanalen.shopify = { ...(kanalen.shopify || {}), sleutel, grade: gLetter };
      await admin.from("hardware").update({ kanalen, bijgewerkt_op: new Date().toISOString() }).eq("id", id);
      const r = await synchroniseerAdvertentie(k, acc.team_id, sleutel);
      const { data: verse } = await admin.from("hardware").select("kanalen").eq("id", id).maybeSingle();
      return new Response(JSON.stringify({
        ok: true, kanalen: verse?.kanalen || kanalen,
        waarschuwing: r.zichtbaar ? null
          : "Het toestel staat op Shopify maar is nog niet in de webshop gepubliceerd. " +
            "Kijk bij Instellingen of de koppeling het verkoopkanaal heeft gevonden.",
      }), { headers: cors });
    }

    if (actie === "offline") {
      const s = kanalen.shopify;
      const sleutel = s?.sleutel || null;
      // Oud model (van vóór de grade-varianten): één los product per toestel, geen sleutel.
      const oudProduct = (!sleutel && s?.id) ? s.id : null;
      delete kanalen.shopify;
      await admin.from("hardware").update({ kanalen, bijgewerkt_op: new Date().toISOString() }).eq("id", id);
      if (sleutel) {
        // De rest van de advertentie opnieuw synchroniseren: voorraad van deze grade omlaag,
        // of het hele product weg als dit het laatste exemplaar was.
        try { await synchroniseerAdvertentie(k, acc.team_id, sleutel); } catch (e) { console.error("offline sync", e); }
      } else if (oudProduct) {
        try {
          const uit = await graphql(k, `mutation($input: ProductDeleteInput!){ productDelete(input: $input){ deletedProductId userErrors { field message } } }`, { input: { id: oudProduct } });
          letOp(uit?.productDelete, "Het weghalen van de webshop");
        } catch (e) { console.error("shopify verwijderen (oud)", e); }
      }
      return new Response(JSON.stringify({ ok: true, kanalen }), { headers: cors });
    }

    if (actie === "prijs") {
      // De prijs is nu per grade (uit webshop_grade_prijzen). Opnieuw synchroniseren pakt de
      // bijgewerkte grade-prijzen en de voorraad mee.
      const sleutel = kanalen.shopify?.sleutel || webshopSleutel(h);
      await synchroniseerAdvertentie(k, acc.team_id, sleutel);
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (actie === "locatie") {
      // Na een verplaatsing de ophaal-indicator (winkelvoorraad) bijwerken. Bij het gegroepeerde
      // product doen we dat via een volledige synchronisatie (winkelvoorraad = ligt er één in de winkel).
      const sleutel = kanalen.shopify?.sleutel || null;
      if (!sleutel) return new Response(JSON.stringify({ ok: true, overgeslagen: true }), { headers: cors });
      await synchroniseerAdvertentie(k, acc.team_id, sleutel);
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
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
