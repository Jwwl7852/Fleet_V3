/* src/fleet/demo-dashboard.js
 * Dashboards liste over åbne opgaver der kræver opfølgning.
 *
 * ⚠ SJETTE GANG MØNSTRET DUKKER OP. Listen lå som `const OPGAVER` inde i
 * moduler/Dashboard.jsx og gled forbi test/demo-kilder.test.mjs, fordi den
 * prøve matchede på NAVN — `DEMO_[A-ZÆØÅ0-9_]+` — og et datasæt man skriver
 * midt i en skærm hedder netop ikke DEMO_noget. Prøven kender nu et datasæt på
 * sin FORM: et modul-niveau array med mindst tre id-bærende poster.
 *
 * ---------------------------------------------------------------------------
 * ⚠ INDHOLDET BLEV FLYTTET UÆNDRET, OG DET AFSLØREDE TO DRIFTER
 *
 * Listen overlapper med DEMO_OPGAVER og DEMO_BESOEG, og de var ikke enige.
 * Selvkontrollen nedenfor fandt to steder hvor samme arbejde stod på hver sin
 * bil — netop fordi datasættene endelig lå samme sted og kunne sammenlignes:
 *
 *   "Fordør lukker ikke i"       Bus 12 her, Bil 77 i demo-opgaver.
 *                                Bil 77 er en SOLGT TRÆKKER. Rettet: op-010
 *                                peger nu på Bus 12.
 *   "Serviceeftersyn 30.000 km"  Bil 104 her og i demo-vaerksted (vb-005,
 *                                aftalt på sag FLT-2026-00381), Bil 78 i
 *                                demo-opgaver. Afgjort: servicen hører til
 *                                BIL 104. op-002 beskrev en anden service og
 *                                hedder nu "Serviceeftersyn – 270.000 km",
 *                                som passer til Bil 78s 268.400 km og til
 *                                vb-001s navngivning på samme bil.
 *
 * Den anden kunne kun afgøres af den der kender flåden — ikke af mig.
 * Selvkontrollen sagde til om driften i stedet for at lukke den med en
 * gætning, og det var det rigtige: svaret var Bil 104, og jeg ville have
 * flyttet den forkerte vej.
 *
 * Når Dashboard læser DEMO_OPGAVER direkte, forsvinder filen her. Det er hele
 * pointen med at flytte listen herind først.
 *
 * `alvor` og `type` findes ikke på DEMO_OPGAVER. Det er den anden grund til at
 * sammenlægningen ikke kan gøres mekanisk: `type` (Reparation/Service/Facility)
 * blander opgavens ART med arbejdets slags, og de to er forskellige ting —
 * DEMO_BESOEG har allerede `type` som service/reparation/daek/syn.
 */
import { DEMO_KOERETOEJER } from "./demo-flaade.js";
import { DEMO_OPGAVER } from "./demo-opgaver.js";
import { DEMO_BESOEG } from "./demo-vaerksted.js";
import { ALVOR } from "./format.js";

const D = 864e5;

/* `tone` og `status` står som par: status er teksten, tone er pillen. De burde
   komme fra OPGAVE_STATUS i opgaver.js — det gør de når listen bliver til et
   udsnit af DEMO_OPGAVER. Indtil da står de som de stod, så Dashboard viser
   det samme som før flytningen. */
export const DEMO_DASHBOARD_OPGAVER = [
  { id: 1, ms: Date.now() - 3 * D, enhed: "Bil 155", type: "Reparation", besk: "Palleløfter vil ikke løfte", ansv: "Lars Aage", status: "Indberettet", tone: "warn", est: 650000, alvor: "hoej" },
  { id: 2, ms: Date.now() - 4 * D, enhed: "Bil 104", type: "Service", besk: "Serviceeftersyn 30.000 km", ansv: "Rene Thomsen", status: "Planlagt", tone: "info", est: 320000, alvor: "mellem" },
  { id: 3, ms: Date.now() - 5 * D, enhed: "Porte – Port 3", type: "Facility", besk: "Port lukker langsomt", ansv: "Benjamin", status: "Afventer", tone: "warn", est: 480000, alvor: "hoej" },
  { id: 4, ms: Date.now() - 6 * D, enhed: "Lastbil 106", type: "Reparation", besk: "Motorlampe lyser", ansv: "Lars Aage", status: "I gang", tone: "ok", est: 1200000, alvor: "hoej" },
  { id: 5, ms: Date.now() - 7 * D, enhed: "Truck 2", type: "Service", besk: "Gaffeljustering og smøring", ansv: "Benjamin", status: "Planlagt", tone: "info", est: 180000, alvor: "lav" },
  { id: 6, ms: Date.now() - 8 * D, enhed: "Bus 12", type: "Reparation", besk: "Fordør lukker ikke i", ansv: "Rene Thomsen", status: "Indberettet", tone: "warn", est: 540000, alvor: "hoej" },
];

