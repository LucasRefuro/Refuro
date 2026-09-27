// Zoekt officiële productfoto's bij een merk en model.
//
// Bron: Icecat. Dat is een catalogus waar fabrikanten zelf hun productfoto's en
// specificaties in zetten, en die je met een gratis account mag gebruiken. Dat
// is iets heel anders dan willekeurige plaatjes van internet plukken: deze
// foto's zijn er juist voor bedoeld en je mag ze gebruiken.
//
// Wat je krijgt zijn foto's van het model, niet van dit exemplaar. Precies goed
// voor een webshop; voor Marktplaats wil een koper ook echte foto's zien van
// het apparaat dat hij koopt.
//
// Drie acties:
//   overnemen   - één foto (gevonden link, geplakte foto of upload) opslaan.
//   automatisch - zelf bij Icecat zoeken EN de beste foto's meteen als
//                 modelfoto's opslaan. Dit draait vanzelf bij "online zetten"
//                 zodra een model nog geen foto's heeft.
//   (geen actie)- alleen zoeken en de gevonden foto's teruggeven.

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

function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}

// Icecat noemt zijn aanzichten anders dan wij. Dit is de vertaling, zodat de
// foto's in dezelfde volgorde staan als bij een set die je zelf maakt.
const AANZICHTEN = ["dicht", "open", "toetsenbord", "links", "rechts", "onderkant"];
function aanzichtVan(nr: number) {
  return AANZICHTEN[nr] || "overig";
}

// De volgorde waarin we automatisch gevonden foto's als modelfoto's neerzetten:
// 'open' eerst, want dat wordt de hoofdfoto (daar ziet een koper het scherm), de
// rest vult de overige aanzichten. Zo wordt de sterkste Icecat-foto de hoofdfoto.
const OPSLAG_VOLGORDE = ["open", "dicht", "toetsenbord", "links", "rechts", "onderkant"];

