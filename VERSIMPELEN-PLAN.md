# Storvo versimpelplan

Hoe we Storvo rustig maken zonder iets kwijt te raken. Opgesteld na een volledige
doorlichting van elke pagina, subpagina en elk venster van de winkelapp en de
refurbish-werkbank.

Dit plan is bewust kort geschreven: korte zinnen, één gedachte per regel, geen jargon.

---

## 1. Het probleem

Het dashboard en het menu van de winkelapp zijn te druk. De eigenaar gebruikt het daarom
niet. De refurbish-werkbank werkt wel, want die is rustig: één ding per scherm, een
duidelijke volgende stap, weinig keuzes tegelijk. Doel: dat gevoel over de hele software.

De cijfers die de drukte veroorzaken, concreet:
- Dashboard "Alles": 15 getallen tegelijk (3 KPI-rijen) plus 9 kaarten.
- Producten: tabel van 12 kolommen, waarvan 6 getallen (4 inline te bewerken).
- Hardware-detail: 6 KPI's, 8 actieknoppen, 12 invoervelden op één scherm.
- Reparatie-detail: ongeveer 10 knoppen in de actierij.
- Rapport: 7 kaarten, waaronder een compleet boekhoud-/belastingdashboard.
- Werkbank-menu: 11 tot 12 nav-items.

---

## 2. De strategie: Rustig als standaard, Uitgebreid als keuze

Niet één van de twee, maar allebei slim combineren. Drie lagen:

1. **Rustig (standaard).** De app toont alleen wat je voor het dagelijkse werk nodig hebt:
   een kort menu, kalme schermen, slimme standaarden.
2. **Uitgebreid (schakelaar).** Eén knop onthult alles: alle pagina's, alle cijfers, alle
   geavanceerde opties. Voor boekhouding, instellingen, analyse. Niks raakt kwijt.
3. **Binnen elk scherm: geavanceerd achter "meer".** Zelfs in Rustig bereik je een
   zeldzame optie via een "meer"-uitklap in context. Zo hoef je bijna nooit te schakelen.

Kernzin: **Simpel is de standaard, geen beperking.** De schakelaar onthoudt je keuze per
toestel. Medewerkers staan sowieso in Rustig; de eigenaar kiest.