/* ---- Selvkontrol ------------------------------------------------------- */

if (import.meta.env?.DEV) {
  const kaldenavne = new Set(DEMO_KOERETOEJER.map((k) => k.kaldenavn).filter(Boolean));

  for (const o of DEMO_DASHBOARD_OPGAVER) {
    if (!ALVOR[o.alvor]) {
      console.warn(`demo-dashboard: ${o.id} har ukendt alvor "${o.alvor}".`);
    }
    if (!["gods", "bus", "faelles"].includes(o.division)) {
      console.warn(`demo-dashboard: ${o.id} har ugyldig division "${o.division}".`);
    }
    /* ⚠ ENHEDEN ER EN STRENG, IKKE ET ID. Det er selve problemet med listen:
       "Bil 104" kan ikke slås op, den kan kun sammenlignes. Findes navnet
       ikke i flåden, er der ingen der opdager det — medmindre nogen kigger.
       Facility-poster ("Porte – Port 3") har ingen bil og springes over. */
    if (o.type !== "Facility" && !kaldenavne.has(o.enhed)) {
      console.warn(
        `demo-dashboard: ${o.id} står på "${o.enhed}", som ikke er et kaldenavn i ` +
        `demo-flaade. Feltet er fritekst og kan ikke slås op — det er derfor ` +
        `listen skal blive til et udsnit af DEMO_OPGAVER.`
      );
    }
  }

  /* ⚠ DEN VIGTIGE. Samme arbejde beskrevet to steder, på hver sin bil.
     Den lukker ikke driften — den siger til om den, fordi svaret på hvilken
     bil der har den service, er et domænespørgsmål og ikke en kodefejl. */
  const normaliser = (s) => (s || "").toLowerCase().replace(/[\s–—-]+/g, " ").trim();
  const enhedFor = (koeretoejId) =>
    DEMO_KOERETOEJER.find((k) => k.id === koeretoejId)?.kaldenavn || null;

  /* ⚠ TRE DATASÆT, IKKE TO. Den tredje kopi lå i demo-vaerksted: den samme
     30.000 km-service stod som opgave OG som besøg OG her. Tjekket dækker
     derfor begge — ellers finder man den ene halvdel af driften og tror man
     er færdig. */
  const andre = [
    ...DEMO_OPGAVER.map((o) => ({ id: o.id, kilde: "demo-opgaver", besk: o.beskrivelse, koeretoejId: o.koeretoejId })),
    ...DEMO_BESOEG.map((b) => ({ id: b.id, kilde: "demo-vaerksted", besk: b.beskrivelse, koeretoejId: b.koeretoejId })),
  ];

  for (const d of DEMO_DASHBOARD_OPGAVER) {
    for (const a of andre) {
      if (normaliser(d.besk) !== normaliser(a.besk)) continue;
      const andenEnhed = enhedFor(a.koeretoejId);
      if (andenEnhed && andenEnhed !== d.enhed) {
        console.warn(
          `demo-dashboard: "${d.besk}" står på ${d.enhed} her og på ${andenEnhed} ` +
          `i ${a.kilde} (${a.id}). To datasæt beskriver samme arbejde på hver ` +
          `sin bil — det er Bil 104 med to nummerplader. Afgør hvilken der er ` +
          `rigtig, og lad Dashboard læse DEMO_OPGAVER i stedet.`
        );
      }
    }
  }

  /* Og de to ANDRE indbyrdes — driften behøver ikke gå gennem Dashboard for
     at findes. Det var netop sådan "Serviceeftersyn 30.000 km" kunne stå på
     Bil 78 i demo-opgaver og Bil 104 i demo-vaerksted. */
  for (const o of DEMO_OPGAVER) {
    for (const b of DEMO_BESOEG) {
      if (normaliser(o.beskrivelse) !== normaliser(b.beskrivelse)) continue;
      if (o.koeretoejId && b.koeretoejId && o.koeretoejId !== b.koeretoejId) {
        console.warn(
          `demo-opgaver/${o.id} og demo-vaerksted/${b.id} beskriver begge ` +
          `"${o.beskrivelse}", men står på ${enhedFor(o.koeretoejId)} og ` +
          `${enhedFor(b.koeretoejId)}.`
        );
      }
    }
  }
}
