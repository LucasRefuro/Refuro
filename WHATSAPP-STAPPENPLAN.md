# WhatsApp aanzetten — stappenplan

Vier onderdelen. Doe ze op volgorde. Na elk onderdeel staat er hoe je weet dat
het gelukt is. Stop gerust tussendoor; je kunt later verder waar je gebleven bent.

Houd één tekstbestand open om twee dingen in te plakken. Je hebt ze straks nodig:

- **A = Telefoonnummer-ID** (een lang getal)
- **B = Token** (een hele lange sliert letters)

> Plak B nergens in een chat, ook niet bij mij. Alleen in Supabase.

---

## Onderdeel 1 — Telefoonnummer-ID ophalen

Tijd: 2 minuten. Dit is al bijna klaar.

Je **A** is al bekend:

```
A = 1302595462926507
```

Dat hoort bij het testnummer `+1 555 675 1657`. Dat is een Amerikaans nummer van
Meta zelf. Dat is geen probleem: het is bedoeld om mee te testen, het is gratis en
90 dagen geldig. In Onderdeel 5 zet je er een Nederlands nummer voor in de plaats.

Wat je nu nog wel moet doen: je eigen 06 als testontvanger toevoegen. Je kunt met
het testnummer namelijk alleen sturen naar nummers die je zelf toevoegt, maximaal vijf.

1. Ga naar **developers.facebook.com** → je app → **WhatsApp** → **API Setup**.
2. Bij **To** / **Aan**, klik op het uitklapmenu.
3. Klik op **Manage phone number list** / **Telefoonnummerlijst beheren**.
4. Klik op **Add phone number** / **Telefoonnummer toevoegen**.
5. Vul je eigen mobiele nummer in als **+31 6 …** (dus zonder de 0).
6. Je krijgt een code via WhatsApp. Vul die in.

**Gelukt als:** je eigen 06 staat in de lijst bij "To".

---

## Onderdeel 2 — Token maken

Tijd: 6 minuten. Dit is het langste stuk. Rustig aan.

1. Ga naar **business.facebook.com**.
2. Klik linksonder op **Instellingen** (het tandwiel).
3. Klik in het linkermenu op **Gebruikers**.
4. Klik daaronder op **Systeemgebruikers**.
5. Klik op de blauwe knop **Toevoegen**.
6. Naam: typ `Storvo`.
7. Rol: kies **Beheerder** / **Admin**.
8. Klik op **Systeemgebruiker maken**.

Nu geef je die gebruiker toegang tot je spullen:

9. Klik op de systeemgebruiker `Storvo` die je net maakte.
10. Klik op **Assets toewijzen** / **Add assets**.
11. Kies links **Apps**. Vink je app aan. Zet **Volledig beheer** aan.
12. Klik op **Wijzigingen opslaan**.
13. Klik nog een keer op **Assets toewijzen**.
14. Kies links **WhatsApp-accounts**. Vink je WhatsApp-account aan. Zet **Volledig beheer** aan.
15. Klik op **Wijzigingen opslaan**.

Nu het token zelf:

16. Klik op **Nieuw token genereren** / **Generate new token**.
17. Bij "App": kies je app.
18. Bij "Verloopdatum token" / "Token expiration": kies **Nooit** / **Never**.
19. Scroll naar de lijst met vinkjes. Vink deze twee aan:
    - `whatsapp_business_messaging`
    - `whatsapp_business_management`
20. Klik op **Token genereren**.
21. Er verschijnt een hele lange sliert tekst. Klik op **Kopiëren**.
22. Plak die in je tekstbestand achter **B =**.

> Let op: dit token zie je maar één keer. Sluit het venster pas als je hem geplakt hebt.

**Gelukt als:** er staat een lange sliert achter B, beginnend met `EAA`.

---

## Onderdeel 3 — A en B in Supabase zetten

Tijd: 2 minuten.

1. Ga naar **supabase.com** en open je project.
2. Klik linksonder op **Project Settings** (tandwiel).
3. Klik in het linkermenu op **Edge Functions**.
4. Je ziet een blok **Secrets**. Klik op **Add new secret**.
5. Naam: `META_WA_NUMMER_ID` — Waarde: plak **A**.
6. Klik op **Save**.
7. Klik nog een keer op **Add new secret**.
8. Naam: `META_WA_TOKEN` — Waarde: plak **B**.
9. Klik op **Save**.

Let goed op de spelling van de namen. Eén tikfout en het werkt niet.

**Gelukt als:** je ziet `META_WA_NUMMER_ID` en `META_WA_TOKEN` in de lijst met secrets staan.

---

## Onderdeel 4 — De zes berichtsjablonen indienen

Tijd: 15 minuten. Zes keer hetzelfde kunstje.

Open erbij: `emails/whatsapp-sjablonen.md` in deze map. Daar staat de tekst die je gaat plakken.

