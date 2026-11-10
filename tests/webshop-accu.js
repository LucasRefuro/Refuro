// De accu op de webshop, ook voor een toestel dat los is toegevoegd.
//
// De productpagina las de accu eerst alleen van de controle op de werkbank
// (refurbish_apparaten). Een toestel dat je in de winkelapp los toevoegt heeft geen
// controle, dus zijn accu kwam nooit online. Nu gaat het via accuVan, net als per grade:
// de controle wint (daar landt een hertest), anders de accu op de hardware-rij.
const fs=require('fs');
const os=require('os');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

(async()=>{
  /* Het gedeelde bestand importeert de Supabase-client van esm.sh; die kan node niet laden
     en is voor deze functies niet nodig. Daarom een kopie met een lege stand-in. */
  const src=fs.readFileSync(bron('supabase/functions/_gedeeld/shopify.ts'),'utf8')
    .replace(/^import \{ createClient \} from .*esm\.sh.*$/m,'const createClient=()=>({});');
  // Deno.env leest de geheimen bij het laden; hier zijn die er niet en ook niet nodig.
  globalThis.Deno={env:{get:()=>''}};
  const tmp=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'storvo-')),'shopify.mts');
  fs.writeFileSync(tmp, src);
  const m=await import('file://'+tmp);

  const accu=(h,c)=>{ const r=m.bouwProductMetafields(h,c,true).find(x=>x.key==='accu_gezondheid'); return r?Number(r.value):null; };
  const los={merk:'HP', model:'EliteBook 840 G8', garantie:24, accu:87};
  ok('los toegevoegd: accu komt op de webshop', accu(los,null)===87);
  ok('controle gaat voor de hardware-rij', accu(los,{accu:79})===79);
  ok('nieuwe accu telt als 100%', accu({...los, accu:null, nieuwe_accu:true},null)===100);
  ok('geen meting: geen accu, geen 0', accu({...los, accu:null},null)===null);
  ok('garantie van 24 maanden gaat mee',
    m.bouwProductMetafields(los,null,true).some(x=>x.key==='garantie_maanden' && x.value==='24'));

  console.log(fout? '\n'+fout+' FOUTEN' : '\nwebshop-accu in orde');
  process.exit(fout?1:0);
})().catch(e=>{ console.log('FOUT', e.message); process.exit(1); });
