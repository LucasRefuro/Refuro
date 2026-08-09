# Refurbish als bijkoopmodule

> **Stand van zaken: gebouwd.** Fase 0 tot en met 3 staan er. Wat jij nog moet
> doen staat onderaan onder "Wat er nog van jou nodig is".

Een tweede product naast Storvo, voor winkels die apparaten opknappen en
doorverkopen. De meeste winkels hebben het niet nodig, dus het wordt geen
onderdeel van de pakketten maar iets wat je erbij koopt.

Dit plan gaat over vier dingen, in deze volgorde:

1. Het unieke exemplaar in Storvo (fundament, moet eerst)
2. Het hardware-overzicht
3. De Shopify-koppeling
4. De refurbish-app zelf

---

## De verdeling

De grens ligt op één moment: **zodra een apparaat goedgekeurd is.**

| Refurbish-app (de werkbank) | Storvo (de balie) |
|---|---|
| Toevoegen en labelen | Verkoopbare voorraad |
| Specificaties bij de controle | Verkoopprijs en marge |
| De gedeelde modellenlijst | Kassa en bon |
| Checklists en controle | Klant en garantie |
| Reparatie en repurpose | Reparaties aan de balie |
| Onderdelenvoorraad | Dashboard en cijfers |
| Inkooporders voor parts | Boekhoudexport |

Wat er over de grens gaat is maar drie dingen:

- Een goedgekeurd apparaat wordt een product in Storvo, met serienummer,
  specificaties, inkoopprijs en batchnummer erbij
- Verkocht in Storvo geeft een seintje terug, zodat het apparaat uit de
  pijplijn verdwijnt
- Gedeeld blijven: de inlog, de leverancierslijst en de AI die specificaties
  opzoekt

Onderdelen uit gesloopte apparaten blijven aan de werkbankkant. Die zijn stuk
voor stuk uniek en horen niet tussen de schermbeschermers in de winkelvoorraad.

---

## Fase 0 — Het unieke exemplaar

**Waarom dit eerst moet.** Storvo telt nu aantallen: vijf hoesjes is één regel
met een vijf erachter. Een gerefurbishte laptop is één exemplaar met een eigen
serienummer, een eigen inkoopprijs en een eigen geschiedenis. Bouw je dat er
later in, dan moet alles wat erop leunt weer om.

Wat erbij komt:

- Een product krijgt een soort: **bulk** (zoals nu) of **uniek exemplaar**
- Een uniek exemplaar heeft altijd aantal 1, plus velden voor serienummer,
  inkoopprijs, staat (A, B, C), garantie en herkomst
- De kassa weet dat een uniek exemplaar na verkoop weg is, niet afgeteld
- De cijfers rekenen met de inkoopprijs van dát exemplaar, niet met een
  gemiddelde

Dit werkt ook zonder de refurbish-app. Een winkel die een tweedehands toestel
inruilt en doorverkoopt heeft er meteen wat aan.

---

## Fase 1 — Hardware-overzicht

Een pagina in Storvo met alle unieke exemplaren op een rij.

Per regel: model, serienummer, staat, inkoopprijs, vraagprijs, marge, hoe lang
hij al staat, en een kolom **kanalen** waarin je ziet waar hij online staat.

Filters: alles, alleen op voorraad, alleen online, langer dan dertig dagen
onverkocht. Die laatste is de nuttigste: dat is geld dat op een plank ligt.

---

## Fase 2 — Shopify

### Wat het oplost

Eén laptop staat op Shopify, op Marktplaats en in de winkel. Verkoop je hem aan
de balie, dan moet hij binnen een minuut overal offline. Zonder koppeling
verkoop je hem twee keer en mag je een klant bellen dat het toch niet doorgaat.

### Hoe het loopt

| Wat er gebeurt | Wat het systeem doet |
|---|---|
| Apparaat is verkoopklaar | Knop **Op Shopify zetten**: product aanmaken met voorraad 1, foto's en de AI-tekst |
| Verkocht in de webshop | Shopify meldt het, Storvo haalt hem uit de voorraad |
| Verkocht aan de balie | Storvo zet hem meteen op onbeschikbaar in Shopify |
| Prijs aangepast in Storvo | Gaat mee naar Shopify |

Marktplaats kan dit niet; die hebben geen bruikbare koppeling voor gewone
advertenties. Daar blijft het kopiëren, met een handmatig vinkje "staat op
Marktplaats" zodat je wel ziet dat je hem daar nog weg moet halen.

