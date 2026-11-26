// Avisos oficiales de la EMT: los de ahora y los próximos (RSS público de la EMT, a través del EVO)
// y el historial que grabó nuestro grabador de avisos (datos/avisos_emt.json, generado con servidor/historial_avisos.py).
import { useEffect, useMemo, useState } from "react";
import { Linea, Tarjeta } from "./Comunes.jsx";
import { normalizar } from "../lib/util.js";

const BASE = import.meta.env?.BASE_URL ?? "/";
const MAX_LINEAS = 8;
const POR_PAGINA = 20;

function fechaCorta(t) {
  if (!t) return null;
  const d = new Date(t * 1000);
  const hora = d.getHours() || d.getMinutes() ? ` ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}` : "";
  return `${d.getDate()}/${d.getMonth() + 1}${hora}`;
}

function periodo(a) {
  const desde = fechaCorta(a.desde);
  const hasta = fechaCorta(a.hasta);
  if (desde && hasta) return `Del ${desde} al ${hasta}`;
  if (desde) return `Desde el ${desde}`;
  return hasta ? `Hasta el ${hasta}` : "";
}

function TarjetaOficial({ a }) {
  const [verTexto, setVerTexto] = useState(false);
  const extra = a.lineas.length - MAX_LINEAS;
  return (
    <Tarjeta className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {a.causa && <span className="rounded-md border-2 border-[#111] bg-amarillo px-1.5 text-[13px] font-bold text-[#111]">{a.causa.toUpperCase()}</span>}
        {a.efecto && <span className="rounded-md border-2 border-[#111] bg-hundido px-1.5 text-[13px] font-bold">{a.efecto}</span>}
      </div>
      <h3 className="text-[17px] font-bold leading-snug text-tinta">{a.titulo}</h3>
      <p className="text-[14px] text-tinta-2">{periodo(a)}</p>
      {a.lineas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {a.lineas.slice(0, MAX_LINEAS).map((l) => (
            <Linea key={l} linea={l} />
          ))}
          {extra > 0 && <span className="text-[14px] font-bold text-tinta-2">+{extra}</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {a.texto && (
          <button onClick={() => setVerTexto((x) => !x)} className="text-[14px] font-bold text-principal">
            {verTexto ? "Ocultar detalle ▴" : "Ver detalle ▾"}
          </button>
        )}
        {a.enlace && (
          <a href={a.enlace} target="_blank" rel="noopener noreferrer" className="text-[14px] font-bold text-principal underline underline-offset-2">
            Documento de la EMT
          </a>
        )}
      </div>
      {verTexto && <p className="text-[15px] text-tinta">{a.texto}</p>}
    </Tarjeta>
  );
}

const VISTAS = [
  { id: "ahora", texto: "Ahora" },
  { id: "proximos", texto: "Próximos" },
  { id: "historial", texto: "Historial" },
];

export default function AvisosOficiales() {
  const [vista, setVista] = useState("ahora");
  const [linea, setLinea] = useState("");
  const [vivos, setVivos] = useState(null); // null cargando, "error" o lista
  const [historial, setHistorial] = useState(null);
  const [cuantos, setCuantos] = useState(POR_PAGINA);

  useEffect(() => {
    fetch(`${BASE}api/avisos`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setVivos(d.avisos ?? []))
      .catch(() => setVivos("error"));
  }, []);
  useEffect(() => {
    if (vista !== "historial" || historial) return;
    fetch(`${BASE}datos/avisos_emt.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setHistorial(d.avisos ?? []))
      .catch(() => setHistorial("error"));
  }, [vista, historial]);
  useEffect(() => setCuantos(POR_PAGINA), [vista, linea]);

  const ahora = Date.now() / 1000;
  const lista = useMemo(() => {
    let base;
    if (vista === "historial") base = Array.isArray(historial) ? historial.filter((a) => (a.hasta ?? a.quitado ?? ahora) < ahora) : null;
    else if (!Array.isArray(vivos)) base = null;
    else if (vista === "ahora") base = vivos.filter((a) => (a.desde ?? 0) <= ahora && (a.hasta ?? Infinity) >= ahora);
    else base = vivos.filter((a) => (a.desde ?? 0) > ahora).sort((a, b) => a.desde - b.desde);
    if (!base) return null;
    const q = normalizar(linea).replace(/^0+/, "");
    return q ? base.filter((a) => a.lineas.some((l) => normalizar(l) === q) || normalizar(a.titulo).includes(normalizar(linea))) : base;
  }, [vista, vivos, historial, linea, ahora]);

  const error = (vista === "historial" ? historial : vivos) === "error";
  return (
    <div className="space-y-4">
      <p className="pegatina rounded-2xl bg-amarillo p-4 text-[15px] text-[#111]">
        <span className="font-bold">Lo que hemos medido:</span> cuando la EMT avisa de una alteración, sus minutos aciertan menos: un 55 % de las veces,
        frente al 65 % de esas mismas líneas sin aviso (52 avisos comparados).
      </p>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Qué avisos ver">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            role="radio"
            aria-checked={vista === v.id}
            onClick={() => setVista(v.id)}
            className={`boton-pegatina min-h-[44px] rounded-full px-4 text-[16px] ${vista === v.id ? "bg-principal font-bold text-white" : "bg-tarjeta text-tinta"}`}
          >
            {v.texto}
          </button>
        ))}
      </div>

      <label className="flex min-h-[48px] items-center gap-2 pegatina rounded-2xl bg-tarjeta px-4">
        <span className="text-[15px] font-bold text-tinta-2">Línea</span>
        <input
          type="search"
          value={linea}
          onChange={(e) => setLinea(e.target.value)}
          placeholder="Por ejemplo, 27 o Bernabéu"
          className="h-[46px] w-full bg-transparent text-[16px] outline-none placeholder:text-suave"
        />
      </label>

      {error ? (
        <p className="text-[15px] text-suave">Ahora no podemos cargar los avisos de la EMT. Prueba en un rato.</p>
      ) : lista === null ? (
        <div className="h-[140px] animate-pulse rounded-2xl bg-linea" aria-label="Cargando avisos" />
      ) : lista.length === 0 ? (
        <p className="text-[15px] text-suave">
          {linea ? "No hay avisos de esa línea aquí." : vista === "ahora" ? "Ahora mismo la EMT no tiene avisos en vigor." : "No hay avisos."}
        </p>
      ) : (
        <section className="space-y-3" aria-live="polite">
          <p className="text-[14px] text-tinta-2">
            {lista.length} {lista.length === 1 ? "aviso" : "avisos"}
            {vista === "historial" ? " grabados del 4 al 24 de noviembre" : ""}
          </p>
          {lista.slice(0, cuantos).map((a, i) => (
            <TarjetaOficial key={`${a.titulo}${a.desde}${i}`} a={a} />
          ))}
          {cuantos < lista.length && (
            <button onClick={() => setCuantos((n) => n + POR_PAGINA)} className="boton-pegatina min-h-[48px] w-full rounded-xl bg-tarjeta text-[16px] font-bold">
              Ver más ({lista.length - cuantos})
            </button>
          )}
        </section>
      )}
      <p className="text-[13px] text-suave">Fuente: EMT de Madrid. El historial lo grabamos nosotros del canal público de avisos.</p>
    </div>
  );
}
