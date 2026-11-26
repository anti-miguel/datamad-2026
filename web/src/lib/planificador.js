// Planificador de rutas propio, con los horarios oficiales de la EMT y del Metro (datos/red.json,
// generado con servidor/indice_red.py). Busca viajes directos y con un transbordo entre dos puntos cualesquiera.
// Es aproximado: la espera de cada línea se toma como media frecuencia y los tiempos andando, en línea recta con rodeo.
import { distanciaM, nombreBonito } from "./emt.js";

const BASE = import.meta.env?.BASE_URL ?? "/";
const M_POR_MIN = 75; // 4,5 km/h
const RODEO = 1.3; // las calles no van en línea recta
const MAX_ANDAR_M = 900; // hasta la primera parada y desde la última
const MAX_TRANSBORDO_M = 300;
const CASTIGO_TRANSBORDO = 4; // un transbordo cansa: se cuenta como 4 min más al ordenar
const PESO_ANDAR = 0.5; // andar cansa más que ir sentado: cada minuto andando cuenta 1,5 al ordenar
const CELDA = 0.003; // ~300 m, para buscar paradas cercanas rápido

export const minutosAndando = (m) => Math.max(1, Math.round((m * RODEO) / M_POR_MIN));

let cargando = null;
export function cargarRed() {
  cargando ??= fetch(`${BASE}datos/red.json`)
    .then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(prepararRed)
    .catch((e) => {
      cargando = null;
      throw e;
    });
  return cargando;
}

function celda(lat, lon) {
  return `${Math.floor(lat / CELDA)}|${Math.floor(lon / CELDA)}`;
}

function prepararRed(d) {
  const paradas = new Map();
  const rejilla = new Map();
  for (const [clave, [nombre, lat, lon]] of Object.entries(d.paradas)) {
    const p = { clave, nombre: nombreBonito(nombre), lat, lon, red: clave[0] === "m" ? "metro" : "emt" };
    paradas.set(clave, p);
    const c = celda(lat, lon);
    if (!rejilla.has(c)) rejilla.set(c, []);
    rejilla.get(c).push(p);
  }
  const porParada = new Map();
  const patrones = d.patrones.map((x, i) => {
    x.p.forEach((clave, pos) => {
      if (!porParada.has(clave)) porParada.set(clave, []);
      porParada.get(clave).push([i, pos]);
    });
    return { ...x, destino: nombreBonito(x.destino) };
  });
  return { paradas, rejilla, porParada, patrones };
}

// Paradas a menos de «radio» metros de un punto, con los minutos andando
export function paradasCerca(red, punto, radio = MAX_ANDAR_M) {
  const pasos = Math.ceil(radio / 300) + 1;
  const ci = Math.floor(punto.lat / CELDA);
  const cj = Math.floor(punto.lon / CELDA);
  const out = [];
  for (let i = -pasos; i <= pasos; i++) {
    for (let j = -pasos; j <= pasos; j++) {
      for (const p of red.rejilla.get(`${ci + i}|${cj + j}`) ?? []) {
        const m = distanciaM(punto, p);
        if (m <= radio) out.push({ parada: p, metros: m, andar: minutosAndando(m) });
      }
    }
  }
  return out.sort((a, b) => a.metros - b.metros);
}

function tramoViaje(red, pi, i, j) {
  const pat = red.patrones[pi];
  return {
    tipo: "viaje",
    red: pat.red,
    linea: pat.linea,
    destino: pat.destino,
    cada: pat.cada,
    desde: red.paradas.get(pat.p[i]),
    hasta: red.paradas.get(pat.p[j]),
    paradas: j - i,
    minutos: Math.max(1, Math.round(pat.t[j] - pat.t[i])),
    // paradas entre medias (sin la de subida ni la de bajada), para los pasos
    entreMedias: pat.p.slice(i + 1, j).map((c) => red.paradas.get(c).nombre),
    // recorrido parada a parada, para el mapa en directo
    camino: pat.p.slice(i, j + 1).map((c) => {
      const p = red.paradas.get(c);
      return [p.lat, p.lon];
    }),
  };
}

// ¿Funciona este recorrido a esta hora? Búhos (N...) solo de noche; el Metro cierra de 1:30 a 6:00.
function funciona(pat, hora) {
  if (hora == null) return true;
  const noche = hora >= 23.5 || hora < 6;
  if (/^N\d/.test(pat.linea)) return noche;
  if (pat.red === "metro") return !(hora >= 1.5 && hora < 6);
  return !(hora >= 0.5 && hora < 6); // los diurnos de la EMT acaban hacia las 23:30-00:30
}

