// Een webshopbestelling met nieuwe accu (november 2026).
//
// Bewaakt:
//   1. de winkelapp: een bestelling met nieuwe accu toont groot "Nieuwe accu erin" met het
//      toestel, de accuregel vet met voor welk toestel; geannuleerd of zonder accu geen blok
//   2. de pop-up bij een nieuwe bestelling: verschijnt, met het accublok, en maar een keer
//   3. de werkbank: de reparatie zegt dat hij verkocht is, en Reparatie klaar print geen
//      voorraadsticker en zegt verzenden in plaats van op voorraad
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

/* Een nagebootste tabel model_vraagprijzen die echt filtert (ilike = gelijk, hoofdletters tellen
   niet) en schrijft. De opslag staat er genormaliseerd in, zoals de migratie hem vult. */
const VP_TABEL=`
window.__vp=[
  {id:'v1', team_id:'t1', merk:'Apple', model:'iPhone 12 mini', opslag:'128GB', grade:'A', prijs:239},
  {id:'v2', team_id:'t1', merk:'Apple', model:'iPhone 12 mini', opslag:'128GB', grade:'B', prijs:219},
  {id:'v3', team_id:'t1', merk:'Apple', model:'iPhone 12 mini', opslag:'64GB', grade:'A', prijs:209}
];
window.__vpSchrijf=[];
window.__vpTabel=function(){
  const f=[];
  const api={select(){return api;},
    ilike(k,v){ f.push(r=>String(r[k]).toLowerCase()===String(v).toLowerCase()); return api; },
    insert(r){ window.__vpSchrijf.push(['insert',r]); window.__vp.push(Object.assign({id:'n'+window.__vp.length}, r)); return Promise.resolve({error:null}); },
    update(r){ return {eq:(k,v)=>{ window.__vpSchrijf.push(['update',r,v]); const x=window.__vp.find(y=>y.id===v); if(x) Object.assign(x,r); return Promise.resolve({error:null}); }}; },
    then(res){ res({data:window.__vp.filter(r=>f.every(t=>t(r))).map(r=>Object.assign({},r)), error:null}); }};
  return api;
};`;

