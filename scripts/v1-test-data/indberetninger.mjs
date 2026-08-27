/* scripts/v1-test-data/indberetninger.mjs
 * V1-testselskabets ene indberetning — én Fleet-indberetning fra chaufføren.
 * Nodeform som src/fleet/demo-indberetninger.js. Den sensitive companion-post
 * er tom med vilje (intet at skjule endnu) — samme mønster som ind-000 i
 * demo-sættet: findes noden kun når der ER noget at skjule, kan man læse af
 * hængelåsen at der skete en skade, så hver post — også de tomme — skal have
 * sin sensitive-post.
 */
const NU = Date.now();
const T = 3600000;

export const V1T_INDBERETNINGER = [
  { id: "ind-v1t-001", art: "koeretoejsskade", forloeb: "ny",
    oprettetAf: "uid:chauffoer", oprettetMs: NU - 1 * T,
    koeretoejId: "vtBil2", bookingId: null, sagId: null,
    beskrivelse: "Ridse i højre sidepanel, opdaget ved afgangstjek",
    omkostningOere: null, indkoebId: null, ingenOmkostning: null,
    tidsregistrering: null, materialelinjer: [] },
];

export const V1T_INDBERETNINGER_SENSITIVE = {
  "ind-v1t-001": {},
};
