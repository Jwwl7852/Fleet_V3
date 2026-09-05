/* src/fleet/indberetningplan.js
 * Klientsiden af Fleet indberetningstriage — Skive 3B.
 *
 * ⚠ SAMME SNIT SOM opgaveplan.js: DER SKRIVES INTET HERFRA DIREKTE.
 * `indberetninger/$id` ER faktisk skrivbar med `indberetninger.skrivAlle` —
 * modsat `opgaver`, som er `.write: false`. Men en fri skrivning kunne ramme
 * ethvert felt, og triage er ét lovligt forløbsskift ad gangen, prøvet mod
 * NØJAGTIG samme FORLOEB/kanSkifteTil()/kanAfslutte() som skærmen viser. Se
 * hovedet på `indberetningTriage` i functions/index.js.
 *
 * ⚠ "Planlæg aktivitet" (forløb → "planlagt") går IKKE gennem denne fil.
 * Den handling opretter en driftsopgave OG kobler indberetningen i ÉN
 * update() — det er `planlaegOpgave()` i opgaveplan.js, udvidet med
 * `indberetningId`. Se dens egen note.
 */
import { kaldFunktion } from "../firebase.js";
import { PLANSVAR, tolkPlanfejl } from "./opgaveplan-regler.js";

/* Småt navn — se noten i opgaveplan.js. Skal matche functions/index.js. */
export const TRIAGEFUNKTION = "indberetningTriage";

/**
 * trigeIndberetning({ id, handling, begrundelse, prioritet }) → { ok, art, besked, data }
 *
 * ⚠ KASTER ALDRIG — samme grund som planlaegOpgave(): "du må ikke", "det
 * skift er ikke lovligt lige nu" og "der er ingen forbindelse" er tre
 * forskellige ting, og en kastet fejl gør dem til den samme røde boks.
 *
 * `begrundelse` er kun relevant for handling: "afsluttet", og kun når der
 * ikke allerede er registreret en omkostning — se kanAfslutte() i
 * indberetninger.js. Sendes den uden grund, ignorerer serveren den.
 *
 * ⚠ `prioritet` ER PÅKRÆVET, MEN KUN NÅR handling ER "vurderet" — se noten i
 * functions/index.js. Prioritering ER vurderet-skiftet, ikke et ekstra klik.
 */
export async function trigeIndberetning({ id, handling, begrundelse, prioritet }) {
  try {
    const svar = await kaldFunktion(TRIAGEFUNKTION, {
      id, handling,
      /* undefined frem for null — se planlaegOpgave() for samme begrundelse:
         en callable dropper feltet, RTDB afviser undefined som værdi. */
      begrundelse: begrundelse?.trim() || undefined,
      prioritet: prioritet || undefined,
    });
    return { ok: true, art: PLANSVAR.ok, besked: null, data: svar?.data ?? null };
  } catch (fejl) {
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return {
        ok: false, art: PLANSVAR.demo,
        besked: "Demo-tilstand: der er ingen server, så intet blev ændret.",
        data: null,
      };
    }
    return { ok: false, ...tolkPlanfejl(fejl), data: null };
  }
}
