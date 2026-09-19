// Het klantportaal vanaf de winkelkant: de app /portaalbeheer/.
//
// Laadt de echte pagina in jsdom met een nagebootste Supabase-client die per tabel
// rijen teruggeeft en onthoudt wat er geschreven wordt. De belangrijkste controle:
// deze app schrijft NOOIT naar een tabel van Storvo zelf, alleen naar klantportaal_*.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
let fout=0;
const ok=(n,c,uitleg)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c){ fout++; if(uitleg!==undefined) console.log('     '+uitleg); } };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));
const BRON=fs.readFileSync(path.join(__dirname,'..','portaalbeheer','index.html'),'utf8');

const TEAM='t1';
function bouw(tabellen, opties){
  opties=opties||{};
  const dom=new JSDOM(BRON.replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/,''),
    {runScripts:'outside-only', url:'https://storvo.app/portaalbeheer/', pretendToBeVisual:true});
  const w=dom.window;
  w.__schrijf=[]; w.__fetch=[];
  const query=(tabel)=>{
    const q={ _f:[], _schrijf:null,
      select(){ return this; }, order(){ return this; }, limit(){ return this; },
      eq(k,v){ this._f.push([k,v]); return this; }, in(k,v){ this._f.push([k,v]); return this; },
      insert(r){ this._schrijf=['insert',r]; w.__schrijf.push([tabel,'insert',r]); return this; },
      update(r){ this._schrijf=['update',r]; w.__schrijf.push([tabel,'update',r,this._f]); return this; },
      upsert(r){ this._schrijf=['upsert',r]; w.__schrijf.push([tabel,'upsert',r]); return this; },
      delete(){ this._schrijf=['delete']; w.__schrijf.push([tabel,'delete',null,this._f]); return this; },
      maybeSingle:async()=>{
        if(tabel==='accounts') return {data:opties.account===undefined?{id:'u1',naam:'Lucas',rol:'eigenaar',team_id:TEAM}:opties.account};
        return {data:tabellen[tabel+':een']??null, error:tabellen[tabel+':fout']||null}; },
      single:async()=>({data:q._schrijf&&q._schrijf[1]&&!Array.isArray(q._schrijf[1])?Object.assign({id:'nieuw-'+tabel, nummer:'P0009'},q._schrijf[1]):(tabellen[tabel+':een']||null), error:null}),
      then(r){ r({data:q._schrijf?null:(tabellen[tabel]||[]), error:tabellen[tabel+':fout']||null}); } };
    return q;
  };
  w.supabase={createClient:()=>({
    auth:{ getSession:async()=>({data:{session:opties.geenSessie?null:{user:{id:'u1'},access_token:'tok'}}}),
           signInWithPassword:async()=>({error:null}), signOut:async()=>({}) },
    from:query })};
  w.fetch=async(url,opt)=>{ w.__fetch.push([url, JSON.parse(opt.body)]); return {ok:true, json:async()=>({ok:true})}; };
  w.scrollTo=()=>{};
  const code=[...BRON.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  const fouten=[];
  w.addEventListener('error',e=>fouten.push(String(e.message)));
  try{ w.eval(code); }catch(e){ fouten.push(e.message); }
  return {w, d:w.document, fouten};
}

