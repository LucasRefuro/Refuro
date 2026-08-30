// Marge of btw per toestel: een leeg veld volgt de batch, een eigen keuze wint.
// De batchcijfers rekenen de btw per toestel (marge over de winst, normaal over
// de verkoopprijs) en markeren "gemengd" als toestellen verschillen. Bij het
// online zetten erft het veld de batch en wordt de keuze teruggelezen.
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
const bij=(x,y)=>Math.abs(x-y)<0.005;
const html=fs.readFileSync(bron,'utf8').replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/,MOCK);
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://storvo.app/refurbish/',pretendToBeVisual:true});
const w=dom.window; const fouten=[]; w.onerror=(m)=>fouten.push(String(m));
setTimeout(async()=>{
  ok('app start zonder fout', fouten.length===0, fouten.slice(0,2).join(' | '));

  w.eval(`
    account={team_id:'t1'};
    batches=[{id:'b1', nummer:'P', inkoopprijs:0, marge:true, kosten:[]}];
    apparaten=[
      {id:'a1', batch_id:'b1', merk:'Dell', model:'X', inkoop:100, marge:null,  hardware_id:'h1', extra_kosten:[]},
      {id:'a2', batch_id:'b1', merk:'Dell', model:'Y', inkoop:100, marge:false, hardware_id:'h2', extra_kosten:[]}
    ];
    hardwares=[
      {id:'h1', status:'verkocht', verkoop:200, inkoop:100, marge:true,  verkocht_betaal:'pin'},
      {id:'h2', status:'verkocht', verkoop:150, inkoop:100, marge:false, verkocht_betaal:'pin'}
    ];`);
  ok('margeVan: null volgt de batch (true)', w.eval("margeVan(apparaten[0])")===true);
  ok('margeVan: eigen keuze false wint', w.eval("margeVan(apparaten[1])")===false);
  ok('margeVan: geen batch valt terug op marge', w.eval("margeVan({marge:null, batch_id:null})")===true);

  // De btw leest de verkochte hardware-rij (regime + inkoop), niet de werkbank-rij.
  const c=JSON.parse(w.eval("JSON.stringify(batCijfers('b1'))"));
  ok('btw per toestel opgeteld = 43,39', bij(c.btw, 43.39), 'kreeg '+c.btw);
  ok('gemengd wordt gemarkeerd', c.margeGemengd===true);
  ok('omzet klopt (350)', c.omzet===350, 'kreeg '+c.omzet);

  // Zet de balie-rij van h2 ook op margeregeling: dan is niets meer gemengd.
  w.eval("hardwares[1].marge=true;");
  const c2=JSON.parse(w.eval("JSON.stringify(batCijfers('b1'))"));
  ok('beide marge: btw = 26,03', bij(c2.btw, 26.03), 'kreeg '+c2.btw);
  ok('niet meer gemengd', c2.margeGemengd===false);

  // Balie zet h1 op normale btw terwijl de batch marge is: btw over de volle prijs.
  w.eval("hardwares[0].marge=false; hardwares[1].marge=true;");
  const c3=JSON.parse(w.eval("JSON.stringify(batCijfers('b1'))"));
  // h1 normaal: 200*0.21/1.21 = 34,71 ; h2 marge: (150-100)*0.21/1.21 = 8,68 ; som 43,39
  ok('balie-wijziging telt mee in de btw (43,39)', bij(c3.btw, 43.39), 'kreeg '+c3.btw);
  ok('weer gemengd door de balie-keuze', c3.margeGemengd===true);

  w.eval(`
    onderdelen=[]; voorraaddelen=[]; instel={};
    apparaten=[{id:'a3', batch_id:'b1', merk:'HP', model:'Z', categorie:'Laptop', inkoop:100,
      marge:null, specs:{}, accu:90, extra_kosten:[], grade:'B', hardware_id:null,
      status:'klaar', aangemaakt_op:new Date().toISOString()}];
    onlineZetten('a3');`);
  ok('onl.marge erft de batch (true)', w.eval("onl.marge")===true);
  w.eval("tekenOnline(); document.getElementById('onl_marge').value='nee'; onlVeld();");
  ok('onl.marge wordt normale btw na keuze', w.eval("onl.marge")===false);

  ok('geen paginafouten', fouten.length===0, fouten.slice(0,2).join(' | '));
  console.log(fout?('\n'+fout+' FOUT'):'\nmarge in orde'); w.close(); process.exit(fout?1:0);
},450);
