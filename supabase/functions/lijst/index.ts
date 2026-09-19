// Lijsten voor handelaren: hele voorraad, per merk, per batch en per bundel.
//
// GET /functions/v1/lijst?w=<winkel-slug>&k=<sleutel>&soort=<soort>[&merk=..][&id=..][&f=..]
//   (in plaats van w mag ook t=<team-id>, zoals Storvo zelf doet)
//   soort: index | voorraad | merk | batch | bundel (bundel met id=<uuid> of code=<V0001>)
//   f:     xlsx (standaard) | csv | json (voor de webshop) | html (stuurt door naar de
//          printbare pagina /klantportaal/lijst/, ook als PDF op te slaan)
//
// Openbaar (verify_jwt uit), maar alleen met de sleutel van de winkel. Die sleutel staat
// in portaalbeheer (Instellingen, Lijsten) en in het Shopify-thema, dat hem alleen aan
// goedgekeurde handelaren laat zien. De inkoopprijs, leverancier en winst staan er nooit
// in: dit is de lijst die je aan een koper geeft.
//
// Alleen lezen uit refurbish_apparaten, refurbish_batches, refurbish_voorraad_batches en
// hardware. Deze functie schrijft niets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (lijf: unknown, code = 200) =>
  new Response(JSON.stringify(lijf), { status: code, headers: { ...cors, "Content-Type": "application/json" } });
const fout = (bericht: string, code = 400) => json({ ok: false, error: bericht }, code);
const schoon = (s: unknown, max = 120) => String(s ?? "").trim().slice(0, max);

function gelijk(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}

const STATUS: Record<string, string> = {
  klaar: "Beschikbaar", overgedragen: "Beschikbaar", te_controleren: "Wordt getest",
  te_repareren: "In reparatie", verkocht: "Verkocht",
};
const SPEC = [
  ["Processor", ["processor", "cpu"]],
  ["Geheugen", ["geheugen", "ram"]],
  ["Opslag", ["opslag", "ssd", "hdd"]],
  ["Scherm", ["scherm", "beeldscherm"]],
  ["Videokaart", ["videokaart", "gpu"]],
  ["Windows", ["windows", "besturingssysteem"]],
] as const;
const EXTRA = ["touchscreen", "face id", "gsm-module", "vingerafdruk", "toetsenbordverlichting", "webcam", "kleur", "toetsenbord"];

function specVan(specs: Record<string, unknown>, namen: readonly string[]) {
  for (const [k, v] of Object.entries(specs || {})) if (namen.includes(k.toLowerCase())) return String(v ?? "");
  return "";
}
function extraVan(specs: Record<string, unknown>) {
  const uit: string[] = [];
  for (const [k, v] of Object.entries(specs || {})) {
    const l = k.toLowerCase();
    if (!EXTRA.includes(l)) continue;
    const w = String(v ?? "").trim();
    if (!w || /^(nee|no|false)$/i.test(w)) continue;
    uit.push(/^(ja|yes|true)$/i.test(w) ? k : `${k}: ${w}`);
  }
  return uit.join(", ");
}
const aandacht = (d: unknown) => Array.isArray(d)
  ? d.map((x) => String(x || "").replace(/\?\s*$/, "").trim()).filter(Boolean).join("; ") : "";
const geld = (n: number | null) => n == null ? null : Math.round(n * 100) / 100;

