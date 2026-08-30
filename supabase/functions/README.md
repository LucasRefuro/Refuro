# Edge Functions

De functies draaien in Supabase. Deze map is bedoeld om ze ook in Git te hebben,
zodat je kunt terugzien wat er veranderd is.

Op dit moment staat alleen `klantbericht` hier volledig. De rest haal je op met
de Supabase CLI:

```
supabase functions download <naam> --project-ref ugilfxqolemxwssbpdwu
```

## Welke functie doet wat

| Functie | Openbaar | Waarvoor |
|---|---|---|
| `create-owner-account` | ja | Maakt de eigenaar aan bij een nieuwe winkel |
| `redeem-invite` | ja | Werknemer maakt zijn account via een uitnodigingslink |
| `team-admin` | nee | Wachtwoorden en uitnodigingen binnen een winkel |
| `admin-teams` | nee | Beheerpaneel van Storvo zelf |
| `feedback` | nee | Neemt feedback aan, bewaart hem en mailt hem naar info@storvo.nl |
| `admin-feedback` | nee | Leest de feedback uit en vinkt hem af in het beheerpaneel |
| `stripe-webhook` | ja | Verwerkt betalingen en houdt de abonnementsstatus bij |
| `stripe-portaal` | nee | Opent het betaalportaal voor de winkel |
| `stripe-checkout` | nee | Start het afrekenen van proef naar abonnement, met of zonder korting |
| `reparatie-status` | ja | Voedt de publieke klantpagina, alleen veilige velden |
| `klantbericht` | ja | Stuurt e-mail en WhatsApp naar de klant |
| `whatsapp-webhook` | ja | Ontvangt berichten en meldingen van Meta |
| `whatsapp-koppelen` | nee | Rondt het koppelen van een eigen nummer af |
| `whatsapp-status` | nee | Geeft de browser het app-ID voor de koppelflow |
| `product-herkennen` | nee | Leest een foto van een productdoosje en zegt wat erin zit |
| `shopify-koppelen` | nee | Start het koppelen, en beheert de koppeling: nakijken, meldingen, loskoppelen |
| `shopify-installeren` | ja | Hier komt de winkelier terug na het installeren bij Shopify |
| `shopify` | nee | Zet een toestel op de webshop of haalt hem eraf |
| `shopify-webhook` | ja | Shopify meldt hier dat er iets verkocht is |
| `hardware-tekst` | nee | Schrijft titel en omschrijving voor een tweedehands toestel |
| `admin-modules` | nee | Bijkoopmodules per winkel aan- en uitzetten |
| `model-specs` | nee | Zoekt specificaties bij een model, eerst in de lijst, dan met AI |
| `advertentie` | nee | Schrijft de advertentie volgens het sjabloon van de winkel |
| `refurbish-foto` | ja | Neemt foto's aan van de telefoon, op een code die een half uur geldig is |
| `refurbish-test` | ja | Neemt de functionele testuitslag aan van de telefoon, op dezelfde code-aanpak |
| `productfotos` | nee | Haalt officiële productfoto's op bij Icecat |
| `prijsadvies` | nee | Prijsvoorstel uit eigen geschiedenis en een marktschatting |
| `scherm-hoeken` | nee | Zoekt met AI de vier hoeken van een beeldscherm in een foto |
| `imaging` | nee | Werkplaats-imaging: schiet via de FOG-API een deploy-taak in (config, test, images-sync, deploy, status) |

"Openbaar" betekent dat de functie zonder inlog bereikbaar is. Die functies
controleren zelf wie er belt, via een handtekening of een eigen controle.

## De webshopkoppeling

Elke winkel koppelt zijn eigen webshop, bij Instellingen onder **Webshop**. De
gegevens staan in `winkel_koppelingen`, één rij per winkel.

### Hoe het koppelen loopt

1. De winkelier typt zijn winkeladres en drukt op **Koppelen met Shopify**.
2. `shopify-koppelen` maakt een sleuteltje aan in `koppel_pogingen` (een kwartier
   geldig) en geeft het adres van het toestemmingsscherm terug.
3. De browser gaat naar Shopify. Daar staat welke rechten Storvo vraagt.
4. Na het installeren komt Shopify terug bij `shopify-installeren`, met een code
   en een handtekening.
5. Die functie controleert de handtekening, zoekt het sleuteltje op, ruilt de
   code in voor een token, zet de meldingen klaar en zoekt het verkoopkanaal en
   de voorraadlocatie op.
6. De winkelier komt terug in Storvo met een melding of het gelukt is.