### Wat jij in Shopify moet doen

Eén keer, ongeveer tien minuten.

1. Shopify-beheer → **Instellingen** → **Apps en verkoopkanalen**
2. Klik **Apps ontwikkelen** → **App maken** → noem hem `Storvo`
3. Tabblad **Configuratie** → **Admin API** → geef deze rechten:
   - `read_products`, `write_products`
   - `read_inventory`, `write_inventory`
   - `read_orders`
4. **Installeren**
5. Tabblad **API-referenties** → onthul het **Admin API-toegangstoken**
   (begint met `shpat_`)

**Dat token is een sleutel tot je webshop.** Plak hem nergens in een chat. Je
zet hem zelf in Supabase onder Project Settings → Edge Functions → Secrets:

| Naam | Wat erin komt |
|---|---|
| `SHOPIFY_WINKEL` | Je winkeladres, bijvoorbeeld `mijnwinkel.myshopify.com` |
| `SHOPIFY_TOKEN` | Het token dat begint met `shpat_` |

Later, wanneer ook andere winkels hun eigen webshop koppelen, verhuist dit naar
een koppelknop in de instellingen per winkel. Voor nu is jouw winkel genoeg om
het werkend te krijgen.

---

## Fase 3 — De refurbish-app

Een eigen pagina naast de winkelapp, met dezelfde huisstijl, dezelfde inlog en
dezelfde database. Voor de winkelier één product, voor ons twee bestanden die
je apart kunt onderhouden.

In deze volgorde, want elk stuk is op zichzelf al bruikbaar:

1. **Toevoegen.** Eén veld voor merk en model, aantal, inkoopprijs,
   leverancier en **waar je ze neerlegt**. Geen inkoopbatches: je staat met een
   doos naast je en wilt doorwerken. Specificaties vraagt de app hier niet, want
   die weet je nog niet.

   Die locatie is één klik, en de laatste keuze blijft staan; je pakt zelden
   één doos. Vanaf dat moment weet het systeem waar elk toestel ligt, en hoeft
   niemand later te raden waar iets gebleven is.
2. **Labels.** Rollen er meteen uit na het toevoegen. Bovenaan waar het apparaat
   in het proces staat, daaronder merk en model groot, het korte nummer, en een
   QR die naar dit apparaat wijst. Na de controle druk je hem opnieuw af; dan
   staan de specificaties er ook op.
