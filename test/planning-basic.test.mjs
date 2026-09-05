import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AARSAGSKODE, ADRESSESTATUS, AFHAENGIGHEDSART, DAGSPLANSTATUS, FELTKLASSIFIKATION,
  FOREKOMSTSTATUS, KILDE, OPGAVESTATUS, REFERENCEART, REGELNIVEAU,
  RUTESTATUS, TIDSFORM, anvendKontrolleredeUndtagelser,
  kontrollerKompetencerOgCertifikater, kontrollerKoeretoejstypeOgKapacitet,
  kontrollerInterneTidskonflikter, kontrollerTilgaengelighed,
  planningReference, referenceNoegle, resultat,
  validerAfhaengigheder, validerDagsplan, validerKlassificeretFelt,
  validerKontinuitet, validerRute, validerSnapshot, validerTidskrav,
  validerTypedReference,
} from "../src/fleet/planning-basic.js";
import {
  DEMO_BEREGNING_MS, DEMO_DAGSPLAN, DEMO_PLANNING_BASIC,
  DEMO_PLANNING_DEPOTER, DEMO_PLANNING_OPGAVER, DEMO_TIDSZONE,
  opretDemoPlanningBasic,
} from "../src/fleet/demo-planning-basic.js";

const kode = (svar, forventet) => svar.fund.some((f) => f.kode === forventet);
const pRef = (art, id) => planningReference(art, id);
const start = Date.UTC(2032, 4, 18, 6);

function minimalOpgave(id = "opg-test") {
  return {
    id, reference: pRef(REFERENCEART.OPGAVE, id), titel: "Syntetisk testopgave",
    lokationRef: pRef(REFERENCEART.LOKATION, "lok-test"), varighedMin: 30,
    prioritet: "normal", tidskrav: { art: TIDSFORM.FRI }, status: OPGAVESTATUS.AKTIV,
    krav: { kompetencer: [], certifikater: [], udstyrRefs: [], koeretoej: { paakraevet: false, typer: [], kapacitet: {} } },
    afhaengigheder: [], gentagelse: null, kontinuitet: null,
  };
}

describe("Planning Basic-domænet", () => {
  it("har adskilte livscyklusser for opgave, forekomst, rute og dagsplan", () => {
    assert.equal(OPGAVESTATUS.AKTIV, "aktiv");
    assert.equal(FOREKOMSTSTATUS.IKKE_PLANLAGT, "ikkePlanlagt");
    assert.equal(RUTESTATUS.FRIGIVET, "frigivet");
    assert.equal(DAGSPLANSTATUS.KLAR, "klar");
    assert.notDeepEqual(Object.values(OPGAVESTATUS), Object.values(RUTESTATUS));
  });

  it("validerer typed references og den forventede art", () => {
    const ref = { kilde: KILDE.FLEET, art: REFERENCEART.KOERETOEJ, id: "bil-1" };
    assert.equal(referenceNoegle(ref), "fleet:koeretoej:bil-1");
    assert.equal(validerTypedReference(ref, { forventetArt: REFERENCEART.KOERETOEJ }).ok, true);
    assert.equal(kode(validerTypedReference(ref, { forventetArt: REFERENCEART.MEDARBEJDER }), AARSAGSKODE.REFERENCE_ART_FORKERT), true);
    assert.equal(kode(validerTypedReference({ ...ref, kilde: "ukendt" }), AARSAGSKODE.REFERENCE_KILDE_UKENDT), true);
  });

  it("accepterer Planning-ejede og eksterne objekter i samme snapshot", () => {
    const kilder = new Set(DEMO_PLANNING_BASIC.ressourcer.map((r) => r.reference.kilde));
    assert.deepEqual([...kilder].sort(), [KILDE.FLEET, KILDE.PLANNING, KILDE.WORKFORCE].sort());
    for (const r of DEMO_PLANNING_BASIC.ressourcer) assert.equal(r.ejerKilde, r.reference.kilde);
  });
});

