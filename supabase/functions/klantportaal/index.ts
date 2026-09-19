// Het klantportaal: inloglinks en uitnodigingen.
//
// Waarom een eigen functie en niet signInWithOtp in de browser:
// 1. Dan kan iedereen met een willekeurig e-mailadres een Supabase-account aanmaken.
//    Hier krijgt alleen een bekende, actieve portaalgebruiker een link.
// 2. De standaardmail van Supabase is die van Storvo. De klant van de winkel hoort een
//    mail te krijgen in de huisstijl van de winkel (bijv. Reloop it), niet van Storvo.
//
// Openbaar (verify_jwt uit): de actie 'inloglink' heeft geen login nodig. 'uitnodigen'
// controleert zelf wie er belt: eigenaar/beheerder van de winkel, of een beheerder
// van de organisatie in het portaal. 'account_aanmaken' zet het wachtwoord van de
// ingelogde portaalgebruiker (na de uitnodigingslink of 'wachtwoord vergeten').
// 'melding' mailt bij een nieuwe aanmelding (naar de winkel, plus een bevestiging aan
// de klant) en bij elke stap (naar de beheerders van de organisatie). Wat al verstuurd
// is staat in klantportaal_meldingen: nooit twee keer dezelfde mail.
// 'bod' (openbaar) geeft een prijsindicatie voor een lijst apparaten, 'aanbieden'
// (openbaar) slaat een aanbieding van de website op en mailt winkel en klant.
//
// Geheimen: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, RESEND_API_KEY,
// APP_URL (standaard https://storvo.app), RESEND_FROM (reserve-afzender).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP_URL = (Deno.env.get("APP_URL") || "https://storvo.app").replace(/\/$/, "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const antwoord = (lijf: unknown, code = 200) => new Response(JSON.stringify(lijf), { status: code, headers: cors });
const fout = (bericht: string, code = 400) => antwoord({ ok: false, error: bericht }, code);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const schoon = (s: unknown, max = 200) => String(s ?? "").trim().slice(0, max);
/* ilike zonder jokers: _ en % in een e-mailadres mogen niet als wildcard werken. */
const letterlijk = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);
const html = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

type Instellingen = {
  team_id: string; merknaam: string; logo_url: string | null; kleur: string; accent: string; inkt: string;
  contact_email: string | null; contact_telefoon: string | null; domein: string | null; afzender: string | null; actief: boolean;
  bod_pct?: Record<string, number[]> | null;
};

async function instellingenVan(team_id: string): Promise<Instellingen | null> {
  const { data } = await admin.from("klantportaal_instellingen").select("*").eq("team_id", team_id).maybeSingle();
  return data && data.actief ? data as Instellingen : null;
}

/* Waar de link naartoe gaat. Het eigen domein als dat er is, anders de Storvo-route met
   de slug van de winkel. Een adres dat de browser meestuurt nemen we NIET over: dan kon
   iemand een inloglink naar zijn eigen site laten wijzen. */
