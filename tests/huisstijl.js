// De software nakijken op dingen die stilletjes fout gaan.
//
// Dit zijn geen tests van wat de app dóét, maar van hoe hij in elkaar zit. Het
// soort fout dat nooit een foutmelding geeft en dat je pas ziet als een klant
// erover belt: een knop die naar een functie wijst die niet bestaat, twee keer
// dezelfde id waardoor de verkeerde helft van het scherm gevuld wordt, een
// klasse zonder stijl, een kleur die in dit bestand anders heet.
const fs=require('fs');
const path=require('path');
const {JSDOM}=require('jsdom');
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c,uitleg)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c){ fout++; if(uitleg) console.log('     '+uitleg); } };

const PAGINAS=['index.html','404.html','admin/index.html','app/index.html','app/scan.html',
  'refurbish/index.html','refurbish/foto.html','contact/index.html','privacy/index.html',
  'proberen/index.html','r/index.html','voorwaarden/index.html','verwerkersovereenkomst/index.html'];

/* Klassen die er alleen zijn om ze met javascript terug te vinden. Die horen
   geen stijl te hebben; dat is geen slordigheid maar opzet. */
const HAAKJES=new Set(['bestelvink','logoImg']);

/* Sommige id's staan meerdere keren in de bron, maar in takken van hetzelfde
   scherm die elkaar uitsluiten: er is er altijd maar één tegelijk. */
const MAG_DUBBEL={
  'app/index.html':['fbTekst'],          // drie popups die elkaar vervangen
  'app/scan.html':['camera','handcode']  // stappen van dezelfde scanner
};

function stukken(html){
  return {
    css:[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n'),
    js:[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n;\n')
  };
}

console.log('\n── elke pagina op zichzelf');
for(const p of PAGINAS){
  const vol=bron(p);
  if(!fs.existsSync(vol)) continue;
  const html=fs.readFileSync(vol,'utf8');
  const {css,js}=stukken(html);

  // ── de javascript moet leesbaar zijn ──
  let leest=true, waarom='';
  try{ new Function(js); }catch(e){ leest=false; waarom=e.message; }
  ok(p+': javascript leest', leest, waarom);

  // ── dezelfde naam twee keer: de laatste wint, stilletjes ──
  const namen={};
  for(const m of js.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g))
    namen[m[1]]=(namen[m[1]]||0)+1;
  const dubbel=Object.entries(namen).filter(([,n])=>n>1).map(([f])=>f);
  ok(p+': geen functie die twee keer bestaat', !dubbel.length, dubbel.join(', '));

  // ── dezelfde id twee keer: getElementById pakt de eerste ──
  const ids={};
  for(const m of html.matchAll(/\bid="([^"${}]+)"/g)) ids[m[1]]=(ids[m[1]]||0)+1;
  const magDubbel=MAG_DUBBEL[p]||[];
  const dubbeleIds=Object.entries(ids).filter(([id,n])=>n>1&&!magDubbel.includes(id)).map(([id])=>id);
  ok(p+': geen id die twee keer bestaat', !dubbeleIds.length, dubbeleIds.join(', '));

  // ── een kleur die hier niet bestaat geeft geen fout, alleen geen kleur ──
  const alles=css+'\n'+html;
  const gezet=new Set();
  for(const m of alles.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) gezet.add(m[1]);
  const mistVar=new Set();
  for(const m of alles.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g))
    if(!gezet.has(m[1])) mistVar.add(m[1]);
  ok(p+': alle kleuren en maten bestaan', !mistVar.size, [...mistVar].join(', '));

  // ── een klasse zonder stijl is een stuk opmaak dat niets doet ──
  const gestyled=new Set();
  for(const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) gestyled.add(m[1]);
  const zonder=new Set();
  for(const m of html.matchAll(/\bclass="([^"$<>]*)"/g))
    for(let k of m[1].split(/\s+/)){
      k=k.trim();
      if(k && !gestyled.has(k) && !HAAKJES.has(k)) zonder.add(k);
    }
  ok(p+': elke klasse heeft een stijl', !zonder.size, [...zonder].join(', '));

  // ── een nieuw tabblad zonder noopener laat de andere pagina aan onze tab ──
  const losseLinks=[...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)]
    .filter(m=>!/rel="[^"]*noopener/.test(m[0]));
  ok(p+': externe links laten niets open', !losseLinks.length,
     losseLinks.map(m=>m[0].slice(0,60)).join(' | '));
}

