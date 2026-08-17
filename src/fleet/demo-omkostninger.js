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
    id: "faerge:femern", art: "passage", kategori: "faerge", division: "faelles",
    navn: "Færge: Femern (Rødby–Puttgarden)", satser: sats(215000, "prPassage"),
  },
  {
    id: "faerge:oevrige", art: "passage", kategori: "faerge", division: "faelles",
    navn: "Færger (øvrige)", satser: sats(215000, "fastPrBooking"),
  },
  {
    id: "bro:storebaelt", art: "passage", kategori: "bro", division: "faelles",
    navn: "Bro: Storebælt (lastbil 10–20 m)", satser: sats(88700, "prPassage"),
  },
  {
    id: "bro:oeresund", art: "passage", kategori: "bro", division: "faelles",
    navn: "Bro: Øresund", satser: sats(91000, "prPassage"),
  },
  {
    /* ⚠ EUROTUNNEL ER CALAIS–FOLKESTONE. I mockuppen lå den på ruten
       København–Hamburg. Én vej, så den tælles ikke dobbelt ved retur. */
    id: "tunnel:eurotunnel", art: "passage", kategori: "tunnel", division: "faelles",
    navn: "Eurotunnel (Calais–Folkestone)", satser: sats(235000, "prPassageEnVej"),
  },
  {
    id: "parkering:europa", art: "passage", kategori: "parkering", division: "faelles",
    navn: "Parkering Europa (gennemsnit)", satser: sats(45000, "prDoegn"),
  },
  {
    /* ⚠ `altidPaaBooking` — vejafgiften kommer med uden at nogen vælger den.
       Antallet af færger kommer fra RUTEN; vejafgiften gør ikke. */
    id: "vejafgift:miljoezoner", art: "passage", kategori: "vejafgift",
    division: "faelles", altidPaaBooking: true,
    navn: "Vejafgifter / miljøzoner", satser: sats(32500, "fastPrBooking"),
  },

  /* ---- Agenter. En agent hører til ÉN afdeling. ------------------------- */
  {
    id: "hthHamburg", art: "agent", by: "Hamburg", division: "gods",
    navn: "HTH Logistics GmbH", note: "Indendørs parkering",
    satser: sats(125000, "prDoegn"),
  },
  {
    id: "transportsParis", art: "agent", by: "Paris", division: "gods",
    navn: "Transports Parisien SARL", note: "Sikret område",
    satser: sats(105000, "prDoegn"),
  },
  {
    id: "euroTransAms", art: "agent", by: "Amsterdam", division: "gods",
    navn: "EuroTrans BV", note: "Parkeringsplads med overvågning",
    satser: sats(95000, "prDoegn"),
  },
  {
    id: "bavariaMuenchen", art: "agent", by: "München", division: "gods",
    navn: "Bavaria Logistics GmbH", note: "Overdækket parkering",
    satser: sats(115000, "prDoegn"),
  },
  {
    id: "milanoCargo", art: "agent", by: "Milano", division: "gods",
    navn: "Milano Cargo SRL", note: "Indhegnet areal",
    satser: sats(110000, "prDoegn"),
  },
  {
    id: "bruxTrans", art: "agent", by: "Bruxelles", division: "gods",
    navn: "BruxTrans SA", note: "Åbent område",
    satser: sats(90000, "prDoegn"),
  },
  {
    id: "berlinBusPark", art: "agent", by: "Berlin", division: "bus",
    navn: "Berlin Bus Park GmbH", note: "Buspladser med chaufførfaciliteter",
    satser: sats(85000, "prDoegn"),
  },
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
  }
}
