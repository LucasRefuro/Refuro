// De kleur van een MacBook (19 november 2026, wens eigenaar).
//
// Een kleur kon alleen bij een telefoon of tablet. Een MacBook koop je net zo goed in een kleur,
// en een zilveren hoort op een andere advertentie dan een spacegrijze (de kleur zit in de
// webshopsleutel).
//
// Bewaakt:
//   1. de winkelapp: het vak Kleur staat bij een MacBook en niet bij een andere laptop, de kleur
//      gaat als spec mee, een bestaande MacBook openen verandert niets, de vraagprijs let er niet op
//   2. de keuzelijst van telefoons: een opgezochte MacBook komt daar niet tussen
//   3. de sticker van de winkelapp: de kleur staat erop en er valt niets af
//   4. de werkbank: het kleurvak bij toevoegen, en de sleutel geeft per kleur een eigen advertentie
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

/* Een functie uit een bronbestand halen (op de accolades). */
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
  const app=fs.readFileSync(bron('app/index.html'),'utf8');
  const rb=fs.readFileSync(bron('refurbish/index.html'),'utf8');
  const sh=fs.readFileSync(bron('supabase/functions/_gedeeld/shopify.ts'),'utf8');

  // ── 1. de winkelapp ──
  const MOCK=`<script>
function _tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},is(){return api;},gte(){return api;},lte(){return api;},ilike(){return api;},
    maybeSingle:async()=>({data:null}),
    insert(){ const p=Promise.resolve({error:null}); p.select=()=>({single:async()=>({data:{id:'x'}}), maybeSingle:async()=>({data:null})}); return p; },
    update(){ return {eq:()=>Promise.resolve({error:null})}; }, delete(){return api;},
    then(r){ r({data:[], error:null}); }};
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
  const html=app
    .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
    .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
  const w=dom.window, d=w.document;
  w.scrollTo=()=>{};
  const fouten=[]; w.onerror=m=>fouten.push(String(m));
  await wacht(800);
  ok('winkelapp start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));
  /* De kleuren van het model komen van model-kleuren; de rest antwoordt leeg. */
  w.fetch=async(url)=>({ok:true, json:async()=>(/model-kleuren/.test(String(url))
    ? {ok:true, kleuren:['Spacegrijs','Zilver','Goud','Roségoud']} : {ok:true, specs:{}, opties:{}})});
  w.eval(`account={id:'e1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null}; hwModellen=[];`);

  const zet=(id,v)=>{ const e=d.getElementById(id); e.value=v; };
  w.eval("showTab('hardware'); hwVenster(null)");
  await wacht(30);
  const vak=d.getElementById('hw_kleur_vak');
  zet('hw_cat','Laptop'); w.eval('hwKleurToon()');
  zet('hw_merk','Dell'); zet('hw_model','Latitude 5410');
  await w.eval('hwKleurenLaden()');
  ok('formulier: een gewone laptop heeft geen kleurvak', vak.hidden);
  zet('hw_kleur','Zwart');
  ok('formulier: een verstopt kleurvak gaat niet mee', w.eval("(hwFormRij().specs||{}).Kleur")===undefined);
  zet('hw_kleur','');

  zet('hw_merk','Apple'); zet('hw_model','MacBook 12 inch 2017');
  await w.eval('hwKleurenLaden()');
  ok('formulier: een MacBook heeft een kleurvak', !vak.hidden);
  ok('formulier: geen vak Opslag erbij (dat zit in de laptopspecs)', d.getElementById('hw_opslag_vak').hidden);
  const opties=[...d.querySelectorAll('#hw_kleur_kies option')].map(o=>o.textContent);
  ok('formulier: de kleuren van het model om te kiezen', !d.getElementById('hw_kleur_kies').hidden && opties.includes('Spacegrijs') && opties.includes('Roségoud'));
  const kies=d.getElementById('hw_kleur_kies'); kies.value='Zilver'; w.eval('hwKleurKies()');
  zet('hw_sp_cpu','Intel Core m3-7Y32'); zet('hw_sp_ram','8 GB'); zet('hw_sp_ssd','256 GB SSD');
  ok('formulier: de kleur gaat als spec mee', w.eval("(hwFormRij().specs||{}).Kleur")==='Zilver');
  ok('vraagprijs: de kleur maakt geen eigen uitvoering', w.eval('hwVpSleutel().uitvoering')==='m3 7y32|8GB|256GB');
  zet('hw_model','MacBook Air'); zet('hw_merk','Apple');
  ok('formulier: merk Apple zonder het woord MacBook telt ook', w.eval("hwKleurBij('Laptop','Apple','Air 13 M1')"));
  ok('formulier: een iPhone blijft gewoon een kleur hebben', w.eval("hwKleurBij('Telefoon','Apple','iPhone 13')") && !w.eval("hwKleurBij('Desktop','Dell','OptiPlex 7090')"));
  w.eval('hwSluit()');

  /* Een bestaande MacBook zonder kleur: openen mag niets veranderen (en dus niets stil opslaan). */
  w.eval(`hwOpen=null; hwVenster({id:'h1', code:'A0172', merk:'Apple', model:'MacBook 12 inch 2017', categorie:'Laptop', staat:'B', verkoop:399,
    specs:{Processor:'Intel Core m3-7Y32', Geheugen:'8 GB', Opslag:'256 GB SSD', Toetsenbord:'QWERTY'}})`);
  await wacht(30);
  ok('bestaande MacBook: het kleurvak staat er', !d.getElementById('hw_kleur_vak').hidden);
  ok('bestaande MacBook: openen verandert de specs niet', JSON.stringify(w.eval('hwKleurVeld()'))==='{}');
  w.eval('hwSluit()');

  // ── 2. de keuzelijst van telefoons ──
  await wacht(100);   // hwSluit tekent de lijst opnieuw; daarna pas een nieuw formulier
  w.eval("hwOpen=null; hwVenster(null)");
  await wacht(30);
  w.eval(`hwModellen=[{merk:'Apple', model:'iPhone 13', kleuren:['Blauw'], volgorde:13, toon:true},
    {merk:'Apple', model:'MacBook 12 inch 2017', kleuren:['Spacegrijs','Zilver'], toon:true}]`);
  zet('hw_cat','Telefoon'); w.eval('hwKleurToon()');
  zet('hw_merk','Apple'); zet('hw_model','');
  w.eval('hwModelTyp()');
  const lijst=d.getElementById('hwModelLijst').textContent;
  ok('telefoonlijst: de iPhone staat erin', /iPhone 13/.test(lijst));
  ok('telefoonlijst: een opgezochte MacBook niet', !/MacBook/.test(lijst));
  w.eval('hwSluit()');

  // ── 3. de sticker van de winkelapp ──
  const mac=w.eval(`hwLabelRegels({code:'A0172', merk:'Apple', model:'MacBook 12 inch 2017', categorie:'Laptop', staat:'B', accu:88, garantie:12, doos:true,
    specs:{Processor:'Intel Core m3-7Y32', Geheugen:'8 GB', Opslag:'256 GB SSD', Scherm:'12 inch Retina', Toetsenbord:'QWERTY', Kleur:'Spacegrijs', Besturingssysteem:'macOS Ventura'}})`);
  ok('sticker: de kleur staat erop', mac.includes('Kleur: Spacegrijs'));
  const vol=w.eval(`hwLabelRegels({code:'A0999', merk:'Apple', model:'MacBook Pro 15 2018', categorie:'Laptop', staat:'A', accu:91, garantie:12, doos:true,
    specs:{Processor:'Intel Core i7-8750H', Geheugen:'16 GB', Opslag:'512 GB SSD', Videokaart:'AMD Radeon Pro 555X', Scherm:'15 inch Retina', Touchscreen:'ja', Toetsenbord:'QWERTY', Kleur:'Zilver', Besturingssysteem:'macOS'}})`);
  ok('sticker: met alles erop valt er niets af', vol.includes('Kleur: Zilver') && vol.includes('Garantie: 12 maanden') && vol.includes('Doos: ja'));

  // ── 4. de werkbank ──
  const kleurTelt=new Function(haal(rb,'kleurTelt')+'; return kleurTelt;')();
  ok('werkbank: kleur bij een telefoon', kleurTelt('Telefoon','Apple iPhone 13'));
  ok('werkbank: kleur bij een MacBook', kleurTelt('Laptop','Apple MacBook Air 13 M1') && kleurTelt('Laptop','MacBook Pro 14'));
  ok('werkbank: geen kleur bij een andere laptop', !kleurTelt('Laptop','Dell Latitude 5410') && !kleurTelt('Laptop','HP EliteBook 840'));
  ok('werkbank: toevoegen bewaart de kleur via kleurTelt', /kleur:\(kleurTelt\(cat, v\('t_model'\)\) && v\('t_kleur'\)\)\?v\('t_kleur'\):null/.test(rb));
  ok('werkbank: het kleurvak volgt het model', /onchange="kleurToevoegen\(\)"/.test(rb) && /if\(kw\) kw\.hidden=!aan;/.test(haal(rb,'kleurToevoegen')));

  const edge=new Function(zonderTypes(haal(sh,'isNieuw')+haal(sh,'heeftTouch')+haal(sh,'losseVideokaart')+haal(sh,'videokaartCode')+haal(sh,'webshopSleutel'))+'; return webshopSleutel;')();
  const werkbank=new Function(haal(rb,'losseVideokaart')+haal(rb,'videokaartCode')+haal(rb,'webshopSleutel')+'; return webshopSleutel;')();
  const m=k=>({merk:'Apple', model:'MacBook 12 inch 2017', categorie:'Laptop', staat:'B', grade:'B', kleur:k,
    specs:{Processor:'Intel Core m3-7Y32', Geheugen:'8 GB', Opslag:'256 GB SSD'}});
  ok('sleutel: een zilveren en een spacegrijze op een eigen advertentie', edge(m('Zilver'))!==edge(m('Spacegrijs')) && /_zilver_/.test(edge(m('Zilver'))));
  ok('sleutel: werkbank en edge gelijk met kleur', edge(m('Zilver'))===werkbank(m('Zilver')));
  const hw={merk:'Apple', model:'MacBook 12 inch 2017', categorie:'Laptop', staat:'B', specs:Object.assign({Kleur:'Zilver'}, m('').specs)};
  ok('sleutel: de kleur uit de winkelapp (specs) telt net zo', edge(hw)===edge(m('Zilver')));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nmacbook-kleur in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
