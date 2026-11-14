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
| `winkelapp.js` | Hardwarepagina, Simpel of Alles, het reparatiebord, automatisch opslaan van een toestel, de Uren-pagina, het eigen ja/nee-venster, en terug van de browser (sluit eerst Online zetten, dan het product, en blijft in de winkelapp) |
| `refurbish-controle.js` | Het stappenpad met alle vertakkingen: reset, geheugen, slopen, grade |
| `refurbish-accu-windows.js` | De accugrens, het Windows-pad met wachtscherm en de uitvoeringen |
| `refurbish-uitlezen.js` | De PowerShell-regel voor accu en specs: het script (alleen ASCII, nooit exit), Vercel als platte tekst, de regel op de testpagina en het .bat-vangnet |
| `refurbish-online.js` | Online zetten: advertentie met sjabloon, de zes foto's, de kanalen. Naar reparatie: onderdeel uit de lijst van de categorie, notitie erbij, reparatiesticker zonder tweede doossticker, en ingebed vanuit de winkelapp |
| `productfotos-telefoon.js` | Fabrieksfoto's voor telefoons: de Galaxy-codes voor Icecat, dat een telefoon alleen de set in zijn eigen kleur ziet, de iPhone-uitleg en de knop Voor het hele model. En dat een laptop alles houdt zoals het was |
| `refurbish-pagina.js` | De apparaatpagina, donoren en onderdelen per soort |
| `refurbish-werkstroom.js` | Reparatie, onderdelen en de overdracht naar de winkel |
| `refurbish-toevoegen.js` | Toevoegen, de modellenlijst en wat er op het label komt te staan |
| `refurbish-zicht.js` | Of het juiste scherm zichtbaar is: ingelogd, uitgelogd, en zonder de module |
| `webshop-uitverkocht.js` | Het laatste exemplaar van een advertentie verkocht: het product blijft staan zonder voorraad (niet vermeld, of concept als je hem zelf offline haalt, of actief bij een open reservering), eerst voorraad 0 en dan de status, en dezelfde uitvoering krijgt later hetzelfde product terug |
| `webshop-accu.js` | De accu op de productpagina, ook voor een toestel dat los is toegevoegd (controle gaat voor, anders de hardware-rij; nooit een verzonnen 0) |
| `reservering-voorraad.js` | Een webshopreservering annuleren of laten vervallen: de voorraad van precies die grade-variant komt terug op Shopify (ook als de advertentie intussen opnieuw is aangemaakt, of op niet vermeld stond), een fout komt terug als zin in de winkelapp, en vervallen loopt elk uur vanzelf |
| `leveranciers.js` | Dat het wachtwoord van Foneday en Mobileparts nooit in de sync, in state of in de browseropslag belandt, ook niet bij de verhuizing van een oud apparaat |
| `mobiel.js` | De telefoon: elke tabel met drie of meer kolommen wordt een stapel kaartjes (kolomnaam op elke cel, ook bij later bijgetekende rijen), het vinkje in de kop blijft bereikbaar, en het menu is een Menu-knop met een lijst onder elkaar in plaats van een zijwaartse balk |
| `telefoon-flow.js` | Een telefoon toevoegen: de import van een fotomap per model en kleur (Engelse mapnamen worden het model en de kleur uit de modellenlijst, de gekozen hoofdfoto voorop, geen dubbele sets, alleen in de eigen winkelmap), de hoofdfoto van een set als eerste bij het toestel, het vanzelf aanvullen na opslaan (eerst specs, dan foto's, dan tekst, zonder je eigen tekst te overschrijven) en het A6-kaartje van een telefoon (alleen scherm, opslag, 5G en batterij) |
| `rooster-link.js` | Het rooster delen via de groep: over welke week de beschikbaarheid-link gaat (ook rond middernacht en de jaargrens), wat er van een inzending door mag, dat de functie geen notities of andere teams lekt, de pagina zelf (naam, kan of kan niet, tijden, doorgeven, rooster bekijken, inloggen, kapotte link), en in de winkelapp de links, WhatsApp, nieuwe links en een week delen |
| `nieuwprijs.js` | De nieuwprijs per model en opslag: wat de edge `model-nieuwprijs` van een opgezochte prijs bewaart (alleen gevraagde opslag, met bron, binnen redelijke grenzen, meer opslag kost meer), de eigen prijs van de winkel wint van de lijst, het web op maar één keer tegelijk, onthouden alleen als het iets nieuws is, het formulier vult hem bij model en opslag zonder wat je typte te overschrijven, op de werkbank het kaartje en Online zetten, en de sticker in beide apps (de specs van het kaartje, de staat met dezelfde woorden, de verkoopprijs en de nieuwprijs eronder; getest op wat er echt getekend wordt) |
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

