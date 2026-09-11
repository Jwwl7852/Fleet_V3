/* Sammenhængende, syntetisk review-sag til ejerkonsollen.
 *
 * Scriptet nægter at køre uden alle fire localhost-emulatorer og et demo-*
 * projekt. Virkelige integrationer forbliver ikke_tilsluttet. Faktura,
 * kredit og invitation går gennem de almindelige ejer-callables; AI- og
 * mailindhold er eksplicitte testfixtures og påstår ingen ekstern kørsel.
 */
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

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
  throw new Error("Afvist: review-seed kræver demo-projekt og alle fire faste localhost-emulatorer.");
}

const EJERMAIL = "ejer@demo.veyro.invalid";
const EJERKODE = process.env.VITE_DEV_BRUGER_KODE;
if (!EJERKODE) {
  throw new Error(
    "Afvist: sæt VITE_DEV_BRUGER_KODE fra den git-ignorerede ejer-emulatorfil; gem ikke testkoden i scriptet.",
  );
}
const TILBUD_ID = "flow_quote_20260910";
const TENANT_ID = "flow-tenant";
const PERIODE = "2026-09";
const FAKTURA_ID = "faktura_202609_flow-tenant";
const REVIEW_MAIL = "maria@reviewkunde.veyro.invalid";

const app = initializeApp({
  projectId: PROJEKT,
  databaseURL: `http://${VAERTER.database}?ns=${PROJEKT}`,
  storageBucket: `${PROJEKT}.appspot.com`,
}, "veyro-owner-review-seed");
const auth = getAuth(app);
const db = getDatabase(app);
const funktionsUrl = (navn) => `http://${VAERTER.functions}/${PROJEKT}/europe-west1/${navn}`;

async function logInd() {
  const svar = await fetch(
    `http://${VAERTER.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=review-fixture`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EJERMAIL, password: EJERKODE, returnSecureToken: true }),
    },
  );
  const json = await svar.json();
  assert.equal(svar.ok, true, `Lokalt ejerlogin fejlede: ${JSON.stringify(json)}`);
  return json.idToken;
}

