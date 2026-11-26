// Planificador de rutas desde cualquier sitio: elegir un punto (ubicación, sitio de la demo, parada, estación o dirección)
// y ver las opciones con la red de la EMT y el Metro (lib/planificador.js). El primer autobús va con los minutos en directo.
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Linea, Etiqueta, Tarjeta, IconoRed, colorDeLinea } from "./Comunes.jsx";
import { Paso, Hito } from "./Pasos.jsx";
import { IconoAndar, IconoPin, IconoTransbordo, IconoCampana, IconoReloj } from "./Iconos.jsx";
import Vagones from "./Vagones.jsx";
import { normalizar, calcularLlegada, ventanaEstrecha } from "../lib/util.js";
import { cargarRed, planificar } from "../lib/planificador.js";
import { consultar } from "../lib/consultar.js";
import { enDirecto, llegadasEmt, paradaEmtViva } from "../lib/emt.js";
import MapaRuta from "./MapaRuta.jsx";

const BASE = import.meta.env?.BASE_URL ?? "/";

// ¿Se usan los datos en directo? Solo si sales ahora (y no en el modo de ensayo): si sales o llegas a otra hora,
// los autobuses de ahora no sirven de nada.
const Vivo = createContext(true);
const useVivo = () => useContext(Vivo) && enDirecto();

// Decimal (8.5) -> "8:30"
const horaTexto = (h) => `${Math.floor(((h % 24) + 24) % 24)}:${String(Math.round((((h % 1) + 1) % 1) * 60) % 60).padStart(2, "0")}`;

