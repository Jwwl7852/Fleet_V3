import { useState } from "react";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  DEMO_MAILBOX,
  DEMO_VEYRO_MAIL,
} from "../../fleet/demo-fakturacenter-intake.js";
import { EKSTRA_KONTROL_MODEL } from "../../fleet/fakturacenter-intake.js";
import { Kort } from "../../fleet/ui.jsx";
import { MailForbindelserPanel } from "../oekonomi/FakturacenterPrototypeDele.jsx";
import "../oekonomi/FakturacenterIntake.css";

/**
 * Fælles opsætningsflade for Fakturacenteret.
 *
 * Ekstra kontrol må ikke aktiveres fra browserlokal tilstand: valg af model,
 * nettogrænse og kontrollanter skal gemmes og håndhæves autoritativt af den
 * senere serverkontrakt. Felterne er derfor en tydeligt mærket kontraktvisning,
 * ikke en skjult demo-aktivering. Mailforbindelserne er fortsat deaktiverede.
 */
export default function FakturacenterOpsaetning() {
  const { bruger } = useFleet();
  const måGodkende = harPerm(bruger?.perms, PERM.fakturaerGodkend);
  const [model, setModel] = useState(EKSTRA_KONTROL_MODEL.ingen);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Ekstra fakturakontrol">
        <p className="fc-hint">
          Beløbsgrænsen beregnes ekskl. moms. Den ekstra kontrollant skal være
          udpeget af kunden og være en anden person end første kontrollant.
        </p>
        <div className="fic-settings-grid">
          <label className="fic-settings-field">
            <span>Kontrolmodel</span>
            <select value={model} onChange={(event) => setModel(event.target.value)}
              disabled={!måGodkende}>
              <option value={EKSTRA_KONTROL_MODEL.ingen}>Ingen ekstra kontrol</option>
              <option value={EKSTRA_KONTROL_MODEL.alle}>Ekstra kontrol af alle fakturaer</option>
              <option value={EKSTRA_KONTROL_MODEL.overBeloeb}>Ekstra kontrol over beløbsgrænse</option>
            </select>
          </label>
          <label className="fic-settings-field">
            <span>Beløbsgrænse ekskl. moms</span>
            <input type="text" inputMode="decimal" placeholder="Fx 25.000,00 kr."
              disabled={!måGodkende || model !== EKSTRA_KONTROL_MODEL.overBeloeb} />
          </label>
          <label className="fic-settings-field">
            <span>Udpegede ekstra kontrollanter</span>
            <input type="text" value="Afventer autoritativ brugeradapter" readOnly />
          </label>
        </div>
        <p className="fc-hint" role="status" style={{ marginTop: 12 }}>
          Denne lokale samling viser den afstemte kontrakt, men aktiverer ikke
          ekstra kontrol. Serverlagring, audit og autorisation skal være på plads,
          før valget kan gemmes. Ingen browserværdi giver rettigheder.
        </p>
      </Kort>

      <Kort titel="Mail og forbindelser">
        <MailForbindelserPanel veyroMail={DEMO_VEYRO_MAIL} mailbox={DEMO_MAILBOX} />
      </Kort>
    </div>
  );
}
