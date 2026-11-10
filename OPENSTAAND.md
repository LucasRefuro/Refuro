# Openstaand

Bijgewerkt op 10 augustus 2026. Alles hieronder is nagelopen tegen de code; wat
er niet in staat is af.

---

## Na het versimpelplan (27 oktober tot 2 november 2026)

Het versimpelplan is uitgevoerd; de stand en de bewuste afwijkingen staan bovenin
`VERSIMPELEN-PLAN.md`.

- [x] **Eigen venster in plaats van `confirm()`.** GEDAAN: winkelapp (9aad1fb) en admin,
      portaalbeheer en klantportaal (8522b19). Nergens meer een venster van het systeem.
- [x] **Leveranciers-wachtwoorden versleutelen.** GEDAAN (cc9f61f): versleuteld in
      `leverancier_inloggegevens` via de edge function `leveranciers`, niet meer in de blob.
- [x] **Modules aan en uit.** GEDAAN (0ca1aef, ca56888): elke module van de winkelapp aan
      of uit bij Instellingen, Modules en weergave. Synct naar elk apparaat. Inruil zit
      onder Verkoop; groep Hardware naast Winkel; Labelprinter is een koppeling bij
      Instellingen. Zie de memory "modules-aan-uit".
- [x] **Hulp-assistent bijgewerkt** (edge `assistent` v3): kent de nieuwe indeling en kan
      ook naar Kassa, Aanvragen, Inruil en Webshop brengen.
- [ ] **Eigenaar: Kassa en Winkelvoorraad uitzetten** bij Instellingen, Modules en
      weergave (wens van 2 november). Bewust niet vanaf de server in de winkeldata gezet.
- [ ] **Eigenaar: één leverancierswachtwoord opslaan** als test (Instellingen,
      Leveranciers): het veld moet daarna leeg zijn met "Opgeslagen", ook na verversen.
- [ ] **Visueel nalopen.** Simpel en Alles, en de modulepagina, op een echte telefoon en
      computer bekijken. De app is te groot voor het voorbeeldvenster; alles is in jsdom
      gecontroleerd.

## Hardware los toevoegen en online zetten vanuit de winkel (10 november 2026)

- [x] **Winkelapp ververst zichzelf** bij een nieuwe versie (7c64dd2). Op een rustig moment,
      anders een kaartje in de zijbalk. Eén keer Cmd+R op elke Mac die nog de oude versie had.
- [x] **Los toevoegen:** standaard 24 maanden garantie, vinkje Doos erbij, accuconditie en
      Nieuwe accu (b393d37). Nieuwe kolom `hardware.doos` (migratie gedraaid).
- [x] **Los toegevoegd staat ook in het refurbish-deel.** Functie `koppel_losse_hardware()`
      (migratie gedraaid) maakt een werkbank-rij met A-nummer, stap `los`. Beide apps roepen
      hem aan. Wat je in de winkelapp aanpast (model, grade, accu, doos) gaat mee.
- [x] **Online zetten in de winkelapp:** knop op de hardwarepagina en in het Online-menu
      opent de refurbish-pagina als venster. Een los toestel neemt zijn eigen garantie,
      prijs, tekst en foto's mee.
- [x] **Edge `shopify` v28 uitgerold** (10 nov, met akkoord). De accu van een los toestel komt
      nu ook op de productpagina.
- [x] **Overal 24 maanden garantie** (10 nov, eigenaar koos). Werkbank naar voorraad, de online-
      pagina, de prijskaartjes en de standaard van `hardware.garantie` (migratie gedraaid). De twee
      opgeslagen modeladvertenties stonden op 12 en zijn naar 24 gezet. Bundels voor de groothandel
      (edge `webshop2-webhook`) bewust op 12 gelaten.
- [ ] **Eigenaar: één los toestel echt online zetten** vanuit de winkelapp en kijken of het
      goed op refuro.nl staat.
- [x] **Merk en kleur kiezen** (10 nov). Merk uit een lijst (Ander merk: typen). Kleur van een
      telefoon of tablet uit de kleuren die van dat model bestaan (winkelapp: keuzelijst;
      werkbank toevoegen en Online zetten: knoppen). Tabel `model_kleuren` (migratie gedraaid).
