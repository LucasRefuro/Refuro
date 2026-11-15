// Inruilprijzen in de winkelapp (november 2026).
//
// De winkelier vult per model, opslag en staat in wat hij betaalt; de webshop leest dat via de
// Edge Function inruil-aanvraag. Bewaakt:
//   1. de pagina toont per soort de regels, gegroepeerd per merk, met grijs voor een voorstel
//   2. een bedrag aanpassen slaat alleen dat vakje op en maakt de regel nagekeken, zonder de
//      lijst opnieuw te tekenen (de cursor blijft staan); leeg wordt geen bedrag
//   3. duurder dan een betere staat krijgt een rood randje; Enter springt naar het volgende vakje
//   4. zoeken kijkt in alle soorten; Klopt maakt een voorstel nagekeken
//   5. model toevoegen: opslag "256 gb, 1tb" wordt twee regels; rare opslag wordt geweigerd
//   6. alleen eigenaar en beheerder komen erbij; de aanvraag toont staat, wat kapot is en
//      hoe de klant hem inlevert
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

const TABEL=`
window.__ip=[
  {id:'p1', team_id:'t1', soort:'telefoon', merk:'Apple iPhone', model:'iPhone 13', opslag:'128GB', prijs_nieuw:150, prijs_goed:140, prijs_gebruikt:100, prijs_kapot:70, prijs_dood:35, nagekeken:false, actief:true, volgorde:10},
  {id:'p2', team_id:'t1', soort:'telefoon', merk:'Apple iPhone', model:'iPhone 13', opslag:'256GB', prijs_nieuw:175, prijs_goed:165, prijs_gebruikt:120, prijs_kapot:80, prijs_dood:40, nagekeken:true, actief:true, volgorde:20},
  {id:'p3', team_id:'t1', soort:'telefoon', merk:'Samsung Galaxy', model:'Galaxy S24', opslag:'128GB', prijs_nieuw:255, prijs_goed:240, prijs_gebruikt:175, prijs_kapot:120, prijs_dood:60, nagekeken:false, actief:true, volgorde:30},
  {id:'p4', team_id:'t1', soort:'tablet', merk:'Apple iPad', model:'iPad (10e gen, 2022)', opslag:'64GB', prijs_nieuw:160, prijs_goed:150, prijs_gebruikt:110, prijs_kapot:75, prijs_dood:35, nagekeken:false, actief:true, volgorde:40}
];
window.__schrijf=[];
window.__ipTabel=function(){
  const api={select(){return api;}, order(){return api;}, limit(){return api;},
    update(r){ return {eq:(k,v)=>{ window.__schrijf.push(['update',r,v]); const x=window.__ip.find(y=>y.id===v); if(x) Object.assign(x,r); return Promise.resolve({error:null}); }}; },
    insert(rijen){ window.__schrijf.push(['insert',rijen]);
      const nieuw=rijen.map((r,i)=>Object.assign({id:'n'+(window.__ip.length+i), prijs_nieuw:null, prijs_goed:null, prijs_gebruikt:null, prijs_kapot:null, prijs_dood:null, actief:true}, r));
      window.__ip.push(...nieuw);
      return {select:()=>Promise.resolve({data:nieuw.map(r=>Object.assign({},r)), error:null})}; },
    delete(){ return {eq:(k,v)=>{ window.__schrijf.push(['delete',v]); window.__ip=window.__ip.filter(r=>r.id!==v); return Promise.resolve({error:null}); }}; },
    then(res){ res({data:window.__ip.map(r=>Object.assign({},r)), error:null}); }};
  return api;
};`;

