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

import {
  AUDIT, LOGBARE_FELTER, KLASSER, klasseFor, diff, forfaldnePartitioner
} from "./delt/audit-regler.js";
import { beregnKpi } from "./delt/kpi-aggregering.js";
import {
  valideUdlaan, kanSkifteUdlaan, virkningPaaKasse, konflikter
} from "./delt/unitbooking.js";
import {
  valideBevaegelse, virkningPaaBeholdning, kanPlukkesFra, PLADS_STATUS,
  talFraMaengde, kanSkifteOrdre, beholdningsNoegle, UDEN_BATCH,
  valideOptaelling, validePlacering, virkningPaaCarrier, kanPlaceres,
  CARRIER_STATUS, virkningPaaEnhed, valideEnhed, ENHED_TILSTAND
} from "./delt/warehouse.js";
import {
  ROLLE_PERMS, permStreng, permsForTenant,
  valideRolleperms, laaserUde, PERM,
} from "./delt/permissions.js";
import { valideVisning, skjulerAlt } from "./delt/dashboardvisning.js";
/* ⚠ SAMME FIL SOM SKAERMEN. grundlag.js og booking-state.js er kopieret til
   delt/, saa kanGodkende(), kanEksportere() og nummerformatet er de SAMME
   funktioner begge steder — ikke en afskrift. Se noten ved grundlagskriv. */
import {
  byggGrundlag, validerLinje, kanGodkende, godkend, laas,
  naesteGrundlagsnummer, fraDb, kanLaase
} from "./delt/grundlag.js";
import {
  valideBooking, bookingOpdatering, naesteBookingnummer,
  kanSkifteEtape, byggEtapeSkifte, forloebstilstand,
  valideForslag, forslagOpdatering,
  kanTraekkeForslag, traekOpdatering, erTrukket, aktiveForslag,
} from "./delt/booking-state.js";
import {
  reservationerFraEtape, enhedsIder, straekningFraEtape
} from "./delt/etaper.js";
import { tjekDisponering } from "./delt/disponering.js";
/* ⚠ SAMME FILER SOM SKAERMEN. Serveren proever mod noejagtig de regler
   formularen viste — se noten i opgaveplan-regler.js. */
