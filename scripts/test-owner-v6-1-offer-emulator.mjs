/* V6.1: verificerer v3-arv, lokal AI, gem/genindlæs og uændret v2/PDF. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
import { lokaltTilbudsforslag } from "../src/fleet/ejer-v6-regler.js";

const projekt = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const hosts = { auth: process.env.FIREBASE_AUTH_EMULATOR_HOST, database: process.env.FIREBASE_DATABASE_EMULATOR_HOST, functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST, storage: process.env.FIREBASE_STORAGE_EMULATOR_HOST };
assert.match(projekt, /^demo-/);
assert.deepEqual(hosts, { auth: "127.0.0.1:9099", database: "127.0.0.1:9000", functions: "127.0.0.1:5001", storage: "127.0.0.1:9199" });
assert.ok(process.env.VITE_DEV_BRUGER_KODE);
const app = initializeApp({ projectId: projekt, databaseURL: `http://${hosts.database}?ns=${projekt}`, storageBucket: `${projekt}.appspot.com` }, "offer-v6-1");
const db = getDatabase(app);
const id = "flow_quote_20260910";
const url = (navn) => `http://${hosts.functions}/${projekt}/europe-west1/${navn}`;
async function login() { const r = await fetch(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=lokal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ejer@demo.veyro.invalid", password: process.env.VITE_DEV_BRUGER_KODE, returnSecureToken: true }) }); const j = await r.json(); assert.equal(r.ok, true, JSON.stringify(j)); return j.idToken; }
async function kald(navn, data, token) { const r = await fetch(url(navn), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) }); const j = await r.json(); if (j.error) throw new Error(`${j.error.status}: ${j.error.message}`); return j.result; }
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

try {
  const token = await login();
  let tilbud = (await db.ref(`udbyder/tilbud/${id}`).once("value")).val();
  assert.equal(Number(tilbud.accept?.version), 2);
  const v2Foer = structuredClone(tilbud.versioner[2].snapshot);
  if (!tilbud.versioner[2].pdf?.storagePath) await kald("tilbudpdfgenerer", { id, version: 2 }, token);
  tilbud = (await db.ref(`udbyder/tilbud/${id}`).once("value")).val();
  const pdfPath = tilbud.versioner[2].pdf.storagePath;
  const [pdfFoer] = await getStorage(app).bucket().file(pdfPath).download();
  if (tilbud.status !== "kladde") await kald("tilbudrevisionstart", { id, forventetRevision: tilbud.revision }, token);
  tilbud = (await db.ref(`udbyder/tilbud/${id}`).once("value")).val();
  for (const felt of ["indledning", "behovstekst", "loesningsbeskrivelse", "linjer", "prislisteId", "generelRabatBps"]) assert.deepEqual(tilbud.kladde[felt], v2Foer[felt], `${felt} blev ikke arvet fra v2.`);
  const original = tilbud.kladde.indledning;
  const foerste = lokaltTilbudsforslag({ felt: "indledning", kunde: "Flowtest ApS", instruks: "", pilot: false });
  const instruktion = "Gør teksten kortere og skriv ikke denne instruktion i tilbuddet";
  const revideret = lokaltTilbudsforslag({ felt: "indledning", kunde: "Flowtest ApS", instruks: instruktion, pilot: false });
  assert.ok(revideret.length < foerste.length);
  assert.doesNotMatch(revideret, /skriv ikke denne instruktion|instruktion/i);
  const struktureretFoer = JSON.stringify({ linjer: tilbud.kladde.linjer, rabat: tilbud.kladde.generelRabatBps, intro: tilbud.kladde.introRabatBps, prislisteId: tilbud.kladde.prislisteId });
  const gemt = await kald("tilbudgem", { ...tilbud.kladde, id, indledning: revideret, operationId: `v61_${Date.now()}`, forventetRevision: tilbud.revision }, token);
  tilbud = (await db.ref(`udbyder/tilbud/${id}`).once("value")).val();
  assert.equal(tilbud.kladde.indledning, revideret);
  assert.equal(JSON.stringify({ linjer: tilbud.kladde.linjer, rabat: tilbud.kladde.generelRabatBps, intro: tilbud.kladde.introRabatBps, prislisteId: tilbud.kladde.prislisteId }), struktureretFoer);
  assert.deepEqual(tilbud.versioner[2].snapshot, v2Foer);
  const [pdfEfter] = await getStorage(app).bucket().file(pdfPath).download();
  assert.equal(hash(pdfEfter), hash(pdfFoer));
  const resultat = { projekt, tilbudId: id, accepteretVersion: 2, nyKladdeVersion: 3, revision: gemt.revision, arv: true, original, foersteForslag: foerste, revideretForslag: revideret, revideretErKortere: true, saelgerinstruksIkkeLaekket: true, struktureretOekonomiUaendret: true, v2SnapshotUaendret: true, v2PdfSha256Foer: hash(pdfFoer), v2PdfSha256Efter: hash(pdfEfter), eksternAI: false };
  const output = resolve(process.env.V61_TILBUD_RESULTAT || "docs/screenshots/ejer-review-v6-1/offer-workflow-result.json"); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(resultat, null, 2)}\n`); console.log(`V6.1 tilbud: arv, AI, gem/genindlæs og v2-hash bestået; ${output}`);
} finally { await deleteApp(app); }
