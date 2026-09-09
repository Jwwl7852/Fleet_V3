import { useEffect, useMemo, useRef, useState } from "react";
import {
  LOESNINGSFORSLAGSTATUS, MOBILEVENTTYPE, REFERENCEART, REGELNIVEAU,
  TILDELINGSMETODE, aendrSkabelonStopvarighed, deaktiverSkabelonStop,
  fjernSkabelonStop, flytSkabelonStop, tilfoejSkabelonStop,
} from "../planning-basic-v2.js";
import { opretPlanningUiFixtures } from "./demo-planning-ui.js";
import PlanningIntake, { ExecutionMobilePreview } from "./PlanningIntake.jsx";
import PlanningOptimization from "./PlanningOptimization.jsx";
import PlanningScheduling from "./PlanningScheduling.jsx";
import PlanningCustomerConfirmation from "./PlanningCustomerConfirmation.jsx";
import VeyroLogo from "./VeyroLogo.jsx";
import { DagensDrift, LivekalenderReference, filtrerReferenceRuter, referenceRutenavn } from "./PlanningOperations.jsx";
import { mobilHandlingerFor } from "./planning-ui-copy.js";
import { markerNotifikationLaest, opretDemoPlanlaegning } from "../planning-scheduling/index.js";
import {
  RAEKKEVISNING, VISNING, afvigelsesniveau, afvisForslag,
  anvendGodkendtForslag, beregnSkabelonResume,
  forslagForRute, godkendForslag, minutTilTid, msTilTid,
  nytSkabelonStop, opretSyntetiskMobilevent, redigerForslag,
  ruteDatagrundlag, ruteTidsresume, skiftStandardTildeling,
  synkroniserOfflineEvent,
} from "./planning-ui-model.js";

const NAVIGATION = [
  [VISNING.OVERBLIK, "Dagens drift", "overview"],
  [VISNING.KALENDER, "Livekalender", "calendar"],
  [VISNING.OPGAVER, "Opgaver", "tasks"],
  [VISNING.PLANLAEGNING, "Planlægning", "calendar"],
  [VISNING.OPTIMERING, "Optimering", "route"],
  [VISNING.FASTE_RUTER, "Faste ruter", "repeat"],
  ["ressourcer", "Ressourcer", "people"],
  ["rapporter", "Rapporter", "report"],
  [VISNING.MOBIL, "Mobilvisning", "mobile"],
];
const TYPENAVNE = { service: "Service", hjemmepleje: "Hjemmepleje", transport: "Transport", renovation: "Renovation" };

function opretReferenceFixtures() {
  const fixtures = opretPlanningUiFixtures();
  const afvigelser = { "ui-rute-transport": 8, "ui-rute-service": 27 };
  return { ...fixtures, ruter: fixtures.ruter.map((rute) => ({ ...rute, afvigelseMin: afvigelser[rute.id] || 0 })) };
}

function Statusmaerke({ niveau, children, title }) {
  return <span className="pu-badge" data-tone={niveau} title={title}>{children}</span>;
}

function Ikon({ children }) {
  return <span className="pu-icon" aria-hidden="true">{children}</span>;
}

function DagensOverblik(props) {
  return <DagensDrift {...props} />;
}

function Livekalender(props) {
  return <LivekalenderReference {...props} />;
}

function RuteDetalje({ rute, selectedStopId, medarbejdere, koeretoejer, indstillinger, harForslag, onClose, onForslag }) {
  if (!rute) return null;
  const data = ruteDatagrundlag(rute);
  const resume = ruteTidsresume(rute);
  const mobil = data.senesteMobil;
  const obd = data.senesteObd;
  return (
    <div className="pr-sidepanel-host">
      <aside className="pu-drawer" role="complementary" aria-labelledby="rutedetalje-titel">
        <div className="pu-drawer-head"><div><span className="pu-eyebrow">Rutedetalje</span><h2 id="rutedetalje-titel">{rute.navn}</h2></div><button className="pu-icon-btn" type="button" aria-label="Luk rutedetalje" onClick={onClose}>×</button></div>
        <div className="pu-badge-row"><Statusmaerke niveau={afvigelsesniveau(rute, indstillinger)}>{rute.afvigelseMin > 0 ? "+" : ""}{rute.afvigelseMin} min.</Statusmaerke><Statusmaerke niveau={data.label === "Live OBD" ? "live" : data.label.includes("ikke") ? "stale" : "estimated"}>{data.label}</Statusmaerke>{rute.datakonflikt && <Statusmaerke niveau="konflikt">Mobilstatus og OBD afviger</Statusmaerke>}</div>
        <dl className="pu-detail-grid"><div><dt>Medarbejder</dt><dd>{medarbejdere.find((p) => p.id === rute.medarbejderId)?.navn}</dd></div><div><dt>Køretøj</dt><dd>{koeretoejer.find((b) => b.id === rute.koeretoejId)?.navn || "Intet køretøj"}</dd></div><div><dt>Start / slut</dt><dd>{rute.startsted} → {rute.slutsted}</dd></div><div><dt>Forventet slut</dt><dd>{resume.komplet ? minutTilTid(resume.slutMinut + rute.afvigelseMin) : "Ufuldstændig"}</dd></div></dl>
        <section className="pu-observation-tracks"><h3>Separate dataspor</h3><article><Ikon>▣</Ikon><div><strong>Mobil · arbejdsstatus</strong>{mobil ? <><span>{mobil.type === "ANKOMMET" ? "Ankommet" : "Afgået"} {msTilTid(mobil.mobilTidMs)}</span><small>Syntetisk GPS gemt · {mobil.synkroniseret ? "synkroniseret" : "offline"}</small></> : <span>Ingen mobilhændelse endnu</span>}</div></article><article><Ikon>◎</Ikon><div><strong>OBD · fysisk placering</strong>{obd ? <><span>{data.label} · {msTilTid(obd.tidspunktMs)}</span><small>Historisk observation bevares separat</small></> : <span>Ingen OBD — planlægning fortsætter via mobil og estimat</span>}</div></article></section>
        {rute.datakonflikt && <div className="pu-conflict-callout"><strong>Mobilstatus og OBD afviger</strong><p>Chaufføren har registreret ankomst kl. {msTilTid(mobil?.mobilTidMs)} og mobilens syntetiske GPS-position er gemt. OBD-observationen bekræfter ikke stopzonen. Det er en datakonflikt, ikke et bevis på fejl.</p></div>}
        <div className="pu-stop-list"><h3>Stop og forventning</h3>{rute.stop.map((stop) => <div key={stop.id} data-status={stop.status} data-selected={selectedStopId === stop.id}><span>{stop.status === "gennemfoert" ? "✓" : stop.status === "igang" ? "▶" : "○"}</span><div><strong>{stop.navn}</strong><small>{stop.adresse}</small></div><time>{minutTilTid(stop.planlagtMinut)} <b>→ {minutTilTid(stop.forventetMinut)}</b></time></div>)}</div>
        {harForslag && (afvigelsesniveau(rute, indstillinger) === "kritisk" || rute.datakonflikt) && <button className="pu-btn pu-btn-block" type="button" onClick={() => onForslag(rute.id)}>Åbn løsningsforslag</button>}
      </aside>
    </div>
  );
}