// Een fabrieksfoto opslaan. Bron kan zijn: een gevonden Icecat-foto, een geplakte
// fabrikantslink, of een upload (base64). De browser mag niet rechtstreeks bij een
// externe CDN (CORS blokkeert dat), dus doet de server het.
//
// Met heelModel=true hoort de foto bij het hele model (apparaat_id leeg): je vult
// hem één keer en elk volgend toestel van dat model krijgt hem vanzelf, omdat
// fotosLaden de modelfoto's meeleest. Gooit een Error bij een probleem, zodat de
// automatische lus één mislukte foto kan overslaan zonder de rest te breken.
async function bewaarFoto(teamId: string, o: any): Promise<string> {
  const heelModel = !!o?.heelModel;
  const apparaatId = String(o?.apparaat_id || "");
  const model = String(o?.model || "").trim();
  const merk = String(o?.merk || "").trim();
  const aanzicht = String(o?.aanzicht || "open");
  if (!heelModel && !apparaatId) throw new Error("Geen toestel meegegeven");
  if (heelModel && !model) throw new Error("Geen model meegegeven");

  let bytes: Uint8Array;
  let type = "image/jpeg";
  const data = String(o?.data || "");
  if (data.startsWith("data:")) {
    // Een upload komt als base64 binnen: geen externe fetch nodig.
    const komma = data.indexOf(",");
    type = data.slice(5, data.indexOf(";")) || "image/jpeg";
    try { bytes = Uint8Array.from(atob(data.slice(komma + 1)), (c) => c.charCodeAt(0)); }
    catch { throw new Error("De afbeelding kon niet gelezen worden"); }
  } else {
    // Een link (Icecat of de fabrikant). Nooit een intern adres ophalen (SSRF).
    let u: URL;
    try { u = new URL(String(o?.url || "")); } catch { throw new Error("Ongeldige foto-URL"); }
    if (u.protocol !== "https:") throw new Error("Alleen https-adressen");
    const host = u.hostname.toLowerCase();
    // Alleen echte hostnamen met een letter erin: zo vallen IP-adressen ook in
    // decimale of hex-vorm (2130706433, 0x7f000001) en IPv6 af, plus de interne ranges
    // en localhost. https-only weert bovendien de meeste interne diensten (die http zijn).
    if (!/[a-z]/.test(host) || host.includes(":") ||
        host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") ||
        /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      throw new Error("Dit adres kan niet worden opgehaald");
    }
    // Geen redirects volgen: een publieke URL kan anders alsnog naar een intern adres
    // doorsturen (SSRF). Een 3xx komt terug met res.ok=false en wordt zo geweigerd.
    const res = await fetch(u.href, { redirect: "manual" });
    if (!res.ok) throw new Error("De foto kon niet opgehaald worden");
    type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) throw new Error("Dat adres is geen afbeelding");
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  if (bytes.length > 12_000_000) throw new Error("De afbeelding is te groot");

  const sleutel = (heelModel ? `model_${merk}-${model}` : apparaatId).replace(/[^\w.-]+/g, "_");
  // Willekeurig staartje erbij: de automatische lus slaat meerdere foto's in dezelfde
  // milliseconde op, dus Date.now() alleen zou botsen en foto's overschrijven.
  const pad = `${teamId}/${sleutel}/${aanzicht}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error: opslagFout } = await admin.storage.from("refurbish-fotos")
    .upload(pad, bytes, { contentType: type });
  if (opslagFout) throw new Error("De foto opslaan mislukte: " + opslagFout.message);

  const { error: rijFout } = await admin.from("refurbish_fotos").insert({
    team_id: teamId, apparaat_id: heelModel ? null : apparaatId,
    merk: merk || null, model: model || null,
    aanzicht, pad, volgorde: AANZICHTEN.indexOf(aanzicht),
  });
  if (rijFout) throw new Error("De foto in de lijst zetten mislukte: " + rijFout.message);

  return pad;
}

async function overnemen(lijf: any, teamId: string) {
  try {
    const pad = await bewaarFoto(teamId, lijf);
    return new Response(JSON.stringify({ ok: true, pad }), { headers: cors });
  } catch (e) {
    return fout((e as Error)?.message || "Opslaan mislukte", 502);
  }
}

// Bij Icecat zoeken en de gevonden foto's teruggeven. Icecat matcht op de GTIN of de
// artikelcode van de fabrikant, niet op de modelnaam. Hebben we een EAN (vaak bij
// accessoires, zelden bij een gebruikte laptop), dan is dat veruit de beste kans, dus
// die eerst. Daarna de fabrikant-artikelcode (Icecats ProductCode IS het MPN-veld; een
// HP-productnummer werkt, een Dell-marketingnaam niet). Als laatste een paar
// schrijfwijzen van de modelnaam. Dat dekt het grootste deel.
async function zoekIcecat(
  gebruiker: string,
  p: { merk: string; model: string; ean?: string; productcode?: string },
) {
  const merk = String(p.merk || "").trim();
  const model = String(p.model || "").trim();
  const ean = String(p.ean || "").replace(/\D/g, "");
  const productcode = String(p.productcode || "").trim();

  const pogingen: { soort: "gtin" | "code"; waarde: string }[] = [];
  if (ean) pogingen.push({ soort: "gtin", waarde: ean });
  if (productcode) {
    pogingen.push({ soort: "code", waarde: productcode });
    if (productcode.toUpperCase() !== productcode) pogingen.push({ soort: "code", waarde: productcode.toUpperCase() });
  }
  for (const c of [model, model.replace(/\s+/g, ""), model.replace(/\s+/g, "-"), model.toUpperCase()]) {
    if (c) pogingen.push({ soort: "code", waarde: c });
  }

  for (const pg of pogingen) {
    const sleutel = pg.soort === "gtin"
      ? `&GTIN=${encodeURIComponent(pg.waarde)}`
      : `&Brand=${encodeURIComponent(merk)}&ProductCode=${encodeURIComponent(pg.waarde)}`;
    const adres = `https://live.icecat.biz/api?UserName=${encodeURIComponent(gebruiker)}` +
      `&Language=nl${sleutel}&Content=Gallery,GeneralInfo`;
    try {
      const res = await fetch(adres, { headers: { "Accept": "application/json" } });
      if (!res.ok) continue;
      const uit = await res.json();
      const galerij = uit?.data?.Gallery;
      if (!Array.isArray(galerij) || !galerij.length) continue;

      // Icecat geeft de hoofdfoto met IsMain=Y en een prioriteit No (lager = eerder);
      // de array-volgorde zelf is niet gegarandeerd. Daarop sorteren zodat de hoofdfoto
      // vooraan staat. HighPic bestaat niet in deze Gallery; Pic500x500 wel.
      const gesorteerd = [...galerij].sort((a: any, b: any) => {
        const am = (a?.IsMain === "Y" || a?.IsMain === true) ? 0 : 1;
        const bm = (b?.IsMain === "Y" || b?.IsMain === true) ? 0 : 1;
        if (am !== bm) return am - bm;
        return (Number(a?.No) || 99) - (Number(b?.No) || 99);
      });
      const fotos = gesorteerd
        .map((g: any, i: number) => ({
          url: g?.Pic || g?.Pic500x500 || g?.LowPic || null,
          klein: g?.ThumbPic || g?.LowPic || g?.Pic || null,
          aanzicht: aanzichtVan(i),
        }))
        .filter((f: any) => f.url)
        .slice(0, 8);

      if (!fotos.length) continue;
      return { fotos, titel: uit?.data?.GeneralInfo?.Title || null, gevonden: pg.waarde };
    } catch (e) {
      console.error("icecat", pg.waarde, e);
    }
  }
  return { fotos: [] as any[], titel: null as string | null, gevonden: null as string | null };
}

