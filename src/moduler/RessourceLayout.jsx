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

export function RessourceRegister({ children, className = "" }) {
  return (
    <section className={`fc-card fc-ressource-register${className ? ` ${className}` : ""}`}>
      <div className="fc-card-b">{children}</div>
    </section>
  );
}

export function RessourceResultat({ children }) {
  return <div className="fc-ressource-resultat">{children}</div>;
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
