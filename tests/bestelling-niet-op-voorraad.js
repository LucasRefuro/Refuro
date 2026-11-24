// Een webshopbestelling waarvan het toestel er niet meer is (24 november 2026, wens eigenaar).
//
// Aanleiding: A0160 werd op de webshop verkocht terwijl er een half uur eerder in de winkel een
// EliteBook 840 G8 was afgerekend. Vanuit de bestelling kies je nu: hetzelfde toestel met een
// ander A-nummer, de klant iets vergelijkbaars voorstellen (mail van Refuro), of het geld terug.
//
// Bewaakt:
//   1. de specs staan bij het toestel in de bestelling
//   2. webshopSleutel in de winkelapp is gelijk aan die aan de werkbank (zelfde specs = zelfde sleutel)
//   3. ruilen: het nieuwe toestel op verkocht en van de webshop, het oude naar toestellen_weg,
//      de nieuwe accu gaat mee; een toestel dat net weg is wordt niet verkocht
//   4. voorstellen: de lijst begint met wat erop lijkt, versturen gaat via de edge met alleen
//      id's, zonder mailadres gebeurt er niets
//   5. geld terug: de knop opent Shopify, de bestelling staat daarna als klaar
//   6. de mail zelf (mail.ts): Refuro-opmaak, alles ontsnapt, geen javascript-links, geen streepjes
//   7. de melding van Shopify telt toestellen_weg mee, zodat hij geen ander exemplaar pakt
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

/* Een functie uit een bronbestand halen (op de accolades). */
function haal(tekst, naam){
  const begin=tekst.indexOf('function '+naam+'(');
  if(begin<0) throw new Error('niet gevonden: '+naam);
  let d=0;
  for(let i=tekst.indexOf('{', begin); i<tekst.length; i++){
    if(tekst[i]==='{') d++;
    else if(tekst[i]==='}'){ d--; if(!d) return tekst.slice(begin, i+1); }
  }
}

