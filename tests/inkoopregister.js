// Het inkoopregister: inkoop bij een particulier, het DOR en de bewaartermijn.
//
// Eén scherm vult het register (wat het DOR van de politie vraagt) en de inkoopverklaring
// voor de margeregeling. Zie INKOOP-DOR-STAPPENPLAN.md. Deze test kijkt of de verplichte
// velden er zijn en worden nagekeken, of elk toestel zijn eigen serienummer krijgt, of de
// vijf werkdagen bewaring kloppen (ook rond feestdagen) en of de werkbank dan waarschuwt.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const MOCK=`<script>
window.__db={
  refurbish_apparaten:[
    {id:'a1', team_id:'t1', code:'A0007', merk:'HP', model:'EliteBook 830 G8', categorie:'Laptop',
     status:'te_controleren', checklist:[], defecten:[], gelabeld:true, aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_onderdelen:[], refurbish_checklists:[], refurbish_orders:[], refurbish_batches:[],
  hardware_locaties:[{id:'l1', team_id:'t1', naam:'Magazijn', soort:'magazijn', volgorde:0}],
  hardware_modellen:[{id:'m1', merk:'Apple', model:'iPhone 12', categorie:'Telefoon', specs:{}, keer_gebruikt:2}]
};
window.__geschreven=[]; window.__rpcs=[];
function __tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},maybeSingle:async()=>({data:(window.__db[naam]||[])[0]||null}),
    insert(r){ window.__geschreven.push([naam,'insert',r]);
      return {select:async()=>({data:(Array.isArray(r)?r:[r]).map((x,i)=>Object.assign({id:'n'+i},
        naam==='inkoop_registraties'?{id:'reg1', volgnummer:7}:{}, x)), error:null})}; },
    update(r){ window.__geschreven.push([naam,'update',r]); return api; },
    delete(){ return api; },
    then(res){ res({data:window.__db[naam]||[], error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
  storage:{from:()=>({upload:async(pad)=>{ window.__geschreven.push(['opslag','upload',pad]); return {error:null}; }})},
  from:(n)=> n==='accounts'
    ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'Lucas'}})}
    : __tabel(n),
  rpc:async(naam,arg)=>{ window.__rpcs.push([naam,arg]);
    return naam==='abonnement_status'
      ? {data:[{plan:'Enterprise',status:'proef',geblokkeerd:false,modules:['refurbish']}]}
      : {data:null}; }
})};
<\/script>`;

const ruw=fs.readFileSync(bron('refurbish/index.html'),'utf8');
const html=ruw.replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK);
const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/refurbish/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[];
w.onerror=(m)=>fouten.push(String(m));

const zet=(id,waarde)=>{ const e=w.document.getElementById(id); if(e) e.value=waarde; return !!e; };
const knop=tekst=>[...w.document.querySelectorAll('#vensterKnoppen .btn')].find(b=>b.textContent===tekst);
const klik=tekst=>{ const b=knop(tekst); if(b) b.click(); return !!b; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

setTimeout(async()=>{
  const d=w.document;
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  // jsdom tekent geen canvas en kent geen fetch: de verklaring-afbeelding nabootsen.
  w.eval(`verklaringPng=async(b,d)=>{ window.__verklaring=d; return 'data:image/png;base64,AAAA'; };`);
  w.fetch=async()=>({blob:async()=>new w.Blob(['x'])});

  console.log('\n── de vijf werkdagen bewaring');
  ok('maandag gekocht: t/m maandag erna', w.eval("isoDag(werkdagenNa(new Date(2026,10,2),5))")==='2026-11-09');
  ok('vrijdag gekocht: t/m vrijdag erna', w.eval("isoDag(werkdagenNa(new Date(2026,10,6),5))")==='2026-11-13');
  // 24 dec 2026 is een donderdag; 25 en 26 dec tellen niet, net als het weekend.
  ok('kerst telt niet mee', w.eval("isoDag(werkdagenNa(new Date(2026,11,24),5))")==='2027-01-04');
  // Paasmaandag 2027 valt op 29 maart.
  ok('paasmaandag telt niet mee', w.eval("isoDag(werkdagenNa(new Date(2027,2,26),1))")==='2027-03-30');
  // In 2025 viel 27 april op zondag: Koningsdag was toen zaterdag de 26e.
  ok('koningsdag op zondag schuift naar zaterdag', w.eval("feestdagen(2025).has('2025-04-26') && !feestdagen(2025).has('2025-04-27')"));
  ok('koningsdag gewoon op 27 april', w.eval("feestdagen(2027).has('2027-04-27')"));
  ok('in bewaring tot en met de laatste dag', w.eval("inBewaring({bewaar_tot:isoDag(new Date())})"));
  ok('daarna niet meer', !w.eval("inBewaring({bewaar_tot:'2020-01-01'})"));

  console.log('\n── het scherm');
  ok('leeftijd klopt', w.eval("leeftijdOp('2000-11-04', new Date(2026,10,3))")===25);
  w.eval("showTab('toevoegen')");
  zet('t_model','Apple iPhone 12'); w.eval("modelTyp(); soortNu='Telefoon';");
  zet('t_aantal','2'); zet('t_inkoop','150');
  w.eval('bewijsVerklaringOpen()');
  ok('venster heet inkoop bij een particulier', /Inkoop bij een particulier/.test(d.getElementById('venster').innerHTML));
  ok('per toestel een veld voor het nummer', !!d.getElementById('vkl_nr_0') && !!d.getElementById('vkl_nr_1'));
  ok('een telefoon vraagt om het IMEI', /IMEI/.test(d.getElementById('vkl_nr_0').placeholder));
  ok('totaalbedrag is prijs maal aantal', d.getElementById('vkl_bedrag').value==='300');
  ok('geen veld voor een kopie of BSN', !/BSN|kopie uploaden|type="file"/.test(d.getElementById('venster').innerHTML));
  ok('legitimatie als knoppen, niet als keuzelijst', d.querySelectorAll('.vklkeuze[data-groep="id_soort"] button').length===4);

  // Te jong: harde stop.
  zet('vkl_voornamen','Jan'); zet('vkl_achternaam','Jansen');
  zet('vkl_geboorte', (new Date().getFullYear()-16)+'-01-01');
  zet('vkl_postcode','5121ja'); zet('vkl_huisnr','1'); zet('vkl_straat','Hoofdstraat'); zet('vkl_plaats','Rijen');
  klik('Klaar');
  ok('onder de 18 gaat niet door', !w.eval('nieuwBewijs'));
  zet('vkl_geboorte','1990-05-17');
  klik('Klaar');
  ok('zonder legitimatie gaat niet door', !w.eval('nieuwBewijs'));
  w.eval("vklKies('id_soort','id-kaart')");
  zet('vkl_idnr','ab12 cd34');
  zet('vkl_nr_0','35 123456 789012 3'); zet('vkl_nr_1','351234567890124');
  w.eval("vklKies('betaalwijze','pin')");
  klik('Klaar');
  const nb=w.eval('nieuwBewijs');
  ok('met alles ingevuld klaar', !!nb && nb.soort==='verklaring');
  ok('naam samengesteld', !!nb && nb.naam==='Jan Jansen');
  ok('postcode netjes', !!nb && nb.dor.postcode==='5121 JA');
  ok('documentnummer zonder spaties', !!nb && nb.dor.id_nummer==='AB12CD34');
  ok('nummers per toestel', !!nb && nb.nummers[0]==='351234567890123' && nb.nummers[1]==='351234567890124');
  ok('betaalwijze mee', !!nb && nb.dor.betaalwijze==='pin');

  console.log('\n── opslaan bij toevoegen');
  w.__geschreven.length=0;
  await w.eval('toevoegen(document.createElement("button"))');
  await wacht(50);
  const gs=w.__geschreven;
  const reg=gs.find(g=>g[0]==='inkoop_registraties' && g[1]==='insert');
  ok('inkoop in het register', !!reg);
  if(reg){
    const r=reg[2];
    ok('verkoper zoals het DOR hem vraagt', r.voornamen==='Jan' && r.achternaam==='Jansen' && r.geboortedatum==='1990-05-17'
      && r.straat==='Hoofdstraat' && r.huisnummer==='1' && r.woonplaats==='Rijen' && r.id_soort==='id-kaart');
    ok('inkoper is wie er ingelogd is', r.inkoper==='Lucas');
    ok('twee goederen met elk hun eigen IMEI', r.goederen.length===2 && r.goederen[0].nummer==='351234567890123' && r.goederen[1].nummer==='351234567890124');
    ok('merk en type los, zoals in het DOR', r.goederen[0].merk==='Apple' && r.goederen[0].type==='iPhone 12');
    ok('bewaartermijn vastgelegd', /^\d{4}-\d{2}-\d{2}$/.test(r.bewaar_tot||''));
    ok('bedrag mee', r.bedrag===300);
  }
  const ups=gs.filter(g=>g[0]==='refurbish_apparaten' && g[1]==='update');
  ok('elk toestel gekoppeld aan het register', ups.filter(u=>u[2].inkoop_registratie_id==='reg1').length===2);
  ok('elk toestel zijn eigen serienummer', ups.some(u=>u[2].serienummer==='351234567890123') && ups.some(u=>u[2].serienummer==='351234567890124'));
  ok('verklaring krijgt het volgnummer', w.__verklaring && w.__verklaring.volgnummer===7);
  ok('verklaring noemt elk toestel met IMEI', w.__verklaring && w.__verklaring.goederenLijst.length===2 && /IMEI 351234567890123/.test(w.__verklaring.goederenLijst[0]));
  ok('verklaring zegt dat er geen btw is afgetrokken', /geen btw in aftrek te hebben gebracht/.test(ruw));
  ok('verklaring in het register gezet', gs.some(g=>g[0]==='inkoop_registraties' && g[1]==='update' && /inkoopverklaring-/.test(g[2].verklaring_url||'')));
  await wacht(500);
  ok('DOR-scherm gaat vanzelf open', /Overnemen in het DOR/.test((d.getElementById('venster')||{}).innerHTML||''));

  console.log('\n── het DOR-scherm');
  const regRij={id:'reg1', volgnummer:7, datum:new Date().toISOString(), inkoper:'Lucas', voornamen:'Jan', achternaam:'Jansen',
    geboortedatum:'1990-05-17', postcode:'5121 JA', huisnummer:'1', straat:'Hoofdstraat', woonplaats:'Rijen', land:'Nederland',
    id_soort:'id-kaart', id_nationaliteit:'Nederland', id_nummer:'AB12CD34',
    goederen:[{soort:'Telefoon', merk:'Apple', type:'iPhone 12', nummer:'351234567890123', prijs:150}]};
  w.__regRij=regRij;
  w.eval('dorVenster(window.__regRij)');
  const dv=d.getElementById('venster').innerHTML;
  ok('IMEI staat erin met kopieerknop', /Uniek nummer \(IMEI\)/.test(dv) && /data-kopie="351234567890123"/.test(dv));
  ok('legitimatie in DOR-woorden', /Identiteitskaart/.test(dv));
  ok('link naar het DOR opent veilig', /href="https:\/\/opkopersregister\.stopheling\.nl" target="_blank" rel="noopener"/.test(dv));
  w.__geschreven.length=0;
  klik('Staat in het DOR');
  await wacht(30);
  ok('aanvinken legt vast wanneer en door wie', w.__geschreven.some(g=>g[0]==='inkoop_registraties' && g[1]==='update' && g[2].dor_ingevoerd_op && g[2].dor_door==='Lucas'));

  console.log('\n── waarschuwen tijdens de bewaring');
  w.eval("sluit(); apparaten.find(a=>a.id==='a1').bewaar_tot=isoDag(werkdagenNa(new Date(),3)); ctr=null; appOpen('a1');");
  await wacht(20);
  ok('vraagt eerst of je toch wilt beginnen', /Nog in bewaring/.test((d.getElementById('venster')||{}).innerHTML||'') && w.eval('ctr')===null);
  klik('Toch beginnen');
  await wacht(20);
  ok('na "Toch beginnen" start de controle', !!w.eval('ctr') && w.eval('ctr.a.id')==='a1');
  w.eval("ctr=null; appOpen('a1');");
  await wacht(20);
  ok('één keer vragen per toestel', !!w.eval('ctr'));
  ok('in de lijst staat tot wanneer', /in bewaring t\/m/.test(w.eval("showTab('werkbank'); document.getElementById('tab-werkbank').innerHTML")));

  w.close();
  await winkelapp();
  console.log(fout ? fout+' FOUT' : 'inkoopregister in orde');
  process.exit(fout?1:0);
}, 400);

/* De Inkopen-pagina van de winkelapp: hier haalt de boekhouder de verklaringen op. */
async function winkelapp(){
  console.log('\n── Inkopen-pagina: inkoop bij particulieren');
  const RIJEN=[
    {id:'r1', volgnummer:1, datum:'2026-10-02T10:00:00Z', voornamen:'Jan', achternaam:'Jansen', straat:'Hoofdstraat', huisnummer:'1',
     postcode:'5121 JA', woonplaats:'Rijen', geboortedatum:'1990-05-17', id_soort:'id-kaart', id_nummer:'AB12CD34', id_nationaliteit:'Nederland',
     goederen:[{soort:'Telefoon', merk:'Apple', type:'iPhone 12', nummer:'351234567890123', prijs:150}], bedrag:150, betaalwijze:'contant',
     verklaring_url:'t1/apparaat/a1/inkoopverklaring-1.png', dor_ingevoerd_op:null},
    {id:'r2', volgnummer:2, datum:'2026-10-05T10:00:00Z', bedrijfsnaam:'Kantoor BV', achternaam:'Smit', straat:'Markt', huisnummer:'3',
     postcode:'5121 AB', woonplaats:'Rijen', goederen:[{batch_id:'b1', omschrijving:'12 toestellen (laptops)', aantal:12, prijs:1450}],
     bedrag:1450, betaalwijze:'bank', verklaring_url:null, dor_ingevoerd_op:'2026-10-05T12:00:00Z'}
  ].reverse();   // zoals de database ze geeft: nieuwste eerst
  const MOCKW=`<script>
