/* src/moduler/indkoeb/Oversigt.jsx
 * Procure — Overblik. Procure TARGET-restrukturering (produktejer-review
 * 2026-09-02), samme mønster som Fleet/Facility: en vandret ModulNav
 * (fleet/modulfaner.js's PROCURE_FANER) og et rigtigt, kompakt Overblik.
 *
 * ⚠ DETTE ER EN STATUSSKÆRM, IKKE ARBEJDSFLADEN. Produktejerens egen
 * målsætning: *"Jeg kan på 5 sekunder se, hvor alle vores indkøb står."*
 * Ikke et dashboard fyldt med flere parallelle analyseområder. Derfor har
 * denne skærm ÉN ting: kompakte status-tiles + ÉN samlet operationel liste
 * med næste handling på rækken. Alle handlinger er LINKS til Bestillinger —
 * det er dér permissions, selvgodkendelse-markering og de rigtige
 * Cloud Function-kald bor. To steder der begge kunne godkende en ordre,
 * er to steder der kan glemme et permissionstjek.
 *
 * ⚠ ALT DET GAMLE OVERBLIK HAVDE, ER FLYTTET — IKKE SLETTET.
 *   Indkøbslinje-/prisregistrering (formular + tabel) → Varer
 *   Leverandørperformance                             → Statistik
 *   Prisudviklingsgraf                                → Statistik
 *   Leverandørkartotek (mini-tabellen nederst)         → FJERNET. Den var en
 *     duplikering af den allerede eksisterende, fælles Leverandører-side
 *     (Administration → Leverandører, `/indkoeb/leverandoerer`) — samme
 *     kolonner, to steder. Et kontekstuelt link erstatter den.
 * Ingen data eller funktionalitet er tabt; kun UI'ets kanoniske hjem er
 * flyttet. Se Varer.jsx og Statistik.jsx.
 *
 * ⚠ "KRÆVER HANDLING" ER IKKE "FORSINKET LEVERING". Der findes ingen
 * forventet leverings-dato på en ordre i dag — kun `oprettetMs`/`sendtMs`.
 * En "forsinket"-tile ville derfor enten gætte en dato ingen har sat, eller
 * hedde noget den ikke måler. Tilen her tæller i stedet det der REELT kan
 * ses at sidde fast: en godkendelse der har ventet længe, et gammelt åbent
 * behov, eller en faktura uden match — se `kraeverHandling()` nedenfor.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";
import { usePost } from "../../fleet/usePost.js";
import { dato, num } from "../../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Knap,
  Ikon, ModulNav, Kpiadgang,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
import {
  BEHOVSTATUS, ORDRESTATUS, ventendeOrdrer, matchtilstand,
  STANDARD_GODKENDELSESREGLER,
} from "../../fleet/procure.js";
import { PROCURE_FANER } from "../../fleet/modulfaner.js";
import { DEMO_INDKOEBSBEHOV, DEMO_INDKOEBSORDRER, DEMO_GODKENDELSESREGLER } from "../../fleet/demo-procure.js";
import { DEMO_FAKTURAER, DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

const DAG = 86400000;
/* ⚠ EN RIMELIGHEDSGRÆNSE, IKKE EN FORRETNINGSREGEL. 14 dage er ikke besvaret
   af nogen — den afgør kun hvornår noget flyttes ind i "Kræver handling" på
   DENNE skærm. Ingen faktura, sats eller frist er bundet til tallet. */
const GAMMEL_DAGE = 14;

const FILTRE = [
  { key: "behov", label: "Nye/åbne behov", tone: "info" },
  { key: "afventer", label: "Afventer godkendelse", tone: "warn" },
  { key: "godkendt", label: "Klar til afsendelse", tone: "info" },
  { key: "sendt", label: "Sendt, afventer levering", tone: "info" },
  { key: "kraeverHandling", label: "Kræver handling", tone: "bad" },
];

/** Behovet projiceret til en pipeline-række — samme form som ordreTilRaekke(). */
function behovTilRaekke(b, { brugerNavn, nu }) {
  const gammel = b.status !== "iKladde" && (nu - (b.oprettetMs || nu)) > GAMMEL_DAGE * DAG;
  return {
    id: `behov-${b.id}`, art: "behov",
    titel: b.vare, leverandoer: null,
    dato: b.oprettetMs, oprettetAf: brugerNavn(b.oprettetAf),
    statusTekst: BEHOVSTATUS[b.status]?.label || b.status,
    statusTone: BEHOVSTATUS[b.status]?.tone || "info",
    filter: b.status === "iKladde" ? null : "behov",
    kraeverHandling: gammel,
    handling: b.status === "iKladde"
      ? { label: "I kladde", til: "/indkoeb/bestillinger" }
      : { label: "Bestil", til: "/indkoeb/bestillinger" },
  };
}

