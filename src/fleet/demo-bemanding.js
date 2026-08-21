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
export const DEMO_BEMANDINGSPLAN = [
  { id: "chauffoer", navn: "Chauffør",
    gods: { iDag: [20, 18], oevrige: [[22, 22], [24, 24], [24, 24], [26, 26], [12, 12], [6, 6]] },
    bus:  { iDag: [0, 0],   oevrige: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } },

  { id: "buschauffoer", navn: "Buschauffør",
    gods: { iDag: [0, 0],   oevrige: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] },
    bus:  { iDag: [24, 21], oevrige: [[22, 22], [24, 24], [24, 24], [24, 24], [18, 18], [12, 12]] } },

  { id: "mekaniker", navn: "Mekaniker",
    gods: { iDag: [12, 10], oevrige: [[10, 10], [12, 12], [12, 12], [12, 12], [6, 6], [0, 0]] },
    bus:  { iDag: [2, 1],   oevrige: [[2, 2], [2, 2], [2, 2], [2, 2], [1, 1], [0, 0]] } },

  /* Lager og Terminal delte tidligere én række. De er to funktioner i
     kataloget og to grupper i personale/ — Mette Sørensen har begge,
     Nadia Krarup kun terminal — så de er også to rækker her. Tallene er
     FLYTTET fra Lager, ikke opfundet: 12/9 blev til 8/5 + 4/4. */
  { id: "lager", navn: "Lagermedarbejder",
    gods: { iDag: [8, 5],   oevrige: [[7, 7], [7, 7], [7, 6], [7, 7], [3, 3], [0, 0]] },
    bus:  { iDag: [0, 0],   oevrige: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } },

  { id: "terminal", navn: "Terminalmedarbejder",
    gods: { iDag: [4, 4],   oevrige: [[3, 3], [3, 3], [3, 3], [3, 3], [1, 1], [0, 0]] },
    bus:  { iDag: [0, 0],   oevrige: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } },

  { id: "disponent", navn: "Disponent",
    gods: { iDag: [6, 6],   oevrige: [[6, 6], [6, 6], [6, 6], [6, 6], [3, 3], [2, 2]] },
    bus:  { iDag: [0, 0],   oevrige: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } },

  { id: "administration", navn: "Administration",
    gods: { iDag: [8, 5],   oevrige: [[6, 6], [6, 6], [6, 6], [6, 5], [0, 0], [0, 0]] },
    bus:  { iDag: [0, 0],   oevrige: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } },
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
  for (const division of ["gods", "bus"]) {
    const forventet = DEMO_KPI[division]?.bemanding;
    if (!forventet) continue;

    let planlagt = 0, disponeret = 0, underbemandede = 0;
    for (const f of DEMO_BEMANDINGSPLAN) {
      const saet = f[division];
      planlagt += saet.iDag[0];
      disponeret += saet.iDag[1];
      /* underbemandede tælles over HELE ugen — også de øvrige dage. */
      for (const [p, d] of [saet.iDag, ...saet.oevrige]) if (p - d > 0) underbemandede++;
    }

    const afvig = [
      ["planlagt", planlagt, forventet.planlagt],
      ["disponeret", disponeret, forventet.disponeret],
      ["ledig", planlagt - disponeret, forventet.ledig],
      ["underbemandede", underbemandede, forventet.underbemandede],
    ].filter(([, faktisk, vil]) => faktisk !== vil);

    if (afvig.length) {
      console.warn(
        `Bemanding: ugeplanen summer ikke til kpi.${division}.bemanding — ` +
        afvig.map(([felt, f, v]) => `${felt} ${f} ≠ ${v}`).join(", ") +
        ". Skærmen viser nu et nøgletal der modsiger sin egen tabel."
      );
    }
  }
}

/* ⚠ ENLINJEFORMEN ER SAMME FÆLDE. Kontrollen kører på modulniveau, og kaster
   den, bliver hver skærm der importerer filen en hvid side. Se beslutning 74. */
selvkontrol("demo-bemanding", tjekPlanModKpi);
