// Trazados reales de cada recorrido por las calles (shapes.txt de los GTFS de la EMT y del Metro),
// simplificados y en polilínea codificada: datos/formas.json, alineado con red.patrones (servidor/indice_red.py).
// Se baja solo al dibujar un mapa. Sin trazado, se dibuja en línea recta de parada a parada.
const BASE = import.meta.env?.BASE_URL ?? "/";

let cargando = null;
export function cargarFormas() {
  cargando ??= fetch(`${BASE}datos/formas.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .catch((e) => {
      cargando = null;
      throw e;
    });
  return cargando;
}

const decodificadas = new Map();
// Polilínea codificada (precisión 5) -> [[lat, lon], ...]
export function decodificar(texto) {
  if (!texto) return null;
  if (decodificadas.has(texto)) return decodificadas.get(texto);
  const puntos = [];
  let i = 0;
  let la = 0;
  let lo = 0;
  while (i < texto.length) {
    for (const eje of [0, 1]) {
      let resultado = 0;
      let desplaza = 0;
      let b;
      do {
        b = texto.charCodeAt(i++) - 63;
        resultado |= (b & 0x1f) << desplaza;
        desplaza += 5;
      } while (b >= 0x20);
      const d = resultado & 1 ? ~(resultado >> 1) : resultado >> 1;
      if (eje === 0) la += d;
      else lo += d;
    }
    puntos.push([la / 1e5, lo / 1e5]);
  }
  decodificadas.set(texto, puntos);
  return puntos;
}

export const metrosEntre = (a, b) => Math.hypot((b[0] - a[0]) * 111000, (b[1] - a[1]) * 85000);

// Proyección de «p» sobre un tramo del trazado: { k: índice del tramo (de k a k+1), punto: [lat, lon], d: metros }
function proyectarEn(puntos, p, k) {
  const a = puntos[k];
  const b = puntos[k + 1];
  const ax = a[1] * 85000, ay = a[0] * 111000;
  const bx = b[1] * 85000, by = b[0] * 111000;
  const px = p[1] * 85000, py = p[0] * 111000;
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { k, punto: q, d: metrosEntre(q, p) };
}

// Proyección de «p» sobre el tramo más cercano del trazado (desde el tramo «desde»)
function proyectar(puntos, p, desde = 0) {
  let mejor = { k: desde, punto: puntos[desde], d: Infinity };
  for (let k = desde; k < puntos.length - 1; k++) {
    const a = puntos[k];
    const b = puntos[k + 1];
    const ax = a[1] * 85000, ay = a[0] * 111000;
    const bx = b[1] * 85000, by = b[0] * 111000;
    const px = p[1] * 85000, py = p[0] * 111000;
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
    const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = metrosEntre(q, p);
    if (d < mejor.d) mejor = { k, punto: q, d };
  }
  return mejor;
}

// Trozo del trazado que va de la parada «a» a la parada «b» por las calles ([lat, lon] cada una).
// Sin «b», el trozo que sale de «a» hasta «metros» (para el minimapa de una parada).
// Empieza y acaba en la proyección de cada parada sobre la calle, no en el punto del trazado más cercano.
// Si el trazado pasa dos veces cerca de la parada (vueltas, glorietas), se elige la pasada que lleva hacia
// «siguiente» (o hacia «b»): la que deja la siguiente parada más cerca por el camino.
function inicio(trazado, a, siguiente) {
  const cerca = [];
  for (let k = 0; k < trazado.length - 1; k++) {
    const x = proyectarEn(trazado, a, k);
    if (x.d <= 60) cerca.push(x);
  }
  if (!cerca.length) return proyectar(trazado, a);
  if (!siguiente || cerca.length === 1) return cerca.reduce((m, x) => (x.d < m.d ? x : m));
  let mejor = null;
  for (const x of cerca) {
    const fin = proyectar(trazado, siguiente, x.k);
    let camino = metrosEntre(x.punto, trazado[x.k + 1] ?? x.punto);
    for (let k = x.k + 1; k < fin.k; k++) camino += metrosEntre(trazado[k], trazado[k + 1]);
    const nota = x.d + fin.d + 0.3 * camino;
    if (!mejor || nota < mejor.nota) mejor = { ...x, nota };
  }
  return mejor;
}

export function recorte(trazado, a, b = null, metros = 250, siguiente = null) {
  if (!trazado || trazado.length < 2) return null;
  const ini = inicio(trazado, a, b ?? siguiente);
  if (ini.d > 150) return null; // la parada no está sobre este trazado
  if (b) {
    const fin = proyectar(trazado, b, ini.k);
    if (fin.d > 150) return null;
    // empieza y acaba en la propia parada (un tramito hasta la calle), para que la raya no quede suelta
    return [a, ini.punto, ...trazado.slice(ini.k + 1, fin.k + 1), fin.punto, b];
  }
  const out = [a, ini.punto];
  let andado = 0;
  for (let k = ini.k + 1; k < trazado.length && andado < metros; k++) {
    andado += metrosEntre(out[out.length - 1], trazado[k]);
    out.push(trazado[k]);
  }
  return out.length > 2 ? out : null;
}

// Punto a «metros» del principio de un camino, y el rumbo (grados, 0 = norte) en ese punto
export function puntoA(camino, metros) {
  let andado = 0;
  for (let k = 1; k < camino.length; k++) {
    const tramo = metrosEntre(camino[k - 1], camino[k]);
    if (andado + tramo >= metros || k === camino.length - 1) {
      const f = tramo ? Math.min(1, (metros - andado) / tramo) : 0;
      const a = camino[k - 1];
      const b = camino[k];
      const rumbo = ((Math.atan2((b[1] - a[1]) * 85000, (b[0] - a[0]) * 111000) * 180) / Math.PI + 360) % 360;
      return { punto: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], rumbo };
    }
    andado += tramo;
  }
  return null;
}