import { opgaveMangler, reservationFraOpgave } from "./delt/opgaver.js";
import {
  valideOpgaveplan, valideFacilityopgave, valideOpgaveflyt, flytOpdatering,
  kanSkifteOpgave, statusOpdatering,
} from "./delt/opgaveplan-regler.js";
import { tjekLedigMod, konfliktTekst } from "./delt/reservations.js";
import { modulsaet, ukendteModuler, ALLE_MODULER } from "./delt/moduler.js";
import { ALLE_ABONNEMENTSTATUS, ALLE_AARSAGER } from "./delt/abonnement.js";
import { totalerAfLinjer } from "./delt/beloeb.js";
import { erGyldigMail, MINDSTE_KODE } from "./delt/brugere-regler.js";
import {
  taelBrugere, taelKoeretoejer, maalingsdato, validerPrisliste, sammenfatMaalinger,
  maalingerIPeriode, periodeGraenser, MOMSSATS, gaeldendePrisliste, linjerForPeriode
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
    note: kortStreng(d.note, 120)
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

/* ⚠ MOENSTERET SKREVES IKKE AF HER. Den her fil stod med {2} hvor
   klienten havde {2,}, og forskellen var et topdomaene paa noejagtig to
   tegn: en .dk-adresse kunne oprettes, en .com kunne ikke, og formularen
   havde sagt ja. Se noten i delt/brugere-regler.js. */

/** Indekset klienten kan læse. ⚠ INGEN CLAIMS OG INGEN LØSEN. */
const indeksPost = (b, rolle, spaerret = false) => ({
  email: b.email,
  navn: b.displayName || b.email,
  rolle,
  spaerret,
  opdateretMs: Date.now()
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

/**
 * Tenantens egne rolledefinitioner, eller null.
 *
 * ⚠ null OG IKKE ET TOMT OBJEKT. permsForTenant() falder tilbage på
 * ROLLE_PERMS når noden mangler — og en tenant uden `roller/` skal opføre
 * sig PRÆCIS som før beslutning 31b. Et tomt objekt ville betyde det samme
 * her, men det ville skjule forskellen mellem "ingen node" og "en node der
 * er blevet tømt", og de to er ikke det samme spørgsmål.
 */
async function hentRoller(tenantId) {
  const snap = await getDatabase().ref(`tenants/${tenantId}/roller`).once("value");
  return snap.exists() ? snap.val() : null;
}

/**
 * Claim-strengen for en rolle HOS DEN HER TENANT.
 *
 * ⚠ ALLE STEDER DER MINTER, SKAL BRUGE DEN HER. `opretbruger` og
 * `skiftrolle` mintede fra konstanten; gør de det stadig, ville en kunde der
 * har redigeret sin disponentrolle, få standarden tilbage næste gang han
 * oprettede en disponent — og forskellen ville først vise sig som en adgang
 * der manglede uden grund.
 */
async function claimForRolle(tenantId, rolle) {
  return permStreng(permsForTenant(rolle, await hentRoller(tenantId)));
}

async function log(tenantId, uid, handling, objektId, note) {
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${tenantId}/sikkerhed/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt: "brugere", objektId,
      klasse: "sikkerhed", note: note ?? null
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
  if (!email || !erGyldigMail(email)) {
    throw new HttpsError("invalid-argument", "Ugyldig mailadresse.");
  }
  const rolle = kortStreng(d.rolle, 30);
  if (!ROLLE_PERMS[rolle]) {
    throw new HttpsError("invalid-argument", `Ukendt rolle: ${d.rolle}`);
  }
  /* Løsenet sættes af den der opretter. Det sendes ikke retur og logges
     ikke — hverken her eller i auditposten. */
  const kode = typeof d.kode === "string" ? d.kode : "";
  if (kode.length < MINDSTE_KODE) {
    throw new HttpsError("invalid-argument", `Adgangskoden skal være mindst ${MINDSTE_KODE} tegn.`);
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
    /* ⚠ FRA TENANTENS EGEN DEFINITION. Opretter en kunde en ny disponent,
       skal han have DEN disponentrolle kunden har redigeret — ikke
       standarden. Mintede vi konstanten her, ville den nye bruger have en
       anden adgang end sine kolleger, og forskellen ville først vise sig
       som noget der manglede uden grund. Se beslutning 31b. */
    perms: await claimForRolle(tenantId, rolle)
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

  /* ⚠ FRA TENANTENS EGEN DEFINITION, IKKE FRA KONSTANTEN. Beslutning 31b:
     har kunden redigeret rollen, er det DEN der skal mintes. Konstanten er
     standarden man falder tilbage på, ikke svaret. */
  await auth.setCustomUserClaims(maalUid, {
    ...bruger.customClaims,
    rolle,
    perms: await claimForRolle(tenantId, rolle)
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

/* ══════════════════════════════════════════════════════════════════════════
   REDIGÉR EN ROLLE — BESLUTNING 31b

   ⚠ ROLLERNE VAR FASTE, OG DET ER DE IKKE LÆNGERE. Den oprindelige
   beslutning står stadig i BESLUTNINGER.md, fordi den er det eneste sted der
   står HVAD DER GÅR GALT uden den. De to farer er håndteret:

    1. AT LÅSE SIG SELV UDE. laaserUde() afviser to ting: at fjerne
       brugere.skriv fra den SIDSTE rolle der har den, og at fjerne den fra
       SIN EGEN rolle. Uden dem er det her den mest almindelige måde at
       ødelægge en rolleadministration på — og der er ingen vej tilbage fra
       klienten, fordi adgangen til at rette det var selv en permission.

    2. TO HÅNDHÆVELSESPUNKTER. roller/ er en KILDE. Reglerne læser den
       aldrig; adgang afgøres udelukkende af auth.token.perms. Se
       firebase.rules.json og test/rules.roller.test.mjs.

   ⚠ OG EN ÆNDRING RAMMER HVER BRUGER MED ROLLEN. Mintes claims ikke om, og
   tilbagekaldes tokenet ikke, virker den gamle adgang indtil tokenet udløber
   af sig selv — den fejltilstand skiftrolle allerede advarer imod, fordi den
   SER UD som om den lykkedes.
   ══════════════════════════════════════════════════════════════════════════ */
export const rolleskriv = onCall({ region: REGION }, async (req) => {
  /* Samme vagt som de øvrige brugerfunktioner: brugere.skriv. Det er
     PERMISSIONEN og ikke rollen — spørg hvad handlingen kræver. */
  const { uid, tenantId } = kraevBrugeradmin(req);
  const d = req.data || {};

  const rolle = kortStreng(d.rolle, 30);
  if (!ROLLE_PERMS[rolle]) {
    /* ⚠ ROLLENAVNENE ER STADIG FASTE. Man redigerer hvad en rolle indeholder;
       man opfinder ikke en ottende. En ny rolle er en ændring i koden — med
       prøver og en brugerart i priser.js, ellers faktureres den lydløst som
       desktop, den dyre af de to. Se beslutning 31. */
    throw new HttpsError("invalid-argument",
      `Ukendt rolle: ${d.rolle}. Rollenavnene er faste — man redigerer hvad de indeholder.`);
  }

  /* ⚠ HER LÆSES EN PERMS-LISTE FRA NYTTELASTEN — DET ENESTE STED.
     En BRUGERS perms udledes stadig af hans rolle; det er en ROLLES
     indhold der redigeres her, og det er hele beslutning 31b. Forskellen er
     ikke kosmetisk: kunne opretbruger eller skiftrolle læse d.perms, kunne
     en admin give sig selv noget der ikke stod i nogen rolle, og
     rollegennemgangen ville ikke længere beskrive virkeligheden.
     test/functions-delt.test.mjs holder de to fra hinanden. */
  const perms = Array.isArray(d.perms)
    ? d.perms.map((x) => kortStreng(x, 60)).filter(Boolean)
    : null;
  /* ⚠ SAMME VALIDERING SOM SKÆRMEN. En klientvalidering der ikke også står
     her, er en pæn knap — og den ville kunne skrive en permission ingen
     regel kender, altså en adgang til ingenting der SER UD som noget. */
  const form = valideRolleperms(perms);
  if (!form.ok) throw new HttpsError("invalid-argument", form.fejl);

  const auth = getAuth();
  /* ⚠ KALDERENS ROLLE FRA TOKENET, ikke fra et opslag. Den står i claim'et
     (skiftrolle sætter den), og et ekstra getUser() ville være både en
     rundtur mere og en konto hentet uden om hentIEgenTenant(). */
  const egenRolle = kortStreng(req.auth?.token?.rolle, 30) || null;

  const roller = await hentRoller(tenantId);
  /* ⚠ SPÆRRINGEN LIGGER HER, IKKE I SKÆRMEN. Den svarer HVORFOR, ikke bare
     at det ikke kan lade sig gøre — serveren afviser med den sætning skærmen
     ville have vist. */
  const grund = laaserUde(rolle, perms, roller || {}, { egenRolle });
  if (grund) throw new HttpsError("failed-precondition", grund);

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  /* ⚠ ADMIN-SDK'ET GÅR UDEN OM REGLERNE. Abonnementet er det eneste sted
     spærringen ellers står. Modulet prøves IKKE: roller hører ikke til et
     modul — de findes hos hver tenant uanset hvad han har købt. */
  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  /* ---- 1. Noden ------------------------------------------------------ */
  await rod.child(`roller/${rolle}`).set({
    perms,
    aendretAf: uid,
    aendretMs: Date.now(),
  });

  /* ---- 2. Claims for HVER bruger med rollen -------------------------- */
  /* ⚠ REKKEFØLGEN ER NODEN FØRST, SÅ CLAIMS. Fejler mintningen halvvejs, er
     noden rettet og nogle tokens ikke — og så kan rollen skrives igen og
     rette resten. Var rækkefølgen omvendt, ville et token kunne bære
     permissions der ikke stod nogen steder. */
  const claim = permStreng(permsForTenant(rolle, { ...(roller || {}), [rolle]: { perms } }));
  const indeks = (await rod.child("brugere").once("value")).val() || {};
  const ramte = Object.entries(indeks)
    .filter(([, v]) => v?.rolle === rolle)
    .map(([maalUid]) => maalUid);

  let fornyet = 0;
  const fejlede = [];
  for (const maalUid of ramte) {
    try {
      /* ⚠ hentIEgenTenant(), IKKE auth.getUser(). Uid'erne kommer fra
         tenantens eget indeks, så de ER i tenanten — men det argument står
         kun her i en kommentar, og hjælperen tjekker det. En prøve fælder
         enhver af brugerfunktionerne der henter en konto udenom, netop
         fordi et implicit argument ikke er en kontrol. Hjælperen rydder
         desuden en forældet indeksrække op, hvis kontoen er slettet uden om
         systemet. */
      const bruger = await hentIEgenTenant(auth, maalUid, tenantId);
      await auth.setCustomUserClaims(maalUid, {
        ...bruger.customClaims, rolle, perms: claim,
      });
      /* ⚠ UDEN DEN HER ER ÆNDRINGEN EN PÆN KNAP. Brugeren beholder sine
         gamle claims indtil tokenet udløber af sig selv — man ville tro man
         havde fjernet en adgang, som stadig virkede. Det er den værste
         fejltilstand, fordi den ser ud som om den lykkedes. */
      await auth.revokeRefreshTokens(maalUid);
      fornyet += 1;
    } catch (e) {
      /* ⚠ EN KONTO KAN VÆRE SLETTET UDEN OM SYSTEMET, og indekset overlever
         den. Det må ikke vælte de øvrige — men det skal RAPPORTERES, ikke
         sluges: en bruger hvis claims ikke blev fornyet, går rundt med den
         gamle adgang. */
      fejlede.push(maalUid);
    }
  }

  await log(tenantId, uid, "tilstandsskift", rolle,
    `roller ${rolle}: ${perms.length} perms, ${fornyet} fornyet` +
    (fejlede.length ? `, ${fejlede.length} fejlede` : ""));

  /* ⚠ SVARET SIGER HVOR MANGE DER IKKE BLEV FORNYET. Skærmen skal kunne
     vise det: en ændring der lykkedes for otte ud af ni, er ikke en
     ændring der lykkedes. */
  return { ok: true, ramte: ramte.length, fornyet, fejlede };
});
/* ══════════════════════════════════════════════════════════════════════════
   HVILKE DASHBOARDS EN BRUGER FAAR VIST

   ⚠ EN VISNING, IKKE EN ADGANG. kpi/ er laesbar for enhver i tenanten, saa
   en afkrydsning her SKJULER et dashboard — den spaerrer det ikke. Hele
   begrundelsen staar i delt/dashboardvisning.js og i regelfilen.

   Funktionen findes alligevel, fordi indstillingen er en ADMINISTRATORS
   beslutning om en ANDEN bruger. Kunne brugeren skrive sin egen, ville den
   holde op med at betyde det administratoren satte.

   ⚠ INGEN CLAIMS MINTES HER. Til forskel fra rolleskriv aendrer det her
   ingenting om hvad brugeren MAA — kun hvad han faar serveret. Mintede vi
   claims om, ville vi tilbagekalde et token for en visningsindstilling, og
   brugeren ville blive logget ud fordi nogen slog et dashboard fra.
   ══════════════════════════════════════════════════════════════════════════ */
export const dashboardvisningskriv = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId } = kraevBrugeradmin(req);
  const d = req.data || {};

  const maalUid = kortStreng(d.uid, 128);
  if (!maalUid) throw new HttpsError("invalid-argument", "uid mangler.");

  const visning = d.visning;
  const form = valideVisning(visning);
  if (!form.ok) throw new HttpsError("invalid-argument", form.fejl);

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  /* ⚠ ADMIN-SDK'ET GAAR UDEN OM REGLERNE. */
  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  /* ⚠ BRUGEREN SKAL VAERE I TENANTEN. Uid'et kommer fra nyttelasten, og en
     admin hos kunde A maa ikke kunne skrive en indstilling paa en bruger
     hos kunde B. hentIEgenTenant() tjekker claim'et. */
  await hentIEgenTenant(getAuth(), maalUid, tenantId);

  /* ⚠ MAN KAN IKKE SKJULE ALT. En bruger uden et eneste dashboard lander
     paa en tom forside, og Dashboard er `altid: true` i modulkataloget —
     et system uden forside er ikke et system. Modullisten skal med, fordi
     et fravalgt modul allerede har skjult sit dashboard. */
  const moduler = (await rod.child("moduler").once("value")).val();
  const harModulFn = (m) => !moduler || moduler[m] === true;
  const grund = skjulerAlt(visning, harModulFn);
  if (grund) throw new HttpsError("failed-precondition", grund);

  await rod.child(`dashboardvisning/${maalUid}`).set(visning);
  await log(tenantId, uid, "tilstandsskift", maalUid,
    `dashboardvisning: ${Object.entries(visning).filter(([, v]) => v === false).length} skjult`);

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
    status: "aktiv", aendretMs: nu, aendretAf: ejerUid
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
    aarsag: aarsag || null
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
    d: { ...d, rolle: kortStreng(d.rolle, 30) || "admin" }
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
    moduler: m.val() || null
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
    oprettetMs: Date.now()
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
    rabatBps, rabatModulBps
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
    laast: true
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
      abonnement: abon.val()
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
    ialtOere: oprettet.reduce((s, x) => s + (x.beloebOere || 0), 0)
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
   UNITBOOKING — UDLÅN AF TRANSPORTKASSER
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

   ⚠ POLITIKKEN ER DEN SAMME FIL. `delt/unitbooking.js` er en KOPI af
   `src/fleet/unitbooking.js`. Serveren prøver mod nøjagtig den `valideUdlaan()`
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
    db.ref(`tenants/${tenantId}/moduler/unitbooking`).once("value"),
  ]);
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  if (modul.exists() && modul.val() !== true) {
    throw new HttpsError("permission-denied", "Unitbooking er ikke slået til.");
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
      note: note ?? null
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
      /* ⚠ VALGFRI. Er den ikke sendt med, skrives feltet ikke — og udlaanet
         falder uden for "Klargoeres snart", som TAELLER dem uden dato for sig.
         `undefined` og ikke null: RTDB afviser undefined ved en skrivning, men
         her bruges det til at UDELADE feltet, og valideUdlaan() springer over
         paa null. Se noten paa klargoerSenest i firebase.rules.json. */
      ...(Number.isFinite(Number(d.klargoerSenest))
        ? { klargoerSenest: Number(d.klargoerSenest) } : {}),
      /* ⚠ TILSTANDEN VÆLGES IKKE AF KLIENTEN. Et nyt udlån er `booket`.
         Kunne den sendes med, kunne man springe klargøringen over ved at
         oprette udlånet direkte som `udlaant`. */
      tilstand: "booket"
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
        kasseId: post.kasseId, fra: post.fra, til: post.til
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
      /* Samme som ved oprettelsen. ⚠ Og en dato der FJERNES, skal kunne
         fjernes: sendes feltet ikke, arves `foer`s vaerdi af spredningen
         ovenfor — derfor nulstilles den eksplicit naar klienten sender null. */
      ...(Number.isFinite(Number(d.klargoerSenest))
        ? { klargoerSenest: Number(d.klargoerSenest) }
        : d.klargoerSenest === null ? { klargoerSenest: null } : {})
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
        kasseId: post.kasseId, fra: post.fra, til: post.til, undtagId: udlaanId
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

  /* ⚠ TO SLAGS BEVÆGELSER SIDEN ETAPE 12. En PLACERING flytter beholderen hen
     på en hylde og rører ingen saldo; alt andet flytter gods MELLEM beholdere.
     De to deles her, fordi de har hver sit skema — en placering har hverken
     vare eller antal. */
  if (kortStreng(d.art, 20) === "putaway") {
    return await skrivPlacering({ rod, tenantId, uid, d });
  }

  const post = {
    art: kortStreng(d.art, 20),
    vareId: kortStreng(d.vareId, 60),
    antal: Number(d.antal),
    fraCarrierId: kortStreng(d.fraCarrierId, 60),
    tilCarrierId: kortStreng(d.tilCarrierId, 60),
    batch: kortStreng(d.batch, 40),
    serienummer: kortStreng(d.serienummer, 60),
    reference: kortStreng(d.reference, 60),
    note: kortStreng(d.note, 300)
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

  /* ---- Beholderne skal findes ---------------------------------------- */
  const carriers = {};
  for (const felt of ["fraCarrierId", "tilCarrierId"]) {
    const id = post[felt];
    if (!id) continue;
    const c = (await rod.child(`carriers/${id}`).once("value")).val();
    if (!c) throw new HttpsError("not-found", `Beholderen ${id} findes ikke.`);
    carriers[id] = c;
  }

  /* ⚠ KARANTÆNEN SIDDER PÅ HYLDEN, IKKE PÅ BEHOLDEREN — og den skal stadig
     håndhæves. Efter etape 12 står godset i en carrier, og carrieren står på
     en plads: spærringen slås derfor op ét led længere ude. Uden det ville en
     karantæne kunne omgås ved at plukke fra beholderen frem for fra hylden,
     og det er nøjagtig den slags hul en migrering efterlader.

     En beholder UDEN plads (scannet ind, ikke placeret, eller i transit) har
     ingen hylde at arve en spærring fra — dér er der intet at slå op. */
  const pladsFor = async (carrierId) => {
    const pid = carriers[carrierId]?.pladsId;
    if (!pid) return null;
    const p = (await rod.child(`reolpladser/${pid}`).once("value")).val();
    if (!p) throw new HttpsError("not-found", `Lokationen ${pid} findes ikke.`);
    return { id: pid, ...p };
  };

  if (post.fraCarrierId) {
    const p = await pladsFor(post.fraCarrierId);
    if (p && !kanPlukkesFra(p)) {
      throw new HttpsError("failed-precondition",
        `Beholderen står på en plads i ${
          PLADS_STATUS[p.status]?.label.toLowerCase() || "den tilstand"} — ` +
        "der kan ikke plukkes fra den.");
    }
  }
  if (post.tilCarrierId) {
    const p = await pladsFor(post.tilCarrierId);
    /* En lukket plads må heller ikke modtage: hylden er taget ud af drift. */
    if (p?.status === "lukket") {
      throw new HttpsError("failed-precondition",
        "Beholderen står på en lukket lokation og kan ikke modtage varer.");
    }
  }

  /* ---- Hvad det gør ved saldoerne ------------------------------------ */
  const virkning = virkningPaaBeholdning(post);

  /* ---- Og hvad det gør ved ENHEDEN (etape 9) ------------------------- */
  /* ⚠ TO FORUDSÆTNINGER SOM KUN SERVEREN KAN PRØVE. virkningPaaEnhed()
     svarer på hvad der skal skrives; den kan ikke vide om serienummeret
     allerede findes, eller om enheden ligger dér hvor klienten tror.

     Uden det første kunne SN-4711 modtages to gange, og den anden modtagelse
     ville overskrive den første uden spor — enheden ville have været to
     steder, og kun det sidste ville stå. Uden det andet kunne den plukkes
     fra en beholder den ikke lå i, og så peger sporet det forkerte sted
     resten af enhedens liv. */
  const enhedsvirkning = virkningPaaEnhed(post, { vare });
  let enhedFoer = null;
  if (enhedsvirkning) {
    const sti = `enheder/${enhedsvirkning.serienummer}`;
    enhedFoer = (await rod.child(sti).once("value")).val();

    if (enhedsvirkning.kraeverLedigtSerienummer) {
      /* ⚠ EN AFSENDT ENHED MÅ GERNE KOMME RETUR. Det er ikke en dublet — det
         er den samme enhed der kommer hjem, og den skal have en ny linje i
         sporet frem for en afvisning. Kun en enhed der ALLEREDE er i huset,
         kan ikke modtages igen. */
      if (enhedFoer && ENHED_TILSTAND[enhedFoer.tilstand]?.iHuset) {
        throw new HttpsError("already-exists",
          `Serienummeret ${enhedsvirkning.serienummer} ligger allerede i ` +
          `beholderen ${enhedFoer.carrierId}. Én enhed kan ikke modtages to gange.`);
      }
      if (enhedFoer && enhedFoer.vareId !== post.vareId) {
        throw new HttpsError("failed-precondition",
          `Serienummeret ${enhedsvirkning.serienummer} hører til en anden vare.`);
      }
    } else {
      if (!enhedFoer) {
        throw new HttpsError("not-found",
          `Serienummeret ${enhedsvirkning.serienummer} findes ikke på lageret.`);
      }
      if (enhedFoer.carrierId !== enhedsvirkning.kraeverEnhedenLiggerI) {
        throw new HttpsError("failed-precondition",
          `Serienummeret ${enhedsvirkning.serienummer} ligger i ` +
          `${enhedFoer.carrierId || "ingen beholder"}, ikke i ` +
          `${enhedsvirkning.kraeverEnhedenLiggerI}.`);
      }
    }

    /* Og posten skal kunne stå i basen. Reglerne er `.write: false`, så det
       er HER den validering findes — admin-SDK'et går uden om dem. */
    const fejlEnhed = valideEnhed(
      { serienummer: enhedsvirkning.serienummer, ...enhedsvirkning.felter },
      {});
    if (Object.keys(fejlEnhed).length) {
      throw new HttpsError("invalid-argument",
        Object.entries(fejlEnhed).map(([k, v]) => `${k}: ${v}`).join(" "));
    }
  }

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
        `Der ligger kun ${talFraMaengde(nu)} ${vare.enhed} af ${vare.varenummer} i beholderen — ` +
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
      fraCarrierId: post.fraCarrierId || null,
      tilCarrierId: post.tilCarrierId || null,
      batch: post.batch || null,
      serienummer: post.serienummer || null,
      reference: post.reference || null,
      note: post.note || null,
      tidspunktMs: nu,
      /* ⚠ uid, IKKE personId. Det er hvem der GJORDE noget. */
      oprettetAf: uid
    }
  };

  for (const v of virkning) {
    const b = `beholdning/${v.noegle}`;
    /* Nøglefelterne skrives hver gang; de er de samme, og en post der
       oprettes af en increment ville ellers mangle dem. */
    opdatering[`${b}/carrierId`] = v.carrierId;
    opdatering[`${b}/vareId`] = v.vareId;
    opdatering[`${b}/batch`] = v.batch;
    opdatering[`${b}/senestMs`] = nu;
    /* ⚠ increment() ER DET DER GØR DET ATOMISK. To samtidige plukninger af 2
       og 3 giver −5, aldrig −2 eller −3. En læs-og-skriv ville tabe den ene. */
    opdatering[`${b}/antal`] = Number.isFinite(v.saet)
      ? v.saet
      : ServerValue.increment(v.aendring);
  }

  /* ⚠ ENHEDEN SKRIVES I DEN SAMME OPDATERING. Det er hele prisen ved at have
     enheden som eget objekt: RTDB's multi-path update er atomisk, så
     bevægelsen, saldoen og enhedsrækken lander sammen eller slet ikke. To
     kald ville være to udfald — og så ville `enhedsafvigelse()` vise en
     uenighed vi selv havde lavet. Se WAREHOUSE.md punkt 7. */
  if (enhedsvirkning) {
    const e = `enheder/${enhedsvirkning.serienummer}`;
    for (const [felt, vaerdi] of Object.entries(enhedsvirkning.felter)) {
      opdatering[`${e}/${felt}`] = vaerdi;
    }
    opdatering[`${e}/senestMs`] = nu;
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
    advarsel: negative.length ? "negativ-saldo" : null
  };
});

/**
 * En PLACERING: beholderen sættes på en hylde.
 *
 * ⚠ DEN RØRER INGEN SALDO. Godset ligger i beholderen og flytter med den —
 * det er hele gevinsten ved at lægge beholdningen på carrieren i etape 12.
 * Før var en flytning N saldoændringer der skulle lykkes sammen, og
 * atomiciteten var kun delvis.
 *
 * ⚠ BEVÆGELSEN OG PLADSEN SKRIVES SAMMEN ELLER SLET IKKE. Skrives kun den
 * ene, står beholderen enten et sted ingen kan se hvornår den kom til, eller
 * der findes en placering af noget der aldrig blev flyttet. Samme regel som
 * udlånet og kassen i `kasseudlaanskriv`.
 */
async function skrivPlacering({ rod, tenantId, uid, d }) {
  const carrierId = kortStreng(d.carrierId, 60);
  const tilPladsId = kortStreng(d.tilPladsId, 60);
  const note = kortStreng(d.note, 300);

  /* ⚠ DE FORBUDTE FELTER SENDES MED IND I VALIDERINGEN, frem for bare at
     blive læst forbi. En placering med et `antal` gik igennem indtil en probe
     mod den udrullede base fandt det: der landede ingen forkerte data, fordi
     funktionen selv bygger posten — men kalderen fik at vide at det lykkedes,
     og troede dermed at tallet betød noget. Et felt der tages imod og
     ignoreres, er værre end et der afvises. */
  const fejl = validePlacering({
    art: "putaway", carrierId, tilPladsId,
    vareId: kortStreng(d.vareId, 60) || null,
    /* ⚠ typeof, IKKE Number(). En callable serialiserer `undefined` til
       `null`, og `Number(null)` er 0 — et tal der ser sendt ud. Skærmen
       sendte ingen mængde, og placeringen blev afvist for at bære en på nul.
       Proben fandt det ikke: den udelod feltet HELT, og så var der ingen
       null at koste om. Det var et klik i browseren der fandt det. */
    antal: typeof d.antal === "number" ? d.antal : null,
    batch: kortStreng(d.batch, 40) || null,
    fraCarrierId: kortStreng(d.fraCarrierId, 60) || null,
    tilCarrierId: kortStreng(d.tilCarrierId, 60) || null
  });
  if (Object.keys(fejl).length) {
    throw new HttpsError("invalid-argument",
      Object.entries(fejl).map(([k, v]) => `${k}: ${v}`).join(" "));
  }

  const [carrier, plads] = await Promise.all([
    rod.child(`carriers/${carrierId}`).once("value").then((s) => s.val()),
    rod.child(`reolpladser/${tilPladsId}`).once("value").then((s) => s.val()),
  ]);
  if (!carrier) throw new HttpsError("not-found", `Beholderen ${carrierId} findes ikke.`);
  if (!plads) throw new HttpsError("not-found", `Lokationen ${tilPladsId} findes ikke.`);

  /* ⚠ ADMIN-SDK'ET GÅR UDEN OM REGLERNE, så invarianten skal håndhæves HER
     også. En opbrugt engangskasse optager ingen hylde — og belægningen tæller
     alt der har et pladsId. Slap den igennem, ville en hylde se optaget ud af
     noget der er brugt op.

     ⚠ MEN EN I TRANSIT MÅ GERNE: at sætte den på hylden ER ankomsten, og
     statussen følger med i samme skrivning. Se virkningPaaCarrier(). */
  if (!kanPlaceres(carrier.status)) {
    throw new HttpsError("failed-precondition",
      `En beholder der er ${
        CARRIER_STATUS[carrier.status]?.label.toLowerCase() || "ude"}, ` +
      "kan ikke sættes på en hylde.");
  }
  if (plads.status === "lukket") {
    throw new HttpsError("failed-precondition",
      "Lokationen er lukket og kan ikke modtage en beholder.");
  }

  const virkning = virkningPaaCarrier({ art: "putaway", carrierId, tilPladsId }, carrier);
  if (!virkning) throw new HttpsError("internal", "Placeringen kunne ikke udledes.");

  const nu = Date.now();
  const nyId = rod.child("bevaegelser").push().key;

  const opdatering = {
    [`bevaegelser/${nyId}`]: {
      art: "putaway",
      carrierId,
      /* ⚠ KUNDEN SKRIVES MED, ELLERS KAN PLACERINGEN IKKE AFREGNES.
         afregningslinjer() filtrerer på kundeId, og en placering uden ville
         aldrig komme på en faktura — arbejdet ville være gratis uden at nogen
         havde besluttet det. Den læses af BEHOLDEREN og ikke af nyttelasten:
         kunne klienten oplyse den, kunne en håndtering afregnes til en anden
         kunde end den godset tilhører. Og den skrives MED frem for at blive
         slået op igen senere, fordi bevægelsen er et historisk faktum. */
      kundeId: carrier.kundeId || null,
      /* Hvor den stod før — så flytningen kan læses baglæns. `null` første
         gang: en nyscannet beholder kom ikke fra en hylde. */
      fraPladsId: carrier.pladsId || null,
      tilPladsId,
      note: note || null,
      tidspunktMs: nu,
      /* ⚠ uid, IKKE personId. Det er hvem der GJORDE noget. */
      oprettetAf: uid
    },
    [`carriers/${virkning.carrierId}/pladsId`]: virkning.pladsId
  };
  /* ⚠ STATUS OG PLADS I SAMME SKRIVNING. Ellers ville der findes et
     oejeblik hvor beholderen baade var i transit og stod paa en hylde. */
  if (virkning.status) {
    opdatering[`carriers/${virkning.carrierId}/status`] = virkning.status;
  }

  await rod.update(opdatering);

  await logBevaegelse(tenantId, uid, AUDIT.aendre, nyId,
    { status: carrier.status },
    { art: "putaway", status: virkning.status || carrier.status },
    virkning.status
      ? `beholder ${carrierId} ankommet og placeret paa ${tilPladsId}`
      : `beholder ${carrierId} placeret paa ${tilPladsId}`);

  return {
    ok: true, id: nyId, carrierId, pladsId: tilPladsId,
    ankommet: Boolean(virkning.status)
  };
}

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
      note: note ?? null
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
      serienummer: b.serienummer || null, antal: 0
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
    [`plukordrer/${ordreId}/afsendtMs`]: nu
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
      /* ⚠ UD AF AFSENDELSESBEHOLDEREN, ikke af en hylde. Plukket flyttede
         godset dertil; afsendelsen tager det ud af huset. */
      fraCarrierId: ordre.afsendCarrierId,
      tilCarrierId: null,
      batch: l.batch,
      serienummer: l.serienummer,
      reference: ordreId,
      note: null,
      tidspunktMs: nu,
      oprettetAf: uid
    };
    const bn = `beholdning/${beholdningsNoegle(ordre.afsendCarrierId, l.vareId, l.batch)}`;
    opdatering[`${bn}/carrierId`] = ordre.afsendCarrierId;
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

  const carrierId = kortStreng(d.carrierId, 60);
  const vareId = kortStreng(d.vareId, 60);
  const batch = kortStreng(d.batch, 40);
  const taeltAntal = Number(d.taeltAntal);
  const aarsag = kortStreng(d.aarsag, 30);
  const note = kortStreng(d.note, 300);

  if (!carrierId) throw new HttpsError("invalid-argument", "carrierId mangler.");
  if (!vareId) throw new HttpsError("invalid-argument", "vareId mangler.");

  /* ⚠ DER TÆLLES I EN BEHOLDER (etape 12). En optælling af hylden ville
     skulle summere alt hvad der stod på den, og så kunne en afvigelse ikke
     henføres til den beholder hvor den opstod. */
  const [vare, carrier] = await Promise.all([
    rod.child(`varer/${vareId}`).once("value").then((s) => s.val()),
    rod.child(`carriers/${carrierId}`).once("value").then((s) => s.val()),
  ]);
  if (!vare) throw new HttpsError("not-found", `Varen ${vareId} findes ikke.`);
  if (!carrier) throw new HttpsError("not-found", `Beholderen ${carrierId} findes ikke.`);

  /* ⚠ HER LÆSES FORVENTNINGEN. Se hovedet. */
  const noegle = beholdningsNoegle(carrierId, vareId, batch);
  const snap = await rod.child(`beholdning/${noegle}`).once("value");
  const forventet = snap.exists() ? (snap.val()?.antal ?? 0) : 0;

  const fejl = valideOptaelling(
    { carrierId, vareId, batch, taeltAntal, aarsag, note, forventet }, { vare });
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
      fraCarrierId: null,
      tilCarrierId: carrierId,
      batch: batch || null,
      serienummer: null,
      /* Referencen binder bevægelsen til optællingsposten, så en rettelse i
         lageret altid kan spores til den måling der udløste den. */
      reference: optId,
      note: note || null,
      tidspunktMs: nu,
      oprettetAf: uid
    },
    [`optaellinger/${optId}`]: {
      carrierId, vareId,
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
      oprettetAf: uid
    },
    [`beholdning/${noegle}/carrierId`]: carrierId,
    [`beholdning/${noegle}/vareId`]: vareId,
    [`beholdning/${noegle}/batch`]: batch || UDEN_BATCH,
    [`beholdning/${noegle}/antal`]: taeltAntal,
    [`beholdning/${noegle}/senestMs`]: nu
  };

  await rod.update(opdatering);

  await logBevaegelse(tenantId, uid, AUDIT.aendre, optId,
    { antal: forventet }, { antal: taeltAntal, aarsag: aarsag || null },
    afvigelse === 0
      ? `optaelling uden afvigelse i ${carrierId}`
      : `AFVIGELSE ${afvigelse > 0 ? "+" : ""}${afvigelse} i ${carrierId} (${aarsag})`);

  return { ok: true, id: optId, forventet, taeltAntal, afvigelse };
});

