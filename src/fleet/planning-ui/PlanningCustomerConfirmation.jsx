import { useMemo, useState } from "react";
import {
  FORSLAGSSTATUS, PLANSTATUS, bekraeftForslag, findAktueltForslag, registrerAendringOensket,
} from "../planning-scheduling/index.js";

const STATUS = {
  [PLANSTATUS.KLADDE]: "Kladde",
  [PLANSTATUS.AFVENTER_BEKRAEFTELSE]: "Afventer bekræftelse",
  [PLANSTATUS.BEKRAEFTET]: "Bekræftet",
  [PLANSTATUS.AENDRING_OENSKET]: "Ændring ønsket",
  [PLANSTATUS.I_KOE]: "Ikke placeret",
};

const endTime = (start, duration) => {
  const [hours, minutes] = (start || "00:00").split(":").map(Number);
  const total = hours * 60 + minutes + Number(duration || 0);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export default function PlanningCustomerConfirmation({ state, setState, taskId, requestedProposalId = null, requestedVersion = null }) {
  const [comment, setComment] = useState("Tidspunktet passer ikke. Kan det blive torsdag efter kl. 13?");
  const [alternativeDate, setAlternativeDate] = useState("2032-09-16");
  const [alternativeTime, setAlternativeTime] = useState("13:00");
  const [message, setMessage] = useState("");
  const task = state.tasks.find((item) => item.id === taskId);
  const current = findAktueltForslag(task);
  const shown = useMemo(() => task?.confirmation?.proposals?.find((item) => item.id === requestedProposalId) || current, [task, requestedProposalId, current?.id]);
  const resource = state.resources.find((item) => item.id === shown?.placement?.resourceId);
  const version = Number(requestedVersion || shown?.version || 0);
  const applyResult = (result, successText) => {
    if (!result.ok) { setMessage(result.text || "Handlingen kunne ikke gennemføres."); return; }
    setState(result.state);
    setMessage(result.duplicate ? "Svaret er allerede registreret på denne version." : successText);
  };
  const confirm = () => applyResult(bekraeftForslag(state, taskId, { proposalId: shown?.id, version, timestamp: "13.09.2032 · 10:18", messageId: `thread-confirm-${shown?.id}`, notificationId: `notification-confirm-${shown?.id}` }), "Tidspunktet er bekræftet lokalt. Disponenten har fået én demo-notifikation.");
  const requestChange = () => applyResult(registrerAendringOensket(state, taskId, { proposalId: shown?.id, version, timestamp: "13.09.2032 · 10:19", messageId: `thread-change-${shown?.id}`, notificationId: `notification-change-${shown?.id}`, text: comment, alternativeDate, alternativeTime }), "Ændringsønsket er registreret lokalt og kan ses af disponenten.");

  if (!task) return <main className="pc-customer-view"><section className="pc-customer-card"><h1>Bestillervisning · lokal demo</h1><p>Opgaven findes ikke i den aktuelle lokale demotilstand.</p></section></main>;
  return <main className="pc-customer-view">
    <header className="pc-customer-banner"><strong>Bestillervisning · lokal rolle-simulation</strong><span>Ingen login, besked eller data sendes eksternt.</span></header>
    <section className="pc-customer-card" data-status={task.status}>
      <div className="pc-customer-heading"><div><span>{task.reference || task.id}</span><h1>{task.name}</h1><p>{task.customer}</p></div><strong className="pc-status-pill" data-status={task.status}>{STATUS[task.status] || task.status}</strong></div>
      {!shown ? <div className="pc-empty"><h2>Intet forslag er sendt endnu</h2><p>Disponenten har ikke sendt en konkret placering til denne lokale bestillervisning.</p></div> : <>
        <section className="pc-proposal"><header><span>Forslag version {shown.version}</span><strong>{shown.status === FORSLAGSSTATUS.ERSTATTET ? "Erstattet af nyere forslag" : STATUS[task.status]}</strong></header><dl><div><dt>Oprindeligt ønske</dt><dd>{task.requestPeriod?.art === "ISO_UGE" ? `Uge ${task.requestPeriod.uge} · ${task.requestPeriod.aar}` : task.requestPeriod?.dato || "Uden datoønske"}</dd></div><div><dt>Foreslået dato</dt><dd>{shown.placement.date}</dd></div><div><dt>Tid</dt><dd>{shown.placement.startTime}–{endTime(shown.placement.startTime, shown.placement.durationMin)}</dd></div><div><dt>Ressource</dt><dd>{resource?.label || shown.placement.resourceId}</dd></div></dl></section>
        <section className="pc-stops"><h2>Stop</h2>{shown.placement.stops.map((stop) => <article key={stop.id}><b>{stop.order}</b><div><strong>{stop.name}</strong><small>{stop.type} · {stop.id}</small></div></article>)}</section>
        <section className="pc-response"><h2>Dit lokale demosvar</h2><label>Kommentar<textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label><div><label>Alternativ dato<input type="date" value={alternativeDate} onChange={(event) => setAlternativeDate(event.target.value)} /></label><label>Alternativ tid<input type="time" value={alternativeTime} onChange={(event) => setAlternativeTime(event.target.value)} /></label></div><div className="pc-response-actions"><button type="button" className="pu-btn pu-btn-quiet" disabled={shown.status !== FORSLAGSSTATUS.AFVENTER} onClick={requestChange}>Ønsk andet tidspunkt</button><button type="button" className="pu-btn pu-btn-primary" disabled={shown.status !== FORSLAGSSTATUS.AFVENTER} onClick={confirm}>Bekræft tidspunkt</button></div></section>
      </>}
      <section className="ps-thread"><h2>Samlet bestillingstråd</h2>{task.thread.map((entry) => <article key={entry.id} data-kind={entry.kind}><small>{entry.timestamp} · {entry.kind.replaceAll("_", " ")}{entry.proposalVersion ? ` · version ${entry.proposalVersion}` : ""}</small><p>{entry.text}</p></article>)}</section>
      {message && <div className="ps-local-message" role="status">{message}</div>}
      <p className="pc-footnote">CSV-import indeholder ingen fungerende svarkanal. Dette er kun en lokal, syntetisk rollevisning.</p>
    </section>
  </main>;
}
