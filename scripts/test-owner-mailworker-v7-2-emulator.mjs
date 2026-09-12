/* V7.2: sidste godkendelseskontrol med lokal injiceret transport. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { koerMailjobWorker } from "../functions/mailjob-worker.js";
import { mailIndholdHash } from "../functions/salgsplatform.js";

const projekt = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
assert.match(projekt, /^demo-/);
assert.equal(databaseHost, "127.0.0.1:9000");
const app = initializeApp({ projectId: projekt, databaseURL: `http://${databaseHost}?ns=${projekt}` }, "mailworker-v7-2");
const db = getDatabase(app);
const prefix = `v72_${Date.now()}`;
const resultater = [];

function godkendtSvar(overrides = {}) {
  const svar = {
    fra: "info@veyrosystems.com",
    til: "maria@syntetisk.invalid",
    emne: "Re: Pilotprojekt",
    tekst: "Ny, konkret godkendt version",
    signatur: "Venlig hilsen\nDennis",
    vedhaeftninger: [{ id: "behov", navn: "Behov.pdf", status: "testmetadata" }],
    basisAktivitetMs: 20,
    revision: 5,
    ...overrides,
  };
  svar.status = "godkendt";
  svar.indholdHash = mailIndholdHash(svar);
  svar.godkendtIndholdHash = svar.indholdHash;
  return svar;
}

async function ryd(id) {
  await db.ref("udbyder").update({ [`mailjobs/${id}`]: null, [`salgsindbakke/traade/${id}`]: null });
}

async function afvistEfterMutation(navn, mutation) {
  const id = `${prefix}_${navn}`;
  const svar = godkendtSvar();
  await db.ref().update({
    [`udbyder/salgsindbakke/traade/${id}`]: { id, status: "afventer_os", senesteAktivitetMs: 20, svarKladder: { svar } },
    [`udbyder/mailjobs/${id}`]: { ...svar, id, art: "sagssvar", status: "kladde", traadId: id, svarKladdeId: "svar", revision: 1 },
  });
  let transportkald = 0;
  let fejl;
  try {
    await koerMailjobWorker({
      db, jobId: id, forventetRevision: 1, ejerUid: "syntetisk-ejer",
      efterReservation: async () => mutation(id, svar),
      transport: async () => { transportkald += 1; return { providerDraftId: "maa-ikke-ske" }; },
    });
  } catch (aarsag) { fejl = aarsag; }
  const job = (await db.ref(`udbyder/mailjobs/${id}`).once("value")).val();
  assert.equal(fejl?.kode, "failed-precondition");
  assert.equal(transportkald, 0);
  assert.equal(job.status, "pauset");
  assert.equal(job.pauseAarsag, "godkendelse_forældet");
  resultater.push({ scenario: navn, godkendtRevision: svar.revision, jobRevision: job.revision, transportkald, status: job.status, stopaarsag: job.pauseAarsag });
  await ryd(id);
}

try {
  await afvistEfterMutation("tekst_aendret", (id, svar) => db.ref(`udbyder/salgsindbakke/traade/${id}/svarKladder/svar`).set(godkendtSvar({ tekst: `${svar.tekst} ændret`, revision: 6 })));
  await afvistEfterMutation("modtager_aendret", (id) => db.ref(`udbyder/salgsindbakke/traade/${id}/svarKladder/svar`).set(godkendtSvar({ til: "anden@syntetisk.invalid", revision: 6 })));
  await afvistEfterMutation("emne_aendret", (id) => db.ref(`udbyder/salgsindbakke/traade/${id}/svarKladder/svar`).set(godkendtSvar({ emne: "Re: Ændret emne", revision: 6 })));
  await afvistEfterMutation("vedhaeftning_aendret", (id) => db.ref(`udbyder/salgsindbakke/traade/${id}/svarKladder/svar`).set(godkendtSvar({ vedhaeftninger: [], revision: 6 })));

  const id = `${prefix}_ny_godkendelse`;
  const svar = godkendtSvar({ revision: 9 });
  await db.ref().update({
    [`udbyder/salgsindbakke/traade/${id}`]: { id, status: "afventer_os", senesteAktivitetMs: 20, aiArbejdsrum: { chat: { intern: { tekst: "Må aldrig sendes" } } }, noter: { intern: { tekst: "Intern note" } }, svarKladder: { svar } },
    [`udbyder/mailjobs/${id}`]: { ...svar, id, art: "sagssvar", status: "kladde", traadId: id, svarKladdeId: "svar", revision: 1 },
  });
  const payloads = [];
  await koerMailjobWorker({ db, jobId: id, forventetRevision: 1, ejerUid: "syntetisk-ejer", transport: async ({ job }) => { payloads.push(job); return { providerDraftId: "lokal-v72" }; } });
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].til, svar.til);
  assert.equal(payloads[0].emne, svar.emne);
  assert.equal(payloads[0].tekst, svar.tekst);
  assert.deepEqual(payloads[0].vedhaeftninger, svar.vedhaeftninger);
  assert.equal(payloads[0].aiArbejdsrum, undefined);
  assert.equal(payloads[0].noter, undefined);
  resultater.push({ scenario: "ny_godkendt_version", godkendtRevision: svar.revision, transportkald: payloads.length, status: "accepteret_af_graph", internChatITransport: false, interneNoterITransport: false });
  await ryd(id);

  const output = resolve(process.env.V72_MAILWORKER_RESULTAT || "docs/screenshots/ejer-review-v7-2/post-approval-transport-proof.json");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({ projekt, adapter: "lokal_injiceret_transport", eksternAfsendelse: false, resultater }, null, 2)}\n`);
  console.log(`V7.2 mailworker: ${resultater.length} scenarier bestået; resultat ${output}`);
} finally {
  await deleteApp(app);
}