describe("Tid, dagsplan og rutestop", () => {
  it("accepterer de fire tidsformer enkeltvis", () => {
    const former = [
      { art: TIDSFORM.FAST, startMs: start },
      { art: TIDSFORM.VINDUE, fraMs: start, tilMs: start + 3600000 },
      { art: TIDSFORM.DEADLINE, deadlineMs: start + 3600000 },
      { art: TIDSFORM.FRI },
    ];
    for (const tidskrav of former) assert.equal(validerTidskrav(tidskrav, { varighedMin: 30 }).ok, true);
  });

  it("afviser modstridende tidsformer", () => {
    const svar = validerTidskrav({ art: TIDSFORM.FAST, startMs: start, deadlineMs: start + 1 }, { varighedMin: 30 });
    assert.equal(kode(svar, AARSAGSKODE.TID_MODSTRIDENDE_FELTER), true);
  });

  it("kræver gyldig IANA-tidszone og positiv version", () => {
    assert.equal(DEMO_TIDSZONE, "Europe/Copenhagen");
    assert.equal(validerDagsplan(DEMO_DAGSPLAN, { snapshot: DEMO_PLANNING_BASIC, beregningMs: DEMO_BEREGNING_MS }).ok, true);
    assert.equal(kode(validerDagsplan({ ...DEMO_DAGSPLAN, tidszone: "Mars/Olympus" }, { beregningMs: DEMO_BEREGNING_MS }), AARSAGSKODE.TIDSZONE_UGYLDIG), true);
    assert.equal(kode(validerDagsplan({ ...DEMO_DAGSPLAN, version: 0 }, { beregningMs: DEMO_BEREGNING_MS }), AARSAGSKODE.VERSION_UGYLDIG), true);
  });

  it("opdager stop uden for rutens ydre interval", () => {
    const rute = structuredClone(DEMO_DAGSPLAN.ruter[0]);
    rute.stop[0].fraMs = rute.fraMs - 1;
    assert.equal(kode(validerRute(rute, { snapshot: DEMO_PLANNING_BASIC }), AARSAGSKODE.STOP_UDEN_FOR_RUTE), true);
  });

  it("tillader kladde med kandidatteam, men kræver konkret medarbejder ved frigivelse", () => {
    const kladde = DEMO_DAGSPLAN.ruter.find((r) => r.id === "pb-rute-002");
    assert.equal(kladde.medarbejderRefs.length, 0);
    assert.equal(validerRute(kladde, { snapshot: DEMO_PLANNING_BASIC }).ok, true);
    assert.equal(kode(validerRute({ ...kladde, status: RUTESTATUS.FRIGIVET }), AARSAGSKODE.FRIGIVET_RUTE_UDEN_MEDARBEJDER), true);
  });

  it("tillader en gyldig rute uden køretøj", () => {
    const rute = DEMO_DAGSPLAN.ruter.find((r) => r.id === "pb-rute-003");
    assert.deepEqual(rute.koeretoejRefs, []);
    assert.equal(validerRute(rute, { snapshot: DEMO_PLANNING_BASIC }).ok, true);
  });

  it("opdager ukendte forekomster og dobbelttildeling på tværs af ruter", () => {
    const snapshot = opretDemoPlanningBasic();
    const dagsplan = snapshot.dagsplaner[0];
    dagsplan.ruter[1].stop = [{ ...dagsplan.ruter[0].stop[0], id: "dublet-stop", raekkefoelge: 1 }];
    assert.equal(kode(validerDagsplan(dagsplan, { snapshot, beregningMs: DEMO_BEREGNING_MS }), AARSAGSKODE.FOREKOMST_DUBLET_TILDELING), true);
    dagsplan.ruter[1].stop[0].opgaveforekomstId = "ukendt-forekomst";
    assert.equal(kode(validerDagsplan(dagsplan, { snapshot, beregningMs: DEMO_BEREGNING_MS }), AARSAGSKODE.FOREKOMST_UKENDT), true);
  });

  it("finder interne ressourcekonflikter, men accepterer halvåbne nabointervaller", () => {
    const dagsplan = structuredClone(DEMO_DAGSPLAN);
    const ref = dagsplan.ruter[0].ressourcebrug[0].ressourceRef;
    dagsplan.ruter[1].ressourcebrug = [{ id: "nabo", ressourceRef: ref, fraMs: dagsplan.ruter[0].ressourcebrug[0].tilMs, tilMs: dagsplan.ruter[0].ressourcebrug[0].tilMs + 60000 }];
    assert.equal(kontrollerInterneTidskonflikter(dagsplan).ok, true);
    dagsplan.ruter[1].ressourcebrug[0].fraMs -= 1;
    assert.equal(kode(kontrollerInterneTidskonflikter(dagsplan), AARSAGSKODE.INTERN_TIDSKONFLIKT), true);
  });

  it("bruger ikke den aktuelle systemtid", () => {
    const oprindelig = Date.now;
    Date.now = () => { throw new Error("Date.now må ikke bruges"); };
    try {
      assert.equal(validerSnapshot(DEMO_PLANNING_BASIC, { beregningMs: DEMO_BEREGNING_MS }).ok, true);
    } finally {
      Date.now = oprindelig;
    }
  });
});

