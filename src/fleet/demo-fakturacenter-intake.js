/*
 * Fuldt syntetiske Fakturacenter-scenarier.
 * Navne, id'er, CVR-markører og referencer er opdigtede demo-værdier.
 */
import {
  AFLAESNING_STATUS,
  bygAflæsning,
  bygIntake,
  bygMailbundle,
  bygMailboxKontrakt,
  bygOpbevaringsKontrakt,
  bygVeyroMailKontrakt,
  DOKUMENTTYPE,
  DUBLET_STATUS,
  FAKTURAART,
  FAKTURAVINDUE,
  INDBAKKE_SEKTION,
  INTAKE_KILDE,
  INTAKE_STATUS,
  KONTROL_STATUS,
  MATCHNIVEAU,
  matchFaktura,
  MODUL,
  TEKNISK_FEJLKODE,
} from "./fakturacenter-intake.js";
import { destinationerFraFleet } from "./fakturacenter-adapters/fleet.js";
import { destinationerFraFacility } from "./fakturacenter-adapters/facility.js";
import { destinationerFraProcure } from "./fakturacenter-adapters/procure.js";
import { selvkontrol } from "./selvkontrol.js";

export const DEMO_TENANT_ID = "tenant-demo-fakturacenter";
export const DEMO_ANDEN_TENANT_ID = "tenant-demo-isoleret";
export const DEMO_NU_MS = Date.UTC(2026, 8, 5, 8, 30, 0);

const hash = (tegn) => String(tegn).repeat(64).slice(0, 64);
const dato = (dag) => Date.UTC(2026, 7, dag, 9, 0, 0);

const LEV = Object.freeze({
  komponent: {
    id: "lev-demo-komponent", cvr: "DEMO-CVR-KOMPONENT",
    navn: "Demo Komponentværk ApS", navnevarianter: ["Demo Komponentvaerk"],
  },
  service: {
    id: "lev-demo-service", cvr: "DEMO-CVR-SERVICE",
    navn: "Demo Mobil Service ApS", navnevarianter: ["DMS Demo"],
  },
  facility: {
    id: "lev-demo-facility", cvr: "DEMO-CVR-FACILITY",
    navn: "Demo Ejendomsdrift ApS", navnevarianter: ["Demo Ejendoms Drift"],
  },
  multi: {
    id: "lev-demo-multi", cvr: "DEMO-CVR-MULTI",
    navn: "Demo Tværfaglig Service ApS", navnevarianter: [],
  },
  eneste: {
    id: "lev-demo-eneste", cvr: "DEMO-CVR-ENESTE",
    navn: "Demo Enkeltopgave Service ApS", navnevarianter: ["Demo Enkeltopgave"],
  },
});

