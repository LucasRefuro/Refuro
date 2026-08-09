# Refurbish als bijkoopmodule

> **Stand van zaken: gebouwd.** Fase 0 tot en met 3 staan er. Wat jij nog moet
> doen staat onderaan onder "Wat er nog van jou nodig is".

Een tweede product naast Storvo, voor winkels die apparaten opknappen en
doorverkopen. De meeste winkels hebben het niet nodig, dus het wordt geen
onderdeel van de pakketten maar iets wat je erbij koopt.

Dit plan gaat over vier dingen, in deze volgorde:

1. Het unieke exemplaar in Storvo (fundament, moet eerst)
2. Het hardware-overzicht
3. De Shopify-koppeling
4. De refurbish-app zelf

---

## De verdeling

De grens ligt op één moment: **zodra een apparaat goedgekeurd is.**

| Refurbish-app (de werkbank) | Storvo (de balie) |
|---|---|
| Toevoegen en labelen | Verkoopbare voorraad |
| Specificaties bij de controle | Verkoopprijs en marge |
| De gedeelde modellenlijst | Kassa en bon |
| Checklists en controle | Klant en garantie |
| Reparatie en repurpose | Reparaties aan de balie |
| Onderdelenvoorraad | Dashboard en cijfers |
| Inkooporders voor parts | Boekhoudexport |

Wat er over de grens gaat is maar drie dingen:

- Een goedgekeurd apparaat wordt een product in Storvo, met serienummer,
  specificaties, inkoopprijs en batchnummer erbij
- Verkocht in Storvo geeft een seintje terug, zodat het apparaat uit de
  pijplijn verdwijnt
- Gedeeld blijven: de inlog, de leverancierslijst en de AI die specificaties
  opzoekt

Onderdelen uit gesloopte apparaten blijven aan de werkbankkant. Die zijn stuk
voor stuk uniek en horen niet tussen de schermbeschermers in de winkelvoorraad.

---

## Fase 0 — Het unieke exemplaar

**Waarom dit eerst moet.** Storvo telt nu aantallen: vijf hoesjes is één regel
met een vijf erachter. Een gerefurbishte laptop is één exemplaar met een eigen
serienummer, een eigen inkoopprijs en een eigen geschiedenis. Bouw je dat er
later in, dan moet alles wat erop leunt weer om.

Wat erbij komt:

- Een product krijgt een soort: **bulk** (zoals nu) of **uniek exemplaar**
- Een uniek exemplaar heeft altijd aantal 1, plus velden voor serienummer,
  inkoopprijs, staat (A, B, C), garantie en herkomst
- De kassa weet dat een uniek exemplaar na verkoop weg is, niet afgeteld
- De cijfers rekenen met de inkoopprijs van dát exemplaar, niet met een
  gemiddelde

Dit werkt ook zonder de refurbish-app. Een winkel die een tweedehands toestel
inruilt en doorverkoopt heeft er meteen wat aan.

---

## Fase 1 — Hardware-overzicht

Een pagina in Storvo met alle unieke exemplaren op een rij.

Per regel: model, serienummer, staat, inkoopprijs, vraagprijs, marge, hoe lang
hij al staat, en een kolom **kanalen** waarin je ziet waar hij online staat.

Filters: alles, alleen op voorraad, alleen online, langer dan dertig dagen
onverkocht. Die laatste is de nuttigste: dat is geld dat op een plank ligt.

---

## Fase 2 — Shopify

### Wat het oplost

Eén laptop staat op Shopify, op Marktplaats en in de winkel. Verkoop je hem aan
de balie, dan moet hij binnen een minuut overal offline. Zonder koppeling
verkoop je hem twee keer en mag je een klant bellen dat het toch niet doorgaat.

### Hoe het loopt

| Wat er gebeurt | Wat het systeem doet |
|---|---|
| Apparaat is verkoopklaar | Knop **Op Shopify zetten**: product aanmaken met voorraad 1, foto's en de AI-tekst |
| Verkocht in de webshop | Shopify meldt het, Storvo haalt hem uit de voorraad |
| Verkocht aan de balie | Storvo zet hem meteen op onbeschikbaar in Shopify |
| Prijs aangepast in Storvo | Gaat mee naar Shopify |

