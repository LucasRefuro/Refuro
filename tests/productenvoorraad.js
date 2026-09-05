// Bewaakt de nieuwe telmanier van de productenvoorraad: winkel en over als twee
// aparte getallen, elk met een eigen minimum, en de bijvul- en bestellijst die
// daarop afgaan. Dit subsysteem had nog geen test; deze legt het gedrag vast.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const MOCK=`<script>
window.__geschreven=[];
function _leegVoor(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},maybeSingle:async()=>({data:null}),
    insert(r){ window.__geschreven.push([naam,'insert',r]);
      return {select:()=>({single:async()=>({data:{id:'x'}})})}; },
    update(r){ window.__geschreven.push([naam,'update',r]); return api; },
    delete(){return api;},then(r){ r({data:[],error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:(n)=>_leegVoor(n),
  rpc:async()=>({data:[]}),
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}),
  removeChannel(){}
})};
<\/script>`;

let html=fs.readFileSync(bron('app/index.html'),'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
  .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');

const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[];
w.onerror=(m)=>fouten.push(String(m));

setTimeout(()=>{
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));

  // ── verkoop: eerst uit de winkel, dan uit de over ──
  const r=w.eval("var tp={winkel:3,voorraad:5,schap:2,minOver:2};"+
    "var a=haalUitVoorraad(tp,1); var b=haalUitVoorraad(tp,3);"+
    "[a,tp.winkel,tp.voorraad,b].join(',')");
  ok('verkoop gaat eerst van de winkel af, en daarna uit de over', r==='0,0,1,1');

  // ── winkel laag maar er ligt genoeg achter → bijvullen, niet bestellen ──
  w.eval("state.producten=[{id:'a',naam:'Hoesje',cat:1,winkel:1,voorraad:5,schap:3,minOver:2}];");
  ok('laag rek met over staat op de bijvullijst', w.eval("bijvulLijst().some(p=>p.id==='a')"));
  ok('en niet op de bestellijst', w.eval("!bestelLijst().some(p=>p.id==='a')"));

  // ── over op/onder z'n minimum → bestellen, met het juiste aantal ──
  w.eval("state.producten=[{id:'b',naam:'Kabel',cat:1,winkel:3,voorraad:4,schap:3,minOver:2}];");
  ok('over onder het minimum staat op de bestellijst', w.eval("bestelLijst().some(p=>p.id==='b')"));
  ok('te bestellen brengt winkel + over samen op hun minimum', w.eval("teBestellen(state.producten[0])")===1);

  // ── winkel laag én niets meer achter → bestellen (kan niet bijhangen) ──
  w.eval("state.producten=[{id:'c',naam:'Lader',cat:1,winkel:1,voorraad:1,schap:3,minOver:0}];");
  ok('leeg magazijn met laag rek → bestellen', w.eval("bestelLijst().some(p=>p.id==='c')"));
  ok('dit hoeft niet op de bijvullijst', w.eval("!bijvulLijst().some(p=>p.id==='c')"));

  // ── vol rek zonder achtervoorraad-minimum → NIET bestellen ──
  // (over=0 en min.over=0 mag geen reden zijn; anders komt elk accessoire op de lijst)
  w.eval("state.producten=[{id:'v',naam:'Hoesje',cat:1,winkel:1,voorraad:1,schap:1,minOver:0}];");
  ok('vol rek zonder over-minimum staat niet op de bestellijst', w.eval("!bestelLijst().some(p=>p.id==='v')"));

  // ── de vier getallen zijn direct in de tabel te bewerken ──
  w.eval("account={team_id:'t1',rol:'eigenaar'};"+
    "state.producten=[{id:'d',naam:'Glas',cat:1,winkel:2,voorraad:5,schap:2,minOver:2}]; zetVeld('d','over',4);");
  ok('over bewerken past het totaal aan', w.eval("var p=state.producten[0]; p.voorraad===6 && overVoorraad(p)===4"));
  w.eval("zetVeld('d','winkel',5);");
  ok('winkel bewerken houdt de over gelijk', w.eval("var p=state.producten[0]; p.winkel===5 && overVoorraad(p)===4 && p.voorraad===9"));

  // ── migratie: een oud product zonder min. over erft de oude min. voorraad ──
  const m=w.eval("localStorage.setItem('refuro_stock_v2', JSON.stringify({producten:[{id:'e',barcode:'9',naam:'Oud',voorraad:5,winkel:2,min:4}]}));"+
    "String(load().producten[0].minOver)");
  ok('migratie zet min. over uit de oude min. voorraad', m==='4');

  console.log(fout? '\n'+fout+' FOUTEN' : '\nproductenvoorraad in orde');
  process.exit(fout?1:0);
}, 400);
