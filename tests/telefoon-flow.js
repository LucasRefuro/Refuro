// Een telefoon toevoegen in de winkelapp, van map met fabrieksfoto's tot prijskaartje.
//
// Bewaakt:
//   1. de import van een fotomap (iphone-13/green/...): Engelse mapnamen worden het model en
//      de kleur uit de modellenlijst, de hoofdfoto uit storvo-hoofdfotos.json komt voorop,
//      een set die er al is wordt niet dubbel gezet, en alles gaat naar de eigen winkelmap
//   2. een modelset geeft de hoofdfoto als eerste foto aan het toestel
//   3. een nieuw toestel vult zichzelf aan: eerst de specs, dan de foto's, dan de tekst
//   4. het A6-kaartje van een telefoon: alleen scherm, opslag, 5G en batterij, zoals in Canva
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

const MOCK=`<script>
window.__geschreven=[];
function _leegVoor(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},is(){return api;},ilike(){return api;},gte(){return api;},lte(){return api;},
    maybeSingle:async()=>({data:null}),
    insert(r){ window.__geschreven.push([naam,'insert',r]); return {select:()=>({single:async()=>({data:{id:'x'}}), maybeSingle:async()=>({data:null})})}; },
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
  storage:{from:()=>({upload:async()=>({error:null}), remove:async()=>({}), getPublicUrl:(p)=>({data:{publicUrl:'https://x.supabase.co/storage/v1/object/public/refurbish-fotos/'+p}})})},
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}),
  removeChannel(){}
})};
<\/script>`;

