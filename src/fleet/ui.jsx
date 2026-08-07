/* src/fleet/ui.jsx
 * Delte primitiver. Modulerne definerer ikke egne kort, tabeller,
 * statuschips eller tomme tilstande — så kan de heller ikke se
 * forskellige ud fra skærm til skærm.
 */
import { deviation } from "./format.js";

export const Kort = ({ titel, handling, children, className = "", ...p }) => (
  <section className={`fc-card ${className}`} {...p}>
    {(titel || handling) && (
      <div className="fc-card-h fc-row">
        <span>{titel}</span>
        {handling}
      </div>
    )}
    <div className="fc-card-b">{children}</div>
  </section>
);

/**
 * KpiKort — brug ALTID afvigelse via deviation(), ikke en håndskrevet
 * streng. Ellers ender + med at være rødt på én skærm og grønt på en anden.
 */
export function KpiKort({ label, vaerdi, afvigelse, note, ikon, tone }) {
  return (
    <div className="fc-card fc-kpi">
      {ikon && <div className={`fc-kpi-ico fc-tone-${tone || "info"}`}>{ikon}</div>}
      <div className="fc-kpi-txt">
        <div className="fc-kpi-l">{label}</div>
        <div className="fc-kpi-v">{vaerdi}</div>
        {afvigelse ? (
          <div className={`fc-kpi-d fc-${afvigelse.tone}`}>
            {afvigelse.text}{note ? ` ${note}` : ""}
          </div>
        ) : (
          <div className="fc-kpi-d fc-neutral">{note || "\u00a0"}</div>
        )}
      </div>
    </div>
  );
}

export const KpiRaekke = ({ children }) => <div className="fc-kpis">{children}</div>;

const PILLE_TONE = { ok: "fc-pill-ok", warn: "fc-pill-warn", bad: "fc-pill-bad", info: "fc-pill-info" };
export const Pille = ({ tone = "info", children }) => (
  <span className={`fc-pill ${PILLE_TONE[tone] || PILLE_TONE.info}`}>{children}</span>
);

/**
 * Tabel — kolonner: [{ key, label, num, bredde, render }]
 * tom: hvad der vises når der ikke er rækker. Aldrig en blank tabel.
 */
export function Tabel({ kolonner, raekker, noegle = (r, i) => r.id ?? i, tom = "Ingen data i perioden." }) {
  if (!raekker?.length) return <Tom>{tom}</Tom>;
  return (
    <div className="fc-scroll">
      <table className="fc-table">
        <thead>
          <tr>
            {kolonner.map((k) => (
              <th key={k.key} className={k.num ? "fc-num" : ""} style={k.bredde ? { width: k.bredde } : undefined}>
                {k.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {raekker.map((r, i) => (
            <tr key={noegle(r, i)}>
              {kolonner.map((k) => (
                <td key={k.key} className={k.num ? "fc-num" : ""}>
                  {k.render ? k.render(r) : r[k.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Tom = ({ children, handling }) => (
  <div className="fc-empty">
    <p>{children}</p>
    {handling}
  </div>
);

/** Fejl fortæller hvad brugeren kan gøre — ikke bare at noget gik galt. */
export const Fejl = ({ children, genprov }) => (
  <div className="fc-empty fc-empty-bad">
    <p>{children}</p>
    {genprov && <button type="button" className="fc-btn" onClick={genprov}>Prøv igen</button>}
  </div>
);

export const Henter = ({ hvad = "data" }) => (
  <div className="fc-empty"><p>Henter {hvad}…</p></div>
);

export const Knap = ({ variant = "sekundaer", children, ...p }) => (
  <button type="button" className={`fc-btn fc-btn-${variant}`} {...p}>{children}</button>
);

export const Raekke = ({ children, ...p }) => <div className="fc-row" {...p}>{children}</div>;
export const Gitter = ({ kolonner = "1fr", children, ...p }) => (
  <div className="fc-grid" style={{ gridTemplateColumns: kolonner }} {...p}>{children}</div>
);

/** Nøgletal-linje til de smalle sidepaneler (Bemanding i dag, Facility, Indkøb). */
export const MiniLinje = ({ label, vaerdi }) => (
  <div className="fc-mini"><span>{label}</span><b>{vaerdi}</b></div>
);

/** Afvigelse som færdig celle. Genbruger format.deviation, så fortegn og
 *  farve følger samme regel overalt. */
export const Afvigelse = ({ vaerdi, betterWhen = "lower", unit = "kr", dec }) => {
  const d = deviation(vaerdi, { betterWhen, unit, dec });
  return <span className={`fc-${d.tone}`}>{d.text}</span>;
};
