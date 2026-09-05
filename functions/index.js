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
import { defineSecret } from "firebase-functions/params";
import { initializeApp, getApp } from "firebase-admin/app";
import { getDatabase, ServerValue } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

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
  ROLLE_PERMS, permStreng, permsForTenant, permsForBruger,
  valideRolleperms, valideMedarbejderOverride, laaserUde, laaserUdeMedarbejder, PERM,
} from "./delt/permissions.js";
import { valideVisning, skjulerAlt } from "./delt/dashboardvisning.js";
/* ⚠ SKIVE 2B — SAMME SNIT SOM dashboardvisning.js OVENFOR. Se navvisning.js
   for hvorfor mekanismen ikke kan "give" adgang, kun skjule den. */
import { valideNavvisning } from "./delt/navvisning.js";
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
  kanTraekkeForslag, traekOpdatering, erTrukket, aktiveForslag, naesteNummer } from "./delt/booking-state.js";
import {
  reservationerFraEtape, enhedsIder, straekningFraEtape
} from "./delt/etaper.js";
import { tjekDisponering } from "./delt/disponering.js";
/* ⚠ SAMME ORDLISTE OG SAMME VALIDERING SOM CHAUFFØRAPPEN. Beslutning 103. */
import { valideMelding, byggMelding, MELDING_FELTER } from "./delt/rutestatus.js";
/* ⚠ SAMME FILER SOM SKAERMEN. Serveren proever mod noejagtig de regler
   formularen viste — se noten i opgaveplan-regler.js. */
import { opgaveMangler, reservationFraOpgave } from "./delt/opgaver.js";
/* ⚠ SKIVE 3B — indberetningTriage og opgaveplanlaegs kobling til
   indberetningId skal prøve mod NØJAGTIG samme FORLOEB/kanSkifteTil() og
   kanAfslutte() som skærmen viser. Se noten i scripts/kopier-delt.mjs. */
import {
  FORLOEB, kanSkifteTil, kanAfslutte, HAENDELSE_ART, ALLE_ARTER,
  kraeverForloeb, harFelt,
} from "./delt/indberetninger.js";
import { PRIORITET, ALLE_PRIORITETER } from "./delt/prioritet.js";
import {
  valideForbrugsvare, valideBevaegelse as valideForbrugsvarebevaegelse,
  nyBeholdning,
} from "./delt/forbrugsvarer.js";
import {
  DESTINATIONSART, kanSaetteDestination,
} from "./delt/fakturacenter.js";
import {
  valideBehov, valideOrdre, behovTilLinje, ORDRE_PRAEFIKS, ORDRESERIE,
  valideGodkendelsesregler, STANDARD_GODKENDELSESREGLER,
  kanSkifteIndkoebsordre, ordreOpdatering, kraeverGodkendelse,
  kanMatche, kontantkoebLinje, ordreMailIndhold, ORDRESTATUS,
} from "./delt/procure.js";
/* ⚠ SKIVE 4D — SAMME KATALOG SOM leverandoerer.js's standardfelt. */
import { erGyldigtSprog, STANDARD_SPROG } from "./delt/sprog.js";
import {
  valideOpgaveplan, valideFacilityopgave, valideOpgaveflyt, flytOpdatering,
  kanSkifteOpgave, statusOpdatering,
} from "./delt/opgaveplan-regler.js";
import {
  kanLeverandoerSkifte, fordelPortalOpgaver,
} from "./delt/leverandoerportal-regler.js";
import {
  tjekLedigMod, konfliktTekst, indeslutninger, tjekLedigIndesluttet,
} from "./delt/reservations.js";
import {
  modulsaet, ukendteModuler, ALLE_MODULER, manglendeKrav, kravtekst,
} from "./delt/moduler.js";
import {
  ALLE_ABONNEMENTSTATUS, ALLE_AARSAGER, historikposter, valideHistorikpost,
} from "./delt/abonnement.js";
import { totalerAfLinjer } from "./delt/beloeb.js";
import { erGyldigMail, MINDSTE_KODE } from "./delt/brugere-regler.js";
import {
  taelBrugere, taelKoeretoejer, maalingsdato, validerPrisliste, sammenfatMaalinger,
  maalingerIPeriode, periodeGraenser, MOMSSATS, gaeldendePrisliste, linjerForPeriode
} from "./delt/priser.js";
/* ⚠ SAMME POLITIK SOM SKÆRMEN — beslutning 20/112. Se noten i sager.js.
   sagsnummerFraEmne() og vurderAfsender() hører til modtagevejen (skive 2,
   ikke bygget endnu) og importeres derfor ikke her. */
import {
  SAG_ART, SAG_TILSTAND, naesteSagsnummer, frigivKarantaene, reservationFraAftale,
  kanSkifteSagTilstand, KANAL,
} from "./delt/sager.js";
import {
  saniterHeaderFelt, valideEmne, valideTekst, erGyldigtSendRequestId,
} from "./delt/mailtransport.js";
import { sendMail } from "./mail/transport.js";
import { mailgunAdapter } from "./mail/adapters/mailgun.js";

/* ⚠ FIREBASE SECRET MANAGER — GATE A PUNKT 2. Bindes eksplicit til
   sagMailSend nedenfor via `secrets: [...]`. Sættes med
   `firebase functions:secrets:set MAILGUN_API_KEY` osv., ALDRIG i en
   .env-fil der committes, og ALDRIG som en VITE_*-klientvariabel. */
const MAILGUN_API_KEY = defineSecret("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = defineSecret("MAILGUN_DOMAIN");
const MAILGUN_AFSENDER = defineSecret("MAILGUN_AFSENDER");
/* ⚠ IKKE-DESTRUKTIV — beslutning 115. simulerRetention() og erUndtaget() er
   rene funktioner; ingen af dem sletter eller anonymiserer noget. Se noten
   i retention-regler.js. */
import { simulerRetention, RETENTION_KATEGORI, erUndtaget } from "./delt/retention-regler.js";
/* ⚠ SKIVE 4C — dokumentUploadInitier/-Bekraeft skal bygge og prøve mod
   NØJAGTIG samme stiForDokument()/tjekSignatur()/grænser som en fremtidig
   klientkode ville vise. Se dokumenter.js's hoved. */
import {
  TILLADT_MIME, MAX_FILSTOERRELSE_BYTES, MAX_TENANT_BYTES, PARENT_KOLLEKTION,
  tjekSignatur, stiForDokument, sprængerKvote,
} from "./delt/dokumenter.js";
/* ⚠ B2 — ansoegningAfgoer skal prøve mod NØJAGTIG samme
   kanAfgoereAnsoegning()/valideAnsoegning()/reservationFraFravaer() som
   chaufførappen og Workforce-skærmen bruger. Se fravaer.js's eget hoved. */
import {
  kanAfgoereAnsoegning, valideAnsoegning, reservationFraFravaer,
} from "./delt/fravaer.js";
/* ⚠ G.2 — braendstofAutomatch/braendstofMatchBekraeft skal bygge og prøve
   mod NØJAGTIG samme matchForslag()/afgørAutomatch()/kanMatcheBraendstof()
   som en fremtidig skærm ville vise. Se braendstofmatch.js's hoved. */
import {
  matchForslag as braendstofMatchForslag, afgørAutomatch, kanMatcheBraendstof,
} from "./delt/braendstofmatch.js";

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

/** Indekset klienten kan læse. ⚠ INGEN CLAIMS OG INGEN LØSEN.
 *
 * ⚠ spaerretMs — beslutning 115. HVORNÅR kontoen sidst skiftede
 * spærretilstand, ikke bare AT den er spærret. Retention-arbejdet har brug
 * for et tidspunkt at regne fra; en boolean alene kan ikke sige om
 * spærringen er en time eller to år gammel. Sættes KUN af spaerlogin —
 * skiftrolle skal bevare den, ikke nulstille den ved et rollevalg. */
const indeksPost = (b, rolle, spaerret = false, spaerretMs = null) => ({
  email: b.email,
  navn: b.displayName || b.email,
  rolle,
  spaerret,
  spaerretMs,
  opdateretMs: Date.now()
});

/**
 * ⚠ .set() PÅ HELE NODEN, IKKE .update(). Det er med vilje, og det gør
 * mere end at skrive indekset: `permsOverride` (medarbejderrettighederskriv)
 * ligger som en søskendenøgle på SAMME node, og et fuldt node-.set() uden
 * feltet FJERNER det. Det er sådan `skiftrolle` rydder en tidligere
 * individuel overstyring, uden en selvstændig sletning — en overstyring
 * bygget til den GAMLE rolles permission-sæt giver ikke mening for en ny
 * rolle. Skiftes denne funktion nogensinde til .update(), forsvinder den
 * oprydning stille og roligt.
 */
async function skrivIndeks(tenantId, bruger, rolle, spaerret, spaerretMs = null) {
  await getDatabase()
    .ref(`tenants/${tenantId}/brugere/${bruger.uid}`)
    .set(indeksPost(bruger, rolle, spaerret, spaerretMs));
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

  /* ⚠ spaerretMs BEVARES, IKKE REGNES OM. Et rollevalg er ikke en
     spærring — nulstillede vi tidspunktet her, ville en konto der har
     stået spærret i to år, se ud som om den lige blev det. */
  const eksisterendeSpaerretMs = (
    await getDatabase().ref(`tenants/${tenantId}/brugere/${maalUid}/spaerretMs`).once("value")
  ).val();
  await skrivIndeks(tenantId, bruger, rolle, Boolean(bruger.disabled), eksisterendeSpaerretMs);
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

  /* ⚠ BESLUTNING 121 — ADMIN KAN IKKE INDSKRÆNKES. "Den eneste der altid har
     fuld adgang er admin" er et krav, ikke en standard man kan redigere væk.
     `permsForTenant()` ignorerer allerede et eksisterende `roller/admin`
     stiltiende (se noten dér) — den afvisning her er den REELLE håndhævelse:
     skrivningen stoppes ved kilden, ikke kun neutraliseres bagefter. En
     klient der kun blev standset i UI'et, ville stadig kunne kalde funktionen
     direkte. */
  if (rolle === "admin") {
    throw new HttpsError("failed-precondition",
      "Administratorrollen kan ikke indskrænkes — den har altid alle permissions.");
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
  const nyeRoller = { ...(roller || {}), [rolle]: { perms } };
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
      /* ⚠ PR. BRUGER, IKKE ÉT FÆLLES UDTRYK FØR LØKKEN. Her stod ét
         claim-udtryk beregnet uden for løkken og genbrugt for alle — det
         ville stille og roligt overskrive enhver medarbejders individuelle
         `permsOverride` (medarbejderrettighederskriv) hver gang nogen
         redigerede selve rollen. `indeks[maalUid]` er den SAMME indeksrække
         der lige er hentet ovenfor — ingen ekstra opslagsrejse. */
      const claim = permStreng(
        permsForBruger(rolle, nyeRoller, indeks[maalUid]?.permsOverride)
      );
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
   INDIVIDUEL MEDARBEJDER-OVERSTYRING — TILFØJET 2026-09-05

   ⚠ HVORFOR DEN FINDES. `rolleskriv` retter hvad en ROLLE betyder — det
   rammer hver bruger med den, med vilje. Produktejerens krav går et lag
   dybere: "man skal helt ned på medarbejder niveau bestemme hvad de kan se
   og har rettigheder til." Eksemplet var konkret — en kunde der ikke bruger
   Timeregistrering, har heller ikke brug for Frihed for netop DEN chauffør,
   ikke nødvendigvis for alle chauffører.

   `permsForBruger()` (permissions.js) er DELTAET oven på rollen:
   `{ tilfoejet, fjernet }`, aldrig den fulde liste — en medarbejder uden
   overstyring er identisk med rollens standard.

   ⚠ SAMME TO FARER SOM rolleskriv, ÉT LAG DYBERE. `laaserUdeMedarbejder()`
   dækker begge: kan ikke fjerne brugere.skriv fra SIN EGEN adgang, og kan
   ikke fjerne den fra den SIDSTE person der reelt har den — regnet på tværs
   af alle brugeres EFFEKTIVE perms (rolle + deres egen overstyring), ikke
   kun på rollerne selv.

   ⚠ ADMIN KAN HVERKEN INDSKRÆNKES ELLER UDVIDES HERFRA. permsForBruger()
   ignorerer en overstyring på en admin-konto ubetinget — samme invariant
   som beslutning 121, ét niveau dybere. Skrivningen her afvises desuden
   direkte, som en ekstra håndhævelse ved selve KILDEN, ikke kun ved at
   gøre overstyringen virkningsløs bagefter.

   ⚠ ÉN BRUGER, ÉT setCustomUserClaims-KALD. Til forskel fra rolleskriv, som
   rammer alle med rollen, ændrer dette KUN målbrugeren — ingen løkke over
   et helt rolleindeks, fordi ændringen kun vedrører ham.
   ══════════════════════════════════════════════════════════════════════════ */
export const medarbejderrettighederskriv = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId } = kraevBrugeradmin(req);
  const d = req.data || {};

  const maalUid = kortStreng(d.uid, 128);
  if (!maalUid) throw new HttpsError("invalid-argument", "uid mangler.");

  const tilfoejet = Array.isArray(d.tilfoejet)
    ? d.tilfoejet.map((x) => kortStreng(x, 60)).filter(Boolean) : [];
  const fjernet = Array.isArray(d.fjernet)
    ? d.fjernet.map((x) => kortStreng(x, 60)).filter(Boolean) : [];
  /* ⚠ SAMME VALIDERING SOM SKÆRMEN. En klientvalidering der ikke også står
     her, er en pæn knap — og den ville kunne skrive en permission ingen
     regel kender. */
  const form = valideMedarbejderOverride(tilfoejet, fjernet);
  if (!form.ok) throw new HttpsError("invalid-argument", form.fejl);

  const auth = getAuth();
  const bruger = await hentIEgenTenant(auth, maalUid, tenantId);
  const maalRolle = kortStreng(bruger.customClaims?.rolle, 30);

  /* ⚠ BESLUTNING 121 GENBRUGT — ADMIN KAN IKKE ÆNDRES HERFRA.
     permsForBruger() ville alligevel ignorere overstyringen stiltiende;
     denne afvisning stopper skrivningen ved kilden, som rolleskrivs
     tilsvarende afvisning gør for selve rollen. */
  if (maalRolle === "admin") {
    throw new HttpsError("failed-precondition",
      "Administratorens adgang kan ikke ændres — den har altid alle permissions.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const roller = await hentRoller(tenantId);
  const alleBrugere = (await rod.child("brugere").once("value")).val() || {};
  /* ⚠ SPÆRRINGEN LIGGER HER, IKKE I SKÆRMEN — samme figur som laaserUde. */
  const grund = laaserUdeMedarbejder(maalUid, maalRolle, fjernet, {
    egenUid: uid, alleBrugere, roller: roller || {},
  });
  if (grund) throw new HttpsError("failed-precondition", grund);

  const overrideSti = rod.child(`brugere/${maalUid}/permsOverride`);
  if (!tilfoejet.length && !fjernet.length) {
    /* ⚠ INGEN OVERSTYRING ER FRAVÆR, IKKE ET TOMT SVAR. To tomme lister
       ville se ud som "vi har taget stilling og valgt intet" — men det er
       netop det samme som aldrig at have rørt medarbejderen. */
    await overrideSti.remove();
  } else {
    await overrideSti.set({ tilfoejet, fjernet, aendretAf: uid, aendretMs: Date.now() });
  }

  const claim = permStreng(
    permsForBruger(maalRolle, roller || {}, tilfoejet.length || fjernet.length ? { tilfoejet, fjernet } : null)
  );
  await auth.setCustomUserClaims(maalUid, { ...bruger.customClaims, perms: claim });
  /* ⚠ UDEN DEN HER ER ÆNDRINGEN EN PÆN KNAP — samme grund som rolleskriv. */
  await auth.revokeRefreshTokens(maalUid);

  await log(tenantId, uid, "tilstandsskift", maalUid,
    `rettigheder: +${tilfoejet.length}/-${fjernet.length}`);

  return { ok: true };
});

/* ══════════════════════════════════════════════════════════════════════════
   FJERNADGANG — DEV-BRUGERSKIFTEREN, SIKKERT PÅ HOSTED DEV

   ⚠ HVORFOR DEN FINDES. Den lokale brugerskifter (Brugervaelger.jsx) logger
   ind med VITE_DEV_BRUGER_KODE — en klienteksponeret variabel, fordi VITE_*
   altid bages ind i bundtet ved build. Det er trygt på en udviklers egen
   maskine og uacceptabelt på en offentligt tilgængelig Hosting-URL: enhver
   besøgende kunne læse koden af bundtet og logge ind som enhver af kontiene.

   Løsningen flytter selve login-trinnet server-side. Klienten sender aldrig
   en adgangskode — den sender en ROLLE-NØGLE, og en Cloud Function der
   allerede ved hvem den ringende bruger er (et Firebase-token, ikke
   email+kode), minter et Firebase custom token for den kendte v1-test-konto.
   Klienten bytter det til en session med auth.signInWithCustomToken().
   Ingen secret rejser nogensinde til browseren.

   ⚠ TO SPÆRRINGER, IKKE ÉN.

     1. PROJEKTET. Funktionen deployes kun til DEV (samme `--project dev`
        som alt andet provisioneringsværktøj), men den tjekker ALLIGEVEL sit
        eget kørende projekt-id ved hvert kald — samme dobbelte sikring som
        tjekProjekt() i provisioner-dev.mjs. Et uheld i udrulningskommandoen
        må aldrig kunne aktivere den mod produktion.

     2. KALDEREN. `devTester`-claimet er IKKE `udbyder` — det er sit eget,
        snævre claim, sat med scripts/dev-tester.mjs på en ægte personlig
        konto, ligesom ejerskab sættes med scripts/ejer.mjs. En lækket evne
        til at kalde DEN HER funktion skal ikke også give adgang til
        ejerkonsollen eller nogen anden kundes tenant.

        ⚠ ELLER: kalderen er ALLEREDE en af v1-tests seks roller. Uden det
        kunne en tester kun skifte ÉN gang — næste kald ville komme fra
        MÅLKONTOENS eget token, uden devTester-claimet. At SKRIVE claimet
        ind på målkontoen i stedet blev prøvet og forkastet: admins claims
        fylder alene 1016 byte, og Firebase's grænse er 1000 — en næsten
        fuld konto ville simpelthen fejle skiftet. At være tenant "v1-test"
        i forvejen giver ingen ny rettighed; man kom kun dertil ad devTester-
        vejen, eller via den lokale adgangskode, som allerede giver fuld
        adgang til DEN tenant.

   ⚠ MÅLKONTIENE SLÅS OP PÅ DERES KENDTE MAIL, IKKE PÅ ET uid ELLER EN MAIL
   FRA KLIENTEN. `${rolle}@v1-test.dev.fleetcontrol.invalid` er PRÆCIS det
   mønster scripts/provisioner-v1-test-brugere.mjs opretter kontiene med — de
   to kan ikke drive fra hinanden uden at det scriptet selv blev ændret, og
   en ændring dér er synlig. Klienten sender kun rollenavnet; opslaget og
   tenant-tjekket sker her, server-side.

   ⚠ INGEN NYE CLAIMS MINTES. Kontoen har allerede tenant/rolle/perms fra
   provisioneringen (claimsFor() i dev-brugere.js) — funktionen udsteder
   blot et token for den EKSISTERENDE konto, og de claims den allerede
   bærer, er dem den nye session får. Chaufførkontoen er stadig koblet til
   Anna Vognmand, fordi personId står på selve kontoens indeksrække, uændret.
   ══════════════════════════════════════════════════════════════════════════ */
const DEV_PROJEKT = "fleetcontrol-dev-1ac1c";
const V1T_TENANT = "v1-test";
const V1T_DOMAENE = "v1-test.dev.fleetcontrol.invalid";

export const devBrugerSkift = onCall({ region: REGION }, async (req) => {
  /* ⚠ FØRST. Ingen af de øvrige tjek betyder noget, hvis funktionen kunne
     køre mod produktion — se hovedet. */
  if (getApp().options.projectId !== DEV_PROJEKT) {
    throw new HttpsError(
      "failed-precondition",
      "Denne funktion findes kun i DEV — og kører ikke i dette projekt."
    );
  }

  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  /* ⚠ TO MÅDER AT VÆRE AUTORISERET PÅ, IKKE ÉN.
     1) devTester-claimet — EN EGEN CLAIM, IKKE `udbyder`. Se hovedet,
        punkt 2. Det er vejen IND: uden en tenant kan kontoen ingenting
        andet end at bede om at blive en af v1-tests seks roller.
     2) ALLEREDE en af v1-tests seks roller. Uden det kunne en tester kun
        skifte ÉN gang: næste kald ville komme fra MÅLKONTOENS eget token
        (uden devTester-claimet), og blive afvist. At SKRIVE devTester ind
        på målkontoen i stedet blev prøvet og forkastet — admins claims
        fylder allerede 1016 byte, og Firebase's grænse er 1000; en konto
        der næsten er fuld, ville simpelthen fejle skiftet.
        At være tenant "v1-test" i forvejen er ikke en ny rettighed: man
        kom kun dertil ad vej 1) i første omgang, eller via den lokale
        adgangskode — som allerede giver fuld adgang til DEN tenant. */
  const erAlleredeV1Test = auth.token?.tenant === V1T_TENANT;
  if (auth.token?.devTester !== true && !erAlleredeV1Test) {
    throw new HttpsError(
      "permission-denied",
      "Kontoen er ikke en autoriseret DEV-tester. Se scripts/dev-tester.mjs."
    );
  }

  /* ⚠ ÉN AF DE KENDTE ROLLER — INGEN FRI STRENG. ROLLE_PERMS ER SANDHEDEN om
     hvilke rollenavne der findes, samme tjek som skiftrolle/rolleskriv
     bruger. En ukendt rolle afvises her, før noget slås op. */
  const raaRolle = (req.data || {}).rolle;
  const rolle = kortStreng(raaRolle, 30);
  if (!rolle || !ROLLE_PERMS[rolle]) {
    throw new HttpsError("invalid-argument", `Ukendt rolle: ${raaRolle}`);
  }

  const admin = getAuth();
  const email = `${rolle}@${V1T_DOMAENE}`;
  let maal;
  try {
    maal = await admin.getUserByEmail(email);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    throw new HttpsError(
      "not-found",
      `${email} findes ikke — kør node scripts/provisioner-v1-test-brugere.mjs.`
    );
  }
  /* ⚠ DOBBELTTJEKKET, IKKE BARE ANTAGET. Mailmønsteret er en konvention;
     tenant-claimet er kilden. Skulle der nogensinde findes en anden konto
     med samme mønster, må den IKKE kunne bruges her. */
  if (maal.customClaims?.tenant !== V1T_TENANT) {
    throw new HttpsError(
      "failed-precondition", `${email} hører ikke til tenanten "${V1T_TENANT}".`
    );
  }

  const token = await admin.createCustomToken(maal.uid);

  /* ⚠ ET IDENTITETSSKIFTE ER SIKKERHEDSRELEVANT OG LOGGES SOM DET —
     samme klasse som skiftrolle. tenantId er altid "v1-test": funktionen
     kender ingen anden, og kalderens EGEN konto har typisk ingen tenant
     (en devTester er ofte en ejerkonto, se scripts/ejer.mjs). */
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${V1T_TENANT}/sikkerhed/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid: auth.uid, handling: "tilstandsskift",
      objekt: "brugere", objektId: maal.uid, klasse: "sikkerhed",
      note: `dev-brugerskift → ${rolle}`,
    });

  return { ok: true, token, rolle, email };
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

/* ══════════════════════════════════════════════════════════════════════════
   navvisningskriv — SKIVE 2B. Hvilke ARBEJDSOMRÅDER (topniveaupunkter i
   sidebaren) en bruger får vist. Samme snit som dashboardvisningskriv
   ovenfor, kopieret felt for felt — begrundelsen står i delt/navvisning.js
   og i regelfilen.

   ⚠ INGEN "skjulerAlt"-TJEK HER, OG DET ER IKKE EN FORGLEMMELSE. Dashboard
   og Support (Hjælp) er slet ikke medlemmer af OMRAADER — se
   navvisning.js's OMRAADER-liste — så der findes ingen kombination af
   `visning` der kan skjule dem. Et system uden forside kan derfor ikke
   opstå via denne funktion, uden at der behøves et separat tjek for det.

   ⚠ OG INGEN CLAIMS MINTES HER, af samme grund som dashboardvisningskriv:
   det her ændrer intet om hvad brugeren MÅ, kun hvad menuen tegner.
   ══════════════════════════════════════════════════════════════════════════ */
export const navvisningskriv = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId } = kraevBrugeradmin(req);
  const d = req.data || {};

  const maalUid = kortStreng(d.uid, 128);
  if (!maalUid) throw new HttpsError("invalid-argument", "uid mangler.");

  const visning = d.visning;
  const form = valideNavvisning(visning);
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

  /* ⚠ BRUGEREN SKAL VAERE I TENANTEN — samme tjek som dashboardvisningskriv,
     af samme grund: en admin hos kunde A maa ikke kunne skrive en
     indstilling paa en bruger hos kunde B. */
  await hentIEgenTenant(getAuth(), maalUid, tenantId);

  await rod.child(`navvisning/${maalUid}`).set(visning);
  await log(tenantId, uid, "tilstandsskift", maalUid,
    `navvisning: ${Object.entries(visning).filter(([, v]) => v === false).length} skjult`);

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
  await skrivIndeks(
    tenantId, bruger, bruger.customClaims?.rolle || "chauffoer", spaerret,
    spaerret ? Date.now() : null
  );
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

/**
 * Læg historikposterne i den opdatering der bærer selve ændringen.
 *
 * ⚠ SAMME update(), IKKE ET KALD MERE. Landede ændringen uden sin post,
 * ville loggen mangle en hændelse der skete; landede posten uden ændringen,
 * ville den forklare en tilstand kunden ikke har. Det er samme greb som
 * `bevaegelseskriv` bruger på rækken og beholdningen (beslutning 39) og alle
 * fire veje ind i `opgaver` bruger på opgaven og dens reservation.
 *
 * ⚠ OG FORMEN PRØVES HER, IKKE AF REGLEN. Admin SDK går uden om både `.write`
 * og `.validate`, så `.validate`-blokken på noden beskriver formen uden at
 * kunne håndhæve den mod os selv. `valideHistorikpost()` er håndhævelsen —
 * samme arbejdsdeling som `valideOpgaveplan()` på `opgaver` (beslutning 45).
 */
function medHistorik(db, id, opdatering, poster) {
  for (const post of poster) {
    const fejl = valideHistorikpost(post, { kendteModuler: ALLE_MODULER });
    if (fejl.length) {
      throw new HttpsError("internal", `Ugyldig historikpost: ${fejl.join(" ")}`);
    }
    const noegle = db.ref(`tenants/${id}/abonnementHistorik`).push().key;
    opdatering[`tenants/${id}/abonnementHistorik/${noegle}`] = post;
  }
  return opdatering;
}

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
  /* ⚠ OGSAA VED OPRETTELSEN. Stod tjekket kun i `kundemoduler`, kunne en
     kunde fødes med en kombination der ikke kan bruges — og så ville den
     første fejl vise sig hos ham, ikke her. Se beslutning 93. */
  const manglerVedOpret = manglendeKrav(valgte);
  if (manglerVedOpret.length) {
    throw new HttpsError("failed-precondition",
      `${kravtekst(manglerVedOpret)}. Vælg det til, eller fravælg modulet.`);
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

  /* ⚠ UDGANGSPUNKTET ER OGSÅ EN HÆNDELSE. Skrev vi kun ÆNDRINGER, ville
     loggens første post være det første fravalg — og så kunne man ikke se
     hvad kunden startede med. En log der begynder ved den anden hændelse,
     kan ikke rekonstruere den første tilstand.

     For kunder oprettet FØR beslutning 89 findes den ikke, og den kan ikke
     laves bagud: skærmen siger det frem for at tegne en tom liste, der ligner
     "der er aldrig sket noget". */
  await db.ref().update(medHistorik(db, id, {}, historikposter({
    foer: {}, efter: { moduler, status: "aktiv" }, afUid: ejerUid, ms: nu,
  })));

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

  /* ⚠ ET MODUL DER IKKE KAN VIRKE ALENE, SÆLGES IKKE ALENE.
     `bookinger`, `varer`, `enheder` og `plukordrer` har alle et PÅKRÆVET
     `kundeId`, og `kunder` er et modul for sig. Sælges Planning eller
     Warehouse uden Kunder, afviser reglen hver eneste skrivning — kunden
     har betalt for et modul der ikke kan bruges til noget.

     ⚠ DER TILFØJES IKKE AUTOMATISK. Et manglende modul er noget kunden
     ikke har købt; at slå det til for ham ville enten forære det væk eller
     fakturere for noget han ikke bad om. Vi afviser og siger hvad der
     mangler. Se beslutning 93. */
  const mangler = manglendeKrav(d.moduler);
  if (mangler.length) {
    throw new HttpsError("failed-precondition",
      `${kravtekst(mangler)}. Vælg det til, eller fravælg modulet.`);
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

  /* ⚠ ET KALD ER IKKE EN HÆNDELSE. Konsollen sender hele modulsættet hver
     gang der trykkes Gem, også når intet er ændret — historikposterne udledes
     derfor af FORSKELLEN. Loggede vi kaldet, ville der stå en post hver gang
     nogen kiggede og gemte igen, og en log fuld af hændelser der ikke skete,
     kan ikke bruges til at forklare en faktura. Se beslutning 89. */
  const nu = Date.now();
  const poster = historikposter({
    foer: { moduler: foer }, efter: { moduler: efter }, afUid: ejerUid, ms: nu,
  });

  await db.ref().update(
    medHistorik(db, id, { [`tenants/${id}/moduler`]: efter }, poster));

  await log(id, ejerUid, AUDIT.aendre, id,
    fjernet.length ? `moduler; fravalgt: ${fjernet.join(",")}` : "moduler");

  return { ok: true, moduler: Object.keys(efter), fjernet, historik: poster.length };
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
  const db = getDatabase();
  const nu = Date.now();
  const foer = (await db.ref(`tenants/${id}/abonnement`).once("value")).val() || {};
  const post = {
    status, aendretMs: nu, aendretAf: ejerUid,
    aarsag: aarsag || null
  };

  /* ⚠ FELT FOR FELT I ROD-OPDATERINGEN, IKKE NODEN SOM ÉN NØGLE. En
     multi-path update med `tenants/<id>/abonnement` som nøgle ville SÆTTE
     hele noden — og så var rabatBps, interval og startetMs væk. Det er
     nøjagtig den fælde kommentaren ovenfor advarer om ved set() mod update(),
     én etage højere oppe: en rod-opdatering er et set() på hver af sine
     nøgler. */
  const opdatering = {};
  for (const [felt, vaerdi] of Object.entries(post)) {
    opdatering[`tenants/${id}/abonnement/${felt}`] = vaerdi;
  }

  const poster = historikposter({
    foer, efter: { status, aarsag: aarsag || null }, afUid: ejerUid, ms: nu,
  });
  await db.ref().update(medHistorik(db, id, opdatering, poster));
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

  const db = getDatabase();
  const foer = (await db.ref(`tenants/${id}/abonnement`).once("value")).val() || {};

  /* Felt for felt — samme grund som i kundestatus: en rod-opdatering med
     noden som nøgle ville sætte den og tørre statussen væk. */
  const opdatering = {};
  for (const [felt, vaerdi] of Object.entries(post)) {
    opdatering[`tenants/${id}/abonnement/${felt}`] = vaerdi;
  }

  /* ⚠ RABATSKIFTET ER DEN ENE ÆNDRING MÅLINGERNE IKKE KAN SE. `maaldagligt`
     skriver status, moduler, brugere og køretøjer — ikke rabatten. Og
     `linjerForPeriode()` får ÉN rabatBps for hele perioden, nemlig den der
     står når grundlaget genereres: en rabat sat den 20. prissætter også de
     nitten dage der allerede er gået. Uden historikken kan ingen se hvornår
     det skete. Se beslutning 89. */
  const poster = historikposter({ foer, efter: post, afUid: ejerUid, ms: post.aendretMs });
  await db.ref().update(medHistorik(db, id, opdatering, poster));

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

/* Skive 3B — samme mønster som logOpgave() lige ovenfor. */
async function logIndberetning(tenantId, uid, handling, id, foer, efter, note) {
  const d = diff(foer, efter);
  const klasse = klasseFor(handling, "indberetninger");
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${tenantId}/${klasse}/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt: "indberetninger", objektId: id,
      klasse,
      aendrede: d.aendrede, foer: d.foer, efter: d.efter,
      note: note ?? null
    });
}

/* B2 — samme mønster som logOpgave()/logIndberetning() ovenfor. foer/efter
   er FLADE objekter ({ status, personId, fra, til }), ikke det nestede
   `ansoegning`-felt: diff() sammenligner på topniveau, og kun feltnavne på
   LOGBARE_FELTER (audit-regler.js) får deres værdi med — "status" står der,
   "ansoegning" ville ikke. Samme greb som indberetningTriage bruger med sit
   flade { forloeb: handling }. */
async function logFravaer(tenantId, uid, handling, id, foer, efter, note) {
  const d = diff(foer, efter);
  const klasse = klasseFor(handling, "fravaer");
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${tenantId}/${klasse}/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt: "fravaer", objektId: id,
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
   To koordinatorer der opretter i samme sekund, ville ellers faa samme nummer
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

  /* ⚠ PERMISSIONEN, IKKE ROLLEN. `booking.opret` har koordinator — det er den
     rolle der tager imod foresporgslen — og admin. (casehandler havde den
     tidligere; rollen er konsolideret ind i koordinator.) */
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
    { nummer, kundeId: post.kundeId }, `booking ${nummer} oprettet`);

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

  /* ⚠ SKIVE 3B — INDBERETNINGID, VALGFRI. Beslutning 109 valgte retningen:
     opgaven peger på indberetningen, ikke omvendt. Feltet stod klar i
     opgaver.js' vaerksted-feltskema og i firebase.rules.json siden dengang,
     men blev aldrig sendt herfra — koblingen var besluttet og ikke bygget. */
  const indberetningId = kortStreng(d.indberetningId, 60);
  let indberetningFoer = null;
  if (indberetningId) {
    /* ⚠ SAMME PERMISSION SOM DEN NARROWE indberetningTriage. "Planlæg
       aktivitet" fra en indberetning ÆNDRER en anden brugers post (dens
       forloeb), og det er præcis den handling indberetninger.skrivAlle
       findes for at skelne fra chaufførens egen indberetninger.skriv. Uden
       den her linje ville opgaver.skriv alene have været nok — og den
       permission siger intet om hvem der ejer indberetningen. */
    if (!perms.includes("|indberetninger.skrivAlle|")) {
      throw new HttpsError("permission-denied",
        "Du må ikke koble en indberetning til en opgave. Det kræver indberetninger.skrivAlle.");
    }
    indberetningFoer = (await rod.child(`indberetninger/${indberetningId}`).once("value")).val();
    if (!indberetningFoer) {
      throw new HttpsError("not-found", `Indberetningen ${indberetningId} findes ikke.`);
    }
    /* ⚠ SAMME TILSTANDSMASKINE SOM SKÆRMEN VISER. En indberetning der allerede
       er afsluttet — eller aldrig havde et forløb, fordi den er en
       udgiftsregistrering — kan ikke sendes til "planlagt". Gæt ikke: fejl
       lukket, som kanSkifteTil() selv gør på en ukendt tilstand. */
    if (!kanSkifteTil(indberetningFoer.forloeb, "planlagt")) {
      throw new HttpsError("failed-precondition",
        `Indberetningen kan ikke sendes til "${FORLOEB.planlagt.label}" fra sit ` +
        `nuværende forløb ("${FORLOEB[indberetningFoer.forloeb]?.label || indberetningFoer.forloeb || "intet"}").`);
    }
    post.indberetningId = indberetningId;
  }

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
  /* ⚠ SKIVE 3B — FANDT VED DEV-VERIFIKATION, IKKE ANTAGET. opgaveId skal
     genereres FØR reservationFraOpgave() kaldes, ikke efter: kilde.id sættes
     til opgave.id, og uden det bar hver eneste reservation opgaveplanlaeg
     nogensinde skrev, kilde.id: undefined — en skrivning RTDB afviser med
     "values argument contains undefined". Målt i DEV: funktionen kunne ALDRIG
     fuldføre "Planlæg aktivitet", hverken før eller efter denne skive — de 27
     eksisterende opgaver i DEV var alle seedet, ingen var skrevet gennem denne
     funktion. Samme greb som opgaveflyt og opgavestatus allerede bruger:
     reservationFraOpgave({ ...foer, id: opgaveId }). */
  const opgaveId = rod.child("opgaver").push().key;
  let ny;
  try {
    ny = reservationFraOpgave({ ...post, id: opgaveId });
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
     — ser FRI ud i disponeringen. opgaveId er allerede genereret ovenfor. */
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
  /* ⚠ SKIVE 3B — SAMME update(), IKKE ET KALD MERE. Opgaven og indberetningen
     skal lande sammen eller slet ikke: to uafhængige skrivninger kunne
     efterlade en indberetning der siger "planlagt" uden nogen opgave, eller
     en opgave med en indberetningId der aldrig blev meldt videre. */
  if (indberetningId) {
    opdatering[`indberetninger/${indberetningId}/forloeb`] = "planlagt";
  }

  await rod.update(opdatering);

  await logOpgave(tenantId, uid, AUDIT.opret, opgaveId, null, post,
    `opgave planlagt paa ${ny.ressourceType} ${ny.ressourceId}`);
  if (indberetningId) {
    await logIndberetning(tenantId, uid, AUDIT.tilstandsskift, indberetningId,
      { forloeb: indberetningFoer.forloeb }, { forloeb: "planlagt" },
      `koblet til opgave ${opgaveId}`);
  }

  return { opgaveId, fra: ny.fra, til: ny.til };
});

