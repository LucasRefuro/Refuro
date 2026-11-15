// De vraagprijs per model, opslag en grade (model_vraagprijzen).
//
// Bewaakt:
//   1. de winkelapp: vraagprijsVan vindt de prijs van model, opslag en grade (kleur telt niet),
//      onthouden alleen als het iets nieuws is, en het formulier vult hem bij een nieuw toestel
//      zonder wat je zelf typte te overschrijven; een andere grade geeft een andere prijs
//   2. een laptop of desktop: per uitvoering (processor, geheugen, opslag) en grade, in dezelfde
//      tabel met de kolom uitvoering; zonder volledige uitvoering niets
//   3. de werkbank: Online zetten vult de vraagprijs van een toestel in een andere kleur of van
//      een laptop met dezelfde uitvoering, en publiceren en grade-prijzen opslaan onthouden hem;
//      de sleutel van een uitvoering is in beide apps precies dezelfde
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
  {id:'v3', team_id:'t1', merk:'Apple', model:'iPhone 12 mini', opslag:'64GB', grade:'A', prijs:209},
  {id:'v4', team_id:'t1', merk:'Dell', model:'Latitude 3410', opslag:'256GB', grade:'B', uitvoering:'i5 10210u|8GB|256GB', prijs:340},
  {id:'v5', team_id:'t1', merk:'Dell', model:'Latitude 3410', opslag:'256GB', grade:'B', uitvoering:'i5 10210u|16GB|256GB', prijs:375}
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
  ok('van: een laptop per uitvoering', (await w.eval("vraagprijsVan('Dell','Latitude 3410','256 GB SSD','B','i5 10210u|8GB|256GB')")).prijs===340
    && (await w.eval("vraagprijsVan('dell','latitude 3410','256GB','B','i5 10210u|16GB|256GB')")).prijs===375);
  ok('van: een laptopprijs is nooit een prijs per opslag', await w.eval("vraagprijsVan('Dell','Latitude 3410','256 GB','B')")===null);

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
  // Een laptop: per uitvoering en grade.
  vp.value=''; delete vp.dataset.auto;
  zet('hw_cat','Laptop'); zet('hw_merk','Dell'); zet('hw_model','Latitude 3410'); zet('hw_staat','B');
  ok('laptop: zonder uitvoering nog niets', await w.eval('hwVraagprijsVul()')===null && vp.value==='');
  zet('hw_sp_cpu','Intel Core i5-10210U'); zet('hw_sp_ram','8 GB'); zet('hw_sp_ssd','256 GB SSD');
  await w.eval('hwVraagprijsVul()');
  ok('laptop: deze uitvoering en grade, vraagprijs staat er', vp.value==='340' && vp.dataset.auto==='1' && /vorige keer/.test(d.getElementById('hw_verkoop_bron').textContent));
  zet('hw_sp_ram','16 GB');
  await w.eval('hwVraagprijsVul()');
  ok('laptop: meer geheugen, andere prijs', vp.value==='375');
  zet('hw_staat','A');
  await w.eval('hwVraagprijsVul()');
  ok('laptop: andere grade, niets onthouden, ons getal gaat weg', vp.value==='' && !vp.dataset.auto);
  vp.value='420'; vp.dispatchEvent(new w.Event('input'));
  const lapVoor=w.__vpSchrijf.length;
  await w.eval('hwVraagprijsBewaar()');
  const lapIns=w.__vpSchrijf[lapVoor];
  ok('laptop: zelf getypt wordt onthouden voor deze uitvoering en grade', w.__vpSchrijf.length===lapVoor+1 && lapIns[0]==='insert' && lapIns[1].uitvoering==='i5 10210u|16GB|256GB'
    && lapIns[1].opslag==='256GB' && lapIns[1].grade==='A' && lapIns[1].prijs===420 && lapIns[1].model==='Latitude 3410');
  ok('laptop: en zegt dat', /deze uitvoering/.test(d.getElementById('hw_verkoop_bron').textContent));
  ok('laptop: de specvelden vullen de vraagprijs', /hwVraagprijsVul\(\)/.test(d.getElementById('hw_sp_cpu').getAttribute('onchange'))
    && /hwVraagprijsVul\(\)/.test(w.eval('hwLapOptiesLaden.toString()')));
  vp.value=''; delete vp.dataset.auto;
  zet('hw_cat','Monitor');
  ok('monitor: geen vraagprijs onthouden', await w.eval('hwVraagprijsVul()')===null && vp.value==='');
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
  ok('online zetten: publiceren onthoudt de vraagprijs', /const vs=vpSleutel\(a\)/.test(r.eval('onlPubliceren.toString()'))
    && /vraagprijsOnthoud\(a\.merk, a\.model, vs\.opslag, onl\.staat\|\|a\.grade, onl\.prijs, vs\.uitvoering\)/.test(r.eval('onlPubliceren.toString()')));
  ok('online zetten: grade-prijzen opslaan onthoudt ze per grade', /const vs=vpSleutel\(onl\.a\)/.test(r.eval('gradePrijsOpslaan.toString()'))
    && /vraagprijsOnthoud\(onl\.a\.merk, onl\.a\.model, vs\.opslag, g, gp\[g\], vs\.uitvoering\)/.test(r.eval('gradePrijsOpslaan.toString()')));
  ok('werkbank: onthouden schrijft opslag en grade', await r.eval("vraagprijsOnthoud('Apple','iPhone 12 mini','128 GB','C',189)")===true &&
    r.__vpSchrijf.length===1 && r.__vpSchrijf[0][1].opslag==='128GB' && r.__vpSchrijf[0][1].grade==='C' && r.__vpSchrijf[0][1].team_id==='t1');
  // Een laptop: per uitvoering, uit de specs van de werkbank.
  ok('werkbank: een laptop zonder specs telt niet, een monitor nooit', r.eval("vpTelt({categorie:'Laptop'})")===false && r.eval("vpTelt({categorie:'Monitor', specs:{Opslag:'256 GB'}})")===false
    && r.eval("vpTelt({categorie:'Tablet'})")===true);
  ok('werkbank: een laptop met processor, geheugen en opslag wel', JSON.stringify(r.eval("vpSleutel({categorie:'Laptop', specs:{Processor:'Intel Core i5-10210U', Geheugen:'8 GB', Opslag:'256 GB SSD'}})"))
    ==='{"opslag":"256 GB SSD","uitvoering":"i5 10210u|8GB|256GB"}');
  ok('werkbank: een MacBook met chip en werkgeheugen ook', r.eval("vpSleutel({categorie:'Laptop', specs:{Chip:'Apple M1', Werkgeheugen:'8 GB', Opslag:'256 GB'}}).uitvoering")==='m1|8GB|256GB');
  const proeven=[['Intel® Core™ i7-1365U vPro','32 GB DDR5','1 TB PCIe NVMe SSD'],['AMD Ryzen 7 PRO 7840U','64 GB','2 TB'],['Apple M3 Pro','18 GB','512 GB'],
    ['Intel(R) Core(TM) i5-8350U CPU @ 1.70GHz','8,0 GB','256 GB'],['i5-8350U','8 GB','256 GB SSD'],['','16 GB','512 GB']];
  ok('sleutel: werkbank en winkelapp rekenen precies hetzelfde', proeven.every(([p,g,o])=>{
    const sp=JSON.stringify({Processor:p, Geheugen:g, Opslag:o});
    return r.eval(`nwlSleutel(${sp})`)===w.eval(`nwlSleutel(${sp})`);
  }));
  r.eval(`apparaten.push({id:'p2', team_id:'t1', code:'A0102', merk:'Dell', model:'Latitude 3410', categorie:'Laptop',
    specs:{Processor:'Intel Core i5-10210U', Geheugen:'8 GB', Opslag:'256 GB SSD'}, grade:'B', accu:88, status:'klaar', checklist:[], defecten:[], goede_delen:[]})`);
  r.eval("onlineZetten('p2')");
  await wacht(80);
  ok('online zetten: een laptop krijgt de vraagprijs van deze uitvoering', r.eval('onl && onl.prijs')===340 && /deze uitvoering/.test(r.eval('onl.prijsBron')||''));
  ok('werkbank: een laptop onthouden schrijft de uitvoering', await r.eval("vraagprijsOnthoud('Dell','Latitude 3410','256 GB SSD','A',389,'i5 10210u|8GB|256GB')")===true &&
    r.__vpSchrijf.length===2 && r.__vpSchrijf[1][1].uitvoering==='i5 10210u|8GB|256GB' && r.__vpSchrijf[1][1].opslag==='256GB' && r.__vpSchrijf[1][1].grade==='A');

  console.log(fout? '\n'+fout+' FOUTEN' : '\nvraagprijs in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