export const DEMO_FLEET_KILDE = Object.freeze([
  {
    tenantId: DEMO_TENANT_ID, id: "fleet-opgave-1001", navn: "Service på demoenhed 42",
    operationelStatus: "afsluttet", fakturastatus: FAKTURAVINDUE.aaben, datoMs: dato(2),
    leverandoer: LEV.service, referencer: ["FLEET-DEMO-1001"],
    enhed: {
      id: "fleet-enhed-42", interntNummer: "ENH-042", registreringsnummer: "DE MO 042",
      stelSerieNummer: "DEMO-VIN-00042", navn: "Demoenhed 42", kundereferencer: ["Rute Demo Nord"],
    },
    lokation: "Demo Depot Nord", koststeder: ["DEMO-KST-FLEET"], estimatNettoOere: 480000,
  },
  {
    tenantId: DEMO_TENANT_ID, id: "fleet-opgave-2001", navn: "Fremtidig referencekontrakt",
    operationelStatus: "igang", fakturastatus: FAKTURAVINDUE.aaben, datoMs: dato(5),
    leverandoer: LEV.komponent, referencer: ["FLEET-DEMO-2001"],
    enhed: {
      id: "fleet-enhed-77", interntNummer: "ENH-077", registreringsnummer: "DE MO 077",
      stelSerieNummer: "DEMO-VIN-00077", navn: "Demoenhed 77", kundereferencer: [],
    },
    lokation: "Demo Depot Vest", koststeder: ["DEMO-KST-FLEET"], estimatNettoOere: 112500,
  },
  {
    tenantId: DEMO_TENANT_ID, id: "fleet-opgave-dup-a", navn: "Opgave for dublet-enhed A",
    operationelStatus: "afsluttet", fakturastatus: FAKTURAVINDUE.aaben, datoMs: dato(8),
    leverandoer: LEV.service, referencer: ["FLEET-DEMO-DUP-A"],
    enhed: {
      id: "fleet-enhed-dup-a", interntNummer: "DUP-007", registreringsnummer: "DE MO 701",
      stelSerieNummer: "DEMO-DUP-A", navn: "Demo dubletenhed A", kundereferencer: [],
    },
    lokation: "Demo Depot Nord", koststeder: ["DEMO-KST-FLEET"], estimatNettoOere: 210000,
  },
  {
    tenantId: DEMO_TENANT_ID, id: "fleet-opgave-dup-b", navn: "Opgave for dublet-enhed B",
    operationelStatus: "afsluttet", fakturastatus: FAKTURAVINDUE.aaben, datoMs: dato(8),
    leverandoer: LEV.service, referencer: ["FLEET-DEMO-DUP-B"],
    enhed: {
      id: "fleet-enhed-dup-b", interntNummer: "DUP-007", registreringsnummer: "DE MO 702",
      stelSerieNummer: "DEMO-DUP-B", navn: "Demo dubletenhed B", kundereferencer: [],
    },
    lokation: "Demo Depot Syd", koststeder: ["DEMO-KST-FLEET"], estimatNettoOere: 220000,
  },
  {
    tenantId: DEMO_TENANT_ID, id: "fleet-opgave-lukket", navn: "Lukket demoopgave",
    operationelStatus: "afsluttet", fakturastatus: FAKTURAVINDUE.lukket, datoMs: dato(1),
    leverandoer: LEV.service, referencer: ["FLEET-DEMO-LUKKET"],
    enhed: {
      id: "fleet-enhed-lukket", interntNummer: "ENH-099", registreringsnummer: "DE MO 099",
      stelSerieNummer: "DEMO-VIN-00099", navn: "Demoenhed 99", kundereferencer: [],
    },
    lokation: "Demo Depot Nord", koststeder: ["DEMO-KST-FLEET"], estimatNettoOere: 180000,
  },
  {
    tenantId: DEMO_TENANT_ID, id: "fleet-opgave-eneste", navn: "Eneste åbne leverandøropgave",
    operationelStatus: "afsluttet", fakturastatus: FAKTURAVINDUE.delvis, datoMs: dato(15),
    leverandoer: LEV.eneste, referencer: ["FLEET-DEMO-ENESTE"],
    enhed: null, lokation: "Demo Depot Øst", koststeder: ["DEMO-KST-FLEET"],
    estimatNettoOere: 99000,
  },
  {
    tenantId: DEMO_TENANT_ID, id: "fleet-opgave-multi", navn: "Tværfaglig Fleet-opgave",
    operationelStatus: "igang", fakturastatus: FAKTURAVINDUE.aaben, datoMs: dato(18),
    leverandoer: LEV.multi, referencer: ["FLEET-DEMO-MULTI"],
    enhed: null, lokation: "Demo Depot Vest", koststeder: ["DEMO-KST-FLEET"],
    estimatNettoOere: 300000,
  },
  {
    tenantId: DEMO_ANDEN_TENANT_ID, id: "fleet-hemmelig-anden-tenant", navn: "Anden tenant",
    operationelStatus: "igang", fakturastatus: FAKTURAVINDUE.aaben, datoMs: dato(18),
    leverandoer: LEV.service, referencer: ["FLEET-DEMO-CROSS-TENANT"],
    enhed: {
      id: "anden-enhed", interntNummer: "CROSS-001", registreringsnummer: "CROSS",
      stelSerieNummer: "CROSS", navn: "Anden tenant enhed", kundereferencer: [],
    },
    lokation: "Anden tenant", koststeder: [], estimatNettoOere: 1,
  },
]);