/* ══════════════════════════════════════════════════════════════════════════
   INDBERETNINGINDSEND — TILFØJET 2026-09-05

   ⚠ HVORFOR DEN FINDES. `indberetninger/$id` var skrivbar DIREKTE af
   klienten for en NY post (kun redigering krævede ejerskab på `oprettetAf`)
   — se den tidligere note i Indberetning.jsx: "der er ingen anden post der
   skal skrives i samme åndedrag". Det er ikke længere sandt: produktejeren
   har bedt om at en SAG med et ticketnummer oprettes ATOMISK, så snart en
   driftshændelse indberettes. To uafhængige skrivninger (indberetning, så
   sag) kunne lande halvt — en indberetning uden sag, eller (værre) en sag
   der peger på en indberetning der aldrig blev skrevet. Samme figur som
   opgaveplanlaeg lige ovenfor.

   ⚠ KUN DRIFTSHÆNDELSER FÅR EN SAG. `kraeverForloeb(art)` er den samme
   funktion der afgør om posten overhovedet får et `forloeb` — en
   udgiftsregistrering (tankning, parkering, truckwash, kvittering) har
   hverken forløb eller triage, og skal ikke have et ticketnummer for et
   bilag. Se indberetninger.js's eget hoved.

   ⚠ SKADEBESKRIVELSE OG MODPART SKRIVES ALDRIG HER. De to felter er
   klassificerede (FELT-kommentaren i indberetninger.js) og har
   `.validate: false` på selve `indberetninger/$id` (kun tilladt på
   `sensitive/indberetninger/$id`, som kræver indberetninger.sensitiveLaes —
   en permission chaufføren ikke har). Denne funktion bruger Admin-SDK'et,
   som IGNORERER `.validate` — en ukritisk videreførsel af klientens payload
   ville derfor kunne skrive klassificeret indhold ind på den UGATEDE node,
   noget selve reglen forhindrer i dag. Det er en eksisterende begrænsning
   (en chauffør kan i praksis ikke indberette en skadesbeskrivelse fra
   vejen, uden om denne ombæring), ikke noget der rettes her.
   ══════════════════════════════════════════════════════════════════════════ */

/* De eneste "på telefonen"-felter denne funktion viderefører uændret — se
   noten ovenfor om hvorfor skadeBeskrivelse/modpart IKKE står her. */
const INDSEND_FELTER = ["kmStand", "liter", "adBlueLiter"];

export const indberetningIndsend = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  /* Samme permission som reglen krævede for en NY post. */
  if (!perms.includes("|indberetninger.skriv|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke oprette en indberetning. Det kræver indberetninger.skriv.");
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
  if (moduler.exists() && moduler.child("flaade").val() !== true) {
    throw new HttpsError("permission-denied", "Fleet-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const art = kortStreng(d.art, 40);
  if (!ALLE_ARTER.includes(art)) {
    throw new HttpsError("invalid-argument", `Ukendt indberetningsart "${d.art}".`);
  }

  const nu = Date.now();
  const id = rod.child("indberetninger").push().key;

  /* ⚠ SERVER-SIDE, IKKE FRA PAYLOAD — samme regel som overalt: en browser
     kan oplyse hvem som helst og hvornår som helst. */
  const post = {
    art,
    oprettetAf: uid,
    oprettetMs: nu,
    ...(kraeverForloeb(art) ? { forloeb: "ny" } : {}),
  };

  /* ⚠ FEJLER SYNLIGT, LIGESOM RETTEN GØR I DAG — se filens hoved. En
     driftshændelse med `skadeBeskrivelse`/`modpart` udfyldt kan i dag IKKE
     gemmes (feltet er `.validate: false` på denne node) — kun på
     `sensitive/indberetninger`, som chaufføren ikke må skrive til. Denne
     funktion skal ikke stiltiende TABE de to felter (chaufføren ville tro
     skaden var fuldt indberettet); den afviser i stedet med samme udfald
     som reglen selv giver. */
  if (kortStreng(d.skadeBeskrivelse, 1) || kortStreng(d.modpart, 1)) {
    throw new HttpsError("invalid-argument",
      "Skadebeskrivelse og modpart kan ikke sendes fra chaufførappen endnu — " +
      "de er klassificerede og skal registreres af kontoret.");
  }

  const koeretoejId = kortStreng(d.koeretoejId, 60);
  if (koeretoejId) post.koeretoejId = koeretoejId;
  const beskrivelse = kortStreng(d.beskrivelse, 500);
  if (beskrivelse) post.beskrivelse = beskrivelse;
  const omkostningOere = Number(d.omkostningOere);
  if (Number.isFinite(omkostningOere)) post.omkostningOere = omkostningOere;
  /* Tankningens EGEN dato, kun relevant for braendstof — se Indberetning.jsx. */
  if (art === "braendstof") {
    const dato = kortStreng(d.dato, 10);
    if (dato) post.dato = dato;
  }
  for (const f of INDSEND_FELTER) {
    if (!harFelt(art, f)) continue;
    const v = d[f];
    if (v === undefined || v === null || v === "") continue;
    post[f] = typeof v === "number" ? v : kortStreng(v, 60);
  }

  /* ⚠ SAMME KRAV SOM REGLEN — braendstofmatch bruger PRÆCIS de tre felter,
     aldrig pris eller foto (tillægskrav "brændstofmatch" §1/§8). Admin-SDK'et
     går uden om `.validate`, så tjekket skal stå eksplicit her. */
  if (art === "braendstof" && !(post.koeretoejId && post.dato && Number(post.liter) > 0)) {
    throw new HttpsError("invalid-argument",
      "En tankning kræver enhed, dato og et antal liter større end 0.");
  }

  const opdatering = {};
  opdatering[`indberetninger/${id}`] = post;

  /* ⚠ KUN DRIFTSHÆNDELSER — se filens hoved. */
  let sagId = null;
  let sagsnummer = null;
  if (kraeverForloeb(art)) {
    sagId = rod.child("sager").push().key;
    sagsnummer = await naesteSagsnummer(db, (sti) => `tenants/${tenantId}/${sti}`, "fleet");
    opdatering[`sager/${sagId}`] = {
      art: SAG_ART.fleet.art,
      tilstand: "aaben",
      emne: HAENDELSE_ART[art]?.label || art,
      modul: "flaade",
      oprettetAf: uid,
      oprettetMs: nu,
      antalBeskeder: 0,
      antalKarantaene: 0,
      harAftale: false,
      objektType: "indberetning",
      objektId: id,
      nummer: sagsnummer,
    };
    /* ⚠ IKKE OGSÅ opdatering[`indberetninger/${id}/sagId`] = sagId. `post`
       er allerede den SAMME objektreference som opdatering[`indberetninger/
       ${id}`] peger på (linje ovenfor) — at mutere `post` her er nok, og
       er allerede sat i update()-kaldet. En separat understi ved SIDEN af
       den fulde node-sti er RTDB's "values argument contains a path that
       is ancestor of another path" — fundet ved DEV-verifikation: hele
       kaldet fejlede med 500/INTERNAL for enhver driftshændelse. */
    post.sagId = sagId;
  }

  await rod.update(opdatering);

  await logIndberetning(tenantId, uid, AUDIT.opret, id, null, post,
    sagId ? `indberettet fra chaufførappen, sag ${sagsnummer}` : "indberettet fra chaufførappen");

  return { id, sagId, sagsnummer };
});

/* ══════════════════════════════════════════════════════════════════════════
   INDBERETNINGTRIAGE — Skive 3B

   ⚠ HVORFOR DEN FINDES, SELVOM `indberetninger/$id` ALLEREDE ER SKRIVBAR.
   `indberetninger.skrivAlle` lader kontoret redigere ETHVERT felt på en
   ANDENS indberetning — ejeren, teksten, arten, kilometerstanden, alt. Det
   er retten en klargøring eller en rettelse af et tastefejlsramt felt har
   brug for. Triage er noget andet: ÉT lovligt forløbsskift, efter
   NØJAGTIG samme FORLOEB/kanSkifteTil() som skærmen viser, og — når
   forløbet lukkes uden en omkostning — en begrundelse der ryger i
   `ingenOmkostning`, intet andet. En fri skrivning til hele posten kunne
   ramme ved siden af (en "afslut"-handling der ved en fejl også ændrede
   `koeretoejId`) uden at nogen så det; den her funktion kan kun det ene.

   ⚠ GATEN ER indberetninger.skrivAlle, IKKE indberetninger.skriv.
   Chaufføren har kun den sidste — `chauffoer: [...BASIS_LAES,
   PERM.indberetningerSkriv]` i permissions.js — og reglen på
   `indberetninger/$id` bruger den PRÆCIS samme skelnen: skrivAlle er
   "andres indberetninger", skriv er "mine egne". Havde funktionen kun
   krævet skriv, kunne chaufføren have triageret sin egen indberetning selv.

   ⚠ SAMME MOTOR SOM "Afslut"-KNAPPEN VISTE. kanAfslutte() er den ENE
   funktion der afgør om pengesiden er afklaret — se dens eget hoved i
   indberetninger.js. Server og skærm er enige, fordi det er den samme
   funktion, ikke to formuleringer af én spærring.
   ══════════════════════════════════════════════════════════════════════════ */
const TRIAGE_MAAL = ["vurderet", "afsluttet"];

export const indberetningTriage = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  if (!perms.includes("|indberetninger.skrivAlle|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke triagere andres indberetninger. Det kræver indberetninger.skrivAlle.");
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
  if (moduler.exists() && moduler.child("flaade").val() !== true) {
    throw new HttpsError("permission-denied", "Fleet-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const id = kortStreng(d.id, 60);
  if (!id) throw new HttpsError("invalid-argument", "id mangler.");

  /* ⚠ KUN DE TO. "planlagt" går gennem opgaveplanlaeg — se dens egen note —
     fordi den handling OGSÅ opretter en driftsopgave, og de to skal lande i
     ÉN update(). Denne funktion rører aldrig `opgaver/`. */
  const handling = kortStreng(d.handling, 20);
  if (!TRIAGE_MAAL.includes(handling)) {
    throw new HttpsError("invalid-argument",
      `Ukendt triagehandling "${handling}". Kun ${TRIAGE_MAAL.join(" og ")} kan sættes herfra.`);
  }

  const foer = (await rod.child(`indberetninger/${id}`).once("value")).val();
  if (!foer) throw new HttpsError("not-found", `Indberetningen ${id} findes ikke.`);

  /* ⚠ SAMME TILSTANDSMASKINE SOM SKÆRMEN VISER — kanSkifteTil() fejler lukket
     på en ukendt eller manglende tilstand, så en udgiftsregistrering (der
     aldrig har et `forloeb`) afvises her, præcis som i opgaveplanlaeg. */
  if (!kanSkifteTil(foer.forloeb, handling)) {
    throw new HttpsError("failed-precondition",
      `Kan ikke skifte fra "${FORLOEB[foer.forloeb]?.label || foer.forloeb || "intet forløb"}" ` +
      `til "${FORLOEB[handling].label}".`);
  }

  const opdatering = {};
  const efter = { forloeb: handling };

  /* ⚠ TILFØJET 2026-09-05 — "prioritering ER vurderet-skiftet, ikke et
     ekstra klik" (produktejerens eget triageflow). En prioritet uden et
     vurderet-skift ville stå løst; et vurderet-skift uden en prioritet
     ville lade posten falde ind i "afventer planlægning" uden at nogen
     havde sagt hvor akut den er — samme figur som et null uden en grund
     (CLAUDE.md). Kun krævet HER, ikke ved "afsluttet": en sag der lukkes,
     skal ikke omprioriteres for at kunne det. */
  if (handling === "vurderet") {
    const prioritet = kortStreng(d.prioritet, 20);
    if (!prioritet || !PRIORITET[prioritet]) {
      throw new HttpsError("invalid-argument",
        `En prioritet skal vælges for at markere som vurderet. Kendte: ${ALLE_PRIORITETER.join(", ")}.`);
    }
    opdatering[`indberetninger/${id}/prioritet`] = prioritet;
    efter.prioritet = prioritet;
  }

  if (handling === "afsluttet") {
    /* ⚠ BEGRUNDELSEN BYGGES AF SERVEREN — af og ms er IKKE klientens at
       sætte, samme regel som `oprettetAf`/`oprettetMs` andre steder: en
       browser kan oplyse hvad som helst om hvem og hvornår. */
    const begrundelse = kortStreng(d.begrundelse, 500);
    /* ⚠ FUNDET VED DEV-VERIFIKATION. udkast.forloeb må IKKE sættes til
       "afsluttet" her — kanAfslutte()'s FØRSTE tjek er netop
       `indberetning.forloeb === "afsluttet"` (en vagt mod at lukke en post
       der allerede er lukket), og forudsatte man svaret, meldte funktionen
       "allerede afsluttet" om en post der aldrig havde været det. Samme
       fejlklasse som at spørge en dør om den er åben ved at lukke den først.
       kanAfslutte() skal se posten som den ER NU — kun ingenOmkostning er nyt. */
    const udkast = begrundelse
      ? { ...foer, ingenOmkostning: { begrundelse, af: uid, ms: Date.now() } }
      : foer;
    const afslut = kanAfslutte(udkast);
    if (!afslut.ok) {
      throw new HttpsError("failed-precondition", afslut.aarsager[0]);
    }
    if (udkast.ingenOmkostning) {
      opdatering[`indberetninger/${id}/ingenOmkostning`] = udkast.ingenOmkostning;
      efter.ingenOmkostning = udkast.ingenOmkostning;
    }
  }

  opdatering[`indberetninger/${id}/forloeb`] = handling;
  await rod.update(opdatering);

  await logIndberetning(tenantId, uid, AUDIT.tilstandsskift, id,
    { forloeb: foer.forloeb }, efter, `indberetning triageret: ${handling}`);

  return { id, forloeb: handling };
});

/* ══════════════════════════════════════════════════════════════════════════
   AFGØR EN FRIHEDSANSØGNING — B2, V1-stabiliseringsauditens anden BLOCKER

   ⚠ HVORFOR DEN FINDES, SELVOM `fravaer/$id` ALLEREDE ER SKRIVBAR MED
   fravaer.skriv. Reglen tillader kontoret at skrive posten direkte — det er
   vejen `Fravaer.jsx`'s (endnu ikke byggede) "Registrér fravær" skal bruge.
   Men reglen håndhæver INGEN statsmaskine: den forhindrer kun at CHAUFFØREN
   skriver uden om sin egen gren (se rules.ansoegning.test.mjs). Intet i
   reglen stopper en klient med fravaer.skriv i at skrive `godkendt` oven på
   en allerede `afvist` ansøgning, eller i at godkende uden nogensinde at
   røre reservationen — Admin-SDK'et her går uden om reglerne alligevel, så
   selv det halve tjek reglen giver, findes ikke i denne funktion, medmindre
   den bygges ind. Samme begrundelse som `opgavestatus`, tredje gang: et
   statusskifte der også skal røre en reservation, kan ikke være et rent
   feltskriv.

   ⚠ GATEN ER fravaer.skriv, IKKE EN ROLLE. Chaufføren har den ikke —
   `chauffoer: [...BASIS_LAES, PERM.indberetningerSkriv]` i permissions.js —
   og det er PRÆCIS den permission der allerede skiller "kontorets gren" fra
   "chaufførens gren" i firebase.rules.json's egen `.write`-regel. At kræve
   den samme her, ikke en bredere, er hvad der gør det umuligt for en
   chauffør at godkende sin egen ansøgning via et manipuleret klientkald —
   selv hvis han kaldte funktionen direkte uden om UI'et.

   ⚠ IKKE EN NY STATUSMASKINE. `kanAfgoereAnsoegning()` er blot den
   færdiggjorte udgave af den tre-status ordliste `ANSOEGNING` har haft siden
   beslutning 108: `ansoegt` → `godkendt`/`afvist`, og de to er endestationer.
   Se fravaer.js.

   ⚠ RESERVATIONENS ID ER UDLEDT AF fravaerId, IKKE EN NY push()-NØGLE —
   samme greb som `res-${opgaveId}` i opgaveplanlaeg. To godkendelser af
   samme ansøgning (en dobbeltklikket knap, eller to kontorfolk der rammer
   samme sekund) skriver derfor til DEN SAMME reservationsnøgle i stedet for
   at oprette to. Og selve dobbeltgodkendelsen er alligevel lukket: anden
   omgang læser `foer.ansoegning.status` som allerede `"godkendt"`, og
   `kanAfgoereAnsoegning()` afviser den — `godkendt` er en endestation.

   ⚠ MEDARBEJDER OG PERIODE KOMMER FRA `foer`, ALDRIG FRA KLIENTEN. Kaldet
   sender kun `fravaerId`, `status` og et valgfrit `svar` — `personId`, `fra`
   og `til` læses fra posten som den STÅR i basen. En klient der sendte sit
   eget personId eller sin egen periode med, kunne ellers godkende en anden
   ansøgning end den han pegede på.

   ⚠ AFVIST SKRIVER INGEN RESERVATION. Reservationsgrenen køres kun når
   `tilStatus === "godkendt"` — samme asymmetri som `opgaveplanlaeg` ikke har
   brug for, fordi en opgave altid får sin reservation; her er det halve af
   svarene der IKKE skal spærre noget.
   ══════════════════════════════════════════════════════════════════════════ */
export const ansoegningAfgoer = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  if (!perms.includes("|fravaer.skriv|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke afgøre frihedsansøgninger. Det kræver fravaer.skriv.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  /* ⚠ ADMIN-SDK'ET GAAR UDEN OM REGLERNE. Uden de her blokke var funktionen
     en aaben doer rundt om abonnements- og modulspaerringen. */
  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child("bemanding").val() !== true) {
    throw new HttpsError("permission-denied", "Bemanding-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const fravaerId = kortStreng(d.fravaerId, 60);
  if (!fravaerId) throw new HttpsError("invalid-argument", "fravaerId mangler.");

  const tilStatus = kortStreng(d.status, 20);
  const svar = d.svar != null ? kortStreng(d.svar, 300) : undefined;

  /* ⚠ KUN DISSE TRE FELTER LÆSES FRA KLIENTEN. Ingen personId, ingen fra/til
     — se hovedet. */
  const foer = (await rod.child(`fravaer/${fravaerId}`).once("value")).val();
  if (!foer) throw new HttpsError("not-found", `Fraværet ${fravaerId} findes ikke.`);

  /* ⚠ SAMME MASKINE SOM SKÆRMEN VISER. */
  const tjek = kanAfgoereAnsoegning(foer, tilStatus);
  if (!tjek.ok) throw new HttpsError("failed-precondition", tjek.aarsag);

  const nu = Date.now();
  const nyAnsoegning = {
    ...foer.ansoegning,
    status: tilStatus,
    afgjortAf: uid,
    afgjortMs: nu,
  };
  if (svar) nyAnsoegning.svar = svar;

  /* ⚠ SAMME VALIDERING SOM SKÆRMEN VISER, EN GANG TIL — reglens `.validate`
     på `ansoegning` kræver kun `hasChildren`; formens egne grænser (kun de
     tre ansøgbare arter, svar på højst 300 tegn, kun kendte felter) er ikke
     håndhævet af Admin-SDK'et, og skal derfor prøves her, som i
     opgaveplanlaeg. */
  const problemer = valideAnsoegning({ ...foer, ansoegning: nyAnsoegning }, { nu });
  if (problemer.length) {
    throw new HttpsError("invalid-argument", problemer.join(" "));
  }

  const opdatering = {};
  opdatering[`fravaer/${fravaerId}/ansoegning`] = nyAnsoegning;

  /* ---- Godkendt: reservationen skrives i SAMME update() ---------------- */
  let reservationId = null;
  if (tilStatus === "godkendt") {
    let ny;
    try {
      ny = reservationFraFravaer({ ...foer, id: fravaerId });
    } catch (e) {
      throw new HttpsError("invalid-argument", e.message);
    }

    const snap = await rod
      .child(`reservationer/${ny.ressourceType}/${ny.ressourceId}`)
      .once("value");
    const eksisterende = Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v }));

    const svarKonflikt = tjekLedigMod(eksisterende, ny);
    if (!svarKonflikt.ok) {
      const foerste = svarKonflikt.konflikter[0];
      const flere = svarKonflikt.konflikter.length > 1
        ? ` (+${svarKonflikt.konflikter.length - 1} mere)` : "";
      throw new HttpsError("failed-precondition",
        (foerste.tekst || konfliktTekst(ny, foerste)) + flere);
    }

    /* Reservationens id er UDLEDT af fravaerId — se hovedet. */
    reservationId = `res-${fravaerId}`;
    opdatering[`reservationer/${ny.ressourceType}/${ny.ressourceId}/${reservationId}`] = {
      fra: ny.fra, til: ny.til,
      kilde: ny.kilde,
      oprettetAf: uid,
      oprettetMs: nu,
    };
  }

  await rod.update(opdatering);

  await logFravaer(tenantId, uid, AUDIT.tilstandsskift, fravaerId,
    { status: foer.ansoegning?.status, personId: foer.personId, fra: foer.fra, til: foer.til },
    { status: tilStatus, personId: foer.personId, fra: foer.fra, til: foer.til },
    `ansøgning ${tilStatus}${reservationId ? ` — ${reservationId}` : ""}`);

  return { fravaerId, status: tilStatus, reservationId };
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
  /* ⚠ B1 — FUNDET VED V1-STABILISERINGSAUDIT. opgaveId skal genereres FØR
     reservationFraOpgave() kaldes, ikke efter: kilde.id sættes til
     opgave.id, og uden det bar hver eneste reservation denne funktion
     nogensinde skrev, kilde.id: undefined — en skrivning RTDB afviser med
     "values argument contains undefined". Servicebesøg kunne derfor ALDRIG
     planlægges gennem UI'et. Samme rettelse som opgaveplanlaeg fik i Skive 3B:
     reservationFraOpgave({ ...post, id: opgaveId }). */
  const opgaveId = rod.child("opgaver").push().key;
  let ny;
  try {
    ny = reservationFraOpgave({ ...post, id: opgaveId });
  } catch (e) {
    throw new HttpsError("invalid-argument", e.message);
  }

  /* ---- Er ressourcen ledig? ------------------------------------------- */
  /* ⚠ OG ER RUMMET LEDIGT? En reservation på `lokation/lok-halb` og en på
     `facilityAktiv/fa-port3` er to STIER, men ét fysisk rum: lukker man
     hallen, er porten i den også optaget. Anlæggene hentes derfor med, og
     tjekket køres mod hele indeslutningen. Se beslutning 90. */
  const aktiver = (await rod.child("facility/aktiver").once("value")).val() || {};
  const stier = [
    { ressourceType: ny.ressourceType, ressourceId: ny.ressourceId },
    ...indeslutninger(ny, { aktiver }),
  ];
  const grupper = await Promise.all(stier.map(async (s) => {
    const snap = await rod
      .child(`reservationer/${s.ressourceType}/${s.ressourceId}`)
      .once("value");
    return {
      ...s,
      reservationer: Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v })),
    };
  }));

  const svar = tjekLedigIndesluttet(ny, grupper);
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
  /* opgaveId er allerede genereret ovenfor, før reservationFraOpgave(). */
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
  /* ⚠ OG ER RUMMET LEDIGT? Samme udvidelse som i `facilityplanlaeg`: hallen
     og porten i den er to STIER og ét fysisk rum. Var tjekket kun i
     oprettelsen, kunne man oprette lovligt og FLYTTE ind i en optaget hal —
     og et halvt tjek er værre end ingen, fordi det ligner et helt.
     Anlæggene hentes kun for facility-arten; en værkstedsopgave paa et
     koeretoej har ingen indeslutning. Se beslutning 90. */
  const aktiver = ny.ressourceType === "koeretoej"
    ? {}
    : (await rod.child("facility/aktiver").once("value")).val() || {};
  const stier = [
    { ressourceType: ny.ressourceType, ressourceId: ny.ressourceId },
    ...indeslutninger(ny, { aktiver }),
  ];
  const grupper = await Promise.all(stier.map(async (s) => {
    const snap = await rod
      .child(`reservationer/${s.ressourceType}/${s.ressourceId}`)
      .once("value");
    return {
      ...s,
      reservationer: Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v })),
    };
  }));

  /* ⚠ `ny` BAERER SIT UDLEDTE ID, og det er ikke pynt: tjekLedigMod()
     filtrerer paa `r.id !== ny.id`, saa uden det ville opgavens EGEN gamle
     reservation blive meldt som konflikt. En flytning paa to timer paa samme
     bil ville altid blive afvist — af opgaven selv. Se flytOpdatering(). */
  const svar = tjekLedigIndesluttet(ny, grupper);
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

