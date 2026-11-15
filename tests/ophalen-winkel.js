// Waar ligt het toestel dat de klant krijgt: in de winkel of op kantoor?
//
// De webshop beloofde "Morgen ophalen in onze winkel" zodra er één toestel van een product in de
// winkel lag, ook als het toestel dat deze klant krijgt op kantoor lag (eigenaar, november 2026:
// een Dell Latitude met drie in de winkel en twee op kantoor). Nu zet de sync per toestel in de
// wachtrij of het in de winkel ligt, en rekent het thema van kantoor een openingsdag later.
// Bewaakt:
//   1. gradeWachtrij zet per exemplaar winkel ja of nee, alleen als de locaties meekomen
//   2. de sync vraagt de winkellocaties één keer op en geeft ze aan de wachtrij en het product
//   3. "alles opnieuw" mag alleen voor de eigenaar of de cron, en slaat advertenties zonder
//      voorraad over (daar zou een sync "net verkocht" kunnen veranderen)
const fs=require('fs');
const path=require('path');

process.on('beforeExit', ()=>{ console.log('FOUT test stopte voor het einde'); process.exit(1); });

const bron=n=>path.join(__dirname,'..',n);
let fout=0;
const ok=(n,c)=>{ console.log((c?'ok   ':'FOUT ')+n); if(!c) fout++; };

const sh=fs.readFileSync(bron('supabase/functions/_gedeeld/shopify.ts'),'utf8');
const idx=fs.readFileSync(bron('supabase/functions/shopify/index.ts'),'utf8');

// ── 1. de wachtrij, echt uitgevoerd ──
// De functie uit het bestand halen en zonder types draaien, met eenvoudige stand-ins voor de
// accu en de staattekst (die hebben hun eigen tests).
const begin=sh.indexOf('export function gradeWachtrij(');
let diepte=0, eind=-1;
for(let i=sh.indexOf('{', begin); i<sh.length; i++){
  if(sh[i]==='{') diepte++;
  else if(sh[i]==='}'){ diepte--; if(!diepte){ eind=i+1; break; } }
}
const tekst=sh.slice(begin, eind)
  .replace('export function','function')
  .replace(/: any\[\]|: Record<string, any>|\?: Set<string>|: any/g,'');
const gradeWachtrij=new Function('accuVan','staatToelichting', tekst+'; return gradeWachtrij;')(
  ()=>({accu:90, nieuw:false, cycli:null}), ()=>'tekst');
const rij=[
  {id:'b', code:'A0137', locatie_id:'kantoor', aangemaakt_op:'2026-11-15T22:09:00Z'},
  {id:'a', code:'A0136', locatie_id:'winkel', aangemaakt_op:'2026-11-15T22:05:00Z'},
  {id:'c', code:'A0139', locatie_id:null, aangemaakt_op:'2026-11-15T22:20:00Z'}
];
const uit=gradeWachtrij(rij, {}, new Set(['winkel']));
ok('wachtrij: oudste eerst, zoals de webhook bindt', uit.map(x=>x.code).join()==='A0136,A0137,A0139');
ok('wachtrij: per toestel of hij in de winkel ligt', uit.map(x=>x.winkel).join()==='true,false,false');
ok('wachtrij: zonder locaties geen veld (thema valt terug op het product)', gradeWachtrij(rij, {}).every(x=>!('winkel' in x)));

// ── 2. de sync ──
ok('sync: winkellocaties één keer per advertentie, soort winkel', /async function winkelLocaties\(teamId: string\)/.test(idx) &&
  /\.eq\("soort", "winkel"\)/.test(idx) && /const winkelIds = await winkelLocaties\(teamId\)/.test(idx));
ok('sync: geen vraag per toestel meer', !/ligtInWinkel/.test(idx));
ok('sync: de wachtrij krijgt de locaties mee', /gradeWachtrij\(perGrade\[g\] \|\| \[\], controles, winkelIds\)/.test(idx));
ok('sync: het product blijft "ligt er één in de winkel"', /const inWinkel = beschikbaar\.some\(/.test(idx) && /bouwProductMetafields\(rep, controle, inWinkel\)/.test(idx));

// ── 3. alles opnieuw ──
const alles=idx.slice(idx.indexOf('async function allesSynchroniseren'), idx.indexOf('Deno.serve('));
ok('alles: slaat een advertentie zonder voorraad over', /\.eq\("status", "voorraad"\)/.test(alles) && /overgeslagen: "geen voorraad"/.test(alles));
ok('alles: in porties, met waar je verder moet', /lijst\.slice\(vanaf, vanaf \+ aantal\)/.test(alles) && /volgende:/.test(alles));
const serve=idx.slice(idx.indexOf('Deno.serve('));
ok('alles: de cron mag alleen "alles"', /x-cron-secret/.test(serve) && /cl\?\.actie !== "alles"/.test(serve));
ok('alles: ingelogd alleen eigenaar of beheerder', /actie === "alles"[\s\S]{0,120}\["eigenaar", "beheerder"\]\.includes/.test(serve));

console.log(fout? '\n'+fout+' FOUTEN' : '\nophalen per winkel in orde');
process.exit(fout?1:0);
