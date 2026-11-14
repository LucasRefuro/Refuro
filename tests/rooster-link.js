// Het rooster delen via een link in de WhatsApp-groep.
//
// Bewaakt drie dingen:
//   1. de weekrekening van de edge-functie (rooster-link/week.ts): over welke week gaat de
//      link, en wat mag er van een inzending door
//   2. de pagina die je team opent (/rooster/<token>): naam aantikken, per dag kan of kan
//      niet, doorgeven, en het rooster bekijken
//   3. de winkelapp: de links kopiëren of naar WhatsApp sturen, en een week delen
const {JSDOM}=require('jsdom');
const fs=require('fs');
const os=require('os');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));

const TOKEN='0123456789abcdef0123456789abcdef';

(async()=>{
  // ── 1. de weekrekening ──
  const tmp=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'storvo-')),'week.mts');
  fs.writeFileSync(tmp, fs.readFileSync(bron('supabase/functions/rooster-link/week.ts'),'utf8'));
  const wk=await import('file://'+tmp);

  /* De server draait in UTC. Zaterdagavond 23:30 UTC is in Nederland al zondag. */
  ok('vandaag in Nederland, niet in UTC', wk.vandaagNL(new Date('2026-11-14T23:30:00Z'))==='2026-11-15');
  ok('maandag van een zaterdag', wk.maandagVan('2026-11-14')==='2026-11-09');
  ok('maandag van een maandag is hijzelf', wk.maandagVan('2026-11-16')==='2026-11-16');
  ok('op zaterdag gaat de link over de week erna', wk.komendeMaandag('2026-11-14')==='2026-11-16');
  ok('op zondag ook', wk.komendeMaandag('2026-11-15')==='2026-11-16');
  ok('op maandag over de week daarna', wk.komendeMaandag('2026-11-16')==='2026-11-23');
  ok('over de jaargrens', wk.komendeMaandag('2026-12-31')==='2027-01-04');
  const dagen=wk.weekDagen('2026-11-16');
  ok('een week is maandag tot en met zondag', dagen.length===7 && dagen[0]==='2026-11-16' && dagen[6]==='2026-11-22');

  const schoon=wk.schoneDagen([
    {datum:'2026-11-16', beschikbaar:true, van:'10:00', tot:'14:30'},
    {datum:'2026-11-16', beschikbaar:false},                       // dubbel: de eerste telt
    {datum:'2026-11-17', beschikbaar:'ja'},                        // geen echte ja
    {datum:'2026-11-18', beschikbaar:true, van:'25:00', tot:'9:00'},// kapotte tijden
    {datum:'2026-11-19', beschikbaar:false, van:'10:00', tot:'12:00'},
    {datum:'2026-11-30', beschikbaar:true},                        // andere week
    null, 'onzin'
  ], '2026-11-16');
  ok('alleen dagen uit deze week, elke dag één keer', schoon.map(x=>x.datum).join(',')==='2026-11-16,2026-11-17,2026-11-18,2026-11-19');
  ok('tijden die kloppen blijven staan', schoon[0].beschikbaar===true && schoon[0].van==='10:00' && schoon[0].tot==='14:30');
  ok('alleen true telt als kan', schoon[1].beschikbaar===false);
  ok('kapotte tijden worden de hele dag', schoon[2].beschikbaar===true && schoon[2].van===null && schoon[2].tot===null);
  ok('kan niet heeft geen tijden', schoon[3].van===null && schoon[3].tot===null);
  ok('geen lijst is geen fout', wk.schoneDagen(undefined,'2026-11-16').length===0);
  ok('token: 32 hextekens', wk.geldigToken(TOKEN));
  ok('token: niets anders komt in een databasevraag', !wk.geldigToken('abc') && !wk.geldigToken(TOKEN+',x.eq.1') && !wk.geldigToken(TOKEN.toUpperCase()));

  // ── de edge-functie zelf: wat er niet in mag ──
  const edge=fs.readFileSync(bron('supabase/functions/rooster-link/index.ts'),'utf8');
  ok('edge: token gecontroleerd voor de databasevraag', /if \(!geldigToken\(token\)\) return null;/.test(edge));
  ok('edge: naam moet bij dit team horen', /acc\.team_id !== link\.team_id/.test(edge));
  ok('edge: met inloggen alleen je eigen beschikbaarheid', /ik && ik\.id !== accountId/.test(edge));
  ok('edge: doorgeven telt meteen (ingediend)', /status: "ingediend"/.test(edge));
  ok('edge: rooster alleen van gedeelde weken', /if \(gedeeld\)/.test(edge));
  ok('edge: notitie bij een dienst blijft binnen', /select\("account_id, datum, van, tot"\)/.test(edge) && !/notitie"/.test(edge.replace(/\/\/.*$/gm,'')));
  ok('edge: met de rooster-link kun je alleen kijken', /Met deze link kun je alleen kijken/.test(edge));

  const vc=JSON.parse(fs.readFileSync(bron('vercel.json'),'utf8'));
  ok('vercel: /rooster/<token> opent de pagina', (vc.rewrites||[]).some(r=>r.source==='/rooster/:token' && r.destination==='/rooster'));

  // ── 2. de pagina voor het team ──
  function pagina(antwoorden, url){
    const MOCK=`<script>
window.__vragen=[];
window.__antw=${JSON.stringify(antwoorden)};
window.fetch=async(u,o)=>{
  const b=JSON.parse(o.body); window.__vragen.push({url:u, lijf:b, kop:o.headers});
  const a=window.__antw[b.actie]||{ok:false,error:'onbekend'};
  return {ok:a.ok!==false, json:async()=>a};
};
window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};
<\/script>`;
    const html=fs.readFileSync(bron('rooster/index.html'),'utf8')
      .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK);
    const dom=new JSDOM(html,{runScripts:'dangerously', url:url||('https://storvo.app/rooster/'+TOKEN), pretendToBeVisual:true});
    dom.window.scrollTo=()=>{};
    return dom.window;
  }
  const week=wk.weekDagen('2026-11-16');
  const mensen=[{id:'11111111-1111-4111-8111-111111111111', naam:'Sara'},{id:'22222222-2222-4222-8222-222222222222', naam:'Tim'}];

  let w=pagina({info:{ok:true, soort:'beschikbaarheid', winkel:'Refuro', maandag:week[0], dagen:week, mensen, ingevuld:{}},
                doorgeven:{ok:true, opgeslagen:7}});
  await wacht(60);
  let d=w.document;
  ok('pagina: token uit het pad mee naar de server', w.__vragen[0] && w.__vragen[0].lijf.token===TOKEN && w.__vragen[0].lijf.actie==='info');
  ok('pagina: naar de edge-functie rooster-link', /\/functions\/v1\/rooster-link$/.test(w.__vragen[0].url));
  ok('pagina: zonder sessie geen Authorization', !w.__vragen[0].kop.Authorization);
  ok('pagina: kop zegt wat er moet', /Wanneer kun je werken/.test(d.getElementById('kop').textContent));
  ok('pagina: winkel en week in de subkop', /Refuro/.test(d.getElementById('subkop').textContent) && /16 tot en met 22 november/.test(d.getElementById('subkop').textContent));
  const knoppen=[...d.querySelectorAll('.naamknop')];
  ok('pagina: elke naam als grote knop', knoppen.map(k=>k.textContent).join('|')==='Sara|Tim');
  ok('pagina: eerst je naam, dan pas de dagen', !d.querySelector('.dag'));
  knoppen[1].click();
  ok('pagina: na je naam zeven dagen', d.querySelectorAll('.dag').length===7 && d.querySelector('.naamknop.aan').textContent==='Tim');
  // Maandag kan, een deel van de dag; dinsdag kan niet; de rest niets aangetikt.
  d.querySelectorAll('.dag')[0].querySelector('.keus.kan').click();
  ok('pagina: kan wordt groen', d.querySelectorAll('.dag')[0].querySelector('.keus.kan.aan'));
  ok('pagina: tijden pas als je erom vraagt', !d.getElementById('van_'+week[0]) && d.querySelectorAll('.dag')[0].querySelector('.tijdlink'));
  d.querySelectorAll('.dag')[0].querySelector('.tijdlink').click();
  const van=d.getElementById('van_'+week[0]), tot=d.getElementById('tot_'+week[0]);
  van.value='12:00'; van.dispatchEvent(new w.Event('change'));
  tot.value='17:30'; tot.dispatchEvent(new w.Event('change'));
  d.querySelectorAll('.dag')[1].querySelector('.keus.niet').click();
  ok('pagina: tijden blijven staan na hertekenen', d.getElementById('van_'+week[0]).value==='12:00');
  d.getElementById('doorgeefKnop').click();
  await wacht(30);
  const door=w.__vragen.find(v=>v.lijf.actie==='doorgeven');
  ok('pagina: doorgeven stuurt de naam mee', door && door.lijf.account_id===mensen[1].id && door.lijf.token===TOKEN);
  ok('pagina: alle zeven dagen gaan mee', door && door.lijf.dagen.length===7);
  ok('pagina: maandag kan, met tijden', door && door.lijf.dagen[0].beschikbaar===true && door.lijf.dagen[0].van==='12:00' && door.lijf.dagen[0].tot==='17:30');
  ok('pagina: dinsdag en de rest kan niet', door && door.lijf.dagen.slice(1).every(x=>x.beschikbaar===false && x.van===null));
  ok('pagina: bedankt met je naam', /Bedankt, Tim/.test((d.querySelector('.melding.goed')||{}).textContent||''));
  ok('pagina: het blijft staan na doorgeven', d.querySelectorAll('.dag')[0].querySelector('.keus.kan.aan'));

  // Al ingevuld: je ziet terug wat je eerder doorgaf.
  w=pagina({info:{ok:true, soort:'beschikbaarheid', winkel:'Refuro', maandag:week[0], dagen:week, mensen,
    ingevuld:{[mensen[0].id]:[{datum:week[2], beschikbaar:true, van:'10:00', tot:null}]}}});
  await wacht(60); d=w.document;
  d.querySelectorAll('.naamknop')[0].click();
  ok('pagina: eerder doorgegeven staat er weer', d.querySelectorAll('.dag')[2].querySelector('.keus.kan.aan') && d.getElementById('van_'+week[2]).value==='10:00');

  // Eén persoon in het team (of ingelogd): naam staat al gekozen.
  w=pagina({info:{ok:true, soort:'beschikbaarheid', winkel:'Refuro', maandag:week[0], dagen:week, mensen:[mensen[0]], ingevuld:{}}});
  await wacht(60); d=w.document;
  ok('pagina: één naam staat al aangetikt', d.querySelectorAll('.dag').length===7);

  // Fout bij doorgeven: knop weer bruikbaar, melding in gewone taal.
  w=pagina({info:{ok:true, soort:'beschikbaarheid', winkel:'Refuro', maandag:week[0], dagen:week, mensen:[mensen[0]], ingevuld:{}},
            doorgeven:{ok:false, error:'Je hebt nog geen dagen aangetikt'}});
  await wacht(60); d=w.document;
  d.getElementById('doorgeefKnop').click(); await wacht(30);
  ok('pagina: fout van de server in beeld', /nog geen dagen/.test((d.querySelector('.melding.fout')||{}).textContent||'') && !d.getElementById('doorgeefKnop').disabled);

  // Het rooster bekijken.
  const deze=wk.weekDagen('2026-11-09');
  w=pagina({info:{ok:true, soort:'rooster', winkel:'Refuro', ik:null, weken:[
    {maandag:deze[0], dagen:deze, gedeeld:true, diensten:[{naam:'Sara', account_id:mensen[0].id, datum:deze[5], van:'10:00', tot:'17:00'}]},
    {maandag:week[0], dagen:week, gedeeld:false, diensten:[]}]}}, 'https://storvo.app/rooster?t='+TOKEN);
  await wacht(60); d=w.document;
  ok('rooster: token ook via ?t=', w.__vragen[0].lijf.token===TOKEN);
  ok('rooster: gedeelde week met wie werkt', /Sara/.test(d.body.textContent) && /10:00 tot 17:00/.test(d.body.textContent));
  ok('rooster: lege dagen zeggen het', d.querySelectorAll('.niemand').length===6);
  ok('rooster: niet gedeelde week nog niet zichtbaar', /staat er nog niet/.test(d.body.textContent));

  // Inloggen verplicht.
  w=pagina({info:{ok:true, soort:'beschikbaarheid', winkel:'Refuro', inloggen:true}});
  await wacht(60); d=w.document;
  ok('inloggen: knop naar de app', /Log eerst in/.test(d.body.textContent) && d.querySelector('a.btn[href="/app/"]'));

  // Een kapotte link.
  w=pagina({}, 'https://storvo.app/rooster/kapot');
  await wacht(60); d=w.document;
  ok('kapotte link: niets naar de server, wel uitleg', w.__vragen.length===0 && /klopt niet/.test(d.body.textContent));
  w=pagina({info:{ok:false, error:'Deze link werkt niet meer. Vraag om de nieuwe link.'}});
  await wacht(60); d=w.document;
  ok('oude link: de uitleg van de server', /werkt niet meer/.test(d.body.textContent));

  // ── 3. de winkelapp ──
  const MOCK=`<script>
window.__geschreven=[];
function _leegVoor(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},gte(){return api;},lte(){return api;},maybeSingle:async()=>({data:null}),
    insert(r){ window.__geschreven.push([naam,'insert',r]); return {select:()=>({single:async()=>({data:{id:'x'}}), maybeSingle:async()=>({data:null})})}; },
    upsert(r,o){ window.__geschreven.push([naam,'upsert',r,o]); return Promise.resolve({error:null}); },
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
  const html=fs.readFileSync(bron('app/index.html'),'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK)
    .replace(/<script src="(?!https)[^"]*"><\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/app/', pretendToBeVisual:true});
  const a=dom.window;
  const fouten=[]; a.onerror=m=>fouten.push(String(m));
  await wacht(800);
  const ad=a.document;
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,3).join(' | '));

  /* De links komen uit rooster_links; bestaat er nog geen rij, dan maakt de app hem aan. */
  a.__links={team_id:'t1', token_beschikbaarheid:'a'.repeat(32), token_rooster:'b'.repeat(32), inloggen_verplicht:false};
  a.__geopend=[];
  a.open=(u,doel,opt)=>{ a.__geopend.push([u,doel,opt]); return null; };
  a.eval(`account={team_id:'t1', rol:'eigenaar'}; gebruiker={id:'e1', naam:'Lucas', rol:'eigenaar', tabs:null};
    teamLeden=[{id:'e1',naam:'Lucas',rol:'eigenaar'},{id:'m1',naam:'Sara',rol:'medewerker'}];
    window.__sbFrom=sb.from;
    sb.from=(n)=>{
      if(n!=='rooster_links') return window.__sbFrom(n);
      const api={select(){return api;},eq(){return api;},
        maybeSingle:async()=>({data: window.__linkRij||null}),
        insert(r){ window.__geschreven.push([n,'insert',r]); window.__linkRij=window.__links;
          return {select:()=>({maybeSingle:async()=>({data:window.__links})})}; },
        update(r){ window.__geschreven.push([n,'update',r]); return {eq:async()=>({error:null})}; }};
      return api;
    };`);
  await a.eval('roosterLinksHaal()');
  ok('app: geen rij, dan maakt hij er een', a.__geschreven.some(x=>x[0]==='rooster_links' && x[1]==='insert' && x[2].team_id==='t1'));
  ok('app: beschikbaarheid-link', a.eval("roosterLinkUrl('beschikbaarheid')")==='https://storvo.app/rooster/'+'a'.repeat(32));
  ok('app: rooster-link', a.eval("roosterLinkUrl('rooster')")==='https://storvo.app/rooster/'+'b'.repeat(32));

  await a.eval("tekenRoosterDelen()");
  const delen=ad.getElementById('roosterDelen');
  ok('app: deelkaart onder het planbord', !delen.hidden && delen.querySelectorAll('.deelrij').length===2);
  ok('app: inloggen-vinkje staat uit', !ad.getElementById('roosterInloggen').checked);

  a.eval("roosterNaarWhatsApp('beschikbaarheid')");
  const wa=a.__geopend[0]||[];
  ok('app: WhatsApp opent met het bericht klaar', /^https:\/\/wa\.me\/\?text=/.test(wa[0]||'') && decodeURIComponent((wa[0]||'').split('text=')[1]||'').includes('/rooster/'+'a'.repeat(32)));
  ok('app: WhatsApp in een nieuw venster zonder opener', wa[1]==='_blank' && wa[2]==='noopener');

  await a.eval("roosterInloggenZet(true)");
  ok('app: inloggen verplicht opgeslagen', a.__geschreven.some(x=>x[0]==='rooster_links' && x[1]==='update' && x[2].inloggen_verplicht===true));

  // Nieuwe links maken: eerst vragen, dan nieuwe tokens van 32 hextekens.
  a.eval("window.__jaNee=vraagJaNee; vraagJaNee=async()=>true;");
  await a.eval("roosterLinksVernieuw()");
  const nieuw=a.__geschreven.filter(x=>x[0]==='rooster_links' && x[1]==='update' && x[2].token_rooster).pop();
  ok('app: nieuwe links zijn echte tokens', !!nieuw && /^[a-f0-9]{32}$/.test(nieuw[2].token_rooster) && /^[a-f0-9]{32}$/.test(nieuw[2].token_beschikbaarheid) && nieuw[2].token_rooster!==nieuw[2].token_beschikbaarheid);
  ok('app: de oude link werkt in de app ook niet meer', a.eval("roosterLinkUrl('rooster')").endsWith(nieuw?nieuw[2].token_rooster:'x'));
  a.eval("vraagJaNee=window.__jaNee;");

  // Een week delen.
  a.eval("roosterMaandag=roosterMaandagVan(new Date(Date.now()+7*864e5)); roosterData={besch:[], diensten:[], gedeeld:false};");
  ok('app: nog niet gedeeld, dan de knop Rooster delen', /Rooster delen/.test(a.eval('roosterKopHtml()')));
  await a.eval("roosterWeekDelen(true)");
  const up=a.__geschreven.filter(x=>x[0]==='rooster_weken' && x[1]==='upsert').pop();
  ok('app: delen schrijft de week weg', !!up && up[2].team_id==='t1' && up[2].gedeeld===true && up[2].maandag===a.eval('roosterYmd(roosterDagen()[0])') && up[3].onConflict==='team_id,maandag');
  ok('app: na delen meteen de link om te sturen', !!ad.getElementById('roosterModal') && /\/rooster\//.test(ad.getElementById('roosterModal').textContent));
  a.eval('roosterModalDicht()');
  ok('app: gedeeld staat in beeld', /Gedeeld/.test(a.eval('roosterKopHtml()')) && /Niet meer delen/.test(a.eval('roosterKopHtml()')));
  await a.eval("roosterWeekDelen(false)");
  ok('app: niet meer delen', a.__geschreven.filter(x=>x[0]==='rooster_weken').pop()[2].gedeeld===false && !a.eval('roosterData.gedeeld'));

  // Een medewerker ziet geen deelknoppen en hoeft niets goed te laten keuren.
  a.eval("gebruiker={id:'m1', naam:'Sara', rol:'medewerker', tabs:null}; roosterLinks=null;");
  await a.eval("tekenRoosterDelen()");
  ok('app: medewerker ziet geen links', ad.getElementById('roosterDelen').hidden);
  ok('app: geen kop met delen voor een medewerker', a.eval('roosterKopHtml()')==='');
  const zeven=a.eval('roosterDagen().map(roosterYmd)');
  a.eval(`roosterData.besch=${JSON.stringify(zeven.map(x=>({account_id:'m1', datum:x, beschikbaar:false, status:'ingediend'})))};`);
  ok('app: hele week doorgegeven telt als doorgegeven', a.eval("roosterWeekStatus('m1').status")==='doorgegeven');
  ok('app: geen goedkeuring meer in de tekst', !/goedkeuring/i.test(a.eval('roosterDoorgeefVoet()')));
  a.eval(`roosterData.besch=roosterData.besch.slice(0,3);`);
  ok('app: half doorgegeven is nog niet klaar', a.eval("roosterWeekStatus('m1').status")==='concept');
  await a.eval(`zetBeschikbaar('${zeven[4]}','toggle')`);
  const gezet=a.__geschreven.filter(x=>x[0]==='beschikbaarheid' && x[1]==='upsert').pop();
  ok('app: een dag zetten telt meteen', !!gezet && gezet[2].status==='ingediend' && gezet[2].beschikbaar===true);
  ok('app: het goedkeuren is weg', a.eval("typeof roosterGoedkeur==='undefined' && typeof keurWacht==='undefined'"));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nrooster-link in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
