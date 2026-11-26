// Red de seguridad: si algo falla al pintar, en vez de una pantalla en blanco sale un aviso con «Volver a cargar».
// Importante en la demo: quien prueba con el QR no sabe recargar la página.
import { Component } from "react";

export default class Fallo extends Component {
  constructor(props) {
    super(props);
    this.state = { error: false };
  }

  static getDerivedStateFromError() {
    return { error: true };
  }

  componentDidCatch(error) {
    console.error("YaVoy:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="titulo text-[26px] text-tinta">Vaya, algo ha fallado</p>
        <p className="text-[16px] text-tinta-2">No has hecho nada mal. Vuelve a cargar y sigue donde estabas.</p>
        <button
          onClick={() => location.reload()}
          className="boton-pegatina min-h-[52px] rounded-xl bg-principal px-6 text-[18px] font-bold text-white"
        >
          Volver a cargar
        </button>
      </div>
    );
  }
}
