/* scripts/v1-test-data/opgaver.mjs
 * V1-testselskabets opgaver — én kommende Fleet-service (matcher vtBil4's
 * naesteServiceMs i flaade.mjs) og ét Facility-servicebesøg hos en ekstern
 * leverandør. Nodeform som src/fleet/demo-opgaver.js.
 */
const NU = Date.now();
const D = 86400000;
const dag = (n, time = 8) => {
  const d = new Date(NU);
  d.setHours(time, 0, 0, 0);
  return d.getTime() + n * D;
};

export const V1T_OPGAVER = [
  /* Fleet: matcher vtBil4's naesteServiceMs (NU + 12 dage) i flaade.mjs. */
  { id: "op-v1t-001", art: "vaerksted", startMs: dag(12),
    sted: "Aalborg", beskrivelse: "Serviceeftersyn — kommende service",
    personId: "vtMekaniker1", koeretoejId: "vtBil4", arbejdstype: "service",
    status: "planlagt", prioritet: "normal",
    estimeretMin: 150, faktiskMin: null, beloebOere: 210000 },

  /* Facility: eksternt servicebesøg på Port 1 hos vtFacilityService. */
  { id: "op-v1t-002", art: "facility", startMs: dag(5, 9),
    aktivId: "vtAktivPort1", leverandoerId: "vtFacilityService",
    beskrivelse: "Årligt eftersyn af port", status: "planlagt", prioritet: "normal",
    estimeretMin: 120, faktiskMin: null, beloebOere: 450000 },
];