function ForslagPanel({ forslag, selectedStopId, ruter, medarbejdere, koeretoejer, setForslag, setRuter, onClose }) {
  const [valgtId, setValgtId] = useState(forslag[0]?.id || "");
  const [begrundelse, setBegrundelse] = useState("");
  const [besked, setBesked] = useState("");
  const [redigering, setRedigering] = useState(false);
  const valgt = forslag.find((post) => post.id === valgtId) || forslag[0];
  if (!valgt) return null;
  const hard = valgt.regelbrud.some((brud) => brud.niveau === REGELNIVEAU.HARD);
  const opdater = (aendringer) => setForslag((alle) => alle.map((post) => post.id === valgt.id ? redigerForslag(post, aendringer) : post));
  const godkend = () => {
    const resultat = godkendForslag(valgt, { godkendtAf: "demo-disponent", begrundelse });
    if (!resultat.ok) { setBesked(resultat.fejl); return; }
    setForslag((alle) => alle.map((post) => post.id === valgt.id ? resultat.forslag : post));
    const anvendt = anvendGodkendtForslag(ruter, resultat.forslag);
    if (anvendt.anvendt) setRuter(anvendt.ruter);
    setBesked("Demoplanen er opdateret lokalt – intet er sendt eller gemt.");
  };
  const afvis = () => { setForslag((alle) => alle.map((post) => post.id === valgt.id ? afvisForslag(post, begrundelse) : post)); onClose(); };
  const beroertRute = ruter.find((rute) => rute.id === valgt.ruteId);
  const medarbejder = medarbejdere.find((person) => person.id === beroertRute?.medarbejderId);
  const koeretoej = koeretoejer.find((bil) => bil.id === beroertRute?.koeretoejId);
  const valgtStop = beroertRute?.stop.find((stop) => stop.id === selectedStopId) || beroertRute?.stop[0];
  return (
    <div className="pr-sidepanel-host">
      <aside className="pu-drawer pu-proposal" role="complementary" aria-labelledby="forslag-titel">
        <div className="pu-drawer-head"><div><span className="pu-eyebrow">Deterministiske demo-fixtures</span><h2 id="forslag-titel">Forslag til løsning</h2></div><button className="pu-icon-btn" type="button" aria-label="Luk løsningsforslag" onClick={onClose}>×</button></div>
        <div className="pr-proposal-route"><div><Statusmaerke niveau={hard ? "kritisk" : "normal"}>{beroertRute?.afvigelseMin ? `+${beroertRute.afvigelseMin} min` : "Lokal demo"}</Statusmaerke><strong>{beroertRute ? referenceRutenavn(beroertRute) : "Berørt rute"}</strong><small>{medarbejder?.navn?.replace("Demo ", "").replace(" Fiktiv", "") || "Ikke tildelt"} · {koeretoej?.navn.split(" · ")[0] || "Intet køretøj"}</small>{valgtStop && <em>Valgt stop: {valgtStop.navn} · {minutTilTid(valgtStop.forventetMinut)}</em>}</div></div>
        <div className="pu-proposal-tabs">{forslag.map((post, indeks) => <button key={post.id} type="button" aria-pressed={post.id === valgt.id} onClick={() => { setValgtId(post.id); setBesked(""); }}>{indeks + 1}. {post.titel}</button>)}</div>
        <div className="pu-proposal-intro"><Statusmaerke niveau={hard ? "kritisk" : "normal"}>{hard ? "Hårdt regelbrud" : "Gyldigt alternativ"}</Statusmaerke><h3>{valgt.titel}</h3><p>{valgt.forklaring}</p><small>{valgt.datagrundlag} · Ikke solver-output</small></div>
        {hard && <div className="pu-hard-rule"><strong>Kan ikke godkendes</strong><p>{valgt.regelbrud.map((brud) => brud.tekst).join(" · ")}</p></div>}
        {redigering && <div className="pu-form-grid">
          <label>Målrute<select value={valgt.foreslaaedeAendringer[0]?.maalRuteId || ""} onChange={(event) => opdater({ foreslaaedeAendringer: [{ ...valgt.foreslaaedeAendringer[0], maalRuteId: event.target.value }] })}>{ruter.filter((rute) => rute.id !== valgt.ruteId).map((rute) => <option key={rute.id} value={rute.id}>{rute.navn}</option>)}</select></label>
          <label>Forventet forskydning (min.)<input type="number" min="0" max="120" value={valgt.forventetAendringMin} onChange={(event) => opdater({ forventetAendringMin: Number(event.target.value) })} /></label>
          <label className="pu-span-2">Begrundelse<textarea value={begrundelse} onChange={(event) => setBegrundelse(event.target.value)} placeholder="Skriv en lokal demo-begrundelse" /></label>
        </div>}
        <section className="pu-consequence"><h3>Konsekvens</h3><div><span>Berørte stop<strong>{valgt.berørteStopIder.length}</strong></span><span>Ændret kørsel<strong>+{valgt.ekstraKoeretidMin} min.</strong></span><span>Forventet tidsændring<strong>{valgt.forventetAendringMin} min.</strong></span><span>Tidsvinduer<strong>{hard ? "1 brud" : "Ingen hårde brud"}</strong></span></div></section>
        {beroertRute && <section className="pr-proposal-sequence"><h3>Opdateret stoprækkefølge</h3><ol>{beroertRute.stop.slice(0, 4).map((stop, indeks) => <li key={stop.id} data-changed={indeks === 2}><b>{indeks + 1}</b><span><strong>{stop.navn}</strong><small>{minutTilTid(stop.forventetMinut)} · {indeks === 2 ? "Påvirkes af forslaget" : "Uændret"}</small></span></li>)}</ol></section>}
        {besked && <div className="pu-inline-message" role="status">{besked}</div>}
        <div className="pu-drawer-actions"><button className="pu-btn pu-btn-quiet" type="button" aria-pressed={redigering} onClick={() => setRedigering((nu) => !nu)}>Redigér forslag</button><button className="pu-btn pu-btn-quiet" type="button" onClick={afvis}>Afvis</button><button className="pu-btn" type="button" disabled={hard || valgt.status === LOESNINGSFORSLAGSTATUS.GODKENDT} title={hard ? "Forslaget bryder et HARD-krav" : "Kræver disponentgodkendelse"} onClick={godkend}>{valgt.status === LOESNINGSFORSLAGSTATUS.GODKENDT ? "Godkendt" : "Godkend ændring"}</button></div>
        <p className="pr-proposal-footnote">Intet sendes uden disponentens godkendelse. Denne handling er kun lokal demo.</p>
      </aside>
    </div>
  );
}

