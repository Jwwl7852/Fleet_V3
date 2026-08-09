/* src/fleet/demo-grundlag.js
 * Demo-data til Fakturagrundlag. Beslutning 25.
 *
 * ⚠ DATASÆTTET HØRER HER, IKKE I SKÆRMEN. Et datasæt defineret i en modulfil
 * kan ikke nås af de andre skærme, og så laver de deres egen kopi — det var
 * Bil 104 med to nummerplader. test/demo-kilder.test.mjs fejler på det.
 *
 * De fire poster er valgt så hver af beslutning 25's regler kan SES på skærmen
 * frem for kun at stå i en test:
 *
 *   grl-001  Låst og eksporteret. Det normale forløb.
 *   grl-002  Kladde på bk-2026-00317, som har en ÅBEN etape → kan ikke
 *            godkendes. Årsagen står på skærmen.
 *   grl-003  Godkendt, men en linje mangler momssats → eksporten er spærret.
 *            Vi gætter ikke 25 %.
 *   grl-004  Erstatter grl-001. Begge findes; kun grl-004 tæller med i summen.
 *            Det er fordoblingen, gjort synlig.
 */

import { LINJE_ART, byggGrundlag, ANTAL_SKALA } from "./grundlag.js";

const NU = Date.now();
const D = 24 * 60 * 60 * 1000;

/* Samme mønster som de øvrige demo-filer: id'erne peger på rigtige bookinger,
   etaper og kunder. Peger de på noget der ikke findes, siger selvkontrollen
   nederst til — en demo der modsiger sig selv, læses som en fejl i koden. */

const t = (n) => Math.round(n * ANTAL_SKALA);

export const DEMO_GRUNDLAG = [
  {
    /* Det normale: kørt, opgjort, godkendt, eksporteret. */
    id: "grl-001",
    nummer: "GRL-2026-00311",
    bookingId: "bk-2026-00311",
    kundeId: "nordiskFragt",
    division: "gods",
    tilstand: "laast",
    udarbejdetAf: "uid-mette", udarbejdetMs: NU - 9 * D,
    godkendtAf: "uid-jorn", godkendtMs: NU - 8 * D,
    laastMs: NU - 8 * D,
    eksportReference: "e-conomic bilag 4471",
    erstatterId: null,
    /* ⚠ SAT AF ERSTATNINGEN NEDENFOR. Det er den fremadrettede halvdel af
       to-vejs-referencen, og uden den ville grl-001 stadig tælle med. */
    erstattetAfId: "grl-004",
    linjer: [
      { id: "grl-001-l1", art: "koersel", tekst: "København → Hamburg",
        antal: t(1), enhed: "tur", satsOere: 12_400_00, momssats: 25,
        kilde: { type: "etape", id: "et-001" } },
      { id: "grl-001-l2", art: "tillaeg", tekst: "Færge Rødby–Puttgarden",
        antal: t(1), enhed: "stk", satsOere: 1_850_00, momssats: 25 },
    ],
    historik: [
      { hvad: "oprettet", af: "uid-mette", ms: NU - 9 * D },
      { hvad: "godkendt", af: "uid-jorn", ms: NU - 8 * D },
      { hvad: "laast", af: "uid-jorn", ms: NU - 8 * D, reference: "e-conomic bilag 4471" },
      { hvad: "erstattet", af: "uid-jorn", ms: NU - 2 * D,
        begrundelse: "Ventetiden i Hamburg var ikke med. Kunden gjorde opmærksom på det." },
    ],
  },

  {
    /* ⚠ DEN VIGTIGSTE POST PÅ SKÆRMEN.
       bk-2026-00317 har to etaper: et-008 er udført, et-007 er ÅBEN og venter
       på en returtur. Grundlaget kan derfor ikke godkendes, og skærmen skal
       skrive hvorfor. Fakturerede vi nu, sendte vi en regning for en tur der
       kun er kørt den ene vej. */
    id: "grl-002",
    nummer: "GRL-2026-00317",
    bookingId: "bk-2026-00317",
    kundeId: "hamburgHandel",
    division: "gods",
    tilstand: "kladde",
    udarbejdetAf: "uid-mette", udarbejdetMs: NU - 1 * D,
    godkendtAf: null, godkendtMs: null, laastMs: null,
    erstatterId: null, erstattetAfId: null,
    linjer: [
      { id: "grl-002-l1", art: "koersel", tekst: "København → Hamburg",
        antal: t(1), enhed: "tur", satsOere: 12_400_00, momssats: 25,
        kilde: { type: "etape", id: "et-008" } },
    ],
    historik: [{ hvad: "oprettet", af: "uid-mette", ms: NU - 1 * D }],
  },

  {
    /* Godkendt, men eksporten er spærret: turen går til Norge, og ingen har
       taget stilling til momsen. Vi sætter IKKE 25 for at komme videre — se
       noten i validerLinje(). Dette er det åbne spørgsmål gjort synligt. */
    id: "grl-003",
    nummer: "GRL-2026-00313",
    bookingId: "bk-2026-00313",
    kundeId: "skagenSeafood",
    division: "gods",
    tilstand: "godkendt",
    udarbejdetAf: "uid-mette", udarbejdetMs: NU - 4 * D,
    godkendtAf: "uid-jorn", godkendtMs: NU - 3 * D,
    laastMs: null,
    erstatterId: null, erstattetAfId: null,
    linjer: [
      { id: "grl-003-l1", art: "koersel", tekst: "Skagen → Oslo",
        antal: t(1), enhed: "tur", satsOere: 18_900_00,
        /* ⚠ MANGLER MED VILJE. Eksport til Norge er ikke 25 %, og gættet ville
           blive en forkert momsangivelse frem for en visningsfejl. */
        momssats: null,
        kilde: { type: "etape", id: "et-003" } },
      { id: "grl-003-l2", art: "ventetid", tekst: "Ventetid ved toldbehandling",
        antal: t(2.5), enhed: "time", satsOere: 675_00, momssats: 25,
        kilde: { type: "etape", id: "et-003" } },
    ],
    historik: [
      { hvad: "oprettet", af: "uid-mette", ms: NU - 4 * D },
      { hvad: "godkendt", af: "uid-jorn", ms: NU - 3 * D },
    ],
  },

  {
    /* Erstatningen af grl-001. Samme arbejde, én linje mere.
       ⚠ BEGGE POSTER FINDES. Summen må ikke tage begge — se summer(). */
    id: "grl-004",
    nummer: "GRL-2026-00389",
    bookingId: "bk-2026-00311",
    kundeId: "nordiskFragt",
    division: "gods",
    tilstand: "godkendt",
    udarbejdetAf: "uid-jorn", udarbejdetMs: NU - 2 * D,
    godkendtAf: "uid-jorn", godkendtMs: NU - 2 * D,
    laastMs: null,
    erstatterId: "grl-001",
    erstattetAfId: null,
    linjer: [
      { id: "grl-004-l1", art: "koersel", tekst: "København → Hamburg",
        antal: t(1), enhed: "tur", satsOere: 12_400_00, momssats: 25,
        kilde: { type: "etape", id: "et-001" } },
      { id: "grl-004-l2", art: "tillaeg", tekst: "Færge Rødby–Puttgarden",
        antal: t(1), enhed: "stk", satsOere: 1_850_00, momssats: 25 },
      { id: "grl-004-l3", art: "ventetid", tekst: "Ventetid ved læsning, Hamburg",
        antal: t(3), enhed: "time", satsOere: 675_00, momssats: 25,
        kilde: { type: "etape", id: "et-001" } },
    ],
    historik: [
      { hvad: "erstatter", af: "uid-jorn", ms: NU - 2 * D, erstatterId: "grl-001",
        begrundelse: "Ventetiden i Hamburg var ikke med. Kunden gjorde opmærksom på det." },
      { hvad: "godkendt", af: "uid-jorn", ms: NU - 2 * D },
    ],
  },
];

