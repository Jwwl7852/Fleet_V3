/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/retention-regler.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/retention-regler.js
 * Retention — POLITIK OG KORTLÆGNING, INGEN SLETNING. Beslutning 115.
 *
 * ⚠ HELE FILEN ER IKKE-DESTRUKTIV MED VILJE. Der findes ingen funktion her
 * der sletter eller anonymiserer noget som helst. De tre der ligner det —
 * `anonymiser()`, `eksporterFoerSletning()`, `slet()` — kaster med det
 * samme. De er HOOKS: stedet den fremtidige mekanisme kobles på, ikke den
 * fremtidige mekanisme. De aktiveres først når periodeMaaneder pr. kategori
 * er sat OG juridisk valideret — se beslutning 115.
 *
 * ⚠ INGEN TAL ER GÆTTET. Hver kategori har `periodeMaaneder: null` og
 * `afgjort: false`. Det er samme disciplin som momssatsen og
 * audit-retentionen: et tomt felt er et ubesvaret spørgsmål, en gættet
 * værdi ser ud som et svar ingen gav.
 *
 * ⚠ AUDITLOGGENS EGEN RETENTION DUPLIKERES IKKE HER. `audit-regler.js` har
 * allerede KLASSER/RETENTION_MAANEDER/RETENTION_AFGJORT for auditposter —
 * den mekanisme er ÆLDRE og kører allerede (`auditoprydning`). Kategorien
 * `auditlog` herunder PEGER på den i stedet for at bygge den om.
 *
 * INGEN IMPORTS — samme grund som permissions.js og audit-regler.js: filen
 * skal kunne læses af enhver Cloud Function uden at trække firebase med.
 */

/**
 * De fjorten datakategorier — Jørns matrix, kortlagt til de noder der
 * faktisk findes i dette repo.
 *
 * `noder`: RTDB-stier kategorien dækker. Et node der optræder i to
 * kategorier (findes ikke i dag) ville kræve et felt PÅ POSTEN — se
 * "OM BLANDEDE NODER" nedenfor — men ingen af de fjorten deler i dag.
 *
 * `metode`: den METODE der engang skal bruges, ikke at den bruges nu.
 *   "anonymiser" — historikken bevares, personoplysningen fjernes/erstattes
 *   "slet"       — hele posten fjernes
 *   "eksport-foerst" — regnskabsdata: skal kunne hentes ud, før noget rører den
 *
 * `bygget`: false betyder noden/funktionen kategorien beskriver, ikke
 * findes i produktet endnu. Retention på noget der ikke er bygget, er ikke
 * et hul — det er for tidligt at spørge om.
 */
