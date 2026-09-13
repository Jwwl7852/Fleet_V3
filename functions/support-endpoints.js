/*
 * Fælles support-endpoints. Én servervej for kunde og ejer; ingen klient
 * skriver direkte i support/. Ingen ekstern AI eller mailtransport her.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
import { createHash } from "node:crypto";
import {
  SUPPORT_AFSENDER,
  SUPPORT_ANSVAR,
  SUPPORT_KANAL,
  SUPPORT_KONTRAKT_VERSION,
  SUPPORT_SERIE,
  SUPPORT_SYNLIGHED,
  gyldigtSupportAnmodningId,
  kontekstFilter,
  kundesynligSupportSag,
  kundesynligeSupportBeskeder,
  maaPublicereSupportAi,
  renSupportTekst,
  supportSagTilEjerTraad,
  supportStatusFraEjer,
  supportStatusskift,
} from "./delt/support.js";
import { lokaltEjerSupportAiForslag, lokaltSupportAiSvar } from "./delt/support-ai.js";
import { naesteNummer } from "./delt/booking-state.js";

const REGION = "europe-west1";
const options = { region: REGION };

function kundeIdentitet(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenant = req.auth.token?.tenant;
  if (!tenant) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  return { uid: req.auth.uid, tenant };
}

function ejerIdentitet(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  if (req.auth.token?.udbyder !== true) throw new HttpsError("permission-denied", "Kræver udbyderadgang.");
  return { uid: req.auth.uid, udbyder: true };
}

function kraevId(id, navn = "id") {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) {
    throw new HttpsError("invalid-argument", `${navn} har ugyldigt format.`);
  }
  return id;
}

function kraevAnmodningId(id) {
  if (!gyldigtSupportAnmodningId(id)) {
    throw new HttpsError("invalid-argument", "anmodningId skal være 8-80 tegn og må kun indeholde bogstaver, tal, _ og -.");
  }
  return id;
}

async function hentKundesag(db, bruger, sagId) {
  kraevId(sagId, "sagId");
  const sag = (await db.ref(`support/sager/${sagId}`).once("value")).val();
  if (!sag || sag.tenantId !== bruger.tenant || sag.oprettetAfUid !== bruger.uid) {
    throw new HttpsError("permission-denied", "Supportsagen tilhører ikke denne bruger og tenant.");
  }
  return sag;
}

async function hentEjersag(db, sagId) {
  kraevId(sagId, "sagId");
  const sag = (await db.ref(`support/sager/${sagId}`).once("value")).val();
  if (!sag) throw new HttpsError("not-found", "Supportsagen findes ikke.");
  return sag;
}

async function kundesvar(db, sag) {
  const beskeder = (await db.ref(`support/beskeder/${sag.id}`).once("value")).val() || {};
  return {
    sag: kundesynligSupportSag(sag),
    beskeder: Object.values(kundesynligeSupportBeskeder(beskeder))
      .sort((a, b) => Number(a.oprettetMs) - Number(b.oprettetMs) || String(a.id).localeCompare(String(b.id), "da")),
  };
}

async function reservérIdempotens(db, uid, anmodningId, operation, foreslaaetSagId) {
  kraevAnmodningId(anmodningId);
  const ref = db.ref(`support/idempotens/${uid}/${anmodningId}`);
  const resultat = await ref.transaction((nu) => nu ? undefined : { operation, sagId: foreslaaetSagId });
  const post = resultat.snapshot.val();
  if (post.operation !== operation) throw new HttpsError("already-exists", "anmodningId er allerede brugt til en anden operation.");
  return { post, ny: resultat.committed };
}

function besked({ id, anmodningId, afsenderType, afsenderUid, tekst, kilde = null, nu }) {
  return {
    id, anmodningId, synlighed: SUPPORT_SYNLIGHED.kunde,
    afsenderType, afsenderUid: afsenderUid || null, kanal: SUPPORT_KANAL.portal,
    tekst, kilde, oprettetMs: nu,
  };
}

function stabilJson(vaerdi) {
  if (Array.isArray(vaerdi)) return `[${vaerdi.map(stabilJson).join(",")}]`;
  if (vaerdi && typeof vaerdi === "object") {
    return `{${Object.keys(vaerdi).sort().map((key) => `${JSON.stringify(key)}:${stabilJson(vaerdi[key])}`).join(",")}}`;
  }
  return JSON.stringify(vaerdi);
}

function verificeretTransaktionsstart(foer) {
  let foersteKald = true;
  return (lokalVaerdi) => {
    const vaerdi = foersteKald && lokalVaerdi == null ? foer : lokalVaerdi;
    foersteKald = false;
    return vaerdi;
  };
}

function svarIndholdHash(post = {}) {
  return createHash("sha256").update(stabilJson({
    kanal: post.kanal || "",
    tilUid: post.tilUid || "",
    tekst: post.tekst || "",
    signatur: post.signatur || "",
    vedhaeftninger: post.vedhaeftninger || [],
    basisSagRevision: Number(post.basisSagRevision || 0),
  })).digest("hex");
}

async function ejerTraad(db, sag) {
  const [beskeder, noter, internAi, svarKladder, sagsOplysninger] = await Promise.all([
    db.ref(`support/beskeder/${sag.id}`).once("value"),
    db.ref(`support/interneNoter/${sag.id}`).once("value"),
    db.ref(`support/internAi/${sag.id}`).once("value"),
    db.ref(`support/svarKladder/${sag.id}`).once("value"),
    db.ref(`support/sagsOplysninger/${sag.id}`).once("value"),
  ]);
  return supportSagTilEjerTraad({
    sag,
    beskeder: beskeder.val() || {},
    noter: noter.val() || {},
    internAi: internAi.val() || {},
    svarKladder: svarKladder.val() || {},
    sagsOplysninger: sagsOplysninger.val() || {},
  });
}

function kraevRevision(vaerdi, navn, { positiv = false } = {}) {
  const revision = Number(vaerdi);
  if (!Number.isSafeInteger(revision) || revision < (positiv ? 1 : 0)) {
    throw new HttpsError("invalid-argument", `${navn} har ugyldigt format.`);
  }
  return revision;
}

function supportTekstfingeraftryk(vaerdi = "") {
  let hash = 2166136261;
  for (const tegn of String(vaerdi)) {
    hash ^= tegn.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function senesteSupportKladde(svarKladder = {}) {
  return Object.values(svarKladder || {})
    .sort((a, b) => Number(b?.opdateretMs || 0) - Number(a?.opdateretMs || 0))[0] || null;
}

function ejerNavn(req) {
  return renSupportTekst(req.auth?.token?.name, 160)
    || renSupportTekst(req.auth?.token?.email, 320)
    || "Ejer";
}

async function verificeretKundeMetadata(db, bruger, req) {
  const [indeks, virksomhed] = await Promise.all([
    db.ref(`udbyder/kunder/${bruger.tenant}`).once("value"),
    db.ref(`tenants/${bruger.tenant}/virksomhed`).once("value"),
  ]);
  return {
    kontaktNavn: renSupportTekst(req.auth?.token?.name, 160) || "",
    kontaktEmail: renSupportTekst(req.auth?.token?.email, 320) || "",
    virksomhedsnavn: renSupportTekst(virksomhed.val()?.navn, 300) || bruger.tenant,
    /* tenantId er et signeret claim. CRM-id'et tilføjes kun, når ejerens
       eksisterende kundeindeks bekræfter præcis samme nøgle. */
    virksomhedId: indeks.exists() ? bruger.tenant : null,
  };
}

