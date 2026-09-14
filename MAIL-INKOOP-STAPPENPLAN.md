# Facturen automatisch uit de mail in Storvo

Doel: facturen die je ontvangt komen vanzelf als **inkoop** in Storvo terecht, uitgelezen
en al ingevuld (bedrag, btw, leverancier, datum, factuurnummer). Jij bevestigt alleen nog
het **soort** (voorraad of kosten) en of het klopt. Zo hoef je niets te typen en blijven
je btw, investering en winst kloppen.

Hangt samen met de Inkopen-registratie (`state.inkopen`, met `soort` voorraad/kosten), het
fiscaal blok op het Rapport, en de Moneybird-koppeling. Zie ook `MAILBOX-STAPPENPLAN.md`
(info@storvo.nl staat al: Hostinger, inkomende mail werkt).

---

## De aanpak: in drie fasen

We bouwen van "meest waarde, meteen testbaar" naar "volledig automatisch". Elke fase is op
zichzelf bruikbaar.

### Fase 1 — Factuur uitlezen bij het uploaden (de kern)

- Je uploadt in Storvo een factuur (PDF of foto) bij een inkoop.
- Een **AI-factuurlezer** (Edge Function `factuur-lezen`) leest bedrag incl. btw, btw%,
  leverancier, datum en factuurnummer eruit en **vult het inkoop-formulier automatisch in**.
- Jij controleert, kiest het **soort** (voorraad/kosten) en slaat op.
- Nodig: een AI-sleutel als geheim (`ANTHROPIC_API_KEY`). Kosten: een paar cent per factuur.

### Fase 2 — Concept-inkopen en bevestigen

- Automatisch opgehaalde facturen komen als **concept-inkoop** in een lijstje "te
  bevestigen" te staan, niet meteen in je cijfers.
- Jij loopt ze na, zet het soort en bevestigt (of gooit weg). Pas dan tellen ze mee.
- **Dubbele voorkomen:** elke inkoop krijgt een herkenning (mail-message-id, of
  leverancier + factuurnummer + bedrag). Bestaat 'ie al, dan slaan we 'm over.

### Fase 3 — De mailbox dagelijks lezen

- Een **dagelijkse taak** leest de mailbox (bijv. een apart `facturen@storvo.nl`, of
  info@storvo.nl gefilterd op bijlagen), pakt de PDF-bijlagen en stuurt ze door Fase 1/2.
- Zo verschijnen nieuwe facturen elke dag vanzelf als concept-inkoop.
- Technisch: IMAP naar Hostinger (`imap.hostinger.com`) vanuit een geplande Edge Function,
  óf een aparte inbox die naar een webhook doorstuurt. Draait ongeveer één keer per dag.

---

## Wat jij levert (per fase)

- **Fase 1:** een **AI-sleutel** (maak er een aan op console.anthropic.com) → ik zet 'm als
  geheim `ANTHROPIC_API_KEY` in Supabase. Meer niet.
- **Fase 3:** een **mailbox voor facturen**. Aanbevolen: een apart adres
  `facturen@storvo.nl` (in Hostinger) waar jij je facturen naartoe stuurt of laat
  doorsturen; dan is elke mail een factuur en blijft je gewone inbox met rust. Ik heb dan
  het IMAP-wachtwoord van dat adres nodig (als geheim in Supabase), niet in de chat.

---

## Wat ik bouw

- **Edge Function `factuur-lezen`** (Fase 1): krijgt een factuur (PDF/foto als base64),
  stuurt die naar de AI met de vraag om bedrag incl. btw, btw%, leverancier, datum en
  factuurnummer terug te geven als nette JSON, en geeft dat terug aan Storvo.
- **In Storvo** (Fase 1): op de Inkopen-pagina een knop **"Factuur uitlezen"** die het
  formulier automatisch invult. Jij kiest het soort en slaat op.
- **Concept-inkopen** (Fase 2): een `concept: true`-vlag op inkopen + een blokje "te
  bevestigen"; dedup-herkenning per inkoop.
- **Dagelijkse mailtaak** (Fase 3): geplande Edge Function die de mailbox leest en de
  bijlagen door Fase 1/2 haalt.

---

## Slim en zuiver houden

- **Soort bepaalt de verrekening.** Voorraad-inkopen (hoesjes, onderdelen, partijen
  laptops) verlagen de winst pas bij verkoop; kosten-inkopen meteen. De AI raadt het soort
  niet — dat bevestig jij, zodat je omzet/winst nooit dubbel geraakt wordt.
- **Dubbele inkopen** worden op herkenning geweerd (mail-id / factuurnummer + bedrag). Ook
  wat je zelf al hebt ingevoerd of naar Moneybird stuurde telt niet nog een keer.
- **Alles blijft een indicatie tot jij bevestigt.** Geen automatische boeking in je cijfers
  zonder jouw akkoord.