export const DEMO_FACILITY_KILDE = Object.freeze([
  {
    tenantId: DEMO_TENANT_ID, id: "facility-opgave-3001", navn: "Service på demoport",
    operationelStatus: "afsluttet", fakturastatus: FAKTURAVINDUE.aaben, datoMs: dato(7),
    leverandoer: LEV.facility, referencer: ["FACILITY-DEMO-3001"],
    aktiv: {
      id: "facility-aktiv-port-88", interntNummer: "AKT-088", registreringsnummer: null,
      stelSerieNummer: "FAC-SERIE-0088", navn: "Demo Port 88", kundereferencer: ["Hal Demo A"],
    },
    lokation: "Demo Lokation Syd · Hal A", koststeder: ["DEMO-KST-FAC"],
    estimatNettoOere: 275000,
  },
  {
    tenantId: DEMO_TENANT_ID, id: "facility-opgave-multi", navn: "Tværfaglig Facility-opgave",
    operationelStatus: "afsluttet", fakturastatus: FAKTURAVINDUE.aaben, datoMs: dato(19),
    leverandoer: LEV.multi, referencer: ["FACILITY-DEMO-MULTI"],
    aktiv: {
      id: "facility-aktiv-multi", interntNummer: "AKT-555", registreringsnummer: null,
      stelSerieNummer: "FAC-SERIE-0555", navn: "Demo Ventilation", kundereferencer: [],
    },
    lokation: "Demo Lokation Nord", koststeder: ["DEMO-KST-FAC"], estimatNettoOere: 310000,
  },
]);

export const DEMO_PROCURE_KILDE = Object.freeze([
  {
    tenantId: DEMO_TENANT_ID, id: "procure-ordre-4001", navn: "Bestilling af demodele",
    operationelStatus: "modtaget", fakturastatus: FAKTURAVINDUE.aaben, datoMs: dato(3),
    leverandoer: LEV.komponent, referencer: ["PROCURE-DEMO-4001"],
    enhed: null, lokation: "Demo Depot Nord", koststeder: ["DEMO-KST-PROC"],
    ordreNettoOere: 150000,
  },
  {
    tenantId: DEMO_TENANT_ID, id: "procure-ordre-multi", navn: "Tværfaglig Procure-bestilling",
    operationelStatus: "modtaget", fakturastatus: FAKTURAVINDUE.aaben, datoMs: dato(20),
    leverandoer: LEV.multi, referencer: ["PROCURE-DEMO-MULTI"],
    enhed: null, lokation: "Demo Depot Øst", koststeder: ["DEMO-KST-PROC"],
    ordreNettoOere: 320000,
  },
]);

export const DEMO_DESTINATIONER = Object.freeze([
  ...destinationerFraFleet(DEMO_FLEET_KILDE),
  ...destinationerFraFacility(DEMO_FACILITY_KILDE),
  ...destinationerFraProcure(DEMO_PROCURE_KILDE),
]);

function intake(nr, ekstra = {}) {
  const resultat = bygIntake({
    intakeId: "intake-demo-" + String(nr).padStart(2, "0"),
    tenantId: DEMO_TENANT_ID,
    kilde: INTAKE_KILDE.dragDrop,
    kildeId: "demo-kilde-" + nr,
    modtagetMs: DEMO_NU_MS - nr * 60000,
    dokumenttype: DOKUMENTTYPE.digitalPdf,
    originaltFilnavn: "syntetisk-faktura-" + String(nr).padStart(2, "0") + ".pdf",
    mimeType: "application/pdf",
    stoerrelse: 10000 + nr,
    sha256: hash((nr % 9) + 1),
    status: INTAKE_STATUS.aflæst,
    dubletstatus: DUBLET_STATUS.ingen,
    aflaesningsstatus: AFLAESNING_STATUS.aflæst,
    fakturaId: "faktura-demo-" + String(nr).padStart(2, "0"),
    fejlkoder: [],
    ...ekstra,
  });
  if (!resultat.ok) throw new Error("Ugyldigt syntetisk intake: " + resultat.fejl.join(", "));
  return resultat.intake;
}

