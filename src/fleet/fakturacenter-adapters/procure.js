/*
 * Read-only PROCURE-adapter.
 * Adapteren kopierer kun de felter, den fælles matchkontrakt behøver.
 */
import { bygDestination, MODUL } from "../fakturacenter-intake.js";

export function destinationerFraProcure(ordrer = []) {
  return ordrer.map((ordre) => bygDestination({
    tenantId: ordre.tenantId,
    modul: MODUL.procure,
    destinationId: ordre.id,
    navn: ordre.navn,
    operationelStatus: ordre.operationelStatus,
    fakturastatus: ordre.fakturastatus,
    datoMs: ordre.datoMs,
    leverandoer: ordre.leverandoer,
    referencer: ordre.referencer,
    enhed: ordre.enhed,
    lokation: ordre.lokation,
    koststeder: ordre.koststeder,
    forventetNettoOere: ordre.ordreNettoOere,
  }));
}
