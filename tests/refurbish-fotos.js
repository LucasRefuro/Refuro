// De hoofdfoto en de achtergrond op het scherm.
//
// jsdom heeft geen echte canvas, dus die vervangen we door een tekenblok dat
// alleen opschrijft wat erop gezet wordt. Dat is precies genoeg: we willen
// weten of de juiste maat op de achtergrond terechtkomt en of de foto in de
// vierhoek wordt getekend, niet hoe de pixels eruitzien.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const MOCK=`<script>
window.__getekend={tekst:[], beelden:0, transforms:0};
const _verloop={addColorStop(){}};
function _context(){
  return {
    save(){}, restore(){}, clearRect(){}, setTransform(){ window.__getekend.transforms++; },
    translate(){}, scale(){}, rotate(){},
    beginPath(){}, moveTo(){}, lineTo(){}, closePath(){}, clip(){}, fill(){}, stroke(){},
    arc(){}, arcTo(){}, rect(){}, fillRect(){}, strokeRect(){},
    drawImage(){ window.__getekend.beelden++; },
    createLinearGradient:()=>_verloop, createRadialGradient:()=>_verloop,
    measureText:(t)=>({width:String(t).length*10}),
    fillText(t){ window.__getekend.tekst.push(String(t)); },
    strokeText(t){ window.__getekend.tekst.push(String(t)); },
    createImageData:(b,h)=>({width:b,height:h,data:new Uint8ClampedArray(b*h*4)}),
    getImageData:(x,y,b,h)=>({width:b,height:h,data:new Uint8ClampedArray(b*h*4)}),
    putImageData(){}
  };
}
HTMLCanvasElement.prototype.getContext=function(){ return _context(); };
HTMLCanvasElement.prototype.toDataURL=function(){ return 'data:image/jpeg;base64,AA=='; };
HTMLCanvasElement.prototype.toBlob=function(cb){ cb({size:10, type:'image/jpeg'}); };

