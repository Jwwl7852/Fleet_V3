import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BEKRAEFTELSESFUND, FORSLAGSSTATUS, PLANFUND, PLANSTATUS,
  bekraeftForslag, markerNotifikationLaest, placerForeloebigt,
  registrerAendringOensket, sendTilBekraeftelse,
} from "../../src/fleet/planning-scheduling/index.js";
import { opretDemoPlanlaegning } from "../../src/fleet/planning-scheduling/demo-planning-scheduling.js";

const place = (state, overrides = {}) => placerForeloebigt(state, { taskId: "week-task-01", date: "2032-09-14", resourceType: "rute", resourceId: "week-route-nord", startTime: "09:00", durationMin: 45, ...overrides }, { placementId: overrides.placementId || "confirmation-placement", timestamp: "13.09.2032 · 09:42" });
const send = (state) => sendTilBekraeftelse(state, "confirmation-placement", { timestamp: "13.09.2032 · 10:05", messageId: "confirmation-proposal-message" });
const confirm = (state, proposal) => bekraeftForslag(state, "week-task-01", { proposalId: proposal.id, version: proposal.version, timestamp: "13.09.2032 · 10:18", messageId: `confirm-${proposal.id}`, notificationId: `notification-${proposal.id}` });

describe("Versioneret lokalt bekræftelsesflow", () => {
  it("går fra kladde til afventer bekræftelse og kun bestillersvar giver bekræftet", () => {
    const draft = place(opretDemoPlanlaegning());
    assert.equal(draft.state.tasks[0].status, PLANSTATUS.KLADDE);
    const sent = send(draft.state);
    assert.equal(sent.state.tasks[0].status, PLANSTATUS.AFVENTER_BEKRAEFTELSE);
    assert.equal(sent.state.placements[0].final, false);
    const confirmed = confirm(sent.state, sent.proposal);
    assert.equal(confirmed.state.tasks[0].status, PLANSTATUS.BEKRAEFTET);
    assert.equal(confirmed.state.placements[0].final, true);
    assert.equal(confirmed.state.notifications.length, 1);
  });

  it("afviser et svar på en forældet version", () => {
    const sent1 = send(place(opretDemoPlanlaegning()).state);
    const moved = place(sent1.state, { placementId: "confirmation-placement", startTime: "11:00" });
    const sent2 = send(moved.state);
    const stale = confirm(sent2.state, sent1.proposal);
    assert.equal(stale.ok, false); assert.equal(stale.stale, true); assert.equal(stale.code, BEKRAEFTELSESFUND.FORSLAG_FORAELDET);
    assert.equal(sent2.state.tasks[0].confirmation.proposals[0].status, FORSLAGSSTATUS.ERSTATTET);
  });

  it("ændring efter bekræftelse bliver ny kladde og kræver ny version", () => {
    const sent = send(place(opretDemoPlanlaegning()).state);
    const confirmed = confirm(sent.state, sent.proposal);
    const moved = place(confirmed.state, { placementId: "confirmation-placement", startTime: "11:00" });
    assert.equal(moved.state.tasks[0].status, PLANSTATUS.KLADDE);
    assert.equal(moved.state.tasks[0].confirmation.currentProposalId, null);
    const resent = send(moved.state);
    assert.equal(resent.proposal.version, 2);
  });

  it("gentagne klik dublerer ikke forslag, tråd eller notifikation", () => {
    const sent = send(place(opretDemoPlanlaegning()).state);
    const repeatedSend = send(sent.state);
    assert.equal(repeatedSend.duplicate, true); assert.deepEqual(repeatedSend.state, sent.state);
    const confirmed = confirm(sent.state, sent.proposal);
    const repeatedConfirm = confirm(confirmed.state, sent.proposal);
    assert.equal(repeatedConfirm.duplicate, true); assert.equal(repeatedConfirm.state.notifications.length, 1);
    assert.equal(repeatedConfirm.state.tasks[0].thread.filter((entry) => entry.kind === "BESTILLER_BEKRAEFTELSE").length, 1);
  });

  it("ændringsønske bevarer reservation og opretter én konkret notifikation", () => {
    const sent = send(place(opretDemoPlanlaegning()).state);
    const before = structuredClone(sent.state);
    const changed = registrerAendringOensket(sent.state, "week-task-01", { proposalId: sent.proposal.id, version: sent.proposal.version, timestamp: "13.09.2032 · 10:19", messageId: "change-v1", notificationId: "change-note-v1", text: "Torsdag efter kl. 13?", alternativeDate: "2032-09-16", alternativeTime: "13:00" });
    assert.equal(changed.state.tasks[0].status, PLANSTATUS.AENDRING_OENSKET);
    assert.equal(changed.state.placements.length, 1); assert.equal(changed.state.placements[0].final, false);
    assert.equal(changed.state.notifications[0].type, "AENDRING_OENSKET"); assert.deepEqual(sent.state, before);
    const repeated = registrerAendringOensket(changed.state, "week-task-01", { proposalId: sent.proposal.id, version: sent.proposal.version, messageId: "change-v1", text: "gentaget" });
    assert.equal(repeated.duplicate, true); assert.equal(repeated.state.notifications.length, 1);
  });

  it("læst status ændres atomisk og gentagen læsning er idempotent", () => {
    const sent = send(place(opretDemoPlanlaegning()).state); const confirmed = confirm(sent.state, sent.proposal);
    const read = markerNotifikationLaest(confirmed.state, confirmed.state.notifications[0].id);
    assert.equal(read.notifications[0].read, true);
    assert.deepEqual(markerNotifikationLaest(read, read.notifications[0].id), read);
  });

  it("bevarer reservationskonflikter mens forslag afventer", () => {
    const waiting = send(place(opretDemoPlanlaegning()).state).state;
    const conflict = place(waiting, { taskId: "week-task-03", placementId: undefined, startTime: "09:20", durationMin: 30 });
    assert.equal(conflict.ok, false); assert.ok(conflict.findings.some((item) => item.code === PLANFUND.RESSOURCEKONFLIKT));
  });
});