const html=fs.readFileSync(bron('app/index.html'),'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
  .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[]; w.onerror=m=>fouten.push(String(m));

(async()=>{
  await wacht(800);
  const d=w.document;
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));

  w.eval(`sb.auth.getSession=async()=>({data:{session:{access_token:'t'}}});
    account={id:'e1', team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null};
    hwModellen=[
      {merk:'Apple', model:'iPhone 13', kleuren:['Middernacht','Sterrenlicht','Blauw','Roze','Groen','(PRODUCT)RED'], opslag:['128 GB','256 GB','512 GB'], toon:true, scherm:'6,1 inch Super Retina XDR OLED', netwerk:'5G'},
      {merk:'Apple', model:'iPhone 13 Pro', kleuren:['Grafiet','Goud','Zilver','Sierrablauw','Alpengroen'], opslag:['128 GB'], toon:true, scherm:'6,1 inch Super Retina XDR OLED', netwerk:'5G'},
      {merk:'Apple', model:'iPhone 16 Pro Max', kleuren:['Woestijntitanium','Naturel titanium','Wit titanium','Zwart titanium'], opslag:['256 GB'], toon:true},
      {merk:'Apple', model:'iPhone SE 2020', kleuren:['Zwart','Wit','(PRODUCT)RED'], opslag:[], toon:false},
      {merk:'Apple', model:'iPhone SE (2020)', kleuren:['Zwart','Wit','(PRODUCT)RED'], opslag:[], toon:true, scherm:'4,7 inch Retina HD LCD', netwerk:'4G'}
    ];`);

  // ── 1. de mapnamen ──
  ok('map: iphone-16-pro-max is de iPhone 16 Pro Max', w.eval("(mfModelVan('iphone-16-pro-max')||{}).model")==='iPhone 16 Pro Max');
  ok('map: iphone-se-2020 kiest de gewone naam, niet de alias', w.eval("(mfModelVan('iphone-se-2020')||{}).model")==='iPhone SE (2020)');
  ok('map: onbekend model is niets', w.eval("mfModelVan('iphone-99')")===null);
  ok('kleur: sierra-blue is Sierrablauw', w.eval("mfKleurVan(mfModelVan('iphone-13-pro'),'sierra-blue')")==='Sierrablauw');
  ok('kleur: product-red is (PRODUCT)RED', w.eval("mfKleurVan(mfModelVan('iphone-13'),'product-red')")==='(PRODUCT)RED');
  ok('kleur: black-titanium is Zwart titanium', w.eval("mfKleurVan(mfModelVan('iphone-16-pro-max'),'black-titanium')")==='Zwart titanium');
  ok('kleur: een Nederlandse mapnaam werkt ook', w.eval("mfKleurVan(mfModelVan('iphone-13'),'groen')")==='Groen');
  ok('kleur: een kleur die dit model niet heeft telt niet', w.eval("mfKleurVan(mfModelVan('iphone-13'),'sierra-blue')")===null);

  // ── de import zelf ──
  const bestand=(pad, inhoud)=>{
    const naam=pad.split('/').pop();
    const f=new w.File([inhoud||'jpg'], naam, {type:naam.endsWith('.json')?'application/json':'image/jpeg'});
    Object.defineProperty(f, 'webkitRelativePath', {value:'Iphone fotos/'+pad});
    return f;
  };
  const hoofd=JSON.stringify({uitleg:'x', hoofdfoto:{'iphone-13/green':'iphone-13_green_02.jpg'}});
  const map=[
    bestand('storvo-hoofdfotos.json', hoofd),
    bestand('iphone-13/green/iphone-13_green_01.jpg'), bestand('iphone-13/green/iphone-13_green_02.jpg'), bestand('iphone-13/green/iphone-13_green_03.jpg'),
    bestand('iphone-13/blue/iphone-13_blue_01.jpg'),
    bestand('iphone-13/midnight/iphone-13_midnight_01.jpg'),
    bestand('iphone-99/black/iphone-99_black_01.jpg'),
    bestand('iphone-13/green/.DS_Store')
  ];
  w.__uploads=[]; w.__fotoRijen=[];
  w.eval(`window.__sbFrom=sb.from;
    sb.storage={from:()=>({upload:async(p,f,o)=>{ window.__uploads.push([p,f.name,o]); return {error:null}; }, remove:async()=>({}),
      getPublicUrl:(p)=>({data:{publicUrl:'https://x.supabase.co/storage/v1/object/public/refurbish-fotos/'+p}})})};
    sb.from=(n)=>{
      if(n!=='refurbish_fotos') return window.__sbFrom(n);
      const api={select(){return api;}, is(){return api;}, ilike(){return api;}, order(){return api;},
        insert(r){ window.__fotoRijen.push(...r); return Promise.resolve({error:null}); },
        then(r){ r({data:[{model:'iPhone 13', kleur:'Blauw'}], error:null}); }};
      return api;
    };`);
  await w.eval('(i)=>mfImporteer(i)')({files:map, value:'x'});
  const groen=w.__fotoRijen.filter(r=>r.kleur==='Groen');
  ok('import: drie foto\'s van iPhone 13 Groen', groen.length===3 && groen.every(r=>r.model==='iPhone 13' && r.merk==='Apple' && r.apparaat_id===null && r.team_id==='t1'));
  const eerste=groen.find(r=>r.volgorde===0);
  ok('import: de hoofdfoto uit de lijst komt voorop', !!eerste && eerste.hoofd===true && eerste.aanzicht==='open' &&
     w.__uploads.find(u=>u[0]===eerste.pad)[1]==='iphone-13_green_02.jpg');
  ok('import: maar één hoofdfoto per set', groen.filter(r=>r.hoofd).length===1);
  ok('import: zonder lijst de eerste op naam', w.__fotoRijen.find(r=>r.kleur==='Middernacht' && r.hoofd) && w.__uploads.some(u=>u[1]==='iphone-13_midnight_01.jpg'));
  ok('import: een set die er al is niet dubbel', !w.__fotoRijen.some(r=>r.kleur==='Blauw'));
  ok('import: alles in de eigen winkelmap, als modelfoto', w.__uploads.length===4 && w.__uploads.every(u=>/^t1\/model_Apple-iPhone_13-/.test(u[0])));
  ok('import: geen .DS_Store of lijst als foto', !w.__uploads.some(u=>/DS_Store|json/.test(u[1])));
  const tekst=d.getElementById('mfVoortgang').textContent;
  ok('import: zegt wat er gebeurde', /2 sets met 4 foto's/.test(tekst) && /1 stond er al/.test(tekst) && /iphone-99\/black/.test(tekst));
  ok('import: knop staat bij Instellingen, Modellen', !!d.querySelector('#inst-modellen #mfMap[webkitdirectory]') && !!d.querySelector('#inst-modellen label[for="mfMap"]'));
  // Eén upload mislukt: de rest van die set wordt opgeruimd, geen halve set in de lijst.
  w.__weg=[]; w.__fotoRijen.length=0;
  w.eval(`sb.storage={from:()=>({upload:async(p,f)=>{ if(/_02/.test(f.name)) return {error:{message:'kapot'}}; await new Promise(r=>setTimeout(r,20)); return {error:null}; },
      remove:async(l)=>{ window.__weg.push(...l); return {}; }, getPublicUrl:(p)=>({data:{publicUrl:p}})})};`);
  await w.eval('(i)=>mfImporteer(i)')({files:[bestand('iphone-13/pink/iphone-13_pink_01.jpg'), bestand('iphone-13/pink/iphone-13_pink_02.jpg'), bestand('iphone-13/pink/iphone-13_pink_03.jpg')], value:''});
  ok('import: mislukte set laat niets achter', w.__fotoRijen.length===0 && w.__weg.length===2 && /iphone-13\/pink/.test(d.getElementById('mfVoortgang').textContent));
  ok('plek: ook uit de bestandsnaam', JSON.stringify(w.eval("mfPlek({name:'iphone-15-pro_white-titanium_03.jpg'})"))==='{"model":"iphone-15-pro","kleur":"white-titanium"}');

  // ── 2. de hoofdfoto van een set komt voorop bij het toestel ──
  w.eval(`sb.from=(n)=>{
      if(n!=='refurbish_fotos') return window.__sbFrom(n);
      const api={select(){return api;}, is(){return api;}, ilike(){return api;}, order(){return api;},
        then(r){ r({data:[{pad:'t1/model_x/dicht-1.jpg', kleur:'Groen', volgorde:0, hoofd:false},
                           {pad:'t1/model_x/open-1.jpg', kleur:'Groen', volgorde:1, hoofd:true}], error:null}); }};
      return api; };`);
  const urls=await w.eval("hwModelFotos('iPhone 13','Groen',true)");
  ok('set: hoofdfoto is de eerste foto', urls.length===2 && /open-1/.test(urls[0]));

  // ── 3. een nieuw toestel vult zichzelf aan ──
  w.__volgorde=[];
  w.fetch=async(u,o)=>{
    const b=o&&o.body?JSON.parse(o.body):{};
    if(String(u).includes('/hardware-tekst')){ w.__volgorde.push('tekst'); return {ok:true, json:async()=>({ok:true, titel:'iPhone 13 128GB Groen', omschrijving:'Een fijne telefoon.'})}; }
    if(String(u).includes('/productfotos')){ w.__volgorde.push('productfotos'); return {ok:true, json:async()=>({ok:true})}; }
    return {ok:true, json:async()=>({ok:true})};
  };
  w.eval(`hwData=[{id:'n1', merk:'Apple', model:'iPhone 13', categorie:'Telefoon', specs:{Kleur:'Groen', Chip:'A15', Opslag:'128 GB'}, fotos:[], kanalen:{}, status:'voorraad'}];
    hwVenster(hwData[0]);
    hwStilBewaar=async()=>{ window.__volgorde.push('bewaar'); };
    hwSpecsBelofte=new Promise(r=>setTimeout(()=>{ window.__volgorde.push('specs'); r(); }, 30));`);
  await w.eval("hwNieuwAanvullen('n1')");
  ok('aanvullen: eerst specs, dan de tekst', w.__volgorde.indexOf('specs')>-1 && w.__volgorde.indexOf('specs')<w.__volgorde.indexOf('tekst'));
  ok('aanvullen: iPhone haalt de set, geen zoekvraag', !w.__volgorde.includes('productfotos') && w.eval('hwOpen.fotos.length')===2);
  ok('aanvullen: de tekst staat in het formulier en is bewaard', d.getElementById('hw_titel').value==='iPhone 13 128GB Groen' && d.getElementById('hw_oms').value==='Een fijne telefoon.' && w.__volgorde.includes('bewaar'));
  ok('aanvullen: de statusregel is weer leeg', d.getElementById('hwAanvulHint').textContent==='');
  // Zelf al iets getypt: dan laat de stille tekst dat staan.
  d.getElementById('hw_titel').value='Eigen titel';
  await w.eval("hwTekstSchrijven('n1', true)");
  ok('aanvullen: wat je zelf typte blijft staan', d.getElementById('hw_titel').value==='Eigen titel');
  await w.eval("hwTekstSchrijven('n1', false)");
  ok('knop Schrijf: overschrijft wel', d.getElementById('hw_titel').value==='iPhone 13 128GB Groen');
  ok('opslaan van een nieuw toestel start het aanvullen', /hwNieuwAanvullen\(n\.id\)/.test(w.eval('hwOpslaan.toString()')));
  // Al een titel of foto's: dan niets opnieuw.
  w.__volgorde.length=0;
  w.eval("hwOpen.titel='Staat er al'; hwSpecsBelofte=null;");
  await w.eval("hwNieuwAanvullen('n1')");
  ok('aanvullen: niets dubbel als het er al is', !w.__volgorde.includes('tekst'));
  w.eval('hwSluit(); sb.from=window.__sbFrom; showTab("dashboard")');

  // ── 4. het prijskaartje van een telefoon ──
  const kaart=w.eval(`hwKaartData({merk:'Apple', model:'iPhone 13', categorie:'Telefoon', verkoop:299, nieuwprijs:909, staat:'B', garantie:24, nieuwe_accu:true,
    specs:{Kleur:'Groen', Opslag:'128 GB', Chip:'A15 Bionic', Camera:'12 MP', Scherm:'6,1 inch OLED, 2532 x 1170', Materiaal:'Aluminium'}})`);
  ok('kaartje: titel zonder dubbel Apple', kaart.titel==='iPhone 13');
  ok('kaartje: regel onder de titel zoals in Canva', kaart.samenvatting==='128GB | 6,1 inch | Super Retina XDR OLED');
  ok('kaartje: alleen scherm, opslag, 5G en batterij', JSON.stringify(kaart.specs)===JSON.stringify(['Super Retina XDR OLED 6,1 inch','Opslag: 128GB','5G','Batterijconditie: 100%']));
  ok('kaartje: prijs en nieuwprijs', kaart.prijs==='€299,-' && kaart.np==='€909,-');
  ok('kaartje: garantie zoals ingesteld', kaart.gar[0]==='24 maanden garantie');
  const galaxy=w.eval(`hwKaartData({merk:'Samsung', model:'Galaxy S24', categorie:'Telefoon', verkoop:449, accu:91,
    specs:{Opslag:'256 GB', Scherm:'6,2 inch Dynamic AMOLED 2X, 2340 x 1080', Netwerk:'5G'}})`);
  ok('kaartje: zonder modellenlijst uit de specs', galaxy.samenvatting==='256GB | 6,2 inch | Dynamic AMOLED 2X' && galaxy.specs[0]==='Dynamic AMOLED 2X 6,2 inch' && galaxy.specs.includes('Batterijconditie: 91%') && galaxy.titel==='Galaxy S24');
  const leeg=w.eval(`hwKaartData({merk:'Apple', model:'iPhone 13', categorie:'Telefoon', verkoop:299, specs:{}})`);
  ok('kaartje: niets bekend is geen halve regel', leeg.samenvatting==='6,1 inch | Super Retina XDR OLED' && !leeg.specs.some(s=>/undefined|null|:\s*$/.test(s)));
  const laptop=w.eval(`hwKaartData({merk:'HP', model:'EliteBook 840 G8', categorie:'Laptop', verkoop:499, specs:{Processor:'Intel Core i5-1135G7', Geheugen:'16 GB', Opslag:'512 GB SSD'}})`);
  ok('kaartje: een laptop blijft zoals hij was', laptop.titel==='HP EliteBook 840 G8' && /i5/.test(laptop.samenvatting) && laptop.specs.includes('Processor: Intel Core i5-1135G7'));

  console.log(fout? '\n'+fout+' FOUTEN' : '\ntelefoon-flow in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
