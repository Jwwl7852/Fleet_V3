/* src/fleet/demo-opgaver.js
 * Demo-opgaver til Booking & Opgaver.
 *
 * En OPGAVE er værksteds- eller facilityarbejde (beslutning 21) — den er ikke
 * en etape og ikke en booking. `art` styrer feltskemaet; se opgaver.js.
 *
 * ⚠ TO VALGFRIE FELTER DER ER EN MODELUDVIDELSE, IKKE EN DETALJE.
 *
 * `kundeId` og `fakturerbar` kom fra mockuppen: den viser "ABC Transport A/S —
 * Reparation, Venstre baglygte" med kolonnen "Fakturerbar: Ja". ARKITEKTUR
 * beskriver derimod `opgaver/` som arbejde på EGEN flåde — ressourceFor() giver
 * koeretoej eller facilityAktiv, og der er ingen kunde.
 *
 * En kunde plus fakturerbarhed betyder at værkstedet også arbejder FOR ANDRE.
 * Det er en anden forretningsmodel end den modellen beskriver, og den er ikke
 * bekræftet. Felterne er derfor VALGFRIE, og spørgsmålet står i README frem
 * for kun at findes her. Er svaret at værkstedet kun servicerer egen flåde,
 * skal kolonnen væk igen — det er billigere at vide nu end efter første kunde.
 *
 * Tider i MINUTTER, beløb i ØRE (beslutning 2).
 * `faktiskMin` er null indtil arbejdet er registreret — det er netop det
 * "uden tidsregistrering" tæller.
 */
import { DEMO_KOERETOEJER } from "./demo-flaade.js";
import { DEMO_PERSONALE } from "./demo-personale.js";
import { DEMO_KUNDER } from "./demo-kunder.js";

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
    kundeId: "nordiskFragt", beskrivelse: "Reparation – venstre baglygte",
    personId: "larsAage", koeretoejId: "kt-012", status: "planlagt",
    estimeretMin: 90, faktiskMin: null, beloebOere: 125000, fakturerbar: true },

  { id: "op-002", art: "vaerksted", division: "gods", startMs: iDag(9, 30),
    kundeId: "skagenSeafood", beskrivelse: "Serviceeftersyn – 30.000 km",
    personId: "reneThomsen", koeretoejId: "kt-078", status: "igang",
    estimeretMin: 150, faktiskMin: 66, beloebOere: 210000, fakturerbar: true },

  { id: "op-003", art: "vaerksted", division: "gods", startMs: iDag(10, 0),
    kundeId: "jyskByggecenter", beskrivelse: "Dækudskiftning – 2 aks. trailer",
    personId: "peterIversen", koeretoejId: "kt-034", status: "igang",
    estimeretMin: 60, faktiskMin: 27, beloebOere: 90000, fakturerbar: true },

  { id: "op-004", art: "vaerksted", division: "gods", startMs: iDag(11, 0),
    kundeId: "fynKoel", beskrivelse: "Fejlsøgning – ABS-fejl",
    personId: "ibSoerensen", koeretoejId: "kt-077", status: "afventer",
    estimeretMin: 120, faktiskMin: null, beloebOere: 240000, fakturerbar: true },

  { id: "op-005", art: "vaerksted", division: "gods", startMs: iDag(13, 0),
    kundeId: "hamburgHandel", beskrivelse: "Reparation – lækage i hydraulik",
    personId: "peterIversen", koeretoejId: "kt-104", status: "planlagt",
    estimeretMin: 105, faktiskMin: null, beloebOere: 160000, fakturerbar: true },

  { id: "op-006", art: "vaerksted", division: "gods", startMs: iDag(14, 0),
    kundeId: "nordiskFragt", beskrivelse: "Service – klimaanlæg",
    personId: "reneThomsen", koeretoejId: "kt-106", status: "udfoert",
    estimeretMin: 90, faktiskMin: 84, beloebOere: 135000, fakturerbar: true },

  { id: "op-007", art: "vaerksted", division: "gods", startMs: iDag(15, 30),
    kundeId: "nordiskFragt", beskrivelse: "Synsklargøring – klargøring",
    personId: "larsAage", koeretoejId: "kt-012", status: "afventer",
    estimeretMin: 60, faktiskMin: null, beloebOere: 75000, fakturerbar: false },

  { id: "op-008", art: "vaerksted", division: "gods", startMs: iDag(8, 0) + D,
    kundeId: "skagenSeafood", beskrivelse: "Lovpligtigt eftersyn",
    personId: "janHolmgaard", koeretoejId: "kt-034", status: "planlagt",
    estimeretMin: 165, faktiskMin: null, beloebOere: 275000, fakturerbar: true },

  /* Facility-opgaver har ingen kunde og er ikke fakturerbare — arbejdet er på
     egne bygninger. Det er dem der viser hvorfor felterne er VALGFRIE og
     ikke en del af skemaet. `faelles` fordi porten bruges af begge divisioner. */
  { id: "op-009", art: "facility", division: "faelles", startMs: iDag(9, 0),
    beskrivelse: "Port 3 – lukker langsomt",
    personId: "kasperLykke", status: "afventer",
    estimeretMin: 120, faktiskMin: null, beloebOere: 48000 },

  { id: "op-010", art: "vaerksted", division: "bus", startMs: iDag(10, 30),
    kundeId: "jyskByggecenter", beskrivelse: "Fordør lukker ikke i",
    personId: "ibSoerensen", koeretoejId: "kt-077", status: "indberettet",
    estimeretMin: 75, faktiskMin: null, beloebOere: 54000, fakturerbar: true },
];

/* ---- Opslag, så skærmen ikke bygger sine egne ------------------------- */

export const opgaveKunde = (id) => DEMO_KUNDER.find((k) => k.id === id)?.navn || null;
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
    if (o.kundeId && !DEMO_KUNDER.some((k) => k.id === o.kundeId)) {
      console.warn(`demo-opgaver: ${o.id} peger på kundeId "${o.kundeId}", som ikke findes i demo-kunder.`);
    }
    /* En udført opgave UDEN faktisk tid kan ikke faktureres korrekt — det er
       netop det "uden tidsregistrering" tæller, og den må ikke opstå ved et
       uheld i demo-sættet. */
    if (o.status === "udfoert" && o.faktiskMin == null) {
      console.warn(`demo-opgaver: ${o.id} er udført uden faktiskMin. Så kan den ikke faktureres på tid.`);
    }
  }
}
