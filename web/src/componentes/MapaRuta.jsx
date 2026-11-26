// Mapa en directo de una ruta del planificador: el recorrido de cada tramo con el color de su línea, dónde subes y bajas,
// y los autobuses de la EMT que vienen hacia tu parada (posición GPS de la consulta de llegadas, cada 20 s).
// Solo existe mientras el interruptor está encendido; si el móvil está bloqueado o en otra pestaña, no consulta nada.
// El Metro no publica la posición de sus trenes: se dibuja su recorrido sin trenes.
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { colorDeLinea } from "./Comunes.jsx";
import { enDirecto, llegadasEmt } from "../lib/emt.js";
import { fondoMapa } from "../lib/mapa.js";

const CADA_MS = 20000;
const MAX_BUSES_TRAMO = 3;

function punto(mapa, latlon, color, texto, radio = 7) {
  return L.circleMarker(latlon, { radius: radio, color: "#111", weight: 2.5, fillColor: color, fillOpacity: 1 })
    .bindTooltip(texto, { direction: "top", offset: [0, -6] })
    .addTo(mapa);
}

export default function MapaRuta({ opcion, desde, hasta }) {
  const caja = useRef(null);
  const mapaRef = useRef(null);
  const capaBuses = useRef(null);
  const [estado, setEstado] = useState("Buscando autobuses…");
  const tramosBus = opcion.tramos.filter((t) => t.tipo === "viaje" && t.red === "emt");

  // El mapa y el recorrido, una vez
  useEffect(() => {
    const mapa = L.map(caja.current, { preferCanvas: true, zoomControl: true, scrollWheelZoom: false, tap: true });
    mapaRef.current = mapa;
    fondoMapa(mapa);
    const todos = [];
    if (desde?.lat != null) todos.push([desde.lat, desde.lon]);
    if (hasta?.lat != null) todos.push([hasta.lat, hasta.lon]);
    for (const t of opcion.tramos) {
      if (t.tipo !== "viaje" || !t.camino?.length) continue;
      const color = colorDeLinea(t.red, t.linea);
      L.polyline(t.camino, { color: "#111", weight: 9, opacity: 0.9 }).addTo(mapa);
      L.polyline(t.camino, { color, weight: 5.5, opacity: 1 }).addTo(mapa);
      punto(mapa, t.camino[0], "#FFFFFF", `Subes al ${t.linea}: ${t.desde.nombre}`, 6);
      punto(mapa, t.camino[t.camino.length - 1], "#FFFFFF", `Bajas: ${t.hasta.nombre}`, 6);
      todos.push(...t.camino);
    }
    if (desde?.lat != null) punto(mapa, [desde.lat, desde.lon], "#FFE15A", "Sales de aquí", 8);
    if (hasta?.lat != null) punto(mapa, [hasta.lat, hasta.lon], "#1E8E3E", "Tu destino", 8);
    if (todos.length) mapa.fitBounds(L.latLngBounds(todos).pad(0.12));
    capaBuses.current = L.layerGroup().addTo(mapa);
    const observador = new ResizeObserver(() => mapa.invalidateSize());
    observador.observe(caja.current);
    return () => {
      observador.disconnect();
      mapa.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Los autobuses, cada 20 s mientras se ve
  useEffect(() => {
    if (!tramosBus.length) {
      setEstado("En esta ruta no hay autobuses de la EMT. El Metro no publica dónde van sus trenes.");
      return;
    }
    if (!enDirecto()) {
      setEstado("En el modo de ensayo no hay posiciones en directo.");
      return;
    }
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
      const capa = capaBuses.current;
      capa?.clearLayers();
      const buses = grupos.flat().filter(Boolean);
      for (const b of buses) {
        const minutos = b.minutos <= 1 ? "ya" : `${b.minutos}′`;
        const icono = L.divIcon({
          className: "",
          iconSize: null,
          iconAnchor: [14, 14],
          html: `<span class="bus-mapa"><span class="bus-mapa-linea" style="background:${colorDeLinea("emt", b.linea)}">${b.linea}</span><span class="bus-mapa-min">${minutos}</span></span>`,
        });
        L.marker([b.lat, b.lon], { icon: icono, keyboard: false, title: `${b.linea}, a ${b.minutos} min de ${b.t.desde.nombre}` }).addTo(capa);
      }
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-1.5">
      <div ref={caja} className="mapa-yavoy pegatina h-[260px] overflow-hidden rounded-2xl" role="img" aria-label="Mapa de la ruta con los autobuses en directo" />
      <p className="text-[13px] text-tinta-2" aria-live="polite">
        {estado}
      </p>
    </div>
  );
}
