# Wat er veranderd is

## Augustus 2026

**De hele software doorgelicht.** Twee fouten die stilletjes verkeerd gingen
eruit: twee functies met dezelfde naam in de refurbish-app, en twee keer dezelfde
id in de winkelapp waardoor de verzendlijst bij een reparatie nooit vulde. De
huisstijl gelijkgetrokken: de refurbish-app had nog de keuzelijsten en vinkjes
van het besturingssysteem. `tests/huisstijl.js` bewaakt dit voortaan.

**De webshopkoppeling opnieuw gebouwd.** Elke winkel koppelt nu zijn eigen
Shopify-webshop met één knop, via OAuth. Het token komt versleuteld in de
database en nooit in de browser. Alles loopt via de GraphQL Admin API, want de
REST-endpoints voor producten zijn door Shopify afgeschreven. Bestellingen uit
de webshop zijn zichtbaar in Storvo, met klant, bedrag en welke toestellen eruit
gingen.

**De refurbishmodule.** Van een doos laptops tot een advertentie: toevoegen met
locatie, labels, een controle in stappen met tijdlijn en terugknop, Windows
installeren zonder te wachten, alle uitvoeringen per model als keuzeknoppen,
foto's met de telefoon, een achtergrond op het beeldscherm met de schermmaat
erop, prijsadvies, en publiceren naar de webshop.


## Eerder

Alle belangrijke wijzigingen worden hier bijgehouden.
Notatie: [Semantische versienummering](https://semver.org/lang/nl/) (MAJOR.MINOR.PATCH).

## [1.0.0] - 2026-08-03
### Toegevoegd
- Winkelapp: dashboard, scannen, diensten, reparatiemodule, producten, bestellingen, team, instellingen met huisstijl
- Klant-status pagina per reparatie
- Beheerpaneel: klanten, abonnementen, Stripe-koppeling (voorbereiding), live-checklist
- Marketingwebsite met animaties
