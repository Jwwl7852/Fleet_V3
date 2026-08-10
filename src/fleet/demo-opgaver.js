/* src/fleet/demo-opgaver.js
 * Demo-opgaver til Booking & Opgaver.
 *
 * En OPGAVE er værksteds- eller facilityarbejde (beslutning 21) — den er ikke
 * en etape og ikke en booking. `art` styrer feltskemaet; se opgaver.js.
 *
 * ⚠ INGEN KUNDE, OG INGEN FAKTURERBARHED. DET ER AFGJORT.
 *
 * Mockuppen viste `Kunde` og `Fakturerbar: Ja` på hver opgave. Det er nu
 * bekræftet at værkstedet KUN servicerer egen flåde, og så er begge felter
 * forkerte — ikke bare unødvendige. En kunde på en opgave ville betyde at
 * arbejdet kunne faktureres videre, og et beløb der ser ud som en indtægt
 * bliver læst som en indtægt.
 *
 * `beloebOere` er derfor en OMKOSTNING. Det er samme skel som beslutning 11:
 * driftsomkostning pr. km er ikke kalkulationspris pr. km, og to tal der
 * begge hedder "beløb" ender med at blive lagt sammen.
 *
 * Transportarbejde faktureres — men det er BOOKINGER, ikke opgaver, og de
 * ligger i demo-bookinger.js med deres egen omsætning.
 *
 * Tider i MINUTTER, beløb i ØRE (beslutning 2).
 * `faktiskMin` er null indtil arbejdet er registreret. Uden den er
 * omkostningen et estimat — det er dét "uden tidsregistrering" tæller.
 */
import { DEMO_KOERETOEJER } from "./demo-flaade.js";
import { DEMO_PERSONALE } from "./demo-personale.js";

const NU = Date.now();
const D = 86400000;
/* Klokkeslæt i dag, så "Dagens plan" har noget at vise uanset hvornår den
   åbnes. Minutter fra midnat frem for et fast tidsstempel. */
const iDag = (timer, min = 0) => {
  const d = new Date(NU);
  d.setHours(timer, min, 0, 0);
  return d.getTime();
};

export const DEMO_OPGAVER = [
  { id: "op-001", art: "vaerksted", division: "gods", startMs: iDag(8, 0),
    sted: "Kolding", beskrivelse: "Reparation – venstre baglygte",
    personId: "larsAage", koeretoejId: "kt-012", status: "planlagt",
    estimeretMin: 90, faktiskMin: null, beloebOere: 125000 },

  { id: "op-002", art: "vaerksted", division: "gods", startMs: iDag(9, 30),
    sted: "Kolding", beskrivelse: "Serviceeftersyn – 30.000 km",
    personId: "reneThomsen", koeretoejId: "kt-078", status: "igang",
    estimeretMin: 150, faktiskMin: 66, beloebOere: 210000 },

  { id: "op-003", art: "vaerksted", division: "gods", startMs: iDag(10, 0),
    sted: "Aarhus", beskrivelse: "Dækudskiftning – 2 aks. trailer",
    personId: "peterIversen", koeretoejId: "kt-034", status: "igang",
    estimeretMin: 60, faktiskMin: 27, beloebOere: 90000 },

  { id: "op-004", art: "vaerksted", division: "gods", startMs: iDag(11, 0),
    sted: "Kolding", beskrivelse: "Fejlsøgning – ABS-fejl",
    personId: "ibSoerensen", koeretoejId: "kt-077", status: "afventer",
    estimeretMin: 120, faktiskMin: null, beloebOere: 240000 },

  { id: "op-005", art: "vaerksted", division: "gods", startMs: iDag(13, 0),
    sted: "Aalborg", beskrivelse: "Reparation – lækage i hydraulik",
    personId: "peterIversen", koeretoejId: "kt-104", status: "planlagt",
    estimeretMin: 105, faktiskMin: null, beloebOere: 160000 },

  { id: "op-006", art: "vaerksted", division: "gods", startMs: iDag(14, 0),
    sted: "Kolding", beskrivelse: "Service – klimaanlæg",
    personId: "reneThomsen", koeretoejId: "kt-106", status: "udfoert",
    estimeretMin: 90, faktiskMin: 84, beloebOere: 135000 },

  { id: "op-007", art: "vaerksted", division: "gods", startMs: iDag(15, 30),
    sted: "Kolding", beskrivelse: "Synsklargøring",
    personId: "larsAage", koeretoejId: "kt-012", status: "afventer",
    estimeretMin: 60, faktiskMin: null, beloebOere: 75000 },

  { id: "op-008", art: "vaerksted", division: "gods", startMs: iDag(8, 0) + D,
    sted: "Esbjerg", beskrivelse: "Lovpligtigt eftersyn",
    personId: "janHolmgaard", koeretoejId: "kt-034", status: "planlagt",
    estimeretMin: 165, faktiskMin: null, beloebOere: 275000 },

  /* Facility-opgaver har ingen ressource i flåden — arbejdet er på bygningen.
     `faelles` fordi porten bruges af begge divisioner. */
  { id: "op-009", art: "facility", division: "faelles", startMs: iDag(9, 0),
    sted: "Kolding", beskrivelse: "Port 3 – lukker langsomt",
    personId: "kasperLykke", status: "afventer",
    estimeretMin: 120, faktiskMin: null, beloebOere: 48000 },

  { id: "op-010", art: "vaerksted", division: "bus", startMs: iDag(10, 30),
    sted: "Odense", beskrivelse: "Fordør lukker ikke i",
    personId: "ibSoerensen", koeretoejId: "kt-077", status: "indberettet",
    estimeretMin: 75, faktiskMin: null, beloebOere: 54000 },
];

