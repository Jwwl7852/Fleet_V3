import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADRESSESTATUS, DUBLETBESLUTNING, DUBLETTYPE, IMPORTGRAENSER, IMPORTKILDE,
  INTAKESTATUS, INPUTKODE, STOPTYPE, afvisOpgave, annullerImportbatch,
  beslutDublet, findDubletter, foreslaaKolonnemapping, genaabnOpgave,
  godkendImportbatch, godkendOpgave, mapRaekke, normaliserDato,
  normaliserVarighed, opretImportbatch, opretIntakeOpgave,
  opretOpgaveFraImportRaekke, parseCsv, parseIndsatTabel, sendTilDagsplan,
} from "../../src/fleet/planning-input/index.js";
import { opretDemoIntakeData } from "../../src/fleet/planning-input/demo-planning-input.js";
import { validerOpgave } from "../../src/fleet/planning-basic.js";

const nu = Date.UTC(2032, 4, 17, 14, 30);
const id = (() => { let n = 0; return (prefix) => `${prefix}-${++n}`; })();
const basis = (overrides = {}) => ({
  eksternReference: "DEMO-1", navn: "Fiktiv opgave", kunde: "Demo-modtager",
  stop: [{ stoptype: STOPTYPE.LEVERING, navn: "Fiktivt stop", adresse: "Testvej 1", postnummer: "0000", by: "Demoby", land: "DK", adressestatus: ADRESSESTATUS.UKONTROLLERET, dato: "18-05-2032", tidsform: "Tidsvindue", vindueFra: "09:00", vindueTil: "10:00", varighed: "30 min" }],
  ...overrides,
});
const opret = (data = basis(), ekstra = {}) => opretIntakeOpgave(data, { tenantRef: "tenant-fiktiv", kilde: IMPORTKILDE.MANUEL, importeretMs: nu, idGenerator: id, kendteRessourcer: [{ id: "med-1" }], ...ekstra });
const harKode = (svar, kode) => svar.fund?.some((post) => post.kode === kode) || svar.valideringsfund?.some((post) => post.kode === kode);

describe("CSV- og tabelparser", () => {
  it("læser komma, semikolon og tabulator", () => {
    for (const skilletegn of [",", ";", "\t"]) {
      const svar = parseCsv(`A${skilletegn}B\n1${skilletegn}2`);
      assert.equal(svar.ok, true);
      assert.deepEqual(svar.overskrifter, ["A", "B"]);
      assert.equal(svar.raekker[0].celler[1].vaerdi, "2");
    }
  });

  it("læser BOM, LF og CRLF", () => {
    assert.equal(parseCsv("\uFEFFA;B\r\n1;2\r\n").raekker.length, 1);
    assert.equal(parseCsv("A,B\n1,2\n").raekker.length, 1);
  });

  it("bevarer skilletegn, linjeskift, dobbelte anførselstegn og tomme felter i citerede værdier", () => {
    const svar = parseCsv('A;B;C;D\r\n"x;y";"linje 1\nlinje 2";"han sagde ""ja""";');
    assert.equal(svar.ok, true);
    assert.deepEqual(svar.raekker[0].celler.map((celle) => celle.vaerdi), ["x;y", "linje 1\nlinje 2", 'han sagde "ja"', ""]);
  });

  it("bevarer ukendte kolonner og foreslår mapping efter navn", () => {
    const svar = parseCsv("Task name;Customer;Ukendt\nDemo;Modtager;bevar mig");
    const mapping = foreslaaKolonnemapping(svar.overskrifter);
    assert.equal(mapping.navn, "Task name");
    assert.equal(mapping.kunde, "Customer");
    assert.equal(mapRaekke(svar.raekker[0], mapping).navn, "Demo");
    assert.equal(svar.raekker[0].celler[2].vaerdi, "bevar mig");
  });

  it("genbruger parserflowet til Excel- og Sheets-indsæt", () => {
    const svar = parseIndsatTabel("Task name\tDuration\nDemo\t00:30");
    assert.equal(svar.skilletegn, "\t");
    assert.equal(svar.raekker[0].celler[1].vaerdi, "00:30");
  });

  it("afviser xlsx med vejledning", () => {
    const svar = parseCsv("binært", { filnavn: "demo.xlsx" });
    assert.equal(harKode(svar, INPUTKODE.FILTYPE_XLSX), true);
    assert.match(svar.fund[0].tekst, /Gem filen som CSV/);
  });

  it("håndhæver fil-, række- og feltgrænser og ødelagte citater", () => {
    assert.equal(harKode(parseCsv("A\n123", { maksBytes: 2 }), INPUTKODE.FIL_FOR_STOR), true);
    assert.equal(harKode(parseCsv("A\n1\n2", { maksRaekker: 1 }), INPUTKODE.FOR_MANGE_RAEKKER), true);
    assert.equal(harKode(parseCsv("A\n1234", { maksFeltlaengde: 3 }), INPUTKODE.FELT_FOR_LANGT), true);
    assert.equal(harKode(parseCsv('A\n"uafsluttet'), INPUTKODE.CSV_UAFSLUTTET_CITAT), true);
    assert.equal(IMPORTGRAENSER.MAKS_BYTES, 5 * 1024 * 1024);
    assert.equal(IMPORTGRAENSER.MAKS_RAEKKER, 10000);
  });
});