describe("Normaliserede ressourcefakta", () => {
  const medarbejder = {
    reference: { kilde: KILDE.WORKFORCE, art: REFERENCEART.MEDARBEJDER, id: "med-1" },
    kompetencer: ["basis"], certifikater: [{ kode: "medicin", udloeberMs: DEMO_BEREGNING_MS - 1 }],
    tilgaengelighed: { vagter: [{ fraMs: start, tilMs: start + 8 * 3600000 }], fravaer: [] },
  };

  it("opdager manglende kompetence og udløbet certifikat", () => {
    const opgave = minimalOpgave();
    opgave.krav.kompetencer = ["speciale"];
    opgave.krav.certifikater = ["medicin"];
    const svar = kontrollerKompetencerOgCertifikater(opgave, [medarbejder], DEMO_BEREGNING_MS);
    assert.equal(kode(svar, AARSAGSKODE.KOMPETENCE_MANGLER), true);
    assert.equal(kode(svar, AARSAGSKODE.CERTIFIKAT_UDLOEBET), true);
  });

  it("opdager arbejde uden for vagt og fravær", () => {
    const udenfor = kontrollerTilgaengelighed([medarbejder], start - 3600000, start);
    assert.equal(kode(udenfor, AARSAGSKODE.UDEN_FOR_VAGT), true);
    const fravaerende = structuredClone(medarbejder);
    fravaerende.tilgaengelighed.fravaer = [{ id: "f-1", fraMs: start + 1, tilMs: start + 1000 }];
    assert.equal(kode(kontrollerTilgaengelighed([fravaerende], start, start + 500), AARSAGSKODE.FRAVAER_OVERLAP), true);
  });

  it("opdager forkert køretøjstype og utilstrækkelig kapacitet", () => {
    const opgave = minimalOpgave();
    opgave.krav.koeretoej = { paakraevet: true, typer: ["varevogn"], kapacitet: { kg: 500 } };
    const bil = { koeretoej: { type: "personbil", kapacitet: { kg: 100 } } };
    const svar = kontrollerKoeretoejstypeOgKapacitet(opgave, [bil]);
    assert.equal(kode(svar, AARSAGSKODE.KOERETOEJSTYPE_FORKERT), true);
    assert.equal(kode(svar, AARSAGSKODE.KOERETOEJSKAPACITET_UTILSTRAEKKELIG), true);
  });

  it("accepterer en opgave uden køretøjskrav uden køretøj", () => {
    assert.equal(kontrollerKoeretoejstypeOgKapacitet(minimalOpgave(), []).ok, true);
  });
});

