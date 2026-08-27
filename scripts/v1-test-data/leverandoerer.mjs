/* scripts/v1-test-data/leverandoerer.mjs
 * V1-testselskabets leverandørkartotek — fem leverandører, samme nodeform
 * som tenants/<t>/leverandoerer/<id> (se src/fleet/demo-indkoeb.js).
 *
 * Fem typer: værksted, Facility-servicefirma, emballage/materialer, dæk,
 * og én generel leverandør. Sproget er fordelt dansk/svensk/engelsk, så
 * Skive 4D's flersprogede ordremail kan testes realistisk — se sprog.js.
 *
 * ⚠ INGEN RIGTIGE EKSTERNE MAILADRESSER. Alle kontaktEmail-felter peger på
 * .invalid — samme mønster som DEV-kontiene i dev-brugere.js. Ingen mail må
 * nogensinde kunne nå en rigtig virksomhed herfra.
 */
const D = 86400000;
const iDag = new Date(); iDag.setHours(0, 0, 0, 0);
const D0 = iDag.getTime();
const dag = (n) => D0 + n * D;

export const V1T_LEVERANDOERER = [
  {
    id: "vtVaerksted", navn: "V1 Test Værksted ApS", cvr: "10000001",
    kategori: "vaerksted", aktiv: true,
    aftale: { type: "rammeaftale", gyldigFra: dag(-200) },
    kontaktEmail: "vaerksted@fleetcontrol-v1test.invalid", kontaktTelefon: "70 00 00 01",
    sprog: "da",
  },
  {
    id: "vtFacilityService", navn: "V1 Test Facility Service A/S", cvr: "10000002",
    kategori: "facility", aktiv: true,
    aftale: { type: "rammeaftale", gyldigFra: dag(-180) },
    kontaktEmail: "facility@fleetcontrol-v1test.invalid", kontaktTelefon: "70 00 00 02",
    sprog: "da",
  },
  /* Svensk — emballage/materialer, AB-selskabsform. */
  {
    id: "vtEmballage", navn: "V1 Test Emballage & Material AB", cvr: "10000003",
    kategori: "reservedele", aktiv: true,
    aftale: { type: "fastaftale", gyldigFra: dag(-90) },
    kontaktEmail: "emballage@fleetcontrol-v1test.invalid", kontaktTelefon: "+46 70 000 00 03",
    sprog: "sv",
  },
  /* Engelsk — dæk/service, Ltd-selskabsform. */
  {
    id: "vtDaek", navn: "V1 Test Tyre & Service Ltd", cvr: "10000004",
    kategori: "daek", aktiv: true,
    aftale: { type: "spot" },
    kontaktEmail: "tyres@fleetcontrol-v1test.invalid", kontaktTelefon: "+44 20 0000 0004",
    sprog: "en",
  },
  {
    id: "vtGenerel", navn: "V1 Test Generel Leverandør ApS", cvr: "10000005",
    kategori: "kontor", aktiv: true,
    aftale: { type: "spot" },
    kontaktEmail: "generel@fleetcontrol-v1test.invalid", kontaktTelefon: "70 00 00 05",
    sprog: "da",
  },
];
