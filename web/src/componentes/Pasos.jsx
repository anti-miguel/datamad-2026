// Línea de tiempo de una ruta: tramos (línea de color o punteada si se va andando) e hitos (paradas, salida y llegada).
// La usan el detalle de las rutas de la demo y los pasos del planificador.

export function Paso({ color, children, punteado = false }) {
  return (
    <div className="relative flex gap-3">
      <div className="flex w-[28px] shrink-0 flex-col items-center">
        <div
          className="min-h-[24px] w-[6px] flex-1"
          style={
            punteado
              ? { backgroundImage: "radial-gradient(#111 1.6px, transparent 1.8px)", backgroundSize: "6px 9px", backgroundRepeat: "repeat-y" }
              : { background: color, border: "2px solid #111", borderRadius: 4 }
          }
        />
      </div>
      <div className="min-w-0 flex-1 pb-3">{children}</div>
    </div>
  );
}

export function Hito({ texto, sub, final = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-[28px] justify-center">
        <div className={`h-[20px] w-[20px] rounded-full border-[3px] border-[#111] ${final ? "bg-amarillo" : "bg-tarjeta"}`} />
      </div>
      <div>
        <p className="text-[17px] font-bold text-tinta">{texto}</p>
        {sub && <p className="text-[14px] text-suave">{sub}</p>}
      </div>
    </div>
  );
}
