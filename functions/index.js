/* functions/index.js
 * Cloud Functions: auditloggen og brugeradministrationen.
 *
 * De findes her af SAMME grund, og den er værd at have i hovedet: begge gør
 * noget en klient ikke KAN gøre. audit/ er .write: false for alle, og
 * Firebase Auth har ingen createUser på klientsiden. Det er ikke bekvemmelighed
 * — det er Admin SDK eller ingenting.
 *
 * ---------------------------------------------------------------------------
 * HVORFOR DEN SKAL VÆRE EN FUNKTION OG IKKE EN SKRIVNING FRA KLIENTEN
 *
 * `audit/` er `.write: false` for alle — også admin. Der findes derfor ingen
 * `audit.skriv`-permission, og det er ikke en forglemmelse: en log som den
 * loggede kan skrive i, er ikke en log. Kun Admin SDK kommer uden om reglerne,
 * og Admin SDK kan kun køre server-side.
 *
 * ---------------------------------------------------------------------------
 * ⚠ TENANT OG UID KOMMER FRA TOKENET, ALDRIG FRA NYTTELASTEN
 *
 * Det er hele pointen. En klient der selv må oplyse hvem den er, kan skrive en
 * post om en anden bruger i en anden tenant — og så er loggen værre end ingen,
 * fordi den ser troværdig ud. `context.auth.token` er signeret af Firebase og
 * kan ikke forfalskes fra browseren.
 *
 * ⚠ FELTFILTRERINGEN SKER IGEN HER. Klienten filtrerer også, men serveren må
 * ikke stole på det: en ændret klient kunne sende `beskrivelse` eller `emne`
 * med, og så står der fritekst fra internettet i auditloggen. Allowlisten er
 * hele grunden til at loggen kan opbevares.
 *
 * ---------------------------------------------------------------------------
 * POLITIKKEN DELES MED KLIENTEN. `delt/audit-regler.js` er en KOPI af
 * `src/fleet/audit-regler.js` — Cloud Functions deployer kun sin egen mappe,
 * så filen kan ikke importeres op gennem træet. Kopien lægges af
 * `scripts/kopier-delt.mjs`, og `test/functions-delt.test.mjs` fejler hvis de
 * to ikke er byte-identiske. To kopier der driver fra hinanden er præcis den
 * fejl hele dette repo bliver ved med at betale for.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getDatabase, ServerValue } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";

import { AUDIT, LOGBARE_FELTER, KLASSER, klasseFor, diff } from "./delt/audit-regler.js";
import {
  valideUdlaan, kanSkifteUdlaan, virkningPaaKasse, konflikter,
} from "./delt/turtlebooking.js";
import {
  valideBevaegelse, virkningPaaBeholdning, kanPlukkesFra, PLADS_STATUS,
  talFraMaengde, kanSkifteOrdre, beholdningsNoegle, UDEN_BATCH,
  valideOptaelling,
} from "./delt/warehouse.js";
import { ROLLE_PERMS, permStrengFraRolle, PERM } from "./delt/permissions.js";
import { modulsaet, ukendteModuler, ALLE_MODULER } from "./delt/moduler.js";
import { ALLE_ABONNEMENTSTATUS, ALLE_AARSAGER } from "./delt/abonnement.js";
import { totalerAfLinjer } from "./delt/beloeb.js";
import {
  taelBrugere, taelKoeretoejer, maalingsdato, validerPrisliste, sammenfatMaalinger,
  maalingerIPeriode, periodeGraenser, MOMSSATS, gaeldendePrisliste, linjerForPeriode,
} from "./delt/priser.js";

initializeApp();

const REGION = "europe-west1";

const GYLDIGE_HANDLINGER = new Set(Object.values(AUDIT));

/** Kun felter på allowlisten, og kun hvis værdien er primitiv. */
function rens(objekt) {
  if (!objekt || typeof objekt !== "object") return null;
  const ud = {};
  for (const [k, v] of Object.entries(objekt)) {
    if (!LOGBARE_FELTER.has(k)) continue;
    /* ⚠ KUN PRIMITIVE VÆRDIER. Et objekt på et allowlistet felt kunne bære
       hvad som helst med sig — `status: { note: "…" }` ville slippe fritekst
       igennem på et felt der er godkendt til en streng. */
    const t = typeof v;
    if (v === null || t === "string" || t === "number" || t === "boolean") ud[k] = v;
  }
  return Object.keys(ud).length ? ud : null;
}

const kortStreng = (s, maks) =>
  typeof s === "string" && s.trim() ? s.trim().slice(0, maks) : null;

export const audit = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  /* ⚠ FRA TOKENET. Står de i nyttelasten, ignoreres de. */
  const tenantId = auth.token?.tenant;
  const uid = auth.uid;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const d = req.data || {};

  if (!GYLDIGE_HANDLINGER.has(d.handling)) {
    /* Fejler LUKKET. En ukendt handling får ikke en standardklasse — så ville
       en tastefejl havne i `drift` og få den korteste retention. */
    throw new HttpsError("invalid-argument", `Ukendt handling: ${d.handling}`);
  }
  const objekt = kortStreng(d.objekt, 40);
  if (!objekt) throw new HttpsError("invalid-argument", "objekt mangler.");

  const klasse = klasseFor(d.handling, objekt);
  if (!KLASSER.includes(klasse)) {
    throw new HttpsError("internal", `klasseFor gav en ukendt klasse: ${klasse}`);
  }

  /* Tidsstemplet sættes HER. Klientens ur kan gå forkert, og en log hvor
     rækkefølgen kan forhandles er ikke en log. */
  const ms = Date.now();
  const nu = new Date(ms);
  const aar = String(nu.getUTCFullYear());
  const maaned = String(nu.getUTCMonth() + 1).padStart(2, "0");

  const post = {
    ms,
    uid,
    handling: d.handling,
    objekt,
    objektId: kortStreng(d.objektId, 120),
    klasse,
    /* `aendrede` er feltNAVNE — de filtreres mod samme allowliste som
       værdierne, ellers kunne et feltnavn i sig selv røbe noget. */
    aendrede: Array.isArray(d.aendrede)
      ? d.aendrede.filter((f) => LOGBARE_FELTER.has(f)).slice(0, 40)
      : null,
    foer: rens(d.foer),
    efter: rens(d.efter),
    antal: Number.isInteger(d.antal) ? d.antal : null,
    korrelationsId: kortStreng(d.korrelationsId, 60),
    /* ⚠ note er IKKE fritekst fra en formular. Den er en kort, teknisk
       forklaring skrevet af koden, og den afkortes hårdt. Skriv aldrig
       brugerinput her — se allowlisten. */
    note: kortStreng(d.note, 120),
  };

  const ref = getDatabase().ref(`audit/${tenantId}/${klasse}/${aar}/${maaned}`).push();
  await ref.set(post);

  /* ⚠ APPEND-ONLY, OGSÅ HERFRA. Funktionen har ingen sti der opdaterer eller
     sletter en post. Retention håndteres af en separat, planlagt funktion der
     sletter en HEL partition — se retentionFor() og noten i audit-regler.js. */
  return { ok: true, id: ref.key, klasse };
});

/* ══════════════════════════════════════════════════════════════════════
   BRUGERADMINISTRATION
   ══════════════════════════════════════════════════════════════════════

   ⚠ HVORFOR DET SKAL VÆRE FUNKTIONER. Firebase Auth har ingen createUser,
   updateUser eller setCustomUserClaims på klientsiden. Det er ikke en mangel
   der kan omgås — det er Admin SDK eller ingenting.

   ⚠ TENANTEN KOMMER FRA KALDERENS TOKEN, ALDRIG FRA NYTTELASTEN.
   Præcis samme regel som auditfunktionen, og af en endnu hårdere grund: en
   admin hos kunde A der selv måtte oplyse tenanten, kunne oprette en
   administrator hos kunde B. Det ville være det stik modsatte af hele
   isolationen, og det ville ske gennem en funktion vi selv har skrevet.

   Navnene er med små bogstaver, så de matcher Cloud Run-tjenesten præcis.
   Det gør ét spor lettere at følge, men det var IKKE årsagen til 403'eren:
   jeg troede det, døbte dem om, og fejlen blev til en 401 med
   `error="invalid_token"` — Google forsøgte stadig at verificere Firebase-
   tokenet som sit eget. Årsagen var og er invoker-bindingen, se noten om
   funktioner-aabn.mjs nedenfor.

   ⚠ ROLLEN AFGØR PERMS — DE SENDES IKKE MED. Kalderen vælger en rolle fra
   presettet; permissionerne udledes af ROLLE_PERMS. Kunne klienten sende en
   perms-liste, kunne en admin give sig selv noget der ikke findes i noget
   preset, og rollegennemgangen ville ikke længere beskrive virkeligheden.
   ══════════════════════════════════════════════════════════════════════ */
/**
 * Fælles indgangstjek. Returnerer { uid, tenantId } eller kaster.
 *
 * ⚠ PERMISSIONEN LÆSES AF TOKENET, ikke af en node. Claim'et er
 * håndhævelsespunktet — slog vi op i roller/, ville en rolleændring virke
 * før tokenet blev fornyet, og så ville to veje give hvert sit svar.
 */
function kraevBrugeradmin(req) {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const perms = auth.token?.perms;
  if (typeof perms !== "string" || !perms.includes(`|${PERM.brugereSkriv}|`)) {
    throw new HttpsError("permission-denied", `Kræver ${PERM.brugereSkriv}.`);
  }
  return { uid: auth.uid, tenantId };
}

const MAIL_MOENSTER = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Indekset klienten kan læse. ⚠ INGEN CLAIMS OG INGEN LØSEN. */
const indeksPost = (b, rolle, spaerret = false) => ({
  email: b.email,
  navn: b.displayName || b.email,
  rolle,
  spaerret,
  opdateretMs: Date.now(),
});

async function skrivIndeks(tenantId, bruger, rolle, spaerret) {
  await getDatabase()
    .ref(`tenants/${tenantId}/brugere/${bruger.uid}`)
    .set(indeksPost(bruger, rolle, spaerret));
}

/**
 * Hent en konto — og sig det ordentligt, hvis den ikke findes længere.
 *
 * ⚠ INDEKSET KAN OVERLEVE SIN KONTO. Slettes en bruger i Firebase-konsollen,
 * bliver rækken under tenants/<t>/brugere stående: konsollen ved intet om
 * den. Klikker nogen så på rollen, kastede auth.getUser() en fejl der ikke
 * var en HttpsError, og den blev til `internal` — som klienten oversætter til
 * "prøv igen". Det er præcis den fejltilstand hele filen er skrevet imod: en
 * kontrol der virker, meldt som et netværksproblem. Brugeren prøver igen, og
 * igen, og kontoen kommer aldrig tilbage.
 *
 * Rækken ryddes med det samme. Et indeks der peger på ingenting, er ikke en
 * oplysning — det er en fælde, og den bliver ikke bedre af at stå længere.
 */
