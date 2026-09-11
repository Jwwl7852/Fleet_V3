/* V6.2: sammenhængende, syntetisk pilottilbud gennem de autoriserede callables. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
import { byggEjerClaims } from "../src/fleet/ejeradgang.js";
import { MODUL } from "../src/fleet/moduler.js";
import { lokaltTilbudsforslag } from "../src/fleet/ejer-v6-regler.js";
import { antalTilSkala, tilfoejKalendermaaneder, validerTilbud } from "../src/fleet/ejer-tilbud-regler.js";

const projekt = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const hosts = { auth: process.env.FIREBASE_AUTH_EMULATOR_HOST, database: process.env.FIREBASE_DATABASE_EMULATOR_HOST, functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST, storage: process.env.FIREBASE_STORAGE_EMULATOR_HOST };
assert.match(projekt, /^demo-/);
assert.deepEqual(hosts, { auth: "127.0.0.1:9099", database: "127.0.0.1:9000", functions: "127.0.0.1:5001", storage: "127.0.0.1:9199" });
assert.ok(process.env.VITE_DEV_BRUGER_KODE);

const app = initializeApp({ projectId: projekt, databaseURL: `http://${hosts.database}?ns=${projekt}`, storageBucket: `${projekt}.appspot.com` }, "offer-v6-2");
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app).bucket();
const tilbudId = "v62_pilot_20260911";
const kunde = { navn: "Aurora Mobilitet ApS — syntetisk V6.2-kunde", kontakt: "Sara Testperson", email: "sara@aurora-v62.invalid", cvr: "00000662" };
const url = (navn) => `http://${hosts.functions}/${projekt}/europe-west1/${navn}`;
const sha = (data) => createHash("sha256").update(data).digest("hex");

async function login() {
  const r = await fetch(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=lokal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ejer@demo.veyro.invalid", password: process.env.VITE_DEV_BRUGER_KODE, returnSecureToken: true }) });
  const j = await r.json(); assert.equal(r.ok, true, JSON.stringify(j)); return j.idToken;
}
async function kald(navn, data, token) {
  const r = await fetch(url(navn), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
  const j = await r.json(); if (j.error) throw new Error(`${navn}: ${j.error.status}: ${j.error.message}`); return j.result;
}
const linje = ({ id, navn, modulId = "", art = "modul", antal = 1, enhed = "måned", fakturering = "maanedlig", prisOere }) => ({
  id, navn, modulId, art, beskrivelse: "Syntetisk V6.2-testlinje", antal: antalTilSkala(antal), enhed, fakturering,
  normalprisOere: prisOere, aftaltPrisOere: null, linjerabatBps: 0, momssats: 25, rabatberettiget: true,
});
const oekonomi = (kladde) => ({
  linjer: kladde.linjer, generelRabatBps: kladde.generelRabatBps, introRabatBps: kladde.introRabatBps,
  introMaaneder: kladde.introMaaneder, bindingMaaneder: kladde.bindingMaaneder, prislisteId: kladde.prislisteId,
  pilotStart: kladde.pilotStart, pilotMaaneder: kladde.pilotMaaneder, pilotSlut: kladde.pilotSlut, pilotEvaluering: kladde.pilotEvaluering,
});

try {
  let ejer;
  try { ejer = await auth.getUserByEmail("ejer@demo.veyro.invalid"); }
  catch (e) {
    if (e?.code !== "auth/user-not-found") throw e;
    ejer = await auth.createUser({ email: "ejer@demo.veyro.invalid", password: process.env.VITE_DEV_BRUGER_KODE, emailVerified: true });
    await auth.setCustomUserClaims(ejer.uid, byggEjerClaims({}));
  }
  const tidligere = (await db.ref("udbyder/review/v62").once("value")).val();
  if (tidligere?.pdfPath) await storage.file(tidligere.pdfPath).delete({ ignoreNotFound: true });
  const ryd = { [`udbyder/tilbud/${tilbudId}`]: null, "udbyder/review/v62": null };
  if (tidligere?.virksomhedId) ryd[`udbyder/crm/virksomheder/${tidligere.virksomhedId}`] = null;
  if (tidligere?.prislisteId) ryd[`udbyder/prislister/${tidligere.prislisteId}`] = null;
  const crmFoer = (await db.ref("udbyder/crm/virksomheder").once("value")).val() || {};
  for (const [id, post] of Object.entries(crmFoer)) {
    if (post?.stamdata?.cvr === kunde.cvr) ryd[`udbyder/crm/virksomheder/${id}`] = null;
  }
  await db.ref().update(ryd);

  const token = await login();
  const firma = await kald("crmvirksomhedgem", { navn: kunde.navn, cvr: kunde.cvr, kontaktNavn: kunde.kontakt, kontaktEmail: kunde.email, fakturaEmail: "faktura@aurora-v62.invalid", ansvarligUid: ejer.uid, forventetRevision: 0 }, token);
  const mulighed = await kald("crmmulighedgem", { virksomhedId: firma.id, titel: "V6.2 afgrænset Fleet-pilot", ansvarligUid: ejer.uid, kilde: "anden", fase: "tilbud", moduler: ["flaade", "booking"], behov: "Pilot på 25 køretøjer med opstartsworkshop og OBD-montering.", maanedligVaerdiOere: 0, engangsVaerdiOere: 0, forventetRevision: 0 }, token);
  const prisliste = await kald("prislisteopret", { gyldigFraMs: Date.parse("2026-09-01T00:00:00Z"), platform: { basisOere: 100000, inkluderetBrugere: {} }, moduler: { flaade: { basisOere: 150000, prKoeretoejOere: 2500, prBrugerOere: {} }, booking: { basisOere: 50000, prKoeretoejOere: 0, prBrugerOere: {} } }, tilbudslinjer: {} }, token);
  await db.ref(`udbyder/prislister/${prisliste.id}`).update({ navn: "Syntetisk V6.2-pilotrateblad", version: "V6.2-test", fixture: true });

  const linjer = [
    linje({ id: "v62-platform", navn: "Veyro grundplatform", art: "grundplatform", prisOere: 100000 }),
    linje({ id: "v62-fleet", navn: "Fleet", modulId: "flaade", prisOere: 150000 }),
    linje({ id: "v62-planning", navn: "Planning", modulId: "booking", prisOere: 50000 }),
    linje({ id: "v62-obd", navn: "OBD-hardware", modulId: "flaade", art: "enhed", antal: 25, enhed: "stk.", fakturering: "engang", prisOere: 50000 }),
  ];
  const grundlag = {
    operationId: tilbudId, virksomhedId: firma.id, mulighedId: mulighed.id, kontaktNavn: kunde.kontakt, kontaktEmail: kunde.email,
    udstedelsesdato: "2026-09-15", gyldigTil: "2026-10-15", valuta: "DKK", generelRabatBps: 500, introRabatBps: 0,
    introMaaneder: 0, bindingMaaneder: 0, betalingsbetingelser: "Efter aftale", prislisteId: prisliste.id,
    tilbudstype: "pilot_med_drift", pilotStart: "2026-10-01", pilotMaaneder: 3, pilotEvaluering: "2026-12-17",
    pilotOmfang: "25 køretøjer og 5 navngivne brugere", pilotAktiviteter: "OBD-montering, opstartsworkshop",
    pilotUdenfor: "specialudvikling, automatisk overgang til drift", pilotUafklaret: "CVR-reference til fakturering",
    indledning: `Tak for dialogen om et afgrænset pilotforløb for ${kunde.navn}.`,
    behovstekst: `${kunde.navn} ønsker at afprøve Fleet og Planning på 25 køretøjer.`,
    loesningsbeskrivelse: "Pilotens omfang, aktiviteter og afgrænsning fremgår af den accepterede version.",
    linjer,
  };
  const oprettet = await kald("tilbudgem", { ...grundlag, forventetRevision: 0 }, token);
  const udstedt = await kald("tilbududsted", { id: oprettet.id, forventetRevision: oprettet.revision, operationId: "v62_issue_v1" }, token);
  const pdf = await kald("tilbudpdfgenerer", { id: oprettet.id, version: udstedt.version }, token);
  let post = (await db.ref(`udbyder/tilbud/${tilbudId}`).once("value")).val();
  const sendt = await kald("tilbudsendtregistrer", { id: tilbudId, forventetRevision: post.revision, begrundelse: "Syntetisk V6.2-test; ingen virkelig mail." }, token);
  await kald("tilbudacceptregistrer", { id: tilbudId, version: 1, forventetRevision: sendt.revision, metode: "email", dokumentation: "Syntetisk V6.2-accept" }, token);
  post = (await db.ref(`udbyder/tilbud/${tilbudId}`).once("value")).val();
  const accepteretFoer = structuredClone(post.versioner[1].snapshot);
  const snapshotHashFoer = sha(JSON.stringify(accepteretFoer));
  const pdfPath = post.versioner[1].pdf?.storagePath || pdf.dokument.storagePath;
  const [pdfFoer] = await storage.file(pdfPath).download();
  const pdfHashFoer = sha(pdfFoer);

  await kald("tilbudrevisionstart", { id: tilbudId, forventetRevision: post.revision }, token);
  post = (await db.ref(`udbyder/tilbud/${tilbudId}`).once("value")).val();
  assert.equal(post.virksomhedId, firma.id);
  assert.equal(post.kladde.virksomhedId, firma.id);
  for (const felt of ["kontaktNavn", "kontaktEmail", "indledning", "loesningsbeskrivelse", "linjer", "prislisteId", "pilotOmfang", "pilotAktiviteter", "pilotUdenfor", "pilotUafklaret"]) assert.deepEqual(post.kladde[felt], accepteretFoer[felt], `${felt} blev ikke arvet.`);
  const kildekontekst = {
    moduler: post.kladde.linjer.map((l) => MODUL[l.modulId]?.label).filter(Boolean),
    aktiviteter: post.kladde.pilotAktiviteter, pilotStart: post.kladde.pilotStart, pilotMaaneder: post.kladde.pilotMaaneder,
    omfang: post.kladde.pilotOmfang, udenfor: post.kladde.pilotUdenfor, uafklaret: post.kladde.pilotUafklaret, vejledendeDrift: true,
  };
  const foerste = lokaltTilbudsforslag({ felt: "loesningsbeskrivelse", kunde: kunde.navn, pilot: true, kontekst: kildekontekst });
  const instruktion = "Gør teksten kortere og fremhæv pilotens afgrænsning. Skriv ikke denne instruktion i tilbuddet.";
  const revideret = lokaltTilbudsforslag({ felt: "loesningsbeskrivelse", kunde: kunde.navn, pilot: true, instruks: instruktion, kontekst: kildekontekst });
  assert.ok(revideret.length < foerste.length);
  for (const fakta of [kunde.navn, "Fleet", "Planning", "OBD-montering", "3 kalendermåneder", "25 køretøjer", "specialudvikling", "CVR-reference", "aktiveres ikke automatisk"]) assert.ok(revideret.includes(fakta), fakta);
  assert.doesNotMatch(revideret, /Skriv ikke denne instruktion|sælgerens anvisning/i);
  const oekonomiFoer = oekonomi(post.kladde);
  const gemt = await kald("tilbudgem", { ...post.kladde, id: tilbudId, loesningsbeskrivelse: revideret, operationId: "v62_save_revised", forventetRevision: post.revision }, token);
  post = (await db.ref(`udbyder/tilbud/${tilbudId}`).once("value")).val();
  assert.equal(post.kladde.loesningsbeskrivelse, revideret);
  assert.deepEqual(oekonomi(post.kladde), oekonomiFoer);
  assert.equal(post.virksomhedId, firma.id);
  assert.equal(post.mulighedId, mulighed.id);
  assert.deepEqual(post.versioner[1].snapshot, accepteretFoer);
  const [pdfEfter] = await storage.file(pdfPath).download();
  const kontrastVarighed = lokaltTilbudsforslag({ felt: "loesningsbeskrivelse", kunde: kunde.navn, pilot: true, instruks: "Kortere med tydelig pilotafgrænsning", kontekst: { ...kildekontekst, pilotMaaneder: 2 } });
  const kontrastMangler = lokaltTilbudsforslag({ felt: "loesningsbeskrivelse", kunde: kunde.navn, pilot: true, instruks: "Kortere med tydelig pilotafgrænsning", kontekst: { ...kildekontekst, omfang: "" } });
  assert.match(kontrastVarighed, /2 kalendermåneder/); assert.doesNotMatch(kontrastVarighed, /3 kalendermåneder/);
  assert.match(kontrastMangler, /afklare .*pilotens aftalte omfang/i); assert.doesNotMatch(kontrastMangler, /25 køretøjer/);

  const datoBasis = { ...grundlag, operationId: undefined };
  const datoProever = {
    fremtidig: validerTilbud(datoBasis),
    historisk: validerTilbud({ ...datoBasis, udstedelsesdato: "2026-11-01", gyldigTil: "2026-12-01" }),
    ugyldigDato: validerTilbud({ ...datoBasis, pilotStart: "2026/10/01" }),
    ugyldigVarighed: validerTilbud({ ...datoBasis, pilotMaaneder: 0 }),
    maanedsslut: { start: "2028-01-31", maaneder: 1, slut: tilfoejKalendermaaneder("2028-01-31", 1) },
  };
  assert.deepEqual(datoProever.fremtidig.fejl, {});
  assert.equal(datoProever.historisk.fejl.pilotStart, undefined);
  assert.ok(datoProever.ugyldigDato.fejl.pilotStart);
  assert.ok(datoProever.ugyldigVarighed.fejl.pilotMaaneder);
  assert.equal(datoProever.maanedsslut.slut, "2028-02-29");

  const resultat = {
    projekt, adapter: "lokal_deterministisk_v6_2", eksternAI: false, virkeligMail: false,
    kunde: { virksomhedId: firma.id, mulighedId: mulighed.id, ...kunde }, tilbudId, accepteretVersion: 1, nyKladdeVersion: 2,
    kilder: kildekontekst, originalTekst: accepteretFoer.loesningsbeskrivelse, foersteForslag: foerste, saelgerinstruktion: instruktion,
    revideretForslag: revideret, gemtOgGenindlaestTekst: post.kladde.loesningsbeskrivelse,
    kontrast: { varighedFoer: 3, varighedEfter: 2, tekst: kontrastVarighed, manglendeOmfangTekst: kontrastMangler },
    identitet: { crmVirksomhedId: firma.id, crmMulighedId: mulighed.id, tilbudVirksomhedId: post.virksomhedId, kladdeVirksomhedId: post.kladde.virksomhedId, accepteretKontakt: accepteretFoer.kontaktEmail, kladdeKontakt: post.kladde.kontaktEmail },
    kontroller: { revideretErKortere: revideret.length < foerste.length, instruktionIkkeLaekket: true, kunValgtTekstfeltAendret: true, struktureretOekonomiUaendret: true, accepteretSnapshotUaendret: true, accepteretPdfUaendret: sha(pdfEfter) === pdfHashFoer, vejledendeDriftIkkeAutoaktiveret: !Object.hasOwn(post, "aktiverDriftAutomatisk") },
    accepteretSnapshotSha256Foer: snapshotHashFoer, accepteretSnapshotSha256Efter: sha(JSON.stringify(post.versioner[1].snapshot)), accepteretPdfSha256Foer: pdfHashFoer, accepteretPdfSha256Efter: sha(pdfEfter), pdfPath,
    datoProever: {
      fremtidig: { input: { udstedelsesdato: datoBasis.udstedelsesdato, pilotStart: datoBasis.pilotStart, pilotMaaneder: datoBasis.pilotMaaneder }, fejl: datoProever.fremtidig.fejl, pilotSlut: datoProever.fremtidig.post.pilotSlut, pilotEvaluering: datoProever.fremtidig.post.pilotEvaluering },
      historisk: { input: { udstedelsesdato: "2026-11-01", pilotStart: datoBasis.pilotStart }, pilotStartFejl: datoProever.historisk.fejl.pilotStart || null },
      ugyldigDato: datoProever.ugyldigDato.fejl.pilotStart, ugyldigVarighed: datoProever.ugyldigVarighed.fejl.pilotMaaneder, maanedsslut: datoProever.maanedsslut,
    },
    revision: gemt.revision,
  };
  assert.equal(resultat.accepteretSnapshotSha256Efter, snapshotHashFoer);
  assert.equal(resultat.accepteretPdfSha256Efter, pdfHashFoer);
  await db.ref("udbyder/review/v62").set({ virksomhedId: firma.id, mulighedId: mulighed.id, tilbudId, prislisteId: prisliste.id, pdfPath, opdateretMs: Date.now(), fixture: true });
  const output = resolve(process.env.V62_TILBUD_RESULTAT || "docs/screenshots/ejer-review-v6-2/offer-workflow-result.json");
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(resultat, null, 2)}\n`);
  console.log(`V6.2 tilbudsforløb bestået: ${tilbudId}; ${output}`);
} finally { await deleteApp(app); }
