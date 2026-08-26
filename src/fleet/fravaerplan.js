/* src/fleet/fravaerplan.js
 * Klientsiden af "Afgør frihedsansøgning" — B2.
 *
 * ⚠ DER SKRIVES INTET HERFRA DIREKTE, og det er ikke en manglende
 * rettighed. `fravaer/$id` tillader godt at kontoret skriver direkte
 * (fravaer.skriv) — det er vejen ind for kontorets EGEN registrering
 * (endnu ikke bygget, se Fravaer.jsx). En AFGØRELSE er noget andet: den
 * rører to ting på én gang — ansøgningens status OG en reservation på
 * medarbejderen — og de skal lande sammen eller slet ikke. To i kontoret
 * kan desuden ramme samme ansøgning samme sekund; kun serveren har basen
 * til at afgøre det. Samme snit som opgaveplan.js mod opgaver.js.
 *
 * ⚠ HVORFOR TRANSPORTEN STÅR HER OG IKKE I fravaer.js. fravaer.js er DELT
 * med serveren (se scripts/kopier-delt.mjs) og importerer derfor bevidst
 * intet fra firebase.js — en import op gennem træet fejler ved deploy, ikke
 * ved test. `kaldFunktion()` hører derfor i en klient-only fil, som
 * opgaveplan.js gør det for opgaver.js.
 */
import { kaldFunktion } from "../firebase.js";
import { PLANSVAR, tolkPlanfejl } from "./opgaveplan-regler.js";

/* Småt navn — se opgaveplan.js's egen note. Navnet SKAL matche
   functions/index.js. */
export const AFGOERFUNKTION = "ansoegningAfgoer";

/**
 * afgoerAnsoegning({ fravaerId, status, svar }) → { ok, art, besked, data }
 *
 * `status` er målet — `"godkendt"` eller `"afvist"` — de to eneste lovlige
 * fra `"ansoegt"`. Samme svarform og samme grund til at den aldrig kaster
 * som de fire funktioner i opgaveplan.js: "du må ikke", "medarbejderen er
 * optaget i perioden" og "der er ingen forbindelse" er tre forskellige ting,
 * og en kastet fejl gør dem til den samme røde boks.
 *
 * ⚠ INGEN personId, INGEN fra/til. Serveren læser dem fra posten selv — se
 * ansoegningAfgoer's eget hoved i functions/index.js. Sendte klienten dem,
 * kunne en manipuleret klient godkende én ansøgning under en andens periode.
 */
export async function afgoerAnsoegning({ fravaerId, status, svar }) {
  try {
    const res = await kaldFunktion(AFGOERFUNKTION, {
      fravaerId,
      status,
      /* undefined frem for null: en callable dropper feltet, og et felt der
         ikke sendes, er noget andet end et felt der sendes tomt. */
      svar: svar?.trim() || undefined,
    });
    return { ok: true, art: PLANSVAR.ok, besked: null, data: res?.data ?? null };
  } catch (fejl) {
    /* ⚠ DEMO-MODE ER IKKE EN FEJL. Der er ingen server at spørge. */
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return {
        ok: false, art: PLANSVAR.demo,
        besked: "Demo-tilstand: der er ingen server, så intet blev afgjort.",
        data: null,
      };
    }
    return { ok: false, ...tolkPlanfejl(fejl), data: null };
  }
}