async function hentIEgenTenant(auth, maalUid, tenantId) {
  let bruger;
  try {
    bruger = await auth.getUser(maalUid);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    await getDatabase().ref(`tenants/${tenantId}/brugere/${maalUid}`).remove();
    throw new HttpsError(
      "not-found",
      "Kontoen findes ikke længere — den er slettet uden om systemet. " +
      "Rækken er nu fjernet fra listen."
    );
  }
  /* ⚠ KUN BRUGERE I EGEN TENANT. Uden det kunne en admin ændre en bruger hos
     en anden kunde — uid er ikke hemmeligt. */
  if (bruger.customClaims?.tenant !== tenantId) {
    throw new HttpsError("permission-denied", "Brugeren hører ikke til din virksomhed.");
  }
  return bruger;
}

async function log(tenantId, uid, handling, objektId, note) {
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${tenantId}/sikkerhed/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt: "brugere", objektId,
      klasse: "sikkerhed", note: note ?? null,
    });
}

/**
 * Opret en konto i EN BESTEMT tenant.
 *
 * ⚠ DEN DELES AF opretbruger OG kundeadmin, og det er hele pointen. De to
 * har forskellig ADGANGSKONTROL — kundens admin må kun sin egen tenant, mens
 * ejeren må hvilken som helst — men de skal oprette kontoen på nøjagtig
 * samme måde. To kopier ville drive, og den ene ville glemme at skrive
 * indekset eller at sætte claims. Se functions-delt.test.mjs.
 */
async function opretKonto({ tenantId, kalderUid, d }) {
  const email = kortStreng(d.email, 120);
  if (!email || !MAIL_MOENSTER.test(email)) {
    throw new HttpsError("invalid-argument", "Ugyldig mailadresse.");
  }
  const rolle = kortStreng(d.rolle, 30);
  if (!ROLLE_PERMS[rolle]) {
    throw new HttpsError("invalid-argument", `Ukendt rolle: ${d.rolle}`);
  }
  /* Løsenet sættes af den der opretter. Det sendes ikke retur og logges
     ikke — hverken her eller i auditposten. */
  const kode = typeof d.kode === "string" ? d.kode : "";
  if (kode.length < 12) {
    throw new HttpsError("invalid-argument", "Adgangskoden skal være mindst 12 tegn.");
  }
  const navn = kortStreng(d.navn, 80) || email;

  const auth = getAuth();
  let bruger;
  try {
    bruger = await auth.createUser({ email, password: kode, displayName: navn });
  } catch (e) {
    if (e.code === "auth/email-already-exists") {
      /* ⚠ VI OVERTAGER IKKE EN EKSISTERENDE KONTO. Mailen kan høre til en
         anden kunde, og at sætte vores tenant på den ville flytte en bruger
         mellem to virksomheder med ét klik. */
      throw new HttpsError("already-exists", "Adressen er allerede i brug.");
    }
    throw e;
  }

  await auth.setCustomUserClaims(bruger.uid, {
    tenant: tenantId,
    rolle,
    perms: permStrengFraRolle(rolle),
  });

  await skrivIndeks(tenantId, bruger, rolle, false);
  await log(tenantId, kalderUid, "opret", bruger.uid, `rolle ${rolle}`);

  return { ok: true, uid: bruger.uid };
}

export const opretbruger = onCall({ region: REGION }, async (req) => {
  /* ⚠ tenantId FRA TOKENET, aldrig fra nyttelasten. Se noten øverst. */
  const { uid, tenantId } = kraevBrugeradmin(req);
  return opretKonto({ tenantId, kalderUid: uid, d: req.data || {} });
});

export const skiftrolle = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId } = kraevBrugeradmin(req);
  const d = req.data || {};

  const maalUid = kortStreng(d.uid, 128);
  const rolle = kortStreng(d.rolle, 30);
  if (!maalUid) throw new HttpsError("invalid-argument", "uid mangler.");
  if (!ROLLE_PERMS[rolle]) throw new HttpsError("invalid-argument", `Ukendt rolle: ${d.rolle}`);

  const auth = getAuth();
  const bruger = await hentIEgenTenant(auth, maalUid, tenantId);

  await auth.setCustomUserClaims(maalUid, {
    ...bruger.customClaims,
    rolle,
    perms: permStrengFraRolle(rolle),
  });
  /* ⚠ UDEN DEN HER ER NEDGRADERINGEN EN PÆN KNAP. Brugeren beholder sine
     gamle claims indtil tokenet udløber af sig selv — man ville tro man
     havde fjernet en adgang, som stadig virkede. Det er den værste
     fejltilstand, fordi den ser ud som om den lykkedes. */
  await auth.revokeRefreshTokens(maalUid);

  await skrivIndeks(tenantId, bruger, rolle, Boolean(bruger.disabled));
  await log(tenantId, uid, "tilstandsskift", maalUid, `rolle ${rolle}`);

  return { ok: true };
});

export const spaerlogin = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId } = kraevBrugeradmin(req);
  const d = req.data || {};

  const maalUid = kortStreng(d.uid, 128);
  if (!maalUid) throw new HttpsError("invalid-argument", "uid mangler.");
  const spaerret = d.spaerret !== false;

  const auth = getAuth();
  const bruger = await hentIEgenTenant(auth, maalUid, tenantId);
  /* ⚠ MAN KAN IKKE SPÆRRE SIG SELV UDE. Den sidste administrator der gjorde
     det, ville have låst hele virksomheden ude af sin egen brugeradministration
     — og der er ingen vej tilbage fra klienten. */
  if (maalUid === uid && spaerret) {
    throw new HttpsError("failed-precondition", "Du kan ikke spærre dit eget login.");
  }

  await auth.updateUser(maalUid, { disabled: spaerret });
  if (spaerret) await auth.revokeRefreshTokens(maalUid);

  /* ⚠ KONTOEN SLETTES IKKE. Personen bliver stående i personale/ — der
     hænger indberetninger på uid'et — og kontoen skal kunne genåbnes. Kun
     loginnet spærres. */
  await skrivIndeks(tenantId, bruger, bruger.customClaims?.rolle || "chauffoer", spaerret);
  await log(tenantId, uid, "tilstandsskift", maalUid, spaerret ? "spaerret" : "genaabnet");

  return { ok: true, spaerret };
});

/* ══════════════════════════════════════════════════════════════════════
   EJERKONSOLLEN — den ANDEN krydsning af tenant-grænsen
   ══════════════════════════════════════════════════════════════════════

   ⚠ HER TAGES TENANTEN FRA NYTTELASTEN, OG DET ER MED VILJE.

   Overalt ellers i filen står der at tenanten kommer fra tokenet, aldrig fra
   nyttelasten. Det gælder stadig for kundens egne funktioner. Ejeren er den
   ene undtagelse, og den er ikke en opblødning: en ejerkonto har SLET INGEN
   tenant i sit token (beslutning 35). Der er ikke noget at tage.

   Derfor er det `udbyder === true` der bærer hele adgangen her — ét claim,
   ét sted, sat af provisioneren med servicekontonøglen og ikke af nogen
   funktion. Konsollen kan ikke give sig selv ejerskab.

   ⚠ INGEN AF DE FIRE LÆSER KUNDEDATA. De skriver kundeposten — navn, CVR,
   moduler, abonnement — og opretter den første administrator. Præcis som
   udbyder-claim'et i reglerne kun rækker til tre noder.

   ⚠ HVER HANDLING LOGGES HOS KUNDEN, ikke i en separat ejerlog. Kunden skal
   kunne se at hans abonnement blev ændret; det er hans abonnement. Og én
   auditmekanisme frem for to.
   ══════════════════════════════════════════════════════════════════════ */

/** Kun små bogstaver, tal og bindestreg. RTDB-nøgler må ikke bære . $ # [ ] / */
const TENANT_MOENSTER = /^[a-z0-9][a-z0-9-]{1,39}$/;

/**
 * Ejertjekket. Returnerer ejerens uid eller kaster.
 *
 * ⚠ DET ER ET CLAIM, IKKE EN NODE. Slog vi op i en ejerliste i basen, ville
 * en skrivning til den liste være en vej til at give sig selv adgang — og så
 * skulle DEN skrivning beskyttes af noget, og så er vi i ring.
 */
function kraevUdbyder(req) {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  if (auth.token?.udbyder !== true) {
    throw new HttpsError("permission-denied", "Kræver udbyderadgang.");
  }
  return auth.uid;
}

/** Kunde-id'et fra nyttelasten — se noten ovenfor om hvorfor det er lovligt her. */
function kraevKundeId(d) {
  const id = kortStreng(d.id, 40);
  if (!id || !TENANT_MOENSTER.test(id)) {
    throw new HttpsError("invalid-argument",
      "Kunde-id må kun være små bogstaver, tal og bindestreg.");
  }
  return id;
}

const kundeFindes = async (id) =>
  (await getDatabase().ref(`tenants/${id}/_findes`).once("value")).exists();

export const kundeopret = onCall({ region: REGION }, async (req) => {
  const ejerUid = kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevKundeId(d);

  const navn = kortStreng(d.navn, 120);
  if (!navn) throw new HttpsError("invalid-argument", "Virksomhedsnavn mangler.");
  const cvr = kortStreng(d.cvr, 20);

  const valgte = Array.isArray(d.moduler) ? d.moduler : [];
  const ukendte = ukendteModuler(valgte);
  if (ukendte.length) {
    throw new HttpsError("invalid-argument", `Ukendte moduler: ${ukendte.join(", ")}`);
  }

  /* ⚠ OVERSKRIVER IKKE. En eksisterende tenant har data og brugere, og et
     "opret" der stille nulstillede virksomhedsnavnet ville være en meget dyr
     tastefejl — samme spærring som scripts/opret-kunde.mjs har. */
  if (await kundeFindes(id)) {
    throw new HttpsError("already-exists", `Kunden "${id}" findes allerede.`);
  }

  const moduler = modulsaet(valgte);
  const db = getDatabase();
  const nu = Date.now();

  /* Markøren FØRST. Uden den afviser hver eneste regel alt. */
  await db.ref(`tenants/${id}/_findes`).set(true);
  await db.ref(`tenants/${id}/virksomhed`).set(
    cvr ? { navn, cvr, oprettetMs: nu } : { navn, oprettetMs: nu });
  await db.ref(`tenants/${id}/moduler`).set(moduler);
  await db.ref(`tenants/${id}/abonnement`).set({
    status: "aktiv", aendretMs: nu, aendretAf: ejerUid,
  });
  /* ⚠ INDEKSET BÆRER INTET NAVN. Det står i tenants/<id>/virksomhed — ét
     sted. En kopi ville drive, og udbyderen ville se et andet navn end
     kunden selv. */
  await db.ref(`udbyder/kunder/${id}`).set({ oprettetMs: nu });

  await log(id, ejerUid, AUDIT.opret, id, "kunde oprettet");

  /* ⚠ INGEN DEMO-DATA. Kunden skal se sit eget system tomt og opdage hvad
     tomme tilstande faktisk siger. Se opret-kunde.mjs. */
  return { ok: true, id, moduler: Object.keys(moduler) };
});

