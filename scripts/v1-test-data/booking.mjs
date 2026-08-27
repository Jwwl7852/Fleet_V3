/* scripts/v1-test-data/booking.mjs
 * V1-testselskabets bookinger og etaper. Tre forløb: to reserverede, og ét
 * der afventer koordinator med et ægte, godkendbart forslag — "1
 * processable Planning-forslag" fra opgaven.
 *
 * ⚠ BOOKINGENS `tilstand` SÆTTES IKKE HER — den regnes af
 * forloebstilstand(etaper) i hovedscriptet, samme funktion som
 * bookingOpdatering() bruger (booking-state.js, beslutning 40). Feltet
 * herunder er kun en PLACEHOLDER så formen er let at læse; scriptet
 * overskriver den.
 *
 * Alle tre er indenlandske (kunDanmark: true, ingen graenseovergange) — det
 * holder passager/prisopslag ude af scope for testselskabets startdata.
 */
const D = 86400000;
const T = 3600000;
const NU = Date.now();
const D0 = (() => { const d = new Date(NU); d.setHours(0, 0, 0, 0); return d.getTime(); })();
const dag = (n, time = 0) => D0 + n * D + time * T;

export const V1T_BOOKINGER = [
  {
    id: "vtBk1", nummer: "BKG-2026-00001", kundeId: "vtSpedition",
    tilstand: "reserveret", fraSted: "Kolding", tilSted: "Aalborg",
    transporttype: "fuldlast", rutepraeference: "hurtigst",
    oprettetMs: dag(-2), oprettetAf: "uid:disponent",
    omsaetningOere: 450000,
    onsketAfhentningMs: dag(1, 7), afhentningFleks: "timer2",
    onsketLeveringMs: dag(1, 14), leveringFleks: "halvdag",
    krav: [], kundekrav: "",
  },
  {
    id: "vtBk2", nummer: "BKG-2026-00002", kundeId: "vtErhverv",
    tilstand: "reserveret", fraSted: "Aalborg", tilSted: "Kolding",
    transporttype: "delparti", rutepraeference: "billigst",
    oprettetMs: dag(-1), oprettetAf: "uid:disponent",
    omsaetningOere: 210000,
    onsketAfhentningMs: dag(2, 8), afhentningFleks: "halvdag",
    onsketLeveringMs: dag(2, 15), leveringFleks: "dag1",
    krav: [], kundekrav: "",
  },
  {
    id: "vtBk3", nummer: "BKG-2026-00003", kundeId: "vtFastKunde",
    tilstand: "afventerKoord", fraSted: "Kolding", tilSted: "Vejle",
    transporttype: "delparti", rutepraeference: "billigst",
    oprettetMs: dag(0), oprettetAf: "uid:koordinator",
    omsaetningOere: 95000,
    onsketAfhentningMs: dag(3, 8), afhentningFleks: "timer2",
    onsketLeveringMs: dag(3, 12), leveringFleks: "halvdag",
    krav: [], kundekrav: "",
  },
];

export const V1T_ETAPER = [
  {
    id: "et-vt-001", bookingId: "vtBk1", nr: 1,
    tilstand: "reserveret", fraSted: "Kolding", tilSted: "Aalborg",
    fra: dag(1, 7), til: dag(1, 14), etaMs: dag(1, 13),
    graenseovergange: [], kunDanmark: true, passager: {},
    koeretoejIder: { vtBil1: true, vtTrailer1: true }, personId: "vtChauffoer1",
    koerselMin: 200, maengde: { m3: 40, kg: 9000 },
    forslag: {}, valgtForslagId: null, senestMs: null,
  },
  {
    id: "et-vt-002", bookingId: "vtBk2", nr: 1,
    tilstand: "reserveret", fraSted: "Aalborg", tilSted: "Kolding",
    fra: dag(2, 8), til: dag(2, 15), etaMs: dag(2, 14),
    graenseovergange: [], kunDanmark: true, passager: {},
    koeretoejIder: { vtBil3: true }, personId: "vtChauffoer3",
    koerselMin: 190, maengde: { m3: 20, kg: 5000 },
    forslag: {}, valgtForslagId: null, senestMs: null,
  },
  {
    /* ⚠ DEN PROCESSABLE. To forslag, intet valgt — koordinatoren kan straks
       vælge og godkende et af dem under testen. */
    id: "et-vt-003", bookingId: "vtBk3", nr: 1,
    tilstand: "afventerKoord", fraSted: "Kolding", tilSted: "Vejle",
    fra: dag(3, 8), til: dag(3, 12), etaMs: dag(3, 11),
    graenseovergange: [], kunDanmark: true, passager: {},
    koeretoejIder: null, personId: null,
    koerselMin: 90, maengde: { m3: 8, kg: 900 },
    forslag: {
      "fs-vt-a": {
        nr: 1, koeretoejIder: { vtVarevogn6: true }, personId: "vtChauffoer1",
        afhentningMs: dag(3, 8), leveringMs: dag(3, 12), transitTimer: 3,
        estimatOere: 92000, note: "Varevogn — hurtigst, samme dag.",
      },
      "fs-vt-b": {
        nr: 2, koeretoejIder: { vtBil5: true }, personId: "vtChauffoer2",
        afhentningMs: dag(3, 9), leveringMs: dag(3, 13), transitTimer: 3.5,
        estimatOere: 84000, note: "Lastbil — billigere, en time senere.",
      },
    },
    valgtForslagId: null, senestMs: null,
  },
];
