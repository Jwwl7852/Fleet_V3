/*
 * Fælles support-endpoints. Én servervej for kunde og ejer; ingen klient
 * skriver direkte i support/. Ingen ekstern AI eller mailtransport her.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
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
  supportStatusskift,
} from "./delt/support.js";
import { lokaltSupportAiSvar } from "./delt/support-ai.js";
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

async function publicerLokalAi(db, sagId, tekst, startRevision) {
  const viden = Object.values((await db.ref("udbyder/vidensbase/poster").once("value")).val() || {});
  const sagFoer = (await db.ref(`support/sager/${sagId}`).once("value")).val();
  const ai = lokaltSupportAiSvar({ tekst, viden, kontekst: sagFoer });
  const nu = Date.now();
  const ref = db.ref(`support/sager/${sagId}`);
  const transaktion = await ref.transaction((sag) => {
    if (!maaPublicereSupportAi(sag, startRevision)) return;
    const naeste = { ...sag, revision: sag.revision + 1, opdateretMs: nu };
    if (ai.kilde) naeste.anvendteKilder = [ai.kilde];
    if (ai.eskaler) Object.assign(naeste, supportStatusskift(sag, "eskaler"), {
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
    const nummer = await naesteNummer(db, () => "", SUPPORT_SERIE);
    sag = {
      kontraktVersion: SUPPORT_KONTRAKT_VERSION, id: sagId, nummer,
      tenantId: bruger.tenant, oprettetAfUid: bruger.uid,
      status: "aiDialog", ansvarstype: SUPPORT_ANSVAR.ai, ansvarligUid: null,
      emne, problemResume: tekst, modul: kontekst.modul || null,
      programversion: kontekst.version || null, side: kontekst.side || null,
      kontekst, afproevedeTrin: [], anvendteKilder: [], eskaleringsaarsag: null,
      mailTraadId: null, revision: 1, oprettetMs: nu, opdateretMs: nu,
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
    const tx = await db.ref(`support/sager/${sag.id}`).transaction((aktuel) => {
      if (!aktuel || aktuel.tenantId !== bruger.tenant || aktuel.oprettetAfUid !== bruger.uid) return;
      if (aktuel.operationer?.[d.anmodningId]) return;
      return {
        ...aktuel, revision: aktuel.revision + 1, opdateretMs: nu,
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
  const tx = await db.ref(`support/sager/${sag.id}`).transaction((aktuel) => {
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
  ejerIdentitet(req); const sager = Object.values((await getDatabase().ref("support/sager").once("value")).val() || {});
  return sager.sort((a, b) => Number(b.opdateretMs) - Number(a.opdateretMs));
});

export const supportEjerSagHent = onCall(options, async (req) => {
  ejerIdentitet(req); const db = getDatabase(); const sag = await hentEjersag(db, req.data?.sagId);
  const [beskeder, interneNoter, internAi] = await Promise.all([
    db.ref(`support/beskeder/${sag.id}`).once("value"), db.ref(`support/interneNoter/${sag.id}`).once("value"), db.ref(`support/internAi/${sag.id}`).once("value"),
  ]);
  return { sag, beskeder: beskeder.val() || {}, interneNoter: interneNoter.val() || {}, internAi: internAi.val() || {} };
});

async function ejerSkift(req, handling) {
  const ejer = ejerIdentitet(req); const d = req.data || {}; const db = getDatabase();
  const sag = await hentEjersag(db, d.sagId); kraevAnmodningId(d.anmodningId);
  await reservérIdempotens(db, `ejer_${ejer.uid}`, d.anmodningId, handling, sag.id);
  const tx = await db.ref(`support/sager/${sag.id}`).transaction((aktuel) => {
    if (!aktuel || aktuel.revision !== d.forventetRevision) return;
    if (aktuel.operationer?.[d.anmodningId]) return;
    const skift = supportStatusskift(aktuel, handling); if (!skift) return;
    const nu = Date.now();
    return {
      ...aktuel, ...skift, ansvarligUid: ejer.uid, revision: aktuel.revision + 1,
      opdateretMs: nu, overtagetMs: nu,
      operationer: { ...(aktuel.operationer || {}), [d.anmodningId]: { art: handling, ms: nu } },
    };
  });
  if (!tx.committed && !tx.snapshot.val()?.operationer?.[d.anmodningId]) {
    throw new HttpsError("aborted", "Sagen er ændret eller kan ikke overtages. Hent den igen.");
  }
  return tx.snapshot.val();
}

export const supportEjerOvertag = onCall(options, (req) => ejerSkift(req, "overtag"));

export const supportEjerSvarSend = onCall(options, async (req) => {
  const ejer = ejerIdentitet(req); const d = req.data || {}; const db = getDatabase();
  const sag = await hentEjersag(db, d.sagId); kraevAnmodningId(d.anmodningId);
  await reservérIdempotens(db, `ejer_${ejer.uid}`, d.anmodningId, "ejerSvar", sag.id);
  const tekst = renSupportTekst(d.tekst); if (!tekst) throw new HttpsError("invalid-argument", "Svaret er tomt eller for langt.");
  if (sag.revision !== d.forventetRevision || sag.ansvarligUid !== ejer.uid || sag.ansvarstype !== SUPPORT_ANSVAR.ejer) throw new HttpsError("aborted", "Overtag og genhent sagen før svar.");
  const nu = Date.now(); const beskedId = `m_${d.anmodningId}`;
  const tx = await db.ref(`support/sager/${sag.id}`).transaction((aktuel) => {
    if (!aktuel || aktuel.revision !== d.forventetRevision || aktuel.ansvarligUid !== ejer.uid) return;
    if (aktuel.operationer?.[d.anmodningId]) return;
    return {
      ...aktuel, status: "afventerKunde", revision: aktuel.revision + 1, opdateretMs: nu,
      operationer: { ...(aktuel.operationer || {}), [d.anmodningId]: { art: "ejerSvar", ms: nu } },
    };
  });
  if (!tx.committed && !tx.snapshot.val()?.operationer?.[d.anmodningId]) {
    throw new HttpsError("aborted", "Sagen er ændret. Hent den igen.");
  }
  await db.ref().update({
    [`support/beskeder/${sag.id}/${beskedId}`]: besked({ id: beskedId, anmodningId: d.anmodningId, afsenderType: SUPPORT_AFSENDER.ejer, afsenderUid: ejer.uid, tekst, nu }),
    [`tenants/${sag.tenantId}/supportsager/${sag.id}`]: { oprettetAfUid: sag.oprettetAfUid, status: "afventerKunde", opdateretMs: nu },
  });
  return tx.snapshot.val();
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