function FasteRuter({ skabeloner, setSkabeloner, koeretider, setKoeretider, ressourcer, medarbejdere, koeretoejer }) {
  const [valgtId, setValgtId] = useState(skabeloner[0]?.id);
  const [sekvens, setSekvens] = useState(1);
  const valgt = skabeloner.find((skabelon) => skabelon.id === valgtId) || skabeloner[0];
  const opdater = (naeste, nyeKoeretider = null) => {
    setSkabeloner((alle) => alle.map((skabelon) => skabelon.id === valgt.id ? naeste : skabelon));
    if (nyeKoeretider) setKoeretider((alle) => ({ ...alle, [valgt.id]: nyeKoeretider }));
  };
  const resume = beregnSkabelonResume(valgt, koeretider[valgt.id] || [], ressourcer);
  const plan = resume.tidsplan;
  const tildelingsfund = resume.tildeling.fund.filter((fund) => fund.niveau === REGELNIVEAU.HARD);
  const medarbejderRef = medarbejdere.find((person) => ressourcer.some((ressource) => ressource.reference?.id === person.id))?.id || "wf-demo-001";
  const bilRef = koeretoejer.find((bil) => ressourcer.some((ressource) => ressource.reference?.id === bil.id))?.id || "fleet-demo-001";
  const tilfoej = () => {
    const naeste = tilfoejSkabelonStop(valgt, nytSkabelonStop(valgt, sekvens));
    setSekvens((tal) => tal + 1);
    opdater(naeste, [...(koeretider[valgt.id] || []), 9]);
  };
  return (
    <div className="pu-view" data-view="faste-ruter">
      <div className="pu-view-title"><div><span className="pu-eyebrow">Versionsbundne skabeloner</span><h1>Faste ruter</h1><p>Redigering foregår kun i lokal tilstand. En genindlæsning gendanner fixtures.</p></div><button className="pu-btn" type="button" onClick={tilfoej}>+ Tilføj stop</button></div>
      <div className="pu-template-layout">
        <aside className="pu-template-nav" aria-label="Ruteskabeloner">{skabeloner.map((skabelon) => <button key={skabelon.id} type="button" aria-pressed={skabelon.id === valgt.id} onClick={() => setValgtId(skabelon.id)}><span>{skabelon.navn}</span><small>{TYPENAVNE[skabelon.rutetype] || skabelon.rutetype} · version {skabelon.version}</small></button>)}</aside>
        <section className="pu-card pu-template-editor">
          <div className="pu-card-head"><div><span className="pu-eyebrow">Version {valgt.version} · {valgt.status}</span><h2>{valgt.navn}</h2></div><Statusmaerke niveau={resume.komplet && !tildelingsfund.length ? "normal" : "kritisk"}>{resume.komplet && !tildelingsfund.length ? "Gyldig lokal beregning" : "Kræver kontrol"}</Statusmaerke></div>
          <dl className="pu-template-meta"><div><dt>Rutetype</dt><dd>{TYPENAVNE[valgt.rutetype] || valgt.rutetype}</dd></div><div><dt>Gyldighed</dt><dd>{valgt.gyldigFra} – {valgt.gyldigTil || "uden slutdato"}</dd></div><div><dt>Gentagelse</dt><dd>{valgt.gentagelse.art}</dd></div><div><dt>Start / slut</dt><dd>{valgt.startLokationRef.id} → {valgt.slutLokationRef.id}</dd></div></dl>
          <div className="pu-assignments">
            <label>Standardmedarbejder<select value={valgt.standardTildeling.medarbejder.metode} onChange={(event) => opdater(skiftStandardTildeling(valgt, REFERENCEART.MEDARBEJDER, event.target.value, { kilde: "workforce", art: "medarbejder", id: medarbejderRef }))}>{Object.values(TILDELINGSMETODE).map((metode) => <option key={metode}>{metode}</option>)}</select></label>
            <label>Standardkøretøj<select value={valgt.standardTildeling.koeretoej.metode} onChange={(event) => opdater(skiftStandardTildeling(valgt, REFERENCEART.KOERETOEJ, event.target.value, { kilde: "fleet", art: "koeretoej", id: bilRef }))}>{Object.values(TILDELINGSMETODE).map((metode) => <option key={metode}>{metode}</option>)}</select></label>
          </div>
          {tildelingsfund.length > 0 && <div className="pu-hard-rule"><strong>Fast tildeling omgår ikke regler</strong><p>{tildelingsfund.map((fund) => fund.tekst).join(" · ")}</p></div>}
          <div className="pu-template-stops"><div className="pu-template-stop pu-template-stop-head"><span>#</span><span>Stop</span><span>Varighed</span><span>Handlinger</span></div>{valgt.stop.map((stop, indeks) => <div className="pu-template-stop" data-inactive={stop.status === "inaktiv"} key={stop.id}><span>{stop.raekkefoelge}</span><div><strong>{stop.uiNavn || stop.id}</strong><small>{stop.uiAdresse || "Fiktiv lokation"} · {stop.status}</small></div><label><span className="pu-sr-only">Varighed for {stop.uiNavn || stop.id}</span><input type="number" min="5" max="180" value={stop.estimeretVarighedMin ?? ""} onChange={(event) => opdater(aendrSkabelonStopvarighed(valgt, stop.id, event.target.value === "" ? null : Number(event.target.value)))} /> min.</label><div><button type="button" className="pu-mini-btn" disabled={indeks === 0} aria-label={`Flyt ${stop.uiNavn || stop.id} op`} onClick={() => opdater(flytSkabelonStop(valgt, stop.id, indeks - 1))}>↑</button><button type="button" className="pu-mini-btn" disabled={indeks === valgt.stop.length - 1} aria-label={`Flyt ${stop.uiNavn || stop.id} ned`} onClick={() => opdater(flytSkabelonStop(valgt, stop.id, indeks + 1))}>↓</button><button type="button" className="pu-mini-btn" onClick={() => opdater(deaktiverSkabelonStop(valgt, stop.id))}>Deaktivér</button><button type="button" className="pu-mini-btn" onClick={() => opdater(fjernSkabelonStop(valgt, stop.id), (koeretider[valgt.id] || []).slice(0, -1))}>Fjern</button></div></div>)}</div>
          <div className="pu-time-summary"><span><small>Samlet kørsel</small><strong>{plan ? `${plan.samletKoeretidMin} min.` : "—"}</strong></span><span><small>Stop/service</small><strong>{plan ? `${plan.samletStoptidMin} min.` : "—"}</strong></span><span><small>Pause</small><strong>{plan ? `${plan.samletPausetidMin} min.` : "—"}</strong></span><span><small>Ventetid</small><strong>{plan ? `${plan.samletVentetidMin} min.` : "—"}</strong></span><span><small>Samlet rutetid</small><strong>{plan?.samletRutetidMin != null ? `${plan.samletRutetidMin} min.` : "Ufuldstændig"}</strong></span><span><small>Forventet slut</small><strong>{plan?.planlagtSlutMs ? msTilTid(plan.planlagtSlutMs) : "—"}</strong></span></div>
          {!resume.komplet && <div className="pu-inline-message" role="status">Der gættes ikke: {resume.mangler.map((mangel) => mangel.id || mangel).join(" · ")}</div>}
        </section>
      </div>
    </div>
  );
}

