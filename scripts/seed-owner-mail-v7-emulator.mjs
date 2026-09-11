/* V7 mailfixture og kontraktkontrol. Kører kun mod alle fire localhost-emulatorer. */
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { byggEjerClaims } from "../src/fleet/ejeradgang.js";

const projekt = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const hosts = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  database: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
  functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST,
  storage: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
};
assert.match(projekt, /^demo-/);
assert.deepEqual(hosts, { auth: "127.0.0.1:9099", database: "127.0.0.1:9000", functions: "127.0.0.1:5001", storage: "127.0.0.1:9199" });
assert.ok(process.env.VITE_DEV_BRUGER_KODE, "Den git-ignorerede lokale ejerloginfixture mangler.");

const app = initializeApp({ projectId: projekt, databaseURL: `http://${hosts.database}?ns=${projekt}` }, "ejer-mail-v7-seed");
const auth = getAuth(app);
const marker = (value) => `[SYNTETISK V7-TESTDATA — ingen ekstern forbindelse]\n${value}`;
const url = (name) => `http://${hosts.functions}/${projekt}/europe-west1/${name}`;
const dbUrl = (path = "") => `http://${hosts.database}/${path}.json?ns=${projekt}`;
async function dbGet(path) { const response = await fetch(dbUrl(path)); assert.equal(response.ok, true); return response.json(); }
async function dbPut(path, value) { const response = await fetch(dbUrl(path), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); assert.equal(response.ok, true); }
async function dbPatch(value) { const response = await fetch(dbUrl(), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); assert.equal(response.ok, true); }
async function login(email) {
  const response = await fetch(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=v7-local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: process.env.VITE_DEV_BRUGER_KODE, returnSecureToken: true }) });
  const json = await response.json(); assert.equal(response.ok, true, JSON.stringify(json)); return json.idToken;
}
async function call(name, data, token) {
  const response = await fetch(url(name), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
  const json = await response.json(); if (json.error) throw new Error(`${name}: ${json.error.status}: ${json.error.message}`); return json.result;
}
async function ensureOwner(email, displayName) {
  console.error(`V7 seed: sikrer lokal ejer ${displayName}`);
  let user;
  try { user = await auth.getUserByEmail(email); console.error(`V7 seed: ${displayName} findes`); user = await auth.updateUser(user.uid, { password: process.env.VITE_DEV_BRUGER_KODE, displayName, emailVerified: true, disabled: false }); }
  catch (error) { if (error?.code !== "auth/user-not-found") throw error; console.error(`V7 seed: opretter ${displayName}`); user = await auth.createUser({ email, password: process.env.VITE_DEV_BRUGER_KODE, displayName, emailVerified: true }); }
  console.error(`V7 seed: sætter ejerclaim for ${displayName}`);
  await auth.setCustomUserClaims(user.uid, byggEjerClaims({}));
  console.error(`V7 seed: skriver profil for ${displayName}`);
  await dbPut(`profiler/${user.uid}`, { uid: user.uid, navn: displayName, email, aktiv: true, fixture: true });
  return user;
}

try {
  console.error("V7 seed: starter");
  const dennis = await ensureOwner(process.env.VITE_DEV_EJER_MAIL || "ejer@demo.veyro.invalid", "Dennis Testejer");
  const joern = await ensureOwner("joern@demo.veyro.invalid", "Jørn Testejer");
  console.error("V7 seed: lokale ejere klar");
  const dennisToken = await login(dennis.email); const joernToken = await login(joern.email);
  console.error("V7 seed: lokale logins klar");
  const now = Date.now(); const day = 86_400_000;
  const current = await dbGet("udbyder/salgsindbakke/traade/review-nordlys") || {};
  const companyId = current.links?.virksomhedId || "v7-review-company";
  const opportunityId = current.links?.mulighedId || "v7-review-opportunity";
  const threads = {};
  const mailboxShared = { info: { mailboxId: "fixture-info", adresse: "info@veyrosystems.com", mappe: "inbox", type: "delt", ejerUid: "" } };
  const mailboxDennis = { dennis: { mailboxId: "fixture-dennis", adresse: dennis.email, mappe: "inbox", type: "personlig", ejerUid: dennis.uid } };
  const mailboxJoern = { joern: { mailboxId: "fixture-joern", adresse: joern.email, mappe: "inbox", type: "personlig", ejerUid: joern.uid } };
  const common = (id, extra = {}) => ({ id, status: "afventer_os", delingsstatus: "delt", sagstype: "kundedialog", ansvarligUid: dennis.uid, kontaktNavn: "Maria Lund", kontaktEmail: `kontakt-${id}@syntetisk.veyro.invalid`, virksomhedsnavn: "Nordlys Drift", senesteFra: `kontakt-${id}@syntetisk.veyro.invalid`, senesteRetning: "indgaaende", senesteAktivitetMs: now, oprettetMs: now - day, opdateretMs: now, revision: 1, kilde: { art: "fixture", adapter: "v7_local" }, postkasseKilder: mailboxShared, ...extra });

  threads["v7-pilot-nordlys"] = common("v7-pilot-nordlys", {
    emne: "Pilotprojekt · Nordlys Drift", sagstype: "salg", kontaktEmail: "maria@nordlys.syntetisk.invalid", virksomhedsnavn: "Nordlys Drift · syntetisk", postkasseKilder: { ...mailboxShared, ...mailboxDennis }, links: { virksomhedId: companyId, mulighedId: opportunityId, tilbudId: current.links?.tilbudId || "" },
    beskeder: {
      m1: { id: "m1", provider: "fixture", internetMessageId: "<v7-pilot@nordlys.invalid>", retning: "indgaaende", fra: "maria@nordlys.syntetisk.invalid", til: dennis.email, emne: "Vedr. pilotprojekt med FLEET", tekst: marker("Vi vil prøve FLEET på 25 enheder i tre måneder. Vi bliver fem brugere, hvoraf to skal administrere løsningen. Kan I sende et tilbud med OBD og en kort beskrivelse af opstarten?"), sendtMs: now - 4 * 3_600_000, vedhaeftninger: [{ id: "a1", navn: "Behov og use cases.pdf", mime: "application/pdf", stoerrelse: 438272, status: "metadata" }] },
      m2: { id: "m2", provider: "fixture", retning: "udgaaende", fra: "info@veyrosystems.com", til: "maria@nordlys.syntetisk.invalid", emne: "Re: Vedr. pilotprojekt med FLEET", tekst: marker("Tak for henvendelsen. Vi samler afklaringerne i denne fælles sag."), sendtMs: now - 3 * 3_600_000 },
    },
    analyser: { a1: { id: "a1", provider: "fixture", model: "lokal deterministisk adapter", behov: ["25 enheder", "3 måneders pilot", "5 brugere", "2 administratorer"], manglendeOplysninger: ["CVR", "startdato", "OBD-antal"], svarudkast: marker("Hej Maria.\n\nTak for den konkrete forespørgsel. Hvilken startdato, CVR og hvilket OBD-antal skal tilbuddet bygge på?\n\nVenlig hilsen\nDennis"), oprettetMs: now - 2 * 3_600_000, revision: 1 } },
    svarKladder: { k1: { id: "k1", fra: "info@veyrosystems.com", til: "maria@nordlys.syntetisk.invalid", emne: "Re: Vedr. pilotprojekt med FLEET", tekst: marker("Hej Maria.\n\nHvilken startdato, CVR og hvilket OBD-antal skal tilbuddet bygge på?"), signatur: "Venlig hilsen\nDennis", vedhaeftninger: [], status: "kladde", basisAktivitetMs: now, revision: 1, oprettetMs: now, opdateretMs: now } },
    opfoelgninger: { f1: { id: "f1", fra: "info@veyrosystems.com", til: "maria@nordlys.syntetisk.invalid", emne: "Opfølgning på pilotprojekt", tekst: marker("Hej Maria. Har I haft mulighed for at gennemgå pilotoplægget?"), signatur: "Venlig hilsen\nDennis", vedhaeftninger: [], status: "kladde", forfalderMs: now, revision: 1, opdateretMs: now } },
  });
  threads["v7-support-dennis"] = common("v7-support-dennis", { emne: "Support · FLEET-login efter adgangsændring", sagstype: "support", virksomhedsnavn: "Nordlys Drift · syntetisk", kontaktEmail: "support@nordlys.syntetisk.invalid", postkasseKilder: mailboxDennis, links: { virksomhedId: companyId }, support: { nummer: "SUP-2026-0071", type: "adgang", status: "triage", prioritet: "hoej", modul: "FLEET", ansvarligUid: dennis.uid, fristMs: now + 2 * 3_600_000 }, beskeder: { m1: { id: "m1", provider: "fixture", retning: "indgaaende", fra: "support@nordlys.syntetisk.invalid", til: dennis.email, emne: "FLEET-login efter adgangsændring", tekst: marker("Tre brugere kan ikke logge ind. Kan I hjælpe uden at ændre andre rettigheder?"), sendtMs: now - 2 * 3_600_000 } } });
  threads["v7-domicil"] = common("v7-domicil", { emne: "Domicil · Leje af kontor", sagstype: "intern", internMappe: "Domicil", foreslaaetMappe: "Domicil", postkasseKilder: mailboxDennis, kontaktNavn: "Anders Mikkelsen", kontaktEmail: "anders@domicil.syntetisk.invalid", beskeder: { m1: { id: "m1", provider: "fixture", retning: "indgaaende", fra: "anders@domicil.syntetisk.invalid", til: dennis.email, emne: "Udkast til lejevilkår", tekst: marker("Vi har vedhæftet et udkast til lejevilkår. Kan I vende tilbage senest fredag?"), sendtMs: now - day, vedhaeftninger: [{ id: "d1", navn: "Udkast_lejevilkår.pdf", mime: "application/pdf", stoerrelse: 355328, status: "metadata" }] }, m2: { id: "m2", provider: "fixture", retning: "indgaaende", fra: "anders@domicil.syntetisk.invalid", til: dennis.email, emne: "Depositum og vilkår", tekst: marker("Depositum og overtagelsesdato fremgår af den seneste version."), sendtMs: now - 5 * 3_600_000 } }, dokumenter: { d1: { id: "d1", navn: "Udkast_lejevilkår.pdf", status: "metadata" } }, noter: { n1: { id: "n1", tekst: marker("Afklar overtagelsesdato og gennemgå depositum."), oprettetAf: joern.uid, oprettetMs: now - 3_600_000 } } });
  threads["v7-private-dennis"] = common("v7-private-dennis", { emne: "Personlig Dennis-sag", delingsstatus: "privat", postkasseKilder: mailboxDennis, kontaktNavn: "Privat Dennis", ansvarligUid: dennis.uid });
  threads["v7-private-joern"] = common("v7-private-joern", { emne: "Personlig Jørn-sag", delingsstatus: "privat", postkasseKilder: mailboxJoern, kontaktNavn: "Privat Jørn", ansvarligUid: joern.uid });
  threads["v7-followup-joern"] = common("v7-followup-joern", { emne: "Jørns opfølgning må ikke vises hos Dennis", ansvarligUid: joern.uid, opfoelgninger: { f1: { id: "f1", fra: "info@veyrosystems.com", til: "joern-kunde@syntetisk.invalid", emne: "Jørns opfølgning", tekst: marker("Kun Jørns arbejdsvisning."), signatur: "Jørn", vedhaeftninger: [], status: "kladde", forfalderMs: now, revision: 1, opdateretMs: now } } });

  const names = ["Vestby Service", "Havneparken Ejendomme", "FjordEnergi", "Nordby Transport", "Sydholm Drift", "Kystens Teknik", "Midtby Facility"];
  const subjects = ["Afklar pilotstart", "Spørgsmål til tilbud", "Nyt forslag til elaftale", "Opfølgning på service", "Dokumentation til gennemgang"];
  for (let index = 1; index <= 112; index += 1) {
    const id = `v7-list-${String(index).padStart(3, "0")}`; const owner = index % 3 === 0 ? joern.uid : dennis.uid; const name = `${names[index % names.length]} ${String(index).padStart(3, "0")}`;
    threads[id] = common(id, { emne: `${subjects[index % subjects.length]} · ${name}`, kontaktNavn: name, kontaktEmail: `kontakt${index}@mailfixture.invalid`, virksomhedsnavn: name, ansvarligUid: owner, status: index % 9 === 0 ? "ny" : index % 4 === 0 ? "afventer_kunden" : "afventer_os", senesteAktivitetMs: now - index * 45 * 60_000, laest: index % 9 !== 0, beskeder: { m1: { id: "m1", provider: "fixture", internetMessageId: `<v7-${index}@mailfixture.invalid>`, retning: "indgaaende", fra: `kontakt${index}@mailfixture.invalid`, til: "info@veyrosystems.com", emne: subjects[index % subjects.length], tekst: marker(`Syntetisk samtale ${index}. Vi ønsker en afklaring af næste skridt.`), sendtMs: now - index * 45 * 60_000, ...(index % 7 === 0 ? { vedhaeftninger: [{ id: `a${index}`, navn: `bilag-${index}.pdf`, mime: "application/pdf", stoerrelse: 12000, status: "metadata" }] } : {}) } }, ...(index <= 4 ? { analyser: { a1: { id: "a1", provider: "fixture", manglendeOplysninger: ["næste aftale"], oprettetMs: now - index * 1000 } } } : {}) });
  }

  const update = Object.fromEntries(Object.entries(threads).map(([id, value]) => [`udbyder/salgsindbakke/traade/${id}`, value]));
  Object.assign(update, {
    "udbyder/integrationer/microsoft365/status": "ikke_tilsluttet",
    "udbyder/integrationer/openai/status": "ikke_tilsluttet",
    "udbyder/integrationer/dinero/status": "ikke_tilsluttet",
    "udbyder/integrationer/ocr/status": "ikke_tilsluttet",
    "udbyder/integrationer/bilagsmail/status": "ikke_tilsluttet",
  });
  console.error(`V7 seed: skriver ${Object.keys(threads).length} syntetiske tråde`);
  await dbPatch(update);
  console.error("V7 seed: data skrevet");

  const dennisView = await call("ejerkommunikationhent", {}, dennisToken); const joernView = await call("ejerkommunikationhent", {}, joernToken);
  console.error("V7 seed: ejerfiltre hentet");
  assert.ok(dennisView.traade["v7-private-dennis"]); assert.equal(dennisView.traade["v7-private-joern"], undefined);
  assert.ok(joernView.traade["v7-private-joern"]); assert.equal(joernView.traade["v7-private-dennis"], undefined);
  assert.ok(dennisView.traade["v7-support-dennis"] && joernView.traade["v7-support-dennis"], "Support skal være fælles for begge ejere.");
  assert.equal(Object.keys(dennisView.traade).filter((id) => id.startsWith("v7-list-")).length, 112);
  const operationId = "v7-new-mail-idempotent";
  const first = await call("kommunikationsnykladdeopret", { operationId, fra: "info@veyrosystems.com", til: "ny@syntetisk.invalid", emne: "Ny syntetisk V7-mail", tekst: marker("Gem som kladde."), signatur: "Dennis", vedhaeftninger: [], sagstype: "kundedialog", delingsstatus: "delt" }, dennisToken);
  const second = await call("kommunikationsnykladdeopret", { operationId, fra: "info@veyrosystems.com", til: "ny@syntetisk.invalid", emne: "Ny syntetisk V7-mail", tekst: marker("Gem som kladde."), signatur: "Dennis", vedhaeftninger: [], sagstype: "kundedialog", delingsstatus: "delt" }, dennisToken);
  assert.equal(first.traadId, second.traadId); assert.equal(second.oprettet, false);
  console.log(JSON.stringify({ ok: true, v7Threads: Object.keys(threads).length, listThreads: 112, privacy: "Dennis/Jørn private scopes separated", sharedSupport: true, newDraftIdempotent: true, externalMailSent: false }, null, 2));
} finally {
  await deleteApp(app);
}
