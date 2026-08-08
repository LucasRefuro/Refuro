/* ═══════════════ STORVO · VERTALING ═══════════════
   De software is in het Nederlands geschreven. Dit bestand zet hem om naar
   het Engels zodra dat nodig is.

   Hoe het werkt: elke tekst die de winkel ziet staat hieronder met zijn
   Engelse tegenhanger. Een wandelaar loopt de pagina door en vervangt wat
   hij herkent. Schermen die later worden opgebouwd, zoals meldingen en
   vensters, gaan automatisch mee dankzij een waarnemer.

   Alleen exacte treffers worden vervangen. Namen van winkels, producten en
   klanten staan niet in de lijst en blijven dus altijd ongemoeid.

   Taal volgt het webadres: storvo.nl is Nederlands, storvo.app is Engels.
   De keuze van de gebruiker gaat daar altijd voor.
   ═══════════════════════════════════════════════════ */

(function(){
'use strict';

const WOORDEN = {

/* ---------- menu en algemene woorden ---------- */
'Dashboard':'Dashboard', 'Vandaag':'Today', 'Scannen':'Scan', 'Voorraad':'Stock',
'Reparaties':'Repairs', 'Reparatie':'Repair', 'Diensten':'Services', 'Verkopen':'Sales',
'Bestellingen':'Orders', 'Producten':'Products', 'Team':'Team', 'Teams':'Teams',
'Instellingen':'Settings', 'Overzicht':'Overview', 'Prestaties':'Performance',
'Alles':'All', 'Alles geregeld':'All sorted', 'Alles geregeld.':'All sorted.',
'Storvo':'Storvo', 'storvo':'storvo', 'Winkel Stock':'Shop Stock',
'Storvo Winkel Stock':'Storvo Shop Stock',

'Naam':'Name', 'Naam *':'Name *', 'Rol':'Role', 'Rollen:':'Roles:', 'Status':'Status',
'Prijs':'Price', 'Prijs:':'Price:', 'Omzet':'Revenue', 'Winst':'Profit', 'Marge':'Margin',
'Kosten':'Cost', 'Inkoop':'Purchase', 'Verkoop':'Sale', 'Stuks':'Units', 'Nr':'No',
'Model':'Model', 'Modellen':'Models', 'Toestel':'Device', 'Klant':'Customer',
'Categorie':'Category', 'Categorieën':'Categories', 'Onderdeel':'Part', 'Onderdelen':'Parts',
'Barcode':'Barcode', 'Bedrijf':'Company', 'Adres':'Address', 'Logo':'Logo',
'Pin':'Card', 'Pincode':'PIN', 'Actief':'Active', 'Nee':'No', 'geen':'none',
'Details':'Details', 'Bericht':'Message', 'Berichten':'Messages', 'Besteld':'Ordered',
'Besteld:':'Ordered:', 'Binnen':'Arrived', 'Terug':'Back', 'Voortgang':'Progress',
'Updates':'Updates', 'Vragen?':'Questions?', 'Welkom':'Welcome', 'Wissen':'Clear',
'Sluiten':'Close', 'Bewerken':'Edit', 'Verbergen':'Hide', 'Bevestigen':'Confirm',
'Verwijderen':'Delete', 'Toevoegen':'Add', 'Leegmaken':'Empty', 'Kopiëren':'Copy',
'Overslaan':'Skip', 'Inrichten':'Set up', 'Aan de slag':'Get started',
'Min.':'Min.', 'Std. min.':'Def. min.', 'Std. inkoop':'Def. purchase',
'Std. verkoop':'Def. sale', 'Std. bestelaantal':'Def. order quantity',
'ex. btw':'excl. VAT', '(ex. btw)':'(excl. VAT)', 'ex. btw (+21%)':'excl. VAT (+21%)',
'(inclusief inkoopprijs)':'(including purchase price)', '7 dagen':'7 days', '30 dagen':'30 days',
'Versie 1.0':'Version 1.0', 'Bezig met laden…':'Loading…', 'Laden…':'Loading…',

/* ---------- rollen ---------- */
'Eigenaar':'Owner', 'Beheerder':'Manager', 'Medewerker':'Employee', 'Medewerkers':'Employees',
'(jij)':'(you)',
'ziet en doet alles (incl. omzet, instellingen en team).':
  'sees and does everything, including revenue, settings and the team.',
'ziet alles behalve het team- en huisstijlbeheer.':
  'sees everything except team management and branding.',
'kan scannen, verkopen en reparaties doen, maar ziet geen omzetcijfers of instellingen.':
  'can scan, sell and handle repairs, but sees no revenue figures or settings.',

/* ---------- dashboard ---------- */
'Omzet & winst':'Revenue & profit', 'Onderdelen en winst':'Parts and profit',
'Winst per categorie':'Profit by category', 'Per uur':'Per hour',
'Vorige dag':'Previous day', 'Volgende dag':'Next day', 'Vorige week':'Last week',
'Zelfde weekdag':'Same weekday', 'vorige week tonen':'show last week',
't.o.v. vorige week':'vs. last week', 'Laatste verkopen':'Recent sales',
'Laatste scans':'Recent scans', 'Lopende reparaties':'Repairs in progress',
'Alle reparaties':'All repairs', 'Te bestellen':'To order',
'Verwachte leveringen':'Expected deliveries', 'Verwachte levering':'Expected delivery',
'Prestaties per medewerker':'Performance per employee',
'Verkocht (':'Sold (', 'Kosten onderdelen:':'Cost of parts:', 'Voorraad:':'Stock:',
'Cash':'Cash', 'cash':'cash', 'pin':'card', 'bon':'receipt',
'Cash bon':'Cash with receipt', 'Cash met bon':'Cash with receipt',
'Cash zonder bon':'Cash without receipt',
'(voorraad ≤ minimum)':'(stock ≤ minimum)',

/* ---------- scannen ---------- */
'Inscannen':'Scan in', 'Inscannen (+1)':'Scan in (+1)', 'Uitscannen en verkoop':'Scan out and sell',
'Scan barcode…':'Scan barcode…', 'Scan of typ barcode':'Scan or type a barcode',
'Onbekende barcode':'Unknown barcode', 'Eerste product inboeken':'Book in your first product',
'Meer inscannen op scanpagina':'Scan more on the scan page',
'Aantal aangepast:':'Quantity changed:', 'Terugboeken':'Undo',
'Aantal aanpassen (bijv. bestelling van 20 stuks)':'Change the quantity, for example an order of 20 units',
'Elke scan boekt één stuk. Kwam er een bestelling binnen met meer stuks, scan dan één keer en pas daarna het aantal aan bij Laatste scans. Uitscannen telt als verkoop met pin, cash met bon of cash zonder bon en komt in de dashboardcijfers.':
  'Every scan books one unit. If a delivery came in with more units, scan once and then adjust the quantity under Recent scans. Scanning out counts as a sale by card, cash with receipt or cash without receipt, and shows up in the dashboard figures.',

/* ---------- producten en voorraad ---------- */
'Product toevoegen':'Add product', 'Product aanmaken':'Create product',
'Nieuw onderdeel':'New part', 'Los product':'Single product',
'Los product toevoegen':'Add a single product', 'Snel toevoegen':'Quick add',
'(voor snel toevoegen)':'(for quick add)', 'Snel toevoegen per model':'Quick add per model',
'Beginvoorraad':'Opening stock', 'Beginvoorraad per model':'Opening stock per model',
'Min. voorraad':'Min. stock', 'Bestelaantal':'Order quantity',
'Inkoopprijs (€)':'Purchase price (€)', 'Verkoopprijs (€)':'Selling price (€)',
'Prijs (€)':'Price (€)', 'Inkoop (€)':'Purchase (€)', 'Verkoop (€)':'Sale (€)',
'Kosten (€)':'Cost (€)', 'Kosten (€, optioneel)':'Cost (€, optional)',
'Prijs voor klant (€)':'Price for the customer (€)',
'Producttype':'Product type', 'Producttypes':'Product types', 'Nieuw type':'New type',
'Nieuwe categorie':'New category', 'Alle categorieën':'All categories',
'Telefoonmodellen':'Phone models', 'Model toevoegen':'Add model',
'Zoek op naam of barcode':'Search by name or barcode',
'Zoek product, reparatie of klant':'Search for a product, repair or customer',
'Onderdelenvoorraad':'Parts stock',
'bijv. Opladers':'e.g. Chargers', 'bijv. iPhone 14':'e.g. iPhone 14',
'bijv. iPhone 17 Pro':'e.g. iPhone 17 Pro', 'bijv. Screenprotector Matte':'e.g. Matte screen protector',
'bijv. iPhone 15 hoesje zwart':'e.g. iPhone 15 case black',
'bijv. Scherm iPhone 14 (incell)':'e.g. Screen iPhone 14 (incell)',
'bijv. scherm, batterij, laadpoort':'e.g. screen, battery, charging port',
'bijv. simkaart knippen, kabel los verkocht':'e.g. cutting a SIM card, cable sold separately',
'bijv. Windows 11 Pro installatie':'e.g. Windows 11 Pro installation',
'Kies een type, bijvoorbeeld Screenprotector Clear. Scan per model de barcode en druk op Enter. Het product wordt direct aangemaakt en de cursor springt naar het volgende model.':
  'Pick a type, for example Clear screen protector. Scan the barcode for each model and press Enter. The product is created straight away and the cursor jumps to the next model.',
'Voor series van hetzelfde product op meerdere telefoonmodellen gebruik je Snel toevoegen bij Instellingen. Dat werkt een stuk sneller.':
  'For a run of the same product across several phone models, use Quick add under Settings. That is a lot faster.',

/* ---------- bestellen ---------- */
'Bestel':'Order', 'bestellen':'to order', 'Opnieuw bestellen':'Order again',
'Niet leverbaar':'Not available', 'Levering vertraagd':'Delivery delayed',
'(dan morgen binnen)':'(arrives tomorrow)', 'Vandaag bestellen vóór 16:30':'Order today before 16:30',
'bijv. levering vertraagd tot vrijdag':'e.g. delivery delayed until Friday',
'Vink aan wanneer je bestelt. Vóór 17:00 besteld betekent morgen binnen, daarna overmorgen. De verwachte leverdatum staat hier en op het dashboard, handig om aan klanten door te geven. Zodra de levering is ingescand en de voorraad boven het minimum komt, verdwijnt de regel.':
  'Tick it when you place the order. Ordered before 17:00 means it arrives tomorrow, after that the day after. The expected delivery date shows here and on the dashboard, handy to pass on to customers. Once the delivery is scanned in and stock rises above the minimum, the line disappears.',

/* ---------- reparaties ---------- */
'Nieuwe reparatie':'New repair', 'Reparatie aanmaken':'Create repair',
'Reparatie aanmelden':'Register a repair', 'Start reparatie':'Start repair',
'Toestel en reparatie':'Device and repair', 'probleem':'problem',
'Op de hoogte houden?':'Keep the customer posted?',
'Ja, via mail of sms':'Yes, by email or text',
'Klant brengt het toestel later langs':'The customer will bring the device in later',
'Klantpagina':'Customer page', 'Klantpagina openen':'Open the customer page',
'Sms de klant':'Text the customer', 'Mail de klant':'Email the customer',
'Als probleem':'As a problem', 'Intern opslaan':'Save internally',
'Ook voor klant':'Also for the customer',
'Prijs op gsm-world.nl':'Price on gsm-world.nl', 'Voorraad foneday':'Foneday stock',
'Open foneday login':'Open Foneday login', 'Open mobileparts login':'Open Mobileparts login',
'Verwachte ophaaltijd voor de klant':'Expected pickup time for the customer',
'of typ zelf, bijv. vandaag 15:30':'or type it yourself, e.g. today 15:30',
'Vandaag 16:00':'Today 16:00', 'Morgen 12:00':'Tomorrow 12:00',
'Over 1 uur':'In an hour', 'Einde van de dag':'End of the day',
'Onderdelen binnen voor':'Parts arrived for',
'Probleem gemarkeerd als opgelost':'Problem marked as solved',
'Laat het de klant weten via Reparaties.':'Let the customer know via Repairs.',
'Vergeet niet de klant te informeren (/)':'Do not forget to let the customer know (/)',
'De links openen de zoekpagina met toestel en reparatie ingevuld. Inloggen bij foneday of mobileparts doe je zelf in die tab. Automatisch zoeken naar voorraad en prijzen komt in de online versie. Sla je inloggegevens alvast op bij Instellingen, Leveranciers.':
  'The links open the search page with the device and repair filled in. You log in to Foneday or Mobileparts yourself in that tab. Automatic lookup of stock and prices is coming in the online version. You can already store your login details under Settings, Suppliers.',
'Pas in de checkout komt daar 21% bij. Neem je een prijs van die sites over, vink dan "ex. btw (+21%)"aan bij het onderdeel. De software rekent de btw er dan automatisch bij, zodat je winstberekening klopt. Prijzen op gsm-world.nl zijn consumentenprijzen inclusief btw.':
  'VAT of 21% is only added at checkout. If you copy a price from those sites, tick "excl. VAT (+21%)" on the part. The software then adds the VAT itself so your profit stays correct. Prices on gsm-world.nl are consumer prices including VAT.',
'Let op: foneday en mobileparts tonen prijzen exclusief btw.':
  'Note: Foneday and Mobileparts show prices excluding VAT.',

/* ---------- diensten ---------- */
'Nieuwe dienst':'New service', 'Verkoop een dienst':'Sell a service',
'Losse dienst of verkoop':'One-off service or sale',
'Standaarddiensten beheren':'Manage standard services',
'Omschrijving':'Description',
'Klik op een dienst en kies de betaalmethode. De verkoop telt direct mee in het dashboard onder de categorie Diensten.':
  'Click a service and pick the payment method. The sale counts towards the dashboard straight away, under the Services category.',

/* ---------- team ---------- */
'Nieuw team':'New team', 'Geen team':'No team', 'Teams / vestigingen':'Teams / locations',
'Uitnodigingslink maken':'Create an invitation link', 'Link kopiëren':'Copy link',
'Verstuur link':'Send link', 'Rol voor uitnodiging':'Role for the invitation',
'Vergrendeling':'Lock', 'Nu vergrendelen':'Lock now',
'Vraag om pincode bij openen van de app':'Ask for a PIN when the app opens',
'Pincode (4 cijfers)':'PIN (4 digits)',
'Handig als meerdere mensen dezelfde computer gebruiken: iedere verkoop en reparatie wordt op naam geregistreerd.':
  'Useful when several people share the same computer: every sale and repair is recorded by name.',
'Dit is het echte inlogsysteem: elke medewerker krijgt een eigen gebruikersnaam, e-mailadres en wachtwoord, met optionele twee-staps-verificatie. Nodig nieuwe collega’s uit via een deelbare link — zij doorlopen bij hun eerste keer inloggen automatisch dezelfde rondleiding.':
  'This is the real login system: every employee gets their own username, email address and password, with optional two-step verification. Invite new colleagues with a shareable link; the first time they log in they get the same tour automatically.',

/* ---------- instellingen ---------- */
'Bedrijfsgegevens':'Company details', 'Bedrijfsnaam':'Company name',
'Huisstijl':'Branding', 'Eigen logo':'Own logo', 'Logo (optioneel)':'Logo (optional)',
'Logo weghalen':'Remove logo', 'Logo verwijderen':'Delete logo',
'Weergavenaam in de app':'Display name in the app', 'Ondertitel':'Subtitle',
'Accentkleur':'Accent colour', 'Accentkleur (knoppen & actief menu)':'Accent colour (buttons and active menu)',
'Donkere merkkleur (inlogscherm)':'Dark brand colour (login screen)',
'Donkere kopbalk':'Dark header bar', 'Achtergrond':'Background',
'Menutekst (niet-actief)':'Menu text (inactive)', 'Tekst op actieve knop':'Text on the active button',
'Tekstkleur inhoud':'Text colour for content', 'Warm rood':'Warm red',
'Eigen kleur':'Custom colour', 'Standaard herstellen':'Restore defaults',
'Leveranciers':'Suppliers', 'Foneday e-mail':'Foneday email',
'Foneday wachtwoord':'Foneday password', 'Mobileparts e-mail':'Mobileparts email',
'Mobileparts wachtwoord':'Mobileparts password',
'(voor automatisch zoeken)':'(for automatic lookup)',
'Automatisch voorraad en prijzen zoeken':'Look up stock and prices automatically',
'Abonnement':'Subscription', 'Abonnement en facturen beheren':'Manage subscription and invoices',
'Back-up':'Backup', 'Exporteer back-up':'Export a backup', 'Importeer back-up':'Import a backup',
'Juridisch':'Legal', 'Algemene voorwaarden':'Terms and conditions',
'Privacyverklaring':'Privacy statement', 'Verwerkersovereenkomst':'Data processing agreement',
'Rondleiding':'Tour', 'Rondleiding opnieuw':'Restart the tour',
'Rondleiding opnieuw bekijken':'Take the tour again', 'Rondleiding sluiten':'Close the tour',
'Mijn account':'My account',
'De kleuren worden direct doorgevoerd in de hele app én in de klantpagina van reparaties. Handig als je dit systeem later ook aan andere winkels levert.':
  'The colours are applied straight away across the whole app and on the customer page for repairs. Handy if you later supply this system to other shops as well.',
'Data staat lokaal in deze browser. Maak regelmatig een back-up.':
  'Your data is stored locally in this browser. Make a backup regularly.',
'De gegevens worden alleen lokaal in deze browser opgeslagen (onversleuteld) en worden nergens heen gestuurd. Gebruik bij twijfel een uniek wachtwoord voor deze shops.':
  'These details are stored only in this browser, unencrypted, and are never sent anywhere. If in doubt, use a unique password for these shops.',
'De verwerkersovereenkomst regelt wat wij met de gegevens van jouw klanten mogen doen. Die geldt automatisch; je hoeft niets te tekenen.':
  'The data processing agreement covers what we may do with your customers’ data. It applies automatically; there is nothing to sign.',

/* ---------- klantpagina en berichten ---------- */
'Eigen uitstraling':'Own look', 'Naam op de pagina':'Name on the page',
'Teksten op de pagina':'Text on the page', 'Voorbeeld bekijken':'View an example',
'Contact en openingstijden':'Contact and opening hours', 'Openingstijden':'Opening hours',
'WhatsApp-nummer':'WhatsApp number', 'Jouw adres':'Your address',
'Bij wachten op toestel':'While waiting for the device',
'Bij klaar om op te halen':'When ready for pickup',
'Boven het vragen-blok':'Above the questions block',
'(wat je klant ziet)':'(what your customer sees)',
'(staat niet in het systeem)':'(not stored in the system)',
'Andere kleuren dan het dashboard gebruiken':'Use different colours than the dashboard',
'Berichten aan de klant':'Messages to the customer',
'Versturen via e-mail':'Send by email', 'Versturen via WhatsApp':'Send by WhatsApp',
'Onderwerp van de e-mail':'Subject of the email',
'Standaardtekst terug':'Restore the standard text',
'Proefbericht naar mijzelf':'Send a test message to myself',
'E-mailadres (afzender)':'Email address (sender)',
'Telefoonnummer (afzender)':'Phone number (sender)',
'(voor klantberichten bij reparaties)':'(for customer messages about repairs)',
'Iedere reparatie krijgt een eigen webadres. Je klant ziet daar de voortgang, jouw berichten en hoe hij je kan bereiken.':
  'Every repair gets its own web address. Your customer sees the progress there, along with your messages and how to reach you.',
'Achter dit adres komt het reparatienummer, bijvoorbeeld':
  'The repair number is added after this address, for example',
'Bij elke stap kan er automatisch een bericht uit. Zet per stap aan of uit en pas de tekst aan.':
  'A message can go out automatically at every step. Switch each step on or off and adjust the text.',
'Deze gegevens worden gebruikt in de statusberichten naar klanten. Berichten openen in je eigen mail-/sms-app zodat jij ze verstuurt.':
  'These details are used in the status messages to customers. Messages open in your own email or text app so that you send them.',
'Laat het WhatsApp-nummer leeg om je gewone telefoonnummer te gebruiken.':
  'Leave the WhatsApp number empty to use your normal phone number.',
'Ma t/m za 10:00 tot 18:00':'Mon to Sat 10:00 to 18:00',
'Dorpsstraat 1, Utrecht':'1 High Street, Utrecht',
'bijv. Winkel Centrum':'e.g. City Centre Shop', 'bijv. Sara':'e.g. Sara',
'info@jouwwinkel.nl':'info@yourshop.com',

/* ---------- inloggen ---------- */
'Inloggen':'Log in', 'Uitloggen':'Log out', 'Naar inloggen':'To the login screen',
'Terug naar inloggen':'Back to the login screen',
'Gebruikersnaam':'Username', 'Gebruikersnaam of e-mail':'Username or email',
'Waarmee je wil inloggen':'What you want to log in with',
'Wachtwoord':'Password', 'Nieuw wachtwoord':'New password',
'Herhaal wachtwoord':'Repeat the password', 'Wachtwoord tonen':'Show password',
'Wachtwoord vergeten?':'Forgotten your password?',
'Wachtwoord instellen':'Set a password', 'Wachtwoord wijzigen':'Change password',
'Wachtwoord opslaan':'Save password', 'Wachtwoord van':'Password of',
'E-mailadres':'Email address', 'E-mail:':'Email:', 'E-mail (optioneel)':'Email (optional)',
'Telefoonnummer':'Phone number', 'Telefoonnummer *':'Phone number *',
'Voor- en achternaam':'First and last name', 'Je naam':'Your name',
'Naam van je winkel':'The name of your shop', 'Naam opslaan':'Save name',
'Account aanmaken':'Create account', 'Min. 8 tekens':'At least 8 characters',
'6-cijferige code':'6-digit code', 'Inschakelen':'Turn on', 'Uitschakelen':'Turn off',
'2FA aan':'2FA on', '2FA uit':'2FA off',
'Ander e-mailadres proberen':'Try another email address',
'Opnieuw versturen (60)':'Send again (60)',
'jij@bedrijf.nl':'you@company.com',
'Aangemaakt:':'Created:', 'Verwijderd:':'Removed:', 'Opgeslagen':'Saved',
'Je winkel staat klaar.':'Your shop is ready.',
'WhatsApp werkt':'WhatsApp works', 'WhatsApp is gekoppeld':'WhatsApp is connected',
'WhatsApp gekoppeld op':'WhatsApp connected on',
'Je eigen nummer is losgekoppeld':'Your own number has been disconnected',
'Accounts & inloggen':'Accounts & login'

};

/* ---------- meldingen en korte zinnen ---------- */
Object.assign(WOORDEN, {
'Opgeslagen.':'Saved.', 'Opslaan mislukt.':'Could not save.',
'Naam opgeslagen.':'Name saved.', 'Logo opgeslagen.':'Logo saved.',
'Logo opgeslagen':'Logo saved', 'Logo verwijderd':'Logo removed',
'Huisstijl opgeslagen':'Branding saved', 'Standaard huisstijl hersteld':'Default branding restored',
'Bedrijfsgegevens opgeslagen':'Company details saved',
'Wijzigingen opgeslagen:':'Changes saved:',
'Leveranciersgegevens opgeslagen (lokaal)':'Supplier details saved on this device',
'Back-up gedownload':'Backup downloaded', 'Back-up geïmporteerd':'Backup imported',
'Ongeldig back-upbestand.':'That is not a valid backup file.',
'Huidige data vervangen door deze back-up?':'Replace the current data with this backup?',

'Vul een naam in.':'Please enter a name.',
'Vul alle velden in.':'Please fill in every field.',
'Vul een onderdeelnaam in.':'Please enter a name for the part.',
'Vul eerst een prijs in.':'Please enter a price first.',
'Vul de prijs voor de klant in.':'Please enter the price for the customer.',
'Kies eerst een categorie.':'Please pick a category first.',
'Typ eerst een opmerking.':'Please type a note first.',
'Barcode en naam zijn verplicht.':'A barcode and a name are required.',
'Naam en telefoonnummer zijn verplicht.':'A name and phone number are required.',
'Vul een geldig e-mailadres in.':'Please enter a valid email address.',
'Vul de 6-cijferige code in.':'Please enter the 6-digit code.',
'Pincode moet 4 cijfers zijn.':'A PIN must be 4 digits.',
'Wachtwoord moet minstens 8 tekens zijn.':'A password must be at least 8 characters.',
'Kies een wachtwoord van minstens 8 tekens.':'Choose a password of at least 8 characters.',
'De wachtwoorden komen niet overeen.':'The passwords do not match.',
'Vul zowel je gebruikersnaam of e-mail als je wachtwoord in.':
  'Please enter both your username or email and your password.',
'Onbekende combinatie van gebruikersnaam of e-mail en wachtwoord.':
  'That combination of username or email and password is not correct.',
'Onjuiste code, probeer opnieuw.':'That code is not correct, please try again.',
'Wachtwoord gewijzigd.':'Password changed.',
'Wachtwoord gewijzigd. Log in met je nieuwe wachtwoord.':
  'Password changed. Log in with your new password.',
'Je account is aangemaakt. Log in met je gegevens.':
  'Your account has been created. Log in with your details.',
'Nieuwe e-mail verstuurd.':'A new email is on its way.',
'Log opnieuw in.':'Please log in again.',
'Twee-staps-verificatie ingeschakeld.':'Two-step verification switched on.',
'Twee-staps-verificatie uitgeschakeld.':'Two-step verification switched off.',

'Product toegevoegd:':'Product added:', 'Product bestaat niet meer.':'That product no longer exists.',
'Product bestaat niet meer, kan niet terugboeken.':'That product no longer exists, so it cannot be undone.',
'Onderdeel toegevoegd:':'Part added:', 'Onderdeel verwijderd:':'Part removed:',
'Dienst toegevoegd:':'Service added:', 'Dienst verwijderd:':'Service removed:',
'Categorie toegevoegd:':'Category added:', 'Categorie verwijderd':'Category removed',
'Categorie verwijderen?':'Remove this category?',
'Deze categorie is nog in gebruik door producten.':'This category is still used by products.',
'Type toegevoegd:':'Type added:', 'Type verwijderd':'Type removed',
'Model toegevoegd:':'Model added:', 'Model verwijderd':'Model removed',
'Model bestaat al.':'That model already exists.',
'Barcode bestaat al bij:':'That barcode is already used by:',
'Team toegevoegd:':'Team added:', 'Team verwijderd':'Team removed',
'Dit team heeft nog medewerkers.':'This team still has employees.',
'Er moet minstens één team blijven.':'At least one team has to remain.',
'Medewerker toegevoegd:':'Employee added:', 'Medewerker verwijderd:':'Employee removed:',
'Er moet minstens één medewerker blijven.':'At least one employee has to remain.',
'Stel eerst een pincode in bij minstens één medewerker.':
  'Set a PIN for at least one employee first.',
'Reparatie verwijderd:':'Repair removed:', 'Reparatie mislukt':'Repair failed',
'Bestelling ongedaan gemaakt:':'Order undone:',
'Voorraad kan niet negatief worden.':'Stock cannot go below zero.',
'Voorraad is lager dan het terug te boeken aantal. Toch terugboeken (voorraad wordt':
  'Stock is lower than the amount to undo. Undo anyway (stock becomes',
'Levering binnen: +':'Delivery received: +',
'Seal toegevoegd':'Seal added', 'seal (adhesive)':'seal (adhesive)',
'Er zijn producten van dit type. Type verwijderen? (producten blijven bestaan)':
  'There are products of this type. Remove the type? The products stay.',
'Er zijn producten met dit model. Model verwijderen? (producten blijven bestaan)':
  'There are products for this model. Remove the model? The products stay.',
'Logo is te groot (max ~400 kB).':'That logo is too large, about 400 kB is the limit.',
'Kies een afbeelding kleiner dan 400 kB.':'Choose an image smaller than 400 kB.',
'Link gekopieerd':'Link copied', 'Link gekopieerd, klaar om te delen.':'Link copied, ready to share.',
'Standaardtekst teruggezet.':'Standard text restored.',
'Bericht kon niet verstuurd worden.':'The message could not be sent.',
'Bericht verstuurd via':'Message sent by',
'Vul eerst je eigen e-mailadres in bij Bedrijfsgegevens.':
  'Please fill in your own email address under Company details first.',
'Je klantpagina-adres is nog niet klaar.':'Your customer page address is not ready yet.',
'Je klantpagina-adres wordt aangemaakt zodra je bent ingelogd.':
  'Your customer page address is created as soon as you are logged in.',
'Klantpagina geopend en gedownload. Stuur dit bestand naar de klant.':
  'Customer page opened and downloaded. Send this file to the customer.',
'WhatsApp is nog niet vrijgegeven.':'WhatsApp is not available yet.',
'Het koppelen is niet gelukt.':'Connecting did not work.',
'Het koppelen is niet afgerond.':'Connecting was not completed.',
'Het koppelvenster kon niet laden. Controleer je internetverbinding.':
  'The connection window could not load. Check your internet connection.',
'Het portaal kon niet worden geopend.':'The portal could not be opened.'
});


/* ---------- lege lijsten, statussen en rondleiding ---------- */
Object.assign(WOORDEN, {
'Winkel':'Shop', 'medewerker':'employee', 'geen logo':'no logo', 'geen bericht':'no message',
'bericht gaat automatisch':'message goes out automatically',
'Pin en bank':'Card and bank', '\u00b7 Winst:':'\u00b7 Profit:',
'Alles geregeld':'All sorted',

'Wacht op toestel':'Waiting for the device', 'Reparatie aangemeld':'Repair registered',
'Reparatie gestart':'Repair started', 'Klaar om op te halen':'Ready for pickup',
'Onderdelen besteld':'Parts ordered', 'Onderdelen binnen':'Parts arrived',
'In reparatie':'Being repaired', 'Afgerond':'Completed', 'Aangemeld':'Registered',

'Nog geen scans.':'No scans yet.',
'Geen lopende reparaties.':'No repairs in progress.',
'Geen openstaande bestellingen.':'No open orders.',
'Alles is op voorraad, niets te bestellen.':'Everything is in stock, nothing to order.',
'Nog geen verkopen in deze periode.':'No sales in this period yet.',
'Nog geen verkopen. Uitscannen = verkoop.':'No sales yet. Scanning out counts as a sale.',
'Nog geen reparaties. Maak er een aan via Nieuwe reparatie.':
  'No repairs yet. Create one with New repair.',
'Nog geen producten. Gebruik Snel toevoegen of Los product.':
  'No products yet. Use Quick add or Single product.',
'Nog geen onderdelen. Ze worden ook automatisch onthouden als je ze bij een reparatie invult.':
  'No parts yet. They are remembered automatically when you enter them on a repair.',
'Alles staat veilig in de cloud':'Everything is safely in the cloud',
'Data lokaal opgeslagen':'Stored on this device',
'Offline, wordt later bewaard':'Offline, will be saved later',
'Bewaard':'Saved',

'(kleuren, logo en naam van jouw winkel)':'(colours, logo and name of your shop)',
'Alle iPhone en Samsung modellen toevoegen':'Add every iPhone and Samsung model',
'Data-overdracht oude naar nieuwe telefoon':'Data transfer from an old to a new phone',
'Klik op een veld om het in te voegen. Bij WhatsApp ligt de tekst vast in het door Meta goedgekeurde sjabloon.':
  'Click a field to insert it. For WhatsApp the wording is fixed in the template approved by Meta.',
'In het portaal van Stripe wijzig je je pakket en betaalgegevens, download je facturen en zeg je op. Wij bewaren zelf geen betaalgegevens.':
  'In the Stripe portal you change your plan and payment details, download invoices and cancel. We store no payment details ourselves.',
'Je klanten krijgen hun updates via WhatsApp, verstuurd door Storvo met de naam van je winkel erbij. Je hoeft hier niets voor in te stellen.':
  'Your customers get their updates over WhatsApp, sent by Storvo with the name of your shop included. There is nothing to set up.',
'Wil je liever je eigen nummer? Dan zien klanten het nummer dat ze al kennen en blijf je de WhatsApp Business-app op je telefoon gewoon gebruiken.':
  'Would you rather use your own number? Then customers see the number they already know, and you keep using the WhatsApp Business app on your phone.',
'Je eigen nummer koppelen kan binnenkort. Vraag ernaar via info@storvo.nl.':
  'Connecting your own number is coming soon. Ask us about it at info@storvo.nl.',
'Mijn eigen nummer koppelen':'Connect my own number',
'Opnieuw koppelen':'Connect again',
'Duurt ongeveer twee minuten. Houd je telefoon bij de hand.':
  'Takes about two minutes. Keep your phone to hand.',
'Alleen de eigenaar kan een eigen nummer koppelen.':'Only the owner can connect their own number.',
'Alleen de eigenaar kan het abonnement beheren.':'Only the owner can manage the subscription.',
'Vraag de eigenaar van de winkel om dit te regelen.':'Ask the owner of the shop to arrange this.',
'Uitloggen':'Log out',

'Dit is het echte inlogsysteem: elke medewerker krijgt een eigen gebruikersnaam, e-mailadres en wachtwoord, met optionele twee-staps-verificatie. Nodig nieuwe collega\'s uit via een deelbare link \u2014 zij doorlopen bij hun eerste keer inloggen automatisch dezelfde rondleiding.':
  'This is the real login system: every employee gets their own username, email address and password, with optional two-step verification. Invite new colleagues with a shareable link; the first time they log in they get the same tour automatically.',

/* rondleiding */
'Je omzet, winst en marge van vandaag. Ook wat er nog moet gebeuren: reparaties die klaarstaan en producten die op raken.':
  'Today\u2019s revenue, profit and margin. Plus what still needs doing: repairs that are ready and products running low.',
'Het hart van de winkel. Scan een barcode om iets te verkopen of in te boeken. Werkt met elke barcodescanner, en overal in de app.':
  'The heart of the shop. Scan a barcode to sell something or book it in. Works with any barcode scanner, anywhere in the app.',
'Van aanmelden tot ophalen. De klant volgt de voortgang via een eigen pagina, dus je krijgt minder telefoontjes.':
  'From drop-off to pickup. The customer follows the progress on their own page, so you get fewer phone calls.',
'Je volledige voorraad. Zakt iets onder het minimum, dan verschijnt het vanzelf op je bestellijst.':
  'Your full stock. If something drops below the minimum, it appears on your order list automatically.',
'Bedrijfsgegevens, huisstijl, leveranciers en je abonnement. Hier kan je deze rondleiding ook opnieuw starten.':
  'Company details, branding, suppliers and your subscription. You can also restart this tour here.',

/* abonnement */
'Actief':'Active', 'Betaling mislukt':'Payment failed', 'Opgezegd':'Cancelled',
'Onbekend':'Unknown', 'Proefperiode':'Trial',
'Je proefperiode is voorbij':'Your trial has ended',
'De betaling is niet gelukt':'The payment did not go through',
'Je abonnement is gestopt':'Your subscription has ended',
'Er hangt geen winkel aan dit account':'There is no shop linked to this account',
'Abonnement afsluiten':'Start a subscription',
'Betaalgegevens bijwerken':'Update payment details',
'Abonnement hervatten':'Resume subscription',
'Toch doorgaan':'Continue anyway'
});


Object.assign(WOORDEN, {
'Bij het koppelen zet WhatsApp een paar dingen uit op je 1\u2011op\u20111 chats: verdwijnende berichten, \u00e9\u00e9n keer bekijken, live locatie en broadcastlijsten. Groepen blijven buiten Storvo.':
  'When you connect, WhatsApp switches a few things off on your one-to-one chats: disappearing messages, view once, live location and broadcast lists. Groups stay outside Storvo.',
'vereist de online versie van deze software. Browsers blokkeren het inloggen op andere websites vanuit een lokaal bestand. Sla je inloggegevens hier alvast op. Zodra de online versie er is, zoekt de software zelf bij foneday en mobileparts en zie je direct of een onderdeel op voorraad is. Tot die tijd openen de zoekknoppen bij een reparatie de shops met je zoekterm al ingevuld.':
  'requires the online version of this software. Browsers block logging in to other websites from a local file. You can already store your login details here. Once the online version is live, the software looks up Foneday and Mobileparts itself and you see straight away whether a part is in stock. Until then, the search buttons on a repair open the shops with your search term filled in.',

/* ---------- inlog- en onboardingschermen ---------- */
'Log in met je gebruikersnaam of e-mailadres':'Log in with your username or email address',
'Vul de code in uit je authenticator-app':'Enter the code from your authenticator app',
'Je bent bijna binnen':'You are almost in',
'Wachtwoord vergeten':'Forgotten password',
'Vul je e-mailadres in, dan sturen we een link om een nieuw wachtwoord te kiezen.':
  'Enter your email address and we will send a link to choose a new password.',
'Verstuur de link':'Send the link',
'Kijk in je mail':'Check your email',
'We hebben een link gestuurd. Klik erop om een nieuw wachtwoord te kiezen.':
  'We have sent a link. Click it to choose a new password.',
'Kies een nieuw wachtwoord':'Choose a new password',
'Je nieuwe wachtwoord':'Your new password',
'Welkom bij Storvo':'Welcome to Storvo',
'Maak het account van de eigenaar aan.':'Create the owner account.',
'Je bent uitgenodigd':'You have been invited',
'Maak je account aan om aan de slag te gaan.':'Create your account to get started.',
'We kennen dit e-mailadres niet. Maak eerst een account aan.':
  'We do not know this email address. Please create an account first.',
'Er is een e-mail verstuurd naar':'An email has been sent to',
'Opnieuw versturen':'Send again',
'Even geduld\u2026':'One moment\u2026',
'Bezig\u2026':'Working\u2026',
'Volgende':'Next', 'Vorige':'Previous', 'Klaar':'Done', 'Afronden':'Finish',
'Nu overslaan':'Skip for now',
'Start de rondleiding':'Start the tour',
'Begin met Storvo':'Get started with Storvo',
'Welkom bij je eigen winkelsysteem':'Welcome to your own shop system'
});


Object.assign(WOORDEN, {
'Vul je e-mailadres in. We sturen een link waarmee je een nieuw wachtwoord kan instellen.':
  'Enter your email address. We will send a link so you can set a new password.',
'Verstuur link':'Send link',
'Log in met je gebruikersnaam of e-mailadres':'Log in with your username or email address'
});


/* ---------- prijzen vergelijken ---------- */
Object.assign(WOORDEN, {
'Prijzen vergelijken':'Compare prices',
'Meedoen aan de prijsvergelijking':'Take part in the price comparison',
'Als je meedoet, stuurt Storvo bij elke afgerekende reparatie \u00e9\u00e9n regel door: het toestel, het soort reparatie en het bedrag. Geen klantnaam, geen telefoonnummer, geen reparatienummer. Zodra genoeg winkels meedoen zie je bij het aanmaken van een reparatie wat er in de markt gangbaar is. Wat jij rekent is nooit tot jouw winkel te herleiden: we tonen pas iets vanaf vijf verschillende winkels.':
  'If you take part, Storvo sends one line for every repair you settle: the device, the type of repair and the amount. No customer name, no phone number, no repair number. Once enough shops take part, you will see what is usual in the market when you create a repair. What you charge can never be traced back to your shop: we only show figures from five different shops upwards.',
'Zodra je je eerste reparatie afrekent, telt die mee.':'Your first settled repair will be the first to count.',
'Je doet mee aan de prijsvergelijking.':'You are taking part in the price comparison.',
'Je gegevens blijven voortaan bij jou.':'Your figures stay with you from now on.'
});

/* ══════════ de motor ══════════ */

let taal = 'nl';
const OVERSLAAN = new Set(['SCRIPT','STYLE','TEXTAREA','NOSCRIPT','CODE','PRE']);
const ATTRIBUTEN = ['placeholder','title','aria-label','alt'];

function kies(){
  try{
    const t = localStorage.getItem('storvo_taal');
    if(t === 'nl' || t === 'en') return t;
  }catch(e){}
  const host = location.hostname;
  if(host.endsWith('.nl')) return 'nl';
  if(host.endsWith('storvo.app')) return 'en';
  return (navigator.language || 'nl').toLowerCase().startsWith('nl') ? 'nl' : 'en';
}

/* Zoekt de Engelse tekst en houdt de spaties eromheen intact, zodat de
   opmaak niet verspringt. */
function engels(tekst){
  if(!tekst) return null;
  const kern = tekst.replace(/\s+/g,' ').trim();
  if(kern.length < 2) return null;
  const uit = WOORDEN[kern];
  if(uit === undefined || uit === kern) return null;
  return tekst.replace(/^(\s*)[\s\S]*?(\s*)$/, (_,a,b)=> a + uit + b);
}

function loopDoor(wortel){
  if(taal !== 'en' || !wortel) return;

  if(wortel.nodeType === 3){
    const v = engels(wortel.nodeValue);
    if(v !== null) wortel.nodeValue = v;
    return;
  }
  if(wortel.nodeType !== 1) return;
  if(wortel.closest && wortel.closest('[data-onvertaald]')) return;

  const wandelaar = document.createTreeWalker(wortel, NodeFilter.SHOW_TEXT, {
    acceptNode(n){
      const ouder = n.parentNode;
      if(!ouder || OVERSLAAN.has(ouder.nodeName)) return NodeFilter.FILTER_REJECT;
      if(ouder.closest && ouder.closest('[data-onvertaald]')) return NodeFilter.FILTER_REJECT;
      return n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const knopen = [];
  let n; while((n = wandelaar.nextNode())) knopen.push(n);
  knopen.forEach(k=>{ const v = engels(k.nodeValue); if(v !== null) k.nodeValue = v; });

  const elementen = [wortel].concat(
    Array.prototype.slice.call(wortel.querySelectorAll('[placeholder],[title],[aria-label],[alt]')));
  elementen.forEach(el=>{
    if(!el.getAttribute) return;
    ATTRIBUTEN.forEach(a=>{
      const w = el.getAttribute(a);
      if(!w) return;
      const v = engels(w);
      if(v !== null && v !== w) el.setAttribute(a, v);
    });
  });
}

/* Schermen die later worden opgebouwd, zoals meldingen en vensters, moeten
   ook mee. Daarom kijken we mee met wat er aan de pagina wordt toegevoegd. */
function kijkMee(){
  if(!window.MutationObserver) return;
  const waarnemer = new MutationObserver(wijzigingen=>{
    if(taal !== 'en') return;
    waarnemer.disconnect();
    try{
      wijzigingen.forEach(w=>{
        if(w.type === 'childList'){
          Array.prototype.forEach.call(w.addedNodes, loopDoor);
        } else if(w.type === 'characterData'){
          const v = engels(w.target.nodeValue);
          if(v !== null) w.target.nodeValue = v;
        } else if(w.type === 'attributes'){
          const el = w.target, a = w.attributeName;
          const huidig = el.getAttribute(a);
          const v = engels(huidig);
          if(v !== null && v !== huidig) el.setAttribute(a, v);
        }
      });
    }catch(e){ console.error('vertalen:', e); }
    aan(waarnemer);
  });
  aan(waarnemer);
  function aan(w){
    w.observe(document.body, {
      childList:true, subtree:true, characterData:true,
      attributeFilter: ATTRIBUTEN
    });
  }
}

/* De taalkiezer, in dezelfde stijl als op de website. */
function maakKiezer(){
  const balk = document.querySelector('.topbar');
  if(!balk || document.getElementById('appTaalKnop')) return;
  const knop = document.createElement('button');
  knop.id = 'appTaalKnop';
  knop.type = 'button';
  knop.setAttribute('data-onvertaald','');
  knop.setAttribute('aria-label','Taal / Language');
  knop.style.cssText = 'display:flex; align-items:center; gap:7px; background:transparent;'
    + 'border:none; padding:8px 9px; border-radius:12px; cursor:pointer; font-family:inherit;'
    + 'font-size:14px; font-weight:600; color:var(--muted-l,#8A938F); line-height:1; flex:none;';
  knop.innerHTML = '<span style="font-size:17px;line-height:1"></span><span></span>'
    + '<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:none;stroke:currentColor;'
    + 'stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;opacity:.55">'
    + '<path d="m6 9 6 6 6-6"/></svg>';
  knop.onclick = function(){ zetTaal(taal === 'nl' ? 'en' : 'nl'); };
  const gebruiker = document.getElementById('topUser');
  if(gebruiker && gebruiker.parentNode) gebruiker.parentNode.insertBefore(knop, gebruiker);
  else balk.appendChild(knop);
  toonKiezer();
}
function toonKiezer(){
  const knop = document.getElementById('appTaalKnop');
  if(!knop) return;
  knop.children[0].innerHTML = taal === 'nl' ? '&#127475;&#127473;' : '&#127468;&#127463;';
  knop.children[1].textContent = taal === 'nl' ? 'NL' : 'EN';
}

function zetTaal(t){
  const anders = t !== taal;
  taal = t;
  document.documentElement.lang = t;
  try{ localStorage.setItem('storvo_taal', t); }catch(e){}
  toonKiezer();
  if(t === 'en'){
    loopDoor(document.body);
    document.title = 'Storvo · Stock and repairs';
  } else if(anders){
    /* Terug naar het Nederlands is het schoonst met een verse pagina,
       want de originele teksten staan alleen in de HTML zelf. */
    location.reload();
  }
}

window.storvoTaal = { zet: zetTaal, huidig: ()=>taal, woorden: WOORDEN };

function start(){
  taal = kies();
  document.documentElement.lang = taal;
  if(taal === 'en'){
    loopDoor(document.body);
    document.title = 'Storvo · Stock and repairs';
  }
  maakKiezer();
  kijkMee();
  /* De topbalk wordt soms later opgebouwd. */
  setTimeout(maakKiezer, 600);
  setTimeout(maakKiezer, 2000);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

})();
