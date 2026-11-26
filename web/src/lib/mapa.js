// Fondo de mapa de la app.
// - Con clave de CARTO (VITE_CARTO_KEY en web/.env.local, que no se sube al repo): Positron, casi blanco y con
//   pocas etiquetas, teñido un poco con el lila de la app (.mapa-carto en index.css).
// - Sin clave: OpenStreetMap apagado (gris, poco contraste y lila) para que las calles no compitan con la ruta.
// Desde el 25/09/2026 CARTO no sirve sus mapas raster sin clave (sale «API KEY REQUIRED»).
// La clave se pide gratis en carto.com/basemaps/apikey y conviene limitarla al dominio donde se publica la web.
import L from "leaflet";

const CLAVE_CARTO = import.meta.env?.VITE_CARTO_KEY;

export function fondoMapa(mapa) {
  mapa.attributionControl?.setPrefix(false); // sin «Leaflet |»: el crédito completo está en Info
  if (CLAVE_CARTO) {
    mapa.getContainer().classList.add("mapa-carto");
    return L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CLAVE_CARTO)}`, {
      subdomains: "abcd",
      maxZoom: 20,
      attribution: "© OpenStreetMap · CARTO",
    }).addTo(mapa);
  }
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(mapa);
}
