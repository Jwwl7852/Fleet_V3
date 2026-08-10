/* src/fleet/ui.jsx
 * Delte primitiver. Modulerne definerer ikke egne kort, tabeller,
 * statuschips eller tomme tilstande — så kan de heller ikke se
 * forskellige ud fra skærm til skærm.
 */
import { Link } from "react-router-dom";
import { deviation } from "./format.js";

/* ⚠ MASSIVE IKONER, IKKE STREGTEGNEDE. Mockuppens glyffer er fyldte —
   sidebarens ICO i AppShell er konturer, og de to skal ikke forveksles: her
   sidder ikonet på en farvet flade og skal have vægt, dér står det på mørk
   bund ved siden af tekst og skal være let.
   Detaljerne — linjer i dokumentet, hjulnav, urets visere — er HULLER
   (fill-rule evenodd), så de viser feltets tone igennem frem for at være
   malet i en farve der skulle kende sit felt. */
export const IKON = {
  maerkat: "M12.6 2H21a1 1 0 0 1 1 1v8.4a2 2 0 0 1-.6 1.4l-8.6 8.6a2 2 0 0 1-2.8 0l-8-8a2 2 0 0 1 0-2.8l8.6-8.6A2 2 0 0 1 12.6 2zm5.1 3.1a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z",
  udraab: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.1 4.6v7.4h2.2V6.6zm0 9.1v2.3h2.2v-2.3z",
  termometer: "M12 1.8a2.8 2.8 0 0 1 2.8 2.8v8.7a5 5 0 1 1-5.6 0V4.6A2.8 2.8 0 0 1 12 1.8z",
  port: "M2 9.4 12 3l10 6.4V22h-3.2V10.4H5.2V22H2zM7 12.2h10v2.1H7zm0 3.7h10V18H7zm0 3.7h10V22H7z",
  ventilator: "M12 10.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM11 8.6C10.4 5.9 10.9 4 12.4 3c1.7-1.1 3.6-.2 4.2 1.1.5 1.2-.2 2.3-1.6 2.9-1 .4-2.4.9-4 1.6zm2.6 3.9c2.4 1.4 3.4 3.1 2.9 4.8-.5 1.9-2.5 2.6-3.7 1.9-1.1-.6-1.2-1.9-.7-3.3.4-1 .9-2.3 1.5-3.4zm-3.2 0c-1 2.6-2.4 3.9-4.2 3.8-1.9-.1-3-1.9-2.5-3.2.4-1.2 1.7-1.5 3.2-1.2 1 .2 2.3.4 3.5.6z",
  klokke: "M12 2a1.7 1.7 0 0 1 1.7 1.7v.5a6 6 0 0 1 4.5 5.8v4.2l1.8 2.6v1.4H4v-1.4l1.8-2.6V10a6 6 0 0 1 4.5-5.8v-.5A1.7 1.7 0 0 1 12 2zm0 20a2.6 2.6 0 0 1-2.5-2h5A2.6 2.6 0 0 1 12 22z",
  varevogn: "M2 6h11.5v9.2H2zm12.5 0h3.2L21.8 11v4.2h-7.3zM6.6 20.2a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm0-1.7a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6zm11.2 1.7a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm0-1.7a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6z",
  trailer: "M2 8h1.6L5 6.2h14.4a1.8 1.8 0 0 1 1.8 1.8v7.6H2zM7 20.8a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2zm0-1.7a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8zm9.8 1.7a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2zm0-1.7a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8z",
  scooter: "M5.4 20.6a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8zm0-2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zm13.2 2a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8zm0-2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM13 3.4h4.4l1.8 10.2h-2.1l-1.4-8.2H13zM4.6 12.4 8.4 7h4.8l1 5.4h-3.5l-.4-2.2H9.6l-1.7 2.2z",
  stednaal: "M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4.4A2.6 2.6 0 1 0 12 11.6 2.6 2.6 0 0 0 12 6.4z",
  bus: "M4 2h16a2 2 0 0 1 2 2v12.5h-2.2v1.9a1.8 1.8 0 0 1-3.6 0v-1.9H7.8v1.9a1.8 1.8 0 0 1-3.6 0v-1.9H2V4a2 2 0 0 1 2-2zm.4 3.2v5.6h15.2V5.2zM6.2 15.4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11.6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  skjold: "M12 1.8 21 5.4v6.2c0 5-3.8 9.2-9 10.6-5.2-1.4-9-5.6-9-10.6V5.4zm-1.3 13.4 6.2-6.2-1.6-1.6-4.6 4.6-2.3-2.3-1.6 1.6z",
  kalender: "M7 1.6h2.2v2.2H7zm7.8 0H17v2.2h-2.2zM3.4 3.8h2.4v2.2a1.2 1.2 0 0 0 2.4 0V3.8h7.6v2.2a1.2 1.2 0 0 0 2.4 0V3.8h2.4a1.4 1.4 0 0 1 1.4 1.4v3.2H2V5.2a1.4 1.4 0 0 1 1.4-1.4zM2 10.6h20v9a1.4 1.4 0 0 1-1.4 1.4H3.4A1.4 1.4 0 0 1 2 19.6zm3.4 2.6v2.2h2.4v-2.2zm5 0v2.2h2.4v-2.2zm5 0v2.2h2.4v-2.2z",
  afspil: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zM9.8 7.2v9.6l7.2-4.8z",
  advarsel: "M12 1.8 23 21H1zm-1.1 6.4v6.2h2.2V8.2zm0 8v2.2h2.2v-2.2z",
  kasse: "M12 1.8 21.6 6v12L12 22.2 2.4 18V6zm0 2.4L5.2 7l6.8 3 6.8-3zM4.2 8.6v8.2l6.9 3V11.6zm15.6 0-6.9 3v8.2l6.9-3z",
  dokument: "M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.8V8h4.2L14 3.8zM8 12.4h8v1.7H8zm0 3.6h5.4v1.7H8z",
  lastbil: "M2 6h12v9.2H2zm13 3h3.6l2.6 3.1v3.1H15zM6.8 20.4a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2zm0-1.7a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8zm11.4 1.7a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2zm0-1.7a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8z",
  ur: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm1 4.4h-2v6.7l4.7 2.8 1-1.7-3.7-2.2z",
  seddel: "M2 5h20v14H2zm10 10.4a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8zM5 7.6h2.2v1.7H5zm11.8 7.1H19v1.7h-2.2z",
  skruenoegle: "M15.4 2a6 6 0 0 0-5.6 8.1l-7 7a2.6 2.6 0 0 0 3.7 3.7l7-7A6 6 0 0 0 21.4 8l-3.2 3.2-2.5-.7-.7-2.5L18.2 4.8A6 6 0 0 0 15.4 2z",
  personer: "M9.2 11.4a4.1 4.1 0 1 1 0-8.2 4.1 4.1 0 0 1 0 8.2zm0 1.5c3.1 0 6.2 1.6 6.2 4.1V20H3v-3c0-2.5 3.1-4.1 6.2-4.1zm8.3-1.2a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6zm-.6 2c2.4 0 4.1 1.3 4.1 3.3V20h-4v-3c0-1.2-.5-2.2-1.3-3 .4-.2.8-.3 1.2-.3z",
  bygning: "M4 21.5V4.2L12.4 2v19.5H4zm3-13h2.4v2.2H7zm0 4.2h2.4v2.2H7zm0 4.2h2.4v2.2H7zM13.8 21.5V7.4l6.6 2.1v12H13.8zm2-9.4h2.4v2.2h-2.4zm0 4.2h2.4v2.2h-2.4z",
  vogn: "M1.6 2.6h3.6l.7 2.6h16.5l-2.6 9.2H7.7l.2.9h12v2.1H6.2L3.5 4.7H1.6zM9.4 21.4a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm8.4 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z",
};

