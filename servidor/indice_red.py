"""Genera web/public/datos/red.json para el planificador de rutas: recorridos de la EMT y del Metro.

  python servidor/indice_red.py ../datos-transporte/datos/horarios_oficiales

Usa los GTFS oficiales del Consorcio (crtm_gtfs_emt.zip y crtm_gtfs_metro.zip). Para cada línea y sentido
toma un viaje de laborable de mediodía: orden de paradas, minutos desde la primera y cada cuánto pasa.

Formato:
  {"paradas": {"e785": ["Diego de León", 40.43499, -3.67454], "m4_63": [...]},
   "patrones": [{"red": "emt", "linea": "72", "destino": "...", "cada": 9, "p": ["e785", ...], "t": [0, 1.5, ...]}]}
"""
import csv
import io
import json
import os
import sys
import zipfile
from collections import defaultdict


def leer(z, nombre):
    for fila in csv.DictReader(io.TextIOWrapper(z.open(nombre), encoding="utf-8-sig")):
        yield {(k or "").strip(): (v or "").strip() for k, v in fila.items()}


def seg(hhmmss):
    h, m, s = (int(x) for x in hhmmss.strip().split(":"))
    return h * 3600 + m * 60 + s


# ── Trazados por las calles (shapes.txt): simplificados y en polilínea codificada (formato de Google) ──
def simplificar(puntos, tolerancia_m=4.0):
    """Douglas-Peucker en metros (aproximación plana, vale para una ciudad)."""
    if len(puntos) < 3:
        return puntos
    def dist(p, a, b):
        ax, ay = a[1] * 85000, a[0] * 111000
        bx, by = b[1] * 85000, b[0] * 111000
        px, py = p[1] * 85000, p[0] * 111000
        dx, dy = bx - ax, by - ay
        if dx == dy == 0:
            return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5
    pila, quedan = [(0, len(puntos) - 1)], {0, len(puntos) - 1}
    while pila:
        i, j = pila.pop()
        mejor, k = 0, None
        for m in range(i + 1, j):
            d = dist(puntos[m], puntos[i], puntos[j])
            if d > mejor:
                mejor, k = d, m
        if k is not None and mejor > tolerancia_m:
            quedan.add(k)
            pila += [(i, k), (k, j)]
    return [puntos[i] for i in sorted(quedan)]


def codificar(puntos):
    """Polilínea codificada con precisión 5 (la de Google Maps)."""
    salida, pla, plo = [], 0, 0
    for la, lo in puntos:
        ila, ilo = round(la * 1e5), round(lo * 1e5)
        for v in (ila - pla, ilo - plo):
            v = ~(v << 1) if v < 0 else v << 1
            while v >= 0x20:
                salida.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            salida.append(chr(v + 63))
        pla, plo = ila, ilo
    return "".join(salida)


def formas(z, ids):
    puntos = {}
    for r in leer(z, "shapes.txt"):
        if r["shape_id"] in ids:
            puntos.setdefault(r["shape_id"], []).append((float(r["shape_pt_sequence"]), float(r["shape_pt_lat"]), float(r["shape_pt_lon"])))
    return {k: codificar(simplificar([(la, lo) for _, la, lo in sorted(v)])) for k, v in puntos.items()}


def laborables(z):
    return {c["service_id"] for c in leer(z, "calendar.txt") if c["wednesday"] == "1"}


def patrones(z, red, prefijo, nombre_parada, nombre_linea):
    servicios = laborables(z)
    viajes = {t["trip_id"]: t for t in leer(z, "trips.txt") if t["service_id"] in servicios}
    # frecuencia del viaje que cubre las 12:00 (o el primero que haya)
    cada, inicio = {}, {}
    for f in leer(z, "frequencies.txt"):
        if f["trip_id"] not in viajes:
            continue
        ini, fin = seg(f["start_time"]), seg(f["end_time"])
        dentro = ini <= 12 * 3600 <= fin
        if f["trip_id"] not in cada or dentro:
            cada[f["trip_id"]] = int(f["headway_secs"])
            inicio[f["trip_id"]] = 0 if dentro else abs(ini - 12 * 3600)
    # un viaje por línea y sentido: el más cercano a mediodía con más paradas
    candidato = {}
    for tid, t in viajes.items():
        clave = (t["route_id"], t["direction_id"])
        puntos = (inicio.get(tid, 10 ** 6),)
        if clave not in candidato or puntos < candidato[clave][0]:
            candidato[clave] = (puntos, tid)
    elegidos = {tid: clave for clave, (_, tid) in candidato.items()}
    paradas = defaultdict(list)
    for st in leer(z, "stop_times.txt"):
        if st["trip_id"] in elegidos:
            paradas[st["trip_id"]].append((int(st["stop_sequence"]), st["stop_id"], seg(st["arrival_time"] or st["departure_time"])))
    rutas = {r["route_id"]: r for r in leer(z, "routes.txt")}
    out = []
    for tid, (route_id, _) in elegidos.items():
        filas = sorted(paradas[tid])
        if len(filas) < 2:
            continue
        t0 = filas[0][2]
        claves = [prefijo + nombre_parada(s) for _, s, _ in filas]
        out.append({"red": red, "linea": nombre_linea(rutas[route_id]), "destino": viajes[tid].get("trip_headsign", "").strip(),
                    "cada": max(1, round(cada.get(tid, 900) / 60)), "p": claves,
                    "t": [round((x - t0) / 60, 1) for _, _, x in filas], "forma": viajes[tid].get("shape_id", "")})
    return out


