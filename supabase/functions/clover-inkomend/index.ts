// Clover fase 2: verkopen die op de terminal gebeuren terug de software in halen.
//
// Werkt op drie manieren, allemaal via dezelfde verwerking en idempotent op de Clover-
// order-id (dubbel binnenkomen kan dus geen kwaad):
//  1) POLLEN (werkt NU, met het bestaande API-token): een pg_cron roept ons elke paar
//     minuten aan met X-Cron-Secret; we vragen Clover om de sinds-de-vorige-keer gewijzigde
//     orders en bewaren ze (historisch=false: normale live-verkoop, mét voorraad).
//  2) WEBHOOK (realtime, later): als de winkelier een echte Clover-app aanmaakt en de
//     webhook-URL hierheen wijst, stuurt Clover per verkoop een seintje.
//  3) BACKFILL (eenmalig): haal de laatste N maanden orders op als HISTORISCHE omzet
//     (historisch=true). De winkelapp boekt die wel als omzet maar raakt de voorraad
//     NIET aan; die verkopen zijn immers al lang geleden gebeurd.
//
// We schrijven ALLEEN naar de echte tabel clover_bestellingen, nooit naar de winkeldata-
// blob: die is last-write-wins, dus een edge-write zou door de app overschreven kunnen
// worden. De winkelapp leest de tabel, matcht op barcode/sku en boekt de verkoop zelf.
//
// verify_jwt MOET false zijn (cron en Clover sturen geen Supabase-JWT mee; de backfill
// via de knop stuurt wel een Bearer, die controleren we hieronder zelf met wieBelt).
// Geheimen: MAIL_CRON_SECRET (voor pollen/backfill via de cron), KOPPELING_SLEUTEL.

import { admin, ontsleutel, cloverBasis, cloverFetch, wieBelt, cors, fout } from "../_gedeeld/clover.ts";

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

async function bewaarOrder(koppeling: any, order: any, historisch = false) {
  if (!order || !order.id) return false;
  const betaald = !!(order.payments && order.payments.elements && order.payments.elements.length) ||
    String(order.paymentState || "").toUpperCase() === "PAID";
  const velden = {
    team_id: koppeling.team_id,
    clover_order_id: String(order.id),
    bedrag: (Number(order.total) || 0) / 100,
    besteld_op: order.createdTime ? new Date(Number(order.createdTime)).toISOString() : null,
    betaald,
    regels: regelsUit(order),
  };
  // Bestaat de order al? Dan werken we de veranderlijke velden BIJ. Dat is nodig omdat een
  // order bij het pollen eerst ONBETAALD kan binnenkomen (de betaling hangt er nog niet aan)
  // en pas een poll later betaald is; met een simpele "insert-of-negeer" bleef 'betaald' dan
  // voor altijd op false staan. We laten 'historisch' bewust met rust, zodat een backfill een
  // al live-geboekte verkoop niet stiekem tot historisch ombouwt.
  const { data: oud } = await admin.from("clover_bestellingen")
    .select("id").eq("team_id", koppeling.team_id).eq("clover_order_id", String(order.id)).maybeSingle();
  if (oud) {
    const { error } = await admin.from("clover_bestellingen").update(velden).eq("id", oud.id);
    if (error) { console.error("clover_bestellingen bijwerken:", error.message); }
    return false;   // geen NIEUWE bon
  }
  const { error } = await admin.from("clover_bestellingen").insert({ ...velden, historisch });
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

// Eenmalige backfill: alle orders van de laatste N maanden ophalen als historische omzet.
// Clover pagineert met offset; we lopen door tot een pagina niet meer vol is. We houden
// een tijdsbudget aan zodat we netjes onder de edge-timeout blijven; komen we daar niet
// mee klaar, dan bewaren we de offset en gaat een tweede aanroep verder waar we stopten.
async function backfillTeam(koppeling: any, maanden: number): Promise<{ opgehaald: number; offset: number; klaar: boolean }> {
  const token = await ontsleutel(koppeling.token_versleuteld);
  const regio = (koppeling.webhooks && (koppeling.webhooks as any).regio) || "eu";
  const basis = cloverBasis(regio);
  const sinds = Date.now() - Math.round(maanden) * 30 * 864e5;
  const bf = (koppeling.webhooks && (koppeling.webhooks as any).backfill) || {};
  // Nieuwe periode (ander 'sinds') of nog geen backfill: begin vooraan. Anders verder.
  let offset = (bf && Number(bf.sinds) === sinds && !bf.klaar) ? (Number(bf.offset) || 0) : 0;
  let opgehaald = 0;
  let klaar = false;
  const start = Date.now();
  for (let ronde = 0; ronde < 500; ronde++) {
    if (Date.now() - start > 110000) break;   // ruim onder de timeout; offset onthouden we
    const pad = `/orders?filter=${encodeURIComponent("createdTime>=" + sinds)}&expand=lineItems.item,payments&limit=100&offset=${offset}`;
    const d = await cloverFetch(basis, koppeling.domein, token, pad);
    const orders = (d && d.elements) || [];
    for (const o of orders) { try { if (await bewaarOrder(koppeling, o, true)) opgehaald++; } catch (_e) { /* volgende */ } }
    offset += orders.length;
    if (orders.length < 100) { klaar = true; break; }
  }
  const webhooks = { ...(koppeling.webhooks || {}), backfill: { sinds, offset, klaar, bijgewerkt: Date.now() } };
  await admin.from("winkel_koppelingen").update({ webhooks }).eq("id", koppeling.id);
  return { opgehaald, offset, klaar };
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

  const cronSecret = Deno.env.get("MAIL_CRON_SECRET");
  const isCron = !!cronSecret && (req.headers.get("x-cron-secret") || "") === cronSecret;

  // Eenmalige backfill van de laatste N maanden (historische omzet). Mag de cron
  // (X-Cron-Secret) of een ingelogde eigenaar/beheerder van het team zelf.
  if (body && body.backfill) {
    const maanden = Math.max(1, Math.min(24, Number(body.maanden) || 12));
    let koppelingen: any[] = [];
    if (isCron) {
      const alle = await cloverKoppelingen();
      koppelingen = body.team_id ? alle.filter((k: any) => String(k.team_id) === String(body.team_id)) : alle;
    } else {
      const wie = await wieBelt(req);
      if (!wie || !["eigenaar", "beheerder"].includes(String(wie.rol))) return fout("Niet bevoegd", 403);
      const alle = await cloverKoppelingen();
      koppelingen = alle.filter((k: any) => String(k.team_id) === String(wie.team_id));
    }
    const uit: any[] = [];
    for (const k of koppelingen) {
      try { uit.push({ team_id: k.team_id, ...(await backfillTeam(k, maanden)) }); }
      catch (e) { uit.push({ team_id: k.team_id, fout: e instanceof Error ? e.message : String(e) }); }
    }
    return ok({ modus: "backfill", maanden, teams: uit });
  }

  // 1) Pollen via de cron.
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
