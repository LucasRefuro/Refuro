// De weg van de werkbank naar de winkel: reparatie, onderdelen en de overdracht.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const MOCK=`<script>
window.__db={
  refurbish_apparaten:[
    {id:'a1', team_id:'t1', code:'A0001', leverancier:'Testleverancier', merk:'Dell',
     model:'Latitude 5430', categorie:'Laptop', serienummer:'ABC123',
     specs:{Processor:'i5', Touchscreen:'ja'}, inkoop:75, status:'te_controleren',
     checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()},
    {id:'a2', team_id:'t1', code:'A0002', merk:'HP', model:'EliteBook 840', categorie:'Laptop',
     specs:{}, inkoop:60, status:'te_repareren', checklist:[],
     defecten:['Werkt het toetsenbord, alle toetsen?'], goede_delen:[],
     aangemaakt_op:new Date().toISOString()},
    {id:'a3', team_id:'t1', code:'A0003', leverancier:'Testleverancier', merk:'Dell',
     model:'XPS 14', categorie:'Laptop', specs:{}, inkoop:120, status:'klaar',
     grade:'A', checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_onderdelen:[
    {id:'o1', team_id:'t1', naam:'Toetsenbord EliteBook', soort:'Toetsenbord', status:'voorraad', prijs:39,
     aangemaakt_op:new Date().toISOString()},
    {id:'o2', team_id:'t1', naam:'Scherm 14 inch', soort:'Scherm', status:'te_bestellen',
     voor_apparaat:'a2', aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_checklists:[{id:'c1', team_id:'t1', categorie:'Laptop', model:null,
    items:[{v:'Zit de dockingpoort er nog in?', a:['Ja','Nee','Ontbreekt']}]}],
  refurbish_orders:[{id:'r1', team_id:'t1', leverancier:'Testleverancier', status:'besteld',
    prijs:49, aangemaakt_op:new Date().toISOString()}],
  hardware_modellen:[{id:'m1', merk:'Dell', model:'Latitude 5430', categorie:'Laptop',
    specs:{Processor:'i5-1235U'}, keer_gebruikt:3}]
};
window.__geschreven=[]; window.__rpcs=[];
function __tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},maybeSingle:async()=>({data:(window.__db[naam]||[])[0]||null}),
    insert(r){ window.__geschreven.push([naam,'insert',r]);
      return {select:()=>({single:async()=>({data:{id:'nieuw-1'}})})}; },
    update(r){ window.__geschreven.push([naam,'update',r]); return api; },
    delete(){ return api; },
    then(res){ res({data:window.__db[naam]||[], error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
  from:(n)=> n==='accounts'
    ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'Lucas'}})}
    : __tabel(n),
  rpc:async(naam,arg)=>{ window.__rpcs.push([naam,arg]);
    return naam==='abonnement_status'
      ? {data:[{plan:'Enterprise',status:'proef',geblokkeerd:false,modules:['refurbish']}]}
      : {data:null}; }
})};
<\/script>`;

const html=fs.readFileSync(bron('refurbish/index.html'),'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK);
const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/refurbish/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[]; w.onerror=(m)=>fouten.push(String(m));

setTimeout(async()=>{
  const d=w.document;
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  // overzichten
  ok('werkbank getekend', /Latitude 5430/.test(d.getElementById('wbLijst').innerHTML));
  ok('kpi in behandeling 3', />3</.test(d.getElementById('wbKpis').innerHTML));
  ok('vandaag toegevoegd', /Latitude 5430/.test(d.getElementById('vandaagLijst').innerHTML));
  ok('nummer op de regel', /A0001/.test(d.getElementById('vandaagLijst').innerHTML));
  ok('grade in de regel', /grade A/.test(d.getElementById('wbLijst').innerHTML));
  ok('controlelijst', /Latitude 5430/.test(d.getElementById('ctrLijst').innerHTML));
  ok('reparatielijst', /EliteBook/.test(d.getElementById('repLijst').innerHTML));
  ok('onderdelen per soort geteld', /Toetsenbord/.test(d.getElementById('deelLijst').innerHTML));
  w.eval("deelWeergaveNu='stuk'; tekenOnderdelen();");
  ok('onderdelen per stuk', /Toetsenbord EliteBook/.test(d.getElementById('deelLijst').innerHTML));
  ok('bestellijst', /Scherm 14 inch/.test(d.getElementById('bestelLijst').innerHTML));
  ok('lopende order', /Testleverancier/.test(d.getElementById('orderLijst').innerHTML));
  ok('checklists', /dockingpoort/.test(d.getElementById('clLijst').innerHTML));
  ok('badge te controleren', d.getElementById('bControle').textContent==='1');
  ok('badge te repareren', d.getElementById('bRep').textContent==='1');
  ok('badge bestellen', d.getElementById('bBestel').textContent==='1');

  // eigen checklistvraag komt terug in de hardwarestap
  w.eval("appOpen('a1'); ctrKies('start','Ja'); ctrGa('hardware')");
  const hw=d.getElementById('ctrPagina').innerHTML;
  ok('eigen controle in het pad', /dockingpoort/.test(hw));
  ok('touchscreenvraag bij een touchscreen', /touchscreen overal/.test(hw));

  // reparatiescherm
  w.eval("ctr=null; sluit(); appOpen('a2')");
  const rep=d.getElementById('venster').innerHTML;
  ok('reparatiescherm opent', /Wat er mis is/.test(rep));
  ok('defect getoond', /toetsenbord/i.test(rep));
  ok('onderdeel van de plank aanbieden', /Toetsenbord EliteBook/.test(rep));

  // overdracht naar de winkel
  w.eval("sluit(); appOpen('a3')");
  const kl=d.getElementById('venster').innerHTML;
  ok('klaar-scherm', /Naar de winkelvoorraad/.test(kl));
  ok('grade voorgeselecteerd', d.getElementById('k_staat').value==='A');
  d.getElementById('k_verkoop').value='349';
  const knop=[...d.querySelectorAll('#vensterKnoppen button')]
    .find(b=>b.textContent.includes('winkelvoorraad'));
  knop.click();

  setTimeout(()=>{
    const naar=w.__geschreven.find(g=>g[0]==='hardware' && g[1]==='insert');
    ok('rij naar hardware geschreven', !!naar);
    if(naar){
      const r=naar[2];
      ok('vraagprijs mee', r.verkoop===349);
      ok('inkoopprijs mee', r.inkoop===120);
      ok('grade mee als staat', r.staat==='A');
      ok('herkomst mee', r.herkomst==='Testleverancier · A0003');
    }
    const bij=w.__geschreven.find(g=>g[0]==='refurbish_apparaten' && g[1]==='update' && g[2].status==='overgedragen');
    ok('apparaat op overgedragen', !!bij);
    console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
    process.exit(fout?1:0);
  },250);
},450);
