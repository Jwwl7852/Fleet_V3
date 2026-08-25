/* src/fleet/sagplan.js
 * Klientsiden af Fleet/Facility-sager — Skive 3C.
 *
 * ⚠ SAMME SNIT SOM opgaveplan.js OG indberetningplan.js. `sager` er
 * `.write: false` for ENHVER klient — der er ingen direkte skrivevej at gå
 * uden om, kun de fem Cloud Functions herunder. Denne fil ER den vej.
 *
 * ⚠ INGEN AF DE FEM SENDER EN MAIL. sagBeskedSkriv REGISTRERER en besked —
 * retning er altid "udgaaende", fordi der ikke findes en modtagevej endnu.
 * 3D indfører den rigtige udgående transport; indtil da er dette en intern
 * log over hvad der blev sagt til modparten UDENFOR FleetControl, ikke en
 * afsendelse FRA FleetControl. Se Sagsvisning.jsx for hvordan det siges i UI'et.
 */
import { kaldFunktion } from "../firebase.js";
import { PLANSVAR, tolkPlanfejl } from "./opgaveplan-regler.js";

/* Småt navn — se noten i opgaveplan.js. Skal matche functions/index.js. */
export const SAGOPRET = "sagOpret";
export const SAGBESKEDSKRIV = "sagBeskedSkriv";
export const SAGKARANTAENEFRIGIV = "sagKarantaeneFrigiv";
export const SAGAFTALEBEKRAEFT = "sagAftaleBekraeft";
export const SAGAFSLUT = "sagAfslut";

const kald = async (funktion, data, demoBesked) => {
  try {
    const svar = await kaldFunktion(funktion, data);
    return { ok: true, art: PLANSVAR.ok, besked: null, data: svar?.data ?? null };
  } catch (fejl) {
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return { ok: false, art: PLANSVAR.demo, besked: demoBesked, data: null };
    }
    return { ok: false, ...tolkPlanfejl(fejl), data: null };
  }
};

/**
 * opretSag({ art, emne, objektType, objektId, modpartNavn, modpartEmail })
 *   → { ok, art, besked, data: { sagId, nummer } | null }
 *
 * ⚠ ARTEN OG MODULET SÆTTES AF SERVEREN. Klienten sender kun hvilken art den
 * BEDER om — "fleet" eller "facility" — serveren afviser resten selv.
 */
export const opretSag = (post) => kald(SAGOPRET, {
  art: post.art,
  emne: post.emne,
  objektType: post.objektType || undefined,
  objektId: post.objektId || undefined,
  modpartNavn: post.modpartNavn || undefined,
  modpartEmail: post.modpartEmail || undefined,
}, "Demo-tilstand: der er ingen server, så sagen blev ikke oprettet.");

/**
 * tilfoejBesked({ sagId, tekst, tilstand })
 *   → { ok, art, besked, data: { beskedId } | null }
 *
 * ⚠ `tilstand` ER VALGFRI. Sendes den ikke, sætter serveren "afventerSvar" —
 * det er den eksisterende, uændrede semantik: en besked ud er som regel et
 * spørgsmål, og sagen venter nu på svar UDENFOR systemet.
 */
export const tilfoejBesked = (post) => kald(SAGBESKEDSKRIV, {
  sagId: post.sagId,
  tekst: post.tekst,
  tilstand: post.tilstand || undefined,
}, "Demo-tilstand: der er ingen server, så beskeden blev ikke registreret.");

export const frigivFraKarantaene = (post) => kald(SAGKARANTAENEFRIGIV, {
  sagId: post.sagId,
  adresse: post.adresse,
}, "Demo-tilstand: der er ingen server, så adressen blev ikke frigivet.");

export const bekraeftAftale = (post) => kald(SAGAFTALEBEKRAEFT, {
  sagId: post.sagId,
  aftaleId: post.aftaleId,
}, "Demo-tilstand: der er ingen server, så aftalen blev ikke bekræftet.");

export const afslutSag = (post) => kald(SAGAFSLUT, {
  sagId: post.sagId,
  afslutningsAarsag: post.afslutningsAarsag,
}, "Demo-tilstand: der er ingen server, så sagen blev ikke afsluttet.");
