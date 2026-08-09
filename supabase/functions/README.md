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
| `shopify-koppelen` | nee | Koppelt de webshop van één winkel: uitproberen, opslaan, nakijken, loskoppelen |
| `shopify` | nee | Zet een toestel op de webshop of haalt hem eraf |
| `shopify-webhook` | ja | Shopify meldt hier dat er iets verkocht is |
| `hardware-tekst` | nee | Schrijft titel en omschrijving voor een tweedehands toestel |
| `admin-modules` | nee | Bijkoopmodules per winkel aan- en uitzetten |
| `model-specs` | nee | Zoekt specificaties bij een model, eerst in de lijst, dan met AI |
| `advertentie` | nee | Schrijft de advertentie volgens het sjabloon van de winkel |
| `refurbish-foto` | ja | Neemt foto's aan van de telefoon, op een code die een half uur geldig is |
| `productfotos` | nee | Haalt officiële productfoto's op bij Icecat |
| `prijsadvies` | nee | Prijsvoorstel uit eigen geschiedenis en een marktschatting |
| `scherm-hoeken` | nee | Zoekt met AI de vier hoeken van een beeldscherm in een foto |

"Openbaar" betekent dat de functie zonder inlog bereikbaar is. Die functies
controleren zelf wie er belt, via een handtekening of een eigen controle.

## De webshopkoppeling

Er stonden drie instellingen voor Shopify in deze lijst: één winkeladres, één
token en één webhookgeheim voor het hele platform. Dat werkt zolang er één
winkel is. Elke winkel koppelt nu zijn eigen webshop, bij Instellingen onder
**Webshop**, en die gegevens staan in de tabel `winkel_koppelingen`.

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
| `ICECAT_GEBRUIKER` | Gebruikersnaam van je gratis Icecat-account, voor productfoto's |