/* ══════════════════════════════════════════════════════════════════════════
   LEVERANDØRPORTAL — tillægskrav "EXTERNAL SUPPLIER / VÆRKSTEDSPORTAL"
   ══════════════════════════════════════════════════════════════════════════

   ⚠ EN EKSTERN BRUGER BÆRER INGEN {tenant, rolle, perms}-CLAIM. Den form er
   INTERNENS — én tenant, én af de seks faste rollenavne — og en ekstern
   leverandørbruger passer ikke i den: samme værksted kan arbejde for flere
   FleetControl-kunder. Der er derfor intet at læse fra `auth.token` her.
   Hver eneste funktion nedenfor slår i stedet sin egen ret op i
   `leverandoerPortalAdgang/<uid>/<tenantId>` — den tredje bevidste
   tenant-grænsekrydsning, se firebase.rules.json's egen note ved noden.

   ⚠ KLIENTEN SENDER tenantId SOM EN VÆLGER, IKKE EN AUTORITET. Findes der
   intet aktivt grant for netop den kombination af det VERIFICEREDE
   `auth.uid` og det PÅSTÅEDE tenantId, afvises kaldet — uanset hvad
   klienten ellers hævder. Det er selve pointen: en manipuleret tenantId
   eller leverandoerId kan aldrig blive til en autoritet, kun til en
   afvisning.

   ⚠ STATUSSKIFT FRA PORTALEN ER SNÆVRERE END DEN INTERNE MASKINE — med
   vilje. `LEVERANDOER_TILLADTE_SKIFT` (leverandoerportal-regler.js) er en
   delmængde af opgavens fulde tilstandskatalog: en leverandør kan ALDRIG
   sætte `udfoert` eller `annulleret` — kun de to trin der er HANS del af
   arbejdet (tillægskravets §10/§11). Han lukker aldrig den interne sag
   selv.

   ⚠ F.2 — DOKUMENTER/FOTOS. `leverandoerDokumentDownloadLink` (nederst i
   denne sektion) er den ENESTE vej en ekstern bruger kan få et link til en
   fil — den bruger `kraevLeverandoerGrant()` som alt andet herunder, og
   verificerer DEREFTER at netop DET dokument er markeret
   `synligForLeverandoer` OG hænger på en opgave tildelt netop hans
   leverandoerId. Selve upload/deling sker udelukkende internt — se
   OPGAVEDOKUMENTER-sektionen ovenfor. Se
   docs/v1-user-feedback-implementation/00_MASTER_STATUS.md.
   ══════════════════════════════════════════════════════════════════════════ */

/* Samme figur som logOpgave/logIndberetning/logProcure — se logOpgave for
   hvorfor mønstret ikke er én generisk funktion med et objektnavn som
   parameter (det ER det, andre steder; her er den skrevet ud igen af
   samme grund som ordreMailSend ikke deler sin logik med sagMailSend). */
async function logLeverandoerPortal(tenantId, uid, handling, id, foer, efter, note) {
  const d = diff(foer, efter);
  const klasse = klasseFor(handling, "leverandoerPortalAdgang");
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${tenantId}/${klasse}/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt: "leverandoerPortalAdgang", objektId: id,
      klasse, aendrede: d.aendrede, foer: d.foer, efter: d.efter, note: note ?? null,
    });
}

/**
 * kraevLeverandoerGrant(req) → { uid, tenantId, leverandoerId }
 *
 * Fælles indgang for hver portalfunktion nedenfor — samme rolle som
 * kraevBrugeradmin() har for den interne brugeradministration. tenantId er
 * en vælger; leverandoerId kommer ALDRIG fra klienten, kun fra det fundne
 * grant. Se sektionens eget hoved.
 */
async function kraevLeverandoerGrant(req) {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = kortStreng(req.data?.tenantId, 60);
  if (!tenantId) throw new HttpsError("invalid-argument", "Der mangler et tenantId.");

  const db = getDatabase();
  const grant = (await db.ref(`leverandoerPortalAdgang/${auth.uid}/${tenantId}`).once("value")).val();
  if (!grant || grant.aktiv !== true) {
    throw new HttpsError("permission-denied", "Du har ikke portaladgang til denne virksomhed.");
  }

  const findes = await db.ref(`tenants/${tenantId}/_findes`).once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await db.ref(`tenants/${tenantId}/abonnement/status`).once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  return { uid: auth.uid, tenantId, leverandoerId: grant.leverandoerId };
}

/**
 * leverandoerPortalTenanter(req) → { tenanter: [{ tenantId, leverandoerNavn }] }
 *
 * ⚠ HVORFOR DEN FINDES. `leverandoerPortalAdgang` har hverken .read eller
 * .write for nogen klient (se firebase.rules.json's egen note) — en ekstern
 * bruger kan derfor ikke selv slå op HVILKE tenants han har adgang til.
 * Uden denne funktion ville portalens login-skærm skulle GÆTTE et tenantId
 * for at kunne kalde kraevLeverandoerGrant() overhovedet. Dette er den ENE
 * plads hvor en ekstern bruger må se noget om sine egne grants — kun
 * LISTEN, kun for sig selv (auth.uid), og kun navn + id, intet om andre
 * leverandørers data i samme tenant.
 */
export const leverandoerPortalTenanter = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const db = getDatabase();
  const grants = (await db.ref(`leverandoerPortalAdgang/${auth.uid}`).once("value")).val() || {};

  const tenanter = [];
  for (const [tenantId, grant] of Object.entries(grants)) {
    if (grant?.aktiv !== true) continue;
    const lev = (await db.ref(`tenants/${tenantId}/leverandoerer/${grant.leverandoerId}`).once("value")).val();
    tenanter.push({ tenantId, leverandoerNavn: lev?.navn || null });
  }
  return { tenanter };
});

/**
 * leverandoerPortalOpgaver(req) → { aktive: [...], afsluttede: [...] }
 *
 * ⚠ SERVEREN FILTRERER, IKKE KLIENTEN. Hele opgave-noden hentes med
 * Admin SDK og filtreres i fordelPortalOpgaver() (leverandoerportal-
 * regler.js) på leverandoerId — der er intet klient-forespørgselsparameter
 * der kunne bede om en anden leverandørs opgaver.
 */
export const leverandoerPortalOpgaver = onCall({ region: REGION }, async (req) => {
  const { tenantId, leverandoerId } = await kraevLeverandoerGrant(req);
  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const [alleSnap, koeretoejerSnap] = await Promise.all([
    rod.child("opgaver").once("value"),
    rod.child("koeretoejer").once("value"),
  ]);
  const alle = alleSnap.val() || {};
  const koeretoejer = koeretoejerSnap.val() || {};

  return fordelPortalOpgaver(Object.entries(alle), leverandoerId, koeretoejer);
});

/**
 * leverandoerTilbudIndsend(req) → { tilbudId }
 *
 * ⚠ ALTID ET NYT push()-BARN, ALDRIG EN OVERSKRIVNING. §8: et senere
 * overslag er en NY historisk post, ikke en rettelse af den gamle.
 */
export const leverandoerTilbudIndsend = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId, leverandoerId } = await kraevLeverandoerGrant(req);
  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const d = req.data || {};
  const opgaveId = kortStreng(d.opgaveId, 60);
  if (!opgaveId) throw new HttpsError("invalid-argument", "Der mangler et opgaveId.");

  const opgave = (await rod.child(`opgaver/${opgaveId}`).once("value")).val();
  if (!opgave) throw new HttpsError("not-found", "Opgaven findes ikke.");
  /* ⚠ DEN AFGØRENDE KONTROL. leverandoerId kommer fra GRANTET (ovenfor),
     ikke fra klientens nyttelast — en manipuleret opgaveId rammer derfor
     enten en opgave der er tildelt EN ANDEN leverandør (afvist her) eller
     slet ikke findes (afvist ovenfor). */
  if (opgave.leverandoerId !== leverandoerId) {
    throw new HttpsError("permission-denied", "Denne opgave er ikke tildelt din virksomhed.");
  }

  const beloebOere = Number(d.beloebOere);
  if (!Number.isFinite(beloebOere) || beloebOere < 0 || beloebOere % 1 !== 0) {
    throw new HttpsError("invalid-argument", "Beløbet skal være et helt antal øre, mindst 0.");
  }
  const valuta = kortStreng(d.valuta, 3);
  if (!valuta || !/^(DKK|SEK|NOK|EUR)$/.test(valuta)) {
    throw new HttpsError("invalid-argument", "Ukendt valuta.");
  }
  const kommentar = kortStreng(d.kommentar, 500);
  const raaFaerdig = Number(d.forventetFaerdigMs);
  const forventetFaerdigMs = Number.isFinite(raaFaerdig) ? raaFaerdig : undefined;

  const tilbudRef = rod.child(`opgaver/${opgaveId}/leverandoertilbud`).push();
  await tilbudRef.set({
    beloebOere, valuta, leverandoerId,
    indsendtAf: uid, indsendtMs: Date.now(), status: "afventer",
    ...(kommentar ? { kommentar } : {}),
    ...(forventetFaerdigMs !== undefined ? { forventetFaerdigMs } : {}),
  });

  await logOpgave(tenantId, uid, AUDIT.opret, opgaveId, null,
    { leverandoerId, beloebOere, valuta, status: "afventer" },
    `prisoverslag ${tilbudRef.key} indsendt via leverandørportal`);

  return { tilbudId: tilbudRef.key };
});

/**
 * leverandoerStatusOpdater(req) → { opgaveId, status }
 *
 * ⚠ TO LAG, IKKE ÉT. LEVERANDOER_TILLADTE_SKIFT afgør hvad en EKSTERN
 * bruger overhovedet kan nå (kan aldrig blive udfoert/annulleret);
 * kanSkifteOpgave() prøves DEREFTER som samme maskine skærmen og
 * opgavestatus selv bruger. Et fremtidigt hul i det ene lag fanges af det
 * andet.
 */
export const leverandoerStatusOpdater = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId, leverandoerId } = await kraevLeverandoerGrant(req);
  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const d = req.data || {};
  const opgaveId = kortStreng(d.opgaveId, 60);
  const tilStatus = kortStreng(d.status, 40);
  if (!opgaveId) throw new HttpsError("invalid-argument", "Der mangler et opgaveId.");
  if (!tilStatus) throw new HttpsError("invalid-argument", "Der mangler en status.");

  const foer = (await rod.child(`opgaver/${opgaveId}`).once("value")).val();
  if (!foer) throw new HttpsError("not-found", "Opgaven findes ikke.");
  if (foer.leverandoerId !== leverandoerId) {
    throw new HttpsError("permission-denied", "Denne opgave er ikke tildelt din virksomhed.");
  }

  if (!kanLeverandoerSkifte(foer.status, tilStatus)) {
    throw new HttpsError("permission-denied",
      "Leverandørportalen kan ikke sætte denne status fra opgavens nuværende status.");
  }
  const tjek = kanSkifteOpgave(foer, tilStatus);
  if (!tjek.ok) throw new HttpsError("failed-precondition", tjek.aarsag);

  const { opdatering, efter } = statusOpdatering(opgaveId, foer, tilStatus, { uid, nu: Date.now() });
  await rod.update(opdatering);

  await logOpgave(tenantId, uid, AUDIT.tilstandsskift, opgaveId, foer, efter,
    `${foer.status} -> ${tilStatus} (leverandørportal)`);

  return { opgaveId, status: tilStatus };
});

/**
 * kraevLeverandoererAdmin(req) → { uid, tenantId }
 *
 * ⚠ leverandoerer.skriv, IKKE brugere.skriv. At invitere en portalbruger
 * er en handling PÅ leverandørkortet, ikke intern brugeradministration —
 * "spørg hvad handlingen kræver, ikke hvem brugeren er" (CLAUDE.md).
 */
function kraevLeverandoererAdmin(req) {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";
  if (!perms.includes("|leverandoerer.skriv|")) {
    throw new HttpsError("permission-denied", "Kræver leverandoerer.skriv.");
  }
  return { uid: auth.uid, tenantId };
}

/**
 * leverandoerPortalInviter(req) → { uid, nyKonto, mailStatus }
 *
 * ⚠ INGEN LØSEN SÆTTES HER — modsat opretKonto() for interne brugere,
 * hvor den der opretter, vælger kodeordet. Der findes intet eksisterende
 * invitations-/nulstillingsflow i dette repo (bekræftet: ingen brug af
 * generatePasswordResetLink/generateSignInWithEmailLink nogen steder før
 * denne funktion) — men Firebase Auth understøtter det allerede som en
 * indbygget, sikker mekanisme, og det er den der bruges her i stedet for
 * at opfinde en hjemmelavet password-distribution. Se tillægskravets §18:
 * "Ingen password i mail eller database... STOP og rapportér den
 * konkrete auth-beslutning før der bygges hjemmelavet
 * password-distribution" — dette ER den rapporterede beslutning.
 *
 * ⚠ ÉN KONTO KAN HAVE FLERE GRANTS. Findes en Firebase Auth-bruger med
 * mailadressen allerede (fordi han er inviteret af en ANDEN FleetControl-
 * kunde), oprettes der ikke en ny konto — kun et nyt grant for DENNE
 * tenant. Samme person, to arbejdsgivere, ét login.
 */
export const leverandoerPortalInviter = onCall({
  region: REGION,
  secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_AFSENDER],
}, async (req) => {
  const { uid, tenantId } = kraevLeverandoererAdmin(req);
  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const d = req.data || {};
  const leverandoerId = kortStreng(d.leverandoerId, 60);
  if (!leverandoerId) throw new HttpsError("invalid-argument", "leverandoerId mangler.");
  const lev = (await rod.child(`leverandoerer/${leverandoerId}`).once("value")).val();
  if (!lev) throw new HttpsError("not-found", "Leverandøren findes ikke.");
  if (!lev.portalAdgang?.enabled) {
    throw new HttpsError("failed-precondition",
      "Portaladgang er ikke slået til for denne leverandør. Slå den til under Opsætning → Leverandører først.");
  }

  const email = kortStreng(d.email, 120)?.toLowerCase();
  if (!email || !erGyldigMail(email)) {
    throw new HttpsError("invalid-argument", "Ugyldig mailadresse.");
  }
  const navn = kortStreng(d.navn, 80) || email;

  const eksternAuth = getAuth();
  let bruger;
  let nyKonto = false;
  try {
    bruger = await eksternAuth.getUserByEmail(email);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
  }
  if (!bruger) {
    bruger = await eksternAuth.createUser({ email, displayName: navn, emailVerified: false });
    nyKonto = true;
  }

  const grantRef = db.ref(`leverandoerPortalAdgang/${bruger.uid}/${tenantId}`);
  const grantFoer = (await grantRef.once("value")).val();
  const grantEfter = {
    leverandoerId, aktiv: true,
    oprettetMs: grantFoer?.oprettetMs ?? Date.now(), oprettetAf: grantFoer?.oprettetAf ?? uid,
  };
  /* ⚠ ÉN update() PÅ ROD-REFERENCEN, TO ABSOLUTTE STIER. Grantet
     (autoriteten, leverandoerPortalAdgang) og dets pr.-tenant spejling
     (leverandoerPortalBrugere, kun til visning) er ÉN kendsgerning skrevet
     to steder — samme disciplin som opgaver+reservation (beslutning 45).
     Et enkelt update() på flere absolutte stier er atomisk i RTDB. */
  await db.ref().update({
    [`leverandoerPortalAdgang/${bruger.uid}/${tenantId}`]: grantEfter,
    [`tenants/${tenantId}/leverandoerPortalBrugere/${leverandoerId}/${bruger.uid}`]: {
      email, navn, aktiv: true, oprettetMs: grantEfter.oprettetMs,
    },
  });

  await logLeverandoerPortal(tenantId, uid, grantFoer ? AUDIT.aendre : AUDIT.opret,
    bruger.uid, grantFoer, grantEfter,
    `portaladgang ${grantFoer ? "genaktiveret" : "oprettet"} for leverandør ${leverandoerId}`);

  /* ⚠ INGEN actionCodeSettings.url ENDNU. Ruten /leverandoerportal/login
     findes nu (UI-skiven er bygget) — det der stadig mangler, er et FAST
     domæne. En brugerdefineret continue-URL skal stå på Firebase Auths
     egen liste over godkendte domæner, og appen ligger på Netlify med
     forskellig URL pr. kontekst (produktion/preview/branch, se
     netlify.toml) — ikke ét domæne en Cloud Function kan kende uden en ny
     konfigurationsbeslutning (et miljøvariabel/secret for "det aktuelle
     produktionsdomæne"). Uden url falder linket tilbage på Firebases egen
     hostede nulstillingsside, hvilket er et RIGTIGT, sikkert link — bare
     ikke i FleetControls eget design endnu. */
  const link = await eksternAuth.generatePasswordResetLink(email);
  const emne = saniterHeaderFelt("Adgang til FleetControl leverandørportal", 250);
  const tekst =
    `Hej ${navn},\n\n` +
    `${lev.navn} har fået adgang til FleetControl leverandørportal, hvor I kan se ` +
    `tildelte opgaver, sende prisoverslag og melde arbejde klar til afhentning.\n\n` +
    `Sæt din adgangskode her:\n${link}\n\n` +
    `Linket er personligt og udløber efter kort tid.`;
  const resultat = await sendMail(MAIL_ADAPTER, { til: email, emne, tekst });

  return { uid: bruger.uid, nyKonto, mailStatus: resultat.status };
});

/**
 * leverandoerPortalAdgangDeaktiver(req) → { uid, aktiv }
 */
export const leverandoerPortalAdgangDeaktiver = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId } = kraevLeverandoererAdmin(req);
  const db = getDatabase();

  const d = req.data || {};
  const eksternUid = kortStreng(d.uid, 128);
  if (!eksternUid) throw new HttpsError("invalid-argument", "uid mangler.");

  const grantRef = db.ref(`leverandoerPortalAdgang/${eksternUid}/${tenantId}`);
  const foer = (await grantRef.once("value")).val();
  if (!foer) {
    throw new HttpsError("not-found", "Ingen portaladgang fundet for denne bruger på denne tenant.");
  }

  const efter = { ...foer, aktiv: false };
  /* ⚠ SAMME MULTI-PATH update() SOM leverandoerPortalInviter — grantet og
     dets spejling må ikke kunne komme ud af sync. Spejlingens email/navn
     røres ikke; kun aktiv-feltet ændrer sig. */
  await db.ref().update({
    [`leverandoerPortalAdgang/${eksternUid}/${tenantId}`]: efter,
    [`tenants/${tenantId}/leverandoerPortalBrugere/${foer.leverandoerId}/${eksternUid}/aktiv`]: false,
  });

  await logLeverandoerPortal(tenantId, uid, AUDIT.tilstandsskift, eksternUid, foer, efter,
    "portaladgang deaktiveret");

  return { uid: eksternUid, aktiv: false };
});

/**
 * leverandoerPortalBrugere(req) → { brugere: [{ uid, email, navn, aktiv, sidsteLoginMs }] }
 *
 * §18: "Vis: ... Eksterne brugere, Seneste login hvis data findes
 * sikkert, Deaktiver adgang". Listen selv kommer fra spejlingen
 * (tenants/$tenantId/leverandoerPortalBrugere/$leverandoerId) — men
 * "seneste login" GEMMES ingen steder i RTDB (det ville være endnu et
 * felt der kan komme ud af sync med virkeligheden). Firebase Auth kender
 * det allerede, autoritativt, pr. konto — så det hentes LIVE her, ikke
 * lagret. En slettet eller utilgængelig ekstern konto fejler ikke hele
 * listen; den viser bare uden et login-tidspunkt.
 */
export const leverandoerPortalBrugere = onCall({ region: REGION }, async (req) => {
  const { tenantId } = kraevLeverandoererAdmin(req);
  const db = getDatabase();

  const d = req.data || {};
  const leverandoerId = kortStreng(d.leverandoerId, 60);
  if (!leverandoerId) throw new HttpsError("invalid-argument", "leverandoerId mangler.");

  const spejling = (await db.ref(`tenants/${tenantId}/leverandoerPortalBrugere/${leverandoerId}`).once("value")).val() || {};
  const eksternAuth = getAuth();

  const brugere = await Promise.all(Object.entries(spejling).map(async ([uidPost, post]) => {
    let sidsteLoginMs = null;
    try {
      const konto = await eksternAuth.getUser(uidPost);
      const t = konto.metadata?.lastSignInTime;
      sidsteLoginMs = t ? new Date(t).getTime() : null;
    } catch {
      /* Kontoen findes ikke længere i Firebase Auth (slettet uden om
         leverandoerPortalAdgangDeaktiver) — vis spejlingen alligevel, uden
         et login-tidspunkt, frem for at lade hele listen fejle på én
         forældreløs post. */
    }
    return { uid: uidPost, email: post.email, navn: post.navn || null, aktiv: post.aktiv === true, sidsteLoginMs };
  }));

  return { brugere };
});

/**
 * leverandoerDokumentDownloadLink({ tenantId, opgaveId, dokumentId }) → { url, udloeberMs }
 *
 * F.2 — den ENESTE vej en ekstern leverandørbruger kan få et link til et
 * opgave-vedhæftet dokument. Tre uafhængige spærringer, alle server-side:
 *
 *   1. kraevLeverandoerGrant() — aktivt grant for netop dette uid+tenantId.
 *   2. opgave.leverandoerId === leverandoerId — samme "afgørende kontrol"
 *      som leverandoerTilbudIndsend/leverandoerStatusOpdater bruger; en
 *      manipuleret opgaveId rammer enten en fremmed leverandørs opgave
 *      (afvist her) eller findes slet ikke (afvist ovenfor).
 *   3. dok.status === "aktiv" && dok.synligForLeverandoer === true — et
 *      dokument nogen internt har uploadet, men IKKE eksplicit delt (se
 *      OPGAVEDOKUMENTER-sektionen), er usynligt for portalen, uanset at
 *      opgaven i øvrigt er hans.
 *
 * ⚠ SAMME 5-MINUTTERS TTL OG SAMME "LINKET STÅR ALDRIG I AUDITPOSTEN" SOM
 * dokumentDownloadLink/opgaveDokumentDownloadLink — se de to funktioners
 * egne noter.
 */
export const leverandoerDokumentDownloadLink = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId, leverandoerId } = await kraevLeverandoerGrant(req);
  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const d = req.data || {};
  const opgaveId = kortStreng(d.opgaveId, 60);
  const dokumentId = kortStreng(d.dokumentId, 60);
  if (!opgaveId || !dokumentId) {
    throw new HttpsError("invalid-argument", "opgaveId/dokumentId mangler.");
  }

  const opgave = (await rod.child(`opgaver/${opgaveId}`).once("value")).val();
  if (!opgave) throw new HttpsError("not-found", "Opgaven findes ikke.");
  if (opgave.leverandoerId !== leverandoerId) {
    throw new HttpsError("permission-denied", "Denne opgave er ikke tildelt din virksomhed.");
  }

  const dok = (await rod.child(`opgaver/${opgaveId}/dokumenter/${dokumentId}`).once("value")).val();
  if (!dok) throw new HttpsError("not-found", "Dokumentet findes ikke.");
  if (dok.status !== "aktiv" || dok.synligForLeverandoer !== true) {
    throw new HttpsError("permission-denied", "Dette dokument er ikke delt med dig.");
  }

  const TTL_MS = 5 * 60 * 1000;
  const nu = Date.now();
  const bucket = getStorage().bucket();
  const [url] = await bucket.file(dok.storagePath).getSignedUrl({
    version: "v4", action: "read", expires: nu + TTL_MS,
  });

  await logProcure(tenantId, uid, AUDIT.laes, "opgaveDokument", dokumentId,
    null, null, "download-link udstedt til ekstern leverandørbruger");

  return { url, udloeberMs: nu + TTL_MS };
});

