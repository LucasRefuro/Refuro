// Touch en de indeling van het toetsenbord op de sticker (19 november 2026, wens eigenaar).
//
// Aanleiding: twee dezelfde Dell Pro 14 Plus stonden op twee advertenties. De ene was touch, de
// andere (nog van voor het vinkje Touchscreen) niet, en aan de sticker zag je dat niet.
//
// Bewaakt:
//   1. de winkelapp: het vak Toetsenbord staat bij een laptop, een nieuwe laptop krijgt QWERTY,
//      een desktop niet, en een bestaande laptop openen verandert niets
//   2. de sticker van de winkelapp: Touchscreen en Toetsenbord staan erop
//   3. de werkbank: dezelfde keuze bij de extra uitrusting, standaard QWERTY, en beide op de sticker
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

(async()=>{
  const app=fs.readFileSync(bron('app/index.html'),'utf8');
  const rb=fs.readFileSync(bron('refurbish/index.html'),'utf8');

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
  w.fetch=async()=>({ok:true, json:async()=>({ok:true, specs:{}, opties:{}})});
  w.eval(`account={id:'e1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null}; hwModellen=[];`);

  const zet=(id,v)=>{ const e=d.getElementById(id); e.value=v; };
  w.eval("showTab('hardware'); hwVenster(null)");
  await wacht(30);
  const kbd=d.getElementById('hw_sp_kbd');
  zet('hw_cat','Laptop'); w.eval('hwKleurToon()');
  ok('formulier: het vak Toetsenbord staat bij een laptop', !!kbd && !kbd.closest('.lapspec').hidden && /Toetsenbord/.test(d.querySelector('label[for=hw_sp_kbd]').textContent));
  ok('formulier: een nieuwe laptop staat op QWERTY', kbd.value==='QWERTY');
  w.eval('hwLapTeken()');
  const knoppen=[...d.querySelectorAll('#hw_sp_kbd_opties .optieknop')].map(b=>b.textContent);
  ok('formulier: QWERTY, AZERTY en QWERTZ om aan te tikken', knoppen.join(',')==='QWERTY,AZERTY,QWERTZ');
  zet('hw_merk','Dell'); zet('hw_model','Pro 14 Plus');
  zet('hw_sp_cpu','Intel Core Ultra 5 120U'); zet('hw_sp_ram','16 GB'); zet('hw_sp_ssd','256 GB SSD');
  ok('formulier: het toetsenbord gaat als spec mee', w.eval("(hwFormRij().specs||{}).Toetsenbord")==='QWERTY');
  w.eval("hwLapKies('hw_sp_kbd', 1)");
  ok('formulier: AZERTY aantikken', w.eval("(hwFormRij().specs||{}).Toetsenbord")==='AZERTY');
  ok('vraagprijs: het toetsenbord maakt geen eigen uitvoering', w.eval('hwVpSleutel().uitvoering')==='ultra 5 120u|16GB|256GB');
  zet('hw_cat','Desktop'); w.eval('hwKleurToon()');
  ok('formulier: een desktop heeft geen toetsenbord-vak', kbd.closest('.lapspec').hidden && w.eval("(hwFormRij().specs||{}).Toetsenbord")===undefined);
  w.eval('hwSluit()');

  /* Een bestaande laptop van voor het vak: openen mag niets veranderen (en dus niets stil opslaan). */
  w.eval(`hwOpen=null; hwVenster({id:'h1', code:'A0100', merk:'Dell', model:'Latitude 5410', categorie:'Laptop', staat:'B', verkoop:399,
    specs:{Processor:'Intel Core i5-10310U', Geheugen:'8 GB', Opslag:'256 GB SSD', Windows:'Windows 11 Pro'}})`);
  await wacht(30);
  ok('bestaande laptop: het vak blijft leeg, geen QWERTY erbij verzonnen', d.getElementById('hw_sp_kbd').value==='');
  ok('bestaande laptop: openen verandert de specs niet', JSON.stringify(w.eval('hwKleurVeld()'))==='{}');
  w.eval('hwSluit()');

  // ── 2. de sticker van de winkelapp ──
  const laptop=sp=>`({code:'A0148', merk:'Dell', model:'Pro 14 Plus', categorie:'Laptop', staat:'A', accu:86, garantie:12,
    specs:Object.assign({Processor:'Intel Core Ultra 5 120U', Geheugen:'16 GB', Opslag:'256 GB SSD', Scherm:'14 inch OLED 3K', Windows:'Windows 11 Pro'}, ${JSON.stringify(sp)})})`;
  const s1=w.eval('hwLabelRegels('+laptop({Touchscreen:'ja', Toetsenbord:'QWERTY'})+')');
  ok('sticker: touch erop', s1.includes('Touchscreen: ja'));
  ok('sticker: toetsenbord erop', s1.includes('Toetsenbord: QWERTY'));
  ok('sticker: touch en toetsenbord direct onder het scherm', s1.indexOf('Touchscreen: ja')===s1.indexOf('Scherm: 14 inch OLED 3K')+1 && s1.indexOf('Toetsenbord: QWERTY')===s1.indexOf('Touchscreen: ja')+1);
  const s2=w.eval('hwLabelRegels('+laptop({})+')');
  ok('sticker: zonder touch geen touch-regel', !s2.some(r=>/Touchscreen/.test(r)) && !s2.some(r=>/Toetsenbord/.test(r)));
  const vol=w.eval('hwLabelRegels(Object.assign('+laptop({Touchscreen:'ja', Toetsenbord:'QWERTY', Videokaart:'NVIDIA Quadro T1000'})+', {doos:true}))');
  ok('sticker: met alles erop valt er niets af', vol.includes('Garantie: 12 maanden') && vol.includes('Doos: ja') && vol.includes('Toetsenbord: QWERTY'));
  const tel=w.eval(`hwLabelRegels({code:'A0200', merk:'Apple', model:'iPhone 13', categorie:'Telefoon', staat:'B', specs:{Kleur:'Blauw', Opslag:'128 GB'}})`);
  ok('sticker: een telefoon krijgt geen toetsenbord', !tel.some(r=>/Toetsenbord|Touchscreen/.test(r)));

  // ── 3. de werkbank ──
  ok('werkbank: Toetsenbord als keuze bij de extra uitrusting, standaard QWERTY',
    /\{s:'Toetsenbord',\s+id:'ce_layout', type:'keuze', opties:\['QWERTY','AZERTY','QWERTZ'\], standaard:'QWERTY'\}/.test(rb));
  ok('werkbank: de standaard alleen als hij nog nooit gezet is', /if\(v\.standaard && ctr\.specs\[v\.s\]===undefined\) ctr\.specs\[v\.s\]=v\.standaard;/.test(rb));
  const labelRegels=new Function('CATEGORIE_PROFIEL', 'fotoKleurgebonden', haal(rb,'labelRegels')+'; return labelRegels;')(
    {Laptop:{specVelden:['Processor','Geheugen','Opslag','Videokaart','Scherm','Windows'].map(s=>({sleutel:s}))}}, ()=>false);
  const wb=labelRegels({categorie:'Laptop', accu:86, doos:true, specs:{Processor:'Intel Core Ultra 5 120U', Geheugen:'16 GB', Opslag:'256 GB SSD',
    Videokaart:'NVIDIA Quadro T1000', Scherm:'14 inch OLED 3K', Windows:'Windows 11 Pro', Touchscreen:'ja', Toetsenbord:'QWERTY'}});
  ok('werkbank-sticker: touch en toetsenbord erop', wb.includes('Touchscreen: ja') && wb.includes('Toetsenbord: QWERTY'));
  ok('werkbank-sticker: de specs en de vaste regels blijven erop', wb.includes('Processor: Intel Core Ultra 5 120U') && wb.includes('Accu: 86%') && wb.includes('Windows 11 Pro') && wb.includes('Met doos'));
  const wb2=labelRegels({categorie:'Laptop', specs:{Processor:'i5', Touchscreen:''}});
  ok('werkbank-sticker: geen touch, geen regel', !wb2.some(r=>/Touchscreen|Toetsenbord/.test(r)));

  console.log(fout? '\n'+fout+' FOUTEN' : '\ntouch en toetsenbord in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
