"""Pasarela mínima entre la web de YaVoy y la API de la EMT (MobilityLabs).

Las credenciales se quedan en el servidor: la web solo ve llegadas y paradas.
Para no agotar la cuota de la cuenta (la comparte el grabador de la EMT):
  - caché de llegadas por parada (LLEGADAS_TTL_S) y de paradas cercanas por celda de ~100 m;
  - tope diario propio (TOPE_DIARIO) y freno si la cuenta pasa de CUOTA_MAX en el día;
  - límite por IP (POR_IP_MIN peticiones por minuto).

Rutas (GET):
  /cercanas?lat=40.41&lon=-3.70  -> {"paradas": [{"id", "nombre", "lat", "lon", "metros", "lineas": [...]}]}
  /llegadas?parada=4613          -> {"parada", "llegadas": [{"linea", "destino", "minutos"}], "hora"}
  /estado                        -> uso del día (sin datos de la cuenta)

Variables: EMT_EMAIL y EMT_PASSWORD (o EMT_CLIENT_ID y EMT_PASSKEY), PUERTO (8790).
"""
import json
import os
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

API = "https://openapi.emtmadrid.es"
MADRID = ZoneInfo("Europe/Madrid")
PUERTO = int(os.environ.get("PUERTO", "8790"))
LLEGADAS_TTL_S = int(os.environ.get("LLEGADAS_TTL_S", "30"))
CERCANAS_TTL_S = int(os.environ.get("CERCANAS_TTL_S", "86400"))
RADIO_M = int(os.environ.get("RADIO_M", "350"))
TOPE_DIARIO = int(os.environ.get("TOPE_DIARIO", "3000"))
CUOTA_MAX = int(os.environ.get("CUOTA_MAX", "18500"))
POR_IP_MIN = int(os.environ.get("POR_IP_MIN", "300"))  # alto: en el evento mucha gente sale por la misma IP (wifi)

CLIENT_ID = os.environ.get("EMT_CLIENT_ID", "").strip()
PASSKEY = os.environ.get("EMT_PASSKEY", "").strip()
EMAIL = os.environ.get("EMT_EMAIL", "").strip()
PASSWORD = os.environ.get("EMT_PASSWORD", "").strip()
CUERPO = json.dumps({"cultureInfo": "ES", "Text_StopRequired_YN": "N", "Text_EstimationsRequired_YN": "Y",
                     "Text_IncidencesRequired_YN": "N"}).encode()

_cerrojo = threading.Lock()  # solo para tocar diccionarios, nunca durante una llamada a la EMT
_cerrojo_token = threading.Lock()
_cerrojos = defaultdict(threading.Lock)  # uno por entrada de la caché: la misma parada se pide una sola vez
_token = {"valor": None, "caduca": 0.0, "cuota": 0}
_uso = {"dia": None, "llamadas": 0}
_cache = {}
_por_ip = defaultdict(deque)


def _hoy():
    return datetime.now(MADRID).date().isoformat()


def _relleno(v):
    return bool(v) and "PEGA" not in v.upper() and "ESCRIBE" not in v.upper()


def _gastar():
    """Cuenta una llamada a la EMT; False si hoy ya no se puede."""
    with _cerrojo:
        if _uso["dia"] != _hoy():
            _uso.update(dia=_hoy(), llamadas=0)
        if _uso["llamadas"] >= TOPE_DIARIO or _token["cuota"] >= CUOTA_MAX:
            return False
        _uso["llamadas"] += 1
        return True


def _json(req, timeout=20):
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as ex:
        try:
            return json.load(ex)
        except ValueError:
            return {"code": f"HTTP {ex.code}"}


def _login():
    # Como mucho un inicio de sesión cada 30 s: un error repetido no debe gastar la cuota en logins
    if time.time() - _token.get("ultimo_login", 0) < 30:
        raise RuntimeError("acceso a la EMT no disponible ahora")
    _token["ultimo_login"] = time.time()
    if not _gastar():
        raise PermissionError("tope")
    cab = ({"X-ClientId": CLIENT_ID, "passKey": PASSKEY} if _relleno(CLIENT_ID) and _relleno(PASSKEY)
           else {"email": EMAIL, "password": PASSWORD})
    d = _json(urllib.request.Request(f"{API}/v1/mobilitylabs/user/login/", headers=cab), timeout=30)
    datos = (d.get("data") or [{}])[0]
    if not datos.get("accessToken"):
        raise RuntimeError(f"login rechazado (código {d.get('code')})")
    _token["valor"] = datos["accessToken"]
    _token["desde"] = time.time()
    _token["caduca"] = time.time() + int(datos.get("tokenSecExpiration", 3600)) - 120
    _token["cuota"] = int((datos.get("apiCounter") or {}).get("current") or 0)


def _renovar(usado=None):
    """Inicia sesión si el token falta, ha caducado o es el que acaba de fallar (una sola vez entre hilos)."""
    with _cerrojo_token:
        if usado is None and _token["valor"] and time.time() < _token["caduca"]:
            return
        if usado is not None and _token["valor"] != usado:
            return  # otro hilo ya lo renovó
        _login()