DIAS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def servicios_del_dia(z):
    """Servicios que circulan un día laborable concreto: el jueves con más servicios dentro del calendario."""
    from datetime import date, timedelta
    cal = list(leer(z, "calendar.txt"))
    excepciones = {}
    if "calendar_dates.txt" in z.namelist():
        for e in leer(z, "calendar_dates.txt"):
            excepciones.setdefault(e["date"], []).append((e["service_id"], e["exception_type"]))
    def activos(d):
        txt = d.strftime("%Y%m%d")
        a = {c["service_id"] for c in cal if c["start_date"] <= txt <= c["end_date"] and c.get(DIAS[d.weekday()]) == "1"}
        for sid, tipo in excepciones.get(txt, []):
            (a.add if tipo == "1" else a.discard)(sid)
        return a
    inicio = min(date(int(c["start_date"][:4]), int(c["start_date"][4:6]), int(c["start_date"][6:])) for c in cal)
    fin = max(date(int(c["end_date"][:4]), int(c["end_date"][4:6]), int(c["end_date"][6:])) for c in cal)
    candidatos = [inicio + timedelta(days=i) for i in range(min(60, (fin - inicio).days + 1))]
    jueves = [d for d in candidatos if d.weekday() == 3] or candidatos
    return max((activos(d) for d in jueves), key=len)


def patrones_por_viajes(z, red, prefijo, nombre_parada, nombre_linea, filtro_ruta=lambda r: True):
    """Para GTFS sin frecuencias (interurbanos, Renfe), con los viajes de un jueves: por línea y sentido, el recorrido
    más habitual (el número de paradas más repetido, el viaje más cercano a mediodía) y «cada» = 840 min / viajes de 7 a 21 h."""
    rutas = {r["route_id"]: r for r in leer(z, "routes.txt") if filtro_ruta(r)}
    servicios = servicios_del_dia(z)
    viajes = {t["trip_id"]: t for t in leer(z, "trips.txt") if t["route_id"] in rutas and t["service_id"] in servicios}
    # 1.ª pasada: primera salida y número de paradas de cada viaje
    inicio, paradas_n = {}, {}
    for st in leer(z, "stop_times.txt"):
        tid = st["trip_id"]
        if tid not in viajes:
            continue
        x = seg(st["departure_time"] or st["arrival_time"])
        if tid not in inicio or x < inicio[tid]:
            inicio[tid] = x
        paradas_n[tid] = paradas_n.get(tid, 0) + 1
    grupos = {}
    for tid, t in viajes.items():
        if tid in inicio:
            grupos.setdefault((t["route_id"], t.get("direction_id", "")), []).append(tid)
    elegidos, cada = {}, {}
    for clave, tids in grupos.items():
        # cada hora de salida una vez: hay viajes repetidos en calendarios que se solapan
        n = len({inicio[tid] for tid in tids if 7 * 3600 <= inicio[tid] <= 21 * 3600})
        cuantas = {}
        for tid in tids:
            cuantas[paradas_n[tid]] = cuantas.get(paradas_n[tid], 0) + 1
        habitual = max(cuantas, key=lambda k: (cuantas[k], k))
        tid = min((t for t in tids if paradas_n[t] == habitual), key=lambda x: abs(inicio[x] - 12 * 3600))
        elegidos[tid] = clave[0]
        cada[tid] = max(3, min(120, round(840 / n))) if n else 60
    # 2.ª pasada: las paradas de los viajes elegidos
    paradas = {}
    for st in leer(z, "stop_times.txt"):
        if st["trip_id"] in elegidos:
            paradas.setdefault(st["trip_id"], []).append((int(st["stop_sequence"]), st["stop_id"], seg(st["arrival_time"] or st["departure_time"])))
    out = []
    for tid, route_id in elegidos.items():
        filas = sorted(paradas.get(tid, []))
        if len(filas) < 2:
            continue
        t0 = filas[0][2]
        out.append({"red": red, "linea": nombre_linea(rutas[route_id]), "destino": viajes[tid].get("trip_headsign", ""),
                    "cada": cada[tid], "p": [prefijo + nombre_parada(sid) for _, sid, _ in filas],
                    "t": [round((x - t0) / 60, 1) for _, _, x in filas], "forma": viajes[tid].get("shape_id", "")})
    return out


