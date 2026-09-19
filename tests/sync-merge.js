// Bewaakt de samenvoeging van de winkeldata-sync: het hart waar bij dataverlies
// een verkoop of een instelling stil kon wegvallen. Dit subsysteem had geen test;
// deze legt precies het gedrag vast dat na de doorlichting is rechtgezet:
//   - uid() botst nooit binnen een apparaat (bon met meerdere regels)
//   - een nieuwe verkoop overleeft altijd, ook naast die van een collega
//   - bewerken wint van verwijderen, maar "elders verwijderd en hier ongewijzigd" gaat weg
//   - vaste-id-seeds overschrijven de cloud niet bij de eerste sync
//   - sleutel-objecten (loon per medewerker) voegen per sleutel samen
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const MOCK=`<script>
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:()=>({select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
    in(){return this;},maybeSingle:async()=>({data:null}),then(r){r({data:[],error:null});}}),
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

  // ── uid(): duizenden snelle aanroepen (bon met veel regels) blijven uniek en lopen op ──
  ok('uid botst nooit en loopt altijd op, ook in een tight loop',
    w.eval("(function(){var a=[];for(var i=0;i<5000;i++)a.push(uid());"+
           "var uniek=new Set(a.map(String)).size===a.length;"+
           "var oplopend=a.every(function(v,i){return i===0||v>a[i-1];});"+
           "return uniek&&oplopend;})()"));

  // ── een nieuwe lokale verkoop (nog geen basis) blijft altijd staan ──
  ok('nieuwe lokale verkoop overleeft de eerste sync',
    w.eval("syncVoegLijstSamen(null,[{id:5,t:2}],[],false).length===1"));

  // ── bewerken wint van verwijderen ──
  ok('lokaal bewerkt item overleeft ook als het elders verwijderd is',
    w.eval("(function(){var r=syncVoegLijstSamen([{id:1,v:1}],[{id:1,v:2}],[],false);"+
           "return r.length===1&&r[0].v===2;})()"));

  // ── elders verwijderd en hier ONgewijzigd → weg (bewuste keuze, geen zombie-regels) ──
  ok('elders verwijderd en hier ongewijzigd verdwijnt',
    w.eval("syncVoegLijstSamen([{id:1,v:1}],[{id:1,v:1}],[],false).length===0"));

  // ── twee kassa's voegen elk een verkoop toe: allebei blijven staan ──
  ok('gelijktijdige verkoop van twee kassas gaat niet verloren',
    w.eval("(function(){"+
      "var basis={verkopen:[{id:1,t:1}]};"+
      "var lokaal={verkopen:[{id:2,t:2},{id:1,t:1}]};"+   // wij boekten id2
      "var server={verkopen:[{id:3,t:3},{id:1,t:1}]};"+   // collega boekte id3
      "var r=syncVoegSamen(basis,lokaal,server).verkopen;"+
      "var ids=r.map(function(x){return x.id;}).sort();"+
      "return r.length===3&&ids.join(',')==='1,2,3';})()"));

  // ── vaste-id-seed overschrijft de cloud NIET bij de eerste sync (server leidt) ──
  ok('seed-categorie overschrijft de aangepaste cloudprijs niet bij eerste sync',
    w.eval("(function(){var r=syncVoegLijstSamen(null,"+
      "[{id:1,naam:'Hoesjes',verkoop:14.95}],[{id:1,naam:'Hoesjes',verkoop:20}],true);"+
      "return r.length===1&&r[0].verkoop===20;})()"));

  // ── een gewone (niet-seed) lijst laat bij eerste sync de lokale bewerking wel winnen ──
  ok('niet-seed lijst laat de lokale versie winnen bij eerste sync',
    w.eval("(function(){var r=syncVoegLijstSamen(null,"+
      "[{id:1,v:14.95}],[{id:1,v:20}],false);"+
      "return r.length===1&&r[0].v===14.95;})()"));

  // ── sleutel-object (loon per medewerker): twee mensen zetten een ander loon ──
  ok('twee verschillende lonen overleven allebei (per-sleutel merge)',
    w.eval("(function(){var r=syncVoegMapSamen({emp1:12},{emp1:12,emp3:10},{emp1:12,emp2:15});"+
      "return r.emp1===12&&r.emp2===15&&r.emp3===10;})()"));

  ok('binnen een sleutel wint een bewerking van de oude waarde',
    w.eval("(function(){var r=syncVoegMapSamen({a:1},{a:2},{a:1});return r.a===2;})()"));

  // ── volle doc: loon-conflict tussen twee apparaten laat geen tarief vallen ──
  ok('loon-conflict via syncVoegSamen behoudt alle drie de tarieven',
    w.eval("(function(){"+
      "var basis={lonen:{emp1:12}};"+
      "var lokaal={lonen:{emp1:12,emp3:10}};"+
      "var server={lonen:{emp1:12,emp2:15}};"+
      "var r=syncVoegSamen(basis,lokaal,server).lonen;"+
      "return r.emp1===12&&r.emp2===15&&r.emp3===10;})()"));

  // ── instellingen per subveld: A wijzigt naam, B wijzigt tel, geen van beide valt weg ──
  ok('gelijktijdige instellingen-wijziging per subveld gaat niet verloren',
    w.eval("(function(){"+
      "var basis={instellingen:{naam:'Oud',tel:'1',email:'x'}};"+
      "var lokaal={instellingen:{naam:'Oud',tel:'2',email:'x'}};"+   // wij wijzigden tel
      "var server={instellingen:{naam:'Nieuw',tel:'1',email:'x'}};"+ // collega wijzigde naam
      "var r=syncVoegSamen(basis,lokaal,server).instellingen;"+
      "return r.naam==='Nieuw'&&r.tel==='2';})()"));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nsync-merge in orde');
  process.exit(fout?1:0);
}, 400);
