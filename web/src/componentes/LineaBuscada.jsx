// Resultado de buscar una línea («87», «N1», «5»): la línea con sus dos sentidos y, al tocarla, sus paradas en orden.
// Si escribes un número esperas el autobús o el Metro con ese número, no la parada que se llama así.
// Recorridos de los horarios oficiales de la EMT y del Metro (datos/red.json).
import { useState } from "react";
import { Linea, Tarjeta, IconoRed } from "./Comunes.jsx";
import { normalizar } from "../lib/util.js";

const NOMBRE = { emt: "Bus EMT", metro: "Metro" };

// Agrupa los recorridos por línea: { clave, red, linea, sentidos: [{ destino, paradas: [...] }] }
export function lineasDeRed(red) {
  const porLinea = new Map();
  for (const p of red.patrones) {
    const k = `${p.red}|${p.linea}`;
    if (!porLinea.has(k)) porLinea.set(k, { clave: k, red: p.red, linea: p.linea, buscar: normalizar(p.linea).replace(/^0+(?=\d)/, ""), sentidos: [] });
    porLinea.get(k).sentidos.push({ destino: p.destino, paradas: p.p.map((c) => red.paradas.get(c)) });
  }
  return [...porLinea.values()];
}

// Líneas que coinciden con lo escrito: «87», «n1», «l5», «linea 5», «metro 5»
export function buscarLineas(lineas, texto) {
  let q = normalizar(texto).replace(/^(linea|lin|l\.?|metro|bus)\s*/, "").trim();
  q = q.replace(/^0+(?=\d)/, "");
  if (!q || q.length > 4) return [];
  return lineas.filter((l) => l.buscar === q).sort((a, b) => (a.red === "metro") - (b.red === "metro"));
}

export function TarjetaLinea({ l, onAbrirParada }) {
  const [abierta, setAbierta] = useState(false);
  const [sentido, setSentido] = useState(0);
  const extremos = [...new Set(l.sentidos.map((s) => s.destino))];
  const s = l.sentidos[sentido];
  return (
    <Tarjeta className="overflow-hidden">
      <button onClick={() => setAbierta((x) => !x)} aria-expanded={abierta} className="flex w-full items-start gap-3 p-4 text-left">
        <IconoRed red={l.red} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <Linea linea={l.linea} red={l.red} grande />
            <span className="text-[15px] text-suave">{NOMBRE[l.red]}</span>
          </span>
          <span className="mt-1 block text-[16px] font-bold leading-snug text-tinta">{extremos.join(" ↔ ")}</span>
          <span className="mt-0.5 block text-[14px] text-principal">{abierta ? "Ocultar paradas ▴" : "Ver sus paradas ▾"}</span>
        </span>
      </button>
      {abierta && (
        <div className="border-t-[2.5px] border-[#111] p-4 pt-3">
          {l.sentidos.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Sentido">
              {l.sentidos.map((x, i) => (
                <button
                  key={i}
                  role="radio"
                  aria-checked={sentido === i}
                  onClick={() => setSentido(i)}
                  className={`boton-pegatina min-h-[40px] rounded-full px-3 text-[14px] ${sentido === i ? "bg-principal font-bold text-white" : "bg-tarjeta"}`}
                >
                  → {x.destino}
                </button>
              ))}
            </div>
          )}
          <ol className="space-y-0.5">
            {s.paradas.map((p, i) => (
              <li key={`${p.clave}${i}`}>
                <button onClick={() => onAbrirParada(p, l)} className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-1 text-left hover:bg-hundido">
                  <span className="flex h-[26px] min-w-[26px] items-center justify-center rounded-full border-2 border-[#111] bg-hundido text-[12px] font-bold">
                    {i + 1}
                  </span>
                  <span className="text-[15px] text-tinta">{p.nombre}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Tarjeta>
  );
}
