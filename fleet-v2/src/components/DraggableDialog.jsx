import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

const interactive = "button, a, input, select, textarea, label, summary, [role='button']";
const focusable = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";

export function DraggableDialog({ title, description, onClose, children, draggable = false, wide = false, confirmClose = false }) {
  const dialogRef = useRef(null);
  const openerRef = useRef(document.activeElement);
  const onCloseRef = useRef(onClose);
  const confirmCloseRef = useRef(confirmClose);
  const dragRef = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { confirmCloseRef.current = confirmClose; }, [confirmClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, []);

  const requestClose = () => {
    if (!confirmCloseRef.current || globalThis.confirm("Dine ugemte ændringer går tabt. Vil du lukke sagen?")) {
      onCloseRef.current();
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.focus();
    const key = (event) => {
      if (event.key === "Escape") { event.preventDefault(); requestClose(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const targets = [...dialog.querySelectorAll(focusable)].filter((node) => node.getClientRects().length > 0);
      if (!targets.length) { event.preventDefault(); dialog.focus(); return; }
      const first = targets[0];
      const last = targets.at(-1);
      if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); openerRef.current?.focus?.(); };
  }, []);

  useEffect(() => {
    const move = (event) => {
      if (!dragRef.current || !dialogRef.current) return;
      const { startX, startY, originX, originY, dialogRect, boundsRect } = dragRef.current;
      const proposedX = originX + event.clientX - startX;
      const proposedY = originY + event.clientY - startY;
      const minX = originX + boundsRect.left + 12 - dialogRect.left;
      const maxX = originX + boundsRect.right - 12 - dialogRect.right;
      const minY = originY + boundsRect.top + 12 - dialogRect.top;
      const maxY = originY + boundsRect.bottom - 12 - dialogRect.bottom;
      setOffset({ x: Math.max(minX, Math.min(maxX, proposedX)), y: Math.max(minY, Math.min(maxY, proposedY)) });
    };
    const stop = () => { dragRef.current = null; document.body.classList.remove("is-dragging-dialog"); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); document.body.classList.remove("is-dragging-dialog"); };
  }, []);

  const startDrag = (event) => {
    if (!draggable || event.button !== 0 || event.target.closest(interactive) || window.matchMedia("(max-width: 820px)").matches) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
      dialogRect: dialogRef.current.getBoundingClientRect(),
      boundsRect: event.currentTarget.closest(".fleet-dialog-backdrop").getBoundingClientRect(),
    };
    document.body.classList.add("is-dragging-dialog");
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const content = <div className="fleet-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section ref={dialogRef} className={`fleet-route-dialog${wide ? " wide" : ""}${draggable ? " draggable" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
      <header className="fleet-route-dialog-head" onPointerDown={startDrag}><div><span className="eyebrow">{draggable ? "Flyt dialogen ved at trække i overskriften" : "Samlet sagsmappe"}</span><h2>{title}</h2>{description ? <p>{description}</p> : null}</div><button type="button" aria-label={`Luk ${title}`} onClick={requestClose}><Icon name="close" size={18} /></button></header>
      <div className="fleet-route-dialog-body">{children}</div>
    </section>
  </div>;
  return createPortal(<div className="veyro-module--fleet fleet-dialog-portal-root">{content}</div>, document.body);
}
