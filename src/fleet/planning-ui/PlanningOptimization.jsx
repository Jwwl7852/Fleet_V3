import { useMemo, useState } from "react";
import {
  OPTIMERINGSPROFILER, opretHjemmeplejeScenarie, opretLokaltPuljeScenarie,
  opretTransportScenarie, optimerDagsplan,
} from "../planning-optimization/index.js";

const SCENARIER = Object.freeze({ HJEMMEPLEJE: "HJEMMEPLEJE", TRANSPORT: "TRANSPORT", LOKAL: "LOKAL" });
const VAEGTEFELTER = [
  ["rejsetid", "Rejsetid"], ["afstand", "Afstand"], ["arbejdsbalance", "Arbejdsbalance"],
  ["koeretoejer", "Færre køretøjer"], ["kontinuitet", "Kontinuitet"],
];
const tid = (ms) => Number.isFinite(ms) ? new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(ms) : "—";
const km = (meter) => `${(meter / 1000).toLocaleString("da-DK", { maximumFractionDigits: 1 })} km`;
const klon = (v) => structuredClone(v);
const synligeFund = (fund = []) => fund.filter((post, indeks) => fund.findIndex((andet) => andet.kode === post.kode) === indeks);

function jobFor(scenarie, pulje) {
  if (scenarie === SCENARIER.TRANSPORT) return opretTransportScenarie();
  if (scenarie === SCENARIER.LOKAL) return opretLokaltPuljeScenarie(pulje);
  return opretHjemmeplejeScenarie();
}

function Kpi({ label, foer, efter, format = (v) => v }) {
  return <article className="po-kpi"><span>{label}</span><div><small>Før</small><strong>{format(foer)}</strong></div><b aria-hidden="true">→</b><div><small>Efter</small><strong>{format(efter)}</strong></div></article>;
}

