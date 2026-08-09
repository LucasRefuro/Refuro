// Leest een foto van een productdoosje en zegt wat erin zit.
//
// De winkel maakt met de telefoon een foto van het doosje. Die foto komt hier
// binnen, gaat naar een taalmodel dat ook plaatjes kan lezen, en terug komt
// een nette productnaam met merk, model en categorie.
//
// Twee dingen maken het antwoord bruikbaar in plaats van willekeurig:
//   1. We sturen de categorieën van de winkel mee. Het model mag alleen
//      daaruit kiezen, zodat er geen nieuwe categorie uit de lucht valt.
//   2. We sturen een handvol bestaande productnamen mee. Het model schrijft de
//      nieuwe naam in dezelfde stijl. Noemt de winkel het "Hoesje iPhone 15
//      zwart", dan komt er geen "Zwarte beschermhoes voor Apple iPhone 15".
//
// De foto wordt niet bewaard. Hij gaat er doorheen en verdwijnt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001";

// Groter dan dit accepteren we niet. De telefoon schaalt al terug; wat hier
// alsnog te groot binnenkomt is een vergissing en kost alleen maar geld.
const MAX_BEELD = 700_000;

type Uit = {
  naam: string;
  merk: string;
  model: string;
  categorie: string;
  soort: string;
  artikelcode: string;
  accessoire: boolean;
  verkoop: number | null;
  zeker: "hoog" | "middel" | "laag";
  gelezen: string;
};

function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ fout: bericht }), { status: code, headers: cors });
}

function bouwOpdracht(categorieen: string[], voorbeelden: string[]) {
  return `Je kijkt naar de foto van een doosje of verpakking van een product dat in een telefoonwinkel verkocht wordt. Denk aan hoesjes, screenprotectors, opladers, kabels, oortjes, powerbanks, houders en losse onderdelen.

Bepaal zo precies mogelijk wat dit is en geef uitsluitend geldige JSON terug, zonder uitleg eromheen en zonder markdown.

Velden:
- naam: korte Nederlandse productnaam, in dezelfde schrijfwijze als de voorbeelden hieronder. Geen merknaam van de verpakkingsfabrikant erin tenzij die er echt toe doet.
- merk: het merk van de telefoon waar het voor is, bijvoorbeeld Apple of Samsung. Leeg als het nergens voor specifiek is.
- model: het telefoonmodel, bijvoorbeeld "iPhone 15" of "Galaxy A54 5G". Leeg als het universeel is.
- categorie: kies er precies één uit deze lijst en verzin er geen: ${JSON.stringify(categorieen)}. Past er echt geen enkele, geef dan een lege string.
- soort: het type product in één of twee woorden, bijvoorbeeld "hoesje", "screenprotector", "oplader", "kabel".
- artikelcode: het artikelnummer van de fabrikant zoals het op de doos staat, bijvoorbeeld "XSS-12345" of "SKU 40213". Neem het precies over, met streepjes en hoofdletters. Dit is niet de streepjescode van dertien cijfers en ook niet een EAN. Zie je er geen, geef dan een lege string.
- accessoire: true als dit een accessoire is dat je los verkoopt, false als het een reparatieonderdeel is.
- verkoop: een realistische Nederlandse winkelprijs in euro's inclusief btw als getal, of null als je het echt niet kunt inschatten. Alleen invullen bij accessoires.
- zeker: "hoog", "middel" of "laag", hoe zeker je bent.
- gelezen: de tekst die je op de verpakking hebt kunnen lezen, hooguit één regel.

Zo schrijft deze winkel zijn productnamen op:
${voorbeelden.length ? voorbeelden.map((v) => "- " + v).join("\n") : "- (nog geen voorbeelden, kies zelf een korte duidelijke naam)"}

Kun je het doosje niet lezen of staat er geen product op, zet dan zeker op "laag" en naam op een lege string.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const sleutel = Deno.env.get("ANTHROPIC_API_KEY");
  if (!sleutel) return fout("De herkenning is nog niet ingesteld", 503);

  // Wie belt hier? Zonder geldige inlog gaan we niet aan de slag; anders kan
  // iedereen met de publieke sleutel op onze rekening foto's laten lezen.
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return fout("Niet ingelogd", 401);

  const klant = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } },
  );
  const { data: wie, error: wieFout } = await klant.auth.getUser();
  if (wieFout || !wie?.user) return fout("Niet ingelogd", 401);

  let lijf: any;
  try {
    lijf = await req.json();
  } catch {
    return fout("Onleesbaar verzoek");
  }

  const beeld: string = String(lijf?.beeld || "");
  const treffer = beeld.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!treffer) return fout("Geen bruikbare foto meegestuurd");
  if (treffer[3].length > MAX_BEELD) return fout("De foto is te groot");

  const categorieen: string[] = Array.isArray(lijf?.categorieen)
    ? lijf.categorieen.filter((c: unknown) => typeof c === "string").slice(0, 40)
    : [];
  const voorbeelden: string[] = Array.isArray(lijf?.voorbeelden)
    ? lijf.voorbeelden.filter((v: unknown) => typeof v === "string").slice(0, 25)
    : [];

  let antwoord: Response;
  try {
    antwoord = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": sleutel,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: treffer[1], data: treffer[3] },
            },
            { type: "text", text: bouwOpdracht(categorieen, voorbeelden) },
          ],
        }],
      }),
    });
  } catch (_e) {
    return fout("De herkenning is niet bereikbaar", 502);
  }

  if (!antwoord.ok) {
    const tekst = await antwoord.text();
    console.error("herkenning mislukt", antwoord.status, tekst.slice(0, 400));
    return fout(antwoord.status === 429 ? "Even te druk, probeer het zo nog eens" : "De herkenning gaf een fout", 502);
  }

  const rauw = await antwoord.json();
  const tekst: string = (rauw?.content || [])
    .filter((d: any) => d?.type === "text")
    .map((d: any) => d.text)
    .join("")
    .trim();

  // Soms komt er toch een blokje ```json omheen. Dat halen we eraf.
  const schoon = tekst.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

  let uit: Partial<Uit>;
  try {
    uit = JSON.parse(schoon);
  } catch {
    console.error("antwoord was geen JSON", schoon.slice(0, 300));
    return fout("Het antwoord was niet te lezen", 502);
  }

  const veilig: Uit = {
    naam: String(uit.naam || "").trim().slice(0, 90),
    merk: String(uit.merk || "").trim().slice(0, 40),
    model: String(uit.model || "").trim().slice(0, 60),
    categorie: categorieen.includes(String(uit.categorie || "")) ? String(uit.categorie) : "",
    soort: String(uit.soort || "").trim().slice(0, 40),
    // Een artikelnummer is kort en heeft letters. Staat er alleen een reeks
    // cijfers, dan is het bijna zeker de streepjescode en die willen we hier
    // niet, anders komt hij dubbel achter de titel te staan.
    artikelcode: (() => {
      const c = String(uit.artikelcode || "").trim().toUpperCase().slice(0, 30);
      return /[A-Z]/.test(c) && c.length >= 3 ? c : "";
    })(),
    accessoire: uit.accessoire !== false,
    verkoop: typeof uit.verkoop === "number" && uit.verkoop > 0 && uit.verkoop < 2000
      ? Math.round(uit.verkoop * 100) / 100
      : null,
    zeker: uit.zeker === "hoog" || uit.zeker === "middel" ? uit.zeker : "laag",
    gelezen: String(uit.gelezen || "").trim().slice(0, 200),
  };

  return new Response(JSON.stringify(veilig), { headers: cors });
});