async function publicerLokalAi(db, sagId, tekst, startRevision) {
  const viden = Object.values((await db.ref("udbyder/vidensbase/poster").once("value")).val() || {});
  const sagFoer = (await db.ref(`support/sager/${sagId}`).once("value")).val();
  const ai = lokaltSupportAiSvar({ tekst, viden, kontekst: sagFoer });
  const nu = Date.now();
  const ref = db.ref(`support/sager/${sagId}`);
  const transaktionsstart = verificeretTransaktionsstart(sagFoer);
  const transaktion = await ref.transaction((sag) => {
    const aktuel = transaktionsstart(sag);
    if (!maaPublicereSupportAi(aktuel, startRevision)) return;
    const naeste = { ...aktuel, revision: aktuel.revision + 1, opdateretMs: nu };
    if (ai.kilde) naeste.anvendteKilder = [ai.kilde];
    if (ai.eskaler) Object.assign(naeste, supportStatusskift(aktuel, "eskaler"), {
      eskaleringsaarsag: ai.eskaleringsaarsag, eskaleretMs: nu,
    });
    return naeste;
  });
  if (!transaktion.committed) return false;
  const sag = transaktion.snapshot.val();
  const aiId = `ai_${sag.revision}`;
  await db.ref().update({
    [`support/beskeder/${sagId}/${aiId}`]: besked({
      id: aiId, anmodningId: aiId, afsenderType: SUPPORT_AFSENDER.ai,
      tekst: ai.tekst, kilde: ai.kilde, nu,
    }),
    [`tenants/${sag.tenantId}/supportsager/${sagId}`]: {
      oprettetAfUid: sag.oprettetAfUid, status: sag.status, opdateretMs: sag.opdateretMs,
    },
  });
  return true;
}

export const supportSamtaleStart = onCall(options, async (req) => {
  const bruger = kundeIdentitet(req); const d = req.data || {}; const db = getDatabase();
  const emne = renSupportTekst(d.emne, 140); const tekst = renSupportTekst(d.tekst);
  if (!emne || !tekst) throw new HttpsError("invalid-argument", "Emne og problembeskrivelse er påkrævet.");
  if (d.vedhaeftninger?.length) throw new HttpsError("failed-precondition", "Fælles supportupload er ikke aktiveret endnu.");
  const forslag = db.ref("support/sager").push().key;
  const reservation = await reservérIdempotens(db, bruger.uid, d.anmodningId, "start", forslag);
  const sagId = reservation.post.sagId;
  let sag = (await db.ref(`support/sager/${sagId}`).once("value")).val();
  if (!sag) {
    const nu = Date.now(); const kontekst = kontekstFilter(d.kontekst || {}).tilladt;
    const kundeMetadata = await verificeretKundeMetadata(db, bruger, req);
    const nummer = await naesteNummer(db, () => "", SUPPORT_SERIE);
    sag = {
      kontraktVersion: SUPPORT_KONTRAKT_VERSION, id: sagId, nummer,
      tenantId: bruger.tenant, oprettetAfUid: bruger.uid,
      ...kundeMetadata,
      status: "aiDialog", ansvarstype: SUPPORT_ANSVAR.ai, ansvarligUid: null,
      emne, problemResume: tekst, modul: kontekst.modul || null,
      programversion: kontekst.version || null, side: kontekst.side || null,
      kontekst, afproevedeTrin: [], anvendteKilder: [], eskaleringsaarsag: null,
      /* Portalens stabile ejeridentitet er samme nøgle. Der oprettes ingen
         selvstændigt redigerbar tråd under salgsindbakken. */
      traadId: sagId, mailTraadId: null, revision: 1, oprettetMs: nu, opdateretMs: nu,
      eskaleretMs: null, overtagetMs: null, loestMs: null,
    };
    const opret = await db.ref(`support/sager/${sagId}`).transaction((aktuel) => aktuel || sag);
    sag = opret.snapshot.val();
    await db.ref().update({
      [`support/beskeder/${sagId}/m_${d.anmodningId}`]: besked({ id: `m_${d.anmodningId}`, anmodningId: d.anmodningId, afsenderType: SUPPORT_AFSENDER.kunde, afsenderUid: bruger.uid, tekst, nu }),
      [`tenants/${bruger.tenant}/supportsager/${sagId}`]: { oprettetAfUid: bruger.uid, status: sag.status, opdateretMs: nu },
    });
    await publicerLokalAi(db, sagId, tekst, 1);
    sag = (await db.ref(`support/sager/${sagId}`).once("value")).val();
  }
  if (sag.tenantId !== bruger.tenant || sag.oprettetAfUid !== bruger.uid) throw new HttpsError("permission-denied", "Idempotensnøglen peger på en anden identitet.");
  return kundesvar(db, sag);
});

