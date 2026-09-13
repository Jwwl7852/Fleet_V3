/* V7.3.1: signaturændring kræver ny godkendelse; lokal transport kaldes én gang. */
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
const app = initializeApp({ projectId: projekt, databaseURL: `http://${databaseHost}?ns=${projekt}` }, "mailworker-v7-3-1");
const db = getDatabase(app);
const prefix = `v731_${Date.now()}`;
const resultater = [];

function godkendtSvar(overrides = {}) {
  const svar = {
    fra: "info@veyrosystems.com",
    til: "maria@syntetisk.invalid",
    emne: "Re: Pilotprojekt",
    tekst: "Hej Maria.\n\nHer er den godkendte, syntetiske tekst uden manuel afslutning.",
    signatur: "Venlig hilsen\nDennis Testejer\nVeyro Systems",
    vedhaeftninger: [],
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

try {
  const forældetId = `${prefix}_signatur_aendret`;
  const oprindeligtSvar = godkendtSvar();
  await db.ref().update({
    [`udbyder/salgsindbakke/traade/${forældetId}`]: { id: forældetId, status: "afventer_os", senesteAktivitetMs: 20, svarKladder: { svar: oprindeligtSvar } },
    [`udbyder/mailjobs/${forældetId}`]: { ...oprindeligtSvar, id: forældetId, art: "sagssvar", status: "kladde", traadId: forældetId, svarKladdeId: "svar", revision: 1 },
  });
  let forældetTransportkald = 0;
  let forældetFejl;
  try {
    await koerMailjobWorker({
      db, jobId: forældetId, forventetRevision: 1, ejerUid: "syntetisk-ejer",
      efterReservation: () => db.ref(`udbyder/salgsindbakke/traade/${forældetId}/svarKladder/svar`).set(godkendtSvar({ signatur: "Venlig hilsen\nDennis Testejer\nNy titel", revision: 6 })),
      transport: async () => { forældetTransportkald += 1; return { providerDraftId: "maa-ikke-ske" }; },
    });
  } catch (aarsag) { forældetFejl = aarsag; }
  const pauset = (await db.ref(`udbyder/mailjobs/${forældetId}`).once("value")).val();
  assert.equal(forældetFejl?.kode, "failed-precondition");
  assert.equal(forældetTransportkald, 0);
  assert.equal(pauset.status, "pauset");
  assert.equal(pauset.pauseAarsag, "godkendelse_forældet");
  resultater.push({ scenario: "signaturændring_ugyldiggør_godkendelse", transportkald: 0, status: pauset.status, stopaarsag: pauset.pauseAarsag });
  await ryd(forældetId);

  const godkendtId = `${prefix}_ny_godkendelse`;
  const nytSvar = godkendtSvar({ revision: 7 });
  await db.ref().update({
    [`udbyder/salgsindbakke/traade/${godkendtId}`]: { id: godkendtId, status: "afventer_os", senesteAktivitetMs: 20, aiArbejdsrum: { chat: { intern: { tekst: "Må aldrig sendes" } } }, noter: { intern: { tekst: "Intern note" } }, svarKladder: { svar: nytSvar } },
    [`udbyder/mailjobs/${godkendtId}`]: { ...nytSvar, id: godkendtId, art: "sagssvar", status: "kladde", traadId: godkendtId, svarKladdeId: "svar", revision: 1 },
  });
  const payloads = [];
  await koerMailjobWorker({ db, jobId: godkendtId, forventetRevision: 1, ejerUid: "syntetisk-ejer", transport: async ({ job }) => { payloads.push(job); return { providerDraftId: "lokal-v731" }; } });
  assert.equal(payloads.length, 1);
  const samletSvar = `${payloads[0].tekst}${payloads[0].signatur ? `\n\n${payloads[0].signatur}` : ""}`;
  assert.equal((samletSvar.match(/Venlig hilsen/g) || []).length, 1);
  assert.equal(payloads[0].aiArbejdsrum, undefined);
  assert.equal(payloads[0].noter, undefined);
  resultater.push({ scenario: "ny_godkendelse_én_signatur", transportkald: payloads.length, venligHilsenForekomster: 1, status: "accepteret_af_graph", internChatITransport: false, interneNoterITransport: false });
  await ryd(godkendtId);

  const output = resolve(process.env.V731_MAILWORKER_RESULTAT || "docs/screenshots/ejer-review-v7-3-1/signature-transport-proof.json");
  mkdirSync(dirname(output), { recursive: true });
  const bevis = { version: "V7.3.1", projekt, adapter: "lokal_injiceret_transport", eksternAfsendelse: false, resultater };
  writeFileSync(output, `${JSON.stringify(bevis, null, 2)}\n`);
  console.log(JSON.stringify(bevis, null, 2));
} finally {
  await deleteApp(app);
}
