# Facturen automatisch uit de mail in Storvo

Doel: facturen die je ontvangt komen vanzelf als **inkoop** in Storvo terecht, uitgelezen
en al ingevuld (bedrag, btw, leverancier, datum, factuurnummer). Jij bevestigt alleen nog
het **soort** (voorraad of kosten) en of het klopt. Zo hoef je niets te typen en blijven
je btw, investering en winst kloppen.

Hangt samen met de Inkopen-registratie (`state.inkopen`, met `soort` voorraad/kosten), het
fiscaal blok op het Rapport, en de Moneybird-koppeling. Zie ook `MAILBOX-STAPPENPLAN.md`
(info@storvo.nl staat al: Hostinger, inkomende mail werkt).

---

## De aanpak: in drie fasen

We bouwen van "meest waarde, meteen testbaar" naar "volledig automatisch". Elke fase is op
zichzelf bruikbaar.

### Fase 1 — Factuur uitlezen bij het uploaden (de kern)

- Je uploadt in Storvo een factuur (PDF of foto) bij een inkoop.
- Een **AI-factuurlezer** (Edge Function `factuur-lezen`) leest bedrag incl. btw, btw%,
  leverancier, datum en factuurnummer eruit en **vult het inkoop-formulier automatisch in**.
- Jij controleert, kiest het **soort** (voorraad/kosten) en slaat op.
- Nodig: een AI-sleutel als geheim (`ANTHROPIC_API_KEY`). Kosten: een paar cent per factuur.

### Fase 2 — Concept-inkopen en bevestigen

- Automatisch opgehaalde facturen komen als **concept-inkoop** in een lijstje "te
  bevestigen" te staan, niet meteen in je cijfers.
- Jij loopt ze na, zet het soort en bevestigt (of gooit weg). Pas dan tellen ze mee.
- **Dubbele voorkomen:** elke inkoop krijgt een herkenning (mail-message-id, of
  leverancier + factuurnummer + bedrag). Bestaat 'ie al, dan slaan we 'm over.

### Fase 3 — De mailbox dagelijks lezen

- Een **dagelijkse taak** leest de mailbox (bijv. een apart `facturen@storvo.nl`, of
  info@storvo.nl gefilterd op bijlagen), pakt de PDF-bijlagen en stuurt ze door Fase 1/2.
- Zo verschijnen nieuwe facturen elke dag vanzelf als concept-inkoop.
- Technisch: IMAP naar Hostinger (`imap.hostinger.com`) vanuit een geplande Edge Function,
  óf een aparte inbox die naar een webhook doorstuurt. Draait ongeveer één keer per dag.

---

## Wat jij levert (per fase)

- **Fase 1:** een **AI-sleutel** (maak er een aan op console.anthropic.com) → ik zet 'm als
  geheim `ANTHROPIC_API_KEY` in Supabase. Meer niet.
- **Fase 3:** een **mailbox voor facturen**. Aanbevolen: een apart adres
  `facturen@storvo.nl` (in Hostinger) waar jij je facturen naartoe stuurt of laat
  doorsturen; dan is elke mail een factuur en blijft je gewone inbox met rust. Ik heb dan
  het IMAP-wachtwoord van dat adres nodig (als geheim in Supabase), niet in de chat.

---

## Wat ik bouw

- **Edge Function `factuur-lezen`** (Fase 1): krijgt een factuur (PDF/foto als base64),
  stuurt die naar de AI met de vraag om bedrag incl. btw, btw%, leverancier, datum en
  factuurnummer terug te geven als nette JSON, en geeft dat terug aan Storvo.
- **In Storvo** (Fase 1): op de Inkopen-pagina een knop **"Factuur uitlezen"** die het
  formulier automatisch invult. Jij kiest het soort en slaat op.
- **Concept-inkopen** (Fase 2): een `concept: true`-vlag op inkopen + een blokje "te
  bevestigen"; dedup-herkenning per inkoop.
