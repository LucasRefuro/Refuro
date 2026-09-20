// Clover fase 2: verkopen die op de terminal gebeuren terug de software in halen.
//
// Werkt op twee manieren, allebei via dezelfde verwerking en idempotent op de Clover-
// order-id (dubbel binnenkomen kan dus geen kwaad):
//  1) POLLEN (werkt NU, met het bestaande API-token): een pg_cron roept ons elke paar
//     minuten aan met X-Cron-Secret; we vragen Clover om de sinds-de-vorige-keer gewijzigde
//     orders en bewaren ze.
//  2) WEBHOOK (realtime, later): als de winkelier een echte Clover-app aanmaakt en de
//     webhook-URL hierheen wijst, stuurt Clover per verkoop een seintje. We halen de order
//     dan zelf op bij Clover (met ons token) als echte controle en bewaren hem.
//
// We schrijven ALLEEN naar de echte tabel clover_bestellingen, nooit naar de winkeldata-
// blob: die is last-write-wins, dus een edge-write zou door de app overschreven kunnen
// worden. De winkelapp leest de tabel, matcht op barcode/sku en boekt de verkoop zelf.
//
// verify_jwt MOET false zijn (cron en Clover sturen geen Supabase-JWT mee).
// Geheimen: MAIL_CRON_SECRET (voor het pollen), KOPPELING_SLEUTEL (token ontsleutelen).

import { admin, ontsleutel, cloverBasis, cloverFetch, cors, fout } from "../_gedeeld/clover.ts";

function ok(d: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, ...d }), { headers: cors });
}

async function cloverKoppelingen() {
  const { data } = await admin.from("winkel_koppelingen").select("*").eq("kanaal", "clover");
  return data || [];
}

// De regels van een Clover-order platslaan tot wat de winkelapp nodig heeft om te matchen.
function regelsUit(order: any) {
  const li = (order && order.lineItems && order.lineItems.elements) || [];
  const regels: any[] = [];
  for (const l of li) {
    const item = l.item || {};
    regels.push({
      naam: l.name || item.name || "",
      code: item.code || l.code || null,      // barcode; Storvo pusht barcode als Clover-code
      sku: item.sku || l.sku || null,
      prijs: (Number(l.price) || 0) / 100,    // Clover rekent in centen
      aantal: 1,                               // Clover maakt per stuk een regel; app telt gelijke regels op
    });
  }
  return regels;
}

async function bewaarOrder(koppeling: any, order: any) {
  if (!order || !order.id) return false;
  const betaald = !!(order.payments && order.payments.elements && order.payments.elements.length) ||
    String(order.paymentState || "").toUpperCase() === "PAID";
  const rij = {
    team_id: koppeling.team_id,
    clover_order_id: String(order.id),
    bedrag: (Number(order.total) || 0) / 100,
    besteld_op: order.createdTime ? new Date(Number(order.createdTime)).toISOString() : null,
    betaald,
    regels: regelsUit(order),
  };
  // Idempotent: dezelfde order tweemaal is geen dubbele rij.
  const { error } = await admin.from("clover_bestellingen")
    .upsert(rij, { onConflict: "team_id,clover_order_id", ignoreDuplicates: true });
  if (error) { console.error("clover_bestellingen bewaren:", error.message); return false; }
  return true;
}

async function pollTeam(koppeling: any): Promise<number> {
  const token = await ontsleutel(koppeling.token_versleuteld);
  const regio = (koppeling.webhooks && (koppeling.webhooks as any).regio) || "eu";
  const basis = cloverBasis(regio);
  const laatst = (koppeling.webhooks && (koppeling.webhooks as any).laatst_gesynct);
  const sinds = laatst ? Number(laatst) : (Date.now() - 3 * 864e5);   // eerste keer: 3 dagen terug
  const pad = `/orders?filter=${encodeURIComponent("modifiedTime>=" + sinds)}&expand=lineItems.item,payments&limit=100`;
  const d = await cloverFetch(basis, koppeling.domein, token, pad);
  const orders = (d && d.elements) || [];
  let n = 0;
  for (const o of orders) { try { if (await bewaarOrder(koppeling, o)) n++; } catch (_e) { /* volgende */ } }
  const webhooks = { ...(koppeling.webhooks || {}), laatst_gesynct: Date.now() };
  await admin.from("winkel_koppelingen").update({ webhooks }).eq("id", koppeling.id);
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const body = await req.json().catch(() => ({} as any));

  // Clover-webhook handshake: bevestig de verificatiecode (die zet de winkelier in het
  // Clover-dashboard). We loggen hem zodat we hem kunnen doorgeven.
  if (body && body.verificationCode) {
    console.log("Clover verificationCode:", body.verificationCode);
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  // 1) Pollen via de cron.
  const cronSecret = Deno.env.get("MAIL_CRON_SECRET");
  const isCron = !!cronSecret && (req.headers.get("x-cron-secret") || "") === cronSecret;
  if (isCron) {
    let totaal = 0;
    for (const k of await cloverKoppelingen()) {
      try { totaal += await pollTeam(k); } catch (e) { console.error("clover poll", k.team_id, e instanceof Error ? e.message : e); }
    }
    return ok({ modus: "poll", bonnen: totaal });
  }

  // 2) Webhook van Clover: { merchants: { <mId>: [ { objectId: "O:<orderId>", type } ] } }.
  const merchants = body && body.merchants;
  if (merchants && typeof merchants === "object") {
    const alle = await cloverKoppelingen();
    let n = 0;
    for (const mId of Object.keys(merchants)) {
      const koppeling = alle.find((k: any) => String(k.domein) === String(mId));
      if (!koppeling) continue;
      const token = await ontsleutel(koppeling.token_versleuteld);
      const regio = (koppeling.webhooks && (koppeling.webhooks as any).regio) || "eu";
      const basis = cloverBasis(regio);
      for (const ev of (merchants[mId] || [])) {
        const oid = String((ev && ev.objectId) || "");
        const m = oid.match(/^O:(.+)$/);   // alleen orders
        if (!m) continue;
        try {
          const order = await cloverFetch(basis, koppeling.domein, token, `/orders/${m[1]}?expand=lineItems.item,payments`);
          if (await bewaarOrder(koppeling, order)) n++;
        } catch (_e) { /* order kon niet opgehaald worden; overslaan */ }
      }
    }
    return ok({ modus: "webhook", bonnen: n });
  }

  return ok({ modus: "leeg" });
});
