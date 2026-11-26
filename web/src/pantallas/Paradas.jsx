// Pantalla 1: Paradas (inicio). Objetivo: llegar en dos toques a una parada.
import { useEffect, useMemo, useState } from "react";
import { IconoRed, Linea, Tarjeta } from "../componentes/Comunes.jsx";
import { IconoLupa, IconoAviso, IconoEstrella, IconoPin } from "../componentes/Iconos.jsx";
import { cargarIndiceMetro, cercanasEmt, distanciaM, paradaEmtViva, paradaMetroViva, textoDistancia } from "../lib/emt.js";
import { NOMBRE_RED, normalizar } from "../lib/util.js";
import { EscenaSegunModo } from "../componentes/Escena.jsx";
import { Logo } from "../componentes/Logo.jsx";
import TarjetaAbono from "../componentes/Abono.jsx";

const FILTROS = [
  { id: "todo", texto: "Todo" },
  { id: "emt", texto: "Bus EMT" },
  { id: "interurbano", texto: "Interurbano" },
  { id: "metro", texto: "Metro" },
  { id: "renfe", texto: "Cercanías" },
];

function lineasDe(parada) {
  return parada.lineas ?? [...new Set(parada.llegadas.map((l) => l.linea))];
}

// Las paradas de la demo son las que hemos medido nosotros
function DatosMedidos() {
  return (
    <span className="rounded-full border-2 border-[#111] bg-amarillo px-2 py-0.5 text-[12px] font-bold text-[#111]">
      Con datos de YaVoy
    </span>
  );
}

const MAX_NUESTRAS_M = 3000;
const MAX_RESULTADOS_EMT = 20;
const MAX_METRO_CERCA_M = 1000;

// Estaciones de Metro que ya son nuestras (demo): no se repiten en las listas en directo
function esNuestraMetro(demo, estacion) {
  return demo.paradas.some((p) => p.red === "metro" && normalizar(p.nombre) === normalizar(estacion.nombre));
}

// Todas las paradas de la EMT (GTFS oficial, servidor/indice_paradas_emt.py). Se descarga la primera vez que se busca.
let indiceEmt = null;
function cargarIndiceEmt() {
  indiceEmt ??= fetch(`${import.meta.env.BASE_URL}datos/paradas_emt.json`)
    .then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then((filas) => filas.map(([id, nombre, lat, lon, lineas]) => ({ id, nombre, lat, lon, lineas: lineas ? lineas.split(" ") : [], clave: normalizar(nombre) })))
    .catch((e) => {
      indiceEmt = null; // se reintenta en la siguiente búsqueda
      throw e;
    });
  return indiceEmt;
}

function numeroDeParada(parada) {
  return parada.id.split("-")[1];
}

