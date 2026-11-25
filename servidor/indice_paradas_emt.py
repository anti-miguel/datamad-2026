"""Genera web/public/datos/paradas_emt.json para el buscador: todas las paradas de la EMT con sus líneas.

Sale del GTFS oficial de la EMT (Consorcio), que está en el repo de datos:
  python servidor/indice_paradas_emt.py ../datos-transporte/datos/horarios_oficiales/crtm_gtfs_emt.zip

Formato compacto: [[número, nombre, lat, lon, "línea línea ..."], ...]
"""
import csv
import io
import json
import sys
import zipfile
from collections import defaultdict


def leer(z, nombre):
    return csv.DictReader(io.TextIOWrapper(z.open(nombre), encoding="utf-8-sig"))


def main(ruta_zip, salida="web/public/datos/paradas_emt.json"):
    z = zipfile.ZipFile(ruta_zip)
    linea_de_ruta = {r["route_id"]: r["route_short_name"] for r in leer(z, "routes.txt")}
    ruta_de_viaje = {t["trip_id"]: t["route_id"] for t in leer(z, "trips.txt")}
    lineas = defaultdict(set)
    for st in leer(z, "stop_times.txt"):
        lineas[st["stop_id"]].add(linea_de_ruta[ruta_de_viaje[st["trip_id"]]])
    orden = lambda l: (len(l), l)
    filas = []
    for p in leer(z, "stops.txt"):
        if p.get("location_type") not in ("", "0", None) or not p["stop_code"].isdigit():
            continue
        filas.append([int(p["stop_code"]), p["stop_name"].strip(), round(float(p["stop_lat"]), 5),
                      round(float(p["stop_lon"]), 5), " ".join(sorted(lineas.get(p["stop_id"], ()), key=orden))])
    filas.sort()
    with open(salida, "w", encoding="utf-8", newline="\n") as f:
        json.dump(filas, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(filas)} paradas en {salida}")


if __name__ == "__main__":
    main(*sys.argv[1:])
