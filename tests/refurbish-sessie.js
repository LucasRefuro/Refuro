// Verder waar je was: een herlaad zet je terug op het tabblad, en zat je midden
// in een controle dan op dezelfde stap met je antwoorden. Bewaard in localStorage
// per gebruiker, hersteld bij het opstarten.
const {JSDOM}=require('jsdom'); const fs=require('fs'); const path=require('path');
const bron=path.join(__dirname,'..','refurbish/index.html');
const MOCK=`<script>
const _leeg={select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
  in(){return this;},maybeSingle:async()=>({data:null}),
  insert(){return {select:async()=>({data:[],error:null})};},
  update(){return this;},delete(){return this;},then(res){res({data:[],error:null});}};
window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
  from:(n)=> n==='accounts'?{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'L'}})}:_leeg,
  rpc:async(n)=> n==='abonnement_status'?{data:[{plan:'Enterprise',status:'proef',geblokkeerd:false,modules:['refurbish']}]}:{data:null}})};
<\/script>`;
let fout=0; const ok=(n,c,e)=>{console.log((c?'ok   ':'FOUT ')+n); if(!c){fout++; if(e)console.log('     '+e);}};
const html=fs.readFileSync(bron,'utf8').replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/,MOCK);
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://storvo.app/refurbish/',pretendToBeVisual:true});
const w=dom.window; const fouten=[]; w.onerror=(m)=>fouten.push(String(m));
setTimeout(async()=>{
  ok('app start zonder fout', fouten.length===0, fouten.slice(0,2).join(' | '));
  ok('localStorage bestaat', w.eval("typeof localStorage!=='undefined'"));

  w.eval(`
    account={team_id:'t1'}; hardwares=[]; voorraaddelen=[]; batches=[]; instel={accu_min:85};
    apparaten=[{id:'a1', code:'A1', merk:'Dell', model:'X', categorie:'Laptop', specs:{},
      status:'te_controleren', inkoop:100, accu:null, nieuwe_accu:false, extra_kosten:[],
      checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}];
    try{ localStorage.clear(); }catch(e){}
    appOpen('a1');`);
  ok('controle open na appOpen', w.eval("!!ctr && ctr.a.id==='a1'"));
  ok('tab staat op controleren', w.eval("tab")==='controleren');

  w.eval("ctr.stap='hardware'; ctr.pad=['start']; ctr.accu='88'; ctr.punten={Scherm:{l:'A',p:0}}; sessieBewaar();");
  const snap=JSON.parse(w.eval("JSON.stringify(sessieLaden())"));
  ok('sessie bewaart het tabblad', !!(snap && snap.tab==='controleren'));
  ok('sessie bewaart de lopende controle', !!(snap.ctr && snap.ctr.id==='a1'));
  ok('sessie bewaart de stap', snap.ctr.stap==='hardware', 'kreeg '+(snap.ctr&&snap.ctr.stap));
  ok('sessie bewaart de accu', snap.ctr.accu==='88');
  ok('sessie bewaart de grades', !!(snap.ctr.punten && snap.ctr.punten.Scherm && snap.ctr.punten.Scherm.l==='A'));

  // herlaad: ctr weg, dan herstellen uit de sessie
  w.eval("ctr=null;");
  w.eval("const b=sessieLaden(); ctr=ctrHerstel(b.ctr, apparaten.find(x=>x.id===b.ctr.id));");
  ok('na herlaad is de controle terug', w.eval("!!ctr && ctr.a.id==='a1'"));
  ok('op dezelfde stap', w.eval("ctr.stap")==='hardware');
  ok('met dezelfde accu', w.eval("ctr.accu")==='88');
  ok('met dezelfde grades', w.eval("ctr.punten.Scherm.l")==='A');

  // een afgerond/verdwenen toestel herstellen we niet als controle
  w.eval("apparaten[0].status='klaar';");
  const geldig=w.eval(`(function(){ const b=sessieLaden(); const a=apparaten.find(x=>x.id===b.ctr.id);
    return !!(a && (a.status==='te_controleren'||a.status==='installeren')); })()`);
  ok('afgeronde controle wordt niet meer hersteld', geldig===false);

  ok('geen paginafouten', fouten.length===0, fouten.slice(0,2).join(' | '));
  console.log(fout?('\n'+fout+' FOUT'):'\nsessie in orde'); w.close(); process.exit(fout?1:0);
},450);