Marktplaats kan dit niet; die hebben geen bruikbare koppeling voor gewone
advertenties. Daar blijft het kopiëren, met een handmatig vinkje "staat op
Marktplaats" zodat je wel ziet dat je hem daar nog weg moet halen.

### Wat jij in Shopify moet doen

Eén keer, ongeveer tien minuten.

1. Shopify-beheer → **Instellingen** → **Apps en verkoopkanalen**
2. Klik **Apps ontwikkelen** → **App maken** → noem hem `Storvo`
3. Tabblad **Configuratie** → **Admin API** → geef deze rechten:
   - `read_products`, `write_products`
   - `read_inventory`, `write_inventory`
   - `read_orders`
4. **Installeren**
5. Tabblad **API-referenties** → onthul het **Admin API-toegangstoken**
   (begint met `shpat_`)

**Dat token is een sleutel tot je webshop.** Plak hem nergens in een chat. Je
zet hem zelf in Supabase onder Project Settings → Edge Functions → Secrets:

| Naam | Wat erin komt |
|---|---|
| `SHOPIFY_WINKEL` | Je winkeladres, bijvoorbeeld `mijnwinkel.myshopify.com` |
| `SHOPIFY_TOKEN` | Het token dat begint met `shpat_` |

Later, wanneer ook andere winkels hun eigen webshop koppelen, verhuist dit naar
een koppelknop in de instellingen per winkel. Voor nu is jouw winkel genoeg om
het werkend te krijgen.

---

## Fase 3 — De refurbish-app

Een eigen pagina naast de winkelapp, met dezelfde huisstijl, dezelfde inlog en
dezelfde database. Voor de winkelier één product, voor ons twee bestanden die
je apart kunt onderhouden.

In deze volgorde, want elk stuk is op zichzelf al bruikbaar:

1. **Toevoegen.** Eén veld voor merk en model, aantal, inkoopprijs en
   leverancier. Geen inkoopbatches: je staat met een doos naast je en wilt
   doorwerken. Specificaties vraagt de app hier niet, want die weet je nog niet.
2. **Labels.** Rollen er meteen uit na het toevoegen. Bovenaan waar het apparaat
   in het proces staat, daaronder merk en model groot, het korte nummer, en een
   QR die naar dit apparaat wijst. Na de controle druk je hem opnieuw af; dan
   staan de specificaties er ook op.
3. **De controle als stappenpad.** Geen lange lijst, maar een pad dat meebeweegt
   met wat je antwoordt:

   | Vraag | Ja | Nee |
   |---|---|---|
   | Start hij op? | door naar de hardware | brandt er een lampje? |
   | Brandt er een lampje? | geheugen nakijken | openmaken, accu en bios-batterij los, twee minuten wachten |
   | Start hij nu op? | door naar de hardware | slopen voor onderdelen |

   Bij die twee minuten loopt een wekker mee die piept als het klaar is.
   Daarna de functionele test, en dan de visuele inspectie met strafpunten:
   behuizing, scherm, toetsenbord en scharnieren. Nul tot twee punten is een A,
   tot en met zeven een B, daarboven een C. Een barst in het scherm telt voor
   acht, dus die haalt hem er in zijn eentje uit.

   De uitkomst volgt uit de antwoorden: alles goed is klaar voor verkoop met
   grade, één kapotte toets stuurt hem naar de reparatielijst, en een apparaat
   dat niet meer aan gaat wordt gesloopt. Wat daar nog goed aan is vink je aan
   en gaat meteen naar de onderdelenvoorraad, met een label waar dat op staat.
3b. **De modellenlijst.** Bij de controle vul je in wat erin zit, of je drukt op
   *Specificaties opzoeken*. Die kijkt eerst in een gedeelde lijst en vraagt het
   pas aan AI als het model nieuw is. Wat eruit komt gaat de lijst in, dus het
   wordt maar één keer opgezocht. Specificaties van een laptopmodel zijn
   openbare feiten, dus die lijst is gedeeld met alle winkels; er staat niets in
   wat naar een winkel of een klant te herleiden is.
