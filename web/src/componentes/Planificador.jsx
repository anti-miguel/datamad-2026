// Planificador de rutas desde cualquier sitio: elegir un punto (ubicación, sitio de la demo, parada, estación o dirección)
// y ver las opciones con la red de la EMT y el Metro (lib/planificador.js). El primer autobús va con los minutos en directo.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Linea, Etiqueta, Tarjeta, IconoRed } from "./Comunes.jsx";
import { IconoAndar, IconoPin } from "./Iconos.jsx";
import { normalizar, calcularLlegada, ventanaEstrecha } from "../lib/util.js";
import { cargarRed, planificar } from "../lib/planificador.js";
import { consultar } from "../lib/consultar.js";
import { enDirecto, llegadasEmt, paradaEmtViva } from "../lib/emt.js";

const BASE = import.meta.env?.BASE_URL ?? "/";

// Lista de nombres de paradas y estaciones sin repetir, para el buscador
function nombresDeRed(red) {
  const vistos = new Map();
  for (const p of red.paradas.values()) {
    const k = `${p.red}|${normalizar(p.nombre)}`;
    if (!vistos.has(k)) vistos.set(k, { ...p, clave: normalizar(p.nombre) });
  }
  return [...vistos.values()];
}

export function SelectorPunto({ etiqueta, valor, onCambiar, lugares = [] }) {
  const id = useId();
  const [texto, setTexto] = useState(valor?.nombre ?? "");
  const [abierto, setAbierto] = useState(false);
  const [red, setRed] = useState(null);
  const [direcciones, setDirecciones] = useState({ q: "", lista: [] });
  const [gps, setGps] = useState(null); // null | "buscando" | "error"
  const caja = useRef(null);

  useEffect(() => setTexto(valor?.nombre ?? ""), [valor?.nombre]);
  useEffect(() => {
    if (!abierto) return;
    cargarRed().then((r) => setRed(nombresDeRed(r))).catch(() => {});
    const fuera = (e) => caja.current && !caja.current.contains(e.target) && setAbierto(false);
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  const q = normalizar(texto);
  const escribiendo = abierto && q.length >= 3 && texto !== valor?.nombre;
  // Direcciones (OpenStreetMap, a través del EVO), con una pausa para no consultar a cada letra
  useEffect(() => {
    if (!escribiendo) return;
    const t = setTimeout(() => {
      fetch(`${BASE}api/buscar?q=${encodeURIComponent(texto)}`)
        .then((r) => (r.ok ? r.json() : { sitios: [] }))
        .then((d) => setDirecciones({ q, lista: d.sitios ?? [] }))
        .catch(() => setDirecciones({ q, lista: [] }));
    }, 700);
    return () => clearTimeout(t);
  }, [escribiendo, texto, q]);

  const palabras = q.split(/\s+/).filter(Boolean);
  const coincide = (clave) => palabras.every((w) => clave.includes(w));
  const opcionesLugar = lugares.filter((l) => l.lat != null && (!q || texto === valor?.nombre || coincide(normalizar(`${l.nombre} ${l.detalle}`))));
  const opcionesRed = useMemo(
    () => {
      if (!red || !palabras.length || texto === valor?.nombre) return [];
      // primero el nombre exacto («sol» → Sol), luego los que empiezan igual, luego los que tienen una palabra que empieza así
      const puntos = (p) =>
        (p.clave === q ? 0 : p.clave.startsWith(q) ? 1 : p.clave.split(/[\s\-/.]+/).some((w) => w.startsWith(palabras[0])) ? 2 : 3) * 2 +
        (p.red === "metro" ? 0 : 1);
      return red
        .filter((p) => coincide(p.clave))
        .sort((a, b) => puntos(a) - puntos(b) || a.nombre.length - b.nombre.length)
        .slice(0, 6);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [red, q, valor?.nombre],
  );
  const opcionesDir = direcciones.q === q ? direcciones.lista : [];

  function elegir(punto) {
    onCambiar(punto);
    setTexto(punto.nombre);
    setAbierto(false);
  }

  function miUbicacion() {
    if (!navigator.geolocation) return setGps("error");
    setGps("buscando");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setGps(null);
        elegir({ nombre: "Mi ubicación", lat: coords.latitude, lon: coords.longitude });
      },
      () => setGps("error"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  const fila = "flex min-h-[48px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-hundido";
  return (
    <div ref={caja} className="relative">
      <label htmlFor={id} className="mb-1 block text-[13px] font-bold uppercase tracking-wide text-tinta-2">
        {etiqueta}
      </label>
      <input
        id={id}
        type="search"
        value={texto}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        placeholder="Ubicación, parada, estación o dirección"
        autoComplete="off"
        className="pegatina h-[48px] w-full rounded-xl bg-tarjeta px-3 text-[16px] outline-none"
      />
      {gps === "buscando" && <p className="mt-1 text-[13px] text-suave">Buscando tu ubicación…</p>}
      {gps === "error" && <p className="mt-1 text-[13px] text-suave">No tenemos tu ubicación. Escribe un sitio.</p>}
      {abierto && (
        <div className="pegatina absolute inset-x-0 top-full z-40 mt-1 max-h-[340px] overflow-y-auto rounded-xl bg-tarjeta">
          <button onClick={miUbicacion} className={fila}>
            <IconoPin className="h-6 w-6 shrink-0 text-principal" />
            <span className="font-bold text-tinta">Mi ubicación</span>
          </button>
          {opcionesLugar.map((l) => (
            <button key={l.id} onClick={() => elegir({ nombre: l.nombre, detalle: l.detalle, lat: l.lat, lon: l.lon, lugar: l.id })} className={fila}>
              <span className="w-6 shrink-0 text-center text-[18px]" aria-hidden="true">★</span>
              <span className="min-w-0">
                <span className="block font-bold text-tinta">{l.nombre}</span>
                <span className="block text-[13px] text-suave">{l.detalle}</span>
              </span>
            </button>
          ))}
          {opcionesRed.map((p) => (
            <button key={`${p.red}${p.clave}`} onClick={() => elegir({ nombre: p.nombre, detalle: p.red === "metro" ? "Metro" : "Parada de bus EMT", lat: p.lat, lon: p.lon })} className={fila}>
              <span className="origin-left scale-[0.6]">
                <IconoRed red={p.red} />
              </span>
              <span className="-ml-3 min-w-0">
                <span className="block font-bold text-tinta">{p.nombre}</span>
                <span className="block text-[13px] text-suave">{p.red === "metro" ? "Metro" : "Parada de bus EMT"}</span>
              </span>
            </button>
          ))}
          {opcionesDir.map((s, i) => (
            <button key={`d${i}`} onClick={() => elegir(s)} className={fila}>
              <IconoPin className="h-6 w-6 shrink-0 text-suave" />
              <span className="min-w-0">
                <span className="block font-bold text-tinta">{s.nombre}</span>
                <span className="block text-[13px] text-suave">{s.detalle}</span>
              </span>
            </button>
          ))}
          {escribiendo && direcciones.q !== q && <p className="px-3 py-2 text-[13px] text-suave">Buscando direcciones…</p>}
          {opcionesDir.length > 0 && <p className="px-3 pb-2 text-[11px] text-suave">Direcciones: © OpenStreetMap</p>}
        </div>
      )}
    </div>
  );
}

// Minutos en directo del primer autobús con su ventana medida, en corto: «pasa en 10–14 min · Fiable»
function PrimerAutobus({ tramo, andarAntes, datos, contexto }) {
  const [vivo, setVivo] = useState(null);
  const numero = tramo.desde.clave.slice(1);
  useEffect(() => {
    if (!enDirecto()) return;
    let activo = true;
    llegadasEmt(numero)
      .then((d) => activo && setVivo(d.llegadas.filter((l) => String(l.linea) === String(tramo.linea))))
      .catch(() => activo && setVivo("error"));
    return () => {
      activo = false;
    };
  }, [numero, tramo.linea]);
  if (!Array.isArray(vivo)) return null;
  // el primero que da tiempo a coger andando
  const llega = vivo.find((l) => l.minutos >= andarAntes) ?? null;
  if (!llega) return <span className="text-suave">el {tramo.linea} no tiene llegada anunciada</span>;
  const c = datos ? calcularLlegada(datos, { red: "emt", tipo: "intermedia" }, { linea: tramo.linea, minutos: Math.max(1, llega.minutos) }, contexto) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 font-bold text-tinta">
      el {tramo.linea} pasa {c?.v && !ventanaEstrecha(c.v) ? `en ${c.v.desde}–${c.v.hasta} min` : `en ${llega.minutos} min`}
      {c?.r && <Etiqueta p={c.r.p} />}
    </span>
  );
}

// Línea compacta del viaje: andar 1′ › [8] 1′ › [4] 9′ › andar 1′
function Cadena({ tramos }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] text-tinta-2">
      {tramos.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-suave">›</span>}
          {t.tipo === "andar" ? <IconoAndar className="h-4 w-4" /> : <Linea linea={t.linea} red={t.red} />}
          <span className="tabular-nums">{t.minutos}′</span>
        </span>
      ))}
    </div>
  );
}

