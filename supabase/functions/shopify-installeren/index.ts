// Hier komt de winkelier terug nadat hij bij Shopify op "Installeren" heeft
// gedrukt.
//
// Dit is de enige stap in de hele koppeling waar niemand iets hoeft over te
// typen. De winkelier ziet bij Shopify welke rechten Storvo vraagt, klikt op
// installeren, en komt hier terug met een code. Die code ruilen wij in voor een
// token dat blijft werken.
//
// Deze functie staat open op internet, want Shopify moet erbij kunnen zonder
// inlog. Daarom drie controles voordat er iets gebeurt:
//
//   1. De handtekening van Shopify over alle parameters moet kloppen. Alleen wie
//      het geheim van de app heeft kan die maken, en dat zijn Shopify en wij.
//   2. Het sleuteltje uit de heenreis moet bestaan, nog geldig zijn, en bij deze
//      winkel horen. Zo kan niemand een installatie in andermans Storvo hangen.
//   3. Het winkeladres moet eruitzien als een Shopify-adres.
//
// Pas daarna ruilen we de code in. Lukt dat, dan zetten we meteen de meldingen
// klaar en zoeken we op waar de voorraad ligt, zodat de winkelier daarna
// nergens meer iets hoeft in te stellen.

import {
  admin, versleutel, domeinOpschonen, terugkomstKlopt,
  winkelVerkennen, webhooksZetten, nieuwPad, SCOPES, effectieveScopes,
} from "../_gedeeld/shopify.ts";

/* Terug naar Storvo, met in het adres wat er gebeurd is. De instellingenpagina
   leest dat en laat het resultaat zien. Een blanco pagina met "ok" is hier het
   slechtste wat je kunt doen: de winkelier staat dan in een leeg tabblad. */
function terug(melding: string, gelukt: boolean) {
  const basis = (Deno.env.get("APP_URL") || "https://storvo.app").replace(/\/$/, "");
  const adres = `${basis}/app/?tab=instellingen&webshop=${gelukt ? "gelukt" : "mislukt"}` +
    `&melding=${encodeURIComponent(melding)}`;
  return new Response(null, { status: 302, headers: { Location: adres } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const geheim = Deno.env.get("SHOPIFY_CLIENT_SECRET");
  const clientId = Deno.env.get("SHOPIFY_CLIENT_ID");
  if (!geheim || !clientId) {
    console.error("shopify-installeren: SHOPIFY_CLIENT_ID of SHOPIFY_CLIENT_SECRET ontbreekt");
    return terug("De koppeling is nog niet ingesteld door de beheerder", false);
  }

  /* Shopify kan hier ook binnenkomen om de installatie te starten, bijvoorbeeld
     als iemand de app opent vanuit zijn Shopify-beheer. Dan is er nog geen code
     en sturen we hem alsnog langs het toestemmingsscherm. */
  const code = url.searchParams.get("code");
  const winkel = domeinOpschonen(url.searchParams.get("shop") || "");
  if (!winkel) return terug("Dat winkeladres herken ik niet", false);

  if (!(await terugkomstKlopt(url, geheim))) {
    console.error("shopify-installeren: handtekening klopt niet voor", winkel);
    return terug("De terugkomst van Shopify klopte niet. Probeer het opnieuw.", false);
  }

  if (!code) {
    const staat = url.searchParams.get("state");
    if (!staat) return terug("Begin het koppelen vanuit Storvo, bij Instellingen → Webshop", false);
    const heen = `https://${winkel}/admin/oauth/authorize?client_id=${clientId}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(url.origin + url.pathname)}` +
      `&state=${encodeURIComponent(staat)}`;
    return new Response(null, { status: 302, headers: { Location: heen } });
  }

  /* Het sleuteltje uit de heenreis. Weg of verlopen betekent: dit is geen
     installatie die iemand vanuit Storvo begonnen is. */
  const staat = url.searchParams.get("state") || "";
  const { data: poging } = await admin.from("koppel_pogingen")
    .select("*").eq("staat", staat).maybeSingle();
  if (!poging) {
    return terug("Deze koppelpoging ken ik niet meer. Begin opnieuw vanuit Storvo.", false);
  }
  await admin.from("koppel_pogingen").delete().eq("staat", staat);
  if (new Date(poging.vervalt) < new Date()) {
    return terug("Het koppelen duurde te lang. Probeer het opnieuw.", false);
  }
  if (poging.domein && poging.domein !== winkel) {
    console.error("shopify-installeren: winkel", winkel, "hoort niet bij poging", poging.domein);
    return terug("De winkel die terugkwam is niet de winkel die je wilde koppelen", false);
  }

  try {
    /* De code inruilen voor een token. Dit token blijft geldig tot iemand de
       app verwijdert; er hoeft dus niets ververst te worden. */
    const res = await fetch(`https://${winkel}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: geheim, code }),
    });
    const uit = await res.json().catch(() => ({}));
    if (!res.ok || !uit?.access_token) {
      console.error("shopify-installeren: inruilen mislukt", res.status, JSON.stringify(uit));
      return terug("Shopify gaf geen toegang terug. Probeer het opnieuw.", false);
    }
    const token = String(uit.access_token);
    /* De effectieve rechten (met de leesrechten die Shopify impliciet bij een
       schrijfrecht geeft), zodat de rechtencheck later niet ten onrechte
       "read_products ontbreekt" roept. Lukt het niet, dan vallen we terug op wat
       Shopify bij het token teruggaf. */
    let scopes = String(uit.scope || SCOPES).split(",").map((s) => s.trim()).filter(Boolean);
    try { scopes = await effectieveScopes({ domein: winkel, token }); } catch (_e) { /* terugval hierboven */ }

    const info = await winkelVerkennen({ domein: winkel, token });

    const { data: oud } = await admin.from("winkel_koppelingen")
      .select("id, webhook_pad").eq("team_id", poging.team_id).eq("kanaal", "shopify").maybeSingle();
    const pad = oud?.webhook_pad || nieuwPad();

    let meldingen: { topic: string; id: string }[] = [];
    try {
      meldingen = await webhooksZetten({ domein: winkel, token }, pad);
    } catch (e) {
      console.error("shopify-installeren: meldingen instellen", e);
    }

    const rij = {
      team_id: poging.team_id, kanaal: "shopify", via: "oauth", client_id: clientId,
      domein: info.domein,
      token_versleuteld: await versleutel(token),
      token_staart: token.slice(-4),
      webhook_pad: pad,
      winkelnaam: info.naam, valuta: info.valuta,
      scopes, publicatie_id: info.publicatie, locatie_id: info.locatie,
      webhooks: meldingen,
      status: "actief", fout: null,
      laatst_gecontroleerd: new Date().toISOString(),
      gekoppeld_door: poging.door,
      bijgewerkt_op: new Date().toISOString(),
    };
    if (oud) await admin.from("winkel_koppelingen").update(rij).eq("id", oud.id);
    else await admin.from("winkel_koppelingen").insert(rij);

    const half = meldingen.length ? "" :
      " De verkoopmeldingen konden niet worden aangezet; kijk even bij Opnieuw nakijken.";
    return terug((info.naam || winkel) + " is gekoppeld." + half, true);
  } catch (e) {
    console.error("shopify-installeren", e);
    return terug(e instanceof Error ? e.message : "Het koppelen lukte niet", false);
  }
});