3. **De controle.** Een eigen pagina met een tijdlijn erboven: Start, Hardware,
   Staat, Windows, Specs, Klaar. De knop om door te gaan staat rechts, en
   ernaast **Terug** zodra je een stap verder bent. Terug volgt de weg die je
   gelopen hebt, dus vanaf het geheugen kom je terug bij de reset en niet bij
   de start.

   **Antwoorden gaat vanzelf door.** Klik je een vraag aan, dan schuift de
   volgende openstaande vraag in beeld en licht hij op. Met dertig vragen op
   één pagina ben je anders vooral aan het zoeken waar je gebleven was. Twee
   uitzonderingen: zet je iets op *nee*, dan gaat de cursor naar het veldje
   waarin je zegt wát er mis is, en is alles beantwoord, dan schuift de knop
   waarmee je verder gaat in beeld.

   Het scherm springt niet meer weg terwijl je typt. Bij het accupercentage
   gebeurde dat wel: de pagina werd bij elke toetsaanslag opnieuw opgebouwd en
   dan ben je je cursor kwijt. Nu wordt alleen hertekend als het advies
   omslaat, en blijft de cursor staan waar hij stond.

   | Vraag | Ja | Nee |
   |---|---|---|
   | Start hij op? | door naar de hardware | brandt er een lampje? |
   | Brandt er een lampje? | geheugen nakijken | openmaken, accu en bios-batterij los, twee minuten wachten |
   | Start hij nu op? | door naar de hardware | leeghalen voor onderdelen |

   Bij die twee minuten loopt een wekker mee die piept als het klaar is.

   **Hardware.** De functionele test. Zet je ergens *nee*, dan verschijnt er een
   veldje om erbij te zetten wát er dan mis is. Vier dingen kun je zonder
   werkend Windows niet fatsoenlijk testen: toetsenbord, touchpad, wifi en
   geluid. Die hebben een derde antwoord, *Na Windows*, en komen vanzelf terug
   zodra de installatie klaar is.

   Onderaan de accucapaciteit in procenten. Zit die onder de grens die de winkel
   zelf instelt, dan verschijnt het advies om hem te vervangen, met een knop om
   hem meteen op de reparatielijst te zetten. Die grens stel je in bij
   Checklists en staat standaard op 80%.

   Daaronder een notitie van maximaal 60 tekens, want die moet op de sticker
   passen.

   **Staat.** De visuele inspectie met strafpunten: behuizing, scherm,
   toetsenbord en scharnieren. Nul tot twee punten is een A, tot en met zeven
   een B, daarboven een C. Een barst in het scherm telt voor acht, dus die haalt
   hem er in zijn eentje uit.

   **Windows.** Twee knoppen: *Installatie gestart* of *Windows later
   installeren*. In beide gevallen ga je meteen terug naar de lijst en pak je de
   volgende laptop. Er is geen wachtscherm meer; dat hield een half beeldscherm
   bezet met iets waar je toch niet naar kijkt. In de lijst staat de laptop
   tussen de andere, met een kloppend stipje en **Bezig met installeren**, of
   met **Wacht op installatie** als je hem nog moet aanzetten. Zo zie je in één
   oogopslag wat er staat te draaien.

   Klik je hem later aan, dan moet je het eerst bevestigen: is Windows
   geïnstalleerd en start hij op? Daarna komt de vraag of alle
   stuurprogramma's erop staan, zonder uitroeptekens in Apparaatbeheer. Dat is
   niet dezelfde vraag: een laptop die opstart met een ontbrekende wifi- of
   touchpaddriver is precies waarover een koper de dag erna belt. Pas daarna de
   checks die je had uitgesteld. Zolang er iets openstaat kun je niet door, maar
   *Nog niet klaar, later verder* blijft altijd staan.

   **Specs.** Pas nu, want pas nu draait Windows en kun je uitlezen wat er
   werkelijk in zit. Eén knop zoekt het model op. Omdat één model in meerdere
   uitvoeringen is verkocht krijg je die als keuzeknoppen te zien: i5 met 8 GB en
   256 GB, i7 met 16 GB en 512 GB, enzovoort. Klik de juiste aan en de velden
   vullen zich; klopt er iets niet, dan pas je het gewoon aan.

   De uitkomst volgt uit de antwoorden: alles goed betekent **op voorraad** met
   grade, één kapotte toets stuurt hem naar de reparatielijst, en een apparaat
   dat niet meer aan gaat wordt leeggehaald.

   Goedgekeurd is meteen op voorraad. Er zat hier een scherm tussen, *naar de
   winkelvoorraad*, waarin je nog eens een prijs en een grade moest invullen
   voordat het toestel in Storvo bestond. Dat was een stap zonder werk erin. Het
   toestel is af en het ligt ergens; de prijs hoort bij het online zetten, niet
   bij het opbergen.
3b. **De modellenlijst: alle uitvoeringen, niet één.** Bij de specificaties
   druk je op *Uitvoeringen opzoeken*. Je krijgt dan per onderdeel **alle**
   uitvoeringen die van dat model verkocht zijn: elke processor, elk
   geheugenformaat, elke opslagoptie, elke videokaart, elk scherm. Je klikt aan
   wat je op het scherm van de laptop ziet staan.

   Waarom niet één "meest voorkomende uitvoering": van een zakelijke laptop zijn
   tien processors en vier schermen geleverd, en welke er voor je staat weet je
   pas als Windows draait. Eén voorstel is dan altijd fout, en overtypen kost
   tijd en levert bij elke medewerker een andere schrijfwijze op. Aanklikken is
   sneller, preciezer, en houdt je advertenties consistent. Staat jouw
   uitvoering er niet bij, dan typ je hem gewoon in het veld eronder; hij komt
   er dan als losse knop bij te staan.

   De lijst kijkt eerst in de gedeelde modellendatabase en vraagt het pas aan AI
   als het model daar nog niet staat. Wat eruit komt gaat de database in, dus
   het wordt per model één keer opgezocht en daarna is het voor iedereen
   gratis en meteen goed. Specificaties van een laptopmodel zijn openbare
   feiten; er staat niets in wat naar een winkel of een klant te herleiden is.
