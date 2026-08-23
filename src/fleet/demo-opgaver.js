/* src/fleet/demo-opgaver.js
 * Demo-opgaver til Planning.
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
/* ⚠ AFTALEN PAA SAGEN ER OPGAVENS TIDSPUNKT. Beslutning 20: staar de to ikke
   med samme klokkeslaet, beskriver sagsvisningen og driftskalenderen hver sin
   virkelighed — og det er 84-mod-83 igen. Tidspunktet hentes derfor FRA sagen
   frem for at blive skrevet af. */
import { demoSag } from "./demo-sag.js";
import { selvkontrol } from "./selvkontrol.js";

const NU = Date.now();
const D = 86400000;
/* Klokkeslæt i dag, så "Dagens plan" har noget at vise uanset hvornår den
   åbnes. Minutter fra midnat frem for et fast tidsstempel. */
const iDag = (timer, min = 0) => {
  const d = new Date(NU);
  d.setHours(timer, min, 0, 0);
  return d.getTime();
};

/* Midnat n dage fra i dag, plus et klokkeslaet. Hjaelperen kommer fra
   demo-vaerksted.js sammen med de otte vaerkstedsbesoeg, og den regner i faste
   millisekunder — praecis som foer, saa tidspunkterne er uaendrede. */
const dag = (n, time = 0) => {
  const d = new Date(NU);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + n * D + time * 3600000;
};

/** Minutter mellem to tidspunkter. Et besoeg baerer et VINDUE; en opgave
 *  baerer en start og et estimat, og noden kender kun det sidste. */
const minutter = (fra, til) => Math.round((til - fra) / 60000);

