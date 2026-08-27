/* src/fleet/booking.js
 * Klientsiden af "Ny transportforespørgsel". Transport — politikken ligger i
 * `booking-state.js`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ DER SKRIVES INTET HERFRA DIREKTE, OG DET ER IKKE EN MANGLENDE RETTIGHED.
 *
 * `bookinger` og `etaper` er begge `.write: false`, og permissionen
 * `booking.opret` består — koordinator og admin har den, og `bookingopret`
 * kræver den. Det er VEJEN der er lukket, ikke retten. Tre ting kan ikke
 * gøres rigtigt fra en klient:
 *
 *   1. Bookingen og dens ETAPER skal skrives sammen eller slet ikke. En
 *      booking uden etaper er en forespørgsel ingen kan planlægge; en etape
 *      uden sin booking hører ikke til noget.
 *   2. Nummeret kommer fra en COUNTER i en transaction (beslutning 8), og
 *      `countere` er `.write: false`. To koordinatorer der opretter i samme
 *      sekund, ville ellers få samme nummer.
 *   3. Bookingens tilstand er AFLEDT af etaperne (beslutning 40). Den regnes
 *      af serveren i samme opdatering — en tilstand fra klienten ville være
 *      den anden vej til ét felt.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ SVARET TOLKES MED `tolkPlanfejl()`, IKKE MED EN KOPI.
 * En afvist skrivning betyder det samme uanset hvilken node den gjaldt:
 * `permission-denied` er reglerne der VIRKER, `failed-precondition` er en
 * spærring med en grund, og kun `unavailable` er transport. En anden tolkning
 * her ville være to forklaringer på ét nej — og den ene af dem ville før eller
 * siden sige "prøv igen" om en afvisning der aldrig bliver til et ja.
 */
import { kaldFunktion } from "../firebase.js";
import { PLANSVAR, tolkPlanfejl } from "./opgaveplan-regler.js";

export { PLANSVAR, tolkPlanfejl } from "./opgaveplan-regler.js";
export { valideBooking } from "./booking-state.js";

/* Småt navn — en 2. generations funktion bliver en Cloud Run-tjeneste, og et
   tjenestenavn må kun være småt. Navnet SKAL matche functions/index.js. */
export const BOOKINGFUNKTION = "bookingopret";

/**
 * opretBooking(post) → { ok, art, besked, data }
 *
 * ⚠ KASTER ALDRIG. En afvist skrivning er et SVAR: "du må ikke", "kunden er
 * ikke aktiv" og "der er ingen forbindelse" er tre forskellige ting, og
 * kaster funktionen, bliver de til den samme røde boks.
 *
 * ⚠ INTET id OG INTET NUMMER. Serveren laver begge dele. Et id udefra kunne
 * overskrive en andens post, og et nummer udefra ville gøre counteren til
 * pynt — hele beslutning 8 er at nummeret kommer ét sted fra.
 *
 * ⚠ INGEN `tilstand`. Den regnes af etaperne på serveren (beslutning 40).
 */
export async function opretBooking(post) {
  try {
    const svar = await kaldFunktion(BOOKINGFUNKTION, {
      kundeId: post.kundeId,
      fraSted: post.fraSted,
      tilSted: post.tilSted,
      transporttype: post.transporttype,
      afhentningFleks: post.afhentningFleks,
      leveringFleks: post.leveringFleks,
      /* undefined frem for null: RTDB afviser undefined, men en callable
         dropper feltet — og et felt der ikke sendes, er noget andet end et
         felt der sendes tomt. Se planlaegOpgave(). */
      rutepraeference: post.rutepraeference || undefined,
      onsketAfhentningMs: Number.isFinite(post.onsketAfhentningMs)
        ? post.onsketAfhentningMs : undefined,
      onsketLeveringMs: Number.isFinite(post.onsketLeveringMs)
        ? post.onsketLeveringMs : undefined,
      omsaetningOere: Number.isFinite(post.omsaetningOere) ? post.omsaetningOere : undefined,
      kundekrav: post.kundekrav || undefined,
      kundeRef: post.kundeRef || undefined,
      krav: post.krav?.length ? post.krav : undefined,
    });
    return { ok: true, art: PLANSVAR.ok, besked: null, data: svar?.data ?? null };
  } catch (fejl) {
    /* ⚠ DEMO-MODE ER IKKE EN FEJL. Der er ingen server at spørge, og skærmen
       skal sige det frem for at vise en netværksfejl der ikke er sket. */
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return {
        ok: false, art: PLANSVAR.demo,
        besked: "Demo-tilstand: der er ingen server, så intet blev gemt.",
        data: null,
      };
    }
    return { ok: false, ...tolkPlanfejl(fejl), data: null };
  }
}