export const kundemoduler = onCall({ region: REGION }, async (req) => {
  const ejerUid = kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevKundeId(d);

  if (!Array.isArray(d.moduler)) {
    throw new HttpsError("invalid-argument", "moduler skal være en liste.");
  }
  const ukendte = ukendteModuler(d.moduler);
  if (ukendte.length) {
    throw new HttpsError("invalid-argument", `Ukendte moduler: ${ukendte.join(", ")}`);
  }
  if (!(await kundeFindes(id))) {
    throw new HttpsError("not-found", `Kunden "${id}" findes ikke.`);
  }

  const db = getDatabase();
  const foer = (await db.ref(`tenants/${id}/moduler`).once("value")).val() || {};
  const efter = modulsaet(d.moduler);

  /* ⚠ ET FRAVALG LUKKER KUNDENS EGNE DATA (beslutning 33). Han kan ikke
     hente dem ud gennem appen bagefter. Derfor står de fravalgte i
     auditposten — så det kan ses hvad der blev lukket, og hvornår. */
  const fjernet = Object.keys(foer).filter((m) => foer[m] === true && efter[m] !== true);

  await db.ref(`tenants/${id}/moduler`).set(efter);
  await log(id, ejerUid, AUDIT.aendre, id,
    fjernet.length ? `moduler; fravalgt: ${fjernet.join(",")}` : "moduler");

  return { ok: true, moduler: Object.keys(efter), fjernet };
});

export const kundestatus = onCall({ region: REGION }, async (req) => {
  const ejerUid = kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevKundeId(d);

  const status = kortStreng(d.status, 20);
  if (!ALLE_ABONNEMENTSTATUS.includes(status)) {
    throw new HttpsError("invalid-argument", `Ukendt status: ${d.status}`);
  }
  /* ⚠ ÅRSAGEN ER EN ALLOWLISTE, IKKE FRITEKST. Den ender i auditloggen, og
     fritekst dér er præcis det audit-regler.js findes for at holde ude. */
  const aarsag = kortStreng(d.aarsag, 40);
  if (aarsag && !ALLE_AARSAGER.includes(aarsag)) {
    throw new HttpsError("invalid-argument", `Ukendt årsag: ${d.aarsag}`);
  }
  if (!(await kundeFindes(id))) {
    throw new HttpsError("not-found", `Kunden "${id}" findes ikke.`);
  }

  /* ⚠ update(), IKKE set(). Noden bærer også rabatBps, interval og startetMs,
     og et set() ville tørre dem væk hver gang nogen satte en kunde på pause.
     Rabatten ville forsvinde lydløst, og den næste faktura ville være til
     fuld pris — en fejl der først opdages når kunden ringer.
     `aarsag` nulstilles med vilje, når der ikke er angivet nogen: en gammel
     årsag der blev stående efter en genåbning, ville forklare den forkerte
     hændelse. */
  const post = {
    status, aendretMs: Date.now(), aendretAf: ejerUid,
    aarsag: aarsag || null,
  };
  await getDatabase().ref(`tenants/${id}/abonnement`).update(post);
  /* ⚠ INGEN KONTO RØRES. Spærringen ligger på tenanten — beslutning 32.
     Sattes `disabled` på kundens logins, kunne genåbningen ikke rulles
     tilbage: de der var spærret individuelt ville blive åbnet med. */
  await log(id, ejerUid, AUDIT.tilstandsskift, id,
    aarsag ? `abonnement ${status} (${aarsag})` : `abonnement ${status}`);

  return { ok: true, status };
});

/**
 * Kundens FØRSTE administrator.
 *
 * ⚠ DEN FINDES FORDI opretbruger IKKE KAN BRUGES HER. Den tager tenanten fra
 * kalderens token, og en ejerkonto har ingen. Selve oprettelsen deles med den
 * gennem opretKonto() — to kopier ville drive, og den ene ville glemme
 * indekset eller claims.
 *
 * Løsenet vises én gang i konsollen og gemmes ikke. Firebase gemmer kun et
 * hash, og der er ingen invitationsmail endnu.
 */
export const kundeadmin = onCall({ region: REGION }, async (req) => {
  const ejerUid = kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevKundeId(d);

  if (!(await kundeFindes(id))) {
    throw new HttpsError("not-found", `Kunden "${id}" findes ikke.`);
  }
  /* ⚠ ROLLEN KAN VÆLGES, men kun blandt presettene — som alle andre steder.
     Uden en angivet rolle bliver det admin: det er den første konto, og en
     kunde uden administrator kan ikke oprette sine egne brugere. */
  return opretKonto({
    tenantId: id, kalderUid: ejerUid,
    d: { ...d, rolle: kortStreng(d.rolle, 30) || "admin" },
  });
});

/* ══════════════════════════════════════════════════════════════════════
   DEN DAGLIGE MÅLING — det eneste der ikke kan laves bagud
   ══════════════════════════════════════════════════════════════════════

   Abonnementet faktureres på HØJESTE antal aktive i perioden. Et slutantal
   kan ikke rekonstruere en top: en kunde med 30 chauffører den 3. og 8 den
   31. ville blive faktureret for 8. Vælger man toppen, SKAL der samples.

   ⚠ DEN LÆSER KUNDEDATA, OG DET ER DEN FØRSTE FUNKTION DER GØR DET.
   Admin SDK kommer uden om reglerne, og det er netop derfor der ikke bliver
   åbnet én eneste regel: ejerkonsollen kan fortsat kun læse tre noder pr.
   kunde. Havde vi i stedet udvidet udbyder-claim'et til at læse `brugere` og
   `koeretoejer`, ville en browser med det claim kunne se hver kundes flåde —
   for at kunne lave en optælling der hører hjemme på en server.

   Målingen gemmer TAL, ikke rækker: to heltal og en modulliste. Der står
   ingen navne, ingen registreringsnumre og ingen mailadresser i den.

   ⚠ ÉN MÅLING I DØGNET. Et modul der var tilvalgt i tre timer, faktureres
   ikke. Det står på grundlaget, så ingen tror det er en fejl.
   ══════════════════════════════════════════════════════════════════════ */

/** Målingen for én kunde. Eksporteret for sig, så den kan prøves. */
async function maalKunde(db, id, nu) {
  const [b, k, m, a] = await Promise.all([
    db.ref(`tenants/${id}/brugere`).once("value"),
    db.ref(`tenants/${id}/koeretoejer`).once("value"),
    db.ref(`tenants/${id}/moduler`).once("value"),
    db.ref(`tenants/${id}/abonnement`).once("value"),
  ]);

  const { antal, ukendte } = taelBrugere(b.val() || {});
  const post = {
    ms: nu,
    /* ⚠ MANGLENDE STATUS ER AKTIV — samme retning som erAktiv() og
       harModul(). En kunde oprettet før feltet fandtes skal ikke slippe for
       at blive faktureret, fordi noden mangler. */
    status: a.val()?.status || "aktiv",
    brugere: antal,
    koeretoejer: taelKoeretoejer(k.val() || {}),
    moduler: m.val() || null,
  };
  /* ⚠ EN UKENDT ROLLE SLUGES IKKE. Den ville lydløst blive en gratis bruger.
     Tallet står i målingen, så det kan ses på grundlaget. */
  if (ukendte.length) post.ukendteRoller = ukendte.length;
  return post;
}

/**
 * Måler ALLE kunder én gang i døgnet.
 *
 * ⚠ 03:10 UTC. Efter midnat i dansk tid året rundt, så en måling altid hører
 * til den dag den er stemplet med — også i sommertid. Kører den 23:50 UTC,
 * ville den i vintertid tilhøre næste dansk dag.
 *
 * ⚠ IDEMPOTENT PR. DØGN. Nøglen er datoen, så to kørsler samme dag
 * overskriver hinanden frem for at give to målinger. En genkørsel efter en
 * fejl er derfor ufarlig.
 */
export const maaldagligt = onSchedule(
  { schedule: "10 3 * * *", timeZone: "UTC", region: REGION },
  async () => {
    const db = getDatabase();
    const indeks = (await db.ref("udbyder/kunder").once("value")).val() || {};
    const nu = Date.now();
    const dato = maalingsdato(nu);

    let maalt = 0;
    for (const id of Object.keys(indeks)) {
      const post = await maalKunde(db, id, nu);
      await db.ref(`udbyder/maalinger/${id}/${dato}`).set(post);
      maalt += 1;
    }
    console.log(`maaldagligt: ${maalt} kunder maalt for ${dato}`);
    return null;
  }
);

/**
 * Samme måling, kaldt i hånden.
 *
 * ⚠ DEN FINDES FORDI DEN PLANLAGTE KØRSEL IKKE KAN EFTERPRØVES UDEN AT VENTE
 * ET DØGN. En mekanisme man først ser virke i produktion, er en mekanisme man
 * ikke ved virker. Den skriver til samme sted med samme nøgle, så en manuel
 * kørsel og den planlagte ikke kan give to forskellige målinger.
 */
export const maalnu = onCall({ region: REGION }, async (req) => {
  const ejerUid = kraevUdbyder(req);
  const db = getDatabase();
  const indeks = (await db.ref("udbyder/kunder").once("value")).val() || {};
  const nu = Date.now();
  const dato = maalingsdato(nu);

  const ud = {};
  for (const id of Object.keys(indeks)) {
    const post = await maalKunde(db, id, nu);
    await db.ref(`udbyder/maalinger/${id}/${dato}`).set(post);
    ud[id] = post;
  }
  console.log(`maalnu: ${Object.keys(ud).length} kunder, kaldt af ${ejerUid}`);
  return { ok: true, dato, maalinger: ud };
});