function læs(nr, felter = {}) {
  return bygAflæsning({
    fakturaart: FAKTURAART.faktura,
    fakturanummer: "DEMO-FAK-" + String(nr).padStart(4, "0"),
    leverandoerId: LEV.service.id,
    leverandoernavn: LEV.service.navn,
    leverandoerCvr: LEV.service.cvr,
    fakturadato: "2026-08-" + String(Math.min(nr, 28)).padStart(2, "0"),
    forfaldsdato: "2026-09-" + String(Math.min(nr, 28)).padStart(2, "0"),
    nettoOere: 100000 + nr * 1000,
    momsOere: 25000,
    totalOere: 125000 + nr * 1000,
    valuta: "DKK",
    land: "DK",
    ordreOpgaveNumre: [],
    enhedsnumre: [],
    registreringsnumre: [],
    stelSerieNumre: [],
    enhedsnavne: [],
    kundereferencer: [],
    fakturalinjer: [],
    ...felter,
  }, { tenantId: DEMO_TENANT_ID, metode: "syntetisk-deterministisk", udlaestMs: DEMO_NU_MS });
}

function fakturaGrundlag(nr, aflæsning, match, ekstra = {}) {
  const data = aflæsning.original;
  const fordeling = match?.placering ? [{
    fordelingId: "fordeling-demo-" + nr,
    destinationId: match.placering.destinationId,
    modul: match.placering.modul,
    nettoOere: data.nettoOere,
    koststed: match.placering.koststeder[0] || null,
  }] : [];
  return {
    fakturaId: "faktura-demo-" + String(nr).padStart(2, "0"),
    tenantId: DEMO_TENANT_ID,
    fakturaart: data.fakturaart,
    fakturanummer: data.fakturanummer,
    leverandoerId: data.leverandoerId,
    leverandoernavn: data.leverandoernavn,
    leverandoerCvr: data.leverandoerCvr,
    nettoOere: data.nettoOere,
    momsOere: data.momsOere,
    totalOere: data.totalOere,
    valuta: data.valuta,
    kreditForFakturanummer: data.kreditForFakturanummer,
    fordeling,
    fordelinger: fordeling,
    kontrolstatus: match?.placering ? KONTROL_STATUS.tilKontrol : null,
    matchOprindelse: match?.oprindelse,
    låst: false,
    historik: [],
    dubletstatus: DUBLET_STATUS.ingen,
    uløsteAdvarsler: match?.advarsler || [],
    ...ekstra,
  };
}

function scenarie(nr, titel, beskrivelse, sektion, aflæsning, {
  sikkerhedsniveau = MATCHNIVEAU.balanceret,
  intakeEkstra = {},
  fakturaEkstra = {},
  visningsnote = null,
} = {}) {
  const match = matchFaktura({
    tenantId: DEMO_TENANT_ID,
    aflæsning,
    destinationer: DEMO_DESTINATIONER,
    sikkerhedsniveau,
  });
  return {
    nummer: nr,
    id: "scenarie-" + String(nr).padStart(2, "0"),
    titel,
    beskrivelse,
    sektion,
    intake: intake(nr, intakeEkstra),
    aflæsning,
    match,
    faktura: fakturaGrundlag(nr, aflæsning, match, fakturaEkstra),
    visningsnote,
  };
}

const s1 = scenarie(1, "Eksakt PROCURE-bestillingsnummer",
  "Den tokenafgrænsede reference finder én bestilling og placerer til kontrol.",
  INDBAKKE_SEKTION.kontrol,
  læs(1, {
    leverandoerId: LEV.komponent.id, leverandoernavn: LEV.komponent.navn,
    leverandoerCvr: LEV.komponent.cvr, ordreOpgaveNumre: ["PROCURE-DEMO-4001"],
    nettoOere: 150000, momsOere: 37500, totalOere: 187500,
  }));

const s2 = scenarie(2, "Eksakt fremtidig FLEET-reference",
  "Adapterkontrakten kan bære et fremtidigt Veyro-nummer uden at ændre FLEET.",
  INDBAKKE_SEKTION.kontrol,
  læs(2, {
    leverandoerId: LEV.komponent.id, leverandoernavn: LEV.komponent.navn,
    leverandoerCvr: LEV.komponent.cvr, ordreOpgaveNumre: ["FLEET-DEMO-2001"],
    nettoOere: 112500, momsOere: 28125, totalOere: 140625,
  }));

const s3 = scenarie(3, "Entydigt FLEET-match via enhed",
  "Balanceret match kræver eksakt enhed, samme leverandør og én åben opgave.",
  INDBAKKE_SEKTION.kontrol,
  læs(3, { enhedsnumre: ["enh 042"], nettoOere: 510000, momsOere: 127500, totalOere: 637500 }));

