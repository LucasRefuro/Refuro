# Openstaand

Bijgewerkt op 10 augustus 2026. Alles hieronder is nagelopen tegen de code; wat
er niet in staat is af.

---

## Nu openstaand — refurbish + webshop (27 september 2026)

Bijgehouden zodat de Storvo-chat en de refuro.nl-webshop-chat vanuit dezelfde lijst
werken en elkaar niet in de weg zitten. Dezelfde lijst staat als `WERKLIJST.md` in de
repo `refuro-webshop`.

### Nog te bouwen (code)
- [ ] **Meer specs in de spec-tabel.** De laptop-specopzoeker (edge `model-specs`) haalt
      nu 7 velden; uitbreiden met besturingssysteem, gewicht, materiaal, aansluitingen.
- [ ] **Uitlezen waterdicht:** een `irm | iex`-regel om in PowerShell te plakken (geen
      download, geen SmartScreen, geen administrator). Goedgekeurd, nog niet gebouwd.
- [ ] **Lijst springt naar boven bij invullen.** Pinpoint nodig: welk scherm en veld.

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

### Bugs / kwaliteit
- [ ] **Foto-ophaal grijpt soms een merklogo i.p.v. een productfoto.** Bij de Dell Latitude
      3520 (gangbaar model) kwam het Dell-logo als hoofdfoto. Icecat gaf een logo/merkbeeld
      terug. Fix: logo's/merkbeelden uit de Icecat-resultaten filteren (edge `productfotos`);
      Dell-dekking is sowieso mager. Belangrijk, want dit is een veelverkocht model.

### Grade-varianten afmaken (webshop)
- [ ] **Fase 3, de webhook.** Een verkochte grade moet het juiste onverkochte exemplaar
      op verkocht zetten en de advertentie opnieuw synchroniseren. Nu nog 1 product = 1
      toestel; hier kan geld misgaan bij een verkoop. Eerst dit.
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
