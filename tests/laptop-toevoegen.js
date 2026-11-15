// Een laptop toevoegen in de winkelapp, zonder de controle aan de werkbank.
//
// De eigenaar wilde van de werkbank alleen het deel specs, foto's en nieuwprijs, en dat in de
// winkelapp (november 2026). Bewaakt:
//   1. de rekenregel van een uitvoering: edge (model-nieuwprijs/prijzen.ts) en winkelapp moeten
//      precies dezelfde sleutel maken, anders vindt de app de opgezochte prijs nooit terug
//   2. het formulier: processor, geheugen, opslag en scherm aantikken uit de uitvoeringen van het
//      model, de rest (bouwjaar, gewicht, poorten) haalt Storvo op, het scherm alleen bij een laptop
//   3. de nieuwprijs per uitvoering: één keer opzoeken, wat je typt onthouden
//   4. een bestaande laptop: een aangetikte spec gaat ook naar de werkbank-rij, en alleen die
//   5. de edge-functie: alleen modellen uit de lijst, met slot, nooit in de prijs van een winkel
const {JSDOM}=require('jsdom');
const fs=require('fs');
const os=require('os');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

/* Een nagebootste database die echt filtert en schrijft, voor de tabellen die hier tellen.
   Alles wat schrijft komt in __schrijf, zodat we kunnen zien wat er naar welke tabel ging. */
const MOCK=`<script>
window.__tab={laptop_nieuwprijzen:[], refurbish_apparaten:[], hardware:[]};
window.__schrijf=[];
function _tabel(naam){
  const rijen=()=>window.__tab[naam]||(window.__tab[naam]=[]);
  const f=[]; let modus='select', waarden=null;
  const raak=()=>rijen().filter(x=>f.every(t=>t(x)));
  const api={
    select(){ return api; }, order(){ return api; }, limit(){ return api; }, in(){ return api; },
    gte(){ return api; }, lte(){ return api; }, or(){ return api; }, not(){ return api; },
    ilike(k,v){ f.push(r=>String(r[k]==null?'':r[k]).toLowerCase()===String(v).toLowerCase()); return api; },
    eq(k,v){ f.push(r=>r[k]===v); return api; },
    is(k,v){ f.push(r=>(r[k]==null?null:r[k])===v); return api; },
    insert(r){ window.__schrijf.push([naam,'insert',r]); const rij=Object.assign({id:naam+'_'+rijen().length}, r); rijen().push(rij);
      const p=Promise.resolve({data:rij, error:null});
      p.select=()=>({single:async()=>({data:rij, error:null}), maybeSingle:async()=>({data:rij, error:null})});
      return p; },
    update(r){ modus='update'; waarden=r; return api; },
    delete(){ modus='delete'; return api; },
    maybeSingle:async()=>({data:raak()[0]||null, error:null}),
    single:async()=>({data:raak()[0]||null, error:null}),
    then(res, rej){
      if(modus==='update'){ const h=raak(); window.__schrijf.push([naam,'update',JSON.parse(JSON.stringify(waarden)),h.map(x=>x.id)]); h.forEach(x=>Object.assign(x,waarden)); return Promise.resolve({data:null, error:null}).then(res,rej); }
      if(modus==='delete'){ return Promise.resolve({data:null, error:null}).then(res,rej); }
      return Promise.resolve({data:raak().map(x=>Object.assign({},x)), error:null}).then(res,rej);
    }
  };
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:(n)=>_tabel(n),
  rpc:async()=>({data:[]}),
  storage:{from:()=>({upload:async()=>({error:null}), remove:async()=>({}), getPublicUrl:(p)=>({data:{publicUrl:p}})})},
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}),
  removeChannel(){}
})};
<\/script>`;

/* Het model zoals de modellenlijst hem kent: vier processors, drie maten geheugen en opslag, één
   scherm en één videokaart. */
