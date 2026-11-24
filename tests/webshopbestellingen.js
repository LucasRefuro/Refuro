// Bestellingen uit de webshop, zichtbaar in Storvo.
//
// De vraag die deze pagina moet beantwoorden is niet "is er iets verkocht" maar
// "wat is er verkocht, aan wie, en is het al betaald". Daar testen we op.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

/* Stopt de test zonder process.exit (een belofte die nooit oplost), dan liep node
   vroeger gewoon leeg met code 0: halve test, toch groen. Nu telt dat als fout. */
process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const nu=new Date();
const BESTELLINGEN=[
  {id:'b1', nummer:'#1042', klant:'Jan de Vries', email:'jan@example.nl',
   bedrag:449, valuta:'EUR', status:'betaald', betaald:true, verzonden:false, geannuleerd:false,
   gezien:false, geplaatst_op:nu.toISOString(),
   regels:[{titel:'HP ZBook 15 G6', sku:'A0007', aantal:1, bedrag:449}],
   toestellen:[{id:'h1', naam:'HP ZBook 15 G6', code:'A0007'}],
   beheer_url:'https://winkel.myshopify.com/admin/orders/1042'},
  {id:'b2', nummer:'#1041', klant:'Ayse Yilmaz', email:'ayse@example.nl',
   bedrag:24.95, valuta:'EUR', status:'open', betaald:false, verzonden:false, geannuleerd:false,
   gezien:true, geplaatst_op:new Date(nu-86400000).toISOString(),
   regels:[{titel:'USB-C kabel', sku:null, aantal:2, bedrag:24.95}],
   toestellen:[], beheer_url:'https://winkel.myshopify.com/admin/orders/1041'},
  {id:'b3', nummer:'#1040', klant:'Piet Bakker', email:null,
   bedrag:299, valuta:'EUR', status:'verzonden', betaald:true, verzonden:true, geannuleerd:false,
   gezien:true, geplaatst_op:new Date(nu-3*86400000).toISOString(),
   regels:[{titel:'Dell Latitude 5430', sku:'A0009', aantal:1, bedrag:299}],
   toestellen:[{id:'h2', naam:'Dell Latitude 5430', code:'A0009'}],
   beheer_url:'https://winkel.myshopify.com/admin/orders/1040'},
  {id:'b4', nummer:'#1039', klant:'Iemand', email:null,
   bedrag:199, valuta:'EUR', status:'geannuleerd', betaald:false, verzonden:false, geannuleerd:true,
   gezien:false, geplaatst_op:new Date(nu-5*86400000).toISOString(),
   regels:[], toestellen:[], beheer_url:null}
];

const MOCK=`<script>
window.__bijgewerkt=[];
const _leeg={select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
  in(){return this;},maybeSingle:async()=>({data:null}),
  insert(){return {select:()=>({single:async()=>({data:{id:'x'}})})};},
  update(){return this;},delete(){return this;},then(r){ r({data:[],error:null}); }};
function _bestellingen(){
  const api={select(){return api;},order(){return api;},limit(){return api;},
    eq(n,w){ api.__id=w; return api; },
    update(r){ window.__bijgewerkt.push([api.__id,r]); return api; },
    then(res){ res({data: window.__rijen||[], error:null}); }};
  return api;
}
window.__rijen=${JSON.stringify(BESTELLINGEN)};
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{access_token:'t', user:{id:'u1'}}}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:(n)=> n==='webshop_bestellingen' ? _bestellingen() : _leeg,
  rpc:async(naam)=> naam==='webshop_gekoppeld' ? {data:true} : {data:[]},
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}),
  removeChannel(){}
})};
window.fetch=async()=>({ok:true, json:async()=>({ok:true, gekoppeld:true, kanOauth:true, rechten:{}})});
<\/script>`;