- **Dagelijkse mailtaak** (Fase 3): geplande Edge Function die de mailbox leest en de
  bijlagen door Fase 1/2 haalt.

---

## Slim en zuiver houden

- **Soort bepaalt de verrekening.** Voorraad-inkopen (hoesjes, onderdelen, partijen
  laptops) verlagen de winst pas bij verkoop; kosten-inkopen meteen. De AI raadt het soort
  niet — dat bevestig jij, zodat je omzet/winst nooit dubbel geraakt wordt.
- **Dubbele inkopen** worden op herkenning geweerd (mail-id / factuurnummer + bedrag). Ook
  wat je zelf al hebt ingevoerd of naar Moneybird stuurde telt niet nog een keer.
- **Alles blijft een indicatie tot jij bevestigt.** Geen automatische boeking in je cijfers
  zonder jouw akkoord.

---

## Hoe het gebouwd is (Fase 3, live)

De mailbox is **info@refuro.nl**, en die zit op **Zoho** (EU-datacenter: MX = mx.zoho.eu).
Niet op Hostinger, dus het IMAP-adres is `imap.zoho.eu` (poort 993, TLS), niet
imap.hostinger.com. Bij Zoho moet IMAP eerst **aangezet** worden (Instellingen → Mail
Accounts → IMAP Access) en bij tweestapsverificatie is een **app-wachtwoord** nodig.

- **Edge Function `inkoop-mail`** (`supabase/functions/inkoop-mail/index.ts`, verify_jwt
  uit). Opent INBOX **alleen-lezen** met `imapflow`, dus de gelezen/ongelezen-status
  verandert niet. Onthoudt per team de laatst verwerkte UID in tabel `inkoop_mail_stand`
  (eerste keer: laatste 30 dagen, daarna alleen nieuwer; max 40 per keer). Elke PDF/foto
  boven 4 kB gaat langs de AI met de vraag "is dit een factuur?"; zo ja, dan velden
  uitlezen, dedup (`bestaatAl` op factuurnummer, of leverancier + bedrag + datum), factuur
  in de privé-bucket `inkoopfacturen`, en een conceptregel in tabel `inkoop_concepten`.
- **Toegang tot de functie:** cron-geheim (`X-Cron-Secret` == `MAIL_CRON_SECRET`) óf een
  ingelogde gebruiker (de knop). Geen van beide → 401.
- **In Storvo:** knop **"Haal facturen op uit e-mail"** op Inkopen (`haalFacturenUitMail`),
  concepten uit `inkoop_concepten` in het blok **"Te bevestigen"** met label "uit e-mail"
  (`laadMailConcepten`, `mailConceptBevestig` maakt er een blob-inkoop van en verwijdert de
  conceptregel, `mailConceptWeg`, `mailConceptDetail`).
- **Dagelijkse taak:** `pg_cron`-job `inkoop-mail-dagelijks`, elke dag 06:00 UTC (08:00 NL
  zomer). Roept de functie aan via `pg_net`; het cron-geheim staat in **Vault**
  (`mail_cron_secret`), niet in platte tekst in de cron-opdracht.

### Geheimen (zet de gebruiker in Supabase → Project Settings → Edge Functions → Secrets)

| Geheim | Waarde |
|---|---|
| `MAIL_INKOOP_HOST` | `imap.zoho.eu` |
| `MAIL_INKOOP_USER` | `info@refuro.nl` |
| `MAIL_INKOOP_PASS` | Zoho-wachtwoord of app-wachtwoord |
| `MAIL_INKOOP_TEAM` | `ce975142-a7d9-4fb2-9cb5-9cc1fe1d7f65` (team Storvo) |
| `MAIL_CRON_SECRET` | gedeeld met Vault; alleen voor de dagelijkse ronde |
| `ANTHROPIC_API_KEY` | stond er al (factuurlezer) |
