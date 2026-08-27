/* scripts/v1-test-data/kunder.mjs
 * V1-testselskabets kundekartotek — fem kunder, samme nodeform som
 * tenants/<t>/kunder/<id> (se src/fleet/demo-kunder.js for skabelonen).
 *
 * Fem typer, som ejerne bad om: en større virksomhed, en mindre
 * erhvervskunde, en fast kunde, en sporadisk kunde, og én kunde der er
 * relevant for Warehouse/Unitbooking (får varer og et unitbooking-udlån).
 *
 * INGEN division — beslutning 70, reglerne afviser feltet.
 * Alle syntetiske: navne, adresser og CVR-lignende numre er opfundet.
 */
const NU = Date.now();
const D = 86400000;

export const V1T_KUNDER = [
  {
    id: "vtSpedition", navn: "V1 Test Spedition A/S", aktiv: true,
    adresse: "Testvej 1", postnr: "6000", by: "Kolding",
    aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 1 * D, aftaleUdloeberMs: NU + 300 * D,
    omsaetningOere: 4200000, daekningsbidragOere: 1260000,
    aftalestatus: "aktiv", ansvarlig: "Henrik Fabricius",
  },
  {
    id: "vtErhverv", navn: "V1 Test Erhverv ApS", aktiv: true,
    adresse: "Testvej 2", postnr: "6000", by: "Kolding",
    aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 3 * D, aftaleUdloeberMs: NU + 120 * D,
    omsaetningOere: 1150000, daekningsbidragOere: 287500,
    aftalestatus: "aktiv", ansvarlig: "Henrik Fabricius",
  },
  {
    id: "vtFastKunde", navn: "V1 Test Fast Kunde ApS", aktiv: true,
    adresse: "Testvej 3", postnr: "9000", by: "Aalborg",
    aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 2 * D, aftaleUdloeberMs: NU + 200 * D,
    omsaetningOere: 2680000, daekningsbidragOere: 723600,
    aftalestatus: "aktiv", ansvarlig: "Henrik Fabricius",
  },
  {
    id: "vtSporadisk", navn: "V1 Test Sporadisk Handel ApS", aktiv: true,
    adresse: "Testvej 4", postnr: "6000", by: "Kolding",
    aftale: "Spotaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 14 * D, aftaleUdloeberMs: NU + 20 * D,
    omsaetningOere: 340000, daekningsbidragOere: 61200,
    aftalestatus: "aktiv", ansvarlig: "Henrik Fabricius",
  },
  /* Relevant for lager/Unitbooking: får varer i Warehouse og et udlån i
     Unitbooking, så begge moduler har en rigtig kunde at pege på. */
  {
    id: "vtLager", navn: "V1 Test Lager & Logistik ApS", aktiv: true,
    adresse: "Testvej 5", postnr: "6000", by: "Kolding",
    aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 1 * D, aftaleUdloeberMs: NU + 250 * D,
    omsaetningOere: 980000, daekningsbidragOere: 215600,
    aftalestatus: "aktiv", ansvarlig: "Henrik Fabricius",
  },
];
