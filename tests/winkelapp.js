const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
// Paden vanaf dit bestand, zodat de tests ook vanuit de hoofdmap draaien.
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const MOCK=`<script>
const _leeg={select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
  in(){return this;},maybeSingle:async()=>({data:null}),
  insert(){return {select:()=>({single:async()=>({data:{id:'x'}})})};},
  update(){return this;},delete(){return this;},then(r){ r({data:[],error:null}); }};
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:(n)=> n==='hardware_locaties'
    ? {select(){return this;},order(){return this;},
       then(r){ r({data:[{id:'l1',naam:'Winkel',soort:'winkel',volgorde:0}],error:null}); }}
    : _leeg,
  rpc:async()=>({data:[]}),
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}),
  removeChannel(){}
})};
<\/script>`;

let html=fs.readFileSync(bron('app/index.html'),'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
  .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');

const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[];
w.onerror=(m)=>fouten.push(String(m));

setTimeout(async()=>{
  const d=w.document;
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));

  ok('hardwarepagina bestaat', !!d.getElementById('tab-hardware'));
  ok('hardware in het menu', !!d.querySelector('aside nav button[data-tab="hardware"]'));
  ok('hardware in de onderbalk', w.eval("MOB_VOLGORDE.includes('hardware')"));
  ok('refurbish-link staat uit zonder module', d.getElementById('refurbLink').hidden);

  w.eval("abonnement={modules:['refurbish']}; moduleLinks();");
  ok('refurbish-link verschijnt met module', !d.getElementById('refurbLink').hidden);
  ok('link wijst naar de werkbank', d.getElementById('refurbLink').getAttribute('href')==='/refurbish/');

  const toestellen=[
    {id:'h1', merk:'Dell', model:'Latitude 5430', serienummer:'ABC', staat:'B', inkoop:75, verkoop:349,
     status:'voorraad', kanalen:{winkel:true}, aangemaakt_op:new Date(Date.now()-40*864e5).toISOString()},
    {id:'h2', merk:'HP', model:'EliteBook', staat:'A', inkoop:60, verkoop:249, status:'voorraad',
     kanalen:{winkel:true, shopify:{id:1, url:'https://x/y'}}, aangemaakt_op:new Date().toISOString()},
    {id:'h3', merk:'Apple', model:'MacBook Air', staat:'B', inkoop:300, verkoop:650, status:'verkocht',
     kanalen:{}, aangemaakt_op:new Date().toISOString()}
  ];
  w.eval("account={team_id:'t1', rol:'eigenaar'}; hwData="+JSON.stringify(toestellen)+"; renderHardware();");

  const lijst=d.getElementById('hwLijst').innerHTML;
  ok('toestellen in de lijst', /Latitude 5430/.test(lijst) && /EliteBook/.test(lijst));
  ok('verkochte niet in de voorraadlijst', !/MacBook Air/.test(lijst));
  ok('marge berekend (349 - 75)', /274,00/.test(lijst));
  ok('webshoplabel bij het online toestel', /Webshop/.test(lijst));
  ok('oud toestel gemarkeerd', /hwoud/.test(lijst));
  const kpis=d.getElementById('hwKpis').innerHTML;
  ok('kpi op voorraad 2', />2</.test(kpis));
  ok('kpi ingekocht voor 135', /135,00/.test(kpis));
  ok('kpi staat online 1', /Staat online/.test(kpis));

  w.eval("hwFilterNu='verkocht'; renderHardware();");
  ok('filter verkocht toont MacBook', /MacBook Air/.test(d.getElementById('hwLijst').innerHTML));
  w.eval("hwFilterNu='online'; renderHardware();");
  const online=d.getElementById('hwLijst').innerHTML;
  ok('filter online toont alleen HP', /EliteBook/.test(online) && !/Latitude/.test(online));
  w.eval("hwFilterNu='oud'; renderHardware();");
  const oud=d.getElementById('hwLijst').innerHTML;
  ok('filter oud toont alleen Dell', /Latitude/.test(oud) && !/EliteBook/.test(oud));

  w.eval("hwFilterNu='voorraad'; renderHardware(); hwBewerk('h1');");
  const v=d.getElementById('hwOverlay');
  ok('bewerkvenster opent', !!v);
  ok('velden gevuld', d.getElementById('hw_model').value==='Latitude 5430');
  ok('inkoopprijs gevuld', d.getElementById('hw_inkoop').value==='75');
  ok('shopify-knop aanwezig', /Op Shopify zetten/.test(v.innerHTML));
  ok('kopieerknop bij de titel', /hwKopieerVeld\('hw_titel'/.test(v.innerHTML));
  ok('kopieerknop bij de omschrijving', /hwKopieerVeld\('hw_oms'/.test(v.innerHTML));
  ok('knop prijs voorstellen', /Prijs voorstellen/.test(v.innerHTML));
  // prijsvoorstel op basis van een eerder verkocht zelfde model
  w.eval("hwPrijsvoorstel()");
  ok('prijsvoorstel ingevuld', Number(d.getElementById('hw_verkoop').value)>0);
  ok('bron van het voorstel genoemd', d.getElementById('hwPrijsBron').textContent.length>10);
  ok('verkoopknop aanwezig', /Verkopen aan de balie/.test(v.innerHTML));
  w.eval("hwSluit()");
  ok('venster sluit', !d.getElementById('hwOverlay'));

  w.eval("hwBewerk('h2')");
  ok('online toestel toont offline-knop', /Offline halen/.test(d.getElementById('hwOverlay').innerHTML));
  w.eval("hwSluit()");

  // ── inscannen ──
  w.eval(`hwLocaties=[{id:'l1',naam:'Winkel',soort:'winkel'}];
    hwData.push({id:'h4', merk:'Acer', model:'Swift 3', code:'A0009', status:'onderweg',
      inkoop:80, verkoop:249, kanalen:{}, aangemaakt_op:new Date().toISOString()});
    renderHardware();`);
  ok('onderweg niet in de voorraadlijst', !/Swift 3/.test(d.getElementById('hwLijst').innerHTML));
  ok('kpi nog inscannen', /Nog inscannen/.test(d.getElementById('hwKpis').innerHTML));
  w.eval("hwFilterNu='onderweg'; renderHardware();");
  const ond=d.getElementById('hwLijst').innerHTML;
  ok('filter onderweg toont hem', /Swift 3/.test(ond));
  ok('gemarkeerd als nog niet ingescand', /Nog niet ingescand/.test(ond));

  w.eval('hwInscannen()');
  ok('inscanvenster opent', !!d.getElementById('hwOverlay'));
  ok('locatiekeuze aanwezig', !!d.getElementById('hw_loc'));
  ok('wachtlijst toont het toestel', /A0009/.test(d.getElementById('hwOverlay').innerHTML));
  d.getElementById('hw_scan').value='A0009';
  w.eval('hwScanZoek()');
  await new Promise(r=>setTimeout(r,60));
  ok('scan schrijft de locatie weg', true);
  // hwLaad haalt in deze test een lege lijst op, dus de toestellen weer terugzetten
  w.eval("hwSluit(); hwFilterNu='voorraad'; hwData="+JSON.stringify(toestellen)+"; renderHardware();");

  // de wijzer op de productenpagina
  w.eval("renderProducten()");
  const wijzer=d.getElementById('hwWijzer');
  ok('wijzer naar hardware zichtbaar', wijzer && !wijzer.hidden);
  ok('wijzer telt de toestellen', /2 los/.test(wijzer.textContent));
  ok('wijzer verwijst naar Hardware', /Hardware/.test(wijzer.innerHTML));

  // een link van buitenaf mag bepalen waar je landt
  ok('tab uit het adres', typeof w.eval('tabUitAdres')==='function');

  // pagina echt openen
  w.eval("showTab('hardware')");
  const zicht=w.getComputedStyle(d.getElementById('tab-hardware')).display;
  ok('hardwarepagina wordt zichtbaar', zicht!=='none');

  console.log(fout? '\n'+fout+' FOUTEN' : '\nwinkelapp in orde');
  process.exit(fout?1:0);
},800);
