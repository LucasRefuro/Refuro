# Storvo

Alles-in-één software voor telefoon- en laptopreparatiewinkels. Nederlandse
markt, Nederlandse taal, kleine winkels met één tot vijf man personeel.

Dit bestand is bedoeld om je in tien minuten op snelheid te brengen. Lees het
voordat je iets verandert; er staan een paar dingen in die je anders op de
harde manier ontdekt.

---

## De domeinen

| Wat | Waar |
|---|---|
| Marketingsite (Nederlands) | storvo.nl |
| Marketingsite (Engels) | storvo.app |
| De winkelapp | /app/ |
| De refurbish-app (bijkoopmodule) | /refurbish/ |
| Het beheerpaneel van Storvo zelf | /admin/ |
| Publieke klantpagina bij een reparatie | /r/ |

Supabase-project: `ugilfxqolemxwssbpdwu`.
Uitrollen gaat via GitHub naar Vercel: elke push naar `main` staat binnen een
minuut live. Er is geen bouwstap.

---

## Hoe het in elkaar zit

Statische HTML-bestanden, elk één bestand met zijn eigen CSS en JavaScript erin.
Geen framework, geen bundler, geen npm-pakketten in de browser. De enige
afhankelijkheid is de Supabase-client van een CDN.

```
/index.html              marketingsite
/app/index.html          de winkelapp        (~9.600 regels)
/refurbish/index.html    de refurbish-app    (~4.400 regels)
/admin/index.html        het beheerpaneel
/app/scan.html           de scanner op je telefoon
/refurbish/foto.html     fotograferen met je telefoon
/supabase/functions/     de Edge Functions (Deno, TypeScript)
/tests/                  browsertests met jsdom
```

**Waarom één groot bestand per app.** Dat is een keuze, geen slordigheid. Er is
geen bouwstap nodig, je kunt een pagina openen door hem in de browser te slepen,
en er kan niets stuk gaan aan een importpad. De prijs is dat de bestanden groot
zijn. Zoek met de sectiekoppen (`/* ═══ naam ═══ */`) in plaats van te scrollen.

**De gegevens** staan in Supabase (Postgres). De winkelapp bewaart zijn eigen
werkgegevens als één JSON-blob in `winkeldata` per winkel; de nieuwere onderdelen
(hardware, refurbish, bestellingen) hebben echte tabellen. Dat is historisch
gegroeid: begin niet aan een migratie zonder aanleiding, maar zet nieuwe dingen
wel in echte tabellen.

---

## Taal en stijl

**Alles in het Nederlands.** Variabelen, functies, tabelnamen, kolomnamen,
commentaar, commit-berichten. `hwLaad`, `ctrAfronden`, `webshop_bestellingen`.
Engelse termen alleen waar ze uit een externe API komen (`webhook`, `token`).

**Commentaar legt uit wáárom, niet wat.** Niemand heeft iets aan
`// haal de gebruiker op`. Wel aan: waarom deze aanpak en niet de voor de hand
liggende, welke fout er ooit gemaakt is, wat er kapot gaat als je het weghaalt.
Kijk naar de bestaande blokken; die toon is de bedoeling.

**Teksten voor de winkelier zijn kort en concreet.** Geen jargon, geen "Er is
een fout opgetreden", wel "Dit nummer ken ik niet". De eigenaar heeft ADHD en
dyslexie: korte zinnen, geen streepjes-opsommingen in de app zelf, één ding per
scherm.

**Geen emoji, nergens.**

---

## Voordat je iets pusht

```
npm test
```

Twaalf testbestanden, ~570 controles, draait in een paar seconden. Alles moet
groen. Dit is geen formaliteit: de tests hebben al meerdere keren een fout
gevangen die in de browser pas dagen later was opgevallen.

### `tests/huisstijl.js` is de belangrijkste

Die kijkt niet naar wat de app doet maar naar hoe hij in elkaar zit, en vangt
precies de fouten die nooit een foutmelding geven:

- een knop die naar een functie wijst die niet bestaat
- twee functies met dezelfde naam (de laatste wint stilletjes)
- twee keer dezelfde `id` (`getElementById` pakt de eerste, dus de verkeerde
  helft van het scherm wordt gevuld)
- een klasse in de opmaak zonder één stijlregel
- een kleur die in dít bestand anders heet
- keuzelijsten van het besturingssysteem in plaats van de onze
- externe links zonder `rel="noopener"`

Beide fouten die bij de laatste doorlichting gevonden zijn waren van dit soort.
Voeg er een controle aan toe als je een nieuw soort stille fout tegenkomt.

### De testopzet

