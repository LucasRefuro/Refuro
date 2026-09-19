// Het klantportaal: wat een klant van de winkel ziet.
//
// Laadt klantportaal/index.html in jsdom met een nagebootste Supabase-client. Net als
// in de andere tests vervangen we de CDN-<script src> door een inline nabootsing,
// zodat de let-variabelen van de pagina via w.eval() bereikbaar blijven.
const fs=require('fs');
const path=require('path');
const {JSDOM}=require('jsdom');
let fout=0;
const ok=(n,c,uitleg)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c){ fout++; if(uitleg!==undefined) console.log('     '+uitleg); } };
const BRON=fs.readFileSync(path.join(__dirname,'..','klantportaal','index.html'),'utf8');
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

const OVERZICHT={
  organisatie_id:'org1', bedrijf:'Zorggroep <b>Test</b>', naam:'Sanne', rol:'beheerder',
  huisstijl:{merknaam:'Reloop it', kleur:'#0F6B4B', accent:'#C6F36B', inkt:'#10231B', wismethode:'Blancco, NIST 800-88 Purge'},
  accountmanager:{naam:'Lucas', telefoon:'+31 6 00 00 00 00', email:'info@reloopit.nl'},
  opdrachten:[
    { id:'b1', nummer:'B0010', titel:'Uitfasering <img src=x onerror="window.GEHACKT=1">', locatie:'Breda',
      tijdlijn:{aangemeld:'2026-08-28', opgehaald:'2026-09-03', gewist:'2026-09-08', getest:'2026-09-12'},
      aantallen:{totaal:3, gewist:3, hergebruik:2, recycling:1, vernietigd:0},
      categorieen:[{naam:'Laptop',aantal:2},{naam:'Desktop',aantal:1}],
      bod:{indicatief:14800, definitief:15250}, impact:{co2_kg:400, ewaste_kg:4},
      documenten:[
        {type:'ophaalbon', naam:'Ophaalbon', formaat:'PDF', datum:'2026-09-03', beschikbaar:true},
        {type:'wiscertificaat', naam:'Wiscertificaten, 3 apparaten', formaat:'PDF', datum:'2026-09-08', beschikbaar:true},
        {type:'verwerkingsrapport', naam:'Verwerkingsrapport', formaat:'PDF', datum:'2026-09-12', beschikbaar:true},
        {type:'apparatenlijst', naam:'Apparatenlijst', formaat:'CSV', beschikbaar:true},
        {type:'impactrapport', naam:'Impactrapport', formaat:'PDF', beschikbaar:false, verwacht:'na afronding'}]},
    { id:'b2', nummer:'B0011', titel:'Tilburg', tijdlijn:{aangemeld:'2026-09-15'}, gepland:'Ophaling 24 september',
      aantallen:{totaal:1, gewist:0}, categorieen:[{naam:'Laptop',aantal:1}], bod:{indicatief:4100},
      documenten:[{type:'ophaalbon', naam:'Ophaalbon', formaat:'PDF', beschikbaar:false, verwacht:'na ophaling'}]}
  ]
};
const DETAIL={ b1:Object.assign({}, OVERZICHT.opdrachten[0], { apparaten:[
  {sn:'SN1', model:'Dell Latitude 5420', categorie:'Laptop', wis:'gewist', wis_methode:'Blancco', grade:'A', bestemming:'hergebruik'},
  {sn:'SN2', model:'Dell Latitude 5420', categorie:'Laptop', wis:'gewist', grade:'B', bestemming:'hergebruik'},
  {sn:'SN3', model:'HP EliteDesk', categorie:'Desktop', wis:'vernietigd', grade:'C', bestemming:'recycling'}]}),
  b2:Object.assign({}, OVERZICHT.opdrachten[1], { apparaten:[] }) };

