/* Ren envejsnormalisering fra Fleet-stamdata til Planning-fakta. */
import { gruppeFor } from "../flaade.js";
import { KILDE, REFERENCEART } from "../planning-basic.js";

export function fraFleetKoeretoej(koeretoej, enhedstyper = []) {
  if (!koeretoej?.id) throw new Error("fraFleetKoeretoej: køretøjet mangler id.");
  const kapacitet = { ...(koeretoej.kapacitet || {}) };
  const enhedstypeId = koeretoej.kategoriId || null;
  const enhedstype = enhedstyper.find((post) => post.id === enhedstypeId) || null;
  if (Number.isFinite(koeretoej.saeder)) kapacitet.saeder = koeretoej.saeder;
  return {
    reference: { kilde: KILDE.FLEET, art: REFERENCEART.KOERETOEJ, id: koeretoej.id },
    ejerKilde: KILDE.FLEET,
    visningsnavn: koeretoej.kaldenavn || koeretoej.navn || koeretoej.id,
    status: koeretoej.status || null,
    stationering: koeretoej.hjemsted || null,
    koeretoej: {
      type: koeretoej.art,
      enhedstype: enhedstypeId ? {
        id: enhedstypeId,
        navn: enhedstype?.navn || `Ukendt enhedstype (${enhedstypeId})`,
        aktiv: enhedstype?.aktiv !== false,
      } : null,
      gruppe: gruppeFor(koeretoej.art),
      kapacitet,
    },
  };
}

export const fraFleetKoeretoejer = (koeretoejer = [], enhedstyper = []) =>
  koeretoejer.map((koeretoej) => fraFleetKoeretoej(koeretoej, enhedstyper));
