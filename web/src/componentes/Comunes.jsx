// Piezas pequeñas que se repiten en varias pantallas
import { nivelFiabilidad } from "../lib/ventana.js";
import { iconoDeRed } from "../lib/util.js";
import { IconoVehiculo } from "./Iconos.jsx";

// Color de cada línea de metro, como en los planos (fondo, texto)
const COLOR_METRO = {
  1: ["#38A3DC", "#fff"], 2: ["#E2231A", "#fff"], 3: ["#FFD200", "#111"], 4: ["#B4692E", "#fff"],
  5: ["#9BBF2B", "#111"], 6: ["#9AA0A6", "#111"], 7: ["#F7A738", "#111"], 8: ["#EC6CA8", "#111"],
  9: ["#A3268E", "#fff"], 10: ["#1B4D9C", "#fff"], 11: ["#00A04F", "#fff"], 12: ["#B5A21B", "#111"],
};

// Número de línea en una píldora: EMT azul, interurbano verde, Cercanías rojo y metro con el color de su línea
export function Linea({ linea, red = "emt", grande = false }) {
  let fondo = "#2335F5";
  let texto = "#fff";
  if (red === "renfe") fondo = "#C8102E";
  else if (red === "interurbano") fondo = "#3F8F1E";
  else if (red === "metro") [fondo, texto] = COLOR_METRO[linea] ?? ["#3A4558", "#fff"];
  const metro = red === "metro";
  return (
    <span
      className={`inline-flex items-center justify-center border-2 border-[#111] font-bold ${metro ? "rounded-full" : "rounded-lg"} ${
        grande ? "h-[32px] min-w-[52px] px-3 text-[18px]" : "h-[26px] min-w-[44px] px-2.5 text-[16px]"
      } ${metro && grande ? "!min-w-[32px] !px-0" : metro ? "!min-w-[26px] !px-0" : ""}`}
      style={{ background: fondo, color: texto }}
      aria-label={metro ? `Metro línea ${linea}` : undefined}
    >
      {linea}
    </span>
  );
}

// Cuadrado con el icono genérico de la red (sin logotipos de operadores, sección 1.2), con el color de sus líneas
const FONDO_RED = { emt: "#2335F5", interurbano: "#3F8F1E", renfe: "#C8102E", metro: "#111111" };
const NOMBRE_ICONO = { emt: "Autobús EMT", interurbano: "Autobús interurbano", renfe: "Cercanías", metro: "Metro" };

export function IconoRed({ red, grande = false }) {
  const lado = grande ? 48 : 42;
  // Aproximaciones a las señales de Metro y Cercanías, sin texto, con sus proporciones y colores
  if (red === "metro") {
    return (
      <svg width={lado} height={lado} viewBox="0 0 48 48" className="shrink-0" role="img" aria-label={NOMBRE_ICONO[red]}>
        <rect x="1.25" y="1.25" width="45.5" height="45.5" rx="9" fill="#0B56A4" stroke="#111" strokeWidth="2.5" />
        {/* rombo ancho (≈1,6:1) con borde blanco fino, banda roja, rombo blanco y placa azul en el centro */}
        <path d="M3.2 24 24 10.6 44.8 24 24 37.4Z" fill="#E4262C" stroke="#fff" strokeWidth="1.2" strokeLinejoin="miter" />
        <path d="M11.4 24 24 15.9 36.6 24 24 32.1Z" fill="#fff" />
        <rect x="13.8" y="19.6" width="20.4" height="8.8" fill="#0B56A4" stroke="#fff" strokeWidth="1" />
      </svg>
    );
  }
  if (red === "renfe") {
    return (
      <svg width={lado} height={lado} viewBox="0 0 48 48" className="shrink-0" role="img" aria-label={NOMBRE_ICONO[red]}>
        <circle cx="24" cy="24" r="22.75" fill="#EE2B30" stroke="#111" strokeWidth="2.5" />
        {/* arco blanco de 225° (no los tres cuartos de la señal): empieza arriba, gira por la derecha y acaba abajo a la izquierda */}
        <path d="M24 8.8A15.2 15.2 0 1 1 13.25 34.75L18.63 29.37A7.6 7.6 0 1 0 24 16.4Z" fill="#fff" />
      </svg>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl border-2 border-[#111] text-white ${grande ? "h-[48px] w-[48px]" : "h-[42px] w-[42px]"}`}
      style={{ background: FONDO_RED[red] ?? "#3A4558" }}
      role="img"
      aria-label={NOMBRE_ICONO[red] ?? "Transporte"}
    >
      <IconoVehiculo tipo={iconoDeRed(red)} className={grande ? "h-7 w-7" : "h-6 w-6"} />
    </span>
  );
}

const COLOR_TEXTO = { verde: "text-verde-vivo", ambar: "text-ambar-vivo", rojo: "text-rojo-vivo" };
const COLOR_FONDO = { verde: "bg-verde", ambar: "bg-ambar", rojo: "bg-rojo" };

// Etiqueta de fiabilidad: siempre texto además del color (sección 1.4)
export function Etiqueta({ p, relleno = false }) {
  const n = nivelFiabilidad(p);
  if (relleno) {
    return (
      <span className={`${COLOR_FONDO[n.clase]} inline-block rounded-lg border-2 border-[#111] px-2.5 py-1 font-bold text-white`}>
        {n.texto}
      </span>
    );
  }
  return <span className={`${COLOR_TEXTO[n.clase]} font-bold`}>{n.texto}</span>;
}

export function Tarjeta({ children, className = "", sombra = false, ...resto }) {
  return (
    <div
      {...resto}
      className={`rounded-2xl bg-tarjeta ${sombra ? "pegatina-grande" : "pegatina"} ${className}`}
    >
      {children}
    </div>
  );
}

export function Volver({ texto, onClick }) {
  return (
    <button onClick={onClick} className="min-h-[44px] text-principal text-[16px] -ml-1 px-1">
      ← {texto}
    </button>
  );
}
