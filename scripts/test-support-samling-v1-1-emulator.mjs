import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

const projectId = "demo-veyro-support-samling";
const authHost = "127.0.0.1:9198";
const databaseHost = "127.0.0.1:9290";
const functionsBase = `http://127.0.0.1:5099/${projectId}/europe-west1`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
process.env.FIREBASE_DATABASE_EMULATOR_HOST = databaseHost;

const app = initializeApp({ projectId, databaseURL: `http://${databaseHost}?ns=${projectId}` }, `support-samling-${Date.now()}`);
const adminAuth = getAuth(app);
const db = getDatabase(app);
const password = "Syntetisk!2026";

async function opretBruger(email, claims) {
  const bruger = await adminAuth.createUser({ email, password, displayName: email.split("@")[0] });
  await adminAuth.setCustomUserClaims(bruger.uid, claims);
  const svar = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await svar.json();
  assert.equal(svar.ok, true, `login fejlede for ${email}: ${JSON.stringify(body)}`);
  return { uid: bruger.uid, token: body.idToken };
}

async function kald(navn, data, token, forventetKode = 200) {
  const svar = await fetch(`${functionsBase}/${navn}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const body = await svar.json();
  assert.equal(svar.status, forventetKode, `${navn}: HTTP ${svar.status} ${JSON.stringify(body)}`);
  return body.result ?? body.data ?? body;
}

async function afvist(navn, data, token, status) {
  const svar = await fetch(`${functionsBase}/${navn}`, {
    method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const body = await svar.json();
  assert.notEqual(svar.status, 200, `${navn} skulle være afvist`);
  assert.equal(body.error?.status, status, `${navn}: ${JSON.stringify(body)}`);
  return body.error;
}

try {
  await db.ref().set({
    tenants: {
      nordlys: { _findes: true, virksomhed: { navn: "Nordlys Syntetisk Drift" } },
      anden: { _findes: true, virksomhed: { navn: "Anden Syntetisk Tenant" } },
    },
    udbyder: {
      kunder: { nordlys: { oprettetMs: 1 }, anden: { oprettetMs: 1 } },
      vidensbase: { poster: {
        godkendt: { id: "godkendt", titel: "FLEET filtersøgning", indhold: "Nulstil de aktive filtre og søg igen på enhedens lokale test-id.", kilde: "Syntetisk FLEET-vejledning", modul: "FLEET", relevanteVersioner: "3.x", noegleord: ["enhed", "filter"], leveringsstatus: "tilgaengelig", vidensstatus: "godkendt", publikum: "kunde_godkendt", aktuelVersion: 3, gennemgaaetAfNavn: "Syntetisk reviewer", gennemgaaetMs: 1 },
        intern: { id: "intern", titel: "Intern FLEET-diagnose", indhold: "Kontrollér den syntetiske indeksrevision internt.", kilde: "Syntetisk intern driftsnote", modul: "FLEET", relevanteVersioner: "3.x", noegleord: ["enhed", "filter"], leveringsstatus: "tilgaengelig", vidensstatus: "godkendt", publikum: "intern", aktuelVersion: 2, gennemgaaetAfNavn: "Syntetisk reviewer", gennemgaaetMs: 1 },
        legacy: { id: "legacy", titel: "Må ikke vises", indhold: "Internt indhold", kilde: "Legacy", modul: "FLEET", noegleord: ["legacyhemmelig"], leveringsstatus: "tilgaengelig", godkendt: true, kundeGodkendt: true, aktuelVersion: 1 },
      } },
    },
  });

  const kunde = await opretBruger("maria@nordlys.invalid", { tenant: "nordlys", rolle: "admin", perms: "|", pv: 2 });
  const kollega = await opretBruger("kollega@nordlys.invalid", { tenant: "nordlys", rolle: "admin", perms: "|", pv: 2 });
  const anden = await opretBruger("kunde@anden.invalid", { tenant: "anden", rolle: "admin", perms: "|", pv: 2 });
  const dennis = await opretBruger("dennis@veyro.invalid", { udbyder: true, pv: 2 });
  const joern = await opretBruger("joern@veyro.invalid", { udbyder: true, pv: 2 });

  const start = await kald("supportSamtaleStart", { anmodningId: "start_samling_001", emne: "Enhed mangler i FLEET", tekst: "Jeg kan ikke finde min enhed efter et filter", kontekst: { modul: "FLEET", version: "3.0.0", token: "maa-ikke-lagres" } }, kunde.token);
  const sagId = start.sag.id;
  assert.equal(start.sag.traadId, sagId);
  assert.equal(start.sag.kontraktVersion, "veyro.support.v1.1");
  assert.equal(start.beskeder.find((post) => post.afsenderType === "ai")?.kilde?.id, "godkendt", JSON.stringify(start));
  assert.equal(JSON.stringify(start).includes("maa-ikke-lagres"), false);

  const eskaleret = await kald("supportEskaler", { sagId, anmodningId: "eskaler_samling_1", aarsag: "Jeg har prøvet vejledningen." }, kunde.token);
  const koe = await kald("supportEjerKoelist", {}, dennis.token);
  assert.equal(koe.traade[sagId].id, sagId);
  assert.equal(koe.traade[sagId].support.status, "triage");
  assert.equal(koe.traade[sagId].kilde.adapter, "veyro.support.v1.1");
  assert.equal(koe.traade[sagId].links.virksomhedId, "nordlys");
  const sammeHosJoern = await kald("supportEjerSagHent", { sagId }, joern.token);
  assert.equal(sammeHosJoern.traad.id, sagId, "begge ejere skal kunne læse den delte portalsag");

  const overtaget = await kald("supportEjerOvertag", { sagId, anmodningId: "overtag_samling1", forventetRevision: eskaleret.sag.revision }, dennis.token);
  assert.equal(overtaget.traad.ansvarligUid, dennis.uid);
  await afvist("supportEjerStatusOpdater", { sagId, anmodningId: "joern_status_0001", status: "afventer_os", forventetRevision: overtaget.traad.revision }, joern.token, "PERMISSION_DENIED");
  await afvist("supportEjerSvarSend", { sagId, anmodningId: "direkte_svar_001", tekst: "må ikke", forventetRevision: overtaget.traad.revision }, dennis.token, "FAILED_PRECONDITION");
  const aiPayload = { sagId, anmodningId: "intern_ai_samling_1", instruktion: "Find dokumenteret løsning og næste sikre trin", forventetSagRevision: overtaget.traad.revision, forventetRevision: 0, basisAktivitetMs: overtaget.traad.senesteAktivitetMs, basisKladdeRevision: 0, basisKladdeFingeraftryk: "811c9dc5" };
  const ai = await kald("supportEjerAiForslagGem", aiPayload, dennis.token);
  const aiRetry = await kald("supportEjerAiForslagGem", aiPayload, dennis.token);
  assert.equal(ai.revision, 1);
  assert.equal(aiRetry.gentaget, true, "intern AI skal være idempotent");
  assert.equal(ai.traad.aiArbejdsrum.aktivtForslag.kilder.length, 2);
  assert.match(ai.traad.aiArbejdsrum.chat.a_intern_ai_samling_1.tekst, /kun intern/);
  await afvist("supportEjerAiForslagGem", { ...aiPayload, anmodningId: "joern_ai_samling01", forventetRevision: 1 }, joern.token, "PERMISSION_DENIED");
  await afvist("supportEjerAiForslagGem", { ...aiPayload, anmodningId: "kunde_ai_samling01", forventetRevision: 1 }, kunde.token, "PERMISSION_DENIED");
  const baggrundPayload = { sagId, anmodningId: "baggrund_samling1", vaerdi: "Syntetisk intern sagsbaggrund, som aldrig må nå kunden.", forventetSagRevision: overtaget.traad.revision, forventetRevision: 0 };
  const baggrund = await kald("supportEjerBaggrundGem", baggrundPayload, dennis.token);
  const baggrundRetry = await kald("supportEjerBaggrundGem", baggrundPayload, dennis.token);
  assert.equal(baggrundRetry.gentaget, true, "intern baggrund skal være idempotent");
  assert.equal(baggrund.traad.sagsOplysninger.saelgerBaggrund.revision, 1);
  assert.equal(baggrund.traad.revision, overtaget.traad.revision + 1, "intern baggrund ændrer sagsgrundlaget");
  await afvist("supportEjerBaggrundGem", { ...baggrundPayload, anmodningId: "joern_baggrund_01", forventetSagRevision: baggrund.traad.revision, forventetRevision: 1 }, joern.token, "PERMISSION_DENIED");
  await kald("supportEjerNoteSkriv", { sagId, anmodningId: "intern_note_0001", tekst: "Syntetisk intern note, som aldrig må nå kunden." }, dennis.token);

  const gemt = await kald("supportEjerSvarKladdeGem", { sagId, anmodningId: "kladde_gem_0001", id: "portal", kanal: "portal", tekst: "Jeg har overtaget sagen. Prøv venligst det registrerede trin igen.", signatur: "Venlig hilsen\nDennis", vedhaeftninger: [], forventetSagRevision: baggrund.traad.revision, forventetRevision: 0 }, dennis.token);
  const kladde = gemt.traad.svarKladder.portal;
  assert.equal(kladde.status, "kladde");
  const godkendt = await kald("supportEjerSvarGodkend", { sagId, anmodningId: "kladde_godkend1", id: "portal", forventetRevision: kladde.revision }, dennis.token);
  const godkendtKladde = godkendt.traad.svarKladder.portal;
  assert.equal(godkendtKladde.status, "godkendt");
  const kundeOpfoelgning = await kald("supportBeskedSend", { sagId, anmodningId: "kunde_opfoelg_0001", tekst: "Her er den præcise fejltekst fra den syntetiske prøve.", vedhaeftninger: [] }, kunde.token);
  assert.equal(kundeOpfoelgning.sag.id, sagId);
  assert.equal(kundeOpfoelgning.sag.status, "underBehandling");
  assert.equal(kundeOpfoelgning.beskeder.filter((post) => post.afsenderType === "ai").length, 1, "kundens opfølgning efter overtagelse må ikke genstarte AI");
  await afvist("supportEjerSvarTransporter", { sagId, anmodningId: "portal_stale_0001", id: "portal", forventetRevision: godkendtKladde.revision }, dennis.token, "FAILED_PRECONDITION");

  const gemtIgen = await kald("supportEjerSvarKladdeGem", { sagId, anmodningId: "kladde_gem_0002", id: "portal", kanal: "portal", tekst: "Jeg har overtaget sagen. Prøv venligst det registrerede trin igen.", signatur: "Venlig hilsen\nDennis", vedhaeftninger: [], forventetSagRevision: kundeOpfoelgning.sag.revision, forventetRevision: godkendtKladde.revision }, dennis.token);
  const godkendtIgen = await kald("supportEjerSvarGodkend", { sagId, anmodningId: "kladde_godkend2", id: "portal", forventetRevision: gemtIgen.traad.svarKladder.portal.revision }, dennis.token);
  const aktuelKladde = godkendtIgen.traad.svarKladder.portal;
  const sendt = await kald("supportEjerSvarTransporter", { sagId, anmodningId: "portal_send_0001", id: "portal", forventetRevision: aktuelKladde.revision }, dennis.token);
  const retry = await kald("supportEjerSvarTransporter", { sagId, anmodningId: "portal_send_0001", id: "portal", forventetRevision: aktuelKladde.revision }, dennis.token);
  assert.equal(sendt.beskedId, retry.beskedId, "mistet svar må kunne genforsøges idempotent");
  assert.equal(sendt.traad.id, sagId);
  assert.equal(sendt.traad.support.status, "afventer_kunden");

  const kundeSvar = await kald("supportSamtaleHent", { sagId }, kunde.token);
  assert.equal(kundeSvar.sag.id, sagId);
  assert.equal(kundeSvar.beskeder.at(-1).afsenderType, "ejer");
  assert.match(kundeSvar.beskeder.at(-1).tekst, /Dennis/);
  assert.equal(kundeSvar.beskeder.at(-1).tekst.match(/Venlig hilsen/g)?.length, 1, "kundepayload skal have præcis én signatur");
  assert.equal(JSON.stringify(kundeSvar).includes("Syntetisk intern note"), false);
  assert.equal(JSON.stringify(kundeSvar).includes("Syntetisk intern sagsbaggrund"), false);
  assert.equal(JSON.stringify(kundeSvar).includes("Intern FLEET-diagnose"), false);
  const loest = await kald("supportSagLoes", { sagId, anmodningId: "kunde_loes_0001" }, kunde.token);
  assert.equal(loest.sag.status, "loest");
  const genaabnet = await kald("supportSagGenaabn", { sagId, anmodningId: "kunde_genaabn_0001" }, kunde.token);
  assert.equal(genaabnet.sag.id, sagId);
  assert.equal(genaabnet.sag.status, "afventerSupport");
  await afvist("supportSamtaleHent", { sagId }, kollega.token, "PERMISSION_DENIED");
  await afvist("supportSamtaleHent", { sagId }, anden.token, "PERMISSION_DENIED");
  await afvist("supportSamtaleHent", { sagId }, null, "UNAUTHENTICATED");

  const lagret = (await db.ref(`support/sager/${sagId}`).once("value")).val();
  assert.equal(lagret.id, sagId);
  assert.equal(lagret.traadId, sagId);
  assert.equal((await db.ref(`udbyder/salgsindbakke/traade/${sagId}`).once("value")).exists(), false, "ejerprojektionen må ikke lagres som en parallel tråd");

  console.log(JSON.stringify({
    gate: "VEYRO support samling V1.1",
    projectId,
    sagId,
    nummer: lagret.nummer,
    kundeTilEjerTilKunde: true,
    sammeSagId: true,
    ejerprojektionKunRead: true,
    direkteSvarAfvist: true,
    aendringEfterGodkendelseAfvist: true,
    kladdeGodkendTransport: true,
    idempotentTransportRetry: true,
    idempotentInternAiRetry: true,
    idempotentBaggrundRetry: true,
    internNoteIkkeKundesynlig: true,
    internAiOgBaggrundIkkeKundesynlig: true,
    kundepayloadEnSignatur: true,
    kundesvarGenstarterIkkeAi: true,
    loesOgGenaabnSammeSag: true,
    andenBrugerSammeTenantAfvist: true,
    andenTenantAfvist: true,
    anonymAfvist: true,
    eksternAi: false,
    mail: false,
  }, null, 2));
} finally {
  await deleteApp(app);
}
