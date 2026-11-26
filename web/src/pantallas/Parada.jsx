// Pantalla 2: Parada, al estilo de la app de la EMT: todas las líneas que pasan, cuándo llega
// cada una (con la ventana medida), avisos de posible incidencia y «¿dónde te bajas?».
// Los porcentajes y el tablero siguen en la 2b (botón «i» de cada línea).
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fondoMapa } from "../lib/mapa.js";
import { IconoRed, Linea, Etiqueta, Tarjeta, Volver, colorDeLinea } from "../componentes/Comunes.jsx";
import { IconoEstrella, IconoInfo, IconoAviso, IconoCampana } from "../componentes/Iconos.jsx";
import { NOMBRE_RED, horaTexto, ventanaEstrecha, normalizar } from "../lib/util.js";
import { casillas } from "../lib/ventana.js";
import { NombreEditable } from "./Rutas.jsx";
import { incidenciasDelTramo } from "../lib/rutas.js";
import Combo from "../componentes/Combo.jsx";
import { distanciaM, enDirecto } from "../lib/emt.js";
import { cargarRed } from "../lib/planificador.js";
import { cargarFormas, decodificar, metrosEntre, puntoA, recorte } from "../lib/formas.js";

// Sin tiempo real (Cercanías, o el Metro si el Consorcio no responde): cada cuánto pasa cada línea según el horario oficial
function FrecuenciasHorario({ claves: lista, red: modo, hora }) {
  const [lineas, setLineas] = useState(null);
  useEffect(() => {
    let activo = true;
    cargarRed()
      .then((red) => {
        const claves = new Set(lista);
        const vistas = new Map();
        for (const p of red.patrones) {
          if (p.red !== modo) continue;
          const i = p.p.findIndex((c) => claves.has(c));
          if (i < 0 || i === p.p.length - 1) continue; // en la última estación no se sube
          const k = `${p.linea}|${p.destino}`;
          if (!vistas.has(k)) vistas.set(k, { linea: p.linea, destino: p.destino, cada: p.cada });
        }
        // Fuera los servicios sueltos (cada 90 min o más) si la línea tiene otros; «Madrid-Chamartín» → «Chamartín»
        const todas = [...vistas.values()].map((l) => ({ ...l, destino: l.destino.replace(/^Madrid[\s-]+/i, "") }));
        const frecuente = new Set(todas.filter((l) => l.cada < 90).map((l) => l.linea));
        const utiles = todas.filter((l) => l.cada < 90 || !frecuente.has(l.linea));
        if (activo) setLineas(utiles.sort((a, b) => a.linea.localeCompare(b.linea, "es", { numeric: true })));
      })
      .catch(() => activo && setLineas([]));
    return () => {
      activo = false;
    };
  }, [lista.join(",")]);
  if (!lineas?.length) return null;
  const metro = modo === "metro";
  if (metro ? hora >= 1.5 && hora < 6 : hora >= 0.25 && hora < 5.5)
    return (
      <Tarjeta className="p-4">
        <p className="text-[16px] text-tinta">{metro ? "El Metro está cerrado ahora. Abre a las 6:00." : "Cercanías no circula ahora. Empieza hacia las 5:30."}</p>
      </Tarjeta>
    );
  return (
    <Tarjeta className="space-y-2 p-4">
      <p className="text-[15px] text-tinta-2">
        {metro ? "Ahora no tenemos los minutos del Metro en directo." : "Cercanías no da los minutos en directo."} Según el horario oficial:
      </p>
      <ul className="space-y-2">
        {lineas.map((l) => (
          <li key={`${l.linea}${l.destino}`} className="flex items-center gap-3">
            <Linea linea={l.linea} red={modo} grande />
            <span className="text-[16px] text-tinta">
              → {l.destino} · <span className="font-bold">cada {l.cada} min</span>
            </span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

// Minimapa de la parada: dónde está y, encima, el trozo de recorrido de cada línea que pasa por ella
// (unas paradas antes y bastantes después, hacia donde va), para ver por dónde sigue y no solo edificios.
// Recorridos de los horarios oficiales de la EMT y del Metro (datos/red.json); Cercanías e interurbanos aún no.
const ANTES = 0; // solo hacia donde va: el tramo de llegada duplicaba rayas
const DESPUES = 3;
const ZOOM_PARADA = 17; // cerca: se ve en qué acera está la parada y hacia dónde va

// Rumbo en grados (0 = norte) de a hacia b, para girar la flecha del sentido
function rumbo([la1, lo1], [la2, lo2]) {
  const r = Math.PI / 180;
  const y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r);
  const x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

function clavesDeParada(parada, red) {
  if (parada.red === "emt" && /^emt-\d+$/.test(parada.id)) return [`e${parada.id.slice(4)}`];
  if (parada.red === "metro") {
    if (parada.andenes?.length) return parada.andenes.map((a) => `m${a}`);
    const nombre = normalizar(parada.nombre);
    return [...red.paradas.values()].filter((p) => p.red === "metro" && normalizar(p.nombre) === nombre).map((p) => p.clave);
  }
  if (parada.red === "interurbano" && parada.codigo) return [`i${parada.codigo}`];
  if (parada.red === "renfe") {
    if (parada.claves?.length) return parada.claves;
    // la más cercana de Cercanías con ese nombre (las estaciones de Renfe se llaman «Vicálvaro», «Madrid-Atocha»…)
    const nombre = normalizar(parada.nombre);
    return [...red.paradas.values()].filter((p) => p.red === "renfe" && normalizar(p.nombre).includes(nombre)).map((p) => p.clave).slice(0, 2);
  }
  return [];
}

// Líneas ocultas por parada (solo se guardan las de paradas favoritas)
function leerOcultas() {
  try {
    return JSON.parse(localStorage.getItem("lineas_ocultas") || "{}") || {};
  } catch {
    return {};
  }
}
function ocultasGuardadas(id) {
  const v = leerOcultas()[id];
  return Array.isArray(v) ? v : [];
}
function guardarOcultas(id, lista) {
  try {
    const todo = leerOcultas();
    if (lista.length) todo[id] = lista;
    else delete todo[id];
    localStorage.setItem("lineas_ocultas", JSON.stringify(todo));
  } catch {
    // sin almacenamiento: la selección dura lo que la visita
  }
}

function Minimapa({ parada, ocultas = [] }) {
  const caja = useRef(null);
  const { lat, lon } = parada;
  useEffect(() => {
    let vivo = true;
    const mapa = L.map(caja.current, {
      center: [lat, lon],
      zoom: 17,
      dragging: false,
      zoomControl: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    fondoMapa(mapa);
    const punto = () =>
      L.circleMarker([lat, lon], { radius: 9, color: "#111111", weight: 3, fillColor: "#FFE15A", fillOpacity: 1 }).addTo(mapa);
    let marca = punto();
    Promise.all([cargarRed(), cargarFormas().catch(() => [])])
      .then(([red, formas]) => {
        if (!vivo) return;
        const claves = new Set(clavesDeParada(parada, red));
        if (["metro", "renfe"].includes(parada.red))
          for (const q of red.paradas.values())
            if ((q.red === "metro" || q.red === "renfe") && q.red !== parada.red && distanciaM(q, parada) < 250) claves.add(q.clave);
        if (!claves.size) return;
        const trozos = [];
        const vistos = new Set();
        red.patrones.forEach((p, pi) => {
          const i = p.p.findIndex((c) => claves.has(c));
          if (i < 0 || i === p.p.length - 1) return;
          const k = `${p.red}${p.linea}${p.p[i + 1]}`; // una vez por línea y sentido
          if (vistos.has(k) || (p.red === parada.red && ocultas.includes(p.linea))) return;
          vistos.add(k);
          const aqui = red.paradas.get(p.p[i]);
          const siguiente = red.paradas.get(p.p[i + 1]);
          // por la calle (trazado real) si lo hay; si no, en recto de parada a parada
          const porCalle = recorte(decodificar(formas[pi]), [aqui.lat, aqui.lon], null, 400, [siguiente.lat, siguiente.lon]);
          const camino =
            porCalle ??
            p.p.slice(Math.max(0, i - ANTES), Math.min(p.p.length, i + DESPUES + 1)).map((c) => {
              const q = red.paradas.get(c);
              return [q.lat, q.lon];
            });
          trozos.push({ camino, porCalle: Boolean(porCalle), color: colorDeLinea(p.red, p.linea), desde: [aqui.lat, aqui.lon], hacia: [siguiente.lat, siguiente.lon] });
        });
        if (!trozos.length) return;
        for (const t of trozos) L.polyline(t.camino, { color: "#111111", weight: 5.5, opacity: 0.85, interactive: false }).addTo(mapa);
        for (const t of trozos) L.polyline(t.camino, { color: t.color, weight: 3, opacity: 1, interactive: false }).addTo(mapa);
        // flecha del sentido: un poco después de la parada, girada hacia la siguiente
        const direcciones = new Set(); // una flecha por dirección, aunque pasen varias líneas
        for (const t of trozos) {
          // a unos 30 m de la parada sobre su camino (cerca con zoom 18), girada hacia donde va
          const enCalle = t.porCalle ? metrosEntre(t.camino[0], t.camino[1]) : 0; // el tramito de la parada a la calle
          const sitio = puntoA(t.camino, enCalle + 25) ?? { punto: t.desde, rumbo: rumbo(t.desde, t.hacia) };
          const sector = Math.round(sitio.rumbo / 30);
          if (direcciones.has(sector)) continue;
          direcciones.add(sector);
          const pos = sitio.punto;
          const icono = L.divIcon({
            className: "",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html: `<span class="flecha-sentido" style="transform:rotate(${sitio.rumbo}deg);background:${t.color}">↑</span>`,
          });
          L.marker(pos, { icon: icono, interactive: false, keyboard: false }).addTo(mapa);
        }
        marca.remove();
        marca = punto(); // la parada, encima de las líneas
        mapa.setView([lat, lon], ZOOM_PARADA); // centrado en la parada y cerca, aunque las líneas sigan fuera
      })
      .catch(() => {});
    // Si cambia el ancho (girar el móvil), el mapa se recoloca para no dejar zonas grises
    const observador = new ResizeObserver(() => mapa.invalidateSize());
    observador.observe(caja.current);
    return () => {
      vivo = false;
      observador.disconnect();
      mapa.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, parada.id, ocultas.join(",")]);
  return <div ref={caja} className="mapa-yavoy pegatina h-[180px] overflow-hidden rounded-2xl" role="img" aria-label="Mapa de la parada y de las líneas que pasan por ella" />;
}

// Tarjetas grises vacías mientras carga fiabilidad.json
export function ParadaCargando() {
  return (
    <div className="space-y-3 animate-pulse" aria-label="Cargando">
      <div className="h-[200px] rounded-2xl bg-linea" />
      <div className="h-[200px] rounded-2xl bg-linea" />
    </div>
  );
}

const ventanaTexto = (l) =>
  l.lejos
    ? "Demasiado lejos para estimar"
    : l.v
      ? ventanaEstrecha(l.v)
        ? `Llega en ${l.minutos} min`
        : `Llega entre ${l.v.desde} y ${l.v.hasta} min`
      : `Llega en ${l.minutos} min`; // sin medida: lo que dice la fuente, tal cual

// Una tarjeta por línea: la siguiente llegada en grande y la de después en pequeño
// Tramo dibujado parada a parada, desde la de subida hasta la de bajada, con las incidencias en su sitio
function TramoDibujado({ recorrido, fin, incidencias, subida }) {
  const tramo = recorrido.slice(0, fin + 1);
  const marca = (i) => incidencias.find((x) => x.posicion === i);
  const filas = [{ nombre: subida, subida: true }, ...tramo];
  return (
    <ol className="mt-3 space-y-0" aria-label="Tu tramo, parada a parada">
      {filas.map((p, i) => {
        const inc = i > 0 ? marca(i - 1) : null;
        const ultima = i === filas.length - 1;
        return (
          <li key={i} className="flex gap-3">
            <span className="flex w-[18px] flex-col items-center">
              <span
                className={`mt-1 h-[14px] w-[14px] shrink-0 rounded-full border-[3px] border-[#111] ${
                  inc ? "bg-rojo" : p.subida || ultima ? "bg-amarillo" : "bg-tarjeta"
                }`}
              />
              {!ultima && <span className="w-[4px] flex-1 bg-[#111]" />}
            </span>
            <span className="pb-2 text-[14px] leading-snug">
              <span className={`${p.subida || ultima ? "font-bold" : ""} ${inc ? "font-bold text-[#7A0F0A]" : "text-tinta"}`}>
                {p.nombre}
              </span>
              {p.subida && <span className="text-suave"> · subes aquí</span>}
              {ultima && <span className="text-suave"> · te bajas · {p.minutos} min de viaje</span>}
              {inc && <span className="block text-[13px] font-bold text-[#7A0F0A]">{inc.texto} · +{inc.retraso} min</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// El recorrido del sentido que lleva a ese destino (si no se reconoce, el primero)
function recorridoHacia(lista, destino) {
  if (!lista?.length) return undefined;
  const d = normalizar(destino ?? "");
  return (
    lista.find((r) => {
      const fin = normalizar(r[r.length - 1].nombre);
      return d && (fin.includes(d) || d.includes(fin));
    }) ?? lista[0]
  );
}

// Metro: una tarjeta por línea con botones para cambiar de sentido
function TarjetaSentidos({ llegadas, recorridos, recorridoFijo, ...resto }) {
  const destinos = [...new Set(llegadas.map((l) => l.destino))];
  const [elegido, setElegido] = useState(destinos[0]);
  const actual = destinos.includes(elegido) ? elegido : destinos[0];
  return (
    <TarjetaLinea
      {...resto}
      llegadas={llegadas.filter((l) => l.destino === actual)}
      recorrido={recorridoFijo ?? recorridoHacia(recorridos, actual)}
      sentidos={[...destinos].sort((a, b) => a.localeCompare(b, "es"))}
      sentido={actual}
      onSentido={setElegido}
    />
  );
}

function TarjetaLinea({ linea, llegadas, red, primera, sentidos, sentido, onSentido, recorrido, avisosLinea, bajada, onBajada, onInfo, incidencias, subida, aproximado, fuente = "la app" }) {
  // Los minutos del Metro son fiables: se enseña su número, sin ventana ni etiqueta
  const [a, b] = red === "metro" ? llegadas.map((x) => x && { ...x, v: null, r: null, lejos: false }) : llegadas;
  const [destinoSel, setDestinoSel] = useState(bajada?.linea === linea ? bajada.codigo : "");
  const parada = recorrido?.find((p) => p.codigo === destinoSel);
  const avisando = bajada?.linea === linea && bajada.codigo === destinoSel;
  // Plegado por defecto para no cargar la pantalla; abierto si ya se eligió una parada
  const [abierto, setAbierto] = useState(Boolean(destinoSel));

  // Posible incidencia sacada de los datos: a esta hora y con lo que anuncia, acierta menos de la mitad de las veces
  const flojo = a.r && a.v && a.r.p < 0.5 ? casillas(a.r).aTiempo : null;

  return (
    <Tarjeta sombra={primera} className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Linea linea={linea} red={red} grande />
            {sentidos?.length > 1 ? (
              <span className="text-[15px] text-suave">Elige sentido</span>
            ) : (
              <span className="truncate text-[17px] text-tinta">→ {a.destino}</span>
            )}
          </div>
          <button
            onClick={onInfo}
            aria-label={`Qué conviene saber del ${linea}`}
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-2 border-[#111] bg-amarillo text-[#111]"
          >
            <IconoInfo />
          </button>
        </div>

        {sentidos?.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={`Sentido del ${linea}`}>
            {sentidos.map((d) => (
              <button
                key={d}
                role="radio"
                aria-checked={sentido === d}
                onClick={() => onSentido(d)}
                className={`boton-pegatina min-h-[40px] rounded-full px-3 text-[15px] ${sentido === d ? "bg-principal font-bold text-white" : "bg-tarjeta"}`}
              >
                → {d}
              </button>
            ))}
          </div>
        )}

        {/* Si abajo ya sale el minuto exacto, no se repite */}
        {(a.lejos || (a.v && !ventanaEstrecha(a.v))) && (
          <p className="mt-3 text-[15px] text-suave">
            {fuente === "la app" ? "La app oficial" : fuente.charAt(0).toUpperCase() + fuente.slice(1)} dice {a.minutos} min
          </p>
        )}
        <p className={`cifra tabular-nums ${a.lejos || (a.v && !ventanaEstrecha(a.v)) ? "mt-1" : "mt-3"} ${primera ? "text-[32px]" : "text-[26px]"}`}>{ventanaTexto(a)}</p>
        {!a.v && !a.lejos && <p className="mt-1 text-[14px] text-suave">Según {fuente === "la app" ? "la app oficial" : fuente}</p>}

        {a.v && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Etiqueta p={a.r.p} relleno />
          </div>
        )}
        {a.r && !["linea", "parada"].includes(a.r.nivel) && <p className="mt-2 text-[14px] text-suave">Estimación general de la red</p>}

        {b && (
          <p className="mt-3 rounded-lg bg-hundido px-3 py-2 text-[15px] text-tinta-2">
            El siguiente: <span className="font-bold text-tinta">{b.v ? (ventanaEstrecha(b.v) ? `en ${b.minutos} min` : `entre ${b.v.desde} y ${b.v.hasta} min`) : red === "metro" ? `en ${b.minutos} min` : `${b.minutos} min según ${fuente}`}</span>
          </p>
        )}
      </div>

      {/* avisos de posible incidencia */}
      {(flojo !== null || avisosLinea.length > 0) && (
        <div className="space-y-2 border-t-[2.5px] border-[#111] bg-amarillo px-4 py-3">
          {flojo !== null && (
            <p className="flex gap-2 text-[15px] font-bold">
              <IconoAviso className="mt-0.5 h-5 w-5 shrink-0" />
              Posible incidencia: a esta hora solo acierta {flojo} de cada 10 veces. Sal con margen.
            </p>
          )}
          {avisosLinea.map((av) => (
            <p key={av.texto} className="flex gap-2 text-[15px]">
              <IconoAviso className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                <span className="font-bold">Viajeros (simulación):</span> {av.texto} · hace {av.hace_min} min
              </span>
            </p>
          ))}
        </div>
      )}

      {/* ¿dónde te bajas? Se pregunta para revisar las incidencias de tu tramo, no de toda la línea */}
      {recorrido && (
        <div className="border-t-[2.5px] border-[#111]">
          <button
            onClick={() => setAbierto((x) => !x)}
            aria-expanded={abierto}
            className="flex min-h-[48px] w-full items-center justify-between px-4 text-left text-[15px] font-bold text-tinta"
          >
            {parada && !abierto ? `Te bajas en ${parada.nombre}` : "¿Dónde te bajas?"}
            <span aria-hidden="true" className={`transition-transform ${abierto ? "rotate-180" : ""}`}>▾</span>
          </button>
          {abierto && (
          <div className="px-4 pb-3">
          <p className="mb-2 text-[13px] text-suave">Revisamos solo tu tramo.</p>
          <Combo
            id={`bajada-${linea}`}
            valor={destinoSel}
            onCambiar={setDestinoSel}
            placeholder="Escribe tu parada (por ejemplo, «s»)"
            opciones={recorrido.map((p, k) => {
              const conIncidencia = incidencias.some((x) => x.red === red && String(x.linea) === String(linea) && x.parada === p.nombre);
              return {
                valor: p.codigo,
                texto: p.nombre,
                detalle: `${k + 1} ${k === 0 ? "parada" : "paradas"} · ${p.minutos} min${conIncidencia ? " · hay una incidencia" : ""}`,
                marca: (
                  <span
                    className={`flex h-[28px] min-w-[28px] shrink-0 items-center justify-center rounded-full border-2 border-[#111] text-[13px] font-bold ${
                      conIncidencia ? "bg-rojo text-white" : "bg-hundido"
                    }`}
                  >
                    {k + 1}
                  </span>
                ),
              };
            })}
          />
          {parada && (() => {
            const inc = incidenciasDelTramo(incidencias, red, linea, recorrido, parada.nombre);
            const afecta = inc.enTramo.length > 0;
            return (
              <>
                <div
                  className={`mt-3 rounded-xl border-2 border-[#111] px-3 py-2 ${afecta ? "bg-[#FFD9D6]" : "bg-[#C9F2D6]"}`}
                  role="status"
                >
                  <p className={`text-[15px] font-bold ${afecta ? "text-[#7A0F0A]" : "text-[#0C4A22]"}`}>
                    {afecta
                      ? `Incidencia en tu tramo: puedes tardar ${inc.retraso} min más de lo normal`
                      : "Tu tramo está despejado"}
                  </p>
                  {inc.despues.map((x) => (
                    <p key={x.parada} className="text-[13px] text-tinta-2">
                      Más adelante, en {x.parada}: {x.texto.toLowerCase()}. No te afecta.
                    </p>
                  ))}
                </div>
                <p className="mt-3 text-[16px] text-tinta">
                  Llegas a <span className="font-bold">{parada.nombre}</span>{" "}
                  {a.v ? (
                    <>
                      en{" "}
                      <span className="cifra text-[20px] text-principal">
                        {ventanaEstrecha(a.v)
                          ? `${a.minutos + parada.minutos + inc.retraso} min`
                          : `${a.v.desde + parada.minutos + inc.retraso}–${a.v.hasta + parada.minutos + inc.retraso} min`}
                      </span>
                    </>
                  ) : (
                    `unos ${parada.minutos + inc.retraso} min después de subir`
                  )}
                </p>
                <p className="text-[13px] text-suave">
                  Espera medida + {parada.minutos} min de viaje según {aproximado ? "un horario aproximado" : "el horario oficial"}
                  {afecta ? ` + ${inc.retraso} min de la incidencia` : ""}.
                </p>
                <TramoDibujado recorrido={recorrido} fin={inc.fin} incidencias={inc.enTramo} subida={subida} />
                <button
                  onClick={() => onBajada(avisando ? null : { linea, codigo: parada.codigo, nombre: parada.nombre })}
                  aria-pressed={avisando}
                  className={`boton-pegatina mt-2 flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-[15px] font-bold ${
                    avisando ? "bg-verde text-white" : "bg-tarjeta"
                  }`}
                >
                  <IconoCampana className="h-5 w-5" />
                  {avisando ? `Te avisamos una parada antes de ${parada.nombre}` : "Avisarme una parada antes de bajar"}
                </button>
              </>
            );
          })()}
          </div>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

export default function Parada({
  parada, llegadas, contexto, favorita, nombre, onRenombrar, onFavorita, onVolver, onInfoLinea,
  cargando, error, onReintentar, avisos = [], bajada, onBajada, incidencias = [],
}) {
  const tipoDia = contexto.finde ? "Fin de semana" : "Laborable";
  const propio = nombre && nombre !== parada.nombre;

  // «¿Dónde te bajas?» también en las paradas que no son de la demo: las paradas siguientes de cada línea
  // y los minutos hasta cada una, de los horarios oficiales (datos/red.json). Mismo formato que demo.json.
  const [recorridosVivos, setRecorridosVivos] = useState({});
  useEffect(() => {
    let activo = true;
    cargarRed()
      .then((red) => {
        const claves = new Set(clavesDeParada(parada, red));
        if (!claves.size) return;
        const out = {};
        for (const p of red.patrones) {
          const i = p.p.findIndex((c) => claves.has(c));
          if (i < 0 || i === p.p.length - 1) continue;
          (out[p.linea] ??= []).push(p.p.slice(i + 1).map((c, k) => ({
            codigo: c.slice(1),
            nombre: red.paradas.get(c).nombre,
            minutos: Math.max(1, Math.round(p.t[i + 1 + k] - p.t[i])),
          })));
        }
        if (activo) setRecorridosVivos(out);
      })
      .catch(() => {});
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parada.id]);

  // Agrupa las llegadas por línea, en el orden en que llega la primera de cada una
  const porLinea = [];
  [...llegadas]
    .sort((x, y) => x.minutos - y.minutos)
    .forEach((l) => {
      const g = porLinea.find((x) => x.linea === l.linea);
      if (g) g.llegadas.push(l);
      else porLinea.push({ linea: l.linea, llegadas: [l] });
    });
  // Metro: orden fijo por número de línea, para que las tarjetas no salten cada 15 s mientras eliges sentido
  if (parada.red === "metro") porLinea.sort((x, y) => x.linea.localeCompare(y.linea, "es", { numeric: true }));

  // Líneas ocultas: se tocan en la fila de líneas. En una favorita se recuerdan (localStorage «lineas_ocultas»).
  const [sel, setSel] = useState(() => ({ id: parada.id, ocultas: ocultasGuardadas(parada.id) }));
  const ocultas = sel.id === parada.id ? sel.ocultas : ocultasGuardadas(parada.id);
  const alternarLinea = (l) => setSel({ id: parada.id, ocultas: ocultas.includes(l) ? ocultas.filter((x) => x !== l) : [...ocultas, l] });
  useEffect(() => {
    if (sel.id !== parada.id) return;
    guardarOcultas(parada.id, favorita ? sel.ocultas : []);
  }, [sel, favorita, parada.id]);
  const todasLineas = [...new Set([...porLinea.map((g) => g.linea), ...(parada.lineas ?? [])])].sort((a, b) =>
    a.localeCompare(b, "es", { numeric: true }),
  );
  const visibles = porLinea.filter((g) => !ocultas.includes(g.linea));

  return (
    <div className="space-y-4">
      <div>
        <Volver texto="Mis paradas" onClick={onVolver} />
        <div className="flex items-start justify-between gap-3">
          <IconoRed red={parada.red} grande />
          <div className="min-w-0 flex-1">
            <NombreEditable
              nombre={nombre ?? parada.nombre}
              onCambiar={onRenombrar}
              etiqueta="Cambiar el nombre de esta parada"
              className="titulo text-[28px] leading-tight text-tinta"
            />
            {propio && <p className="mt-1 text-[15px] font-bold text-tinta-2">{parada.nombre}</p>}
            <p className="text-[15px] text-suave">
              {parada.etiqueta ?? `${NOMBRE_RED[parada.red]} · parada ${parada.id.split("-")[1]}`}
            </p>
          </div>
          <button
            onClick={onFavorita}
            aria-pressed={favorita}
            aria-label={favorita ? "Quitar de favoritas" : "Añadir a favoritas"}
            className="boton-pegatina flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-2xl bg-amarillo text-[#111]"
          >
            <IconoEstrella llena={favorita} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Líneas: toca una para ocultarla o enseñarla">
          {todasLineas.map((l) => {
            const oculta = ocultas.includes(l);
            return (
              <button
                key={l}
                onClick={() => alternarLinea(l)}
                aria-pressed={!oculta}
                aria-label={`${oculta ? "Enseñar" : "Ocultar"} la línea ${l}`}
                className={`rounded-lg transition-opacity ${oculta ? "opacity-30 grayscale" : ""}`}
              >
                <Linea linea={l} red={parada.red} />
              </button>
            );
          })}
        </div>
        {todasLineas.length > 1 && (
          <p className="mt-1.5 text-[13px] text-suave">
            {ocultas.length ? (
              <>
                {ocultas.length === 1 ? "1 línea oculta" : `${ocultas.length} líneas ocultas`}
                {favorita ? " · se recuerda en favoritas" : " · guarda la parada en ★ para recordarlo"} ·{" "}
                <button onClick={() => setSel({ id: parada.id, ocultas: [] })} className="font-bold text-principal underline">
                  Ver todas
                </button>
              </>
            ) : (
              "Toca una línea para ocultarla"
            )}
          </p>
        )}
      </div>

      {parada.lat != null && parada.lon != null && <Minimapa parada={parada} ocultas={ocultas} />}

      {!parada.vivo && enDirecto() && !cargando && !error && (
        <p className="rounded-xl border-2 border-[#111] bg-aviso-simulado px-3 py-2 text-[15px] text-[#111]">
          <span className="font-bold">Minutos de ejemplo.</span> Aquí todavía no tenemos el tiempo real: los minutos son de la demo. Las ventanas y la fiabilidad sí son las que hemos medido.
        </p>
      )}

      {error ? (
        <Tarjeta className="space-y-3 p-4">
          <p className="text-[16px] text-tinta">No hemos podido cargar los datos. Vuelve a intentarlo.</p>
          <button onClick={onReintentar} className="boton-pegatina min-h-[44px] rounded-xl bg-principal px-5 font-bold text-white">
            Reintentar
          </button>
        </Tarjeta>
      ) : cargando ? (
        <ParadaCargando />
      ) : (
        <>
          {visibles.map((g, i) => (parada.red === "metro" ? (
            <TarjetaSentidos
              key={g.linea}
              linea={g.linea}
              llegadas={g.llegadas}
              red={parada.red}
              primera={i === 0}
              recorridos={recorridosVivos[g.linea]}
              recorridoFijo={parada.recorridos?.[g.linea]}
              avisosLinea={avisos.filter((a) => a.linea === g.linea)}
              bajada={bajada}
              onBajada={onBajada}
              onInfo={() => onInfoLinea(g.linea)}
              incidencias={incidencias}
              subida={parada.nombre}
              aproximado={parada.recorrido_aproximado}
              fuente={parada.vivo ? "el Metro" : "la app"}
            />
          ) : (
            <TarjetaLinea
              key={g.linea}
              linea={g.linea}
              llegadas={g.llegadas}
              red={parada.red}
              primera={i === 0}
              recorrido={parada.recorridos?.[g.linea] ?? recorridoHacia(recorridosVivos[g.linea], g.llegadas[0]?.destino)}
              avisosLinea={avisos.filter((a) => a.linea === g.linea)}
              bajada={bajada}
              onBajada={onBajada}
              onInfo={() => onInfoLinea(g.linea)}
              incidencias={incidencias}
              subida={parada.nombre}
              aproximado={parada.recorrido_aproximado}
              fuente={parada.vivo ? ({ metro: "el Metro", interurbano: "el Consorcio" }[parada.red] ?? "la EMT") : "la app"}
            />
          )))}
          {porLinea.length === 0 && parada.red === "metro" && parada.andenes && (
            <FrecuenciasHorario claves={parada.andenes.map((a) => `m${a}`)} red="metro" hora={contexto.hora} />
          )}
          {porLinea.length === 0 && parada.red === "renfe" && parada.claves && <FrecuenciasHorario claves={parada.claves} red="renfe" hora={contexto.hora} />}
          {porLinea.length === 0 && !(parada.red === "metro" && parada.andenes && parada.sinDirecto) && !(parada.red === "renfe" && parada.claves) && (
            <Tarjeta className="p-4">
              <p className="text-[16px] text-tinta">
                {parada.red === "metro"
                  ? parada.sinDirecto
                    ? "Ahora no podemos darte los minutos del Metro."
                    : "Ahora mismo el Metro no anuncia ningún tren en esta estación."
                  : parada.sinDirecto
                    ? "Ahora no podemos consultar la EMT. Prueba otra vez en un rato."
                    : "Ahora mismo la EMT no anuncia ningún autobús en esta parada."}
              </p>
            </Tarjeta>
          )}
          <p className="text-[13px] text-suave">
            {parada.vivo
              ? parada.red === "renfe"
                ? `${tipoDia}, ${horaTexto(contexto.hora)} · frecuencias del horario oficial de Renfe Cercanías`
                : parada.red === "metro" && parada.sinDirecto
                ? `${tipoDia}, ${horaTexto(contexto.hora)} · frecuencias del horario oficial del Metro · Fuente: Consorcio Regional de Transportes de Madrid`
                : parada.red === "metro" || parada.red === "interurbano"
                ? `${tipoDia}, ${horaTexto(contexto.hora)} · minutos en directo del Consorcio, se actualizan cada 15 s${parada.red === "metro" ? "" : " · ventanas medidas"} · Fuente: Consorcio Regional de Transportes de Madrid`
                : `${tipoDia}, ${horaTexto(contexto.hora)} · minutos en directo de la EMT, se actualizan cada 15 s · ventanas medidas · Powered by EMT de Madrid`
              : `${tipoDia}, ${horaTexto(contexto.hora)} · minutos de la app de demostración, ventanas medidas`}
          </p>
        </>
      )}
    </div>
  );
}
