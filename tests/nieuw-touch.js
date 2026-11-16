// Nieuwe producten (staat N) en touch-laptops (november 2026, wens eigenaar).
//
// Bewaakt:
//   1. de webshopsleutel: werkbank en edge rekenen hem precies gelijk, touch en nieuw krijgen
//      een eigen advertentie (anders komen ze op die van de gewone uitvoering terecht)
//   2. de edge: een nieuw product krijgt één variant "Nieuw", de tag nieuw, geen grade-prijzen,
//      geen nieuwprijs-vergelijking en geen accu
//   3. de winkelapp: staat Nieuw laat de accu verdwijnen, de knop Touchscreen zet de spec en
//      de vraagprijs onthoudt touch als eigen uitvoering
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

/* Een functie uit een bronbestand halen (op de accolades) en de TypeScript-types eraf. */
function haal(tekst, naam){
  const begin=tekst.indexOf('function '+naam+'(');
  if(begin<0) throw new Error('niet gevonden: '+naam);
  let d=0;
  for(let i=tekst.indexOf('{', begin); i<tekst.length; i++){
    if(tekst[i]==='{') d++;
    else if(tekst[i]==='}'){ d--; if(!d) return tekst.slice(begin, i+1); }
  }
}
const zonderTypes=t=>t.replace(/export /g,'').replace(/: (any|unknown|string)(\[\])?/g,'').replace(/: any\[\]/g,'');

