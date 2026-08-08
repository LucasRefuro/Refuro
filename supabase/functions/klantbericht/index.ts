// Stuurt een statusbericht naar de klant: e-mail via Resend en WhatsApp via
// de Meta Cloud API.
//
// WhatsApp werkt in twee smaken en de winkel merkt daar niets van:
//   1. Standaard gaat alles uit via het zakelijke nummer van Storvo. De naam
//      van de winkel staat in het bericht. Dit werkt zonder enige instelling.
//   2. Heeft een winkel haar eigen nummer gekoppeld, dan gaat het bericht
//      daarvandaan uit. De klant ziet dan het nummer dat hij al kent.
//
// Twilio blijft bestaan voor winkels die daar ooit mee begonnen zijn.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const GRAAF = "https://graph.facebook.com/v21.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Namen van de door Meta goedgekeurde sjablonen, per stap.
// Alle vijf hebben dezelfde variabelen, in dezelfde volgorde:
//   {{1}} voornaam  {{2}} winkel  {{3}} toestel  {{4}} reparatienummer  {{5}} link
const WA_SJABLOON: Record<string, string> = {
  aangemeld: "storvo_aangemeld",
  inleveren: "storvo_inleveren",
  besteld: "storvo_besteld",
  binnen: "storvo_binnen",
  bezig: "storvo_bezig",
  klaar: "storvo_klaar",
};

const STANDAARD_ONDERWERP: Record<string, string> = {
  aangemeld: "We hebben je toestel in ontvangst genomen",
  inleveren: "Breng je toestel langs",
  besteld: "De onderdelen zijn besteld",
  binnen: "De onderdelen zijn binnen",
  bezig: "We zijn begonnen aan je reparatie",
  klaar: "Je toestel is klaar",
};

function velden(tekst: string, w: Record<string, string>) {
  return String(tekst || "").replace(/\{(\w+)\}/g, (_, k) => w[k] ?? "");
}

function mailHtml(
  merk: { naam: string; accent: string; logo?: string },
  kop: string,
  tekst: string,
  link: string,
) {
  const initiaal = (merk.naam || "?").charAt(0).toUpperCase();
  const logo = merk.logo
    ? `<img src="${merk.logo}" width="40" height="40" alt="" style="display:block;border-radius:10px;object-fit:cover">`
    : `<span style="font-family:'Sora','Segoe UI',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;color:#ffffff;line-height:40px;">${initiaal}</span>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F6F3;padding:40px 16px;font-family:'Instrument Sans','Segoe UI',Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;border-radius:24px;overflow:hidden;background-color:#ffffff;box-shadow:0 6px 24px rgba(23,32,30,0.07);">
      <tr><td style="padding:22px 32px;border-bottom:1.5px solid #ECEAE4;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td width="40" align="center" valign="middle" style="width:40px;height:40px;background-color:${merk.accent};border-radius:11px;">${logo}</td>
          <td style="padding-left:12px;font-family:'Sora','Segoe UI',Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;color:#17201E;">${merk.naam}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:34px 32px 36px;">
        <h1 style="margin:0 0 14px;font-family:'Sora','Segoe UI',Helvetica,Arial,sans-serif;font-size:24px;font-weight:800;line-height:1.25;color:#17201E;">${kop}</h1>
        <p style="margin:0 0 24px;font-size:15.5px;line-height:1.6;color:#475350;">${tekst}</p>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:${merk.accent};border-radius:100px;">
            <a href="${link}" style="display:inline-block;padding:14px 30px;font-family:'Instrument Sans','Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Bekijk de status</a>
          </td>
        </tr></table>
        <p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#8A938F;">Werkt de knop niet? Open deze link:<br>
          <a href="${link}" style="color:${merk.accent};word-break:break-all;">${link}</a></p>
      </td></tr>
    </table>
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
      <tr><td align="center" style="padding:22px 8px 0;font-size:12.5px;line-height:1.6;color:#8A938F;">
        ${merk.naam} volgt reparaties met <b>Storvo</b>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

async function stuurMail(naar: string, onderwerp: string, html: string, van: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { gelukt: false, fout: "E-mail is nog niet ingesteld." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: van, to: [naar], subject: onderwerp, html }),
    });
    const uit = await res.json();
    if (!res.ok) return { gelukt: false, fout: uit?.message || `Resend gaf ${res.status}` };
    return { gelukt: true, extern: uit?.id };
  } catch (e) {
    return { gelukt: false, fout: String((e as Error).message) };
  }
}

// Meta Cloud API: het sjabloon wordt op naam aangeroepen, met de variabelen
// op volgorde. De taal staat vast op Nederlands.
async function stuurWhatsAppMeta(
  naar: string,
  sjabloon: string,
  variabelen: string[],
  afz: { nummerId: string; token: string },
) {
  try {
    const res = await fetch(`${GRAAF}/${afz.nummerId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${afz.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: naar.replace(/^\+/, ""),
        type: "template",
        template: {
          name: sjabloon,
          language: { code: "nl" },
          components: [{
            type: "body",
            parameters: variabelen.map((v) => ({ type: "text", text: v })),
          }],
        },
      }),
    });
    const uit = await res.json();
    if (!res.ok) {
      const f = uit?.error;
      const m = f?.error_user_msg || f?.message || `Meta gaf ${res.status}`;
      return { gelukt: false, fout: m, code: f?.code };
    }
    return { gelukt: true, extern: uit?.messages?.[0]?.id };
  } catch (e) {
    return { gelukt: false, fout: String((e as Error).message) };
  }
}