/**
 * Chaufførens statusmelding fra turen — beslutning 103.
 *
 * ⚠ NODEN FANDTES IKKE. `rutestatus.js` har kunnet læse meldinger siden
 * beslutning 22, og der var ingen der kunne skrive dem: `statushaendelser`
 * stod hverken i `firebase.rules.json` eller i seedet. Rute & status viste
 * "Ingen meldinger" på hver eneste tur, for alle, og skærmen var ikke i
 * stykker — der var bare ingen kilde.
 *
 * ⚠ HVORFOR VEJEN ER LUKKET (`.write: false`).
 * En regel kan sammenligne to felter i den skrivning den ser. Den kan IKKE
 * svare på "er den her etape chaufførens": etapen bærer et `personId`, tokenet
 * bærer et `uid`, og oversættelsen står i `brugere/<uid>/personId`. Sendte
 * klienten sit eget personId med, kunne han sende hvad som helst — og melde
 * en kollega ankommet til en rampe han aldrig har set.
 *
 * ⚠ OG DEN SKELNEN ER PRÆCIS uid MOD personId.
 * Vi slår OP med `personId` (hvem meldingen HANDLER om — hvis tur det er) og
 * SKRIVER `uid` (hvem der GJORDE det). Byttede vi om, ville en melding stå i
 * navnet på en medarbejder frem for på det login der sendte den, og
 * ejerskabstjek andre steder ville sammenligne et personId med et uid og
 * aldrig matche.
 *
 * ⚠ EN MELDING ER IKKE ET TILSTANDSSKIFT. Etapens tilstand skiftes af
 * `etapeskift` og kun dér (beslutning 40). En chauffør der melder "aflæsset",
 * fortæller hvad han har gjort; han afslutter ikke turen i systemets forstand.
 * Blandede vi de to, kunne en melding fra en telefon uden dækning lande fire
 * timer for sent og flytte en booking der allerede var faktureret.
 *
 * ⚠ TIDSPUNKTET KOMMER FRA TELEFONEN, IKKE FRA SERVEREN — se noten i
 * rutestatus.js. Det er det modsatte af `udleveretMs` på et kasseudlån, og
 * forskellen er forbindelsen.
 *
 * ⚠ DER SKRIVES INGEN AUDITPOST, og det er et valg.
 * Meldingen ER sit eget spor: den bærer `uid` og `ms`, noden er `.write:
 * false`, og der findes ingen vej der kan rette eller slette den. En
 * auditpost ville være den samme kendsgerning gemt to steder — det er
 * `bemanding.ledig` igen. Og mængden er en anden: en chauffør sender seks
 * meldinger pr. tur, hvor et rolleskifte sker en gang om måneden. Skal
 * meldinger kunne udtrækkes til en sag, er det `statushaendelser` man læser.
 */
export const statusmelding = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  /* ⚠ LÆSEPERMISSIONEN, IKKE EN SKRIVEPERMISSION. En chauffør har `BASIS_LAES`
     og `indberetninger.skriv` — han har med vilje ikke `booking.skriv`, for
     han må ikke flytte en tur. At melde hvor han er, er ikke at ændre turen;
     kravet er at han overhovedet må se den. Ejerskabet nedenfor er det der
     afgrænser ham. */
  if (!perms.includes("|booking.laes|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke se ture, og kan derfor ikke melde på en.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  /* ⚠ ADMIN-SDK'ET GÅR UDEN OM REGLERNE — også om abonnements- og
     modulklausulen på noden. Uden de her blokke var funktionen en åben dør. */
  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child("booking").val() !== true) {
    throw new HttpsError("permission-denied", "Modulet booking er ikke aktivt.");
  }

  const d = req.data || {};
  const etapeId = kortStreng(d.etapeId, 60);
  if (!etapeId) throw new HttpsError("invalid-argument", "Der mangler et etapeId.");

  const etape = (await rod.child(`etaper/${etapeId}`).once("value")).val();
  if (!etape) throw new HttpsError("not-found", `Etapen ${etapeId} findes ikke.`);

  /* ---- Er det HANS tur? ------------------------------------------------ */
  /* ⚠ KOBLINGEN SLÅS OP PÅ SERVEREN, HVER GANG. Den ligger i brugerposten,
     som er `.write: false` — en klient kan hverken sætte eller flytte den. */
  const personId = (await rod.child(`brugere/${uid}/personId`).once("value")).val();

  /* ⚠ EN DISPONENT MÅ OGSÅ MELDE. Han sidder med chaufføren i telefonen, og
     et system hvor kun føreren kan melde, får meldingen skrevet i en
     notesblok i stedet. Han skal kunne SKRIVE turen for at gøre det. */
  /* ⚠ HER STOD `booking.skriv`, OG DEN PERMISSION FINDES IKKE. Grenen kunne
     aldrig fyre, så undtagelsen var skrevet ned og virkede ikke — en
     disponent i telefonen med chaufføren fik at vide at HANS bruger ikke var
     koblet til en medarbejder. Målt i en ende-til-ende-kørsel mod DEV, ikke
     læst frem: alle ti booking-permissions hedder noget andet.

     `booking.udfoer` er den rigtige — den betyder at måtte gribe ind i en tur
     der KØRER, og disponent, koordinator og admin har den. `booking.opret`
     ville have været forkert: den der opretter en forespørgsel, har
     ikke noget med turen at gøre når den ruller. */
  const maaDisponere = perms.includes("|booking.udfoer|");
  const erHans = personId != null && etape.personId === personId;

  if (!erHans && !maaDisponere) {
    /* ⚠ TO GRUNDE, TO SVAR. "Du har intet medarbejderkort" rettes i
       Opsætning; "det er ikke din tur" er en fejl i disponeringen. Ét svar
       til begge ville sende chaufføren det forkerte sted hen. */
    if (personId == null) {
      throw new HttpsError("failed-precondition",
        "Din bruger er ikke koblet til en medarbejder, så systemet kan ikke se "
        + "hvilke ture der er dine. Kontakt din administrator.");
    }
    throw new HttpsError("permission-denied",
      "Etapen er ikke din, og du må ikke disponere.");
  }

  /* ---- Må meldingen skrives? ------------------------------------------- */
  /* ⚠ ET UKENDT FELT AFVISES, DET DROPPES IKKE TAVST.
     Her stod kun `valideMelding(forslag)`, og den kunne aldrig se et ukendt
     felt: `byggMelding()` kopierer felt for felt, så `sted: "Padborg"` var
     allerede væk når prøven kørte. Klienten sendte noget systemet ikke
     forstår og fik **OK** tilbage — målt i en ende-til-ende-kørsel.

     Det er den tavse fejlklasse: reglens `$andet: false` ville have afvist
     feltet, men noden er `.write: false`, så den regel nås aldrig af en
     klient. Prøven skal derfor stå på det klienten SENDTE, ikke på det vi
     byggede af det. */
  const KENDTE = [...MELDING_FELTER, "etapeId"];
  const ukendte = Object.keys(d).filter((k) => !KENDTE.includes(k));
  if (ukendte.length) {
    throw new HttpsError("invalid-argument",
      `Ukendt felt: ${ukendte.join(", ")}`);
  }
  /* ⚠ OG uid HØRER IKKE MED, selv om det står i MELDING_FELTER: serveren
     sætter det. En klient der sendte sit eget, ville melde i en kollegas
     navn — så det afvises frem for at blive overskrevet i stilhed. */
  if ("uid" in d) {
    throw new HttpsError("invalid-argument",
      "uid sættes af serveren og kan ikke sendes med.");
  }

  /* ⚠ SAMME valideMelding() SOM APPEN PRØVEDE MED. Serveren afviser med den
     SAMME sætning skærmen ville have vist. */
  const forslag = byggMelding({
    type: kortStreng(d.type, 40),
    ms: Number(d.ms),
    klientId: kortStreng(d.klientId, 60),
    stopId: kortStreng(d.stopId, 60),
    forsinketMin: Number.isFinite(Number(d.forsinketMin))
      ? Math.round(Number(d.forsinketMin)) : null,
    note: typeof d.note === "string" ? d.note : null,
  });
  const fejl = valideMelding(forslag, { etape });
  if (fejl.length) throw new HttpsError("invalid-argument", fejl.join(" "));

  /* ⚠ TIDSPUNKTET PRØVES MOD ET VINDUE, det tages ikke for pålydende.
     Telefonens ur kan være forkert, og en melding dateret i 1970 eller i 2031
     ville stå først eller sidst på hver eneste tidslinje for altid. Vinduet er
     bredt med vilje: en melding sendt i en tunnel må gerne lande timer senere,
     og det er hele grunden til at tiden kommer fra telefonen. */
  const nu = Date.now();
  const DOEGN = 24 * 60 * 60 * 1000;
  if (forslag.ms < nu - 7 * DOEGN || forslag.ms > nu + DOEGN) {
    throw new HttpsError("invalid-argument",
      "Tidspunktet ligger for langt fra nu. Tjek telefonens ur.");
  }

  /* ---- Skrivningen ------------------------------------------------------ */
  /* ⚠ NØGLEN ER klientId, IKKE push(). Sender telefonen den samme melding to
     gange — fordi svaret forsvandt i en tunnel — bliver den anden den SAMME
     post og ikke en post mere. Med push() ville en dårlig forbindelse give
     dobbelte meldinger på tidslinjen, og `stilhedMin()` ville se en aktivitet
     der ikke fandt sted. Appen sender ikke i kø endnu, men modellen skal kunne
     bære det. */
  const sti = `statushaendelser/${etapeId}/${forslag.klientId}`;
  await rod.child(sti).set({ ...forslag, uid });

  return { etapeId, meldingId: forslag.klientId, type: forslag.type, ms: forslag.ms };
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
   BEHOVSKRIV — den eneste vej ind i `indkoebsbehov` (beslutning 78, etape 2)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ NODEN ER `.write: false`, OG DET ER VEJEN DER ER LUKKET, IKKE RETTEN.
   Casehandler, disponent og admin HAR `indkoeb.skriv`, og funktionen kraever
   den samme. Men et behov der bliver til en ordre, aendrer TO poster — og de
   skal skrives atomisk. Kunne en klient skrive den ene halvdel, ville et
   behov kunne staa som "bestilt" uden en ordre der findes.

   ⚠ OG FORMEN HAANDHAEVES AF `valideBehov()`, ikke af en kopi her.
   Skaermens formular kalder den samme funktion, saa serveren afviser med den
   SAMME saetning brugeren allerede har set. To formuleringer af én spaerring
   er to forklaringer paa én ting.
   ══════════════════════════════════════════════════════════════════════════ */
export const behovskriv = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";
  if (!perms.includes("|indkoeb.skriv|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke melde et indkøbsbehov ind. Det kræver indkoeb.skriv.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  /* ⚠ ADMIN-SDK'ET GAAR UDEN OM REGLERNE, og reglerne er det eneste sted
     abonnements- og modulspaerringen ellers staar. Uden de her blokke var
     funktionen en aaben doer rundt om begge. */
  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child("indkoeb").val() !== true) {
    throw new HttpsError("permission-denied", "Procure-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const handling = d.handling === "afvis" ? "afvis" : "opret";

  /* ── AFVIS ────────────────────────────────────────────────────────────── */
  if (handling === "afvis") {
    const id = kortStreng(d.id, 60);
    if (!id) throw new HttpsError("invalid-argument", "Intet behov at afvise.");
    const snap = await rod.child(`indkoebsbehov/${id}`).once("value");
    if (!snap.exists()) throw new HttpsError("not-found", "Behovet findes ikke.");
    const foer = snap.val();

    /* ⚠ ET AFVIST BEHOV SLETTES IKKE. Det faar en tilstand og en grund —
       samme regel som resten af systemet: en post tages ud af drift med en
       status, ikke ved at forsvinde. Ellers kan man ikke se at nogen HAR
       meldt ind, og den samme mangel bliver meldt ind igen i naeste uge. */
    if (foer.status === "bestilt") {
      throw new HttpsError("failed-precondition",
        "Behovet er allerede bestilt og kan ikke afvises. Annullér ordren i stedet.");
    }
    const begrundelse = kortStreng(d.begrundelse, 250);
    if (!begrundelse) {
      throw new HttpsError("invalid-argument",
        "Angiv en begrundelse. Den der meldte ind, skal kunne se hvorfor.");
    }
    const efter = {
      ...foer, status: "afvist",
      afvistAf: uid, afvistMs: Date.now(), begrundelse,
    };
    await rod.child(`indkoebsbehov/${id}`).set(efter);
    await logProcure(tenantId, uid, AUDIT.tilstandsskift, "indkoebsbehov", id,
      foer, efter, "behov afvist");
    return { ok: true, id };
  }

  /* ── OPRET ────────────────────────────────────────────────────────────── */
  const post = {
    vare: kortStreng(d.vare, 200),
    kilde: kortStreng(d.kilde, 20),
    status: "nyt",
    oprettetAf: uid,
    oprettetMs: Date.now(),
  };
  /* ⚠ DE VALGFRIE SAETTES KUN NAAR DE ER DER. Et `undefined` i en RTDB-skrivning
     kaster, og et `null` ville slette feltet — begge dele er stoej i en post
     der lige er oprettet. */
  const maaske = {
    antal: Number.isFinite(d.antal) ? d.antal : undefined,
    enhed: kortStreng(d.enhed, 20) || undefined,
    prioritet: kortStreng(d.prioritet, 10) || undefined,
    note: kortStreng(d.note, 250) || undefined,
    varenummer: kortStreng(d.varenummer, 60) || undefined,
    /* ⚠ personId, IKKE uid. `anmoderId` er hvem behovet HANDLER OM — den
       medarbejder der mangler noget. `oprettetAf` er hvem der gjorde det.
       Bytter man om, matcher et ejerskabstjek aldrig. Se CLAUDE.md. */
    anmoderId: kortStreng(d.anmoderId, 60) || undefined,
    leverandoerId: kortStreng(d.leverandoerId, 60) || undefined,
  };
  for (const [k, v] of Object.entries(maaske)) if (v !== undefined) post[k] = v;

  /* ⚠ SAMME FUNKTION SOM SKAERMEN. Se noten i hovedet. */
  const svar = valideBehov(post);
  if (!svar.ok) {
    const foerste = Object.values(svar.fejl)[0];
    throw new HttpsError("invalid-argument", foerste || "Behovet er ikke gyldigt.");
  }

  /* ⚠ LEVERANDOEREN SKAL FINDES. Et behov der peger paa et leverandoerId der
     ikke er der, ville give en bestilling uden en modtager — og fejlen ville
     foerst vise sig naar nogen skulle sende den. Samme tjek som indkoeb har. */
  if (post.leverandoerId) {
    const lev = await rod.child(`leverandoerer/${post.leverandoerId}`).once("value");
    if (!lev.exists()) {
      throw new HttpsError("invalid-argument", "Leverandøren findes ikke.");
    }
  }

  const ref = rod.child("indkoebsbehov").push();
  await ref.set(post);
  await logProcure(tenantId, uid, AUDIT.opret, "indkoebsbehov", ref.key,
    null, post, `behov "${post.vare}" meldt ind fra ${post.kilde}`);
  return { ok: true, id: ref.key };
});

/**
 * Auditpost for Procures noder.
 *
 * ⚠ KUN FELTER PAA ALLOWLISTEN FAAR DERES VAERDI MED — `diff()` sorterer, og
 * `vare` og `note` er FRITEKST fra den der melder ind. Allowlisten findes for
 * at holde tastet tekst ude af loggen; noten herunder er vores egen saetning
 * og ikke brugerens.
 */
async function logProcure(tenantId, uid, handling, objekt, id, foer, efter, note) {
  const d = diff(foer, efter);
  const klasse = klasseFor(handling, objekt);
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${tenantId}/${klasse}/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt, objektId: id,
      klasse,
      aendrede: d.aendrede, foer: d.foer, efter: d.efter,
      note: note ?? null
    });
}


/* ══════════════════════════════════════════════════════════════════════════
   ORDRESKRIV — behov bliver til en bestilling (beslutning 78, etape 3)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ TO POSTER, ÉN SKRIVNING. Ordren oprettes OG behovene faar deres
   `ordreId` og status `bestilt` i den SAMME `update()`. Det er hele grunden
   til at `indkoebsbehov` og `indkoebsordrer` begge er `.write: false`:
   landede den ene halvdel, ville et behov staa som bestilt uden en ordre der
   findes — eller en ordre pege paa behov der stadig ligger i indbakken.

   ⚠ NUMMERET KOMMER FRA TAELLEREN, IKKE FRA EN OPTAELLING.
   `naesteNummer()` med serien `indkoebsordre` — samme mekanisme som
   bookingnumrene (beslutning 8 og 55). En optaelling som nummerkilde giver to
   ordrer samme nummer den dag to bestillinger rammer samme sekund.

   ⚠ OG ÉN ORDRE PR. LEVERANDOER. Funktionen tager ét leverandoerId og de
   behov der hoerer til. Man sender ikke én bestilling til tre firmaer, og et
   nummer der daekkede flere, kunne ikke bruges som reference paa nogen af
   fakturaerne.
   ══════════════════════════════════════════════════════════════════════════ */
export const ordreskriv = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";
  if (!perms.includes("|indkoeb.skriv|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke oprette en bestilling. Det kræver indkoeb.skriv.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);
  const sti = (p) => `tenants/${tenantId}/${p}`;

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child("indkoeb").val() !== true) {
    throw new HttpsError("permission-denied", "Procure-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const leverandoerId = kortStreng(d.leverandoerId, 60);
  if (!leverandoerId) throw new HttpsError("invalid-argument", "Vælg en leverandør.");

  const lev = await rod.child(`leverandoerer/${leverandoerId}`).once("value");
  if (!lev.exists()) throw new HttpsError("invalid-argument", "Leverandøren findes ikke.");

  /* ⚠ LINJERNE BYGGES AF BEHOVENE PAA SERVEREN, ikke af det klienten sender.
     Kom linjen udefra, kunne en vare og et antal vaere noget andet end det
     behovet siger — og sporet tilbage ville pege paa et behov der lovede
     noget andet end ordren beder om. Klienten sender ID'er og priser. */
  const oenskede = Array.isArray(d.linjer) ? d.linjer : [];
  if (!oenskede.length) {
    throw new HttpsError("invalid-argument", "En bestilling skal have mindst én linje.");
  }

  const linjer = {};
  const behovOpdatering = {};
  for (const [i, oensket] of oenskede.entries()) {
    const behovId = kortStreng(oensket?.behovId, 60);
    if (!behovId) throw new HttpsError("invalid-argument", "En linje mangler sit behov.");

    const snap = await rod.child(`indkoebsbehov/${behovId}`).once("value");
    if (!snap.exists()) {
      throw new HttpsError("not-found", `Behovet ${behovId} findes ikke.`);
    }
    const behov = { ...snap.val(), id: behovId };

    /* ⚠ ET BEHOV KAN KUN BESTILLES ÉN GANG. Uden det her led kunne to
       bestillinger lagt kort efter hinanden begge tage det samme behov med —
       og varen ville blive koebt to gange. */
    if (behov.status === "bestilt") {
      throw new HttpsError("failed-precondition",
        `"${behov.vare}" er allerede bestilt på ${behov.ordreId || "en anden ordre"}.`);
    }
    if (behov.status === "afvist") {
      throw new HttpsError("failed-precondition",
        `"${behov.vare}" er afvist og kan ikke bestilles.`);
    }

    /* ⚠ ANTALLET KAN SAETTES HER — det er DEN der bestiller, der ved det.
       Behovet maa gerne vaere uden; `behovTilLinje()` kaster hvis der stadig
       ikke er et, frem for at gaette 1. */
    const antal = Number.isFinite(oensket.antal) ? oensket.antal : behov.antal;
    const pris = oensket.prisPrEnhedOere;
    let linje;
    try {
      linje = behovTilLinje({ ...behov, antal }, { prisPrEnhedOere: pris });
    } catch (e) {
      throw new HttpsError("invalid-argument", e.message);
    }

    linjer[`l-${i + 1}`] = linje;
    behovOpdatering[sti(`indkoebsbehov/${behovId}/status`)] = "bestilt";
    behovOpdatering[sti(`indkoebsbehov/${behovId}/ordreId`)] = null; // sættes nedenfor
  }

  const nummer = await naesteNummer(db, sti, {
    praefiks: ORDRE_PRAEFIKS, serie: ORDRESERIE,
  });

  const ordre = {
    nummer,
    leverandoerId,
    /* ⚠ TILSTANDEN ER `kladde`, IKKE `sendt`. Mailen sendes ikke af systemet
       (kundens valg), saa "sendt" er noget et menneske saetter naar han HAR
       sendt den. En tilstand systemet paastod, ville goere sporet forkert. */
    status: "kladde",
    oprettetAf: uid,
    oprettetMs: Date.now(),
    linjer,
  };
  if (kortStreng(d.bestillerId, 60)) ordre.bestillerId = kortStreng(d.bestillerId, 60);
  if (kortStreng(d.note, 250)) ordre.note = kortStreng(d.note, 250);

  const svar = valideOrdre(ordre);
  if (!svar.ok) {
    throw new HttpsError("invalid-argument",
      Object.values(svar.fejl)[0] || "Bestillingen er ikke gyldig.");
  }

  const ordreRef = rod.child("indkoebsordrer").push();
  const opdatering = { [sti(`indkoebsordrer/${ordreRef.key}`)]: ordre };
  for (const n of Object.keys(behovOpdatering)) {
    opdatering[n] = n.endsWith("/ordreId") ? ordreRef.key : behovOpdatering[n];
  }

  /* ⚠ ÉN update(). Ordren og behovenes tilstand lander sammen eller slet ikke. */
  await db.ref().update(opdatering);

  await logProcure(tenantId, uid, AUDIT.opret, "indkoebsordrer", ordreRef.key,
    null, { nummer, leverandoerId, status: ordre.status },
    `bestilling ${nummer} oprettet med ${Object.keys(linjer).length} linjer`);

  return { ok: true, id: ordreRef.key, nummer };
});

/* ══════════════════════════════════════════════════════════════════════════
   GODKENDELSESREGELSKRIV — virksomhedens egen politik (beslutning 82)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ KRAEVER brugere.skriv — IKKE indkoeb.skriv.

   Den der rammer loftet, maa ikke kunne haeve det. Med indkoeb.skriv kunne
   enhver der bestiller, saette sin egen beloebsgraense til hundrede
   millioner og godkende sig selv ud af hele planche 2. Et loft der kan
   haeves af den der rammer det, er ikke et loft — det er praecis det
   beslutning 24 rettede 23 paa, og her koster det penge.

   ⚠ OG REGLEN KAN SLAAS FRA. Kunden bad udtrykkeligt om det: en lille
   virksomhed hvor samme person bestiller og godkender, faar intet ud af et
   ekstra trin. At kunne slaa den fra er en FUNKTION, ikke et hul — men det
   er en beslutning en administrator tager, ikke en bestiller.
   ══════════════════════════════════════════════════════════════════════════ */
export const godkendelsesregelskriv = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";
  if (!perms.includes(`|${PERM.brugereSkriv}|`)) {
    throw new HttpsError("permission-denied",
      "Godkendelsesreglerne saettes af en administrator. Den der bestiller, "
      + "maa ikke kunne haeve sit eget loft.");
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
  if (moduler.exists() && moduler.child("indkoeb").val() !== true) {
    throw new HttpsError("permission-denied", "Procure-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const ob = d.overBeloeb || {};
  const fg = d.fakturagodkendelse || {};

  /* ⚠ FORMEN BYGGES HER, IKKE TAGET IND. Et objekt udefra kunne baere felter
     reglen forbyder — og admin-SDK'et gaar uden om .validate, saa de ville
     lande i noden i tavshed. Samme grund som ordren bygges af behovet. */
  const regler = {
    overBeloeb: {
      aktiv: ob.aktiv === true,
      ...(Number.isInteger(ob.graenseOere) ? { graenseOere: ob.graenseOere } : {}),
      ...(kortStreng(ob.godkenderUid, 128) ? { godkenderUid: kortStreng(ob.godkenderUid, 128) } : {}),
    },
    fakturagodkendelse: {
      aktiv: fg.aktiv === true,
      ...(kortStreng(fg.godkenderUid, 128) ? { godkenderUid: kortStreng(fg.godkenderUid, 128) } : {}),
    },
    aendretAf: uid,
    aendretMs: Date.now(),
  };

  const svar = valideGodkendelsesregler(regler);
  if (!svar.ok) {
    throw new HttpsError("invalid-argument",
      Object.values(svar.fejl)[0] || "Reglerne er ikke gyldige.");
  }

  /* ⚠ GODKENDEREN SKAL FINDES SOM BRUGER. En uid der ikke staar i
     brugerindekset, er en koe ingen toemmer — ordren ville vente paa nogen
     der ikke kan logge ind. uid og ikke personId: godkenderen GOER noget. */
  for (const felt of [regler.overBeloeb, regler.fakturagodkendelse]) {
    if (!felt.aktiv || !felt.godkenderUid) continue;
    const b = await rod.child(`brugere/${felt.godkenderUid}`).once("value");
    if (!b.exists()) {
      throw new HttpsError("invalid-argument",
        "Den valgte godkender er ikke bruger i virksomheden.");
    }
  }

  const foer = (await rod.child("godkendelsesregler").once("value")).val();
  await rod.child("godkendelsesregler").set(regler);

  await logProcure(tenantId, uid, AUDIT.aendre, "godkendelsesregler", tenantId,
    foer ? { aktiv: foer.overBeloeb?.aktiv ?? null, graenseOere: foer.overBeloeb?.graenseOere ?? null } : null,
    { aktiv: regler.overBeloeb.aktiv, graenseOere: regler.overBeloeb.graenseOere ?? null },
    "godkendelsesregler aendret");

  return { ok: true };
});

/* ══════════════════════════════════════════════════════════════════════════
   ORDRESTATUS — bestillingens tilstandsskift (beslutning 82)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ SAMME kanSkifteIndkoebsordre() SOM SKAERMEN. Skaermen tegner knapperne af
   den og VISER; funktionen HAANDHAEVER, og den afviser med den sætning
   brugeren allerede har set. To formuleringer af én spaerring er to
   forklaringer paa én ting.

   ⚠ OG "SEND TIL GODKENDELSE" ENDER MAASKE PAA godkendt. Er reglen slaaet
   fra, eller er beloebet under graensen, er der ingen at vente paa — en koe
   med en post ingen skal roere, laerer folk at ignorere koeen. Regnestykket
   ligger i ordreOpdatering(), hvor det kan proeves uden en emulator.
   ══════════════════════════════════════════════════════════════════════════ */
export const ordrestatus = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child("indkoeb").val() !== true) {
    throw new HttpsError("permission-denied", "Procure-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const ordreId = kortStreng(d.ordreId, 60);
  const til = kortStreng(d.til, 30);
  if (!ordreId) throw new HttpsError("invalid-argument", "ordreId mangler.");
  if (!til) throw new HttpsError("invalid-argument", "Ingen tilstand at skifte til.");

  const snap = await rod.child(`indkoebsordrer/${ordreId}`).once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Bestillingen findes ikke.");
  const ordre = { ...snap.val(), id: ordreId };

  /* ⚠ REGLERNE LAESES AF NODEN, IKKE AF KLIENTEN. Kom graensen ind i kaldet,
     kunne den der bestiller, sende sin egen. Mangler noden, gaelder
     standarden — og standarden er INGEN godkendelse, saa en eksisterende
     kunde ikke pludselig faar en koe han ikke har bedt om. */
  const rSnap = await rod.child("godkendelsesregler").once("value");
  const regler = rSnap.exists() ? rSnap.val() : STANDARD_GODKENDELSESREGLER;

  const kan = kanSkifteIndkoebsordre(ordre, til, { perms, regler, uid });
  if (!kan.ok) {
    /* ⚠ EN MANGLENDE PERMISSION ER permission-denied; alt andet er en
       kendsgerning om ORDREN. De to skal kunne skelnes af den der ser dem. */
    const kode = kan.aarsag?.startsWith("Det kræver ") ? "permission-denied" : "failed-precondition";
    throw new HttpsError(kode, kan.aarsag);
  }

  const begrundelse = kortStreng(d.begrundelse, 250);
  if (kan.kraeverBegrundelse && !begrundelse) {
    throw new HttpsError("invalid-argument",
      "Skriv hvorfor. Uden en grund er afvisningen en tavshed, og den samme "
      + "bestilling bliver lagt igen i naeste uge.");
  }

  const opdatering = ordreOpdatering(ordre, til, {
    uid, nu: Date.now(), begrundelse, regler,
  });

  const stier = {};
  for (const [felt, vaerdi] of Object.entries(opdatering)) {
    stier[`tenants/${tenantId}/indkoebsordrer/${ordreId}/${felt}`] = vaerdi;
  }
  await db.ref().update(stier);

  const krav = kraeverGodkendelse(ordre, regler);
  await logProcure(tenantId, uid, AUDIT.tilstandsskift, "indkoebsordrer", ordreId,
    { status: ordre.status }, { status: opdatering.status },
    opdatering.godkendtAutomatisk
      ? `godkendt automatisk — ${krav.grund}`
      : `${ordre.status} → ${opdatering.status}`);

  return { ok: true, status: opdatering.status, automatisk: Boolean(opdatering.godkendtAutomatisk) };
});

/* ══════════════════════════════════════════════════════════════════════════
   ORDREMAILSEND — SKIVE 4D. Trin 3 → 4: den godkendte ordre sendes til
   leverandøren. Samme SYV Gate A-krav som sagMailSend (se dens hoved,
   længere nede i denne fil) — genbrugt punkt for punkt, ikke en
   Procure-specifik afskrift af transportlaget:

   1. MODTAGEREN OPLØSES SERVER-SIDE. Klienten sender kun ordreId — aldrig
      en adresse. Leverandøren hentes fra ordrens EGEN leverandoerId i
      SAMME tenants træ (`rod` er allerede tenant-scopet), og
      `kontaktEmail` læses derfra — aldrig fra klientens input.
   2. PROVIDER-HEMMELIGHEDEN ligger i MAIL_ADAPTER, defineret ét sted
      (linje ~6324). Denne funktion kender ingen API-nøgle direkte.
   3. PERMISSION: indkoeb.skriv — SAMME permission som stod på den nu
      fjernede "Markér som sendt" i ORDRE_OVERGANGE (se procure.js's egen
      note der). Ikke en ny permission opfundet til lejligheden.
   4. TENANT + ORDRESTATUS genverificeres her: ordren skal stå i
      "godkendt". En ordre der kræver godkendelse, kan slet ikke NÅ
      "godkendt" uden at have passeret `ordrestatus`' egen
      `kraeverGodkendelse()`-tjek (se funktionen ovenfor) — status ER
      beviset, og der er derfor ingen selvstændig "er den godkendt
      nok"-beregning her.
   5. AUDIT skrives ubetinget nedenfor — anmodet/accepteret/fejlet er alle
      ét `logProcure()`-kald. Ingen ordretekst, ingen brødtekst i posten.
   6. HEADER-INJEKTION: emnet går gennem `saniterHeaderFelt()`.
   7. IDEMPOTENS: `sendRequestId` er nøglen UNDER ordren
      (`indkoebsordrer/$ordreId/mail/$sendRequestId`) — samme
      `transaction()`-reservation som `sagMailSend`.
   ══════════════════════════════════════════════════════════════════════════ */
export const ordreMailSend = onCall({
  region: REGION,
  secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_AFSENDER],
}, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  if (!perms.includes("|indkoeb.skriv|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke sende ordren. Det kræver indkoeb.skriv.");
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
  if (moduler.exists() && moduler.child("indkoeb").val() !== true) {
    throw new HttpsError("permission-denied", "Procure-modulet er ikke aktivt.");
  }

  const d = req.data || {};
  const ordreId = kortStreng(d.ordreId, 60);
  if (!ordreId) throw new HttpsError("invalid-argument", "ordreId mangler.");

  const snap = await rod.child(`indkoebsordrer/${ordreId}`).once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Bestillingen findes ikke.");
  const ordre = { ...snap.val(), id: ordreId };

  if (ordre.status !== "godkendt") {
    throw new HttpsError("failed-precondition",
      `En ordre der er ${(ORDRESTATUS[ordre.status]?.label || ordre.status).toLowerCase()}, kan ikke sendes.`);
  }

  /* ⚠ GATE A PUNKT 1 — MODTAGEREN OPLØSES HER, IKKE AF KLIENTEN. Et
     manipuleret leverandoerId på ordren ville stadig kun ramme DENNE
     tenants eget kartotek, fordi `rod` allerede er tenant-scopet — men
     eksistenstjekket nedenfor dækker også det tilfælde hvor ordren (fejl-
     agtigt) peger på et id der slet ikke findes. */
  const lev = (await rod.child(`leverandoerer/${ordre.leverandoerId}`).once("value")).val();
  if (!lev) throw new HttpsError("failed-precondition", "Leverandøren på ordren findes ikke.");
  /* ⚠ V1-BRUGERTEST — ORDREN GÅR TIL ordreEmail, IKKE kontaktEmail, NÅR DEN
     FINDES. De to e-mailformål er adskilt i kartoteket (kontakt/priser vs.
     bestilling); en leverandør oprettet før udvidelsen har ikke ordreEmail
     og falder tilbage på kontaktEmail som hidtil. */
  const ordreEmail = typeof lev.ordreEmail === "string" ? lev.ordreEmail.trim() : "";
  const kontaktEmail = typeof lev.kontaktEmail === "string" ? lev.kontaktEmail.trim() : "";
  const tilEmail = ordreEmail || kontaktEmail;
  if (!tilEmail) {
    throw new HttpsError("failed-precondition",
      "Leverandøren har ingen mailadresse i kartoteket. Tilføj en under Leverandører.");
  }

  /* ⚠ SPROGET: KLIENTENS ØNSKE, ELLERS LEVERANDØRENS STANDARD, ELLERS
     STANDARD_SPROG — ALDRIG BROWSERENS LOCALE (se sprog.js). Overstyringen
     ændrer ikke leverandørens gemte standard; det er en engangsbeslutning
     for DENNE mail. */
  const sprogOenske = kortStreng(d.sprog, 5);
  if (sprogOenske && !erGyldigtSprog(sprogOenske)) {
    throw new HttpsError("invalid-argument", "Ukendt sprog.");
  }
  const sprog = sprogOenske || (erGyldigtSprog(lev.sprog) ? lev.sprog : STANDARD_SPROG);

  const indhold = ordreMailIndhold(ordre, { leverandoer: lev, sprog });
  const emne = saniterHeaderFelt(indhold.emne, 250);
  const tekst = valideTekst(indhold.brodtekst);
  if (!tekst) throw new HttpsError("internal", "Mailindholdet kunne ikke bygges.");

  const sendRequestId = kortStreng(d.sendRequestId, 60);
  if (!sendRequestId || !erGyldigtSendRequestId(sendRequestId)) {
    throw new HttpsError("invalid-argument", "sendRequestId mangler eller er ugyldigt.");
  }

  /* ---- Idempotens: sendRequestId ER nøglen — Gate A, punkt 7 ------------ */
  const mailRef = rod.child(`indkoebsordrer/${ordreId}/mail/${sendRequestId}`);
  const foreloebig = { ms: Date.now(), mailStatus: "anmodet", sprog, afsendtAf: uid };
  const trans = await mailRef.transaction((cur) => (cur === null ? foreloebig : undefined));
  if (!trans.committed) {
    /* Allerede anmodet/sendt/fejlet under dette sendRequestId. */
    const eksisterende = trans.snapshot.val();
    return { ordreId, mailStatus: eksisterende?.mailStatus || "anmodet", allerede: true };
  }

  /* ---- Rate limit — Gate A, punkt 6, EFTER reservationen — genbruger
     PRÆCIS samme tenant/uid-vindue som sagMailSend, ikke en Procure-egen
     tæller. --------------------------------------------------------------- */
  const indenforGraense = await tjekOgOptaelMailRate(rod, uid);
  if (!indenforGraense) {
    await mailRef.update({ mailStatus: "fejlet", fejlAarsag: "For mange forsøg. Prøv igen om et øjeblik." });
    await logProcure(tenantId, uid, AUDIT.aendre, "indkoebsordrer", ordreId,
      null, { mailStatus: "fejlet" }, "ordremail afvist — rate limit");
    throw new HttpsError("resource-exhausted", "For mange mails sendt på kort tid. Prøv igen om et øjeblik.");
  }

  /* ---- Selve afsendelsen — Gate A, punkt 2 ------------------------------ */
  const resultat = await sendMail(MAIL_ADAPTER, { til: tilEmail, emne, tekst });

  const opdateringer = {
    [`indkoebsordrer/${ordreId}/mail/${sendRequestId}/mailStatus`]: resultat.status,
  };
  if (resultat.providerId) {
    opdateringer[`indkoebsordrer/${ordreId}/mail/${sendRequestId}/providerId`] = resultat.providerId;
  }
  if (resultat.fejlAarsag) {
    opdateringer[`indkoebsordrer/${ordreId}/mail/${sendRequestId}/fejlAarsag`] = resultat.fejlAarsag;
  }

  let nyStatus = ordre.status;
  if (resultat.status === "accepteret") {
    /* ⚠ SAMME FELTER SOM DEN GAMLE "MARKÉR SOM SENDT" SKREV — kun kilden er
       en anden. `ordreOpdatering()` er stadig den ENE funktion der bygger
       dem; kun en REEL accept fra udbyderen sætter status. En fejlet mail
       har ikke bedt leverandøren om noget, og status rører sig ikke. */
    const felter = ordreOpdatering(ordre, "sendt", { uid, nu: Date.now() });
    for (const [felt, vaerdi] of Object.entries(felter)) {
      opdateringer[`indkoebsordrer/${ordreId}/${felt}`] = vaerdi;
    }
    nyStatus = felter.status;
  }
  await rod.update(opdateringer);

  /* ---- Audit — Gate A, punkt 5, UBETINGET -------------------------------
     mailStatus og leverandoerId er begge på LOGBARE_FELTER (sidste fra
     Skive 4B) — emnet og teksten er det ikke, og står derfor ikke i
     posten. */
  await logProcure(tenantId, uid, AUDIT.tilstandsskift, "indkoebsordrer", ordreId,
    { status: ordre.status },
    { status: nyStatus, mailStatus: resultat.status, leverandoerId: ordre.leverandoerId },
    resultat.status === "accepteret" ? "ordre sendt til leverandør" : "ordremail forsøgt sendt");

  if (resultat.status === "fejlet") {
    throw new HttpsError("internal", `Mailen kunne ikke sendes: ${resultat.fejlAarsag || "ukendt fejl"}.`);
  }

  return { ordreId, mailStatus: resultat.status, status: nyStatus };
});

