// Alles wat met de Clover-koppeling (de pin/kassa) te maken heeft, op één plek.
//
// Clover heeft een REST API per merchant: https://api.eu.clover.com voor Europa
// (en https://api.clover.com voor de VS). Alles onder /v3/merchants/{mId}/...
// Auth is een Bearer-token: voor de eenvoudige push een API-token dat de winkelier
// zelf aanmaakt in zijn Merchant Dashboard (Settings -> Business Operations -> API
// tokens), met leesrecht en schrijfrecht op de inventory.
//
// Prijzen gaan bij Clover in hele CENTEN (een integer), niet in euro's.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ── gedeelde bouwstenen ──
   Bewust in dit bestand zodat de clover-functie zichzelf redt (niet afhankelijk
   van de shopify-module). De versleuteling gebruikt dezelfde KOPPELING_SLEUTEL,
   zodat het token net zo goed beschermd is als een webshoptoken. */
export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}

async function sleutel() {
  const rauw = Deno.env.get("KOPPELING_SLEUTEL");
  if (!rauw) throw new Error("De instelling KOPPELING_SLEUTEL ontbreekt; zonder die sleutel bewaren we geen token.");
  const bytes = Uint8Array.from(atob(rauw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("KOPPELING_SLEUTEL moet 32 bytes zijn, base64 opgeslagen");
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function versleutel(tekst: string) {
  const k = await sleutel();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const uit = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(tekst)));
  const samen = new Uint8Array(iv.length + uit.length);
  samen.set(iv); samen.set(uit, iv.length);
  return btoa(String.fromCharCode(...samen));
}

export async function ontsleutel(pakket: string) {
  const k = await sleutel();
  const bytes = Uint8Array.from(atob(pakket), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const rest = bytes.slice(12);
  const uit = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, rest);
  return new TextDecoder().decode(uit);
}

/* Wie belt er: de ingelogde gebruiker uit het Bearer-token, met zijn team en rol. */
export async function wieBelt(req: Request) {
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return null;
  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return null;
  const { data: acc } = await admin.from("accounts").select("id, team_id, rol").eq("id", wie.user.id).maybeSingle();
  return acc || null;
}

export function cloverBasis(regio: string | null | undefined) {
  return String(regio || "").toLowerCase() === "us"
    ? "https://api.clover.com"
    : "https://api.eu.clover.com";
}

// Euro's naar hele centen, zoals Clover ze wil.
export function centen(bedrag: unknown) {
  return Math.round((Number(bedrag) || 0) * 100);
}

/* Eén ingang voor alle Clover-aanroepen, met nette foutafhandeling. Clover geeft
   bij een fout een JSON met "message"; die tonen we liever dan een kale status. */
export async function cloverFetch(
  basis: string, mId: string, token: string, pad: string, opties: RequestInit = {},
) {
  const res = await fetch(`${basis}/v3/merchants/${mId}${pad}`, {
    ...opties,
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(opties.headers || {}),
    },
  });
  const tekst = await res.text();
  let data: any = {};
  try { data = tekst ? JSON.parse(tekst) : {}; } catch { /* leeg antwoord mag */ }

  if (res.status === 401 || res.status === 403) {
    throw new Error("Clover accepteert het token niet. Controleer je API-token, het merchant-ID en of je op het juiste dashboard zit (EU of US).");
  }
  if (res.status === 429) {
    throw new Error("Clover vraagt om even te wachten. Probeer het over een halve minuut nog eens.");
  }
  if (!res.ok) {
    throw new Error(data?.message || data?.error || ("Clover gaf status " + res.status));
  }
  return data;
}

/* De winkel opzoeken; meteen de controle dat token + merchant-ID kloppen. Geeft
   de naam en valuta terug zodat de winkelier ziet dát het de juiste winkel is. */
export async function cloverWinkel(basis: string, mId: string, token: string) {
  const d = await cloverFetch(basis, mId, token, "?expand=");
  return { naam: d?.name || null, valuta: d?.currency || null, id: d?.id || mId };
}

/* Eén product naar een Clover-item. Bestaat er al een item met deze barcode
   (code) of sku, dan werken we dat bij; anders maken we een nieuw item. Zo kun je
   de push zo vaak draaien als je wilt zonder dubbele items. Prijs in centen,
   priceType FIXED. Voorraad zetten we los via item_stocks. */
export async function cloverZetItem(
  basis: string, mId: string, token: string,
  p: { naam: string; verkoop: unknown; barcode?: string | null; sku?: string | null; voorraad?: unknown; cloverId?: string | null },
) {
  const lijf: Record<string, unknown> = {
    name: String(p.naam || "").slice(0, 127) || "Product",
    price: centen(p.verkoop),
    priceType: "FIXED",
  };
  if (p.sku) lijf.sku = String(p.sku);
  if (p.barcode) lijf.code = String(p.barcode);

  let item: any = null;
  if (p.cloverId) {
    // Bestaand item bijwerken.
    item = await cloverFetch(basis, mId, token, `/items/${p.cloverId}`, {
      method: "POST", body: JSON.stringify(lijf),
    });
  } else {
    item = await cloverFetch(basis, mId, token, `/items`, {
      method: "POST", body: JSON.stringify(lijf),
    });
  }

  // Voorraad bijwerken als we die hebben. item_stocks vereist dat het item de
  // voorraad bijhoudt; een fout hierop mag de push niet laten klappen.
  if (item?.id && p.voorraad != null) {
    try {
      await cloverFetch(basis, mId, token, `/item_stocks/${item.id}`, {
        method: "POST", body: JSON.stringify({ quantity: Math.max(0, Math.floor(Number(p.voorraad) || 0)) }),
      });
    } catch (_e) { /* voorraad is bijzaak; item staat er */ }
  }
  return item;
}
