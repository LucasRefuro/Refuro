// Toevoegen zonder batches, de modellenlijst en het label.
//
// De nagebootste database wordt als gewoon <script> in de pagina gezet, en niet
// achteraf ingeschoten. Alleen dan draait de app precies zoals in een echte
// browser en kun je bij de variabelen die in het script zelf staan.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const MOCK=`<script>
window.__db={
  refurbish_apparaten:[
    {id:'a1', team_id:'t1', code:'A0007', merk:'HP', model:'ZBook 15 G6 Mobile', categorie:'Laptop',
     serienummer:'DEV-6PEUW3', specs:{Processor:'2.6 GHz', Geheugen:'16 GB', Opslag:'512 GB'},
     status:'te_controleren', checklist:[], defecten:[], gelabeld:false,
     aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_onderdelen:[], refurbish_checklists:[], refurbish_orders:[],
  hardware_modellen:[
    {id:'m1', merk:'HP', model:'ZBook 15 G6 Mobile', categorie:'Laptop',
     specs:{Processor:'Intel Core i7-9750H', Geheugen:'16 GB'}, keer_gebruikt:5},
    {id:'m2', merk:'Dell', model:'Latitude 5430', categorie:'Laptop',
     specs:{Processor:'Intel Core i5-1235U'}, keer_gebruikt:3}
  ]
};
window.__geschreven=[]; window.__rpcs=[];
function __tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},maybeSingle:async()=>({data:(window.__db[naam]||[])[0]||null}),
    insert(r){ window.__geschreven.push([naam,'insert',r]);
      return {select:async()=>({data:(Array.isArray(r)?r:[r]).map((x,i)=>Object.assign({id:'n'+i},x)), error:null})}; },
    update(r){ window.__geschreven.push([naam,'update',r]); return api; },
    delete(){ return api; },
    then(res){ res({data:window.__db[naam]||[], error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
  from:(n)=> n==='accounts'
    ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'Lucas'}})}
    : __tabel(n),
  rpc:async(naam,arg)=>{ window.__rpcs.push([naam,arg]);
    return naam==='abonnement_status'
      ? {data:[{plan:'Enterprise',status:'proef',geblokkeerd:false,modules:['refurbish']}]}
      : {data:null}; }
})};
<\/script>`;

const html=fs.readFileSync(bron('refurbish/index.html'),'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK);
const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/refurbish/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[];
w.onerror=(m)=>fouten.push(String(m));

setTimeout(async()=>{
  const d=w.document;
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  ok('toevoegpagina bestaat', !!d.getElementById('tab-toevoegen'));
  ok('inkoopbatches weg', !d.getElementById('tab-inkoop'));
  ok('menuknop toevoegen', !!d.querySelector('aside nav button[data-tab="toevoegen"]'));
  ok('modellen geladen', w.eval('modellen.length')===2);

  d.getElementById('t_model').value='zbook';
  w.eval('modelTyp()');
  const lijstje=d.getElementById('modelLijstje');
  ok('suggestie verschijnt', !lijstje.hidden && /ZBook 15 G6 Mobile/.test(lijstje.innerHTML));
  w.eval('modelPak(0)');
  ok('suggestie invullen', d.getElementById('t_model').value==='HP ZBook 15 G6 Mobile');
  ok('categorie meegenomen', w.eval('soortNu')==='Laptop');
  ok('categoriekiezer met knoppen', d.querySelectorAll('.soortknop').length===6);
  ok('laptop staat aan', !!d.querySelector('.soortknop.aan'));
  ok('hint bij bekend model', /kennen we al/.test(d.getElementById('modelHint').textContent));

  ok('splitsen bekend model', w.eval("JSON.stringify(splitsModel('HP ZBook 15 G6 Mobile'))")==='{"merk":"HP","model":"ZBook 15 G6 Mobile"}');
  ok('splitsen onbekend model', w.eval("splitsModel('Acer Swift 3').merk")==='Acer');

  d.getElementById('t_aantal').value='3';
  d.getElementById('t_inkoop').value='75';
  d.getElementById('t_lev').value='Testleverancier';
  await w.eval('toevoegen(document.createElement("button"))');

  const geschreven=w.__geschreven;
  const ins=geschreven.find(g=>g[0]==='refurbish_apparaten' && g[1]==='insert');
  ok('drie apparaten aangemaakt', !!ins && ins[2].length===3);
  if(ins){
    const r=ins[2][0];
    ok('merk apart opgeslagen', r.merk==='HP');
    ok('model apart opgeslagen', r.model==='ZBook 15 G6 Mobile');
    ok('leverancier mee', r.leverancier==='Testleverancier');
    ok('inkoopprijs mee', r.inkoop===75);
    ok('specs uit de lijst voorgevuld', !!r.specs && r.specs.Processor==='Intel Core i7-9750H');
    ok('geen serienummer gevraagd', !('serienummer' in r) || r.serienummer==null);
    ok('elk apparaat een eigen nummer', ins[2][0].code!==ins[2][1].code);
    ok('nummer leesbaar', /^A\d{4}$/.test(r.code));
  }
  ok('model onthouden voor de volgende keer', w.__rpcs.some(r=>r[0]==='model_onthouden'));

  w.eval("sluit(); labelsTonen('a1')");
  const v=d.getElementById('venster');
  ok('labelvenster opent', !!v);
  const et=v?v.innerHTML:'';
  ok('status bovenaan', /TE CONTROLEREN/.test(et));
  ok('merk en model groot', /HP ZBook 15 G6 Mobile/.test(et));
  ok('nummer op het label', /A0007/.test(et));
  ok('nummer staat onder de qr', et.indexOf('etqr')<et.indexOf('etcode'));
  ok('bekende gegevens op het label', /RAM: 16 GB/.test(et) && /Opslag: 512 GB/.test(et));
  ok('qr wijst naar dit apparaat', /apparaat%3Da1/.test(et));

  w.eval(`sluit();
    apparaten.push({id:'a9', code:'A0009', merk:'Dell', model:'Latitude 5430',
      categorie:'Laptop', specs:{}, status:'te_controleren'});
    labelsTonen('a9');`);
  const et2=d.getElementById('venster').innerHTML;
  ok('zonder specs geen lege regels', !/RAM:/.test(et2) && /Latitude 5430/.test(et2));

  w.eval("sluit(); apparaten[0].status='klaar'; labelsTonen('a1')");
  ok('status volgt het apparaat', /KLAAR VOOR VERKOOP/.test(d.getElementById('venster').innerHTML));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
},450);
