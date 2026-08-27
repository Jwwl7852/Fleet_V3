/* scripts/v1-test-data/unitbooking.mjs
 * V1-testselskabets Unitbooking-data — 3 kassetyper, 10 kasser i varierede
 * statusser og ét udlån ("højst 1 Unitbooking-booking" — Section 5).
 * Nodeform som src/fleet/demo-unitbooking.js.
 *
 * ⚠ REOLPLADSERNE LIGGER I lager-pladser.mjs — DELT med Warehouse, samme
 * grund som i demo-lager.js: to kopier af samme node driver fra hinanden.
 *
 * ⚠ KUN "udlaant" OG "klargjort" BINDER EN KASSES STATUS til et udlån (se
 * KASSE_STATUS' egen note i src/fleet/unitbooking.js). Med kun ÉT udlån
 * tilladt her, har derfor kun ÉN kasse en af de to statusser — resten står
 * "ledig" eller "udeAfDrift", som ikke kræver et udlån at pege på.
 */
export const V1T_KASSETYPER = [
  { id: "PA", navn: "Palleboks", beskrivelse: "Standard palleboks til stykgods." },
  { id: "TR", navn: "Transportkasse", beskrivelse: "Mellemstor kasse til løst gods." },
  { id: "KL", navn: "Klimakasse", beskrivelse: "Isoleret kasse med fugtbuffer.",
    undertyper: { std: { navn: "Standard" }, stor: { navn: "Stor" } } },
];

export const V1T_KASSER = [
  { id: "vtKasse1", laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950, type: "PA",
    status: "ledig", hjemPladsId: "vtPladsH1R1F1", pladsId: "vtPladsH1R1F1" },
  { id: "vtKasse2", laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950, type: "PA",
    status: "ledig", hjemPladsId: "vtPladsH1R1F1", pladsId: "vtPladsH1R1F1" },
  /* Den ene kasse med et aktivt udlån — se V1T_KASSEUDLAAN. */
  { id: "vtKasse3", laengdeMm: 1400, breddeMm: 900, hoejdeMm: 1000, type: "TR",
    status: "udlaant", hjemPladsId: "vtPladsH1R1F2" },
  { id: "vtKasse4", laengdeMm: 1400, breddeMm: 900, hoejdeMm: 1000, type: "TR",
    status: "ledig", hjemPladsId: "vtPladsH1R1F2", pladsId: "vtPladsH1R1F2" },
  { id: "vtKasse5", laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950, type: "KL",
    undertype: "std", status: "ledig", hjemPladsId: "vtPladsH1R1F1", pladsId: "vtPladsH1R1F1" },
  { id: "vtKasse6", laengdeMm: 1600, breddeMm: 1000, hoejdeMm: 1100, type: "KL",
    undertype: "stor", status: "ledig", hjemPladsId: "vtPladsH1R1F1", pladsId: "vtPladsH1R1F1" },
  /* Den ene ude af drift — kræver udeAfDriftFra, se reglerne. */
  { id: "vtKasse7", type: "PA", status: "udeAfDrift", hjemPladsId: "vtPladsH1R1F2",
    pladsId: "vtPladsH1R1F2", udeAfDriftFra: Date.now() - 5 * 86400000,
    note: "Lille bule i siden efter transport. Afventer vurdering." },
  { id: "vtKasse8", laengdeMm: 1400, breddeMm: 900, hoejdeMm: 1000, type: "TR",
    status: "ledig", hjemPladsId: "vtPladsH1R1F2", pladsId: "vtPladsH1R1F2" },
  { id: "vtKasse9", laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950, type: "KL",
    undertype: "std", status: "ledig", hjemPladsId: "vtPladsH1R1F1", pladsId: "vtPladsH1R1F1" },
  { id: "vtKasse10", laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950, type: "PA",
    status: "ledig", hjemPladsId: "vtPladsH1R1F2", pladsId: "vtPladsH1R1F2" },
];

/* "Højst 1 Unitbooking-booking" — matcher vtKasse3's status "udlaant". */
export const V1T_KASSEUDLAAN = [
  { id: "vtUdl1", kasseId: "vtKasse3", sagsnummer: "V1T-0001",
    beskrivelse: "V1-testudlån — startpost til brugstesten.",
    fra: Date.now() - 3 * 86400000, til: Date.now() + 11 * 86400000, tilstand: "udlaant" },
];
