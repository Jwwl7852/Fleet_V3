/* src/fleet/demo-vaerksted.js
 * Demo-værkstedsbesøg og de indkøb de giver anledning til.
 *
 * Bilerne kommer fra demo-flaade.js — der opfindes ingen køretøjer her.
 * demo-flaade er kilden, som den blev det for Dashboard og Bookingopsætning.
 *
 * FORMEN ER NODENS, IKKE SKÆRMENS.
 *
 * ⚠ ET VÆRKSTEDSBESØG ER EN OPGAVE MED art 'vaerksted' (beslutning 21).
 * Posterne herunder bærer derfor `art` og `division` og har nodens form —
 * selvkontrollen validerer dem mod opgaveMangler() i fleet/opgaver.js, så et
 * besøg der ikke kunne gemmes i opgaver/, siger til her.
 *
 * De ligger stadig i deres egen demo-node og ikke i DEMO_OPGAVER, fordi
 * Disponering ikke er bygget endnu og der ikke findes et opgave-datasæt at
 * lægge dem i. Flytningen er en omdøbning, ikke en migrering: formen er
 * allerede den rigtige.
 *
 * `division` kan IKKE udledes af bilen (beslutning 19) — den står eksplicit på
 * hvert besøg, som reglerne kræver på opgaver/.
 *
 * ⚠ INDKØB, IKKE FAKTURAER. Reglerne siger `.write: false` på fakturaer/ —
 * bogførte poster skrives kun af en Cloud Function. Det man registrerer her,
 * er et INDKØB (indkoeb/<id>), som Indkøb → Fakturaer siden matcher mod
 * leverandørens faktura og godkender. Ét sted at registrere, ét sted at
 * godkende — beslutning 12 var netop to steder at uploade samme faktura.
 *
 * ⚠ INDKØB KRÆVER division, OG BILEN HAR INGEN. Reglerne validerer
 * hasChildren(['division']) på indkoeb/$id, mens beslutning 19 forbyder feltet
 * på koeretoejer/. Værdien kan altså ikke kopieres fra bilen — den skal sættes
 * af den der registrerer. Derfor står `division` eksplicit på hver post
 * herunder, og formularen har et felt til den.
 */
import { DEMO_KOERETOEJER } from "./demo-flaade.js";
import { DEMO_KPI } from "./demo-kpi.js";
import { demoSag } from "./demo-sag.js";
import { opgaveMangler } from "./opgaver.js";

const DAG = 86400000;
const T = 3600000;

const iDag = new Date();
iDag.setHours(0, 0, 0, 0);
const D0 = iDag.getTime();

/** Midnat n dage fra i dag, plus valgfrit klokkeslæt. til er EKSKLUSIV. */
const dag = (n, time = 0) => D0 + n * DAG + time * T;

/* ---- Omkostningstyper ------------------------------------------------ */

/* Vokabular ét sted. Skriver hver formular sine egne, hedder det "Dæk" på den
   ene skærm og "Dækskifte" på den næste — og så kan de ikke summeres. */
export const OMKOSTNINGSTYPE = {
  service: "Serviceeftersyn",
  reparation: "Reparation",
  daek: "Dæk",
  syn: "Syn og godkendelse",
  reservedele: "Reservedele",
  skade: "Skade",
};

export const ALLE_OMKOSTNINGSTYPER = Object.keys(OMKOSTNINGSTYPE);

/* ---- Besøg ------------------------------------------------------------ */

export const BESOEG_STATUS = {
  planlagt: { label: "Planlagt", tone: "info" },
  igang:    { label: "I gang",   tone: "warn" },
  udfoert:  { label: "Udført",   tone: "ok"   },
};

/**
 * Et besøg spærrer bilen i [fra, til). Halvåbent, som alt andet.
 *
 * `leverandoerId` peger på demo-indkoeb.js. Feltet hed før `vaerksted` og var
 * en fritekststreng — samme navn stod i tre filer med hver sin stavemåde at
 * drive med. Reglerne har hele tiden indekseret `leverandoerId`; noden fandtes
 * bare ikke.
 */
