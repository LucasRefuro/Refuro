// Een mail naar de webshopklant als zijn toestel er niet meer is: sorry, en een paar toestellen
// die erop lijken (24 november 2026, wens eigenaar). De winkelier kiest de toestellen in Storvo,
// bij Bestellingen, onder de knop "Niet meer op voorraad".
//
// De browser stuurt alleen welke bestelling, welke toestellen, het adres en een korte tekst. Wat
// er in de mail staat (naam, specs, prijs, foto, link) halen we hier zelf uit de database, en de
// html bouwt mail.ts. Zo kan niemand met een Storvo-login willekeurige html uit naam van Refuro
// versturen, en klopt de prijs met de webshop.
//
// voorbeeld:true geeft de mail terug zonder hem te versturen; Storvo laat hem zo eerst zien.
//
// Geheimen: RESEND_API_KEY, RESEND_KLANT_FROM (afzender, standaard "Refuro <welkom@storvo.app>"),
// INRUIL_NAAR of RESERVERING_NAAR (waar een antwoord van de klant heen gaat, standaard
// info@refuro.nl), APP_URL (voor het logo, standaard https://storvo.app).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { voorstelMail, type VoorstelToestel } from "./mail.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}
function goed(data: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...data }), { headers: cors });
}
// Gelijk aan wieBelt in _gedeeld/shopify.ts; hier los zodat de deploy uit twee kleine bestanden bestaat.
async function wieBelt(req: Request) {
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return null;
  const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } });
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return null;
  const { data: acc } = await admin.from("accounts").select("id, team_id, rol").eq("id", wie.user.id).maybeSingle();
  return acc || null;
}

const MAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const acc = await wieBelt(req);
  if (!acc?.team_id) return fout("Niet ingelogd", 401);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const bestellingId = String(lijf?.bestelling || "");
  const ids: string[] = Array.isArray(lijf?.toestellen) ? [...new Set(lijf.toestellen.map((x: unknown) => String(x)))] as string[] : [];
  const naar = String(lijf?.naar || "").trim();
  const naam = String(lijf?.naam || "").trim().slice(0, 60);
  const tekst = String(lijf?.tekst || "").trim();
  const voorbeeld = !!lijf?.voorbeeld;

  if (!bestellingId) return fout("Geen bestelling meegegeven");
  if (!ids.length) return fout("Kies minstens één toestel");
  if (ids.length > 4) return fout("Kies hooguit vier toestellen");
  if (tekst.length > 1500) return fout("De tekst is te lang");
  if (!voorbeeld && !MAIL.test(naar)) return fout("Dit mailadres klopt niet");

  const { data: best } = await admin.from("webshop_bestellingen")
    .select("id, nummer, regels, voorstellen").eq("id", bestellingId).eq("team_id", acc.team_id).maybeSingle();
  if (!best) return fout("Deze bestelling ken ik niet", 404);

  const { data: rijen } = await admin.from("hardware")
    .select("id, code, merk, model, categorie, staat, accu, specs, verkoop, kanalen, fotos, status")
    .eq("team_id", acc.team_id).in("id", ids);
  const perId = new Map((rijen || []).map((h: any) => [h.id, h]));
  const gekozen = ids.map((id) => perId.get(id)).filter(Boolean) as any[];
  if (gekozen.length !== ids.length) return fout("Een van de toestellen ken ik niet", 404);
  const weg = gekozen.find((h) => h.status !== "voorraad");
  if (weg) return fout(`${weg.code || "Een toestel"} is net verkocht. Kies een ander.`, 409);

  /* De prijs zoals de webshop hem toont: per advertentie en staat (webshop_grade_prijzen). Staat
     het toestel niet online, dan de vraagprijs uit Storvo. */
  const sleutels = [...new Set(gekozen.map((h) => h?.kanalen?.shopify?.sleutel).filter(Boolean))];
  const prijzen = new Map<string, any>();
  if (sleutels.length) {
    const { data: gp } = await admin.from("webshop_grade_prijzen")
      .select("sleutel, prijs_a, prijs_b, prijs_c").eq("team_id", acc.team_id).in("sleutel", sleutels);
    for (const r of gp || []) prijzen.set(r.sleutel, r);
  }
  const toestellen: VoorstelToestel[] = gekozen.map((h) => {
    const s = h?.kanalen?.shopify || {};
    const grade = String(s.grade || h.staat || "").toUpperCase();
    const gp = s.sleutel ? prijzen.get(s.sleutel) : null;
    const shopPrijs = gp ? Number(gp["prijs_" + grade.toLowerCase()]) : NaN;
    /* Met ?variant= opent de productpagina meteen op de goede staat. */
    const variant = String(s.variant || "").split("/").pop() || "";
    const url = s.url ? String(s.url) + (/^\d+$/.test(variant) ? (String(s.url).includes("?") ? "&" : "?") + "variant=" + variant : "") : null;
    return {
      code: h.code, merk: h.merk, model: h.model, categorie: h.categorie, staat: h.staat, accu: h.accu,
      specs: h.specs, prijs: isFinite(shopPrijs) && shopPrijs > 0 ? shopPrijs : Number(h.verkoop) || null,
      url, foto: Array.isArray(h.fotos) && h.fotos[0] ? String(h.fotos[0]) : null,
    };
  });

  const regels: any[] = Array.isArray(best.regels) ? best.regels : [];
  const besteld = String((regels.find((r) => r && !r.accu && !r.extra) || {}).titel || "");
  const logo = (Deno.env.get("APP_URL") || "https://storvo.app").replace(/\/+$/, "") + "/emails/refuro-logo.png";
  const mail = voorstelMail({ nummer: best.nummer || "", naam, tekst, besteld, toestellen, logo });

  if (voorbeeld) return goed({ onderwerp: mail.onderwerp, html: mail.html });

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return fout("Mail versturen staat nog niet aan (RESEND_API_KEY ontbreekt)", 500);
  const van = Deno.env.get("RESEND_KLANT_FROM") || "Refuro <welkom@storvo.app>";
  const antwoord = Deno.env.get("INRUIL_NAAR") || Deno.env.get("RESERVERING_NAAR") || "info@refuro.nl";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: van, to: [naar], reply_to: antwoord, subject: mail.onderwerp, html: mail.html, text: mail.tekst }),
  });
  if (!r.ok) {
    console.error("bestelling-voorstel: mail niet verstuurd", r.status, await r.text());
    return fout("De mail ging niet weg. Probeer het zo nog eens.", 502);
  }

  /* Bijhouden dat het voorstel weg is, zodat je bij de bestelling ziet wanneer en naar wie. */
  const lijst: any[] = Array.isArray(best.voorstellen) ? best.voorstellen : [];
  lijst.push({ op: new Date().toISOString(), naar, codes: gekozen.map((h) => h.code || null), door: acc.id });
  const { error } = await admin.from("webshop_bestellingen")
    .update({ voorstellen: lijst, bijgewerkt_op: new Date().toISOString() }).eq("id", best.id);
  if (error) console.error("bestelling-voorstel: bijhouden mislukt", error);

  return goed({ verstuurd: true });
});
