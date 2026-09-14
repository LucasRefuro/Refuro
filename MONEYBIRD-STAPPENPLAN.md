# Moneybird-koppeling

Doel: een inkoop die je in Storvo vastlegt (op de Inkopen-pagina) met één druk als
**inkoopfactuur (purchase invoice)** in Moneybird zetten, inclusief de factuur-PDF als
bijlage. Zo typ je niet dubbel en staat je boekhouding meteen bij.

Dit hangt samen met de Inkopen-registratie (`state.inkopen`) en het fiscaal blok op het
Rapport (btw-voorbelasting). Zie ook `supabase/functions/README.md` voor de andere Edge
Functions en geheimen.

---

## Hoe Moneybird werkt (het relevante deel)

- **Basis-URL:** `https://moneybird.com/api/v2/{administration_id}/…`
- **Inloggen:** `Authorization: Bearer <token>`. Het token verloopt niet, maar geeft
  toegang tot je hele administratie: behandel het als een wachtwoord.
- **Inkoopfactuur aanmaken:** `POST …/documents/purchase_invoices.json` met een
  `purchase_invoice`-object:
  - `contact_id` (verplicht) — de leverancier, als contact in Moneybird.
  - `date` (verplicht), `reference` (optioneel), `prices_are_incl_tax` (true bij ons).
  - `details_attributes` (verplicht) — de regels, elk met `description`, `price`,
    `amount`, `tax_rate_id`, `ledger_account_id`.
- **Factuur-PDF toevoegen:** `POST …/documents/purchase_invoices/{id}/attachments.json`
  als multipart met veld `file` (de PDF, binair).
- **Verwijzingen zijn id's, geen namen:**
  - `tax_rate_id` uit `…/tax_rates.json` (we mappen 21% / 9% / 0% naar het juiste id).
  - `ledger_account_id` uit `…/ledger_accounts.json` (de grootboekrekening waarop de
    inkoop valt, bv. "Inkopen" of "Kostprijs van de omzet").
  - `contact_id` uit `…/contacts.json` (zoeken op naam; niet gevonden → aanmaken).

---

## De keuze: persoonlijk token nu, OAuth later

- **Nu — persoonlijk API-token (aanbevolen om meteen te koppelen).** Jij maakt in je
  eigen Moneybird een token aan; Storvo gebruikt dat voor jóuw administratie. Snel te
  regelen, geen goedkeuringsscherm. Precies goed om nu jouw winkel te koppelen.
- **Later — OAuth (voor als meerdere winkels dit gaan gebruiken).** Dan autoriseert elke
  winkel zelf via een Moneybird-inlogscherm; Storvo bewaart per winkel een token
  (versleuteld in `winkel_koppelingen`, net als de Shopify-koppeling). Dezelfde
  Edge Function-code, alleen een andere manier om aan het token te komen.

We bouwen nu de token-variant en zetten de architectuur zo dat OAuth er later bovenop kan.

---

## Wat jij doet (eenmalig, ~5 minuten)

Let op: `moneybird.com/user/applications/new` opent tegenwoordig het **OAuth-applicatie**-
formulier (met een Callback URL). Dat is de multi-administratie-route en willen we nu niet.
Het **API-token voor één administratie** is verplaatst naar **Externe applicaties** bij de
instellingen van je administratie. Daar is géén Callback URL nodig.

1. Log in op **moneybird.com** en zorg dat je in de juiste **administratie** zit.
2. Ga naar **Instellingen** (het tandwiel / je administratienaam) →
   **Externe applicaties** (soms onder "Koppelingen" of "Ontwikkelaars").
3. Kies **Nieuw token / API-token aanmaken voor deze administratie**.
   - Naam: **Storvo**.
   - Rechten (scopes): in elk geval **documents** (inkoopfacturen) en **contacts**;
     staan er losse aan/uit-vinkjes, laat de rest gerust uit.
   - Er is hier **geen Callback URL** (zie je die wel, dan zit je nog op het
     OAuth-formulier → ga terug en kies de token-route).
4. Kopieer het token. Het administratie-id hoef je niet op te zoeken; Storvo haalt dat
   zelf op met het token (`…/administrations.json`).
5. Geef het token veilig aan mij, dan zet ik het als geheim **`MONEYBIRD_TOKEN`** in
   Supabase (Project Settings → Edge Functions → Secrets). Of zet je het daar zelf neer.
   Het komt nooit in de code of in een chat te staan.

---

## Wat ik bouw

**Edge Function `moneybird`** (Deno/TS), twee acties:

- `actie:'status'` — controleert het token, haalt de administratie op en leest de
  beschikbare **btw-tarieven** en **grootboekrekeningen**. Zo kies je eenmalig op welke
  grootboekrekening inkopen vallen (bv. "Inkopen"). Die keuze bewaren we bij de koppeling.
- `actie:'inkoop'` — krijgt één inkoop uit Storvo (datum, wat, leverancier, bedrag incl.
  btw, btw%, en optioneel de factuur-PDF) en:
  1. zoekt/maakt het **contact** (leverancier),
  2. mapt het **btw-tarief** naar het juiste `tax_rate_id`,
  3. maakt de **inkoopfactuur** aan met één regel (`prices_are_incl_tax:true`),
  4. uploadt de **factuur-PDF** als bijlage (indien meegestuurd),
  5. geeft het Moneybird-id terug, dat we bij de inkoop in Storvo bewaren.

**In Storvo (winkelapp):**

- Op de **Inkopen-pagina** per inkoop een knop **"Naar Moneybird"** (en een "staat in
  Moneybird"-badge zodra het gelukt is, zodat je niet dubbel stuurt).
- Optioneel een **factuur-bestand** toevoegen aan een inkoop (PDF/foto), die dan mee als
  bijlage gaat. Zonder koppeling blijft de inkoop gewoon een bedrag; met koppeling gaat de
  PDF mee naar Moneybird.
- In **Instellingen** een klein "Moneybird"-blokje: verbonden-status + de keuze van de
  grootboekrekening (uit `actie:'status'`).

---

## Beveiliging

- Het token staat als geheim in Supabase (nu `MONEYBIRD_TOKEN`), later per winkel
  **versleuteld** in `winkel_koppelingen` (die tabel heeft bewust geen RLS; alleen de
  service_role komt erbij — net als de webshoptokens).
- De Edge Function draait met de service_role en praat namens de winkel met Moneybird; de
  browser krijgt het token nooit te zien.

---

## Bouwstappen (volgorde)

1. **Jij:** token aanmaken (hierboven) en aan mij geven → ik zet `MONEYBIRD_TOKEN`.
2. **Ik:** Edge Function `moneybird` met `actie:'status'` → we zien je btw-tarieven en
   grootboekrekeningen, jij kiest de inkoop-grootboekrekening.
3. **Ik:** `actie:'inkoop'` afbouwen (contact, factuur, bijlage) + de "Naar Moneybird"-knop
   en factuur-upload op de Inkopen-pagina.
4. **Samen testen:** één echte inkoop doorsturen en in Moneybird controleren.
5. **Later:** OAuth-variant zodat meerdere winkels kunnen koppelen.

---

## Aandachtspunten

- **Grootboekrekening en btw-tarieven zijn per administratie.** We halen ze met jouw token
  op en mappen ze; niets hardcoden.
- **Dubbel voorkomen:** we bewaren het Moneybird-id bij de inkoop en tonen een badge, zodat
  dezelfde inkoop niet twee keer wordt aangemaakt.
- **Alleen inkoopfacturen** in deze eerste versie. Verkoopfacturen maakt Storvo al zelf; die
  laten we voorlopig buiten Moneybird.
