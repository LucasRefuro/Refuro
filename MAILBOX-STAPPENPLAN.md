# info@storvo.nl werkend krijgen

Je kunt nu wel mail versturen vanaf storvo.app, maar er komt nog niets binnen op
storvo.nl. Dit stappenplan regelt het ontvangen.
Je doet dit bij Hostinger.

Tijd: ongeveer twintig minuten, plus wachten op de DNS.

---

## Wat er nu al werkt

| Onderdeel | Status |
|---|---|
| Uitgaande mail via Resend (wachtwoord vergeten, klantberichten, proefaanvragen) | Werkt |
| Inkomende mail op info@storvo.nl | Nog niet |

Handig detail: Storvo verstuurt via **storvo.app** en ontvangt straks op
**storvo.nl**. Dat zijn twee losse domeinen, dus de records botsen nergens.
Je hoeft aan storvo.app helemaal niets te veranderen en je loopt geen risico
de instellingen van Resend om zeep te helpen.

---

## Onderdeel 1 — Kijk wat je al hebt

1. Log in op **hpanel.hostinger.com**.
2. Klik bovenin op **E-mails**.
3. Kijk of `storvo.nl` in de lijst staat.

Wat je ziet bepaalt wat je doet:

- **Staat er een mailbox bij storvo.nl** → ga door naar Onderdeel 3.
- **Staat er niets, of alleen "Gratis e-mail"** → ga door naar Onderdeel 2.

---

## Onderdeel 2 — E-mail activeren

1. Klik bij **E-mails** op **E-mail beheren** of **E-maildienst kiezen**.
2. Kies je domein `storvo.nl`.
3. Kies een pakket:
   - **Gratis e-mail** (zit soms bij je hosting): één mailbox, genoeg om te beginnen.
   - **Zakelijke e-mail**: rond de één euro per mailbox per maand, meer opslag.
4. Reken af als dat nodig is.
5. Hostinger vraagt of hij de MX-records automatisch mag instellen. **Zeg ja.**

> Zegt Hostinger dat je domein bij een andere partij staat? Dat klopt niet:
> je domeinen staan bij Hostinger, alleen de website draait op Vercel. Je hoeft
> daar niets aan te veranderen.

---

## Onderdeel 3 — De mailbox aanmaken

1. Klik op **Mailbox aanmaken** of **Account toevoegen**.
2. Naam: `info`
3. Domein: `storvo.nl`
4. Kies een wachtwoord en bewaar het in je wachtwoordbeheerder.
5. Klik op **Aanmaken**.

**Gelukt als:** `info@storvo.nl` in de lijst staat.

---

## Onderdeel 4 — Controleren dat het werkt

Wachten tot de DNS is doorgevoerd duurt meestal een kwartier, soms een paar uur.

1. Ga naar **mail.hostinger.com** en log in met info@storvo.nl.
2. Stuur vanaf je privémail een berichtje naar info@storvo.nl.
3. Kijk of hij binnenkomt.

Komt hij niet aan, wacht dan een paar uur en probeer opnieuw. Blijft het stil,
kijk dan bij Hostinger onder **Domeinen → DNS** of er MX-records voor
storvo.nl staan die naar Hostinger wijzen.

---

## Onderdeel 5 — Op je telefoon en laptop zetten

Zo hoef je niet elke keer naar de webmail.

**Op je iPhone:** Instellingen → Apps → Mail → Accounts → Nieuwe account →
Anders → Mail-account toevoegen. Vul in:

| Veld | Waarde |
|---|---|
| E-mail | info@storvo.nl |
| Wachtwoord | wat je bij Onderdeel 3 koos |
| Inkomende server | imap.hostinger.com, poort 993, SSL |
| Uitgaande server | smtp.hostinger.com, poort 465, SSL |

**Op je Mac:** Mail → Account toevoegen → Andere Mail-account, met dezelfde gegevens.

---

## Onderdeel 6 — De laatste controle

Storvo verstuurt mail vanaf `welkom@storvo.app` via Resend, maar antwoorden
komen binnen op `info@storvo.nl`. Dat is precies de bedoeling: klanten zien
één adres om op te reageren.

1. Vraag op storvo.app/proberen een proefperiode aan met je eigen gegevens.
2. Er hoort een mail binnen te komen op **info@storvo.nl** met de aanvraag.
3. Klik in die mail op Beantwoorden: het antwoord gaat naar de aanvrager.

**Gelukt als:** die aanvraagmail binnenkomt en beantwoorden werkt.

---

## Als je later meer adressen wilt

Handig om te weten, geen haast:

- `support@storvo.nl` voor storingen
- `facturen@storvo.nl` voor de boekhouding

Bij Hostinger maak je die aan op dezelfde manier, of je zet ze als alias door
naar info@ zodat je maar één postvak hoeft te lezen.