(async()=>{
  // ── 1. de winkelapp ──
  const MOCK=`<script>
${VP_TABEL}
function _leegVoor(naam){
  if(naam==='model_vraagprijzen') return window.__vpTabel();
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
  from:(n)=>_leegVoor(n),
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
  w.fetch=async()=>({ok:true, json:async()=>({ok:true})});
  w.eval(`account={id:'e1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null};`);
  const best={id:'b1', nummer:'#1041', klant:'Sanne', bedrag:284, gezien:false, geannuleerd:false, status:'betaald',
    geplaatst_op:new Date().toISOString(), nieuwe_accu:true,
    regels:[{titel:'iPhone 12', aantal:1, bedrag:239, sku:'apple_iphone-12_blauw_64-gb-A'},
            {titel:'Nieuwe accu voor je telefoon', aantal:1, bedrag:45, sku:'NIEUWE-ACCU-TELEFOON', accu:true, voor:'iPhone 12 Blauw 64 GB'}],
    toestellen:[{id:'h1', naam:'Apple iPhone 12', code:'A0108', nieuwe_accu:true}]};
  w.eval('bstData='+JSON.stringify([best])+'; renderBestellingen();');
  await wacht(20);
  const lijst=d.getElementById('bstLijst');
  ok('bestelling: groot blok Nieuwe accu erin', !!lijst && /Nieuwe accu erin/.test(lijst.textContent) && !!lijst.querySelector('.bstaccu'));
  ok('bestelling: zegt welk toestel en waar hij staat', /A0108/.test(lijst.querySelector('.bstaccu').textContent) && /Te repareren/.test(lijst.querySelector('.bstaccu').textContent));
  ok('bestelling: de accuregel vet, met voor welk toestel', !!lijst.querySelector('.bstregels .r.accu') && /voor iPhone 12 Blauw 64 GB/.test(lijst.querySelector('.bstregels .r.accu').textContent));
  w.eval('bstData[0].geannuleerd=true; renderBestellingen();');
  ok('bestelling: geannuleerd, dan geen accublok', !d.getElementById('bstLijst').querySelector('.bstaccu'));
  w.eval('bstData[0].geannuleerd=false; bstData[0].nieuwe_accu=false; renderBestellingen();');
  ok('bestelling: zonder accu geen blok', !d.getElementById('bstLijst').querySelector('.bstaccu'));

  // De pop-up: één keer per bestelling, met het accublok.
  w.__best=Object.assign({}, best);
  w.eval(`sb.from=(t)=>{ const api={select(){return api;},eq(){return api;},gte(){return api;},order(){return api;},
    limit(){ return Promise.resolve({data:t==='webshop_bestellingen'?[window.__best]:[], error:null}); }, then(r){ r({data:[],error:null}); }}; return api; };
    bstLaad=async()=>{}; document.getElementById('webshopLink').hidden=false; try{ localStorage.removeItem('storvo_bst_popup'); }catch(e){}`);
  await w.eval('bstPopupControle()');
  const pop=d.getElementById('bstPopup');
  ok('pop-up: verschijnt bij een nieuwe bestelling', !!pop && /Nieuwe bestelling #1041/.test(pop.textContent));
  ok('pop-up: met het accublok', !!pop && !!pop.querySelector('.bstaccu'));
  pop.querySelector('#bstPopDicht').click();
  await w.eval('bstPopupControle()');
  ok('pop-up: komt niet nog eens voor dezelfde bestelling', !d.getElementById('bstPopup'));
  ok('pop-up: elke minuut kijken en na het inloggen', /setTimeout\(bstPopupControle/.test(w.eval('webshopLink.toString()')));

  // ── 2. de werkbank ──
  const RMOCK=`<script>
${VP_TABEL}
window.__db={refurbish_apparaten:[], refurbish_onderdelen:[], refurbish_checklists:[], refurbish_orders:[], hardware_modellen:[],
  refurbish_instellingen:{team_id:'t1', accu_min:80, inscannen:false},
  hardware_locaties:[{id:'l1', team_id:'t1', naam:'Winkel', soort:'winkel', volgorde:0}], refurbish_fotos:[]};
function __tabel(naam){
  if(naam==='model_vraagprijzen') return window.__vpTabel();
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    or(){return api;}, in(){return api;}, ilike(){return api;}, not(){return api;}, is(){return api;},
    maybeSingle:async()=>({data:null}),
    insert(){ return {select:()=>({single:async()=>({data:{id:'h1'}, error:null}), then:(res)=>res({data:[{id:'h1'}], error:null})})}; },
    upsert(){ return api; }, update(){ return api; }, delete(){ return api; },
    then(res){ res({data: Array.isArray(window.__db[naam])?window.__db[naam]:[], error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:{id:'u1'}}})},
  from:(n)=>n==='accounts'
    ? {select(){return this;}, eq(){return this;}, maybeSingle:async()=>({data:{id:'u1', team_id:'t1', rol:'eigenaar', naam:'Lucas'}})}
    : __tabel(n),
  rpc:async()=>({data:[]}),
  storage:{from:()=>({upload:async()=>({error:null}), getPublicUrl:(p)=>({data:{publicUrl:p}}), remove:async()=>({})})},
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}), removeChannel(){}
})};
<\/script>`;
  const rhtml=fs.readFileSync(bron('refurbish/index.html'),'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, RMOCK)
    .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
  const rdom=new JSDOM(rhtml,{runScripts:'dangerously', url:'https://storvo.app/refurbish/', pretendToBeVisual:true});
  const r=rdom.window;
  const rfouten=[]; r.onerror=m=>rfouten.push(String(m));
  await wacht(900);
  ok('werkbank start zonder fout', rfouten.length===0);
  if(rfouten.length) console.log('   ', rfouten.slice(0,3).join(' | '));
  r.fetch=async()=>({ok:true, json:async()=>({ok:true})});
  r.eval("account=Object.assign(account||{}, {id:'u1', team_id:'t1'})");
  r.eval(`apparaten.push({id:'p1', team_id:'t1', code:'A0108', merk:'Apple', model:'iPhone 12', categorie:'Telefoon', kleur:'Blauw',
    specs:{Opslag:'64 GB'}, grade:'A', accu:88, status:'te_repareren', hardware_id:'h1', checklist:[], goede_delen:[],
    defecten:['Accu: nieuwe accu plaatsen, webshopbestelling #1041. Daarna verzenden.']});
    hardware=(typeof hardware!=='undefined' && Array.isArray(hardware)) ? hardware : [];`);
  const heeftHw=r.eval("typeof hardwareVan==='function'");
  ok('werkbank: hardwareVan bestaat', heeftHw);
  r.eval("hardwareVan=(a)=>a&&a.hardware_id==='h1'?{id:'h1', status:'verkocht'}:null");
  r.eval("repOpen(apparaten.find(a=>a.id==='p1'))");
  await wacht(60);
  ok('reparatie: zegt dat hij verkocht is en de klant wacht', /Verkocht via de webshop/.test(r.document.body.textContent));
  let geprint=0, melding='';
  r.eval("window.__print=0; qzPrintDeviceLabels=async()=>{ window.__print++; return true; }; allesLaden=async()=>{}; appPagina=()=>{};");
  r.eval("toast=(t)=>{ window.__toast=t; }");
  await r.eval("repKlaar(null,'p1')");
  await wacht(30);
  ok('klaar: verkocht toestel krijgt geen voorraadsticker', r.eval('window.__print')===0);
  ok('klaar: zegt nu verzenden, niet op voorraad', /verzenden/.test(r.eval('window.__toast')||'') && !/op voorraad/.test(r.eval('window.__toast')||''));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nwebshop-accu in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
