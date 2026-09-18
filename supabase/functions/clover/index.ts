// De Clover-koppeling: de pin/kassa aan Storvo knopen en je producten erin zetten.
//
// Fase 1 (dit bestand): koppelen met een API-token uit het Merchant Dashboard,
// de verbinding testen, en producten naar Clover pushen (aanmaken/bijwerken).
// Fase 2 (later, aparte functie): webhooks zodat een verkoop op de pin de voorraad
// in Storvo bijwerkt.
//
// Het token bewaren we versleuteld in winkel_koppelingen (kanaal 'clover'), net
// als de Shopify-koppeling. Die tabel heeft bewust geen RLS: alleen de
// service_role komt erbij, dus een gelekte select levert geen sleutels op.

import {
  admin, versleutel, ontsleutel, wieBelt, fout, cors,
  cloverBasis, cloverWinkel, cloverZetItem, cloverAlleItems, cloverIndex, cloverFetch,
  cloverAlleCategorien, cloverCategorieIndex, cloverMaakCategorie,
} from "../_gedeeld/clover.ts";

function ok(data: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, ...data }), { headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const acc = await wieBelt(req);
  if (!acc) return fout("Niet ingelogd", 401);
  if (acc.rol !== "eigenaar" && acc.rol !== "beheerder") return fout("Alleen de eigenaar of een beheerder mag de Clover-koppeling beheren.", 403);

  const body = await req.json().catch(() => ({}));
  const actie = String(body.actie || "");

  async function koppeling() {
    const { data } = await admin.from("winkel_koppelingen")
      .select("*").eq("team_id", acc.team_id).eq("kanaal", "clover").maybeSingle();
    if (!data) return null;
    const regio = (data.webhooks && (data.webhooks as any).regio) || "eu";
    return { ...data, regio, token: await ontsleutel(data.token_versleuteld) };
  }

  try {
    if (actie === "test" || actie === "koppel") {
      const mId = String(body.merchantId || "").trim();
      const token = String(body.token || "").trim();
      const regio = String(body.regio || "eu").trim().toLowerCase() === "us" ? "us" : "eu";
      if (!mId || !token) return fout("Vul je merchant-ID en API-token in.");
      const basis = cloverBasis(regio);
      const w = await cloverWinkel(basis, mId, token);   // gooit bij een verkeerd token/mId
      if (actie === "test") return ok({ winkel: w });

      const { data: oud } = await admin.from("winkel_koppelingen")
        .select("id, webhook_pad").eq("team_id", acc.team_id).eq("kanaal", "clover").maybeSingle();
      const rij = {
        team_id: acc.team_id, kanaal: "clover", via: "token",
        domein: mId,
        token_versleuteld: await versleutel(token),
        token_staart: token.slice(-4),
        // webhook_pad is NOT NULL in de tabel (Shopify gebruikt het). Voor Clover
        // fase 1 hebben we het nog niet nodig, maar we zetten alvast een unieke
        // waarde neer; die kan fase 2 (de Clover-webhook) hergebruiken.
        webhook_pad: oud?.webhook_pad || crypto.randomUUID().replace(/-/g, ""),
        winkelnaam: w.naam, valuta: w.valuta,
        webhooks: { regio },
        status: "actief", fout: null,
        laatst_gecontroleerd: new Date().toISOString(),
        gekoppeld_door: acc.id, bijgewerkt_op: new Date().toISOString(),
      };
      const dbErr = oud
        ? (await admin.from("winkel_koppelingen").update(rij).eq("id", oud.id)).error
        : (await admin.from("winkel_koppelingen").insert(rij)).error;
      if (dbErr) { console.error("clover koppel opslaan:", dbErr); return fout("De koppeling opslaan lukte niet: " + (dbErr.message || "onbekende fout")); }
      return ok({ winkel: w });
    }

    if (actie === "status") {
      const k = await koppeling();
      if (!k) return ok({ gekoppeld: false });
      return ok({ gekoppeld: true, merchantId: k.domein, regio: k.regio, winkelnaam: k.winkelnaam, staart: k.token_staart });
    }

    if (actie === "los") {
      await admin.from("winkel_koppelingen").delete().eq("team_id", acc.team_id).eq("kanaal", "clover");
      return ok();
    }

    /* Alle items uit Clover verwijderen (voor een schone start: alles opnieuw
       vanuit Storvo). De koppeling zelf blijft; alleen de producten gaan weg. */
    if (actie === "leegAlles") {
      const k = await koppeling();
      if (!k) return fout("Nog geen Clover-koppeling. Koppel eerst je pin.");
      const basis = cloverBasis(k.regio);
      const items = await cloverAlleItems(basis, k.domein, k.token);
      let weg = 0;
      for (const it of items) {
        if (!it?.id) continue;
        try { await cloverFetch(basis, k.domein, k.token, `/items/${it.id}`, { method: "DELETE" }); weg++; } catch (_e) { /* volgende */ }
      }
      return ok({ verwijderd: weg, totaal: items.length });
    }

    if (actie === "push" || actie === "pushAlle") {
      const k = await koppeling();
      if (!k) return fout("Nog geen Clover-koppeling. Koppel eerst je pin.");
      const basis = cloverBasis(k.regio);
      const producten = Array.isArray(body.producten) ? body.producten : [];
      if (!producten.length) return fout("Geen producten meegestuurd.");

      /* Eerst de bestaande Clover-items ophalen en indexeren op barcode/sku. Zo
         werken we een product dat al in de pin staat BIJ in plaats van dubbel aan
         te maken. Lukt het ophalen niet, dan pushen we zonder matching (nieuw). */
      let opCode: Record<string, string> = {}, opSku: Record<string, string> = {};
      let matchKon = false;
      try {
        const idx = cloverIndex(await cloverAlleItems(basis, k.domein, k.token));
        opCode = idx.opCode; opSku = idx.opSku; matchKon = true;
      } catch (_e) { /* zonder matching verder */ }

      /* De categorieën uit Storvo spiegelen naar Clover: op naam matchen, en een
         ontbrekende categorie eenmalig aanmaken (gecachet, dus niet per product).
         Lukt het ophalen niet, dan pushen we zonder indeling. */
      let catOpNaam: Record<string, string> = {};
      try { catOpNaam = cloverCategorieIndex(await cloverAlleCategorien(basis, k.domein, k.token)); } catch (_e) { /* zonder categorieën verder */ }
      async function zorgCategorie(naam: string): Promise<string | null> {
        const sleutel = String(naam || "").trim().toLowerCase();
        if (!sleutel) return null;
        if (catOpNaam[sleutel]) return catOpNaam[sleutel];
        try {
          const id = await cloverMaakCategorie(basis, k.domein, k.token, String(naam).trim());
          if (id) { catOpNaam[sleutel] = id; return id; }
        } catch (_e) { /* categorie kon niet worden aangemaakt */ }
        return null;
      }

      const resultaten: any[] = [];
      let gelukt = 0, nieuw = 0, bijgewerkt = 0;
      for (const p of producten) {
        try {
          const gevonden = p.cloverId
            || (p.barcode && opCode[String(p.barcode)])
            || (p.sku && opSku[String(p.sku)])
            || null;
          const categorieId = p.categorie ? await zorgCategorie(String(p.categorie)) : null;
          const item = await cloverZetItem(basis, k.domein, k.token, {
            naam: p.naam, verkoop: p.verkoop, barcode: p.barcode, sku: p.sku,
            voorraad: p.voorraad, cloverId: gevonden, categorieId,
          });
          if (item?.id) { gelukt++; if (gevonden) bijgewerkt++; else nieuw++; }
          resultaten.push({ id: p.id, cloverId: item?.id || null, ok: true, bijgewerkt: !!gevonden });
        } catch (e) {
          resultaten.push({ id: p.id, ok: false, fout: e instanceof Error ? e.message : "mislukt" });
        }
      }
      return ok({ gelukt, totaal: producten.length, nieuw, bijgewerkt, matchKon, resultaten });
    }

    return fout("Onbekende actie.");
  } catch (e) {
    console.error("clover:", e);
    return fout(e instanceof Error ? e.message : "Er ging iets mis met Clover.", 400);
  }
});
