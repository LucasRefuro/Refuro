# Van proefperiode naar betalend klant

De hele flow staat klaar in de app. Wat er nog moet gebeuren is Stripe vertellen
wát er verkocht wordt en tegen welke korting.

Tijd: ongeveer een kwartier. Drie onderdelen.

---

## Hoe de flow werkt

Dit gebeurt er vanzelf, zonder dat jij iets hoeft te doen:

| Wanneer | Wat de winkel ziet |
|---|---|
| Dag 1 tot 20 | Niets. Rustig laten proberen. |
| Nog 10 dagen | Eén melding: je bent op de helft. Vriendelijk. |
| Nog 5 dagen | Eén melding, met de nadruk op wat er stopt. |
| Nog 4, 3, 2, 1 dagen | Elke dag één melding. |
| Laatste dag | Melding die je niet zomaar wegklikt. |
| Drukt op **Nee, bedankt** | Het aanbod: eerste maand 70% korting. |

Bovenaan loopt vanaf tien dagen ook een balkje mee met de resterende dagen en
een knop om het meteen te regelen.

Twee dingen die het verschil maken en er al in zitten:

- **Nooit twee keer op een dag.** Wie gisteren nee zei krijgt vandaag pas weer
  wat te zien. Zeuren werkt averechts.
- **Het gaat over wat je kwijtraakt, niet over de prijs.** In de melding staat
  wat er op dat moment in hun Storvo staat: zoveel producten, zoveel
  reparaties, zoveel omzet. Dat overtuigt sterker dan welk bedrag dan ook.

Alleen de eigenaar krijgt deze schermen. Een medewerker die op zaterdag
invalt hoeft hier niets van te merken.

---

## Onderdeel 1 — De prijs-ID's ophalen

Je hebt Start, Pro en Enterprise al staan in Stripe. Van elk heb je de code
nodig die begint met `price_`.

1. Klik in de lijst op **Start**.
2. Scroll naar het blok **Tarieven** (of **Prijzen**).
3. Klik rechts op de regel op de drie puntjes **⋯**.
4. Kies **Prijs-ID kopiëren** (of *Copy price ID*).
5. Plak hem in een tekstbestandje.

Herhaal dit voor **Pro** en **Enterprise**.

> Zie je de drie puntjes niet? Klik dan gewoon op de prijsregel zelf. Bovenaan
> de pagina die opent staat de code, met een kopieerknopje ernaast.

**Gelukt als:** je drie codes hebt die beginnen met `price_`.

---

## Onderdeel 2 — De kortingsbon

1. Klik in het linkermenu op **Producten** → **Coupons** → **Coupon maken**.
2. Naam: `Eerste maand 70%`
3. Type: **Percentage**, waarde **70**.
4. Duur: **Eenmalig** (dus alleen de eerste maand).
5. Klik op **Coupon maken**.
6. Kopieer de code die eronder verschijnt.

> Zet er géén vervaldatum op. De bon wordt alleen aangeboden aan winkels die op
> hun laatste dag nee zeggen, dus hij ligt niet op straat.

**Gelukt als:** je een couponcode hebt.

---

## Onderdeel 3 — Beide codes in Supabase

Ga naar:

```
https://supabase.com/dashboard/project/ugilfxqolemxwssbpdwu/functions/secrets
```

Klik op **Add new secret** en voeg deze toe:

| Naam | Waarde |
|---|---|
| `STRIPE_PRIJS_START` | de `price_` code van Start |
| `STRIPE_PRIJS_PRO` | de `price_` code van Pro |
| `STRIPE_PRIJS_ENTERPRISE` | de `price_` code van Enterprise |
| `STRIPE_KORTING_COUPON` | de couponcode uit onderdeel 2 |
| `APP_URL` | `https://storvo.app` |

Storvo kijkt bij het afrekenen welk pakket de winkel heeft en pakt de
bijbehorende prijs. Verkoop je later een vierde pakket, dan zet je er gewoon
`STRIPE_PRIJS_<NAAM>` bij; aan de code hoeft niets te veranderen.

`STRIPE_SECRET_KEY` en `STRIPE_WEBHOOK_SECRET` staan er al.

**Gelukt als:** alle vijf in de lijst staan.

---

## Testen zonder een maand te wachten

Je hoeft niet dertig dagen te wachten om de schermen te zien.

1. Ga naar de **SQL Editor** in Supabase.
2. Voer dit uit, met je eigen winkel-id:

```sql
update klanten set proef_tot = now() + interval '1 day', status = 'proef'
where naam = 'Refuro';
```

3. Ververs de app. Je krijgt het scherm voor de laatste dag.
4. Klik op **Nee, bedankt** en je ziet het kortingsaanbod.

Wil je een ander moment zien, verander dan `1 day` in `5 days` of `10 days`.
Wis daarna in je browser de onthouden meldingen, anders denkt Storvo dat je ze
al gezien hebt: open de console en typ

```js
Object.keys(localStorage).filter(k=>k.startsWith('storvo_nudge')).forEach(k=>localStorage.removeItem(k))
```

Zet je winkel daarna weer goed:

```sql
update klanten set status = 'actief' where naam = 'Refuro';
```

---

## Wat je later nog kunt doen

Geen haast, maar het loont:

- **Een e-mail op dag 25.** Wie de app een week niet opent ziet de melding niet.
  Een mailtje vangt die groep op. Kan met dezelfde Resend-koppeling die je al
  hebt.
- **Kijken waar ze afhaken.** In het beheerpaneel zie je per winkel de status.
  Blijven veel winkels op dag 3 steken zonder ooit een reparatie aan te maken,
  dan is het probleem niet de prijs maar de eerste week.
- **De korting meten.** Zet er in Stripe een aparte coupon op zodat je in het
  dashboard ziet hoeveel klanten via het aanbod binnenkomen. Levert het niets
  op, dan kun je hem zonder gevolgen weghalen: de app werkt gewoon door als de
  bon niet is ingesteld.