/* farve er valgfri og peger paa et token — korttitlernes ikoner er farvede i
   mockuppen, ikke daempede. Uden farve arver ikonet .fc-card-h svg. */
export const Ikon = ({ navn, farve }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" style={farve ? { color: farve } : undefined}>
    <path d={IKON[navn]} fillRule="evenodd" />
  </svg>
);


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
 *
 * ⚠ PILEN ER APP-BRED OG BEVIDST. Den kom med Dashboard-arbejdet, men gælder
 * hvert KpiKort i appen. Gør den ikke det, betyder en manglende pil "ingen
 * ændring" ét sted og "den skærm er ikke opdateret endnu" et andet — og så
 * kan man ikke læse fraværet af en pil. Fjern den ikke fra en enkelt skærm.
 */
/**
 * `rund` gør ikonfeltet cirkulært, `til` gør hele kortet til et link med en
 * chevron. Begge kom fra Booking-mockuppen, hvor kortene ser sådan ud — og
 * begge er OPT-IN, så Dashboards kort ikke ændrer sig af at et andet skærmbillede
 * gjorde noget andet.
 */
export function KpiKort({ label, vaerdi, afvigelse, note, ikon, tone, ekstra, rund, til }) {
  const indhold = (
    <>
      {ikon && (
        <div className={`fc-kpi-ico ${rund ? "fc-kpi-rund " : ""}fc-tone-${tone || "info"}`}>
          {ikon}
        </div>
      )}
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
      {til && <span className="fc-kpi-pil" aria-hidden="true">\u203a</span>}
    </>
  );

  return til
    ? <Link className="fc-card fc-kpi fc-kpi-link" to={til}>{indhold}</Link>
    : <div className="fc-card fc-kpi">{indhold}</div>;
}

