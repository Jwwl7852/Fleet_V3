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
import {
  PLANSVAR, tolkPlanfejl, valideOpgaveflyt, kanSkifteOpgave,
} from "./opgaveplan-regler.js";

export {
  PLANSVAR, planBesked, tolkPlanfejl, valideOpgaveplan, valideFacilityopgave,
  PLANLAEGBAR_STATUS, MAKS_MINUTTER,
  FLYTBAR_STATUS, FLYTBARE_TYPER, valideOpgaveflyt, flytEfter, erFlyttet,
  kanFlyttes,
  OPGAVE_OVERGANGE, RESERVATION_VED, kanSkifteOpgave, statusOpdatering, afkortTil,
} from "./opgaveplan-regler.js";

/* Småt navn — en 2. generations funktion bliver en Cloud Run-tjeneste, og et
   tjenestenavn må kun være småt. Navnet SKAL matche functions/index.js. */
export const PLANFUNKTION = "opgaveplanlaeg";
/* ⚠ SIT EGET NAVN, IKKE ET FLAG PÅ DEN FØRSTE. Arten er feltskemaet, og en
   funktion der tog den udefra, ville skulle bære begge — og så kunne
   Driftskalenderen oprette facilitys poster. Se opgaveplan-regler.js.
   ⚠ OG NAVNET SIGER MODULET, ikke handlingen: modulspærringen er den anden
   halvdel af forskellen. `opgaveplanlaeg` kræver Fleet, `facilityplanlaeg`
   kræver Facility — en kunde der kun har det ene, skal kunne bruge det. */
export const FACILITYFUNKTION = "facilityplanlaeg";
export const FLYTFUNKTION = "opgaveflyt";
export const STATUSFUNKTION = "opgavestatus";

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

/**
 * flytOpgave({ opgaveId, startMs, estimeretMin, ressourceType, ressourceId })
 *
 * Gitterets egen handling: en række og et vindue. Beslutning 49.
 *
 * ⚠ SAMME SVARFORM SOM planlaegOpgave(), OG SAMME GRUND TIL AT DEN IKKE
 * KASTER. En afvist flytning er et SVAR: "du må ikke", "bilen er optaget" og
 * "der er ingen forbindelse" er tre forskellige ting, og kaster funktionen,
 * bliver de til den samme røde boks.
 *
 * ⚠ DEN VALIDERER FØRST — MED SERVERENS EGEN FUNKTION.
 * Ikke for at afgøre noget: serveren spørger igen, og den har basen. Det er
 * for at svare med det samme når man slipper en blok et sted den ikke kan
 * ligge — en tur til skyen for at få at vide at en udført opgave ikke kan
 * flyttes, er et sekunds tavshed hvor gitteret ser i stykker ud.
 *
 * ⚠ OG DEN SENDER IKKE `art`. Serveren læser opgavens egen ud af noden. Kunne
 * klienten oplyse den, kunne en værkstedsopgave gøres til en facility-opgave
 * — to feltskemaer, én post.
 */
export async function flytOpgave({ opgaveId, foer, startMs, estimeretMin, ressourceType, ressourceId }) {
  const aendring = { startMs, estimeretMin, ressourceType, ressourceId };

  /* `foer` er posten skærmen allerede har i hånden. Har den den ikke, springes
     forhåndssvaret over — serveren afviser stadig. */
  if (foer) {
    const form = valideOpgaveflyt(foer, aendring);
    if (!form.ok) {
      return {
        ok: false, art: PLANSVAR.ugyldig,
        besked: Object.values(form.fejl)[0], data: null,
      };
    }
  }

  try {
    const svar = await kaldFunktion(FLYTFUNKTION, { opgaveId, ...aendring });
    return { ok: true, art: PLANSVAR.ok, besked: null, data: svar?.data ?? null };
  } catch (fejl) {
    /* ⚠ DEMO-MODE ER IKKE EN FEJL. Der er ingen server at spørge. */
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return {
        ok: false, art: PLANSVAR.demo,
        besked: "Demo-tilstand: der er ingen server, så intet blev flyttet.",
        data: null,
      };
    }
    return { ok: false, ...tolkPlanfejl(fejl), data: null };
  }
}

