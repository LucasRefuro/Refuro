# Klantportaal

Organisaties van wie de winkel IT opkoopt (een gemeente, een zorggroep) volgen
hier hun partij: ophaling, wissen, testen, bod en betaling. Met wiscertificaat,
verwerkingsrapport, impactrapport en apparatenlijst om te downloaden.

Voor Refuro draait dit als **Reloop it** op `portaal.reloopit.nl`.

---

## Hoe het in elkaar zit

| Wat | Waar |
|---|---|
| Het portaal voor de klant | `/klantportaal/index.html` |
| Beheren door de winkel (eigen app, zoals refurbish en partner) | `/portaalbeheer/index.html` |
| Tabellen, velden en functies | `supabase/migrations/20260919200000_klantportaal.sql` |
| Inloglinks en uitnodigingen | Edge Function `klantportaal` |
| Tests | `tests/klantportaal.js` (klant), `tests/klantportaal-winkel.js` (beheer) |

**Storvo zelf verandert niet.** Alles staat in eigen tabellen met het voorvoegsel
`klantportaal_`. Geen kolom, policy of functie van Storvo is aangepast, en de
refurbish-app is niet aangeraakt. Weghalen kan altijd met alleen die tabellen en
functies.

**Een opdracht leent de toestellen van een inkoopbatch.** `klantportaal_opdrachten`
verwijst naar een batch in `refurbish_batches`; de toestellen zijn de
`refurbish_apparaten` in die batch. Wis-status en bestemming per toestel staan in
`klantportaal_apparaten`. De beheer-app leest de Storvo-tabellen alleen.

**De klant leest niets rechtstreeks.** Een portaalgebruiker heeft geen rij in
`accounts` en dus geen `my_team_id()`. Alle bestaande policies geven hem niets.
Hij leest alleen via `klantportaal_overzicht()` en `klantportaal_opdracht()`,
die alleen veilige velden teruggeven: geen inkoop, geen marge, geen notities.
Dat is dezelfde aanpak als `reparatie-status`.

**Inloggen gaat met een link per mail**, zonder wachtwoord. De Edge Function
stuurt de link alleen naar bekende, actieve portaalgebruikers, in de huisstijl
van de winkel. `signInWithOtp` uit de browser gebruiken we bewust niet: dan kan
iedereen een account aanmaken en komt de mail van Storvo in plaats van Reloop it.

**De documenten zijn HTML om te printen.** De browser bewaart ze als PDF. Geen
PDF-bibliotheek, geen opslag, en een document klopt altijd met wat er op dat
moment in Storvo staat. De apparatenlijst is een CSV met puntkomma en BOM, zodat
Excel hem goed opent.

---

## Wat de winkel doet (/portaalbeheer/)

1. Bij Instellingen de huisstijl invullen. Daarmee staat het portaal aan.
2. Een opdracht maken, of een aanvraag uit het portaal aannemen.
3. Naam voor de klant, locatie en bod invullen.
4. De inkoopbatch koppelen waar je de toestellen in hebt gezet (in de refurbish-app).
5. Per stap op **Vandaag** drukken: opgehaald, gewist, getest, afgerond.
6. **Open op gewist** zet alle toestellen in één keer op gewist, met de wismethode
   uit de instellingen. Per toestel kun je wissen en bestemming aanpassen.
7. Bij Organisaties de contactpersoon uitnodigen. Die krijgt een mail met een inloglink.
8. **Bekijk als klant** opent het portaal precies zoals de klant het ziet.

---

## Live zetten

Stap voor stap, in deze volgorde.

1. **Migratie draaien** in Supabase (SQL Editor, of `apply_migration`):
   `supabase/migrations/20260919200000_klantportaal.sql`. Hij is veilig om twee
   keer te draaien.

2. **Instellingen voor Refuro** (eenmalig, in de SQL Editor):

   ```sql
   insert into klantportaal_instellingen (team_id, merknaam, domein, afzender,
     contact_naam, contact_email, contact_telefoon, logo_url)
   select id, 'Reloop it', 'portaal.reloopit.nl', 'Reloop it <portaal@reloopit.nl>',
     'Lucas', 'info@reloopit.nl', '+31 6 00 00 00 00', null
   from klanten where slug = 'refuro';
   ```

   `logo_url` mag een openbare https-link naar het logo zijn (svg of png).

3. **Edge Function uitrollen:**

   ```
   supabase functions deploy klantportaal --no-verify-jwt --project-ref ugilfxqolemxwssbpdwu
   ```

   Hij gebruikt de bestaande geheimen `RESEND_API_KEY` en `APP_URL`.

4. **Afzender bij Resend:** voeg het domein `reloopit.nl` toe en zet de DNS-records
   (SPF en DKIM). Zonder dat weigert Resend `portaal@reloopit.nl`.

5. **Inlog-adressen toestaan** in Supabase, Authentication, URL Configuration,
   Redirect URLs:

   ```
   https://portaal.reloopit.nl/**
   https://storvo.app/klantportaal/**
   ```

6. **Domein in Vercel:** voeg `portaal.reloopit.nl` toe aan het project en zet bij
   de domeinnaam een CNAME naar `cname.vercel-dns.com`. De rewrite in
   `vercel.json` stuurt elk adres op dat domein door naar `/klantportaal` (een redirect: een rewrite werkt niet voor `/`, want daar staat de Storvo-voorpagina).

7. **Proberen:** op /portaalbeheer/ een opdracht maken, een batch koppelen, jezelf uitnodigen met een ander e-mailadres dan je
   Storvo-account, inloggen via de mail.

---

## Wat er later nog bij kan

- De impactfactoren per categorie staan in `klantportaal_instellingen.impactfactoren`.
  Nu zijn het ronde, voorzichtige waarden. Een bron erbij zetten is netjes voor
  klanten die het in hun jaarverslag zetten.
- Het wiscertificaat noemt nu de methode uit de instellingen. Koppelt de imaging-
  module (FOG) later de echte wisrapporten, dan kan `wis_methode` per toestel
  uit dat rapport komen.
- Een knop in de refurbish-app naar /portaalbeheer/. Bewust nog niet gedaan: de
  refurbish-app is niet aangeraakt.
