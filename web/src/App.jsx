// Navegación entre pantallas, carga de datos y estado del seguimiento.
// Una sola página: cada pantalla se muestra u oculta sin recargar (sección 1.1).
import { useCallback, useEffect, useMemo, useState } from "react";
import BarraInferior from "./componentes/BarraInferior.jsx";
import FranjaSeguimiento from "./componentes/FranjaSeguimiento.jsx";
import Paradas from "./pantallas/Paradas.jsx";
import Parada from "./pantallas/Parada.jsx";
import LineaInfo from "./pantallas/LineaInfo.jsx";
import CuandoSalgo from "./pantallas/CuandoSalgo.jsx";
import Prometido from "./pantallas/Prometido.jsx";
import Avisos from "./pantallas/Avisos.jsx";
import Info from "./pantallas/Info.jsx";
import { ListaRutas, DetalleRuta } from "./pantallas/Rutas.jsx";
import Login from "./pantallas/Login.jsx";
import { AvisoAbono, leerAbono, guardarAbono } from "./componentes/Abono.jsx";
import { posicionVehiculo } from "./lib/ventana.js";
import { aMinutos, calcularLlegada, contextoActual, iconoDeRed, llegadasVivas, rangoCorto } from "./lib/util.js";
import { cargarIndiceMetro, consultaDirecto, enDirecto, llegadasEmt, llegadasMetro, nombreBonito } from "./lib/emt.js";

const BASE = import.meta.env.BASE_URL;

// Paradas de la franja en «¿Cuándo salgo?» (sección 5, punto 7).
// PENDIENTE: el manual no da la hora de paso por Atocha; se coloca a dos tercios del viaje.
const PARADAS_DESTINO = [
  { nombre: "Móstoles", tipo: "inicio", pos: 0 },
  { nombre: "Atocha", tipo: "transbordo", pos: 64 },
  { nombre: "N. Ministerios", tipo: "fin", pos: 100 },
];
// En la demo el viaje de «¿Cuándo salgo?» se enseña ya empezado: 22 min después de salir.
const MINUTOS_YA_HECHOS = 22;

function leerFavoritas() {
  try {
    return JSON.parse(localStorage.getItem("favoritas")) ?? [];
  } catch {
    return [];
  }
}

// Nombres que el usuario pone a sus paradas y rutas: { "emt-5848": "Mi parada de casa", "ruta-uni": "..." }
// Sesión de la demo: { correo, nombre } o null
function leerSesion() {
  try {
    return JSON.parse(localStorage.getItem("sesion"));
  } catch {
    return null;
  }
}

function leerNombres() {
  try {
    return JSON.parse(localStorage.getItem("nombres")) ?? {};
  } catch {
    return {};
  }
}

function leerLista(clave) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? [];
  } catch {
    return [];
  }
}

function guardarLista(clave, lista) {
  try {
    localStorage.setItem(clave, JSON.stringify(lista));
  } catch {
    // sin almacenamiento dura hasta recargar
  }
}

const DIRECTO_CADA_MS = 15000;

function guardarFavoritas(lista) {
  try {
    localStorage.setItem("favoritas", JSON.stringify(lista));
  } catch {
    // Sin almacenamiento la app sigue funcionando, solo que sin recordar favoritas
  }
}

// Minutos que pasan en la demo. Con ?rapido cada minuto dura 5 s, para ensayar o grabar el vídeo.
function useMinutosDemo() {
  const [minutos, setMinutos] = useState(0);
  useEffect(() => {
    const rapido = new URLSearchParams(location.search).has("rapido");
    const id = setInterval(() => setMinutos((m) => m + 1), rapido ? 5000 : 60000);
    return () => clearInterval(id);
  }, []);
  return minutos;
}

