"""Genera web/public/datos/paradas_metro.json: estaciones de Metro con sus andenes (códigos del Consorcio) y líneas.

  python servidor/indice_paradas_metro.py ../datos-transporte/datos/horarios_oficiales/crtm_gtfs_metro.zip

Formato: {"estaciones": [[código, nombre, lat, lon, ["4_63", ...], "4 5 6"], ...], "nombres": {"4_63": "Diego De Leon", ...}}
Los códigos de andén (par_4_63 -> 4_63) son los que acepta el widget de tiempos del Consorcio.
"""
import csv
import io
import json
import sys
import zipfile
from collections import defaultdict


def leer(z, nombre):
    return csv.DictReader(io.TextIOWrapper(z.open(nombre), encoding="utf-8-sig"))


def bonito(nombre):
    return " ".join(p.capitalize() if len(p) > 2 else p.lower() for p in nombre.strip().split())


def main(ruta_zip, salida="web/public/datos/paradas_metro.json"):
    z = zipfile.ZipFile(ruta_zip)
    linea_de_ruta = {r["route_id"]: r["route_short_name"] for r in leer(z, "routes.txt")}
    ruta_de_viaje = {t["trip_id"]: t["route_id"] for t in leer(z, "trips.txt")}
    lineas = defaultdict(set)
    for st in leer(z, "stop_times.txt"):
        lineas[st["stop_id"]].add(linea_de_ruta[ruta_de_viaje[st["trip_id"]]])
    paradas = list(leer(z, "stops.txt"))
    # En el GTFS muchos andenes no tienen parent_station: se agrupan por nombre.
    # El nombre bonito se toma de la estación (est_) si existe, porque lleva tildes.
    con_tilde = {p["stop_name"].strip().upper(): p["stop_name"] for p in paradas if p["stop_id"].startswith("est_")}
    grupos = defaultdict(list)
    nombres = {}
    for p in paradas:
        if p["stop_id"].startswith("par_"):
            codigo = p["stop_id"][4:]
            clave = p["stop_name"].strip().upper()
            nombres[codigo] = bonito(con_tilde.get(clave, p["stop_name"]))
            grupos[clave].append((codigo, float(p["stop_lat"]), float(p["stop_lon"])))
    orden = lambda l: (len(l), l)
    filas = []
    for clave, andenes in grupos.items():
        cods = sorted(c for c, _, _ in andenes)
        lin = sorted({l for c in cods for l in lineas.get(f"par_{c}", ())}, key=orden)
        lat = sum(a for _, a, _ in andenes) / len(andenes)
        lon = sum(o for _, _, o in andenes) / len(andenes)
        filas.append([cods[0], bonito(con_tilde.get(clave, clave)), round(lat, 5), round(lon, 5), cods, " ".join(lin)])
    filas.sort(key=lambda f: f[1])
    with open(salida, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"estaciones": filas, "nombres": nombres}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(filas)} estaciones en {salida}")


if __name__ == "__main__":
    main(*sys.argv[1:])
