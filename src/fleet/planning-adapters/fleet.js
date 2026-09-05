/* Ren envejsnormalisering fra Fleet-stamdata til Planning-fakta. */
import { gruppeFor } from "../flaade.js";
import { KILDE, REFERENCEART } from "../planning-basic.js";

export function fraFleetKoeretoej(koeretoej) {
  if (!koeretoej?.id) throw new Error("fraFleetKoeretoej: køretøjet mangler id.");
  const kapacitet = { ...(koeretoej.kapacitet || {}) };
  if (Number.isFinite(koeretoej.saeder)) kapacitet.saeder = koeretoej.saeder;
  return {
    reference: { kilde: KILDE.FLEET, art: REFERENCEART.KOERETOEJ, id: koeretoej.id },
    ejerKilde: KILDE.FLEET,
    visningsnavn: koeretoej.kaldenavn || koeretoej.navn || koeretoej.id,
    status: koeretoej.status || null,
    stationering: koeretoej.hjemsted || null,
    koeretoej: {
      type: koeretoej.art,
      gruppe: gruppeFor(koeretoej.art),
      kapacitet,
    },
  };
}

export const fraFleetKoeretoejer = (koeretoejer = []) => koeretoejer.map(fraFleetKoeretoej);
