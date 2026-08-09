# info@storvo.nl werkend krijgen

**Afgerond.** Dit stappenplan is uitgevoerd en hoeft niet meer gedaan te worden.
Het blijft staan als naslag, voor als je later nog een adres bijzet.

## Wat er staat (gecontroleerd op 9 augustus 2026)

| Onderdeel | Status |
|---|---|
| Uitgaande mail via Resend (wachtwoord vergeten, klantberichten, proefaanvragen) | Werkt |
| Inkomende mail op info@storvo.nl | Werkt |
| MX naar mx1/mx2.hostinger.com | Staat |
| SPF `v=spf1 include:_spf.mail.hostinger.com ~all` | Staat |
| DMARC `p=none` met rapportage naar info@storvo.nl | Staat |
| DKIM-sleutels a, b en c | Staan |
| Feedback uit de app komt binnen op info@storvo.nl | Werkt |

Let op bij het zelf natrekken: publieke resolvers onthouden ook een *negatief*
antwoord. Vraag je een record op vlak nadat het is toegevoegd, dan kan het lijken
of het er niet is. Met `cd=1` bij dns.google omzeil je die cache.

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

## Onderdeel 2 — De DNS-records toevoegen in Vercel

Belangrijk om te snappen: de nameservers van storvo.nl wijzen naar **Vercel**,
niet naar Hostinger. Hostinger laat je wel netjes zien wat er moet gebeuren,
maar hij beheert die DNS niet. Wat je daar invult heeft geen effect.

Ga dus naar **vercel.com** → je project → **Settings** → **Domains** → klik op
`storvo.nl` → **DNS Records**.

Vul bij Name alleen het linkerdeel in, zonder `.storvo.nl` erachter. Vercel
plakt je domeinnaam er zelf aan vast. Waar hieronder *(leeg)* staat, laat je
het veld leeg; dat is het hoofddomein.

### Post ontvangen

| Type | Name | Value | Priority |
|---|---|---|---|
| MX | *(leeg)* | `mx1.hostinger.com` | 5 |
| MX | *(leeg)* | `mx2.hostinger.com` | 10 |

### Voorkomen dat anderen namens jou mailen

| Type | Name | Value |
|---|---|---|
| TXT | *(leeg)* | `v=spf1 include:_spf.mail.hostinger.com ~all` |

### Uit de spamfolder blijven

Hostinger ondertekent elke uitgaande mail met een sleutel. De publieke helft
daarvan zet je hier neer, zodat Gmail en Outlook die handtekening kunnen
controleren.

| Type | Name | Value |
|---|---|---|
| CNAME | `hostingermail-a._domainkey` | `hostingermail-a.dkim.mail.hostinger.com` |
| CNAME | `hostingermail-b._domainkey` | `hostingermail-b.dkim.mail.hostinger.com` |
| CNAME | `hostingermail-c._domainkey` | `hostingermail-c.dkim.mail.hostinger.com` |

Er zijn er drie omdat Hostinger tussen die sleutels wisselt. Staan ze niet
alle drie in je DNS, dan gaat het na zo'n wisseling stil mis.

### Bewijzen dat je mail echt van jou is

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:info@storvo.nl` |

`p=none` betekent: alleen meekijken, nog niets blokkeren. Verstandig zolang je
zowel via Hostinger als via Resend verstuurt.

Klik daarna in Hostinger op **Controleer de status**. Reken op een kwartier tot
een paar uur voordat alle bolletjes groen worden.

---

## Onderdeel 2b — E-mail activeren bij Hostinger

Heb je nog geen e-maildienst op storvo.nl:

1. Klik bij **E-mails** op **E-mail beheren** of **E-maildienst kiezen**.
2. Kies je domein `storvo.nl`.
3. Kies een pakket:
   - **Gratis e-mail** (zit soms bij je hosting): één mailbox, genoeg om te beginnen.
   - **Zakelijke e-mail**: rond de één euro per mailbox per maand, meer opslag.
4. Reken af als dat nodig is.

Biedt Hostinger aan de records automatisch te zetten, dan kan hij dat niet
waarmaken zolang de DNS bij Vercel ligt. Doe het handmatig zoals hierboven.

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
kijk dan in **Vercel** onder DNS Records of de twee MX-regels er echt staan.
Je kunt het ook zelf nakijken via dnschecker.org: vul `storvo.nl` in en kies
type MX. Zie je daar `mx1.hostinger.com` staan, dan is de DNS in orde en ligt
het aan de mailbox zelf.

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
