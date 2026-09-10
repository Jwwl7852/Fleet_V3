/* End-to-end-test af ejerflowet i en frisk, lokal Emulator Suite.
 *
 * Scriptet må aldrig kunne pege på et rigtigt Firebase-projekt. Alle priser,
 * identiteter og virksomhedsdata er syntetiske fixtures og er ikke Veyro-
 * prisdata eller produktionskonti.
 */
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
import { byggEjerClaims } from "../src/fleet/ejeradgang.js";
import { antalTilSkala } from "../src/fleet/ejer-tilbud-regler.js";

const PROJEKT = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const VAERTER = Object.freeze({
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  database: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
  functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST,
  storage: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
});
if (!/^demo-/.test(PROJEKT)
    || VAERTER.auth !== "127.0.0.1:9099"
    || VAERTER.database !== "127.0.0.1:9000"
    || VAERTER.functions !== "127.0.0.1:5001"
    || VAERTER.storage !== "127.0.0.1:9199") {
  throw new Error("Afvist: ejerflow-testen kræver demo-projekt og alle fire lokale emulatorer.");
}

const app = initializeApp({
  projectId: PROJEKT,
  databaseURL: `http://${VAERTER.database}?ns=${PROJEKT}`,
  storageBucket: `${PROJEKT}.appspot.com`,
}, "veyro-owner-flow-test");
const auth = getAuth(app);
const db = getDatabase(app);

const adgangskode = "Kun-Lokal-Flowtest-2026!";
const ejerMail = "flow-ejer@demo.veyro.invalid";
const funktionsUrl = (navn) => `http://${VAERTER.functions}/${PROJEKT}/europe-west1/${navn}`;

