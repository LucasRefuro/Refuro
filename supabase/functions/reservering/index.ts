// "Reserveren, betaal in de winkel" voor de refuro.nl-webshop.
//
// Een klant zet online een refurbished toestel vast zonder te betalen. Het
// exemplaar gaat op hardware.status='gereserveerd'. Daardoor valt het uit de
// grade-telling van de webshop-sync (die telt alleen status='voorraad'), en we
// zetten de Shopify-voorraad van die grade meteen op het nieuwe aantal. Zo kan
// niemand het toestel nog online kopen en ziet de kassa het niet meer als vrije
// voorraad. De klant betaalt later aan de kassa; de winkel rekent de reservering
// af of annuleert hem in Storvo.
//
// 'reserveer' is publiek (zoals inruil-aanvraag: honeypot + rate-limit +
// server-side validatie; de webshop is publiek, dus een gedeeld secret is geen
// echte auth). 'afrekenen' / 'annuleren' / 'verval' zijn ingelogd (wieBelt),
// want die komen uit de winkelapp.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Shopify GraphQL Admin API-versie. Gelijkhouden aan _gedeeld/shopify.ts.
const API = "2026-07";

const GRADE_NAAM: Record<string, string> = { A: "Uitstekend", B: "Zeer goed", C: "Prima" };
function gradeLetter(staat: unknown) {
  const s = String(staat ?? "B").toUpperCase();
  return (s === "A" || s === "B" || s === "C") ? s : "B";
}

// Token ontsleutelen: zelfde AES-GCM als _gedeeld/shopify.ts (KOPPELING_SLEUTEL).
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

type Koppeling = {
  id: string; team_id: string; domein: string; token: string;
  publicatie_id: string | null; locatie_id: string | null;
};
async function koppelingVan(teamId: string): Promise<Koppeling | null> {
  const { data } = await admin.from("winkel_koppelingen")
    .select("*").eq("team_id", teamId).eq("kanaal", "shopify").maybeSingle();
  if (!data) return null;
  return { ...data, token: await ontsleutel(data.token_versleuteld) } as Koppeling;
}

