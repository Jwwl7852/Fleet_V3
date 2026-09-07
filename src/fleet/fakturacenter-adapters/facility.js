/*
 * Read-only FACILITY-adapter.
 * Inputtet er en syntetisk projektion; den eksisterende Facility-model røres ikke.
 */
import { bygDestination, MODUL } from "../fakturacenter-intake.js";

export function destinationerFraFacility(opgaver = []) {
  return opgaver.map((opgave) => bygDestination({
    tenantId: opgave.tenantId,
    modul: MODUL.facility,
    destinationId: opgave.id,
    navn: opgave.navn,
    operationelStatus: opgave.operationelStatus,
    fakturastatus: opgave.fakturastatus,
    datoMs: opgave.datoMs,
    leverandoer: opgave.leverandoer,
    referencer: opgave.referencer,
    enhed: opgave.aktiv,
    lokation: opgave.lokation,
    koststeder: opgave.koststeder,
    forventetNettoOere: opgave.estimatNettoOere,
  }));
}
