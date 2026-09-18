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
  cloverBasis, cloverWinkel, cloverZetItem,
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

    if (actie === "push" || actie === "pushAlle") {
      const k = await koppeling();
      if (!k) return fout("Nog geen Clover-koppeling. Koppel eerst je pin.");
      const basis = cloverBasis(k.regio);
      const producten = Array.isArray(body.producten) ? body.producten : [];
      if (!producten.length) return fout("Geen producten meegestuurd.");
      const resultaten: any[] = [];
      let gelukt = 0;
      for (const p of producten) {
        try {
          const item = await cloverZetItem(basis, k.domein, k.token, {
            naam: p.naam, verkoop: p.verkoop, barcode: p.barcode, sku: p.sku,
            voorraad: p.voorraad, cloverId: p.cloverId,
          });
          if (item?.id) gelukt++;
          resultaten.push({ id: p.id, cloverId: item?.id || null, ok: true });
        } catch (e) {
          resultaten.push({ id: p.id, ok: false, fout: e instanceof Error ? e.message : "mislukt" });
        }
      }
      return ok({ gelukt, totaal: producten.length, resultaten });
    }

    return fout("Onbekende actie.");
  } catch (e) {
    console.error("clover:", e);
    return fout(e instanceof Error ? e.message : "Er ging iets mis met Clover.", 400);
  }
});