export const DEMO_OPGAVER = [
  /* ⚠ DEN HER BÆRER KOBLINGEN TILBAGE — beslutning 109.

     Ingen demo-opgave pegede på den indberetning der udløste den, og det
     kunne ikke ses: `indberetningId` fandtes ikke som felt. Uden mindst ét
     par kan chaufførappens "hvornår har driften planlagt det" hverken
     tegnes eller prøves — og en skærm ingen har set med data, er ikke
     bygget færdig.

     `ind-001` er Lars' godsskade på kt-012, og den står i `afventerFaktura`:
     arbejdet ER gjort. Besøget hører derfor bagud, ikke i morgen.

     ⚠ OG DEN FÅR ET VÆRKSTED. `leverandoerId` stod tomt på hver eneste
     demo-opgave, så kortets "🔧 Mercedes Greve" ville have stået tomt
     uden at nogen kunne se om det var koblingen eller navneopslaget der
     manglede. */
  { id: "op-001", art: "vaerksted", startMs: iDag(-4, 8),
    sted: "Kolding", beskrivelse: "Reparation – venstre baglygte",
    personId: "larsAage", koeretoejId: "kt-012", arbejdstype: "reparation", status: "udfoert", prioritet: "normal",
    leverandoerId: "lv-mercedes", indberetningId: "ind-001",
    estimeretMin: 90, faktiskMin: 105, beloebOere: 125000 },

  /* ⚠ HED "Serviceeftersyn – 30.000 km", og det var Bil 104s service.
     30.000 km-eftersynet hoerer til Bil 104 (vb-005, aftalt paa sag
     FLT-2026-00381 med Mercedes Greve) — ikke til Bil 78, som staar paa
     268.400 km. Beskrivelsen laa to steder paa hver sin bil, og det var Bil
     104 med to nummerplader.
     Bil 78 navngives efter kilometerstand som vb-001 ("Serviceeftersyn
     250.000 km") gjorde det paa samme bil. Naeste er 270.000. */
  { id: "op-002", art: "vaerksted", startMs: iDag(9, 30),
    sted: "Kolding", beskrivelse: "Serviceeftersyn – 270.000 km",
    personId: "reneThomsen", koeretoejId: "kt-078", arbejdstype: "service", status: "igang", prioritet: "hoej",
    estimeretMin: 150, faktiskMin: 66, beloebOere: 210000 },

  { id: "op-003", art: "vaerksted", startMs: iDag(10, 0),
    sted: "Aarhus", beskrivelse: "Dækudskiftning – 2 aks. trailer",
    personId: "peterIversen", koeretoejId: "kt-034", arbejdstype: "daek", status: "igang", prioritet: "normal",
    estimeretMin: 60, faktiskMin: 27, beloebOere: 90000 },

  /* ⚠ STOD OGSÅ PÅ kt-077, den solgte trækker — den anden af to. En afgået
     enhed kan ikke have en åben opgave: posten bliver stående i flåden, men
     den står ikke på værkstedet.
     Valget af kt-v21 er MIT, ikke en oplysning fra data. Varevogn 21 er
     aktiv, står i Kolding som opgavens sted siger, og har ingen anden
     opgave; en ABS-fejl passer på en Crafter. Skal den på en anden bil, er
     det én linje. */
  { id: "op-004", art: "vaerksted", startMs: iDag(11, 0),
    sted: "Kolding", beskrivelse: "Fejlsøgning – ABS-fejl",
    personId: "ibSoerensen", koeretoejId: "kt-v21", arbejdstype: "reparation", status: "afventer", prioritet: "hoej",
    estimeretMin: 120, faktiskMin: null, beloebOere: 240000 },

  /* ⚠ STOD PAA kt-104 (Bil 104) OG KOLLIDEREDE MED vb-005.
     Bil 104 er hos Mercedes Greve 18-08 kl. 08–16 efter aftalen paa sag
     FLT-2026-00381 — og saa kan vores egen mekaniker ikke have den paa liften
     samtidig. Konflikten var USYNLIG saa laenge besoegene laa i deres eget
     datasaet; den kom frem i samme oejeblik de to blev til een node, og
     gitteret tegnede den med det samme.

     Den er flyttet til Bil 78, som er fri om eftermiddagen. Demo-data maa
     ikke INDEHOLDE en konflikt: gitteret tegner overlap med vilje som noget
     galt, og kan man ikke se forskel paa en fejl i dataene og en fejl i
     gitteret, er markeringen ubrugelig. Se selvkontrollen nederst. */
  { id: "op-005", art: "vaerksted", startMs: iDag(13, 0),
    sted: "Aalborg", beskrivelse: "Reparation – lækage i hydraulik",
    personId: "peterIversen", koeretoejId: "kt-078", arbejdstype: "reparation", status: "planlagt", prioritet: "lav",
    estimeretMin: 105, faktiskMin: null, beloebOere: 160000 },

  /* ⚠ SAMME SLAGS: stod paa kt-106, som ligger hos DAF Fredericia i fire
     doegn (vb-003, motorlampe/EGR). Flyttet til Bil 12 kl. 12.30, hvor der er
     hul mellem op-001 og op-007. */
  { id: "op-006", art: "vaerksted", startMs: iDag(12, 30),
    sted: "Kolding", beskrivelse: "Service – klimaanlæg",
    personId: "reneThomsen", koeretoejId: "kt-012", arbejdstype: "service", status: "udfoert", prioritet: "normal",
    estimeretMin: 90, faktiskMin: 84, beloebOere: 135000 },

  { id: "op-007", art: "vaerksted", startMs: iDag(15, 30),
    sted: "Kolding", beskrivelse: "Synsklargøring",
    personId: "larsAage", koeretoejId: "kt-012", arbejdstype: "syn", status: "afventer", prioritet: "lav",
    estimeretMin: 60, faktiskMin: null, beloebOere: 75000 },

  { id: "op-008", art: "vaerksted", startMs: iDag(8, 0) + D,
    sted: "Esbjerg", beskrivelse: "Lovpligtigt eftersyn",
    personId: "janHolmgaard", koeretoejId: "kt-034", arbejdstype: "syn", status: "planlagt", prioritet: "normal",
    estimeretMin: 165, faktiskMin: null, beloebOere: 275000 },

  /* Facility-opgaver har ingen ressource i flåden — arbejdet er på bygningen.
     `faelles` fordi porten bruges af begge divisioner. */
  { id: "op-009", art: "facility", startMs: iDag(9, 0),
    /* ⚠ AKTIVET, IKKE KUN STEDET. Uden aktivId kan opgaven ikke
       reservere noget: reservationFraOpgave() afviser den, og en port der
       er under reparation, ser ledig ud. `sted` er en fritekst til
       mennesker; `aktivId` er det reservationen haenger paa. */
    sted: "Kolding", aktivId: "fa-port3", beskrivelse: "Port 3 – lukker langsomt",
    personId: "kasperLykke", status: "afventer", prioritet: "hoej",
    estimeretMin: 120, faktiskMin: null, beloebOere: 48000 },

  /* ⚠ STOD PAA kt-077 — en SOLGT TRAEKKER. En fordoer paa en traekker findes
     ikke, og en solgt bil kan ikke have en aaben vaerkstedsopgave. Fejlen blev
     fundet af selvkontrollen i demo-dashboard.js, som sammenholder
     beskrivelser paa tvaers af datasaettene: Dashboard sagde Bus 12, det her
     saagde Bil 77. Selvkontrollen nedenfor fanger begge dele nu. */
  /* ⚠ INGEN PRIORITET, OG DET ER MED VILJE. Den staar som `indberettet` —
     altsaa lige kommet ind fra chaufføren og endnu ikke set af en vaerkfoerer.
     Prioriteten saettes i TRIAGEN, ikke af den der melder fejlen, og
     "ikke vurderet" er derfor et rigtigt svar med sit eget tal paa
     Driftskalenderen.

     ⚠ Og den findes for at tallet kan tage fejl. Havde HVER post en
     prioritet, ville "uvurderede" altid vaere 0 — og en taelling der kun kan
     give 0, kan ikke tage fejl paa en maade nogen opdager. Femte gang det
     moenster dukker op i det her datasaet. */
  { id: "op-010", art: "vaerksted", startMs: iDag(10, 30),
    sted: "Odense", beskrivelse: "Fordør lukker ikke i",
    personId: "ibSoerensen", koeretoejId: "kt-b12", arbejdstype: "reparation", status: "indberettet",
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
  { id: "op-011", art: "vaerksted", startMs: iDag(8, 0),
    sted: "Kolding", beskrivelse: "Lygteskift, venstre for",
    personId: "larsAage", koeretoejId: "kt-034", arbejdstype: "reparation", status: "udfoert", prioritet: "lav",
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
     og bus 2. ⚠ Divisionen er fjernet i beslutning 70 — spredningen der
     betyder noget nu, er ARTEN og STATUSSEN. */
  { id: "op-012", art: "facility", startMs: iDag(9, 0),
    sted: "Kolding", aktivId: "fa-vent1", beskrivelse: "Ventilation, kontor – halvårligt filterskift",
    personId: "kasperLykke", status: "planlagt", prioritet: "lav",
    estimeretMin: 90, faktiskMin: null, beloebOere: 36000 },
  { id: "op-013", art: "facility", startMs: iDag(13, 0),
    sted: "Aalborg", aktivId: "fa-lade1", beskrivelse: "Ladestandere – eftersyn før vinter",
    personId: "ibSoerensen", status: "planlagt", prioritet: "normal",
    estimeretMin: 150, faktiskMin: null, beloebOere: 62000 },

  /* ══════════════════════════════════════════════════════════════════════
     DE SEKS SERVICEBESØG — DE LÅ I demo-facility.js SOM DEMO_SERVICEBESOEG.

     ⚠ ANDET DATASÆT FOR DEN SAMME NODE, FOR TREDJE GANG. Først DEMO_BESOEG,
     så Bil 104's to nummerplader, og nu det her: `opgaver` blev seedet med
     DEMO_OPGAVER's fire facility-opgaver, mens Servicekalenderen tegnede seks
     HELT ANDRE poster fra demo-facility.js. `kpi.facility.planlagtVedligehold`
     blev regnet af de fire; skærmen viste de seks. To svar på ét spørgsmål —
     Indkøb → Fakturaer om igen.

     ⚠ OG FELTNAVNENE VAR DEN SAMME FEJL SOM DEMO_BESOEG BAR. Posterne havde
     `fra`, `til` og `estimatOere`; noden har `startMs`, `estimeretMin` og
     `beloebOere`, og den er lukket med `$andet: false` — de kunne aldrig være
     blevet gemt. Det er fjerde gang de tre navne koster noget.

     ⚠ SAGSNUMMERET STÅR IKKE PÅ POSTEN. `sagId` gemmes, nummeret slås op —
     samme greb som på værkstedsbesøgene. `sager/` findes ikke i
     firebase.rules.json endnu (beslutning 20 er fase 0), og et nummer skrevet
     af på opgaven ville drive fra sagen.

     ⚠ ID'ERNE ER BEVARET som fs-00N, af samme grund som vb-00N blev det.
     ══════════════════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════════════════
     ⚠ FEM AF DE HER POSTER BAR BÅDE `aktivId` OG `lokationId`.

     De to er hinandens ALTERNATIV, ikke to felter man udfylder sammen:
     `ressourceId()` foretrækker aktivet, så lokationen stod som en påstand
     ingen læser — og anlæggets lokation står allerede på anlægget. Målt:
     alle fem var ENIGE med aktivets eget `lokationId`, hvilket er præcis
     hvordan en dublet ser ud lige indtil nogen flytter porten til en anden
     hal. Det er samme regel som at en enhed ikke får en `pladsId`.

     `fs-004` har med vilje KUN en lokation: hele hallen spærres.
     ══════════════════════════════════════════════════════════════════════ */
  { id: "fs-001", art: "facility", startMs: dag(1, 8),
    aktivId: "fa-port3", leverandoerId: "lv-crawford",
    beskrivelse: "Udskiftning af portmotor", status: "planlagt", prioritet: "normal",
    /* Den ENE der har en sag: FAC-2026-00127 står på fa-port3 i demo-sag.js. */
    sagId: "sag-fac-127",
    estimeretMin: minutter(dag(1, 8), dag(1, 12)), faktiskMin: null, beloebOere: 1840000 },
  { id: "fs-002", art: "facility", startMs: dag(1, 7),
    aktivId: "fa-frost1", leverandoerId: "lv-koelecenter",
    beskrivelse: "Halvårligt serviceeftersyn på fryseanlæg", status: "planlagt", prioritet: "lav",
    estimeretMin: minutter(dag(1, 7), dag(1, 15)), faktiskMin: null, beloebOere: 960000 },
  /* ⚠ EN DER ER I GANG, og den er ikke pynt: `kanFlyttes()` afviser den, så
     gitteret kan vise at en blok under arbejde ikke kan trækkes. Uden en
     sådan post ville spærringen aldrig blive set i demo. */
  { id: "fs-003", art: "facility", startMs: dag(-1, 7),
    aktivId: "fa-vask", leverandoerId: "lv-wash",
    beskrivelse: "Vaskehal ude af drift – dysebom udskiftes", status: "igang", prioritet: "hoej",
    estimeretMin: minutter(dag(-1, 7), dag(2, 16)), faktiskMin: null, beloebOere: 3120000 },
  /* ⚠ INTET aktivId: hele hallen spærres, ikke ét anlæg. Ressourcen bliver
     `lokation` og ikke `facilityAktiv` — lukker man hallen, er alle porte i
     den også optaget. Se reservationFraOpgave(). */
  { id: "fs-004", art: "facility", startMs: dag(4, 6),
    lokationId: "lok-halb", leverandoerId: "lv-gulv",
    beskrivelse: "Epoxybehandling af gulv – hallen kan ikke bruges", status: "planlagt", prioritet: "normal",
    estimeretMin: minutter(dag(4, 6), dag(4, 18)), faktiskMin: null, beloebOere: 4450000 },
  { id: "fs-005", art: "facility", startMs: dag(2, 9),
    aktivId: "fa-lade2", leverandoerId: "lv-clever",
    beskrivelse: "Fejlsøgning E14 på ladestander", status: "planlagt", prioritet: "normal",
    estimeretMin: minutter(dag(2, 9), dag(2, 13)), faktiskMin: null, beloebOere: 620000 },
  { id: "fs-006", art: "facility", startMs: dag(5, 8),
    aktivId: "fa-port5", leverandoerId: "lv-crawford",
    beskrivelse: "Årligt eftersyn", status: "planlagt", prioritet: "lav",
    estimeretMin: minutter(dag(5, 8), dag(5, 11)), faktiskMin: null, beloebOere: 740000 },

  /* ══════════════════════════════════════════════════════════════════════
     DE OTTE VÆRKSTEDSBESØG — DE LÅ I demo-vaerksted.js SOM DEMO_BESOEG.

     ⚠ TO DATASÆT FOR ÉN NODE, OG FILEN INDRØMMEDE DET SELV. demo-vaerksted.js
     skrev i sit eget hoved at "et værkstedsbesøg ER en opgave med art
     'vaerksted' (beslutning 21)", og at posterne kun lå for sig "fordi
     Disponering ikke er bygget endnu". Imens blev opgaver-noden seedet af
     provisioneren, og Driftskalenderen tegnede den ANDEN halvdel — kasserne
     ville have talt noden mens gitteret tegnede demofilen. To svar på samme
     spørgsmål, ét klik fra hinanden.

     ⚠ ID'ERNE ER BEVARET. il-vb-00N i demo-indkoeb.js peger tilbage hertil
     med besoegId, og en flytning der omdøbte dem, ville have efterladt fire
     hængende referencer — præcis den fejl der én gang blev "rettet" ved at
     sætte feltet til null med en pæn begrundelse.

     ⚠ ET BESØG BAR fra og til; EN OPGAVE BAERER startMs OG estimeretMin. Noden er
     lukket med $andet: false, så fra/til ville være AFVIST — koden i
     reservationFraOpgave() tog imod begge former, men den ene kunne aldrig
     ligge i basen. Omregningen står ét sted, i minutter().

     DEMO_BESOEG findes stadig — som en AFLEDT visning af de her poster. Se
     demo-vaerksted.js.
     ══════════════════════════════════════════════════════════════════════ */

  /* --- Udført, ligger bag os -------------------------------------- */
  { id: "vb-001", art: "vaerksted", koeretoejId: "kt-078",
    arbejdstype: "service", leverandoerId: "lv-scania",
    beskrivelse: "Serviceeftersyn 250.000 km",
    status: "udfoert", prioritet: "normal",
    startMs: dag(-24, 7), estimeretMin: minutter(dag(-24, 7), dag(-24, 16)) },

  { id: "vb-002", art: "vaerksted", koeretoejId: "kt-b16",
    arbejdstype: "daek", leverandoerId: "lv-daekteam",
    beskrivelse: "Fire nye dæk på foraksel og bogie",
    status: "udfoert", prioritet: "lav",
    startMs: dag(-11, 8), estimeretMin: minutter(dag(-11, 8), dag(-11, 13)) },

  /* --- I gang lige nu. Skal stemme med status 'vaerksted' i demo-flaade --- */
  { id: "vb-003", art: "vaerksted", koeretoejId: "kt-106",
    arbejdstype: "reparation", leverandoerId: "lv-daf",
    beskrivelse: "Motorlampe — fejlsøgning på EGR-ventil",
    status: "igang", prioritet: "hoej",
    startMs: dag(-2, 7), estimeretMin: minutter(dag(-2, 7), dag(2, 16)) },

  /* Langt besøg der rækker ud over et to-ugers vindue. Det er her pilen skal
     vises: klippet ved kanten læses tre uger som et kort besøg, og så
     planlægger nogen en tur i en uge hvor traileren står på værksted. */
  { id: "vb-004", art: "vaerksted", koeretoejId: "kt-tr42",
    arbejdstype: "reparation", leverandoerId: "lv-schmitz",
    beskrivelse: "Køleaggregat starter ikke — kompressor i restordre",
    status: "igang", prioritet: "hoej",
    startMs: dag(-1, 8), estimeretMin: minutter(dag(-1, 8), dag(18, 15)) },

  /* --- Planlagt ---------------------------------------------------- */
  /* ⚠ DEN HER ER AFTALEN FRA BESLUTNING 20.
     Sag FLT-2026-00381 aftalte 18-08-2026 kl. 08.00–16.00 på Bil 104 med
     Mercedes Greve. Står den ikke i kalenderen med de tidspunkter, beskriver
     sagsvisningen og driftskalenderen hver sin virkelighed. Tidspunktet
     LÆSES af sagen nedenfor frem for at blive skrevet af. */
  { id: "vb-005", art: "vaerksted", koeretoejId: "kt-104",
    arbejdstype: "service", leverandoerId: "lv-mercedes",
    beskrivelse: "Serviceeftersyn 30.000 km",
    status: "planlagt", prioritet: "normal",
    sagId: "sag-flt-381",
    startMs: null, estimeretMin: null },   // sættes fra sagen — se nedenfor

  { id: "vb-006", art: "vaerksted", koeretoejId: "kt-034",
    arbejdstype: "service", leverandoerId: "lv-man",
    beskrivelse: "Serviceeftersyn 525.000 km",
    status: "planlagt", prioritet: "normal",
    startMs: dag(9, 7), estimeretMin: minutter(dag(9, 7), dag(9, 15)) },

  { id: "vb-007", art: "vaerksted", koeretoejId: "kt-tr41",
    arbejdstype: "syn", leverandoerId: "lv-applus",
    beskrivelse: "Periodisk syn af trailer",
    status: "planlagt", prioritet: "lav",
    startMs: dag(30, 9), estimeretMin: minutter(dag(30, 9), dag(30, 12)) },

  /* Scooteren står som `udeAfDrift` i flåden, ikke som `vaerksted` — den er
     taget ud af drift mens den venter på en reservedel, og den er ikke på
     værkstedet endnu. Besøget ligger derfor i FREMTIDEN. Gav vi den et besøg
     der dækkede i dag, ville Fleet og Driftskalenderen sige hver sit om samme
     scooter — og der er en prøve der fanger præcis det. */
  { id: "vb-008", art: "vaerksted", koeretoejId: "kt-s01",
    arbejdstype: "reparation", leverandoerId: "lv-scooter",
    beskrivelse: "Motorblok skiftes når reservedelen er kommet",
    status: "planlagt", prioritet: "lav",
    startMs: dag(10, 8), estimeretMin: minutter(dag(10, 8), dag(24, 16)) },
];

/* Aftalen fra sagen skrives ind ÉT sted, så tidspunkterne ikke kan drive.
   Flyttet med fra demo-vaerksted.js. */
{
  const sagen = demoSag("FLT-2026-00381");
  for (const o of DEMO_OPGAVER) {
    if (o.sagId === sagen?.id && sagen.aftale) {
      o.startMs = sagen.aftale.fra;
      o.estimeretMin = minutter(sagen.aftale.fra, sagen.aftale.til);
    }
  }
}

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
selvkontrol("demo-opgaver", () => {
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
    /* ⚠ ET ANLÆG ELLER ET STED — IKKE BEGGE. Fem af posterne bar begge, og
       de var alle enige med aktivets eget lokationId; sådan ser en dublet ud
       lige indtil nogen flytter anlægget. `ressourceId()` læser kun aktivet,
       så lokationen ville stå som en påstand ingen kan se er forkert.
       `facilityplanlaeg` afviser det nu — beslutning 51. */
    if (o.art === "facility" && o.aktivId && o.lokationId) {
      console.warn(
        `demo-opgaver: ${o.id} har både aktivId og lokationId. De er hinandens ` +
        `alternativ — anlæggets lokation står på anlægget.`
      );
    }
    /* Og den ene af de to SKAL stå der: uden en ressource kan besøget ikke
       reserveres, og så ser anlægget frit ud mens der bliver arbejdet på det. */
    if (o.art === "facility" && !o.aktivId && !o.lokationId) {
      console.warn(`demo-opgaver: ${o.id} har hverken aktivId eller lokationId.`);
    }
  }

  /* ⚠ TO OPGAVER PÅ SAMME ENHED SAMTIDIG ER EN KONFLIKT — OG DEN MÅ IKKE STÅ
     I DEMO-DATA.

     demo-vaerksted.js havde den her kontrol for BESØG mod BESØG. Den så ikke
     en intern opgave mod et eksternt besøg, fordi de to lå i hver sit datasæt
     — og da de blev lagt sammen til én node, kom to skjulte konflikter frem
     med det samme: op-005 på Bil 104 mens den stod hos Mercedes Greve, og
     op-006 på Lastbil 106 mens den stod hos DAF.

     At det ikke kunne ses, ER pointen med sammenlægningen. Kontrollen står nu
     hvor posterne står, og den dækker begge slags.

     Gitteret TEGNER et overlap som noget galt (rødt og stribet), fordi
     reservationsmodellen ville afvise den anden reservation. Ligger der
     konflikter i demoen, kan man ikke se forskel på en fejl i dataene og en
     fejl i gitteret — og så holder man op med at læse markeringen. */
  const slutter = (o) => (Number.isFinite(o.startMs) && Number.isFinite(o.estimeretMin)
    ? o.startMs + o.estimeretMin * 60000 : null);
  const paaEnhed = new Map();
  for (const o of DEMO_OPGAVER) {
    const id = o.koeretoejId ?? o.aktivId ?? o.lokationId;
    if (!id || slutter(o) === null) continue;
    if (!paaEnhed.has(id)) paaEnhed.set(id, []);
    paaEnhed.get(id).push(o);
  }
  for (const [id, mine] of paaEnhed) {
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) {
        const a = mine[i];
        const b = mine[j];
        /* Halvåbent [start, slut) — som reservationsmodellen. To opgaver der
           rører hinanden på minuttet, overlapper ikke. */
        if (a.startMs < slutter(b) && b.startMs < slutter(a)) {
          console.warn(
            `demo-opgaver: ${a.id} og ${b.id} overlapper på ${id}. To opgaver på ` +
            `samme enhed samtidig er en reservationskonflikt — gitteret tegner den ` +
            `som en fejl, og så kan man ikke se forskel på data og gitter.`
          );
        }
      }
    }
  }
});
