// De hulp-assistent rechtsonder in de winkelapp. Beantwoordt vragen over de software en
// wijst de winkelier de weg: hij geeft niet alleen antwoord, maar kan ook een 'ga'-doel
// teruggeven zodat de app de winkelier meteen naar de juiste pagina brengt.
//
// Bewust GEEN toegang tot de winkeldata of klantgegevens: dit is een gids over de software,
// geen data-assistent. Hij krijgt alleen de vraag, de huidige pagina en welke pagina's deze
// gebruiker mag zien. Model: Claude (ANTHROPIC_API_KEY).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// De pagina's van de app. De sleutel is de tab-id die de app opent (showTab). De assistent
// mag alleen navigeren naar een id dat in de meegestuurde 'toegankelijk'-lijst staat.
const GIDS = `
PAGINA'S (tab-id — wat je er doet):
- dashboard — Startscherm met de cijfers en aandachtspunten van vandaag.
- verkoop — De KASSA: artikelen scannen en afrekenen aan de balie (pin/contant).
- verkopen — Overzicht van gedane verkopen en de omzet per periode.
- producten — De winkelvoorraad (hoesjes, opladers, accessoires): producten en prijzen beheren.
- voorraad — Voorraad-aantallen per product bijhouden (hoort onder Producten).
- scan — Met de barcode-scanner een product opzoeken.
- bestellen — De bestellijst: wat er bijbesteld moet worden.
- nieuw — Een nieuw product toevoegen (hoort onder Producten).
- catalogus — De leverancierscatalogus doorzoeken en producten overnemen.
- hardware — De verkoopbare TOESTELLEN (refurbished laptops/telefoons): prijs, prijskaartje printen, online zetten, verkopen aan de balie.
- reparaties — Reparaties aannemen en volgen (het reparatiebord).
- inkopen — Inkopen registreren (voor de btw-voorbelasting en je kosten).
- pakketten — Verdiensten van pakketdiensten (PostNL, DHL, Vinted) bijhouden.
- mail — De mailbox (info@) lezen en beantwoorden.
- labelprinter — De labelprinter instellen en testen.
- vastelasten — Vaste maandelijkse lasten.
- rapport — Financieel rapport: btw per kwartaal, inkomstenbelasting-indicatie, buffers.
- facturen — Facturen en offertes maken en versturen.
- uren — Gewerkte uren van het personeel.
- rooster — Het werkrooster en de beschikbaarheid.
- team — Team en gebruikers beheren: rollen, rechten, en loon per medewerker.
- partners — Toestellen die een partner voor je verkoopt (partner-dashboard).
- instellingen — Alle instellingen. Heeft SUB-pagina's (geef dan ga.tab='instellingen' en ga.sub):
    bedrijf (naam, logo, contact) · factuur (IBAN, KVK, btw-nummer, betaaltermijn) ·
    huisstijl (kleuren) · klantpagina · berichten (standaardberichten) · webshop (Shopify-koppeling) ·
    clover (pin/kassa-koppeling) · leveranciers (logins Foneday/Mobileparts) · kassa · cats · types ·
    modellen · snel (snelkoppelingen) · paginas (zichtbare pagina's) · abonnement · backup · refurbish
- meer — Verzamelpagina met de minder gebruikte onderdelen.
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const sleutel = Deno.env.get("ANTHROPIC_API_KEY");
  if (!sleutel) return fout("De assistent is nog niet ingesteld", 503);

  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);
  const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } });
  const { data: wie } = await klant.auth.getUser();
  if (!wie?.user) return fout("Niet ingelogd", 401);
  const { data: acc } = await admin.from("accounts").select("team_id, rol").eq("id", wie.user.id).maybeSingle();
  if (!acc) return fout("Je account is niet gevonden", 403);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }

  const vraag = String(lijf?.vraag || "").slice(0, 1000).trim();
  if (!vraag) return fout("Geen vraag meegegeven");
  const huidige = String(lijf?.huidige_tab || "").slice(0, 40);
  const toegankelijk = Array.isArray(lijf?.toegankelijk)
    ? lijf.toegankelijk.map((x: unknown) => String(x)).slice(0, 60) : [];
  // Korte gespreksgeschiedenis voor vervolgvragen (max ~6 beurten, kort afgekapt).
  const geschiedenis: { role: string; content: string }[] = Array.isArray(lijf?.geschiedenis)
    ? lijf.geschiedenis.slice(-6).map((m: any) => ({
        role: m?.rol === "assistent" ? "assistant" : "user",
        content: String(m?.tekst || "").slice(0, 800),
      })).filter((m: any) => m.content)
    : [];

  const systeem = `Je bent de hulp-assistent van Storvo, software voor telefoon- en laptop-