describe("Afhængigheder og kontinuitet", () => {
  it("opdager ukendt reference, selvreference med den aftalte kode og cyklus", () => {
    const a = minimalOpgave("a");
    const b = minimalOpgave("b");
    a.afhaengigheder = [{ art: AFHAENGIGHEDSART.EFTER, opgaveRef: pRef(REFERENCEART.OPGAVE, "mangler") }];
    assert.equal(kode(validerAfhaengigheder([a, b]), AARSAGSKODE.AFHAENGIGHED_UKENDT), true);
    a.afhaengigheder = [{ art: AFHAENGIGHEDSART.EFTER, opgaveRef: a.reference }];
    assert.equal(kode(validerAfhaengigheder([a]), AARSAGSKODE.AFHAENGIGHED_SELREFERENCE), true);
    assert.equal(AARSAGSKODE.AFHAENGIGHED_SELREFERENCE, "AFHAENGIGHED_SELREFERENCE");
    a.afhaengigheder = [{ art: AFHAENGIGHEDSART.EFTER, opgaveRef: b.reference }];
    b.afhaengigheder = [{ art: AFHAENGIGHEDSART.EFTER, opgaveRef: a.reference }];
    assert.equal(kode(validerAfhaengigheder([a, b]), AARSAGSKODE.AFHAENGIGHED_CYKLUS), true);
  });

  it("accepterer en gyldig afhængighedskæde", () => {
    const a = minimalOpgave("a");
    const b = minimalOpgave("b");
    b.afhaengigheder = [{ art: AFHAENGIGHEDSART.EFTER, opgaveRef: a.reference }];
    assert.equal(validerAfhaengigheder([a, b]).ok, true);
  });

  it("behandler samme-medarbejder som en relation og ikke en tidsmæssig cyklus", () => {
    const a = minimalOpgave("a");
    const b = minimalOpgave("b");
    a.afhaengigheder = [{ art: AFHAENGIGHEDSART.SAMME_MEDARBEJDER, opgaveRef: b.reference, niveau: REGELNIVEAU.HARD }];
    b.afhaengigheder = [{ art: AFHAENGIGHEDSART.SAMME_MEDARBEJDER, opgaveRef: a.reference, niveau: REGELNIVEAU.HARD }];
    assert.equal(validerAfhaengigheder([a, b]).ok, true);
  });

  it("behandler HARD-kontinuitet som stop og PREFERENCE som ikke-blokerende", () => {
    const snapshot = opretDemoPlanningBasic();
    const opgave5 = snapshot.opgaver.find((o) => o.id === "pb-opg-005");
    const opgave6 = snapshot.opgaver.find((o) => o.id === "pb-opg-006");
    const opgave9 = snapshot.opgaver.find((o) => o.id === "pb-opg-009");
    opgave9.kontinuitet = { noegle: opgave5.kontinuitet.noegle, niveau: REGELNIVEAU.HARD };
    let svar = validerKontinuitet(snapshot.dagsplaner[0], snapshot);
    assert.equal(kode(svar, AARSAGSKODE.KONTINUITET_BRUD), true);
    assert.equal(svar.ok, false);
    opgave5.kontinuitet.niveau = REGELNIVEAU.PREFERENCE;
    opgave6.kontinuitet.niveau = REGELNIVEAU.PREFERENCE;
    opgave9.kontinuitet.niveau = REGELNIVEAU.PREFERENCE;
    svar = validerKontinuitet(snapshot.dagsplaner[0], snapshot);
    assert.equal(kode(svar, AARSAGSKODE.KONTINUITET_BRUD), true);
    assert.equal(svar.ok, true);
  });
});

describe("Feltklassifikation og kontrollerede undtagelser", () => {
  it("kræver klassifikation, synlighedsmetadata og én værdikilde", () => {
    assert.equal(validerKlassificeretFelt({ noegle: "telefon", vaerdi: "0000" }).ok, false);
    assert.equal(validerKlassificeretFelt({ noegle: "telefon", vaerdi: "0000", klassifikation: FELTKLASSIFIKATION.FORTROLIG, synlighed: { roller: ["planlaegger"] } }).ok, true);
  });

  it("afviser uklassificerede kontakt- og adgangsfelter", () => {
    const snapshot = opretDemoPlanningBasic();
    snapshot.kunder[0].telefon = "fiktiv";
    snapshot.lokationer[0].adgangsnote = "fiktiv";
    const svar = validerSnapshot(snapshot, { beregningMs: DEMO_BEREGNING_MS });
    assert.equal(svar.fund.filter((f) => f.kode === AARSAGSKODE.KLASSIFIKATION_MANGLER).length >= 2, true);
  });

  it("kan godkende CONTROLLED_EXCEPTION med fuld domænebeslutning", () => {
    const oprindeligt = resultat([{ kode: "DEMO", tekst: "Kontrolleret fund", niveau: REGELNIVEAU.CONTROLLED_EXCEPTION, sti: "demo", objektId: "x", reference: "DEMO:x:demo" }]);
    const svar = anvendKontrolleredeUndtagelser(oprindeligt, [{
      id: "und-1", fundReference: "DEMO:x:demo", begrundelse: "Godkendt syntetisk afvigelse",
      godkendtAf: { rolle: "planlaegger" }, godkendtMs: DEMO_BEREGNING_MS,
      korrelationsId: "korrelation-demo-1",
    }]);
    assert.equal(svar.ok, true);
    assert.equal(svar.godkendteUndtagelser.length, 1);
  });

  it("tillader aldrig at et HARD-fund godkendes", () => {
    const oprindeligt = resultat([{ kode: "HARD", tekst: "Hard", niveau: REGELNIVEAU.HARD, sti: "demo", objektId: "x", reference: "HARD:x:demo" }]);
    const svar = anvendKontrolleredeUndtagelser(oprindeligt, [{ id: "und-2", fundReference: "HARD:x:demo", begrundelse: "Må ikke virke", godkendtAf: { rolle: "planlaegger" }, godkendtMs: DEMO_BEREGNING_MS, korrelationsId: "korrelation-demo-2" }]);
    assert.equal(svar.ok, false);
    assert.equal(kode(svar, AARSAGSKODE.HARD_KAN_IKKE_UNDTAGES), true);
  });
});