/* ══════════════════════════════════════════════════════════════════════════
   PROCURES TRIN 4 — fakturaen (beslutning 83, planche 1)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ EN FAELLES DOER FOR DE TRE. De laeser samme tenant, samme abonnement og
   samme node; skrev hver sin kopi af de fire opslag, ville den ene faa rettet
   sin modulklausul og de to andre ikke.

   ⚠ MEN `fakturaer` HAR INGEN MODULKLAUSUL, og det er besluttet frem for
   glemt: noden roeres af TO moduler, saa en klausul paa det ene ville
   spaerre det andet. Se noten i regelfilen. Derfor tager doeren imod hvilket
   modul der skal kraeves — og for fakturaerne er svaret ingen.
   ══════════════════════════════════════════════════════════════════════════ */
async function procureDoer(req, { perm, modul }) {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");

  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";
  if (perm && !perms.includes(`|${perm}|`)) {
    throw new HttpsError("permission-denied", `Det kræver ${perm}.`);
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  if (modul) {
    const moduler = await rod.child("moduler").once("value");
    if (moduler.exists() && moduler.child(modul).val() !== true) {
      throw new HttpsError("permission-denied", `Modulet ${modul} er ikke aktivt.`);
    }
  }
  return { db, rod, tenantId, uid: auth.uid, perms };
}

/* ══════════════════════════════════════════════════════════════════════════
   FAKTURAMATCH — hvilken bestilling betaler fakturaen
   ══════════════════════════════════════════════════════════════════════════

   ⚠ SCOREN SENDES IKKE MED, OG DEN GEMMES IKKE. Klienten siger hvilken
   ORDRE; serveren skriver afgoerelsen. Kom scoren udefra, ville den vaere en
   paastand vi gemte uden at kunne efterproeve — og et sikkerhedstal der ser
   praecist ud uden at vaere det, er vaerre end intet tal.
   ══════════════════════════════════════════════════════════════════════════ */
export const fakturamatch = onCall({ region: REGION }, async (req) => {
  /* ⚠ SKIVE 4A — VAR indkoeb.skriv. Fakturaen er ikke Procures egen længere;
     se fakturaerSkriv i permissions.js. */
  const { db, rod, tenantId, uid } = await procureDoer(req, { perm: "fakturaer.skriv" });

  const d = req.data || {};
  const fakturaId = kortStreng(d.fakturaId, 60);
  if (!fakturaId) throw new HttpsError("invalid-argument", "fakturaId mangler.");

  const fSnap = await rod.child(`fakturaer/${fakturaId}`).once("value");
  if (!fSnap.exists()) throw new HttpsError("not-found", "Fakturaen findes ikke.");
  const faktura = { ...fSnap.val(), id: fakturaId };

  const sti = `tenants/${tenantId}/fakturaer/${fakturaId}`;
  const opdatering = {};
  let note;

  if (d.handling === "ikkeMatchbar") {
    /* ⚠ "INGEN AF FORSLAGENE PASSER" KRAEVER EN GRUND. Uden den staar
       fakturaen som uafklaret uden at nogen kan se hvorfor — og den naeste
       der kigger, begynder forfra paa det samme opslag. */
    const grund = kortStreng(d.grund, 250);
    if (!grund) {
      throw new HttpsError("invalid-argument",
        "Skriv hvorfor ingen af bestillingerne passer. Uden en grund begynder "
        + "den naeste forfra paa det samme opslag.");
    }
    opdatering[`${sti}/ikkeMatchbar`] = true;
    opdatering[`${sti}/ikkeMatchbarGrund`] = grund;
    opdatering[`${sti}/destinationArt`] = null;
    opdatering[`${sti}/destinationId`] = null;
    opdatering[`${sti}/matchetAf`] = null;
    opdatering[`${sti}/matchetMs`] = null;
    note = `markeret ikke-matchbar: ${grund}`;
  } else if (d.handling === "fjern") {
    if (!faktura.destinationId) {
      throw new HttpsError("failed-precondition", "Fakturaen er ikke matchet.");
    }
    if (faktura.status === "bogfoert") {
      throw new HttpsError("failed-precondition",
        "Fakturaen er bogfoert. Matchet kan ikke aendres bagefter.");
    }
    opdatering[`${sti}/destinationArt`] = null;
    opdatering[`${sti}/destinationId`] = null;
    opdatering[`${sti}/matchetAf`] = null;
    opdatering[`${sti}/matchetMs`] = null;
    note = `match til ${faktura.destinationId} fjernet`;
  } else {
    const ordreId = kortStreng(d.ordreId, 60);
    if (!ordreId) throw new HttpsError("invalid-argument", "Vaelg en bestilling.");
    const oSnap = await rod.child(`indkoebsordrer/${ordreId}`).once("value");
    if (!oSnap.exists()) throw new HttpsError("not-found", "Bestillingen findes ikke.");
    const ordre = { ...oSnap.val(), id: ordreId };

    /* ⚠ SAMME kanMatche() SOM SKAERMEN. Skaermen VISER; funktionen HAANDHAEVER. */
    const kan = kanMatche(faktura, ordre);
    if (!kan.ok) throw new HttpsError("failed-precondition", kan.aarsag);

    /* ⚠ ÉN FAKTURA PR. BESTILLING. To fakturaer paa samme ordre er enten en
       dublet eller en delfakturering, og begge dele skal et menneske tage
       stilling til. Reglen kan ikke haandhaeve det — en .validate ser én post
       ad gangen — saa leddet staar her. */
    const alle = await rod.child("fakturaer").orderByChild("destinationId").equalTo(ordreId).once("value");
    let optaget = null;
    alle.forEach((barn) => { if (barn.key !== fakturaId) optaget = barn.key; });
    if (optaget) {
      throw new HttpsError("failed-precondition",
        `Bestillingen ${ordre.nummer} er allerede matchet med en anden faktura.`);
    }

    /* ⚠ ARTEN SKRIVES MED. Feltet er faelles (beslutning 86), og et id uden
       en art er et link ingen kan foelge — reglen afviser det ogsaa: hvad
       id'et skal RAMME, afhaenger af arten. */
    opdatering[`${sti}/destinationArt`] = "procure";
    opdatering[`${sti}/destinationId`] = ordreId;
    opdatering[`${sti}/matchetAf`] = uid;
    opdatering[`${sti}/matchetMs`] = Date.now();
    opdatering[`${sti}/ikkeMatchbar`] = null;
    opdatering[`${sti}/ikkeMatchbarGrund`] = null;
    note = `matchet med ${ordre.nummer}`;
  }

  await db.ref().update(opdatering);
  await logProcure(tenantId, uid, AUDIT.aendre, "fakturaer", fakturaId,
    { indkoebId: faktura.destinationId ?? null }, { indkoebId: opdatering[`${sti}/destinationId`] ?? null }, note);

  return { ok: true };
});

/* ══════════════════════════════════════════════════════════════════════════
   FAKTURASTATUS — godkend, afvis, bogfoer
   ══════════════════════════════════════════════════════════════════════════

   ⚠ HER FIK BESLUTNING 82's ANDEN KONTAKT SIN VEJ IND. Var
   `godkendelsesregler.fakturagodkendelse` slaaet til, kraever betalingen en
   godkendelse — og reglen laeses af NODEN, ikke af kaldet.

   ⚠ SKIVE 4A — GODKEND/AFVIS KRAEVER NU fakturaerGodkend, IKKE
   indkoebGodkend. At sige god for at der skal betales, er stadig en anden
   handling end at registrere et koeb (beslutning 82); permissionen dækker
   nu begge fakturaskaerme (Procure og det faelles Fakturacenter), ikke kun
   Procures egen.

   ⚠ OG BOGFOER-GRENEN FIK OGSAA ET TJEK. Den kraevede foer INGEN
   permission overhovedet — kun at status allerede var `godkendt`. Bogfoering
   er en skriftlig statusovergang, ikke selve vurderingen, saa den hoerer
   under `fakturaerSkriv`, ikke `.godkend`.
   ══════════════════════════════════════════════════════════════════════════ */
export const fakturastatus = onCall({ region: REGION }, async (req) => {
  const { db, rod, tenantId, uid, perms } = await procureDoer(req, {});

  const d = req.data || {};
  const fakturaId = kortStreng(d.fakturaId, 60);
  const til = kortStreng(d.til, 30);
  if (!fakturaId) throw new HttpsError("invalid-argument", "fakturaId mangler.");
  if (!["godkendt", "afvist", "bogfoert"].includes(til)) {
    throw new HttpsError("invalid-argument", `Ukendt tilstand: ${d.til}`);
  }

  const snap = await rod.child(`fakturaer/${fakturaId}`).once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Fakturaen findes ikke.");
  const faktura = snap.val();

  /* ⚠ EN BOGFOERT FAKTURA ER EN ENDESTATION. Posten er sendt til regnskabet;
     en aendring bagefter goer en afstemning der stemte, til en der ikke goer. */
  if (faktura.status === "bogfoert") {
    throw new HttpsError("failed-precondition", "Fakturaen er bogfoert.");
  }

  if (til === "bogfoert") {
    /* ⚠ MAN BOGFOERER IKKE NOGET DER IKKE ER GODKENDT. Planchens fodnote
       siger det selv: "Efter godkendelse bogfoeres og sendes til
       regnskabssystemet." */
    if (faktura.status !== "godkendt") {
      throw new HttpsError("failed-precondition",
        "Fakturaen skal godkendes foer den kan bogfoeres.");
    }
    if (!perms.includes(`|${PERM.fakturaerSkriv}|`)) {
      throw new HttpsError("permission-denied", `Det kraever ${PERM.fakturaerSkriv}.`);
    }
  } else {
    if (!perms.includes(`|${PERM.fakturaerGodkend}|`)) {
      throw new HttpsError("permission-denied",
        `Det kraever ${PERM.fakturaerGodkend}. At sige god for en regning er en `
        + "anden handling end at registrere et koeb.");
    }
    const rSnap = await rod.child("godkendelsesregler").once("value");
    const regler = rSnap.exists() ? rSnap.val() : STANDARD_GODKENDELSESREGLER;
    const fg = regler.fakturagodkendelse || {};
    /* ⚠ ER REGLEN SLAAET TIL, ER DET DEN UDPEGEDE DER AFGOER. Er den slaaet
       fra, raekker permissionen — det er hele meningen med at kunne slaa den
       fra: en lille virksomhed hvor samme person goer begge dele. */
    if (fg.aktiv && fg.godkenderUid && fg.godkenderUid !== uid) {
      throw new HttpsError("permission-denied",
        "Kun den udpegede godkender kan afgoere den her faktura.");
    }
  }

  const begrundelse = kortStreng(d.begrundelse, 250);
  if (til === "afvist" && !begrundelse) {
    throw new HttpsError("invalid-argument",
      "Skriv hvorfor. En afvist regning skal kunne forklares til leverandoeren.");
  }

  const nu = Date.now();
  const sti = `tenants/${tenantId}/fakturaer/${fakturaId}`;
  const opdatering = { [`${sti}/status`]: til };
  if (til === "godkendt") {
    opdatering[`${sti}/godkendtAf`] = uid;
    opdatering[`${sti}/godkendtMs`] = nu;
  }
  if (til === "afvist") {
    opdatering[`${sti}/afvistAf`] = uid;
    opdatering[`${sti}/afvistMs`] = nu;
  }
  if (til === "bogfoert") opdatering[`${sti}/bogfoertMs`] = nu;
  if (begrundelse) opdatering[`${sti}/begrundelse`] = begrundelse;

  await db.ref().update(opdatering);
  await logProcure(tenantId, uid, AUDIT.tilstandsskift, "fakturaer", fakturaId,
    { status: faktura.status }, { status: til }, `${faktura.status} → ${til}`);

  return { ok: true, status: til };
});

/* ══════════════════════════════════════════════════════════════════════════
   BRÆNDSTOFMATCH — G.2. Forbinder en leverandørs fakturalinje (indkøb,
   kategori "braendstof") med chaufførens egen tankningsregistrering.

   ⚠ SCOREN SENDES IKKE MED, OG DEN GEMMES IKKE — samme princip som
   fakturamatch. Klienten siger hvilken TANKNING; serveren afgør, med
   NØJAGTIG samme matchForslag()/afgørAutomatch()/kanMatcheBraendstof()
   som skærmen selv viste forslaget med.

   ⚠ TO FUNKTIONER, TO SLAGS BESLUTNING:
     braendstofAutomatch     → batch, kører hele tenantens uafklarede
                                fakturalinjer igennem og bekræfter kun de
                                UTVETYDIGE (ét kvalificerende forslag).
     braendstofMatchBekraeft → ét menneskes valg for ÉN linje — en manuel
                                match, en "ikke matchbar"-markering, eller
                                en fjernelse af et eksisterende match.

   ⚠ ÉN TANKNING KAN KUN MATCHES ÉN GANG. Nøglen ($indkoebId) håndhæver
   linje-siden alene; tankning-siden kræver et levende opslag
   (orderByChild('tankningId')) lige før hver skrivning — samme mønster
   som fakturamatch's ordreId-tjek, og af samme grund: en .validate ser
   kun én post ad gangen og kan ikke sammenligne på tværs af søskende.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * braendstofAutomatch({}) → { automatiskMatchet, forbliverAabne }
 *
 * ⚠ EKSPLICIT BRUGERHANDLING, IKKE EN BAGGRUNDSJOB. Kun en person med
 * indkoeb.skriv der selv trykker "Kør automatisk match" udløser den her —
 * der findes ingen skjult trigger. Se braendstofmatch.js's note om hvorfor
 * "automatisk" betyder "systemet afgør UDEN at spørge om ÉT bestemt
 * forslag", ikke "uden at nogen bad om det".
 */
export const braendstofAutomatch = onCall({ region: REGION }, async (req) => {
  const { db, rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv" });

  const [indkoebSnap, tankningerSnap, matchSnap] = await Promise.all([
    rod.child("indkoeb").once("value"),
    rod.child("indberetninger").once("value"),
    rod.child("braendstofmatch").once("value"),
  ]);

  const alleLinjer = indkoebSnap.val() || {};
  const alleIndberetninger = tankningerSnap.val() || {};
  const eksisterendeMatch = matchSnap.val() || {};

  const tankninger = Object.entries(alleIndberetninger)
    .filter(([, t]) => t.art === "braendstof")
    .map(([id, t]) => ({ id, ...t }));

  /* ⚠ FLERE LINJER I SAMME KØRSEL MÅ IKKE KUNNE KLAIME SAMME TANKNING.
     Sættet udvides UNDERVEJS, så linje nr. 2 aldrig foreslås den tankning
     linje nr. 1 lige har fået. */
  const matchedeTankningIder = new Set(
    Object.values(eksisterendeMatch).filter((m) => m.tilstand === "matchet").map((m) => m.tankningId)
  );

  const opdatering = {};
  const logs = [];
  let automatiskMatchet = 0;
  let forbliverAabne = 0;

  for (const [indkoebId, linje] of Object.entries(alleLinjer)) {
    if (linje.kategori !== "braendstof") continue;
    if (eksisterendeMatch[indkoebId]) continue; // allerede afgjort — hverken matchet eller ikke-matchbar
    if (linje.fakturastatus === "bogfoert" || linje.fakturastatus === "afvist") continue;

    const forslag = braendstofMatchForslag(linje, tankninger, { matchedeTankningIder: [...matchedeTankningIder] });
    const afgoerelse = afgørAutomatch(forslag);
    if (!afgoerelse.automatisk) {
      forbliverAabne += 1;
      continue;
    }

    const nu = Date.now();
    const post = {
      indkoebId, tilstand: "matchet", tankningId: afgoerelse.tankning.id,
      automatisk: true, afgjortAf: uid, afgjortMs: nu,
    };
    opdatering[`tenants/${tenantId}/braendstofmatch/${indkoebId}`] = post;
    matchedeTankningIder.add(afgoerelse.tankning.id);
    automatiskMatchet += 1;
    logs.push({ indkoebId, efter: post });
  }

  if (automatiskMatchet > 0) {
    await db.ref().update(opdatering);
    for (const { indkoebId, efter } of logs) {
      await logProcure(tenantId, uid, AUDIT.opret, "braendstofmatch", indkoebId,
        null, efter, "automatisk matchet — ét utvetydigt forslag");
    }
  }

  return { automatiskMatchet, forbliverAabne };
});

/**
 * braendstofMatchBekraeft({ indkoebId, handling, tankningId?, grund? }) → { ok }
 *
 * `handling`: udelades (match til `tankningId`) | "ikkeMatchbar" (kræver
 * `grund`) | "fjern" (fjerner et eksisterende match).
 */
export const braendstofMatchBekraeft = onCall({ region: REGION }, async (req) => {
  const { db, rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv" });

  const d = req.data || {};
  const indkoebId = kortStreng(d.indkoebId, 60);
  if (!indkoebId) throw new HttpsError("invalid-argument", "indkoebId mangler.");

  const linjeSnap = await rod.child(`indkoeb/${indkoebId}`).once("value");
  if (!linjeSnap.exists()) throw new HttpsError("not-found", "Fakturalinjen findes ikke.");
  const linje = linjeSnap.val();

  const sti = `tenants/${tenantId}/braendstofmatch/${indkoebId}`;
  const foerSnap = await rod.child(`braendstofmatch/${indkoebId}`).once("value");
  const foer = foerSnap.exists() ? foerSnap.val() : null;

  if (d.handling === "fjern") {
    if (!foer) throw new HttpsError("failed-precondition", "Linjen er ikke matchet.");
    if (linje.fakturastatus === "bogfoert") {
      throw new HttpsError("failed-precondition", "Linjen er bogført. Matchet kan ikke ændres bagefter.");
    }
    await db.ref(sti).remove();
    await logProcure(tenantId, uid, AUDIT.slet, "braendstofmatch", indkoebId, foer, null, "match fjernet");
    return { ok: true };
  }

  if (d.handling === "ikkeMatchbar") {
    const grund = kortStreng(d.grund, 250);
    if (!grund) {
      throw new HttpsError("invalid-argument",
        "Skriv hvorfor ingen af forslagene passer. Uden en grund begynder den næste forfra på det samme opslag.");
    }
    const kan = kanMatcheBraendstof(linje, {});
    if (!kan.ok) throw new HttpsError("failed-precondition", kan.aarsag);
    const efter = {
      indkoebId, tilstand: "ikkeMatchbar", ikkeMatchbarGrund: grund,
      automatisk: false, afgjortAf: uid, afgjortMs: Date.now(),
    };
    await db.ref(sti).set(efter);
    await logProcure(tenantId, uid, AUDIT.opret, "braendstofmatch", indkoebId, foer, efter,
      `markeret ikke-matchbar: ${grund}`);
    return { ok: true };
  }

  const tankningId = kortStreng(d.tankningId, 60);
  if (!tankningId) throw new HttpsError("invalid-argument", "Vælg en tankning.");
  const tSnap = await rod.child(`indberetninger/${tankningId}`).once("value");
  if (!tSnap.exists()) throw new HttpsError("not-found", "Tankningen findes ikke.");
  const tankning = tSnap.val();
  if (tankning.art !== "braendstof") {
    throw new HttpsError("invalid-argument", "Den valgte indberetning er ikke en tankning.");
  }

  /* ⚠ ÉN TANKNING, HØJST ÉT MATCH — levende opslag, samme mønster som
     fakturamatch's ordreId-tjek. */
  const optagetSnap = await rod.child("braendstofmatch")
    .orderByChild("tankningId").equalTo(tankningId).once("value");
  let optaget = null;
  optagetSnap.forEach((barn) => { if (barn.key !== indkoebId) optaget = barn.key; });

  const kan = kanMatcheBraendstof(linje, { alleredeMatchetTilAnden: Boolean(optaget) });
  if (!kan.ok) throw new HttpsError("failed-precondition", kan.aarsag);

  const efter = {
    indkoebId, tilstand: "matchet", tankningId,
    automatisk: false, afgjortAf: uid, afgjortMs: Date.now(),
  };
  await db.ref(sti).set(efter);
  await logProcure(tenantId, uid, AUDIT.opret, "braendstofmatch", indkoebId, foer, efter,
    `matchet med tankning ${tankningId}`);

  return { ok: true };
});

/* ══════════════════════════════════════════════════════════════════════════
   FAKTURABILAG — SKIVE 4C. Første, begrænsede dokumentlager.

   docs/security-compliance/09_FILE_STORAGE_SECURITY_GATE.md (Gate B i
   12_FINDINGS_AND_REMEDIATION_PLAN.md) er skrevet FØR denne kode, og hvert
   krav herunder er mærket med det punkt det opfylder.

   ⚠ INGEN DIREKTE KLIENT-UPLOAD/-DOWNLOAD MOD ÅBEN STI (Gate B §2/§3).
   Fire funktioner, én for hvert trin:

     dokumentUploadInitier  → validerer, opretter en karantæne-post,
                               udsteder en 10-minutters signeret UPLOAD-URL
     dokumentUploadBekraeft → klienten har PUT'et bytes til den URL; her
                               verificeres signatur/størrelse/kvote FØR
                               posten forlader karantænen
     dokumentDownloadLink   → udsteder en 5-minutters signeret DOWNLOAD-URL,
                               kun for et dokument med status "aktiv"
     dokumentDeaktiver      → status → "deaktiveret". Blobben slettes ALDRIG.

   ⚠ INGEN NY PERMISSION (Gate B §2, bevidst fravalgt — se Fakturacenter.jsx
   4B/4A-præcedens). fakturaer.skriv/.laes genbruges uændret: et bilag er
   ikke bredere adgang end fakturaen det hænger på, og de to permissions har
   allerede den rollefordeling en dokumentadgang skal have.

   ⚠ STIEN ER LÅST (Gate B §1, §9). stiForDokument() bygger den ENE
   kanoniske sti, og firebase.rules.json's storagePath-felt kræver at
   RTDB-posten er enig med den. Originalt filnavn indgår ALDRIG i stien —
   kun id'erne.

   ⚠ SIGNATUR, IKKE CONTENT-TYPE-HEADEREN (Gate B §5). tjekSignatur() læser
   filens egne første bytes; en klient der lyver i sin Content-Type-header,
   fanges her.

   ⚠ KARANTÆNE FØRST (Gate B §7). Et dokument er ALDRIG "aktiv" før
   dokumentUploadBekraeft har verificeret det. Ingen malware-scanner er
   bygget i denne skive — det er en dokumenteret DEV-begrænsning, ikke en
   påstand om at scanning findes. Se skærmens egen tekst.

   ⚠ INGEN HARDSLET (Gate B §10). dokumentDeaktiver sætter kun status —
   blobben består. Legal hold (erUndtaget()) tjekkes FØR deaktivering,
   samme funktion som en fremtidig skærm ville bruge.

   ⚠ AUDIT (Gate B §12) — hvert af de fire trin logges ubetinget via
   logProcure(), objekt "fakturaDokument". Signerede URL'er står ALDRIG i en
   auditpost — kun at et link blev udstedt, ikke linket selv.

   ⚠ F.2 UDVIDER DETTE FUNDAMENT TIL OPGAVE-DOKUMENTER — se sektionen
   "OPGAVEDOKUMENTER" nedenfor, lige efter dokumentDeaktiver. De fire
   funktioner herunder rører KUN fakturaer, uændret. */

const dokumentSti = (parentType, parentId, dokumentId) =>
  `${PARENT_KOLLEKTION[parentType]}/${parentId}/dokumenter/${dokumentId}`;

export const dokumentUploadInitier = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "fakturaer.skriv" });

  const d = req.data || {};
  const fakturaId = kortStreng(d.fakturaId, 60);
  if (!fakturaId) throw new HttpsError("invalid-argument", "fakturaId mangler.");
  const originaltFilnavn = kortStreng(d.originaltFilnavn, 200);
  if (!originaltFilnavn) throw new HttpsError("invalid-argument", "Filnavn mangler.");
  const mimeType = kortStreng(d.mimeType, 100);
  if (!TILLADT_MIME.includes(mimeType)) {
    throw new HttpsError("invalid-argument",
      `Filtypen "${d.mimeType}" er ikke tilladt. Tilladt: PDF, JPEG, PNG.`);
  }
  const angivetStoerrelse = Number(d.stoerrelse);
  if (!Number.isFinite(angivetStoerrelse) || angivetStoerrelse <= 0) {
    throw new HttpsError("invalid-argument", "Filstørrelse mangler eller er ugyldig.");
  }
  if (angivetStoerrelse > MAX_FILSTOERRELSE_BYTES) {
    throw new HttpsError("invalid-argument",
      `Filen er større end ${Math.round(MAX_FILSTOERRELSE_BYTES / (1024 * 1024))} MB.`);
  }

  /* ⚠ FAKTURAEN HENTES OG VERIFICERES SERVER-SIDE — samme "fetch and
     verify"-mønster som sagAfslut bruger for sagId. Et bilag på en faktura
     der ikke findes (eller ikke er DENNE tenants), er ikke et bilag. */
  const fSnap = await rod.child(`fakturaer/${fakturaId}`).once("value");
  if (!fSnap.exists()) throw new HttpsError("not-found", "Fakturaen findes ikke.");

  /* ⚠ BLØDT KVOTETJEK HER, PÅ DET KLIENT-ANGIVNE TAL. Det HÅRDE tjek — på
     den faktisk verificerede størrelse — sker i dokumentUploadBekraeft, med
     en transaktion. Signerede URL'er kan ikke selv binde en maks-størrelse
     (GCS har intet signed-URL-ækvivalent til S3's POST policy), så
     størrelsen håndhæves altid EFTER upload, aldrig kun før. */
  const kvoteSnap = await rod.child("dokumentkvote/fakturaBilag/brugtBytes").once("value");
  if (sprængerKvote(kvoteSnap.val(), angivetStoerrelse)) {
    throw new HttpsError("resource-exhausted",
      `Tenantens lagerkvote for fakturabilag (${MAX_TENANT_BYTES / (1024 * 1024 * 1024)} GB) er brugt op.`);
  }

  const dokumentId = rod.child(`fakturaer/${fakturaId}/dokumenter`).push().key;
  const storagePath = stiForDokument(tenantId, "faktura", fakturaId, dokumentId);

  const nu = Date.now();
  const post = {
    dokumentId, parentType: "faktura", fakturaId,
    originaltFilnavn, valideretMime: mimeType, stoerrelse: angivetStoerrelse,
    storagePath, uploader: uid, oprettetTid: nu, status: "karantaene",
  };
  await rod.child(dokumentSti("faktura", fakturaId, dokumentId)).set(post);
  await logProcure(tenantId, uid, AUDIT.opret, "fakturaDokument", dokumentId,
    null, post, "upload initieret");

  const bucket = getStorage().bucket();
  const [uploadUrl] = await bucket.file(storagePath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: nu + 10 * 60 * 1000,
    contentType: mimeType,
  });

  return { dokumentId, storagePath, uploadUrl };
});

