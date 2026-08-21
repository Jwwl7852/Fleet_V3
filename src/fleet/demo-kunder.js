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

import { DEMO_KPI } from "./demo-kpi.js";
import { selvkontrol } from "./selvkontrol.js";

const NU = Date.now();
const D = 86400000;
/* Demo-datasæt til useListe(). Bruges når der ikke er en database, og som
   fallback hvis læsningen fejler. Beløb i hele øre, ekskl. moms.

   ⚠ HER STOD AT division SKAL STÅ EKSPLICIT PÅ HVER POST, og at Aalborg
   Industri og Kolding Kommune var "faelles" fordi de køber både busser og
   fragt. Det var rigtigt om KUNDERNE og forkert om os: feltet er fjernet
   (beslutning 70), fordi ingen abonnent har begge forretninger — så der var
   ingen to lister at stå på.

   KENDT SKÆVHED: omsaetningOere og daekningsbidragOere er periodeafhængige
   tal på en stamdatanode. For en fælles kunde burde de være opgjort pr.
   division. Det hører i aggregeringen sammen med de øvrige manglende
   KPI-felter — se noten i useListe.js.

   aftaltOere/faktureretOere står kun på de kunder der HAR en afvigelse i
   perioden — salgsprisafvigelseskortet er et filter på samme datasæt, ikke
   en selvstændig liste. */
