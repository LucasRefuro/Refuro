/* ═══════════════ STORVO · SCANNEN MET DE CAMERA ═══════════════
   Twee stappen, in deze volgorde:

   1. Een foto van het doosje. Daar leest Storvo uit wat voor product het is.
      We gebruiken hiervoor de gewone camera van de telefoon, via een
      bestandsknop. Dat werkt op elke telefoon en vraagt geen toestemming
      vooraf, wat op een iPhone een hoop gedoe scheelt.

   2. De streepjescode. Die kijkt live mee door de camera. Android kan dat
      zelf met BarcodeDetector; op een iPhone laden we er een leesbibliotheek
      bij. Lukt het scannen niet, dan kun je de code altijd nog intypen.

   Dit bestand kent de winkel niet en praat met niemand. Het geeft alleen
   terug wat het gezien heeft. Wat daarmee gebeurt bepaalt de pagina die het
   gebruikt.
   ═══════════════════════════════════════════════════════════════ */

(function(){
'use strict';

const LEESBIB='https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';

/* ---------- foto kleiner maken ----------
   Een verse telefoonfoto is al gauw vier megabyte. Dat is te zwaar om door
   te sturen en de herkenning wordt er geen haar beter van. We schalen terug
   naar duizend pixels en persen hem in JPEG. Blijft hij te groot, dan gaat
   er nog een slag overheen.                                                */
function kleiner(bestand, maxZij, kwaliteit){
  return new Promise((klaar, mis)=>{
    const lezer=new FileReader();
    lezer.onerror=()=>mis(new Error('Foto kon niet gelezen worden'));
    lezer.onload=()=>{
      const beeld=new Image();
      beeld.onerror=()=>mis(new Error('Foto kon niet geopend worden'));
      beeld.onload=()=>{
        const schaal=Math.min(1, maxZij/Math.max(beeld.width, beeld.height));
        const c=document.createElement('canvas');
        c.width =Math.round(beeld.width *schaal);
        c.height=Math.round(beeld.height*schaal);
        c.getContext('2d').drawImage(beeld,0,0,c.width,c.height);
        klaar(c.toDataURL('image/jpeg', kwaliteit));
      };
      beeld.src=lezer.result;
    };
    lezer.readAsDataURL(bestand);
  });
}
async function fotoKlein(bestand){
  let d=await kleiner(bestand, 1000, .6);
  if(d.length > 190000) d=await kleiner(bestand, 800, .45);
  if(d.length > 190000) d=await kleiner(bestand, 640, .4);
  return d;
}

/* ---------- de leesbibliotheek pas laden als het nodig is ---------- */
let bibBezig=null;
function laadBib(){
  if(window.Html5Qrcode) return Promise.resolve(true);
  if(bibBezig) return bibBezig;
  bibBezig=new Promise(klaar=>{
    const s=document.createElement('script');
    s.src=LEESBIB;
    s.onload =()=>klaar(!!window.Html5Qrcode);
    s.onerror=()=>klaar(false);
    document.head.appendChild(s);
  });
  return bibBezig;
}

/* ---------- streepjescode live lezen ---------- */
const SOORTEN=['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf'];

function eigenLezer(){
  /* Android en de nieuwere Chrome kunnen dit zelf, zonder bibliotheek. */
  if(!('BarcodeDetector' in window)) return null;
  try{ return new window.BarcodeDetector({formats:SOORTEN}); }catch(e){ return null; }
}

function maakLezer(){
  let stroom=null, video=null, bezig=false, lezer=null, hqr=null, lus=null;

  async function startEigen(houder, opCode){
    lezer=eigenLezer();
    if(!lezer) return false;
    try{
      stroom=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
    }catch(e){ return false; }
    video=document.createElement('video');
    video.setAttribute('playsinline','');   /* iOS speelt anders schermvullend */
    video.muted=true; video.srcObject=stroom;
    houder.innerHTML=''; houder.appendChild(video);
    await video.play();
    bezig=true;
    const kijk=async()=>{
      if(!bezig) return;
      try{
        const treffers=await lezer.detect(video);
        if(treffers && treffers.length){
          const code=String(treffers[0].rawValue||'').trim();
          if(code){ opCode(code); return; }
        }
      }catch(e){ /* een enkel mislukt beeldje is niet erg */ }
      lus=setTimeout(kijk, 200);
    };
    kijk();
    return true;
  }

  async function startBib(houder, opCode){
    const er=await laadBib();
    if(!er) return false;
    houder.innerHTML='<div id="scanCam" style="width:100%"></div>';
    hqr=new window.Html5Qrcode('scanCam', {formatsToSupport:undefined, verbose:false});
    try{
      await hqr.start({facingMode:'environment'},
        {fps:10, qrbox:{width:260, height:170}},
        tekst=>{ const c=String(tekst||'').trim(); if(c) opCode(c); },
        ()=>{});
      bezig=true;
      return true;
    }catch(e){ hqr=null; return false; }
  }

  return {
    async start(houder, opCode){
      if(await startEigen(houder, opCode)) return 'camera';
      if(await startBib(houder, opCode))   return 'camera';
      return 'geen';
    },
    async stop(){
      bezig=false;
      if(lus){ clearTimeout(lus); lus=null; }
      if(stroom){ stroom.getTracks().forEach(t=>t.stop()); stroom=null; }
      if(video){ video.pause(); video.srcObject=null; video=null; }
      if(hqr){ try{ await hqr.stop(); await hqr.clear(); }catch(e){} hqr=null; }
    }
  };
}

/* ---------- foto's die zichzelf maken ----------
   Een knop indrukken, dan nog een keer "gebruik foto" bevestigen: dat zijn
   twee handelingen te veel als je vijftig doosjes moet inboeken. Daarom kijkt
   de camera zelf mee.

   Hij let op twee dingen. Beweegt het beeld nog? En is het scherp genoeg om
   de tekst op het doosje te kunnen lezen? Pas als het een halve seconde stil
   én scherp is gaat hij af. Zo krijg je geen bewogen foto van je eigen schoen.

   Wat scherp is verschilt per winkel en per licht, dus we ijken onderweg:
   we onthouden het scherpste beeld dat we tot nu toe zagen en leggen de lat
   daar net onder. En er zit altijd een knop naast om het zelf te doen.     */

const RUSTIG   = 2.6;    /* gemiddeld verschil tussen twee beeldjes  */
const SCHERP   = 6;      /* ondergrens, ook als het licht slecht is  */
const NODIG    = 4;      /* zoveel metingen achter elkaar goed       */
const AANLOOP  = 1200;   /* niet meteen afgaan, je richt nog         */

function grijs(beeld){
  const d=beeld.data, n=d.length/4, g=new Uint8Array(n);
  for(let i=0;i<n;i++) g[i]=(d[i*4]*0.299 + d[i*4+1]*0.587 + d[i*4+2]*0.114)|0;
  return g;
}
function scherpte(g, breed, hoog){
  let som=0, n=0;
  for(let y=1;y<hoog-1;y++){
    for(let x=1;x<breed-1;x++){
      const i=y*breed+x;
      som += Math.abs(g[i]-g[i+1]) + Math.abs(g[i]-g[i+breed]);
      n+=2;
    }
  }
  return n ? som/n : 0;
}
function beweging(a, b){
  if(!a || !b || a.length!==b.length) return 999;
  let som=0;
  for(let i=0;i<a.length;i+=3) som+=Math.abs(a[i]-b[i]);
  return som/(a.length/3);
}

function maakFotoLezer(){
  let stroom=null, video=null, lus=null, bezig=false;
  let vorige=null, goed=0, best=0, begonnen=0, klaarmelder=null;
  const meet=document.createElement('canvas');
  meet.width=160; meet.height=120;
  const mc=meet.getContext('2d', {willReadFrequently:true});

  function knipsel(){
    const zij=Math.max(video.videoWidth, video.videoHeight)||1000;
    const schaal=Math.min(1, 1000/zij);
    const c=document.createElement('canvas');
    c.width =Math.round(video.videoWidth *schaal);
    c.height=Math.round(video.videoHeight*schaal);
    c.getContext('2d').drawImage(video,0,0,c.width,c.height);
    return c.toDataURL('image/jpeg', .6);
  }

  function afgaan(){
    if(!bezig) return;
    bezig=false;
    if(lus){ clearTimeout(lus); lus=null; }
    const beeld=knipsel();
    if(klaarmelder) klaarmelder(beeld);
  }

  function kijk(opStand){
    if(!bezig) return;
    try{
      mc.drawImage(video,0,0,meet.width,meet.height);
      const g=grijs(mc.getImageData(0,0,meet.width,meet.height));
      const s=scherpte(g, meet.width, meet.height);
      const b=beweging(g, vorige);
      vorige=g;
      if(s>best) best=s;

      const stil  = b < RUSTIG;
      const helder= s >= Math.max(SCHERP, best*0.72);
      const mag   = Date.now()-begonnen > AANLOOP;

      if(stil && helder && mag) goed++; else goed=0;
      if(opStand) opStand(!mag ? 'richten' : !stil ? 'beweegt' : !helder ? 'wazig' : 'bijna',
                          Math.min(1, goed/NODIG));

      if(goed>=NODIG){ afgaan(); return; }
    }catch(e){ /* een mislukt beeldje slaan we over */ }
    lus=setTimeout(()=>kijk(opStand), 150);
  }

  return {
    async start(houder, opFoto, opStand){
      klaarmelder=opFoto;
      try{
        stroom=await navigator.mediaDevices.getUserMedia({
          video:{facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:960}}
        });
      }catch(e){ return false; }
      video=document.createElement('video');
      video.setAttribute('playsinline','');
      video.muted=true; video.srcObject=stroom;
      houder.innerHTML=''; houder.appendChild(video);
      try{ await video.play(); }catch(e){ return false; }
      bezig=true; goed=0; best=0; vorige=null; begonnen=Date.now();
      kijk(opStand);
      return true;
    },
    nu(){ afgaan(); },                    /* zelf afdrukken */
    async stop(){
      bezig=false;
      if(lus){ clearTimeout(lus); lus=null; }
      if(stroom){ stroom.getTracks().forEach(t=>t.stop()); stroom=null; }
      if(video){ video.pause(); video.srcObject=null; video=null; }
    }
  };
}

window.StorvoScan={ fotoKlein, maakLezer, maakFotoLezer, laadBib };

})();
