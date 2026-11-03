// Fabrieksfoto's voor telefoons.
//
// Drie dingen die stil mis kunnen gaan, en die deze test daarom bewaakt:
// 1. De Galaxy-codes (supabase/functions/productfotos/galaxy.ts). Eén tikfout in de
//    lijst en een model krijgt nooit foto's, of erger: de foto's van een ander model.
// 2. De kleur. Een modelfoto van een telefoon hoort bij model EN kleur; een groene
//    S23 mag nooit de zwarte set laten zien. Bij een laptop speelt kleur niet mee en
//    moet alles blijven zoals het was.
// 3. De iPhone-route. Daar bestaat geen vrije bron, dus de werkbank moet zeggen hoe je
//    hem één keer vult, en de knop "Voor het hele model" moet het goede verzoek sturen.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

/* Stopt de test zonder process.exit (een belofte die nooit oplost), dan liep node
   vroeger gewoon leeg met code 0: halve test, toch groen. Nu telt dat als fout. */
process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

(async()=>{
  // ── 1. de Galaxy-codes ──
  // Node haalt de types zelf uit een .ts-bestand; galaxy.ts heeft bewust geen Deno-imports.
  const g=await import('file://'+bron('supabase/functions/productfotos/galaxy.ts'));

  ok('Galaxy herkend', g.isGalaxy('Samsung','Galaxy S23') && g.isGalaxy('','Galaxy A54'));
  ok('iPhone is geen Galaxy', !g.isGalaxy('iPhone','13') && !g.isGalaxy('Apple','iPhone 13'));

  ok('sleutel: merk, opslag, kleur en 5G eraf', g.galaxySleutel('Samsung','Galaxy S23 Ultra 256GB - Groen')==='s23ultra');
  ok('sleutel: Z Flip 5 wordt flip5', g.galaxySleutel('Samsung','Galaxy Z Flip 5')==='flip5');
  ok('sleutel: Plus wordt +', g.galaxySleutel('Samsung','Galaxy S23 Plus')==='s23+');

  ok('S23 naar SM-S911B', g.galaxyModelnummer('Samsung','Galaxy S23')==='SM-S911B');
  ok('S23 FE is niet de S23', g.galaxyModelnummer('Samsung','Galaxy S23 FE')==='SM-S711B');
  ok('A54 ook met 5G erachter', g.galaxyModelnummer('Samsung','Galaxy A54 5G')==='SM-A546B');
  ok('A52 5G is een ander toestel dan de A52', g.galaxyModelnummer('Samsung','Galaxy A52 5G')==='SM-A526B'
     && g.galaxyModelnummer('Samsung','Galaxy A52')==='SM-A525F');
  ok('een onbekend model geeft niets', g.galaxyModelnummer('Samsung','Galaxy Q99')===null);
  ok('een eigen modelnummer gaat voor de lijst', g.galaxyModelnummer('Samsung','Galaxy Nieuw','SM-S942B')==='SM-S942B');
  ok('uit een volle code komt het modelnummer', g.galaxyModelnummer('Samsung','Galaxy','SM-S911BZGDEUB')==='SM-S911B');
  ok('volle code herkend', g.galaxyVolleCode('doos: SM-S911BZGDEUB')==='SM-S911BZGDEUB');

  ok('groen is ZG', g.kleurCodes('Groen').includes('ZG'));
  ok('zwart probeert ook donkergrijs', JSON.stringify(g.kleurCodes('Zwart'))===JSON.stringify(['ZK','ZA']));
  ok('lavendel kent de A-serie-code', g.kleurCodes('Lavendel').includes('LV'));
  ok('een onbekende kleur geeft niets', g.kleurCodes('Regenboog').length===0);
  ok('kleur uit oude invoer achter het streepje', g.kleurVan('','12 - Blauw')==='Blauw');
  ok('het kleurveld gaat voor', g.kleurVan('Wit','12 - Blauw')==='Wit');

  const k=g.galaxyKandidaten({merk:'Samsung', model:'Galaxy S23', kleur:'Groen'});
  ok('S23 groen: eerste poging is een echte code', k[0]==='SM-S911BZGDEUB');
  ok('alle pogingen zijn dit model', k.every(c=>c.startsWith('SM-S911B')));
  ok('alle pogingen in de kleur', k.every(c=>/SM-S911B(ZG|LG)/.test(c)));
  ok('begrensd, Icecat remt af', k.length>0 && k.length<=40);
  ok('zonder kleur geen gok', g.galaxyKandidaten({merk:'Samsung', model:'Galaxy S23'}).length===0);
  ok('met een volle code die eerst', g.galaxyKandidaten({merk:'Samsung', model:'Galaxy S23', productcode:'SM-S911BZEDEUB'})[0]==='SM-S911BZEDEUB');

  const lijst=Object.entries(g.GALAXY_MODELLEN);
  ok('elke code in de lijst is een modelnummer', lijst.every(([,c])=>/^SM-[A-Z]\d{3}[A-Z]{1,2}$/.test(c)));
  ok('elke naam in de lijst is zoals galaxySleutel hem maakt', lijst.every(([n])=>g.galaxySleutel('Samsung',n)===n));
  ok('geen twee namen met dezelfde code', new Set(lijst.map(([,c])=>c)).size===lijst.length);

  // ── 2. de edge function zelf (Deno, dus hier alleen nalezen) ──
  const edge=fs.readFileSync(bron('supabase/functions/productfotos/index.ts'),'utf8');
  ok('edge gebruikt galaxy.ts', /from "\.\/galaxy\.ts"/.test(edge));
  ok('laptopfoto krijgt alleen een kleur als er een is', /if \(kleur\) rij\.kleur = kleur;/.test(edge));
  ok('kleur alleen bij een telefoon', /const kleur = telefoon \? kleurVan\(/.test(edge));
  ok('iPhone vraagt Icecat niet eens', /isApple\(merk, model\)\) return klaar\(\{ opgeslagen: 0, reden: "geen-bron" \}\)/.test(edge));
  ok('alsModel kopieert het bestand, deelt het pad niet', /alsModel[\s\S]*\.download\(f\.pad\)[\s\S]*bytes: new Uint8Array/.test(edge));
  ok('alsModel kijkt of het toestel van dit team is', /refurbish_apparaten"\)[\s\S]{0,120}\.eq\("team_id", teamId\)/.test(edge));

  // ── 3. de werkbank ──
  const MOCK=`<script>
window.__db={
  refurbish_apparaten:[
    {id:'a1', team_id:'t1', code:'A0001', merk:'HP', model:'EliteBook 840 G9', categorie:'Laptop',
     specs:{Processor:'i5'}, status:'klaar', grade:'A', inkoop:75,
     checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()},
    {id:'p1', team_id:'t1', code:'A0002', merk:'Samsung', model:'Galaxy S23', categorie:'Telefoon', kleur:'Groen',
     specs:{Opslag:'128 GB'}, status:'klaar', grade:'A', inkoop:200,
     checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()},
    {id:'p2', team_id:'t1', code:'A0003', merk:'Samsung', model:'Galaxy S24', categorie:'Telefoon', kleur:null,
     specs:{}, status:'klaar', grade:'B', inkoop:250,
     checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()},
    {id:'i1', team_id:'t1', code:'A0004', merk:'iPhone', model:'13', categorie:'Telefoon', kleur:'Roze',
     specs:{}, status:'klaar', grade:'A', inkoop:300,
     checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_onderdelen:[], refurbish_checklists:[], refurbish_orders:[], hardware_modellen:[],
  refurbish_instellingen:{team_id:'t1', accu_min:80, inscannen:false},
  hardware_locaties:[{id:'l1', team_id:'t1', naam:'Winkel', soort:'winkel', volgorde:0}],
  hardware:[], refurbish_fotos:[]
};
window.__geschreven=[];
function __tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    or(){return api;}, in(){return api;}, ilike(){return api;}, not(){return api;},
    maybeSingle:async()=>({data: Array.isArray(window.__db[naam])
      ? (window.__db[naam][0]||null) : (window.__db[naam]||null)}),
    insert(r){ window.__geschreven.push([naam,'insert',r]);
      return {select:()=>({single:async()=>({data:{id:'h1'}, error:null}),
                           then:(res)=>res({data:[{id:'h1'}], error:null})})}; },
    upsert(r){ window.__geschreven.push([naam,'upsert',r]); return api; },
    update(r){ window.__geschreven.push([naam,'update',r]); return api; },
    delete(){ window.__geschreven.push([naam,'delete']); return api; },
    then(res){ res({data: Array.isArray(window.__db[naam])?window.__db[naam]:[], error:null}); }};
  return api;
}
window.__fotoVragen=[];
window.__fotoAntwoord={ok:true, opgeslagen:0, reden:'niet-gevonden'};
window.fetch=async(url, opties)=>{
  if(String(url).includes('/productfotos')){
    window.__fotoVragen.push(JSON.parse(opties.body));
    return {ok:true, json:async()=>window.__fotoAntwoord};
  }
  return {ok:true, json:async()=>({ok:true})};
};
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
  from:(n)=> n==='accounts'
    ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'Lucas'}})}
    : __tabel(n),
  storage:{from:()=>({
    getPublicUrl:(p)=>({data:{publicUrl:'https://opslag/'+p}}),
    upload:async()=>({error:null}), remove:async()=>({error:null})
  })},
  rpc:async(naam)=> naam==='abonnement_status'
    ? {data:[{plan:'Enterprise',status:'actief',geblokkeerd:false,modules:['refurbish']}]}
    : {data:null}
})};
<\/script>`;

  const html=fs.readFileSync(bron('refurbish/index.html'),'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK);
  const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/refurbish/', pretendToBeVisual:true});
  const w=dom.window;
  const fouten=[]; w.onerror=(m)=>fouten.push(String(m));
  const wacht=ms=>new Promise(r=>setTimeout(r,ms));
  const pag=()=>w.document.getElementById('onlinePagina').innerHTML;
  /* De nagebootste database filtert niet; wat we in refurbish_fotos zetten is precies wat
     de echte query zou teruggeven (eigen foto's plus alle modelfoto's van dit model). */
  const openMet=async(id, fotos)=>{
    w.__db.refurbish_fotos=fotos;
    w.__fotoVragen.length=0;
    w.eval(`onlineZetten('${id}')`);
    await wacht(80);
  };
  const ids=()=>w.eval('onl.fotos.map(f=>f.id).join(",")');

  await wacht(450);
  ok('werkbank start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  // Galaxy in groen: de groene set wel, de zwarte nooit.
  await openMet('p1', [
    {id:'mz', team_id:'t1', apparaat_id:null, model:'Galaxy S23', kleur:'Zwart', aanzicht:'open', pad:'t1/m/z.jpg', volgorde:1},
    {id:'mg', team_id:'t1', apparaat_id:null, model:'Galaxy S23', kleur:'Groen', aanzicht:'open', pad:'t1/m/g.jpg', volgorde:1}
  ]);
  ok('groene Galaxy toont de groene set', ids()==='mg');
  ok('kop noemt de kleur', /Fabrieksfoto's voor het hele model in groen/.test(pag()));

  // Alleen een zwarte set: dan liever niets, en zelf in groen zoeken.
  await openMet('p1', [
    {id:'mz', team_id:'t1', apparaat_id:null, model:'Galaxy S23', kleur:'Zwart', aanzicht:'open', pad:'t1/m/z.jpg', volgorde:1}
  ]);
  ok('een set in een andere kleur blijft weg', ids()==='');
  const v1=w.__fotoVragen.find(v=>v.actie==='automatisch');
  ok('zoekt zelf, met kleur en categorie', !!v1 && v1.kleur==='Groen' && v1.categorie==='Telefoon');

  // Een set zonder kleur is ooit voor het hele model gevuld: die geldt wel.
  await openMet('p1', [
    {id:'mx', team_id:'t1', apparaat_id:null, model:'Galaxy S23', kleur:null, aanzicht:'open', pad:'t1/m/x.jpg', volgorde:1}
  ]);
  ok('een set zonder kleur geldt voor elke kleur', ids()==='mx');

  // Galaxy zonder kleur: zeggen wat je moet doen.
  w.__fotoAntwoord={ok:true, opgeslagen:0, reden:'kleur-nodig'};
  await openMet('p2', []);
  ok('Galaxy zonder kleur vraagt om de kleur', /Vul eerst de kleur in bij dit toestel/.test(pag()));

  // iPhone zonder foto's: uitleggen dat je hem één keer zelf vult.
  w.__fotoAntwoord={ok:true, opgeslagen:0, reden:'geen-bron'};
  await openMet('i1', []);
  ok('iPhone legt uit hoe je hem één keer vult', /iPhones hebben geen vrije fabrieksfoto/.test(pag()));
  ok('nog geen knop zonder eigen foto', !/fotoAlsModel/.test(pag()));

  // iPhone met eigen foto's maar nog zonder set: de knop staat open klaar.
  await openMet('i1', [
    {id:'e1', team_id:'t1', apparaat_id:'i1', model:'13', aanzicht:'open',  pad:'t1/i1/open.jpg',  volgorde:1},
    {id:'e2', team_id:'t1', apparaat_id:'i1', model:'13', aanzicht:'dicht', pad:'t1/i1/dicht.jpg', volgorde:0}
  ]);
  ok('knop voor het hele model', /onclick="fotoAlsModel\(this\)"/.test(pag()));
  ok('het blok staat open', /data-sleutel="onl_fabriek" data-open/.test(pag()));
  w.__fotoAntwoord={ok:true, opgeslagen:2, overgeslagen:0, kleur:'Roze'};
  await w.eval('fotoAlsModel(document.createElement("button"))');
  const v2=w.__fotoVragen.find(v=>v.actie==='alsModel');
  ok('vraagt de server de foto\'s te kopiëren', !!v2 && v2.apparaat_id==='i1');

  // Zelf een fabrieksfoto plakken of uploaden bij een telefoon: de kleur gaat mee.
  w.__fotoVragen.length=0;
  await w.eval("fabriekOpslaan({data:'data:image/jpeg;base64,AA==', aanzicht:'open'})");
  ok('eigen fabrieksfoto krijgt de kleur', w.__fotoVragen[0] && w.__fotoVragen[0].kleur==='Roze');

  // Laptop: alles zoals het was.
  w.__fotoAntwoord={ok:true, opgeslagen:0, reden:'niet-gevonden'};
  await openMet('a1', [
    {id:'ml', team_id:'t1', apparaat_id:null, model:'EliteBook 840 G9', kleur:null, aanzicht:'open', pad:'t1/m/l.jpg', volgorde:1},
    {id:'el', team_id:'t1', apparaat_id:'a1', model:'EliteBook 840 G9', aanzicht:'dicht', pad:'t1/a1/d.jpg', volgorde:0}
  ]);
  ok('laptop: eigen foto en modelfoto allebei', ids()==='ml,el' || ids()==='el,ml');
  ok('laptop: geen kleur in de kop', /Fabrieksfoto's voor het hele model<\/summary>/.test(pag()));
  ok('laptop: blok blijft dicht als er foto\'s zijn', !/data-sleutel="onl_fabriek" data-open/.test(pag()));
  await openMet('a1', []);
  const v3=w.__fotoVragen.find(v=>v.actie==='automatisch');
  ok('laptop: zoekt zoals vroeger, zonder kleur', !!v3 && !v3.kleur && v3.categorie==='Laptop');
  ok('laptop: de oude uitleg', /Nog geen foto's voor dit model\. Maak er hieronder een paar met de telefoon/.test(pag()));
  w.__fotoVragen.length=0;
  await w.eval("fabriekOpslaan({data:'data:image/jpeg;base64,AA==', aanzicht:'open'})");
  ok('laptop: eigen fabrieksfoto zonder kleur', w.__fotoVragen[0] && !w.__fotoVragen[0].kleur);

  // Oude invoer met de kleur in de modelnaam.
  ok('kleur uit "12 - Blauw"', w.eval("fotoKleur({categorie:'Telefoon', model:'12 - Blauw'})")==='Blauw');
  ok('laptop heeft nooit een fotokleur', w.eval("fotoKleur({categorie:'Laptop', kleur:'Zilver'})")==='');

  ok('geen fouten onderweg', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
})();
