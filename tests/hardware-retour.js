// Retour: een verkocht toestel terugnemen (20 november 2026, wens eigenaar).
//
// Een klant brengt een verkocht toestel terug. Het moet terug op voorraad kunnen, of als hij kapot
// is naar reparatie (aan de werkbank op Te repareren, en in Hardware onder Reparaties).
//
// Bewaakt:
//   1. de knop Retour staat bij een verkocht toestel, in de lijst en op de detailpagina
//   2. werkt goed: terug op voorraad, de verkoop uit de omzet, contant ook uit de kassa
//   3. kapot: terug, werkbank op Te repareren met de reden; zonder reden gebeurt er niets
//   4. geld niet terug: de verkoop blijft staan
//   5. dubbel tikken of een oud scherm boekt het geld niet twee keer terug
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  /* Een kleine nagebootste database: hardware en de werkbankrijen, met update/eq/select. */
  const MOCK=`<script>
window.__hw=[
  {id:'h1', code:'A0201', merk:'Apple', model:'iPhone 13', categorie:'Telefoon', status:'verkocht', verkocht_via:'winkel', verkocht_betaal:'cash', verkocht_op:'2026-11-12T10:00:00Z', inkoop:200, verkoop:400, aangemaakt_op:'2026-11-01T10:00:00Z', kanalen:{}},
  {id:'h2', code:'A0202', merk:'Apple', model:'iPhone 12', categorie:'Telefoon', status:'verkocht', verkocht_via:'webshop', verkocht_op:'2026-11-14T10:00:00Z', inkoop:150, verkoop:300, aangemaakt_op:'2026-11-02T10:00:00Z', kanalen:{}},
  {id:'h3', code:'A0203', merk:'Dell', model:'Latitude 5410', categorie:'Laptop', status:'verkocht', verkocht_via:'winkel', verkocht_betaal:'pin', verkocht_op:'2026-11-15T10:00:00Z', inkoop:100, verkoop:350, aangemaakt_op:'2026-11-03T10:00:00Z', kanalen:{}},
  {id:'h4', code:'A0204', merk:'HP', model:'EliteBook 840', categorie:'Laptop', status:'voorraad', inkoop:90, verkoop:299, aangemaakt_op:'2026-11-04T10:00:00Z', kanalen:{}}
];
window.__ap={
  h1:{id:'a1', hardware_id:'h1', status:'klaar', defecten:[]},
  h2:{id:'a2', hardware_id:'h2', status:'te_repareren', defecten:['Accu: nieuwe accu plaatsen, webshopbestelling #1001. Daarna verzenden.']},
  h3:{id:'a3', hardware_id:'h3', status:'klaar', defecten:[]}
};
window.__rpc=[];
const kopie=x=>JSON.parse(JSON.stringify(x));
function _tabel(naam){
  let upd=null; const f={};
  const api={select(){return api;},order(){return api;},limit(){return api;},neq(){return api;},
    eq(k,v){ f[k]=v; return api; },
    in(){return api;},is(){return api;},gte(){return api;},lte(){return api;},ilike(){return api;},
    update(r){ upd=r; return api; }, delete(){return api;},
    insert(){ const p=Promise.resolve({error:null}); p.select=()=>({single:async()=>({data:{id:'x'}}), maybeSingle:async()=>({data:null})}); return p; },
    maybeSingle:async()=>({data: naam==='refurbish_apparaten' ? kopie(window.__ap[f.hardware_id]||null) : null}),
    then(res){
      if(upd && naam==='hardware'){
        const h=window.__hw.find(x=>x.id===f.id && (!f.status || x.status===f.status));
        if(h) Object.assign(h, upd);
        return res({data: h?[{id:h.id}]:[], error:null});
      }
      if(upd && naam==='refurbish_apparaten'){
        const a=Object.values(window.__ap).find(x=>x.id===f.id); if(a) Object.assign(a, upd);
        return res({data:null, error:null});
      }
      if(upd) return res({data:null, error:null});
      if(naam==='hardware') return res({data:kopie(window.__hw), error:null});
      if(naam==='refurbish_apparaten') return res({data:Object.values(window.__ap).filter(a=>!f.status || a.status===f.status).map(kopie), error:null});
      res({data:[], error:null});
    }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:(n)=>_tabel(n), rpc:async(n)=>{ window.__rpc.push(n); return {data:0}; },
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
  w.eval(`account={id:'e1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null};
    state.verkopen=[
      {id:'v1', t:Date.now()-7*864e5, naam:'Apple iPhone 13', verkoop:400, inkoop:200, aantal:1, betaal:'cash', hardware:'h1'},
      {id:'v3', t:Date.now()-5*864e5, naam:'Dell Latitude 5410', verkoop:350, inkoop:100, aantal:1, betaal:'pin', hardware:'h3'},
      {id:'v9', t:Date.now(), naam:'Hoesje', verkoop:15, inkoop:3, aantal:1, betaal:'pin'}];`);
  const hw=id=>w.eval(`window.__hw.find(x=>x.id==='${id}')`);
  const verkoopIds=()=>w.eval('state.verkopen.map(v=>v.id).join(",")');

  w.eval("showTab('hardware')");
  await w.eval('hwLaad(true)');

  // ── 1. de knop ──
  w.eval("hwKiesFilter('verkocht')");
  const lijst=d.getElementById('hwLijst').innerHTML;
  ok('lijst: een verkocht toestel heeft een knop Retour', /hwRetour\('h1'\)/.test(lijst) && /hwRetour\('h2'\)/.test(lijst));
  w.eval("hwKiesFilter('voorraad')");
  ok('lijst: een toestel op voorraad niet', !/hwRetour\('h4'\)/.test(d.getElementById('hwLijst').innerHTML));
  w.eval("hwVenster(hwData.find(x=>x.id==='h1'))");
  await wacht(30);
  ok('detail: een verkocht toestel heeft Retour als hoofdknop', /btn actie" onclick="hwRetour\('h1'\)"/.test(d.getElementById('hwDetail').innerHTML));
  w.eval("hwSluit()");
  await wacht(50);

  // ── 2. werkt goed, contant ──
  const kasVoor=w.eval('kasSaldo()');
  w.eval("hwRetour('h1')");
  const geld=d.getElementById('hw_retour_geld');
  ok('venster: de vraag en het geld staan erin', !!geld && geld.checked && /400/.test(geld.parentNode.textContent) && /uit de kassa/.test(geld.parentNode.textContent) && /Werkt hij nog goed/.test(d.getElementById('hwOverlay').textContent));
  await w.eval("hwRetourDoe('h1', false)");
  ok('goed: terug op voorraad', hw('h1').status==='voorraad' && hw('h1').verkocht_op===null && hw('h1').verkocht_via===null);
  ok('goed: de verkoop is uit de omzet', verkoopIds()==='v3,v9');
  ok('goed: het geld is uit de kassa', Math.round((kasVoor-w.eval('kasSaldo()'))*100)===40000);
  ok('goed: de werkbankrij blijft klaar', w.eval("window.__ap.h1.status")==='klaar');
  ok('goed: het venster is dicht', !d.getElementById('hwOverlay'));

  // ── 5. dubbel: een oud scherm denkt dat hij nog verkocht is ──
  w.eval("state.verkopen.unshift({id:'v1b', t:Date.now(), naam:'Apple iPhone 13', verkoop:400, inkoop:200, aantal:1, betaal:'cash', hardware:'h1'}); hwData.find(x=>x.id==='h1').status='verkocht';");
  const kasMid=w.eval('kasSaldo()');
  w.eval("hwRetour('h1')");
  await w.eval("hwRetourDoe('h1', false)");
  ok('dubbel: geen tweede keer geld terug', verkoopIds()==='v1b,v3,v9' && w.eval('kasSaldo()')===kasMid);
  w.eval("state.verkopen=state.verkopen.filter(v=>v.id!=='v1b')");

  // ── 3. kapot, via de webshop ──
  w.eval("hwRetour('h2')");
  ok('webshop: geen geld-vinkje, wel de zin over Shopify', !d.getElementById('hw_retour_geld') && /terug in Shopify/.test(d.getElementById('hwOverlay').textContent));
  w.eval("hwRetourKapot()");
  ok('kapot: de vraag Wat is er kapot verschijnt', !d.getElementById('hw_retour_kapot').hidden && d.getElementById('hw_retour_vraag').hidden);
  await w.eval("hwRetourDoe('h2', true)");
  ok('kapot: zonder reden gebeurt er niets', hw('h2').status==='verkocht');
  d.getElementById('hw_retour_defect').value='Scherm flikkert';
  await w.eval("hwRetourDoe('h2', true)");
  ok('kapot: terug van verkocht', hw('h2').status==='voorraad');
  ok('kapot: aan de werkbank op Te repareren met de reden', w.eval("window.__ap.h2.status")==='te_repareren' && w.eval("window.__ap.h2.defecten.includes('Retour: Scherm flikkert')"));
  ok('kapot: oude werkbankrijen eerst gekoppeld', w.eval("window.__rpc.includes('koppel_losse_hardware')"));
  ok('kapot: staat in Hardware onder Reparaties', w.eval("hwInReparatie.has('h2')"));

  // ── 4. geld niet terug ──
  w.eval("hwRetour('h3')");
  d.getElementById('hw_retour_geld').checked=false;
  await w.eval("hwRetourDoe('h3', false)");
  ok('geen geld terug: wel terug op voorraad', hw('h3').status==='voorraad');
  ok('geen geld terug: de verkoop blijft staan', verkoopIds()==='v3,v9');

  console.log(fout? '\n'+fout+' FOUTEN' : '\nretour in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