export const RETENTION_KATEGORI = {
  regnskabsdata: {
    label: "Regnskabsdata",
    eksempel: "fakturagrundlag, fakturaer",
    princip: "Bogføringsloven: 5 år fra udgangen af det regnskabsår materialet vedrører.",
    metode: "eksport-foerst",
    noder: ["grundlag", "fakturaer"],
    bygget: true,
    periodeMaaneder: null,
    afgjort: false,
  },
  /* ⚠ SKIVE 4C — EGEN KATEGORI, IKKE SLÅET SAMMEN MED regnskabsdata OVENFOR.
     Et fakturabilag følger samme princip og bør formentlig ende med samme
     periode som fakturaen det er hæftet på — men det er en type data
     REGNSKABSDATA-KATEGORIEN OVENFOR IKKE KENDER (en blob i Cloud Storage,
     ikke en RTDB-post), og en fælles kategori ville skjule den forskel i
     stedet for at vise den.
     ⚠ `noder` ER TOM MED VILJE, IKKE ET HUL. `retentionDryRun` (functions/
     index.js) henter `info.noder` som FLADE tenant-rod-stier og lister
     deres direkte børn (`rod.child(node).once("value")`) — det virker for
     `fakturaer`, hvor hvert barn ER en faktura. Fakturabilag ligger derimod
     spredt under HVER faktura (`fakturaer/$fakturaId/dokumenter/$id`), og
     findes derfor ikke som én flad samling dry-run-mekanismen kan spørge om
     uden en ny slags opslag. Legal hold håndhæves alligevel — direkte, pr.
     dokument, af `dokumentDeaktiver` via `erUndtaget("fakturaDokument",
     dokumentId, holds)` — men den generiske rapport dækker den ikke endnu.
     Se Gate B §10 og docs/security-compliance/09_FILE_STORAGE_SECURITY_
     GATE.md. */
  fakturaBilag: {
    label: "Fakturabilag",
    eksempel: "en uploadet PDF/JPEG/PNG hæftet på en faktura",
    princip: "Formentlig samme som regnskabsdata — ikke selvstændigt afgjort endnu.",
    metode: "eksport-foerst",
    noder: [],
    bygget: true,
    periodeMaaneder: null,
    afgjort: false,
  },
  /* ⚠ F.2 — EGEN KATEGORI, IKKE SLÅET SAMMEN MED fakturaBilag ELLER
     facilitySager. Et opgavedokument er DRIFTSDOKUMENTATION (et foto fra et
     værkstedsbesøg), ikke regnskabsbevis — samme skel som facilitySager
     (opgaver-NODEN) allerede trækker mellem drift og regnskab. Men det er
     heller ikke facilitySager selv: den kategori dækker RTDB-posten
     (opgaver), denne dækker BLOBBEN i Cloud Storage — samme adskillelse
     som fakturaBilag har til regnskabsdata ovenfor, af samme grund. */
  opgaveBilag: {
    label: "Opgavedokumenter",
    eksempel: "et foto eller en kvittering hæftet på et værksteds-/servicebesøg",
    princip: "Driftsdokumentation — ikke selvstændigt afgjort endnu.",
    metode: "eksport-foerst",
    noder: [],
    bygget: true,
    periodeMaaneder: null,
    afgjort: false,
  },
  procureData: {
    label: "Procure-data",
    eksempel: "indkøbsbehov, bestilling, godkendelse",
    princip: "Kobles til regnskabssporet hvor den bliver til et køb.",
    metode: "eksport-foerst",
    noder: ["indkoebsbehov", "indkoebsordrer", "indkoeb", "godkendelsesregler"],
    bygget: true,
    periodeMaaneder: null,
    afgjort: false,
  },
  fleetOekonomi: {
    label: "Fleet økonomi",
    eksempel: "serviceomkostning på en bil",
    princip: "Samme dokument følger regnskabsdatas retention — det ER en omkostning.",
    metode: "eksport-foerst",
    noder: ["omkostninger"],
    bygget: true,
    periodeMaaneder: null,
    afgjort: false,
  },
  bookingTransport: {
    label: "Booking/transport",
    eksempel: "booking, etape, stop, levering",
    princip: "Forretningsmæssig retention — separat fra regnskabssporet.",
    metode: "anonymiser",
    noder: ["bookinger", "etaper"],
    bygget: true,
    periodeMaaneder: null,
    afgjort: false,
  },
  facilitySager: {
    label: "Facility-sager",
    eksempel: "fejl, servicebesøg, dokumentation",
    princip: "Sagstypebaseret — en garantisag kan kræve længere end en rutinefejl.",
    metode: "anonymiser",
    noder: ["facility/fejl", "opgaver"],
    bygget: true,
    periodeMaaneder: null,
    afgjort: false,
  },
  skaderForsikring: {
    label: "Skader/forsikring",
    eksempel: "modpart, forsikringsselskab, policenr., fotos",
    princip: "Bevares efter sagens behov — en forsikringssag kan løbe år.",
    metode: "eksport-foerst",
    noder: ["sensitive/indberetninger"],
    bygget: true,
    periodeMaaneder: null,
    afgjort: false,
  },
  gpsPosition: {
    label: "GPS/positionsdata",
    eksempel: "bil/chaufførens historiske position",
    princip: "Kortere, restriktiv retention — når/hvis feltet nogensinde besluttes bygget.",
    metode: "slet",
    noder: [],
    /* ⚠ FINDES IKKE. Beslutning 22 forbyder GPS-sporing — Rute & status
       bygger udelukkende på chaufførens egne statusmeldinger. Kategorien
       står med for at matrixen er komplet, ikke fordi der er noget at
       give retention til. */
    bygget: false,
    periodeMaaneder: null,
    afgjort: false,
  },
  chaufforRegistreringer: {
    label: "Chaufførregistreringer",
    eksempel: "ind-/udstempling, ankomst/afgang, underskrift",
    princip: "Efter formål — typisk et arbejdsretligt eller overenskomstmæssigt dokumentationskrav.",
    metode: "anonymiser",
    noder: ["stemplinger", "statushaendelser", "sensitive/indberetninger"],
    bygget: true,
    periodeMaaneder: null,
    afgjort: false,
  },
  kompetenceDokumenter: {
    label: "Kompetencedokumenter",
    eksempel: "ADR-kort, kørekort, certifikater",
    princip: "Så længe nødvendigt, plus en defineret periode efter udløb.",
    metode: "slet",
    noder: ["kompetencer"],
    /* ⚠ SELVE BEVISET (filen) KRÆVER EN STORAGE-BUCKET, SOM DEV IKKE HAR —
       se ARKITEKTUR.md/README's "Fem skærme der venter". Selve
       kompetence-POSTEN (type, udløbsdato) findes og er derfor bygget;
       vedhæftningen er det ikke. */
    bygget: true,
    periodeMaaneder: null,
    afgjort: false,
  },
  supportData: {
    label: "Supportdata",
    eksempel: "supportsag, screenshots",
    princip: "Support-retention — egen politik, adskilt fra kundens driftsdata.",
    metode: "anonymiser",
    noder: [],
    /* ⚠ FINDES IKKE. `support/sager` m.fl. er fase 0/afventer stadig —
       beslutning 23/24 beskriver formen, ingen af noderne er i
       firebase.rules.json. */
    bygget: false,
    periodeMaaneder: null,
    afgjort: false,
  },
  supportAdgangslog: {
    label: "Supportadgangslog",
    eksempel: "hvem hos os så hvad hos kunden, og hvornår",
    princip: "Sikkerheds-/audit-retention — typisk længere end almindelig drift.",
    metode: "eksport-foerst",
    noder: [],
    /* ⚠ FINDES IKKE — supportadgangsmodellen (beslutning 23) er ikke
       bygget endnu. auditerSom() (beslutning 99) logger LÆSNINGER fra
       applikationen i dag, men ingen tidsbegrænset bevilling findes. */
    bygget: false,
    periodeMaaneder: null,
    afgjort: false,
  },
  auditlog: {
    label: "Auditlog",
    eksempel: "bruger ændrede booking/faktura",
    princip: "Egen, allerede kørende mekanisme — se audit-regler.js.",
    metode: "slet",
    noder: ["audit"],
    /* ⚠ DENNE KATEGORI STYRER INGENTING SELV. RETENTION_MAANEDER og
       RETENTION_AFGJORT i audit-regler.js er sandheden; feltet her er en
       HENVISNING, så de fjorten kategorier kan læses som én liste uden at
       lade auditloggen stå som en tavshed i den. */
    bygget: true,
    periodeMaaneder: null,
    afgjort: false,
    henvisning: "audit-regler.js: RETENTION_MAANEDER, RETENTION_AFGJORT",
  },
  brugerkonto: {
    label: "Brugerkonto",
    eksempel: "medarbejdernavn, rolle, personId-kobling",
    princip:
      "Kontoen deaktiveres FØRST (spaerlogin, spaerretMs). Persondata anonymiseres/slettes " +
      "SENERE, og kun efter det er afklaret hvad et dokumentationskrav på fx en godkendt " +
      "faktura eller booking betyder for hvad der må fjernes.",
    metode: "anonymiser",
    noder: ["brugere", "personale"],
    bygget: true,
    periodeMaaneder: null,
    afgjort: false,
  },
  aiDiagnose: {
    label: "AI/diagnosedata",
    eksempel: "fejlkontekst, logs til en fremtidig AI-diagnose",
    princip: "Kort og særskilt retention — teknisk data, ikke driftsdokumentation.",
    metode: "slet",
    noder: [],
    /* ⚠ FINDES IKKE. Ingen AI-diagnosefunktion er bygget. */
    bygget: false,
    periodeMaaneder: null,
    afgjort: false,
  },
};

