/* src/moduler/flaade/Statistik.jsx
 * Fleet → Statistik. Fleet TARGET completion-slice (produktejer-review
 * 2026-09-01): "Implementér den som reel Fleet-side på eksisterende data.
 * Minimum: periodevalg, drifts-/serviceomkostninger, brændstof hvor faktiske
 * data findes, antal indberetninger/opgaver, nedetid, omkostning pr. enhed/
 * km hvor datagrundlaget er reelt, relevante top/bottom-lister. Ingen fake
 * grafer og ingen beregning på manglende data."
 *
 * ⚠ PERIODEVALGET ER SHELLENS, IKKE ET NYT HER. CLAUDE.md: "INGEN
 * PERIODEVÆLGER I FILTERKORTET [...] shellen ejer den allerede." `periode`
 * kommer fra `useFleet()` — samme vindue som resten af appen står på, ikke en
 * konkurrerende dato-picker.
 *
 * ⚠ INGEN NYE kpi/-FELTER. `k.flaade.omkostningPrKmOere` er i dag ALTID null
 * (kpi-aggregering.js har ingen kilde til det endnu — se noten der), og
 * `driftPrKmOere` på hver enhed er en BUDGETTERET SATS, ikke et målt forbrug
 * (se Oversigt.jsx's "dyreste"-liste og dens egen kommentar om det). Denne
 * side opfinder ikke et tal for at udfylde feltet: drifts-/service- og
 * brændstofomkostning regnes i stedet af `indkoeb`-linjerne klippet til
 * `periode` — et REELT, om end mindre, grundlag. Er der intet Procure-modul,
 * viser siden det som en grund, ikke som et nul.
 *
 * ⚠ NEDETID GENBRUGER IKKE nedetidMs() FRA flaade.js. Den funktion regner på
 * "besøg" (`{fra, til, status}`), en form kun demo-vaerksted.js's DEMO_BESOEG
 * har — Oversigt.jsx fodrer den fejlagtigt med demodata uanset miljø, et
 * forud eksisterende hul denne side ikke skal arve. Her klippes i stedet
 * `startMs`/`slutter(o)` fra de RIGTIGE opgaver til perioden, samme
 * halvåbne-vindue-disciplin som resten af filen.
 */
