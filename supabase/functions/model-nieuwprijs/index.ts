// De nieuwprijs van een telefoonmodel opzoeken, per opslag.
//
// Op het A6-kaartje en in de webshop staat "Nieuwprijs: €909,-": wat het toestel nieuw kostte
// in Nederland, op de dag dat het uitkwam. Die prijs hangt af van model en opslag, niet van de
// kleur. De winkelier moest hem eerst elke keer zelf opzoeken en typen.
//
// Drie bronnen, in deze volgorde. De winkelapp en de werkbank lezen 1 en 2 zelf uit de tabel
// model_nieuwprijzen en vragen deze functie alleen als daar niets staat:
//   1. de eigen prijs van de winkel (rij met team_id): wat hij ooit zelf invulde of verbeterde
//   2. de vaste lijst (rij zonder team_id): alle iPhones staan er al in, zie de migratie
//   3. deze functie: zoekt het één keer op het web op en zet het in de vaste lijst
//
// Alleen modellen uit de modellenlijst (model_kleuren): een getypt model kan een typefout zijn,
// en elk zoekwerk kost geld. Per model zoeken we hooguit eens per dertig dagen
// (model_kleuren.nieuwprijs_gezocht_op). Dat veld is ook het slot: zoeken twee mensen tegelijk,
// dan zoekt er maar één. Mislukt het zoeken (time-out, geen verbinding), dan gaat het slot terug.
//
// Een verkeerde nieuwprijs is misleidend. Daarom alleen prijzen die Claude in een bron zag,
// met de link erbij (bron_url, zodat iemand het kan nakijken), en schonePrijzen gooit weg wat
// niet klopt. Liever geen prijs dan een gok: dan typt de winkelier hem zelf, en die onthouden we.
// Er gaat alleen merk, model en opslag mee, niets over de winkel of de klant.
//
// Laptops en desktops (soort "laptop", sinds november 2026): per uitvoering (processor, geheugen,
// opslag) in de tabel laptop_nieuwprijzen, alleen voor modellen uit hardware_modellen. Zelfde
// regels: eens per dertig dagen per uitvoering, met bron, en liever niets dan een gok.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normOpslag, schonePrijzen, uitvoeringSleutel, schoneLaptopPrijs } from "./prijzen.ts";

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
function klaar(uit: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...uit }), { headers: cors });
}

const DAGEN_TUSSEN_ZOEKEN = 30;

// Zoekt met Claude op het web en geeft terug wat hij met het gereedschap inleverde (of null).
// Telefoon en laptop gebruiken dezelfde lus, elk met hun eigen vraag en gereedschap.
async function vraagMetZoeken(vraag: string, bewaren: any): Promise<any | null> {
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")!, timeout: 120_000, maxRetries: 1 });
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: 6,
      user_location: { type: "approximate", country: "NL" } },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
    bewaren,
  ];

  let messages: any[] = [{ role: "user", content: vraag }];
  // Een paar rondes: de zoektocht kan pauzeren (pause_turn, dan hervat de server hem als we
  // het antwoord terugsturen), of eindigen zonder het gereedschap (dan vragen we er één keer om).
  let aangespoord = false;
  for (let ronde = 0; ronde < 5; ronde++) {
    // Opus 5.5 met de standaard denkdiepte: zoeken en twee bronnen naast elkaar leggen.
    // fallbacks "default": weigert het model om een veiligheidsreden, dan beantwoordt een
    // ander model de vraag in dezelfde aanroep (zie model-kleuren).
    const res: any = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      tools,
      messages,
    } as any);

    if (res.stop_reason === "refusal") return null;
    const roep = (res.content || []).find((b: any) => b.type === "tool_use" && b.name === bewaren.name);
    if (roep) return roep.input ?? null;
    if (res.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: res.content }];
      continue;
    }
    if (res.stop_reason === "end_turn" && !aangespoord) {
      aangespoord = true;
      messages = [...messages, { role: "assistant", content: res.content },
        { role: "user", content: `Roep nu ${bewaren.name} aan met wat je in een bron zag.` }];
      continue;
    }
    break;
  }
  return null;
}

