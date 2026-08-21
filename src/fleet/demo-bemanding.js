/* src/fleet/demo-bemanding.js
 * Ugeplanen — bemandingsplanen paa Bemanding-skaermen.
 *
 * ⚠ SJETTE GANG MOENSTRET DUKKER OP. Den laa som `const FUNKTIONER` inde i
 * moduler/Bemanding.jsx. Begrundelsen for at lade den blive var at den ikke
 * var delt med nogen anden skaerm — og det er praecis den begrundelse der har
 * holdt fem gange foer, indtil nogen fik brug for tallene og lavede sin egen
 * kopi. Proeven i test/demo-kilder.test.mjs kender nu et datasaet paa sin FORM
 * frem for paa sit navn, og den fanger den her.
 *
 * DER FINDES INGEN VAGTNODE i ARKITEKTUR endnu. Naar den skrives, bliver
 * ugeplanen et opslag og filen her forsvinder — men indtil da hoerer den i
 * fleet/ som ethvert andet demo-saet.
 *
 * ⚠ TALLENE ER IKKE FRIE. De skal summe til DEMO_KPI.<division>.bemanding.
 * Selvkontrollen nederst haandhaever det, og den flyttede med: en selvkontrol
 * der bliver tilbage i skaermen, kontrollerer data den ikke laengere ejer.
 */
import { DEMO_KPI } from "./demo-kpi.js";
import { selvkontrol } from "./selvkontrol.js";

/* [planlagt, disponeret] pr. dag. oevrige er de seks dage der ikke er i dag,
   i ugerækkefølge.

   GODS, i dag: 20+12+8+4+6+8 = 58 planlagt, 18+10+5+4+6+5 = 48 disponeret.
   Underbemandede celler: fire i dag plus to i ugen = 6, som KPI'en siger.
   BUS, i dag: 24+2 = 26 planlagt, 21+1 = 22 disponeret, to underbemandede.

   ⚠ TALLENE ER IKKE FRIE. De skal summe til DEMO_KPI.<division>.bemanding —
   ellers viser skærmen et nøgletal der modsiger sin egen tabel, og det er
   84-mod-83 om igen. Terminal blev udskilt af Lager og fik sine tal DERFRA,
   ikke lagt oveni; underkontrollen nederst i filen fanger det, hvis nogen
   glemmer det næste gang. */
/* ⚠ HER STOD TO GRENE PR. RÆKKE — `gods` og `bus` — og de var DISJUNKTE:
   chaufføren havde sine tal under gods og nul under bus, buschaufføren
   omvendt. Det var den samme kendsgerning delt på en akse der ikke fandtes.

   Grenene er LAGT SAMMEN i beslutning 75, og det er rigtigt fordi tallene er
   ANTAL MENNESKER: 20 gods-chauffører plus 0 bus-chauffører er 20, og 12
   mekanikere plus 2 er 14. En sum ville have været forkert på et FORHOLDSTAL
   — 3,8 % og 2,4 % giver ikke 6,2 % — og det er netop derfor flådens
   procenter IKKE blev lagt sammen i beslutning 70.

   ⚠ SEKS AF SYV RÆKKER VAR DISJUNKTE (nul i den ene gren), og mekanikeren var
   den ene der ikke var. Det blev målt felt for felt før sammenlægningen frem
   for antaget — havde flere overlappet, ville summen have været en påstand
   om en stab ingen havde talt. */
export const DEMO_BEMANDINGSPLAN = [
  { id: "chauffoer", navn: "Chauffør",
    iDag: [20, 18],
    oevrige: [[22, 22], [24, 24], [24, 24], [26, 26], [12, 12], [6, 6]] },
  { id: "buschauffoer", navn: "Buschauffør",
    iDag: [24, 21],
    oevrige: [[22, 22], [24, 24], [24, 24], [24, 24], [18, 18], [12, 12]] },
  { id: "mekaniker", navn: "Mekaniker",
    iDag: [14, 11],
    oevrige: [[12, 12], [14, 14], [14, 14], [14, 14], [7, 7], [0, 0]] },
  { id: "lager", navn: "Lagermedarbejder",
    iDag: [8, 5],
    oevrige: [[7, 7], [7, 7], [7, 6], [7, 7], [3, 3], [0, 0]] },
  { id: "terminal", navn: "Terminalmedarbejder",
    iDag: [4, 4],
    oevrige: [[3, 3], [3, 3], [3, 3], [3, 3], [1, 1], [0, 0]] },
  { id: "disponent", navn: "Disponent",
    iDag: [6, 6],
    oevrige: [[6, 6], [6, 6], [6, 6], [6, 6], [3, 3], [2, 2]] },
  { id: "administration", navn: "Administration",
    iDag: [8, 5],
    oevrige: [[6, 6], [6, 6], [6, 6], [6, 5], [0, 0], [0, 0]] },
];
/**
 * Selvkontrol i dev — som demo-personale.js gør mod kompetencetallet.
 *
 * Kommentaren ovenfor sagde hvad summen SKULLE være. En kommentar opdager
 * ikke at nogen har flyttet et tal; den her gør. Den kørte første gang da
 * Terminal blev udskilt af Lager, og det var netop dér man kunne komme til
 * at lægge fire vagter oveni i stedet for at flytte dem.
 */
function tjekPlanModKpi() {
  /* ⚠ HER LØB EN LØKKE OVER ["gods", "bus"] MED `DEMO_KPI[division]`.
     Sættet er fladt (beslutning 70), så opslaget gav `undefined` — og
     `if (!forventet) continue` sprang derfor kontrollen over. **Den var
     tavst død**: den kunne ikke fejle, men den kunne heller ikke sige noget.
     Se beslutning 75. */
  {
    const forventet = DEMO_KPI?.bemanding;
    if (!forventet) return;

    let planlagt = 0, disponeret = 0, underbemandede = 0;
    for (const f of DEMO_BEMANDINGSPLAN) {
      const saet = f;
      planlagt += saet.iDag[0];
      disponeret += saet.iDag[1];
      /* underbemandede tælles over HELE ugen — også de øvrige dage. */
      for (const [p, d] of [saet.iDag, ...saet.oevrige]) if (p - d > 0) underbemandede++;
    }

    const afvig = [
      ["planlagt", planlagt, forventet.planlagt],
      ["disponeret", disponeret, forventet.disponeret],
      /* ⚠ `ledig` ER FJERNET FRA kpi/ (beslutning 71) — den er AFLEDT og
         regnes hos forbrugeren. En sammenligning mod et felt der ikke
         findes, gav "14 ≠ undefined" ved hver indlæsning. */
      ["underbemandede", underbemandede, forventet.underbemandede],
    ].filter(([, faktisk, vil]) => faktisk !== vil);

    if (afvig.length) {
      console.warn(
        "Bemanding: ugeplanen summer ikke til kpi.bemanding — " +
        afvig.map(([felt, f, v]) => `${felt} ${f} ≠ ${v}`).join(", ") +
        ". Skærmen viser nu et nøgletal der modsiger sin egen tabel."
      );
    }
  }
}

/* ⚠ ENLINJEFORMEN ER SAMME FÆLDE. Kontrollen kører på modulniveau, og kaster
   den, bliver hver skærm der importerer filen en hvid side. Se beslutning 74. */
selvkontrol("demo-bemanding", tjekPlanModKpi);
