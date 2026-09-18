#!/usr/bin/env python3
# Storvo labelprinter-hulpprogramma (Mac en Windows, een bron).
#
# Waarom dit bestaat: op de Mac (Apple Silicon) is de Brother QL-800 CUPS-driver kapot
# (crasht), dus daar sturen we de printer RECHTSTREEKS over USB aan met brother_ql en
# slaan we de driver over. Op Windows werkt de officiele Brother-driver juist wel; daar
# sturen we dezelfde raster als een RAW-printopdracht via de driver, zonder printvenster.
# Zo blijft de printer op Windows ook voor andere programma's een gewone printer.
#
# De webapp (storvo.app) verandert niet: die POST een PNG naar 127.0.0.1:9909, precies
# zoals nu. Alleen het laatste stukje ("hoe komt het bij de printer") verschilt per OS.
#
# DK-22251 is zwart/rood. De QL-800 eist dan de tweekleuren-modus (red=True), ook als je
# alleen zwart print; anders knippert de printer rood. Daarom staat 'red' standaard aan.
#
# API (alles op 127.0.0.1:9909):
#   GET  /status                              -> { ok, ... , klaar }
#   GET  /ping                                -> { ok, naam, versie, os }
#   POST /print {png,label,red,cut,kopieen}   -> { ok, meldingen:[...] }
#   OPTIONS *                                 -> CORS + Private-Network-Access preflight

import json, base64, io, time, os, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

IS_WIN = sys.platform.startswith("win")

VENDOR, PRODUCT = 0x04f9, 0x209b     # Brother QL-800 (USB, alleen Mac-pad)
POORT = 9909
MODEL = "QL-800"
DOTS = {"12": 106, "29": 306, "38": 413, "50": 554, "54": 590, "62": 696, "62red": 696}  # printbare breedte in dots

DATADIR = os.path.join(os.path.expanduser("~"), ".storvo-print")
LOG = os.path.join(DATADIR, "helper.log")
_slot = threading.Lock()             # 1 printopdracht tegelijk


def log(*a):
    m = " ".join(str(x) for x in a)
    try:
        os.makedirs(DATADIR, exist_ok=True)
        with open(LOG, "a") as f:
            f.write(time.strftime("%H:%M:%S ") + m + "\n")
    except Exception:
        pass
    print(m, flush=True)


# ---- raster: PNG -> Brother-raster (zelfde op elk OS) -------------------------
def _raster(png_bytes, label="62", red=True, cut=True, kopieen=1):
    from PIL import Image
    from brother_ql.raster import BrotherQLRaster
    from brother_ql.conversion import convert
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    breedte = DOTS.get(label, 696)
    if im.width != breedte:
        nh = max(1, round(im.height * breedte / im.width))
        im = im.resize((breedte, nh))
    qlr = BrotherQLRaster(MODEL)
    qlr.exception_on_warning = False
    lbl = "62red" if red else label
    return convert(qlr, [im] * max(1, int(kopieen)), lbl, red=red, cut=cut, dither=False, rotate="0")


# ============================================================================
#  WINDOWS: via de officiele Brother-driver, als RAW-printopdracht (win32print)
# ============================================================================
if IS_WIN:
    import win32print

    def _win_printer():
        # De Brother QL-800 opzoeken in de Windows-printers. Valt terug op de
        # standaardprinter als de naam niet gevonden wordt.
        try:
            flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
            for pr in win32print.EnumPrinters(flags):
                naam = pr[2]
                laag = naam.lower()
                if "ql-800" in laag or ("brother" in laag and " ql" in laag):
                    return naam
        except Exception as e:
            log("printers opsommen:", repr(e))
        try:
            return win32print.GetDefaultPrinter()
        except Exception:
            return None

    def lees_status():
        naam = _win_printer()
        if not naam:
            return {"ok": False, "error": "geen Brother QL-printer gevonden. Staat de driver erop en Editor Lite uit?"}
        try:
            h = win32print.OpenPrinter(naam)
            try:
                info = win32print.GetPrinter(h, 2)
            finally:
                win32print.ClosePrinter(h)
            st = info.get("Status", 0)
            # Windows meldt hier alleen grof: 0 = klaar, anders offline/papier/fout.
            problemen = []
            if st & getattr(win32print, "PRINTER_STATUS_OFFLINE", 0x80): problemen.append("offline")
            if st & getattr(win32print, "PRINTER_STATUS_PAPER_OUT", 0x10): problemen.append("papier op")
            if st & getattr(win32print, "PRINTER_STATUS_ERROR", 0x02): problemen.append("fout")
            if st & getattr(win32print, "PRINTER_STATUS_PAUSED", 0x01): problemen.append("gepauzeerd")
            klaar = not problemen
            return {"ok": True, "printer": naam, "klaar": klaar,
                    "melding": ("klaar" if klaar else ", ".join(problemen))}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def print_png(png_bytes, label="62", red=True, cut=True, kopieen=1):
        instr = _raster(png_bytes, label=label, red=red, cut=cut, kopieen=kopieen)
        naam = _win_printer()
        if not naam:
            return {"ok": False, "error": "geen Brother QL-printer gevonden. Staat de driver erop en Editor Lite uit?"}
        with _slot:
            h = win32print.OpenPrinter(naam)
            try:
                # RAW: de bytes gaan onbewerkt door de driver heen naar de printer,
                # die de raster zelf begrijpt. Zo printen we stil, zonder venster.
                win32print.StartDocPrinter(h, 1, ("Storvo label", None, "RAW"))
                try:
                    win32print.StartPagePrinter(h)
                    win32print.WritePrinter(h, bytes(instr))
                    win32print.EndPagePrinter(h)
                finally:
                    win32print.EndDocPrinter(h)
            except Exception as e:
                log("windows print-fout:", repr(e))
                return {"ok": False, "error": str(e)}
            finally:
                win32print.ClosePrinter(h)
        return {"ok": True, "meldingen": ["verzonden naar " + naam], "bytes": len(instr)}


