import { useEffect, type RefObject } from "react";

// Comportamiento compartido por toda capa modal: cerrar con Escape, llevar el foco al
// panel al abrirse y bloquear el desplazamiento del fondo mientras está visible.
//
// El formulario de alta y el visor de PDF necesitan exactamente lo mismo. Duplicarlo en
// los dos sitios garantiza que tarde o temprano uno de ellos se quede sin arreglar
// cuando haya que tocar algo.
export function useCapaModal<T extends HTMLElement>(
  abierto: boolean,
  cerrar: () => void,
  panelRef: RefObject<T | null>,
): void {
  useEffect(() => {
    if (!abierto) return;

    const alPulsarTecla = (evento: KeyboardEvent) => { if (evento.key === "Escape") cerrar(); };
    document.addEventListener("keydown", alPulsarTecla);

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", alPulsarTecla);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto, cerrar, panelRef]);
}
