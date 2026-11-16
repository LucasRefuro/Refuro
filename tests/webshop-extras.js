// Extra's bij een toestel op de webshop (glas, hoesje, stekker, klaar voor gebruik).
//
// De eigenaar wil één voorraad voor winkel en webshop. Wat hier fout kan gaan merk je pas
// dagen later: een glas dat online te koop staat terwijl het op is, of een webshopverkoop die
// twee keer van de voorraad gaat omdat twee apparaten openstaan. Daar testen we op.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

const EXTRAS=[
  {id:'x1', sleutel:'stekker', naam:'Snellader 20W', soort:'artikel', voor:['Telefoon'], prijs:14.95, actief:true, volgorde:1, alleen_ophalen:false,
   varianten:[{label:'Standaard', modellen:[], delen:[['STEK']]}]},
  {id:'x2', sleutel:'beschermset', naam:'Beschermset: glas en hoesje', soort:'artikel', voor:['Telefoon'], prijs:19.95, actief:true, volgorde:2, alleen_ophalen:false,
   varianten:[{label:'iPhone 13', modellen:['iPhone 13'], delen:[['GLAS13','GLAS13X'],['HOES13']]},
              {label:'iPhone 11', modellen:['iPhone 11'], delen:[['GLAS11'],['HOES11']]}]},
  {id:'x3', sleutel:'glas', naam:'Screenprotector van gehard glas', soort:'artikel', voor:['Telefoon'], prijs:9.95, actief:true, volgorde:3, alleen_ophalen:false,
   varianten:[{label:'iPhone 13', modellen:['iPhone 13'], delen:[['GLAS13','GLAS13X']]}]},
  {id:'x4', sleutel:'klaar', naam:'Klaar voor gebruik', soort:'dienst', voor:['Telefoon','Laptop'], prijs:19, actief:true, volgorde:7, alleen_ophalen:true,
   varianten:[{label:'Telefoon', modellen:[], categorie:'Telefoon', prijs:19, delen:[]},{label:'Laptop', modellen:[], categorie:'Laptop', prijs:29, delen:[]}]},
  {id:'x5', sleutel:'accu-telefoon', naam:'Nieuwe accu voor je telefoon', soort:'dienst', voor:['Telefoon'], prijs:39, actief:true, volgorde:20, alleen_ophalen:false,
   handle:'nieuwe-accu-telefoon', sku_voorvoegsel:'NIEUWE-ACCU-TELEFOON',
   varianten:[{label:'OEM tot en met iPhone 15', prijs:39, accu:'oem', modellen:['iPhone 12'], delen:[]},
              {label:'OEM vanaf iPhone 16', prijs:49, accu:'oem', modellen:[], delen:[]},
              {label:'Origineel', prijs:95, accu:'origineel', modellen:[], delen:[]}]}
];
const PRODUCTEN=[
  {id:1, barcode:'STEK',    naam:'Xssive 20W',        voorraad:3, winkel:1},
  {id:2, barcode:'GLAS13',  naam:'Glas iPhone 13',    voorraad:1, winkel:1},
  {id:3, barcode:'GLAS13X', naam:'Xssive glas 13',    voorraad:2, winkel:0},
  {id:4, barcode:'HOES13',  naam:'Hoes iPhone 13',    voorraad:2, winkel:2},
  {id:5, barcode:'GLAS11',  naam:'Glas iPhone 11',    voorraad:0, winkel:0}
];
const BESTELLINGEN=[
  {id:'b1', nummer:'#2001', geannuleerd:false, extras_boeking:null,
   extras:[{sleutel:'beschermset', label:'iPhone 13', aantal:1, delen:[['GLAS13','GLAS13X'],['HOES13']]}]},
  {id:'b2', nummer:'#2002', geannuleerd:true, extras_boeking:null,
   extras:[{sleutel:'glas', label:'iPhone 13', aantal:1, delen:[['GLAS13','GLAS13X']]}]},
  {id:'b3', nummer:'#2003', geannuleerd:false, extras_boeking:null,
   extras:[{sleutel:'klaar', label:'Telefoon', aantal:1, delen:[]}]}
];