const s4 = scenarie(4, "FACILITY-match via serienummer og lokation",
  "Serienummeret identificerer demoaktivets eneste åbne fakturaopgave.",
  INDBAKKE_SEKTION.kontrol,
  læs(4, {
    leverandoerId: LEV.facility.id, leverandoernavn: LEV.facility.navn,
    leverandoerCvr: LEV.facility.cvr, stelSerieNumre: ["fac serie 0088"],
    kundereferencer: ["Demo Lokation Syd"], nettoOere: 275000, momsOere: 68750, totalOere: 343750,
  }));

const s5 = scenarie(5, "Leverandør med én åben opgave",
  "Uden reference eller enhed findes præcis én åben destination hos leverandøren.",
  INDBAKKE_SEKTION.kontrol,
  læs(5, {
    leverandoerId: LEV.eneste.id, leverandoernavn: LEV.eneste.navn,
    leverandoerCvr: LEV.eneste.cvr, nettoOere: 99000, momsOere: 24750, totalOere: 123750,
  }));

const s6 = scenarie(6, "Leverandør med tre åbne opgaver",
  "Tre kandidater vises på tværs af FLEET, FACILITY og PROCURE; intet vælges vilkårligt.",
  INDBAKKE_SEKTION.match,
  læs(6, {
    leverandoerId: LEV.multi.id, leverandoernavn: LEV.multi.navn,
    leverandoerCvr: LEV.multi.cvr, nettoOere: 305000, momsOere: 76250, totalOere: 381250,
  }));

const s7 = scenarie(7, "Dubleret internt enhedsnummer",
  "To syntetiske enheder deler nummeret; automatisk placering er blokeret.",
  INDBAKKE_SEKTION.behandling,
  læs(7, { enhedsnumre: ["DUP-007"], nettoOere: 215000, momsOere: 53750, totalOere: 268750 }));

const s8 = scenarie(8, "Enhed fundet uden åben opgave",
  "Enheden findes, men dens opgave er lukket for faktura og vises kun som kandidat.",
  INDBAKKE_SEKTION.behandling,
  læs(8, { enhedsnumre: ["ENH-099"], nettoOere: 180000, momsOere: 45000, totalOere: 225000 }));

const s9 = scenarie(9, "Ukendt leverandør",
  "Systemet opretter aldrig en leverandør automatisk.",
  INDBAKKE_SEKTION.behandling,
  læs(9, {
    leverandoerId: null, leverandoernavn: "Syntetisk Ukendt Leverandør",
    leverandoerCvr: "DEMO-CVR-UKENDT", nettoOere: 88000, momsOere: 22000, totalOere: 110000,
  }));

const s10 = scenarie(10, "Eksakt reference med anden leverandør",
  "Referencen vinder, men leverandørkonflikten kræver synlig manuel kontrol.",
  INDBAKKE_SEKTION.kontrol,
  læs(10, {
    leverandoerId: LEV.service.id, leverandoernavn: LEV.service.navn,
    leverandoerCvr: LEV.service.cvr, ordreOpgaveNumre: ["PROCURE-DEMO-4001"],
    nettoOere: 160000, momsOere: 40000, totalOere: 200000,
  }));

const s11 = scenarie(11, "Samlet match",
  "Hele nettobeløbet er fordelt til én FLEET-opgave.",
  INDBAKKE_SEKTION.kontrol,
  læs(11, { ordreOpgaveNumre: ["FLEET-DEMO-1001"], nettoOere: 480000, momsOere: 120000, totalOere: 600000 }));

const s12Aflæsning = læs(12, {
  leverandoerId: LEV.multi.id, leverandoernavn: LEV.multi.navn,
  leverandoerCvr: LEV.multi.cvr,
  ordreOpgaveNumre: ["FLEET-DEMO-MULTI", "PROCURE-DEMO-MULTI"],
  nettoOere: 620000, momsOere: 155000, totalOere: 775000,
});
const s12 = scenarie(12, "Opdelt mellem flere destinationer",
  "To eksakte referencer foreslår opdeling; én øre mangler bevidst i denne negative fixture.",
  INDBAKKE_SEKTION.match, s12Aflæsning, {
    fakturaEkstra: {
      fordelinger: [
        { fordelingId: "fordeling-12-a", destinationId: "fleet-opgave-multi", modul: MODUL.fleet, nettoOere: 300000 },
        { fordelingId: "fordeling-12-b", destinationId: "procure-ordre-multi", modul: MODUL.procure, nettoOere: 319999 },
      ],
      uløsteAdvarsler: [],
    },
  });

