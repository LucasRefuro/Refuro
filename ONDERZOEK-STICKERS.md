# Onderzoek: een waterdicht sticker- en labelsysteem

Datum: 15 september 2026. Vraag van Lucas: de stickers "werken voor geen meter", er moet een
systeem komen dat **100% werkt zonder teveel gedoe**. Meerdere opties onderzocht, mét een keuze
en waarom.

---

## Kort: mijn keuze

**Koop een thermische labelprinter en laat Storvo de labels stilletjes printen via een
print-agent (PrintNode), niet meer via de browser-printknop.**

- **Printer:** een direct-thermische labelprinter die met standaard (niet-merkgebonden) labels
  werkt. Eerste keus **Zebra ZD230** (elke sticker past, spreekt ZPL = nooit schaalgedoe).
  Prima alternatief **Brother QL-820NWB** (wifi + AirPrint, fijn voor kleine productstickers).
- **Voor PostNL-pakketlabels (10×15 cm):** een goedkope 4×6-thermische printer (Munbyn/Rollo)
  of dezelfde Zebra met een 4×6-rol.
- **De koppeling:** **PrintNode**. Storvo stuurt het label naar PrintNode, en een klein
  programmaatje op de winkel-pc/Mac print het **direct, op exact formaat, zonder dialoog** —
  ook vanaf je tablet of telefoon. Gratis tot 50 labels/maand, daarna ~€9/maand.

**Wat je NIET meer doet:** printen met de browserknop (`window.print()`). Dat is precies de
oorzaak van "werkt voor geen meter".

---

## Waarom het nu niet werkt

Storvo print nu labels en prijskaartjes met **`window.print()`**: er opent een browservenster en
jij kiest printer + instellingen. Dat gaat mis omdat:

- **De browser en de printerdriver herschalen de pagina.** Staat de dialoog op "Passend maken"
  of 110%, dan komt het label te groot, te klein of half afgesneden uit. Dit is een bekend en
  veelvoorkomend probleem bij thermische labels.
- **Marges en kop-/voetteksten** van de browser komen mee.
- **Je moet elke keer** de juiste printer en instellingen kiezen. Eén verkeerde klik = mislukt
  label.

Kortom: de browser is geen betrouwbare labelprinter-aansturing. Dat los je niet op met "beter je
best doen in de dialoog", je moet de dialoog **eruit halen**.

---

## De opties (en waarom wel/niet)

### A. Browser-print behouden, maar netjes instellen  — *lapmiddel*
Thermische printer kopen, de driver één keer goed zetten (labelformaat, 100%, geen marges), en
Storvo een pagina op exact labelformaat laten maken. Beter, maar de dialoog en het schaalrisico
blijven. **Niet 100% waterdicht.** Alleen als je echt geen agent wil.

### B. PrintNode (print-agent in de cloud)  — **AANRADER**
Een klein programma (de PrintNode-client) draait op je winkel-pc/Mac en verbindt je printer met
je PrintNode-account. Storvo stuurt het label via een simpele API naar PrintNode; het print
**stil, op exact formaat, geen dialoog**, vanaf elk apparaat (ook je telefoon/tablet aan de
balie).
- **Voordelen:** geen dialoog, geen schaalgedoe, werkt vanaf elk apparaat, makkelijk in te
  bouwen, ondersteunt PDF én ZPL (Zebra) én bon-printers.
- **Nadelen:** kleine maandprijs boven de gratis 50 labels (~€9/mnd), en er moet een pc/Mac aan
  de balie aanstaan met de client. (Die staat er meestal toch.)

### C. QZ Tray (gratis, lokaal)  — *budget-alternatief*
Gratis, open-source programma op de winkel-pc; Storvo print er stil naartoe.
- **Voordelen:** geen abonnement, ook stil en op exact formaat.
- **Nadelen:** installeren + een certificaat instellen is technischer, en het werkt alleen vanaf
  de browser op díe pc (niet zomaar vanaf je telefoon). Meer "gedoe" bij de start.

### D. Merk-SDK's (DYMO Connect, Brother b-PAC, Zebra Browser Print)  — *merkafhankelijk*
Elk merk heeft een eigen manier voor stil printen. Werkt, maar bindt je aan één merk en je hebt
alsnog een lokaal onderdeel nodig. Voegt niets toe boven PrintNode/QZ.

---

## De hardware: "reken op de labels, niet op de printer"

De printer is eenmalig; de **labelrollen koop je voor altijd**. Daar zit het echte verschil.

- **DYMO LabelWriter 550-serie: NIET DOEN.** Die leest een RFID-chip in de rol en **weigert
  niet-DYMO labels**. Je zit vast aan dure merklabels. Dealbreaker.
- **Brother QL-820NWB:** wifi + AirPrint, fijn voor kleine product-/prijsstickers. Gebruikt
  Brother DK-rollen (er zijn goedkopere derde-partij-rollen). Soms klachten over de
  wifi-verbinding.
- **Zebra ZD230 / ZD220:** **elke** sticker (elk merk, elk formaat) mag, spreekt ZPL — dan is er
  **nooit** schaaldiscussie. Iets zakelijker/duurder, maar het meest flexibel en betrouwbaar.
- **PostNL-pakketlabels (10×15):** een goedkope 4×6 direct-thermische printer (Munbyn/Rollo) is
  standaard en prima, of dezelfde Zebra met een 4×6-rol.

**Mijn hardware-keuze:** Zebra ZD230 als je één printer wil die álles goed doet en waar je
overal goedkope labels voor koopt. Wil je vooral kleine productstickers en zo min mogelijk
nadenken: Brother QL-820NWB. Voor pakketten erbij: een losse 4×6 thermische printer of de Zebra
met 4×6-rol.

---

## Wat ik in Storvo bouw als je akkoord bent

1. **Edge Function `label-print`**: maakt het label (voor Zebra als ZPL = altijd scherp en op
   maat; anders een PDF op exact labelformaat) en stuurt het naar PrintNode.
2. **Knop "Print label"** overal waar nu "Prijskaartje printen" staat (en bij PostNL-verzending):
   één klik, het label komt eruit. Geen dialoog.
3. **Instellingen → Printers:** je PrintNode-sleutel en welke printer welk formaat is, één keer
   invullen. Daarna werkt het overal, ook vanaf je telefoon aan de balie.
4. Het oude browser-printen laten we als noodknop staan, maar het is niet meer de standaard.

**Wat jij levert:** de printer(s), en een PrintNode-account (gratis starten). De client
installeren op de balie-pc doe ik met je mee.

---

## Bronnen
- [QZ Tray](https://qz.io/)
- [PrintNode pricing (SaaSWorthy)](https://www.saasworthy.com/product/printnode/pricing) · [Printus: PrintNode pricing](https://printus.cloud/docs/printnode-pricing/)
- [PrintNode vs QZ Tray (SaaSHub)](https://www.saashub.com/compare-printnode-vs-qz-tray)
- [Brother QL-820NWB (CDW)](https://www.cdw.com/product/brother-ql-820nwb-label-printer-b-w-direct-thermal/4432484) · [DYMO vs Brother (Label King)](https://www.labelking.co.uk/dymo-vs-brother.html)
- [Beste labelprinter kleine winkel 2025 (Niimbot)](https://niimbots.com/blogs/news/2025-some-useful-small-business-label-printer)
- [4×6 label print settings / schaalprobleem (LabelChop)](https://labelchop.com/blog/4x6-shipping-labels-print-settings) · [Label te klein oplossen (Whizz-Tech)](https://whizz-tech.com/support/printers/4x6-label-too-small/)