- [x] **Edge `model-kleuren` v1 uitgerold** (10 nov, met akkoord).
- [x] **Kleur bij aanmaken:** "Wat voor toestel" staat nu bovenaan; een iPhone of Galaxy wordt
      vanzelf een telefoon, dan staat het kleurveld er meteen.
- [x] **Publiceren wiste de kleur** (Online zetten schreef de specs zonder kleur terug). Opgelost.
- [x] **Edge `shopify` v29 uitgerold** (10 nov, met akkoord). Foto's gaan ook naar een product dat al
      online stond zonder foto's; een oude advertentie wordt bijgewerkt als de kleur verandert.
- [x] **S24 opnieuw online** (A0089, Onyx Black, met foto's). Kleurenlijst werkt (7 kleuren).
- [x] **Specificaties van telefoons en tablets** (winkelapp): vanzelf opgehaald via model-specs als
      ze ontbreken, knop Specs ophalen; opslag kies je uit de varianten; online toestel wordt meteen
      bijgewerkt. Publiceren in Online zetten wist de specs en kleur van de winkelapp niet meer.
- [ ] **Eigenaar: A0089 één keer openen** in Hardware (specs komen dan vanzelf) en de opslag kiezen.
- [ ] **Thema: btw-regel** (refuro-webshop): bij margeregeling geen "Incl. btw", anders klein. Staat
      op de preview-kopie samen met net verkocht en de grades; wacht op jouw ja voor live.

---

## Inkoopregister, DOR en de telefoon (3 november 2026)

Alles staat in `INKOOP-DOR-STAPPENPLAN.md`, met de bronnen.

- [x] **Telefoon: niets schuift meer opzij.** GEDAAN (cf8aa63, 728d8d0). Tabellen worden op
      de telefoon kaartjes (winkelapp vanaf drie kolommen, werkbank ook), filterknoppen
      breken af, het werkbankmenu is een Menu-knop met een lijst. Test: `tests/mobiel.js`.
- [x] **Inkoop bij een particulier met DOR-velden.** GEBOUWD, WACHT OP UITROL. Eén scherm in
      de werkbank vult het inkoopregister en de inkoopverklaring: verkoper, legitimatie
      (alleen soort en nummer), serienummer of IMEI per toestel, onder de 18 gaat niet
      door, en de verklaring zegt nu ook dat er geen btw is afgetrokken. Daarna het scherm
      "Overnemen in het DOR" met kopieerknoppen. Vijf werkdagen bewaring (APV 2:68) met een
      waarschuwing in de werkbank. Winkelapp, Inkopen: blok "Inkoop bij particulieren" met
      PDF per inkoop, alles van de periode in één PDF, en een lijst voor de boekhouder.
      Test: `tests/inkoopregister.js`.
- [x] **Uitrol:** GEDAAN (3 nov). Migratie `20261103120000_inkoop_registraties.sql` gedraaid
      (volgnummer-trigger getest), gepusht als 16f376d en live op storvo.app.
- [ ] **Eigenaar: één echte inname doen** met verklaring: komt hij in het register, opent het
      DOR-scherm, en staat hij daarna op Inkopen bij "Inkoop bij particulieren"?
- [ ] **Eigenaar: gemeente bellen** (14 0161): is het DOR in Gilze en Rijen verplicht?
- [ ] **Eigenaar: DOR-koppeling aanvragen** met de mail in `INKOOP-DOR-STAPPENPLAN.md`.
      Tot die er is: overnemen met de kopieerknoppen.
- [ ] **Later:** geboortedatum en legitimatie na 4 jaar leegmaken (zodra de wet dat zegt);
      bewaardatum ook voor toestellen uit een batch.

---

## Nu openstaand — refurbish + webshop (27 september 2026)

Bijgehouden zodat de Storvo-chat en de refuro.nl-webshop-chat vanuit dezelfde lijst
werken en elkaar niet in de weg zitten. Dezelfde lijst staat als `WERKLIJST.md` in de
repo `refuro-webshop`.

### Nog te bouwen (code)
- [x] **Meer specs in de spec-tabel.** GEDAAN (28 sep). `model-specs` v20 levert voor laptops
      nu ook Gewicht, Materiaal en Poorten; die reizen via de refurbish-opslag naar de
      metafields (bestonden al) en de webshop-spectabel. Besturingssysteem bewust weggelaten
      (os-rij komt uit de Windows-uitlezing). Kanttekening: al eerder opgezochte modellen in
      `hardware_modellen` houden hun oude specs (cache); alleen nieuwe modellen krijgen de 3
      extra velden. Telefoon-"Poorten" (laadpoort) nog optioneel toe te voegen.
- [x] **Uitlezen waterdicht.** GEDAAN (3 nov). De testpagina geeft op Windows een regel om
      in PowerShell te plakken (`$code='A0001';...;irm .../refurbish/uitlezen.ps1|iex`): geen
      download, geen SmartScreen, geen administrator. Het script staat één keer in
      `refurbish/uitlezen.ps1` (Vercel geeft het als platte tekst); het .bat-bestand is nu een
      dun vangnet dat dezelfde regel draait. Nog doen: één keer echt proberen op een laptop.
- [ ] **Lijst springt naar boven bij invullen.** Pinpoint nodig: welk scherm en veld.
- [x] **Donorlaptop: onderdelen oogsten.** GEDAAN (29 sep). Vanaf het eerste hardwaredefect
      (op de hardware- en de na-Windows-stap) verschijnt de knop "Maak er een donorlaptop van",
      die naar de sloopstap springt (reversibel, Terug werkt). De laptop-sloopdelen zijn nu de
      volledige gegroepeerde lijst (zie hieronder); elk vinkje wordt al een losse regel op de
      onderdelenplank (`refurbish_onderdelen`, deed `ctrSlopen` al). Alleen laptop (profiel-vlag
      `donorKnop`); telefoon/tablet later. Twee keuzes voorlopig zo gezet, nog te bevestigen:
      niets staat vooraf aangevinkt, en een geoogst onderdeel krijgt geen inkoopprijs (prijs
      kun je later op de onderdelenlijst zetten). De getoonde, gegroepeerde lijst:
      - Scherm: LCD/LED-paneel, touchscreen-digitizer (bij touch), schermkabel (eDP/flatcable),
        scharnieren, deksel (A-cover), schermrand/bezel (B-cover), webcam, microfoon,
        wifi-antennes (lopen door het scherm), helderheidssensor.
      - Moederbord en rekenwerk: moederbord, processor (CPU, vaak gesoldeerd), RAM (SO-DIMM),
        SSD (M.2 NVMe of SATA), 2.5"-schijf (HDD/SSD), wifi/bluetooth-kaart (M.2),
        WWAN/4G-kaart (optioneel), CMOS/RTC-batterij, BIOS-chip.
      - Energie en koeling: accu, oplaadpoort/DC-jack, ventilator, heatpipe/koelblok,
        laadadapter (los erbij).
      - Invoer: toetsenbord, touchpad, aan/uit-knop, vingerafdruklezer, trackpoint (ThinkPad).
      - Behuizing: palmrest (C-cover), bodemplaat (D-cover), rubber voetjes, schroef/montageset.
      - Poorten en audio: I/O-board (los poortenprintje), USB/USB-C, HDMI/DisplayPort,
        audio-jack, SD-kaartlezer, ethernet-poort (RJ45), luidsprekers.
      - Kabels: accukabel, touchpadkabel, luidsprekerkabel, I/O-flatcable, antennekabels.
      Voorlopig gekozen (te bevestigen): niets vooraf aangevinkt, en geen inkoopprijs per
      geoogst onderdeel. Later hetzelfde voor telefoon en tablet als donor.

### Webshop (thema)
- [ ] **Uitgelicht product in het mega-menu.** Nu vaste placeholder-tekst ("Deal van de
      week"). Bouwen: thema (`snippets/mega-vast.liquid`) toont het product met de tag
      `uitgelicht` (echte foto/titel/prijs, klikbaar), plus een schakelaar "Uitlichten" in
      Storvo die die tag meestuurt. Storvo overschrijft de tags bij elke push, dus met de
      hand taggen in Shopify houdt geen stand. (Thema-kant half klaar, nog niet gecommit.)
- [ ] **Upsell (productpagina + winkelwagen).** Onder de 12-maanden-garantie een kort
      upsell-blok (stijl Thuisbezorgd) met 4 keuzes: sleeve, bluetooth-muis, McAfee, Office
      Professional Plus. Die 4 als losse Shopify-producten, in het thema te kiezen. Ook als
      cross-sell in het winkelwagen-venster EN op de winkelwagen-pagina. Hergebruikt het
      bestaande upsell-mechanisme (nieuwe accu).
- [ ] **Winkelwagen opschonen.** Sluitknop = alleen het kruisje (geen extra cirkel/blauw
      rondje). Het totaal/afreken-blok is druk, meer witruimte aan de zijkanten. De
      "Winkelwagen bekijken"-link heeft een lange oranje lijn eronder. En de regel toont
      "Uitstekend · [lange interne SKU]" als platte tekst; maak daar nette tags van (grade
      als tag) en haal de lange SKU weg.

### Ophaal-flow (adres overslaan + betalen of reserveren)
- [x] **1. Adres overslaan + nu betalen = Shopify "Lokaal afhalen".** GEDAAN (28 sep).
      Aangezet voor de locatie (hernoemd naar "Refuro Rijen", adres Hoofdstraat 7a ingevuld,
      Nederlands ophaalbericht). Getest op de live checkout: "Afhalen" slaat het bezorgadres
      over, ophaalpunt Refuro Rijen, gratis, daarna online betalen. Bleef eerder leeg omdat
      de locatie geen adres had.
- [x] **2. Reserveren (betaal in de winkel).** GEBOUWD (28 sep), wacht op push + test.
      Tabel `webshop_reserveringen` + `hardware.status='gereserveerd'`, edge `reservering`
      (reserveer/afrekenen/annuleren/verval, verify_jwt uit, vervaltijd 3 dagen), op de
      productpagina een klein reserveer-linkje bij "Ophalen in Refuro Rijen" dat een pop-up
      met het formulier opent (geen losse knop, velden niet los op de pagina), en een
      Reserveringen-kaart op de Webshop-tab in de winkelapp (afrekenen pin/contant +
      annuleren, ruimt verlopen op). Reserveren zet het toestel op gereserveerd (valt uit de
      grade-telling) en zet de Shopify-voorraad meteen -1, dus geen dubbelverkoop. Afwijspaden
      van de edge getest, `thema geldig`, `npm test` groen. Nog te doen: theme push + Storvo
      live, dan end-to-end testen. Optioneel: kasboek-regel bij afrekenen (nu telt de verkoop
      via hardware.verkocht) + `RESERVERING_DAGEN`/`RESERVERING_NAAR` in Supabase.
- [ ] **Productpagina + winkelmandje eerlijk maken** over de ophaal-keuze (nu toont het
      winkelmandje er niks over; definitieve keuze valt pas bij het afrekenen).

### Bugs / kwaliteit
- [x] **Clover pin: 0% vs 21% btw (marge) voor toestellen.** GEDAAN (29 sep). De Clover-
      verkoopsync (`cloverBestellingenVerwerken`) matcht een bon-regel nu ook tegen de
      toestellen (`hwData`, op artikelnummer/barcode/sku). Match op voorraad -> boeken met
      marge-btw + inkoop en het toestel op verkocht (net als de balie, `cloverToestelVerkocht`);
      match op al-verkocht -> overslaan (geen dubbeltelling). Losse producten blijven 21%.
      RESIDU: verkoop je een toestel op Clover als LOS bedrag (zonder artikelnummer/barcode op
      de bon), dan kan de software het niet als toestel herkennen -> boekt als 21% over de hele
      prijs, en bij een dubbele aanslag (ook in Storvo) telt het dubbel. Oplossing: toestellen
      als artikel in Clover zetten of altijd in Storvo aanslaan (Clover alleen de pin). Verifieer
      met 1 echte Clover-toestelverkoop dat de btw in het Rapport als marge verschijnt.
- [x] **Telefoons/iPhones krijgen geen automatische foto's.** GEDAAN (3 nov): migratie
      `20261102120000_refurbish_fotos_kleur.sql` toegepast, edge `productfotos` v24 (met
      `galaxy.ts`, verify_jwt uit) en `refurbish/index.html` live.
      Bronnen nagelopen: de leveranciersfeeds (OneStopMobile, MondiParts, Foneday) hebben
      alleen hoesjes en onderdelen, geen toestellen. Apple blokkeert Icecat en er is geen
      andere iPhone-bron die een winkel mag gebruiken (GSMArena en apple.com niet, Apples
      persfoto's alleen voor nieuws). Samsung staat wel in de gratis Icecat, met 5 tot 9
      fabrieksfoto's, maar alleen op de volle fabriekscode.
      Nu zo: **Galaxy** gaat vanzelf. Uit naam en kleur maken we de code (S23 groen wordt
      SM-S911BZGDEUB) en Icecat zegt welke bestaat. Nagelopen voor S10 tot S25, Note, Fold,
      Flip en de meeste A-modellen. Zonder kleur zoeken we niet (dan staat er "vul de kleur
      in"). **iPhone**: de kaart zegt dat je hem één keer zelf vult. Fotografeer één mooi
      exemplaar en druk op "Voor het hele model"; elk volgend toestel van dat model in die
      kleur heeft ze dan vanzelf. Fabrieksfoto's van telefoons horen nu bij model EN kleur
      (nieuwe kolom `refurbish_fotos.kleur`), zodat een groene S23 nooit de zwarte set
      toont. Laptops ongewijzigd. Test: `tests/productfotos-telefoon.js`.
      NOG NALOPEN in de app (niet getest met een echte inlog): één Galaxy met kleur online
      zetten (foto's moeten vanzelf komen) en één iPhone fotograferen en "Voor het hele
      model" drukken.
      Later: de telefoon-fotoset (`refurbish/foto.html`) noemt de aanzichten nog
      "Toetsenbord" en "Dicht, van boven"; voor telefoons eigen namen geven.
- [x] **Foto-ophaal grijpt soms een merklogo i.p.v. een productfoto.** OPGELOST (28 sep).
      Icecat gaf voor de Dell Latitude 3520 alleen een merklogo terug (`Type: BrandLogo`, pad
      `/img/brand/`). Edge `productfotos` v23 filtert die er nu uit; blijft er niets over, dan
      telefoonfoto. De al opgeslagen logo-foto van de 3520 is verwijderd. Let op: Dell-dekking
      in de gratis Icecat blijft mager, dus veel Dells vallen sowieso terug op de telefoonfoto.

### Grade-varianten afmaken (webshop)
- [x] **Fase 3, de webhook.** GEDAAN (29 sep, edge `shopify-webhook` v21). Een verkochte grade
      bindt nu het juiste onverkochte exemplaar per VARIANT (oudste eerst, FIFO), niet meer op
      product-id (waardoor bij grades het verkeerde of geen toestel op verkocht ging). Idempotent
      over de losse created/paid/fulfilled-meldingen; de variant wordt meebewaard zodat annulering
      het juiste toestel terugzet. Aanrader: één echte grade-aankoop doen om te bevestigen dat het
      juiste exemplaar bindt.
- [x] **Fase 4.** GEBOUWD (2 nov), WACHT OP UITROL. Per grade toont de productpagina de
      staat, de accu en het toestelnummer van het exemplaar dat je echt krijgt, en de pagina
      opent altijd op een grade die op voorraad is. Edge `shopify` zet per grade-variant
      `refuro.staat`, `staat_toelichting`, `accu_gezondheid` en `refuro.wachtrij` (alle
      exemplaren, oudste eerst: de volgorde waarin webhook en reservering binden). Dat gaat
      los van productSet via metafieldsSet, dus een afwijkende metafield-definitie breekt het
      online zetten niet (dan komt er een let-op-melding). De A-tekst zegt geen "als nieuw" meer.
      Thema: `refuro-webshop` commit 441f420, met uitrolstappen in `WERKLIJST.md`.
      Meegevonden in het thema: het productscript stopte stil op elke productpagina. Tabs
      werkten niet en een andere grade kiezen veranderde de variant in het mandje niet. Gefixt.
      **Uitrol:** 1) edge `shopify` GEDAAN (3 nov, v26, met de gradeSchat-centen van 8b1f3ac),
      2) de vier thema-bestanden pushen (WERKLIJST), 3) elke grade-advertentie één keer opnieuw
      online zetten.

- [x] **Net verkocht op een open productpagina.** GEBOUWD (3 nov), WACHT OP UITROL.
      Verkoop je een toestel aan de balie terwijl iemand de productpagina open heeft, dan ziet
      die klant binnen 20 seconden "Net verkocht" op de plek van de koopknop, en zeker vóór het
      reserveervenster opent. Daaronder 3 vergelijkbare toestellen (eigen keuze: zelfde model,
      dan serie, dan merk, dan prijsklasse). Is alleen de gekozen staat weg, dan wijst hij naar
      de staat die er nog is. Keuze eigenaar: het laatste exemplaar blijft staan als verkocht
      (voorraad 0, status niet vermeld, uit de lijsten), geen foutpagina meer. Zelf offline
      halen = concept. Komt dezelfde uitvoering terug, dan hetzelfde product en dezelfde link.
      Storvo: `supabase/functions/shopify/uitverkocht.ts` + `index.ts`, test
      `tests/webshop-uitverkocht.js`. Thema: zie `WERKLIJST.md` in refuro-webshop.
      **Uitrol:** 1) het thema samen met fase 4 pushen (7 bestanden, WERKLIJST), 2) ~~edge
      `shopify`~~ GEDAAN (3 nov, v27, verify_jwt true, terughaald en gelijk aan git 9db54a0).
      **Testen na de thema-push:** het laatste exemplaar van een advertentie aan de balie
      verkopen. De link moet blijven werken met "Net verkocht" en alternatieven; in Shopify
      staat het product op "Niet vermeld" met voorraad 0.