async function portaalAdres(ins: Instellingen) {
  // Direct naar /klantportaal: de voorpagina van het domein is de Storvo-site.
  if (ins.domein) return "https://" + ins.domein.replace(/^https?:\/\//, "").replace(/\/.*$/, "") + "/klantportaal";
  const { data: k } = await admin.from("klanten").select("slug").eq("id", ins.team_id).maybeSingle();
  return APP_URL + "/klantportaal/?w=" + encodeURIComponent(k?.slug || "");
}
const metStap = (url: string, stap: string) => url + (url.includes("?") ? "&" : "?") + "stap=" + stap;
const LINKVOET = "De link werkt één keer en is een uur geldig. Heb je dit niet aangevraagd, dan kun je deze mail negeren.";

function mailHtml(ins: Instellingen, kop: string, tekst: string, knop: string, url: string, voet = LINKVOET) {
  const merk = html(ins.merknaam);
  const kleur = /^#[0-9a-f]{3,8}$/i.test(ins.kleur) ? ins.kleur : "#0F6B4B";
  const accent = /^#[0-9a-f]{3,8}$/i.test(ins.accent) ? ins.accent : "#C6F36B";
  const inkt = /^#[0-9a-f]{3,8}$/i.test(ins.inkt) ? ins.inkt : "#10231B";
  const logo = ins.logo_url && /^https:\/\//.test(ins.logo_url)
    ? `<img src="${html(ins.logo_url)}" alt="${merk}" height="32" style="height:32px;display:block;margin-bottom:22px">`
    : `<div style="font-size:22px;font-weight:800;color:${kleur};margin-bottom:22px">${merk}</div>`;
  const contact = [ins.contact_telefoon, ins.contact_email].filter(Boolean).map((x) => html(String(x))).join(" · ");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${inkt};max-width:520px;margin:0 auto;font-size:15px;line-height:1.6">`
    + logo
    + `<h1 style="font-size:22px;margin:0 0 12px">${html(kop)}</h1>`
    + `<p style="color:#475350;margin:0">${tekst}</p>`
    + `<p style="margin:26px 0"><a href="${html(url)}" style="display:inline-block;padding:13px 26px;background:${kleur};color:#fff;text-decoration:none;border-radius:100px;font-weight:700">${html(knop)}</a></p>`
    + `<p style="color:#8A938F;font-size:13px">${voet}</p>`
    + `<p style="color:#8A938F;font-size:12.5px;border-top:1px solid #ECEAE4;padding-top:12px;margin-top:22px">${merk}${contact ? " · " + contact : ""}`
    + `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${accent};margin-left:8px"></span></p></div>`;
}

async function verstuur(ins: Instellingen, naar: string, onderwerp: string, inhoud: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("E-mail is nog niet ingesteld.");
  const van = ins.afzender || `${ins.merknaam} <${Deno.env.get("RESEND_FROM_ADRES") || "portaal@storvo.app"}>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: van, to: [naar], subject: onderwerp, html: inhoud, reply_to: ins.contact_email || undefined }),
  });
  if (!res.ok) {
    const uit = await res.json().catch(() => ({}));
    throw new Error(uit?.message || `Resend gaf ${res.status}`);
  }
}

/* Een eenmalige inloglink. Bestaat de gebruiker nog niet in auth, dan maakt 'invite'
   hem aan; bestaat hij wel, dan geeft 'magiclink' een link en de user terug. */
async function maakLink(email: string, terug: string) {
  const eerst = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: terug } });
  if (!eerst.error && eerst.data?.properties?.action_link) return { link: eerst.data.properties.action_link, user: eerst.data.user };
  const nieuw = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: terug } });
  if (nieuw.error || !nieuw.data?.properties?.action_link) throw new Error(nieuw.error?.message || "Kon geen link maken");
  return { link: nieuw.data.properties.action_link, user: nieuw.data.user };
}

async function wieBelt(req: Request) {
  const bevoegd = req.headers.get("Authorization") || "";
  if (!bevoegd.startsWith("Bearer ")) return null;
  const klant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: bevoegd } } });
  const { data } = await klant.auth.getUser();
  return data?.user || null;
}

/* ═══ inloglink: openbaar ═══
   Antwoordt altijd hetzelfde, of het adres nu bekend is of niet. Anders kun je met
   deze functie uitzoeken wie er klant is. */
async function inloglink(lijf: any) {
  const email = schoon(lijf?.email, 320).toLowerCase();
  const neutraal = antwoord({ ok: true });
  const wachtwoord = lijf?.doel === "wachtwoord";
  if (!EMAIL.test(email)) return fout("Vul een geldig e-mailadres in.");

  let q = admin.from("klantportaal_instellingen").select("*").eq("actief", true);
  const domein = schoon(lijf?.domein, 200).toLowerCase();
  const slug = schoon(lijf?.slug, 100);
  let ins: Instellingen | null = null;
  if (domein) { const { data } = await q.ilike("domein", letterlijk(domein)).maybeSingle(); ins = data as Instellingen | null; }
  if (!ins && slug) {
    const { data: k } = await admin.from("klanten").select("id").eq("slug", slug).maybeSingle();
    if (k) ins = await instellingenVan(k.id);
  }
  if (!ins) return neutraal;

  const { data: gb } = await admin.from("klantportaal_gebruikers").select("user_id, naam, inloglink_op, actief")
    .eq("team_id", ins.team_id).eq("email", email).eq("actief", true).maybeSingle();
  if (!gb) return neutraal;
  // Hooguit één link per minuut per persoon.
  if (gb.inloglink_op && Date.now() - new Date(gb.inloglink_op).getTime() < 60_000) return neutraal;
  await admin.from("klantportaal_gebruikers").update({ inloglink_op: new Date().toISOString() }).eq("user_id", gb.user_id);

  try {
    const adres = await portaalAdres(ins);
    const { link } = await maakLink(email, wachtwoord ? metStap(adres, "wachtwoord") : adres);
    const hallo = `Hallo${gb.naam ? " " + html(gb.naam) : ""}, `;
    if (wachtwoord) {
      await verstuur(ins, email, `Nieuw wachtwoord voor ${ins.merknaam}`,
        mailHtml(ins, "Kies een nieuw wachtwoord", hallo + `klik op de knop en kies een nieuw wachtwoord voor je klantportaal van ${html(ins.merknaam)}.`, "Nieuw wachtwoord kiezen", link));
    } else {
      await verstuur(ins, email, `Inloggen bij ${ins.merknaam}`,
        mailHtml(ins, "Je inloglink", hallo + `klik op de knop om in je klantportaal van ${html(ins.merknaam)} te komen.`, "Inloggen", link));
    }
  } catch (e) {
    console.error("klantportaal inloglink:", e);
  }
  return neutraal;
}

/* ═══ uitnodigen: winkel of beheerder van de organisatie ═══ */
async function uitnodigen(req: Request, lijf: any) {
  const user = await wieBelt(req);
  if (!user) return fout("Niet ingelogd", 401);

  const email = schoon(lijf?.email, 320).toLowerCase();
  const naam = schoon(lijf?.naam, 120) || null;
  const rol = lijf?.rol === "beheerder" ? "beheerder" : "lezer";
  if (!EMAIL.test(email)) return fout("Vul een geldig e-mailadres in.");

  // Wie belt er: iemand van de winkel, of een beheerder in het portaal?
  const { data: acc } = await admin.from("accounts").select("id, team_id, rol").eq("id", user.id).maybeSingle();
  let organisatie_id = schoon(lijf?.organisatie_id, 40);
  let team_id: string;
  if (acc?.team_id && ["eigenaar", "beheerder"].includes(acc.rol)) {
    const { data: org } = await admin.from("klantportaal_organisaties").select("id, team_id").eq("id", organisatie_id).maybeSingle();
    if (!org || org.team_id !== acc.team_id) return fout("Deze organisatie hoort niet bij jouw winkel", 403);
    team_id = org.team_id;
  } else {
    const { data: ik } = await admin.from("klantportaal_gebruikers").select("organisatie_id, team_id, rol, actief").eq("user_id", user.id).maybeSingle();
    if (!ik || !ik.actief || ik.rol !== "beheerder") return fout("Alleen een beheerder mag collega's uitnodigen", 403);
    organisatie_id = ik.organisatie_id;
    team_id = ik.team_id;
  }

  const ins = await instellingenVan(team_id);
  if (!ins) return fout("Het klantportaal staat uit voor deze winkel", 409);

  /* Een medewerker van een winkel mag geen portaalgebruiker worden met hetzelfde adres:
     dan zou één login twee heel verschillende rechten hebben. */
  const { data: isMedewerker } = await admin.from("accounts").select("id").ilike("email", letterlijk(email)).limit(1).maybeSingle();
  if (isMedewerker) return fout("Dit e-mailadres is al een Storvo-account. Gebruik een ander adres.", 409);

  let link: string, uid: string;
  try {
    const r = await maakLink(email, metStap(await portaalAdres(ins), "account"));
    link = r.link; uid = r.user!.id;
  } catch (e) {
    console.error("klantportaal uitnodigen:", e);
    return fout("Kon geen uitnodiging maken. Probeer het opnieuw.", 500);
  }

  const { data: bestaand } = await admin.from("klantportaal_gebruikers").select("organisatie_id, actief").eq("user_id", uid).maybeSingle();
  if (bestaand && bestaand.organisatie_id !== organisatie_id) return fout("Dit e-mailadres hoort al bij een andere organisatie.", 409);
  const { error } = await admin.from("klantportaal_gebruikers").upsert({
    user_id: uid, organisatie_id, team_id, email, naam, rol, actief: true, uitgenodigd_op: new Date().toISOString(),
  });
  if (error) { console.error(error); return fout("Opslaan mislukt", 500); }

  const { data: org } = await admin.from("klantportaal_organisaties").select("naam").eq("id", organisatie_id).maybeSingle();
  try {
    await verstuur(ins, email, `Je klantportaal bij ${ins.merknaam}`,
      mailHtml(ins, "Welkom in je klantportaal",
        `Je bent uitgenodigd voor het klantportaal van <strong>${html(org?.naam || "je organisatie")}</strong> bij ${html(ins.merknaam)}. `
        + `Daar volg je elke partij: ophaling, wissen, testen en betaling, met alle certificaten en rapporten. `
        + `Klik op de knop en kies een wachtwoord, dan is je account klaar.`,
        "Account aanmaken", link,
        "De link werkt één keer en is een uur geldig. Verlopen? Vraag je contactpersoon om een nieuwe uitnodiging."));
  } catch (e) {
    return fout(String((e as Error).message || e), 502);
  }
  return antwoord({ ok: true });
}

/* ═══ account_aanmaken: de ingelogde portaalgebruiker kiest zijn wachtwoord ═══
   Na de uitnodigingslink (eerste keer: dan volgt een welkomstmail met waar je
   inlogt) of na 'wachtwoord vergeten' (dan alleen opslaan). */
async function accountAanmaken(req: Request, lijf: any) {
  const user = await wieBelt(req);
  if (!user) return fout("Niet ingelogd", 401);
  const ww = String(lijf?.wachtwoord ?? "");
  if (ww.length < 8) return fout("Kies een wachtwoord van minstens 8 tekens.");
  if (ww.length > 72) return fout("Dit wachtwoord is te lang.");
  const naam = schoon(lijf?.naam, 120);

  const { data: gb } = await admin.from("klantportaal_gebruikers")
    .select("user_id, team_id, email, naam, actief, account_op").eq("user_id", user.id).maybeSingle();
  if (!gb || !gb.actief) return fout("Je hebt geen toegang tot het klantportaal", 403);
  const ins = await instellingenVan(gb.team_id);
  if (!ins) return fout("Het klantportaal staat uit", 409);

  const { error: wwFout } = await admin.auth.admin.updateUserById(user.id, { password: ww });
  if (wwFout) {
    console.error("klantportaal wachtwoord:", wwFout);
    return fout(/weak|pwned|short/i.test(wwFout.message) ? "Dit wachtwoord is te zwak. Kies een langer of ander wachtwoord." : "Opslaan lukte niet. Probeer het opnieuw.", 400);
  }
  const eerste = !gb.account_op;
  const wijziging: Record<string, unknown> = {};
  if (eerste) wijziging.account_op = new Date().toISOString();
  if (naam) wijziging.naam = naam;
  if (Object.keys(wijziging).length) await admin.from("klantportaal_gebruikers").update(wijziging).eq("user_id", user.id);

  if (eerste) {
    const adres = await portaalAdres(ins);
    const zichtbaar = adres.replace(/^https:\/\//, "").replace(/\/klantportaal$/, "");
    try {
      await verstuur(ins, gb.email, `Je account bij ${ins.merknaam} is klaar`,
        mailHtml(ins, "Je account is klaar",
          `Hallo${(naam || gb.naam) ? " " + html(naam || gb.naam) : ""}, je account voor het klantportaal van ${html(ins.merknaam)} is aangemaakt. `
          + `Voortaan log je in op <a href="${html(adres)}" style="color:#0F6B4B;font-weight:700">${html(zichtbaar)}</a> `
          + `met je e-mailadres <strong>${html(gb.email)}</strong> en het wachtwoord dat je net hebt gekozen. `
          + `Bewaar deze mail, dan weet je altijd waar je moet zijn.`,
          "Naar het klantportaal", metStap(adres, "inloggen") + "&email=" + encodeURIComponent(gb.email),
          "Wachtwoord vergeten? Klik op de inlogpagina op 'Wachtwoord vergeten', dan krijg je een link om een nieuw wachtwoord te kiezen."));
    } catch (e) {
      console.error("klantportaal welkomstmail:", e);
    }
  }
  return antwoord({ ok: true, eerste });
}

/* ═══ melding: mail bij een aanmelding of een nieuwe stap ═══
   De inhoud komt altijd uit de database, nooit uit het verzoek. */
const STAPMAIL: Record<string, { veld: string | null; onderwerp: string; kop: string; tekst: string; docs: string[] }> = {
  aangenomen: { veld: null, onderwerp: "staat in het portaal", kop: "Je partij staat in het portaal",
    tekst: "We hebben je partij in behandeling genomen. In het klantportaal zie je steeds hoe ver we zijn. We plannen nu de ophaling.", docs: [] },
  opgehaald: { veld: "opgehaald_op", onderwerp: "is opgehaald", kop: "Je partij is opgehaald",
    tekst: "We hebben je apparaten opgehaald. Ze gaan nu naar onze werkplaats om gewist te worden.", docs: ["Ophaalbon", "Apparatenlijst"] },
  gewist: { veld: "gewist_op", onderwerp: "is gewist", kop: "Alle data is gewist",
    tekst: "De data op je apparaten is gecertificeerd gewist. Per serienummer staat vast hoe.", docs: ["Wiscertificaat"] },
  getest: { veld: "getest_op", onderwerp: "is getest", kop: "Je apparaten zijn getest",
    tekst: "Alles is getest en beoordeeld. Per apparaat zie je of het een tweede leven krijgt of gerecycled wordt.", docs: ["Verwerkingsrapport"] },
  afgerond: { veld: "afgerond_op", onderwerp: "is afgerond", kop: "Je partij is afgerond",
    tekst: "Alles is verwerkt en afgerond. Dank je wel dat je je IT een tweede leven geeft.", docs: ["Impactrapport"] },
};

async function melding(req: Request, lijf: any) {
  const user = await wieBelt(req);
  if (!user) return fout("Niet ingelogd", 401);
  const soort = schoon(lijf?.soort, 20);
  const id = schoon(lijf?.opdracht_id, 40);
  if (soort !== "aanvraag" && !STAPMAIL[soort]) return fout("Onbekende melding");

  const { data: o } = await admin.from("klantportaal_opdrachten").select("*").eq("id", id).maybeSingle();
  if (!o) return fout("Opdracht niet gevonden", 404);
  const ins = await instellingenVan(o.team_id);
  if (!ins) return antwoord({ ok: true, verstuurd: 0 });

  // Mag deze beller dit melden? Aanvraag: iemand van die organisatie. Stap: iemand van de winkel.
  if (soort === "aanvraag") {
    const { data: ik } = await admin.from("klantportaal_gebruikers").select("organisatie_id, actief").eq("user_id", user.id).maybeSingle();
    if (!ik || !ik.actief || ik.organisatie_id !== o.organisatie_id) return fout("Geen toegang", 403);
    if (o.status !== "aanvraag") return antwoord({ ok: true, verstuurd: 0 });
  } else {
    const { data: acc } = await admin.from("accounts").select("team_id").eq("id", user.id).maybeSingle();
    if (!acc || acc.team_id !== o.team_id) return fout("Geen toegang", 403);
    const st = STAPMAIL[soort];
    if (o.status !== "actief" || (st.veld && !o[st.veld])) return antwoord({ ok: true, verstuurd: 0 });
  }

  // Al eens verstuurd? Dan niet nog een keer.
  const { data: nieuw } = await admin.from("klantportaal_meldingen")
    .upsert({ opdracht_id: o.id, soort, team_id: o.team_id }, { onConflict: "opdracht_id,soort", ignoreDuplicates: true })
    .select("opdracht_id");
  if (!nieuw || !nieuw.length) return antwoord({ ok: true, verstuurd: 0, al: true });

  const { data: org } = await admin.from("klantportaal_organisaties").select("naam").eq("id", o.organisatie_id).maybeSingle();
  const orgNaam = org?.naam || "je organisatie";
  const adres = await portaalAdres(ins);
  const partij = `${o.nummer ? o.nummer + " · " : ""}${o.titel || "Partij"}`;
  let verstuurd = 0;
  try {
    if (soort === "aanvraag") {
      // 1. De winkel: er is een nieuwe partij aangemeld.
      let winkel = ins.contact_email;
      if (!winkel) {
        const { data: eig } = await admin.from("accounts").select("email").eq("team_id", o.team_id).eq("rol", "eigenaar").limit(1).maybeSingle();
        winkel = eig?.email || null;
      }
      const regels = [
        ["Organisatie", orgNaam], ["Wat", o.omschrijving || o.titel], ["Aantal", o.aantal_verwacht != null ? String(o.aantal_verwacht) : ""],
        ["Ophaaladres", o.ophaaladres || ""], ["Wanneer", (o.gepland || "").replace(/^Gewenst: /, "")], ["Aangemeld door", user.email || ""],
      ].filter(([, w]) => w).map(([k, w]) => `<tr><td style="padding:4px 14px 4px 0;color:#8A938F;vertical-align:top">${html(k)}</td><td style="padding:4px 0">${html(String(w))}</td></tr>`).join("");
      if (winkel) {
        await verstuur(ins, winkel, `Nieuwe aanmelding van ${orgNaam}`,
          mailHtml(ins, "Nieuwe partij aangemeld", `${html(orgNaam)} heeft een partij aangemeld in het klantportaal.`
            + `<table style="margin-top:14px;font-size:14px;border-collapse:collapse">${regels}</table>`,
            "Bekijk de aanvraag", APP_URL + "/portaalbeheer/", "Neem de aanvraag aan of wijs hem af in portaalbeheer."));
        verstuurd++;
      }
      // 2. De klant: bevestiging.
      if (user.email) {
        await verstuur(ins, user.email, `We hebben je aanmelding ontvangen`,
          mailHtml(ins, "Aanmelding ontvangen", `Bedankt! We hebben je partij ontvangen: <strong>${html(o.titel || "")}</strong>. `
            + `Je krijgt binnen twee werkdagen een indicatief bod. Daarna plannen we de ophaling.`,
            "Naar het klantportaal", adres, `Je krijgt deze mail omdat je een partij hebt aangemeld voor ${html(orgNaam)}.`));
        verstuurd++;
      }
    } else {
      // Alle actieve beheerders van de organisatie.
      const st = STAPMAIL[soort];
      const { data: ontv } = await admin.from("klantportaal_gebruikers").select("email, naam")
        .eq("organisatie_id", o.organisatie_id).eq("actief", true).eq("rol", "beheerder");
      const docs = st.docs.length
        ? `<br><br><strong>Klaar om te downloaden:</strong> ${st.docs.map(html).join(", ")}.` : "";
      for (const g of ontv || []) {
        await verstuur(ins, g.email, `${partij} ${st.onderwerp}`,
          mailHtml(ins, st.kop, `Hallo${g.naam ? " " + html(g.naam) : ""}, een update over <strong>${html(partij)}</strong>. ${st.tekst}${docs}`,
            "Bekijk in het klantportaal", adres,
            `Je krijgt deze mail omdat je beheerder bent van ${html(orgNaam)} in het klantportaal van ${html(ins.merknaam)}.`));
        verstuurd++;
      }
    }
  } catch (e) {
    console.error("klantportaal melding:", e);
    // Niets (goed) verstuurd: weghalen, zodat het later opnieuw kan.
    if (!verstuurd) await admin.from("klantportaal_meldingen").delete().eq("opdracht_id", o.id).eq("soort", soort);
    return fout("Mail versturen lukte niet", 502);
  }
  await admin.from("klantportaal_meldingen").update({ aantal: verstuurd }).eq("opdracht_id", o.id).eq("soort", soort);
  return antwoord({ ok: true, verstuurd });
}

/* ═══ slim bod ═══
   Per regel (soort, model, specs, aantal, staat):
   1. Staat het model in onze eigen voorraad (hardware.verkoop), dan geldt ONZE
      verkoopprijs. Die gaat altijd voor.
   2. Anders een schatting van de Nederlandse refurbished-markt (Claude), 30 dagen bewaard.
   Het bod is een percentage van die doorverkoopwaarde: laptops, telefoons en tablets
   standaard 60%, de rest 70–80% (in te stellen in portaalbeheer), keer de staat. */
const MOBIEL = new Set(["laptop", "telefoon", "tablet"]);
const SOORTEN = ["laptop", "telefoon", "tablet", "desktop", "monitor", "server", "netwerk", "overig"];
const STAATFACTOR: Record<string, number> = { goed: 1, sporen: 0.8, defect: 0.25 };
const STAATTEKST: Record<string, string> = { goed: "werkt, nette staat", sporen: "werkt, flinke gebruikssporen", defect: "defect of onbekend" };
const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const rond5 = (n: number) => Math.max(0, Math.floor(n / 5) * 5);

type Regel = { soort: string; model: string; specs: string; aantal: number; staat: string };
function leesRegels(lijst: any): Regel[] {
  if (!Array.isArray(lijst)) return [];
  return lijst.slice(0, 25).map((r: any) => ({
    soort: SOORTEN.includes(String(r?.soort)) ? String(r.soort) : "overig",
    model: schoon(r?.model, 120),
    specs: schoon(r?.specs, 200),
    aantal: Math.max(1, Math.min(10000, Math.floor(Number(r?.aantal) || 1))),
    staat: STAATFACTOR[String(r?.staat)] != null ? String(r.staat) : "goed",
  })).filter((r) => r.model.length >= 2);
}

async function instellingenOpAdres(lijf: any): Promise<Instellingen | null> {
  const domein = schoon(lijf?.domein, 200).toLowerCase().replace(/^www\./, "");
  const slug = schoon(lijf?.slug, 100);
  if (slug) {
    const { data: k } = await admin.from("klanten").select("id").eq("slug", slug).maybeSingle();
    if (k) { const i = await instellingenVan(k.id); if (i) return i; }
  }
  if (domein) {
    // portaal.reloopit.nl of de winkel zelf (reloopit.nl, www.reloopit.nl): allebei goed.
    const basis = (d: string) => d.split(".").slice(-2).join(".");
    const { data } = await admin.from("klantportaal_instellingen").select("*").eq("actief", true);
    const hit = (data || []).find((i: any) => i.domein && basis(String(i.domein).toLowerCase()) === basis(domein));
    if (hit) return hit as Instellingen;
  }
  return null;
}

let eigenCache: { team: string; tijd: number; rijen: any[] } | null = null;
async function eigenPrijzen(team_id: string) {
  if (eigenCache && eigenCache.team === team_id && Date.now() - eigenCache.tijd < 5 * 60_000) return eigenCache.rijen;
  const { data } = await admin.from("hardware").select("merk, model, specs, verkoop, status")
    .eq("team_id", team_id).gt("verkoop", 0).limit(5000);
  eigenCache = { team: team_id, tijd: Date.now(), rijen: data || [] };
  return eigenCache.rijen;
}
function eigenVoor(rijen: any[], r: Regel) {
  const invoer = " " + norm(r.model + " " + r.specs) + " ";
  const hits = rijen.filter((h) => {
    const m = norm(h.model);
    if (m.length < 3 || !invoer.includes(" " + m + " ")) return false;
    const merk = norm(h.merk);
    return !merk || invoer.includes(" " + merk + " ") || m.length >= 6;
  });
  if (!hits.length) return null;
  // Zelfde geheugen/opslag telt zwaarder, als de klant die noemde.
  const getallen = (t: string) => (norm(t).match(/\b\d{2,4}\s?(gb|tb)\b/g) || []).map((x) => x.replace(/\s/g, ""));
  const gevraagd = getallen(r.specs + " " + r.model);
  let beste = hits;
  if (gevraagd.length) {
    const passend = hits.filter((h) => {
      const g = getallen(Object.values(h.specs || {}).join(" "));
      return gevraagd.every((x) => g.includes(x));
    });
    if (passend.length) beste = passend;
  }
  const verkocht = beste.filter((h) => h.status === "verkocht");
  const lijst = (verkocht.length ? verkocht : beste).map((h) => Number(h.verkoop)).sort((a, b) => a - b);
  return { laag: lijst[0], advies: lijst[Math.floor(lijst.length / 2)], hoog: lijst[lijst.length - 1], aantal: lijst.length };
}

async function marktVoor(team_id: string, r: Regel, magAI: () => boolean) {
  const sleutel = norm(`${r.soort} ${r.model} ${r.specs}`).slice(0, 300);
  const { data: c } = await admin.from("klantportaal_prijscache").select("*").eq("team_id", team_id).eq("sleutel", sleutel).maybeSingle();
  if (c && Date.now() - new Date(c.gemaakt_op).getTime() < 30 * 86400_000) {
    return c.advies ? { laag: Number(c.laag), advies: Number(c.advies), hoog: Number(c.hoog), uitleg: c.uitleg } : null;
  }
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key || !magAI()) return undefined; // undefined = nog niet bekend
  const prompt = `Wat is een reële verkoopprijs voor dit gerefurbishte apparaat op de Nederlandse markt?

Soort: ${r.soort}
Model: ${r.model}
Specificaties: ${r.specs || "niet opgegeven, neem de meest gangbare uitvoering"}
Staat: gebruikt, gewist, getest en nagekeken (grade B), met garantie

Denk aan wat vergelijkbare toestellen kosten bij Back Market, Refurbed, Computerzaak en
soortgelijke aanbieders, inclusief btw. Een oud model is minder waard dan een nieuw
model, ook met veel geheugen. Is dit geen bestaand apparaat, of weet je het echt niet,
geef dan null in plaats van een verzonnen getal.

Antwoord uitsluitend met JSON:
{"laag": 249, "advies": 299, "hoog": 349, "uitleg": "één korte zin"}`;
  let uit: any = null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001", max_tokens: 300,
        messages: [{ role: "user", content: prompt }] }),
    });
    const j = await res.json();
    if (res.ok) {
      const tekst = (j?.content || []).map((c: any) => c.text || "").join("");
      const m = tekst.match(/\{[\s\S]*\}/);
      if (m) {
        const o = JSON.parse(m[0]);
        const g = (w: any) => (typeof w === "number" && w > 0 && w < 50000) ? Math.round(w) : null;
        if (g(o.advies)) uit = { laag: g(o.laag) || g(o.advies), advies: g(o.advies), hoog: g(o.hoog) || g(o.advies), uitleg: String(o.uitleg || "").slice(0, 200) };
      }
    } else {
      console.error("bod markt:", j?.error?.message || res.status);
      return undefined;
    }
  } catch (e) {
    console.error("bod markt:", e);
    return undefined;
  }
  await admin.from("klantportaal_prijscache").upsert({ team_id, sleutel, laag: uit?.laag ?? null, advies: uit?.advies ?? null,
    hoog: uit?.hoog ?? null, uitleg: uit?.uitleg ?? null, gemaakt_op: new Date().toISOString() });
  return uit;
}

async function berekenBod(ins: Instellingen, regels: Regel[]) {
  const pct = { mobiel: [60, 60], overig: [70, 80], ...(ins.bod_pct || {}) } as Record<string, number[]>;
  const eigen = await eigenPrijzen(ins.team_id);
  // Hoeveel nieuwe AI-schattingen mogen er vandaag nog? Beschermt tegen misbruik.
  const { count } = await admin.from("klantportaal_prijscache").select("sleutel", { count: "exact", head: true })
    .eq("team_id", ins.team_id).gte("gemaakt_op", new Date(Date.now() - 86400_000).toISOString());
  let ruimte = Math.max(0, 400 - (count || 0));
  let perVerzoek = 8;
  const magAI = () => (ruimte-- > 0 && perVerzoek-- > 0);

  const uit = [];
  let totMin = 0, totMax = 0, open = 0;
  for (const r of regels) {
    const e = eigenVoor(eigen, r);
    const markt = e ? null : await marktVoor(ins.team_id, r, magAI);
    const waarde = e || markt;
    const [pMin, pMax] = (pct[MOBIEL.has(r.soort) ? "mobiel" : "overig"] || [60, 60]).map((x) => Math.max(0, Math.min(100, Number(x) || 0)) / 100);
    const f = STAATFACTOR[r.staat];
    let stukMin = null, stukMax = null;
    if (waarde) {
      stukMin = rond5(waarde.laag * pMin * f);
      stukMax = Math.max(stukMin, rond5(waarde.hoog * pMax * f));
      totMin += stukMin * r.aantal; totMax += stukMax * r.aantal;
    } else open++;
    uit.push({ ...r, bron: e ? "voorraad" : markt ? "markt" : "onbekend",
      waarde: waarde ? { laag: waarde.laag, advies: waarde.advies, hoog: waarde.hoog } : null,
      per_stuk: stukMin != null ? { min: stukMin, max: stukMax } : null,
      totaal: stukMin != null ? { min: stukMin * r.aantal, max: stukMax! * r.aantal } : null });
  }
  return { regels: uit, totaal: { min: totMin, max: totMax }, open };
}

async function bod(lijf: any) {
  const ins = await instellingenOpAdres(lijf);
  if (!ins) return fout("Aanbieden is hier nog niet ingesteld", 404);
  const regels = leesRegels(lijf?.regels);
  if (!regels.length) return fout("Vul minstens één model in.");
  const b = await berekenBod(ins, regels);
  // De waarde zelf laten we de klant niet zien, alleen het bod.
  return antwoord({ ok: true, ...b, regels: b.regels.map(({ waarde: _w, ...r }) => r) });
}

async function aanbieden(lijf: any) {
  if (schoon(lijf?.website, 200)) return antwoord({ ok: true }); // honingpot: een bot vult dit in
  const ins = await instellingenOpAdres(lijf);
  if (!ins) return fout("Aanbieden is hier nog niet ingesteld", 404);
  const email = schoon(lijf?.email, 320).toLowerCase();
  const bedrijf = schoon(lijf?.bedrijf, 160), naam = schoon(lijf?.naam, 120);
  if (!bedrijf) return fout("Vul je bedrijfsnaam in.");
  if (!EMAIL.test(email)) return fout("Vul een geldig e-mailadres in.");
  const regels = leesRegels(lijf?.regels);
  const opmerking = schoon(lijf?.opmerking, 2000);
  if (!regels.length && !opmerking) return fout("Vertel ons wat je wilt aanbieden.");

  // Dubbel klikken of twee keer versturen: niet twee aanbiedingen.
  const { data: kort } = await admin.from("klantportaal_aanbiedingen").select("id").eq("team_id", ins.team_id).eq("email", email)
    .gte("aangemaakt_op", new Date(Date.now() - 2 * 60_000).toISOString()).limit(1);
  if (kort && kort.length) return antwoord({ ok: true });

  const b = regels.length ? await berekenBod(ins, regels) : { regels: [], totaal: { min: 0, max: 0 }, open: 0 };
  const rij = {
    team_id: ins.team_id, bedrijf, naam: naam || null, email, telefoon: schoon(lijf?.telefoon, 40) || null,
    ophaaladres: schoon(lijf?.ophaaladres, 300) || null, periode: schoon(lijf?.periode, 120) || null,
    dataverwijdering: schoon(lijf?.dataverwijdering, 60) || null, opmerking: opmerking || null,
    regels: b.regels, bod_min: b.totaal.max ? b.totaal.min : null, bod_max: b.totaal.max || null,
  };
  const { error } = await admin.from("klantportaal_aanbiedingen").insert(rij);
  if (error) { console.error("aanbieden:", error); return fout("Opslaan lukte niet. Probeer het opnieuw.", 500); }

  const euro = (n: number) => "€ " + Math.round(n).toLocaleString("nl-NL");
  const bodTekst = b.totaal.max ? (b.totaal.min === b.totaal.max ? euro(b.totaal.max) : `${euro(b.totaal.min)} – ${euro(b.totaal.max)}`) : "";
  const tabel = (metBron: boolean) => `<table style="margin-top:14px;font-size:14px;border-collapse:collapse;width:100%">`
    + b.regels.map((r: any) => `<tr><td style="padding:6px 10px 6px 0;border-bottom:1px solid #ECEAE4">${r.aantal}× <strong>${html(r.model)}</strong>`
      + `${r.specs ? "<br><span style=\"color:#8A938F\">" + html(r.specs) + "</span>" : ""}<br><span style="color:#8A938F">${html(STAATTEKST[r.staat])}</span></td>`
      + `<td style="padding:6px 0;border-bottom:1px solid #ECEAE4;text-align:right;white-space:nowrap">${r.per_stuk ? (r.per_stuk.min === r.per_stuk.max ? euro(r.per_stuk.max) : euro(r.per_stuk.min) + " – " + euro(r.per_stuk.max)) + " p/st" : "volgt"}`
      + `${metBron ? "<br><span style=\"color:#8A938F;font-size:12px\">" + (r.bron === "voorraad" ? "onze verkoopprijs" : r.bron === "markt" ? "marktschatting" : "onbekend") + (r.waarde ? " · waarde " + euro(r.waarde.advies) : "") + "</span>" : ""}</td></tr>`).join("")
    + `</table>`;
  const details = [["Bedrijf", bedrijf], ["Contact", [naam, email, rij.telefoon].filter(Boolean).join(" · ")], ["Ophaaladres", rij.ophaaladres],
    ["Wanneer", rij.periode], ["Dataverwijdering", rij.dataverwijdering], ["Opmerking", rij.opmerking]]
    .filter(([, w]) => w).map(([k, w]) => `<tr><td style="padding:3px 14px 3px 0;color:#8A938F;vertical-align:top">${html(String(k))}</td><td style="padding:3px 0">${html(String(w))}</td></tr>`).join("");

  let winkel = ins.contact_email;
  if (!winkel) {
    const { data: eig } = await admin.from("accounts").select("email").eq("team_id", ins.team_id).eq("rol", "eigenaar").limit(1).maybeSingle();
    winkel = eig?.email || null;
  }
  try {
    if (winkel) await verstuur(ins, winkel, `Nieuwe aanbieding: ${bedrijf}${bodTekst ? " (" + bodTekst + ")" : ""}`,
      mailHtml(ins, "Nieuwe partij aangeboden", `${html(bedrijf)} biedt via de website een partij aan${bodTekst ? `. Indicatief bod: <strong>${bodTekst}</strong>` : ""}.`
        + (b.regels.length ? tabel(true) : "") + `<table style="margin-top:14px;font-size:14px;border-collapse:collapse">${details}</table>`,
        "Bekijk in portaalbeheer", APP_URL + "/portaalbeheer/", "Neem de aanbieding aan in portaalbeheer: dan wordt de klant uitgenodigd voor het klantportaal."));
    await verstuur(ins, email, `Je aanbod bij ${ins.merknaam} is ontvangen`,
      mailHtml(ins, "Bedankt voor je aanbod", `Hallo${naam ? " " + html(naam) : ""}, we hebben je aanbod ontvangen.`
        + (bodTekst ? ` Onze eerste indicatie voor de hele partij: <strong>${bodTekst}</strong>.` : "")
        + (b.regels.length ? tabel(false) : "")
        + `<br>We nemen binnen twee werkdagen contact met je op om de ophaling te plannen. Het definitieve bod volgt nadat we alles gewist en getest hebben.`,
        "Naar de website", ins.domein ? "https://" + String(ins.domein).split(".").slice(-2).join(".") : adresFallback(),
        `Je krijgt deze mail omdat je via de website van ${html(ins.merknaam)} een partij hebt aangeboden. Een indicatie is geen definitief bod.`));
  } catch (e) {
    console.error("aanbieden mail:", e);
  }
  return antwoord({ ok: true, totaal: b.totaal });
}
const adresFallback = () => APP_URL;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);
  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  if (lijf?.actie === "inloglink") return inloglink(lijf);
  if (lijf?.actie === "uitnodigen") return uitnodigen(req, lijf);
  if (lijf?.actie === "account_aanmaken") return accountAanmaken(req, lijf);
  if (lijf?.actie === "melding") return melding(req, lijf);
  if (lijf?.actie === "bod") return bod(lijf);
  if (lijf?.actie === "aanbieden") return aanbieden(lijf);
  return fout("Onbekende actie");
});
