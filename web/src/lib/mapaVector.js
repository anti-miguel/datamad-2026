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
    fitBoundsOptions: { padding: 36, maxZoom: 16 },
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    interactive: interactivo,
    cooperativeGestures: interactivo, // en el móvil, un dedo desplaza la página y dos mueven el mapa
    locale: {
      "CooperativeGesturesHandler.MobileHelpText": "Usa dos dedos para mover el mapa",
      "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl + rueda para acercar el mapa",
      "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ + rueda para acercar el mapa",
      "NavigationControl.ZoomIn": "Acercar",
      "NavigationControl.ZoomOut": "Alejar",
    },
  });
  map.touchZoomRotate?.disableRotation();
  if (interactivo) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  await new Promise((ok) => map.once("load", ok));
  retocarEstilo(map);
  return { map, maplibregl };
}