const MOCK=`<script>
window.__extrasUpd=[]; window.__fetch=[];
window.__rijen=${JSON.stringify(BESTELLINGEN)};
window.__extras=${JSON.stringify(EXTRAS)};
const _leeg={select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
  in(){return this;},is(){return this;},or(){return this;},maybeSingle:async()=>({data:null}),
  insert(){return {select:()=>({single:async()=>({data:{id:'x'}})})};},
  update(){return this;},delete(){return this;},then(r){ r({data:[],error:null}); }};
/* De boeking claimen zoals Postgres het doet: alleen als de rij nog in de verwachte stand staat. */
function _bestellingen(){
  const api={_upd:null, _f:{},
    select(){ if(api._upd){
        if(window.__voorClaim) window.__voorClaim(api._f.id);   /* een ander apparaat kan net eerder zijn */
        const r=window.__rijen.find(x=>x.id===api._f.id);
        const verwacht = api._f.extras_boeking===undefined ? null : api._f.extras_boeking;
        if(!r || (r.extras_boeking==null?null:r.extras_boeking)!==verwacht) return Promise.resolve({data:[], error:null});
        r.extras_boeking=api._upd.extras_boeking;
        return Promise.resolve({data:[{id:r.id}], error:null});
      } return api; },
    or(){return api;}, order(){return api;}, limit(){return api;},
    eq(k,v){ api._f[k]=v; return api; }, is(k,v){ api._f[k]=v; return api; },
    update(r){ api._upd=r; return api; },
    then(res){ res({data: JSON.parse(JSON.stringify(window.__rijen)), error:null}); }};
  return api;
}
function _extras(){
  const api={_upd:null,_id:null, select(){return api;}, order(){return api;},
    update(r){ api._upd=r; return api; }, eq(k,v){ api._id=v; return api; },
    then(res){ if(api._upd){ window.__extrasUpd.push([api._id, api._upd]); res({error:null}); }
               else res({data: JSON.parse(JSON.stringify(window.__extras)), error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{access_token:'t', user:{id:'u1'}}}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getUser:async()=>({data:{user:null}})},
  from:(n)=> n==='webshop_bestellingen' ? _bestellingen() : n==='webshop_extras' ? _extras() : _leeg,
  rpc:async()=>({data:[]}),
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}),
  removeChannel(){}
})};
window.fetch=async(url, opt)=>{
  let lijf=null; try{ lijf=JSON.parse(opt&&opt.body||'null'); }catch(e){}
  window.__fetch.push({url:String(url), lijf});
  return {ok:true, json:async()=>({ok:true, uitslag:[]})};
};
<\/script>`;

