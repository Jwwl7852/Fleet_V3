/* src/moduler/facility/Statistik.jsx
 * Facility – Statistik. Facility TARGET-restrukturering (produktejer-review
 * 2026-09-02) — se fleet/modulfaner.js's FACILITY_FANER og
 * docs/product-redesign-v1/07_OLD_CURRENT_TARGET_FLEET_FACILITY_PROCURE_UNITBOOKING.md's
 * Facility-afsnit, punkt 5: "ny skærm, genbruger useKpi() + historisk
 * opgaver(art=facility)-data. Kan for første gang også vise
 * facility/omkostning (bygningsomkostninger), som i dag har en fuld
 * skriveregel men ingen skærm der bruger den."
 *
 * ⚠ PERIODEVALGET ER SHELLENS, IKKE ET NYT HER — samme regel som Fleet
 * Statistik.jsx. `periode` kommer fra `useFleet()`.
 *
 * ⚠ facility/omkostning HAR INGEN TIDSDIMENSION. Reglen i
 * firebase.rules.json binder feltnavnet til nøjagtig fem poster
 * (el/varme/vand/ventilation/alarm) — det er DE SENESTE registrerede tal,
 * ikke en historik man kan klippe til en periode. At lade som om det var en
 * periode-sum ville være en påstand vi ikke kan bevise. Se
 * fleet/facility.js's OMKOSTNINGSPOST/bygningsomkostningOere — genbrugt
 * uændret, ikke genopfundet.
 */
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { usePost } from "../../fleet/usePost.js";
import { num, kr, dato } from "../../fleet/format.js";
import {
  Kort, Tabel, KpiKort, KpiRaekke, Datatilstand, Henter, ModulNav,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { FACILITY_FANER } from "../../fleet/modulfaner.js";
import { OMKOSTNINGSPOST, bygningsomkostningOere } from "../../fleet/facility.js";
import { DEMO_AKTIVER, DEMO_LOKATIONER } from "../../fleet/demo-facility.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";

export default function FacilityStatistik() {
  const { periode } = useFleet();

  const akt = useListe("facility/aktiver", { vindue: "alle", graense: 500, demo: DEMO_AKTIVER });
  const lok = useListe("facility/lokationer", { vindue: "alle", graense: 500, demo: DEMO_LOKATIONER });
  const fej = useListe("facility/fejl", { vindue: "alle", graense: 500 });
  const opgaver = useListe("opgaver", { vindue: "alle", graense: 500, demo: DEMO_OPGAVER });
  /* ⚠ EN NODE DER SELV ER EN POST — se usePost.js's egen note om
     `godkendelsesregler`. facility/omkostning er ét objekt pr. tenant, ikke
     en liste; `node = null, id = "facility/omkostning"`. */
  const omkostning = usePost(null, "facility/omkostning");

  const henterNoget = akt.henter || lok.henter || fej.henter || opgaver.henter || omkostning.henter;
  if (henterNoget) return <Henter hvad="Facility-statistikken" />;
  if (blokerer(akt.tilstand)) {
    return <Datatilstand tilstand={akt.tilstand} genprov={akt.genindlaes} />;
  }

  const facilityopgaver = opgaver.data.filter((o) => o.art === "facility");
  const iPeriode = (ms) => Number.isFinite(ms) && ms >= periode.fra && ms < periode.til;
  const opgaverIPerioden = facilityopgaver.filter((o) => iPeriode(o.startMs));
  const aabneFejl = fej.data.filter((f) => f.status !== "udbedret");

  const serviceomkostningOere = opgaverIPerioden
    .reduce((sum, o) => sum + (Number.isFinite(o.beloebOere) ? o.beloebOere : 0), 0);

  const lokNavn = (id) => lok.data.find((l) => l.id === id)?.navn || "—";
  const aktivNavn = (id) => akt.data.find((a) => a.id === id)?.navn || id;

  const pr_aktiv = new Map();
  for (const o of opgaverIPerioden) {
    if (!o.aktivId) continue;
    const r = pr_aktiv.get(o.aktivId) || { antal: 0, oere: 0 };
    r.antal += 1;
    r.oere += Number.isFinite(o.beloebOere) ? o.beloebOere : 0;
    pr_aktiv.set(o.aktivId, r);
  }
  const topAnlaeg = [...pr_aktiv.entries()]
    .map(([aktivId, r]) => ({ aktivId, ...r }))
    .sort((a, b) => b.antal - a.antal)
    .slice(0, 5);

  const omkostningPost = omkostning.post || {};
  const harOmkostning = Object.keys(omkostningPost).length > 0;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={FACILITY_FANER} />

      <Kort titel="Statistik">
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          Perioden er <b>{dato(periode.fra)} – {dato(periode.til - 1)}</b> ({num(periode.dage)} dage) —
          shellens eget periodevalg øverst, ikke en ny vælger her.
        </p>

        <KpiRaekke>
          <KpiKort label="Aktiver i drift" vaerdi={num(akt.data.filter((a) => a.status === "idrift").length)}
                   note="af de hentede" />
          <KpiKort label="Servicebesøg" vaerdi={num(opgaverIPerioden.length)} note="startet i perioden" />
          <KpiKort label="Serviceomkostning" vaerdi={kr(serviceomkostningOere)} note="perioden, ekskl. moms" />
          <KpiKort label="Åbne fejl" vaerdi={num(aabneFejl.length)} note="alt der ikke er udbedret" />
        </KpiRaekke>
      </Kort>

      <Kort titel="Anlæg med flest servicebesøg i perioden">
        <Tabel
          kolonner={[
            { key: "aktivId", label: "Anlæg", render: (r) => <b>{aktivNavn(r.aktivId)}</b> },
            { key: "lokation", label: "Lokation", render: (r) => {
                const a = akt.data.find((x) => x.id === r.aktivId);
                return a ? lokNavn(a.lokationId) : "—";
              } },
            { key: "antal", label: "Servicebesøg", num: true, render: (r) => num(r.antal) },
            { key: "oere", label: "Omkostning", num: true, render: (r) => kr(r.oere) },
          ]}
          raekker={topAnlaeg}
          noegle={(r) => r.aktivId}
          tom="Ingen servicebesøg med et tilknyttet anlæg i perioden."
        />
      </Kort>

      <Kort titel="Bygningsomkostninger">
        {!harOmkostning ? (
          <p className="fc-hint">
            Ingen registreret endnu. Kræver <code>facility.skriv</code> at oprette —
            se Opsætning.
          </p>
        ) : (
          <>
            <Tabel
              kolonner={[
                { key: "post", label: "Post" },
                { key: "beloeb", label: "Beløb", num: true, render: (r) => kr(r.beloeb) },
              ]}
              raekker={Object.entries(OMKOSTNINGSPOST).map(([k2, label]) => ({
                post: label, beloeb: omkostningPost[k2] || 0,
              }))}
              noegle={(r) => r.post}
              tom=""
            />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              I alt <b>{kr(bygningsomkostningOere(omkostningPost))}</b>. ⚠ Dette er de{" "}
              <b>seneste registrerede</b> tal, ikke en sum for perioden ovenfor —
              noden har ingen tidsdimension endnu.
            </p>
          </>
        )}
      </Kort>
    </div>
  );
}