export const supportSamtalerList = onCall(options, async (req) => {
  const bruger = kundeIdentitet(req); const db = getDatabase();
  const indeks = (await db.ref(`tenants/${bruger.tenant}/supportsager`).once("value")).val() || {};
  const sager = await Promise.all(Object.entries(indeks)
    .filter(([, post]) => post?.oprettetAfUid === bruger.uid)
    .map(async ([id]) => (await db.ref(`support/sager/${id}`).once("value")).val()));
  return sager.filter((sag) => sag?.tenantId === bruger.tenant && sag?.oprettetAfUid === bruger.uid)
    .map(kundesynligSupportSag).sort((a, b) => Number(b.opdateretMs) - Number(a.opdateretMs));
});

export const supportSamtaleHent = onCall(options, async (req) => {
  const bruger = kundeIdentitet(req); const db = getDatabase();
  return kundesvar(db, await hentKundesag(db, bruger, req.data?.sagId));
});

export const supportBeskedSend = onCall(options, async (req) => {
  const bruger = kundeIdentitet(req); const d = req.data || {}; const db = getDatabase();
  let sag = await hentKundesag(db, bruger, d.sagId); const tekst = renSupportTekst(d.tekst);
  if (!tekst) throw new HttpsError("invalid-argument", "Beskeden er tom eller for lang.");
  if (d.vedhaeftninger?.length) throw new HttpsError("failed-precondition", "Fælles supportupload er ikke aktiveret endnu.");
  const reservation = await reservérIdempotens(db, bruger.uid, d.anmodningId, "send", sag.id);
  const beskedId = `m_${d.anmodningId}`;
  if (reservation.ny || !(await db.ref(`support/beskeder/${sag.id}/${beskedId}`).once("value")).exists()) {
    const nu = Date.now();
    const transaktionsstart = verificeretTransaktionsstart(sag);
    const tx = await db.ref(`support/sager/${sag.id}`).transaction((aktuel) => {
      aktuel = transaktionsstart(aktuel);
      if (!aktuel || aktuel.tenantId !== bruger.tenant || aktuel.oprettetAfUid !== bruger.uid) return;
      if (aktuel.operationer?.[d.anmodningId]) return;
      return {
        ...aktuel,
        ...(aktuel.ansvarstype === SUPPORT_ANSVAR.ejer
          ? { status: aktuel.ansvarligUid ? "underBehandling" : "afventerSupport" }
          : {}),
        revision: aktuel.revision + 1, opdateretMs: nu,
        operationer: { ...(aktuel.operationer || {}), [d.anmodningId]: { art: "send", ms: nu } },
      };
    });
    sag = tx.snapshot.val() || await hentKundesag(db, bruger, sag.id);
    await db.ref(`support/beskeder/${sag.id}/${beskedId}`).set(besked({ id: beskedId, anmodningId: d.anmodningId, afsenderType: SUPPORT_AFSENDER.kunde, afsenderUid: bruger.uid, tekst, nu }));
    await db.ref(`tenants/${bruger.tenant}/supportsager/${sag.id}`).set({ oprettetAfUid: bruger.uid, status: sag.status, opdateretMs: sag.opdateretMs });
    if (sag.status === "aiDialog" && sag.ansvarstype === SUPPORT_ANSVAR.ai) {
      await publicerLokalAi(db, sag.id, tekst, sag.revision);
      sag = (await db.ref(`support/sager/${sag.id}`).once("value")).val();
    }
  }
  return kundesvar(db, sag);
});

async function kundestatus(req, handling) {
  const bruger = kundeIdentitet(req); const d = req.data || {}; const db = getDatabase();
  const sag = await hentKundesag(db, bruger, d.sagId);
  await reservérIdempotens(db, bruger.uid, d.anmodningId, handling, sag.id);
  const nu = Date.now();
  const transaktionsstart = verificeretTransaktionsstart(sag);
  const tx = await db.ref(`support/sager/${sag.id}`).transaction((aktuel) => {
    aktuel = transaktionsstart(aktuel);
    if (!aktuel || aktuel.tenantId !== bruger.tenant || aktuel.oprettetAfUid !== bruger.uid) return;
    if (aktuel.operationer?.[d.anmodningId]) return;
    const skift = supportStatusskift(aktuel, handling);
    if (!skift) return;
    const naeste = {
      ...aktuel, ...skift, revision: aktuel.revision + 1, opdateretMs: nu,
      operationer: { ...(aktuel.operationer || {}), [d.anmodningId]: { art: handling, ms: nu } },
    };
    if (handling === "eskaler" || handling === "genaabn") Object.assign(naeste, { eskaleringsaarsag: renSupportTekst(d.aarsag, 500) || "Kunden bad om menneskelig hjælp.", eskaleretMs: nu, loestMs: null });
    if (handling === "loes") naeste.loestMs = nu;
    return naeste;
  });
  const gemt = tx.snapshot.val() || await hentKundesag(db, bruger, sag.id);
  await db.ref(`tenants/${bruger.tenant}/supportsager/${sag.id}`).set({ oprettetAfUid: bruger.uid, status: gemt.status, opdateretMs: gemt.opdateretMs });
  return kundesvar(db, gemt);
}