let html=fs.readFileSync(bron('app/index.html'),'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
  .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');

const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[]; w.onerror=(m)=>fouten.push(String(m));
const d=()=>w.document;
const vr=bc=>w.eval(`(state.producten.find(p=>p.barcode==='${bc}')||{}).voorraad`);
const extrasCalls=()=>w.__fetch.filter(f=>f.lijf && f.lijf.actie==='extras');

setTimeout(async()=>{
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  w.eval(`account={id:'u1', team_id:'t1', rol:'eigenaar'}; state.producten=${JSON.stringify(PRODUCTEN)}; state.log=[];`);

  // ── 1. hoeveel er te koop is ──
  await w.eval('wsExtrasLaad()');
  ok('extras geladen', w.eval('wsExtras.length')===5);
  const kaart=w.eval('wsxVoorraad()');
  ok('voorraad per barcode uit je producten', kaart.STEK===3 && kaart.GLAS13===1 && kaart.HOES13===2);
  ok('onbekende barcode telt als nul', kaart.HOES11===0);
  ok('beschermset: van elk deel minstens één', w.eval("wsxAantal(wsExtras[1].varianten[0], wsxVoorraad())")===2);
  ok('beschermset zonder glas is er niet', w.eval("wsxAantal(wsExtras[1].varianten[1], wsxVoorraad())")===0);
  ok('glas telt beide alternatieven op', w.eval("wsxAantal(wsExtras[2].varianten[0], wsxVoorraad())")===3);
  ok('een dienst heeft geen voorraad', w.eval("wsxAantal(wsExtras[3].varianten[0], wsxVoorraad())")===null);

  // ── 2. winkelverkoop gaat ook online van de voorraad af ──
  w.eval("_wsxStand=null; wsExtrasNaOpslaan();");   // eerste stand onthouden, nog niets sturen
  ok('de eerste opslag stuurt niets', extrasCalls().length===0);
  w.eval("haalUitVoorraad(state.producten.find(p=>p.barcode==='HOES13'),1); save();");
  w.eval("save();");                                   // nog een keer opslaan: één bericht
  await wacht(2300);
  const c=extrasCalls();
  ok('na een verkoop gaat er één bericht naar de webshop', c.length===1);
  ok('met de nieuwe stand', c[0] && c[0].lijf.voorraad.HOES13===1);
  ok('alleen de extra\'s met dat product', c[0] && c[0].lijf.sleutels.includes('beschermset') && !c[0].lijf.sleutels.includes('stekker'));
  w.eval("save();"); await wacht(2300);
  ok('zonder verandering geen nieuw bericht', extrasCalls().length===1);

  // ── 3. webshopverkoop gaat hier van de voorraad af, één keer ──
  const voor={g:vr('GLAS13'), gx:vr('GLAS13X'), h:vr('HOES13')};
  const n1=await w.eval('wsExtrasBoeken()');
  ok('één bestelling afgeboekt (geannuleerd zonder boeking en de dienst niet)', n1===1);
  ok('glas uit het eerste alternatief met voorraad', vr('GLAS13')===voor.g-1 && vr('GLAS13X')===voor.gx);
  ok('hoesje eraf', vr('HOES13')===voor.h-1);
  ok('de boeking staat in de tabel', w.__rijen.find(r=>r.id==='b1').extras_boeking==='af');
  ok('geannuleerde bestelling blijft ongemoeid', w.__rijen.find(r=>r.id==='b2').extras_boeking===null);
  ok('in het logboek met het bestelnummer', w.eval("state.log.some(l=>/#2001/.test(l.bron||''))"));
  const n2=await w.eval('wsExtrasBoeken()');
  ok('tweede keer boekt niets dubbel', n2===0 && vr('HOES13')===voor.h-1);

  // Een tweede apparaat was eerst: de claim faalt, dus hier geen afboeking.
  w.__rijen.push({id:'b4', nummer:'#2004', geannuleerd:false, extras_boeking:null,
    extras:[{sleutel:'stekker', label:'Standaard', aantal:1, delen:[['STEK']]}]});
  const stekVoor=vr('STEK');
  w.__voorClaim=id=>{ if(id==='b4') w.__rijen.find(r=>r.id==='b4').extras_boeking='af'; };
  const n3=await w.eval('wsExtrasBoeken()');
  ok('een ander apparaat was eerst: hier niet nog eens afboeken', n3===0 && vr('STEK')===stekVoor);
  w.__voorClaim=null;

  // ── 4. geannuleerd na afboeken: terug op voorraad ──
  w.__rijen.find(r=>r.id==='b1').geannuleerd=true;
  const hVoor=vr('HOES13'), gVoor=vr('GLAS13');
  const n4=await w.eval('wsExtrasBoeken()');
  ok('annulering boekt terug', n4===1 && vr('HOES13')===hVoor+1 && vr('GLAS13')===gVoor+1);
  ok('en staat op terug', w.__rijen.find(r=>r.id==='b1').extras_boeking==='terug');

  // ── 5. het kaartje in Instellingen ──
  await w.eval('wsExtrasRender()');
  const vak=d().getElementById('extrasVak').innerHTML;
  ok('kaartje toont de extra\'s', /Beschermset: glas en hoesje/.test(vak) && /Klaar voor gebruik/.test(vak));
  ok('zegt welk model nog ontbreekt', /Nog niet op voorraad: iPhone 11/.test(vak));
  ok('dienst met prijs per soort toestel', !!d().getElementById('wsxp_klaar_1') && d().getElementById('wsxp_klaar_1').value==='29');
  ok('alleen bij ophalen staat erbij', /Alleen bij ophalen in de winkel/.test(vak));
  const voorFetch=extrasCalls().length;
  await w.eval("wsxPrijs('glas', '11.95', null)");
  const upd=w.__extrasUpd.pop();
  ok('prijs naar de tabel', !!upd && upd[0]==='x3' && upd[1].prijs===11.95);
  ok('en meteen naar de webshop', extrasCalls().length===voorFetch+1 && extrasCalls().pop().lijf.sleutels[0]==='glas');
  await w.eval("wsxPrijs('klaar', '25', 1)");
  const upd2=w.__extrasUpd.pop();
  ok('prijs van één uitvoering', !!upd2 && upd2[1].varianten[1].prijs===25 && upd2[1].varianten[0].prijs===19);
  await w.eval("wsxActief('stekker', false)");
  const upd3=w.__extrasUpd.pop();
  ok('uitzetten', !!upd3 && upd3[1].actief===false);

  // ── 6. klaar voor gebruik valt op bij de bestelling ──
  const blok=w.eval("bstKlaarBlok({extras:[{sleutel:'klaar', label:'Telefoon'}]})");
  ok('klaar voor gebruik staat bij de bestelling', /Klaar voor gebruik \(Telefoon\)/.test(blok) && /gegevens overzetten/.test(blok));
  ok('zonder die dienst geen blok', w.eval("bstKlaarBlok({extras:[{sleutel:'glas', soort:'artikel'}]})")==='');
  const code=w.eval("bstKlaarBlok({extras:[{sleutel:'office', soort:'dienst', naam:'Office Home 2024'}]})");
  ok('Office: de code sturen staat bij de bestelling', /Code sturen/.test(code) && /Office Home 2024/.test(code));
  ok('een originele accu valt op bij de bestelling', /Originele accu erin/.test(w.eval("bstAccuBlok({toestellen:[{naam:'iPhone 12', nieuwe_accu:true, accu_origineel:true}], regels:[]})")));
  ok('een OEM-accu blijft gewoon nieuwe accu', /Nieuwe accu erin/.test(w.eval("bstAccuBlok({toestellen:[{naam:'iPhone 12', nieuwe_accu:true}], regels:[]})")));

  // ── de accu met drie prijzen in hetzelfde kaartje ──
  await w.eval('wsExtrasRender()');
  ok('accu met drie prijzen in het kaartje', d().getElementById('wsxp_accu-telefoon_2') && d().getElementById('wsxp_accu-telefoon_2').value==='95');

  ok('geen fouten onderweg', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));
  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
},450);