4. **Controle.** QR scannen opent de juiste lijst. De uitkomst bepaalt de
   route: goedgekeurd, te repareren, of slopen voor onderdelen.
5. **Reparatie en onderdelen.** Wat zit erin, wat is stuk, wat ligt er op de
   plank. Onderdelen toewijzen of op de bestellijst zetten.
6. **Parts inkoop.** Bestellijst samenvoegen tot inkooporders per leverancier,
   met factuur en status.
7. **Verkoopklaar.** AI schrijft titel en omschrijving, foto's erbij, en dan de
   overdracht naar Storvo.
8. **Export.** Batches en facturen eruit voor de boekhouding.

---

## Wie doet wat

| Jij | Ik |
|---|---|
| Uitzoeken wat er in de afspraak met de bouwer van de bestaande ERP staat over eigendom | Alles bouwen |
| De Shopify-app aanmaken en het token in Supabase zetten | De koppeling schrijven |
| Bepalen wat de module per maand kost | Het als bijkoop in Stripe zetten |

**Over die eerste:** functionaliteit en werkwijze mag je vrij naboksen, dat is
niet beschermd. Code en schermontwerp letterlijk overnemen mag niet. We bouwen
dit dus vanaf nul in jouw eigen stijl, met het document als beschrijving van wat
het moet doen.

---

## Wat er nog van jou nodig is

Alles hierboven is gebouwd. Drie dingen kan ik niet voor je doen.

### 1. De Shopify-app aanmaken (tien minuten)

De vijf stappen staan hierboven onder fase 2. Daarna zet je zelf drie
instellingen in Supabase, onder Project Settings → Edge Functions → Secrets:

| Naam | Wat erin komt |
|---|---|
| `SHOPIFY_WINKEL` | `mijnwinkel.myshopify.com` |
| `SHOPIFY_TOKEN` | Het token dat begint met `shpat_` |
| `SHOPIFY_WEBHOOK_SECRET` | Zie hieronder |

### 2. De terugkoppeling van Shopify aanzetten

Zodat een verkoop in de webshop het toestel hier uit de voorraad haalt.

1. Shopify-beheer → **Instellingen** → **Meldingen** → **Webhooks**
2. **Webhook maken**
   - Gebeurtenis: **Bestelling aangemaakt**
   - Indeling: **JSON**
   - Adres: `https://ugilfxqolemxwssbpdwu.supabase.co/functions/v1/shopify-webhook`
3. Na het opslaan toont Shopify een **ondertekeningssleutel**. Die zet je in
   Supabase als `SHOPIFY_WEBHOOK_SECRET`.

Zonder die sleutel weigert de functie elk bericht, en terecht: dan kan iedereen
melden dat er iets verkocht is.

### 3. De prijs bepalen

Wat kost de module per maand? Zeg het, dan zet ik hem als tweede regel in
Stripe en wordt hij bij het afrekenen automatisch meegenomen.

---

## Hoe je het nu al kunt proberen

Je proefwinkel heeft de module aanstaan. In de winkelapp staat **Hardware** in
het menu en daaronder **Refurbishen**, dat de werkbank opent.

Een rondje om te zien of het klopt:

1. Refurbishen → **Toevoegen** → typ "HP ZBook", kies uit de lijst, aantal 2
2. **Toevoegen en labels maken** → de labels verschijnen meteen
3. Printen of gewoon bekijken → **Labels zitten erop**
4. Te controleren → klik een apparaat aan → **Specificaties opzoeken** → loop de
   checklist af
5. Kies **Goedgekeurd**, of **Moet gerepareerd** om die kant te zien
6. Bij goedgekeurd: klik hem nog een keer aan, zet er een vraagprijs bij en
   druk op **Naar de winkelvoorraad**
7. Terug naar de winkel → **Hardware** → daar staat hij, met marge en al