let html=fs.readFileSync(bron('app/index.html'),'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
  .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');

const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[]; w.onerror=(m)=>fouten.push(String(m));
const d=()=>w.document;
const lijst=()=>d().getElementById('bstLijst').innerHTML;

setTimeout(async()=>{
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  ok('eigen pagina bestaat', !!d().getElementById('tab-webshop'));
  ok('menuknop bestaat', !!d().getElementById('webshopLink'));

  w.eval("account={id:'u1', team_id:'t1'};");
  await w.eval('bstLaad()');
  await new Promise(r=>setTimeout(r,40));

  const l=lijst();
  ok('bestellingen getoond', /#1042/.test(l) && /#1041/.test(l));
  ok('klantnaam erbij', /Jan de Vries/.test(l));
  ok('bedrag erbij', /449,00/.test(l));
  ok('wat er besteld is', /HP ZBook 15 G6/.test(l) && /USB-C kabel/.test(l));
  ok('aantal bij meer dan één', /2× USB-C kabel/.test(l));
  ok('welke toestellen eruit gingen: het A-nummer groot bij de regel', /HP ZBook 15 G6<\/span>\s*<span class="bstcode"[^>]*>A0007<\/span>/.test(l));
  ok('nieuwe bestelling valt op', /bstrij nieuw/.test(l) && /bstnieuwvlag/.test(l));
  ok('betaalstatus zichtbaar', /Betaald/.test(l) && /Nog niet betaald/.test(l));
  ok('verzonden zichtbaar', /Verzonden/.test(l));
  ok('geannuleerd zichtbaar', /Geannuleerd/.test(l));
  ok('link naar Shopify', /admin\/orders\/1042/.test(l));

  // ── de tellers ──
  const kpi=d().getElementById('bstKpis').innerHTML;
  ok('teller nieuw telt alleen ongeziene', />1</.test(kpi));
  ok('omzet van deze maand', /772,95/.test(kpi));
  ok('geannuleerde telt niet mee in de omzet', !/1171/.test(kpi));

  // ── het bolletje in het menu ──
  const badge=d().getElementById('bBestel');
  ok('bolletje bij nieuwe bestellingen', badge.textContent==='1' && !badge.hidden);

  // ── filters ──
  w.eval("bstFilterNu='toestellen'; renderBestellingen();");
  const met=lijst();
  ok('filter met een toestel', /#1042/.test(met) && !/#1041/.test(met));
  w.eval("bstFilterNu='open'; renderBestellingen();");
  const open=lijst();
  ok('filter nog niet verzonden', /#1042/.test(open) && !/#1040/.test(open));
  ok('en zonder de geannuleerde', !/#1039/.test(open));
  w.eval("bstFilterNu='nieuw'; renderBestellingen();");
  ok('filter nieuw', /#1042/.test(lijst()) && !/#1041/.test(lijst()));
  w.eval("bstFilterNu='alles'; renderBestellingen();");

  // ── gezien afvinken ──
  await w.eval("bstGezien('b1')");
  await new Promise(r=>setTimeout(r,30));
  const bij=w.__bijgewerkt.pop();
  ok('afvinken gaat naar de database', !!bij && bij[1].gezien===true);
  ok('bolletje verdwijnt', d().getElementById('bBestel').hidden);
  ok('en de vlag ook', !/bstnieuwvlag/.test(lijst()));

  // ── het A-nummer bij de goede regel (24 november 2026, wens eigenaar) ──
  // Bij grade-varianten is de sku de webshopsleutel en hangen er meer toestellen aan één advertentie.
  const regelCodes=x=>JSON.parse(w.eval(`JSON.stringify(bstToestelPerRegel(${JSON.stringify(x)}).per.map(l=>l.map(t=>t.code)))`));
  const losCodes=x=>JSON.parse(w.eval(`JSON.stringify(bstToestelPerRegel(${JSON.stringify(x)}).los.map(t=>t.code))`));
  const twee={regels:[
      {titel:'iPhone 13', sku:'apple_iphone-13_blauw_128-gb-A', aantal:1, variant:'gid://shopify/ProductVariant/1'},
      {titel:'iPhone 13', sku:'apple_iphone-13_blauw_128-gb-B', aantal:1, variant:'gid://shopify/ProductVariant/2'}],
    toestellen:[{id:'h8', naam:'Apple iPhone 13', code:'A0302', variant:'gid://shopify/ProductVariant/2'},
                {id:'h9', naam:'Apple iPhone 13', code:'A0301', variant:'gid://shopify/ProductVariant/1'}]};
  ok('twee dezelfde modellen: elk A-nummer bij zijn eigen grade', JSON.stringify(regelCodes(twee))==='[["A0301"],["A0302"]]');
  const oud={regels:[
      {sku:'NIEUWE-ACCU-TELEFOON', accu:true, titel:'Nieuwe accu voor je telefoon', aantal:1},
      {sku:'apple_iphone-17_zwart_256-gb-B', titel:'iPhone 17', aantal:1},
      {sku:'EXTRA-GLAS', extra:true, titel:'Screenprotector', aantal:1}],
    toestellen:[{id:'h7', naam:'Apple iPhone 17', code:'A0118', variant:'gid://shopify/ProductVariant/7', nieuwe_accu:true}]};
  ok('oudere bestelling zonder variant op de regel: bij de enige toestelregel, niet bij de accu of de extra',
    JSON.stringify(regelCodes(oud))==='[[],["A0118"],[]]' && losCodes(oud).length===0);
  const onzeker={regels:[{titel:'iPhone 13', sku:'x-A', aantal:1}, {titel:'iPhone 12', sku:'y-B', aantal:1}],
    toestellen:[{id:'h5', naam:'Apple iPhone 13', code:'A0401'}, {id:'h6', naam:'Apple iPhone 12', code:'A0402'}]};
  ok('niet zeker te koppelen: blijft los onderaan, nooit bij de verkeerde regel',
    JSON.stringify(regelCodes(onzeker))==='[[],[]]' && losCodes(onzeker).join()==='A0401,A0402');
  w.eval(`bstData=[Object.assign({id:'b9', nummer:'#1050', klant:'Test', bedrag:700, status:'betaald', betaald:true,
    gezien:true, geplaatst_op:new Date().toISOString()}, ${JSON.stringify(onzeker)})]; renderBestellingen();`);
  ok('los onderaan met de oude zin erbij', /A0401/.test(lijst()) && /uit je voorraad gehaald/.test(lijst()));
  ok('de lange webshopsleutel staat er niet meer', !/x-A/.test(lijst()));
  w.eval(`bstPopup(Object.assign({id:'b10', nummer:'#1051', klant:'Test', bedrag:399}, ${JSON.stringify(twee)}))`);
  const pop=d().getElementById('bstPopup');
  ok('pop-up: het A-nummer staat erin', !!pop && /A0301/.test(pop.innerHTML) && /A0302/.test(pop.innerHTML) && pop.querySelectorAll('.bstcode').length===2);
  w.eval("document.getElementById('bstPopDicht').click()");
  w.eval(`bstPopup(Object.assign({id:'b11', nummer:'#1052', klant:'Test', bedrag:700}, ${JSON.stringify(onzeker)}))`);
  ok('pop-up: ook een los toestel krijgt zijn A-nummer', /A0401/.test(d().getElementById('bstPopup').innerHTML) && /A0402/.test(d().getElementById('bstPopup').innerHTML));
  w.eval("document.getElementById('bstPopDicht').click()");

  // ── lege staat ──
  w.eval("bstData=[]; renderBestellingen();");
  ok('lege lijst legt uit wat er komt', /Zodra er iets in je webshop gekocht wordt/.test(lijst()));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
},450);
