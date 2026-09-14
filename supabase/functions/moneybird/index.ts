// Moneybird-koppeling: een inkoop die je in Storvo vastlegt als inkoopfactuur
// (purchase invoice) in Moneybird zetten, met de factuur-PDF als bijlage.
//
// Twee kanten van inloggen:
//   - Naar Storvo toe: de ingelogde gebruiker (Bearer-sessie). Alleen een echt account
//     mag deze functie aanroepen.
//   - Naar Moneybird toe: een persoonlijk API-token in het geheim MONEYBIRD_TOKEN. Dat
//     token verloopt niet en geeft toegang tot de hele administratie, dus het staat als
//     geheim in Supabase en komt nooit in de browser of de code.
//
// Twee acties:
//   actie:'status'  → controleert het token, haalt de administratie op en geeft de
//                     btw-tarieven en grootboekrekeningen terug (om er één te kiezen).
//   actie:'inkoop'  → maakt de inkoopfactuur aan (contact zoeken/aanmaken, btw mappen,
//                     factuur + optionele PDF-bijlage) en geeft het Moneybird-id terug.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const MB = "https://moneybird.com/api/v2";

function fout(bericht: string, code = 400) {
  return new Response(JSON.stringify({ ok: false, error: bericht }), { status: code, headers: cors });
}
function goed(obj: unknown) {
  return new Response(JSON.stringify(Object.assign({ ok: true }, obj)), { headers: cors });
}

async function mb(token: string, admin: string, pad: string, opties: RequestInit = {}) {
  return await fetch(`${MB}/${admin}${pad}`, {
    ...opties,
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", ...(opties.headers || {}) },
  });
}
async function administratieInfo(token: string): Promise<{ id: string | null; status: number; body: string }> {
  const res = await fetch(`${MB}/administrations.json`, { headers: { "Authorization": "Bearer " + token } });
  const body = await res.text();
  let id: string | null = null;
  try { const l = JSON.parse(body); if (Array.isArray(l) && l.length) id = String(l[0].id); } catch (_e) { /* geen json */ }
  return { id, status: res.status, body: body.slice(0, 200) };
}
async function json(res: Response): Promise<any> { try { return await res.json(); } catch { return null; } }

// Zoek het btw-tarief-id dat bij dit percentage hoort, bij voorkeur voor inkoopfacturen.
function taxIdVoor(taxes: any[], pct: number): number | null {
  const match = (t: any) => Math.round(parseFloat(t.percentage)) === pct;
  const p = (taxes || []).find((t) => t.tax_rate_type === "purchase_invoice" && match(t))
    || (taxes || []).find(match);
  return p ? p.id : null;
}

