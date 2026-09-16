#!/bin/bash
# Storvo labelprinter-hulp installeren op deze Mac.
# Dubbelklik dit bestand. Het installeert alles wat nodig is om de Brother QL-800
# stil te laten printen vanuit storvo.app, precies zoals op de eerste iMac.
#
# Je hoeft niets te typen, behalve je Mac-wachtwoord als erom gevraagd wordt
# (voor Homebrew en om het lokale certificaat te vertrouwen).

set -u
cd "$HOME"
echo "════════════════════════════════════════════"
echo "  Storvo printhulp installeren"
echo "════════════════════════════════════════════"
echo

# ── 1. Homebrew ──────────────────────────────────────────────────────────────
if ! command -v brew >/dev/null 2>&1; then
  # brew kan op twee plekken staan (Apple Silicon of Intel); probeer ze te vinden
  for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    [ -x "$p" ] && eval "$($p shellenv)" && break
  done
fi
if ! command -v brew >/dev/null 2>&1; then
  echo "✗ Homebrew is niet gevonden."
  echo "  Installeer eerst Homebrew: open Terminal en plak deze regel, daarna dit script opnieuw:"
  echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  echo
  read -r -p "Druk op Enter om te sluiten."
  exit 1
fi
BREW="$(brew --prefix)"
echo "✓ Homebrew gevonden op $BREW"

# ── 2. libusb, mkcert, python ────────────────────────────────────────────────
echo
echo "→ libusb, mkcert en python installeren (kan een paar minuten duren)…"
brew install libusb mkcert nss python 2>/dev/null || brew install libusb mkcert nss python

# ── 3. Lokale CA vertrouwen (voor https in Safari en Chrome) ──────────────────
echo
echo "→ Het lokale certificaat vertrouwen. Voer je Mac-wachtwoord in als erom gevraagd wordt."
mkcert -install

# ── 4. Map en Python-omgeving ────────────────────────────────────────────────
DIR="$HOME/.storvo-print"
mkdir -p "$DIR"
PY="$BREW/bin/python3"; [ -x "$PY" ] || PY="$(command -v python3)"
echo
echo "→ Python-omgeving klaarzetten…"
"$PY" -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install --upgrade pip >/dev/null 2>&1
echo "→ brother-ql, pyusb en pillow installeren…"
"$DIR/venv/bin/pip" install brother-ql pyusb pillow

# ── 5. De printhulp zelf schrijven ───────────────────────────────────────────
echo
echo "→ Printhulp installeren…"
cat > "$DIR/helper.py" <<'PY'
#!/usr/bin/env python3
# Storvo labelprinter-hulpprogramma.
#
# Waarom dit bestaat: de Brother QL-800 CUPS-driver op deze Mac is uit 2018 (alleen x86_64/i386,
# geen arm64) en crasht op macOS 26 (Apple Silicon). Daardoor werkt printen via het normale
# printsysteem NIET, ook niet via QZ Tray (dat gaat door dezelfde kapotte driver). Dit programma
# stuurt de printer rechtstreeks aan via USB met brother_ql en slaat de driver dus helemaal over.
#
# Belangrijk: de rol DK-22251 is zwart/rood. De QL-800 eist dan de tweekleuren-modus (red=True),
# ook als je alleen zwart print. Zonder die modus knippert de printer rood. Daarom staat 'red'
# standaard aan.
#
# De browser (storvo.app, https) mag fetchen naar http://127.0.0.1 omdat localhost als "veilig"
# geldt in Chrome/Chromium. We beantwoorden ook de Private-Network-Access preflight.
#
# API (alles op http://127.0.0.1:9909):
#   GET  /status            -> { ok, breedte_mm, type, fout1, fout2, klaar }
#   POST /print  {png,label,red,cut,kopieen}  -> { ok, meldingen:[...] }
#   OPTIONS *               -> CORS + PNA preflight

import json, base64, io, time, sys, os, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VENDOR, PRODUCT = 0x04f9, 0x209b     # Brother QL-800
POORT = 9909
LOG = os.path.expanduser("~/.storvo-print/helper.log")
DOTS = {"12":106,"29":306,"38":413,"50":554,"54":590,"62":696,"62red":696}  # printbare breedte in dots