const INST={team_id:TEAM, actief:true, merknaam:'Reloop it', wismethode:'Blancco, NIST 800-88 Purge'};
const BASIS={
  'klantportaal_instellingen:een':INST,
  klantportaal_organisaties:[{id:'org1', team_id:TEAM, naam:'Zorggroep West'}],
  klantportaal_gebruikers:[{user_id:'k1', organisatie_id:'org1', naam:'Sanne', email:'s@zorg.nl', rol:'beheerder', actief:true}],
  klantportaal_opdrachten:[
    {id:'o1', team_id:TEAM, organisatie_id:'org1', batch_id:'b1', nummer:'P0001', status:'actief', titel:'Uitfasering', aangemeld_op:'2026-08-28', opgehaald_op:'2026-09-03', bod_indicatief:14800},
    {id:'o2', team_id:TEAM, organisatie_id:'org1', batch_id:null, nummer:'P0002', status:'aanvraag', titel:'120 laptops', omschrijving:'120 laptops', aantal_verwacht:120, aangemeld_op:'2026-09-18'}],
  refurbish_batches:[{id:'b1', code:'B0010', leverancier:'Zorggroep'},{id:'b2', code:'B0011'}],
  refurbish_apparaten:[{id:'a1', merk:'Dell', model:'Latitude 5420', serienummer:'SN1', status:'klaar'},{id:'a2', merk:'HP', model:'EliteDesk', serienummer:'SN2', status:'klaar'}],
  klantportaal_apparaten:[{apparaat_id:'a2', team_id:TEAM, wis_status:'gewist'}]
};
const storvoGeschreven=w=>w.__schrijf.filter(s=>!/^klantportaal_/.test(s[0]));

