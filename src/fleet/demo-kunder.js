/* src/fleet/demo-kunder.js
 * Demo-kunder. Flyttet ud af moduler/Kunder.jsx.
 *
 * FJERDE GANG MOENSTRET DUKKER OP. Bemanding havde sine egne elleve navne,
 * bilerne stod tre steder med to nummerplader for Bil 104, sagens bil skulle
 * rettes ind — og her laa kundelisten som en LOKAL const inde i en modulfil,
 * hvor demo-bookinger ikke kunne naa den uden at lave sin egen kopi.
 *
 * Et demo-datasaet hoerer i fleet/, ikke i et modul. Der er en test der
 * fejler hvis en DEMO_-konstant defineres i moduler/ — se
 * test/demo-kilder.test.mjs. Fire gange er ikke et tilfaelde.
 */

const NU = Date.now();
const D = 86400000;
/* Demo-datasæt til useListe(). Bruges når der ikke er en database, og som
   fallback hvis læsningen fejler. Beløb i hele øre, ekskl. moms.

   division står EKSPLICIT på hver post — ingen arver en default. Ellers kan
   man ikke se om filteret virker eller bare falder tilbage.

   Kunder er stamdata, så alle tre værdier er lovlige. Aalborg Industri
   (medarbejderbusser + fragt) og Kolding Kommune (skolebusser +
   containerkørsel) er "faelles" og står derfor på BEGGE divisioners lister
   med samme tal. Det er ikke en dublet — det er én kunde.

   KENDT SKÆVHED: omsaetningOere og daekningsbidragOere er periodeafhængige
   tal på en stamdatanode. For en fælles kunde burde de være opgjort pr.
   division. Det hører i aggregeringen sammen med de øvrige manglende
   KPI-felter — se noten i useListe.js.

   aftaltOere/faktureretOere står kun på de kunder der HAR en afvigelse i
   perioden — salgsprisafvigelseskortet er et filter på samme datasæt, ikke
   en selvstændig liste. */
