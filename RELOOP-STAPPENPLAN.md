# Reloop it: stappenplan

Stand van 20 september 2026. Eén stap tegelijk, van boven naar beneden.
Storvo zelf verandert nergens door: alles staat in eigen `klantportaal_*`-tabellen,
de functies `klantportaal` en `lijst` en het Shopify-thema van Reloop it. In Refurbish
zijn alleen knoppen bijgekomen.

---

## A. Nu doen (jij, ongeveer 25 minuten)

### 1. Code live zetten
Plak in Terminal:
```
cd ~/"Software SAAS/refuro"
git push
```
Vercel zet het daarna vanzelf live (1–2 minuten).

### 2. Nieuw thema uploaden
Het bestand heet `reloop-it-theme.zip`, en je krijgt het in de chat.
1. https://admin.shopify.com/themes
2. Klik op **Thema toevoegen**, dan **Zip-bestand uploaden** en kies `reloop-it-theme.zip`.
3. Bij het nieuwe thema: **...**, dan **Publiceren**.

### 3. Vijf pagina's aanmaken
https://admin.shopify.com/pages, dan **Pagina toevoegen**. Per pagina: titel invullen, rechts bij
**Thema-sjabloon** het sjabloon kiezen en op **Opslaan** klikken. De inhoud laat je leeg.

| Titel | Sjabloon | Handle |
|---|---|---|
| Partij aanbieden | `aanbieden` | `aanbieden` |
| Juridisch | `juridisch` | `juridisch` |
| Veelgestelde vragen | `veelgestelde-vragen` | `veelgestelde-vragen` |
| Voorraadlijsten | `voorraadlijsten` | `voorraadlijsten` |
| Zo werkt het | `zo-werkt-het` | `zo-werkt-het` |

Controleer de handle (onderaan, "Zoekmachinevermelding"). Dan werken alle knoppen en footerlinks vanzelf.

### 4. Lijstsleutel in het thema plakken
1. https://storvo.app/portaalbeheer/, dan **Instellingen**, kaart **Lijsten voor handelaren**:
   klik op **Kopiëren** bij de sleutel.
2. https://admin.shopify.com/themes, dan **Aanpassen**, **Thema-instellingen** (tandwiel),
   groep **Lijsten (Storvo)**: plak de sleutel bij **Lijstsleutel**. Laat de andere velden staan.
3. **Opslaan**. Handelaren die ingelogd zijn zien nu downloadknoppen bij elke bundel,
   op de collectie en op de pagina Voorraadlijsten. Gasten zien een "log in"-melding.

Wil je dat handelaren ook prijzen in de lijst zien: zet in portaalbeheer **Prijzen in voorraadlijsten** op **Ja** en klik op Opslaan.

### 5. Bedrijfsgegevens invullen
Zelfde plek (Thema-instellingen):
- **Bedrijfsgegevens**: juridische naam, adres, KvK, btw, telefoon, e-mail, vestigingsplaats.
- **Links en kanalen**: de WhatsApp-groep voor handelaren (zie C2) en LinkedIn.

### 6. Contactmail in portaalbeheer
https://storvo.app/portaalbeheer/, dan **Instellingen**, **Contact en mail**: vul je e-mail in.
Daar komen de mails over nieuwe aanbiedingen en aanmeldingen binnen (nu gaan ze naar het
eigenaar-adres van Storvo).

### 7. Opruimen en testen
1. In portaalbeheer staat een aanbieding "TEST - controle door Claude (mag weg)": **Afwijzen**.
2. Zet bundel V0001 in Refurbish één keer opnieuw online (dan krijgt het product de koppeling
   met de lijst; zonder werkt het ook via het V-nummer in de tags).
3. Ga naar reloopit.nl, **Partij aanbieden**, vul een model in en kijk of het bod verschijnt.
4. Log in op portaal.reloopit.nl, tab **Partij aanmelden**: vul een regel in (het bod
   verschijnt vanzelf) en klik op **Aanmelden**. Jij krijgt een mail met de regels en het bod.

---

## B. Wat er klaarstaat

- **Klantportaal** op portaal.reloopit.nl: account met wachtwoord, "wachtwoord vergeten",
  e-mailadres al ingevuld, favicon, Reloop it-stijl. **Partij aanmelden** werkt met modelregels
  en een slim bod; de aanvraag komt in portaalbeheer en jij krijgt een mail.
- **Mails**: uitnodiging, "account klaar", bevestiging van een aanmelding (met bod), en een update
  bij elke stap aan alle beheerders van de organisatie. Elke mail gaat maar één keer.
