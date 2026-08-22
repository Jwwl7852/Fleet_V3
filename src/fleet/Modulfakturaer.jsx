/* src/fleet/Modulfakturaer.jsx
 * Ét moduls linse på de fælles fakturaer — beslutning 86.
 *
 * ⚠ ÉN KOMPONENT, IKKE ÉN PR. MODUL. Fleet og Facility stiller det samme
 * spørgsmål — *"hvilke fakturaer er placeret på MINE sager?"* — og svarer det
 * mod den samme node med hver sin art. To kopier ville drive: den ene ville få
 * rettet sin beløbskolonne og den anden ikke, og så viser to skærme forskellige
 * tal for det samme.
 *
 * Det er samme greb som `Gitterkalender.jsx`: regnestykket ligger ét sted, og
 * kalderen siger hvad den vil se.
 *
 * ⚠ OG DET ER IKKE EN KOPI AF FAKTURAERNE. Der hentes fra `fakturaer/` — den
 * fælles node — og filtreres på `destinationArt`. En modulnode med "modulets
 * egne fakturaer" ville være den samme kendsgerning to steder, og så skulle
 * hvert beløb i huset huske at lægge dem sammen.
 *
 * ⚠ MODULET EJER SAGEN, FAKTURACENTERET EJER FAKTURAEN. Derfor er der ingen
 * knapper her: man placerer og godkender i Fakturacenteret. En "godkend"-knap
 * i to skærme ville være to veje til ét felt, og den ene ville glemme
 * permissionstjekket.
 */
import { Link } from "react-router-dom";
import { useListe } from "./useListe.js";
import { kr, num, dato } from "./format.js";
import { Kort, Tabel, Pille, Tom } from "./ui.jsx";
import { DESTINATIONSART, centertilstand, CENTERTILSTAND } from "./fakturacenter.js";
import { FAKTURASTATUS, leverandoerNavn } from "./leverandoerer.js";
import { DEMO_FAKTURAER, DEMO_LEVERANDOERER } from "./demo-indkoeb.js";
import { DEMO_OPGAVER } from "./demo-opgaver.js";

/**
 * <Modulfakturaer art="fleet" />
 *
 * ⚠ OPGAVERNE HENTES HER, og det er en undtagelse med en grund: HVERKEN Fleets
 * eller Facilitys oversigt henter dem i forvejen. Havde de gjort det, skulle
 * listen sendes MED — to `useListe`-kald på samme node i samme skærm er to
 * hentninger af de samme rækker, og to steder der kan nå at vise hver sit.
 * Kommer der en opgaveliste på skærmene, skal den sendes ind her.
 */
export function Modulfakturaer({ art }) {
  const liste = useListe("fakturaer", {
    ordnPaa: "fakturadatoMs", vindueDage: 400, graense: 500, demo: DEMO_FAKTURAER,
  });
  const lev = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });
  const opgaveliste = useListe("opgaver", {
    ordnPaa: "startMs", vindueDage: 400, graense: 500, demo: DEMO_OPGAVER,
  });
  const opgaver = opgaveliste.data;

  const mine = liste.data.filter((f) => f.destinationArt === art);
  const sagsnavn = (id) => {
    const o = opgaver.find((x) => x.id === id);
    return o ? (o.beskrivelse || o.id) : id;
  };

  /* ⚠ SUMMEN ER AF DE VISTE, og etiketten siger det. Et tal der lød som
     "modulets samlede fakturering", ville være forkert i det øjeblik en
     faktura lå uden for tidsvinduet. */
  const sum = mine.reduce((s, f) => s + (f.beloebOere || 0), 0);

  return (
    <Kort
      titel={`Fakturaer på ${DESTINATIONSART[art].label.toLowerCase()} (${num(mine.length)})`}
      handling={
        <Link className="fc-a" to="/oekonomi/fakturacenter">Åbn Fakturacenteret</Link>
      }
    >
      {!mine.length ? (
        <Tom>
          Ingen fakturaer er placeret her endnu. De placeres i{" "}
          <Link className="fc-a" to="/oekonomi/fakturacenter">Fakturacenteret</Link>,
          som ejer fakturaen — modulet ejer sagen.
        </Tom>
      ) : (
        <>
          <Tabel
            raekker={mine}
            tom="Ingen."
            kolonner={[
              { key: "nr", label: "Faktura", render: (f) => <b>{f.fakturanummer}</b> },
              { key: "lev", label: "Leverandør",
                render: (f) => leverandoerNavn(lev.data, f.leverandoerId) },
              { key: "sag", label: "Sag", render: (f) => sagsnavn(f.destinationId) },
              { key: "dato", label: "Dato", render: (f) => dato(f.fakturadatoMs) },
              /* ⚠ EKSKL. MOMS, OG ETIKETTEN SIGER DET — momsen er sit eget felt. */
              { key: "beloeb", label: "Ekskl. moms", num: true,
                render: (f) => kr(f.beloebOere) },
              { key: "status", label: "Status", render: (f) => (
                  <>
                    <Pille tone={FAKTURASTATUS[f.status]?.pill}>
                      {FAKTURASTATUS[f.status]?.label}
                    </Pille>
                    <div className="fc-hint">
                      {CENTERTILSTAND[centertilstand(f)].label}
                    </div>
                  </>
                ) },
            ]}
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            <b>{kr(sum)}</b> ekskl. moms i det viste udsnit. Det er{" "}
            <b>de samme fakturaer</b> som Fakturacenteret viser — ikke et andet
            sæt: modulet ejer sagen, centeret ejer fakturaen.
          </p>
        </>
      )}
    </Kort>
  );
}
