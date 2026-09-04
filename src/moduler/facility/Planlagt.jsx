/* src/moduler/facility/Planlagt.jsx
 * Facility – Planlagt. Facility TARGET-restrukturering (produktejer-review
 * 2026-09-02) — se fleet/modulfaner.js's FACILITY_FANER og
 * docs/product-redesign-v1/07_OLD_CURRENT_TARGET_FLEET_FACILITY_PROCURE_UNITBOOKING.md's
 * Facility-afsnit, punkt 4: "ny, ren afledt visning (filtrér samme
 * opgaveliste på status + sortér efter næste-service-dato) — ingen ny
 * datamodel."
 *
 * ⚠ SAMME OPGAVER SOM Servicekalender.jsx OG Overblik.jsx LÆSER — kun et
 * andet udsnit og en anden sortering. Ingen egen node, intet nyt filter der
 * kan komme til at være uenig med de to andre skærme om hvad "planlagt"
 * betyder: `status === "planlagt" || status === "igang"`, samme to statusser
 * Fleets driftstal() bruger.
 */
import { useState } from "react";
import { kr, num, datoTid } from "../../fleet/format.js";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, Kpiadgang, ModulNav,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { OPGAVE_STATUS } from "../../fleet/opgaver.js";
import { FACILITY_FANER } from "../../fleet/modulfaner.js";
import Besoegspanel from "../../fleet/Besoegspanel.jsx";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
import { DEMO_AKTIVER, DEMO_LOKATIONER } from "../../fleet/demo-facility.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

export default function FacilityPlanlagt() {
  const { tilstand, genindlaes, utilgaengelige } = useKpi();
  const { bruger } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.opgaverSkriv);

  const felles = { vindue: "alle", graense: 500 };
  const lok = useListe("facility/lokationer", { ...felles, demo: DEMO_LOKATIONER });
  const akt = useListe("facility/aktiver", { ...felles, demo: DEMO_AKTIVER });
  const leverandoerer = useListe("leverandoerer", { ...felles, graense: 200, demo: DEMO_LEVERANDOERER });
  const opgaver = useListe("opgaver", {
    ordnPaa: "startMs", vindue: "fremad", vindueDage: 120, fremDage: 365,
    graense: 500, demo: DEMO_OPGAVER,
  });

  const [detaljerId, setDetaljerId] = useState(null);

  const lokNavn = (id) => lok.data.find((l) => l.id === id)?.navn || "";
  const lvNavn = (id) => leverandoerNavn(leverandoerer.data, id);

  const henterNoget = opgaver.henter || akt.henter || lok.henter;
  if (henterNoget) return <Henter hvad="planlagte servicebesøg" />;
  if (blokerer(opgaver.tilstand)) {
    return <Datatilstand tilstand={opgaver.tilstand} genprov={opgaver.genindlaes} />;
  }
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  const facilityopgaver = opgaver.data.filter((o) => o.art === "facility");
  /* ⚠ SAMME TO STATUSSER SOM driftstal() BRUGER TIL "planlagt" — se
     fleet/driftskalender.js. Et servicebesøg der afventer eller er udført
     hører ikke til her; det er en tilstand nogen allerede har taget stilling
     til, ikke noget der venter på at blive planlagt eller udført. */
  const planlagte = facilityopgaver
    .filter((o) => o.status === "planlagt" || o.status === "igang")
    .sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity));

  const valgt = facilityopgaver.find((o) => o.id === detaljerId) || null;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={FACILITY_FANER} />
      <Kpiadgang utilgaengelige={utilgaengelige} />
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel={`Planlagte og igangværende servicebesøg (${num(planlagte.length)})`}>
        <Tabel
          kolonner={[
            { key: "startMs", label: "Start", render: (r) => datoTid(r.startMs) },
            { key: "hvad", label: "Anlæg/lokation", render: (r) => (
                <b>{r.aktivId ? (akt.data.find((a) => a.id === r.aktivId)?.navn || r.aktivId)
                                : (lokNavn(r.lokationId) || r.lokationId)}</b>
              ) },
            { key: "beskrivelse", label: "Beskrivelse" },
            { key: "leverandoerId", label: "Udføres af",
              render: (r) => (r.leverandoerId ? lvNavn(r.leverandoerId) : "eget personale") },
            { key: "status", label: "Status", render: (r) => (
                <Pille tone={OPGAVE_STATUS[r.status]?.pill}>{OPGAVE_STATUS[r.status]?.label || r.status}</Pille>
              ) },
            { key: "beloebOere", label: "Estimat", num: true, render: (r) => kr(r.beloebOere) },
            { key: "h", label: "", render: (r) => (
                <button type="button" className="fc-a"
                        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit" }}
                        onClick={() => setDetaljerId(r.id)}>
                  Detaljer
                </button>
              ) },
          ]}
          raekker={planlagte}
          noegle={(r) => r.id}
          tom="Ingen planlagte eller igangværende servicebesøg."
        />
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Fuld kalender og oprettelse af nye besøg ligger i{" "}
          <b>Service &amp; reparation</b>. Denne liste er et rent afledt udsnit
          af samme <code>opgaver</code>-node — ingen ny datamodel.
        </p>
      </Kort>

      {valgt && (
        <Besoegspanel
          besoeg={valgt} lvNavn={lvNavn} lokNavn={lokNavn} aktiver={akt.data}
          maaSkrive={maaSkrive}
          onSkiftet={() => opgaver.genindlaes()}
          onLuk={() => setDetaljerId(null)}
        />
      )}
    </div>
  );
}