function Opcion({ o, primera, datos, contexto, onAbrirParada }) {
  const [abierta, setAbierta] = useState(false);
  const viajes = o.tramos.filter((t) => t.tipo === "viaje");
  const primero = viajes[0];
  return (
    <Tarjeta sombra={primera} className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          {primera && (
            <span className="inline-block rounded-md border-2 border-[#111] bg-amarillo px-2 text-[12px] font-bold text-[#111]">RECOMENDADA</span>
          )}
          <Cadena tramos={o.tramos} />
        </div>
        <span className="shrink-0 text-right">
          <span className="cifra block text-[22px] text-principal">≈ {o.total} min</span>
          {o.margen > 0 && <span className="block text-[13px] text-suave">si se tuerce: {o.peor}</span>}
        </span>
      </div>

      <p className="text-[14px] text-tinta-2">
        {primero ? (
          <>
            Subes en <span className="font-bold text-tinta">{primero.desde.nombre}</span>
            {primero.red === "emt" && enDirecto() && (
              <>
                {" · "}
                <PrimerAutobus tramo={primero} andarAntes={o.tramos[0]?.tipo === "andar" ? o.tramos[0].minutos : 0} datos={datos} contexto={contexto} />
              </>
            )}
            {` · ${o.andado} min andando`}
            {o.transbordos ? ` · ${o.transbordos} transbordo` : ""}
          </>
        ) : (
          `${o.total} min andando`
        )}
      </p>

      {viajes.length > 0 && (
        <button
          onClick={() => setAbierta((x) => !x)}
          aria-expanded={abierta}
          className="text-[14px] font-bold text-principal"
        >
          {abierta ? "Ocultar pasos ▴" : "Ver pasos ▾"}
        </button>
      )}
      {abierta && (
        <ol className="space-y-1.5 border-t-2 border-linea pt-2 text-[14px] text-tinta-2">
          {o.tramos.map((t, i) =>
            t.tipo === "andar" ? (
              <li key={i}>
                {t.minutos} min andando {t.transbordo ? "para el cambio en" : "hasta"} {t.hasta}
              </li>
            ) : (
              <li key={i}>
                <span className="font-bold text-tinta">
                  {t.red === "metro" ? "Metro" : "Bus"} {t.linea} → {t.destino}
                </span>
                : de {t.desde.nombre} a {t.hasta.nombre}, {t.paradas} {t.paradas === 1 ? "parada" : "paradas"}, pasa cada {t.cada} min
                {t.red === "emt" && t === primero && (
                  <button onClick={() => onAbrirParada(t.desde)} className="ml-1 font-bold text-principal underline underline-offset-2">
                    ver parada
                  </button>
                )}
              </li>
            ),
          )}
        </ol>
      )}
    </Tarjeta>
  );
}

