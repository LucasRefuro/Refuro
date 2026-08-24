# Overdracht — zelfstandige werksessie

Bijgewerkt op 13 augustus 2026. Geschreven terwijl jij een uur weg was. Hieronder:
wat ik heb gedaan en gepusht, wat jij nog moet doen (met stappen), en de
voorbereiding voor het uploaden van de webshopdata.

> Alle codewijzigingen met groene tests zijn naar `main` gepusht en staan live
> (Vercel). Eén uitzondering: de Edge Function `shopify-webhook` moet je apart
> opnieuw uitrollen — zie deel B, punt 7.

---

## Deel A — Wat ik heb gedaan (klaar en gepusht)

1. **Voorraad: winkel en over apart.** Elk product heeft nu vier getallen
   (actuele winkel + min. winkel, actuele over + min. over), met automatische
   bestellijst zodra een van beide onder z'n minimum komt, en de vier getallen
   zijn direct in de productentabel te bewerken. Migratie van bestaande
   producten loopt mee. Nieuw testbestand `tests/productenvoorraad.js`.
2. **Scan-sprong opgelost.** Bij Snel toevoegen springt de pagina niet meer naar
   boven na een scan; de cursor gaat naar het volgende model met `preventScroll`.
3. **Shopify-webhook-bug opgelost.** Een verkocht toestel zónder code/serienummer
   raakte bij vervolgmeldingen (paid/cancelled/fulfilled) zoek, en annuleren zette
   het niet terug op voorraad. De eerder bewaarde bestelling is nu de betrouwbare
   terugval. **Let op:** deze Edge Function moet je opnieuw uitrollen (deel B-7).
4. **Nagekeken.** Alle tests groen (580 controles). Supabase-adviezen opgehaald;
   bevindingen staan in deel D. `.claude/settings.local.json` staat sinds vorige
   sessie in `.gitignore`.
5. **Webshop-repo.** `storvo-sync/.env.example` toegevoegd (ontbrak, docs verwezen
   ernaar). Grote bevinding over de twee pijplijnen: zie deel C.

---

## Deel B — Wat jij moet doen (kan ik niet: geheimen/accounts)

### 1. Webshopkoppeling: drie instellingen in Supabase
Project Settings → Edge Functions → Secrets.
- `KOPPELING_SLEUTEL` — genereer met `openssl rand -base64 32`, plak de regel.
- `SHOPIFY_CLIENT_ID` en `SHOPIFY_CLIENT_SECRET` — uit een Shopify-app "Storvo"
  (zie punt 2).
- Opruimen: `SHOPIFY_WINKEL`, `SHOPIFY_TOKEN`, `SHOPIFY_WEBHOOK_SECRET` mogen weg.

