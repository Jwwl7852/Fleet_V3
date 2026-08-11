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
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";

import { AUDIT, LOGBARE_FELTER, KLASSER, klasseFor } from "./delt/audit-regler.js";
import { ROLLE_PERMS, permStrengFraRolle, PERM } from "./delt/permissions.js";
import { modulsaet, ukendteModuler } from "./delt/moduler.js";
import { ALLE_ABONNEMENTSTATUS, ALLE_AARSAGER } from "./delt/abonnement.js";

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

  const post = { status, aendretMs: Date.now(), aendretAf: ejerUid };
  if (aarsag) post.aarsag = aarsag;

  await getDatabase().ref(`tenants/${id}/abonnement`).set(post);
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
