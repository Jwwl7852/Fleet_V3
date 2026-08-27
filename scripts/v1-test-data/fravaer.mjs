/* scripts/v1-test-data/fravaer.mjs
 * V1-testselskabets ene fraværsansøgning — "højst 1 fraværsanmodning" fra
 * opgaven. Ansøgt, ikke afgjort, så koordinatoren/admin kan afgøre den under
 * testen — samme flow som B2 (ansoegningAfgoer). Formen matcher
 * byggAnsoegning() i src/fleet/fravaer.js nøjagtigt.
 *
 * ⚠ INGEN sensitive/fravaer-post. En ansøgt (endnu ikke godkendt) ansøgning
 * har intet `art` at skjule endnu — kontoret sætter den ved godkendelse.
 */
const NU = Date.now();
const D = 86400000;
const D0 = (() => { const d = new Date(NU); d.setHours(0, 0, 0, 0); return d.getTime(); })();
const dag = (n) => D0 + n * D;

export const V1T_FRAVAER = [
  {
    id: "fv-v1t-001", personId: "vtChauffoer2",
    fra: dag(20), til: dag(25), securityLevel: "normal",
    ansoegning: { status: "ansoegt", oensket: "ferie", ansoegtMs: NU - 2 * 3600000 },
    note: "Ønsker fri i forbindelse med familiefest.",
  },
];