import { useMemo } from "react";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { num, kr, dato } from "../../fleet/format.js";
import {
  Kort, Tabel, KpiKort, KpiRaekke, Datatilstand, Henter, ModulNav,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { FLEET_FANER } from "../../fleet/modulfaner.js";
import { slutter } from "../../fleet/driftskalender.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { DEMO_INDBERETNINGER } from "../../fleet/demo-indberetninger.js";
import { DEMO_INDKOEBSLINJER } from "../../fleet/demo-indkoeb.js";

/* Drifts-/serviceomkostning: de kategorier der reelt hører til at holde
   flåden kørende. `facility`/`kontor` osv. hører ikke til en Fleet-side. */
const SERVICE_KATEGORIER = new Set(["reparation", "daek", "service"]);

export default function FlaadeStatistik() {
  const { periode } = useFleet();

  const enheder = useListe("koeretoejer", { vindue: "alle", demo: DEMO_KOERETOEJER });
  const opgaver = useListe("opgaver", { vindue: "alle", graense: 500, demo: DEMO_OPGAVER });
  const indberetninger = useListe("indberetninger", {
    vindue: "alle", vindueDage: 400, graense: 500, demo: DEMO_INDBERETNINGER,
  });
  /* ⚠ MODULGATET TIL Procure — useListe springer forespørgslen over med
     TILSTAND.modulMangler hos en Fleet-kunde uden det, se beslutning 95. */
  const indkoeb = useListe("indkoeb", { vindue: "alle", graense: 1000, demo: DEMO_INDKOEBSLINJER });

  const henter = enheder.henter || opgaver.henter || indberetninger.henter || indkoeb.henter;
  const fejlTilstand = [enheder.tilstand, opgaver.tilstand, indberetninger.tilstand]
    .find((t) => blokerer(t));

  const flaadeopgaver = useMemo(
    () => opgaver.data.filter((o) => o.art === "vaerksted"), [opgaver.data]);

  const iPeriode = (ms) => Number.isFinite(ms) && ms >= periode.fra && ms < periode.til;

  const opgaverIPerioden = useMemo(
    () => flaadeopgaver.filter((o) => iPeriode(o.startMs)), [flaadeopgaver, periode.fra, periode.til]);
  const indberetningerIPerioden = useMemo(
    () => indberetninger.data.filter((i) => iPeriode(i.oprettetMs)),
    [indberetninger.data, periode.fra, periode.til]);

  /* indkoeb — kun når modulet findes. En tom liste af modulMangler er IKKE
     "ingen udgifter"; den er "spørgsmålet er ikke stillet endnu". */
  const harIndkoeb = indkoeb.tilstand?.art !== "modulMangler";
  const linjerIPerioden = useMemo(
    () => (harIndkoeb ? indkoeb.data.filter((l) => iPeriode(l.dato)) : []),
    [indkoeb.data, harIndkoeb, periode.fra, periode.til]);

  const beloebAf = (l) => (Number.isFinite(l.prisPrEnhedOere) && Number.isFinite(l.antal)
    ? l.prisPrEnhedOere * l.antal : 0);

  const driftsomkostning = linjerIPerioden
    .filter((l) => SERVICE_KATEGORIER.has(l.kategori))
    .reduce((sum, l) => sum + beloebAf(l), 0);
  const braendstofomkostning = linjerIPerioden
    .filter((l) => l.kategori === "braendstof")
    .reduce((sum, l) => sum + beloebAf(l), 0);

  /* ⚠ KUN FAKTISK NEDETID — samme filosofi som nedetidMs(): en planlagt
     opgave er ikke nedetid endnu, bilen kører stadig. Kun igang/udført
     tæller, og kun den del af opgaven der ligger INDE i perioden. */
  const nedetidMsIPerioden = flaadeopgaver
    .filter((o) => o.status === "igang" || o.status === "udfoert")
    .reduce((sum, o) => {
      const slut = slutter(o);
      if (slut === null || !Number.isFinite(o.startMs)) return sum;
      const fra = Math.max(o.startMs, periode.fra);
      const til = Math.min(slut, periode.til);
      return til > fra ? sum + (til - fra) : sum;
    }, 0);
  const nedetidDageIPerioden = nedetidMsIPerioden / 86400000;

  /* Top-liste: enheder med højest INDKØBSOMKOSTNING i den valgte periode —
     et REELT, periodebundet tal, i modsat af den statiske driftPrKmOere-sats
     Oversigt.jsx allerede viser (den sats gentages ikke her). */
  const enhedNavn = (id) => enheder.data.find((e) => e.id === id)?.kaldenavn || id || "—";
  const omkostningPrEnhed = useMemo(() => {
    const sum = new Map();
    for (const l of linjerIPerioden) {
      if (!l.koeretoejId) continue;
      sum.set(l.koeretoejId, (sum.get(l.koeretoejId) || 0) + beloebAf(l));
    }
    return [...sum.entries()]
      .map(([koeretoejId, oere]) => ({ koeretoejId, oere }))
      .sort((a, b) => b.oere - a.oere)
      .slice(0, 5);
  }, [linjerIPerioden]);

  const indberetningerPrEnhed = useMemo(() => {
    const sum = new Map();
    for (const i of indberetningerIPerioden) {
      if (!i.koeretoejId) continue;
      sum.set(i.koeretoejId, (sum.get(i.koeretoejId) || 0) + 1);
    }
    return [...sum.entries()]
      .map(([koeretoejId, antal]) => ({ koeretoejId, antal }))
      .sort((a, b) => b.antal - a.antal)
      .slice(0, 5);
  }, [indberetningerIPerioden]);

  if (henter) return <Henter hvad="Fleet-statistikken" />;
  if (fejlTilstand) return <Datatilstand tilstand={fejlTilstand} genprov={() => {
    enheder.genindlaes(); opgaver.genindlaes(); indberetninger.genindlaes();
  }} />;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={FLEET_FANER} />

      <Kort titel="Statistik">
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          Perioden er <b>{dato(periode.fra)} – {dato(periode.til - 1)}</b> ({num(periode.dage)} dage) —
          shellens eget periodevalg øverst, ikke en ny vælger her.
        </p>

        <KpiRaekke>
          <KpiKort label="Driftsomkostninger" vaerdi={kr(driftsomkostning)}
                   note={harIndkoeb ? "reparation, dæk, service — perioden" : "Kræver Procure-modulet"} />
          <KpiKort label="Brændstofudgift" vaerdi={kr(braendstofomkostning)}
                   note={harIndkoeb ? "perioden, af registrerede indkøb" : "Kræver Procure-modulet"} />
          <KpiKort label="Indberetninger" vaerdi={num(indberetningerIPerioden.length)} note="perioden" />
          <KpiKort label="Værkstedsopgaver" vaerdi={num(opgaverIPerioden.length)} note="startet i perioden" />
          <KpiKort label="Nedetid" vaerdi={`${num(nedetidDageIPerioden, 1)} dage`}
                   note="summeret over flåden, kun igang/udført" />
        </KpiRaekke>

        {!harIndkoeb && (
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Denne tenant har ikke Procure-modulet, og <b>indkoeb</b> er derfor ikke
            spurgt — omkostningstallene ovenfor er ikke "nul udgifter", de er
            "ingen kilde at regne dem af".
          </p>
        )}
      </Kort>

      <Kort titel="Enheder med højest indkøbsomkostning i perioden">
        <Tabel
          kolonner={[
            { key: "koeretoejId", label: "Enhed", render: (r) => <b>{enhedNavn(r.koeretoejId)}</b> },
            { key: "oere", label: "Omkostning", num: true, render: (r) => kr(r.oere) },
          ]}
          raekker={omkostningPrEnhed}
          noegle={(r) => r.koeretoejId}
          tom={harIndkoeb ? "Ingen indkøb registreret på enheder i perioden." : "Kræver Procure-modulet."}
        />
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Summen af registrerede indkøb (reservedele, dæk, service, brændstof)
          i perioden — ikke enhedens budgetterede sats pr. km, som allerede
          står i Enheder-tabellen.
        </p>
      </Kort>

      <Kort titel="Enheder med flest indberetninger i perioden">
        <Tabel
          kolonner={[
            { key: "koeretoejId", label: "Enhed", render: (r) => <b>{enhedNavn(r.koeretoejId)}</b> },
            { key: "antal", label: "Indberetninger", num: true, render: (r) => num(r.antal) },
          ]}
          raekker={indberetningerPrEnhed}
          noegle={(r) => r.koeretoejId}
          tom="Ingen indberetninger med en tilknyttet enhed i perioden."
        />
      </Kort>

      <p className="fc-hint">
        Ingen af tallene på denne side er anslåede. Omkostning pr. km og
        "udvikling over tid" kræver en tidsserie som appen ikke har endnu —
        de vises ikke her, fremfor at blive udregnet af for lidt grundlag.
      </p>
    </div>
  );
}
