import { useEffect, useMemo, useState } from "react";
import { beregnHitrate } from "../../fleet/ejer-kommunikation-regler.js";
import { crmMuligheder, crmVirksomhedsliste } from "../../fleet/ejer-crm.js";
import { hentSalgsplatform } from "../../fleet/ejer-salgsindbakke.js";
import { kr } from "../../fleet/format.js";
import { useEjerData } from "./EjerDataContext.jsx";
import EjerIkon from "./EjerIkon.jsx";

const liste = (objekt) => Object.entries(objekt || {}).map(([id, post]) => ({ id, ...post }));

export default function EjerRapporter() {
  const { crm, tilbud, henter } = useEjerData();
  const [kommunikation, setKommunikation] = useState(null);
  useEffect(() => { hentSalgsplatform().then(setKommunikation); }, []);
  const virksomheder = useMemo(() => crmVirksomhedsliste(crm), [crm]);
  const muligheder = useMemo(() => crmMuligheder(crm), [crm]);
  const hitrate = beregnHitrate(muligheder);
  const aabne = muligheder.filter((m) => !["vundet", "tabt"].includes(m.fase));
  const pilot = muligheder.filter((m) => m.fase === "demo" || m.pilotFra || m.pilotTil);
  const tilbudsliste = liste(tilbud);
  const traade = liste(kommunikation?.traade);
  const support = traade.filter((t) => t.sagstype === "support");
  const ubesvarede = traade.filter((t) => t.status === "afventer_os");
  const pipelineOere = aabne.reduce((sum, m) => sum + Number(m.maanedligVaerdiOere || 0), 0);
  if (henter || !crm || !kommunikation) return <div className="fc-empty">Henter rapportgrundlag…</div>;
  return <div className="ejer-rapporter">
    <p className="ejer-infoboks"><EjerIkon navn="info" size={18}/> Rapporten bruger kun lokale, syntetiske reviewdata. Microsoft 365, OpenAI og Dinero er ikke tilsluttet.</p>
    <div className="ejer-kpi-ribbon">
      <div className="ejer-kpi"><span className="ejer-ikonfelt"><EjerIkon navn="pipeline"/></span><p><small>Hitrate · afsluttede</small><b>{hitrate.procent === null ? "Ukendt" : `${hitrate.procent.toLocaleString("da-DK")} %`}</b></p></div>
      <div className="ejer-kpi"><span className="ejer-ikonfelt"><EjerIkon navn="chart"/></span><p><small>Åben månedsværdi</small><b>{kr(pipelineOere)}</b></p></div>
      <div className="ejer-kpi"><span className="ejer-ikonfelt"><EjerIkon navn="document"/></span><p><small>Tilbud</small><b>{tilbudsliste.length}</b></p></div>
      <div className="ejer-kpi"><span className="ejer-ikonfelt"><EjerIkon navn="mail"/></span><p><small>Afventer vores svar</small><b>{ubesvarede.length}</b></p></div>
    </div>
    <div className="ejer-rapport-grid">
      <section className="ejer-design-kort"><h2>Salg og pilotforløb</h2><dl className="ejer-rapport-definitioner"><div><dt>Virksomheder i CRM</dt><dd>{virksomheder.length}</dd></div><div><dt>Åbne muligheder</dt><dd>{aabne.length}</dd></div><div><dt>Vundne / afsluttede</dt><dd>{hitrate.vundet} / {hitrate.afsluttede}</dd></div><div><dt>Pilotforløb</dt><dd>{pilot.length}</dd></div></dl><p className="fc-hint">Hitrate beregnes kun som vundne divideret med vundne plus tabte. Åbne muligheder påvirker ikke tallet.</p></section>
      <section className="ejer-design-kort"><h2>Mail og support</h2><dl className="ejer-rapport-definitioner"><div><dt>Fælles sager</dt><dd>{traade.filter((t) => t.delingsstatus === "delt").length}</dd></div><div><dt>Supportsager</dt><dd>{support.length}</dd></div><div><dt>Support afventer os</dt><dd>{support.filter((t) => ["ny", "triage", "afventer_os"].includes(t.support?.status)).length}</dd></div><div><dt>Kræver klassifikation</dt><dd>{traade.filter((t) => t.kraeverKlassifikationsgennemgang).length}</dd></div></dl><p className="fc-hint">Ansvarlig styrer arbejdsfordeling, ikke hvem af de godkendte ejere der kan se en delt kundesag.</p></section>
    </div>
  </div>;
}
