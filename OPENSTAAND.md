# Openstaand

Bijgewerkt op 10 augustus 2026. Alles hieronder is nagelopen tegen de code; wat
er niet in staat is af.

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

- Je eigen winkel heet in de administratie nog **Refuro**, niet Storvo.
- **Lekwachtwoord-bescherming** in Supabase kan pas aan op het Pro-pakket.
- De **`README.md`** was geschreven toen alles nog in de browser werd bewaard en
  het product Refuro heette. Hij is bijgewerkt, maar kijk er kritisch naar als
  je hem gebruikt.
- In `app/index.html` staan nog vier `style="width:auto"` op aankruisvakken. Ze
  doen geen kwaad (de `min-width` uit de stijlregel wint), maar het zijn
  overblijfsels van vóór de eigen vinkjes.
