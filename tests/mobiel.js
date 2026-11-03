// De telefoon: alles scrolt naar beneden, niets opzij.
//
// Op een smal scherm wordt elke tabel een stapel kaartjes en is het menu een lijst
// onder elkaar. jsdom tekent geen layout, dus we kijken naar wat dat mogelijk maakt:
// de klasse en de kolomnamen op de cellen, de CSS-regel, en de Menu-knop. Valt één
// daarvan weg, dan schuift het op de telefoon weer opzij zonder dat iemand het ziet.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const MOCK=`<script>
window.__db={
  refurbish_apparaten:[
    {id:'a1', team_id:'t1', code:'A0011', merk:'HP', model:'EliteBook 830 G8', categorie:'Laptop',
     status:'te_controleren', checklist:[], defecten:[], gelabeld:true, aangemaakt_op:new Date().toISOString()},
    {id:'a2', team_id:'t1', code:'A0012', merk:'Dell', model:'Latitude 5430', categorie:'Laptop',
     status:'te_controleren', checklist:[], defecten:[], gelabeld:true, aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_onderdelen:[], refurbish_checklists:[], refurbish_orders:[], refurbish_batches:[],
  hardware_locaties:[{id:'l1', team_id:'t1', naam:'Magazijn', soort:'magazijn', volgorde:0}],
  hardware_modellen:[]
};
function __tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},maybeSingle:async()=>({data:(window.__db[naam]||[])[0]||null}),
    insert(r){ return {select:async()=>({data:[], error:null})}; },
    update(){ return api; }, delete(){ return api; },
    then(res){ res({data:window.__db[naam]||[], error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
  from:(n)=> n==='accounts'
    ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'Lucas'}})}
    : __tabel(n),
  rpc:async(naam)=> naam==='abonnement_status'
    ? {data:[{plan:'Enterprise',status:'proef',geblokkeerd:false,modules:['refurbish']}]} : {data:null}
})};
<\/script>`;

const ruw=fs.readFileSync(bron('refurbish/index.html'),'utf8');
const html=ruw.replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK);
const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/refurbish/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[];
w.onerror=(m)=>fouten.push(String(m));

setTimeout(async()=>{
  const d=w.document;
  console.log('\n── refurbish op de telefoon');
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  // De CSS die het stapelen doet, en dat tabelrollen op de telefoon niet meer opzij scrollen.
  ok('stapel-regel voor smalle schermen', /@media\(max-width:720px\)\{[^@]*table\.stapel/.test(ruw));
  ok('tabelrol scrolt op de telefoon niet opzij', /@media\(max-width:720px\)\{\s*\.tabelrol\{overflow-x:visible;\}/.test(ruw));
  ok('menu is op de telefoon geen schuifbalk meer', !/aside\{[^}]*overflow-x:auto/.test(ruw));

  w.eval("showTab('werkbank')");
  await new Promise(r=>setTimeout(r,50));
  const t=d.querySelector('#tab-werkbank table');
  ok('werkbank heeft een tabel', !!t);
  ok('tabel wordt een stapel', !!t && t.classList.contains('stapel'));
  const cellen=t ? [...t.tBodies[0].rows[0].cells] : [];
  ok('cellen dragen hun kolomnaam', cellen.some(c=>c.dataset.label==='Nummer'));
  ok('eerste kolom is de kop van de kaart', !!cellen[0] && cellen[0].classList.contains('stapel-kop'));

  // Een rij die later wordt bijgetekend krijgt ook zijn labels.
  const extra=d.createElement('tr');
  extra.innerHTML='<td>Nieuw</td><td>A0099</td><td>x</td><td>y</td>';
  t.tBodies[0].appendChild(extra);
  await new Promise(r=>setTimeout(r,20));
  ok('nieuwe rij krijgt labels', extra.cells[1].dataset.label==='Nummer');

  // Een tabel met twee kolommen past altijd en blijft een tabel.
  const smal=d.createElement('div');
  smal.innerHTML='<table><thead><tr><th>Wat</th><th>Hoeveel</th></tr></thead><tbody><tr><td>a</td><td>1</td></tr></tbody></table>';
  d.body.appendChild(smal);
  await new Promise(r=>setTimeout(r,20));
  ok('twee kolommen blijft een tabel', !smal.querySelector('table').classList.contains('stapel'));

  // Een vinkje in de kop (alles selecteren) blijft op de telefoon bereikbaar.
  const metVink=d.createElement('div');
  metVink.innerHTML='<table><thead><tr><th><input type="checkbox"></th><th>Toestel</th><th>Prijs</th></tr></thead><tbody><tr><td><input type="checkbox"></td><td>HP</td><td>1</td></tr></tbody></table>';
  d.body.appendChild(metVink);
  await new Promise(r=>setTimeout(r,20));
  ok('vinkje in de kop blijft staan', metVink.querySelector('th').classList.contains('stapel-houd'));
  ok('cel onder een lege kop zonder label', metVink.querySelector('td').dataset.label==='');
  ok('kop van de kaart is de eerste kolom met een naam', metVink.querySelectorAll('td')[1].classList.contains('stapel-kop'));

  // Het menu: een knop die de lijst openklapt, en na een keuze weer dicht.
  ok('menuknop bestaat', !!d.getElementById('menuKnop'));
  w.eval('menuWissel()');
  ok('menu klapt open', d.getElementById('zijbalk').classList.contains('menu-open'));
  ok('knop zegt dat hij open is', d.getElementById('menuKnop').getAttribute('aria-expanded')==='true');
  w.eval("showTab('voorraad')");
  ok('na een keuze klapt het menu dicht', !d.getElementById('zijbalk').classList.contains('menu-open'));
  ok('menuknop zegt waar je bent', d.getElementById('menuNu').textContent==='Voorraad');

  w.close();
  await winkelapp();
  console.log(fout ? fout+' FOUT' : 'telefoon in orde');
  process.exit(fout?1:0);
}, 400);

/* De winkelapp had het stapelen al (resptab), maar pas vanaf vijf kolommen. Bij drie
   of vier moest je op de telefoon nog opzij schuiven. */
async function winkelapp(){
  console.log('\n── winkelapp op de telefoon');
  const MOCKW=`<script>