export const dokumentUploadBekraeft = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "fakturaer.skriv" });

  const d = req.data || {};
  const fakturaId = kortStreng(d.fakturaId, 60);
  const dokumentId = kortStreng(d.dokumentId, 60);
  if (!fakturaId || !dokumentId) {
    throw new HttpsError("invalid-argument", "fakturaId/dokumentId mangler.");
  }

  const docRef = rod.child(dokumentSti("faktura", fakturaId, dokumentId));
  const snap = await docRef.once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Dokumentet findes ikke.");
  const dok = snap.val();
  if (dok.status !== "karantaene") {
    throw new HttpsError("failed-precondition", `Dokumentet er allerede "${dok.status}".`);
  }

  const bucket = getStorage().bucket();
  const file = bucket.file(dok.storagePath);
  const [findes] = await file.exists();
  if (!findes) {
    throw new HttpsError("failed-precondition",
      "Filen er endnu ikke overført til den udstedte upload-URL.");
  }

  /* ⚠ AFVISNINGEN SLETTER BLOBBEN — DET ER IKKE EN HARDSLET AF ET DOKUMENT.
     Et dokument der aldrig bestod valideringen, var aldrig et gyldigt bilag
     — at rydde den slags op er noget andet end at destruere et bilag en
     bruger faktisk har uploadet og fået accepteret. Se Gate B §10. */
  const afvis = async (grund) => {
    await file.delete({ ignoreNotFound: true });
    await docRef.update({ status: "afvist", afvistGrund: grund });
    await logProcure(tenantId, uid, AUDIT.tilstandsskift, "fakturaDokument", dokumentId,
      { status: "karantaene" }, { status: "afvist" }, grund);
    throw new HttpsError("failed-precondition", grund);
  };

  const [meta] = await file.getMetadata();
  const faktiskStoerrelse = Number(meta.size);
  if (!Number.isFinite(faktiskStoerrelse) || faktiskStoerrelse > MAX_FILSTOERRELSE_BYTES) {
    await afvis(`Filen er ${Math.round(faktiskStoerrelse / 1024 / 1024)} MB — over grænsen på `
      + `${Math.round(MAX_FILSTOERRELSE_BYTES / 1024 / 1024)} MB.`);
  }

  /* ⚠ MAGIC BYTES, IKKE HEADEREN — Gate B §5. De første 16 bytes er nok til
     alle tre signaturer i dokumenter.js. */
  const [foersteBytes] = await file.download({ start: 0, end: 15 });
  if (!tjekSignatur(foersteBytes, dok.valideretMime)) {
    await afvis("Filens indhold matcher ikke den angivne filtype.");
  }

  /* ⚠ DEN HÅRDE KVOTE — TRANSAKTIONELT, PÅ DEN VERIFICEREDE STØRRELSE.
     To samtidige uploads der begge så "ledig plads" ved initiering, kan
     ikke begge vinde her: transaction() serialiserer læs-og-skriv på
     tælleren, samme mekanisme som countere/booking bruger til
     nummerserien. */
  const kvoteRef = rod.child("dokumentkvote/fakturaBilag/brugtBytes");
  const txn = await kvoteRef.transaction((cur) => {
    const brugt = Number(cur) || 0;
    if (sprængerKvote(brugt, faktiskStoerrelse)) return; // abort — over kvoten
    return brugt + faktiskStoerrelse;
  });
  if (!txn.committed) {
    await afvis("Tenantens lagerkvote for fakturabilag er brugt op.");
  }

  await docRef.update({ status: "aktiv", stoerrelse: faktiskStoerrelse });
  await logProcure(tenantId, uid, AUDIT.tilstandsskift, "fakturaDokument", dokumentId,
    { status: "karantaene" }, { status: "aktiv" }, "upload verificeret og frigivet");

  return { ok: true, status: "aktiv" };
});

export const dokumentDownloadLink = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "fakturaer.laes" });

  const d = req.data || {};
  const fakturaId = kortStreng(d.fakturaId, 60);
  const dokumentId = kortStreng(d.dokumentId, 60);
  if (!fakturaId || !dokumentId) {
    throw new HttpsError("invalid-argument", "fakturaId/dokumentId mangler.");
  }

  const fSnap = await rod.child(`fakturaer/${fakturaId}`).once("value");
  if (!fSnap.exists()) throw new HttpsError("not-found", "Fakturaen findes ikke.");

  const dSnap = await rod.child(dokumentSti("faktura", fakturaId, dokumentId)).once("value");
  if (!dSnap.exists()) throw new HttpsError("not-found", "Dokumentet findes ikke.");
  const dok = dSnap.val();

  /* ⚠ KUN "aktiv" KAN HENTES — Gate B §7. Storage Rules kan ikke se denne
     status (kan ikke slå op i RTDB), så karantænen håndhæves HER, i den
     ENE funktion der udsteder download-adgang. */
  if (dok.status !== "aktiv") {
    throw new HttpsError("failed-precondition",
      dok.status === "karantaene"
        ? "Dokumentet afventer stadig verificering og kan ikke hentes endnu."
        : `Dokumentet er "${dok.status}" og kan ikke hentes.`);
  }

  const TTL_MS = 5 * 60 * 1000;
  const nu = Date.now();
  const bucket = getStorage().bucket();
  const [url] = await bucket.file(dok.storagePath).getSignedUrl({
    version: "v4", action: "read", expires: nu + TTL_MS,
  });

  /* ⚠ LINKET STÅR IKKE I AUDITPOSTEN — kun AT det blev udstedt, til hvem og
     hvornår. Et signeret link er et bearer-credential; at logge det ville
     lægge en fungerende adgangsnøgle i en log flere mennesker kan læse. Se
     Gate B §3 og §9 i checkpointet før 4C. */
  await logProcure(tenantId, uid, AUDIT.laes, "fakturaDokument", dokumentId,
    null, null, "download-link udstedt");

  return { url, udloeberMs: nu + TTL_MS };
});

export const dokumentDeaktiver = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "fakturaer.skriv" });

  const d = req.data || {};
  const fakturaId = kortStreng(d.fakturaId, 60);
  const dokumentId = kortStreng(d.dokumentId, 60);
  if (!fakturaId || !dokumentId) {
    throw new HttpsError("invalid-argument", "fakturaId/dokumentId mangler.");
  }

  const docRef = rod.child(dokumentSti("faktura", fakturaId, dokumentId));
  const snap = await docRef.once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Dokumentet findes ikke.");
  const dok = snap.val();

  if (dok.status !== "aktiv") {
    throw new HttpsError("failed-precondition",
      `Kun et aktivt dokument kan deaktiveres (er "${dok.status}").`);
  }

  /* ⚠ LEGAL HOLD TJEKKES FØR EN DEAKTIVERING, DER FUNKTIONELT SVARER TIL
     FJERNELSE — Gate B §10. Samme erUndtaget() en fremtidig skærm ville
     bruge; ingen anden legal-hold-logik opfindes her. */
  const holds = Object.values(
    (await rod.child("retention/legalHold").once("value")).val() || {}
  );
  if (erUndtaget("fakturaDokument", dokumentId, holds)) {
    throw new HttpsError("failed-precondition",
      "Dokumentet er omfattet af et aktivt legal hold og kan ikke deaktiveres.");
  }

  const nu = Date.now();
  /* ⚠ BLOBBEN SLETTES IKKE. "Fjern dokument" er et statusskift, ikke en
     destruktion — se Gate B §10 og CLAUDE.md's forbud mod en slet()-vej for
     regnskabsdata. */
  await docRef.update({ status: "deaktiveret", deaktiveretAf: uid, deaktiveretMs: nu });
  await logProcure(tenantId, uid, AUDIT.tilstandsskift, "fakturaDokument", dokumentId,
    { status: "aktiv" }, { status: "deaktiveret" }, "dokument deaktiveret");

  return { ok: true, status: "deaktiveret" };
});

/* ══════════════════════════════════════════════════════════════════════════
   OPGAVEDOKUMENTER — F.2. Samme fundament som fakturabilag ovenfor, udvidet
   til opgave-vedhæftede filer (fotos/kvitteringer fra et værkstedsbesøg).

   ⚠ HVORFOR DEN FINDES. Supplier Portal (§18) kan vise en leverandør sin
   egen opgave, men havde INGEN vej til at vise ham et foto af skaden — den
   eksisterende dokumentarkitektur var hardkodet til parentType "faktura"
   alene. Se den nu forældede note i LEVERANDØRPORTAL-sektionen nedenfor
   (rettet i samme commit som denne).

   ⚠ SAMME FEM GARANTIER SOM FAKTURABILAG — ingen af dem er lempet for at
   gøre denne udvidelse nemmere: ingen direkte klient-Storage-adgang,
   signatur frem for Content-Type-header, karantæne før "aktiv", ingen
   hardslet, og alt logges. `stiForDokument()`/`tjekSignatur()`/
   `sprængerKvote()` er de SAMME funktioner som ovenfor — se dokumenter.js's
   hoved.

   ⚠ INGEN NY LÆSE-PERMISSION TIL DOWNLOAD (Gate B §2's princip genbrugt).
   `opgaver` har selv INGEN `.laes`-krav ud over tenant+aktivt abonnement
   (se firebase.rules.json) — enhver intern bruger kan læse enhver opgave.
   Et dokument hæftet på en opgave er ikke bredere adgang end opgaven selv,
   så `opgaveDokumentDownloadLink` kræver ingen perm, præcis som noden den
   låner sin adgang fra. UPLOAD/DEAKTIVER/SYNLIGHED kræver derimod
   `opgaver.skriv` — samme skel som noden selv har mellem læsning og
   skrivning.

   ⚠ EGEN KVOTE, IKKE DEN SAMME SOM FAKTURABILAG. `dokumentkvote/opgaveBilag`
   er en søsterknude til `dokumentkvote/fakturaBilag` — to uafhængige 2 GB-
   lofter, af samme grund som to uafhængige noder: en tenant med mange
   værkstedsfotos skal ikke kunne fortrænge fakturabilagenes plads, og omvendt.

   ⚠ synligForLeverandoer ER EN EGEN, EKSPLICIT BESLUTNING — IKKE ET
   UPLOAD-TIDSPUNKT-VALG. Et nyt dokument starter ALTID `false`
   (opgaveDokumentUploadInitier sætter det aldrig til true). Deling er en
   separat funktion (opgaveDokumentSynlighedSaet), så "jeg har lige
   uploadet et foto" og "jeg har besluttet at leverandøren må se det" er to
   forskellige, hver for sig auditerede hændelser — samme adskillelse som
   leverandørportalens eget "kontoret afgør, leverandøren foreslår ikke selv"
   -princip (se leverandoertilbud-noten i firebase.rules.json).

   ⚠ HVEM DER FAKTISK KAN SE ET DELT DOKUMENT, AFGØRES AF DEN EKSTERNE VEJ —
   `leverandoerDokumentDownloadLink`, i LEVERANDØRPORTAL-sektionen nedenfor,
   IKKE her. Den funktion tjekker BÅDE status "aktiv" OG synligForLeverandoer
   === true OG at opgaven rent faktisk er tildelt netop den leverandør —
   tre uafhængige spærringer, ikke én.
   ══════════════════════════════════════════════════════════════════════════ */

export const opgaveDokumentUploadInitier = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "opgaver.skriv" });

  const d = req.data || {};
  const opgaveId = kortStreng(d.opgaveId, 60);
  if (!opgaveId) throw new HttpsError("invalid-argument", "opgaveId mangler.");
  const originaltFilnavn = kortStreng(d.originaltFilnavn, 200);
  if (!originaltFilnavn) throw new HttpsError("invalid-argument", "Filnavn mangler.");
  const mimeType = kortStreng(d.mimeType, 100);
  if (!TILLADT_MIME.includes(mimeType)) {
    throw new HttpsError("invalid-argument",
      `Filtypen "${d.mimeType}" er ikke tilladt. Tilladt: PDF, JPEG, PNG.`);
  }
  const angivetStoerrelse = Number(d.stoerrelse);
  if (!Number.isFinite(angivetStoerrelse) || angivetStoerrelse <= 0) {
    throw new HttpsError("invalid-argument", "Filstørrelse mangler eller er ugyldig.");
  }
  if (angivetStoerrelse > MAX_FILSTOERRELSE_BYTES) {
    throw new HttpsError("invalid-argument",
      `Filen er større end ${Math.round(MAX_FILSTOERRELSE_BYTES / (1024 * 1024))} MB.`);
  }

  const oSnap = await rod.child(`opgaver/${opgaveId}`).once("value");
  if (!oSnap.exists()) throw new HttpsError("not-found", "Opgaven findes ikke.");

  const kvoteSnap = await rod.child("dokumentkvote/opgaveBilag/brugtBytes").once("value");
  if (sprængerKvote(kvoteSnap.val(), angivetStoerrelse)) {
    throw new HttpsError("resource-exhausted",
      `Tenantens lagerkvote for opgavedokumenter (${MAX_TENANT_BYTES / (1024 * 1024 * 1024)} GB) er brugt op.`);
  }

  const dokumentId = rod.child(`opgaver/${opgaveId}/dokumenter`).push().key;
  const storagePath = stiForDokument(tenantId, "opgave", opgaveId, dokumentId);

  const nu = Date.now();
  const post = {
    dokumentId, parentType: "opgave", opgaveId,
    originaltFilnavn, valideretMime: mimeType, stoerrelse: angivetStoerrelse,
    storagePath, uploader: uid, oprettetTid: nu, status: "karantaene",
    synligForLeverandoer: false,
  };
  await rod.child(dokumentSti("opgave", opgaveId, dokumentId)).set(post);
  await logProcure(tenantId, uid, AUDIT.opret, "opgaveDokument", dokumentId,
    null, post, "upload initieret");

  const bucket = getStorage().bucket();
  const [uploadUrl] = await bucket.file(storagePath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: nu + 10 * 60 * 1000,
    contentType: mimeType,
  });

  return { dokumentId, storagePath, uploadUrl };
});

export const opgaveDokumentUploadBekraeft = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "opgaver.skriv" });

  const d = req.data || {};
  const opgaveId = kortStreng(d.opgaveId, 60);
  const dokumentId = kortStreng(d.dokumentId, 60);
  if (!opgaveId || !dokumentId) {
    throw new HttpsError("invalid-argument", "opgaveId/dokumentId mangler.");
  }

  const docRef = rod.child(dokumentSti("opgave", opgaveId, dokumentId));
  const snap = await docRef.once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Dokumentet findes ikke.");
  const dok = snap.val();
  if (dok.status !== "karantaene") {
    throw new HttpsError("failed-precondition", `Dokumentet er allerede "${dok.status}".`);
  }

  const bucket = getStorage().bucket();
  const file = bucket.file(dok.storagePath);
  const [findes] = await file.exists();
  if (!findes) {
    throw new HttpsError("failed-precondition",
      "Filen er endnu ikke overført til den udstedte upload-URL.");
  }

  const afvis = async (grund) => {
    await file.delete({ ignoreNotFound: true });
    await docRef.update({ status: "afvist", afvistGrund: grund });
    await logProcure(tenantId, uid, AUDIT.tilstandsskift, "opgaveDokument", dokumentId,
      { status: "karantaene" }, { status: "afvist" }, grund);
    throw new HttpsError("failed-precondition", grund);
  };

  const [meta] = await file.getMetadata();
  const faktiskStoerrelse = Number(meta.size);
  if (!Number.isFinite(faktiskStoerrelse) || faktiskStoerrelse > MAX_FILSTOERRELSE_BYTES) {
    await afvis(`Filen er ${Math.round(faktiskStoerrelse / 1024 / 1024)} MB — over grænsen på `
      + `${Math.round(MAX_FILSTOERRELSE_BYTES / 1024 / 1024)} MB.`);
  }

  const [foersteBytes] = await file.download({ start: 0, end: 15 });
  if (!tjekSignatur(foersteBytes, dok.valideretMime)) {
    await afvis("Filens indhold matcher ikke den angivne filtype.");
  }

  const kvoteRef = rod.child("dokumentkvote/opgaveBilag/brugtBytes");
  const txn = await kvoteRef.transaction((cur) => {
    const brugt = Number(cur) || 0;
    if (sprængerKvote(brugt, faktiskStoerrelse)) return; // abort — over kvoten
    return brugt + faktiskStoerrelse;
  });
  if (!txn.committed) {
    await afvis("Tenantens lagerkvote for opgavedokumenter er brugt op.");
  }

  await docRef.update({ status: "aktiv", stoerrelse: faktiskStoerrelse });
  await logProcure(tenantId, uid, AUDIT.tilstandsskift, "opgaveDokument", dokumentId,
    { status: "karantaene" }, { status: "aktiv" }, "upload verificeret og frigivet");

  return { ok: true, status: "aktiv" };
});

/* ⚠ INGEN perm HER — se sektionens hoved. Adgangen er den samme som at
   læse opgaven selv. */
export const opgaveDokumentDownloadLink = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, {});

  const d = req.data || {};
  const opgaveId = kortStreng(d.opgaveId, 60);
  const dokumentId = kortStreng(d.dokumentId, 60);
  if (!opgaveId || !dokumentId) {
    throw new HttpsError("invalid-argument", "opgaveId/dokumentId mangler.");
  }

  const oSnap = await rod.child(`opgaver/${opgaveId}`).once("value");
  if (!oSnap.exists()) throw new HttpsError("not-found", "Opgaven findes ikke.");

  const dSnap = await rod.child(dokumentSti("opgave", opgaveId, dokumentId)).once("value");
  if (!dSnap.exists()) throw new HttpsError("not-found", "Dokumentet findes ikke.");
  const dok = dSnap.val();

  if (dok.status !== "aktiv") {
    throw new HttpsError("failed-precondition",
      dok.status === "karantaene"
        ? "Dokumentet afventer stadig verificering og kan ikke hentes endnu."
        : `Dokumentet er "${dok.status}" og kan ikke hentes.`);
  }

  const TTL_MS = 5 * 60 * 1000;
  const nu = Date.now();
  const bucket = getStorage().bucket();
  const [url] = await bucket.file(dok.storagePath).getSignedUrl({
    version: "v4", action: "read", expires: nu + TTL_MS,
  });

  await logProcure(tenantId, uid, AUDIT.laes, "opgaveDokument", dokumentId,
    null, null, "download-link udstedt");

  return { url, udloeberMs: nu + TTL_MS };
});

export const opgaveDokumentDeaktiver = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "opgaver.skriv" });

  const d = req.data || {};
  const opgaveId = kortStreng(d.opgaveId, 60);
  const dokumentId = kortStreng(d.dokumentId, 60);
  if (!opgaveId || !dokumentId) {
    throw new HttpsError("invalid-argument", "opgaveId/dokumentId mangler.");
  }

  const docRef = rod.child(dokumentSti("opgave", opgaveId, dokumentId));
  const snap = await docRef.once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Dokumentet findes ikke.");
  const dok = snap.val();

  if (dok.status !== "aktiv") {
    throw new HttpsError("failed-precondition",
      `Kun et aktivt dokument kan deaktiveres (er "${dok.status}").`);
  }

  const holds = Object.values(
    (await rod.child("retention/legalHold").once("value")).val() || {}
  );
  if (erUndtaget("opgaveDokument", dokumentId, holds)) {
    throw new HttpsError("failed-precondition",
      "Dokumentet er omfattet af et aktivt legal hold og kan ikke deaktiveres.");
  }

  const nu = Date.now();
  /* ⚠ EN DEAKTIVERING SKJULER OGSÅ ØJEBLIKKELIGT FOR LEVERANDØREN.
     leverandoerDokumentDownloadLink kræver status "aktiv" — et dokument der
     er delt OG deaktiveret, kan altså ikke længere hentes af nogen, uden at
     synligForLeverandoer selv skal ryddes op i samme kald. */
  await docRef.update({ status: "deaktiveret", deaktiveretAf: uid, deaktiveretMs: nu });
  await logProcure(tenantId, uid, AUDIT.tilstandsskift, "opgaveDokument", dokumentId,
    { status: "aktiv" }, { status: "deaktiveret" }, "dokument deaktiveret");

  return { ok: true, status: "deaktiveret" };
});

/**
 * opgaveDokumentSynlighedSaet({ opgaveId, dokumentId, synlig }) → { ok, synligForLeverandoer }
 *
 * ⚠ DEN EKSPLICITTE DELINGSBESLUTNING — se sektionens hoved. Kun et
 * dokument med status "aktiv" kan deles: et karantæneret dokument er ikke
 * verificeret endnu, og et deaktiveret er allerede utilgængeligt for alle.
 */