def tiempos_minimos(pat, paradas, kmh):
    """Algunos viajes traen tiempos imposibles (Alcalá-Madrid en 13 min): ningún tramo más rápido que «kmh»
    por la distancia en línea recta entre paradas, con un 25 % de rodeo."""
    for x in pat:
        t = [0.0]
        for k in range(1, len(x["p"])):
            a, b = paradas.get(x["p"][k - 1]), paradas.get(x["p"][k])
            metros = (((b[1] - a[1]) * 111000) ** 2 + ((b[2] - a[2]) * 85000) ** 2) ** 0.5 * 1.25 if a and b else 0
            t.append(t[-1] + max(x["t"][k] - x["t"][k - 1], metros / (kmh * 1000 / 60)))
        x["t"] = [round(v, 1) for v in t]


def main(carpeta, salida="web/public/datos/red.json"):
    paradas = {}
    # EMT: el código de parada del GTFS es el número de la EMT
    z = zipfile.ZipFile(os.path.join(carpeta, "crtm_gtfs_emt.zip"))
    for p in leer(z, "stops.txt"):
        if p["stop_code"].isdigit():
            paradas["e" + p["stop_code"]] = [p["stop_name"].strip(), round(float(p["stop_lat"]), 5), round(float(p["stop_lon"]), 5)]
    codigo_emt = {p["stop_id"]: p["stop_code"] for p in leer(z, "stops.txt")}
    pat = patrones(z, "emt", "e", lambda s: codigo_emt.get(s, s), lambda r: r["route_short_name"].strip())
    trazados = formas(z, {x["forma"] for x in pat})
    # Metro: andenes par_4_63 -> m4_63, con el nombre bonito del índice de estaciones
    nombres = json.load(open("web/public/datos/paradas_metro.json", encoding="utf-8"))["nombres"]
    z = zipfile.ZipFile(os.path.join(carpeta, "crtm_gtfs_metro.zip"))
    for p in leer(z, "stops.txt"):
        if p["stop_id"].startswith("par_"):
            c = p["stop_id"][4:]
            paradas["m" + c] = [nombres.get(c, p["stop_name"].title()), round(float(p["stop_lat"]), 5), round(float(p["stop_lon"]), 5)]
    metro = patrones(z, "metro", "m", lambda s: s[4:] if s.startswith("par_") else s, lambda r: r["route_short_name"].strip())
    trazados.update(formas(z, {x["forma"] for x in metro}))
    pat += metro
    # Interurbanos (bus verde): andenes par_8_09568 -> i8_09568
    z = zipfile.ZipFile(os.path.join(carpeta, "crtm_gtfs_interurbanos.zip"))
    for p in leer(z, "stops.txt"):
        if p["stop_id"].startswith("par_"):
            paradas["i" + p["stop_id"][4:]] = [p["stop_name"].title(), round(float(p["stop_lat"]), 5), round(float(p["stop_lon"]), 5)]
    inter = patrones_por_viajes(z, "interurbano", "i", lambda s: s[4:] if s.startswith("par_") else s, lambda r: r["route_short_name"])
    trazados.update(formas(z, {x["forma"] for x in inter}))
    pat += inter
    # Cercanías Madrid (núcleo 10 del GTFS de Renfe, que es de toda España)
    renfe = sorted(f for f in os.listdir(carpeta) if f.startswith("renfe_gtfs_") and f.endswith(".zip"))[-1]
    z = zipfile.ZipFile(os.path.join(carpeta, renfe))
    for p in leer(z, "stops.txt"):
        paradas["r" + p["stop_id"]] = [p["stop_name"], round(float(p["stop_lat"]), 5), round(float(p["stop_lon"]), 5)]
    cerc = patrones_por_viajes(z, "renfe", "r", lambda s: s, lambda r: r["route_short_name"], filtro_ruta=lambda r: r["route_id"].startswith("10T"))
    trazados.update(formas(z, {x["forma"] for x in cerc}))
    pat += cerc
    tiempos_minimos(inter, paradas, 40)
    tiempos_minimos(cerc, paradas, 70)
    for x in pat:  # Cercanías e interurbanos: el destino, la última parada
        if x["red"] in ("renfe", "interurbano") and x["p"][-1] in paradas:
            x["destino"] = paradas[x["p"][-1]][0]
    for x in pat:  # el destino del Metro viene en mayúsculas: se usa el nombre de la última estación
        if x["red"] == "metro" and x["p"][-1] in paradas:
            x["destino"] = paradas[x["p"][-1]][0]
    usadas = {c for x in pat for c in x["p"]}
    paradas = {k: v for k, v in paradas.items() if k in usadas}
    # el trazado de cada recorrido va aparte (formas.json, alineado con «patrones»): solo se baja para dibujar mapas
    lista_formas = [trazados.get(x.pop("forma"), "") for x in pat]
    with open(salida, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"paradas": paradas, "patrones": pat}, f, ensure_ascii=False, separators=(",", ":"))
    ruta_formas = os.path.join(os.path.dirname(salida), "formas.json")
    with open(ruta_formas, "w", encoding="utf-8", newline="\n") as f:
        json.dump(lista_formas, f, separators=(",", ":"))
    print(f"{sum(1 for x in lista_formas if x)} trazados en {ruta_formas}")
    print(f"{len(pat)} recorridos ({sum(1 for x in pat if x['red'] == 'metro')} de Metro), {len(paradas)} paradas en {salida}")


if __name__ == "__main__":
    main(*sys.argv[1:])
