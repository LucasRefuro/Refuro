// Het stappenpad van de controle, met alle vertakkingen.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const MOCK=`<script>
window.__db={
  refurbish_apparaten:[
    {id:'a1', team_id:'t1', code:'A0001', merk:'HP', model:'ZBook 15 G6 Mobile',
     categorie:'Laptop', specs:{Touchscreen:'ja'}, status:'te_controleren',
     checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()},
    {id:'a2', team_id:'t1', code:'A0002', merk:'Dell', model:'Latitude 5430',
     categorie:'Laptop', specs:{}, status:'te_controleren',
     checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_onderdelen:[], refurbish_checklists:[], refurbish_orders:[],
  hardware_modellen:[]
};
window.__geschreven=[]; window.__rpcs=[];
function __tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},maybeSingle:async()=>({data:(window.__db[naam]||[])[0]||null}),
    insert(r){ window.__geschreven.push([naam,'insert',r]);
      return {select:async()=>({data:(Array.isArray(r)?r:[r]).map((x,i)=>Object.assign({id:'n'+i},x)), error:null})}; },
    update(r){ window.__geschreven.push([naam,'update',r]); return api; },
    delete(){ return api; },
    then(res){ res({data:window.__db[naam]||[], error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
  from:(n)=> n==='accounts'
    ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'Lucas'}})}
    : __tabel(n),
  rpc:async(naam,arg)=>{ window.__rpcs.push([naam,arg]);
    return naam==='abonnement_status'
      ? {data:[{plan:'Enterprise',status:'proef',geblokkeerd:false,modules:['refurbish']}]}
      : {data:null}; }
})};
<\/script>`;

const html=fs.readFileSync(bron('refurbish/index.html'),'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK);
const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/refurbish/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[]; w.onerror=(m)=>fouten.push(String(m));
const tekst=()=>w.document.getElementById('ctrPagina').textContent;
const knop=(deel)=>[...w.document.querySelectorAll('#ctrPagina .ctrvoet button')]
  .find(b=>b.textContent.includes(deel));

setTimeout(async()=>{
  const d=w.document;
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  // ── hele regel klikbaar ──
  const regel=d.querySelector('#wbLijst tr.klikbaar');
  ok('hele regel is klikbaar', !!regel && /appPagina/.test(regel.getAttribute('onclick')));

  // ── pad 1: gaat niet aan, geen lampje, reset, blijft dood ──
  w.eval("appOpen('a1')");
  ok('stap 1 vraagt of hij opstart', /Start het apparaat op/.test(tekst()));
  ok('tijdlijn zichtbaar', !!d.querySelector('.tijdlijn .tl.nu'));
  ok('zes stappen in de tijdlijn', d.querySelectorAll('.tijdlijn .tl').length===6);
  ok('knoppen staan rechts', w.getComputedStyle(d.querySelector('.ctrvoet')).justifyContent==='flex-end');
  ok('geen knop zonder antwoord', !knop('Door') && !knop('Uitzoeken'));

  w.eval("ctrKies('start','Nee')");
  ok('nee geeft de uitzoekknop', !!knop('Uitzoeken'));
  knop('Uitzoeken').click();
  ok('stap lampje', /Brandt er een lampje/.test(tekst()));

  w.eval("ctrKies('lampje','Nee')");
  knop('Naar de reset').click();
  ok('resetstappen getoond', /bios-batterij/.test(tekst()));
  ok('wekker staat op 2:00', d.getElementById('wekTijd').textContent==='2:00');
  w.eval('wekkerStart()');
  ok('wekker loopt', !!w.eval('ctr.tijdEinde'));

  knop('Gedaan').click();
  ok('geheugenstap', /Zit er geheugen in/.test(tekst()));
  w.eval("ctrKies('geheugen','Nee')");
  ok('tip bij geen geheugen', /Zet er geheugen in/.test(tekst()));
  w.eval("ctrKies('nogmaals','Nee')");
  knop('Leeghalen').click();
  ok('sloopstap met onderdelen', /Vink aan wat er nog/.test(tekst()));
  w.eval("ctrDeel('Scherm',true); ctrDeel('Accu',true)");
  ok('teller onderdelen', /2 onderdelen gaan naar de plank/.test(tekst()));
  await w.eval('ctrSlopen(document.createElement("button"))');

  const delen=w.__geschreven.find(g=>g[0]==='refurbish_onderdelen' && g[1]==='insert');
  ok('onderdelen naar de plank', !!delen && delen[2].length===2);
  ok('onderdeelnaam bevat het model', !!delen && /ZBook/.test(delen[2][0].naam));
  const sloop=w.__geschreven.find(g=>g[0]==='refurbish_apparaten' && g[1]==='update' && g[2].status==='repurpose');
  ok('apparaat op onderdelen', !!sloop);
  ok('goede delen vastgelegd', !!sloop && sloop[2].goede_delen.length===2);

  // ── pad 2: start op, alles goed, grade A ──
  w.eval("appOpen('a2'); ctrKies('start','Ja')");
  knop('Door naar de hardware').click();
  ok('hardwarestap', /Werkt het toetsenbord/.test(tekst()));
  ok('accuveld in de hardwarestap', !!d.getElementById('c_accu'));
  ok('notitieveld in de hardwarestap', !!d.getElementById('c_notitie'));
  ok('nog niet door zonder antwoorden', !knop('Door naar de staat'));
  ok('geen touchscreenvraag zonder touchscreen', !/touchscreen overal/.test(tekst()));
  w.eval("HARDWARE_CHECKS.forEach(q=>ctr.antwoord[q.v]='Ja'); ctrTeken();");
  ok('nu wel door', !!knop('Door naar de staat'));
  knop('Door naar de staat').click();
  ok('visuele stap', /Behuizing/.test(tekst()) && /Scharnieren/.test(tekst()));
  ok('nog geen grade', !d.querySelector('.gradeletter'));
  w.eval("ctrPunt('Behuizing','Als nieuw',0); ctrPunt('Scherm','Gaaf',0); ctrPunt('Toetsenbord','Letters gaaf',0); ctrPunt('Scharnieren en deksel','Stevig',0)");
  ok('grade A bij nul punten', d.querySelector('.gradeletter').textContent==='A');
  knop('Door naar Windows').click();
  ok('windowsstap', /Windows installeren/.test(tekst()));
  d.getElementById('c_accu');
  await w.eval('ctrInstalleren(document.createElement("button"))');
  const inst=w.__geschreven.filter(g=>g[0]==='refurbish_apparaten' && g[1]==='update').pop();
  ok('gaat op installeren', inst[2].status==='installeren');
  ok('grade nu al bewaard', inst[2].grade==='A');
  // hervatten pakt op bij de specificaties
  w.eval("apparaten.find(x=>x.id==='a2').status='installeren'; appOpen('a2')");
  ok('hervat bij de specificaties', /Windows draait/.test(tekst()));
  d.getElementById('c_cpu').value='Intel Core i5-1235U';
  d.getElementById('c_ram').value='16 GB';
  w.eval('ctrVeldBewaar()');
  await w.eval('ctrAfronden(document.createElement("button"))');
  const af=w.__geschreven.filter(g=>g[0]==='refurbish_apparaten' && g[1]==='update').pop();
  ok('status klaar', af[2].status==='klaar');
  ok('grade opgeslagen', af[2].grade==='A');
  ok('nul strafpunten', af[2].punten===0);
  ok('specificaties bewaard', af[2].specs.Processor==='Intel Core i5-1235U');
  ok('model onthouden', w.__rpcs.some(r=>r[0]==='model_onthouden'));

  // ── grade rekenen ──
  ok('grade B bij 5 punten', w.eval('gradeVan(5)')==='B');
  ok('grade C bij 9 punten', w.eval('gradeVan(9)')==='C');
  ok('barst telt zwaar door', w.eval('gradeVan(8)')==='C');

  // ── pad 3: werkt, maar een kapotte toets → reparatie ──
  w.eval(`
    apparaten.push({id:'a3', code:'A0003', merk:'Lenovo', model:'ThinkPad T14',
      categorie:'Laptop', specs:{}, status:'te_controleren', checklist:[], defecten:[], goede_delen:[],
      aangemaakt_op:new Date().toISOString()});
    appOpen('a3'); ctrKies('start','Ja'); ctrGa('hardware');
    HARDWARE_CHECKS.forEach(q=>ctr.antwoord[q.v]='Ja');
    ctr.antwoord['Werkt het toetsenbord, alle toetsen?']='Nee';
    ctrGa('visueel');
    ctrPunt('Behuizing','Lichte gebruikssporen',1); ctrPunt('Scherm','Gaaf',0);
    ctrPunt('Toetsenbord','Licht sleets',1); ctrPunt('Scharnieren en deksel','Stevig',0);
    ctrNotitie('Werkt het toetsenbord, alle toetsen?','spatiebalk blijft hangen');`);
  ok('grade B bij twee punten', d.querySelector('.gradeletter').textContent==='A');
  await w.eval('ctrAfronden(document.createElement("button"))');
  const rep=w.__geschreven.filter(g=>g[0]==='refurbish_apparaten' && g[1]==='update').pop();
  ok('kapotte toets stuurt naar reparatie', rep[2].status==='te_repareren');
  ok('defect vastgelegd', rep[2].defecten.some(x=>/toetsenbord/i.test(x)));
  ok('notitie bij het defect bewaard', rep[2].checklist.some(r=>r.n==='spatiebalk blijft hangen'));
  ok('grade blijft berekend', rep[2].grade==='A');

  // ── label na afloop ──
  w.eval(`
    apparaten[0].status='repurpose'; apparaten[0].goede_delen=['Scherm','Accu'];
    labelsTonen('a1');`);
  const et=d.getElementById('venster').innerHTML;
  ok('label onderdelen', /ONDERDELEN/.test(et) && /Nog goed/.test(et) && /· Accu/.test(et));
  w.eval(`
    apparaten[1].status='klaar'; apparaten[1].grade='A';
    apparaten[1].specs={Processor:'i5', Geheugen:'16 GB'}; apparaten[1].accu=88;
    labelsTonen('a2');`);
  const et2=d.getElementById('venster').innerHTML;
  ok('label met grade', /etgrade">A</.test(et2) && /KLAAR VOOR VERKOOP/.test(et2));
  ok('label met specs', /RAM: 16 GB/.test(et2));
  ok('accu op het label', /Accu: 88%/.test(et2));
  ok('code onder de qr', /etqr[\s\S]*etcode/.test(et2));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
},450);
