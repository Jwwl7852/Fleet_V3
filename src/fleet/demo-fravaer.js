/* src/fleet/demo-fravaer.js
 * Demo-fravær. Personerne kommer fra demo-personale.js — der opfindes ingen
 * navne her.
 *
 * ⚠ TO EKSPORTER, OG DET ER IKKE KOSMETIK.
 *
 *   DEMO_FRAVAER            general — det enhver med fravaer.laes må se
 *   DEMO_FRAVAER_SENSITIVE  sensitive/fravaer/<id> — kun med fravaer.sensitiveLaes
 *
 * Lå `art` på samme objekt, ville demo-sættet lære den næste udvikler en form
 * reglerne AFVISER: .validate: false på fravaer/$id/art. Opdelingen gør også
 * det ekstra opslag ægte frem for beskrevet — en skærm kan ikke komme til at
 * læse f.art, fordi feltet ikke findes på posten.
 *
 * FORMEN ER NODENS, IKKE SKÆRMENS — samme regel som demo-personale.js.
 *
 * SÆTTET ER TEGNET TIL AT VISE MEKANISMEN. Der er mindst ét fravær i hver
 * tilstand, så fravaerTilstand() kan ses virke, og det igangværende er en
 * SYGDOM — så hængelåsen sidder på noget der betyder noget lige nu, og ikke
 * på en ferie i fjor. Der er også fravær på en lagermedarbejder og på
 * administrationen: fravær rammer alle medarbejdere, ikke kun chauffører.
 */
import { DEMO_PERSONALE } from "./demo-personale.js";
import { DEMO_KPI } from "./demo-kpi.js";
import { FRAVAER_ART, erAktivt, overlapper } from "./fravaer.js";
import { selvkontrol } from "./selvkontrol.js";

const DAG = 86400000;

/* Døgnjusteret nulpunkt. Fravær regnes i hele dage, og et halvåbent interval
   der ikke starter ved midnat gør "til og med den 18." tvetydigt. */
const iDag = new Date();
iDag.setHours(0, 0, 0, 0);
const D0 = iDag.getTime();

/** Midnat n dage fra i dag. til er EKSKLUSIV: dag(3) betyder "til og med
 *  dag 2". Se sidsteDag() i fravaer.js — det er den fælde der ellers gør en
 *  syg chauffør disponerbar på sin sidste sygedag. */
const dag = (n) => D0 + n * DAG;

/* ---- general: tenants/<t>/fravaer/<id> ------------------------------- */

/* ⚠ securityLevel er DEN SAMME på hver eneste post, og det er med vilje.
   Satte vi 'confidential' på sygdom og 'normal' på ferie, ville selve niveauet
   afsløre årsagen — nøjagtig den udeladelseslækage som er grunden til at hele
   art-feltet ligger i sensitive/. Et klassifikationsfelt der varierer med det
   klassificerede, er en kanal. */
export const DEMO_FRAVAER = [
  /* --- Afsluttede -------------------------------------------------- */
  { id: "fv-001", personId: "larsAage", fra: dag(-70), til: dag(-56), securityLevel: "normal" },
  { id: "fv-002", personId: "reneThomsen", fra: dag(-40), til: dag(-26), securityLevel: "normal" },
  /* Administration. Fravær er ikke et chaufførbegreb. */
  { id: "fv-003", personId: "metteKjaer", fra: dag(-10), til: dag(-8), securityLevel: "normal" },
  /* Endte ved midnat i nat — grænsetilfældet på det halvåbne interval.
     Med til = dag(0) er Peter tilgængelig i dag. */
  { id: "fv-004", personId: "peterIversen", fra: dag(-1), til: dag(0), securityLevel: "normal" },

  /* --- Igangværende ------------------------------------------------- */
  /* Sygdom, og derfor det sted hængelåsen betyder noget: disponenten skal se
     at Lars ikke er tilgængelig, ikke hvorfor. */
  { id: "fv-005", personId: "larsAage", fra: dag(-3), til: dag(3), securityLevel: "normal" },
  { id: "fv-006", personId: "gitteFrandsen", fra: dag(-2), til: dag(5), securityLevel: "normal" },

  /* --- Kommende ----------------------------------------------------- */
  { id: "fv-007", personId: "yusufDemir", fra: dag(2), til: dag(9), securityLevel: "normal" },
  /* Lager. Hendes ferie blokerer hende lige så meget som en chaufførs. */
  { id: "fv-008", personId: "benjaminHolm", fra: dag(5), til: dag(19), securityLevel: "normal" },
  { id: "fv-009", personId: "anneKrogh", fra: dag(12), til: dag(26), securityLevel: "normal" },
  { id: "fv-010", personId: "kimDalsgaard", fra: dag(20), til: dag(118), securityLevel: "normal" },
];

/* ---- sensitive: tenants/<t>/sensitive/fravaer/<id> -------------------- */

/**
 * Kun tilgængelig med fravaer.sensitiveLaes, som KUN admin har i presettet.
 * Hverken disponent eller koordinator — disponeringen har brug for at vide at
 * medarbejderen er utilgængelig, ikke hvorfor.
 *
 * `note` er fritekst og hører derfor også her. Den kommer aldrig i en
 * auditpost: kun felter på allowlisten i audit-regler.js får deres værdi med.
 */
export const DEMO_FRAVAER_SENSITIVE = {
  "fv-001": { art: "ferie", note: "Sommerferie, uge 27–28" },
  "fv-002": { art: "ferie", note: "Sommerferie" },
  "fv-003": { art: "kursus", note: "Efteruddannelse i bogføring" },
  "fv-004": { art: "barnSyg", note: "Barns første sygedag" },
  "fv-005": { art: "sygdom", note: "Sygemeldt, forventet tilbage mandag" },
  "fv-006": { art: "ferie", note: "Restferie" },
  "fv-007": { art: "ferie", note: null },
  "fv-008": { art: "ferie", note: "Efterårsferie" },
  "fv-009": { art: "ferie", note: null },
  "fv-010": { art: "barsel", note: "Barselsorlov" },
};