4. **De apparaatpagina.** Elk apparaat heeft een eigen pagina: de feiten op een
   rij, wat erin zit, wat de controle opleverde, wat er mis is, wat eruit is
   gehaald, en het label als voorbeeld. Klikken op een regel brengt je er
   altijd heen, en de QR op het label ook.
5. **Labels opnieuw printen.** Vanaf de apparaatpagina, uit de lijst van vandaag,
   of in één keer voor alle laptops van vandaag.
6. **Reparatie en onderdelen.** Wat zit erin, wat is stuk, wat ligt er op de
   plank. Onderdelen toewijzen of op de bestellijst zetten. De onderdelenlijst
   kun je per soort bekijken (heb ik nog een scherm?) of per stuk (waar kwam
   dit vandaan?). Apparaten die zijn leeggehaald blijven staan onder **Donoren**.
6. **Parts inkoop.** Bestellijst samenvoegen tot inkooporders per leverancier,
   met factuur en status.
7. **Voorraad en online zetten.** De lijst heette *Klaar voor verkoop*; dat zei
   niets. Een toestel dat de controle heeft gehaald ligt gewoon ergens, en de
   enige twee vragen die er dan nog toe doen zijn: **waar ligt hij** en **staat
   hij online**. Dat is nu precies wat de pagina **Voorraad** laat zien.

   - Boven de lijst een knop per locatie, dus je kunt in één klik alleen de
     winkelvoorraad zien, of alleen wat in het magazijn ligt. Plus een knop
     *Nog niet online*, want dat is geld dat op een plank ligt.
   - In elke regel staat een pil met de plek waar hij ligt. Ook in Storvo, in
     het hardware-overzicht, en bovenaan de apparaatpagina.
   - Staat hij nog niet op de webshop, dan staat er een **oranje knop**. Zodra
     hij erop staat verdwijnt die knop en komt er een groene melding *Staat
     online* voor terug, met een link naar de advertentie. Een knop die niets
     meer te doen heeft hoort weg te zijn.

   Weg zijn: "klaar voor verkoop", "naar de winkel" en "klaar voor de webshop".
   Een toestel ligt in de winkel of in het magazijn, en verder niets.

   Achter de oranje knop zit alles wat nodig is om te verkopen:

   - **De advertentie**, geschreven volgens het sjabloon dat je bij Checklists
     instelt. De opbouw staat vast, de AI vult alleen de gaten. Per kanaal een
     andere toon: netjes opgebouwd voor de webshop, korter en losser voor
     Marktplaats. Titel en tekst hebben elk een eigen kopieerknop.
   - **Zes foto's** in een vaste volgorde: dicht, open, toetsenbord, links,
     rechts, onderkant. Uploaden vanaf de computer, of met de telefoon: je
     scant een QR, de telefoon opent een lijstje met die zes en je werkt ze af.
     Die telefoon hoeft niet in te loggen; hij werkt op een code die een half
     uur geldig is.
   - **Een hoofdfoto.** Eén foto is de foto: die staat vooraan in de advertentie
     en gaat als eerste naar de webshop. De foto van voren wordt het vanzelf,
     want daar zie je het scherm op; met één klik wijs je een andere aan.
   - **Achtergrond op het scherm.** Zie hieronder.
   - **De prijs**, met een voorstel uit drie bronnen: wat jij zelf eerder voor
     hetzelfde model vroeg, een schatting van de Nederlandse refurbished-markt,
     en zoeklinks naar Back Market, Refurbed, Marktplaats en Tweakers om het in
     tien seconden na te lopen. Je eigen prijzen wegen het zwaarst; er staat
     altijd bij waar het getal vandaan komt.

     Wat we bewust *niet* doen is die webshops leegtrekken. Dat mag niet van hun
     voorwaarden en het breekt bij elke wijziging aan hun website, precies op het
     moment dat je het nodig hebt. Vandaar de links.
   - **Fabrieksfoto's** uit Icecat: de catalogus waar fabrikanten zelf hun
     productfoto's in zetten. Die mag je gebruiken, in tegenstelling tot
     willekeurige plaatjes van internet. Je moet er wel een gratis account voor
     maken; zie onderaan.
   - **Het scherm recht zetten.** Bij de foto *open, van voren* staat *Recht
     zetten*. De AI kijkt naar de foto en zet de vier punten op de hoeken van het
     beeldscherm; jij kijkt het na en sleept ze desnoods bij. Daarna wordt de
     foto rechtgetrokken zodat het scherm haaks in beeld staat, zoals in een
     webshop. De andere foto's mogen gewoon een hoek hebben; dat maakt ze juist
     echt.

     Waarom het bijgesteld moet kunnen worden: het antwoord is meestal goed en
     soms een centimeter naast, en dat merk je anders pas als de advertentie
     online staat.
   - **De kanalen**: webshop, Marktplaats, winkel. Daarna **Publiceren**.

   **Inscannen en verhuizen.** Publiceren en in de winkel leggen zijn twee
   verschillende dingen; daartussen zit een busrit en een doos. Zet je bij
   Instellingen *Inscannen* aan, dan komt een gepubliceerd toestel op
   **onderweg** te staan. Pas als iemand in Storvo het nummer scant en een
   locatie kiest, telt hij mee in de voorraad. Laat je het uit staan, dan komt
   hij meteen in de voorraad te liggen, op de plek die bij het toevoegen is
   gekozen.

   Scan je een toestel dat al ergens ligt, dan **gaat het daar automatisch weg**.
   Een toestel ligt op één plek tegelijk; alles anders is een telling die niet
   klopt. Je ziet het ook: nog tijdens het typen staat er *Magazijn → Winkel*,
   met de oude plek doorgestreept, en na het scannen blijft er een lijstje
   staan van wat je zojuist verplaatst hebt. Elke verhuizing wordt vastgelegd,
   dus bij een verschil in de telling kun je terugzien of iemand iets verplaatst
   heeft of dat het echt weg is. Die geschiedenis staat onder het toestel zelf.

   Locaties beheer je op dezelfde pagina: winkel, magazijn, werkplaats, vitrine
   voor. Verplaatsen kan ook zonder scanner, via het toestel in Storvo of via
   *Verplaatsen* op de apparaatpagina in de refurbish-app.

   **Publiceren zet hem echt online.** Staat *Webshop* aan, dan wordt het
   toestel op datzelfde moment op Shopify gezet. Eerder stond er "gepubliceerd"
   terwijl er op de webshop nog niets gebeurd was, en daar kom je een dag later
   achter. Lukt het niet, dan zegt de app wat er misging en blijft de rest wel
   opgeslagen. Marktplaats blijft kopiëren en plakken; die hebben geen
   bruikbare koppeling.