function Mobilvisning({ ruter, setRuter, medarbejdere, onAabnKalender }) {
  const [medarbejderId, setMedarbejderId] = useState(medarbejdere[0].id);
  const medarbejderRuter = ruter.filter((rute) => rute.medarbejderId === medarbejderId);
  const [valgtRuteId, setValgtRuteId] = useState("");
  const rute = medarbejderRuter.find((post) => post.id === valgtRuteId) || medarbejderRuter[0] || ruter[0];
  const naesteStop = rute.stop[Math.min(rute.gennemfoert, rute.stop.length - 1)];
  const [stopId, setStopId] = useState(naesteStop.id);
  const [offline, setOffline] = useState(false);
  const [besked, setBesked] = useState("");
  const valgteStop = rute.stop.find((stop) => stop.id === stopId) || naesteStop;
  const stophaendelser = [...rute.mobilevents].filter((event) => event.stopforekomstId === valgteStop.id).sort((a, b) => a.mobilTidMs - b.mobilTidMs);
  const senesteLokale = stophaendelser.at(-1);
  const kanStart = !senesteLokale;
  const kanAfgang = senesteLokale?.type === MOBILEVENTTYPE.ANKOMMET;
  const handlinger = mobilHandlingerFor(rute, valgteStop);
  const registrer = (type, konflikt = false) => {
    const event = opretSyntetiskMobilevent({ rute, stopId: valgteStop.id, medarbejderId: rute.medarbejderId, type, offline, indeks: rute.mobilevents.length });
    setRuter((alle) => alle.map((post) => post.id === rute.id ? { ...post, mobilevents: [...post.mobilevents, event], datakonflikt: konflikt || post.datakonflikt, gennemfoert: type === MOBILEVENTTYPE.AFGAAET ? Math.min(post.stop.length, post.gennemfoert + 1) : post.gennemfoert } : post));
    setBesked(`${type === MOBILEVENTTYPE.ANKOMMET ? handlinger.startet : handlinger.afsluttet} – ${msTilTid(event.mobilTidMs)} · syntetisk GPS · ${offline ? "ligger offline" : "synkroniseret"}.`);
  };
  const fremkaldKonflikt = () => {
    const konfliktRute = ruter.find((post) => post.id === "ui-rute-service");
    const stop = konfliktRute.stop[Math.min(konfliktRute.gennemfoert, konfliktRute.stop.length - 1)];
    const event = opretSyntetiskMobilevent({ rute: konfliktRute, stopId: stop.id, medarbejderId: konfliktRute.medarbejderId, type: MOBILEVENTTYPE.ANKOMMET, indeks: konfliktRute.mobilevents.length });
    setRuter((alle) => alle.map((post) => post.id === konfliktRute.id ? { ...post, datakonflikt: true, mobilevents: [...post.mobilevents, event] } : post));
    setBesked("Mobilankomst er registreret, mens den separate OBD-observation er uden for stopzonen.");
  };
  const synkroniser = (eventId) => setRuter((alle) => alle.map((post) => post.id === rute.id ? { ...post, mobilevents: synkroniserOfflineEvent(post.mobilevents, eventId) } : post));
  return (
    <div className="pu-view" data-view="mobil"><div className="pu-view-title"><div><span className="pu-eyebrow">Smal lokal arbejdsgang</span><h1>Mobilvisning</h1><p>Ingen rigtig GPS, baggrundssporing eller ekstern synkronisering.</p></div></div>
      <div className="pu-mobile-workspace">
        <section className="pu-card pu-mobile-controls"><h2>Demosimulator</h2><label>Medarbejder<select value={medarbejderId} onChange={(event) => { setMedarbejderId(event.target.value); setValgtRuteId(""); }}>{medarbejdere.map((person) => <option key={person.id} value={person.id}>{person.navn}</option>)}</select></label><label>Rute<select value={rute.id} onChange={(event) => { setValgtRuteId(event.target.value); const ny = ruter.find((post) => post.id === event.target.value); setStopId(ny.stop[Math.min(ny.gennemfoert, ny.stop.length - 1)].id); }}>{medarbejderRuter.map((post) => <option key={post.id} value={post.id}>{post.navn}</option>)}</select></label><label>Næste stop<select value={valgteStop.id} onChange={(event) => setStopId(event.target.value)}>{rute.stop.map((stop) => <option key={stop.id} value={stop.id}>{stop.navn}</option>)}</select></label><label className="pu-check"><input type="checkbox" checked={offline} onChange={(event) => setOffline(event.target.checked)} /> Simulér forsinket/offline synkronisering</label><button className="pu-btn pu-btn-quiet" type="button" onClick={fremkaldKonflikt}>Fremkald mobil/OBD-uoverensstemmelse</button>{besked && <div className="pu-inline-message" role="status">{besked}</div>}</section>
        <div><section className="pu-phone" aria-label="Mobilprototype"><div className="pu-phone-top"><span>Veyro Planning</span><Statusmaerke niveau={rute.planAendret ? "advarsel" : "normal"}>{rute.planAendret ? "Plan ændret" : "Plan ajour"}</Statusmaerke></div><div className="pu-phone-body"><span className="pu-eyebrow">Næste stop · {rute.navn}</span><h2>{valgteStop.navn}</h2><p>{valgteStop.adresse}</p><div className="pu-mobile-time"><span><small>Planlagt</small><strong>{minutTilTid(valgteStop.planlagtMinut)}</strong></span><span><small>Forventet</small><strong>{minutTilTid(valgteStop.forventetMinut)}</strong></span><span><small>Varighed</small><strong>{valgteStop.varighedMin} min.</strong></span></div><div className="pu-sync-state"><span className="pu-action-dot" /><div><strong>{offline ? "Offline demo" : "Synkroniseret"}</strong><small>Syntetiske positionsdata</small></div></div><small className="pu-mobile-action-context">Handlingerne registrerer {handlinger.betydning} lokalt</small><div className="pu-mobile-buttons"><button type="button" disabled={!kanStart} title={!kanStart ? "Opgaven er allerede startet eller afsluttet" : handlinger.start} onClick={() => registrer(MOBILEVENTTYPE.ANKOMMET)}>{handlinger.start}</button><button type="button" disabled={!kanAfgang} title={!kanAfgang ? "Registrér Start først" : handlinger.afslut} onClick={() => registrer(MOBILEVENTTYPE.AFGAAET)}>{handlinger.afslut}</button></div><button className="pu-link pu-phone-link" type="button" onClick={() => onAabnKalender(rute.id)}>Se i livekalender →</button><div className="pu-mobile-events"><h3>Seneste hændelser</h3>{[...rute.mobilevents].reverse().slice(0, 4).map((event) => { const stop = rute.stop.find((post) => post.id === event.stopforekomstId); const tekster = mobilHandlingerFor(rute, stop); return <article key={event.id}><span aria-hidden="true">{event.type === "ANKOMMET" ? "↓" : "↑"}</span><div><strong>{event.type === "ANKOMMET" ? tekster.startet : tekster.afsluttet} · {msTilTid(event.mobilTidMs)}</strong><small>{tekster.betydning} · {event.synkroniseret ? "Synkroniseret" : "Offline · afventer"}</small></div>{!event.synkroniseret && <button type="button" onClick={() => synkroniser(event.id)}>Synkronisér</button>}</article>; })}</div></div></section><ExecutionMobilePreview /></div>
      </div>
    </div>
  );
}