export const KpiRaekke = ({ children }) => <div className="fc-kpis">{children}</div>;

const PILLE_TONE = { ok: "fc-pill-ok", warn: "fc-pill-warn", bad: "fc-pill-bad", info: "fc-pill-info" };
export const Pille = ({ tone = "info", children }) => (
  <span className={`fc-pill ${PILLE_TONE[tone] || PILLE_TONE.info}`}>{children}</span>
);

/**
 * Tabel — kolonner: [{ key, label, num, midt, bredde, render }]
 *
 * `num` højrestiller (tal skal stå lige over hinanden). `midt` centrerer, og
 * er til gittter-agtige kolonner hvor cellen ER en flade — en ugeplan, en
 * kalenderdag. De to udelukker hinanden; sættes begge, vinder `num`.
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
              <th key={k.key} className={k.num ? "fc-num" : k.midt ? "fc-midt" : ""} style={k.bredde ? { width: k.bredde } : undefined}>
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
                <td key={k.key} className={k.num ? "fc-num" : k.midt ? "fc-midt" : ""}>
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

/**
 * Handlingsliste — "Kræver handling": ikon, hvad der er galt, hvad man gør
 * ved det, antallet, og en vej derhen.
 *
 * poster: [{ id, ikon, tone, tekst, under, antal, til }]
 *
 * ⚠ `under` ER IKKE PYNT. Den siger hvad man skal GØRE — "Registrér faktisk
 * tid for korrekt fakturering" — og uden den er posten kun en optælling.
 * En liste over ting man ikke kan handle på, holder man op med at læse.
 *
 * Hele rækken er linket, ikke kun tallet: et klikmål på 24 px i en liste er
 * en fejlkilde for enhver der ikke rammer præcist med en mus.
 */
