import { Children, useEffect, useRef } from "react";
import { begraensPanel } from "./visningsvalg.js";
import { useVisningsvalg } from "./useVisningsvalg.js";

export default function JusterbarePaneler({
  children, className = "", brugerId, kontekst, skaerm,
  standard = 66, minimum = 38, maksimum = 76,
}) {
  const paneler = Children.toArray(children);
  const ramme = useRef(null);
  const [venstre, setVenstre, nulstil] = useVisningsvalg({
    brugerId, kontekst, skaerm, egenskab: "panel-venstre", standard,
  });
  useEffect(() => {
    const haandter = (event) => { if (!event.detail?.skaerm || event.detail.skaerm === skaerm) nulstil(); };
    window.addEventListener("veyro:nulstil-visning", haandter);
    return () => window.removeEventListener("veyro:nulstil-visning", haandter);
  }, [nulstil, skaerm]);

  const saetFraPointer = (event) => {
    if (!ramme.current) return;
    const rect = ramme.current.getBoundingClientRect();
    setVenstre(begraensPanel(((event.clientX - rect.left) / rect.width) * 100, minimum, maksimum));
  };

  const tast = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") nulstil();
    else setVenstre((andel) => begraensPanel(Number(andel) + (event.key === "ArrowRight" ? 2 : -2), minimum, maksimum));
  };

  return (
    <div ref={ramme} className={`fc-justerbare-paneler ${className}`.trim()}
      style={{ "--fc-panel-venstre": `${begraensPanel(venstre, minimum, maksimum)}%` }}>
      <div className="fc-justerbart-panel">{paneler[0]}</div>
      <div className="fc-panelhaandtag" role="separator" tabIndex="0" aria-orientation="vertical"
        aria-label="Juster panelbredder" aria-valuemin={minimum} aria-valuemax={maksimum}
        aria-valuenow={Math.round(begraensPanel(venstre, minimum, maksimum))}
        title="Træk for at ændre panelbredder. Piletaster justerer; Home nulstiller."
        onDoubleClick={nulstil} onKeyDown={tast}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); saetFraPointer(event); }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) saetFraPointer(event); }} />
      <div className="fc-justerbart-panel">{paneler[1]}</div>
    </div>
  );
}
