/* Opsætning → Generelt indeholder kun fælles virksomhedsindstillinger.
 * Ressourceregistre, kategorier, typer og priser har egne indgange. */
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { miljoe } from "../../firebase.js";
import { ALLE_MODULER, harModul } from "../../fleet/moduler.js";
import { num } from "../../fleet/format.js";
import {
  Kort, Pille, Gitter, MiniLinje, Knap, KpiKort, KpiRaekke, Ikon,
} from "../../fleet/ui.jsx";

const MILJOE_TONE = {
  prod: { tone: "bad", label: "Produktion" },
  dev: { tone: "ok", label: "Udvikling" },
  demo: { tone: "info", label: "Demo" },
};

export default function Generelt() {
  const { tenantId, tenant, tenants, dage, moduler } = useFleet();
  const aktiveModuler = ALLE_MODULER.filter((modul) => harModul(moduler, modul));
  const aktivtMiljoe = MILJOE_TONE[miljoe] || { tone: "warn", label: String(miljoe) };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Virksomhed" vaerdi={tenant?.navn || tenantId}
                 ikon={<Ikon navn="bygning" />} tone="ikon-5" rund
                 note={`tenant-id: ${tenantId}`} />
        <KpiKort label="Moduler" vaerdi={num(aktiveModuler.length)}
                 ikon={<Ikon navn="kasse" />} tone="ikon-2" rund
                 note={moduler ? "aktive moduler" : "ingen moduler-node — kunden har dem alle"} />
        <KpiKort label="Miljø" vaerdi={aktivtMiljoe.label}
                 ikon={<Ikon navn="skjold" />} tone="ikon-4" rund
                 note={`periode: seneste ${num(dage)} dage`} />
      </KpiRaekke>

      <Gitter kolonner="repeat(auto-fit, minmax(300px, 1fr))">
        <Kort titel="Virksomheden">
          <MiniLinje label="Navn" vaerdi={tenant?.navn || "—"} />
          <MiniLinje label="Tenant-id" vaerdi={<code>{tenantId}</code>} />
          <MiniLinje label="Miljø" vaerdi={<Pille tone={aktivtMiljoe.tone}>{aktivtMiljoe.label}</Pille>} />
          <MiniLinje label="Adgang til" vaerdi={`${num(tenants.length)} tenant${tenants.length === 1 ? "" : "s"}`} />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Tenant-id kan ikke ændres her. Det er en del af brugerens adgangstoken
            og afgrænser alle data i sikkerhedsreglerne.
          </p>
        </Kort>

        <Kort titel="Fælles visning">
          <MiniLinje label="Standardperiode" vaerdi={`Seneste ${num(dage)} dage`} />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Periode og øvrige fælles visningsvalg ejes af appens shell. Ressourcer,
            priser og godkendelsesregler vedligeholdes i deres egne områder.
          </p>
          <p className="fc-hint">
            Åbn <Link className="fc-a" to="/opsaetning/ressourcer">Opsætning → Ressourcer</Link>{" "}
            for kategorier, typer og hardware, eller <Link className="fc-a" to="/ressourcer">Ressourcer</Link>{" "}
            for de konkrete registre.
          </p>
        </Kort>
      </Gitter>

      <Kort titel="Virksomhedsoplysninger">
        <p className="fc-hint" style={{ marginTop: 0 }}>
          Det er endnu ikke besluttet, hvilke juridiske virksomhedsoplysninger
          kunden selv må ændre. Derfor er der ingen skjult eller delvist aktiv
          skrivevej til CVR, fakturalogo eller betalingsbetingelser.
        </p>
        <Knap disabled title="Kræver en særskilt produktbeslutning.">
          Redigér virksomhedsoplysninger
        </Knap>
      </Kort>
    </div>
  );
}
