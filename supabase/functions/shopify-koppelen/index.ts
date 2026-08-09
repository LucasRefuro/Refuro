// De webshop van deze winkel koppelen.
//
// Hoe het werkt voor de winkelier: hij maakt in zijn eigen Shopify-beheer een
// app aan, vinkt zes rechten aan, en plakt het token hier. Wij controleren of
// het token werkt, welke rechten er echt op staan, waar zijn voorraad ligt en
// via welk kanaal zijn webshop publiceert. Pas als dat allemaal klopt slaan we
// iets op.
//
// Waarom niet de "verbind met één klik"-knop die je bij grote apps ziet: die
// werkt via OAuth en dat vraagt een Shopify Partner-account met een app die
// eerst door Shopify beoordeeld moet worden. Deze weg werkt vandaag, voor
// iedere winkel, zonder dat er iemand op ons hoeft te wachten. De opzet
// hieronder is zo gebouwd dat OAuth er later naast kan: alleen het stukje
// "hoe komen we aan een token" verandert dan.

import {
  admin, cors, fout, wieBelt, graphql, versleutel, ontsleutel,
  domeinOpschonen, RECHTEN,
} from "../_gedeeld/shopify.ts";

/* De meldingen die we willen ontvangen. Bestellingen zijn het belangrijkst:
   zonder die melding staat een verkochte laptop nog een uur in de winkel te
   koop. `orders/create` is genoeg voor onze vraag ("is hij weg?"), maar
   `orders/paid` vangt het geval van een bestelling die pas bij betaling telt.
   Dubbel binnenkomen is geen probleem: we controleren of het toestel al op
   verkocht staat. */
const MELDINGEN = ["ORDERS_CREATE", "ORDERS_PAID"];

function webhookAdres(pad: string) {
  const basis = Deno.env.get("SUPABASE_URL")!;
  return `${basis}/functions/v1/shopify-webhook/${pad}`;
}

/* Een adres dat niet te raden is. Wie dit adres niet kent kan geen valse
   verkoopmelding sturen, en dat is de eerste van drie sloten op die deur. */
function nieuwPad() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 28);
}

/* Welke rechten er werkelijk op het token staan. Dit is een vast adres buiten
   de versies om, en het is de enige manier om vóórdat er iets misgaat te
   zeggen "je bent write_publications vergeten". */
