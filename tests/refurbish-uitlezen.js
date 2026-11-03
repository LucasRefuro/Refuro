// De Windows-uitlezing: één regel plakken in PowerShell in plaats van een .bat
// downloaden. Bewaakt het script (refurbish/uitlezen.ps1), hoe Vercel het serveert,
// en de regel die de testpagina geeft.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');

/* Stopt de test zonder process.exit (een belofte die nooit oplost), dan liep node
   vroeger gewoon leeg met code 0: halve test, toch groen. Nu telt dat als fout. */
process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

// ── het script zelf ──
const ps=fs.readFileSync(bron('refurbish/uitlezen.ps1'),'utf8');
const pagina=fs.readFileSync(bron('refurbish/test.html'),'utf8');
/* Windows PowerShell 5.1 leest tekst zonder BOM als Latin-1: één é en het script
   breekt op een plek waar je het niet verwacht. */
ok('script is alleen ASCII', [...ps].every(c=>c.charCodeAt(0)<128));
/* exit sluit het PowerShell-venster dat de winkelier zelf opende, dan zie je de
   uitslag nooit. Alleen in commentaar mag het woord staan. */
const code_=ps.split('\n').filter(r=>!/^\s*#/.test(r)).join('\n');
ok('geen exit in het script', !/\bexit\b/i.test(code_));
ok('geen ingevulde-sjabloonresten', !/\$\{/.test(code_));
ok('alles in één blok', /^& \{$/m.test(code_) && code_.trim().endsWith('}'));
const open_=(code_.match(/\{/g)||[]).length, dicht=(code_.match(/\}/g)||[]).length;
ok('accolades kloppen', open_===dicht);
ok('code komt van buiten', /\$code="\$code"\.Trim\(\)\.ToUpper\(\)/.test(code_));
ok('code niet als lusvariabele gebruikt', !/foreach\(\$code\b/i.test(code_));
ok('code gaat mee in het bericht', /\$body=@\{ code=\$code \}/.test(code_));
ok('zonder code stopt hij netjes', /if\(-not \$code\)\{[\s\S]*?return/.test(code_));
ok('meldt klaar voor het .bat-vangnet', /\$global:StorvoKlaar=\$true/.test(code_) && /\$global:StorvoKlaar=\$false/.test(code_));
const sleutelPagina=(pagina.match(/const SUPABASE_ANON_KEY='([^']+)'/)||[])[1];
ok('zelfde publieke sleutel als de pagina', !!sleutelPagina && code_.includes("$sleutel='"+sleutelPagina+"'"));
ok('naar refurbish-test', /\$adres='https:\/\/ugilfxqolemxwssbpdwu\.supabase\.co\/functions\/v1\/refurbish-test'/.test(code_));
ok('leest accu uit het accurapport', /powercfg \/batteryreport/.test(code_));
ok('leest ook de specs', /Win32_Processor/.test(code_) && /Win32_PhysicalMemory/.test(code_));

// ── Vercel serveert het als tekst, anders geeft irm bytes terug en faalt iex ──
const vc=JSON.parse(fs.readFileSync(bron('vercel.json'),'utf8'));
const kop=(vc.headers||[]).find(h=>h.source==='/refurbish/uitlezen.ps1');
const ct=kop && kop.headers.find(h=>h.key.toLowerCase()==='content-type');
ok('vercel geeft het als platte tekst', !!ct && /^text\/plain/.test(ct.value));

// ── de testpagina ──
const MOCK=`<script>
Object.defineProperty(navigator,'userAgent',{get:()=>'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130.0'});
window.__klembord=[]; window.__vragen=[];
Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{ window.__klembord.push(t); }}});
window.fetch=async(u,o)=>{
  const b=JSON.parse(o.body); window.__vragen.push(b);
  const antw = b.actie==='kijken'
    ? {ok:true, apparaat:{categorie:'Laptop', merk:'HP', model:'ProBook 450 G8', code:'A0084'}}
    : {ok:true, resultaat:null};
  return {ok:true, json:async()=>antw};
};
window.supabase={createClient:()=>({})};
<\/script>`;
const html=pagina.replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, MOCK);
const dom=new JSDOM(html,{runScripts:'dangerously', url:'https://storvo.app/refurbish/test?c=a0084', pretendToBeVisual:true});
const w=dom.window;
const fouten=[]; w.onerror=(m)=>fouten.push(String(m));
const d=()=>w.document;
const REGEL="$code='A0084';[Net.ServicePointManager]::SecurityProtocol=3072;irm https://storvo.app/refurbish/uitlezen.ps1|iex";

setTimeout(async()=>{
  ok('pagina start zonder fout', fouten.length===0);
  if(fouten.length) console.log('   ', fouten.slice(0,2).join(' | '));
  ok('laptop herkend', w.eval('categorie')==='Laptop');

  w.eval('startAccu()');
  const vak=d().getElementById('testvak');
  ok('de regel staat in beeld', d().getElementById('accuregel') && d().getElementById('accuregel').textContent===REGEL);
  ok('regel met TLS 1.2 en de code', w.eval('accuRegelWin()')===REGEL);
  const kopieer=[...vak.querySelectorAll('button')].find(b=>/Kopieer de regel/.test(b.textContent));
  ok('knop om te kopieren', !!kopieer);
  ok('stappen: PowerShell openen en plakken', /typ PowerShell/.test(vak.textContent) && /Ctrl\+V/.test(vak.textContent));
  const vangnet=vak.querySelector('details.poortlees');
  ok('downloaden alleen nog als vangnet', !!vangnet && /Download het bestandje/.test(vangnet.textContent));
  ok('met de hand invullen kan nog', !!d().getElementById('accuveldL'));
  ok('geen streepjes in de tekst', !/[–—]/.test(vak.textContent));

  // ── kopieren zet de regel op het klembord en gaat wachten ──
  await w.eval('accuKopieerWin(document.querySelector("#testvak .btn.actie"))');
  ok('regel op het klembord', w.__klembord[0]===REGEL);
  ok('wacht nu op de laptop', !d().getElementById('astatus').hidden && w.eval('accuPoll!==null'));

  // ── een rare code komt er niet ongefilterd in ──
  w.eval(`code="a0'1; rm x"`);
  ok('code gefilterd', w.eval('accuRegelWin()').startsWith("$code='A01RMX';"));
  w.eval(`code="A0084"`);

  // ── het .bat-vangnet draait dezelfde regel ──
  const bat=w.eval('accuBatWindows()');
  const b64=(bat.match(/-EncodedCommand (\S+)/)||[])[1]||'';
  const uit=Buffer.from(b64,'base64').toString('utf16le');
  ok('bat draait dezelfde regel', uit===REGEL+';if($global:StorvoKlaar){exit 0}else{exit 1}');
  ok('bat ruimt zichzelf op na succes', /\(goto\) 2>nul & del "%~f0"/.test(bat));
  ok('bat heeft het script niet meer dubbel', !/powercfg/.test(bat) && !/powercfg/.test(uit));

  w.eval('if(accuPoll){ clearInterval(accuPoll); accuPoll=null; }');
  console.log(fout? '\n'+fout+' FOUTEN' : '\nalles goed');
  process.exit(fout?1:0);
},300);