export const DEMO_KUNDER = [
  { id: "nordiskFragt", navn: "Nordisk Fragt A/S", aktiv: true,
    adresse: "Havnegade 14", postnr: "5000", by: "Odense C",
    aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 1 * D, aftaleUdloeberMs: NU + 243 * D,
    omsaetningOere: 14250000, daekningsbidragOere: 4132500,
    aftalestatus: "aktiv", ansvarlig: "Mette Kjær" },
  { id: "skagenSeafood", navn: "Skagen Seafood ApS", aktiv: true,
    adresse: "Fiskerihavnsgade 3", postnr: "9990", by: "Skagen",
    aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 2 * D, aftaleUdloeberMs: NU + 152 * D,
    omsaetningOere: 11840000, daekningsbidragOere: 3078400,
    aftalestatus: "aktiv", ansvarlig: "Søren Dahl" },
  { id: "jyskByggecenter", navn: "Jysk Byggecenter A/S", aktiv: true,
    adresse: "Industrivej 55", postnr: "8600", by: "Silkeborg",
    aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 3 * D, aftaleUdloeberMs: NU + 30 * D,
    omsaetningOere: 9620000, daekningsbidragOere: 2212600,
    aftalestatus: "genforhandling", ansvarlig: "Mette Kjær",
    aftaltOere: 9620000, faktureretOere: 9913000, afvigelsesAarsag: "Tillæg for ekstra stop" },
  { id: "fynKoel", navn: "Fyn Køl & Frost A/S", aktiv: true,
    adresse: "Kølevej 8", postnr: "5220", by: "Odense SØ",
    aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 5 * D, aftaleUdloeberMs: NU + 334 * D,
    omsaetningOere: 8875000, daekningsbidragOere: 2751200,
    aftalestatus: "aktiv", ansvarlig: "Anne Bøgh" },
  { id: "hamburgHandel", navn: "Hamburg Handel GmbH", aktiv: true,
    aftale: "Spotaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 6 * D, aftaleUdloeberMs: NU + 6 * D,
    omsaetningOere: 7430000, daekningsbidragOere: 1337400,
    aftalestatus: "udloeber", ansvarlig: "Søren Dahl",
    aftaltOere: 7430000, faktureretOere: 5590000, afvigelsesAarsag: "Spotpris under aftalt minimum" },
  { id: "koldingKommune", navn: "Kolding Kommune", aktiv: true,
    adresse: "Akseltorv 1", postnr: "6000", by: "Kolding",
    aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 4 * D, aftaleUdloeberMs: NU + 150 * D,
    omsaetningOere: 6850000, daekningsbidragOere: 1918000,
    aftalestatus: "aktiv", ansvarlig: "Anne Bøgh",
    aftaltOere: 6850000, faktureretOere: 6712000, afvigelsesAarsag: "Kommunal rabat ikke aftalt" },
  { id: "vestjyskLandbrug", navn: "Vestjysk Landbrug AmbA", aktiv: true,
    aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 8 * D, aftaleUdloeberMs: NU + 24 * D,
    omsaetningOere: 6190000, daekningsbidragOere: 1547500,
    aftalestatus: "genforhandling", ansvarlig: "Peter Lund",
    aftaltOere: 6190000, faktureretOere: 6560500, afvigelsesAarsag: "Færgetillæg viderefaktureret" },
  { id: "aalborgIndustri", navn: "Aalborg Industri A/S", aktiv: true,
    adresse: "Stenbukken 11", postnr: "9200", by: "Aalborg SV",
    aftale: "Fastaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 9 * D, aftaleUdloeberMs: NU + 28 * D,
    omsaetningOere: 5420000, daekningsbidragOere: 1463400,
    aftalestatus: "genforhandling", ansvarlig: "Anne Bøgh" },
  { id: "bornholmsMejeri", navn: "Bornholms Mejeri", aktiv: true,
    aftale: "Rammeaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 12 * D, aftaleUdloeberMs: NU + 11 * D,
    omsaetningOere: 4380000, daekningsbidragOere: 919800,
    aftalestatus: "udloeber", ansvarlig: "Peter Lund",
    aftaltOere: 4380000, faktureretOere: 4380000, afvigelsesAarsag: "Ingen afvigelse" },
  { id: "koldingStaal", navn: "Kolding Stål ApS", aktiv: true,
    adresse: "Jernbanegade 22", postnr: "6000", by: "Kolding",
    aftale: "Spotaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 16 * D, aftaleUdloeberMs: NU - 3 * D,
    omsaetningOere: 3860000, daekningsbidragOere: 617600,
    aftalestatus: "udloebet", ansvarlig: "Søren Dahl",
    aftaltOere: 3860000, faktureretOere: 3612000, afvigelsesAarsag: "Ventetid ikke faktureret" },
  { id: "sjaellandRetail", navn: "Sjælland Retail A/S", aktiv: true,
    aftale: "Fastaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 21 * D, aftaleUdloeberMs: NU + 19 * D,
    omsaetningOere: 3240000, daekningsbidragOere: 874800,
    aftalestatus: "udloeber", ansvarlig: "Mette Kjær" },

  { id: "sydjyskRutebiler", navn: "Sydjysk Rutebiler A/S", aktiv: true,
    aftale: "Rammeaftale", prisgruppe: "B",
    sidsteAktivitetMs: NU - 2 * D, aftaleUdloeberMs: NU + 210 * D,
    omsaetningOere: 8420000, daekningsbidragOere: 2021000,
    aftalestatus: "aktiv", ansvarlig: "Mette Kjær" },
  { id: "midtjyllandsTurist", navn: "Midtjyllands Turistbusser ApS", aktiv: true,
    aftale: "Fastaftale", prisgruppe: "A",
    sidsteAktivitetMs: NU - 7 * D, aftaleUdloeberMs: NU + 9 * D,
    omsaetningOere: 4960000, daekningsbidragOere: 1339200,
    aftalestatus: "udloeber", ansvarlig: "Søren Dahl" },
  { id: "djursSommerland", navn: "Djurs Sommerland A/S", aktiv: true,
    aftale: "Spotaftale", prisgruppe: "C",
    sidsteAktivitetMs: NU - 13 * D, aftaleUdloeberMs: NU + 21 * D,
    omsaetningOere: 3180000, daekningsbidragOere: 985800,
    aftalestatus: "udloeber", ansvarlig: "Peter Lund",
    aftaltOere: 3180000, faktureretOere: 3402000, afvigelsesAarsag: "Ekstra afgange i højsæson" },
];

/* ---- Tilbud ------------------------------------------------------------ */

/**
 * FEMTE GANG MØNSTRET DUKKER OP. Tilbuddene lå som `const TILBUD` inde i
 * moduler/Kunder.jsx — samme fejl som kundelisten selv, og den overlevede
 * kun fordi den ikke hed DEMO_ og derfor gled forbi linten i
 * test/demo-kilder.test.mjs. Et navn er ikke en beskyttelse.
 *
 * ⚠ ET TILBUD ER IKKE EN BOOKING. Der findes ingen `tilbud`-node i
 * ARKITEKTUR: `tilbud` er ikke en bookingtilstand, og et tilbud kan gå til et
 * EMNE der ikke er kunde endnu. Nodeformen skal besluttes, før forespørgslen
 * kan skrives — indtil da ligger de her, i den form de skal have.
 *
 * `kundeId` er null på et emne. Det er ikke en manglende oplysning; det er
 * hele grunden til at tilbud ikke bare er et felt på kunden.
 *
 * DIVISION STÅR EKSPLICIT. Et tilbud er en transaktion og hører til én
 * afdeling — aldrig "faelles", modsat kunden det går til.
 */
