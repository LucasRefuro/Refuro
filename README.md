# Refuro

Beheersysteem voor telefoonreparatiewinkels: voorraad, reparaties, klantstatus en een beheerpaneel voor het bedrijf zelf.

## Structuur

```
/                index.html   marketingwebsite (openbare landingpagina)
/app/            index.html   de winkelapp (dashboard, scannen, reparaties, voorraad, team)
/admin/          index.html   beheerpaneel (klanten, abonnementen, Stripe-voorbereiding)
```

Alle drie zijn losse statische bestanden zonder build-stap. Data van de winkelapp en het beheerpaneel staat nu nog lokaal in de browser (localStorage); dat verplaatsen we later naar een echte database (Supabase) zodra meerdere winkels/gebruikers tegelijk moeten werken.

## Lokaal bekijken

Geen installatie nodig, gewoon een bestand openen in de browser. Voor het testen van links tussen de pagina's (bijvoorbeeld vanaf de marketingsite naar /app/) is een simpele lokale server handiger:

```
npx serve .
```

## Live zetten (GitHub + Vercel)

1. Maak een lege repo aan op github.com (geen README/gitignore aanvinken, die heb je al).
2. In deze map, eenmalig:
   ```
   rm -rf .git
   git init
   git add -A
   git commit -m "v1.0.0: eerste versie"
   git branch -M main
   git remote add origin git@github.com:JOUW-GEBRUIKERSNAAM/refuro.git
   git push -u origin main
   ```
3. Ga naar vercel.com, "Add New Project", kies je GitHub-repo. Vercel herkent automatisch dat het een statische site is (geen buildinstellingen nodig). Klik Deploy.
4. Klaar: elke push naar `main` zet automatisch een nieuwe versie live.

## Nieuwe functies uitrollen zonder de live site te breken

```
git checkout -b feature/naam-van-de-functie
# wijzigingen maken
git add -A
git commit -m "omschrijving"
git push -u origin feature/naam-van-de-functie
```

Vercel maakt automatisch een eigen preview-link voor die branch, los van de live site. Test daar rustig. Pas als het goed is: merge de branch naar `main` (via een Pull Request op GitHub, of lokaal `git checkout main && git merge feature/naam-van-de-functie && git push`) en de live site werkt automatisch bij.

Voor een vaste versienotatie: na elke merge naar main een tag zetten, bijvoorbeeld:
```
git tag v1.1.0
git push --tags
```
Zie CHANGELOG.md voor het overzicht per versie.

## Volgende stap: Supabase

Zodra de app naar meerdere winkels/medewerkers tegelijk moet, vervangen we localStorage door Supabase (database + login). Dat is een aparte module: eerst het datamodel (producten, reparaties, medewerkers, klanten) als tabellen opzetten, dan de opslagfuncties in de app aanpassen zodat ze naar Supabase schrijven in plaats van localStorage.