export const DEMO_BESOEG = [
  /* --- Udført, ligger bag os -------------------------------------- */
  {
    id: "vb-001", koeretoejId: "kt-078", status: "udfoert", art: "vaerksted", division: "gods",
    type: "service", leverandoerId: "lv-scania",
    fra: dag(-24, 7), til: dag(-24, 16),
    beskrivelse: "Serviceeftersyn 250.000 km",
  },
  {
    id: "vb-002", koeretoejId: "kt-b16", status: "udfoert", art: "vaerksted", division: "bus",
    type: "daek", leverandoerId: "lv-daekteam",
    fra: dag(-11, 8), til: dag(-11, 13),
    beskrivelse: "Fire nye dæk på foraksel og bogie",
  },

  /* --- I gang lige nu. Skal stemme med status 'vaerksted' i demo-flaade --- */
  {
    id: "vb-003", koeretoejId: "kt-106", status: "igang", art: "vaerksted", division: "gods",
    type: "reparation", leverandoerId: "lv-daf",
    fra: dag(-2, 7), til: dag(2, 16),
    beskrivelse: "Motorlampe — fejlsøgning på EGR-ventil",
  },
  {
    /* Langt besøg der rækker ud over et to-ugers vindue. Det er her pilen skal
       vises: klippet ved kanten læses tre uger som et kort besøg, og så
       planlægger nogen en tur i en uge hvor traileren står på værksted. */
    id: "vb-004", koeretoejId: "kt-tr42", status: "igang", art: "vaerksted", division: "gods",
    type: "reparation", leverandoerId: "lv-schmitz",
    fra: dag(-1, 8), til: dag(18, 15),
    beskrivelse: "Køleaggregat starter ikke — kompressor i restordre",
  },

  /* --- Planlagt ---------------------------------------------------- */
  {
    /* ⚠ DEN HER ER AFTALEN FRA BESLUTNING 20.
       Sag FLT-2026-00381 aftalte 18-08-2026 kl. 08.00–16.00 på Bil 104 med
       Mercedes Greve. Står den ikke i kalenderen med de tidspunkter,
       beskriver sagsvisningen og værkstedskalenderen hver sin virkelighed —
       og det er 84-mod-83 igen. Selvkontrollen nedenfor fastholder det. */
    id: "vb-005", koeretoejId: "kt-104", status: "planlagt", art: "vaerksted", division: "gods",
    type: "service", leverandoerId: "lv-mercedes",
    fra: null, til: null,          // sættes fra sagen — se nedenfor
    beskrivelse: "Serviceeftersyn 30.000 km",
    sagId: "sag-flt-381", sagsnummer: "FLT-2026-00381",
  },
  {
    id: "vb-006", koeretoejId: "kt-034", status: "planlagt", art: "vaerksted", division: "gods",
    type: "service", leverandoerId: "lv-man",
    fra: dag(9, 7), til: dag(9, 15),
    beskrivelse: "Serviceeftersyn 525.000 km",
  },
  {
    id: "vb-007", koeretoejId: "kt-tr41", status: "planlagt", art: "vaerksted", division: "gods",
    type: "syn", leverandoerId: "lv-applus",
    fra: dag(30, 9), til: dag(30, 12),
    beskrivelse: "Periodisk syn af trailer",
  },
  {
    /* Scooteren står som `udeAfDrift` i flåden, ikke som `vaerksted` — den er
       taget ud af drift mens den venter på en reservedel, og den er ikke på
       værkstedet endnu. Besøget ligger derfor i FREMTIDEN.
       Det er ikke en detalje: gav vi den et besøg der dækkede i dag, ville
       Flåde og Værkstedskalender sige hver sit om samme scooter — og der er
       en test der fanger præcis det. */
    id: "vb-008", koeretoejId: "kt-s01", status: "planlagt", art: "vaerksted", division: "faelles",
    type: "reparation", leverandoerId: "lv-scooter",
    fra: dag(10, 8), til: dag(24, 16),
    beskrivelse: "Motorblok skiftes når reservedelen er kommet",
  },
];

/* Aftalen fra sagen skrives ind ét sted, så tidspunkterne ikke kan drive. */
const sagen = demoSag("FLT-2026-00381");
for (const b of DEMO_BESOEG) {
  if (b.sagId === sagen?.id && sagen.aftale) {
    b.fra = sagen.aftale.fra;
    b.til = sagen.aftale.til;
  }
}

