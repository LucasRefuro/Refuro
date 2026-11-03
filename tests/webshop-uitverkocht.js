// Het laatste exemplaar van een advertentie verkocht.
//
// Vroeger gooide de edge `shopify` het product dan weg. Wie de pagina open had of de link
// bewaard had, kreeg een foutpagina, en het thema kon daar geen vergelijkbaar toestel meer
// aanraden. Nu blijft het product staan: voorraad 0, status "niet vermeld" (uit de lijsten),
// en het thema toont "Net verkocht" met alternatieven. Wat deze test bewaakt:
// 1. Welke status het product krijgt: verkocht = niet vermeld, zelf offline gehaald = concept,
//    nog een open reservering = gewoon actief (die kan vervallen).
// 2. Dat de voorraad eerst op 0 gaat en pas dan de status. Andersom kan een fout halverwege
//    een product achterlaten dat nog te koop is.
// 3. Dat de inventory-mutatie de eisen van API 2026-07 haalt (changeFromQuantity en
//    @idempotent), anders weigert Shopify hem en blijft het toestel te koop staan.
// 4. Dat de sync het product niet meer weggooit en dezelfde uitvoering het oude product
//    terugkrijgt, of een nieuw als iemand het in Shopify met de hand verwijderd heeft.
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

// Een nagebootste Shopify: onthoudt elke vraag en geeft het product terug dat je hem geeft.
function nepShopify(product, opties={}){
  const vragen=[];
  const gql=async (query, vars)=>{
    vragen.push({query, vars});
    if(/inventorySetQuantities/.test(query)){
      return {inventorySetQuantities:{userErrors: opties.voorraadFout ? [{field:['x'],message:'kapot'}] : []}};
    }
    if(/productUpdate/.test(query)) return {productUpdate:{product:{id:vars.p.id,status:vars.p.status},userErrors:[]}};
    if(/product\(id/.test(query)) return {product: product};
    throw new Error('onverwachte vraag: '+query);
  };
  return {gql, vragen};
}
const variant=(n,aantal)=>({id:'gid://shopify/ProductVariant/'+n,
  inventoryItem:{id:'gid://shopify/InventoryItem/'+n,
    inventoryLevel: aantal===null ? null : {quantities:[{name:'available',quantity:aantal}]}}});

(async()=>{
  const u=await import('file://'+bron('supabase/functions/shopify/uitverkocht.ts'));

  // ── 1. de status ──
  ok('verkocht wordt niet vermeld', u.statusNaLaatste({verkocht:true, gereserveerd:0})==='UNLISTED');
  ok('zelf offline gehaald wordt concept', u.statusNaLaatste({verkocht:false, gereserveerd:0})==='DRAFT');
  ok('een open reservering houdt hem actief', u.statusNaLaatste({verkocht:true, gereserveerd:1})==='ACTIVE'
     && u.statusNaLaatste({verkocht:false, gereserveerd:2})==='ACTIVE');

  // ── 2 en 3. voorraad op 0, dan de status ──
  {
    const p={id:'gid://shopify/Product/1', status:'ACTIVE', variants:{nodes:[variant(1,1), variant(2,0), variant(3,-1), variant(4,null)]}};
    const s=nepShopify(p);
    const r=await u.zetUitverkocht(s.gql, 'gid://shopify/Location/9', p.id, 'UNLISTED');
    ok('product bestaat', r.bestaat===true);
    const iVoorraad=s.vragen.findIndex(v=>/inventorySetQuantities/.test(v.query));
    const iStatus=s.vragen.findIndex(v=>/productUpdate/.test(v.query));
    ok('eerst de voorraad, dan de status', iVoorraad>0 && iStatus>iVoorraad);
    const mut=s.vragen[iVoorraad];
    ok('mutatie heeft @idempotent met een sleutel', /@idempotent\(key: \$key\)/.test(mut.query) && typeof mut.vars.key==='string' && mut.vars.key.length>10);
    const regels=mut.vars.input.quantities;
    ok('alleen wat niet op 0 staat, ook een min-voorraad', regels.length===2
       && regels.some(q=>q.inventoryItemId.endsWith('/1') && q.changeFromQuantity===1)
       && regels.some(q=>q.inventoryItemId.endsWith('/3') && q.changeFromQuantity===-1));
    ok('alles naar 0 op de winkellocatie', regels.every(q=>q.quantity===0 && q.locationId==='gid://shopify/Location/9'));
    ok('status niet vermeld', s.vragen[iStatus].vars.p.status==='UNLISTED' && s.vragen[iStatus].vars.p.id===p.id);
    ok('productUpdate met product:, niet het oude input:', /productUpdate\(product: \$p\)/.test(s.vragen[iStatus].query));
  }
  {
    // Al op 0 en al niet vermeld: niets te doen, dus ook niets sturen.
    const p={id:'gid://shopify/Product/2', status:'UNLISTED', variants:{nodes:[variant(1,0), variant(2,0)]}};
    const s=nepShopify(p);
    const r=await u.zetUitverkocht(s.gql, 'gid://shopify/Location/9', p.id, 'UNLISTED');
    ok('al uitverkocht: geen mutaties', r.bestaat && s.vragen.length===1);
  }
  {
    // Met de hand verwijderd in Shopify.
    const s=nepShopify(null);
    const r=await u.zetUitverkocht(s.gql, 'gid://shopify/Location/9', 'gid://shopify/Product/3', 'UNLISTED');
    ok('weg in Shopify: bestaat niet, geen mutaties', r.bestaat===false && s.vragen.length===1);
  }
  {
    // Geen winkellocatie bekend: de voorraad kunnen we niet zetten, de status wel.
    const p={id:'gid://shopify/Product/4', status:'ACTIVE', variants:{nodes:[{id:'v', inventoryItem:{id:'i'}}]}};
    const s=nepShopify(p);
    await u.zetUitverkocht(s.gql, null, p.id, 'DRAFT');
    ok('zonder locatie geen $loc in de vraag', !/\$loc/.test(s.vragen[0].query) && !('loc' in s.vragen[0].vars));
    ok('zonder locatie wel de status', s.vragen.some(v=>/productUpdate/.test(v.query) && v.vars.p.status==='DRAFT'));
  }
  {
    // De voorraad weigert: dan ook de status niet aanraken, en hard melden.
    const p={id:'gid://shopify/Product/5', status:'ACTIVE', variants:{nodes:[variant(1,2)]}};
    const s=nepShopify(p, {voorraadFout:true});
    let gegooid=false;
    try{ await u.zetUitverkocht(s.gql, 'gid://shopify/Location/9', p.id, 'UNLISTED'); }catch(e){ gegooid=/voorraad/i.test(e.message); }
    ok('voorraadfout geeft een fout met uitleg', gegooid);
    ok('na een voorraadfout geen statuswijziging', !s.vragen.some(v=>/productUpdate/.test(v.query)));
  }
  ok('bestaatProduct ja', await u.bestaatProduct(nepShopify({id:'x'}).gql, 'x')===true);
  ok('bestaatProduct nee', await u.bestaatProduct(nepShopify(null).gql, 'x')===false);

  // ── 4. de sync zelf (bron gelezen; index.ts heeft Deno-imports) ──
  const idx=fs.readFileSync(bron('supabase/functions/shopify/index.ts'),'utf8');
  const sync=idx.slice(idx.indexOf('async function synchroniseerAdvertentie'), idx.indexOf('Deno.serve('));
  ok('de sync gooit het product niet meer weg', !/productDelete/.test(sync));
  ok('de sync gebruikt zetUitverkocht met de status uit statusNaLaatste',
     /statusNaLaatste\(/.test(sync) && /zetUitverkocht\(gql, k\.locatie_id/.test(sync));
  ok('open reserveringen tellen mee', /"status", "gereserveerd"\)\.eq\("kanalen->shopify->>sleutel", sleutel\)/.test(sync));
  ok('de registratie blijft als het product nog bestaat',
     /if \(r\.bestaat\)[\s\S]{0,300}return \{ leeg: true, bewaard: true/.test(sync));
  ok('met de hand verwijderd: opnieuw aanmaken', /bestaatProduct\(gql, reg\.product_id\)\)\) reg = null/.test(sync));
  ok('offline geeft door of het verkocht is', /synchroniseerAdvertentie\(k, acc\.team_id, sleutel, \{ verkocht: h\.status === "verkocht" \}\)/.test(idx));

  console.log(fout ? `\n${fout} FOUT` : '\nalles goed');
  process.removeAllListeners('beforeExit');
  process.exit(fout?1:0);
})();