export const DEMO_KUNDER = [
  { id: "nordiskFragt", navn: "Nordisk Fragt A/S", division: "gods", aktiv: true,
    aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 1 * D, aftaleUdloeberMs: NU + 243 * D,
    omsaetningOere: 14250000, daekningsbidragOere: 4132500,
    aftalestatus: "aktiv", ansvarlig: "Mette Kjær" },
  { id: "skagenSeafood", navn: "Skagen Seafood ApS", division: "gods", aktiv: true,
    aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 2 * D, aftaleUdloeberMs: NU + 152 * D,
    omsaetningOere: 11840000, daekningsbidragOere: 3078400,
    aftalestatus: "aktiv", ansvarlig: "Søren Dahl" },
  { id: "jyskByggecenter", navn: "Jysk Byggecenter A/S", division: "gods", aktiv: true,
    aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 3 * D, aftaleUdloeberMs: NU + 30 * D,
    omsaetningOere: 9620000, daekningsbidragOere: 2212600,
    aftalestatus: "genforhandling", ansvarlig: "Mette Kjær",
    aftaltOere: 9620000, faktureretOere: 9913000, afvigelsesAarsag: "Tillæg for ekstra stop" },
  { id: "fynKoel", navn: "Fyn Køl & Frost A/S", division: "gods", aktiv: true,
    aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 5 * D, aftaleUdloeberMs: NU + 334 * D,
    omsaetningOere: 8875000, daekningsbidragOere: 2751200,
    aftalestatus: "aktiv", ansvarlig: "Anne Bøgh" },
  { id: "hamburgHandel", navn: "Hamburg Handel GmbH", division: "gods", aktiv: true,
    aftale: "Spotaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 6 * D, aftaleUdloeberMs: NU + 6 * D,
    omsaetningOere: 7430000, daekningsbidragOere: 1337400,
    aftalestatus: "udloeber", ansvarlig: "Søren Dahl",
    aftaltOere: 7430000, faktureretOere: 5590000, afvigelsesAarsag: "Spotpris under aftalt minimum" },
  { id: "koldingKommune", navn: "Kolding Kommune", division: "faelles", aktiv: true,
    aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 4 * D, aftaleUdloeberMs: NU + 150 * D,
    omsaetningOere: 6850000, daekningsbidragOere: 1918000,
    aftalestatus: "aktiv", ansvarlig: "Anne Bøgh",
    aftaltOere: 6850000, faktureretOere: 6712000, afvigelsesAarsag: "Kommunal rabat ikke aftalt" },
  { id: "vestjyskLandbrug", navn: "Vestjysk Landbrug AmbA", division: "gods", aktiv: true,
    aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 8 * D, aftaleUdloeberMs: NU + 24 * D,
    omsaetningOere: 6190000, daekningsbidragOere: 1547500,
    aftalestatus: "genforhandling", ansvarlig: "Peter Lund",
    aftaltOere: 6190000, faktureretOere: 6560500, afvigelsesAarsag: "Færgetillæg viderefaktureret" },
  { id: "aalborgIndustri", navn: "Aalborg Industri A/S", division: "faelles", aktiv: true,
    aftale: "Fastaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 9 * D, aftaleUdloeberMs: NU + 28 * D,
    omsaetningOere: 5420000, daekningsbidragOere: 1463400,
    aftalestatus: "genforhandling", ansvarlig: "Anne Bøgh" },
  { id: "bornholmsMejeri", navn: "Bornholms Mejeri", division: "gods", aktiv: true,
    aftale: "Rammeaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 12 * D, aftaleUdloeberMs: NU + 11 * D,
    omsaetningOere: 4380000, daekningsbidragOere: 919800,
    aftalestatus: "udloeber", ansvarlig: "Peter Lund",
    aftaltOere: 4380000, faktureretOere: 4380000, afvigelsesAarsag: "Ingen afvigelse" },
  { id: "koldingStaal", navn: "Kolding Stål ApS", division: "gods", aktiv: true,
    aftale: "Spotaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 16 * D, aftaleUdloeberMs: NU - 3 * D,
    omsaetningOere: 3860000, daekningsbidragOere: 617600,
    aftalestatus: "udloebet", ansvarlig: "Søren Dahl",
    aftaltOere: 3860000, faktureretOere: 3612000, afvigelsesAarsag: "Ventetid ikke faktureret" },
  { id: "sjaellandRetail", navn: "Sjælland Retail A/S", division: "gods", aktiv: true,
    aftale: "Fastaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 21 * D, aftaleUdloeberMs: NU + 19 * D,
    omsaetningOere: 3240000, daekningsbidragOere: 874800,
    aftalestatus: "udloeber", ansvarlig: "Mette Kjær" },

  { id: "sydjyskRutebiler", navn: "Sydjysk Rutebiler A/S", division: "bus", aktiv: true,
    aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 2 * D, aftaleUdloeberMs: NU + 210 * D,
    omsaetningOere: 8420000, daekningsbidragOere: 2021000,
    aftalestatus: "aktiv", ansvarlig: "Mette Kjær" },
  { id: "midtjyllandsTurist", navn: "Midtjyllands Turistbusser ApS", division: "bus", aktiv: true,
    aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 7 * D, aftaleUdloeberMs: NU + 9 * D,
    omsaetningOere: 4960000, daekningsbidragOere: 1339200,
    aftalestatus: "udloeber", ansvarlig: "Søren Dahl" },
  { id: "djursSommerland", navn: "Djurs Sommerland A/S", division: "bus", aktiv: true,
    aftale: "Spotaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 13 * D, aftaleUdloeberMs: NU + 21 * D,
    omsaetningOere: 3180000, daekningsbidragOere: 985800,
    aftalestatus: "udloeber", ansvarlig: "Peter Lund",
    aftaltOere: 3180000, faktureretOere: 3402000, afvigelsesAarsag: "Ekstra afgange i højsæson" },
];
