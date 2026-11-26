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
export const llegadasMetro = (andenes) => pedir(`metro?andenes=${encodeURIComponent(andenes.join(","))}`);

// Estaciones de Metro (GTFS oficial, servidor/indice_paradas_metro.py): { estaciones: [...], nombres: { "4_63": "Diego de Leon" } }
let indiceMetro = null;
export function cargarIndiceMetro() {
  indiceMetro ??= fetch(`${BASE}datos/paradas_metro.json`)
    .then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then((d) => ({
      nombres: d.nombres,
      estaciones: d.estaciones.map(([id, nombre, lat, lon, andenes, lineas]) => ({ id, nombre, lat, lon, andenes, lineas: lineas ? lineas.split(" ") : [] })),
    }))
    .catch((e) => {
      indiceMetro = null;
      throw e;
    });
  return indiceMetro;
}

// Estación de Metro que no está en la demo
export function paradaMetroViva(e) {
  return {
    id: `metro-${e.id}`,
    nombre: nombreBonito(e.nombre),
    red: "metro",
    tipo: "estacion",
    lat: e.lat,
    lon: e.lon,
    lineas: e.lineas,
    andenes: e.andenes,
    etiqueta: `Metro · estación de ${nombreBonito(e.nombre)}`,
    llegadas: [],
    directa: true,
  };
}

// Qué hay que pedir en directo para una parada: { tipo: "emt", numero } o { tipo: "metro", andenes } o null
export function consultaDirecto(p) {
  if (!p) return null;
  if (p.red === "emt" && numeroEmt(p.id) && /^\d+$/.test(numeroEmt(p.id))) return { tipo: "emt", numero: numeroEmt(p.id) };
  if (p.red === "metro" && p.andenes?.length) return { tipo: "metro", andenes: p.andenes };
  return null;
}
export const cercanasEmt = (lat, lon) => pedir(`cercanas?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`);

// Con ?hora o ?demo la app enseña siempre los minutos de la demo, para ensayar el pitch igual cada vez
export function enDirecto() {
  const q = new URLSearchParams(location.search);
  return !q.has("hora") && !q.has("demo");
}

export function numeroEmt(id) {
  return id?.startsWith("emt-") ? id.slice(4) : null;
}

// Mismas mayúsculas para todos los nombres (la EMT escribe «Pinar De Chamartín», el Metro «PINAR DEL REY»):
// artículos y preposiciones en minúscula salvo al principio del nombre o después de un guion («Pío XII - La Paloma»)
const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "a", "al", "en", "con"]);
export function nombreBonito(nombre) {
  let inicio = true;
  return String(nombre)
    .replace(/\s+-\s+/g, " - ")
    .split(" ")
    .filter(Boolean)
    .map((w) => {
      if (w === "-") {
        inicio = true;
        return w;
      }
      const sale = !inicio && MINUSCULAS.has(w.toLowerCase()) ? w.toLowerCase() : w;
      inicio = false;
      return sale;
    })
    .join(" ");
}

// Parada de la EMT que no está en la demo, a partir de la respuesta de /cercanas
export function paradaEmtViva(p) {
  return {
    id: `emt-${p.id}`,
    nombre: nombreBonito(p.nombre),
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