(async()=>{
  const app=fs.readFileSync(bron('app/index.html'),'utf8');
  const rb=fs.readFileSync(bron('refurbish/index.html'),'utf8');

  const SP160={Processor:'Intel Core i5-1145G7', Geheugen:'16 GB', Opslag:'256 GB SSD', Videokaart:'Intel Iris Xe Graphics', Toetsenbord:'QWERTY'};
  const DB={
    hardware:[
      {id:'h160', code:'A0160', merk:'HP', model:'EliteBook 840 G8', categorie:'Laptop', status:'verkocht', verkocht_via:'webshop', staat:'A', accu:76, verkoop:399, specs:SP160, kanalen:{winkel:true}, aangemaakt_op:'2026-11-19T19:47:00Z'},
      {id:'h161', code:'A0161', merk:'HP', model:'EliteBook 840 G8', categorie:'Laptop', status:'voorraad', staat:'A', accu:88, verkoop:399, specs:Object.assign({}, SP160),
        kanalen:{winkel:true, shopify:{id:'gid://shopify/Product/1', sleutel:'hp_elitebook-840-g8_intel-core-i5-1145g7_16-gb_256-gb-ssd', grade:'A', variant:'gid://shopify/ProductVariant/9', url:'https://refuro.nl/products/hp-840'}}, aangemaakt_op:'2026-11-20T10:00:00Z'},
      {id:'h162', code:'A0162', merk:'HP', model:'EliteBook 840 G8', categorie:'Laptop', status:'voorraad', staat:'B', accu:80, verkoop:359, specs:Object.assign({}, SP160), kanalen:{}, aangemaakt_op:'2026-11-18T10:00:00Z'},
      {id:'h155', code:'A0155', merk:'HP', model:'EliteBook 840 G8', categorie:'Laptop', status:'voorraad', staat:'A', accu:52, verkoop:349, specs:{Processor:'Intel Core i5-1135G7', Geheugen:'8 GB', Opslag:'256 GB SSD'}, kanalen:{}, aangemaakt_op:'2026-11-19T18:35:00Z'},
      {id:'h181', code:'A0181', merk:'HP', model:'EliteBook 840 G8', categorie:'Laptop', status:'voorraad', staat:'A', verkoop:499, specs:{Processor:'Intel Core i7-1185G7', Geheugen:'16 GB', Opslag:'512 GB SSD'}, kanalen:{shopify:{id:'gid://shopify/Product/2', url:'https://refuro.nl/products/hp-i7'}}, aangemaakt_op:'2026-11-23T16:30:00Z'},
      {id:'h300', code:'A0300', merk:'Dell', model:'Latitude 5420', categorie:'Laptop', status:'voorraad', staat:'A', verkoop:389, specs:{Processor:'Intel Core i5-1145G7', Geheugen:'16 GB', Opslag:'256 GB SSD'}, kanalen:{}, aangemaakt_op:'2026-11-10T10:00:00Z'},
      {id:'h400', code:'A0400', merk:'Apple', model:'iPhone 13', categorie:'Telefoon', status:'voorraad', staat:'A', verkoop:399, specs:{Opslag:'128 GB', Kleur:'Blauw'}, kanalen:{}, aangemaakt_op:'2026-11-10T10:00:00Z'},
      {id:'h170', code:'A0170', merk:'HP', model:'EliteBook 840 G8', categorie:'Laptop', status:'voorraad', staat:'A', verkoop:399, specs:Object.assign({}, SP160), kanalen:{}, aangemaakt_op:'2026-11-21T10:00:00Z'}
    ],
    refurbish_apparaten:[
      {id:'r160', hardware_id:'h160', status:'te_repareren', defecten:['Accu: nieuwe accu plaatsen, webshopbestelling #1032. Daarna verzenden.']},
      {id:'r161', hardware_id:'h161', status:'klaar', defecten:[]},
      {id:'r170', hardware_id:'h170', status:'te_repareren', defecten:['Scherm']}
    ],
    webshop_bestellingen:[
      {id:'b1', nummer:'#1032', klant:null, email:null, bedrag:349, status:'betaald', betaald:true, verzonden:false, geannuleerd:false, gezien:true,
       geplaatst_op:new Date().toISOString(), beheer_url:'https://winkel.myshopify.com/admin/orders/77', bestelling_id:'gid://shopify/Order/77',
       regels:[{titel:'HP EliteBook 840 G8', sku:'hp_elitebook-840-g8_intel-core-i5-1145g7_16-gb_256-gb-ssd-A', aantal:1, bedrag:399, variant:'gid://shopify/ProductVariant/9'},
               {titel:'Nieuwe accu voor je laptop', sku:'NIEUWE-ACCU-LAPTOP', accu:true, aantal:1, bedrag:89}],
       toestellen:[{id:'h160', code:'A0160', naam:'HP EliteBook 840 G8', variant:'gid://shopify/ProductVariant/9', nieuwe_accu:true}],
       toestellen_weg:[], voorstellen:[]}
    ]
  };

  const MOCK=`<script>
window.__db=${JSON.stringify(DB)};
window.__rpc=[];
const _kopie=x=>JSON.parse(JSON.stringify(x));
function _q(naam){
  const f=[]; let upd=null;
  const rijen=()=>(window.__db[naam]||[]).filter(r=>f.every(([k,v,op])=>op==='in' ? v.includes(r[k]) : r[k]===v));
  const api={select(){return api;},order(){return api;},limit(){return api;},neq(){return api;},is(){return api;},
    gte(){return api;},lte(){return api;},ilike(){return api;},or(){return api;},
    eq(k,v){ f.push([k,v]); return api; }, in(k,v){ f.push([k,v,'in']); return api; },
    update(r){ upd=r; return api; }, delete(){return api;},
    insert(){ const p=Promise.resolve({error:null}); p.select=()=>({single:async()=>({data:{id:'x'}}), maybeSingle:async()=>({data:null})}); return p; },
    maybeSingle:async()=>{ const r=rijen(); return {data:r[0]?_kopie(r[0]):null, error:null}; },
    then(res){
      if(upd){ const r=rijen(); r.forEach(x=>Object.assign(x, _kopie(upd))); return res({data:r.map(x=>({id:x.id})), error:null}); }
      res({data:_kopie(rijen()), error:null});
    }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{access_token:'t', user:{id:'u1'}}}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:(n)=>_q(n), rpc:async(n)=>{ window.__rpc.push(n); return {data:0}; },
  storage:{from:()=>({upload:async()=>({error:null}), remove:async()=>({}), getPublicUrl:(p)=>({data:{publicUrl:p}})})},
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}), removeChannel(){}
})};
<\/script>`;
  const html=app
    .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
    .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
  const w=dom.window, d=w.document;
  w.scrollTo=()=>{};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  const fouten=[]; w.onerror=m=>fouten.push(String(m));
  await wacht(800);
  ok('winkelapp start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));
  const aanroepen=[];
  w.fetch=async(url, o)=>{ aanroepen.push({url:String(url), lijf:JSON.parse((o&&o.body)||'{}')});
    return {ok:true, json:async()=>({ok:true, html:'<p>Voorbeeld</p>', onderwerp:'x'})}; };
  w.eval(`account={id:'u1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'u1', naam:'Lucas', rol:'eigenaar', tabs:null};`);
  const db=t=>w.eval('window.__db.'+t);
  const best=()=>db('webshop_bestellingen')[0];
  const hw=id=>db('hardware').find(h=>h.id===id);

  // ── 1. de specs ──
  w.eval("showTab('webshop')");
  await w.eval('bstLaad()');
  await wacht(30);
  const lijst=()=>d.getElementById('bstLijst').innerHTML;
  ok('specs: processor, geheugen, opslag, staat en accu bij het toestel',
    /class="bstspec">A0160: Intel Core i5-1145G7 · 16 GB · 256 GB SSD · Uitstekend · accu 76%/.test(lijst()));
  ok('knop: Niet meer op voorraad staat bij een open bestelling', /bstOp\('b1'\)/.test(lijst()));

  // ── 2. dezelfde sleutel als de werkbank ──
  const wbSleutel=new Function('videokaartCode', haal(rb,'webshopSleutel')+'; return webshopSleutel;')(x=>w.eval('videokaartCode')(x));
  const proeven=[
    {merk:'HP', model:'EliteBook 840 G8', categorie:'Laptop', staat:'A', specs:SP160},
    {merk:'Dell', model:'Pro 14 Plus', categorie:'Laptop', staat:'B', specs:{Processor:'Intel Core Ultra 5 120U', Geheugen:'16 GB', Opslag:'256 GB SSD', Touchscreen:'ja'}},
    {merk:'HP', model:'ZBook 15 G6', categorie:'Laptop', staat:'N', specs:{Processor:'i7-9850H', Geheugen:'32 GB', Opslag:'512 GB', Videokaart:'NVIDIA Quadro T1000 4GB'}},
    {merk:'Apple', model:'iPhone 13', categorie:'Telefoon', staat:'A', specs:{Opslag:'128 GB', Kleur:'Blauw'}},
    {merk:'Apple', model:'MacBook Air M1', categorie:'Laptop', staat:'A', specs:{Chip:'Apple M1', Geheugen:'8 GB', Opslag:'256 GB', Kleur:'Spacegrijs'}}];
  ok('sleutel: winkelapp en werkbank geven precies hetzelfde',
    proeven.every(p=>w.eval('webshopSleutel')(p)===wbSleutel(p)));

  // ── 3. ruilen ──
  await w.eval("bstOp('b1')");
  const pop=()=>d.querySelector('#bstOverlay .popup');
  ok('venster: drie keuzes', !!pop() && /Hetzelfde toestel, ander nummer/.test(pop().textContent) && /Iets anders voorstellen/.test(pop().textContent) && /Geld terugstorten/.test(pop().textContent));
  await w.eval('bstOpRuil()');
  const zelfde=[...pop().querySelectorAll('.bstklijst')][0];
  ok('ruil: alleen hetzelfde toestel in dezelfde staat (A0161), niet B, niet andere specs, niet in reparatie',
    !!zelfde && /A0161/.test(zelfde.textContent) && !/A0162|A0155|A0181|A0170/.test(zelfde.textContent));
  d.getElementById('bst_zoek').value='latitude'; w.eval('bstRuilZoek()');
  ok('ruil: zoeken vindt ook iets anders', /A0300/.test(d.getElementById('bst_zoek_lijst').textContent));
  w.eval("bstRuilKies('h300')");
  ok('ruil: bij een ander toestel staat de waarschuwing', /anders dan wat de klant kocht/.test(pop().textContent));
  w.eval("bstRuilKies('h161')");
  ok('ruil: bij hetzelfde toestel geen waarschuwing', !/anders dan wat de klant kocht/.test(pop().textContent));

  /* Eerst: het gekozen toestel ging net aan de balie weg. */
  hw('h161').status='verkocht';
  await w.eval("bstRuilDoe('h161')");
  ok('ruil: een toestel dat net weg is wordt niet nog eens verkocht', best().toestellen[0].id==='h160' && !best().toestellen_weg.length);
  hw('h161').status='voorraad';
  w.eval("bstOpNu.kandidaten=null");
  await w.eval('bstOpRuil()');
  w.eval("bstRuilKies('h161')");
  aanroepen.length=0;
  await w.eval("bstRuilDoe('h161')");
  await wacht(30);
  ok('ruil: het nieuwe toestel staat op verkocht via de webshop', hw('h161').status==='verkocht' && hw('h161').verkocht_via==='webshop');
  ok('ruil: de bestelling heeft A0161 met de variant van de oude', best().toestellen.length===1 && best().toestellen[0].code==='A0161'
    && best().toestellen[0].variant==='gid://shopify/ProductVariant/9' && best().toestellen[0].vervangt_id==='h160');
  ok('ruil: A0160 staat bij toestellen_weg, niet meer bij toestellen', best().toestellen_weg.length===1 && best().toestellen_weg[0].id==='h160' && best().toestellen_weg[0].reden==='vervangen');
  ok('ruil: het nieuwe toestel gaat van de webshop', aanroepen.some(a=>/functions\/v1\/shopify$/.test(a.url) && a.lijf.actie==='offline' && a.lijf.hardware_id==='h161'));
  ok('ruil: de nieuwe accu gaat mee', best().toestellen[0].nieuwe_accu===true
    && db('refurbish_apparaten').find(r=>r.id==='r161').status==='te_repareren'
    && db('refurbish_apparaten').find(r=>r.id==='r161').defecten.includes('Accu: nieuwe accu plaatsen, webshopbestelling #1032. Daarna verzenden.')
    && db('refurbish_apparaten').find(r=>r.id==='r160').defecten.length===0);
  ok('ruil: het venster is dicht', !d.getElementById('bstOverlay'));
  ok('lijst: A0161 bij de regel, met in plaats van A0160', /A0161<\/span>/.test(lijst()) && /in plaats van A0160/.test(lijst()));
  ok('lijst: de gele regel zegt dat A0160 vervangen is', /A0160 is er niet meer\.<\/b> Vervangen door A0161/.test(lijst()) && !/bstOp\('b1','h160'\)/.test(lijst()));

  // ── 4. voorstellen ──
  /* Een tweede bestelling, nog met het oorspronkelijke toestel. */
  w.eval(`window.__db.webshop_bestellingen.push(Object.assign(JSON.parse(JSON.stringify(window.__db.webshop_bestellingen[0])), {id:'b2', nummer:'#1033', klant:'Sanne de Vries',
    toestellen:[{id:'h160', code:'A0160', naam:'HP EliteBook 840 G8', variant:'gid://shopify/ProductVariant/9'}], toestellen_weg:[], voorstellen:[]}));`);
  w.eval("window.__db.hardware.find(h=>h.id==='h161').status='voorraad'");
  await w.eval('bstLaad(true)');
  await w.eval("bstOp('b2')");
  await w.eval('bstOpVoorstel()');
  const vs=[...d.querySelectorAll('#bst_vs_lijst .bstcode')].map(e=>e.textContent);
  /* A0161 staat sinds de ruil hierboven aan de werkbank voor de nieuwe accu: die telt niet mee. */
  ok('voorstel: eerst wat het meest lijkt (zelfde specs, A0162), alleen laptops, niets in reparatie',
    vs[0]==='A0162' && !vs.includes('A0400') && !vs.includes('A0170') && !vs.includes('A0161'));
  ok('voorstel: de tekst staat klaar met wat de klant bestelde', /Je bestelde bij ons een HP EliteBook 840 G8/.test(d.getElementById('bst_vs_tekst').value));
  ok('voorstel: de voornaam staat klaar', d.getElementById('bst_vs_naam').value==='Sanne');
  w.eval("bstVsKies('h162'); bstVsKies('h181')");
  ok('voorstel: gekozen toestellen staan bovenaan', d.querySelectorAll('#bst_vs_lijst .bstkand.gekozen').length===2);
  aanroepen.length=0;
  await w.eval('bstVsStuur()');
  ok('voorstel: zonder mailadres gaat er niets weg', !aanroepen.length);
  await w.eval('bstVsVoorbeeld()');
  ok('voorstel: het voorbeeld komt van de edge en staat in een afgeschermd venster',
    aanroepen.some(a=>/bestelling-voorstel$/.test(a.url) && a.lijf.voorbeeld===true)
    && d.querySelector('#bst_vs_voorbeeld iframe') && d.querySelector('#bst_vs_voorbeeld iframe').getAttribute('sandbox')==='');
  d.getElementById('bst_vs_mail').value='sanne@example.nl';
  aanroepen.length=0;
  await w.eval('bstVsStuur()');
  await wacht(30);
  const stuur=aanroepen.find(a=>/bestelling-voorstel$/.test(a.url));
  ok('voorstel: de browser stuurt alleen id\'s, adres, naam en tekst', !!stuur && stuur.lijf.bestelling==='b2'
    && JSON.stringify(stuur.lijf.toestellen)==='["h162","h181"]' && stuur.lijf.naar==='sanne@example.nl' && stuur.lijf.voorbeeld===false && !('html' in stuur.lijf));
  const b2=()=>db('webshop_bestellingen').find(b=>b.id==='b2');
  ok('voorstel: A0160 staat bij deze bestelling als weg', !b2().toestellen.length && b2().toestellen_weg[0].reden==='voorstel');

  // ── 5. geld terug (vanuit de gele regel) ──
  w.eval(`window.__db.webshop_bestellingen.find(b=>b.id==='b2').voorstellen=[{op:new Date().toISOString(), naar:'sanne@example.nl', codes:['A0161']}]`);
  await w.eval('bstLaad(true)');
  ok('gele regel: voorstel gestuurd, met een knop om verder te gaan', /Voorstel gestuurd op/.test(lijst()) && /bstOp\('b2','h160'\)/.test(lijst()));
  await w.eval("bstOp('b2','h160')");
  w.eval('bstOpGeld()');
  const a=pop().querySelector('a.btn');
  ok('geld terug: de knop opent het terugbetaalscherm in Shopify', !!a && a.getAttribute('href')==='https://winkel.myshopify.com/admin/orders/77/refund'
    && a.getAttribute('target')==='_blank' && a.getAttribute('rel')==='noopener');
  ok('geld terug: de uitleg zegt dat de voorraad niet terug moet', /voorraad terug te zetten\? Zet dat uit/.test(pop().textContent));
  await w.eval('bstGeldDoe()');
  ok('geld terug: staat in Storvo als geld terug', b2().toestellen_weg[0].reden==='geld terug');
  ok('geld terug: telt niet meer als open en niet als omzet', w.eval("bstGeldTerug(bstData.find(b=>b.id==='b2'))")===true
    && /Geld terug/.test(lijst()) && !/bstVerzenden\('b2'/.test(lijst()));
  w.eval("bstFilterNu='open'; renderBestellingen();");
  ok('geld terug: niet in de lijst Nog niet verzonden', !/#1033/.test(lijst()) && /#1032/.test(lijst()));
  w.eval("bstFilterNu='alles'; renderBestellingen();");

  // ── 6. de mail ──
  const m=await import('file://'+bron('supabase/functions/bestelling-voorstel/mail.ts'));
  const mail=m.voorstelMail({nummer:'#1032', naam:'Sanne de Vries', tekst:'Sorry <b>echt</b>.\n\nTweede alinea.', besteld:'HP EliteBook 840 G8',
    logo:'https://storvo.app/emails/refuro-logo.png',
    toestellen:[
      {code:'A0161', merk:'HP', model:'EliteBook 840 G8', categorie:'Laptop', staat:'A', accu:88, prijs:399, specs:SP160, url:'https://refuro.nl/products/hp-840?variant=9', foto:'https://x.supabase.co/a.jpg'},
      {code:'A0400', merk:'Apple', model:'iPhone 13', categorie:'Telefoon', staat:'B', prijs:349.5, specs:{Opslag:'128 GB', Kleur:'Blauw'}, url:'javascript:alert(1)', foto:null}]});
  ok('mail: onderwerp met het bestelnummer', mail.onderwerp==='Over je bestelling #1032 bij Refuro');
  ok('mail: de kleuren en het logo van Refuro', /#1B2254/.test(mail.html) && /#E8421A/.test(mail.html) && /refuro-logo\.png/.test(mail.html));
  ok('mail: de tekst van de winkelier is ontsnapt', /Sorry &lt;b&gt;echt&lt;\/b&gt;\./.test(mail.html) && !/<b>echt<\/b>/.test(mail.html));
  ok('mail: voornaam, staat, specs, accu en prijs', /Hoi Sanne,/.test(mail.html) && /Uitstekend/.test(mail.html) && /Intel Core i5-1145G7 · 16 GB geheugen · 256 GB SSD/.test(mail.html)
    && /Accu 88%/.test(mail.html) && /€ 399,-/.test(mail.html) && /€ 349,50/.test(mail.html));
  ok('mail: een iPhone zonder merk ervoor, met opslag en kleur', /iPhone 13</.test(mail.html) && !/Apple iPhone/.test(mail.html) && /128 GB · Blauw/.test(mail.html));
  ok('mail: knop naar de webshop, en nooit een javascript-link', /href="https:\/\/refuro\.nl\/products\/hp-840\?variant=9"/.test(mail.html) && !/javascript:/i.test(mail.html) && /Antwoord op deze mail/.test(mail.html));
  ok('mail: geen lange streepjes', !/[–—]/.test(mail.html+mail.tekst));
  ok('mail: ook een tekstversie', /Hoi Sanne,/.test(mail.tekst) && /https:\/\/refuro\.nl\/products\/hp-840\?variant=9/.test(mail.tekst) && !/javascript:/.test(mail.tekst));
  ok('mail: het logo staat in de repo', fs.existsSync(bron('emails/refuro-logo.png')));

  // ── 7. de edge en de melding van Shopify ──
  const edge=fs.readFileSync(bron('supabase/functions/bestelling-voorstel/index.ts'),'utf8');
  ok('edge: haalt alles zelf uit de database, per team', /\.from\("hardware"\)[\s\S]{0,200}\.eq\("team_id", acc\.team_id\)/.test(edge) && /\.from\("webshop_bestellingen"\)[\s\S]{0,200}\.eq\("team_id", acc\.team_id\)/.test(edge));
  ok('edge: hooguit vier toestellen, een geldig adres, en niets wat al verkocht is', /ids\.length > 4/.test(edge) && /MAIL\.test\(naar\)/.test(edge) && /status !== "voorraad"/.test(edge));
  const wh=fs.readFileSync(bron('supabase/functions/shopify-webhook/index.ts'),'utf8');
  ok('melding: leest toestellen_weg en telt de open weg-toestellen als toegewezen',
    /select\("id, toestellen, toestellen_weg"\)/.test(wh) && /let toegewezen = eerderToestellen\.length \+ wegOpen\.length;/.test(wh)
    && /\[\.\.\.eerderToestellen, \.\.\.wegOpen\]\.filter/.test(wh));
  ok('melding: een annulering zet alleen toestellen terug, niet toestellen_weg', !/for \(const t of wegToestellen\)/.test(wh));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nniet meer op voorraad in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
