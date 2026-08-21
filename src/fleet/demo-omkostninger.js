/* src/fleet/demo-omkostninger.js
 * Demo-data til `omkostninger` — hvad turen KOSTER os.
 *
 * ⚠ SÆTTET STOD SOM EN `const` I Bookingopsaetning.jsx indtil PRISER.md
 * etape 5. Skærmen viste altså et satsark ingen kunne rette, og filens egen
 * kommentar advarede om at bilernes navne og registreringsnumre skulle holdes
 * ens med `demo-flaade.js` i hånden.
 *
 * ⚠ NU STÅR NAVNENE KUN ÉT STED. En bilomkostning nøgles med køretøjets id,
 * og navnet slås op i `koeretoejer`. `omkostningsark()` udelader en sats hvis
 * bilen ikke findes — en km-sats for en bil ingen kan finde, ville ellers
 * blive brugt i det næste estimat.
 *
 * ⚠ PASSAGERNES ID'ER ER UÆNDREDE. Etapernes `passager`-kort peger på dem
 * (`{ "faerge:femern": 1 }`), og et nyt navn her ville gøre hver eneste etape
 * til en tur uden færge, uden at nogen havde rørt etapen.
 *
 * ⚠ SATSERNE ER DE SAMME TAL SOM FØR. Flytningen må kunne efterprøves: giver
 * eksempelberegningen et andet resultat efter etape 5, er det flytningen der
 * er gået galt — ikke prismotoren.
 *
 * ⚠ DET ER IKKE NOGEN VIRKELIG VOGNMANDS TAL. Storebælts erhvervstakst for
 * lastbiler 10–20 m er ~887 kr med grøn rabat (2026) og skal verificeres mod
 * den enkeltes egen aftale — rabatten er progressiv på månedsbasis.
 */
import { DEMO_KOERETOEJER } from "./demo-flaade.js";
import { baandOverlap, baandLabel } from "./pricing.js";

const START = Date.UTC(2026, 0, 1);
const sats = (beloebOere, metode) => ({
  s1: { gyldigFra: START, beloebOere, metode, valuta: "DKK", aktiv: true },
});

