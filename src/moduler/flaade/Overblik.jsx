/* src/moduler/flaade/Overblik.jsx
 * Fleet → Overblik. Modulets forside — Fleet TARGET-restrukturering,
 * masterbrief §1/§9.1, produktejer-review 2026-09-01, fuldført i
 * completion-slicen (samme dato).
 *
 * ⚠ §9.1 — "Kompakt operationelt overblik inspireret af gammel
 * FleetManagement: indberetninger, relevante omkostninger, skader,
 * kommende/forsinkede servicepunkter og driftsalarmer. Kun reelle data.
 * Link til Statistik."
 *
 * ⚠ IKKE "5 KPI-cards → kalender → fakturaer" — OG IKKE ET NYT KPI-DASHBOARD
 * I STEDET. Første version reducerede KPI-kortenes ANTAL fra ni til fem;
 * completion-reviewet sagde at det stadig var "en KPI-samling", ikke et
 * cockpit. `Handlingsliste` (dashboards.js's mønster, genbrugt uændret) er
 * derfor den ENESTE tælling øverst — hver række er en handling, ikke et
 * nøgletal, og en række der ikke kræver noget, TEGNES SLET IKKE. Under den
 * kommer to RIGTIGE rækkelister (klar til afhentning, servicepunkter) i
 * stedet for endnu et tal, og til sidst arbejdskøen — samme
 * `ArbejdskoeIndhold` som `/flaade/koe` bruger.
 *
 * ⚠ TALLENE I Handlingsliste ER IKKE NYE FELTER I kpi/. `nye`/`afventer`
 * kommer af driftstal() — den SAMME funktion og de SAMME to hentede lister
 * (`opgaver` filtreret til art "vaerksted", `indberetninger`) som
 * ArbejdskoeIndhold selv kalder, med identiske useListe-parametre, så tallet
 * her og fanens eget tal ALDRIG kan blive uenige. `paaVaerksted`/`udeAfDrift`
 * er derimod ægte kpi/-felter (køretøjsSTATUS, ikke opgaveSTATUS) og hentes
 * via useKpi() som før.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, kr, datoTid, dato } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Knap, Handlingsliste, Kpiadgang, Datatilstand, ModulNav,
} from "../../fleet/ui.jsx";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { FLEET_FANER } from "../../fleet/modulfaner.js";
import { STANDARD_FREMAD, driftstal } from "../../fleet/driftskalender.js";
import { ARBEJDSTYPE } from "../../fleet/opgaver.js";
import {
  alleServicepunkter, sorterServicepunkter, SERVICEPUNKT_TYPE, SERVICEPUNKT_STATUS,
} from "../../fleet/servicepunkter.js";
import { ArbejdskoeIndhold } from "./Arbejdskoe.jsx";
import Planlaegdialog from "../../fleet/Planlaegdialog.jsx";
import Haendelsespanel from "../../fleet/Haendelsespanel.jsx";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
import { useListe } from "../../fleet/useListe.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { DEMO_INDBERETNINGER } from "../../fleet/demo-indberetninger.js";

export default function Overblik() {
  const { kpi: k, tilstand, genindlaes, utilgaengelige } = useKpi();
  const { bruger } = useFleet();
  const maaPlanlaegge = harPerm(bruger?.perms, PERM.opgaverSkriv);

  /* ⚠ LOKAL TILSTAND, IKKE URL. `/flaade/koe` findes stadig som deep link/
     "åbn i nyt vindue"-mål (Arbejdskoe.jsx's default-eksport), men Overblik
     ER forsiden — der er intet ydre sted at komme "tilbage" til. */
  const [vis, setVis] = useState("nye");
  const [fremDage, setFremDage] = useState(STANDARD_FREMAD);
  const [planlaegger, setPlanlaegger] = useState(false);
  const [opgaveDetaljerId, setOpgaveDetaljerId] = useState(null);
  /* Fleet TARGET §9.3 — se Planlaegdialog.jsx's egen note. Genbruges nu også
     af "Klar til afhentning"-listens Detaljer-knap, som altid åbner på
     "overblik" (false) — kun planlægningsflowet peger direkte på Sag. */
  const [aabnPaaSag, setAabnPaaSag] = useState(false);

  const enheder = useListe("koeretoejer", { vindue: "alle", demo: DEMO_KOERETOEJER });
  const leverandoerer = useListe("leverandoerer", {
    vindue: "alle", demo: DEMO_LEVERANDOERER,
  });
  const opgaver = useListe("opgaver", {
    ordnPaa: "startMs", vindue: "fremad", vindueDage: 120, fremDage: 365,
    graense: 500, demo: DEMO_OPGAVER,
  });
  /* ⚠ SAMME PARAMETRE SOM ArbejdskoeIndhold — se filens eget hoved. */
  const indberetninger = useListe("indberetninger", {
    ordnPaa: "oprettetMs", vindue: "fremad", vindueDage: 180, fremDage: 30,
    graense: 500, demo: DEMO_INDBERETNINGER,
  });

  const lvNavn = (id) => leverandoerNavn(leverandoerer.data, id);

  const flaadeopgaver = useMemo(
    () => opgaver.data.filter((o) => o.art === "vaerksted"), [opgaver.data]);

  const tal = useMemo(() => driftstal({
    opgaver: flaadeopgaver, indberetninger: indberetninger.data,
    nu: Date.now(), fremDage,
  }), [flaadeopgaver, indberetninger.data, fremDage]);

  /* Fleet §8 — leverandørportalens status er en almindelig opgave-status,
     ikke en parallel node. Se Haendelsespanel.jsx's LeverandoerTilbud. */
  const klarTilAfhentning = useMemo(
    () => flaadeopgaver.filter((o) => o.status === "klar_til_afhentning"), [flaadeopgaver]);

  /* Fleet §9.10 — se fleet/servicepunkter.js. */
  const servicepunkter = useMemo(
    () => sorterServicepunkter(alleServicepunkter(enheder.data))
      .filter((p) => p.status === "forfalden" || p.status === "snart"),
    [enheder.data]);

  const enhedNavn = (id) => enheder.data.find((e) => e.id === id)?.kaldenavn || id || "—";

  /* ⚠ KUN DE RÆKKER DER FAKTISK KRÆVER NOGET — Dashboard.jsx's
     Handlingsliste-mønster. "0 nye indberetninger" er ikke en handling, det
     er fraværet af en, og en fast række med et nul-tal holder man op med at
     læse. Rækkefølgen er hastende først. */
  const handlingsposter = [
    tal.nye.antal > 0 && {
      id: "nye", til: `/flaade/koe?vis=nye`, tone: "warn", ikon: "udraab",
      tekst: "Nye indberetninger", under: "Endnu ikke vurderet af en værkfører",
      antal: num(tal.nye.antal),
    },
    tal.afventer.antal > 0 && {
      id: "afventer", til: `/flaade/koe?vis=afventer`, tone: "warn", ikon: "kalender",
      tekst: "Afventer planlægning", under: "Har et tidspunkt, men ingen plan endnu",
      antal: num(tal.afventer.antal),
    },
    k && k.flaade.paaVaerksted > 0 && {
      id: "vaerksted", til: "/opsaetning/enheder", tone: "info", ikon: "skruenoegle",
      tekst: "På værksted / hos leverandør", under: "Enheder ude af drift lige nu, til reparation",
      antal: num(k.flaade.paaVaerksted),
    },
    k && k.flaade.udeAfDrift > 0 && {
      id: "ude", til: "/opsaetning/enheder", tone: "bad", ikon: "advarsel",
      tekst: "Ude af drift", under: "Kan ikke disponeres før status ændres",
      antal: num(k.flaade.udeAfDrift),
    },
  ].filter(Boolean);

  return (
    <div className="fc-grid" style={{ gap: 11 }}>
      <ModulNav punkter={FLEET_FANER} />
      <Kpiadgang utilgaengelige={utilgaengelige} />
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {/* ⚠ COCKPIT, IKKE DASHBOARD — se filens eget hoved. */}
      <Kort titel="Kræver handling nu">
        <Handlingsliste poster={handlingsposter} />
      </Kort>

      {/* Fleet §8 — kun tegnet når der faktisk ER et. Ingen tom "Klar til
          afhentning (0)"-boks, der ikke gør andet end at optage plads. */}
      {klarTilAfhentning.length > 0 && (
        <Kort titel={`Klar til afhentning (${num(klarTilAfhentning.length)})`}>
          <Tabel
            kolonner={[
              { key: "koeretoejId", label: "Enhed", render: (o) => <b>{enhedNavn(o.koeretoejId)}</b> },
              { key: "arbejdstype", label: "Type", render: (o) => ARBEJDSTYPE[o.arbejdstype] || "—" },
              { key: "leverandoerId", label: "Hos", render: (o) => (o.leverandoerId ? lvNavn(o.leverandoerId) : "—") },
              { key: "tilbud", label: "Seneste tilbud", render: (o) => {
                  const t = Object.values(o.leverandoertilbud || {}).sort((a, b) => (b.indsendtMs || 0) - (a.indsendtMs || 0))[0];
                  return t && Number.isFinite(t.beloebOere) ? kr(t.beloebOere) : <span className="fc-neutral">Intet tilbud</span>;
                } },
              { key: "startMs", label: "Siden", render: (o) => datoTid(o.startMs) },
              { key: "h", label: "", render: (o) => (
                  <Knap onClick={() => { setOpgaveDetaljerId(o.id); setAabnPaaSag(false); }}>
                    Detaljer
                  </Knap>
                ) },
            ]}
            raekker={klarTilAfhentning}
            noegle={(o) => o.id}
            tom=""
          />
        </Kort>
      )}

      {servicepunkter.length > 0 && (
        <Kort titel={`Kommende/forfaldne servicepunkter (${num(servicepunkter.length)})`}
              handling={<Link className="fc-a" to="/flaade/servicebog">Servicebog</Link>}>
          <Tabel
            kolonner={[
              { key: "koeretoejId", label: "Enhed", render: (p) => <b>{enhedNavn(p.koeretoejId)}</b> },
              { key: "type", label: "Type", render: (p) => SERVICEPUNKT_TYPE[p.type]?.label || p.type },
              { key: "label", label: "Punkt" },
              { key: "naeste", label: "Forfald", render: (p) => (
                  <>
                    {p.naesteForfaldMs != null ? dato(p.naesteForfaldMs) : "—"}
                    {p.naesteForfaldKm != null && <> · {num(p.naesteForfaldKm)} km</>}
                  </>
                ) },
              { key: "status", label: "Status", render: (p) => (
                  <Pille tone={SERVICEPUNKT_STATUS[p.status]?.pill}>{SERVICEPUNKT_STATUS[p.status]?.label}</Pille>
                ) },
            ]}
            raekker={servicepunkter.slice(0, 8)}
            noegle={(p) => `${p.koeretoejId}:${p.id}`}
            tom=""
          />
        </Kort>
      )}

      {/* ⚠ §9.6 — ARBEJDSKØEN ER STADIG DEN PRIMÆRE ARBEJDSFLADE, IKKE ET
          PANEL MAN SKAL ÅBNE. Samme `driftstal()`/`sorterKoe()` som
          Driftskalenderen brugte til sine fem kasser — se ArbejdskoeIndhold's
          eget hoved. */}
      <ArbejdskoeIndhold
        vis={vis} saetVis={setVis}
        fremDage={fremDage} saetFremDage={setFremDage}
        handling={
          <div style={{ display: "flex", gap: 8 }}>
            {/* ⚠ SAMME GENVEJ SOM Driftskalenderen HAVDE FØR RESTRUKTURERINGEN
                — et rigtigt browservindue på den kanoniske, URL-bårne rute
                (Arbejdskoe.jsx's default-eksport), ikke panelet. Et nyt
                vindue arver ingen React-tilstand, derfor `vis`/`fremDage` i
                URL'en og ikke kun i denne skærms useState. */}
            <Knap onClick={() => window.open(
              `/flaade/koe?vis=${vis}&frem=${fremDage}`, "fc-koe", "width=1280,height=900")}>
              Åbn i nyt vindue
            </Knap>
            <Knap variant="primaer" onClick={() => setPlanlaegger(true)}
                  disabled={!maaPlanlaegge}
                  title={maaPlanlaegge ? undefined : "Kræver opgaver.skriv."}>
              + Planlæg aktivitet
            </Knap>
          </div>
        }
      />

      {planlaegger && (
        <Planlaegdialog
          enheder={enheder.data}
          leverandoerer={leverandoerer.data}
          onLuk={() => setPlanlaegger(false)}
          onGemt={(res) => {
            setPlanlaegger(false);
            opgaver.genindlaes();
            /* ⚠ FLEET TARGET §9.3 — se Planlaegdialog.jsx's egen note. */
            if (res?.harEksternLeverandoer && res.opgaveId) {
              setOpgaveDetaljerId(res.opgaveId);
              setAabnPaaSag(true);
            }
          }}
        />
      )}

      {opgaveDetaljerId && (() => {
        const valgt = opgaver.data.find((o) => o.id === opgaveDetaljerId) || null;
        return valgt && (
          <Haendelsespanel
            opgave={valgt}
            lvNavn={lvNavn}
            enheder={enheder.data}
            maaSkrive={maaPlanlaegge}
            initialFane={aabnPaaSag ? "sag" : "overblik"}
            onSkiftet={() => opgaver.genindlaes()}
            onLuk={() => { setOpgaveDetaljerId(null); setAabnPaaSag(false); }}
          />
        );
      })()}
    </div>
  );
}