Waarom niet alleen opties verstoppen: dat maakt elk scherm kalmer, maar haalt de
structurele drukte (te veel pagina's) niet weg. Waarom niet alleen een modus: dan moet je
schakelen voor elke incidentele actie. De combinatie lost allebei op.

---

## 3. De architectuur: bouwen op wat er al is (niet een vierde systeem)

Dit is de belangrijkste technische keuze. Er bestaan AL drie verberg-mechanismen; een
vierde los systeem zou juist verwarren. We tillen het bestaande dashboard-mechanisme op
tot een app-brede modus.

Wat er al is:
- **Dashboard Simpel/Alles** — `storvo_simpel` in localStorage, `dashModus()`, en de klasse
  `.dash-vol` op alles dat alleen in "Alles" hoort. Standaard simpel, per toestel onthouden.
- **Pagina's uit** — Instellingen > Pagina's (`UITZETBAAR`, `renderPaginas`), per winkel
  pagina's uit het menu halen.
- **Refurbish paginafilter** — `refToegestaan`/`magPagina` verbergt nav-knoppen per rol.

De aanpak:
1. **Eén app-brede modus.** Body-klasse `simpel` (naast de bestaande sectie-klasse). Eén
   schakelaar in de topbar/zijbalk. Standaard simpel, per toestel onthouden (zoals nu).
2. **Tag, geen herbouw.** Geef elk "uitgebreid" blok een vaste klasse (bijvoorbeeld `.vol`,
   zoals `.dash-vol` nu al doet). In simpel: `body.simpel .vol{display:none}`. Je versimpelt
   een scherm dan door te taggen, niet te herschrijven. Laag risico.
3. **Menu trimmen via het bestaande mechanisme.** In simpel toont het menu de dagelijkse
   set; de rest leeft in de "Meer"-hub (beheer is daar al ingeklapt) en in Uitgebreid.
4. **Bewaking inbouwen.** `tests/huisstijl.js` kan controleren dat elke `.vol`-klasse ook
   echt CSS heeft, net als nu voor andere klassen. Geen stille fouten.

Deze ruggengraat is waar bijna elke "quick win" hieronder aan hangt.

---

## 4. De zeven principes (afgekeken van de werkbank)

Dit is waarom de werkbank rustig aanvoelt. Pas dit overal toe.

1. **Eén ding per scherm.** Een scherm vraagt één beslissing of toont één overzicht.
2. **Eén duidelijke volgende stap.** Een grote primaire knop die zegt wat er gebeurt; de
   rest rustig en secundair (of onder een "meer"-menu).
3. **Slimme standaarden boven keuzes.** Vul in wat meestal klopt (btw, locatie, grade-prijs,
   minima). De gebruiker wijzigt alleen wat afwijkt. Minder velden in beeld.
4. **Progressive disclosure.** Zelden nodig? Achter "meer"/"geavanceerd", standaard dicht.
5. **Taal voor de winkelier.** Korte zinnen, concreet, geen jargon, geen streepjes. Een knop
   zegt precies wat er gebeurt; een foutmelding zegt wat mis is en hoe het goed komt.
6. **Vaste plekken.** Dezelfde actie staat overal op dezelfde plek. Je hoeft nooit te zoeken.
7. **Toon de staat, niet de ruwe data.** Een gekleurde pil "actie nodig" leest sneller dan
   een tabel vol getallen. Cijfers zijn voor het verdiepen (Uitgebreid), niet voor de
   dagelijkse blik.

Interne voorbeelden die de app zélf al goed doet en die de lat zijn: de reparatie-bordkaart
met één volgende-stap-knop, het `prodMenu` ⋯-rijmenu, de voorraad-hub-subbalk, de
conditioneel verbergende velden in het product-zoekvenster, en het hele controle-stappenpad.

---

## 5. Wat al gedaan is (richting is ingezet)

- Rustig dashboard met Simpel/Alles-schakelaar + hub met grote knoppen.
- Mobiel: brede tabellen stapelen tot leesbare kaartjes; loglijsten recht; iOS-zoom weg;
  pop-ups passen binnen het scherm; hardware-knoppen en overlays net.
- Rooster in de onderbalk; doorgeven dag-voor-dag.
- Meer-menu: beheer-pagina's standaard ingeklapt.
- Inname + inkoopverklaring (op papier of op scherm); doos-vraag + genummerd dooslabel.

---

## 6. Deel A — Winkelapp, dagelijkse pagina's

### Dashboard
- Simpel is goed. In **Alles** staan 15 getallen: breng de vaste KPI-rij terug naar 3
  (Omzet, Winst, Resultaat), de rest achter "Meer cijfers" (die knop bestaat al voor rij 2
  en 3). Zet "incl. btw" één keer als voetnoot in plaats van op elke tegel.
- Breid in Simpel "wat moet er gebeuren" uit met signalen die `updateBadge` toch al berekent:
  aanvragen klaar voor de klant, kassa te vol, nieuwe webshopbestellingen/inruil. Dan is het
  een echt "to-do vandaag".
- Overweeg de 7 tegels terug naar 5 (Verkopen, Kassa, Reparaties, Aanvragen, Werkbank).
- **Quick win.**

### Verkoop
- Twee ingangen voor hetzelfde los product (de zoek-knop én de kaart "Diensten en losse
  verkoop"). Houd er één (de zoek-knop vangt voorraad + catalogus + hardware al af).
- "Standaarddiensten beheren" (beheer-tabel) hoort niet tussen de dagelijkse acties → naar
  Instellingen.
- Betaalknoppen cash-met/zonder-bon: nodig voor het kasboek, maar oogt als jargon; herzie de
  woorden.
- Categorie-blokje: het "bijbestellen"-vinkje achter "meer" of herformuleren.
- PostNL: het tikken is prima; de hele bewerk-modus (inkoop/percentage/winst) naar
  Instellingen.
- **Quick win.**

### Kassa
- Eén kaart doet twee dingen gescheiden door een streep: "Geld erin of eruit" en "Kassa
  tellen". Geef Tellen een eigen kaart bovenaan (dat is de dagelijkse handeling); geld-in/uit
  en kluis onder "meer". De drie dag-vakken in simpel tot één regel.
- **Quick win.**

### Reparaties
- **Zet de standaardweergave op Bord, niet Lijst** (één regel code). Het bord toont per kaart
  één volgende-stap-knop: precies het rustige scherm dat al gebouwd is, maar niet standaard
  aanstaat. De lijst (tabel van 8 kolommen) is Uitgebreid.
- Intake-formulier (ongeveer 12 invoerpunten): in Simpel alleen naam, tel, toestel, reparatie,
  prijs. E-mail, op-de-hoogte, klaar-datum, voorkeur, onderdelen en prijshulp achter "meer".
- Detailvenster (ongeveer 10 knoppen): hoofdknop groot bovenaan, de rest in een ⋯-menu
  (patroon `prodMenu`). De drie opmerking-knoppen tot één invoer + keuze.
- **Bord-default = quick win. Intake inkorten = quick win. Detail-knoppen naar ⋯ = middelgroot.**

### Aanvragen
- Intake in Simpel: naam, tel, product, prijs, aanbetaling (toon alleen € of alleen %, nu
  twee velden voor één begrip). Inkoop, categorie, e-mail, op-de-hoogte achter "meer".
- "Nog te halen"-aggregatie standaard inklappen in simpel.
- Detail is al relatief rustig; laten.
- **Quick win.**

### Producten
- Tabel van 12 kolommen (6 getallen, 4 inline te bewerken): een spreadsheet, zwaar voor
  dyslexie. In Simpel: naam, categorie, verkoopprijs, één voorraadcel ("3 / 12" =
  winkel/achter), ⋯. De minima en inkoop in het bewerk-detail of Uitgebreid.
- De rij-acties zitten al in één ⋯-menu (`prodMenu`) — goed voorbeeld.
- **Middelgroot** (de inline-bewerk-workflow moet een plek houden).

### Catalogus
- Al een rustig browse-scherm. Kleine opschoning: de soort-filter via een `.aan`-klasse in
  plaats van inline-stijl. **Quick win (cosmetisch).**

### Nieuw product
- Zes getalvelden tegelijk, terwijl ze al slim worden voorgevuld uit de categorie. In Simpel:
  naam, categorie, verkoopprijs, beginvoorraad. Barcode, sku, leverancier, inkoop, 4 minima en
  het QR-scanpaneel achter "meer". Een product in 4 velden. **Quick win.**

### Voorraad tellen
- Al goed (actie-gericht, springt per stap door). Alleen de uitleg-alinea's inkorten.
  **Quick win (tekst).**

### Inscannen
- Clean, doet één ding. Alleen de lange uitleg halveren. **Quick win (tekst).**

### Bijbestellen
- Drie lijsten op één pagina (urgent, automatisch, bijbestel-teller) + twee lange
  uitleg-alinea's (tekstmuur). Uitleg tot één zin. In Simpel de automatische lijst compact
  (naam, code-kopieerknop, te-bestellen, besteld-vinkje); over/min-over achter "meer".
- **Quick win.**

### Hardware
- Lijst van 11 kolommen met veel interactieve elementen per rij. In Simpel: toestel, nummer,
  grade, vraagprijs, één actie (Openen). Inkoop/marge/dagen/kanalen en de uitstalling-toggle
  in Uitgebreid.
- Detail is de dichtste enkele pagina van de app: 6 KPI's, 8 knoppen, 12 velden. Er is AL
  auto-opslaan, dus de "Opslaan"-knop kan weg. Actierij terug naar hoofdknop (Verkopen) +
  ⋯-menu. Velden groeperen (kern zichtbaar, rest onder "meer").
- **"Opslaan" weg + kolommen verbergen = quick win. Detail-herstructurering = middelgroot.**

### Inruil
- Al rustig; de inname-knop bovenaan is juist goed. Alleen uitleg korter. **Quick win.**

### Webshop
- **Tekstfout: de kaartkop heet "Bijbestellen" terwijl de kaart webshop-bestellingen toont →
  "Bestellingen".** In Simpel de 4 KPI's compacter of weg. **Quick win.**

---

## 7. Deel B — Winkelapp, beheer / geld / instellingen

Vrijwel alles hieronder is Uitgebreid: je komt er zelden. De winst is ze uit de dagelijkse
blik halen en per pagina de eerste-indruk-last verlagen.

### Uren
- Bij één teamlid "Wie" weglaten (al verborgen voor medewerker). Twee tabellen samenvoegen
  tot één. Uren en Rooster horen conceptueel bij elkaar (de code zegt dat zelf): overweeg
  Uren als tab binnen Rooster of kruislinken. **Quick win.**

### Rooster
- Goed gebouwd (medewerker-doorgeven is net al versimpeld). Probleem: **vier por-mechanismen
  over hetzelfde** (balk + drie popups). Hoogstens één nudge per rol per dag. Uitleg korter.
  "Neem vorige week over" en kostenweergave achter "geavanceerd".
- Hele module bij een solozaak overbodig → standaard uit (Uitgebreid). **Nudge-consolidatie =
  middelgroot; de rest quick win.**

### Verkopen (log)
- Al rustig. Hoort in Simpel (dagelijks terugkijken). **Geen werk nodig.**

### Inkopen
- De drukste admin-pagina: uitleg-alinea + twee upload-knoppen + 7 velden + "haal uit
  e-mail" + "test Moneybird" op één scherm. Maak **foto/PDF uitlezen de grote primaire knop**
  (dat vult het formulier zelf); de handmatige 7-veldenrij inklappen onder "Of zelf invullen".
  Soort standaard "voorraad" met kleine toggle. btw-tarief, Moneybird, mailimport = Uitgebreid.
- **Quick win.**

### Rapport
- Het overweldigendst: 7 kaarten, waaronder een compleet belastingdashboard (IB-schijven,
  MKB-vrijstelling, zelfstandigenaftrek, btw-kwartalen, startsaldo, balans, prognose). In
  Simpel alleen de kaart **Resultaat** (en eventueel Winst per categorie). De vier fiscale
  kaarten samen achter één uitklapper "Belasting, buffers en balans". **Quick win.**

### Facturen
- Editor toont 7 klantvelden, waarvan 6 optioneel. Standaard alleen klantnaam + regels +
  datum; adres/btw/e-mail achter "Meer klantgegevens". Hele pagina is Uitgebreid (veel winkels
  gebruiken Moneybird). **Quick win.**

### Vaste lasten
- Meevallend. "Soort" weglaten of achter "meer". Instel-pagina → Uitgebreid. **Quick win.**

### Pakketdiensten
- Toont een grote kaart per dienst, ook voor diensten met tarief €0 (ruis). Alleen diensten
  tonen die de winkel echt gebruikt; lege achter "meer toevoegen". Hele pagina optioneel
  (Uitgebreid). **Quick win.**

### Mail
- Volwaardig postvak, netjes. Krachtig power-feature. Zichtbaarheid koppelen aan "is er een
  mailbox ingericht". Categorie-bewerken (pen) van elke chip naar de categorie-detail.
  Uitgebreid. **Quick win (chips) + zichtbaarheid.**

### Labelprinter
- Vier kaarten, waarvan twee eenmalige installatiehandleidingen (Terminal-commando,
  Windows-download) permanent bovenaan. Die twee onder één uitklapper "Nog een printer
  toevoegen". Roltype/tweekleur achter "geavanceerd". **Quick win.**

### Team
- **Dode code: de sub-secties `team-mw` (oude medewerkers-tabel) en `team-teams`
  (vestigingen) zijn onbereikbaar maar worden nog gevuld; er draaien twee parallelle
  medewerker-systemen (legacy `state.medewerkers` naast `accounts`).** Opruimen = quick win +
  bugrisico weg. Gebruiker-detail: standaard rol + omgevingen; pagina-chips en Reloop-chips
  achter "Geavanceerde toegang" (er is al een `<details>` "Meer pagina's"). Uitgebreid.

### Partners
- Netjes. Niche (doorverkopers). Uitgebreid; verbergen als er geen partners zijn.

### Meer (hub)
- De natuurlijke lade voor het uitgebreide spul. Voeg een derde groep "Af en toe / Instellen"
  toe voor Rapport-fiscaal, Vaste lasten, Pakketten, Partners. **Quick win (groepering).**

### Instellingen (algemeen)
- 19 items in 6 groepen; per definitie Uitgebreid. Grootste winst: groepen ingeklapt (op
  mobiel al deels), en scheiding "dagelijks nuttig" (bijna niets) vs "eenmalig/technisch".
  `renderInstellingen` rendert nu alle panelen tegelijk, ook de onzichtbare (kleine
  efficiëntie-winst mogelijk).
- Per paneel: Serie inscannen staat nu onterecht als eerste/actieve paneel en heeft 8 velden
  → default-paneel wijzigen + velden inklappen. Types/Categorieën/Modellen: brede toevoegrijen
  inkorten. Voorraad/Aanvragen/Kassa: uitleg-alinea's korter. Klantpagina: één lange lap →
  uitklapsecties (Uitstraling/Contact/Openingstijden/Teksten). Berichten: het
  prijsvergelijken-blok hoort hier thematisch niet → verplaatsen. Bedrijf/Facturen/Huisstijl/
  Clover/Webshop/Leveranciers/Abonnement/Refurbish/Back-up: set-once, Uitgebreid.
- **Pagina's-paneel**: overweeg hier meteen een "Simpele modus aan/uit" naast de losse
  vinkjes; dit paneel stuurt de modus aan.

---

## 8. Deel C — Refurbish werkbank

De werkbank is terecht de lat. Toch kan ook hier wat rustiger.

### Top-3 aan de werkbank zelf
1. **Reparatie van popup naar eigen pagina.** Reparatie opent nu als venster, terwijl
   controle/apparaat/online echte pagina's zijn. Juist bij reparatie sta je er minuten: het is
   precies het scherm dat je per ongeluk wegklikt. **Grootste inconsistentie van de werkbank.**
2. **Afslanken via inklapbare "details/meer":** Online zetten, Apparaat-detail en Toevoegen
   zijn de drie dichtste schermen.
3. **Menu terugbrengen** via simpel/uitgebreid (hergebruik het bestaande paginafilter).

### Per flow
- **Werkbank/overzicht** — goed. Maak de 4 KPI's klikbaar naar hun lijst; vervang de meestal
  lege kolom "Serienummer" door "Ligt in" (locatie). **Quick win.**
- **Toevoegen/inname** — lang formulier, maar maar 2 velden echt verplicht. Inkoopprijs,
  leverancier, bewijs en batch onder een ingeklapte "Inkoopgegevens (optioneel)". De grootste
  moduswinst: inkoopadministratie is juist wat een solozaak vaak overslaat. Simpel = model,
  soort, aantal, locatie. **Quick win.**
- **Controle-stappenpad** — pronkstuk; weinig nodig. Kleine wins: de na-Windows-stap is te
  dicht (toon de hardware-checks pas als Windows + drivers op Ja staan; accu eventueel een eigen
  micro-stap). "Upgrade" in de tijdlijn → "Ram en ssd". Upgrade-stap: "Niets nodig? Klik door."
  "Zelf naar reparatie" bij de notitie is verwarrend → naar de staat/klaar-stap. In simpel
  verbergen: het partner-blok op de staat-stap. **Quick wins + accublok-stap = middelgroot.**
- **Reparatie** — popup naar eigen pagina (zie boven). Drie ingangen "onderdeel toevoegen"
  (plank/bestellen/zelf) in simpel samenvoegen. **Grotere herbouw.**
- **Online zetten** — drukste scherm (prijskaart alleen al: vraagprijs, voorstel, nieuwprijs,
  advies, grade, garantie, btw, 3 grade-prijsvelden, printen). Inklappen: grade-prijzen onder
  "Meer prijsopties"; nieuwprijs/btw/garantie onder "Details". **btw-keuze staat op 3 plekken
  (toestel/batch/online) — bron van twijfel, kies één.** Simpel = advertentie, foto, vraagprijs,
  publiceren. **Quick win (inklappen) + een echte snelle variant = middelgroot.**
- **Apparaat-detail** — tot 10 actieknoppen → één primaire + ⋯-menu. Kaarten Batch,
  Inkoopbewijs, Extra onderdelen, Marktprijs = Uitgebreid. **Quick win + middelgroot.**
- **Voorraad** — bijna ideaal, goed voorbeeld voor de winkelapp. Partner-acties al verborgen
  zonder partner. **Geen werk.**
- **Onderdelen** — "Onderdelen" betekent op één pagina twee verschillende dingen
  (ingekochte voorraad vs. uit sloop gehaalde delen) met twee formulieren: de verwarrendste
  naamgeving. Hernoemen of splitsen. **Overlapt met Bestellen.**
- **Bestellen** — hoort bij Onderdelen (de bestellijst voedt de plank). Samenvoegen tot één
  hub (Voorraad / Te bestellen / Bestellingen). **Grotere herbouw.**
- **Batches** — power-user/boekhouding, heel lang detail. Hele module in Uitgebreid.
- **Bundels** — nichefunctie (tweede webshop). Hele module in Uitgebreid; alleen tonen als er
  een tweede webshop gekoppeld is.
- **Donoren** — simpel, prima. Kandidaat om in simpel te verbergen.
- **Partners** — gebruikt `prompt()`/`confirm()` (OS-dialogen, tegen de huisstijl) → eigen
  venster. **Quick win.**
- **Instellingen (tab-id nog "tab-checklists")** — **dode code: `in_accu`/`in_scan`/
  `in_sjabloon`/`in_toon` en de functies eromheen zijn wees-code (verhuisd naar Storvo).**
  Opruimen. Tab-id ooit hernoemen. **Quick win.**

---

## 9. Fasering

### Fase 0 — Ruggengraat (doe eerst)
- App-brede Simpel/Uitgebreid-modus: generaliseer het dashboard-mechanisme (body-klasse +
  `.vol`-tagklasse + huisstijl-controle). Eén schakelaar. Hieraan hangt bijna alles.

### Fase 1 — Quick wins (laag risico, veel rust; vooral taggen + tekst + verplaatsen)
- Reparaties standaard op Bord.
- Dashboard Alles: 3 KPI's default, rest achter "Meer cijfers"; to-do uitbreiden.
- Verkoop: dubbele los-product-ingang weg; diensten-beheer naar Instellingen.
- Kassa: Tellen eigen kaart; geld-in/uit en kluis onder "meer".
- Nieuw product / aanvraag-intake / reparatie-intake: kernvelden, rest achter "meer".
- Hardware: "Opslaan"-knop weg; lijstkolommen verbergen in simpel.
- Webshop: foute kop "Bijbestellen" → "Bestellingen".
- Rapport: 4 fiscale kaarten in één uitklapper.
- Inkopen: foto-uitlezen primair; handmatige velden inklappen.
- Labelprinter: twee installatiekaarten inklappen.
- Opruimen dode code: Team `team-mw`/`team-teams`; refurbish `in_*`-wees-code.
- Refurbish: KPI's klikbaar; "Upgrade" → "Ram en ssd"; `prompt()` bij Partners → venster;
  Onderdelen-kaarten duidelijker benoemen; Toevoegen-inkoopgegevens inklappen.
- Overal: lange uitleg-alinea's halveren.

### Fase 2 — Middelgroot
- Reparatie-detail en Hardware-detail: actierijen naar hoofdknop + ⋯-menu; velden groeperen.
- Producten-tabel: kolommen terugbrengen met een plek voor de bewerk-workflow.
- Online zetten: inklapsecties + een snelle één-koloms variant.
- Rooster: nudges consolideren tot één melding per rol per dag.
- Klantpagina en Team-detail: opdelen in uitklapsecties.

### Fase 3 — Grotere herbouw
- Refurbish: reparatie van popup naar volwaardige pagina.
- Refurbish: Onderdelen + Bestellen samenvoegen tot één hub.
- Winkelapp: controle of de modus consequent over elk scherm klopt.

---

## 10. Losse opruim- en kwaliteitspunten (buiten de modus)
- **Dode code weg:** Team `team-mw`/`team-teams` + legacy `state.medewerkers`; refurbish
  `in_*`-velden en wees-functies. Beide zijn precies het stille-fout-type dat de huisstijl-test
  bewaakt.
- **Tekstfout:** webshop-kaartkop "Bijbestellen" → "Bestellingen".
- **OS-dialogen weg:** `prompt()`/`confirm()` bij refurbish-Partners → eigen venster (tegen de
  huisstijl).
- **btw-keuze op één plek:** nu op toestel, batch én online zetten; kies de bron van waarheid.
- **Beveiliging (los noteren):** leveranciers-wachtwoorden worden lokaal onversleuteld
  bewaard; apart bekijken.
- **Bij elke wijziging:** `npm test` groen houden (huisstijl-test vangt dubbele id's, klassen
  zonder CSS, knoppen naar niet-bestaande functies). Geen streepjes in nieuwe klantteksten.
