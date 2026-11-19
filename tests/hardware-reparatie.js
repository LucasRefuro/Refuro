// Toestellen in reparatie apart in Hardware (19 november 2026, wens eigenaar).
//
// Een toestel dat aan de werkbank op Te repareren staat, blijft in hardware op voorraad. Daardoor
// stond hij tussen de goede voorraad, die je kunt verkopen. Nu staat hij onder het kopje Reparaties.
//
// Bewaakt:
//   1. Op voorraad, de plekken en de cijfers tellen een toestel in reparatie niet mee
//   2. het kopje Reparaties toont precies die toestellen, met hun aantal op de knop
//   3. de lijst staat standaard op nieuwste eerst, op nummer (A0172 boven A0171)
//   4. een verkocht toestel komt niet onder Reparaties, ook als de werkbank-rij nog zo staat
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const MOCK=`<script>
window.__rijen={
  hardware:[
    {id:'h1', code:'A0101', merk:'Dell', model:'Latitude Goed', categorie:'Laptop', status:'voorraad', inkoop:100, verkoop:300, locatie_id:'w', aangemaakt_op:'2026-11-18T10:00:00Z', kanalen:{}},
    {id:'h2', code:'A0102', merk:'HP', model:'EliteBook Kapot', categorie:'Laptop', status:'voorraad', inkoop:80, verkoop:250, locatie_id:'w', aangemaakt_op:'2026-11-18T11:00:00Z', kanalen:{}},
    {id:'h3', code:'A0103', merk:'Apple', model:'iPhone Kapot', categorie:'Telefoon', status:'voorraad', inkoop:50, verkoop:200, locatie_id:'w', aangemaakt_op:'2026-11-18T12:00:00Z', kanalen:{}, specs:{Kleur:'Zwart', Opslag:'128 GB'}},
    {id:'h4', code:'A0104', merk:'Lenovo', model:'ThinkPad Verkocht', categorie:'Laptop', status:'verkocht', inkoop:90, verkoop:280, locatie_id:'w', aangemaakt_op:'2026-11-17T12:00:00Z', kanalen:{}}
  ],
  refurbish_apparaten:[{hardware_id:'h2'}, {hardware_id:'h3'}, {hardware_id:'h4'}, {hardware_id:null}],
  hardware_locaties:[{id:'w', naam:'Winkel', soort:'winkel', volgorde:1}]
};
function _tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},neq(){return api;},
    in(){return api;},is(){return api;},gte(){return api;},lte(){return api;},ilike(){return api;},
    maybeSingle:async()=>({data:null}),
    insert(){ const p=Promise.resolve({error:null}); p.select=()=>({single:async()=>({data:{id:'x'}}), maybeSingle:async()=>({data:null})}); return p; },
    update(){ return {eq:()=>Promise.resolve({error:null})}; }, delete(){return api;},
    then(r){ r({data:(window.__rijen[naam]||[]), error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:(n)=>_tabel(n), rpc:async()=>({data:[]}),
  storage:{from:()=>({upload:async()=>({error:null}), remove:async()=>({}), getPublicUrl:(p)=>({data:{publicUrl:p}})})},
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}), removeChannel(){}
})};
<\/script>`;
  const html=fs.readFileSync(bron('app/index.html'),'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
    .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
  const w=dom.window, d=w.document;
  w.scrollTo=()=>{};
  const fouten=[]; w.onerror=m=>fouten.push(String(m));
  await wacht(800);
  ok('winkelapp start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));
  w.fetch=async()=>({ok:true, json:async()=>({ok:true})});
  w.eval(`account={id:'e1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null};`);

  w.eval("showTab('hardware')");
  await w.eval('hwLaad(true)');
  await wacht(30);
  const lijst=()=>d.getElementById('hwLijst').textContent;
  const kpi=naam=>{ const k=[...d.querySelectorAll('#hwKpis .kpi')].find(x=>x.querySelector('.l').textContent===naam); return k ? k.querySelector('.v').textContent : null; };

  // ── 1. de goede voorraad ──
  ok('op voorraad: het goede toestel staat erin', /Latitude Goed/.test(lijst()));
  ok('op voorraad: toestellen in reparatie niet', !/EliteBook Kapot/.test(lijst()) && !/iPhone Kapot/.test(lijst()));
  ok('cijfers: op voorraad telt alleen de goede', kpi('Op voorraad')==='1');
  ok('cijfers: in reparatie staat apart', kpi('In reparatie')==='2');
  ok('cijfers: verkoopwaarde zonder de reparaties', /300/.test(kpi('Verkoopwaarde')) && !/750/.test(kpi('Verkoopwaarde')));
  const winkel=d.querySelector('#hwLocFilters button');
  ok('plek: de knop Winkel telt de reparaties niet mee', winkel && /Winkel\s*1$/.test(winkel.textContent.trim()));
  w.eval("hwKiesFilter('loc:w')");
  ok('plek: in de winkel staan de reparaties niet tussen de goede', /Latitude Goed/.test(lijst()) && !/Kapot/.test(lijst()));

  // ── 2. het kopje Reparaties ──
  const knop=d.querySelector('#hwFilter > button[data-f="reparatie"]');
  ok('kopje: de knop Reparaties staat er met het aantal', !!knop && /Reparaties/.test(knop.textContent) && d.getElementById('hwRepTel').textContent==='2' && !d.getElementById('hwRepTel').hidden);
  knop.click();
  ok('kopje: de knop is aangetikt', knop.classList.contains('active'));
  ok('kopje: de toestellen in reparatie staan erin', /EliteBook Kapot/.test(lijst()) && /iPhone Kapot/.test(lijst()));
  ok('kopje: de goede niet', !/Latitude Goed/.test(lijst()));

  // ── 3. de volgorde: nieuwste eerst, op nummer ──
  ok('volgorde: standaard nieuwste eerst op nummer', w.eval('hwSortNu')==='nummer' && /Nieuwste eerst, op nummer/.test(d.getElementById('hwSortKeuze').selectedOptions[0].textContent));
  ok('volgorde: het hoogste nummer bovenaan', lijst().indexOf('iPhone Kapot') < lijst().indexOf('EliteBook Kapot'));
  const volg=w.eval(`[{code:'A0099', aangemaakt_op:'2026-11-19'}, {code:'', aangemaakt_op:'2026-11-18'}, {code:'A0172', aangemaakt_op:'2026-11-01'}, {code:'A0100', aangemaakt_op:'2026-11-02'}, {code:null, aangemaakt_op:'2026-11-19'}]
    .sort(hwNummerCmp).map(h=>h.code||h.aangemaakt_op)`);
  ok('volgorde: op nummer en niet op datum, zonder nummer onderaan', JSON.stringify(volg)==='["A0172","A0100","A0099","2026-11-19","2026-11-18"]');

  // ── 4. verkocht ──
  ok('verkocht: komt niet onder Reparaties', !/ThinkPad Verkocht/.test(lijst()));
  w.eval("hwKiesFilter('verkocht')");
  ok('verkocht: staat gewoon bij Verkocht', /ThinkPad Verkocht/.test(lijst()));

  /* Niets in reparatie: de teller verdwijnt en het kopje zegt dat er niets is. */
  w.eval("window.__rijen.refurbish_apparaten=[]");
  await w.eval('hwLaad(true)');
  w.eval("hwKiesFilter('reparatie')");
  ok('leeg: geen teller en een duidelijke zin', d.getElementById('hwRepTel').hidden && /niets in reparatie/.test(lijst()));
  ok('leeg: geen cijfer In reparatie', kpi('In reparatie')===null);

  console.log(fout? '\n'+fout+' FOUTEN' : '\nhardware in reparatie in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