_slot = threading.Lock()             # 1 printopdracht tegelijk

def log(*a):
    m=" ".join(str(x) for x in a)
    try:
        with open(LOG,"a") as f: f.write(time.strftime("%H:%M:%S ")+m+"\n")
    except Exception: pass
    print(m, flush=True)

# ---- USB laag ----------------------------------------------------------------
import usb.core, usb.util

def _open():
    dev=usb.core.find(idVendor=VENDOR, idProduct=PRODUCT)
    if dev is None: raise RuntimeError("printer niet gevonden op USB (aan en aangesloten?)")
    try:
        if dev.is_kernel_driver_active(0): dev.detach_kernel_driver(0)
    except Exception: pass
    dev.set_configuration()
    cfg=dev.get_active_configuration(); intf=cfg[(0,0)]
    out=usb.util.find_descriptor(intf,custom_match=lambda e:usb.util.endpoint_direction(e.bEndpointAddress)==usb.util.ENDPOINT_OUT)
    inn=usb.util.find_descriptor(intf,custom_match=lambda e:usb.util.endpoint_direction(e.bEndpointAddress)==usb.util.ENDPOINT_IN)
    return dev,out,inn

def _dispose(dev):
    try: usb.util.dispose_resources(dev)
    except Exception: pass

def lees_status():
    dev,out,inn=_open()
    try:
        out.write(b'\x1b\x69\x53')       # ESC i S  -> status opvragen
        time.sleep(0.15)
        data=None
        for _ in range(8):
            try:
                data=inn.read(32,timeout=1500)
                if data: break
            except Exception: time.sleep(0.25)
        if not data: return {"ok":False,"error":"geen status terug"}
        b=list(bytes(data))
        return {"ok":True,"breedte_mm":b[10],"type":hex(b[11]),
                "fout1":b[8],"fout2":b[9],"klaar":True}
    finally:
        _dispose(dev)

def print_png(png_bytes, label="62", red=True, cut=True, kopieen=1):
    from PIL import Image
    from brother_ql.raster import BrotherQLRaster
    from brother_ql.conversion import convert
    im=Image.open(io.BytesIO(png_bytes)).convert("RGB")
    breedte=DOTS.get(label, 696)
    if im.width!=breedte:
        nh=max(1,round(im.height*breedte/im.width))
        im=im.resize((breedte,nh))
    qlr=BrotherQLRaster("QL-800"); qlr.exception_on_warning=False
    lbl="62red" if red else label
    instr=convert(qlr,[im]*max(1,int(kopieen)),lbl,red=red,cut=cut,dither=False,rotate="0")
    meldingen=[]
    with _slot:
        dev,out,inn=_open()
        try:
            CH=16384
            for i in range(0,len(instr),CH):
                out.write(instr[i:i+CH],timeout=8000)
            klaar=False; fout=None
            for _ in range(60):
                try:
                    d=inn.read(32,timeout=2000)
                except Exception:
                    continue
                b=list(bytes(d))
                if len(b)<20: continue
                st=b[18]
                if b[8] or b[9]:
                    fout=(b[8],b[9]); meldingen.append(f"fout 0x{b[8]:02x}/0x{b[9]:02x}"); break
                if st==0x01: klaar=True; meldingen.append("printen klaar"); break
                if st==0x06: meldingen.append("bezig")
            if fout:
                return {"ok":False,"error":"printer meldde een fout","meldingen":meldingen,
                        "fout1":fout[0],"fout2":fout[1]}
            return {"ok":True,"meldingen":meldingen or ["verzonden"],"bytes":len(instr)}
        finally:
            _dispose(dev)

