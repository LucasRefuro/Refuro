# Storvo

Alles-in-één software voor telefoon- en laptopreparatiewinkels: voorraad,
reparaties, kassa, klantstatus, een refurbishmodule en een beheerpaneel voor
Storvo zelf.

Werk je hieraan mee, lees dan eerst **`CLAUDE.md`** (hoe het in elkaar zit en
waar de valkuilen zitten) en **`OPENSTAAND.md`** (wat er nog moet gebeuren).

## Structuur

```
/                     index.html   marketingsite (storvo.nl en storvo.app)
/app/                 index.html   de winkelapp
/app/scan.html                     de scanner op je telefoon
/refurbish/           index.html   de refurbish-app (bijkoopmodule)
/refurbish/foto.html               fotograferen met je telefoon
/admin/               index.html   het beheerpaneel van Storvo zelf
/r/                   index.html   de publieke klantpagina bij een reparatie
/supabase/functions/               de Edge Functions (Deno)
/tests/                            browsertests
```

Alle pagina's zijn losse statische bestanden met hun eigen CSS en JavaScript
erin. Geen framework, geen bouwstap. De gegevens staan in Supabase.

## Lokaal bekijken

```
npx serve .
```

Openen kan ook door een bestand naar je browser te slepen, maar met een lokale
server werken de links tussen de pagina's zoals ze live werken.

## Testen

```
npm test
```

Twaalf testbestanden, ongeveer 570 controles, klaar in een paar seconden. Alles
moet groen zijn voordat je pusht.

## Live zetten

Elke push naar `main` gaat automatisch naar Vercel en staat binnen een minuut
live.

```
git add -A
git commit -m "wat je gedaan hebt"
git push origin main
```

Edge Functions rollen daar níét mee uit; die staan in Supabase en worden apart
uitgerold.

## Geheimen

Nooit in de code en nooit in een commit. Ze staan in Supabase onder Project
Settings → Edge Functions → Secrets. Welke er zijn en waar ze voor dienen staat
in `supabase/functions/README.md`.