export const opgaveDokumentSynlighedSaet = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "opgaver.skriv" });

  const d = req.data || {};
  const opgaveId = kortStreng(d.opgaveId, 60);
  const dokumentId = kortStreng(d.dokumentId, 60);
  if (!opgaveId || !dokumentId) {
    throw new HttpsError("invalid-argument", "opgaveId/dokumentId mangler.");
  }
  if (typeof d.synlig !== "boolean") {
    throw new HttpsError("invalid-argument", "synlig skal være true eller false.");
  }

  const docRef = rod.child(dokumentSti("opgave", opgaveId, dokumentId));
  const snap = await docRef.once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Dokumentet findes ikke.");
  const dok = snap.val();
  if (dok.status !== "aktiv") {
    throw new HttpsError("failed-precondition",
      `Kun et aktivt dokument kan deles eller skjules (er "${dok.status}").`);
  }

  await docRef.update({ synligForLeverandoer: d.synlig });
  await logProcure(tenantId, uid, AUDIT.aendre, "opgaveDokument", dokumentId,
    { synligForLeverandoer: dok.synligForLeverandoer === true },
    { synligForLeverandoer: d.synlig },
    d.synlig ? "delt med leverandøren" : "deling ophævet");

  return { ok: true, synligForLeverandoer: d.synlig };
});

/* ══════════════════════════════════════════════════════════════════════════
   KONTANTKOEBSKRIV — et koeb der allerede er betalt
   ══════════════════════════════════════════════════════════════════════════

   ⚠ DET SKRIVES SOM EN indkoeb-LINJE, ikke i en node ved siden af. `indkoeb`
   ER det vi har koebt; et kontantkoeb er noejagtig det, bare betalt paa en
   anden maade. En egen node ville vaere den samme kendsgerning to steder, og
   hvert beloeb i modulet skulle huske at laegge dem sammen.

   ⚠ MEN VEJEN GAAR GENNEM EN FUNKTION, selv om `indkoeb` er skrivbar med
   indkoeb.skriv. Formen skal bygges ét sted: `betalingsform`, `udlaegAf` og
   `oprettetAf` er tre felter en formular ville kunne saette hver sin vej, og
   den der taster en kollegas bon, maa ikke kunne skrive sig selv som den der
   lagde ud.
   ══════════════════════════════════════════════════════════════════════════ */
export const kontantkoebskriv = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, {
    perm: "indkoeb.skriv", modul: "indkoeb",
  });

  const d = req.data || {};
  const leverandoerId = kortStreng(d.leverandoerId, 60);
  if (!leverandoerId) throw new HttpsError("invalid-argument", "Vaelg hvor det blev koebt.");
  const lev = await rod.child(`leverandoerer/${leverandoerId}`).once("value");
  if (!lev.exists()) throw new HttpsError("invalid-argument", "Leverandoeren findes ikke.");

  /* ⚠ udlaegAf SKAL VAERE EN BRUGER I HUSET. Pengene skal til nogen; et uid
     der ikke findes, er et udlaeg ingen faar tilbage. */
  const udlaegAf = kortStreng(d.udlaegAf, 128) || uid;
  const b = await rod.child(`brugere/${udlaegAf}`).once("value");
  if (!b.exists()) {
    throw new HttpsError("invalid-argument", "Den valgte er ikke bruger i virksomheden.");
  }

  let linje;
  try {
    linje = kontantkoebLinje({
      vare: kortStreng(d.vare, 120),
      leverandoerId,
      antal: Number.isFinite(d.antal) ? d.antal : 1,
      prisPrEnhedOere: d.prisPrEnhedOere,
      momsOere: Number.isInteger(d.momsOere) ? d.momsOere : undefined,
      enhed: kortStreng(d.enhed, 20) || undefined,
      kategori: kortStreng(d.kategori, 30) || undefined,
      koeretoejId: kortStreng(d.koeretoejId, 60) || undefined,
      note: kortStreng(d.note, 250) || undefined,
      dato: Number.isFinite(d.dato) ? d.dato : Date.now(),
      udlaegAf,
    }, { uid, nu: Date.now() });
  } catch (e) {
    throw new HttpsError("invalid-argument", e.message);
  }

  const ref = rod.child("indkoeb").push();
  await ref.set(linje);

  await logProcure(tenantId, uid, AUDIT.opret, "indkoeb", ref.key, null,
    { leverandoerId, antal: linje.antal, prisPrEnhedOere: linje.prisPrEnhedOere },
    "kontantkoeb registreret");

  return { ok: true, id: ref.key };
});

/* ══════════════════════════════════════════════════════════════════════════
   FORBRUGSVARER — Procures eget varelager (beslutning 85)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ IKKE `varer`. Den node er Warehouses, hvor godset er KUNDENS og kundeId
   er paakraevet. Det her er vores egne handsker, straekfilm og filtre.
   ══════════════════════════════════════════════════════════════════════════ */
export const forbrugsvareskriv = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, {
    perm: "indkoeb.skriv", modul: "indkoeb",
  });

  const d = req.data || {};
  const id = kortStreng(d.id, 60);

  /* ⚠ FORMEN BYGGES HER, IKKE TAGET IND. Admin-SDK'et gaar uden om
     .validate, saa et objekt udefra kunne lande med felter reglen forbyder. */
  const post = {
    navn: kortStreng(d.navn, 120),
    enhed: kortStreng(d.enhed, 20) || "stk",
  };
  if (kortStreng(d.varenummer, 60)) post.varenummer = kortStreng(d.varenummer, 60);
  if (kortStreng(d.note, 250)) post.note = kortStreng(d.note, 250);
  if (kortStreng(d.leverandoerId, 60)) post.leverandoerId = kortStreng(d.leverandoerId, 60);
  /* ⚠ MINIMUM ER VALGFRIT, og `null` betyder UDTRYKKELIGT "ingen graense" —
     ikke "uaendret". Uden den skelnen kunne en graense aldrig fjernes igen. */
  if (Number.isFinite(d.minimumBeholdning)) post.minimumBeholdning = d.minimumBeholdning;

  const svar = valideForbrugsvare(post);
  if (!svar.ok) {
    throw new HttpsError("invalid-argument",
      Object.values(svar.fejl)[0] || "Varen er ikke gyldig.");
  }

  if (post.leverandoerId) {
    const lev = await rod.child(`leverandoerer/${post.leverandoerId}`).once("value");
    if (!lev.exists()) throw new HttpsError("invalid-argument", "Leverandoeren findes ikke.");
  }

  if (id) {
    const findes = await rod.child(`forbrugsvarer/${id}`).once("value");
    if (!findes.exists()) throw new HttpsError("not-found", "Varen findes ikke.");
    /* ⚠ BEHOLDNINGEN ROERES IKKE HER. Den er summen af bevaegelser, og et
       felt en formular kunne saette, ville vaere en femte art ingen har
       besluttet — og den ville ikke staa i historikken. Skal tallet rettes,
       er det en OPTAELLING. */
    const opdatering = {};
    for (const [felt, vaerdi] of Object.entries(post)) {
      opdatering[`tenants/${tenantId}/forbrugsvarer/${id}/${felt}`] = vaerdi;
    }
    /* Fjernet graense skal kunne fjernes. */
    if (d.minimumBeholdning === null) {
      opdatering[`tenants/${tenantId}/forbrugsvarer/${id}/minimumBeholdning`] = null;
    }
    await getDatabase().ref().update(opdatering);
    await logProcure(tenantId, uid, AUDIT.aendre, "forbrugsvarer", id,
      { antal: findes.val()?.minimumBeholdning ?? null },
      { antal: post.minimumBeholdning ?? null }, "forbrugsvare rettet");
    return { ok: true, id };
  }

  post.oprettetAf = uid;
  post.oprettetMs = Date.now();
  /* En ny vare har beholdning nul. Den foerste modtagelse er en bevaegelse. */
  post.beholdning = 0;

  const ref = rod.child("forbrugsvarer").push();
  await ref.set(post);
  await logProcure(tenantId, uid, AUDIT.opret, "forbrugsvarer", ref.key, null,
    { antal: post.minimumBeholdning ?? null }, "forbrugsvare oprettet");

  return { ok: true, id: ref.key };
});

/* ══════════════════════════════════════════════════════════════════════════
   FORBRUGSVAREBEVAEGELSE — raekken og tallet i ÉN update()
   ══════════════════════════════════════════════════════════════════════════

   ⚠ SAMME KENDSGERNING TO FORMER. Bevaegelsen er raekken, beholdningen er
   tallet — og de skrives atomisk sammen eller slet ikke. Deler man
   skrivningen i to kald, kan halvdelen lande, og saa er uenigheden vores
   egen. Samme ordning som enheder/beholdning (beslutning 39).

   ⚠ OG BEHOLDNINGEN MAA GAA I MINUS. Et forbrug der bringer tallet under nul,
   SKETE: nogen tog de sidste fem handsker, og tallet var forkert i forvejen.
   Afviste vi bevaegelsen, ville den rigtige haendelse gaa tabt for at beskytte
   et tal der allerede var galt — og den der staar med en tom kasse, faar at
   vide at han tager fejl. Svaret er en OPTAELLING; indtil da er minus beviset
   paa at der mangler en bevaegelse.
   ══════════════════════════════════════════════════════════════════════════ */
export const forbrugsvarebevaegelse = onCall({ region: REGION }, async (req) => {
  const { db, rod, tenantId, uid } = await procureDoer(req, {
    perm: "indkoeb.skriv", modul: "indkoeb",
  });

  const d = req.data || {};
  const forbrugsvareId = kortStreng(d.forbrugsvareId, 60);
  if (!forbrugsvareId) throw new HttpsError("invalid-argument", "Vaelg en vare.");

  const snap = await rod.child(`forbrugsvarer/${forbrugsvareId}`).once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Varen findes ikke.");
  const vare = { ...snap.val(), id: forbrugsvareId };

  const nu = Date.now();
  const post = {
    forbrugsvareId,
    art: kortStreng(d.art, 20),
    antal: Number(d.antal),
    ms: nu,
    uid,
  };
  if (kortStreng(d.note, 250)) post.note = kortStreng(d.note, 250);
  if (kortStreng(d.ordreId, 60)) post.ordreId = kortStreng(d.ordreId, 60);

  const svar = valideForbrugsvarebevaegelse(post, { vare });
  if (!svar.ok) {
    throw new HttpsError("invalid-argument",
      Object.values(svar.fejl)[0] || "Bevaegelsen er ikke gyldig.");
  }

  if (post.ordreId) {
    const o = await rod.child(`indkoebsordrer/${post.ordreId}`).once("value");
    if (!o.exists()) throw new HttpsError("invalid-argument", "Bestillingen findes ikke.");
  }

  /* ⚠ REGNET MED SAMME nyBeholdning() SOM SKAERMEN VISER. To regnestykker
     ville kunne blive uenige om en optaelling — den SAETTER, den laegger
     ikke til. */
  post.foer = Number.isFinite(vare.beholdning) ? vare.beholdning : 0;
  post.efter = nyBeholdning(vare, post);

  const ref = rod.child("forbrugsvarebevaegelser").push();
  const sti = `tenants/${tenantId}`;
  await db.ref().update({
    [`${sti}/forbrugsvarebevaegelser/${ref.key}`]: post,
    [`${sti}/forbrugsvarer/${forbrugsvareId}/beholdning`]: post.efter,
    [`${sti}/forbrugsvarer/${forbrugsvareId}/sidstBevaegetMs`]: nu,
  });

  await logProcure(tenantId, uid, AUDIT.aendre, "forbrugsvarer", forbrugsvareId,
    { antal: post.foer }, { antal: post.efter },
    `${post.art}: ${post.antal}`);

  return { ok: true, id: ref.key, beholdning: post.efter };
});

/* ══════════════════════════════════════════════════════════════════════════
   FAKTURADESTINATION — hvor fakturaen hoerer HEN (beslutning 86)
   ══════════════════════════════════════════════════════════════════════════

   Fakturacenteret er en PLATFORMFUNKTION, ikke et modul: `Økonomi &
   Rapporter` staar ikke i modulkataloget, og `fakturaer/` har med vilje
   ingen modulklausul. En faktura kan hoere til et hvilket som helst modul,
   saa den maa ikke ligge bag ét af dem.

   ⚠ MEN DESTINATIONEN GOER. En kunde uden Facility maa ikke kunne placere
   en faktura paa en facility-sag: posten ville pege paa en node hans regler
   afviser, og "kan ikke laeses" ligner "findes ikke". Modulet laeses af
   NODEN — kom det fra klienten, kunne den sende hvad som helst.

   ⚠ SKIVE 4A — FIK EN PERMISSION DEN IKKE HAVDE. Kravede tidligere INGEN
   permission overhovedet — et reelt hul, ikke en bevidst permission-fri
   handling: enhver med en gyldig session kunne flytte en faktura mellem
   moduler. At placere en faktura er stadig en anden handling end at sige
   god for at der skal betales (`fakturaerGodkend`, `fakturastatus`) — men
   den er ikke gratis. `fakturaerSkriv` er samme skrive-niveau som
   `fakturamatch` bruger til den anden halvdel af samme skærms arbejde.
   ══════════════════════════════════════════════════════════════════════════ */
export const fakturadestination = onCall({ region: REGION }, async (req) => {
  const { db, rod, tenantId, uid } = await procureDoer(req, { perm: "fakturaer.skriv" });

  const d = req.data || {};
  const fakturaId = kortStreng(d.fakturaId, 60);
  if (!fakturaId) throw new HttpsError("invalid-argument", "fakturaId mangler.");

  const snap = await rod.child(`fakturaer/${fakturaId}`).once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Fakturaen findes ikke.");
  const faktura = { ...snap.val(), id: fakturaId };

  const art = kortStreng(d.art, 20);
  const id = kortStreng(d.id, 60);
  const begrundelse = kortStreng(d.begrundelse, 250);

  /* ⚠ MODULERNE LAESES AF NODEN. Kom de fra klienten, kunne den placere en
     faktura paa et modul kunden ikke har — og forslaget paa skaermen er
     filtreret paa netop den liste. Fravaerende node = ALLE moduler, praecis
     som reglen laeser den (`!moduler.exists() || …`). */
  const modulSnap = await rod.child("moduler").once("value");
  const moduler = modulSnap.exists() ? modulSnap.val() : null;

  /* ⚠ SAMME kanSaetteDestination() SOM SKAERMEN. Skaermen VISER; funktionen
     HAANDHAEVER, og den afviser med den saetning brugeren allerede har set. */
  const kan = kanSaetteDestination(faktura, { art, id, begrundelse }, { moduler });
  if (!kan.ok) {
    const kode = kan.aarsag.startsWith("Virksomheden har ikke")
      ? "permission-denied" : "failed-precondition";
    throw new HttpsError(kode, kan.aarsag);
  }

  /* ⚠ MAALET SKAL FINDES. En haengende reference er vaerre end ingen: den
     ser placeret ud og er det ikke, og den er allerede talt som afklaret.
     Reglen tjekker det ogsaa — men admin-SDK'et gaar uden om .validate, saa
     leddet skal staa her. */
  if (art !== "ingen") {
    const node = DESTINATIONSART[art].node;
    const maal = await rod.child(`${node}/${id}`).once("value");
    if (!maal.exists()) {
      throw new HttpsError("not-found", `Destinationen findes ikke i ${node}.`);
    }
    /* ⚠ OG ARTEN SKAL PASSE MED OPGAVENS EGEN ART. Fleet og Facility deler
       noden `opgaver`; uden det her led kunne en vaerkstedsopgave placeres
       som en facility-sag, og modulfilteret ovenfor ville vaere omgaaet. */
    const forventet = DESTINATIONSART[art].opgaveart;
    if (forventet && maal.child("art").val() !== forventet) {
      throw new HttpsError("failed-precondition",
        `Opgaven er ikke en ${DESTINATIONSART[art].label.toLowerCase()}.`);
    }
  }

  const nu = Date.now();
  const sti = `tenants/${tenantId}/fakturaer/${fakturaId}`;
  const opdatering = {
    [`${sti}/destinationArt`]: art,
    [`${sti}/destinationId`]: art === "ingen" ? null : id,
    [`${sti}/destinationGrund`]: art === "ingen" ? begrundelse : null,
    [`${sti}/matchetAf`]: uid,
    [`${sti}/matchetMs`]: nu,
    /* ⚠ `ikkeMatchbar` ER AFLOEST AF `destinationArt: "ingen"`, og den maa
       ikke blive staaende: to felter for ét svar driver, og Procure-skaermen
       laeser stadig det gamle. */
    [`${sti}/ikkeMatchbar`]: null,
    [`${sti}/ikkeMatchbarGrund`]: null,
  };

  await db.ref().update(opdatering);
  await logProcure(tenantId, uid, AUDIT.aendre, "fakturaer", fakturaId,
    { art: faktura.destinationArt ?? null }, { art },
    art === "ingen" ? `uden destination: ${begrundelse}` : `placeret paa ${art}/${id}`);

  return { ok: true, art, id: art === "ingen" ? null : id };
});

/* ══════════════════════════════════════════════════════════════════════════
   SAGER — beslutning 20/112, skive 1

   Datamodellen og politikken (`sager.js`) har været fuldt specificeret siden
   beslutning 20; det der manglede, var alt der rører databasen. `sager/` og
   `sensitive/sager/` er `.write: false` for alle — de fire funktioner
   herunder er de eneste veje ind.

   ⚠ MODTAGEVEJEN ER IKKE HER. Indgående mail (adapteren, DMARC-opslag,
   virusscanning, og en AUTOMATISK afsendelse af svar som del af den
   indgående tråd) kræver et leverandørvalg — dedikeret mailadresse med
   webhook, eller Microsoft Graph mod kundens eget 365 — og det er ikke
   afgjort. `sagBeskedSkriv` skriver derfor kun en INTERN note, aldrig en
   rigtig mail.

   ⚠ OG DET ER IKKE LÆNGERE HELE BILLEDET — Skive 3D tilføjede `sagMailSend`
   (længere nede i denne fil), som SENDER en rigtig udgående mail via
   Mailgun. De to funktioner deler tråd-noden; "kun udgående, aldrig
   modtagende" gælder stadig for hele sagsfeatureet, men "kun intern note,
   aldrig en rigtig mail" gælder ikke længere. Se ARKITEKTUR.md.
   ══════════════════════════════════════════════════════════════════════════ */

async function logSager(tenantId, uid, handling, id, foer, efter, note) {
  const d = diff(foer, efter);
  const klasse = klasseFor(handling, "sager");
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${tenantId}/${klasse}/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt: "sager", objektId: id,
      klasse,
      aendrede: d.aendrede, foer: d.foer, efter: d.efter,
      note: note ?? null
    });
}

export const sagOpret = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  if (!perms.includes("|sag.skriv|")) {
    throw new HttpsError("permission-denied", "Du må ikke oprette en sag. Det kræver sag.skriv.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const d = req.data || {};
  /* ⚠ ARTEN SÆTTES HER, IKKE AF KLIENTEN — modstykket til opgaveplanlaeg og
     facilityplanlaeg. */
  const sagArt = SAG_ART[kortStreng(d.art, 20)];
  if (!sagArt) throw new HttpsError("invalid-argument", `Ukendt sagsart "${d.art}".`);

  const paakraevetModul = sagArt.art === "fleet" ? "flaade" : "facility";
  const moduler = await rod.child("moduler").once("value");
  if (moduler.exists() && moduler.child(paakraevetModul).val() !== true) {
    throw new HttpsError("permission-denied", `${paakraevetModul}-modulet er ikke aktivt.`);
  }

  const emne = kortStreng(d.emne, 200);
  if (!emne) throw new HttpsError("invalid-argument", "Sagen skal have et emne.");

  /* ⚠ POLYMORF REFERENCE — kun "opgave" har et kendt mål i dag. Se
     test/referencetjek.test.mjs. */
  const objektType = kortStreng(d.objektType, 40);
  const objektId = kortStreng(d.objektId, 60);
  let opgave = null;
  if (objektType === "opgave" && objektId) {
    opgave = (await rod.child(`opgaver/${objektId}`).once("value")).val();
    if (!opgave) throw new HttpsError("not-found", `Opgaven ${objektId} findes ikke.`);
    /* ⚠ SKIVE 3C — opgave.sagId ER ÉT FELT, IKKE EN LISTE. En anden sag
       oprettet på samme opgave ville overskrive den første opgaves eneste
       spor tilbage til sig selv — den ville stadig findes i `sager/`, men
       ingen skærm kunne finde den fra opgaven igen. En sag ad gangen pr.
       opgave, som modellen rent faktisk bærer. */
    if (opgave.sagId) {
      throw new HttpsError("failed-precondition",
        `Opgaven har allerede en sag (${opgave.sagId}).`);
    }
    /* ⚠ SAMME PERMISSION SOM DEN DER SKRIVER OPGAVEN. sag.skriv siger at
       brugeren må oprette sager; det siger intet om at han må ÆNDRE en
       opgave — og det er præcis hvad koblingen gør. Spørg hvad handlingen
       kræver, ikke hvem brugeren er. */
    if (!perms.includes("|opgaver.skriv|")) {
      throw new HttpsError("permission-denied",
        "Du må ikke koble sagen til opgaven. Det kræver opgaver.skriv.");
    }
  }

  const modpartNavn = kortStreng(d.modpartNavn, 120);

  const post = {
    art: sagArt.art,
    tilstand: "aaben",
    emne,
    modul: paakraevetModul,
    oprettetAf: uid,
    oprettetMs: Date.now(),
    antalBeskeder: 0,
    antalKarantaene: 0,
    harAftale: false,
  };
  if (objektType) post.objektType = objektType;
  if (objektId) post.objektId = objektId;
  if (modpartNavn) post.modpartNavn = modpartNavn;

  post.nummer = await naesteSagsnummer(db, (sti) => `tenants/${tenantId}/${sti}`, sagArt.art);

  const sagId = rod.child("sager").push().key;

  /* ⚠ FUNDET VED DEV-VERIFIKATION. `parter` blev sat som sin EGEN nøgle i
     opdatering — `sager/${sagId}/parter/${partId}` — ved siden af
     `sager/${sagId}` (hele posten). RTDB's update() tillader ikke at én sti
     er forælder til en anden i SAMME kald ("values argument contains a path
     ... that is ancestor of another path ..."): sagOpret kastede derfor på
     ALT der havde en modpartEmail, hver eneste gang. push()-nøglen har ikke
     brug for at blive genereret under sin endelige sti — den er unik uanset
     hvilken ref den bliver bedt om. `parter` bygges nu ind i `post`, som er
     dét der skrives til `sager/${sagId}` — én sti, ikke to. */
  const modpartEmail = kortStreng(d.modpartEmail, 254);
  if (modpartEmail) {
    const partId = rod.child("sager").push().key;
    post.parter = { [partId]: modpartEmail.toLowerCase() };
  }

  const opdatering = { [`sager/${sagId}`]: post };

  /* ⚠ SKIVE 3C — SAMME update(), IKKE ET KALD MERE. `opgave.sagId` er
     beslutningen fra beslutning 45's feltskema, aldrig skrevet: sagen og
     koblingen lander sammen eller slet ikke, samme regel som opgave og
     reservation i opgaveplanlaeg. */
  if (opgave) {
    opdatering[`opgaver/${objektId}/sagId`] = sagId;
  }

  await rod.update(opdatering);
  await logSager(tenantId, uid, AUDIT.opret, sagId, null, post, `sag oprettet: ${post.nummer}`);

  return { sagId, nummer: post.nummer };
});

export const sagBeskedSkriv = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  /* ⚠ SAMME BUNDT SOM REGLENS .write — sag.skriv OG sag.sensitiveLaes. At
     skrive på tråden kræver at kunne læse den, som indberetninger.skriv +
     indberetninger.sensitiveLaes. */
  if (!perms.includes("|sag.skriv|") || !perms.includes("|sag.sensitiveLaes|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke skrive på sagen. Det kræver sag.skriv og sag.sensitiveLaes.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const d = req.data || {};
  const sagId = kortStreng(d.sagId, 60);
  if (!sagId) throw new HttpsError("invalid-argument", "sagId mangler.");
  const sag = (await rod.child(`sager/${sagId}`).once("value")).val();
  if (!sag) throw new HttpsError("not-found", `Sagen ${sagId} findes ikke.`);
  /* ⚠ FUNDET VED DEV-VERIFIKATION. Uden dette tjek skrev en besked på en
     afsluttet sag den stille tilbage til "afventerSvar" — en genåbning ad
     bagvejen, i strid med "Afslut sag"-dialogens eget løfte: "Sagen genåbnes
     ikke — en fortsættelse er en ny sag." */
  if (sag.tilstand === "afsluttet") {
    throw new HttpsError("failed-precondition", "Sagen er afsluttet og kan ikke ændres.");
  }

  const tekst = kortStreng(d.tekst, 10000);
  if (!tekst) throw new HttpsError("invalid-argument", "Beskeden må ikke være tom.");

  const nyTilstand = kortStreng(d.tilstand, 20);
  if (nyTilstand && !SAG_TILSTAND[nyTilstand]) {
    throw new HttpsError("invalid-argument", `Ukendt tilstand "${nyTilstand}".`);
  }

  /* ⚠ AFSENDEREN ER MEDARBEJDEREN, IKKE EN MAILADRESSE — retning er altid
     udgaaende her. Der er ingen modtagevej endnu. */
  const bruger = (await rod.child(`brugere/${uid}`).once("value")).val() || {};
  let afsenderNavn = null;
  if (bruger.personId) {
    const person = (await rod.child(`personale/${bruger.personId}`).once("value")).val();
    afsenderNavn = person?.navn || null;
  }

  const nu = Date.now();
  /* ⚠ SKIVE 3D — kanal: "internNote", EKSPLICIT. Feltet er nu påkrævet af
     firebase.rules.json, fordi en rigtig udgående mail (sagMailSend)
     genbruger denne samme beskeder-node. Uden det ville en note og en
     sendt mail ikke kunne skelnes i tråden. */
  const besked = { ms: nu, retning: "udgaaende", kanal: KANAL.internNote, tekst };
  if (bruger.email) besked.afsender = bruger.email;
  if (afsenderNavn) besked.afsenderNavn = afsenderNavn;

  const beskedId = rod.child(`sensitive/sager/${sagId}/beskeder`).push().key;
  const nyTilstandVaerdi = nyTilstand || "afventerSvar";
  const opdatering = {
    [`sensitive/sager/${sagId}/beskeder/${beskedId}`]: besked,
    [`sager/${sagId}/sidsteBeskedMs`]: nu,
    [`sager/${sagId}/antalBeskeder`]: ServerValue.increment(1),
    [`sager/${sagId}/tilstand`]: nyTilstandVaerdi,
  };

  await rod.update(opdatering);
  await logSager(tenantId, uid, AUDIT.aendre, sagId,
    { tilstand: sag.tilstand }, { tilstand: nyTilstandVaerdi }, "besked skrevet på sagen");

  return { beskedId };
});

export const sagKarantaeneFrigiv = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  if (!perms.includes("|sag.karantaeneFrigiv|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke frigive en karantæne. Det kræver sag.karantaeneFrigiv.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const d = req.data || {};
  const sagId = kortStreng(d.sagId, 60);
  if (!sagId) throw new HttpsError("invalid-argument", "sagId mangler.");
  const sag = (await rod.child(`sager/${sagId}`).once("value")).val();
  if (!sag) throw new HttpsError("not-found", `Sagen ${sagId} findes ikke.`);
  if (sag.tilstand === "afsluttet") {
    throw new HttpsError("failed-precondition", "Sagen er afsluttet og kan ikke ændres.");
  }

  const adresse = kortStreng(d.adresse, 254);
  if (!adresse) throw new HttpsError("invalid-argument", "adresse mangler.");

  /* ⚠ SAMME FUNKTION SOM POLITIKKEN — frigivKarantaene() i sager.js.
     Frigivelsen tilføjer adressen til DENNE sags parter alene. */
  const { parter: nyeParter } = frigivKarantaene(
    { parter: Object.values(sag.parter || {}) }, adresse
  );
  const nyAdresse = nyeParter[nyeParter.length - 1];
  const partId = rod.child(`sager/${sagId}/parter`).push().key;

  await rod.child(`sager/${sagId}/parter/${partId}`).set(nyAdresse);
  await logSager(tenantId, uid, AUDIT.aendre, sagId, null, { frigivet: nyAdresse },
    "adresse frigivet fra karantæne");

  return { ok: true };
});

