/*
 * Read-only PROCURE-adapter.
 * Adapteren kopierer kun de felter, den fælles matchkontrakt behøver.
 */
import {
  bygDestination,
  bygReferencedestinationV1,
  MODUL,
  REFERENCE_MODUL_V1,
  REFERENCE_PROVENIENS,
  REFERENCE_KONTRAKT_VERSION,
} from "../fakturacenter-intake.js";

function projektion(ordre, { demoLegacy = false } = {}) {
  return {
    kontraktVersion: REFERENCE_KONTRAKT_VERSION,
    proveniens: demoLegacy ? REFERENCE_PROVENIENS.demoLegacy : REFERENCE_PROVENIENS.autoritative,
    tenantId: ordre.tenantId,
    modul: demoLegacy ? MODUL.procure : REFERENCE_MODUL_V1.procure,
    destinationId: ordre.id,
    veyroReference: demoLegacy ? ordre.veyroReference ?? ordre.referencer?.[0]
      : ordre.veyroReference,
    bestillingsnummer: ordre.bestillingsnummer ?? null,
    destinationstype: ordre.destinationstype ?? "bestilling",
    navn: ordre.navn,
    operationelStatus: ordre.operationelStatus,
    fakturastatus: ordre.fakturastatus,
    oprettetMs: demoLegacy ? ordre.oprettetMs ?? ordre.datoMs : ordre.oprettetMs,
    aendretMs: demoLegacy ? ordre.aendretMs ?? ordre.datoMs : ordre.aendretMs,
    leverandoer: ordre.leverandoer ? {
      id: ordre.leverandoer.id,
      cvr: ordre.leverandoer.cvr ?? null,
      navn: ordre.leverandoer.navn ?? null,
      navnevarianter: ordre.leverandoer.navnevarianter ?? [],
    } : null,
    referencer: ordre.referencer,
    enhedsreferencer: ordre.enhed ? {
      id: ordre.enhed.id,
      interntNummer: ordre.enhed.interntNummer ?? null,
      registreringsnummer: ordre.enhed.registreringsnummer ?? null,
      stelSerieNummer: ordre.enhed.stelSerieNummer ?? null,
      navn: ordre.enhed.navn ?? null,
      kundereferencer: ordre.enhed.kundereferencer ?? [],
    } : null,
    lokation: ordre.lokation,
    koststeder: ordre.koststeder,
    forventetNettoOere: ordre.ordreNettoOere,
  };
}

function bygStreng(input) {
  const resultat = bygReferencedestinationV1(input);
  if (!resultat.ok) {
    const fejl = new TypeError(`Ugyldig PROCURE-referencedestination (${resultat.fejl}).`);
    fejl.code = resultat.fejl;
    throw fejl;
  }
  return resultat.destination;
}

export function referencedestinationerFraProcureV1(ordrer = []) {
  return Object.freeze(ordrer.map((ordre) => bygStreng(projektion(ordre))));
}

/** Eksisterende syntetiske etape 1-fixtures; må ikke bruges som produktionsgrænse. */
export function destinationerFraProcure(ordrer = []) {
  return Object.freeze(ordrer
    .map((ordre) => bygDestination(projektion(ordre, { demoLegacy: true }))));
}

export const destinationerFraProcureDemoLegacy = destinationerFraProcure;
