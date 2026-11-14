# Fabrieksfoto's van een fotomap inkaderen zoals de Galaxy S24-set (16 november 2026).
# Nodig: Python met Pillow. Inkaderen zoals de Galaxy S24-set: wit doek 3:2 (1500x1000), heel toestel gecentreerd op 80%
# van de hoogte. Close-ups (met het oog aangewezen, zie CLOSEUP) tegen de kant waar het toestel
# van de foto afloopt, of helemaal vullend als hij aan drie of vier kanten afloopt.
import os,sys,json
from PIL import Image, ImageChops, ImageDraw
W,H=1500,1000; VUL=0.80
def bleek(im):
    """Lichtgrijze achtergrond (Apple gebruikt #F5F5F7) naar wit, als een hoek grijs is."""
    w,h=im.size; px=im.load()
    grijs=[min(px[x,y]) for x,y in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)] if 236<=min(px[x,y])<252]
    if not grijs: return im
    g=min(grijs)
    lut=[v if v<220 else min(255,round(220+(v-220)*35/max(1,g-220))) for v in range(256)]
    return im.point(lut*3)
def rand_af(im):
    w,h=im.size; px=im.load()
    nietwit=lambda c: (765-sum(c))>15
    def fr(pts): return sum(1 for p in pts if nietwit(p))/len(pts)
    k={'boven':fr([px[x,0] for x in range(w)]),'onder':fr([px[x,h-1] for x in range(w)]),
       'links':fr([px[0,y] for y in range(h)]),'rechts':fr([px[w-1,y] for y in range(h)])}
    return {n for n,v in k.items() if v>0.25}
def kader(pad, closeup):
    im=bleek(Image.open(pad).convert('RGB')); w,h=im.size
    doek=Image.new('RGB',(W,H),(255,255,255))
    if not closeup:
        d=ImageChops.difference(im,Image.new('RGB',im.size,(255,255,255))).convert('L').point(lambda v:255 if v>12 else 0)
        bb=d.getbbox() or (0,0,w,h); im=im.crop(bb); w,h=im.size
        s=min(H*VUL/h, W*VUL/w)
        im=im.resize((max(1,round(w*s)),max(1,round(h*s))),Image.LANCZOS)
        doek.paste(im,((W-im.width)//2,(H-im.height)//2)); return doek,'heel'
    afg=rand_af(im)
    vert={'boven','onder'}<=afg; hor={'links','rechts'}<=afg
    vol=len(afg)>=3 or (vert and hor) or not afg
    if vol:
        # helemaal vullend: dunne randlijntjes van de bron (1 of 2 pixels) eraf
        r=max(2,round(min(w,h)*0.012)); im=im.crop((r,r,w-r,h-r)); w,h=im.size
    if vol: s=max(H/h, W/w)
    elif vert: s=H/h
    elif hor: s=W/w
    else: s=min(H/h, W/w)
    im=im.resize((max(1,round(w*s)),max(1,round(h*s))),Image.LANCZOS)
    x=0 if ('links' in afg and 'rechts' not in afg) else (W-im.width if ('rechts' in afg and 'links' not in afg) else (W-im.width)//2)
    y=0 if ('boven' in afg and 'onder' not in afg) else (H-im.height if ('onder' in afg and 'boven' not in afg) else (H-im.height)//2)
    doek.paste(im,(x,y)); return doek,'close-up '+('+'.join(sorted(afg)) or 'vol')
if __name__=='__main__':
    # Gebruik: python fotos-inkaderen.py <fotomap> <uitmap>
    # De fotomap is die van de import (per model een map, per kleur een map). In
    # storvo-hoofdfotos.json staan naast de hoofdfoto's twee lijsten bestandsnamen:
    #   closeups  foto's waar het toestel van de foto afloopt (met het oog aangewezen; een
    #             automatische herkenning haalde lichte toestellen en close-ups door elkaar)
    #   weglaten  foto's die na inkaderen alleen een egaal vlak zijn
    # De uitmap gaat daarna via Instellingen, Modellen, Map kiezen de app in (sets die er al
    # zijn worden overgeslagen: die eerst weghalen als je ze wilt vervangen).
    root,uit=sys.argv[1],sys.argv[2]; os.makedirs(uit,exist_ok=True)
    lijst=json.load(open(os.path.join(root,'storvo-hoofdfotos.json')))
    closeups=set(lijst.get('closeups',[])); weg=set(lijst.get('weglaten',[]))
    import shutil
    shutil.copy(os.path.join(root,'storvo-hoofdfotos.json'), os.path.join(uit,'storvo-hoofdfotos.json'))
    n=0
    for d,_,fs in sorted(os.walk(root)):
        for f in sorted(fs):
            if not f.lower().endswith(('.jpg','.jpeg','.png','.webp')) or f in weg: continue
            doek,soort=kader(os.path.join(d,f), f in closeups)
            doek.save(os.path.join(uit,os.path.splitext(f)[0]+'.jpg'),'JPEG',quality=88,optimize=True,progressive=True)
            n+=1
    print(n,"foto's ingekaderd naar",uit)
