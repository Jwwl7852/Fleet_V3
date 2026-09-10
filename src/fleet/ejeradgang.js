/* src/fleet/ejeradgang.js
 * Fælles, ren politik for Veyros ejeridentiteter.
 *
 * Filen importerer ingen Firebase-kode og kopieres derfor mekanisk til
 * functions/delt/. Script, browserkontekst, tests og Cloud Functions bruger
 * samme definition af en ejer og samme sekundbaserede revocationregel.
 */

export const EJER_CLAIM_VERSION = 1;

/** Nye ejerkonti er tenantløse og bærer ingen kundepermissions. */
export function byggEjerClaims(eksisterende = {}) {
  if (!eksisterende || typeof eksisterende !== "object" || Array.isArray(eksisterende)) {
    throw new TypeError("Eksisterende claims skal være et objekt.");
  }
  if (eksisterende.tenant) {
    throw new Error(
      "Kontoen har allerede en kundetenant. Opret en separat, tenantløs ejeridentitet.",
    );
  }

  /* Bevar kun det andet eksplicit tilladte platformclaim. Ukendte claims og
     kundeautoritet flyttes ikke ind i en ny ejeridentitet ved et uheld. */
  const claims = {
    udbyder: true,
    ev: EJER_CLAIM_VERSION,
  };
  if (eksisterende.devTester === true) claims.devTester = true;
  return claims;
}

/** Legacy-ejere med kun `udbyder: true` accepteres under migrationen. */
export function erEjerClaims(claims = {}) {
  return claims?.udbyder === true
    && (claims.ev === undefined || claims.ev === EJER_CLAIM_VERSION);
}

/** Firebase `auth_time` og den gemte revokeTime er begge sekunder. */
export function erTokenEfterRevocation(authTime, revokeTime) {
  if (revokeTime === null || revokeTime === undefined) return true;
  const tokenSekunder = Number(authTime);
  const revokeSekunder = Number(revokeTime);
  return Number.isFinite(tokenSekunder)
    && Number.isFinite(revokeSekunder)
    && tokenSekunder > revokeSekunder;
}