/* ---- Opslag ---------------------------------------------------------- */

export const demoFravaerFor = (personId) =>
  DEMO_FRAVAER.filter((f) => f.personId === personId);

export const demoFravaerendeIDag = (nu = Date.now()) =>
  DEMO_FRAVAER.filter((f) => erAktivt(f, nu));

/* ---- Selvkontrol ------------------------------------------------------
 *
 * Samme mønster som demo-personale.js og demo-flaade.js. Retter ingenting,
 * siger til — og de samme kontroller ligger som tests i test/fravaer.test.mjs,
 * så de også fanges af .githooks/pre-commit.
 */
selvkontrol("demo-fravaer", () => {
  const kendtePersoner = new Set(DEMO_PERSONALE.map((p) => p.id));

  for (const f of DEMO_FRAVAER) {
    /* Reglerne afviser begge felter i general-noden. Et demo-sæt der havde dem
       med, ville lære en form der ikke kan gemmes. */
    for (const forbudt of ["art", "division"]) {
      if (forbudt in f) {
        console.warn(
          `demo-fravaer: ${f.id} har "${forbudt}" i general-noden. Reglerne afviser ` +
          `det med .validate: false — årsagen hører i sensitive/fravaer/${f.id}.`
        );
      }
    }
    if (!kendtePersoner.has(f.personId)) {
      console.warn(
        `demo-fravaer: ${f.id} peger på personId "${f.personId}", som ikke findes ` +
        `i demo-personale. Fraværet kan ikke opløses til et navn.`
      );
    }
    if (!(f.til > f.fra)) {
      console.warn(`demo-fravaer: ${f.id} har til <= fra. Et fravær uden varighed blokerer ingenting.`);
    }
    if (!DEMO_FRAVAER_SENSITIVE[f.id]) {
      console.warn(`demo-fravaer: ${f.id} mangler en post i DEMO_FRAVAER_SENSITIVE.`);
    } else if (!FRAVAER_ART[DEMO_FRAVAER_SENSITIVE[f.id].art]) {
      console.warn(`demo-fravaer: ${f.id} har ukendt art "${DEMO_FRAVAER_SENSITIVE[f.id].art}".`);
    }
  }

  /* Ét securityLevel for dem alle — se noten ved DEMO_FRAVAER. */
  const niveauer = new Set(DEMO_FRAVAER.map((f) => f.securityLevel));
  if (niveauer.size > 1) {
    console.warn(
      `demo-fravaer: der er ${niveauer.size} forskellige securityLevel (${[...niveauer].join(", ")}). ` +
      `Varierer niveauet med årsagen, afslører selve niveauet årsagen — og så er ` +
      `sensitive/ omgået af det felt der skulle beskytte den.`
    );
  }

  /* To fravær på samme person i samme periode er en KONFLIKT på en eksklusiv
     ressource — reserver() ville afvise den anden. Demo-data må ikke indeholde
     noget modellen selv ville nægte at skrive. */
  for (const p of new Set(DEMO_FRAVAER.map((f) => f.personId))) {
    const hans = demoFravaerFor(p);
    for (let i = 0; i < hans.length; i++) {
      for (let j = i + 1; j < hans.length; j++) {
        if (overlapper(hans[i], hans[j])) {
          console.warn(
            `demo-fravaer: ${hans[i].id} og ${hans[j].id} overlapper på "${p}". ` +
            `To fravær på samme medarbejder i samme periode er en reservationskonflikt.`
          );
        }
      }
    }
  }

  /* Loft mod kpi/. En der er væk, kan ikke være disponeret — så antallet af
     fraværende i dag kan ikke overstige forskellen mellem planlagte og
     disponerede.

     ⚠ Det er et LOFT og ikke en lighed, og tallene er ikke helt samme slags:
     planlagt og disponeret er VAGTER, ikke hoveder. Kontrollen fanger derfor
     en grov modsigelse — tyve fraværende mod fjorten ubesatte vagter — men den
     beviser ikke at demo-sættene er enige om hver enkelt person. Den præcise
     kontrol kræver bemanding.fravaerIDag, som ikke findes i kpi/ endnu; se
     KPI-efterslæbet i README. */
  /* ⚠ HER BLEV GODS OG BUS LAGT SAMMEN, og opslagene gav `undefined` efter
     beslutning 70 — så `gab` blev 0, og kontrollen ADVAREDE FALSK ved hvert
     eneste fravær. En falsk advarsel er værre end en manglende: den lærer
     folk at ignorere konsollen. Se beslutning 75.

     ⚠ OG `planlagt` ER null I DAG (der findes ingen vagtplan, beslutning 69),
     så gabet kan ikke regnes. Kontrollen springer over med sin grund frem for
     at regne på `|| 0` — det er præcis `100 - null`-fælden. */
  const b = DEMO_KPI?.bemanding || {};
  if (!Number.isFinite(b.planlagt) || !Number.isFinite(b.disponeret)) return;
  const gab = Math.max(0, b.planlagt - b.disponeret);
  const iDagAntal = demoFravaerendeIDag().length;
  if (iDagAntal > gab) {
    console.warn(
      `demo-fravaer: ${iDagAntal} medarbejdere er fraværende i dag, men kpi/ siger kun ` +
      `${gab} ubesatte vagter (planlagt − disponeret). En der er væk, kan ikke være ` +
      `disponeret — de to demo-sæt modsiger hinanden.`
    );
  }
});