### Testen
- [ ] **Grade-varianten tegen de live shop:** tweede exemplaar van dezelfde uitvoering =
      voorraad +1, geen nieuwe advertentie.
- [ ] **Na de uitrol van fase 4:** twee exemplaren van één grade online, één kopen of
      reserveren. De pagina moet daarna meteen het tweede toestelnummer en de tweede accu tonen.
- [x] **HP ProBook 450 G8 (A0084)** stond in Storvo op voorraad, maar Shopify zei
      uitverkocht. UITGEZOCHT (3 nov): de test-reservering is op 5 okt met losse SQL geannuleerd
      (annuleertijd en toestel hebben dezelfde Postgres-tijd tot op de microseconde), dus buiten
      de edge om; Shopify hoorde er nooit van. Ze stond ook al twee dagen over de vervaldatum,
      want vervallen liep alleen als iemand de lijst opende. GEBOUWD: edge `reservering`
      (`voorraad.ts`) hangt het toestel aan de huidige variant uit `webshop_producten`, zet de
      voorraad van precies die grade, maakt het product weer actief als het op niet vermeld
      stond, en geeft een fout terug in plaats van hem alleen te loggen (de winkelapp zegt het
      dan). Vervallen loopt elk uur via pg_cron (migratie `20261103180000`). Afrekenen van het
      laatste exemplaar zet het product op niet vermeld, zoals een balieverkoop. Test
      `tests/reservering-voorraad.js`. **UITGEROLD (3 nov):** edge `reservering` v7 (index.ts +
      voorraad.ts + ../shopify/uitverkocht.ts, verify_jwt false zoals v6; rooktest goed) en de
      taak `reservering-verval-uur` (minuut 7, cron-pad getest: 200, niets te doen).
      **A0084 zelf:** één keer opnieuw online zetten. Dat is ook stap 3 van de fase-4-uitrol.