async function zoekPrijzen(merk: string, model: string, gevraagd: string[]) {
  // Een eigen gereedschap om het antwoord in te leveren, met een vast schema (strict). Geen
  // output_config.format: de zoekresultaten komen met bronvermeldingen terug, en die gaan
  // niet samen met een vast antwoordformaat.
  const bewaren = {
    name: "prijzen_bewaren",
    description: "Lever de gevonden introductieprijzen in. Eén keer, aan het eind, met alleen prijzen die je in een bron zag.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        prijzen: {
          type: "array",
          items: {
            type: "object",
            properties: {
              opslag: { type: "string", enum: gevraagd },
              prijs: { type: "number", description: "Hele euro's, inclusief btw" },
              bron_url: { type: "string", description: "De pagina waar je deze prijs zag" },
            },
            required: ["opslag", "prijs", "bron_url"],
            additionalProperties: false,
          },
        },
      },
      required: ["prijzen"],
      additionalProperties: false,
    },
  };

  const vraag = `Wat kostte dit toestel nieuw in Nederland, op de dag dat het uitkwam?

Merk: ${merk}
Model: ${model}
Opslag: ${gevraagd.join(", ")}

Ik wil per opslag de adviesprijs van de fabrikant in Nederland bij de introductie, in hele euro's
inclusief btw. Dus de prijs uit de aankondiging of van de Nederlandse webwinkel van de fabrikant op
de eerste dag. Niet een latere verlaagde prijs, en niet de prijs bij een andere winkel.

Zoek het op. Goede bronnen: de Nederlandse persberichten van de fabrikant, iCulture, Tweakers,
Androidplanet, of de Nederlandse site van de fabrikant in het Web Archive. Een prijs uit België of
Duitsland telt niet: die verschilt per land.

Neem een opslag alleen mee als je de prijs in een bron zag, en zet die link bij bron_url. Twijfel
je, laat hem dan weg. Een lege lijst is ook een goed antwoord.

Roep aan het eind prijzen_bewaren aan.`;

  const inv = await vraagMetZoeken(vraag, bewaren);
  return inv ? schonePrijzen(inv.prijzen, gevraagd) : [];
}

// ── Laptops en desktops: één uitvoering ──
async function zoekLaptopPrijs(merk: string, model: string, u: { processor: string; geheugen: string; opslag: string; scherm: string }) {
  const bewaren = {
    name: "prijs_bewaren",
    description: "Lever de gevonden nieuwprijs in. Eén keer, aan het eind. Zag je hem niet in een bron, zet dan gevonden op false.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        gevonden: { type: "boolean" },
        prijs: { type: "number", description: "Hele euro's, inclusief btw. 0 als je niets vond." },
        bron_url: { type: "string", description: "De pagina waar je deze prijs zag. Leeg als je niets vond." },
      },
      required: ["gevonden", "prijs", "bron_url"],
      additionalProperties: false,
    },
  };
  const vraag = `Wat kostte deze laptop nieuw in Nederland, in precies deze uitvoering?

Merk: ${merk}
Model: ${model}
Processor: ${u.processor}
Geheugen: ${u.geheugen}
Opslag: ${u.opslag}${u.scherm ? `
Scherm: ${u.scherm}` : ""}

Ik wil de adviesprijs van de fabrikant in Nederland toen deze uitvoering te koop kwam, in hele euro's
inclusief btw. Goede bronnen: de Nederlandse webwinkel van de fabrikant (ook in het Web Archive), het
persbericht, of Tweakers Pricewatch (de prijs in de eerste weken). Zakelijke laptops staan vaak alleen
bij de fabrikant of bij Tweakers. Staat er alleen een prijs zonder btw, reken hem dan om met 21 procent.

Niet goed: een prijs uit België of Duitsland, een refurbished of tweedehands prijs, of een andere
uitvoering (een andere processor, minder geheugen of minder opslag). Dezelfde uitvoering met een ander
scherm mag, als je de precieze niet vindt.

Zag je de prijs niet in een bron, zet dan gevonden op false. Geen prijs is beter dan een gok.

Roep aan het eind prijs_bewaren aan.`;
  return schoneLaptopPrijs(await vraagMetZoeken(vraag, bewaren));
}

