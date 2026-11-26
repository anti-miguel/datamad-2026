// Mapa vectorial con el estilo Positron de CARTO (datos de OpenStreetMap), recoloreado con la paleta de la app.
// La versión vectorial de Positron no pide clave (la raster sí, desde el 25/09/2026).
// MapLibre se carga solo cuando hace falta un mapa (import dinámico): no pesa en la entrada de la web.
// Con clave de CARTO (VITE_CARTO_KEY en web/.env.local, que no se sube) se manda también: CARTO la recomienda.
const CLAVE = import.meta.env?.VITE_CARTO_KEY;
const ESTILO = `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json${CLAVE ? `?key=${encodeURIComponent(CLAVE)}` : ""}`;

let cargando = null;
export function cargarMapLibre() {
  cargando ??= Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]).then(([m]) => m.default ?? m);
  return cargando;
}

// Colores de la app: fondo lila muy claro, agua azul suave, calles blancas, sin comercios ni iconos
function retocarEstilo(map) {
  for (const capa of map.getStyle().layers) {
    const id = capa.id;
    if (/poi|housenumber|aeroway|place_hamlet|place_suburb/i.test(id)) {
      map.setLayoutProperty(id, "visibility", "none");
      continue;
    }
    try {
      if (id === "background") map.setPaintProperty(id, "background-color", "#EEF1FF");
      else if (/^water/.test(id) && capa.type === "fill") map.setPaintProperty(id, "fill-color", "#C9D4FF");
      else if (/landcover|park|landuse/.test(id) && capa.type === "fill") map.setPaintProperty(id, "fill-color", "#E2E8FF");
      else if (/building/.test(id) && capa.type === "fill") map.setPaintProperty(id, "fill-color", "#E4E7F7");
      else if (capa.type === "symbol" && map.getLayoutProperty(id, "text-field")) map.setPaintProperty(id, "text-color", "#4A4E6A");
    } catch {
      // alguna capa no tiene esa propiedad: se deja como viene
    }
  }
}

// Crea el mapa en «caja» ajustado a «puntos» ([[lat, lon], ...]). Devuelve { map, maplibregl } cuando ya ha cargado.
export async function crearMapa(caja, puntos, { interactivo = true } = {}) {
  const maplibregl = await cargarMapLibre();
  const lons = puntos.map((p) => p[1]);
  const lats = puntos.map((p) => p[0]);
  const map = new maplibregl.Map({
    container: caja,
    style: ESTILO,
    bounds: [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    fitBoundsOptions: { padding: 50, maxZoom: 17 },
    attributionControl: false, // el botón «i» estorbaba: va un crédito mínimo en texto (abajo) y el completo en Info
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    interactive: interactivo,
    // Como Google Maps: un dedo mueve el mapa, dos dedos acercan; sin botones de zoom
    cooperativeGestures: false,
  });
  map.touchZoomRotate?.disableRotation();
  // Crédito obligatorio de OpenStreetMap y CARTO, en pequeño
  const credito = document.createElement("a");
  credito.className = "mapa-credito";
  credito.href = "https://www.openstreetmap.org/copyright";
  credito.target = "_blank";
  credito.rel = "noreferrer";
  credito.textContent = "© OpenStreetMap · CARTO";
  caja.appendChild(credito);
  await new Promise((ok) => map.once("load", ok));
  retocarEstilo(map);
  return { map, maplibregl };
}

// Límites que encierran unos puntos [[lat, lon], ...], en el orden de MapLibre
export function limitesDe(puntos) {
  const lons = puntos.map((p) => p[1]);
  const lats = puntos.map((p) => p[0]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

// Botón redondo del mapa (como los de Google Maps): icono SVG, texto para lectores de pantalla y acción
export function botonMapa(map, { svg, etiqueta, accion }) {
  const control = {
    onAdd() {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "maplibregl-ctrl mapa-volver";
      b.setAttribute("aria-label", etiqueta);
      b.title = etiqueta;
      b.innerHTML = svg;
      b.onclick = accion;
      this.el = b;
      return b;
    },
    onRemove() {
      this.el?.remove();
    },
  };
  map.addControl(control, "top-right");
  return control;
}

export const ICONO_TU = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6" fill="#111"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
export const ICONO_TODO = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
