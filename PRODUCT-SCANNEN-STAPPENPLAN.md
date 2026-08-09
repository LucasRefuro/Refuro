# Producten scannen aanzetten

Het scannen zelf werkt al. Alleen het lezen van het doosje moet nog aangezet
worden, want daar hoort een sleutel bij.

Tijd: ongeveer tien minuten. Eén onderdeel.

---

## Wat er al klaarstaat

| Onderdeel | Status |
|---|---|
| Knop **Nieuw product toevoegen** op de Productenpagina | Werkt |
| QR-code om je telefoon te koppelen | Werkt |
| Streepjescode scannen met de camera | Werkt |
| Foto van het doosje laten lezen | Nog aanzetten |

---

## Onderdeel 1 — De sleutel aanmaken en opbergen

1. Ga naar **console.anthropic.com** en log in of maak een account.
2. Klik linksonder op je naam → **Billing** → zet er een tegoed op.
   Vijf euro is genoeg voor duizenden foto's.
3. Klik in het linkermenu op **API keys**.
4. Klik op **Create key**. Naam: `Storvo`.
5. Er verschijnt een lange sliert die begint met `sk-ant-`. Klik op **Copy**.

> Plak die sliert nergens in een chat, ook niet bij mij. Hij gaat rechtstreeks
> naar Supabase.

6. Ga naar **supabase.com** en open je project.
7. Klik linksonder op **Project Settings** (tandwiel).
8. Klik in het linkermenu op **Edge Functions**.
9. Bij **Secrets**, klik op **Add new secret**.
10. Naam: `ANTHROPIC_API_KEY` — Waarde: plak de sliert.
11. Klik op **Save**.

Let goed op de spelling van de naam. Eén tikfout en het werkt niet.

**Gelukt als:** `ANTHROPIC_API_KEY` staat in de lijst met secrets.

---

## Testen

1. Open **storvo.app/app/** op je computer en log in.
2. Ga naar **Producten** en klik rechtsboven op **Nieuw product toevoegen**.
3. Klik op **Scannen met je telefoon**. Er verschijnt een QR-code.
4. Richt de camera van je telefoon op die code en tik op de melding.
   Je hoeft niets te installeren.
5. Je telefoon zegt nu **Maak een foto van het doosje**. Pak een willekeurig
   hoesje of doosje uit de winkel en maak een foto van de voorkant.
6. Na een paar tellen staat er op je telefoon wat Storvo herkend heeft, en
   springt hij door naar de streepjescode.
7. Scan de streepjescode.
8. Kijk op je computer: naam, categorie en prijzen staan ingevuld.
9. Vul aan wat nog mist en klik op **Product toevoegen**.

**Gelukt als:** het product in de lijst staat en je onderweg vrijwel niets
hebt hoeven typen.

---

## Wat je moet weten

**Waar de prijzen vandaan komen.** Storvo verzint geen prijzen. Hij zoekt in
je eigen producten naar wat er het meest op lijkt en neemt daar de inkoop- en
verkoopprijs van over. Boven het formulier staat precies van welk product dat
was. Heeft de winkel nog niets vergelijkbaars, dan valt hij terug op de
standaardprijs van de categorie, en bij een accessoire desnoods op een
schatting. Dat staat er dan ook bij, zodat je weet dat je moet kijken.

**De foto's worden niet bewaard.** Ze gaan er doorheen en verdwijnen. Er komt
alleen tekst terug.

**Wat het kost.** Ongeveer een halve cent per foto. Duizend producten
inscannen kost dus rond de vijf euro.

**Zonder computer.** Open je Storvo op je telefoon, dan hoef je niets te
koppelen. Dan zegt de knop **Camera openen** en doe je alles op één apparaat.

**De koppelcode.** Elke keer als je op **Scannen met je telefoon** klikt maakt
Storvo een nieuwe code van tien tekens. Over die verbinding gaan alleen de
foto en de streepjescode, geen klant- of omzetgegevens.

---

## Als het niet werkt

| Wat je ziet | Wat er aan de hand is |
|---|---|
| "De herkenning is nog niet ingesteld" | De sleutel staat nog niet in Supabase, of de naam is verkeerd gespeld. |
| "Geen verbinding met de computer" op je telefoon | Het scherm met de QR-code is dichtgegaan. Vernieuw de pagina en scan opnieuw. |
| De camera start niet | Sta de camera toe in je browser. Op een iPhone moet je Safari of Chrome gebruiken, niet een browser binnen een andere app. |
| "Even te druk" | Te veel foto's achter elkaar. Wacht een halve minuut. |

Lukt het scannen van de streepjescode niet, dan kun je hem altijd intypen.
Dat veld staat er op beide schermen onder.