/* ---- Indkøb registreret fra et besøg --------------------------------- */

/**
 * Beløb i hele ØRE, altid ekskl. moms. `momsOere` er et SEPARAT felt.
 * Aldrig ét felt med inkl. moms — se beslutning 2. Totalen beregnes hos
 * forbrugeren og gemmes ikke.
 *
 * `division` står eksplicit: den kan ikke udledes af bilen (beslutning 19),
 * og reglerne kræver den på indkoeb/.
 *
 * `fakturaId` er null indtil Indkøb → Fakturaer har matchet posten mod
 * leverandørens faktura. Det er de poster "Ikke-linkede fakturaer" tæller.
 */
/* ⚠ HER LÅ DEMO_INDKOEB — ET ANDET DATASÆT FOR `indkoeb`-NODEN.
   Fire poster, med `beloebOere` direkte på hver: den form reglerne FORBYDER,
   fordi beløbet beregnes af antal × pris. De blev aldrig seedet, og de fandtes
   derfor kun her.

   ⚠ OG DE KOSTEDE EN FORKERT RETTELSE. `fa-9001` pegede på `indkoebId:
   "ik-001"`, som ikke fandtes i demo-indkoeb.js — så jeg satte feltet til
   null med en note om at "en hængende reference er værre end ingen". Linjen
   fandtes. Den lå her. Symptomet blev behandlet, årsagen stod tilbage.
   `fa-9002` pegede tilsvarende på il-002 til 16.500 kr mens fakturaen var på
   29.600 — jeg læste forskellen som afstemningsmateriale.

   De fire ligger nu i DEMO_INDKOEBSLINJER som il-vb-00N, med `besoegId` som
   spor tilbage hertil. Syvende gang mønstret med to datasæt for én ting. */


/* ---- Opslag ---------------------------------------------------------- */

export const demoBesoegFor = (koeretoejId) =>
  DEMO_BESOEG.filter((b) => b.koeretoejId === koeretoejId);

export const demoBesoegNu = (nu = Date.now()) =>
  DEMO_BESOEG.filter((b) => nu >= b.fra && nu < b.til);

/* ⚠ demoIkkeLinkede() ER OGSÅ VÆK. Den talte INDKØB uden en faktura, mens
   `flaade.ikkeLinkedeFakturaer` i kpi/ tæller FAKTURAER uden et indkøb — to
   forskellige spørgsmål under to næsten ens navne, på to skærme. Nøgletallets
   definition er den der gælder; se ikkeLinkedeFakturaer() i
   kpi-aggregering.js. */

/** Totalen beregnes, den gemmes ikke. */
export const totalOere = (i) => (i.beloebOere || 0) + (i.momsOere || 0);

/* ---- Selvkontrol ------------------------------------------------------ */

