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
import {
  FAKTURAKONTROL_MODEL as EKSTRA_KONTROL_MODEL,
  FAKTURAKONTROL_MODULER,
} from "../../fleet/fakturacenter-kontrol.js";
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
  const [regler, setRegler] = useState(() => Object.fromEntries(
    FAKTURAKONTROL_MODULER.map((modul) => [modul, {
      model: EKSTRA_KONTROL_MODEL.ingen, graense: "", kontrollantUid: "",
    }]),
  ));
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
      setRegler(Object.fromEntries(FAKTURAKONTROL_MODULER.map((modul) => {
        const regel = opsaetning.moduler?.[modul] || {};
        return [modul, {
          model: regel.model || EKSTRA_KONTROL_MODEL.ingen,
          graense: Number.isSafeInteger(regel.graenseNettoOere)
            ? new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              .format(regel.graenseNettoOere / 100) : "",
          kontrollantUid: regel.kontrollantUid || "",
        }];
      })));
      setRevision(Number(opsaetning.revision || 0));
      setTilstand("klar");
      setBesked(null);
    })();
    return () => { aktiv = false; };
  }, []);

  const opdatérRegel = (modul, felt, værdi) => setRegler((nuværende) => ({
    ...nuværende, [modul]: { ...nuværende[modul], [felt]: værdi },
  }));

  const parseGraenseOere = (graense) => {
    const normaliseret = graense.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const tal = Number(normaliseret);
    return Number.isFinite(tal) && tal >= 0 ? Math.round(tal * 100) : null;
  };

  const gem = async () => {
    const moduler = Object.fromEntries(FAKTURAKONTROL_MODULER.map((modul) => {
      const regel = regler[modul];
      return [modul, {
        model: regel.model,
        graenseNettoOere: regel.model === EKSTRA_KONTROL_MODEL.overBeloeb
          ? parseGraenseOere(regel.graense) : null,
        kontrollantUid: regel.model === EKSTRA_KONTROL_MODEL.ingen
          ? null : regel.kontrollantUid,
      }];
    }));
    const ugyldigGraense = FAKTURAKONTROL_MODULER.find((modul) =>
      moduler[modul].model === EKSTRA_KONTROL_MODEL.overBeloeb
      && moduler[modul].graenseNettoOere == null);
    if (ugyldigGraense) return setBesked(`Angiv en gyldig nettogrænse for ${ugyldigGraense.toUpperCase()}.`);
    const udenKontrollant = FAKTURAKONTROL_MODULER.find((modul) =>
      moduler[modul].model !== EKSTRA_KONTROL_MODEL.ingen && !moduler[modul].kontrollantUid);
    if (udenKontrollant) return setBesked(`Udpeg en anden godkender for ${udenKontrollant.toUpperCase()}.`);
    setTilstand("gemmer");
    setBesked(null);
    const svar = await gemFakturacenterOpsaetning({
      forventetRevision: revision,
      opsaetning: { version: 2, moduler },
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
          Reglerne gælder fakturakontrol og er adskilt fra PROCUREs ordregodkendelser.
          Nettogrænsen beregnes pr. berørt modul ekskl. moms. Hvert modul kan
          have sin egen navngivne anden godkender.
        </p>
        <div className="fic-module-rules">
          {FAKTURAKONTROL_MODULER.map((modul) => {
            const regel = regler[modul];
            const låst = !måAdministrere || tilstand === "henter" || tilstand === "gemmer";
            return <fieldset key={modul} className="fic-module-rule" disabled={låst}>
              <legend>{modul.toUpperCase()}</legend>
              <label className="fic-settings-field"><span>Kontrol</span>
                <select value={regel.model}
                  onChange={(event) => opdatérRegel(modul, "model", event.target.value)}>
                  <option value={EKSTRA_KONTROL_MODEL.ingen}>Ingen ekstra kontrol</option>
                  <option value={EKSTRA_KONTROL_MODEL.overBeloeb}>Over nettogrænse</option>
                  <option value={EKSTRA_KONTROL_MODEL.alle}>Alle fakturaer</option>
                </select>
              </label>
              <label className="fic-settings-field"><span>Nettogrænse ekskl. moms</span>
                <input type="text" inputMode="decimal" placeholder="Fx 25.000,00 kr."
                  value={regel.graense}
                  onChange={(event) => opdatérRegel(modul, "graense", event.target.value)}
                  disabled={låst || regel.model !== EKSTRA_KONTROL_MODEL.overBeloeb} />
              </label>
              <label className="fic-settings-field"><span>Anden godkender</span>
                <select value={regel.kontrollantUid}
                  onChange={(event) => opdatérRegel(modul, "kontrollantUid", event.target.value)}
                  disabled={låst || regel.model === EKSTRA_KONTROL_MODEL.ingen}>
                  <option value="">Vælg navngiven bruger</option>
                  {muligeKontrollanter.map((post) => <option key={post.id} value={post.id}>
                    {post.navn || post.email || post.id} · {post.rolle}
                  </option>)}
                </select>
              </label>
            </fieldset>;
          })}
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
