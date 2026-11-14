const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

/* Stopt de test zonder process.exit (een belofte die nooit oplost), dan liep node
   vroeger gewoon leeg met code 0: halve test, toch groen. Nu telt dat als fout. */
process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });
// Paden vanaf dit bestand, zodat de tests ook vanuit de hoofdmap draaien.
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
  from:(n)=> n==='hardware_locaties'
    ? {select(){return this;},order(){return this;},
       then(r){ r({data:[{id:'l1',naam:'Winkel',soort:'winkel',volgorde:0}],error:null}); }}
    : _leegVoor(n),
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

setTimeout(async()=>{
  const d=w.document;
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));

  ok('hardwarepagina bestaat', !!d.getElementById('tab-hardware'));
  ok('hardware in het menu', !!d.querySelector('aside nav button[data-tab="hardware"]'));
  ok('hardware mobiel bereikbaar', w.eval("MOB_ALLES_DAG.includes('hardware')"));
  ok('refurbish-link staat uit zonder module', d.getElementById('refurbLink').hidden);

  w.eval("abonnement={modules:['refurbish']}; moduleLinks();");
  ok('refurbish-link verschijnt met module', !d.getElementById('refurbLink').hidden);
  ok('link wijst naar de werkbank', d.getElementById('refurbLink').getAttribute('href')==='/refurbish/');

  const toestellen=[
    {id:'h1', merk:'Dell', model:'Latitude 5430', serienummer:'ABC', staat:'B', inkoop:75, verkoop:349,
     status:'voorraad', kanalen:{winkel:true}, aangemaakt_op:new Date(Date.now()-40*864e5).toISOString()},
    {id:'h2', merk:'HP', model:'EliteBook', staat:'A', inkoop:60, verkoop:249, status:'voorraad',
     kanalen:{winkel:true, shopify:{id:1, url:'https://x/y'}}, aangemaakt_op:new Date().toISOString()},
    {id:'h3', merk:'Apple', model:'MacBook Air', staat:'B', inkoop:300, verkoop:650, status:'verkocht',
     kanalen:{}, aangemaakt_op:new Date().toISOString()}
  ];
  w.eval("account={team_id:'t1', rol:'eigenaar'}; hwData="+JSON.stringify(toestellen)+"; renderHardware();");

  const lijst=d.getElementById('hwLijst').innerHTML;
  ok('toestellen in de lijst', /Latitude 5430/.test(lijst) && /EliteBook/.test(lijst));
  // ── multi-select op de hardwaretabel (zoals bij producten) ──
  ok('hardware heeft een selecteer-alles', !!d.getElementById('hwAlle'));
  ok('een toestel aanvinken vult de selectie', w.eval("hwSelect('h1',true); hwGeselecteerd.has('h1')"));
  ok('bulkbalk verschijnt bij een selectie', w.eval("hwSelectieBalk(); !document.getElementById('hwBulk').hidden"));
  w.eval("hwSelectieWissen();");
  ok('verkochte niet in de voorraadlijst', !/MacBook Air/.test(lijst));
  ok('marge berekend (349 - 75)', /274,00/.test(lijst));
  ok('webshoplabel bij het online toestel', /Webshop/.test(lijst));
  ok('oud toestel gemarkeerd', /hwoud/.test(lijst));
  const kpis=d.getElementById('hwKpis').innerHTML;
  ok('kpi op voorraad 2', />2</.test(kpis));
  ok('kpi ingekocht voor 135', /135,00/.test(kpis));
  ok('kpi staat online 1', /Staat online/.test(kpis));

  w.eval("hwFilterNu='verkocht'; renderHardware();");
  ok('filter verkocht toont MacBook', /MacBook Air/.test(d.getElementById('hwLijst').innerHTML));
  w.eval("hwFilterNu='online'; renderHardware();");
  const online=d.getElementById('hwLijst').innerHTML;
  ok('filter online toont alleen HP', /EliteBook/.test(online) && !/Latitude/.test(online));
  w.eval("hwFilterNu='oud'; renderHardware();");
  const oud=d.getElementById('hwLijst').innerHTML;
  ok('filter oud toont alleen Dell', /Latitude/.test(oud) && !/EliteBook/.test(oud));

  w.eval("hwFilterNu='voorraad'; renderHardware(); hwBewerk('h1');");
  const v=d.getElementById('hwDetail');
  ok('bewerkvenster opent (volledige pagina)', !!v && !v.hidden);
  ok('velden gevuld', d.getElementById('hw_model').value==='Latitude 5430');
  ok('inkoopprijs gevuld', d.getElementById('hw_inkoop').value==='75');
  ok('shopify-knop aanwezig', /Op Shopify zetten/.test(v.innerHTML));
  ok('kopieerknop bij de titel', /hwKopieerVeld\('hw_titel'/.test(v.innerHTML));
  ok('kopieerknop bij de omschrijving', /hwKopieerVeld\('hw_oms'/.test(v.innerHTML));
  ok('knop prijs voorstellen', /Prijs voorstellen/.test(v.innerHTML));
  // prijsvoorstel op basis van een eerder verkocht zelfde model
  w.eval("hwPrijsvoorstel()");
  ok('prijsvoorstel ingevuld', Number(d.getElementById('hw_verkoop').value)>0);
  ok('bron van het voorstel genoemd', d.getElementById('hwPrijsBron').textContent.length>10);
  ok('verkoopknop aanwezig', /Verkopen aan de balie/.test(v.innerHTML));
  w.eval("hwSluit()");
  ok('venster sluit', d.getElementById('hwDetail').hidden && !d.getElementById('hwLijstWeergave').hidden);

  w.eval("hwBewerk('h2')");
  ok('online toestel toont offline-knop', /Offline halen/.test(d.getElementById('hwDetail').innerHTML));
  w.eval("hwSluit()");

  // ── specs uit de refurbish-opzet: regel in de lijst + 'Wat erin zit' op de detailpagina ──
  w.eval("hwData.find(x=>x.id==='h1').specs={Processor:'Intel Core i5', Geheugen:'16 GB', Opslag:'512GB'}; hwFilterNu='voorraad'; renderHardware();");
  ok('lijst toont een specs-regel onder het model', /512GB/.test(d.getElementById('hwLijst').innerHTML));
  w.eval("hwBewerk('h1')");
  ok('detail toont Wat erin zit met specs', /Wat erin zit/.test(d.getElementById('hwDetail').innerHTML) && /Intel Core i5/.test(d.getElementById('hwDetail').innerHTML));
  w.eval("hwSluit()");

  // ── inscannen ──
  w.eval(`hwLocaties=[{id:'l1',naam:'Winkel',soort:'winkel'}];
    hwData.push({id:'h4', merk:'Acer', model:'Swift 3', code:'A0009', status:'onderweg',
      inkoop:80, verkoop:249, kanalen:{}, aangemaakt_op:new Date().toISOString()});
    renderHardware();`);
  ok('onderweg niet in de voorraadlijst', !/Swift 3/.test(d.getElementById('hwLijst').innerHTML));
  ok('kpi nog inscannen', /Nog inscannen/.test(d.getElementById('hwKpis').innerHTML));
  w.eval("hwFilterNu='onderweg'; renderHardware();");
  const ond=d.getElementById('hwLijst').innerHTML;
  ok('filter onderweg toont hem', /Swift 3/.test(ond));
  ok('gemarkeerd als nog niet ingescand', /Nog niet ingescand/.test(ond));

  w.eval('hwInscannen()');
  ok('inscanvenster opent', !!d.getElementById('hwOverlay'));
  ok('locatiekeuze aanwezig', !!d.getElementById('hw_loc'));
  ok('wachtlijst toont het toestel', /A0009/.test(d.getElementById('hwOverlay').innerHTML));
  d.getElementById('hw_scan').value='A0009';
  w.eval('hwScanZoek()');
  await new Promise(r=>setTimeout(r,60));
  ok('scan schrijft de locatie weg',
     w.__geschreven.some(g=>g[0]==='hardware' && g[1]==='update' && g[2].locatie_id==='l1'));

  // ── van het magazijn naar de winkel ──
  // Dit is het geval waar het om gaat: hij ligt al ergens, en moet daar weg.
  w.eval(`hwSluit();
    window.__geschreven.length=0; hwFilterNu='voorraad';
    hwLocaties=[{id:'l1',naam:'Winkel',soort:'winkel'},{id:'l2',naam:'Magazijn',soort:'magazijn'}];
    hwData=[{id:'h5', merk:'Lenovo', model:'ThinkPad T14', code:'A0011', status:'voorraad',
      locatie_id:'l2', inkoop:200, verkoop:449, kanalen:{}, aangemaakt_op:new Date().toISOString()}];
    renderHardware();`);
  ok('lijst toont waar hij ligt', /Magazijn/.test(d.getElementById('hwLijst').innerHTML));

  w.eval('hwInscannen()');
  d.getElementById('hw_scan').value='A0011';
  w.eval('hwScanKijk()');
  const pad=d.getElementById('hw_pad').innerHTML;
  ok('nog voor het scannen zie je de verhuizing', /Magazijn/.test(pad) && /Winkel/.test(pad));
  ok('de oude plek is doorgestreept', /class="van"/.test(pad));

  w.eval('hwScanZoek()');
  await new Promise(r=>setTimeout(r,80));
  const bij=w.__geschreven.find(g=>g[0]==='hardware' && g[1]==='update');
  ok('gaat naar de nieuwe locatie', !!bij && bij[2].locatie_id==='l1');
  const log=w.__geschreven.find(g=>g[0]==='voorraad_verplaatsingen');
  ok('verhuizing wordt vastgelegd', !!log);
  ok('met waar hij vandaan kwam', !!log && log[2].van_naam==='Magazijn' && log[2].naar_naam==='Winkel');
  ok('zichtbaar in het venster', /Zojuist verplaatst/.test(d.getElementById('hwOverlay').innerHTML));
  const mee=w.__geschreven.find(g=>g[0]==='refurbish_apparaten' && g[1]==='update');
  ok('de refurbish-app gaat mee', !!mee && mee[2].locatie_id==='l1');

  // en dezelfde weg terug: winkel naar magazijn
  w.eval("hwSluit(); window.__geschreven.length=0; hwLocaties=[{id:'l1',naam:'Winkel',soort:'winkel'},{id:'l2',naam:'Magazijn',soort:'magazijn'}];");
  w.eval(`hwData=[{id:'h5', merk:'Lenovo', model:'ThinkPad T14', code:'A0011', status:'voorraad',
      locatie_id:'l1', kanalen:{}, aangemaakt_op:new Date().toISOString()}];
    renderHardware(); hwInscannen();`);
  d.getElementById('hw_scan').value='A0011';
  d.getElementById('hw_loc').value='l2';
  w.eval('hwScanZoek()');
  await new Promise(r=>setTimeout(r,80));
  const terug=w.__geschreven.find(g=>g[0]==='voorraad_verplaatsingen');
  ok('ook terug naar het magazijn', !!terug && terug[2].van_naam==='Winkel' && terug[2].naar_naam==='Magazijn');

  // filterknoppen per locatie
  w.eval(`hwSluit();
    hwLocaties=[{id:'l1',naam:'Winkel',soort:'winkel'},{id:'l2',naam:'Magazijn',soort:'magazijn'}];
    hwData=[
      {id:'h6', merk:'HP', model:'Elite 1', code:'A1', status:'voorraad', locatie_id:'l1', kanalen:{}, aangemaakt_op:new Date().toISOString()},
      {id:'h7', merk:'HP', model:'Elite 2', code:'A2', status:'voorraad', locatie_id:'l2', kanalen:{}, aangemaakt_op:new Date().toISOString()}];
    hwLocFilters(); renderHardware();`);
  const lf=d.getElementById('hwLocFilters');
  ok('knop per locatie', !!lf && /data-f="loc:l1"/.test(lf.innerHTML)
                      && /data-f="loc:l2"/.test(lf.innerHTML));
  w.eval("hwKiesFilter('loc:l1')");
  const alleenWinkel=d.getElementById('hwLijst').innerHTML;
  ok('alleen wat in de winkel ligt', /Elite 1/.test(alleenWinkel) && !/Elite 2/.test(alleenWinkel));
  w.eval("hwKiesFilter('loc:l2')");
  const alleenMagazijn=d.getElementById('hwLijst').innerHTML;
  ok('alleen wat in het magazijn ligt', /Elite 2/.test(alleenMagazijn) && !/Elite 1/.test(alleenMagazijn));
  w.eval("hwKiesFilter('voorraad')");

  // twee keer dezelfde plek doet niets
  w.eval(`hwSluit(); window.__geschreven.length=0;
    hwData=[{id:'h5', merk:'Lenovo', model:'ThinkPad T14', code:'A0011', status:'voorraad',
      locatie_id:'l1', kanalen:{}, aangemaakt_op:new Date().toISOString()}];
    hwInscannen();`);
  d.getElementById('hw_scan').value='A0011';
  w.eval('hwScanZoek()');
  await new Promise(r=>setTimeout(r,60));
  ok('ligt hij er al, dan gebeurt er niets',
     !w.__geschreven.some(g=>g[0]==='voorraad_verplaatsingen'));
  // hwLaad haalt in deze test een lege lijst op, dus de toestellen weer terugzetten
  w.eval("hwSluit(); hwFilterNu='voorraad'; hwData="+JSON.stringify(toestellen)+"; renderHardware();");

  // de wijzer op de productenpagina
  w.eval("renderProducten()");
  const wijzer=d.getElementById('hwWijzer');
  ok('wijzer naar hardware zichtbaar', wijzer && !wijzer.hidden);
  ok('wijzer telt de toestellen', /2 los/.test(wijzer.textContent));
  ok('wijzer verwijst naar Hardware', /Hardware/.test(wijzer.innerHTML));

  // een link van buitenaf mag bepalen waar je landt
  ok('tab uit het adres', typeof w.eval('tabUitAdres')==='function');

  // pagina echt openen
  w.eval("showTab('hardware')");
  const zicht=w.getComputedStyle(d.getElementById('tab-hardware')).display;
  ok('hardwarepagina wordt zichtbaar', zicht!=='none');

  // ── Simpel of Alles ──
  // Standaard Simpel; de keuze zit op body zodat elk .uitgebreid-blok meedoet.
  ok('standaard Simpel', d.body.classList.contains('simpel'));
  w.eval('zetModus(false)');
  ok('Alles haalt de klasse weg', !d.body.classList.contains('simpel'));
  ok('de keuze wordt onthouden', w.localStorage.getItem('storvo_simpel')==='0');
  w.eval('zetModus(true)');
  // Een medewerker werkt altijd in Simpel, ook als het toestel op Alles staat.
  w.eval("localStorage.setItem('storvo_simpel','0'); gebruiker={naam:'Sara',rol:'medewerker',tabs:null}; modusToepassen();");
  ok('medewerker altijd Simpel', d.body.classList.contains('simpel'));
  w.eval("gebruiker=null; localStorage.setItem('storvo_simpel','1'); modusToepassen();");
  // Op de telefoon was Inkopen nergens te openen; het Meer-vel moet hem tonen.
  w.eval('mobMeerOpen()');
  ok('Meer-vel op de telefoon heeft Inkopen', /mobMeerKies\('inkopen'\)/.test(d.getElementById('mobMeer').innerHTML));
  w.eval('mobMeerSluit()');
  // De labelprinter is een koppeling en staat bij Instellingen, niet meer als eigen pagina.
  ok('Labelprinter is geen eigen pagina meer', !d.getElementById('tab-labelprinter'));
  w.eval("naarInstelling('labelprinter')");
  ok('Labelprinter staat bij Instellingen', !d.getElementById('inst-labelprinter').hidden && !!d.getElementById('labelBreedte'));
  w.eval("hulpGaNaar('labelprinter')");
  ok('de hulp-assistent stuurt de oude plek naar Instellingen', !d.getElementById('inst-labelprinter').hidden && !d.getElementById('tab-instellingen').hidden);

  // Reparaties openen standaard op het bord, niet op de lijst van acht kolommen.
  w.eval("try{localStorage.removeItem('storvo_rep_weergave');}catch(e){} showTab('reparaties')");
  ok('reparaties standaard op het bord', !d.getElementById('repBord').hidden && d.getElementById('repLijstWrap').hidden);

  // Een bestaand toestel bewaart zichzelf. Dat automatisch opslaan moet btw en plek ook
  // naar het refurbish-toestel spiegelen; eerst deed alleen de Opslaan-knop dat.
  w.eval(`showTab('hardware'); window.__geschreven.length=0;
    hwData=[{id:'h9', merk:'HP', model:'ProBook', staat:'B', inkoop:50, verkoop:199, status:'voorraad',
      marge:true, plek:'', kanalen:{}, aangemaakt_op:new Date().toISOString()}];
    hwBewerk('h9');`);
  ok('bestaand toestel heeft geen Opslaan-knop meer', !/hwOpslaan\(this\)/.test(d.getElementById('hwDetail').innerHTML));
  const btw=d.getElementById('hw_marge'); btw.value='nee';
  btw.dispatchEvent(new w.Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,900));
  ok('automatisch opslaan spiegelt btw naar de werkbank',
     w.__geschreven.some(g=>g[0]==='refurbish_apparaten' && g[1]==='update' && g[2].marge===false));
  w.eval('hwSluit()');

  // Komt de lijst teamleden leeg terug, dan vroeg de Uren-pagina hem eindeloos opnieuw op
  // (opvragen, hertekenen, weer opvragen). Nu één keer, en geen herteken op een lege lijst.
  w.eval(`window.__acc=0; window.__van=sb.from.bind(sb);
    sb.from=(n)=>{ if(n==='accounts') window.__acc++; return window.__van(n); };
    teamLeden=[]; showTab('uren');`);
  await new Promise(r=>setTimeout(r,80));
  ok('uren vraagt de teamleden niet eindeloos opnieuw op', w.__acc>0 && w.__acc<=2);
  w.eval("sb.from=window.__van; showTab('dashboard')");

  // ── het eigen ja/nee-venster in plaats van confirm() ──
  // Elke manier om het venster dicht te doen moet de vraag beantwoorden. Blijft een
  // belofte hangen, dan loopt de functie die erop wacht nooit af en gebeurt er niets.
  const tik=()=>new Promise(r=>setTimeout(r,0));
  const venster=()=>d.getElementById('jaNeeVenster');
  let antw=w.eval("vraagJaNee('Dit weggooien?', {ja:'Weggooien', gevaar:true})");
  ok('het venster staat er', !!venster());
  ok('de knop zegt wat er gebeurt', d.getElementById('jaNeeJa').textContent==='Weggooien');
  ok('bij gevaar is de knop rood', d.getElementById('jaNeeJa').classList.contains('danger'));
  ok('bij gevaar staat de cursor op Annuleren', d.activeElement===d.getElementById('jaNeeNee'));
  d.getElementById('jaNeeJa').click();
  ok('ja geeft true', await antw===true);
  ok('daarna is het venster weg', !venster());

  antw=w.eval("vraagJaNee('Zeker?')"); d.getElementById('jaNeeNee').click();
  ok('Annuleren geeft false', await antw===false);
  antw=w.eval("vraagJaNee('Zeker?')"); venster().dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  ok('ernaast klikken geeft false', await antw===false);
  antw=w.eval("vraagJaNee('Zeker?')");
  venster().dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape', bubbles:true}));
  ok('Escape geeft false', await antw===false);
  const eerste=w.eval("vraagJaNee('Eerste?')"); const tweede=w.eval("vraagJaNee('Tweede?')");
  ok('een nieuwe vraag beantwoordt de oude met nee', await eerste===false);
  ok('er staat er maar één', d.querySelectorAll('#jaNeeVenster').length===1);
  d.getElementById('jaNeeJa').click(); await tweede;

  antw=w.eval("vraagTekst('Naam?', '', {ja:'Opslaan'})");
  const inv=d.getElementById('jaNeeInvoer'); inv.value='Hoesjes';
  inv.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter', bubbles:true}));
  ok('vraagTekst geeft de getypte tekst', await antw==='Hoesjes');
  antw=w.eval("vraagTekst('Naam?')"); d.getElementById('jaNeeNee').click();
  ok('vraagTekst geeft null bij Annuleren', await antw===null);

  // Een echte plek: een product verwijderen gaat pas na ja.
  w.eval("state.producten.push({id:987001, naam:'Testhoesje', barcode:'X1', cat:1, voorraad:1, winkel:1})");
  let klaar=w.eval("verwijder(987001)"); d.getElementById('jaNeeNee').click(); await klaar;
  ok('na Annuleren blijft het product', w.eval("state.producten.some(p=>p.id===987001)"));
  klaar=w.eval("verwijder(987001)"); d.getElementById('jaNeeJa').click(); await klaar;
  ok('na Verwijderen is het product weg', !w.eval("state.producten.some(p=>p.id===987001)"));

  // Anders dan confirm() houdt het venster de pagina niet stil. Vervangt de sync de
  // lijst terwijl de vraag openstaat, dan moet de wijziging op de verse lijst landen.
  w.eval(`state.producten.push({id:987002, naam:'Kabel', barcode:'X2', cat:1, voorraad:1, winkel:1});
    state.log.unshift({id:987003, t:Date.now(), naam:'Kabel', m:'in', v:1, aantal:3, pid:987002});`);
  klaar=w.eval("ongedaanMaken(987003)");
  w.eval("state.producten=JSON.parse(JSON.stringify(state.producten)); state.log=JSON.parse(JSON.stringify(state.log));");
  d.getElementById('jaNeeJa').click(); await klaar; await tik();
  ok('na de vraag wordt de verse lijst gewijzigd, niet een oude kopie',
     w.eval("state.producten.find(p=>p.id===987002).voorraad===0 && state.log.find(l=>l.id===987003).ongedaan===true"));

  // ── Modules aan en uit ──
  // Een module die uit staat bestaat niet voor menu, links en tegels, voor iedereen
  // (ook de eigenaar), en de keuze gaat mee met de sync naar elk apparaat.
  w.eval("gebruiker={id:'a1', naam:'Lucas', rol:'eigenaar', tabs:null}; state.modules={}; pasRechtenToe(); showTab('dashboard');");
  ok('modules synchroniseren per sleutel', w.eval("SYNC_VELDEN.includes('modules') && SYNC_KEYED.has('modules')"));
  w.eval("moduleWissel('kassa')");
  ok('Kassa uit: ook de eigenaar mag er niet meer heen', w.eval("mag('kassa')===false"));
  ok('Kassa uit: weg uit het menu', d.querySelector('aside nav button[data-tab="kassa"]').style.display==='none');
  ok('Kassa uit: losse stukken verdwijnen via de body-klasse', d.body.classList.contains('moduit-kassa')
     && /moduit-kassa \[data-module~="kassa"\]\{display:none/.test(d.getElementById('moduleStijl').textContent));
  w.eval("showTab('dashboard')");
  ok('Kassa uit: geen kassategel op het dashboard', !/showTab\('kassa'\)/.test(d.getElementById('dashSimpel').innerHTML));
  w.eval("moduleWissel('voorraad')");
  ok('Winkelvoorraad uit: ook nieuw product, tellen en bijbestellen dicht',
     w.eval("['producten','nieuw','catalogus','voorraad','scan','bestellen'].every(t=>!mag(t))"));
  ok('een rechtenvinkje van een module die uit staat blijft bestaan (met zijn stand)',
     /data-module="kassa"><input type="checkbox" id="x_kassa" checked/.test(w.eval("pagChipsHtml('x',['kassa'])")));
  w.eval("moduleWissel('kassa'); moduleWissel('voorraad');");
  ok('weer aan bewaart true, zodat de sync de wijziging ziet', w.eval("state.modules.kassa===true && mag('kassa')"));
  // Inruil zit onder Verkoop, niet meer als eigen menuknop.
  w.eval("showTab('inruil')");
  ok('Inruil heeft geen eigen menuknop meer', !d.querySelector('aside nav button[data-tab="inruil"]'));
  ok('op Inruil staat de verkoopbalk en licht Verkoop op', !d.getElementById('verkoopSub').hidden
     && d.querySelector('aside nav button[data-tab="verkoop"]').classList.contains('active'));
  // De oude keuze (alleen op dit apparaat) wordt één keer omgezet. Alleen hoofdpagina's
  // tellen: wie alleen Inscannen verborg, zette niet de hele voorraad uit.
  ok('oude verborgen pagina\'s worden modules',
     w.eval(`localStorage.setItem(KEY, JSON.stringify({producten:[], verborgen:['kassa','scan','reparaties']}));
       var s2=load(); s2.modules.kassa===false && s2.modules.reparaties===false && s2.modules.voorraad===undefined && s2.verborgen.length===0`));
  w.eval("showTab('dashboard')");

  // Een module uitzetten is alleen verbergen. Achtergrondwerk vraagt de rol, niet de
  // module: met Hardware uit moet Verkoop (en de Clover-pin) de toestellen nog laden.
  w.eval(`state.modules={hardware:false}; moduleToepassen(); hwData.length=0;
    window.__hwGeladen=0; window.__hwLaadOud=hwLaad; hwLaad=async()=>{ window.__hwGeladen++; };
    showTab('verkoop');`);
  ok('Hardware uit: verborgen voor het menu', w.eval("mag('hardware')===false"));
  ok('Hardware uit: de rol mag het nog', w.eval("magRol('hardware')===true"));
  ok('Hardware uit: Verkoop laadt de toestellen toch', w.__hwGeladen>0);
  w.eval("hwLaad=window.__hwLaadOud; state.modules={}; moduleToepassen();");

  // In de hardwarelijst staat per toestel een Verkopen-knop.
  w.eval("showTab('hardware'); hwFilterNu='voorraad'; hwData="+JSON.stringify(toestellen)+"; renderHardware();");
  ok('hardwarelijst heeft een Verkopen-knop per toestel', /hwVerkoop\('h1'\)/.test(d.getElementById('hwLijst').innerHTML));
  ok('een verkocht toestel krijgt geen Verkopen-knop', !/hwVerkoop\('h3'\)/.test(d.getElementById('hwLijst').innerHTML));

  // Sorteren op naam zette "iPhone X" na "iPhone 15"; nu per merk en serie op generatie.
  ok('iPhones van oud naar nieuw', w.eval(`['iPhone 15 Pro','iPhone X','iPhone 11','iPhone 8','iPhone 13 mini','iPhone SE (2022)']
      .map(m=>({merk:'Apple', model:m})).sort((a,b)=>hwVergelijkModel(a,b,1)).map(h=>h.model).join('|')`)
     ==='iPhone 8|iPhone X|iPhone 11|iPhone 13 mini|iPhone SE (2022)|iPhone 15 Pro');
  ok('Galaxy A en S apart, elk van oud naar nieuw', w.eval(`['Galaxy S23 Ultra','Galaxy A54','Galaxy S10','Galaxy A12']
      .map(m=>({merk:'Samsung', model:m})).sort((a,b)=>hwVergelijkModel(a,b,1)).map(h=>h.model).join('|')`)
     ==='Galaxy A12|Galaxy A54|Galaxy S10|Galaxy S23 Ultra');
  // Categorieën met aantal boven de lijst, en een kopregel per merk.
  ok('categorieën met aantal boven de lijst', /hwKiesCat\('alles'\)/.test(d.getElementById('hwLijst').innerHTML));
  ok('kopregel per merk bij sorteren per merk', d.querySelectorAll('#hwLijst tr.hwmerkrij').length>0);
  // De Online-knop blijft staan en zegt waar het toestel online staat.
  ok('online-knop zegt waar hij online staat', /hwonline aan[^>]*>.*Webshop/.test(d.getElementById('hwLijst').innerHTML));
  // Meldingen (bestellen, rooster) staan als kaartje in de zijbalk boven Simpel of Alles,
  // niet meer als balk over de hele breedte bovenin. Wegtikken geldt voor vandaag, tot er
  // iets bijkomt.
  w.eval(`localStorage.removeItem('storvo_melding_bestel');
    state.reparaties=[1,2,3,4].map(i=>({id:900+i,nr:'R'+i,status:'aangemeld',klant:{naam:'K',tel:'1'},toestel:'iPhone',type:'scherm',prijs:10,onderdelen:[],notities:[],log:[]}));
    showTab('dashboard');`);
  const zm=d.getElementById('zijMeldingen');
  ok('meldingskaartje in de zijbalk', /4 reparaties \(onderdelen\)/.test(zm.textContent));
  ok('geen balk meer bovenin', !d.getElementById('bestelBalk') && !d.body.classList.contains('metbestelbalk'));
  ok('het kaartje staat boven Simpel of Alles', zm.nextElementSibling && zm.nextElementSibling.classList.contains('zijmodus'));
  zm.querySelector('.zmweg').click();
  ok('wegtikken verbergt het kaartje', !zm.querySelector('.zijmelding'));
  w.eval("state.reparaties.push({id:905,nr:'R5',status:'aangemeld',klant:{naam:'K',tel:'1'},toestel:'iPhone',type:'scherm',prijs:10,onderdelen:[],notities:[],log:[]}); toonMeldingen();");
  ok('komt terug als er iets bijkomt', /5 reparaties/.test(zm.textContent));
  w.eval('mobMeerOpen()');
  ok('op de telefoon bovenin het Meer-vel', /5 reparaties/.test(d.getElementById('mobMeer').textContent));
  w.eval("mobMeerSluit(); state.reparaties=[]; localStorage.removeItem('storvo_melding_bestel'); toonMeldingen();");

  // Een open tabblad haalt een nieuwe versie zelf op. Eerst draaide de winkel-Mac dagen
  // de oude versie, en zag het er daar anders uit dan op een andere Mac.
  w.__etag='"aaa"';
  w.fetch=async()=>({ok:true, headers:{get:k=>k.toLowerCase()==='etag'?w.__etag:null}});
  w.eval('versieBasis=null; versieNieuw=false; versieLaatst=0');
  await w.eval('versieKijk()');
  ok('versie: basis na het laden opgehaald', w.eval('versieBasis')==='"aaa"' && !w.eval('versieNieuw'));
  w.__etag='W/"aaa"'; w.eval('versieLaatst=0'); await w.eval('versieKijk()');
  ok('versie: zelfde inhoud gecomprimeerd is geen nieuwe versie', !w.eval('versieNieuw'));
  w.__etag='"bbb"'; w.eval('versieLaatst=0'); await w.eval('versieKijk()');
  ok('versie: nieuwe versie gezien', w.eval('versieNieuw')===true);
  ok('versie: melding in de zijbalk', /Nieuwe versie van Storvo/.test(zm.textContent));
  w.eval('window.__ververst=0; versieVerversen=()=>{ window.__ververst++; }');
  w.eval("mandje=[{id:1}]; versieMisschienVerversen()");
  ok('versie: niet verversen met iets in het mandje', w.__ververst===0);
  w.eval("mandje=[]; _vuil=true; versieMisschienVerversen()");
  ok('versie: niet verversen met getypte invoer', w.__ververst===0);
  w.eval("_vuil=false; versieMisschienVerversen()");
  ok('versie: wel verversen op een rustig moment', w.__ververst===1);
  w.eval("versieNieuw=false; toonMeldingen()");

  // Los een toestel toevoegen (zonder werkbank): standaard 24 maanden garantie, en de
  // doos en de accu kun je meteen invullen.
  w.eval('hwNieuw()');
  ok('los toevoegen: standaard 24 maanden garantie', d.getElementById('hw_gar').value==='24');
  ok('los toevoegen: vinkje voor de doos', !!d.getElementById('hw_doos'));
  ok('los toevoegen: veld voor de accu', !!d.getElementById('hw_accu'));
  d.getElementById('hw_accu').value='87'; d.getElementById('hw_doos').checked=true;
  let rij=w.eval('hwFormRij()');
  ok('los toevoegen: accu en doos gaan mee', rij.accu===87 && rij.doos===true && rij.nieuwe_accu===false && rij.garantie===24);
  d.getElementById('hw_accu').value='';
  ok('los toevoegen: geen accu is leeg, geen 0', w.eval('hwFormRij()').accu===null);
  const nv=d.getElementById('hw_nieuweaccu'); nv.checked=true; w.eval('hwNieuweAccu(document.getElementById("hw_nieuweaccu"))');
  rij=w.eval('hwFormRij()');
  ok('los toevoegen: nieuwe accu telt als 100%', rij.accu===100 && rij.nieuwe_accu===true && d.getElementById('hw_accu').disabled);
  nv.checked=false; w.eval('hwNieuweAccu(document.getElementById("hw_nieuweaccu"))');
  ok('los toevoegen: nieuwe accu uit geeft het veld terug', !d.getElementById('hw_accu').disabled && w.eval('hwFormRij()').accu===null);
  w.eval("hwVenster({id:'h-oud', model:'Latitude 5430', garantie:12, accu:91, doos:true, kanalen:{}, fotos:[], specs:{}, status:'voorraad'})");
  ok('bestaand toestel houdt zijn eigen garantie', d.getElementById('hw_gar').value==='12');
  ok('bestaand toestel toont accu en doos', d.getElementById('hw_accu').value==='91' && d.getElementById('hw_doos').checked);
  w.eval('hwSluit(); showTab("dashboard")');

  // Fabrieksfoto's ophalen op de toestelpagina, met de kleur erbij voor een telefoon.
  w.__fetchLijf=null; w.__modelRijen=[]; w.__fotoWeg=0; w.__opslagWeg=[];
  w.fetch=async(u,o)=>{ if(String(u).includes('/productfotos')) w.__fetchLijf=JSON.parse(o.body); return {ok:true, json:async()=>({ok:true, opgeslagen:1})}; };
  w.eval(`window.__sbFrom=window.__sbFrom||sb.from;
    sb.from=(n)=>{ if(n!=='refurbish_fotos') return window.__sbFrom(n);
      const api={select(){return api;}, is(){return api;}, ilike(){return api;}, order(){return api;},
        delete(){ window.__fotoWeg++; return api; }, then(r){ r({data:window.__modelRijen, error:null}); }};
      return api; };
    sb.auth.getSession=async()=>({data:{session:{access_token:'t'}}});
    sb.storage={from:()=>({getPublicUrl:(p)=>({data:{publicUrl:'https://x.supabase.co/storage/v1/object/public/refurbish-fotos/'+p}}),
      remove:async(l)=>{ window.__opslagWeg.push(...l); return {}; }})};
    vraagJaNee=async()=>true;`);
  w.eval("hwVenster({id:'hw2', merk:'Samsung', model:'Galaxy S24', categorie:'Telefoon', specs:{}, fotos:[], kanalen:{}, status:'voorraad'})");
  ok('kleur: veld staat er bij een telefoon', !d.getElementById('hw_kleur_vak').hidden);
  ok('foto\'s: knop om op te halen', /Foto's ophalen/.test(d.getElementById('hwOphaalKnop').textContent));
  await w.eval("hwFotosOphalen(null,false)");
  ok('foto\'s: zonder kleur eerst de kleur vragen', !w.__fetchLijf && /kleur/i.test(d.getElementById('hwFotoHint').textContent));
  d.getElementById('hw_kleur').value='Zwart';
  w.__modelRijen=[{pad:'t1/model_Samsung-Galaxy_S24-Zwart/open-1.jpg', kleur:'Zwart'}, {pad:'t1/model_Samsung-Galaxy_S24-Groen/open-1.jpg', kleur:'Groen'}];
  await w.eval("hwFotosOphalen(null,false)");
  ok('foto\'s: ophalen met merk, model en kleur', w.__fetchLijf && w.__fetchLijf.actie==='automatisch' && w.__fetchLijf.kleur==='Zwart' && w.__fetchLijf.model==='Galaxy S24');
  ok('foto\'s: alleen die in de goede kleur bij het toestel', w.eval('hwOpen.fotos.length')===1 && /Zwart/.test(w.eval('hwOpen.fotos[0]')));
  ok('foto\'s: daarna opnieuw ophalen', /Opnieuw ophalen/.test(d.getElementById('hwOphaalKnop').textContent));
  await w.eval("hwFotosOphalen(null,true)");
  ok('foto\'s: opnieuw gooit de set van het model weg en haalt opnieuw', w.__fotoWeg===1 && w.eval('hwOpen.fotos.length')===1);
  await w.eval('hwFotoVerwijder(0)');
  ok('foto\'s: een fabrieksfoto weghalen laat het bestand staan', w.__opslagWeg.length===0 && w.eval('hwOpen.fotos.length')===0);
  w.eval("hwOpen.fotos=['https://x.supabase.co/storage/v1/object/public/refurbish-fotos/t1/hardware/hw2/1-0.jpg']");
  await w.eval('hwFotoVerwijder(0)');
  ok('foto\'s: een eigen upload gaat wel uit de opslag', w.__opslagWeg.length===1 && /\/hardware\//.test(w.__opslagWeg[0]));
  ok('kleur: gaat mee in de specs', w.eval('hwFormRij()').specs && w.eval('hwFormRij()').specs.Kleur==='Zwart');
  w.eval("hwOpen.specs={Kleur:'Zwart'}");
  ok('kleur: niet veranderd, dan geen specs mee', !('specs' in w.eval('hwFormRij()')));
  w.eval("hwVenster({id:'hw3', merk:'HP', model:'EliteBook', categorie:'Laptop', specs:{Kleur:'Zilver'}, fotos:[], kanalen:{}, status:'voorraad'})");
  ok('kleur: niet bij een laptop, en die van de werkbank blijft staan', d.getElementById('hw_kleur_vak').hidden && !('specs' in w.eval('hwFormRij()')));
  w.eval('sb.from=window.__sbFrom; hwSluit(); showTab("dashboard")');

  // Merk uit een lijst, kleur uit de kleuren die van dat model bestaan.
  w.__kleurVragen=[];
  w.fetch=async(u,o)=>{
    if(String(u).includes('/model-kleuren')){
      const b=JSON.parse(o.body); w.__kleurVragen.push(b);
      if(/kapot/i.test(b.model)) throw new Error('netwerk');
      return {ok:true, json:async()=>({ok:true, kleuren:['Onyx Black','Marble Grey','Cobalt Violet','Amber Yellow']})};
    }
    return {ok:true, json:async()=>({ok:true})};
  };
  w.eval("hwVenster({id:'hw4', merk:'samsung', model:'Galaxy S24', categorie:'Telefoon', specs:{Kleur:'onyx black'}, fotos:[], kanalen:{}, status:'voorraad'})");
  await new Promise(r=>setTimeout(r,30));
  const ms=d.getElementById('hw_merk_kies'), ks=d.getElementById('hw_kleur_kies');
  ok('merk: keuzelijst met het merk gekozen', ms && ms.value==='Samsung' && d.getElementById('hw_merk').hidden && d.getElementById('hw_merk').value==='Samsung');
  ok('kleur: kleuren van dit model gevraagd', w.__kleurVragen.some(v=>v.merk==='Samsung' && v.model==='Galaxy S24'));
  ok('kleur: keuzelijst met de kleuren van het model', !ks.hidden && ks.options.length===6 && /Marble Grey/.test(ks.textContent));
  ok('kleur: eigen schrijfwijze wordt de officiële naam', ks.value==='Onyx Black' && d.getElementById('hw_kleur').value==='Onyx Black');
  ks.value='Marble Grey'; w.eval('hwKleurKies()');
  ok('kleur: kiezen zet hem in het toestel', w.eval('hwFormRij()').specs.Kleur==='Marble Grey');
  ks.value='__anders'; w.eval('hwKleurKies()');
  ok('kleur: andere kleur laat je zelf typen', !d.getElementById('hw_kleur').hidden);
  ms.value='__anders'; w.eval('hwMerkKies()');
  ok('merk: ander merk laat je zelf typen', !d.getElementById('hw_merk').hidden && d.getElementById('hw_merk').value==='');
  ms.value='Apple'; w.eval('hwMerkKies()');
  ok('merk: kiezen zet het merk', d.getElementById('hw_merk').value==='Apple' && d.getElementById('hw_merk').hidden);
  w.eval("hwVenster({id:'hw5', merk:'Fairfoon', model:'Kapot 5', categorie:'Telefoon', specs:{Kleur:'Groen'}, fotos:[], kanalen:{}, status:'voorraad'})");
  await new Promise(r=>setTimeout(r,30));
  ok('merk: onbekend merk staat bij ander merk', d.getElementById('hw_merk_kies').value==='__anders' && !d.getElementById('hw_merk').hidden);
  ok('kleur: lukt opzoeken niet, dan gewoon typen', d.getElementById('hw_kleur_kies').hidden && !d.getElementById('hw_kleur').hidden && d.getElementById('hw_kleur').value==='Groen');
  w.eval('hwSluit(); showTab("dashboard")');

  // Specificaties van een telefoon: vanzelf opgehaald als ze ontbreken, de opslag kies je zelf,
  // en staat hij online dan gaat het meteen naar de webshop.
  w.__shop=[]; w.__geschreven.length=0;
  w.eval('for(const k in hwSpecsCache) delete hwSpecsCache[k]');   // eerdere tests vroegen dit model al op
  w.fetch=async(u,o)=>{
    const b=o&&o.body?JSON.parse(o.body):{};
    if(String(u).includes('/model-specs')) return {ok:true, json:async()=>({ok:true,
      specs:{Chip:'Exynos 2400', Werkgeheugen:'8 GB', Scherm:'6,2 inch AMOLED', Netwerk:'5G', Opslag:'128 GB'},
      opties:{Opslag:['128 GB','256 GB','512 GB']}})};
    if(String(u).includes('/model-kleuren')) return {ok:true, json:async()=>({ok:true, kleuren:['Onyx Black','Marble Grey']})};
    if(String(u).includes('/shopify')){ w.__shop.push(b.actie); return {ok:true, json:async()=>({ok:true})}; }
    return {ok:true, json:async()=>({ok:true})};
  };
  w.eval("hwVenster({id:'hw6', code:'A0089', merk:'Samsung', model:'Galaxy S24', categorie:'Telefoon', specs:{Kleur:'Onyx Black', Werkgeheugen:'12 GB'}, fotos:[], kanalen:{shopify:{id:'gid://shopify/Product/9', sleutel:'samsung_galaxy-s24_onyx-black'}}, status:'voorraad', verkoop:349})");
  await new Promise(r=>setTimeout(r,60));
  const sp=w.__geschreven.filter(g=>g[0]==='hardware' && g[1]==='update' && g[2].specs).pop();
  ok('specs: ontbrekende specs vanzelf opgehaald', !!sp && sp[2].specs.Chip==='Exynos 2400' && sp[2].specs.Netwerk==='5G');
  ok('specs: wat er al stond blijft staan', sp && sp[2].specs.Werkgeheugen==='12 GB' && sp[2].specs.Kleur==='Onyx Black');
  ok('specs: opslag niet gegokt als er meer varianten zijn', sp && !sp[2].specs.Opslag);
  ok('specs: online, dus de webshop meteen bijgewerkt', w.__shop.includes('prijs'));
  const os=d.getElementById('hw_opslag_kies');
  ok('opslag: kiezen uit de varianten van het model', os && !os.hidden && os.options.length===5 && /256 GB/.test(os.textContent));
  os.value='256 GB'; w.eval('hwOpslagKies()');
  ok('opslag: gekozen opslag gaat in de specs', w.eval('hwFormRij()').specs.Opslag==='256 GB');
  w.__shop.length=0;
  await w.eval('hwStilBewaar()');
  await new Promise(r=>setTimeout(r,20));
  ok('opslag: online en sleutel veranderd, dan naar de goede advertentie', w.__shop.includes('online'));
  w.eval('hwSluit(); showTab("dashboard")');

  // iPhone: geen vrije bron, dus geen zoekvraag, wel de eigen set van dit model en deze kleur.
  w.__pf=[]; w.__setRijen=[];
  w.fetch=async(u,o)=>{
    const b=o&&o.body?JSON.parse(o.body):{};
    if(String(u).includes('/productfotos')){ w.__pf.push(b); return {ok:true, json:async()=>({ok:true})}; }
    return {ok:true, json:async()=>({ok:true})};
  };
  w.eval(`window.__sbFrom=window.__sbFrom||sb.from;
    sb.from=(n)=>{ if(n!=='refurbish_fotos') return window.__sbFrom(n);
      const api={select(){return api;}, is(){return api;}, ilike(){return api;}, order(){return api;},
        delete(){ return api; }, then(r){ r({data:window.__setRijen, error:null}); }};
      return api; };`);
  w.eval("hwVenster({id:'hw7', code:'A0090', merk:'Apple', model:'iPhone 13', categorie:'Telefoon', specs:{Kleur:'Middernacht', Chip:'A15'}, fotos:[], kanalen:{}, status:'voorraad'})");
  await w.eval("hwFotosOphalen(null,false)");
  ok('iPhone: geen zoekvraag naar een bron die er niet is', !w.__pf.length);
  ok('iPhone: zegt hoe je een eigen set maakt', /Gebruik voor elke iPhone 13 Middernacht/.test(d.getElementById('hwFotoHint').textContent));
  w.__setRijen=[{pad:'t1/model_Apple-iPhone_13-Middernacht/open-1.jpg', kleur:'Middernacht'}];
  await w.eval("hwFotosOphalen(null,false)");
  ok('iPhone: de eigen set van dit model komt bij het toestel', w.eval('hwOpen.fotos.length')===1 && /Middernacht/.test(w.eval('hwOpen.fotos[0]')));
  // Eigen foto's van dit toestel worden de set voor elk volgend toestel van dit model.
  w.__setRijen=[]; w.__pf.length=0;
  w.eval("hwOpen.fotos=['https://x.supabase.co/storage/v1/object/public/refurbish-fotos/t1/hardware/hw7/1-0.jpg']; hwModelSetKnopZet()");
  ok('set: knop zichtbaar met model en kleur', !d.getElementById('hwModelSetKnop').hidden && /iPhone 13 Middernacht/.test(d.getElementById('hwModelSetKnop').textContent));
  await w.eval("hwFotosAlsModel(null)");
  ok('set: eigen foto gaat als modelfoto naar de opslag', w.__pf.length===1 && w.__pf[0].actie==='overnemen' && w.__pf[0].heelModel===true && w.__pf[0].kleur==='Middernacht' && w.__pf[0].aanzicht==='open' && /\/hardware\//.test(w.__pf[0].url));
  w.eval('sb.from=window.__sbFrom');

  // Toestellabel: ook vanuit de winkelapp, met een dooslabel erachter als er een doos bij zit.
  w.__prints=[];
  w.eval("printViaHelper=async(png,o)=>{ window.__prints.push(png); return {ok:true}; }; hwLabelPng=async(h,ap)=>'toestel:'+h.code; hwDoosLabelPng=(h)=>'doos:'+h.code;");
  w.eval("hwOpen.doos=true");
  const geprint=await w.eval("hwLabelPrinten('hw7', true)");
  ok('label: toestellabel en dooslabel geprint', geprint===true && w.__prints.join(',')==='toestel:A0090,doos:A0090');
  ok('label: knop op de toestelpagina', [...d.querySelectorAll('button')].some(b=>/Label printen/.test(b.textContent)));
  w.eval("hwOpen.specs=Object.assign({}, hwOpen.specs, {Opslag:'128 GB'}); hwOpen.staat='A'; hwOpen.accu=88; hwOpen.garantie=24");
  const lr=w.eval("hwLabelRegels(hwOpen).join('|')");
  ok('label: alles met naam erbij', /Kleur: Middernacht/.test(lr) && /Opslag: 128GB/.test(lr) && /Staat: A · Als nieuw/.test(lr) && /Batterij: 88%/.test(lr) && /Doos: ja/.test(lr) && /Garantie: 24 maanden/.test(lr));
  ok('label: bij een telefoon de specs van het kaartje, geen chip', !/Chip:/.test(lr));
  // Los toevoegen met een werkende printer: het nieuwe toestel opent en het label komt eruit.
  w.__prints.length=0;
  w.eval(`localStorage.setItem('storvoLabelPrinterOk','1'); hwSluit(); hwNieuw();
    window.__hwLaadEcht=window.__hwLaadEcht||hwLaad;
    hwLaad=async()=>{ hwData=[{id:'x', code:'A0091', merk:'Apple', model:'iPhone 14', categorie:'Telefoon', specs:{}, fotos:[], kanalen:{}, status:'voorraad'}]; };`);
  d.getElementById('hw_model').value='iPhone 14';
  await w.eval('hwOpslaan(null)');
  ok('los toevoegen: nieuw toestel opent meteen', w.eval('hwOpen && hwOpen.id')==='x');
  ok('los toevoegen: label vanzelf geprint', w.__prints.join(',')==='toestel:A0091');
  w.eval("hwLaad=window.__hwLaadEcht; localStorage.removeItem('storvoLabelPrinterOk'); hwSluit(); showTab('dashboard')");

  // Telefoon, Apple, model typen of kiezen, dan de kleuren en de opslag van precies dat model
  // uit de modellenlijst (model_kleuren), zonder iets op te hoeven zoeken.
  w.__edge=[]; w.__geschreven.length=0;
  w.fetch=async(u,o)=>{ w.__edge.push(String(u)); return {ok:true, json:async()=>({ok:true})}; };
  w.eval(`window.__sbFrom=window.__sbFrom||sb.from;
    sb.from=(n)=>{ if(n!=='model_kleuren') return window.__sbFrom(n);
      const rijen=[
        {merk:'Apple', model:'iPhone 13', kleuren:['Middernacht','Sterrenlicht','Blauw'], opslag:['128 GB','256 GB','512 GB'], volgorde:202102, toon:true},
        {merk:'Apple', model:'iPhone 13 Pro', kleuren:['Grafiet','Sierrablauw'], opslag:['128 GB','1 TB'], volgorde:202103, toon:true},
        {merk:'Apple', model:'iPhone SE 2020', kleuren:['Zwart'], opslag:['64 GB'], volgorde:202001, toon:false},
        {merk:'Samsung', model:'Galaxy S24', kleuren:['Onyx Black'], opslag:['128 GB'], volgorde:202401, toon:true}];
      const api={select(){return api;}, then(r){ r({data:rijen, error:null}); }};
      return api; };
    hwModellen=null;
    hwLocaties=[{id:'m1',naam:'Magazijn',soort:'magazijn',volgorde:0},{id:'l1',naam:'Winkel',soort:'winkel',volgorde:1}];
    hwSluit(); hwNieuw();`);
  ok('invoer: geen plekveld meer', !d.getElementById('hw_plek'));
  const ligt=d.getElementById('hw_loc_nieuw');
  ok('invoer: ligt in, met de winkel voorop', !!ligt && ligt.value==='l1' && ligt.options[0].textContent==='Winkel');
  d.getElementById('hw_cat').value='Telefoon'; d.getElementById('hw_cat').dataset.gekozen='1'; w.eval('hwKleurToon()');
  d.getElementById('hw_merk_kies').value='Apple'; w.eval('hwMerkKies()');
  const mv=d.getElementById('hw_model'); mv.value='13 pro';
  await w.eval('hwModellenLaden()'); w.eval('hwModelTyp()');
  const ml=d.getElementById('hwModelLijst');
  ok('model: typen vindt het juiste model', !ml.hidden && ml.querySelectorAll('.zoekrij').length===1 && /iPhone 13 Pro/.test(ml.textContent));
  mv.value='13'; w.eval('hwModelTyp()');
  const namen=[...ml.querySelectorAll('.zoekrij')].map(b=>b.textContent.trim());
  ok('model: nieuwste eerst, geen dubbele schrijfwijzen', namen.join('|')==='iPhone 13 Pro|iPhone 13');
  mv.value=''; w.eval('hwModelTyp()');
  ok('model: alleen modellen van dit merk', ![...ml.querySelectorAll('.zoekrij')].some(b=>/Galaxy/.test(b.textContent)) && !/SE 2020/.test(ml.textContent));
  w.eval("hwModelKies('iPhone 13')");
  await new Promise(r=>setTimeout(r,30));
  const ks2=d.getElementById('hw_kleur_kies'), os2=d.getElementById('hw_opslag_kies');
  ok('model: kleuren van dit model klaar', !ks2.hidden && /Sterrenlicht/.test(ks2.textContent) && !/Grafiet/.test(ks2.textContent));
  ok('model: opslag van dit model klaar', !os2.hidden && /512 GB/.test(os2.textContent) && !/1 TB/.test(os2.textContent));
  ok('model: kleur en opslag zonder iets op te zoeken', !w.__edge.some(u=>/model-kleuren|model-specs/.test(u)));
  ks2.value='Middernacht'; w.eval('hwKleurKies()'); os2.value='128 GB'; w.eval('hwOpslagKies()');
  w.eval("hwLaad=async()=>{}");
  await w.eval('hwOpslaan(null)');
  const ins=w.__geschreven.filter(g=>g[0]==='hardware' && g[1]==='insert').pop();
  ok('opslaan: alles uit de invoer gaat mee', !!ins && ins[2].merk==='Apple' && ins[2].model==='iPhone 13' && ins[2].categorie==='Telefoon'
     && ins[2].specs.Kleur==='Middernacht' && ins[2].specs.Opslag==='128 GB' && ins[2].locatie_id==='l1');
  ok('opslaan: geen plek meer meegestuurd', !('plek' in ins[2]));
  w.eval("hwLaad=window.__hwLaadEcht||hwLaad; sb.from=window.__sbFrom; hwModellen=null; hwSluit(); showTab('dashboard')");

  // Bij aanmaken staat de soort bovenaan, en een iPhone of Galaxy wordt vanzelf een telefoon,
  // zodat het kleurveld er meteen is.
  w.eval('hwNieuw()');
  const cat=d.getElementById('hw_cat');
  ok('aanmaken: soort staat bovenaan, niet onder meer gegevens', !!cat && !cat.closest('details'));
  ok('aanmaken: bij een laptop geen kleurveld', d.getElementById('hw_kleur_vak').hidden);
  d.getElementById('hw_merk_kies').value='Samsung'; w.eval('hwMerkKies()');
  d.getElementById('hw_model').value='Galaxy S24'; w.eval('hwSoortRaden()');
  ok('aanmaken: een Galaxy wordt een telefoon', cat.value==='Telefoon' && !d.getElementById('hw_kleur_vak').hidden);
  w.eval('hwSluit(); hwNieuw()');
  const cat2=d.getElementById('hw_cat'); cat2.value='Overig'; cat2.dataset.gekozen='1';
  d.getElementById('hw_model').value='iPhone 13'; w.eval('hwSoortRaden()');
  ok('aanmaken: zelf gekozen soort blijft staan', cat2.value==='Overig');
  w.eval('hwSluit(); showTab("dashboard")');

  // Online zetten vanuit de winkelapp: de pagina van het refurbish-deel in een venster,
  // zodat er één online-pagina is en niet twee die uit elkaar lopen.
  w.eval("abonnement={modules:['refurbish']}; hwData=[{id:'hw1', merk:'Dell', model:'Latitude 5430', status:'voorraad', kanalen:{}, fotos:[], specs:{}}]");
  w.eval("hwOnlineMenu({stopPropagation(){}, currentTarget:document.body, target:document.body, clientX:10, clientY:10}, 'hw1')");
  ok('online zetten: foto\'s, tekst en prijs in het menu', /Foto's, tekst en prijs/.test((d.getElementById('rijMenu')||{}).textContent||''));
  w.eval('sluitRijMenu()');
  await w.eval("hwOnlinePagina('hw1')");
  const onlVenster=d.getElementById('hwOnlineVenster');
  ok('online zetten: venster met de refurbish-pagina', !!onlVenster && /^\/refurbish\/\?online=hw1&ingebed=1$/.test(onlVenster.querySelector('iframe').getAttribute('src')));
  ok('online zetten: niet vanzelf verversen terwijl het open is', !w.eval('versieRustig()'));
  // jsdom zet bij postMessage geen origin; de echte browser wel. Daarom het bericht zelf
  // afvuren zoals de browser het aflevert. Een bericht van een ander domein telt niet.
  w.dispatchEvent(new w.MessageEvent('message', {data:{storvo:'online-klaar'}, origin:'https://kwaad.example'}));
  ok('online zetten: bericht van een ander domein doet niets', !!d.getElementById('hwOnlineVenster'));
  w.dispatchEvent(new w.MessageEvent('message', {data:{storvo:'online-klaar', melding:{tekst:'Opgeslagen', soort:true}}, origin:'https://storvo.app'}));
  await new Promise(r=>setTimeout(r,50));
  ok('online zetten: klaar sluit het venster', !d.getElementById('hwOnlineVenster'));
  w.eval("abonnement={modules:[]}");
  ok('online zetten: zonder refurbish-module geen venster', !w.eval('hwOnlinePaginaMag()'));
  w.eval("abonnement={modules:['refurbish']}; hwData=[]; showTab('dashboard')");

  // Webshop en labelprinter zijn koppelingen, geen modules.
  ok('webshop en labelprinter zijn geen module', w.eval("!MODULES.some(m=>m.id==='webshop'||m.id==='labelprinter')"));
  w.eval("showTab('dashboard')");

  console.log(fout? '\n'+fout+' FOUTEN' : '\nwinkelapp in orde');
  process.exit(fout?1:0);
},800);
