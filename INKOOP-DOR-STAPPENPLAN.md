# Inkoop bij particulieren, het inkoopregister en het DOR

Koop je een gebruikt toestel in, dan moet je vastleggen van wie, wat en voor hoeveel.
Storvo doet dat nu in één scherm: het vult je inkoopregister (wat het DOR van de politie
vraagt) en maakt de ondertekende inkoopverklaring voor de boekhouder.

Onderzoek gedaan op 3 november 2026. Bronnen staan onderaan.

---

## Wat de wet vraagt

**Het register.** Wie gebruikte goederen inkoopt houdt een register bij (art. 437 Sr).
Minimaal per inkoop: een volgnummer, de datum, wat het is (soort, merk en nummer), de
prijs, en naam en adres van de verkoper (Uitvoeringsbesluit art. 437, art. 2).

**Het DOR.** Het Digitaal Opkopers Register is de digitale versie van dat register. De
politie beheert het, gekoppeld aan Stop Heling. Het DOR-scherm vraagt per inkoop ook de
geboortedatum, de soort en het nummer van het legitimatiebewijs, het IMEI bij een
telefoon, en de kleur. Landelijk verplicht wordt het pas met wetsvoorstel 36036 (door de
Tweede Kamer op 2 juni 2026, ligt nog in de Eerste Kamer). Tot dan beslist de gemeente.

**Gilze en Rijen.** De APV (art. 2:66 tot 2:68) regelt het register, de meldplicht en de
wachttermijn. Of het DOR hier al verplicht is, heb ik niet kunnen bevestigen. Vraag het
na bij de gemeente: 14 0161.

**Vijf werkdagen bewaren.** Een ingekocht goed blijft de eerste vijf werkdagen in
bewaring, in de staat waarin je het kocht (APV art. 2:68 sub d). Dus niet wissen, niet
repareren en niet verkopen. Weekend en feestdagen tellen niet mee.

**Niet van minderjarigen.** Kopen van iemand onder de 18 mag niet (art. 437bis Sr).

**Geen kopie van het ID, geen BSN.** Een opkoper schrijft alleen de soort en het nummer
van het legitimatiebewijs op. Een kopie maken mag niet, en het BSN mag alleen als een wet
het voorschrijft (art. 46 UAVG).

**De inkoopverklaring (margeregeling).** Verplicht vanaf €500 bij één leverancier, tenzij
die zelf een factuur geeft. Erop moet staan: datum, jouw bedrijf, naam en adres van de
verkoper, wat (en hoeveel), het bedrag, en dat de verkoper geen btw heeft afgetrokken. De
verkoper tekent, jij bewaart hem. Eén verklaring mag meerdere goederen bevatten.

---

## Hoe het in Storvo werkt

**Aan de balie.** Winkelapp, Inruil, "Inname starten". In de werkbank kies je het model en
het aantal, en onder Inkoopgegevens "Inkoopverklaring maken". Dat scherm vraagt:

- particulier of bedrijf, naam, geboortedatum
- adres (postcode en huisnummer vullen straat en plaats vanzelf, via PDOK)
- soort en nummer van het legitimatiebewijs
- per toestel het serienummer, of bij een telefoon het IMEI (`*#06#`)
- het bedrag en hoe je betaalde
- de handtekening, op het scherm of op papier

Onder de 18 of zonder legitimatie gaat het niet door. Vergeet je de verklaring bij een
inname, dan vraagt Storvo bij Toevoegen of dat de bedoeling is.

**Na het toevoegen.** De inkoop staat in het register (tabel `inkoop_registraties`, met
een eigen volgnummer). Elk toestel krijgt zijn serienummer, de koppeling met het register
en de datum tot wanneer het in bewaring is. Meteen daarna opent het scherm "Overnemen in
het DOR": alle velden in de volgorde van het DOR, met een kopieerknop. Staat hij erin, dan
vink je dat aan.

**In de werkbank.** Een toestel in bewaring toont "in bewaring t/m ...". Wil je het eerder
controleren, repareren, slopen of online zetten, dan vraagt Storvo "Toch beginnen?". Dat
is een waarschuwing, geen blokkade (zo gekozen).

**Voor de boekhouder.** Winkelapp, Inkopen, blok "Inkoop bij particulieren". Kies boven de
periode (maand, kwartaal, jaar). Daar staan:

- per inkoop de verklaring als PDF
- "Alle verklaringen als PDF": alles van de periode in één bestand
- "Lijst voor de boekhouder": een CSV, zonder geboortedatum en legitimatie
- per inkoop of hij al in het DOR staat, en anders de knop Overnemen

---

## Koppelen aan het DOR

