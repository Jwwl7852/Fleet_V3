import { LEAVE_STATUS, SHIFT_STATUS } from "../domain/workforceDomain.js";

export const formatDate = (ms, options = {}) => new Intl.DateTimeFormat("da-DK", { day: "2-digit", month: "short", year: options.year ? "numeric" : undefined }).format(ms);
export const formatTime = (ms) => new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit" }).format(ms);
export const formatHours = (minutes) => `${(minutes / 60).toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`;
export const employeeName = (state, id) => state.employees.find((item) => item.id === id)?.name || "Ukendt medarbejder";

export function Pill({ tone = "neutral", children }) { return <span className={`wf-pill wf-pill--${tone}`}>{children}</span>; }
export const shiftTone = (status) => status === "published" ? "ok" : status === "draft" ? "warn" : "neutral";
export const leaveTone = (status) => status === "approved" ? "ok" : status === "pending" ? "warn" : status === "rejected" ? "bad" : "neutral";
export const ShiftStatus = ({ value }) => <Pill tone={shiftTone(value)}>{SHIFT_STATUS[value] || value}</Pill>;
export const LeaveStatus = ({ value }) => <Pill tone={leaveTone(value)}>{LEAVE_STATUS[value] || value}</Pill>;

export function PageHeader({ title, subtitle, actions }) {
  return <header className="wf-page-head"><div><h1>{title}</h1><p>{subtitle}</p></div>{actions && <div className="wf-actions">{actions}</div>}</header>;
}

export function Card({ title, children, className = "" }) {
  return <section className={`wf-card ${className}`}>{title && <h2>{title}</h2>}{children}</section>;
}

export function Modal({ title, children, onClose, wide = false }) {
  return <div className="wf-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`wf-modal ${wide ? "wf-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button className="wf-icon-btn" onClick={onClose} aria-label="Luk">×</button></header>{children}
    </section>
  </div>;
}

export function Field({ label, children, hint }) { return <label className="wf-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }

export function Empty({ children }) { return <div className="wf-empty">{children}</div>; }

export function Notice({ tone = "info", children }) { return <div className={`wf-notice wf-notice--${tone}`}>{children}</div>; }
