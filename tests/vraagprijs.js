// De vraagprijs per model, opslag en grade (model_vraagprijzen).
//
// Bewaakt:
//   1. de winkelapp: vraagprijsVan vindt de prijs van model, opslag en grade (kleur telt niet),
//      onthouden alleen als het iets nieuws is, en het formulier vult hem bij een nieuw toestel
//      zonder wat je zelf typte te overschrijven; een andere grade geeft een andere prijs
//   2. de werkbank: Online zetten vult de vraagprijs van een toestel in een andere kleur, en
//      publiceren en grade-prijzen opslaan onthouden hem
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
  w.eval(`account={id:'e1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null};
    hwModellen=[{merk:'Apple', model:'iPhone 12 mini', kleuren:['Zwart','Wit'], opslag:['64 GB','128 GB','256 GB'], toon:true}];`);

  ok('van: model, opslag en grade geven de prijs', JSON.stringify(await w.eval("vraagprijsVan('Apple','iPhone 12 mini','128 GB','A')"))==='{"prijs":239}');
  ok('van: andere grade, andere prijs', (await w.eval("vraagprijsVan('apple','iphone 12 mini','128GB','b')")).prijs===219);
  ok('van: andere opslag, andere prijs', (await w.eval("vraagprijsVan('Apple','iPhone 12 mini','64 GB','A')")).prijs===209);
  ok('van: niet onthouden is niets', await w.eval("vraagprijsVan('Apple','iPhone 12 mini','256 GB','A')")===null);
  ok('van: zonder opslag of grade niets', await w.eval("vraagprijsVan('Apple','iPhone 12 mini','','A')")===null && await w.eval("vraagprijsVan('Apple','iPhone 12 mini','128 GB','')")===null);

  ok('onthoud: zelfde prijs schrijft niets', await w.eval("vraagprijsOnthoud('Apple','iPhone 12 mini','128 GB','A',239)")===false && w.__vpSchrijf.length===0);
  ok('onthoud: nieuwe prijs werkt de oude bij, geen tweede rij', await w.eval("vraagprijsOnthoud('Apple','iPhone 12 mini','128 GB','A',229)")===true &&
    w.__vpSchrijf.length===1 && w.__vpSchrijf[0][0]==='update' && w.__vp.filter(r=>r.opslag==='128GB' && r.grade==='A').length===1);
  ok('van: daarna de nieuwe prijs', (await w.eval("vraagprijsVan('Apple','iPhone 12 mini','128 GB','A')")).prijs===229);
  ok('onthoud: een nieuwe opslag wordt een nieuwe rij voor deze winkel', await w.eval("vraagprijsOnthoud('Apple','iPhone 12 mini','256 GB','A',279)")===true &&
    w.__vpSchrijf[1][0]==='insert' && w.__vpSchrijf[1][1].team_id==='t1' && w.__vpSchrijf[1][1].opslag==='256GB' && w.__vpSchrijf[1][1].grade==='A' && w.__vpSchrijf[1][1].prijs===279);
  ok('onthoud: zonder grade of prijs niets', await w.eval("vraagprijsOnthoud('Apple','iPhone 12 mini','128 GB','',100)")===false &&
    await w.eval("vraagprijsOnthoud('Apple','iPhone 12 mini','128 GB','A',0)")===false && w.__vpSchrijf.length===2);
  // Terug naar het begin voor het formulier.
  w.eval(`window.__vp=window.__vp.filter(r=>r.id[0]==='v'); window.__vp.find(r=>r.id==='v1').prijs=239;
    for(const k in _vpCache) delete _vpCache[k]; window.__vpSchrijf.length=0;`);

  // Het formulier: een nieuwe telefoon, in een kleur die nog nooit verkocht is.
  w.eval("showTab('hardware'); hwVenster(null)");
  await wacht(30);
  const zet=(id,v)=>{ const e=d.getElementById(id); e.value=v; };
  const vp=d.getElementById('hw_verkoop');
  ok('formulier: veld en uitleg staan er', !!vp && !!d.getElementById('hw_verkoop_bron'));
  zet('hw_cat','Telefoon'); zet('hw_merk','Apple'); zet('hw_model','iPhone 12 mini'); zet('hw_kleur','Wit'); zet('hw_opslag','128 GB'); zet('hw_staat','A');
  await w.eval('hwVraagprijsVul()');
  ok('formulier: model, opslag en grade gekozen, vraagprijs staat er (kleur telt niet)', vp.value==='239' && vp.dataset.auto==='1');
  ok('formulier: zegt waar hij vandaan komt', /vorige keer/.test(d.getElementById('hw_verkoop_bron').textContent));
  zet('hw_staat','B');
  await w.eval('hwVraagprijsVul()');
  ok('formulier: andere grade, prijs gaat mee', vp.value==='219');
  zet('hw_opslag','256 GB');
  await w.eval('hwVraagprijsVul()');
  ok('formulier: niets onthouden, ons getal gaat weg', vp.value==='' && !vp.dataset.auto);
  // Zelf typen: blijft staan, en wordt onthouden.
  vp.value='269'; vp.dispatchEvent(new w.Event('input'));
  await w.eval('hwVraagprijsBewaar()');
  ok('formulier: zelf getypt wordt onthouden met opslag en grade', w.__vpSchrijf.length===1 && w.__vpSchrijf[0][0]==='insert' &&
    w.__vpSchrijf[0][1].prijs===269 && w.__vpSchrijf[0][1].opslag==='256GB' && w.__vpSchrijf[0][1].grade==='B' && w.__vpSchrijf[0][1].model==='iPhone 12 mini');
  ok('formulier: en zegt dat', /Onthouden/.test(d.getElementById('hw_verkoop_bron').textContent));
  zet('hw_opslag','128 GB');
  await w.eval('hwVraagprijsVul()');
  ok('formulier: wat je typte overschrijven we niet', vp.value==='269');
  // Een laptop: niets.
  vp.value=''; delete vp.dataset.auto;
  zet('hw_cat','Laptop');
  ok('formulier: een laptop krijgt geen vraagprijs per opslag', await w.eval('hwVraagprijsVul()')===null && vp.value==='');
  ok('formulier: velden roepen de functies aan', /hwVraagprijsGetypt\(this\)/.test(vp.getAttribute('oninput')) && /hwVraagprijsBewaar\(\)/.test(vp.getAttribute('onchange'))
    && /hwVraagprijsVul\(\)/.test(d.getElementById('hw_staat').getAttribute('onchange')) && /hwVraagprijsVul\(\)/.test(d.getElementById('hw_opslag').getAttribute('onchange')));
  ok('formulier: opslag kiezen vult de vraagprijs', /hwVraagprijsVul\(\)/.test(w.eval('hwOpslagKies.toString()')) && /hwVraagprijsVul\(\)/.test(w.eval('hwOpslagLaden.toString()')));
  w.eval('hwSluit()');
  // Een bestaand toestel met een eigen prijs: niet aankomen.
  w.eval(`hwData=[{id:'h1', merk:'Apple', model:'iPhone 12 mini', categorie:'Telefoon', staat:'A', verkoop:199, specs:{Kleur:'Zwart', Opslag:'128 GB'}, fotos:[], kanalen:{}, status:'voorraad'}];
    hwVenster(hwData[0]); hwStilPlan=()=>{ window.__plan=(window.__plan||0)+1; };`);
  await wacht(30);
  await w.eval('hwVraagprijsVul()');
  ok('bestaand: een eigen vraagprijs blijft staan', d.getElementById('hw_verkoop').value==='199' && !w.__plan);
  w.eval('hwSluit()');

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
  // Een witte iPhone 12 mini: de zwarte was eerder online gezet voor 239 (grade A).
  r.eval(`apparaten.push({id:'p1', team_id:'t1', code:'A0101', merk:'Apple', model:'iPhone 12 mini', categorie:'Telefoon', kleur:'Wit',
    specs:{Opslag:'128 GB'}, grade:'A', accu:90, status:'klaar', checklist:[], defecten:[], goede_delen:[]})`);
  r.eval("onlineZetten('p1')");
  await wacht(80);
  ok('online zetten: vraagprijs van hetzelfde model in een andere kleur', r.eval('onl && onl.prijs')===239 && /vorige keer/.test(r.eval('onl.prijsBron')||''));
  ok('online zetten: publiceren onthoudt de vraagprijs', /vraagprijsOnthoud\(a\.merk, a\.model, opslagVan\(a\), onl\.staat\|\|a\.grade, onl\.prijs\)/.test(r.eval('onlPubliceren.toString()')));
  ok('online zetten: grade-prijzen opslaan onthoudt ze per grade', /vraagprijsOnthoud\(onl\.a\.merk, onl\.a\.model, opslagVan\(onl\.a\), g, gp\[g\]\)/.test(r.eval('gradePrijsOpslaan.toString()')));
  ok('werkbank: onthouden schrijft opslag en grade', await r.eval("vraagprijsOnthoud('Apple','iPhone 12 mini','128 GB','C',189)")===true &&
    r.__vpSchrijf.length===1 && r.__vpSchrijf[0][1].opslag==='128GB' && r.__vpSchrijf[0][1].grade==='C' && r.__vpSchrijf[0][1].team_id==='t1');
  // Een laptop: de advertentie doet dat al, hier niets.
  ok('werkbank: een laptop telt niet', r.eval("vpTelt({categorie:'Laptop'})")===false && r.eval("vpTelt({categorie:'Tablet'})")===true);

  console.log(fout? '\n'+fout+' FOUTEN' : '\nvraagprijs in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