(async()=>{
  const sh=fs.readFileSync(bron('supabase/functions/_gedeeld/shopify.ts'),'utf8');
  const idx=fs.readFileSync(bron('supabase/functions/shopify/index.ts'),'utf8');
  const rb=fs.readFileSync(bron('refurbish/index.html'),'utf8');

  // ── 1. de sleutel ──
  const edge=new Function(zonderTypes(haal(sh,'isNieuw')+haal(sh,'heeftTouch')+haal(sh,'webshopSleutel'))+'; return webshopSleutel;')();
  const werkbank=new Function(haal(rb,'webshopSleutel')+'; return webshopSleutel;')();
  const proeven=[
    {merk:'Dell', model:'Latitude 3410', categorie:'Laptop', staat:'B', grade:'B', specs:{Processor:'Intel Core i5-10210U', Geheugen:'16 GB', Opslag:'256 GB SSD', Touchscreen:'ja'}},
    {merk:'Dell', model:'Latitude 3410', categorie:'Laptop', staat:'B', grade:'B', specs:{Processor:'Intel Core i5-10210U', Geheugen:'16 GB', Opslag:'256 GB SSD'}},
    {merk:'Apple', model:'iPhone 17', categorie:'Telefoon', staat:'N', grade:'N', specs:{Kleur:'Zwart', Opslag:'256 GB'}},
    {merk:'Apple', model:'iPhone 17', categorie:'Telefoon', staat:'A', grade:'A', specs:{Kleur:'Zwart', Opslag:'256 GB'}},
    {merk:'HP', model:'EliteBook 840 G8', categorie:'Laptop', staat:'N', grade:'N', specs:{Processor:'i5-1145G7', Geheugen:'16 GB', Opslag:'512 GB', Touchscreen:'Ja'}}
  ];
  ok('sleutel: werkbank en edge precies gelijk', proeven.every(p=>edge(p)===werkbank(p)));
  ok('sleutel: touch is een eigen advertentie', edge(proeven[0])==='dell_latitude-3410_intel-core-i5-10210u_16-gb_256-gb-ssd_touch' && edge(proeven[0])!==edge(proeven[1]));
  ok('sleutel: nieuw is een eigen advertentie', edge(proeven[2])==='apple_iphone-17_zwart_256-gb_nieuw' && edge(proeven[2])!==edge(proeven[3]));
  ok('sleutel: gewone uitvoering blijft zoals hij was', edge(proeven[1])==='dell_latitude-3410_intel-core-i5-10210u_16-gb_256-gb-ssd' && edge(proeven[3])==='apple_iphone-17_zwart_256-gb');

  // ── 2. de edge ──
  ok('edge: staat N heet "nieuw" en "Nieuw"', /s === "N" \? "nieuw"/.test(sh) && /N: "Nieuw" \}/.test(sh) && /N: "Nieuw en ongebruikt\."/.test(sh));
  ok('edge: een nieuw product één variant "Nieuw"', /const letters = nieuwAd \? \["N"\] : GRADE_LETTERS/.test(idx) && /const variants = letters\.map/.test(idx) && /"Nieuw": "N"/.test(idx));
  ok('edge: tag nieuw in plaats van refurbished', /nieuwAd \? "nieuw" : "refurbished"/.test(idx));
  ok('edge: prijs is de vraagprijs, geen nieuwprijs-vergelijking', /if \(nieuwAd\) prijzen\.N = Number\(rep\.verkoop\)/.test(idx) && /const vergelijk = !nieuwAd &&/.test(idx));
  ok('edge: geen nieuwprijs en geen accu bij nieuw', /if \(!isNieuw\(h\) && h\.nieuwprijs != null/.test(sh) && /const accu = isNieuw\(h\) \? null/.test(sh));
  ok('edge: titel en link zeggen nieuw of touch', /isNieuw\(h\) \? " nieuw" : " refurbished"/.test(sh) && /isNieuw\(h\) \? "nieuw" : ""/.test(sh) && /heeftTouch\(h\) \? "touch" : ""\]/.test(sh));

  // ── 3. de winkelapp ──
  const MOCK=`<script>
window.__vp=[]; window.__vpSchrijf=[];
function _tabel(naam){
  const f=[];
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},is(){return api;},gte(){return api;},lte(){return api;},
    ilike(k,v){ if(naam==='model_vraagprijzen') f.push(r=>String(r[k]).toLowerCase()===String(v).toLowerCase()); return api; },
    maybeSingle:async()=>({data:null}),
    insert(r){ if(naam==='model_vraagprijzen'){ window.__vpSchrijf.push(r); window.__vp.push(Object.assign({id:'n'+window.__vp.length}, r)); }
      const p=Promise.resolve({error:null}); p.select=()=>({single:async()=>({data:{id:'x'}}), maybeSingle:async()=>({data:null})}); return p; },
    update(){ return {eq:()=>Promise.resolve({error:null})}; }, delete(){return api;},
    then(r){ r({data: naam==='model_vraagprijzen' ? window.__vp.filter(x=>f.every(t=>t(x))) : [], error:null}); }};
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
  w.eval(`account={id:'e1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null}; hwModellen=[];`);

  w.eval("showTab('hardware'); hwVenster(null)");
  await wacht(30);
  const zet=(id,v)=>{ const e=d.getElementById(id); e.value=v; };
  const staat=d.getElementById('hw_staat');
  ok('formulier: staat Nieuw kan gekozen worden', [...staat.options].some(o=>o.value==='N' && /Nieuw/.test(o.textContent)));
  zet('hw_cat','Telefoon'); zet('hw_merk','Apple'); zet('hw_model','iPhone 17'); zet('hw_accu','91');
  zet('hw_staat','N'); staat.dispatchEvent(new w.Event('change'));
  ok('formulier: bij Nieuw geen accu en geen nieuwe accu', d.getElementById('hw_accu_vak').hidden && d.getElementById('hw_nieuweaccu_vak').hidden);
  ok('formulier: bij Nieuw gaat er geen accu mee', JSON.stringify(w.eval("(()=>{const r=hwFormRij(); return [r.staat, r.accu, r.nieuwe_accu];})()"))==='["N",null,false]');
  zet('hw_staat','B'); staat.dispatchEvent(new w.Event('change'));
  ok('formulier: terug naar B, accu weer zichtbaar', !d.getElementById('hw_accu_vak').hidden);

  // Touch bij een laptop.
  zet('hw_cat','Laptop'); w.eval('hwKleurToon()');
  zet('hw_merk','Dell'); zet('hw_model','Latitude 3410');
  zet('hw_sp_cpu','Intel Core i5-10210U'); zet('hw_sp_ram','16 GB'); zet('hw_sp_ssd','256 GB SSD');
  const t=d.getElementById('hw_sp_touch');
  ok('laptop: knop Touchscreen staat er', !!t && !t.checked);
  t.checked=true;
  ok('laptop: touch gaat als spec mee', w.eval("(hwFormRij().specs||{}).Touchscreen")==='ja');
  ok('laptop: vraagprijs onthoudt touch als eigen uitvoering', w.eval('hwVpSleutel().uitvoering')==='i5 10210u|16GB|256GB|touch');
  t.checked=false;
  ok('laptop: zonder touch geen spec en gewone uitvoering', w.eval("(hwFormRij().specs||{}).Touchscreen")===undefined && w.eval('hwVpSleutel().uitvoering')==='i5 10210u|16GB|256GB');
  ok('laptop: een scherm met touch zet de knop aan', /Scherm' && \/touch\/i\.test\(e\.value\)/.test(w.eval('hwLapKies.toString()')));
  zet('hw_staat','N'); zet('hw_verkoop','899'); d.getElementById('hw_verkoop').dispatchEvent(new w.Event('input'));
  await w.eval('hwVraagprijsBewaar()');
  ok('vraagprijs: ook voor Nieuw onthouden', w.__vpSchrijf.length===1 && w.__vpSchrijf[0].grade==='N' && w.__vpSchrijf[0].prijs===899);
  w.eval('hwSluit()');

  console.log(fout? '\n'+fout+' FOUTEN' : '\nnieuw en touch in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
