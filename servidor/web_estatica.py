"""Sirve la web compilada (web/dist) comprimida y con caché, para que cargue rápido aunque entre mucha gente a la vez.

El canal público (Tailscale Funnel) va a ~1,2 MB/s por conexión: sin comprimir, la web son ~1,2 MB por visita.
- Si existe «archivo.gz» al lado y el navegador acepta gzip, se manda comprimido (precomprimir con --comprimir).
- assets/ lleva el hash en el nombre: caché de un año. datos/: una hora. index.html: siempre se revalida.

Uso:
  python web_estatica.py --comprimir web/dist     # crea los .gz (en el equipo que compila)
  python web_estatica.py                           # sirve /web en el puerto 8791 (en el contenedor)
"""
import gzip
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

RAIZ = os.environ.get("RAIZ", "/web")
PUERTO = int(os.environ.get("PUERTO", "8791"))
COMPRIMIBLES = (".html", ".js", ".css", ".json", ".svg", ".txt")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("font/woff", ".woff")


def comprimir(carpeta):
    n = 0
    for base, _, archivos in os.walk(carpeta):
        for a in archivos:
            if a.endswith(COMPRIMIBLES):
                ruta = os.path.join(base, a)
                with open(ruta, "rb") as f, gzip.open(ruta + ".gz", "wb", compresslevel=9) as g:
                    g.write(f.read())
                n += 1
    print(f"{n} archivos comprimidos en {carpeta}")


class Manejador(BaseHTTPRequestHandler):
    server_version = "yavoy-web"

    def log_message(self, fmt, *args):  # sin IPs en el registro
        pass

    def do_HEAD(self):
        self.do_GET(cuerpo=False)

    def do_GET(self, cuerpo=True):
        ruta = unquote(urlparse(self.path).path)
        if ruta in ("", "/"):
            ruta = "/index.html"
        real = os.path.realpath(os.path.join(RAIZ, ruta.lstrip("/")))
        if not real.startswith(os.path.realpath(RAIZ) + os.sep) or not os.path.isfile(real) or real.endswith(".gz"):
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        tipo = mimetypes.guess_type(real)[0] or "application/octet-stream"
        if tipo.startswith("text/") or tipo in ("application/javascript", "application/json", "image/svg+xml"):
            tipo += "; charset=utf-8"
        archivo, codificado = real, False
        if "gzip" in (self.headers.get("Accept-Encoding") or "") and os.path.isfile(real + ".gz"):
            archivo, codificado = real + ".gz", True
        if "/assets/" in real:
            cache = "public, max-age=31536000, immutable"
        elif "/datos/" in real or "/logo/" in real:
            cache = "public, max-age=3600"
        else:
            cache = "no-cache"
        with open(archivo, "rb") as f:
            datos = f.read()
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", cache)
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("X-Content-Type-Options", "nosniff")
        if codificado:
            self.send_header("Content-Encoding", "gzip")
        self.end_headers()
        if cuerpo:
            self.wfile.write(datos)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--comprimir":
        comprimir(sys.argv[2])
    else:
        ThreadingHTTPServer.daemon_threads = True
        print(f"yavoy-web: {RAIZ} en :{PUERTO}", flush=True)
        ThreadingHTTPServer(("0.0.0.0", PUERTO), Manejador).serve_forever()