### 2. Shopify-app aanmaken
[Shopify Dev Dashboard](https://dev.shopify.com/dashboard) → app "Storvo",
**Custom distribution**, jouw winkel. Terugkomstadres:
`https://ugilfxqolemxwssbpdwu.supabase.co/functions/v1/shopify-installeren`.
Client ID + secret → Supabase (punt 1). Distributiemethode is achteraf niet te
wijzigen.

### 3. Icecat voor fabrieksfoto's
Gratis account op icecat.biz → gebruikersnaam in Supabase als `ICECAT_GEBRUIKER`.

### 4. WhatsApp
Volg `WHATSAPP-STAPPENPLAN.md`. Je was bij Onderdeel 1 (je eigen telefoon als
testontvanger in Meta). Daarna: token maken (permanent, via business.facebook.com —
niet de tijdelijke knop), `META_WA_NUMMER_ID` + `META_WA_TOKEN` in Supabase, de
zes sjablonen indienen, en later een NL sim-only nummer + Meta-bedrijfsverificatie.
De Storvo-kant is klaar en de sjabloonnamen kloppen.

### 5. Stripe: refurbish-maandprijs
Bepaal de maandprijs van de refurbishmodule; zeg het bedrag, dan zet ik hem als
tweede regel in Stripe.

### 6. Lekwachtwoord-bescherming
Kan pas aan op het Supabase Pro-pakket (Auth → Password security). Bevestigd door
de Supabase-veiligheidscheck.

### 7. Edge Function `shopify-webhook` opnieuw uitrollen
Ik heb de bron gefixt en gecommit, maar Edge Functions rollen niet mee met een
push naar `main`. Rol hem opnieuw uit met de Supabase CLI (of het dashboard):
`supabase functions deploy shopify-webhook`. Zonder dat draait de oude versie met
de bug nog.

---

## Deel C — Webshopdata uploaden: gebouwd en droog getest

**Keuze gemaakt:** één product per uniek toestel (model A). Je thema leest de
specs en de staat op productniveau (`product.metafields.refuro.*`), dus varianten
per grade zijn niet nodig. Dat past bij unieke refurbished laptops met eigen
foto's.

**Wat ik heb gebouwd en getest** (in `refuro-webshop/storvo-sync/`, lokaal
gecommit — die repo heeft geen remote):

- **`src/webshop-upload.js`** — zet elk toestel als eigen Shopify-product neer,
  thema-correct: de `refuro.*` metafields (cpu, ram, opslag, scherm,
  accu_gezondheid, geschikt_voor, …), de grade als *uitstekend/zeer_goed/prima*,
  de filter-tags (`merk-`, `staat-`, `gebruik-`) en de nieuwprijs als
  Shopify-vergelijkprijs. Standaard **droog** (schrijft niets).
- **`src/metafields-aanmaken.js`** — maakt in één keer alle 24 metafield-definities
  aan (scheelt 24× klikken).
- **`voorbeeld-toestellen.csv`** — 6 verzonnen laptops als proefdata.
- **`GEBRUIK-UPLOAD.md`** — de gebruiksuitleg.

Beide scripts draaien **zonder `npm install`**. De droogloop op de proefdata gaf
**0 waarschuwingen** en de mapping klopt (grade, tags, prijzen, metafields,
locatie).

**Om het live te zetten hoef jij alleen:**
1. `storvo-sync/.env` invullen (kopie van `.env.example`): `SHOPIFY_SHOP`, je
   `SHOPIFY_ADMIN_TOKEN`, en de twee locatie-ID's (winkel + magazijn).
2. `node src/metafields-aanmaken.js --toepassen` (de definities aanmaken).
3. De proefdata vervangen door je echte toestellen in dezelfde kolommen — of geef
   ze mij, dan giet ik ze erin.
4. `node src/webshop-upload.js jouw-toestellen.csv` (droog controleren), en dan
   met `--toepassen` echt uploaden.

**Nog niet ingebouwd:** foto's van je computer rechtstreeks uploaden (vraagt een
staged upload). Foto's die al op een publieke URL staan — zoals die uit de
refurbish-app — werken wel: zet ze in een kolom `fotos`, gescheiden met een `|`.

**Ter info:** de live Edge Function (`supabase/functions/shopify/index.ts`) schrijft
nog het oude formaat (specs in de omschrijving, grade als `staat-A`). Voor de
doorlopende "Online zetten"-knop per toestel zou die dezelfde mapping moeten
krijgen. Dat raakt de klantpagina's, dus dat stem ik met je af; de CSV-route
hierboven is nu de batchweg.

---

## Deel D — Nakijken: Supabase-adviezen (niet uitgevoerd, jouw keuze)

Ik heb de productie-database niet aangepast terwijl je weg was. Bevindingen:

- **`winkel_koppelingen` zonder RLS-policy:** bewust zo (alleen service_role).
  Laten staan.
- **Overige tabellen met RLS-aan-zonder-policy** (afzenders, feedback,
  koppel_pogingen, platform_admins, prijspunten): INFO. Waarschijnlijk ook bewust
  service-role-only; nakijken of dat klopt.
- **SECURITY DEFINER-functies aanroepbaar door anon/authenticated** (my_team_id,
  my_rol, email_for_username, invite_info, …): grotendeels nodig voor de RLS en de
  login-/uitnodigingsflow. Niet blind wijzigen.
