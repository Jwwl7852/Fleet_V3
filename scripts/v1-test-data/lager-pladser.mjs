/* scripts/v1-test-data/lager-pladser.mjs
 * V1-testselskabets reolpladser — DELT mellem Unitbooking og Warehouse,
 * ligesom src/fleet/demo-lager.js: noden ejes af begge moduler, og et
 * demo-/testdatasæt hører ét sted, ellers laver den anden skærm sin egen
 * kopi (se CLAUDE.md om "Bil 104 med to nummerplader").
 *
 * To almindelige (uden WMS-felter, Unitbookings oprindelige form) og to med
 * de fire valgfrie WMS-felter (zone/type/status/temperatur, Warehouse) —
 * begge former skal kunne stå i samme node.
 */
export const V1T_REOLPLADSER = [
  { id: "vtPladsH1R1F1", hal: "Hal 1", reol: "1", fag: "1", hylde: "1", plads: "1" },
  { id: "vtPladsH1R1F2", hal: "Hal 1", reol: "1", fag: "1", hylde: "2", plads: "1" },
  { id: "vtPladsModtagelse", hal: "Hovedlager", reol: "A01", fag: "01", hylde: "1", plads: "1",
    zone: "Modtagelse", type: "hylde", status: "aktiv", temperatur: 18.5 },
  { id: "vtPladsPluk", hal: "Hovedlager", reol: "B01", fag: "01", hylde: "1", plads: "1",
    zone: "Pluk", type: "hylde", status: "aktiv", temperatur: 18.7 },
];