/* ── de drie schermen waar je in werkt horen er hetzelfde uit te zien ──
   Een keuzelijst van het besturingssysteem valt meteen op tussen de rest, en
   ziet er op elke computer weer anders uit. */
console.log('\n── dezelfde huisstijl in alle drie de schermen');
for(const p of ['app/index.html','admin/index.html','refurbish/index.html']){
  const {css}=stukken(fs.readFileSync(bron(p),'utf8'));
  ok(p+': keuzelijsten hebben een eigen pijltje',
     /select\{[^}]*appearance\s*:\s*none/.test(css.replace(/\s*\n\s*/g,''))
     || /select\s*\{[\s\S]{0,200}?appearance\s*:\s*none/.test(css));
  ok(p+': aankruisvakken zijn van onszelf',
     /input\[type=checkbox\][\s\S]{0,200}?appearance\s*:\s*none/.test(css));
  ok(p+': een veld dat je aanklikt licht op',
     /:focus[\s\S]{0,160}?box-shadow/.test(css));
}

/* ── elke knop moet ergens heen ──
   Dit is de fout die je pas ziet als iemand erop drukt: de knop staat er, en er
   gebeurt niets omdat de functie niet bestaat. */
console.log('\n── knoppen die nergens heen gaan');
function handlersVan(html){
  const uit=new Set();
  for(const m of html.matchAll(/\bon[a-z]+\s*=\s*(?:\\?["'])([\s\S]*?)(?:\\?["'])(?=[\s>])/g)){
    const code=m[1].replace(/\$\{[\s\S]*?\}/g,'0');
    for(const c of code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) uit.add(c[2]);
  }
  return uit;
}
const NIET_VAN_ONS=new Set(['event','confirm','alert','print','open','close','Number','String',
  'parseInt','parseFloat','encodeURIComponent','setTimeout','JSON','Math','Boolean','Date','Array','Object']);
const WOORDJES=/^(if|for|while|switch|catch|return|typeof|new|await|else|do|try|function|of|in)$/;

for(const p of ['app/index.html','refurbish/index.html','admin/index.html']){
  const html=fs.readFileSync(bron(p),'utf8');
  const {js}=stukken(html);
  const bestaat=new Set();
  for(const m of js.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) bestaat.add(m[1]);
  for(const m of js.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g)) bestaat.add(m[1]);
  for(const m of js.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) bestaat.add(m[1]);
  for(const m of js.matchAll(/(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*=\s*\(/g)) bestaat.add(m[1]);
  const mist=[...handlersVan(html)].filter(n=>!bestaat.has(n)&&!NIET_VAN_ONS.has(n)&&!WOORDJES.test(n));
  ok(p+': elke knop wijst naar een functie die bestaat', !mist.length, mist.join(', '));
}

/* ── en dan de proef op de som: laadt hij zonder klagen ── */
console.log('\n── de pagina laden');
const MOCK=`<script>
const _leeg={select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
  in(){return this;},or(){return this;},ilike(){return this;},not(){return this;},neq(){return this;},
  lt(){return this;},maybeSingle:async()=>({data:null}),
  insert(){return {select:()=>({single:async()=>({data:{id:'x'}}),then:(r)=>r({data:[],error:null})})};},
  update(){return this;},upsert(){return this;},delete(){return this;},then(r){ r({data:[],error:null}); }};
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:()=>_leeg, rpc:async()=>({data:[]}),
  storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}),
  removeChannel(){}
})};
window.fetch=async()=>({ok:true, json:async()=>({ok:true})});
<\/script>`;

(async()=>{
  for(const p of ['app/index.html','refurbish/index.html','admin/index.html']){
    const html=fs.readFileSync(bron(p),'utf8')
      .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
      .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
    const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/', pretendToBeVisual:true});
    const fouten=[];
    dom.window.onerror=(m)=>fouten.push(String(m));
    await new Promise(r=>setTimeout(r,300));
    ok(p+': start zonder fouten', fouten.length===0, fouten.slice(0,2).join(' | '));
    dom.window.close();
  }
  console.log(fout? '\n'+fout+' PUNTEN' : '\nalles netjes');
  process.exit(fout?1:0);
})();
