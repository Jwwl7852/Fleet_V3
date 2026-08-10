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
export function KpiKort({ label, vaerdi, afvigelse, note, ikon, tone, ekstra }) {
  return (
    <div className="fc-card fc-kpi">
      {ikon && <div className={`fc-kpi-ico fc-tone-${tone || "info"}`}>{ikon}</div>}
      <div className="fc-kpi-txt">
        <div className="fc-kpi-l">{label}</div>
        <div className="fc-kpi-v">{vaerdi}</div>
        {/* ekstra ligger MELLEM tallet og noten — en fordelingsbjælke hører
            visuelt til tallet den deler op, ikke til teksten under den. */}
        {ekstra}
        {afvigelse ? (
          <div className={`fc-kpi-d fc-${afvigelse.tone}`}>
            {afvigelse.pil ? `${afvigelse.pil} ` : ""}{afvigelse.text}{note ? ` ${note}` : ""}
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

/**
 * Hvorfor skærmen ikke viser rigtige tal. ÉN komponent, fordi teksten ellers
 * står 32 steder — og allerede var drevet: Dashboard sagde "der er ikke
 * forbindelse" mens de øvrige fjorten sagde "ingen forbindelse".
 *
 * ⚠ DEN VIGTIGE: `naegtet`. Reglerne afviste læsningen — det er systemet der
 * VIRKER — og det må ikke læses som et netværksproblem. Der følger aldrig tal
 * med; se datatilstand.js.
 *
 * To brug:
 *   <Datatilstand tilstand={tilstand} genprov={g} />      banner over indhold
 *   <Datatilstand tilstand={tilstand} genprov={g} tom="…" />  når data mangler
 *
 * Uden `tom` returnerer den null når der intet er at sige. Med `tom` siger den
 * altid noget — den afløser det tidlige `return` i skærmene, og dét er stedet
 * hvor årsagen ellers forsvandt bag "Nøgletallene kunne ikke hentes".
 */
export const Datatilstand = ({ tilstand, genprov, tom }) => {
  const art = tilstand?.art ?? "ok";

  /* Demo-mode siger miljøbjælken allerede. Skærmen skal ikke sige det igen. */
  if (art === "ok" || art === "demo") {
    return tom ? <Fejl genprov={genprov}>{tom}</Fejl> : null;
  }

  /* Rutevagten i App.jsx slipper ingen ind uden session, så ser man den her
     inde på en skærm, døde sessionen mens man kiggede — typisk fordi
     claims blev fornyet, eller tokenet blev tilbagekaldt. Beskeden siger det
     frem for "ikke logget ind", som ville lyde som om man aldrig var det. */
  if (art === "uautentificeret") {
    return (
      <div className="fc-empty fc-empty-warn">
        <p>Din session er udløbet. Log ind igen for at se de her data.</p>
      </div>
    );
  }

  if (art === "naegtet") {
    return (
      <Fejl genprov={genprov}>
        Sikkerhedsreglerne afviste læsningen. Din bruger har ikke adgang til de
        her data — det er ikke en netværksfejl. De vises derfor ikke.
      </Fejl>
    );
  }

  return <Fejl genprov={genprov}>Der er ikke forbindelse til databasen.</Fejl>;
};

export const Knap = ({ variant = "sekundaer", children, ...p }) => (
  <button type="button" className={`fc-btn fc-btn-${variant}`} {...p}>{children}</button>
);

export const Raekke = ({ children, ...p }) => <div className="fc-row" {...p}>{children}</div>;
export const Gitter = ({ kolonner = "1fr", children, ...p }) => (
  <div className="fc-grid" style={{ gridTemplateColumns: kolonner }} {...p}>{children}</div>
);

/**
 * Nøgletal-linje til de smalle sidepaneler (Bemanding i dag, Facility, Indkøb).
 *
 *   andel  0..1 → en udnyttelsesbjælke under linjen. Kun hvor der FINDES et
 *          forhold: "6 af 8 disponeret" kan tegnes, "10 personer ledig" kan
 *          ikke. En bjælke uden nævner ville være pynt der ligner en måling.
 *   prik   statustone → farvet prik efter værdien. Det er STATUSpaletten og
 *          ikke serie- eller ikonfarverne: rød betyder her netop "skidt", og
 *          det er den betydning der skal bevares (beslutning 30).
 */
export const MiniLinje = ({ label, vaerdi, andel, prik }) => (
  <div className={andel != null ? "fc-mini fc-mini-bar" : "fc-mini"}>
    <span>{label}</span>
    <b>{vaerdi}</b>
    {/* ⚠ PRIKKENS PLADS RESERVERES ALTID, ogsaa naar der ikke er en prik.
        Ellers flytter tallets hoejrekant sig fra linje til linje, alt efter om
        raekken har en prik — og saa staar tallene hulter til bulter i stedet
        for i en kolonne man kan loebe ned ad. */}
    <i className={prik ? `fc-prik fc-prik-${prik}` : "fc-prik fc-prik-tom"} aria-hidden="true" />
    {andel != null && (
      <div className="fc-mini-spor">
        <div className="fc-mini-fyld"
             style={{ width: `${Math.max(0, Math.min(100, andel * 100))}%` }} />
      </div>
    )}
  </div>
);

/**
 * Fordelingsbjælke — to dele af en helhed, fx planlagt mod akut vedligehold.
 *
 * ⚠ TO SEGMENTER, IKKE FLERE. Skal en helhed deles i fem, er det en Donut.
 * Farverne er STATUS og ikke kategori: den første del er den man vil have
 * mest af, den anden den man vil have mindst af. Derfor grøn og rød, og
 * derfor bærer bjælken ikke identitet — tallene over den gør.
 */
export const Fordelingsbjaelke = ({ pct }) => (
  <div className="fc-fordel" role="presentation">
    <span className="fc-fordel-ok" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    <span className="fc-fordel-bad" />
  </div>
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
 * Kategorifarver — IKKE statusfarver. Se beslutning 30.
 *
 * GRAF_TONE ovenfor siger HVOR SLEMT det er: grøn er i orden, rød er kritisk.
 * De her siger HVILKEN TING det er: blå er ikke bedre end orange. Genbruger man
 * statusfarverne som serie 4 og 5, kommer rød til at betyde både "kritisk" og
 * "den femte kategori", og så holder brugeren op med at læse rød som advarsel.
 *
 * Rækkefølgen er FAST og cykler aldrig. Farven følger kategorien, ikke dens
 * plads i en sorteret liste — ellers skifter et filter farve på de kategorier
 * der bliver tilbage.
 */
const SERIE_FARVER = [
  "var(--fc-serie-1)", "var(--fc-serie-2)", "var(--fc-serie-3)",
  "var(--fc-serie-4)", "var(--fc-serie-5)",
];

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
/**
 * Donut — fordelingen af en helhed på få kategorier, med totalen i midten.
 *
 * dele: [{ navn, antal }] — højst fem. Er der flere kategorier end farver,
 * hører resten i "Øvrige"; en genereret sjette farve ville bryde den faste
 * rækkefølge og gøre paletten uvalideret.
 *
 * ⚠ LEGENDEN ER IKKE PYNT. Tre af seriefarverne ligger under 3:1 i kontrast
 * mod den hvide flade, og validatoren forpligter derfor til synlige labels.
 * Antal og procent står som TEKST i tekstfarve — aldrig i seriefarven; den
 * farvede prik ved siden af bærer identiteten. En vinkel aflæses dårligt, et
 * tal aflæses præcist.
 *
 * Segmenterne har 2px mellemrum i fladens farve, så to nabofarver ikke løber
 * sammen for den der ikke kan skelne dem.
 */
export function Donut({ dele = [], total, midteTekst, format = (v) => v }) {
  const brugbare = dele.filter((d) => (d?.antal || 0) > 0);
  if (!brugbare.length) return <Tom>Ingen data i perioden.</Tom>;

  const sum = total ?? brugbare.reduce((s, d) => s + d.antal, 0);
  if (!sum) return <Tom>Ingen data i perioden.</Tom>;

  /* r valgt så omkredsen bliver ~100 — så er dasharray direkte i procent. */
  const r = 15.915;
  let forskydning = 25; /* start øverst frem for til højre */

  return (
    <div className="fc-donut">
      <svg viewBox="0 0 42 42" className="fc-donut-fig" role="img"
           aria-label={`${format(sum)} fordelt på ${brugbare.length} kategorier`}>
        <circle cx="21" cy="21" r={r} className="fc-donut-bund" />
        {brugbare.map((d, i) => {
          const pct = (d.antal / sum) * 100;
          const el = (
            <circle key={d.navn} cx="21" cy="21" r={r}
                    className="fc-donut-seg"
                    stroke={SERIE_FARVER[i % SERIE_FARVER.length]}
                    /* 2px-mellemrummet: trækkes fra buens længde, ikke lagt til. */
                    strokeDasharray={`${Math.max(0, pct - 2)} ${100 - Math.max(0, pct - 2)}`}
                    strokeDashoffset={forskydning} />
          );
          forskydning = (forskydning - pct + 100) % 100;
          return el;
        })}
        <text x="21" y="20.4" className="fc-donut-tal">{format(sum)}</text>
        {midteTekst && <text x="21" y="24.6" className="fc-donut-note">{midteTekst}</text>}
      </svg>

      <ul className="fc-donut-legende">
        {brugbare.map((d, i) => (
          <li key={d.navn}>
            <i className="fc-graf-prik" style={{ background: SERIE_FARVER[i % SERIE_FARVER.length] }} />
            <span className="fc-donut-navn">{d.navn}</span>
            <b>{format(d.antal)}</b>
            <span className="fc-donut-pct">{Math.round((d.antal / sum) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
