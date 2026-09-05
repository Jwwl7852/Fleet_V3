/* Ren envejsnormalisering fra Workforce-formede snapshots.
 * Fraværsårsag og fritekst kopieres bevidst aldrig.
 */
import { funktionerAf } from "../personale.js";
import { KILDE, REFERENCEART } from "../planning-basic.js";

export function fraWorkforceMedarbejder(person, {
  kompetencer = [], fravaer = [], vagter = [], stationeringRef = null,
} = {}) {
  if (!person?.id) throw new Error("fraWorkforceMedarbejder: personen mangler personId.");
  const personKompetencer = kompetencer.filter((k) => k?.personId === person.id);
  const personFravaer = fravaer.filter((f) => f?.personId === person.id);
  return {
    reference: { kilde: KILDE.WORKFORCE, art: REFERENCEART.MEDARBEJDER, id: person.id },
    ejerKilde: KILDE.WORKFORCE,
    visningsnavn: person.navn || person.id,
    status: person.status || null,
    funktioner: funktionerAf(person),
    stationering: person.stationeret || null,
    ...(stationeringRef ? { stationeringRef } : {}),
    kompetencer: [...new Set(personKompetencer.map((k) => k.type).filter(Boolean))],
    certifikater: personKompetencer
      .filter((k) => k.type && Number.isFinite(k.udloeberMs))
      .map((k) => ({ kode: k.type, udloeberMs: k.udloeberMs })),
    tilgaengelighed: {
      vagter: vagter
        .filter((v) => v?.personId === person.id)
        .map((v) => ({ id: v.id, fraMs: v.fraMs, tilMs: v.tilMs })),
      fravaer: personFravaer.map((f) => ({
        id: f.id,
        fraMs: Number.isFinite(f.fraMs) ? f.fraMs : f.fra,
        tilMs: Number.isFinite(f.tilMs) ? f.tilMs : f.til,
        reference: f.id || null,
      })),
    },
  };
}

export const fraWorkforceMedarbejdere = (personale = [], fakta = {}) =>
  personale.map((person) => fraWorkforceMedarbejder(person, fakta));
