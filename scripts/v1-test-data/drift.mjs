/* scripts/v1-test-data/drift.mjs
 * V1-testselskabets driftsdata: bookinger, etaper (inkl. ét åbent forslag),
 * driftsopgaver (Fleet + Facility), én Fleet-indberetning og én
 * frihedsansøgning — samme nodeform som tenants/<t>/{bookinger,etaper,
 * opgaver,indberetninger,fravaer} (se demo-bookinger.js, demo-etaper.js,
 * demo-opgaver.js, demo-indberetninger.js, fravaer.js).
 *
 * ⚠ RESERVATIONERNE SEEDES IKKE HER. De er UDLEDT, ikke et datasæt — se
 * provisioner-v1-test-seed.mjs, som bygger dem med de samme funktioner
 * skærmen og serveren bruger (reservationerFraEtape, reservationFraOpgave,
 * reservationFraFravaer), præcis som provisioner-dev.mjs gør for demo.
 *
 * ⚠ UID-FELTER (oprettetAf) ER PLADSHOLDERE PÅ FORMEN "@rolle" — se
 * indsaetUid() i provisioner-v1-test-seed.mjs. personId-felter er IKKE
 * pladsholdere; de peger direkte på et personale-id fra personale.mjs.
 */
const NU = Date.now();
const D = 86400000;
const T = 3600000;

/* ---- Bookinger — tenants/<t>/bookinger/<id> ---------------------------- */
export const V1T_BOOKINGER = [
  /* 1) Allerede disponeret og godkendt — en igangværende tur. */
  { id: "vtBk1", nummer: "BKG-2026-00001", kundeId: "vtSpedition",
    tilstand: "reserveret", fraSted: "Kolding", tilSted: "Aalborg",
    transporttype: "fuldlast", rutepraeference: "hurtigst",
    oprettetMs: NU - 4 * D, oprettetAf: "@koordinator",
    omsaetningOere: 890000,
    onsketAfhentningMs: NU + 1 * D, afhentningFleks: "timer2",
    onsketLeveringMs: NU + 1 * D + 8 * T, leveringFleks: "halvdag",
    krav: ["Bagsmæklift"], kundekrav: "Ring 30 min. før ankomst" },
  /* 2) Afventer koordinatorens godkendelse af ét forslag — se et-vt-002. */
  { id: "vtBk2", nummer: "BKG-2026-00002", kundeId: "vtErhverv",
    tilstand: "afventerKoord", fraSted: "Kolding", tilSted: "Odense",
    transporttype: "fuldlast", rutepraeference: "hurtigst",
    oprettetMs: NU - 2 * D, oprettetAf: "@koordinator",
    omsaetningOere: 420000,
    onsketAfhentningMs: NU + 2 * D, afhentningFleks: "timer2",
    onsketLeveringMs: NU + 2 * D + 5 * T, leveringFleks: "timer2",
    krav: [], kundekrav: "" },
  /* 3) Kladde — en forespørgsel der endnu ikke er sendt til planlægning. */
  { id: "vtBk3", nummer: "BKG-2026-00003", kundeId: "vtFastKunde",
    tilstand: "kladde", fraSted: "Aalborg", tilSted: "Kolding",
    transporttype: "fuldlast", rutepraeference: "hurtigst",
    oprettetMs: NU - 1 * T, oprettetAf: "@koordinator",
    omsaetningOere: 610000,
    onsketAfhentningMs: NU + 5 * D, afhentningFleks: "halvdag",
    onsketLeveringMs: NU + 6 * D, leveringFleks: "halvdag",
    krav: [], kundekrav: "" },
];