async function laptopNieuwprijs(merk: string, model: string, lijf: any) {
  const processor = String(lijf?.processor || "").trim().slice(0, 90);
  const geheugen = String(lijf?.geheugen || "").trim().slice(0, 40);
  const opslag = String(lijf?.opslag || "").trim().slice(0, 60);
  const scherm = String(lijf?.scherm || "").trim().slice(0, 90);
  const sleutel = uitvoeringSleutel(processor, geheugen, opslag);
  if (!sleutel) return fout("Vul eerst processor, geheugen en opslag in");

  // Alleen modellen uit de modellenlijst: een getypt model kan een typefout zijn, en elk
  // zoekwerk kost geld. De schrijfwijze van de lijst is ook die van de prijsrij.
  const { data: modellen } = await admin.from("hardware_modellen")
    .select("merk, model").ilike("merk", merk).ilike("model", model).limit(1);
  const m = modellen?.[0];
  if (!m) return klaar({ prijs: null, bron: "onbekend" });

  const { data: rijen } = await admin.from("laptop_nieuwprijzen")
    .select("id, prijs, gezocht_op").is("team_id", null)
    .ilike("merk", m.merk).ilike("model", m.model).eq("uitvoering", sleutel).limit(1);
  const bekend = rijen?.[0];
  if (bekend && bekend.prijs != null) return klaar({ prijs: Number(bekend.prijs), bron: "lijst" });
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return klaar({ prijs: null, bron: "lijst" });

  // Het slot: een lege rij (prijs nog leeg) met gezocht_op. Bestaat hij al en zocht iemand de
  // laatste dertig dagen, dan zoeken we niet nog eens; ook niet als twee mensen tegelijk vragen.
  const nu = new Date().toISOString();
  let id = "";
  if (bekend) {
    const grens = new Date(Date.now() - DAGEN_TUSSEN_ZOEKEN * 864e5).toISOString();
    const { data: slot } = await admin.from("laptop_nieuwprijzen").update({ gezocht_op: nu })
      .eq("id", bekend.id).is("prijs", null)
      .or(`gezocht_op.is.null,gezocht_op.lt."${grens}"`).select("id");
    if (!slot?.length) return klaar({ prijs: null, bron: "niet gevonden" });
    id = bekend.id;
  } else {
    const { data: nieuw } = await admin.from("laptop_nieuwprijzen").upsert({
      team_id: null, merk: m.merk, model: m.model, uitvoering: sleutel,
      processor, geheugen, opslag, prijs: null, gezocht_op: nu,
    }, { onConflict: "team_id,merk,model,uitvoering", ignoreDuplicates: true }).select("id");
    if (!nieuw?.length) return klaar({ prijs: null, bron: "lijst" });   // een ander zoekt hem al
    id = nieuw[0].id;
  }

  try {
    const gevonden = await zoekLaptopPrijs(m.merk, m.model, { processor, geheugen, opslag, scherm });
    if (!gevonden) return klaar({ prijs: null, bron: "niet gevonden" });
    const { error } = await admin.from("laptop_nieuwprijzen").update({
      prijs: gevonden.prijs, bron: "opgezocht", bron_url: gevonden.bron_url, bijgewerkt_op: new Date().toISOString(),
    }).eq("id", id);
    if (error) console.error("model-nieuwprijs laptop bewaren", error);
    return klaar({ prijs: gevonden.prijs, bron: "opgezocht" });
  } catch (e) {
    console.error("model-nieuwprijs laptop", e);
    // Mislukt (time-out, geen verbinding): het slot terug, zodat het de volgende keer weer mag.
    await admin.from("laptop_nieuwprijzen").update({ gezocht_op: null }).eq("id", id).is("prijs", null);
    return fout("Het opzoeken lukte nu niet", 502);
  }
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

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  // % en _ zijn jokertekens voor ilike; een modelnaam heeft ze niet.
  const merk = String(lijf?.merk || "").trim().replace(/[%_]/g, "").slice(0, 60);
  const model = String(lijf?.model || "").trim().replace(/[%_]/g, "").slice(0, 120);
  if (!merk || !model) return fout("Vul eerst merk en model in");
  if (String(lijf?.soort || "") === "laptop") return await laptopNieuwprijs(merk, model, lijf);

  const { data: modellen } = await admin.from("model_kleuren")
    .select("id, merk, model, opslag, nieuwprijs_gezocht_op").ilike("merk", merk).ilike("model", model).limit(1);
  const rij = modellen?.[0];
  if (!rij) return klaar({ prijzen: [], bron: "onbekend" });

  const opslag = (Array.isArray(rij.opslag) ? rij.opslag : []).map(normOpslag).filter(Boolean);
  const { data: bekend } = await admin.from("model_nieuwprijzen")
    .select("opslag, prijs").is("team_id", null).ilike("merk", rij.merk).ilike("model", rij.model);
  const heeft = new Set((bekend || []).map((b: any) => b.opslag));
  const missend = opslag.filter((o: string) => !heeft.has(o));
  if (!missend.length || !Deno.env.get("ANTHROPIC_API_KEY")) return klaar({ prijzen: bekend || [], bron: "lijst" });

  // Het slot: alleen verder als er de laatste dertig dagen niemand voor dit model zocht.
  const grens = new Date(Date.now() - DAGEN_TUSSEN_ZOEKEN * 864e5).toISOString();
  const { data: slot } = await admin.from("model_kleuren")
    .update({ nieuwprijs_gezocht_op: new Date().toISOString() })
    .eq("id", rij.id)
    .or(`nieuwprijs_gezocht_op.is.null,nieuwprijs_gezocht_op.lt."${grens}"`)
    .select("id");
  if (!slot?.length) return klaar({ prijzen: bekend || [], bron: "lijst" });

  try {
    const gevonden = await zoekPrijzen(rij.merk, rij.model, missend);
    if (gevonden.length) {
      const nu = new Date().toISOString();
      const { error } = await admin.from("model_nieuwprijzen").upsert(
        gevonden.map((g) => ({
          team_id: null, merk: rij.merk, model: rij.model, opslag: g.opslag, prijs: g.prijs,
          bron: "opgezocht", bron_url: g.bron_url, bijgewerkt_op: nu,
        })),
        { onConflict: "team_id,merk,model,opslag", ignoreDuplicates: true },
      );
      if (error) console.error("model-nieuwprijs bewaren", error);
    }
    return klaar({
      prijzen: [...(bekend || []), ...gevonden.map((g) => ({ opslag: g.opslag, prijs: g.prijs }))],
      bron: "opgezocht",
    });
  } catch (e) {
    console.error("model-nieuwprijs", e);
    await admin.from("model_kleuren").update({ nieuwprijs_gezocht_op: rij.nieuwprijs_gezocht_op }).eq("id", rij.id);
    return fout("Het opzoeken lukte nu niet", 502);
  }
});