async function logInd(email) {
  const svar = await fetch(
    `http://${VAERTER.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-emulator-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: adgangskode, returnSecureToken: true }),
    },
  );
  const json = await svar.json();
  assert.equal(svar.ok, true, `Emulator-login fejlede: ${JSON.stringify(json)}`);
  return json.idToken;
}

async function kald(navn, data, token) {
  const svar = await fetch(funktionsUrl(navn), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const json = await svar.json();
  if (json.error) {
    const fejl = new Error(`${json.error.status || "FUNCTION_ERROR"}: ${json.error.message || "Ukendt fejl"}`);
    fejl.status = json.error.status;
    throw fejl;
  }
  return json.result;
}

async function forventFejl(promise, status) {
  let fejl = null;
  try { await promise; } catch (e) { fejl = e; }
  assert.ok(fejl, `Forventede ${status}, men handlingen lykkedes.`);
  assert.equal(fejl.status, status);
  return fejl;
}

const tilbudslinje = ({ id, navn, prisOere, antal = 1, prislisteId, modulId = null, art = null, fakturering = "maanedlig" }) => ({
  id, art: art || (modulId ? "modul" : "grundplatform"), navn, beskrivelse: "Syntetisk emulatorfixture",
  modulId, enhed: fakturering === "engang" ? "stk." : "måned", fakturering, antal: antalTilSkala(antal),
  normalprisOere: prisOere, aftaltPrisOere: null, linjerabatBps: 0,
  momssats: 25, rabatberettiget: true, priskilde: `prisliste:${prislisteId}`,
});

try {
  const ejer = await auth.createUser({ email: ejerMail, password: adgangskode, emailVerified: true });
  await auth.setCustomUserClaims(ejer.uid, byggEjerClaims({}));
  const ejerToken = await logInd(ejerMail);

  const firma = await kald("crmvirksomhedgem", {
    navn: "Flowtest ApS — kun emulator", cvr: "00000001",
    kontaktNavn: "Test Kontakt", kontaktEmail: "kontakt@demo.veyro.invalid",
    fakturaEmail: "faktura@demo.veyro.invalid", afsendelseskanal: "email",
    ansvarligUid: ejer.uid, forventetRevision: 0,
  }, ejerToken);
  const mulighed = await kald("crmmulighedgem", {
    virksomhedId: firma.id, titel: "Isoleret ejerflow",
    ansvarligUid: ejer.uid, kilde: "anden", fase: "tilbud",
    moduler: ["flaade"], maanedligVaerdiOere: 250000, engangsVaerdiOere: 0,
    forventetRevision: 0,
  }, ejerToken);

  const rateblad1 = await kald("prislisteopret", {
    gyldigFraMs: Date.parse("2026-09-01T00:00:00Z"),
    platform: { basisOere: 100000, inkluderetBrugere: {} },
    moduler: { flaade: { basisOere: 150000, prKoeretoejOere: 0, prBrugerOere: {} } },
    tilbudslinjer: {
      implementering: {
        art: "implementering", navn: "Eksempelimplementering — kun fixture",
        enhed: "time", fakturering: "engang", normalprisOere: 80000,
        momssats: 25, rabatberettiget: true,
      },
    },
  }, ejerToken);

  const operationId = "flow_quote_20260910";
  const grundlinje = tilbudslinje({
    id: "platform-v1", navn: "Veyro grundplatform", prisOere: 100000,
    prislisteId: rateblad1.id,
  });
  const fleetlinje = tilbudslinje({
    id: "fleet-v1", navn: "Fleet", prisOere: 150000,
    prislisteId: rateblad1.id, modulId: "flaade",
  });
  const faeldes = {
    operationId, virksomhedId: firma.id, mulighedId: mulighed.id,
    kontaktNavn: "Test Kontakt", kontaktEmail: "kontakt@demo.veyro.invalid",
    udstedelsesdato: "2026-09-10", gyldigTil: "2026-10-10", valuta: "DKK",
    generelRabatBps: 1000, introRabatBps: 2000, introMaaneder: 3,
    bindingMaaneder: 12, betalingsbetingelser: "Efter aftale", prislisteId: rateblad1.id,
  };
  const oprettet = await kald("tilbudgem", {
    ...faeldes, forventetRevision: 0, linjer: [grundlinje, fleetlinje],
  }, ejerToken);

  // Optimistisk lås: præcis én samtidig rettelse med samme revision må vinde.
  const samtidige = await Promise.allSettled([
    kald("tilbudgem", {
      ...faeldes, id: oprettet.id, forventetRevision: oprettet.revision,
      linjer: [{ ...grundlinje, antal: antalTilSkala(2) }, fleetlinje],
    }, ejerToken),
    kald("tilbudgem", {
      ...faeldes, id: oprettet.id, forventetRevision: oprettet.revision,
      linjer: [{ ...grundlinje, antal: antalTilSkala(3) }, fleetlinje],
    }, ejerToken),
  ]);
  assert.equal(samtidige.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(samtidige.filter((r) => r.status === "rejected").length, 1);
  const v1Kladde = (await db.ref(`udbyder/tilbud/${oprettet.id}`).once("value")).val();
  const v1 = await kald("tilbududsted", {
    id: oprettet.id, forventetRevision: v1Kladde.revision, operationId: "issue_v1_20260910",
  }, ejerToken);
  assert.equal(v1.version, 1);

  const pdf = await kald("tilbudpdfgenerer", { id: oprettet.id, version: 1 }, ejerToken);
  assert.equal(pdf.dokument.contentType, "application/pdf");
  const [pdfFindes] = await getStorage(app).bucket().file(pdf.dokument.storagePath).exists();
  assert.equal(pdfFindes, true);
  await kald("tilbudsendtregistrer", {
    id: oprettet.id, forventetRevision: pdf.revision ?? (await db.ref(`udbyder/tilbud/${oprettet.id}/revision`).once("value")).val(),
    begrundelse: "Registreret manuelt i isoleret flowtest; ingen virkelig mail.",
  }, ejerToken);

  const efterSendt = (await db.ref(`udbyder/tilbud/${oprettet.id}`).once("value")).val();
  const nyKladde = await kald("tilbudrevisionstart", {
    id: oprettet.id, forventetRevision: efterSendt.revision,
  }, ejerToken);
  const rateblad2 = await kald("prislisteopret", {
    gyldigFraMs: Date.parse("2026-10-01T00:00:00Z"),
    platform: { basisOere: 125000, inkluderetBrugere: {} },
    moduler: { flaade: { basisOere: 175000, prKoeretoejOere: 0, prBrugerOere: {} } },
    tilbudslinjer: {},
  }, ejerToken);
  const v2Linje = tilbudslinje({
    id: "platform-v2", navn: "Veyro grundplatform", prisOere: 125000,
    prislisteId: rateblad2.id,
  });
  const fleetlinjeV2 = tilbudslinje({
    id: "fleet-v2", navn: "Fleet", prisOere: 175000,
    prislisteId: rateblad2.id, modulId: "flaade",
  });
  const maengdelinjerV2 = [
    tilbudslinje({ id: "medarbejdere-v2", navn: "Medarbejderbrugere", art: "medarbejder", prisOere: 5000, antal: 10, prislisteId: rateblad2.id, modulId: "flaade" }),
    tilbudslinje({ id: "chauffoerer-v2", navn: "Chaufførbrugere", art: "chauffoer", prisOere: 3000, antal: 60, prislisteId: rateblad2.id, modulId: "flaade" }),
    tilbudslinje({ id: "enheder-v2", navn: "Køretøjsenheder", art: "enhed", prisOere: 2500, antal: 60, prislisteId: rateblad2.id, modulId: "flaade" }),
    tilbudslinje({ id: "obd-hardware-v2", navn: "OBD-hardware", art: "enhed", prisOere: 75000, antal: 12, prislisteId: rateblad2.id, modulId: "flaade", fakturering: "engang" }),
    tilbudslinje({ id: "obd-data-v2", navn: "OBD-dataabonnement", art: "enhed", prisOere: 9000, antal: 10, prislisteId: rateblad2.id, modulId: "flaade" }),
  ];
  const gemtV2 = await kald("tilbudgem", {
    ...faeldes, id: oprettet.id, prislisteId: rateblad2.id,
    forventetRevision: nyKladde.revision, linjer: [v2Linje, fleetlinjeV2, ...maengdelinjerV2],
  }, ejerToken);
  const v2 = await kald("tilbududsted", {
    id: oprettet.id, forventetRevision: gemtV2.revision, operationId: "issue_v2_20260910",
  }, ejerToken);
  assert.equal(v2.version, 2);

  const efterV2 = (await db.ref(`udbyder/tilbud/${oprettet.id}`).once("value")).val();
  assert.equal(efterV2.versioner[1].snapshot.linjer[0].normalprisOere, 100000);
  assert.equal(efterV2.versioner[2].snapshot.linjer[0].normalprisOere, 125000);
  await forventFejl(kald("tilbudsend", {
    id: oprettet.id, operationId: "mail_attempt_v2_20260910",
  }, ejerToken), "FAILED_PRECONDITION");
  const efterMailFejl = (await db.ref(`udbyder/tilbud/${oprettet.id}`).once("value")).val();
  assert.equal(efterMailFejl.status, "klar");
  assert.equal(efterMailFejl.afsendelsesforsoeg.mail_attempt_v2_20260910.status, "ikke_tilsluttet");
  const sendtV2 = await kald("tilbudsendtregistrer", {
    id: oprettet.id, forventetRevision: efterMailFejl.revision,
    begrundelse: "Registreret manuelt i isoleret flowtest; ingen virkelig mail.",
  }, ejerToken);
  const accepteret = await kald("tilbudacceptregistrer", {
    id: oprettet.id, version: 2, forventetRevision: sendtV2.revision,
    metode: "email", dokumentation: "Syntetisk acceptreference FLOW-ACCEPT-1",
  }, ejerToken);
  assert.equal(accepteret.version, 2);
  assert.equal((await db.ref("udbyder/fakturaer").once("value")).exists(), false);

  const provisionData = {
    tilbudId: oprettet.id, version: 2, tenantId: "flow-tenant",
    virkningsdato: "2026-09-10", operationId: "provision_flow_20260910",
  };
  const provisioneret = await kald("aftaleprovisioner", provisionData, ejerToken);
  const genkoert = await kald("aftaleprovisioner", provisionData, ejerToken);
  assert.equal(genkoert.genbrugt, true);
  assert.equal(genkoert.aftaleId, provisioneret.aftaleId);
  const aftale = (await db.ref(`udbyder/aftaler/${provisioneret.aftaleId}`).once("value")).val();
  assert.equal(Object.keys(aftale.versioner).length, 1);
  assert.equal((await db.ref("tenants/flow-tenant/moduler/flaade").once("value")).val(), true);

  // Den samlede kundekonto henter bindende mængder og priser fra præcis den
  // accepterede aftaleversion. En gentagelse genbruges, mens to nye samtidige
  // operationer med samme revision ikke begge kan vinde.
  const kontoPayload = {
    id: "flow-tenant", operationId: "account_flow_20260910", forventetRevision: 0, aktiver: true,
    kilde: { art: "accepteret_tilbud", aftaleId: provisioneret.aftaleId, aftaleVersion: provisioneret.aftaleVersion },
    profil: {
      navn: "Flowtest ApS — kun emulator", cvr: "00000001", adresse: "Testvej 1",
      postnr: "0000", by: "Testby", kontaktNavn: "Test Kontakt",
      kontaktEmail: "kontakt@demo.veyro.invalid", fakturaEmail: "faktura@demo.veyro.invalid",
      reference: "FLOW-REFERENCE",
    },
    opsaetning: { faerdig: true, obd: { leveretAntal: 4, tilknyttetAntal: 2 } },
  };
  const kontoGemt = await kald("kundekontogem", kontoPayload, ejerToken);
  const kontoGenkoert = await kald("kundekontogem", kontoPayload, ejerToken);
  assert.equal(kontoGenkoert.genbrugt, true);
  assert.equal(kontoGenkoert.version, kontoGemt.version);
  const konto = (await db.ref("udbyder/kundekonti/flow-tenant").once("value")).val();
  const kontoVersion = konto.versioner[konto.aktivVersion];
  assert.equal(konto.status, "aktiv");
  assert.equal(kontoVersion.maengder.medarbejderbrugere, 10);
  assert.equal(kontoVersion.maengder.chauffoerbrugere, 60);
  assert.equal(kontoVersion.maengder.enheder, 60);
  assert.equal(kontoVersion.obd.hardwareAntal, 12);
  assert.equal(kontoVersion.obd.dataabonnementAntal, 10);
  assert.equal(kontoVersion.obd.leveretAntal, 4);
  assert.equal(kontoVersion.obd.tilknyttetAntal, 2);
  assert.equal(kontoVersion.kilde.tilbudsversion, 2);
  assert.equal(efterV2.versioner[1].snapshot.linjer[0].normalprisOere, 100000);
  assert.equal(efterV2.versioner[2].snapshot.linjer[0].normalprisOere, 125000);

  const kontoSamtidige = await Promise.allSettled([
    kald("kundekontogem", { ...kontoPayload, operationId: "account_concurrent_a", forventetRevision: konto.revision }, ejerToken),
    kald("kundekontogem", { ...kontoPayload, operationId: "account_concurrent_b", forventetRevision: konto.revision }, ejerToken),
  ]);
  assert.equal(kontoSamtidige.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(kontoSamtidige.filter((r) => r.status === "rejected").length, 1);

  // Ny konto: invitation først, derefter normal Auth-oprettelse og accept.
  const nyAdminMail = "flow-ny-admin@demo.veyro.invalid";
  const invitation = await kald("kundeinvitationopret", {
    tenantId: "flow-tenant", email: nyAdminMail, navn: "Ny Testadmin", rolle: "admin",
  }, ejerToken);
  assert.equal(invitation.eksisterendeKonto, false);
  await forventFejl(kald("kundeinvitationaccept", {
    id: invitation.id, token: invitation.token,
  }, ejerToken), "PERMISSION_DENIED");
  const nyAdmin = await auth.createUser({ email: nyAdminMail, password: adgangskode, emailVerified: true });
  const nyAdminToken = await logInd(nyAdminMail);
  await kald("kundeinvitationaccept", { id: invitation.id, token: invitation.token }, nyAdminToken);
  const nyClaims = (await auth.getUser(nyAdmin.uid)).customClaims;
  assert.equal(nyClaims.tenant, "flow-tenant");
  assert.equal(nyClaims.rolle, "admin");
  assert.notEqual(nyClaims.udbyder, true);

  // Eksisterende konto samt tilbagekaldelse og tokenrotation ved genudsendelse.
  const eksisterendeMail = "flow-eksisterende@demo.veyro.invalid";
  await auth.createUser({ email: eksisterendeMail, password: adgangskode, emailVerified: true });
  const eksisterendeInvitation = await kald("kundeinvitationopret", {
    tenantId: "flow-tenant", email: eksisterendeMail, navn: "Eksisterende Testadmin", rolle: "admin",
  }, ejerToken);
  assert.equal(eksisterendeInvitation.eksisterendeKonto, true);
  await kald("kundeinvitationtilbagekald", { id: eksisterendeInvitation.id }, ejerToken);
  const genudsendt = await kald("kundeinvitationgenudsend", { id: eksisterendeInvitation.id }, ejerToken);
  assert.equal(genudsendt.generation, 2);
  assert.notEqual(genudsendt.token, eksisterendeInvitation.token);
  const eksisterendeToken = await logInd(eksisterendeMail);
  await forventFejl(kald("kundeinvitationaccept", {
    id: eksisterendeInvitation.id, token: eksisterendeInvitation.token,
  }, eksisterendeToken), "PERMISSION_DENIED");
  await kald("kundeinvitationaccept", {
    id: eksisterendeInvitation.id, token: genudsendt.token,
  }, eksisterendeToken);

  console.log(JSON.stringify({
    ok: true, virksomhedId: firma.id, mulighedId: mulighed.id,
    prislister: [rateblad1.id, rateblad2.id], tilbudId: oprettet.id,
    tilbudsversioner: [1, 2], pdf: pdf.dokument.storagePath,
    aftaleId: provisioneret.aftaleId, tenantId: provisioneret.tenantId,
    kundekontoVersion: kontoGemt.version, invitationer: 2,
  }, null, 2));
} finally {
  await deleteApp(app);
}