function Indstillingsdialog({ indstillinger, setIndstillinger, onClose }) {
  const opdaterGraense = (felt, vaerdi, type = null) => setIndstillinger((nu) => type ? { ...nu, prRutetype: { ...nu.prRutetype, [type]: { ...nu.prRutetype[type], [felt]: Number(vaerdi) } } } : { ...nu, faelles: { ...nu.faelles, [felt]: Number(vaerdi) } });
  return (
    <div className="pu-overlay" role="presentation"><section className="pu-modal" role="dialog" aria-modal="true" aria-labelledby="indstillinger-titel"><div className="pu-drawer-head"><div><span className="pu-eyebrow">Kun lokal tilstand</span><h2 id="indstillinger-titel">Afvigelsesgrænser</h2></div><button className="pu-icon-btn" type="button" aria-label="Luk indstillinger" onClick={onClose}>×</button></div><div className="pu-segmented pu-wide"><button type="button" aria-pressed={indstillinger.model === "FAELLES"} onClick={() => setIndstillinger((nu) => ({ ...nu, model: "FAELLES" }))}>Fælles grænser</button><button type="button" aria-pressed={indstillinger.model === "PR_RUTETYPE"} onClick={() => setIndstillinger((nu) => ({ ...nu, model: "PR_RUTETYPE" }))}>Pr. rutetype</button></div>{indstillinger.model === "FAELLES" ? <div className="pu-form-grid"><label>Advarsel (min.)<input type="number" min="1" value={indstillinger.faelles.advarselMin} onChange={(event) => opdaterGraense("advarselMin", event.target.value)} /></label><label>Kritisk (min.)<input type="number" min={indstillinger.faelles.advarselMin} value={indstillinger.faelles.kritiskMin} onChange={(event) => opdaterGraense("kritiskMin", event.target.value)} /></label></div> : <div className="pu-threshold-grid">{Object.entries(indstillinger.prRutetype).map(([type, regel]) => <fieldset key={type}><legend>{TYPENAVNE[type]}</legend><label>Advarsel<input type="number" min="1" value={regel.advarselMin} onChange={(event) => opdaterGraense("advarselMin", event.target.value, type)} /></label><label>Kritisk<input type="number" min={regel.advarselMin} value={regel.kritiskMin} onChange={(event) => opdaterGraense("kritiskMin", event.target.value, type)} /></label></fieldset>)}</div>}<p className="pu-help">Ændringer opdaterer fremhævelsen straks og gemmes ikke uden for denne browsertilstand.</p><button className="pu-btn pu-btn-block" type="button" onClick={onClose}>Anvend lokalt</button></section></div>
  );
}

