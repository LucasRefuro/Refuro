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

  // ── de bestellijst groepeert per leverancier, zonder leverancier onderaan ──
  w.eval("state.producten=[{id:'g1',naam:'A',cat:1,winkel:0,voorraad:0,schap:1,minOver:0,leverancier:'Foneday'},"+
    "{id:'g2',naam:'B',cat:1,winkel:0,voorraad:0,schap:1,minOver:0}];");
  ok('bestellijst groepeert per leverancier', w.eval("var g=bestelPerLeverancier(); g.length===2 && g[0].leverancier==='Foneday' && g[g.length-1].leverancier==='Zonder leverancier'"));

  // ── uitlopend product wordt niet meer besteld, ook niet met een leeg rek ──
  w.eval("state.producten=[{id:'u',naam:'Oud hoesje',cat:1,winkel:0,voorraad:0,schap:1,minOver:0,uitlopend:true}];");
  ok('uitlopend product staat niet op de bestellijst', w.eval("!bestelLijst().some(p=>p.id==='u')"));

  // ── opvolger wacht op de voorganger en komt pas op de lijst als die op is ──
  w.eval("state.producten=[{id:'ov',naam:'Oud',cat:1,winkel:1,voorraad:2,schap:1,minOver:0,uitlopend:true,opvolgerId:'nw'},"+
    "{id:'nw',naam:'Nieuw',cat:1,winkel:0,voorraad:0,schap:1,minOver:0,wachtOpId:'ov'}];");
  ok('opvolger wacht zolang de voorganger voorraad heeft', w.eval("!bestelLijst().some(p=>p.id==='nw')"));
  w.eval("var vg=state.producten.find(p=>p.id==='ov'); vg.voorraad=0; vg.winkel=0;");
  ok('opvolger komt op de bestellijst zodra de voorganger op is', w.eval("bestelLijst().some(p=>p.id==='nw')"));

  // ── blokje-verkoop houdt zijn categorie en de bijbestel-vlag (niet 'Overig') ──
  w.eval("state.verkopen=[]; state.bijbestelBesteld={}; state.kasboek=[]; boekHandmatig(null,'Screenprotector iPhone 12 Clear',9.95,3,2,'pin',1,true);");
  ok('blokje-verkoop legt de categorie vast', w.eval("var v=state.verkopen[0]; v.cat===1 && v.bijbestel===true && v.aantal===2"));
  ok('bijbestel-teller telt uit de verkopen', w.eval("bijbestelAantal(1)===2"));
  w.eval("bijbestelKlaar(1);");
  ok('afvinken zet de bijbestel-teller op nul', w.eval("bijbestelAantal(1)===0"));

  // ── cash zonder bon blijft buiten de kassa, cash met bon niet ──
  w.eval("state.kasboek=[]; kasVerkoop(10,'cash_zb','X');");
  ok('cash zonder bon komt niet in het kasboek', w.eval("state.kasboek.length===0"));
  w.eval("kasVerkoop(10,'cash','Y');");
  ok('cash met bon komt wel in het kasboek', w.eval("state.kasboek.length===1"));

  // ── loonkosten = uren maal uurtarief per teamlid (tarief in state.lonen, op account-id) ──
  w.eval("state.lonen={'acc1':15}; state.uren=[{id:1,medewerker:'acc1',datum:'2026-09-01',uren:8},{id:2,medewerker:'acc1',datum:'2026-09-02',uren:2}];");
  ok('loonkosten = uren maal tarief', w.eval("urenLoonInPeriode(0, Date.now()+864e5)===150"));

  // ── vaste lasten: maandbedrag + jaarbedrag/12, inactieve tellen niet mee ──
  w.eval("state.vasteLasten=[{id:1,naam:'Huur',bedrag:1000,periode:'maand',actief:true},"+
    "{id:2,naam:'Verzekering',bedrag:1200,periode:'jaar',actief:true},"+
    "{id:3,naam:'Oud',bedrag:50,periode:'maand',actief:false}];");
  ok('vaste lasten per maand = maand + jaar/12, zonder inactieve', w.eval("vasteLastenPerMaand()===1100"));

  // ── rapport: resultaat = omzet - inkoop(bij verkoop) - loon - vaste lasten ──
  w.eval("state.vasteLasten=[]; state.lonen={a:10}; state.uren=[{id:1,medewerker:'a',datum:'2026-09-01',uren:5}];"+
    "state.verkopen=[{t:5,verkoop:100,inkoop:40,aantal:1,betaal:'pin'},{t:6,verkoop:50,inkoop:20,aantal:1,betaal:'cash'}];");
  ok('rapport telt omzet, inkoop, loon en vaste lasten samen',
    w.eval("var c=rapportCijfers({van:0,tot:Date.now()+864e5}); c.omzet===150 && c.inkoop===60 && c.brutowinst===90 && c.loon===50 && c.vast===0 && c.resultaat===40"));

  // ── factuur: btw excl.+percentage, per tarief apart, totaal incl. ──
  w.eval("window.__ft=facTotalen({regels:[{aantal:2,stukprijs:50,btw:21},{aantal:1,stukprijs:100,btw:9}]});");
  ok('factuur: subtotaal is excl. btw', w.eval("window.__ft.subtotaal===200"));
  ok('factuur: btw 21% en 9% apart', w.eval("window.__ft.btwMap[21]===21 && window.__ft.btwMap[9]===9"));
  ok('factuur: totaal is incl. btw', w.eval("window.__ft.totaal===230"));

  // ── factuurnummers lopen door per soort per jaar ──
  w.eval("state.facturen=[{soort:'factuur',jaar:2026,volgnr:1},{soort:'factuur',jaar:2026,volgnr:2},{soort:'offerte',jaar:2026,volgnr:1}];");
  ok('volgend factuurnummer telt door', w.eval("facVolgnr('factuur',2026)===3"));
  ok('offertes hebben hun eigen reeks', w.eval("facVolgnr('offerte',2026)===2"));

  // ── Verkoop en Uren staan in de paginakeuze en gaan standaard aan ──
  ok('Verkoop staat in de paginakeuze', w.eval("PAGINAS_BEHEER.some(p=>p[0]==='verkoop')"));
  ok('Uren staat in de paginakeuze', w.eval("PAGINAS_BEHEER.some(p=>p[0]==='uren')"));
  ok('nieuw medewerker-account krijgt Verkoop en Uren standaard aan',
    w.eval("var d=rolDefaultTabs('medewerker'); d.includes('verkoop')&&d.includes('uren')"));

  // ── de eigen paginalijst bepaalt per pagina wat een medewerker ziet ──
  w.eval("gebruiker={id:'m1',naam:'Sam',rol:'medewerker',tabs:['scan','verkoop','uren','producten']};");
  ok('aangevinkte Verkoop is zichtbaar', w.eval("mag('verkoop')===true"));
  ok('aangevinkte Uren is zichtbaar', w.eval("mag('uren')===true"));
  ok('uitgevinkte Kassa blijft verborgen', w.eval("mag('kassa')===false"));
  ok('nieuw volgt producten uit de lijst', w.eval("mag('nieuw')===true"));
  // een pagina buiten de picker (later toegevoegd) volgt de rol, niet de oude lijst
  ok('pagina buiten de picker volgt de rol', w.eval("ROL_TABS.medewerker.push('toekomst'); var r=mag('toekomst'); ROL_TABS.medewerker.pop(); r===true"));
  w.eval("gebruiker=null;");

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
