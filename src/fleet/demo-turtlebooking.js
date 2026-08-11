/* src/fleet/demo-turtlebooking.js
 * Demo-data til Turtlebooking.
 *
 * ⚠ ET DEMO-DATASÆT HØRER HER, IKKE I EN MODULFIL. Ligger det i skærmen, kan
 * de andre skærme ikke nå det — og så laver de deres egen kopi. Det var Bil
 * 104 med to nummerplader, og `test/demo-kilder.test.mjs` fejler på mønstret.
 *
 * ⚠ DET ER IKKE HIZKIAS DATA. Prototypen havde ægte kasser, sagsnumre og
 * museer. De hører i deres egen tenant — ikke i demo, hvor enhver kan se dem.
 * Det her er opdigtet, og det er meningen: opdigtede tal findes kun hvor der
 * ikke er en database at spørge.
 */

export const DEMO_KASSETYPER = [
  { id: "AL", navn: "Alukasse", beskrivelse: "Standard alukasse til lærred og ramme." },
  { id: "TR", navn: "Trækasse", beskrivelse: "Bygget efter mål, til skulptur og montre." },
  { id: "KL", navn: "Klimakasse", beskrivelse: "Isoleret, med fugtbuffer." },
];

export const DEMO_REOLPLADSER = [
  { id: "p-h1-r1-f1-h6-1", hal: "Hal 1", reol: "1", fag: "1", hylde: "6", plads: "1" },
  { id: "p-h1-r1-f1-h7-3", hal: "Hal 1", reol: "1", fag: "1", hylde: "7", plads: "3" },
  { id: "p-h1-r2-f1-h9-2", hal: "Hal 1", reol: "2", fag: "1", hylde: "9", plads: "2" },
  { id: "p-h1-r2-f1-h9-3", hal: "Hal 1", reol: "2", fag: "1", hylde: "9", plads: "3" },
  { id: "p-h1-r2-f1-h10-1", hal: "Hal 1", reol: "2", fag: "1", hylde: "10", plads: "1" },
  { id: "p-h2-r1-f2-h3-1", hal: "Hal 2", reol: "1", fag: "2", hylde: "3", plads: "1" },
  { id: "p-h2-r1-f2-h3-2", hal: "Hal 2", reol: "1", fag: "2", hylde: "3", plads: "2" },
];

/**
 * ⚠ DE UDLÅNTE HAR INGEN pladsId. En kasse hos kunden optager ikke en hylde —
 * det var netop prototypens fejl at skrive "Udlånt hos kunde" som plads.
 * Sættet er valgt så begge tilfælde kan ses på skærmen.
 */
export const DEMO_KASSER = [
  { id: "MDT-101", type: "AL", status: "udlaant", hjemPladsId: "p-h1-r2-f1-h10-1" },
  { id: "MDT-102", type: "AL", status: "ledig", hjemPladsId: "p-h1-r2-f1-h10-1", pladsId: "p-h1-r2-f1-h10-1" },
  { id: "MDT-103", type: "AL", status: "udlaant", hjemPladsId: "p-h1-r2-f1-h9-2" },
  { id: "MDT-104", type: "AL", status: "klargjort", hjemPladsId: "p-h1-r2-f1-h9-2", pladsId: "p-h1-r2-f1-h9-2" },
  { id: "MDT-105", type: "TR", status: "ledig", hjemPladsId: "p-h1-r2-f1-h9-3", pladsId: "p-h1-r2-f1-h9-3" },
  /* ⚠ LEDIG, SELV OM DEN ER RESERVERET til september (ku-4). Kassen står
     fysisk på sin hylde — "booket" er ikke en kassestatus, det er et udlån.
     Sættet er valgt netop for at vise det tilfælde. */
  { id: "MDT-106", type: "TR", status: "ledig", hjemPladsId: "p-h1-r1-f1-h7-3", pladsId: "p-h1-r1-f1-h7-3" },
  { id: "MDT-107", type: "KL", status: "ledig", hjemPladsId: "p-h1-r1-f1-h7-3", pladsId: "p-h1-r1-f1-h7-3" },
  {
    id: "MDT-108", type: "KL", status: "udeAfDrift", hjemPladsId: "p-h1-r1-f1-h6-1",
    pladsId: "p-h1-r1-f1-h6-1",
    note: "Fugtbuffer utæt efter transport. Afventer reparation.",
  },
  { id: "MDT-201", type: "AL", status: "ledig", hjemPladsId: "p-h2-r1-f2-h3-1", pladsId: "p-h2-r1-f2-h3-1" },
  { id: "MDT-202", type: "AL", status: "ledig", hjemPladsId: "p-h2-r1-f2-h3-2", pladsId: "p-h2-r1-f2-h3-2" },
];

/* Tidspunkter som tal, som alle andre Ms-felter. */
const D = (a, m, d) => Date.UTC(a, m - 1, d);

