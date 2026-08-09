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
| `shopify` | nee | Zet een toestel op de webshop of haalt hem eraf |
| `shopify-webhook` | ja | Shopify meldt hier dat er iets verkocht is |
| `hardware-tekst` | nee | Schrijft titel en omschrijving voor een tweedehands toestel |
| `admin-modules` | nee | Bijkoopmodules per winkel aan- en uitzetten |

"Openbaar" betekent dat de functie zonder inlog bereikbaar is. Die functies
controleren zelf wie er belt, via een handtekening of een eigen controle.

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
| `SHOPIFY_WINKEL` | Je winkeladres, bijvoorbeeld `mijnwinkel.myshopify.com` |
| `SHOPIFY_TOKEN` | Het Admin API-token dat begint met `shpat_` |
| `SHOPIFY_WEBHOOK_SECRET` | Controleert of een melding echt van Shopify komt |