/* ══════════════════════════════════════════════════════════════════════════
   FAKTURAGRUNDLAGET — den eneste vej ind. Beslutning 25.
   ══════════════════════════════════════════════════════════════════════════

   ⚠ `grundlag` ER .write: false FOR ALLE, OGSÅ ADMIN. Tre ting kan ikke
   håndhæves af en klient:

     1. NUMMERET kommer fra en counter i en transaction (beslutning 8).
        En optælling af eksisterende poster ville give to grundlag samme
        nummer, den dag to mennesker trykker i samme sekund.
     2. TILSTANDSSKIFTET følger kanGodkende(): en åben etape spærrer, en linje
        uden momssats spærrer eksporten, et erstattet grundlag kan ikke
        godkendes igen. Ligger tjekket i skærmen, kan en direkte skrivning gå
        udenom — og så er det dekoration.
     3. ET LÅST GRUNDLAG MÅ ALDRIG ÆNDRES. Det er eksporteret; tallet findes
        et sted vi ikke kontrollerer, og to sandheder er værre end én forkert.

   ⚠ SERVEREN PRØVER MOD DEN SAMME FIL SOM SKÆRMEN. `grundlag.js` og
   `booking-state.js` er kopieret til `functions/delt/`, så kanGodkende(),
   kanEksportere() og nummerformatet er de SAMME funktioner begge steder.
   Skrev serveren sin egen afskrift, ville skærmen sige ja og serveren nej —
   og et regnskabsdokument er det værste sted at have to meninger.

   ⚠ ET GRUNDLAG SLETTES ALDRIG. Der er ingen handling der fjerner et; en
   rettelse er et NYT grundlag der henviser til det gamle (erstat()), og
   referencen går begge veje, så det gamle holder op med at tælle med.
   ══════════════════════════════════════════════════════════════════════════ */

async function kraevGrundlag(req, perm) {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const perms = auth.token?.perms;
  if (typeof perms !== "string" || !perms.includes(`|${perm}|`)) {
    throw new HttpsError("permission-denied", `Kræver ${perm}.`);
  }

  const db = getDatabase();
  /* ⚠ ADMIN-SDK'ET GÅR UDEN OM REGLERNE, og reglerne er det eneste sted
     abonnementsspærringen ellers står. Uden linjen her var funktionen en åben
     dør rundt om den. Der er ingen modulklausul på `grundlag`: noden røres af
     booking, warehouse og økonomi, og en klausul på ét af dem ville spærre de
     to andre. */
  const ab = await db.ref(`tenants/${tenantId}/abonnement/status`).once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  return { uid: auth.uid, tenantId, db };
}

/** Grundlaget, eller en fejl der siger hvilket der manglede. */
async function hentGrundlag(rod, id) {
  if (!id) throw new HttpsError("invalid-argument", "id mangler.");
  const g = (await rod.child(`grundlag/${id}`).once("value")).val();
  if (!g) throw new HttpsError("not-found", `Grundlaget ${id} findes ikke.`);
  /* ⚠ OVERSÆTTELSEN ER fraDb() I DEN DELTE FIL, ikke en afskrift her. RTDB
     har ingen arrays; domænet regner med arrays. Den stod som en afskrift på
     dette sted, og da Fakturering-skærmen begyndte at læse noden, manglede
     den samme oversættelse i klienten — den samme kendsgerning to steder,
     hvor det ene sted ikke fandtes endnu. */
  return fraDb(g, id);
}

/** Linjer fra basen/klienten → den form grundlag.js validerer. */
function tilLinjer(raa) {
  return Object.values(raa || {}).map((l, i) => ({
    id: kortStreng(l.id, 60) || `l${i + 1}`,
    art: kortStreng(l.art, 20),
    tekst: kortStreng(l.tekst, 200) || null,
    antal: Number(l.antal),
    satsOere: Number(l.satsOere),
    enhed: kortStreng(l.enhed, 20) || null,
    /* ⚠ MOMSSATSEN GÆTTES IKKE. Mangler den, bliver den ved med at mangle —
       og eksporten er spærret indtil en bogholder har svaret. */
    momssats: Number.isFinite(Number(l.momssats)) ? Number(l.momssats) : null,
    kilde: l.kilde?.type && l.kilde?.id
      ? { type: kortStreng(l.kilde.type, 20), id: kortStreng(l.kilde.id, 60) }
      : null
  }));
}

const somNode = (linjer) =>
  Object.fromEntries(linjer.map((l) => {
    const { id, ...resten } = l;
    /* null-felter skrives ikke: reglerne afviser en type de ikke kender, og
       en tom streng er ikke det samme som "ikke oplyst". */
    const ud = {};
    for (const [k, v] of Object.entries(resten)) if (v != null) ud[k] = v;
    return [id, ud];
  }));

