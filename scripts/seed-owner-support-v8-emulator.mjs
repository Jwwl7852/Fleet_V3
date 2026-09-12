/* Syntetisk V8 Support-AI-reviewfixture. Må kun køre mod lokale emulatorer. */
import assert from "node:assert/strict";

const projekt = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const hosts = { auth: process.env.FIREBASE_AUTH_EMULATOR_HOST, database: process.env.FIREBASE_DATABASE_EMULATOR_HOST, functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST, storage: process.env.FIREBASE_STORAGE_EMULATOR_HOST };
assert.match(projekt, /^demo-/); assert.deepEqual(hosts, { auth: "127.0.0.1:9099", database: "127.0.0.1:9000", functions: "127.0.0.1:5001", storage: "127.0.0.1:9199" });
const dbUrl = (path = "") => `http://${hosts.database}/${path}.json?ns=${projekt}`;
const dbGet = async (path) => { const r = await fetch(dbUrl(path)); assert.equal(r.ok, true); return r.json(); };
const dbPatch = async (value) => { const r = await fetch(dbUrl(), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); assert.equal(r.ok, true); };
const marker = (value) => `[SYNTETISK V8-TESTDATA — ingen ekstern forbindelse]\n${value}`;

const profiler = await dbGet("profiler") || {};
const dennis = Object.values(profiler).find((profil) => /dennis/i.test(`${profil?.navn || ""} ${profil?.email || ""}`)) || Object.values(profiler)[0];
const joern = Object.values(profiler).find((profil) => /j(ø|o)rn/i.test(`${profil?.navn || ""} ${profil?.email || ""}`));
assert.ok(dennis?.uid && joern?.uid, "Kør V7-reviewseed først, så begge lokale ejere findes.");
const now = Date.now(); const shared = { info: { mailboxId: "fixture-info", adresse: "info@veyrosystems.com", mappe: "inbox", type: "delt", ejerUid: "" } };
const common = (id, extra) => ({ id, sagstype: "support", delingsstatus: "delt", status: "afventer_os", ansvarligUid: dennis.uid, kontaktNavn: "Maja Larsen", kontaktEmail: `kontakt-${id}@syntetisk.veyro.invalid`, virksomhedsnavn: "Nordlys Drift · syntetisk", senesteFra: `kontakt-${id}@syntetisk.veyro.invalid`, senesteRetning: "indgaaende", senesteAktivitetMs: now, oprettetMs: now - 86_400_000, opdateretMs: now, revision: 1, kilde: { art: "fixture", adapter: "v8_support_local" }, postkasseKilder: shared, links: { virksomhedId: "v7-review-company" }, ...extra });
const threads = {
  "v8-support-kendt": common("v8-support-kendt", {
    emne: "Support · Session udløber efter adgangsændring",
    support: { nummer: "SUP-2026-0081", type: "adgang", status: "afventer_os", prioritet: "hoej", modul: "FLEET", version: "3.4.2", fejltekst: "Session expired", forsoegt: "Browser genstartet; problemet fortsætter", ansvarligUid: dennis.uid, fristMs: now + 7_200_000 },
    beskeder: { m1: { id: "m1", provider: "fixture", retning: "indgaaende", fra: "maja@nordlys.syntetisk.invalid", til: "info@veyrosystems.com", emne: "Session udløber efter adgangsændring", tekst: marker("Efter en ændring i brugerens adgang får vi teksten 'Session expired' ved næste login. Vi har genstartet browseren. Hvad gør vi?"), sendtMs: now - 3_600_000 } },
    noter: { n1: { id: "n1", tekst: marker("Bekræft versionsnummer og ændr ikke kundens roller under fejlsøgningen."), oprettetAf: joern.uid, oprettetMs: now - 1_800_000, intern: true } },
    sagsOplysninger: { version: { id: "version", label: "Kendt produktversion", vaerdi: "3.4.2", tilstand: "oplyst_af_kunden", kilde: "Kundens mail", raekke: 1 }, fejltekst: { id: "fejltekst", label: "Fejltekst", vaerdi: "Session expired", tilstand: "oplyst_af_kunden", kilde: "Kundens mail", raekke: 2 }, forsoegt: { id: "forsoegt", label: "Allerede forsøgt", vaerdi: "Browser genstartet", tilstand: "oplyst_af_kunden", kilde: "Kundens mail", raekke: 3 } },
    svarKladder: { k1: { id: "k1", fra: "info@veyrosystems.com", til: "maja@nordlys.syntetisk.invalid", emne: "Re: Session udløber efter adgangsændring", tekst: marker("Hej Maja.\n\nVi undersøger sagen og vender tilbage med dokumenterede trin."), signatur: "Venlig hilsen\nDennis Testejer\nEjer\nVeyro Systems", vedhaeftninger: [], status: "kladde", basisAktivitetMs: now, revision: 1, oprettetMs: now, opdateretMs: now } },
  }),
  "v8-support-ukendt": common("v8-support-ukendt", {
    emne: "Support · Synkronisering stopper uden fejltekst", kontaktNavn: "Søren Holm", kontaktEmail: "soeren@ukendt.syntetisk.invalid", virksomhedsnavn: "Vestby Service · syntetisk",
    support: { nummer: "SUP-2026-0082", type: "drift", status: "triage", prioritet: "normal", modul: "FLEET", version: "", fejltekst: "", forsoegt: "", ansvarligUid: dennis.uid, fristMs: now + 21_600_000 },
    beskeder: { m1: { id: "m1", provider: "fixture", retning: "indgaaende", fra: "soeren@ukendt.syntetisk.invalid", til: "info@veyrosystems.com", emne: "Synkronisering stopper", tekst: marker("Synkroniseringen stopper nogle gange. Vi kan ikke se en fejltekst. Kan I rette det?"), sendtMs: now - 2_700_000 } },
    sagsOplysninger: { version: { id: "version", label: "Kendt produktversion", vaerdi: "Ikke oplyst", tilstand: "mangler", kilde: "Ikke fundet i sagen", raekke: 1 }, fejltekst: { id: "fejltekst", label: "Fejltekst eller log", vaerdi: "Ikke oplyst", tilstand: "mangler", kilde: "Ikke fundet i sagen", raekke: 2 }, forsoegt: { id: "forsoegt", label: "Allerede forsøgt", vaerdi: "Ikke oplyst", tilstand: "mangler", kilde: "Ikke fundet i sagen", raekke: 3 } },
    svarKladder: { k1: { id: "k1", fra: "info@veyrosystems.com", til: "soeren@ukendt.syntetisk.invalid", emne: "Re: Synkronisering stopper", tekst: marker("Hej Søren.\n\nVi mangler teknisk grundlag før vi kan anvise en løsning."), signatur: "Venlig hilsen\nDennis Testejer\nEjer\nVeyro Systems", vedhaeftninger: [], status: "kladde", basisAktivitetMs: now, revision: 1, oprettetMs: now, opdateretMs: now } },
  }),
  "v8-private-dennis": common("v8-private-dennis", { sagstype: "support", delingsstatus: "privat", emne: "Privat syntetisk supportsag", postkasseKilder: { dennis: { mailboxId: "fixture-dennis", adresse: dennis.email, mappe: "inbox", type: "personlig", ejerUid: dennis.uid } }, support: { nummer: "SUP-2026-0083", type: "andet", status: "triage", prioritet: "lav", modul: "FLEET", ansvarligUid: dennis.uid }, svarKladder: { k1: { id: "k1", fra: dennis.email, til: "privat@syntetisk.invalid", emne: "Privat", tekst: marker("Privat kladde"), signatur: "", vedhaeftninger: [], status: "kladde", basisAktivitetMs: now, revision: 1, oprettetMs: now, opdateretMs: now } } }),
};
const viden = {
  "v8-session-forny": { id: "v8-session-forny", titel: "FLEET · Forny session efter adgangsændring", indhold: "Log helt ud af Veyro, luk alle Veyro-faner, og log derefter ind igen. Det henter de nye adgangsoplysninger. Ændr ikke brugerens roller som en del af fejlsøgningen.", kilde: "Implementeret tokenfornyelse i src/firebase.js:126", modul: "FLEET", relevanteVersioner: "3.4.x", noegleord: ["session expired", "adgangsændring", "login"], leveringsstatus: "tilgaengelig", vidensstatus: "godkendt", publikum: "kunde_godkendt", godkendt: true, aktuelVersion: 2, revision: 2, gennemgaaetAfNavn: "Dennis Testejer", gennemgaaetMs: now - 86_400_000, oprettetMs: now - 172_800_000, opdateretMs: now - 86_400_000, opdateretAf: dennis.uid },
  "v8-session-intern": { id: "v8-session-intern", titel: "Intern analyse · claim-cache", indhold: "En forældet token-cache kan være en mulig forklaring, men fejlteksten beviser ikke årsagen.", kilde: "Intern gennemgang af auth-flow", modul: "FLEET", relevanteVersioner: "3.4.x", noegleord: ["session expired", "adgangsændring"], leveringsstatus: "tilgaengelig", vidensstatus: "godkendt", publikum: "intern", godkendt: true, aktuelVersion: 1, revision: 1, gennemgaaetAfNavn: "Jørn Testejer", gennemgaaetMs: now - 86_400_000, oprettetMs: now - 86_400_000, opdateretMs: now - 86_400_000, opdateretAf: joern.uid },
  "v8-sync-foraeldet": { id: "v8-sync-foraeldet", titel: "Ældre synkroniseringsnotat", indhold: "Historisk workaround, som ikke længere må anbefales.", kilde: "Arkiveret testnotat", modul: "FLEET", relevanteVersioner: "2.x", noegleord: ["synkronisering"], leveringsstatus: "under_udvikling", vidensstatus: "foraeldet", publikum: "kunde_godkendt", godkendt: true, aktuelVersion: 1, revision: 1, gennemgaaetAfNavn: "Dennis Testejer", gennemgaaetMs: now - 31_536_000_000, oprettetMs: now - 31_536_000_000, opdateretMs: now - 31_536_000_000, opdateretAf: dennis.uid },
};
const update = {};
for (const [id, thread] of Object.entries(threads)) update[`udbyder/salgsindbakke/traade/${id}`] = thread;
for (const [id, post] of Object.entries(viden)) update[`udbyder/vidensbase/poster/${id}`] = post;
for (const id of ["microsoft365", "openai", "dinero", "ocr", "bilagsmail"]) update[`udbyder/integrationer/${id}/status`] = "ikke_tilsluttet";
await dbPatch(update);
console.log(JSON.stringify({ ok: true, version: "V8 Support AI", supportCases: Object.keys(threads), knowledge: Object.keys(viden), externalAiCalled: false, mailSent: false }, null, 2));
