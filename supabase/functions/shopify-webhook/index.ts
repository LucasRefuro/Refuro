// Shopify meldt hier wat er in de webshop gebeurt: een bestelling, een
// betaling, een annulering, een verzending.
//
// Twee dingen doen we ermee. Het toestel gaat uit de voorraad, want anders
// verkoop je hem een uur later nog een keer aan de balie. En de bestelling zelf
// komt in Storvo te staan, zodat je ziet dát er iets besteld is en door wie, in
// plaats van dat er een laptop uit je lijst verdwijnt zonder uitleg.
//
// Dit adres staat open op internet, dus er zitten vier sloten op:
//
//   1. Het adres bevat een geheim stukje dat bij één winkel hoort.
//   2. De handtekening van Shopify over de hele inhoud moet kloppen. Die maakt
//      hij met het geheim van onze app, dus alleen Shopify kan hem zetten.
//   3. Het winkeladres in de melding moet bij dat geheim horen.
//   4. En we geloven de inhoud niet op zijn woord: we halen de bestelling zelf
//      op bij Shopify voordat er iets verandert.
//
// Dat laatste is het slot dat er echt toe doet. Ook als de andere drie ooit
// falen, kan niemand hiermee jouw voorraad leegtrekken: de bestelling bestaat
// aan de andere kant gewoon niet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Zelfstandig gehouden (helpers exact overgenomen uit _gedeeld/shopify.ts), zodat de
// deploy uit één bestand bestaat en niet het hele gedeelde bestand hoeft mee te sturen.
const API = "2026-07";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function cryptoSleutel() {
  const rauw = Deno.env.get("KOPPELING_SLEUTEL");
  if (!rauw) throw new Error("KOPPELING_SLEUTEL ontbreekt");
  const bytes = Uint8Array.from(atob(rauw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("KOPPELING_SLEUTEL moet 32 bytes zijn, base64 opgeslagen");
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function ontsleutel(pakket: string) {
  const k = await cryptoSleutel();
  const bytes = Uint8Array.from(atob(pakket), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const rest = bytes.slice(12);
  const uit = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, rest);
  return new TextDecoder().decode(uit);
}
async function graphql(k: { domein: string; token: string }, query: string, variabelen?: unknown) {
  const res = await fetch(`https://${k.domein}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": k.token, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query, variables: variabelen || {} }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Shopify accepteert het token niet meer. Koppel de webshop opnieuw.");
  if (res.status === 429) throw new Error("Shopify vraagt om even te wachten. Probeer het over een halve minuut nog eens.");
  const tekst = await res.text();
  let uit: any = {};
  try { uit = tekst ? JSON.parse(tekst) : {}; } catch { /* leeg antwoord mag */ }
  if (!res.ok) throw new Error("Shopify gaf status " + res.status);
  if (Array.isArray(uit.errors) && uit.errors.length) throw new Error(uit.errors.map((e: any) => e.message).join(" · "));
  return uit.data || {};
}
// Handtekening van Shopify in vaste tijd vergelijken (exact uit _gedeeld/shopify.ts).
function gelijk(a: string, b: string) {
  if (a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return verschil === 0;
}
async function hmac(geheim: string, bericht: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(geheim), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, bericht));
}
async function hmacBase64(geheim: string, tekst: string) {
  const bytes = await hmac(geheim, new TextEncoder().encode(tekst));
  return btoa(String.fromCharCode(...bytes));
}
async function meldingKlopt(lijf: string, gegeven: string | null, geheim: string) {
  if (!gegeven) return false;
  return gelijk(await hmacBase64(geheim, lijf), gegeven);
}

function klaar(tekst = "ok", status = 200) {
  return new Response(tekst, { status });
}

function geld(w: any) {
  const n = Number(w?.shopMoney?.amount ?? w?.amount ?? w);
  return isNaN(n) ? null : n;
}

/* ── de nieuwe accu ──
   Op de productpagina kan de klant een nieuwe accu kiezen (november 2026; telefoon OEM 39 of 49
   euro of origineel 95, laptop 89; de prijzen staan in webshop_extras). Dat is een eigen regel in
   de bestelling met sku NIEUWE-ACCU-..., en als verborgen eigenschap _voor_variant de variant van
   het toestel. Dat toestel moet eerst langs de werkbank: we zetten het bij Te repareren met de
   klus Accu, zodat niemand hem zonder nieuwe accu verstuurt. De klus is een gewone regel bij
   defecten (zoals de controle ze schrijft), met het bestelnummer erin; daaraan zien we bij een
   volgende melding van dezelfde bestelling dat hij er al staat. Een toestel dat los in de winkel
   is toegevoegd heeft ook een werkbankrij (stap los), dus die vinden we ook. */
function isAccuRegel(r: any) {
  return /^NIEUWE-ACCU/i.test(String(r?.sku || ""));
}
/* Een extra bij een toestel (stekker, glas, hoesje, klaar voor gebruik): de sku begint met EXTRA-
   (de functie webshop-extras zet ze zo op de webshop). Geen toestel, dus hij telt niet mee bij
   het zoeken naar het verkochte exemplaar. Anders vraagt een bestelling van een telefoon met een
   glas om twee toestellen, en pakt een vervolgmelding er misschien een tweede bij. */
function isExtraRegel(r: any) {
  return /^EXTRA-/i.test(String(r?.sku || ""));
}
/* Sinds november 2026 kiest de klant een OEM-accu of een originele (sku eindigt op -ORIGINEEL).
   Wie hem plaatst moet dat weten: de klant betaalde voor de originele. Daarom staat het in de klus. */
function isOrigineel(r: any) {
  return /ORIGINEEL/i.test(String(r?.sku || ""));
}
function accuKlusTekst(nummer: string, origineel = false) {
  return `Accu: nieuwe ${origineel ? "ORIGINELE " : ""}accu plaatsen, webshopbestelling ${nummer}. Daarna verzenden.`;
}
async function accuKlus(teamId: string, hardwareId: string, nummer: string, weg: boolean, origineel = false) {
  const { data: rijen } = await admin.from("refurbish_apparaten")
    .select("id, status, defecten").eq("team_id", teamId).eq("hardware_id", hardwareId).limit(1);
  const a = rijen?.[0];
  if (!a) return false;
  const tekst = accuKlusTekst(nummer, origineel);
  const defecten: any[] = Array.isArray(a.defecten) ? a.defecten.slice() : [];
  const heeft = defecten.includes(tekst);
  if (weg) {
    // Geannuleerd: onze klus eraf. Was dat de enige klus, dan is hij weer klaar.
    if (!heeft) return true;
    const rest = defecten.filter((d) => d !== tekst);
    await admin.from("refurbish_apparaten").update({
      defecten: rest, ...(a.status === "te_repareren" && !rest.length ? { status: "klaar" } : {}),
      bijgewerkt_op: new Date().toISOString(),
    }).eq("id", a.id);
    return true;
  }
  if (heeft && a.status === "te_repareren") return true;
  if (!heeft) defecten.push(tekst);
  await admin.from("refurbish_apparaten").update({
    status: "te_repareren", defecten, bijgewerkt_op: new Date().toISOString(),
  }).eq("id", a.id);
  return true;
}

/* Een mail naar de winkel bij elke nieuwe bestelling, met de nieuwe accu groot bovenaan als die
   erbij zit. De eigenaar wilde dat het niet te missen is: een telefoon die zonder nieuwe accu de
   deur uit gaat, is een klant die betaald heeft voor iets wat hij niet krijgt. Ontvanger: het
   geheim WEBSHOP_MELDING_NAAR, anders info@refuro.nl (net als de inruilaanvragen). Lukt de mail
   niet, dan staat de bestelling er gewoon; dit mag de verwerking nooit breken. */
function veilig(x: unknown) {
  return String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
async function mailBestelling(rij: any) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const naar = Deno.env.get("WEBSHOP_MELDING_NAAR") || "info@refuro.nl";
  const van = Deno.env.get("RESEND_FROM") || "Storvo <welkom@storvo.app>";
  const euro = (n: unknown) => n == null ? "" : "€ " + Number(n).toFixed(2).replace(".", ",");
  const metAccu = !!rij.nieuwe_accu;
  const origineel = (rij.regels || []).some((r: any) => r?.accu_origineel);
  const accuToestellen = (rij.toestellen || []).filter((t: any) => t?.nieuwe_accu);
  const accuBlok = metAccu ? `
    <div style="background:#E8421A;color:#fff;border-radius:16px;padding:18px 20px;margin:0 0 18px">
      <div style="font-size:22px;font-weight:700;margin-bottom:6px">${origineel ? "ORIGINELE ACCU ERIN" : "NIEUWE ACCU ERIN"}</div>
      <div style="font-size:15px;line-height:1.5">Eerst de accu vervangen, daarna verzenden. De klant rekent op 1 tot 3 werkdagen.
      ${accuToestellen.length ? "<br><b>Toestel:</b> " + accuToestellen.map((t: any) => veilig(t.naam) + (t.code ? " (" + veilig(t.code) + ")" : "")).join(", ") + ". Staat in Storvo bij Te repareren." : ""}</div>
    </div>` : "";
  /* Het A-nummer bij de regel: daarop pak je het toestel uit de kast. */
  const codesBij = (r: any) => r?.variant
    ? (rij.toestellen || []).filter((t: any) => t?.code && t?.variant && String(t.variant) === String(r.variant)).map((t: any) => t.code)
    : [];
  const regels = (rij.regels || []).map((r: any) =>
    `<tr><td style="padding:6px 0">${r.aantal > 1 ? veilig(r.aantal) + "× " : ""}${r.accu ? "<b>" + veilig(r.titel) + "</b>" : veilig(r.titel)}${r.uitvoering ? " (" + veilig(r.uitvoering) + ")" : ""}${codesBij(r).length ? " <b>" + codesBij(r).map(veilig).join(", ") + "</b>" : ""}${r.voor ? "<br><span style=\"color:#555\">Voor: " + veilig(r.voor) + "</span>" : ""}</td><td style="padding:6px 0;text-align:right;white-space:nowrap">${euro(r.bedrag)}</td></tr>`).join("");
  const toestellen = (rij.toestellen || []).map((t: any) => veilig(t.naam) + (t.code ? " (" + veilig(t.code) + ")" : "") + (t.nieuwe_accu ? " <b>met nieuwe accu</b>" : "")).join("<br>");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#1B2254;max-width:560px">
      ${accuBlok}
      <h2 style="margin:0 0 6px">Nieuwe bestelling ${veilig(rij.nummer || "")}</h2>
      <p style="margin:0 0 14px">${veilig(rij.klant || rij.email || "Onbekende klant")} · ${euro(rij.bedrag)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${regels}</table>
      ${toestellen ? `<p style="margin:16px 0 0;font-size:14px"><b>Uit de voorraad:</b><br>${toestellen}</p>` : ""}
      ${rij.beheer_url ? `<p style="margin:18px 0 0"><a href="${veilig(rij.beheer_url)}">Openen in Shopify</a></p>` : ""}
    </div>`;
  const onderwerp = (metAccu ? (origineel ? "ORIGINELE ACCU ERIN · " : "NIEUWE ACCU ERIN · ") : "") + "Nieuwe bestelling " + (rij.nummer || "");
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: van, to: [naar], reply_to: rij.email || undefined, subject: onderwerp, html }),
    });
    if (!r.ok) console.error("shopify-webhook: mail niet verstuurd", r.status, await r.text());
  } catch (e) { console.error("shopify-webhook: mail niet verstuurd", e); }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return klaar("Alleen POST", 405);

  const pad = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "";
  if (!pad || pad === "shopify-webhook") {
    console.error("shopify-webhook: aanroep zonder geheim in het adres");
    return klaar("Ongeldig", 401);
  }

  const { data: kop } = await admin.from("winkel_koppelingen")
    .select("*").eq("webhook_pad", pad).eq("kanaal", "shopify").maybeSingle();
  if (!kop) {
    console.error("shopify-webhook: onbekend geheim");
    return klaar("Ongeldig", 401);
  }

  const winkel = (req.headers.get("X-Shopify-Shop-Domain") || "").toLowerCase();
  if (winkel && winkel !== String(kop.domein).toLowerCase()) {
    console.error("shopify-webhook: melding van", winkel, "hoort niet bij", kop.domein);
    return klaar("Ongeldig", 401);
  }

  const lijf = await req.text();

  /* De handtekening. Alleen te controleren als de koppeling via onze eigen app
     loopt; bij een geplakt token van iemands eigen app hebben wij dat geheim
     niet. Dan vallen we terug op de andere drie sloten, waarvan het ophalen van
     de bestelling het sterkste is. */
  const appGeheim = Deno.env.get("SHOPIFY_CLIENT_SECRET");
  if (kop.via === "oauth" && appGeheim) {
    const goed = await meldingKlopt(lijf, req.headers.get("X-Shopify-Hmac-Sha256"), appGeheim);
    if (!goed) {
      console.error("shopify-webhook: handtekening klopt niet voor", kop.domein);
      return klaar("Ongeldig", 401);
    }
  }

  let melding: any;
  try { melding = JSON.parse(lijf); } catch { return klaar("Onleesbaar", 400); }

  const bestellingId = melding?.admin_graphql_api_id
    || (melding?.id ? `gid://shopify/Order/${melding.id}` : null);
  if (!bestellingId) return klaar();

  /* De bestelling zelf ophalen. Dit is meteen de controle: bestaat hij niet,
     dan was de melding niet echt en gebeurt er niets.
     LET OP: geen customer/email opvragen. Die velden eisen de scope read_customers
     (Shopify: "Access denied for customer field"); hebben we die niet, dan faalt de
     HELE query met 500 en synct de verkoop nooit. De naam/adres van de koper zie je
     via beheer_url (de Shopify-orderlink). Wil je klantnaam in Storvo: voeg
     read_customers toe aan de app-scopes en koppel opnieuw, dan kan dit veld terug. */
  let order: any = null;
  let klantNaam: string | null = null, klantEmail: string | null = null;
  try {
    const token = await ontsleutel(kop.token_versleuteld);
    const d = await graphql({ domein: kop.domein, token }, `
      query($id: ID!) {
        order(id: $id) {
          id name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 100) {
            nodes {
              title variantTitle sku quantity
              customAttributes { key value }
              originalTotalSet { shopMoney { amount } }
              product { id }
              variant { id }
            }
          }
        }
      }`, { id: bestellingId });

    if (!d?.order) {
      console.error("shopify-webhook: bestelling", bestellingId, "bestaat niet bij Shopify");
      return klaar("Ongeldig", 401);
    }
    order = d.order;
    /* Klantnaam is best-effort en apart: alleen als het token read_customers heeft.
       Faalt deze query (geen scope), dan blijft de naam leeg en loopt de verkoop-sync
       gewoon door. Zo kan deze extra nooit de hele sync breken, zoals de read_customers-
       500 dat vroeger deed toen customer/email in de hoofdquery zat. */
    try {
      const c = await graphql({ domein: kop.domein, token }, `query($id: ID!){ order(id: $id){ customer { displayName email } email } }`, { id: bestellingId });
      klantNaam = c?.order?.customer?.displayName || null;
      klantEmail = c?.order?.customer?.email || c?.order?.email || null;
    } catch (_e) { /* geen read_customers: klant blijft leeg, sync gaat door */ }
  } catch (e) {
    console.error("shopify-webhook: bestelling ophalen mislukt", e);
    /* Een fout van onze kant is geen reden om Shopify te laten stoppen met
       proberen. Een foutstatus zorgt dat Shopify het later opnieuw stuurt. */
    return klaar("Later opnieuw", 500);
  }

  const regels = order.lineItems?.nodes || [];
  const geannuleerd = !!order.cancelledAt;
  const betaald = String(order.displayFinancialStatus || "").toUpperCase() === "PAID";
  const verzonden = String(order.displayFulfillmentStatus || "").toUpperCase() === "FULFILLED";

  /* De eerder bewaarde bestelling is onze betrouwbare terugval: daarin staan de
     hardware-id's van de toestellen. Nodig omdat we bij de verkoop de
     shopify-marker uit het toestel halen; een toestel zonder code/serienummer is
     daarna niet meer via de melding te matchen, en paid/cancelled/fulfilled komen
     als losse meldingen binnen. */
  const { data: bestaand } = await admin.from("webshop_bestellingen")
    .select("id, toestellen, toestellen_weg").eq("team_id", kop.team_id).eq("kanaal", "shopify")
    .eq("bestelling_id", String(bestellingId)).maybeSingle();
  const eerderToestellen: any[] = Array.isArray(bestaand?.toestellen) ? bestaand.toestellen : [];
  /* Toestellen die er niet meer zijn (de winkel koos in Storvo "Niet meer op voorraad"). Ze tellen
     mee als al toegewezen, anders pakt een volgende melding stilletjes een ander exemplaar van
     dezelfde variant. Ze staan niet in toestellen, dus een annulering zet ze ook niet terug. */
  const wegToestellen: any[] = Array.isArray(bestaand?.toestellen_weg) ? bestaand.toestellen_weg : [];

  /* ── de toestellen uit deze bestelling ──
     Bij grade-varianten hangen meerdere toestellen aan één product; de verkochte
     VARIANT wijst het juiste exemplaar aan. Per regel pakken we de oudste onverkochte
     exemplaren van die variant (FIFO), zo veel als er verkocht zijn. Terugval: het oude
     model (één product = één toestel) op product-id, of de sku als iemand het product in
     Shopify zelf opnieuw heeft aangemaakt.

     Idempotent bij herhaalde meldingen (created/paid/fulfilled komen los binnen): we tellen
     wat er al aan de bestelling hangt (per variant én totaal) en verkopen nooit meer dan de
     bestelde aantallen, zodat een tweede melding niet stiekem een tweede toestel meepakt. */
  const gevonden: { id: string; naam: string; code: string | null; variant?: string | null }[] = [];
  const gedaan = new Set<string>();
  // Een nieuwe accu is een klus, geen toestel: die telt hier niet mee.
  const totaalNodig = regels.filter((r: any) => !isAccuRegel(r) && !isExtraRegel(r)).reduce((n: number, r: any) => n + Math.max(1, Math.floor(Number(r?.quantity) || 1)), 0);
  const alGedaanIds = new Set<string>([...eerderToestellen, ...wegToestellen].map((t: any) => t?.id).filter(Boolean));
  /* Een weg-toestel dat al vervangen is, telt via zijn vervanger (die staat in toestellen). */
  const vervangen = new Set<string>(eerderToestellen.map((t: any) => t?.vervangt_id).filter(Boolean));
  const wegOpen = wegToestellen.filter((t: any) => t?.id && !vervangen.has(t.id));
  let toegewezen = eerderToestellen.length + wegOpen.length;

  for (const r of regels) {
    if (geannuleerd) continue;             // een annulering loopt via de bewaarde bestelling hieronder
    if (isAccuRegel(r)) continue;          // de nieuwe accu: zie hieronder
    if (isExtraRegel(r)) continue;         // een extra: zie hieronder
    if (toegewezen >= totaalNodig) break;  // genoeg toestellen aan de bestelling; niets dubbels

    const variantId = r?.variant?.id || null;
    const productId = r?.product?.id || null;
    const sku = r?.sku || null;
    const aantal = Math.max(1, Math.floor(Number(r?.quantity) || 1));

    // Zoveel van deze variant hangen er al aan de bestelling; die hoeven we niet nog eens.
    const alReeds = variantId ? [...eerderToestellen, ...wegOpen].filter((t: any) => t?.variant && String(t.variant) === String(variantId)).length : 0;
    let nodig = Math.min(aantal - alReeds, totaalNodig - toegewezen);
    if (nodig <= 0) continue;

    let rijen: any[] = [];
    if (variantId) {
      const { data } = await admin.from("hardware")
        .select("id, status, kanalen, merk, model, code")
        .eq("team_id", kop.team_id)
        .eq("kanalen->shopify->>variant", String(variantId))
        .eq("status", "voorraad")
        .order("aangemaakt_op", { ascending: true }).limit(nodig + 5);
      rijen = data || [];
    }
    if (!rijen.length && productId) {
      const { data } = await admin.from("hardware")
        .select("id, status, kanalen, merk, model, code")
        .eq("team_id", kop.team_id)
        .eq("kanalen->shopify->>id", String(productId))
        .eq("status", "voorraad")
        .order("aangemaakt_op", { ascending: true }).limit(nodig + 5);
      rijen = data || [];
    }
    if (!rijen.length && sku) {
      const { data } = await admin.from("hardware")
        .select("id, status, kanalen, merk, model, code")
        .eq("team_id", kop.team_id)
        .or(`code.eq.${sku},serienummer.eq.${sku}`)
        .eq("status", "voorraad").limit(nodig + 5);
      rijen = data || [];
    }

    for (const rij of rijen) {
      if (nodig <= 0) break;
      if (alGedaanIds.has(rij.id) || gedaan.has(rij.id) || rij.status === "verkocht") continue;

      const kanalen = (rij.kanalen && typeof rij.kanalen === "object") ? { ...rij.kanalen } : {};
      delete kanalen.shopify;
      await admin.from("hardware").update({
        status: "verkocht",
        verkocht_op: order.createdAt || new Date().toISOString(),
        verkocht_via: "webshop",
        kanalen,
        bijgewerkt_op: new Date().toISOString(),
      }).eq("id", rij.id);
      gevonden.push({ id: rij.id, naam: [rij.merk, rij.model].filter(Boolean).join(" "), code: rij.code || null, variant: variantId });
      gedaan.add(rij.id);
      nodig--; toegewezen++;
      console.log("shopify-webhook: toestel", rij.id, "verkocht in de webshop (variant", variantId, ")");
    }
  }

  /* Toestellen die we deze melding niet meer konden matchen (marker weg, geen
     sku) halen we uit de eerder bewaarde bestelling. Bij een annulering zetten
     we ze alsnog terug op voorraad; en de toestellenlijst van de bestelling mag
     nooit leeglopen op een vervolgmelding. */
  const toestellenSamen: any[] = [...gevonden];
  for (const t of eerderToestellen) {
    if (!t?.id || gedaan.has(t.id)) continue;
    toestellenSamen.push(t);
    if (geannuleerd) {
      const { data: hw } = await admin.from("hardware")
        .select("id, status").eq("team_id", kop.team_id).eq("id", t.id).maybeSingle();
      if (hw && hw.status === "verkocht") {
        await admin.from("hardware").update({
          status: "voorraad", verkocht_op: null, verkocht_via: null,
          bijgewerkt_op: new Date().toISOString(),
        }).eq("id", hw.id);
        console.log("shopify-webhook: geannuleerd (via bewaarde bestelling), toestel", hw.id, "terug op voorraad");
      }
    }
  }

  /* Welk toestel krijgt de nieuwe accu? De verborgen eigenschap _voor_variant wijst de variant
     aan; staat er maar één toestel in de bestelling, dan is het die. Bij een annulering gaat de
     klus er weer af (het toestel ging hierboven al terug op voorraad). */
  let metAccu = false;
  for (const r of regels.filter(isAccuRegel)) {
    metAccu = true;
    const attrs: any[] = Array.isArray(r?.customAttributes) ? r.customAttributes : [];
    const voorVariant = String(attrs.find((x: any) => x?.key === "_voor_variant")?.value || "");
    let t = voorVariant
      ? toestellenSamen.find((x: any) => x?.variant && String(x.variant).split("/").pop() === voorVariant)
      : null;
    if (!t && toestellenSamen.length === 1) t = toestellenSamen[0];
    if (!t) { console.error("shopify-webhook: nieuwe accu zonder toestel in", order.name); continue; }
    t.nieuwe_accu = true;
    if (isOrigineel(r)) t.accu_origineel = true;
    try { await accuKlus(kop.team_id, t.id, order.name || String(bestellingId), geannuleerd, isOrigineel(r)); }
    catch (e) { console.error("shopify-webhook: accuklus", t.id, e); }
  }

  /* ── de extra's ──
     Welke extra en welke uitvoering: we zoeken de sku op in webshop_extras.shopify_varianten. De
     delen (welke producten erin zitten) gaan mee, zodat de winkelapp ze van de voorraad haalt. Dat
     doet de winkelapp zelf en niet deze functie: de voorraad staat in de winkeldata-blob, en daar
     schrijven vanaf hier botst met een openstaande winkelapp die de oude stand terugzet.
     extras_boeking blijft leeg; de winkelapp claimt de boeking (zie de migratie webshop_extras). */
  const extras: any[] = [];
  const extraRegels = regels.filter(isExtraRegel);
  if (extraRegels.length) {
    const { data: lijst } = await admin.from("webshop_extras")
      .select("sleutel, naam, soort, varianten, shopify_varianten").eq("team_id", kop.team_id);
    for (const r of extraRegels) {
      const sku = String(r?.sku || "");
      let hit: any = null;
      for (const x of lijst || []) {
        const sv = (x.shopify_varianten && typeof x.shopify_varianten === "object") ? x.shopify_varianten : {};
        const label = Object.keys(sv).find((l) => String(sv[l]?.sku || "").toUpperCase() === sku.toUpperCase());
        if (label == null) continue;
        const v = (Array.isArray(x.varianten) ? x.varianten : []).find((v: any) => String(v?.label) === label);
        hit = { sleutel: x.sleutel, naam: x.naam, soort: x.soort, label, delen: Array.isArray(v?.delen) ? v.delen : [] };
        break;
      }
      if (!hit) { console.error("shopify-webhook: extra", sku, "niet gevonden in webshop_extras"); hit = { sleutel: null, naam: r?.title || sku, soort: "artikel", label: null, delen: [] }; }
      extras.push({ ...hit, sku, aantal: Math.max(1, Math.floor(Number(r?.quantity) || 1)) });
    }
  }

  /* ── de bestelling zelf bewaren ──
     Zodat je in Storvo ziet wat er besteld is en niet alleen dat er iets uit de
     voorraad verdwenen is. */
  const nummer = String(bestellingId).split("/").pop();
  const rij = {
    team_id: kop.team_id, kanaal: "shopify",
    bestelling_id: String(bestellingId),
    nummer: order.name || null,
    klant: klantNaam,
    email: klantEmail,
    bedrag: geld(order.totalPriceSet),
    valuta: order.totalPriceSet?.shopMoney?.currencyCode || kop.valuta || null,
    status: geannuleerd ? "geannuleerd" : (verzonden ? "verzonden" : (betaald ? "betaald" : "open")),
    betaald, verzonden, geannuleerd,
    regels: regels.map((r: any) => {
      const voor = (Array.isArray(r?.customAttributes) ? r.customAttributes : [])
        .find((x: any) => x?.key && !String(x.key).startsWith("_"))?.value || null;
      return {
        titel: r.title, sku: r.sku || null, aantal: r.quantity,
        bedrag: geld(r.originalTotalSet),
        /* De variant wijst aan welk toestel bij deze regel hoort (toestellen[].variant). Zo zet
           Storvo het A-nummer bij de goede regel, ook als er twee dezelfde modellen in staan. */
        ...(r?.variant?.id ? { variant: String(r.variant.id) } : {}),
        ...(r.variantTitle && r.variantTitle !== "Default Title" ? { uitvoering: r.variantTitle } : {}),
        ...(isAccuRegel(r) ? { accu: true, voor, ...(isOrigineel(r) ? { accu_origineel: true } : {}) } : {}),
        ...(isExtraRegel(r) ? { extra: true, voor } : {}),
      };
    }),
    toestellen: toestellenSamen,
    nieuwe_accu: metAccu,
    extras,
    beheer_url: `https://${kop.domein}/admin/orders/${nummer}`,
    geplaatst_op: order.createdAt || new Date().toISOString(),
    bijgewerkt_op: new Date().toISOString(),
  };

  if (bestaand) {
    await admin.from("webshop_bestellingen").update(rij).eq("id", bestaand.id);
  } else {
    await admin.from("webshop_bestellingen").insert(rij);
    // Alleen bij de eerste melding van een bestelling, anders mail je hem bij betaald nog eens.
    if (!geannuleerd) await mailBestelling(rij);
  }

  return klaar();
});