async function kald(navn, data, token) {
  const svar = await fetch(funktionsUrl(navn), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const json = await svar.json();
  if (json.error) throw new Error(`${navn}: ${json.error.status || "FUNCTION_ERROR"}: ${json.error.message}`);
  return json.result;
}

const maerke = (tekst) => `[SYNTETISK TESTFIXTURE — ingen ekstern forbindelse]\n${tekst}`;

try {
  const token = await logInd();
  const ejer = await auth.getUserByEmail(EJERMAIL);
  const tilbud = (await db.ref(`udbyder/tilbud/${TILBUD_ID}`).once("value")).val();
  if (!tilbud?.virksomhedId || !tilbud?.mulighedId) {
    throw new Error("Kør først seed-owner-emulator.mjs og test-owner-flow-emulator.mjs i den friske suite.");
  }
  const virksomhedId = tilbud.virksomhedId;
  const mulighedId = tilbud.mulighedId;
  const nu = Date.now();
  const iMorgen = nu + 24 * 60 * 60 * 1000;

  const stamRef = db.ref(`udbyder/crm/virksomheder/${virksomhedId}/stamdata`);
  const stam = (await stamRef.once("value")).val() || {};
  const mulighedRef = db.ref(`udbyder/crm/virksomheder/${virksomhedId}/muligheder/${mulighedId}`);
  const mulighed = (await mulighedRef.once("value")).val() || {};
  await db.ref().update({
    [`udbyder/crm/virksomheder/${virksomhedId}/stamdata`]: {
      ...stam,
      navn: "Nordlys Drift ApS — syntetisk reviewkunde",
      kontaktNavn: "Maria Eksempel",
      kontaktEmail: REVIEW_MAIL,
      fakturaEmail: "faktura@reviewkunde.veyro.invalid",
      noter: maerke("Kunden ønsker en samlet arbejdsgang for flåde, faciliteter, planlægning og fakturagrundlag."),
      ansvarligUid: ejer.uid,
      opdateretMs: nu,
    },
    [`udbyder/crm/virksomheder/${virksomhedId}/muligheder/${mulighedId}`]: {
      ...mulighed,
      titel: "Samlet driftsplatform — reviewforløb",
      kontaktNavn: "Maria Eksempel",
      kontaktEmail: REVIEW_MAIL,
      kilde: "indgaaende",
      fase: "vundet",
      behov: maerke("Fleet, Facility, Planning og dokumenteret fakturagrundlag. Afklaring af brugerantal mangler."),
      moduler: ["flaade", "facility", "booking", "oekonomi"],
      naesteAktivitet: "Gennemgå administratorinvitation og første fakturaperiode",
      naesteAktivitetDato: new Date(iMorgen).toISOString().slice(0, 10),
      ansvarligUid: ejer.uid,
      opdateretMs: nu,
    },
    [`udbyder/crm/virksomheder/${virksomhedId}/aktiviteter/review-aktivitet`]: {
      id: "review-aktivitet",
      virksomhedId,
      mulighedId,
      titel: "Godkend opfølgningskladde",
      art: "opgave",
      status: "aaben",
      ansvarligUid: ejer.uid,
      fristDato: new Date(iMorgen).toISOString().slice(0, 10),
      notat: maerke("Kladde må ikke sendes automatisk."),
      revision: 1,
      oprettetMs: nu,
      opdateretMs: nu,
    },
    [`tenants/${TENANT_ID}/virksomhed/navn`]: "Nordlys Drift ApS — syntetisk reviewkunde",
    [`tenants/${TENANT_ID}/virksomhed/cvr`]: "00000001",
    "udbyder/salgsindbakke/traade/review-nordlys": {
      id: "review-nordlys",
      emne: "TESTADAPTER: forespørgsel om samlet driftsplatform",
      sagstype: "salg",
      delingsstatus: "delt",
      kraeverKlassifikationsgennemgang: false,
      postkasseKilder: {
        "info_veyrosystems_com_info_inbox": { mailboxId: "fixture-info", adresse: "info@veyrosystems.com", mappe: "inbox", type: "delt", ejerUid: "" },
        "dennis_veyrosystems_com_fixture-dennis_inbox": { mailboxId: "fixture-dennis", adresse: "dennis@veyrosystems.com", mappe: "inbox", type: "personlig", ejerUid: ejer.uid },
      },
      status: "afventer_kunden",
      ansvarligUid: ejer.uid,
      kontaktNavn: "Maria Eksempel",
      kontaktEmail: REVIEW_MAIL,
      senesteFra: REVIEW_MAIL,
      senesteAktivitetMs: nu,
      revision: 1,
      kilde: { art: "fixture", adapter: "lokal_review_v1" },
      links: { virksomhedId, mulighedId, tilbudId: TILBUD_ID },
      beskeder: {
        "review-mail-1": {
          id: "review-mail-1",
          provider: "fixture",
          providerMessageId: "fixture-review-mail-1",
          retning: "indgaaende",
          fra: REVIEW_MAIL,
          til: "info@veyrosystems.com",
          emne: "Forespørgsel om samlet driftsplatform",
          tekst: maerke("Vi vil samle køretøjer, service på lokationer, planlægning og fakturagrundlag. Kan I beskrive en løsning og en realistisk indfasning? Vi er endnu ikke sikre på antal brugere."),
          sendtMs: nu - 3_600_000,
        },
        "review-mail-2": {
          id: "review-mail-2",
          provider: "fixture",
          providerMessageId: "fixture-review-mail-2",
          retning: "udgaaende",
          fra: "info@veyrosystems.com",
          til: REVIEW_MAIL,
          emne: "Re: Forespørgsel om samlet driftsplatform",
          tekst: maerke("Tak for jeres henvendelse. Vi har samlet et kundetilpasset forslag og vil gerne afklare brugerantal og ønsket opstartsdato."),
          sendtMs: nu - 1_800_000,
        },
      },
      noter: {
        "review-note-1": {
          id: "review-note-1",
          tekst: maerke("Dennis og Jørn gennemgår modulets leveringsstatus før næste kundesvar."),
          oprettetMs: nu - 1_200_000,
          oprettetAf: ejer.uid,
        },
      },
      analyser: {
        "review-ai-1": {
          id: "review-ai-1",
          provider: "fixture",
          model: "ingen — statisk testadapter",
          opsummering: maerke("Kunden efterspørger én sammenhængende driftsplatform og ønsker en trinvis indfasning."),
          behov: [
            "Samlet overblik over køretøjer og facility-service",
            "Planlægning med dokumenterbart fakturagrundlag",
            "Afklaring af indfasning og brugerantal",
          ],
          modulforslag: [
            { modulId: "Fleet", leveringsstatus: "Tilgængelig", begrundelse: "Køretøjer og servicehistorik." },
            { modulId: "Facility", leveringsstatus: "Under udvikling", begrundelse: "Lokationer og aktiver skal afgrænses i tilbuddet." },
            { modulId: "Planning", leveringsstatus: "Kræver særskilt aftale", begrundelse: "Indfasning og datakilder skal afklares." },
          ],
          manglendeOplysninger: ["Antal administrative og operative brugere", "Ønsket opstartsdato"],
          afklarendeSpoergsmaal: ["Hvor mange brugere skal med i første fase?", "Hvilke lokationer skal prioriteres?"],
          naesteHandling: "Gennemgå svarudkastet manuelt og aftal et afklaringsmøde.",
          kildehenvisninger: [
            { beskedId: "review-mail-1", citat: "samle køretøjer, service på lokationer, planlægning og fakturagrundlag", understoetter: "Modulbehov" },
          ],
          svarudkast: maerke("Hej Maria\n\nTak for den konkrete beskrivelse. For at afgrænse første fase vil vi gerne kende antal brugere, prioriterede lokationer og ønsket opstartsdato.\n\nVenlig hilsen\nVeyro Systems"),
          revision: 1,
          oprettetMs: nu - 2_400_000,
        },
      },
      aiSamtaler: {
        "review-chat-1": {
          id: "review-chat-1",
          provider: "fixture",
          spoergsmaal: "Hvad bør vi afklare før tilbuddet?",
          svar: maerke("Afklar brugerantal, prioriterede lokationer, integrationsbehov og ønsket opstart. Forslaget er internt og må ikke sendes uden gennemgang."),
          oprettetMs: nu - 2_100_000,
        },
      },
      opfoelgninger: {
        "review-followup-1": {
          id: "review-followup-1",
          status: "godkendt",
          til: REVIEW_MAIL,
          emne: "Opfølgning på Veyro-tilbud T-2026-0001",
          tekst: maerke("Hej Maria\n\nHar I haft mulighed for at gennemgå oplægget? Vi foreslår et kort møde om brugerantal og første lokation.\n\nVenlig hilsen\nVeyro Systems"),
          signatur: "Venlig hilsen\nVeyro Systems",
          forfalderMs: iMorgen,
          revision: 1,
          godkendtAf: ejer.uid,
          godkendtMs: nu,
          opdateretMs: nu,
          adapter: "fixture",
        },
      },
    },
    "udbyder/salgsindbakke/traade/review-support": {
      id: "review-support", emne: "TESTADAPTER: FLEET-login virker ikke", sagstype: "support", delingsstatus: "delt",
      status: "afventer_os", ansvarligUid: "", kontaktNavn: "Maria Eksempel", kontaktEmail: REVIEW_MAIL,
      virksomhedsnavn: "Nordlys Drift ApS — syntetisk reviewkunde", senesteFra: REVIEW_MAIL, senesteRetning: "indgaaende",
      senesteAktivitetMs: nu - 900_000, oprettetMs: nu - 1_800_000, revision: 1,
      links: { virksomhedId, mulighedId, tenantId: TENANT_ID },
      support: { nummer: "SUP-2026-0001", type: "adgang", status: "triage", prioritet: "hoej", modul: "FLEET", ansvarligUid: "", fristMs: iMorgen, opdateretMs: nu },
      postkasseKilder: { "dennis_veyrosystems_com_fixture-dennis_inbox": { mailboxId: "fixture-dennis", adresse: "dennis@veyrosystems.com", mappe: "inbox", type: "personlig", ejerUid: ejer.uid } },
      beskeder: { "support-mail-1": { id: "support-mail-1", provider: "fixture", internetMessageId: "<support-1@review.invalid>", retning: "indgaaende", fra: REVIEW_MAIL, til: "dennis@veyrosystems.com", emne: "FLEET-login virker ikke", tekst: maerke("Vi kan ikke logge ind i FLEET efter en adgangsændring. Kan I hjælpe?"), sendtMs: nu - 900_000 } },
      analyser: { "support-ai-1": { id: "support-ai-1", provider: "fixture", model: "ingen — statisk testadapter", opsummering: maerke("Kendt kunde melder et adgangsproblem i FLEET."), behov: ["Genetablér adgang uden at udvide rettigheder"], manglendeOplysninger: ["Berørt bruger", "Fejltekst"], svarudkast: maerke("Hej Maria\n\nTak for beskeden. Hvilken bruger og præcis fejltekst ser I? Vi undersøger sagen uden at ændre jeres adgangsniveau.\n\nVenlig hilsen\nVeyro Systems"), revision: 1, oprettetMs: nu } },
    },
    "udbyder/salgsindbakke/traade/review-intern": {
      id: "review-intern", emne: "TESTADAPTER: Domicil · leje af kontor", sagstype: "intern", delingsstatus: "afklaring",
      status: "afventer_kunden", ansvarligUid: ejer.uid, kontaktNavn: "Anders Eksempel", kontaktEmail: "anders@intern.fixture.invalid",
      senesteFra: "anders@intern.fixture.invalid", senesteRetning: "indgaaende", senesteAktivitetMs: nu - 7_200_000, oprettetMs: nu - 86_400_000, revision: 1,
      beskeder: { "intern-mail-1": { id: "intern-mail-1", provider: "fixture", retning: "indgaaende", fra: "anders@intern.fixture.invalid", til: "dennis@veyrosystems.com", emne: "Udkast til lejevilkår", tekst: maerke("Vedhæftet er et udkast. Kan I vende tilbage fredag?"), sendtMs: nu - 7_200_000 } },
    },
    "udbyder/integrationer/microsoft365": {
      status: "ikke_tilsluttet",
      mailboxType: null,
      mailboxId: null,
      testfixture: true,
      note: "Reviewdata er statiske fixtures; ingen Graph-forbindelse er anvendt.",
    },
    "udbyder/integrationer/openai": {
      status: "ikke_tilsluttet",
      model: null,
      testfixture: true,
      note: "AI-visningen bruger et statisk, mærket reviewfixture; intet er sendt til OpenAI.",
    },
    "udbyder/leverandoerer/review-hosting": { id: "review-hosting", navn: "Eksempel Hosting A/S", kategori: "Hosting", kontakt: "aftale@hosting.fixture.invalid", status: "aktiv", aftaleTil: "2027-12-31", noter: maerke("Syntetisk leverandør til lokal gennemgang."), revision: 1 },
    "udbyder/leverandoerer/review-hardware": { id: "review-hardware", navn: "Eksempel Hardware ApS", kategori: "OBD-hardware", kontakt: "salg@hardware.fixture.invalid", status: "aktiv", aftaleTil: "2027-06-30", noter: maerke("Syntetisk leverandør. Ingen bestilling er sendt."), revision: 1 },
  });

  // Stor, deterministisk pipelinefixture: dokumenterer at vundne muligheder
  // ikke klippes efter 100 poster, og at hitrate/paginering kan gennemgås.
  const pipelineFixture = {
    [`udbyder/crm/virksomheder/${virksomhedId}/muligheder/review-pilot-001`]: {
      id: "review-pilot-001", virksomhedId, titel: "Pilotforløb · FLEET og OBD · TESTFIXTURE",
      kontaktNavn: "Maria Eksempel", kontaktEmail: REVIEW_MAIL, ansvarligUid: ejer.uid,
      kilde: "indgaaende", behov: maerke("Tre måneders pilot på 25 enheder; OBD-antal og startdato kræver afklaring."),
      moduler: ["flaade"], fase: "demo", pilotFra: "2026-10-01", pilotTil: "2026-12-31",
      forventetLukDato: "2027-01-10", naesteAktivitet: "Afklar OBD-antal og pilotstart",
      naesteAktivitetDato: "2026-09-15", maanedligVaerdiOere: 125000, engangsVaerdiOere: 375000,
      revision: 1, oprettetMs: nu - 2 * 86_400_000, opdateretMs: nu,
    },
  };
  for (let indeks = 1; indeks <= 103; indeks += 1) {
    const id = `review-vundet-${String(indeks).padStart(3, "0")}`;
    pipelineFixture[`udbyder/crm/virksomheder/${virksomhedId}/muligheder/${id}`] = {
      id, virksomhedId, titel: `Historisk vundet aftale ${String(indeks).padStart(3, "0")} · TESTFIXTURE`,
      kontaktNavn: "Maria Eksempel", kontaktEmail: REVIEW_MAIL, ansvarligUid: ejer.uid,
      kilde: "indgaaende", behov: maerke("Historisk pipelinepost til paginering og hitrate."),
      moduler: ["flaade"], forventetLukDato: "2026-08-31", fase: "vundet",
      naesteAktivitet: "", naesteAktivitetDato: "", maanedligVaerdiOere: 100000 + indeks * 100,
      engangsVaerdiOere: 250000, revision: 1, oprettetMs: nu - indeks * 86_400_000, opdateretMs: nu - indeks * 86_400_000,
    };
  }
  for (let indeks = 1; indeks <= 26; indeks += 1) {
    const id = `review-tabt-${String(indeks).padStart(3, "0")}`;
    pipelineFixture[`udbyder/crm/virksomheder/${virksomhedId}/muligheder/${id}`] = {
      id, virksomhedId, titel: `Historisk tabt aftale ${String(indeks).padStart(3, "0")} · TESTFIXTURE`, kontaktNavn: "Maria Eksempel", kontaktEmail: REVIEW_MAIL,
      ansvarligUid: ejer.uid, kilde: "indgaaende", behov: maerke("Historisk tabt post til hitrate."), moduler: ["flaade"], forventetLukDato: "2026-08-31",
      fase: "tabt", tabtAarsag: "Syntetisk testårsag", maanedligVaerdiOere: 90000, engangsVaerdiOere: 0, revision: 1, oprettetMs: nu - indeks * 86_400_000, opdateretMs: nu - indeks * 86_400_000,
    };
  }
  await db.ref().update(pipelineFixture);

  const grundlagRef = db.ref(`udbyder/fakturagrundlag/${PERIODE}/${TENANT_ID}`);
  if (!(await grundlagRef.once("value")).exists()) {
    await grundlagRef.set({
      type: "ordinaer",
      forretningsnoegle: `faktura:${PERIODE}:${TENANT_ID}:ordinaer`,
      kundeId: TENANT_ID,
      periode: PERIODE,
      periodeFra: Date.parse("2026-09-01T00:00:00Z"),
      periodeTil: Date.parse("2026-10-01T00:00:00Z") - 1,
      prislisteId: tilbud.versioner?.[tilbud.aktuelVersion]?.snapshot?.prislisteId
        || "review-fixture-prisliste",
      aftaleId: "aftale_flow_quote_20260910_2",
      aftaleVersion: 1,
      maengdekilder: { platform: "syntetisk reviewfixture" },
      linjer: [{
        modul: "dashboard", akse: "platform", antal: 1000,
        satsOere: 270000, momssats: 25,
      }],
      beloebOere: 270000,
      momsOere: 67500,
      ialtOere: 337500,
      laast: true,
      genereretMs: nu,
      genereretAf: "lokal-review-fixture",
      generationId: "review-flow-202609",
      revision: 0,
      fixture: true,
    });
  }

  let grundlag = (await grundlagRef.once("value")).val();
  if (!grundlag.frigivelse) {
    await kald("fakturagrundlagfrigiv", {
      periode: PERIODE, tenantId: TENANT_ID, forventetRevision: grundlag.revision || 0,
      sendEfterFrigivelse: true, operationId: "review-frigiv-202609",
    }, token);
  }
  grundlag = (await grundlagRef.once("value")).val();
  if (!grundlag.dokumenter?.pdf || !grundlag.dokumenter?.csv) {
    await kald("fakturagrundlagdokumenter", { periode: PERIODE, tenantId: TENANT_ID }, token);
  }

  await db.ref("udbyder/integrationer/dinero").set({
    status: "aktiv", adapter: "test", testScenario: "success", testOnly: true,
  });
  let fakturajob = (await db.ref(`udbyder/fakturajobs/${FAKTURA_ID}`).once("value")).val();
  if (fakturajob?.status !== "sendt") {
    await kald("fakturajobkoer", { periode: PERIODE, tenantId: TENANT_ID, operationId: "review-send-202609" }, token);
  }
  fakturajob = (await db.ref(`udbyder/fakturajobs/${FAKTURA_ID}`).once("value")).val();
  const betaltOere = Math.floor(337500 / 2);
  await db.ref().update({
    [`udbyder/fakturajobs/${FAKTURA_ID}/betalingStatus`]: "delvist_betalt",
    [`udbyder/fakturajobs/${FAKTURA_ID}/betaltOere`]: betaltOere,
    [`udbyder/fakturajobs/${FAKTURA_ID}/restOere`]: 337500 - betaltOere,
    [`udbyder/fakturajobs/${FAKTURA_ID}/betalingKilde`]: "syntetisk_testadapter",
    [`udbyder/dinero/dokumenter/faktura/${fakturajob.eksternReference}`]: {
      guid: fakturajob.eksternReference,
      nummer: "TEST-2026-0901",
      status: "Booket",
      origin: "syntetisk_testadapter",
      totalInklMomsOere: 337500,
      betaling: {
        betaltOere,
        restOere: 337500 - betaltOere,
        poster: [{ dato: "2026-09-10", beloebOere: betaltOere, reference: "TESTBETALING" }],
      },
      synkroniseretMs: nu,
    },
  });

  const kreditRod = db.ref(`udbyder/kreditnotaer/${FAKTURA_ID}/poster`);
  let kreditPoster = (await kreditRod.once("value")).val() || {};
  let kredit = Object.values(kreditPoster).find((post) => post?.snapshot?.aarsag === "Review: aftalt delkreditering");
  if (!kredit) {
    const oprettet = await kald("kreditnotaopret", {
      fakturaId: FAKTURA_ID,
      operationId: "review-credit-202609",
      aarsag: "Review: aftalt delkreditering",
      valg: [{ kildeIndeks: 0, antal: 250 }],
    }, token);
    kredit = (await db.ref(`udbyder/kreditnotaer/${FAKTURA_ID}/poster/${oprettet.kreditId}`).once("value")).val();
  }
  if (!kredit.frigivelse) {
    await kald("kreditnotafrigiv", {
      fakturaId: FAKTURA_ID,
      kreditId: kredit.id,
      forventetRevision: kredit.revision || 0,
      sendEfterFrigivelse: true,
      operationId: "review-credit-release-202609",
    }, token);
    kredit = (await db.ref(`udbyder/kreditnotaer/${FAKTURA_ID}/poster/${kredit.id}`).once("value")).val();
  }
  if (!kredit.dokument) {
    await kald("kreditnotadokumenter", { fakturaId: FAKTURA_ID, kreditId: kredit.id }, token);
  }
  const kreditjobRef = db.ref(`udbyder/kreditjobs/kreditjob_${kredit.id}`);
  const kreditjob = (await kreditjobRef.once("value")).val();
  if (kreditjob && kreditjob.status !== "sendt") {
    await kald("kreditnotajobkoer", {
      fakturaId: FAKTURA_ID, kreditId: kredit.id, operationId: "review-credit-send-202609",
    }, token);
  }

  const invitationer = (await db.ref("udbyder/invitationer").once("value")).val() || {};
  if (!Object.values(invitationer).some((inv) => inv.tenantId === TENANT_ID && inv.email === "admin@reviewkunde.veyro.invalid" && inv.status === "afventer")) {
    await kald("kundeinvitationopret", {
      tenantId: TENANT_ID,
      email: "admin@reviewkunde.veyro.invalid",
      navn: "Alex Testadministrator",
      rolle: "admin",
    }, token);
  }

  await db.ref("udbyder/integrationer/dinero").set({
    status: "ikke_tilsluttet",
    adapter: null,
    testfixture: true,
    note: "Faktura og kredit blev dannet af den lokale testadapter. Ingen Dinero-forbindelse er aktiv.",
  });

  console.log(JSON.stringify({
    ok: true,
    fixture: "lokal_review_v1",
    virksomhedId,
    mulighedId,
    tilbudId: TILBUD_ID,
    tenantId: TENANT_ID,
    fakturaId: FAKTURA_ID,
    kreditId: kredit.id,
    integrationsstatus: "ikke_tilsluttet",
  }, null, 2));
} finally {
  await deleteApp(app);
}