/** Ordren projiceret til en pipeline-række. */
function ordreTilRaekke(o, { lvNavn, brugerNavn, regler, nu }) {
  const afventer = o.status === "afventerGodkendelse";
  const sendtLaenge = o.status === "sendt" && Number.isFinite(o.sendtMs)
    && (nu - o.sendtMs) > GAMMEL_DAGE * DAG;
  const afventerLaenge = afventer && (nu - (o.oprettetMs || nu)) > GAMMEL_DAGE * DAG;
  const filter = o.status === "afventerGodkendelse" ? "afventer"
    : o.status === "godkendt" ? "godkendt"
    : o.status === "sendt" ? "sendt"
    : null;
  const handling = o.status === "afventerGodkendelse"
    ? { label: "Godkend", til: "/indkoeb/bestillinger" }
    : o.status === "godkendt" ? { label: "Send ordre", til: "/indkoeb/bestillinger" }
    : o.status === "sendt" ? { label: "Registrér modtaget", til: "/indkoeb/bestillinger" }
    : null;
  return {
    id: `ordre-${o.id}`, art: "ordre",
    titel: o.nummer, leverandoer: lvNavn(o.leverandoerId),
    dato: o.oprettetMs, oprettetAf: brugerNavn(o.oprettetAf),
    statusTekst: ORDRESTATUS[o.status]?.label || o.status,
    statusTone: ORDRESTATUS[o.status]?.tone || "info",
    filter,
    kraeverHandling: sendtLaenge || afventerLaenge,
    handling,
  };
}

