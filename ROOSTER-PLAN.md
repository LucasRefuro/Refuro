# Professioneel rooster, bouwplan

Ontwerp-synthese van het expertpanel (19 sep 2026). De indelen-kant bovenop de
bestaande beschikbaarheid/goedkeur/herinnering-workflow, die heel blijft.

## Kern

- Met je eigen account (eigenaar/beheerder, `roosterMagInplannen()`) deel je het
  hele team in, inclusief jezelf. Medewerkers blijven hun beschikbaarheid doorgeven.
- Beschikbaarheid = invoer/onderlegger. Het ingedeelde rooster = uitvoer.
- `tekenRooster()` wordt een dispatcher: mag inplannen -> `tekenRoosterBord()`,
  anders -> `tekenRoosterEigen()` (de huidige medewerker-kaarten, ongewijzigd). Geen
  dubbele functienaam. Alle bestaande aanroepers blijven werken.

## Layout

- Desktop: planmatrix mensen x 7 dagen (CSS grid, geen table). Sticky naamkolom +
  dagkop. Eigenaar als dunne rij onderaan. Rechterkolom Week (uren + loonkosten).
  Onderste rij Totaal per dag + weektotaal in de balk.
- Mobiel (< ~760px): dagstrip (Ma..Zo met datum + stip) + dagpaneel met de diensten
  van die dag, "Plan iemand in", "Wie kan er nog"-chips, dagtotaal. Een databron.
- Cel = persoon x dag. Achtergrond = beschikbaarheid: groen `--green-soft`
  (beschikbaar), grijs `--soft` (onbekend), rood `--red-soft` gestreept (niet), grijs
  niet-klikbaar bij gesloten dag. Diensten als `.dienstchip` bovenop.

## Bewerken (valkuil-proof)

- Snelle route: lege cel tikken (desktop) of kandidaat-chip (mobiel) = meteen dienst
  met slimme tijden (bestaande roosterInplan-logica: beschikbaarheid, anders
  OPENINGSTIJDEN, pauze 0).
- Volledige route/aanpassen: dienst-sheet als LOS `.overlay/.popup`-element (bottom-
  sheet op mobiel), bewerkt een geheugenkopie, schrijft pas bij Opslaan en hertekent
  dan een keer. Onthoud gekozen dag (mobiel) en scrollpositie (desktop).
- Velden: Wie (chips), Van/Tot (input type=time), Pauze (`.bkvar`-pillen Geen|15|30|
  45|60), live "Netto 6,5 uur · 84,50 euro". Weghalen met undo-toast.
- Meerdere diensten per persoon per dag mag. Verzet naar / Kopieer naar (tik, geen
  slepen). Slepen = v3.

## Waarschuwingen (adviserend, niet blokkerend)

Buiten beschikbaarheid (`.dienstchip.let`), dubbel geboekt (`.dienstchip.fout`),
lege open dag (amber stip). `.attentiestrip` telt "N aandachtspunten". Alleen
goedgekeurde of ingediende beschikbaarheid telt groen; concept blijft grijs.

## Tijd/uren

`dienstMin(van,tot,pauze)`: minuten sinds middernacht, over middernacht tot<van ->
+1440, dan pauze eraf. HH:MM-strings. Uren met toLocaleString('nl-NL'), euro via
`euro()`. Loon tonen hangt aan `urenMagAlles()`, niet aan abonnement (gratis
founder-winkel moet het ook zien). Percentage-loners: "op %", geen euro-raming.

## Datamodel

- V1: `alter table rooster add column if not exists pauze_min int not null default 0`
  (optioneel `gemaakt_door uuid default auth.uid()`). laadRooster-select uitbreiden
  met pauze_min. Geen nieuwe tabellen.
- Uurloon blijft in de blob (state.lonen via loonTarief), loonvorm in state.personeel
  (pCfg). Alleen lezen, nooit herschrijven vanuit het rooster.

## V1 bouwlijst (must-have, GEEN publiceren/mail/RLS)

1. Migratie pauze_min + laadRooster-select.
2. tekenRooster -> dispatcher (tekenRoosterBord / tekenRoosterEigen).
3. tekenRoosterBord: desktop matrix + mobiel dagstrip/dagpaneel, een databron.
4. Snelle plan via bestaande roosterInplan-logica.
5. Dienst-sheet (los element, geheugenkopie): toevoegen/aanpassen/weghalen, pauze,
   live uren+euro.
6. Undo-toast bij weghalen.
7. Meerdere diensten per persoon per dag + "+ dienst".
8. Beschikbaarheid als gekleurde onderlegger.
9. Waarschuwingen client-side, .attentiestrip.
10. Urenberekening met pauze en over-middernacht.
11. Totalen per persoon/dag/week; loon alleen bij urenMagAlles(); percentage = "op %".
12. Neem vorige week over (kopie +7 dagen, vertrokken leden overslaan, overschrijven
    of erbij).
13. Verzet naar / Kopieer naar in de sheet.
14. Klein "Mijn week"-blok bovenaan de medewerker-weergave.
15. Nieuwe CSS-klassen elk met minstens een regel; npm test groen (geen dubbele id
    tussen matrix en dag-view: class + data-attribuut, nooit id's in een lus).

## V2 (later)

Publiceren + gepubliceerd-gate via RLS (tabel rooster_week, date_trunc('week')
gekoppeld aan gepubliceerd_op; test met medewerker-account), publiceer-mail (rooster-
mail actie 'gepubliceerd', verify_jwt=false), wijziging-mail met dedupe, soort
(werk/ziek/verlof/vrij) + taak, afmelden door medewerker, sjablonen, feestdagen
(rooster_dag_uitzondering), streef-uren, bezettingscheck.

## V3

Vast patroon per persoon, dupliceren naar meerdere dagen, slepen (desktop), ruilmarkt,
WhatsApp-melding, afdrukken/ICS, loonkosten tegen omzet in Rapport, OPENINGSTIJDEN
bewerkbaar in Instellingen.

## Valkuilen

Hertekenen wist invoer (sheet los houden). Twee functies met dezelfde naam (dispatcher
of nieuwe namen). Dubbele id's (class + data-attribuut). Elke nieuwe klasse een
CSS-regel, elke var(--x) moet bestaan. Geen OS-keuzelijsten (pillen + input type=time).
Datum altijd via roosterYmd/roosterMaandagVan, nooit new Date(ymd) zonder T12:00:00.
verify_jwt expliciet op false bij rooster-mail-deploy (v2).