describe("Det syntetiske datasæt", () => {
  it("er samlet gyldigt, deterministisk og har de aftalte mængder", () => {
    assert.equal(validerSnapshot(DEMO_PLANNING_BASIC, { beregningMs: DEMO_BEREGNING_MS }).ok, true);
    assert.deepEqual(opretDemoPlanningBasic(), opretDemoPlanningBasic());
    assert.equal(DEMO_PLANNING_OPGAVER.length, 26);
    assert.equal(DEMO_PLANNING_BASIC.ressourcer.filter((r) => r.reference.art === REFERENCEART.MEDARBEJDER).length, 7);
    assert.equal(DEMO_PLANNING_BASIC.ressourcer.filter((r) => r.reference.art === REFERENCEART.KOERETOEJ).length, 7);
    assert.equal(DEMO_PLANNING_BASIC.ressourcer.filter((r) => r.reference.art === REFERENCEART.TEAM).length, 3);
    assert.equal(DEMO_PLANNING_DEPOTER.length, 3);
  });

  it("har akut opgave, kontroladresse, gentagelser, fravær og en ikke-tildelbar opgave", () => {
    assert.ok(DEMO_PLANNING_OPGAVER.some((o) => o.prioritet === "akut"));
    assert.ok(DEMO_PLANNING_BASIC.lokationer.some((l) => l.valideringsstatus === ADRESSESTATUS.KRAEVER_KONTROL));
    assert.ok(DEMO_PLANNING_OPGAVER.some((o) => o.gentagelse));
    assert.ok(DEMO_PLANNING_BASIC.ressourcer.some((r) => r.tilgaengelighed?.fravaer?.length));
    assert.ok(DEMO_PLANNING_OPGAVER.some((o) => o.krav.kompetencer.includes("umulig-demo-kompetence")));
  });

  it("indeholder kun tydeligt fiktive kontakt-, adresse- og koordinatdata", () => {
    const alleVaerdier = [];
    const gaa = (v) => {
      if (v == null) return;
      if (typeof v === "string") alleVaerdier.push(v);
      else if (Array.isArray(v)) v.forEach(gaa);
      else if (typeof v === "object") Object.values(v).forEach(gaa);
    };
    gaa(DEMO_PLANNING_BASIC);
    const mails = alleVaerdier.filter((v) => v.includes("@"));
    assert.ok(mails.length > 0);
    assert.ok(mails.every((v) => /@[^@]+\.invalid$/i.test(v)));
    assert.ok(DEMO_PLANNING_BASIC.kildedata.workforce.personale.every((p) => p.telefon === "0000 0000"));
    assert.ok(DEMO_PLANNING_BASIC.lokationer.every((l) => /fiktiv|prøve|demo|test|eksempel|kontrol|depot/i.test(l.adresse.adresselinje)));
    assert.ok(DEMO_PLANNING_BASIC.lokationer.every((l) => l.position?.oprindelse === "syntetisk"));
    assert.equal(DEMO_PLANNING_BASIC.metadata.syntetisk, true);
    assert.equal(DEMO_PLANNING_BASIC.metadata.geokodet, false);
    assert.equal(DEMO_PLANNING_BASIC.metadata.vejberegnet, false);
  });

  it("bevarer eksterne ejer-id'er uden Planning-ejede kopier", () => {
    for (const person of DEMO_PLANNING_BASIC.kildedata.workforce.personale) {
      const match = DEMO_PLANNING_BASIC.ressourcer.filter((r) => r.reference.id === person.id);
      assert.equal(match.length, 1);
      assert.equal(match[0].reference.kilde, KILDE.WORKFORCE);
    }
    for (const bil of DEMO_PLANNING_BASIC.kildedata.fleet) {
      const match = DEMO_PLANNING_BASIC.ressourcer.filter((r) => r.reference.id === bil.id);
      assert.equal(match.length, 1);
      assert.equal(match[0].reference.kilde, KILDE.FLEET);
    }
  });
});