def _emt(metodo, ruta, cuerpo=None):
    _renovar()
    for intento in range(2):
        if not _gastar():
            raise PermissionError("tope")
        token = _token["valor"]
        req = urllib.request.Request(f"{API}{ruta}", data=cuerpo, method=metodo,
                                     headers={"accessToken": token, "Content-Type": "application/json"})
        d = _json(req)
        # Con un token recién sacado, un código 8x es que la parada no existe: no se vuelve a iniciar sesión
        reciente = time.time() - _token.get("desde", 0) < 600
        if (str(d.get("code", "")).startswith("8") and not reciente or d.get("code") == "HTTP 401") and intento == 0:
            _renovar(token)
            continue
        if str(d.get("code")) not in ("00", "0", "01"):
            raise RuntimeError(f"EMT código {d.get('code')}")
        return d.get("data") or []
    raise RuntimeError("sin acceso")


ERROR_TTL_S = 20


def _cacheado(clave, ttl, funcion):
    with _cerrojo:
        candado = _cerrojos[clave]
    with candado:
        hit = _cache.get(clave)
        if hit and isinstance(hit[1], RuntimeError) and time.time() - hit[0] < ERROR_TTL_S:
            raise hit[1]  # paradas que no existen o fallos de la EMT: no se repite la consulta en 20 s
        if hit and not isinstance(hit[1], RuntimeError) and time.time() - hit[0] < ttl:
            return hit[1]
        try:
            valor = funcion()
        except RuntimeError as ex:
            valor = ex
        with _cerrojo:
            _cache[clave] = (time.time(), valor)
            if len(_cache) > 5000:
                for k in sorted(_cache, key=lambda k: _cache[k][0])[:1000]:
                    _cache.pop(k, None)
                    _cerrojos.pop(k, None)
        if isinstance(valor, RuntimeError):
            raise valor
        return valor


def llegadas(parada):
    def pedir():
        data = _emt("POST", f"/v2/transport/busemtmad/stops/{parada}/arrives/", CUERPO)
        filas = (data or [{}])[0].get("Arrive") or []
        out = []
        for a in filas:
            seg = a.get("estimateArrive")
            if "PERSONAL" in str(a.get("destination", "")).upper():
                continue  # lanzaderas internas de la EMT
            if seg is None or seg > 7200:  # 999999 = sin estimación; más de 2 h no es una llegada real
                continue
            out.append({"linea": str(a.get("line")), "destino": a.get("destination") or "",
                        "minutos": max(0, round(seg / 60))})
        out.sort(key=lambda x: x["minutos"])
        return {"parada": parada, "llegadas": out, "hora": int(time.time())}
    return _cacheado(("ll", parada), LLEGADAS_TTL_S, pedir)


def cercanas(lat, lon):
    la, lo = round(lat, 3), round(lon, 3)  # celdas de ~100 m: misma respuesta para gente cercana

    def pedir():
        data = _emt("GET", f"/v2/transport/busemtmad/stops/arroundxy/{lo}/{la}/{RADIO_M}/")
        out = []
        for p in data:
            coords = (p.get("geometry") or {}).get("coordinates") or [None, None]
            lineas = sorted({str(l.get("label") or l.get("line")) for l in p.get("lines") or []},
                            key=lambda s: (len(s), s))
            out.append({"id": str(p.get("stopId")), "nombre": p.get("stopName") or "",
                        "lon": coords[0], "lat": coords[1], "metros": p.get("metersToPoint"), "lineas": lineas})
        out.sort(key=lambda x: x["metros"] if x["metros"] is not None else 1e9)
        return {"paradas": out[:12]}
    return _cacheado(("ce", la, lo), CERCANAS_TTL_S, pedir)


class Manejador(BaseHTTPRequestHandler):
    server_version = "yavoy-api"

    def log_message(self, fmt, *args):  # sin IPs en el registro
        pass

    def _responder(self, codigo, cuerpo):
        b = json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _ip_ok(self):
        # El proxy (Tailscale Funnel) añade la IP real al final; lo de delante lo puede escribir el cliente
        ip = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[-1].strip()
        ahora = time.time()
        with _cerrojo:
            q = _por_ip[ip]
            while q and ahora - q[0] > 60:
                q.popleft()
            if len(q) >= POR_IP_MIN:
                return False
            q.append(ahora)
            if len(_por_ip) > 10000:
                _por_ip.clear()
        return True

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        ruta = u.path.rstrip("/").rsplit("/", 1)[-1]
        if ruta == "estado":
            return self._responder(200, {"dia": _uso["dia"], "llamadas": _uso["llamadas"], "tope": TOPE_DIARIO})
        if not self._ip_ok():
            return self._responder(429, {"error": "demasiadas consultas, espera un minuto"})
        try:
            if ruta == "llegadas":
                parada = q.get("parada", [""])[0]
                if not parada.isdigit() or len(parada) > 6:
                    return self._responder(400, {"error": "parada no válida"})
                return self._responder(200, llegadas(parada))
            if ruta == "cercanas":
                lat, lon = float(q["lat"][0]), float(q["lon"][0])
                if not (40.0 < lat < 41.2 and -4.6 < lon < -3.0):
                    return self._responder(200, {"paradas": [], "fuera": True})
                return self._responder(200, cercanas(lat, lon))
            return self._responder(404, {"error": "no existe"})
        except (KeyError, ValueError):
            return self._responder(400, {"error": "faltan datos"})
        except PermissionError:
            return self._responder(503, {"error": "hemos llegado al límite de consultas de hoy"})
        except Exception as ex:  # la EMT a veces falla; la web enseña los datos de la demo
            return self._responder(502, {"error": str(ex)[:80]})


if __name__ == "__main__":
    print(f"yavoy-api en :{PUERTO} (tope {TOPE_DIARIO}/día)", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PUERTO), Manejador).serve_forever()