if (import.meta.env?.DEV) {
  const kendteBiler = new Set(DEMO_KOERETOEJER.map((k) => k.id));
  const nu = Date.now();

  for (const b of DEMO_BESOEG) {
    if (!kendteBiler.has(b.koeretoejId)) {
      console.warn(
        `demo-vaerksted: ${b.id} peger på koeretoejId "${b.koeretoejId}", som ikke ` +
        `findes i demo-flaade. Besøget kan ikke opløses til en bil.`
      );
    }
    if (!(b.til > b.fra)) {
      console.warn(`demo-vaerksted: ${b.id} har til <= fra. En blok uden varighed spærrer ingenting.`);
    }
    if (!BESOEG_STATUS[b.status]) console.warn(`demo-vaerksted: ${b.id} har ukendt status "${b.status}".`);
    if (!OMKOSTNINGSTYPE[b.type]) console.warn(`demo-vaerksted: ${b.id} har ukendt type "${b.type}".`);

    /* Beslutning 21: et besøg ER en opgave. Kunne posten ikke gemmes i
       opgaver/, er formen forkert her — og så lærer demo-sættet den næste
       udvikler noget reglerne afviser. */
    const mangler = opgaveMangler(b);
    if (mangler.length) {
      console.warn(
        `demo-vaerksted: ${b.id} mangler ${mangler.join(", ")} og kunne ikke gemmes ` +
        `i opgaver/. Se opgaveMangler() i fleet/opgaver.js.`
      );
    }
  }

  /* Aftalen fra sagen SKAL være besøget. Ellers siger sagsvisningen og
     kalenderen hver sit om samme arbejde. */
  const sagsBesoeg = DEMO_BESOEG.find((b) => b.sagId === "sag-flt-381");
  if (sagen?.aftale && sagsBesoeg) {
    if (sagsBesoeg.fra !== sagen.aftale.fra || sagsBesoeg.til !== sagen.aftale.til) {
      console.warn(
        `demo-vaerksted: ${sagsBesoeg.id} og aftalen på ${sagen.nummer} har forskellige ` +
        `tidspunkter. Sagsvisningen og kalenderen ville vise hver sin aftale.`
      );
    }
    if (sagsBesoeg.koeretoejId !== sagen.objektId) {
      console.warn(
        `demo-vaerksted: ${sagsBesoeg.id} står på ${sagsBesoeg.koeretoejId}, men ` +
        `${sagen.nummer} handler om ${sagen.objektId}.`
      );
    }
  }

  /* En bil med status 'vaerksted' i flåden SKAL have et besøg der dækker nu —
     og omvendt. To datasæt der siger hver sit om samme bil, er beslutning 6's
     fejl et niveau nede. */
  const paaVaerkstedNu = new Set(demoBesoegNu(nu).map((b) => b.koeretoejId));
  for (const k of DEMO_KOERETOEJER) {
    if (k.status === "vaerksted" && !paaVaerkstedNu.has(k.id)) {
      console.warn(
        `demo-vaerksted: ${k.kaldenavn} har status "vaerksted" i demo-flaade, men har ` +
        `intet besøg der dækker i dag. Fleet og Driftskalender siger hver sit.`
      );
    }
    if (k.status !== "vaerksted" && paaVaerkstedNu.has(k.id)) {
      console.warn(
        `demo-vaerksted: ${k.kaldenavn} er på værksted i dag ifølge besøgene, men har ` +
        `status "${k.status}" i demo-flaade.`
      );
    }
  }

  /* To besøg på samme bil i samme periode er en konflikt på en eksklusiv
     ressource. Gitteret TEGNER den — men demo-data skal ikke indeholde den,
     for så kan man ikke se forskel på en fejl i data og en fejl i gitteret. */
  for (const id of new Set(DEMO_BESOEG.map((b) => b.koeretoejId))) {
    const mine = demoBesoegFor(id);
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) {
        if (mine[i].fra < mine[j].til && mine[j].fra < mine[i].til) {
          console.warn(
            `demo-vaerksted: ${mine[i].id} og ${mine[j].id} overlapper på ${id}. ` +
            `To besøg på samme bil samtidig er en reservationskonflikt.`
          );
        }
      }
    }
  }

  /* ⚠ KONTROLLEN AF INDKØBENE LÅ HER, og den læste DEMO_INDKOEB — datasættet
     der er flyttet ind i demo-indkoeb.js. Den kørte kun under
     `import.meta.env?.DEV`, så npm test så den ikke: suiten var grøn mens
     skærmen kastede "DEMO_INDKOEB is not defined". Anden gang i dag.

     Kontrollen er ikke tabt — den er flyttet med datasættet, hvor den kan
     læse besøgene den peger på. Se selvkontrollen i demo-indkoeb.js. */

  /* Loft mod kpi/, som flåden. */
  const iAlt = (DEMO_KPI.gods?.flaade?.paaVaerksted || 0) + (DEMO_KPI.bus?.flaade?.paaVaerksted || 0);
  if (paaVaerkstedNu.size > iAlt) {
    console.warn(
      `demo-vaerksted: ${paaVaerkstedNu.size} biler er på værksted i dag, men kpi/ siger ` +
      `${iAlt} i hele flåden (gods + bus). Et udsnit kan ikke være større end totalen.`
    );
  }

}

/* Hjælper brugt af selvkontrollen og af skærmen: kaldenavnet på en bil. */
export function demoKoeretoejKaldenavn(koeretoejId) {
  const k = DEMO_KOERETOEJER.find((x) => x.id === koeretoejId);
  return k?.kaldenavn || koeretoejId;
}
