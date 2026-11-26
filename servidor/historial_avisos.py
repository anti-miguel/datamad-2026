"""Genera web/public/datos/avisos_emt.json: los avisos oficiales de la EMT que grabó nuestro grabador de avisos.

  python servidor/historial_avisos.py ../datos-transporte/datos/avisos

Lee los .jsonl.gz del grabador (RSS público de la EMT, cada 5 min). Por aviso: cuándo lo vimos por primera vez,
cuándo desapareció del RSS, título, texto, líneas, a qué fechas afecta, causa, efecto y enlace al documento.
Fuente: EMT de Madrid.
"""
import glob
import gzip
import json
import os
import re
import sys


def limpio(codigo):
    return re.sub(r"^[\d.]+\s*-\s*", "", codigo or "").strip()  # «08 - Obras» -> «Obras»


def main(carpeta, salida="web/public/datos/avisos_emt.json"):
    avisos, bajas = {}, {}
    for f in sorted(glob.glob(os.path.join(carpeta, "*.jsonl.gz"))):
        for linea in gzip.open(f, "rt", encoding="utf-8"):
            d = json.loads(linea)
            if d.get("k") == "aviso":
                a = avisos.setdefault(d["guid"], {"visto": d["t"]})
                a.update({"titulo": d.get("titulo"), "texto": d.get("texto"), "desde": d.get("desde"), "hasta": d.get("hasta"),
                          "causa": limpio(d.get("causa")), "efecto": limpio(d.get("efecto")), "enlace": d.get("enlace") or "",
                          "lineas": sorted({str(l).lstrip("0") or "0" for l in d.get("lineas") or []}, key=lambda s: (len(s), s))})
                bajas.pop(d["guid"], None)
            elif d.get("k") == "baja":
                bajas[d["guid"]] = d["t"]
    filas = []
    for guid, a in avisos.items():
        a["quitado"] = bajas.get(guid)
        filas.append(a)
    filas.sort(key=lambda a: a.get("desde") or a["visto"], reverse=True)
    with open(salida, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"fuente": "EMT de Madrid (RSS de avisos)", "avisos": filas}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(filas)} avisos en {salida}")


if __name__ == "__main__":
    main(*sys.argv[1:])
