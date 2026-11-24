// Bewaakt het magazijn: de kast achter de winkel met planken, bakken en vakken, en waar elk
// product ligt. De kern is één regel: heeft een product plekken, dan is hun som precies wat er
// achter ligt. Komt er iets bij, dan naar de vaste plek; gaat er iets af, dan uit de plek met
// het minst, en bijhangen noemt precies die plek. Verder: de codes op de labels (A2-3), het
// inrichten (wat je in een vak telt kwam uit de winkeltelling), labels scannen, en extra
// barcodes aan een product koppelen.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

/* Stopt de test zonder process.exit (een belofte die nooit oplost), dan liep node
   vroeger gewoon leeg met code 0: halve test, toch groen. Nu telt dat als fout. */
process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c,extra)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c){ fout++; if(extra!==undefined) console.log('     ', extra); } };

/* Een nagebootste Supabase met een echte, kleine tabel magazijn_plekken in het geheugen:
   toevoegen, wijzigen, weghalen en opvragen werken zoals de app ze gebruikt. */
const MOCK=`<script>
window.__kast=[]; window.__geschreven=[]; window.__nr=0;
function _api(naam){
  let filter=null, rij=null, modus='select';
  const api={
    select(){ return api; }, order(){ return api; }, limit(){ return api; }, in(){ return api; },
    eq(k,v){ filter=[k,v]; return api; }, maybeSingle:async()=>({data:null}),
    insert(r){
      window.__geschreven.push([naam,'insert',r]);
      if(naam==='magazijn_plekken'){ const n=Object.assign({id:'pl'+(++window.__nr)}, r); window.__kast.push(n); rij=n; }
      return {select:()=>({single:async()=>({data:rij||{id:'x'}, error:null})})};
    },
    update(r){ window.__geschreven.push([naam,'update',r]); modus='update'; rij=r; return api; },
    delete(){ modus='delete'; return api; },
    then(res){
      if(naam==='magazijn_plekken'){
        if(modus==='delete' && filter) window.__kast=window.__kast.filter(x=>x[filter[0]]!==filter[1]);
        if(modus==='update' && filter) window.__kast.forEach(x=>{ if(x[filter[0]]===filter[1]) Object.assign(x,rij); });
        res({data: modus==='select' ? window.__kast.map(x=>Object.assign({},x)) : null, error:null});
        return;
      }
      res({data:[],error:null});
    }
  };
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:(n)=>_api(n),
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
/* Wachten op wat we verwachten, niet op een vaste pauze (zie tests/README.md). */
async function wachtOp(vw, max){
  const tot=Date.now()+(max||2000);
  while(Date.now()<tot){ try{ if(vw()) return true; }catch(e){} await new Promise(r=>setTimeout(r,5)); }
  return false;
}
const ev=s=>w.eval(s);

setTimeout(async ()=>{
  ok('app start zonder fout', fouten.length===0, fouten.slice(0,3).join(' | '));
  ev("account={team_id:'t1'}; kastPlekken=[]; kastGeladen=true; window.__kast=[];");

  // ── de pagina hangt onder Voorraad ──
  ok('Magazijn staat in de voorraadbalk', !!w.document.querySelector('#voorraadSub button[data-vsub="magazijn"]'));
  ok('er is een pagina Magazijn', !!w.document.getElementById('tab-magazijn'));
  ok('wie mag tellen mag de kast zien', ev("mag('magazijn')")===true);
  ev("state.modules=Object.assign({}, state.modules||{}, {voorraad:false});");
  ok('staat de winkelvoorraad uit, dan is ook het magazijn weg', ev("mag('magazijn')")===false);
  ev("state.modules.voorraad=true;");

  // ── een lege kast: eerst vastleggen ──
  ev("showTab('magazijn')");
  ok('lege kast vraagt hoeveel planken', await wachtOp(()=>/Kast aanmaken/.test(w.document.getElementById('kastVak').innerHTML)));
  w.document.getElementById('kastAantalPlanken').value='3';
  await ev("kastMaken(null)");
  ok('kast A met drie planken aangemaakt', ev("kastKinderen(null,'kast').length")===1 && ev("kastKinderen(kastKinderen(null,'kast')[0].id,'plank').length")===3);
  ok('alles staat ook in de tabel', w.__kast.length===4);
  ok('de kast heet A, de planken 1 tot 3', ev("kastKinderen(null,'kast')[0].kort")==='A'
     && ev("kastKinderen(kastNu,'plank').map(p=>p.kort).join(',')")==='1,2,3');
  ok('elke plek heeft een scanbare code', ev("kastPlekken.every(p=>/^PL-[A-Z0-9]{6}$/.test(p.code))"));
  ok('en die codes zijn allemaal anders', ev("new Set(kastPlekken.map(p=>p.code)).size===kastPlekken.length"));

  // ── bakken en vakken, en hun codes ──
  const plank2=ev("kastKinderen(kastNu,'plank')[1].id");
  await ev(`kastMaak('bak','${plank2}',{naam:'iPhone 15 serie'})`);
  await ev(`kastMaak('bak','${plank2}')`);
  const bak=await ev(`kastMaak('bak','${plank2}',{naam:'iPhone 16 serie', sub:'Screenprotectors'})`);
  ok('de derde bak op plank 2 heet A2-3', ev(`kastCode('${bak.id}')`)==='A2-3');
  const vak=await ev(`kastMaak('vak','${bak.id}',{naam:'iPhone 16 Pro'})`);
  const vak2=await ev(`kastMaak('vak','${bak.id}',{naam:'iPhone 16'})`);
  ok('een vak heet naar zijn model', ev(`kastNaam('${vak.id}')`)==='A2-3 · iPhone 16 Pro');
  ok('een bak heet naar zijn code en naam', ev(`kastNaam('${bak.id}')`)==='A2-3 · iPhone 16 serie');
  ok('een plank heet Plank A2', ev(`kastNaam('${plank2}')`)==='Plank A2');
  // nummers schuiven niet op: weg met bak 2, een nieuwe bak krijgt het vrije nummer 2
  const bak2=ev(`kastKinderen('${plank2}','bak')[1].id`);
  ok('nummers zijn vast: een nieuwe bak vult het gat', ev(`kastVolgendKort('${plank2}','bak')`)==='4');
  ev(`kastPlekken=kastPlekken.filter(x=>x.id!=='${bak2}')`);
  ok('na weghalen is nummer 2 weer vrij, nummer 3 blijft 3', ev(`kastVolgendKort('${plank2}','bak')`)==='2' && ev(`kastCode('${bak.id}')`)==='A2-3');
  ok('een onbekende plek heeft geen naam (offline: liever niets dan onzin)', ev("kastNaam('bestaat-niet')")==='');

  // ── het model van een product ──
  ev(`state.modellen=['iPhone 16','iPhone 16 Plus','iPhone 16 Pro','iPhone 16 Pro Max','iPhone 16e','iPhone 15','Samsung S24','Samsung S24+','Samsung S24 Ultra']
      .map((n,i)=>({id:i+1, naam:n}));`);
  ok('gekoppeld model wint', ev("kastModelVan({naam:'Glas', modelId:3})")==='iPhone 16 Pro');
  ok('langste model in de naam wint', ev("kastModelVan({naam:'Xssive Backcase iPhone 16 Pro Max - Zwart'})")==='iPhone 16 Pro Max');
  ok('Galaxy in de naam stoort niet', ev("kastModelVan({naam:'Mobiparts Case Samsung Galaxy S24 Ultra Black'})")==='Samsung S24 Ultra');
  ok('S24+ is niet de S24', ev("kastModelVan({naam:'Hoesje Samsung S24+ zwart'})")==='Samsung S24+');
  ok('16e is niet de 16', ev("kastModelVan({naam:'Backcover Apple iPhone 16e'})")==='iPhone 16e');
  ok('geen model: null', ev("kastModelVan({naam:'USB-C kabel 1m'})")===null);
  ok('een serie geeft alle modellen ervan', ev("kastSerie('iPhone 16').join('|')")==='iPhone 16|iPhone 16 Plus|iPhone 16 Pro|iPhone 16 Pro Max|iPhone 16e');
  ok('maar niet een langer nummer', ev("state.modellen.push({id:99,naam:'iPhone 160'}); kastSerie('iPhone 16').includes('iPhone 160')")===false);

  // ── de regel: som van de plekken = wat er achter ligt ──
  ev(`state.producten=[{id:1,naam:'Privacy glas iPhone 16 Pro',barcode:'111',cat:2,modelId:3,winkel:2,voorraad:7,schap:2,minOver:0,
      plekken:[{id:'${vak.id}',n:2},{id:'${vak2.id}',n:3}]}];`);
  ev("save()");
  let pl=ev("JSON.stringify(state.producten[0].plekken)");
  ok('5 achter, maar 5 op de plekken: niets veranderd', pl===JSON.stringify([{id:vak.id,n:2},{id:vak2.id,n:3}]), pl);
  ev("state.producten[0].voorraad=9; save();");
  pl=JSON.parse(ev("JSON.stringify(state.producten[0].plekken)"));
  ok('komt er iets bij, dan naar de vaste plek (de eerste)', pl[0].n===4 && pl[1].n===3, JSON.stringify(pl));
  ev("state.producten[0].voorraad=6; save();");
  pl=JSON.parse(ev("JSON.stringify(state.producten[0].plekken)"));
  ok('gaat er iets af, dan uit de plek met het minst', pl[0].n===4 && pl[1].n===0, JSON.stringify(pl));
  ok('het lege vak blijft staan als plek van dit product', pl.length===2);
  ev("state.producten[0].plekken.push({id:'onbekend-vak',n:0}); save();");
  ok('een plek die we (nog) niet kennen blijft staan', ev("state.producten[0].plekken.some(x=>x.id==='onbekend-vak')"));
  ev("state.producten[0].plekken=state.producten[0].plekken.filter(x=>x.id!=='onbekend-vak'); save();");
  ok('een product zonder plek blijft zonder plek', ev("var q={id:2,naam:'Kabel',winkel:1,voorraad:4}; state.producten.push(q); save(); q.plekken===undefined"));

  // ── bijhangen noemt de plek die ook echt leeg raakt ──
  ev(`state.producten=[{id:1,naam:'Privacy glas iPhone 16 Pro',barcode:'111',cat:2,modelId:3,winkel:0,voorraad:4,schap:2,minOver:0,
      plekken:[{id:'${vak.id}',n:3},{id:'${vak2.id}',n:1}]}]; save();`);
  ok('bijhangen zegt waar je het pakt', ev("prodPakTekst(state.producten[0], bijTeVullen(state.producten[0]))")==='A2-3 · iPhone 16 (1), A2-3 · iPhone 16 Pro (1)');
  ev("bijvullen(1, true); save();");
  pl=JSON.parse(ev("JSON.stringify(state.producten[0].plekken)"));
  ok('en daar gaat het ook af', pl.find(x=>x.id===vak2.id).n===0 && pl.find(x=>x.id===vak.id).n===2, JSON.stringify(pl));
  ok('het lege vak blijft de plek van het product', pl.length===2);
  ev("openBijhangen()");
  ok('het bijhangvenster noemt de plek', /Pak uit/.test(w.document.getElementById('hangOverlay').innerHTML) || ev("bijTeVullen(state.producten[0])")===0);
  ev("sluitBijhangen(true)");

  // ── verkopen uit het magazijn ──
  ev(`state.producten=[{id:1,naam:'Privacy glas iPhone 16 Pro',barcode:'111',verkoop:15,inkoop:2,cat:2,modelId:3,winkel:0,voorraad:3,schap:0,minOver:0,
      plekken:[{id:'${vak.id}',n:3}]}]; save();`);
  ev("boekVerkoop(state.producten[0],1,'pin')");
  ok('een verkoop uit het magazijn haalt het van het vak af', ev("state.producten[0].plekken[0].n")===2);

  // ── inscannen: leg hem in de vaste plek ──
  ev("showTab('scan'); setMode('in'); verwerkScan('111');");
  ok('inscannen telt het bij het vak op', ev("state.producten[0].plekken[0].n")===3);
  ok('en zegt waar hij heen moet', /leg hem in <b>A2-3 · iPhone 16 Pro<\/b>/.test(w.document.getElementById('scanFeedback').innerHTML),
     w.document.getElementById('scanFeedback').innerHTML);

  // ── inrichten: wat je in een vak telt lag al in de winkeltelling ──
  ev("state.producten=[{id:5,naam:'Clear glas iPhone 16',barcode:'555',cat:2,modelId:1,winkel:7,voorraad:7,schap:2,minOver:0}]; save();");
  ev(`kastBakOpen('${bak.id}')`);
  ev("kastKoppel(state.producten[0], '"+vak2.id+"')");
  ok('koppelen verandert de voorraad niet', ev("state.producten[0].voorraad")===7 && ev("state.producten[0].plekken[0].n")===0);
  ev(`kastAantalZet(5,'${vak2.id}',5)`);
  ok('5 in het vak: van de winkeltelling af, totaal blijft 7', ev("[inWinkel(state.producten[0]),achterLiggen(state.producten[0]),state.producten[0].voorraad].join(',')")==='2,5,7');
  ev(`kastAantalZet(5,'${vak2.id}',10)`);
  ok('meer dan er hing: de winkel naar 0 en het totaal omhoog', ev("[inWinkel(state.producten[0]),achterLiggen(state.producten[0]),state.producten[0].voorraad].join(',')")==='0,10,10');
  ev(`kastAantalZet(5,'${vak2.id}',4)`);
  ok('een typfout terugdraaien zet het weer in de winkel', ev("[inWinkel(state.producten[0]),achterLiggen(state.producten[0]),state.producten[0].voorraad].join(',')")==='3,4,7');
  ok('het venster toont het vak met het aantal', !!w.document.getElementById('kastn-'+vak2.id+'-5') && w.document.getElementById('kastn-'+vak2.id+'-5').value==='4');
  ev("kastBakSluit()");
  // had het product al een plek, dan is een nieuw getal een hertelling
  ev(`state.producten=[{id:6,naam:'Clear glas iPhone 16 Pro',barcode:'666',cat:2,modelId:3,winkel:2,voorraad:5,schap:2,minOver:0,plekken:[{id:'${vak.id}',n:3}]}]; save();`);
  ev(`kastAantalZet(6,'${vak.id}',1)`);
  ok('hertellen: de winkel blijft, het totaal gaat mee', ev("[inWinkel(state.producten[0]),achterLiggen(state.producten[0]),state.producten[0].voorraad].join(',')")==='2,1,3');

  // ── in een bak scannen: het vak van het model ──
  ev(`state.producten=[{id:7,naam:'Privacy glas iPhone 16 Pro',barcode:'777',cat:2,modelId:3,winkel:1,voorraad:4,schap:1,minOver:0}]; save();`);
  ev(`kastBakOpen('${bak.id}')`);
  ev("kastBakScan('777')");
  ok('scannen in de bak legt het in het vak van zijn model', ev("state.producten[0].plekken[0].id")===vak.id);
  ok('met wat er al achter lag als aantal', ev("state.producten[0].plekken[0].n")===3);
  ev(`state.producten.push({id:8,naam:'USB-C kabel',barcode:'888',cat:3,winkel:1,voorraad:1})`);
  ev("kastBakScan('888')");
  ok('weet Storvo het vak niet, dan vraagt hij het', /In welk vak hoort/.test(w.document.getElementById('kastBakMelding').innerHTML));
  ev("kastBakScan('"+vak2.code+"')");
  ok('een vaklabel scannen wijst dat vak aan', ev("kastVakNu")===vak2.id);
  ev("kastBakScan('888')");
  ok('en dan gaat het volgende product daarin', ev("state.producten.find(p=>p.id===8).plekken[0].id")===vak2.id);
  ev("kastBakScan('999000111')");
  ok('een onbekende code in de bak: aanmaken of koppelen', !!w.document.getElementById('codeVenster'));
  ev("codeSluit(); kastBakSluit();");

  // ── labels scannen ──
  ev("showTab('dashboard'); scanPopup('"+vak.code+"')");
  ok('een vaklabel scannen opent de bak', !!w.document.getElementById('kastBakVenster') && ev("kastBakNu")===bak.id && ev("kastVakNu")===vak.id);
  ok('met het vak aangewezen', !!w.document.querySelector('#kastvak-'+vak.id+'.licht'));
  ev("kastBakSluit()");
  ev("scanPopup('PL-ZZZZZZ')");
  ok('het label van een weggehaalde plek wordt geen nieuw product', !w.document.getElementById('codeVenster') && ev("document.getElementById('tab-nieuw').hidden"));
  ev("showTab('verkoop'); mandje=[]; vkScanVerwerk('"+bak.code+"')");
  ok('een kastlabel komt nooit in het mandje', ev("mandje.length")===0);
  ev("showTab('dashboard'); scanPopup('424242')");
  ok('een onbekende code opent eerst de keuze, niet meteen een nieuw product', !!w.document.getElementById('codeVenster') && ev("document.getElementById('tab-nieuw').hidden"));
  ev("codeSluit()");

  // ── extra barcodes koppelen ──
  ev(`state.producten=[{id:10,naam:'Hoesje iPhone 15',barcode:'8712345678901',cat:1,winkel:1,voorraad:1},
                       {id:11,naam:'Glas iPhone 15',barcode:'8712345678902',cat:2,winkel:1,voorraad:1}]; save();`);
  await ev("prodCodeKoppelen(10,'2100226')");
  ok('een extra code hangt aan het product', ev("productBijCode('2100226') && productBijCode('2100226').id")===10);
  ok('de eigen barcode werkt nog', ev("productBijCode('8712345678901').id")===10);
  await ev("prodCodeKoppelen(11,'2100226')");
  ok('dezelfde code aan een tweede product: geweigerd', ev("(state.producten[1].codes||[]).length")===0);
  await ev("prodCodeKoppelen(11,'"+vak.code+"')");
  ok('een kastlabel is geen productcode', ev("(state.producten[1].codes||[]).length")===0);
  ok('een gekoppelde code botst bij een nieuw product', ev("barcodeConflict('2100226', 11) && barcodeConflict('2100226', 11).id")===10);
  ev("prodCodeWeg(10,'2100226')");
  ok('een code loshalen', ev("productBijCode('2100226')")===null);

  // ── de productenlijst noemt de plek ──
  ev(`state.producten=[{id:12,naam:'Glas iPhone 16 Pro',barcode:'1212',cat:2,winkel:1,voorraad:3,plekken:[{id:'${vak.id}',n:2}]}]; save(); showTab('producten'); renderProducten();`);
  ok('de productenlijst zegt waar het ligt', /A2-3 · iPhone 16 Pro/.test(w.document.getElementById('prodBody').innerHTML));

  // ── weghalen ──
  ev("showTab('magazijn'); renderMagazijn();");
  ok('de pagina toont de bakken als tegels met code', /A2-3/.test(w.document.getElementById('kastVak').innerHTML));
  await ev(`kastWeg('${vak.id}')`);
  ok('een vak met iets erin haal je niet zomaar weg', !w.document.getElementById('jaNeeVenster') && ev(`!!kastPlek('${vak.id}')`));
  ev(`state.producten[0].plekken[0].n=0; state.producten[0].voorraad=1; save();`);
  const weg=ev(`kastWeg('${vak.id}')`);
  await wachtOp(()=>w.document.getElementById('jaNeeJa'));
  const ja=w.document.getElementById('jaNeeJa'); if(ja) ja.click();
  await weg;
  ok('een leeg vak weghalen kan, na een vraag', !ev(`!!kastPlek('${vak.id}')`) && !w.__kast.some(x=>x.id===vak.id));
  ok('en het product verwijst er niet meer naar', ev("prodPlekken(state.producten[0]).length")===0);

  // ── vakken per model ──
  const bak4=await ev(`kastMaak('bak','${plank2}')`);
  ev(`state.producten=[
    {id:20,naam:'Screenprotector Privacy iPhone 16',barcode:'2001',cat:2,modelId:1,winkel:2,voorraad:4},
    {id:21,naam:'Screenprotector Clear iPhone 16 Pro',barcode:'2002',cat:2,modelId:3,winkel:3,voorraad:3},
    {id:22,naam:'Backcase iPhone 16 Pro',barcode:'2003',cat:1,winkel:1,voorraad:1}]; save();`);
  ev(`kastBakOpen('${bak4.id}'); kastVakkenPerModel('${bak4.id}')`);
  w.document.getElementById('kastSerieQ').value='iPhone 16';
  w.document.getElementById('kastSerieCat').value='2';
  ev("kastSerieTeken()");
  ok('vakken per model toont de hele serie', w.document.querySelectorAll('#kastSerieLijst input[type=checkbox]').length===5);
  await ev("kastSerieMaak(null)");
  ok('er zijn vijf vakken gemaakt', ev(`kastKinderen('${bak4.id}','vak').length`)===5);
  ok('de bak heet nu naar de serie en wat erin ligt', ev(`kastPlek('${bak4.id}').naam`)==='iPhone 16 serie' && ev(`kastPlek('${bak4.id}').sub`)==='Screenprotectors');
  ok('het glas ligt in het vak van zijn model', ev("kastPlek(state.producten[0].plekken[0].id).naam")==='iPhone 16'
     && ev("kastPlek(state.producten[1].plekken[0].id).naam")==='iPhone 16 Pro');
  ok('met wat er al achter lag', ev("state.producten[0].plekken[0].n")===2 && ev("state.producten[1].plekken[0].n")===0);
  ok('een hoesje (andere soort) blijft erbuiten', ev("prodPlekken(state.producten[2]).length")===0);
  ev("kastBakSluit()");

  // ── labels ──
  ok('vaklabel 62 x 25, baklabel 62 x 40, planklabel 62 x 30', ev("[KAST_LABEL_MM.vak,KAST_LABEL_MM.bak,KAST_LABEL_MM.plank].join(',')")==='25,40,30');
  const labels=ev(`kastLabelsBak('${bak4.id}')`);
  ok('de labels van een bak: de bak en elk vak', ev("kastLabelIds.length")===6 && !!w.document.getElementById('kastLabelVenster'));
  await labels;
  ev("kastLabelsSluit()");

  ok('geen fouten onderweg', fouten.length===0, fouten.slice(0,3).join(' | '));
  console.log(fout ? '\n'+fout+' FOUT in het magazijn' : '\nmagazijn in orde');
  process.exit(fout?1:0);
}, 400);