(async()=>{
  console.log('\n── zonder login');
  {
    const {d,fouten}=bouw(BASIS,{geenSessie:true}); await wacht(80);
    ok('start zonder fouten', !fouten.length, fouten.join(' | '));
    ok('inlogscherm', !d.getElementById('inlog').hidden && d.getElementById('app').hidden);
  }
  console.log('\n── account zonder winkel (partner of portaalklant)');
  {
    const {d}=bouw(BASIS,{account:{id:'u1', rol:'partner', team_id:null}}); await wacht(80);
    ok('geen toegang', /hoort niet bij een winkel/.test(d.getElementById('inlogKaart').textContent));
  }
  console.log('\n── migratie nog niet gedraaid');
  {
    const {d}=bouw({'klantportaal_instellingen:fout':{message:'relation does not exist'}}); await wacht(80);
    ok('legt uit dat de migratie ontbreekt', /nog niet geïnstalleerd/.test(d.getElementById('vak').textContent));
  }
  console.log('\n── nog geen instellingen');
  {
    const {w,d}=bouw(Object.assign({}, BASIS, {'klantportaal_instellingen:een':null})); await wacht(80);
    ok('eerst de huisstijl', /Eerst je huisstijl/.test(d.getElementById('vak').textContent));
    w.eval("naarTab('instellingen')");
    d.getElementById('inMerk').value='Reloop it'; d.getElementById('inDomein').value='https://Portaal.Reloopit.nl/';
    d.getElementById('inKleur').value='rood';
    await w.eval("instellingenBewaren(null)");
    const r=(w.__schrijf.find(s=>s[0]==='klantportaal_instellingen')||[])[2]||{};
    ok('instellingen opgeslagen met schoon domein en veilige kleur', r.merknaam==='Reloop it' && r.domein==='portaal.reloopit.nl' && r.kleur==='#0F6B4B' && r.team_id===TEAM, JSON.stringify(r));
  }

  console.log('\n── opdrachten');
  const {w,d,fouten}=bouw(BASIS); await wacht(80);
  ok('start zonder fouten', !fouten.length, fouten.join(' | '));
  ok('aanvraag bovenaan', /Nieuwe aanvragen uit het portaal/.test(d.getElementById('vak').textContent) && /120 laptops/.test(d.getElementById('vak').textContent));
  ok('teller in het menu', d.getElementById('aanvraagTeller').textContent==='1' && !d.getElementById('aanvraagTeller').hidden);
  ok('lopende opdracht in de tabel', /P0001/.test(d.getElementById('vak').textContent) && /Opgehaald/.test(d.getElementById('vak').textContent));

  await w.eval("aanvraagAannemen(null,'o2')"); await wacht(20);
  ok('aanvraag aangenomen', w.__schrijf.some(s=>s[0]==='klantportaal_opdrachten' && s[1]==='update' && s[2].status==='actief'));

  await w.eval("opdrachtOpen('o1')"); await wacht(20);
  const vak=()=>d.getElementById('vak').textContent;
  ok('opdracht open met twee toestellen', /2 toestellen in B0010/.test(vak()));
  ok('meekijken als klant', !!d.querySelector('a[href="/klantportaal/?bekijk=org1"][rel~="noopener"]'));
  ok('een open toestel', /1 open op gewist/.test(vak()));

  await w.eval("stapZetten(null,'gewist_op',true)");
  ok('stap gewist op vandaag', w.__schrijf.some(s=>s[1]==='update' && /^\d{4}-\d{2}-\d{2}$/.test(s[2].gewist_op||'')));

  await w.eval("allesGewist(null)");
  const up=w.__schrijf.find(s=>s[0]==='klantportaal_apparaten' && s[1]==='upsert' && Array.isArray(s[2]));
  ok('open toestel op gewist in klantportaal_apparaten', up && up[2].length===1 && up[2][0].apparaat_id==='a1' && up[2][0].wis_methode==='Blancco, NIST 800-88 Purge', JSON.stringify(up));

  await w.eval("toestelZetten('a2','bestemming','recycling')");
  const best=w.__schrijf.filter(s=>s[0]==='klantportaal_apparaten' && !Array.isArray(s[2])).pop();
  ok('bestemming per toestel, wis-status blijft', best && best[2].bestemming==='recycling' && best[2].wis_status==='gewist', JSON.stringify(best));

  d.getElementById('odBodD').value='15250.5'; d.getElementById('odUit').value='';
  await w.eval("opdrachtBewaren(null)");
  const bod=w.__schrijf.filter(s=>s[0]==='klantportaal_opdrachten' && s[2] && s[2].bod_definitief!==undefined).pop();
  ok('bod opgeslagen, leeg is leeg', bod && bod[2].bod_definitief===15250.5 && bod[2].uitbetaald===null, JSON.stringify(bod));

  d.getElementById('odBatch').value='b2';
  await w.eval("batchKoppelen(null)");
  ok('andere batch koppelen schrijft alleen op de opdracht', w.__schrijf.some(s=>s[0]==='klantportaal_opdrachten' && s[2] && s[2].batch_id==='b2'));

  console.log('\n── nieuwe opdracht en organisatie');
  w.eval("opdrachtNieuw()");
  d.getElementById('noOrg').value='__nieuw'; d.getElementById('noOrgNaam').value='Gemeente Breda'; d.getElementById('noTitel').value='Werkplekken';
  await w.eval("document.getElementById('vensterOk').click()"); await wacht(30);
  ok('organisatie aangemaakt', w.__schrijf.some(s=>s[0]==='klantportaal_organisaties' && s[1]==='insert' && s[2].naam==='Gemeente Breda' && s[2].team_id===TEAM));
  ok('opdracht aangemaakt', w.__schrijf.some(s=>s[0]==='klantportaal_opdrachten' && s[1]==='insert' && s[2].titel==='Werkplekken' && s[2].status==='actief'));

  console.log('\n── organisatie en uitnodigen');
  w.eval("orgOpen('org1')");
  ok('contactpersoon in de lijst', /s@zorg\.nl/.test(vak()));
  d.getElementById('uiMail').value='piet@zorg.nl'; d.getElementById('uiNaam').value='Piet';
  await w.eval("uitnodigen(null,'org1')");
  const u=(w.__fetch.find(x=>/klantportaal$/.test(x[0]))||[])[1]||{};
  ok('uitnodiging via de functie', u.actie==='uitnodigen' && u.organisatie_id==='org1' && u.email==='piet@zorg.nl', JSON.stringify(u));
  await w.eval("toegangZetten(null,'k1',false)");
  ok('toegang weghalen', w.__schrijf.some(s=>s[0]==='klantportaal_gebruikers' && s[2] && s[2].actief===false));

  console.log('\n── Storvo blijft onaangeroerd');
  ok('geen enkele schrijfactie op een Storvo-tabel', storvoGeschreven(w).length===0, JSON.stringify(storvoGeschreven(w)));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles netjes');
  process.exit(fout?1:0);
})();
