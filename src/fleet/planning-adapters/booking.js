/* Read-only projektion af eksisterende transportdata.
 * Ingen transportkommandoer eksporteres, og booking-state.js importeres ikke.
 */
import { enhedsIder } from "../etaper.js";
import { meldingerFor, planlagteStop } from "../rutestatus.js";
import { KILDE, REFERENCEART } from "../planning-basic.js";

const statusListe = (statushaendelser) => Array.isArray(statushaendelser)
  ? [...statushaendelser].sort((a, b) => (a.ms || 0) - (b.ms || 0))
  : meldingerFor(statushaendelser);

export function projicerTransportbooking({ booking = {}, etape, statushaendelser = [] }) {
  if (!etape?.id) throw new Error("projicerTransportbooking: etapen mangler id.");
  return {
    projektionstype: "transportbooking",
    readOnly: true,
    reference: { kilde: KILDE.BOOKING, art: REFERENCEART.RUTE, id: etape.id },
    bookingId: booking.id || etape.bookingId || null,
    bookingnummer: booking.nummer || null,
    kundeRef: booking.kundeId
      ? { kilde: KILDE.BOOKING, art: REFERENCEART.KUNDE, id: booking.kundeId }
      : null,
    transportStatus: etape.tilstand || null,
    fraMs: etape.fra ?? null,
    tilMs: etape.til ?? null,
    fraSted: etape.fraSted || null,
    tilSted: etape.tilSted || null,
    medarbejderRefs: etape.personId
      ? [{ kilde: KILDE.WORKFORCE, art: REFERENCEART.MEDARBEJDER, id: etape.personId }]
      : [],
    koeretoejRefs: enhedsIder(etape).map((id) => ({
      kilde: KILDE.FLEET, art: REFERENCEART.KOERETOEJ, id,
    })),
    stop: planlagteStop(etape).map((stop, i) => ({
      id: stop.id,
      raekkefoelge: i + 1,
      rolle: stop.rolle,
      sted: stop.sted,
      planlagtMs: stop.planlagtMs,
      transportstop: stop.stop || null,
    })),
    statushaendelser: statusListe(statushaendelser).map((h) => ({
      id: h.id || h.klientId,
      type: h.type,
      ms: h.ms,
      stopId: h.stopId || null,
      forsinketMin: Number.isFinite(h.forsinketMin) ? h.forsinketMin : null,
    })),
  };
}
