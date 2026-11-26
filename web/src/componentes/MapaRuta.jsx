// Mapa en directo de una ruta del planificador (MapLibre con Positron de CARTO recoloreado; ver lib/mapaVector.js):
// el recorrido de cada tramo con el color de su línea, dónde subes y bajas, y los autobuses de la EMT que vienen
// hacia tu parada (posición GPS de la consulta de llegadas, cada 20 s).
// Solo existe mientras el interruptor está encendido; si el móvil está bloqueado o en otra pestaña, no consulta nada.
// El Metro no publica la posición de sus trenes: se dibuja su recorrido sin trenes.
import { useEffect, useRef, useState } from "react";
import { colorDeLinea } from "./Comunes.jsx";
import { enDirecto, llegadasEmt } from "../lib/emt.js";
import { crearMapa } from "../lib/mapaVector.js";

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

  // El mapa y el recorrido, una vez
  useEffect(() => {
    let vivo = true;
    let mapa = null;
    const tramos = opcion.tramos.filter((t) => t.tipo === "viaje" && t.camino?.length);
    const puntos = [...tramos.flatMap((t) => t.camino)];
    if (desde?.lat != null) puntos.push([desde.lat, desde.lon]);
    if (hasta?.lat != null) puntos.push([hasta.lat, hasta.lon]);
    crearMapa(caja.current, puntos)
      .then(({ map, maplibregl }) => {
        mapa = map;
        if (!vivo) return map.remove();
        map.addSource("ruta", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: tramos.map((t) => ({
              type: "Feature",
              properties: { color: colorDeLinea(t.red, t.linea) },
              geometry: { type: "LineString", coordinates: t.camino.map(lonlat) },
            })),
          },
        });
        map.addLayer({ id: "ruta-borde", type: "line", source: "ruta", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#111111", "line-width": 9 } });
        map.addLayer({ id: "ruta", type: "line", source: "ruta", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 5.5 } });
        const nodos = tramos.flatMap((t) => [
          { p: t.camino[0], texto: `Subes al ${t.linea}: ${t.desde.nombre}` },
          { p: t.camino[t.camino.length - 1], texto: `Bajas: ${t.hasta.nombre}` },
        ]);
        for (const n of nodos) new maplibregl.Marker({ element: elemento("", "nodo-mapa"), title: n.texto }).setLngLat(lonlat(n.p)).addTo(map);
        if (desde?.lat != null) new maplibregl.Marker({ element: elemento("", "nodo-mapa nodo-salida"), title: "Sales de aquí" }).setLngLat([desde.lon, desde.lat]).addTo(map);
        if (hasta?.lat != null) new maplibregl.Marker({ element: elemento("", "nodo-mapa nodo-destino"), title: "Tu destino" }).setLngLat([hasta.lon, hasta.lat]).addTo(map);
        setListo({ map, maplibregl });
      })
      .catch(() => vivo && setEstado("No hemos podido cargar el mapa."));
    return () => {
      vivo = false;
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