function nabootsing(opties){
  return `<script>
window.__rpc=[]; window.__fetch=[];
const __opties=${JSON.stringify(opties)};
window.supabase={createClient:(url,key,cfg)=>{ window.__cfg=cfg||null; return {
  auth:{ getSession:async()=>({data:{session:__opties.sessie?{access_token:'tok',user:{id:'u1'}}:null}}),
         onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
         signOut:async()=>{ window.__uitgelogd=true; return {}; } },
  rpc:async(naam,args)=>{ window.__rpc.push([naam,args]);
    if(naam==='klantportaal_huisstijl') return {data:{merknaam:'Reloop it', kleur:'#0F6B4B', contact_email:'info@reloopit.nl'}};
    if(naam==='klantportaal_overzicht') return {data:__opties.overzicht};
    if(naam==='klantportaal_opdracht') return {data:(__opties.detail||{})[args.p_id]||null};
    if(naam==='klantportaal_collegas') return {data:[{user_id:'u1',naam:'Sanne',email:'s@x.nl',rol:'beheerder',ik:true},{user_id:'u2',naam:'Piet',email:'p@x.nl',rol:'lezer',ik:false}]};
    if(naam==='klantportaal_aanmelden') return {data:'a1'};
    if(naam==='klantportaal_collega_uit') return {data:true};
    return {data:null}; }
};}};
window.fetch=async(url,opt)=>{ window.__fetch.push([url, JSON.parse(opt.body)]); return {ok:true, json:async()=>({ok:true})}; };
<\/script>`;
}
async function open(opties, zoek){
  const html=BRON.replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, nabootsing(opties));
  const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://portaal.reloopit.nl/'+(zoek||''), pretendToBeVisual:true});
  const w=dom.window, fouten=[];
  w.onerror=(m)=>fouten.push(String(m));
  w.print=()=>{ w.__geprint=(w.__geprint||0)+1; };
  w.confirm=()=>true;
  w.scrollTo=()=>{};
  w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{};
  await wacht(60);
  return {dom, w, d:w.document, fouten};
}
const zichtbaar=(el)=>el && !el.hidden;