window.__db={
  refurbish_apparaten:[
    {id:'a1', team_id:'t1', code:'A0001', merk:'HP', model:'EliteBook 840 G9', categorie:'Laptop',
     specs:{Processor:'i5', Geheugen:'16 GB', Scherm:'14 inch, 1920x1080'},
     status:'klaar', grade:'A', inkoop:75, locatie_id:'l1',
     checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_onderdelen:[], refurbish_checklists:[], refurbish_orders:[], hardware_modellen:[],
  refurbish_instellingen:{team_id:'t1', accu_min:80, inscannen:false},
  hardware_locaties:[{id:'l1', team_id:'t1', naam:'Winkel', soort:'winkel', volgorde:0}],
  hardware:[],
  refurbish_fotos:[
    {id:'f1', team_id:'t1', apparaat_id:'a1', aanzicht:'dicht', pad:'t1/a1/dicht.jpg', volgorde:0, hoofd:false},
    {id:'f2', team_id:'t1', apparaat_id:'a1', aanzicht:'open',  pad:'t1/a1/open.jpg',  volgorde:1, hoofd:false}
  ]
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
    update(r){ window.__geschreven.push([naam,'update',r]); return api; },
    delete(){ window.__geschreven.push([naam,'delete']); return api; },
    then(res){ res({data: Array.isArray(window.__db[naam])?window.__db[naam]:[], error:null}); }};
  return api;
}
window.__fetches=[];
window.fetch=async(url, opties)=>{
  window.__fetches.push([String(url), opties]);
  if(String(url).includes('/scherm-hoeken')){
    return {ok:true, json:async()=>({ok:true, gevonden:true, zeker:'hoog',
      hoeken:[{x:20,y:10},{x:80,y:12},{x:84,y:64},{x:16,y:62}]})};
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
const d=()=>w.document;

setTimeout(async()=>{
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  // ── de schermmaat uit de specificaties halen ──
  // Iedere fabrikant schrijft het anders op; als dit misgaat staat er een
  // verkeerd getal op de foto en dat is erger dan geen getal.
  ok('inch uit 14 inch',      w.eval("inchUit({Scherm:'14 inch, 1920x1080'})")==='14');
  ok('inch uit 15.6"',        w.eval(`inchUit({Scherm:'15.6" FHD'})`)==='15,6');
  ok('inch uit 15,6 inch',    w.eval("inchUit({Scherm:'15,6 inch IPS'})")==='15,6');
  ok('inch uit 13.3-inch',    w.eval("inchUit({Scherm:'13.3-inch Retina'})")==='13,3');
  ok('geen inch is leeg',     w.eval("inchUit({Scherm:'IPS mat'})")==='');
  ok('resolutie eruit',       w.eval("resolutieUit({Scherm:'14 inch, 1920x1080'})")==='1920 × 1080');
  ok('resolutie met maalteken', w.eval("resolutieUit({Scherm:'2560 × 1600'})")==='2560 × 1600');

  // ── hoofdfoto ──
  w.eval("onlineZetten('a1')");
  await new Promise(r=>setTimeout(r,80));
  const pag=()=>d().getElementById('onlinePagina').innerHTML;
  ok('foto van voren wordt vanzelf de hoofdfoto',
     w.eval("(onl.fotos.find(f=>f.aanzicht==='open')||{}).hoofd")===true);
  ok('hoofdfoto gemarkeerd in het rooster', /hoofdvlag/.test(pag()));
  ok('andere fotos kun je hoofdfoto maken', /hoofdknop/.test(pag()));

  w.__geschreven.length=0;
  await w.eval("fotoHoofd('f1')");
  const uit=w.__geschreven.filter(g=>g[0]==='refurbish_fotos' && g[1]==='update');
  ok('de oude hoofdfoto gaat uit', uit.some(g=>g[2].hoofd===false));
  ok('de nieuwe gaat aan',        uit.some(g=>g[2].hoofd===true));

  // ── de knop achtergrond vervangen ──
  ok('knop achtergrond vervangen', /Achtergrond vervangen/.test(pag()));
  ok('uitleg erbij', /schermmaat/.test(pag()));

  w.eval("achtOpen('f2')");
  const ov=()=>d().getElementById('achtOverlay');
  ok('venster opent', !!ov());
  ok('inch al ingevuld uit de specificaties', d().getElementById('acht_inch').value==='14');
  ok('resolutie al ingevuld', d().getElementById('acht_res').value==='1920 × 1080');
  ok('vier achtergronden om uit te kiezen',
     ov().querySelectorAll('.stijlknop').length===4);
  ok('eigen afbeelding kan ook', /Eigen afbeelding/.test(ov().innerHTML));
  ok('maat en glans zijn uit te zetten',
     !!d().getElementById('acht_maat') && !!d().getElementById('acht_glans'));
  ok('opslaan als hoofdfoto', /Opslaan als hoofdfoto/.test(ov().innerHTML));

  // De foto laadt in jsdom niet, dus die zetten we er zelf in.
  w.eval(`acht.beeld={width:1200, height:800};
    acht.klaar=true;
    acht.punten=[{x:.18,y:.12},{x:.82,y:.12},{x:.86,y:.66},{x:.14,y:.66}];
    const doek=document.getElementById('achtDoek');
    doek.width=680; doek.height=453;
    achtTeken();`);
  ok('de maat komt op de achtergrond', w.__getekend.tekst.indexOf('14"')>=0);
  ok('de resolutie ook', w.__getekend.tekst.indexOf('1920 × 1080')>=0);
  ok('in stukjes getekend, dus met perspectief', w.__getekend.transforms>100);

  // maat uitzetten haalt hem er ook echt af
  w.__getekend.tekst.length=0;
  w.eval("document.getElementById('acht_maat').checked=false; achtVeld();");
  ok('maat uit is maat weg', w.__getekend.tekst.length===0);
  w.eval("document.getElementById('acht_maat').checked=true; achtVeld();");

  // ── de hoeken laten zoeken ──
  await w.eval('achtHoeken(null)');
  ok('hoeken opgehaald bij de AI', w.__fetches.some(f=>f[0].includes('/scherm-hoeken')));
  ok('punten op het antwoord gezet', w.eval("Math.round(acht.punten[0].x*100)")===20);
  ok('punten blijven te verslepen', w.eval("typeof achtLuister")==='function');
  ok('er staat bij hoe zeker het is', /Kijk even of het klopt/.test(d().getElementById('achtBron').textContent));

  // ── opslaan ──
  w.__geschreven.length=0;
  await w.eval('achtBewaar(document.createElement("button"))');
  const nieuw=w.__geschreven.find(g=>g[0]==='refurbish_fotos' && g[1]==='insert');
  ok('bewerkte foto opgeslagen', !!nieuw);
  ok('als eigen aanzicht, het origineel blijft staan', !!nieuw && nieuw[2].aanzicht==='gestyled');
  ok('en meteen de hoofdfoto', !!nieuw && nieuw[2].hoofd===true);
  ok('vooraan in de rij', !!nieuw && nieuw[2].volgorde===1);
  ok('venster sluit', !d().getElementById('achtOverlay'));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
},450);
