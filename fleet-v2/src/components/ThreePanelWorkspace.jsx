import { Children, useEffect, useRef } from "react";
import { useVisningsvalg } from "../../../src/fleet/useVisningsvalg.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));

export function ThreePanelWorkspace({ children, actorId, tenantId, screen, className = "" }) {
  const panels = Children.toArray(children);
  const root = useRef(null);
  const [left, setLeft, resetLeft] = useVisningsvalg({
    brugerId: actorId, kontekst: `tenant:${tenantId}`, skaerm: screen,
    egenskab: "panel-left", standard: 26,
  });
  const [right, setRight, resetRight] = useVisningsvalg({
    brugerId: actorId, kontekst: `tenant:${tenantId}`, skaerm: screen,
    egenskab: "panel-right", standard: 28,
  });

  useEffect(() => {
    const reset = (event) => {
      if (!event.detail?.skaerm || event.detail.skaerm === screen || event.detail.skaerm.startsWith(`${screen}/`)) {
        resetLeft();
        resetRight();
      }
    };
    window.addEventListener("veyro:nulstil-visning", reset);
    return () => window.removeEventListener("veyro:nulstil-visning", reset);
  }, [resetLeft, resetRight, screen]);

  const resize = (side, clientX) => {
    const rect = root.current?.getBoundingClientRect();
    if (!rect?.width) return;
    if (side === "left") setLeft(clamp(((clientX - rect.left) / rect.width) * 100, 18, Math.min(38, 72 - right)));
    else setRight(clamp(((rect.right - clientX) / rect.width) * 100, 20, Math.min(38, 74 - left)));
  };
  const keyboard = (side, event) => {
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") return side === "left" ? resetLeft() : resetRight();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    if (side === "left") setLeft((value) => clamp(Number(value) + direction * 2, 18, Math.min(38, 72 - right)));
    else setRight((value) => clamp(Number(value) - direction * 2, 20, Math.min(38, 74 - left)));
  };
  const handle = (side, value, reset) => <div className="fleet-panel-handle" role="separator" tabIndex="0" aria-orientation="vertical" aria-label={`Juster ${side === "left" ? "venstre" : "højre"} panelbredde`} aria-valuemin={side === "left" ? 18 : 20} aria-valuemax="38" aria-valuenow={Math.round(Number(value))} title="Træk for at ændre bredde. Piletaster justerer; Home nulstiller." onDoubleClick={reset} onKeyDown={(event) => keyboard(side, event)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); resize(side, event.clientX); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(side, event.clientX); }} />;

  return <section ref={root} className={`fleet-three-panel ${className}`.trim()} style={{ "--fleet-panel-left": `${left}%`, "--fleet-panel-right": `${right}%` }}>
    {panels[0]}
    {handle("left", left, resetLeft)}
    {panels[1]}
    {handle("right", right, resetRight)}
    {panels[2]}
  </section>;
}