function PlatformIcon({ name }) {
  const icons = {
    overview: <path d="M4 13h6V4H4zM14 20h6V11h-6zM4 20h6v-3H4zM14 7h6V4h-6z" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
    tasks: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" /></>,
    route: <><circle cx="5" cy="5" r="2" /><circle cx="19" cy="7" r="2" /><circle cx="8" cy="19" r="2" /><path d="M7 5h4c4 0 4 2 4 4v3c0 3-2 5-5 5H8" /></>,
    repeat: <><path d="M20 7h-9a7 7 0 0 0-7 7" /><path d="m17 4 3 3-3 3M4 17h9a7 7 0 0 0 7-7" /><path d="m7 20-3-3 3-3" /></>,
    people: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 21c0-5 2-8 6-8s6 3 6 8M15 14c4 0 6 2 6 7" /></>,
    report: <path d="M5 20V10M12 20V4M19 20v-7" />,
    mobile: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01"/></>,
  };
  return <svg className="pr-icon" viewBox="0 0 24 24" aria-hidden="true">{icons[name] || icons.overview}</svg>;
}

function IkkeTilsluttetVisning({ title, text }) {
  return <div className="pu-view pr-placeholder"><section className="pu-card"><span>Planning Basic</span><h1>{title}</h1><p>{text}</p><strong>Lokal prototype · ingen ekstern integration</strong></section></div>;
}