(async()=>{
  console.log('\n── zonder login');
  {
    const {w,d,fouten}=await open({sessie:false});
    ok('start zonder fouten', !fouten.length, fouten.join(' | '));
    ok('inlogscherm staat er', zichtbaar(d.getElementById('inlog')) && !zichtbaar(d.getElementById('app')));
    ok('eigen opslag voor de sessie (niet die van de winkelapp)', w.__cfg && w.__cfg.auth && w.__cfg.auth.storageKey==='storvo-klantportaal');
    ok('huisstijl opgezocht op domein', w.__rpc.some(([n,a])=>n==='klantportaal_huisstijl' && a.p_domein==='portaal.reloopit.nl'));
    d.getElementById('inlogMail').value='fout';
    await w.eval('inlogLinkVragen()');
    ok('ongeldig adres: geen verzoek', w.__fetch.length===0);
    d.getElementById('inlogMail').value='sanne@zorggroep.nl';
    await w.eval('inlogLinkVragen()'); await wacht(10);
    const v=w.__fetch[0]||[];
    ok('inloglink aangevraagd via de functie', /functions\/v1\/klantportaal$/.test(v[0]||'') && v[1].actie==='inloglink' && v[1].email==='sanne@zorggroep.nl' && v[1].domein==='portaal.reloopit.nl', JSON.stringify(v));
    ok('daarna: check je mail', /Check je mail/.test(d.getElementById('inlogKaart').textContent));
  }

  console.log('\n── ingelogd, geen toegang');
  {
    const {d}=await open({sessie:true, overzicht:null});
    ok('geen toegang getoond', /Geen toegang/.test(d.getElementById('inlogKaart').textContent));
  }

  console.log('\n── ingelogd als beheerder');
  const {w,d,fouten}=await open({sessie:true, overzicht:OVERZICHT, detail:DETAIL});
  await wacht(40);
  ok('start zonder fouten', !fouten.length, fouten.join(' | '));
  ok('app staat er, inlog weg', zichtbaar(d.getElementById('app')) && !zichtbaar(d.getElementById('inlog')));
  ok('bezoek bijgehouden', w.__rpc.some(([n])=>n==='klantportaal_gezien'));
  ok('naam van de organisatie ge-escaped', d.getElementById('wieNaam').innerHTML.includes('&lt;b&gt;Test'));
  ok('titel met html wordt niet uitgevoerd', !w.GEHACKT && !d.querySelector('img[src="x"]'));
  ok('twee opdrachten in de lijst', d.querySelectorAll('.opdracht').length===2);
  ok('eerste opdracht gekozen', d.querySelector('.opdracht.aan') && /B0010/.test(d.querySelector('.opdracht.aan').textContent));
  ok('vier kerncijfers', d.querySelectorAll('.kpis li').length===4);
  ok('hergebruik 67%', /67%/.test(d.querySelector('.kpis').textContent));
  ok('opbrengst: definitief bod plus indicatief bod van de lopende partij', /19\.350/.test(d.querySelector('.kpis').textContent));
  ok('vier stappen klaar, de laatste volgt', d.querySelectorAll('.stap.klaar').length===4 && d.querySelectorAll('.stap.volgende').length===1);
  ok('status: rapport en betaling', /Rapport en betaling/.test(d.querySelector('.detail-kop').textContent));
  ok('impactrapport nog niet klaar', d.querySelectorAll('.docs li.wacht').length===1);
  await wacht(30);
  ok('apparaten geladen', d.querySelectorAll('#apparaatRijen tr').length===3);
  w.eval("zoekApparaat('hp')");
  ok('zoeken op model', d.querySelectorAll('#apparaatRijen tr').length===1 && /SN3/.test(d.getElementById('apparaatRijen').textContent));
  w.eval("zoekApparaat('')");

  console.log('\n── documenten');
  await w.eval("documentOpenen('b1','wiscertificaat')"); await wacht(80);
  const blad=d.getElementById('printvak').textContent;
  ok('wiscertificaat afgedrukt', w.__geprint===1);
  ok('wiscertificaat noemt alle drie de serienummers', /SN1/.test(blad) && /SN2/.test(blad) && /SN3/.test(blad));
  ok('wiscertificaat noemt de methode', /NIST 800-88/.test(blad));
  ok('vernietigd apart vermeld', /Fysieke vernietiging/.test(blad));
  await w.eval("documentOpenen('b1','verwerkingsrapport')"); await wacht(80);
  ok('verwerkingsrapport met bestemming', /Recycling/.test(d.getElementById('printvak').textContent) && w.__geprint===2);
  await w.eval("documentOpenen('b1','impactrapport')"); await wacht(80);
  ok('impactrapport met CO2', /400 kg/.test(d.getElementById('printvak').textContent));
  let gedownload=null;
  const oudKlik=w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click=function(){ gedownload=this.download; };
  await w.eval("documentOpenen('b1','apparatenlijst')");
  w.HTMLAnchorElement.prototype.click=oudKlik;
  ok('apparatenlijst als csv', gedownload==='apparaten-B0010.csv', gedownload);

  console.log('\n── andere opdracht');
  await w.eval("kiesOpdracht('b2')"); await wacht(40);
  ok('tweede opdracht gekozen', /Tilburg/.test(d.querySelector('.detail-kop').textContent));
  ok('geplande ophaling bij de volgende stap', /24 september/.test(d.querySelector('.stap.volgende').textContent));
  ok('zonder test geen verwerking maar een aangemeld-paneel', /Aangemeld/.test(d.querySelector('.panelen').textContent));
  ok('lege apparatenlijst legt uit waarom', /Zodra je partij is opgehaald/.test(d.getElementById('apparatenVak').textContent));

  console.log('\n── collega\'s');
  w.eval("naarTab('collegas')"); await wacht(30);
  ok('twee collega\'s', d.querySelectorAll('.persoon').length===2);
  ok('beheerder kan uitnodigen', !!d.getElementById('uitnodigKnop'));
  ok('jezelf kun je niet weghalen, de ander wel', d.querySelectorAll('.persoon button').length===1);
  d.getElementById('nieuwNaam').value='Piet'; d.getElementById('nieuwMail').value='piet@zorggroep.nl';
  w.eval("kiesRol(document.querySelector('.keuze[data-rol=beheerder]'))");
  await w.eval('collegaUitnodigen()'); await wacht(20);
  const u=w.__fetch.find(x=>x[1].actie==='uitnodigen')||[];
  ok('uitnodiging met rol en sessie', u[1] && u[1].email==='piet@zorggroep.nl' && u[1].rol==='beheerder', JSON.stringify(u));
  await w.eval("collegaUit('u2')");
  ok('toegang weghalen roept de functie aan', w.__rpc.some(([n,a])=>n==='klantportaal_collega_uit' && a.p_user==='u2'));

  console.log('\n── partij aanmelden');
  w.eval("naarTab('aanmelden')");
  await w.eval('aanmelden()');
  ok('lege aanmelding: niets verstuurd', !w.__rpc.some(([n])=>n==='klantportaal_aanmelden'));
  d.getElementById('amWat').value='120 laptops'; d.getElementById('amAantal').value='120';
  d.getElementById('amAdres').value='Breda'; d.getElementById('amPeriode').value='oktober';
  await w.eval('aanmelden()');
  const am=(w.__rpc.find(([n])=>n==='klantportaal_aanmelden')||[])[1]||{};
  ok('aanmelding met alle velden', am.p_omschrijving==='120 laptops' && am.p_aantal===120 && am.p_ophaaladres==='Breda', JSON.stringify(am));
  ok('bevestiging getoond', /Ontvangen/.test(d.getElementById('vak').textContent));

  console.log('\n── uitloggen');
  await w.eval('uitloggen()');
  ok('uitgelogd en terug op inloggen', w.__uitgelogd && zichtbaar(d.getElementById('inlog')));

  console.log('\n── als lezer');
  {
    const {w,d}=await open({sessie:true, overzicht:Object.assign({}, OVERZICHT, {rol:'lezer'}), detail:DETAIL});
    w.eval("naarTab('collegas')"); await wacht(30);
    ok('lezer ziet geen uitnodigformulier', !d.getElementById('uitnodigKnop'));
    ok('lezer kan niemand weghalen', d.querySelectorAll('.persoon button').length===0);
  }

  console.log('\n── meekijken vanuit de winkel');
  {
    const {w,d}=await open({sessie:true, overzicht:Object.assign({}, OVERZICHT, {rol:'winkel', naam:null}), detail:DETAIL}, '?bekijk=org1');
    await wacht(30);
    ok('gewone storvo-sessie (geen eigen opslag)', w.__cfg && !w.__cfg.auth);
    ok('overzicht voor die organisatie', w.__rpc.some(([n,a])=>n==='klantportaal_overzicht' && a.p_organisatie==='org1'));
    ok('balk: je kijkt mee', zichtbaar(d.getElementById('bekijkBalk')));
    ok('alleen het overzicht, geen collega\'s of aanmelden', [...d.querySelectorAll('.tab')].filter(t=>!t.hidden).length===1);
    ok('geen bezoek bijgehouden', !w.__rpc.some(([n])=>n==='klantportaal_gezien'));
    ok('detail ook voor die organisatie', w.__rpc.some(([n,a])=>n==='klantportaal_opdracht' && a.p_organisatie==='org1'));
  }

  console.log(fout? '\n'+fout+' PUNTEN' : '\nalles netjes');
  process.exit(fout?1:0);
})();