export default function IndkoebOversigt() {
  const { kpi: k, henter, tilstand, genindlaes, utilgaengelige } = useKpi();

  const behov = useListe("indkoebsbehov", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 500, demo: DEMO_INDKOEBSBEHOV,
  });
  const ordrer = useListe("indkoebsordrer", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 300, demo: DEMO_INDKOEBSORDRER,
  });
  const leverandoerer = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });
  const brugere = useListe("brugere", { vindue: "alle", graense: 200 });
  const regelPost = usePost(null, "godkendelsesregler", { demo: DEMO_GODKENDELSESREGLER });
  /* ⚠ KUN TIL "KRÆVER HANDLING"-TÆLLINGEN. Selve matchet sker på
     Match & kontantkøb — denne skærm tæller blot, som den gamle gjorde. */
  const fakturaer = useListe("fakturaer", {
    ordnPaa: "fakturadatoMs", vindueDage: 400, graense: 500, demo: DEMO_FAKTURAER,
  });
  const [filter, setFilter] = useState(null);

  const henterNoget = henter || behov.henter || ordrer.henter || leverandoerer.henter
    || brugere.henter || fakturaer.henter;
  if (henterNoget) return <Henter hvad="indkøb" />;
  if (blokerer(behov.tilstand)) {
    return <Datatilstand tilstand={behov.tilstand} genprov={behov.genindlaes} />;
  }
  if (blokerer(ordrer.tilstand)) {
    return <Datatilstand tilstand={ordrer.tilstand} genprov={ordrer.genindlaes} />;
  }
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  const lvNavn = (id) => leverandoerNavn(leverandoerer.data, id);
  const brugerNavn = (uid) => {
    const b = brugere.data.find((x) => x.id === uid);
    return b?.navn || b?.email || uid || "—";
  };
  const regler = regelPost.post || STANDARD_GODKENDELSESREGLER;
  const nu = Date.now();

  const aabneBehov = behov.data.filter((b) => b.status !== "bestilt" && b.status !== "afvist");
  const koe = ventendeOrdrer(ordrer.data, regler);
  const findesOrdre = new Set(ordrer.data.map((o) => o.id));
  const udenMatch = fakturaer.data.filter(
    (f) => matchtilstand(f) === "manglerMatch"
      || (f.destinationArt === "procure" && f.destinationId && !findesOrdre.has(f.destinationId)));

  const raekker = [
    ...aabneBehov.map((b) => behovTilRaekke(b, { brugerNavn, nu })),
    ...ordrer.data
      .filter((o) => !["modtaget", "afvist", "annulleret"].includes(o.status))
      .map((o) => ordreTilRaekke(o, { lvNavn, brugerNavn, regler, nu })),
  ];

  /* ⚠ TILEN VISER PRÆCIS DET DEN FILTRERER TIL — IKKE ET TAL DER OGSÅ
     TÆLLER FAKTURAER. En faktura uden match er ikke en RÆKKE i pipelinen
     (den er hverken et behov eller en ordre), så et tal der lagde de to
     sammen, ville vise "13" på en tile hvis klik gav 0 rækker — nul poster
     der matcher en fyldt tile er den slags stille uenighed CLAUDE.md kalder
     ud, kun mellem en tile og sin egen liste i stedet for mellem to skærme.
     Fakturaerne tælles i stedet i hintet nedenfor, med sit eget link. */
  const tal = {
    behov: raekker.filter((r) => r.filter === "behov").length,
    afventer: koe.length,
    godkendt: raekker.filter((r) => r.filter === "godkendt").length,
    sendt: raekker.filter((r) => r.filter === "sendt").length,
    kraeverHandling: raekker.filter((r) => r.kraeverHandling).length,
  };

  const viste = (filter === "kraeverHandling"
    ? raekker.filter((r) => r.kraeverHandling)
    : filter
      ? raekker.filter((r) => r.filter === filter)
      : raekker
  ).sort((a, b) => (b.dato || 0) - (a.dato || 0));

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={PROCURE_FANER} />
      <Kpiadgang utilgaengelige={utilgaengelige} />
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort>
        <div className="fc-filtre" role="group" aria-label="Filtrér på status">
          <Knap variant={filter === null ? "primaer" : "sekundaer"} onClick={() => setFilter(null)}>
            Alle ({num(raekker.length)})
          </Knap>
          {FILTRE.map((f) => (
            <Knap key={f.key} variant={filter === f.key ? "primaer" : "sekundaer"}
                  onClick={() => setFilter(filter === f.key ? null : f.key)}>
              {f.label} ({num(tal[f.key])})
            </Knap>
          ))}
        </div>
        <p className="fc-hint" style={{ marginTop: 12 }}>
          <b>Kræver handling</b> tæller poster i pipelinen nedenfor: en
          godkendelse der har ventet mere end {GAMMEL_DAGE} dage, et åbent
          behov ældre end {GAMMEL_DAGE} dage, eller en ordre sendt for mere
          end {GAMMEL_DAGE} dage siden uden at være registreret modtaget. Der
          findes ingen forventet leveringsdato på en ordre endnu — tallet
          gætter derfor ikke på en forsinkelse, det tæller det der reelt
          sidder fast.
        </p>
        {udenMatch.length > 0 && (
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Herudover står <b>{num(udenMatch.length)} faktura
            {udenMatch.length === 1 ? "" : "er"}</b> uden match — det er ikke
            en pipeline-post og tælles derfor ikke med i tilen ovenfor. Se{" "}
            <Link className="fc-a" to="/indkoeb/fakturaer">Match &amp; kontantkøb</Link>.
          </p>
        )}
      </Kort>

      <Kort titel={`Pipeline (${num(viste.length)})`}
            handling={<Link className="fc-a" to="/indkoeb/bestillinger">Åbn Bestillinger</Link>}>
        <Tabel
          raekker={viste}
          kolonner={[
            { key: "status", label: "Status",
              render: (r) => <Pille tone={r.statusTone}>{r.statusTekst}</Pille> },
            { key: "dato", label: "Dato", render: (r) => dato(r.dato) },
            { key: "titel", label: "Behov / ordre", render: (r) => (
                <>
                  <b>{r.titel}</b>
                  {r.kraeverHandling && (
                    <div className="fc-hint fc-bad">Kræver handling</div>
                  )}
                </>
              ) },
            { key: "leverandoer", label: "Leverandør",
              render: (r) => r.leverandoer || <span className="fc-hint">—</span> },
            { key: "af", label: "Oprettet af", render: (r) => r.oprettetAf },
            { key: "h", label: "", render: (r) => (r.handling ? (
                <Link className="fc-a" to={r.handling.til}>{r.handling.label} →</Link>
              ) : null) },
          ]}
          tom={filter
            ? "Ingen poster i den valgte status."
            : "Ingen åbne behov eller bestillinger. Alt er enten afsluttet eller endnu ikke meldt ind."}
        />
        <p className="fc-hint" style={{ marginTop: 10 }}>
          Afsluttede behov og bestillinger (modtaget, afvist, annulleret) står i{" "}
          <Link className="fc-a" to="/indkoeb/arkiv">Arkiv</Link>, ikke her.
        </p>
      </Kort>

      {k && (
        <KpiRaekke>
          <KpiKort label="Lav lagerbeholdning" vaerdi={num(k?.indkoeb?.lavBeholdning)}
                   note="egne forbrugsvarer på eller under minimum"
                   ikon={<Ikon navn="advarsel" />} tone="ikon-1" rund til="/indkoeb/varelager" />
        </KpiRaekke>
      )}

      <Kort titel="Sådan virker det">
        <p className="fc-hint" style={{ marginTop: 0 }}>
          Et <b>behov</b> bliver til en <b>bestilling</b> med et automatisk
          leverandørforslag. Kræver den godkendelse, venter den; ellers går
          den direkte videre. En godkendt ordre <b>sendes</b>, og når varen
          kommer, registreres den <b>modtaget</b>. Hele arbejdet foregår i{" "}
          <Link className="fc-a" to="/indkoeb/bestillinger">Bestillinger</Link>.
        </p>
        <div className="fc-genveje">
          <Link className="fc-a" to="/indkoeb/leverandoerer">Leverandørkartotek</Link>
          <Link className="fc-a" to="/indkoeb/varer">Varer</Link>
          <Link className="fc-a" to="/indkoeb/fakturaer">Match &amp; kontantkøb</Link>
          <Link className="fc-a" to="/oekonomi/fakturacenter?destination=procure">Fakturaer &amp; bilag</Link>
        </div>
      </Kort>
    </div>
  );
}
