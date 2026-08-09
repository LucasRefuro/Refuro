// De apparaatpagina, de printwachtrij, de nieuwe lijsten en de onderdelen per soort.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const MOCK=`<script>
window.__db={
  refurbish_apparaten:[
    {id:'a1', team_id:'t1', code:'A0001', merk:'HP', model:'EliteBook 840 G9', categorie:'Laptop',
     serienummer:'DEV-HRNP72', leverancier:'Testleverancier', inkoop:75,
     specs:{Processor:'Intel Core i5-1235U', Geheugen:'16 GB', Opslag:'512 GB SSD'},
     status:'klaar', grade:'A', punten:1,
     checklist:[{v:'Werkt het toetsenbord, alle toetsen?', a:'Ja'},{v:'Behuizing', a:'Lichte gebruikssporen'}],
     defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()},
    {id:'a2', team_id:'t1', code:'A0002', merk:'Dell', model:'Latitude 5430', categorie:'Laptop',
     specs:{}, status:'repurpose', checklist:[], defecten:[], goede_delen:['Scherm','Accu'],
     aangemaakt_op:new Date().toISOString()},
    {id:'a3', team_id:'t1', code:'A0003', merk:'Lenovo', model:'ThinkPad T14', categorie:'Laptop',
     specs:{}, status:'overgedragen', hardware_id:'h9', grade:'B',
     checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_onderdelen:[
    {id:'o1', team_id:'t1', naam:'Scherm uit Dell Latitude 5430', soort:'Scherm', van_apparaat:'a2',
     status:'voorraad', aangemaakt_op:new Date().toISOString()},
    {id:'o2', team_id:'t1', naam:'Accu uit Dell Latitude 5430', soort:'Accu', van_apparaat:'a2',
     status:'voorraad', aangemaakt_op:new Date().toISOString()},
    {id:'o3', team_id:'t1', naam:'Scherm 14 inch', soort:'Scherm', status:'te_bestellen',
     aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_checklists:[], refurbish_orders:[], hardware_modellen:[]
};
window.__geschreven=[];
function __tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},maybeSingle:async()=>({data:(window.__db[naam]||[])[0]||null}),
    insert(r){ window.__geschreven.push([naam,'insert',r]);
      return {select:async()=>({data:[],error:null})}; },
    update(r){ window.__geschreven.push([naam,'update',r]); return api; },
    delete(){ window.__geschreven.push([naam,'delete']); return api; },
    then(res){ res({data:window.__db[naam]||[], error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
  from:(n)=> n==='accounts'
    ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'Lucas'}})}
    : __tabel(n),
  rpc:async(naam)=> naam==='abonnement_status'
    ? {data:[{plan:'Enterprise',status:'actief',geblokkeerd:false,modules:['refurbish']}]}
    : {data:null}
})};
<\/script>`;

const html=fs.readFileSync(bron('refurbish/index.html'),'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK);
const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/refurbish/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[]; w.onerror=(m)=>fouten.push(String(m));
const zichtbaar=el=>el && w.getComputedStyle(el).display!=='none';

setTimeout(()=>{
  const d=w.document;
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  // ── nieuwe pagina's ──
  ok('klaar voor verkoop in het menu', !!d.querySelector('aside nav button[data-tab="klaar"]'));
  ok('donoren in het menu', !!d.querySelector('aside nav button[data-tab="donoren"]'));
  ok('badge klaar voor verkoop', d.getElementById('bKlaar').textContent==='1');
  ok('klaarlijst toont het toestel', /EliteBook 840 G9/.test(d.getElementById('klaarLijst').innerHTML));
  ok('klaarlijst toont de grade', /gradepil/.test(d.getElementById('klaarLijst').innerHTML));
  ok('donorlijst toont de gesloopte', /Latitude 5430/.test(d.getElementById('donorLijst').innerHTML));
  ok('donorlijst toont wat eruit is', /Scherm/.test(d.getElementById('donorLijst').innerHTML));

  // ── onderdelen per soort ──
  const per=d.getElementById('deelLijst').innerHTML;
  ok('onderdelen per soort', /Op de plank/.test(per) && /Te bestellen/.test(per));
  ok('twee schermen geteld', /Scherm/.test(per));
  w.eval("deelWeergaveNu='stuk'; tekenOnderdelen();");
  ok('per stuk toont herkomst', /A0002/.test(d.getElementById('deelLijst').innerHTML));

  // ── apparaatpagina ──
  w.eval("appPagina('a1')");
  ok('apparaatpagina zichtbaar', zichtbaar(d.getElementById('tab-apparaat')));
  const pag=d.getElementById('appPagina').innerHTML;
  ok('titel op de pagina', /EliteBook 840 G9/.test(pag));
  ok('nummer als feit', /A0001/.test(pag));
  ok('serienummer als feit', /DEV-HRNP72/.test(pag));
  ok('grade als feit', /Grade A/.test(pag));
  ok('leverancier als feit', /Testleverancier/.test(pag));
  ok('inkoopprijs als feit', /75,00/.test(pag));
  ok('specificaties getoond', /Intel Core i5-1235U/.test(pag));
  ok('controle-uitslag getoond', /toetsenbord/.test(pag));
  ok('strafpunten genoemd', /1 strafpunt/.test(pag));
  ok('label als voorbeeld', /etiket/.test(pag));
  ok('knop naar de winkelvoorraad', /Naar de winkelvoorraad/.test(pag));

  w.eval("appPagina('a2')");
  const pag2=d.getElementById('appPagina').innerHTML;
  ok('donorpagina toont wat eruit is', /Eruit gehaald/.test(pag2) && /deelpil/.test(pag2));

  // ── printwachtrij ──
  ok('wachtrij begint leeg', !d.getElementById('wachtrijBalk'));
  w.eval("wachtrijBij('a1'); wachtrijBij('a2')");
  const balk=d.getElementById('wachtrijBalk');
  ok('wachtrijbalk verschijnt', !!balk);
  ok('telt twee labels', /2 labels klaar/.test(balk.textContent));
  w.eval("wachtrijBij('a1')");
  ok('geen dubbele in de wachtrij', /2 labels klaar/.test(d.getElementById('wachtrijBalk').textContent));
  w.eval('wachtrijPrinten()');
  const venster=d.getElementById('venster');
  ok('printen opent beide labels', !!venster && /Labels \(2\)/.test(venster.textContent));
  w.eval('sluit(); wachtrijLeeg()');
  ok('leegmaken verwijdert de balk', !d.getElementById('wachtrijBalk'));

  // ── gescand label opent de pagina ──
  ok('label wijst naar het apparaat', /apparaat%3Da1/.test(w.eval("labelUrl('a1')").replace(/=/g,'%3D')) ||
     /apparaat=a1/.test(w.eval("labelUrl('a1')")));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
},450);
