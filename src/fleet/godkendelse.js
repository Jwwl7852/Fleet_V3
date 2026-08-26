/* src/fleet/godkendelse.js
 * Klientvejen til godkendelsen — beslutning 82, Procures trin 3.
 *
 * ⚠ TO VEJE IND, OG DE KRÆVER IKKE DET SAMME.
 *
 *   `skiftOrdre()`        → `ordrestatus`, kræver `indkoeb.godkend` (eller
 *                           `indkoeb.skriv` for de skridt der ikke er en
 *                           afgørelse).
 *   `gemGodkendelsesregler()` → `godkendelsesregelskriv`, kræver
 *                           `brugere.skriv`.
 *
 * Det er ikke en firkantethed. **Den der rammer loftet, må ikke kunne hæve
 * det.** Delte de to permission, kunne enhver der bestiller, sætte sin egen
 * beløbsgrænse til hundrede millioner — og hele planche 2 ville være pynt.
 * Samme skelnen som beslutning 24 lavede på auditudtrækket.
 *
 * ⚠ INGEN AF DEM KASTER. En afvisning er et SVAR, ikke en nedbrudt
 * forbindelse — og `permission-denied` betyder at reglerne VIRKER.
 */
import { kaldFunktion } from "../firebase.js";

/** Et kald oversat til et svar skærmen kan vise. Aldrig et kast. */
async function kald(navn, data, standardfejl) {
  try {
    const svar = await kaldFunktion(navn, data);
    return { ok: true, art: "ok", besked: null, data: svar?.data ?? svar ?? null };
  } catch (e) {
    const kode = String(e?.code || "");
    if (kode.includes("permission-denied")) {
      return { ok: false, art: "naegtet", besked: e?.message || "Du må ikke det her.", data: null };
    }
    /* ⚠ `failed-precondition` ER IKKE EN FEJL I FORMEN. "Ordren er allerede
       godkendt" er et svar om VERDEN, ikke om det brugeren skrev — og han
       skal kunne læse forskellen frem for at lede efter en tastefejl. */
    if (kode.includes("failed-precondition")) {
      return { ok: false, art: "afvist", besked: e?.message || "Det kan ikke lade sig gøre nu.", data: null };
    }
    if (kode.includes("invalid-argument") || kode.includes("not-found")) {
      return { ok: false, art: "afvist", besked: e?.message || standardfejl, data: null };
    }
    return { ok: false, art: "fejl", besked: "Der er ikke forbindelse til serveren.", data: null };
  }
}

/**
 * skiftOrdre({ ordreId, til, begrundelse }) → { ok, art, besked, data }
 *
 * ⚠ SKÆRMEN SENDER KUN HVOR HEN. Hvad der så sker — om "send til godkendelse"
 * ender på `afventerGodkendelse` eller på `godkendt`, fordi beløbet er under
 * grænsen — afgøres af serveren ud fra reglerne i NODEN. Kom grænsen med i
 * kaldet, kunne den der bestiller, sende sin egen.
 */
export async function skiftOrdre({ ordreId, til, begrundelse } = {}) {
  if (!ordreId) return { ok: false, art: "afvist", besked: "Vælg en bestilling.", data: null };
  if (!til) return { ok: false, art: "afvist", besked: "Vælg en handling.", data: null };
  return kald("ordrestatus", {
    ordreId,
    til,
    begrundelse: begrundelse || undefined,
  }, "Skiftet blev afvist.");
}

/**
 * sendOrdreMail({ ordreId, sendRequestId, sprog }) → { ok, art, besked, data }
 *
 * ⚠ SKIVE 4D. INGEN ADRESSE, INGEN ORDRELINJER SENDES HERFRA. Serveren
 * opløser modtageren fra ordrens EGEN leverandør og bygger mailteksten af
 * ordrens EGNE, server-hentede linjer — klienten sender kun hvilken ordre og
 * (valgfrit) hvilket af de tre sprog denne ene mail skal have. Samme
 * begrundelse som `skiftOrdre()`: kom ordrelinjerne med i kaldet, kunne den
 * der sender, love noget ordren ikke indeholder.
 *
 * ⚠ sendRequestId ER PÅKRÆVET — samme idempotensmønster som `sendMail()` i
 * sagplan.js. Genereres af kalderen og skal være DEN SAMME på tværs af et
 * dobbeltklik eller en netværks-retry.
 */
export async function sendOrdreMail({ ordreId, sendRequestId, sprog } = {}) {
  if (!ordreId) return { ok: false, art: "afvist", besked: "Vælg en bestilling.", data: null };
  if (!sendRequestId) return { ok: false, art: "afvist", besked: "Mangler et afsendelses-id.", data: null };
  return kald("ordreMailSend", {
    ordreId,
    sendRequestId,
    sprog: sprog || undefined,
  }, "Ordren blev ikke sendt.");
}

/**
 * gemGodkendelsesregler({ overBeloeb, fakturagodkendelse }) → { ok, … }
 *
 * ⚠ BELØBET SENDES I HELE ØRE. 5.000 kr er 500000 — en float fakturerer
 * forkert, og her ville den sætte et loft ingen kan genfinde.
 */
export async function gemGodkendelsesregler({ overBeloeb, fakturagodkendelse } = {}) {
  return kald("godkendelsesregelskriv", {
    overBeloeb: {
      aktiv: Boolean(overBeloeb?.aktiv),
      /* undefined frem for null: en callable DROPPER feltet, og et felt der
         ikke sendes, er noget andet end et felt der sendes tomt. */
      graenseOere: Number.isInteger(overBeloeb?.graenseOere) ? overBeloeb.graenseOere : undefined,
      godkenderUid: overBeloeb?.godkenderUid || undefined,
    },
    fakturagodkendelse: {
      aktiv: Boolean(fakturagodkendelse?.aktiv),
      godkenderUid: fakturagodkendelse?.godkenderUid || undefined,
    },
  }, "Reglerne blev afvist.");
}