export const sagAftaleBekraeft = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  if (!perms.includes("|sag.aftaleBekraeft|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke bekræfte et aftaleforslag. Det kræver sag.aftaleBekraeft.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const d = req.data || {};
  const sagId = kortStreng(d.sagId, 60);
  const aftaleId = kortStreng(d.aftaleId, 60);
  if (!sagId || !aftaleId) {
    throw new HttpsError("invalid-argument", "sagId og aftaleId er påkrævede.");
  }

  const sag = (await rod.child(`sager/${sagId}`).once("value")).val();
  if (!sag) throw new HttpsError("not-found", `Sagen ${sagId} findes ikke.`);
  if (sag.tilstand === "afsluttet") {
    throw new HttpsError("failed-precondition", "Sagen er afsluttet og kan ikke ændres.");
  }
  const aftale = (await rod.child(`sensitive/sager/${sagId}/aftaleforslag/${aftaleId}`)
    .once("value")).val();
  if (!aftale) throw new HttpsError("not-found", `Aftaleforslaget ${aftaleId} findes ikke.`);
  if (aftale.tilstand !== "forslag") {
    throw new HttpsError("failed-precondition",
      `Forslaget er allerede ${aftale.tilstand === "aftalt" ? "bekræftet" : "afvist"}.`);
  }
  if (!Number.isFinite(aftale.fra) || !Number.isFinite(aftale.til)) {
    throw new HttpsError("invalid-argument",
      "Forslaget mangler fra/til — det udtrukne tidspunkt skal sættes først.");
  }

  const nu = Date.now();
  /* ---- Reservationen, bygget ÉT sted ----------------------------------- */
  let ny;
  try {
    ny = reservationFraAftale(
      { id: sagId, art: sag.art, nummer: sag.nummer }, { ...aftale, tilstand: "aftalt" }
    );
  } catch (e) {
    throw new HttpsError("invalid-argument", e.message);
  }

  /* ---- Er ressourcen ledig? Samme mønster som facilityplanlaeg --------- */
  const aktiver = (await rod.child("facility/aktiver").once("value")).val() || {};
  const stier = [
    { ressourceType: ny.ressourceType, ressourceId: ny.ressourceId },
    ...indeslutninger(ny, { aktiver }),
  ];
  const grupper = await Promise.all(stier.map(async (s) => {
    const snap = await rod
      .child(`reservationer/${s.ressourceType}/${s.ressourceId}`)
      .once("value");
    return {
      ...s,
      reservationer: Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v })),
    };
  }));

  const svar = tjekLedigIndesluttet(ny, grupper);
  if (!svar.ok) {
    const foerste = svar.konflikter[0];
    const flere = svar.konflikter.length > 1
      ? ` (+${svar.konflikter.length - 1} mere)` : "";
    throw new HttpsError("failed-precondition",
      (foerste.tekst || konfliktTekst(ny, foerste)) + flere);
  }

  /* ---- ÉN SKRIVNING ------------------------------------------------------ */
  /* ⚠ res-${aftaleId}, IKKE en tilfældig nøgle — samme mønster som
     res-${opgaveId} i facilityplanlaeg, så en fremtidig funktion kan finde
     og fjerne reservationen igen, hvis aftalen trækkes tilbage. */
  const opdatering = {
    [`sensitive/sager/${sagId}/aftaleforslag/${aftaleId}/tilstand`]: "aftalt",
    [`sensitive/sager/${sagId}/aftaleforslag/${aftaleId}/bekraeftetAf`]: uid,
    [`sensitive/sager/${sagId}/aftaleforslag/${aftaleId}/bekraeftetMs`]: nu,
    [`sager/${sagId}/harAftale`]: true,
    [`sager/${sagId}/aftaleTilstand`]: "aftalt",
    [`sager/${sagId}/aftaleFraMs`]: aftale.fra,
    [`reservationer/${ny.ressourceType}/${ny.ressourceId}/res-${aftaleId}`]: {
      fra: ny.fra, til: ny.til, kilde: ny.kilde, oprettetAf: uid, oprettetMs: nu,
    },
  };

  await rod.update(opdatering);
  await logSager(tenantId, uid, AUDIT.tilstandsskift, sagId,
    { aftaleTilstand: sag.aftaleTilstand ?? null }, { aftaleTilstand: "aftalt" },
    `aftale bekræftet — reservation på ${ny.ressourceType} ${ny.ressourceId}`);

  return { ressourceType: ny.ressourceType, ressourceId: ny.ressourceId, fra: ny.fra, til: ny.til };
});

/* ══════════════════════════════════════════════════════════════════════════
   SAGAFSLUT — Skive 3C. Den femte og sidste vej ind i `sager/`.

   ⚠ HVORFOR DEN FINDES. Audit viste tilstand: "afsluttet" i SAG_TILSTAND, men
   ingen funktion kunne nogensinde sætte den — `sagBeskedSkriv` kan i teorien
   sende en vilkårlig SAG_TILSTAND med, men det er en BIPRODUKT af at skrive en
   besked, ikke en bevidst lukning, og den kræver ingen begrundelse. En sag der
   lukkes, skal kunne det UDEN at nogen først opfinder en tom besked at hænge
   skiftet på.

   ⚠ DEN ER SÅ SMAL SOM MULIGT. Ingen ny tilstandsmaskine — kanSkifteSagTilstand()
   i sager.js har kun ÉT mål: afsluttet, fra aaben eller afventerSvar. Ingen
   genåbning: afsluttet har intet naeste. Skal sagen fortsætte, er det en ny
   sag — samme svar som en afsluttet indberetning.
   ══════════════════════════════════════════════════════════════════════════ */
export const sagAfslut = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  /* ⚠ SAMME PERMISSION SOM DEN DER OPRETTER SAGEN. At lukke en sag er ikke en
     mindre handling end at åbne den. */
  if (!perms.includes("|sag.skriv|")) {
    throw new HttpsError("permission-denied", "Du må ikke afslutte en sag. Det kræver sag.skriv.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const d = req.data || {};
  const sagId = kortStreng(d.sagId, 60);
  if (!sagId) throw new HttpsError("invalid-argument", "sagId mangler.");
  const sag = (await rod.child(`sager/${sagId}`).once("value")).val();
  if (!sag) throw new HttpsError("not-found", `Sagen ${sagId} findes ikke.`);

  /* ⚠ SAMME MASKINE SOM SKÆRMEN VISER — kanSkifteSagTilstand(). En allerede
     afsluttet sag afvises med samme sætning som en afsluttet indberetning:
     en endestation, ikke en fejl der skal gættes forbi. */
  if (!kanSkifteSagTilstand(sag.tilstand, "afsluttet")) {
    throw new HttpsError("failed-precondition",
      `Sagen er "${SAG_TILSTAND[sag.tilstand]?.label || sag.tilstand}" og kan ikke afsluttes herfra.`);
  }

  /* ⚠ EN KORT BEGRUNDELSE, PÅKRÆVET — additivt felt, se firebase.rules.json.
     Uden den kan "kunden svarede aldrig" ikke skelnes fra "løst og lukket"
     næste gang nogen åbner sagen. Samme holdning som indberetningers
     ingenOmkostning.begrundelse. */
  const afslutningsAarsag = kortStreng(d.afslutningsAarsag, 300);
  if (!afslutningsAarsag) {
    throw new HttpsError("invalid-argument", "Sagen skal have en kort afslutningsårsag.");
  }

  const opdatering = {
    [`sager/${sagId}/tilstand`]: "afsluttet",
    [`sager/${sagId}/afslutningsAarsag`]: afslutningsAarsag,
  };

  await rod.update(opdatering);
  /* ⚠ ÅRSAGEN ER FRITEKST OG STÅR IKKE I AUDITPOSTEN — kun tilstandsskiftet
     gør, ligesom "status" og "tilstand" andre steder. Begrundelsen bor på
     sagen selv, som er sin egen historik. */
  await logSager(tenantId, uid, AUDIT.tilstandsskift, sagId,
    { tilstand: sag.tilstand }, { tilstand: "afsluttet" }, "sag afsluttet");

  return { sagId, tilstand: "afsluttet" };
});

/* ══════════════════════════════════════════════════════════════════════════
   SAGMAILSEND — SKIVE 3D. Den første rigtige udgående mail FleetControl
   nogensinde sender. Alle syv Gate A-krav (docs/security-compliance/
   08_EMAIL_SECURITY_GATE.md, 12_FINDINGS_AND_REMEDIATION_PLAN.md) er
   markeret ved deres punkt herunder.

   1. MODTAGEREN OPLØSES SERVER-SIDE. Klienten sender kun partId — aldrig
      en adresse. sag.parter er nøglet på et push-id, netop fordi en rå
      e-mailadresse ikke kan være en RTDB-nøgle (samme grund som i
      sagOpret). Et partId der ikke findes på DENNE sag, afvises — det
      dækker både et manipuleret id og et fra en anden tenant, fordi sagen
      selv allerede er tenant-scopet af `rod`.
   2. PROVIDER-HEMMELIGHEDEN ligger i den valgte adapter under
      functions/mail/adapters/, aldrig i en VITE_*-klientvariabel. Denne
      funktion kender kun MAIL_ADAPTER-referencen, aldrig et API-nøgle.
   3. PERMISSION: perms.includes('|sag.mailSend|') — egen permission,
      ikke sag.skriv. Se permissions.js.
   4. TENANT + SAGSTILSTAND genverificeres her, uafhængigt af klientens
      påstand — samme mønster som sagBeskedSkriv/sagKarantaeneFrigiv/
      sagAftaleBekraeft efter denne sessions rettelse: en afsluttet sag
      afvises.
   5. AUDIT skrives ubetinget nedenfor, uanset udfald — anmodet, accepteret
      og fejlet er alle et logSager()-kald. Ingen brødtekst i posten.
   6. HEADER-INJEKTION: emnet går gennem saniterHeaderFelt() før det
      forlader denne funktion.
   7. IDEMPOTENS: sendRequestId ER selve beskedens RTDB-nøgle, sat via en
      transaction() der afviser at overskrive en eksisterende post. Et
      dobbeltklik, en browser-retry eller en funktions-retry rammer den
      SAMME post og sender højst én mail.
   ══════════════════════════════════════════════════════════════════════════ */

/* ⚠ SKIFT ADAPTER HER, ÉT STED, NÅR EN UDBYDER SKIFTES (Gate A punkt 8).
   Valget faldt på Mailgun (EU-region) — se beslutningsnotatet i
   docs/security-compliance/08_EMAIL_SECURITY_GATE.md §8. */
const MAIL_ADAPTER = mailgunAdapter;

/* ⚠ SERVER-SIDE, IKKE KLIENTSIDE — Gate A punkt 6. Ét minutvindue pr.
   bruger, ét fast loft. Højt nok til en travl sagsbehandler, lavt nok til
   at stoppe en løkke. */
const MAIL_RATE_LIMIT_PR_MINUT = 20;

async function tjekOgOptaelMailRate(rod, uid) {
  const vindue = new Date().toISOString().slice(0, 16); // "2026-08-25T12:34"
  const ref = rod.child(`mailRatelimit/${uid}/${vindue}`);
  const res = await ref.transaction((cur) => (cur || 0) + 1);
  return (res.snapshot.val() || 0) <= MAIL_RATE_LIMIT_PR_MINUT;
}

export const sagMailSend = onCall({
  region: REGION,
  /* ⚠ GATE A PUNKT 2 — SECRETS BUNDET HER, IKKE LÆST FRA ET VILKÅRLIGT
     MILJØ. Kun denne funktion (og adapteren den kalder) kan se dem. */
  secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_AFSENDER],
}, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  if (!perms.includes("|sag.mailSend|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke sende mail fra sagen. Det kræver sag.mailSend.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const d = req.data || {};
  const sagId = kortStreng(d.sagId, 60);
  if (!sagId) throw new HttpsError("invalid-argument", "sagId mangler.");
  const sag = (await rod.child(`sager/${sagId}`).once("value")).val();
  if (!sag) throw new HttpsError("not-found", `Sagen ${sagId} findes ikke.`);
  if (sag.tilstand === "afsluttet") {
    throw new HttpsError("failed-precondition", "Sagen er afsluttet og kan ikke ændres.");
  }

  const partId = kortStreng(d.partId, 60);
  if (!partId) throw new HttpsError("invalid-argument", "partId mangler.");
  /* ⚠ GATE A, PUNKT 1 — MODTAGEREN OPLØSES HER. Se funktionshovedet. */
  const til = sag.parter?.[partId];
  if (!til) {
    throw new HttpsError("invalid-argument", "Den valgte part findes ikke på sagen.");
  }

  const emneRaa = valideEmne(d.emne);
  if (!emneRaa) throw new HttpsError("invalid-argument", "Emnet må ikke være tomt.");
  const emne = saniterHeaderFelt(emneRaa, 250);
  const tekst = valideTekst(d.tekst);
  if (!tekst) throw new HttpsError("invalid-argument", "Beskeden må ikke være tom.");

  const sendRequestId = kortStreng(d.sendRequestId, 60);
  if (!sendRequestId || !erGyldigtSendRequestId(sendRequestId)) {
    throw new HttpsError("invalid-argument", "sendRequestId mangler eller er ugyldigt.");
  }

  const bruger = (await rod.child(`brugere/${uid}`).once("value")).val() || {};
  let afsenderNavn = null;
  if (bruger.personId) {
    const person = (await rod.child(`personale/${bruger.personId}`).once("value")).val();
    afsenderNavn = person?.navn || null;
  }

  /* ---- Idempotens: sendRequestId ER nøglen — Gate A, punkt 7 ------------
     Samme mønster som statushaendelsers klientId (rutestatus.js,
     beslutning 103): en gensendelse skal ramme den SAMME post. transaction()
     med et abort-udfald (undefined) hvis posten allerede findes, er den
     eneste sikre "opret hvis ny" i RTDB. */
  const beskedRef = rod.child(`sensitive/sager/${sagId}/beskeder/${sendRequestId}`);
  const modtagerId = rod.child("sager").push().key;
  const foreloebig = {
    ms: Date.now(), retning: "udgaaende", kanal: KANAL.mail,
    tekst, emne, modtagere: { [modtagerId]: til }, partId,
    mailStatus: "anmodet",
  };
  if (bruger.email) foreloebig.afsender = bruger.email;
  if (afsenderNavn) foreloebig.afsenderNavn = afsenderNavn;

  const trans = await beskedRef.transaction((cur) => (cur === null ? foreloebig : undefined));
  if (!trans.committed) {
    /* Allerede anmodet/sendt/fejlet under dette sendRequestId — den
       eksisterende tilstand returneres i stedet for at sende igen. */
    const eksisterende = trans.snapshot.val();
    return { beskedId: sendRequestId, mailStatus: eksisterende?.mailStatus || "anmodet", allerede: true };
  }

  /* ---- Rate limit — Gate A, punkt 6, EFTER reservationen ----------------
     En replay (ovenfor) tæller ikke med her; kun et GENUINT nyt forsøg gør. */
  const indenforGraense = await tjekOgOptaelMailRate(rod, uid);
  if (!indenforGraense) {
    await beskedRef.update({ mailStatus: "fejlet", fejlAarsag: "For mange forsøg. Prøv igen om et øjeblik." });
    await logSager(tenantId, uid, AUDIT.aendre, sagId, null, { mailStatus: "fejlet" }, "mail afvist — rate limit");
    throw new HttpsError("resource-exhausted", "For mange mails sendt på kort tid. Prøv igen om et øjeblik.");
  }

  /* ---- Selve afsendelsen — Gate A, punkt 2 ------------------------------ */
  const resultat = await sendMail(MAIL_ADAPTER, { til, emne, tekst });

  const opdatering = {
    [`sensitive/sager/${sagId}/beskeder/${sendRequestId}/mailStatus`]: resultat.status,
  };
  if (resultat.providerId) {
    opdatering[`sensitive/sager/${sagId}/beskeder/${sendRequestId}/providerId`] = resultat.providerId;
  }
  if (resultat.fejlAarsag) {
    opdatering[`sensitive/sager/${sagId}/beskeder/${sendRequestId}/fejlAarsag`] = resultat.fejlAarsag;
  }
  if (resultat.status === "accepteret") {
    /* ⚠ SAMME SEMANTIK SOM sagBeskedSkriv: en udgående henvendelse sætter
       sagen på "afventerSvar" — men kun ved reel accept fra udbyderen. En
       fejlet mail har ikke bedt modparten om noget. */
    opdatering[`sager/${sagId}/sidsteBeskedMs`] = Date.now();
    opdatering[`sager/${sagId}/antalMails`] = ServerValue.increment(1);
    opdatering[`sager/${sagId}/tilstand`] = "afventerSvar";
  }
  await rod.update(opdatering);

  /* ---- Audit — Gate A, punkt 5, UBETINGET -------------------------------
     mailStatus og partId er begge kontrollerede/lukkede felter på
     LOGBARE_FELTER — emnet og teksten er det ikke, og står derfor ikke i
     posten. */
  await logSager(tenantId, uid, AUDIT.aendre, sagId, null,
    { mailStatus: resultat.status, partId }, "mail forsøgt sendt fra sagen");

  if (resultat.status === "fejlet") {
    throw new HttpsError("internal", `Mailen kunne ikke sendes: ${resultat.fejlAarsag || "ukendt fejl"}.`);
  }

  return { beskedId: sendRequestId, mailStatus: resultat.status };
});

/* ══════════════════════════════════════════════════════════════════════════
   RETENTION — beslutning 115, ikke-destruktiv grundmekanisme

   ⚠ INGEN AF DE TO FUNKTIONER SLETTER ELLER ANONYMISERER NOGET.
   `retentionLegalHold` sætter/ophæver en UNDTAGELSE fra en fremtidig
   sletning — den skriver ét felt-sæt på én post i `retention/legalHold`.
   `retentionDryRun` LÆSER og RAPPORTERER, og rører intet. Selve
   mekanismen der rent faktisk sletter eller anonymiserer, findes ikke —
   se anonymiser()/eksporterFoerSletning()/slet() i retention-regler.js,
   som kaster hvis de kaldes.
   ══════════════════════════════════════════════════════════════════════════ */

async function logRetention(tenantId, uid, handling, id, foer, efter, note) {
  const d = diff(foer, efter);
  const klasse = klasseFor(handling, "retention");
  const nu = new Date();
  await getDatabase()
    .ref(`audit/${tenantId}/${klasse}/${nu.getUTCFullYear()}/${String(nu.getUTCMonth() + 1).padStart(2, "0")}`)
    .push()
    .set({
      ms: Date.now(), uid, handling, objekt: "retention", objektId: id,
      klasse,
      aendrede: d.aendrede, foer: d.foer, efter: d.efter,
      note: note ?? null
    });
}

export const retentionLegalHold = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  if (!perms.includes("|retention.skriv|") || !perms.includes("|retention.laes|")) {
    throw new HttpsError("permission-denied",
      "Du må ikke sætte eller ophæve et legal hold. Det kræver retention.skriv og retention.laes.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const d = req.data || {};
  const holdId = kortStreng(d.holdId, 60);

  /* ---- OPHÆVELSE af et eksisterende hold ------------------------------ */
  if (holdId) {
    const eksisterende = (await rod.child(`retention/legalHold/${holdId}`).once("value")).val();
    if (!eksisterende) throw new HttpsError("not-found", `Holdet ${holdId} findes ikke.`);
    if (eksisterende.ophaevetMs) {
      throw new HttpsError("failed-precondition", "Holdet er allerede ophævet.");
    }
    const nu = Date.now();
    await rod.child(`retention/legalHold/${holdId}`).update({ ophaevetAf: uid, ophaevetMs: nu });
    await logRetention(tenantId, uid, AUDIT.aendre, holdId,
      { ophaevetMs: null }, { ophaevetMs: nu },
      `legal hold ophævet: ${eksisterende.objekt}/${eksisterende.objektId}`);
    return { holdId, ophaevet: true };
  }

  /* ---- NYT HOLD --------------------------------------------------------- */
  const objekt = kortStreng(d.objekt, 60);
  const objektId = kortStreng(d.objektId, 60);
  const aarsag = kortStreng(d.aarsag, 500);
  if (!objekt || !objektId) {
    throw new HttpsError("invalid-argument", "objekt og objektId er påkrævede.");
  }
  if (!aarsag) throw new HttpsError("invalid-argument", "Et legal hold skal have en begrundelse.");

  const nu = Date.now();
  const post = { objekt, objektId, aarsag, satAf: uid, satMs: nu };
  const nytHoldId = rod.child("retention/legalHold").push().key;
  await rod.child(`retention/legalHold/${nytHoldId}`).set(post);
  await logRetention(tenantId, uid, AUDIT.opret, nytHoldId, null, post,
    `legal hold sat: ${objekt}/${objektId}`);

  return { holdId: nytHoldId };
});

export const retentionDryRun = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  const uid = auth.uid;
  const perms = typeof auth.token?.perms === "string" ? auth.token.perms : "";

  if (!perms.includes("|retention.laes|")) {
    throw new HttpsError("permission-denied", "Du må ikke køre en retention-rapport. Det kræver retention.laes.");
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const d = req.data || {};
  const kategori = kortStreng(d.kategori, 60);
  const info = kategori ? RETENTION_KATEGORI[kategori] : null;
  if (!info) throw new HttpsError("invalid-argument", `Ukendt kategori "${d.kategori}".`);
  if (!info.bygget) {
    throw new HttpsError("failed-precondition",
      `"${info.label}" findes ikke i produktet endnu — der er intet at rapportere på.`);
  }

  /* ⚠ periodeMaaneder ER EN HYPOTESE FRA KALDEREN, IKKE DEN AFGJORTE
     GRÆNSE — se simulerRetention()s egen note. Rapporten svarer på "hvad
     ville DETTE tal betyde i dag", uafhængigt af at RETENTION_KATEGORI's
     eget periodeMaaneder stadig er null. */
  const periodeMaaneder = Number(d.periodeMaaneder);
  if (!Number.isFinite(periodeMaaneder) || periodeMaaneder <= 0) {
    throw new HttpsError("invalid-argument", "periodeMaaneder skal være et positivt tal.");
  }
  const tidsfelt = kortStreng(d.tidsfelt, 40) || "oprettetMs";

  const holds = Object.values(
    (await rod.child("retention/legalHold").once("value")).val() || {}
  );

  const nu = Date.now();
  const noder = [];
  for (const node of info.noder) {
    const raa = (await rod.child(node).once("value")).val() || {};
    const poster = Object.entries(raa).map(([id, v]) => ({ id, ...v }));
    const svar = simulerRetention(node, poster, { periodeMaaneder, tidsfelt }, holds, nu);
    noder.push({
      node,
      antal: {
        paavirkede: svar.paavirkede.length,
        undtagetAfHold: svar.undtagetAfHold.length,
        forUngeEndnu: svar.forUngeEndnu.length,
      },
      /* ⚠ KUN ID'ER, IKKE HELE POSTER. Rapporten skal kunne vise HVOR
         mange og HVILKE — ikke gengive brødtekst, skadebeskrivelser eller
         andet følsomt indhold i en rapport der ligger i audit-loggen. */
      paavirkedeIder: svar.paavirkede.map((p) => p.id),
    });
  }

  await logRetention(tenantId, uid, AUDIT.laes, kategori, null,
    { periodeMaaneder, tidsfelt },
    `dry-run kørt for "${info.label}"`);

  return { kategori, periodeMaaneder, tidsfelt, noder };
});

/* ══════════════════════════════════════════════════════════════════════════
   KPI-AGGREGERINGEN — det sidste punkt på listen

   Beslutning 6: nøgletal læses ÉT sted, `tenants/<id>/kpi/current`,
   og afledte tal beregnes hos forbrugeren. Noden har været seedet fra
   demo-sættet; her regnes den af de rigtige noder.

   ⚠ REGNESTYKKET LIGGER IKKE HER. `beregnKpi()` i den delte
   kpi-aggregering.js er ren — den kender ingen database — så hele
   beregningen kan prøves uden en emulator. Jobbet henter noderne og skriver
   svaret; det er alt.

   ⚠ ET FELT UDEN KILDE BLIVER `null`, ikke 0. Skrev vi 0, ville skærmen sige
   "0 åbne ordrer" om noget der aldrig var talt — se noten i
   kpi-aggregering.js og `INTET` i format.js. Optællingen af hvor mange der
   er, ligger på det `beregnKpi()` returnerer og ikke i et tal skrevet her;
   den stod på 52 i denne kommentar længe efter at den var noget andet.

   ⚠ FORRIGE KØRSEL GEMMES, OG DET ER DELTAERNES ENESTE KILDE.
   `kpi/forrige` er den forrige `current`. Uden den kan en
   periodeafvigelse ikke regnes, og første kørsel giver derfor `null` — ikke
   0 %, som ville betyde "uændret".

   ⚠ TENANTLISTEN KOMMER FRA `udbyder/kunder`, som `maaldagligt` og
   `auditoprydning` også bruger. En tenant der ikke er i indekset, får ingen
   nøgletal — og DEV's `demo`-tenant står ikke der, så det seedede demo-sæt
   bliver liggende. Det er med vilje: dev skal kunne vise en fuld skærm.
   ══════════════════════════════════════════════════════════════════════════ */

/* ⚠ HER STOD EN KONSTANT MED DE TO DIVISIONER, og jobbet skrev ÉN
   gren pr. division. Aksen er fjernet i beslutning 70: ingen abonnent har
   både gods og bus, så den ene af de to grene beskrev en forretning kunden
   ikke havde — og for flåden og bemandingen stod der de SAMME tal i begge
   (beslutning 69). Der skrives nu ét sæt til `kpi/current`. */

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
        koeretoejer, personale, kompetencer, reservationer, bookinger, fravaer, forbrugsvarer,
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
          /* ⚠ DE FIRE SIDSTE KOM TIL FOR `disponering.konflikter`. De fem tjek
             er en REN funktion — men den skal have sine lister, og uden dem
             svarer feltet null frem for nul: en aggregering der ikke fik sine
             biler, ved ikke at der er nul konflikter. */
          rod.child("koeretoejer").once("value").then((s) => raekker(s.val())),
          rod.child("personale").once("value").then((s) => raekker(s.val())),
          rod.child("kompetencer").once("value").then((s) => raekker(s.val())),
          /* ⚠ RESERVATIONER ER ET TRAE, IKKE EN LISTE: <type>/<id>/<resId>.
             `raekker()` ville lave typerne om til poster med et id. Formen er
             den `tjekDisponering()` slaar op i, og den bygges her frem for i
             regnestykket — jobbet henter, funktionen regner. */
          rod.child("reservationer").once("value").then((s) => {
            const raa = s.val() || {};
            const ud = {};
            for (const [type, paaType] of Object.entries(raa)) {
              ud[type] = {};
              for (const [id, poster] of Object.entries(paaType || {})) {
                ud[type][id] = Object.entries(poster || {}).map(([rid, v]) => ({ id: rid, ...v }));
              }
            }
            return ud;
          }),
          /* ⚠ BOOKINGERNE KOM MED FOR `opgaver.nyeBookinger` — arbejde der er
             kommet ind siden forrige beregning. ⚠ OG DEN STÅR SIDST FORDI
             RÆKKEFØLGEN ER KONTRAKTEN: destruktureringen ovenfor matcher
             positionerne her, og et led indsat i midten ville give
             `koeretoejer` bookingerne — uden at noget fejlede. */
          rod.child("bookinger").once("value").then((s) => raekker(s.val())),
          /* ⚠ FRAVÆRET KOM TIL FOR `bemanding.fravaerIDag` (beslutning 69), og
             det står EFTER bookingerne af nøjagtig samme grund som de står
             sidst: rækkefølgen er kontrakten. Et led indsat i midten ville
             give `koeretoejer` fraværet — og intet ville fejle. */
          rod.child("fravaer").once("value").then((s) => raekker(s.val())),
          /* ⚠ PROCURES EGET VARELAGER (beslutning 85) — ikke Warehouses
             `varer`, som er KUNDENS gods. Og det staar SIDST af samme grund
             som de to ovenfor: raekkefoelgen ER kontrakten.

             ⚠ OG PROVISIONERINGEN HENTER DEN SAMME NODE. Gjorde kun det ene
             det, ville dev vise ét tal og natten et andet. */
          rod.child("forbrugsvarer").once("value").then((s) => raekker(s.val())),
        ]);

      {
        const sti = rod.child("kpi");
        const forrige = (await sti.child("current").once("value")).val();
        const nyt = beregnKpi({
          kunder, etaper, grundlag, opgaver, indkoeb, fakturaer,
          leverandoerer, facilityAktiver, facilityFejl, facilitySensorer,
          indberetninger, koeretoejer, personale, kompetencer, reservationer,
          bookinger, fravaer, forbrugsvarer, forrige, nu
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
    console.log(`kpiaggregering: ${skrevet} af ${Object.keys(kunderIndeks).length} tenants skrevet.`);
    return null;
  }
);