### Jouw actie (code is klaar)
- [ ] **Bestaande producten opnieuw online zetten** -> net artikelnummer (A0016), OS-rij,
      conditietekst zonder streepje verschijnen (zitten al in shopify-edge v25).
- [ ] **Oude advertenties met verzonnen tekst opnieuw laten schrijven** (bv. de Dell met
      "Face ID"). Nieuwe worden goed, oude niet vanzelf.
- [ ] **(Optioneel) Eigen `ICECAT_GEBRUIKER`** zetten i.p.v. de gedeelde open-gebruiker
      (`openIcecat-live`), voor meer merken en minder kans op limieten.

### Bekende beperkingen / klein
- Apple-toestellen zitten niet in de gratis Icecat -> vallen terug op de telefoonfoto (bewust).
  Voor iPhones is daar nu de knop "Voor het hele model": één keer fotograferen per model en kleur.
- Diagnose-logregels in de foto-functie (edge `productfotos`) mogen later weg.

### Klaar op schijf webshop, wacht op `shopify theme push` (28 sep)
- **"Ophalen" was niet aanklikbaar** op de productpagina. Oorzaak: de metafield
  `winkelvoorraad` wordt nog niet gevuld (0), waardoor de ophaal-optie `disabled` rendert.
  Opgelost in het thema: ophalen is altijd te kiezen (elk toestel ligt fysiek in de winkel);
  `winkelvoorraad` stuurt alleen nog de uitleg-tekst. Verder gehard: leverkeuze-handler
  vóór de variant-JSON gebonden (keuze wordt ook bij één variant op de bestelling gezet) +
  CSS-vangnet `:has(input:checked)`.