// Zoek een leverancier-contact op naam; niet gevonden, dan aanmaken.
async function contactId(token: string, admin: string, naam: string): Promise<number | null> {
  const zoek = await mb(token, admin, "/contacts.json?query=" + encodeURIComponent(naam));
  const gevonden = zoek.ok ? await json(zoek) : [];
  if (Array.isArray(gevonden) && gevonden[0]?.id) return gevonden[0].id;
  const maak = await mb(token, admin, "/contacts.json", { method: "POST", body: JSON.stringify({ contact: { company_name: naam } }) });
  if (!maak.ok) return null;
  const c = await json(maak);
  return c?.id || null;
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

  // .trim() vangt een per ongeluk meegekopieerde spatie of enter in het geheim op; dat is
  // de meest voorkomende oorzaak van "token is invalid".
  const token = (Deno.env.get("MONEYBIRD_TOKEN") || "").trim();
  if (!token) return fout("De Moneybird-koppeling is nog niet ingesteld (MONEYBIRD_TOKEN ontbreekt).", 503);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }

  let admin = lijf?.administration_id || null;
  if (!admin) {
    const info = await administratieInfo(token);
    admin = info.id;
    if (!admin) return fout(`Geen Moneybird-administratie gevonden (HTTP ${info.status}). Antwoord: ${info.body || "leeg"}`, 502);
  }

  if (lijf?.actie === "status") {
    const [tr, la] = await Promise.all([
      mb(token, admin, "/tax_rates.json"),
      mb(token, admin, "/ledger_accounts.json"),
    ]);
    const taxes = tr.ok ? await json(tr) : [];
    const ledgers = la.ok ? await json(la) : [];
    return goed({
      administration_id: admin,
      tax_rates: (taxes || []).map((t: any) => ({ id: t.id, percentage: t.percentage, naam: t.name, soort: t.tax_rate_type })),
      ledgers: (ledgers || []).map((l: any) => ({ id: l.id, naam: l.name, soort: l.account_type })),
    });
  }

  if (lijf?.actie === "inkoop") {
    const bedrag = Number(lijf?.bedrag) || 0;
    const btw = Math.round(Number(lijf?.btw) || 0);
    const wat = String(lijf?.wat || "Inkoop");
    const datum = String(lijf?.datum || new Date().toISOString().slice(0, 10));
    const leverancier = String(lijf?.leverancier || "").trim();
    if (!bedrag) return fout("Geen bedrag");

    const trRes = await mb(token, admin, "/tax_rates.json");
    const taxes = trRes.ok ? await json(trRes) : [];
    const tax_rate_id = taxIdVoor(taxes, btw);
    if (!tax_rate_id) return fout(`Geen btw-tarief van ${btw}% gevonden in Moneybird.`, 502);

    let ledger_account_id = lijf?.ledger_account_id || Deno.env.get("MONEYBIRD_LEDGER_ID") || null;
    if (!ledger_account_id) {
      const laRes = await mb(token, admin, "/ledger_accounts.json");
      const ledgers = laRes.ok ? await json(laRes) : [];
      const kies = (ledgers || []).find((l: any) => /inkoop|kostprijs|kosten/i.test(l.name || ""));
      ledger_account_id = kies?.id || (Array.isArray(ledgers) && ledgers[0]?.id) || null;
    }
    if (!ledger_account_id) return fout("Geen grootboekrekening gevonden.", 502);

    const contact_id = await contactId(token, admin, leverancier || "Diverse leveranciers");
    if (!contact_id) return fout("Kon geen leverancier-contact vinden of aanmaken.", 502);

    // Moneybird eist een referentie (het factuurnummer van de leverancier). Hebben we die
    // niet, dan vullen we een leesbare eigen referentie zodat de factuur toch geboekt kan
    // worden; die pas je in Moneybird zo aan.
    const reference = (String(lijf?.reference || "").trim()) || `${wat} ${datum}`.slice(0, 120);
    const body = {
      purchase_invoice: {
        contact_id, date: datum, reference,
        prices_are_incl_tax: true,
        details_attributes: [{ description: wat, price: bedrag, amount: "1", tax_rate_id, ledger_account_id }],
      },
    };
    const inv = await mb(token, admin, "/documents/purchase_invoices.json", { method: "POST", body: JSON.stringify(body) });
    if (!inv.ok) return fout("Moneybird weigerde de inkoopfactuur: " + (await inv.text()).slice(0, 300), 502);
    const factuur = await json(inv);

    // De factuur-PDF komt als base64 data:-URL binnen; die hangen we als bijlage aan de
    // factuur. Mislukt de bijlage, dan staat de factuur er in elk geval al.
    const data = String(lijf?.pdf || "");
    if (data.startsWith("data:") && factuur?.id) {
      try {
        const komma = data.indexOf(",");
        const type = data.slice(5, data.indexOf(";")) || "application/pdf";
        const bytes = Uint8Array.from(atob(data.slice(komma + 1)), (c) => c.charCodeAt(0));
        const form = new FormData();
        form.append("file", new Blob([bytes], { type }), "factuur.pdf");
        await fetch(`${MB}/${admin}/documents/purchase_invoices/${factuur.id}/attachments.json`, {
          method: "POST", headers: { "Authorization": "Bearer " + token }, body: form,
        });
      } catch (_e) { /* bijlage mislukt: factuur staat er wel */ }
    }

    return goed({ id: factuur?.id, url: factuur?.url || null });
  }

  return fout("Onbekende actie");
});