Er is nergens een sleutel die iemand moet overtypen. Daarnaast staat er nog een
tweede weg voor winkels die vóór januari 2026 zelf een app in hun Shopify-beheer
hebben gemaakt; die kunnen een token plakken. Nieuwe apps van dat soort kun je
niet meer aanmaken, dat heeft Shopify dichtgezet.

### Wat je in het Dev Dashboard instelt

De app maak je één keer aan, in het [Shopify Dev Dashboard](https://dev.shopify.com/dashboard).
Bij de instellingen van die app zet je als toegestaan terugkomstadres:

```
https://ugilfxqolemxwssbpdwu.supabase.co/functions/v1/shopify-installeren
```

De client ID en de client secret komen in de Supabase-instellingen te staan.

**Twee soorten distributie, en die keuze kun je niet terugdraaien.** *Custom
distribution* mag op één winkel en heeft geen goedkeuring van Shopify nodig;
dat is de app voor je eigen winkel. *Public distribution* mag op meerdere
winkels maar moet door de beoordeling van de Shopify App Store heen; die heb je
nodig zodra andere winkels Storvo gaan gebruiken. Het zijn dus twee aparte apps,
met dezelfde code eromheen: alleen de client ID en secret verschillen.

Wat er met het token gebeurt:

- Het gaat vanuit de browser rechtstreeks naar `shopify-koppelen` en wordt daar
  gecontroleerd bij Shopify voordat er iets bewaard wordt.
- Het staat versleuteld in de kolom, met AES-GCM en `KOPPELING_SLEUTEL`. Een
  databasedump of een back-up levert dus geen werkende webshopsleutels op.
- De tabel heeft **geen policies**. Dat is geen vergissing: zonder policy komt
  een ingelogde gebruiker er nooit bij, ook niet als er ergens per ongeluk een
  `select` op losgelaten wordt. Alleen de service_role, die policies overslaat,
  kan erbij.
- De browser krijgt het token nooit terug, alleen de laatste vier tekens.

`KOPPELING_SLEUTEL` maak je zelf aan, één keer, en zet je in Supabase onder
Project Settings → Edge Functions → Secrets:

```
openssl rand -base64 32
```

Raak je die sleutel kwijt, dan zijn de opgeslagen tokens onleesbaar en moet
iedere winkel opnieuw koppelen. Verder gebeurt er niets ergs; de webshops zelf
blijven gewoon draaien.

## Instellingen die erbij horen

Deze staan in Supabase onder Project Settings → Edge Functions → Secrets.
Zet ze nooit in de code en nooit in een chat.

| Naam | Waarvoor |
|---|---|
| `RESEND_API_KEY` | E-mail versturen |
| `RESEND_FROM` | Afzender van de e-mails |
| `FEEDBACK_NAAR` | Waar feedback heen gaat, standaard info@storvo.nl |
| `STRIPE_SECRET_KEY` | Betalingen |
| `STRIPE_WEBHOOK_SECRET` | Controleert of een melding echt van Stripe komt |
| `META_WA_NUMMER_ID` | Het WhatsApp-nummer van Storvo zelf |
| `META_WA_TOKEN` | Toegang tot dat nummer |
| `META_APP_ID` | Nodig om een eigen nummer te koppelen |
| `META_APP_SECRET` | Controleert of een melding echt van Meta komt |
| `META_ES_CONFIG_ID` | De koppelflow van Meta |
| `META_VERIFY_TOKEN` | Bevestigt het webhook-adres bij Meta |
| `ANTHROPIC_API_KEY` | Het lezen van productdoosjes |
| `ANTHROPIC_MODEL` | Optioneel, om een ander model te kiezen |
| `STRIPE_PRIJS_START` | De prijs van het pakket Start |
| `STRIPE_PRIJS_PRO` | De prijs van het pakket Pro |
| `STRIPE_PRIJS_ENTERPRISE` | De prijs van het pakket Enterprise |
| `STRIPE_KORTING_COUPON` | De bon voor het laatste aanbod, mag ontbreken |
| `APP_URL` | Waarheen Stripe terugstuurt na het afrekenen |
| `KOPPELING_SLEUTEL` | 32 bytes in base64. Hiermee worden webshoptokens versleuteld opgeslagen |
| `SHOPIFY_CLIENT_ID` | Client ID van de Storvo-app in het Shopify Dev Dashboard |
| `SHOPIFY_CLIENT_SECRET` | Client secret van diezelfde app. Hiermee worden ook de meldingen gecontroleerd |
| `ICECAT_GEBRUIKER` | Gebruikersnaam van je gratis Icecat-account, voor productfoto's |
