/* src/fleet/demo-unitbooking.js
 * Demo-data til Unitbooking.
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
import { DEMO_REOLPLADSER } from "./demo-lager.js";
import { selvkontrol } from "./selvkontrol.js";

/* ⚠ REOLPLADSERNE LIGGER I demo-lager.js. Noden deles med Warehouse, og et
   demo-datasæt hører ét sted — ellers laver den anden skærm sin egen kopi.
   Den re-eksporteres IKKE herfra: to navne til det samme er begyndelsen på
   to sæt. Skærmene importerer den direkte fra demo-lager.js. */

export const DEMO_KASSETYPER = [
  /* ⚠ UNDERTYPERNE LIGGER UNDER TYPEN. Planchens "Har undertype: ja/nej" er
     ikke et felt — den er UDLEDT af om der er nogen. Trækassen har ingen,
     og det er med vilje: en type uden undertyper skal kunne ses i data, ellers
     bliver feltet i praksis påkrævet. */
  { id: "AL", navn: "Alukasse", beskrivelse: "Standard alukasse til lærred og ramme.",
    undertyper: {
      std: { navn: "Standard" },
      stor: { navn: "Stor" },
      xl: { navn: "XL" },
    } },
  { id: "TR", navn: "Trækasse", beskrivelse: "Bygget efter mål, til skulptur og montre." },
  { id: "KL", navn: "Klimakasse", beskrivelse: "Isoleret, med fugtbuffer.",
    undertyper: {
      std: { navn: "Standard" },
      stor: { navn: "Stor" },
    } },
];


/**
 * ⚠ DE UDLÅNTE HAR INGEN pladsId. En kasse hos kunden optager ikke en hylde —
 * det var netop prototypens fejl at skrive "Udlånt hos kunde" som plads.
 * Sættet er valgt så begge tilfælde kan ses på skærmen.
 */
/* Tidspunkter som tal, som alle andre Ms-felter.
   ⚠ DEN STOD UNDER DEMO_KASSER, OG SAA KUNNE MODULET IKKE INDLAESES. MDT-108
   fik en udeAfDriftFra, og et `const` der bruges FOER sin egen linje, er i
   sin temporale doedzone: "Cannot access D before initialization". Praecis
   den faelde staar skrevet ned i demo-vaerksted.js ved SAGEN — dér gjaldt den
   en .map() laengere oppe. Her var det et array-literal. */
const D = (a, m, d) => Date.UTC(a, m - 1, d);

