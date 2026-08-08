# WhatsApp-sjablonen voor Meta

Dien deze zes sjablonen in via **WhatsApp Manager → Accounttools → Berichtsjablonen → Sjabloon maken**.

Voor alle zes geldt hetzelfde:

- **Categorie:** Utility (Hulpprogramma)
- **Taal:** Nederlands (`nl`)
- **Koptekst:** geen
- **Voettekst:** `Verstuurd via Storvo`
- **Knoppen:** geen

De variabelen staan bij alle zes in dezelfde volgorde. Wijzig die volgorde niet,
anders komt er onzin bij de klant terecht.

| Variabele | Betekenis | Voorbeeld |
|---|---|---|
| `{{1}}` | voornaam van de klant | Sara |
| `{{2}}` | naam van de winkel | Refuro |
| `{{3}}` | het toestel | iPhone 14 |
| `{{4}}` | reparatienummer | R26-001 |
| `{{5}}` | link naar de statuspagina | https://storvo.app/r/refuro/R26001 |

---

## 1. `storvo_aangemeld`

```
Beste {{1}}, {{2}} heeft je {{3}} in ontvangst genomen.

Reparatienummer: {{4}}
Volg de status: {{5}}

Je hoort van ons zodra er nieuws is.
```

Voorbeeldwaarden voor Meta: `Sara` · `Refuro` · `iPhone 14` · `R26-001` · `https://storvo.app/r/refuro/R26001`

---

## 2. `storvo_inleveren`

```
Beste {{1}}, je reparatie staat klaar in het systeem van {{2}}.

Breng je {{3}} langs in de winkel, dan gaan we er meteen mee aan de slag.
Reparatienummer: {{4}}
Meer informatie: {{5}}

Tot snel.
```

---

## 3. `storvo_besteld`

```
Beste {{1}}, {{2}} heeft de onderdelen voor je {{3}} besteld.

Reparatienummer: {{4}}
Volg de status: {{5}}

Zodra ze binnen zijn plannen we de reparatie in.
```

---

## 4. `storvo_binnen`

```
Beste {{1}}, goed nieuws: de onderdelen voor je {{3}} zijn binnen bij {{2}}.

Reparatienummer: {{4}}
Volg de status: {{5}}

We plannen de reparatie zo snel mogelijk in.
```

---

## 5. `storvo_bezig`

```
Beste {{1}}, {{2}} is begonnen aan de reparatie van je {{3}}.

Reparatienummer: {{4}}
Volg de status: {{5}}

Je hoort van ons zodra het toestel klaar is.
```

---

## 6. `storvo_klaar`

```
Beste {{1}}, je {{3}} is klaar en kan opgehaald worden bij {{2}}.

Reparatienummer: {{4}}
Bekijk de details: {{5}}

Tot ziens in de winkel.
```

---

## Waarom deze opzet

Meta keurt sjablonen af die alleen uit variabelen bestaan, of die met een
variabele beginnen of eindigen. Daarom begint elk bericht met "Beste" en sluit het
af met een vaste zin. De categorie Utility is de juiste: het gaat om een
transactie die de klant zelf in gang heeft gezet, niet om reclame.

Goedkeuring duurt meestal een paar minuten tot een paar uur.