// Twilio blijft mogelijk voor winkels die daar al mee werken.
async function stuurWhatsAppTwilio(
  naar: string,
  sjabloon: string,
  variabelen: string[],
  afz: { sid: string; token: string; van: string },
) {
  try {
    const body = new URLSearchParams();
    body.set("From", afz.van.startsWith("whatsapp:") ? afz.van : `whatsapp:${afz.van}`);
    body.set("To", `whatsapp:${naar}`);
    body.set("ContentSid", sjabloon);
    body.set(
      "ContentVariables",
      JSON.stringify(Object.fromEntries(variabelen.map((v, i) => [String(i + 1), v]))),
    );
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${afz.sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${afz.sid}:${afz.token}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const uit = await res.json();
    if (!res.ok) return { gelukt: false, fout: uit?.message || `Twilio gaf ${res.status}` };
    return { gelukt: true, extern: uit?.sid };
  } catch (e) {
    return { gelukt: false, fout: String((e as Error).message) };
  }
}

function telefoonInternationaal(nr: string) {
  const s = String(nr || "").replace(/[^0-9+]/g, "");
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return "+" + s.slice(2);
  if (s.startsWith("0")) return "+31" + s.slice(1);
  return "+" + s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Alleen POST" }), { status: 405, headers: cors });
  }

  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Niet ingelogd." }), { status: 401, headers: cors });
    }
    const { data: profiel } = await admin.from("accounts").select("team_id").eq("id", user.id).maybeSingle();
    if (!profiel) {
      return new Response(JSON.stringify({ error: "Geen winkel gevonden." }), { status: 403, headers: cors });
    }
    const team = profiel.team_id as string;

    const {
      reparatie_nr, status, naar_email, naar_telefoon,
      klantnaam, toestel, tekst, onderwerp, kanalen,
    } = await req.json();
    if (!reparatie_nr || !status) {
      return new Response(JSON.stringify({ error: "Onvolledige opdracht." }), { status: 400, headers: cors });
    }

    const { data: winkel } = await admin.from("klanten").select("naam, slug").eq("id", team).maybeSingle();
    const { data: rij } = await admin.from("winkeldata").select("data").eq("team_id", team).maybeSingle();
    const doc = (rij?.data ?? {}) as Record<string, any>;
    const inst = (doc.instellingen ?? {}) as Record<string, string>;
    const hs = (doc.huisstijl ?? {}) as Record<string, string>;
    const kp = (doc.klantpagina ?? {}) as Record<string, any>;
    const kps = (kp.stijl ?? {}) as Record<string, string>;

    const merk = {
      naam: kps.naam || hs.naam || inst.naam || winkel?.naam || "Je winkel",
      accent: kps.oranje || hs.oranje || "#0B5B52",
      logo: kps.logo || hs.logo || "",
    };
    const link = winkel?.slug
      ? `https://storvo.app/r/${winkel.slug}/${String(reparatie_nr).replace(/[^0-9a-zA-Z]/g, "")}`
      : "https://storvo.app";

    const woorden = {
      naam: String(klantnaam || "").split(" ")[0] || "daar",
      volledigenaam: String(klantnaam || ""),
      winkel: merk.naam,
      nummer: String(reparatie_nr),
      toestel: String(toestel || "je toestel"),
      link,
      telefoon: inst.tel || "",
    };

    const wilEmail = kanalen?.email !== false && !!naar_email;
    const wilWhats = kanalen?.whatsapp !== false && !!naar_telefoon;
    const resultaten: Array<Record<string, unknown>> = [];

    if (wilEmail) {
      const kop = velden(onderwerp || STANDAARD_ONDERWERP[status] || "Update over je reparatie", woorden);
      const lijf = velden(tekst || "", woorden).replace(/\n/g, "<br>");
      const van = Deno.env.get("RESEND_FROM") || "Storvo <welkom@storvo.app>";
      const uit = await stuurMail(naar_email, `${kop} (${reparatie_nr})`, mailHtml(merk, kop, lijf, link), van);
      await admin.from("berichten").insert({
        team_id: team, reparatie_nr, status, kanaal: "email", ontvanger: naar_email,
        tekst: lijf.replace(/<br>/g, "\n"), gelukt: uit.gelukt,
        fout: uit.fout ?? null, extern_id: uit.extern ?? null,
      });
      resultaten.push({ kanaal: "email", ...uit });
    }

    if (wilWhats) {
      const { data: afz } = await admin.from("afzenders").select("*").eq("team_id", team).maybeSingle();
      const naar = telefoonInternationaal(naar_telefoon);
      const sjabloon = (kp.wa_sjablonen ?? {})[status] || WA_SJABLOON[status];

      // Zelfde volgorde als in de goedgekeurde sjablonen.
      const variabelen = [woorden.naam, woorden.winkel, woorden.toestel, woorden.nummer, link];

      // Eigen nummer van de winkel gaat voor. Is dat er niet, of is de
      // koppeling verbroken, dan valt hij terug op het nummer van Storvo,
      // zodat de klant hoe dan ook zijn bericht krijgt.
      const eigenMeta = afz?.meta_nummer_id && afz?.meta_token && afz?.meta_status !== "ontkoppeld";
      const platformNummer = Deno.env.get("META_WA_NUMMER_ID") ?? "";
      const platformToken = Deno.env.get("META_WA_TOKEN") ?? "";

      let uit: { gelukt: boolean; fout?: string; extern?: string };
      let viaEigen = false;

      if (afz?.aanbieder === "twilio" && afz.twilio_sid && afz.twilio_token && afz.whatsapp_van) {
        viaEigen = true;
        uit = await stuurWhatsAppTwilio(naar, sjabloon, variabelen, {
          sid: afz.twilio_sid, token: afz.twilio_token, van: afz.whatsapp_van,
        });
      } else if (eigenMeta) {
        viaEigen = true;
        uit = await stuurWhatsAppMeta(naar, sjabloon, variabelen, {
          nummerId: afz.meta_nummer_id, token: afz.meta_token,
        });
      } else if (platformNummer && platformToken) {
        uit = await stuurWhatsAppMeta(naar, sjabloon, variabelen, {
          nummerId: platformNummer, token: platformToken,
        });
      } else {
        uit = { gelukt: false, fout: "WhatsApp is nog niet ingesteld." };
      }

      // Ging het mis op het eigen nummer van de winkel, dan proberen we het
      // alsnog via Storvo. Een klant die op zijn toestel wacht heeft niets
      // aan een stille storing.
      if (!uit.gelukt && viaEigen && platformNummer && platformToken) {
        console.warn(`eigen afzender faalde voor team ${team}: ${uit.fout}`);
        const tweede = await stuurWhatsAppMeta(naar, sjabloon, variabelen, {
          nummerId: platformNummer, token: platformToken,
        });
        if (tweede.gelukt) uit = tweede;
      }

      await admin.from("berichten").insert({
        team_id: team, reparatie_nr, status, kanaal: "whatsapp", ontvanger: naar,
        tekst: sjabloon, gelukt: uit.gelukt,
        fout: uit.fout ?? null, extern_id: uit.extern ?? null,
      });
      resultaten.push({ kanaal: "whatsapp", ...uit });
    }

    if (!resultaten.length) {
      return new Response(JSON.stringify({ error: "Geen kanaal om op te versturen." }), { status: 400, headers: cors });
    }
    return new Response(
      JSON.stringify({ ok: resultaten.some((r) => r.gelukt), resultaten }),
      { status: 200, headers: cors },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Er ging iets mis bij het versturen." }), { status: 500, headers: cors });
  }
});
