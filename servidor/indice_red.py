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
    return csv.DictReader(io.TextIOWrapper(z.open(nombre), encoding="utf-8-sig"))


def seg(hhmmss):
    h, m, s = (int(x) for x in hhmmss.strip().split(":"))
    return h * 3600 + m * 60 + s


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
                    "t": [round((x - t0) / 60, 1) for _, _, x in filas]})
    return out


def main(carpeta, salida="web/public/datos/red.json"):
    paradas = {}
    # EMT: el código de parada del GTFS es el número de la EMT
    z = zipfile.ZipFile(os.path.join(carpeta, "crtm_gtfs_emt.zip"))
    for p in leer(z, "stops.txt"):
        if p["stop_code"].isdigit():
            paradas["e" + p["stop_code"]] = [p["stop_name"].strip(), round(float(p["stop_lat"]), 5), round(float(p["stop_lon"]), 5)]
    codigo_emt = {p["stop_id"]: p["stop_code"] for p in leer(z, "stops.txt")}
    pat = patrones(z, "emt", "e", lambda s: codigo_emt.get(s, s), lambda r: r["route_short_name"].strip())
    # Metro: andenes par_4_63 -> m4_63, con el nombre bonito del índice de estaciones
    nombres = json.load(open("web/public/datos/paradas_metro.json", encoding="utf-8"))["nombres"]
    z = zipfile.ZipFile(os.path.join(carpeta, "crtm_gtfs_metro.zip"))
    for p in leer(z, "stops.txt"):
        if p["stop_id"].startswith("par_"):
            c = p["stop_id"][4:]
            paradas["m" + c] = [nombres.get(c, p["stop_name"].title()), round(float(p["stop_lat"]), 5), round(float(p["stop_lon"]), 5)]
    pat += patrones(z, "metro", "m", lambda s: s[4:] if s.startswith("par_") else s, lambda r: r["route_short_name"].strip())
    for x in pat:  # el destino del Metro viene en mayúsculas: se usa el nombre de la última estación
        if x["red"] == "metro" and x["p"][-1] in paradas:
            x["destino"] = paradas[x["p"][-1]][0]
    usadas = {c for x in pat for c in x["p"]}
    paradas = {k: v for k, v in paradas.items() if k in usadas}
    with open(salida, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"paradas": paradas, "patrones": pat}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(pat)} recorridos ({sum(1 for x in pat if x['red'] == 'metro')} de Metro), {len(paradas)} paradas en {salida}")


if __name__ == "__main__":
    main(*sys.argv[1:])