export default function PlanningDemo({
  activeView = null,
  createLocalUrl = null,
  embedded = false,
  onNavigate = null,
  syncChannelName = "veyro-planning-week-demo",
}) {
  const fixtures = useMemo(() => opretReferenceFixtures(), []);
  const urlState = useMemo(() => {
    if (typeof window === "undefined") return { view: null, calendarOnly: false, customerOnly: false };
    const params = new URLSearchParams(window.location.search);
    return { view: params.get("view"), calendarOnly: params.get("calendarOnly") === "1", customerOnly: params.get("customerOnly") === "1", taskId: params.get("taskId"), proposalId: params.get("proposalId"), version: params.get("version") };
  }, []);
  const [visning, setVisning] = useState(activeView || ([VISNING.PLANLAEGNING, VISNING.OPGAVER].includes(urlState.view) ? urlState.view : VISNING.OVERBLIK));
  const [ruter, setRuter] = useState(fixtures.ruter);
  const [forslag, setForslag] = useState(fixtures.forslag);
  const [skabeloner, setSkabeloner] = useState(fixtures.ruteskabeloner);
  const [skabelonKoeretider, setSkabelonKoeretider] = useState(fixtures.skabelonKoeretider);
  const [indstillinger, setIndstillinger] = useState(fixtures.afvigelsesindstillinger);
  const [filtre, setFiltre] = useState({ status: "alle", ruteId: "", medarbejderId: "", koeretoejId: "" });
  const [raekkevisning, setRaekkevisning] = useState(RAEKKEVISNING.RUTE);
  const [fullscreen, setFullscreen] = useState(false);
  const [valgtRuteId, setValgtRuteId] = useState(null);
  const [valgtStopId, setValgtStopId] = useState(null);
  const [detaljeAaben, setDetaljeAaben] = useState(false);
  const [forslagAaben, setForslagAaben] = useState(false);
  const [indstillingerAabne, setIndstillingerAabne] = useState(false);
  const [planlaegningspulje, setPlanlaegningspulje] = useState([]);
  const [ugeplan, setUgeplan] = useState(() => opretDemoPlanlaegning());
  const ugeplanRef = useRef(ugeplan);
  const channelRef = useRef(null);
  const [liveFlerdagsruteId, setLiveFlerdagsruteId] = useState(null);
  const [planningMenuAaben, setPlanningMenuAaben] = useState(true);
  const [sidebarLukket, setSidebarLukket] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches);
  const [topSoegning, setTopSoegning] = useState("");
  const [notifikationerAabne, setNotifikationerAabne] = useState(false);
  const [hjaelpAaben, setHjaelpAaben] = useState(false);
  const opdaterUgeplan = (updater) => setUgeplan((current) => {
    const next = typeof updater === "function" ? updater(current) : updater;
    ugeplanRef.current = next;
    channelRef.current?.postMessage({ type: "PLANNING_WEEK_STATE", payload: next });
    return next;
  });
  const filtreredeRuter = filtrerReferenceRuter(ruter, filtre, indstillinger);
  const valgtRute = ruter.find((rute) => rute.id === valgtRuteId);
  const gaaTil = (nyVisning) => { setVisning(nyVisning); onNavigate?.(nyVisning); setDetaljeAaben(false); setForslagAaben(false); };
  const vaelgRute = (ruteId) => { setValgtRuteId(ruteId); setValgtStopId(null); setDetaljeAaben(false); setForslagAaben(false); };
  const aabnRute = (ruteId) => { setValgtRuteId(ruteId); setValgtStopId(null); gaaTil(VISNING.KALENDER); };
  const aabnKalenderElement = (ruteId, stopId = null) => {
    setValgtRuteId(ruteId);
    setValgtStopId(stopId);
    if (forslagForRute(forslag, ruteId).length) { setForslagAaben(true); setDetaljeAaben(false); }
    else { setDetaljeAaben(true); setForslagAaben(false); }
  };
  const aabnForslag = (ruteId) => {
    setValgtRuteId(ruteId);
    setValgtStopId(null);
    gaaTil(VISNING.KALENDER);
    setDetaljeAaben(false);
    if (forslagForRute(forslag, ruteId).length) setForslagAaben(true);
    else setDetaljeAaben(true);
  };
  const nulstilDemo = () => {
    const frisk = opretReferenceFixtures();
    setRuter(frisk.ruter); setForslag(frisk.forslag); setSkabeloner(frisk.ruteskabeloner);
    setSkabelonKoeretider(frisk.skabelonKoeretider); setIndstillinger(frisk.afvigelsesindstillinger);
    setFiltre({ status: "alle", ruteId: "", medarbejderId: "", koeretoejId: "" });
    setRaekkevisning(RAEKKEVISNING.RUTE); setValgtRuteId(null); setValgtStopId(null); setDetaljeAaben(false); setForslagAaben(false);
    opdaterUgeplan({ ...opretDemoPlanlaegning(), revision: ugeplanRef.current.revision + 1 }); setLiveFlerdagsruteId(null);
  };
  const ulæsteNotifikationer = (ugeplan.notifications || []).filter((item) => !item.read);
  const aabnNotifikation = (notification) => {
    const placement = ugeplan.placements.find((item) => item.taskId === notification.taskId);
    const readState = markerNotifikationLaest(ugeplan, notification.id);
    opdaterUgeplan({ ...readState, selectedTaskId: notification.taskId, focusRequest: { token: `notification-focus-${notification.id}-${readState.revision}`, taskId: notification.taskId, placementId: placement?.id || null, date: placement?.date || notification.date || null, resourceId: placement?.resourceId || notification.resourceId || null }, revision: readState.revision + 1 });
    gaaTil(VISNING.PLANLAEGNING); setNotifikationerAabne(false);
  };
  useEffect(() => {
    if (activeView) setVisning(activeView);
  }, [activeView]);
  useEffect(() => {
    const luk = (event) => { if (event.key === "Escape") { setFullscreen(false); setDetaljeAaben(false); setForslagAaben(false); setIndstillingerAabne(false); } };
    window.addEventListener("keydown", luk);
    return () => window.removeEventListener("keydown", luk);
  }, []);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined;
    const channel = new BroadcastChannel(syncChannelName);
    channelRef.current = channel;
    channel.onmessage = (event) => {
      if (event.data?.type === "PLANNING_WEEK_REQUEST") channel.postMessage({ type: "PLANNING_WEEK_STATE", payload: ugeplanRef.current });
      if (event.data?.type === "PLANNING_WEEK_STATE" && event.data.payload?.revision > ugeplanRef.current.revision) { ugeplanRef.current = event.data.payload; setUgeplan(event.data.payload); }
    };
    channel.postMessage({ type: "PLANNING_WEEK_REQUEST" });
    return () => { channelRef.current = null; channel.close(); };
  }, [syncChannelName]);
  if (urlState.customerOnly) return <PlanningCustomerConfirmation state={ugeplan} setState={opdaterUgeplan} taskId={urlState.taskId} requestedProposalId={urlState.proposalId} requestedVersion={urlState.version} />;
  if (urlState.calendarOnly) return <main className="ps-standalone-calendar" id="planning-indhold"><PlanningScheduling state={ugeplan} setState={opdaterUgeplan} calendarOnly onReset={nulstilDemo} onOpenLive={(routeId) => { setLiveFlerdagsruteId(routeId); }} /></main>;
  return (
    <div className={`pu-app pr-platform${embedded ? " pr-platform-embedded" : ""}${sidebarLukket ? " pr-sidebar-collapsed" : ""}`}>
      {!embedded && <a className="pu-skip" href="#planning-indhold">Gå til indhold</a>}
      {!embedded && <aside className="pu-sidebar pr-sidebar">
        <div className="pu-brand"><VeyroLogo variant="sidebar" /><small>Planning</small></div>
        <button type="button" className="pr-sidebar-toggle" onClick={() => setSidebarLukket((nu) => !nu)} aria-label={sidebarLukket ? "Udvid sidemenu" : "Fold sidemenu sammen"}><PlatformIcon name="menu" /></button>
        <button type="button" className="pr-module-toggle" aria-expanded={planningMenuAaben} onClick={() => setPlanningMenuAaben((nu) => !nu)}><PlatformIcon name="calendar" /><span>Planning</span><PlatformIcon name="chevron" /></button>
        {planningMenuAaben && <nav aria-label="Planning navigation">{NAVIGATION.map(([id, label, icon]) => <button type="button" key={id} aria-label={label} aria-current={visning === id ? "page" : undefined} onClick={() => gaaTil(id)}><PlatformIcon name={icon} /><span>{label}</span></button>)}</nav>}
        <div className="pr-platform-links" aria-label="Andre Veyro-moduler"><span>Platform</span>{["FLEET", "Workforce", "Fakturacenter"].map((label) => <button type="button" key={label} disabled title="Ikke tilgængelig i den isolerede Planning-demo">{label}</button>)}</div>
        <div className="pu-sidebar-note"><Statusmaerke niveau="estimated">Syntetisk demo</Statusmaerke><p>Ingen eksterne tjenester eller persistence.</p><button type="button" onClick={nulstilDemo}>Nulstil demodata</button></div>
      </aside>}
      <div className="pu-shell">
        {!embedded && <header className="pu-topbar pr-topbar">
          <button type="button" className="pr-mobile-menu" onClick={() => setSidebarLukket((nu) => !nu)} aria-label="Vis eller skjul menu"><PlatformIcon name="menu" /></button>
          <label className="pr-global-search"><PlatformIcon name="search" /><span className="pu-sr-only">Søg i Planning</span><input value={topSoegning} onChange={(event) => setTopSoegning(event.target.value)} placeholder="Søg i ruter, medarbejdere, køretøjer ..." /></label>
          <div className="pr-user-area"><button type="button" className="pr-notification" aria-expanded={notifikationerAabne} onClick={() => setNotifikationerAabne((nu) => !nu)} aria-label={`Vis demo-notifikationer, ${ulæsteNotifikationer.length} ulæste`}><PlatformIcon name="bell" />{ulæsteNotifikationer.length > 0 && <b>{ulæsteNotifikationer.length}</b>}</button><button type="button" className="pr-help-button" aria-expanded={hjaelpAaben} onClick={() => setHjaelpAaben((nu) => !nu)} aria-label="Vis hjælp til Planning-demoen"><PlatformIcon name="help" /></button><span className="pr-user-avatar">ML</span><span><strong>Mette Larsen</strong><small>Disponent · demo</small></span></div>
          {notifikationerAabne && <div className="pr-notifications" role="region" aria-label="Planning-notifikationer"><strong>{ulæsteNotifikationer.length} ulæste demo-notifikationer</strong>{(ugeplan.notifications || []).length === 0 ? <span>Ingen bekræftelser eller ændringsønsker endnu.</span> : (ugeplan.notifications || []).map((notification) => <button type="button" key={notification.id} data-read={notification.read} onClick={() => aabnNotifikation(notification)}><b>{notification.title}</b><span>{notification.text}</span><small>{notification.read ? "Læst" : "Ulæst"} · {notification.createdAt}</small></button>)}<span>Kun lokal syntetisk demo.</span></div>}
          {hjaelpAaben && <div className="pr-help-popover" role="status"><strong>Planning-demo</strong><span>Alle handlinger er lokale og nulstilles ved genindlæsning.</span></div>}
        </header>}
        <main id="planning-indhold">
          {visning === VISNING.OVERBLIK && <DagensOverblik ruter={ruter} medarbejdere={fixtures.medarbejdere} koeretoejer={fixtures.koeretoejer} indstillinger={indstillinger} filtre={filtre} setFiltre={setFiltre} raekkevisning={raekkevisning} setRaekkevisning={setRaekkevisning} selectedRouteId={valgtRuteId} onSelectRoute={vaelgRute} onOpenCalendar={aabnRute} onProposal={aabnForslag} />}
          {visning === VISNING.KALENDER && <Livekalender ruter={filtreredeRuter} medarbejdere={fixtures.medarbejdere} koeretoejer={fixtures.koeretoejer} indstillinger={indstillinger} filtre={filtre} setFiltre={setFiltre} raekkevisning={raekkevisning} setRaekkevisning={setRaekkevisning} selectedRouteId={valgtRuteId} selectedStopId={valgtStopId} onRoute={aabnKalenderElement} onProposal={aabnKalenderElement} fullscreen={fullscreen} setFullscreen={setFullscreen} flerdagsrute={ugeplan.multiDayRoutes.find((route) => route.id === liveFlerdagsruteId) || null} />}
          <section hidden={visning !== VISNING.OPGAVER}><PlanningIntake planlaegningspulje={planlaegningspulje} setPlanlaegningspulje={setPlanlaegningspulje} createLocalUrl={createLocalUrl} /></section>
          <section hidden={visning !== VISNING.PLANLAEGNING}><PlanningScheduling createLocalUrl={createLocalUrl} state={ugeplan} setState={opdaterUgeplan} calendarOnly={urlState.calendarOnly} onReset={nulstilDemo} onOpenLive={(routeId) => { setLiveFlerdagsruteId(routeId); gaaTil(VISNING.KALENDER); }} /></section>
          {visning === VISNING.OPTIMERING && <PlanningOptimization planlaegningspulje={planlaegningspulje} />}
          {visning === VISNING.FASTE_RUTER && <FasteRuter skabeloner={skabeloner} setSkabeloner={setSkabeloner} koeretider={skabelonKoeretider} setKoeretider={setSkabelonKoeretider} ressourcer={fixtures.ressourceSnapshot} medarbejdere={fixtures.medarbejdere} koeretoejer={fixtures.koeretoejer} />}
          {visning === VISNING.MOBIL && <Mobilvisning ruter={ruter} setRuter={setRuter} medarbejdere={fixtures.medarbejdere} onAabnKalender={aabnRute} />}
          {visning === "ressourcer" && <IkkeTilsluttetVisning title="Ressourcer" text="Ressourcevisningen forberedes til Fleet- og Workforce-adaptere; denne lokale demo ændrer ingen stamdata." />}
          {visning === "rapporter" && <IkkeTilsluttetVisning title="Rapporter" text="Rapporter er ikke en del af denne visuelle etape. Ingen data eksporteres eller gemmes." />}
        </main>
      </div>
      {valgtRute && detaljeAaben && !forslagAaben && <RuteDetalje rute={valgtRute} selectedStopId={valgtStopId} medarbejdere={fixtures.medarbejdere} koeretoejer={fixtures.koeretoejer} indstillinger={indstillinger} harForslag={forslagForRute(forslag, valgtRute.id).length > 0} onClose={() => setDetaljeAaben(false)} onForslag={aabnForslag} />}
      {forslagAaben && <ForslagPanel forslag={forslagForRute(forslag, valgtRuteId)} selectedStopId={valgtStopId} ruter={ruter} medarbejdere={fixtures.medarbejdere} koeretoejer={fixtures.koeretoejer} setForslag={setForslag} setRuter={setRuter} onClose={() => setForslagAaben(false)} />}
      {indstillingerAabne && <Indstillingsdialog indstillinger={indstillinger} setIndstillinger={setIndstillinger} onClose={() => setIndstillingerAabne(false)} />}
    </div>
  );
}
