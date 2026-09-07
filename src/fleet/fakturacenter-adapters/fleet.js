/*
 * Read-only FLEET-adapter.
 * Den ændrer ikke FLEET-opgaver og opfinder ikke fremtidige referencenumre.
 */
import { bygDestination, MODUL } from "../fakturacenter-intake.js";

export function destinationerFraFleet(opgaver = []) {
  return opgaver.map((opgave) => bygDestination({
    tenantId: opgave.tenantId,
    modul: MODUL.fleet,
    destinationId: opgave.id,
    navn: opgave.navn,
    operationelStatus: opgave.operationelStatus,
    fakturastatus: opgave.fakturastatus,
    datoMs: opgave.datoMs,
    leverandoer: opgave.leverandoer,
    referencer: opgave.referencer,
    enhed: opgave.enhed,
    lokation: opgave.lokation,
    koststeder: opgave.koststeder,
    forventetNettoOere: opgave.estimatNettoOere,
  }));
}
