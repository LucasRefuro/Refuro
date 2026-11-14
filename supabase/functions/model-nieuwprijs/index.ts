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

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normOpslag, schonePrijzen } from "./prijzen.ts";

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

async function zoekPrijzen(merk: string, model: string, gevraagd: string[]) {
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")!, timeout: 120_000, maxRetries: 1 });

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

    if (res.stop_reason === "refusal") return [];
    const roep = (res.content || []).find((b: any) => b.type === "tool_use" && b.name === "prijzen_bewaren");
    if (roep) return schonePrijzen(roep.input?.prijzen, gevraagd);
    if (res.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: res.content }];
      continue;
    }
    if (res.stop_reason === "end_turn" && !aangespoord) {
      aangespoord = true;
      messages = [...messages, { role: "assistant", content: res.content },
        { role: "user", content: "Roep nu prijzen_bewaren aan met de prijzen die je in een bron zag." }];
      continue;
    }
    break;
  }
  return [];
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
