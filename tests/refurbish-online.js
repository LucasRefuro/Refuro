// Online zetten: advertentie met sjabloon, de zes foto's, de kanalen.
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
     specs:{Processor:'i5', Geheugen:'16 GB'}, status:'klaar', grade:'A', accu:88, inkoop:75,
     checklist:[], defecten:[], goede_delen:[], aangemaakt_op:new Date().toISOString()}
  ],
  refurbish_onderdelen:[], refurbish_checklists:[], refurbish_orders:[], hardware_modellen:[],
  refurbish_instellingen:{team_id:'t1', accu_min:80, ad_sjabloon:null, ad_toon:'zakelijk en eerlijk'},
  refurbish_fotos:[
    {id:'f1', team_id:'t1', apparaat_id:'a1', aanzicht:'dicht', pad:'t1/a1/dicht-1.jpg', volgorde:0},
    {id:'f2', team_id:'t1', apparaat_id:'a1', aanzicht:'open',  pad:'t1/a1/open-1.jpg',  volgorde:1}
  ]
};
window.__geschreven=[];
function __tabel(naam){
  const api={select(){return api;},order(){return api;},limit(){return api;},eq(){return api;},
    or(){return api;}, in(){return api;}, ilike(){return api;}, not(){return api;},
    maybeSingle:async()=>({data: Array.isArray(window.__db[naam])
      ? (window.__db[naam][0]||null) : (window.__db[naam]||null)}),
    insert(r){ window.__geschreven.push([naam,'insert',r]);
      // select() moet zowel als belofte als met .single() werken, net als bij Supabase
      return {select:()=>({
        single:async()=>({data:{id:'h1'}, error:null}),
        then:(res)=>res({data:[{id:'h1'}], error:null})
      })}; },
    upsert(r){ window.__geschreven.push([naam,'upsert',r]); return api; },
    update(r){ window.__geschreven.push([naam,'update',r]); return api; },
    delete(){ window.__geschreven.push([naam,'delete']); return api; },
    then(res){ res({data: Array.isArray(window.__db[naam])?window.__db[naam]:[], error:null}); }};
  return api;
}
window.__fetches=[];
const echteFetch=window.fetch;
window.fetch=async(url, opties)=>{
  window.__fetches.push([String(url), opties]);
  if(String(url).includes('/advertentie')){
    return {ok:true, json:async()=>({ok:true, titel:'HP EliteBook 840 G9 · i5 · 16 GB',
      tekst:'Specificaties\\n- Processor: i5', zoekwoorden:['elitebook','i5']})};
  }
  return {ok:true, json:async()=>({ok:true})};
};
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
  from:(n)=> n==='accounts'
    ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'Lucas'}})}
    : __tabel(n),
  storage:{from:()=>({
    getPublicUrl:(p)=>({data:{publicUrl:'https://opslag/'+p}}),
    upload:async()=>({error:null}), remove:async()=>({error:null})
  })},
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
const d=()=>w.document;
const zichtbaar=el=>el && w.getComputedStyle(el).display!=='none';

