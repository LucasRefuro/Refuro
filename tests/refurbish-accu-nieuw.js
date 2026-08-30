// De nieuwe-accu-vlag: handmatig aanvinken zet 100% en haalt het "vervangen"-
// advies weg, en een accu uit de onderdelenvoorraad zet de vlag automatisch. Het
// label toont "nieuw" in plaats van een percentage.
const {JSDOM}=require('jsdom'); const fs=require('fs'); const path=require('path');
const bron=path.join(__dirname,'..','refurbish/index.html');
const MOCK=`<script>
window.__geschreven=[];
const _leeg={select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
  in(){return this;},maybeSingle:async()=>({data:null}),
  insert(){return {select:async()=>({data:[],error:null})};},
  update(r){window.__geschreven.push(r);return this;},delete(){return this;},then(res){res({data:[],error:null});}};
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

  w.eval(`
    account={team_id:'t1'}; hardwares=[]; voorraaddelen=[]; instel={accu_min:85};
    apparaten=[{id:'a1', code:'A1', merk:'Dell', model:'X', categorie:'Laptop', specs:{},
      status:'te_controleren', inkoop:100, accu:70, nieuwe_accu:false, extra_kosten:[],
      checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}];
    appOpen('a1'); ctrGa('nawindows'); ctrAccu('70');`);
  w.eval("ctrAccuVervangen(true)");
  ok('accuVervangen aan bij 70 onder 85', w.eval("ctr.accuVervangen")===true);
  w.eval("ctrNieuweAccu(true)");
  ok('nieuwe accu: vlag aan', w.eval("ctr.nieuweAccu")===true);
  ok('nieuwe accu: percentage naar 100', w.eval("ctr.accu")==='100');
  ok('nieuwe accu: vervangen weer uit', w.eval("ctr.accuVervangen")===false);
  ok('nieuwe accu: veld toont 100', w.eval("document.getElementById('c_accu').value")==='100');
  ok('geen defect "accu vervangen" meer', !w.eval("JSON.stringify(ctrDefecten())").includes('Accu vervangen'));

  w.eval(`
    voorraaddelen=[{id:'v1', naam:'Accu Dell', soort:'accu', aantal:3, prijs:40, lots:[{aantal:3,prijs:40}]}];
    apparaten=[{id:'a2', code:'A2', merk:'HP', model:'Y', categorie:'Laptop', specs:{},
      status:'te_controleren', inkoop:100, accu:60, nieuwe_accu:false, extra_kosten:[],
      checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}];
    appOpen('a2'); ctrGa('upgrade');
    document.getElementById('ctr_upg').value='v1';
    document.getElementById('ctr_upg_aantal').value='1';`);
  await w.eval("ctrUpgrade(document.createElement('button'))");
  ok('accu uit voorraad: vlag aan', w.eval("ctr.nieuweAccu")===true);
  ok('accu uit voorraad: toestel-accu 100', w.eval("ctr.a.accu")===100);
  ok('accu uit voorraad: inkoop +40', w.eval("ctr.a.inkoop")===140, 'kreeg '+w.eval("ctr.a.inkoop"));
  ok('een db-schrijf had nieuwe_accu:true', w.eval("window.__geschreven.some(r=>r&&r.nieuwe_accu===true)")===true);

  const lab=w.eval("labelHtml({merk:'HP', model:'Y', status:'klaar', grade:'B', specs:{}, accu:60, nieuwe_accu:true})");
  ok('label toont "Accu: nieuw"', /Accu: nieuw/.test(lab));
  ok('label toont niet het oude 60%', !/Accu: 60%/.test(lab));

  ok('geen paginafouten', fouten.length===0, fouten.slice(0,2).join(' | '));
  console.log(fout?('\n'+fout+' FOUT'):'\nnieuwe accu in orde'); w.close(); process.exit(fout?1:0);
},450);
