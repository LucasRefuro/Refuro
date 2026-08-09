// Shopify meldt hier dat er iets verkocht is in de webshop.
//
// Zonder deze functie loopt je voorraad uit de pas: iemand koopt online een
// laptop, en jij verkoopt hem een uur later nog een keer aan de balie.
//
// Shopify ondertekent elke melding met een geheim. Klopt de handtekening niet,
// dan is het bericht niet van Shopify en doen we er niets mee.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function echt(lijf: string, handtekening: string | null) {
  const geheim = Deno.env.get("SHOPIFY_WEBHOOK_SECRET");
  if (!geheim || !handtekening) return false;
  const eigen = createHmac("sha256", geheim).update(lijf, "utf8").digest("base64");
  // Even lang, anders is vergelijken zinloos.
  if (eigen.length !== handtekening.length) return false;
  let verschil = 0;
  for (let i = 0; i < eigen.length; i++) verschil |= eigen.charCodeAt(i) ^ handtekening.charCodeAt(i);
  return verschil === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Alleen POST", { status: 405 });

  const lijf = await req.text();
  if (!echt(lijf, req.headers.get("X-Shopify-Hmac-Sha256"))) {
    console.error("shopify-webhook: handtekening klopt niet");
    return new Response("Ongeldig", { status: 401 });
  }

  let order: any;
  try { order = JSON.parse(lijf); } catch { return new Response("Onleesbaar", { status: 400 }); }

  const regels = Array.isArray(order?.line_items) ? order.line_items : [];
  if (!regels.length) return new Response("ok");

  // We herkennen het toestel aan het product-ID dat we bij het publiceren
  // hebben opgeslagen. Het serienummer staat als sku ook op de regel, maar dat
  // is niet altijd ingevuld, dus dat is alleen de reservemanier.
  for (const r of regels) {
    const productId = r?.product_id;
    const sku = r?.sku;

    let rij: any = null;
    if (productId) {
      const { data } = await admin.from("hardware")
        .select("id, status, kanalen")
        .eq("kanalen->shopify->>id", String(productId))
        .maybeSingle();
      rij = data;
    }
    if (!rij && sku) {
      const { data } = await admin.from("hardware")
        .select("id, status, kanalen")
        .eq("serienummer", sku).eq("status", "voorraad")
        .maybeSingle();
      rij = data;
    }
    if (!rij || rij.status === "verkocht") continue;

    const kanalen = (rij.kanalen && typeof rij.kanalen === "object") ? { ...rij.kanalen } : {};
    delete kanalen.shopify;

    await admin.from("hardware").update({
      status: "verkocht",
      verkocht_op: new Date().toISOString(),
      verkocht_via: "webshop",
      kanalen,
      bijgewerkt_op: new Date().toISOString(),
    }).eq("id", rij.id);

    console.log("shopify-webhook: toestel", rij.id, "verkocht in de webshop");
  }

  return new Response("ok");
});
