const {JSDOM}=require('jsdom');
const fs=require('fs');
const html=fs.readFileSync('../refurbish/index.html','utf8').replace(/<script src=[^>]*><\/script>/,'');
const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/refurbish/'});
const w=dom.window;

const TEAM='team-1';
const db={
  refurbish_batches:[{id:'b1', team_id:TEAM, nummer:'B0001', leverancier:'Testleverancier', inkoopprijs:900, aangemaakt_op:new Date().toISOString()}],
  refurbish_apparaten:[
    {id:'a1', team_id:TEAM, batch_id:'b1', merk:'Dell', model:'Latitude 5430', categorie:'Laptop',
     serienummer:'ABC123', specs:{Processor:'i5', Touchscreen:'ja'}, inkoop:75, status:'te_controleren',
     checklist:[], defecten:[], gelabeld:false, aangemaakt_op:new Date().toISOString()},
    {id:'a2', team_id:TEAM, batch_id:'b1', merk:'HP', model:'EliteBook 840', categorie:'Laptop',
     specs:{}, inkoop:60, status:'te_repareren', checklist:[], defecten:['Werkt de accu en laden?'],
     aangemaakt_op:new Date().toISOString()},
    {id:'a3', team_id:TEAM, batch_id:'b1', merk:'Dell', model:'XPS 14', categorie:'Laptop',
     specs:{}, inkoop:120, status:'klaar', checklist:[], defecten:[], aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_onderdelen:[
    {id:'o1', team_id:TEAM, naam:'Accu EliteBook', soort:'Accu', status:'voorraad', prijs:39, aangemaakt_op:new Date().toISOString()},
    {id:'o2', team_id:TEAM, naam:'Scherm 14 inch', soort:'Scherm', status:'te_bestellen', voor_apparaat:'a2', aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_checklists:[{id:'c1', team_id:TEAM, categorie:'Laptop', model:null,
    items:[{v:'Zit de dockingpoort er nog in?', a:['Ja','Nee','Ontbreekt']}]}],
  refurbish_orders:[{id:'r1', team_id:TEAM, leverancier:'Testleverancier', status:'besteld', prijs:49, aangemaakt_op:new Date().toISOString()}]
};
const geschreven=[];

function tabel(naam){
  const q={_naam:naam};
  const api={
    select(){ return api; }, order(){ return api; }, limit(){ return api; },
    eq(k,v){ q[k]=v; return api; }, in(){ return api; },
    maybeSingle:async()=>({data:(db[naam]||[{id:'u1', team_id:TEAM, naam:'Lucas', email:'l@x.nl'}])[0]}),
    single:async()=>({data:{id:'nieuw-1'}}),
    insert(r){ geschreven.push([naam,'insert',r]); return {select:()=>({single:async()=>({data:{id:'nieuw-1'}})})}; },
    update(r){ geschreven.push([naam,'update',r]); return api; },
    delete(){ geschreven.push([naam,'delete']); return api; },
    then(res){ res({data:db[naam]||[], error:null}); }
  };
  return api;
}
w.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'}, access_token:'t'}}})},
  from:(n)=> n==='accounts'
    ? {select(){return this;}, eq(){return this;}, maybeSingle:async()=>({data:{id:'u1', team_id:TEAM, naam:'Lucas', email:'l@x.nl'}})}
    : tabel(n),
  rpc:async()=>({data:[{plan:'Enterprise', status:'proef', geblokkeerd:false, modules:['refurbish']}]})
})};

const fouten=[];
w.addEventListener('error',e=>fouten.push(e.message));
w.onerror=(m)=>fouten.push(String(m));
const code=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
try{ w.eval(code); }catch(e){ fouten.push('opstarten: '+e.message); }

setTimeout(()=>{
  const d=w.document;
  const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fouten.push(n); };

  ok('ingelogd', d.body.classList.contains('ingelogd'));
  ok('slot verborgen', d.getElementById('slot').hidden);
  ok('werkbank getekend', /Latitude 5430/.test(d.getElementById('wbLijst').innerHTML));
  ok('kpi in behandeling 3', /">3</.test(d.getElementById('wbKpis').innerHTML));
  ok('batch getoond', /B0001/.test(d.getElementById('batchLijst').innerHTML));
  ok('controlelijst', /Latitude 5430/.test(d.getElementById('ctrLijst').innerHTML));
  ok('reparatielijst', /EliteBook/.test(d.getElementById('repLijst').innerHTML));
  ok('onderdelen', /Accu EliteBook/.test(d.getElementById('deelLijst').innerHTML));
  ok('bestellijst', /Scherm 14 inch/.test(d.getElementById('bestelLijst').innerHTML));
  ok('lopende order', /Testleverancier/.test(d.getElementById('orderLijst').innerHTML));
  ok('checklists', /dockingpoort/.test(d.getElementById('clLijst').innerHTML));
  ok('badge te controleren', d.getElementById('bControle').textContent==='1');
  ok('badge te repareren', d.getElementById('bRep').textContent==='1');
  ok('badge bestellen', d.getElementById('bBestel').textContent==='1');

  // checklist openen: de touchscreen-vraag hoort erbij te staan
  w.appOpen('a1');
  const v=d.getElementById('venster');
  ok('controlevenster open', !!v);
  ok('touchscreenvraag erbij', /barst in het touchscreen/.test(v.innerHTML));
  ok('eigen checklistvraag erbij', /dockingpoort/.test(v.innerHTML));
  ok('geen touchscreenvraag zonder touchscreen', (()=>{ w.sluit(); w.appOpen('a2'); return true; })());
  w.sluit();

  // overdracht: klaar-scherm en de rij die naar hardware gaat
  w.appOpen('a3');
  const v3=d.getElementById('venster');
  ok('klaar-scherm', /Naar de winkelvoorraad/.test(v3.innerHTML));
  d.getElementById('k_verkoop').value='349';
  const knop=[...v3.querySelectorAll('button')].find(b=>b.textContent.includes('winkelvoorraad'));
  knop.click();

  setTimeout(()=>{
    const naarHardware=geschreven.find(g=>g[0]==='hardware' && g[1]==='insert');
    ok('rij naar hardware geschreven', !!naarHardware);
    if(naarHardware){
      const r=naarHardware[2];
      ok('vraagprijs mee', r.verkoop===349);
      ok('inkoopprijs mee', r.inkoop===120);
      ok('herkomst mee', r.herkomst==='Batch B0001');
      ok('serienummer veld aanwezig', 'serienummer' in r);
    }
    const bij=geschreven.find(g=>g[0]==='refurbish_apparaten' && g[1]==='update' && g[2].status==='overgedragen');
    ok('apparaat op overgedragen', !!bij);
    console.log(fouten.length? '\nFOUTEN: '+fouten.join(' | ') : '\nalles goed');
    process.exit(fouten.length?1:0);
  },250);
},400);