De tests laden de echte HTML in jsdom met een nagebootste Supabase-client. Eén
truc is essentieel: **de CDN-`<script src>` wordt vervangen door een inline
`<script>` met de nabootsing**, niet achteraf ingeschoten. Alleen zo blijven de
`let`-variabelen uit het scriptblok bereikbaar via `w.eval()`.

---

## Vallen waar we al in gelopen zijn

**`[hidden]` verliest van elke regel die `display` zet.** Er staat daarom
`[hidden]{display:none !important;}` bovenaan elke app. Haal dat niet weg; het
slotscherm lag ooit als lege witte kaart over de hele app.

**Twee functies met dezelfde naam geven geen fout.** De laatste wint. Dit is
één keer maandenlang onopgemerkt gebleven.

**Hertekenen gooit je invoer weg.** Zet je `innerHTML` opnieuw, dan is de focus
weg en springt de pagina. In de controle van de refurbish-app wordt daarom
onthouden waar de cursor stond. Doe dat ook elders, of teken minder vaak.

**Shopify: de REST-API voor producten is afgeschreven.** Alles gaat via de
GraphQL Admin API, versie staat in `supabase/functions/_gedeeld/shopify.ts`.
Een product aanmaken is niet hetzelfde als het zichtbaar maken: daarvoor is
`publishablePublish` nodig én het recht `write_publications`.

**Legacy custom apps kun je sinds 1 januari 2026 niet meer aanmaken.** Koppelen
gaat via OAuth. De weg met een geplakt token staat er nog voor winkels die al
een oude app hebben.

**DNS-antwoorden worden ook negatief gecached.** Krijg je "geen MX-record",
controleer het dan met `cd=1` op dns.google voordat je concludeert dat er iets
stuk is. Dat heeft hier ooit een halve avond gekost.

---

## Geheimen

Nooit in de code, nooit in een chat, nooit in een commit. Ze staan in Supabase
onder Project Settings → Edge Functions → Secrets. De volledige lijst met wat
elk geheim doet staat in `supabase/functions/README.md`.

Webshoptokens van winkels staan versleuteld in `winkel_koppelingen`. Die tabel
heeft **bewust geen RLS-policies**: zonder policy komt geen enkele ingelogde
gebruiker erbij, ook niet als er ergens per ongeluk een `select` op losgelaten
wordt. Alleen de service_role kan erbij. Laat dat zo.

---

## De belangrijkste tabellen

| Tabel | Waarvoor |
|---|---|
| `klanten` | de winkels (dit is de tenant) |
| `accounts` | gebruikers, met `team_id` naar `klanten` |
| `winkeldata` | de werkgegevens van de winkelapp, als JSON per winkel |
| `hardware` | unieke exemplaren: één laptop is één regel |
| `hardware_locaties` | winkel, magazijn, werkplaats |
| `hardware_modellen` | gedeelde modellenlijst met specificaties en uitvoeringen |
| `refurbish_apparaten` | toestellen op de werkbank |
| `refurbish_fotos` | foto's per toestel, met een hoofdfoto |
| `voorraad_verplaatsingen` | wie heeft wat waarheen gebracht |
| `winkel_koppelingen` | de webshopkoppeling per winkel (versleuteld) |
| `webshop_bestellingen` | wat er online besteld is |

RLS staat overal aan en werkt via de hulpfunctie `my_team_id()`.

---

## De verdeling tussen de twee apps

De grens ligt op één moment: **zodra een toestel de controle heeft gehaald.**

- **Refurbish-app** = de werkbank. Toevoegen, controleren, repareren, slopen,
  onderdelen, foto's, de advertentie schrijven, online zetten.
- **Winkelapp** = de balie. Verkoopbare voorraad, kassa, klant, garantie,
  cijfers, en de webshopbestellingen.

Wat er over de grens gaat is weinig: een goedgekeurd toestel wordt een rij in
`hardware`, en verkocht in de winkelapp geeft een seintje terug.

---

## Documenten

| Bestand | Waarover |
|---|---|
| `OPENSTAAND.md` | **wat er nog moet gebeuren, begin hier** |
| `REFURBISH-STAPPENPLAN.md` | de refurbishmodule, van toevoegen tot online |
| `ABONNEMENT-STAPPENPLAN.md` | Stripe, proefperiode, blokkade |
| `WHATSAPP-STAPPENPLAN.md` | berichten naar de klant |
| `MAILBOX-STAPPENPLAN.md` | de mailbox op info@storvo.nl |
| `supabase/functions/README.md` | elke Edge Function en elk geheim |
| `tests/README.md` | wat elke test bewaakt |