export const supportEskaler = onCall(options, (req) => kundestatus(req, "eskaler"));
export const supportSagLoes = onCall(options, (req) => kundestatus(req, "loes"));
export const supportSagGenaabn = onCall(options, (req) => kundestatus(req, "genaabn"));

export const supportEjerKoelist = onCall(options, async (req) => {
  ejerIdentitet(req); const db = getDatabase();
  const sager = Object.values((await db.ref("support/sager").once("value")).val() || {})
    .filter((sag) => sag?.ansvarstype === SUPPORT_ANSVAR.ejer || (sag?.status === "loest" && sag?.overtagetMs))
    .sort((a, b) => Number(b.opdateretMs) - Number(a.opdateretMs));
  const traade = await Promise.all(sager.map((sag) => ejerTraad(db, sag)));
  return { traade: Object.fromEntries(traade.map((traad) => [traad.id, traad])) };
});

export const supportEjerSagHent = onCall(options, async (req) => {
  ejerIdentitet(req); const db = getDatabase(); const sag = await hentEjersag(db, req.data?.sagId);
  return { traad: await ejerTraad(db, sag) };
});

async function ejerSkift(req, handling) {
  const ejer = ejerIdentitet(req); const d = req.data || {}; const db = getDatabase();
  const sag = await hentEjersag(db, d.sagId); kraevAnmodningId(d.anmodningId);
  let konflikt = ""; const idemBruger = `ejer_${ejer.uid}`; const nu = Date.now();
  const supportRef = db.ref("support");
  const transaktionsstart = verificeretTransaktionsstart((await supportRef.once("value")).val() || {});
  const tx = await supportRef.transaction((rod) => {
    const aktuelRod = transaktionsstart(rod) || {}; const aktuel = aktuelRod.sager?.[sag.id];
    const tidligere = aktuelRod.idempotens?.[idemBruger]?.[d.anmodningId];
    if (tidligere) {
      if (tidligere.operation !== handling || tidligere.sagId !== sag.id) konflikt = "anmodningId er brugt til en anden handling.";
      return konflikt ? undefined : aktuelRod;
    }
    if (!aktuel || Number(aktuel.revision) !== Number(d.forventetRevision)) { konflikt = "Sagen er ændret. Hent den igen."; return; }
    const skift = supportStatusskift(aktuel, handling);
    if (!skift) { konflikt = "Kun en sag der afventer support kan overtages."; return; }
    aktuelRod.sager ||= {}; aktuelRod.idempotens ||= {}; aktuelRod.idempotens[idemBruger] ||= {};
    aktuelRod.sager[sag.id] = { ...aktuel, ...skift, ansvarligUid: ejer.uid, revision: Number(aktuel.revision) + 1, opdateretMs: nu, overtagetMs: nu };
    aktuelRod.idempotens[idemBruger][d.anmodningId] = { operation: handling, sagId: sag.id, revision: Number(aktuel.revision) + 1, ms: nu };
    return aktuelRod;
  });
  if (!tx.committed || konflikt) throw new HttpsError("aborted", konflikt || "Sagen kunne ikke overtages.");
  const gemt = tx.snapshot.val()?.sager?.[sag.id];
  return { traad: await ejerTraad(db, gemt) };
}

export const supportEjerOvertag = onCall(options, (req) => ejerSkift(req, "overtag"));

export const supportEjerStatusOpdater = onCall(options, async (req) => {
  const ejer = ejerIdentitet(req); const d = req.data || {}; const db = getDatabase();
  const sag = await hentEjersag(db, d.sagId); kraevAnmodningId(d.anmodningId);
  const portalStatus = supportStatusFraEjer(d.status);
  if (!portalStatus) throw new HttpsError("invalid-argument", "Ejerstatus kan ikke anvendes på en portalsag.");
  if (sag.ansvarligUid !== ejer.uid) throw new HttpsError("permission-denied", "Overtag sagen før status ændres.");
  let konflikt = ""; const idemBruger = `ejer_${ejer.uid}`; const nu = Date.now();
  const supportRef = db.ref("support");
  const transaktionsstart = verificeretTransaktionsstart((await supportRef.once("value")).val() || {});
  const tx = await supportRef.transaction((rod) => {
    const aktuelRod = transaktionsstart(rod) || {}; const aktuel = aktuelRod.sager?.[sag.id];
    const tidligere = aktuelRod.idempotens?.[idemBruger]?.[d.anmodningId];
    if (tidligere) return tidligere.operation === "status" && tidligere.sagId === sag.id ? aktuelRod : undefined;
    if (!aktuel || Number(aktuel.revision) !== Number(d.forventetRevision) || aktuel.ansvarligUid !== ejer.uid) { konflikt = "Sagen er ændret. Hent den igen."; return; }
    aktuelRod.idempotens ||= {}; aktuelRod.idempotens[idemBruger] ||= {};
    aktuelRod.sager[sag.id] = { ...aktuel, status: portalStatus, ansvarstype: SUPPORT_ANSVAR.ejer, revision: Number(aktuel.revision) + 1, opdateretMs: nu, ...(portalStatus === "loest" ? { loestMs: nu } : {}) };
    aktuelRod.idempotens[idemBruger][d.anmodningId] = { operation: "status", sagId: sag.id, revision: Number(aktuel.revision) + 1, ms: nu };
    return aktuelRod;
  });
  if (!tx.committed || konflikt) throw new HttpsError("aborted", konflikt || "Status blev ikke ændret.");
  const gemt = tx.snapshot.val()?.sager?.[sag.id];
  await db.ref(`tenants/${gemt.tenantId}/supportsager/${gemt.id}`).set({ oprettetAfUid: gemt.oprettetAfUid, status: gemt.status, opdateretMs: gemt.opdateretMs });
  return { traad: await ejerTraad(db, gemt) };
});

