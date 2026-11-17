// Een losse videokaart bij een laptop (17 november 2026, wens eigenaar: een ZBook met een NVIDIA).
//
// Bewaakt:
//   1. dezelfde herkenning op drie plekken (winkelapp, werkbank, webshopkoppeling): alleen een
//      losse kaart telt, de ingebouwde (Intel UHD, Iris Xe, Radeon 610M) niet
//   2. de webshopsleutel: een losse kaart is een eigen advertentie, een ingebouwde verandert
//      niets aan de bestaande sleutels
//   3. de winkelapp: het vak Videokaart, de vraagprijs per uitvoering (past op de controle in de
//      database), het prijskaartje en de sticker
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
const zonderTypes=t=>t.replace(/export /g,'').replace(/: (any|unknown|string)(\[\])?/g,'');

(async()=>{
  const sh=fs.readFileSync(bron('supabase/functions/_gedeeld/shopify.ts'),'utf8');
  const rb=fs.readFileSync(bron('refurbish/index.html'),'utf8');
  const app=fs.readFileSync(bron('app/index.html'),'utf8');
  const mig=fs.readFileSync(bron('supabase/migrations/20261117100000_videokaart_uitvoering.sql'),'utf8');

  // ── 1. de herkenning ──
  const laad=(t, ts)=>new Function((ts?zonderTypes:(x=>x))(haal(t,'losseVideokaart')+haal(t,'videokaartCode'))+'; return [losseVideokaart, videokaartCode];')();
  const kanten={edge:laad(sh,true), werkbank:laad(rb), winkelapp:laad(app)};
  const proeven={
    'NVIDIA Quadro T1000':'t1000', 'NVIDIA Quadro T1000 4GB':'t1000', 'NVIDIA T1000':'t1000',
    'Quadro T2000 (4 GB GDDR5)':'t2000', 'NVIDIA GeForce RTX 3050 Ti Laptop GPU':'rtx3050ti',
    'GeForce MX250':'mx250', 'NVIDIA RTX A2000':'rtxa2000', 'AMD Radeon Pro WX 3200':'radeonprowx3200',
    'AMD Radeon 530':'radeon530', 'Intel Arc A370M':'arca370m',
    'AMD Radeon 610M':'', 'AMD Radeon Graphics':'', 'Intel UHD Graphics 620':'', 'Intel Iris Xe Graphics':'',
    'Intel HD Graphics (geïntegreerd)':'', 'Apple M1 8-core GPU':'', '':''
  };
  ok('herkenning: drie plekken geven precies hetzelfde', Object.keys(proeven).every(g=>{
    const uit=Object.values(kanten).map(([l,c])=>l(g)+'|'+c(g));
    return uit.every(u=>u===uit[0]);
  }));
  ok('herkenning: een losse kaart wordt een korte code', Object.entries(proeven).every(([g,c])=>kanten.edge[1](g)===c));
  ok('herkenning: de ingebouwde telt niet', ['Intel UHD Graphics 620','AMD Radeon 610M','Intel Iris Xe Graphics'].every(g=>kanten.winkelapp[0](g)===''));

  // ── 2. de sleutel ──
  const edge=new Function(zonderTypes(haal(sh,'isNieuw')+haal(sh,'heeftTouch')+haal(sh,'losseVideokaart')+haal(sh,'videokaartCode')+haal(sh,'webshopSleutel'))+'; return webshopSleutel;')();
  const werkbank=new Function(haal(rb,'losseVideokaart')+haal(rb,'videokaartCode')+haal(rb,'webshopSleutel')+'; return webshopSleutel;')();
  const zbook=gpu=>({merk:'HP', model:'ZBook 15 G6', categorie:'Laptop', staat:'B', specs:Object.assign({Processor:'Intel Core i7-9850H', Geheugen:'32 GB', Opslag:'512 GB SSD'}, gpu?{Videokaart:gpu}:{})});
  const lijst=[zbook('NVIDIA Quadro T1000'), zbook('NVIDIA Quadro T2000 4GB'), zbook('Intel UHD Graphics 630'), zbook(''),
    Object.assign(zbook('NVIDIA Quadro T1000'), {specs:Object.assign(zbook('NVIDIA Quadro T1000').specs, {Touchscreen:'ja'})})];
  ok('sleutel: werkbank en edge precies gelijk', lijst.every(p=>edge(p)===werkbank(p)));
  ok('sleutel: een losse kaart is een eigen advertentie', edge(lijst[0])==='hp_zbook-15-g6_intel-core-i7-9850h_32-gb_512-gb-ssd_t1000' && edge(lijst[0])!==edge(lijst[1]) && edge(lijst[0])!==edge(lijst[3]));
  ok('sleutel: een ingebouwde kaart verandert niets', edge(lijst[2])===edge(lijst[3]) && edge(lijst[3])==='hp_zbook-15-g6_intel-core-i7-9850h_32-gb_512-gb-ssd');
  ok('sleutel: kaart en touch samen', edge(lijst[4])==='hp_zbook-15-g6_intel-core-i7-9850h_32-gb_512-gb-ssd_t1000_touch');
  ok('edge: titel en link noemen de kaart', /sp\.Opslag, losseVideokaart\(sp\.Videokaart\), heeftTouch/.test(sh));
  ok('werkbank: vraagprijs onthoudt de kaart als eigen uitvoering', /uitvoering:uv\+\(gpu\?'\|gpu '\+gpu:''\)\+\(touch\?'\|touch':''\)/.test(rb));

  // ── 3. de winkelapp ──
  const MOCK=`<script>
window.__vpSchrijf=[];
function _tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},is(){return api;},gte(){return api;},lte(){return api;},ilike(){return api;},
    maybeSingle:async()=>({data:null}),
    insert(r){ if(naam==='model_vraagprijzen') window.__vpSchrijf.push(r);
      const p=Promise.resolve({error:null}); p.select=()=>({single:async()=>({data:{id:'x'}}), maybeSingle:async()=>({data:null})}); return p; },
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
  /* model-specs kent de ZBook met één vaste videokaart, zonder uitvoeringen ervan. */
  w.fetch=async(url)=>/model-specs/.test(String(url))
    ? {ok:true, json:async()=>({ok:true, specs:{Videokaart:'NVIDIA Quadro T1000', Bouwjaar:'2019'}, opties:{Processor:['Intel Core i7-9850H','Intel Core i9-9880H']}})}
    : {ok:true, json:async()=>({ok:true})};
  w.eval(`account={id:'e1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null}; hwModellen=[];`);

  w.eval("showTab('hardware'); hwVenster(null)");
  await wacht(30);
  const zet=(id,v)=>{ const e=d.getElementById(id); e.value=v; };
  const vak=d.getElementById('hw_sp_gpu');
  ok('formulier: het vak Videokaart staat bij de laptop', !!vak && !vak.closest('.lapspec').hidden && /Videokaart/.test(d.querySelector('label[for=hw_sp_gpu]').textContent));
  zet('hw_merk','HP'); zet('hw_model','ZBook 15 G6');
  await w.eval('hwLapOptiesLaden()');
  ok('formulier: de kaart van het model staat er al in', vak.value==='NVIDIA Quadro T1000');
  zet('hw_sp_cpu','Intel Core i7-9850H'); zet('hw_sp_ram','32 GB'); zet('hw_sp_ssd','512 GB SSD');
  ok('formulier: de kaart gaat als spec mee', w.eval("(hwFormRij().specs||{}).Videokaart")==='NVIDIA Quadro T1000');
  const uv=w.eval('hwVpSleutel().uitvoering');
  ok('vraagprijs: de kaart is een eigen uitvoering', uv==='i7 9850h|32GB|512GB|gpu t1000');
  const regel=new RegExp(mig.match(/uitvoering ~ '([^']+)'/)[1]);
  d.getElementById('hw_sp_touch').checked=true;
  const uvTouch=w.eval('hwVpSleutel().uitvoering');
  ok('vraagprijs: kaart en touch samen', uvTouch==='i7 9850h|32GB|512GB|gpu t1000|touch');
  ok('vraagprijs: past op de controle in de database', [uv, uvTouch, 'i7 9850h|32GB|512GB', 'i7 9850h|32GB|512GB|touch'].every(u=>regel.test(u)));
  d.getElementById('hw_sp_touch').checked=false;
  zet('hw_sp_gpu','Intel UHD Graphics 630');
  ok('vraagprijs: een ingebouwde kaart is de gewone uitvoering', w.eval('hwVpSleutel().uitvoering')==='i7 9850h|32GB|512GB');
  zet('hw_sp_gpu','');
  ok('formulier: een leeg vak haalt de kaart weg', w.eval("(hwFormRij().specs||{}).Videokaart")===undefined);
  w.eval('hwSluit()');

  // Het prijskaartje en de sticker.
  const toestel=gpu=>`({merk:'HP', model:'ZBook 15 G6', categorie:'Laptop', staat:'B', verkoop:899, garantie:24,
    specs:{Processor:'Intel Core i7-9850H', Geheugen:'32 GB', Opslag:'512 GB SSD', Windows:'Windows 11 Pro'${gpu?", Videokaart:'"+gpu+"'":''}}})`;
  const kaart=g=>w.eval('hwKaartData('+toestel(g)+').specs').map(s=>typeof s==='object'?s.tekst:s);
  const k1=kaart('NVIDIA Quadro T1000 4GB');
  ok('prijskaartje: de kaart direct onder de processor', k1[0]==='Intel Core i7 Gen9' && k1[1]==='NVIDIA Quadro T1000 Videokaart (4GB)');
  ok('prijskaartje: zonder geheugen ook netjes', kaart('NVIDIA GeForce RTX 3050 Ti Laptop GPU')[1]==='NVIDIA GeForce RTX 3050 Ti Videokaart');
  ok('prijskaartje: een ingebouwde kaart komt er niet op', kaart('Intel UHD Graphics 630').length===4 && !kaart('Intel UHD Graphics 630').some(s=>/Videokaart/.test(s)));
  const sticker=g=>w.eval('hwLabelRegels('+toestel(g)+')');
  ok('sticker: de losse kaart erop, met naam', sticker('NVIDIA Quadro T1000').includes('Videokaart: NVIDIA Quadro T1000'));
  ok('sticker: de ingebouwde niet', !sticker('Intel UHD Graphics 630').some(r=>/Videokaart/.test(r)));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nvideokaart in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