# ============================================================================
#  MAC (en Linux): rechtstreeks over USB met pyusb, langs de driver heen
# ============================================================================
else:
    import usb.core, usb.util

    def _open():
        dev = usb.core.find(idVendor=VENDOR, idProduct=PRODUCT)
        if dev is None:
            raise RuntimeError("printer niet gevonden op USB (aan en aangesloten?)")
        try:
            if dev.is_kernel_driver_active(0):
                dev.detach_kernel_driver(0)
        except Exception:
            pass
        dev.set_configuration()
        cfg = dev.get_active_configuration()
        intf = cfg[(0, 0)]
        out = usb.util.find_descriptor(intf, custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_OUT)
        inn = usb.util.find_descriptor(intf, custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_IN)
        return dev, out, inn

    def _dispose(dev):
        try:
            usb.util.dispose_resources(dev)
        except Exception:
            pass

    def lees_status():
        dev, out, inn = _open()
        try:
            out.write(b'\x1b\x69\x53')       # ESC i S -> status opvragen
            time.sleep(0.15)
            data = None
            for _ in range(8):
                try:
                    data = inn.read(32, timeout=1500)
                    if data:
                        break
                except Exception:
                    time.sleep(0.25)
            if not data:
                return {"ok": False, "error": "geen status terug"}
            b = list(bytes(data))
            return {"ok": True, "breedte_mm": b[10], "type": hex(b[11]),
                    "fout1": b[8], "fout2": b[9], "klaar": True}
        finally:
            _dispose(dev)

    def print_png(png_bytes, label="62", red=True, cut=True, kopieen=1):
        instr = _raster(png_bytes, label=label, red=red, cut=cut, kopieen=kopieen)
        meldingen = []
        with _slot:
            dev, out, inn = _open()
            try:
                CH = 16384
                for i in range(0, len(instr), CH):
                    out.write(instr[i:i + CH], timeout=8000)
                fout = None
                for _ in range(60):
                    try:
                        d = inn.read(32, timeout=2000)
                    except Exception:
                        continue
                    b = list(bytes(d))
                    if len(b) < 20:
                        continue
                    st = b[18]
                    if b[8] or b[9]:
                        fout = (b[8], b[9]); meldingen.append(f"fout 0x{b[8]:02x}/0x{b[9]:02x}"); break
                    if st == 0x01:
                        meldingen.append("printen klaar"); break
                    if st == 0x06:
                        meldingen.append("bezig")
                if fout:
                    return {"ok": False, "error": "printer meldde een fout", "meldingen": meldingen,
                            "fout1": fout[0], "fout2": fout[1]}
                return {"ok": True, "meldingen": meldingen or ["verzonden"], "bytes": len(instr)}
            finally:
                _dispose(dev)


# ---- HTTP laag (identiek op elk OS) ------------------------------------------
class H(BaseHTTPRequestHandler):
    def _cors(self, status=200, body=None):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        if body is not None:
            self.wfile.write(json.dumps(body).encode())

    def log_message(self, *a):
        pass

    def do_OPTIONS(self):
        self._cors(204)

    def do_GET(self):
        if self.path.startswith("/status"):
            try:
                self._cors(200, lees_status())
            except Exception as e:
                self._cors(200, {"ok": False, "error": str(e)})
        elif self.path == "/" or self.path.startswith("/ping"):
            self._cors(200, {"ok": True, "naam": "storvo-printhelper", "versie": 2,
                             "os": "windows" if IS_WIN else "mac"})
        else:
            self._cors(404, {"ok": False, "error": "onbekend"})

    def do_POST(self):
        if not self.path.startswith("/print"):
            return self._cors(404, {"ok": False, "error": "onbekend"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(n) or b"{}")
            png = payload.get("png", "")
            if "," in png:
                png = png.split(",", 1)[1]   # data:image/png;base64,....
            png_bytes = base64.b64decode(png)
            res = print_png(png_bytes,
                            label=str(payload.get("label", "62")),
                            red=bool(payload.get("red", True)),
                            cut=bool(payload.get("cut", True)),
                            kopieen=int(payload.get("kopieen", 1)))
            log("print:", res.get("ok"), res.get("meldingen") or res.get("error"))
            self._cors(200, res)
        except Exception as e:
            log("print-fout:", repr(e))
            self._cors(200, {"ok": False, "error": str(e)})


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", POORT), H)
    # HTTPS als het certificaat er is (nodig voor Firefox en Safari; Edge/Chrome
    # mogen ook naar http-localhost). Certificaat via mkcert, in de systeem-
    # vertrouwenslijst gezet door de installer, zodat elke browser het accepteert.
    cert = os.path.join(DATADIR, "cert.pem")
    key = os.path.join(DATADIR, "key.pem")
    schema = "http"
    if os.path.exists(cert) and os.path.exists(key):
        import ssl
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
        schema = "https"
    log("Storvo printhelper (%s) start op %s://127.0.0.1:%d" % ("windows" if IS_WIN else "mac", schema, POORT))
    srv.serve_forever()


if __name__ == "__main__":
    main()
