# Rooster-workflow, stand van zaken

Kort overzicht van wat er is gebouwd en wat er nog moet. Bijgewerkt 19 september 2026.

## Het idee

Personeel geeft twee weken vooruit zijn beschikbaarheid door. Een beheerder keurt
die week goed of stuurt hem terug. Herinneringen gaan vanzelf per mail, met een
oplopend schema. Goedkeuren gaat per persoon per week, niet per losse dag.

## Klaar en live

**Fundament (database).**
Migratie `20260919230000_rooster_goedkeur_workflow.sql`, toegepast op de database.
De tabel `beschikbaarheid` heeft nu per dag een status: concept, ingediend,
goedgekeurd of afgekeurd. Plus `beoordeeld_op`, `beoordeeld_door`, `afwijs_reden`.
Bestaande beschikbaarheid staat op goedgekeurd. Nieuwe policy zodat een
eigenaar of beheerder de beschikbaarheid van het team mag beoordelen. En
`rooster_instelling.laatst_herinnerd_op` voor het herinner-schema.

**Herinneringen (cron).**
Edge Function `rooster-herinnering`, versie 5, uitgerold. Draait op de bestaande
dagelijkse cron (08:00 UTC). Mailt wie zijn week nog niet doorgaf: normaal om de
dag, in de laatste drie dagen elke dag. De beheerder krijgt op de vrijdag drie
dagen voor de komende week een mail wie er nog niks invulde. Mailt via Zoho
vanaf info@refuro.nl. Doet niks tot de eigenaar het aanzet
(`rooster_instelling.aan`).

**Doorgeven en goedkeuren met mails.**
Edge Function `rooster-mail`, versie 1, uitgerold (verify_jwt aan). Drie acties:
doorgegeven (medewerker geeft door, de beheerders krijgen mail), goedgekeurd
(medewerker krijgt bevestiging), afgekeurd (medewerker krijgt mail met de reden).
De functie stuurt alleen de mail en zoekt de adressen zelf op; de statuswijziging
doet de app.

In de winkelapp (`app/index.html`, sectie Rooster):
- De medewerker ziet boven het rooster de status van deze week en een knop
  "Deze week doorgeven". Doorgeven zet alle zeven dagen op ingediend, ook de dagen
  dat hij niet kan. Zo is de inzending compleet en stopt de herinnering.
- Wijzigt hij daarna een dag, dan valt die dag terug op concept en moet de week
  opnieuw door.
- De beheerder ziet boven het rooster wie op goedkeuring wacht, met knoppen
  Goedkeuren en Terugsturen. Terugsturen vraagt om een reden.

Alle tests groen (`npm test`, exit 0).

## Nog te doen

**Fase 3: balk en popup (nu mee bezig).**
Een bovenbalk plus popup voor de beheerder als er inzendingen op goedkeuring
wachten, zichtbaar op elke pagina (niet alleen op de rooster-pagina). En een
popup voor de medewerker die zijn week nog niet invulde, drie dagen voor de week
ingaat. Patroon: kopieren van `toonBestelBalk` en `toonAboBalk`, aanhaken in
`showTab` en bij inloggen.

**Team en gebruikers (was uitgesteld, komt hierna).**
- Alle pagina's als losse rechten laten instellen, ook de Reloop-IT omgeving.
- Uitnodiging bij het aanmaken van een gebruiker, met een link om zelf een account
  te maken en een bedankmail. De pagina's, omgevingen en het uurloon meesturen op
  de uitnodiging.
- Het uurloon staat al in het formulier van een nieuwe gebruiker (klaar).

**Los openstaand.**
Icecat: er moet nog een gratis Open Icecat account komen en het geheim
`ICECAT_GEBRUIKER` gezet worden.