/* ══════════════════════════════════════════════════════════════════════
   PRISER OG RABAT
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Læg en NY prisliste. En gammel rettes aldrig.
 *
 * ⚠ EN NY PRIS ER EN NY POST. Samme idiom som `gyldigFra` på en sats. Kunne
 * en liste rettes, kunne en faktura fra marts ikke genskabes efter en
 * prisstigning i april — og bogføringsmaterialet skal kunne dokumenteres i
 * fem år.
 *
 * ⚠ MEN DET ER IKKE VERSIONERINGEN DER BESKYTTER MARTS. Det gør frysningen:
 * et genereret grundlag gemmer sine egne satser. Versioneringen giver
 * sporbarhed. De to forveksles, og så bygger man den ene og tror man har
 * den anden.
 */
export const prislisteopret = onCall({ region: REGION }, async (req) => {
  const ejerUid = kraevUdbyder(req);
  const d = req.data || {};

  const liste = {
    gyldigFraMs: Number(d.gyldigFraMs),
    /* ⚠ FAST 25 %, IKKE FRA NYTTELASTEN. Det er FleetControls egen faktura
       til en dansk vognmand — den er 25 % hver gang. Et aabent felt ville
       ikke give praecision, men en tastefejl at lave. Kommer den foerste
       udenlandske kunde, staar satsen ét sted: MOMSSATS i priser.js.
       Se noten dér om hvorfor det IKKE er samme sag som kundens eget
       fakturagrundlag, hvor satsen faktisk varierer. */
    momssats: MOMSSATS,
    /* ⚠ PLATFORMSADGANGEN SKAL MED. Den blev glemt her, da modellen fik den:
       modellen, reglerne og formularen kendte den, men funktionen byggede
       listen FELT FOR FELT og tog kun de felter den kendte i forvejen. Alt saa
       rigtigt ud, og enhver prisliste blev afvist med "Platformsadgangen
       mangler" — af serverens egen validering, paa data serveren selv havde
       smidt vaek.

       Det er den slags fejl et objekt der bygges felt for felt inviterer til.
       Alternativet — at tage d ind som den er — ville til gengaeld lade en
       aendret klient skrive hvad som helst, og saa er momssatsen ikke fast
       laengere. Feltlisten bliver, og proeven nedenfor holder den komplet. */
    platform: d.platform || null,
    moduler: d.moduler || {},
    oprettetAf: ejerUid,
    /* ⚠ TO DATOER, OG DE BETYDER IKKE DET SAMME. gyldigFraMs er hvornaar
       prisen GAELDER; oprettetMs er hvornaar den blev lagt. En liste kan
       laegges i dag og gaelde fra den 1. i naeste maaned, og skaermen skal
       kunne sige begge dele — "sidst rettet" er den ene, ikke den anden. */
    oprettetMs: Date.now(),
  };

  /* ⚠ SAMME VALIDERING SOM KLIENTEN, kørt igen. En ændret klient kunne sende
     kroner som float, og så ville hele prislisten være en øre-fejl. */
  const fejl = validerPrisliste(liste, { kendteModuler: ALLE_MODULER });
  if (fejl.length) throw new HttpsError("invalid-argument", fejl.join(" "));

  const ref = getDatabase().ref("udbyder/prisliste").push();
  await ref.set(liste);

  /* ⚠ INGEN AUDITPOST HOS EN KUNDE. Prislisten er VORES, ikke én kundes —
     der er ingen tenant at logge den under, og at vælge en tilfældig ville
     være at skrive en fremmed hændelse ind i hans log. */
  console.log(`prislisteopret: ${ref.key} af ${ejerUid}`);
  return { ok: true, id: ref.key };
});

/**
 * Rabatten og abonnementsvilkårene på ÉN kunde.
 *
 * ⚠ RABAT I BASISPOINT. 1500 = 15,00 %. Heltal, som beløb er i øre: 15.5 som
 * float giver afrundingsfejl der først dukker op på faktura nummer fyrre.
 *
 * ⚠ update(), IKKE set(). Statussen ligger i samme node og skrives af
 * kundestatus. Et set() her ville sætte en pauset kunde tilbage til aktiv,
 * fordi feltet manglede i nyttelasten.
 */
export const kundeabonnement = onCall({ region: REGION }, async (req) => {
  const ejerUid = kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevKundeId(d);

  if (!(await kundeFindes(id))) {
    throw new HttpsError("not-found", `Kunden "${id}" findes ikke.`);
  }

  const post = { aendretMs: Date.now(), aendretAf: ejerUid };

  if (d.rabatBps !== undefined) {
    const bps = Number(d.rabatBps);
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      throw new HttpsError("invalid-argument",
        "Rabatten er basispoint som heltal mellem 0 og 10000 (0-100 %).");
    }
    post.rabatBps = bps;
  }

  if (d.interval !== undefined) {
    /* Kun måned indtil videre. En kvartalsfaktura er ikke en anden sats —
       det er en anden PERIODE, og generatoren skal kende den. Den findes
       ikke endnu, og et felt der lover noget der ikke virker, er værre end
       intet felt. */
    if (d.interval !== "maaned") {
      throw new HttpsError("invalid-argument", "Kun 'maaned' er understøttet.");
    }
    post.interval = "maaned";
  }

  if (d.startetMs !== undefined) {
    const ms = Number(d.startetMs);
    if (!Number.isFinite(ms)) {
      throw new HttpsError("invalid-argument", "startetMs skal være et tidspunkt.");
    }
    post.startetMs = ms;
  }

  if (d.rabatModulBps !== undefined) {
    /* ⚠ ET MAP, IKKE EN LISTE. Nøglen er modulnavnet, og et ukendt modul
       afvises: en rabat på et modul der ikke findes, ville ligge og se ud som
       en aftale ingen kunne finde igen. */
    const m = d.rabatModulBps;
    if (m !== null && (typeof m !== "object" || Array.isArray(m))) {
      throw new HttpsError("invalid-argument", "rabatModulBps skal være et map.");
    }
    const ud = {};
    for (const [modul, bps] of Object.entries(m || {})) {
      if (!ALLE_MODULER.includes(modul)) {
        throw new HttpsError("invalid-argument", `Ukendt modul: ${modul}`);
      }
      const n = Number(bps);
      if (!Number.isInteger(n) || n < 0 || n > 10000) {
        throw new HttpsError("invalid-argument",
          `Rabatten på ${modul} skal være basispoint mellem 0 og 10000.`);
      }
      /* ⚠ NUL GEMMES IKKE. Et modul med 0 % er et modul uden rabat, og en
         node fuld af nuller ville se ud som aftaler der ikke findes. */
      if (n > 0) ud[modul] = n;
    }
    post.rabatModulBps = Object.keys(ud).length ? ud : null;
  }

  if (Object.keys(post).length === 2) {
    throw new HttpsError("invalid-argument", "Intet at ændre.");
  }

  await getDatabase().ref(`tenants/${id}/abonnement`).update(post);
  /* ⚠ RABATTEN ER ET TAL PÅ ALLOWLISTEN og må derfor stå i loggen. Kunden
     skal kunne se hvad der blev aftalt om hans egen regning. */
  await log(id, ejerUid, AUDIT.aendre, id,
    post.rabatBps !== undefined ? `rabat ${post.rabatBps} bps` : "abonnementsvilkaar");

  return { ok: true, ...post };
});

/* ══════════════════════════════════════════════════════════════════════
   GENERATOREN — den fryser en periode og rører den aldrig igen
   ══════════════════════════════════════════════════════════════════════

   ⚠ ET GRUNDLAG ER ET DOKUMENT, IKKE EN BEREGNING.

   Genberegnede vi grundlaget hver gang skærmen blev åbnet, ville et gammelt
   grundlag ændre sig når prislisten eller rabatten ændrede sig. En faktura
   fra marts ville få nye tal i april, og bogføringsmaterialet kunne ikke
   dokumenteres. Derfor gemmer dokumentet sine EGNE satser og regner aldrig
   igen.

   ⚠ DET ER FRYSNINGEN DER BESKYTTER MARTS — ikke at prislisten er
   versioneret. Versioneringen giver sporbarhed. De to forveksles, og så
   bygger man den ene og tror man har den anden.

   ⚠ PRISLISTEN ER DEN DER GJALDT VED PERIODENS BEGYNDELSE.
   En prisstigning midt i en måned slår altså igennem NÆSTE periode. Det er
   et valg: alternativet var at dele måneden i to stykker med hver sin sats,
   og så ville en kunde få to linjer for det samme modul uden at have ændret
   noget. Sæt `gyldigFraMs` til den 1. i en måned, så er der ingen tvivl.

   ⚠ DEN OVERSKRIVER IKKE. Findes grundlaget, afvises kaldet. En rettelse er
   et NYT grundlag der henviser til det gamle — som `erstat()` i grundlag.js
   — og den vej er ikke bygget endnu. Indtil den er, er "nægt" det rigtige
   svar: en overskrivning ville se ud som en rettelse og være en sletning.
   ══════════════════════════════════════════════════════════════════════ */

/** Grundlaget for ÉN kunde i én periode. Ren udregning oven på det læste. */
function byggKundegrundlag({ id, periode, graenser, maalinger, prisliste, abonnement }) {
  const s = sammenfatMaalinger(maalingerIPeriode(maalinger, periode));

  const rabatBps = Number.isInteger(abonnement?.rabatBps) ? abonnement.rabatBps : 0;
  const rabatModulBps = abonnement?.rabatModulBps || {};
  const linjer = linjerForPeriode({
    prisliste,
    moduldage: s.moduldage,
    dageIPerioden: graenser.dage,
    antalBrugere: s.brugere,
    antalKoeretoejer: s.koeretoejer,
    rabatBps, rabatModulBps,
  }).map((l) => ({ ...l, prislisteId: prisliste.id || null }));

  const t = totalerAfLinjer(linjer);

  return {
    kundeId: id,
    periode,
    periodeFra: graenser.fra,
    periodeTil: graenser.til,
    dageIPerioden: graenser.dage,
    /* ⚠ DAGE MÅLT OG DAGE FAKTURERET STÅR BEGGE. Er de forskellige, er der
       enten pauset eller ikke målt — og de to ser ens ud på en total. Uden
       begge tal kan ingen se forskel bagefter. */
    dageMaalt: s.dageMaalt,
    dageFaktureres: s.dageFaktureres,
    hoejesteBrugere: s.brugere,
    hoejesteKoeretoejer: s.koeretoejer,
    /* ⚠ BEGGE STAAR PAA GRUNDLAGET. Linjen baerer den rabat der FAKTISK blev
       brugt; de her to siger hvad der var aftalt, saa det kan ses hvorfor.
       En generel rabat over nul overruler modulernes — se rabatFor(). */
    rabatBps,
    rabatModulBps: Object.keys(rabatModulBps).length ? rabatModulBps : null,
    prislisteId: prisliste.id || null,
    momssats: Number.isFinite(prisliste.momssats) ? prisliste.momssats : null,
    linjer,
    beloebOere: t.beloebOere,
    /* ⚠ null, IKKE 0, hvis bare én linje mangler sin momssats. Et halvt
       momsbeløb er værre end intet: det ser ud som om det er regnet ud. */
    momsOere: t.momsOere,
    ialtOere: t.ialtOere,
    laast: true,
  };
}

