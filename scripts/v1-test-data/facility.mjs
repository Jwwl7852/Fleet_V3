/* scripts/v1-test-data/facility.mjs
 * V1-testselskabets Facility-data — én lokation, tre aktiver. Samme nodeform
 * som tenants/<t>/facility/lokationer/<id> og .../aktiver/<id>
 * (se src/fleet/demo-facility.js).
 *
 * Kun de tre typer opgaven bad om: Alarmanlæg, Port 1, Vaskehal.
 */
import { STED } from "../../src/fleet/steder.js";

const NU = Date.now();
const D = 86400000;

export const V1T_LOKATIONER = [
  { id: "vtLokKolding", navn: "Hovedkontor Kolding", type: "hovedkontor", sted: STED.kolding,
    arealM2: 1800, adresse: "Testvej 1, 6000 Kolding" },
];

export const V1T_AKTIVER = [
  { id: "vtAktivAlarm", navn: "Alarmanlæg", art: "alarm", lokationId: "vtLokKolding",
    status: "idrift", serviceIntervalDage: 365, naesteServiceMs: NU + 200 * D,
    ansvarligPersonId: "vtAdmin1" },
  { id: "vtAktivPort1", navn: "Port 1", art: "port", lokationId: "vtLokKolding",
    status: "idrift", serviceIntervalDage: 180, naesteServiceMs: NU + 40 * D,
    ansvarligPersonId: "vtKontor1" },
  { id: "vtAktivVaskehal", navn: "Vaskehal", art: "vaskehal", lokationId: "vtLokKolding",
    status: "idrift", serviceIntervalDage: 120, naesteServiceMs: NU + 60 * D,
    ansvarligPersonId: "vtKontor1" },
];
