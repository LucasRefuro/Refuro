// De titel van een toestel: alleen de modelnaam ("iPhone 11").
//
// Bewaakt:
//   1. toestelTitel: het merk valt weg waar de modelnaam het al zegt, nooit dubbel, en een
//      laptop houdt zijn merk
//   2. dezelfde regel op alle drie de plekken (winkelapp, werkbank, webshopkoppeling)
//   3. de winkelapp: een leeg titelveld wordt bij opslaan de modelnaam, en de AI schrijft de
//      titel niet meer
//   4. de werkbank: Online zetten begint met de modelnaam, en Advertentie schrijven laat de
//      titel staan
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
  const T=(m,mo)=>w.eval(`toestelTitel(${JSON.stringify(m)}, ${JSON.stringify(mo)})`);
  ok('titel: iPhone zonder Apple', T('Apple','iPhone 11')==='iPhone 11');
  ok('titel: Galaxy zonder Samsung', T('Samsung','Galaxy S24')==='Galaxy S24');
  ok('titel: MacBook zonder Apple', T('Apple','MacBook Air M1')==='MacBook Air M1');
  ok('titel: laptop houdt zijn merk', T('Dell','Latitude 7420')==='Dell Latitude 7420' && T('HP','EliteBook 840 G6')==='HP EliteBook 840 G6');
  ok('titel: merk nooit dubbel', T('Apple','Apple iPhone 12 mini')==='iPhone 12 mini' && T('Dell','Dell Latitude 5430')==='Dell Latitude 5430');
  ok('titel: rommel in spaties weg', T(' Apple ','  iPhone   12  ')==='iPhone 12');
  ok('titel: zonder model het merk, zonder alles leeg', T('Lenovo','')==='Lenovo' && T('','')==='');
  ok('titel: lange modelnaam blijft heel', T('Apple','iPhone 13 Pro Max')==='iPhone 13 Pro Max');

  // Dezelfde regel op drie plekken: verander je er één, dan valt dit om.
  const regel=t=>(t.match(/EIGEN_NAAM\s*=\s*(\/[^\n]*\/i);/)||[])[1];
  const sh=fs.readFileSync(bron('supabase/functions/_gedeeld/shopify.ts'),'utf8');
  const rw=regel(fs.readFileSync(bron('app/index.html'),'utf8'));
  const rr=regel(fs.readFileSync(bron('refurbish/index.html'),'utf8'));
  const re=regel(sh);
  ok('regel: winkelapp, werkbank en webshop gelijk', !!rw && rw===rr && rr===re);
  const ts=fs.readFileSync(bron('supabase/functions/shopify/index.ts'),'utf8');
  ok('webshop: titel is de modelnaam, zoektitel en link de hele uitvoering',
    /toestelTitel\(rep\.merk, rep\.model\)/.test(ts) && /seo: \{ title: webshopZoektitel\(rep\) \}/.test(ts) && /webshopHandle\(rep\)/.test(ts));
  ok('webshop: altijd de modelnaam, nooit het titelveld van het toestel', !/rep\.titel|h\.titel/.test(ts) && /const titel = toestelTitel\(h\.merk, h\.model\)/.test(ts));
  ok('webshop: kleur gaat mee voor het label', /mfText\("kleur", kleur\)/.test(sh));

  // Het formulier: titel leeg laten geeft de modelnaam.
  w.eval("showTab('hardware'); hwVenster(null)");
  await wacht(30);
  const zet=(id,v)=>{ const e=d.getElementById(id); e.value=v; };
  zet('hw_cat','Telefoon'); zet('hw_merk','Apple'); zet('hw_model','iPhone 11');
  ok('formulier: lege titel wordt de modelnaam', w.eval('hwFormRij().titel')==='iPhone 11');
  zet('hw_titel','Mijn eigen titel');
  ok('formulier: een eigen titel blijft', w.eval('hwFormRij().titel')==='Mijn eigen titel');
  ok('formulier: uitleg onder het veld', /Op de webshop staat altijd de modelnaam/.test(d.getElementById('hw_titel').nextElementSibling.textContent));
  const schrijf=w.eval('hwTekstSchrijven.toString()');
  ok('AI: schrijft de titel niet meer', !/uit\.titel/.test(schrijf) && /toestelTitel/.test(schrijf));
  ok('kaartje: zelfde titel', w.eval("hwTelKaart({merk:'Apple', model:'iPhone 12', specs:{}}).titel")==='iPhone 12');
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
  ok('werkbank: dezelfde regel', r.eval("toestelTitel('Apple','iPhone 11')")==='iPhone 11' && r.eval("toestelTitel('Dell','Latitude 7420')")==='Dell Latitude 7420');
  r.eval(`apparaten.push({id:'p1', team_id:'t1', code:'A0101', merk:'Apple', model:'iPhone 11', categorie:'Telefoon', kleur:'Zwart',
    specs:{Opslag:'64 GB'}, grade:'A', accu:90, status:'klaar', checklist:[], defecten:[], goede_delen:[]})`);
  r.eval("onlineZetten('p1')");
  await wacht(80);
  ok('online zetten: begint met de modelnaam', r.eval('onl && onl.titel')==='iPhone 11' && r.document.getElementById('onl_titel').value==='iPhone 11');
  ok('online zetten: uitleg onder het veld', /Op de webshop staat altijd de modelnaam/.test(r.document.getElementById('onl_titel').nextElementSibling.textContent));
  // Advertentie schrijven: de AI geeft een titel terug, die gebruiken we niet.
  r.fetch=async()=>({ok:true, json:async()=>({ok:true, titel:'Apple iPhone 11 -,64GB', tekst:'Nette telefoon.', zoekwoorden:[]})});
  r.eval("sb.auth.getSession=async()=>({data:{session:{access_token:'x'}}})");
  await r.eval("onlSchrijf(null)");
  await wacht(20);
  ok('schrijven: tekst komt erin, titel blijft de modelnaam', r.eval('onl.tekst')==='Nette telefoon.' && r.eval('onl.titel')==='iPhone 11');
  ok('kaartje: zelfde titel', r.eval("telKaartRegels({merk:'Apple', model:'iPhone 12', specs:{}}, {}, {}).titel")==='iPhone 12');

  console.log(fout? '\n'+fout+' FOUTEN' : '\ntitel in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
