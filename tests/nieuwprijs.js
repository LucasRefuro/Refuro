// De nieuwprijs per model en opslag ("Nieuwprijs: €909,-" op het kaartje en in de webshop).
//
// Bewaakt:
//   1. de edge-functie model-nieuwprijs (prijzen.ts): welke opgezochte prijzen we bewaren.
//      Een verkeerde nieuwprijs is misleidend, dus alles wat niet klopt gaat eruit
//   2. de winkelapp: de eigen prijs wint van de lijst, het web op maar één keer tegelijk,
//      onthouden alleen als het iets nieuws is, en het formulier vult hem bij model en opslag
//      zonder wat je zelf typte te overschrijven
//   3. de werkbank: het kaartje en de pagina Online zetten krijgen de bekende prijs
//   4. de sticker (winkelapp en werkbank): de specs van het kaartje, de staat met dezelfde woorden,
//      de verkoopprijs en de nieuwprijs eronder. We vangen wat er echt getekend wordt
const {JSDOM}=require('jsdom');
const fs=require('fs');
const os=require('os');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

/* jsdom heeft geen canvas. Deze vangt wat er op de sticker getekend wordt (fillText), zodat we
   kunnen zien wat er echt op komt, niet alleen wat een hulpfunctie teruggeeft. */
function tekenVanger(win){
  win.__tekst=[];
  win.HTMLCanvasElement.prototype.getContext=function(){
    return {fillStyle:'', font:'', textBaseline:'', textAlign:'', strokeStyle:'', lineWidth:0, lineCap:'', lineJoin:'',
      fillRect(){}, drawImage(){}, beginPath(){}, arc(){}, fill(){}, moveTo(){}, lineTo(){}, stroke(){},
      measureText:(t)=>({width:String(t).length*8}),
      fillText:(t)=>win.__tekst.push(String(t))};
  };
  win.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,AAAA';
  win.Image=class{ set src(v){ setTimeout(()=>this.onload&&this.onload(),0); } };
}

/* Een nagebootste tabel model_nieuwprijzen die echt filtert (ilike = gelijk, hoofdletters tellen
   niet) en schrijft. Zonder filter zou een test met twee modellen niets bewijzen. */
const NP_TABEL=`
window.__np=[
  {id:'g1', team_id:null, merk:'Apple', model:'iPhone 13', opslag:'128GB', prijs:909},
  {id:'g2', team_id:null, merk:'Apple', model:'iPhone 13', opslag:'256GB', prijs:1029},
  {id:'g3', team_id:null, merk:'Apple', model:'iPhone 14', opslag:'128GB', prijs:1019}
];
window.__npSchrijf=[];
window.__npTabel=function(){
  const f=[];
  const api={select(){return api;},
    ilike(k,v){ f.push(r=>String(r[k]).toLowerCase()===String(v).toLowerCase()); return api; },
    insert(r){ window.__npSchrijf.push(['insert',r]); window.__np.push(Object.assign({id:'n'+window.__np.length}, r)); return Promise.resolve({error:null}); },
    update(r){ return {eq:(k,v)=>{ window.__npSchrijf.push(['update',r,v]); const x=window.__np.find(y=>y.id===v); if(x) Object.assign(x,r); return Promise.resolve({error:null}); }}; },
    then(res){ res({data:window.__np.filter(r=>f.every(t=>t(r))).map(r=>Object.assign({},r)), error:null}); }};
  return api;
};`;

