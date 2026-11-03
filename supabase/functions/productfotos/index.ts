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
// Telefoons: Samsung zit in de gratis Icecat, maar alleen op de volle fabriekscode.
// Die maken we zelf uit naam en kleur (zie galaxy.ts). Apple blokkeert Icecat, en
// er is geen andere bron met iPhone-foto's die een winkel mag gebruiken (GSMArena en
// apple.com niet, de persfoto's van Apple alleen voor nieuws). Voor iPhones vult de
// winkel daarom zelf één keer een set per model en kleur, het snelst met actie
// alsModel: de eigen foto's van een mooi exemplaar worden de fabrieksfoto's.
//
// Vier acties:
//   overnemen   - één foto (gevonden link, geplakte foto of upload) opslaan.
//   automatisch - zelf bij Icecat zoeken EN de beste foto's meteen als
//                 modelfoto's opslaan. Dit draait vanzelf bij "online zetten"
//                 zodra een model nog geen foto's heeft.
//   alsModel    - de eigen foto's van een toestel kopiëren naar de set van het
//                 hele model (bij een telefoon: model en kleur).
//   (geen actie)- alleen zoeken en de gevonden foto's teruggeven.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { galaxyKandidaten, isGalaxy, kleurVan } from "./galaxy.ts";

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