const SPECS={ok:true, bron:'lijst',
  specs:{Processor:'Intel Core i5-1335U', Geheugen:'16 GB', Opslag:'512 GB SSD', Scherm:'14 inch WUXGA', Videokaart:'Intel Iris Xe',
         Touchscreen:'Nee', Bouwjaar:'2023', Gewicht:'1,36 kg', Materiaal:'Aluminium', Poorten:'2x USB-C, 2x USB-A, HDMI'},
  opties:{Processor:['Intel Core i5-1335U','Intel Core i7-1355U','Intel Core i7-1365U','Intel Core i5-1345U'],
          Geheugen:['8 GB','16 GB','32 GB'], Opslag:['256 GB SSD','512 GB SSD','1 TB SSD'],
          Scherm:['14 inch WUXGA'], Videokaart:['Intel Iris Xe']}};

(async()=>{
  // ── 1. de rekenregel van een uitvoering ──
  const tmp=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'storvo-')),'prijzen.mts');
  fs.writeFileSync(tmp, fs.readFileSync(bron('supabase/functions/model-nieuwprijs/prijzen.ts'),'utf8'));
  const pz=await import('file://'+tmp);
  ok('sleutel: "Intel Core i5-1335U" en "i5-1335U" zijn hetzelfde', pz.uitvoeringSleutel('Intel Core i5-1335U','16 GB','512 GB NVMe SSD')==='i5 1335u|16GB|512GB'
    && pz.uitvoeringSleutel('i5-1335U','16GB DDR5','512gb')==='i5 1335u|16GB|512GB');
  ok('sleutel: AMD en Apple ook', pz.uitvoeringSleutel('AMD Ryzen™ 5 PRO 7540U','16 GB','1 TB')==='ryzen 5 pro 7540u|16GB|1TB'
    && pz.uitvoeringSleutel('Apple M2','8 GB','256 GB')==='m2|8GB|256GB');
  ok('sleutel: zonder geheugen of opslag geen sleutel', pz.uitvoeringSleutel('i5-1335U','','512 GB')==='' && pz.uitvoeringSleutel('i5-1335U','16 GB','veel')==='');
  const url='https://tweakers.net/pricewatch/1234/hp-elitebook-840-g10.html';
  ok('schoon: gevonden met bron telt', JSON.stringify(pz.schoneLaptopPrijs({gevonden:true, prijs:1899.4, bron_url:url}))===JSON.stringify({prijs:1899, bron_url:url}));
  ok('schoon: niet gevonden is niets', pz.schoneLaptopPrijs({gevonden:false, prijs:1899, bron_url:url})===null);
  ok('schoon: zonder bron, of een gek bedrag, is niets', pz.schoneLaptopPrijs({gevonden:true, prijs:1899, bron_url:''})===null
    && pz.schoneLaptopPrijs({gevonden:true, prijs:189900, bron_url:url})===null && pz.schoneLaptopPrijs({gevonden:true, prijs:49, bron_url:url})===null);
  // De controle of een gevonden Icecat-product echt dit model is (productfotos/codes.ts).
  const tmp2=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'storvo-')),'codes.mts');
  fs.writeFileSync(tmp2, fs.readFileSync(bron('supabase/functions/productfotos/codes.ts'),'utf8'));
  const cz=await import('file://'+tmp2);
  ok('foto-code: de titel van Icecat past bij het model', cz.titelPastBij('Lenovo V320 Notebook 43,9 cm (17.3") Full HD Intel Core i5-8250U','V320-17IKB')
    && cz.titelPastBij('HP EliteBook 840 G10 Laptop 35,6 cm','EliteBook 840 G10') && cz.titelPastBij('Lenovo ThinkPad E15 Gen 2 (Intel) Notebook','ThinkPad E15 Gen 2'));
  ok('foto-code: een andere generatie telt niet', !cz.titelPastBij('HP EliteBook 840 G8 Laptop','EliteBook 840 G10') && !cz.titelPastBij('Lenovo ThinkPad E15 Gen 3','ThinkPad E15 Gen 2'));
  ok('foto-code: een ander model telt niet, en zonder cijfers kunnen we het niet zeggen', !cz.titelPastBij('Lenovo IdeaPad 3 15IML05','V320-17IKB') && !cz.titelPastBij('Apple MacBook Air','MacBook Air'));
  ok('foto-code: codes schoon, uniek, geen zinnen', JSON.stringify(cz.schoneCodes([{code:'81AH0011MH'},{code:'81ah0011mh'},{code:'81AH 0012 MH'},{code:'6F6Z2EA#ABH'},{code:'abc'},{code:'een hele zin met 1 code'},{code:'GEENCIJFERS'}]))
    ==='["81AH0011MH","81AH0012MH","6F6Z2EA#ABH"]');
  const lijst=[{model:'ThinkPad Yoga 370'},{model:'yoga'},{model:'Thinkpad x13 Yoga Gen2'},{model:'20SM'},{model:'ThinkBook 15-IIL 20SM'}];
  ok('modellenlijst: getypt met extra code vindt de nette naam', (cz.kiesModelRij(lijst,'Thinkpad yoga 370 tp00078b')||{}).model==='ThinkPad Yoga 370');
  ok('modellenlijst: precies gaat voor', (cz.kiesModelRij(lijst,'thinkbook 15-iil 20sm')||{}).model==='ThinkBook 15-IIL 20SM');
  ok('modellenlijst: een ander model haakt niet aan', cz.kiesModelRij(lijst,'ThinkPad Yoga 260')===null && cz.kiesModelRij(lijst,'')===null);

  // ── de winkelapp laden ──
  const html=fs.readFileSync(bron('app/index.html'),'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
    .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
  const w=dom.window, d=w.document;
  w.scrollTo=()=>{};
  const fouten=[]; w.onerror=m=>fouten.push(String(m));
  await wacht(800);
  ok('winkelapp start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));

  // Dezelfde sleutel in de app als in de edge-functie, voor een rij lastige schrijfwijzen.
  const proeven=[['Intel® Core™ i7-1365U vPro','32 GB DDR5','1 TB PCIe NVMe SSD'],['Intel Core Ultra 7 155H','16GB','512 GB'],
    ['AMD Ryzen 7 PRO 7840U','64 GB','2 TB'],['Apple M3 Pro','18 GB','512 GB'],['i5-8350U','8 GB','256 GB SSD'],['','16 GB','512 GB']];
  ok('sleutel: app en edge rekenen precies hetzelfde', proeven.every(([p,g,o])=>
    w.eval(`nwlSleutel(${JSON.stringify({Processor:p, Geheugen:g, Opslag:o})})`)===pz.uitvoeringSleutel(p,g,o)));

  /* De functies op de server: model-specs geeft de uitvoeringen, model-nieuwprijs zoekt en zet
     (net als de echte) een rij in de gedeelde lijst. */
  w.__vragen=[];
  w.fetch=async(u,o)=>{
    const b=o&&o.body ? JSON.parse(o.body) : {};
    const naam=String(u).split('/').pop();
    w.__vragen.push([naam, b]);
    if(naam==='model-specs') return /840 G10/i.test(b.model) ? {ok:true, json:async()=>SPECS} : {ok:false, json:async()=>({ok:false, error:'Dit model staat nog niet in de lijst'})};
    if(naam==='model-nieuwprijs'){
      await wacht(30);
      let prijs=null;
      if(b.soort==='laptop' && b.processor==='Intel Core i7-1355U' && b.geheugen==='32 GB' && b.opslag==='1 TB SSD'){
        prijs=1899;
        w.__tab.laptop_nieuwprijzen.push({id:'lijst1', team_id:null, merk:'HP', model:'EliteBook 840 G10', uitvoering:'i7 1355u|32GB|1TB', prijs});
      }
      return {ok:true, json:async()=>({ok:true, prijs})};
    }
    return {ok:true, json:async()=>({ok:true})};
  };
  w.eval(`sb.auth.getSession=async()=>({data:{session:{access_token:'t'}}});
    account={id:'e1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null};`);

  // ── 2. het formulier van een nieuwe laptop ──
  w.eval("showTab('hardware'); hwVenster(null);");
  await wacht(30);
  const zet=(id,v)=>{ const e=d.getElementById(id); e.value=v; };
  const blok=d.getElementById('hw_lapspecs');
  ok('nieuw: een laptop krijgt het blok met de uitvoering', !!blok && !blok.hidden && d.getElementById('hw_cat').value==='Laptop');
  ok('nieuw: vijf velden, met het scherm', ['hw_sp_cpu','hw_sp_ram','hw_sp_ssd','hw_sp_scherm','hw_sp_win'].every(id=>!!d.getElementById(id))
    && !d.getElementById('hw_sp_scherm').closest('.lapspec').hidden);
  ok('nieuw: Windows heeft meteen zijn drie keuzes', d.querySelectorAll('#hw_sp_win_opties .optieknop').length===3);
  zet('hw_merk','HP'); zet('hw_model','EliteBook 840 G10');
  await w.eval('hwLapOptiesLaden()');
  const knoppen=id=>[...d.querySelectorAll('#'+id+'_opties .optieknop')];
  ok('uitvoeringen: de processors van het model als knoppen', knoppen('hw_sp_cpu').map(k=>k.textContent).join('|')===SPECS.opties.Processor.join('|'));
  ok('uitvoeringen: geheugen en opslag ook', knoppen('hw_sp_ram').length===3 && knoppen('hw_sp_ssd').length===3);
  ok('uitvoeringen: één scherm bekend, dan staat hij er al', d.getElementById('hw_sp_scherm').value==='14 inch WUXGA' && knoppen('hw_sp_scherm')[0].classList.contains('aan'));
  ok('uitvoeringen: processor niet zelf gekozen (er zijn er vier)', d.getElementById('hw_sp_cpu').value==='');

  knoppen('hw_sp_cpu')[1].click();
  ok('aantikken: zet het veld en licht op', d.getElementById('hw_sp_cpu').value==='Intel Core i7-1355U' && knoppen('hw_sp_cpu')[1].classList.contains('aan'));
  knoppen('hw_sp_cpu')[1].click();
  ok('aantikken: nog een keer maakt het weer leeg', d.getElementById('hw_sp_cpu').value==='' && !d.querySelector('#hw_sp_cpu_opties .optieknop.aan'));
  knoppen('hw_sp_cpu')[1].click();
  await w.eval('hwNieuwprijsBelofte');
  ok('nieuwprijs: nog niet zoeken zonder geheugen en opslag', !w.__vragen.some(v=>v[0]==='model-nieuwprijs'));
  knoppen('hw_sp_ram')[2].click();
  await w.eval('hwNieuwprijsBelofte');
  knoppen('hw_sp_ssd')[2].click();
  await w.eval('hwNieuwprijsBelofte');
  const np=d.getElementById('hw_nieuwprijs');
  const zoek=w.__vragen.filter(v=>v[0]==='model-nieuwprijs');
  ok('nieuwprijs: één keer opgezocht, voor deze uitvoering', zoek.length===1 && zoek[0][1].soort==='laptop' && zoek[0][1].processor==='Intel Core i7-1355U'
    && zoek[0][1].geheugen==='32 GB' && zoek[0][1].opslag==='1 TB SSD' && zoek[0][1].scherm==='14 inch WUXGA' && zoek[0][1].merk==='HP');
  ok('nieuwprijs: staat in het veld, als de onze', np.value==='1899' && np.dataset.auto==='1');
  ok('nieuwprijs: zegt waar hij vandaan komt', /introductie/.test(d.getElementById('hw_nieuwprijs_bron').textContent));
  await w.eval('hwNieuwprijsVul()');
  ok('nieuwprijs: daarna uit de lijst, niet nog eens het web op', w.__vragen.filter(v=>v[0]==='model-nieuwprijs').length===1 && np.value==='1899');

  knoppen('hw_sp_win')[0].click();
  const sp=JSON.parse(w.eval('JSON.stringify(hwKleurVeld().specs||null)'));
  ok('opslaan: de aangetikte uitvoering gaat mee', sp && sp.Processor==='Intel Core i7-1355U' && sp.Geheugen==='32 GB' && sp.Opslag==='1 TB SSD' && sp.Scherm==='14 inch WUXGA' && sp.Windows==='Windows 11 Pro');
  ok('opslaan: de vaste modelfeiten haalt Storvo erbij', sp && sp.Bouwjaar==='2023' && sp.Gewicht==='1,36 kg' && sp.Poorten==='2x USB-C, 2x USB-A, HDMI' && sp.Materiaal==='Aluminium');
  ok('opslaan: één videokaart bekend, die gaat mee', sp && sp.Videokaart==='Intel Iris Xe');
  ok('opslaan: geen kleur bij een laptop', sp && !('Kleur' in sp));

  // Zelf een andere prijs typen: onthouden voor deze uitvoering, in je eigen winkel.
  np.value='1799'; np.dispatchEvent(new w.Event('input'));
  await w.eval('hwNieuwprijsBewaar()');
  const ins=w.__schrijf.filter(x=>x[0]==='laptop_nieuwprijzen' && x[1]==='insert');
  ok('zelf getypt: onthouden voor deze uitvoering', ins.length===1 && ins[0][2].team_id==='t1' && ins[0][2].uitvoering==='i7 1355u|32GB|1TB'
    && ins[0][2].prijs===1799 && ins[0][2].bron==='winkel' && ins[0][2].processor==='Intel Core i7-1355U');
  ok('zelf getypt: en zegt dat', /deze uitvoering/.test(d.getElementById('hw_nieuwprijs_bron').textContent));
  ok('zelf getypt: daarna wint jouw prijs', JSON.stringify(await w.eval("nieuwprijsLaptopVan('HP','EliteBook 840 G10',{Processor:'i7-1355U',Geheugen:'32GB',Opslag:'1TB'},false)"))==='{"prijs":1799,"eigen":true}');
  await w.eval('hwNieuwprijsBewaar()');
  ok('zelf getypt: dezelfde prijs nog eens schrijft niets', w.__schrijf.filter(x=>x[0]==='laptop_nieuwprijzen').length===1);

  // Een andere uitvoering die niemand kent: zoeken, niets, en dat zeggen.
  np.value=''; delete np.dataset.auto;
  knoppen('hw_sp_ram')[0].click();
  await w.eval('hwNieuwprijsBelofte');
  ok('niet gevonden: veld blijft leeg, en dat staat erbij', np.value==='' && /Geen nieuwprijs gevonden/.test(d.getElementById('hw_nieuwprijs_bron').textContent));
  const voor=w.__vragen.filter(v=>v[0]==='model-nieuwprijs').length;
  await w.eval('hwNieuwprijsVul()');
  ok('niet gevonden: in deze sessie niet nog eens het web op', w.__vragen.filter(v=>v[0]==='model-nieuwprijs').length===voor);

  // Andere soort: desktop zonder scherm, telefoon zonder het blok.
  zet('hw_cat','Desktop'); w.eval('hwKleurToon()');
  ok('desktop: wel het blok, geen scherm', !blok.hidden && d.getElementById('hw_sp_scherm').closest('.lapspec').hidden);
  const dsp=JSON.parse(w.eval('JSON.stringify(hwKleurVeld().specs||{})'));
  ok('desktop: scherm gaat niet mee bij opslaan, de rest wel', !('Scherm' in dsp) && dsp.Processor==='Intel Core i7-1355U');
  ok('artikelcode: het vak staat er bij een desktop en laptop', !d.getElementById('hw_artikel_vak').hidden);
  zet('hw_cat','Telefoon'); w.eval('hwKleurToon()');
  ok('telefoon: geen laptopblok, wel kleur en opslag', blok.hidden && !d.getElementById('hw_kleur_vak').hidden && !d.getElementById('hw_opslag_vak').hidden);
  ok('artikelcode: bij een telefoon niet', d.getElementById('hw_artikel_vak').hidden);
  w.eval('hwSluit()');

  // ── 4. een bestaande laptop ──
  const bestaand={id:'hw1', merk:'HP', model:'EliteBook 840 G10', categorie:'Laptop', staat:'A', status:'voorraad', nieuwprijs:1500, fotos:[], kanalen:{},
    specs:{Processor:'Intel Core i5-1335U', Geheugen:'16 GB', Opslag:'512 GB SSD', Scherm:'14 inch WUXGA', Windows:'Windows 11 Pro 23H2', Bouwjaar:'2023'}};
  w.__tab.hardware=[JSON.parse(JSON.stringify(bestaand))];
  w.__tab.refurbish_apparaten=[{id:'ap1', hardware_id:'hw1', specs:{Processor:'Intel Core i5-1335U', Windows:'Windows 11 Pro 23H2', Accu:'Ontwerp 50 Wh'}}];
  w.__schrijf.length=0;
  const specsVoor=w.__vragen.filter(v=>v[0]==='model-specs').length;
  w.eval(`hwData=[${JSON.stringify(bestaand)}]; hwVenster(hwData[0]);`);
  await wacht(30);
  await w.eval('hwLapOptiesLaden()');
  ok('bestaand: de velden staan ingevuld', d.getElementById('hw_sp_cpu').value==='Intel Core i5-1335U' && d.getElementById('hw_sp_win').value==='Windows 11 Pro 23H2');
  ok('bestaand: wat hij heeft licht op', knoppen('hw_sp_cpu')[0].classList.contains('aan'));
  ok('bestaand: heeft de modelfeiten al, dus niet opnieuw ophalen', w.__vragen.filter(v=>v[0]==='model-specs').length===specsVoor);
  ok('bestaand: de knop Specs ophalen staat er ook bij een laptop', /Specs opnieuw ophalen/.test(d.getElementById('hwDetail').textContent));
  ok('bestaand: een zelf ingevulde nieuwprijs blijft staan', d.getElementById('hw_nieuwprijs').value==='1500' && !w.__vragen.some(v=>v[0]==='model-nieuwprijs' && v[1].processor==='Intel Core i5-1335U'));
  knoppen('hw_sp_cpu')[2].click();
  await w.eval('hwStilBewaar()');
  const hwUp=w.__schrijf.filter(x=>x[0]==='hardware' && x[1]==='update').pop();
  ok('bestaand: de nieuwe processor gaat naar het toestel', !!hwUp && hwUp[2].specs.Processor==='Intel Core i7-1365U' && hwUp[2].specs.Windows==='Windows 11 Pro 23H2' && hwUp[2].specs.Bouwjaar==='2023');
  const apUp=w.__schrijf.filter(x=>x[0]==='refurbish_apparaten' && x[1]==='update').pop();
  ok('bestaand: en naar de werkbank-rij (Online zetten leest die)', !!apUp && apUp[2].specs.Processor==='Intel Core i7-1365U');
  ok('bestaand: de rest van de werkbank-rij blijft staan', !!apUp && apUp[2].specs.Accu==='Ontwerp 50 Wh' && apUp[2].specs.Windows==='Windows 11 Pro 23H2' && !('Geheugen' in apUp[2].specs));

  // Foto's ophalen: zonder code wijst de uitleg naar de sticker, met code gaat die mee.
  w.__fotoAntw={ok:true, opgeslagen:0, reden:'niet-gevonden'};
  const oudFetch=w.fetch;
  w.fetch=async(u,o)=>{ if(String(u).includes('/productfotos')){ w.__vragen.push(['productfotos', JSON.parse(o.body)]); return {ok:true, json:async()=>w.__fotoAntw}; } return oudFetch(u,o); };
  await w.eval('hwFotosOphalen(null, false, true)');
  let pf=w.__vragen.filter(v=>v[0]==='productfotos').pop();
  ok('foto\'s: zonder code de modelnaam en de soort mee', !!pf && pf[1].actie==='automatisch' && pf[1].model==='EliteBook 840 G10' && pf[1].categorie==='Laptop' && pf[1].productcode==='');
  ok('foto\'s: niets gevonden, dan wijst de uitleg naar de sticker', /artikelcode van de sticker/.test(d.getElementById('hwFotoHint').textContent));
  d.getElementById('hw_sp_artikel').value=' 81AH 0011MH ';
  d.getElementById('hw_sp_artikel').dispatchEvent(new w.Event('change', {bubbles:true}));
  await w.eval('hwFotosOphalen(null, false, true)');
  pf=w.__vragen.filter(v=>v[0]==='productfotos').pop();
  ok('foto\'s: de code van de sticker gaat mee, zonder spaties', pf[1].productcode==='81AH0011MH');
  ok('artikelcode: bewaard bij de specs', JSON.parse(w.eval('JSON.stringify(hwOpen.specs)')).Artikelcode==='81AH0011MH');
  w.fetch=oudFetch;
  w.eval('hwSluit()'); await wacht(60);
  w.eval(`hwData=[${JSON.stringify(Object.assign({}, bestaand, {id:'hw2', specs:Object.assign({}, bestaand.specs, {Artikelcode:'6F6Z2EA#ABH; 8A3D'})}))}]; hwVenster(hwData[0]);`);
  await wacht(20);
  ok('artikelcode: twee codes van de werkbank blijven zoals ze stonden', w.eval('hwKleurVeld().specs')===undefined && d.getElementById('hw_sp_artikel').value==='6F6Z2EA#ABH; 8A3D');
  w.eval('hwSluit()');

  // ── 5. de edge-functie ──
  const fn=fs.readFileSync(bron('supabase/functions/model-nieuwprijs/index.ts'),'utf8');
  ok('edge: laptop is een eigen tak', /lijf\?\.soort \|\| ""\) === "laptop"\) return await laptopNieuwprijs/.test(fn));
  ok('edge: alleen modellen uit de modellenlijst', /from\("hardware_modellen"\)/.test(fn) && /laptopNieuwprijs[\s\S]*bron: "onbekend"/.test(fn));
  ok('edge: zonder processor, geheugen en opslag niet zoeken', /if \(!sleutel\) return fout\(/.test(fn));
  ok('edge: eens per dertig dagen per uitvoering, met slot', /from\("laptop_nieuwprijzen"\)\.update\(\{ gezocht_op: nu \}\)/.test(fn) && /ignoreDuplicates: true \}\)\.select\("id"\)/.test(fn));
  ok('edge: alleen in de gedeelde lijst, nooit in de prijs van een winkel', /team_id: null, merk: m\.merk/.test(fn) && !/team_id: (account|wie)/.test(fn));
  ok('edge: mislukt, dan het slot terug', /update\(\{ gezocht_op: null \}\)/.test(fn));
  ok('edge: telefoons zoeken nog steeds op dezelfde manier', /from\("model_kleuren"\)/.test(fn) && /schonePrijzen\(inv\.prijzen, gevraagd\)/.test(fn));
  const pfn=fs.readFileSync(bron('supabase/functions/productfotos/index.ts'),'utf8');
  ok('foto-edge: eerst de onthouden code van het model', /\[p\.productcode, rij\?\.icecat_code\]/.test(pfn));
  ok('foto-edge: opzoeken alleen bij een laptop uit de lijst', /isLaptop\(lijf\?\.categorie\)/.test(pfn) && /!magOpzoeken \|\| !rij/.test(pfn));
  ok('foto-edge: eens per dertig dagen per model, met slot', /icecat_gezocht_op\.is\.null,icecat_gezocht_op\.lt\./.test(pfn));
  ok('foto-edge: alleen als de titel van Icecat bij het model past', /if \(!titelPastBij\(uit\.titel, rij\.model\)\)/.test(pfn));
  ok('foto-edge: de code die werkt wordt onthouden', /update\(\{ icecat_code: c \}\)/.test(pfn));
  ok('foto-edge: telefoons zoeken niet op het web naar codes', /if \(telefoon\) \{\s*gevonden = await zoekIcecat/.test(pfn));
  ok('foto-edge: zoekt iemand anders net, dan wachten op diens code', /if \(!slot\?\.length\) \{\s*const code = await wachtOpCode\(rij\.id\)/.test(pfn) && /bron: "icecat-gewacht"/.test(pfn));
  ok('foto-edge: na wachten niet nog eens opslaan', /if \(bron === "icecat-gewacht"\)/.test(pfn) && /if \(aanwezig\) return klaar\(\{ opgeslagen: 0, aanwezig/.test(pfn));
  ok('foto-edge: niets gevonden laat dat weten aan wie wacht', /update\(\{ icecat_code: "" \}\)/.test(pfn) && /if \(data\?\.icecat_code === ""\) return null/.test(pfn));
  ok('foto-edge: welke aanzichten er al zijn pas na het zoeken', pfn.indexOf('const bezet') > pfn.indexOf('if (bron === "icecat-gewacht")'));
  ok('foto-edge: de nette naam uit de lijst ook bij extra tekst', /kiesModelRij\(data \|\| \[\], n\)/.test(pfn));
  const rfb=fs.readFileSync(bron('refurbish/index.html'),'utf8');
  ok('online zetten: herladen als de foto\'s er al staan', /uit\.opgeslagen \|\| uit\.aanwezig/.test(rfb));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nlaptop-toevoegen in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message, (e.stack||'').split('\n').slice(0,4).join(' | ')); process.exit(1); });
