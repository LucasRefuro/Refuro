// De inloggegevens voor de leveranciers (Foneday, Mobileparts) bewaren.
//
// Het wachtwoord stond vroeger in de winkeldata-blob (state.leveranciers) en ging zo
// leesbaar mee naar de cloud: iedereen in het team kon het uitlezen, en elke back-up
// had het in platte tekst. Nu komt het hier binnen, gaat het versleuteld (AES-GCM met
// KOPPELING_SLEUTEL, net als de webshoptokens) in leverancier_inloggegevens, en komt
// het nooit meer terug naar de browser. Die hoort alleen dát er een wachtwoord is.
//
// Er is nog geen code die er bij een leverancier mee inlogt. Komt die er, dan
// ontsleutelt die het hier op de server; geef het dan nog steeds niet terug.

import { admin, cors, fout, versleutel, wieBelt } from "../_gedeeld/shopify.ts";

const TABEL = "leverancier_inloggegevens";

/* Alleen leveranciers die we kennen. Anders kan iedereen met een inlog willekeurige
   rijen in de tabel zetten. Komt er een bij, dan ook in LV_VELDEN in de winkelapp. */
const LEVERANCIERS = ["foneday", "mobileparts"];
const MAX = 200;

function ok(data: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, ...data }), { headers: cors });
}

type Rij = { leverancier?: string; gebruiker?: string | null; wachtwoord_versleuteld?: string | null; bijgewerkt_op?: string | null };

/* Wat de browser te zien krijgt. Het versleutelde wachtwoord hoort hier niet bij:
   ook versleuteld heeft de browser er niets mee te zoeken. */
function zichtbaar(rij: Rij | null | undefined) {
  return {
    gebruiker: rij?.gebruiker || "",
    wachtwoord: !!rij?.wachtwoord_versleuteld,
    bijgewerkt_op: rij?.bijgewerkt_op || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const acc = await wieBelt(req);
  if (!acc) return fout("Niet ingelogd", 401);

  const body = await req.json().catch(() => ({}));
  const actie = String(body.actie || "");

  /* Wijzigen mag wie in de winkelapp bij de Instellingen kan, met dezelfde regel als
     mag('instellingen') daar: de eigenaar altijd, anders wint de eigen paginalijst
     van het account, en zonder lijst beslist de rol (beheerder wel, medewerker niet).
     Zonder deze controle kon iedereen in het team het wachtwoord vervangen. */
  async function magWijzigen() {
    if (acc!.rol === "eigenaar") return true;
    const { data } = await admin.from("accounts").select("tabs").eq("id", acc!.id).maybeSingle();
    const tabs = data?.tabs;
    if (Array.isArray(tabs)) return tabs.includes("instellingen");
    return acc!.rol === "beheerder";
  }

  async function alles() {
    const { data, error } = await admin.from(TABEL)
      .select("leverancier, gebruiker, wachtwoord_versleuteld, bijgewerkt_op")
      .eq("team_id", acc!.team_id);
    if (error) throw error;
    const uit: Record<string, ReturnType<typeof zichtbaar>> = {};
    for (const lv of LEVERANCIERS) uit[lv] = zichtbaar((data || []).find((r: Rij) => r.leverancier === lv));
    return uit;
  }

  try {
    if (actie === "status") {
      return ok({ leveranciers: await alles() });
    }

    if (actie === "opslaan" || actie === "wis") {
      if (!(await magWijzigen())) return fout("Alleen de eigenaar of een beheerder mag dit wijzigen.", 403);
      const lv = String(body.leverancier || "");
      if (!LEVERANCIERS.includes(lv)) return fout("Deze leverancier ken ik niet.");

      if (actie === "wis") {
        const { error } = await admin.from(TABEL).delete().eq("team_id", acc.team_id).eq("leverancier", lv);
        if (error) throw error;
        return ok({ inlog: zichtbaar(null) });
      }

      /* Een veld dat niet meekomt blijft zoals het was. Zo kan de app het e-mailadres
         opslaan zonder het wachtwoord te kennen, en andersom. Een leeg wachtwoord
         telt als "niet meegegeven": wissen gaat via 'wis'. */
      const gebruiker = body.gebruiker === undefined ? undefined : String(body.gebruiker || "").trim();
      const wachtwoord = typeof body.wachtwoord === "string" && body.wachtwoord !== "" ? body.wachtwoord : undefined;
      if ((gebruiker || "").length > MAX || (wachtwoord || "").length > MAX) return fout("Dat is te lang.");

      const { data: oud, error: leesFout } = await admin.from(TABEL)
        .select("gebruiker, wachtwoord_versleuteld").eq("team_id", acc.team_id).eq("leverancier", lv).maybeSingle();
      if (leesFout) throw leesFout;

      const nu = new Date().toISOString();
      const rij = {
        team_id: acc.team_id, leverancier: lv,
        gebruiker: gebruiker !== undefined ? (gebruiker || null) : (oud?.gebruiker ?? null),
        wachtwoord_versleuteld: wachtwoord !== undefined ? await versleutel(wachtwoord) : (oud?.wachtwoord_versleuteld ?? null),
        bijgewerkt_door: acc.id, bijgewerkt_op: nu,
      };
      if (!rij.gebruiker && !rij.wachtwoord_versleuteld) {
        if (oud) await admin.from(TABEL).delete().eq("team_id", acc.team_id).eq("leverancier", lv);
        return ok({ inlog: zichtbaar(null) });
      }
      const { error } = await admin.from(TABEL).upsert(rij, { onConflict: "team_id,leverancier" });
      if (error) throw error;
      return ok({ inlog: zichtbaar(rij) });
    }

    /* De eenmalige verhuizing uit de blob. Mag iedereen in het team, want hij vult
       alleen lege plekken en overschrijft nooit iets: een apparaat dat lang niet aan
       heeft gestaan, met een oud wachtwoord in zijn geheugen, mag een nieuwer
       wachtwoord van een collega niet terugdraaien. Twee apparaten tegelijk botsen
       niet: de insert slaat een bestaande rij over en de updates eisen een lege kolom. */
    if (actie === "overzetten") {
      const oud = (body.leveranciers && typeof body.leveranciers === "object") ? body.leveranciers : {};
      const nu = new Date().toISOString();
      for (const lv of LEVERANCIERS) {
        const g = String(oud[lv]?.user || "").trim();
        const w = typeof oud[lv]?.pass === "string" ? oud[lv].pass : "";
        const gOk = g && g.length <= MAX, wOk = w && w.length <= MAX;
        if (!gOk && !wOk) continue;
        const { error: e1 } = await admin.from(TABEL)
          .upsert({ team_id: acc.team_id, leverancier: lv, bijgewerkt_door: acc.id },
            { onConflict: "team_id,leverancier", ignoreDuplicates: true });
        if (e1) throw e1;
        if (gOk) {
          const { error } = await admin.from(TABEL).update({ gebruiker: g, bijgewerkt_op: nu })
            .eq("team_id", acc.team_id).eq("leverancier", lv).is("gebruiker", null);
          if (error) throw error;
        }
        if (wOk) {
          const { error } = await admin.from(TABEL).update({ wachtwoord_versleuteld: await versleutel(w), bijgewerkt_op: nu })
            .eq("team_id", acc.team_id).eq("leverancier", lv).is("wachtwoord_versleuteld", null);
          if (error) throw error;
        }
      }
      return ok({ leveranciers: await alles() });
    }

    return fout("Onbekende actie");
  } catch (e) {
    console.error("leveranciers", actie, e);
    return fout("Dat lukte niet. Probeer het zo nog eens.", 500);
  }
});