/**
 * skiftOpgaveStatus({ opgaveId, foer, status, faktiskMin })
 *
 * Opgavens eget statsmaskineri — beslutning 50. IKKE etapens: `opgaver.status`
 * (indberettet → planlagt → igang → udfoert) er et andet maskineri end etapens
 * `tilstand`, og de to må ikke blandes sammen. Se beslutning 16 og 21.
 *
 * ⚠ SAMME SVARFORM SOM DE TO ANDRE, og den kaster aldrig: "du må ikke",
 * "det skift findes ikke" og "der er ingen forbindelse" er tre forskellige
 * ting, og kaster funktionen, bliver de til den samme røde boks.
 *
 * ⚠ DEN SVARER FØRST SELV — med serverens egen maskine. Ikke for at afgøre
 * noget: serveren spørger igen. Det er for at kunne tegne knapperne rigtigt og
 * svare med det samme, frem for et sekunds tavshed efterfulgt af et nej.
 *
 * ⚠ `faktiskMin` ER VALGFRI. En værkfører der lukker ti opgaver, ved ikke
 * nødvendigvis hvor længe hver af dem tog, og et krævet felt ville blive
 * udfyldt med fiktion. `kpi.opgaver.udenTidsregistrering` TÆLLER dem der
 * mangler — hullet er synligt frem for spærret.
 */
export async function skiftOpgaveStatus({ opgaveId, foer, status, faktiskMin }) {
  if (foer) {
    const tjek = kanSkifteOpgave(foer, status);
    if (!tjek.ok) {
      return { ok: false, art: PLANSVAR.ugyldig, besked: tjek.aarsag, data: null };
    }
  }

  try {
    const svar = await kaldFunktion(STATUSFUNKTION, {
      opgaveId, status,
      /* undefined frem for null: en callable dropper feltet, og et felt der
         ikke sendes, er noget andet end et felt der sendes tomt. */
      faktiskMin: Number.isFinite(faktiskMin) ? faktiskMin : undefined,
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

/**
 * planlaegFacilityopgave(post) → { ok, art, besked, data }
 *
 * Servicekalenderens vej ind. Samme svarform som de tre andre, og den kaster
 * aldrig: "du må ikke", "anlægget er optaget" og "der er ingen forbindelse"
 * er tre forskellige ting.
 *
 * ⚠ DEN SENDER IKKE `art`. Serveren SÆTTER `facility`. Kom arten udefra,
 * kunne en kunde uden Fleet oprette en værkstedsopgave gennem Facilitys dør.
 *
 * ⚠ ENTEN `aktivId` ELLER `lokationId`. Begge felter på én post reserverer
 * anlægget og lader lokationen stå som en påstand ingen læser — og et besøg
 * uden anlæg spærrer HELE stedet, hvilket er forskellen på at lukke en port
 * og at lukke en hal.
 */
export async function planlaegFacilityopgave(post) {
  try {
    const svar = await kaldFunktion(FACILITYFUNKTION, {
      /* undefined frem for null — se planlaegOpgave(). Her er det ikke bare
         pænhed: netop DE TO felter er hinandens alternativ, og et `null` ville
         være et svar på et spørgsmål der ikke blev stillet. */
      aktivId: post.aktivId || undefined,
      lokationId: post.lokationId || undefined,
      division: post.division,
      status: post.status,
      startMs: post.startMs,
      estimeretMin: post.estimeretMin,
      beskrivelse: post.beskrivelse,
      leverandoerId: post.leverandoerId || undefined,
      prioritet: post.prioritet || undefined,
      sted: post.sted || undefined,
      personId: post.personId || undefined,
    });
    return { ok: true, art: PLANSVAR.ok, besked: null, data: svar?.data ?? null };
  } catch (fejl) {
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
