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

window.StorvoScan={ fotoKlein, maakLezer, laadBib };

})();
