// Llegadas en directo de la EMT y paradas cercanas, a través de la pasarela del servidor (servidor/emt_api.py).
// Las credenciales de MobilityLabs se quedan en el servidor. Si la pasarela no responde, la app sigue con los minutos de la demo.
const BASE = import.meta.env.BASE_URL;

async function pedir(ruta) {
  const r = await fetch(`${BASE}api/${ruta}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

export const llegadasEmt = (numero) => pedir(`llegadas?parada=${encodeURIComponent(numero)}`);
export const cercanasEmt = (lat, lon) => pedir(`cercanas?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`);

// Con ?hora o ?demo la app enseña siempre los minutos de la demo, para ensayar el pitch igual cada vez
export function enDirecto() {
  const q = new URLSearchParams(location.search);
  return !q.has("hora") && !q.has("demo");
}

export function numeroEmt(id) {
  return id?.startsWith("emt-") ? id.slice(4) : null;
}

// Parada de la EMT que no está en la demo, a partir de la respuesta de /cercanas
export function paradaEmtViva(p) {
  return {
    id: `emt-${p.id}`,
    nombre: p.nombre,
    red: "emt",
    tipo: "intermedia",
    lat: p.lat,
    lon: p.lon,
    lineas: p.lineas,
    llegadas: [],
    directa: true,
  };
}

// Distancia en metros entre dos puntos { lat, lon }
export function distanciaM(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function textoDistancia(m) {
  if (m == null) return "";
  return m < 1000 ? `a ${Math.round(m / 10) * 10} m` : `a ${(m / 1000).toFixed(1).replace(".", ",")} km`;
}
