# Reloop it: stappenplan

Stand van 19 september 2026. Eén stap tegelijk, van boven naar beneden.
Storvo zelf verandert nergens door: alles staat in eigen `klantportaal_*`-tabellen,
de functie `klantportaal` en het Shopify-thema van Reloop it.

---

## A. Nu doen (jij, ongeveer 20 minuten)

### 1. Code live zetten
Plak in Terminal:
```
cd ~/"Software SAAS/refuro"
rm -f .git/HEAD.lock .git/index.lock
find .git/objects -name 'tmp_obj_*' -delete
git push
```

### 2. Nieuw thema uploaden
Het bestand heet `reloop-it-theme.zip`, en je krijgt het in de chat.
1. https://admin.shopify.com/themes
2. Klik op **Thema toevoegen**, dan **Zip-bestand uploaden** en kies `reloop-it-theme.zip`.
3. Bij het nieuwe thema: **...**, dan **Publiceren**.

### 3. Drie pagina's aanmaken
https://admin.shopify.com/pages, dan **Pagina toevoegen**. Per pagina: titel invullen, rechts bij
**Thema-sjabloon** het sjabloon kiezen en op **Opslaan** klikken. De inhoud laat je leeg.

| Titel | Sjabloon |
|---|---|
| Partij aanbieden | `aanbieden` |
| Juridisch | `juridisch` |
| Veelgestelde vragen | `veelgestelde-vragen` |

Controleer dat de handle (onderaan, "Zoekmachinevermelding") `aanbieden`, `juridisch` en
`veelgestelde-vragen` is. Dan werken alle knoppen en footerlinks vanzelf, en is de 404 weg.

### 4. Bedrijfsgegevens invullen
https://admin.shopify.com/themes, dan **Aanpassen**, **Thema-instellingen** (tandwiel):
- **Bedrijfsgegevens**: juridische naam, adres, KvK, btw, telefoon, e-mail, vestigingsplaats.
  Die komen automatisch in de footer, de voorwaarden en de privacyverklaring.
- **Links en kanalen**: de link van de WhatsApp-groep voor handelaren (zie C2) en LinkedIn.

### 5. Contactmail in portaalbeheer
https://storvo.app/portaalbeheer/, dan **Instellingen**, **Contact en mail**: vul je e-mail in.
Daar komen de mails over nieuwe aanbiedingen binnen. Hier zie je ook de bod-percentages
(60% laptops/telefoons/tablets, 70–80% overige hardware).

### 6. Testen
1. Ga naar reloopit.nl, klik op **Partij aanbieden**, vul een model in en kijk of het bod verschijnt.
2. Verstuur met je eigen mailadres. Je krijgt een bevestiging, en jullie krijgen een mail met de regels en het bod.
3. In portaalbeheer staat de aanbieding bovenaan. Klik op **Aannemen**. De organisatie en de opdracht
   worden aangemaakt en de klant krijgt een uitnodiging voor het portaal.

---

## B. Wat er klaarstaat

- **Klantportaal** op portaal.reloopit.nl: account met wachtwoord, "wachtwoord vergeten",
  het e-mailadres staat al ingevuld, favicon en de Reloop it-stijl.
- **Mails**: uitnodiging, "account klaar" (met waar je inlogt), bevestiging van een aanmelding,
  en een update bij elke stap (aangenomen, opgehaald, gewist, getest, afgerond) aan alle
  beheerders van de organisatie, met welke documenten klaarstaan. Elke mail gaat maar één keer.
- **Partij aanbieden met slim bod**: model, specs, aantal en staat, met meteen een bod per stuk en
  voor de hele partij. Staat het model in onze voorraad, dan telt onze verkoopprijs; anders een
  marktschatting (Claude, 30 dagen bewaard, maximaal 400 nieuwe schattingen per dag).
- **Portaalbeheer**: aanbiedingen van de website met het bod en de bron per regel, en
  Aannemen/Afwijzen. De percentages stel je in bij Instellingen.
- **Website**: een nieuwe footer (3 kolommen, bedrijfsgegevens, juridische links, WhatsApp), een
  pagina Juridisch (voorwaarden, privacy, verwerkersovereenkomst, cookies, disclaimer) en een
  FAQ-pagina (organisaties en handelaren).

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
