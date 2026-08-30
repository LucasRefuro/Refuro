const {JSDOM}=require('jsdom'); const fs=require('fs');
const path=require('path');
const bron=path.join(__dirname,'..','refurbish/index.html');
const MOCK=`<script>
window.__geschreven=[];
const _leeg={select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
  in(){return this;},maybeSingle:async()=>({data:null}),
  insert(){return {select:async()=>({data:[{id:'hw1'}],error:null})};},
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

  ok('geen paginafouten', fouten.length===0, fouten.slice(0,2).join(' | '));
  console.log(fout?('\n'+fout+' FOUT'):'\ntelefoon-controle in orde'); w.close(); process.exit(fout?1:0);
},450);