(async()=>{
  const MOCK=`<script>
${TABEL}
function _tabel(naam){
  if(naam==='inruil_prijzen') return window.__ipTabel();
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},is(){return api;},ilike(){return api;},gte(){return api;},lte(){return api;},
    maybeSingle:async()=>({data:null}),
    insert(){ return {select:()=>({single:async()=>({data:{id:'x'}}), maybeSingle:async()=>({data:null})})}; },
    update(){ return api; }, delete(){return api;}, then(r){ r({data:[],error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:(n)=>_tabel(n),
  rpc:async()=>({data:[]}),
  storage:{from:()=>({upload:async()=>({error:null}), remove:async()=>({}), getPublicUrl:(p)=>({data:{publicUrl:p}})})},
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}),
  removeChannel(){}
})};
<\/script>`;
  const html=fs.readFileSync(bron('app/index.html'),'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
    .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
  const w=dom.window, d=w.document;
  const fouten=[]; w.onerror=m=>fouten.push(String(m));
  await wacht(800);
  ok('winkelapp start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));
  w.eval(`account={id:'e1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null};`);

  // ── 1. de pagina ──
  w.eval(`showTab('inruilprijzen')`);
  await wacht(30);
  const lijst=d.getElementById('iprLijst');
  ok('pagina: open en zichtbaar', !d.getElementById('tab-inruilprijzen').hidden);
  ok('pagina: alleen telefoons, per merk een kaart', lijst.querySelectorAll('tr[data-id]').length===3 && lijst.querySelectorAll('.card h2').length===2);
  ok('pagina: vijf vakjes per regel', lijst.querySelector('tr[data-id="p1"]').querySelectorAll('input[data-staat]').length===5);
  ok('pagina: voorstel is grijs, nagekeken niet', lijst.querySelector('tr[data-id="p1"]').classList.contains('ipr-voorstel') && !lijst.querySelector('tr[data-id="p2"]').classList.contains('ipr-voorstel'));
  ok('pagina: telling per soort', /1\/3/.test(d.getElementById('iprSoorten').textContent) && /0\/1/.test(d.getElementById('iprSoorten').textContent));
  ok('pagina: voortgang bovenaan', /1 van 4 nagekeken/.test(d.getElementById('iprVoortgang').textContent));
  ok('menu: Inruil licht op onder Verkoop', d.querySelector('#verkoopSub button[data-vsub="inruil"]').classList.contains('active'));

  // ── 2. een bedrag aanpassen ──
  const goed=lijst.querySelector('tr[data-id="p1"] input[data-staat="goed"]');
  goed.value='€ 145';
  goed.dispatchEvent(new w.Event('change',{bubbles:true}));
  await wacht(20);
  const upd=w.__schrijf.find(s=>s[0]==='update' && s[2]==='p1');
  ok('opslaan: alleen dat vakje, en nagekeken', !!upd && upd[1].prijs_goed===145 && upd[1].nagekeken===true && !('prijs_nieuw' in upd[1]));
  ok('opslaan: het getal netjes terug in het vakje', goed.value==='145');
  ok('opslaan: de lijst is niet opnieuw getekend', d.querySelector('#iprLijst tr[data-id="p1"] input[data-staat="goed"]')===goed);
  ok('opslaan: regel is niet meer grijs, Klopt wordt Nagekeken', !goed.closest('tr').classList.contains('ipr-voorstel') && /Nagekeken/.test(goed.closest('tr').querySelector('.ipr-acties').textContent));
  const dood=lijst.querySelector('tr[data-id="p1"] input[data-staat="dood"]');
  dood.value='';
  dood.dispatchEvent(new w.Event('change',{bubbles:true}));
  await wacht(20);
  ok('opslaan: leeg wordt geen bedrag', w.__ip.find(r=>r.id==='p1').prijs_dood===null);

  // ── 3. rood randje en Enter ──
  const kapot=lijst.querySelector('tr[data-id="p1"] input[data-staat="kapot"]');
  kapot.value='120';
  kapot.dispatchEvent(new w.Event('change',{bubbles:true}));
  await wacht(20);
  ok('controle: duurder dan Gebruikt krijgt een rood randje', kapot.classList.contains('ipr-raar'));
  kapot.value='60';
  kapot.dispatchEvent(new w.Event('change',{bubbles:true}));
  await wacht(20);
  ok('controle: weer goedkoper, randje weg', !kapot.classList.contains('ipr-raar'));
  kapot.focus();
  kapot.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter', bubbles:true}));
  ok('Enter: naar het volgende vakje', d.activeElement===dood);

  // ── 4. zoeken en Klopt ──
  d.getElementById('iprZoek').value='ipad';
  w.eval('iprZoekTyp()');
  await wacht(200);
  ok('zoeken: vindt een tablet terwijl Telefoon aan staat', !!d.querySelector('#iprLijst tr[data-id="p4"]') && !d.querySelector('#iprLijst tr[data-id="p1"]'));
  d.getElementById('iprZoek').value='';
  w.eval('iprZoekTyp()');
  await wacht(200);
  await w.eval(`iprKlopt('p3')`);
  ok('Klopt: voorstel wordt nagekeken', w.__ip.find(r=>r.id==='p3').nagekeken===true && !d.querySelector('#iprLijst tr[data-id="p3"]').classList.contains('ipr-voorstel'));

  // ── 5. model toevoegen ──
  w.eval('iprNieuwOpen()');
  ok('toevoegen: venster open, groep voorgevuld', !d.getElementById('iprNieuw').hidden && d.getElementById('iprNieuwMerk').value==='Apple iPhone');
  d.getElementById('iprNieuwModel').value='iPhone 18 Pro';
  d.getElementById('iprNieuwOpslag').value='groot';
  const voor=w.__schrijf.length;
  await w.eval('iprNieuwBewaar()');
  ok('toevoegen: rare opslag wordt geweigerd', w.__schrijf.length===voor);
  d.getElementById('iprNieuwOpslag').value='256 gb, 1tb';
  await w.eval('iprNieuwBewaar()');
  const ins=w.__schrijf.find(s=>s[0]==='insert');
  ok('toevoegen: twee regels, opslag netjes', !!ins && ins[1].length===2 && ins[1][0].opslag==='256GB' && ins[1][1].opslag==='1TB');
  ok('toevoegen: eigen winkel, soort en groep', !!ins && ins[1].every(r=>r.team_id==='t1' && r.soort==='telefoon' && r.merk==='Apple iPhone' && r.model==='iPhone 18 Pro'));
  ok('toevoegen: bovenaan de groep', !!ins && ins[1].every(r=>r.volgorde<10));
  const rijen=[...d.querySelectorAll('#iprLijst tr[data-id]')].map(tr=>tr.querySelector('.ipr-model').textContent);
  ok('toevoegen: staat in de lijst, venster dicht', rijen[0].includes('iPhone 18 Pro') && d.getElementById('iprNieuw').hidden);

  // ── 6. rechten en de aanvraag ──
  w.eval(`gebruiker={id:'e2', naam:'Mo', rol:'medewerker', tabs:null}`);
  ok('rechten: medewerker niet', w.eval(`mag('inruilprijzen')`)===false);
  w.eval(`gebruiker={id:'e3', naam:'Ali', rol:'beheerder', tabs:null}`);
  ok('rechten: beheerder wel', w.eval(`mag('inruilprijzen')`)===true);
  w.eval(`gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null}`);
  const aanvraag={id:'a1', toestel:'iPhone 13 · 128GB · Er is iets kapot', schatting:'€70', naam:'Sanne', telefoon:'0612', email:'s@x.nl',
    gezien:false, status:'nieuw', aangemaakt_op:new Date().toISOString(),
    ruwe_json:{soort:'telefoon', staat_naam:'Er is iets kapot', kapot:'Het scherm is gebarsten', inleveren:'winkel', uitbetaling:'contant'}};
  w.eval('inrData='+JSON.stringify([aanvraag])+'; renderInruil();');
  const det=d.getElementById('inrLijst').textContent;
  ok('aanvraag: staat, wat kapot is en hoe hij inlevert', /Er is iets kapot/.test(det) && /scherm is gebarsten/.test(det) && /Brengt hem langs/.test(det));
  ok('pagina: geen fouten onderweg', fouten.length===0);

  console.log(fout ? `\n${fout} fout(en) in inruilprijzen` : '\ninruilprijzen in orde');
  process.removeAllListeners('beforeExit');
  process.exit(fout?1:0);
})();
