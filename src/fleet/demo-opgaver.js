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

  /* ⚠ HED "Serviceeftersyn – 30.000 km", og det var Bil 104s service.
     30.000 km-eftersynet hoerer til Bil 104 (vb-005, aftalt paa sag
     FLT-2026-00381 med Mercedes Greve) — ikke til Bil 78, som staar paa
     268.400 km. Beskrivelsen laa to steder paa hver sin bil, og det var Bil
     104 med to nummerplader.
     Bil 78 navngives efter kilometerstand som vb-001 ("Serviceeftersyn
     250.000 km") gjorde det paa samme bil. Naeste er 270.000. */
  { id: "op-002", art: "vaerksted", division: "gods", startMs: iDag(9, 30),
    sted: "Kolding", beskrivelse: "Serviceeftersyn – 270.000 km",
    personId: "reneThomsen", koeretoejId: "kt-078", status: "igang",
    estimeretMin: 150, faktiskMin: 66, beloebOere: 210000 },

  { id: "op-003", art: "vaerksted", division: "gods", startMs: iDag(10, 0),
    sted: "Aarhus", beskrivelse: "Dækudskiftning – 2 aks. trailer",
    personId: "peterIversen", koeretoejId: "kt-034", status: "igang",
    estimeretMin: 60, faktiskMin: 27, beloebOere: 90000 },

  /* ⚠ STOD OGSÅ PÅ kt-077, den solgte trækker — den anden af to. En afgået
     enhed kan ikke have en åben opgave: posten bliver stående i flåden, men
     den står ikke på værkstedet.
     Valget af kt-v21 er MIT, ikke en oplysning fra data. Varevogn 21 er
     aktiv, står i Kolding som opgavens sted siger, og har ingen anden
     opgave; en ABS-fejl passer på en Crafter. Skal den på en anden bil, er
     det én linje. */
  { id: "op-004", art: "vaerksted", division: "gods", startMs: iDag(11, 0),
    sted: "Kolding", beskrivelse: "Fejlsøgning – ABS-fejl",
    personId: "ibSoerensen", koeretoejId: "kt-v21", status: "afventer",
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

  /* ⚠ STOD PAA kt-077 — en SOLGT TRAEKKER. En fordoer paa en traekker findes
     ikke, og en solgt bil kan ikke have en aaben vaerkstedsopgave. Fejlen blev
     fundet af selvkontrollen i demo-dashboard.js, som sammenholder
     beskrivelser paa tvaers af datasaettene: Dashboard sagde Bus 12, det her
     saagde Bil 77. Selvkontrollen nedenfor fanger begge dele nu. */
  { id: "op-010", art: "vaerksted", division: "bus", startMs: iDag(10, 30),
    sted: "Odense", beskrivelse: "Fordør lukker ikke i",
    personId: "ibSoerensen", koeretoejId: "kt-b12", status: "indberettet",
    estimeretMin: 75, faktiskMin: null, beloebOere: 54000 },

  /* ⚠ UDFØRT UDEN TIDSREGISTRERING — og det er hele pointen med posten.
     `opgaver.udenTidsregistrering` er den række Booking-oversigten kalder
     "uden tidsregistrering: uden den er omkostningen stadig et estimat".
     Feltet blev regnet ud af `faktiskMin`, og hver eneste udførte opgave i
     sættet havde den — så tallet var 0, og en tælling der kun kan give 0,
     kan ikke tage fejl på en måde nogen opdager.

     ⚠ `beloebOere` STÅR STADIG. Det er ESTIMATET, og det er netop derfor
     rækken skal ses: der ligger et beløb der ser færdigt ud, men ingen har
     målt tiden bag det. Fjernede vi beløbet, ville posten ikke længere vise
     den fejl den findes for. */
  { id: "op-011", art: "vaerksted", division: "gods", startMs: iDag(8, 0),
    sted: "Kolding", beskrivelse: "Lygteskift, venstre for",
    personId: "larsAage", koeretoejId: "kt-034", status: "udfoert",
    estimeretMin: 30, faktiskMin: null, beloebOere: 42000 },

  /* --- To PLANLAGTE facility-opgaver ----------------------------------
     ⚠ SÆTTET HAVDE ÉN facility-opgave, OG DEN VAR "afventer".
     `facility.planlagtVedligehold` tæller `art: "facility"` med status
     `planlagt`, og tallet var derfor 0 i begge divisioner — sandt for de
     data, men en tælling der kun kan give 0, kan ikke tage fejl på en måde
     nogen opdager. Tredje gang det mønster dukker op i dette datasæt.

     ⚠ OPGAVEN BÆRER EN DIVISION; AKTIVET GØR IKKE. Reglerne forbyder
     `division` på `facility/aktiver` — en port er ikke gods eller bus. Men
     ARBEJDET er planlagt af en afdeling, og opgaven skal have en. Det er
     netop derfor `planlagtVedligehold` kan regnes pr. division, mens
     `facility.aktiver` ikke kan.

     Den ene er `faelles` (tæller i begge), den anden `bus` — så viser gods 1
     og bus 2, og divisionsfilteret kan ses virke på rigtige data. */
  { id: "op-012", art: "facility", division: "faelles", startMs: iDag(9, 0),
    sted: "Kolding", beskrivelse: "Ventilation, kontor – halvårligt filterskift",
    personId: "kasperLykke", status: "planlagt",
    estimeretMin: 90, faktiskMin: null, beloebOere: 36000 },
  { id: "op-013", art: "facility", division: "bus", startMs: iDag(13, 0),
    sted: "Aalborg", beskrivelse: "Ladestandere – eftersyn før vinter",
    personId: "ibSoerensen", status: "planlagt",
    estimeretMin: 150, faktiskMin: null, beloebOere: 62000 },
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
    /* ⚠ EN SOLGT ELLER SKROTTET BIL KAN IKKE HAVE EN AABEN OPGAVE. Den stod
       der: op-010 var en busdoer paa en solgt traekker. Posten bliver staaende
       i flaaden — regnskabsdata hardslettes ikke — men den kan ikke vaere paa
       vaerksted. Uden det her tjek ser opgaven helt normal ud i en tabel. */
    const bil = DEMO_KOERETOEJER.find((k) => k.id === o.koeretoejId);
    if (bil && (bil.status === "solgt" || bil.status === "skrottet")
        && o.status !== "udfoert" && o.status !== "annulleret") {
      console.warn(
        `demo-opgaver: ${o.id} er ${o.status} paa ${bil.kaldenavn}, som er ${bil.status}. ` +
        `En afgaaet enhed kan ikke have en aaben opgave.`
      );
    }
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