/**
 * Backups er IKKE en RTDB-node og har derfor ingen `noder`-liste. De er
 * infrastruktur — Firebase's egen mekanisme eller en separat eksport — og
 * MÅ IKKE blandes med produktionsdatas retention: en 24-måneders grænse på
 * driftsdata betyder ikke at en backup fra måned 25 skal være væk, hvis
 * backup-politikken siger noget andet. To spørgsmål, to svar.
 */
export const BACKUP_POLICY = {
  label: "Backups",
  princip: "Egen, adskilt udløbspolitik. Reguleres ikke af RETENTION_KATEGORI.",
  periodeMaaneder: null,
  afgjort: false,
};

/* ══════════════════════════════════════════════════════════════════════
   LEGAL HOLD — undtag ét objekt fra retention, uanset dets alder
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Er et objekt undtaget af mindst ét AKTIVT hold? `holds` er formen fra
 * `tenants/<t>/retention/legalHold/<id>` — se firebase.rules.json.
 *
 * ⚠ ET OPHÆVET HOLD TÆLLER IKKE MED. `ophaevetMs` er beviset for at nogen
 * aktivt fjernede undtagelsen — et hold der bare blev slettet, ville ikke
 * kunne skelnes fra et der aldrig var vurderet.
 */
export function erUndtaget(objekt, objektId, holds = []) {
  return holds.some((h) => h.objekt === objekt && h.objektId === objektId && !h.ophaevetMs);
}