export const DEMO_OMKOSTNINGER = [
  /* ---- Bilernes km-omkostning. Nøglen bærer køretøjets id. -------------- */
  { id: "bil-kt-012", art: "bil", satser: sats(840, "prKm") },
  { id: "bil-kt-104", art: "bil", satser: sats(860, "prKm") },
  { id: "bil-kt-078", art: "bil", satser: sats(830, "prKm") },
  { id: "bil-kt-034", art: "bil", satser: sats(850, "prKm") },
  { id: "bil-kt-106", art: "bil", satser: sats(820, "prKm") },
  { id: "bil-kt-155", art: "bil", satser: sats(830, "prKm") },
  { id: "bil-kt-b12", art: "bil", satser: sats(690, "prKm") },
  { id: "bil-kt-b16", art: "bil", satser: sats(715, "prKm") },

  /* ---- Passager. Fælles: Storebælt koster det samme uanset afdeling. ---- */
  {
    /* ⚠ TO BÅND, IKKE ÉN FAST TAKST. Trin 3 af beslutning 18: en færge tager
       betaling efter kajmeter. Her stod 2.150 kr for alle længder, og det tal
       var forkert i begge retninger — for højt for en solovogn og for lavt
       for et vogntog.

       ⚠ OG DER ER INTET BÅND OVER 18 M. Det er ikke en forglemmelse: vi
       kender ikke taksten, og det nærmeste bånd er ikke svaret. `et-001` er
       19.820 mm og får derfor "ingen takst for den længde" — en synlig
       mangel man kan handle på, i stedet for en pris der er 1.192 kr for lav.
       `et-007` har ingen bil endnu og får "længden er ikke oplyst".
       Se satsOpslag() i pricing.js. */
    id: "faerge:femern", art: "passage", kategori: "faerge", navn: "Færge: Femern (Rødby–Puttgarden)",
    satser: {
      s1: {
        gyldigFra: START, beloebOere: 133800, metode: "prPassage",
        valuta: "DKK", aktiv: true, laengdeTilMm: 10000,
      },
      s2: {
        gyldigFra: START, beloebOere: 253000, metode: "prPassage",
        valuta: "DKK", aktiv: true, laengdeFraMm: 10000, laengdeTilMm: 18000,
      },
    },
  },
  {
    id: "faerge:oevrige", art: "passage", kategori: "faerge", navn: "Færger (øvrige)", satser: sats(215000, "fastPrBooking"),
  },
  {
    /* ⚠ LÆNGDEN STÅR I NAVNET OG IKKE I ET BÅND, og det er en KENDT mangel,
       ikke en modsigelse. Taksten her ER 10–20 m-taksten; vi kender bare ikke
       Storebælts øvrige trin, og et bånd vi fandt på, ville koste penge på
       hver eneste tur. Navnet bliver stående netop for at sige hvad satsen
       forudsætter — se README under trin 3 af beslutning 18.

       Båndene lægges når vognmandens egen BroBizz-aftale er læst; rabatten
       er progressiv på månedsbasis, så tallene er hans og ikke vores. */
    id: "bro:storebaelt", art: "passage", kategori: "bro", navn: "Bro: Storebælt (lastbil 10–20 m)", satser: sats(88700, "prPassage"),
  },
  {
    id: "bro:oeresund", art: "passage", kategori: "bro", navn: "Bro: Øresund", satser: sats(91000, "prPassage"),
  },
  {
    /* ⚠ EUROTUNNEL ER CALAIS–FOLKESTONE. I mockuppen lå den på ruten
       København–Hamburg. Én vej, så den tælles ikke dobbelt ved retur. */
    id: "tunnel:eurotunnel", art: "passage", kategori: "tunnel", navn: "Eurotunnel (Calais–Folkestone)", satser: sats(235000, "prPassageEnVej"),
  },
  {
    id: "parkering:europa", art: "passage", kategori: "parkering", navn: "Parkering Europa (gennemsnit)", satser: sats(45000, "prDoegn"),
  },
  {
    /* ⚠ `altidPaaBooking` — vejafgiften kommer med uden at nogen vælger den.
       Antallet af færger kommer fra RUTEN; vejafgiften gør ikke. */
    id: "vejafgift:miljoezoner", art: "passage", kategori: "vejafgift",
    altidPaaBooking: true,
    navn: "Vejafgifter / miljøzoner", satser: sats(32500, "fastPrBooking"),
  },

  /* ---- Agenter. En agent hører til ÉN afdeling. ------------------------- */
  {
    id: "hthHamburg", art: "agent", by: "Hamburg", navn: "HTH Logistics GmbH", note: "Indendørs parkering",
    satser: sats(125000, "prDoegn"),
  },
  {
    id: "transportsParis", art: "agent", by: "Paris", navn: "Transports Parisien SARL", note: "Sikret område",
    satser: sats(105000, "prDoegn"),
  },
  {
    id: "euroTransAms", art: "agent", by: "Amsterdam", navn: "EuroTrans BV", note: "Parkeringsplads med overvågning",
    satser: sats(95000, "prDoegn"),
  },
  {
    id: "bavariaMuenchen", art: "agent", by: "München", navn: "Bavaria Logistics GmbH", note: "Overdækket parkering",
    satser: sats(115000, "prDoegn"),
  },
  {
    id: "milanoCargo", art: "agent", by: "Milano", navn: "Milano Cargo SRL", note: "Indhegnet areal",
    satser: sats(110000, "prDoegn"),
  },
  {
    id: "bruxTrans", art: "agent", by: "Bruxelles", navn: "BruxTrans SA", note: "Åbent område",
    satser: sats(90000, "prDoegn"),
  },
  {
    id: "berlinBusPark", art: "agent", by: "Berlin", navn: "Berlin Bus Park GmbH", note: "Buspladser med chaufførfaciliteter",
    satser: sats(85000, "prDoegn"),
  },
];

