// De accugrens, het Windows-pad met wachtscherm, en de uitvoeringen bij het opzoeken.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const MOCK=`<script>
window.__db={
  refurbish_apparaten:[
    {id:'a1', team_id:'t1', code:'A0001', merk:'HP', model:'EliteBook 840 G6', categorie:'Laptop',
     specs:{}, status:'te_controleren', checklist:[], defecten:[], goede_delen:[],
     aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_onderdelen:[], refurbish_checklists:[], refurbish_orders:[],
  hardware_modellen:[],
  refurbish_instellingen:{team_id:'t1', accu_min:80}
};
window.__geschreven=[]; window.__rpcs=[];
function __tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},
    maybeSingle:async()=>({data: Array.isArray(window.__db[naam])
      ? (window.__db[naam][0]||null) : (window.__db[naam]||null)}),
    insert(r){ window.__geschreven.push([naam,'insert',r]);
      return {select:async()=>({data:[],error:null})}; },
    upsert(r){ window.__geschreven.push([naam,'upsert',r]); return api; },
    update(r){ window.__geschreven.push([naam,'update',r]); return api; },
    delete(){ return api; },
    then(res){ res({data: Array.isArray(window.__db[naam])?window.__db[naam]:[], error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
  from:(n)=> n==='accounts'
    ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'Lucas'}})}
    : __tabel(n),
  rpc:async(naam,arg)=>{ window.__rpcs.push([naam,arg]);
    return naam==='abonnement_status'
      ? {data:[{plan:'Enterprise',status:'actief',geblokkeerd:false,modules:['refurbish']}]}
      : {data:null}; }
})};
<\/script>`;

const html=fs.readFileSync(bron('refurbish/index.html'),'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK);
const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/refurbish/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[]; w.onerror=(m)=>fouten.push(String(m));
const d=()=>w.document;
const tekst=()=>d().getElementById('ctrPagina').textContent;
const knop=(deel)=>[...d().querySelectorAll('#ctrPagina .ctrvoet button')]
  .find(b=>b.textContent.includes(deel));

setTimeout(async()=>{
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  // ── instelling voor de accugrens ──
  ok('instelling geladen', w.eval('instel.accu_min')===80);
  ok('veld op de checklistpagina', !!d().getElementById('in_accu'));
  ok('veld toont de grens', d().getElementById('in_accu').value==='80');
  d().getElementById('in_accu').value='85';
  await w.eval('instelOpslaan(document.createElement("button"))');
  const bewaard=w.__geschreven.find(g=>g[0]==='refurbish_instellingen');
  ok('grens opgeslagen', !!bewaard && bewaard[2].accu_min===85);
  ok('grens meteen actief', w.eval('instel.accu_min')===85);

  // ── controle tot de hardwarestap ──
  w.eval("appOpen('a1'); ctrKies('start','Ja')");
  knop('Door naar de hardware').click();
  ok('accuveld aanwezig', !!d().getElementById('c_accu'));
  ok('grens genoemd bij het veld', /grens staat op 85%/.test(tekst()));

  w.eval("ctrAccu('90')");
  ok('boven de grens geen waarschuwing', !/Advies: accu vervangen/.test(tekst()));
  ok('boven de grens een bevestiging', /boven de grens/.test(tekst()));

  w.eval("ctrAccu('72')");
  ok('onder de grens een advies', /Advies: accu vervangen/.test(tekst()));
  ok('percentage genoemd', /72% is onder jouw grens van 85%/.test(tekst()));
  ok('knop om te vervangen', !!d().querySelector('.accuknop input'));
  w.eval('ctrAccuVervangen(true)');
  ok('vervangen aangevinkt', w.eval('ctr.accuVervangen')===true);
  w.eval("ctrAccu('95')");
  ok('vinkje vervalt boven de grens', w.eval('ctr.accuVervangen')===false);
  w.eval("ctrAccu('72'); ctrAccuVervangen(true)");

  // ── na Windows nakijken ──
  ok('toetsenbord kan uitgesteld', /Na Windows/.test(tekst()));
  w.eval(`HARDWARE_CHECKS.forEach(q=>ctr.antwoord[q.v]='Ja');
    ctr.antwoord['Werken wifi en bluetooth?']='Na Windows';
    ctr.antwoord['Werkt het geluid?']='Na Windows';
    ctrTeken();`);
  ok('twee uitgestelde checks', w.eval('ctrUitgesteld().length')===2);

  knop('Door naar de staat').click();
  w.eval(`ctrPunt('Behuizing','Als nieuw',0); ctrPunt('Scherm','Gaaf',0);
    ctrPunt('Toetsenbord','Letters gaaf',0); ctrPunt('Scharnieren en deksel','Stevig',0);`);
  knop('Door naar Windows').click();
  ok('windowsstap', /Windows installeren/.test(tekst()));
  ok('knop later installeren', !!knop('later installeren'));

  knop('Installatie gestart').click();
  ok('wachtscherm', /Bezig met Windows installeren/.test(tekst()));
  ok('draaiend rondje', !!d().querySelector('#ctrPagina .spinner'));
  ok('knop volgende laptop', !!knop('Volgende laptop'));

  knop('Windows is klaar').click();
  ok('bevestigingsscherm', /Start Windows op en is hij bijgewerkt/.test(tekst()));
  ok('uitgestelde checks terug', /wifi en bluetooth/.test(tekst()) && /Werkt het geluid/.test(tekst()));
  ok('nog niet door zonder bevestiging', !knop('Door naar de specificaties'));
  w.eval("ctrKies('windowsgoed','Nee')");
  ok('waarschuwing bij niet gelukt', /Los het eerst op/.test(tekst()));
  w.eval("ctrKies('windowsgoed','Ja')");
  ok('nog steeds niet door met open checks', !knop('Door naar de specificaties'));
  w.eval("ctrKies('Werken wifi en bluetooth?','Ja'); ctrKies('Werkt het geluid?','Ja')");
  ok('nu wel door', !!knop('Door naar de specificaties'));

  // ── uitvoeringen ──
  knop('Door naar de specificaties').click();
  ok('specstap', /Windows draait/.test(tekst()));
  w.eval(`ctr.varianten=[
    {Processor:'Intel Core i5-8365U', Geheugen:'8 GB', Opslag:'256 GB SSD'},
    {Processor:'Intel Core i7-8665U', Geheugen:'16 GB', Opslag:'512 GB SSD'}];
    ctrTeken();`);
  const uit=d().getElementById('ctrPagina').innerHTML;
  ok('uitvoeringen getoond', /Welke uitvoering heb je voor je/.test(uit));
  ok('eerste uitvoering', /i5-8365U/.test(uit) && /8 GB · 256 GB SSD/.test(uit));
  ok('tweede uitvoering', /i7-8665U/.test(uit) && /16 GB · 512 GB SSD/.test(uit));
  w.eval('ctrVariant(1)');
  ok('kiezen vult de velden', d().getElementById('c_ram').value==='16 GB');
  ok('gekozen uitvoering gemarkeerd', !!d().querySelector('.uitknop.aan'));

  // ── afronden: accu telt als defect ──
  await w.eval('ctrAfronden(document.createElement("button"))');
  const af=w.__geschreven.filter(g=>g[0]==='refurbish_apparaten' && g[1]==='update').pop();
  ok('accu maakt er een reparatie van', af[2].status==='te_repareren');
  ok('accu als defect vastgelegd', af[2].defecten.some(x=>/Accu vervangen/.test(x)));
  ok('accupercentage bewaard', af[2].accu===72);
  ok('specificaties bewaard', af[2].specs.Geheugen==='16 GB');

  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
},450);
