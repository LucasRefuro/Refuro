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
| `winkelapp.js` | Hardwarepagina, Simpel of Alles, het reparatiebord, automatisch opslaan van een toestel, de Uren-pagina |
| `refurbish-controle.js` | Het stappenpad met alle vertakkingen: reset, geheugen, slopen, grade |
| `refurbish-accu-windows.js` | De accugrens, het Windows-pad met wachtscherm en de uitvoeringen |
| `refurbish-online.js` | Online zetten: advertentie met sjabloon, de zes foto's, de kanalen |
| `refurbish-pagina.js` | De apparaatpagina, donoren en onderdelen per soort |
| `refurbish-werkstroom.js` | Reparatie, onderdelen en de overdracht naar de winkel |
| `refurbish-toevoegen.js` | Toevoegen, de modellenlijst en wat er op het label komt te staan |
| `refurbish-zicht.js` | Of het juiste scherm zichtbaar is: ingelogd, uitgelogd, en zonder de module |

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

