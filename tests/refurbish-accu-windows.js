// De accugrens, het Windows-pad en de uitvoeringen per onderdeel.
// De accu en de meeste hardware-checks staan nu bij Windows nakijken, na de
// installatie. Vóór Windows test je alleen scherm en opladen.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const MOCK=`<script>
window.__db={
  refurbish_apparaten:[
    {id:'a1', team_id:'t1', code:'A0001', merk:'HP', model:'EliteBook 840 G6', categorie:'Laptop',
     specs:{}, status:'te_controleren', checklist:[], defecten:[], goede_delen:[],
     aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_onderdelen:[], refurbish_checklists:[], refurbish_orders:[],
  refurbish_voorraad:[], hardware_modellen:[],
  refurbish_instellingen:{team_id:'t1', accu_min:80}
};
window.__geschreven=[]; window.__rpcs=[];
function __tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    in(){return api;},
    maybeSingle:async()=>({data: Array.isArray(window.__db[naam])
      ? (window.__db[naam][0]||null) : (window.__db[naam]||null)}),
    insert(r){ window.__geschreven.push([naam,'insert',r]);
      return {select:async()=>({data:[],error:null})}; },
    upsert(r){ window.__geschreven.push([naam,'upsert',r]); return api; },
    update(r){ window.__geschreven.push([naam,'update',r]); return api; },
    delete(){ return api; },
    then(res){ res({data: Array.isArray(window.__db[naam])?window.__db[naam]:[], error:null}); }};
  return api;
}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
  from:(n)=> n==='accounts'
    ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'Lucas'}})}
    : __tabel(n),
  rpc:async(naam,arg)=>{ window.__rpcs.push([naam,arg]);
    return naam==='abonnement_status'
      ? {data:[{plan:'Enterprise',status:'actief',geblokkeerd:false,modules:['refurbish']}]}
      : {data:null}; }
})};
<\/script>`;

const html=fs.readFileSync(bron('refurbish/index.html'),'utf8')
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK);
const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/refurbish/', pretendToBeVisual:true});
const w=dom.window;
const fouten=[]; w.onerror=(m)=>fouten.push(String(m));
const d=()=>w.document;
const tekst=()=>d().getElementById('ctrPagina').textContent;
const knop=(deel)=>[...d().querySelectorAll('#ctrPagina .ctrvoet button')]
  .find(b=>b.textContent.includes(deel));
const terug=()=>[...d().querySelectorAll('#ctrPagina .pagehead button')]
  .find(b=>/Terug/.test(b.textContent));

setTimeout(async()=>{
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  // ── instelling voor de accugrens ──
  ok('instelling geladen', w.eval('instel.accu_min')===80);
  ok('veld op de checklistpagina', !!d().getElementById('in_accu'));
  ok('veld toont de grens', d().getElementById('in_accu').value==='80');
  d().getElementById('in_accu').value='85';
  await w.eval('instelOpslaan(document.createElement("button"))');
  const bewaard=w.__geschreven.find(g=>g[0]==='refurbish_instellingen');
  ok('grens opgeslagen', !!bewaard && bewaard[2].accu_min===85);
  ok('grens meteen actief', w.eval('instel.accu_min')===85);

  // ── vóór Windows alleen scherm en opladen, geen accu ──
  w.eval("appOpen('a1'); ctrKies('start','Ja')");
  knop('Door naar de hardware').click();
  ok('geen accuveld in de hardwarestap', !d().getElementById('c_accu'));
  w.eval("ctrVoorWindows().forEach(q=>ctr.antwoord[q.v]='Ja'); ctrTeken()");
  knop('Door naar de upgrade').click();
  knop('Door naar Windows').click();
  knop('Windows draait, verder').click();
  ok('windows nakijken', /Windows nakijken/.test(tekst()));

  // ── de accu staat nu bij het nakijken ──
  ok('accuveld staat nu hier', !!d().getElementById('c_accu'));
  ok('grens genoemd bij het veld', /grens staat op 85%/.test(tekst()));
  ok('toetsenbord staat hier ook', /Werkt het toetsenbord/.test(tekst()));
  ok('meerdere na-Windows checks', w.eval('ctrNaWindows().length')>=7);

  w.eval("ctrAccu('90')");
  ok('boven de grens geen waarschuwing', !/Advies: accu vervangen/.test(tekst()));
  ok('boven de grens een bevestiging', /boven de grens/.test(tekst()));
  w.eval("ctrAccu('72')");
  ok('onder de grens een advies', /Advies: accu vervangen/.test(tekst()));
  ok('percentage genoemd', /72% is onder jouw grens van 85%/.test(tekst()));
  ok('knop om te vervangen', !!d().querySelector('.accuknop input'));
  w.eval('ctrAccuVervangen(true)');
  ok('vervangen aangevinkt', w.eval('ctr.accuVervangen')===true);
  w.eval("ctrAccu('95')");
  ok('vinkje vervalt boven de grens', w.eval('ctr.accuVervangen')===false);
  w.eval("ctrAccu('72'); ctrAccuVervangen(true)");

  // ── nog niet klaar: leg hem weg, hij gaat de lijst in ──
  w.eval("ctr.antwoord['windowsgoed']='Ja'; ctr.antwoord['drivers']='Ja'; ctrTeken()");
  await w.eval('ctrInstalleren(document.createElement("button"))');
  const gestart=w.__geschreven.filter(g=>g[0]==='refurbish_apparaten' && g[1]==='update').pop();
  ok('weggelegd, terug naar de lijst', !w.eval('!!ctr'));
  ok('staat op installeren', gestart[2].status==='installeren');
  ok('en weet dat hij echt draait', gestart[2].stap==='installeren');

  // ── de lijst toont wie draait en wie wacht ──
  w.eval(`apparaten=[{id:'a1', code:'A0001', merk:'HP', model:'ZBook 15', categorie:'Laptop',
      specs:{}, status:'installeren', stap:'installeren', checklist:[], defecten:[], goede_delen:[],
      aangemaakt_op:new Date().toISOString()},
    {id:'a2', code:'A0002', merk:'HP', model:'ZBook 17', categorie:'Laptop',
      specs:{}, status:'installeren', stap:'wachten', checklist:[], defecten:[], goede_delen:[],
      aangemaakt_op:new Date().toISOString()}];
    tekenControle();`);
  const lijst=d().getElementById('ctrLijst').innerHTML;
  ok('draaiend stipje in de lijst', /class="st installeren draait"/.test(lijst));
  ok('met de tekst erbij', /Bezig met installeren/.test(lijst));
  ok('wie nog moet wachten staat er anders bij', /Wacht op installatie/.test(lijst));

  // ── terugklikken landt op het nakijken, en je kunt terug ──
  w.eval("appOpen('a1')");
  ok('landt op het nakijken', /Windows nakijken/.test(tekst()));
  ok('vraagt of hij geinstalleerd is', /Is Windows geïnstalleerd/.test(tekst()));
  ok('kan alsnog terugklikken', !!terug());
  ok('knop om later verder te gaan', !!knop('later verder'));
  ok('nog niet door zonder bevestiging', !knop('Door naar de specificaties'));
  w.eval("ctrKies('windowsgoed','Nee')");
  ok('waarschuwing bij niet gelukt', /Maak het eerst af/.test(tekst()));
  ok('bij nee nog geen drivervraag', !/stuurprogramma/.test(tekst()));
  w.eval("ctrKies('windowsgoed','Ja')");
  ok('daarna de drivervraag', /stuurprogramma/.test(tekst()));
  w.eval("ctrKies('drivers','Nee')");
  ok('waarschuwing bij ontbrekende drivers', /ontbrekende stuurprogramma/.test(tekst()));
  ok('en niet door', !knop('Door naar de specificaties'));
  w.eval("ctrKies('drivers','Ja'); ctrNaWindows().forEach(q=>ctr.antwoord[q.v]='Ja'); ctrTeken()");
  ok('nu wel door', !!knop('Door naar de specificaties'));

  // ── uitvoeringen per onderdeel ──
  knop('Door naar de specificaties').click();
  ok('specstap', /Windows draait/.test(tekst()));
  w.eval(`ctr.opties={
      Processor:['Intel Core i5-8365U','Intel Core i7-8665U','Intel Xeon E-2176M'],
      Geheugen:['8 GB','16 GB','32 GB','64 GB'],
      Opslag:['256 GB SSD','512 GB SSD','1 TB SSD']};
    ctrTeken();`);
  const uit=d().getElementById('ctrPagina').innerHTML;
  ok('alle processors als knop', /i5-8365U/.test(uit) && /i7-8665U/.test(uit) && /Xeon E-2176M/.test(uit));
  ok('alle geheugens als knop', /64 GB/.test(uit));
  ok('aantal erbij vermeld', /4 uitvoeringen bekend/.test(uit));
  w.eval("ctrSpecKies('Geheugen','16 GB')");
  ok('aanklikken vult het veld', d().getElementById('c_ram').value==='16 GB');
  ok('gekozen knop licht op', !!d().querySelector('.optieknop.aan'));
  w.eval("ctrSpecKies('Geheugen','16 GB')");
  ok('nog een keer klikken zet hem uit', d().getElementById('c_ram').value==='');
  w.eval("ctrSpecKies('Geheugen','16 GB'); ctrSpecKies('Processor','Intel Core i7-8665U')");
  ok('eigen invoer mag ook', (()=>{ w.eval("ctr.specs['Opslag']='2 TB SSD'; ctrTeken()");
     return /optieknop aan eigen/.test(d().getElementById('ctrPagina').innerHTML); })());

  // ── extra uitrusting op de specstap ──
  ok('extra uitrusting erbij', /SureView/.test(tekst()) && /GSM-module/.test(tekst()));
  w.eval("ctrExtraKeuze('Schermtype','Mat')");
  ok('schermtype vastgelegd', w.eval("ctr.specs['Schermtype']")==='Mat');

  // ── afronden: accu telt als defect ──
  w.eval("ctrAccu('72'); ctrAccuVervangen(true)");
  await w.eval('ctrAfronden(document.createElement("button"))');
  const af=w.__geschreven.filter(g=>g[0]==='refurbish_apparaten' && g[1]==='update').pop();
  ok('accu maakt er een reparatie van', af[2].status==='te_repareren');
  ok('accu als defect vastgelegd', af[2].defecten.some(x=>/Accu vervangen/.test(x)));
  ok('accupercentage bewaard', af[2].accu===72);
  ok('specificaties bewaard', af[2].specs.Geheugen==='16 GB');

  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
},450);