export const grundlagopret = onCall({ region: REGION }, async (req) => {
  const ejerUid = kraevUdbyder(req);
  const d = req.data || {};

  const periode = kortStreng(d.periode, 7);
  const graenser = periodeGraenser(periode);
  if (!graenser) {
    throw new HttpsError("invalid-argument", `Ugyldig periode: ${d.periode} (forventer "2026-08").`);
  }
  /* ⚠ EN PERIODE DER IKKE ER SLUT, KAN IKKE GØRES OP. Frøs vi den i dag,
     ville resten af måneden mangle — og dokumentet er frosset, så den
     kommer aldrig med. */
  if (Date.now() <= graenser.til) {
    throw new HttpsError("failed-precondition",
      `Perioden ${periode} er ikke slut endnu. Et grundlag der fryses for tidligt, mangler resten af måneden for altid.`);
  }

  /* ⚠ ÉT KLIK, ALLE KUNDER — men stadig ét DOKUMENT pr. kunde.
     De to blev forvekslet undervejs: jeg lavede handlingen om til én kunde ad
     gangen, fordi grundlaget skulle vaere pr. kunde. Det er dokumentet der
     skal vaere pr. kunde; knappen skal goere dem alle. Med tredive kunder
     ville tredive klik vaere en maanedlig opgave ingen orker.

     Hver kunde skrives for sig, og en kunde der fejler stopper ikke de
     andre — den staar bare uden grundlag paa skaermen bagefter. */
  const db = getDatabase();

  const lister = (await db.ref("udbyder/prisliste").once("value")).val() || {};
  const prisliste = gaeldendePrisliste(lister, graenser.fra);
  if (!prisliste) {
    throw new HttpsError("failed-precondition",
      `Ingen prisliste gjaldt ved begyndelsen af ${periode}. Opret en med gyldigFraMs den 1. i maaneden.`);
  }

  /* Én bestemt kunde kan stadig goeres op alene — men det er ikke vejen. */
  const kunEn = kortStreng(d.id, 40) || null;
  const indeks = (await db.ref("udbyder/kunder").once("value")).val() || {};
  const ider = (kunEn ? [kunEn] : Object.keys(indeks)).sort();
  if (kunEn && !indeks[kunEn]) {
    throw new HttpsError("not-found", `Kunden "${kunEn}" findes ikke.`);
  }

  const oprettet = [];
  const sprunget = [];

  for (const id of ider) {
    const sti = `udbyder/fakturagrundlag/${periode}/${id}`;

    /* ⚠ EN ALLEREDE OPGJORT KUNDE OVERSKRIVES IKKE — den springes over.
       Ét klik der roerte et frosset dokument, ville vaere en sletning
       forklaedt som en gentagelse. Med flere kunder kan man ikke naegte hele
       kaldet, for saa ville én opgjort kunde blokere resten. */
    if ((await db.ref(sti).once("value")).exists()) {
      sprunget.push({ id, hvorfor: "allerede opgjort" });
      continue;
    }

    const [maal, abon] = await Promise.all([
      db.ref(`udbyder/maalinger/${id}`).once("value"),
      db.ref(`tenants/${id}/abonnement`).once("value"),
    ]);
    const g = byggKundegrundlag({
      id, periode, graenser,
      maalinger: maal.val() || {},
      prisliste,
      abonnement: abon.val(),
    });

    /* ⚠ "AKTIVE KUNDER" ER DEM DER VAR AKTIVE I PERIODEN — ikke dem der er
       aktive I DAG. En kunde der blev sat paa pause den 20., var i drift i
       nitten dage og skal have en regning for dem; en kunde der har vaeret
       opsagt hele maaneden har nul dage og skal ikke have et tomt dokument.
       dageFaktureres svarer paa netop det, og den taeller allerede pause og
       opsigelse fra. */
    if (!g.dageFaktureres) {
      sprunget.push({ id, hvorfor: "ingen fakturerbare dage" });
      continue;
    }

    g.genereretMs = Date.now();
    g.genereretAf = ejerUid;
    await db.ref(sti).set(g);
    await log(id, ejerUid, AUDIT.opret, periode, `fakturagrundlag ${periode}`);
    oprettet.push({ id, beloebOere: g.beloebOere });
  }

  return {
    ok: true, periode,
    oprettet: oprettet.length,
    sprunget,
    ialtOere: oprettet.reduce((s, x) => s + (x.beloebOere || 0), 0),
  };
});


/**
 * Slet en prisliste.
 *
 * ⚠ EN LISTE DER ER BRUGT, KAN IKKE SLETTES — og det er ikke en advarsel, det
 * er en afvisning. Hvert frosset fakturagrundlag bærer `prislisteId`. Slettes
 * listen, peger grundlaget på ingenting, og så kan en faktura ikke længere
 * dokumenteres. Bogføringsmaterialet skal kunne forklares i fem år.
 *
 * ⚠ EN UBRUGT LISTE ER IKKE REGNSKABSDATA. Den er en kladde eller en
 * tastefejl, og dér ville "tag den ud af drift med en status" bare give en
 * liste over ting man skal se bort fra. Det er forskellen på at slette en
 * FAKTURA og at slette et UDKAST.
 *
 * Advarslen står i skærmen; afvisningen står her. En advarsel man kan klikke
 * væk, er ikke en kontrol.
 */
export const prislisteslet = onCall({ region: REGION }, async (req) => {
  const ejerUid = kraevUdbyder(req);
  const id = kortStreng(req.data?.id, 60);
  if (!id) throw new HttpsError("invalid-argument", "id mangler.");

  const db = getDatabase();
  if (!(await db.ref(`udbyder/prisliste/${id}`).once("value")).exists()) {
    throw new HttpsError("not-found", "Prislisten findes ikke.");
  }

  /* Hvert grundlag i hver periode bærer den prisliste det blev regnet af. */
  const alle = (await db.ref("udbyder/fakturagrundlag").once("value")).val() || {};
  const brugtI = [];
  for (const [periode, kunder] of Object.entries(alle)) {
    for (const g of Object.values(kunder || {})) {
      if (g?.prislisteId === id && !brugtI.includes(periode)) brugtI.push(periode);
    }
  }
  if (brugtI.length) {
    throw new HttpsError("failed-precondition",
      `Prislisten er brugt til at gøre ${brugtI.sort().join(", ")} op og kan ikke slettes. ` +
      `Et grundlag der peger på en slettet prisliste, kan ikke dokumenteres.`);
  }

  await db.ref(`udbyder/prisliste/${id}`).remove();
  /* ⚠ INGEN AUDITPOST HOS EN KUNDE. Prislisten er vores, ikke én kundes — at
     vælge en tilfældig tenant ville skrive en fremmed hændelse i hans log.
     Se prislisteopret. */
  console.log(`prislisteslet: ${id} af ${ejerUid}`);
  return { ok: true, id };
});

/* ══════════════════════════════════════════════════════════════════════
   TURTLEBOOKING — UDLÅN AF TRANSPORTKASSER
   ══════════════════════════════════════════════════════════════════════

   ⚠ HVORFOR DEN HER SKAL VÆRE EN FUNKTION.

   `kasseudlaan` er `.write: false`. Ikke fordi klienten mangler en rettighed
   — lagermedarbejderen HAR `kasseudlaan.skriv` — men fordi handlingen ikke
   kan udføres rigtigt fra en klient:

   1. ET UDLÅN ÆNDRER TO POSTER. Udlånet og kassen skal skrives sammen eller
      slet ikke. Skrives kun den ene, står en kasse som udlånt uden et udlån,
      eller et udlån som returneret mens kassen stadig er hos museet.

   2. PERIODEN SKAL PRØVES MOD DE ANDRE UDLÅN. `konflikter()` er ren og
      prøvet, men den AFGØR ingenting — den svarer. Ligger tjekket i skærmen,
      kan det gås uden om med en direkte skrivning, og så er det dekoration.
      Præcis samme forbehold som de fem disponeringstjek har.

   3. TO LAGERMÆND KAN RAMME SAMME SEKUND. Et læs-så-skriv uden lås ville
      lade begge bookinger passere hver sin kontrol og lande oven på
      hinanden. Det er prototypens DE-QR 777 mod DE-KL 404 igen, denne gang
      med en kasse.

   ⚠ POLITIKKEN ER DEN SAMME FIL. `delt/turtlebooking.js` er en KOPI af
   `src/fleet/turtlebooking.js`. Serveren prøver mod nøjagtig den `valideUdlaan()`
   og den `kanSkifteUdlaan()` som formularen viser brugeren. Skrev serveren
   sin egen afskrift, ville skærmen sige ja og serveren nej — uden at nogen
   kunne se hvorfor.
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Adgangen til at skrive et udlån.
 *
 * ⚠ MODUL OG ABONNEMENT PRØVES HER OGSÅ. Admin-SDK'et går uden om reglerne,
 * og reglerne er det eneste sted de to spærringer ellers står. Uden de linjer
 * ville funktionen være en åben dør rundt om både modulafkrydsningen og
 * loginspærringen — en kunde på pause kunne skrive videre gennem den.
 */
async function kraevUdlaansskriv(req) {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const perms = auth.token?.perms;
  if (typeof perms !== "string" || !perms.includes(`|${PERM.kasseudlaanSkriv}|`)) {
    throw new HttpsError("permission-denied", `Kræver ${PERM.kasseudlaanSkriv}.`);
  }

  const db = getDatabase();
  /* Fejler ÅBENT når feltet ikke findes, nøjagtig som reglen gør — ellers
     ville en gammel tenant uden abonnementsnode blive lukket ude. */
  const [ab, modul] = await Promise.all([
    db.ref(`tenants/${tenantId}/abonnement/status`).once("value"),
    db.ref(`tenants/${tenantId}/moduler/turtlebooking`).once("value"),
  ]);
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  if (modul.exists() && modul.val() !== true) {
    throw new HttpsError("permission-denied", "Turtlebooking er ikke slået til.");
  }

  return { uid: auth.uid, tenantId, db };
}

