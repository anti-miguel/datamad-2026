// Fondo de mapa de la app: OpenStreetMap apagado (gris, poco contraste y teñido con el lila de la app por CSS,
// .mapa-yavoy en index.css) para que las calles orienten sin competir con la ruta y los autobuses.
// CARTO Positron pide clave desde 2026 (sale «API KEY REQUIRED»), así que no se usa.
import L from "leaflet";

export function fondoMapa(mapa) {
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(mapa);
}