// Shopify GraphQL, zelfde foutafhandeling als _gedeeld/shopify.ts.
async function graphql(k: { domein: string; token: string }, query: string, variabelen?: unknown) {
  const res = await fetch(`https://${k.domein}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": k.token,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ query, variables: variabelen || {} }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Shopify accepteert het token niet meer. Koppel de webshop opnieuw.");
  if (res.status === 429) throw new Error("Shopify vraagt om even te wachten. Probeer het over een halve minuut nog eens.");
  const tekst = await res.text();
  let uit: any = {};
  try { uit = tekst ? JSON.parse(tekst) : {}; } catch { /* leeg antwoord mag */ }
  if (!res.ok) throw new Error("Shopify gaf status " + res.status);
  if (Array.isArray(uit.errors) && uit.errors.length) {
    throw new Error(uit.errors.map((e: any) => e.message).join(" · "));
  }
  return uit.data || {};
}

// Wie belt er: de ingelogde gebruiker uit de winkelapp (voor afrekenen/annuleren/verval).
async function wieBelt(req: Request) {
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return null;
  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return null;
  const { data: acc } = await admin.from("accounts")
    .select("id, team_id, rol").eq("id", wie.user.id).maybeSingle();
  return acc || null;
}

const TEAM = Deno.env.get("RESERVERING_TEAM_ID") || Deno.env.get("INRUIL_TEAM_ID") ||
  "ce975142-a7d9-4fb2-9cb5-9cc1fe1d7f65";
const VERVAL_DAGEN = Number(Deno.env.get("RESERVERING_DAGEN") || "3");

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("RESERVERING_ORIGIN") || Deno.env.get("INRUIL_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-reservering-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}
function ok(extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, ...extra }), { headers: cors });
}
function knip(x: unknown, max: number) {
  return x == null ? "" : String(x).slice(0, max).trim();
}
// De webshop stuurt de variant als nummer (57362545410313) of als volledige gid.
function variantGidVan(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s.startsWith("gid://")) return s;
  if (/^\d+$/.test(s)) return "gid://shopify/ProductVariant/" + s;
  return "";
}
function euro(n: unknown): string {
  const x = Number(n);
  if (!isFinite(x)) return "";
  return "€ " + x.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Shopify-voorraad van één grade-variant op het juiste aantal zetten ──
   Deze API-versie eist changeFromQuantity (de waarde die je verwacht). We lezen
   dus eerst de huidige "available" op de winkel-locatie en zetten hem dan op het
   echte aantal onverkochte exemplaren van die grade. Absoluut zetten (niet een
   delta) is zelfcorrigerend: het kan niet uit de pas gaan lopen met de bron van
   waarheid. Best effort: een fout hier houdt de actie niet tegen; de volledige
   sync corrigeert later alsnog. */
async function inventoryNiveauVan(k: any, variantGid: string) {
  const d = await graphql(k, `query($id:ID!,$loc:ID!){
    productVariant(id:$id){ inventoryItem{ id inventoryLevel(locationId:$loc){ quantities(names:["available"]){ name quantity } } } }
  }`, { id: variantGid, loc: k.locatie_id });
  const item = d?.productVariant?.inventoryItem;
  if (!item?.id) return null;
  const q = (item.inventoryLevel?.quantities || []).find((x: any) => x?.name === "available");
  return { itemId: item.id as string, huidig: q ? Number(q.quantity) : 0 };
}
async function zetShopifyVoorraad(k: any, variantGid: string, doelAantal: number) {
  if (!k?.locatie_id) return; // geen locatie bekend: de volgende volledige sync zet het recht
  const niv = await inventoryNiveauVan(k, variantGid);
  if (!niv) return;
  const doel = Math.max(0, Math.round(doelAantal));
  if (niv.huidig === doel) return; // al goed, niets te doen
  // De @idempotent-directive met unieke sleutel is sinds 2026-04 verplicht.
  const uit = await graphql(k, `
    mutation($input: InventorySetQuantitiesInput!, $key: String!){
      inventorySetQuantities(input: $input) @idempotent(key: $key){ userErrors { field message } }
    }`, {
    input: {
      name: "available",
      reason: "correction",
      quantities: [{ inventoryItemId: niv.itemId, locationId: k.locatie_id, quantity: doel, changeFromQuantity: niv.huidig }],
    },
    key: crypto.randomUUID(),
  });
  const f = uit?.inventorySetQuantities?.userErrors || [];
  if (f.length) console.error("voorraad zetten", f.map((e: any) => e.message).join(" · "));
}
async function telVoorraad(teamId: string, variantGid: string) {
  const { count } = await admin.from("hardware")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId).eq("status", "voorraad")
    .eq("kanalen->shopify->>variant", variantGid);
  return count ?? 0;
}
// De grade-variant op de echte voorraad zetten (na reserveren/annuleren/vervallen).
async function herstelShopifyVoorraad(teamId: string, variantGid: string) {
  try {
    const k = await koppelingVan(teamId);
    if (k) await zetShopifyVoorraad(k, variantGid, await telVoorraad(teamId, variantGid));
  } catch (e) {
    console.error("herstel voorraad", e); // de sync zet het later alsnog recht
  }
}

/* ── e-mail (zelfde inline-patroon als inruil-aanvraag) ── */
async function mailWinkel(r: Record<string, unknown>) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const naar = Deno.env.get("RESERVERING_NAAR") || Deno.env.get("INRUIL_NAAR") || "info@refuro.nl";
  const van = Deno.env.get("RESEND_FROM") || "Storvo <welkom@storvo.app>";
  const g = (k: string) => String(r[k] ?? "-");
  const html = `
    <h2 style="margin:0 0 12px">Nieuwe reservering (betaalt in de winkel)</h2>
    <p><b>Toestel:</b> ${g("toestel")}<br>
       <b>Prijs:</b> ${euro(r.prijs) || "-"}</p>
    <p><b>Naam:</b> ${g("naam")}<br>
       <b>E-mail:</b> ${g("email")}<br>
       <b>Telefoon:</b> ${g("telefoon")}</p>
    <p>Het toestel staat vast en is uit de webshop gehaald. Reken het af in Storvo
       zodra de klant het komt ophalen, of annuleer de reservering.</p>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: van, to: [naar],
      reply_to: r.email ? String(r.email) : undefined,
      subject: `Reservering - ${g("toestel")}`,
      html,
    }),
  });
}
async function mailKlant(r: Record<string, unknown>, taal: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const naar = String(r.email || "");
  if (!naar) return;
  const van = Deno.env.get("RESEND_KLANT_FROM") || "Refuro <welkom@storvo.app>";
  const antwoord = Deno.env.get("RESERVERING_NAAR") || Deno.env.get("INRUIL_NAAR") || "info@refuro.nl";
  const naam = String(r.naam || "").split(" ")[0];
  const toestel = String(r.toestel || "");
  const prijs = euro(r.prijs);
  const en = taal === "en";
  const onderwerp = en ? "We are holding your device" : "We houden je toestel vast";
  const html = en
    ? `<div style="font-family:system-ui,Arial,sans-serif;color:#1B2254;line-height:1.55">
        <h2 style="margin:0 0 12px">Reserved, pay in store</h2>
        <p>Hi ${naam || "there"}, we are holding this device for you.</p>
        <p><b>${toestel}</b>${prijs ? `<br>${prijs}` : ""}</p>
        <p>Come by our shop in Rijen and pay at the counter. We keep it for you for ${VERVAL_DAGEN} days. No payment needed now.</p>
        <p>Refuro, Hoofdstraat 7a, Rijen</p>
      </div>`
    : `<div style="font-family:system-ui,Arial,sans-serif;color:#1B2254;line-height:1.55">
        <h2 style="margin:0 0 12px">Gereserveerd, betaal in de winkel</h2>
        <p>Hoi ${naam || "daar"}, we houden dit toestel voor je vast.</p>
        <p><b>${toestel}</b>${prijs ? `<br>${prijs}` : ""}</p>
        <p>Kom langs in onze winkel in Rijen en betaal aan de balie. We houden het ${VERVAL_DAGEN} dagen voor je vast. Nu hoef je niets te betalen.</p>
        <p>Refuro, Hoofdstraat 7a, Rijen</p>
      </div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: van, to: [naar], reply_to: antwoord, subject: onderwerp, html }),
  });
}

/* ── reserveren (publiek) ── */
async function reserveer(lijf: Record<string, unknown>, req: Request) {
  if (knip(lijf.bedrijf, 100)) return ok(); // honeypot: doe alsof het lukte
  const naam = knip(lijf.naam, 120);
  const email = knip(lijf.email, 200);
  const telefoon = knip(lijf.telefoon, 40);
  const variantGid = variantGidVan(lijf.variant_id ?? lijf.variant);
  if (!naam || !/.+@.+\..+/.test(email) || !telefoon) {
    return fout("Vul je naam, e-mailadres en telefoonnummer in.");
  }
  if (!variantGid) return fout("Geen geldig toestel meegegeven.");

  // Soft rate-limit: max 5 reserveringen per e-mail per 10 minuten.
  const sinds = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: recent } = await admin.from("webshop_reserveringen")
    .select("id", { count: "exact", head: true })
    .eq("team_id", TEAM).eq("email", email).gte("aangemaakt_op", sinds);
  if ((recent ?? 0) >= 5) return fout("Je hebt net al gereserveerd. Probeer het zo nog eens.", 429);

  // Oudste vrije exemplaar van deze grade-variant (FIFO).
  const { data: kandidaten } = await admin.from("hardware")
    .select("*").eq("team_id", TEAM).eq("status", "voorraad")
    .eq("kanalen->shopify->>variant", variantGid)
    .order("aangemaakt_op", { ascending: true }).limit(1);
  const dev = (kandidaten || [])[0] as any;
  if (!dev) return fout("Dit toestel is net niet meer beschikbaar.", 409);

  // Atomair vastzetten: alleen als het exemplaar nog echt op voorraad staat.
  const { data: gezet } = await admin.from("hardware")
    .update({ status: "gereserveerd", bijgewerkt_op: new Date().toISOString() })
    .eq("id", dev.id).eq("status", "voorraad").select("id");
  if (!gezet || !gezet.length) return fout("Dit toestel is net niet meer beschikbaar.", 409);

  const sh = (dev.kanalen && dev.kanalen.shopify) || {};
  const grade = sh.grade || gradeLetter(dev.staat);
  const gradeNaam = GRADE_NAAM[grade] || "";
  const naamToestel = knip(dev.titel || [dev.merk, dev.model].filter(Boolean).join(" "), 200);
  const prijsIn = Number(lijf.prijs);
  const prijs = isFinite(prijsIn) && prijsIn > 0 ? prijsIn : (dev.verkoop != null ? Number(dev.verkoop) : null);
  const vervalt = new Date(Date.now() + VERVAL_DAGEN * 24 * 60 * 60 * 1000).toISOString();

  const rij = {
    team_id: TEAM, hardware_id: dev.id, sleutel: sh.sleutel || null, grade,
    variant_id: variantGid, product_id: sh.id || null,
    toestel: gradeNaam ? `${naamToestel} (${gradeNaam})` : naamToestel,
    prijs, naam, email, telefoon, status: "open", vervalt_op: vervalt,
    ruwe_json: {
      taal: knip(lijf.taal, 5), url: knip(lijf.url, 300),
      ip: req.headers.get("x-forwarded-for") || "", ua: req.headers.get("user-agent") || "",
    },
  };
  const { data: ins, error } = await admin.from("webshop_reserveringen").insert(rij).select("id").maybeSingle();
  if (error) {
    // Terugdraaien: het toestel weer op voorraad, anders zou het onterecht vaststaan.
    await admin.from("hardware").update({ status: "voorraad", bijgewerkt_op: new Date().toISOString() }).eq("id", dev.id);
    console.error("reservering insert", error);
    return fout("Reserveren mislukte, probeer het zo nog eens.", 500);
  }

  // De webshop-voorraad van deze grade op het nieuwe (lagere) aantal zetten,
  // zodat niemand het gereserveerde toestel nog online koopt.
  await herstelShopifyVoorraad(TEAM, variantGid);

  const taal = knip(lijf.taal, 5).toLowerCase().startsWith("en") ? "en" : "nl";
  try { EdgeRuntime.waitUntil(mailWinkel(rij)); } catch { /* geen waitUntil: laat lopen */ }
  try { EdgeRuntime.waitUntil(mailKlant(rij, taal)); } catch { /* laat lopen */ }
  return ok({ id: ins?.id });
}

/* ── één open reservering ophalen (voor de ingelogde acties) ── */
async function reserveringVan(id: string, teamId: string) {
  const { data } = await admin.from("webshop_reserveringen")
    .select("*").eq("id", id).eq("team_id", teamId).maybeSingle();
  return data as any;
}

/* ── afrekenen (ingelogd): het toestel is betaald aan de kassa ── */
async function afrekenen(lijf: Record<string, unknown>, acc: any) {
  const r = await reserveringVan(knip(lijf.id, 60), acc.team_id);
  if (!r) return fout("Reservering niet gevonden", 404);
  if (r.status !== "open") return fout("Deze reservering is al afgehandeld.", 409);
  const betaal = knip(lijf.betaal, 20) || "cash";
  if (r.hardware_id) {
    // Marker weghalen zodat een latere sync het exemplaar niet meer meepakt, en verkocht zetten.
    const { data: h } = await admin.from("hardware").select("kanalen").eq("id", r.hardware_id).maybeSingle();
    const kanalen = (h?.kanalen && typeof h.kanalen === "object") ? { ...h.kanalen } : {};
    delete (kanalen as any).shopify;
    await admin.from("hardware").update({
      status: "verkocht", verkocht_op: new Date().toISOString(),
      verkocht_via: "winkel", verkocht_betaal: betaal, kanalen,
      bijgewerkt_op: new Date().toISOString(),
    }).eq("id", r.hardware_id);
  }
  await admin.from("webshop_reserveringen").update({
    status: "afgerekend", afgehandeld_op: new Date().toISOString(),
    bijgewerkt_op: new Date().toISOString(),
    ruwe_json: { ...(r.ruwe_json || {}), betaal },
  }).eq("id", r.id);
  return ok();
}

/* ── annuleren (ingelogd): het toestel weer vrijgeven ── */
async function annuleren(lijf: Record<string, unknown>, acc: any) {
  const r = await reserveringVan(knip(lijf.id, 60), acc.team_id);
  if (!r) return fout("Reservering niet gevonden", 404);
  if (r.status !== "open") return fout("Deze reservering is al afgehandeld.", 409);
  if (r.hardware_id) {
    // Alleen terugzetten als het exemplaar echt nog gereserveerd is (niet intussen verkocht).
    await admin.from("hardware").update({ status: "voorraad", bijgewerkt_op: new Date().toISOString() })
      .eq("id", r.hardware_id).eq("status", "gereserveerd");
  }
  await admin.from("webshop_reserveringen").update({
    status: "geannuleerd", afgehandeld_op: new Date().toISOString(),
    bijgewerkt_op: new Date().toISOString(),
  }).eq("id", r.id);
  if (r.variant_id) await herstelShopifyVoorraad(acc.team_id, r.variant_id);
  return ok();
}

/* ── verval (ingelogd): alle open reserveringen over de vervaltijd vrijgeven ──
   De winkelapp roept dit aan bij het openen van de lijst, zodat verlopen
   reserveringen het toestel vanzelf teruggeven aan de webshop. */
async function verval(acc: any) {
  const nu = new Date().toISOString();
  const { data: verlopen } = await admin.from("webshop_reserveringen")
    .select("*").eq("team_id", acc.team_id).eq("status", "open").lt("vervalt_op", nu);
  const lijst = (verlopen || []) as any[];
  const varianten = new Set<string>();
  for (const r of lijst) {
    if (r.hardware_id) {
      await admin.from("hardware").update({ status: "voorraad", bijgewerkt_op: new Date().toISOString() })
        .eq("id", r.hardware_id).eq("status", "gereserveerd");
    }
    await admin.from("webshop_reserveringen").update({
      status: "vervallen", afgehandeld_op: nu, bijgewerkt_op: nu,
    }).eq("id", r.id);
    if (r.variant_id) varianten.add(r.variant_id);
  }
  // Absoluut zetten op het echte aantal, dus één keer per variant is genoeg.
  for (const v of varianten) await herstelShopifyVoorraad(acc.team_id, v);
  return ok({ vervallen: lijst.length });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  let lijf: Record<string, unknown>;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const actie = String(lijf?.actie || "reserveer");

  // Publieke actie vanuit de webshop.
  if (actie === "reserveer") {
    const secret = Deno.env.get("RESERVERING_SECRET");
    if (secret && req.headers.get("x-reservering-secret") !== secret) return fout("Ongeldig", 401);
    return await reserveer(lijf, req);
  }

  // Ingelogde acties vanuit de winkelapp.
  const acc = await wieBelt(req);
  if (!acc) return fout("Niet ingelogd", 401);
  if (actie === "afrekenen") return await afrekenen(lijf, acc);
  if (actie === "annuleren") return await annuleren(lijf, acc);
  if (actie === "verval") return await verval(acc);
  return fout("Onbekende actie");
});
