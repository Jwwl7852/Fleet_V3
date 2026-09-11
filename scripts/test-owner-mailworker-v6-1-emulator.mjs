/* V6.1 integrationstest af den faktiske mailjob-worker med lokal transport.
 * Scriptet nægter at køre mod andet end demo-projekt + localhost-database. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { mailIndholdHash } from "../functions/salgsplatform.js";
import { koerMailjobWorker } from "../functions/mailjob-worker.js";

const projekt = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
assert.match(projekt, /^demo-/);
assert.equal(databaseHost, "127.0.0.1:9000");
const app = initializeApp({ projectId: projekt, databaseURL: `http://${databaseHost}?ns=${projekt}` }, "mailworker-v6-1");
const db = getDatabase(app);
const prefix = `v61_${Date.now()}`;
const resultater = [];

async function ryd(id) {
  await db.ref("udbyder").update({ [`mailjobs/${id}`]: null, [`salgsindbakke/traade/${id}`]: null, [`tilbud/${id}`]: null });
}

function godkendtSvar() {
  const kladde = { status: "godkendt", fra: "info@veyrosystems.com", til: "kunde@syntetisk.invalid", emne: "Syntetisk support", tekst: "Godkendt lokalt svar", signatur: "Veyro", vedhaeftninger: [], basisAktivitetMs: 10 };
  kladde.godkendtIndholdHash = mailIndholdHash(kladde);
  return kladde;
}

async function opfoelgningsScenario(navn, mutation) {
  const id = `${prefix}_${navn}`;
  const opf = { id: "opf", status: "godkendt", indholdHash: "hash", godkendtIndholdHash: "hash", basisAktivitetMs: 10, revision: 2 };
  await db.ref().update({
    [`udbyder/salgsindbakke/traade/${id}`]: { id, status: "afventer_kunden", senesteAktivitetMs: 10, links: { tilbudId: id }, opfoelgninger: { opf } },
    [`udbyder/tilbud/${id}`]: { id, status: "sendt", aktuelVersion: 2, revision: 8 },
    [`udbyder/mailjobs/${id}`]: { id, art: "opfoelgning", status: "kladde", traadId: id, opfoelgningId: "opf", revision: 1 },
  });
  let transportkald = 0;
  let fejl;
  try {
    await koerMailjobWorker({ db, jobId: id, forventetRevision: 1, ejerUid: "syntetisk-ejer", efterReservation: async () => mutation(id), transport: async () => { transportkald += 1; return { providerDraftId: `lokal-${navn}` }; } });
  } catch (aarsag) { fejl = aarsag; }
  const job = (await db.ref(`udbyder/mailjobs/${id}`).once("value")).val();
  assert.ok(fejl, `${navn} skulle være stoppet.`);
  assert.equal(transportkald, 0);
  assert.equal(job.status, "pauset", `${navn}: ${fejl?.stack || fejl?.message || fejl}; detaljer=${JSON.stringify(fejl?.afvisningsgrund)}`);
  assert.ok(job.pauseAarsag);
  resultater.push({ scenario: navn, transportkald, status: job.status, stopaarsag: job.pauseAarsag });
  await ryd(id);
}

try {
  await opfoelgningsScenario("accepteret", (id) => db.ref(`udbyder/tilbud/${id}/status`).set("accepteret"));
  await opfoelgningsScenario("afvist", (id) => db.ref(`udbyder/tilbud/${id}/status`).set("afvist"));
  await opfoelgningsScenario("ny_kundemail", (id) => db.ref(`udbyder/salgsindbakke/traade/${id}`).update({ senesteAktivitetMs: 11, [`beskeder/ny`]: { retning: "indgaaende", sendtMs: 11, tekst: "Syntetisk ny kundemail" } }));
  await opfoelgningsScenario("ældre_accepteret_version_med_ny_kladde", (id) => db.ref(`udbyder/tilbud/${id}`).update({ status: "kladde", accept: { version: 2, ms: 10 }, aktuelVersion: 2, revisionFraVersion: 2, kladde: { indledning: "Ny separat kladde" } }));

  const supportId = `${prefix}_support`;
  const svar = godkendtSvar();
  await db.ref().update({
    [`udbyder/salgsindbakke/traade/${supportId}`]: { id: supportId, sagstype: "support", status: "afventer_kunden", senesteAktivitetMs: 10, svarKladder: { svar } },
    [`udbyder/mailjobs/${supportId}`]: { ...svar, id: supportId, art: "sagssvar", status: "kladde", traadId: supportId, svarKladdeId: "svar", indholdHash: svar.godkendtIndholdHash, revision: 1 },
  });
  let supportKald = 0;
  await koerMailjobWorker({ db, jobId: supportId, forventetRevision: 1, ejerUid: "syntetisk-ejer", transport: async () => { supportKald += 1; return { providerDraftId: "lokal-support" }; } });
  assert.equal(supportKald, 1);
  resultater.push({ scenario: "uafhængigt_supportsvar", transportkald: supportKald, status: "accepteret_af_graph" });
  await ryd(supportId);

  const samtidigId = `${prefix}_samtidig`;
  const samtidigSvar = godkendtSvar();
  await db.ref().update({
    [`udbyder/salgsindbakke/traade/${samtidigId}`]: { id: samtidigId, sagstype: "support", status: "afventer_kunden", senesteAktivitetMs: 10, svarKladder: { svar: samtidigSvar } },
    [`udbyder/mailjobs/${samtidigId}`]: { ...samtidigSvar, id: samtidigId, art: "sagssvar", status: "kladde", traadId: samtidigId, svarKladdeId: "svar", indholdHash: samtidigSvar.godkendtIndholdHash, revision: 1 },
  });
  let samtidigeKald = 0;
  const parallelle = await Promise.allSettled([1, 2].map(() => koerMailjobWorker({ db, jobId: samtidigId, forventetRevision: 1, ejerUid: "syntetisk-ejer", transport: async () => { samtidigeKald += 1; return { providerDraftId: "lokal-samtidig" }; } })));
  assert.equal(parallelle.filter((post) => post.status === "fulfilled").length, 1);
  assert.equal(samtidigeKald, 1);
  resultater.push({ scenario: "to_samtidige_workers", transportkald: samtidigeKald, accepteret: 1, afvist: 1 });
  await ryd(samtidigId);

  const ukendtId = `${prefix}_ukendt`;
  const ukendtSvar = godkendtSvar();
  await db.ref().update({
    [`udbyder/salgsindbakke/traade/${ukendtId}`]: { id: ukendtId, sagstype: "support", status: "afventer_kunden", senesteAktivitetMs: 10, svarKladder: { svar: ukendtSvar } },
    [`udbyder/mailjobs/${ukendtId}`]: { ...ukendtSvar, id: ukendtId, art: "sagssvar", status: "kladde", traadId: ukendtId, svarKladdeId: "svar", indholdHash: ukendtSvar.godkendtIndholdHash, revision: 1 },
  });
  let ukendtKald = 0;
  const ukendtTransport = async () => { ukendtKald += 1; const fejl = new Error("Lokal transport mistede svar efter aflevering"); fejl.ukendtUdfald = true; fejl.providerDraftId = "lokal-ukendt"; throw fejl; };
  await assert.rejects(() => koerMailjobWorker({ db, jobId: ukendtId, forventetRevision: 1, ejerUid: "syntetisk-ejer", transport: ukendtTransport }));
  const ukendtJob = (await db.ref(`udbyder/mailjobs/${ukendtId}`).once("value")).val();
  assert.equal(ukendtJob.status, "ukendt");
  await assert.rejects(() => koerMailjobWorker({ db, jobId: ukendtId, forventetRevision: ukendtJob.revision, ejerUid: "syntetisk-ejer", transport: ukendtTransport }));
  assert.equal(ukendtKald, 1);
  resultater.push({ scenario: "ukendt_transportudfald", transportkald: ukendtKald, status: "ukendt", genforsøg: 0 });
  await ryd(ukendtId);

  const output = resolve(process.env.V61_MAILWORKER_RESULTAT || "docs/screenshots/ejer-review-v6-1/mailworker-integration-result.json");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({ projekt, adapter: "lokal_injiceret_transport", eksternAfsendelse: false, resultater }, null, 2)}\n`);
  console.log(`V6.1 mailworker: ${resultater.length} scenarier bestået; resultat ${output}`);
} finally {
  await deleteApp(app);
}
