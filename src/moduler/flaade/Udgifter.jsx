/* src/moduler/flaade/Udgifter.jsx
 * Fleet → Udgifter.
 *
 * ⚠ KILDE: TARGET-punkt 3 i Fleet-afsnittet af
 * docs/product-redesign-v1/07_OLD_CURRENT_TARGET_FLEET_FACILITY_PROCURE_UNITBOOKING.md
 * ("ny SAMLENDE visning ... ingen ny datamodel, kun en manglende visning af
 * data der allerede findes"), godkendt til at bygges i chatten 2026-09-05
 * efter sammenligning med en referenceapp med samme skærm. INGEN ny node og
 * ingen ny Cloud Function — se noten nedenfor.
 *
 * ⚠ "ANSLÅET" OG "FAKTURERET" ER TO FORSKELLIGE NODER, MED VILJE.
 * Anslået beløb er `opgaver/$id.beloebOere` — disponentens egen vurdering,
 * sat når værkstedsbesøget planlægges (samme felt Vaerkstedskalender.jsx
 * allerede viser). Faktureret beløb er den RIGTIGE faktura, som
 * Fakturacenteret ejer og placerer på sagen (`fakturaer`, filtreret
 * `destinationArt === "fleet"` — samme kilde som `Modulfakturaer.jsx`).
 * De to skal IKKE lægges i én node: en disponent der genskriver et gæt,
 * ville ellers kunne overskrive et tal bogholderen allerede har låst fast
 * ved godkendelse. Denne skærm er derfor kun en SAMMENSTILLING af to
 * eksisterende, uafhængige kilder — ingen skrivning sker herfra.
 *
 * ⚠ EN OPGAVE UDEN MATCH ER IKKE EN FEJL. Fakturaen lander typisk dage eller
 * uger efter besøget. "—" i Faktureret/Afvigelse betyder "endnu ikke
 * modtaget/placeret", ikke "ingen udgift".
 *
 * ⚠ ANNULLEREDE OPGAVER TÆLLES IKKE MED. Et aflyst værkstedsbesøg blev aldrig
 * en udgift, uanset hvad der stod som anslået beløb, da det blev oprettet.
 * Samme filosofi som `nedetidMsIPerioden` i Statistik.jsx, som af samme
 * grund kun tæller igang/udført.
 *
 * ⚠ INGEN EGEN PERIODEVÆLGER. `periode` kommer fra `useFleet()` — shellens
 * eget vindue, som Statistik.jsx også bruger. CLAUDE.md: "shellen ejer den."
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { kr, num, dato, deviation } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Knap, KpiRaekke, KpiKort, Datatilstand, Henter, ModulNav,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { csv, csvOere, filnavn, hentFil } from "../../fleet/eksport.js";
import { FLEET_FANER } from "../../fleet/modulfaner.js";
import { OPGAVE_STATUS, ARBEJDSTYPE } from "../../fleet/opgaver.js";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_LEVERANDOERER, DEMO_FAKTURAER } from "../../fleet/demo-indkoeb.js";

export default function Udgifter() {
  const { periode } = useFleet();
  const [enhedsfilter, setEnhedsfilter] = useState("");

  const opgaveliste = useListe("opgaver", {
    ordnPaa: "startMs", vindueDage: 400, graense: 1000, demo: DEMO_OPGAVER,
  });
  const enheder = useListe("koeretoejer", {
    vindue: "alle", graense: 500, demo: DEMO_KOERETOEJER,
  });
  const leverandoerer = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });
  /* ⚠ `fakturaer.laes` KRÆVES FOR AT LÆSE DENNE NODE — ikke alle roller har
     den (beslutning 104). En bruger uden den ser stadig de anslåede beløb;
     kun Faktureret/Afvigelse-kolonnerne mangler deres tal, med en synlig
     forklaring i stedet for en tavs "0 kr". */
  const fakturaer = useListe("fakturaer", {
    ordnPaa: "fakturadatoMs", vindueDage: 400, graense: 1000, demo: DEMO_FAKTURAER,
  });

  const henter = opgaveliste.henter || enheder.henter;
  const fejlTilstand = [opgaveliste.tilstand, enheder.tilstand].find((t) => blokerer(t));

  const enhedNavn = (id) => enheder.data.find((e) => e.id === id)?.kaldenavn || id || "—";

  const iPeriode = (ms) => Number.isFinite(ms) && ms >= periode.fra && ms < periode.til;

  /* ⚠ `fakturaer` LIGGER I BASEN, IKKE BAG ET MODUL (CLAUDE.md) — den eneste
     reelle grund til at mangle den her er en rolle uden `fakturaer.laes`. */
  const harFakturaer = fakturaer.tilstand?.art !== "naegtet";

  const fakturaFor = (opgaveId) => (harFakturaer
    ? fakturaer.data.find((f) => f.destinationArt === "fleet" && f.destinationId === opgaveId)
    : undefined);

  const raekker = useMemo(() => opgaveliste.data
    .filter((o) => o.art === "vaerksted")
    .filter((o) => o.status !== "annulleret")
    .filter((o) => iPeriode(o.startMs))
    .filter((o) => !enhedsfilter || o.koeretoejId === enhedsfilter)
    .map((o) => {
      const faktura = fakturaFor(o.id);
      const anslaaet = Number.isFinite(o.beloebOere) ? o.beloebOere : null;
      const faktureret = Number.isFinite(faktura?.beloebOere) ? faktura.beloebOere : null;
      const afvigelseOere = anslaaet != null && faktureret != null ? faktureret - anslaaet : null;
      return { opgave: o, faktura, anslaaet, faktureret, afvigelseOere };
    })
    .sort((a, b) => (b.opgave.startMs || 0) - (a.opgave.startMs || 0)),
  [opgaveliste.data, fakturaer.data, harFakturaer, enhedsfilter, periode.fra, periode.til]);

  const sumAnslaaet = raekker.reduce((s, r) => s + (r.anslaaet || 0), 0);
  /* ⚠ AFVIGELSEN SUMMERES KUN OVER DE MATCHEDE. Lægges et anslået beløb uden
     faktura ind i "faktureret i alt" som et 0, ville afvigelsen se ud som en
     stor besparelse i stedet for "ikke opgjort endnu" — samme fejl som
     `deviation()`s egen note advarer imod. */
  const matchede = raekker.filter((r) => r.faktureret != null);
  const sumFaktureretMatchede = matchede.reduce((s, r) => s + r.faktureret, 0);
  const sumAnslaaetMatchede = matchede.reduce((s, r) => s + r.anslaaet, 0);
  const udenFaktura = raekker.length - matchede.length;

  const eksporter = () => {
    hentFil(
      csv(raekker, [
        { navn: "Dato", hent: (r) => dato(r.opgave.startMs) },
        { navn: "Enhed", hent: (r) => enhedNavn(r.opgave.koeretoejId) },
        { navn: "Type", hent: (r) => ARBEJDSTYPE[r.opgave.arbejdstype] || r.opgave.arbejdstype || "" },
        { navn: "Beskrivelse", hent: (r) => r.opgave.beskrivelse || "" },
        { navn: "Værksted", hent: (r) => leverandoerNavn(leverandoerer.data, r.opgave.leverandoerId) },
        { navn: "Anslået (kr)", hent: (r) => csvOere(r.anslaaet) },
        { navn: "Faktureret (kr)", hent: (r) => csvOere(r.faktureret) },
        { navn: "Status", hent: (r) => OPGAVE_STATUS[r.opgave.status]?.label || r.opgave.status },
      ]),
      filnavn("fleet-udgifter")
    );
  };

  if (henter) return <Henter hvad="udgifterne" />;
  if (fejlTilstand) return <Datatilstand tilstand={fejlTilstand} genprov={() => {
    opgaveliste.genindlaes(); enheder.genindlaes();
  }} />;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={FLEET_FANER} />

      <Kort
        titel="Udgifter"
        handling={<Knap onClick={eksporter}>⬇ CSV</Knap>}
      >
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          Perioden er <b>{dato(periode.fra)} – {dato(periode.til - 1)}</b> — shellens eget
          periodevalg øverst, ikke en ny vælger her. Kun værkstedsopgaver
          (service, reparation, dæk, skade, syn, reservedele) — ikke andre
          driftsopgaver.
        </p>

        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="fu-enhed">Enhed</label>
            <select id="fu-enhed" value={enhedsfilter}
                    onChange={(e) => setEnhedsfilter(e.target.value)}>
              <option value="">Alle enheder</option>
              {enheder.data.map((e) => (
                <option key={e.id} value={e.id}>{e.kaldenavn || e.id}</option>
              ))}
            </select>
          </div>
        </div>

        <KpiRaekke>
          <KpiKort label="Anslået i alt" vaerdi={kr(sumAnslaaet)} note={`${num(raekker.length)} opgaver`} />
          <KpiKort label="Faktureret i alt" vaerdi={harFakturaer ? kr(sumFaktureretMatchede) : "—"}
                   note={harFakturaer ? `af ${num(matchede.length)} modtagne fakturaer` : "kræver fakturaer.laes"} />
          <KpiKort label="Afvigelse i alt"
                   vaerdi={harFakturaer && matchede.length
                     ? deviation(sumFaktureretMatchede - sumAnslaaetMatchede,
                         { betterWhen: "lower", unit: "kr" }).text
                     : "—"}
                   note="kun opgaver med en modtaget faktura" />
          <KpiKort label="Uden faktura endnu" vaerdi={harFakturaer ? num(udenFaktura) : "—"}
                   note="anslået, men ikke matchet" />
        </KpiRaekke>

        {!harFakturaer && (
          <Datatilstand tilstand={fakturaer.tilstand} genprov={fakturaer.genindlaes} />
        )}

        <Tabel
          kolonner={[
            { key: "dato", label: "Dato", render: (r) => dato(r.opgave.startMs) },
            { key: "enhed", label: "Enhed", render: (r) => <b>{enhedNavn(r.opgave.koeretoejId)}</b> },
            { key: "type", label: "Type", render: (r) =>
                ARBEJDSTYPE[r.opgave.arbejdstype] || r.opgave.arbejdstype || "—" },
            { key: "beskrivelse", label: "Beskrivelse", render: (r) => r.opgave.beskrivelse || "—" },
            { key: "vaerksted", label: "Værksted", render: (r) =>
                leverandoerNavn(leverandoerer.data, r.opgave.leverandoerId) },
            { key: "anslaaet", label: "Anslået", num: true, render: (r) => kr(r.anslaaet) },
            { key: "faktureret", label: "Faktureret", num: true, render: (r) =>
                harFakturaer ? kr(r.faktureret) : "—" },
            { key: "afvigelse", label: "Afvigelse", num: true, render: (r) => {
                if (!harFakturaer || r.afvigelseOere == null) return "—";
                const d = deviation(r.afvigelseOere, { betterWhen: "lower", unit: "kr" });
                return <span className={`fc-${d.tone}`}>{d.pil} {d.text}</span>;
              } },
            { key: "status", label: "Status", render: (r) => (
                <Pille tone={OPGAVE_STATUS[r.opgave.status]?.pill}>
                  {OPGAVE_STATUS[r.opgave.status]?.label || r.opgave.status}
                </Pille>
              ) },
            { key: "faktura", label: "Faktura", render: (r) => (
                r.faktura
                  ? <Link className="fc-a" to="/oekonomi/fakturacenter?destination=fleet">
                      {r.faktura.fakturanummer}
                    </Link>
                  : "—"
              ) },
          ]}
          raekker={raekker}
          noegle={(r) => r.opgave.id}
          tom="Ingen værkstedsopgaver i den valgte periode."
        />

        <p className="fc-hint" style={{ marginTop: 10 }}>
          <b>Anslået</b> er beløbet sat ved planlægning (samme felt som
          Driftskalenderen viser). <b>Faktureret</b> er den rigtige faktura,
          placeret i <Link className="fc-a" to="/oekonomi/fakturacenter?destination=fleet">
          Fakturacenteret</Link> — modulet ejer sagen, centeret ejer fakturaen.
        </p>
      </Kort>
    </div>
  );
}