/* ══════════════════════════════════════════════════════════════════════
   DRY-RUN — svarer på "hvad ville periodeMaaneder betyde i dag?"
   ══════════════════════════════════════════════════════════════════════ */

/**
 * simulerRetention(objekt, poster, { periodeMaaneder, tidsfelt }, holds, nu)
 *   → { paavirkede, undtagetAfHold, forUngeEndnu, graenseMs }
 *
 * REN FUNKTION. Rører ingen database og MUTERER ALDRIG `poster` — se
 * test/retention-regler.test.mjs for beviset.
 *
 * ⚠ periodeMaaneder ER EN HYPOTESE, IKKE DEN AFGJORTE GRÆNSE. Kaldeeren
 * angiver selv tallet — funktionen læser IKKE RETENTION_KATEGORI[...]
 * .periodeMaaneder, som er null indtil juraen har svaret. Det er sådan en
 * jurist eller revisor kan få et rigtigt svar på "hvad ville 36 måneder
 * betyde for de her poster i dag?", uden at nogen har besluttet 36 endnu.
 *
 * ⚠ POSTER UDEN TIDSFELTET SPRINGES OVER, IKKE GÆTTES. En post uden et
 * tidspunkt at regne fra kan hverken siges at være moden eller for ung —
 * den svarer ikke på spørgsmålet.
 */
export function simulerRetention(objekt, poster, { periodeMaaneder, tidsfelt = "oprettetMs" } = {}, holds = [], nu = Date.now()) {
  if (!Number.isFinite(periodeMaaneder) || periodeMaaneder <= 0) {
    throw new Error(
      "simulerRetention: periodeMaaneder skal være et positivt tal. Det er en hypotese du " +
      "angiver for at se hvad den ville betyde — ikke et opslag i en afgjort grænse."
    );
  }
  /* Samme dags-tilnærmelse som forfaldnePartitioner() i audit-regler.js —
     én mekanisme for "hvor mange dage er en måned", ikke to. */
  const graenseMs = nu - periodeMaaneder * 30.44 * 86400000;

  const paavirkede = [];
  const undtagetAfHold = [];
  const forUngeEndnu = [];

  for (const post of poster) {
    const tid = post?.[tidsfelt];
    if (!Number.isFinite(tid)) continue;
    if (tid > graenseMs) { forUngeEndnu.push(post); continue; }
    if (erUndtaget(objekt, post.id, holds)) { undtagetAfHold.push(post); continue; }
    paavirkede.push(post);
  }

  return { paavirkede, undtagetAfHold, forUngeEndnu, periodeMaaneder, graenseMs };
}

/**
 * Kundespecifik overstyring, hvis tenanten har sat én — ellers platformens
 * (endnu ikke afgjorte) standard for kategorien.
 *
 * ⚠ RENT OPSLAG. Der findes endnu ingen skærm eller node der SKRIVER en
 * overstyring — det er `tenants/<t>/retention/overstyring/<kategori>`, når
 * den dag kommer. Funktionen er hooket, formen er ikke bygget.
 */
export function periodeFor(kategori, tenantOverstyringer = {}) {
  const override = tenantOverstyringer?.[kategori];
  if (Number.isFinite(override)) return override;
  return RETENTION_KATEGORI[kategori]?.periodeMaaneder ?? null;
}

/* ══════════════════════════════════════════════════════════════════════
   HOOKS — stedet den fremtidige mekanisme kobles på. Kalder du dem i dag,
   får du en klar fejl, ikke en stille no-op og ikke en sletning.
   ══════════════════════════════════════════════════════════════════════ */

const IKKE_BYGGET = (navn) => {
  throw new Error(
    `${navn}(): ikke bygget. Aktiveres først når periodeMaaneder er sat og juridisk valideret ` +
    `pr. kategori (RETENTION_KATEGORI[...].afgjort === true) — se beslutning 115.`
  );
};

export const anonymiser = () => IKKE_BYGGET("anonymiser");
export const eksporterFoerSletning = () => IKKE_BYGGET("eksporterFoerSletning");
export const slet = () => IKKE_BYGGET("slet");
