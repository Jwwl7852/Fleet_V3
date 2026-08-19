/* src/fleet/opgaveplan.js
 * Klientsiden af "Planlæg aktivitet". Transport — politikken ligger i
 * `opgaveplan-regler.js` og i `opgaver.js`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ DER SKRIVES INTET HERFRA DIREKTE, OG DET ER IKKE EN MANGLENDE RETTIGHED.
 *
 * `opgaver` er `.write: false`, og permissionen `opgaver.skriv` består —
 * en disponent har den, og `opgaveplanlaeg` kræver den. Det er VEJEN der er
 * lukket, ikke retten. Handlingen kan ikke udføres rigtigt fra en klient:
 *
 *   1. Opgaven og dens RESERVATION skal skrives sammen eller slet ikke.
 *      `reservationer` er `.write: false` for alle, netop derfor. Landede kun
 *      den ene halvdel, ville enheden enten være spærret uden en opgave, eller
 *      have en opgave uden at være spærret — og det sidste ser FRIT ud i
 *      disponeringen, hvilket er værre end en spærring man kan se.
 *   2. To disponenter kan ramme samme sekund. Et klientsidetjek kan ikke
 *      forhindre det; det står skrevet i `reserver()` i reservations.js.
 *
 * ⚠ DERFOR ER DER HELLER INGEN gem() HER. `skriv.js` er vejen ind for det
 * klienten må skrive selv. Planlægningen går gennem serveren, og de to veje
 * skal ikke blandes sammen — samme snit som `udlaan.js` mod `skriv.js`.
 *
 * ⚠ OG I MÅNEDSVIS STOD DET KUN HER. Filen skrev i sit eget hoved at der
 * ikke skrives herfra — mens `opgaver` havde `.write` med `opgaver.skriv`,
 * som casehandler, disponent, koordinator og admin alle har. Disciplinen var
 * beskrevet, ikke håndhævet, og en kontrol der kun findes i frontend, er en
 * pæn knap. Beslutning 45 lukkede noden.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ INGEN MAIL. Mockuppens "Send bekræftelse til leverandøren?" er beslutning
 * 20, og den er FASE 0: `sager/` står ikke i `firebase.rules.json`, hverken
 * `sag.skriv` eller modtagevejen findes, og der er ingen afsendelse. En
 * deaktiveret radiogruppe der sagde "ikke bygget", ville være en attrap der
 * opfører sig som en kontrol — værre end ingen. Skærmen skriver i stedet hvad
 * der mangler.
 */
import { kaldFunktion } from "../firebase.js";
import { PLANSVAR, tolkPlanfejl } from "./opgaveplan-regler.js";

export {
  PLANSVAR, planBesked, tolkPlanfejl, valideOpgaveplan,
  PLANLAEGBAR_STATUS, MAKS_MINUTTER,
} from "./opgaveplan-regler.js";

/* Småt navn — en 2. generations funktion bliver en Cloud Run-tjeneste, og et
   tjenestenavn må kun være småt. Navnet SKAL matche functions/index.js. */
export const PLANFUNKTION = "opgaveplanlaeg";

/**
 * planlaegOpgave(post) → { ok, art, besked, data }
 *
 * ⚠ KASTER ALDRIG. En afvist skrivning er et SVAR, ikke et nedbrud, og
 * skærmen skal kunne vise forskellen mellem "du må ikke", "enheden er optaget"
 * og "der er ingen forbindelse". Kaster funktionen, bliver alle tre til den
 * samme røde boks.
 *
 * ⚠ `status` SENDES MED, MEN SERVEREN PRØVER DEN. Kun `planlagt` og
 * `afventer` kan oprettes — se PLANLAEGBAR_STATUS. Kunne klienten sætte
 * `udfoert`, kunne et værkstedsbesøg meldes færdigt uden at nogen havde haft
 * enheden på liften.
 *
 * ⚠ INTET id. Serveren laver push-nøglen. En klient der navngav sin egen
 * post, kunne overskrive en andens — og et id der kom udefra, ville skulle
 * prøves for form og for kollision, altså to kontroller mere for ingenting.
 */
export async function planlaegOpgave(post) {
  try {
    const svar = await kaldFunktion(PLANFUNKTION, {
      koeretoejId: post.koeretoejId,
      division: post.division,
      arbejdstype: post.arbejdstype,
      status: post.status,
      startMs: post.startMs,
      estimeretMin: post.estimeretMin,
      beskrivelse: post.beskrivelse,
      /* undefined frem for null: RTDB afviser undefined, men en callable
         dropper feltet — og et felt der ikke sendes, er noget andet end et
         felt der sendes tomt. `leverandoerId: null` ville forsøge at skrive
         null, og reglen ville afvise formen. */
      leverandoerId: post.leverandoerId || undefined,
      prioritet: post.prioritet || undefined,
      sted: post.sted || undefined,
      personId: post.personId || undefined,
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