export const Handlingsliste = ({ poster = [] }) => {
  if (!poster.length) return <Tom>Intet kræver handling lige nu.</Tom>;
  return (
    <ul className="fc-handling">
      {poster.map((p) => (
        <li key={p.id}>
          <Link to={p.til}>
            <span className={`fc-handling-ico fc-tone-${p.tone}`}><Ikon navn={p.ikon} /></span>
            <span className="fc-handling-txt">
              <b>{p.tekst}</b>
              <span>{p.under}</span>
            </span>
            <b className="fc-handling-tal">{p.antal}</b>
            <span className="fc-handling-pil" aria-hidden="true">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
};
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
 *
 * ⚠ PRIKKENS KOLONNE RESERVERES I ALLE 22 SKÆRME, ikke kun dem der bruger
 * prikker. Det er bevidst: værdierne står i samme kolonne overalt, og en
 * skærm der senere tilføjer én prik rykker ikke sine øvrige tal. Fjerner man
 * den tomme plads for at spare 19 px, står tallene hulter til bulter igen —
 * det var netop fejlen der blev rettet.
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

/**
 * Sider — klientsidig paginering af en liste der ALLEREDE er hentet.
 *
 * ⚠ DEN HENTER IKKE MERE. useListe har et loft (graense), og når det er
 * ramt, siger skærmen "afkortet" og beder om en snævrere søgning. En pager
 * der lod som om den kunne blade videre i basen, ville vise side 8 af en
 * liste hvor side 3 var det sidste vi havde — og RTDB har ingen offset at
 * blade med. Den her deler kun det hentede op, så tabellen ikke bliver
 * halvanden skærm lang.
 *
 * `antal` er postantallet, ikke sideantallet. Siderne regnes her, så to
 * forbrugere ikke kan runde forskelligt.
 */
export function Sider({ side, antal, prSide, saet }) {
  const sider = Math.max(1, Math.ceil(antal / prSide));
  if (sider <= 1) return null;

  /* Højst syv knapper: første, sidste, og et vindue om den aktuelle. Ellers
     vokser rækken med listen, og det var netop det pagineringen skulle løse. */
  const numre = new Set([1, sider, side, side - 1, side + 1]);
  const viste = [...numre].filter((n) => n >= 1 && n <= sider).sort((a, b) => a - b);

  return (
    <nav className="fc-pager" aria-label="Sider">
      <button type="button" className="fc-pag-pil" disabled={side <= 1}
              onClick={() => saet(side - 1)} aria-label="Forrige side">‹</button>
      {viste.map((n, i) => (
        <span key={n} style={{ display: "contents" }}>
          {i > 0 && viste[i - 1] !== n - 1 && <span className="fc-pag-hul">…</span>}
          <button type="button"
                  className={`fc-pag${n === side ? " fc-pag-nu" : ""}`}
                  aria-current={n === side ? "page" : undefined}
                  onClick={() => saet(n)}>{n}</button>
        </span>
      ))}
      <button type="button" className="fc-pag-pil" disabled={side >= sider}
              onClick={() => saet(side + 1)} aria-label="Næste side">›</button>
    </nav>
  );
}

/**
 * Linjegraf — udvikling over tid. To serier: den aktuelle periode fuldt
 * optrukket, sammenligningsperioden stiplet.
 *
 *   punkter  [{ label, vaerdier: [tal, …] }]   én værdi pr. serie, null = intet
 *   serier   [{ navn, stiplet }]
 *
 * ⚠ NULL ER IKKE NUL. En måned uden indkøb har ingen pris — kurven brydes
 * frem for at dykke til bunden. En kurve der falder til nul i juli, fortæller
 * det modsatte af sandheden om en måned hvor man bare ikke købte noget.
 *
 * ⚠ Y-AKSEN STARTER IKKE NØDVENDIGVIS I NUL, men den siger det: minimum og
 * maksimum står skrevet. En afkortet akse uden mærkning gør 2 % udsving til
 * et bjerg, og det er den mest almindelige måde at lyve med en graf på.
 */
export function Linjegraf({ punkter = [], serier = [], format = (v) => v, hoejde = 168 }) {
  if (!punkter.length) return <Tom>Ingen data i perioden.</Tom>;

  const alle = punkter.flatMap((p) => p.vaerdier).filter((v) => Number.isFinite(v));
  if (!alle.length) return <Tom>Ingen data i perioden.</Tom>;

  const raaMin = Math.min(...alle);
  const raaMaks = Math.max(...alle);
  /* Lidt luft, så yderpunkterne ikke klistrer til kanten. Er alle værdier
     ens, giver spandet 0 og y bliver NaN — derfor gulvet på 1. */
  const spand = Math.max(1, raaMaks - raaMin);
  const min = raaMin - spand * 0.15;
  const maks = raaMaks + spand * 0.15;

  const B = 100;
  const H = 40;
  const x = (i) => (punkter.length === 1 ? B / 2 : (i / (punkter.length - 1)) * B);
  const y = (v) => H - ((v - min) / (maks - min)) * H;

  /* Segmenter frem for én lang path: et hul i data skal BRYDE linjen. */
  const segmenter = (si) => {
    const ud = [];
    let nu = [];
    punkter.forEach((p, i) => {
      const v = p.vaerdier[si];
      if (Number.isFinite(v)) nu.push(`${x(i)},${y(v)}`);
      else if (nu.length) { ud.push(nu); nu = []; }
    });
    if (nu.length) ud.push(nu);
    return ud;
  };

  return (
    <div>
      {serier.length > 1 && (
        <div className="fc-graf-legend">
          {serier.map((s, i) => (
            <span key={s.navn} className="fc-graf-navn">
              {s.stiplet
                ? <i className="fc-graf-streg" />
                : <i className="fc-graf-prik" style={{ background: SERIE_FARVER[i % SERIE_FARVER.length] }} />}
              {s.navn}
            </span>
          ))}
        </div>
      )}

      <div className="fc-linje" style={{ height: hoejde }}>
        <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className="fc-linje-fig"
             role="img" aria-label={`Udvikling over ${punkter.length} perioder`}>
          {serier.map((s, si) =>
            segmenter(si).map((seg, j) => (
              <polyline key={`${s.navn}-${j}`} points={seg.join(" ")}
                        className={`fc-linje-serie${s.stiplet ? " fc-linje-stiplet" : ""}`}
                        stroke={s.stiplet ? "var(--bc-muted)" : SERIE_FARVER[si % SERIE_FARVER.length]} />
            ))
          )}
        </svg>
        {/* Punkterne ligger UDEN FOR svg'en, så de ikke strækkes af
            preserveAspectRatio="none" — en strakt cirkel bliver en ellipse. */}
        {serier.map((s, si) => punkter.map((p, i) => {
          const v = p.vaerdier[si];
          if (!Number.isFinite(v)) return null;
          return (
            <span key={`${s.navn}-${i}`} className="fc-linje-prik"
                  title={`${p.label}: ${format(v)}`}
                  style={{
                    left: `${x(i)}%`, top: `${(y(v) / H) * 100}%`,
                    background: s.stiplet ? "var(--bc-muted)" : SERIE_FARVER[si % SERIE_FARVER.length],
                  }} />
          );
        }))}
      </div>

      <div className="fc-graf-x">
        {punkter.map((p) => <span key={p.label}>{p.label}</span>)}
      </div>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        Y-aksen går fra <b>{format(raaMin)}</b> til <b>{format(raaMaks)}</b> — den
        starter ikke i nul. Det står her, fordi en afkortet akse uden mærkning gør
        et lille udsving til et bjerg.
      </p>
    </div>
  );
}