/** Fejlene fra valideUdlaan som én læselig besked. */
const somBesked = (fejl) =>
  Object.entries(fejl).map(([k, v]) => `${k}: ${v}`).join(" ");

async function logUdlaan(tenantId, uid, handling, udlaanId, foer, efter, note) {
  const d = diff(foer, efter);
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${tenantId}/drift/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt: "kasseudlaan", objektId: udlaanId,
      klasse: "drift",
      aendrede: d.aendrede, foer: d.foer, efter: d.efter,
      note: note ?? null,
    });
}

export const kasseudlaanskriv = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId, db } = await kraevUdlaansskriv(req);
  const d = req.data || {};
  const rod = db.ref(`tenants/${tenantId}`);

  /* ---- OPRET: en reservation ---------------------------------------- */
  if (d.handling === "opret") {
    const post = {
      kasseId: kortStreng(d.kasseId, 40),
      sagsnummer: kortStreng(d.sagsnummer, 40),
      kundeId: kortStreng(d.kundeId, 60),
      beskrivelse: kortStreng(d.beskrivelse, 300),
      fra: Number(d.fra),
      til: Number(d.til),
      /* ⚠ TILSTANDEN VÆLGES IKKE AF KLIENTEN. Et nyt udlån er `booket`.
         Kunne den sendes med, kunne man springe klargøringen over ved at
         oprette udlånet direkte som `udlaant`. */
      tilstand: "booket",
    };

    const fejl = valideUdlaan(post, {});
    if (Object.keys(fejl).length) {
      throw new HttpsError("invalid-argument", somBesked(fejl));
    }

    const kasse = (await rod.child(`kasser/${post.kasseId}`).once("value")).val();
    if (!kasse) throw new HttpsError("not-found", `Kassen ${post.kasseId} findes ikke.`);
    if (kasse.status === "udeAfDrift") {
      throw new HttpsError("failed-precondition",
        `${post.kasseId} er ude af drift og kan ikke loves væk.`);
    }

    post.oprettetAf = uid;
    post.oprettetMs = Date.now();

    /* ⚠ HELE LISTEN I ÉN TRANSAKTION, og det er med vilje.
       Konflikttjekket skal se DEN LISTE der skrives til. Læste vi først og
       skrev bagefter, ville to bookinger i samme sekund begge passere hver
       sin kontrol. En transaktion på listen genlæser og kører kroppen igen,
       hvis nogen nåede at skrive imens.
       Prisen er at hele noden læses og skrives pr. booking. Vokser den ud
       over det, er svaret et indeks pr. kasse — ikke et svagere tjek. */
    const nyId = rod.child("kasseudlaan").push().key;
    let konflikt = null;
    const res = await rod.child("kasseudlaan").transaction((nuvaerende) => {
      konflikt = null;
      const liste = Object.entries(nuvaerende || {}).map(([id, u]) => ({ id, ...u }));
      const stoeder = konflikter(liste, {
        kasseId: post.kasseId, fra: post.fra, til: post.til,
      });
      if (stoeder.length) {
        konflikt = stoeder[0];
        return; /* undefined = afbryd, skriv ingenting */
      }
      return { ...(nuvaerende || {}), [nyId]: post };
    });

    if (konflikt) {
      throw new HttpsError("failed-precondition",
        `${post.kasseId} er allerede lovet væk på sag ${konflikt.sagsnummer} i perioden.`);
    }
    if (!res.committed) {
      throw new HttpsError("aborted", "En anden nåede først. Prøv igen.");
    }

    await logUdlaan(tenantId, uid, AUDIT.opret, nyId, null, post, null);
    return { ok: true, id: nyId };
  }

  /* ---- SKIFT: klargør, udlever, retur, annullér ---------------------- */
  if (d.handling === "skift") {
    const udlaanId = kortStreng(d.udlaanId, 60);
    const til = kortStreng(d.til, 20);
    if (!udlaanId) throw new HttpsError("invalid-argument", "udlaanId mangler.");

    const foer = (await rod.child(`kasseudlaan/${udlaanId}`).once("value")).val();
    if (!foer) throw new HttpsError("not-found", "Udlånet findes ikke.");

    if (!kanSkifteUdlaan(foer.tilstand, til)) {
      /* ⚠ SAMME TABEL SOM SKÆRMEN. Knappen findes ikke i UI'et for et skift
         der ikke er lovligt — den her er for den der går uden om UI'et. */
      throw new HttpsError("failed-precondition",
        `Et udlån kan ikke skifte fra ${foer.tilstand} til ${til}.`);
    }

    const kasse = (await rod.child(`kasser/${foer.kasseId}`).once("value")).val();
    if (!kasse) throw new HttpsError("not-found", `Kassen ${foer.kasseId} findes ikke.`);

    const virkning = virkningPaaKasse({ fra: foer.tilstand, til, kasse });

    /* ⚠ ÉN SKRIVNING. Udlånet og kassen lander sammen eller slet ikke.
       To kald ville kunne efterlade en kasse som udlånt uden et udlån —
       netop den tilstand hele noden er lukket for at undgå. */
    const opdatering = { [`kasseudlaan/${udlaanId}/tilstand`]: til };

    /* ⚠ HVORNÅR DET FAKTISK SKETE. `fra`/`til` er AFTALEN — hvad der var
       planlagt. De to stempler her er kendsgerningen, og de sættes af
       SERVEREN i selve skiftet, ikke af klienten: et tidspunkt en browser må
       oplyse, kan sættes til hvad som helst, og et ur der går forkert er
       ikke engang ond vilje.
       Uden dem kan historikken kun sige hvad der var meningen, og "MDT-101
       har været ude 126 dage" ville være en påstand vi ikke kan stå inde
       for, hvis kassen kom hjem i forvejen. */
    if (til === "udlaant") opdatering[`kasseudlaan/${udlaanId}/udleveretMs`] = Date.now();
    if (til === "returneret") opdatering[`kasseudlaan/${udlaanId}/returneretMs`] = Date.now();

    if (virkning) {
      for (const [felt, vaerdi] of Object.entries(virkning)) {
        opdatering[`kasser/${foer.kasseId}/${felt}`] = vaerdi;
      }
    }
    await rod.update(opdatering);

    await logUdlaan(tenantId, uid, AUDIT.tilstandsskift, udlaanId,
      { tilstand: foer.tilstand }, { tilstand: til },
      virkning ? `kasse ${foer.kasseId} -> ${virkning.status}` : null);
    return { ok: true, id: udlaanId, tilstand: til, kasse: virkning || null };
  }

  /* ---- RET: sagsnummer, periode og beskrivelse, kun mens den er booket -- */
  if (d.handling === "ret") {
    const udlaanId = kortStreng(d.udlaanId, 60);
    if (!udlaanId) throw new HttpsError("invalid-argument", "udlaanId mangler.");

    const foer = (await rod.child(`kasseudlaan/${udlaanId}`).once("value")).val();
    if (!foer) throw new HttpsError("not-found", "Udlånet findes ikke.");

    /* ⚠ KUN MENS DEN ER BOOKET. Er kassen klargjort eller ude, er perioden
       ikke længere en aftale man kan skrive om — den er noget der er sket.
       Skal den forlænges bagefter, er det et nyt udlån. */
    if (foer.tilstand !== "booket") {
      throw new HttpsError("failed-precondition",
        "Kun en booket reservation kan rettes. Er kassen ude, er perioden en kendsgerning.");
    }

    /* ⚠ KASSEN KAN IKKE BYTTES. Skal udlånet flyttes til en anden kasse, er
       det en annullering og en ny reservation — ellers ville historikken på
       den første kasse forsvinde uden spor. */
    const post = {
      ...foer,
      sagsnummer: kortStreng(d.sagsnummer, 40),
      kundeId: kortStreng(d.kundeId, 60),
      beskrivelse: kortStreng(d.beskrivelse, 300),
      fra: Number(d.fra),
      til: Number(d.til),
    };

    const fejl = valideUdlaan(post, {});
    if (Object.keys(fejl).length) {
      throw new HttpsError("invalid-argument", somBesked(fejl));
    }

    let konflikt = null;
    const res = await rod.child("kasseudlaan").transaction((nuvaerende) => {
      konflikt = null;
      const liste = Object.entries(nuvaerende || {}).map(([id, u]) => ({ id, ...u }));
      /* ⚠ undtagId: udlånet må ikke støde sammen med sig selv. */
      const stoeder = konflikter(liste, {
        kasseId: post.kasseId, fra: post.fra, til: post.til, undtagId: udlaanId,
      });
      if (stoeder.length) { konflikt = stoeder[0]; return; }
      return { ...(nuvaerende || {}), [udlaanId]: post };
    });

    if (konflikt) {
      throw new HttpsError("failed-precondition",
        `${post.kasseId} er lovet væk på sag ${konflikt.sagsnummer} i den periode.`);
    }
    if (!res.committed) {
      throw new HttpsError("aborted", "En anden nåede først. Prøv igen.");
    }

    await logUdlaan(tenantId, uid, AUDIT.aendre, udlaanId, foer, post, null);
    return { ok: true, id: udlaanId };
  }

  throw new HttpsError("invalid-argument", `Ukendt handling: ${d.handling}`);
});