setTimeout(async()=>{
  ok('app start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));

  // ── lijst klaar voor verkoop ──
  const lijst=d().getElementById('klaarLijst').innerHTML;
  ok('pushknop achter de status', /Online zetten/.test(lijst));
  ok('serienummerkolom weg', !/Serienummer/.test(lijst));
  const filters=[...d().querySelectorAll('#klaarFilter button')].map(b=>b.textContent.trim());
  ok('filter heet nu Voorraad', filters.includes('Voorraad') && !filters.includes('Nog hier'));

  // ── het scherm openen ──
  w.eval("onlineZetten('a1')");
  await new Promise(r=>setTimeout(r,60));
  ok('online-pagina zichtbaar', zichtbaar(d().getElementById('tab-online')));
  const pag=()=>d().getElementById('onlinePagina').innerHTML;
  ok('titel van het apparaat', /EliteBook 840 G9/.test(pag()));
  ok('kanaalkeuze webshop en marktplaats', /Webshop/.test(pag()) && /Marktplaats/.test(pag()));

  // ── advertentie ──
  ok('knop om te schrijven', /Advertentie schrijven/.test(pag()));
  await w.eval('onlSchrijf(document.createElement("button"))');
  ok('titel ingevuld', d().getElementById('onl_titel').value.includes('EliteBook'));
  ok('tekst ingevuld', d().getElementById('onl_tekst').value.includes('Specificaties'));
  ok('zoekwoorden getoond', /elitebook/.test(pag()));
  ok('kopieerknoppen verschenen', /onlKopieer\('onl_titel'/.test(pag()));
  const roep=w.__fetches.find(f=>f[0].includes('/advertentie'));
  ok('kanaal meegestuurd', !!roep && JSON.parse(roep[1].body).kanaal==='webshop');
  w.eval("onlKanaal('marktplaats')");
  await w.eval('onlSchrijf(document.createElement("button"))');
  const roep2=w.__fetches.filter(f=>f[0].includes('/advertentie')).pop();
  ok('ander kanaal andere tekst', JSON.parse(roep2[1].body).kanaal==='marktplaats');

  // ── foto's ──
  ok('zes vaste aanzichten', (pag().match(/fotovak/g)||[]).length>=6);
  ok('twee fotos al gemaakt', (pag().match(/fotovak erin/g)||[]).length===2);
  ok('teller klopt', /2 van 6/.test(pag()));
  ok('knop telefoon', /Met de telefoon fotograferen/.test(pag()));
  ok('knop vanaf de computer', /Vanaf deze computer/.test(pag()));

  await w.eval('fotoTelefoon(document.createElement("button"))');
  const code=w.__geschreven.find(g=>g[0]==='refurbish_fotocodes');
  ok('fotocode aangemaakt', !!code && /^[A-Z0-9]{6}$/.test(code[2].code));
  ok('code vervalt binnen een uur', !!code &&
     new Date(code[2].vervalt) - Date.now() < 3600000);
  ok('qr getoond', /qrbeeld/.test(pag()));
  ok('code leesbaar erbij', pag().includes(code[2].code));

  // ── sjabloon instellen ──
  ok('sjabloonveld op de checklistpagina', !!d().getElementById('in_sjabloon'));
  w.eval('sjabloonStandaard()');
  ok('standaardsjabloon erin', /Specificaties/.test(d().getElementById('in_sjabloon').value));
  d().getElementById('in_toon').value='kort en zakelijk';
  await w.eval('sjabloonOpslaan(document.createElement("button"))');
  const sj=w.__geschreven.filter(g=>g[0]==='refurbish_instellingen').pop();
  ok('sjabloon opgeslagen', !!sj && sj[2].ad_sjabloon.includes('Specificaties'));
  ok('toon opgeslagen', !!sj && sj[2].ad_toon==='kort en zakelijk');

  // ── prijs in de zijkolom, geen popup meer ──
  w.eval("onlineZetten('a1')");
  await new Promise(r=>setTimeout(r,60));
  ok('prijsveld in de zijkolom', !!d().getElementById('onl_prijs'));
  ok('grade in de zijkolom', !!d().getElementById('onl_staat'));
  ok('garantie in de zijkolom', !!d().getElementById('onl_garantie'));
  ok('knop heet Publiceren', /Publiceren/.test(pag()));
  ok('geen knop naar de winkelvoorraad meer', !/Naar de winkelvoorraad/.test(pag()));
  ok('grade uit de controle voorgevuld', d().getElementById('onl_staat').value==='A');

  // publiceren zonder prijs doet niets, maar zegt wel wat
  await w.eval('onlPubliceren(document.createElement("button"))');
  ok('zonder prijs niet gepubliceerd', !w.__geschreven.some(g=>g[0]==='hardware'));

  w.eval('onlPrijsvoorstel(document.createElement("button"))');
  ok('prijsvoorstel ingevuld', Number(d().getElementById('onl_prijs').value)>0);
  ok('voorstel is meer dan de inkoop', Number(d().getElementById('onl_prijs').value)>75);
  ok('bron van het voorstel genoemd', /Ruwe schatting|Wat je zelf vroeg/.test(pag()));

  d().getElementById('onl_prijs').value='349';
  w.eval('onlVeld()');
  await w.eval('onlPubliceren(document.createElement("button"))');
  const hw=w.__geschreven.find(g=>g[0]==='hardware' && g[1]==='insert');
  ok('naar de winkelvoorraad geschreven', !!hw);
  if(hw){
    ok('prijs mee', hw[2].verkoop===349);
    ok('grade mee', hw[2].staat==='A');
    ok('garantie mee', hw[2].garantie===6);
    ok('titel en tekst mee', 'titel' in hw[2] && 'omschrijving' in hw[2]);
    ok('kanalen mee', hw[2].kanalen && hw[2].kanalen.winkel===true);
  }
  const bij=w.__geschreven.filter(g=>g[0]==='refurbish_apparaten' && g[1]==='update').pop();
  ok('apparaat op overgedragen', !!bij && bij[2].status==='overgedragen');

  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
},450);
