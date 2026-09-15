# Onderzoek: Storvo als app en een iPhone-widget

Datum: 15 september 2026. Vraag van Lucas: kunnen we van Storvo een app maken en een widget op
de iPhone, en hoe slim is dat? De eerlijke waarheid, met een keuze en waarom.

---

## Kort: de waarheid en mijn keuze

- **Storvo een "app" maken: makkelijk, goedkoop en slim → DOEN.** We maken er een **PWA** van.
  Dan zet je Storvo via "Zet op beginscherm" als app-icoon op je iPhone: volledig scherm, geen
  Safari-balk, en pushmeldingen werken. Kost bijna niets, geen App Store, geen jaarlijkse
  Apple-kosten, geen review.
- **Een iPhone-widget: kan NIET met een PWA.** Een echt widget op je beginscherm vereist een
  **native app** (met een stukje Swift-code, WidgetKit). Dat betekent: Apple Developer-account
  (~€99/jaar), Swift-werk, App Store-review en onderhoud van een aparte native build.
- **Mijn advies:** **nu de PWA doen** (snel, gratis, 90% van het app-gevoel). De **widget nog
  niet** — die is de dure, arbeidsintensieve stap en levert voor een eenmanszaak nu weinig extra
  op. Als je later echt een glanceable widget wil (omzet vandaag, open reparaties, nieuwe
  bestellingen), kan dat altijd bovenop de PWA via een native schil. De PWA blokkeert dat niet.

---

## Wat een PWA je nu al geeft op iPhone (2026)

Storvo is al één web-app; met een klein beetje werk (manifest, service worker, icons) wordt het
een installeerbare PWA. Feiten voor iOS in 2026:

- **App-icoon op het beginscherm** via Deel → Zet op beginscherm. Op **iOS 26** opent zo'n icoon
  standaard als app (volledig scherm), niet meer als verwarrend Safari-tabblad.
- **Pushmeldingen** werken sinds iOS 16.4 voor geïnstalleerde PWA's (na toestemming). Handig voor
  bijv. "nieuwe webshopbestelling" of "reparatie klaar".
- **Offline/sneller laden** via caching.

**Beperkingen van een PWA op iOS (eerlijk):**
- **Geen App Store-vindbaarheid.** Installeren is handmatig (Deel → Zet op beginscherm); Apple
  staat geen één-tik-installatieknop toe. We zetten er een korte uitleg bij.
- **Geen home-screen widgets.** (Dit is de kern van je vraag — zie hieronder.)
- Geen achtergrond-sync, geen Bluetooth/NFC. Voor Storvo nauwelijks relevant.

Kortom: een PWA geeft je het app-gevoel (icoon, volledig scherm, meldingen) voor bijna niets.

---

## De widget: waarom dat een native app vereist

Onderzocht en bevestigd: **een pure PWA kan geen iOS-widget leveren.** Widgets op het
beginscherm draaien op **WidgetKit** en moeten in **SwiftUI (native code)** gebouwd worden, in
een app-extensie. Er is geen web-truc die dit omzeilt.

Om tóch een widget te krijgen:
1. Storvo in een **native schil** verpakken met **Capacitor** (de web-app draait dan in een
   native iOS-app).
2. Een **SwiftUI-widget** bouwen (WidgetKit + AppIntent), met een App Group om data te delen
   tussen de app en de widget. Data haal je uit Supabase.
3. Publiceren via de App Store: **Apple Developer-account ~€99/jaar**, review, en onderhoud van
   die native build bij elke wijziging.

Er bestaan kant-en-klare Capacitor-plugins (`@capgo/capacitor-widget-kit`,
`capacitor-widget-bridge`) die de brug leggen, maar **de widget zelf schrijf je nog steeds in
Swift**. De plugin maakt de widget-UI niet voor je.

---

## Is de widget slim? (de afweging)

**Voor een eenmanszaak nu: nee, nog niet.** Redenen:
- **Kosten en onderhoud:** je gaat van "één HTML-bestand dat binnen een minuut live staat" naar
  ook een **native app onderhouden** (Xcode, Swift, App Store-review bij elke update). Dat is een
  wezenlijk zwaardere manier van werken, voor jou als solo-bouwer.
- **De winst is klein t.o.v. de kosten:** een widget toont een paar cijfers in één oogopslag.
  Datzelfde kan een pushmelding of het openen van de PWA ook, bijna gratis.

**Wanneer wordt de widget wél slim?** Als je merkt dat je écht elke dag even wil kijken naar
bijvoorbeeld: omzet vandaag, aantal open reparaties, nieuwe webshopbestellingen — zonder de app
te openen. Dan is een kleine widget die precies dát toont een mooie toevoeging. Maar dat is een
"later, als de rest staat"-project, geen eerste stap.

---

## Stappen als je akkoord bent

**Nu (klein, hoge waarde):**
1. Storvo een PWA maken: `manifest.webmanifest` (naam, icons, standalone), een lichte
   service worker (offline/cache), en app-icons. Eén keer bouwen; werkt op iPhone én Android.
2. Een korte "Zet Storvo op je beginscherm"-uitleg in de app.
3. (Optioneel) pushmeldingen aanzetten voor bijv. nieuwe bestelling / reparatie klaar.

**Later, alleen als je de widget echt wil:**
4. Capacitor-schil om de web-app.
5. Eén kleine SwiftUI-widget (omzet / open reparaties / bestellingen) met data uit Supabase.
6. App Store-account + publicatie + onderhoud.

**Mijn advies blijft:** doe stap 1–3 nu, en beslis over de widget pas als je hem echt mist.

---

## Bronnen
- [PWA op iOS: de complete gids 2026 (MobiLoud)](https://www.mobiloud.com/blog/progressive-web-apps-ios/)
- [Wat PWA's wel/niet kunnen op iOS 2026 (OJapp)](https://tips.ojapp.app/en/pwa-ios-2026-complete-guide/) · [PWA iOS-limieten (MagicBell)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Kan een PWA een iOS-widget hebben? (Medium, kisimedia)](https://medium.com/@kisimedia/how-to-add-widgets-to-your-capacitor-app-ios-android-76fefbea5cb8)
- [Capacitor WidgetKit-plugin (Capgo)](https://capgo.app/docs/plugins/widget-kit/) · [capacitor-widget-bridge (GitHub)](https://github.com/kisimediade/capacitor-widget-bridge)
- [Web-app verder brengen met Capacitor (Ionic)](https://ionic.io/blog/take-your-web-app-further-with-capacitor)