/**
 * Kanonisk intern portal-AI. Genereringen er deterministisk og lokal; hverken
 * instruktion, analyse eller interne kilder kan nå kundens API-projektion.
 */
export const supportEjerAiForslagGem = onCall(options, async (req) => {
  const ejer = ejerIdentitet(req); const d = req.data || {}; const db = getDatabase();
  const sag = await hentEjersag(db, d.sagId); const anmodningId = kraevAnmodningId(d.anmodningId);
  const instruktion = renSupportTekst(d.instruktion, 4_000);
  const forventetSagRevision = kraevRevision(d.forventetSagRevision, "forventetSagRevision", { positiv: true });
  const forventetRevision = kraevRevision(d.forventetRevision, "forventetRevision");
  const basisAktivitetMs = kraevRevision(d.basisAktivitetMs, "basisAktivitetMs", { positiv: true });
  const basisKladdeRevision = kraevRevision(d.basisKladdeRevision, "basisKladdeRevision");
  const basisKladdeFingeraftryk = typeof d.basisKladdeFingeraftryk === "string"
    && /^[a-f0-9]{8}$/.test(d.basisKladdeFingeraftryk)
    ? d.basisKladdeFingeraftryk
    : null;
  if (!instruktion || !basisKladdeFingeraftryk) {
    throw new HttpsError("invalid-argument", "Support-AI kræver instruktion og et aktuelt sagsgrundlag.");
  }
  if (sag.ansvarstype !== SUPPORT_ANSVAR.ejer || sag.ansvarligUid !== ejer.uid) {
    throw new HttpsError("permission-denied", "Overtag sagen før intern Support-AI anvendes.");
  }
  const [beskederSnap, oplysningerSnap, videnSnap] = await Promise.all([
    db.ref(`support/beskeder/${sag.id}`).once("value"),
    db.ref(`support/sagsOplysninger/${sag.id}`).once("value"),
    db.ref("udbyder/vidensbase/poster").once("value"),
  ]);
  const forslag = lokaltEjerSupportAiForslag({
    sag,
    beskeder: beskederSnap.val() || {},
    sagsOplysninger: oplysningerSnap.val() || {},
    viden: Object.values(videnSnap.val() || {}),
    instruktion,
  });
  const idemBruger = `ejer_${ejer.uid}`; const nu = Date.now(); let konflikt = null; let gentaget = false;
  const supportRef = db.ref("support");
  const transaktionsstart = verificeretTransaktionsstart((await supportRef.once("value")).val() || {});
  const tx = await supportRef.transaction((rod) => {
    const aktuelRod = transaktionsstart(rod) || {}; const aktuelSag = aktuelRod.sager?.[sag.id];
    const tidligere = aktuelRod.idempotens?.[idemBruger]?.[anmodningId];
    if (tidligere) {
      if (tidligere.operation !== "ejerAiForslag" || tidligere.sagId !== sag.id) konflikt = { kode: "already-exists", besked: "anmodningId er brugt til en anden handling." };
      else gentaget = true;
      return konflikt ? undefined : aktuelRod;
    }
    if (!aktuelSag || aktuelSag.ansvarligUid !== ejer.uid) { konflikt = { kode: "permission-denied", besked: "Kun den ansvarlige ejer kan bruge intern Support-AI." }; return; }
    if (Number(aktuelSag.revision) !== forventetSagRevision || Number(aktuelSag.opdateretMs) !== basisAktivitetMs) { konflikt = { kode: "aborted", besked: "Sagen er ændret. Genindlæs uden at kassere usendt tekst." }; return; }
    const arbejdsrum = aktuelRod.internAi?.[sag.id] || {};
    if (Number(arbejdsrum.revision || 0) !== forventetRevision) { konflikt = { kode: "aborted", besked: "Det interne AI-arbejdsrum er ændret. Genindlæs sagen." }; return; }
    const kladde = senesteSupportKladde(aktuelRod.svarKladder?.[sag.id]);
    if (Number(kladde?.revision || 0) !== basisKladdeRevision
        || supportTekstfingeraftryk(kladde?.tekst || "") !== basisKladdeFingeraftryk) {
      konflikt = { kode: "failed-precondition", besked: "Svarudkastet er ændret. Gem eller genindlæs før ny fejlsøgning." }; return;
    }
    const ejerBeskedId = `e_${anmodningId}`; const aiBeskedId = `a_${anmodningId}`;
    aktuelRod.internAi ||= {};
    aktuelRod.internAi[sag.id] = {
      ...arbejdsrum,
      revision: forventetRevision + 1,
      chat: {
        ...(arbejdsrum.chat || {}),
        [ejerBeskedId]: { id: ejerBeskedId, udvekslingId: anmodningId, rolle: "ejer", tekst: instruktion, aktorUid: ejer.uid, aktorNavn: ejerNavn(req), oprettetMs: nu, intern: true },
        [aiBeskedId]: { id: aiBeskedId, udvekslingId: anmodningId, rolle: "ai", tekst: forslag.aiSvar, aktorUid: "lokal_support_adapter", aktorNavn: "Lokal Support-AI", oprettetMs: nu + 1, intern: true, kilder: forslag.kilder },
      },
      aktivtForslag: { tekst: forslag.kundesvar, basisAktivitetMs, basisSagRevision: forventetSagRevision, basisKladdeRevision, basisKladdeFingeraftryk, oprettetMs: nu + 1, oprettetAf: ejer.uid, provider: "lokal_support_testadapter", kilder: forslag.kilder, mangler: forslag.mangler, harKundegodkendtLoesning: forslag.harKundegodkendtLoesning },
      operationer: { ...(arbejdsrum.operationer || {}), [anmodningId]: { oprettetMs: nu, aktorUid: ejer.uid, art: "support_ai" } },
      opdateretMs: nu,
      opdateretAf: ejer.uid,
    };
    aktuelRod.idempotens ||= {}; aktuelRod.idempotens[idemBruger] ||= {};
    aktuelRod.idempotens[idemBruger][anmodningId] = { operation: "ejerAiForslag", sagId: sag.id, revision: forventetRevision + 1, ms: nu };
    return aktuelRod;
  });
  if (!tx.committed || konflikt) throw new HttpsError(konflikt?.kode || "aborted", konflikt?.besked || "Support-AI-forslaget blev ikke gemt.");
  return {
    traad: await ejerTraad(db, tx.snapshot.val()?.sager?.[sag.id]),
    revision: Number(tx.snapshot.val()?.internAi?.[sag.id]?.revision || forventetRevision + 1),
    gentaget,
    harKundegodkendtLoesning: forslag.harKundegodkendtLoesning,
    antalKilder: forslag.kilder.length,
  };
});

