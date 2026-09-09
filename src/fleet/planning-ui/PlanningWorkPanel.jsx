import { useEffect } from "react";

export default function PlanningWorkPanel({ title, eyebrow, onClose, onOpenNewTab, children, actions, className = "", draft = false }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className={`pw-panel-host ${className}`} data-modeless="true">
    <aside className="pw-panel" role="complementary" aria-label={title}>
      <header className="pw-panel-head"><div><span className="pu-eyebrow">{eyebrow}</span><h2>{title}</h2>{draft && <span className="pw-draft-badge">Kladde</span>}</div><div className="pw-panel-head-actions">{onOpenNewTab && <button type="button" className="pu-btn pu-btn-quiet" onClick={onOpenNewTab}>Åbn i ny fane</button>}<button type="button" className="pr-icon-button" aria-label={`Luk ${title}`} onClick={onClose}>×</button></div></header>
      <div className="pw-panel-body">{children}</div>
      {actions && <footer className="pw-panel-actions">{actions}</footer>}
    </aside>
  </div>;
}