- **Galerijfoto's volledig en even groot in het vak** (`object-fit:contain`, `padding:8%`,
  vast 4:3-vak), zodat liggende laptop- en staande telefoonfoto's allebei volledig passen.

### Al gedaan en live deze sessie (ter info, niet opnieuw doen)
- Accu: geen valse 100% meer; de meting meldt het als de slijtage niet betrouwbaar te meten is.
- Foto's automatisch via Icecat + e-mail valt terug op de open-gebruiker + backup-codes per merk.
- Advertentie: titel = merk/model/basisspecs met "|", tekst zonder verzonnen functies of AI-clichés.
- Thema (live op refuro.nl): kaartfoto's volledig + blauw weg, prijs bij uitverkochte grades,
  lang artikelnummer weg.
- shopify-edge v25: net artikelnummer, OS-rij gevuld, conditietekst zonder streepje.
- Advertentie per model bewaard en hergebruikt bij online zetten (webshop_grade_prijzen uitgebreid).

---

## 1. Eerst dit, anders werkt de webshopkoppeling niet

De code staat er en is uitgerold. Er ontbreken alleen nog drie instellingen, en
zonder die drie weigert de koppeling te starten. Dit is dus de eerste blokkade.

### Een sleutel om tokens mee te versleutelen

In je terminal:

```
openssl rand -base64 32
```

Die ene regel zet je in Supabase → Project Settings → Edge Functions → Secrets
als **`KOPPELING_SLEUTEL`**. Niet in een chat plakken, niet in de code.

Raak je hem kwijt, dan zijn de opgeslagen webshoptokens onleesbaar en moet elke
winkel opnieuw koppelen. Verder gebeurt er niets ergs.

### Een Shopify-app aanmaken

In het [Shopify Dev Dashboard](https://dev.shopify.com/dashboard) een app maken
met de naam `Storvo`. Als toegestaan terugkomstadres:

```
https://ugilfxqolemxwssbpdwu.supabase.co/functions/v1/shopify-installeren
```

Kies **Custom distribution** en vul je eigen winkel in.

> Let op: de distributiemethode is achteraf **niet** te wijzigen. Custom mag op
> één winkel en heeft geen goedkeuring van Shopify nodig. Voor klanten heb je
> straks een tweede app nodig met Public distribution; zie punt 5.

De **Client ID** en **Client secret** van die app komen in Supabase te staan als
**`SHOPIFY_CLIENT_ID`** en **`SHOPIFY_CLIENT_SECRET`**.

### Opruimen

`SHOPIFY_WINKEL`, `SHOPIFY_TOKEN` en `SHOPIFY_WEBHOOK_SECRET` mogen weg. Die
waren van de oude opzet met één webshop voor het hele platform.

---

## 2. Nog niet in het echt geprobeerd

Dit is gebouwd en getest met nagebootste antwoorden, maar heeft nog nooit een
echte winkel of een echte klant gezien. Reken op kleine dingen die pas dan
bovenkomen.

- **De webshopkoppeling van begin tot eind.** Koppelen, een toestel online
  zetten, hem kopen in je eigen webshop, en kijken of hij uit de voorraad gaat
  en als bestelling verschijnt.
- **De bestellingenpagina.** Er is nog nooit een echte bestelling doorgekomen.
- **Het annuleren van een bestelling** zet het toestel terug op voorraad. Dat
  pad is nooit echt gelopen.
- **De AI-onderdelen**: prijsadvies, de schermhoeken zoeken, de advertentie
  schrijven, uitvoeringen per model opzoeken. Werken in de tests, maar de
  kwaliteit van de antwoorden kun je alleen in de praktijk beoordelen.
- **De achtergrond op het beeldscherm.** De wiskunde is met een echte canvas
  nagerekend en het resultaat klopt, maar nooit op een echte foto van een
  laptop op jouw werkbank.

---

## 3. Bij jou, om Storvo verder live te krijgen

- **Nederlands sim-only nummer** voor WhatsApp
- **Meta-bedrijfsverificatie** afmaken
- **De zes WhatsApp-sjablonen** indienen bij Meta
- **`ICECAT_GEBRUIKER`**: een gratis Icecat-account aanmaken en de
  gebruikersnaam in Supabase zetten. Zonder dat werkt het ophalen van
  fabrieksfoto's niet.
- **Bepalen wat de refurbishmodule per maand kost**, en die prijs in Stripe
  zetten

---

## 4. Bewust niet gebouwd

Geen vergeten werk, maar keuzes. Staan hier zodat niemand ze opnieuw hoeft te
bedenken.

- **Marktplaats koppelen.** Die hebben geen bruikbare API voor gewone
  advertenties. Het blijft kopiëren en plakken, met een handmatig vinkje zodat
  je wel ziet dat een toestel daar nog weg moet.
- **Prijzen van Back Market en Refurbed automatisch ophalen.** Mag niet van hun
  voorwaarden en breekt bij elke wijziging aan hun website. Het prijsadvies
  werkt daarom met je eigen geschiedenis plus een schatting, met zoeklinks om
  het in tien seconden na te lopen.
- **Foto's per model delen tussen winkels.** Fabrieksfoto's worden nu per
  toestel opgehaald. Een gedeelde fotobibliotheek per model zou schelen in
  opslag en tijd, maar is nog niet gebouwd.
- **Het logo op de laptopfoto automatisch bijsturen.** De hoeken worden door AI
  gezocht en jij sleept ze bij. Volautomatisch gaat mis zodra er een spiegeling
  in zit, en dat merk je pas als de advertentie online staat.

---

## 5. Later, als er klanten bij komen

**Een tweede Shopify-app met Public distribution.** De app uit punt 1 werkt op
één winkel. Zodra een andere reparatiezaak Storvo gaat gebruiken heb je een app
nodig die op meerdere winkels mag, en die moet door de beoordeling van de
Shopify App Store heen. Reken op weken, niet dagen.

De code eromheen verandert niet: dezelfde OAuth-stroom, alleen een andere client
ID en secret. Wat er wel bij komt kijken:

- een app-vermelding met schermafbeeldingen en teksten
- de verplichte privacy-webhooks (`customers/data_request`, `customers/redact`,
  `shop/redact`)
- Shopify's eisen rond klantgegevens

---

## 6. Klein en oud

- **Lekwachtwoord-bescherming** in Supabase kan pas aan op het Pro-pakket.
