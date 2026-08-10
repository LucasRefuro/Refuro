// De webshop koppelen: het scherm in de instellingen.
//
// De echte koppeling praat met Shopify en dat kan hier niet, dus de server doen
// we na. Wat we wél testen is precies waar het misgaat bij dit soort schermen:
// zegt hij duidelijk wat er ontbreekt, en komt het token nergens terecht waar
// het niet hoort.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const RECHTEN={
  read_products:'toestellen terugzien op de webshop',
  write_products:'toestellen aanmaken en aanpassen',
  read_inventory:'de voorraad uitlezen',
  write_inventory:'de voorraad op één stuk zetten',
  read_orders:'zien wanneer er iets verkocht is',
  write_publications:'het toestel zichtbaar maken in de webshop'
};

const MOCK=`<script>
const _leeg={select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
  in(){return this;},maybeSingle:async()=>({data:null}),
  insert(){return {select:()=>({single:async()=>({data:{id:'x'}})})};},
  update(){return this;},delete(){return this;},then(r){ r({data:[],error:null}); }};
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{access_token:'t', user:{id:'u1'}}}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:()=>_leeg, rpc:async()=>({data:[]}),
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}),
  removeChannel(){}
})};

window.__antwoord=null;
window.__verstuurd=[];
window.fetch=async(url, opties)=>{
  window.__verstuurd.push([String(url), JSON.parse(opties.body||'{}')]);
  const a=window.__antwoord||{ok:true, gekoppeld:false, rechten:${JSON.stringify(RECHTEN)}};
  return {ok:a.ok!==false, json:async()=>a};
};
<\/script>`;