- **Prestatie (INFO/WARN):** ontbrekende indexen op foreign keys, RLS-policies die
  `auth.<fn>()` per rij herevalueren (fix: `(select auth.<fn>())`), en een paar
  ongebruikte indexen. Allemaal veilige optimalisaties, maar het zijn
  DDL-wijzigingen op productie en de database heeft nu nauwelijks data — ik zou dit
  uitstellen tot er echt volume is. Kan ik zo doen zodra je terug bent.

---

## Deel E — Refurbish-kant

**Conclusie: de refurbish-kant is grotendeels af en van begin tot eind bedraad.**
De hele keten werkt — toevoegen → labels → controle (met tijdlijn, automatische
doorloop, accu-advies, 2-minutenwekker) → Windows → specs (alle uitvoeringen) →
afronden → slopen/onderdelen → reparatie → parts-inkoop → foto's → scherm
rechtzetten/achtergrond → prijs → advertentie → publiceren → inscannen/verhuizen.
Elke knop wijst naar een bestaande functie, elke Edge Function bestaat, en de
grens (goedgekeurd toestel → rij in `hardware` → winkelapp → Shopify → verkocht
terug) is dicht.

### Wat ik heb gedaan
- **RPC-namen geverifieerd** tegen de database: `model_onthouden`, `model_bewaren`
  én `model_opties_bewaren` bestaan alle drie. Geen stille fout — dit gat is er niet.
- **Stale tekst weggehaald**: het lege-werkbank-scherm zei nog "Maak een
  inkoopbatch aan…", terwijl batches er bewust uit zijn. Nu: "Voeg apparaten toe
  met de knop Toevoegen…".

### Beslispunt voor jou: serienummer
De refurbish-flow legt **bewust geen serienummer vast** — de tests bewaken dat
(niet gevraagd bij toevoegen, niet getoond op de apparaatpagina). Maar
`REFURBISH-STAPPENPLAN.md` (Fase 0) zegt dat een uniek exemplaar er altijd één
heeft, en `naarVoorraad()` schrijft `serienummer` naar `hardware` (nu altijd leeg),
waar op de webshop onder meer de SKU aan hangt. Dit is dus een tegenstrijdigheid,
geen simpele bug. Ik heb een werkende variant gebouwd (invoerveld op de
apparaatpagina, dat doorschrijft naar `hardware`) maar die weer **teruggedraaid**,
omdat hij een expliciete, test-vastgelegde keuze omkeert. Wil je serienummer
vastleggen? Zeg waar (apparaatpagina en/of controle) en ik bouw het inclusief
bijgewerkte tests. Zo niet, dan kan de lege `serienummer`-verwijzing weg.

### Kleine punten (niet urgent, ter beoordeling)
- **Icecat "Fabrieksfoto's overnemen"** haalt de afbeelding client-side op bij de
  Icecat-CDN (`refurbish/index.html`, `fotoOvernemen`). Dat wordt waarschijnlijk
  door de browser geblokkeerd (CORS). Slaapt nu toch, want `ICECAT_GEBRUIKER` is
  niet gezet; als je Icecat aanzet, moet dit via een server-proxy. Plan, geen
  spoed.
- **`garantie:0`** bij goedkeuring (`naarVoorraad`): een toestel dat wel goedgekeurd
  maar nog niet online is, toont 0 maanden garantie in Storvo tot je publiceert.
  Wil je een standaard (6 of 12 maanden)? Zeg welke, dan zet ik hem.
- **Filter met modelnaam** in `fotosLaden` (`.or(...)`): een modelnaam met een komma
  of haakje kan het filter breken. Zeldzaam, maar een scherpe rand.
- **Twee advertentie-schrijvers** (`advertentie` voor refurbish, `hardware-tekst`
  voor de winkelapp) overlappen; geen bug, maar ze kunnen na verloop van tijd uit
  elkaar lopen.