function TarjetaParada({ parada, favorita, nombre, onAbrir, distancia = null }) {
  return (
    <button onClick={onAbrir} className="block w-full text-left">
      <Tarjeta className="p-4">
        <div className="flex items-start gap-3">
          <IconoRed red={parada.red} />
          <div className="min-w-0 flex-1">
            <h3 className="text-[20px] font-bold text-tinta">{nombre ?? parada.nombre}</h3>
            {nombre && nombre !== parada.nombre && <p className="text-[14px] text-suave">{parada.nombre}</p>}
            <p className="text-[15px] text-suave">
              {parada.etiqueta ?? `${NOMBRE_RED[parada.red]} · parada ${numeroDeParada(parada)}`}
              {distancia != null && ` · ${textoDistancia(distancia)}`}
            </p>
          </div>
          {favorita && <IconoEstrella llena className="h-6 w-6 shrink-0 text-principal" />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {lineasDe(parada).map((l) => (
            <Linea key={l} linea={l} red={parada.red} />
          ))}
          {!parada.directa && <DatosMedidos />}
        </div>
      </Tarjeta>
    </button>
  );
}

// «Cerca de ti»: nuestras paradas medidas que están cerca y las paradas de la EMT de alrededor, con llegadas en directo
function CercaDeTi({ estado, nuestras, metro = [], emt, favoritas, nombres, onAbrir, onCerrar }) {
  return (
    <section className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-tinta-2">Cerca de ti</h2>
        <button onClick={onCerrar} className="min-h-[44px] px-2 text-[15px] font-bold text-principal">
          Cerrar
        </button>
      </div>
      {estado === "buscando" && <div className="h-[120px] animate-pulse rounded-2xl bg-linea" aria-label="Buscando paradas cercanas" />}
      {estado === "denegado" && (
        <p className="text-[15px] text-suave">Necesitamos tu ubicación para buscar paradas cercanas. Actívala en el navegador y vuelve a pulsar.</p>
      )}
      {estado === "sin-gps" && <p className="text-[15px] text-suave">Este navegador no nos da tu ubicación. Busca la parada por su nombre.</p>}
      {estado === "fuera" && nuestras.length === 0 && (
        <p className="text-[15px] text-suave">Parece que no estás en Madrid. Busca la parada por su nombre.</p>
      )}
      {estado === "listo" && nuestras.length === 0 && metro.length === 0 && emt.length === 0 && (
        <p className="text-[15px] text-suave">No encontramos paradas de autobús de la EMT cerca. Busca la parada por su nombre.</p>
      )}
      {nuestras.map(({ parada, metros }) => (
        <TarjetaParada
          key={parada.id}
          parada={parada}
          favorita={favoritas.includes(parada.id)}
          nombre={nombres[parada.id]}
          distancia={metros}
          onAbrir={() => onAbrir(parada.id)}
        />
      ))}
      {metro.map(({ estacion, metros }) => {
        const parada = paradaMetroViva(estacion);
        return (
          <TarjetaParada
            key={parada.id}
            parada={parada}
            favorita={favoritas.includes(parada.id)}
            nombre={nombres[parada.id]}
            distancia={metros}
            onAbrir={() => onAbrir(parada.id, parada)}
          />
        );
      })}
      {emt.map((p) => {
        const parada = paradaEmtViva(p);
        return (
          <TarjetaParada
            key={parada.id}
            parada={parada}
            favorita={favoritas.includes(parada.id)}
            nombre={nombres[parada.id]}
            distancia={p.metros}
            onAbrir={() => onAbrir(parada.id, parada)}
          />
        );
      })}
      {estado === "error-emt" && <p className="text-[15px] text-suave">Ahora no podemos consultar las paradas de la EMT. Prueba en un rato.</p>}
      {(estado === "listo" || estado === "error-emt") && emt.length > 0 && (
        <p className="text-[13px] text-suave">Paradas y llegadas de la EMT en directo · Powered by EMT de Madrid</p>
      )}
    </section>
  );
}

export default function Paradas({ demo, todas, recientes = [], favoritas, nombres = {}, usuario, abono, onCambiarAbono, onAbrirParada }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todo");
  const [cerca, setCerca] = useState(null); // { estado, nuestras, emt }
  const [emtTodas, setEmtTodas] = useState(null); // null = sin cargar, "error" o la lista
  const [metroTodas, setMetroTodas] = useState(null);

  function buscarCerca() {
    if (!navigator.geolocation) return setCerca({ estado: "sin-gps", nuestras: [], emt: [] });
    setCerca({ estado: "buscando", nuestras: [], emt: [] });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const yo = { lat: coords.latitude, lon: coords.longitude };
        const nuestras = demo.paradas
          .filter((p) => p.lat != null)
          .map((parada) => ({ parada, metros: distanciaM(yo, parada) }))
          .filter((x) => x.metros <= MAX_NUESTRAS_M)
          .sort((a, b) => a.metros - b.metros);
        const medidas = new Set(nuestras.map((x) => x.parada.id));
        const metroCerca = cargarIndiceMetro()
          .then((ix) =>
            ix.estaciones
              .filter((e) => !esNuestraMetro(demo, e))
              .map((estacion) => ({ estacion, metros: distanciaM(yo, estacion) }))
              .filter((x) => x.metros <= MAX_METRO_CERCA_M)
              .sort((a, b) => a.metros - b.metros)
              .slice(0, 3),
          )
          .catch(() => []);
        Promise.all([cercanasEmt(yo.lat, yo.lon).catch(() => null), metroCerca]).then(([d, metro]) => {
          if (!d) return setCerca({ estado: "error-emt", nuestras, metro, emt: [] });
          setCerca({ estado: d.fuera ? "fuera" : "listo", nuestras, metro, emt: (d.paradas ?? []).filter((p) => !medidas.has(`emt-${p.id}`)) });
        });
      },
      (e) => setCerca({ estado: e.code === 1 ? "denegado" : "sin-gps", nuestras: [], emt: [] }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  const q = normalizar(busqueda);
  const buscando = q.length >= 2;
  const porModo = todas.filter((p) => filtro === "todo" || p.red === filtro);
  const resultados = buscando
    ? porModo.filter((p) => normalizar(p.nombre).includes(q) || normalizar(nombres[p.id] ?? "").includes(q) || lineasDe(p).some((l) => normalizar(l).includes(q)))
    : [];
  const listaFavoritas = porModo.filter((p) => favoritas.includes(p.id));

  useEffect(() => {
    if (!buscando || Array.isArray(emtTodas)) return;
    cargarIndiceEmt().then(setEmtTodas).catch(() => setEmtTodas("error"));
  }, [buscando, emtTodas]);

  useEffect(() => {
    if (!buscando || Array.isArray(metroTodas)) return;
    cargarIndiceMetro()
      .then((ix) => setMetroTodas(ix.estaciones.filter((e) => !esNuestraMetro(demo, e)).map((e) => ({ ...e, clave: normalizar(e.nombre) }))))
      .catch(() => setMetroTodas("error"));
  }, [buscando, metroTodas, demo]);

  const conMetro = ["todo", "metro"].includes(filtro);
  const resultadosMetro = useMemo(() => {
    if (!buscando || !Array.isArray(metroTodas) || !conMetro) return [];
    const palabras = q.split(/\s+/).filter(Boolean);
    return metroTodas
      .filter((e) => palabras.every((w) => e.clave.includes(w)) || e.lineas.some((l) => normalizar(l) === q))
      .sort((a, b) => b.clave.startsWith(q) - a.clave.startsWith(q) || a.nombre.localeCompare(b.nombre))
      .slice(0, 10);
  }, [buscando, metroTodas, conMetro, q]);

  // Paradas de la EMT que no son nuestras: por nombre (todas las palabras, en cualquier orden) o por número
  const conEmt = ["todo", "emt"].includes(filtro);
  const resultadosEmt = useMemo(() => {
    if (!buscando || !Array.isArray(emtTodas) || !conEmt) return [];
    const palabras = q.split(/\s+/).filter(Boolean);
    const numero = /^\d+$/.test(q) ? Number(q) : null;
    const ya = new Set(resultados.map((p) => p.id));
    return emtTodas
      .filter((p) => !ya.has(`emt-${p.id}`) && (p.id === numero || (numero === null && palabras.every((w) => p.clave.includes(w)))))
      .sort((a, b) => (b.id === numero) - (a.id === numero) || b.clave.startsWith(q) - a.clave.startsWith(q) || a.nombre.localeCompare(b.nombre))
      .slice(0, MAX_RESULTADOS_EMT);
  }, [buscando, emtTodas, conEmt, q, resultados]);
  const listaRecientes = recientes
    .map((id) => porModo.find((p) => p.id === id))
    .filter((p) => p && !favoritas.includes(p.id))
    .slice(0, 3);
  // «Otras»: el resto de nuestras paradas medidas (las de la EMT abiertas una vez solo salen en recientes)
  const otras = porModo.filter((p) => !p.directa && !favoritas.includes(p.id) && !listaRecientes.includes(p));

  return (
    <div className="space-y-4">
      <div className="-mt-4">
        {/* key: al cambiar de filtro, el vehículo vuelve a entrar */}
        <EscenaSegunModo key={filtro} modo={filtro} />
      </div>
      <div className="flex flex-wrap-reverse items-end justify-between gap-x-3 gap-y-1">
        <div>
          {usuario && usuario !== "Invitado" && <p className="text-[16px] font-bold text-tinta-2">Hola, {usuario}</p>}
          <h1 className="titulo text-[30px] text-tinta min-[360px]:text-[34px]">Mis paradas</h1>
        </div>
        <Logo alto={30} className="mb-1 w-[112px] shrink-0" />
      </div>

      {abono && <TarjetaAbono abono={abono} onCambiar={onCambiarAbono} />}

      <label className="flex min-h-[48px] items-center gap-2 pegatina rounded-2xl bg-tarjeta px-4 focus-within:shadow-[4px_4px_0_#2335F5]">
        <IconoLupa className="h-5 w-5 text-suave" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Busca parada, línea o estación"
          aria-label="Busca parada, línea o estación"
          className="h-[46px] w-full bg-transparent text-[16px] outline-none placeholder:text-suave"
        />
      </label>

      <button
        onClick={buscarCerca}
        className="boton-pegatina flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-amarillo px-4 text-[17px] font-bold text-[#111]"
      >
        <IconoPin className="h-6 w-6" />
        Paradas cercanas
      </button>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filtrar por modo">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            role="radio"
            aria-checked={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            className={`min-h-[44px] rounded-full border px-4 text-[16px] transition-colors ${
              filtro === f.id
                ? "boton-pegatina bg-principal font-bold text-white"
                : "boton-pegatina bg-tarjeta text-tinta"
            }`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {demo.aviso_oficial && (
        <div className="flex gap-3 rounded-2xl bg-aviso-oficial pegatina p-4 text-[#111]">
          <IconoAviso className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-[15px]">
            {typeof demo.aviso_oficial === "string" ? demo.aviso_oficial : demo.aviso_oficial.texto}
          </p>
        </div>
      )}

      {cerca && !buscando ? (
        <CercaDeTi
          {...cerca}
          favoritas={favoritas}
          nombres={nombres}
          onAbrir={onAbrirParada}
          onCerrar={() => setCerca(null)}
        />
      ) : buscando ? (
        <section className="space-y-3" aria-live="polite">
          {resultados.map((p) => (
            <TarjetaParada key={p.id} parada={p} favorita={favoritas.includes(p.id)} nombre={nombres[p.id]} onAbrir={() => onAbrirParada(p.id)} />
          ))}
          {resultadosMetro.length > 0 && <h2 className="pt-1 text-[16px] font-bold text-tinta-2">Estaciones de Metro · en directo</h2>}
          {resultadosMetro.map((e) => {
            const parada = paradaMetroViva(e);
            return (
              <TarjetaParada
                key={parada.id}
                parada={parada}
                favorita={favoritas.includes(parada.id)}
                nombre={nombres[parada.id]}
                onAbrir={() => onAbrirParada(parada.id, parada)}
              />
            );
          })}
          {resultadosEmt.length > 0 && <h2 className="pt-1 text-[16px] font-bold text-tinta-2">Paradas de la EMT · en directo</h2>}
          {resultadosEmt.map((p) => {
            const parada = paradaEmtViva(p);
            return (
              <TarjetaParada
                key={parada.id}
                parada={parada}
                favorita={favoritas.includes(parada.id)}
                nombre={nombres[parada.id]}
                onAbrir={() => onAbrirParada(parada.id, parada)}
              />
            );
          })}
          {resultados.length === 0 && resultadosEmt.length === 0 && resultadosMetro.length === 0 && ((emtTodas === null && conEmt) || (metroTodas === null && conMetro)) && (
            <div className="h-[90px] animate-pulse rounded-2xl bg-linea" aria-label="Buscando" />
          )}
          {resultados.length === 0 && resultadosEmt.length === 0 && resultadosMetro.length === 0 && (emtTodas !== null || !conEmt) && (metroTodas !== null || !conMetro) && (
            <p className="text-[15px] text-suave">
              No encontramos esa parada. Buscamos en nuestras paradas medidas, en todas las paradas de autobús de la EMT (por nombre o número) y en las estaciones de Metro.
            </p>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          {listaRecientes.length > 0 && <h2 className="text-[16px] font-bold text-tinta-2">Recientes</h2>}
          {listaRecientes.map((p) => (
            <TarjetaParada key={p.id} parada={p} favorita={false} nombre={nombres[p.id]} onAbrir={() => onAbrirParada(p.id)} />
          ))}
          {listaFavoritas.length > 0 && <h2 className="pt-2 text-[16px] font-bold text-tinta-2">Favoritas</h2>}
          {listaFavoritas.map((p) => (
            <TarjetaParada key={p.id} parada={p} favorita nombre={nombres[p.id]} onAbrir={() => onAbrirParada(p.id)} />
          ))}
          {listaFavoritas.length === 0 && (
            <p className="text-[15px] text-suave">Busca tu parada y pulsa la estrella para tenerla aquí.</p>
          )}
          {otras.length > 0 && (
            <h2 className="pt-2 text-[16px] font-bold text-tinta-2">Otras paradas y estaciones</h2>
          )}
          {otras
            .map((p) => (
              <TarjetaParada key={p.id} parada={p} favorita={false} nombre={nombres[p.id]} onAbrir={() => onAbrirParada(p.id)} />
            ))}
        </section>
      )}
    </div>
  );
}