export const grundlagskriv = onCall({ region: REGION }, async (req) => {
  const d = req.data || {};
  const handling = kortStreng(d.handling, 20);

  /* ---- OPRET ---------------------------------------------------------- */
  if (handling === "opret") {
    const { uid, tenantId, db } = await kraevGrundlag(req, PERM.grundlagSkriv);
    const rod = db.ref(`tenants/${tenantId}`);

    const kundeId = kortStreng(d.kundeId, 60);
    if (!kundeId) throw new HttpsError("invalid-argument", "kundeId mangler.");
    if (!(await rod.child(`kunder/${kundeId}`).once("value")).exists()) {
      throw new HttpsError("not-found", `Kunden ${kundeId} findes ikke.`);
    }

    const linjer = tilLinjer(d.linjer);
    if (!linjer.length) {
      throw new HttpsError("invalid-argument", "Et grundlag uden linjer kan ikke oprettes.");
    }
    /* ⚠ SAMME validerLinje() SOM SKÆRMEN. Se noten i hovedet. */
    for (const l of linjer) {
      const fejl = validerLinje(l);
      if (fejl.length) {
        throw new HttpsError("invalid-argument", `${l.tekst || l.id}: ${fejl[0]}`);
      }
    }

    /* ⚠ ENTEN ET FORLØB ELLER EN PERIODE. En tur faktureres pr. forløb; en
       lagerafregning gør en periode op. byggGrundlag() afviser begge dele og
       ingen af delene — se noten der. */
    const periode = Number.isFinite(Number(d.periodeFra)) && Number.isFinite(Number(d.periodeTil))
      ? { fra: Number(d.periodeFra), til: Number(d.periodeTil) }
      : null;
    const post = byggGrundlag({
      bookingId: kortStreng(d.bookingId, 60) || null,
      periode,
      kundeId,
      division: kortStreng(d.division, 10) || "faelles",
      linjer,
      udarbejdetAf: uid
    });

    /* ⚠ NUMMERET FØRST, OG I EN TRANSACTION. To mennesker der trykker i samme
       sekund, skal få hvert sit — en optælling af eksisterende poster ville
       give dem det samme. */
    const nummer = await naesteGrundlagsnummer(db, (sti) => `tenants/${tenantId}/${sti}`);
    const id = rod.child("grundlag").push().key;

    /* null-felter skrives ikke: reglerne kender ikke typen, og "ikke
       oplyst" er ikke det samme som en tom værdi. */
    const uden = Object.fromEntries(
      Object.entries(post).filter(([, v]) => v != null && !Array.isArray(v)));
    await rod.child(`grundlag/${id}`).set({
      ...uden,
      nummer,
      linjer: somNode(post.linjer),
      historik: Object.fromEntries((post.historik || []).map((h, i) => [`h${i}`, h]))
    });

    await logGrundlag(tenantId, uid, AUDIT.opret, id, null,
      { tilstand: post.tilstand, kundeId, antal: linjer.length },
      `grundlag ${nummer} oprettet med ${linjer.length} linjer`);

    return { ok: true, id, nummer };
  }

  /* ---- GODKEND -------------------------------------------------------- */
  if (handling === "godkend") {
    const { uid, tenantId, db } = await kraevGrundlag(req, PERM.grundlagGodkend);
    const rod = db.ref(`tenants/${tenantId}`);
    const id = kortStreng(d.id, 60);
    const g = await hentGrundlag(rod, id);

    /* ⚠ ETAPERNE LÆSES AF SERVEREN, ikke sendt med. Kunne klienten oplyse
       dem, kunne et grundlag godkendes ved at fortie den åbne etape — og det
       er præcis den kontrol der spærrer. */
    const alle = (await rod.child("etaper").once("value")).val() || {};
    const etaper = Object.entries(alle).map(([eid, e]) => ({ id: eid, ...e }));

    const tjek = kanGodkende(g, { etaper, bruger: uid });
    if (!tjek.ok) throw new HttpsError("failed-precondition", tjek.aarsager[0]);

    const aendring = godkend(g, { bruger: uid, etaper });
    await rod.child(`grundlag/${id}`).update({
      tilstand: aendring.tilstand,
      godkendtAf: aendring.godkendtAf,
      godkendtMs: aendring.godkendtMs,
      historik: Object.fromEntries(aendring.historik.map((h, i) => [`h${i}`, h]))
    });

    await logGrundlag(tenantId, uid, AUDIT.tilstandsskift, id,
      { tilstand: g.tilstand }, { tilstand: "godkendt" },
      `grundlag ${g.nummer} godkendt`);

    return { ok: true, id, tilstand: "godkendt" };
  }

  /* ---- LÅS ------------------------------------------------------------ */
  if (handling === "laas") {
    const { uid, tenantId, db } = await kraevGrundlag(req, PERM.grundlagGodkend);
    const rod = db.ref(`tenants/${tenantId}`);
    const id = kortStreng(d.id, 60);
    const reference = kortStreng(d.reference, 120);
    if (!reference) {
      /* ⚠ EN LÅSNING UDEN REFERENCE ER EN PÅSTAND. Referencen er beviset på
         at grundlaget faktisk ER eksporteret — uden den kan ingen finde
         bilaget igen i regnskabet. */
      throw new HttpsError("invalid-argument",
        "En låsning kræver en eksportreference — hvor ligger bilaget?");
    }
    const g = await hentGrundlag(rod, id);

    /* ⚠ kanLaase(), IKKE kanEksportere(). Et laast grundlag maa gerne
       eksporteres igen — filen kan vaere gaaet tabt i den anden ende — men
       det maa ikke laases igen: saa ville eksportReference og laastMs blive
       overskrevet, og den foerste eksport forsvinde uden spor. Med det
       forkerte tjek naaede kaldet frem til laas(), som kaster en raa Error —
       og den kom ud som "INTERNAL". */
    const tjek = kanLaase(g);
    if (!tjek.ok) throw new HttpsError("failed-precondition", tjek.aarsager[0]);

    const aendring = laas(g, { bruger: uid, reference });
    await rod.child(`grundlag/${id}`).update({
      tilstand: aendring.tilstand,
      laastMs: aendring.laastMs,
      eksportReference: aendring.eksportReference,
      historik: Object.fromEntries(aendring.historik.map((h, i) => [`h${i}`, h]))
    });

    await logGrundlag(tenantId, uid, AUDIT.tilstandsskift, id,
      { tilstand: g.tilstand }, { tilstand: "laast" },
      `grundlag ${g.nummer} laast mod ${reference}`);

    return { ok: true, id, tilstand: "laast" };
  }

  throw new HttpsError("invalid-argument",
    `Ukendt handling: "${handling}". Kendte: opret, godkend, laas.`);
});