const s13 = scenarie(13, "Sen faktura til lukket opgave",
  "Den lukkede opgave kan ses, men fakturaen placeres ikke automatisk.",
  INDBAKKE_SEKTION.behandling,
  læs(13, { ordreOpgaveNumre: ["FLEET-DEMO-LUKKET"], nettoOere: 180000, momsOere: 45000, totalOere: 225000 }));

const s14 = scenarie(14, "Mistænkt dublet",
  "Filhash og fakturaidentitet holder posten til manuel kontrol; intet slettes.",
  INDBAKKE_SEKTION.behandling,
  læs(14, { ordreOpgaveNumre: ["FLEET-DEMO-1001"], nettoOere: 480000, momsOere: 120000, totalOere: 600000 }),
  {
    intakeEkstra: { status: INTAKE_STATUS.dublet, dubletstatus: DUBLET_STATUS.mistænkt },
    fakturaEkstra: { dubletstatus: DUBLET_STATUS.mistænkt },
  });

const s15 = scenarie(15, "Kreditnota",
  "Kreditnotaen foreslås koblet til originalen og modregnes først efter kontrol.",
  INDBAKKE_SEKTION.kontrol,
  læs(15, {
    fakturaart: FAKTURAART.kreditnota, fakturanummer: "DEMO-KREDIT-0015",
    kreditForFakturanummer: s11AflæsningNummer(),
    ordreOpgaveNumre: ["FLEET-DEMO-1001"], nettoOere: -30000, momsOere: -7500, totalOere: -37500,
  }));

function s11AflæsningNummer() {
  return s11.aflæsning.original.fakturanummer;
}

const s16 = scenarie(16, "Ulæselig fil",
  "Dokumentet bevares uden opdigtede felter og afventer manuel behandling.",
  INDBAKKE_SEKTION.behandling,
  læs(16, {
    fakturaart: FAKTURAART.ukendt, fakturanummer: null, leverandoerId: null,
    leverandoernavn: null, leverandoerCvr: null, nettoOere: null, momsOere: null, totalOere: null,
  }), {
    intakeEkstra: {
      dokumenttype: DOKUMENTTYPE.scannetPdf,
      originaltFilnavn: "syntetisk-scan-ulaeselig.pdf",
      status: INTAKE_STATUS.manuel,
      aflaesningsstatus: AFLAESNING_STATUS.ulæselig,
      fakturaId: null,
      fejlkoder: [TEKNISK_FEJLKODE.ulæselig],
    },
    fakturaEkstra: { ugyldigtDokument: true, fordelinger: [] },
  });

const s17MailbundleResultat = bygMailbundle({
  mailbundleId: "mailbundle-demo-17",
  tenantId: DEMO_TENANT_ID,
  kildeId: "demo-mail-id-17",
  filer: [
    { filId: "mailfil-demo-17-a", filnavn: "syntetisk-faktura-a.pdf" },
    { filId: "mailfil-demo-17-b", filnavn: "syntetisk-bilag-b.png" },
    { filId: "mailfil-demo-17-c", filnavn: "syntetisk-note-c.xml" },
  ],
});
if (!s17MailbundleResultat.ok) throw new Error("Ugyldig syntetisk mailbundle");

const s17Grund = scenarie(17, "Mail med flere fakturafiler",
  "Alle filer holdes samlet i én intake-sag, indtil brugeren fordeler dem.",
  INDBAKKE_SEKTION.behandling,
  læs(17, { leverandoerId: null, leverandoernavn: null, leverandoerCvr: null,
    nettoOere: null, momsOere: null, totalOere: null }), {
    intakeEkstra: {
      kilde: INTAKE_KILDE.veyroMail,
      kildeId: "demo-mail-id-17",
      status: INTAKE_STATUS.manuel,
      fakturaId: null,
      fejlkoder: [TEKNISK_FEJLKODE.flereMailfiler],
    },
    fakturaEkstra: { flereMailfilerUafklaret: true, fordelinger: [] },
    visningsnote: "3 syntetiske filer · ingen automatisk opdeling",
  });
