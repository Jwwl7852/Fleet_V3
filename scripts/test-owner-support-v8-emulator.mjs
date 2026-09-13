/* V8 accepttest mod localhost-emulatorer. Ingen ekstern AI eller mail. */
import assert from "node:assert/strict";

const projekt = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const hosts = { auth: process.env.FIREBASE_AUTH_EMULATOR_HOST, database: process.env.FIREBASE_DATABASE_EMULATOR_HOST, functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST, storage: process.env.FIREBASE_STORAGE_EMULATOR_HOST };
assert.match(projekt, /^demo-/); assert.deepEqual(hosts, { auth: "127.0.0.1:9099", database: "127.0.0.1:9000", functions: "127.0.0.1:5001", storage: "127.0.0.1:9199" });
assert.ok(process.env.VITE_DEV_BRUGER_KODE);
const dbUrl = (path) => `http://${hosts.database}/${path}.json?ns=${projekt}`;
const dbGet = async (path) => { const r = await fetch(dbUrl(path)); assert.equal(r.ok, true); return r.json(); };
const dbPut = async (path, value) => { const r = await fetch(dbUrl(path), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); assert.equal(r.ok, true); };
const login = async (email) => { const r = await fetch(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=v8-local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: process.env.VITE_DEV_BRUGER_KODE, returnSecureToken: true }) }); const j = await r.json(); assert.equal(r.ok, true, JSON.stringify(j)); return j.idToken; };
const call = async (name, data, token) => { const r = await fetch(`http://${hosts.functions}/${projekt}/europe-west1/${name}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) }); const j = await r.json(); if (j.error) { const e = new Error(`${j.error.status}: ${j.error.message}`); e.status = j.error.status; throw e; } return j.result; };
const fingerprint = (value = "") => { let hash = 2166136261; for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, "0"); };
const profiler = await dbGet("profiler") || {}; const alleProfiler = Object.entries(profiler).map(([uid, profil]) => ({ ...(profil || {}), uid: profil?.uid || uid }));
const dennis = alleProfiler.find((p) => /dennis/i.test(`${p?.navn} ${p?.email}`)) || alleProfiler.find((p) => !/j(ø|o)rn/i.test(`${p?.navn} ${p?.email}`)); const joern = alleProfiler.find((p) => /j(ø|o)rn/i.test(`${p?.navn} ${p?.email}`));
assert.ok(dennis?.email && joern?.email); const dennisToken = await login(dennis.email); const joernToken = await login(joern.email);
const fresh = async (id, token = dennisToken) => (await call("ejerkommunikationhent", {}, token)).traade[id];
const payload = (sag, operationId, instruktion) => { const kladde = Object.values(sag.svarKladder || {}).sort((a, b) => Number(b.opdateretMs || 0) - Number(a.opdateretMs || 0))[0] || {}; return { traadId: sag.id, operationId, instruktion, forventetRevision: Number(sag.aiArbejdsrum?.revision || 0), basisAktivitetMs: sag.senesteAktivitetMs, basisKladdeRevision: Number(kladde.revision || 0), basisKladdeFingeraftryk: fingerprint(kladde.tekst || "") }; };

const kendt = await fresh("v8-support-kendt"); const kendtResultat = await call("supportaiforslaggem", payload(kendt, "v8-e1-dennis", "Opsummér, fejlfind og lav et kort svar med dokumenterede kilder."), dennisToken);
assert.equal(kendtResultat.harKundegodkendtLoesning, true); assert.equal(kendtResultat.antalKilder, 2);
const efterDennis = await fresh("v8-support-kendt", joernToken); const aktivt = efterDennis.aiArbejdsrum.aktivtForslag;
assert.match(aktivt.tekst, /Log helt ud/); assert.doesNotMatch(aktivt.tekst, /claim-cache/); assert.equal(aktivt.kilder.some((k) => k.publikum === "intern"), true);
const joernResultat = await call("supportaiforslaggem", payload(efterDennis, "v8-e1-joern", "Behold fakta og gør næste spørgsmål tydeligt."), joernToken);
assert.equal(joernResultat.ok, true); const efterJoern = await fresh("v8-support-kendt");
assert.equal(Object.values(efterJoern.aiArbejdsrum.chat).some((post) => post.aktorUid === dennis.uid), true);
assert.equal(Object.values(efterJoern.aiArbejdsrum.chat).some((post) => post.aktorUid === joern.uid), true);
assert.equal(Object.values(efterJoern.noter || {}).length, 3); assert.equal(Object.values(efterJoern.noter).every((note) => note.intern === true), true);
const kladde = efterJoern.svarKladder.k1; const gemt = await call("kommunikationssvarkladdegem", { traadId: efterJoern.id, id: kladde.id, fra: kladde.fra, til: kladde.til, emne: kladde.emne, tekst: kladde.tekst, signatur: kladde.signatur, vedhaeftninger: [], basisAktivitetMs: efterJoern.senesteAktivitetMs, forventetRevision: kladde.revision }, dennisToken); assert.equal(gemt.ok, true);
const gemtKladde = (await fresh("v8-support-kendt")).svarKladder.k1; const godkendt = await call("kommunikationssvargodkend", { traadId: efterJoern.id, id: gemtKladde.id, forventetRevision: gemtKladde.revision }, dennisToken); assert.equal(godkendt.ok, true);
const kundeKladde = (await fresh("v8-support-kendt")).svarKladder.k1; const kundePayload = { fra: kundeKladde.fra, til: kundeKladde.til, emne: kundeKladde.emne, tekst: [kundeKladde.tekst, kundeKladde.signatur].filter(Boolean).join("\n\n"), vedhaeftninger: kundeKladde.vedhaeftninger || [] };
assert.equal((kundePayload.tekst.match(/Venlig hilsen/g) || []).length, 1); assert.doesNotMatch(JSON.stringify(kundePayload), /Bekræft versionsnummer|claim-cache|aiArbejdsrum|interne noter/i);

const ukendt = await fresh("v8-support-ukendt"); const ukendtResultat = await call("supportaiforslaggem", payload(ukendt, "v8-e2-ukendt", "Find en sikker løsning eller spørg om det manglende."), dennisToken);
assert.equal(ukendtResultat.harKundegodkendtLoesning, false); const ukendtEfter = await fresh("v8-support-ukendt");
assert.match(ukendtEfter.aiArbejdsrum.aktivtForslag.tekst, /ikke tilstrækkeligt godkendt grundlag/); assert.match(ukendtEfter.aiArbejdsrum.aktivtForslag.tekst, /produktversion/); assert.equal(Object.values(ukendtEfter.aiArbejdsrum.aktivtForslag.kilder || {}).length, 0);

const staleBasis = await fresh("v8-support-ukendt"); const gammelAktivitet = staleBasis.senesteAktivitetMs; await dbPut("udbyder/salgsindbakke/traade/v8-support-ukendt/senesteAktivitetMs", gammelAktivitet + 1);
await assert.rejects(() => call("supportaiforslaggem", payload(staleBasis, "v8-e3-stale", "Må ikke overskrive"), dennisToken), /FAILED_PRECONDITION/);
await dbPut("udbyder/salgsindbakke/traade/v8-support-ukendt/senesteAktivitetMs", gammelAktivitet);
const privat = await fresh("v8-private-dennis"); await assert.rejects(() => call("supportaiforslaggem", payload(privat, "v8-e6-private", "Må ikke læses"), joernToken), /PERMISSION_DENIED/);
const mailjobs = await dbGet("udbyder/mailjobs") || {}; assert.equal(Object.values(mailjobs).some((job) => job.traadId === "v8-support-kendt" || job.traadId === "v8-support-ukendt"), false);
console.log(JSON.stringify({ ok: true, version: "V8.1 Support-afstemning", E1_knownKnowledge: true, E2_unknownNoInventedFix: true, E3_staleRejected: true, E4_sameCaseDennisJoern: true, E5_internalExcludedAndNoMailjob: true, E6_privateDenied: true, R6_localApprovedCustomerPayload: { oneSignature: true, internalContentExcluded: true, recipient: kundePayload.til }, externalAiCalled: false, mailSent: false }, null, 2));