/** Intern sagsbaggrund. Ændringen øger sagens revision og forælder dermed
 * enhver tidligere godkendelse, men den returneres aldrig til kunden. */
export const supportEjerBaggrundGem = onCall(options, async (req) => {
  const ejer = ejerIdentitet(req); const d = req.data || {}; const db = getDatabase();
  const sag = await hentEjersag(db, d.sagId); const anmodningId = kraevAnmodningId(d.anmodningId);
  const forventetSagRevision = kraevRevision(d.forventetSagRevision, "forventetSagRevision", { positiv: true });
  const forventetRevision = kraevRevision(d.forventetRevision, "forventetRevision");
  if (typeof d.vaerdi !== "string" || d.vaerdi.trim().length > 4_000) {
    throw new HttpsError("invalid-argument", "Den interne baggrund er ugyldig eller for lang.");
  }
  const vaerdi = d.vaerdi.trim(); const idemBruger = `ejer_${ejer.uid}`; const nu = Date.now(); let konflikt = null; let gentaget = false;
  const supportRef = db.ref("support");
  const transaktionsstart = verificeretTransaktionsstart((await supportRef.once("value")).val() || {});
  const tx = await supportRef.transaction((rod) => {
    const aktuelRod = transaktionsstart(rod) || {}; const aktuelSag = aktuelRod.sager?.[sag.id];
    const tidligere = aktuelRod.idempotens?.[idemBruger]?.[anmodningId];
    if (tidligere) {
      if (tidligere.operation !== "ejerBaggrund" || tidligere.sagId !== sag.id) konflikt = { kode: "already-exists", besked: "anmodningId er brugt til en anden handling." };
      else gentaget = true;
      return konflikt ? undefined : aktuelRod;
    }
    if (!aktuelSag || aktuelSag.ansvarligUid !== ejer.uid) { konflikt = { kode: "permission-denied", besked: "Kun den ansvarlige ejer kan ændre intern sagsbaggrund." }; return; }
    if (Number(aktuelSag.revision) !== forventetSagRevision) { konflikt = { kode: "aborted", besked: "Sagen er ændret. Genindlæs uden at kassere usendt tekst." }; return; }
    const foer = aktuelRod.sagsOplysninger?.[sag.id]?.saelgerBaggrund;
    if (Number(foer?.revision || 0) !== forventetRevision) { konflikt = { kode: "aborted", besked: "Den interne baggrund er ændret samtidigt. Genindlæs sagen." }; return; }
    const nySagRevision = Number(aktuelSag.revision) + 1;
    aktuelRod.sagsOplysninger ||= {}; aktuelRod.sagsOplysninger[sag.id] ||= {};
    aktuelRod.sagsOplysninger[sag.id].saelgerBaggrund = { id: "saelgerBaggrund", label: "Intern supportbaggrund", vaerdi, tilstand: "tilfoejet_af_ejer", kilde: `${ejerNavn(req)} · intern tilføjelse`, revision: forventetRevision + 1, raekke: 80, oprettetMs: foer?.oprettetMs || nu, opdateretMs: nu, opdateretAf: ejer.uid, intern: true };
    aktuelRod.sager[sag.id] = { ...aktuelSag, revision: nySagRevision, opdateretMs: nu };
    aktuelRod.idempotens ||= {}; aktuelRod.idempotens[idemBruger] ||= {};
    aktuelRod.idempotens[idemBruger][anmodningId] = { operation: "ejerBaggrund", sagId: sag.id, revision: nySagRevision, oplysningsRevision: forventetRevision + 1, ms: nu };
    return aktuelRod;
  });
  if (!tx.committed || konflikt) throw new HttpsError(konflikt?.kode || "aborted", konflikt?.besked || "Den interne baggrund blev ikke gemt.");
  const gemt = tx.snapshot.val()?.sager?.[sag.id];
  await db.ref(`tenants/${gemt.tenantId}/supportsager/${gemt.id}`).set({ oprettetAfUid: gemt.oprettetAfUid, status: gemt.status, opdateretMs: gemt.opdateretMs });
  return { traad: await ejerTraad(db, gemt), revision: forventetRevision + 1, gentaget };
});