const s17 = { ...s17Grund, mailbundle: s17MailbundleResultat.bundle };

const s18Grund = scenarie(18, "Kontrolleret og låst faktura",
  "Match, oplysninger og fuld fordeling er kontrolleret; posten tæller i statistikken.",
  INDBAKKE_SEKTION.kontrolleret,
  læs(18, { ordreOpgaveNumre: ["FLEET-DEMO-1001"], nettoOere: 480000, momsOere: 120000, totalOere: 600000 }));
const s18 = {
  ...s18Grund,
  faktura: {
    ...s18Grund.faktura,
    kontrolstatus: KONTROL_STATUS.kontrolleret,
    låst: true,
    uløsteAdvarsler: [],
    historik: [{ handling: "markeret-kontrolleret", brugerId: "demo-kontrollant", tidspunktMs: DEMO_NU_MS - 5000 }],
  },
};

const s19Grund = scenarie(19, "Genåbnet faktura med historik",
  "Genåbning bevarer tidligere kontrol og tilføjer bruger, tidspunkt og begrundelse.",
  INDBAKKE_SEKTION.match,
  læs(19, { ordreOpgaveNumre: ["FLEET-DEMO-1001"], nettoOere: 480000, momsOere: 120000, totalOere: 600000 }));
const s19 = {
  ...s19Grund,
  faktura: {
    ...s19Grund.faktura,
    kontrolstatus: KONTROL_STATUS.genaabnet,
    låst: false,
    uløsteAdvarsler: [],
    historik: [
      { handling: "markeret-kontrolleret", brugerId: "demo-kontrollant", tidspunktMs: DEMO_NU_MS - 10000 },
      { handling: "genaabnet", brugerId: "demo-supervisor", tidspunktMs: DEMO_NU_MS - 5000, begrundelse: "Syntetisk korrektion af reference" },
    ],
  },
};

const s20Grund = scenarie(20, "Massekontrol med blandet resultat",
  "Kun eksplicit markerede fakturaer behandles, og hver får sit eget resultat.",
  INDBAKKE_SEKTION.kontrol,
  læs(20, { ordreOpgaveNumre: ["FLEET-DEMO-1001"], nettoOere: 480000, momsOere: 120000, totalOere: 600000 }),
  { fakturaEkstra: { uløsteAdvarsler: [] }, visningsnote: "Demoen viser succes og afvisning pr. valgt post" });
const s20 = {
  ...s20Grund,
  masseEksempel: [
    { ...s20Grund.faktura, fakturaId: "faktura-demo-20-klar", fakturanummer: "DEMO-MASSE-KLAR" },
    { ...s14.faktura, fakturaId: "faktura-demo-20-afvist", fakturanummer: "DEMO-MASSE-AFVIST" },
  ],
};

/**
 * Opretter en ny browserlokal testsag fra en kendt fixture. Dette er bevidst
 * adskilt fra filvælgeren: ingen fil parses, og alle fakturaoplysninger er
 * markeret som syntetiske fixturedata.
 */
export function opretSyntetiskTestfaktura({ sekvens, modtagetMs } = {}) {
  if (!Number.isSafeInteger(sekvens) || sekvens < 1 || sekvens > 999999) {
    return { ok: false, fejl: "DEMO_SEQUENCE_INVALID", scenarie: null };
  }
  if (!Number.isSafeInteger(modtagetMs) || modtagetMs < 1) {
    return { ok: false, fejl: "DEMO_TIMESTAMP_INVALID", scenarie: null };
  }
  const suffix = String(sekvens).padStart(3, "0");
  const testsag = structuredClone(s1);
  const fakturaId = `faktura-lokal-test-${suffix}`;
  const fordeling = testsag.faktura.fordelinger.map((post, index) => ({
    ...post,
    fordelingId: `fordeling-lokal-test-${suffix}-${index + 1}`,
  }));
  testsag.id = `lokal-testscenarie-${suffix}`;
  testsag.nummer = 20 + sekvens;
  testsag.titel = `Indlæst syntetisk testfaktura ${suffix}`;
  testsag.beskrivelse = "Kendt lokal fixture med syntetisk aflæsning og automatisk placering.";
  testsag.sektion = INDBAKKE_SEKTION.indbakke;
  testsag.prototypeOprindelse = "syntetisk-testfixture";
  testsag.visningsnote = "Fixturedata · nulstilles ved genindlæsning";
  testsag.intake = {
    ...testsag.intake,
    intakeId: `intake-lokal-test-${suffix}`,
    kildeId: `syntetisk-fixture-${suffix}`,
    modtagetMs,
    fakturaId,
    original: {
      ...testsag.intake.original,
      filnavn: `syntetisk-testfaktura-${suffix}.pdf`,
      sha256: hash(String(sekvens % 10)),
    },
  };
  testsag.faktura = {
    ...testsag.faktura,
    fakturaId,
    fordeling,
    fordelinger: fordeling,
    historik: [],
    låst: false,
    kontrolstatus: KONTROL_STATUS.tilKontrol,
  };
  return { ok: true, fejl: null, scenarie: testsag };
}