// Icecat wil een geldige gebruikersNAAM in de URL, geen e-mail. Zet een winkel per
// ongeluk zijn e-mail (of niets) als ICECAT_GEBRUIKER, dan valt de aanroep terug op de
// publieke open-gebruiker van Icecat. Die dekt de open merken (HP, Dell, Lenovo, ...);
// een eigen account zetten mag altijd en gaat dan voor. Zonder deze terugval kreeg je
// "the Icecat user is unknown" en dus nul foto's.
const OPEN_ICECAT = "openIcecat-live";
function icecatGebruiker(): string {
  const g = (Deno.env.get("ICECAT_GEBRUIKER") || "").trim();
  return (!g || g.includes("@")) ? OPEN_ICECAT : g;
}

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
  // Alleen een modelfoto van een telefoon heeft een kleur; bij een laptop blijft hij
  // leeg en verandert er niets.
  const kleur = heelModel ? String(o?.kleur || "").trim() : "";
  const aanzicht = String(o?.aanzicht || "open");
  if (!heelModel && !apparaatId) throw new Error("Geen toestel meegegeven");
  if (heelModel && !model) throw new Error("Geen model meegegeven");

  let bytes: Uint8Array;
  let type = "image/jpeg";
  const data = String(o?.data || "");
  if (o?.bytes instanceof Uint8Array) {
    // Een kopie van een foto die al in onze eigen opslag staat (alsModel).
    bytes = o.bytes;
    type = String(o?.type || "") || "image/jpeg";
  } else if (data.startsWith("data:")) {
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

  const sleutel = (heelModel ? `model_${merk}-${model}${kleur ? "-" + kleur : ""}` : apparaatId)
    .replace(/[^\w.-]+/g, "_");
  // Willekeurig staartje erbij: de automatische lus slaat meerdere foto's in dezelfde
  // milliseconde op, dus Date.now() alleen zou botsen en foto's overschrijven.
  const pad = `${teamId}/${sleutel}/${aanzicht}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error: opslagFout } = await admin.storage.from("refurbish-fotos")
    .upload(pad, bytes, { contentType: type });
  if (opslagFout) throw new Error("De foto opslaan mislukte: " + opslagFout.message);

  const rij: Record<string, unknown> = {
    team_id: teamId, apparaat_id: heelModel ? null : apparaatId,
    merk: merk || null, model: model || null,
    aanzicht, pad, volgorde: AANZICHTEN.indexOf(aanzicht),
  };
  // Alleen meesturen als er een kleur is: zo blijft een laptopfoto precies de rij die
  // hij altijd was.
  if (kleur) rij.kleur = kleur;
  const { error: rijFout } = await admin.from("refurbish_fotos").insert(rij);
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

// Eén vraag aan Icecat: de galerij van één product, of "nee" als het product er niet
// in staat. "fout" betekent dat Icecat niet gewoon antwoordde (geen JSON, een
// HTTP-fout, of te veel vragen achter elkaar); wie veel codes probeert stopt dan.
type IcecatAntwoord = { fotos: any[]; titel: string | null } | "nee" | "fout";
async function icecatVraag(gebruiker: string, sleutel: string, label: string): Promise<IcecatAntwoord> {
  const adres = `https://live.icecat.biz/api?UserName=${encodeURIComponent(gebruiker)}` +
    `&Language=nl${sleutel}&Content=Gallery,GeneralInfo`;
  try {
    const res = await fetch(adres, { headers: { "Accept": "application/json" } });
    if (!res.ok) {
      console.log("icecat http", label, res.status);
      // 404 is "staat er niet in": een gewoon antwoord. De rest is een storing.
      return res.status === 404 ? "nee" : "fout";
    }
    const uit = await res.json();
    const galerij = uit?.data?.Gallery;
    if (!Array.isArray(galerij) || !galerij.length) return "nee";

    // Icecat zet soms ALLEEN een merklogo in de galerij (Type "BrandLogo", pad
    // /img/brand/), zonder echte productfoto. Dat is geen foto van het toestel: eruit
    // filteren, anders komt het merklogo als hoofdfoto op de advertentie (gebeurde bij
    // een Dell Latitude 3520). Blijft er niets over, dan gaan we door naar de volgende
    // poging en uiteindelijk naar de telefoonfoto.
    const echt = galerij.filter((g: any) => {
      const type = String(g?.Type || "").toLowerCase();
      const pic = String(g?.Pic || g?.Pic500x500 || g?.LowPic || "");
      if (type.includes("logo")) return false;
      if (/\/img\/brand\//i.test(pic)) return false;
      return true;
    });
    if (!echt.length) return "nee";

    // Icecat geeft de hoofdfoto met IsMain=Y en een prioriteit No (lager = eerder);
    // de array-volgorde zelf is niet gegarandeerd. Daarop sorteren zodat de hoofdfoto
    // vooraan staat. HighPic bestaat niet in deze Gallery; Pic500x500 wel.
    const gesorteerd = echt.sort((a: any, b: any) => {
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

    if (!fotos.length) return "nee";
    return { fotos, titel: uit?.data?.GeneralInfo?.Title || null };
  } catch (e) {
    console.error("icecat", label, e);
    return "fout";
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
  // De artikelcode kan meerdere kandidaten bevatten (met puntkomma), als backup: de
  // uitlezing levert er per merk een paar (bv. HP-productnummer, Lenovo-machinetype,
  // moederbordcode). Elk apart proberen, zodat als de ene niet in de catalogus staat
  // de andere alsnog een treffer geeft.
  for (const pc of productcode.split(/[;,]/).map((s) => s.trim()).filter(Boolean)) {
    pogingen.push({ soort: "code", waarde: pc });
    if (pc.toUpperCase() !== pc) pogingen.push({ soort: "code", waarde: pc.toUpperCase() });
  }
  for (const c of [model, model.replace(/\s+/g, ""), model.replace(/\s+/g, "-"), model.toUpperCase()]) {
    if (c) pogingen.push({ soort: "code", waarde: c });
  }

  for (const pg of pogingen) {
    const sleutel = pg.soort === "gtin"
      ? `&GTIN=${encodeURIComponent(pg.waarde)}`
      : `&Brand=${encodeURIComponent(merk)}&ProductCode=${encodeURIComponent(pg.waarde)}`;
    const uit = await icecatVraag(gebruiker, sleutel, `${pg.soort} ${pg.waarde}`);
    if (typeof uit === "object") return { ...uit, gevonden: pg.waarde };
  }
  return { fotos: [] as any[], titel: null as string | null, gevonden: null as string | null };
}

// Een Galaxy zoeken op de codes die galaxy.ts uit naam en kleur maakt. Twee tegelijk
// en stoppen bij de eerste treffer of bij een storing: meestal raak in de eerste
// paar, en Icecat remt af als je het bestookt.
async function zoekGalaxy(
  gebruiker: string,
  p: { merk: string; model: string; kleur: string; productcode?: string },
) {
  const kandidaten = galaxyKandidaten(p);
  console.log("galaxy: kandidaten", kandidaten.length, kandidaten.slice(0, 3).join(","));
  for (let i = 0; i < kandidaten.length; i += 2) {
    const tweetal = kandidaten.slice(i, i + 2);
    const uit = await Promise.all(tweetal.map((c) =>
      icecatVraag(gebruiker, `&Brand=Samsung&ProductCode=${encodeURIComponent(c)}`, `galaxy ${c}`)));
    const raak = uit.findIndex((u) => typeof u === "object");
    if (raak >= 0) return { ...(uit[raak] as any), gevonden: tweetal[raak] };
    if (uit.includes("fout")) { console.log("galaxy: icecat storing, gestopt bij", tweetal.join(",")); break; }
  }
  return { fotos: [] as any[], titel: null as string | null, gevonden: null as string | null };
}

// Een telefoon kies je in een kleur, en een foto in de verkeerde kleur is erger dan
// geen foto. Daarom hoort een modelfoto van een telefoon bij model én kleur. Een
// laptop ziet er per model hetzelfde uit; daar speelt de kleur niet mee en blijft
// alles zoals het was.
function isTelefoon(categorie: string) {
  return /telefoon|phone/i.test(String(categorie || ""));
}
function isApple(merk: string, model: string) {
  return /apple|iphone/i.test(`${merk} ${model}`);
}
// De bestaande modelfoto's die bij dit toestel horen: bij een telefoon in dezelfde
// kleur, anders van het hele model.
function modelfotosVan(teamId: string, model: string, kleur: string | null) {
  let q = admin.from("refurbish_fotos").select("aanzicht")
    .eq("team_id", teamId).is("apparaat_id", null).ilike("model", model);
  if (kleur !== null) q = kleur ? q.ilike("kleur", kleur) : q.is("kleur", null);
  return q;
}
function klaar(uit: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...uit }), { headers: cors });
}

// Automatisch: zoek bij Icecat en sla de beste foto's meteen als modelfoto's op.
// Draait vanzelf bij "online zetten" als een model nog geen foto's heeft. Slaat
// aanzichten die dit model al heeft over, zodat opnieuw draaien niets dubbel doet.
// Degradeert stil (opgeslagen:0 + reden) als er geen Icecat-account is of niets
// gevonden wordt; de winkelier valt dan terug op een telefoonfoto.
//
// Redenen die de werkbank uitlegt: geen-model, niet-gevonden, en bij telefoons
// geen-bron (iPhone: er bestaat geen vrije bron) en kleur-nodig (Galaxy zonder kleur).
async function automatisch(lijf: any, teamId: string) {
  const merk = String(lijf?.merk || "").trim();
  const model = String(lijf?.model || "").trim();
  const productcode = String(lijf?.productcode || "").trim();
  const ean = String(lijf?.ean || lijf?.gtin || "").replace(/\D/g, "");
  const telefoon = isTelefoon(lijf?.categorie);
  const kleur = telefoon ? kleurVan(String(lijf?.kleur || ""), model) : "";
  console.log("automatisch: start", JSON.stringify({ merk, model, telefoon, kleur: kleur || null, mpn: productcode || null, ean: ean || null }));

  if (!merk || !model) {
    console.log("automatisch: geen-model");
    return klaar({ opgeslagen: 0, reden: "geen-model" });
  }
  // Apple blokkeert Icecat helemaal; vragen kost alleen tijd.
  if (telefoon && isApple(merk, model)) return klaar({ opgeslagen: 0, reden: "geen-bron" });

  const gebruiker = icecatGebruiker();
  console.log("automatisch: icecat-gebruiker", gebruiker === OPEN_ICECAT ? "(open standaard)" : "(eigen account)");

  // Welke aanzichten heeft dit model al als fabrieksfoto? Die niet nog eens opslaan.
  const { data: best } = await modelfotosVan(teamId, model, telefoon ? kleur : null);
  const bezet = new Set((best || []).map((r: any) => r.aanzicht));

  let gevonden = { fotos: [] as any[], titel: null as string | null, gevonden: null as string | null };
  let bron = "icecat";
  if (telefoon && isGalaxy(merk, model)) {
    gevonden = await zoekGalaxy(gebruiker, { merk, model, kleur, productcode });
    bron = "icecat-galaxy";
    // Geen kleur en geen streepjescode van de doos: dan weten we niet welke foto's
    // kloppen. Liever dat zeggen dan een zwarte telefoon op een groene advertentie.
    if (!gevonden.fotos.length && !ean) {
      return klaar({ opgeslagen: 0, reden: kleur ? "niet-gevonden" : "kleur-nodig" });
    }
  }
  if (!gevonden.fotos.length) {
    gevonden = await zoekIcecat(gebruiker, { merk, model, ean, productcode });
    bron = "icecat";
  }
  console.log("automatisch:", bron, "gaf", gevonden.fotos.length, "foto's, match op", gevonden.gevonden);
  if (!gevonden.fotos.length) return klaar({ opgeslagen: 0, reden: "niet-gevonden" });

  // De vrije aanzicht-slots in de vaste volgorde (open eerst = hoofdfoto).
  const vrij = OPSLAG_VOLGORDE.filter((a) => !bezet.has(a));
  let opgeslagen = 0;
  for (const f of gevonden.fotos) {
    if (opgeslagen >= vrij.length) break;
    const aanzicht = vrij[opgeslagen];
    try {
      await bewaarFoto(teamId, { heelModel: true, merk, model, kleur, aanzicht, url: f.url });
      opgeslagen++;
    } catch (e) {
      console.error("automatisch bewaren", (e as Error)?.message);
    }
  }
  console.log("automatisch: opgeslagen", opgeslagen);
  return klaar({ opgeslagen, bron, titel: gevonden.titel, code: gevonden.gevonden });
}

// De eigen foto's van één toestel worden de fabrieksfoto's van het hele model (bij een
// telefoon: model en kleur). Dit is de snelste weg voor iPhones, waar geen vrije bron
// voor bestaat: fotografeer één mooi exemplaar en elk volgend toestel heeft ze. Het
// zijn je eigen foto's, dus er speelt geen recht van een ander.
//
// We KOPIËREN het bestand in plaats van naar hetzelfde pad te wijzen. Gooi je later
// een foto van dit toestel weg, dan haalt fotoWeg het bestand uit de opslag; met een
// gedeeld pad was de modelfoto dan ook stuk.
async function alsModel(lijf: any, teamId: string) {
  const apparaatId = String(lijf?.apparaat_id || "");
  if (!apparaatId) return fout("Geen toestel meegegeven");
  const { data: a } = await admin.from("refurbish_apparaten")
    .select("id, merk, model, kleur, specs, categorie")
    .eq("id", apparaatId).eq("team_id", teamId).maybeSingle();
  if (!a) return fout("Dit toestel ken ik niet", 404);
  const model = String(a.model || "").trim();
  if (!model) return fout("Vul eerst het model in");
  const telefoon = isTelefoon(a.categorie);
  const kleur = telefoon ? kleurVan(String(a.kleur || a.specs?.Kleur || ""), model) : "";

  const { data: eigen } = await admin.from("refurbish_fotos")
    .select("aanzicht, pad").eq("team_id", teamId).eq("apparaat_id", apparaatId).order("volgorde");
  // Alleen de vaste zes. Een rechtgezet scherm of een foto met achtergrond hoort bij
  // dit ene exemplaar; 'overig' heeft geen vaste plek in de set.
  const teKopieren = (eigen || []).filter((f: any) => AANZICHTEN.includes(f.aanzicht));
  if (!teKopieren.length) return fout("Dit toestel heeft nog geen foto's");

  const { data: best } = await modelfotosVan(teamId, model, telefoon ? kleur : null);
  const bezet = new Set((best || []).map((r: any) => r.aanzicht));

  let opgeslagen = 0, overgeslagen = 0;
  for (const f of teKopieren) {
    if (bezet.has(f.aanzicht)) { overgeslagen++; continue; }
    try {
      const { data: blob, error } = await admin.storage.from("refurbish-fotos").download(f.pad);
      if (error || !blob) throw new Error(error?.message || "niet gevonden");
      await bewaarFoto(teamId, {
        heelModel: true, merk: a.merk || "", model, kleur, aanzicht: f.aanzicht,
        bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type,
      });
      bezet.add(f.aanzicht);
      opgeslagen++;
    } catch (e) {
      console.error("alsModel", f.pad, (e as Error)?.message);
    }
  }
  return klaar({ opgeslagen, overgeslagen, kleur: kleur || null });
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

  // De eigen foto's van een toestel als set voor het hele model.
  if (lijf?.actie === "alsModel") return await alsModel(lijf, acc.team_id);

  // Vanaf hier is het alleen zóeken (foto's teruggeven, niet opslaan).
  const gebruiker = icecatGebruiker();

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