/* ---- Opslag, så skærmen ikke bygger sine egne ------------------------- */

export const opgavePerson = (id) => DEMO_PERSONALE.find((p) => p.id === id)?.navn || id;
export const opgaveEnhed = (id) => {
  const k = DEMO_KOERETOEJER.find((x) => x.id === id);
  return k ? (k.kaldenavn || k.navn || id) : null;
};

/* ---- Selvkontrol ------------------------------------------------------ *
 * Uden den opdages en drift mellem demo-sættene først når nogen kigger. En
 * opdigtet "Bil 12" der ikke findes i flåden, er præcis den fejl
 * test/demo-kilder.test.mjs er skrevet for — se README om demo-datasæt.
 */
if (import.meta.env?.DEV) {
  for (const o of DEMO_OPGAVER) {
    if (o.koeretoejId && !DEMO_KOERETOEJER.some((k) => k.id === o.koeretoejId)) {
      console.warn(`demo-opgaver: ${o.id} peger på koeretoejId "${o.koeretoejId}", som ikke findes i demo-flaade.`);
    }
    if (o.personId && !DEMO_PERSONALE.some((p) => p.id === o.personId)) {
      console.warn(`demo-opgaver: ${o.id} peger på personId "${o.personId}", som ikke findes i demo-personale.`);
    }
    /* En udført opgave uden faktisk tid efterlader omkostningen som et
       estimat — det er netop det "uden tidsregistrering" tæller, og den må
       ikke opstå ved et uheld i demo-sættet. */
    if (o.status === "udfoert" && o.faktiskMin == null) {
      console.warn(`demo-opgaver: ${o.id} er udført uden faktiskMin. Så er omkostningen stadig et estimat.`);
    }
    /* Kunde og fakturerbarhed hører IKKE på en opgave — værkstedet servicerer
       kun egen flåde. Kommer felterne igen, er det en modelændring der skal
       være bevidst; se README. */
    if ("kundeId" in o || "fakturerbar" in o) {
      console.warn(`demo-opgaver: ${o.id} har kundeId/fakturerbar. Opgaver er egen flåde — se README.`);
    }
  }
}
