// Publieke reparatiestatus voor de klantpagina: storvo.app/r/<winkel>/<code>
// Geeft bewust alleen wat de klant mag zien. Nooit prijzen, marges, onderdelen
// of gegevens van andere klanten.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Alleen deze stappen bestaan voor de klant; interne statussen blijven binnen.
const KLANT_STAPPEN = ["aangemeld", "inleveren", "besteld", "binnen", "bezig", "klaar"];

function schoonNummer(code: string) {
  return String(code || "").replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("winkel") || "").trim().toLowerCase();
    const code = schoonNummer(url.searchParams.get("code") || "");
    if (!slug || !code) {
      return new Response(JSON.stringify({ error: "Onvolledige link." }), { status: 400, headers: cors });
    }

    const { data: winkel } = await admin.from("klanten")
      .select("id, naam, status").eq("slug", slug).maybeSingle();
    if (!winkel) {
      return new Response(JSON.stringify({ error: "Deze winkel bestaat niet." }), { status: 404, headers: cors });
    }

    const { data: rij } = await admin.from("winkeldata")
      .select("data").eq("team_id", winkel.id).maybeSingle();
    const doc = (rij?.data ?? {}) as Record<string, unknown>;

    const reparaties = (doc.reparaties ?? []) as Array<Record<string, unknown>>;
    const rep = reparaties.find((r) => schoonNummer(String(r.nr ?? "")) === code);
    if (!rep) {
      return new Response(JSON.stringify({ error: "Onbekende reparatiecode." }), { status: 404, headers: cors });
    }

    const instellingen = (doc.instellingen ?? {}) as Record<string, string>;
    const huisstijl = (doc.huisstijl ?? {}) as Record<string, string>;
    // De klantpagina heeft een eigen huisstijl; ontbreekt die, dan volgt hij het dashboard.
    const kp = (doc.klantpagina ?? {}) as Record<string, unknown>;
    const kpStijl = (kp.stijl ?? {}) as Record<string, string>;

    const merk = {
      naam: kpStijl.naam || huisstijl.naam || instellingen.naam || winkel.naam,
      logo: kpStijl.logo || huisstijl.logo || "",
      accent: kpStijl.oranje || huisstijl.oranje || "#0B5B52",
      donker: kpStijl.navy || huisstijl.navy || "#123F39",
      achtergrond: kpStijl.bg || huisstijl.bg || "#F7F6F3",
      tekst: kpStijl.tekst || huisstijl.tekst || "#17201E",
    };

    const tijdlijn = ((rep.log ?? []) as Array<Record<string, unknown>>)
      .filter((l) => KLANT_STAPPEN.includes(String(l.status ?? "")))
      .map((l) => ({ status: l.status, t: l.t }));

    const notities = ((rep.notities ?? []) as Array<Record<string, unknown>>)
      .filter((n) => n.klant === true)
      .map((n) => ({ tekst: n.tekst, t: n.t, probleem: n.prob === true }));

    // Contactgegevens: de winkel stelt ze in bij de klantpagina; ontbreekt iets,
    // dan valt het terug op de bedrijfsgegevens. Zo staat er nooit stil een
    // prive-adres op de klantpagina omdat het per ongeluk het afzenderadres pakt.
    const kpTel = (kp.telefoon as string) || "";
    const antwoord = {
      winkel: {
        naam: merk.naam,
        telefoon: kpTel || instellingen.tel || "",
        email: (kp.email as string) || instellingen.email || "",
        whatsapp: (kp.whatsapp as string) || kpTel || instellingen.tel || "",
        adres: (kp.adres as string) || "",
        openingstijden: (kp.openingstijden as string) || "",
      },
      merk,
      teksten: (kp.teksten ?? {}),
      reparatie: {
        nr: rep.nr,
        toestel: rep.toestel ?? "",
        type: rep.type ?? "",
        status: rep.status ?? "aangemeld",
        aangemeld: rep.t ?? null,
        ophaal: rep.ophaal ?? "",
        verwachteLevering: rep.besteldOp ?? null,
        moetInleveren: rep.inleveren === true,
        klantVoornaam: String(rep.klant && (rep.klant as Record<string, string>).naam || "").split(" ")[0],
      },
      tijdlijn,
      notities,
    };

    return new Response(JSON.stringify(antwoord), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Er ging iets mis." }), { status: 500, headers: cors });
  }
});
