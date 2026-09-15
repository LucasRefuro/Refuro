# Mailomgeving in Storvo (met AI-sortering)

Doel: een postvak in Storvo dat info@refuro.nl leest, elke mail door de AI een categorie
laat geven (klantvraag, bestelling/partner, spam, overig), je laat filteren en corrigeren,
je vanuit Storvo laat antwoorden, en van een mail meteen een actie laat maken (bijv. van een
bestelling-mail een inkoop).

Bouwt op dezelfde mailkoppeling als de factuur-import (`MAIL-INKOOP-STAPPENPLAN.md`): zelfde
mailbox **info@refuro.nl** op **Zoho EU**. Lezen via IMAP (`imappro.zoho.eu:993`, `imapflow`),
versturen via SMTP (`smtppro.zoho.eu:465`, TLS). **Start pas als de mailbox verbonden is** (de
secrets uit het inkoop-stappenplan staan er dan al; voor versturen is dezelfde login genoeg).

De gebruiker koos: **alles in één keer** (fase 1 + 2 + 3).

## Stand: GEBOUWD (lezen, sorteren, antwoorden, opstellen, verwijderen, bulk)

Live sinds de nacht van 14 op 15 sep 2026. Wat er staat:
- **Pagina Mail** (onder Meer): categorieën als blokjes (klik = mails zien), zelf toevoegen en
  hernoemen/verwijderen. Per categorie: lijst met afzender/onderwerp/fragment, zoeken, mail
  openen en lezen (tekst, met "Toon opmaak" in een sandbox-iframe), antwoorden, categorie
  wijzigen, verwijderen, en bulk (selecteren → verplaatsen of verwijderen). Knop "Nieuwe mail
  ophalen" (loopt door tot alles binnen is) en "Nieuwe mail" (opstellen).
- **Tabellen:** `mail_categorieen` (RLS team), `mail_berichten` (RLS team; insert alleen
  service-role), `mail_sync_stand` (service-role). Standaard 4 categorieën geseed: Klantvraag,
  Bestelling/partner, Spam, Overig.
- **Edge Functions:** `mail-sync` (leest INBOX, AI kiest per mail een categorie in één
  batch-aanroep, slaat op — zelfde betrouwbare verbindingsaanpak als inkoop-mail, zie de
  notitie valkuil-imapflow-zoho-edge), `mail-verstuur` (Zoho SMTP `smtppro.zoho.eu:465` via
  `npm:nodemailer`; alleen ingelogde gebruiker; markeert beantwoord), `mail-actie` (verwijderen
  = naar Trash verplaatsen, omkeerbaar). Lezen/categorie-wijzigen doet de client zelf via de
  tabel (RLS).
- **Cron:** `mail-sync-2uur` (elke 2 uur), zelfde Vault-geheim.
- **Geen extra secret nodig:** versturen gebruikt dezelfde login; `MAIL_SMTP_HOST` valt terug
  op `smtppro.zoho.eu`.

Nog open / mogelijke verbeteringen: AI-antwoordvoorstel, bijlagen in de app kunnen openen
(nu alleen de namen), van een bestelling-mail meteen een inkoop maken (fase 3-koppeling),
correcties van categorieën als voorbeeld aan de AI meegeven zodat het meeleert.

## Oorspronkelijk plan (ter referentie)

---

## Uitgangspunten

- **Mailbox blijft ongemoeid.** IMAP wordt alleen-lezen geopend; gelezen/ongelezen en mappen
  in Zoho veranderen we niet. "Gelezen" en "beantwoord" houden we in onze eigen tabel bij.
- **Versturen doet de gebruiker zelf.** De AI mag een antwoord voorstellen, maar niets gaat
  weg zonder dat de gebruiker op Versturen klikt. (Nooit automatisch mailen namens de winkel.)
- **Privacy.** Mailinhoud staat in een echte tabel met RLS (alleen het eigen team). Bijlagen
  in een privé-bucket, net als de facturen.
- **Categorieën zijn instelbaar.** Je kunt labels toevoegen/weghalen; de AI kiest uit jouw
  lijst. Standaard: Klantvraag, Bestelling/partner, Spam, Overig (Factuur pakt de
  inkoop-import al apart).

---

## Fase 1 — Postvak lezen en sorteren

**Edge Function `mail-sync`** (verify_jwt uit; auth = cron-geheim of ingelogde gebruiker,
zelfde patroon als `inkoop-mail`):
- Opent INBOX alleen-lezen, haalt nieuwe berichten sinds de laatst verwerkte UID.
- Laat de AI (Haiku) per mail een categorie kiezen uit de ingestelde lijst, op basis van
  afzender + onderwerp + eerste stuk tekst. Correcties van de gebruiker worden als
  voorbeelden meegegeven, zodat het steeds beter past.
- Slaat op in `mail_berichten`; onthoudt de UID in `mail_stand`.

**In Storvo:** nieuwe pagina **Mail** (onder Meer). Tabs/filters per categorie, lijst met
afzender, onderwerp, datum en label. Klik = lezen. Label goedzetten met één klik. Knop
"Haal nieuwe mail op" + dagelijkse (of vaker) cron.

## Fase 2 — Antwoorden vanuit Storvo

**Edge Function `mail-verstuur`** (ingelogde gebruiker): stuurt een antwoord via Zoho SMTP
(`smtppro.zoho.eu:465`, `npm:nodemailer`), met juiste In-Reply-To/References zodat het in de
thread blijft. Aparte AI-actie "stel een antwoord voor" die een concept-tekst teruggeeft die
de gebruiker aanpast. Verstuurde mail markeren we als beantwoord.

## Fase 3 — Slimme acties

Vanuit een geopende mail:
- **Bestelling/partner-mail → Inkoop maken.** Vult de inkoop-registratie voor (of maakt een
  concept), inclusief eventuele PDF-bijlage. Sluit aan op de inkopen-module.
- **Klantvraag → Reparatie of taak maken.**
- (Later mogelijk) automatische koppeling van een bestelling aan de bijbehorende factuur.

---

## Tabellen (voorstel)

- `mail_categorieen` (team_id, id, naam, kleur, volgorde, ai_hint) — instelbare labels.
- `mail_berichten` (id, team_id, uid, map, van, van_naam, onderwerp, datum, fragment,
  tekst, html, heeft_bijlagen, categorie_id, gelezen, beantwoord, message_id, in_reply_to,
  aangemaakt_op) — RLS team.
- `mail_stand` (team_id, map, laatste_uid) — voortgang per map.
- Bijlagen: privé-bucket `mailbijlagen` (team-prefix RLS), metadata bij het bericht.

## Secrets (bovenop de inkoop-secrets)

Geen nieuwe login nodig voor versturen: Zoho SMTP gebruikt dezelfde gebruiker/wachtwoord.
Wel apart in te stellen zodat lezen en versturen los staan:
- `MAIL_SMTP_HOST` = `smtppro.zoho.eu`
- (gebruiker/wachtwoord: dezelfde als `MAIL_INKOOP_USER` / `MAIL_INKOOP_PASS`)