function _leeg(){ const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
  in(){return api;},maybeSingle:async()=>({data:null}),insert(){return {select:()=>({single:async()=>({data:{id:'x'}})})};},
  update(){return api;},delete(){return api;},then(r){ r({data:[],error:null}); }}; return api; }
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user:null}})},
  from:()=>_leeg(), rpc:async()=>({data:[]}),
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}), removeChannel(){}
})};
<\/script>`;
  const ruwW=fs.readFileSync(bron('app/index.html'),'utf8');
  const htmlW=ruwW.replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCKW)
    .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
  const domW=new JSDOM(htmlW,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
  const ww=domW.window, dw=ww.document;
  const foutenW=[]; ww.onerror=(m)=>foutenW.push(String(m));
  await new Promise(r=>setTimeout(r,400));
  ok('winkelapp start zonder fout', foutenW.length===0);

  ok('filterknoppen breken af in plaats van opzij te schuiven', /\.periodesel\{display:flex; flex-wrap:wrap;/.test(ruwW));
  ok('een week in de dagstrip past zonder schuiven', /\.ds-dag\{flex:1 1 0; min-width:0;/.test(ruwW));
  ok('niet-gestapelde tabellen breken af', !/main table:not\(\.resptab\) td\{white-space:nowrap/.test(ruwW));

  // Een tabel van drie kolommen in main wordt nu ook een kaart-tabel.
  const bak=dw.createElement('div');
  bak.innerHTML='<table><thead><tr><th>Medewerker</th><th>Uren</th><th>Loonkosten</th></tr></thead><tbody><tr><td>Sam</td><td>8</td><td>120</td></tr></tbody></table>';
  dw.querySelector('main').appendChild(bak);
  await new Promise(r=>setTimeout(r,250));
  const t3=bak.querySelector('table');
  ok('drie kolommen stapelt ook', t3.classList.contains('resptab'));
  ok('met de kolomnaam op de cel', t3.querySelectorAll('td')[1].dataset.label==='Uren');
  ok('eerste kolom is de titel', t3.querySelector('td').classList.contains('celtitel'));

  // Twee kolommen past altijd en blijft gewoon.
  const bak2=dw.createElement('div');
  bak2.innerHTML='<table><thead><tr><th>Wat</th><th>Bedrag</th></tr></thead><tbody><tr><td>a</td><td>1</td></tr></tbody></table>';
  dw.querySelector('main').appendChild(bak2);
  await new Promise(r=>setTimeout(r,250));
  ok('twee kolommen blijft een tabel', !bak2.querySelector('table').classList.contains('resptab'));

  // Alles selecteren in de kop blijft op de telefoon bereikbaar.
  const bak3=dw.createElement('div');
  bak3.innerHTML='<table><thead><tr><th><input type="checkbox"></th><th>Toestel</th><th>Prijs</th></tr></thead><tbody><tr><td><input type="checkbox"></td><td>HP</td><td>1</td></tr></tbody></table>';
  dw.querySelector('main').appendChild(bak3);
  await new Promise(r=>setTimeout(r,250));
  ok('vinkje in de kop blijft staan', bak3.querySelector('th').classList.contains('resp-houd'));
  ok('kop-rij krijgt geen kaartrand', /table\.resptab thead tr\{background:none; border:none;/.test(ruwW));
  ok('knoppen van een hardwarekaart breken af', /td\.hwact \.hwacties\{flex-wrap:wrap;/.test(ruwW));
  ww.close();
}