// Opciones para ir de A a B ({ lat, lon }), de la mejor a la peor. Como mucho «cuantas».
// «hora» (decimal, 8.5 = 8:30) quita las líneas que no funcionan a esa hora.
// «margen(tramo)» da los minutos de más que tarda esa línea 1 de cada 10 veces (medido): se suma para el peor caso.
// Se ordena por peor caso + esfuerzo (andar y transbordos), no solo por el tiempo medio: lo fiable y lo cómodo primero.
export function planificar(red, A, B, { cuantas = 5, hora = null, margen = null } = {}) {
  const opciones = [];
  const directo = distanciaM(A, B);
  if (minutosAndando(directo) <= 25) {
    opciones.push({ total: minutosAndando(directo), transbordos: 0, tramos: [{ tipo: "andar", minutos: minutosAndando(directo), hasta: "tu destino" }] });
  }

  const origen = new Map(paradasCerca(red, A).map((x) => [x.parada.clave, x]));
  const destino = new Map(paradasCerca(red, B).map((x) => [x.parada.clave, x]));

  // 1) Desde las paradas de salida: a qué parada se llega antes con un solo vehículo (para los transbordos)
  //    y viajes directos que pasan por una parada de llegada.
  const alcance = new Map(); // clave de parada -> { t, pi, i, k }
  const directos = new Map(); // patrón -> mejor opción directa
  for (const [clave, o] of origen) {
    for (const [pi, i] of red.porParada.get(clave) ?? []) {
      const pat = red.patrones[pi];
      if (!funciona(pat, hora)) continue;
      const salida = o.andar + pat.cada / 2;
      for (let k = i + 1; k < pat.p.length; k++) {
        const t = salida + pat.t[k] - pat.t[i];
        const prev = alcance.get(pat.p[k]);
        if (!prev || t < prev.t) alcance.set(pat.p[k], { t, pi, i, k });
        const d = destino.get(pat.p[k]);
        if (d) {
          const total = t + d.andar;
          const prevD = directos.get(pi);
          if (!prevD || total < prevD.total) directos.set(pi, { total, pi, i, k, o, d });
        }
      }
    }
  }
  for (const x of directos.values()) {
    opciones.push({
      total: Math.round(x.total),
      transbordos: 0,
      tramos: [
        { tipo: "andar", minutos: x.o.andar, hasta: x.o.parada.nombre },
        tramoViaje(red, x.pi, x.i, x.k),
        { tipo: "andar", minutos: x.d.andar, hasta: "tu destino" },
      ],
    });
  }

  // 2) Con un transbordo: segundo vehículo que acaba cerca del destino y sale cerca de donde dejó el primero
  const transbordos = new Map(); // «línea1>línea2» -> mejor opción
  const cercaDe = new Map(); // memoria de paradasCerca para no repetirlo en cada parada
  const cerca = (s) => {
    if (!cercaDe.has(s.clave)) cercaDe.set(s.clave, paradasCerca(red, s, MAX_TRANSBORDO_M));
    return cercaDe.get(s.clave);
  };
  for (const [clave, d] of destino) {
    for (const [pj, j] of red.porParada.get(clave) ?? []) {
      const pat2 = red.patrones[pj];
      if (!funciona(pat2, hora)) continue;
      for (let m = 0; m < j; m++) {
        const s = red.paradas.get(pat2.p[m]);
        for (const c of cerca(s)) {
          const a = alcance.get(c.parada.clave);
          if (!a) continue;
          const pat1 = red.patrones[a.pi];
          if (pat1.linea === pat2.linea && pat1.red === pat2.red) continue;
          const andarT = c.parada.clave === s.clave ? 0 : c.andar;
          const total = a.t + andarT + pat2.cada / 2 + pat2.t[j] - pat2.t[m] + d.andar;
          const firma = `${pat1.red}${pat1.linea}>${pat2.red}${pat2.linea}`;
          const prev = transbordos.get(firma);
          if (!prev || total < prev.total) transbordos.set(firma, { total, a, andarT, pj, m, j, d, c });
        }
      }
    }
  }
  for (const x of transbordos.values()) {
    const o = [...origen.values()].find((v) => v.parada.clave === red.patrones[x.a.pi].p[x.a.i]);
    opciones.push({
      total: Math.round(x.total),
      transbordos: 1,
      tramos: [
        { tipo: "andar", minutos: o?.andar ?? 1, hasta: red.paradas.get(red.patrones[x.a.pi].p[x.a.i]).nombre },
        tramoViaje(red, x.a.pi, x.a.i, x.a.k),
        ...(x.andarT > 0 ? [{ tipo: "andar", minutos: x.andarT, hasta: red.paradas.get(red.patrones[x.pj].p[x.m]).nombre, transbordo: true }] : []),
        tramoViaje(red, x.pj, x.m, x.j),
        { tipo: "andar", minutos: x.d.andar, hasta: "tu destino" },
      ],
    });
  }

  // Peor caso (tiempo + margen medido de cada línea) y esfuerzo (andar y transbordos)
  for (const o of opciones) {
    const andado = o.tramos.filter((t) => t.tipo === "andar").reduce((s, t) => s + t.minutos, 0);
    o.margen = Math.round(o.tramos.filter((t) => t.tipo === "viaje").reduce((s, t) => s + (margen ? margen(t) : 0), 0));
    o.peor = o.total + o.margen;
    o.andado = andado;
    o.coste = o.peor + PESO_ANDAR * andado + CASTIGO_TRANSBORDO * o.transbordos;
  }
  const mejor = Math.min(...opciones.map((o) => o.coste));
  return opciones
    .filter((o) => o.coste <= mejor + 25)
    .sort((a, b) => a.coste - b.coste)
    .slice(0, cuantas);
}