export default function App() {
  const [demo, setDemo] = useState(null);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  const [pantalla, setPantalla] = useState("paradas");
  const [paradaId, setParadaId] = useState(null);
  const [lineaSel, setLineaSel] = useState(null);
  const [favoritas, setFavoritas] = useState(leerFavoritas);
  const [nombres, setNombres] = useState(leerNombres);
  const [rutaId, setRutaId] = useState(null);
  const [bajada, setBajada] = useState(null);
  const [sesion, setSesion] = useState(leerSesion);
  const [abono, setAbono] = useState(() => leerAbono());
  // Paradas de la EMT abiertas desde «Cerca de ti» (no están en la demo) y las últimas consultadas
  const [extra, setExtra] = useState(() => leerLista("paradas_extra").map((p) => ({ ...p, nombre: nombreBonito(p.nombre) })));
  const [recientes, setRecientes] = useState(() => leerLista("recientes"));
  // Llegadas en directo por parada: { "emt-4613": { llegadas, hora, error } }
  const [directo, setDirecto] = useState({});

  function cambiarAbono(a) {
    guardarAbono(a);
    setAbono(a);
  }

  function verAbono() {
    setPantalla("paradas");
    setTimeout(() => document.getElementById("abono")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  function entrar(s) {
    try {
      localStorage.setItem("sesion", JSON.stringify(s));
    } catch {
      // sin almacenamiento la sesión dura hasta recargar
    }
    setSesion(s);
    setPantalla("paradas");
  }

  function salir() {
    try {
      localStorage.removeItem("sesion");
    } catch {
      // nada que borrar
    }
    setSesion(null);
  }

  function renombrar(clave, nombre) {
    setNombres((n) => {
      const nuevos = { ...n, [clave]: nombre };
      try {
        localStorage.setItem("nombres", JSON.stringify(nuevos));
      } catch {
        // Sin almacenamiento el nombre dura hasta recargar
      }
      return nuevos;
    });
  }
  // Seguimiento: qué parada se sigue, si ya hay un destino elegido y en qué modo está la franja
  const [seg, setSeg] = useState({ paradaId: null, destino: false, modo: "parada" });

  const transcurrido = useMinutosDemo();
  const contexto = useMemo(() => contextoActual(new Date(), location.search), []);

  useEffect(() => {
    fetch(`${BASE}datos/demo.json`)
      .then((r) => r.json())
      .then((d) => {
        let guardadas = null;
        let nombresGuardados = null;
        try {
          guardadas = localStorage.getItem("favoritas");
          nombresGuardados = localStorage.getItem("nombres");
        } catch {
          // sin almacenamiento se usan los de la demo
        }
        if (guardadas === null && d.favoritas_iniciales) setFavoritas(d.favoritas_iniciales);
        if (nombresGuardados === null && d.nombres_iniciales) setNombres(d.nombres_iniciales);
        setDemo(d);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    setError(false);
    fetch(`${BASE}datos/fiabilidad.json`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(setDatos)
      .catch(() => setError(true));
  }, [intento]);

  // Cada vez que se cambia de pantalla, arriba del todo
  // (entre llaves: en navegadores nuevos scrollTo devuelve una promesa y React la tomaría por limpieza)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pantalla, paradaId, rutaId]);

  const todas = useMemo(
    () => (demo ? [...demo.paradas, ...extra.filter((e) => !demo.paradas.some((p) => p.id === e.id))] : []),
    [demo, extra],
  );

  // Con datos en directo, la parada usa las llegadas de la EMT en vez de los minutos de la demo
  const conDirecto = useCallback(
    (p) => {
      if (!p) return null;
      const d = directo[p.id];
      if (d?.llegadas) return { ...p, llegadas: d.llegadas, vivo: true, horaDirecto: d.hora };
      if (p.directa) return { ...p, llegadas: [], vivo: true, sinDirecto: Boolean(d?.error) };
      return p;
    },
    [directo],
  );

  const parada = useMemo(() => conDirecto(todas.find((p) => p.id === paradaId)), [todas, paradaId, conDirecto]);
  const paradaSeguida = useMemo(() => conDirecto(todas.find((p) => p.id === seg.paradaId)), [todas, seg.paradaId, conDirecto]);

  // Consulta en directo (EMT o Metro) la parada abierta y la que se sigue en la franja
  const aConsultar = JSON.stringify(
    [...new Set([pantalla === "parada" ? paradaId : null, seg.paradaId])]
      .map((id) => [id, consultaDirecto(todas.find((p) => p.id === id))])
      .filter(([, c]) => c),
  );
  useEffect(() => {
    const lista = JSON.parse(aConsultar);
    if (!lista.length || !enDirecto()) return;
    let activo = true;
    const pedirUna = (c) =>
      c.tipo === "emt"
        ? llegadasEmt(c.numero)
        : Promise.all([llegadasMetro(c.andenes), cargarIndiceMetro()]).then(([d, ix]) => ({
            ...d,
            llegadas: d.llegadas.map((l) => ({ ...l, destino: ix.nombres[l.destino] ? nombreBonito(ix.nombres[l.destino]) : l.destino })),
          }));
    const consultar = () =>
      lista.forEach(([id, c]) =>
        pedirUna(c)
          .then((d) => activo && setDirecto((x) => ({ ...x, [id]: { llegadas: d.llegadas, hora: d.hora } })))
          .catch(() => activo && setDirecto((x) => ({ ...x, [id]: { ...x[id], error: true } }))),
      );
    consultar();
    const t = setInterval(consultar, DIRECTO_CADA_MS);
    return () => {
      activo = false;
      clearInterval(t);
    };
  }, [aConsultar]);

  const calcular = useCallback(
    (p) => (datos ? llegadasVivas(p, transcurrido).map((l) => calcularLlegada(datos, p, l, contexto)) : []),
    [datos, transcurrido, contexto],
  );

  const llegadas = useMemo(() => (parada ? calcular(parada) : []), [parada, calcular]);
  const llegadasSeguidas = useMemo(() => (paradaSeguida ? calcular(paradaSeguida) : []), [paradaSeguida, calcular]);

  function abrirParada(id, nueva = null) {
    if (nueva && !todas.some((p) => p.id === id)) {
      setExtra((lista) => {
        const l = [nueva, ...lista.filter((p) => p.id !== id)].slice(0, 30);
        guardarLista("paradas_extra", l);
        return l;
      });
    }
    setRecientes((lista) => {
      const l = [id, ...lista.filter((x) => x !== id)].slice(0, 5);
      guardarLista("recientes", l);
      return l;
    });
    setParadaId(id);
    setSeg((s) => ({ ...s, paradaId: id, modo: "parada" }));
    setPantalla("parada");
  }

  function ir(destino) {
    if (destino === "salgo") setSeg((s) => ({ ...s, destino: true, modo: "destino" }));
    setPantalla(destino);
  }

  function alternarFavorita(id) {
    setFavoritas((lista) => {
      const nueva = lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
      guardarFavoritas(nueva);
      return nueva;
    });
  }

  // Datos que pinta la franja de seguimiento
  const franja = useMemo(() => {
    if (!demo) return null;
    const hayParada = paradaSeguida && llegadasSeguidas.length > 0;
    if (!hayParada && !seg.destino) return null;

    let destino = null;
    if (seg.destino) {
      const rec = demo.cuando_salgo.recomendada;
      const salida = aMinutos(rec.salida);
      const llegada = aMinutos(rec.llegada_habitual);
      const ahora = salida + ((MINUTOS_YA_HECHOS + transcurrido) % (llegada - salida));
      destino = {
        linea: rec.siguiente.linea,
        llegada: rec.llegada_habitual,
        icono: "tren",
        posicion: Math.max(4, Math.min(94, ((ahora - salida) / (llegada - salida)) * 100)),
        paradas: PARADAS_DESTINO,
        siguienteTexto: `Si lo pierdes: ${rec.siguiente.linea} de las ${rec.siguiente.hora}, llegas ${rec.siguiente.llegada}`,
      };
    }

    // Sin parada seguida solo se puede enseñar el modo destino
    if (!hayParada) return { modo: "destino", destino, linea: destino.linea };

    const [primera, segunda] = llegadasSeguidas;
    let siguienteTexto = "No hay otro anunciado todavía";
    if (segunda?.v) siguienteTexto = `El siguiente sale en ${rangoCorto(segunda.v, segunda.minutos)}`;
    // PENDIENTE: el manual no define el texto si hay segunda llegada pero sin ventana; se deja vacío
    else if (segunda) siguienteTexto = "";

    return {
      modo: seg.modo,
      linea: primera.linea,
      minutos: primera.minutos,
      v: primera.v,
      icono: iconoDeRed(paradaSeguida.red),
      red: paradaSeguida.red,
      posicion: posicionVehiculo(primera.minutos),
      siguienteTexto,
      destino,
    };
  }, [demo, paradaSeguida, llegadasSeguidas, seg, transcurrido]);

  const conFranja = franja && ["paradas", "parada", "salgo"].includes(pantalla);
  const activo = { parada: "paradas", linea: "paradas", prometido: "paradas", ruta: "rutas", salgo: "rutas" }[pantalla] ?? pantalla;

  if (!sesion) return <Login onEntrar={entrar} />;

  if (!demo) {
    return (
      <div className="mx-auto max-w-[430px] p-4">
        {error ? (
          <div className="space-y-3 pt-10">
            <p className="text-[16px]">No hemos podido cargar los datos. Vuelve a intentarlo.</p>
            <button onClick={() => location.reload()} className="min-h-[44px] rounded-xl bg-principal px-5 font-bold text-white">
              Reintentar
            </button>
          </div>
        ) : (
          <div className="mt-10 h-[200px] animate-pulse rounded-2xl bg-linea" />
        )}
      </div>
    );
  }

  const llegadaLinea = llegadas.find((l) => l.linea === lineaSel);

  return (
    <div className="mx-auto min-h-dvh max-w-[430px]">
      <main className={`px-4 pt-4 ${conFranja ? "pb-[210px]" : "pb-[100px]"}`}>
        {pantalla !== "paradas" && pantalla !== "avisos" && <AvisoAbono abono={abono} onVer={verAbono} />}
        <section id="pantalla-paradas" hidden={pantalla !== "paradas"}>
          <Paradas
            demo={demo}
            todas={todas}
            recientes={recientes}
            favoritas={favoritas}
            nombres={nombres}
            usuario={sesion.nombre}
            abono={abono}
            onCambiarAbono={cambiarAbono}
            onAbrirParada={abrirParada}
          />
        </section>

        {parada && (
          <section id="pantalla-parada" hidden={pantalla !== "parada"}>
            <Parada
              parada={parada}
              llegadas={llegadas}
              contexto={contexto}
              favorita={favoritas.includes(parada.id)}
              nombre={nombres[parada.id] ?? parada.nombre}
              onRenombrar={(n) => renombrar(parada.id, n)}
              avisos={demo.avisos_simulados ?? []}
              incidencias={demo.incidencias ?? []}
              bajada={bajada}
              onBajada={setBajada}
              onFavorita={() => alternarFavorita(parada.id)}
              onVolver={() => setPantalla("paradas")}
              onInfoLinea={(l) => {
                setLineaSel(l);
                setPantalla("linea");
              }}
              cargando={(!datos && !error) || (parada.directa && !directo[parada.id] && enDirecto())}
              error={error}
              onReintentar={() => setIntento((n) => n + 1)}
            />
          </section>
        )}

        {pantalla === "linea" && parada && datos && (
          <section id="pantalla-linea">
            <LineaInfo
              parada={parada}
              linea={lineaSel}
              llegada={llegadaLinea}
              meta={datos.meta}
              contexto={contexto}
              rarezas={demo.lineas[lineaSel]?.avisos ?? []}
              onVolver={() => setPantalla("parada")}
              onPrometido={() => setPantalla("prometido")}
            />
          </section>
        )}

        {pantalla === "rutas" && (
          <section id="pantalla-rutas">
            <ListaRutas
              demo={demo}
              onCasoMedido={() => {
                setSeg((s) => ({ ...s, destino: true, modo: "destino" }));
                setPantalla("salgo");
              }}
              datos={datos}
              contexto={contexto}
              nombres={nombres}
              onRenombrar={renombrar}
              onAbrir={(id) => {
                setRutaId(id);
                setPantalla("ruta");
              }}
            />
          </section>
        )}

        {pantalla === "ruta" && datos && [...(demo.rutas ?? []), ...(demo.planificador ?? [])].find((r) => r.id === rutaId) && (
          <section id="pantalla-ruta">
            <DetalleRuta
              key={rutaId}
              ruta={[...(demo.rutas ?? []), ...(demo.planificador ?? [])].find((r) => r.id === rutaId)}
              esPlan={(demo.planificador ?? []).some((r) => r.id === rutaId)}
              demo={demo}
              datos={datos}
              contexto={contexto}
              nombres={nombres}
              onRenombrar={renombrar}
              onVolver={() => setPantalla("rutas")}
            />
          </section>
        )}

        {pantalla === "salgo" && (
          <section id="pantalla-salgo">
            <CuandoSalgo caso={demo.cuando_salgo} />
          </section>
        )}

        {pantalla === "prometido" && (
          <section id="pantalla-prometido">
            <Prometido casos={demo.prometido_real} onVolver={() => setPantalla(parada ? "parada" : "paradas")} />
          </section>
        )}

        {pantalla === "avisos" && (
          <section id="pantalla-avisos">
            <Avisos avisos={demo.avisos_simulados} />
          </section>
        )}

        {pantalla === "info" && datos && (
          <section id="pantalla-info">
            <Info meta={datos.meta} sesion={sesion} onSalir={salir} />
          </section>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px]">
        {conFranja && (
          <FranjaSeguimiento
            seg={franja}
            onAbrir={() => (paradaSeguida ? abrirParada(paradaSeguida.id) : setPantalla("salgo"))}
            bajada={bajada}
            onCambiarModo={() =>
              setSeg((s) => {
                // Sin parada seguida no hay modo «hasta tu parada» al que volver
                if (s.modo === "destino" && !paradaSeguida) return s;
                return { ...s, modo: s.modo === "parada" ? "destino" : "parada" };
              })
            }
          />
        )}
        <BarraInferior activo={activo} onIr={ir} />
      </div>
    </div>
  );
}
