/* Lokal E2E for fælles mail, support og konkret svar-godkendelse.
 * Kører kun mod demo-projektets fire localhost-emulatorer. Ingen mail sendes. */
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

const projekt = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const vaerter = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  database: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
  functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST,
  storage: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
};
assert.match(projekt, /^demo-/);
assert.deepEqual(vaerter, { auth: "127.0.0.1:9099", database: "127.0.0.1:9000", functions: "127.0.0.1:5001", storage: "127.0.0.1:9199" });
assert.ok(process.env.VITE_DEV_BRUGER_KODE, "VITE_DEV_BRUGER_KODE skal komme fra den git-ignorerede emulatorfil.");

const app = initializeApp({ projectId: projekt, databaseURL: `http://${vaerter.database}?ns=${projekt}` }, "ejer-kommunikation-v2-test");
const db = getDatabase(app);
const url = (navn) => `http://${vaerter.functions}/${projekt}/europe-west1/${navn}`;

async function logInd() {
  const svar = await fetch(`http://${vaerter.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-test`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "ejer@demo.veyro.invalid", password: process.env.VITE_DEV_BRUGER_KODE, returnSecureToken: true }),
  });
  const json = await svar.json();
  assert.equal(svar.ok, true, JSON.stringify(json));
  return json.idToken;
}

async function kald(navn, data, token) {
  const svar = await fetch(url(navn), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
  const json = await svar.json();
  if (json.error) throw new Error(`${json.error.status || "FUNCTION_ERROR"}: ${json.error.message}`);
  return json.result;
}

async function afvises(handling, mønster) {
  let fejl;
  try { await handling(); } catch (error) { fejl = error; }
  assert.ok(fejl, "Handlingen skulle være afvist.");
  assert.match(fejl.message, mønster);
}

try {
  const token = await logInd();
  const ejer = await getAuth(app).getUserByEmail("ejer@demo.veyro.invalid");
  const supportRef = db.ref("udbyder/salgsindbakke/traade/review-support");
  let support = (await supportRef.once("value")).val();
  assert.equal(support.sagstype, "support");
  const overtaget = await kald("supportsagopdater", {
    traadId: support.id, status: "afventer_os", type: support.support.type,
    prioritet: support.support.prioritet, modul: support.support.modul,
    fristMs: support.support.fristMs, ansvarligUid: ejer.uid,
    forventetRevision: support.revision,
  }, token);
  await afvises(() => kald("supportsagopdater", {
    traadId: support.id, status: "loest", type: support.support.type,
    prioritet: support.support.prioritet, modul: support.support.modul,
    ansvarligUid: support.ansvarligUid, forventetRevision: support.revision,
  }, token), /ABORTED|samtidigt/i);
  support = (await supportRef.once("value")).val();
  assert.equal(support.revision, overtaget.revision);

  const indgaaendeFoer = Object.keys(support.beskeder || {}).length;
  const kladde = await kald("kommunikationssvarkladdegem", {
    traadId: support.id, fra: "info@veyrosystems.com", til: support.kontaktEmail,
    emne: `Re: ${support.emne}`, tekst: "Syntetisk svarudkast. Ingen ekstern afsendelse.",
    signatur: "Veyro Systems", vedhaeftninger: [], basisAktivitetMs: support.senesteAktivitetMs,
    forventetRevision: 0,
  }, token);
  const godkendt = await kald("kommunikationssvargodkend", { traadId: support.id, id: kladde.id, forventetRevision: kladde.revision }, token);
  await supportRef.update({ senesteAktivitetMs: support.senesteAktivitetMs + 1 });
  await afvises(() => kald("kommunikationssvarafsend", { traadId: support.id, id: kladde.id, forventetRevision: godkendt.revision }, token), /ABORTED|ændret/i);
  support = (await supportRef.once("value")).val();
  assert.equal(Object.keys(support.beskeder || {}).length, indgaaendeFoer, "Den forældede godkendelse må ikke sende eller skrive en besked.");

  const leverandoerer = await kald("ejerleverandoererhent", {}, token);
  assert.ok(leverandoerer.poster["review-hosting"]);
  const leverandoer = leverandoerer.poster["review-hosting"];
  const gemt = await kald("ejerleverandoergem", { ...leverandoer, noter: `${leverandoer.noter}\nLokalt E2E-kontrolleret.`, forventetRevision: leverandoer.revision }, token);
  assert.equal(gemt.revision, leverandoer.revision + 1);

  console.log("Ejerkommunikation V2 E2E: supportovertagelse, samtidighed, konkret godkendelse, stale-svarblokering og ejerleverandører er verificeret uden afsendelse.");
} finally {
  await deleteApp(app);
}
