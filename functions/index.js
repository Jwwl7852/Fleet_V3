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
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { initializeApp, getApp } from "firebase-admin/app";
import { getDatabase, ServerValue } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import {
  createHash, createHmac, randomBytes, randomUUID, timingSafeEqual,
} from "node:crypto";
import { decryptWebshopCredential, encryptWebshopCredential } from "./procure-webshop-credentials.js";
import { genererTilbudsPdf } from "./tilbud-pdf.js";
import { fakturagrundlagCsv, genererFakturagrundlagPdf } from "./fakturagrundlag-pdf.js";
import { genererKreditnotaPdf } from "./kreditnota-pdf.js";
import {
  byggFakturaPortPayload, byggKreditnotaPortPayload, simulerFakturaPort,
  simulerKreditnotaPort, TEST_SCENARIER,
} from "./dinero-test-adapter.js";
import {
  DineroFejl, dineroKlient, dineroKreditnotaCreateModel, hentDineroToken,
} from "./dinero-personlig.js";
import {
  TRAAD_STATUS, VIDEN_STATUS, aiBudgetKanReserveres,
  godkendelseErAktuel, mailIndholdHash, normaliserBesked, normaliserEmail,
  sha256, tekst, vurderForfaldenOpfoelgning, vurderMailjobFoerTransport,
} from "./salgsplatform.js";
import {
  hentGraphToken, hentMailDelta, hentMailVedhaeftninger, hentMailVedhaeftningBytes,
  opretOgSendKladde,
} from "./microsoft-graph.js";
import {
  SALGS_AI_INSTRUKTION, byggOpenAiAnmodning, kaldOpenAi,
} from "./openai-salgsassistent.js";
import { koerMailjobWorker, MailjobWorkerFejl } from "./mailjob-worker.js";
import { findOffentligLoginKontekst } from "./offentlig-login-kontekst.js";
import {
  completeFleetServiceOccurrence,
  runFleetServiceAutomationForTenant,
  validateFleetServiceRequirement,
  validateFleetServiceRequirementChange,
} from "./fleet-service-automation.js";

import {
  AUDIT, LOGBARE_FELTER, KLASSER, klasseFor, diff, forfaldnePartitioner
} from "./delt/audit-regler.js";
import { beregnKpi } from "./delt/kpi-aggregering.js";
import {
  valideUdlaan, kanSkifteUdlaan, virkningPaaKasse, konflikter,
  valideKasse, KASSE_ID_MOENSTER,
  bygUnitbevaegelse, sammeUnitbevaegelse, UNIT_OPERATION_ID_MOENSTER,
} from "./delt/unitbooking.js";
import {
  UNIT_IMPORT_MAKS_BYTES, UNIT_IMPORT_MAKS_TEKST,
  filtypeFraNavn, valideImportFil, udtraekBookingtekst, udtraekCsv,
  valideImportKladde, rensImportKladde, vurderKasse, isoTilUtcMs,
} from "./delt/unitbooking-import.js";
import {
  udtraekUnitDokument, UNIT_LOKAL_UDTRAEK_FILTYPE,
} from "./unitbooking-document-extraction.js";
import {
  valideBevaegelse, virkningPaaBeholdning, kanPlukkesFra, PLADS_STATUS,
  talFraMaengde, kanSkifteOrdre, beholdningsNoegle, UDEN_BATCH,
  valideOptaelling, validePlacering, virkningPaaCarrier, kanPlaceres,
  CARRIER_STATUS, virkningPaaEnhed, valideEnhed, ENHED_TILSTAND,
  vareEjerforhold
} from "./delt/warehouse.js";
import {
  bygWarehouseUnitbevaegelse, bindendeBookingerForUnit,
  sammenlignOperation, valideUnitBevaegelse,
} from "./delt/warehouse-unit.js";
import {
  ROLLE_PERMS, permsForTenant,
  valideRolleperms, laaserUde, PERM, byggRolleClaims, permStrengFraClaims,
} from "./delt/permissions.js";
import {
  hardwareErLedig, validerHardwareTilknytning,
} from "./delt/ressource-regler.js";
import { migrerClaimKonti } from "./delt/claims-migration.js";
import { erEjerClaims, erTokenEfterRevocation } from "./delt/ejeradgang.js";
import {
  harValideringsfejl, validerCrmVirksomhed, validerCrmMulighed, validerCrmAktivitet,
} from "./delt/ejer-crm-regler.js";
import { ratebladFraPrisliste, validerTilbud, tilbudsnummer } from "./delt/ejer-tilbud-regler.js";
import {
  kundekontoAendringer, kundekontoFraTilbudssnapshot, normaliserKundekonto,
} from "./delt/ejer-kundekonto-regler.js";
import { byggKreditsnapshot, validerKreditModResterende } from "./delt/ejer-kreditnota-regler.js";
import {
  BILAG_MAX_BYTES, BILAG_MIME, BILAG_STATUS, bilagDedupeSignaler,
  filsignaturMatcher, normaliserBilagsmetadata,
} from "./delt/ejer-bilag-regler.js";
import {
  DELINGSSTATUS, SAGSTYPER, SUPPORT_PRIORITET, SUPPORT_STATUS, SUPPORT_TYPER,
  ejerMaaSeKommunikation, fletPostkasseKilder, klassificerKommunikation, normaliserSupport, postkasseKilde,
} from "./delt/ejer-kommunikation-regler.js";
import { bilagMailForbindelsesstatus, koerIsoleretOcrTest } from "./bilag-adaptere.js";
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
import { FORLOEB, kanSkifteTil, kanAfslutte } from "./delt/indberetninger.js";
import {
  valideForbrugsvare, valideBevaegelse as valideForbrugsvarebevaegelse,
  nyBeholdning,
} from "./delt/forbrugsvarer.js";
import {
  DESTINATIONSART, kanSaetteDestination,
} from "./delt/fakturacenter.js";
import {
  FAKTURAKONTROL_HANDLING,
  STANDARD_FAKTURAKONTROL_OPSAETNING,
  anvendFakturakontrol, normaliserFakturakontrolOpsaetning,
  validerFakturakontrolOpsaetning, vurderFakturakontrol,
} from "./delt/fakturacenter-kontrol.js";
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
import { localTestMailAdapter } from "./mail/adapters/local-test.js";

/* ⚠ FIREBASE SECRET MANAGER — GATE A PUNKT 2. Bindes eksplicit til
   sagMailSend nedenfor via `secrets: [...]`. Sættes med
   `firebase functions:secrets:set MAILGUN_API_KEY` osv., ALDRIG i en
   .env-fil der committes, og ALDRIG som en VITE_*-klientvariabel. */
const MAILGUN_API_KEY = defineSecret("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = defineSecret("MAILGUN_DOMAIN");
const MAILGUN_AFSENDER = defineSecret("MAILGUN_AFSENDER");
const PROCURE_WEBSHOP_KEY = defineSecret("PROCURE_WEBSHOP_KEY");
const M365_CLIENT_SECRET = defineSecret("M365_CLIENT_SECRET");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const WEBFORM_HMAC_SECRET = defineSecret("WEBFORM_HMAC_SECRET");
const DINERO_CLIENT_SECRET = defineSecret("DINERO_CLIENT_SECRET");
const DINERO_API_KEY = defineSecret("DINERO_API_KEY");
const UNITBOOKING_EXTRACTION_API_KEY = defineSecret("UNITBOOKING_EXTRACTION_API_KEY");
const VEYRO_OFFENTLIGE_LOGIN_KONTEKSTER_JSON = defineSecret("VEYRO_OFFENTLIGE_LOGIN_KONTEKSTER_JSON");
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
import {
  createOrderPdfBytes, ORDRE_PDF_SKABELON_VERSION, ordrePdfStoragePath,
  ordreRevision, validerOrdrePdfGrundlag,
} from "./delt/procure-v2/procure-pdf.js";
import {
  byggServerModtagelse, byggServerKorrektion, byggServerReturnering, ordreErFuldtModtaget,
  byggImporteretFaktura, modtagetPrLinje, serverOrdreLinjer,
  sanitizeMobileDraft, splitServerDraft, decideServerApproval,
} from "./delt/procure-v2/procure-backend-domain.js";
import {
  USER_INVENTORY_TYPES, applyInventoryMovement, applyInventoryTransfer,
  inventoryLocation, stockQuantityForOrderLine,
} from "./delt/procure-v2/procure-inventory-domain.js";
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

/* Fælles supportsag ejes af integrations-/supportsporet. Selve handlerne
   ligger separat, så ejerchatten kan koble UI på uden at oprette parallelle
   endpoints eller redigere den store platformfil. */
export {
  supportSamtaleStart, supportSamtalerList, supportSamtaleHent,
  supportBeskedSend, supportEskaler, supportSagLoes, supportSagGenaabn,
  supportEjerKoelist, supportEjerSagHent, supportEjerOvertag,
  supportEjerStatusOpdater, supportEjerSvarKladdeGem,
  supportEjerAiForslagGem, supportEjerBaggrundGem,
  supportEjerSvarGodkend, supportEjerSvarTransporter,
  supportEjerSvarSend, supportEjerNoteSkriv,
} from "./support-endpoints.js";

export {
  workforceprojektionhent, workforcekommando, workforceplanningtjek,
} from "./workforce-endpoints.js";

const lokalStorageBucket = process.env.FUNCTIONS_EMULATOR === "true" && process.env.GCLOUD_PROJECT
  ? `${process.env.GCLOUD_PROJECT}.appspot.com`
  : null;
let runtimeFirebaseConfig = {};
try { runtimeFirebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || "{}"); } catch { runtimeFirebaseConfig = {}; }
const lokalDatabaseUrl = process.env.FUNCTIONS_EMULATOR === "true"
  ? process.env.VEYRO_EMULATOR_DATABASE_URL || null
  : null;
if (lokalDatabaseUrl && !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/\?ns=demo-[a-z0-9-]+-default-rtdb$/.test(lokalDatabaseUrl)) {
  throw new Error("VEYRO_EMULATOR_DATABASE_URL skal være localhost og et demo-*-default-rtdb namespace.");
}
initializeApp(lokalStorageBucket ? {
  ...runtimeFirebaseConfig,
  projectId: runtimeFirebaseConfig.projectId || process.env.GCLOUD_PROJECT,
  databaseURL: lokalDatabaseUrl || runtimeFirebaseConfig.databaseURL || `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`,
  storageBucket: runtimeFirebaseConfig.storageBucket || lokalStorageBucket,
} : undefined);

const REGION = "europe-west1";

/* Minimal præ-loginprojektion. Den eksponerer hverken tenant-id, navn,
   permissions eller abonnementsdata. Et eksakt, serverkonfigureret Origin er
   den eneste nøgle; ukendte adresser får ingen CORS-adgang og ingen katalog. */
export const offentligloginkontekst = onRequest({
  region: REGION,
  cors: false,
  secrets: [VEYRO_OFFENTLIGE_LOGIN_KONTEKSTER_JSON],
}, (req, res) => {
  const origin = String(req.headers.origin || "");
  const kontekst = findOffentligLoginKontekst({
    origin,
    råKonfiguration: VEYRO_OFFENTLIGE_LOGIN_KONTEKSTER_JSON.value(),
  });
  res.set("Vary", "Origin");
  res.set("Cache-Control", "private, no-store");
  if (!kontekst) { res.status(404).json({ fejl: "Ukendt loginadresse." }); return; }
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Accept");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ fejl: "Metoden understøttes ikke." }); return; }
  res.status(200).json(kontekst);
});

const erLokalStorageEmulator = () => process.env.FUNCTIONS_EMULATOR === "true"
  && Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
const lokalStorageTokenSti = (token) => `_lokaleProcureStorageTokens/${createHash("sha256").update(token).digest("hex")}`;

async function lokalStorageUrl(req, payload) {
  const host = String(req.rawRequest?.headers?.host || "");
  if (!erLokalStorageEmulator() || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return null;
  const token = randomUUID();
  await getDatabase().ref(lokalStorageTokenSti(token)).set({ ...payload, udloeberMs: Date.now() + 10 * 60 * 1000 });
  return `http://${host}/${process.env.GCLOUD_PROJECT}/${REGION}/procureLokalStorage?token=${encodeURIComponent(token)}`;
}

/* Testadapter til Emulator Suite. Produktion bruger fortsat korte V4-signerede
   Storage-URL'er. Adapteren er lukket uden FUNCTIONS_EMULATOR og bruger et
   engangstoken, så browsertesten kan afprøve de samme arkiverede bytes uden
   en rigtig GCP-servicekonto. */
export const procureLokalStorage = onRequest({ region: REGION }, async (req, res) => {
  if (!erLokalStorageEmulator()) { res.status(404).end(); return; }
  const origin = String(req.headers.origin || "");
  res.set("Access-Control-Allow-Origin", /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : "http://127.0.0.1");
  res.set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  const token = String(req.query.token || "");
  const tokenRef = getDatabase().ref(lokalStorageTokenSti(token));
  const snap = token ? await tokenRef.once("value") : null;
  const grant = snap?.val();
  if (!grant || Number(grant.udloeberMs) < Date.now()) { res.status(403).send("Ugyldigt eller udløbet testtoken."); return; }
  const file = getStorage().bucket().file(grant.storagePath);
  if (grant.handling === "write" && req.method === "PUT") {
    const bytes = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody || "");
    if (String(req.headers["content-type"] || "").split(";")[0] !== grant.mimeType || bytes.length !== Number(grant.stoerrelse)) {
      res.status(400).send("Filtype eller størrelse svarer ikke til uploadaftalen."); return;
    }
    await file.save(bytes, { resumable: false, metadata: { contentType: grant.mimeType, cacheControl: "private,no-store" } });
    await tokenRef.remove();
    res.status(200).send("OK"); return;
  }
  if (grant.handling === "read" && req.method === "GET") {
    const [bytes] = await file.download();
    res.set("Content-Type", grant.mimeType || "application/octet-stream");
    res.set("Cache-Control", "private,no-store");
    res.status(200).send(bytes); return;
  }
  res.status(405).end();
});

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

  const perms = permStrengFraClaims(auth.token);
  if (!perms.includes(`|${PERM.brugereSkriv}|`)) {
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
 * Det komplette v2-claim for en rolle HOS DEN HER TENANT.
 *
 * ⚠ ALLE STEDER DER MINTER, SKAL BRUGE DEN HER. `opretbruger` og
 * `skiftrolle` mintede fra konstanten; gør de det stadig, ville en kunde der
 * har redigeret sin disponentrolle, få standarden tilbage næste gang han
 * oprettede en disponent — og forskellen ville først vise sig som en adgang
 * der manglede uden grund.
 */
async function claimForRolle(tenantId, rolle, eksisterende = {}) {
  return byggRolleClaims({
    tenant: tenantId,
    rolle,
    perms: permsForTenant(rolle, await hentRoller(tenantId)),
    eksisterende,
  });
}

const REVOCATION_NODE = "authRevocations";

function tokensValidAfterSekunder(bruger) {
  const ms = Date.parse(bruger?.tokensValidAfterTime || "");
  if (!Number.isFinite(ms)) {
    const fejl = new Error("Firebase Auth returnerede intet gyldigt tokensValidAfterTime.");
    fejl.code = "claims/invalid-revocation-time";
    throw fejl;
  }
  return ms / 1000;
}

/** Firebases dokumenterede RTDB-model: revoke, hent det serverautoritative
 * tidspunkt og gem det i en node som klienter aldrig kan skrive. */
async function tilbagekaldOgGemRevocation(auth, maalUid) {
  try {
    await auth.revokeRefreshTokens(maalUid);
  } catch (aarsag) {
    const fejl = new Error("Refresh tokens kunne ikke tilbagekaldes.");
    fejl.code = "claims/revocation-failed";
    fejl.cause = aarsag;
    throw fejl;
  }
  let bruger;
  try {
    bruger = await auth.getUser(maalUid);
  } catch (aarsag) {
    const fejl = new Error("Det serverautoritative revocation-tidspunkt kunne ikke hentes.");
    fejl.code = aarsag?.code === "auth/user-not-found"
      ? "claims/auth-user-not-found"
      : "claims/revocation-time-read-failed";
    fejl.cause = aarsag;
    throw fejl;
  }
  const revokeTime = tokensValidAfterSekunder(bruger);
  try {
    await getDatabase().ref(`${REVOCATION_NODE}/${maalUid}/revokeTime`).set(revokeTime);
  } catch (aarsag) {
    const fejl = new Error("Revocation blev udført, men RTDB-metadata kunne ikke gemmes.");
    fejl.code = "claims/revocation-metadata-write-failed";
    fejl.cause = aarsag;
    throw fejl;
  }
  return revokeTime;
}

/* Rules closes access before claims are mutated. If claim-write fails, the
   old token remains denied until the account is handled manually. */
async function saetClaimsEfterRevocation(auth, maalUid, claims) {
  await tilbagekaldOgGemRevocation(auth, maalUid);
  try {
    await auth.setCustomUserClaims(maalUid, claims);
  } catch (aarsag) {
    const fejl = new Error("Claims kunne ikke gemmes efter revocation.");
    fejl.code = "claims/claim-write-failed";
    fejl.cause = aarsag;
    throw fejl;
  }
}

const SIKRE_CLAIM_FEJLKODER = new Set([
  "claims/invalid-existing-claims", "claims/reserved-extra-claim",
  "claims/unknown-extra-claim", "claims/invalid-extra-claim",
  "claims/invalid-tenant", "claims/invalid-role", "claims/invalid-permissions",
  "claims/too-large", "claims/invalid-revocation-time",
  "claims/revocation-failed", "claims/revocation-time-read-failed",
  "claims/revocation-metadata-write-failed", "claims/claim-write-failed",
  "claims/auth-user-not-found",
]);

function sikkerClaimFejlkode(fejl) {
  const kode = typeof fejl?.code === "string" ? fejl.code : "";
  if (SIKRE_CLAIM_FEJLKODER.has(kode)) return kode;
  if (kode === "auth/user-not-found") return "claims/auth-user-not-found";
  if (kode === "permission-denied") return "claims/tenant-mismatch";
  return "claims/internal";
}

/* Ingen uid, mail, claimsværdier eller rå Firebase-beskeder i loggen. Den
   tekniske stack bevares uden første linje (som kan indeholde inputdata), og
   både den stabile og den underliggende maskinkode logges. */
function logClaimFejl(fejl) {
  console.error("claimsfornyv2: konto fejlede", {
    sikkerKode: sikkerClaimFejlkode(fejl),
    kildeKode: typeof fejl?.code === "string" ? fejl.code : null,
    navn: typeof fejl?.name === "string" ? fejl.name : "Error",
    stackFrames: typeof fejl?.stack === "string"
      ? fejl.stack.split("\n").slice(1).join("\n")
      : null,
    aarsagKode: typeof fejl?.cause?.code === "string" ? fejl.cause.code : null,
  });
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

  /* Fra tenantens egen rolledefinition, kompaktet og stoerrelsestjekket af
     den faelles builder. Hverken tenant, rolle eller brugerpermissions kommer
     fra klienten. */
  await auth.setCustomUserClaims(bruger.uid, await claimForRolle(tenantId, rolle));

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
  const nyeClaims = await claimForRolle(tenantId, rolle, bruger.customClaims);
  await saetClaimsEfterRevocation(
    auth,
    maalUid,
    nyeClaims
  );
  /* ⚠ UDEN DEN HER ER NEDGRADERINGEN EN PÆN KNAP. Brugeren beholder sine
     gamle claims indtil tokenet udløber af sig selv — man ville tro man
     havde fjernet en adgang, som stadig virkede. Det er den værste
     fejltilstand, fordi den ser ud som om den lykkedes. */
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

async function sikrOrdrePdf({ rod, tenantId, ordreId, ordre, leverandoer, uid }) {
  const revision = ordreRevision(ordre);
  const godkendtRevision = Number(ordre.godkendtRevision || ordre.approvedRevision || revision);
  if (godkendtRevision !== revision || !["godkendt", "sendt", "modtaget"].includes(ordre.status)) {
    throw new HttpsError("failed-precondition", "Ordre-PDF kan kun dannes af den aktuelle godkendte revision.");
  }
  const storagePath = ordrePdfStoragePath(tenantId, ordreId, revision);
  const file = getStorage().bucket().file(storagePath);
  const archiveRef = rod.child(`indkoebsordrer/${ordreId}/pdfArkiv/${revision}`);
  const [exists, archiveSnap] = await Promise.all([file.exists(), archiveRef.once("value")]);
  if (exists[0]) {
    /* Et arkiveret dokument er en hændelse, ikke en cache. En senere
       skabelonversion eller ændring i stamdata må derfor aldrig overskrive
       de bytes, som blev forhåndsvist/arkiveret for denne revision. */
    const [archived] = await file.download();
    const sha256 = createHash("sha256").update(archived).digest("hex");
    const known = archiveSnap.val() || {};
    if (known.sha256 && known.sha256 !== sha256) {
      throw new HttpsError("data-loss", "Den arkiverede ordre-PDF består ikke sin gemte SHA-256-kontrol.");
    }
    const metadata = {
      revision, storagePath, sha256, stoerrelse: archived.length,
      oprettetMs: known.oprettetMs || Date.now(), oprettetAf: known.oprettetAf || uid,
      skabelonVersion: Number(known.skabelonVersion || 1),
    };
    if (!archiveSnap.exists()) await archiveRef.set(metadata);
    return { ...metadata, bytes: archived, file };
  }

  const virksomhed = (await rod.child("virksomhed").once("value")).val() || {};
  const bestillerUid = ordre.oprettetAf || ordre.bestillerId;
  const [bestillerSnap, leveringsstedSnap] = await Promise.all([
    bestillerUid ? rod.child(`brugere/${bestillerUid}`).once("value") : Promise.resolve(null),
    ordre.leveringsstedId ? rod.child(`procureOpsaetning/leveringssteder/${ordre.leveringsstedId}`).once("value") : Promise.resolve(null),
  ]);
  const bestiller = bestillerSnap?.val?.() || {};
  const leveringssted = leveringsstedSnap?.val?.() || {};
  const pdfOrdre = {
    ...ordre,
    bestillerNavn: ordre.bestillerNavn || ordre.kontaktNavn || bestiller.navn || bestiller.name,
    bestillerEmail: ordre.bestillerEmail || ordre.kontaktEmail || bestiller.email,
    leveringssted: ordre.leveringssted || leveringssted.label || leveringssted.navn,
    leveringsadresse: ordre.leveringsadresse || leveringssted.adresse || leveringssted.address,
    leveringspostnr: ordre.leveringspostnr || leveringssted.postnr || leveringssted.postalCode,
    leveringsby: ordre.leveringsby || leveringssted.by || leveringssted.city,
  };
  const grundlag = validerOrdrePdfGrundlag(pdfOrdre, leverandoer, virksomhed);
  if (!grundlag.ok) {
    throw new HttpsError("failed-precondition",
      `Ordre-PDF'en kan ikke dannes. Udfyld ${grundlag.missing.join(", ")} før afsendelse.`);
  }
  const bytes = Buffer.from(createOrderPdfBytes(pdfOrdre, leverandoer, virksomhed));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await file.save(bytes, { resumable: false, metadata: { contentType: "application/pdf", cacheControl: "private,no-store" } });
  const nu = Date.now();
  const metadata = { revision, storagePath, sha256, stoerrelse: bytes.length, oprettetMs: nu, oprettetAf: uid, skabelonVersion: ORDRE_PDF_SKABELON_VERSION };
  await archiveRef.set(metadata);
  return { ...metadata, bytes, file };
}

export const ordrePdfHent = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.laes", modul: "indkoeb" });
  const ordreId = kortStreng(req.data?.ordreId, 60);
  if (!ordreId) throw new HttpsError("invalid-argument", "ordreId mangler.");
  const snap = await rod.child(`indkoebsordrer/${ordreId}`).once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Bestillingen findes ikke.");
  const ordre = { ...snap.val(), id: ordreId };
  const leverandoer = (await rod.child(`leverandoerer/${ordre.leverandoerId}`).once("value")).val();
  if (!leverandoer) throw new HttpsError("failed-precondition", "Leverandøren på ordren findes ikke.");
  const pdf = await sikrOrdrePdf({ rod, tenantId, ordreId, ordre, leverandoer, uid });
  const url = await lokalStorageUrl(req, { handling: "read", storagePath: pdf.storagePath, mimeType: "application/pdf" })
    || (await pdf.file.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 5 * 60 * 1000 }))[0];
  await logProcure(tenantId, uid, AUDIT.laes, "indkoebsordrer", ordreId, null, null, "ordre-PDF åbnet");
  return { url, sha256: pdf.sha256, revision: pdf.revision, stoerrelse: pdf.stoerrelse, udloeberMs: Date.now() + 5 * 60 * 1000 };
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
       aldrig; adgang afgøres udelukkende af tokenets versionsmærkede
       permissionstreng. Se
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

  /* Build and validate all claims before mutating the role or an account. */
  const rolleperms = permsForTenant(rolle, { ...(roller || {}), [rolle]: { perms } });
  const indeks = (await rod.child("brugere").once("value")).val() || {};
  const ramte = Object.entries(indeks)
    .filter(([, v]) => v?.rolle === rolle)
    .map(([maalUid]) => maalUid);

  const forberedte = [];
  let fornyet = 0;
  const fejlede = [];
  const fejldetaljer = [];
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
      const claims = byggRolleClaims({
        tenant: tenantId, rolle, perms: rolleperms, eksisterende: bruger.customClaims,
      });
      forberedte.push({ maalUid, claims });
    } catch (e) {
      /* ⚠ EN KONTO KAN VÆRE SLETTET UDEN OM SYSTEMET, og indekset overlever
         den. Det må ikke vælte de øvrige — men det skal RAPPORTERES, ikke
         sluges: en bruger hvis claims ikke blev fornyet, går rundt med den
         gamle adgang. */
      fejlede.push(maalUid);
      fejldetaljer.push({ uid: maalUid, kode: sikkerClaimFejlkode(e) });
    }
  }

  if (fejlede.length) {
    await log(tenantId, uid, "tilstandsskift", rolle,
      `roller ${rolle}: ikke anvendt, ${fejlede.length} valideringsfejl`);
    return { ok: false, anvendt: false, ramte: ramte.length, fornyet, fejlede, fejldetaljer };
  }

  /* Revoke every affected token before changing the authoritative role. */
  for (const post of forberedte) {
    try {
      await tilbagekaldOgGemRevocation(auth, post.maalUid);
    } catch (e) {
      fejlede.push(post.maalUid);
      fejldetaljer.push({ uid: post.maalUid, kode: sikkerClaimFejlkode(e) });
    }
  }
  if (fejlede.length) {
    await log(tenantId, uid, "tilstandsskift", rolle,
      `roller ${rolle}: ikke anvendt, ${fejlede.length} revocation-fejl`);
    return { ok: false, anvendt: false, ramte: ramte.length, fornyet, fejlede, fejldetaljer };
  }

  await rod.child(`roller/${rolle}`).set({
    perms,
    aendretAf: uid,
    aendretMs: Date.now(),
  });

  for (const post of forberedte) {
    try {
      await auth.setCustomUserClaims(post.maalUid, post.claims);
      fornyet += 1;
    } catch (aarsag) {
      const e = new Error("Claims kunne ikke gemmes efter revocation.");
      e.code = "claims/claim-write-failed";
      e.cause = aarsag;
      fejlede.push(post.maalUid);
      fejldetaljer.push({ uid: post.maalUid, kode: sikkerClaimFejlkode(e) });
    }
  }

  await log(tenantId, uid, "tilstandsskift", rolle,
    `roller ${rolle}: ${perms.length} perms, ${fornyet} fornyet` +
    (fejlede.length ? `, ${fejlede.length} fejlede` : ""));

  /* ⚠ SVARET SIGER HVOR MANGE DER IKKE BLEV FORNYET. Skærmen skal kunne
     vise det: en ændring der lykkedes for otte ud af ni, er ikke en
     ændring der lykkedes. */
  return { ok: fejlede.length === 0, anvendt: true, ramte: ramte.length, fornyet, fejlede, fejldetaljer };
});

/* Kontrolleret overgang fra legacy-claims til v2 for EN tenant.

   Kaldet tager ingen tenant, rolle eller permissions fra klienten. Tenanten
   kommer fra kalderens signerede token, rollerne fra tenantens brugerindeks,
   og permissionlisterne fra tenantens serverlaeste rolledefinitioner. Kun en
   bruger med brugere.skriv kan starte migrationen.

   Hver konto remintes og faar refresh tokens tilbagekaldt. Delvise fejl
   rapporteres eksplicit, saa legacy-understoettelsen ikke kan fjernes foer
   `fejlede` er tom for hver tenant. */
export const claimsfornyv2 = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId } = kraevBrugeradmin(req);
  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const roller = await hentRoller(tenantId);
  const indeks = (await rod.child("brugere").once("value")).val() || {};
  const auth = getAuth();
  const resultat = await migrerClaimKonti({
    poster: indeks,
    gyldigRolle: (rolle) => Boolean(ROLLE_PERMS[kortStreng(rolle, 30)]),
    forny: async (maalUid, post) => {
      const rolle = kortStreng(post?.rolle, 30);
      const bruger = await hentIEgenTenant(auth, maalUid, tenantId);
      const claims = byggRolleClaims({
        tenant: tenantId,
        rolle,
        perms: permsForTenant(rolle, roller),
        eksisterende: bruger.customClaims,
      });
      await saetClaimsEfterRevocation(auth, maalUid, claims);
    },
    fejlkode: sikkerClaimFejlkode,
    vedFejl: logClaimFejl,
  });

  await log(tenantId, uid, "tilstandsskift", tenantId,
    `claims v2: ${resultat.fornyet} fornyet` +
      (resultat.fejlede.length ? `, ${resultat.fejlede.length} fejlede` : ""));
  return resultat;
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
        ind på målkontoen er stadig forkert efter v2-komprimeringen: det ville
        blande testautoritet ind i en almindelig tenantrolle. At være tenant "v1-test"
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
     (uden devTester-claimet), og blive afvist. `devTester` skrives ikke ind
     på målkontoen: v2 har plads, men plads er ikke autorisation, og flaget
     skal ikke blandes ind i en almindelig tenantrolle.
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

  if (spaerret) await tilbagekaldOgGemRevocation(auth, maalUid);
  await auth.updateUser(maalUid, { disabled: spaerret });

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
async function kraevUdbyder(req) {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  if (!erEjerClaims(auth.token)) {
    throw new HttpsError("permission-denied", "Kræver udbyderadgang.");
  }

  const revocation = await getDatabase()
    .ref(`${REVOCATION_NODE}/${auth.uid}/revokeTime`).once("value");
  if (revocation.exists()
      && !erTokenEfterRevocation(auth.token?.auth_time, revocation.val())) {
    throw new HttpsError(
      "permission-denied",
      "Ejeradgangen er tilbagekaldt. Log ind igen med en gyldig ejeridentitet.",
    );
  }
  return auth.uid;
}

/** Platformaudit for data, der ikke tilhører en kundetenant. */
async function skrivEjerAudit({
  uid, handling, objekt, objektId = null, korrelationsId = null, aendrede = null,
}) {
  const ms = Date.now();
  const nu = new Date(ms);
  const aar = String(nu.getUTCFullYear());
  const maaned = String(nu.getUTCMonth() + 1).padStart(2, "0");
  const ref = getDatabase().ref(`udbyder/audit/${aar}/${maaned}`).push();
  await ref.set({
    ms,
    uid,
    handling: kortStreng(handling, 50),
    objekt: kortStreng(objekt, 40),
    objektId: kortStreng(objektId, 120),
    korrelationsId: kortStreng(korrelationsId, 60) || ref.key,
    aendrede: Array.isArray(aendrede)
      ? aendrede.filter((felt) => typeof felt === "string").slice(0, 30)
      : null,
  });
  return ref.key;
}

async function kraevRenEjerUid(uid) {
  const id = kortStreng(uid, 128);
  if (!id) throw new HttpsError("invalid-argument", "Ansvarlig ejer mangler.");
  let bruger;
  try {
    bruger = await getAuth().getUser(id);
  } catch (fejl) {
    if (fejl?.code === "auth/user-not-found") {
      throw new HttpsError("invalid-argument", "Den ansvarlige ejer findes ikke.");
    }
    throw fejl;
  }
  if (!erEjerClaims(bruger.customClaims || {}) || bruger.customClaims?.tenant) {
    throw new HttpsError(
      "failed-precondition",
      "Ansvarlig skal være en aktiv, tenantløs ejeridentitet.",
    );
  }
  return id;
}

function kraevForventetRevision(vaerdi) {
  const revision = Number(vaerdi ?? 0);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new HttpsError("invalid-argument", "forventetRevision skal være et positivt heltal eller nul.");
  }
  return revision;
}

/* Admin SDK kalder ofte en RTDB-transaction én gang med tom lokal cache.
   Alle anvendelser nedenfor har først læst det eksisterende objekt, og ingen
   af objekttyperne har et slette-endpoint. Første callback må derfor bruge
   dette verificerede snapshot; efterfølgende callbacks bruger altid serverens
   værdi, så samtidige revisioner stadig afgøres af Firebase-CAS. */
function verificeretTransaktionsstart(verificeret) {
  let foerste = true;
  return (aktuel) => {
    const vaerdi = foerste && aktuel == null ? verificeret : aktuel;
    foerste = false;
    return vaerdi;
  };
}

function kastValideringsfejl(resultat) {
  if (!harValideringsfejl(resultat)) return resultat.post;
  throw new HttpsError("invalid-argument", Object.values(resultat.fejl).join(" "));
}

function kraevCrmId(vaerdi, navn) {
  const id = kortStreng(vaerdi, 160);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new HttpsError("invalid-argument", `${navn} har ugyldigt format.`);
  }
  return id;
}

/* Returnerer de tenantløse ejerprofiler, som må vælges som ansvarlig. Listen
   kommer fra Firebase Auth og er derfor ikke en ny adgangskilde. */
export const ejerprofilerhent = onCall({ region: REGION }, async (req) => {
  await kraevUdbyder(req);
  const liste = await getAuth().listUsers(1000);
  const profiler = liste.users
    .filter((bruger) => erEjerClaims(bruger.customClaims || {}) && !bruger.customClaims?.tenant)
    .map((bruger) => ({
      uid: bruger.uid,
      navn: bruger.displayName || bruger.email || "Ejer",
      email: bruger.email || null,
    }))
    .sort((a, b) => a.navn.localeCompare(b.navn, "da"));
  return { ok: true, profiler };
});

export const crmvirksomhedgem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const post = kastValideringsfejl(validerCrmVirksomhed(d));
  await kraevRenEjerUid(post.ansvarligUid);

  const db = getDatabase();
  const samling = db.ref("udbyder/crm/virksomheder");
  const erNy = !d.id;
  const id = erNy ? samling.push().key : kraevCrmId(d.id, "Virksomheds-id");
  const forventetRevision = kraevForventetRevision(d.forventetRevision);
  const nu = Date.now();
  const tidslinjeId = samling.child(id).child("tidslinje").push().key;

  if (erNy && post.cvr) {
    const alle = (await samling.once("value")).val() || {};
    const dublet = Object.entries(alle).find(([, virksomhed]) =>
      virksomhed?.stamdata?.cvr === post.cvr);
    if (dublet) {
      throw new HttpsError(
        "already-exists",
        `En CRM-virksomhed med CVR ${post.cvr} findes allerede (${dublet[0]}).`,
      );
    }
  }

  let konflikt = false;
  const resultat = await samling.child(id).transaction((aktuel) => {
    const eksisterende = aktuel?.stamdata || null;
    const revision = eksisterende?.revision || 0;
    if ((erNy && aktuel) || (!erNy && !eksisterende) || revision !== forventetRevision) {
      konflikt = true;
      return;
    }
    return {
      ...(aktuel || {}),
      stamdata: {
        ...post,
        oprettetMs: eksisterende?.oprettetMs || nu,
        oprettetAf: eksisterende?.oprettetAf || ejerUid,
        opdateretMs: nu,
        opdateretAf: ejerUid,
        revision: revision + 1,
      },
      tidslinje: {
        ...(aktuel?.tidslinje || {}),
        [tidslinjeId]: {
          ms: nu, uid: ejerUid,
          art: erNy ? "virksomhed.oprettet" : "virksomhed.opdateret",
          objektId: id,
        },
      },
    };
  });
  if (!resultat.committed || konflikt) {
    throw new HttpsError("aborted", "Virksomheden er ændret af en anden. Genindlæs og prøv igen.");
  }
  const revision = resultat.snapshot.val()?.stamdata?.revision;
  await skrivEjerAudit({
    uid: ejerUid,
    handling: erNy ? "crm.virksomhed.opret" : "crm.virksomhed.opdater",
    objekt: "crmVirksomhed", objektId: id,
  });
  return { ok: true, id, revision };
});

export const crmmulighedgem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const virksomhedId = kraevCrmId(d.virksomhedId, "Virksomheds-id");
  const post = kastValideringsfejl(validerCrmMulighed(d, virksomhedId));
  await kraevRenEjerUid(post.ansvarligUid);

  const db = getDatabase();
  const virksomhedRef = db.ref(`udbyder/crm/virksomheder/${virksomhedId}`);
  /* En parent-transaction kan på en kold Admin SDK-instans først blive kaldt
     med tom lokal cache. Læs derfor det konkrete objekt og afvis manglende
     virksomhed eksplicit, før transaktionen bruger stamdata som præmis. */
  const virksomhedFoer = (await virksomhedRef.once("value")).val();
  if (!virksomhedFoer?.stamdata) {
    throw new HttpsError("not-found", "CRM-virksomheden findes ikke.");
  }
  const erNy = !d.id;
  const id = erNy
    ? virksomhedRef.child("muligheder").push().key
    : kraevCrmId(d.id, "Muligheds-id");
  const forventetRevision = kraevForventetRevision(d.forventetRevision);
  const nu = Date.now();
  const tidslinjeId = virksomhedRef.child("tidslinje").push().key;
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(virksomhedFoer);
  const resultat = await virksomhedRef.transaction((aktuelVirksomhed) => {
    const virksomhed = transaktionsstart(aktuelVirksomhed);
    if (!virksomhed?.stamdata) { konflikt = true; return; }
    const eksisterende = virksomhed.muligheder?.[id] || null;
    const revision = eksisterende?.revision || 0;
    if ((erNy && eksisterende) || (!erNy && !eksisterende) || revision !== forventetRevision) {
      konflikt = true;
      return;
    }
    return {
      ...virksomhed,
      muligheder: {
        ...(virksomhed.muligheder || {}),
        [id]: {
          ...post,
          oprettetMs: eksisterende?.oprettetMs || nu,
          oprettetAf: eksisterende?.oprettetAf || ejerUid,
          opdateretMs: nu,
          opdateretAf: ejerUid,
          revision: revision + 1,
        },
      },
      tidslinje: {
        ...(virksomhed.tidslinje || {}),
        [tidslinjeId]: {
          ms: nu, uid: ejerUid,
          art: erNy ? "mulighed.oprettet" : "mulighed.opdateret",
          objektId: id, fase: post.fase,
        },
      },
    };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt) {
    throw new HttpsError("aborted", "Salgsmuligheden er ændret af en anden. Genindlæs og prøv igen.");
  }
  const revision = resultat.snapshot.val()?.muligheder?.[id]?.revision;
  await skrivEjerAudit({
    uid: ejerUid,
    handling: erNy ? "crm.mulighed.opret" : "crm.mulighed.opdater",
    objekt: "crmMulighed", objektId: id,
  });
  return { ok: true, id, virksomhedId, revision };
});

export const crmaktivitetgem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const virksomhedId = kraevCrmId(d.virksomhedId, "Virksomheds-id");
  const post = kastValideringsfejl(validerCrmAktivitet(d, virksomhedId));
  await kraevRenEjerUid(post.ansvarligUid);

  const db = getDatabase();
  const virksomhedRef = db.ref(`udbyder/crm/virksomheder/${virksomhedId}`);
  const virksomhedFoer = (await virksomhedRef.once("value")).val();
  if (!virksomhedFoer?.stamdata) {
    throw new HttpsError("not-found", "CRM-virksomheden findes ikke.");
  }
  const erNy = !d.id;
  const id = erNy
    ? virksomhedRef.child("aktiviteter").push().key
    : kraevCrmId(d.id, "Aktivitets-id");
  const forventetRevision = kraevForventetRevision(d.forventetRevision);
  const nu = Date.now();
  const tidslinjeId = virksomhedRef.child("tidslinje").push().key;
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(virksomhedFoer);
  const resultat = await virksomhedRef.transaction((aktuelVirksomhed) => {
    const virksomhed = transaktionsstart(aktuelVirksomhed);
    if (!virksomhed?.stamdata) { konflikt = true; return; }
    const eksisterende = virksomhed.aktiviteter?.[id] || null;
    const revision = eksisterende?.revision || 0;
    if ((erNy && eksisterende) || (!erNy && !eksisterende) || revision !== forventetRevision) {
      konflikt = true;
      return;
    }
    if (post.mulighedId && !virksomhed.muligheder?.[post.mulighedId]) {
      konflikt = true;
      return;
    }
    const aktivitet = {
      ...post,
      oprettetMs: eksisterende?.oprettetMs || nu,
      oprettetAf: eksisterende?.oprettetAf || ejerUid,
      opdateretMs: nu,
      opdateretAf: ejerUid,
      afsluttetMs: post.status === "afsluttet" ? (eksisterende?.afsluttetMs || nu) : null,
      revision: revision + 1,
    };
    return {
      ...virksomhed,
      aktiviteter: { ...(virksomhed.aktiviteter || {}), [id]: aktivitet },
      tidslinje: {
        ...(virksomhed.tidslinje || {}),
        [tidslinjeId]: {
          ms: nu, uid: ejerUid,
          art: post.status === "afsluttet" ? "aktivitet.afsluttet" : (erNy ? "aktivitet.oprettet" : "aktivitet.opdateret"),
          objektId: id, mulighedId: post.mulighedId,
        },
      },
    };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt) {
    throw new HttpsError("aborted", "Aktiviteten kunne ikke gemmes. Genindlæs virksomhedens data og prøv igen.");
  }
  const revision = resultat.snapshot.val()?.aktiviteter?.[id]?.revision;
  await skrivEjerAudit({
    uid: ejerUid,
    handling: post.status === "afsluttet" ? "crm.aktivitet.afslut" : (erNy ? "crm.aktivitet.opret" : "crm.aktivitet.opdater"),
    objekt: "crmAktivitet", objektId: id,
  });
  return { ok: true, id, virksomhedId, revision };
});

function kraevTilbudId(vaerdi, navn = "Tilbuds-id") {
  const id = kortStreng(vaerdi, 160);
  if (!id || !/^[A-Za-z0-9_-]{8,160}$/.test(id)) {
    throw new HttpsError("invalid-argument", `${navn} har ugyldigt format.`);
  }
  return id;
}

async function naesteTilbudsnummer(udstedelsesdato) {
  const aar = Number(String(udstedelsesdato).slice(0, 4));
  const sekvensRef = getDatabase().ref(`udbyder/sekvenser/tilbud/${aar}`);
  const resultat = await sekvensRef.transaction((aktuel) => (Number(aktuel) || 0) + 1);
  if (!resultat.committed) throw new HttpsError("aborted", "Tilbudsnummer kunne ikke reserveres.");
  return tilbudsnummer(aar, resultat.snapshot.val());
}

async function skrivTilbudstidslinje(virksomhedId, art, objektId, uid, ekstra = {}) {
  const ref = getDatabase().ref(`udbyder/crm/virksomheder/${virksomhedId}/tidslinje`).push();
  await ref.set({ ms: Date.now(), uid, art, objektId, ...ekstra });
}

/* Kladder har også serverberegnede beløb. Et tilbudsnummer tildeles kun af
   serveren, og operationId bliver dokumentets stabile id ved retries. */
export const tilbudgem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const valideret = validerTilbud(d);
  const post = kastValideringsfejl(valideret);
  const virksomhedId = kraevCrmId(post.virksomhedId, "Virksomheds-id");
  const db = getDatabase();
  const virksomhed = (await db.ref(`udbyder/crm/virksomheder/${virksomhedId}/stamdata`).once("value")).val();
  if (!virksomhed) throw new HttpsError("not-found", "CRM-virksomheden findes ikke.");
  if (post.mulighedId) {
    const mulighed = await db.ref(`udbyder/crm/virksomheder/${virksomhedId}/muligheder/${post.mulighedId}`).once("value");
    if (!mulighed.exists()) throw new HttpsError("failed-precondition", "Salgsmuligheden tilhører ikke virksomheden.");
  }

  const erNy = !d.id;
  const id = erNy ? kraevTilbudId(d.operationId, "operationId") : kraevTilbudId(d.id);
  const ref = db.ref(`udbyder/tilbud/${id}`);
  const eksisterendeFoer = (await ref.once("value")).val();
  const nummer = eksisterendeFoer?.nummer || await naesteTilbudsnummer(post.udstedelsesdato);
  const forventetRevision = kraevForventetRevision(d.forventetRevision);
  const nu = Date.now();
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(eksisterendeFoer);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    const revision = aktuel?.revision || 0;
    if ((!erNy && !aktuel) || revision !== forventetRevision) { konflikt = true; return; }
    if (aktuel && aktuel.status !== "kladde") { konflikt = true; return; }
    return {
      ...(aktuel || {}), id, nummer, status: "kladde",
      virksomhedId, mulighedId: post.mulighedId,
      kladde: { ...post, beregning: valideret.beregning },
      oprettetMs: aktuel?.oprettetMs || nu,
      oprettetAf: aktuel?.oprettetAf || ejerUid,
      opdateretMs: nu, opdateretAf: ejerUid, revision: revision + 1,
    };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt) {
    throw new HttpsError("aborted", "Tilbuddet er ændret eller låst. Genindlæs og prøv igen.");
  }
  await skrivEjerAudit({ uid: ejerUid, handling: erNy ? "tilbud.opret" : "tilbud.opdater", objekt: "tilbud", objektId: id });
  return { ok: true, id, nummer, revision: resultat.snapshot.val()?.revision };
});

/* Udstedelse fryser præcis den servervaliderede kladde som næste uforanderlige
   version. Senere redigering kræver i næste etape en eksplicit ny kladde. */
export const tilbududsted = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevTilbudId(d.id);
  const forventetRevision = kraevForventetRevision(d.forventetRevision);
  const ref = getDatabase().ref(`udbyder/tilbud/${id}`);
  const tilbudFoer = (await ref.once("value")).val();
  const nu = Date.now();
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(tilbudFoer);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    if (!aktuel?.kladde || aktuel.revision !== forventetRevision || aktuel.status !== "kladde") {
      konflikt = true; return;
    }
    const valideret = validerTilbud(aktuel.kladde);
    if (harValideringsfejl(valideret)) { konflikt = true; return; }
    const version = (aktuel.aktuelVersion || 0) + 1;
    return {
      ...aktuel, status: "klar", aktuelVersion: version,
      versioner: {
        ...(aktuel.versioner || {}),
        [version]: {
          version, nummer: aktuel.nummer, snapshot: { ...valideret.post, beregning: valideret.beregning },
          udstedtMs: nu, udstedtAf: ejerUid,
        },
      },
      kladde: null, opdateretMs: nu, opdateretAf: ejerUid,
      revision: aktuel.revision + 1,
    };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt) {
    throw new HttpsError("aborted", "Kun den aktuelle, gyldige kladde kan udstedes. Genindlæs tilbuddet.");
  }
  const tilbud = resultat.snapshot.val();
  await Promise.all([
    skrivTilbudstidslinje(tilbud.virksomhedId, "tilbud.udstedt", id, ejerUid, { nummer: tilbud.nummer, version: tilbud.aktuelVersion }),
    skrivEjerAudit({ uid: ejerUid, handling: "tilbud.udsted", objekt: "tilbud", objektId: id, korrelationsId: d.operationId }),
  ]);
  return { ok: true, id, nummer: tilbud.nummer, version: tilbud.aktuelVersion, revision: tilbud.revision };
});

/* En udstedt version redigeres aldrig. Denne handling kopierer det seneste
   snapshot til en ny kladde; næste udstedelse får næste versionsnummer. */
export const tilbudrevisionstart = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevTilbudId(d.id);
  const forventetRevision = kraevForventetRevision(d.forventetRevision);
  const ref = getDatabase().ref(`udbyder/tilbud/${id}`);
  const tilbudFoer = (await ref.once("value")).val();
  const nu = Date.now();
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(tilbudFoer);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    const version = aktuel?.aktuelVersion;
    const snapshot = aktuel?.versioner?.[version]?.snapshot;
    if (!snapshot || aktuel.revision !== forventetRevision || !["klar", "sendt", "accepteret", "afvist", "udloebet"].includes(aktuel.status)) {
      konflikt = true; return;
    }
    const { beregning: _beregning, ...kladde } = snapshot;
    return {
      ...aktuel, status: "kladde", kladde, revision: aktuel.revision + 1,
      opdateretMs: nu, opdateretAf: ejerUid,
      revisionFraVersion: version,
    };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt) {
    throw new HttpsError("aborted", "Kun et udstedt tilbud kan danne grundlag for en ny kladde.");
  }
  await skrivEjerAudit({ uid: ejerUid, handling: "tilbud.revision.start", objekt: "tilbud", objektId: id });
  return { ok: true, id, revision: resultat.snapshot.val().revision, naesteVersion: resultat.snapshot.val().aktuelVersion + 1 };
});

const ACCEPTMETODER = new Set(["email", "underskrevet_pdf", "moede", "telefon", "andet"]);

export const tilbudacceptregistrer = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevTilbudId(d.id);
  const metode = kortStreng(d.metode, 40);
  const dokumentation = kortStreng(d.dokumentation, 1000);
  const version = Number(d.version);
  if (!ACCEPTMETODER.has(metode)) throw new HttpsError("invalid-argument", "Vælg hvordan kunden accepterede.");
  if (!dokumentation) throw new HttpsError("invalid-argument", "Angiv dokumentation for kundens accept.");
  if (!Number.isSafeInteger(version) || version < 1) throw new HttpsError("invalid-argument", "Tilbudsversionen er ugyldig.");
  const forventetRevision = kraevForventetRevision(d.forventetRevision);
  const ref = getDatabase().ref(`udbyder/tilbud/${id}`);
  const tilbudFoer = (await ref.once("value")).val();
  const nu = Date.now();
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(tilbudFoer);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    const versionPost = aktuel?.versioner?.[version];
    if (!versionPost || aktuel.aktuelVersion !== version || aktuel.revision !== forventetRevision || aktuel.status !== "sendt") {
      konflikt = true; return;
    }
    const accept = { version, ms: nu, uid: ejerUid, metode, dokumentation };
    return {
      ...aktuel, status: "accepteret", accept,
      versioner: { ...aktuel.versioner, [version]: { ...versionPost, accept } },
      revision: aktuel.revision + 1, opdateretMs: nu, opdateretAf: ejerUid,
    };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt) {
    throw new HttpsError("aborted", "Kun den aktuelle, sendte version kan registreres accepteret.");
  }
  const tilbud = resultat.snapshot.val();
  await Promise.all([
    skrivTilbudstidslinje(tilbud.virksomhedId, "tilbud.accepteret", id, ejerUid, { nummer: tilbud.nummer, version, metode }),
    skrivEjerAudit({ uid: ejerUid, handling: "tilbud.accepter", objekt: "tilbud", objektId: id }),
    pauseOpfoelgningerForTilbud(id, "tilbud_accepteret"),
  ]);
  return { ok: true, id, version, accepteretMs: nu, revision: tilbud.revision };
});

/* Accepteret tilbud -> aftale og eventuel tenant. RTDB-delen lander i én
   multi-path update; den stabile aftalenøgle gør hele processen genkørbar. */
export const aftaleprovisioner = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const tilbudId = kraevTilbudId(d.tilbudId);
  const version = Number(d.version);
  const operationId = kraevTilbudId(d.operationId, "operationId");
  const virkningsdato = kortStreng(d.virkningsdato, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(virkningsdato || "") || Number.isNaN(Date.parse(`${virkningsdato}T00:00:00Z`))) {
    throw new HttpsError("invalid-argument", "Virkningsdatoen er ugyldig.");
  }
  const tenantId = d.tenantId ? kraevKundeId({ id: d.tenantId }) : null;
  const db = getDatabase();
  const tilbud = (await db.ref(`udbyder/tilbud/${tilbudId}`).once("value")).val();
  if (!tilbud || tilbud.accept?.version !== version || !tilbud.versioner?.[version]?.accept) {
    throw new HttpsError("failed-precondition", "Kun den registrerede, accepterede tilbudsversion kan blive til en aftale.");
  }
  const snapshot = tilbud.versioner?.[version]?.snapshot;
  if (!snapshot) throw new HttpsError("not-found", "Det accepterede tilbudssnapshot findes ikke.");
  const crmStamdata = (await db.ref(`udbyder/crm/virksomheder/${tilbud.virksomhedId}/stamdata`).once("value")).val() || {};
  const angivetAftaleId = d.eksisterendeAftaleId
    ? kraevTilbudId(d.eksisterendeAftaleId, "Eksisterende aftale-id") : null;
  const crmAftaleId = crmStamdata.aftaleId
    ? kraevTilbudId(crmStamdata.aftaleId, "CRM-aftale-id") : null;
  if (angivetAftaleId && crmAftaleId && angivetAftaleId !== crmAftaleId) {
    throw new HttpsError("already-exists", "CRM-virksomheden er allerede knyttet til en anden permanent aftale.");
  }
  const aftaleId = angivetAftaleId || crmAftaleId || `aftale_${tilbudId}_${version}`;
  const eksisterendeAftale = (await db.ref(`udbyder/aftaler/${aftaleId}`).once("value")).val();
  if (angivetAftaleId && !eksisterendeAftale) {
    throw new HttpsError("not-found", "Den valgte eksisterende aftale findes ikke.");
  }
  if (eksisterendeAftale?.tenantId && tenantId && eksisterendeAftale.tenantId !== tenantId) {
    throw new HttpsError("already-exists", "Aftalen er allerede knyttet til en anden permanent tenant.");
  }
  const crmTenant = crmStamdata.tenantId || null;
  if (crmTenant && tenantId && crmTenant !== tenantId) {
    throw new HttpsError("already-exists", "CRM-virksomheden er allerede knyttet til en anden permanent tenant.");
  }
  const endeligtTenantId = eksisterendeAftale?.tenantId || crmTenant || tenantId;
  const moduler = [...new Set((snapshot.beregning?.linjer || []).map((l) => l.modulId).filter((m) => m && ALLE_MODULER.includes(m)))];
  const mangler = manglendeKrav(moduler);
  if (mangler.length) throw new HttpsError("failed-precondition", `${kravtekst(mangler)}. Tilbuddet kan ikke provisioneres som det står.`);

  const provisioneringId = `provision_${tilbudId}_${version}`;
  const laasRef = db.ref(`udbyder/provisioneringer/${provisioneringId}`);
  const laasFoer = (await laasRef.once("value")).val();
  const nu = Date.now();
  const laaseStart = verificeretTransaktionsstart(laasFoer);
  const laas = await laasRef.transaction((lokal) => {
    const aktuel = laaseStart(lokal);
    if (aktuel?.status === "faerdig") return aktuel;
    return { id: provisioneringId, aftaleId, tilbudId, version, operationId, status: "arbejder", startetMs: aktuel?.startetMs || nu, senesteForsoegMs: nu, aktorUid: ejerUid };
  });
  if (!laas.committed || !laas.snapshot.exists()) throw new HttpsError("aborted", "Provisioneringen kunne ikke reserveres.");
  if (laas.snapshot.val()?.status === "faerdig") {
    return { ok: true, aftaleId, tenantId: laas.snapshot.val().tenantId || null, genbrugt: true };
  }

  const virkningMs = Date.parse(`${virkningsdato}T00:00:00Z`);
  const aftaleStatus = virkningMs > nu ? "planlagt" : "aktiv";
  const aftaleRef = db.ref(`udbyder/aftaler/${aftaleId}`);
  let aftaleKonflikt = false;
  const aftaleStart = verificeretTransaktionsstart(eksisterendeAftale);
  const aftaleResultat = await aftaleRef.transaction((lokal) => {
    const aktuel = aftaleStart(lokal);
    if (aktuel?.tenantId && endeligtTenantId && aktuel.tenantId !== endeligtTenantId) {
      aftaleKonflikt = true; return;
    }
    const genbrugtVersion = Object.entries(aktuel?.versioner || {}).find(([, v]) =>
      v?.tilbudId === tilbudId && v?.tilbudsversion === version);
    if (genbrugtVersion) return aktuel;
    const aftaleVersion = (aktuel?.aktuelVersion || 0) + 1;
    const aftaleVersionPost = {
      version: aftaleVersion, tilbudId, tilbudsnummer: tilbud.nummer,
      tilbudsversion: version, virkningsdato, status: aftaleStatus,
      prisSnapshot: snapshot, acceptSnapshot: tilbud.accept,
      oprettetMs: nu, oprettetAf: ejerUid,
    };
    return {
      ...(aktuel || {}), id: aftaleId, virksomhedId: tilbud.virksomhedId,
      tenantId: endeligtTenantId || null, status: aftaleStatus, virkningsdato,
      aktuelVersion: aftaleVersion,
      versioner: { ...(aktuel?.versioner || {}), [aftaleVersion]: aftaleVersionPost },
      oprettetMs: aktuel?.oprettetMs || nu, oprettetAf: aktuel?.oprettetAf || ejerUid,
      opdateretMs: nu, opdateretAf: ejerUid, revision: (aktuel?.revision || 0) + 1,
    };
  });
  if (!aftaleResultat.committed || !aftaleResultat.snapshot.exists() || aftaleKonflikt) {
    throw new HttpsError("aborted", "Aftalen blev ændret samtidigt. Genkør processen.");
  }
  const aftale = aftaleResultat.snapshot.val();
  const aftaleVersion = Number(Object.entries(aftale.versioner || {}).find(([, v]) =>
    v?.tilbudId === tilbudId && v?.tilbudsversion === version)?.[0]);
  if (!Number.isSafeInteger(aftaleVersion)) throw new HttpsError("internal", "Aftaleversionen kunne ikke fastlægges.");
  const virksomhed = crmStamdata;
  const opdatering = {
    [`udbyder/provisioneringer/${provisioneringId}`]: {
      ...laas.snapshot.val(), status: endeligtTenantId && virkningMs > nu ? "planlagt" : "faerdig",
      opdateretMs: nu, ...(endeligtTenantId && virkningMs > nu ? {} : { faerdigMs: nu }),
      tenantId: endeligtTenantId || null,
    },
    [`udbyder/crm/virksomheder/${tilbud.virksomhedId}/stamdata/aftaleId`]: aftaleId,
  };
  if (endeligtTenantId) {
    const tenantFindes = await kundeFindes(endeligtTenantId);
    if (!tenantFindes) {
      opdatering[`tenants/${endeligtTenantId}/_findes`] = true;
      opdatering[`tenants/${endeligtTenantId}/virksomhed`] = virksomhed.cvr
        ? { navn: virksomhed.navn || endeligtTenantId, cvr: virksomhed.cvr, oprettetMs: nu }
        : { navn: virksomhed.navn || endeligtTenantId, oprettetMs: nu };
    }
    const abonnementsversion = {
      status: aftaleStatus, startetMs: virkningMs,
      aftaleId, aftaleVersion, prislisteId: snapshot.prislisteId || null,
      bindingMaaneder: snapshot.bindingMaaneder || 0, introMaaneder: snapshot.introMaaneder || 0,
      introRabatBps: snapshot.introRabatBps || 0, rabatBps: snapshot.generelRabatBps || 0,
      interval: "maaned", aendretMs: nu, aendretAf: ejerUid,
    };
    if (tenantFindes && virkningMs > nu) {
      opdatering[`tenants/${endeligtTenantId}/abonnement/planlagtAftale`] = {
        ...abonnementsversion, moduler: modulsaet(moduler), status: "planlagt",
      };
    } else {
      const eksisterendeAbonnement = tenantFindes
        ? (await db.ref(`tenants/${endeligtTenantId}/abonnement`).once("value")).val() || {} : {};
      opdatering[`tenants/${endeligtTenantId}/moduler`] = modulsaet(moduler);
      opdatering[`tenants/${endeligtTenantId}/abonnement`] = {
        ...eksisterendeAbonnement, ...abonnementsversion, planlagtAftale: null,
      };
    }
    const kundeindeks = tenantFindes
      ? (await db.ref(`udbyder/kunder/${endeligtTenantId}`).once("value")).val() || {} : {};
    opdatering[`udbyder/kunder/${endeligtTenantId}`] = {
      ...kundeindeks, oprettetMs: kundeindeks.oprettetMs || nu, aftaleId,
    };
    const eksisterendeKundekonto = (await db.ref(`udbyder/kundekonti/${endeligtTenantId}`).once("value")).val();
    if (!eksisterendeKundekonto) {
      opdatering[`udbyder/kundekonti/${endeligtTenantId}`] = {
        tenantId: endeligtTenantId,
        status: "opsaetning_mangler",
        revision: 0,
        senesteVersion: 0,
        kilde: { art: "accepteret_tilbud", aftaleId, aftaleVersion },
        oprettetMs: nu,
        oprettetAf: ejerUid,
        opdateretMs: nu,
        opdateretAf: ejerUid,
      };
    }
    opdatering[`udbyder/crm/virksomheder/${tilbud.virksomhedId}/stamdata/tenantId`] = endeligtTenantId;
  }
  await db.ref().update(opdatering);
  await Promise.all([
    skrivTilbudstidslinje(tilbud.virksomhedId, "aftale.provisioneret", aftaleId, ejerUid, { tilbudId, version, tenantId: endeligtTenantId || null }),
    skrivEjerAudit({ uid: ejerUid, handling: "aftale.provisioner", objekt: "aftale", objektId: aftaleId, korrelationsId: operationId }),
  ]);
  return {
    ok: true, aftaleId, aftaleVersion, tenantId: endeligtTenantId || null,
    status: endeligtTenantId && virkningMs > nu ? "planlagt" : "faerdig",
    genbrugt: Boolean(eksisterendeAftale),
  };
});

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const invitationHash = (token) => createHash("sha256").update(token, "utf8").digest("hex");
const sikkerHashEns = (a, b) => {
  const aa = Buffer.from(String(a || ""), "hex");
  const bb = Buffer.from(String(b || ""), "hex");
  return aa.length === 32 && bb.length === 32 && timingSafeEqual(aa, bb);
};

async function eksisterendeInvitationKonto(email, tenantId) {
  try {
    const bruger = await getAuth().getUserByEmail(email);
    const claims = bruger.customClaims || {};
    if (claims.udbyder === true) throw new HttpsError("failed-precondition", "En ejeridentitet kan ikke inviteres som kundeadministrator.");
    if (claims.tenant && claims.tenant !== tenantId) throw new HttpsError("already-exists", "Adressen tilhører allerede en anden tenant.");
    return bruger;
  } catch (e) {
    if (e.code === "auth/user-not-found") return null;
    throw e;
  }
}

export const kundeinvitationopret = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const tenantId = kraevKundeId({ id: d.tenantId });
  if (!(await kundeFindes(tenantId))) throw new HttpsError("not-found", "Kundetenanten findes ikke.");
  const email = kortStreng(d.email, 120)?.toLowerCase();
  if (!email || !erGyldigMail(email)) throw new HttpsError("invalid-argument", "Ugyldig mailadresse.");
  const navn = kortStreng(d.navn, 80) || email;
  const rolle = kortStreng(d.rolle, 30) || "admin";
  if (rolle !== "admin") throw new HttpsError("invalid-argument", "Ejerinvitationer kan kun tildele den begrænsede kundeadministratorrolle.");
  const eksisterende = await eksisterendeInvitationKonto(email, tenantId);
  const id = `inv_${randomBytes(12).toString("hex")}`;
  const token = randomBytes(32).toString("base64url");
  const nu = Date.now();
  const post = {
    id, tenantId, email, navn, rolle, status: "afventer", generation: 1,
    tokenHash: invitationHash(token), oprettetMs: nu, oprettetAf: ejerUid,
    udloeberMs: nu + INVITATION_TTL_MS, eksisterendeKonto: Boolean(eksisterende),
    mailStatus: "ikke_tilsluttet",
  };
  await getDatabase().ref(`udbyder/invitationer/${id}`).set(post);
  await skrivEjerAudit({ uid: ejerUid, handling: "invitation.opret", objekt: "invitation", objektId: id, aendrede: ["tenantId", "email", "rolle"] });
  return { ok: true, id, token, udloeberMs: post.udloeberMs, eksisterendeKonto: post.eksisterendeKonto, mailStatus: post.mailStatus };
});

export const kundeinvitationtilbagekald = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const id = kraevTilbudId(req.data?.id, "Invitations-id");
  const ref = getDatabase().ref(`udbyder/invitationer/${id}`);
  const invitationFoer = (await ref.once("value")).val();
  let konflikt = false;
  const nu = Date.now();
  const transaktionsstart = verificeretTransaktionsstart(invitationFoer);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    if (!aktuel || aktuel.status === "accepteret") { konflikt = true; return; }
    if (aktuel.status === "tilbagekaldt") return aktuel;
    return { ...aktuel, status: "tilbagekaldt", tilbagekaldtMs: nu, tilbagekaldtAf: ejerUid, tokenHash: null };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt) throw new HttpsError("failed-precondition", "En accepteret eller ukendt invitation kan ikke tilbagekaldes.");
  await skrivEjerAudit({ uid: ejerUid, handling: "invitation.tilbagekald", objekt: "invitation", objektId: id });
  return { ok: true, id, status: "tilbagekaldt" };
});

export const kundeinvitationgenudsend = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const id = kraevTilbudId(req.data?.id, "Invitations-id");
  const token = randomBytes(32).toString("base64url");
  const nu = Date.now();
  const ref = getDatabase().ref(`udbyder/invitationer/${id}`);
  const invitationFoer = (await ref.once("value")).val();
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(invitationFoer);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    if (!aktuel || aktuel.status === "accepteret") { konflikt = true; return; }
    return {
      ...aktuel, status: "afventer", generation: (aktuel.generation || 1) + 1,
      tokenHash: invitationHash(token), udloeberMs: nu + INVITATION_TTL_MS,
      genudsendtMs: nu, genudsendtAf: ejerUid, mailStatus: "ikke_tilsluttet",
      tilbagekaldtMs: null, tilbagekaldtAf: null,
    };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt) throw new HttpsError("failed-precondition", "En accepteret eller ukendt invitation kan ikke genudsendes.");
  await skrivEjerAudit({ uid: ejerUid, handling: "invitation.genudsend", objekt: "invitation", objektId: id });
  return { ok: true, id, token, udloeberMs: resultat.snapshot.val().udloeberMs, generation: resultat.snapshot.val().generation, mailStatus: "ikke_tilsluttet" };
});

export const kundeinvitationaccept = onCall({ region: REGION }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Log ind med den inviterede e-mailadresse først.");
  if (req.auth.token?.udbyder === true) throw new HttpsError("permission-denied", "En ejeridentitet kan ikke acceptere kundeadgang.");
  if (req.auth.token?.email_verified !== true) throw new HttpsError("failed-precondition", "E-mailadressen skal være verificeret før invitationen kan accepteres.");
  const id = kraevTilbudId(req.data?.id, "Invitations-id");
  const token = typeof req.data?.token === "string" ? req.data.token : "";
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new HttpsError("invalid-argument", "Invitationstokenet er ugyldigt.");
  const ref = getDatabase().ref(`udbyder/invitationer/${id}`);
  const invitation = (await ref.once("value")).val();
  if (!invitation) throw new HttpsError("not-found", "Invitationen findes ikke.");
  if (invitation.status === "accepteret" && invitation.accepteretUid === req.auth.uid) {
    return { ok: true, id, tenantId: invitation.tenantId, alleredeAccepteret: true };
  }
  if (invitation.status === "tilbagekaldt") throw new HttpsError("failed-precondition", "Invitationen er tilbagekaldt.");
  if (Date.now() >= invitation.udloeberMs) {
    await ref.update({ status: "udloebet" });
    throw new HttpsError("deadline-exceeded", "Invitationen er udløbet. Bed Veyro om en genudsendelse.");
  }
  if (invitation.status !== "afventer" || !sikkerHashEns(invitation.tokenHash, invitationHash(token))) {
    throw new HttpsError("permission-denied", "Invitationen er ikke gyldig.");
  }
  const email = String(req.auth.token?.email || "").toLowerCase();
  if (email !== invitation.email) throw new HttpsError("permission-denied", "Log ind med den e-mailadresse invitationen er sendt til.");
  const auth = getAuth();
  const bruger = await auth.getUser(req.auth.uid);
  const claims = bruger.customClaims || {};
  if (claims.tenant && claims.tenant !== invitation.tenantId) throw new HttpsError("already-exists", "Kontoen tilhører allerede en anden tenant.");

  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(invitation);
  const reservation = await ref.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    if (aktuel?.status === "accepteret" && aktuel.accepteretUid === req.auth.uid) return aktuel;
    if (aktuel?.status === "accepterer" && aktuel.accepteretUid === req.auth.uid) return aktuel;
    if (aktuel?.status !== "afventer" || aktuel.tokenHash !== invitation.tokenHash) { konflikt = true; return; }
    return { ...aktuel, status: "accepterer", accepteretUid: req.auth.uid, acceptererMs: Date.now() };
  });
  if (!reservation.committed || !reservation.snapshot.exists() || konflikt) throw new HttpsError("aborted", "Invitationen blev ændret. Genindlæs og prøv igen.");
  await auth.setCustomUserClaims(bruger.uid, await claimForRolle(invitation.tenantId, invitation.rolle, claims));
  await auth.revokeRefreshTokens(bruger.uid);
  await skrivIndeks(invitation.tenantId, { ...bruger, displayName: bruger.displayName || invitation.navn }, invitation.rolle, false);
  const nu = Date.now();
  await ref.update({ status: "accepteret", accepteretMs: nu, accepteretUid: bruger.uid, tokenHash: null });
  await skrivEjerAudit({ uid: bruger.uid, handling: "invitation.accepter", objekt: "invitation", objektId: id });
  return { ok: true, id, tenantId: invitation.tenantId, rolle: invitation.rolle, alleredeAccepteret: false };
});

/* Mailtransporten er en adaptergrænse. Uden aktiv serverkonfiguration gemmes
   et fejlet forsøg, men tilbuddet skifter ikke til Sendt. */
export const tilbudsend = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevTilbudId(d.id);
  const db = getDatabase();
  const tilbud = (await db.ref(`udbyder/tilbud/${id}`).once("value")).val();
  if (!tilbud?.aktuelVersion || tilbud.status !== "klar") {
    throw new HttpsError("failed-precondition", "Kun et klart tilbud kan sendes.");
  }
  const forsoegId = kraevTilbudId(d.operationId, "operationId");
  const integration = (await db.ref("udbyder/integrationer/tilbudsmail").once("value")).val();
  if (integration?.status !== "aktiv" || !integration?.adapter) {
    const nu = Date.now();
    await db.ref(`udbyder/tilbud/${id}/afsendelsesforsoeg/${forsoegId}`).set({
      id: forsoegId, version: tilbud.aktuelVersion, status: "ikke_tilsluttet",
      oprettetMs: nu, oprettetAf: ejerUid,
      fejlKode: "MAIL_IKKE_TILSLUTTET",
    });
    await skrivEjerAudit({ uid: ejerUid, handling: "tilbud.send.fejl", objekt: "tilbud", objektId: id, korrelationsId: forsoegId });
    throw new HttpsError("failed-precondition", "Tilbudsmail er ikke tilsluttet. Brug PDF-download og registrér eventuel ekstern afsendelse manuelt.");
  }
  throw new HttpsError("unimplemented", `Mailadapteren '${integration.adapter}' er konfigureret, men transportimplementeringen er ikke aktiveret i denne version.`);
});

export const tilbudpdfgenerer = onCall({ region: REGION, memory: "512MiB" }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevTilbudId(d.id);
  const version = Number(d.version);
  if (!Number.isSafeInteger(version) || version < 1) throw new HttpsError("invalid-argument", "Tilbudsversionen er ugyldig.");
  const db = getDatabase();
  const ref = db.ref(`udbyder/tilbud/${id}`);
  const tilbud = (await ref.once("value")).val();
  const versionPost = tilbud?.versioner?.[version];
  if (!versionPost?.snapshot) throw new HttpsError("not-found", "Tilbudsversionen findes ikke.");
  if (versionPost.pdf?.storagePath && versionPost.pdf?.sha256) {
    return { ok: true, id, version, dokument: versionPost.pdf, genbrugt: true };
  }
  const virksomhed = (await db.ref(`udbyder/crm/virksomheder/${tilbud.virksomhedId}`).once("value")).val();
  const storagePath = `ejer/tilbud/${id}/v${version}.pdf`;
  const file = getStorage().bucket().file(storagePath);
  const [findes] = await file.exists();
  let bytes;
  if (findes) [bytes] = await file.download();
  else {
    bytes = Buffer.from(await genererTilbudsPdf({ tilbud, versionPost, virksomhed }));
    await file.save(bytes, {
      resumable: false,
      contentType: "application/pdf",
      metadata: { metadata: { tilbudId: id, version: String(version), tilbudsnummer: tilbud.nummer } },
    });
  }
  const dokument = {
    storagePath, sha256: createHash("sha256").update(bytes).digest("hex"),
    stoerrelse: bytes.length, contentType: "application/pdf",
    oprettetMs: Date.now(), oprettetAf: ejerUid,
  };
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(tilbud);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    const vp = aktuel?.versioner?.[version];
    if (!vp?.snapshot) { konflikt = true; return; }
    if (vp.pdf?.storagePath) return aktuel;
    return {
      ...aktuel,
      versioner: { ...aktuel.versioner, [version]: { ...vp, pdf: dokument } },
      revision: (aktuel.revision || 0) + 1, opdateretMs: Date.now(), opdateretAf: ejerUid,
    };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt) throw new HttpsError("aborted", "Tilbudsversionen ændrede sig under PDF-genereringen.");
  const gemt = resultat.snapshot.val().versioner[version].pdf;
  await skrivEjerAudit({ uid: ejerUid, handling: "tilbud.pdf.generer", objekt: "tilbud", objektId: id });
  return { ok: true, id, version, dokument: gemt, genbrugt: Boolean(findes) };
});

export const tilbudpdfhent = onCall({ region: REGION }, async (req) => {
  await kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevTilbudId(d.id);
  const version = Number(d.version);
  const dokument = (await getDatabase().ref(`udbyder/tilbud/${id}/versioner/${version}/pdf`).once("value")).val();
  if (!dokument?.storagePath || dokument.contentType !== "application/pdf") {
    throw new HttpsError("failed-precondition", "Generér først PDF-dokumentet for denne version.");
  }
  const [url] = await getStorage().bucket().file(dokument.storagePath).getSignedUrl({
    version: "v4", action: "read", expires: Date.now() + 10 * 60 * 1000,
    responseDisposition: `attachment; filename="${id}-v${version}.pdf"`,
  });
  return { ok: true, url, udloeberMs: Date.now() + 10 * 60 * 1000, sha256: dokument.sha256 };
});

/* Manuel afsendelse er en bevidst registrering, ikke en påstand om teknisk
   maillevering. Den virkelige mailadapter tilføjes først med korrekt setup. */
export const tilbudsendtregistrer = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevTilbudId(d.id);
  const begrundelse = kortStreng(d.begrundelse, 500);
  if (!begrundelse) throw new HttpsError("invalid-argument", "Angiv hvor og hvordan tilbuddet blev sendt.");
  const forventetRevision = kraevForventetRevision(d.forventetRevision);
  const ref = getDatabase().ref(`udbyder/tilbud/${id}`);
  const tilbudFoer = (await ref.once("value")).val();
  const nu = Date.now();
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(tilbudFoer);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    if (!aktuel?.aktuelVersion || aktuel.revision !== forventetRevision || !["klar", "sendt"].includes(aktuel.status)) {
      konflikt = true; return;
    }
    return {
      ...aktuel, status: "sendt", revision: aktuel.revision + 1,
      opdateretMs: nu, opdateretAf: ejerUid,
      afsendelser: {
        ...(aktuel.afsendelser || {}),
        [String(nu)]: { metode: "manuel", ms: nu, uid: ejerUid, begrundelse, version: aktuel.aktuelVersion },
      },
    };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt) {
    throw new HttpsError("aborted", "Tilbuddet kan ikke registreres sendt i den aktuelle version.");
  }
  const tilbud = resultat.snapshot.val();
  await Promise.all([
    skrivTilbudstidslinje(tilbud.virksomhedId, "tilbud.sendt.manuelt", id, ejerUid, { nummer: tilbud.nummer, version: tilbud.aktuelVersion }),
    skrivEjerAudit({ uid: ejerUid, handling: "tilbud.sendt.manuelt", objekt: "tilbud", objektId: id }),
  ]);
  return { ok: true, id, revision: tilbud.revision };
});

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
  const ejerUid = await kraevUdbyder(req);
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
  await db.ref(`udbyder/kundekonti/${id}`).set({
    tenantId: id,
    status: "opsaetning_mangler",
    revision: 0,
    senesteVersion: 0,
    oprettetMs: nu,
    oprettetAf: ejerUid,
    opdateretMs: nu,
    opdateretAf: ejerUid,
  });

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
  await skrivEjerAudit({
    uid: ejerUid, handling: "kunde.opret", objekt: "tenant", objektId: id,
  });

  /* ⚠ INGEN DEMO-DATA. Kunden skal se sit eget system tomt og opdage hvad
     tomme tilstande faktisk siger. Se opret-kunde.mjs. */
  return { ok: true, id, moduler: Object.keys(moduler) };
});

export const kundemoduler = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
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
  await skrivEjerAudit({
    uid: ejerUid, handling: "kunde.moduler", objekt: "tenant", objektId: id,
    aendrede: ["moduler"],
  });

  return { ok: true, moduler: Object.keys(efter), fjernet, historik: poster.length };
});

/**
 * Gemmer en samlet, versioneret kundekonto. Den accepterede tilbudsversion er
 * autoritativ, når kilden er et tilbud; en ændret klient kan derfor ikke
 * bytte mængder eller priser ud efter accept. Manuelle konti valideres mod
 * den valgte uforanderlige prisliste. Direkte klientwrites er fortsat lukket.
 */
export const kundekontogem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const id = kraevKundeId(d);
  if (!(await kundeFindes(id))) throw new HttpsError("not-found", `Kunden "${id}" findes ikke.`);
  const operationId = kraevTilbudId(d.operationId, "operationId");
  const forventetRevision = Number(d.forventetRevision ?? 0);
  if (!Number.isSafeInteger(forventetRevision) || forventetRevision < 0) {
    throw new HttpsError("invalid-argument", "Den forventede revision er ugyldig.");
  }
  const kildeArt = d.kilde?.art === "accepteret_tilbud" ? "accepteret_tilbud" : "manuel";
  const db = getDatabase();
  let input = { ...(d.opsaetning || {}), profil: d.profil || d.opsaetning?.profil || {} };
  let kilde;

  if (kildeArt === "accepteret_tilbud") {
    const aftaleId = kraevTilbudId(d.kilde?.aftaleId, "Aftale-id");
    const aftaleVersion = Number(d.kilde?.aftaleVersion);
    const aftale = (await db.ref(`udbyder/aftaler/${aftaleId}`).once("value")).val();
    const version = aftale?.versioner?.[aftaleVersion];
    if (!aftale || aftale.tenantId !== id || !version?.prisSnapshot) {
      throw new HttpsError("failed-precondition", "Den valgte accepterede aftaleversion tilhører ikke kundekontoen.");
    }
    const fraTilbud = kundekontoFraTilbudssnapshot(version.prisSnapshot);
    input = {
      ...fraTilbud,
      profil: input.profil,
      faerdig: input.faerdig === true,
      obd: {
        ...fraTilbud.obd,
        leveretAntal: input.obd?.leveretAntal ?? fraTilbud.obd.leveretAntal,
        tilknyttetAntal: input.obd?.tilknyttetAntal ?? fraTilbud.obd.tilknyttetAntal,
      },
      abonnement: {
        ...fraTilbud.abonnement,
        virkningsdato: version.virkningsdato || input.abonnement?.virkningsdato,
      },
    };
    kilde = {
      art: kildeArt, aftaleId, aftaleVersion,
      tilbudId: version.tilbudId, tilbudsversion: version.tilbudsversion,
      prislisteId: version.prisSnapshot.prislisteId || null,
    };
  } else {
    const prislisteId = kortStreng(input.abonnement?.prislisteId, 160);
    const prisliste = prislisteId ? (await db.ref(`udbyder/prisliste/${prislisteId}`).once("value")).val() : null;
    if (input.faerdig === true && !prisliste) throw new HttpsError("failed-precondition", "Det valgte rateblad findes ikke.");
    if (prisliste) {
      const katalog = new Map(ratebladFraPrisliste({ id: prislisteId, ...prisliste }).map((linje) => [linje.id, linje]));
      for (const linje of input.abonnement?.linjer || []) {
        const original = katalog.get(linje.id);
        if (!original || original.normalprisOere !== Number(linje.normalprisOere) || original.priskilde !== linje.priskilde) {
          throw new HttpsError("failed-precondition", "En manuel prislinje svarer ikke til det valgte, versionerede rateblad.");
        }
      }
    }
    kilde = { art: "manuel", prislisteId: prislisteId || null };
  }

  const normaliseret = normaliserKundekonto(input);
  if (Object.keys(normaliseret.fejl).length) {
    throw new HttpsError("invalid-argument", Object.values(normaliseret.fejl).join(" "));
  }
  const kontoRef = db.ref(`udbyder/kundekonti/${id}`);
  const kontoFoer = (await kontoRef.once("value")).val() || {};
  const allerede = kontoFoer.operationer?.[operationId];
  let gemtVersion = allerede?.version || null;
  let konflikt = false;
  const nu = Date.now();
  const virkningMs = Date.parse(`${normaliseret.post.abonnement.virkningsdato || "9999-12-31"}T00:00:00Z`);
  const kanAktiveresNu = d.aktiver === true && normaliseret.post.faerdig && virkningMs <= nu;
  const versionsstatus = !normaliseret.post.faerdig ? "opsaetning_mangler" : kanAktiveresNu ? "aktiv" : "planlagt";
  const start = verificeretTransaktionsstart(kontoFoer);
  const resultat = await kontoRef.transaction((lokal) => {
    const aktuel = start(lokal) || {};
    if (aktuel.operationer?.[operationId]) {
      gemtVersion = aktuel.operationer[operationId].version;
      return aktuel;
    }
    if (Number(aktuel.revision || 0) !== forventetRevision) { konflikt = true; return; }
    const version = Number(aktuel.senesteVersion || 0) + 1;
    gemtVersion = version;
    const versionspost = {
      version, status: versionsstatus, virkningsdato: normaliseret.post.abonnement.virkningsdato,
      kilde, ...normaliseret.post, beregning: normaliseret.beregning,
      aendringer: kundekontoAendringer(aktuel.versioner?.[aktuel.aktivVersion || aktuel.planlagtVersion] || {}, normaliseret.post),
      oprettetMs: nu, oprettetAf: ejerUid,
    };
    return {
      ...aktuel, tenantId: id, status: versionsstatus,
      revision: Number(aktuel.revision || 0) + 1, senesteVersion: version,
      ...(kanAktiveresNu ? { aktivVersion: version, planlagtVersion: null } : { planlagtVersion: version }),
      versioner: { ...(aktuel.versioner || {}), [version]: versionspost },
      operationer: { ...(aktuel.operationer || {}), [operationId]: { version, ms: nu, uid: ejerUid } },
      opdateretMs: nu, opdateretAf: ejerUid,
    };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt || !gemtVersion) {
    throw new HttpsError("aborted", "Kundekontoen blev ændret samtidigt. Genindlæs før du gemmer igen.");
  }
  const konto = resultat.snapshot.val();
  const version = konto.versioner[gemtVersion];
  const gammelVirksomhed = (await db.ref(`tenants/${id}/virksomhed`).once("value")).val() || {};
  const profil = Object.fromEntries(Object.entries(version.profil || {}).filter(([, vaerdi]) => vaerdi != null));
  const opdatering = { [`tenants/${id}/virksomhed`]: { ...gammelVirksomhed, ...profil, opdateretMs: nu, opdateretAf: ejerUid } };
  if (version.status === "aktiv") {
    const aktiveModuler = version.moduler.filter((m) => m.status === "aktiv").map((m) => m.id);
    opdatering[`tenants/${id}/moduler`] = modulsaet(aktiveModuler);
    opdatering[`tenants/${id}/abonnement/kundekontoVersion`] = gemtVersion;
    opdatering[`tenants/${id}/abonnement/prislisteId`] = version.abonnement.prislisteId;
    opdatering[`tenants/${id}/abonnement/rabatBps`] = version.abonnement.generelRabatBps;
    opdatering[`tenants/${id}/abonnement/interval`] = version.abonnement.interval;
    opdatering[`tenants/${id}/abonnement/startetMs`] = Date.parse(`${version.abonnement.virkningsdato}T00:00:00Z`);
    opdatering[`tenants/${id}/abonnement/aendretMs`] = nu;
    opdatering[`tenants/${id}/abonnement/aendretAf`] = ejerUid;
  }
  await db.ref().update(opdatering);
  await skrivEjerAudit({
    uid: ejerUid, handling: version.status === "aktiv" ? "kundekonto.aktiver" : "kundekonto.gem",
    objekt: "tenant", objektId: id, korrelationsId: operationId,
    aendrede: ["kundekonto", "profil", ...(version.status === "aktiv" ? ["moduler", "abonnement"] : [])],
  });
  return {
    ok: true, tenantId: id, version: gemtVersion, revision: konto.revision,
    status: version.status, genbrugt: Boolean(allerede), beregning: version.beregning,
  };
});

export const kundestatus = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
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
  await skrivEjerAudit({
    uid: ejerUid, handling: "kunde.status", objekt: "tenant", objektId: id,
    aendrede: ["status", ...(aarsag ? ["aarsag"] : [])],
  });

  return { ok: true, status };
});

/** Legacy-endpoint for gamle klienter. Direkte kontooprettelse med et
 * ejerindtastet løsen er lukket; første administrator kommer nu kun ind via
 * en tidsbegrænset invitation og vælger selv login gennem Firebase Auth. */
export const kundeadmin = onCall({ region: REGION }, async (req) => {
  await kraevUdbyder(req);
  throw new HttpsError(
    "failed-precondition",
    "Direkte administratoroprettelse er lukket. Opret en tidsbegrænset invitation.",
  );
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
  const ejerUid = await kraevUdbyder(req);
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
  await skrivEjerAudit({
    uid: ejerUid, handling: "maaling.koer", objekt: "maaling", objektId: dato,
  });
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
  const ejerUid = await kraevUdbyder(req);
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
    tilbudslinjer: d.tilbudslinjer || {},
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
  await skrivEjerAudit({
    uid: ejerUid, handling: "prisliste.opret", objekt: "prisliste", objektId: ref.key,
  });
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
  const ejerUid = await kraevUdbyder(req);
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
  await skrivEjerAudit({
    uid: ejerUid, handling: "kunde.abonnement", objekt: "tenant", objektId: id,
    aendrede: Object.keys(post).filter((felt) => !["aendretMs", "aendretAf"].includes(felt)),
  });

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
    type: "ordinaer",
    forretningsnoegle: `faktura:${periode}:${id}:ordinaer`,
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
    aftaleId: abonnement?.aftaleId || null,
    aftaleVersion: Number.isSafeInteger(abonnement?.aftaleVersion) ? abonnement.aftaleVersion : null,
    maengdekilder: {
      moduldage: "udbyder/maalinger",
      brugere: "udbyder/maalinger (periodens højeste målte antal)",
      koeretoejer: "udbyder/maalinger (periodens højeste målte antal)",
    },
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
  const ejerUid = await kraevUdbyder(req);
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
    const generationId = `gen_${randomBytes(12).toString("hex")}`;
    g.generationId = generationId;
    g.revision = 0;
    const opret = await db.ref(sti).transaction((aktuel) => aktuel || g);
    if (!opret.committed || opret.snapshot.val()?.generationId !== generationId) {
      sprunget.push({ id, hvorfor: "allerede opgjort" });
      continue;
    }
    await log(id, ejerUid, AUDIT.opret, periode, `fakturagrundlag ${periode}`);
    oprettet.push({ id, beloebOere: g.beloebOere });
  }

  await skrivEjerAudit({
    uid: ejerUid, handling: "fakturagrundlag.opret", objekt: "periode", objektId: periode,
  });
  return {
    ok: true, periode,
    oprettet: oprettet.length,
    sprunget,
    ialtOere: oprettet.reduce((s, x) => s + (x.beloebOere || 0), 0)
  };
});

/* ══════════════════════════════════════════════════════════════════════
   EJERFAKTURERING — frigivelse, dokumenter og vedvarende outbox

   Grundlaget ovenfor er den frosne beregning. Frigivelsen nedenfor er en
   særskilt forretningshændelse: den låser præcis version 1 til én stabil
   nøgle og må aldrig forveksles med, at en ekstern faktura er oprettet.
   ══════════════════════════════════════════════════════════════════════ */

const fakturaForretningsnoegle = (periode, tenantId) => `faktura:${periode}:${tenantId}:ordinaer`;
const fakturaJobId = (periode, tenantId) => `faktura_${periode.replace("-", "")}_${tenantId}`;

function stabilJson(vaerdi) {
  if (Array.isArray(vaerdi)) return `[${vaerdi.map(stabilJson).join(",")}]`;
  if (vaerdi && typeof vaerdi === "object") {
    return `{${Object.keys(vaerdi).sort().map((k) => `${JSON.stringify(k)}:${stabilJson(vaerdi[k])}`).join(",")}}`;
  }
  return JSON.stringify(vaerdi);
}

function kraevFakturagrundlagsnoegle(data) {
  const periode = kortStreng(data?.periode, 7);
  if (!/^\d{4}-\d{2}$/.test(periode || "") || !periodeGraenser(periode)) {
    throw new HttpsError("invalid-argument", "Perioden skal have formatet ÅÅÅÅ-MM.");
  }
  const tenantId = kraevKundeId({ id: data?.tenantId });
  return { periode, tenantId, sti: `udbyder/fakturagrundlag/${periode}/${tenantId}` };
}

function kraevKonsistentGrundlag(grundlag) {
  if (!grundlag?.laast || !Array.isArray(grundlag.linjer) || !grundlag.linjer.length) {
    throw new HttpsError("failed-precondition", "Fakturagrundlaget mangler låste linjer.");
  }
  const totaler = totalerAfLinjer(grundlag.linjer);
  if (totaler.beloebOere !== grundlag.beloebOere
      || totaler.momsOere !== grundlag.momsOere
      || totaler.ialtOere !== grundlag.ialtOere
      || grundlag.momsOere == null || grundlag.ialtOere == null) {
    throw new HttpsError("failed-precondition", "Fakturagrundlagets linjer, moms og totaler stemmer ikke.");
  }
}

async function fakturamodtager(db, tenantId) {
  const virksomhed = (await db.ref(`tenants/${tenantId}/virksomhed`).once("value")).val() || {};
  const crm = (await db.ref("udbyder/crm/virksomheder").once("value")).val() || {};
  const crmPost = Object.values(crm).find((post) => post?.stamdata?.tenantId === tenantId)?.stamdata || {};
  const modtager = {
    navn: kortStreng(virksomhed.navn || crmPost.navn, 160),
    cvr: kortStreng(virksomhed.cvr || crmPost.cvr, 20),
    email: kortStreng(crmPost.fakturaEmail, 160)?.toLowerCase() || null,
    kanal: kortStreng(crmPost.afsendelseskanal, 30) || "manuel",
  };
  if (!modtager.navn || !modtager.cvr) {
    throw new HttpsError("failed-precondition", "Kunden mangler navn eller CVR i de permanente stamdata.");
  }
  if (modtager.kanal === "email" && (!modtager.email || !erGyldigMail(modtager.email))) {
    throw new HttpsError("failed-precondition", "Kunden bruger mailkanalen, men mangler en gyldig fakturamail.");
  }
  return modtager;
}

async function sikrFakturaJob({ db, grundlag, periode, tenantId, ejerUid, nu }) {
  const id = fakturaJobId(periode, tenantId);
  const ref = db.ref(`udbyder/fakturajobs/${id}`);
  const post = {
    id, forretningsnoegle: fakturaForretningsnoegle(periode, tenantId),
    periode, tenantId, grundlagsversion: grundlag.frigivelse.version,
    grundlagSha256: grundlag.frigivelse.sha256,
    status: "afventer", dokumentStatus: "frigivet", sendStatus: "afventer",
    betalingStatus: "ikke_faktureret", forsoeg: 0,
    oprettetMs: nu, oprettetAf: ejerUid, opdateretMs: nu,
  };
  const resultat = await ref.transaction((aktuel) => aktuel || post);
  if (!resultat.committed || !resultat.snapshot.exists()) {
    throw new HttpsError("aborted", "Fakturakøen kunne ikke reserveres.");
  }
  const gemt = resultat.snapshot.val();
  if (gemt.forretningsnoegle !== post.forretningsnoegle
      || gemt.grundlagSha256 !== post.grundlagSha256) {
    throw new HttpsError("already-exists", "Forretningsnøglen er allerede knyttet til et andet fakturagrundlag.");
  }
  return { id, job: gemt, genbrugt: gemt.oprettetMs !== nu || gemt.oprettetAf !== ejerUid };
}

export const fakturagrundlagfrigiv = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const { periode, tenantId, sti } = kraevFakturagrundlagsnoegle(req.data);
  const forventetRevision = kraevForventetRevision(req.data?.forventetRevision);
  const sendEfterFrigivelse = req.data?.sendEfterFrigivelse === true;
  const db = getDatabase();
  const ref = db.ref(sti);
  const foer = (await ref.once("value")).val();
  if (!foer) throw new HttpsError("not-found", "Fakturagrundlaget findes ikke.");
  kraevKonsistentGrundlag(foer);
  const modtager = foer.frigivelse?.modtager || await fakturamodtager(db, tenantId);
  const nu = Date.now();
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(foer);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    if (aktuel?.frigivelse) return aktuel;
    if (!aktuel || (aktuel.revision || 0) !== forventetRevision) { konflikt = true; return; }
    const snapshot = {
      version: 1, type: "ordinaer",
      forretningsnoegle: fakturaForretningsnoegle(periode, tenantId),
      periode, kundeId: tenantId, periodeFra: aktuel.periodeFra, periodeTil: aktuel.periodeTil,
      prislisteId: aktuel.prislisteId || null, aftaleId: aktuel.aftaleId || null,
      aftaleVersion: aktuel.aftaleVersion || null, maengdekilder: aktuel.maengdekilder || null,
      modtager, linjer: aktuel.linjer,
      beloebOere: aktuel.beloebOere, momsOere: aktuel.momsOere, ialtOere: aktuel.ialtOere,
      frigivetMs: nu, frigivetAf: ejerUid,
    };
    const sha256 = createHash("sha256").update(stabilJson(snapshot)).digest("hex");
    return {
      ...aktuel, type: aktuel.type || "ordinaer",
      forretningsnoegle: snapshot.forretningsnoegle,
      procesStatus: "frigivet", dokumentStatus: "frigivet",
      afsendelsesStatus: sendEfterFrigivelse ? "afventer" : "ikke_koesat",
      betalingsStatus: "ikke_faktureret", frigivelse: { ...snapshot, sha256 },
      revision: (aktuel.revision || 0) + 1, opdateretMs: nu, opdateretAf: ejerUid,
    };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt) {
    throw new HttpsError("aborted", "Fakturagrundlaget blev ændret samtidigt. Genindlæs før frigivelse.");
  }
  let koe = null;
  if (sendEfterFrigivelse) {
    koe = await sikrFakturaJob({ db, grundlag: resultat.snapshot.val(), periode, tenantId, ejerUid, nu });
    await ref.update({ procesStatus: "i_koe", afsendelsesStatus: koe.job.sendStatus, opdateretMs: Date.now() });
  }
  await skrivEjerAudit({
    uid: ejerUid, handling: sendEfterFrigivelse ? "fakturagrundlag.frigiv.koe" : "fakturagrundlag.frigiv",
    objekt: "fakturagrundlag", objektId: `${periode}/${tenantId}`,
    korrelationsId: kortStreng(req.data?.operationId, 60),
  });
  return {
    ok: true, periode, tenantId, version: 1,
    sha256: resultat.snapshot.val().frigivelse.sha256,
    jobId: koe?.id || null, genbrugt: Boolean(foer.frigivelse),
  };
});

export const fakturagrundlagdokumenter = onCall({ region: REGION, memory: "512MiB" }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const { periode, tenantId, sti } = kraevFakturagrundlagsnoegle(req.data);
  const db = getDatabase();
  const ref = db.ref(sti);
  const grundlag = (await ref.once("value")).val();
  const snapshot = grundlag?.frigivelse;
  if (!snapshot?.sha256 || snapshot.version !== 1) {
    throw new HttpsError("failed-precondition", "Frigiv fakturagrundlaget før dokumenterne dannes.");
  }
  if (grundlag.dokumenter?.pdf?.storagePath && grundlag.dokumenter?.csv?.storagePath) {
    return { ok: true, dokumenter: grundlag.dokumenter, genbrugt: true };
  }
  const bucket = getStorage().bucket();
  const base = `ejer/fakturagrundlag/${periode}/${tenantId}/v1`;
  const pdfBytes = Buffer.from(await genererFakturagrundlagPdf(snapshot));
  const csvBytes = Buffer.from(fakturagrundlagCsv(snapshot), "utf8");
  const gem = async (art, bytes, contentType) => {
    const storagePath = `${base}.${art}`;
    const file = bucket.file(storagePath);
    const [findes] = await file.exists();
    if (!findes) await file.save(bytes, {
      resumable: false, contentType,
      metadata: { metadata: { periode, tenantId, version: "1", grundlagSha256: snapshot.sha256 } },
    });
    return {
      storagePath, contentType, stoerrelse: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      grundlagSha256: snapshot.sha256, oprettetMs: Date.now(), oprettetAf: ejerUid,
    };
  };
  const dokumenter = {
    pdf: await gem("pdf", pdfBytes, "application/pdf"),
    csv: await gem("csv", csvBytes, "text/csv; charset=utf-8"),
  };
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(grundlag);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    if (aktuel?.frigivelse?.sha256 !== snapshot.sha256) { konflikt = true; return; }
    if (aktuel.dokumenter?.pdf?.storagePath && aktuel.dokumenter?.csv?.storagePath) return aktuel;
    return { ...aktuel, dokumenter, revision: (aktuel.revision || 0) + 1, opdateretMs: Date.now(), opdateretAf: ejerUid };
  });
  if (!resultat.committed || !resultat.snapshot.exists() || konflikt) {
    throw new HttpsError("aborted", "Grundlagsversionen ændrede sig under dokumentgenereringen.");
  }
  await skrivEjerAudit({ uid: ejerUid, handling: "fakturagrundlag.dokumenter", objekt: "fakturagrundlag", objektId: `${periode}/${tenantId}` });
  return { ok: true, dokumenter: resultat.snapshot.val().dokumenter, genbrugt: false };
});

export const fakturagrundlagdokumenthent = onCall({ region: REGION }, async (req) => {
  await kraevUdbyder(req);
  const { periode, tenantId, sti } = kraevFakturagrundlagsnoegle(req.data);
  const art = req.data?.art;
  if (!new Set(["pdf", "csv"]).has(art)) throw new HttpsError("invalid-argument", "Dokumentarten skal være pdf eller csv.");
  const dokument = (await getDatabase().ref(`${sti}/dokumenter/${art}`).once("value")).val();
  if (!dokument?.storagePath) throw new HttpsError("not-found", "Dokumentet er ikke dannet.");
  const [url] = await getStorage().bucket().file(dokument.storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  return { ok: true, periode, tenantId, art, url, expiresInSeconds: 300, dokument };
});

function erIsoleretFakturatest() {
  return /^demo-/.test(process.env.GCLOUD_PROJECT || "")
    && ["FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_DATABASE_EMULATOR_HOST", "FIREBASE_FUNCTIONS_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]
      .every((navn) => /^(127\.0\.0\.1|localhost):\d+$/.test(process.env[navn] || ""));
}

export const fakturajobkoer = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const { periode, tenantId, sti } = kraevFakturagrundlagsnoegle(req.data);
  const id = fakturaJobId(periode, tenantId);
  const db = getDatabase();
  const jobRef = db.ref(`udbyder/fakturajobs/${id}`);
  const [jobSnap, grundlagSnap, integrationSnap] = await Promise.all([
    jobRef.once("value"), db.ref(sti).once("value"), db.ref("udbyder/integrationer/dinero").once("value"),
  ]);
  const job = jobSnap.val();
  const grundlag = grundlagSnap.val();
  const integration = integrationSnap.val();
  if (!job || !grundlag?.frigivelse || job.grundlagSha256 !== grundlag.frigivelse.sha256) {
    throw new HttpsError("failed-precondition", "Køposten og det frigivne fakturagrundlag passer ikke sammen.");
  }
  if (job.status === "sendt") return { ok: true, id, status: "sendt", eksternReference: job.eksternReference, genbrugt: true };
  if (job.status === "ukendt_udfald") {
    throw new HttpsError("failed-precondition", "Det eksterne udfald er ukendt. Afstem i Dinero før et nyt forsøg.");
  }
  if (integration?.status !== "aktiv" || !integration?.adapter) {
    await jobRef.update({ status: "ikke_tilsluttet", sendStatus: "ikke_tilsluttet", senesteFejlKode: "DINERO_IKKE_TILSLUTTET", opdateretMs: Date.now() });
    await db.ref(sti).update({ afsendelsesStatus: "ikke_tilsluttet", procesStatus: "handling_pakraevet", opdateretMs: Date.now() });
    throw new HttpsError("failed-precondition", "Dinero er ikke tilsluttet. Det frigivne grundlag er bevaret uden at oprette en faktura.");
  }
  if (integration.adapter !== "test" || !erIsoleretFakturatest()) {
    throw new HttpsError("unimplemented", `Dinero-adapteren '${integration.adapter}' er ikke aktiveret. Testadapteren må kun køre i den isolerede Emulator Suite.`);
  }
  if (!TEST_SCENARIER.includes(integration.testScenario)) {
    throw new HttpsError("failed-precondition", "Testadapteren kræver et eksplicit, tilladt emulator-scenario.");
  }

  const eksternReference = job.eksternReference
    || `test-draft-${createHash("sha256").update(job.forretningsnoegle).digest("hex").slice(0, 16)}`;
  const nu = Date.now();
  await jobRef.update({
    status: "arbejder", sendStatus: "arbejder", eksternReference,
    forsoeg: (job.forsoeg || 0) + 1, senesteForsoegMs: nu, opdateretMs: nu,
  });
  const scenario = integration.testScenario;
  const payload = byggFakturaPortPayload(grundlag.frigivelse, eksternReference);
  const adapterSvar = simulerFakturaPort(payload, scenario);
  if (adapterSvar.kind === "contract_error") {
    await jobRef.update({ status: "handling_pakraevet", sendStatus: "fejl", senesteFejlKode: "ADAPTER_KONTRAKT_FEJL", opdateretMs: Date.now() });
    throw new HttpsError("failed-precondition", adapterSvar.errors.join(" "));
  }
  if (adapterSvar.kind === "unknown") {
    await jobRef.update({ status: "ukendt_udfald", sendStatus: "ukendt_udfald", eksternStatus: "ukendt", senesteFejlKode: "TEST_TIMEOUT_EFTER_OPRET", opdateretMs: Date.now() });
    await db.ref(sti).update({ afsendelsesStatus: "ukendt_udfald", procesStatus: "handling_pakraevet", opdateretMs: Date.now() });
    throw new HttpsError("deadline-exceeded", "Testadapteren mistede svaret efter oprettelse. Automatisk genforsøg er blokeret.");
  }
  if (adapterSvar.kind === "send_error") {
    await jobRef.update({ status: "handling_pakraevet", sendStatus: "fejl", eksternStatus: "bogfoert", senesteFejlKode: "TEST_SEND_FEJL", opdateretMs: Date.now() });
    await db.ref(sti).update({ afsendelsesStatus: "fejl", procesStatus: "handling_pakraevet", opdateretMs: Date.now() });
    throw new HttpsError("unavailable", "Testfakturaen blev bogført, men afsendelsen fejlede. Den eksterne reference er bevaret.");
  }
  if (adapterSvar.kind !== "sent"
      || adapterSvar.invoice.externalReference !== eksternReference
      || adapterSvar.invoice.contactExternalKey !== grundlag.frigivelse.kundeId
      || adapterSvar.invoice.currency !== "DKK"
      || adapterSvar.invoice.subtotalCents !== grundlag.frigivelse.beloebOere
      || adapterSvar.invoice.vatCents !== grundlag.frigivelse.momsOere
      || adapterSvar.invoice.totalCents !== grundlag.frigivelse.ialtOere) {
    await jobRef.update({ status: "handling_pakraevet", sendStatus: "fejl", senesteFejlKode: "ADAPTER_SVAR_DIFFERENCE", opdateretMs: Date.now() });
    throw new HttpsError("data-loss", "Testadapterens svar afviger fra det frigivne grundlag. Behandlingen er stoppet.");
  }
  const afsluttetMs = Date.now();
  await jobRef.update({
    status: "sendt", dokumentStatus: "frigivet", sendStatus: "sendt",
    betalingStatus: "ikke_betalt", eksternStatus: "sendt",
    sendtMs: afsluttetMs, sendtAf: ejerUid, senesteFejlKode: null, opdateretMs: afsluttetMs,
  });
  await db.ref(sti).update({ afsendelsesStatus: "sendt", betalingsStatus: "ikke_betalt", procesStatus: "sendt", opdateretMs: afsluttetMs });
  await skrivEjerAudit({ uid: ejerUid, handling: "fakturajob.test.sendt", objekt: "fakturajob", objektId: id, korrelationsId: kortStreng(req.data?.operationId, 60) });
  return { ok: true, id, status: "sendt", eksternReference, genbrugt: Boolean(job.eksternReference) };
});

/* ══════════════════════════════════════════════════════════════
   EJERKREDITNOTAER — reservation, historisk snapshot og separat outbox

   Alle beløb gemmes som positive størrelser. `type: kreditnota` er det
   eksplicitte fortegn; det undgår dobbelt negation i UI og Dinero-porten.
   ══════════════════════════════════════════════════════════════ */

const kreditJobId = (kreditId) => `kreditjob_${kreditId}`;
const kreditGruppeSti = (fakturaId) => `udbyder/kreditnotaer/${fakturaId}`;

function kraevFakturaJobId(vaerdi) {
  const id = kortStreng(vaerdi, 160);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new HttpsError("invalid-argument", "Faktura-id mangler eller er ugyldigt.");
  return id;
}

function kraevKreditId(vaerdi) {
  const id = kortStreng(vaerdi, 100);
  if (!id || !/^kredit_[a-f0-9]{20}$/.test(id)) throw new HttpsError("invalid-argument", "Kredit-id mangler eller er ugyldigt.");
  return id;
}

async function hentKreditKontekst(db, fakturaId) {
  const job = (await db.ref(`udbyder/fakturajobs/${fakturaId}`).once("value")).val();
  if (!job) throw new HttpsError("not-found", "Den valgte faktura findes ikke i Veyros fakturakø.");
  if (!["sendt", "bogfoert"].includes(job.status) && !["sendt", "bogfoert"].includes(job.eksternStatus)) {
    throw new HttpsError("failed-precondition", "Fakturaen skal være bogført i Dinero før kreditering.");
  }
  if (!job.eksternReference) throw new HttpsError("failed-precondition", "Fakturaen mangler en dokumenteret Dinero-reference.");
  const sti = `udbyder/fakturagrundlag/${job.periode}/${job.tenantId}`;
  const grundlag = (await db.ref(sti).once("value")).val();
  if (!grundlag?.frigivelse?.sha256 || grundlag.frigivelse.sha256 !== job.grundlagSha256) {
    throw new HttpsError("failed-precondition", "Fakturaens frosne kilde kan ikke verificeres.");
  }
  return { job, faktura: grundlag.frigivelse, grundlagSti: sti };
}

export const kreditnotaopret = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const fakturaId = kraevFakturaJobId(req.data?.fakturaId);
  const operationId = kortStreng(req.data?.operationId, 80);
  const aarsag = kortStreng(req.data?.aarsag, 500);
  if (!operationId || !aarsag) throw new HttpsError("invalid-argument", "Operations-id og årsag er påkrævet.");
  const kreditId = `kredit_${createHash("sha256").update(`${fakturaId}:${operationId}`).digest("hex").slice(0, 20)}`;
  const valg = Array.isArray(req.data?.valg) ? req.data.valg.slice(0, 100).map((v) => ({
    kildeIndeks: Number(v?.kildeIndeks), antal: Number(v?.antal),
  })) : [];
  const db = getDatabase();
  const { job, faktura } = await hentKreditKontekst(db, fakturaId);
  const nu = Date.now();
  const requestSha256 = createHash("sha256").update(stabilJson({ fakturaId, aarsag, valg, fakturaSha256: faktura.sha256 })).digest("hex");
  let snapshot;
  try { snapshot = byggKreditsnapshot({ faktura, valg, aarsag, kreditId, oprettetMs: nu, oprettetAf: ejerUid }); }
  catch (error) { throw new HttpsError("invalid-argument", error.message); }
  const ref = db.ref(kreditGruppeSti(fakturaId));
  const foer = (await ref.once("value")).val() || {};
  let domFejl = null;
  const transaktionsstart = verificeretTransaktionsstart(foer);
  const resultat = await ref.transaction((lokal) => {
    const gruppe = transaktionsstart(lokal) || {};
    const eksisterende = gruppe.poster?.[kreditId];
    if (eksisterende) {
      if (eksisterende.requestSha256 !== requestSha256) { domFejl = "Operations-id'et er allerede brugt med et andet kreditindhold."; return; }
      return gruppe;
    }
    const kontrol = validerKreditModResterende(faktura, gruppe.poster, snapshot);
    if (!kontrol.ok) { domFejl = kontrol.fejl.join(" "); return; }
    return {
      ...gruppe,
      fakturaId, tenantId: job.tenantId, kundeId: faktura.kundeId,
      originalEksternReference: job.eksternReference,
      originalIaltOere: faktura.ialtOere,
      revision: (gruppe.revision || 0) + 1, opdateretMs: nu,
      poster: {
        ...(gruppe.poster || {}),
        [kreditId]: {
          id: kreditId, fakturaId, type: "kreditnota", status: "kladde", revision: 0,
          snapshot, requestSha256, beloebOere: snapshot.beloebOere, momsOere: snapshot.momsOere, ialtOere: snapshot.ialtOere,
          oprettetMs: nu, oprettetAf: ejerUid, opdateretMs: nu,
        },
      },
    };
  });
  if (!resultat.committed || !resultat.snapshot.exists()) {
    throw new HttpsError("aborted", domFejl || "Kreditreservationen blev ændret samtidigt. Genindlæs og prøv igen.");
  }
  const gemt = resultat.snapshot.val().poster[kreditId];
  await skrivEjerAudit({ uid: ejerUid, handling: "kreditnota.opret", objekt: "kreditnota", objektId: kreditId, korrelationsId: operationId });
  return { ok: true, fakturaId, kreditId, status: gemt.status, genbrugt: gemt.oprettetMs !== nu };
});

async function sikrKreditJob({ db, post, gruppe, ejerUid, nu }) {
  const id = kreditJobId(post.id);
  const ref = db.ref(`udbyder/kreditjobs/${id}`);
  const job = {
    id, kreditId: post.id, fakturaId: post.fakturaId, type: "kreditnota",
    snapshotSha256: post.frigivelse.sha256, originalEksternReference: gruppe.originalEksternReference,
    status: "afventer", dokumentStatus: "frigivet", sendStatus: "afventer",
    afregningsStatus: "ikke_afstemt", forsoeg: 0,
    oprettetMs: nu, oprettetAf: ejerUid, opdateretMs: nu,
  };
  const resultat = await ref.transaction((aktuel) => aktuel || job);
  const gemt = resultat.snapshot.val();
  if (!resultat.committed || gemt.snapshotSha256 !== job.snapshotSha256) {
    throw new HttpsError("already-exists", "Kreditjobbet er allerede knyttet til et andet snapshot.");
  }
  return { id, job: gemt };
}

export const kreditnotafrigiv = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const fakturaId = kraevFakturaJobId(req.data?.fakturaId);
  const kreditId = kraevKreditId(req.data?.kreditId);
  const forventetRevision = kraevForventetRevision(req.data?.forventetRevision);
  const sendEfterFrigivelse = req.data?.sendEfterFrigivelse === true;
  const db = getDatabase();
  const { faktura } = await hentKreditKontekst(db, fakturaId);
  const ref = db.ref(kreditGruppeSti(fakturaId));
  const foer = (await ref.once("value")).val();
  const postFoer = foer?.poster?.[kreditId];
  if (!postFoer) throw new HttpsError("not-found", "Kreditnotaen findes ikke.");
  const kontrol = validerKreditModResterende(faktura, foer.poster, postFoer.snapshot, kreditId);
  if (!kontrol.ok) throw new HttpsError("failed-precondition", kontrol.fejl.join(" "));
  const nu = Date.now();
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(foer);
  const resultat = await ref.transaction((lokal) => {
    const gruppe = transaktionsstart(lokal);
    const post = gruppe?.poster?.[kreditId];
    if (post?.frigivelse) return gruppe;
    if (!post || post.status !== "kladde" || (post.revision || 0) !== forventetRevision) { konflikt = true; return; }
    const snapshot = post.snapshot;
    const sha256Vaerdi = createHash("sha256").update(stabilJson(snapshot)).digest("hex");
    return {
      ...gruppe, revision: (gruppe.revision || 0) + 1, opdateretMs: nu,
      poster: { ...gruppe.poster, [kreditId]: {
        ...post, status: sendEfterFrigivelse ? "frigivet" : "frigivet",
        frigivelse: { version: 1, sha256: sha256Vaerdi, snapshot, frigivetMs: nu, frigivetAf: ejerUid },
        revision: (post.revision || 0) + 1, opdateretMs: nu, opdateretAf: ejerUid,
      } },
    };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "Kreditnotaen blev ændret samtidigt. Genindlæs før frigivelse.");
  let koe = null;
  if (sendEfterFrigivelse) {
    koe = await sikrKreditJob({ db, post: resultat.snapshot.val().poster[kreditId], gruppe: resultat.snapshot.val(), ejerUid, nu });
    await db.ref(`${kreditGruppeSti(fakturaId)}/poster/${kreditId}`).update({ status: "frigivet", sendStatus: koe.job.sendStatus, opdateretMs: Date.now() });
  }
  await skrivEjerAudit({ uid: ejerUid, handling: sendEfterFrigivelse ? "kreditnota.frigiv.koe" : "kreditnota.frigiv", objekt: "kreditnota", objektId: kreditId, korrelationsId: kortStreng(req.data?.operationId, 60) });
  return { ok: true, fakturaId, kreditId, sha256: resultat.snapshot.val().poster[kreditId].frigivelse.sha256, jobId: koe?.id || null };
});

export const kreditnotaannuller = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const fakturaId = kraevFakturaJobId(req.data?.fakturaId);
  const kreditId = kraevKreditId(req.data?.kreditId);
  const forventetRevision = kraevForventetRevision(req.data?.forventetRevision);
  const ref = getDatabase().ref(`${kreditGruppeSti(fakturaId)}/poster/${kreditId}`);
  const foer = (await ref.once("value")).val();
  if (!foer) throw new HttpsError("not-found", "Kreditnotaen findes ikke.");
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(foer);
  const resultat = await ref.transaction((lokal) => {
    const post = transaktionsstart(lokal);
    if (post?.status === "annulleret") return post;
    if (!post || post.status !== "kladde" || (post.revision || 0) !== forventetRevision) { konflikt = true; return; }
    return { ...post, status: "annulleret", revision: (post.revision || 0) + 1, annulleretMs: Date.now(), annulleretAf: ejerUid, opdateretMs: Date.now() };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("failed-precondition", "Kun en uændret kladde kan annulleres.");
  await skrivEjerAudit({ uid: ejerUid, handling: "kreditnota.annuller", objekt: "kreditnota", objektId: kreditId });
  return { ok: true, fakturaId, kreditId, status: "annulleret" };
});

export const kreditnotadokumenter = onCall({ region: REGION, memory: "512MiB" }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const fakturaId = kraevFakturaJobId(req.data?.fakturaId);
  const kreditId = kraevKreditId(req.data?.kreditId);
  const ref = getDatabase().ref(`${kreditGruppeSti(fakturaId)}/poster/${kreditId}`);
  const post = (await ref.once("value")).val();
  if (!post?.frigivelse?.sha256) throw new HttpsError("failed-precondition", "Frigiv kreditnotaen før dokumentet dannes.");
  if (post.dokument?.storagePath) return { ok: true, dokument: post.dokument, genbrugt: true };
  const bytes = Buffer.from(await genererKreditnotaPdf(post.frigivelse.snapshot));
  const storagePath = `ejer/kreditnotaer/${fakturaId}/${kreditId}/v1.pdf`;
  await getStorage().bucket().file(storagePath).save(bytes, {
    resumable: false, contentType: "application/pdf",
    metadata: { metadata: { fakturaId, kreditId, version: "1", snapshotSha256: post.frigivelse.sha256 } },
  });
  const dokument = {
    storagePath, contentType: "application/pdf", stoerrelse: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"), snapshotSha256: post.frigivelse.sha256,
    oprettetMs: Date.now(), oprettetAf: ejerUid,
  };
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(post);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    if (aktuel?.frigivelse?.sha256 !== post.frigivelse.sha256) { konflikt = true; return; }
    if (aktuel.dokument?.storagePath) return aktuel;
    return { ...aktuel, dokument, revision: (aktuel.revision || 0) + 1, opdateretMs: Date.now(), opdateretAf: ejerUid };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "Kreditversionen ændrede sig under dokumentgenereringen.");
  await skrivEjerAudit({ uid: ejerUid, handling: "kreditnota.dokument", objekt: "kreditnota", objektId: kreditId });
  return { ok: true, dokument: resultat.snapshot.val().dokument, genbrugt: false };
});

export const kreditnotadokumenthent = onCall({ region: REGION }, async (req) => {
  await kraevUdbyder(req);
  const fakturaId = kraevFakturaJobId(req.data?.fakturaId);
  const kreditId = kraevKreditId(req.data?.kreditId);
  const dokument = (await getDatabase().ref(`${kreditGruppeSti(fakturaId)}/poster/${kreditId}/dokument`).once("value")).val();
  if (!dokument?.storagePath) throw new HttpsError("not-found", "Kreditnotadokumentet er ikke dannet.");
  const [url] = await getStorage().bucket().file(dokument.storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  return { ok: true, fakturaId, kreditId, url, expiresInSeconds: 300, dokument };
});

function dineroGuidFraNoegle(noegle) {
  const h = createHash("sha256").update(noegle).digest("hex").slice(0, 32).split("");
  h[12] = "5"; h[16] = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  const s = h.join(""); return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

async function koerKreditnotaLive({ integration, job, post, jobRef, postRef }) {
  const clientId = kortStreng(integration.clientId, 200);
  const organizationId = kortStreng(integration.organizationId, 80);
  const accountNumber = Number(integration.salesAccountNumber);
  if (!clientId || !organizationId || !Number.isInteger(accountNumber)) {
    throw new DineroFejl("Dinero mangler client-id, organisation-id eller salgskonto.", { code: "KONFIGURATION" });
  }
  const token = await hentDineroToken({ clientId, clientSecret: DINERO_CLIENT_SECRET.value(), apiKey: DINERO_API_KEY.value() });
  const klient = dineroKlient({ organizationId, accessToken: token.accessToken });
  let guid = job.eksternReference || dineroGuidFraNoegle(`veyro:${job.id}`);
  let timestamp = job.eksternTimestamp || null;
  let eksternStatus = job.eksternStatus || null;
  if (!job.eksternReference) {
    const model = dineroKreditnotaCreateModel(post.frigivelse.snapshot, {
      invoiceGuid: job.originalEksternReference, externalReference: `veyro:${job.id}`, accountNumber,
    });
    model.Guid = guid;
    const oprettet = await klient.opretKreditnota(model);
    guid = oprettet?.Guid || guid; timestamp = oprettet?.TimeStamp;
    if (!timestamp) throw new DineroFejl("Dinero returnerede ingen timestamp for kreditkladden.", { code: "SVAR_DIFFERENCE" });
    eksternStatus = "kladde";
    await jobRef.update({ eksternReference: guid, eksternTimestamp: timestamp, eksternStatus, opdateretMs: Date.now() });
  }
  if (eksternStatus !== "bogfoert") {
    const bogfoert = await klient.bogfoerKreditnota(guid, timestamp);
    timestamp = bogfoert?.TimeStamp || timestamp; eksternStatus = "bogfoert";
    await jobRef.update({ eksternReference: guid, eksternTimestamp: timestamp, eksternStatus, status: "bogfoert", opdateretMs: Date.now() });
    await postRef.update({ status: "bogfoert", eksternReference: guid, opdateretMs: Date.now() });
  }
  const email = post.frigivelse.snapshot.modtager?.email;
  if (!email) throw new DineroFejl("Kunden mangler en fakturamail; kreditnotaen er bogført, men ikke sendt.", { code: "MODTAGER_MANGLER" });
  await klient.sendKreditnota(guid, {
    ShouldAddTrustPilotEmailAsBcc: false, Timestamp: timestamp,
    Receiver: email, Subject: "Kreditnota fra Veyro Systems",
    Message: `${post.frigivelse.snapshot.aarsag}\n\n[link-to-pdf]`, AddVoucherAsPdfAttachment: true,
  });
  return { guid, timestamp };
}

export const kreditnotajobkoer = onCall({
  region: REGION, secrets: [DINERO_CLIENT_SECRET, DINERO_API_KEY],
}, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const fakturaId = kraevFakturaJobId(req.data?.fakturaId);
  const kreditId = kraevKreditId(req.data?.kreditId);
  const db = getDatabase();
  const jobRef = db.ref(`udbyder/kreditjobs/${kreditJobId(kreditId)}`);
  const postRef = db.ref(`${kreditGruppeSti(fakturaId)}/poster/${kreditId}`);
  const [jobSnap, postSnap, integrationSnap] = await Promise.all([
    jobRef.once("value"), postRef.once("value"), db.ref("udbyder/integrationer/dinero").once("value"),
  ]);
  const job = jobSnap.val(); const post = postSnap.val(); const integration = integrationSnap.val();
  if (!job || !post?.frigivelse || job.snapshotSha256 !== post.frigivelse.sha256) {
    throw new HttpsError("failed-precondition", "Kreditjob og frigivet snapshot passer ikke sammen.");
  }
  if (job.status === "sendt") return { ok: true, kreditId, status: "sendt", eksternReference: job.eksternReference, genbrugt: true };
  if (job.status === "ukendt_udfald") throw new HttpsError("failed-precondition", "Det eksterne udfald er ukendt. Afstem i Dinero før et nyt forsøg.");
  if (integration?.status !== "aktiv" || !integration?.adapter) {
    await jobRef.update({ status: "ikke_tilsluttet", sendStatus: "ikke_tilsluttet", senesteFejlKode: "DINERO_IKKE_TILSLUTTET", opdateretMs: Date.now() });
    await postRef.update({ sendStatus: "ikke_tilsluttet", opdateretMs: Date.now() });
    throw new HttpsError("failed-precondition", "Dinero er ikke tilsluttet. Kreditversionen og reservationen er bevaret.");
  }
  const nu = Date.now();
  await jobRef.update({ status: "arbejder", sendStatus: "arbejder", forsoeg: (job.forsoeg || 0) + 1, senesteForsoegMs: nu, opdateretMs: nu });
  if (integration.adapter === "test" && erIsoleretFakturatest()) {
    if (!TEST_SCENARIER.includes(integration.testScenario)) throw new HttpsError("failed-precondition", "Testadapteren kræver et eksplicit scenario.");
    const eksternReference = job.eksternReference || dineroGuidFraNoegle(`test:${job.id}`);
    const payload = byggKreditnotaPortPayload(post.frigivelse.snapshot, eksternReference, job.originalEksternReference);
    const svar = simulerKreditnotaPort(payload, integration.testScenario);
    if (svar.kind === "contract_error") throw new HttpsError("failed-precondition", svar.errors.join(" "));
    if (svar.kind === "unknown") {
      await jobRef.update({ status: "ukendt_udfald", sendStatus: "ukendt_udfald", eksternReference, eksternStatus: "ukendt", senesteFejlKode: "TEST_TIMEOUT_EFTER_OPRET", opdateretMs: Date.now() });
      await postRef.update({ status: "ukendt_udfald", sendStatus: "ukendt_udfald", opdateretMs: Date.now() });
      throw new HttpsError("deadline-exceeded", "Testadapteren mistede svaret efter oprettelse; automatisk genforsøg er blokeret.");
    }
    if (svar.kind === "send_error") {
      await jobRef.update({ status: "handling_pakraevet", sendStatus: "fejl", eksternReference, eksternStatus: "bogfoert", senesteFejlKode: "TEST_SEND_FEJL", opdateretMs: Date.now() });
      await postRef.update({ status: "bogfoert", sendStatus: "fejl", eksternReference, opdateretMs: Date.now() });
      throw new HttpsError("unavailable", "Testkreditnotaen blev bogført, men afsendelsen fejlede.");
    }
    if (svar.kind !== "sent" || svar.creditNote.totalCents !== post.frigivelse.snapshot.ialtOere) {
      throw new HttpsError("data-loss", "Testadapterens svar afviger fra kreditversionen.");
    }
    await jobRef.update({ status: "sendt", sendStatus: "sendt", eksternStatus: "sendt", eksternReference, dokumentStatus: "bogfoert", sendtMs: Date.now(), sendtAf: ejerUid, senesteFejlKode: null, opdateretMs: Date.now() });
    await postRef.update({ status: "sendt", sendStatus: "sendt", eksternReference, opdateretMs: Date.now() });
  } else if (integration.adapter === "dinero_personlig") {
    try {
      const resultat = await koerKreditnotaLive({ integration, job, post, jobRef, postRef });
      await jobRef.update({ status: "bogfoert", sendStatus: "anmodet", eksternStatus: "bogfoert", eksternReference: resultat.guid, eksternTimestamp: resultat.timestamp, sendAnmodetMs: Date.now(), sendtAf: ejerUid, senesteFejlKode: null, opdateretMs: Date.now() });
      await postRef.update({ status: "bogfoert", sendStatus: "anmodet", eksternReference: resultat.guid, opdateretMs: Date.now() });
    } catch (error) {
      const ukendt = error instanceof DineroFejl && error.unknownOutcome;
      await jobRef.update({ status: ukendt ? "ukendt_udfald" : "handling_pakraevet", sendStatus: ukendt ? "ukendt_udfald" : "fejl", senesteFejlKode: error.code || `HTTP_${error.status || "FEJL"}`, opdateretMs: Date.now() });
      if (ukendt) await postRef.update({ status: "ukendt_udfald", sendStatus: "ukendt_udfald", opdateretMs: Date.now() });
      throw new HttpsError(ukendt ? "deadline-exceeded" : "unavailable", error.message);
    }
  } else {
    throw new HttpsError("unimplemented", `Dinero-adapteren '${integration.adapter}' er ikke understøttet.`);
  }
  await skrivEjerAudit({ uid: ejerUid, handling: "kreditnota.afsend", objekt: "kreditnota", objektId: kreditId, korrelationsId: kortStreng(req.data?.operationId, 60) });
  const afsluttetJob = (await jobRef.once("value")).val();
  return { ok: true, fakturaId, kreditId, status: afsluttetJob.status, sendStatus: afsluttetJob.sendStatus, eksternReference: afsluttetJob.eksternReference };
});

const dineroOere = (vaerdi) => Number.isFinite(Number(vaerdi)) ? Math.round(Number(vaerdi) * 100) : null;
const dineroGuid = (post) => kortStreng(post?.Guid || post?.guid, 80);

function dineroReturpost(art, oversigt, detalje, betalinger, mailouts, synkroniseretMs) {
  const guid = dineroGuid(detalje) || dineroGuid(oversigt);
  const betaling = betalinger && typeof betalinger === "object" ? {
    betaltOere: dineroOere(betalinger.PaidAmount), restOere: dineroOere(betalinger.RemainingAmount),
    totalInklRykkerOere: dineroOere(betalinger.InvoiceTotalIncludingReminderExpenses),
    poster: Array.isArray(betalinger.Payments) ? betalinger.Payments.slice(0, 100) : [],
  } : null;
  const udsendelser = Array.isArray(mailouts) ? mailouts : (mailouts?.Collection || []);
  const senesteMail = udsendelser.length ? udsendelser[udsendelser.length - 1] : null;
  return {
    guid, art, oprindelse: "dinero", nummer: detalje?.Number ?? oversigt?.Number ?? null,
    eksternReference: detalje?.ExternalReference || oversigt?.ExternalReference || null,
    status: detalje?.Status || oversigt?.Status || "ukendt",
    betalingsStatus: detalje?.PaymentStatus || oversigt?.PaymentStatus || "ukendt",
    mailStatus: senesteMail?.Status || detalje?.MailOutStatus || oversigt?.MailOutStatus || "ukendt",
    timestamp: detalje?.TimeStamp || oversigt?.TimeStamp || null,
    kontaktGuid: detalje?.ContactGuid || oversigt?.ContactGuid || null,
    valuta: detalje?.Currency || oversigt?.Currency || null,
    dato: detalje?.Date || oversigt?.Date || null,
    forfaldsdato: detalje?.PaymentDate || oversigt?.PaymentDate || null,
    totalEksklMomsOere: dineroOere(detalje?.TotalExclVat ?? oversigt?.TotalExclVat),
    totalInklMomsOere: dineroOere(detalje?.TotalInclVat ?? oversigt?.TotalInclVat),
    betaling, mailouts: udsendelser.slice(0, 100), synkroniseretMs,
  };
}

async function synkroniserDineroArt({ db, klient, art, status, startMs, maks }) {
  const checkpointSti = `udbyder/dinero/synk/checkpoints/${art}`;
  const checkpoint = (await db.ref(checkpointSti).once("value")).val() || {};
  const changesSince = checkpoint.changesSince || null;
  const page = Number.isInteger(checkpoint.page) ? checkpoint.page : 0;
  const svar = await klient.liste(art, { changesSince, page, pageSize: maks });
  const collection = Array.isArray(svar) ? svar : (svar?.Collection || []);
  const updates = {};
  for (const oversigt of collection) {
    const guid = dineroGuid(oversigt);
    if (!guid) continue;
    const dokumentArt = art === "kreditnotaer" ? "kreditnota" : "faktura";
    const [detalje, betalinger, mailouts] = await Promise.all([
      dokumentArt === "kreditnota" ? klient.kreditnota(guid) : klient.faktura(guid),
      klient.betalinger(dokumentArt, guid), klient.mailouts(dokumentArt, guid),
    ]);
    updates[`udbyder/dinero/dokumenter/${dokumentArt}/${guid}`] = dineroReturpost(dokumentArt, oversigt, detalje, betalinger, mailouts, Date.now());
  }
  const faerdig = collection.length < maks;
  updates[checkpointSti] = faerdig
    ? { changesSince: new Date(startMs).toISOString(), page: 0, senesteSikreGemMs: Date.now() }
    : { changesSince, page: page + 1, senesteSikreGemMs: Date.now() };
  updates[`udbyder/dinero/synk/status/${art}`] = {
    ...status, senesteForsoegMs: startMs, senesteSuccesMs: Date.now(),
    status: faerdig ? "ajour" : "flere_sider", antal: collection.length, page,
  };
  await db.ref().update(updates);
  return { antal: collection.length, faerdig, page };
}

async function synkroniserDineroPosteringer({ db, klient, integration, startMs }) {
  const aar = new Date(startMs).getUTCFullYear();
  const fra = /^\d{4}-\d{2}-\d{2}$/.test(integration.regnskabsFraDato || "") ? integration.regnskabsFraDato : `${aar}-01-01`;
  const til = new Date(startMs).toISOString().slice(0, 10);
  const svar = await klient.poster({ fromDate: fra, toDate: til, includePrimo: false });
  const collection = Array.isArray(svar) ? svar : (svar?.Collection || []);
  const poster = {};
  for (const [index, post] of collection.slice(0, 5000).entries()) {
    const noegle = post.Guid || post.Id || `${post.Date || ""}:${post.VoucherNumber || ""}:${post.AccountNumber || ""}:${index}`;
    const id = createHash("sha256").update(String(noegle)).digest("hex").slice(0, 32);
    poster[id] = {
      id, guid: post.Guid || null, dato: post.Date || null,
      kontonummer: post.AccountNumber ?? null, kontonavn: post.AccountName || null,
      bilagsnummer: post.VoucherNumber ?? null, bilagsart: post.VoucherType || null,
      tekst: post.Text || post.Description || null, kontaktGuid: post.ContactGuid || null,
      beloebOere: dineroOere(post.Amount), beloebInklMomsOere: dineroOere(post.AmountInclVat),
      momsOere: dineroOere(post.VatAmount), synkroniseretMs: startMs, oprindelse: "dinero",
    };
  }
  await db.ref().update({
    "udbyder/dinero/posteringer": poster,
    "udbyder/dinero/synk/status/posteringer": {
      status: "ajour", fra, til, antal: collection.length,
      afkortet: collection.length > 5000, senesteForsoegMs: startMs,
      senesteSuccesMs: Date.now(),
    },
  });
  return { antal: collection.length, fra, til, afkortet: collection.length > 5000 };
}

async function afstemLokaleDineroJobs(db) {
  const [dokumentSnap, fakturaJobSnap, kreditJobSnap] = await Promise.all([
    db.ref("udbyder/dinero/dokumenter").once("value"), db.ref("udbyder/fakturajobs").once("value"),
    db.ref("udbyder/kreditjobs").once("value"),
  ]);
  const dokumenter = dokumentSnap.val() || {};
  const updates = {};
  const betalingsstatus = (dokument) => dokument?.betaling?.restOere === 0 ? "betalt"
    : Number.isInteger(dokument?.betaling?.restOere) && dokument.betaling.restOere < dokument.totalInklMomsOere ? "delvist_betalt"
      : dokument?.betalingsStatus || "ikke_betalt";
  const mailstatus = (dokument, hidtidig) => ["Sent", "SeenByCustomer"].includes(dokument?.mailStatus) ? "dokumenteret_sendt"
    : dokument?.mailStatus === "Failed" ? "fejl" : hidtidig || "ukendt";
  for (const [id, job] of Object.entries(fakturaJobSnap.val() || {})) {
    const dokument = dokumenter.faktura?.[job.eksternReference];
    if (!dokument) continue;
    updates[`udbyder/fakturajobs/${id}/betalingStatus`] = betalingsstatus(dokument);
    updates[`udbyder/fakturajobs/${id}/sendStatus`] = mailstatus(dokument, job.sendStatus);
    updates[`udbyder/fakturajobs/${id}/dineroNummer`] = dokument.nummer;
    updates[`udbyder/fakturajobs/${id}/senesteDineroSynkMs`] = dokument.synkroniseretMs;
  }
  for (const [id, job] of Object.entries(kreditJobSnap.val() || {})) {
    const dokument = dokumenter.kreditnota?.[job.eksternReference];
    if (!dokument) continue;
    updates[`udbyder/kreditjobs/${id}/afregningsStatus`] = betalingsstatus(dokument);
    updates[`udbyder/kreditjobs/${id}/sendStatus`] = mailstatus(dokument, job.sendStatus);
    updates[`udbyder/kreditjobs/${id}/dineroNummer`] = dokument.nummer;
    updates[`udbyder/kreditjobs/${id}/senesteDineroSynkMs`] = dokument.synkroniseretMs;
  }
  if (Object.keys(updates).length) await db.ref().update(updates);
  return Object.keys(updates).length;
}

async function koerDineroRetursynk({ ejerUid = "scheduler" } = {}) {
  const db = getDatabase();
  const integration = (await db.ref("udbyder/integrationer/dinero").once("value")).val();
  const startMs = Date.now();
  await db.ref("udbyder/dinero/synk/status/samlet").update({ senesteForsoegMs: startMs, status: "arbejder" });
  if (integration?.status !== "aktiv" || integration?.adapter !== "dinero_personlig" || integration?.retursynkAktiv !== true) {
    await db.ref("udbyder/dinero/synk/status/samlet").update({ status: "ikke_tilsluttet", senesteFejlKode: "DINERO_IKKE_TILSLUTTET", opdateretMs: Date.now() });
    return { ok: false, status: "ikke_tilsluttet" };
  }
  const clientId = kortStreng(integration.clientId, 200);
  const organizationId = kortStreng(integration.organizationId, 80);
  if (!clientId || !organizationId) throw new DineroFejl("Dinero client-id eller organisation-id mangler.", { code: "KONFIGURATION" });
  const token = await hentDineroToken({ clientId, clientSecret: DINERO_CLIENT_SECRET.value(), apiKey: DINERO_API_KEY.value() });
  const klient = dineroKlient({ organizationId, accessToken: token.accessToken });
  // 8 dokumenter pr. art giver højst 50 API-kald inkl. token og lister og
  // holder personlig integration under den dokumenterede 60/min-grænse.
  const maks = Math.max(1, Math.min(8, Number(integration.syncPageSize) || 8));
  try {
    const fakturaer = await synkroniserDineroArt({ db, klient, art: "fakturaer", status: {}, startMs, maks });
    const kreditnotaer = await synkroniserDineroArt({ db, klient, art: "kreditnotaer", status: {}, startMs, maks });
    const posteringer = await synkroniserDineroPosteringer({ db, klient, integration, startMs });
    const afstemteFelter = await afstemLokaleDineroJobs(db);
    await db.ref("udbyder/dinero/synk/status/samlet").update({ status: "ajour", senesteSuccesMs: Date.now(), senesteFejlKode: null, opdateretMs: Date.now() });
    if (ejerUid !== "scheduler") await skrivEjerAudit({ uid: ejerUid, handling: "dinero.synkroniser", objekt: "dinero", objektId: organizationId });
    return { ok: true, fakturaer, kreditnotaer, posteringer, afstemteFelter };
  } catch (error) {
    await db.ref("udbyder/dinero/synk/status/samlet").update({ status: "fejl", senesteFejlKode: error.code || `HTTP_${error.status || "FEJL"}`, opdateretMs: Date.now() });
    throw error;
  }
}

export const dinerosynkroniser = onCall({
  region: REGION, secrets: [DINERO_CLIENT_SECRET, DINERO_API_KEY], timeoutSeconds: 300,
}, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  try { return await koerDineroRetursynk({ ejerUid }); }
  catch (error) { throw new HttpsError("unavailable", error.message || "Dinero-synkronisering fejlede."); }
});

export const dinerosynkroniserPlanlagt = onSchedule({
  region: REGION, schedule: "every 15 minutes", timeZone: "Europe/Copenhagen",
  secrets: [DINERO_CLIENT_SECRET, DINERO_API_KEY], timeoutSeconds: 300,
}, async () => {
  try { await koerDineroRetursynk(); }
  catch (error) { console.error("Planlagt Dinero-synk fejlede", { name: error?.name, code: error?.code, status: error?.status }); }
});

/* ══════════════════════════════════════════════════════════════
   VEYROS BILAGSINDBAKKE — adskilt fra kundernes FAKTURACENTER
   ═════════════════════════════════════════════════════════════ */

function kraevBilagId(vaerdi) {
  const id = kortStreng(vaerdi, 80);
  if (!id || !/^bilag_[a-f0-9]{24}$/.test(id)) throw new HttpsError("invalid-argument", "Bilag-id mangler eller er ugyldigt.");
  return id;
}

const bilagSti = (id) => `udbyder/bilagsindbakke/poster/${id}`;

export const ejerbilaguploadinitier = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const operationId = kortStreng(req.data?.operationId, 100);
  const filnavn = kortStreng(req.data?.filnavn, 240);
  const contentType = kortStreng(req.data?.contentType, 100)?.toLowerCase();
  const stoerrelse = Number(req.data?.stoerrelse);
  const kildeArt = ["filupload", "mobilkamera"].includes(req.data?.kildeArt) ? req.data.kildeArt : "filupload";
  if (!operationId) throw new HttpsError("invalid-argument", "Operations-id mangler.");
  const fejl = BILAG_MIME.includes(contentType) ? [] : ["Kun PDF, JPEG og PNG kan modtages."];
  if (!filnavn || !Number.isSafeInteger(stoerrelse) || stoerrelse <= 0 || stoerrelse > BILAG_MAX_BYTES) fejl.push("Filnavn eller størrelse er ugyldig; maksimum er 20 MB.");
  if (fejl.length) throw new HttpsError("invalid-argument", fejl.join(" "));
  const id = `bilag_${createHash("sha256").update(`${ejerUid}:${operationId}`).digest("hex").slice(0, 24)}`;
  const requestSha256 = createHash("sha256").update(stabilJson({ filnavn, contentType, stoerrelse })).digest("hex");
  const storagePath = `ejer/bilag/${id}/original`;
  const nu = Date.now();
  const ref = getDatabase().ref(bilagSti(id));
  let konflikt = false;
  const resultat = await ref.transaction((aktuel) => {
    if (aktuel) {
      if (aktuel.requestSha256 !== requestSha256) { konflikt = true; return; }
      return aktuel;
    }
    return {
      id, requestSha256, status: "upload_afventer", revision: 0,
      kilde: { art: kildeArt, id: operationId, gruppeId: operationId },
      fil: { filnavn, angivetContentType: contentType, angivetStoerrelse: stoerrelse, storagePath },
      modtagetMs: nu, oprettetMs: nu, oprettetAf: ejerUid, opdateretMs: nu,
    };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("already-exists", "Operations-id'et er allerede brugt til en anden fil.");
  // V4-signering kræver en rigtig servicekonto. I den strengt afgrænsede
  // fire-emulator-test lægger testharnessen derfor fixturebytes på denne
  // forventede sti med Admin SDK; bekræftelsesflowet er ellers identisk.
  let uploadUrl = null;
  if (!erIsoleretFakturatest()) {
    [uploadUrl] = await getStorage().bucket().file(storagePath).getSignedUrl({
      version: "v4", action: "write", expires: nu + 10 * 60 * 1000, contentType,
    });
  }
  await skrivEjerAudit({ uid: ejerUid, handling: "bilag.upload.initier", objekt: "bilag", objektId: id, korrelationsId: operationId });
  return {
    ok: true, id, uploadUrl, expiresInSeconds: 600, contentType,
    testOnlyStoragePath: erIsoleretFakturatest() ? storagePath : null,
    genbrugt: resultat.snapshot.val().oprettetMs !== nu,
  };
});

export const ejerbilaguploadbekraeft = onCall({ region: REGION, memory: "512MiB" }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const id = kraevBilagId(req.data?.id);
  const ref = getDatabase().ref(bilagSti(id));
  const post = (await ref.once("value")).val();
  if (!post) throw new HttpsError("not-found", "Bilaget findes ikke.");
  if (post.status !== "upload_afventer") return { ok: true, id, status: post.status, genbrugt: true };
  const file = getStorage().bucket().file(post.fil.storagePath);
  const [findes] = await file.exists();
  if (!findes) throw new HttpsError("failed-precondition", "Filen er endnu ikke overført til uploadlinket.");
  const afvis = async (grund) => {
    await file.delete({ ignoreNotFound: true });
    await ref.update({ status: "afvist", afvistGrund: grund, opdateretMs: Date.now(), opdateretAf: ejerUid });
    await skrivEjerAudit({ uid: ejerUid, handling: "bilag.upload.afvist", objekt: "bilag", objektId: id });
    throw new HttpsError("failed-precondition", grund);
  };
  const [meta] = await file.getMetadata();
  const faktiskStoerrelse = Number(meta.size);
  const faktiskContentType = String(meta.contentType || "").toLowerCase();
  if (!Number.isSafeInteger(faktiskStoerrelse) || faktiskStoerrelse <= 0 || faktiskStoerrelse > BILAG_MAX_BYTES) await afvis("Filens faktiske størrelse er ugyldig eller over 20 MB.");
  if (faktiskContentType !== post.fil.angivetContentType) await afvis("Filens faktiske content-type afviger fra den godkendte upload.");
  const [signatur] = await file.download({ start: 0, end: 15 });
  if (!filsignaturMatcher(signatur, faktiskContentType)) await afvis("Filens magic bytes matcher ikke den angivne filtype.");
  const [bytes] = await file.download();
  const sha256Vaerdi = createHash("sha256").update(bytes).digest("hex");
  const dedupeRef = getDatabase().ref(`udbyder/bilagsindbakke/dedupe/hash/${sha256Vaerdi}`);
  const dedupe = await dedupeRef.transaction((aktuel) => aktuel || id);
  const andetId = dedupe.snapshot.val() !== id ? dedupe.snapshot.val() : null;
  const status = andetId ? "mulig_dublet" : "ny";
  await file.setMetadata({ contentType: faktiskContentType, cacheControl: "private, no-store", contentDisposition: `attachment; filename="${post.fil.filnavn.replace(/["\\]/g, "_")}"` });
  await ref.update({
    status, revision: (post.revision || 0) + 1, fil: {
      ...post.fil, contentType: faktiskContentType, stoerrelse: faktiskStoerrelse,
      sha256: sha256Vaerdi, verificeretMs: Date.now(),
    },
    dublet: andetId ? { art: "eksakt_fil", andetBilagId: andetId, grunde: ["Samme filhash"] } : null,
    opdateretMs: Date.now(), opdateretAf: ejerUid,
  });
  await skrivEjerAudit({ uid: ejerUid, handling: "bilag.upload.bekraeft", objekt: "bilag", objektId: id });
  return { ok: true, id, status, dubletAf: andetId };
});

export const ejerbilagtestbytesgem = onCall({ region: REGION, memory: "512MiB" }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const emulatorer = /^demo-veyro-(ejer|owner)$/.test(process.env.GCLOUD_PROJECT || "")
    && process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIREBASE_DATABASE_EMULATOR_HOST
    && process.env.FIREBASE_STORAGE_EMULATOR_HOST && process.env.FUNCTIONS_EMULATOR;
  if (!emulatorer) throw new HttpsError("permission-denied", "Lokal filadapter findes kun i det isolerede ejer-emulatormiljø.");
  const id = kraevBilagId(req.data?.id); const post = (await getDatabase().ref(bilagSti(id)).once("value")).val();
  if (!post || post.status !== "upload_afventer" || post.oprettetAf !== ejerUid) throw new HttpsError("failed-precondition", "Uploadreservationen findes ikke eller tilhører ikke den aktuelle ejer.");
  let bytes;
  try { bytes = Buffer.from(String(req.data?.base64 || ""), "base64"); } catch { throw new HttpsError("invalid-argument", "Fixturefilen kunne ikke aflæses."); }
  if (!bytes.length || bytes.length !== Number(post.fil.angivetStoerrelse) || bytes.length > 5 * 1024 * 1024) throw new HttpsError("invalid-argument", "Lokal fixturefil er tom, ændret eller større end 5 MB.");
  await getStorage().bucket().file(post.fil.storagePath).save(bytes, { resumable: false, metadata: { contentType: post.fil.angivetContentType, cacheControl: "private, no-store" } });
  return { ok: true, id, testadapter: true };
});

export const ejerbilaghent = onCall({ region: REGION }, async (req) => {
  await kraevUdbyder(req);
  const id = kraevBilagId(req.data?.id);
  const post = (await getDatabase().ref(bilagSti(id)).once("value")).val();
  if (!post?.fil?.storagePath || post.status === "afvist") throw new HttpsError("not-found", "Et aktivt originalbilag findes ikke.");
  const [url] = await getStorage().bucket().file(post.fil.storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000, responseDisposition: "attachment" });
  return { ok: true, id, url, expiresInSeconds: 300, fil: post.fil };
});

export const ejerbilagmetadatagem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const id = kraevBilagId(req.data?.id);
  const forventetRevision = kraevForventetRevision(req.data?.forventetRevision);
  const normaliseret = normaliserBilagsmetadata(req.data?.metadata);
  if (!normaliseret.ok) throw new HttpsError("invalid-argument", normaliseret.fejl.join(" "));
  const ref = getDatabase().ref(bilagSti(id));
  const foer = (await ref.once("value")).val();
  if (!foer?.fil?.sha256 || !["ny", "under_behandling", "til_gennemgang", "mulig_dublet"].includes(foer.status)) {
    throw new HttpsError("failed-precondition", "Bilagets metadata kan ikke ændres efter godkendelse eller arkivering.");
  }
  const nu = Date.now(); let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(foer);
  const resultat = await ref.transaction((lokal) => {
    const post = transaktionsstart(lokal);
    if (!post || (post.revision || 0) !== forventetRevision) { konflikt = true; return; }
    const version = Number(post.metadata?.version || 0) + 1;
    const versionspost = { version, ...normaliseret.post, gemtMs: nu, gemtAf: ejerUid, kilde: "manuel" };
    return {
      ...post, status: post.status === "mulig_dublet" ? "mulig_dublet" : "til_gennemgang",
      metadata: { version, aktuel: normaliseret.post, versioner: { ...(post.metadata?.versioner || {}), [`v${version}`]: versionspost } },
      revision: (post.revision || 0) + 1, opdateretMs: nu, opdateretAf: ejerUid,
    };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "Bilaget blev ændret samtidigt. Genindlæs før du gemmer.");
  // Tværkanalsignaler markeres, men sletter eller sammenfletter aldrig.
  const alle = (await getDatabase().ref("udbyder/bilagsindbakke/poster").once("value")).val() || {};
  const kandidat = resultat.snapshot.val();
  let bedste = null;
  for (const [andetId, andet] of Object.entries(alle)) {
    if (andetId === id || ["afvist", "arkiveret"].includes(andet?.status)) continue;
    const signal = bilagDedupeSignaler(kandidat, andet);
    if (signal && (!bedste || signal.score > bedste.score)) bedste = { ...signal, andetBilagId: andetId };
  }
  if (bedste) await ref.update({ status: "mulig_dublet", dublet: bedste, opdateretMs: Date.now() });
  await skrivEjerAudit({ uid: ejerUid, handling: "bilag.metadata.gem", objekt: "bilag", objektId: id });
  return { ok: true, id, revision: resultat.snapshot.val().revision, status: bedste ? "mulig_dublet" : resultat.snapshot.val().status, dublet: bedste };
});

export const ejerbilagstatus = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const id = kraevBilagId(req.data?.id);
  const status = kortStreng(req.data?.status, 40);
  const forventetRevision = kraevForventetRevision(req.data?.forventetRevision);
  if (!BILAG_STATUS.includes(status) || !["godkendt", "afvist", "arkiveret", "til_gennemgang"].includes(status)) throw new HttpsError("invalid-argument", "Statusskiftet er ikke tilladt.");
  const ref = getDatabase().ref(bilagSti(id));
  const foer = (await ref.once("value")).val();
  if (!foer) throw new HttpsError("not-found", "Bilaget findes ikke.");
  if (status === "godkendt") {
    const m = foer.metadata?.aktuel;
    if (!m?.leverandoer || !m.dokumentnummer || !m.dato || !m.valuta || !Number.isSafeInteger(m.totalOere) || !m.kategori) {
      throw new HttpsError("failed-precondition", "Leverandør, dokumentnummer, dato, valuta, total og kategori skal gennemgås før godkendelse.");
    }
  }
  let konflikt = false; const transaktionsstart = verificeretTransaktionsstart(foer);
  const resultat = await ref.transaction((lokal) => {
    const post = transaktionsstart(lokal);
    if (!post || (post.revision || 0) !== forventetRevision || ["matchet_dinero", "arkiveret"].includes(post.status)) { konflikt = true; return; }
    return { ...post, status, revision: (post.revision || 0) + 1, statusMs: Date.now(), statusAf: ejerUid, opdateretMs: Date.now() };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "Bilaget blev ændret samtidigt eller er låst af et match.");
  await skrivEjerAudit({ uid: ejerUid, handling: `bilag.status.${status}`, objekt: "bilag", objektId: id });
  return { ok: true, id, status, revision: resultat.snapshot.val().revision };
});

export const ejerbilagocrkoer = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const id = kraevBilagId(req.data?.id);
  const db = getDatabase();
  const [postSnap, integrationSnap] = await Promise.all([db.ref(bilagSti(id)).once("value"), db.ref("udbyder/integrationer/bilag").once("value")]);
  const post = postSnap.val(); const integration = integrationSnap.val() || {};
  if (!post?.fil?.sha256) throw new HttpsError("failed-precondition", "Upload skal verificeres før OCR.");
  if (!["ny", "under_behandling", "til_gennemgang", "mulig_dublet"].includes(post.status)) {
    throw new HttpsError("failed-precondition", "OCR kan ikke ændre et godkendt, klargjort eller arkiveret bilag.");
  }
  if (integration.ocr?.status !== "aktiv") {
    await db.ref(bilagSti(id)).update({ ocr: { status: "ikke_tilsluttet", senesteForsoegMs: Date.now() }, opdateretMs: Date.now() });
    throw new HttpsError("failed-precondition", "OCR er ikke tilsluttet. Bilaget kan fortsat gennemgås manuelt.");
  }
  if (integration.ocr.adapter !== "test" || !erIsoleretFakturatest()) throw new HttpsError("unimplemented", "Den valgte OCR-adapter er ikke aktiveret.");
  const svar = koerIsoleretOcrTest(integration.ocr.testFixture);
  if (svar.kind !== "forslag") throw new HttpsError("failed-precondition", svar.error);
  await db.ref(bilagSti(id)).update({ ocr: { status: "forslag", ...svar.resultat, oprettetMs: Date.now(), oprettetAf: ejerUid }, status: "til_gennemgang", opdateretMs: Date.now() });
  await skrivEjerAudit({ uid: ejerUid, handling: "bilag.ocr.forslag", objekt: "bilag", objektId: id });
  return { ok: true, id, ocr: svar.resultat };
});

export const ejerbilagklargoerdinero = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const id = kraevBilagId(req.data?.id);
  const db = getDatabase();
  const bilagRef = db.ref(bilagSti(id));
  const foer = (await bilagRef.once("value")).val();
  if (!foer || !["godkendt", "klargoering_dinero", "klar_til_dinero"].includes(foer.status)) {
    throw new HttpsError("failed-precondition", "Kun et gennemgået og godkendt bilag kan klargøres til Dinero.");
  }
  const post = foer;
  if (post.dineroMatch && Object.keys(post.dineroMatch).length) throw new HttpsError("already-exists", "Bilaget er allerede koblet til bogførte Dinero-poster.");
  const snapshot = { bilagId: id, filSha256: post.fil.sha256, metadataVersion: post.metadata.version, metadata: post.metadata.aktuel, type: "koebskladde" };
  const snapshotSha256 = createHash("sha256").update(stabilJson(snapshot)).digest("hex");
  const jobId = `bilagjob_${id}`;
  const jobRef = db.ref(`udbyder/bilagjobs/${jobId}`);
  const nu = Date.now();
  let konflikt = false;
  const transaktionsstart = verificeretTransaktionsstart(foer);
  const laas = await bilagRef.transaction((lokal) => {
    const aktuel = transaktionsstart(lokal);
    if (!aktuel) { konflikt = true; return; }
    if (["klargoering_dinero", "klar_til_dinero"].includes(aktuel.status)) {
      if (aktuel.dineroKlargoering?.snapshotSha256 !== snapshotSha256) { konflikt = true; return; }
      return aktuel;
    }
    if (aktuel.status !== "godkendt" || aktuel.dineroMatch && Object.keys(aktuel.dineroMatch).length) { konflikt = true; return; }
    return {
      ...aktuel, status: "klargoering_dinero", dineroJobId: jobId,
      dineroKlargoering: { snapshot, snapshotSha256, startetMs: nu, startetAf: ejerUid },
      revision: (aktuel.revision || 0) + 1, opdateretMs: nu, opdateretAf: ejerUid,
    };
  });
  if (!laas.committed || konflikt) throw new HttpsError("aborted", "Bilaget blev ændret samtidigt eller er allerede bundet til en anden version.");
  const resultat = await jobRef.transaction((aktuel) => aktuel || {
    id: jobId, bilagId: id, type: "koebskladde", snapshot, snapshotSha256,
    status: "forberedt", overfoerselsStatus: "ikke_tilsluttet", oprettetMs: nu, oprettetAf: ejerUid,
  });
  if (resultat.snapshot.val().snapshotSha256 !== snapshotSha256) throw new HttpsError("already-exists", "Bilagsjobbet er allerede bundet til en anden metadataversion.");
  await bilagRef.transaction((aktuel) => {
    if (!aktuel || aktuel.dineroKlargoering?.snapshotSha256 !== snapshotSha256) return;
    if (aktuel.status === "klar_til_dinero") return aktuel;
    return { ...aktuel, status: "klar_til_dinero", opdateretMs: Date.now(), opdateretAf: ejerUid };
  });
  await skrivEjerAudit({ uid: ejerUid, handling: "bilag.dinero.klargoer", objekt: "bilag", objektId: id });
  return { ok: true, id, jobId, status: "forberedt", overfoerselsStatus: "ikke_tilsluttet" };
});

export const ejerbilagmatchdinero = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const id = kraevBilagId(req.data?.id);
  const posteringId = kortStreng(req.data?.posteringId, 80);
  if (!posteringId || !/^[A-Za-z0-9_-]+$/.test(posteringId)) throw new HttpsError("invalid-argument", "Dinero-postering mangler.");
  const db = getDatabase();
  const [bilagSnap, posteringSnap] = await Promise.all([db.ref(bilagSti(id)).once("value"), db.ref(`udbyder/dinero/posteringer/${posteringId}`).once("value")]);
  if (!bilagSnap.exists() || !posteringSnap.exists()) throw new HttpsError("not-found", "Bilag eller Dinero-postering findes ikke.");
  const nu = Date.now();
  const bilagRef = db.ref(bilagSti(id));
  const start = verificeretTransaktionsstart(bilagSnap.val());
  const resultat = await bilagRef.transaction((lokal) => {
    const aktuel = start(lokal);
    if (!aktuel) return;
    if (aktuel.dineroMatch?.[posteringId]) return aktuel;
    return {
      ...aktuel, status: "matchet_dinero",
      dineroMatch: { ...(aktuel.dineroMatch || {}), [posteringId]: { posteringId, matchetMs: nu, matchetAf: ejerUid } },
      revision: (aktuel.revision || 0) + 1, opdateretMs: nu,
    };
  });
  if (!resultat.committed) throw new HttpsError("aborted", "Bilaget blev ændret samtidigt. Prøv igen.");
  await db.ref(`udbyder/dinero/posteringer/${posteringId}/bilagMatch/${id}`).set({ bilagId: id, matchetMs: nu });
  await skrivEjerAudit({ uid: ejerUid, handling: "bilag.dinero.match", objekt: "bilag", objektId: id });
  return { ok: true, id, posteringId, status: "matchet_dinero" };
});

export const dinerokontomappinggem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const kontonummer = kortStreng(String(req.data?.kontonummer ?? ""), 30);
  const kategori = kortStreng(req.data?.kategori, 100);
  const resultatkonto = req.data?.resultatkonto === true;
  const koefficient = Number(req.data?.koefficient);
  if (!kontonummer || !kategori || ![1, -1].includes(koefficient)) throw new HttpsError("invalid-argument", "Kontonummer, kategori og fortegnskoefficient er påkrævet.");
  const post = { kontonummer, kategori, resultatkonto, koefficient, opdateretMs: Date.now(), opdateretAf: ejerUid };
  await getDatabase().ref(`udbyder/dinero/kontomapping/${kontonummer}`).set(post);
  await skrivEjerAudit({ uid: ejerUid, handling: "dinero.kontomapping.gem", objekt: "dineroKonto", objektId: kontonummer });
  return { ok: true, post };
});

export const ejerbilagintegrationstatus = onCall({ region: REGION }, async (req) => {
  await kraevUdbyder(req);
  const integration = (await getDatabase().ref("udbyder/integrationer/bilag").once("value")).val() || {};
  return { ok: true, mail: bilagMailForbindelsesstatus(integration), ocr: integration.ocr?.status === "aktiv" ? "aktiv" : "ikke_tilsluttet" };
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
  const ejerUid = await kraevUdbyder(req);
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
  await skrivEjerAudit({
    uid: ejerUid, handling: "prisliste.slet", objekt: "prisliste", objektId: id,
  });
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

  const perms = permStrengFraClaims(auth.token);
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
    const fysisk = til === "udlaant" || til === "returneret";
    const operationId = kortStreng(d.operationId, 80);
    if (fysisk && !UNIT_OPERATION_ID_MOENSTER.test(operationId || "")) {
      throw new HttpsError("invalid-argument", "Fysiske skift kræver en gyldig operationId.");
    }
    const modtagelsesPladsId = til === "returneret"
      ? kortStreng(d.modtagelsesPladsId, 80) : null;
    const tidspunktMs = Date.now();
    let afvisning = null;
    let resultat = null;
    let foerTilstand = null;

    /* Hele tenant-roden er transaktionsgrænsen, fordi booking, kasse,
       placering og append-only bevægelse skal lande sammen. Det er en bevidst
       V1-grænse; en senere sharding må bevare samme atomiske kontrakt. */
    // Admin SDK'et kan på en kold emulatorforbindelse kalde callbacken med en
    // tom lokal cache før serverværdien er hentet. Et læs varmer kun cachen;
    // transaktionen genkontrollerer stadig serverversionen atomisk.
    const tenantFoerSnap = await rod.once("value");
    if (!tenantFoerSnap.exists()) throw new HttpsError("not-found", "Tenantdata findes ikke.");
    const tenantFoer = tenantFoerSnap.val();
    let koldCacheFallback = true;
    const tx = await rod.transaction((aktuel) => {
      if (!aktuel && koldCacheFallback) aktuel = structuredClone(tenantFoer);
      koldCacheFallback = false;
      afvisning = null;
      resultat = null;
      if (!aktuel) { afvisning = { kode: "not-found", tekst: "Tenantdata findes ikke." }; return; }
      const foer = aktuel.kasseudlaan?.[udlaanId];
      if (!foer) { afvisning = { kode: "not-found", tekst: "Udlånet findes ikke." }; return; }
      const kasse = aktuel.kasser?.[foer.kasseId];
      if (!kasse) { afvisning = { kode: "not-found", tekst: `Kassen ${foer.kasseId} findes ikke.` }; return; }
      foerTilstand = foer.tilstand;

      let bevaegelse = null;
      if (fysisk) {
        const eksisterende = aktuel.unitbevaegelser?.[operationId];
        if (til === "returneret" && (!modtagelsesPladsId
            || !aktuel.reolpladser?.[modtagelsesPladsId])) {
          afvisning = { kode: "failed-precondition", tekst: "Vælg en gyldig modtagelseslokation." };
          return;
        }
        const bygget = bygUnitbevaegelse({
          operationId,
          unitId: foer.kasseId,
          art: til === "udlaant" ? "udlevering" : "retur",
          // Null er en meningsfuld, gemt "ude"-placering ved retur. Brug
          // derfor ikke nullish fallback til kassens nye modtagelsesplads.
          fraPladsId: eksisterende ? (eksisterende.fraPladsId ?? null) : (kasse.pladsId ?? null),
          tilPladsId: til === "returneret" ? modtagelsesPladsId : null,
          bookingId: udlaanId,
          reference: foer.sagsnummer || null,
          kilde: "unitbooking",
          tidspunktMs,
          udfoertAf: uid,
        });
        if (!bygget.ok) {
          afvisning = { kode: "invalid-argument", tekst: somBesked(bygget.fejl) };
          return;
        }
        bevaegelse = bygget.bevaegelse;
        if (eksisterende) {
          if (!sammeUnitbevaegelse(eksisterende, bevaegelse)) {
            afvisning = { kode: "already-exists", tekst: "operationId er allerede brugt til en anden fysisk handling." };
            return;
          }
          resultat = { ok: true, id: udlaanId, tilstand: foer.tilstand, kasse: null, bevaegelse: eksisterende, gentaget: true };
          return aktuel;
        }
      }

      if (!kanSkifteUdlaan(foer.tilstand, til)) {
        afvisning = { kode: "failed-precondition", tekst: `Et udlån kan ikke skifte fra ${foer.tilstand} til ${til}.` };
        return;
      }
      const virkning = virkningPaaKasse({
        fra: foer.tilstand, til, kasse, modtagelsesPladsId,
      });
      const ny = { ...aktuel };
      ny.kasseudlaan = { ...(aktuel.kasseudlaan || {}), [udlaanId]: { ...foer, tilstand: til } };
      if (til === "udlaant") ny.kasseudlaan[udlaanId].udleveretMs = tidspunktMs;
      if (til === "returneret") ny.kasseudlaan[udlaanId].returneretMs = tidspunktMs;
      if (virkning) ny.kasser = { ...(aktuel.kasser || {}), [foer.kasseId]: { ...kasse, ...virkning } };
      if (bevaegelse) ny.unitbevaegelser = { ...(aktuel.unitbevaegelser || {}), [operationId]: bevaegelse };
      resultat = { ok: true, id: udlaanId, tilstand: til, kasse: virkning || null, bevaegelse, gentaget: false };
      return ny;
    });

    if (afvisning) throw new HttpsError(afvisning.kode, afvisning.tekst);
    if (!tx.committed || !resultat) throw new HttpsError("aborted", "En anden ændrede udlånet. Opdatér og prøv igen.");
    if (!resultat.gentaget) {
      await logUdlaan(tenantId, uid, AUDIT.tilstandsskift, udlaanId,
        { tilstand: foerTilstand }, { tilstand: til },
        resultat.kasse ? `kasse ${resultat.bevaegelse?.unitId || ""} -> ${resultat.kasse.status}` : null);
    }
    return resultat;
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
   UNITBOOKING — IMPORT AF MAIL OG BOOKINGSKEMA

   Originalmaterialet bevares på kladden. .eml, .msg, tekst-PDF, .xlsx og CSV
   udtrækkes lokalt før den deterministiske fortolkning. Scannede dokumenter og
   billeder sendes kun til en ekstern extractor, når den er konfigureret;
   ellers står kladden ærligt som manuel. Dokumentindhold udfører aldrig kode.
   ══════════════════════════════════════════════════════════════════════ */

const unitImportKladdeId = (operationId) =>
  `imp-${createHash("sha256").update(operationId).digest("hex").slice(0, 24)}`;
const unitImportDokumentId = (operationId) =>
  `dok-${createHash("sha256").update(`dok:${operationId}`).digest("hex").slice(0, 24)}`;
const unitImportStorageSti = (tenantId, kladdeId, dokumentId) =>
  `tenants/${tenantId}/unitbooking/import/${kladdeId}/${dokumentId}`;
const unitImportMaterialeHash = (tekst) =>
  createHash("sha256").update(String(tekst).replace(/\r\n/g, "\n").trim().toLowerCase()).digest("hex");

function kraevUnitOperationId(v) {
  const id = kortStreng(v, 80);
  if (!UNIT_OPERATION_ID_MOENSTER.test(id || "")) {
    throw new HttpsError("invalid-argument", "operationId mangler eller er ugyldig.");
  }
  return id;
}

function tomUnitImportAflæsning() {
  return {
    felter: {
      kunde: null, kontaktperson: null, eksternReference: null,
      beskrivelse: null, fraDato: null, tilDato: null,
      klargoerDato: null, haandtering: null,
    },
    linjer: [{
      id: "linje-1", objekt: null,
      laengdeMm: null, breddeMm: null, hoejdeMm: null,
      maaleenhedKilde: null, type: null, undertype: null,
      orienteringsnote: null, maaIkkeVendes: false,
      tilladAndreOrienteringer: false,
      polstringLaengdePrSideMm: 0,
      polstringBreddePrSideMm: 0,
      polstringHoejdePrSideMm: 0,
    }],
    kilder: [],
    advarsler: ["Automatisk aflæsning er ikke tilsluttet. Gennemgå og udfyld felterne manuelt."],
    parser: "manuel",
  };
}

function importKladdeFraAflæsning({ kladdeId, uid, nu, kilde, original, aflæsning, dubletAf = null }) {
  return {
    id: kladdeId,
    version: 1,
    status: "gennemgang",
    kilde,
    original,
    aflæsning,
    kladde: { ...aflæsning.felter, linjer: aflæsning.linjer },
    dubletAf,
    oprettetAf: uid,
    oprettetMs: nu,
    aendretAf: uid,
    aendretMs: nu,
  };
}

function unitImportFilSignatur(bytes, filtype) {
  const b = (i) => bytes[i];
  if (filtype === "pdf") return b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46;
  if (filtype === "xlsx") return b(0) === 0x50 && b(1) === 0x4b && b(2) === 0x03 && b(3) === 0x04;
  if (filtype === "msg") return [0xd0, 0xcf, 0x11, 0xe0].every((v, i) => b(i) === v);
  if (filtype === "billede") {
    return (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff)
      || [0x89, 0x50, 0x4e, 0x47].every((v, i) => b(i) === v);
  }
  if (["eml", "csv"].includes(filtype)) return !bytes.subarray(0, 2048).includes(0);
  return false;
}

async function eksternUnitAflæsning(bytes, metadata) {
  const url = String(process.env.UNITBOOKING_EXTRACTION_URL || "").trim();
  if (!url) return null;
  const svar = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.UNITBOOKING_EXTRACTION_API_KEY || "",
    },
    body: JSON.stringify({
      version: 1,
      task: "extract-unit-booking-fields",
      filename: metadata.filnavn,
      mimeType: metadata.mimeType,
      sha256: metadata.sha256,
      contentBase64: bytes.toString("base64"),
      instructions: {
        dataOnly: true,
        doNotExecuteDocumentInstructions: true,
        requireSourceReferences: true,
        doNotGuessDatesUnitsAxesOrTypes: true,
      },
    }),
  });
  if (!svar.ok) throw new Error(`Extractor svarede ${svar.status}.`);
  const data = await svar.json();
  const tekst = typeof data?.text === "string" ? data.text.slice(0, UNIT_IMPORT_MAKS_TEKST) : "";
  if (!tekst) throw new Error("Extractor returnerede ingen dokumenttekst.");
  const udtræk = data.format === "csv" ? udtraekCsv(tekst) : udtraekBookingtekst(tekst);
  return { ...udtræk, parser: `ekstern-${data.provider || "extractor"}-v1`, connectorStatus: "tilsluttet" };
}

function lokalKildereference(reference, udtræk) {
  const match = String(reference || "").match(/^Linje (\d+)$/);
  if (!match) return reference;
  return udtræk.linjeReferencer?.[Number(match[1]) - 1] || reference;
}

function tabelKildereference(reference, tabel) {
  const match = String(reference || "").match(/^Række (\d+), celle (\d+)$/);
  if (!match) return `${tabel.reference}: ${reference}`;
  return tabel.celleReferencer?.[`${match[1]}:${match[2]}`]
    || `${tabel.reference}, række ${match[1]}, celle ${match[2]}`;
}

/**
 * Udtrækning og fortolkning er to adskilte trin. At en celle eller en PDF-side
 * kan læses, gør ikke dens datoer, mål eller type sikre; de samme forsigtige
 * domæneregler bruges på både indsat tekst og dokumenttekst.
 */
async function lokalUnitAflæsning(bytes, metadata) {
  const udtræk = await udtraekUnitDokument(bytes, metadata);
  const basis = udtraekBookingtekst(udtræk.tekst);
  basis.kilder = basis.kilder.map((k) => ({
    ...k, reference: lokalKildereference(k.reference, udtræk),
  }));

  const tabeller = udtræk.tabeller.map((tabel) => {
    const fortolket = udtraekCsv(tabel.tekst);
    return {
      ...fortolket,
      kilder: fortolket.kilder.map((k) => ({
        ...k, reference: tabelKildereference(k.reference, tabel),
      })),
    };
  }).filter((tabel) => tabel.linjer?.length);

  const tabelLinjer = tabeller.flatMap((tabel) => tabel.linjer || []);
  const tabelFelter = Object.assign({}, ...tabeller.map((tabel) => tabel.felter || {}));
  const aflæsning = {
    ...basis,
    felter: { ...basis.felter, ...Object.fromEntries(Object.entries(tabelFelter).filter(([, v]) => v)) },
    linjer: tabelLinjer.length ? tabelLinjer : basis.linjer,
    kilder: [...basis.kilder, ...tabeller.flatMap((tabel) => tabel.kilder || [])],
    advarsler: [...new Set([
      ...(udtræk.advarsler || []),
      ...basis.advarsler,
      ...tabeller.flatMap((tabel) => tabel.advarsler || []),
    ])],
    parser: `lokal-${metadata.filtype}-v2`,
    connectorStatus: "lokal",
    udtræk: {
      filtype: metadata.filtype,
      tekstTegn: udtræk.tekst.length,
      tabeller: udtræk.tabeller.length,
      vedhaeftninger: udtræk.vedhaeftninger,
    },
  };
  return { aflæsning, harTekst: Boolean(udtræk.tekst.trim() || tabelLinjer.length) };
}

export const unitbookingimportopret = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId, db } = await kraevUdlaansskriv(req);
  const operationId = kraevUnitOperationId(req.data?.operationId);
  const originalTekst = String(req.data?.originalTekst || "").trim();
  if (!originalTekst || originalTekst.length > UNIT_IMPORT_MAKS_TEKST) {
    throw new HttpsError("invalid-argument", "Indsæt mellem 1 og 200.000 tegn.");
  }
  const rod = db.ref(`tenants/${tenantId}`);
  const kladdeId = unitImportKladdeId(operationId);
  const eksisterende = (await rod.child(`unitbookingImporter/${kladdeId}`).once("value")).val();
  if (eksisterende) return { ok: true, kladde: eksisterende, gentaget: true };
  const sha256 = unitImportMaterialeHash(originalTekst);
  const dubletAf = (await rod.child(`unitbookingImportHashes/${sha256}`).once("value")).val() || null;
  const nu = Date.now();
  const aflæsning = udtraekBookingtekst(originalTekst);
  const kladde = importKladdeFraAflæsning({
    kladdeId, uid, nu, kilde: "tekst",
    original: { art: "tekst", tekst: originalTekst, sha256, immutable: true },
    aflæsning, dubletAf,
  });
  const opdatering = {
    [`unitbookingImporter/${kladdeId}`]: kladde,
    [`unitbookingImportOperationer/${operationId}`]: { art: "opret-tekst", kladdeId, sha256, tidspunktMs: nu, uid },
  };
  if (!dubletAf) opdatering[`unitbookingImportHashes/${sha256}`] = kladdeId;
  await rod.update(opdatering);
  await logUdlaan(tenantId, uid, AUDIT.opret, kladdeId, null,
    { status: kladde.status }, dubletAf ? `importdublet af ${dubletAf}` : "bookingimport fra tekst");
  return { ok: true, kladde, gentaget: false };
});

export const unitbookingimportuploadstart = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId, db } = await kraevUdlaansskriv(req);
  const d = req.data || {};
  const operationId = kraevUnitOperationId(d.operationId);
  const filnavn = kortStreng(d.filnavn, 200);
  const mimeType = kortStreng(d.mimeType, 120) || "application/octet-stream";
  const stoerrelse = Number(d.stoerrelse);
  const sha256 = String(d.sha256 || "").toLowerCase();
  const validering = valideImportFil({ filnavn, mimeType, stoerrelse });
  if (!validering.ok || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new HttpsError("invalid-argument", `${somBesked(validering.fejl)} sha256 mangler eller er ugyldig.`);
  }
  const filtype = filtypeFraNavn(filnavn, mimeType);
  if (d.filtype && d.filtype !== filtype) throw new HttpsError("invalid-argument", "Filtype og filnavn er uenige.");
  const rod = db.ref(`tenants/${tenantId}`);
  const kladdeId = unitImportKladdeId(operationId);
  const dokumentId = unitImportDokumentId(operationId);
  const storagePath = unitImportStorageSti(tenantId, kladdeId, dokumentId);
  const nu = Date.now();
  const dubletAf = (await rod.child(`unitbookingImportHashes/${sha256}`).once("value")).val() || null;
  const eksisterende = (await rod.child(`unitbookingImporter/${kladdeId}`).once("value")).val();
  if (!eksisterende) {
    const aflæsning = tomUnitImportAflæsning();
    const kladde = importKladdeFraAflæsning({
      kladdeId, uid, nu, kilde: "fil",
      original: {
        art: "fil", filnavn, mimeType, filtype, stoerrelse, sha256,
        dokumentId, storagePath, status: "upload-afventer", immutable: true,
      },
      aflæsning, dubletAf,
    });
    const opdatering = {
      [`unitbookingImporter/${kladdeId}`]: kladde,
      [`unitbookingImportOperationer/${operationId}`]: { art: "upload-start", kladdeId, sha256, tidspunktMs: nu, uid },
    };
    if (!dubletAf) opdatering[`unitbookingImportHashes/${sha256}`] = kladdeId;
    await rod.update(opdatering);
  }
  const uploadUrl = await lokalStorageUrl(req, {
    handling: "write", storagePath, mimeType, stoerrelse,
  }) || (await getStorage().bucket().file(storagePath).getSignedUrl({
    version: "v4", action: "write", expires: nu + 10 * 60 * 1000, contentType: mimeType,
  }))[0];
  return { ok: true, kladdeId, dokumentId, storagePath, uploadUrl, mimeType, dubletAf };
});

export const unitbookingimportuploadslut = onCall({
  region: REGION, secrets: [UNITBOOKING_EXTRACTION_API_KEY],
}, async (req) => {
  const { uid, tenantId, db } = await kraevUdlaansskriv(req);
  const operationId = kraevUnitOperationId(req.data?.operationId);
  const kladdeId = kortStreng(req.data?.kladdeId, 80);
  const dokumentId = kortStreng(req.data?.dokumentId, 80);
  if (kladdeId !== unitImportKladdeId(operationId) || dokumentId !== unitImportDokumentId(operationId)) {
    throw new HttpsError("invalid-argument", "Uploadreferencen matcher ikke handlingen.");
  }
  const rod = db.ref(`tenants/${tenantId}`);
  const kladdeRef = rod.child(`unitbookingImporter/${kladdeId}`);
  const kladde = (await kladdeRef.once("value")).val();
  if (!kladde) throw new HttpsError("not-found", "Importudkastet findes ikke.");
  if (kladde.original?.status === "aktiv") return { ok: true, kladde, gentaget: true };
  const file = getStorage().bucket().file(kladde.original.storagePath);
  const [findes] = await file.exists();
  if (!findes) throw new HttpsError("failed-precondition", "Filen er ikke overført endnu.");
  const [meta] = await file.getMetadata();
  const faktiskStoerrelse = Number(meta.size);
  if (!Number.isSafeInteger(faktiskStoerrelse) || faktiskStoerrelse <= 0 || faktiskStoerrelse > UNIT_IMPORT_MAKS_BYTES) {
    await file.delete({ ignoreNotFound: true });
    await kladdeRef.child("original").update({ status: "afvist", afvistGrund: "Ugyldig filstørrelse." });
    throw new HttpsError("failed-precondition", "Filen er tom eller større end 25 MB.");
  }
  const [bytes] = await file.download();
  const faktiskHash = createHash("sha256").update(bytes).digest("hex");
  if (faktiskHash !== kladde.original.sha256 || !unitImportFilSignatur(bytes, kladde.original.filtype)) {
    await file.delete({ ignoreNotFound: true });
    await kladdeRef.child("original").update({ status: "afvist", afvistGrund: "Filens indhold matcher ikke metadata." });
    throw new HttpsError("failed-precondition", "Filens signatur eller hash matcher ikke uploaden.");
  }
  let aflæsning = null;
  let connectorStatus = "ikke-tilsluttet";
  try {
    if (UNIT_LOKAL_UDTRAEK_FILTYPE.includes(kladde.original.filtype)) {
      const lokal = await lokalUnitAflæsning(bytes, kladde.original);
      if (lokal.harTekst) {
        aflæsning = lokal.aflæsning;
        connectorStatus = "lokal";
      } else {
        aflæsning = await eksternUnitAflæsning(bytes, kladde.original);
        connectorStatus = aflæsning ? "tilsluttet" : "ikke-tilsluttet";
        if (!aflæsning) aflæsning = lokal.aflæsning;
      }
    } else {
      aflæsning = await eksternUnitAflæsning(bytes, kladde.original);
      connectorStatus = aflæsning ? "tilsluttet" : "ikke-tilsluttet";
    }
  } catch (fejl) {
    aflæsning = tomUnitImportAflæsning();
    console.warn("UNIT bookingimport kunne ikke aflæse dokumentet", fejl);
    aflæsning.advarsler = ["Dokumentet kunne ikke aflæses automatisk. Gennemgå og indtast oplysningerne manuelt.", ...aflæsning.advarsler];
    connectorStatus = "fejl";
  }
  if (!aflæsning) aflæsning = tomUnitImportAflæsning();
  const nu = Date.now();
  const efter = {
    ...kladde,
    original: { ...kladde.original, status: "aktiv", stoerrelse: faktiskStoerrelse },
    aflæsning: { ...aflæsning, connectorStatus },
    kladde: { ...aflæsning.felter, linjer: aflæsning.linjer },
    aendretAf: uid, aendretMs: nu,
  };
  await kladdeRef.set(efter);
  await logUdlaan(tenantId, uid, AUDIT.aendre, kladdeId,
    { status: "upload-afventer" }, { status: "gennemgang" }, `bookingimport ${connectorStatus}`);
  return { ok: true, kladde: efter, gentaget: false };
});

export const unitbookingimportgem = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId, db } = await kraevUdlaansskriv(req);
  const operationId = kraevUnitOperationId(req.data?.operationId);
  const kladdeId = kortStreng(req.data?.kladdeId, 80);
  const rod = db.ref(`tenants/${tenantId}`);
  const ref = rod.child(`unitbookingImporter/${kladdeId}`);
  const foer = (await ref.once("value")).val();
  if (!foer) throw new HttpsError("not-found", "Importudkastet findes ikke.");
  if (foer.status === "bekraeftet") throw new HttpsError("failed-precondition", "Importen er allerede bekræftet.");
  const renset = rensImportKladde(req.data?.kladde || {});
  const fejl = valideImportKladde(renset);
  const nu = Date.now();
  const efter = {
    ...foer, kladde: renset,
    status: Object.keys(fejl).length ? "gennemgang" : "klar-til-forslag",
    valideringsfejl: Object.keys(fejl).length ? fejl : null,
    aendretAf: uid, aendretMs: nu,
  };
  await rod.update({
    [`unitbookingImporter/${kladdeId}`]: efter,
    [`unitbookingImportOperationer/${operationId}`]: { art: "gem", kladdeId, tidspunktMs: nu, uid },
  });
  return { ok: true, kladde: efter, fejl };
});

export const unitbookingimportbekraeft = onCall({ region: REGION }, async (req) => {
  const { uid, tenantId, db } = await kraevUdlaansskriv(req);
  const operationId = kraevUnitOperationId(req.data?.operationId);
  const kladdeId = kortStreng(req.data?.kladdeId, 80);
  const renset = rensImportKladde(req.data?.kladde || {});
  const fejl = valideImportKladde(renset);
  if (Object.keys(fejl).length) throw new HttpsError("invalid-argument", somBesked(fejl));
  if (renset.linjer.some((l) => !l.valgtKasseId)) {
    throw new HttpsError("invalid-argument", "Vælg en enhed på hver objektlinje.");
  }
  const valgte = renset.linjer.map((l) => l.valgtKasseId);
  if (new Set(valgte).size !== valgte.length) {
    throw new HttpsError("invalid-argument", "Samme enhed kan ikke vælges til flere objektlinjer i samme periode.");
  }
  const rod = db.ref(`tenants/${tenantId}`);
  const bookingIder = renset.linjer.map(() => rod.child("kasseudlaan").push().key);
  const payloadHash = createHash("sha256").update(JSON.stringify(renset)).digest("hex");
  let afvisning = null;
  let resultat = null;
  const nu = Date.now();
  const tenantFoerSnap = await rod.once("value");
  if (!tenantFoerSnap.exists()) throw new HttpsError("not-found", "Tenantdata findes ikke.");
  const tenantFoer = tenantFoerSnap.val();
  let koldCacheFallback = true;
  const tx = await rod.transaction((aktuel) => {
    if (!aktuel && koldCacheFallback) aktuel = structuredClone(tenantFoer);
    koldCacheFallback = false;
    afvisning = null;
    resultat = null;
    if (!aktuel?.unitbookingImporter?.[kladdeId]) {
      afvisning = { kode: "not-found", tekst: "Importudkastet findes ikke." }; return;
    }
    const tidligereOp = aktuel.unitbookingImportOperationer?.[operationId];
    if (tidligereOp) {
      if (tidligereOp.payloadHash !== payloadHash) {
        afvisning = { kode: "already-exists", tekst: "operationId er allerede brugt med andre oplysninger." }; return;
      }
      resultat = { ok: true, bookingIder: tidligereOp.bookingIder || [], gentaget: true };
      return aktuel;
    }
    const tidligere = aktuel.unitbookingImporter[kladdeId];
    if (tidligere.status === "bekraeftet") {
      resultat = { ok: true, bookingIder: tidligere.bookingIder || [], gentaget: true };
      return aktuel;
    }
    const fra = isoTilUtcMs(renset.fraDato);
    const til = isoTilUtcMs(renset.tilDato);
    const klargoerSenest = renset.klargoerDato ? isoTilUtcMs(renset.klargoerDato) : null;
    const eksisterendeUdlaan = Object.entries(aktuel.kasseudlaan || {}).map(([id, u]) => ({ id, ...u }));
    const nye = {};
    for (let i = 0; i < renset.linjer.length; i += 1) {
      const linje = renset.linjer[i];
      const kasse = aktuel.kasser?.[linje.valgtKasseId];
      if (!kasse) { afvisning = { kode: "not-found", tekst: `Enheden ${linje.valgtKasseId} findes ikke.` }; return; }
      const vurdering = vurderKasse(linje, { id: linje.valgtKasseId, ...kasse }, [...eksisterendeUdlaan, ...Object.values(nye)], { fra, til });
      if (!vurdering.gyldig) {
        afvisning = { kode: "failed-precondition", tekst: `${linje.valgtKasseId}: ${vurdering.grund}` }; return;
      }
      const id = bookingIder[i];
      const booking = {
        kasseId: linje.valgtKasseId,
        sagsnummer: renset.eksternReference,
        beskrivelse: linje.objekt || renset.beskrivelse || null,
        fra, til,
        ...(klargoerSenest ? { klargoerSenest } : {}),
        tilstand: "booket",
        oprettetAf: uid,
        oprettetMs: nu,
        importKladdeId: kladdeId,
        importLinjeId: linje.id,
      };
      const bookingFejl = valideUdlaan(booking, { kasser: Object.keys(aktuel.kasser || {}) });
      if (Object.keys(bookingFejl).length) {
        afvisning = { kode: "invalid-argument", tekst: somBesked(bookingFejl) };
        return;
      }
      nye[id] = booking;
    }
    const ny = { ...aktuel };
    ny.kasseudlaan = { ...(aktuel.kasseudlaan || {}), ...nye };
    ny.unitbookingImporter = {
      ...aktuel.unitbookingImporter,
      [kladdeId]: {
        ...tidligere, kladde: renset, status: "bekraeftet",
        bookingIder, bekraeftetAf: uid, bekraeftetMs: nu,
        aendretAf: uid, aendretMs: nu,
      },
    };
    ny.unitbookingImportOperationer = {
      ...(aktuel.unitbookingImportOperationer || {}),
      [operationId]: { art: "bekraeft", kladdeId, payloadHash, bookingIder, tidspunktMs: nu, uid },
    };
    resultat = { ok: true, bookingIder, gentaget: false };
    return ny;
  });
  if (afvisning) throw new HttpsError(afvisning.kode, afvisning.tekst);
  if (!tx.committed || !resultat) throw new HttpsError("aborted", "En anden ændrede data. Opdatér og prøv igen.");
  if (!resultat.gentaget) {
    await logUdlaan(tenantId, uid, AUDIT.opret, kladdeId, null,
      { status: "bekraeftet" }, `${resultat.bookingIder.length} reservationer oprettet fra import`);
  }
  return resultat;
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

  const perms = permStrengFraClaims(auth.token);
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

async function kraevUnitlagerskriv(req, kilde) {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");
  if (!["unitbooking", "warehouse"].includes(kilde)) {
    throw new HttpsError("invalid-argument", "Vælg en gyldig modul-kilde.");
  }
  const db = getDatabase();
  const perms = permStrengFraClaims(auth.token);
  const permission = kilde === "warehouse" ? PERM.bevaegelserSkriv : PERM.kasseudlaanSkriv;
  if (typeof perms !== "string" || !perms.includes(`|${permission}|`)) {
    throw new HttpsError("permission-denied", `Kræver ${permission}.`);
  }
  const [ab, modul] = await Promise.all([
    db.ref(`tenants/${tenantId}/abonnement/status`).once("value"),
    db.ref(`tenants/${tenantId}/moduler/${kilde}`).once("value"),
  ]);
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  if (modul.exists() && modul.val() !== true) {
    throw new HttpsError("permission-denied", `${kilde === "warehouse" ? "WAREHOUSE" : "UNIT Booking"} er ikke slået til.`);
  }
  return { uid: auth.uid, tenantId, db };
}

/** Saldoposten som den ser ud efter en ændring — eller null hvis den ikke findes. */
const saldoAf = (snap) => (snap.exists() ? snap.val()?.antal ?? 0 : 0);

async function transaktionMedVarmTenantCache(tenantRef, callback) {
  let klar;
  let fejl;
  const vent = new Promise((resolve, reject) => { klar = resolve; fejl = reject; });
  const cacheKlar = () => klar();
  tenantRef.on("value", cacheKlar, fejl);
  await vent;
  try {
    return await tenantRef.transaction(callback);
  } finally {
    tenantRef.off("value", cacheKlar);
  }
}

export const unitlageropret = onCall({ region: REGION }, async (req) => {
  const d = req.data || {};
  const kilde = kortStreng(d.kilde, 20);
  if (kilde !== "warehouse") {
    throw new HttpsError("invalid-argument", "Unitoprettelse her tilhører WAREHOUSE.");
  }
  const { uid, tenantId, db } = await kraevUnitlagerskriv(req, kilde);
  const operationId = kortStreng(d.operationId, 80);
  const unitId = kortStreng(d.unitId, 30);
  const typeId = kortStreng(d.typeId, 30);
  const typeNavn = kortStreng(d.typeNavn, 60);
  const hjemPladsId = kortStreng(d.hjemPladsId, 80);
  const modtagelsesPladsId = kortStreng(d.modtagelsesPladsId, 80);
  const reference = kortStreng(d.reference, 60);
  const note = kortStreng(d.note, 300);
  const tidspunktMs = Date.now();
  const rod = db.ref(`tenants/${tenantId}`);
  let afvisning = null;
  let resultat = null;

  /* Admin SDK kan kalde en parent-transaction med tom lokal cache først.
     En før-læsning henter den autoritative tenant uden at flytte selve
     valideringen eller skrivningen ud af den atomiske transaktion. */
  const unitlagerOpretFoer = await rod.once("value");
  if (!unitlagerOpretFoer.exists()) {
    throw new HttpsError("not-found", "Virksomhedens lagerdata findes ikke.");
  }

  const tx = await transaktionMedVarmTenantCache(rod, (aktuel) => {
    afvisning = null;
    resultat = null;
    if (!aktuel) {
      afvisning = { kode: "not-found", tekst: "Virksomhedens lagerdata findes ikke." };
      return;
    }
    const eksisterendeEvent = aktuel.unitbevaegelser?.[operationId];
    if (eksisterendeEvent) {
      const sammenligning = sammenlignOperation(eksisterendeEvent, {
        operationId, unitId, art: "modtagelse", fraPladsId: null,
        tilPladsId: modtagelsesPladsId, bookingId: null,
        reference: reference || null, kilde: "warehouse",
      });
      if (sammenligning.art === "konflikt" || !aktuel.kasser?.[unitId]) {
        afvisning = { kode: "already-exists", tekst: "operationId er allerede brugt til en anden handling." };
        return;
      }
      resultat = {
        ok: true, gentaget: true,
        unit: { id: unitId, ...aktuel.kasser[unitId] },
        bevaegelse: eksisterendeEvent,
      };
      return aktuel;
    }
    if (!KASSE_ID_MOENSTER.test(unitId || "")) {
      afvisning = { kode: "invalid-argument", tekst: "Unit-id skal være 2–30 tegn med bogstaver, tal eller bindestreg." };
      return;
    }
    if (aktuel.kasser?.[unitId]) {
      afvisning = { kode: "already-exists", tekst: `Unitten ${unitId} findes allerede og er ikke oprettet igen.` };
      return;
    }
    if (!KASSE_ID_MOENSTER.test(typeId || "")) {
      afvisning = { kode: "invalid-argument", tekst: "Vælg en gyldig unittype." };
      return;
    }
    if (!aktuel.reolpladser?.[modtagelsesPladsId]) {
      afvisning = { kode: "not-found", tekst: "Modtagelsespladsen skal findes i virksomhedens lager." };
      return;
    }
    if (hjemPladsId && !aktuel.reolpladser?.[hjemPladsId]) {
      afvisning = { kode: "not-found", tekst: "Den foreslåede hjemplads findes ikke i virksomhedens lager." };
      return;
    }
    if (aktuel.reolpladser[modtagelsesPladsId]?.status === "lukket") {
      afvisning = { kode: "failed-precondition", tekst: "Modtagelseslokationen er lukket." };
      return;
    }
    const typeFindes = Boolean(aktuel.kassetyper?.[typeId]);
    if (!typeFindes && !typeNavn) {
      afvisning = { kode: "invalid-argument", tekst: "Navnet på den nye unittype mangler." };
      return;
    }
    const unit = {
      type: typeId, status: "ledig",
      pladsId: modtagelsesPladsId,
      ...(hjemPladsId ? { hjemPladsId } : {}),
      ...(note ? { note } : {}),
    };
    const fejl = valideKasse({ id: unitId, ...unit }, {
      typer: [...Object.keys(aktuel.kassetyper || {}), ...(typeFindes ? [] : [typeId])],
      pladser: Object.keys(aktuel.reolpladser || {}),
      katalog: [],
    });
    if (Object.keys(fejl).length) {
      afvisning = { kode: "invalid-argument", tekst: Object.values(fejl).join(" ") };
      return;
    }
    const bygget = bygWarehouseUnitbevaegelse({
      operationId, unitId, art: "modtagelse", fraPladsId: null,
      tilPladsId: modtagelsesPladsId, reference: reference || null,
      kilde: "warehouse", tidspunktMs, udfoertAf: uid,
    });
    if (!bygget.ok) {
      afvisning = { kode: "invalid-argument", tekst: Object.values(bygget.fejl).join(" ") };
      return;
    }
    const ny = { ...aktuel };
    if (!typeFindes) {
      ny.kassetyper = { ...(aktuel.kassetyper || {}), [typeId]: { navn: typeNavn } };
    }
    ny.kasser = { ...(aktuel.kasser || {}), [unitId]: unit };
    ny.unitbevaegelser = {
      ...(aktuel.unitbevaegelser || {}), [operationId]: bygget.bevaegelse,
    };
    resultat = { ok: true, gentaget: false, unit: { id: unitId, ...unit }, bevaegelse: bygget.bevaegelse };
    return ny;
  });

  if (afvisning) throw new HttpsError(afvisning.kode, afvisning.tekst);
  if (!tx.committed || !resultat) {
    throw new HttpsError("aborted", "En anden oprettede unitten samtidig. Opdatér og prøv igen.");
  }
  if (!resultat.gentaget) {
    await logBevaegelse(tenantId, uid, AUDIT.opret, operationId, null,
      { art: "modtagelse", status: "ledig" }, `${unitId}: oprettet og modtaget på ${modtagelsesPladsId}`);
  }
  return resultat;
});

/**
 * WAREHOUSEs selvstændige vej til den fælles fysiske unit.
 *
 * Hele tenant-roden er transaktionsgrænse med vilje: unit, bookingstatus og
 * append-only hændelse må ikke kunne lande hver for sig. UNIT Booking ejer
 * fortsat reservationen; WAREHOUSE må kun afslutte den ved en faktisk retur
 * med den konkrete bookingreference. En selvstændig udlevering afvises, hvis
 * den ellers ville omgå en bindende reservation.
 */
export const unitlagerhandling = onCall({ region: REGION }, async (req) => {
  const d = req.data || {};
  const kilde = kortStreng(d.kilde, 20);
  const { uid, tenantId, db } = await kraevUnitlagerskriv(req, kilde);
  const operationId = kortStreng(d.operationId, 80);
  const unitId = kortStreng(d.unitId, 30);
  const art = kortStreng(d.art, 20);
  const tilPladsId = art === "udlevering" ? null : kortStreng(d.tilPladsId, 80);
  const bookingId = kortStreng(d.bookingId, 60);
  const reference = kortStreng(d.reference, 60);
  const harForventetPlads = Object.prototype.hasOwnProperty.call(d, "forventetPladsId");
  const forventetPladsId = d.forventetPladsId == null ? null : kortStreng(d.forventetPladsId, 80);
  const tidspunktMs = Date.now();
  const rod = db.ref(`tenants/${tenantId}`);
  let afvisning = null;
  let resultat = null;

  /* Se unitlageropret: varm Admin SDK-cachen før parent-transactionen. */
  const unitlagerHandlingFoer = await rod.once("value");
  if (!unitlagerHandlingFoer.exists()) {
    throw new HttpsError("not-found", "Virksomhedens lagerdata findes ikke.");
  }

  const tx = await transaktionMedVarmTenantCache(rod, (aktuel) => {
    afvisning = null;
    resultat = null;
    if (!aktuel) {
      afvisning = { kode: "not-found", tekst: "Virksomhedens lagerdata findes ikke." };
      return;
    }

    const unit = aktuel.kasser?.[unitId];
    const eksisterende = aktuel.unitbevaegelser?.[operationId];
    if (eksisterende) {
      const foreslaaet = {
        operationId, unitId, art,
        // Gemt null er et vigtigt før-billede (fx en modtagelse fra "ude").
        // Den aktuelle placering er allerede ændret efter første gennemførsel.
        fraPladsId: eksisterende.fraPladsId ?? null,
        tilPladsId, bookingId: bookingId || null,
        // En bookingretur kan have fået sagsnummeret som server-afledt reference.
        // Et identisk retry uden en eksplicit reference skal derfor stadig genkendes.
        reference: reference || eksisterende.reference || null, kilde,
      };
      const sammenligning = sammenlignOperation(eksisterende, foreslaaet);
      if (sammenligning.art === "konflikt") {
        afvisning = { kode: "already-exists", tekst: sammenligning.besked };
        return;
      }
      resultat = { ok: true, gentaget: true, bevaegelse: eksisterende };
      return aktuel;
    }

    if (!unit) {
      afvisning = { kode: "not-found", tekst: `Unitten ${unitId || "(tom kode)"} findes ikke. Der er ikke oprettet noget.` };
      return;
    }
    if (tilPladsId && !aktuel.reolpladser?.[tilPladsId]) {
      afvisning = { kode: "not-found", tekst: "Den valgte lokation findes ikke i virksomheden." };
      return;
    }
    if (tilPladsId && aktuel.reolpladser[tilPladsId]?.status === "lukket") {
      afvisning = { kode: "failed-precondition", tekst: "Den valgte lokation er lukket og kan ikke modtage en unit." };
      return;
    }

    const fraPladsId = unit.pladsId || null;
    if (kilde === "warehouse" && (!harForventetPlads || forventetPladsId !== fraPladsId)) {
      afvisning = {
        kode: "aborted",
        tekst: "Unitten er flyttet siden opslaget. Opdatér QR-opslaget og prøv igen.",
      };
      return;
    }
    const fejl = valideUnitBevaegelse({
      operationId, unitId, art, fraPladsId, tilPladsId,
      bookingId: bookingId || null, reference: reference || null,
    }, {
      units: Object.keys(aktuel.kasser || {}),
      pladser: Object.keys(aktuel.reolpladser || {}),
    });
    if (Object.keys(fejl).length) {
      afvisning = {
        kode: "invalid-argument",
        tekst: Object.values(fejl).join(" "),
      };
      return;
    }

    if (["modtagelse", "retur"].includes(art) && fraPladsId) {
      afvisning = { kode: "already-exists", tekst: `Unitten står allerede på ${fraPladsId}. Der er ikke registreret en ekstra tilgang.` };
      return;
    }
    if (["flytning", "udlevering"].includes(art) && !fraPladsId) {
      afvisning = { kode: "failed-precondition", tekst: "Unitten har ingen registreret intern afgangslokation." };
      return;
    }
    if (art === "udlevering" && unit.status === "udeAfDrift") {
      afvisning = { kode: "failed-precondition", tekst: "En unit, der er ude af drift, kan ikke udleveres." };
      return;
    }
    if (kilde === "unitbooking" && ["udlevering", "retur"].includes(art)) {
      afvisning = {
        kode: "failed-precondition",
        tekst: "UNIT-udlevering og -retur skal ske fra bookingforløbet, så reservation og fysisk hændelse afsluttes samlet.",
      };
      return;
    }

    const bookinger = Object.entries(aktuel.kasseudlaan || {})
      .map(([id, booking]) => ({ id, ...booking }));
    const bindende = bindendeBookingerForUnit(bookinger, unitId);
    if (art === "udlevering" && bindende.length) {
      afvisning = {
        kode: "failed-precondition",
        tekst: `Unitten har ${bindende.length} aktiv reservation. Udlever den fra UNIT Booking, eller frigiv reservationen først.`,
      };
      return;
    }

    let booking = null;
    if (bookingId) {
      booking = aktuel.kasseudlaan?.[bookingId];
      if (!booking || booking.kasseId !== unitId) {
        afvisning = { kode: "not-found", tekst: "Bookingreferencen findes ikke på den scannede unit." };
        return;
      }
      if (art !== "retur" || booking.tilstand !== "udlaant") {
        afvisning = { kode: "failed-precondition", tekst: "Kun et faktisk udlånt bookingforløb kan modtages retur her." };
        return;
      }
    } else if (art === "retur" && bindende.some((b) => b.tilstand === "udlaant")) {
      afvisning = { kode: "failed-precondition", tekst: "Unitten er udlånt via UNIT Booking. Scan returen med bookingreferencen, så forløbet afsluttes samlet." };
      return;
    }

    const bygget = bygWarehouseUnitbevaegelse({
      operationId, unitId, art, fraPladsId, tilPladsId,
      bookingId: bookingId || null, reference: reference || booking?.sagsnummer || null,
      kilde, tidspunktMs, udfoertAf: uid,
    });
    if (!bygget.ok) {
      afvisning = { kode: "invalid-argument", tekst: Object.values(bygget.fejl).join(" ") };
      return;
    }

    const nyUnit = art === "udlevering"
      ? { ...unit, status: "udlaant", pladsId: null }
      : art === "flytning"
        ? { ...unit, pladsId: tilPladsId }
        : { ...unit, status: "ledig", pladsId: tilPladsId };
    const ny = { ...aktuel };
    ny.kasser = { ...(aktuel.kasser || {}), [unitId]: nyUnit };
    ny.unitbevaegelser = {
      ...(aktuel.unitbevaegelser || {}),
      [operationId]: bygget.bevaegelse,
    };
    if (booking) {
      ny.kasseudlaan = {
        ...(aktuel.kasseudlaan || {}),
        [bookingId]: { ...booking, tilstand: "returneret", returneretMs: tidspunktMs },
      };
    }
    resultat = {
      ok: true, gentaget: false,
      unit: { id: unitId, ...nyUnit },
      bevaegelse: bygget.bevaegelse,
      bookingId: booking ? bookingId : null,
    };
    return ny;
  });

  if (afvisning) throw new HttpsError(afvisning.kode, afvisning.tekst);
  if (!tx.committed || !resultat) {
    throw new HttpsError("aborted", "En anden ændrede unitten samtidig. Opdatér og prøv igen.");
  }
  if (!resultat.gentaget) {
    await logBevaegelse(tenantId, uid, AUDIT.aendre, operationId, null,
      { art, status: resultat.unit?.status },
      `${unitId}: ${art}${bookingId ? ` · booking ${bookingId}` : ""}`);
  }
  return resultat;
});

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
  post.ejerforhold = vareEjerforhold(vare);
  post.kundeId = post.ejerforhold === "kunde" ? vare.kundeId : null;

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
      ejerforhold: post.ejerforhold,
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

  const perms = permStrengFraClaims(auth.token);
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
  const perms = permStrengFraClaims(auth.token);
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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);
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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);
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

  const requestId = kortStreng(d.requestId, 100);
  if (requestId && !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) {
    throw new HttpsError("invalid-argument", "Indsendelsesreferencen er ikke gyldig.");
  }
  const ref = requestId ? rod.child(`indkoebsbehov/mobil-${requestId}`) : rod.child("indkoebsbehov").push();
  let eksisterende = null;
  const tx = await ref.transaction((current) => {
    if (current) { eksisterende = current; return; }
    return post;
  });
  if (!tx.committed) {
    if (eksisterende?.oprettetAf === uid && eksisterende?.vare === post.vare
      && Number(eksisterende?.antal || 0) === Number(post.antal || 0)
      && (eksisterende?.leverandoerId || "") === (post.leverandoerId || "")) {
      return { ok: true, id: ref.key, allerede: true };
    }
    throw new HttpsError("already-exists", "Indsendelsesreferencen er allerede brugt til et andet behov.");
  }
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
  const perms = permStrengFraClaims(auth.token);
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

  const requestId = kortStreng(d.requestId, 100);
  if (requestId && !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) {
    throw new HttpsError("invalid-argument", "Indsendelsesreferencen er ikke gyldig.");
  }
  let reservationRef = null;
  if (requestId) {
    reservationRef = rod.child(`procureMobilAnmodninger/${requestId}`);
    let eksisterende = null;
    const reservation = await reservationRef.transaction((current) => {
      if (current) { eksisterende = current; return; }
      return { status: "underBehandling", uid, leverandoerId, oprettetMs: Date.now() };
    });
    if (!reservation.committed) {
      if (eksisterende?.uid !== uid || eksisterende?.leverandoerId !== leverandoerId) {
        throw new HttpsError("already-exists", "Indsendelsesreferencen er allerede brugt til en anden bestilling.");
      }
      if (eksisterende?.status === "oprettet" && eksisterende?.ordreId) {
        const tidligere = await rod.child(`indkoebsordrer/${eksisterende.ordreId}`).once("value");
        if (tidligere.exists()) return { ok: true, id: tidligere.key, nummer: tidligere.val().nummer, allerede: true };
      }
      throw new HttpsError("aborted", "Bestillingen kan allerede være oprettet. Kontrollér Mine indkøb før et nyt forsøg.");
    }
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

  const ordreRef = requestId ? rod.child(`indkoebsordrer/mobil-${requestId}`) : rod.child("indkoebsordrer").push();
  const opdatering = { [sti(`indkoebsordrer/${ordreRef.key}`)]: ordre };
  for (const n of Object.keys(behovOpdatering)) {
    opdatering[n] = n.endsWith("/ordreId") ? ordreRef.key : behovOpdatering[n];
  }
  if (reservationRef) {
    opdatering[sti(`procureMobilAnmodninger/${requestId}`)] = {
      status: "oprettet", uid, leverandoerId, ordreId: ordreRef.key,
      nummer, oprettetMs: Date.now(),
    };
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
  const perms = permStrengFraClaims(auth.token);
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
  const perms = permStrengFraClaims(auth.token);

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

  const nu = Date.now();
  const opdatering = ordreOpdatering(ordre, til, {
    uid, nu, begrundelse, regler,
  });

  const stier = {};
  for (const [felt, vaerdi] of Object.entries(opdatering)) {
    stier[`tenants/${tenantId}/indkoebsordrer/${ordreId}/${felt}`] = vaerdi;
  }
  stier[`tenants/${tenantId}/indkoebsordrer/${ordreId}/historik/${nu}`] = {
    fra: ordre.status,
    til: opdatering.status,
    uid,
    ms: nu,
    ...(begrundelse ? { begrundelse } : {}),
  };
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
  const perms = permStrengFraClaims(auth.token);

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
  const sendRequestId = kortStreng(d.sendRequestId, 60);
  if (!sendRequestId || !erGyldigtSendRequestId(sendRequestId)) {
    throw new HttpsError("invalid-argument", "sendRequestId mangler eller er ugyldigt.");
  }

  const snap = await rod.child(`indkoebsordrer/${ordreId}`).once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Bestillingen findes ikke.");
  const ordre = { ...snap.val(), id: ordreId };

  /* Et retry med samme nøgle skal kunne læse sit endelige resultat EFTER at
     første kald har flyttet ordren til "sendt". Derfor ligger opslaget før
     statusgaten. Den efterfølgende transaction beskytter stadig to samtidige
     første kald, der begge når hertil mens ordren endnu er "godkendt". */
  const mailRef = rod.child(`indkoebsordrer/${ordreId}/mail/${sendRequestId}`);
  const tidligereMail = (await mailRef.once("value")).val();
  if (tidligereMail) {
    return {
      ordreId, mailStatus: tidligereMail.mailStatus || "anmodet", allerede: true,
      pdfSha256: tidligereMail.pdfSha256 || null,
      ordreRevision: tidligereMail.ordreRevision || null,
    };
  }

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

  const virksomhed = (await rod.child("virksomhed").once("value")).val() || {};
  const indhold = ordreMailIndhold(ordre, { leverandoer: lev, sprog, virksomhed });
  const emneOenske = saniterHeaderFelt(d.emne, 250);
  const emne = emneOenske && emneOenske.includes(ordre.nummer)
    ? emneOenske
    : saniterHeaderFelt(`${emneOenske || indhold.emne} · ${ordre.nummer}`, 250);
  const ledsagetekst = valideTekst(d.ledsagetekst) || "";
  /* Det fulde mailforslag fra den aktuelle klient indeholder allerede den
     serverberegnede faktureringsblok. Ældre klienter sender kun en kort
     ledsagetekst; dér tilføjes hele det kanoniske indhold. Serveren accepterer
     aldrig en tekst, hvor kundens fakturamail/PO-instruks er redigeret væk. */
  const tekst = valideTekst(ledsagetekst && ledsagetekst.includes(indhold.faktureringsblok)
    ? ledsagetekst
    : ledsagetekst ? `${ledsagetekst}\n\n${indhold.brodtekst}` : indhold.brodtekst);
  if (!tekst) throw new HttpsError("internal", "Mailindholdet kunne ikke bygges.");

  const cc = (kortStreng(d.cc, 500) || "").split(/[;,]/).map((mail) => mail.trim()).filter(Boolean);
  if (cc.some((mail) => !erGyldigMail(mail))) {
    throw new HttpsError("invalid-argument", "Cc indeholder en ugyldig mailadresse.");
  }

  /* Den arkiverede fil dannes FØR reservationen. Mailen får præcis de samme
     bytes som forhåndsvisningen og arkivet — ikke en ny rendering med samme
     indhold. En ændret revision kan derfor hverken snige sig ind i mailen
     eller overskrive en allerede godkendt PDF. */
  const pdf = await sikrOrdrePdf({ rod, tenantId, ordreId, ordre, leverandoer: lev, uid });

  /* ---- Idempotens: sendRequestId ER nøglen — Gate A, punkt 7 ------------ */
  const foreloebig = {
    ms: Date.now(), mailStatus: "anmodet", sprog, afsendtAf: uid,
    til: tilEmail, cc: cc.join(", ") || null, emne, tekst,
    ordreRevision: pdf.revision, pdfSha256: pdf.sha256,
    pdfStoragePath: pdf.storagePath, pdfStoerrelse: pdf.stoerrelse,
  };
  const trans = await mailRef.transaction((cur) => (cur === null ? foreloebig : undefined));
  if (!trans.committed) {
    /* Allerede anmodet/sendt/fejlet under dette sendRequestId. */
    const eksisterende = trans.snapshot.val();
    return {
      ordreId, mailStatus: eksisterende?.mailStatus || "anmodet", allerede: true,
      pdfSha256: eksisterende?.pdfSha256 || null,
      ordreRevision: eksisterende?.ordreRevision || null,
    };
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
  const resultat = await sendMail(MAIL_ADAPTER, {
    til: tilEmail, cc: cc.join(", ") || null, emne, tekst,
    attachments: [{
      filename: `${ordre.nummer}.pdf`, contentType: "application/pdf", bytes: pdf.bytes,
    }],
  });

  const opdateringer = {
    [`indkoebsordrer/${ordreId}/mail/${sendRequestId}/mailStatus`]: resultat.status,
  };
  if (resultat.providerId) {
    opdateringer[`indkoebsordrer/${ordreId}/mail/${sendRequestId}/providerId`] = resultat.providerId;
  }
  if (resultat.fejlAarsag) {
    opdateringer[`indkoebsordrer/${ordreId}/mail/${sendRequestId}/fejlAarsag`] = resultat.fejlAarsag;
  }
  if (resultat.afsender) {
    opdateringer[`indkoebsordrer/${ordreId}/mail/${sendRequestId}/afsender`] = resultat.afsender;
  }
  if (resultat.transportKvittering) {
    opdateringer[`indkoebsordrer/${ordreId}/mail/${sendRequestId}/transportBilagSha256`] = resultat.transportKvittering.attachmentSha256;
    opdateringer[`indkoebsordrer/${ordreId}/mail/${sendRequestId}/transportBilagStoerrelse`] = resultat.transportKvittering.attachmentSize;
    opdateringer[`indkoebsordrer/${ordreId}/mail/${sendRequestId}/transportBilagFilnavn`] = resultat.transportKvittering.attachmentName;
  }
  if (resultat.status === "accepteret") {
    opdateringer[`indkoebsordrer/${ordreId}/mail/${sendRequestId}/afsendtMs`] = Date.now();
    opdateringer[`indkoebsordrer/${ordreId}/sendtMail`] = {
      sendRequestId, til: tilEmail, cc: cc.join(", ") || null, emne, tekst,
      afsender: resultat.afsender || "Konfigureret serverafsender",
      afsendtMs: Date.now(), mailStatus: resultat.status,
      providerId: resultat.providerId || null, ordreRevision: pdf.revision,
      pdfSha256: pdf.sha256, pdfStoragePath: pdf.storagePath, pdfStoerrelse: pdf.stoerrelse,
      ...(resultat.transportKvittering ? { transportBilagSha256: resultat.transportKvittering.attachmentSha256, transportBilagStoerrelse: resultat.transportKvittering.attachmentSize } : {}),
    };
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

  if (resultat.status === "ukendt") {
    throw new HttpsError("aborted",
      "Mailudbyderen kan have modtaget ordren. Resultatet skal kontrolleres manuelt; ordren er ikke gensendt.");
  }
  if (resultat.status === "fejlet") {
    throw new HttpsError("internal", `Mailen kunne ikke sendes: ${resultat.fejlAarsag || "ukendt fejl"}.`);
  }

  return {
    ordreId, mailStatus: resultat.status, status: nyStatus,
    pdfSha256: pdf.sha256, ordreRevision: pdf.revision,
    transportBilagSha256: resultat.transportKvittering?.attachmentSha256 || null,
  };
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

  const perms = permStrengFraClaims(auth.token);
  const tilladtePerms = Array.isArray(perm) ? perm : (perm ? [perm] : []);
  if (tilladtePerms.length && !tilladtePerms.some((navn) => perms.includes(`|${navn}|`))) {
    throw new HttpsError("permission-denied", `Det kræver en af: ${tilladtePerms.join(", ")}.`);
  }

  const db = getDatabase();
  const rod = db.ref(`tenants/${tenantId}`);

  const findes = await rod.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const ab = await rod.child("abonnement/status").once("value");
  if (ab.exists() && ab.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }
  const tilladteModuler = Array.isArray(modul) ? modul : (modul ? [modul] : []);
  if (tilladteModuler.length) {
    const moduler = await rod.child("moduler").once("value");
    if (moduler.exists() && !tilladteModuler.some((navn) => moduler.child(navn).val() === true)) {
      throw new HttpsError("permission-denied", `Et af modulerne ${tilladteModuler.join(", ")} skal være aktivt.`);
    }
  }
  return { db, rod, tenantId, uid: auth.uid, perms };
}

/* ══════════════════════════════════════════════════════════════════════════
   FAKTURACENTER — Veyro-kontrol, ekstra kontrol og massehandling

   Fakturaens eksisterende `status` er betalings-/bogfoeringsstatus. Dette
   forloeb skriver kun `kontrol*`-felterne og kan derfor aldrig komme til at
   kalde et Veyro-arkiv for betalt eller bogfoert. Opsaetning, revision og
   idempotens ligger bag Admin SDK; ingen klient kan selv udpege sig som
   kontrollant eller omskrive historikken.
   ══════════════════════════════════════════════════════════════════════════ */

const kontrolFingeraftryk = (data) => createHash("sha256")
  .update(JSON.stringify(data)).digest("hex");

const kontrolHistorikId = (uid, requestId) => `h_${createHash("sha256")
  .update(`${uid}:${requestId}`).digest("hex").slice(0, 32)}`;

function fakturakontrolFejlkode(kode) {
  if (kode === "revisionskonflikt") return "aborted";
  if (["egen-godkendelse", "ikke-udpeget"].includes(kode)) return "permission-denied";
  if (["ugyldig-handling", "ugyldig-revision", "mangler-bruger", "mangler-begrundelse", "mangler-modul"].includes(kode)) {
    return "invalid-argument";
  }
  return "failed-precondition";
}

function validerKontrollanterITenant(tenantData, opsaetning) {
  for (const [modul, regel] of Object.entries(opsaetning.moduler || {})) {
    if (!regel.kontrollantUid) continue;
    const uid = regel.kontrollantUid;
    const bruger = tenantData?.brugere?.[uid];
    if (!bruger || bruger.spaerret === true) {
      return `Den valgte kontrollant for ${modul} findes ikke eller har et spærret login.`;
    }
    if (!permsForTenant(bruger.rolle, tenantData?.roller || {}).includes(PERM.fakturaerGodkend)) {
      return `Den valgte kontrollant for ${modul} har ikke ${PERM.fakturaerGodkend}.`;
    }
  }
  return null;
}

export const fakturacenterOpsaetningHent = onCall({ region: REGION }, async (req) => {
  const { rod } = await procureDoer(req, { perm: "fakturaer.laes" });
  const snap = await rod.child("fakturacenterOpsaetning").once("value");
  const gemt = snap.exists() ? snap.val() : STANDARD_FAKTURAKONTROL_OPSAETNING;
  return { opsaetning: { ...normaliserFakturakontrolOpsaetning(gemt), opdateretAf: gemt.opdateretAf || null, opdateretMs: gemt.opdateretMs || null } };
});

export const fakturacenterOpsaetningGem = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "brugere.skriv" });
  const forventetRevision = Number(req.data?.forventetRevision);
  const mutationId = kortStreng(req.data?.mutationId, 60);
  if (!Number.isSafeInteger(forventetRevision) || forventetRevision < 0
    || !mutationId || !erGyldigtSendRequestId(mutationId)) {
    throw new HttpsError("invalid-argument", "Forventet revision eller gemmereference er ugyldig.");
  }
  const valideret = validerFakturakontrolOpsaetning(req.data?.opsaetning || {});
  if (!valideret.ok) {
    throw new HttpsError("invalid-argument", Object.values(valideret.fejl)[0], { fejl: valideret.fejl });
  }
  const fingeraftryk = kontrolFingeraftryk({ forventetRevision, opsaetning: valideret.opsaetning });
  let afvist = null;
  let resultat = null;
  let gentaget = false;
  const nu = Date.now();
  /* Admin SDK kalder ellers transaction-callbacken med en kold lokal null
     før serverværdien er hentet. En null er her "ikke indlæst", ikke bevis
     for at tenanten mangler; varm roden op før den atomiske afgørelse. */
  const tenantFoerSnap = await rod.once("value");
  const tenantFoer = tenantFoerSnap.val();
  let koldCacheFallback = tenantFoerSnap.exists();
  const tx = await rod.transaction((tenantData) => {
    afvist = null; resultat = null; gentaget = false;
    if (!tenantData && koldCacheFallback) tenantData = structuredClone(tenantFoer);
    koldCacheFallback = false;
    if (!tenantData) { afvist = { kode: "not-found", besked: "Tenant findes ikke." }; return; }
    const nuvaerende = tenantData.fakturacenterOpsaetning || STANDARD_FAKTURAKONTROL_OPSAETNING;
    if (nuvaerende.sidsteMutationId === mutationId) {
      if (nuvaerende.sidsteMutationHash !== fingeraftryk) {
        afvist = { kode: "already-exists", besked: "Gemmereferencen er allerede brugt til en anden ændring." };
        return;
      }
      gentaget = true;
      resultat = nuvaerende;
      return tenantData;
    }
    const revision = Number(nuvaerende.revision || 0);
    if (revision !== forventetRevision) {
      afvist = { kode: "aborted", besked: "Opsætningen er ændret i en anden session. Genindlæs før du gemmer." };
      return;
    }
    const kontrollantFejl = validerKontrollanterITenant(tenantData, valideret.opsaetning);
    if (kontrollantFejl) {
      afvist = { kode: "failed-precondition", besked: kontrollantFejl };
      return;
    }
    resultat = {
      ...valideret.opsaetning,
      revision: revision + 1,
      opdateretAf: uid,
      opdateretMs: nu,
      sidsteMutationId: mutationId,
      sidsteMutationHash: fingeraftryk,
    };
    tenantData.fakturacenterOpsaetning = resultat;
    return tenantData;
  });
  if (!tx.committed || afvist) {
    throw new HttpsError(afvist?.kode || "aborted", afvist?.besked || "Opsætningen kunne ikke gemmes.");
  }
  if (!gentaget) {
    await logProcure(tenantId, uid, AUDIT.aendre, "fakturacenterOpsaetning", tenantId,
      null, { version: resultat.version, revision: resultat.revision }, "modulvise fakturagodkendelsesregler ændret");
  }
  return { opsaetning: normaliserFakturakontrolOpsaetning(resultat), gentaget };
});

async function udførFakturakontrol({ rod, tenantId, uid, fakturaId, handling,
  modul, forventetRevision, requestId, begrundelse }) {
  const kortFakturaId = kortStreng(fakturaId, 68);
  const kortRequestId = kortStreng(requestId, 60);
  const kortBegrundelse = kortStreng(begrundelse, 250);
  if (!kortFakturaId || !kortRequestId || !erGyldigtSendRequestId(kortRequestId)
    || !Number.isSafeInteger(forventetRevision) || forventetRevision < 0) {
    throw new HttpsError("invalid-argument", "Faktura, revision eller handlingsreference er ugyldig.");
  }
  const fingeraftryk = kontrolFingeraftryk({
    fakturaId: kortFakturaId, handling, modul: modul || null,
    forventetRevision, begrundelse: kortBegrundelse || null,
  });
  const operationId = kontrolHistorikId(uid, kortRequestId);
  let afvist = null;
  let resultat = null;
  let gentaget = false;
  const nu = Date.now();
  const tenantFoerSnap = await rod.once("value");
  const tenantFoer = tenantFoerSnap.val();
  let koldCacheFallback = tenantFoerSnap.exists();
  const tx = await rod.transaction((tenantData) => {
    afvist = null; resultat = null; gentaget = false;
    if (!tenantData && koldCacheFallback) tenantData = structuredClone(tenantFoer);
    koldCacheFallback = false;
    if (!tenantData) { afvist = { kode: "not-found", besked: "Tenant findes ikke." }; return; }
    tenantData.fakturacenterKontrolOperationer = tenantData.fakturacenterKontrolOperationer || {};
    tenantData.fakturacenterKontrolOperationer[uid] = tenantData.fakturacenterKontrolOperationer[uid] || {};
    const tidligere = tenantData.fakturacenterKontrolOperationer[uid][kortRequestId];
    if (tidligere) {
      if (tidligere.fingeraftryk !== fingeraftryk) {
        afvist = { kode: "already-exists", besked: "Handlingsreferencen er allerede brugt til en anden handling." };
        return;
      }
      gentaget = true;
      resultat = tidligere.resultat;
      return tenantData;
    }
    const faktura = tenantData.fakturaer?.[kortFakturaId];
    if (!faktura) { afvist = { kode: "not-found", besked: "Fakturaen findes ikke." }; return; }
    const opsaetning = tenantData.fakturacenterOpsaetning || STANDARD_FAKTURAKONTROL_OPSAETNING;
    const vurdering = vurderFakturakontrol({
      faktura, opsaetning, handling, uid, modul,
      forventetRevision, begrundelse: kortBegrundelse,
    });
    if (!vurdering.ok) {
      afvist = { kode: fakturakontrolFejlkode(vurdering.kode), besked: vurdering.besked, detalje: vurdering.kode };
      return;
    }
    const ændring = anvendFakturakontrol({
      faktura, opsaetning, handling, uid, modul: vurdering.modul || modul,
      nu, operationId, begrundelse: kortBegrundelse,
    });
    ændring.faktura.kontrolHistorik = ændring.faktura.kontrolHistorik || {};
    ændring.faktura.kontrolHistorik[operationId] = ændring.historik;
    tenantData.fakturaer[kortFakturaId] = ændring.faktura;
    resultat = {
      ok: true, fakturaId: kortFakturaId, status: ændring.status, revision: ændring.revision,
      modulKontroller: ændring.faktura.modulKontroller || {},
    };
    tenantData.fakturacenterKontrolOperationer[uid][kortRequestId] = {
      fingeraftryk,
      fakturaId: kortFakturaId,
      handling,
      oprettetMs: nu,
      resultat,
    };
    return tenantData;
  });
  if (!tx.committed || afvist) {
    const fejl = new HttpsError(afvist?.kode || "aborted", afvist?.besked || "Kontrollen kunne ikke gennemføres.",
      afvist?.detalje ? { kode: afvist.detalje, fakturaId: kortFakturaId } : undefined);
    throw fejl;
  }
  if (!gentaget) {
    await logProcure(tenantId, uid, AUDIT.aendre, "fakturaer", kortFakturaId,
      null, { status: resultat.status, revision: resultat.revision }, `Veyro-kontrol: ${handling}`);
  }
  return { ...resultat, gentaget };
}

export const fakturakontrolUdfoer = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "fakturaer.godkend" });
  return udførFakturakontrol({
    rod, tenantId, uid,
    fakturaId: req.data?.fakturaId,
    handling: req.data?.handling,
    forventetRevision: Number(req.data?.forventetRevision),
    requestId: req.data?.requestId,
    begrundelse: req.data?.begrundelse,
    modul: kortStreng(req.data?.modul, 16) || undefined,
  });
});

export const fakturakontrolMasse = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "fakturaer.godkend" });
  const requestId = kortStreng(req.data?.requestId, 60);
  const poster = Array.isArray(req.data?.poster) ? req.data.poster : [];
  if (!requestId || !erGyldigtSendRequestId(requestId) || poster.length === 0 || poster.length > 100) {
    throw new HttpsError("invalid-argument", "Massehandlingen skal have 1-100 fakturaer og en gyldig reference.");
  }
  const set = new Set();
  const resultater = [];
  for (const post of poster) {
    const fakturaId = kortStreng(post?.fakturaId, 68);
    if (!fakturaId || set.has(fakturaId)) {
      resultater.push({ ok: false, fakturaId: fakturaId || null, kode: "dublet", besked: "Fakturaen er valgt mere end én gang eller mangler id." });
      continue;
    }
    set.add(fakturaId);
    const enkeltRequestId = `m_${kontrolFingeraftryk({ requestId, fakturaId }).slice(0, 40)}`;
    try {
      resultater.push(await udførFakturakontrol({
        rod, tenantId, uid, fakturaId,
        handling: FAKTURAKONTROL_HANDLING.kontroller,
        forventetRevision: Number(post?.forventetRevision),
        requestId: enkeltRequestId,
      }));
    } catch (fejl) {
      resultater.push({
        ok: false,
        fakturaId,
        kode: String(fejl?.details?.kode || fejl?.code || "fejl").replace(/^functions\//, ""),
        besked: fejl?.message || "Fakturaen kunne ikke kontrolleres.",
      });
    }
  }
  return {
    ok: resultater.every((post) => post.ok),
    antal: resultater.length,
    gennemfoert: resultater.filter((post) => post.ok).length,
    blokeret: resultater.filter((post) => !post.ok).length,
    resultater,
  };
});

/* SERVERGEMT MOBILKLADDE OG LINJEGODKENDELSE (PROCURE næste runde).
   Kladden er brugerbundet under den signerede tenant. Alle ændringer bærer
   forventet revision og stabil request-id, så to faner/offline-retries ikke
   kan overskrive eller indsende de samme mængder to gange. */
const mobilKladdeRef = (rod, uid) => rod.child(`procureMobilKladder/${uid}/aktiv`);

export const procureMobilKladdeHent = onCall({ region: REGION }, async (req) => {
  const { rod, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const snap = await mobilKladdeRef(rod, uid).once("value");
  return { draft: snap.exists() ? snap.val() : null };
});

export const procureMobilKladdeGem = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const expectedRevision = Number(req.data?.expectedRevision ?? 0);
  const mutationId = kortStreng(req.data?.mutationId, 100);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || !mutationId || !erGyldigtSendRequestId(mutationId)) {
    throw new HttpsError("invalid-argument", "Forventet revision eller gemmereference er ugyldig.");
  }
  const validatedDraft = sanitizeMobileDraft(req.data?.draft || {}, { uid, now: Date.now(), revision: expectedRevision + 1 });
  for (const [type, id, label] of [
    ["afdelinger", validatedDraft.departmentId, "Afdelingen"],
    ["leveringssteder", validatedDraft.deliveryLocationId, "Leveringsstedet"],
  ]) {
    if (!id) continue;
    const master = await rod.child(`procureOpsaetning/${type}/${id}`).once("value");
    if (!master.exists() || master.val()?.active === false) throw new HttpsError("failed-precondition", `${label} findes ikke eller er deaktiveret.`);
  }
  for (const departmentId of new Set(Object.values(validatedDraft.lineDepartments || {}))) {
    const department = await rod.child(`procureOpsaetning/afdelinger/${departmentId}`).once("value");
    if (!department.exists() || department.val()?.active === false) throw new HttpsError("failed-precondition", "En varelinje peger på en ukendt eller deaktiveret afdeling.");
  }
  const ref = mobilKladdeRef(rod, uid);
  let duplicate = false; let conflict = false;
  const now = Date.now();
  await ref.once("value");
  const tx = await ref.transaction((current) => {
    duplicate = false; conflict = false;
    const revision = Number(current?.revision || 0);
    if (current?.lastMutationId === mutationId) { duplicate = true; return current; }
    if (revision !== expectedRevision) { conflict = true; return current; }
    return { ...sanitizeMobileDraft(validatedDraft, { uid, now, revision: revision + 1 }), lastMutationId: mutationId, submissions: current?.submissions || {} };
  });
  if (!tx.committed || conflict) {
    const current = (await ref.once("value")).val();
    throw new HttpsError("aborted", "Kladden er ændret i en anden session. Genindlæs før du gemmer igen.", { current });
  }
  await logProcure(tenantId, uid, AUDIT.aendre, "procureMobilKladde", uid, null,
    { status: "gemt", revision: tx.snapshot.val().revision }, duplicate ? "gentaget gem — ingen dublet" : "mobilkladde servergemt");
  return { draft: tx.snapshot.val(), duplicate };
});

export const procureMobilKladdeDelIndsend = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const expectedRevision = Number(req.data?.expectedRevision);
  const requestId = kortStreng(req.data?.requestId, 100);
  const selections = Array.isArray(req.data?.selections) ? req.data.selections.slice(0, 100) : [];
  if (!Number.isInteger(expectedRevision) || !requestId || !erGyldigtSendRequestId(requestId)) throw new HttpsError("invalid-argument", "Revision eller indsendelsesreference er ugyldig.");
  const ref = mobilKladdeRef(rod, uid);
  const beforeSnap = await ref.once("value");
  if (!beforeSnap.exists()) throw new HttpsError("failed-precondition", "Der er ingen servergemt kladde.");
  const before = beforeSnap.val();
  const split = splitServerDraft(before, selections);
  if (!split.ok) throw new HttpsError("invalid-argument", Object.values(split.errors)[0]);
  const [catalogSnap, departmentsSnap] = await Promise.all([rod.child("forbrugsvarer").once("value"), rod.child("procureOpsaetning/afdelinger").once("value")]);
  const catalog = catalogSnap.val() || {}; const departments = departmentsSnap.val() || {};
  const fullBasisOere = Object.entries(before.items || {}).reduce((sum, [id, quantity]) => {
    const item = catalog[id] || {};
    const unitPrice = Number(item.bestillingsprisOere ?? item.indkoebsprisOere ?? 0);
    return sum + Number(quantity || 0) * (Number.isInteger(unitPrice) ? unitPrice : 0);
  }, 0);
  const lines = {};
  for (const row of split.submitted) {
    const item = row.custom ? row : catalog[row.id];
    if (!item) throw new HttpsError("not-found", `Varen ${row.id} findes ikke længere.`);
    const department = departments[row.departmentId];
    if (!department || department.active === false) throw new HttpsError("failed-precondition", `${item.navn || item.name}: vælg en aktiv afdeling.`);
    const lineId = `line-${createHash("sha256").update(`${requestId}:${row.id}`).digest("hex").slice(0, 16)}`;
    const unitsPerOrder = Number(item.antalPrBestillingsenhed || item.unitsPerOrder || 1);
    const orderUnit = kortStreng(item.bestillingsenhed || item.orderUnit || item.enhed || item.unit || "stk.", 30);
    const baseUnit = kortStreng(item.grundenhed || item.baseUnit || item.enhed || item.unit || orderUnit, 30);
    const unitPriceOere = Number(item.bestillingsprisOere ?? item.orderPriceOere ?? item.indkoebsprisOere ?? item.unitPriceOere ?? 0);
    lines[lineId] = {
      id: lineId, sourceDraftLineId: row.id, itemId: row.custom ? null : row.id,
      name: kortStreng(item.navn || item.name, 200), sku: kortStreng(item.varenummer || item.sku, 80),
      supplierId: kortStreng(item.leverandoerId || item.supplierId, 80) || null,
      categorySnapshot: kortStreng(item.varegruppe || item.category || "Ukategoriseret", 100),
      requestedQuantity: row.quantity, approvedQuantity: 0, orderedApprovedQuantity: 0,
      rejectedQuantity: 0, pendingQuantity: row.quantity, orderUnit, baseUnit,
      unitsPerOrder: Number.isFinite(unitsPerOrder) && unitsPerOrder > 0 ? unitsPerOrder : 1,
      unitPriceOere: Number.isInteger(unitPriceOere) ? unitPriceOere : 0,
      departmentId: row.departmentId, department: department.label,
    };
  }
  const submittedDepartments = [...new Set(Object.values(lines).map((line) => line.departmentId))];
  const approvalId = `approval-${createHash("sha256").update(`${tenantId}:${uid}:${requestId}`).digest("hex").slice(0, 24)}`;
  const publicReference = `IND-${new Date().getUTCFullYear()}-${createHash("sha256").update(approvalId).digest("hex").slice(0, 6).toUpperCase()}`;
  let duplicate = false; let conflict = false;
  const now = Date.now();
  const tx = await ref.transaction((current) => {
    duplicate = false; conflict = false;
    if (current?.submissions?.[requestId]) { duplicate = true; return current; }
    if (Number(current?.revision || 0) !== expectedRevision) { conflict = true; return current; }
    const currentSplit = splitServerDraft(current, selections);
    if (!currentSplit.ok) return;
    return { ...currentSplit.draft, revision: expectedRevision + 1, updatedAt: now, updatedBy: uid,
      submissions: { ...(current.submissions || {}), [requestId]: { approvalId, submittedAt: now, lineCount: Object.keys(lines).length } } };
  });
  if (!tx.committed || conflict) throw new HttpsError("aborted", "Kladden er ændret i en anden session. Ingen linjer er indsendt.", { current: (await ref.once("value")).val() });
  const approvalRef = rod.child(`procureGodkendelsessager/${approvalId}`);
  const approvalTx = await approvalRef.transaction((current) => current || {
    id: approvalId, reference: publicReference, status: "pending", revision: 1, sourceDraftUid: uid, sourceRequestId: requestId,
    departmentId: submittedDepartments.length === 1 ? submittedDepartments[0] : null,
    department: submittedDepartments.length === 1 ? departments[submittedDepartments[0]]?.label : "Flere afdelinger",
    deliveryLocationId: before.deliveryLocationId || null, deliveryLocation: before.deliveryLocation || null,
    wantedDate: before.wantedDate || null, asSoonAsPossible: Boolean(before.asSoonAsPossible),
    approvalBasisOere: fullBasisOere, lines, submittedBy: uid, submittedAt: now,
    history: { [`${now}-submitted`]: { at: now, actorId: uid, action: "submitted", quantity: Object.keys(lines).length } },
  });
  await logProcure(tenantId, uid, AUDIT.opret, "procureGodkendelsessag", approvalId, null,
    { status: "pending", approvalBasisOere: fullBasisOere }, duplicate || !approvalTx.committed ? "gentaget delindsendelse — ingen dublet" : "valgte linjer sendt til godkendelse");
  return { ok: true, approvalId, reference: approvalTx.snapshot.val()?.reference || publicReference, draft: tx.snapshot.val(), duplicate, submittedLines: Object.keys(lines).length };
});

export const procureGodkendelseslinjerAfgor = onCall({ region: REGION }, async (req) => {
  const { db, rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.godkend", modul: "indkoeb" });
  const approvalId = kortStreng(req.data?.approvalId, 80);
  const requestId = kortStreng(req.data?.requestId, 100);
  const expectedRevision = Number(req.data?.expectedRevision);
  const decisions = Array.isArray(req.data?.decisions) ? req.data.decisions.slice(0, 100) : [];
  if (!approvalId || !requestId || !erGyldigtSendRequestId(requestId) || !Number.isInteger(expectedRevision)) throw new HttpsError("invalid-argument", "Godkendelsessag, revision eller afgørelsesreference mangler.");
  const ref = rod.child(`procureGodkendelsessager/${approvalId}`);
  let result = null; let duplicate = false; let conflict = false;
  const now = Date.now();
  const tx = await ref.transaction((current) => {
    duplicate = false; conflict = false;
    if (!current) return current;
    if (current.decisionRequests?.[requestId]) { duplicate = true; result = current.decisionRequests[requestId]; return current; }
    if (Number(current.revision || 0) !== expectedRevision || current.processingRequestId) { conflict = true; return current; }
    const decided = decideServerApproval(current, decisions, { uid, now });
    if (!decided.ok) { result = decided; return; }
    result = decided;
    return { ...current, lines: decided.lines, history: decided.history, status: decided.status,
      revision: expectedRevision + 1, processingRequestId: requestId, updatedAt: now, updatedBy: uid };
  });
  if (!tx.committed || conflict) throw new HttpsError("aborted", "Godkendelsen er ændret i en anden session. Genindlæs før en ny afgørelse.", { current: (await ref.once("value")).val() });
  if (duplicate) return { ok: true, duplicate: true, ...(result || {}) };
  if (!result?.ok) throw new HttpsError("invalid-argument", Object.values(result?.errors || {})[0] || "Linjeafgørelsen er ugyldig.");
  const godkendelsessag = tx.snapshot.val();
  const [bestillerSnap, leveringsstedSnap] = await Promise.all([
    godkendelsessag.submittedBy ? rod.child(`brugere/${godkendelsessag.submittedBy}`).once("value") : Promise.resolve(null),
    godkendelsessag.deliveryLocationId ? rod.child(`procureOpsaetning/leveringssteder/${godkendelsessag.deliveryLocationId}`).once("value") : Promise.resolve(null),
  ]);
  const bestillerSnapshot = bestillerSnap?.val?.() || {};
  const leveringsstedSnapshot = leveringsstedSnap?.val?.() || {};
  const groups = new Map();
  for (const line of result.approvedOrderLines) {
    if (!line.supplierId) continue;
    if (!groups.has(line.supplierId)) groups.set(line.supplierId, []);
    groups.get(line.supplierId).push(line);
  }
  const updates = {}; const orders = [];
  for (const [supplierId, approvedLines] of groups) {
    const supplier = await rod.child(`leverandoerer/${supplierId}`).once("value");
    if (!supplier.exists()) continue;
    const nummer = await naesteNummer(db, (p) => `tenants/${tenantId}/${p}`, { praefiks: ORDRE_PRAEFIKS, serie: ORDRESERIE });
    const orderId = `approved-${createHash("sha256").update(`${approvalId}:${requestId}:${supplierId}`).digest("hex").slice(0, 24)}`;
    const orderLines = {};
    approvedLines.forEach((line, index) => { orderLines[`l-${index + 1}`] = {
      vare: line.name, vareId: line.itemId || null, varenummer: line.sku || null,
      antal: line.quantity, enhed: line.orderUnit, grundenhed: line.baseUnit,
      antalPrBestillingsenhed: line.unitsPerOrder, prisPrEnhedOere: line.unitPriceOere,
      varegruppe: line.categorySnapshot, kildeGodkendelseslinjeId: line.id,
      afdelingId: line.departmentId || null, afdeling: line.department || null,
      oprindeligtAnmodetAntal: line.requestedQuantity,
    }; });
    updates[`tenants/${tenantId}/indkoebsordrer/${orderId}`] = {
      nummer, leverandoerId: supplierId, status: "godkendt", revision: 1, godkendtRevision: 1,
      oprettetAf: tx.snapshot.val().submittedBy, oprettetMs: now, godkendtAf: uid, godkendtMs: now,
      godkendelsesgrundlagOere: tx.snapshot.val().approvalBasisOere, godkendelsessagId: approvalId,
      afdelingId: tx.snapshot.val().departmentId || null, afdeling: tx.snapshot.val().department || null,
      leveringsstedId: tx.snapshot.val().deliveryLocationId || null, leveringssted: tx.snapshot.val().deliveryLocation || null,
      leveringsadresse: leveringsstedSnapshot.adresse || leveringsstedSnapshot.address || null,
      leveringspostnr: leveringsstedSnapshot.postnr || leveringsstedSnapshot.postalCode || null,
      leveringsby: leveringsstedSnapshot.by || leveringsstedSnapshot.city || null,
      bestillerNavn: bestillerSnapshot.navn || bestillerSnapshot.name || null,
      bestillerEmail: bestillerSnapshot.email || null,
      oensketDato: tx.snapshot.val().wantedDate || null, hurtigstMuligt: Boolean(tx.snapshot.val().asSoonAsPossible),
      linjer: orderLines,
    };
    orders.push({ id: orderId, nummer, supplierId, lineCount: approvedLines.length });
    approvedLines.forEach((line) => { result.lines[line.id].orderedApprovedQuantity = Number(result.lines[line.id].orderedApprovedQuantity || 0) + line.quantity; });
  }
  const finished = { ...tx.snapshot.val(), lines: result.lines, processingRequestId: null,
    decisionRequests: { ...(tx.snapshot.val().decisionRequests || {}), [requestId]: { at: now, orders, status: result.status } } };
  updates[`tenants/${tenantId}/procureGodkendelsessager/${approvalId}`] = finished;
  await db.ref().update(updates);
  await logProcure(tenantId, uid, AUDIT.tilstandsskift, "procureGodkendelsessag", approvalId, null,
    { status: result.status, approvalBasisOere: finished.approvalBasisOere }, `linjeafgørelse; ${orders.length} leverandørordrer oprettet`);
  return { ok: true, duplicate: false, status: result.status, orders, revision: finished.revision };
});

const PROCURE_STAMDATA_TYPER = ["afdelinger", "varekategorier", "leveringssteder", "lagre", "lagerplaceringer"];

export const procureOpsaetningHent = onCall({ region: REGION }, async (req) => {
  const { rod } = await procureDoer(req, { perm: "indkoeb.laes", modul: "indkoeb" });
  const snap = await rod.child("procureOpsaetning").once("value");
  return { setup: snap.val() || { afdelinger: {}, varekategorier: {}, leveringssteder: {}, lagre: {}, lagerplaceringer: {}, budgetter: {} } };
});

export const procureStamdataGem = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "brugere.skriv", modul: "indkoeb" });
  const type = kortStreng(req.data?.type, 30); const id = kortStreng(req.data?.id, 80);
  const label = kortStreng(req.data?.label, 120); const active = req.data?.active !== false;
  const adresse = kortStreng(req.data?.adresse, 160); const postnr = kortStreng(req.data?.postnr, 20); const by = kortStreng(req.data?.by, 80);
  const lagerId = kortStreng(req.data?.lagerId, 60);
  const expectedRevision = Number(req.data?.expectedRevision || 0);
  if (!PROCURE_STAMDATA_TYPER.includes(type) || !/^[A-Za-z0-9_-]{2,80}$/.test(id) || !label || !Number.isInteger(expectedRevision)) throw new HttpsError("invalid-argument", "Type, stabilt id, navn eller revision er ugyldig.");
  if (type === "leveringssteder" && (!adresse || !postnr || !by)) throw new HttpsError("invalid-argument", "Et leveringssted skal have adresse, postnummer og by.");
  if (type === "lagerplaceringer") {
    if (!lagerId) throw new HttpsError("invalid-argument", "Vælg lager for placeringen.");
    const warehouse = await rod.child(`procureOpsaetning/lagre/${lagerId}`).once("value");
    if (!warehouse.exists() || warehouse.val().active === false) throw new HttpsError("invalid-argument", "Det valgte lager findes ikke eller er deaktiveret.");
  }
  const ref = rod.child(`procureOpsaetning/${type}/${id}`); let conflict = false; const now = Date.now();
  await ref.once("value");
  const tx = await ref.transaction((current) => {
    conflict = false;
    if (Number(current?.revision || 0) !== expectedRevision) { conflict = true; return current; }
    return { id, label, active, ...(type === "leveringssteder" ? { adresse, postnr, by } : {}), ...(type === "lagerplaceringer" ? { lagerId } : {}), revision: expectedRevision + 1, createdAt: current?.createdAt || now, createdBy: current?.createdBy || uid, updatedAt: now, updatedBy: uid,
      history: { ...(current?.history || {}), [`${now}`]: { at: now, actorId: uid, label, active, ...(type === "leveringssteder" ? { adresse, postnr, by } : {}), ...(type === "lagerplaceringer" ? { lagerId } : {}) } } };
  });
  if (!tx.committed || conflict) throw new HttpsError("aborted", "Stamdata er ændret af en anden administrator.", { current: (await ref.once("value")).val() });
  await logProcure(tenantId, uid, AUDIT.aendre, `procure-${type}`, id, null, { status: active ? "aktiv" : "deaktiveret" }, "PROCURE-stamdata ændret med historik");
  return { item: tx.snapshot.val() };
});

export const procureBudgetGem = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "brugere.skriv", modul: "indkoeb" });
  const period = kortStreng(req.data?.period, 7); const departmentId = kortStreng(req.data?.departmentId, 80);
  const amountOere = req.data?.amountOere; const expectedRevision = Number(req.data?.expectedRevision || 0);
  if (!/^\d{4}-\d{2}$/.test(period) || !departmentId || !Number.isInteger(amountOere) || amountOere < 0 || !Number.isInteger(expectedRevision)) throw new HttpsError("invalid-argument", "Periode, afdeling, beløb eller revision er ugyldig.");
  const department = await rod.child(`procureOpsaetning/afdelinger/${departmentId}`).once("value");
  if (!department.exists() || department.val().active === false) throw new HttpsError("failed-precondition", "Budgettet kræver en aktiv afdeling.");
  const ref = rod.child(`procureOpsaetning/budgetter/${period}/${departmentId}`); let conflict = false; const now = Date.now();
  await ref.once("value");
  const tx = await ref.transaction((current) => {
    conflict = false;
    if (Number(current?.revision || 0) !== expectedRevision) { conflict = true; return current; }
    return { departmentId, period, amountOere, currency: "DKK", revision: expectedRevision + 1, updatedAt: now, updatedBy: uid,
      history: { ...(current?.history || {}), [`${now}`]: { at: now, actorId: uid, amountOere } } };
  });
  if (!tx.committed || conflict) throw new HttpsError("aborted", "Budgettet er ændret af en anden administrator.", { current: (await ref.once("value")).val() });
  await logProcure(tenantId, uid, AUDIT.aendre, "procureBudget", `${period}:${departmentId}`, null, { budgetOere: amountOere }, "afdelingsbudget ændret");
  return { budget: tx.snapshot.val() };
});

/* QR-HYLDEMAERKATER — QR'en bærer kun denne stabile, ugættede reference.
   Tenant, vare, pris og adgang kommer altid fra den signerede session og
   det aktuelle katalog. Et mærkat er derfor ikke en adgangsbillet. */
const gyldigtQrId = (value) => /^qr-[a-zA-Z0-9_-]{8,60}$/.test(String(value || ""));

export const procureQrMaerkatOpret = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const vareId = kortStreng(req.data?.vareId, 80);
  const placering = kortStreng(req.data?.placering, 120);
  const requestId = kortStreng(req.data?.requestId, 80);
  if (!vareId || !placering || !requestId || !erGyldigtSendRequestId(requestId)) {
    throw new HttpsError("invalid-argument", "Vare, placering eller stabil anmodningsreference mangler.");
  }
  const vareSnap = await rod.child(`forbrugsvarer/${vareId}`).once("value");
  if (!vareSnap.exists()) throw new HttpsError("not-found", "Varen findes ikke i denne tenant.");
  if (vareSnap.val().aktiv === false) throw new HttpsError("failed-precondition", "Varen er deaktiveret.");
  const maerkatId = `qr-${createHash("sha256").update(`${tenantId}:${requestId}`).digest("hex").slice(0, 24)}`;
  const ref = rod.child(`procureQrMaerkater/${maerkatId}`);
  let allerede = false;
  const now = Date.now();
  const tx = await ref.transaction((current) => {
    if (current) {
      if (current.anmodningsnoegle === requestId && current.forbrugsvareId === vareId && current.placering === placering) { allerede = true; return current; }
      return;
    }
    return { forbrugsvareId: vareId, placering, aktiv: true, anmodningsnoegle: requestId, oprettetAf: uid, oprettetMs: now, aendretAf: uid, aendretMs: now };
  });
  if (!tx.committed) throw new HttpsError("already-exists", "Anmodningsreferencen er allerede brugt til et andet mærkat.");
  await logProcure(tenantId, uid, AUDIT.opret, "procureQrMaerkat", maerkatId, null,
    { status: "aktiv" }, allerede ? "gentaget kald — intet ekstra mærkat" : "QR-hyldemærkat oprettet");
  return { ok: true, maerkatId, allerede };
});

export const procureQrMaerkatStatus = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const maerkatId = kortStreng(req.data?.maerkatId, 80);
  const aktiv = req.data?.aktiv;
  if (!gyldigtQrId(maerkatId) || typeof aktiv !== "boolean") throw new HttpsError("invalid-argument", "Mærkat eller status er ugyldig.");
  const ref = rod.child(`procureQrMaerkater/${maerkatId}`);
  const before = await ref.once("value");
  if (!before.exists()) throw new HttpsError("not-found", "QR-mærkatet findes ikke.");
  await ref.update({ aktiv, aendretAf: uid, aendretMs: Date.now() });
  await logProcure(tenantId, uid, AUDIT.tilstandsskift, "procureQrMaerkat", maerkatId,
    { status: before.val().aktiv === false ? "deaktiveret" : "aktiv" }, { status: aktiv ? "aktiv" : "deaktiveret" }, "QR-mærkatstatus ændret");
  return { ok: true, maerkatId, aktiv };
});

export const procureQrMaerkatListe = onCall({ region: REGION }, async (req) => {
  const { rod } = await procureDoer(req, { perm: "indkoeb.laes", modul: "indkoeb" });
  const snap = await rod.child("procureQrMaerkater").orderByChild("aendretMs").limitToLast(500).once("value");
  const maerkater = [];
  snap.forEach((child) => {
    const row = child.val();
    maerkater.push({ id: child.key, itemId: row.forbrugsvareId, location: row.placering, active: row.aktiv !== false, changedAt: row.aendretMs });
  });
  maerkater.sort((a, b) => Number(b.changedAt || 0) - Number(a.changedAt || 0) || a.id.localeCompare(b.id));
  return { maerkater };
});

export const procureQrMaerkatHent = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.laes", modul: "indkoeb" });
  const maerkatId = kortStreng(req.data?.maerkatId, 80);
  if (!gyldigtQrId(maerkatId)) throw new HttpsError("not-found", "QR-mærkatet er ukendt.");
  const snap = await rod.child(`procureQrMaerkater/${maerkatId}`).once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "QR-mærkatet er ukendt i denne tenant.");
  const maerkat = snap.val();
  if (maerkat.aktiv === false) throw new HttpsError("failed-precondition", "QR-mærkatet er deaktiveret.");
  const vareSnap = await rod.child(`forbrugsvarer/${maerkat.forbrugsvareId}`).once("value");
  if (!vareSnap.exists() || vareSnap.val().aktiv === false) throw new HttpsError("failed-precondition", "Varen er ikke længere aktiv.");
  await logProcure(tenantId, uid, AUDIT.laes, "procureQrMaerkat", maerkatId, null, null, "QR-hyldemærkat scannet");
  return {
    maerkat: { id: maerkatId, vareId: maerkat.forbrugsvareId, placering: maerkat.placering },
    vare: { id: maerkat.forbrugsvareId, ...vareSnap.val() },
  };
});

/* WEBSHOP-ADGANG — legitimation ligger krypteret uden for tenanttræet.
   Ciphertext må aldrig sendes til browseren eller skrives i auditloggen. */
function krypterWebshopCredential(credential) {
  const erLokalDemo = process.env.FUNCTIONS_EMULATOR === "true"
    || /^demo-/.test(runtimeFirebaseConfig.projectId || process.env.GCLOUD_PROJECT || "");
  const key = PROCURE_WEBSHOP_KEY.value()
    || (erLokalDemo ? process.env.PROCURE_WEBSHOP_KEY_LOCAL : "");
  try { return encryptWebshopCredential(credential, key); }
  catch { throw new HttpsError("failed-precondition", "Webshophemmeligheder er ikke konfigureret."); }
}

function dekrypterWebshopCredential(record) {
  const erLokalDemo = process.env.FUNCTIONS_EMULATOR === "true"
    || /^demo-/.test(runtimeFirebaseConfig.projectId || process.env.GCLOUD_PROJECT || "");
  const key = PROCURE_WEBSHOP_KEY.value()
    || (erLokalDemo ? process.env.PROCURE_WEBSHOP_KEY_LOCAL : "");
  try { return decryptWebshopCredential(record, key); }
  catch { throw new HttpsError("data-loss", "Webshopadgangen kunne ikke dekrypteres."); }
}

const webshopCredentialRef = (db, tenantId, supplierId) =>
  db.ref(`procureHemmeligeOplysninger/${tenantId}/${supplierId}`);

export const procureWebshopCredentialGem = onCall({ region: REGION, secrets: [PROCURE_WEBSHOP_KEY] }, async (req) => {
  const { db, rod, tenantId, uid } = await procureDoer(req, { perm: "leverandoerer.skriv", modul: "indkoeb" });
  const supplierId = kortStreng(req.data?.leverandoerId, 80);
  const username = kortStreng(req.data?.brugernavn, 200);
  const password = typeof req.data?.adgangskode === "string" ? req.data.adgangskode : "";
  if (!supplierId || !username || !password || password.length > 500) throw new HttpsError("invalid-argument", "Leverandør, brugernavn eller adgangskode mangler.");
  const supplier = (await rod.child(`leverandoerer/${supplierId}`).once("value")).val();
  if (!supplier) throw new HttpsError("not-found", "Leverandøren findes ikke i denne tenant.");
  if (!["webshop", "begge"].includes(supplier.bestillingsmetode)) throw new HttpsError("failed-precondition", "Webshop er ikke en tilladt bestillingsmetode for leverandøren.");
  const now = Date.now();
  await webshopCredentialRef(db, tenantId, supplierId).set({ ...krypterWebshopCredential({ username, password }), aendretAf: uid, aendretMs: now });
  await rod.child(`leverandoerer/${supplierId}/webshopCredential`).set({ konfigureret: true, aendretAf: uid, aendretMs: now });
  await logProcure(tenantId, uid, AUDIT.aendre, "leverandoerer", supplierId, null, { status: "webshopadgang konfigureret" }, "Webshopadgang ændret; hemmelighed ikke logget");
  return { ok: true, konfigureret: true, aendretMs: now };
});

export const procureWebshopCredentialHent = onCall({ region: REGION, secrets: [PROCURE_WEBSHOP_KEY] }, async (req) => {
  const { db, rod, tenantId, uid, perms } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const supplierId = kortStreng(req.data?.leverandoerId, 80);
  if (!supplierId) throw new HttpsError("invalid-argument", "Leverandør mangler.");
  const supplier = (await rod.child(`leverandoerer/${supplierId}`).once("value")).val();
  if (!supplier) throw new HttpsError("not-found", "Leverandøren findes ikke i denne tenant.");
  const responsible = supplier.ansvarligeIndkoebere?.[uid] === true;
  const admin = perms.includes("|leverandoerer.skriv|");
  if (!responsible && !admin) {
    await logProcure(tenantId, uid, AUDIT.laes, "leverandoerer", supplierId, null, { status: "afvist" }, "Afvist webshopadgang; hemmelighed ikke logget");
    throw new HttpsError("permission-denied", "Kun en ansvarlig indkøber eller leverandøradministrator må se webshopadgangen.");
  }
  const record = (await webshopCredentialRef(db, tenantId, supplierId).once("value")).val();
  if (!record) throw new HttpsError("failed-precondition", "Webshopadgang er ikke konfigureret.");
  const credential = dekrypterWebshopCredential(record);
  await logProcure(tenantId, uid, AUDIT.laes, "leverandoerer", supplierId, null, { status: "udleveret" }, "Webshopadgang udleveret; hemmelighed ikke logget");
  return { username: credential.username, password: credential.password, expiresAtMs: Date.now() + 60_000, cacheControl: "no-store" };
});

export const procureWebshopBestillingRegistrer = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const d = req.data || {};
  const ordreId = kortStreng(d.ordreId, 60);
  const requestId = kortStreng(d.requestId, 80);
  const eksternOrdrenummer = kortStreng(d.eksternOrdrenummer, 100);
  const betalingsmetode = kortStreng(d.betalingsmetode, 30);
  const bekraeftelsesreference = kortStreng(d.bekraeftelsesreference, 160);
  const beloebOere = d.beloebOere;
  if (!ordreId || !requestId || !erGyldigtSendRequestId(requestId) || !eksternOrdrenummer || !Number.isInteger(beloebOere) || beloebOere < 0) {
    throw new HttpsError("invalid-argument", "Bestilling, stabil anmodningsreference, leverandørnummer og beløb skal udfyldes.");
  }
  if (!["faktura", "firmakort"].includes(betalingsmetode)) throw new HttpsError("invalid-argument", "Vælg faktura eller firmakort som betalingsmetode.");
  if (d.kortnummer || d.cvv) throw new HttpsError("invalid-argument", "Kortnummer og CVV må ikke gemmes i PROCURE.");
  const ref = rod.child(`indkoebsordrer/${ordreId}`);
  const ordreFoerSnap = await ref.once("value");
  let koldCacheFallback = ordreFoerSnap.exists();
  const ordreFoer = ordreFoerSnap.val();
  let duplicate = false;
  const now = Date.now();
  const tx = await ref.transaction((order) => {
    if (!order && koldCacheFallback) order = structuredClone(ordreFoer);
    koldCacheFallback = false;
    if (!order) return;
    const existing = order.webshop?.registreringer?.[requestId];
    if (existing) { duplicate = true; return order; }
    if (order.status !== "godkendt" || Number(order.godkendtRevision) !== Number(order.revision || 1)) return;
    if (order.mail && Object.keys(order.mail).length) return;
    if (order.bestillingsmetode && order.bestillingsmetode !== "webshop") return;
    order.bestillingsmetode = "webshop";
    order.status = "sendt";
    order.sendtMs = now;
    order.sendtAf = uid;
    order.leverandoerBekraeftelseStatus = "afventer";
    order.webshop = order.webshop || {};
    order.webshop.registreringer = order.webshop.registreringer || {};
    order.webshop.registreringer[requestId] = { eksternOrdrenummer, beloebOere, betalingsmetode, bekraeftelsesreference: bekraeftelsesreference || null, ordreRevision: order.revision || 1, registreretAf: uid, registreretMs: now };
    if (betalingsmetode === "firmakort") {
      order.betaling = { metode: "firmakort", beloebOere, valuta: "DKK", betalingsdato: kortStreng(d.betalingsdato, 10), reference: kortStreng(d.betalingsreference, 120), dokumentId: kortStreng(d.dokumentId, 80), bekraeftelseskilde: "brugerregistreret", oekonomistatus: "afventerDokumentation", registreretAf: uid, registreretMs: now };
    }
    return order;
  });
  if (!tx.committed) throw new HttpsError("failed-precondition", "Bestillingen skal være godkendt i samme revision, må ikke have et mailforsøg og kan ikke skifte bestillingsmetode.");
  await logProcure(tenantId, uid, AUDIT.tilstandsskift, "indkoebsordrer", ordreId, null, { status: "bestilt via webshop" }, duplicate ? "Gentaget registrering — ingen ekstra ordre" : "Webshopbestilling registreret");
  return { ok: true, ordreId, duplicate, status: "sendt", supplierConfirmationStatus: "pending" };
});

/* PROCURE-MODTAGELSER — dokumenter går gennem signerede server-URL'er og
   bliver først aktive efter kontrol af størrelse og magic bytes. Klienten
   kan hverken vælge tenant, Storage-sti eller markere en fil som færdig. */
const modtagelseDokumentSti = (ordreId, modtagelseId, dokumentId) =>
  `indkoebsordrer/${ordreId}/modtagelser/${modtagelseId}/dokumenter/${dokumentId}`;
const modtagelseStorageSti = (tenantId, ordreId, modtagelseId, dokumentId) =>
  `tenants/${tenantId}/indkoebsordrer/${ordreId}/modtagelser/${modtagelseId}/dokumenter/${dokumentId}`;

async function hentProcureOrdre(rod, ordreId) {
  const snap = await rod.child(`indkoebsordrer/${ordreId}`).once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Bestillingen findes ikke.");
  return { ...snap.val(), id: ordreId };
}

export const procureModtagelseUploadInitier = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const d = req.data || {};
  const ordreId = kortStreng(d.ordreId, 60);
  const modtagelseId = kortStreng(d.modtagelseId, 60);
  if (!ordreId || !modtagelseId || !erGyldigtSendRequestId(modtagelseId)) {
    throw new HttpsError("invalid-argument", "ordreId/modtagelseId mangler eller er ugyldigt.");
  }
  const ordre = await hentProcureOrdre(rod, ordreId);
  if (!["sendt", "modtaget"].includes(ordre.status)) {
    throw new HttpsError("failed-precondition", "Kun en afsendt bestilling kan modtages.");
  }
  if (Number(d.ordreRevision) !== ordreRevision(ordre)) {
    throw new HttpsError("aborted", "Bestillingen er ændret. Genindlæs før modtagelsen registreres.");
  }
  const originaltFilnavn = kortStreng(d.originaltFilnavn, 200);
  const mimeType = kortStreng(d.mimeType, 100);
  const angivetStoerrelse = Number(d.stoerrelse);
  if (!originaltFilnavn) throw new HttpsError("invalid-argument", "Filnavn mangler.");
  if (!TILLADT_MIME.includes(mimeType)) {
    throw new HttpsError("invalid-argument", "Kun PDF, JPEG og PNG kan vedhæftes.");
  }
  if (!Number.isFinite(angivetStoerrelse) || angivetStoerrelse <= 0 || angivetStoerrelse > MAX_FILSTOERRELSE_BYTES) {
    throw new HttpsError("invalid-argument", "Filstørrelsen er ugyldig eller over 25 MB.");
  }
  const kvote = await rod.child("dokumentkvote/procureBilag/brugtBytes").once("value");
  if (sprængerKvote(kvote.val(), angivetStoerrelse)) {
    throw new HttpsError("resource-exhausted", "Tenantens lagerkvote for modtagelsesbilag er brugt op.");
  }
  const dokumentId = rod.child(`indkoebsordrer/${ordreId}/modtagelser/${modtagelseId}/dokumenter`).push().key;
  const storagePath = modtagelseStorageSti(tenantId, ordreId, modtagelseId, dokumentId);
  const post = {
    dokumentId, originaltFilnavn, valideretMime: mimeType, stoerrelse: angivetStoerrelse,
    storagePath, uploader: uid, oprettetTid: Date.now(), status: "karantaene",
  };
  const docRef = rod.child(modtagelseDokumentSti(ordreId, modtagelseId, dokumentId));
  await docRef.set(post);
  const uploadUrl = await lokalStorageUrl(req, { handling: "write", storagePath, mimeType, stoerrelse: angivetStoerrelse })
    || (await getStorage().bucket().file(storagePath).getSignedUrl({
      version: "v4", action: "write", expires: Date.now() + 10 * 60 * 1000, contentType: mimeType,
    }))[0];
  await logProcure(tenantId, uid, AUDIT.opret, "modtagelseDokument", dokumentId, null, post, "upload initieret");
  return { dokumentId, storagePath, uploadUrl };
});

export const procureModtagelseUploadBekraeft = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const ordreId = kortStreng(req.data?.ordreId, 60);
  const modtagelseId = kortStreng(req.data?.modtagelseId, 60);
  const dokumentId = kortStreng(req.data?.dokumentId, 60);
  if (!ordreId || !modtagelseId || !dokumentId) throw new HttpsError("invalid-argument", "Dokumentreference mangler.");
  await hentProcureOrdre(rod, ordreId);
  const docRef = rod.child(modtagelseDokumentSti(ordreId, modtagelseId, dokumentId));
  const snap = await docRef.once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Vedhæftningen findes ikke.");
  const dok = snap.val();
  if (dok.status === "aktiv") return { ok: true, status: "aktiv", allerede: true };
  if (dok.status !== "karantaene") throw new HttpsError("failed-precondition", `Vedhæftningen er ${dok.status}.`);
  const file = getStorage().bucket().file(dok.storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("failed-precondition", "Uploaden er ikke modtaget.");
  const afvis = async (grund) => {
    await file.delete({ ignoreNotFound: true });
    await docRef.update({ status: "afvist", afvistGrund: grund });
    await logProcure(tenantId, uid, AUDIT.tilstandsskift, "modtagelseDokument", dokumentId,
      { status: "karantaene" }, { status: "afvist" }, grund);
    throw new HttpsError("failed-precondition", grund);
  };
  const [meta] = await file.getMetadata();
  const faktiskStoerrelse = Number(meta.size);
  if (!Number.isFinite(faktiskStoerrelse) || faktiskStoerrelse <= 0 || faktiskStoerrelse > MAX_FILSTOERRELSE_BYTES) {
    await afvis("Filens faktiske størrelse er ugyldig eller over 25 MB.");
  }
  const [bytes] = await file.download({ start: 0, end: 15 });
  if (!tjekSignatur(bytes, dok.valideretMime)) await afvis("Filens indhold matcher ikke den angivne filtype.");
  const kvoteRef = rod.child("dokumentkvote/procureBilag/brugtBytes");
  const txn = await kvoteRef.transaction((cur) => sprængerKvote(cur, faktiskStoerrelse)
    ? undefined : (Number(cur) || 0) + faktiskStoerrelse);
  if (!txn.committed) await afvis("Tenantens lagerkvote for modtagelsesbilag er brugt op.");
  const sha256 = createHash("sha256").update(await file.download().then(([all]) => all)).digest("hex");
  await docRef.update({ status: "aktiv", stoerrelse: faktiskStoerrelse, sha256, verificeretMs: Date.now() });
  await logProcure(tenantId, uid, AUDIT.tilstandsskift, "modtagelseDokument", dokumentId,
    { status: "karantaene" }, { status: "aktiv" }, "upload verificeret");
  return { ok: true, status: "aktiv", sha256 };
});

export const procureModtagelseDownloadLink = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.laes", modul: "indkoeb" });
  const ordreId = kortStreng(req.data?.ordreId, 60);
  const modtagelseId = kortStreng(req.data?.modtagelseId, 60);
  const dokumentId = kortStreng(req.data?.dokumentId, 60);
  if (!ordreId || !modtagelseId || !dokumentId) throw new HttpsError("invalid-argument", "Dokumentreference mangler.");
  await hentProcureOrdre(rod, ordreId);
  const snap = await rod.child(modtagelseDokumentSti(ordreId, modtagelseId, dokumentId)).once("value");
  if (!snap.exists() || snap.val().status !== "aktiv") throw new HttpsError("not-found", "Vedhæftningen er ikke tilgængelig.");
  const url = await lokalStorageUrl(req, { handling: "read", storagePath: snap.val().storagePath, mimeType: snap.val().valideretMime })
    || (await getStorage().bucket().file(snap.val().storagePath).getSignedUrl({
      version: "v4", action: "read", expires: Date.now() + 5 * 60 * 1000,
    }))[0];
  await logProcure(tenantId, uid, AUDIT.laes, "modtagelseDokument", dokumentId, null, null, "downloadlink udstedt");
  return { url, sha256: snap.val().sha256 || null, udloeberMs: Date.now() + 5 * 60 * 1000 };
});

export const procureModtagelseRegistrer = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const d = req.data || {};
  const ordreId = kortStreng(d.ordreId, 60);
  const modtagelseId = kortStreng(d.modtagelseId, 60);
  if (!ordreId || !modtagelseId || !erGyldigtSendRequestId(modtagelseId)) {
    throw new HttpsError("invalid-argument", "ordreId/modtagelseId mangler eller er ugyldigt.");
  }
  const user = (await rod.child(`brugere/${uid}`).once("value")).val() || {};
  const actorName = kortStreng(user.navn || user.displayName || user.email, 160) || "Medarbejder";
  let resultat;
  let afvistGrund = null;
  const tenantFoerSnap = await rod.once("value");
  if (!tenantFoerSnap.exists() || !tenantFoerSnap.val()?.indkoebsordrer?.[ordreId]) {
    throw new HttpsError("not-found", "Bestillingen findes ikke.");
  }
  const tenantFoer = tenantFoerSnap.val();
  const now = Date.now();
  let koldCacheFallback = true;
  const tx = await rod.transaction((tenantData) => {
    if (!tenantData && koldCacheFallback) tenantData = structuredClone(tenantFoer);
    koldCacheFallback = false;
    const ordre = tenantData?.indkoebsordrer?.[ordreId];
    if (!ordre) { afvistGrund = "Bestillingen findes ikke."; return; }
    const eksisterende = ordre.modtagelser?.[modtagelseId];
    if (eksisterende?.status === "registreret") {
      resultat = { allerede: true, receipt: eksisterende, status: ordre.status,
        inventoryEffects: Object.values(eksisterende.lagerresultater || {}) };
      return tenantData;
    }
    if (!["sendt", "modtaget"].includes(ordre.status)) { afvistGrund = "Bestillingen er ikke afsendt."; return; }
    if (Number(d.ordreRevision) !== ordreRevision(ordre)) { afvistGrund = "Bestillingsrevisionen er ændret."; return; }
    const dokumenter = eksisterende?.dokumenter || {};
    if (Object.values(dokumenter).some((dok) => dok.status !== "aktiv")) { afvistGrund = "En vedhæftning er ikke færdigvalideret."; return; }
    const bygget = byggServerModtagelse({ ...ordre, id: ordreId }, { ...d, receivedBy: actorName }, { uid, now });
    if (!bygget.ok) { resultat = bygget; return; }

    const inventoryEffects = [];
    const lagerbevaegelser = {};
    const orderLines = serverOrdreLinjer(ordre);
    for (const [index, receiptLine] of Object.values(bygget.receipt.linjer).entries()) {
      const orderLine = orderLines.find((line) => line.id === receiptLine.ordrelinjeId);
      const item = orderLine?.vareId ? tenantData.forbrugsvarer?.[orderLine.vareId] : null;
      if (!item || item.lagerfoert !== true) continue;
      const row = (d.lines || []).find((candidate) => candidate.orderLineId === orderLine.id) || {};
      const converted = stockQuantityForOrderLine(item, orderLine, receiptLine.godkendtAntal);
      if (!converted.ok) { afvistGrund = converted.message; return; }
      const warehouseId = kortStreng(row.warehouseId || d.warehouseId, 60);
      const locationId = kortStreng(row.locationId || d.locationId, 60);
      const current = inventoryLocation(item, warehouseId, locationId);
      const movementId = `${modtagelseId}-${index + 1}`;
      const stock = applyInventoryMovement({ ...item, id: orderLine.vareId }, {
        type: "modtaget", quantity: converted.quantity, unit: converted.unit,
        requestId: movementId, warehouseId,
        warehouse: kortStreng(row.warehouse || d.warehouse, 120),
        locationId, location: kortStreng(row.location || d.location, 120),
        expectedRevision: Number(current?.revision || 0), orderId: ordreId,
        receiptId: modtagelseId, orderLineId: orderLine.id,
      }, { uid, actorName, now });
      if (!stock.ok) { afvistGrund = Object.values(stock.errors)[0]; return; }
      tenantData.forbrugsvarer[orderLine.vareId] = stock.item;
      tenantData.forbrugsvarebevaegelser = tenantData.forbrugsvarebevaegelser || {};
      tenantData.forbrugsvarebevaegelser[movementId] = stock.movement;
      lagerbevaegelser[movementId] = stock.movement;
      const persistedLocation = Object.fromEntries(Object.entries(stock.location)
        .filter(([, value]) => value !== null && value !== undefined));
      inventoryEffects.push({ movementId, itemId: orderLine.vareId, itemName: orderLine.navn,
        ...persistedLocation, before: stock.movement.foer, received: converted.quantity, after: stock.movement.efter });
    }
    ordre.modtagelser = { ...(ordre.modtagelser || {}), [modtagelseId]: {
      ...bygget.receipt, modtagetAfNavn: actorName, dokumenter, lagerbevaegelser,
      lagerresultater: Object.fromEntries(inventoryEffects.map((effect) => [effect.movementId, effect])),
    } };
    ordre.status = ordreErFuldtModtaget(ordre) ? "modtaget" : "sendt";
    ordre.resterendeVaerdiOere = serverOrdreLinjer(ordre).reduce((sum, line) =>
      sum + Math.max(0, line.antal - Number(modtagetPrLinje(ordre).get(line.id) || 0)) * line.prisOere, 0);
    resultat = { receipt: ordre.modtagelser[modtagelseId], status: ordre.status, inventoryEffects };
    return tenantData;
  });
  if (!tx.committed) {
    if (resultat?.errors) throw new HttpsError("invalid-argument", Object.values(resultat.errors)[0]);
    throw new HttpsError("aborted", `${afvistGrund || "Bestillingen eller en vedhæftning er ændret."} Genindlæs og prøv igen.`);
  }
  if (!resultat) throw new HttpsError("aborted", "Modtagelsen kunne ikke registreres.");
  await logProcure(tenantId, uid, AUDIT.opret, "modtagelse", modtagelseId, null,
    { status: "registreret" }, resultat.allerede ? "gentaget kald — ingen dobbeltregistrering" : "varemodtagelse registreret");
  return { ok: true, modtagelseId, ordreStatus: resultat.status,
    allerede: Boolean(resultat.allerede), inventoryEffects: resultat.inventoryEffects || [] };
});

export const procureModtagelseKorriger = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const d = req.data || {};
  const ordreId = kortStreng(d.ordreId, 60);
  const korrektionId = kortStreng(d.korrektionId, 60);
  if (!ordreId || !korrektionId || !erGyldigtSendRequestId(korrektionId)) {
    throw new HttpsError("invalid-argument", "Korrektionens reference mangler eller er ugyldig.");
  }
  let resultat;
  const ordreRef = rod.child(`indkoebsordrer/${ordreId}`);
  const ordreFoerSnap = await ordreRef.once("value");
  if (!ordreFoerSnap.exists()) {
    throw new HttpsError("not-found", "Bestillingen findes ikke.");
  }
  const ordreFoer = ordreFoerSnap.val();
  let koldCacheFallback = true;
  const tx = await ordreRef.transaction((ordre) => {
    if (!ordre && koldCacheFallback) ordre = structuredClone(ordreFoer);
    koldCacheFallback = false;
    if (!ordre) return;
    if (ordre.modtagelser?.[korrektionId]?.status === "registreret") { resultat = { allerede: true }; return ordre; }
    if (Number(d.ordreRevision) !== ordreRevision(ordre) || !ordre.modtagelser?.[d.correctionOf]) return;
    const bygget = byggServerKorrektion({ ...ordre, id: ordreId }, d, { uid });
    if (!bygget.ok) { resultat = bygget; return; }
    ordre.modtagelser = { ...(ordre.modtagelser || {}), [korrektionId]: bygget.receipt };
    ordre.status = ordreErFuldtModtaget(ordre) ? "modtaget" : "sendt";
    ordre.resterendeVaerdiOere = serverOrdreLinjer(ordre).reduce((sum, line) =>
      sum + Math.max(0, line.antal - Number(modtagetPrLinje(ordre).get(line.id) || 0)) * line.prisOere, 0);
    resultat = { status: ordre.status };
    return ordre;
  });
  if (!tx.committed) {
    if (resultat?.errors) throw new HttpsError("invalid-argument", Object.values(resultat.errors)[0]);
    throw new HttpsError("aborted", "Korrektionen kunne ikke anvendes på den aktuelle ordreversion.");
  }
  await logProcure(tenantId, uid, AUDIT.aendre, "modtagelse", korrektionId, null,
    { status: "registreret" }, resultat?.allerede ? "gentaget korrektion" : "modtagelse korrigeret");
  return { ok: true, allerede: Boolean(resultat?.allerede), ordreStatus: resultat?.status || tx.snapshot.val().status };
});

/* En fysisk retur er sin egen lagerhændelse. Den ændrer ikke en modtagelse,
   opretter ikke en kreditnota og fremstilles ikke som en tilbagebetaling. */
export const procureVareReturneringRegistrer = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const d = req.data || {}; const ordreId = kortStreng(d.ordreId, 60); const returneringId = kortStreng(d.returneringId, 60);
  if (!ordreId || !returneringId || !erGyldigtSendRequestId(returneringId)) throw new HttpsError("invalid-argument", "Returneringens reference mangler eller er ugyldig.");
  const tenantFoerSnap = await rod.once("value");
  if (!tenantFoerSnap.exists() || !tenantFoerSnap.val()?.indkoebsordrer?.[ordreId]) throw new HttpsError("not-found", "Bestillingen findes ikke.");
  const user = tenantFoerSnap.val()?.brugere?.[uid] || {};
  const actorName = kortStreng(user.navn || user.displayName || user.email, 160) || "Medarbejder";
  const tenantFoer = tenantFoerSnap.val(); const now = Date.now(); let resultat; let afvistGrund = ""; let koldCacheFallback = true;
  const tx = await rod.transaction((tenantData) => {
    if (!tenantData && koldCacheFallback) tenantData = structuredClone(tenantFoer);
    koldCacheFallback = false;
    const ordre = tenantData?.indkoebsordrer?.[ordreId];
    if (!ordre) { afvistGrund = "Bestillingen findes ikke."; return; }
    if (ordre.returneringer?.[returneringId]?.status === "registreret") {
      resultat = { allerede: true, returned: ordre.returneringer[returneringId] }; return tenantData;
    }
    if (Number(d.ordreRevision) !== ordreRevision(ordre)) { afvistGrund = "Bestillingen er ændret."; return; }
    const bygget = byggServerReturnering({ ...ordre, id: ordreId }, d, { uid, now });
    if (!bygget.ok) { resultat = bygget; return; }
    const movements = {};
    const orderLines = serverOrdreLinjer(ordre);
    for (const [index, returnedLine] of Object.values(bygget.returned.linjer).entries()) {
      const orderLine = orderLines.find((line) => line.id === returnedLine.ordrelinjeId);
      const item = orderLine?.vareId ? tenantData.forbrugsvarer?.[orderLine.vareId] : null;
      if (!item || item.lagerfoert !== true) continue;
      const row = (d.lines || []).find((candidate) => candidate.orderLineId === orderLine.id) || {};
      const converted = stockQuantityForOrderLine(item, orderLine, returnedLine.antal);
      if (!converted.ok) { afvistGrund = converted.message; return; }
      const warehouseId = kortStreng(row.warehouseId || d.warehouseId, 60);
      const locationId = kortStreng(row.locationId || d.locationId, 60);
      const current = inventoryLocation(item, warehouseId, locationId);
      const movementId = `${returneringId}-${index + 1}`;
      const stock = applyInventoryMovement({ ...item, id: orderLine.vareId }, {
        type: "retur", quantity: converted.quantity, unit: converted.unit,
        requestId: movementId, warehouseId, warehouse: kortStreng(row.warehouse || d.warehouse, 120),
        locationId, location: kortStreng(row.location || d.location, 120),
        expectedRevision: Number(current?.revision || 0), orderId: ordreId,
        reason: d.reason, orderLineId: orderLine.id,
      }, { uid, actorName, now });
      if (!stock.ok) { afvistGrund = Object.values(stock.errors)[0]; return; }
      tenantData.forbrugsvarer[orderLine.vareId] = stock.item;
      tenantData.forbrugsvarebevaegelser = tenantData.forbrugsvarebevaegelser || {};
      tenantData.forbrugsvarebevaegelser[movementId] = stock.movement;
      movements[movementId] = stock.movement;
    }
    ordre.returneringer = { ...(ordre.returneringer || {}), [returneringId]: { ...bygget.returned, lagerbevaegelser: movements } };
    resultat = { returned: ordre.returneringer[returneringId] };
    return tenantData;
  });
  if (!tx.committed) throw new HttpsError(resultat?.errors ? "invalid-argument" : "aborted", resultat?.errors ? Object.values(resultat.errors)[0] : afvistGrund || "Returneringen kunne ikke registreres.");
  await logProcure(tenantId, uid, AUDIT.opret, "procureReturnering", returneringId, null, { status: "registreret", vaerdiOere: resultat.returned.vaerdiOere }, resultat.allerede ? "gentaget retur — ingen dublet" : "fysisk retur registreret; kredit afventes");
  return { ok: true, returneringId, allerede: Boolean(resultat.allerede), kreditstatus: resultat.returned.kreditstatus, vaerdiOere: resultat.returned.vaerdiOere };
});

/* Autoriseret importvej til det fælles Fakturacenter. Den gemmer fakturaen i
   den eksisterende faktura-node og forbinder den med PO/ordrelinjer; Procure
   opretter altså ikke et parallelt fakturaregister. */
export const procureFakturaImport = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "fakturaer.skriv" });
  const d = req.data || {};
  const ordreId = kortStreng(d.ordreId, 60);
  const requestId = kortStreng(d.requestId, 60);
  if (!ordreId || !requestId || !erGyldigtSendRequestId(requestId)) {
    throw new HttpsError("invalid-argument", "ordreId/requestId mangler eller er ugyldigt.");
  }
  const ordre = await hentProcureOrdre(rod, ordreId);
  if (!["sendt", "modtaget"].includes(ordre.status)) {
    throw new HttpsError("failed-precondition", "Fakturaen kan først importeres, når ordren er sendt.");
  }
  if (Number(d.ordreRevision) !== ordreRevision(ordre)) {
    throw new HttpsError("aborted", "Ordren er ændret siden fakturaen blev klargjort.");
  }
  const bygget = byggImporteretFaktura(ordre, d, { uid });
  if (!bygget.ok) throw new HttpsError("invalid-argument", Object.values(bygget.errors)[0]);
  const fakturaId = `procure-${requestId}`;
  let svar;
  const fakturaerRef = rod.child("fakturaer");
  const fakturaerFoerSnap = await fakturaerRef.once("value");
  const fakturaerFoer = fakturaerFoerSnap.val() || {};
  let koldCacheFallback = fakturaerFoerSnap.exists();
  const tx = await fakturaerRef.transaction((fakturaer) => {
    if (!fakturaer && koldCacheFallback) fakturaer = structuredClone(fakturaerFoer);
    koldCacheFallback = false;
    fakturaer = fakturaer || {};
    if (fakturaer[fakturaId]) { svar = { allerede: true, faktura: fakturaer[fakturaId] }; return fakturaer; }
    const alle = Object.entries(fakturaer);
    const dublet = alle.find(([, f]) => f.leverandoerId === bygget.invoice.leverandoerId
      && String(f.fakturanummer || "").toLowerCase() === String(bygget.invoice.fakturanummer).toLowerCase()
      && f.status !== "afvist");
    if (dublet) { svar = { fejl: `Fakturanummeret er allerede importeret som ${dublet[0]}.` }; return; }
    if (d.type === "invoice") {
      const modtaget = modtagetPrLinje(ordre);
      const tidligere = new Map();
      for (const [, f] of alle) {
        if (f.destinationId !== ordreId || f.fakturatype !== "invoice" || f.status === "afvist") continue;
        for (const linje of Object.values(f.linjer || {})) {
          tidligere.set(linje.ordrelinjeId, Number(tidligere.get(linje.ordrelinjeId) || 0) + Number(linje.antal || 0));
        }
      }
      for (const linje of Object.values(bygget.invoice.linjer)) {
        const nyTotal = Number(tidligere.get(linje.ordrelinjeId) || 0) + Number(linje.antal);
        if (nyTotal > Number(modtaget.get(linje.ordrelinjeId) || 0)) {
          svar = { fejl: `Faktureret antal overstiger godkendt modtagelse for ${linje.vare}.` };
          return;
        }
      }
    } else {
      const oprindelig = fakturaer[d.creditsInvoiceId];
      if (!oprindelig || oprindelig.destinationId !== ordreId || oprindelig.leverandoerId !== ordre.leverandoerId
        || oprindelig.fakturatype !== "invoice") {
        svar = { fejl: "Kreditnotaen peger ikke på en gyldig faktura fra samme ordre og leverandør." };
        return;
      }
      if (d.returnId) {
        const returned = ordre.returneringer?.[d.returnId];
        if (!returned || returned.status !== "registreret" || (returned.fakturaId && returned.fakturaId !== d.creditsInvoiceId)) {
          svar = { fejl: "Kreditnotaen peger ikke på en registreret fysisk retur for denne faktura." };
          return;
        }
        const returnCredits = alle.filter(([, f]) => f.returneringId === d.returnId && f.status !== "afvist")
          .reduce((sum, [, f]) => sum + Number(f.beloebOere || 0), 0);
        if (returnCredits + Number(bygget.invoice.beloebOere) > Number(returned.vaerdiOere || 0)) {
          svar = { fejl: "Kreditnotaen er større end den åbne værdi på den fysiske retur." };
          return;
        }
      } else {
        const priceCredits = alle.filter(([, f]) => f.kreditererFakturaId === d.creditsInvoiceId && !f.returneringId && f.status !== "afvist")
          .reduce((sum, [, f]) => sum + Number(f.beloebOere || 0), 0);
        if (priceCredits + Number(bygget.invoice.beloebOere) > Math.abs(Number(oprindelig.prisafvigelseOere || 0))) {
          svar = { fejl: "Kreditnotaen er større end den åbne prisafvigelse." };
          return;
        }
        oprindelig.afvigelsesstatus = "kreditnota-modtaget";
      }
    }
    fakturaer[fakturaId] = bygget.invoice;
    svar = { faktura: bygget.invoice };
    return fakturaer;
  });
  if (!tx.committed) {
    const besked = svar?.fejl || "Fakturaimporten blev afvist som dublet.";
    const kode = besked.startsWith("Fakturanummeret er allerede") ? "already-exists" : "failed-precondition";
    throw new HttpsError(kode, besked);
  }
  await logProcure(tenantId, uid, AUDIT.opret, "fakturaer", fakturaId, null,
    { status: svar.faktura.status, leverandoerId: svar.faktura.leverandoerId },
    svar.allerede ? "gentaget import — ingen dublet" : "faktura importeret til Fakturacenter");
  if (d.returnId && !svar.allerede) await rod.child(`indkoebsordrer/${ordreId}/returneringer/${d.returnId}`).update({ kreditstatus: "kreditnota-modtaget", kreditnotaId: fakturaId, krediteretMs: Date.now() });
  return {
    ok: true, fakturaId, allerede: Boolean(svar.allerede), beloebOere: Number(svar.faktura.beloebOere),
    prisafvigelseOere: Number(svar.faktura.prisafvigelseOere || 0), status: svar.faktura.status,
  };
});

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
    if (faktura.fakturatype === "credit-note" && faktura.kreditererFakturaId) {
      const originalRef = rod.child(`fakturaer/${faktura.kreditererFakturaId}`);
      const original = (await originalRef.once("value")).val();
      if (!original || original.destinationId !== faktura.destinationId
        || original.leverandoerId !== faktura.leverandoerId) {
        throw new HttpsError("failed-precondition", "Kreditnotaens oprindelige faktura kan ikke længere verificeres.");
      }
      const kreditSnap = await rod.child("fakturaer")
        .orderByChild("kreditererFakturaId").equalTo(faktura.kreditererFakturaId).once("value");
      let godkendtKreditOere = Number(faktura.beloebOere || 0);
      kreditSnap.forEach((barn) => {
        if (barn.key !== fakturaId && barn.val().status === "godkendt") {
          godkendtKreditOere += Number(barn.val().beloebOere || 0);
        }
      });
      opdatering[`tenants/${tenantId}/fakturaer/${faktura.kreditererFakturaId}/krediteretOere`] = godkendtKreditOere;
      opdatering[`tenants/${tenantId}/fakturaer/${faktura.kreditererFakturaId}/afvigelsesstatus`] =
        godkendtKreditOere >= Math.abs(Number(original.prisafvigelseOere || 0)) ? "korrigeret" : "delvist-korrigeret";
    }
    if (faktura.fakturatype === "credit-note" && faktura.returneringId && faktura.destinationId) {
      const returSti = `tenants/${tenantId}/indkoebsordrer/${faktura.destinationId}/returneringer/${faktura.returneringId}`;
      const retur = (await db.ref(returSti).once("value")).val();
      if (!retur || retur.kreditnotaId !== fakturaId) {
        throw new HttpsError("failed-precondition", "Kreditnotaens fysiske retur kan ikke længere verificeres.");
      }
      opdatering[`${returSti}/kreditstatus`] = "krediteret";
      opdatering[`${returSti}/kreditGodkendtMs`] = nu;
      opdatering[`${returSti}/kreditGodkendtAf`] = uid;
    }
  }
  if (til === "afvist") {
    opdatering[`${sti}/afvistAf`] = uid;
    opdatering[`${sti}/afvistMs`] = nu;
    if (faktura.fakturatype === "credit-note" && faktura.returneringId && faktura.destinationId) {
      const returSti = `tenants/${tenantId}/indkoebsordrer/${faktura.destinationId}/returneringer/${faktura.returneringId}`;
      opdatering[`${returSti}/kreditstatus`] = "afventer-kreditnota";
      opdatering[`${returSti}/kreditnotaId`] = null;
    }
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

/* PROCURE: allerede foretaget køb. Linjerne bliver i det fælles `indkoeb`-
   register; anmodningsnoden nedenfor er kun et idempotensværn. Funktionen
   sender ingen mail, foretager ingen betaling og markerer ikke noget bogført. */
export const procureKoebRegistrer = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const d = req.data || {};
  const requestId = kortStreng(d.requestId, 80);
  if (!requestId || !erGyldigtSendRequestId(requestId)) throw new HttpsError("invalid-argument", "Købsreferencen mangler eller er ugyldig.");
  const supplierId = kortStreng(d.supplierId, 60);
  if (!supplierId || !(await rod.child(`leverandoerer/${supplierId}`).once("value")).exists()) throw new HttpsError("invalid-argument", "Vælg en eksisterende leverandør.");
  const purchaseDate = kortStreng(d.purchaseDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) throw new HttpsError("invalid-argument", "Angiv købsdatoen.");
  const paymentMethod = kortStreng(d.paymentMethod, 30);
  if (!["firmakort", "udlaeg", "kontant", "faktura"].includes(paymentMethod)) throw new HttpsError("invalid-argument", "Vælg en gyldig betalingsform.");
  const inputLines = Array.isArray(d.lines) ? d.lines.slice(0, 50) : [];
  if (!inputLines.length) throw new HttpsError("invalid-argument", "Tilføj mindst én varelinje.");
  const [itemsSnap, departmentsSnap, userSnap] = await Promise.all([
    rod.child("forbrugsvarer").once("value"), rod.child("procureOpsaetning/afdelinger").once("value"), rod.child(`brugere/${uid}`).once("value"),
  ]);
  const items = itemsSnap.val() || {}; const departments = departmentsSnap.val() || {};
  const actorName = kortStreng(userSnap.val()?.navn || userSnap.val()?.email, 160) || "Medarbejder";
  const lines = inputLines.map((source, index) => {
    const itemId = kortStreng(source.itemId, 60); const item = items[itemId];
    if (!item || item.aktiv === false) throw new HttpsError("invalid-argument", `Varelinje ${index + 1} peger ikke på en aktiv katalogvare.`);
    const departmentId = kortStreng(source.departmentId, 60); const department = departments[departmentId];
    if (!department || department.active === false) throw new HttpsError("invalid-argument", `Vælg en aktiv afdeling på varelinje ${index + 1}.`);
    const quantity = Number(source.quantity); const amountOere = Number(source.amountOere);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpsError("invalid-argument", `Antallet på varelinje ${index + 1} er ugyldigt.`);
    if (!Number.isInteger(amountOere) || amountOere < 0) throw new HttpsError("invalid-argument", `Beløbet på varelinje ${index + 1} skal være i hele øre.`);
    const unit = kortStreng(source.unit, 20);
    if (!unit || ![item.enhed, item.bestillingsenhed, item.grundenhed].filter(Boolean).includes(unit)) throw new HttpsError("invalid-argument", `Enheden på varelinje ${index + 1} matcher ikke vareopsætningen.`);
    return { id: `linje-${index + 1}`, itemId, item, departmentId, department, quantity, amountOere, unit,
      warehouseId: kortStreng(source.warehouseId, 60), warehouse: kortStreng(source.warehouse, 120),
      locationId: kortStreng(source.locationId, 60), location: kortStreng(source.location, 120),
      expectedRevision: Number(source.expectedRevision || 0) };
  });
  const purchaseId = `koeb-${requestId}`; const readableReference = `KOB-${purchaseDate.replaceAll("-", "")}-${requestId.slice(-6).toUpperCase()}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({ supplierId, purchaseDate, paymentMethod,
    lines: lines.map((line) => [line.itemId, line.departmentId, line.quantity, line.unit, line.amountOere, line.warehouseId, line.locationId]) })).digest("hex");
  const tenantBeforeSnap = await rod.once("value");
  if (!tenantBeforeSnap.exists()) throw new HttpsError("not-found", "Kunden findes ikke.");
  const tenantBefore = tenantBeforeSnap.val();
  let coldFallback = true; let result; let rejected = ""; const now = Date.now();
  const tx = await rod.transaction((tenantData) => {
    if (!tenantData && coldFallback) tenantData = structuredClone(tenantBefore);
    coldFallback = false;
    if (!tenantData) return;
    const previous = tenantData.procureKoebsanmodninger?.[requestId];
    if (previous) {
      if (previous.fingerprint !== fingerprint) { rejected = "Købsreferencen er allerede brugt til andre oplysninger."; return; }
      result = { already: true, purchaseId: previous.purchaseId, reference: previous.reference,
        inventoryEffects: previous.inventoryEffects || [] }; return tenantData;
    }
    tenantData.indkoeb ||= {}; tenantData.forbrugsvarer ||= {}; tenantData.forbrugsvarebevaegelser ||= {};
    const inventoryEffects = [];
    for (const line of lines) {
      if (line.item.lagerfoert === true) {
        if (!line.warehouseId || !line.locationId) { rejected = `${line.item.navn}: vælg lager og placering for den modtagne vare.`; return; }
        const converted = stockQuantityForOrderLine({ ...line.item, id: line.itemId }, { enhed: line.unit }, line.quantity);
        if (!converted.ok) { rejected = converted.message; return; }
        const built = applyInventoryMovement({ ...tenantData.forbrugsvarer[line.itemId], id: line.itemId }, {
          type: "modtaget", quantity: converted.quantity, unit: converted.unit,
          requestId: `${requestId}-${line.id}`, warehouseId: line.warehouseId, warehouse: line.warehouse,
          locationId: line.locationId, location: line.location, expectedRevision: line.expectedRevision, departmentId: line.departmentId,
        }, { uid, actorName, now });
        if (!built.ok) { rejected = Object.values(built.errors)[0]; return; }
        tenantData.forbrugsvarer[line.itemId] = { ...built.item }; delete tenantData.forbrugsvarer[line.itemId].id;
        tenantData.forbrugsvarebevaegelser[`${purchaseId}-${line.id}`] = { ...built.movement, koebId: purchaseId };
        inventoryEffects.push({ itemId: line.itemId, before: built.movement.foer, after: built.movement.efter, delta: built.movement.delta, unit: built.movement.enhed });
      }
      tenantData.indkoeb[`${purchaseId}__${line.id}`] = {
        koebId: purchaseId, koebReference: readableReference, koebstype: "alleredeForetaget", dato: Date.parse(`${purchaseDate}T12:00:00Z`),
        leverandoerId: supplierId, vareId: line.itemId, vare: line.item.navn, varenummer: line.item.varenummer || line.itemId,
        antal: line.quantity, enhed: line.unit, prisPrEnhedOere: Math.round(line.amountOere / line.quantity), beloebOere: line.amountOere,
        afdelingId: line.departmentId, afdeling: line.department.label, betalingsform: paymentMethod === "faktura" ? "faktura" : "kontant",
        betalingsmetode: paymentMethod, bekraeftetKoeb: true, fakturastatus: paymentMethod === "faktura" ? "mangler" : "godkendt",
        kvitteringsstatus: "mangler", udgiftsstatus: "afventerGodkendelse", oekonomistatus: "ikkeBogfoert",
        lagerfoert: line.item.lagerfoert === true, lagerModtaget: line.item.lagerfoert === true,
        oprettetAf: uid, oprettetAfNavn: actorName, oprettetMs: now,
      };
    }
    tenantData.procureKoebsanmodninger ||= {};
    tenantData.procureKoebsanmodninger[requestId] = { purchaseId, reference: readableReference, fingerprint, oprettetAf: uid, oprettetMs: now, inventoryEffects };
    result = { already: false, purchaseId, reference: readableReference, inventoryEffects };
    return tenantData;
  });
  if (!tx.committed) throw new HttpsError(rejected.includes("ændret") ? "aborted" : "failed-precondition", rejected || "Købet kunne ikke gemmes.");
  await logProcure(tenantId, uid, AUDIT.opret, "indkoeb", purchaseId, null,
    { reference: result.reference, lines: lines.length }, result.already ? "gentaget kald — intet ekstra køb" : "allerede foretaget køb registreret");
  return { ok: true, ...result, status: "afventerUdgiftsgodkendelse", receiptStatus: "mangler",
    vendorMailSent: false, paymentCreated: false };
});

const koebBilagSti = (purchaseId, documentId) => `procureKoebsbilag/${purchaseId}/dokumenter/${documentId}`;
const koebBilagStorageSti = (tenantId, purchaseId, documentId) => `tenants/${tenantId}/procureKoeb/${purchaseId}/dokumenter/${documentId}`;
async function hentKoebslinjer(rod, purchaseId) {
  const snap = await rod.child("indkoeb").once("value");
  const rows = Object.entries(snap.val() || {}).filter(([, row]) => row.koebId === purchaseId);
  if (!rows.length) throw new HttpsError("not-found", "Købet findes ikke.");
  return rows;
}
export const procureKoebBilagUploadInitier = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const purchaseId = kortStreng(req.data?.purchaseId, 100); if (!purchaseId) throw new HttpsError("invalid-argument", "Købsreference mangler.");
  await hentKoebslinjer(rod, purchaseId);
  const name = kortStreng(req.data?.originalFilename, 200); const mimeType = kortStreng(req.data?.mimeType, 100); const size = Number(req.data?.size);
  if (!name || !TILLADT_MIME.includes(mimeType)) throw new HttpsError("invalid-argument", "Kun PDF, JPEG og PNG kan vedhæftes.");
  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILSTOERRELSE_BYTES) throw new HttpsError("invalid-argument", "Filstørrelsen er ugyldig eller over 25 MB.");
  const documentId = rod.child(`procureKoebsbilag/${purchaseId}/dokumenter`).push().key;
  const storagePath = koebBilagStorageSti(tenantId, purchaseId, documentId);
  await rod.child(koebBilagSti(purchaseId, documentId)).set({ documentId, originalFilename: name, validatedMime: mimeType, size, storagePath, uploader: uid, createdAt: Date.now(), status: "karantaene" });
  const uploadUrl = await lokalStorageUrl(req, { handling: "write", storagePath, mimeType, stoerrelse: size }) || (await getStorage().bucket().file(storagePath).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 600000, contentType: mimeType }))[0];
  return { documentId, storagePath, uploadUrl };
});
export const procureKoebBilagUploadBekraeft = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: "indkoeb.skriv", modul: "indkoeb" });
  const purchaseId = kortStreng(req.data?.purchaseId, 100); const documentId = kortStreng(req.data?.documentId, 80);
  const rows = await hentKoebslinjer(rod, purchaseId); const docRef = rod.child(koebBilagSti(purchaseId, documentId)); const snap = await docRef.once("value");
  if (!snap.exists()) throw new HttpsError("not-found", "Kvitteringen findes ikke."); const doc = snap.val();
  if (doc.status === "aktiv") return { ok: true, already: true, sha256: doc.sha256 };
  const file = getStorage().bucket().file(doc.storagePath); const [exists] = await file.exists(); if (!exists) throw new HttpsError("failed-precondition", "Uploaden er ikke modtaget.");
  const [meta] = await file.getMetadata(); const actualSize = Number(meta.size); const [head] = await file.download({ start: 0, end: 15 });
  if (!Number.isFinite(actualSize) || actualSize <= 0 || actualSize > MAX_FILSTOERRELSE_BYTES || !tjekSignatur(head, doc.validatedMime)) { await file.delete({ ignoreNotFound: true }); await docRef.update({ status: "afvist", rejectedAt: Date.now() }); throw new HttpsError("failed-precondition", "Filens type eller størrelse blev afvist."); }
  const [all] = await file.download(); const sha256 = createHash("sha256").update(all).digest("hex"); const verifiedAt = Date.now();
  const updates = { [`${koebBilagSti(purchaseId, documentId)}/status`]: "aktiv", [`${koebBilagSti(purchaseId, documentId)}/sha256`]: sha256, [`${koebBilagSti(purchaseId, documentId)}/verifiedAt`]: verifiedAt };
  for (const [lineId] of rows) { updates[`indkoeb/${lineId}/bilagId`] = documentId; updates[`indkoeb/${lineId}/kvitteringsstatus`] = "vedhaeftet"; }
  await rod.update(updates); await logProcure(tenantId, uid, AUDIT.tilstandsskift, "koebsbilag", documentId, { status: "karantaene" }, { status: "aktiv" }, "kvittering verificeret");
  return { ok: true, sha256, size: actualSize };
});
export const procureKoebBilagDownloadLink = onCall({ region: REGION }, async (req) => {
  const { rod, uid } = await procureDoer(req, { perm: "indkoeb.laes", modul: "indkoeb" });
  const purchaseId = kortStreng(req.data?.purchaseId, 100); const documentId = kortStreng(req.data?.documentId, 80); await hentKoebslinjer(rod, purchaseId);
  const snap = await rod.child(koebBilagSti(purchaseId, documentId)).once("value"); if (!snap.exists() || snap.val()?.status !== "aktiv") throw new HttpsError("not-found", "Kvitteringen er ikke tilgængelig.");
  const doc = snap.val(); const url = await lokalStorageUrl(req, { handling: "read", storagePath: doc.storagePath, mimeType: doc.validatedMime }) || (await getStorage().bucket().file(doc.storagePath).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 300000 }))[0];
  void uid; return { url, sha256: doc.sha256, expiresAt: Date.now() + 300000 };
});

/* ══════════════════════════════════════════════════════════════════════════
   FORBRUGSVARER — Procures eget varelager (beslutning 85)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ IKKE `varer`. Den node er Warehouses, hvor godset er KUNDENS og kundeId
   er paakraevet. Det her er vores egne handsker, straekfilm og filtre.
   ══════════════════════════════════════════════════════════════════════════ */
export const forbrugsvareskriv = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, {
    perm: ["indkoeb.skriv", "varer.skriv"], modul: ["indkoeb", "warehouse"],
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
  if (kortStreng(d.varegruppe, 80)) post.varegruppe = kortStreng(d.varegruppe, 80);
  if (kortStreng(d.standardAfdelingId, 60)) post.standardAfdelingId = kortStreng(d.standardAfdelingId, 60);
  post.aktiv = d.aktiv !== false;
  post.lagerfoert = d.lagerfoert === true;
  if (kortStreng(d.grundenhed, 20)) post.grundenhed = kortStreng(d.grundenhed, 20);
  if (kortStreng(d.bestillingsenhed, 20)) post.bestillingsenhed = kortStreng(d.bestillingsenhed, 20);
  if (Number.isFinite(Number(d.antalPrBestillingsenhed)) && Number(d.antalPrBestillingsenhed) > 0) {
    post.antalPrBestillingsenhed = Number(d.antalPrBestillingsenhed);
  }
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
  /* En ny vare har UKENDT beholdning. Nul er kun sandt efter en dokumenteret
     startoptælling; ellers ville manglende viden blive vist som en tom hylde. */

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
  if (vare.lagerfoert === true) {
    throw new HttpsError("failed-precondition",
      "Lagerførte varer skal registreres via Lager, så lager og placering bevares.");
  }
  if (post.standardAfdelingId) {
    const afdeling = await rod.child(`procureOpsaetning/afdelinger/${post.standardAfdelingId}`).once("value");
    if (!afdeling.exists() || afdeling.val()?.active === false) {
      throw new HttpsError("invalid-argument", "Standardafdelingen findes ikke eller er deaktiveret.");
    }
  }

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

/* PROCURE LAGER V2 — samme forbrugsvarer og samme append-only
   forbrugsvarebevaegelser som hidtil, nu med lagerplacering og revision.
   Transaktionen ligger på tenant-roden, så cache, historik og eventuelle to
   flytteben enten gemmes samlet eller slet ikke. */
export const procureLagerBevaegelse = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, {
    perm: "indkoeb.skriv", modul: "indkoeb",
  });
  const d = req.data || {};
  const requestId = kortStreng(d.requestId, 60);
  const forbrugsvareId = kortStreng(d.forbrugsvareId, 60);
  const type = kortStreng(d.type, 30);
  if (!requestId || !erGyldigtSendRequestId(requestId) || !forbrugsvareId) {
    throw new HttpsError("invalid-argument", "Vare- eller handlingsreference mangler eller er ugyldig.");
  }
  if (![...USER_INVENTORY_TYPES].includes(type)) {
    throw new HttpsError("invalid-argument", "Bevægelsestypen kan ikke registreres manuelt.");
  }
  const bruger = (await rod.child(`brugere/${uid}`).once("value")).val() || {};
  const actorName = kortStreng(bruger.navn || bruger.displayName || bruger.email, 160) || "Medarbejder";
  const tenantBeforeSnap = await rod.once("value");
  if (!tenantBeforeSnap.exists()) throw new HttpsError("not-found", "Kunden findes ikke.");
  const tenantBefore = tenantBeforeSnap.val();
  let coldFallback = true;
  let outcome = null;
  let failure = null;
  const tx = await rod.transaction((tenant) => {
    if (!tenant && coldFallback) tenant = structuredClone(tenantBefore);
    coldFallback = false;
    if (!tenant) { failure = "Kunden findes ikke."; return; }
    const existing = type === "flytning"
      ? [tenant.forbrugsvarebevaegelser?.[`${requestId}-ud`], tenant.forbrugsvarebevaegelser?.[`${requestId}-ind`]].filter(Boolean)
      : [tenant.forbrugsvarebevaegelser?.[requestId]].filter(Boolean);
    if (existing.length) {
      if (existing.some((movement) => movement.forbrugsvareId !== forbrugsvareId)
        || (type === "flytning" && existing.length !== 2)) {
        failure = "Handlingsreferencen er allerede brugt til en anden eller ufuldstændig bevægelse."; return;
      }
      outcome = { already: true, movements: existing, item: tenant.forbrugsvarer?.[forbrugsvareId] };
      return tenant;
    }
    const item = tenant.forbrugsvarer?.[forbrugsvareId];
    if (!item) { failure = "Varen findes ikke."; return; }
    const context = { uid, actorName, now: Date.now() };
    const input = {
      ...d, type, requestId,
      warehouseId: kortStreng(d.warehouseId, 60), warehouse: kortStreng(d.warehouse, 120),
      locationId: kortStreng(d.locationId, 60), location: kortStreng(d.location, 120),
      fromWarehouseId: kortStreng(d.fromWarehouseId, 60), fromWarehouse: kortStreng(d.fromWarehouse, 120),
      fromLocationId: kortStreng(d.fromLocationId, 60), fromLocation: kortStreng(d.fromLocation, 120),
      toWarehouseId: kortStreng(d.toWarehouseId, 60), toWarehouse: kortStreng(d.toWarehouse, 120),
      toLocationId: kortStreng(d.toLocationId, 60), toLocation: kortStreng(d.toLocation, 120),
      reason: kortStreng(d.reason, 250), orderId: kortStreng(d.orderId, 60),
    };
    const built = type === "flytning"
      ? applyInventoryTransfer({ ...item, id: forbrugsvareId }, input, context)
      : applyInventoryMovement({ ...item, id: forbrugsvareId }, input, context);
    if (!built.ok) { failure = Object.values(built.errors)[0]; return; }
    tenant.forbrugsvarer = tenant.forbrugsvarer || {};
    tenant.forbrugsvarer[forbrugsvareId] = built.item;
    tenant.forbrugsvarebevaegelser = tenant.forbrugsvarebevaegelser || {};
    const movements = built.movements || [built.movement];
    movements.forEach((movement, index) => {
      const movementId = movements.length === 1 ? requestId : `${requestId}-${index === 0 ? "ud" : "ind"}`;
      tenant.forbrugsvarebevaegelser[movementId] = movement;
    });
    outcome = { already: false, movements, item: built.item, locations: built.locations || [built.location] };
    return tenant;
  });
  if (!tx.committed || !outcome) {
    const conflict = /ændret af en anden/i.test(failure || "");
    throw new HttpsError(conflict ? "aborted" : "failed-precondition", failure || "Lagerbevægelsen kunne ikke registreres.");
  }
  const currentLocation = type === "flytning" ? null : inventoryLocation(outcome.item, d.warehouseId, d.locationId);
  const currentQuantity = currentLocation?.beholdning ?? outcome.item?.beholdning;
  await logProcure(tenantId, uid, AUDIT.aendre, "forbrugsvarer", forbrugsvareId,
    null, { antal: Number.isFinite(Number(currentQuantity)) ? Number(currentQuantity) : null },
    outcome.already ? "gentaget lagerkald — ingen dublet" : `lagerbevægelse: ${type}`);
  return { ok: true, requestId, already: outcome.already, item: outcome.item,
    movements: outcome.movements, locations: outcome.locations || (currentLocation ? [currentLocation] : []) };
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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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
const MAIL_ADAPTER = process.env.FUNCTIONS_EMULATOR === "true" ? localTestMailAdapter : mailgunAdapter;

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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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
  const perms = permStrengFraClaims(auth.token);

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

/* ═══════════════════════════════════════════════════════════════════════
 * EJERENS SALGSINDBAKKE, M365-OUTBOX OG SAGSSPECIFIK AI
 *
 * De normaliserede beskeder er data, aldrig instruktioner. Klienten kan kun
 * læse. Provider/webform-indlæsning, noter, links og AI-resultater skrives af
 * serveren med ejer- og revocationkontrol eller en signeret transportgrænse.
 * ═══════════════════════════════════════════════════════════════════════ */

const mailboxSafeId = (id) => sha256(String(id || "")).slice(0, 40);

async function findKommunikationsmatch(db, besked) {
  const kontaktEmail = normaliserEmail(besked.retning === "indgaaende" ? besked.fra : besked.til);
  if (!kontaktEmail) return { kendtKunde: false };
  const virksomheder = (await db.ref("udbyder/crm/virksomheder").once("value")).val() || {};
  for (const [virksomhedId, virksomhed] of Object.entries(virksomheder)) {
    const stam = virksomhed?.stamdata || {};
    const kontaktEmails = [stam.kontaktEmail, stam.fakturaEmail, ...(Object.values(virksomhed?.kontakter || {}).map((k) => k?.email))]
      .map(normaliserEmail).filter(Boolean);
    if (kontaktEmails.includes(kontaktEmail)) {
      return { kendtKunde: true, virksomhedId, virksomhedsnavn: tekst(stam.navn, 300), tenantId: tekst(stam.tenantId, 160) };
    }
  }
  return { kendtKunde: false };
}

async function naesteSupportnummer(db, nu = new Date()) {
  const aar = nu.getUTCFullYear();
  const ref = db.ref(`udbyder/arbejdsflow/sekvenser/support/${aar}`);
  const resultat = await ref.transaction((aktuel) => Math.max(0, Math.trunc(Number(aktuel) || 0)) + 1);
  if (!resultat.committed) throw new Error("Supportnummer kunne ikke reserveres.");
  return `SUP-${aar}-${String(resultat.snapshot.val()).padStart(4, "0")}`;
}

async function pauseOpfoelgningerForTilbud(tilbudId, aarsag) {
  const db = getDatabase();
  const snap = await db.ref("udbyder/salgsindbakke/traade").orderByChild("links/tilbudId").equalTo(tilbudId).once("value");
  const opdateringer = {}; const nu = Date.now();
  for (const [traadId, traad] of Object.entries(snap.val() || {})) {
    for (const [id, opf] of Object.entries(traad?.opfoelgninger || {})) {
      if (["planlagt", "kladde", "godkendt", "udskudt"].includes(opf?.status)) {
        const rod = `udbyder/salgsindbakke/traade/${traadId}/opfoelgninger/${id}`;
        opdateringer[`${rod}/status`] = "pauset";
        opdateringer[`${rod}/pauseAarsag`] = aarsag;
        opdateringer[`${rod}/opdateretMs`] = nu;
        opdateringer[`${rod}/revision`] = Number(opf.revision || 0) + 1;
      }
    }
  }
  if (Object.keys(opdateringer).length) await db.ref().update(opdateringer);
}

async function gemSalgsbesked(db, raa, aktor = "system") {
  const besked = normaliserBesked(raa);
  const match = await findKommunikationsmatch(db, besked);
  const kilde = postkasseKilde(raa.postkasseKilde || {});
  const klassifikation = klassificerKommunikation({
    fra: besked.fra, til: besked.til, emne: besked.emne, tekst: besked.tekst,
    mailboxType: kilde.type, kendtKunde: match.kendtKunde,
  });
  const dedupeId = sha256(besked.dedupeNoegle);
  const beskedId = `besked_${dedupeId.slice(0, 32)}`;
  const nu = Date.now();
  const dedupeRef = db.ref(`udbyder/salgsindbakke/dedupe/${dedupeId}`);
  let ny = false;
  const reservation = await dedupeRef.transaction((aktuel) => {
    if (aktuel?.status === "gemt") return aktuel;
    if (aktuel?.status === "reserveret" && nu - Number(aktuel.reserveretMs || 0) < 300_000) return aktuel;
    ny = true;
    return { status: "reserveret", beskedId, traadId: besked.traadId, reserveretMs: nu, noegleHash: dedupeId };
  });
  const dedupe = reservation.snapshot.val();
  if (!ny && dedupe?.status === "gemt") {
    // Deduplikering må ikke miste sporbarheden, når den samme RFC-mail findes
    // i flere personlige/delte postkasser. Vi føjer kun kilden til den fælles
    // besked; selve kundehændelsen forbliver én post.
    if (kilde.mailboxId || kilde.adresse) {
      const kildeRef = db.ref(`udbyder/salgsindbakke/traade/${dedupe.traadId}/beskeder/${dedupe.beskedId}/postkasseKilder`);
      const aktuelleKilder = (await kildeRef.once("value")).val() || {};
      await kildeRef.set(fletPostkasseKilder(aktuelleKilder, kilde));
    }
    return { ny: false, beskedId: dedupe.beskedId, traadId: dedupe.traadId };
  }
  if (!ny) return { ny: false, afventer: true, beskedId, traadId: besked.traadId };

  const traadRef = db.ref(`udbyder/salgsindbakke/traade/${besked.traadId}`);
  const eksisterende = (await traadRef.once("value")).val() || {};
  const status = besked.retning === "indgaaende"
    ? (eksisterende.oprettetMs ? "afventer_os" : "ny") : "afventer_kunden";
  const providerJobId = tekst(raa.providerJobId, 200);
  const sagstype = SAGSTYPER.has(raa.sagstype) ? raa.sagstype : (eksisterende.sagstype || klassifikation.sagstype);
  const delingsstatus = DELINGSSTATUS.has(raa.delingsstatus) ? raa.delingsstatus : (eksisterende.delingsstatus || klassifikation.delingsstatus);
  const postkasseKilder = fletPostkasseKilder(eksisterende.postkasseKilder, kilde);
  const opdateringer = {
    [`udbyder/salgsindbakke/traade/${besked.traadId}/id`]: besked.traadId,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/emne`]: besked.emne,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/status`]: eksisterende.status === "afsluttet" && besked.retning === "indgaaende" ? "afventer_os" : status,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/ansvarligUid`]: eksisterende.ansvarligUid || "",
    [`udbyder/salgsindbakke/traade/${besked.traadId}/oprettetMs`]: eksisterende.oprettetMs || nu,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/senesteAktivitetMs`]: Math.max(Number(eksisterende.senesteAktivitetMs || 0), besked.sendtMs),
    [`udbyder/salgsindbakke/traade/${besked.traadId}/senesteRetning`]: besked.retning,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/senesteFra`]: besked.fra,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/kilde`]: eksisterende.kilde || besked.kilde,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/kontaktEmail`]: eksisterende.kontaktEmail || (besked.retning === "indgaaende" ? besked.fra : ""),
    [`udbyder/salgsindbakke/traade/${besked.traadId}/revision`]: Number(eksisterende.revision || 0) + 1,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/sagstype`]: sagstype,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/delingsstatus`]: delingsstatus,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/kraeverKlassifikationsgennemgang`]: klassifikation.kraeverGennemgang,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/klassifikationsgrundlag`]: klassifikation.klassifikationsgrundlag,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/postkasseKilder`]: postkasseKilder,
    [`udbyder/salgsindbakke/traade/${besked.traadId}/beskeder/${beskedId}`]: { ...besked, id: beskedId, gemtMs: nu, gemtAf: aktor, postkasseKilder: fletPostkasseKilder({}, kilde) },
    [`udbyder/salgsindbakke/dedupe/${dedupeId}`]: { status: "gemt", beskedId, traadId: besked.traadId, gemtMs: nu, noegleHash: dedupeId },
  };
  if (match.virksomhedId && !eksisterende.links?.virksomhedId) opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/links/virksomhedId`] = match.virksomhedId;
  if (match.virksomhedsnavn) opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/virksomhedsnavn`] = match.virksomhedsnavn;
  if (match.tenantId) opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/links/tenantId`] = match.tenantId;
  if (sagstype === "support" && !eksisterende.support?.nummer) {
    opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/support`] = normaliserSupport({
      nummer: await naesteSupportnummer(db), type: "andet", status: "ny", prioritet: "normal",
    }, nu);
  }
  if (besked.kontakt?.navn) opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/kontaktNavn`] = besked.kontakt.navn;
  if (besked.kontakt?.telefon) opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/kontaktTelefon`] = besked.kontakt.telefon;
  if (besked.retning === "indgaaende") {
    opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/aiAnalyseJob`] = {
      status: "afventer", basisBeskedId: beskedId, anmodetMs: nu,
    };
  }
  if (providerJobId && besked.retning === "udgaaende") {
    const job = (await db.ref(`udbyder/mailjobs/${providerJobId}`).once("value")).val();
    opdateringer[`udbyder/mailjobs/${providerJobId}/status`] = "dokumenteret_sendt";
    opdateringer[`udbyder/mailjobs/${providerJobId}/dokumenteretSendtMs`] = besked.sendtMs;
    opdateringer[`udbyder/mailjobs/${providerJobId}/providerMessageId`] = besked.providerId;
    if (job?.virksomhedId) opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/links/virksomhedId`] = job.virksomhedId;
    if (job?.mulighedId) opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/links/mulighedId`] = job.mulighedId;
    if (job?.tilbudId) opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/links/tilbudId`] = job.tilbudId;
    if (job?.art === "tilbud" && job.tilbudId) {
      opdateringer[`udbyder/tilbud/${job.tilbudId}/status`] = "sendt";
      opdateringer[`udbyder/tilbud/${job.tilbudId}/sendt`] = { version: job.tilbudVersion, ms: besked.sendtMs, kanal: "microsoft365", mailjobId: providerJobId };
    }
    if (job?.art === "opfoelgning" && job.traadId && job.opfoelgningId) {
      const rod = `udbyder/salgsindbakke/traade/${job.traadId}/opfoelgninger/${job.opfoelgningId}`;
      opdateringer[`${rod}/status`] = "dokumenteret_sendt";
      opdateringer[`${rod}/dokumenteretSendtMs`] = besked.sendtMs;
      opdateringer[`${rod}/providerMessageId`] = besked.providerId;
    }
    if (job?.art === "sagssvar" && job.traadId && job.svarKladdeId) {
      const rod = `udbyder/salgsindbakke/traade/${job.traadId}/svarKladder/${job.svarKladdeId}`;
      opdateringer[`${rod}/status`] = "dokumenteret_sendt";
      opdateringer[`${rod}/dokumenteretSendtMs`] = besked.sendtMs;
      opdateringer[`${rod}/providerMessageId`] = besked.providerId;
    }
  }
  const opfoelgninger = eksisterende.opfoelgninger || {};
  if (besked.retning === "indgaaende") {
    for (const [id, opf] of Object.entries(opfoelgninger)) {
      if (["planlagt", "kladde", "godkendt", "udskudt"].includes(opf?.status)) {
        opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/opfoelgninger/${id}/status`] = "pauset";
        opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/opfoelgninger/${id}/pauseAarsag`] = "nyt_kundesvar";
        opdateringer[`udbyder/salgsindbakke/traade/${besked.traadId}/opfoelgninger/${id}/opdateretMs`] = nu;
      }
    }
  }
  await db.ref().update(opdateringer);
  return { ny: true, beskedId, traadId: besked.traadId };
}

export const salgsbeskedfixtureindlaes = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const emulatorer = /^demo-veyro-(ejer|owner)$/.test(process.env.GCLOUD_PROJECT || "")
    && process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIREBASE_DATABASE_EMULATOR_HOST
    && process.env.FIREBASE_STORAGE_EMULATOR_HOST && process.env.FUNCTIONS_EMULATOR;
  if (!emulatorer) throw new HttpsError("permission-denied", "Fixtureindlæsning findes kun i det fulde, isolerede ejer-emulatormiljø.");
  try {
    return await gemSalgsbesked(getDatabase(), { ...(req.data || {}), provider: "fixture" }, ejerUid);
  } catch (aarsag) {
    throw new HttpsError("invalid-argument", aarsag.message);
  }
});

export const salgshenvendelsemodtag = onRequest({ region: REGION, secrets: [WEBFORM_HMAC_SECRET], cors: false }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).send("Kun POST er tilladt."); return; }
  const secret = WEBFORM_HMAC_SECRET.value();
  const signatur = String(req.get("x-veyro-signature") || "");
  const tidsstempel = Number(req.get("x-veyro-timestamp"));
  const forventet = secret && req.rawBody ? `sha256=${createHmac("sha256", secret).update(req.rawBody).digest("hex")}` : "";
  const gyldigSignatur = signatur.length === forventet.length && signatur.length > 7
    && timingSafeEqual(Buffer.from(signatur), Buffer.from(forventet));
  if (!gyldigSignatur || !Number.isFinite(tidsstempel) || Math.abs(Date.now() - tidsstempel) > 300_000) {
    res.status(401).json({ ok: false, fejl: "Ugyldig eller forældet webhook-signatur." }); return;
  }
  const d = req.body || {};
  if (tekst(d.honeypot, 200)) { res.status(202).json({ ok: true, status: "afvist_spam" }); return; }
  const deliveryId = tekst(d.deliveryId, 200); const email = normaliserEmail(d.email); const besked = tekst(d.besked, 20_000);
  if (!deliveryId || !email || !besked) { res.status(400).json({ ok: false, fejl: "deliveryId, email og besked er påkrævet." }); return; }
  try {
    const resultat = await gemSalgsbesked(getDatabase(), {
      provider: "webform", providerId: deliveryId, eksternKorrelationId: deliveryId,
      retning: "indgaaende", fra: email, til: "info@veyrosystems.com",
      emne: tekst(d.emne, 500) || `Hjemmesidehenvendelse fra ${tekst(d.navn, 300) || email}`,
      tekst: `${tekst(d.navn, 300) ? `Navn: ${tekst(d.navn, 300)}\n` : ""}${tekst(d.telefon, 100) ? `Telefon: ${tekst(d.telefon, 100)}\n` : ""}${besked}`,
      kontakt: { navn: d.navn, email, telefon: d.telefon },
      sendtMs: Number(d.sendtMs) || Date.now(), kilde: tekst(d.kilde, 80) || "hjemmeside",
    }, "webform");
    res.status(resultat.ny ? 201 : 200).json({ ok: true, ny: resultat.ny, henvendelseId: resultat.traadId });
  } catch (aarsag) { res.status(400).json({ ok: false, fejl: tekst(aarsag.message, 500) }); }
});

export const ejerkommunikationhent = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const snap = await getDatabase().ref("udbyder/salgsindbakke/traade").once("value");
  const alle = snap.val() || {};
  const traade = Object.fromEntries(Object.entries(alle).filter(([, traad]) =>
    ejerMaaSeKommunikation(traad, ejerUid)
  ));
  return { ok: true, traade };
});

async function kraevSynligKommunikationstraad(traadId, ejerUid) {
  const ref = getDatabase().ref(`udbyder/salgsindbakke/traade/${traadId}`);
  const traad = (await ref.once("value")).val();
  if (!traad) throw new HttpsError("not-found", "Sagen findes ikke.");
  if (!ejerMaaSeKommunikation(traad, ejerUid)) throw new HttpsError("permission-denied", "Sagen er ikke tilgængelig for denne ejer.");
  return { ref, traad };
}

function kommunikationsTekstfingeraftryk(vaerdi = "") {
  let hash = 2166136261;
  for (const tegn of String(vaerdi)) {
    hash ^= tegn.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const salgstraadopdater = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const traadId = kraevCrmId(d.traadId, "Tråd-id");
  if (!TRAAD_STATUS.has(d.status)) throw new HttpsError("invalid-argument", "Ugyldig trådstatus.");
  const ansvarligUid = tekst(d.ansvarligUid, 160);
  if (ansvarligUid) await kraevRenEjerUid(ansvarligUid);
  const links = {
    virksomhedId: tekst(d.virksomhedId, 160), kontaktId: tekst(d.kontaktId, 160),
    mulighedId: tekst(d.mulighedId, 160), tilbudId: tekst(d.tilbudId, 160),
  };
  const ref = getDatabase().ref(`udbyder/salgsindbakke/traade/${traadId}`);
  const foer = (await ref.once("value")).val();
  if (!foer) throw new HttpsError("not-found", "Tråden findes ikke.");
  const forventet = kraevForventetRevision(d.forventetRevision);
  let konflikt = false;
  const nu = Date.now();
  const start = verificeretTransaktionsstart(foer);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = start(lokal);
    if (!aktuel || Number(aktuel.revision || 0) !== forventet) { konflikt = true; return; }
    const support = aktuel.sagstype === "support" && aktuel.support
      ? { ...aktuel.support, ansvarligUid, status: ansvarligUid && ["ny", "triage"].includes(aktuel.support.status) ? "afventer_os" : aktuel.support.status, opdateretMs: nu }
      : aktuel.support;
    return { ...aktuel, status: d.status, ansvarligUid, links, ...(support ? { support } : {}), revision: forventet + 1, opdateretMs: nu, opdateretAf: ejerUid };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "Tråden blev ændret samtidigt.");
  await skrivEjerAudit({ uid: ejerUid, handling: "salg.traad.opdater", objekt: "salgstraad", objektId: traadId });
  return { ok: true, revision: forventet + 1 };
});

export const salgsnoteopret = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const traadId = kraevCrmId(req.data?.traadId, "Tråd-id");
  const indhold = tekst(req.data?.tekst, 10_000);
  if (!indhold) throw new HttpsError("invalid-argument", "Noten er tom.");
  const { ref: traadRef } = await kraevSynligKommunikationstraad(traadId, ejerUid);
  const id = traadRef.child("noter").push().key;
  await traadRef.child(`noter/${id}`).set({ id, tekst: indhold, oprettetMs: Date.now(), oprettetAf: ejerUid, intern: true });
  await skrivEjerAudit({ uid: ejerUid, handling: "salg.note.opret", objekt: "salgstraad", objektId: traadId });
  return { ok: true, id };
});

export const kommunikationsklassifikationopdater = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {}; const traadId = kraevCrmId(d.traadId, "Sags-id");
  const sagstype = tekst(d.sagstype, 40); const delingsstatus = tekst(d.delingsstatus, 40);
  const internMappe = sagstype === "intern" ? tekst(d.internMappe, 80) : "";
  if (!SAGSTYPER.has(sagstype) || !DELINGSSTATUS.has(delingsstatus)) throw new HttpsError("invalid-argument", "Vælg en gyldig sagstype og deling.");
  const ref = getDatabase().ref(`udbyder/salgsindbakke/traade/${traadId}`);
  const foer = (await ref.once("value")).val(); const forventet = kraevForventetRevision(d.forventetRevision);
  if (!foer) throw new HttpsError("not-found", "Sagen findes ikke.");
  let konflikt = false; const start = verificeretTransaktionsstart(foer); const nu = Date.now();
  const resultat = await ref.transaction((lokal) => {
    const aktuel = start(lokal);
    if (!aktuel || Number(aktuel.revision || 0) !== forventet) { konflikt = true; return; }
    return { ...aktuel, sagstype, delingsstatus, internMappe, kraeverKlassifikationsgennemgang: false, revision: forventet + 1, opdateretMs: nu, opdateretAf: ejerUid };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "Sagen blev ændret samtidigt.");
  await skrivEjerAudit({ uid: ejerUid, handling: "kommunikation.klassifikation", objekt: "kommunikationssag", objektId: traadId });
  return { ok: true, revision: forventet + 1 };
});

export const kommunikationsaichatgem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req); const d = req.data || {};
  const traadId = kraevCrmId(d.traadId, "Sags-id"); const operationId = kraevCrmId(d.operationId, "Handlings-id");
  const instruktion = tekst(d.instruktion, 4_000); const forslag = tekst(d.forslag, 30_000);
  const forventetRevision = kraevForventetRevision(d.forventetRevision);
  const basisAktivitetMs = Math.trunc(Number(d.basisAktivitetMs) || 0);
  const basisKladdeRevision = Math.max(0, Math.trunc(Number(d.basisKladdeRevision) || 0));
  const basisKladdeFingeraftryk = tekst(d.basisKladdeFingeraftryk, 80);
  if (!instruktion || !forslag || !basisAktivitetMs || !basisKladdeFingeraftryk) throw new HttpsError("invalid-argument", "AI-chatten kræver instruktion, forslag og et aktuelt sagsgrundlag.");
  const { ref: traadRef, traad } = await kraevSynligKommunikationstraad(traadId, ejerUid);
  if (Number(traad.senesteAktivitetMs || 0) !== basisAktivitetMs) throw new HttpsError("failed-precondition", "Sagen har fået ny aktivitet. Generér forslaget igen.");
  const senesteKladde = Object.values(traad.svarKladder || {}).sort((a, b) => Number(b?.opdateretMs || 0) - Number(a?.opdateretMs || 0))[0] || null;
  if (Number(senesteKladde?.revision || 0) !== basisKladdeRevision
      || kommunikationsTekstfingeraftryk(senesteKladde?.tekst || "") !== basisKladdeFingeraftryk) {
    throw new HttpsError("failed-precondition", "Svarudkastet er ændret. Gem eller genindlæs kladden, før der laves et nyt forslag.");
  }
  const profil = (await getDatabase().ref(`profiler/${ejerUid}`).once("value")).val() || {};
  const aktorNavn = tekst(profil.navn || req.auth?.token?.name || req.auth?.token?.email, 160) || "Ejer";
  const operationNoegle = sha256(`${ejerUid}|${operationId}`).slice(0, 32);
  const ejerBeskedId = `e_${operationNoegle}`; const aiBeskedId = `a_${operationNoegle}`; const nu = Date.now();
  const arbejdsrumRef = traadRef.child("aiArbejdsrum");
  const foer = (await arbejdsrumRef.once("value")).val() || {}; let konflikt = false; let gentaget = false;
  const start = verificeretTransaktionsstart(foer);
  const resultat = await arbejdsrumRef.transaction((lokal) => {
    const aktuel = start(lokal) || {};
    if (aktuel.operationer?.[operationNoegle]) { gentaget = true; return aktuel; }
    if (Number(aktuel.revision || 0) !== forventetRevision) { konflikt = true; return; }
    return {
      ...aktuel,
      revision: forventetRevision + 1,
      chat: {
        ...(aktuel.chat || {}),
        [ejerBeskedId]: { id: ejerBeskedId, udvekslingId: operationNoegle, rolle: "ejer", tekst: instruktion, aktorUid: ejerUid, aktorNavn, oprettetMs: nu, intern: true },
        [aiBeskedId]: { id: aiBeskedId, udvekslingId: operationNoegle, rolle: "ai", tekst: forslag, aktorUid: "lokal_adapter", aktorNavn: "Lokal AI-testadapter", oprettetMs: nu + 1, intern: true },
      },
      aktivtForslag: { tekst: forslag, basisAktivitetMs, basisKladdeRevision, basisKladdeFingeraftryk, oprettetMs: nu + 1, oprettetAf: ejerUid, provider: "lokal_testadapter" },
      operationer: { ...(aktuel.operationer || {}), [operationNoegle]: { oprettetMs: nu, aktorUid: ejerUid } },
      opdateretMs: nu,
      opdateretAf: ejerUid,
    };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "AI-chatten blev ændret samtidigt. Genindlæs sagen og prøv igen.");
  if (!gentaget) await skrivEjerAudit({ uid: ejerUid, handling: "kommunikation.ai.chat.gem", objekt: "kommunikationssag", objektId: traadId });
  return { ok: true, revision: Number(resultat.snapshot.val()?.revision || forventetRevision + 1), gentaget };
});

function supportAiFakta(traad = {}) {
  const oplysninger = traad.sagsOplysninger || {};
  const beskeder = Object.values(traad.beskeder || {}).sort((a, b) => Number(b?.sendtMs || 0) - Number(a?.sendtMs || 0));
  const kundebesked = beskeder.find((post) => post?.retning === "indgaaende") || beskeder[0] || {};
  const kendt = (...navne) => {
    const post = navne.map((navn) => oplysninger[navn]).find(Boolean);
    return post?.tilstand === "mangler" ? "Ukendt" : tekst(post?.vaerdi, 1_000) || "Ukendt";
  };
  return {
    kunde: tekst(traad.virksomhedsnavn || traad.kontaktNavn || traad.kontaktEmail, 300) || "Ukendt kunde",
    modul: tekst(traad.support?.modul, 80) || "Ukendt",
    version: tekst(traad.support?.version || traad.support?.kendtVersion, 80) || kendt("version", "produktversion"),
    problem: tekst(traad.support?.problem || kundebesked.tekst, 3_000) || "Problemet er ikke beskrevet.",
    fejltekst: tekst(traad.support?.fejltekst, 1_000) || kendt("fejltekst", "fejl"),
    forsoegt: tekst(traad.support?.forsoegt, 2_000) || kendt("forsoegt", "fejlsoegning"),
  };
}

function supportAiKilder(traad, viden = {}) {
  const fakta = supportAiFakta(traad); const haystack = `${fakta.modul} ${fakta.problem} ${fakta.fejltekst}`.toLowerCase();
  return Object.entries(viden || {}).map(([id, post]) => {
    const noegleord = Array.isArray(post?.noegleord) ? post.noegleord.map((ord) => tekst(ord, 80).toLowerCase()).filter(Boolean) : [];
    const modul = tekst(post?.modul, 80); let relevans = modul && fakta.modul !== "Ukendt" && modul.toLowerCase() === fakta.modul.toLowerCase() ? 1 : 0;
    for (const ord of noegleord) if (haystack.includes(ord)) relevans += 3;
    return { id, titel: tekst(post?.titel, 300), indhold: tekst(post?.indhold, 12_000), kilde: tekst(post?.kilde, 1_000), modul,
      relevanteVersioner: tekst(post?.relevanteVersioner, 200) || "Ikke afgrænset", publikum: tekst(post?.publikum, 30) || "intern",
      vidensstatus: tekst(post?.vidensstatus, 30) || (post?.godkendt === true ? "godkendt" : "kladde"), godkendt: post?.godkendt === true, aktuelVersion: Number(post?.aktuelVersion || 0),
      gennemgaaetAfNavn: tekst(post?.gennemgaaetAfNavn, 160) || "Ikke registreret", gennemgaaetMs: Number(post?.gennemgaaetMs || 0), relevans };
  }).filter((post) => post.relevans >= 3 && post.titel && post.indhold && post.kilde && post.godkendt && post.vidensstatus === "godkendt")
    .sort((a, b) => b.relevans - a.relevans || b.aktuelVersion - a.aktuelVersion).slice(0, 5);
}

function bygLokaltSupportAiForslag(traad, viden, instruktion) {
  const fakta = supportAiFakta(traad); const kilder = supportAiKilder(traad, viden);
  const kundekilde = kilder.find((post) => post.publikum === "kunde_godkendt");
  const mangler = [fakta.version === "Ukendt" ? "produktversion" : "", fakta.fejltekst === "Ukendt" ? "præcis fejltekst eller logudsnit" : "", fakta.forsoegt === "Ukendt" ? "allerede udførte fejlsøgningstrin" : ""].filter(Boolean);
  const navn = tekst(traad.kontaktNavn, 120).split(/\s+/)[0] || "der"; const kort = /kort|kortere/i.test(instruktion);
  const kundesvar = kundekilde
    ? `Hej ${navn}.\n\nTak for din besked. ${tekst(kundekilde.indhold, kort ? 650 : 1_300)}${mangler.length ? `\n\nFor at kontrollere løsningen på jeres konkrete sag mangler vi ${mangler.join(", ")}.` : ""}\n\nSkriv gerne tilbage, hvis trinnene ikke løser problemet.`
    : `Hej ${navn}.\n\nTak for din besked. Vi har ikke tilstrækkeligt godkendt grundlag til at anvise en løsning endnu.${mangler.length ? `\n\nSend venligst ${mangler.join(", ")}, så vi kan undersøge sagen uden at gætte.` : "\n\nVi undersøger sagen manuelt og vender tilbage, når grundlaget er dokumenteret."}`;
  const vurdering = kundekilde ? "Dokumenteret løsning fundet i kundegodkendt produktviden. Fejlteksten er et signal, men beviser ikke alene årsagen."
    : kilder.length ? "Relevant intern viden findes, men ingen kilde er godkendt til kundesvar. Den må kun bruges til intern fejlsøgning."
      : "Ingen tilstrækkelig godkendt viden blev fundet. Indhent flere oplysninger eller undersøg sagen manuelt.";
  const aiSvar = `Dokumenterede fakta\nKunde: ${fakta.kunde}\nModul: ${fakta.modul}\nVersion: ${fakta.version}\nProblem: ${fakta.problem}\nForsøgt: ${fakta.forsoegt}\n\nVurdering\n${vurdering}\n\nDokumenterede kilder\n${kilder.length ? kilder.map((post) => `${post.titel} · v${post.aktuelVersion || "?"} · ${post.publikum === "kunde_godkendt" ? "kundegodkendt" : "kun intern"}`).join("\n") : "Ingen matchende godkendte kilder."}\n\n${mangler.length ? `Ukendt / næste spørgsmål\nBed om ${mangler.join(", ")}.` : "Næste trin\nKontrollér resultatet med kunden før sagen markeres løst."}`;
  return { kundesvar, aiSvar, fakta, kilder, mangler, harKundegodkendtLoesning: Boolean(kundekilde) };
}

export const supportaiforslaggem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req); const d = req.data || {};
  const traadId = kraevCrmId(d.traadId, "Support-id"); const operationId = kraevCrmId(d.operationId, "Handlings-id");
  const instruktion = tekst(d.instruktion, 4_000); const forventetRevision = kraevForventetRevision(d.forventetRevision);
  const basisAktivitetMs = Math.trunc(Number(d.basisAktivitetMs) || 0); const basisKladdeRevision = Math.max(0, Math.trunc(Number(d.basisKladdeRevision) || 0));
  const basisKladdeFingeraftryk = tekst(d.basisKladdeFingeraftryk, 80);
  if (!instruktion || !basisAktivitetMs || !basisKladdeFingeraftryk) throw new HttpsError("invalid-argument", "Support-AI kræver instruktion og et aktuelt sagsgrundlag.");
  const { ref: traadRef, traad } = await kraevSynligKommunikationstraad(traadId, ejerUid);
  if (traad.sagstype !== "support") throw new HttpsError("failed-precondition", "AI-fejlsøgning kan kun køres på en supportsag.");
  if (Number(traad.senesteAktivitetMs || 0) !== basisAktivitetMs) throw new HttpsError("failed-precondition", "Sagen har fået ny aktivitet. Generér forslaget igen.");
  const senesteKladde = Object.values(traad.svarKladder || {}).sort((a, b) => Number(b?.opdateretMs || 0) - Number(a?.opdateretMs || 0))[0] || null;
  if (Number(senesteKladde?.revision || 0) !== basisKladdeRevision || kommunikationsTekstfingeraftryk(senesteKladde?.tekst || "") !== basisKladdeFingeraftryk) throw new HttpsError("failed-precondition", "Svarudkastet er ændret. Gem eller genindlæs før ny fejlsøgning.");
  const viden = (await getDatabase().ref("udbyder/vidensbase/poster").once("value")).val() || {};
  const forslag = bygLokaltSupportAiForslag(traad, viden, instruktion);
  const profil = (await getDatabase().ref(`profiler/${ejerUid}`).once("value")).val() || {};
  const aktorNavn = tekst(profil.navn || req.auth?.token?.name || req.auth?.token?.email, 160) || "Ejer";
  const operationNoegle = sha256(`${ejerUid}|support|${operationId}`).slice(0, 32); const nu = Date.now();
  const arbejdsrumRef = traadRef.child("aiArbejdsrum"); const foer = (await arbejdsrumRef.once("value")).val() || {}; let konflikt = false; let gentaget = false;
  const start = verificeretTransaktionsstart(foer);
  const resultat = await arbejdsrumRef.transaction((lokal) => {
    const aktuel = start(lokal) || {};
    if (aktuel.operationer?.[operationNoegle]) { gentaget = true; return aktuel; }
    if (Number(aktuel.revision || 0) !== forventetRevision) { konflikt = true; return; }
    return { ...aktuel, revision: forventetRevision + 1, chat: { ...(aktuel.chat || {}),
      [`e_${operationNoegle}`]: { id: `e_${operationNoegle}`, udvekslingId: operationNoegle, rolle: "ejer", tekst: instruktion, aktorUid: ejerUid, aktorNavn, oprettetMs: nu, intern: true },
      [`a_${operationNoegle}`]: { id: `a_${operationNoegle}`, udvekslingId: operationNoegle, rolle: "ai", tekst: forslag.aiSvar, aktorUid: "lokal_support_adapter", aktorNavn: "Lokal Support-AI", oprettetMs: nu + 1, intern: true, kilder: forslag.kilder },
    }, aktivtForslag: { tekst: forslag.kundesvar, basisAktivitetMs, basisKladdeRevision, basisKladdeFingeraftryk, oprettetMs: nu + 1, oprettetAf: ejerUid, provider: "lokal_support_testadapter", kilder: forslag.kilder, mangler: forslag.mangler, harKundegodkendtLoesning: forslag.harKundegodkendtLoesning },
    operationer: { ...(aktuel.operationer || {}), [operationNoegle]: { oprettetMs: nu, aktorUid: ejerUid, art: "support_ai" } }, opdateretMs: nu, opdateretAf: ejerUid };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "Support-AI-chatten blev ændret samtidigt. Genindlæs sagen.");
  if (!gentaget) await skrivEjerAudit({ uid: ejerUid, handling: "support.ai.forslag.gem", objekt: "supportsag", objektId: traad.support?.nummer || traadId });
  return { ok: true, revision: Number(resultat.snapshot.val()?.revision || forventetRevision + 1), gentaget, harKundegodkendtLoesning: forslag.harKundegodkendtLoesning, antalKilder: forslag.kilder.length };
});

export const kommunikationssagsoplysninggem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req); const d = req.data || {};
  const traadId = kraevCrmId(d.traadId, "Sags-id"); const vaerdi = tekst(d.vaerdi, 4_000);
  const forventetRevision = kraevForventetRevision(d.forventetRevision);
  const { ref: traadRef } = await kraevSynligKommunikationstraad(traadId, ejerUid);
  const profil = (await getDatabase().ref(`profiler/${ejerUid}`).once("value")).val() || {};
  const aktorNavn = tekst(profil.navn || req.auth?.token?.name || req.auth?.token?.email, 160) || "Ejer";
  const ref = traadRef.child("sagsOplysninger/saelgerBaggrund"); const foer = (await ref.once("value")).val();
  if (Number(foer?.revision || 0) !== forventetRevision) throw new HttpsError("aborted", "Sagsoplysningen blev ændret samtidigt. Genindlæs sagen og prøv igen.");
  const nu = Date.now();
  await ref.set({ id: "saelgerBaggrund", label: "Sælgerens ekstra baggrund", vaerdi, tilstand: "tilfoejet_af_ejer", kilde: `${aktorNavn} · intern tilføjelse`, revision: forventetRevision + 1, raekke: 80, oprettetMs: foer?.oprettetMs || nu, opdateretMs: nu, opdateretAf: ejerUid, intern: true });
  await skrivEjerAudit({ uid: ejerUid, handling: "kommunikation.oplysning.gem", objekt: "kommunikationssag", objektId: traadId });
  return { ok: true, revision: forventetRevision + 1 };
});

export const supportsagopdater = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {}; const traadId = kraevCrmId(d.traadId, "Support-id");
  if (!SUPPORT_STATUS.has(d.status) || !SUPPORT_TYPER.has(d.type) || !SUPPORT_PRIORITET.has(d.prioritet)) throw new HttpsError("invalid-argument", "Supportstatus, type eller prioritet er ugyldig.");
  const ansvarligUid = tekst(d.ansvarligUid, 160); if (ansvarligUid) await kraevRenEjerUid(ansvarligUid);
  const ref = getDatabase().ref(`udbyder/salgsindbakke/traade/${traadId}`);
  const foer = (await ref.once("value")).val(); const forventet = kraevForventetRevision(d.forventetRevision);
  if (!foer) throw new HttpsError("not-found", "Sagen findes ikke.");
  const nummer = foer.support?.nummer || await naesteSupportnummer(getDatabase());
  const support = normaliserSupport({ ...d, nummer, ansvarligUid, opdateretMs: Date.now() });
  let konflikt = false; const start = verificeretTransaktionsstart(foer);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = start(lokal);
    if (!aktuel || Number(aktuel.revision || 0) !== forventet) { konflikt = true; return; }
    return { ...aktuel, sagstype: "support", delingsstatus: "delt", ansvarligUid, support, revision: forventet + 1, opdateretMs: Date.now(), opdateretAf: ejerUid };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "Supportsagen blev ændret samtidigt.");
  await skrivEjerAudit({ uid: ejerUid, handling: "support.sag.opdater", objekt: "supportsag", objektId: nummer });
  return { ok: true, nummer, revision: forventet + 1 };
});

export const ejerfravaergem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req); const d = req.data || {};
  const fraMs = Math.trunc(Number(d.fraMs) || 0); const tilMs = Math.trunc(Number(d.tilMs) || 0);
  const afloeserUid = tekst(d.afloeserUid, 160); if (afloeserUid) await kraevRenEjerUid(afloeserUid);
  if (d.aktiv === true && (!fraMs || !tilMs || tilMs <= fraMs)) throw new HttpsError("invalid-argument", "Fravær kræver en gyldig start og slutning.");
  await getDatabase().ref(`udbyder/arbejdsflow/fravaer/${ejerUid}`).set({ aktiv: d.aktiv === true, fraMs, tilMs, afloeserUid, opdateretMs: Date.now(), opdateretAf: ejerUid });
  await skrivEjerAudit({ uid: ejerUid, handling: "arbejdsflow.fravaer.gem", objekt: "ejerfravaer", objektId: ejerUid });
  return { ok: true };
});

export const ejerarbejdsflowhent = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const post = (await getDatabase().ref(`udbyder/arbejdsflow/fravaer/${ejerUid}`).once("value")).val() || {};
  return { fravaer: { aktiv: post.aktiv === true, fraMs: Number(post.fraMs || 0), tilMs: Number(post.tilMs || 0), afloeserUid: tekst(post.afloeserUid, 160), opdateretMs: Number(post.opdateretMs || 0) } };
});

function normaliserMailsignatur(post = {}) {
  const hjemmeside = tekst(post.hjemmeside, 500);
  if (hjemmeside && !/^https?:\/\//i.test(hjemmeside)) throw new HttpsError("invalid-argument", "Hjemmesiden skal begynde med http:// eller https://.");
  return {
    navn: tekst(post.navn, 160), titel: tekst(post.titel, 160), virksomhed: tekst(post.virksomhed, 160),
    telefon: tekst(post.telefon, 80), email: normaliserEmail(post.email), hjemmeside,
    ekstra: tekst(post.ekstra, 1_000), navnFed: post.navnFed !== false, titelKursiv: post.titelKursiv === true,
    brugLogo: post.brugLogo === true,
  };
}

export const ejermailsignaturhent = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const post = (await getDatabase().ref(`profiler/${ejerUid}/mailSignatur`).once("value")).val() || {};
  return { ok: true, signatur: { ...normaliserMailsignatur(post), revision: Number(post.revision || 0), opdateretMs: Number(post.opdateretMs || 0) } };
});

export const ejermailsignaturgem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req); const d = req.data || {};
  const ref = getDatabase().ref(`profiler/${ejerUid}/mailSignatur`);
  const foer = (await ref.once("value")).val() || {}; const forventet = kraevForventetRevision(d.forventetRevision);
  if (Number(foer.revision || 0) !== forventet) throw new HttpsError("aborted", "Mailsignaturen blev ændret samtidigt. Genindlæs og prøv igen.");
  const signatur = normaliserMailsignatur(d); const nu = Date.now();
  await ref.set({ ...signatur, revision: forventet + 1, oprettetMs: Number(foer.oprettetMs || nu), opdateretMs: nu, opdateretAf: ejerUid });
  await skrivEjerAudit({ uid: ejerUid, handling: "ejer.mail.signatur.gem", objekt: "ejerprofil", objektId: ejerUid });
  return { ok: true, revision: forventet + 1, opdateretMs: nu };
});

export const ejerleverandoererhent = onCall({ region: REGION }, async (req) => {
  await kraevUdbyder(req);
  const poster = (await getDatabase().ref("udbyder/leverandoerer").once("value")).val() || {};
  return { poster: Object.fromEntries(Object.entries(poster).map(([id, post]) => [id, {
    id, navn: tekst(post?.navn, 300), kategori: tekst(post?.kategori, 120), kontakt: tekst(post?.kontakt, 300),
    status: tekst(post?.status, 40), aftaleTil: tekst(post?.aftaleTil, 20), noter: tekst(post?.noter, 2_000), revision: Number(post?.revision || 0),
    opdateretMs: Number(post?.opdateretMs || 0), opdateretAf: tekst(post?.opdateretAf, 200),
  }])) };
});

export const ejerleverandoergem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req); const d = req.data || {}; const id = d.id ? kraevCrmId(d.id, "Leverandør-id") : getDatabase().ref("udbyder/leverandoerer").push().key;
  const navn = tekst(d.navn, 300); const kategori = tekst(d.kategori, 120); const kontakt = normaliserEmail(d.kontakt); const status = tekst(d.status, 40);
  if (!navn || !kategori || !kontakt || !["aktiv", "pause", "afsluttet"].includes(status)) throw new HttpsError("invalid-argument", "Leverandøren kræver navn, kategori, kontaktmail og gyldig status.");
  const ref = getDatabase().ref(`udbyder/leverandoerer/${id}`); const foer = (await ref.once("value")).val(); const forventet = kraevForventetRevision(d.forventetRevision);
  if (Number(foer?.revision || 0) !== forventet) throw new HttpsError("aborted", "Leverandøren blev ændret samtidigt.");
  await ref.set({ id, navn, kategori, kontakt, status, aftaleTil: tekst(d.aftaleTil, 20), noter: tekst(d.noter, 2_000), revision: forventet + 1, oprettetMs: foer?.oprettetMs || Date.now(), opdateretMs: Date.now(), opdateretAf: ejerUid });
  return { ok: true, id, revision: forventet + 1 };
});

export const kommunikationsnykladdeopret = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req); const d = req.data || {};
  const operationId = kraevCrmId(d.operationId, "Handlings-id");
  const sagstype = tekst(d.sagstype, 40); const delingsstatus = tekst(d.delingsstatus, 40);
  const fra = normaliserEmail(d.fra); const til = normaliserEmail(d.til);
  const emne = tekst(d.emne, 500); const mailtekst = tekst(d.tekst, 30_000);
  const tokenEmail = normaliserEmail(req.auth?.token?.email);
  if (!SAGSTYPER.has(sagstype) || sagstype === "uafklaret" || !DELINGSSTATUS.has(delingsstatus)) throw new HttpsError("invalid-argument", "Vælg en gyldig sagstype og deling.");
  if (!fra || !til || !emne || !mailtekst) throw new HttpsError("invalid-argument", "Mailkladden kræver afsender, modtager, emne og tekst.");
  if (fra !== "info@veyrosystems.com" && fra !== tokenEmail) throw new HttpsError("permission-denied", "Afsenderen er ikke en tilgængelig postkasse for denne ejer.");
  const traadId = `ny_${sha256(`${ejerUid}|${operationId}`).slice(0, 24)}`; const kladdeId = "start"; const nu = Date.now();
  const indhold = { fra, til, emne, tekst: mailtekst, signatur: tekst(d.signatur, 4_000), vedhaeftninger: Array.isArray(d.vedhaeftninger) ? d.vedhaeftninger.slice(0, 20) : [] };
  const postkasseId = fra === "info@veyrosystems.com" ? "info" : `personlig_${sha256(ejerUid).slice(0, 12)}`;
  const post = {
    id: traadId, emne, sagstype, delingsstatus, status: "afventer_os", ansvarligUid: ejerUid,
    kontaktEmail: til, kontaktNavn: til.split("@")[0], senesteFra: fra, senesteRetning: "udgaaende",
    senesteAktivitetMs: nu, oprettetMs: nu, opdateretMs: nu, oprettetAf: ejerUid, opdateretAf: ejerUid, revision: 1,
    kilde: { art: "lokal_kladde", adapter: "ejer" },
    postkasseKilder: { [postkasseId]: { mailboxId: postkasseId, adresse: fra, mappe: "drafts", type: fra === "info@veyrosystems.com" ? "delt" : "personlig", ...(fra === "info@veyrosystems.com" ? {} : { ejerUid }) } },
    svarKladder: { [kladdeId]: { ...indhold, id: kladdeId, status: "kladde", indholdHash: mailIndholdHash(indhold), basisAktivitetMs: nu, revision: 1, oprettetMs: nu, opdateretMs: nu, oprettetAf: ejerUid, opdateretAf: ejerUid } },
  };
  const ref = getDatabase().ref(`udbyder/salgsindbakke/traade/${traadId}`);
  const resultat = await ref.transaction((aktuel) => aktuel || post);
  if (!resultat.committed) throw new HttpsError("aborted", "Mailkladden kunne ikke oprettes.");
  const oprettet = Number(resultat.snapshot.val()?.oprettetMs) === nu;
  if (oprettet) await skrivEjerAudit({ uid: ejerUid, handling: "kommunikation.kladde.opret", objekt: "kommunikationssag", objektId: traadId });
  return { ok: true, traadId, kladdeId, oprettet };
});

export const kommunikationssvarkladdegem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req); const d = req.data || {};
  const traadId = kraevCrmId(d.traadId, "Sags-id"); const id = d.id ? kraevCrmId(d.id, "Kladde-id") : getDatabase().ref(`udbyder/salgsindbakke/traade/${traadId}/svarKladder`).push().key;
  const { ref: traadRef, traad } = await kraevSynligKommunikationstraad(traadId, ejerUid);
  const ref = traadRef.child(`svarKladder/${id}`); const foer = traad.svarKladder?.[id];
  const forventet = kraevForventetRevision(d.forventetRevision); if (Number(foer?.revision || 0) !== forventet) throw new HttpsError("aborted", "Svarudkastet blev ændret samtidigt.");
  const post = { fra: normaliserEmail(d.fra), til: normaliserEmail(d.til), emne: tekst(d.emne, 500), tekst: tekst(d.tekst, 30_000), signatur: tekst(d.signatur, 4_000), vedhaeftninger: Array.isArray(d.vedhaeftninger) ? d.vedhaeftninger.slice(0, 20) : [] };
  if (!post.fra || !post.til || !post.emne || !post.tekst) throw new HttpsError("invalid-argument", "Svarudkastet kræver afsender, modtager, emne og tekst.");
  const indholdHash = mailIndholdHash(post); const nu = Date.now(); let konflikt = false;
  const start = verificeretTransaktionsstart(foer);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = start(lokal);
    if (Number(aktuel?.revision || 0) !== forventet) { konflikt = true; return; }
    return { ...post, id, status: "kladde", indholdHash, basisAktivitetMs: Number(d.basisAktivitetMs || 0), revision: forventet + 1, oprettetMs: aktuel?.oprettetMs || nu, oprettetAf: aktuel?.oprettetAf || ejerUid, opdateretMs: nu, opdateretAf: ejerUid };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "Svarudkastet blev ændret samtidigt.");
  return { ok: true, id, revision: forventet + 1, indholdHash };
});

export const kommunikationssvargodkend = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req); const d = req.data || {}; const traadId = kraevCrmId(d.traadId, "Sags-id"); const id = kraevCrmId(d.id, "Kladde-id");
  const { ref: traadRef, traad } = await kraevSynligKommunikationstraad(traadId, ejerUid); const foer = traad.svarKladder?.[id];
  if (!foer || foer.status !== "kladde" || Number(foer.revision) !== kraevForventetRevision(d.forventetRevision)) throw new HttpsError("aborted", "Svarudkastet er ikke længere den kladde, du gennemgik.");
  if (Number(foer.basisAktivitetMs) !== Number(traad.senesteAktivitetMs || 0)) throw new HttpsError("failed-precondition", "Der er kommet ny aktivitet; gennemgå et nyt svarudkast.");
  const ref = traadRef.child(`svarKladder/${id}`); let konflikt = false; const start = verificeretTransaktionsstart(foer);
  const resultat = await ref.transaction((lokal) => {
    const aktuel = start(lokal);
    if (!aktuel || aktuel.status !== "kladde" || Number(aktuel.revision) !== Number(foer.revision) || aktuel.indholdHash !== foer.indholdHash) { konflikt = true; return; }
    return { ...aktuel, status: "godkendt", godkendtIndholdHash: aktuel.indholdHash, godkendtAf: ejerUid, godkendtMs: Date.now(), revision: Number(aktuel.revision) + 1 };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "Svarudkastet blev ændret under gennemgangen. Gem og gennemse igen.");
  return { ok: true, revision: Number(foer.revision) + 1 };
});

function graphBeskedTilIntern(post, folder, postkasse) {
  const header = (post.internetMessageHeaders || []).find((h) => String(h?.name || "").toLowerCase() === "x-veyro-job-id");
  const webform = (post.internetMessageHeaders || []).find((h) => String(h?.name || "").toLowerCase() === "x-veyro-submission-id");
  const udgaaende = folder === "sentitems";
  return {
    provider: "microsoft365", providerId: post.id, internetMessageId: post.internetMessageId,
    samtaleId: post.conversationId, eksternKorrelationId: webform?.value || "",
    providerJobId: header?.value || "", retning: udgaaende ? "udgaaende" : "indgaaende",
    fra: post.from?.emailAddress?.address || "", til: post.toRecipients?.[0]?.emailAddress?.address || "",
    emne: post.subject || "", tekst: post.body?.content || "",
    sendtMs: Date.parse(udgaaende ? post.sentDateTime : post.receivedDateTime) || Date.now(),
    kilde: udgaaende ? "microsoft365_sendt" : "microsoft365_indbakke",
    postkasseKilde: { mailboxId: postkasse.mailboxId, adresse: postkasse.adresse, type: postkasse.type, ejerUid: postkasse.ejerUid, mappe: folder },
  };
}

async function koerM365Synk({ aktorUid = "system" } = {}) {
  const db = getDatabase();
  const ref = db.ref("udbyder/integrationer/microsoft365");
  const config = (await ref.once("value")).val() || {};
  if (config.status !== "aktiv") return { ok: false, status: "ikke_tilsluttet", antal: 0 };
  const tenantId = tekst(config.entraTenantId, 200);
  const clientId = tekst(config.clientId, 200);
  const konfigurerede = Object.values(config.postkasser || {}).map(postkasseKilde).filter((p) => p.mailboxId);
  const postkasser = konfigurerede.length ? konfigurerede : [postkasseKilde({ mailboxId: config.mailboxId, adresse: config.salgsadresse || "info@veyrosystems.com", type: config.postkassetype || "uafklaret" })].filter((p) => p.mailboxId);
  if (!tenantId || !clientId || !postkasser.length || !M365_CLIENT_SECRET.value()) {
    throw new Error("Microsoft 365 mangler verificeret postkasse-id, Entra-konfiguration eller serversecret.");
  }
  const token = await hentGraphToken({ tenantId, clientId, clientSecret: M365_CLIENT_SECRET.value() });
  let antal = 0;
  for (const postkasse of postkasser) {
    for (const folder of ["inbox", "sentitems"]) {
      const mailboxHash = mailboxSafeId(postkasse.mailboxId);
      const deltaPath = `udbyder/integrationshemmeligheder/microsoft365/delta/${mailboxHash}/${folder}`;
      const deltaLink = (await db.ref(deltaPath).once("value")).val()?.link || null;
      const delta = await hentMailDelta({ token, mailboxId: postkasse.mailboxId, folderId: folder, deltaLink });
      for (const post of delta.beskeder) {
      if (post["@removed"] || post.isDraft) continue;
      const intern = graphBeskedTilIntern(post, folder, postkasse);
      if (intern.providerJobId) {
        const job = (await db.ref(`udbyder/mailjobs/${intern.providerJobId}`).once("value")).val();
        if (job?.traadId) intern.traadId = job.traadId;
      }
      if (!intern.fra || !intern.til || !intern.tekst) continue;
      if (post.hasAttachments) {
        const metadata = await hentMailVedhaeftninger({ token, mailboxId: postkasse.mailboxId, messageId: post.id });
        intern.vedhaeftninger = [];
        for (const vedh of metadata) {
          const gemt = { ...vedh, status: "metadata" };
          if (!vedh.inline && vedh.stoerrelse > 0 && vedh.stoerrelse <= 20 * 1024 * 1024) {
            try {
              const bytes = await hentMailVedhaeftningBytes({ token, mailboxId: postkasse.mailboxId, messageId: post.id, attachmentId: vedh.id });
              const hash = sha256(bytes); const storagePath = `ejer/salgsmail/${sha256(intern.samtaleId || intern.internetMessageId).slice(0, 32)}/${sha256(post.id).slice(0, 32)}/${hash}.bin`;
              const filnavn = (tekst(vedh.navn, 200) || "vedhaeftning").replace(/["\r\n]/g, "_");
              await getStorage().bucket().file(storagePath).save(bytes, { resumable: false, metadata: { contentType: vedh.mime || "application/octet-stream", contentDisposition: `attachment; filename="${filnavn}"`, cacheControl: "private, no-store", metadata: { originaltNavn: tekst(vedh.navn, 500), providerMessageHash: sha256(post.id) } } });
              Object.assign(gemt, { status: "gemt", storagePath, sha256: hash });
            } catch (aarsag) { Object.assign(gemt, { status: "ikke_hentet", fejl: tekst(aarsag.message, 300) }); }
          }
          intern.vedhaeftninger.push(gemt);
        }
      }
      const gemt = await gemSalgsbesked(db, intern, aktorUid);
      if (gemt.ny) antal += 1;
      }
      await db.ref(deltaPath).set({ link: delta.deltaLink, opdateretMs: Date.now(), mailboxHash, mappe: folder });
    }
  }
  await ref.update({ senesteSuccesMs: Date.now(), senesteFejl: null, synkroniseredePostkasser: postkasser.length });
  return { ok: true, status: "synkroniseret", antal, postkasser: postkasser.length };
}

export const m365salgsynkroniser = onCall({ region: REGION, secrets: [M365_CLIENT_SECRET], timeoutSeconds: 300 }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  try {
    const resultat = await koerM365Synk({ aktorUid: ejerUid });
    await skrivEjerAudit({ uid: ejerUid, handling: "salg.mail.synk", objekt: "microsoft365", objektId: "info" });
    return resultat;
  } catch (aarsag) {
    await getDatabase().ref("udbyder/integrationer/microsoft365").update({ senesteFejl: tekst(aarsag.message, 800), senesteFejlMs: Date.now() });
    throw new HttpsError("unavailable", aarsag.message);
  }
});

export const m365salgsynkronisering = onSchedule({ region: REGION, schedule: "every 5 minutes", secrets: [M365_CLIENT_SECRET], timeoutSeconds: 300 }, async () => {
  try { await koerM365Synk(); } catch (aarsag) {
    console.error("m365salgsynkronisering fejlede", { besked: tekst(aarsag.message, 500) });
    await getDatabase().ref("udbyder/integrationer/microsoft365").update({ senesteFejl: tekst(aarsag.message, 800), senesteFejlMs: Date.now() });
  }
});

export const salgsvedhaeftninghent = onCall({ region: REGION }, async (req) => {
  await kraevUdbyder(req); const traadId = kraevCrmId(req.data?.traadId, "Tråd-id"); const beskedId = kraevCrmId(req.data?.beskedId, "Besked-id"); const vedhaeftningId = tekst(req.data?.vedhaeftningId, 500);
  const vedhaeftninger = (await getDatabase().ref(`udbyder/salgsindbakke/traade/${traadId}/beskeder/${beskedId}/vedhaeftninger`).once("value")).val() || {};
  const vedh = Object.values(vedhaeftninger).find((v) => v?.id === vedhaeftningId);
  if (!vedh?.storagePath || vedh.status !== "gemt") throw new HttpsError("not-found", "Vedhæftningen er ikke vedvarende lagret.");
  const udloeberMs = Date.now() + 5 * 60_000;
  const [url] = await getStorage().bucket().file(vedh.storagePath).getSignedUrl({ action: "read", expires: udloeberMs });
  return { ok: true, url, udloeberMs, navn: vedh.navn, sha256: vedh.sha256 };
});

export const tilbudmailkladdeopret = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const tilbudId = kraevTilbudId(d.tilbudId);
  const version = Number(d.version);
  const tilbud = (await getDatabase().ref(`udbyder/tilbud/${tilbudId}`).once("value")).val();
  const versionPost = tilbud?.versioner?.[version];
  if (!versionPost?.snapshot || !versionPost?.pdf?.storagePath || version !== Number(tilbud.aktuelVersion)) {
    throw new HttpsError("failed-precondition", "Den aktuelle, udstedte tilbudsversion skal have en persistent PDF før mailkladden oprettes.");
  }
  const til = normaliserEmail(d.til || versionPost.snapshot.kontaktEmail);
  const emne = tekst(d.emne, 500);
  const mailtekst = tekst(d.tekst, 30_000);
  const signatur = tekst(d.signatur, 5_000);
  if (!til || !emne || !mailtekst) throw new HttpsError("invalid-argument", "Modtager, emne og mailtekst skal udfyldes.");
  const jobId = `tilbud_${tilbudId}_v${version}`;
  const ref = getDatabase().ref(`udbyder/mailjobs/${jobId}`);
  const foer = (await ref.once("value")).val();
  if (["accepteret_af_graph", "dokumenteret_sendt", "ukendt"].includes(foer?.status)) {
    throw new HttpsError("failed-precondition", "Tilbudsversionen har allerede et accepteret, dokumenteret eller ukendt afsendelsesudfald.");
  }
  const indhold = { til, emne, tekst: mailtekst, signatur, vedhaeftninger: [{ navn: `${tilbud.nummer}-v${version}.pdf`, mime: "application/pdf", storagePath: versionPost.pdf.storagePath, sha256: versionPost.pdf.sha256 }] };
  const nu = Date.now();
  const post = {
    id: jobId, art: "tilbud", status: "kladde", tilbudId, tilbudVersion: version,
    tilbudsnummer: tilbud.nummer, virksomhedId: tilbud.virksomhedId,
    mulighedId: tilbud.mulighedId || "", traadId: tekst(d.traadId, 160),
    ...indhold, indholdHash: mailIndholdHash(indhold), revision: Number(foer?.revision || 0) + 1,
    oprettetMs: foer?.oprettetMs || nu, opdateretMs: nu, opdateretAf: ejerUid,
  };
  await ref.set(post);
  await skrivEjerAudit({ uid: ejerUid, handling: "tilbud.mail.kladde", objekt: "mailjob", objektId: jobId });
  return { ok: true, jobId, revision: post.revision, status: post.status };
});

export const salgsopfoelgninggem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const traadId = kraevCrmId(d.traadId, "Tråd-id");
  const traadRef = getDatabase().ref(`udbyder/salgsindbakke/traade/${traadId}`);
  const traad = (await traadRef.once("value")).val();
  if (!traad) throw new HttpsError("not-found", "Tråden findes ikke.");
  const til = normaliserEmail(d.til);
  const emne = tekst(d.emne, 500);
  const mailtekst = tekst(d.tekst, 30_000);
  const signatur = tekst(d.signatur, 5_000);
  const forfalderMs = Number(d.forfalderMs);
  if (!til || !emne || !mailtekst || !Number.isFinite(forfalderMs)) throw new HttpsError("invalid-argument", "Opfølgningen kræver dato, modtager, emne og tekst.");
  const id = d.id ? kraevCrmId(d.id, "Opfølgnings-id") : traadRef.child("opfoelgninger").push().key;
  const ref = traadRef.child(`opfoelgninger/${id}`);
  const foer = (await ref.once("value")).val();
  const forventet = kraevForventetRevision(d.forventetRevision);
  if (Number(foer?.revision || 0) !== forventet) throw new HttpsError("aborted", "Opfølgningen blev ændret samtidigt.");
  const indhold = { til, emne, tekst: mailtekst, signatur, vedhaeftninger: Array.isArray(d.vedhaeftninger) ? d.vedhaeftninger : [] };
  const nu = Date.now();
  const status = forfalderMs > nu ? "planlagt" : "kladde";
  const post = { id, status, ...indhold, indholdHash: mailIndholdHash(indhold), basisAktivitetMs: Number(traad.senesteAktivitetMs || 0), forfalderMs, revision: forventet + 1, oprettetMs: foer?.oprettetMs || nu, opdateretMs: nu, opdateretAf: ejerUid };
  await ref.set(post);
  return { ok: true, id, revision: post.revision, status };
});

export const salgsopfoelgningforfald = onSchedule({ region: REGION, schedule: "every 15 minutes", timeoutSeconds: 300 }, async () => {
  const db = getDatabase(); const nu = Date.now();
  const snap = await db.ref("udbyder/salgsindbakke/traade").once("value");
  let aktiveret = 0; let pauset = 0;
  for (const [traadId, snapshot] of Object.entries(snap.val() || {})) {
    for (const [id, opf] of Object.entries(snapshot?.opfoelgninger || {})) {
      if (vurderForfaldenOpfoelgning(opf, snapshot, nu) === "uændret") continue;
      const traadRef = db.ref(`udbyder/salgsindbakke/traade/${traadId}`);
      const resultat = await traadRef.transaction((traad) => {
        const aktuel = traad?.opfoelgninger?.[id];
        const vurdering = vurderForfaldenOpfoelgning(aktuel, traad, nu);
        if (vurdering === "uændret") return;
        const naeste = { ...aktuel, revision: Number(aktuel.revision || 0) + 1, opdateretMs: nu, opdateretAf: "scheduler" };
        if (vurdering === "klar_til_godkendelse") {
          naeste.status = "kladde"; naeste.godkendelsesopgaveOprettetMs = nu;
        } else {
          naeste.status = "pauset"; naeste.pauseAarsag = vurdering;
        }
        return { ...traad, opfoelgninger: { ...traad.opfoelgninger, [id]: naeste } };
      });
      if (resultat.committed) {
        const status = resultat.snapshot.val()?.opfoelgninger?.[id]?.status;
        if (status === "kladde") aktiveret += 1;
        if (status === "pauset") pauset += 1;
      }
    }
  }
  console.log("salgsopfoelgningforfald", { aktiveret, pauset });
});

export const salgsopfoelgninggodkend = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const traadId = kraevCrmId(req.data?.traadId, "Tråd-id");
  const id = kraevCrmId(req.data?.id, "Opfølgnings-id");
  const ref = getDatabase().ref(`udbyder/salgsindbakke/traade/${traadId}`);
  const traad = (await ref.once("value")).val();
  const foer = traad?.opfoelgninger?.[id];
  if (!foer || foer.status !== "kladde") throw new HttpsError("failed-precondition", "Kun en kladde kan godkendes.");
  if (Number(foer.revision) !== kraevForventetRevision(req.data?.forventetRevision)) throw new HttpsError("aborted", "Opfølgningen blev ændret samtidigt.");
  if (Number(foer.basisAktivitetMs) !== Number(traad.senesteAktivitetMs || 0) || traad.status === "afsluttet") throw new HttpsError("failed-precondition", "Sagen har ændret sig; opret og gennemgå en ny kladde.");
  const nu = Date.now(); let konflikt = false; const opfRef = ref.child(`opfoelgninger/${id}`); const start = verificeretTransaktionsstart(foer);
  const resultat = await opfRef.transaction((lokal) => {
    const aktuel = start(lokal);
    if (!aktuel || aktuel.status !== "kladde" || Number(aktuel.revision) !== Number(foer.revision)) { konflikt = true; return; }
    return { ...aktuel, status: "godkendt", godkendtIndholdHash: aktuel.indholdHash, godkendtAf: ejerUid, godkendtMs: nu, revision: Number(aktuel.revision) + 1, opdateretMs: nu };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "Opfølgningen blev godkendt af en anden; genindlæs.");
  await skrivEjerAudit({ uid: ejerUid, handling: "salg.opfoelgning.godkend", objekt: "salgstraad", objektId: traadId });
  return { ok: true, revision: Number(resultat.snapshot.val().revision) };
});

export const salgsopfoelgningstatus = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const traadId = kraevCrmId(req.data?.traadId, "Tråd-id"); const id = kraevCrmId(req.data?.id, "Opfølgnings-id");
  const status = tekst(req.data?.status, 30); if (!["udskudt", "annulleret"].includes(status)) throw new HttpsError("invalid-argument", "Kun Udsæt eller Annullér er tilladt her.");
  const ref = getDatabase().ref(`udbyder/salgsindbakke/traade/${traadId}/opfoelgninger/${id}`);
  const foer = (await ref.once("value")).val(); const forventet = kraevForventetRevision(req.data?.forventetRevision);
  if (!foer || Number(foer.revision) !== forventet || ["afsender", "accepteret_af_graph", "dokumenteret_sendt"].includes(foer.status)) throw new HttpsError("aborted", "Opfølgningen kan ikke ændres i sin aktuelle tilstand.");
  const forfalderMs = status === "udskudt" ? Number(req.data?.forfalderMs) : Number(foer.forfalderMs);
  if (status === "udskudt" && (!Number.isFinite(forfalderMs) || forfalderMs <= Date.now())) throw new HttpsError("invalid-argument", "Vælg en fremtidig dato ved udsættelse.");
  await ref.update({ status, forfalderMs, godkendtIndholdHash: null, godkendtAf: null, godkendtMs: null, revision: forventet + 1, opdateretMs: Date.now(), opdateretAf: ejerUid });
  await skrivEjerAudit({ uid: ejerUid, handling: `salg.opfoelgning.${status}`, objekt: "salgstraad", objektId: traadId });
  return { ok: true, revision: forventet + 1 };
});

async function afsendMailjob({ jobId, forventetRevision, ejerUid }) {
  const db = getDatabase();
  const ref = db.ref(`udbyder/mailjobs/${jobId}`);
  const foer = (await ref.once("value")).val();
  if (!foer) throw new HttpsError("not-found", "Mailjobbet findes ikke.");
  if (["accepteret_af_graph", "dokumenteret_sendt", "ukendt"].includes(foer.status)) {
    throw new HttpsError("failed-precondition", "Mailjobbet har allerede et accepteret, dokumenteret eller ukendt udfald og må ikke sendes blindt igen.");
  }
  if (Number(foer.revision || 0) !== Number(forventetRevision)) throw new HttpsError("aborted", "Mailkladden blev ændret samtidigt.");
  if (foer.art === "opfoelgning") {
    const traad = (await db.ref(`udbyder/salgsindbakke/traade/${foer.traadId}`).once("value")).val();
    const opf = traad?.opfoelgninger?.[foer.opfoelgningId];
    const tilbudId = traad?.links?.tilbudId;
    const tilbudStatus = tilbudId ? (await db.ref(`udbyder/tilbud/${tilbudId}/status`).once("value")).val() : null;
    if (!godkendelseErAktuel(opf, traad) || ["accepteret", "afvist"].includes(tilbudStatus)) {
      await ref.update({ status: "pauset", fejl: "Godkendelsen er ikke længere aktuel.", opdateretMs: Date.now() });
      throw new HttpsError("failed-precondition", "Et nyt svar eller en sagsændring har ugyldiggjort godkendelsen.");
    }
  }
  if (foer.art === "sagssvar") {
    const traad = (await db.ref(`udbyder/salgsindbakke/traade/${foer.traadId}`).once("value")).val();
    const kladde = traad?.svarKladder?.[foer.svarKladdeId];
    const aktuelHash = mailIndholdHash(kladde || {});
    if (!kladde || kladde.status !== "godkendt" || kladde.godkendtIndholdHash !== aktuelHash
        || foer.indholdHash !== aktuelHash || Number(kladde.basisAktivitetMs) !== Number(traad?.senesteAktivitetMs || 0)
        || traad?.status === "afsluttet") {
      await ref.update({ status: "pauset", fejl: "Godkendelsen er ikke længere aktuel.", opdateretMs: Date.now() });
      throw new HttpsError("failed-precondition", "Et nyt svar eller en ændring har ugyldiggjort godkendelsen.");
    }
  }
  const integration = (await db.ref("udbyder/integrationer/microsoft365").once("value")).val() || {};
  if (integration.status !== "aktiv") {
    await ref.update({ status: "ikke_tilsluttet", fejl: "Microsoft 365 er ikke tilsluttet.", senesteForsoegMs: Date.now(), revision: Number(foer.revision) + 1 });
    throw new HttpsError("failed-precondition", "Microsoft 365 er ikke tilsluttet; intet er sendt.");
  }
  if (!tekst(integration.entraTenantId, 200) || !tekst(integration.clientId, 200) || !tekst(integration.mailboxId, 500) || !M365_CLIENT_SECRET.value()) {
    throw new HttpsError("failed-precondition", "Microsoft 365 mangler verificeret mailbox-id, Entra-konfiguration eller serversecret.");
  }
  // V6.1: den samme arbejdskerne bruges i produktion og i den isolerede
  // emulator-integrationstest. Testtransport og pause-hook er dependencies i
  // modulet og kan ikke aktiveres gennem en offentlig callable.
  if (typeof koerMailjobWorker === "function") {
    try {
      return await koerMailjobWorker({
        db,
        jobId,
        forventetRevision,
        ejerUid,
        transport: async ({ job }) => {
          const token = await hentGraphToken({ tenantId: integration.entraTenantId, clientId: integration.clientId, clientSecret: M365_CLIENT_SECRET.value() });
          let vedhaeftning = null;
          const vedh = job.vedhaeftninger?.[0];
          if (vedh?.storagePath) {
            const [bytes] = await getStorage().bucket().file(vedh.storagePath).download();
            if (vedh.sha256 && sha256(bytes) !== vedh.sha256) throw new Error("Vedhæftningens hash svarer ikke til den godkendte tilbudsversion.");
            vedhaeftning = { navn: vedh.navn, mime: vedh.mime, bytes };
          }
          return opretOgSendKladde({ token, mailboxId: integration.mailboxId, mail: job, vedhaeftning });
        },
        audit: () => skrivEjerAudit({ uid: ejerUid, handling: "salg.mail.graph.accepteret", objekt: "mailjob", objektId: jobId }),
      });
    } catch (aarsag) {
      if (aarsag instanceof MailjobWorkerFejl) throw new HttpsError(aarsag.kode, aarsag.message);
      throw aarsag;
    }
  }
  let konflikt = false;
  const start = verificeretTransaktionsstart(foer);
  const reserve = await ref.transaction((lokal) => {
    const aktuel = start(lokal);
    if (!aktuel || Number(aktuel.revision || 0) !== Number(forventetRevision) || !["kladde", "fejlet", "ikke_tilsluttet"].includes(aktuel.status)) { konflikt = true; return; }
    return { ...aktuel, status: "afsender", senesteForsoegMs: Date.now(), forsoeg: Number(aktuel.forsoeg || 0) + 1, revision: Number(aktuel.revision) + 1, opdateretAf: ejerUid };
  });
  if (!reserve.committed || konflikt) throw new HttpsError("aborted", "Mailjobbet kunne ikke reserveres; genindlæs før nyt forsøg.");
  const job = reserve.snapshot.val();
  try {
    // V6: job-id og revision er nu reserveret. Hent sagen igen og kontrollér
    // den sidst mulige lokale tilstand, før transportgrænsen krydses.
    if (["opfoelgning", "sagssvar"].includes(job.art)) {
      const friskTraad = (await db.ref(`udbyder/salgsindbakke/traade/${job.traadId}`).once("value")).val();
      const friskOpfoelgning = friskTraad?.opfoelgninger?.[job.opfoelgningId];
      const friskKladde = friskTraad?.svarKladder?.[job.svarKladdeId];
      const friskTilbudId = job.art === "opfoelgning" ? friskTraad?.links?.tilbudId : null;
      const friskTilbudStatus = friskTilbudId ? (await db.ref(`udbyder/tilbud/${friskTilbudId}/status`).once("value")).val() : null;
      const sidsteKontrol = vurderMailjobFoerTransport({ job, traad: friskTraad, opfoelgning: friskOpfoelgning, svarKladde: friskKladde, tilbudStatus: friskTilbudStatus });
      if (!sidsteKontrol.tilladt) {
        const nu = Date.now();
        const pause = { status: "pauset", pauseAarsag: sidsteKontrol.aarsag, fejl: "Afsendelsen blev stoppet ved sidste kontrol før Microsoft Graph.", opdateretMs: nu };
        await ref.update(pause);
        if (job.art === "opfoelgning" && friskOpfoelgning) await db.ref(`udbyder/salgsindbakke/traade/${job.traadId}/opfoelgninger/${job.opfoelgningId}`).update({ ...pause, revision: Number(friskOpfoelgning.revision || 0) + 1, pausetAf: "system", pausetMs: nu });
        throw new HttpsError("failed-precondition", "Afsendelsen blev stoppet, fordi sagen ændrede sig efter godkendelsen.");
      }
    }
    const token = await hentGraphToken({ tenantId: integration.entraTenantId, clientId: integration.clientId, clientSecret: M365_CLIENT_SECRET.value() });
    let vedhaeftning = null;
    const vedh = job.vedhaeftninger?.[0];
    if (vedh?.storagePath) {
      const [bytes] = await getStorage().bucket().file(vedh.storagePath).download();
      if (vedh.sha256 && sha256(bytes) !== vedh.sha256) throw new Error("Vedhæftningens hash svarer ikke til den godkendte tilbudsversion.");
      vedhaeftning = { navn: vedh.navn, mime: vedh.mime, bytes };
    }
    const svar = await opretOgSendKladde({ token, mailboxId: integration.mailboxId, mail: { ...job, jobId }, vedhaeftning });
    const graphAccepteretMs = Date.now();
    const opdateringer = {
      [`udbyder/mailjobs/${jobId}/status`]: "accepteret_af_graph",
      [`udbyder/mailjobs/${jobId}/providerDraftId`]: svar.providerDraftId,
      [`udbyder/mailjobs/${jobId}/graphAccepteretMs`]: graphAccepteretMs,
      [`udbyder/mailjobs/${jobId}/fejl`]: null,
      [`udbyder/mailjobs/${jobId}/opdateretMs`]: graphAccepteretMs,
    };
    if (job.art === "opfoelgning" && job.traadId && job.opfoelgningId) {
      const rod = `udbyder/salgsindbakke/traade/${job.traadId}/opfoelgninger/${job.opfoelgningId}`;
      opdateringer[`${rod}/status`] = "accepteret_af_graph";
      opdateringer[`${rod}/graphAccepteretMs`] = graphAccepteretMs;
    }
    if (job.art === "sagssvar" && job.traadId && job.svarKladdeId) {
      const rod = `udbyder/salgsindbakke/traade/${job.traadId}/svarKladder/${job.svarKladdeId}`;
      opdateringer[`${rod}/status`] = "accepteret_af_graph";
      opdateringer[`${rod}/graphAccepteretMs`] = graphAccepteretMs;
    }
    await db.ref().update(opdateringer);
    await skrivEjerAudit({ uid: ejerUid, handling: "salg.mail.graph.accepteret", objekt: "mailjob", objektId: jobId });
    return { ok: true, status: "accepteret_af_graph", dokumenteretSendt: false };
  } catch (aarsag) {
    if (`${aarsag?.message || ""}`.includes("sagen ændrede sig efter godkendelsen")) throw aarsag;
    const status = aarsag.ukendtUdfald ? "ukendt" : "fejlet";
    const fejlMs = Date.now();
    const opdateringer = {
      [`udbyder/mailjobs/${jobId}/status`]: status,
      [`udbyder/mailjobs/${jobId}/fejl`]: tekst(aarsag.message, 800),
      [`udbyder/mailjobs/${jobId}/providerDraftId`]: aarsag.providerDraftId || null,
      [`udbyder/mailjobs/${jobId}/opdateretMs`]: fejlMs,
    };
    if (job.art === "opfoelgning" && job.traadId && job.opfoelgningId) {
      const rod = `udbyder/salgsindbakke/traade/${job.traadId}/opfoelgninger/${job.opfoelgningId}`;
      opdateringer[`${rod}/status`] = status;
      opdateringer[`${rod}/fejl`] = tekst(aarsag.message, 800);
    }
    await db.ref().update(opdateringer);
    throw new HttpsError(status === "ukendt" ? "aborted" : "unavailable", `${aarsag.message} ${status === "ukendt" ? "Udfaldet er ukendt; genudsend ikke før manuel afstemning." : ""}`.trim());
  }
}

export const salgsmailafsend = onCall({ region: REGION, secrets: [M365_CLIENT_SECRET], timeoutSeconds: 120 }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const jobId = kraevCrmId(req.data?.jobId, "Mailjob-id");
  return afsendMailjob({ jobId, forventetRevision: kraevForventetRevision(req.data?.forventetRevision), ejerUid });
});

export const kommunikationssvarafsend = onCall({ region: REGION, secrets: [M365_CLIENT_SECRET], timeoutSeconds: 120 }, async (req) => {
  const ejerUid = await kraevUdbyder(req); const d = req.data || {};
  const traadId = kraevCrmId(d.traadId, "Sags-id"); const id = kraevCrmId(d.id, "Kladde-id");
  const { traad } = await kraevSynligKommunikationstraad(traadId, ejerUid); const kladde = traad.svarKladder?.[id];
  if (!kladde || kladde.status !== "godkendt" || kladde.godkendtIndholdHash !== mailIndholdHash(kladde)) throw new HttpsError("failed-precondition", "Svarudkastet er ikke konkret godkendt.");
  if (Number(kladde.revision) !== kraevForventetRevision(d.forventetRevision) || Number(kladde.basisAktivitetMs) !== Number(traad.senesteAktivitetMs || 0)) throw new HttpsError("aborted", "Sagen eller kladden har ændret sig siden godkendelsen.");
  const jobId = `sagssvar_${traadId}_${id}_r${kladde.revision}`; const jobRef = getDatabase().ref(`udbyder/mailjobs/${jobId}`);
  const opret = await jobRef.transaction((aktuel) => aktuel || { ...kladde, id: jobId, art: "sagssvar", status: "kladde", traadId, svarKladdeId: id, revision: 1, oprettetMs: Date.now(), oprettetAf: ejerUid });
  const job = opret.snapshot.val(); return afsendMailjob({ jobId, forventetRevision: Number(job.revision), ejerUid });
});

export const salgsopfoelgningafsend = onCall({ region: REGION, secrets: [M365_CLIENT_SECRET], timeoutSeconds: 120 }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const traadId = kraevCrmId(req.data?.traadId, "Tråd-id");
  const id = kraevCrmId(req.data?.id, "Opfølgnings-id");
  const traadRef = getDatabase().ref(`udbyder/salgsindbakke/traade/${traadId}`);
  const traad = (await traadRef.once("value")).val();
  const opf = traad?.opfoelgninger?.[id];
  const tilbudId = traad?.links?.tilbudId;
  const tilbudStatus = tilbudId ? (await getDatabase().ref(`udbyder/tilbud/${tilbudId}/status`).once("value")).val() : null;
  if (["accepteret", "afvist"].includes(tilbudStatus)) {
    const pauseAarsag = tilbudStatus === "accepteret" ? "tilbud_accepteret" : "tilbud_afvist";
    if (opf) await traadRef.child(`opfoelgninger/${id}`).update({ status: "pauset", pauseAarsag, pausetMs: Date.now(), pausetAf: "system", revision: Number(opf.revision || 0) + 1 });
    throw new HttpsError("failed-precondition", tilbudStatus === "accepteret" ? "Opfølgningen er stoppet, fordi tilbuddet er accepteret." : "Opfølgningen er stoppet, fordi tilbuddet er afvist.");
  }
  if (!godkendelseErAktuel(opf, traad)) throw new HttpsError("failed-precondition", "Opfølgningen er ikke konkret godkendt eller sagen har ændret sig.");
  if (Number(opf.revision) !== kraevForventetRevision(req.data?.forventetRevision)) throw new HttpsError("aborted", "Opfølgningen blev ændret samtidigt.");
  const jobId = `opfoelgning_${traadId}_${id}_r${opf.revision}`;
  const jobRef = getDatabase().ref(`udbyder/mailjobs/${jobId}`);
  const opret = await jobRef.transaction((aktuel) => aktuel || { ...opf, id: jobId, art: "opfoelgning", status: "kladde", traadId, opfoelgningId: id, revision: 1, oprettetMs: Date.now(), oprettetAf: ejerUid });
  const job = opret.snapshot.val();
  return afsendMailjob({ jobId, forventetRevision: Number(job.revision), ejerUid });
});

export const videnspostgem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const d = req.data || {};
  const id = d.id ? kraevCrmId(d.id, "Videns-id") : getDatabase().ref("udbyder/vidensbase/poster").push().key;
  const titel = tekst(d.titel, 300); const indhold = tekst(d.indhold, 30_000); const kilde = tekst(d.kilde, 1_000);
  const leveringsstatus = tekst(d.leveringsstatus, 40);
  if (!titel || !indhold || !kilde || !VIDEN_STATUS.has(leveringsstatus)) throw new HttpsError("invalid-argument", "Viden kræver titel, tekst, kilde og gyldig leveringsstatus.");
  const ref = getDatabase().ref(`udbyder/vidensbase/poster/${id}`);
  const foer = (await ref.once("value")).val();
  const forventet = kraevForventetRevision(d.forventetRevision);
  if (Number(foer?.revision || 0) !== forventet) throw new HttpsError("aborted", "Vidensposten blev ændret samtidigt.");
  const version = Number(foer?.aktuelVersion || 0) + 1; const nu = Date.now();
  const vidensstatus = ["godkendt", "kladde", "foraeldet"].includes(d.vidensstatus) ? d.vidensstatus : d.godkendt === true ? "godkendt" : "kladde";
  const publikum = ["intern", "kunde_godkendt", "sag"].includes(d.publikum) ? d.publikum : "intern";
  const metadata = { modul: tekst(d.modul, 80), relevanteVersioner: tekst(d.relevanteVersioner, 200), vidensstatus, publikum,
    noegleord: Array.isArray(d.noegleord) ? d.noegleord.map((ord) => tekst(ord, 80).toLowerCase()).filter(Boolean).slice(0, 30) : [],
    gennemgaaetAfNavn: d.godkendt === true ? tekst(d.gennemgaaetAfNavn, 160) || "Godkendt ejer" : "", gennemgaaetMs: d.godkendt === true ? nu : 0 };
  const snapshot = { titel, indhold, kilde, leveringsstatus, godkendt: d.godkendt === true, ...metadata, version, oprettetMs: nu, oprettetAf: ejerUid };
  await ref.set({ id, titel, indhold, kilde, leveringsstatus, godkendt: snapshot.godkendt, ...metadata, aktuelVersion: version, revision: forventet + 1, oprettetMs: foer?.oprettetMs || nu, opdateretMs: nu, opdateretAf: ejerUid, versioner: { ...(foer?.versioner || {}), [version]: snapshot } });
  await skrivEjerAudit({ uid: ejerUid, handling: "salg.viden.gem", objekt: "videnspost", objektId: id });
  return { ok: true, id, version, revision: forventet + 1 };
});

function aiMaaned(nu = new Date()) { return nu.toISOString().slice(0, 7); }

async function reserverAiBudget(db, integration, inputEstimat, outputMaks) {
  const maaned = aiMaaned(); const ref = db.ref(`udbyder/ai/forbrug/${maaned}`); let afvist = false;
  const resultat = await ref.transaction((aktuel) => {
    const forbrug = aktuel || {};
    if (!aiBudgetKanReserveres(forbrug, integration.graense || {}, inputEstimat, outputMaks)) { afvist = true; return; }
    return { ...forbrug, requests: Number(forbrug.requests || 0) + 1, reserveretInputTokens: Number(forbrug.reserveretInputTokens || 0) + inputEstimat, reserveretOutputTokens: Number(forbrug.reserveretOutputTokens || 0) + outputMaks, opdateretMs: Date.now() };
  });
  if (!resultat.committed || afvist) throw new HttpsError("resource-exhausted", "AI-forbrugsgrænsen er nået; mail og CRM fungerer fortsat uden AI.");
  return { maaned, ref, inputEstimat, outputMaks };
}

async function afstemAiBudget(reservation, usage = {}) {
  await reservation.ref.transaction((aktuel) => ({ ...(aktuel || {}),
    reserveretInputTokens: Math.max(0, Number(aktuel?.reserveretInputTokens || 0) - reservation.inputEstimat),
    reserveretOutputTokens: Math.max(0, Number(aktuel?.reserveretOutputTokens || 0) - reservation.outputMaks),
    inputTokens: Number(aktuel?.inputTokens || 0) + Number(usage.inputTokens || 0),
    outputTokens: Number(aktuel?.outputTokens || 0) + Number(usage.outputTokens || 0), opdateretMs: Date.now(),
  }));
}

function sagKontekst(traad, viden, tilbud, spoergsmaal = "") {
  const beskeder = Object.values(traad?.beskeder || {}).sort((a, b) => Number(a.sendtMs) - Number(b.sendtMs)).slice(-20).map((b) => ({ id: b.id, retning: b.retning, fra: b.fra, sendtMs: b.sendtMs, emne: b.emne, tekst: tekst(b.tekst, 8_000) }));
  const noter = Object.values(traad?.noter || {}).sort((a, b) => Number(a.oprettetMs) - Number(b.oprettetMs)).slice(-20).map((n) => ({ id: n.id, tekst: tekst(n.tekst, 4_000) }));
  const aiSamtale = Object.values(traad?.aiSamtaler || {}).sort((a, b) => Number(a.oprettetMs) - Number(b.oprettetMs)).slice(-10).map((a) => ({ spoergsmaal: tekst(a.spoergsmaal, 4_000), svar: tekst(a.svar, 8_000) }));
  const godkendtViden = Object.values(viden || {}).filter((v) => v?.godkendt === true).map((v) => ({ id: v.id, titel: v.titel, indhold: tekst(v.indhold, 8_000), kilde: v.kilde, leveringsstatus: v.leveringsstatus, version: v.aktuelVersion }));
  return JSON.stringify({ sag: { id: traad.id, emne: traad.emne, status: traad.status, links: traad.links || {} }, beskeder, interneNoter: noter, internAiSamtale: aiSamtale, tilbud: tilbud || null, godkendtViden, brugerensSpoergsmaal: spoergsmaal });
}

async function koerSagAi({ traadId, ejerUid, spoergsmaal = "", analyse }) {
  const db = getDatabase(); const integration = (await db.ref("udbyder/integrationer/openai").once("value")).val() || {};
  if (integration.status !== "aktiv") throw new HttpsError("failed-precondition", "OpenAI er ikke tilsluttet; mail og CRM fungerer fortsat.");
  const model = tekst(integration.model, 120); const apiKey = OPENAI_API_KEY.value();
  if (!model || !apiKey) throw new HttpsError("failed-precondition", "OpenAI mangler godkendt model eller serversecret.");
  const traad = (await db.ref(`udbyder/salgsindbakke/traade/${traadId}`).once("value")).val();
  if (!traad) throw new HttpsError("not-found", "Sagen findes ikke.");
  const [videnSnap, tilbudSnap] = await Promise.all([db.ref("udbyder/vidensbase/poster").once("value"), traad.links?.tilbudId ? db.ref(`udbyder/tilbud/${traad.links.tilbudId}`).once("value") : Promise.resolve(null)]);
  const kontekst = sagKontekst(traad, videnSnap.val(), tilbudSnap?.val?.(), spoergsmaal);
  const outputMaks = Math.min(3_000, Math.max(300, Number(integration.outputMaks || 1_800))); const inputEstimat = Math.ceil(kontekst.length / 4);
  const reservation = await reserverAiBudget(db, integration, inputEstimat, outputMaks);
  try {
    const request = byggOpenAiAnmodning({ model, instruktion: SALGS_AI_INSTRUKTION, kontekst, outputMaks, analyse });
    const svar = await kaldOpenAi({ apiKey, request }); await afstemAiBudget(reservation, svar.usage);
    const id = db.ref(`udbyder/salgsindbakke/traade/${traadId}/${analyse ? "analyser" : "aiSamtaler"}`).push().key;
    const post = analyse ? { id, ...svar.resultat, providerResponseId: svar.id, model, usage: svar.usage, revision: 1, oprettetMs: Date.now(), oprettetAf: ejerUid, redigerbar: true }
      : { id, spoergsmaal: tekst(spoergsmaal, 4_000), svar: svar.tekst, providerResponseId: svar.id, model, usage: svar.usage, oprettetMs: Date.now(), oprettetAf: ejerUid, intern: true };
    await db.ref(`udbyder/salgsindbakke/traade/${traadId}/${analyse ? "analyser" : "aiSamtaler"}/${id}`).set(post);
    return { ok: true, id, resultat: analyse ? svar.resultat : { svar: svar.tekst }, usage: svar.usage };
  } catch (aarsag) {
    await afstemAiBudget(reservation);
    throw aarsag instanceof HttpsError ? aarsag : new HttpsError("unavailable", aarsag.message);
  }
}

export const salgsanalysekoer = onCall({ region: REGION, secrets: [OPENAI_API_KEY], timeoutSeconds: 120 }, async (req) => {
  const ejerUid = await kraevUdbyder(req); const traadId = kraevCrmId(req.data?.traadId, "Tråd-id");
  return koerSagAi({ traadId, ejerUid, analyse: true });
});

export const salgsassistentspoerg = onCall({ region: REGION, secrets: [OPENAI_API_KEY], timeoutSeconds: 120 }, async (req) => {
  const ejerUid = await kraevUdbyder(req); const traadId = kraevCrmId(req.data?.traadId, "Tråd-id"); const spoergsmaal = tekst(req.data?.spoergsmaal, 4_000);
  if (!spoergsmaal) throw new HttpsError("invalid-argument", "Skriv et spørgsmål til assistenten.");
  return koerSagAi({ traadId, ejerUid, spoergsmaal, analyse: false });
});

export const salgsanalysesvarudkastgem = onCall({ region: REGION }, async (req) => {
  const ejerUid = await kraevUdbyder(req);
  const traadId = kraevCrmId(req.data?.traadId, "Tråd-id");
  const analyseId = kraevCrmId(req.data?.analyseId, "Analyse-id");
  const svarudkast = tekst(req.data?.svarudkast, 30_000);
  const forventetRevision = kraevForventetRevision(req.data?.forventetRevision);
  const ref = getDatabase().ref(`udbyder/salgsindbakke/traade/${traadId}/analyser/${analyseId}`);
  let konflikt = false;
  const resultat = await ref.transaction((aktuel) => {
    if (!aktuel || Number(aktuel.revision || 0) !== forventetRevision) { konflikt = true; return; }
    return { ...aktuel, svarudkast, revision: forventetRevision + 1, svarudkastOpdateretMs: Date.now(), svarudkastOpdateretAf: ejerUid };
  });
  if (!resultat.committed || konflikt) throw new HttpsError("aborted", "Analyseudkastet blev ændret samtidigt.");
  await skrivEjerAudit({ uid: ejerUid, handling: "salg.analyse.svarudkast.gem", objekt: "salgstraad", objektId: traadId });
  return { ok: true, revision: forventetRevision + 1 };
});

export const salgsanalyseautomatisk = onSchedule({ region: REGION, schedule: "every 5 minutes", secrets: [OPENAI_API_KEY], timeoutSeconds: 300 }, async () => {
  const db = getDatabase();
  const integration = (await db.ref("udbyder/integrationer/openai").once("value")).val() || {};
  if (integration.status !== "aktiv") return;
  const snap = await db.ref("udbyder/salgsindbakke/traade").once("value");
  for (const [traadId, traad] of Object.entries(snap.val() || {})) {
    const basisBeskedId = tekst(traad?.aiAnalyseJob?.basisBeskedId, 160);
    if (traad?.aiAnalyseJob?.status !== "afventer" || !basisBeskedId) continue;
    const jobRef = db.ref(`udbyder/salgsindbakke/traade/${traadId}/aiAnalyseJob`);
    const reserve = await jobRef.transaction((aktuel) => {
      if (aktuel?.status !== "afventer" || aktuel?.basisBeskedId !== basisBeskedId) return;
      return { ...aktuel, status: "koerer", startetMs: Date.now(), forsoeg: Number(aktuel.forsoeg || 0) + 1 };
    });
    if (!reserve.committed) continue;
    try {
      const resultat = await koerSagAi({ traadId, ejerUid: "system", analyse: true });
      await jobRef.transaction((aktuel) => aktuel?.status === "koerer" && aktuel?.basisBeskedId === basisBeskedId
        ? { ...aktuel, status: "faerdig", analyseId: resultat.id, faerdigMs: Date.now(), fejl: null }
        : undefined);
    } catch (aarsag) {
      await jobRef.transaction((aktuel) => aktuel?.status === "koerer" && aktuel?.basisBeskedId === basisBeskedId
        ? { ...aktuel, status: "fejlet", fejl: tekst(aarsag.message, 800), fejletMs: Date.now() }
        : undefined);
      console.error("salgsanalyseautomatisk fejlede", { traadId, besked: tekst(aarsag.message, 500) });
    }
  }
});

/* ══════════════════════════════════════════════════════════════════════
   FLEET SERVICEAUTOMATIK — serverstyret og idempotent pr. servicecyklus.

   Browserprototypen må gerne forklare beregningen, men den må ikke være den
   proces der holder øje. Scheduler og manuel emulatorvej kalder præcis samme
   tenanttransaktion. Forekomst-, indberetnings- og sags-id'er afledes af den
   stabile cyklusnøgle; gentagelse eller samtidighed kan derfor ikke oprette
   en dublet. Ingen mail eller ekstern forbindelse aktiveres her.
   ══════════════════════════════════════════════════════════════════════ */

export const fleetServiceKravGem = onCall({ region: REGION }, async (req) => {
  const { rod, tenantId, uid } = await procureDoer(req, { perm: PERM.koeretoejerSkriv, modul: "flaade" });
  const mutationId = kortStreng(req.data?.mutationId, 80);
  const requestedId = kortStreng(req.data?.id, 80);
  const expectedRevision = Number(req.data?.forventetRevision ?? 0);
  if (!mutationId || !erGyldigtSendRequestId(mutationId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new HttpsError("invalid-argument", "Gemmereference eller forventet revision er ugyldig.");
  }
  const validated = validateFleetServiceRequirement(req.data?.krav || {});
  if (!validated.ok) {
    throw new HttpsError("invalid-argument", Object.values(validated.errors)[0], { fejl: validated.errors });
  }
  const requirementId = requestedId || `servicekrav_${createHash("sha256").update(`${tenantId}:${mutationId}`).digest("hex").slice(0, 24)}`;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(requirementId)) throw new HttpsError("invalid-argument", "Servicekrav-id er ugyldigt.");
  const openOccurrenceAction = kortStreng(req.data?.aabenForekomstHandling, 20) || null;
  if (openOccurrenceAction && openOccurrenceAction !== "bevar") {
    throw new HttpsError("invalid-argument", "Håndteringen af den åbne serviceforekomst er ugyldig.");
  }
  const requestHash = createHash("sha256").update(JSON.stringify({
    krav: validated.value,
    aabenForekomstHandling: openOccurrenceAction,
  })).digest("hex");
  let rejected = null;
  let saved = null;
  let repeated = false;
  const nowMs = Date.now();
  const before = await rod.once("value");
  let warm = before.exists();
  const tx = await rod.transaction((tenant) => {
    if (!tenant && warm) tenant = structuredClone(before.val());
    warm = false;
    if (!tenant) { rejected = { code: "not-found", message: "Tenant findes ikke." }; return; }
    if (!tenant.koeretoejer?.[validated.value.enhedId]) {
      rejected = { code: "failed-precondition", message: "Den valgte enhed findes ikke i den fælles enhedsstamme." };
      return;
    }
    const current = tenant.fleetServiceKrav?.[requirementId] || null;
    if (current?.sidsteMutationId === mutationId) {
      if (current.sidsteMutationHash !== requestHash) {
        rejected = { code: "already-exists", message: "Gemmereferencen er brugt med et andet indhold." };
        return;
      }
      repeated = true; saved = current; return tenant;
    }
    const revision = Number(current?.revision || 0);
    if (revision !== expectedRevision) {
      rejected = { code: "aborted", message: "Servicekravet blev ændret samtidigt." };
      return;
    }
    const openOccurrence = current?.aktivForekomstId
      ? tenant.fleetServiceForekomster?.[current.aktivForekomstId] || null
      : null;
    const changeValidation = validateFleetServiceRequirementChange(
      current,
      validated.value,
      openOccurrence,
      openOccurrenceAction,
    );
    if (!changeValidation.ok) {
      rejected = {
        code: "failed-precondition",
        message: changeValidation.message,
        details: { aarsag: changeValidation.code, felter: changeValidation.changedCycleFields || [] },
      };
      return;
    }
    const next = {
      ...validated.value,
      revision: revision + 1,
      oprettetMs: current?.oprettetMs || nowMs,
      oprettetAf: current?.oprettetAf || uid,
      opdateretMs: nowMs,
      opdateretAf: uid,
      sidsteMutationId: mutationId,
      sidsteMutationHash: requestHash,
      ...(current?.aktivForekomstId ? { aktivForekomstId: current.aktivForekomstId } : {}),
    };
    tenant.fleetServiceKrav ||= {};
    tenant.fleetServiceKrav[requirementId] = next;
    tenant.fleetServiceHistorik ||= {};
    const eventId = `svcevt_${createHash("sha256").update(`${requirementId}:${mutationId}`).digest("hex").slice(0, 24)}`;
    tenant.fleetServiceHistorik[eventId] = {
      id: eventId, servicekravId: requirementId,
      handling: changeValidation.preservedOpenOccurrence
        ? "krav_deaktiveret_aaben_forekomst_bevaret"
        : (current ? "krav_aendret" : "krav_oprettet"),
      aktor: uid, tidspunktMs: nowMs, revision: next.revision,
      ...(changeValidation.preservedOpenOccurrence
        ? { serviceforekomstId: current.aktivForekomstId } : {}),
    };
    saved = next;
    return tenant;
  });
  if (!tx.committed || rejected) throw new HttpsError(
    rejected?.code || "aborted",
    rejected?.message || "Servicekravet kunne ikke gemmes.",
    rejected?.details,
  );
  return { ok: true, id: requirementId, revision: saved.revision, gentaget: repeated };
});

export const fleetServiceKontrolNu = onCall({ region: REGION, timeoutSeconds: 120 }, async (req) => {
  const { rod } = await procureDoer(req, { perm: PERM.koeretoejerSkriv, modul: "flaade" });
  const result = await runFleetServiceAutomationForTenant(rod, { nowMs: Date.now() });
  return {
    ok: result.committed,
    oprettet: result.created.length,
    genbrugt: result.reused.length,
    sprungetOver: result.skipped.length,
    resultater: result.created,
  };
});

export const fleetServiceGennemfoer = onCall({ region: REGION }, async (req) => {
  const { rod, uid } = await procureDoer(req, { perm: PERM.koeretoejerSkriv, modul: "flaade" });
  const occurrenceId = kortStreng(req.data?.forekomstId, 80);
  if (!occurrenceId) throw new HttpsError("invalid-argument", "Serviceforekomst mangler.");
  let outcome = null;
  const before = await rod.once("value");
  let warm = before.exists();
  const tx = await rod.transaction((tenant) => {
    if (!tenant && warm) tenant = structuredClone(before.val());
    warm = false;
    if (!tenant) return;
    outcome = completeFleetServiceOccurrence(tenant, occurrenceId, {
      dato: req.data?.dato,
      maaler: req.data?.maaler,
      actorId: uid,
    }, { nowMs: Date.now() });
    if (!outcome.ok) return;
    return outcome.tenant;
  });
  if (!tx.committed || !outcome?.ok) {
    const code = outcome?.code === "occurrence_missing" ? "not-found" : "failed-precondition";
    throw new HttpsError(code, `Service kunne ikke registreres: ${outcome?.code || "ukendt fejl"}.`);
  }
  return { ok: true, gentaget: outcome.repeated };
});

/* Atomisk tilknytning af OBD/GPS. Hardwareposten er låsen: transaktionen
 * kontrollerer og ændrer hardware, ressourcefelt og historik samlet, så to
 * samtidige formularer ikke kan vinde med samme serienummer. */
export const ressourcehardwaretilknyt = onCall({ region: REGION }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Ingen bruger.");
  const tenantId = auth.token?.tenant;
  if (!tenantId) throw new HttpsError("permission-denied", "Tokenet har ingen tenant.");

  const data = req.data || {};
  const art = kortStreng(data.art, 10);
  const hardwareId = data.hardwareId == null || data.hardwareId === "" ? null : kortStreng(data.hardwareId, 120);
  const ressourceType = kortStreng(data.ressourceType, 20);
  const ressourceId = kortStreng(data.ressourceId, 160);
  const valideringsfejl = hardwareId
    ? validerHardwareTilknytning({ art, hardwareId, ressourceType, ressourceId })
    : validerHardwareTilknytning({ art, hardwareId: "frigiv", ressourceType, ressourceId });
  delete valideringsfejl.hardwareId;
  if (Object.keys(valideringsfejl).length) {
    throw new HttpsError("invalid-argument", Object.values(valideringsfejl)[0]);
  }

  const permissions = art === "obd"
    ? [PERM.koeretoejerSkriv]
    : [PERM.kasserSkriv, PERM.carriersSkriv];
  const tilladteModuler = art === "obd" ? ["flaade", "booking"] : ["unitbooking", "warehouse"];
  const perms = permStrengFraClaims(auth.token);
  if (!permissions.some((permission) => perms.includes(`|${permission}|`))) {
    throw new HttpsError("permission-denied", `Det kræver en af: ${permissions.join(", ")}.`);
  }

  const db = getDatabase();
  const tenantRef = db.ref(`tenants/${tenantId}`);
  const modulSnapshot = await tenantRef.child("moduler").once("value");
  if (modulSnapshot.exists() && !tilladteModuler.some((navn) => modulSnapshot.child(navn).val() === true)) {
    throw new HttpsError("permission-denied", "Ingen af de relevante moduler er aktive.");
  }
  const findes = await tenantRef.child("_findes").once("value");
  if (!findes.exists()) throw new HttpsError("not-found", "Tenant findes ikke.");
  const abonnement = await tenantRef.child("abonnement/status").once("value");
  if (abonnement.exists() && abonnement.val() !== "aktiv") {
    throw new HttpsError("permission-denied", "Abonnementet er ikke aktivt.");
  }

  const ressourceNode = art === "obd" ? "koeretoejer" : "kasser";
  const ressourceFelt = art === "obd" ? "obdHardwareId" : "gpsHardwareId";
  const tidspunktMs = Date.now();
  const historikId = `h_${tidspunktMs}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let afvisning = null;
  // RTDB-emulatoren kan kalde transaktionsfunktionen første gang med null,
  // selv om noden findes. Brug det allerede autoriserede snapshot som varm
  // start én gang; derefter er serverens værdi fortsat eneste sandhedskilde.
  const foer = await tenantRef.once("value");
  let varm = foer.exists();
  const resultat = await tenantRef.transaction((tenant) => {
    afvisning = null;
    if (!tenant && varm) tenant = structuredClone(foer.val());
    varm = false;
    if (!tenant || !tenant[ressourceNode]?.[ressourceId]) {
      afvisning = "Ressourcen findes ikke."; return;
    }
    const ressource = tenant[ressourceNode][ressourceId];
    const tidligereId = ressource[ressourceFelt] || null;
    if (tidligereId === hardwareId) return tenant;

    if (hardwareId) {
      const hardware = tenant.ressourceHardware?.[art]?.[hardwareId];
      if (!hardware) { afvisning = "Hardwaren findes ikke."; return; }
      if (!hardwareErLedig(hardware, { ressourceType, ressourceId })) {
        afvisning = "Hardwaren er allerede tilknyttet en anden ressource."; return;
      }
    }

    if (tidligereId && tenant.ressourceHardware?.[art]?.[tidligereId]) {
      const tidligere = tenant.ressourceHardware[art][tidligereId];
      if (tidligere.tilknytning?.ressourceType === ressourceType
          && tidligere.tilknytning?.ressourceId === ressourceId) {
        delete tidligere.tilknytning;
        tidligere.historik ||= {};
        tidligere.historik[historikId] = {
          handling: "frigivet", ressourceType, ressourceId,
          tidspunktMs, uid: auth.uid,
        };
        tidligere.opdateretMs = tidspunktMs;
        tidligere.opdateretAf = auth.uid;
      }
    }

    if (hardwareId) {
      const hardware = tenant.ressourceHardware[art][hardwareId];
      hardware.tilknytning = { ressourceType, ressourceId, sidenMs: tidspunktMs };
      hardware.historik ||= {};
      hardware.historik[historikId] = {
        handling: "tilknyttet", ressourceType, ressourceId,
        tidspunktMs, uid: auth.uid,
      };
      hardware.opdateretMs = tidspunktMs;
      hardware.opdateretAf = auth.uid;
      ressource[ressourceFelt] = hardwareId;
    } else {
      delete ressource[ressourceFelt];
    }
    return tenant;
  });

  if (!resultat.committed) {
    throw new HttpsError(afvisning?.includes("allerede") ? "already-exists" : "failed-precondition",
      afvisning || "Tilknytningen kunne ikke gennemføres.");
  }
  return { ok: true, art, hardwareId, ressourceType, ressourceId, tidspunktMs };
});

export const fleetServiceKontrolPlanlagt = onSchedule({
  region: REGION, schedule: "every 60 minutes", timeZone: "Europe/Copenhagen", timeoutSeconds: 300,
}, async () => {
  const db = getDatabase();
  const index = (await db.ref("udbyder/kunder").once("value")).val() || {};
  let tenants = 0; let created = 0; let failed = 0;
  for (const tenantId of Object.keys(index)) {
    try {
      const result = await runFleetServiceAutomationForTenant(db.ref(`tenants/${tenantId}`), { nowMs: Date.now() });
      if (result.committed) tenants += 1;
      created += result.created.length;
    } catch (error) {
      failed += 1;
      console.error("FLEET servicekontrol fejlede", { tenantId, code: error?.code || "ukendt" });
    }
  }
  console.log("FLEET servicekontrol afsluttet", { tenants, created, failed });
});
