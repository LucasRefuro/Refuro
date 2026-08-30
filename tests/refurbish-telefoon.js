const {JSDOM}=require('jsdom'); const fs=require('fs');
const path=require('path');
const bron=path.join(__dirname,'..','refurbish/index.html');
const MOCK=`<script>
window.__geschreven=[];
const _leeg={select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
  in(){return this;},maybeSingle:async()=>({data:null}),
  insert(r){window.__geschreven.push(r);return {select:async()=>({data:[{id:'hw1'}],error:null})};},
  update(r){window.__geschreven.push(r);return this;},delete(){return this;},then(res){res({data:[],error:null});}};
window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
  from:(n)=> n==='accounts'?{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'L'}})}:_leeg,
  rpc:async()=>({data:null}), storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})}})};
<\/script>`;
let fout=0; const ok=(n,c,e)=>{console.log((c?'ok   ':'FOUT ')+n); if(!c){fout++; if(e)console.log('     '+e);}};
const html=fs.readFileSync(bron,'utf8').replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/,MOCK);
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://storvo.app/refurbish/',pretendToBeVisual:true});
const w=dom.window; const fouten=[]; w.onerror=(m)=>fouten.push(String(m));
setTimeout(async()=>{
  ok('app start zonder fout', fouten.length===0, fouten.slice(0,2).join(' | '));

  w.eval(`
    account={team_id:'t1'}; hardwares=[]; voorraaddelen=[]; batches=[]; instel={accu_min:85};
    apparaten=[{id:'p1', code:'P1', merk:'Apple', model:'iPhone 12', categorie:'Telefoon', specs:{},
      status:'te_controleren', inkoop:100, accu:null, nieuwe_accu:false, extra_kosten:[],
      checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}];
    appOpen('p1');`);
  ok('telefoon opent de controle', w.eval("!!ctr && ctr.a.id==='p1'"));
  ok('profiel Telefoon: eigen stappen', w.eval("prof().stappen.join(',')")==='start,blokkers,test,specs,visueel,klaar');
  ok('geen upgrade en geen windows', !w.eval("prof().stappen.includes('windows')") && !w.eval("prof().stappen.includes('upgrade')"));
  ok('balk toont Sloten en Test', (()=>{const n=w.eval("prof().balk.map(b=>b.naam).join(',')"); return n.includes('Sloten')&&n.includes('Test');})());
  ok('tijdlijn heeft zes segmenten', w.eval("prof().balk.length")===6);

  // start-stap: telefoon-tekst en -icoon
  const start=w.eval("CTR_STAPPEN.start.inhoud()");
  ok('start toont "Zet de telefoon aan"', /Zet de telefoon aan/.test(start));
  ok('start gebruikt het telefoon-icoon', /i-telefoon/.test(start));

  // eigen winkel-checklist voor telefoon hoort in de test-stap te verschijnen
  w.eval(`checklists=[{categorie:'Telefoon', model:null, items:[{v:'Zit de simlade erin?', a:['Ja','Nee','Ontbreekt']}]}]; ctr.stap='test';`);
  ok('eigen checklist verschijnt in de test-stap', /Zit de simlade erin/.test(w.eval("CTR_STAPPEN.test.inhoud()")));
  w.eval("checklists=[];");

  // ── blokkers: een geblokkeerd IMEI keurt af ──
  w.eval("ctr.stap='blokkers'; ctr.antwoord={};");
  ok('nog geen blokker', w.eval("ctrBlokkers().length")===0);
  w.eval("ctr.antwoord['Is het IMEI schoon, niet als gestolen of geblokkeerd gemeld?']='Geblokkeerd';");
  ok('geblokkeerd IMEI is een blokker', w.eval("ctrBlokkers().length")===1);
  const blkn=w.eval("(CTR_STAPPEN.blokkers.knoppen()[0]||{}).tekst||''");
  ok('knop wordt "Afkeuren, niet verkoopbaar"', /Afkeuren/.test(blkn), 'kreeg '+blkn);

  // afronden met blokker -> status geblokkeerd, niet naar voorraad
  w.eval("window.__geschreven=[];");
  await w.eval("ctrAfronden(document.createElement('button'))");
  const upd=w.eval("JSON.stringify(window.__geschreven.find(r=>r&&r.status)||{})");
  ok('afronden zet status geblokkeerd', /"status":"geblokkeerd"/.test(upd), 'kreeg '+upd);
  ok('geblokkeerd toestel gaat NIET naar de hardware-voorraad',
     !w.eval("window.__geschreven.some(r=>r&&r.kanalen)"));

  // ── grade op de telefoon-vlakken (opnieuw opzetten; afronden riep allesLaden) ──
  w.eval(`
    apparaten=[{id:'p1', code:'P1', merk:'Apple', model:'iPhone 12', categorie:'Telefoon', specs:{},
      status:'te_controleren', inkoop:100, accu:null, nieuwe_accu:false, extra_kosten:[],
      checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}];
    appOpen('p1'); ctr.punten={'Voorglas / scherm':{l:'Barst of dode zone',p:8}};`);
  ok('barst voorglas geeft 8 strafpunten', w.eval("ctrPunten()")===8);
  ok('barst voorglas -> grade C', w.eval("gradeVan(ctrPunten())")==='C');
  ok('barst voorglas is een defect', /Barst of dode zone/.test(w.eval("JSON.stringify(ctrDefecten())")));
  w.eval("ctr.punten={'Voorglas / scherm':{l:'Lichte krasjes',p:1}};");
  ok('lichte krasjes -> grade A', w.eval("gradeVan(ctrPunten())")==='A');

  // ── een functie op Nee wordt een reparatie-defect ──
  w.eval("ctr.antwoord={}; ctr.antwoord['Werkt de flitser?']='Nee';");
  ok('flitser nee -> defect', /Werkt de flitser\?/.test(w.eval("JSON.stringify(ctrDefecten())")));

  // ── test met de telefoon: code aanmaken + uitslag koppelen ──
  w.eval(`
    apparaten=[{id:'p2', code:'P2', merk:'Apple', model:'iPhone 13', categorie:'Telefoon', specs:{},
      status:'te_controleren', inkoop:100, accu:null, nieuwe_accu:false, extra_kosten:[],
      checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}];
    appOpen('p2'); ctr.stap='test'; window.__geschreven=[];`);
  ok('test-app knop in de test-stap', /Test met de telefoon/.test(w.eval("CTR_STAPPEN.test.inhoud()")));
  await w.eval("testStart(document.createElement('button'))");
  ok('testStart maakt een code aan', !!w.eval("ctr.testcode"));
  ok('code wordt naar refurbish_testcodes geschreven', w.eval("window.__geschreven.some(r=>r&&r.code&&r.apparaat_id)"));
  ok('QR verschijnt na het starten', /qrbeeld/.test(w.eval("CTR_STAPPEN.test.inhoud()")));
  ok('de testcode overleeft een herlaad (in de snapshot)', (()=>{ w.eval("sessieBewaar()"); return !!(JSON.parse(w.eval("JSON.stringify(sessieLaden())")).ctr||{}).testcode; })());
  // de koppeling van uitslag naar antwoorden (zoals testOphalen doet): alleen lege
  // vragen invullen, een met de hand gezet antwoord niet stil overschrijven
  w.eval(`
    ctr.antwoord={}; ctr.antwoord['Werkt de camera achter, scherp en zonder vlekken?']='Nee';
    const uit={touch:'ok', luidspreker:'fout', camera_achter:'ok'};
    prof().hardware.forEach(q=>{ if(q.test && (uit[q.test]==='ok'||uit[q.test]==='fout')){
      const nieuw=uit[q.test]==='ok'?'Ja':'Nee', oud=ctr.antwoord[q.v];
      if(oud&&oud!==nieuw) return; if(!oud) ctr.antwoord[q.v]=nieuw; } });`);
  ok('touch ok wordt Ja (was leeg)', w.eval("ctr.antwoord['Reageert het touchscreen overal, zonder dode zones of spooktikken?']")==='Ja');
  ok('luidspreker fout wordt Nee', w.eval("ctr.antwoord['Werkt de luidspreker?']")==='Nee');
  ok('handmatig Nee blijft staan ondanks test ok', w.eval("ctr.antwoord['Werkt de camera achter, scherp en zonder vlekken?']")==='Nee');
  ok('een gefaalde test wordt een defect', /Werkt de luidspreker\?/.test(w.eval("JSON.stringify(ctrDefecten())")));

  // ── de andere categorieën: profielen kloppen ──
  const pv=(cat)=>{ w.eval("ctr={a:{categorie:'"+cat+"'}}"); return JSON.parse(w.eval(
    "JSON.stringify({stap:prof().stappen, accu:prof().heeftAccu!==false, blok:(prof().blokkers||[]).length, balk:prof().balk.length, icon:prof().icon})")); };
  const tab=pv('Tablet');
  ok('tablet: sloten-triage, geen windows', tab.stap.join(',')==='start,blokkers,test,specs,visueel,klaar');
  ok('tablet: heeft accu en 3 blokkers', tab.accu===true && tab.blok===3);
  const desk=pv('Desktop');
  ok('desktop: draait Windows met upgrade', desk.stap.includes('windows') && desk.stap.includes('upgrade'));
  ok('desktop: geen accu, wel BIOS-blokkers', desk.accu===false && desk.blok===2);
  const mon=pv('Monitor');
  ok('monitor: geen sloten en geen windows', !mon.stap.includes('blokkers') && !mon.stap.includes('windows'));
  ok('monitor: geen accu', mon.accu===false);
  const ov=pv('Overig');
  ok('overig: generieke stappen met slot-triage', ov.stap.join(',')==='start,blokkers,test,specs,visueel,klaar');
  ok('overig: één herkomst-blokker', ov.blok===1);
  ok('onbekende categorie valt terug op laptop', (()=>{ w.eval("ctr={a:{categorie:'Onzin'}}"); return w.eval("prof().icon")==='i-laptop'; })());

  // heeftAccu: een desktop toont geen accu-vraag in de Windows-nakijkstap
  w.eval(`apparaten=[{id:'d1',code:'D1',merk:'Dell',model:'Optiplex',categorie:'Desktop',specs:{},
    status:'te_controleren',accu:null,nieuwe_accu:false,extra_kosten:[],checklist:[],defecten:[],
    goede_delen:[],aangemaakt_op:new Date().toISOString()}]; appOpen('d1'); ctr.stap='nawindows';
    ctr.antwoord={'Is Windows geïnstalleerd en start hij op?':'Ja'};`);
  ok('desktop nawindows toont geen accu-blok', !/Hoeveel van de accu/.test(w.eval("CTR_STAPPEN.nawindows.inhoud()")));

  // ── bugfixes uit de doorlichting ──
  // Optionele functies (Niet aanwezig) mogen geen vals defect geven (tablet).
  w.eval(`apparaten=[{id:'t1',code:'T1',merk:'Apple',model:'iPad',categorie:'Tablet',specs:{},
    status:'te_controleren',accu:null,nieuwe_accu:false,extra_kosten:[],checklist:[],defecten:[],
    goede_delen:[],aangemaakt_op:new Date().toISOString()}]; appOpen('t1');
    prof().hardware.forEach(q=>ctr.antwoord[q.v]='Ja');
    ctr.antwoord['Werkt de vingerafdruk of gezichtsontgrendeling?']='Niet aanwezig';
    ctr.antwoord['Werkt de camera achter?']='Niet aanwezig';`);
  ok('tablet: niet-aanwezige feature telt niet als defect', w.eval("ctrDefecten().length")===0);
  ok('tablet: een Nee telt wel als defect', (()=>{ w.eval("ctr.antwoord['Werken alle knoppen?']='Nee'"); return w.eval("ctrDefecten().length")===1; })());

  // Desktop: ethernet en wifi/bluetooth gesplitst, wifi mag ontbreken.
  w.eval("ctr={a:{categorie:'Desktop'}}");
  ok('desktop: ethernet en wifi apart gevraagd',
    w.eval("prof().hardware.some(q=>/ethernet/.test(q.v)) && prof().hardware.some(q=>/wifi en bluetooth/.test(q.v))"));
  ok('desktop: wifi mag ontbreken zonder defect',
    w.eval("(prof().hardware.find(q=>/wifi en bluetooth/.test(q.v))||{a:[]}).a.includes('Niet aanwezig')"));

  // Desktop hervat: de blokkers-stap valt niet uit het pad.
  w.eval(`apparaten=[{id:'d2',code:'D2',merk:'Dell',model:'Optiplex',categorie:'Desktop',specs:{},
    status:'installeren',accu:null,nieuwe_accu:false,extra_kosten:[],checklist:[],defecten:[],
    goede_delen:[],aangemaakt_op:new Date().toISOString()}]; appOpen('d2');`);
  ok('desktop hervat: blokkers zit in het pad', w.eval("ctr.pad.join(',')")==='start,blokkers,hardware,upgrade,windows');

  // Overig: een op slot staand toestel wordt geblokkeerd, niet klaar.
  w.eval(`apparaten=[{id:'o1',code:'O1',merk:'Apple',model:'Watch',categorie:'Overig',specs:{},
    status:'te_controleren',accu:null,nieuwe_accu:false,extra_kosten:[],checklist:[],defecten:[],
    goede_delen:[],aangemaakt_op:new Date().toISOString()}]; appOpen('o1');
    ctr.antwoord['Is het toestel vrij van een account-slot of bedrijfsbeheer, en niet als gestolen gemeld?']='Op slot';`);
  ok('overig: op slot is een blokker', w.eval("ctrBlokkers().length")===1);

  // Overig zonder extra uitrusting: geen lege kop 'Extra uitrusting'.
  w.eval("ctr={a:{categorie:'Overig'},antwoord:{},punten:{},specs:{},accu:'',notities:{},opties:{}}");
  ok('overig: geen lege kop Extra uitrusting', !/Extra uitrusting/.test(w.eval("CTR_STAPPEN.specs.inhoud()")));

  // ── auto-doorgaan: alles ingevuld -> vanzelf naar de volgende stap ──
  w.eval(`
    apparaten=[{id:'p3', code:'P3', merk:'Apple', model:'iPhone 14', categorie:'Telefoon', specs:{},
      status:'te_controleren', inkoop:100, accu:null, nieuwe_accu:false, extra_kosten:[],
      checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}];
    appOpen('p3'); ctrKies('start','Ja');`);
  ok('start staat vast na antwoord (voor de timer)', w.eval("ctr.stap")==='start');
  await new Promise(r=>setTimeout(r,650));
  ok('start gaat vanzelf door naar de sloten', w.eval("ctr.stap")==='blokkers', 'kreeg '+w.eval("ctr.stap"));
  // Enter drukt de voorwaartse knop als de stap af is
  w.eval(`ctr.stap='blokkers'; ctr.antwoord={};
    prof().blokkers.forEach(q=>ctr.antwoord[q.v]=q.a[0]); ctrTeken();
    ctrEnter({key:'Enter', shiftKey:false, target:{tagName:'DIV'}, preventDefault:()=>{}});`);
  ok('Enter gaat door naar de test', w.eval("ctr.stap")==='test', 'kreeg '+w.eval("ctr.stap"));

  ok('geen paginafouten', fouten.length===0, fouten.slice(0,2).join(' | '));
  console.log(fout?('\n'+fout+' FOUT'):'\ntelefoon-controle in orde'); w.close(); process.exit(fout?1:0);
},450);
