const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
// Paden vanaf dit bestand, zodat de tests ook vanuit de hoofdmap draaien.
const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

function bouw(bestand, mock){
  const html=fs.readFileSync(bestand,'utf8').replace(/<script src=[^>]*><\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/refurbish/',
    pretendToBeVisual:true});
  const w=dom.window;
  w.supabase=mock;
  const code=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  try{ w.eval(code); }catch(e){ console.log('opstartfout:', e.message); fout++; }
  return w;
}
const zichtbaar=(w,el)=> el && w.getComputedStyle(el).display!=='none';

// 1. niet ingelogd: slot zichtbaar met tekst, zijbalk niet
const w1=bouw(bron('refurbish/index.html'),{createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}})},
  from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null})}),
  rpc:async()=>({data:[]})})});
setTimeout(()=>{
  const d=w1.document;
  ok('uitgelogd: slotscherm zichtbaar', zichtbaar(w1,d.getElementById('slot')));
  ok('uitgelogd: slotscherm heeft tekst', d.getElementById('slotKaart').textContent.trim().length>10);
  ok('uitgelogd: zijbalk verborgen', !zichtbaar(w1,d.getElementById('zijbalk')));
  ok('uitgelogd: werkvlak verborgen', !zichtbaar(w1,d.getElementById('werkvlak')));

  // 2. ingelogd met module: slot weg, zijbalk en werkvlak in beeld
  const TEAM='t1';
  const leeg={select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
    then(r){ r({data:[],error:null}); }};
  const w2=bouw(bron('refurbish/index.html'),{createClient:()=>({
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
    from:(n)=> n==='accounts'
      ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:TEAM,naam:'Lucas'}})}
      : leeg,
    rpc:async()=>({data:[{plan:'Enterprise',status:'proef',geblokkeerd:false,modules:['refurbish']}]})})});
  setTimeout(()=>{
    const d2=w2.document;
    ok('ingelogd: slotscherm verborgen', !zichtbaar(w2,d2.getElementById('slot')));
    ok('ingelogd: zijbalk zichtbaar', zichtbaar(w2,d2.getElementById('zijbalk')));
    ok('ingelogd: werkvlak zichtbaar', zichtbaar(w2,d2.getElementById('werkvlak')));
    ok('ingelogd: werkbank open', zichtbaar(w2,d2.getElementById('tab-werkbank')));
    ok('ingelogd: andere pagina dicht', !zichtbaar(w2,d2.getElementById('tab-inkoop')));
    ok('ingelogd: lege lijst met uitleg', /Nog niets op de werkbank/.test(d2.getElementById('wbLijst').textContent));
    ok('ingelogd: badges verborgen', !zichtbaar(w2,d2.getElementById('bControle')));

    // 3. zonder de module: netjes uitleggen, niet leeg
    const w3=bouw(bron('refurbish/index.html'),{createClient:()=>({
      auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}})},
      from:(n)=> n==='accounts'
        ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:TEAM}})}
        : leeg,
      rpc:async()=>({data:[{plan:'Start',status:'actief',geblokkeerd:false,modules:[]}]})})});
    setTimeout(()=>{
      const d3=w3.document;
      ok('zonder module: slot zichtbaar', zichtbaar(w3,d3.getElementById('slot')));
      ok('zonder module: legt uit waarom', /zit niet in je pakket/.test(d3.getElementById('slotKaart').textContent));
      console.log(fout? '\n'+fout+' FOUTEN' : '\nalles zichtbaar zoals bedoeld');
      process.exit(fout?1:0);
    },350);
  },350);
},350);
