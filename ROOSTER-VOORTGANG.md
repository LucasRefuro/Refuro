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

**Balk en popup.**
Een groene bovenbalk voor de beheerder, op elke pagina, als er inzendingen op
goedkeuring wachten. Hij zakt netjes onder een eventuele abo- en bestelbalk.
Klik je op Bekijken, dan spring je meteen naar de week met de oudste inzending.
Bij het inloggen komt er eenmaal per dag een popup: voor de beheerder wie er
wacht op goedkeuring, voor de medewerker die zijn komende week nog niet doorgaf
en de week begint binnen drie dagen. Alles hangt aan `keurWacht`, dat los van de
rooster-pagina wordt geladen (bij inloggen, elke dertig minuten, en na een
goedkeuring).

Alle tests groen (`npm test`, exit 0).

## Team en gebruikers

Het meeste stond er al: de detailpagina per gebruiker (rol, omgevingen, pagina's,
loon) als je op een naam klikt, het uurloon in het nieuwe-gebruiker-formulier, en
de uitnodiging per e-mail of link met een welkomstmail. Nieuw toegevoegd:

**Reloop-IT pagina's als losse rechten.**
Bij Team, Gebruikers staat nu ook per gebruiker welke pagina's van de werkbank hij
ziet (Werkbank, Toevoegen, Te controleren, en zo verder), zowel bij het aanmaken
als op de detailpagina. De sleutels krijgen een `ref_`-voorvoegsel in
`accounts.tabs`, los van de winkel-pagina's (die hebben ook Voorraad en Bestellen).
De refurbish-app leest ze uit en verbergt de tabs die iemand niet mag zien. Heeft
een account nog geen `ref_`-sleutels, dan ziet het alles, zodat bestaande accounts
niet ineens buitengesloten worden.

## Nog te doen

- Uitnodiging: eventueel de pagina's, omgevingen en het uurloon al meesturen op de
  uitnodiging zelf (nu zet de collega alleen zijn wachtwoord; rechten stel je daarna
  in). Dit vraagt extra kolommen op `invites` en een aanpassing in de niet-in-de-repo
  functie `redeem-invite`. Eerst even met Lucas afstemmen of dit nodig is.

- Icecat: er moet nog een gratis Open Icecat account komen en het geheim
  `ICECAT_GEBRUIKER` gezet worden.