/* ---- Lagrene ------------------------------------------------------------
 *
 * ⚠ EGEN NODE, IKKE EN FJERDE `art`. `omkostninger` har et LUKKET enum
 * (bil | passage | agent) i firebase.rules.json, og et lager bærer desuden
 * `kapacitet`, som ikke er en sats. `lagre` har eksisteret som node hele
 * tiden — den var bare tom.
 *
 * ⚠ OG DET VAR IKKE HARMLØST AT DEN VAR TOM. `omkostningsark()` byggede slet
 * ikke `lagre`, og `beregnForloeb()` slår op i `satsark.lagre[lagerId]`.
 * Hvert lagerophold ramte undefined og blev sprunget over i TAVSHED: fem døgn
 * gav 0 øre og `estimeret: false`. Se test/pricing-forloeb.test.mjs.
 *
 * ⚠ TO SATSARTER PR. LAGER, OG DE MÅLER IKKE DET SAMME.
 * `haandteringSatser` er ind/ud — ét greb, uanset hvor længe godset står.
 * `satser` er døgnene. Slog man dem sammen, ville et ophold på én dag koste
 * det samme som et på tredive, eller omvendt.
 *
 * ⚠ friDage LIGGER PÅ SATSEN, ikke i beregningen. Ændrer lageret sin
 * friperiode, er det en NY sats med `gyldigFra` — beslutning 7. En konstant
 * i koden ville ændre prisen på ophold der allerede er afregnet.
 */
export const DEMO_LAGRE = [
  { id: "lag-kolding", navn: "Kolding", kapacitet: 420,
    satser: sats(4500, "prLagerdoegn"),
    haandteringSatser: sats(25000, "fastPrBooking") },
  { id: "lag-aalborg", navn: "Aalborg", kapacitet: 180,
    satser: sats(5200, "prLagerdoegn"),
    haandteringSatser: sats(28000, "fastPrBooking") },
  /* ⚠ ODENSE HAR INGEN DØGNSATS — MED VILJE. Lageret findes, håndteringen er
     aftalt, og døgnprisen er ikke forhandlet endnu. Uden en post som denne
     ville "mangler sats" aldrig kunne ses i dev, og en tælling der kun kan
     give det rigtige svar, kan ikke tage fejl på en måde nogen opdager.
     Det er samme grund som den åbne indkøbsordre og den planlagte
     facility-opgave. */
  { id: "lag-odense", navn: "Kølehus Odense", kapacitet: 90,
    haandteringSatser: sats(31000, "fastPrBooking") },
];

/* ══════════════════════════════════════════════════════════════════════════
   SELVKONTROL — kun i DEV.
   ⚠ TO SÆT DER PEGER PÅ HINANDEN. En tastefejl i et køretøjs-id giver en
   MANGLENDE linje i estimatet, ikke en fejl — og et estimat der er for lavt,
   ligner et godt tilbud.
   ══════════════════════════════════════════════════════════════════════════ */
if (import.meta.env?.DEV) {
  const kt = new Set(DEMO_KOERETOEJER.map((k) => k.id));
  for (const o of DEMO_OMKOSTNINGER) {
    if (o.art !== "bil") continue;
    const id = o.id.replace(/^bil-/, "");
    if (!kt.has(id)) {
      console.warn(`demo-omkostninger: ${o.id} peger paa koeretoejet "${id}", som ikke findes.`);
    }
  }
  const set = new Set();
  for (const o of DEMO_OMKOSTNINGER) {
    if (set.has(o.id)) console.warn(`demo-omkostninger: id "${o.id}" optraeder to gange.`);
    set.add(o.id);
    if (/[.#$[\]/]/.test(o.id)) {
      console.warn(`demo-omkostninger: "${o.id}" kan ikke vaere en RTDB-noegle.`);
    }
    /* ⚠ TO BAAND DER DAEKKER SAMME LAENGDE, ER TO PRISER PAA EEN TUR.
       Opslaget ville tage det ene, og ingen kunne se hvorfor. */
    for (const { a, b } of baandOverlap(Object.values(o.satser || {}))) {
      console.warn(
        `demo-omkostninger: ${o.id} har to satser der begge daekker samme laengde ` +
        `(${baandLabel(a)} og ${baandLabel(b)}).`
      );
    }
  }
}
