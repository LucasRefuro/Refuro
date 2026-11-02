// De inloggegevens voor de leveranciers (Foneday, Mobileparts).
//
// Het wachtwoord stond in state.leveranciers en ging zo via de sync leesbaar mee in
// de winkeldata-blob. Nu gaat het naar de edge-functie 'leveranciers', die het
// versleuteld bewaart. Deze test bewaakt precies dat lek: het wachtwoord mag nooit
// in de gesynchroniseerde state, in state zelf of in de browseropslag belanden, ook
// niet tijdens de eenmalige verhuizing van een oud apparaat.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

/* Stopt de test zonder process.exit (een belofte die nooit oplost), dan liep node
   vroeger gewoon leeg met code 0: halve test, toch groen. Nu telt dat als fout. */
process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const GEHEIM='Geheim-Foneday-8231';
const OUD_GEHEIM='Oud-Mobileparts-4410';

const MOCK=`<script>
const _leeg={select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
  in(){return this;},maybeSingle:async()=>({data:null}),
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
  window.__verstuurd.push([String(url), opties.body||'']);
  const a=window.__antwoord||{ok:true};
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
const veld=id=>d().getElementById(id);
/* Alles wat de browser bewaart, in één string, om er een wachtwoord in te zoeken. */
const opslag=()=>{ let s=''; for(let i=0;i<w.localStorage.length;i++){ const k=w.localStorage.key(i); s+=k+'='+w.localStorage.getItem(k)+'\n'; } return s; };
const laatste=()=>w.__verstuurd.filter(v=>v[0].includes('/functions/v1/leveranciers')).pop();

setTimeout(async()=>{
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  // ── de sync neemt leveranciers niet meer mee ──
  ok('leveranciers staat niet in SYNC_VELDEN', w.eval("SYNC_VELDEN.indexOf('leveranciers')<0"));
  w.eval(`state.leveranciers={foneday:{user:'a@winkel.nl', pass:${JSON.stringify(GEHEIM)}}}`);
  const doc=w.eval('JSON.stringify(syncDocumentUitState())');
  ok('een oud wachtwoord in state komt niet in het sync-document', !doc.includes(GEHEIM));
  ok('en de sleutel leveranciers ook niet', !/"leveranciers"/.test(doc));
  ok('samenvoegen met een oude cloudversie haalt het niet terug',
    w.eval(`(function(){var oud={leveranciers:{foneday:{user:'x',pass:${JSON.stringify(GEHEIM)}}}};
      var r=syncVoegSamen(oud, syncDocumentUitState(), oud);
      return JSON.stringify(r).indexOf(${JSON.stringify(GEHEIM)})<0;})()`));
  w.eval('delete state.leveranciers');

  // ── het scherm ──
  ok('leveranciers in de instellingen', !!d().querySelector('#instTabs button[data-s="leveranciers"]'));
  ok('wachtwoordvelden zijn verborgen tijdens het typen',
    veld('lv_fd_pass').type==='password' && veld('lv_mp_pass').type==='password');
  ok('zegt niet meer dat het lokaal en onversleuteld blijft',
    !/onversleuteld/.test(veld('inst-leveranciers').textContent));

  // ── status ophalen: e-mail terug, wachtwoord alleen als ja/nee ──
  w.__antwoord={ok:true, leveranciers:{foneday:{gebruiker:'a@winkel.nl', wachtwoord:true}, mobileparts:{gebruiker:'', wachtwoord:false}}};
  await w.eval('lvLaad()');
  ok('vraagt de status aan de server', JSON.parse(laatste()[1]).actie==='status');
  ok('e-mailadres staat er weer', veld('lv_fd_user').value==='a@winkel.nl');
  ok('wachtwoordveld blijft leeg', veld('lv_fd_pass').value==='');
  ok('maar zegt dat er een is', veld('lv_fd_pass').placeholder==='Opgeslagen');
  ok('wissen kan alleen waar iets staat', veld('lv_fd_wis').hidden===false && veld('lv_mp_wis').hidden===true);

  // ── opslaan met een nieuw wachtwoord ──
  veld('lv_fd_user').value='  a@winkel.nl ';
  veld('lv_fd_pass').value=GEHEIM;
  w.__antwoord={ok:true, inlog:{gebruiker:'a@winkel.nl', wachtwoord:true}};
  await w.eval("slaLeveranciersOp('foneday')");
  const [url, lijf]=laatste();
  const verstuurd=JSON.parse(lijf);
  ok('gaat naar de edge-functie', /\/functions\/v1\/leveranciers$/.test(url));
  ok('actie opslaan voor foneday', verstuurd.actie==='opslaan' && verstuurd.leverancier==='foneday');
  ok('wachtwoord gaat in de body mee', verstuurd.wachtwoord===GEHEIM);
  ok('en nooit in het adres', !url.includes(GEHEIM));
  ok('e-mail zonder spaties', verstuurd.gebruiker==='a@winkel.nl');
  ok('wachtwoord staat niet in state', !w.eval('JSON.stringify(state)').includes(GEHEIM));
  ok('wachtwoord staat niet in het sync-document', !w.eval('JSON.stringify(syncDocumentUitState())').includes(GEHEIM));
  ok('wachtwoord staat nergens in de browseropslag', !opslag().includes(GEHEIM));
  ok('veld is na opslaan weer leeg', veld('lv_fd_pass').value==='');

  // ── alleen het e-mailadres wijzigen raakt het wachtwoord niet ──
  veld('lv_fd_user').value='b@winkel.nl';
  w.__antwoord={ok:true, inlog:{gebruiker:'b@winkel.nl', wachtwoord:true}};
  await w.eval("slaLeveranciersOp('foneday')");
  ok('zonder getypt wachtwoord gaat er geen wachtwoord mee',
    !('wachtwoord' in JSON.parse(laatste()[1])));

  // ── mislukt opslaan laat het wachtwoord ook niet in state achter ──
  veld('lv_mp_pass').value=GEHEIM;
  w.__antwoord={ok:false, error:'Alleen de eigenaar of een beheerder mag dit wijzigen.'};
  await w.eval("slaLeveranciersOp('mobileparts')");
  ok('bij een weigering staat het wachtwoord niet in state', !w.eval('JSON.stringify(state)').includes(GEHEIM));
  veld('lv_mp_pass').value='';

  // ── wissen ──
  w.__antwoord={ok:true, inlog:{gebruiker:'', wachtwoord:false}};
  await w.eval("lvWis('foneday')");
  ok('wissen vraagt de server', JSON.parse(laatste()[1]).actie==='wis');
  ok('na wissen is alles leeg', veld('lv_fd_user').value==='' && veld('lv_fd_pass').placeholder==='' && veld('lv_fd_wis').hidden);

  // ── de eenmalige verhuizing van een oud apparaat, maar het lukt nu niet ──
  w.eval(`state.leveranciers={mobileparts:{user:'c@winkel.nl', pass:${JSON.stringify(OUD_GEHEIM)}}}`);
  w.__antwoord={ok:false, error:'offline'};
  await w.eval('lvOverzetten()');
  ok('mislukte verhuizing gooit niets weg', w.eval("!!(state.leveranciers&&state.leveranciers.mobileparts)"));
  ok('maar de sync neemt het intussen niet mee', !w.eval('JSON.stringify(syncDocumentUitState())').includes(OUD_GEHEIM));

  // ── de verhuizing lukt ──
  w.__antwoord={ok:true, leveranciers:{foneday:{gebruiker:'',wachtwoord:false}, mobileparts:{gebruiker:'c@winkel.nl', wachtwoord:true}}};
  await w.eval('lvOverzetten()');
  const over=JSON.parse(laatste()[1]);
  ok('verhuist via de actie overzetten', over.actie==='overzetten');
  ok('met het oude wachtwoord erbij', over.leveranciers.mobileparts.pass===OUD_GEHEIM);
  ok('alleen leveranciers met iets erin', !('foneday' in over.leveranciers));
  ok('daarna is state.leveranciers weg', w.eval('state.leveranciers===undefined'));
  ok('en staat het oude wachtwoord nergens meer in de browser', !opslag().includes(OUD_GEHEIM));
  const aantal=w.__verstuurd.length;
  await w.eval('lvOverzetten()');
  ok('een tweede keer doet niets', w.__verstuurd.length===aantal);

  // ── de server: nooit iets terug dan het e-mailadres en ja/nee ──
  const edge=fs.readFileSync(bron('supabase/functions/leveranciers/index.ts'),'utf8');
  const antwoorden=[...edge.matchAll(/\bok\(\{([^}]*)\}\)/g)].map(m=>m[1].trim());
  ok('de edge-functie antwoordt alleen met de zichtbare vorm',
    antwoorden.length>0 && antwoorden.every(a=>/^(leveranciers: await alles\(\)|inlog: zichtbaar\([^)]*\))$/.test(a)));
  const zicht=(edge.match(/function zichtbaar[\s\S]*?\n}/)||[''])[0];
  ok('en de zichtbare vorm bevat het versleutelde wachtwoord niet',
    zicht && !/wachtwoord_versleuteld\s*:/.test(zicht) && /wachtwoord:\s*!!/.test(zicht));

  // ── de tabel: geen policies, en de blob ruimt zichzelf op ──
  const migratie=fs.readdirSync(bron('supabase/migrations'))
    .map(n=>fs.readFileSync(bron('supabase/migrations/'+n),'utf8')).join('\n');
  ok('tabel heeft RLS aan', /alter table public\.leverancier_inloggegevens enable row level security/.test(migratie));
  ok('en bewust geen enkele policy', !/create policy[^;]*on public\.leverancier_inloggegevens/i.test(migratie));
  ok('de blob verliest leveranciers bij elke opslag', /new\.data - 'leveranciers'/.test(migratie));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
},450);