export const DEMO_KASSER = [
  { id: "MDT-101", laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950, type: "AL", undertype: "std", status: "udlaant", hjemPladsId: "p-h1-r2-f1-h10-1" },
  { id: "MDT-102", laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950, type: "AL", undertype: "std", status: "ledig", hjemPladsId: "p-h1-r2-f1-h10-1", pladsId: "p-h1-r2-f1-h10-1" },
  { id: "MDT-103", laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950, type: "AL", undertype: "std", status: "udlaant", hjemPladsId: "p-h1-r2-f1-h9-2" },
  { id: "MDT-104", laengdeMm: 1600, breddeMm: 1000, hoejdeMm: 1100, type: "AL", undertype: "stor", status: "klargjort", hjemPladsId: "p-h1-r2-f1-h9-2", pladsId: "p-h1-r2-f1-h9-2" },
  { id: "MDT-105", laengdeMm: 1400, breddeMm: 900, hoejdeMm: 1000, type: "TR", status: "ledig", hjemPladsId: "p-h1-r2-f1-h9-3", pladsId: "p-h1-r2-f1-h9-3" },
  /* ⚠ LEDIG, SELV OM DEN ER RESERVERET til september (ku-4). Kassen står
     fysisk på sin hylde — "booket" er ikke en kassestatus, det er et udlån.
     Sættet er valgt netop for at vise det tilfælde. */
  { id: "MDT-106", laengdeMm: 1400, breddeMm: 900, hoejdeMm: 1000, type: "TR", status: "ledig", hjemPladsId: "p-h1-r1-f1-h7-3", pladsId: "p-h1-r1-f1-h7-3" },
  { id: "MDT-107", laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950, type: "KL", undertype: "std", status: "ledig", hjemPladsId: "p-h1-r1-f1-h7-3", pladsId: "p-h1-r1-f1-h7-3" },
  {
    /* ⚠ DEN ENESTE UDE AF DRIFT — og nu med en dato. Uden den kan
       kalenderen ikke tegne den roede blok, og reglen afviser posten:
       kravet staar paa STATUS-feltet, saa en skrivning uden datoen bliver
       stoppet. Se 6.24. */
    id: "MDT-108", type: "KL", status: "udeAfDrift", hjemPladsId: "p-h1-r1-f1-h6-1",
    udeAfDriftFra: D(2026, 7, 3),
    pladsId: "p-h1-r1-f1-h6-1",
    note: "Fugtbuffer utæt efter transport. Afventer reparation.",
  },
  { id: "MDT-201", laengdeMm: 2000, breddeMm: 1200, hoejdeMm: 1300, type: "AL", undertype: "xl", status: "ledig", hjemPladsId: "p-h2-r1-f2-h3-1", pladsId: "p-h2-r1-f2-h3-1" },
  { id: "MDT-202", laengdeMm: 2000, breddeMm: 1200, hoejdeMm: 1300, type: "AL", undertype: "xl", status: "ledig", hjemPladsId: "p-h2-r1-f2-h3-2", pladsId: "p-h2-r1-f2-h3-2" },
];

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

  /* ══════════════════════════════════════════════════════════════════════
     EN UDSTILLING MED FIRE KASSER I SAMME PERIODE — sag 4412.

     ⚠ SÆTTET HAVDE IKKE ÉN SAG MED MERE END ÉN KASSE. Målt: fire sager, fire
     kasser, én hver — og det samme i den udrullede base (3 udlån, 3 sager,
     største sag 1 kasse). Det er ikke sådan forretningen ser ud: et museum
     låner et helt sæt til én udstilling. §2.6 citerer selv en rigtig sag —
     "SMK/4357/ Levende Landskaber/23.03.2026 – 18.10.2026/MIW".

     Og det kunne ikke SES at det manglede: hver skærm så rigtig ud, fordi én
     kasse pr. sag tegner det samme som ingen gruppering. Først da kalenderen
     skulle kunne gruppere efter SAG, blev det tydeligt at der ikke fandtes
     data hvor de to grupperinger ville se forskellige ud.

     ⚠ OG DEN LØSER EN UENIGHED DER ALLEREDE STOD DER. MDT-103 stod som
     `udlaant` — men dens eneste udlån var `returneret` fra marts. Altså en
     kasse der var ude, uden nogen der havde den. Det er ordret den fejl
     KASSE_STATUS' hoved beskriver som grunden til at `udlaant` ikke kan
     vælges i hånden. Den kunne ikke bare sættes til `ledig`: dens hjemplads er
     optaget af MDT-104, og en kasse på lager skal stå et sted. Den hører til
     her, i et udlån der ER i gang.
     ══════════════════════════════════════════════════════════════════════ */
  {
    id: "ku-5", kasseId: "MDT-103", sagsnummer: "4412",
    beskrivelse: "Nordisk Lys — vandreudstilling, sæt 1 af 4.",
    fra: D(2026, 8, 10), til: D(2026, 9, 25), tilstand: "udlaant",
  },
  {
    id: "ku-6", kasseId: "MDT-102", sagsnummer: "4412",
    beskrivelse: "Nordisk Lys — vandreudstilling, sæt 2 af 4.",
    fra: D(2026, 8, 24), til: D(2026, 9, 25), tilstand: "booket",
  },
  {
    id: "ku-7", kasseId: "MDT-105", sagsnummer: "4412",
    beskrivelse: "Nordisk Lys — vandreudstilling, sæt 3 af 4.",
    fra: D(2026, 8, 24), til: D(2026, 9, 25), tilstand: "booket",
    /* ⚠ DEN ENE MED EN KLARGØRINGSFRIST. Beslutningen var at feltet er
       VALGFRIT (6.12), og et sæt hvor alle fire havde den, ville skjule at
       "Klargøres snart" tæller dem uden dato for sig. */
    klargoerSenest: D(2026, 8, 23),
  },
  {
    id: "ku-8", kasseId: "MDT-107", sagsnummer: "4412",
    beskrivelse: "Nordisk Lys — vandreudstilling, sæt 4 af 4.",
    fra: D(2026, 8, 24), til: D(2026, 9, 25), tilstand: "booket",
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
selvkontrol("demo-unitbooking", () => {
  const typer = new Set(DEMO_KASSETYPER.map((t) => t.id));
  const pladser = new Set(DEMO_REOLPLADSER.map((p) => p.id));
  const kasser = new Set(DEMO_KASSER.map((k) => k.id));
  const PAA_LAGER = ["ledig", "klargjort", "udeAfDrift"];

  const brugtePladser = new Set();

  for (const k of DEMO_KASSER) {
    if (!typer.has(k.type)) {
      console.warn(`demo-unitbooking: ${k.id} har type "${k.type}", som ikke findes i DEMO_KASSETYPER.`);
    }
    if (!pladser.has(k.hjemPladsId)) {
      console.warn(`demo-unitbooking: ${k.id} har hjemPladsId "${k.hjemPladsId}", som ikke findes.`);
    }
    /* ⚠ DEN VIGTIGSTE: en udlånt kasse må IKKE optage en reolplads.
       Prototypen skrev "Udlånt hos kunde" som plads, og så kunne ledige
       hylder ikke tælles. Reglerne afviser det — demo-sættet skal ikke lære
       den næste noget andet. */
    if (k.status === "udlaant" && k.pladsId) {
      console.warn(`demo-unitbooking: ${k.id} er udlånt OG står på en plads. Reglerne afviser den.`);
    }
    if (PAA_LAGER.includes(k.status) && !k.pladsId) {
      console.warn(`demo-unitbooking: ${k.id} er ${k.status} men står ingen steder.`);
    }
    if (k.pladsId) {
      if (!pladser.has(k.pladsId)) {
        console.warn(`demo-unitbooking: ${k.id} står på "${k.pladsId}", som ikke findes.`);
      }
      /* To kasser på samme plads er ikke ulovligt — en hylde kan rumme flere —
         men det skal være med vilje, ikke en kopieret linje. */
      if (brugtePladser.has(`${k.pladsId}|${k.id}`)) {
        console.warn(`demo-unitbooking: ${k.id} står to gange.`);
      }
      brugtePladser.add(`${k.pladsId}|${k.id}`);
    }
  }

  for (const u of DEMO_KASSEUDLAAN) {
    if (!kasser.has(u.kasseId)) {
      console.warn(`demo-unitbooking: udlån ${u.id} peger på kasse "${u.kasseId}", som ikke findes.`);
    }
    if (!(u.til >= u.fra)) {
      console.warn(`demo-unitbooking: udlån ${u.id} slutter før det begynder.`);
    }
    if (!u.sagsnummer) {
      console.warn(`demo-unitbooking: udlån ${u.id} mangler sagsnummer — den eneste nøgle ud af systemet.`);
    }
    /* ⚠ KUN klargjort OG udlaant BINDER KASSENS STATUS. Et *booket* udlån
       gør det ikke: kassen står stadig på hylden, og at kræve det ville
       genindføre den kopi som fjernelsen af kassestatussen "booket" netop
       afskaffede. Se noten ved KASSE_STATUS. */
    const kasse = DEMO_KASSER.find((k) => k.id === u.kasseId);
    if (kasse && ["klargjort", "udlaant"].includes(u.tilstand) &&
        kasse.status !== u.tilstand) {
      console.warn(
        `demo-unitbooking: udlån ${u.id} er ${u.tilstand}, men ${kasse.id} står som ${kasse.status}.`);
    }
  }

  /* ⚠ OG DEN ANDEN VEJ — DEN RETNING DER BETYDER NOGET.
     Kontrollen ovenfor går udlån → kasse: er et udlån i gang, skal kassen sige
     det samme. Den fanger IKKE en kasse der siger `udlaant` uden at der findes
     et udlån at pege på — og det er præcis den fejl KASSE_STATUS' hoved
     beskriver som grunden til at `udlaant` ikke kan vælges i hånden: *"der
     ville findes en kasse der stod som udlånt uden et udlån at pege på, og
     ingen kunne se hvem der havde den."*

     MDT-103 stod sådan: `udlaant`, med et udlån der var `returneret` i marts.
     Sættet så rigtigt ud i hver eneste skærm, fordi ingen spurgte den her vej. */
  for (const k of DEMO_KASSER) {
    if (!["klargjort", "udlaant"].includes(k.status)) continue;
    const passer = DEMO_KASSEUDLAAN.some(
      (u) => u.kasseId === k.id && u.tilstand === k.status);
    if (!passer) {
      console.warn(
        `demo-unitbooking: ${k.id} står som ${k.status}, men intet udlån er ` +
        `${k.status}. En kasse der er ude uden at nogen har den, kan ikke findes igen.`);
    }
  }
});
