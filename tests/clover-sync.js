// Bewaakt dat de Clover-voorraad meezakt bij elke verkoop of voorraadmutatie. Zonder
// deze haak telt de pin te hoog na een balieverkoop, en dat geeft geen foutmelding: een
// stille fout, precies het soort dat tests/huisstijl.js ook vangt. cloverPushEen zit
// alleen in het product-formulier; deze test borgt dat elk verkoop/mutatie-pad de
// gedebouncede cloverVoorraadGewijzigd aanroept.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
let fout = 0;
const ok = (n, c) => { console.log((c ? 'ok   ' : 'FOUT ') + n); if (!c) fout++; };

// Het lichaam van een top-level functie, tot aan de volgende top-level functie.
function lichaam(naam) {
  const start = html.indexOf('function ' + naam + '(');
  if (start < 0) return '';
  const na = html.indexOf('\nfunction ', start + 1);
  return html.slice(start, na < 0 ? html.length : na);
}

console.log('\n── Clover-voorraad zakt mee met de verkoop');
ok('de gedebouncede helper bestaat', /function cloverVoorraadGewijzigd\(/.test(html));
['boekVerkoop', 'boekHandmatig', 'boekIn', 'bijvullen', 'verkoopTerug', 'zetVeld'].forEach(fn => {
  ok(fn + ' duwt de voorraadwijziging naar Clover', lichaam(fn).includes('cloverVoorraadGewijzigd'));
});

if (fout) { console.error('\n' + fout + ' controle(s) mislukt'); process.exit(1); }
console.log('\nClover-sync in orde');
