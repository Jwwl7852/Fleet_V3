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
/**
 * `paaRaekke` gør rækken klikbar. Valgfri — udelades den, opfører tabellen sig
 * præcis som før.
 *
 * Den ligger HER frem for i den skærm der først fik brug for den, af samme
 * grund som Gitterkalender ligger i fleet/: to tabeller der render det samme
 * lidt forskelligt, opdages ikke ved at kigge på dem. Rækken får role/tabIndex
 * med, så den kan nås med tastatur — en klikbar <tr> uden det er kun klikbar
 * for dem der bruger mus.
 */
export function Tabel({ kolonner, raekker, noegle = (r, i) => r.id ?? i, tom = "Ingen data i perioden.", paaRaekke, erValgt }) {
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
            <tr
              key={noegle(r, i)}
              onClick={paaRaekke ? () => paaRaekke(r) : undefined}
              onKeyDown={paaRaekke ? (e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); paaRaekke(r); }
              } : undefined}
              tabIndex={paaRaekke ? 0 : undefined}
              role={paaRaekke ? "button" : undefined}
              aria-current={erValgt?.(r) ? "true" : undefined}
              className={erValgt?.(r) ? "fc-valgt" : undefined}
              style={paaRaekke ? { cursor: "pointer" } : undefined}
            >
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

/* Grafernes farver slås op på en tone — præcis som Pille. Et modul sender
   aldrig en farve ind, så to grafer kan ikke ende med hver sit blå. */
const GRAF_TONE = {
  brand: "var(--bc-accent)",
  neutral: "var(--bc-line)",
  ok: "var(--bc-ok)",
  warn: "var(--bc-warn)",
  bad: "var(--bc-block)",
};

/**
 * Soejlegraf — grupperede søjler med valgfri vandret mållinje.
 *
 *   punkter  [{ label, vaerdier: [tal, …] }]   én værdi pr. serie
 *   serier   [{ navn, tone }]                  tone slås op i GRAF_TONE
 *   maal     { vaerdi, navn }                  valgfri stiplet linje
 *   format   (tal) => streng                   bruges i tooltip
 *
 * Nulpunktet er altid 0. En afkortet akse får to procentpoint til at ligne
 * en halvering, og det er den slags en økonomiskærm ikke skal lave.
 */
export function Soejlegraf({ punkter = [], serier = [], maal, format = (v) => v, hoejde = 168 }) {
  if (!punkter.length) return <Tom>Ingen data i perioden.</Tom>;

  const alle = punkter.flatMap((p) => p.vaerdier);
  if (maal) alle.push(maal.vaerdi);
  const top = Math.max(...alle, 0) * 1.08 || 1;
  const h = (v) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;

  return (
    <div>
      <div className="fc-graf-legend">
        {serier.map((s) => (
          <span key={s.navn} className="fc-graf-navn">
            <i className="fc-graf-prik" style={{ background: GRAF_TONE[s.tone] || GRAF_TONE.brand }} />
            {s.navn}
          </span>
        ))}
        {maal && (
          <span className="fc-graf-navn"><i className="fc-graf-streg" />{maal.navn}</span>
        )}
      </div>

      <div className="fc-graf" style={{ height: hoejde }}>
        {maal && <div className="fc-graf-maal" style={{ bottom: h(maal.vaerdi) }} />}
        {punkter.map((p) => (
          <div key={p.label} className="fc-graf-kol"
               title={`${p.label} — ${p.vaerdier.map((v, i) => `${serier[i]?.navn ?? ""} ${format(v)}`).join(" · ")}`}>
            {p.vaerdier.map((v, i) => (
              <span key={serier[i]?.navn ?? i} className="fc-graf-soejle"
                    style={{ height: h(v), background: GRAF_TONE[serier[i]?.tone] || GRAF_TONE.brand }} />
            ))}
          </div>
        ))}
      </div>

      <div className="fc-graf-x">
        {punkter.map((p) => <span key={p.label}>{p.label}</span>)}
      </div>
    </div>
  );
}