async function rechtenVan(domein: string, token: string) {
  const res = await fetch(`https://${domein}/admin/oauth/access_scopes.json`, {
    headers: { "X-Shopify-Access-Token": token, "Accept": "application/json" },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Shopify herkent dit token niet. Kijk of je hem helemaal hebt gekopieerd.");
  }
  if (!res.ok) throw new Error("Shopify gaf status " + res.status + " bij het uitlezen van de rechten");
  const uit = await res.json();
  return (uit?.access_scopes || []).map((s: any) => String(s.handle));
}

/* Waar de webshop publiceert en waar de voorraad ligt. Beide hebben we later
   nodig en beide kunnen we nu al opzoeken, zodat we het niet elke keer opnieuw
   hoeven te vragen en de winkelier het nooit hoeft in te vullen. */
async function winkelVerkennen(k: { domein: string; token: string }) {
  const d = await graphql(k, `
    query {
      shop { name currencyCode myshopifyDomain }
      publications(first: 25) { nodes { id name } }
      locations(first: 25, includeInactive: false) { nodes { id name isActive shipsInventory } }
    }`);

  const publicaties = d?.publications?.nodes || [];
  /* Het kanaal heet in het Nederlands "Onlinewinkel" en in het Engels "Online
     Store". Op de naam zoeken is daarom wankel; we nemen de eerste die er als
     webshop uitziet en anders gewoon de eerste. Beter iets dan niets, en het is
     achteraf aan te passen. */
  const online = publicaties.find((p: any) => /online\s*store|onlinewinkel|online winkel/i.test(p.name))
    || publicaties[0] || null;

  const locaties = (d?.locations?.nodes || []).filter((l: any) => l.isActive !== false);
  const locatie = locaties.find((l: any) => l.shipsInventory) || locaties[0] || null;

  return {
    naam: d?.shop?.name || null,
    valuta: d?.shop?.currencyCode || null,
    domein: d?.shop?.myshopifyDomain || k.domein,
    publicatie: online?.id || null,
    publicatieNaam: online?.name || null,
    locatie: locatie?.id || null,
    locatieNaam: locatie?.name || null,
    aantalLocaties: locaties.length,
  };
}

async function webhooksZetten(k: { domein: string; token: string }, pad: string) {
  const adres = webhookAdres(pad);

  /* Eerst opruimen wat er van ons al staat. Koppel je opnieuw, dan krijg je
     anders elke keer een melding extra en gaat de teller vrolijk door. */
  const bestaand = await graphql(k, `
    query { webhookSubscriptions(first: 100) {
      nodes { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } } }`);
  for (const w of (bestaand?.webhookSubscriptions?.nodes || [])) {
    const url = w?.endpoint?.callbackUrl || "";
    if (url.includes("/functions/v1/shopify-webhook")) {
      await graphql(k, `mutation($id: ID!){ webhookSubscriptionDelete(id: $id){ userErrors { message } } }`,
        { id: w.id });
    }
  }

  const gezet: { topic: string; id: string }[] = [];
  for (const topic of MELDINGEN) {
    const uit = await graphql(k, `
      mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
          webhookSubscription { id }
          userErrors { field message }
        }
      }`, { topic, sub: { callbackUrl: adres, format: "JSON" } });
    const blok = uit?.webhookSubscriptionCreate;
    if (blok?.webhookSubscription?.id) {
      gezet.push({ topic, id: blok.webhookSubscription.id });
    } else {
      // Niet fataal: zonder melding werkt alles nog, alleen moet je zelf zien
      // dat er iets verkocht is. Dat zeggen we dan ook eerlijk.
      console.error("webhook", topic, JSON.stringify(blok?.userErrors || []));
    }
  }
  return gezet;
}

/* Wat de browser mag zien. Geen token, alleen genoeg om te herkennen wat er
   staat en of het goed staat. */
function veiligeStand(rij: any, extra?: Record<string, unknown>) {
  if (!rij) return { ok: true, gekoppeld: false, rechten: RECHTEN, ...(extra || {}) };
  const mist = Object.keys(RECHTEN).filter((r) => !(rij.scopes || []).includes(r));
  return {
    ok: true,
    gekoppeld: true,
    domein: rij.domein,
    winkelnaam: rij.winkelnaam,
    valuta: rij.valuta,
    token_staart: rij.token_staart,
    status: rij.status,
    fout: rij.fout,
    mist,
    rechten: RECHTEN,
    meldingen: (rij.webhooks || []).map((w: any) => w.topic),
    publicatie: !!rij.publicatie_id,
    locatie: !!rij.locatie_id,
    laatst_gecontroleerd: rij.laatst_gecontroleerd,
    ...(extra || {}),
  };
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
    /* ── hoe staat het ervoor ── */
    if (actie === "status") {
      const { data } = await admin.from("winkel_koppelingen")
        .select("*").eq("team_id", acc.team_id).eq("kanaal", "shopify").maybeSingle();
      return new Response(JSON.stringify(veiligeStand(data)), { headers: cors });
    }

    /* ── uitproberen zonder op te slaan ──
       Je wilt weten of het klopt vóórdat je het bewaart. Anders staat er een
       kapotte koppeling en moet je gaan raden wat er mis is. */
    if (actie === "testen" || actie === "opslaan") {
      const domein = domeinOpschonen(lijf?.domein);
      const token = String(lijf?.token || "").trim();
      if (!domein) {
        return fout("Dat winkeladres herken ik niet. Het ziet eruit als jouwwinkel.myshopify.com");
      }
      if (!token) return fout("Vul het toegangstoken in");
      if (!/^shp(at|ca|ss)_[A-Za-z0-9]+$/.test(token)) {
        return fout("Dit lijkt geen Shopify-token. Een token begint met shpat_ en staat onder API-referenties.");
      }

      const scopes = await rechtenVan(domein, token);
      const mist = Object.keys(RECHTEN).filter((r) => !scopes.includes(r));
      const winkel = await winkelVerkennen({ domein, token });

      if (actie === "testen") {
        return new Response(JSON.stringify({
          ok: true, geldig: true, domein: winkel.domein, winkelnaam: winkel.naam,
          valuta: winkel.valuta, scopes, mist, rechten: RECHTEN,
          publicatie: winkel.publicatieNaam, locatie: winkel.locatieNaam,
          aantalLocaties: winkel.aantalLocaties,
        }), { headers: cors });
      }

      /* Opslaan met ontbrekende rechten heeft geen zin: het gaat pas stuk op
         het moment dat je een toestel online zet, en dan sta je met een klant
         aan de balie. Liever nu een duidelijke melding. */
      if (mist.length) {
        return fout("Er ontbreken nog rechten in je Shopify-app", 400, { mist, rechten: RECHTEN });
      }

      const { data: oud } = await admin.from("winkel_koppelingen")
        .select("id, webhook_pad").eq("team_id", acc.team_id).eq("kanaal", "shopify").maybeSingle();
      const pad = oud?.webhook_pad || nieuwPad();

      let meldingen: { topic: string; id: string }[] = [];
      let waarschuwing: string | null = null;
      try {
        meldingen = await webhooksZetten({ domein, token }, pad);
      } catch (e) {
        waarschuwing = "De koppeling staat, maar het instellen van de verkoopmeldingen lukte niet: " +
          (e instanceof Error ? e.message : "onbekende fout");
      }
      if (!waarschuwing && meldingen.length < MELDINGEN.length) {
        waarschuwing = "De koppeling staat, maar niet alle verkoopmeldingen konden worden aangezet. " +
          "Verkoop je iets online, kijk dan zelf even of het toestel uit je voorraad gaat.";
      }

      const rij = {
        team_id: acc.team_id, kanaal: "shopify",
        domein: winkel.domein,
        token_versleuteld: await versleutel(token),
        token_staart: token.slice(-4),
        webhook_pad: pad,
        winkelnaam: winkel.naam, valuta: winkel.valuta,
        scopes, publicatie_id: winkel.publicatie, locatie_id: winkel.locatie,
        webhooks: meldingen,
        status: "actief", fout: null,
        laatst_gecontroleerd: new Date().toISOString(),
        gekoppeld_door: acc.id,
        bijgewerkt_op: new Date().toISOString(),
      };

      if (oud) await admin.from("winkel_koppelingen").update(rij).eq("id", oud.id);
      else await admin.from("winkel_koppelingen").insert(rij);

      const { data: nu } = await admin.from("winkel_koppelingen")
        .select("*").eq("team_id", acc.team_id).eq("kanaal", "shopify").maybeSingle();
      return new Response(JSON.stringify(veiligeStand(nu, {
        waarschuwing, publicatieNaam: winkel.publicatieNaam, locatieNaam: winkel.locatieNaam,
      })), { headers: cors });
    }

    /* ── nog eens nakijken ──
       Een token kan ingetrokken worden of rechten kunnen veranderen. Deze knop
       vertelt je dat vóórdat je het merkt aan een mislukte publicatie. */
    if (actie === "nakijken") {
      const { data } = await admin.from("winkel_koppelingen")
        .select("*").eq("team_id", acc.team_id).eq("kanaal", "shopify").maybeSingle();
      if (!data) return fout("Er is nog geen webshop gekoppeld", 404);

      const token = await ontsleutel(data.token_versleuteld);
      try {
        const scopes = await rechtenVan(data.domein, token);
        const winkel = await winkelVerkennen({ domein: data.domein, token });
        await admin.from("winkel_koppelingen").update({
          scopes, winkelnaam: winkel.naam, valuta: winkel.valuta,
          publicatie_id: winkel.publicatie, locatie_id: winkel.locatie,
          status: "actief", fout: null,
          laatst_gecontroleerd: new Date().toISOString(),
          bijgewerkt_op: new Date().toISOString(),
        }).eq("id", data.id);
      } catch (e) {
        const melding = e instanceof Error ? e.message : "onbekende fout";
        await admin.from("winkel_koppelingen").update({
          status: "fout", fout: melding,
          laatst_gecontroleerd: new Date().toISOString(),
        }).eq("id", data.id);
      }
      const { data: nu } = await admin.from("winkel_koppelingen")
        .select("*").eq("team_id", acc.team_id).eq("kanaal", "shopify").maybeSingle();
      return new Response(JSON.stringify(veiligeStand(nu)), { headers: cors });
    }

    /* ── loskoppelen ──
       Netjes opruimen aan de Shopify-kant. Laat je de meldingen staan, dan
       blijft Shopify maanden naar een adres praten dat niets meer doet. */
    if (actie === "loskoppelen") {
      const { data } = await admin.from("winkel_koppelingen")
        .select("*").eq("team_id", acc.team_id).eq("kanaal", "shopify").maybeSingle();
      if (!data) return new Response(JSON.stringify({ ok: true, gekoppeld: false }), { headers: cors });

      try {
        const token = await ontsleutel(data.token_versleuteld);
        for (const w of (data.webhooks || [])) {
          await graphql({ domein: data.domein, token },
            `mutation($id: ID!){ webhookSubscriptionDelete(id: $id){ userErrors { message } } }`,
            { id: w.id });
        }
      } catch (e) {
        console.error("loskoppelen opruimen", e);
      }
      await admin.from("winkel_koppelingen").delete().eq("id", data.id);
      return new Response(JSON.stringify({ ok: true, gekoppeld: false, rechten: RECHTEN }), { headers: cors });
    }

    return fout("Onbekende actie");
  } catch (e) {
    console.error("shopify-koppelen", actie, e);
    return fout(e instanceof Error ? e.message : "Het koppelen lukte niet", 502);
  }
});