const ETIQUETA_RED = { metro: "Metro", emt: "Parada de bus EMT", interurbano: "Parada de interurbano", renfe: "Cercanías" };

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
        (p.clave === q ? 0 : p.clave.startsWith(q) ? 1 : p.clave.split(/[\s\-/.]+/).some((w) => w.startsWith(palabras[0])) ? 2 : 3) * 4 +
        ({ metro: 0, renfe: 1, emt: 2, interurbano: 3 }[p.red] ?? 3);
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
            <button key={`${p.red}${p.clave}`} onClick={() => elegir({ nombre: p.nombre, detalle: ETIQUETA_RED[p.red], lat: p.lat, lon: p.lon })} className={fila}>
              <span className="origin-left scale-[0.6]">
                <IconoRed red={p.red} />
              </span>
              <span className="-ml-3 min-w-0">
                <span className="block font-bold text-tinta">{p.nombre}</span>
                <span className="block text-[13px] text-suave">{ETIQUETA_RED[p.red]}</span>
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
  const enVivo = useVivo();
  const [vivo, setVivo] = useState(null);
  const numero = tramo.desde.clave.slice(1);
  useEffect(() => {
    if (!enVivo) return;
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

// Cuándo pasa el vehículo de un tramo, para la tarjeta amarilla de los pasos.
// EMT: minutos en directo (el primero que da tiempo a coger) con la ventana medida. Metro: cada cuánto pasa.
function EsperaTramo({ t, llegasEn, datos, contexto }) {
  const enVivo = useVivo();
  const [vivo, setVivo] = useState(null);
  const numero = t.red === "emt" ? t.desde.clave.slice(1) : null;
  useEffect(() => {
    if (!numero || !enVivo) return;
    let activo = true;
    llegadasEmt(numero)
      .then((d) => activo && setVivo(d.llegadas.filter((l) => String(l.linea) === String(t.linea))))
      .catch(() => activo && setVivo("error"));
    return () => {
      activo = false;
    };
  }, [numero, t.linea]);
  const llega = Array.isArray(vivo) ? vivo.find((l) => l.minutos >= llegasEn) ?? null : null;
  const c = llega && datos ? calcularLlegada(datos, { red: "emt", tipo: "intermedia" }, { linea: t.linea, minutos: Math.max(1, llega.minutos) }, contexto) : null;
  const titulo = llega
    ? c?.v && !ventanaEstrecha(c.v)
      ? `Pasa entre ${c.v.desde} y ${c.v.hasta} min`
      : `Pasa en ${llega.minutos} min`
    : `Pasa cada ${t.cada} min`;
  return (
    <div className="pegatina flex w-full items-start gap-3 rounded-xl bg-amarillo px-3 py-2.5 text-[#111]">
      <span className="pt-0.5">
        <Linea linea={t.linea} red={t.red} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-bold leading-snug">{titulo}</span>
        <span className="mt-0.5 block text-[14px] text-tinta-2">
          Desde {t.desde.nombre}
          {llega ? ` · la EMT dice ${llega.minutos} min` : t.red !== "emt" ? " · horario oficial" : ""} · viaje {t.minutos} min
        </span>
        {c?.r && (
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <Etiqueta p={c.r.p} />
          </span>
        )}
        {Array.isArray(vivo) && !llega && (
          <span className="mt-1 block text-[13px] text-tinta-2">Ahora la EMT no anuncia ningún {t.linea} que te dé tiempo a coger.</span>
        )}
      </span>
    </div>
  );
}

// Pasos de una opción, con el mismo dibujo que las rutas de la demo: hitos, tramos de color y tramos andando punteados
function leerVagones() {
  try {
    return JSON.parse(localStorage.getItem("vagones")) ?? {};
  } catch {
    return {};
  }
}

function PasosRuta({ o, desde, hasta, datos, contexto, onAbrirParada }) {
  const [avisos, setAvisos] = useState({});
  const [vagones, setVagones] = useState(leerVagones);
  function cambiarVagon(clave, v) {
    const nuevos = { ...vagones, [clave]: v };
    setVagones(nuevos);
    try {
      localStorage.setItem("vagones", JSON.stringify(nuevos));
    } catch {
      // sin almacenamiento dura hasta recargar
    }
  }
  const filas = [];
  let reloj = 0; // minutos hasta llegar a cada parada (andando, esperando y viajando), para coger el autobús que da tiempo
  let anterior = null; // último tramo en vehículo, para el transbordo
  o.tramos.forEach((t, i) => {
    if (t.tipo === "andar") {
      reloj += t.minutos;
      if (t.transbordo && anterior) return; // se pinta dentro del transbordo
      if (i === o.tramos.length - 1 && t.minutos <= 0) return;
      filas.push(
        <Paso key={`a${i}`} punteado>
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-hundido px-3 py-2">
            <IconoAndar />
            <span className="text-[15px] font-bold text-tinta">{t.hasta === "tu destino" ? "Andando a tu destino" : `Andando a ${t.hasta}`}</span>
            <span className="ml-auto shrink-0 text-[14px] text-tinta-2">{t.minutos} min</span>
          </div>
        </Paso>,
      );
      return;
    }
    const color = colorDeLinea(t.red, t.linea);
    if (anterior) {
      const andando = o.tramos[i - 1]?.tipo === "andar" && o.tramos[i - 1].transbordo ? o.tramos[i - 1].minutos : 0;
      filas.push(<Hito key={`h${i}`} texto={anterior.red === "metro" ? `Metro ${anterior.hasta.nombre}` : anterior.hasta.nombre} />);
      filas.push(
        <Paso key={`t${i}`} punteado>
          <div className="pegatina mt-2 flex items-center gap-2 rounded-xl bg-aviso-simulado px-3 py-2">
            <IconoTransbordo />
            <span className="text-[15px] font-bold text-tinta">
              Transbordo en {anterior.hasta.nombre}: {anterior.red === t.red && t.red === "metro" ? `de la línea ${anterior.linea} a la ${t.linea}` : `del ${anterior.linea} al ${t.linea}`}
            </span>
            <span className="ml-auto shrink-0 text-[14px] text-tinta-2">{Math.max(1, andando)} min</span>
          </div>
        </Paso>,
      );
    }
    const llegasEn = Math.round(reloj);
    reloj += t.cada / 2 + t.minutos;
    // después de un transbordo en la misma estación no se repite su nombre
    if (!anterior || normalizar(anterior.hasta.nombre) !== normalizar(t.desde.nombre))
      filas.push(<Hito key={`s${i}`} texto={t.red === "metro" ? `Metro ${t.desde.nombre}` : t.desde.nombre} />);
    filas.push(
      <Paso key={`v${i}`} color={color}>
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <Linea linea={t.linea} red={t.red} grande />
            <span className="text-[16px] font-bold text-tinta">Dirección {t.destino}</span>
          </div>
          <EsperaTramo t={t} llegasEn={llegasEn} datos={datos} contexto={contexto} />
          {t.entreMedias?.length > 0 && (
            <details className="text-[14px] text-tinta-2">
              <summary className="min-h-[36px] py-1.5">
                {t.entreMedias.length} {t.entreMedias.length === 1 ? "parada" : "paradas"} entre medias
              </summary>
              <p>{t.entreMedias.join(" · ")}</p>
            </details>
          )}
          {t.red === "metro" &&
            (() => {
              const siguiente = o.tramos.slice(i + 1).find((x) => x.tipo === "viaje");
              const clave = `plan-${t.linea}-${t.hasta.clave}`;
              return (
                <Vagones
                  total={6}
                  numeros={vagones[clave] ?? []}
                  motivo={siguiente ? `para hacer el transbordo al ${siguiente.linea} en ${t.hasta.nombre}` : `para salir antes en ${t.hasta.nombre}`}
                  color={color}
                  onCambiar={(n) => cambiarVagon(clave, n)}
                />
              );
            })()}
          {t.red === "emt" && (
            <button onClick={() => onAbrirParada(t.desde)} className="min-h-[36px] text-[14px] font-bold text-principal underline underline-offset-2">
              Ver la parada {t.desde.nombre}
            </button>
          )}
          <button
            onClick={() => setAvisos((a) => ({ ...a, [i]: !a[i] }))}
            aria-pressed={!!avisos[i]}
            className={`flex min-h-[44px] w-full items-center gap-2 text-left text-[14px] font-bold ${
              avisos[i] ? "boton-pegatina rounded-xl bg-verde px-3 text-white" : "text-tinta-2"
            }`}
          >
            <IconoCampana className="h-5 w-5 shrink-0" />
            {avisos[i] ? `Te avisamos una parada antes de ${t.hasta.nombre}` : "Avisarme antes de bajar"}
          </button>
        </div>
      </Paso>,
    );
    anterior = t;
  });
  if (anterior) filas.splice(filas.length - (o.tramos[o.tramos.length - 1]?.tipo === "andar" ? 1 : 0), 0, <Hito key="fin-v" texto={anterior.red === "metro" ? `Metro ${anterior.hasta.nombre}` : anterior.hasta.nombre} />);
  return (
    <div>
      <Hito texto={desde?.nombre ?? "Salida"} sub="Salida" />
      {filas}
      <Hito texto={hasta?.nombre ?? "Llegada"} sub="Llegada" final />
    </div>
  );
}

// Cabecera y resumen de una opción (se repiten en la lista y en el viaje iniciado)
function Resumen({ o, primera, datos, contexto }) {
  const vivo = useVivo();
  const viajes = o.tramos.filter((t) => t.tipo === "viaje");
  const primero = viajes[0];
  return (
    <>
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
              {primero.red === "emt" && vivo && (
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
    </>
  );
}

function Opcion({ o, primera, datos, contexto, onIniciar }) {
  return (
    <Tarjeta sombra={primera} className="space-y-2 p-4">
      <Resumen o={o} primera={primera} datos={datos} contexto={contexto} />
      <button onClick={onIniciar} className="boton-pegatina min-h-[48px] w-full rounded-xl bg-principal text-[17px] font-bold text-white">
        Iniciar
      </button>
    </Tarjeta>
  );
}

// Viaje iniciado: solo esta ruta, con el mapa en directo (interruptor, apagado por defecto) y los pasos
// Mismo esquema que el detalle de las rutas de Alex (pantallas/Rutas.jsx → DetalleRuta): «Quiero llegar antes de las…»,
// «Si sales ahora…», «Lo más seguro / Voy con prisa», y en los pasos, vagones y aviso antes de bajar.

function Viaje({ o, primera, datos, contexto, onAbrirParada, desde, hasta, onSalir, onGuardar, guardada, momento }) {
  const vivo = useVivo();
  const [mapa, setMapa] = useState(false);
  const [modo, setModo] = useState("segura");
  const [primerBus, setPrimerBus] = useState(null); // minutos del primer autobús que da tiempo a coger (EMT en directo)
  useEffect(() => {
    window.scrollTo(0, 0); // entre llaves: en navegadores nuevos scrollTo devuelve una promesa y React la tomaría por limpieza
  }, []);

  // «Si sales ahora»: con el primer autobús de la EMT en directo, cuánto falta para tener que salir
  const iPrimero = o.tramos.findIndex((t) => t.tipo === "viaje");
  const primero = o.tramos[iPrimero];
  const andarAntes = o.tramos.slice(0, iPrimero).reduce((s, t) => s + (t.tipo === "andar" ? t.minutos : 0), 0);
  useEffect(() => {
    if (!primero || primero.red !== "emt" || !vivo) return;
    let activo = true;
    llegadasEmt(primero.desde.clave.slice(1))
      .then((d) => {
        const l = d.llegadas.find((x) => String(x.linea) === String(primero.linea) && x.minutos >= andarAntes);
        if (activo) setPrimerBus(l ? l.minutos : null);
      })
      .catch(() => {});
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // «Arriesgado» y el selector «Lo más seguro / Voy con prisa» solo tienen sentido si la ruta lleva algo que de verdad
  // se retrasa (el bus) y el peor caso añade al menos 5 min. El Metro casi nunca falla en llegar: su problema es que va lleno.
  const soloMetro = o.tramos.every((t) => t.tipo !== "viaje" || t.red === "metro");
  const hayRiesgo = !soloMetro && o.peor - o.total >= 5;
  const total = hayRiesgo && modo === "rapida" ? o.total : o.peor; // con prisa, el tiempo normal; lo seguro, el peor caso medido
  const salAntes = primerBus != null ? primerBus - andarAntes : null;
  // la hora se eligió antes de buscar: «llegar antes de» -> a qué hora salir; «salir a» o «ahora» -> a qué hora llegas
  const horaPedida = momento?.tipo === "ahora" ? contexto?.hora ?? 0 : momento?.horaDecimal ?? contexto?.hora ?? 0;
  const titular =
    momento?.tipo === "llegar"
      ? `Sal a las ${horaTexto(horaPedida - total / 60)}`
      : `Llegas a las ${horaTexto(horaPedida + total / 60)}`;
  const subtitulo =
    momento?.tipo === "llegar" ? `para llegar antes de las ${horaTexto(horaPedida)}` : momento?.tipo === "salir" ? `si sales a las ${horaTexto(horaPedida)}` : "si sales ahora";

  return (
    <div className="space-y-3">
      <button onClick={onSalir} className="min-h-[44px] text-[16px] font-bold text-principal">
        ← Otras opciones
      </button>

      {/* ¿cuándo salgo / cuándo llego? (como en las rutas de la demo, con la hora elegida antes de buscar) */}
      <Tarjeta sombra className="!bg-amarillo p-4">
        <p className="text-[15px] font-bold">{subtitulo.charAt(0).toUpperCase() + subtitulo.slice(1)}</p>
        <p className="cifra mt-1 text-[34px] tabular-nums">{titular}</p>
        <p className="mt-1 text-[15px]">
          El viaje dura {o.total === o.peor ? `${o.total} min` : `${o.total}–${o.peor} min`} · {o.transbordos === 1 ? "1 transbordo" : `${o.transbordos} transbordos`}
        </p>
        {hayRiesgo && modo === "rapida" && (
          <p className="mt-2 inline-block rounded-md border-2 border-[#111] bg-rojo px-2 py-0.5 text-[14px] font-bold text-white">
            Arriesgado: solo llegas si todo va bien
          </p>
        )}
      </Tarjeta>

      {salAntes != null && (
        <Tarjeta className="flex items-center gap-3 p-4">
          <span className="pegatina flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-xl bg-aviso-simulado">
            <IconoReloj />
          </span>
          <p className="text-[16px] font-bold text-tinta">
            {salAntes > 0
              ? `Si sales ahora: sal en ${salAntes} min para coger el ${primero.linea}`
              : salAntes === 0
                ? `¡Sal ya para coger el ${primero.linea}!`
                : `Al ${primero.linea} que viene ya no llegas: mira el siguiente`}
          </p>
        </Tarjeta>
      )}

      {/* modo «voy con prisa» (como en las rutas de la demo), solo si hay riesgo de verdad */}
      {hayRiesgo && (
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo quieres ir">
        {[
          { id: "segura", t: "Lo más seguro", s: "llega antes en el peor caso" },
          { id: "rapida", t: "Voy con prisa", s: "lo más rápido si todo va bien" },
        ].map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={modo === m.id}
            onClick={() => setModo(m.id)}
            className={`boton-pegatina min-h-[60px] rounded-xl px-3 py-2 text-left ${modo === m.id ? "bg-principal text-white" : "bg-tarjeta text-tinta"}`}
          >
            <span className="block text-[16px] font-bold">{m.t}</span>
            <span className={`block text-[13px] ${modo === m.id ? "text-white/85" : "text-suave"}`}>{m.s}</span>
          </button>
        ))}
      </div>
      )}

      <Tarjeta sombra className="space-y-2 p-4">
        <Resumen o={o} primera={primera} datos={datos} contexto={contexto} />
        {o.tramos.some((t) => t.tipo === "viaje") && (
          <button
            role="switch"
            aria-checked={mapa}
            onClick={() => setMapa((x) => !x)}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 text-[15px] font-bold text-tinta"
          >
            Mapa en directo
            <span className={`relative inline-block h-[26px] w-[46px] rounded-full border-2 border-[#111] transition-colors ${mapa ? "bg-verde" : "bg-hundido"}`}>
              <span className={`absolute top-[2px] h-[18px] w-[18px] rounded-full border-2 border-[#111] bg-white transition-all ${mapa ? "left-[22px]" : "left-[2px]"}`} />
            </span>
          </button>
        )}
        {mapa && <MapaRuta opcion={o} desde={desde} hasta={hasta} vivo={vivo} />}
      </Tarjeta>
      <Tarjeta className="p-4">
        <PasosRuta o={o} desde={desde} hasta={hasta} datos={datos} contexto={contexto} onAbrirParada={onAbrirParada} />
      </Tarjeta>

      <button
        onClick={onGuardar}
        disabled={guardada}
        className={`boton-pegatina min-h-[52px] w-full rounded-xl text-[17px] font-bold ${guardada ? "bg-verde text-white" : "bg-tarjeta text-tinta"}`}
      >
        {guardada ? "Guardada en Mis rutas ✓" : "Guardar en Mis rutas"}
      </button>
    </div>
  );
}

// Minutos de más que tarda una línea 1 de cada 10 veces (p90 del retraso medido), con lo que suele tocar esperar
function margenMedido(datos, contexto) {
  return (t) => {
    const minutos = Math.min(39, Math.max(1, Math.round(t.cada / 2)));
    const r = datos
      ? consultar(datos, { red: t.red, minutos, hora: contexto?.hora ?? 12, finde: contexto?.finde ?? false, linea: t.linea, tipo: t.red === "metro" ? "estacion" : "intermedia" })
      : null;
    if (r) return Math.max(0, r.p90);
    return { metro: 1, emt: 4, renfe: 6, interurbano: 8 }[t.red] ?? 5;
  };
}

export function OpcionesPlan({ desde, hasta, datos, contexto, onAbrirParada, onViaje = () => {}, onGuardar = () => {}, guardada = false, momento = { tipo: "ahora" } }) {
  const [estado, setEstado] = useState({ cargando: true, opciones: [] });
  const [iniciada, setIniciada] = useState(null); // índice de la opción iniciada
  useEffect(() => {
    onViaje(iniciada !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iniciada]);
  useEffect(() => {
    let activo = true;
    setIniciada(null);
    setEstado({ cargando: true, opciones: [] });
    cargarRed()
      .then((red) => activo && setEstado({ cargando: false, opciones: planificar(red, desde, hasta, { hora: contexto?.hora, margen: margenMedido(datos, contexto) }) }))
      .catch(() => activo && setEstado({ cargando: false, error: true, opciones: [] }));
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde.lat, desde.lon, hasta.lat, hasta.lon, Boolean(datos), contexto?.hora, contexto?.finde]);

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
  if (iniciada !== null && estado.opciones[iniciada])
    return (
      <Vivo.Provider value={momento.tipo === "ahora"}>
      <Viaje
        momento={momento}
        o={estado.opciones[iniciada]}
        primera={iniciada === 0}
        datos={datos}
        contexto={contexto}
        onAbrirParada={abrir}
        desde={desde}
        hasta={hasta}
        onSalir={() => setIniciada(null)}
        onGuardar={onGuardar}
        guardada={guardada}
      />
      </Vivo.Provider>
    );
  // En el modo de ensayo (?hora=…) la hora es inventada: se dice, para que nadie crea que es la de ahora
  const ensayo =
    !enDirecto() && contexto ? (
      <p className="rounded-xl border-2 border-[#111] bg-aviso-simulado px-3 py-2 text-[14px] font-bold text-[#111]">
        Modo ensayo: rutas para las {horaTexto(contexto.hora)} de un {contexto.finde ? "fin de semana" : "laborable"}, sin datos en directo.
      </p>
    ) : momento.tipo !== "ahora" ? (
      <p className="text-[14px] text-tinta-2">
        {momento.tipo === "llegar" ? `Rutas para llegar antes de las ${horaTexto(momento.horaDecimal)}` : `Rutas para salir a las ${horaTexto(momento.horaDecimal)}`}: líneas y
        frecuencias de esa hora. Los minutos en directo solo salen si vas a salir ahora.
      </p>
    ) : null;
  return (
    <Vivo.Provider value={momento.tipo === "ahora"}>
    <section className="space-y-3" aria-live="polite">
      {ensayo}
      {estado.opciones.map((o, i) => (
        <Opcion key={i} o={o} primera={i === 0} datos={datos} contexto={contexto} onIniciar={() => setIniciada(i)} />
      ))}
      <p className="text-[13px] text-suave">
        «Si se tuerce»: lo que tarda 1 de cada 10 veces, según lo que hemos medido. Primero, la que menos se retrasa y menos cansa.
      </p>
    </section>
    </Vivo.Provider>
  );
}