### De achtergrond op het scherm

Wat Coolblue en Back Market doen: op elke productfoto staat hetzelfde strakke
beeld op het scherm, met de schermmaat erop. Dat is geen opsmuk. Een rij foto's
waarop elk scherm iets anders laat zien, de een uit met een spiegeling erin en
de ander met een half bureaublad, ziet er rommelig uit, en rommelig leest een
koper als onbetrouwbaar.

**Hoe hij eruitziet stel je één keer in**, bij Instellingen onder *Achtergrond
op het beeldscherm*: de achtergrondkleur, de kleur van de maat, en een **logo**
dat je zelf uploadt en dat in het midden komt te staan. Daarnaast een schuif
voor hoe groot dat logo staat en een schakelaar voor de resolutie. Naast de
knoppen staat een voorbeeld dat met dezelfde tekencode wordt gemaakt als de
echte foto, dus wat je daar ziet is wat er straks op het scherm staat.

Het enige wat per toestel verschilt is de **schermmaat**, en die staat
linksboven. Het getal komt uit de specificaties van dat model (15.6", 15,6 inch
en 13.3-inch worden allemaal hetzelfde getal) en is per toestel aan te passen
als het model iets raars in zijn specificaties heeft staan.

Onder de foto's staat **Achtergrond vervangen**. Die pakt de hoofdfoto en opent
een venster waarin:

- de AI zelf de vier hoeken van het beeldscherm zoekt, en jij ze bijsleept als
  het net niet klopt;
- de achtergrond uit je instellingen komt, met een link om ze aan te passen. Wil
  je voor dit ene toestel een eigen afbeelding, dan kan dat ook;
- je de maat kunt bijstellen of weglaten;
- een lichte glans over het scherm gaat, want zonder dat ziet het eruit als een
  sticker.

Een vlakke kleur ziet er op een foto uit als een gat, dus er komt een klein
verloop en een zachte gloed overheen, afgeleid van de kleur die jij hebt
gekozen. Het blijft dus jouw kleur, maar het krijgt diepte.

