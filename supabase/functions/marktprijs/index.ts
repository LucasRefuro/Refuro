// Schat de tweedehands marktprijs van een toestel op basis van Marktplaats-advertenties
// van PARTICULIEREN (winkels/handelaren filteren we eruit) en stelt een scherpe vraagprijs
// voor: net onder de mediaan van wat particulieren vragen. Geeft ook de bron-advertenties
// terug, zodat de winkelier ziet waaróp de prijs gebaseerd is.
//
// We praten met de openbare zoek-API van Marktplaats (lrp/api/search) met een gewone
// browser-user-agent. Geen sleutels nodig. verify_jwt: true — elke ingelogde gebruiker mag dit.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Signalen dat een verkoper een winkel/handelaar is (die willen we NIET meenemen).
const BIZ_TRAITS = new Set(["VERIFIED_SELLER", "CUSTOMER_SUPPORT_BUSINESS_LINE", "SHOPPING_CART",
  "ADMARKT_CONSOLE", "SELLER_PROFILE_URL", "UNIQUE_SELLING_POINTS", "MICROTIP", "PROFILE",
  "DAG_TOPPER_7DAYS", "URL"]);
const NAAM_BIZ = /\.nl|\.com|\bbv\b|computers?|laptops?|refurb|used ?products|micro|shop|store|handel|repair|\bit\b|electro|tech|gsm|telecom|\baccu\b|mobos|company|trading|parts|onderdelen|\bdmb\b|outlet|marktonline|\bdeal|doctor|\bfix\b/i;
// Accessoires die per ongeluk matchen op een modelnaam (accu, oplader, ...): eruit.
const ACCESSOIRE = /\baccu\b|batterij|battery|oplader|adapter|charger|\blader\b|docking|\bdock\b|toetsenbord|keyboard|\bhoes\b|\bcase\b|\bcover\b|screenprotector|beschermer|\bkabel\b|standaard|\bmuis\b|voeding|\bpen\b|sticker|skin/i;
// Modelvarianten: staat de variant niet in de zoekterm, dan hoort een advertentie mét die
// variant er niet bij (iPhone 13 is niet iPhone 13 Pro; ThinkPad X13 is niet X13 Yoga).
const VARIANTEN = ["pro max", "pro", "max plus", "max", "mini", "plus", "ultra", "yoga", "2-in-1", "2 in 1"];

function isBusiness(it: any): boolean {
  const si = it.sellerInformation || {};
  if ((it.priorityProduct || "NONE") !== "NONE") return true;   // betaalde promotie = handelaar
  if (si.showWebsiteUrl) return true;
  const tr: string[] = Array.isArray(it.traits) ? it.traits : [];
  if (tr.some((t) => BIZ_TRAITS.has(t))) return true;
  if (NAAM_BIZ.test(String(si.sellerName || ""))) return true;
  return false;
}

function tokens(q: string): string[] {
  const stop = new Set(["de", "en", "met", "voor", "laptop", "pro", "gb", "the", "inch"]);
  return q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !stop.has(t));
}

function mediaan(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  let body: any;
  try { body = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const query = String(body?.query || "").trim();
  if (query.length < 2) return fout("Geef een zoekterm mee");
  const categorie = body?.categorie ? String(body.categorie).replace(/\D/g, "") : "";

  const params = new URLSearchParams({ query, limit: "90", offset: "0" });
  if (categorie) params.set("l1CategoryId", categorie);
  const url = "https://www.marktplaats.nl/lrp/api/search?" + params.toString();

  let data: any;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!res.ok) return fout("Marktplaats gaf status " + res.status + ". Probeer het zo nog eens.", 502);
    data = await res.json();
  } catch (_e) {
    return fout("Kon Marktplaats niet bereiken. Probeer het zo nog eens.", 502);
  }

  const T = tokens(query);
  const ql = query.toLowerCase();
  const verboden = VARIANTEN.filter((v) => !ql.includes(v));
  const nodig = Math.max(1, Math.round(T.length * 0.55));

  const advertenties: any[] = [];
  const prijzen: number[] = [];
  for (const it of (data.listings || [])) {
    const pi = it.priceInfo || {};
    if (pi.priceType !== "FIXED") continue;             // alleen echte vraagprijzen (geen bieden/gereserveerd)
    const c = Number(pi.priceCents) || 0;
    if (c < 3000 || c > 500000) continue;               // 30 - 5000 euro
    const titel = String(it.title || "");
    const tl = titel.toLowerCase();
    if (ACCESSOIRE.test(tl)) continue;
    if (verboden.some((v) => tl.includes(v))) continue;
    const hit = T.filter((t) => tl.includes(t)).length;
    if (T.length && hit < nodig) continue;
    if (isBusiness(it)) continue;                        // winkels eruit
    const prijs = Math.round(c / 100);
    prijzen.push(prijs);
    advertenties.push({
      titel,
      prijs,
      verkoper: String((it.sellerInformation || {}).sellerName || "Particulier"),
      datum: String(it.date || ""),
      url: it.vipUrl ? ("https://www.marktplaats.nl" + it.vipUrl) : null,
    });
  }

  advertenties.sort((a, b) => a.prijs - b.prijs);
  prijzen.sort((a, b) => a - b);

  let voorstel: number | null = null, med = 0, gem = 0;
  if (prijzen.length >= 3) {
    // uitschieters dempen: bij >=5 de laagste en hoogste weglaten
    const kern = prijzen.length >= 5 ? prijzen.slice(1, -1) : prijzen;
    med = mediaan(kern);
    gem = Math.round(kern.reduce((s, x) => s + x, 0) / kern.length);
    voorstel = Math.round((med * 0.9) / 5) * 5;          // ~10% onder de mediaan, afgerond op 5
  }

  return new Response(JSON.stringify({
    ok: true,
    query,
    aantal: prijzen.length,
    mediaan: med || null,
    gemiddeld: gem || null,
    min: prijzen.length ? prijzen[0] : null,
    max: prijzen.length ? prijzen[prijzen.length - 1] : null,
    voorstel,
    advertenties: advertenties.slice(0, 12),
  }), { headers: cors });
});