# ---- HTTP laag ---------------------------------------------------------------
class H(BaseHTTPRequestHandler):
    def _cors(self, status=200, body=None):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Methods","GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers","Content-Type")
        self.send_header("Access-Control-Allow-Private-Network","true")
        self.send_header("Content-Type","application/json")
        self.end_headers()
        if body is not None: self.wfile.write(json.dumps(body).encode())
    def log_message(self, *a): pass
    def do_OPTIONS(self): self._cors(204)
    def do_GET(self):
        if self.path.startswith("/status"):
            try: self._cors(200, lees_status())
            except Exception as e: self._cors(200, {"ok":False,"error":str(e)})
        elif self.path=="/" or self.path.startswith("/ping"):
            self._cors(200, {"ok":True,"naam":"storvo-printhelper","versie":1})
        else:
            self._cors(404, {"ok":False,"error":"onbekend"})
    def do_POST(self):
        if not self.path.startswith("/print"):
            return self._cors(404, {"ok":False,"error":"onbekend"})
        try:
            n=int(self.headers.get("Content-Length","0"))
            payload=json.loads(self.rfile.read(n) or b"{}")
            png=payload.get("png","")
            if "," in png: png=png.split(",",1)[1]   # data:image/png;base64,....
            png_bytes=base64.b64decode(png)
            res=print_png(png_bytes,
                          label=str(payload.get("label","62")),
                          red=bool(payload.get("red",True)),
                          cut=bool(payload.get("cut",True)),
                          kopieen=int(payload.get("kopieen",1)))
            log("print:", res.get("ok"), res.get("meldingen"))
            self._cors(200, res)
        except Exception as e:
            log("print-fout:", repr(e))
            self._cors(200, {"ok":False,"error":str(e)})

def main():
    srv=ThreadingHTTPServer(("127.0.0.1",POORT), H)
    # HTTPS als het certificaat er is (nodig voor Safari en de dock-app; Chrome werkt ook op http,
    # maar https werkt overal). Certificaat via mkcert, vertrouwd in de login-sleutelbos.
    cert=os.path.expanduser("~/.storvo-print/cert.pem")
    key=os.path.expanduser("~/.storvo-print/key.pem")
    schema="http"
    if os.path.exists(cert) and os.path.exists(key):
        import ssl
        ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        srv.socket=ctx.wrap_socket(srv.socket, server_side=True)
        schema="https"
    log("Storvo printhelper start op %s://127.0.0.1:%d" % (schema, POORT))
    srv.serve_forever()

if __name__=="__main__":
    main()
PY

# ── 6. Certificaat maken (zodat https://127.0.0.1:9909 vertrouwd is) ──────────
echo
echo "→ Certificaat maken…"
( cd "$DIR" && mkcert -cert-file cert.pem -key-file key.pem 127.0.0.1 localhost )

# ── 7. Automatisch starten (LaunchAgent) ─────────────────────────────────────
PLIST="$HOME/Library/LaunchAgents/app.storvo.printhelper.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>app.storvo.printhelper</string>
    <key>ProgramArguments</key>
    <array>
        <string>$DIR/venv/bin/python</string>
        <string>$DIR/helper.py</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>DYLD_LIBRARY_PATH</key>
        <string>$BREW/lib</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$DIR/helper.out</string>
    <key>StandardErrorPath</key>
    <string>$DIR/helper.err</string>
</dict>
</plist>
PLIST

# ── 8. Starten ───────────────────────────────────────────────────────────────
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
sleep 2

# ── 9. Testen ────────────────────────────────────────────────────────────────
echo
echo "→ Testen of de printhulp draait…"
if curl -sk https://127.0.0.1:9909/ping | grep -q storvo-printhelper; then
  echo
  echo "════════════════════════════════════════════"
  echo "  ✓ KLAAR. De printhulp draait."
  echo "════════════════════════════════════════════"
  echo
  echo "Nog even doen aan de printer:"
  echo "  1. Sluit de Brother QL-800 met de USB-kabel op deze Mac aan."
  echo "  2. Zet Editor Lite UIT: houd de Editor-Lite-knop op de printer ~2 sec"
  echo "     ingedrukt tot het groene lampje ernaast UITgaat. (Anders ziet de Mac"
  echo "     hem als USB-stick en kan er niet geprint worden.)"
  echo "  3. Zorg dat de zwart/rode DK-22251-rol erin zit."
  echo
  echo "Dan: open storvo.app in Chrome of Safari, ga naar een label en print."
  echo "Test de verbinding via Meer → Labelprinter → Verbinding testen."
else
  echo
  echo "✗ De printhulp reageert nog niet. Kijk in het logbestand:"
  echo "  $DIR/helper.err"
fi
echo
read -r -p "Druk op Enter om dit venster te sluiten."