1. Ga naar **business.facebook.com/wa/manage/**.
2. Klik linksboven en controleer dat je **Storvo** hebt geselecteerd, niet het testaccount.
3. Klik in het linkermenu op **Berichtsjablonen**.
4. Klik op de blauwe knop **Sjabloon maken**.

Voor sjabloon 1:

5. Categorie: kies **Hulpprogramma** / **Utility**.
6. Naam: typ `storvo_aangemeld` (precies zo, kleine letters, met de liggende streepjes).
7. Taal: kies **Nederlands**.
8. Klik op **Doorgaan**.
9. Koptekst: laat leeg.
10. Hoofdtekst: plak het tekstblok van sjabloon 1 uit het sjablonenbestand.
11. Voettekst: typ `Verstuurd via Storvo`.
12. Knoppen: laat leeg.
13. Meta vraagt om voorbeeldwaarden voor `{{1}}` tot en met `{{5}}`. Vul in:
    - {{1}} `Sara`
    - {{2}} `Storvo`
    - {{3}} `iPhone 14`
    - {{4}} `R26-001`
    - {{5}} `https://storvo.app/r/storvo/R26001`
14. Klik op **Indienen**.

Herhaal stap 4 tot en met 14 voor de andere vijf. Alleen de naam en de hoofdtekst
verschillen; de rest is elke keer hetzelfde.

- `storvo_inleveren`
- `storvo_besteld`
- `storvo_binnen`
- `storvo_bezig`
- `storvo_klaar`

**Gelukt als:** alle zes staan in de lijst. Eerst op **In behandeling**, daarna op
**Goedgekeurd**. Meestal binnen een uur. Je krijgt er bericht van.

---

## Testen

Wacht tot minstens `storvo_aangemeld` op **Goedgekeurd** staat.

1. Open **storvo.app/app/** en log in.
2. Ga naar **Instellingen → Berichten**.
3. Controleer dat **Versturen via WhatsApp** aangevinkt staat.
4. Ga naar **Reparaties → Nieuw**.
5. Vul je eigen naam in en bij telefoon je eigen 06.
6. Vink aan dat de klant updates wil.
7. Klik op **Reparatie aanmaken**.

**Gelukt als:** je telefoon binnen een halve minuut een WhatsApp krijgt van Storvo,
met jouw winkelnaam in het bericht.

Krijg je niets? Open de reparatie in Storvo en kijk onderaan bij de
verzendgeschiedenis. Daar staat wat er misging.

---

## Onderdeel 5 — Een Nederlands nummer (pas als het testen lukt)

Dit heb je nodig voordat je naar echte klanten stuurt. Doe dit niet eerder; eerst
wil je zien dat de hele keten werkt.

### Eerst: een nummer kopen

Eén nummer, van Storvo. Dat gebruik je voor álle winkels die je software kopen.
De naam van de winkel staat in het bericht, dus de klant weet precies van wie het komt.

**Koop een sim-only abonnement, geen prepaid.** Vijf tot acht euro per maand bij
Simyo, Ben of Lebara. Prepaidnummers worden afgesloten als je ze een tijd niet
gebruikt, en dit nummer wordt de ruggengraat van je product. Dat risico wil je niet.

Het nummer mag **nog geen WhatsApp** hebben. Een vers nummer heeft dat niet, dus
dat komt goed. Je hebt het maar één keer nodig, voor de verificatiecode. Daarna
mag de simkaart in een la.

> Je oude nummer 0161‑234334 kan niet: daar zit al WhatsApp op.

### Daarna: het nummer toevoegen

1. Ga naar **business.facebook.com/wa/manage/**.
2. Zorg dat linksboven **Storvo** geselecteerd staat, niet het testaccount.
3. Klik in het linkermenu op **Telefoonnummers**.
4. Klik op **Telefoonnummer toevoegen**.
5. Vul in:
   - **Weergavenaam:** `Storvo` — dit zien klanten bovenaan het gesprek.
   - **Categorie:** Software
   - **Beschrijving:** korte zin over wat Storvo doet.
6. Vul het telefoonnummer in met landcode: **+31 …**
7. Kies **Sms** of **Telefoongesprek** om de code te ontvangen.
8. Vul de code in.

### Dan: betaalmethode koppelen

Zonder betaalmethode weigert Meta berichten naar echte klanten.

1. In WhatsApp Manager, klik op **Instellingen** → **Betalingsinstellingen**.
2. Voeg een creditcard of zakelijke rekening toe.

Een bericht naar Nederland kost ongeveer 3 tot 5 eurocent. Antwoordt een klant,
dan is alles wat je de 24 uur daarna stuurt gratis. Bij honderd reparaties per
maand met vier berichten elk zit je rond de vijftien euro.

### En: bedrijfsverificatie aanvragen

Doe dit meteen, want het duurt een paar dagen en het bepaalt hoeveel je mag sturen.

Meta geeft een nieuw bedrijf **250 unieke klanten per 24 uur**. Dat is gedeeld
over al je winkels samen. Zodra je bedrijf geverifieerd is gaat dat naar **2.000**,
en daarna schaalt het vanzelf door naar 10.000 en hoger zolang je kwaliteit goed blijft.

1. Ga naar **business.facebook.com** → **Instellingen** → **Bedrijfsgegevens**.
2. Klik op **Verificatie starten**.
3. Vul je bedrijfsgegevens in precies zoals ze bij de KvK staan.
4. Upload een uittreksel van de Kamer van Koophandel.
5. Meta belt of mailt ter bevestiging.

**Gelukt als:** bij je bedrijfsgegevens staat **Geverifieerd**.

### Tot slot: de nieuwe A in Supabase

1. Ga terug naar **developers.facebook.com** → je app → **WhatsApp** → **API Setup**.
2. Kies bij **From** je nieuwe Nederlandse nummer in plaats van het testnummer.
3. Kopieer de nieuwe **Phone number ID**.
4. Ga naar Supabase → Project Settings → Edge Functions → Secrets.
5. Klik op `META_WA_NUMMER_ID` en vervang de waarde door het nieuwe ID.

**Gelukt als:** je stuurt een testreparatie naar een nummer dat níét in je
testlijst staat, en die komt gewoon aan.

---

## Waar je nu staat

- Onderdeel 1 t/m 4: hiermee werkt WhatsApp naar je eigen telefoon. Dit kun je
  vandaag afmaken en aan een winkel laten zien.
- Onderdeel 5: hiermee werkt het naar echte klanten. Geen haast.