/* ---- Etaper — tenants/<t>/etaper/<id>, boern: ["forslag"] -------------- */
export const V1T_ETAPER = [
  { id: "vtEt1", bookingId: "vtBk1", nr: 1,
    tilstand: "reserveret", fraSted: "Kolding", tilSted: "Aalborg",
    fra: NU + 1 * D, til: NU + 1 * D + 8 * T,
    etaMs: NU + 1 * D + 7.5 * T,
    graenseovergange: [], kunDanmark: true,
    passager: {},
    koeretoejIder: { vtBil1: true }, personId: "vtChauffoer1",
    koerselMin: 240,
    maengde: { m3: 0, kg: 0 },
    forslag: [], valgtForslagId: null, senestMs: null },
  /* Det åbne forslag en koordinator kan behandle. */
  { id: "vtEt2", bookingId: "vtBk2", nr: 1,
    tilstand: "afventerKoord", fraSted: "Kolding", tilSted: "Odense",
    fra: NU + 2 * D, til: NU + 2 * D + 5 * T,
    etaMs: NU + 2 * D + 4.5 * T,
    graenseovergange: [], kunDanmark: true,
    passager: {},
    koeretoejIder: { vtBil2: true }, personId: "vtChauffoer2",
    koerselMin: 150,
    maengde: { m3: 8, kg: 900 },
    forslag: [
      { id: "vtFs1", nr: 1, koeretoejIder: { vtBil2: true }, personId: "vtChauffoer2",
        afhentningMs: NU + 2 * D, leveringMs: NU + 2 * D + 5 * T, transitTimer: 5,
        estimatOere: 420000, note: "Direkte kørsel, ingen mellemstop." },
    ],
    valgtForslagId: null, senestMs: null },
  /* Kladdens etape — intet vognmateriel tildelt endnu. */
  { id: "vtEt3", bookingId: "vtBk3", nr: 1,
    tilstand: "kladde", fraSted: "Aalborg", tilSted: "Kolding",
    fra: NU + 5 * D, til: NU + 6 * D,
    etaMs: null,
    graenseovergange: [], kunDanmark: true,
    passager: {},
    koeretoejIder: null, personId: null,
    koerselMin: 210,
    maengde: { m3: 6, kg: 700 },
    forslag: [], valgtForslagId: null, senestMs: null },
];

/* ---- Driftsopgaver — tenants/<t>/opgaver/<id> --------------------------
   "1 kommende Fleet-serviceaktivitet" + "1 Facility-serviceaktivitet". */
export const V1T_OPGAVER = [
  /* Peger på vtBil4 (flaade.mjs), hvis naesteServiceMs ligger 12 dage ude —
     "kommende service inden for 30 dage". */
  { id: "vtOp1", art: "vaerksted", startMs: NU + 11 * D,
    sted: "Kolding", beskrivelse: "Serviceeftersyn — 250.000 km",
    personId: "vtMekaniker1", koeretoejId: "vtBil4", arbejdstype: "service",
    status: "planlagt", prioritet: "mellem", estimeretMin: 150 },
  { id: "vtOp2", art: "facility", startMs: NU + 5 * D,
    sted: "Kolding", aktivId: "vtAktivVaskehal",
    beskrivelse: "Halvårligt eftersyn af vaskeanlæg",
    personId: "vtLager2", status: "planlagt", prioritet: "lav",
    estimeretMin: 90 },
];

/* ---- Indberetning — tenants/<t>/indberetninger/<id> --------------------
   "1 Fleet-indberetning". art:"reparation" er en driftshændelse, men ikke
   en af de sensitive (koeretoejsskade/godsskade) — ingen
   sensitive/indberetninger-post nødvendig. */
export const V1T_INDBERETNINGER = [
  { id: "vtInd1", art: "reparation", forloeb: "ny", prioritet: "mellem",
    oprettetAf: "@chauffoer", oprettetMs: NU - 1 * D,
    koeretoejId: "vtBil2", bookingId: null, sagId: null,
    beskrivelse: "Ujævn bremsevirkning, mistanke om slidte bremseklodser",
    kmStand: 61500, omkostningOere: null, indkoebId: null,
    ingenOmkostning: null, tidsregistrering: null },
];

/* ---- Frihedsansøgning — tenants/<t>/fravaer/<id> ------------------------
   "højst 1 frihedsanmodning". Status "ansoegt" — afventer kontorets svar,
   præcis den arbejdskø B2 byggede i Workforce → Ferie & fravær. Ingen
   sensitive/fravaer-post: `art` sættes først af kontoret ved godkendelse
   (se fravaer.js's egen note), og en ansøgning har det ikke endnu. */
export const V1T_FRAVAER = [
  { id: "vtFrv1", personId: "vtChauffoer1", fra: NU + 20 * D, til: NU + 24 * D,
    ansoegning: { status: "ansoegt", oensket: "ferie", ansoegtMs: NU - 12 * 3600000 },
    note: "Familiesammenkomst i weekenden." },
];