Alles gebeurt in de browser, dus je ziet elke wijziging meteen en het kost niets
om het twintig keer over te doen. Opslaan maakt er een nieuwe foto van en zet
die als hoofdfoto; de originele foto blijft gewoon staan.

Waarom het bijgesteld moet kunnen worden: volautomatisch kan dit niet
fatsoenlijk. De hoekdetectie zit er meestal goed op en soms een centimeter
naast, en dat merk je anders pas als de advertentie online staat.
8. **Export.** Batches en facturen eruit voor de boekhouding.

---

## Wie doet wat

| Jij | Ik |
|---|---|
| Uitzoeken wat er in de afspraak met de bouwer van de bestaande ERP staat over eigendom | Alles bouwen |
| De Shopify-app aanmaken en het token in Supabase zetten | De koppeling schrijven |
| Bepalen wat de module per maand kost | Het als bijkoop in Stripe zetten |

**Over die eerste:** functionaliteit en werkwijze mag je vrij naboksen, dat is
niet beschermd. Code en schermontwerp letterlijk overnemen mag niet. We bouwen
dit dus vanaf nul in jouw eigen stijl, met het document als beschrijving van wat
het moet doen.

---

## Wat er nog van jou nodig is

Alles hierboven is gebouwd. Drie dingen kan ik niet voor je doen.

### 1. De Shopify-app aanmaken (tien minuten)

De vijf stappen staan hierboven onder fase 2. Daarna zet je zelf drie
instellingen in Supabase, onder Project Settings → Edge Functions → Secrets:

| Naam | Wat erin komt |
|---|---|
| `SHOPIFY_WINKEL` | `mijnwinkel.myshopify.com` |
| `SHOPIFY_TOKEN` | Het token dat begint met `shpat_` |
| `SHOPIFY_WEBHOOK_SECRET` | Zie hieronder |

### 2. De terugkoppeling van Shopify aanzetten

Zodat een verkoop in de webshop het toestel hier uit de voorraad haalt.

1. Shopify-beheer → **Instellingen** → **Meldingen** → **Webhooks**
2. **Webhook maken**
   - Gebeurtenis: **Bestelling aangemaakt**
   - Indeling: **JSON**
   - Adres: `https://ugilfxqolemxwssbpdwu.supabase.co/functions/v1/shopify-webhook`
3. Na het opslaan toont Shopify een **ondertekeningssleutel**. Die zet je in
   Supabase als `SHOPIFY_WEBHOOK_SECRET`.

Zonder die sleutel weigert de functie elk bericht, en terecht: dan kan iedereen
melden dat er iets verkocht is.

### 3. Icecat koppelen voor productfoto's (vijf minuten)

1. Maak een gratis account op **icecat.biz** (Open Icecat volstaat)
2. Zet je gebruikersnaam in Supabase als `ICECAT_GEBRUIKER`

Zonder dat account werkt de knop *Fabrieksfoto's zoeken* niet; de rest wel.
Let op: Icecat matcht op de artikelcode van de fabrikant en wij zoeken op
modelnaam, dus het lukt niet bij elk model. Eigen foto's blijven het beste.

### 4. De prijs bepalen

Wat kost de module per maand? Zeg het, dan zet ik hem als tweede regel in
Stripe en wordt hij bij het afrekenen automatisch meegenomen.

---

## Hoe je het nu al kunt proberen

Je proefwinkel heeft de module aanstaan. In de winkelapp staat **Hardware** in
het menu en daaronder **Refurbishen**, dat de werkbank opent.

Een rondje om te zien of het klopt:

1. Refurbishen → **Toevoegen** → typ "HP ZBook", kies uit de lijst, aantal 2
2. **Toevoegen en labels maken** → de labels verschijnen meteen
3. Printen of gewoon bekijken → **Labels zitten erop**
4. Te controleren → klik een apparaat aan → **Specificaties opzoeken** → loop de
   checklist af
5. Kies **Goedgekeurd**, of **Moet gerepareerd** om die kant te zien
6. Bij goedgekeurd staat hij meteen bij **Voorraad**, op de plek die je bij het
   toevoegen koos, met een oranje knop *Online zetten*
7. Druk daarop, laat de advertentie schrijven, zet er foto's bij en probeer
   **Achtergrond vervangen** op de hoofdfoto
8. Publiceren → de oranje knop verandert in *Staat online*
9. Terug naar de winkel → **Hardware** → daar staat hij, met marge en al
