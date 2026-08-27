/* scripts/v1-test-data/grundlag.mjs
 * V1-testselskabets fakturagrundlag — tre forskellige lovlige tilstande
 * (kladde, godkendt, låst), som opgaven bad om. Nodeform som
 * src/fleet/demo-grundlag.js. `linjer` og `historik` er RTDB-nøglede
 * objekter, ikke arrays — se fraDb() i grundlag.js.
 */
const NU = Date.now();
const D = 86400000;
const t = (n) => Math.round(n * 1000);

export const V1T_GRUNDLAG = [
  {
    /* Kladde — hører til vtBk1/et-vt-001, som er reserveret men ikke kørt. */
    id: "grl-v1t-001", nummer: "GRL-2026-00001",
    bookingId: "vtBk1", periode: null, kundeId: "vtSpedition",
    tilstand: "kladde",
    udarbejdetAf: "uid:disponent", udarbejdetMs: NU - 3600000,
    godkendtAf: null, godkendtMs: null, laastMs: null,
    erstatterId: null, erstattetAfId: null,
    linjer: {
      "grl-v1t-001-l1": { id: "grl-v1t-001-l1", art: "koersel", tekst: "Kolding → Aalborg",
        antal: t(1), enhed: "tur", satsOere: 450000, momssats: 25,
        kilde: { type: "etape", id: "et-vt-001" } },
    },
    historik: { h1: { hvad: "oprettet", af: "uid:disponent", ms: NU - 3600000 } },
  },
  {
    /* Godkendt — hører til vtBk2/et-vt-002. */
    id: "grl-v1t-002", nummer: "GRL-2026-00002",
    bookingId: "vtBk2", periode: null, kundeId: "vtErhverv",
    tilstand: "godkendt",
    udarbejdetAf: "uid:disponent", udarbejdetMs: NU - 2 * D,
    godkendtAf: "uid:koordinator", godkendtMs: NU - 1 * D, laastMs: null,
    erstatterId: null, erstattetAfId: null,
    linjer: {
      "grl-v1t-002-l1": { id: "grl-v1t-002-l1", art: "koersel", tekst: "Aalborg → Kolding",
        antal: t(1), enhed: "tur", satsOere: 210000, momssats: 25,
        kilde: { type: "etape", id: "et-vt-002" } },
    },
    historik: {
      h1: { hvad: "oprettet", af: "uid:disponent", ms: NU - 2 * D },
      h2: { hvad: "godkendt", af: "uid:koordinator", ms: NU - 1 * D },
    },
  },
  {
    /* Låst — et PERIODEgrundlag (lagerydelse), ikke et forløb. Viser at
       fakturagrundlag også dækker Warehouse, ikke kun Planning. */
    id: "grl-v1t-003", nummer: "GRL-2026-00003",
    bookingId: null, periode: { fra: NU - 30 * D, til: NU - 1 * D }, kundeId: "vtLager",
    tilstand: "laast",
    udarbejdetAf: "uid:lagermedarbejder", udarbejdetMs: NU - 30 * D,
    godkendtAf: "uid:admin", godkendtMs: NU - 29 * D, laastMs: NU - 28 * D,
    eksportReference: "Manuel test-eksport, v1-test",
    erstatterId: null, erstattetAfId: null,
    linjer: {
      "grl-v1t-003-l1": { id: "grl-v1t-003-l1", art: "lager", tekst: "Håndtering og opbevaring",
        antal: t(1), enhed: "stk", satsOere: 350000, momssats: 25 },
    },
    historik: {
      h1: { hvad: "oprettet", af: "uid:lagermedarbejder", ms: NU - 30 * D },
      h2: { hvad: "godkendt", af: "uid:admin", ms: NU - 29 * D },
      h3: { hvad: "laast", af: "uid:admin", ms: NU - 28 * D, reference: "Manuel test-eksport, v1-test" },
    },
  },
];