export default function PlanningOptimization({ planlaegningspulje = [] }) {
  const [scenarie, setScenarie] = useState(SCENARIER.HJEMMEPLEJE);
  const standardJob = useMemo(() => jobFor(scenarie, planlaegningspulje), [scenarie, planlaegningspulje]);
  const [vaegte, setVaegte] = useState(() => klon(OPTIMERINGSPROFILER.HJEMMEPLEJE.vaegte));
  const [resultat, setResultat] = useState(null);
  const vaelgScenarie = (id) => {
    const profil = id === SCENARIER.TRANSPORT ? OPTIMERINGSPROFILER.TRANSPORT : OPTIMERINGSPROFILER.HJEMMEPLEJE;
    setScenarie(id); setVaegte(klon(profil.vaegte)); setResultat(null);
  };
  const koer = () => setResultat(optimerDagsplan({ ...standardJob, profil: { ...standardJob.profil, vaegte: klon(vaegte) } }));
  const nulstil = () => { const profil = scenarie === SCENARIER.TRANSPORT ? OPTIMERINGSPROFILER.TRANSPORT : OPTIMERINGSPROFILER.HJEMMEPLEJE; setVaegte(klon(profil.vaegte)); setResultat(null); };
  const efter = resultat?.maalinger?.efter;
  const foer = resultat?.maalinger?.foer;
  const medarbejdernavn = (reference) => standardJob.ressourcer.medarbejdere.find((post) => post.reference.id === reference?.id)?.visningsnavn || reference?.id;
  const koeretoejsnavn = (reference) => standardJob.ressourcer.koeretoejer.find((post) => post.reference.id === reference?.id)?.visningsnavn || reference?.id;
  return <div className="pu-view po-view" data-view="optimering">
    <div className="pu-view-title"><div><span className="pu-eyebrow">Deterministisk lokal heuristik</span><h1>Optimering</h1><p>Fordel opgaver og beregn rutefølge med et eksplicit syntetisk rejsetidsgrundlag.</p></div><div className="pi-inline-actions"><button className="pu-btn pu-btn-quiet" type="button" onClick={nulstil}>Nulstil lokalt</button><button className="pu-btn pu-btn-primary" type="button" onClick={koer}>Optimér dagsplan</button></div></div>
    <div className="po-notices"><span className="pu-badge" data-tone="demo">Syntetisk rejsetidsmatrix</span><strong>Bedste fundne plan – globalt optimum er ikke bevist.</strong><span>Resultatet er en kladde og bliver hverken gemt eller frigivet.</span></div>
    <section className="pu-card po-controls" aria-label="Optimeringsgrundlag">
      <div className="pu-segmented pu-wide">{[[SCENARIER.HJEMMEPLEJE, "Hjemmepleje-demo"], [SCENARIER.TRANSPORT, "Transport-demo"], [SCENARIER.LOKAL, `Lokal planlægningspulje (${planlaegningspulje.length})`]].map(([id, label]) => <button key={id} type="button" aria-pressed={scenarie === id} onClick={() => vaelgScenarie(id)}>{label}</button>)}</div>
      <div className="po-summary"><span><small>Opgaver</small><strong>{standardJob.planlaegningspulje.length}</strong></span><span><small>Medarbejdere</small><strong>{standardJob.ressourcer.medarbejdere.length}</strong></span><span><small>Køretøjer</small><strong>{standardJob.ressourcer.koeretoejer.length}</strong></span><span><small>Profil</small><strong>{standardJob.profil.navn}</strong></span><span><small>Jobstatus</small><strong>{resultat?.status || "Klar til beregning"}</strong></span></div>
      <fieldset className="po-weights"><legend>Redigér præferencevægte</legend>{VAEGTEFELTER.map(([id, label]) => <label key={id}>{label}<input aria-label={`Vægt for ${label}`} type="range" min="0" max="15" value={vaegte[id]} onChange={(event) => { setVaegte((nu) => ({ ...nu, [id]: Number(event.target.value) })); setResultat(null); }} /><output>{vaegte[id]}</output></label>)}</fieldset>
    </section>
    {!resultat && <section className="pu-card po-empty"><span aria-hidden="true">↝</span><h2>Klar til lokal beregning</h2><p>Tryk på <strong>Optimér dagsplan</strong>. Ruterne beregnes af den samme generiske motor for begge scenarier.</p></section>}
    {resultat?.status === "UGYLDIG" && <section className="pu-card po-error"><h2>Inputtet kunne ikke beregnes</h2>{resultat.fund.map((fund, indeks) => <p key={`${fund.kode}-${indeks}`}><strong>{fund.kode}</strong> · {fund.tekst}</p>)}</section>}
    {foer && efter && <>
      <section className="po-kpis" aria-label="Før- og eftermålinger">
        <Kpi label="Planlagte opgaver" foer={foer.planlagteOpgaver} efter={efter.planlagteOpgaver} />
        <Kpi label="Rejsetid" foer={foer.samletRejsetidMin} efter={efter.samletRejsetidMin} format={(v) => `${v} min.`} />
        <Kpi label="Afstand" foer={foer.samletAfstandMeter} efter={efter.samletAfstandMeter} format={km} />
        <Kpi label="Arbejdsbalance" foer={foer.belastningsspredningMin} efter={efter.belastningsspredningMin} format={(v) => `${v} min.`} />
        <Kpi label="Anvendte køretøjer" foer={foer.anvendteKoeretoejer} efter={efter.anvendteKoeretoejer} />
      </section>
      <div className="po-result-meta"><span>{resultat.antalEvalueringer.toLocaleString("da-DK")} evalueringer</span><span>{resultat.antalForbedringsrunder} forbedringsrunder</span><span>{resultat.operationsgraenseNaaet ? "Operationsgrænse nået" : "Afsluttet inden for operationsgrænsen"}</span></div>
      <section className="po-routes" aria-label="Beregnet dagsplanskladde">{resultat.dagsplanskladde.ruter.map((rute) => <article className="pu-card po-route" key={rute.id}><header><div><span className="pu-eyebrow">Kladde · ikke frigivet</span><h2>{medarbejdernavn(rute.medarbejderRefs[0])}</h2><p>{rute.koeretoejRefs[0] ? koeretoejsnavn(rute.koeretoejRefs[0]) : "Intet køretøj nødvendigt"}</p></div><strong>{tid(rute.fraMs)}–{tid(rute.tilMs)}</strong></header><div className="po-route-totals"><span>{rute.maalinger.samletKoeretidMin} min. kørsel</span><span>{km(rute.maalinger.samletAfstandMeter)}</span><span>{rute.maalinger.samletServiceMin} min. service</span><span>{rute.maalinger.samletVentetidMin} min. ventetid</span></div><ol>{rute.stop.map((stop) => <li key={stop.id} data-multistop={rute.stop.filter((post) => post.sporbarhed.originalOpgaveId === stop.sporbarhed.originalOpgaveId).length > 1}><span>{stop.raekkefoelge}</span><div><strong>{stop.sporbarhed.originalStopId}</strong><small>{stop.sporbarhed.originalOpgaveId} · {stop.koerselFoerMin} min. syntetisk kørsel</small>{stop.udfoerelsessnapshot && <em>Udførelsessnapshot bevaret</em>}</div><dl><div><dt>Ankomst</dt><dd>{tid(stop.forventetAnkomstMs)}</dd></div><div><dt>Servicestart</dt><dd>{tid(stop.serviceStartMs)}</dd></div><div><dt>Afgang</dt><dd>{tid(stop.afgangMs)}</dd></div></dl></li>)}</ol><footer>Retur til slutsted: {rute.maalinger.hjemkoerselMin} min. · syntetisk segment</footer></article>)}</section>
      <section className="pu-card po-unplanned"><div className="pu-card-head"><div><span className="pu-eyebrow">Forklarlig plan</span><h2>Ikke-planlagte opgaver</h2></div><span className="pu-count">{resultat.ikkePlanlagte.length}</span></div>{resultat.ikkePlanlagte.length ? <div>{resultat.ikkePlanlagte.map((post) => <article key={post.blokId}><div><strong>{post.originalOpgaveId}</strong><small>{post.stopIder.length} stop · ikke placeret</small></div><ul>{synligeFund(post.fund).map((fund) => <li key={fund.kode}><code>{fund.kode}</code> {fund.tekst}</li>)}</ul></article>)}</div> : <p>Alle opgaver er planlagt præcis én gang.</p>}</section>
    </>}
  </div>;
}

export { SCENARIER };
