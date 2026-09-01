/* Storvo Marktplaats-invuller
   -----------------------------
   Draait op marktplaats.nl. Toont rechtsboven een klein Storvo-paneel. Je kopieert
   in het Storvo-portaal een advertentie ("Klaarzetten voor Marktplaats"); hier klik
   je op "Haal uit Storvo" en dan wordt de titel, prijs en omschrijving voorgevuld.
   Foto's voeg je zelf toe (dat mag een uitbreiding niet automatisch), en jij klikt
   zelf op Plaatsen. Zo blijft het jouw handeling.

   Het invullen gaat op gevoel (labels/placeholders), want Marktplaats verandert zijn
   formulier af en toe. Lukt een veld niet automatisch, dan staat de tekst in het
   paneel klaar met een Kopieer-knop en een "Vul het geselecteerde veld"-knop. */

(function () {
  if (window.__storvoMpGeladen) return;
  window.__storvoMpGeladen = true;

  var pakket = null;

  /* ---- een waarde React-veilig in een veld zetten ---- */
  function zetWaarde(el, waarde) {
    if (!el) return false;
    try {
      var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, waarde);
    } catch (e) {
      el.value = waarde;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /* ---- tekst die bij een veld hoort (label, placeholder, aria, naam, id) ---- */
  function veldTekst(el) {
    var stukken = [];
    if (el.getAttribute('placeholder')) stukken.push(el.getAttribute('placeholder'));
    if (el.getAttribute('aria-label')) stukken.push(el.getAttribute('aria-label'));
    if (el.getAttribute('name')) stukken.push(el.getAttribute('name'));
    if (el.id) {
      stukken.push(el.id);
      var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lab) stukken.push(lab.textContent);
    }
    var oud = el.closest('label');
    if (oud) stukken.push(oud.textContent);
    return stukken.join(' ').toLowerCase();
  }

  /* ---- zoek het beste veld voor een set trefwoorden ---- */
  function zoekVeld(selectors, woorden, soort) {
    // eerst harde selectors proberen
    for (var i = 0; i < selectors.length; i++) {
      var direct = document.querySelector(selectors[i]);
      if (direct && zichtbaar(direct)) return direct;
    }
    // dan op gevoel: alle zichtbare velden langs, matchen op trefwoord
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

  function zichtbaar(el) {
    if (!el || el.disabled || el.readOnly) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /* ---- de drie velden proberen te vullen ---- */
  function vulAlles() {
    if (!pakket) return { titel: false, prijs: false, tekst: false };
    var res = { titel: false, prijs: false, tekst: false };

    var vTitel = zoekVeld(['#title', 'input[name="title"]'], ['titel', 'wat verkoop', 'aanbod'], 'input');
    if (vTitel && pakket.titel) res.titel = zetWaarde(vTitel, pakket.titel);

    var vPrijs = zoekVeld(['input[name*="price"]', '#price', 'input[name="askingPrice"]'], ['prijs', 'vraagprijs', 'bedrag', 'bod'], 'input');
    if (vPrijs && (pakket.prijs || pakket.prijs === 0)) res.prijs = zetWaarde(vPrijs, String(pakket.prijs).replace('.', ','));

    var vTekst = zoekVeld(['textarea[name="description"]', '#description', 'textarea'], ['omschrijving', 'beschrijving', 'toelichting'], 'textarea');
    if (vTekst && pakket.tekst) res.tekst = zetWaarde(vTekst, pakket.tekst);

    return res;
  }

  /* ---- klembord lezen en verwerken ---- */
  async function haalUitStorvo(statusEl) {
    statusEl.textContent = 'Klembord lezen...';
    var tekst = '';
    try {
      tekst = await navigator.clipboard.readText();
    } catch (e) {
      statusEl.textContent = 'Kon het klembord niet lezen. Klik eerst in Storvo op "Klaarzetten voor Marktplaats".';
      return;
    }
    var data = null;
    try { data = JSON.parse(tekst); } catch (e) { data = null; }
    if (!data || !data.storvo) {
      statusEl.textContent = 'Geen Storvo-advertentie op het klembord. Klik eerst in Storvo op "Klaarzetten voor Marktplaats".';
      return;
    }
    pakket = data;
    toonPakket();
    var r = vulAlles();
    var gevuld = ['titel', 'prijs', 'tekst'].filter(function (k) { return r[k]; });
    statusEl.textContent = gevuld.length
      ? ('Ingevuld: ' + gevuld.join(', ') + '. Controleer alles, voeg foto’s toe en klik zelf op Plaatsen.')
      : 'Kon de velden niet automatisch vinden. Gebruik de Kopieer-knoppen hieronder.';
  }

  /* ---- een tekst kopieren ---- */
  function kopieer(waarde, knop) {
    navigator.clipboard.writeText(waarde).then(function () {
      var oud = knop.textContent; knop.textContent = 'Gekopieerd';
      setTimeout(function () { knop.textContent = oud; }, 1200);
    });
  }

  /* ---- een waarde in het op dit moment geselecteerde veld zetten ---- */
  function vulGefocust(waarde) {
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      zetWaarde(el, waarde);
      return true;
    }
    return false;
  }

  /* ================= paneel ================= */
  var paneel, lijf;
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

    lijf = paneel.querySelector('.smp-lijf');
    paneel.querySelector('#smp-haal').addEventListener('click', function () {
      haalUitStorvo(paneel.querySelector('#smp-status'));
    });
    paneel.querySelector('.smp-vouw').addEventListener('click', function () {
      paneel.classList.toggle('smp-dicht');
    });
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
      if (!vulGefocust(waarde)) {
        e.target.textContent = 'Klik eerst in een veld';
        setTimeout(function () { e.target.textContent = 'Vul geselecteerd veld'; }, 1400);
      }
    });
    return blok;
  }

  function toonPakket() {
    var vak = paneel.querySelector('#smp-velden');
    vak.innerHTML = '';
    if (!pakket) return;
    vak.appendChild(veldBlok('Titel', pakket.titel || '', false));
    vak.appendChild(veldBlok('Prijs', String(pakket.prijs || 0), false));
    vak.appendChild(veldBlok('Omschrijving', pakket.tekst || '', true));
    var opnieuw = document.createElement('button');
    opnieuw.className = 'smp-knop smp-primair';
    opnieuw.style.marginTop = '10px';
    opnieuw.textContent = 'Velden opnieuw invullen';
    opnieuw.addEventListener('click', function () {
      var r = vulAlles();
      var gevuld = ['titel', 'prijs', 'tekst'].filter(function (k) { return r[k]; });
      paneel.querySelector('#smp-status').textContent = gevuld.length
        ? ('Opnieuw ingevuld: ' + gevuld.join(', ') + '.')
        : 'Kon de velden niet vinden. Gebruik de Kopieer-knoppen.';
    });
    vak.appendChild(opnieuw);
    var tip = document.createElement('div');
    tip.className = 'smp-tip';
    tip.textContent = 'Voeg zelf de foto’s toe en klik zelf op Plaatsen.';
    vak.appendChild(tip);
  }

  if (document.body) bouwPaneel();
  else window.addEventListener('DOMContentLoaded', bouwPaneel);
})();
