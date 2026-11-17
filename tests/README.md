# Tests

Drie testbestanden die de apps in een nagebootste browser openstarten en
controleren of alles doet wat het moet doen. Geen echte database, geen echte
inlog: alles wordt nagebootst, dus je kunt ze zo vaak draaien als je wilt.

Eenmalig:

```
npm install
```

Draaien:

```
npm test
```

| Bestand | Wat het nakijkt |
|---|---|
| `winkelapp.js` | Hardwarepagina (met de verkoopwaarde van de voorraad), Simpel of Alles, het reparatiebord, automatisch opslaan van een toestel, de Uren-pagina, het eigen ja/nee-venster, en terug van de browser (sluit eerst Online zetten, dan het product, en blijft in de winkelapp) |
| `refurbish-controle.js` | Het stappenpad met alle vertakkingen: reset, geheugen, slopen, grade |
| `refurbish-accu-windows.js` | De accugrens, het Windows-pad met wachtscherm en de uitvoeringen |
| `refurbish-uitlezen.js` | De PowerShell-regel voor accu en specs: het script (alleen ASCII, nooit exit), Vercel als platte tekst, de regel op de testpagina en het .bat-vangnet |
| `refurbish-online.js` | Online zetten: advertentie met sjabloon, de zes foto's, de kanalen. Naar reparatie: onderdeel uit de lijst van de categorie, notitie erbij, reparatiesticker zonder tweede doossticker, en ingebed vanuit de winkelapp |
| `productfotos-telefoon.js` | Fabrieksfoto's voor telefoons: de Galaxy-codes voor Icecat, dat een telefoon alleen de set in zijn eigen kleur ziet, de iPhone-uitleg en de knop Voor het hele model. En dat een laptop alles houdt zoals het was |
| `refurbish-pagina.js` | De apparaatpagina, donoren en onderdelen per soort |
| `refurbish-werkstroom.js` | Reparatie, onderdelen en de overdracht naar de winkel; een verkocht toestel staat in de tab Verkocht (datum, via, prijs, wat er nog moet) en niet meer in de gewone voorraad |
| `refurbish-toevoegen.js` | Toevoegen, de modellenlijst en wat er op het label komt te staan |
| `refurbish-zicht.js` | Of het juiste scherm zichtbaar is: ingelogd, uitgelogd, en zonder de module |
| `webshop-uitverkocht.js` | Het laatste exemplaar van een advertentie verkocht: het product blijft staan zonder voorraad (niet vermeld, of concept als je hem zelf offline haalt, of actief bij een open reservering), eerst voorraad 0 en dan de status, en dezelfde uitvoering krijgt later hetzelfde product terug |
| `ophalen-winkel.js` | Waar ligt het toestel dat de klant krijgt: de sync zet per toestel in de wachtrij of het in de winkel ligt (winkellocaties één keer opgevraagd), zodat de webshop van kantoor een openingsdag later belooft; "alles opnieuw" alleen voor eigenaar of cron en zonder advertenties zonder voorraad |
| `nieuw-touch.js` | Nieuwe producten (staat N) en touch-laptops: werkbank en edge rekenen dezelfde webshopsleutel, touch en nieuw krijgen een eigen advertentie, nieuw heeft één variant "Nieuw" zonder grades, nieuwprijs of accu, en het formulier verbergt de accu bij Nieuw en onthoudt touch als eigen uitvoering |
| `webshop-accu.js` | De accu op de productpagina, ook voor een toestel dat los is toegevoegd (controle gaat voor, anders de hardware-rij; nooit een verzonnen 0) |
| `reservering-voorraad.js` | Een webshopreservering annuleren of laten vervallen: de voorraad van precies die grade-variant komt terug op Shopify (ook als de advertentie intussen opnieuw is aangemaakt, of op niet vermeld stond), een fout komt terug als zin in de winkelapp, en vervallen loopt elk uur vanzelf |
| `leveranciers.js` | Dat het wachtwoord van Foneday en Mobileparts nooit in de sync, in state of in de browseropslag belandt, ook niet bij de verhuizing van een oud apparaat |
| `mobiel.js` | De telefoon: elke tabel met drie of meer kolommen wordt een stapel kaartjes (kolomnaam op elke cel, ook bij later bijgetekende rijen), het vinkje in de kop blijft bereikbaar, en het menu is een Menu-knop met een lijst onder elkaar in plaats van een zijwaartse balk |
| `telefoon-flow.js` | Een telefoon toevoegen: de import van een fotomap per model en kleur (Engelse mapnamen worden het model en de kleur uit de modellenlijst, de gekozen hoofdfoto voorop, geen dubbele sets, alleen in de eigen winkelmap), de hoofdfoto van een set als eerste bij het toestel, het vanzelf aanvullen na opslaan (eerst specs, dan foto's, dan tekst, zonder je eigen tekst te overschrijven) en het A6-kaartje van een telefoon (alleen scherm, opslag, 5G en batterij) |
| `rooster-link.js` | Het rooster delen via de groep: over welke week de beschikbaarheid-link gaat (ook rond middernacht en de jaargrens), wat er van een inzending door mag, dat de functie geen notities of andere teams lekt, de pagina zelf (naam, kan of kan niet, tijden, doorgeven, rooster bekijken, inloggen, kapotte link), en in de winkelapp de links, WhatsApp, nieuwe links en een week delen |
| `nieuwprijs.js` | De nieuwprijs per model en opslag: wat de edge `model-nieuwprijs` van een opgezochte prijs bewaart (alleen gevraagde opslag, met bron, binnen redelijke grenzen, meer opslag kost meer), de eigen prijs van de winkel wint van de lijst, het web op maar één keer tegelijk, onthouden alleen als het iets nieuws is, het formulier vult hem bij model en opslag zonder wat je typte te overschrijven, op de werkbank het kaartje en Online zetten, en de sticker in beide apps (de specs van het kaartje, de staat met dezelfde woorden, de verkoopprijs en de nieuwprijs eronder; getest op wat er echt getekend wordt) |
| `vraagprijs.js` | De vraagprijs per model, opslag en grade (model_vraagprijzen): de kleur telt niet, een andere grade of opslag is een andere prijs, onthouden alleen als het iets nieuws is (bijwerken, geen tweede rij), het toestelformulier vult hem bij een nieuwe telefoon zonder wat je typte te overschrijven en laat een bestaande prijs staan, en Online zetten vult hem en onthoudt hem bij publiceren en bij grade-prijzen opslaan. Een laptop per uitvoering (processor, geheugen, opslag) en grade: zonder volledige uitvoering niets, een laptopprijs is nooit een prijs per opslag, een monitor onthouden we niet, en werkbank en winkelapp maken precies dezelfde sleutel |
| `laptop-toevoegen.js` | Een laptop toevoegen in de winkelapp: de sleutel van een uitvoering is in app en edge gelijk, processor, geheugen, opslag en scherm aantikken uit de uitvoeringen van het model, de nieuwprijs per uitvoering (een keer opzoeken, wat je typt onthouden), een gewijzigde spec gaat ook naar de werkbank-rij, de foto's met de artikelcode, Meer gegevens open boven de specs, de modellenlijst bij typen (laptops uit de gedeelde lijst plus eigen toestellen, meest gebruikt eerst, zonder rommel, een desktop ziet desktops) en een nieuw model wordt onthouden bij opslaan of wijzigen |
| `titel.js` | De titel van een toestel is alleen de modelnaam ("iPhone 11"): het merk valt weg waar de modelnaam het al zegt en staat nooit dubbel, een laptop houdt zijn merk, dezelfde regel in de winkelapp, de werkbank en de webshopkoppeling, een leeg titelveld wordt de modelnaam, en de AI schrijft geen titel meer (kleur en opslag zet de webshop als labels eronder) |
| `webshop-accu.js` | Een webshopbestelling met nieuwe accu: de bestelling toont groot "Nieuwe accu erin" met het toestel en de accuregel vet, de pop-up bij een nieuwe bestelling verschijnt een keer met het accublok, en op de werkbank zegt de reparatie dat hij verkocht is en print Reparatie klaar geen voorraadsticker |
| `webshop-extras.js` | Extra's bij een toestel (glas, hoesje, stekker, klaar voor gebruik) met één voorraad voor winkel en webshop: een winkelverkoop stuurt één bericht met de nieuwe stand, een webshopverkoop gaat één keer van de voorraad (ook als een ander apparaat eerst was), een annulering zet hem terug, het kaartje in Instellingen past prijs en aan/uit aan, en klaar voor gebruik valt op bij de bestelling |
| `inruilprijzen.js` | De pagina Inruilprijzen: per soort en merk de regels met vijf vakjes, een voorstel is grijs, een bedrag aanpassen slaat alleen dat vakje op en maakt de regel nagekeken zonder opnieuw te tekenen, leeg is geen bedrag, duurder dan een betere staat krijgt een rood randje, Enter gaat naar het volgende vakje, zoeken kijkt in alle soorten, model toevoegen maakt van "256 gb, 1tb" twee regels, alleen eigenaar en beheerder, en de aanvraag toont staat, wat kapot is en hoe de klant hem inlevert |
| `inkoopregister.js` | Inkoop bij een particulier: de DOR-velden in het scherm (onder de 18 en zonder legitimatie gaat niet door, geen veld voor een kopie of BSN), elk toestel zijn eigen serienummer of IMEI, het register en de verklaring met de btw-zin, de vijf werkdagen bewaring rond weekend en feestdagen, de waarschuwing in de werkbank, het DOR-scherm, en op de Inkopen-pagina de lijst, de CSV voor de boekhouder (zonder geboortedatum of legitimatie) en het aanvinken van het DOR |

Die laatste bestaat vanwege een fout die er echt in zat: een element met
`hidden` bleef gewoon staan omdat er `display:flex` op stond. In de code was
niets te zien, in de browser lag er een lege witte kaart over de hele app.

## huisstijl.js

Deze test kijkt niet naar wat de app doet, maar naar hoe hij in elkaar zit. Het
soort fout dat nooit een foutmelding geeft:

- een knop die naar een functie wijst die niet bestaat
- twee functies met dezelfde naam, waarbij de laatste stilletjes wint
- twee keer dezelfde id, waardoor `getElementById` de verkeerde helft van het
  scherm vult
- een klasse in de opmaak zonder ook maar één stijlregel
- een kleur die in dít bestand anders heet, zodat het veld geen achtergrond krijgt
- keuzelijsten en aankruisvakken van het besturingssysteem in plaats van de onze
- `confirm()`, `prompt()` of `alert()` in de winkelapp of de werkbank; daar is
  een eigen venster voor (`vraagJaNee` en `vraagTekst`, op de werkbank `bevestig`)
- een link naar een nieuw tabblad zonder `rel="noopener"`
- een `uitgebreid`- of `alleensimpel`-blok terwijl de regel die hem verbergt
  ontbreekt; dan ziet Simpel er precies zo uit als Alles

Alle drie de schermen worden ook echt geladen, om te zien of ze zonder klagen
opstarten.

Twee uitzonderingen staan er expres in. `bestelvink` en `logoImg` zijn klassen
die alleen bestaan om ze met javascript terug te vinden; die horen geen stijl te
hebben. En bij `fbTekst`, `camera` en `handcode` staat dezelfde id meerdere keren
in de bron, maar in takken van hetzelfde scherm die elkaar uitsluiten.

## Een test die halverwege stopt

Elke test eindigt met `process.exit`. Wacht hij ergens op een belofte die nooit
oplost (in jsdom bijvoorbeeld een script dat niet laadt), dan liep node vroeger
gewoon leeg met code 0: halve test, toch groen. Dat gebeurde echt bij twee
refurbish-tests. Daarom staat bovenin elke asynchrone test een `beforeExit`-wacht
die dat als fout telt. Zet die er ook in als je een nieuwe test schrijft.
`clover-sync.js` heeft hem niet: die is synchroon en eindigt zonder `process.exit`.


## Wachten op de toestand, niet op een pauze

Een vaste pauze (`await wacht(20)`) is een gok op hoe snel de machine is. Op een
drukke machine loopt hij uit, en dan gaat een timer van de app ineens midden in
de volgende stap af. `inkoopregister.js` faalde zo ongeveer een op de drie keer:
na opslaan vanaf een toestel opent de app het DOR-scherm pas na 300 ms, en dat
venster verdrong dan het volgende venster van de test. Wacht daarom op wat je
verwacht (een element, een geschreven rij, een variabele) met een ruim maximum,
zoals `wachtOp` in die test. En opent de app iets op een timer, wacht daar dan op
en ruim het op voordat je verdergaat.