/* ══════════════════════════════════════════════════════════════════════
   WAREHOUSE (WMS) — BEVÆGELSEN
   ══════════════════════════════════════════════════════════════════════

   ⚠ HVORFOR DEN SKAL VÆRE EN FUNKTION.

   `bevaegelser` og `beholdning` er begge `.write: false`. Ikke fordi
   rettigheden mangler — lagermedarbejderen HAR `bevaegelser.skriv` — men
   fordi handlingen ikke kan udføres rigtigt fra en klient:

   1. EN BEVÆGELSE ÆNDRER TO TIL TRE POSTER. Bevægelsen selv, og saldoen på
      den plads varen kom fra og den den kom til. Skrives kun den ene, står
      der varer på en hylde ingen har lagt der — eller de forsvinder uden
      spor. Et lagertal uden en bevægelse bag sig kan ikke forklares.

   2. SALDOEN MÅ IKKE KUNNE RETTES I HÅNDEN. Kunne den det, beviser en
      optælling ingenting: enhver afvigelse kunne "rettes" frem for at blive
      forklaret.

   3. TO LAGERMÆND KAN PLUKKE FRA SAMME HYLDE I SAMME SEKUND.

   ---------------------------------------------------------------------------
   ⚠ HVAD ATOMICITETEN GARANTERER — OG HVAD DEN IKKE GØR.

   Skrivningen sker som ÉN multi-path `update()` med `ServerValue.increment()`
   på saldoerne. Det giver to ting:

     ✓ Bevægelsen og begge saldoændringer lander SAMMEN eller slet ikke.
       Der kan aldrig opstå en saldo uden en bevægelse bag sig.
     ✓ Selve tilvæksten er atomisk. To samtidige plukninger af 2 og 3 giver
       −5, aldrig −2 eller −3.

   ✗ Men den kan IKKE afvise sig selv. Beholdningen læses FØR skrivningen for
     at afvise et pluk der ikke er dækning for, og i det vindue — millisekunder
     — kan to plukninger begge se dækning og tilsammen tage hylden i minus.

   Det er ikke et hul der kan lukkes med en transaktion: en RTDB-transaktion
   virker på ÉN ref, og en flytning rører to. En transaktion på hele
   `beholdning` ville låse hele lageret ved hver eneste scanning.

   Derfor er valget: garantér det der ikke må gå galt (ingen saldo uden
   bevægelse), og gør det der kan gå galt SYNLIGT. Funktionen læser saldoerne
   igen bagefter, og går én i minus, skrives der en auditpost om det. En
   negativ saldo er et lager der skal tælles — ikke et tal der skal rettes.
   Det er hvad cycle count er til for.

   ---------------------------------------------------------------------------
   ⚠ POLITIKKEN ER DEN SAMME FIL. `delt/warehouse.js` er en KOPI af
   `src/fleet/warehouse.js`. Serveren prøver mod nøjagtig den
   `valideBevaegelse()` og den `virkningPaaBeholdning()` som skærmen viser
   brugeren. Ottende fil efter det mønster.
   ══════════════════════════════════════════════════════════════════════ */

async function kraevBevaegelsesskriv(req) {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const perms = auth.token?.perms;
  if (typeof perms !== "string" || !perms.includes(`|${PERM.bevaegelserSkriv}|`)) {
    throw new HttpsError("permission-denied", `Kræver ${PERM.bevaegelserSkriv}.`);
  }

  const db = getDatabase();
  /* ⚠ ADMIN-SDK'ET GÅR UDEN OM REGLERNE, og reglerne er det eneste sted de to
     spærringer ellers står. Uden de linjer var funktionen en åben dør rundt om
     både modulafkrydsningen og loginspærringen. Fejler ÅBENT når feltet ikke
     findes — nøjagtig som reglen gør. */
  const [ab, modul] = await Promise.all([
    db.ref(`tenants/${tenantId}/abonnement/status`).once("value"),
    db.ref(`tenants/${tenantId}/moduler/warehouse`).once("value"),
  ]);
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  if (modul.exists() && modul.val() !== true) {
    throw new HttpsError("permission-denied", "Warehouse er ikke slået til.");
  }

  return { uid: auth.uid, tenantId, db };
}

/** Saldoposten som den ser ud efter en ændring — eller null hvis den ikke findes. */
const saldoAf = (snap) => (snap.exists() ? snap.val()?.antal ?? 0 : 0);

export const bevaegelseskriv = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId, db } = await kraevBevaegelsesskriv(req);
  const rod = db.ref(`tenants/${tenantId}`);
  const d = req.data || {};

  const post = {
    art: kortStreng(d.art, 20),
    vareId: kortStreng(d.vareId, 60),
    antal: Number(d.antal),
    fraPladsId: kortStreng(d.fraPladsId, 60),
    tilPladsId: kortStreng(d.tilPladsId, 60),
    batch: kortStreng(d.batch, 40),
    serienummer: kortStreng(d.serienummer, 60),
    reference: kortStreng(d.reference, 60),
    note: kortStreng(d.note, 300),
  };

  if (!post.vareId) throw new HttpsError("invalid-argument", "vareId mangler.");

  /* ---- Varen bestemmer sporing, enhed OG kunde ----------------------- */
  const vare = (await rod.child(`varer/${post.vareId}`).once("value")).val();
  if (!vare) throw new HttpsError("not-found", `Varen ${post.vareId} findes ikke.`);

  /* ⚠ KUNDEN LÆSES AF VAREN OG SKRIVES MED PÅ BEVÆGELSEN. Den sendes IKKE
     fra klienten: kunne den det, kunne en bevægelse afregnes til en anden
     kunde end den varen tilhører. Og den skrives MED frem for at blive slået
     op igen senere, fordi bevægelsen er et historisk faktum — skifter varen
     ejer, må sidste kvartals fakturagrundlag ikke ændre sig. */
  post.kundeId = vare.kundeId;

  const fejl = valideBevaegelse(post, { vare });
  if (Object.keys(fejl).length) {
    throw new HttpsError("invalid-argument",
      Object.entries(fejl).map(([k, v]) => `${k}: ${v}`).join(" "));
  }

  /* ---- Pladserne skal findes, og fra-pladsen skal kunne plukkes ------ */
  const pladser = {};
  for (const felt of ["fraPladsId", "tilPladsId"]) {
    const id = post[felt];
    if (!id) continue;
    const p = (await rod.child(`reolpladser/${id}`).once("value")).val();
    if (!p) throw new HttpsError("not-found", `Lokationen ${id} findes ikke.`);
    pladser[id] = p;
  }

  /* ⚠ KARANTÆNE BLOKERER, DEN ADVARER IKKE. Varen på en karantæneplads er
     under mistanke; en pluk der bare advarer, bliver klikket væk. Samme regel
     som en udløbet kompetence. */
  if (post.fraPladsId && !kanPlukkesFra(pladser[post.fraPladsId])) {
    const p = pladser[post.fraPladsId];
    throw new HttpsError("failed-precondition",
      `Der kan ikke plukkes fra en plads i ${
        PLADS_STATUS[p.status]?.label.toLowerCase() || "den tilstand"}.`);
  }
  /* En lukket plads må heller ikke modtage: hylden er taget ud af drift. */
  if (post.tilPladsId && pladser[post.tilPladsId]?.status === "lukket") {
    throw new HttpsError("failed-precondition",
      "Lokationen er lukket og kan ikke modtage varer.");
  }

  /* ---- Hvad det gør ved saldoerne ------------------------------------ */
  const virkning = virkningPaaBeholdning(post);

  /* ⚠ DÆKNINGEN PRØVES FØR SKRIVNINGEN — og se noten i hovedet om hvad det
     vindue IKKE dækker. Uden tjekket ville hvert eneste fejlpluk tage hylden
     i minus, og et negativt lagertal er værre end intet: nogen disponerer
     efter det. */
  for (const v of virkning) {
    if (!(v.aendring < 0)) continue;
    const snap = await rod.child(`beholdning/${v.noegle}`).once("value");
    const nu = saldoAf(snap);
    if (nu + v.aendring < 0) {
      throw new HttpsError("failed-precondition",
        `Der står kun ${talFraMaengde(nu)} ${vare.enhed} af ${vare.varenummer} på lokationen — ` +
        `der kan ikke tages ${talFraMaengde(-v.aendring)}.`);
    }
  }

  /* ---- ÉN skrivning ---------------------------------------------------- */
  const nyId = rod.child("bevaegelser").push().key;
  const nu = Date.now();
  const opdatering = {
    [`bevaegelser/${nyId}`]: {
      art: post.art,
      vareId: post.vareId,
      kundeId: post.kundeId,
      antal: post.antal,
      fraPladsId: post.fraPladsId || null,
      tilPladsId: post.tilPladsId || null,
      batch: post.batch || null,
      serienummer: post.serienummer || null,
      reference: post.reference || null,
      note: post.note || null,
      tidspunktMs: nu,
      /* ⚠ uid, IKKE personId. Det er hvem der GJORDE noget. */
      oprettetAf: uid,
    },
  };

  for (const v of virkning) {
    const b = `beholdning/${v.noegle}`;
    /* Nøglefelterne skrives hver gang; de er de samme, og en post der
       oprettes af en increment ville ellers mangle dem. */
    opdatering[`${b}/pladsId`] = v.pladsId;
    opdatering[`${b}/vareId`] = v.vareId;
    opdatering[`${b}/batch`] = v.batch;
    opdatering[`${b}/senestMs`] = nu;
    /* ⚠ increment() ER DET DER GØR DET ATOMISK. To samtidige plukninger af 2
       og 3 giver −5, aldrig −2 eller −3. En læs-og-skriv ville tabe den ene. */
    opdatering[`${b}/antal`] = Number.isFinite(v.saet)
      ? v.saet
      : ServerValue.increment(v.aendring);
  }

  await rod.update(opdatering);

  /* ---- Gik noget i minus alligevel? ---------------------------------- */
  /* ⚠ DET KAN SKE, og så skal det være LARMENDE frem for tavst. Se hovedet:
     vinduet mellem dækningstjekket og skrivningen kan ikke lukkes med en
     transaktion, når to pladser skal ændres sammen. En negativ saldo er et
     lager der skal tælles — ikke et tal der skal rettes. */
  const negative = [];
  for (const v of virkning) {
    if (!(v.aendring < 0)) continue;
    const efter = saldoAf(await rod.child(`beholdning/${v.noegle}`).once("value"));
    if (efter < 0) negative.push({ noegle: v.noegle, antal: efter });
  }
  if (negative.length) {
    await logBevaegelse(tenantId, uid, AUDIT.aendre, nyId, null,
      { antal: negative[0].antal, art: post.art },
      `NEGATIV SALDO paa ${negative.map((n) => n.noegle).join(", ")} — optael lokationen`);
  }

  await logBevaegelse(tenantId, uid, AUDIT.opret, nyId, null,
    { art: post.art, antal: post.antal, vareId: post.vareId, kundeId: post.kundeId },
    post.reference ? `ref ${post.reference}` : null);

  return {
    ok: true, id: nyId,
    beholdning: virkning.map((v) => v.noegle),
    advarsel: negative.length ? "negativ-saldo" : null,
  };
});

async function logBevaegelse(tenantId, uid, handling, id, foer, efter, note) {
  const d = diff(foer, efter);
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${tenantId}/drift/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt: "bevaegelser", objektId: id,
      klasse: "drift",
      aendrede: d.aendrede, foer: d.foer, efter: d.efter,
      note: note ?? null,
    });
}