export const supportEjerSvarKladdeGem = onCall(options, async (req) => {
  const ejer = ejerIdentitet(req); const d = req.data || {}; const db = getDatabase();
  const sag = await hentEjersag(db, d.sagId); kraevAnmodningId(d.anmodningId);
  const id = kraevId(d.id || "portal", "kladdeId"); const tekst = renSupportTekst(d.tekst);
  const signatur = renSupportTekst(d.signatur || "", 4_000) || "";
  const vedhaeftninger = Array.isArray(d.vedhaeftninger) ? d.vedhaeftninger : [];
  if (!tekst) throw new HttpsError("invalid-argument", "Svaret er tomt eller for langt.");
  if (d.kanal !== SUPPORT_KANAL.portal || vedhaeftninger.length) throw new HttpsError("failed-precondition", "Kun portal uden vedhæftninger er aktiveret i denne samling.");
  if (sag.ansvarstype !== SUPPORT_ANSVAR.ejer || sag.ansvarligUid !== ejer.uid) throw new HttpsError("permission-denied", "Overtag sagen før du gemmer et svar.");
  let konflikt = ""; const idemBruger = `ejer_${ejer.uid}`; const nu = Date.now();
  const supportRef = db.ref("support");
  const transaktionsstart = verificeretTransaktionsstart((await supportRef.once("value")).val() || {});
  const tx = await supportRef.transaction((rod) => {
    const aktuelRod = transaktionsstart(rod) || {}; const aktuelSag = aktuelRod.sager?.[sag.id]; const foer = aktuelRod.svarKladder?.[sag.id]?.[id];
    const tidligere = aktuelRod.idempotens?.[idemBruger]?.[d.anmodningId];
    if (tidligere) return tidligere.operation === "kladdeGem" && tidligere.sagId === sag.id && tidligere.kladdeId === id ? aktuelRod : undefined;
    if (!aktuelSag || Number(aktuelSag.revision) !== Number(d.forventetSagRevision) || aktuelSag.ansvarligUid !== ejer.uid) { konflikt = "Sagen er ændret. Hent den igen."; return; }
    if (Number(foer?.revision || 0) !== Number(d.forventetRevision || 0)) { konflikt = "Svarudkastet blev ændret samtidigt."; return; }
    const post = { id, kanal: SUPPORT_KANAL.portal, tilUid: aktuelSag.oprettetAfUid, tekst, signatur, vedhaeftninger: [], basisSagRevision: Number(aktuelSag.revision), status: "kladde", revision: Number(foer?.revision || 0) + 1, oprettetMs: foer?.oprettetMs || nu, oprettetAf: foer?.oprettetAf || ejer.uid, opdateretMs: nu, opdateretAf: ejer.uid };
    post.indholdHash = svarIndholdHash(post);
    aktuelRod.svarKladder ||= {}; aktuelRod.svarKladder[sag.id] ||= {}; aktuelRod.svarKladder[sag.id][id] = post;
    aktuelRod.idempotens ||= {}; aktuelRod.idempotens[idemBruger] ||= {}; aktuelRod.idempotens[idemBruger][d.anmodningId] = { operation: "kladdeGem", sagId: sag.id, kladdeId: id, revision: post.revision, ms: nu };
    return aktuelRod;
  });
  if (!tx.committed || konflikt) throw new HttpsError("aborted", konflikt || "Svarudkastet blev ikke gemt.");
  return { traad: await ejerTraad(db, tx.snapshot.val()?.sager?.[sag.id]) };
});

export const supportEjerSvarGodkend = onCall(options, async (req) => {
  const ejer = ejerIdentitet(req); const d = req.data || {}; const db = getDatabase();
  const sag = await hentEjersag(db, d.sagId); kraevAnmodningId(d.anmodningId); const id = kraevId(d.id, "kladdeId");
  let konflikt = ""; const idemBruger = `ejer_${ejer.uid}`; const nu = Date.now();
  const supportRef = db.ref("support");
  const transaktionsstart = verificeretTransaktionsstart((await supportRef.once("value")).val() || {});
  const tx = await supportRef.transaction((rod) => {
    const aktuelRod = transaktionsstart(rod) || {}; const aktuelSag = aktuelRod.sager?.[sag.id]; const kladde = aktuelRod.svarKladder?.[sag.id]?.[id];
    const tidligere = aktuelRod.idempotens?.[idemBruger]?.[d.anmodningId];
    if (tidligere) return tidligere.operation === "svarGodkend" && tidligere.sagId === sag.id && tidligere.kladdeId === id ? aktuelRod : undefined;
    if (!aktuelSag || aktuelSag.ansvarligUid !== ejer.uid) { konflikt = "Kun den ansvarlige ejer kan godkende svaret."; return; }
    if (!kladde || kladde.status !== "kladde" || Number(kladde.revision) !== Number(d.forventetRevision) || Number(kladde.basisSagRevision) !== Number(aktuelSag.revision) || kladde.indholdHash !== svarIndholdHash(kladde)) { konflikt = "Svarudkastet eller sagen er ændret siden gennemgangen."; return; }
    aktuelRod.svarKladder[sag.id][id] = { ...kladde, status: "godkendt", godkendtIndholdHash: kladde.indholdHash, godkendtAf: ejer.uid, godkendtMs: nu, revision: Number(kladde.revision) + 1 };
    aktuelRod.idempotens ||= {}; aktuelRod.idempotens[idemBruger] ||= {}; aktuelRod.idempotens[idemBruger][d.anmodningId] = { operation: "svarGodkend", sagId: sag.id, kladdeId: id, revision: Number(kladde.revision) + 1, ms: nu };
    return aktuelRod;
  });
  if (!tx.committed || konflikt) throw new HttpsError(conflictCode(konflikt), konflikt || "Svaret blev ikke godkendt.");
  return { traad: await ejerTraad(db, tx.snapshot.val()?.sager?.[sag.id]) };
});