describe("Normalisering og intake", () => {
  it("læser danske og ISO-datoer deterministisk", () => {
    assert.equal(normaliserDato("18.05.2032"), "2032-05-18");
    assert.equal(normaliserDato("2032-05-18"), "2032-05-18");
    assert.equal(normaliserDato("31-02-2032"), null);
  });

  it("normaliserer 30, 30 min, 00:30 og 1:15 til positive hele minutter", () => {
    assert.deepEqual(["30", "30 min", "00:30", "1:15"].map((v) => normaliserVarighed(v).minutter), [30, 30, 30, 75]);
    assert.equal(normaliserVarighed("0").kode, INPUTKODE.VARIGHED_UGYLDIG);
    assert.equal(normaliserVarighed("").kode, INPUTKODE.VARIGHED_MANGLER);
  });

  it("bruger samme normalisering ved manuel oprettelse og import", () => {
    const manuel = opret();
    const parser = parseCsv("Opgavenavn;Kunde;Adresse;Land;Dato;Tidsform;Tidsvindue fra;Tidsvindue til;Varighed;Stoptype\nFiktiv opgave;Demo-modtager;Testvej 1;DK;18-05-2032;Tidsvindue;09:00;10:00;30 min;LEVERING");
    const mapping = foreslaaKolonnemapping(parser.overskrifter);
    const importeret = opretOpgaveFraImportRaekke(parser.raekker[0], mapping, { tenantRef: "tenant-fiktiv", kilde: IMPORTKILDE.CSV, importeretMs: nu, idGenerator: id });
    assert.equal(manuel.stop[0].estimeretVarighedMin, importeret.stop[0].estimeretVarighedMin);
    assert.deepEqual(manuel.stop[0].tidskrav, importeret.stop[0].tidskrav);
  });

  it("bevarer flere stop, kilde, rå værdier og adresse-land uden at foregive geokodning", () => {
    const data = basis({ stop: [basis().stop[0], { ...basis().stop[0], stoptype: STOPTYPE.AFHENTNING, land: "SE", adressestatus: ADRESSESTATUS.GEOKODET }] });
    const svar = opret(data, { kilde: IMPORTKILDE.CSV, batchId: "batch-1", filnavn: "C:\\syntetisk\\demo.csv", raekkenummer: 7 });
    assert.equal(svar.stop.length, 2);
    assert.equal(svar.stop[1].lokation.land, "SE");
    assert.equal(svar.stop[1].lokation.status, ADRESSESTATUS.UKONTROLLERET);
    assert.equal(svar.kildeMetadata.filnavn, "demo.csv");
    assert.equal(svar.kildeMetadata.raekkenummer, 7);
    assert.ok(svar.raavaerdier);
  });

  it("gemmer ufuldstændig opgave til kontrol og ukendt ressource som hårdt fund", () => {
    const svar = opret(basis({ medarbejderRef: "ukendt", stop: [{ ...basis().stop[0], varighed: "" }] }));
    assert.equal(svar.status, INTAKESTATUS.KRAEVER_KONTROL);
    assert.equal(harKode(svar, INPUTKODE.VARIGHED_MANGLER), true);
    assert.equal(harKode(svar, INPUTKODE.RESSOURCE_UKENDT), true);
  });

  it("afviser manglende navn, manglende stop og ukendt prioritet før godkendelse", () => {
    assert.equal(harKode(opret(basis({ navn: "" })), INPUTKODE.OPGAVENAVN_MANGLER), true);
    assert.equal(harKode(opret(basis({ stop: [] })), INPUTKODE.STOP_MANGLER), true);
    assert.equal(harKode(opret(basis({ prioritet: "ukendt" })), INPUTKODE.PRIORITET_UGYLDIG), true);
  });

  it("slår mappet udførelsesskabelon op og afviser ukendte eller løse krav", () => {
    const demo = opretDemoIntakeData();
    const parser = parseCsv("Opgavenavn;Kunde;Adresse;Land;Dato;Tidsform;Varighed;Stoptype;Udførelsesskabelon;Underskrift\nFiktiv opgave;Demo-modtager;Testvej 1;DK;18-05-2032;Frit tidspunkt;30 min;LEVERING;Fiktiv levering med kvittering;ja");
    const mapping = foreslaaKolonnemapping(parser.overskrifter);
    const kendt = opretOpgaveFraImportRaekke(parser.raekker[0], mapping, { tenantRef: "tenant-fiktiv", kilde: IMPORTKILDE.CSV, importeretMs: nu, idGenerator: id, udfoerelsesskabeloner: demo.skabeloner, materialer: demo.materialer });
    assert.equal(kendt.udfoerelsessnapshot.skabelonId, demo.skabeloner[0].id);
    assert.equal(kendt.importeredeUdfoerelsesvalg.underskrift, true);
    const ukendt = opretOpgaveFraImportRaekke(parser.raekker[0], mapping, { tenantRef: "tenant-fiktiv", kilde: IMPORTKILDE.CSV, importeretMs: nu, idGenerator: id });
    assert.equal(harKode(ukendt, INPUTKODE.UDFOERELSESSKABELON_UKENDT), true);
    assert.equal(ukendt.status, INTAKESTATUS.KRAEVER_KONTROL);
  });
});

