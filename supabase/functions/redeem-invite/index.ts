import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* E-mail volgens het Storvo brand book: wit vlak, groen merk, één amber actie. */
function welkomHtml(naam: string, tekst: string, knop: string, url: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F6F3; padding:40px 16px; font-family:'Instrument Sans','Segoe UI',Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px; width:100%; border-radius:24px; overflow:hidden; background-color:#ffffff; box-shadow:0 6px 24px rgba(23,32,30,0.07);">
      <tr><td style="padding:22px 32px; border-bottom:1.5px solid #ECEAE4;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td width="34" style="width:34px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="34" style="width:34px; height:34px; background-color:#0B5B52; border-radius:9px;">
              <tr><td align="center" valign="middle" style="height:34px; line-height:34px; font-size:17px; font-weight:700; color:#F7F6F3;">&#10003;</td></tr>
            </table>
          </td>
          <td style="padding-left:11px; font-family:'Sora','Segoe UI',Helvetica,Arial,sans-serif; font-size:23px; font-weight:800; letter-spacing:-0.04em; color:#17201E;">storvo</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:34px 32px 36px;">
        <h1 style="margin:0 0 14px; font-family:'Sora','Segoe UI',Helvetica,Arial,sans-serif; font-size:25px; font-weight:800; line-height:1.25; color:#17201E; letter-spacing:-0.01em;">Welkom bij Storvo, ${naam}</h1>
        <p style="margin:0 0 24px; font-size:15.5px; line-height:1.6; color:#475350;">${tekst}</p>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#E88A1D; border-radius:100px;">
            <a href="${url}" style="display:inline-block; padding:14px 30px; font-family:'Instrument Sans','Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none;">${knop}</a>
          </td>
        </tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0;">
          <tr><td style="border-top:1px solid #ECEAE4; font-size:0; line-height:0;">&nbsp;</td></tr>
        </table>
        <p style="margin:22px 0 0; font-size:13px; line-height:1.6; color:#8A938F;">Vragen? Vraag het je werkgever of antwoord op deze e-mail.</p>
      </td></tr>
    </table>
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px; width:100%;">
      <tr><td align="center" style="padding:22px 8px 0; font-size:12.5px; line-height:1.6; color:#8A938F;">
        <span style="font-family:'Sora','Segoe UI',Helvetica,Arial,sans-serif; font-weight:700; color:#0B5B52;">Alles geregeld.</span><br>
        Storvo &middot; alles-in-&eacute;&eacute;n systeem voor telefoonwinkels<br>
        <a href="https://storvo.app" style="color:#8A938F;">storvo.app</a>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

async function stuurWelkomstmail(email: string, naam: string, bedrijfsnaam: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM") || "Storvo <welkom@storvo.app>",
        to: [email],
        subject: `Welkom bij Storvo, ${naam}`,
        html: welkomHtml(naam,
          `Je bent toegevoegd aan het team van <strong>${bedrijfsnaam}</strong>. Log in met je gebruikersnaam of e-mailadres en je wachtwoord, dan zie je meteen wat er vandaag speelt in de winkel.`,
          "Naar Storvo", "https://storvo.app/app/"),
      }),
    });
  } catch (_e) {}
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  let userId: string | null = null;
  try {
    const { token, naam, gebruikersnaam, wachtwoord, email } = await req.json();
    if (!token || !naam || !gebruikersnaam || !wachtwoord || !email) {
      return new Response(JSON.stringify({ error: "Niet alle velden zijn ingevuld." }), { status: 400, headers: cors });
    }
    if (String(wachtwoord).length < 8) {
      return new Response(JSON.stringify({ error: "Wachtwoord moet minstens 8 tekens zijn." }), { status: 400, headers: cors });
    }

    const { data: invite, error: invErr } = await admin.from("invites").select("*").eq("token", token).maybeSingle();
    if (invErr || !invite || invite.gebruikt || new Date(invite.verloopt_op) < new Date()) {
      return new Response(JSON.stringify({ error: "Deze uitnodigingslink is ongeldig of verlopen." }), { status: 400, headers: cors });
    }

    const { data: team } = await admin.from("klanten").select("naam").eq("id", invite.team_id).single();

    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email, password: wachtwoord, email_confirm: true, user_metadata: { naam, gebruikersnaam },
    });
    if (userErr) throw userErr;
    userId = userData.user.id;

    /* De rechten (pagina's, omgevingen) staan al klaar op de uitnodiging en gaan mee naar
       het account. Zo staat de collega meteen goed. Geen tabs op de uitnodiging (oudere
       uitnodigingen) betekent null: dan volgt hij gewoon de standaard van zijn rol. */
    const { error: accErr } = await admin.from("accounts").insert({
      id: userId, team_id: invite.team_id, gebruikersnaam, naam, email, rol: invite.rol,
      tabs: invite.tabs ?? null,
    });
    if (accErr) {
      await admin.auth.admin.deleteUser(userId);
      const msg = String(accErr.message || "").includes("gebruikersnaam") ? "Gebruikersnaam is al in gebruik." : "Kon het account niet aanmaken.";
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: cors });
    }

    /* account_id vastleggen zodat de winkelapp het uurloon (dat in de blob leeft, niet in
       accounts) later op het juiste id kan zetten. */
    await admin.from("invites").update({ gebruikt: true, account_id: userId }).eq("id", invite.id);
    await stuurWelkomstmail(email, naam, team?.naam || "je team");

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    if (userId) { try { await admin.auth.admin.deleteUser(userId); } catch (_e) {} }
    const raw = String(err?.message || "");
    const msg = raw.includes("already been registered") ? "Dit e-mailadres heeft al een account." : "Er ging iets mis, probeer het opnieuw.";
    return new Response(JSON.stringify({ error: msg }), { status: 400, headers: cors });
  }
});
