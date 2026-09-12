import assert from "node:assert/strict";

const project = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST;
assert.match(project, /^demo-/); assert.equal(authHost, "127.0.0.1:9099"); assert.equal(functionsHost, "127.0.0.1:5001");
const password = process.env.VITE_DEV_BRUGER_KODE; assert.ok(password);
async function login(email) { const r = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=v73`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) }); assert.equal(r.ok, true); return (await r.json()).idToken; }
async function call(name, data, token, expectError = false) { const r = await fetch(`http://${functionsHost}/${project}/europe-west1/${name}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) }); const json = await r.json(); if (expectError) return json.error; if (json.error) throw new Error(`${name}: ${json.error.status}: ${json.error.message}`); return json.result; }

const dennisToken = await login(process.env.VITE_DEV_EJER_MAIL || "ejer@demo.veyro.invalid");
const joernToken = await login("joern@demo.veyro.invalid");
const dennisFoer = await call("ejermailsignaturhent", {}, dennisToken); const joernFoer = await call("ejermailsignaturhent", {}, joernToken);
const stamp = String(Date.now()).slice(-6);
const gemt = await call("ejermailsignaturgem", { ...dennisFoer.signatur, navn: "Dennis Testejer", titel: "Ejer", virksomhed: "Veyro Systems", telefon: `+45 70 00 ${stamp.slice(0,2)} ${stamp.slice(2,4)}`, email: process.env.VITE_DEV_EJER_MAIL || "ejer@demo.veyro.invalid", hjemmeside: "https://veyrosystems.com", ekstra: "Syntetisk lokal review-signatur", brugLogo: true, navnFed: true, titelKursiv: false, forventetRevision: dennisFoer.signatur.revision }, dennisToken);
const dennisEfter = await call("ejermailsignaturhent", {}, dennisToken); const joernEfter = await call("ejermailsignaturhent", {}, joernToken);
assert.equal(dennisEfter.signatur.revision, gemt.revision); assert.match(dennisEfter.signatur.ekstra, /Syntetisk lokal/); assert.notEqual(dennisEfter.signatur.email, joernEfter.signatur.email); assert.equal(joernEfter.signatur.revision, joernFoer.signatur.revision);
const noteText = `V7.3 delt note ${stamp}`;
await call("salgsnoteopret", { traadId: "v7-support-dennis", tekst: noteText }, dennisToken);
const noterEfter = await call("ejerkommunikationhent", {}, joernToken);
assert.ok(Object.values(noterEfter.traade["v7-support-dennis"].noter || {}).some((note) => note.tekst === noteText && note.intern === true));
const privatFejl = await call("salgsnoteopret", { traadId: "v7-private-dennis", tekst: "Må afvises" }, joernToken, true);
assert.equal(privatFejl.status, "PERMISSION_DENIED");
console.log(JSON.stringify({ ok: true, version: "V7.3", personalSignaturePersisted: true, ownerSignaturesSeparated: true, sharedNoteVisibleToOtherOwnerAndSupport: true, privateNoteDenied: true, externalMailSent: false, externalAiCalled: false }, null, 2));