Het DOR heeft een webservice, maar alleen voor goedgekeurde softwareleveranciers. Er is
geen openbare documentatie en geen CSV-upload. Andere pakketten die al koppelen:
CycleSoftware (fietsen), 21QUBZ (recycling), FYN (juweliers). Voor telefoonreparatie heb
ik er geen gevonden.

Tot er een koppeling is, kopieer je de velden over. Dat kost per inkoop een minuut.

**Toegang aanvragen.** Stuur deze mail (pas aan waar nodig):

> Aan: stopheling@politie.nl
> CC: hengelo@winvision.nl
> Onderwerp: Aanvraag webservice DOR voor kassasoftware
>
> Beste,
>
> Ik ben eigenaar van Refuro in Rijen, een winkel in reparatie en refurbished
> telefoons en laptops. We gebruiken onze eigen kassasoftware, Storvo, en leggen elke
> inkoop al vast met alle velden die het DOR vraagt (verkoper, legitimatie, merk, type,
> IMEI of serienummer, prijs).
>
> We willen die inkopen direct via de webservice in het DOR zetten, in plaats van ze met
> de hand over te nemen. Wat is daarvoor nodig? Ik hoor graag de voorwaarden, de technische
> documentatie en of er een testomgeving is.
>
> Met vriendelijke groet,
> Lucas Klein
> Refuro, Rijen

Komt er toegang, dan wordt het een Edge Function die een registratie doorstuurt en
`dor_ingevoerd_op` zelf zet.

---

## Uitrollen

1. Migratie `supabase/migrations/20261103120000_inkoop_registraties.sql` draaien. Hij
   maakt alleen dingen bij: de tabel, het volgnummer, RLS, en twee kolommen op
   `refurbish_apparaten`. Zonder de migratie werkt alles zoals vroeger: de verklaring
   wordt gewoon opgeslagen, met de melding dat het register nog niet aan staat.
2. Pushen naar `main`.

---

## Nog open

- **Gemeente bellen** (14 0161): is het DOR in Gilze en Rijen verplicht, en is het
  register gewaarmerkt?
- **Bewaartermijn van het register.** Het wetsvoorstel zegt: na 4 jaar vernietigen. De
  verklaring zelf bewaar je 7 jaar voor de belasting (zonder legitimatie erop). Later een
  opruimtaak die geboortedatum en legitimatie na 4 jaar leegmaakt.
- **Batches.** Een partij komt als één regel in het register. De toestellen die je later
  per stuk invult krijgen nog geen bewaardatum mee.
- **Wie ziet wat.** Iedereen in het team kan het register lezen, ook geboortedatum en
  legitimatienummer (nodig om aan de balie het DOR te vullen). Strenger kan met een policy
  per rol, maar dan kan een medewerker na de inname het DOR-scherm niet meer zien.
- **Corrigeren.** "Opnieuw" werkt dezelfde regel bij (zelfde volgnummer, datum en
  bewaardatum). Een regel weggooien kan niet.
- **Inruil bij verkoop** (klant ruilt in bij aankoop): loopt nog niet via dit scherm.

---

## Bronnen

1. Art. 437 tot 437ter Sr: https://wetten.overheid.nl/BWBR0001854
2. Uitvoeringsbesluit art. 437: https://wetten.overheid.nl/BWBR0005381
3. APV Gilze en Rijen 2024: https://lokaleregelgeving.overheid.nl/CVDR721682
4. Wetsvoorstel 36036, memorie van toelichting: https://zoek.officielebekendmakingen.nl/kst-36036-3.html
5. Stand in de Eerste Kamer: https://www.eerstekamer.nl/wetsvoorstel/36036_verbetering_bestrijding
6. Handleiding DOR voor opkopers: https://www.nieuwegein.nl/fileadmin/gemeente_nieuwegein/Veiligheid/Handleiding-DOR-opkopers-2019.pdf
7. Kopie van het ID: https://www.rijksoverheid.nl/onderwerpen/identiteitsfraude/vraag-en-antwoord/ben-ik-verplicht-om-een-kopie-van-mijn-identiteitsbewijs-te-geven-aan-een-bedrijf
8. BSN (art. 46 UAVG): https://wetten.overheid.nl/BWBR0040940
9. Inkoopverklaring margeregeling: https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/bijzondere_regelingen/margeregeling/administratie_bijhouden_bij_handel_in_margegoederen/administratieve_verplichtingen/inkoopverklaring_opstellen
10. Art. 4a Uitvoeringsbeschikking OB: https://wetten.overheid.nl/BWBR0002634
11. Koppeling 21QUBZ met het DOR: https://www.21south.nl/nieuwe-standaard-integratie-voor-21qubz-de-api-met-het-digitaal-opkopers-register-dor/
12. Algemene termijnenwet (feestdagen): https://wetten.overheid.nl/BWBR0002448
