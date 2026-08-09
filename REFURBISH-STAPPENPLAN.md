# Refurbish als bijkoopmodule

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
| Inkoopbatch en leverancier | Verkoopbare voorraad |
| Registratie en specificaties | Verkoopprijs en marge |
| QR-labels printen | Kassa en bon |
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

1. **Inkoop en registratie.** Batch met leverancier, batchnummer, inkoopprijs en
   factuur. Apparaten eraan hangen. Specificaties automatisch ophalen, met de
   mogelijkheid om ze zelf aan te vullen. Wat je invult wordt onthouden voor het
   volgende apparaat van hetzelfde model.
2. **Labels.** QR-codes voor een hele batch in één keer, klaar om te printen.
   Daarna de vraag of alle labels erop zitten, en pas dan door.
3. **Checklists.** Per categorie een basislijst, per model extra punten, en
   vragen die meebewegen met de specificaties: staat er een touchscreen in, dan
   komt de vraag over het touchscreen erbij.
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

## Volgorde

Eerst Storvo echt live met WhatsApp en de eerste betalende winkel. Daarna fase 0
en 1, want die staan los van alles en leveren meteen waarde. Dan Shopify, en
als laatste de refurbish-app zelf.
