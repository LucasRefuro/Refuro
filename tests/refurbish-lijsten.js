// Lijsten voor kopers in de refurbish-app: knop op Voorraad, venster met Excel/CSV/PDF,
// per merk, per batch en per bundel. De links gaan naar de functie 'lijst' met de
// sleutel van de winkel; zonder sleutel (geen klantportaal) is er geen knop.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
let fout=0;
const ok=(n,c,u)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c){ fout++; if(u!==undefined) console.log('     '+u); } };
const wacht=ms=>new Promise(r=>setTimeout(r,ms));
const BRON=fs.readFileSync(path.join(__dirname,'..','refurbish','index.html'),'utf8');

function bouw(tabellen){
  const html=BRON.replace(/<script src=[^>]*><\/script>/g,'');
  const vc=new (require('jsdom').VirtualConsole)();
  const dom=new JSDOM(html,{runScripts:'outside-only', url:'https://storvo.app/refurbish/', pretendToBeVisual:true, virtualConsole:vc});
  const w=dom.window;
  const q=(t)=>({ select(){return this;}, order(){return this;}, limit(){return this;}, eq(){return this;}, in(){return this;}, neq(){return this;}, gte(){return this;}, not(){return this;},
    maybeSingle:async()=>({data:tabellen[t+':een']??null}), single:async()=>({data:tabellen[t+':een']??null}),
    then(r){ r({data:tabellen[t]||[], error:null}); } });
  w.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}}), onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; }},
    from:(t)=> t==='accounts' ? {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'u1',team_id:'t1',naam:'Lucas',rol:'eigenaar'}})} : q(t),
    rpc:async()=>({data:[{plan:'Enterprise',status:'actief',geblokkeerd:false,modules:['refurbish']}]}),
    storage:{from(){ return {getPublicUrl(){ return {data:{publicUrl:''}}; }}; }} })};
  w.scrollTo=()=>{};
  const code=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  try{ w.eval(code); }catch(e){ console.log('opstartfout:', e.message); fout++; }
  return w;
}

(async()=>{
  const APP=[
    {id:'a1', team_id:'t1', merk:'Dell', model:'Latitude 5420', status:'klaar', batch_id:'b1', grade:'A'},
    {id:'a2', team_id:'t1', merk:'Dell', model:'Latitude 7420', status:'klaar', batch_id:'b1', grade:'B'},
    {id:'a3', team_id:'t1', merk:'HP', model:'EliteBook 840', status:'klaar', batch_id:'b1', voorraad_batch_id:'v1', grade:'A'}];
  console.log('\n── met klantportaal (sleutel)');
  {
    const w=bouw({ 'klantportaal_instellingen:een':{lijst_sleutel:'sleutel123', actief:true, merknaam:'Reloop it'},
      refurbish_apparaten:APP, refurbish_batches:[{id:'b1', team_id:'t1', code:'B0010'}], refurbish_voorraad_batches:[{id:'v1', team_id:'t1', code:'V0001'}] });
    await wacht(500);
    const d=w.document;
    ok('knop Lijsten op Voorraad zichtbaar', d.getElementById('vrLijstKnop') && !d.getElementById('vrLijstKnop').hidden);
    w.eval("lijstVenster('voorraad')");
    const sel=d.getElementById('lijstMerk');
    ok('venster met merkkeuze', !!sel && /Hele voorraad \(3\)/.test(sel.textContent) && /Dell \(2\)/.test(sel.textContent) && /HP \(1\)/.test(sel.textContent));
    const links=()=>[...d.querySelectorAll('#lijstKnoppen a')].map(a=>a.href);
    ok('Excel-link naar de functie met team en sleutel', links().some(h=>/functions\/v1\/lijst\?/.test(h) && /t=t1/.test(h) && /k=sleutel123/.test(h) && /soort=voorraad/.test(h) && /f=xlsx/.test(h)), links().join(' '));
    ok('PDF-link naar de printpagina', links().some(h=>/\/klantportaal\/lijst\/\?/.test(h) && /soort=voorraad/.test(h)));
    sel.value='Dell'; w.eval("lijstKnoppen('voorraad')"); // wat onchange doet
    ok('per merk: soort=merk&merk=Dell', links().some(h=>/soort=merk/.test(h) && /merk=Dell/.test(h) && /f=csv/.test(h)), links().join(' '));
    w.eval("lijstVenster('batch','b1')");
    ok('per batch: id in de link', links().some(h=>/soort=batch/.test(h) && /id=b1/.test(h)));
    w.eval("lijstVenster('bundel','v1')");
    ok('per bundel: id in de link', links().some(h=>/soort=bundel/.test(h) && /id=v1/.test(h)));
    ok('geen inkoop in de uitleg vergeten te melden', /Zonder inkoopprijs/.test(d.getElementById('venster').textContent));
  }
  console.log('\n── zonder klantportaal');
  {
    const w=bouw({ refurbish_apparaten:APP });
    await wacht(500);
    ok('geen knop Lijsten', w.document.getElementById('vrLijstKnop').hidden);
  }
  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles netjes');
  process.exit(fout?1:0);
})();
