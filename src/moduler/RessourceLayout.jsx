export function RessourceSide({ titel, handling, children, className = "" }) {
  return (
    <section className={`fc-ressource-side${className ? ` ${className}` : ""}`}>
      <header className="fc-ressource-hoved">
        <h1>{titel}</h1>
        {handling ? <div className="fc-ressource-handlinger">{handling}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function RessourceRegister({ children, className = "", titel = "" }) {
  return (
    <section className={`fc-card fc-ressource-register resource-register-panel${className ? ` ${className}` : ""}`}>
      {titel ? <header className="fc-ressource-register-hoved"><h2>{titel}</h2></header> : null}
      <div className="fc-card-b">{children}</div>
    </section>
  );
}

export function RessourceResultat({ children }) {
  return <div className="fc-ressource-resultat">{children}</div>;
}

export function RessourceAabn({ label, paaAabn }) {
  return (
    <button
      type="button"
      className="fc-ressource-aabn"
      aria-label={`Åbn ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        paaAabn();
      }}
    >
      Åbn <span aria-hidden="true">›</span>
    </button>
  );
}

export function RessourceMetrik({ label, vaerdi, note }) {
  return (
    <div className="fc-ressource-metrik" aria-label={`${label}: ${vaerdi}. ${note}`}>
      <span>{label}</span>
      <strong>{vaerdi}</strong>
      <small>{note}</small>
    </div>
  );
}