export const supportEjerSvarTransporter = onCall(options, async (req) => {
  const ejer = ejerIdentitet(req); const d = req.data || {}; const db = getDatabase();
  const sag = await hentEjersag(db, d.sagId); kraevAnmodningId(d.anmodningId); const id = kraevId(d.id, "kladdeId");
  let konflikt = ""; const idemBruger = `ejer_${ejer.uid}`; const nu = Date.now(); const beskedId = `m_${d.anmodningId}`;
  const supportRef = db.ref("support");
  const transaktionsstart = verificeretTransaktionsstart((await supportRef.once("value")).val() || {});
  const tx = await supportRef.transaction((rod) => {
    const aktuelRod = transaktionsstart(rod) || {}; const aktuelSag = aktuelRod.sager?.[sag.id]; const kladde = aktuelRod.svarKladder?.[sag.id]?.[id];
    const tidligere = aktuelRod.idempotens?.[idemBruger]?.[d.anmodningId];
    if (tidligere) return tidligere.operation === "svarTransporter" && tidligere.sagId === sag.id && tidligere.kladdeId === id ? aktuelRod : undefined;
    if (!aktuelSag || aktuelSag.ansvarligUid !== ejer.uid) { konflikt = "Kun den ansvarlige ejer kan transportere svaret."; return; }
    if (!kladde || kladde.kanal !== SUPPORT_KANAL.portal || kladde.status !== "godkendt" || Number(kladde.revision) !== Number(d.forventetRevision) || Number(kladde.basisSagRevision) !== Number(aktuelSag.revision) || kladde.godkendtIndholdHash !== svarIndholdHash(kladde)) { konflikt = "Svaret er ikke en aktuel, konkret godkendt portalkladde."; return; }
    aktuelRod.beskeder ||= {}; aktuelRod.beskeder[sag.id] ||= {};
    aktuelRod.beskeder[sag.id][beskedId] = besked({ id: beskedId, anmodningId: d.anmodningId, afsenderType: SUPPORT_AFSENDER.ejer, afsenderUid: ejer.uid, tekst: [kladde.tekst, kladde.signatur].filter(Boolean).join("\n\n"), nu });
    aktuelRod.svarKladder[sag.id][id] = { ...kladde, status: "transporteret", transporteretAf: ejer.uid, transporteretMs: nu, transportAnmodningId: d.anmodningId, revision: Number(kladde.revision) + 1 };
    aktuelRod.sager[sag.id] = { ...aktuelSag, status: "afventerKunde", ansvarstype: SUPPORT_ANSVAR.ejer, revision: Number(aktuelSag.revision) + 1, opdateretMs: nu };
    aktuelRod.idempotens ||= {}; aktuelRod.idempotens[idemBruger] ||= {}; aktuelRod.idempotens[idemBruger][d.anmodningId] = { operation: "svarTransporter", sagId: sag.id, kladdeId: id, beskedId, revision: Number(aktuelSag.revision) + 1, ms: nu };
    return aktuelRod;
  });
  if (!tx.committed || konflikt) throw new HttpsError(conflictCode(konflikt), konflikt || "Svaret blev ikke transporteret.");
  const gemt = tx.snapshot.val()?.sager?.[sag.id];
  await db.ref(`tenants/${gemt.tenantId}/supportsager/${gemt.id}`).set({ oprettetAfUid: gemt.oprettetAfUid, status: gemt.status, opdateretMs: gemt.opdateretMs });
  return { traad: await ejerTraad(db, gemt), beskedId };
});

function conflictCode(besked) {
  return /ansvarlige ejer/i.test(besked) ? "permission-denied" : "failed-precondition";
}

/* Bevares kun som en eksplicit fail-closed overgang for ældre adaptere. */
export const supportEjerSvarSend = onCall(options, async (req) => {
  ejerIdentitet(req);
  throw new HttpsError("failed-precondition", "Direkte ejersvar er lukket. Gem, godkend og transportér den konkrete portalkladde.");
});

export const supportEjerNoteSkriv = onCall(options, async (req) => {
  const ejer = ejerIdentitet(req); const d = req.data || {}; const db = getDatabase(); const sag = await hentEjersag(db, d.sagId);
  kraevAnmodningId(d.anmodningId); const tekst = renSupportTekst(d.tekst);
  if (!tekst) throw new HttpsError("invalid-argument", "Noten er tom eller for lang.");
  await reservérIdempotens(db, `ejer_${ejer.uid}`, d.anmodningId, "ejerNote", sag.id);
  const id = `n_${d.anmodningId}`;
  await db.ref(`support/interneNoter/${sag.id}/${id}`).set({ id, tekst, oprettetAfUid: ejer.uid, oprettetMs: Date.now() });
  return { ok: true, id };
});