window.__schrijf=[];
function _tab(naam){ const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},gte(){return api;},
  in(){return api;},maybeSingle:async()=>({data:null}),insert(){return {select:()=>({single:async()=>({data:{id:'x'}})})};},
  update(r){ window.__schrijf.push([naam,r]); return api; },delete(){return api;},
  then(r){ r({data: naam==='inkoop_registraties' ? ${JSON.stringify(RIJEN)} : [], error:null}); }}; return api; }
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user:null}})},
  from:(n)=>_tab(n), rpc:async()=>({data:[]}),
  channel:()=>({on(){return this;},subscribe(){return this;},send(){},unsubscribe(){}}), removeChannel(){}
})};
<\/script>`;
  const ruwW=fs.readFileSync(bron('app/index.html'),'utf8');
  const htmlW=ruwW.replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCKW)
    .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
  const domW=new JSDOM(htmlW,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
  const ww=domW.window, dw=ww.document;
  const foutenW=[]; ww.onerror=(m)=>foutenW.push(String(m));
  await wacht(400);
  ok('winkelapp start zonder fout', foutenW.length===0);
  ok('blok staat op de Inkopen-pagina', !!dw.querySelector('#tab-inkopen #particulierKaart'));

  ww.eval("inkopenPeriode='alles'; partLaden();");
  await wacht(50);
  const lijst=dw.getElementById('partLijst').innerHTML;
  ok('beide inkopen in de lijst', /Jan Jansen/.test(lijst) && /Kantoor BV/.test(lijst));
  ok('totaal van de periode', /1\.600,00/.test(lijst));
  ok('verklaring te downloaden waar die er is', /partPdf\('r1'/.test(lijst) && !/partPdf\('r2'/.test(lijst));
  ok('DOR: overnemen of staat erin', /partDor\('r1'\)/.test(lijst) && /staat erin/.test(lijst));

  // De lijst voor de boekhouder.
  let blob=null;
  ww.URL.createObjectURL=b=>{ blob=b; return 'blob:x'; };
  ww.URL.revokeObjectURL=()=>{};
  ww.eval('partCsv()');
  const csv=blob ? await new Promise(r=>{ const fr=new ww.FileReader(); fr.onload=()=>r(fr.result); fr.readAsText(blob); }) : '';
  ok('lijst met kop en twee regels', csv.split('\r\n').length===3 && /^﻿?Nr;Datum;Verkoper/.test(csv));
  ok('oudste eerst', csv.indexOf('Jan Jansen')<csv.indexOf('Kantoor BV'));
  ok('met serienummer en bedrag', /351234567890123/.test(csv) && /150,00/.test(csv));
  ok('zonder geboortedatum of legitimatie', !/1990|AB12CD34|id-kaart/.test(csv));

  // Overnemen in het DOR vanaf de Inkopen-pagina.
  ww.eval("partDor('r1')");
  const ov=dw.getElementById('partDorOverlay');
  ok('DOR-scherm opent', !!ov);
  ok('met IMEI en legitimatie om te kopiëren', !!ov && /data-kopie="351234567890123"/.test(ov.innerHTML) && /data-kopie="AB12CD34"/.test(ov.innerHTML));
  ww.__schrijf.length=0;
  ov.querySelector('#partDorKlaar').click();
  await wacht(30);
  ok('aanvinken schrijft naar het register', ww.__schrijf.some(x=>x[0]==='inkoop_registraties' && x[1].dor_ingevoerd_op));
  ok('daarna staat hij erin', /staat erin/.test(dw.getElementById('partLijst').innerHTML) && !/partDor\('r1'\)/.test(dw.getElementById('partLijst').innerHTML));
  ww.close();
}
