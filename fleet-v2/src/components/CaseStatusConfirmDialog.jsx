import { CASE_STATUSES } from "../data/caseWorkflow";
import { Icon } from "./Icon";

export const needsBackToNewConfirmation = (caseItem, targetStatus) => caseItem?.status === "assessing" && targetStatus === "new";

export function CaseStatusConfirmDialog({ caseItem, busy = false, onCancel, onConfirm }) {
  if (!caseItem) return null;
  return <div className="modal-layer case-status-confirm-layer" role="presentation">
    <section className="modal-card case-status-confirm" role="alertdialog" aria-modal="true" aria-labelledby="back-to-new-title" aria-describedby="back-to-new-description">
      <header><span className="confirm-icon"><Icon name="undo" size={22} /></span><div><small>{caseItem.number} · {CASE_STATUSES[caseItem.status]}</small><h2 id="back-to-new-title">Flyt sagen tilbage til Ny?</h2></div></header>
      <div className="modal-body"><p id="back-to-new-description">Indberetningen vises igen som ny. Eksisterende oplysninger, bilag og historik bevares.</p><p className="prototype-note">Status kontrolleres igen ved gemning, så en nyere ændring fra en anden fane ikke overskrives.</p></div>
      <footer><button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>Annuller</button><button className="primary-button" type="button" onClick={onConfirm} disabled={busy}>{busy ? "Flytter …" : "Ja, flyt tilbage"}</button></footer>
    </section>
  </div>;
}