// Minutos de más que tarda una línea 1 de cada 10 veces (p90 del retraso medido), con lo que suele tocar esperar
function margenMedido(datos, contexto) {
  return (t) => {
    const minutos = Math.min(39, Math.max(1, Math.round(t.cada / 2)));
    const r = datos
      ? consultar(datos, { red: t.red, minutos, hora: contexto?.hora ?? 12, finde: contexto?.finde ?? false, linea: t.linea, tipo: t.red === "metro" ? "estacion" : "intermedia" })
      : null;
    return r ? Math.max(0, r.p90) : t.red === "metro" ? 1 : 4;
  };
}

export function OpcionesPlan({ desde, hasta, datos, contexto, onAbrirParada }) {
  const [estado, setEstado] = useState({ cargando: true, opciones: [] });
  useEffect(() => {
    let activo = true;
    setEstado({ cargando: true, opciones: [] });
    cargarRed()
      .then((red) => activo && setEstado({ cargando: false, opciones: planificar(red, desde, hasta, { hora: contexto?.hora, margen: margenMedido(datos, contexto) }) }))
      .catch(() => activo && setEstado({ cargando: false, error: true, opciones: [] }));
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde.lat, desde.lon, hasta.lat, hasta.lon, Boolean(datos)]);

  function abrir(p) {
    onAbrirParada(`emt-${p.clave.slice(1)}`, paradaEmtViva({ id: p.clave.slice(1), nombre: p.nombre, lat: p.lat, lon: p.lon, lineas: [] }));
  }

  if (estado.cargando) return <div className="h-[160px] animate-pulse rounded-2xl bg-linea" aria-label="Calculando rutas" />;
  if (estado.error) return <p className="text-[15px] text-suave">No hemos podido cargar la red. Vuelve a intentarlo.</p>;
  if (!estado.opciones.length)
    return (
      <Tarjeta className="p-4">
        <p className="text-[16px] font-bold text-tinta">No encontramos una ruta en bus EMT o Metro con un transbordo como mucho.</p>
        <p className="mt-1 text-[14px] text-suave">De momento el planificador solo usa la EMT y el Metro de Madrid.</p>
      </Tarjeta>
    );
  return (
    <section className="space-y-3" aria-live="polite">
      {estado.opciones.map((o, i) => (
        <Opcion key={i} o={o} primera={i === 0} datos={datos} contexto={contexto} onAbrirParada={abrir} />
      ))}
      <p className="text-[13px] text-suave">
        «Si se tuerce»: lo que tarda 1 de cada 10 veces, según lo que hemos medido. Primero, la que menos se retrasa y menos cansa.
      </p>
    </section>
  );
}