/* ---- Selvkontrol ------------------------------------------------------- */

if (import.meta.env?.DEV) {
  const ider = new Set(DEMO_GRUNDLAG.map((g) => g.id));

  for (const g of DEMO_GRUNDLAG) {
    for (const l of g.linjer || []) {
      if (!LINJE_ART[l.art]) {
        console.warn(`demo-grundlag: ${g.id}/${l.id} har ukendt linjeart "${l.art}".`);
      }
      if (LINJE_ART[l.art]?.kraeverKilde && !l.kilde?.id) {
        console.warn(`demo-grundlag: ${g.id}/${l.id} er en ${l.art}-linje uden kilde.`);
      }
      if (!Number.isInteger(l.satsOere)) {
        console.warn(`demo-grundlag: ${g.id}/${l.id} har en sats der ikke er hele ører.`);
      }
      if (!Number.isInteger(l.antal)) {
        console.warn(`demo-grundlag: ${g.id}/${l.id} har et antal der ikke er tusinddele som integer.`);
      }
    }

    /* ⚠ TO-VEJS-REFERENCEN SKAL HÆNGE SAMMEN BEGGE VEJE. Peger den ene vej
       uden den anden, har vi enten to gældende grundlag for samme arbejde
       eller et forældreløst. Begge dele er fordoblingen. */
    if (g.erstatterId) {
      const gammelt = DEMO_GRUNDLAG.find((x) => x.id === g.erstatterId);
      if (!gammelt) {
        console.warn(`demo-grundlag: ${g.id} erstatter "${g.erstatterId}", som ikke findes.`);
      } else if (gammelt.erstattetAfId !== g.id) {
        console.warn(
          `demo-grundlag: ${g.id} erstatter ${gammelt.id}, men ${gammelt.id}.erstattetAfId ` +
          `er "${gammelt.erstattetAfId}". Referencen skal gå BEGGE veje, ellers tæller begge med.`
        );
      }
    }
    if (g.erstattetAfId && !ider.has(g.erstattetAfId)) {
      console.warn(`demo-grundlag: ${g.id} er erstattet af "${g.erstattetAfId}", som ikke findes.`);
    }

    if (g.tilstand === "laast" && !g.laastMs) {
      console.warn(`demo-grundlag: ${g.id} er låst uden laastMs.`);
    }
    if (g.tilstand !== "kladde" && !g.godkendtAf) {
      console.warn(`demo-grundlag: ${g.id} er ${g.tilstand} uden godkendtAf.`);
    }
  }

  /* At mindst ét grundlag mangler momssats, er ikke en fejl — det er pointen.
     Forsvinder det, forsvinder demonstrationen af at vi ikke gætter. */
  const udenMoms = DEMO_GRUNDLAG.filter((g) => (g.linjer || []).some((l) => !Number.isFinite(l.momssats)));
  if (!udenMoms.length) {
    console.warn(
      "demo-grundlag: intet grundlag mangler momssats længere. Så kan skærmen ikke " +
      "vise at eksporten spærres, og det åbne spørgsmål bliver usynligt."
    );
  }
}
