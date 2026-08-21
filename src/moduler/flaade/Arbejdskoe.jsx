/* src/moduler/flaade/Arbejdskoe.jsx
 * Fleet → Arbejdskø. Målet for de fem kassers "Åbn".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ KØEN GENTAGER IKKE KASSERNES FILTER — DEN KALDER SAMME FUNKTION.
 *
 * driftstal() i fleet/driftskalender.js afgør hvad der er "nyt", "afventer",
 * "planlagt", "kommende" og "forsinket", og både Driftskalenderen og den her
 * skærm læser sit udsnit ud af DEN. Skrev køen sit eget `filter()`, ville
 * kortet kunne sige 18 og listen vise 14 — og forskellen ville se ud som et
 * datahul frem for som to definitioner.
 *
 * Det er nøjagtig fejlen fra Indkøb → Fakturaer: ni demo-fakturaer på skærmen
 * mens `indkoeb.fakturaerTilGodkendelse` blev regnet af de rigtige. To svar på
 * samme spørgsmål, ét klik fra hinanden.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ UDSNITTET STÅR I URL'EN, ikke i en tilstand skærmen fik overleveret.
 * "Åbn i nyt vindue" åbner et RIGTIGT browservindue på den her rute, og et
 * nyt vindue har ingen React-tilstand at arve. `?vis=` er derfor ikke en
 * bekvemmelighed — det er det eneste der overlever springet.
 *
 * ⚠ INGEN SKRIVNING. Mockuppen har "Planlæg" og "Tildel" på hver række. Begge
 * ville skrive en opgave og en reservation atomisk, og to disponenter kan
 * ramme samme sekund — det hører i en Cloud Function. Knapperne står
 * deaktiverede med begrundelsen på sig.
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { num, datoTid } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Knap, Henter, Datatilstand, Sider,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  FREMAD, STANDARD_FREMAD, driftstal, sorterKoe, slutter,
} from "../../fleet/driftskalender.js";
import { OPGAVE_STATUS, ARBEJDSTYPE } from "../../fleet/opgaver.js";
import {
  PRIORITET, ALLE_PRIORITETER, prioritetFor,
} from "../../fleet/prioritet.js";
import { HAENDELSE_ART, FORLOEB } from "../../fleet/indberetninger.js";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { DEMO_INDBERETNINGER } from "../../fleet/demo-indberetninger.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

/**
 * ⚠ NØGLERNE ER DE SAMME STRENGE SOM I KASSER I Vaerkstedskalender.jsx, og de
 * står i URL'en. Skiftede den ene "nye" til "ny", ville knappen åbne en tom
 * liste ved siden af et tal der sagde 6.
 *
 * `kilde` siger hvilken NODE udsnittet kommer fra. De to har ikke de samme
 * kolonner: en indberetning har et forløb og en art, en opgave har en status
 * og et tidspunkt. Én tabel med begge ville have haft en halv række tomme
 * celler — og et felt arten ikke har, er ikke et tomt felt.
 */
const UDSNIT = {
  nye: {
    label: "Nye indberetninger", kilde: "indberetninger",
    hvad: "Meldt af en chauffør og endnu ikke vurderet af en værkfører. " +
          "Prioriteten sættes i triagen — derfor står nogle som ikke vurderet.",
  },
  afventer: {
    label: "Afventer planlægning", kilde: "opgaver",
    hvad: "Opgaver med status indberettet eller afventer. De HAR et tidspunkt " +
          "— noden kræver det — men det er en pladsholder indtil nogen har " +
          "taget stilling.",
  },
  planlagt: {
    label: "Planlagte aktiviteter", kilde: "opgaver",
    hvad: "Planlagte og igangværende opgaver i alt.",
  },
  kommende: {
    label: "Kommende aktiviteter", kilde: "opgaver", vindue: true,
    hvad: "De planlagte der starter inden for det valgte vindue. Et UDSNIT af " +
          "de planlagte, ikke et tal ved siden af.",
  },
  forsinkede: {
    label: "Forsinkede aktiviteter", kilde: "opgaver",
    hvad: "Planlagte eller igangværende opgaver hvis slutning ligger bag os. " +
          "En opgave uden estimat har ingen slutning og står derfor hverken " +
          "her eller som rettidig — den tælles for sig.",
  },
};

const ALLE_UDSNIT = Object.keys(UDSNIT);
const PR_SIDE = 12;

