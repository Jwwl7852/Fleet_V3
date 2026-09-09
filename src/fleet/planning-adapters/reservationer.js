/* Reservationskandidater fra en dagsplan. Skriver intet.
 * Den eksisterende rene overlapkontrol genbruges for allerede understøttede
 * ressourcetyper; Planning- og udstyrsvokabular kræver senere central aftale.
 */
import {
  RESSOURCE as FAELLES_RESSOURCE,
  overlapper,
  tjekLedigMod,
} from "../reservations.js";
import { KILDE, REFERENCEART, AARSAGSKODE, REGELNIVEAU, referenceNoegle } from "../planning-basic.js";

const typeFor = {
  [REFERENCEART.MEDARBEJDER]: FAELLES_RESSOURCE.medarbejder,
  [REFERENCEART.KOERETOEJ]: FAELLES_RESSOURCE.koeretoej,
  [REFERENCEART.LOKATION]: FAELLES_RESSOURCE.lokation,
  [REFERENCEART.UDSTYR]: "udstyr",
};

export function tilReservationskandidater(dagsplan) {
  const kandidater = [];
  const fund = [];
  for (const rute of dagsplan?.ruter || []) {
    for (const [i, brug] of (rute.ressourcebrug || []).entries()) {
      const ref = brug?.ressourceRef;
      const ressourceType = typeFor[ref?.art];
      const gyldigtInterval = Number.isFinite(brug?.fraMs) && Number.isFinite(brug?.tilMs) && brug.tilMs > brug.fraMs;
      if (!ressourceType || !referenceNoegle(ref) || ref.art === REFERENCEART.TEAM || !gyldigtInterval) {
        fund.push({
          kode: ref?.art === REFERENCEART.TEAM ? AARSAGSKODE.TEAM_RESERVERET_DIREKTE : AARSAGSKODE.RESERVATIONSKANDIDAT_UGYLDIG,
          tekst: ref?.art === REFERENCEART.TEAM
            ? "Et kandidatteam producerer ikke reservationer."
            : "Ressourcebrugen kan ikke omsættes til en reservationskandidat.",
          niveau: REGELNIVEAU.HARD,
          sti: `dagsplan.ruter.${rute.id}.ressourcebrug[${i}]`,
          objektId: rute.id,
          objektReference: ref || null,
          reference: `${AARSAGSKODE.RESERVATIONSKANDIDAT_UGYLDIG}:${rute.id}:${i}`,
        });
        continue;
      }
      kandidater.push({
        id: `${dagsplan.id}:${rute.id}:${brug.id || i + 1}`,
        ressourceType,
        ressourceId: ref.id,
        ressourceRef: ref,
        fra: brug.fraMs,
        til: brug.tilMs,
        kilde: { type: KILDE.PLANNING, id: rute.id, reference: dagsplan.id },
        regelmetadata: brug.regelmetadata || null,
        note: null,
      });
    }
  }
  return {
    ok: fund.length === 0,
    harKontrolleredeUndtagelser: false,
    kandidater,
    fund,
  };
}

export const overlapperReservationskandidat = (a, b) => overlapper(a, b);

export const erUnderstoettetAfFaellesReservationer = (kandidat) =>
  Object.values(FAELLES_RESSOURCE).includes(kandidat?.ressourceType);

export function kontrollerKandidatModEksisterende(kandidat, eksisterende = []) {
  if (!erUnderstoettetAfFaellesReservationer(kandidat)) {
    return { ok: false, ikkeUnderstoettet: true, konflikter: [] };
  }
  return tjekLedigMod(eksisterende, kandidat);
}
