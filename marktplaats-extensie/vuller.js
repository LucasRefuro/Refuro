/* Storvo Marktplaats-invuller
   -----------------------------
   Draait op marktplaats.nl. Toont rechtsboven een klein Storvo-paneel. Je kopieert
   in het Storvo-portaal een advertentie ("Klaarzetten voor Marktplaats"); hier klik
   je een keer op "Haal uit Storvo". Daarna onthoudt de uitbreiding de advertentie en
   vult hij op elke stap van "Advertentie plaatsen" in wat op die pagina staat:
   op de eerste pagina de titel, op de volgende pagina de prijs en de omschrijving.

   Foto's voeg je zelf toe (dat mag een uitbreiding niet automatisch), en jij klikt
   zelf op Plaatsen. Het invullen gaat op gevoel (labels/placeholders), want Marktplaats
   verandert zijn formulier af en toe; lukt een veld niet, dan staat de tekst in het
   paneel klaar met een Kopieer-knop en een "Vul geselecteerd veld"-knop. */

(function () {
  if (window.__storvoMpGeladen) return;
  window.__storvoMpGeladen = true;

  var BEWAAR = 'storvo_mp';
  var MAX_LEEFTIJD = 45 * 60 * 1000; // 45 minuten: daarna niet meer automatisch invullen
  var pakket = null;
  var alGevuld = {}; // per pagina: welke velden dit al gevuld zijn (titel/prijs/tekst)

  /* ---------- opslag (onthouden over pagina's heen) ---------- */
  function bewaar(p) {
    try { chrome.storage.local.set({ ['' + BEWAAR]: { p: p, ts: Date.now() } }); } catch (e) {}
  }
  function laad(cb) {
    try {
      chrome.storage.local.get([BEWAAR], function (r) {
        var rij = r && r[BEWAAR];
        if (rij && rij.p && (Date.now() - (rij.ts || 0) < MAX_LEEFTIJD)) cb(rij.p);
        else cb(null);
      });
    } catch (e) { cb(null); }
  }
  function wis() {
    try { chrome.storage.local.remove(BEWAAR); } catch (e) {}
  }

  /* ---------- een waarde React-veilig in een veld zetten ---------- */
  function zetWaarde(el, waarde) {
    if (!el) return false;
    try {
      var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, waarde);
    } catch (e) { el.value = waarde; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function zichtbaar(el) {
    if (!el || el.disabled || el.readOnly) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /* ---------- tekst die bij een veld hoort ---------- */
  function veldTekst(el) {
    var s = [];
    if (el.getAttribute('placeholder')) s.push(el.getAttribute('placeholder'));
    if (el.getAttribute('aria-label')) s.push(el.getAttribute('aria-label'));
    if (el.getAttribute('name')) s.push(el.getAttribute('name'));
    if (el.id) {
      s.push(el.id);
      try { var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (lab) s.push(lab.textContent); } catch (e) {}
    }
    var oud = el.closest('label'); if (oud) s.push(oud.textContent);
    // ook een label of tekst vlak boven het veld meenemen
    var vorige = el.parentElement && el.parentElement.previousElementSibling;
    if (vorige) s.push(vorige.textContent);
    if (el.parentElement) {
      var lab2 = el.parentElement.querySelector('label');
      if (lab2) s.push(lab2.textContent);
    }
    return s.join(' ').toLowerCase();
  }

  function zoekVeld(selectors, woorden, soort) {
    for (var i = 0; i < selectors.length; i++) {
      var direct = document.querySelector(selectors[i]);
      if (direct && zichtbaar(direct)) return direct;
    }
    var velden = Array.prototype.slice.call(document.querySelectorAll(
      soort === 'textarea' ? 'textarea' : 'input[type="text"], input[type="number"], input:not([type])'
    )).filter(zichtbaar);
    for (var j = 0; j < velden.length; j++) {
      var t = veldTekst(velden[j]);
      for (var k = 0; k < woorden.length; k++) {
        if (t.indexOf(woorden[k]) !== -1) return velden[j];
      }
    }
    return null;
  }

  /* ---------- probeer te vullen wat op deze pagina staat ---------- */
  function vulAlles() {
    if (!pakket) return;
    if (!alGevuld.titel && pakket.titel) {
      var vTitel = zoekVeld(['#title', 'input[name="title"]'], ['titel', 'wat verkoop', 'aanbod'], 'input');
      if (vTitel && !vTitel.value) { zetWaarde(vTitel, pakket.titel); alGevuld.titel = true; }
    }
    if (!alGevuld.prijs && (pakket.prijs || pakket.prijs === 0)) {
      var vPrijs = zoekVeld(['input[name*="rice"]', '#price', 'input[name="askingPrice"]'], ['prijs', 'vraagprijs', 'bedrag', 'bod'], 'input');
      if (vPrijs && !vPrijs.value) { zetWaarde(vPrijs, String(pakket.prijs).replace('.', ',')); alGevuld.prijs = true; }
    }
    if (!alGevuld.tekst && pakket.tekst) {
      var vTekst = zoekVeld(['textarea[name="description"]', '#description', 'textarea'], ['omschrijving', 'beschrijving', 'toelichting'], 'textarea');
      if (vTekst && !vTekst.value) { zetWaarde(vTekst, pakket.tekst); alGevuld.tekst = true; }
    }
    meldStatus();
  }

  /* Blijf even proberen: React-formulieren renderen velden soms pas na de content-script,
     en na "Verder" verschijnt een nieuwe stap. We proberen een paar keer en kijken korte
     tijd mee met wijzigingen in de pagina. */
  var observer = null;
  function blijfProberen() {
    vulAlles();
    [300, 800, 1600, 3000].forEach(function (ms) { setTimeout(vulAlles, ms); });
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () { vulAlles(); });
    try { observer.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    setTimeout(function () { if (observer) { observer.disconnect(); observer = null; } }, 8000);
  }

  function meldStatus() {
    var st = paneel && paneel.querySelector('#smp-status'); if (!st) return;
    var namen = { titel: 'titel', prijs: 'prijs', tekst: 'omschrijving' };
    var klaar = Object.keys(alGevuld).filter(function (k) { return alGevuld[k]; }).map(function (k) { return namen[k]; });
    if (klaar.length) st.textContent = 'Ingevuld: ' + klaar.join(', ') + '. Controleer alles, voeg foto’s toe en klik zelf op Plaatsen.';
  }

  /* ---------- klembord ---------- */
  async function haalUitStorvo(statusEl) {
    statusEl.textContent = 'Klembord lezen...';
    var tekst = '';
    try { tekst = await navigator.clipboard.readText(); }
    catch (e) { statusEl.textContent = 'Kon het klembord niet lezen. Klik eerst in Storvo op "Klaarzetten voor Marktplaats".'; return; }
    var data = null; try { data = JSON.parse(tekst); } catch (e) {}
    if (!data || !data.storvo) { statusEl.textContent = 'Geen Storvo-advertentie op het klembord. Klik eerst in Storvo op "Klaarzetten voor Marktplaats".'; return; }
    pakket = data; alGevuld = {}; bewaar(pakket);
    toonPakket();
    blijfProberen();
    statusEl.textContent = 'Advertentie geladen. Ik vul de velden op elke stap in.';
  }

  /* ---------- paneel ---------- */
  function kopieer(waarde, knop) {
    navigator.clipboard.writeText(waarde).then(function () {
      var oud = knop.textContent; knop.textContent = 'Gekopieerd';
      setTimeout(function () { knop.textContent = oud; }, 1200);
    });
  }
  function vulGefocust(waarde) {
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) { zetWaarde(el, waarde); return true; }
    return false;
  }

  var paneel;
  function bouwPaneel() {
    paneel = document.createElement('div');
    paneel.id = 'storvo-mp-paneel';
    paneel.innerHTML =
      '<div class="smp-kop"><span class="smp-merk">Storvo</span><span class="smp-sub">Marktplaats-invuller</span>' +
      '<button class="smp-vouw" title="In- of uitklappen">–</button></div>' +
      '<div class="smp-lijf">' +
      '<button class="smp-knop smp-primair" id="smp-haal">Haal uit Storvo</button>' +
      '<div class="smp-status" id="smp-status">Klik in Storvo op "Klaarzetten voor Marktplaats", en dan hier op Haal uit Storvo.</div>' +
      '<div id="smp-velden"></div>' +
      '</div>';
    document.body.appendChild(paneel);
    paneel.querySelector('#smp-haal').addEventListener('click', function () { haalUitStorvo(paneel.querySelector('#smp-status')); });
    paneel.querySelector('.smp-vouw').addEventListener('click', function () { paneel.classList.toggle('smp-dicht'); });
  }

  function veldBlok(label, waarde, meerregelig) {
    var blok = document.createElement('div');
    blok.className = 'smp-veld';
    var kort = meerregelig ? (waarde.length > 90 ? waarde.slice(0, 90) + '…' : waarde) : waarde;
    blok.innerHTML = '<div class="smp-label">' + label + '</div><div class="smp-waarde"></div>' +
      '<div class="smp-acties"><button class="smp-knop smp-mini smp-kopieer">Kopieer</button>' +
      '<button class="smp-knop smp-mini smp-vulveld">Vul geselecteerd veld</button></div>';
    blok.querySelector('.smp-waarde').textContent = kort;
    blok.querySelector('.smp-kopieer').addEventListener('click', function (e) { kopieer(waarde, e.target); });
    blok.querySelector('.smp-vulveld').addEventListener('click', function (e) {
      if (!vulGefocust(waarde)) { e.target.textContent = 'Klik eerst in een veld'; setTimeout(function () { e.target.textContent = 'Vul geselecteerd veld'; }, 1400); }
    });
    return blok;
  }

  function toonPakket() {
    var vak = paneel.querySelector('#smp-velden'); vak.innerHTML = '';
    if (!pakket) return;
    vak.appendChild(veldBlok('Titel', pakket.titel || '', false));
    vak.appendChild(veldBlok('Prijs', String(pakket.prijs || 0), false));
    vak.appendChild(veldBlok('Omschrijving', pakket.tekst || '', true));

    var rij = document.createElement('div'); rij.className = 'smp-acties'; rij.style.marginTop = '10px';
    var opnieuw = document.createElement('button'); opnieuw.className = 'smp-knop smp-primair'; opnieuw.style.flex = '1'; opnieuw.textContent = 'Velden opnieuw invullen';
    opnieuw.addEventListener('click', function () { alGevuld = {}; blijfProberen(); });
    var klaar = document.createElement('button'); klaar.className = 'smp-knop smp-mini'; klaar.textContent = 'Wissen';
    klaar.addEventListener('click', function () { pakket = null; wis(); vak.innerHTML = ''; paneel.querySelector('#smp-status').textContent = 'Gewist.'; });
    rij.appendChild(opnieuw); rij.appendChild(klaar); vak.appendChild(rij);

    var tip = document.createElement('div'); tip.className = 'smp-tip'; tip.textContent = 'Voeg zelf de foto’s toe en klik zelf op Plaatsen.'; vak.appendChild(tip);
  }

  function start() {
    bouwPaneel();
    // Was er al een advertentie geladen (vorige stap)? Dan meteen doorgaan met invullen.
    laad(function (p) {
      if (p) { pakket = p; alGevuld = {}; toonPakket(); blijfProberen(); paneel.querySelector('#smp-status').textContent = 'Advertentie uit Storvo geladen. Ik vul deze stap in.'; }
    });
  }

  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start);
})();
