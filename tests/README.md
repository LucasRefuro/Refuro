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
| `winkelapp.js` | Hardwarepagina: lijst, filters, marge, kanalen, het bewerkvenster |
| `refurbish-werkstroom.js` | Van binnenkomst tot overdracht, inclusief de checklist die meebeweegt met de specificaties |
| `refurbish-toevoegen.js` | Toevoegen, de modellenlijst en wat er op het label komt te staan |
| `refurbish-zicht.js` | Of het juiste scherm zichtbaar is: ingelogd, uitgelogd, en zonder de module |

Die laatste bestaat vanwege een fout die er echt in zat: een element met
`hidden` bleef gewoon staan omdat er `display:flex` op stond. In de code was
niets te zien, in de browser lag er een lege witte kaart over de hele app.