// Automatisch: zoek bij Icecat en sla de beste foto's meteen als modelfoto's op.
// Draait vanzelf bij "online zetten" als een model nog geen foto's heeft. Slaat
// aanzichten die dit model al heeft over, zodat opnieuw draaien niets dubbel doet.
// Degradeert stil (opgeslagen:0 + reden) als er geen Icecat-account is of niets
// gevonden wordt; de winkelier valt dan terug op een telefoonfoto.
async function automatisch(lijf: any, teamId: string) {
  const merk = String(lijf?.merk || "").trim();
  const model = String(lijf?.model || "").trim();
  if (!merk || !model) {
    return new Response(JSON.stringify({ ok: true, opgeslagen: 0, reden: "geen-model" }), { headers: cors });
  }

  const gebruiker = Deno.env.get("ICECAT_GEBRUIKER");
  if (!gebruiker) {
    return new Response(JSON.stringify({ ok: true, opgeslagen: 0, reden: "geen-account" }), { headers: cors });
  }

  // Welke aanzichten heeft dit model al als fabrieksfoto? Die niet nog eens opslaan.
  const { data: best } = await admin.from("refurbish_fotos")
    .select("aanzicht").eq("team_id", teamId).is("apparaat_id", null).ilike("model", model);
  const bezet = new Set((best || []).map((r: any) => r.aanzicht));

  const gevonden = await zoekIcecat(gebruiker, {
    merk, model,
    ean: String(lijf?.ean || lijf?.gtin || ""),
    productcode: String(lijf?.productcode || ""),
  });
  if (!gevonden.fotos.length) {
    return new Response(JSON.stringify({ ok: true, opgeslagen: 0, reden: "niet-gevonden" }), { headers: cors });
  }

  // De vrije aanzicht-slots in de vaste volgorde (open eerst = hoofdfoto).
  const vrij = OPSLAG_VOLGORDE.filter((a) => !bezet.has(a));
  let opgeslagen = 0;
  for (const f of gevonden.fotos) {
    if (opgeslagen >= vrij.length) break;
    const aanzicht = vrij[opgeslagen];
    try {
      await bewaarFoto(teamId, { heelModel: true, merk, model, aanzicht, url: f.url });
      opgeslagen++;
    } catch (e) {
      console.error("automatisch bewaren", (e as Error)?.message);
    }
  }
  return new Response(JSON.stringify({ ok: true, opgeslagen, bron: "icecat", titel: gevonden.titel }), { headers: cors });
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

  // Een foto overnemen (Icecat, upload of link) loopt server-side. Werkt ook
  // zonder Icecat-account.
  if (lijf?.actie === "overnemen") return await overnemen(lijf, acc.team_id);

  // Automatisch zoeken én opslaan. Zonder Icecat-account degradeert dit stil.
  if (lijf?.actie === "automatisch") return await automatisch(lijf, acc.team_id);

  // Vanaf hier is het alleen zóeken (foto's teruggeven, niet opslaan); daar is het
  // Icecat-account voor nodig.
  const gebruiker = Deno.env.get("ICECAT_GEBRUIKER");
  if (!gebruiker) {
    return fout("De fotocatalogus is nog niet gekoppeld. Maak een gratis account op icecat.biz en zet de gebruikersnaam in Supabase.", 503);
  }

  const merk = String(lijf?.merk || "").trim();
  const model = String(lijf?.model || "").trim();
  if (!merk || !model) return fout("Vul merk en model in");

  const gevonden = await zoekIcecat(gebruiker, {
    merk, model,
    ean: String(lijf?.ean || lijf?.gtin || ""),
    productcode: String(lijf?.productcode || ""),
  });
  if (!gevonden.fotos.length) {
    return new Response(JSON.stringify({
      ok: true, bron: "icecat", fotos: [],
      melding: "Dit model staat niet in de catalogus. Maak zelf foto's, of probeer het model anders te schrijven.",
    }), { headers: cors });
  }
  return new Response(JSON.stringify({
    ok: true, bron: "icecat", gevonden: gevonden.gevonden,
    titel: gevonden.titel, fotos: gevonden.fotos,
  }), { headers: cors });
});