let html=fs.readFileSync(bron('app/index.html'),'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
  .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');

const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[]; w.onerror=(m)=>fouten.push(String(m));
const d=()=>w.document;
const vak=()=>d().getElementById('shopVak').innerHTML;

setTimeout(async()=>{
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  // ── de plek in de instellingen ──
  ok('webshop in de instellingen', !!d().querySelector('#instTabs button[data-s="webshop"]'));
  ok('eigen kaart', !!d().getElementById('inst-webshop'));

  // ── nog niet gekoppeld: de knop staat voorop ──
  w.__antwoord={ok:true, gekoppeld:false, kanOauth:true, rechten:RECHTEN};
  await w.eval('shopStatus()');
  await new Promise(r=>setTimeout(r,30));
  const uitleg=vak();
  ok('één knop om te koppelen', /Koppelen met Shopify/.test(uitleg));
  ok('geen token nodig', /geen sleutel aan te pas/.test(uitleg));
  ok('alleen een winkeladres invullen', !!d().getElementById('shop_domein'));
  ok('beide adresvormen mogen', /admin\.shopify\.com\/store/.test(uitleg));
  ok('alle zes rechten met uitleg erbij',
     Object.keys(RECHTEN).every(r=>uitleg.includes(r)));

  // ── de heenreis ──
  d().getElementById('shop_domein').value='https://mijnwinkel.myshopify.com/';
  w.__antwoord={ok:true, heen:'https://mijnwinkel.myshopify.com/admin/oauth/authorize?client_id=abc',
    domein:'mijnwinkel.myshopify.com'};
  w.eval("window.__gegaan=null; shopGaNaar=(a)=>{ window.__gegaan=a; };");
  await w.eval('shopKoppelen(document.createElement("button"))');
  await new Promise(r=>setTimeout(r,30));
  ok('stuurt je door naar Shopify', /oauth\/authorize/.test(String(w.__gegaan||'')));
  const start=w.__verstuurd.filter(v=>v[0].includes('shopify-koppelen')).pop();
  ok('vraagt de server om het adres', start[1].actie==='start');
  ok('met het getypte winkeladres', /mijnwinkel/.test(start[1].domein));

  // ── de tweede weg blijft bestaan voor oude apps ──
  ok('tweede weg staat er, ingeklapt', /shopanders/.test(uitleg) && /eigen app/.test(uitleg));
  ok('velden voor adres en token',
     !!d().getElementById('shop_domein2') && !!d().getElementById('shop_token'));
  ok('token staat verborgen tijdens het typen',
     d().getElementById('shop_token').type==='password');
  ok('zegt wat er met het token gebeurt', /versleuteld bewaard/.test(uitleg));

  // ── uitproberen met ontbrekende rechten ──
  d().getElementById('shop_domein2').value='https://mijnwinkel.myshopify.com/';
  d().getElementById('shop_token').value='shpat_abcdef123456';
  w.__antwoord={ok:true, geldig:true, domein:'mijnwinkel.myshopify.com', winkelnaam:'Mijn Winkel',
    mist:['write_publications'], rechten:RECHTEN,
    publicatie:'Online Store', locatie:'Winkel', aantalLocaties:1};
  await w.eval('shopTesten(document.createElement("button"))');
  await new Promise(r=>setTimeout(r,30));
  const na=d().getElementById('shopUitslag').innerHTML;
  ok('zegt welk recht ontbreekt', /write_publications/.test(na));
  ok('en dat het bijna goed is', /Bijna goed/.test(na));
  ok('legt uit wat je nu moet doen', /installeer opnieuw/.test(na));

  const roep=w.__verstuurd.filter(v=>v[0].includes('shopify-koppelen')).pop();
  ok('gaat naar de koppelfunctie', !!roep);
  ok('actie testen', roep[1].actie==='testen');
  ok('token gaat mee naar de server', roep[1].token==='shpat_abcdef123456');
  ok('domein gaat mee zoals getypt', roep[1].domein.includes('mijnwinkel'));

  // ── uitproberen met alles goed ──
  w.__antwoord={ok:true, geldig:true, domein:'mijnwinkel.myshopify.com', winkelnaam:'Mijn Winkel',
    mist:[], rechten:RECHTEN, publicatie:'Online Store',
    locatie:'Magazijn', aantalLocaties:2};
  await w.eval('shopTesten(document.createElement("button"))');
  await new Promise(r=>setTimeout(r,30));
  const goed=d().getElementById('shopUitslag').innerHTML;
  ok('zegt dat alles goed staat', /Alles staat goed/.test(goed));
  ok('noemt de winkel', /Mijn Winkel/.test(goed));
  ok('noemt waar de voorraad komt', /Magazijn/.test(goed) && /van 2 locaties/.test(goed));

  // ── koppelen ──
  w.__antwoord={ok:true, gekoppeld:true, kanOauth:true, domein:'mijnwinkel.myshopify.com',
    winkelnaam:'Mijn Winkel', token_staart:'3456', status:'actief', mist:[],
    rechten:RECHTEN, meldingen:['ORDERS_CREATE','ORDERS_PAID'],
    publicatie:true, locatie:true, laatst_gecontroleerd:new Date().toISOString()};
  await w.eval('shopOpslaan(document.createElement("button"))');
  await new Promise(r=>setTimeout(r,30));
  const aan=vak();
  ok('kaart staat op gekoppeld', /shopkaart aan/.test(aan));
  ok('winkelnaam bovenaan', /Mijn Winkel/.test(aan));
  ok('alleen de staart van het token', /••••3456/.test(aan) && !/shpat_/.test(aan));
  ok('verkoopkanaal gevonden', /Verkoopkanaal/.test(aan) && /Gevonden/.test(aan));
  ok('meldingen staan aan', /2 aan/.test(aan));
  ok('loskoppelen kan', /shopLos/.test(aan));
  const opslag=w.__verstuurd.filter(v=>v[0].includes('shopify-koppelen')).pop();
  ok('opslaan gaat naar de server', opslag[1].actie==='opslaan');

  // ── gekoppeld maar zonder verkoopkanaal ──
  w.eval(`shopStand={ok:true, gekoppeld:true, domein:'x.myshopify.com', winkelnaam:'X',
    token_staart:'9999', status:'actief', mist:[], rechten:{}, meldingen:[],
    publicatie:false, locatie:true};
    shopTeken();`);
  const half=vak();
  ok('waarschuwt als het verkoopkanaal mist', /geen verkoopkanaal gevonden/i.test(half));
  ok('waarschuwt als de meldingen uitstaan', /niet vanzelf uit je voorraad/.test(half));

  // ── token ingetrokken ──
  w.eval(`shopStand={ok:true, gekoppeld:true, domein:'x.myshopify.com', winkelnaam:'X',
    token_staart:'9999', status:'fout', fout:'Shopify accepteert het token niet meer.',
    mist:[], rechten:{}, meldingen:['ORDERS_CREATE'], publicatie:true, locatie:true};
    shopTeken();`);
  const stuk=vak();
  ok('een kapotte koppeling valt op', /shopkaart stuk/.test(stuk));
  ok('met de reden erbij', /accepteert het token niet meer/.test(stuk));
  ok('en de knop om opnieuw te koppelen', /shopOpnieuw/.test(stuk));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
},450);
