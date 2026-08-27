/* scripts/v1-test-data/procure.mjs
 * V1-testselskabets Procure-data: ét indkøbsbehov, én bestilling i en
 * actionabel "afventer godkendelse"-status (over beløbsgrænsen — se
 * kraeverGodkendelse() i procure.js), virksomhedens godkendelsespolitik, og
 * tre fakturaer i hver sin status ("Fakturaer & bilag", gated på
 * fakturaer.laes, node ejet af modulet indkoeb — se nav.js). Nodeform som
 * src/fleet/demo-procure.js og src/fleet/demo-indkoeb.js.
 *
 * ⚠ UID-PLADSHOLDERE PÅ FORMEN "@rolle" — se indsaetUid() i
 * provisioner-v1-test-seed.mjs. bestillerId/anmoderId er IKKE pladsholdere;
 * de peger direkte på et personale-id fra personale.mjs.
 */
const NU = Date.now();
const D = 86400000;
const T = 3600000;

/* "1 Procure-behov". */
export const V1T_INDKOEBSBEHOV = [
  { id: "vtBeh1", vare: "Bremseklodser, sæt", kilde: "lager", status: "nyt",
    antal: 2, enhed: "sæt", prioritet: "mellem", varenummer: "BRK-V1T",
    anmoderId: "vtMekaniker1", oprettetAf: "@lagermedarbejder", oprettetMs: NU - 3 * T,
    note: "Til service på Bil 4." },
];

/* "1 ordre i en relevant status inden afsendelse" — over beløbsgrænsen
   (500.000 øre, se V1T_GODKENDELSESREGLER), så den rent faktisk STÅR i køen
   frem for at være blevet auto-godkendt. */
export const V1T_INDKOEBSORDRER = [
  { id: "vtOrd1", nummer: "BST-2026-00001", leverandoerId: "vtDaek",
    status: "afventerGodkendelse", oprettetAf: "@lagermedarbejder", oprettetMs: NU - 2 * T,
    bestillerId: "vtLager1",
    linjer: {
      "l-1": { vare: "Lastbildæk 315/70 R22.5", varenummer: "DAEK-31570",
               antal: 4, enhed: "stk", prisPrEnhedOere: 200000 },
    } },
];

export const V1T_GODKENDELSESREGLER = {
  overBeloeb: { aktiv: true, graenseOere: 500000, godkenderUid: "@koordinator" },
  fakturagodkendelse: { aktiv: false },
  aendretAf: "@admin", aendretMs: NU - 400 * T,
};

/* "2-3 fakturaer i hver sin juridiske status." Ingen af dem peger på
   vtOrd1 — den ordre er stadig kun en intern bestillingsanmodning og ikke
   sendt til leverandøren endnu, så der findes ingen faktura for den. */
export const V1T_FAKTURAER = [
  { id: "vtFa1", leverandoerId: "vtVaerksted", fakturanummer: "VT-2026-001",
    fakturadatoMs: NU - 6 * D, forfaldMs: NU + 24 * D, status: "modtaget",
    beloebOere: 312000, momsOere: 78000, indkoebId: null, sagsnummer: null,
    kilde: "mail", destinationArt: "fleet", destinationId: "vtBil2",
    reference: "V1T Bil 2 — bremseservice" },
  { id: "vtFa2", leverandoerId: "vtFacilityService", fakturanummer: "FS-2026-014",
    fakturadatoMs: NU - 3 * D, forfaldMs: NU + 27 * D, status: "godkendt",
    beloebOere: 184500, momsOere: 46125, indkoebId: null, sagsnummer: null,
    kilde: "mail", destinationArt: "ingen",
    destinationGrund: "Fast abonnement på alarmovervågning — ingen bestilling bag, kommer hver måned." },
  { id: "vtFa3", leverandoerId: "vtGenerel", fakturanummer: "GEN-2026-088",
    fakturadatoMs: NU - 20 * D, forfaldMs: NU - 10 * D, status: "bogfoert",
    beloebOere: 95000, momsOere: 23750, indkoebId: null, sagsnummer: null,
    kilde: "upload", destinationArt: "ingen",
    destinationGrund: "Kontorartikler til administrationen — fast leverandør, ingen bestilling bag.",
    matchetAf: "@koordinator", matchetMs: NU - 19 * D, bogfoertMs: NU - 18 * D },
];
