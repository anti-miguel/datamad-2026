// Mapa en directo de una ruta del planificador (MapLibre con Positron de CARTO recoloreado; ver lib/mapaVector.js):
// el recorrido de cada tramo con el color de su línea, dónde subes y bajas, y los autobuses de la EMT que vienen
// hacia tu parada (posición GPS de la consulta de llegadas, cada 20 s).
// Solo existe mientras el interruptor está encendido; si el móvil está bloqueado o en otra pestaña, no consulta nada.
// El Metro no publica la posición de sus trenes: se dibuja su recorrido sin trenes.
import { useEffect, useRef, useState } from "react";
import { colorDeLinea } from "./Comunes.jsx";
import { enDirecto, llegadasEmt } from "../lib/emt.js";
import { botonMapa, crearMapa, ICONO_TODO, ICONO_TU, limitesDe } from "../lib/mapaVector.js";
import { cargarFormas, decodificar, recorte } from "../lib/formas.js";

const CADA_MS = 20000;
const MAX_BUSES_TRAMO = 3;
const lonlat = ([lat, lon]) => [lon, lat];

function elemento(html, clase = "") {
  const el = document.createElement("div");
  el.className = clase;
  el.innerHTML = html;
  return el;
}

export default function MapaRuta({ opcion, desde, hasta }) {
  const caja = useRef(null);
  const [listo, setListo] = useState(null); // { map, maplibregl }
  const [estado, setEstado] = useState("Cargando el mapa…");
  const tramosBus = opcion.tramos.filter((t) => t.tipo === "viaje" && t.red === "emt");

  // El mapa y el recorrido, una vez. Empieza enfocado en ti y en tu primera parada (por dónde tienes que ir);
  // los tramos andando van punteados; dos botones: volver a ti y a tu parada, y ver toda la ruta.
  useEffect(() => {
    let vivo = true;
    let mapa = null;
    let vigilancia = null;
    const tramos = opcion.tramos.filter((t) => t.tipo === "viaje" && t.camino?.length);
    const salida = desde?.lat != null ? [desde.lat, desde.lon] : tramos[0]?.camino[0];
    const llegada = hasta?.lat != null ? [hasta.lat, hasta.lon] : tramos.at(-1)?.camino.at(-1);
    // tramos andando: de la salida a la primera parada, entre transbordos y de la última parada al destino
    const andando = [];
    let desdeAqui = salida;
    for (const t of tramos) {
      if (desdeAqui) andando.push([desdeAqui, t.camino[0]]);
      desdeAqui = t.camino.at(-1);
    }
    if (desdeAqui && llegada) andando.push([desdeAqui, llegada]);
    const objetivo = tramos[0]?.camino[0] ?? llegada; // a dónde vas primero
    const todos = [salida, llegada, ...tramos.flatMap((t) => t.camino)].filter(Boolean);
    let tu = salida;
    Promise.all([crearMapa(caja.current, [tu, objetivo].filter(Boolean)), cargarFormas().catch(() => [])])
      .then(([{ map, maplibregl }, formas]) => {
        // cada tramo por las calles si hay trazado; si no, en recto de parada a parada
        const caminoDe = (t) => (t.pi != null && recorte(decodificar(formas[t.pi]), t.camino[0], t.camino.at(-1))) || t.camino;
        mapa = map;
        if (!vivo) return map.remove();
        map.addSource("andando", {
          type: "geojson",
          data: { type: "FeatureCollection", features: andando.map(([a, b]) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [lonlat(a), lonlat(b)] } })) },
        });
        map.addLayer({ id: "andando", type: "line", source: "andando", layout: { "line-cap": "round" }, paint: { "line-color": "#111111", "line-width": 3.5, "line-dasharray": [0.1, 2] } });
        map.addSource("ruta", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: tramos.map((t) => ({
              type: "Feature",
              properties: { color: colorDeLinea(t.red, t.linea) },
              geometry: { type: "LineString", coordinates: caminoDe(t).map(lonlat) },
            })),
          },
        });
        map.addLayer({ id: "ruta-borde", type: "line", source: "ruta", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#111111", "line-width": 9 } });
        map.addLayer({ id: "ruta", type: "line", source: "ruta", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 5.5 } });
        // subidas con la línea que coges, bajadas en blanco
        tramos.forEach((t, i) => {
          const sube = elemento(`<span class="bus-mapa-linea" style="background:${colorDeLinea(t.red, t.linea)}">${t.linea}</span>`, "subida-mapa");
          sube.title = `${i === 0 ? "Coges" : "Cambias al"} ${t.linea} en ${t.desde.nombre}`;
          new maplibregl.Marker({ element: sube }).setLngLat(lonlat(t.camino[0])).addTo(map);
          new maplibregl.Marker({ element: elemento("", "nodo-mapa"), title: `Bajas en ${t.hasta.nombre}` }).setLngLat(lonlat(t.camino.at(-1))).addTo(map);
        });
        if (llegada) new maplibregl.Marker({ element: elemento("", "nodo-mapa nodo-destino"), title: "Tu destino" }).setLngLat(lonlat(llegada)).addTo(map);
        // tú: la personita, que se mueve contigo si saliste de «Mi ubicación»
        const persona = new maplibregl.Marker({
          element: elemento('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#111" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="2"/><path d="M9 21l2-6 3 3v5M7 12l3-4 4 1 3 3M10 8l-1 5"/></svg>', "persona-mapa"),
          title: "Tú",
        })
          .setLngLat(lonlat(tu))
          .addTo(map);
        if (desde?.nombre === "Mi ubicación" && navigator.geolocation) {
          vigilancia = navigator.geolocation.watchPosition(
            ({ coords }) => {
              tu = [coords.latitude, coords.longitude];
              persona.setLngLat(lonlat(tu));
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 10000 },
          );
        }
        botonMapa(map, { svg: ICONO_TU, etiqueta: "Volver a ti y a tu parada", accion: () => map.fitBounds(limitesDe([tu, objetivo].filter(Boolean)), { padding: 50, maxZoom: 17 }) });
        botonMapa(map, { svg: ICONO_TODO, etiqueta: "Ver toda la ruta", accion: () => map.fitBounds(limitesDe(todos), { padding: 36, maxZoom: 16 }) });
        setListo({ map, maplibregl });
      })
      .catch(() => vivo && setEstado("No hemos podido cargar el mapa."));
    return () => {
      vivo = false;
      if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
      mapa?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Los autobuses, cada 20 s mientras se ve
  useEffect(() => {
    if (!listo) return;
    if (!tramosBus.length) {
      setEstado("En esta ruta no hay autobuses de la EMT. El Metro no publica dónde van sus trenes.");
      return;
    }
    if (!enDirecto()) {
      setEstado("En el modo de ensayo no hay posiciones en directo.");
      return;
    }
    const { map, maplibregl } = listo;
    let marcadores = [];
    let parar = false;
    let temporizador = null;
    const pedir = async () => {
      if (parar) return;
      if (document.hidden) {
        temporizador = setTimeout(pedir, CADA_MS);
        return;
      }
      const grupos = await Promise.all(
        tramosBus.map((t) =>
          llegadasEmt(t.desde.clave.slice(1))
            .then((d) => d.llegadas.filter((l) => String(l.linea) === String(t.linea) && l.lat != null).slice(0, MAX_BUSES_TRAMO).map((l) => ({ ...l, t })))
            .catch(() => null),
        ),
      );
      if (parar) return;
      marcadores.forEach((m) => m.remove());
      const buses = grupos.flat().filter(Boolean);
      marcadores = buses.map((b) => {
        const minutos = b.minutos <= 1 ? "ya" : `${b.minutos}′`;
        const el = elemento(
          `<span class="bus-mapa"><span class="bus-mapa-linea" style="background:${colorDeLinea("emt", b.linea)}">${b.linea}</span><span class="bus-mapa-min">${minutos}</span></span>`,
        );
        el.title = `${b.linea}, a ${b.minutos} min de ${b.t.desde.nombre}`;
        return new maplibregl.Marker({ element: el, anchor: "left" }).setLngLat([b.lon, b.lat]).addTo(map);
      });
      const hora = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setEstado(
        grupos.every((g) => g === null)
          ? "Ahora no podemos consultar la EMT."
          : buses.length
            ? `${buses.length} ${buses.length === 1 ? "autobús" : "autobuses"} en camino · actualizado a las ${hora}`
            : `La EMT no anuncia ahora ningún autobús de estas líneas · ${hora}`,
      );
      temporizador = setTimeout(pedir, CADA_MS);
    };
    pedir();
    const alVolver = () => !document.hidden && (clearTimeout(temporizador), pedir());
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      parar = true;
      clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alVolver);
      marcadores.forEach((m) => m.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo]);

  return (
    <div className="space-y-1.5">
      <div ref={caja} className="mapa-yavoy pegatina h-[280px] overflow-hidden rounded-2xl" role="img" aria-label="Mapa de la ruta con los autobuses en directo" />
      <p className="text-[13px] text-tinta-2" aria-live="polite">
        {estado}
      </p>
    </div>
  );
}
