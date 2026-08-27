/* scripts/v1-test-data/flaade.mjs
 * V1-testselskabets flåde — 6 køretøjer + 2 trailere, samme nodeform som
 * tenants/<t>/koeretoejer/<id> (se src/fleet/demo-flaade.js).
 *
 * Flertallet aktive, én med en kommende service inden for 30 dage (Bil 4 —
 * se den tilhørende opgave i drift.mjs), ingen kunstig kritisk fejl der
 * blokerer starten (ingen status "vaerksted"/"udeAfDrift"/"skrottet").
 *
 * INGEN division — beslutning 19, reglerne afviser feltet.
 * Længder i MILLIMETER som integer — se samletLaengdeMm() i flaade.js.
 */
import { STED } from "../../src/fleet/steder.js";

const NU = Date.now();
const D = 86400000;

export const V1T_KOERETOEJER = [
  { id: "vtBil1", kaldenavn: "V1T Bil 1", navn: "Volvo FH 460",
    registrering: "VT 00 001", art: "traekker", status: "aktiv",
    hjemsted: STED.kolding, naesteServiceKm: 320000,
    laengdeMm: 6200, driftPrKmOere: 312,
    kapacitet: { m3: 0, kg: 0 },
    kmStand: 88400, naesteServiceMs: NU + 95 * D, synMs: NU + 210 * D,
    tachografNr: "VT-TG-001", securityLevel: "normal" },
  { id: "vtBil2", kaldenavn: "V1T Bil 2", navn: "Scania R 450",
    registrering: "VT 00 002", art: "traekker", status: "aktiv",
    hjemsted: STED.kolding, naesteServiceKm: 300000,
    laengdeMm: 6050, driftPrKmOere: 305,
    kapacitet: { m3: 0, kg: 0 },
    kmStand: 61200, naesteServiceMs: NU + 110 * D, synMs: NU + 260 * D,
    tachografNr: "VT-TG-002", securityLevel: "normal" },
  { id: "vtBil3", kaldenavn: "V1T Bil 3", navn: "Mercedes Actros 1848",
    registrering: "VT 00 003", art: "lastbil", status: "aktiv",
    hjemsted: STED.kolding, naesteServiceKm: 260000,
    laengdeMm: 10450, driftPrKmOere: 340,
    kapacitet: { m3: 47, kg: 11900 },
    kmStand: 42800, naesteServiceMs: NU + 88 * D, synMs: NU + 175 * D,
    tachografNr: "VT-TG-003", securityLevel: "normal" },
  /* ⚠ DEN KOMMENDE SERVICE. naesteServiceMs ligger inden for 30 dage, og
     drift.mjs's V1T_OPGAVER har en art:"vaerksted"-opgave der peger på den
     — "1 kommende Fleet-serviceaktivitet" fra opgaven. */
  { id: "vtBil4", kaldenavn: "V1T Bil 4", navn: "MAN TGX 18.440",
    registrering: "VT 00 004", art: "lastbil", status: "aktiv",
    hjemsted: STED.aalborg, naesteServiceKm: 250000,
    laengdeMm: 10350, driftPrKmOere: 338,
    kapacitet: { m3: 46, kg: 11700 },
    kmStand: 96700, naesteServiceMs: NU + 12 * D, synMs: NU + 140 * D,
    tachografNr: "VT-TG-004", securityLevel: "normal" },
  { id: "vtBil5", kaldenavn: "V1T Bil 5", navn: "Iveco S-Way 450",
    registrering: "VT 00 005", art: "lastbil", status: "aktiv",
    hjemsted: STED.kolding, naesteServiceKm: 240000,
    laengdeMm: 10420, driftPrKmOere: 349,
    kapacitet: { m3: 47, kg: 11500 },
    kmStand: 30500, naesteServiceMs: NU + 130 * D, synMs: NU + 300 * D,
    tachografNr: "VT-TG-005", securityLevel: "normal" },
  { id: "vtVarevogn6", kaldenavn: "V1T Varevogn 6", navn: "VW Crafter 35",
    registrering: "VT 00 006", art: "varevogn", status: "aktiv",
    hjemsted: STED.kolding, naesteServiceKm: 90000,
    laengdeMm: 5986, driftPrKmOere: 178,
    kapacitet: { m3: 14, kg: 1400 },
    kmStand: 18200, naesteServiceMs: NU + 65 * D, synMs: NU + 40 * D,
    securityLevel: "normal" },
  /* --- Trailere: ingen kmStand, ingen motor. --- */
  { id: "vtTrailer1", kaldenavn: "V1T Trailer 1", navn: "Krone SDP 27 gardintrailer",
    registrering: "VT 00 T01", art: "trailer", status: "aktiv",
    hjemsted: STED.kolding,
    laengdeMm: 13620, driftPrKmOere: 88,
    kapacitet: { m3: 92, kg: 24000 },
    naesteServiceMs: NU + 100 * D, synMs: NU + 200 * D,
    securityLevel: "normal" },
  { id: "vtTrailer2", kaldenavn: "V1T Trailer 2", navn: "Schmitz S.KO køletrailer",
    registrering: "VT 00 T02", art: "trailer", status: "aktiv",
    hjemsted: STED.aalborg,
    laengdeMm: 13600, driftPrKmOere: 132,
    kapacitet: { m3: 86, kg: 22000 },
    naesteServiceMs: NU + 80 * D, synMs: NU + 160 * D,
    securityLevel: "normal" },
];