reparatiewinkels. Je helpt de winkelier de WEG te vinden in de software en legt kort uit hoe
iets werkt. Je hebt GEEN toegang tot de winkelgegevens; je bent een gids over de app.

${GIDS}

De gebruiker heeft rol "${acc.rol}" en staat nu op pagina "${huidige || "onbekend"}".
Deze pagina's mag deze gebruiker openen (gebruik ALLEEN deze tab-id's in "ga"):
${toegankelijk.join(", ") || "(onbekend, wees dan voorzichtig met navigeren)"}

REGELS:
- Antwoord in het Nederlands, kort en concreet. De eigenaar heeft ADHD en dyslexie: korte
  zinnen, geen jargon, geen lange opsommingen. Eén tot drie zinnen is meestal genoeg.
- Vraagt iemand WAAR of HOE hij iets doet, noem dan kort de pagina en zet "ga" op het doel,
  zodat de app hem er meteen heen brengt. "label" is een korte knoptekst zoals "Naar Facturen".
- Gebruik in "ga.tab" alleen een id uit de toegankelijke lijst. Mag de gebruiker die pagina
  niet, zeg dat dan vriendelijk en laat "ga" op null. Voor een instellingen-sub-pagina:
  ga.tab="instellingen" en ga.sub de sub-naam (bijv. "factuur").
- Verzin NOOIT knoppen of functies die niet in de gids staan. Weet je het niet zeker, zeg dat
  eerlijk en verwijs naar de dichtstbijzijnde pagina, of stel voor het als bug/idee te melden
  (dat kan met de knoppen onderin de assistent).
- Ga niet in op vragen buiten de software (geen algemene kennis, geen klant-privézaken).

Antwoord UITSLUITEND met JSON in deze vorm, zonder tekst eromheen:
{"antwoord": "...", "ga": {"tab": "...", "sub": "... of null", "label": "..."} of null}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": sleutel, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: systeem,
        messages: [...geschiedenis, { role: "user", content: vraag }],
      }),
    });
    const uit = await res.json();
    if (!res.ok) throw new Error(uit?.error?.message || "De assistent gaf een fout");
    const tekst = (uit?.content || []).map((c: any) => c.text || "").join("").trim();
    const m = tekst.match(/\{[\s\S]*\}/);
    if (!m) return new Response(JSON.stringify({ ok: true, antwoord: tekst || "Dat weet ik zo niet.", ga: null }), { headers: cors });
    let j: any = {};
    try { j = JSON.parse(m[0]); } catch { j = { antwoord: tekst, ga: null }; }

    // 'ga' opschonen en tegen de toegankelijke lijst houden, zodat we nooit ergens heen sturen
    // waar deze gebruiker niet mag of naar een verzonnen pagina.
    let ga: any = null;
    if (j.ga && typeof j.ga === "object" && j.ga.tab) {
      const tab = String(j.ga.tab);
      if (!toegankelijk.length || toegankelijk.includes(tab)) {
        ga = { tab, sub: j.ga.sub ? String(j.ga.sub) : null, label: String(j.ga.label || "Breng me erheen").slice(0, 40) };
      }
    }
    return new Response(JSON.stringify({
      ok: true,
      antwoord: String(j.antwoord || "Dat weet ik zo niet.").slice(0, 2000),
      ga,
    }), { headers: cors });
  } catch (e) {
    console.error("assistent", e);
    return fout(e instanceof Error ? e.message : "De assistent gaf een fout", 502);
  }
});
