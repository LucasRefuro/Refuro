// Een reservering annuleren of laten vervallen zet de webshopvoorraad weer goed.
//
// Aanleiding: A0084 stond in Storvo op voorraad, maar Shopify noemde hem uitverkocht. De
// test-reservering was buiten de edge om geannuleerd, en de edge zelf had drie zwakke plekken:
// 1. Een fout bij Shopify werd alleen gelogd, en de winkelapp zei toch "weer online".
// 2. De variant uit de reservering kon verouderd zijn (advertentie opnieuw aangemaakt); dan
//    gebeurde er stil niets en hing het toestel aan een variant die niet meer bestaat.
// 3. Vervallen liep alleen als iemand de lijst in de winkelapp opende.
// Deze test bewaakt dat de voorraad van PRECIES die grade-variant goed komt, en niets anders.
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const LOC='gid://shopify/Location/9';

/* Een nagebootste winkel: Shopify (varianten met voorraad, producten met status) en de
   hardwaretabel van Storvo, met dezelfde telling als de edge (status voorraad + variant). */
function nepWinkel({varianten, producten, hardware, registratie, mutatieFout}){
  const vragen=[];
  const gql=async (q, v)=>{
    vragen.push({q, v});
    if(/inventorySetQuantities/.test(q)){
      if(mutatieFout) return {inventorySetQuantities:{userErrors:[{field:['x'],message:'kapot'}]}};
      for(const r of v.input.quantities){
        const vv=Object.values(varianten).find(x=>x.item===r.inventoryItemId);
        if(vv.aantal!==r.changeFromQuantity) return {inventorySetQuantities:{userErrors:[{message:'aantal klopt niet'}]}};
        vv.aantal=r.quantity;
      }
      return {inventorySetQuantities:{userErrors:[]}};
    }
    if(/productUpdate/.test(q)){ producten[v.p.id]=v.p.status; return {productUpdate:{product:v.p,userErrors:[]}}; }
    if(/productVariant\(id/.test(q)){
      const vv=varianten[v.id];
      if(!vv) return {productVariant:null};
      return {productVariant:{product:{id:vv.product,status:producten[vv.product]},
        inventoryItem:{id:vv.item,inventoryLevel:{quantities:[{name:'available',quantity:vv.aantal}]}}}};
    }
    throw new Error('onverwachte vraag: '+q);
  };
  const deps={
    gql, locatieId:LOC,
    registratie: async s=>registratie[s]||null,
    hardware: async id=>hardware.find(h=>h.id===id)||null,
    herkoppel: async (id,kanalen)=>{ hardware.find(h=>h.id===id).kanalen=kanalen; },
    tel: async v=>hardware.filter(h=>h.status==='voorraad' && h.kanalen?.shopify?.variant===v).length,
  };
  return {deps, vragen};
}
const hw=(id,grade,variant,status='voorraad',product='P1')=>({id,status,kanalen:{shopify:{id:product,variant,grade,sleutel:'s1'}}});
const res=(id,hardware_id,grade,variant_id)=>({id,hardware_id,sleutel:'s1',grade,variant_id,product_id:'P1'});

(async()=>{
  const m=await import('file://'+bron('supabase/functions/reservering/voorraad.ts'));

  // ── 1. gewoon annuleren: precies die grade terug, de andere grade niet aangeraakt ──
  {
    const varianten={VA:{product:'P1',item:'IA',aantal:0}, VB:{product:'P1',item:'IB',aantal:1}};
    const w=nepWinkel({varianten, producten:{P1:'ACTIVE'},
      hardware:[hw('H1','A','VA'), hw('H2','B','VB')], registratie:{s1:{product_id:'P1',varianten:{A:'VA',B:'VB'}}}});
    const u=await m.herstelNaVrijgeven(w.deps, res('R1','H1','A','VA'));
    ok('annuleren: uitkomst ok', u.ok===true && u.melding===null);
    ok('annuleren: Uitstekend weer 1 op de webshop', varianten.VA.aantal===1);
    ok('annuleren: Zeer goed niet aangeraakt', varianten.VB.aantal===1 && !w.vragen.some(x=>/inventorySetQuantities/.test(x.q) && x.v.input.quantities.some(q=>q.inventoryItemId==='IB')));
    const mut=w.vragen.find(x=>/inventorySetQuantities/.test(x.q));
    ok('mutatie met @idempotent, sleutel en changeFromQuantity', /@idempotent\(key: \$key\)/.test(mut.q)
       && typeof mut.v.key==='string' && mut.v.input.quantities[0].changeFromQuantity===0
       && mut.v.input.quantities[0].locationId===LOC);
    ok('actief product niet opnieuw op actief gezet', !w.vragen.some(x=>/productUpdate/.test(x.q)));
  }
  // ── 2. stond al goed: niets sturen ──
  {
    const varianten={VA:{product:'P1',item:'IA',aantal:1}};
    const w=nepWinkel({varianten, producten:{P1:'ACTIVE'}, hardware:[hw('H1','A','VA')], registratie:{}});
    const u=await m.herstelNaVrijgeven(w.deps, res('R1','H1','A','VA'));
    ok('al goed: ok en geen mutatie', u.ok && !w.vragen.some(x=>/mutation/.test(x.q)));
  }
  // ── 3. advertentie intussen opnieuw aangemaakt: toestel naar de nieuwe variant ──
  {
    const varianten={VA2:{product:'P2',item:'IA2',aantal:0}};
    const hardware=[hw('H1','A','VA')];
    const w=nepWinkel({varianten, producten:{P2:'ACTIVE'}, hardware, registratie:{s1:{product_id:'P2',varianten:{A:'VA2'}}}});
    const u=await m.herstelNaVrijgeven(w.deps, res('R1','H1','A','VA'));
    ok('nieuwe advertentie: toestel hangt nu aan de nieuwe variant', hardware[0].kanalen.shopify.variant==='VA2'
       && hardware[0].kanalen.shopify.id==='P2' && hardware[0].kanalen.shopify.nummer==='P2');
    ok('nieuwe advertentie: de rest van de koppeling blijft', hardware[0].kanalen.shopify.sleutel==='s1' && hardware[0].kanalen.shopify.grade==='A');
    ok('nieuwe advertentie: voorraad op de nieuwe variant', u.ok && varianten.VA2.aantal===1);
  }
  // ── 4. product stond op niet vermeld of concept: weer actief ──
  for(const st of ['UNLISTED','DRAFT']){
    const varianten={VA:{product:'P1',item:'IA',aantal:0}};
    const producten={P1:st};
    const w=nepWinkel({varianten, producten, hardware:[hw('H1','A','VA')], registratie:{}});
    const u=await m.herstelNaVrijgeven(w.deps, res('R1','H1','A','VA'));
    ok('stond op '+st+': weer actief', u.ok && u.geactiveerd===true && producten.P1==='ACTIVE');
    const iV=w.vragen.findIndex(x=>/inventorySetQuantities/.test(x.q)), iS=w.vragen.findIndex(x=>/productUpdate/.test(x.q));
    ok('stond op '+st+': eerst voorraad, dan zichtbaar', iV>=0 && iS>iV);
  }
  {
    // Niets meer op voorraad (toestel intussen verkocht): niet weer zichtbaar maken.
    const varianten={VA:{product:'P1',item:'IA',aantal:0}};
    const producten={P1:'UNLISTED'};
    const w=nepWinkel({varianten, producten, hardware:[hw('H1','A','VA','verkocht')], registratie:{}});
    const u=await m.herstelNaVrijgeven(w.deps, res('R1','H1','A','VA'));
    ok('intussen verkocht: blijft 0 en niet vermeld', u.ok && varianten.VA.aantal===0 && producten.P1==='UNLISTED');
  }
  // ── 5. twee verlopen reserveringen van dezelfde grade, na elkaar ──
  {
    const varianten={VA2:{product:'P2',item:'IA2',aantal:0}};
    const hardware=[hw('H1','A','VA'), hw('H2','A','VA')];
    const w=nepWinkel({varianten, producten:{P2:'ACTIVE'}, hardware, registratie:{s1:{product_id:'P2',varianten:{A:'VA2'}}}});
    await m.herstelNaVrijgeven(w.deps, res('R1','H1','A','VA'));
    await m.herstelNaVrijgeven(w.deps, res('R2','H2','A','VA'));
    ok('twee vervallen: allebei aan de nieuwe variant', hardware.every(h=>h.kanalen.shopify.variant==='VA2'));
    ok('twee vervallen: voorraad 2', varianten.VA2.aantal===2);
  }
  // ── 6. wat er mis kan gaan, komt terug als zin ──
  {
    const w=nepWinkel({varianten:{}, producten:{}, hardware:[hw('H1','A','VA')], registratie:{}});
    const geen={...w.deps, gql:null};
    ok('geen webshop: melding', (await m.herstelNaVrijgeven(geen, res('R1','H1','A','VA'))).melding===m.MELDING.geenWebshop);
    const zonderLoc={...w.deps, locatieId:null};
    ok('geen locatie: melding', (await m.herstelNaVrijgeven(zonderLoc, res('R1','H1','A','VA'))).melding===m.MELDING.geenLocatie);
    const u=await m.herstelNaVrijgeven(w.deps, res('R1','H1','A','VA'));
    ok('variant bestaat niet meer en geen registratie: niet ok, met uitleg', u.ok===false && u.melding===m.MELDING.nietGevonden);
  }
  {
    const varianten={VA:{product:'P1',item:'IA',aantal:0}};
    const w=nepWinkel({varianten, producten:{P1:'ACTIVE'}, hardware:[hw('H1','A','VA')], registratie:{}, mutatieFout:true});
    let gegooid=false;
    try{ await m.herstelNaVrijgeven(w.deps, res('R1','H1','A','VA')); }catch(e){ gegooid=/voorraad/i.test(e.message); }
    ok('Shopify weigert: een fout met uitleg, niet stil', gegooid);
  }

  // ── 7. de edge zelf (bron gelezen; index.ts heeft Deno-imports) ──
  const idx=fs.readFileSync(bron('supabase/functions/reservering/index.ts'),'utf8');
  const stuk=(van,tot)=>idx.slice(idx.indexOf(van), idx.indexOf(tot, idx.indexOf(van)));
  ok('de oude stille herstelfunctie is weg', !/herstelShopifyVoorraad|zetShopifyVoorraad/.test(idx));
  const annuleren=stuk('async function annuleren','async function verval');
  ok('annuleren herstelt met de hele reservering en geeft de uitkomst terug',
     /await herstel\(acc\.team_id, r\)/.test(annuleren) && /ok\(\{ webshop: uit\.ok, melding: uit\.melding \}\)/.test(annuleren));
  const verval=stuk('async function verval','Deno.serve(');
  ok('vervallen herstelt per reservering, niet een keer per variant',
     /for \(const r of lijst\) \{\s*if \(!r\.variant_id && !r\.sleutel\) continue;\s*const uit = await herstel\(teamId, r\);/.test(verval));
  const serve=idx.slice(idx.indexOf('Deno.serve('));
  ok('vervallen kan ook elk uur met het cron-geheim, zonder inlog',
     /actie === "verval" && cronGeheim && \(req\.headers\.get\("x-cron-secret"\) \|\| ""\) === cronGeheim/.test(serve)
     && serve.indexOf('cronGeheim') < serve.indexOf('wieBelt(req)'));
  ok('zonder geheim valt vervallen terug op inloggen', /if \(actie === "verval"\) return ok\(await verval\(acc\.team_id\)\);/.test(serve));
  const afrekenen=stuk('async function afrekenen','async function annuleren');
  ok('afrekenen van het laatste exemplaar: niet vermeld, zoals een balieverkoop',
     /\.in\("status", \["voorraad", "gereserveerd"\]\)/.test(afrekenen) && /zetUitverkocht\(d\.gql, d\.locatieId, reg\.product_id, "UNLISTED"\)/.test(afrekenen));

  const mig=fs.readFileSync(bron('supabase/migrations/20261103180000_reservering_verval_cron.sql'),'utf8');
  ok('geplande taak: elk uur verval met het geheim uit de vault',
     /cron\.schedule\(\s*'reservering-verval-uur',\s*'7 \* \* \* \*'/.test(mig) && /functions\/v1\/reservering/.test(mig)
     && /vault\.decrypted_secrets where name = 'mail_cron_secret'/.test(mig) && /"actie":"verval"/.test(mig));

  const app=fs.readFileSync(bron('app/index.html'),'utf8');
  ok('winkelapp zegt het als de webshop niet bijgewerkt is', /if\(okd\.webshop===false\) toast\('Geannuleerd\. '\+\(okd\.melding/.test(app));

  console.log(fout ? `\n${fout} FOUT` : '\nalles goed');
  process.removeAllListeners('beforeExit');
  process.exit(fout?1:0);
})();