export default function Arbejdskoe() {
  const [params, saetParams] = useSearchParams();
  const vis = ALLE_UDSNIT.includes(params.get("vis")) ? params.get("vis") : "nye";
  const fremDage = Number(params.get("frem")) || STANDARD_FREMAD;

  const [prioritetsfilter, setPrioritetsfilter] = useState(null);
  const [side, setSide] = useState(1);

  const opgaver = useListe("opgaver", {
    ordnPaa: "startMs", vindue: "fremad", vindueDage: 120, fremDage: 365,
    graense: 500, demo: DEMO_OPGAVER,
  });
  const indberetninger = useListe("indberetninger", {
    ordnPaa: "oprettetMs", vindue: "fremad", vindueDage: 180, fremDage: 30,
    graense: 500, demo: DEMO_INDBERETNINGER,
  });
  const enheder = useListe("koeretoejer", {
    vindue: "alle", division: "alle", demo: DEMO_KOERETOEJER,
  });
  /* ⚠ NODEN, IKKE DEMOFILEN. `enhedNavn` lige nedenfor blev allerede bygget
     af den hentede liste; `lvNavn` gjorde ikke — og de to stod side om side.
     Hos en rigtig kunde ville værkstedets navn stå tomt på hver række, mens
     bilens stod rigtigt. */
  const leverandoerer = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", division: "alle", graense: 500,
    demo: DEMO_LEVERANDOERER,
  });

  /* ⚠ KUN art "vaerksted". Fleets driftskalender er FLÅDENS arbejde.
     `opgaver` rummer også facility-opgaver — en port der skal repareres, et
     ventilationsfilter — og de har deres egen skærm i Facility →
     Servicekalender, der læser den SAMME node. Talte begge moduler dem med,
     ville det samme arbejde stå i to tal, og en vognmand der lagde dem sammen,
     ville tælle sit filterskift to gange. Det er beslutning 11 og 14's fejl på
     tværs af moduler.

     Filteret ligger i SKÆRMEN og ikke i driftstal(): funktionen er den samme
     for begge moduler, og Facility skal kunne kalde den med sin egen art frem
     for at få sin egen kopi. */
  const flaadeopgaver = useMemo(
    () => opgaver.data.filter((o) => o.art === "vaerksted"), [opgaver.data]);

  const nu = Date.now();
  const tal = useMemo(
    () => driftstal({
      opgaver: flaadeopgaver, indberetninger: indberetninger.data, nu, fremDage,
    }),
    [flaadeopgaver, indberetninger.data, nu, fremDage]);

  const enhedNavn = (id) =>
    enheder.data.find((k) => k.id === id)?.kaldenavn || id || "—";
  const lvNavn = (id) => leverandoerNavn(leverandoerer.data, id);

  const udsnit = UDSNIT[vis];
  const raa = tal[vis]?.poster || [];
  const filtreret = prioritetsfilter
    ? raa.filter((p) => p.prioritet === prioritetsfilter)
    : raa;
  const sorteret = sorterKoe(filtreret);
  const sider = Math.max(1, Math.ceil(sorteret.length / PR_SIDE));
  const denneSide = sorteret.slice((side - 1) * PR_SIDE, side * PR_SIDE);

  const skift = (noegle) => {
    saetParams({ vis: noegle, frem: String(fremDage) });
    setSide(1);
    setPrioritetsfilter(null);
  };

  if (opgaver.henter || indberetninger.henter) return <Henter hvad="arbejdskøen" />;
  if (blokerer(opgaver.tilstand)) {
    return <Datatilstand tilstand={opgaver.tilstand} genprov={opgaver.genindlaes} />;
  }
  if (blokerer(indberetninger.tilstand)) {
    return <Datatilstand tilstand={indberetninger.tilstand} genprov={indberetninger.genindlaes} />;
  }

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {/* Fanerne bærer TALLET, så man kan skifte udsnit uden at gå tilbage.
          Samme tal som kasserne på Driftskalenderen — samme funktion. */}
      <div className="fc-seg" role="group" aria-label="Udsnit">
        {ALLE_UDSNIT.map((n) => (
          <button key={n} type="button" aria-pressed={vis === n} onClick={() => skift(n)}>
            {UDSNIT[n].label} ({num(tal[n].antal)})
          </button>
        ))}
      </div>

      <Kort
        titel={udsnit.label}
        handling={<Link className="fc-a" to="/flaade">Tilbage til driftskalenderen</Link>}
      >
        <p className="fc-hint" style={{ marginTop: 0, marginBottom: 12 }}>{udsnit.hvad}</p>

        {/* ⚠ IKKE <Raekke>. Den er .fc-row, som er space-between — en
            filterrække i den ville sprede knapperne ud over hele bredden med
            "Lav" yderst til venstre og "Høj" yderst til højre, som om de ikke
            hørte sammen. */}
        {udsnit.vindue && (
          <div className="fc-filterraekke" style={{ marginBottom: 12 }}>
            <span className="fc-hint">Vis frem:</span>
            <div className="fc-seg" role="group" aria-label="Vis frem">
              {FREMAD.map((f) => (
                <button key={f.dage} type="button" aria-pressed={fremDage === f.dage}
                        onClick={() => { saetParams({ vis, frem: String(f.dage) }); setSide(1); }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="fc-filterraekke" style={{ marginBottom: 12 }}>
          <span className="fc-hint">Prioritet:</span>
          {ALLE_PRIORITETER.map((p) => (
            <Knap key={p}
                  variant={prioritetsfilter === p ? "primaer" : "sekundaer"}
                  onClick={() => {
                    setPrioritetsfilter((f) => (f === p ? null : p));
                    setSide(1);
                  }}>
              {PRIORITET[p].label}
            </Knap>
          ))}
          {prioritetsfilter && (
            <Knap onClick={() => { setPrioritetsfilter(null); setSide(1); }}>Nulstil</Knap>
          )}
        </div>

        {udsnit.kilde === "indberetninger"
          ? <IndberetningsTabel raekker={denneSide} enhedNavn={enhedNavn} />
          : <OpgaveTabel raekker={denneSide} enhedNavn={enhedNavn} lvNavn={lvNavn} nu={nu} />}

        <Sider side={side} antal={sorteret.length} prSide={PR_SIDE} saet={setSide} />
        {sider > 1 && (
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Viser {num(denneSide.length)} af {num(sorteret.length)}
            {prioritetsfilter ? ` (filtreret fra ${num(raa.length)})` : ""}.
          </p>
        )}

        {vis === "forsinkede" && tal.udenVarighed.antal > 0 && (
          /* ⚠ TALLET DER IKKE KAN AFGØRES, STÅR VED SIDEN AF — ikke inde i.
             En opgave uden estimat har ingen slutning og kan hverken være
             forsinket eller til tiden. Talte vi den som rettidig, ville
             skærmen sige "0 forsinkede" om en liste hvor en del ikke kunne
             afgøres. */
          <p className="fc-hint fc-bad" style={{ marginTop: 12 }}>
            ⚠ <b>{num(tal.udenVarighed.antal)}</b> planlagte opgaver har intet
            estimat og kan derfor <b>hverken</b> være forsinkede eller til tiden.
            De står ikke i listen ovenfor — og de er ikke rettidige.
          </p>
        )}
      </Kort>
    </div>
  );
}

function Prioritetspille({ post }) {
  const p = prioritetFor(post);
  /* ⚠ INTET, IKKE "Lav". En post uden prioritet er ikke lavt prioriteret —
     den er ikke set af nogen endnu. Se prioritet.js. */
  return p
    ? <Pille tone={p.pill}>{p.label}</Pille>
    : <span className="fc-neutral">— ikke vurderet</span>;
}

function IndberetningsTabel({ raekker, enhedNavn }) {
  return (
    <Tabel
      kolonner={[
        { key: "oprettetMs", label: "Indberettet", render: (r) => datoTid(r.oprettetMs) },
        { key: "koeretoejId", label: "Enhed", render: (r) => <b>{enhedNavn(r.koeretoejId)}</b> },
        { key: "art", label: "Art", render: (r) => HAENDELSE_ART[r.art]?.label || r.art },
        { key: "beskrivelse", label: "Beskrivelse" },
        { key: "prioritet", label: "Prioritet", render: (r) => <Prioritetspille post={r} /> },
        { key: "forloeb", label: "Forløb",
          render: (r) => <Pille tone={FORLOEB[r.forloeb]?.pill}>{FORLOEB[r.forloeb]?.label}</Pille> },
        { key: "h", label: "", render: () => (
          <Knap disabled
                title="Skrivning er ikke bygget: at planlægge en indberetning opretter en opgave OG en reservation, atomisk. To disponenter kan ramme samme sekund — det hører i en Cloud Function.">
            Planlæg
          </Knap>) },
      ]}
      raekker={raekker}
      tom="Ingen indberetninger i udsnittet."
    />
  );
}

function OpgaveTabel({ raekker, enhedNavn, lvNavn, nu }) {
  return (
    <Tabel
      kolonner={[
        { key: "startMs", label: "Start", render: (r) => datoTid(r.startMs) },
        { key: "slut", label: "Slut", render: (r) => {
          const s = slutter(r);
          /* Uden estimat er der ingen slutning — og "—" er svaret, ikke
             starttidspunktet igen. */
          return s ? datoTid(s) : <span className="fc-neutral">— intet estimat</span>;
        } },
        { key: "koeretoejId", label: "Enhed", render: (r) => <b>{enhedNavn(r.koeretoejId)}</b> },
        { key: "beskrivelse", label: "Beskrivelse" },
        { key: "arbejdstype", label: "Type", render: (r) => ARBEJDSTYPE[r.arbejdstype] || "—" },
        { key: "leverandoerId", label: "Udføres af",
          render: (r) => (r.leverandoerId ? lvNavn(r.leverandoerId) : "Eget værksted") },
        { key: "prioritet", label: "Prioritet", render: (r) => <Prioritetspille post={r} /> },
        { key: "status", label: "Status", render: (r) => {
          const s = slutter(r);
          const forsinket = s !== null && s < nu;
          return (
            <>
              <Pille tone={OPGAVE_STATUS[r.status]?.pill}>{OPGAVE_STATUS[r.status]?.label}</Pille>
              {forsinket && <> <Pille tone="bad">Forsinket</Pille></>}
            </>
          );
        } },
        { key: "h", label: "", render: () => (
          <Knap disabled
                title="Skrivning er ikke bygget: en reservation skal skrives atomisk sammen med opgaven, og to disponenter kan ramme samme sekund. Se Kendte huller i README.">
            Flyt
          </Knap>) },
      ]}
      raekker={raekker}
      tom="Ingen opgaver i udsnittet."
    />
  );
}
