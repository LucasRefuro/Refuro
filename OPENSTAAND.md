# Openstaand

Bijgewerkt op 10 augustus 2026. Alles hieronder is nagelopen tegen de code; wat
er niet in staat is af.

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
- [ ] **Uitlezen waterdicht:** een `irm | iex`-regel om in PowerShell te plakken (geen
      download, geen SmartScreen, geen administrator). Goedgekeurd, nog niet gebouwd.
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
- [ ] **Telefoons/iPhones krijgen geen automatische foto's.** De auto-ophaal (edge
      `productfotos` via Icecat) dekt Apple en veel telefoons niet in de gratis Icecat, dus de
      fotokaart blijft leeg en je moet met de hand fotograferen. Fotobron zoeken die telefoons
      wel dekt (GSMArena-render, leverancierfeed, of eigen model-fotobank), zodat een iPhone
      net als een laptop vanzelf foto's krijgt.
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
- [ ] **Fase 4.** Per grade eigen staat-toelichting/accu + in het thema automatisch de
      op-voorraad grade selecteren.

### Testen
- [ ] **Grade-varianten tegen de live shop:** tweede exemplaar van dezelfde uitvoering =
      voorraad +1, geen nieuwe advertentie.

### Jouw actie (code is klaar)
- [ ] **Bestaande producten opnieuw online zetten** -> net artikelnummer (A0016), OS-rij,
      conditietekst zonder streepje verschijnen (zitten al in shopify-edge v25).
- [ ] **Oude advertenties met verzonnen tekst opnieuw laten schrijven** (bv. de Dell met
      "Face ID"). Nieuwe worden goed, oude niet vanzelf.
- [ ] **(Optioneel) Eigen `ICECAT_GEBRUIKER`** zetten i.p.v. de gedeelde open-gebruiker
      (`openIcecat-live`), voor meer merken en minder kans op limieten.

### Bekende beperkingen / klein
- Apple-toestellen zitten niet in de gratis Icecat -> vallen terug op de telefoonfoto (bewust).
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