/* ══════════════════════════════════════════════════════════════════════
   PLUKORDREN — AFSENDELSEN
   ══════════════════════════════════════════════════════════════════════

   ⚠ HVORFOR AFSENDELSEN IKKE ER ET FELT MAN SÆTTER.

   Reglerne lader klienten sætte `kladde`, `frigivet` og `annulleret` — men
   ikke `afsendt`. En ordre bliver afsendt fordi varerne FORLADER huset, altså
   fordi der skrives afsendelsesbevægelser der tager dem af
   afsendelsespladsen. Kunne tilstanden sættes direkte, kunne en ordre meldes
   afsendt uden at en palle var rørt — og lageret ville stadig stå med godset,
   mens kunden fik besked om at det var på vej.

   Funktionen skriver derfor BEGGE dele i én multi-path `update()`: én
   afsendelsesbevægelse pr. (vare, batch) der står på afsendelsespladsen,
   saldoændringerne, og ordrens tilstand. Enten sker det hele, eller intet.

   ⚠ DEN AFSENDER DET DER ER PLUKKET — IKKE DET DER ER BESTILT.
   Er der plukket 8 af 10, afsendes 8. Alternativet ville være at afvise
   delleverancer, og det ville betyde at et lager med 8 på hylden skulle vente
   på 2 der måske aldrig kommer. Ordren lukkes med det der faktisk gik ud, og
   forskellen står i historikken.
   ══════════════════════════════════════════════════════════════════════ */

export const plukordreafsend = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId, db } = await kraevBevaegelsesskriv(req);
  const rod = db.ref(`tenants/${tenantId}`);

  const ordreId = kortStreng(req.data?.ordreId, 60);
  if (!ordreId) throw new HttpsError("invalid-argument", "ordreId mangler.");

  const ordre = (await rod.child(`plukordrer/${ordreId}`).once("value")).val();
  if (!ordre) throw new HttpsError("not-found", "Ordren findes ikke.");

  if (!kanSkifteOrdre(ordre.tilstand, "afsendt")) {
    throw new HttpsError("failed-precondition",
      `En ordre i tilstanden ${ordre.tilstand} kan ikke afsendes.`);
  }

  /* ⚠ HVAD DER FAKTISK ER PLUKKET, læst af BEVÆGELSERNE — ikke af et felt på
     ordren. Et gemt `plukketAntal` ville drive fra bevægelserne ved den første
     pluk der ramte den ene og ikke den anden, og så ville der blive afsendt
     noget der ikke stod på pladsen. */
  const alle = (await rod.child("bevaegelser")
    .orderByChild("reference").equalTo(ordreId).once("value")).val() || {};

  /* Grupperet pr. (vare, batch): en afsendelse skal spejle det parti der
     blev plukket, ellers kan et tilbagekald ikke følge godset ud af huset. */
  const pr = new Map();
  for (const b of Object.values(alle)) {
    if (b.art !== "pluk") continue;
    const noegle = `${b.vareId}|${b.batch || ""}`;
    const nu = pr.get(noegle) || {
      vareId: b.vareId, batch: b.batch || null,
      serienummer: b.serienummer || null, antal: 0,
    };
    nu.antal += b.antal || 0;
    pr.set(noegle, nu);
  }
  /* Allerede afsendt fra en tidligere delafsendelse trækkes fra. */
  for (const b of Object.values(alle)) {
    if (b.art !== "afsend") continue;
    const noegle = `${b.vareId}|${b.batch || ""}`;
    const nu = pr.get(noegle);
    if (nu) nu.antal -= b.antal || 0;
  }

  const linjer = [...pr.values()].filter((x) => x.antal > 0);
  if (!linjer.length) {
    throw new HttpsError("failed-precondition",
      "Der er ikke plukket noget på ordren endnu — der er intet at afsende.");
  }

  const nu = Date.now();
  const opdatering = {
    [`plukordrer/${ordreId}/tilstand`]: "afsendt",
    [`plukordrer/${ordreId}/afsendtMs`]: nu,
  };

  for (const l of linjer) {
    const bevId = rod.child("bevaegelser").push().key;
    opdatering[`bevaegelser/${bevId}`] = {
      art: "afsend",
      vareId: l.vareId,
      /* ⚠ KUNDEN FRA ORDREN. Den er den samme som varens, men den skrives MED
         som på enhver anden bevægelse: et historisk faktum om hvem godset
         tilhørte da det forlod huset. */
      kundeId: ordre.kundeId,
      antal: l.antal,
      fraPladsId: ordre.afsendPladsId,
      tilPladsId: null,
      batch: l.batch,
      serienummer: l.serienummer,
      reference: ordreId,
      note: null,
      tidspunktMs: nu,
      oprettetAf: uid,
    };
    const bn = `beholdning/${beholdningsNoegle(ordre.afsendPladsId, l.vareId, l.batch)}`;
    opdatering[`${bn}/pladsId`] = ordre.afsendPladsId;
    opdatering[`${bn}/vareId`] = l.vareId;
    opdatering[`${bn}/batch`] = l.batch || UDEN_BATCH;
    opdatering[`${bn}/senestMs`] = nu;
    opdatering[`${bn}/antal`] = ServerValue.increment(-l.antal);
  }

  await rod.update(opdatering);

  await logBevaegelse(tenantId, uid, AUDIT.tilstandsskift, ordreId,
    { tilstand: ordre.tilstand }, { tilstand: "afsendt", antal: linjer.length },
    `afsendte ${linjer.length} varelinjer fra ordre ${ordre.nummer}`);

  return { ok: true, id: ordreId, linjer: linjer.length };
});

/* ══════════════════════════════════════════════════════════════════════
   OPTÆLLINGEN
   ══════════════════════════════════════════════════════════════════════

   ⚠ FORVENTNINGEN LÆSES HER, IKKE AF KLIENTEN.

   Det er hele grunden til at optællingen er en funktion. Sendte skærmen
   `forventet` med, ville afvigelsen være forskellen mellem hvad brugeren
   TROEDE der stod og hvad han talte — og så måler den ingenting. Serveren
   læser saldoen i det øjeblik der tælles, og regner selv forskellen.

   ⚠ TRE TING SKRIVES SAMMEN: optællingsposten, `optael`-bevægelsen og den
   nye saldo. Sker kun det ene, står der enten en rettelse ingen kan forklare,
   eller en måling der ikke slog igennem.

   ⚠ EN STOR AFVIGELSE BLOKERER IKKE. Det er fristende at kræve godkendelse
   over en grænse. Det ville betyde at den der finder det største hul, er den
   der ikke kan lukke sin optælling — og så bliver der talt mindre, ikke mere.
   Hylden er sandheden. Rettelsen sker med det samme, og afvigelsen står som
   sin egen kendsgerning der ikke kan slettes: `optaellinger` er
   `.write: false` for enhver klient.

   ⚠ MEN EN AFVIGELSE SKAL HAVE EN ÅRSAG, og årsagen er en allowliste.
   Fritekst kan ikke summeres — "svind", "Svind?" og "vist nok stjålet" ville
   blive tre kategorier af det samme problem.
   ══════════════════════════════════════════════════════════════════════ */

export const optaellingskriv = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId, db } = await kraevBevaegelsesskriv(req);
  const rod = db.ref(`tenants/${tenantId}`);
  const d = req.data || {};

  const pladsId = kortStreng(d.pladsId, 60);
  const vareId = kortStreng(d.vareId, 60);
  const batch = kortStreng(d.batch, 40);
  const taeltAntal = Number(d.taeltAntal);
  const aarsag = kortStreng(d.aarsag, 30);
  const note = kortStreng(d.note, 300);

  if (!pladsId) throw new HttpsError("invalid-argument", "pladsId mangler.");
  if (!vareId) throw new HttpsError("invalid-argument", "vareId mangler.");

  const [vare, plads] = await Promise.all([
    rod.child(`varer/${vareId}`).once("value").then((s) => s.val()),
    rod.child(`reolpladser/${pladsId}`).once("value").then((s) => s.val()),
  ]);
  if (!vare) throw new HttpsError("not-found", `Varen ${vareId} findes ikke.`);
  if (!plads) throw new HttpsError("not-found", `Lokationen ${pladsId} findes ikke.`);

  /* ⚠ HER LÆSES FORVENTNINGEN. Se hovedet. */
  const noegle = beholdningsNoegle(pladsId, vareId, batch);
  const snap = await rod.child(`beholdning/${noegle}`).once("value");
  const forventet = snap.exists() ? (snap.val()?.antal ?? 0) : 0;

  const fejl = valideOptaelling(
    { pladsId, vareId, batch, taeltAntal, aarsag, note, forventet }, { vare });
  if (Object.keys(fejl).length) {
    throw new HttpsError("invalid-argument",
      Object.entries(fejl).map(([k, v]) => `${k}: ${v}`).join(" "));
  }

  const afvigelse = taeltAntal - forventet;
  const nu = Date.now();
  const bevId = rod.child("bevaegelser").push().key;
  const optId = rod.child("optaellinger").push().key;

  /* ⚠ EN OPTÆLLING SÆTTER SALDOEN, den lægger ikke til. Blev den lagt til,
     ville en optælling der BEKRÆFTEDE beholdningen, fordoble den. Derfor
     skrives `taeltAntal` direkte og ikke som en increment. */
  const opdatering = {
    [`bevaegelser/${bevId}`]: {
      art: "optael",
      vareId,
      kundeId: vare.kundeId,
      antal: taeltAntal,
      fraPladsId: null,
      tilPladsId: pladsId,
      batch: batch || null,
      serienummer: null,
      /* Referencen binder bevægelsen til optællingsposten, så en rettelse i
         lageret altid kan spores til den måling der udløste den. */
      reference: optId,
      note: note || null,
      tidspunktMs: nu,
      oprettetAf: uid,
    },
    [`optaellinger/${optId}`]: {
      pladsId, vareId,
      batch: batch || null,
      forventet,
      taeltAntal,
      afvigelse,
      /* Uden afvigelse er årsagen meningsløs og udelades — ellers ville hver
         eneste optælling der ramte plet, stå med en årsagskode. */
      aarsag: afvigelse === 0 ? null : aarsag,
      note: note || null,
      bevaegelseId: bevId,
      tidspunktMs: nu,
      oprettetAf: uid,
    },
    [`beholdning/${noegle}/pladsId`]: pladsId,
    [`beholdning/${noegle}/vareId`]: vareId,
    [`beholdning/${noegle}/batch`]: batch || UDEN_BATCH,
    [`beholdning/${noegle}/antal`]: taeltAntal,
    [`beholdning/${noegle}/senestMs`]: nu,
  };

  await rod.update(opdatering);

  await logBevaegelse(tenantId, uid, AUDIT.aendre, optId,
    { antal: forventet }, { antal: taeltAntal, aarsag: aarsag || null },
    afvigelse === 0
      ? `optaelling uden afvigelse paa ${pladsId}`
      : `AFVIGELSE ${afvigelse > 0 ? "+" : ""}${afvigelse} paa ${pladsId} (${aarsag})`);

  return { ok: true, id: optId, forventet, taeltAntal, afvigelse };
});
