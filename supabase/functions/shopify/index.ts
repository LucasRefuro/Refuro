// Zet een toestel op de webshop, of haalt hem er weer af.
//
// Het probleem dat dit oplost: één laptop staat op Shopify, op Marktplaats en
// in de winkel. Verkoop je hem aan de balie, dan moet hij binnen een minuut
// overal offline. Anders verkoop je hem twee keer en mag je een klant bellen
// dat het toch niet doorgaat.
//
// De sleutel van de webshop staat als instelling in Supabase en komt nooit in
// de browser. Zodra meerdere winkels hun eigen webshop koppelen verhuist dat
// naar een rij per winkel; de opzet hieronder is daar al op voorbereid.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const API = "2024-10";

function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}

async function shopify(pad: string, methode = "GET", lijf?: unknown) {
  const winkel = Deno.env.get("SHOPIFY_WINKEL");
  const token = Deno.env.get("SHOPIFY_TOKEN");
  if (!winkel || !token) throw new Error("De webshop is nog niet gekoppeld");

  const res = await fetch(`https://${winkel}/admin/api/${API}/${pad}`, {
    method: methode,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: lijf ? JSON.stringify(lijf) : undefined,
  });
  const tekst = await res.text();
  let uit: any = {};
  try { uit = tekst ? JSON.parse(tekst) : {}; } catch { /* leeg antwoord mag */ }
  if (!res.ok) {
    const m = uit?.errors ? JSON.stringify(uit.errors) : "Shopify gaf status " + res.status;
    throw new Error(m);
  }
  return uit;
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);

  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return fout("Niet ingelogd", 401);

  const { data: acc } = await admin.from("accounts")
    .select("team_id").eq("id", wie.user.id).maybeSingle();
  if (!acc) return fout("Je account is niet gevonden", 403);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const actie = String(lijf?.actie || "");
  const id = String(lijf?.hardware_id || "");
  if (!id) return fout("Geen toestel meegegeven");

  // Altijd zelf ophalen, zodat de browser niet kan bepalen wat er verkocht wordt.
  const { data: h } = await admin.from("hardware")
    .select("*").eq("id", id).eq("team_id", acc.team_id).maybeSingle();
  if (!h) return fout("Dit toestel is niet gevonden", 404);

  const kanalen = (h.kanalen && typeof h.kanalen === "object") ? { ...h.kanalen } : {};

  try {
    if (actie === "online") {
      if (h.verkoop == null) return fout("Vul eerst een vraagprijs in");
      const titel = h.titel || [h.merk, h.model].filter(Boolean).join(" ");

      const gemaakt = await shopify("products.json", "POST", {
        product: {
          title: titel,
          body_html: beschrijving(h),
          vendor: h.merk || "Storvo",
          product_type: h.categorie || "Laptop",
          status: "active",
          tags: ["refurbished", h.staat ? "staat-" + h.staat : ""].filter(Boolean).join(", "),
          variants: [{
            price: String(h.verkoop),
            sku: h.serienummer || undefined,
            inventory_management: "shopify",
            inventory_policy: "deny",
            requires_shipping: true,
          }],
        },
      });

      const p = gemaakt.product;
      const variant = p?.variants?.[0];

      // Eén stuk op voorraad zetten. Zonder dit staat hij op nul en kan niemand
      // hem kopen, wat een lastig te vinden fout is.
      if (variant?.inventory_item_id) {
        const loc = await shopify("locations.json");
        const eerste = loc?.locations?.[0]?.id;
        if (eerste) {
          await shopify("inventory_levels/set.json", "POST", {
            location_id: eerste,
            inventory_item_id: variant.inventory_item_id,
            available: 1,
          });
        }
      }

      const winkel = Deno.env.get("SHOPIFY_WINKEL");
      kanalen.shopify = {
        id: p.id,
        variant: variant?.id || null,
        url: p.handle ? `https://${winkel}/products/${p.handle}` : null,
        sinds: new Date().toISOString(),
      };
      await admin.from("hardware").update({
        kanalen, bijgewerkt_op: new Date().toISOString(),
      }).eq("id", id);

      return new Response(JSON.stringify({ ok: true, kanalen }), { headers: cors });
    }

    if (actie === "offline") {
      const s = kanalen.shopify;
      if (s?.id) {
        // Verwijderen in plaats van op nul zetten: een verkocht toestel komt
        // nooit meer terug, en een lege productpagina is slechter dan geen.
        try { await shopify(`products/${s.id}.json`, "DELETE"); } catch (e) {
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
      if (!s?.variant) return fout("Dit toestel staat niet op de webshop");
      await shopify(`variants/${s.variant}.json`, "PUT", {
        variant: { id: s.variant, price: String(h.verkoop ?? 0) },
      });
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    return fout("Onbekende actie");
  } catch (e) {
    console.error("shopify", actie, e);
    return fout(e instanceof Error ? e.message : "De webshop reageerde niet", 502);
  }
});