describe("Dubletter, batch og dagsplanspulje", () => {
  it("skelner sikker dublet fra mulig dublet pr. tenant", () => {
    const eksisterende = opret();
    const sikker = opret(basis({ eksternReference: eksisterende.eksternReference }));
    const mulig = opret(basis({ eksternReference: "ANDEN" }));
    const andenTenant = opretIntakeOpgave(basis({ eksternReference: eksisterende.eksternReference }), { tenantRef: "tenant-anden", kilde: IMPORTKILDE.MANUEL, importeretMs: nu, idGenerator: id });
    const svar = findDubletter([sikker, mulig, andenTenant], [eksisterende]);
    assert.equal(svar[0].dublet.type, DUBLETTYPE.SIKKER);
    assert.equal(svar[1].dublet.type, DUBLETTYPE.MULIG);
    assert.equal(svar[2].dublet.type, DUBLETTYPE.INGEN);
  });

  it("kræver eksplicit dubletvalg og understøtter alle fire beslutninger uden tavs overskrivning", () => {
    const dublet = { ...opret(), dublet: { type: DUBLETTYPE.SIKKER, beslutning: null, eksisterendeId: "eks-1" } };
    assert.equal(godkendOpgave(dublet, { tidspunktMs: nu }).status, INTAKESTATUS.KRAEVER_KONTROL);
    for (const beslutning of Object.values(DUBLETBESLUTNING)) assert.equal(beslutDublet(dublet, beslutning).dublet.beslutning, beslutning);
    assert.equal(godkendOpgave(beslutDublet(dublet, DUBLETBESLUTNING.SPRING_OVER), { tidspunktMs: nu }).status, INTAKESTATUS.AFVIST);
    assert.equal(godkendOpgave(beslutDublet(dublet, DUBLETBESLUTNING.OPRET_ALLIGEVEL), { tidspunktMs: nu }).status, INTAKESTATUS.KLAR_TIL_PLANLAEGNING);
  });

  it("godkender gyldige rækker delvist og lader ugyldige blive til kontrol", () => {
    const gyldig = opret();
    const ugyldig = opret(basis({ stop: [{ ...basis().stop[0], varighed: "" }] }));
    const batch = opretImportbatch({ id: "batch", kilde: IMPORTKILDE.CSV, importeretMs: nu, mapping: {}, parserResultat: { fund: [] }, opgaver: [gyldig, ugyldig] });
    const godkendt = godkendImportbatch(batch, [gyldig.id, ugyldig.id], { tidspunktMs: nu });
    assert.equal(godkendt.opgaver[0].status, INTAKESTATUS.KLAR_TIL_PLANLAEGNING);
    assert.equal(godkendt.opgaver[1].status, INTAKESTATUS.KRAEVER_KONTROL);
    assert.equal(godkendt.opgaver.length, 2);
    assert.deepEqual(annullerImportbatch(godkendt).opgaver, batch.oprindeligtSnapshot);
  });

  it("afviser og genåbner uden at miste data", () => {
    const oprindelig = opret();
    const afvist = afvisOpgave(oprindelig, "Fiktiv kontrol");
    const genaabnet = genaabnOpgave(afvist);
    assert.equal(afvist.status, INTAKESTATUS.AFVIST);
    assert.equal(genaabnet.status, INTAKESTATUS.MODTAGET);
    assert.equal(genaabnet.stop.length, oprindelig.stop.length);
  });

  it("sender kun godkendte opgaver til lokal planlægningspulje uden tildeling eller optimering", () => {
    const modtaget = opret();
    assert.equal(sendTilDagsplan(modtaget, []).ok, false);
    const klar = godkendOpgave(modtaget, { tidspunktMs: nu });
    const svar = sendTilDagsplan(klar, []);
    assert.equal(svar.ok, true);
    assert.equal(svar.planlaegningspulje.length, 1);
    assert.deepEqual(svar.opgave.tildeling, { medarbejderRef: null, koeretoejRef: null });
    assert.equal(svar.opgave.ruteId, null);
    assert.equal(svar.opgave.stop[0].estimeretVarighedMin, 30);
    assert.equal(validerOpgave(svar.opgave).ok, true);
  });

  it("leverer mindst 30 tydeligt syntetiske importopgaver med fejl og dubletter", () => {
    const demo = opretDemoIntakeData();
    assert.equal(demo.opgaver.length, 30);
    assert.ok(demo.opgaver.every((opgave) => /fiktiv|demo/i.test(`${opgave.navn} ${opgave.kunde}`)));
    assert.ok(demo.opgaver.filter((opgave) => opgave.valideringsfund.length).length >= 5);
    assert.ok(demo.opgaver.filter((opgave) => opgave.dublet.type === DUBLETTYPE.MULIG).length >= 3);
    assert.equal(demo.opgaver.filter((opgave) => opgave.dublet.type === DUBLETTYPE.SIKKER).length, 1);
    assert.ok(demo.opgaver.some((opgave) => {
      const typer = new Set(opgave.stop.map((stop) => stop.type));
      return typer.has(STOPTYPE.AFHENTNING) && typer.has(STOPTYPE.LEVERING);
    }));
    assert.ok(demo.materialer.length >= 6);
    assert.doesNotMatch(JSON.stringify(demo), /@(?!(?:[^" ]*\.invalid))/i);
  });
});
