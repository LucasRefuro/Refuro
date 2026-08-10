// De webshop van deze winkel koppelen.
//
// De gewone weg is één knop: je typt je winkeladres, wij sturen je naar Shopify,
// jij ziet daar welke rechten Storvo vraagt, en na het installeren ben je klaar.
// Er komt geen sleutel aan te pas die iemand moet overtypen.
//
// Daarnaast blijft er een tweede weg staan voor winkels die al een eigen app in
// hun Shopify-beheer hebben, van vóór januari 2026. Die apps blijven werken en
// geven een token dat je kunt plakken. Nieuwe winkels kunnen die weg niet meer
// bewandelen; Shopify heeft dat dichtgezet.

import {
  admin, cors, fout, wieBelt, graphql, versleutel, ontsleutel,
  domeinOpschonen, winkelVerkennen, webhooksZetten, nieuwPad,
  RECHTEN, SCOPES, MELDINGEN,
} from "../_gedeeld/shopify.ts";

/* Welke rechten er werkelijk op een geplakt token staan. Dit is een vast adres
   buiten de versies om, en het is de enige manier om vóórdat er iets misgaat te
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

/* Wat de browser mag zien. Geen token, alleen genoeg om te herkennen wat er
   staat en of het goed staat. */
function veiligeStand(rij: any, extra?: Record<string, unknown>) {
  const kanOauth = !!(Deno.env.get("SHOPIFY_CLIENT_ID") && Deno.env.get("SHOPIFY_CLIENT_SECRET"));
  if (!rij) return { ok: true, gekoppeld: false, rechten: RECHTEN, kanOauth, ...(extra || {}) };
  const mist = Object.keys(RECHTEN).filter((r) => !(rij.scopes || []).includes(r));
  return {
    ok: true,
    gekoppeld: true,
    kanOauth,
    via: rij.via,
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

    /* ── de heenreis ──
       We onthouden wie er wegging in een sleuteltje dat een kwartier geldig is.
       Zonder dat zou iemand anders zijn installatie in jouw Storvo kunnen
       hangen door het adres van de terugkomst na te bouwen. */
    if (actie === "start") {
      const clientId = Deno.env.get("SHOPIFY_CLIENT_ID");
      if (!clientId || !Deno.env.get("SHOPIFY_CLIENT_SECRET")) {
        return fout("De Shopify-app is nog niet ingesteld door de beheerder", 409);
      }
      const domein = domeinOpschonen(lijf?.domein);
      if (!domein) {
        return fout("Dat winkeladres herken ik niet. Het ziet eruit als jouwwinkel.myshopify.com");
      }

      const staat = crypto.randomUUID() + "." + nieuwPad();
      await admin.from("koppel_pogingen").delete().lt("vervalt", new Date().toISOString());
      const { error } = await admin.from("koppel_pogingen").insert({
        staat, team_id: acc.team_id, domein, door: acc.id,
      });
      if (error) throw new Error("Kon het koppelen niet starten");

      const terugAdres = `${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-installeren`;
      const heen = `https://${domein}/admin/oauth/authorize?client_id=${clientId}` +
        `&scope=${encodeURIComponent(SCOPES)}` +
        `&redirect_uri=${encodeURIComponent(terugAdres)}` +
        `&state=${encodeURIComponent(staat)}`;
      return new Response(JSON.stringify({ ok: true, heen, domein }), { headers: cors });
    }

    /* ── de tweede weg: een token uit een bestaande eigen app ── */
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
        waarschuwing = "De koppeling staat, maar het instellen van de meldingen lukte niet: " +
          (e instanceof Error ? e.message : "onbekende fout");
      }
      if (!waarschuwing && meldingen.length < MELDINGEN.length) {
        waarschuwing = "De koppeling staat, maar niet alle meldingen konden worden aangezet. " +
          "Verkoop je iets online, kijk dan zelf even of het toestel uit je voorraad gaat.";
      }

      const rij = {
        team_id: acc.team_id, kanaal: "shopify", via: "token", client_id: null,
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

    /* ── meldingen opnieuw instellen ──
       Nuttig als het bij het koppelen net niet lukte, of als er meldingen zijn
       bijgekomen na een nieuwe versie van Storvo. */
    if (actie === "meldingen") {
      const { data } = await admin.from("winkel_koppelingen")
        .select("*").eq("team_id", acc.team_id).eq("kanaal", "shopify").maybeSingle();
      if (!data) return fout("Er is nog geen webshop gekoppeld", 404);
      const token = await ontsleutel(data.token_versleuteld);
      const meldingen = await webhooksZetten({ domein: data.domein, token }, data.webhook_pad);
      await admin.from("winkel_koppelingen")
        .update({ webhooks: meldingen, bijgewerkt_op: new Date().toISOString() })
        .eq("id", data.id);
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
      return new Response(JSON.stringify(veiligeStand(null)), { headers: cors });
    }

    return fout("Onbekende actie");
  } catch (e) {
    console.error("shopify-koppelen", actie, e);
    return fout(e instanceof Error ? e.message : "Het koppelen lukte niet", 502);
  }
});