export const DEMO_FAKTURACENTER_SCENARIER = Object.freeze([
  s1, s2, s3, s4, s5, s6, s7, s8, s9, s10,
  s11, s12, s13, s14, s15, s16, s17, s18, s19, s20,
]);

const demoVeyroResultat = bygVeyroMailKontrakt({
  tenantId: DEMO_TENANT_ID,
  routeId: "demo-route-tenant",
  kanaltype: INTAKE_KILDE.veyroMail,
  aktiveretMs: DEMO_NU_MS,
  registreredeAfsendere: ["faktura@syntetisk.invalid"],
  ukendtAfsender: "karantaene",
});
if (!demoVeyroResultat.ok) throw new Error("Ugyldig syntetisk Veyro-mailkontrakt");
export const DEMO_VEYRO_MAIL = demoVeyroResultat.kontrakt;

const demoMailboxResultat = bygMailboxKontrakt({
  tenantId: DEMO_TENANT_ID,
  routeId: "demo-mailbox-route",
  kanaltype: INTAKE_KILDE.mailbox,
  aktiveretMs: DEMO_NU_MS,
  mapper: ["Demo/Indgående fakturaer"],
});
if (!demoMailboxResultat.ok) throw new Error("Ugyldig syntetisk mailbox-kontrakt");
export const DEMO_MAILBOX = demoMailboxResultat.kontrakt;

export const DEMO_OPBEVARING = bygOpbevaringsKontrakt({
  land: "DK",
  dokumenttype: "faktura",
  minimumTilMs: Date.UTC(2031, 0, 1),
  valgtTilMs: Date.UTC(2032, 0, 1),
  juridiskSpærring: false,
});

export const DEMO_KONTROLREGLER = Object.freeze([
  {
    id: "regel-demo-leverandoer",
    prioritet: 1,
    leverandoerId: LEV.multi.id,
    kontrollanter: ["rolle:demo-fakturakontrollant"],
    antalKontrollanter: 2,
  },
  {
    id: "regel-demo-standard",
    prioritet: 2,
    modul: null,
    kontrollanter: ["rolle:demo-fakturakontrollant"],
    antalKontrollanter: 1,
  },
]);

export const DEMO_KOMMENDE_OPGAVER = Object.freeze({
  menuTæller: 8,
  mineOpgaver: 3,
  frist: "Tidligste af arbejdsdage og fakturafrist",
  mail: "Deaktiveret i lokal prototype",
  viserFølsommeFelterUdenDokumentadgang: false,
});

selvkontrol("demo-fakturacenter-intake", () => {
  const ids = new Set(DEMO_FAKTURACENTER_SCENARIER.map((s) => s.id));
  if (ids.size !== 20 || DEMO_FAKTURACENTER_SCENARIER.length !== 20) {
    console.warn("demo-fakturacenter-intake: De 20 scenarier er ikke entydige.");
  }
  const destinationsIds = new Set(DEMO_DESTINATIONER.map((d) => d.destinationId));
  const ukendte = DEMO_FAKTURACENTER_SCENARIER
    .flatMap((s) => s.match.kandidater)
    .filter((d) => !destinationsIds.has(d.destinationId));
  if (ukendte.length) {
    console.warn("demo-fakturacenter-intake: Et matchforslag mangler i adapterdatasættet.");
  }
});