async function logGrundlag(tenantId, uid, handling, id, foer, efter, note) {
  const d = diff(foer, efter);
  const nu = new Date();
  /* ⚠ REGNSKAB, IKKE DRIFT. Klassen afgør retention, og et fakturagrundlag
     hører sammen med fakturaerne — se klasseFor() i audit-regler.js. */
  await getDatabase()
    .ref(`audit/${tenantId}/regnskab/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt: "grundlag", objektId: id,
      klasse: "regnskab",
      aendrede: d.aendrede, foer: d.foer, efter: d.efter,
      note: note ?? null
    });
}

/** Sporet fra et etapeskift.
 *
 * ⚠ KLASSEN UDLEDES, DEN GÆTTES IKKE HER. `klasseFor()` i audit-regler.js
 * kender `etaper` som et REGNSKABSOBJEKT — en etape bliver til en linje på et
 * fakturagrundlag, og sporet skal leve lige så længe som den faktura. Skrev
 * funktionen sin egen klasse, ville halvdelen af en fakturas historik have en
 * anden levetid end den anden.
 *
 * ⚠ OG EN AFVIST DISPONERING ER EN SIKKERHEDSHÆNDELSE. `adgangNaegtet` står
 * på SIKKERHEDSHANDLINGER og lander derfor i en anden partition end
 * tilstandsskiftet — det er også `klasseFor()`s afgørelse, ikke vores. */
async function logEtape(tenantId, uid, handling, id, foer, efter, note) {
  const d = diff(foer, efter);
  const klasse = klasseFor(handling, "etaper");
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${tenantId}/${klasse}/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt: "etaper", objektId: id,
      klasse,
      aendrede: d.aendrede, foer: d.foer, efter: d.efter,
      note: note ?? null
    });
}

/* ══════════════════════════════════════════════════════════════════════════
   ETAPESKIFT — DEN ENESTE VEJ IND I `etaper` OG `reservationer`

   Begge noder er `.write: false` for ALLE, også admin, og det er ikke en
   manglende rettighed. Tre ting kan ikke håndhæves af en klient:

     1. TILSTANDSSKIFTET følger ETAPE_OVERGANGE i booking-state.js, og
        beslutning 5 siger at disponenten ikke må godkende sit eget forslag.
        Et rolletjek i en browser kan omgås.

     2. RESERVATIONEN SKAL SKRIVES SAMMEN MED SKIFTET. I prototypen stod der
        DE-QR 777 med afgang 28/6 i reservationstabellen og DE-KL 404 den 24/6
        i timelinen — fordi svaret og reservationen var to poster. Der må ikke
        være to steder at være uenige. Her er det ÉN `rod.update()`.

     3. DE FEM DISPONERINGSTJEK SKAL BLOKERE. De har været bygget og testet i
        månedsvis uden at noget kaldte dem; siden viste Disponering dem. At
        VISE en spærring er ikke at håndhæve den — ligger kontrollen i
        skærmen, går et direkte kald uden om den.

   ⚠ OG TJEKKENE ER DE SAMME FUNKTIONER SOM SKÆRMEN BRUGER.
   `tjekDisponering()` i den delte `disponering.js` er ét sted, og serveren
   afviser med NØJAGTIG den sætning disponenten fik at se. To formuleringer af
   den samme spærring ville være to forklaringer på én ting.

   ⚠ TO DISPONENTER KAN RAMME SAMME SEKUND. Konflikttjekket læser
   reservationerne, og skrivningen sker bagefter — vinduet kan ikke lukkes med
   en transaktion, fordi flere ressourcer skal ændres sammen. Det er samme
   afvejning som i `bevaegelseskriv`: garantér det der ikke må gå galt (ingen
   reservation uden etape, ingen etape uden reservation), og gør resten
   SYNLIGT. Funktionen læser konflikterne igen bagefter og logger en auditpost
   hvis der opstod en. En dobbeltbooking er noget en disponent skal se — ikke
   noget der skal rettes i stilhed.
   ══════════════════════════════════════════════════════════════════════════ */

/** Etapens noder, eller en fejl der siger hvad der manglede. */
async function hentEtape(rod, id) {
  if (!id) throw new HttpsError("invalid-argument", "etapeId mangler.");
  const e = (await rod.child(`etaper/${id}`).once("value")).val();
  if (!e) throw new HttpsError("not-found", `Etapen ${id} findes ikke.`);
  return { ...e, id };
}

/**
 * Reservationerne for de ressourcer etapen rører, i den form
 * `tjekDisponering()` slår op i: { <type>: { <id>: [poster] } }.
 *
 * ⚠ KUN DE RESSOURCER DER ER I SPIL. Et opslag på hele `reservationer` ville
 * hente hver eneste bil og medarbejder i huset ned for at bruge to af dem.
 */
async function hentReservationer(rod, poster) {
  const ud = {};
  for (const r of poster) {
    ud[r.ressourceType] ??= {};
    if (ud[r.ressourceType][r.ressourceId]) continue;
    const snap = await rod
      .child(`reservationer/${r.ressourceType}/${r.ressourceId}`)
      .once("value");
    ud[r.ressourceType][r.ressourceId] =
      Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v }));
  }
  return ud;
}

/**
 * De fem disponeringstjek for en etape SOM DEN VILLE SE UD med et forslag.
 *
 * ⚠ SAMME OPSLAG TIL BEGGE KALDERE. `etapeskift` kører dem naar forslaget
 * GODKENDES, `forslagskriv` naar det LAVES — og de skal svare det samme, med
 * den samme saetning. Laa opslagene to steder, ville "alt de fem tjek skal
 * bruge" kunne drive: en glemt kompetenceliste her og en fuld dér.
 *
 * ⚠ OG KOERE-HVILETID GAELDER PERSONEN, IKKE TUREN. Alle chaufføerens etaper
 * skal med, ellers kan han faa sin fjerde tur i traek fordi hver enkelt saa
 * lovlig ud for sig.
 */
async function spaerringerFor(rod, etape, paaEtapen) {
  const ider = enhedsIder(paaEtapen);
  const enheder = [];
  for (const id of ider) {
    const k = (await rod.child(`koeretoejer/${id}`).once("value")).val();
    if (!k) throw new HttpsError("not-found", `Køretøjet ${id} findes ikke.`);
    enheder.push({ ...k, id });
  }
  const p = (await rod.child(`personale/${paaEtapen.personId}`).once("value")).val();
  if (!p) throw new HttpsError("not-found", `Medarbejderen ${paaEtapen.personId} findes ikke.`);
  const person = { ...p, id: paaEtapen.personId };

  const alleKomp = (await rod.child("kompetencer").once("value")).val() || {};
  const kompetencer = Object.entries(alleKomp)
    .map(([id, v]) => ({ id, ...v }))
    .filter((c) => c.personId === person.id);

  const alleEtaper = (await rod.child("etaper").once("value")).val() || {};
  const straekninger = Object.entries(alleEtaper)
    .map(([id, v]) => ({ id, ...v }))
    .filter((x) => x.personId === person.id && x.id !== etape.id)
    .map(straekningFraEtape)
    .concat([straekningFraEtape(paaEtapen)]);

  const nye = reservationerFraEtape(paaEtapen);
  const reservationer = await hentReservationer(rod, nye);

  const raekker = tjekDisponering({
    reservationerForEtapen: nye,
    enheder, person, kompetencer, reservationer, straekninger,
    gods: etape.maengde || {}
  });
  const spaerringer = raekker.filter((r) => r.tone === "bad");

  /* ⚠ SERVERENS AFVISNING ER SKAERMENS EGEN SAETNING. Se hovedet i
     disponering.js: to formuleringer af den samme spaerring ville vaere to
     forklaringer paa én ting. */
  const fejl = spaerringer.length
    ? new HttpsError("failed-precondition",
        `${spaerringer[0].tjek}: ${spaerringer[0].tekst}` +
        (spaerringer.length > 1 ? ` (+${spaerringer.length - 1} mere)` : ""))
    : null;

  return { spaerringer, raekker, nye, fejl };
}

export const etapeskift = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";
  const rolle = kortStreng(auth.token?.rolle, 40) || null;

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  /* ⚠ ADMIN-SDK'ET GÅR UDEN OM REGLERNE, og reglerne er det eneste sted
     abonnements- og modulspærringen ellers står. Uden de to linjer var
     funktionen en åben dør rundt om begge. */
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child("booking").val() !== true) {
    throw new HttpsError("permission-denied", "Booking-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const etapeId = kortStreng(d.etapeId, 60);
  const tilTilstand = kortStreng(d.tilTilstand, 30);
  const begrundelse = kortStreng(d.begrundelse, 300) || null;
  const valgtForslagId = kortStreng(d.valgtForslagId, 60) || null;
  const senestMs = Number.isFinite(Number(d.senestMs)) ? Number(d.senestMs) : null;

  const etape = await hentEtape(rod, etapeId);

  /* ---- Må brugeren det, og må etapen? -------------------------------- */
  /* ⚠ SAMME kanSkifteEtape() SOM SKÆRMEN. Den bærer beslutning 5 (disponenten
     godkender ikke sit eget forslag) som en PERMISSION frem for en rolleliste,
     og den kræver en begrundelse hvor overgangen kræver en. */
  const tjek = kanSkifteEtape(
    { ...etape, valgtForslagId: valgtForslagId ?? etape.valgtForslagId },
    tilTilstand, perms, { begrundelse });
  if (!tjek.ok) throw new HttpsError("failed-precondition", tjek.aarsag);

  const opdatering = {};
  let spaerringer = [];

  /* ---- Går den til RESERVERET, bindes ressourcerne ------------------- */
  if (tilTilstand === "reserveret") {
    /* Forslaget siger HVEM og HVAD. Etapen bærer det først når skiftet er
       skrevet — indtil da er forslaget det eneste sted det står. */
    /* ⚠ FORSLAGET SLÅS OP PÅ SIN NØGLE, IKKE PÅ ET id INDE I OBJEKTET.
       Her stod `.find((f) => f.id === …)`, og det virkede kun fordi
       demo-sættet bar sit id INDE i posten — en form regelfilens
       `$andet: false` afviser, og som reglens krav om at `valgtForslagId`
       peger på en nøgle der FINDES, aldrig kunne opfylde. Serveren og reglen
       var altså uenige om hvor forslagets identitet bor. Se beslutning 58. */
    const forslagId = valgtForslagId ?? etape.valgtForslagId;
    const forslag = (etape.forslag || {})[forslagId];
    if (!forslag) {
      throw new HttpsError("failed-precondition",
        "Det valgte forslag findes ikke på etapen.");
    }
    /* ⚠ ET TRUKKET FORSLAG KAN IKKE GODKENDES — beslutning 59. Reglen kan
       ikke hindre at `valgtForslagId` peger paa et: en .validate ser eet felt
       ad gangen. Uden det her tjek kunne en godkendelse binde en bil til et
       forslag disponenten havde taget tilbage. */
    if (erTrukket(forslag)) {
      throw new HttpsError("failed-precondition",
        "Forslaget er trukket tilbage og kan ikke godkendes. Bed disponenten om et nyt.");
    }

    const paaEtapen = {
      ...etape,
      koeretoejIder: forslag.koeretoejIder || null,
      personId: forslag.personId || null
    };
    const ider = enhedsIder(paaEtapen);
    if (!ider.length || !paaEtapen.personId) {
      throw new HttpsError("failed-precondition",
        "Forslaget mangler enten køretøj eller chauffør.");
    }

    /* ---- DE FEM TJEK, OG DE BLOKERER ------------------------------- */
    /* ⚠ ÉT STED. `forslagskriv` kører nøjagtig de samme tjek når forslaget
       LAVES, så disponenten får svaret med det samme frem for et nej hos
       koordinatoren. To kopier af opslagene ville være to steder at være
       uenige om hvad "alt de fem tjek skal bruge" betyder. */
    const tjek = await spaerringerFor(rod, etape, paaEtapen);
    spaerringer = tjek.spaerringer;
    if (spaerringer.length) throw tjek.fejl;
    const nye = tjek.nye;

    /* ---- Etapen får sine ressourcer, og de bindes ------------------ */
    opdatering[`etaper/${etapeId}/koeretoejIder`] =
      Object.fromEntries(ider.map((id) => [id, true]));
    opdatering[`etaper/${etapeId}/personId`] = paaEtapen.personId;

    for (const [i, r] of nye.entries()) {
      /* Reservationens id er UDLEDT af etapen, ikke en push-nøgle. Så kan den
         samme etape ikke lægge to reservationer på den samme ressource, hvis
         funktionen kaldes to gange — og frigivelsen ved et senere skifte kan
         finde dem uden at søge. */
      const resId = `res-${etapeId}-${i}`;
      opdatering[`reservationer/${r.ressourceType}/${r.ressourceId}/${resId}`] = {
        fra: r.fra, til: r.til,
        kilde: r.kilde,
        oprettetAf: uid,
        oprettetMs: Date.now()
      };
    }
  }

  /* ---- Forlader den RESERVERET, frigives ressourcerne --------------- */
  /* ⚠ EN ANNULLERET TUR SKAL GIVE BILEN FRI IGEN. Blev reservationen
     stående, ville bilen se optaget ud resten af ugen — og den næste
     disponent ville lede efter en tur der ikke findes. */
  if (etape.tilstand === "reserveret" && tilTilstand !== "reserveret") {
    for (const [i, r] of reservationerFraEtape(etape).entries()) {
      opdatering[`reservationer/${r.ressourceType}/${r.ressourceId}/res-${etapeId}-${i}`] = null;
    }
    opdatering[`etaper/${etapeId}/koeretoejIder`] = null;
    opdatering[`etaper/${etapeId}/personId`] = null;
  }

  /* ---- Selve skiftet ------------------------------------------------ */
  const skifte = byggEtapeSkifte(etape, tilTilstand, {
    rolle, bruger: uid, begrundelse, valgtForslagId, senestMs
  });
  for (const [felt, vaerdi] of Object.entries(skifte)) {
    opdatering[`etaper/${etapeId}/${felt}`] = vaerdi;
  }

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ BOOKINGENS TILSTAND ER AFLEDT AF ETAPERNE — OG SKRIVES HER.

     `forloebstilstand()` siger det selv: feltet lagres denormaliseret på
     bookingen, men skrives af PRÆCIS ÉN ting — den funktion der skifter en
     etapetilstand, i SAMME transaktion. Der er derfor ingen `bookingskift`
     at bygge; der er den her blok.

     Uden den ville bookingen stå som `afventerKoord` mens dens eneste etape
     var annulleret. Det er `bemanding.ledig` i en tredje forklædning: et
     gemt afledt tal der driver fra sit grundlag, hvor kun det ene sted
     bliver rettet. Og det driver med det samme — allerede ved det første
     skifte.

     ⚠ REGLEN ER "ET FORLØB ER FØRST UDFØRT NÅR HVER ENESTE ETAPE ER DET".
     Er én etape stadig åben, er forløbet `delvist` — ikke færdigt, og ikke
     usynligt. Derfor læses ALLE bookingens etaper, ikke kun den der skiftes.

     ⚠ OG DEN NYE TILSTAND LÆGGES OVEN PÅ FØR DER REGNES. Læste vi bare
     noden, ville vi regne på den gamle tilstand og skrive et forløb der var
     ét skridt bagud. */
  if (etape.bookingId) {
    const alle = (await rod.child("etaper").once("value")).val() || {};
    const mine = Object.entries(alle)
      .map(([id, v]) => ({ id, ...v }))
      .filter((x) => x.bookingId === etape.bookingId)
      .map((x) => (x.id === etapeId ? { ...x, tilstand: tilTilstand } : x));

    const forloeb = forloebstilstand(mine);
    opdatering[`bookinger/${etape.bookingId}/tilstand`] = forloeb.tilstand;
    /* ⚠ harAabneEtaper SKRIVES MED. `kanGodkende()` på et fakturagrundlag
       spørger om den, og et fakturagrundlag må ikke kunne godkendes mens en
       etape stadig venter på en tur. Feltet står på LOGBARE_FELTER netop
       fordi det afgør noget. */
    opdatering[`bookinger/${etape.bookingId}/harAabneEtaper`] = forloeb.harAabneEtaper;
    opdatering[`bookinger/${etape.bookingId}/sidstAendretMs`] = Date.now();
  }

  /* ⚠ ÉN SKRIVNING. Etapen, dens ressourcer, reservationerne OG bookingens
     afledte tilstand lander sammen eller slet ikke. To kald ville være to
     udfald — og prototypens DE-QR 777 mod DE-KL 404 var netop to poster der
     kunne blive uenige. */
  await rod.update(opdatering);

  /* ---- Opstod der en konflikt i vinduet? ---------------------------- */
  /* ⚠ DET KAN SKE, og så skal det være LARMENDE frem for tavst. Se hovedet:
     vinduet mellem tjekket og skrivningen kan ikke lukkes, når flere
     ressourcer skal bindes sammen. En dobbeltbooking er noget en disponent
     skal se. */
  if (tilTilstand === "reserveret") {
    const nye = reservationerFraEtape({
      ...etape,
      koeretoejIder: opdatering[`etaper/${etapeId}/koeretoejIder`],
      personId: opdatering[`etaper/${etapeId}/personId`]
    });
    const efter = await hentReservationer(rod, nye);
    const igen = tjekDisponering({
      reservationerForEtapen: nye, enheder: [], reservationer: efter
    }).filter((r) => r.tone === "bad");
    if (igen.length) {
      await logEtape(tenantId, uid, AUDIT.adgangNaegtet, etapeId,
        null, { tilstand: tilTilstand },
        `konflikt opstod efter skrivning: ${igen[0].tekst}`);
    }
  }

  await logEtape(tenantId, uid, AUDIT.tilstandsskift, etapeId,
    { tilstand: etape.tilstand }, { tilstand: tilTilstand },
    `etape ${etapeId} ${etape.tilstand} -> ${tilTilstand}`);

  return { ok: true, id: etapeId, tilstand: tilTilstand };
});

/* ══════════════════════════════════════════════════════════════════════════
   AUDITOPRYDNING — OG HVORFOR DEN IKKE SLETTER NOGET ENDNU

   Retention er designet ind i STIEN: audit/<tenantId>/<klasse>/<år>/<måned>/.
   Klassen ligger i stien netop for at en oprydning bliver ÉN operation pr.
   partition frem for en scanning af hver post. Mekanismen er derfor triviel;
   det svære er tallet.

   ⚠ OG TALLET ER IKKE AFGJORT. `RETENTION_MAANEDER` står på 24 måneder for
   alle tre klasser, med noten at bogføringsloven trækker mod fem år og GDPR
   mod kortere. Et job der slettede på det tal, ville fjerne revisionsspor på
   en værdi ingen jurist har sagt god for — og et slettet auditspor kan ikke
   skaffes igen.

   Derfor NÆGTER den frem for at gætte, præcis som eksporten nægter uden en
   momssats. `retentionErAfgjort()` er et selvstændigt felt fra tallet, og
   `forfaldnePartitioner()` svarer `maaSlettes: false` så længe det er falsk.

   ⚠ MEN DEN TIER IKKE. Den skriver hvad der VILLE blive slettet til
   `udbyder/retention/<dato>`. Et spørgsmål ingen kan se, bliver ikke besvaret
   — og en oprydning der bare var udeladt, ville ingen opdage manglede. Nu
   vokser tallet i rapporten indtil nogen svarer.

   ⚠ RAPPORTEN BÆRER INGEN POSTER. Kun tenant, klasse, år, måned og antal.
   En auditpost der blev kopieret ud i en rapport under `udbyder/`, ville have
   forladt kundens tenant — og det er den grænse beslutning 24 holder.
   ══════════════════════════════════════════════════════════════════════════ */

/** Partitionerne under én tenant, som stien har dem. Læser ingen poster. */
async function auditpartitioner(db, tenantId) {
  const ud = [];
  const rod = (await db.ref(`audit/${tenantId}`).once("value")).val() || {};
  for (const [klasse, aarene] of Object.entries(rod)) {
    for (const [aar, maanederne] of Object.entries(aarene || {})) {
      for (const [maaned, poster] of Object.entries(maanederne || {})) {
        ud.push({ klasse, aar, maaned, antal: Object.keys(poster || {}).length });
      }
    }
  }
  return ud;
}

/**
 * Auditposten for en driftsopgave.
 *
 * ⚠ DEN FANDTES IKKE, OG DET VAR ET HUL. `opgaveplanlaeg` skrev en opgave OG
 * en reservation uden at efterlade et spor, mens hver eneste anden
 * skrivefunktion i filen logger. Hullet blev synligt da flytningen kom til:
 * havde kun DEN logget, kunne man se at en opgave var flyttet, men ikke at den
 * nogensinde var oprettet — og en log med huller i er svær at stole paa
 * netop dér hvor man har brug for den.
 */
async function logOpgave(tenantId, uid, handling, id, foer, efter, note) {
  const d = diff(foer, efter);
  const klasse = klasseFor(handling, "opgaver");
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${tenantId}/${klasse}/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt: "opgaver", objektId: id,
      klasse,
      aendrede: d.aendrede, foer: d.foer, efter: d.efter,
      note: note ?? null
    });
}

/* ══════════════════════════════════════════════════════════════════════════
   SKRIV ET FORSLAG PAA EN ETAPE — beslutning 58

   ⚠ HVORFOR DEN FINDES: DER VAR INGEN VEJ TIL AT LAVE ET FORSLAG.
   `etapeskift` LAESER `etape.forslag` naar koordinatoren godkender, men
   skriver det aldrig, og `etaper` er `.write: false`. Overgangen
   `afventerPlan → afventerKoord` kraever `kraeverForslag` — altsaa en
   forudsaetning ingenting kunne opfylde. Bookingflowet stoppede dér.

   ⚠ OG DEN ER SIN EGEN FUNKTION, IKKE ET LED I etapeskift.
   Et forslag er ikke et tilstandsskift: disponenten laver et, ser paa det,
   laver et til, og sender dem foerst naar han er faerdig. Skrev vi forslaget
   som en del af overgangen, kunne der kun laves EET ad gangen — og de 1-3
   forslag koordinatoren skal SAMMENLIGNE, ville vaere umulige.

   ⚠ ET FORSLAG SPAERRER INGENTING. Reservationen skrives foerst naar
   koordinatoren godkender. Skrev vi en her, ville tre forslag spaerre tre
   biler for én tur — og de to af dem for ingenting.

   ⚠ DE FEM TJEK KOERES ALLIGEVEL, med den SAMME `spaerringerFor()` som
   `etapeskift`. Ikke for at spaerre for evigt, men for at sige nej MED DET
   SAMME: et forslag koordinatoren ikke kan godkende, er et loefte til en
   kunde der ikke kan holdes. Godkendelsen proever igen, for der gaar tid
   imellem — og det er DER afgoerelsen falder.
   ══════════════════════════════════════════════════════════════════════════ */
export const forslagskriv = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  /* ⚠ booking.foreslaa — IKKE booking.godkend. Beslutning 5: disponenten
     laver forslagene og maa ikke godkende sit eget. To permissions er hele
     grunden til at der er to skridt. */
  if (!perms.includes("|booking.foreslaa|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke lave forslag. Det kræver booking.foreslaa.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child("booking").val() !== true) {
    throw new HttpsError("permission-denied", "Planning-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const etape = await hentEtape(rod, kortStreng(d.etapeId, 60));

  /* ⚠ TO HANDLINGER PAA EEN FUNKTION — som `kasseudlaanskriv`. De rører
     samme node med samme permission og samme forudsætninger, og en anden
     funktion ville betyde en anden kopi af tenant-, abonnements- og
     modultjekket ovenfor. Det er ikke et flag der aendrer HVAD posten er
     (som en art ville vaere) — det er hvad der sker med den. */
  const handling = kortStreng(d.handling, 20) || "opret";
  if (!["opret", "traek"].includes(handling)) {
    throw new HttpsError("invalid-argument", `Ukendt handling: ${handling}`);
  }

  if (handling === "traek") {
    const forslagId = kortStreng(d.forslagId, 60);
    /* ⚠ SKAERMENS EGEN FUNKTION. Samme saetning begge steder. */
    const maa = kanTraekkeForslag(etape, forslagId);
    if (!maa.ok) throw new HttpsError("failed-precondition", maa.aarsag);

    const bygget = traekOpdatering(etape.id, forslagId, etape, { uid, nu: Date.now() });
    await rod.update(bygget.opdatering);

    await logOpgave(tenantId, uid, AUDIT.tilstandsskift, etape.id, null,
      { forslagNr: (etape.forslag || {})[forslagId]?.nr ?? null },
      `forslag trukket tilbage paa etape ${etape.id}`);

    return { forslagId, trukket: true, aktive: aktiveForslag(etape).length - 1 };
  }

  const tal = (v) => (v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const ider = {};
  for (const id of Array.isArray(d.koeretoejIder) ? d.koeretoejIder : []) {
    const k = kortStreng(id, 60);
    if (k) ider[k] = true;
  }

  const forslag = {
    koeretoejIder: ider,
    personId: kortStreng(d.personId, 60),
    afhentningMs: tal(d.afhentningMs),
    leveringMs: tal(d.leveringMs),
    transitTimer: tal(d.transitTimer),
    estimatOere: tal(d.estimatOere),
    note: kortStreng(d.note, 300) || null,
  };

  /* ---- Formen: SKAERMENS EGEN VALIDERING ------------------------------ */
  const form = valideForslag(forslag, etape);
  if (!form.ok) {
    throw new HttpsError("invalid-argument", Object.values(form.fejl)[0]);
  }

  /* ---- De fem tjek — den SAMME funktion som ved godkendelsen ----------- */
  /* ⚠ ETAPEN SOM DEN VILLE SE UD MED FORSLAGET. Det er den kombination der
     skal holde — ikke etapen som den staar nu, hvor hverken enhed eller
     chauffoer er sat. Samme greb som `etapeskift` bruger paa vej til
     `reserveret`. */
  const paaEtapen = {
    ...etape,
    koeretoejIder: forslag.koeretoejIder,
    personId: forslag.personId,
    fra: forslag.afhentningMs,
    til: forslag.leveringMs,
  };
  const tjek = await spaerringerFor(rod, etape, paaEtapen);
  if (tjek.spaerringer.length) throw tjek.fejl;

  /* ---- EEN SKRIVNING --------------------------------------------------- */
  /* ⚠ DEN ROERER IKKE ETAPENS TILSTAND. Et forslag aendrer ikke hvor etapen
     staar; at sende forslagene til koordinatoren er et `etapeskift`. To
     beslutninger i eet kald ville vaere en beslutning ingen havde truffet. */
  const forslagId = rod.child(`etaper/${etape.id}/forslag`).push().key;
  const bygget = forslagOpdatering(etape.id, forslagId, forslag, etape);
  await rod.update(bygget.opdatering);

  await logOpgave(tenantId, uid, AUDIT.opret, etape.id, null,
    { forslagNr: bygget.post.nr, personId: forslag.personId },
    `forslag ${bygget.post.nr} paa etape ${etape.id}`);

  return { forslagId, nr: bygget.post.nr, aktive: aktiveForslag(etape).length + 1 };
});

/* ══════════════════════════════════════════════════════════════════════════
   OPRET EN BOOKING — beslutning 55

   ⚠ HVORFOR DEN ER SIN EGEN FUNKTION OG IKKE EN KLIENTSKRIVNING.
   `bookinger` og `etaper` er begge `.write: false`, og de skal skrives
   SAMMEN: en booking uden etaper er en foresporgsel ingen kan planlaegge, og
   en etape uden sin booking er en straekning der ikke hoerer til noget.
   Landede kun den ene halvdel, ville Bookingoversigten vise et forloeb hvis
   dele ikke findes. Det er samme grund som opgaven og dens reservation (45).

   ⚠ OG NUMMERET KAN KUN KOMME HERFRA. Beslutning 8: et nummer kommer fra en
   COUNTER i en transaction, aldrig fra en optaelling af eksisterende poster.
   To casehandlere der opretter i samme sekund, ville ellers faa samme nummer
   — og en optaelling ville dertil give et nyt nummer til den samme booking,
   hvis en gammel blev taget ud af drift. En klient kan ikke koere den
   transaction: `countere` er `.write: false`.

   ⚠ TILSTANDEN SAETTES IKKE — DEN REGNES. Beslutning 40: bookingens tilstand
   er AFLEDT af etaperne, og `bookingOpdatering()` kalder `forloebstilstand()`
   paa de etaper den selv skriver. En `tilstand` fra klienten ville vaere den
   anden vej til eet felt.

   ⚠ INGEN RESERVATION. En kladde-etape spaerrer ingenting: reservationen
   kommer naar et FORSLAG godkendes, og det er `etapeskift`s arbejde. Skrev vi
   en her, ville en foresporgsel spaerre en bil ingen havde disponeret.
   ══════════════════════════════════════════════════════════════════════════ */
export const bookingopret = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  /* ⚠ PERMISSIONEN, IKKE ROLLEN. `booking.opret` har casehandler — det er den
     rolle der tager imod foresporgslen — og admin. */
  if (!perms.includes("|booking.opret|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke oprette bookinger. Det kræver booking.opret.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child("booking").val() !== true) {
    throw new HttpsError("permission-denied", "Planning-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const tal = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);

  const post = {
    kundeId: kortStreng(d.kundeId, 60),
    division: kortStreng(d.division, 20),
    fraSted: kortStreng(d.fraSted, 120),
    tilSted: kortStreng(d.tilSted, 120),
    transporttype: kortStreng(d.transporttype, 40),
    rutepraeference: kortStreng(d.rutepraeference, 40) || null,
    afhentningFleks: kortStreng(d.afhentningFleks, 20),
    leveringFleks: kortStreng(d.leveringFleks, 20),
    onsketAfhentningMs: tal(d.onsketAfhentningMs),
    onsketLeveringMs: tal(d.onsketLeveringMs),
    omsaetningOere: tal(d.omsaetningOere),
    kundekrav: kortStreng(d.kundekrav, 500) || null,
    kundeRef: kortStreng(d.kundeRef, 60) || null,
    krav: Array.isArray(d.krav) ? d.krav.map((k) => kortStreng(k, 60)).filter(Boolean).slice(0, 20) : [],
  };

  /* ---- Formen: SKAERMENS EGEN VALIDERING ------------------------------ */
  const form = valideBooking(post);
  if (!form.ok) {
    throw new HttpsError("invalid-argument", Object.values(form.fejl)[0]);
  }

  /* ---- Findes kunden? -------------------------------------------------- */
  const kunde = (await rod.child(`kunder/${post.kundeId}`).once("value")).val();
  if (!kunde) throw new HttpsError("not-found", `Kunden ${post.kundeId} findes ikke.`);
  /* ⚠ EN INAKTIV KUNDE FAAR INGEN NY BOOKING. Posten bliver staaende —
     regnskabsdata hardslettes ikke — men et forloeb paa en kunde vi er holdt
     op med at koere for, er en fejl ingen opdager i en tabel. Samme tjek som
     opgaveplanlaeg laver paa en solgt enhed. */
  if (kunde.aktiv === false) {
    throw new HttpsError("failed-precondition",
      `${kunde.navn || post.kundeId} er ikke en aktiv kunde.`);
  }

  /* ---- Nummeret: en transaction, ikke en optaelling -------------------- */
  const nummer = await naesteBookingnummer(db, (sti) => `tenants/${tenantId}/${sti}`);

  /* ---- EEN SKRIVNING --------------------------------------------------- */
  const bookingId = rod.child("bookinger").push().key;
  const straekninger = [{ fraSted: post.fraSted, tilSted: post.tilSted }];
  const etapeIder = straekninger.map(() => rod.child("etaper").push().key);
  const nu = Date.now();

  let bygget;
  try {
    bygget = bookingOpdatering(bookingId, etapeIder, { ...post, straekninger }, { uid, nu, nummer });
  } catch (e) {
    throw new HttpsError("invalid-argument", e.message);
  }

  await rod.update(bygget.opdatering);

  await logOpgave(tenantId, uid, AUDIT.opret, bookingId, null,
    { nummer, kundeId: post.kundeId, division: post.division }, `booking ${nummer} oprettet`);

  return { bookingId, nummer, etapeIder };
});

/* ══════════════════════════════════════════════════════════════════════════
   PLANLAEG EN DRIFTSOPGAVE — opgaven OG dens reservation, i EEN update().

   ⚠ HVORFOR DEN FINDES, NAAR opgaver/ ER SKRIVBAR FRA KLIENTEN.
   Fordi `reservationer` er .write: false, og de to skal skrives SAMMEN.
   Landede kun opgaven, ville enheden have et vaerkstedsbesoeg uden at vaere
   spaerret — og saa ser den FRI ud i disponeringen, hvilket er vaerre end en
   spaerring man kan se. Landede kun reservationen, ville enheden vaere
   spaerret af ingenting. Dertil: to disponenter kan ramme samme sekund, og
   det kan et klientsidetjek ikke forhindre. Det staar i reserver().

   ⚠ DEN OVERSKRIVER IKKE — DEN AFVISER.
   Et vaerkstedsbesoeg har prioritet 40, den hoejeste, og KUNNE derfor slaa en
   booking. Men at annullere en booking betyder at skifte en ETAPETILSTAND med
   aarsag og historik, og det er `etapeskift`s arbejde. Gjorde vi det herfra,
   ville der vaere to veje ind i etapens tilstand — praecis den 'anden vej til
   eet felt' beslutning 40 lukkede, og en funktion der findes, bliver kaldt.
   Serveren svarer i stedet HVAD der spaerrer og hvornaar, saa disponenten kan
   flytte turen foerst.

   ⚠ INGEN MAIL. Mockuppens 'Send bekraeftelse til leverandoeren' er
   beslutning 20, fase 0: sager/ staar ikke i firebase.rules.json.
   ══════════════════════════════════════════════════════════════════════════ */
export const opgaveplanlaeg = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  /* ⚠ PERMISSIONEN, IKKE ROLLEN. Spoerg hvad handlingen kraever, ikke hvem
     brugeren er — CLAUDE.md. Reglerne paa opgaver/ kraever den samme. */
  if (!perms.includes("|opgaver.skriv|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke oprette driftsopgaver. Det kræver opgaver.skriv.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  /* ⚠ ADMIN-SDK'ET GAAR UDEN OM REGLERNE, og reglerne er det eneste sted
     abonnements- og modulspaerringen ellers staar. Uden de her blokke var
     funktionen en aaben doer rundt om begge. Samme linjer som etapeskift. */
  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child("flaade").val() !== true) {
    throw new HttpsError("permission-denied", "Fleet-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const post = {
    /* ⚠ ARTEN SAETTES HER, IKKE AF KLIENTEN. Driftskalenderen planlaegger
       vaerkstedsopgaver; facility har sin egen skaerm paa den SAMME node.
       Kom arten udefra, ville den ene formular kunne oprette den andens
       poster — og de to har ikke samme feltskema. */
    art: "vaerksted",
    koeretoejId: kortStreng(d.koeretoejId, 60),
    division: kortStreng(d.division, 20),
    arbejdstype: kortStreng(d.arbejdstype, 40),
    status: kortStreng(d.status, 40),
    beskrivelse: kortStreng(d.beskrivelse, 500),
    startMs: Number.isFinite(Number(d.startMs)) ? Number(d.startMs) : null,
    estimeretMin: Number.isFinite(Number(d.estimeretMin)) ? Number(d.estimeretMin) : null,
  };
  const leverandoerId = kortStreng(d.leverandoerId, 60);
  const prioritet = kortStreng(d.prioritet, 20);
  const sted = kortStreng(d.sted, 60);
  const personId = kortStreng(d.personId, 60);
  if (leverandoerId) post.leverandoerId = leverandoerId;
  if (prioritet) post.prioritet = prioritet;
  if (sted) post.sted = sted;
  if (personId) post.personId = personId;

  /* ---- Formen: SKAERMENS EGEN VALIDERING ------------------------------ */
  /* ⚠ SAMME FUNKTION, SAMME SAETNING. valideOpgaveplan() ligger i delt/, og
     formularen kalder den ogsaa. To formuleringer af een spaerring er to
     forklaringer paa een ting. */
  const form = valideOpgaveplan(post);
  if (!form.ok) {
    const foerste = Object.values(form.fejl)[0];
    throw new HttpsError("invalid-argument", foerste);
  }
  /* Nodens eget katalog ved siden af — den fanger felter formularen ikke har. */
  const mangler = opgaveMangler(post);
  if (mangler.length) {
    throw new HttpsError("invalid-argument",
      `Noden afviser posten: ${mangler.join(", ")}.`);
  }

  /* ---- Findes enheden, og kan den overhovedet bruges? ------------------ */
  const kt = (await rod.child(`koeretoejer/${post.koeretoejId}`).once("value")).val();
  if (!kt) throw new HttpsError("not-found", `Enheden ${post.koeretoejId} findes ikke.`);

  /* ⚠ EN SOLGT ELLER SKROTTET ENHED KAN IKKE FAA EN OPGAVE. Posten bliver
     staaende i flaaden — regnskabsdata hardslettes ikke — men den kan ikke
     komme paa vaerksted. Uden det her tjek ser opgaven helt normal ud i en
     tabel; selvkontrollen i demo-opgaver.js fandt netop den fejl. */
  if (kt.status === "solgt" || kt.status === "skrottet") {
    throw new HttpsError("failed-precondition",
      `${kt.kaldenavn || post.koeretoejId} er ${kt.status} og kan ikke få en driftsopgave.`);
  }

  if (leverandoerId) {
    const lv = (await rod.child(`leverandoerer/${leverandoerId}`).once("value")).val();
    if (!lv) throw new HttpsError("not-found", `Leverandøren ${leverandoerId} findes ikke.`);
  }

  /* ---- Reservationen, bygget EET sted --------------------------------- */
  /* ⚠ reservationFraOpgave() KASTER uden et vindue at reservere, og det er
     det rigtige svar: en standardlaengde ville spaerre enheden i et tidsrum
     ingen har besluttet. valideOpgaveplan() har allerede krævet
     estimeretMin, saa den her er baeltet ved siden af selerne. */
  let ny;
  try {
    ny = reservationFraOpgave(post);
  } catch (e) {
    throw new HttpsError("invalid-argument", e.message);
  }

  /* ---- Er enheden ledig? ---------------------------------------------- */
  const snap = await rod
    .child(`reservationer/${ny.ressourceType}/${ny.ressourceId}`)
    .once("value");
  const eksisterende = Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v }));

  const svar = tjekLedigMod(eksisterende, ny);
  if (!svar.ok) {
    /* ⚠ SERVERENS AFVISNING ER SKAERMENS EGEN SAETNING. konfliktTekst()
       navngiver hvad der spaerrer og hvornaar — en generisk 'kunne ikke
       gemmes' ville lade disponenten proeve igen med samme dato uden
       nogensinde at faa at vide hvad der stod i vejen.

       ⚠ OG DEN OVERSKRIVER IKKE, heller ikke naar den KUNNE. Se hovedet. */
    const foerste = svar.konflikter[0];
    const flere = svar.konflikter.length > 1
      ? ` (+${svar.konflikter.length - 1} mere)` : "";
    const raad = svar.kanOverskrive
      ? " Værkstedsbesøget har højere prioritet, men det rydder ikke selv en" +
        " booking af vejen: flyt eller annullér turen først, så den kan" +
        " forklares bagefter."
      : "";
    throw new HttpsError("failed-precondition",
      (foerste.tekst || konfliktTekst(ny, foerste)) + flere + raad);
  }

  /* ---- EEN SKRIVNING --------------------------------------------------- */
  /* ⚠ Opgaven og reservationen lander sammen eller slet ikke. To kald ville
     vaere to halve sandheder, og den ene af dem — en opgave uden reservation
     — ser FRI ud i disponeringen. */
  const opgaveId = rod.child("opgaver").push().key;
  const nu = Date.now();

  const opdatering = {};
  opdatering[`opgaver/${opgaveId}`] = {
    ...post,
    oprettetAf: uid,
    oprettetMs: nu,
  };
  /* Reservationens id er UDLEDT af opgaven, ikke en ny push-noegle. Saa kan
     den samme opgave ikke laegge to reservationer paa den samme enhed, hvis
     funktionen kaldes to gange — og en senere frigivelse kan finde den uden
     at soege. Samme greb som res-<etapeId>-<i> i etapeskift. */
  opdatering[`reservationer/${ny.ressourceType}/${ny.ressourceId}/res-${opgaveId}`] = {
    fra: ny.fra, til: ny.til,
    kilde: ny.kilde,
    oprettetAf: uid,
    oprettetMs: nu,
  };

  await rod.update(opdatering);

  await logOpgave(tenantId, uid, AUDIT.opret, opgaveId, null, post,
    `opgave planlagt paa ${ny.ressourceType} ${ny.ressourceId}`);

  return { opgaveId, fra: ny.fra, til: ny.til };
});

/* ══════════════════════════════════════════════════════════════════════════
   PLANLAEG ET SERVICEBESOEG — den sidste lukkede vej ind i `opgaver`

   ⚠ HVORFOR DEN ER SIN EGEN FUNKTION OG IKKE ET ART-FLAG PAA opgaveplanlaeg.
   To ting skiller dem ad, og begge er spaerringer:

     1. FELTSKEMAET. `art` ER skemaet (beslutning 21) — en vaerkstedsopgave
        haenger paa et koeretoej og har en arbejdstype, et servicebesoeg
        haenger paa et anlaeg eller en hel lokation og har ingen. En funktion
        med et flag skulle baere begge skemaer, og saa er der ingenting
        tilbage af den spaerring `art !== "vaerksted"` er.
     2. MODULET. `opgaveplanlaeg` kraever `moduler.flaade`; den her kraever
        `moduler.facility`. Spurgte begge om Fleet, kunne en kunde der KUN har
        Facility, ikke planlaegge sit eget servicebesoeg — og laa begge arter
        i EEN funktion, ville arten fra klienten vaelge hvilken doer der blev
        banket paa.

   ⚠ ET BESOEG UDEN `aktivId` SPAERRER HELE LOKATIONEN, og det er ikke en
   detalje: lukker man hallen, er alle porte i den ogsaa optaget.
   `reservationFraOpgave()` giver derfor ressourcetypen `lokation` frem for
   `facilityAktiv`.

   ⚠ OG DEN OMVENDTE VEJ HOLDES IKKE AF DATAMODELLEN. En reservation paa
   `lokation/lok-halb` og en paa `facilityAktiv/fa-port3` er to forskellige
   stier, saa et gulvarbejde i Hal B spaerrer IKKE porten i den hal — hverken
   her eller i `opgaveflyt`. Det er et kendt hul, ikke en overset detalje: en
   indeslutningsregel er sin egen beslutning, og et halvt tjek i EEN af de to
   funktioner ville vaere vaerre end ingen. Se README.
   ══════════════════════════════════════════════════════════════════════════ */
export const facilityplanlaeg = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  /* ⚠ opgaver.skriv, IKKE facility.skriv. Spoerg hvad handlingen kraever, ikke
     hvem brugeren er — og det den skriver, er en post i `opgaver`. Modulet er
     et andet spoergsmaal og staar nedenfor: permissionen siger hvad BRUGEREN
     maa, modulklausulen hvad KUNDEN har koebt. */
  if (!perms.includes("|opgaver.skriv|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke planlægge servicebesøg. Det kræver opgaver.skriv.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child("facility").val() !== true) {
    throw new HttpsError("permission-denied", "Facility-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const aktivId = kortStreng(d.aktivId, 60);
  const lokationId = kortStreng(d.lokationId, 60);

  const post = {
    /* ⚠ ARTEN SAETTES HER, IKKE AF KLIENTEN — modstykket til opgaveplanlaeg. */
    art: "facility",
    division: kortStreng(d.division, 20),
    status: kortStreng(d.status, 40),
    beskrivelse: kortStreng(d.beskrivelse, 500),
    startMs: Number.isFinite(Number(d.startMs)) ? Number(d.startMs) : null,
    estimeretMin: Number.isFinite(Number(d.estimeretMin)) ? Number(d.estimeretMin) : null,
  };
  /* ⚠ KUN DET FELT DER BLEV SENDT. Skrev vi begge og lod det ene vaere tomt,
     ville posten baere en lokation ingen laeser — se valideFacilityopgave(). */
  if (aktivId) post.aktivId = aktivId;
  if (lokationId) post.lokationId = lokationId;

  const leverandoerId = kortStreng(d.leverandoerId, 60);
  const prioritet = kortStreng(d.prioritet, 20);
  const sted = kortStreng(d.sted, 60);
  const personId = kortStreng(d.personId, 60);
  if (leverandoerId) post.leverandoerId = leverandoerId;
  if (prioritet) post.prioritet = prioritet;
  if (sted) post.sted = sted;
  if (personId) post.personId = personId;

  /* ---- Formen: SKAERMENS EGEN VALIDERING ------------------------------ */
  const form = valideFacilityopgave(post);
  if (!form.ok) {
    const foerste = Object.values(form.fejl)[0];
    throw new HttpsError("invalid-argument", foerste);
  }
  const mangler = opgaveMangler(post);
  if (mangler.length) {
    throw new HttpsError("invalid-argument",
      `Noden afviser posten: ${mangler.join(", ")}.`);
  }

  /* ---- Findes ressourcen? --------------------------------------------- */
  /* ⚠ INGEN STATUSSPAERRING PAA ANLAEGGET, og det er en forskel fra
     `opgaveplanlaeg`. Dér afvises en SOLGT eller SKROTTET enhed, fordi den er
     ude af flaaden for altid. Et anlaeg med status `fejl` eller `udeAfDrift`
     er derimod praecis det et servicebesoeg findes for — en spaerring dér
     ville forbyde at bestille reparationen af den port der er i stykker. */
  if (aktivId) {
    const a = (await rod.child(`facility/aktiver/${aktivId}`).once("value")).val();
    if (!a) throw new HttpsError("not-found", `Anlægget ${aktivId} findes ikke.`);
  } else {
    const l = (await rod.child(`facility/lokationer/${lokationId}`).once("value")).val();
    if (!l) throw new HttpsError("not-found", `Lokationen ${lokationId} findes ikke.`);
  }

  if (leverandoerId) {
    const lv = (await rod.child(`leverandoerer/${leverandoerId}`).once("value")).val();
    if (!lv) throw new HttpsError("not-found", `Leverandøren ${leverandoerId} findes ikke.`);
  }

  /* ---- Reservationen, bygget EET sted --------------------------------- */
  let ny;
  try {
    ny = reservationFraOpgave(post);
  } catch (e) {
    throw new HttpsError("invalid-argument", e.message);
  }

  /* ---- Er ressourcen ledig? ------------------------------------------- */
  const snap = await rod
    .child(`reservationer/${ny.ressourceType}/${ny.ressourceId}`)
    .once("value");
  const eksisterende = Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v }));

  const svar = tjekLedigMod(eksisterende, ny);
  if (!svar.ok) {
    /* ⚠ ET SERVICEBESOEG HAR PRIORITET 20 og taber til vaerksted (40) og
       fravaer (30) — men VINDER over en booking (10). Og det overskriver
       stadig ikke: at rydde en booking af vejen er et etapetilstandsskift med
       aarsag og historik, og det er `etapeskift`s arbejde. Samme svar som
       opgaveplanlaeg giver. */
    const foerste = svar.konflikter[0];
    const flere = svar.konflikter.length > 1
      ? ` (+${svar.konflikter.length - 1} mere)` : "";
    const raad = svar.kanOverskrive
      ? " Servicebesøget har højere prioritet, men det rydder ikke selv en" +
        " booking af vejen: flyt eller annullér turen først, så den kan" +
        " forklares bagefter."
      : "";
    throw new HttpsError("failed-precondition",
      (foerste.tekst || konfliktTekst(ny, foerste)) + flere + raad);
  }

  /* ---- EEN SKRIVNING --------------------------------------------------- */
  const opgaveId = rod.child("opgaver").push().key;
  const nu = Date.now();

  const opdatering = {};
  opdatering[`opgaver/${opgaveId}`] = { ...post, oprettetAf: uid, oprettetMs: nu };
  opdatering[`reservationer/${ny.ressourceType}/${ny.ressourceId}/res-${opgaveId}`] = {
    fra: ny.fra, til: ny.til,
    kilde: ny.kilde,
    oprettetAf: uid,
    oprettetMs: nu,
  };

  await rod.update(opdatering);

  await logOpgave(tenantId, uid, AUDIT.opret, opgaveId, null, post,
    `servicebesoeg planlagt paa ${ny.ressourceType} ${ny.ressourceId}`);

  return { opgaveId, fra: ny.fra, til: ny.til };
});

/* ══════════════════════════════════════════════════════════════════════════
   FLYT EN DRIFTSOPGAVE — beslutning 49

   ⚠ HVORFOR DEN ER SIN EGEN FUNKTION OG IKKE ET FLAG PAA opgaveplanlaeg.
   Den ene OPRETTER, den anden AENDRER, og de to stiller ikke de samme
   spoergsmaal. `opgaveplanlaeg` SAETTER `art: "vaerksted"`, fordi den laver
   posten; her ville det samme vaere en fejl — arten er allerede besluttet, og
   en funktion der kunne skifte den, ville kunne lave en vaerkstedsopgave om
   til en facility-opgave. To feltskemaer, én post, ingen af dem passer
   bagefter.

   ⚠ OG DEN AABNER IKKE EN VEJ REGLERNE HAR LUKKET. `opgaver` og
   `reservationer` er begge `.write: false`, og de bliver det: de to baerer den
   SAMME kendsgerning — at ressourcen er optaget — og en klient kan kun skrive
   den ene halvdel ad gangen. En opgave uden en daekkende reservation ser FRI
   ud i disponeringen. Beslutning 45, nu for en aendring frem for en
   oprettelse.

   ⚠ REGNESTYKKET LIGGER IKKE HER. `flytOpdatering()` er ren og staar i
   opgaveplan-regler.js, saa de to faelder — samme sti er samme noegle, og
   opgaven konflikter med sig selv — kan proeves uden en emulator. Se
   test/opgaveflyt.test.mjs.

   ⚠ ARTEN BESTEMMER MODULET. En vaerkstedsopgave kraever Fleet, en
   facility-opgave kraever Facility. Spurgte vi altid om Fleet, kunne en kunde
   der kun har Facility, ikke flytte sine egne servicebesoeg — og spurgte vi
   ikke om noget, var funktionen en aaben doer rundt om modulspaerringen.
   ══════════════════════════════════════════════════════════════════════════ */

/** Hvilket modul arten hoerer under. Se noten ovenfor. */
const MODUL_FOR_ART = { vaerksted: "flaade", facility: "facility" };

export const opgaveflyt = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  /* ⚠ PERMISSIONEN, IKKE ROLLEN — samme som opgaveplanlaeg. At flytte en
     opgave er at skrive den; der er ingen selvstaendig `opgaver.flyt`. */
  if (!perms.includes("|opgaver.skriv|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke ændre driftsopgaver. Det kræver opgaver.skriv.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  /* ⚠ ADMIN-SDK'ET GAAR UDEN OM REGLERNE. Uden de her blokke var funktionen en
     aaben doer rundt om abonnements- og modulspaerringen. */
  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const d = req.data || {};
  const opgaveId = kortStreng(d.opgaveId, 60);
  if (!opgaveId) throw new HttpsError("invalid-argument", "Der mangler et opgaveId.");

  const foer = (await rod.child(`opgaver/${opgaveId}`).once("value")).val();
  if (!foer) throw new HttpsError("not-found", `Opgaven ${opgaveId} findes ikke.`);

  /* Modulet foelger opgavens EGEN art — den kommer fra noden, ikke fra
     klienten. Se noten i hovedet. */
  const modulnoegle = MODUL_FOR_ART[foer.art];
  if (!modulnoegle) {
    throw new HttpsError("failed-precondition",
      `Opgaven har arten "${foer.art}", som ikke kan flyttes.`);
  }
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child(modulnoegle).val() !== true) {
    throw new HttpsError("permission-denied", `Modulet ${modulnoegle} er ikke aktivt.`);
  }

  const aendring = {
    startMs: Number.isFinite(Number(d.startMs)) ? Number(d.startMs) : undefined,
    estimeretMin: Number.isFinite(Number(d.estimeretMin)) ? Number(d.estimeretMin) : undefined,
    ressourceType: kortStreng(d.ressourceType, 30) || undefined,
    ressourceId: kortStreng(d.ressourceId, 60) || undefined,
  };

  /* ---- Formen: SKAERMENS EGEN VALIDERING ------------------------------ */
  /* ⚠ SAMME FUNKTION, SAMME SAETNING. Skaermen kalder den ogsaa, og to
     formuleringer af én spaerring er to forklaringer paa én ting. */
  const form = valideOpgaveflyt(foer, aendring);
  if (!form.ok) {
    const foerste = Object.values(form.fejl)[0];
    throw new HttpsError("invalid-argument", foerste);
  }

  /* ---- Findes raekken, og kan den bruges? ------------------------------ */
  /* ⚠ EKSISTENSTJEKKET LIGGER PAA SERVEREN, fordi det er den der har basen.
     valideOpgaveflyt() fik ingen `ressourcer` med ovenfor netop derfor —
     klienten proever mod det den har i haanden, serveren mod noden. */
  const { opdatering, efter, ny, gammelSti, nySti } =
    flytOpdatering(opgaveId, foer, aendring, { uid, nu: Date.now() });

  if (ny.ressourceType === "koeretoej") {
    const kt = (await rod.child(`koeretoejer/${ny.ressourceId}`).once("value")).val();
    if (!kt) throw new HttpsError("not-found", `Enheden ${ny.ressourceId} findes ikke.`);
    /* ⚠ EN SOLGT ELLER SKROTTET ENHED KAN IKKE FAA EN OPGAVE — heller ikke en
       flyttet. Posten bliver staaende i flaaden, men den kan ikke komme paa
       vaerksted. Samme spaerring som ved oprettelsen. */
    if (kt.status === "solgt" || kt.status === "skrottet") {
      throw new HttpsError("failed-precondition",
        `${kt.kaldenavn || ny.ressourceId} er ${kt.status} og kan ikke få en driftsopgave.`);
    }
  } else {
    const sti = ny.ressourceType === "facilityAktiv"
      ? `facility/aktiver/${ny.ressourceId}`
      : `facility/lokationer/${ny.ressourceId}`;
    const r = (await rod.child(sti).once("value")).val();
    if (!r) throw new HttpsError("not-found", `Ressourcen ${ny.ressourceId} findes ikke.`);
  }

  /* ---- Er ressourcen ledig paa den NYE plads? -------------------------- */
  const snap = await rod
    .child(`reservationer/${ny.ressourceType}/${ny.ressourceId}`)
    .once("value");
  const eksisterende = Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v }));

  /* ⚠ `ny` BAERER SIT UDLEDTE ID, og det er ikke pynt: tjekLedigMod()
     filtrerer paa `r.id !== ny.id`, saa uden det ville opgavens EGEN gamle
     reservation blive meldt som konflikt. En flytning paa to timer paa samme
     bil ville altid blive afvist — af opgaven selv. Se flytOpdatering(). */
  const svar = tjekLedigMod(eksisterende, ny);
  if (!svar.ok) {
    const foerste = svar.konflikter[0];
    const flere = svar.konflikter.length > 1
      ? ` (+${svar.konflikter.length - 1} mere)` : "";
    /* ⚠ DEN OVERSKRIVER IKKE, HELLER IKKE NAAR DEN KUNNE. At rydde en booking
       af vejen er et etapeskift med aarsag og historik — `etapeskift`s
       arbejde. Samme svar som opgaveplanlaeg giver. */
    const raad = svar.kanOverskrive
      ? " Opgaven har højere prioritet, men den rydder ikke selv en booking af" +
        " vejen: flyt eller annullér turen først, så den kan forklares bagefter."
      : "";
    throw new HttpsError("failed-precondition",
      (foerste.tekst || konfliktTekst(ny, foerste)) + flere + raad);
  }

  /* ---- EEN SKRIVNING --------------------------------------------------- */
  /* ⚠ Opgavens felter, den gamle reservation VAEK og den nye paa plads —
     sammen eller slet ikke. Delte vi det i to kald, kunne halvdelen lande, og
     den farlige halvdel er en opgave uden en daekkende reservation. */
  await rod.update(opdatering);

  /* ⚠ STIERNE KOMMER FRA flytOpdatering(), DE BYGGES IKKE IGEN HER. En anden
     afskrift af det samme udtryk ville kunne blive uenig med den der faktisk
     blev skrevet — og saa ville auditnoten sige noget andet end det der skete. */
  await logOpgave(tenantId, uid, AUDIT.aendre, opgaveId, foer, efter,
    gammelSti && gammelSti !== nySti
      ? `opgave flyttet til ${ny.ressourceType} ${ny.ressourceId}`
      : "opgave flyttet i tid");

  return { opgaveId, fra: ny.fra, til: ny.til, ressourceId: ny.ressourceId };
});

/* ══════════════════════════════════════════════════════════════════════════
   SKIFT EN DRIFTSOPGAVES STATUS — beslutning 50

   ⚠ HVORFOR DET IKKE ER ET FELT EN KLIENT KAN SAETTE.
   Et statusskifte roerer RESERVATIONEN: en annulleret opgave skal give bilen
   fri igen, og en udfoert skal holde op med at spaerre den. `reservationer` er
   `.write: false` for alle, saa en klient kunne kun skrive den ene halvdel —
   og den farlige halvdel er en bil der ser optaget ud i timer hvor den er fri,
   eller fri mens den staar paa liften. Beslutning 45's begrundelse, tredje
   gang efter `opgaveplanlaeg` og `opgaveflyt`.

   ⚠ MASKINEN LIGGER IKKE HER. `OPGAVE_OVERGANGE` og `statusOpdatering()` staar
   i opgaveplan-regler.js og er rene, saa foelgerne kan proeves uden en
   emulator — samme grund som `beregnKpi()` ikke regnes i jobbet. Se
   test/opgavestatus.test.mjs.

   ⚠ OG SKAERMEN VISER DEN SAMME MASKINE. `kanSkifteOpgave()` tegner knapperne
   og afviser her. Skrev serveren sin egen udgave, ville skaermen tilbyde et
   skift der blev sagt nej til bagefter — uden at nogen kunne se hvorfor.
   ══════════════════════════════════════════════════════════════════════════ */

export const opgavestatus = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  /* ⚠ PERMISSIONEN, IKKE ROLLEN — som paa de to andre. At skifte en opgaves
     status er at skrive den; der er ingen selvstaendig `opgaver.status`. */
  if (!perms.includes("|opgaver.skriv|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke ændre driftsopgaver. Det kræver opgaver.skriv.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  /* ⚠ ADMIN-SDK'ET GAAR UDEN OM REGLERNE. Uden de her blokke var funktionen en
     aaben doer rundt om abonnements- og modulspaerringen. */
  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const d = req.data || {};
  const opgaveId = kortStreng(d.opgaveId, 60);
  const tilStatus = kortStreng(d.status, 40);
  if (!opgaveId) throw new HttpsError("invalid-argument", "Der mangler et opgaveId.");

  const foer = (await rod.child(`opgaver/${opgaveId}`).once("value")).val();
  if (!foer) throw new HttpsError("not-found", `Opgaven ${opgaveId} findes ikke.`);

  /* Modulet foelger opgavens EGEN art — den kommer fra noden, ikke fra
     klienten. Samme katalog som opgaveflyt bruger. */
  const modulnoegle = MODUL_FOR_ART[foer.art];
  if (!modulnoegle) {
    throw new HttpsError("failed-precondition",
      `Opgaven har arten "${foer.art}", som ikke kan skifte status.`);
  }
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child(modulnoegle).val() !== true) {
    throw new HttpsError("permission-denied", `Modulet ${modulnoegle} er ikke aktivt.`);
  }

  /* ---- Maa skiftet ske? ----------------------------------------------- */
  /* ⚠ SAMME MASKINE SOM SKAERMEN TEGNER KNAPPERNE EFTER. */
  const tjek = kanSkifteOpgave(foer, tilStatus);
  if (!tjek.ok) throw new HttpsError("failed-precondition", tjek.aarsag);

  /* ⚠ faktiskMin PROEVES, DEN TAGES IKKE FOR PAALYDENDE. Reglen paa noden
     kraever isNumber() og >= 0, og den er `.write: false` — saa det er HER
     kontrollen ligger. Et negativt tal ville staa i en rapport som en opgave
     der tog minus tid. */
  const raaFaktisk = Number(d.faktiskMin);
  if (d.faktiskMin != null && (!Number.isFinite(raaFaktisk) || raaFaktisk < 0)) {
    throw new HttpsError("invalid-argument",
      "Faktisk tid skal være et helt antal minutter, og den kan ikke være negativ.");
  }
  const faktiskMin = Number.isFinite(raaFaktisk) && raaFaktisk >= 0
    ? Math.round(raaFaktisk)
    : undefined;

  /* ---- EEN SKRIVNING --------------------------------------------------- */
  /* ⚠ Statussen og reservationens foelge lander sammen eller slet ikke. Delte
     vi det i to kald, kunne halvdelen lande — og en annulleret opgave hvis
     reservation blev staaende, spaerrer en bil ingen har brug for. */
  const { opdatering, efter } = statusOpdatering(opgaveId, foer, tilStatus, {
    faktiskMin, uid, nu: Date.now(),
  });

  await rod.update(opdatering);

  await logOpgave(tenantId, uid, AUDIT.tilstandsskift, opgaveId, foer, efter,
    `opgave ${opgaveId} ${foer.status} -> ${tilStatus}`);

  return { opgaveId, status: tilStatus };
});

export const auditoprydning = onSchedule(
  { schedule: "40 3 1 * *", timeZone: "UTC", region: REGION },
  async () => {
    const db = getDatabase();
    const nu = Date.now();
    const dato = new Date(nu).toISOString().slice(0, 10);

    /* ⚠ TENANTLISTEN KOMMER FRA `udbyder/kunder`, som `maaldagligt` også
       bruger. En scanning af `audit/` selv ville liste tenants ud af en node
       der er skrevet af auditloggen — og en tenant uden aktivitet ville
       forsvinde ud af oprydningen uden at nogen så det. */
    const kunder = (await db.ref("udbyder/kunder").once("value")).val() || {};

    const rapport = { koertMs: nu, forfaldne: [], slettede: [], iAlt: 0 };

    for (const tenantId of Object.keys(kunder)) {
      const partitioner = await auditpartitioner(db, tenantId);
      for (const p of forfaldnePartitioner(partitioner, nu)) {
        rapport.iAlt += p.antal || 0;
        const linje = {
          tenantId, klasse: p.klasse, aar: p.aar, maaned: p.maaned,
          antal: p.antal || 0, maaneder: p.maaneder
        };
        if (!p.maaSlettes) {
          rapport.forfaldne.push(linje);
          continue;
        }
        /* ⚠ ÉN OPERATION PR. PARTITION. Det er hele grunden til at klassen
           ligger i stien — se noten i audit-regler.js. */
        await db.ref(`audit/${tenantId}/${p.klasse}/${p.aar}/${p.maaned}`).remove();
        rapport.slettede.push(linje);
      }
    }

    await db.ref(`udbyder/retention/${dato}`).set(rapport);
    console.log(
      `auditoprydning: ${rapport.forfaldne.length} partitioner forfaldne ` +
      `(${rapport.iAlt} poster), ${rapport.slettede.length} slettet. ` +
      (rapport.forfaldne.length
        ? "Retention er IKKE afgjort — der slettes ingenting. Se RETENTION_AFGJORT."
        : "Intet at rydde op.")
    );
    return null;
  }
);

/* ══════════════════════════════════════════════════════════════════════════
   KPI-AGGREGERINGEN — det sidste punkt på listen

   Beslutning 6: nøgletal læses ÉT sted, `tenants/<id>/kpi/<division>/current`,
   og afledte tal beregnes hos forbrugeren. Noden har været seedet fra
   demo-sættet; her regnes den af de rigtige noder.

   ⚠ REGNESTYKKET LIGGER IKKE HER. `beregnKpi()` i den delte
   kpi-aggregering.js er ren — den kender ingen database — så hele
   beregningen kan prøves uden en emulator. Jobbet henter noderne og skriver
   svaret; det er alt.

   ⚠ ET FELT UDEN KILDE BLIVER `null`. 52 af dem: `opgaver`, `indkoeb` og
   `facility` findes ikke som noder, og `flaade` og `bemanding` kan ikke deles
   på division, fordi stamdata ikke bærer feltet (beslutning 19). Skrev vi 0,
   ville skærmen sige "0 åbne ordrer" — se noten i kpi-aggregering.js og
   `INTET` i format.js.

   ⚠ FORRIGE KØRSEL GEMMES, OG DET ER DELTAERNES ENESTE KILDE.
   `kpi/<division>/forrige` er den forrige `current`. Uden den kan en
   periodeafvigelse ikke regnes, og første kørsel giver derfor `null` — ikke
   0 %, som ville betyde "uændret".

   ⚠ TENANTLISTEN KOMMER FRA `udbyder/kunder`, som `maaldagligt` og
   `auditoprydning` også bruger. En tenant der ikke er i indekset, får ingen
   nøgletal — og DEV's `demo`-tenant står ikke der, så det seedede demo-sæt
   bliver liggende. Det er med vilje: dev skal kunne vise en fuld skærm.
   ══════════════════════════════════════════════════════════════════════════ */

const KPI_DIVISIONER = ["gods", "bus"];

/** Rækker med id, som useListe læser dem. */
const raekker = (v) => Object.entries(v || {}).map(([id, x]) => ({ id, ...x }));

export const kpiaggregering = onSchedule(
  { schedule: "20 3 * * *", timeZone: "UTC", region: REGION },
  async () => {
    const db = getDatabase();
    const nu = Date.now();
    const kunderIndeks = (await db.ref("udbyder/kunder").once("value")).val() || {};

    let skrevet = 0;
    for (const tenantId of Object.keys(kunderIndeks)) {
      const rod = db.ref(`tenants/${tenantId}`);
      const [
        kunder, etaper, grundlag, opgaver, indkoeb, fakturaer, leverandoerer,
        facilityAktiver, facilityFejl, facilitySensorer, indberetninger,
      ] =
        await Promise.all([
          rod.child("kunder").once("value").then((s) => raekker(s.val())),
          rod.child("etaper").once("value").then((s) => raekker(s.val())),
          rod.child("grundlag").once("value").then((s) => raekker(s.val())),
          rod.child("opgaver").once("value").then((s) => raekker(s.val())),
          rod.child("indkoeb").once("value").then((s) => raekker(s.val())),
          rod.child("fakturaer").once("value").then((s) => raekker(s.val())),
          /* Prislisten kommer med som et BARN af posten — raekker() laegger
             kun det yderste id paa. beregnKpi() oversaetter selv med
             leverandoerFraDb(); jobbet regner ikke. */
          rod.child("leverandoerer").once("value").then((s) => raekker(s.val())),
          /* Facility er TRE lister, ikke én: noden har boern. raekker()
             laegger id paa hver af dem — for sensorerne er id ZONEN, fordi
             en zone har én maaling ad gangen. */
          rod.child("facility/aktiver").once("value").then((s) => raekker(s.val())),
          rod.child("facility/fejl").once("value").then((s) => raekker(s.val())),
          rod.child("facility/sensorer").once("value").then((s) => raekker(s.val())),
          rod.child("indberetninger").once("value").then((s) => raekker(s.val())),
        ]);

      for (const division of KPI_DIVISIONER) {
        const sti = rod.child(`kpi/${division}`);
        const forrige = (await sti.child("current").once("value")).val();
        const nyt = beregnKpi({
          division, kunder, etaper, grundlag, opgaver, indkoeb, fakturaer,
          leverandoerer, facilityAktiver, facilityFejl, facilitySensorer,
          indberetninger, forrige, nu
        });

        /* ⚠ ÉN SKRIVNING. Arkivet og det nye tal lander sammen — ellers
           kunne en delta blive regnet mod et arkiv der ikke svarer til den
           `current` den afløste. */
        const opdatering = { current: nyt };
        if (forrige) opdatering.forrige = forrige;
        await sti.update(opdatering);
        skrevet += 1;
      }
    }
    console.log(`kpiaggregering: ${skrevet} divisioner skrevet for ${Object.keys(kunderIndeks).length} tenants.`);
    return null;
  }
);
