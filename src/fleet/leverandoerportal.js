/* src/fleet/leverandoerportal.js
 * Klientens indgang til leverandørportalens Cloud Functions.
 *
 * ⚠ SAMME MØNSTER SOM RESTEN AF APPEN — kaldFunktion() fra firebase.js,
 * ikke en bespoget fetch/httpsCallable inline i en skærm. Se
 * indberetningplan.js/booking.js/opgaveplan.js for samme figur.
 *
 * ⚠ INGEN LOGIK HER UDOVER KALDET SELV. Hvilke statusskift der er tilladt,
 * og hvordan en opgave sanitiseres til visning, står i
 * leverandoerportal-regler.js — den samme fil funktionen bruger server-
 * side. Denne fil er kun transporten.
 */
import { kaldFunktion } from "../firebase.js";

export async function hentPortalTenanter() {
  const svar = await kaldFunktion("leverandoerPortalTenanter", {});
  return svar.data.tenanter || [];
}

export async function hentPortalOpgaver(tenantId) {
  const svar = await kaldFunktion("leverandoerPortalOpgaver", { tenantId });
  return svar.data;
}

export async function indsendTilbud(tenantId, opgaveId, { beloebOere, valuta, kommentar, forventetFaerdigMs }) {
  const svar = await kaldFunktion("leverandoerTilbudIndsend", {
    tenantId, opgaveId, beloebOere, valuta,
    ...(kommentar ? { kommentar } : {}),
    ...(forventetFaerdigMs != null ? { forventetFaerdigMs } : {}),
  });
  return svar.data;
}

export async function opdaterPortalStatus(tenantId, opgaveId, status) {
  const svar = await kaldFunktion("leverandoerStatusOpdater", { tenantId, opgaveId, status });
  return svar.data;
}

/* ⚠ F.2 — DOKUMENTER/FOTOS. `hentPortalOpgaver()`s svar bærer allerede hver
 * opgaves delte dokumenter som METADATA (id/filnavn/mime/størrelse) — se
 * leverandoerSynligOpgave() i leverandoerportal-regler.js. Denne funktion
 * er det ENESTE sted et faktisk downloadlink hentes, ét dokument ad gangen,
 * aldrig for hele listen på forhånd. */
export async function hentPortalDokumentLink(tenantId, opgaveId, dokumentId) {
  const svar = await kaldFunktion("leverandoerDokumentDownloadLink", { tenantId, opgaveId, dokumentId });
  return svar.data;
}

/* ---- Adminsiden — Opsætning → Leverandører → Portaladgang -------------- */

export async function inviterPortalBruger(leverandoerId, email, navn) {
  const svar = await kaldFunktion("leverandoerPortalInviter", { leverandoerId, email, navn });
  return svar.data;
}

export async function deaktiverPortalAdgang(uid) {
  const svar = await kaldFunktion("leverandoerPortalAdgangDeaktiver", { uid });
  return svar.data;
}

export async function hentPortalBrugere(leverandoerId) {
  const svar = await kaldFunktion("leverandoerPortalBrugere", { leverandoerId });
  return svar.data.brugere || [];
}