export const TILBUD_STATUS = {
  ny:          { label: "Ny",          tone: "info", kraeverOpfoelgning: false },
  opfoelgning: { label: "Opfølgning",  tone: "warn", kraeverOpfoelgning: true  },
  afventerSvar:{ label: "Afventer svar", tone: "warn", kraeverOpfoelgning: true },
};

export const DEMO_TILBUD = [
  { id: "tb-001", kunde: "Djursland Transport ApS", kundeId: null, beloebOere: 8450000, sendtMs: NU - 18 * D, gyldigTilMs: NU + 4 * D, status: "opfoelgning" },
  { id: "tb-002", kunde: "Skagen Seafood ApS", kundeId: "skagenSeafood", beloebOere: 5620000, sendtMs: NU - 15 * D, gyldigTilMs: NU + 11 * D, status: "afventerSvar" },
  { id: "tb-003", kunde: "Randers Papir A/S", kundeId: null, beloebOere: 3980000, sendtMs: NU - 11 * D, gyldigTilMs: NU + 19 * D, status: "ny" },
  { id: "tb-004", kunde: "Hamburg Handel GmbH", kundeId: null, beloebOere: 12400000, sendtMs: NU - 9 * D, gyldigTilMs: NU + 2 * D, status: "opfoelgning" },
  { id: "tb-005", kunde: "Esbjerg Offshore A/S", kundeId: null, beloebOere: 7150000, sendtMs: NU - 6 * D, gyldigTilMs: NU + 24 * D, status: "ny" },
  { id: "tb-006", kunde: "Vejle Turistfart ApS", kundeId: null, beloebOere: 2980000, sendtMs: NU - 16 * D, gyldigTilMs: NU + 6 * D, status: "opfoelgning" },
  { id: "tb-007", kunde: "Odense Skoleforvaltning", kundeId: null, beloebOere: 5410000, sendtMs: NU - 10 * D, gyldigTilMs: NU + 15 * D, status: "afventerSvar" },
];

/* ---- Selvkontrol ------------------------------------------------------- */

selvkontrol("demo-kunder", () => {
  const kundeIder = new Set(DEMO_KUNDER.map((k) => k.id));

  for (const t of DEMO_TILBUD) {
    if (!TILBUD_STATUS[t.status]) {
      console.warn(`demo-kunder: ${t.id} har ukendt status "${t.status}".`);
    }
    /* Et tilbud til en EKSISTERENDE kunde skal pege på en der findes. Er
       kundeId null, er det et emne — og det er lovligt. */
    if (t.kundeId && !kundeIder.has(t.kundeId)) {
      console.warn(`demo-kunder: ${t.id} peger på kundeId "${t.kundeId}", som ikke findes.`);
    }
    if (t.division === "faelles") {
      console.warn(`demo-kunder: ${t.id} har division "faelles". Et tilbud er en transaktion og hører til én afdeling.`);
    }
    if (!(t.gyldigTilMs > t.sendtMs)) {
      console.warn(`demo-kunder: ${t.id} er gyldig til før den blev sendt.`);
    }
  }

  /* Loft mod kpi/: et udsnit kan ikke være større end totalen. */
  for (const div of ["gods", "bus"]) {
    const mine = DEMO_TILBUD.filter((t) => t.division === div);
    const loft = DEMO_KPI[div]?.kunder?.tilbud || 0;
    if (mine.length > loft) {
      console.warn(
        `demo-kunder: ${mine.length} tilbud i ${div}, men kpi.${div}.kunder.tilbud siger ${loft}.`
      );
    }
    const kraever = mine.filter((t) => TILBUD_STATUS[t.status]?.kraeverOpfoelgning).length;
    const kraeverLoft = DEMO_KPI[div]?.kunder?.tilbudKraeverOpfoelgning || 0;
    if (kraever > kraeverLoft) {
      console.warn(
        `demo-kunder: ${kraever} tilbud kræver opfølgning i ${div}, men kpi/ siger ${kraeverLoft}.`
      );
    }
  }
});
