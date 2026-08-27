/* scripts/v1-test-data/lager.mjs
 * V1-testselskabets DELTE reolstruktur — brugt af både Warehouse og
 * Unitbooking, samme deling som src/fleet/demo-lager.js beskriver.
 *
 * Tre pladser med WMS-felter (Warehouse), fem uden (Unitbooking).
 */
export const V1T_REOLPLADSER = [
  /* --- Warehouse: med zone, type, status, temperatur. --- */
  { id: "p-v1t-wh-01", hal: "Hovedlager", reol: "A01", fag: "01", hylde: "1", plads: "1",
    zone: "Modtagelse", type: "hylde", status: "aktiv", temperatur: 18.5 },
  { id: "p-v1t-wh-02", hal: "Hovedlager", reol: "A01", fag: "02", hylde: "1", plads: "1",
    zone: "Pluk", type: "hylde", status: "aktiv", temperatur: 18.6 },
  { id: "p-v1t-wh-03", hal: "Hovedlager", reol: "B01", fag: "01", hylde: "1", plads: "1",
    zone: "Pak", type: "hylde", status: "aktiv", temperatur: 18.4 },

  /* --- Unitbooking: uden WMS-felter, som Unitbookings oprindelige pladser. --- */
  { id: "p-v1t-ub-01", hal: "Hal 1", reol: "1", fag: "1", hylde: "1", plads: "1" },
  { id: "p-v1t-ub-02", hal: "Hal 1", reol: "1", fag: "1", hylde: "2", plads: "1" },
  { id: "p-v1t-ub-03", hal: "Hal 1", reol: "2", fag: "1", hylde: "1", plads: "1" },
  { id: "p-v1t-ub-04", hal: "Hal 1", reol: "2", fag: "1", hylde: "2", plads: "1" },
  { id: "p-v1t-ub-05", hal: "Hal 1", reol: "3", fag: "1", hylde: "1", plads: "1" },
];

/**
 * ⚠ KUNDE-IDET SKAL FINDES I kunder.mjs. `vtLager` er den kunde spec'en bad
 * om at gøre "Warehouse/Unitbooking-relevant".
 */
export const V1T_VARER = [
  { id: "v1t-vare-1", kundeId: "vtLager", varenummer: "VLT-001",
    navn: "Pallehejs 1000 kg", enhed: "stk", sporing: "ingen",
    varegruppe: "Værktøj",
    laengdeMm: 850, breddeMm: 550, hoejdeMm: 1250, vaegtG: 68000, minimum: 1,
    aktiv: true },
  { id: "v1t-vare-2", kundeId: "vtLager", varenummer: "VLT-002",
    navn: "Strækfilm 50 cm × 300 m", enhed: "ruller", sporing: "batch",
    varegruppe: "Emballage",
    laengdeMm: 500, breddeMm: 500, hoejdeMm: 500, vaegtG: 2300, minimum: 10,
    aktiv: true },
];

const M = (n) => Math.round(n * 1000);

export const V1T_CARRIERS = [
  { id: "CRR-V1T-01", type: "pallekasse", ejerforhold: "ejet", status: "paaLager",
    pladsId: "p-v1t-wh-01", kundeId: "vtLager",
    laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950 },
  /* ⚠ MODTAGELSE-STARTEREN. Scannet ind, ikke placeret endnu — brugeren
     placerer den under selve testen. */
  { id: "CRR-V1T-02", type: "kartonkasse", ejerforhold: "engang", status: "paaLager",
    kundeId: "vtLager" },
];

export const V1T_BEHOLDNING = [
  { id: "CRR-V1T-01__v1t-vare-1___", carrierId: "CRR-V1T-01", vareId: "v1t-vare-1",
    batch: "_", antal: M(2) },
  { id: "CRR-V1T-02__v1t-vare-2__LOT-2026-01", carrierId: "CRR-V1T-02", vareId: "v1t-vare-2",
    batch: "LOT-2026-01", antal: M(30) },
];
