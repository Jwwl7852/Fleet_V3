/*
 * Read-only FLEET-adapter.
 * Den ændrer ikke FLEET-opgaver og opfinder ikke fremtidige referencenumre.
 */
import {
  bygDestination,
  bygReferencedestinationV1,
  MODUL,
  REFERENCE_MODUL_V1,
  REFERENCE_PROVENIENS,
  REFERENCE_KONTRAKT_VERSION,
} from "../fakturacenter-intake.js";

function projektion(opgave, { demoLegacy = false } = {}) {
  return {
    kontraktVersion: REFERENCE_KONTRAKT_VERSION,
    proveniens: demoLegacy ? REFERENCE_PROVENIENS.demoLegacy : REFERENCE_PROVENIENS.autoritative,
    tenantId: opgave.tenantId,
    modul: demoLegacy ? MODUL.fleet : REFERENCE_MODUL_V1.fleet,
    destinationId: opgave.id,
    veyroReference: demoLegacy ? opgave.veyroReference ?? opgave.referencer?.[0]
      : opgave.veyroReference,
    bestillingsnummer: opgave.bestillingsnummer ?? null,
    destinationstype: opgave.destinationstype ?? "vaerkstedsopgave",
    navn: opgave.navn,
    operationelStatus: opgave.operationelStatus,
    fakturastatus: opgave.fakturastatus,
    oprettetMs: demoLegacy ? opgave.oprettetMs ?? opgave.datoMs : opgave.oprettetMs,
    aendretMs: demoLegacy ? opgave.aendretMs ?? opgave.datoMs : opgave.aendretMs,
    leverandoer: opgave.leverandoer ? {
      id: opgave.leverandoer.id,
      cvr: opgave.leverandoer.cvr ?? null,
      navn: opgave.leverandoer.navn ?? null,
      navnevarianter: opgave.leverandoer.navnevarianter ?? [],
    } : null,
    referencer: opgave.referencer,
    enhedsreferencer: opgave.enhed ? {
      id: opgave.enhed.id,
      interntNummer: opgave.enhed.interntNummer ?? null,
      registreringsnummer: opgave.enhed.registreringsnummer ?? null,
      stelSerieNummer: opgave.enhed.stelSerieNummer ?? null,
      navn: opgave.enhed.navn ?? null,
      kundereferencer: opgave.enhed.kundereferencer ?? [],
    } : null,
    lokation: opgave.lokation,
    koststeder: opgave.koststeder,
    forventetNettoOere: opgave.estimatNettoOere,
  };
}

function bygStreng(input) {
  const resultat = bygReferencedestinationV1(input);
  if (!resultat.ok) {
    const fejl = new TypeError(`Ugyldig FLEET-referencedestination (${resultat.fejl}).`);
    fejl.code = resultat.fejl;
    throw fejl;
  }
  return resultat.destination;
}

export function referencedestinationerFraFleetV1(opgaver = []) {
  return Object.freeze(opgaver.map((opgave) => bygStreng(projektion(opgave))));
}

/** Eksisterende syntetiske etape 1-fixtures; må ikke bruges som produktionsgrænse. */
export function destinationerFraFleet(opgaver = []) {
  return Object.freeze(opgaver
    .map((opgave) => bygDestination(projektion(opgave, { demoLegacy: true }))));
}

export const destinationerFraFleetDemoLegacy = destinationerFraFleet;