(async()=>{
  // ── 1. wat de edge-functie bewaart ──
  const tmp=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'storvo-')),'prijzen.mts');
  fs.writeFileSync(tmp, fs.readFileSync(bron('supabase/functions/model-nieuwprijs/prijzen.ts'),'utf8'));
  const pz=await import('file://'+tmp);
  ok('opslag: "128 GB" en "128gb" zijn hetzelfde', pz.normOpslag('128 GB')==='128GB' && pz.normOpslag('128gb')==='128GB' && pz.normOpslag('1 TB')==='1TB');
  ok('opslag: geen maat is leeg', pz.normOpslag('veel')==='' && pz.normOpslag(null)==='');
  const url='https://www.iculture.nl/nieuws/iphone-13-prijzen';
  const goed=pz.schonePrijzen([
    {opslag:'256 GB', prijs:1029, bron_url:url},
    {opslag:'128 GB', prijs:909, bron_url:url},
    {opslag:'1 TB', prijs:1739, bron_url:url}
  ], ['128 GB','256 GB','512 GB']);
  ok('schoon: alleen gevraagde opslag, kleinste eerst', JSON.stringify(goed.map(g=>g.opslag+'='+g.prijs))==='["128GB=909","256GB=1029"]');
  ok('schoon: zonder bron telt het niet', pz.schonePrijzen([{opslag:'128 GB', prijs:909, bron_url:''}], ['128 GB']).length===0);
  ok('schoon: centen of een maandbedrag tellen niet', pz.schonePrijzen([{opslag:'128 GB', prijs:90900, bron_url:url},{opslag:'256 GB', prijs:39, bron_url:url}], ['128 GB','256 GB']).length===0);
  ok('schoon: meer opslag goedkoper is een verwarring, dan niets', pz.schonePrijzen([{opslag:'128 GB', prijs:1029, bron_url:url},{opslag:'256 GB', prijs:909, bron_url:url}], ['128 GB','256 GB']).length===0);
  ok('schoon: geen lijst is geen fout', pz.schonePrijzen(undefined, ['128 GB']).length===0);
  const fn=fs.readFileSync(bron('supabase/functions/model-nieuwprijs/index.ts'),'utf8');
  ok('functie: alleen ingelogd', /auth\.getUser\(\)/.test(fn) && /Niet ingelogd/.test(fn));
  ok('functie: alleen modellen uit de modellenlijst', /from\("model_kleuren"\)/.test(fn) && /bron: "onbekend"/.test(fn));
  ok('functie: één keer per dertig dagen, met slot', /DAGEN_TUSSEN_ZOEKEN = 30/.test(fn) && /nieuwprijs_gezocht_op\.is\.null/.test(fn));
  ok('functie: schrijft nooit in de prijs van een winkel', /team_id: null/.test(fn) && !/team_id: (account|wie)/.test(fn));

  // ── 2. de winkelapp ──
  const MOCK=`<script>
${NP_TABEL}
function _leegVoor(naam){
  if(naam==='model_nieuwprijzen') return window.__npTabel();
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},is(){return api;},ilike(){return api;},gte(){return api;},lte(){return api;},
    maybeSingle:async()=>({data:null}),
    insert(){ return {select:()=>({single:async()=>({data:{id:'x'}}), maybeSingle:async()=>({data:null})})}; },
    update(){ return api; }, delete(){return api;}, then(r){ r({data:[],error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:(n)=>_leegVoor(n),
  rpc:async()=>({data:[]}),
  storage:{from:()=>({upload:async()=>({error:null}), remove:async()=>({}), getPublicUrl:(p)=>({data:{publicUrl:p}})})},
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}),
  removeChannel(){}
})};
<\/script>`;
  const html=fs.readFileSync(bron('app/index.html'),'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
    .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
  const w=dom.window, d=w.document;
  const fouten=[]; w.onerror=m=>fouten.push(String(m));
  await wacht(800);
  ok('winkelapp start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));

  /* Het web: de functie model-nieuwprijs. Telt hoe vaak hij gevraagd wordt en zet na even
     wachten een prijs in de lijst, zoals de echte doet. */
  w.__zoek=[];
  w.fetch=async(u,o)=>{
    if(String(u).includes('/model-nieuwprijs')){
      const b=JSON.parse(o.body); w.__zoek.push(b);
      await wacht(40);
      if(b.model==='iPhone 15') w.__np.push({id:'w1', team_id:null, merk:'Apple', model:'iPhone 15', opslag:'128GB', prijs:969});
      return {ok:true, json:async()=>({ok:true, prijzen:b.model==='iPhone 15'?[{opslag:'128GB', prijs:969}]:[]})};
    }
    return {ok:true, json:async()=>({ok:true})};
  };
  w.eval(`sb.auth.getSession=async()=>({data:{session:{access_token:'t'}}});
    account={id:'e1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null};
    hwModellen=[
      {merk:'Apple', model:'iPhone 13', kleuren:['Middernacht','Groen'], opslag:['128 GB','256 GB','512 GB'], toon:true, scherm:'6,1 inch Super Retina XDR OLED', netwerk:'5G'},
      {merk:'Apple', model:'iPhone 14', kleuren:['Middernacht'], opslag:['128 GB'], toon:true},
      {merk:'Apple', model:'iPhone 15', kleuren:['Zwart'], opslag:['128 GB'], toon:true}
    ];`);

  ok('van: iPhone 13 met 128 GB is 909', JSON.stringify(await w.eval("nieuwprijsVan('Apple','iPhone 13','128 GB',false)"))==='{"prijs":909,"eigen":false}');
  ok('van: andere opslag, andere prijs', (await w.eval("nieuwprijsVan('apple','iphone 13','256GB',false)")).prijs===1029);
  ok('van: onbekende opslag is niets', await w.eval("nieuwprijsVan('Apple','iPhone 13','512 GB',false)")===null);
  ok('van: zonder opslag is niets', await w.eval("nieuwprijsVan('Apple','iPhone 13','',false)")===null);
  ok('van: zonder opzoeken niet het web op', w.__zoek.length===0);

  // Het web op: twee vragen tegelijk geven één zoektocht.
  const [a,b]=await Promise.all([w.eval("nieuwprijsVan('Apple','iPhone 15','128 GB',true)"), w.eval("nieuwprijsVan('Apple','iPhone 15','128 GB',true)")]);
  ok('opzoeken: één zoektocht voor twee vragen', w.__zoek.length===1 && a && b && a.prijs===969 && b.prijs===969);
  await w.eval("nieuwprijsVan('Apple','iPhone 14','256 GB',true)");
  await w.eval("nieuwprijsVan('Apple','iPhone 14','256 GB',true)");
  ok('opzoeken: niets gevonden, deze sessie niet nog eens', w.__zoek.filter(z=>z.model==='iPhone 14').length===1);

  // Onthouden: alleen iets nieuws.
  ok('onthoud: gelijk aan de lijst schrijft niets', await w.eval("nieuwprijsOnthoud('Apple','iPhone 13','128 GB',909)")===false && w.__npSchrijf.length===0);
  ok('onthoud: een andere prijs wordt de eigen prijs', await w.eval("nieuwprijsOnthoud('Apple','iPhone 13','128 GB',899)")===true &&
    w.__npSchrijf.length===1 && w.__npSchrijf[0][0]==='insert' && w.__npSchrijf[0][1].team_id==='t1' && w.__npSchrijf[0][1].opslag==='128GB' && w.__npSchrijf[0][1].prijs===899);
  ok('van: de eigen prijs wint van de lijst', JSON.stringify(await w.eval("nieuwprijsVan('Apple','iPhone 13','128 GB',false)"))==='{"prijs":899,"eigen":true}');
  ok('van: een eigen prijs geldt alleen voor die opslag', (await w.eval("nieuwprijsVan('Apple','iPhone 13','256 GB',false)")).prijs===1029);
  await w.eval("nieuwprijsOnthoud('Apple','iPhone 13','128 GB',879)");
  ok('onthoud: de eigen prijs bijwerken, niet een tweede', w.__npSchrijf.length===2 && w.__npSchrijf[1][0]==='update' && w.__np.filter(r=>r.team_id==='t1').length===1 && w.__np.find(r=>r.team_id==='t1').prijs===879);
  ok('onthoud: zonder opslag niets', await w.eval("nieuwprijsOnthoud('Apple','iPhone 13','',500)")===false && w.__npSchrijf.length===2);
  // Terug naar de lijst voor de rest van de test.
  w.eval("window.__np=window.__np.filter(r=>!r.team_id); for(const k in _nwCache) delete _nwCache[k]; window.__npSchrijf.length=0;");

  // Het formulier: een nieuw toestel.
  w.eval("showTab('hardware')");
  w.eval("hwVenster(null)");
  await wacht(30);
  const zet=(id,v)=>{ const e=d.getElementById(id); e.value=v; };
  ok('formulier: veld en uitleg staan er', !!d.getElementById('hw_nieuwprijs') && !!d.getElementById('hw_nieuwprijs_bron'));
  zet('hw_cat','Telefoon');
  zet('hw_merk','Apple'); zet('hw_model','iPhone 13'); zet('hw_opslag','128 GB');
  await w.eval('hwNieuwprijsVul()');
  const np=d.getElementById('hw_nieuwprijs');
  ok('formulier: model en opslag gekozen, nieuwprijs staat er', np.value==='909' && np.dataset.auto==='1');
  ok('formulier: zegt waar hij vandaan komt', /introductie/.test(d.getElementById('hw_nieuwprijs_bron').textContent));
  zet('hw_opslag','256 GB');
  await w.eval('hwNieuwprijsVul()');
  ok('formulier: andere opslag, prijs gaat mee', np.value==='1029');
  // Zelf typen: blijft staan, en wordt onthouden.
  np.value='999'; np.dispatchEvent(new w.Event('input'));
  await w.eval('hwNieuwprijsBewaar()');
  ok('formulier: zelf getypt wordt onthouden', w.__npSchrijf.length===1 && w.__npSchrijf[0][1].prijs===999 && w.__npSchrijf[0][1].opslag==='256GB' && w.__npSchrijf[0][1].model==='iPhone 13');
  ok('formulier: en zegt dat', /Onthouden/.test(d.getElementById('hw_nieuwprijs_bron').textContent));
  zet('hw_opslag','128 GB');
  await w.eval('hwNieuwprijsVul()');
  ok('formulier: wat je typte overschrijven we niet', np.value==='999');
  // Een onbekend model: het veld dat wij vulden gaat weer leeg.
  np.value=''; delete np.dataset.auto;
  await w.eval('hwNieuwprijsVul()');
  ok('formulier: na leegmaken weer de bekende prijs', np.value==='909' && np.dataset.auto==='1');
  zet('hw_model','iPhone 99');
  await w.eval('hwNieuwprijsVul()');
  ok('formulier: onbekend model, ons getal weg', np.value==='' && !np.dataset.auto);
  ok('formulier: een onbekend model gaat niet het web op', !w.__zoek.some(z=>z.model==='iPhone 99'));
  // Een laptop: niets.
  zet('hw_cat','Laptop'); zet('hw_model','iPhone 13');
  ok('formulier: een laptop krijgt geen nieuwprijs per opslag', await w.eval('hwNieuwprijsVul()')===null && np.value==='');
  ok('formulier: veld roept de functies aan', /hwNieuwprijsGetypt\(this\)/.test(np.getAttribute('oninput')) && /hwNieuwprijsBewaar\(\)/.test(np.getAttribute('onchange')));
  ok('formulier: opslag kiezen vult de prijs', /hwNieuwprijsVul\(\)/.test(w.eval('hwOpslagKies.toString()')) && /hwNieuwprijsVul\(\)/.test(w.eval('hwOpslagLaden.toString()')));
  w.eval('hwSluit()');

  // Een bestaand toestel dat al de bekende prijs had: die mag weer mee veranderen.
  w.eval(`hwData=[{id:'h7', merk:'Apple', model:'iPhone 13', categorie:'Telefoon', nieuwprijs:909, specs:{Kleur:'Groen', Chip:'A15', Opslag:'128 GB'}, fotos:[], kanalen:{}, status:'voorraad'}];
    hwVenster(hwData[0]); hwStilPlan=()=>{ window.__plan=(window.__plan||0)+1; };`);
  await wacht(30);
  await w.eval('hwNieuwprijsBelofte');
  ok('bestaand: de bekende prijs telt als de onze', d.getElementById('hw_nieuwprijs').dataset.auto==='1');
  w.eval("hwSluit()");
  // Het kaartje van een toestel zonder nieuwprijs pakt de lijst.
  ok('kaartje: zonder nieuwprijs de bekende prijs', /nieuwprijsVan\(h\.merk, h\.model/.test(w.eval('hwPrijskaart.toString()')));
  // Na opslaan: de nieuwprijs komt alsnog als het opzoeken nog liep.
  w.eval(`hwData=[{id:'h8', merk:'Apple', model:'iPhone 14', categorie:'Telefoon', nieuwprijs:null, specs:{Opslag:'128 GB'}, fotos:[], kanalen:{}, status:'voorraad', titel:'x'}];
    hwSpecsBelofte=null; window.__hwUpd=[];
    window.__vorigeFrom=sb.from;
    sb.from=(n)=>n==='hardware' ? {update:(r)=>({eq:()=>({is:async()=>{ window.__hwUpd.push(r); return {error:null}; }})})} : window.__vorigeFrom(n);`);
  await w.eval("hwNieuwAanvullen('h8')");
  ok('aanvullen: toestel dicht, nieuwprijs rechtstreeks op de rij', w.__hwUpd.length===1 && w.__hwUpd[0].nieuwprijs===1019 && w.eval("hwData[0].nieuwprijs")===1019);
  w.eval('sb.from=window.__vorigeFrom');

  // De sticker van de winkelapp: alles van het kaartje, met de prijs en de nieuwprijs.
  tekenVanger(w);
  w.eval("laadScript=async()=>{}");
  await w.eval(`hwLabelPng({code:'A0201', merk:'Apple', model:'iPhone 13', categorie:'Telefoon', staat:'B', accu:88, doos:true, garantie:24,
    verkoop:299, nieuwprijs:null, specs:{Kleur:'Groen', Opslag:'128 GB'}}, null)`);
  const st=w.__tekst.join('|');
  ok('sticker: specs van het kaartje erop', /Kleur: Groen/.test(st) && /Opslag: 128GB/.test(st) && /Scherm: 6,1 inch Super Retina XDR OLED/.test(st) && /Netwerk: 5G/.test(st) && /Batterij: 88%/.test(st));
  ok('sticker: staat met de woorden van het kaartje', /Staat: B · Nette staat/.test(st));
  ok('sticker: doos en garantie', /Doos: ja/.test(st) && /Garantie: 24 maanden/.test(st));
  ok('sticker: verkoopprijs en daaronder de nieuwprijs uit de lijst', /299/.test(st) && /Nieuwprijs: €\s?909,-/.test(st) && st.indexOf('299')<st.indexOf('Nieuwprijs'));
  w.__tekst.length=0;
  await w.eval(`hwLabelPng({code:'A0202', merk:'HP', model:'EliteBook 840 G8', categorie:'Laptop', staat:'C', accu:81, verkoop:399, nieuwprijs:1299,
    specs:{Processor:'Intel Core i5', Geheugen:'16 GB', Opslag:'512 GB SSD'}}, null)`);
  const sl=w.__tekst.join('|');
  ok('sticker laptop: specs en staat met de woorden van het kaartje', /Processor: Intel Core i5/.test(sl) && /Staat: C · Gebruikt, maar goed/.test(sl) && /Accu: 81%/.test(sl) && !/Scherm: \d/.test(sl) && /Nieuwprijs/.test(sl));
  w.__tekst.length=0;
  await w.eval(`hwLabelPng({code:'A0203', merk:'Apple', model:'iPhone 13', categorie:'Telefoon', staat:'B', verkoop:1200, specs:{Opslag:'128 GB'}}, null)`);
  ok('sticker: een nieuwprijs lager dan de prijs laten we weg', !/Nieuwprijs/.test(w.__tekst.join('|')));

  // ── 3. de werkbank ──
  const RMOCK=`<script>
${NP_TABEL}
window.__db={refurbish_apparaten:[], refurbish_onderdelen:[], refurbish_checklists:[], refurbish_orders:[], hardware_modellen:[],
  refurbish_instellingen:{team_id:'t1', accu_min:80, inscannen:false},
  hardware_locaties:[{id:'l1', team_id:'t1', naam:'Winkel', soort:'winkel', volgorde:0}], refurbish_fotos:[]};
function __tabel(naam){
  if(naam==='model_nieuwprijzen') return window.__npTabel();
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    or(){return api;}, in(){return api;}, ilike(){return api;}, not(){return api;}, is(){return api;},
    maybeSingle:async()=>({data: naam==='model_kleuren' ? {scherm:'6,1 inch Super Retina XDR OLED', netwerk:'5G'}
      : (Array.isArray(window.__db[naam]) ? (window.__db[naam][0]||null) : (window.__db[naam]||null))}),
    insert(){ return {select:()=>({single:async()=>({data:{id:'h1'}, error:null}), then:(res)=>res({data:[{id:'h1'}], error:null})})}; },
    upsert(){ return api; }, update(){ return api; }, delete(){ return api; },
    then(res){ res({data: Array.isArray(window.__db[naam])?window.__db[naam]:[], error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:{id:'u1'}}})},
  from:(n)=>n==='accounts'
    ? {select(){return this;}, eq(){return this;}, maybeSingle:async()=>({data:{id:'u1', team_id:'t1', rol:'eigenaar', naam:'Lucas'}})}
    : __tabel(n),
  rpc:async()=>({data:[]}),
  storage:{from:()=>({upload:async()=>({error:null}), getPublicUrl:(p)=>({data:{publicUrl:p}}), remove:async()=>({})})},
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}), removeChannel(){}
})};
<\/script>`;
  const rhtml=fs.readFileSync(bron('refurbish/index.html'),'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, RMOCK)
    .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
  const rdom=new JSDOM(rhtml,{runScripts:'dangerously', url:'https://storvo.app/refurbish/', pretendToBeVisual:true});
  const r=rdom.window, rd=r.document;
  const rfouten=[]; r.onerror=m=>rfouten.push(String(m));
  await wacht(900);
  ok('werkbank start zonder fout', rfouten.length===0);
  if(rfouten.length) console.log('   ', rfouten.slice(0,3).join(' | '));
  r.eval("account=Object.assign(account||{}, {id:'u1', team_id:'t1'})");
  r.eval(`apparaten.push({id:'p1', team_id:'t1', code:'A0101', merk:'Apple', model:'iPhone 13', categorie:'Telefoon', kleur:'Groen',
    specs:{Opslag:'256 GB'}, grade:'B', accu:90, status:'klaar', checklist:[], defecten:[], goede_delen:[]})`);
  ok('werkbank: opslag van het toestel', r.eval("opslagVan(apparaten.find(a=>a.id==='p1'))")==='256 GB');
  await r.eval("prijskaartVenster({a:apparaten.find(a=>a.id==='p1'), prijs:349, staat:'B', garantie:24})");
  ok('werkbank: kaartje krijgt de nieuwprijs van model en opslag', /Nieuwprijs: €\s?1\.029,-/.test((rd.getElementById('prijsVel')||{}).textContent||''));
  r.eval("sluit && sluit()");
  ok('werkbank: online zetten vult hem en onthoudt een eigen prijs',
    /nieuwprijsVan\(a\.merk, a\.model, opslagVan\(a\), false\)/.test(r.eval('fotosLaden.toString()')) &&
    /onlNieuwprijsBewaar\(\)/.test(rhtml));
  // Zelf getypt op de pagina Online zetten: onthouden.
  r.eval(`onl={a:apparaten.find(a=>a.id==='p1'), nieuwprijs:1099}`);
  r.eval('onlNieuwprijsBewaar()');
  await wacht(30);
  ok('werkbank: zelf getypte prijs wordt onthouden', r.__npSchrijf.length===1 && r.__npSchrijf[0][1].prijs===1099 && r.__npSchrijf[0][1].opslag==='256GB');
  // Een uitgesteld antwoord van het web zet het veld alleen als het nog leeg is.
  r.eval(`window.fetch=async()=>({ok:true, json:async()=>({ok:true, prijzen:[]})});
    apparaten.push({id:'p2', team_id:'t1', code:'A0102', merk:'Apple', model:'iPhone 14', categorie:'Telefoon', specs:{Opslag:'128 GB'}});
    onl={a:apparaten.find(a=>a.id==='p2'), nieuwprijs:null};`);
  await r.eval('onlNieuwprijsLater(onl.a)');
  ok('werkbank: later antwoord vult de lege nieuwprijs', r.eval('onl.nieuwprijs')===1019 && r.eval('onl.nieuwprijsAuto')===true);

  // De sticker van de werkbank: hetzelfde.
  tekenVanger(r);
  r.eval(`laadScript=async()=>{}; window.qrcode=()=>({addData(){}, make(){}, createDataURL:()=>'data:,'});
    apparaten.push({id:'p3', team_id:'t1', code:'A0103', merk:'Apple', model:'iPhone 13', categorie:'Telefoon', kleur:'Groen',
      specs:{Opslag:'128 GB', IMEI:'356789012345678'}, grade:'B', accu:91, doos:true, verkoop:329, status:'klaar', checklist:[], defecten:[], goede_delen:[]});`);
  await r.eval("deviceLabelPng(apparaten.find(a=>a.id==='p3'))");
  const sw=r.__tekst.join('|');
  ok('werkbank sticker: model met kleur en de grade met de woorden van het kaartje', /iPhone 13 - Groen/.test(sw) && /Grade B · Nette staat/.test(sw));
  ok('werkbank sticker: specs van het kaartje erop', /Opslag: 128GB/.test(sw) && /Scherm: 6,1 inch Super Retina XDR OLED/.test(sw) && /Netwerk: 5G/.test(sw) && /Batterij: 91%/.test(sw) && /Met doos/.test(sw));
  ok('werkbank sticker: geen IMEI', !/IMEI|356789012345678/.test(sw));
  ok('werkbank sticker: verkoopprijs en de nieuwprijs eronder', /329/.test(sw) && /Nieuwprijs: €\s?909,-/.test(sw));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nnieuwprijs in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