export const DEMO_KASSEUDLAAN = [
  {
    id: "ku-1", kasseId: "MDT-101", sagsnummer: "4260",
    beskrivelse: "Monet au Havre — vandliljer, kontemporær have.",
    fra: D(2026, 6, 1), til: D(2026, 10, 4), tilstand: "udlaant",
  },
  {
    id: "ku-2", kasseId: "MDT-103", sagsnummer: "4357",
    beskrivelse: "Levende Landskaber.",
    fra: D(2026, 3, 2), til: D(2026, 3, 22), tilstand: "returneret",
  },
  {
    id: "ku-3", kasseId: "MDT-104", sagsnummer: "4334",
    beskrivelse: "En Dag på Stranden.",
    fra: D(2026, 8, 20), til: D(2026, 9, 10), tilstand: "klargjort",
  },
  {
    id: "ku-4", kasseId: "MDT-106", sagsnummer: "4401",
    beskrivelse: "Skulptur i vinterhaven.",
    fra: D(2026, 9, 1), til: D(2026, 11, 15), tilstand: "booket",
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   SELVKONTROL
   ══════════════════════════════════════════════════════════════════════════

   ⚠ UDEN DEN OPDAGES EN DRIFT FØRST NÅR NOGEN KIGGER. Tre af de fire sæt
   herover peger på hinanden — en kasse på en type og en plads, et udlån på en
   kasse — og en tastefejl i et id giver en tom celle, ikke en fejl.

   Kontrollen kører kun i DEV. Den er den samme slags som i demo-vaerksted.js,
   og den er skrevet fordi mønstret er dukket op seks gange i dette repo.
   ══════════════════════════════════════════════════════════════════════════ */
if (import.meta.env?.DEV) {
  const typer = new Set(DEMO_KASSETYPER.map((t) => t.id));
  const pladser = new Set(DEMO_REOLPLADSER.map((p) => p.id));
  const kasser = new Set(DEMO_KASSER.map((k) => k.id));
  const PAA_LAGER = ["ledig", "klargjort", "udeAfDrift"];

  const brugtePladser = new Set();

  for (const k of DEMO_KASSER) {
    if (!typer.has(k.type)) {
      console.warn(`demo-turtlebooking: ${k.id} har type "${k.type}", som ikke findes i DEMO_KASSETYPER.`);
    }
    if (!pladser.has(k.hjemPladsId)) {
      console.warn(`demo-turtlebooking: ${k.id} har hjemPladsId "${k.hjemPladsId}", som ikke findes.`);
    }
    /* ⚠ DEN VIGTIGSTE: en udlånt kasse må IKKE optage en reolplads.
       Prototypen skrev "Udlånt hos kunde" som plads, og så kunne ledige
       hylder ikke tælles. Reglerne afviser det — demo-sættet skal ikke lære
       den næste noget andet. */
    if (k.status === "udlaant" && k.pladsId) {
      console.warn(`demo-turtlebooking: ${k.id} er udlånt OG står på en plads. Reglerne afviser den.`);
    }
    if (PAA_LAGER.includes(k.status) && !k.pladsId) {
      console.warn(`demo-turtlebooking: ${k.id} er ${k.status} men står ingen steder.`);
    }
    if (k.pladsId) {
      if (!pladser.has(k.pladsId)) {
        console.warn(`demo-turtlebooking: ${k.id} står på "${k.pladsId}", som ikke findes.`);
      }
      /* To kasser på samme plads er ikke ulovligt — en hylde kan rumme flere —
         men det skal være med vilje, ikke en kopieret linje. */
      if (brugtePladser.has(`${k.pladsId}|${k.id}`)) {
        console.warn(`demo-turtlebooking: ${k.id} står to gange.`);
      }
      brugtePladser.add(`${k.pladsId}|${k.id}`);
    }
  }

  for (const u of DEMO_KASSEUDLAAN) {
    if (!kasser.has(u.kasseId)) {
      console.warn(`demo-turtlebooking: udlån ${u.id} peger på kasse "${u.kasseId}", som ikke findes.`);
    }
    if (!(u.til >= u.fra)) {
      console.warn(`demo-turtlebooking: udlån ${u.id} slutter før det begynder.`);
    }
    if (!u.sagsnummer) {
      console.warn(`demo-turtlebooking: udlån ${u.id} mangler sagsnummer — den eneste nøgle ud af systemet.`);
    }
    /* ⚠ KUN klargjort OG udlaant BINDER KASSENS STATUS. Et *booket* udlån
       gør det ikke: kassen står stadig på hylden, og at kræve det ville
       genindføre den kopi som fjernelsen af kassestatussen "booket" netop
       afskaffede. Se noten ved KASSE_STATUS. */
    const kasse = DEMO_KASSER.find((k) => k.id === u.kasseId);
    if (kasse && ["klargjort", "udlaant"].includes(u.tilstand) &&
        kasse.status !== u.tilstand) {
      console.warn(
        `demo-turtlebooking: udlån ${u.id} er ${u.tilstand}, men ${kasse.id} står som ${kasse.status}.`);
    }
  }
}
