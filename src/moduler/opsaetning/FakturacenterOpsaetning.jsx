import { useEffect, useMemo, useState } from "react";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harPerm, PERM, permsForTenant } from "../../fleet/permissions.js";
import { useListe } from "../../fleet/useListe.js";
import {
  gemFakturacenterOpsaetning,
  hentFakturacenterOpsaetning,
} from "../../fleet/faktura.js";
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
 * Valg af model, nettogrænse og kontrollanter gemmes nu via en callable og
 * håndhæves igen i selve kontrolhandlingen. Der findes ingen localStorage-
 * fallback: er den autentificerede backend ikke tilgængelig, kan valget ikke
 * se ud som gemt. Mailforbindelserne er fortsat deaktiverede.
 */
export default function FakturacenterOpsaetning() {
  const { bruger } = useFleet();
  const måAdministrere = harPerm(bruger?.perms, PERM.brugereSkriv);
  const [model, setModel] = useState(EKSTRA_KONTROL_MODEL.ingen);
  const [graense, setGraense] = useState("");
  const [kontrollanter, setKontrollanter] = useState([]);
  const [revision, setRevision] = useState(0);
  const [tilstand, setTilstand] = useState("henter");
  const [besked, setBesked] = useState(null);

  const { data: brugere = [] } = useListe("brugere", {
    vindue: "alle", graense: 200, demo: [],
    sorter: (a, b) => (a.navn || "").localeCompare(b.navn || "", "da"),
  });
  const { data: roller = [] } = useListe("roller", { vindue: "alle", demo: [] });
  const rolleNode = useMemo(() => Object.fromEntries(
    roller.map((rolle) => [rolle.id, { perms: rolle.perms || [] }]),
  ), [roller]);
  const muligeKontrollanter = useMemo(() => brugere.filter((post) =>
    post.spaerret !== true
      && permsForTenant(post.rolle, rolleNode).includes(PERM.fakturaerGodkend)),
  [brugere, rolleNode]);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const svar = await hentFakturacenterOpsaetning();
      if (!aktiv) return;
      if (!svar.ok) {
        setTilstand("fejl");
        setBesked(svar.besked);
        return;
      }
      const opsaetning = svar.data?.opsaetning || {};
      setModel(opsaetning.model || EKSTRA_KONTROL_MODEL.ingen);
      setGraense(Number.isSafeInteger(opsaetning.graenseNettoOere)
        ? new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          .format(opsaetning.graenseNettoOere / 100)
        : "");
      setKontrollanter(opsaetning.kontrollantUids || []);
      setRevision(Number(opsaetning.revision || 0));
      setTilstand("klar");
      setBesked(null);
    })();
    return () => { aktiv = false; };
  }, []);

  const skiftKontrollant = (uid) => setKontrollanter((valgte) =>
    valgte.includes(uid) ? valgte.filter((id) => id !== uid) : [...valgte, uid]);

  const parseGraenseOere = () => {
    const normaliseret = graense.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const tal = Number(normaliseret);
    return Number.isFinite(tal) && tal >= 0 ? Math.round(tal * 100) : null;
  };

  const gem = async () => {
    const graenseNettoOere = model === EKSTRA_KONTROL_MODEL.overBeloeb ? parseGraenseOere() : null;
    if (model === EKSTRA_KONTROL_MODEL.overBeloeb && graenseNettoOere == null) {
      setBesked("Angiv en gyldig beløbsgrænse ekskl. moms.");
      return;
    }
    if (model !== EKSTRA_KONTROL_MODEL.ingen && kontrollanter.length === 0) {
      setBesked("Udpeg mindst én ekstra kontrollant, før funktionen aktiveres.");
      return;
    }
    setTilstand("gemmer");
    setBesked(null);
    const svar = await gemFakturacenterOpsaetning({
      forventetRevision: revision,
      opsaetning: { model, graenseNettoOere, kontrollantUids: kontrollanter },
    });
    if (!svar.ok) {
      setTilstand("fejl");
      setBesked(svar.besked);
      return;
    }
    setRevision(Number(svar.data?.opsaetning?.revision ?? revision + 1));
    setTilstand("klar");
    setBesked("Opsætningen er gemt og håndhæves på serveren.");
  };

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
              disabled={!måAdministrere || tilstand === "henter" || tilstand === "gemmer"}>
              <option value={EKSTRA_KONTROL_MODEL.ingen}>Ingen ekstra kontrol</option>
              <option value={EKSTRA_KONTROL_MODEL.alle}>Ekstra kontrol af alle fakturaer</option>
              <option value={EKSTRA_KONTROL_MODEL.overBeloeb}>Ekstra kontrol over beløbsgrænse</option>
            </select>
          </label>
          <label className="fic-settings-field">
            <span>Beløbsgrænse ekskl. moms</span>
            <input type="text" inputMode="decimal" placeholder="Fx 25.000,00 kr."
              value={graense} onChange={(event) => setGraense(event.target.value)}
              disabled={!måAdministrere || tilstand === "henter" || tilstand === "gemmer"
                || model !== EKSTRA_KONTROL_MODEL.overBeloeb} />
          </label>
          <fieldset className="fic-settings-field fic-reviewer-field" disabled={!måAdministrere
            || tilstand === "henter" || tilstand === "gemmer" || model === EKSTRA_KONTROL_MODEL.ingen}>
            <legend>Udpegede ekstra kontrollanter</legend>
            {muligeKontrollanter.length ? muligeKontrollanter.map((post) => (
              <label key={post.id} className="fic-reviewer-choice">
                <input type="checkbox" checked={kontrollanter.includes(post.id)}
                  onChange={() => skiftKontrollant(post.id)} />
                <span>{post.navn || post.email || post.id}<small>{post.rolle}</small></span>
              </label>
            )) : <span className="fc-hint">Ingen aktive brugere med rettigheden fakturaer.godkend.</span>}
          </fieldset>
        </div>
        <div className="fc-formular-knapper" style={{ marginTop: 14 }}>
          <button type="button" className="fic-primary" onClick={gem}
            disabled={!måAdministrere || tilstand === "henter" || tilstand === "gemmer"}>
            {tilstand === "gemmer" ? "Gemmer …" : "Gem kontrolopsætning"}
          </button>
        </div>
        <p className="fc-hint" role="status" aria-live="polite" style={{ marginTop: 12 }}>
          {besked || (tilstand === "henter" ? "Henter autoritativ opsætning …"
            : måAdministrere
              ? "Kun udpegede brugere kan udføre ekstra kontrol. Egen ekstra godkendelse afvises på serveren."
              : "Du kan se opsætningen, men ændring kræver adgang til brugeradministration.")}
        </p>
      </Kort>

      <Kort titel="Mail og forbindelser">
        <MailForbindelserPanel veyroMail={DEMO_VEYRO_MAIL} mailbox={DEMO_MAILBOX} />
      </Kort>
    </div>
  );
}