- **Slim bod**: staat het model in onze voorraad, dan telt onze verkoopprijs; anders een
  marktschatting (Claude, 30 dagen bewaard). 60% laptops/telefoons/tablets, 70–80% de rest.
- **Lijsten** (Excel, CSV, print/PDF): hele voorraad, per merk, per batch, per bundel.
  - Refurbish: knop **Lijsten** op Voorraad, **Lijst voor koper** bij een batch, **Lijst** bij een bundel.
  - Portaalbeheer: sleutel, prijzen aan/uit, downloads, nieuwe sleutel (oude links stoppen dan).
  - Webshop: bij elke bundel, op de collectie en op /pages/voorraadlijsten, alleen voor ingelogde klanten.
  - Nooit zichtbaar in een lijst: inkoop, winst, leverancier.
- **Website**: footer, Juridisch, FAQ, **Zo werkt het** (uitleg voor organisaties en handelaren).

---

## C. Volgende bouwstappen (Claude)

### C1. Kopers-inlog en alle accounts op één plek
Er zijn twee soorten accounts:
- **Verkopers** (organisaties die IT aanbieden): het klantportaal. Dat bestaat al.
- **Kopers** (handelaren): de Shopify-klantaccounts ("Inloggen" op reloopit.nl). Die zijn nodig om af te rekenen.

Plan:
1. Een tab **Accounts** in portaalbeheer met beide lijsten: verkopers (organisaties en gebruikers)
   en kopers (Shopify-klanten met de tag `handelaar`), met status, laatste bestelling of partij, en omzet.
2. De kopers komen via de bestaande Shopify-koppeling van Storvo (Admin API: customers + tags)
   in een eigen tabel `klantportaal_kopers`. Die is alleen-lezen en wordt elk uur bijgewerkt.
3. **Handelaar goedkeuren** vanuit portaalbeheer: de aanvraag via "Voorraad aanvragen" of
   "Account aanvragen" komt binnen. Na Goedkeuren krijgt de klant in Shopify de tag `handelaar`
   en een welkomstmail (en ziet hij dan prijzen).
4. Later eventueel: een organisatie die zowel verkoopt als koopt, gekoppeld als één relatie.

### C2. WhatsApp voor handelaren
- Jij: maak een **WhatsApp-kanaal** (alleen jij post) of een **Community** voor handelaren en
  zet de link in de thema-instellingen. Dan staat hij in de footer en de FAQ.
- Ik: een knop **Deel in WhatsApp** bij elke nieuwe partij in Storvo, met een kant-en-klaar
  bericht (model, aantal, grade, prijs en link). WhatsApp laat geen automatische berichten in
  groepen of kanalen toe, dus het blijft één klik.
- Ik: handelaren die zich aanmelden voor **meldingen** krijgen een mail bij nieuwe partijen in hun
  categorie (laptops, telefoons, enzovoort).

### C3. Juridisch afronden
- Laat de teksten op /pages/juridisch eenmalig nalopen door een jurist, vooral de
  aansprakelijkheid, de verwerkersovereenkomst en de garantie. Claude is geen jurist.
- Zet in Shopify de **cookiebanner** aan: Instellingen, Klantprivacy.
- Zet in Shopify onder Instellingen, Beleid de links naar /pages/juridisch.

### C4. Het aanbieden nog slimmer maken
1. **Excel of lijst uploaden**: plakken of uploaden, en Claude maakt er zelf modelregels van.
2. Ook bij **Partij aanmelden in het klantportaal** met modelregels en het slimme bod.
3. **Leren van het definitieve bod**: indicatief en definitief bod vergelijken per model, en het
   percentage of de schatting bijsturen.
4. **Modelsuggesties** tijdens het typen, uit onze eigen voorraad en eerdere aanbiedingen.

### C5. Mail en domein
- Een **DMARC**-record voor reloopit.nl (TXT `_dmarc` → `v=DMARC1; p=none; rua=mailto:jouw@adres`)
  voor betere bezorging.
- In Supabase de linkduur van uitnodigingen naar 24 uur: Auth, Providers, Email, "Email OTP expiration" = 86400.

### C6. Overige
- Een pagina **Over ons** en **Werkwijze** vullen (secties bestaan al).
- Het impactrapport met echte CO₂-factoren per categorie (nu vaste standaardwaarden).
- Het ophaalverzoek plannen met datumkeuze in het portaal.