type Rij = Record<string, string | number | null>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  let p: Record<string, string> = Object.fromEntries(url.searchParams);
  if (req.method === "POST") { try { p = { ...p, ...(await req.json()) }; } catch { /* alleen de url */ } }

  // De winkel: w = slug (webshop), of t = team-id (vanuit Storvo zelf).
  const slug = schoon(p.w, 80), teamId = schoon(p.t, 40), sleutel = schoon(p.k, 80);
  const soort = schoon(p.soort || "voorraad", 20);
  const formaat = ["xlsx", "csv", "html", "json"].includes(p.f) ? p.f : (soort === "index" ? "json" : "xlsx");
  if ((!slug && !teamId) || !sleutel) return fout("Winkel en sleutel ontbreken", 401);

  const { data: winkel } = slug
    ? await admin.from("klanten").select("id").eq("slug", slug).maybeSingle()
    : /^[0-9a-f-]{36}$/i.test(teamId) ? { data: { id: teamId } } : { data: null };
  if (!winkel) return fout("Onbekende winkel of sleutel", 403);
  const { data: ins } = await admin.from("klantportaal_instellingen")
    .select("team_id, merknaam, logo_url, kleur, actief, lijst_sleutel, lijst_prijzen, contact_email, contact_telefoon")
    .eq("team_id", winkel.id).maybeSingle();
  if (!ins || !ins.actief || !gelijk(String(ins.lijst_sleutel || ""), sleutel)) return fout("Onbekende winkel of sleutel", 403);
  const team = ins.team_id as string;

  // Alle toestellen en bijbehorende verkoopgegevens.
  const { data: app } = await admin.from("refurbish_apparaten")
    .select("id, code, merk, model, categorie, serienummer, specs, grade, accu, nieuwe_accu, defecten, status, hardware_id, batch_id, voorraad_batch_id, aangemaakt_op")
    .eq("team_id", team).limit(20000);
  const apparaten = app || [];
  const hwIds = apparaten.map((a) => a.hardware_id).filter(Boolean) as string[];
  const hw = new Map<string, { status: string; verkoop: number | null }>();
  for (let i = 0; i < hwIds.length; i += 400) {
    const { data } = await admin.from("hardware").select("id, status, verkoop").in("id", hwIds.slice(i, i + 400));
    (data || []).forEach((h) => hw.set(h.id, { status: h.status, verkoop: h.verkoop != null ? Number(h.verkoop) : null }));
  }
  const { data: bun } = await admin.from("refurbish_voorraad_batches")
    .select("id, code, nummer, titel, vraagprijs, status, shopify").eq("team_id", team);
  const bundels = bun || [];

  const verkocht = (a: any) => a.status === "verkocht" || (a.hardware_id && hw.get(a.hardware_id)?.status === "verkocht");
  const opVoorraad = (a: any) => ["klaar", "overgedragen"].includes(a.status) && !(a.status === "overgedragen" && !a.hardware_id) && !verkocht(a);
  const merkVan = (a: any) => String(a.merk || "Onbekend").trim();

  // ── index: wat er te downloaden valt (voor de pagina Voorraadlijsten in de webshop)
  if (soort === "index") {
    const vr = apparaten.filter(opVoorraad);
    const perMerk = new Map<string, number>();
    vr.forEach((a) => perMerk.set(merkVan(a), (perMerk.get(merkVan(a)) || 0) + 1));
    const online = bundels.filter((b) => b.status === "online").map((b) => {
      const leden = apparaten.filter((a) => a.voorraad_batch_id === b.id && !verkocht(a));
      return { id: b.id, code: b.code || b.nummer, titel: b.titel || null, aantal: leden.length,
        vraagprijs: b.vraagprijs != null ? Number(b.vraagprijs) : null, url: b.shopify?.url || null };
    }).filter((b) => b.aantal > 0);
    return json({ ok: true, merknaam: ins.merknaam, bijgewerkt: new Date().toISOString(),
      voorraad: { aantal: vr.length },
      merken: [...perMerk.entries()].sort((a, b) => b[1] - a[1]).map(([merk, aantal]) => ({ merk, aantal })),
      bundels: online });
  }

  // ── welke toestellen, en hoe de lijst heet
  let lijst: any[] = [], titel = "", sub = "", bestand = "", metStatus = false, prijsPerStuk: number | null = null, bundelKol = true;
  const vandaag = new Date().toISOString().slice(0, 10);
  const merknaam = ins.merknaam || "Voorraad";
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (soort === "voorraad") {
    lijst = apparaten.filter(opVoorraad);
    titel = `Voorraadlijst ${merknaam}`; sub = "Alle beschikbare apparaten";
    bestand = `${slugify(merknaam)}-voorraad-${vandaag}`;
  } else if (soort === "merk") {
    const merk = schoon(p.merk, 60);
    if (!merk) return fout("Kies een merk");
    lijst = apparaten.filter((a) => opVoorraad(a) && merkVan(a).toLowerCase() === merk.toLowerCase());
    titel = `Voorraad ${merk}`; sub = `Alle beschikbare ${merk}-apparaten`;
    bestand = `${slugify(merknaam)}-${slugify(merk)}-${vandaag}`;
  } else if (soort === "batch") {
    const { data: b } = await admin.from("refurbish_batches").select("id, code, nummer, aangemaakt_op")
      .eq("team_id", team).eq("id", schoon(p.id, 40)).maybeSingle();
    if (!b) return fout("Deze batch bestaat niet", 404);
    lijst = apparaten.filter((a) => a.batch_id === b.id);
    metStatus = true;
    titel = `Batch ${b.code || b.nummer || ""}`.trim(); sub = "Alle apparaten uit deze partij, met hun status";
    bestand = `${slugify(merknaam)}-batch-${slugify(String(b.code || b.nummer || "partij"))}`;
  } else if (soort === "bundel") {
    // Op id, of op de bundelcode (V0001): de webshop kent soms alleen de code uit de tags.
    const code = schoon(p.code, 30).toUpperCase();
    const b = bundels.find((x) => x.id === schoon(p.id, 40)) || (code ? bundels.find((x) => String(x.code || x.nummer || "").toUpperCase() === code) : undefined);
    if (!b) return fout("Deze bundel bestaat niet", 404);
    lijst = apparaten.filter((a) => a.voorraad_batch_id === b.id && !verkocht(a));
    bundelKol = false;
    const aantal = lijst.length;
    prijsPerStuk = b.vraagprijs != null && aantal ? geld(Number(b.vraagprijs) / aantal) : null;
    titel = `Bundel ${b.code || b.nummer || ""}${b.titel ? " · " + b.titel : ""}`;
    sub = b.vraagprijs != null ? `${aantal} apparaten · totaalprijs € ${Number(b.vraagprijs).toLocaleString("nl-NL")}` : `${aantal} apparaten`;
    bestand = `${slugify(merknaam)}-bundel-${slugify(String(b.code || b.nummer || "lot"))}`;
  } else {
    return fout("Onbekende lijst");
  }

  lijst.sort((a, b) => merkVan(a).localeCompare(merkVan(b)) || String(a.model || "").localeCompare(String(b.model || "")) || String(a.code || "").localeCompare(String(b.code || "")));
  const bundelCode = new Map(bundels.map((b) => [b.id, b.code || b.nummer || ""]));
  const toonPrijs = soort === "bundel" ? prijsPerStuk != null : !!ins.lijst_prijzen;

  const rijen: Rij[] = lijst.map((a) => {
    const s = (a.specs && typeof a.specs === "object") ? a.specs : {};
    const r: Rij = {
      "Nr": a.code || "", "Merk": a.merk || "", "Model": a.model || "", "Soort": a.categorie || "",
      "Serienummer": a.serienummer || "",
    };
    for (const [naam, sleutels] of SPEC) r[naam] = specVan(s, sleutels);
    r["Extra"] = extraVan(s);
    r["Grade"] = a.grade || "";
    r["Accu"] = a.nieuwe_accu ? "Nieuw" : (a.accu ? `${a.accu}%` : "");
    r["Aandachtspunten"] = aandacht(a.defecten);
    if (bundelKol) r["Bundel"] = a.voorraad_batch_id ? (bundelCode.get(a.voorraad_batch_id) || "") : "";
    if (metStatus) r["Status"] = verkocht(a) ? "Verkocht" : (STATUS[a.status] || a.status || "");
    if (toonPrijs) r["Prijs"] = soort === "bundel" ? prijsPerStuk : (a.hardware_id ? geld(hw.get(a.hardware_id)?.verkoop ?? null) : null);
    return r;
  });
  // Lege kolommen weglaten (bijv. Videokaart bij telefoons).
  const alleKol = rijen.length ? Object.keys(rijen[0]) : ["Nr", "Merk", "Model", "Soort", "Serienummer", "Grade"];
  const kolommen = alleKol.filter((k) => ["Nr", "Merk", "Model", "Serienummer", "Grade"].includes(k) || rijen.some((r) => r[k] !== "" && r[k] != null));

  // Samenvatting per grade.
  const perGrade: Record<string, number> = {};
  lijst.forEach((a) => { const g = a.grade || "?"; perGrade[g] = (perGrade[g] || 0) + 1; });
  const gradeTekst = Object.entries(perGrade).sort().map(([g, n]) => `${n}× grade ${g}`).join(", ");

  if (formaat === "json") {
    return json({ ok: true, titel, sub, aantal: rijen.length, per_grade: perGrade, kolommen, bestand,
      winkel: { merknaam: ins.merknaam, logo_url: ins.logo_url, kleur: ins.kleur, email: ins.contact_email, telefoon: ins.contact_telefoon },
      rijen: rijen.map((r) => Object.fromEntries(kolommen.map((k) => [k, r[k]]))), prijs_per_stuk: prijsPerStuk });
  }

  if (formaat === "csv") {
    const cel = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const regels = [kolommen.map(cel).join(";"), ...rijen.map((r) => kolommen.map((k) => {
      const v = r[k]; return cel(typeof v === "number" ? v.toFixed(2).replace(".", ",") : v);
    }).join(";"))];
    return new Response("﻿" + regels.join("\r\n"), { headers: { ...cors,
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${bestand}.csv"` } });
  }

  if (formaat === "xlsx") {
    const blad = XLSX.utils.json_to_sheet(rijen.map((r) => Object.fromEntries(kolommen.map((k) => [k, r[k] ?? ""]))), { header: kolommen });
    blad["!cols"] = kolommen.map((k) => ({ wch: Math.min(40, Math.max(k.length + 2, ...rijen.map((r) => String(r[k] ?? "").length + 1))) }));
    if (rijen.length) blad["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rijen.length, c: kolommen.length - 1 } }) };
    const info = XLSX.utils.aoa_to_sheet([
      [titel], [sub], [`Aantal: ${rijen.length}${gradeTekst ? " (" + gradeTekst + ")" : ""}`],
      [`Gemaakt op: ${new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}`], [],
      ["Alle apparaten zijn gewist volgens NIST 800-88 en getest. Grade A: als nieuw. B: nette gebruikssporen. C: zichtbare sporen, werkt goed."],
      ["Beschikbaarheid en prijzen onder voorbehoud. Het aanbod wisselt snel."],
      [[ins.merknaam, ins.contact_email, ins.contact_telefoon].filter(Boolean).join(" · ")],
    ]);
    info["!cols"] = [{ wch: 110 }];
    const boek = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(boek, blad, "Apparaten");
    XLSX.utils.book_append_sheet(boek, info, "Info");
    const bytes = XLSX.write(boek, { type: "array", bookType: "xlsx" });
    return new Response(bytes, { headers: { ...cors,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${bestand}.xlsx"` } });
  }

  // html: Supabase serveert geen html-pagina's, dus de printbare lijst staat op de
  // Storvo-site (klantportaal/lijst/) en haalt daar de json op. We sturen door.
  const appUrl = (Deno.env.get("APP_URL") || "https://storvo.app").replace(/\/$/, "");
  const q = new URLSearchParams(slug ? { w: slug, k: sleutel, soort } : { t: teamId, k: sleutel, soort });
  if (p.merk) q.set("merk", schoon(p.merk, 60));
  if (p.id) q.set("id", schoon(p.id, 40));
  if (p.code) q.set("code", schoon(p.code, 30));
  return new Response(null, { status: 302, headers: { ...cors, Location: `${appUrl}/klantportaal/lijst/?${q}` } });
});
