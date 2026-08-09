// Wat kun je hier redelijkerwijs voor vragen.
//
// Drie bronnen, en het is belangrijk dat je ziet welke waar vandaan komt:
//
//   1. Wat jij zelf eerder voor hetzelfde model vroeg. Dat is het sterkste
//      signaal dat er is, want het gaat over jouw klanten en jouw markt.
//   2. Een schatting van de AI voor de Nederlandse refurbished-markt.
//   3. Kant-en-klare zoeklinks naar Back Market, Refurbed en Marktplaats.
//
// Wat we níét doen is die webshops leegtrekken. Dat mag niet van hun
// voorwaarden, het breekt bij elke wijziging aan hun website, en je zou het
// merken op het moment dat je het het hardst nodig hebt. De schatting is dus
// een schatting, met links erbij om hem in tien seconden zelf na te lopen.

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

const STAAT: Record<string, string> = {
  A: "als nieuw, nauwelijks gebruikssporen",
  B: "gebruikt maar in nette staat",
  C: "zichtbare gebruikssporen",
};

function zoeklinks(merk: string, model: string) {
  const zoek = [merk, model].filter(Boolean).join(" ");
  const q = encodeURIComponent(zoek);
  return [
    { naam: "Back Market", url: `https://www.backmarket.nl/nl-nl/search?q=${q}` },
    { naam: "Refurbed", url: `https://www.refurbed.nl/search/?q=${q}` },
    { naam: "Marktplaats", url: `https://www.marktplaats.nl/q/${encodeURIComponent(zoek.replace(/\s+/g, "-"))}/` },
    { naam: "Tweakers V&A", url: `https://tweakers.net/aanbod/zoeken/?keyword=${q}` },
  ];
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

  const { data: a } = await admin.from("refurbish_apparaten")
    .select("*").eq("id", String(lijf?.apparaat_id || ""))
    .eq("team_id", acc.team_id).maybeSingle();
  if (!a) return fout("Dit apparaat is niet gevonden", 404);

  const specs = (a.specs && typeof a.specs === "object") ? a.specs : {};
  const links = zoeklinks(a.merk || "", a.model || "");

  // 1. Eigen geschiedenis.
  const { data: eigen } = await admin.from("hardware")
    .select("verkoop, verkocht_op, status")
    .eq("team_id", acc.team_id)
    .ilike("model", a.model || "")
    .not("verkoop", "is", null)
    .limit(40);

  const verkocht = (eigen || []).filter((r) => r.status === "verkocht" && Number(r.verkoop) > 0)
    .map((r) => Number(r.verkoop)).sort((x, z) => x - z);
  const gevraagd = (eigen || []).filter((r) => Number(r.verkoop) > 0)
    .map((r) => Number(r.verkoop)).sort((x, z) => x - z);

  const midden = (l: number[]) =>
    l.length ? Math.round(l[Math.floor(l.length / 2)] * 100) / 100 : null;
  const eigenAdvies = midden(verkocht) ?? midden(gevraagd);

  // 2. Schatting van de markt.
  const sleutel = Deno.env.get("ANTHROPIC_API_KEY");
  let markt: any = null;
  if (sleutel) {
    const specregels = Object.entries(specs)
      .filter(([, v]) => v != null && String(v).trim() !== "")
      .map(([k, v]) => `- ${k}: ${v}`).join("\n");

    const prompt = `Wat is een reële vraagprijs voor dit gerefurbishte apparaat op de
Nederlandse markt?

Merk: ${a.merk || "onbekend"}
Model: ${a.model}
Categorie: ${a.categorie || "Laptop"}
Staat: grade ${a.grade || "B"} (${STAAT[a.grade] || "gebruikt"})
${a.accu ? `Accu: ${a.accu}% van nieuw` : ""}
${specregels || "Geen specificaties bekend."}

Denk aan wat vergelijkbare toestellen kosten bij Back Market, Refurbed,
Computerzaak en soortgelijke aanbieders, inclusief btw, met zes tot twaalf
maanden garantie. Reken mee dat een grade C flink lager ligt dan een grade A,
en dat een oud model met veel geheugen minder waard is dan een nieuw model met
weinig.

Weet je het echt niet, geef dan null in plaats van een verzonnen getal.

Antwoord uitsluitend met JSON:
{"advies": 349, "laag": 299, "hoog": 399, "uitleg": "één zin over waar dit op gebaseerd is", "zeker": "hoog of midden of laag"}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": sleutel,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const uit = await res.json();
      if (res.ok) {
        const tekst = (uit?.content || []).map((c: any) => c.text || "").join("").trim();
        const m = tekst.match(/\{[\s\S]*\}/);
        if (m) {
          const j = JSON.parse(m[0]);
          const g = (w: any) => (typeof w === "number" && w > 0 && w < 100000)
            ? Math.round(w * 100) / 100 : null;
          markt = {
            advies: g(j.advies), laag: g(j.laag), hoog: g(j.hoog),
            uitleg: String(j.uitleg || "").slice(0, 300),
            zeker: ["hoog", "midden", "laag"].includes(j.zeker) ? j.zeker : "midden",
          };
          if (!markt.advies) markt = null;
        }
      }
    } catch (e) {
      console.error("prijsadvies markt", e);
    }
  }

  // 3. Wat we ervan maken. De eigen geschiedenis weegt zwaarder, want die gaat
  //    over jouw winkel; de schatting is een tweede mening.
  let advies: number | null = null, bron = "geen";
  if (eigenAdvies && markt?.advies) {
    advies = Math.round(((eigenAdvies * 0.6) + (markt.advies * 0.4)) / 5) * 5 - 0.05;
    bron = "beide";
  } else if (eigenAdvies) {
    advies = eigenAdvies; bron = "eigen";
  } else if (markt?.advies) {
    advies = Math.round(markt.advies / 5) * 5 - 0.05; bron = "markt";
  } else if (a.inkoop) {
    advies = Math.round((Number(a.inkoop) * 2.2) / 5) * 5 - 0.05; bron = "opslag";
  }

  const uitlegPer: Record<string, string> = {
    beide: `Jouw eigen prijzen voor dit model (${verkocht.length || gevraagd.length}×) naast een schatting van de markt.`,
    eigen: `Wat je zelf vroeg voor ${verkocht.length || gevraagd.length}× hetzelfde model.`,
    markt: markt?.uitleg || "Schatting van de Nederlandse refurbished-markt.",
    opslag: "Ruwe schatting: ruim het dubbele van de inkoop. Loop de links even na.",
    geen: "Te weinig om op te gaan. Kijk zelf even bij de aanbieders hieronder.",
  };

  return new Response(JSON.stringify({
    ok: true,
    advies, bron, uitleg: uitlegPer[bron],
    eigen: eigenAdvies ? { advies: eigenAdvies, aantal: verkocht.length || gevraagd.length } : null,
    markt,
    links,
    let_op: "Een schatting, geen actuele prijzen. Loop de links even na voordat je hem online zet.",
  }), { headers: cors });
});
