import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { REGELNIVEAU, TIDSFORM } from "../../src/fleet/planning-basic.js";
import {
  OPTIMERINGSKODE, OPTIMERINGSSTATUS, OPTIMERINGSPROFILER,
  opretHjemmeplejeScenarie, opretMatrixOpslag, opretTransportScenarie,
  opretLokaltPuljeScenarie, optimerDagsplan, projicerPlanlaegningspulje, scenarieChecksum, segmentNoegle,
  topologiskSorterBlokke, validerOptimeringsjob, validerOptimeringsresultat,
  validerRejsetidsmatrix,
} from "../../src/fleet/planning-optimization/index.js";
import { opretDemoIntakeData } from "../../src/fleet/planning-input/demo-planning-input.js";
import { INTAKESTATUS, sendTilDagsplan } from "../../src/fleet/planning-input/index.js";

const klon = (v) => structuredClone(v);
const alleFund = (resultat) => resultat.ikkePlanlagte?.flatMap((post) => post.fund) || resultat.fund || [];
const harKode = (resultat, kode) => alleFund(resultat).some((fund) => fund.kode === kode);
const enkeltOpgave = (job, indeks = 0) => ({ ...klon(job), id: `${job.id}-enkelt`, baselineplan: null, planlaegningspulje: [klon(job.planlaegningspulje[indeks])] });

describe("Optimeringsjob og syntetisk matrix", () => {
  it("accepterer et versioneret, eksplicit job", () => assert.equal(validerOptimeringsjob(opretHjemmeplejeScenarie()).ok, true));

  it("afviser manglende inputversion uden delplan", () => {
    const job = opretHjemmeplejeScenarie(); delete job.inputversion;
    const svar = optimerDagsplan(job);
    assert.equal(svar.status, OPTIMERINGSSTATUS.UGYLDIG);
    assert.equal("dagsplanskladde" in svar, false);
    assert.ok(svar.fund.some((fund) => fund.kode === OPTIMERINGSKODE.INPUTVERSION_MANGLER));
  });

  it("afviser manglende eksplicit beregningstid", () => {
    const job = opretHjemmeplejeScenarie(); delete job.beregningMs;
    assert.ok(validerOptimeringsjob(job).fund.some((fund) => fund.kode === OPTIMERINGSKODE.BEREGNINGSTID_MANGLER));
  });

  it("afviser tenantblanding før beregning", () => {
    const job = opretHjemmeplejeScenarie(); job.ressourcer.medarbejdere[0].tenantRef = "anden-tenant";
    assert.ok(validerOptimeringsjob(job).fund.some((fund) => fund.kode === OPTIMERINGSKODE.TENANT_UOVERENSSTEMMELSE));
  });

  it("bevarer asymmetriske matrixsegmenter", () => {
    const job = opretHjemmeplejeScenarie(); const [a, b] = [job.lokationer[0], job.lokationer[2]];
    const opslag = opretMatrixOpslag(job.matrix);
    const frem = opslag.get(segmentNoegle(a.reference, b.reference));
    const tilbage = opslag.get(segmentNoegle(b.reference, a.reference));
    assert.notEqual(frem.rejsetidMin, tilbage.rejsetidMin);
  });

  it("afviser dublerede segmenter", () => {
    const job = opretHjemmeplejeScenarie(); job.matrix.segmenter.push(klon(job.matrix.segmenter[0]));
    assert.ok(validerRejsetidsmatrix(job.matrix, job).fund.some((fund) => fund.kode === OPTIMERINGSKODE.MATRIX_DUBLET));
  });

  it("afviser negative tider og afstande", () => {
    const job = opretHjemmeplejeScenarie(); job.matrix.segmenter[1].rejsetidMin = -1; job.matrix.segmenter[2].afstandMeter = -2;
    assert.ok(validerRejsetidsmatrix(job.matrix, job).fund.filter((fund) => fund.kode === OPTIMERINGSKODE.MATRIX_SEGMENT_UGYLDIGT).length >= 2);
  });

  it("afviser forkert matrixversion og ukendt lokation", () => {
    const job = opretHjemmeplejeScenarie();
    job.matrix.segmenter[0].matrixversion = "forkert";
    job.matrix.segmenter[1].tilLokationRef = { ...job.matrix.segmenter[1].tilLokationRef, id: "ukendt" };
    const svar = validerRejsetidsmatrix(job.matrix, job);
    assert.ok(svar.fund.some((fund) => fund.kode === OPTIMERINGSKODE.MATRIX_VERSION_FORKERT));
    assert.ok(svar.fund.some((fund) => fund.kode === OPTIMERINGSKODE.REFERENCE_UKENDT));
  });

  it("kræver eksplicit gyldigt diagonalsegment", () => {
    const job = opretHjemmeplejeScenarie(); const diagonal = job.matrix.segmenter.find((post) => segmentNoegle(post.fraLokationRef, post.tilLokationRef).split(">")[0] === segmentNoegle(post.fraLokationRef, post.tilLokationRef).split(">")[1]);
    diagonal.rejsetidMin = 1;
    assert.ok(validerRejsetidsmatrix(job.matrix, job).fund.some((fund) => fund.kode === OPTIMERINGSKODE.MATRIX_SEGMENT_UGYLDIGT));
  });

  it("bruger hverken modsat segment eller standardtid ved et hul", () => {
    const job = enkeltOpgave(opretHjemmeplejeScenarie(), 0);
    const depot = job.startSlutsteder.find((post) => post.partition === job.planlaegningspulje[0].partition).startLokationRef;
    const maal = job.planlaegningspulje[0].stop[0].lokationRef;
    job.matrix.segmenter = job.matrix.segmenter.filter((post) => segmentNoegle(post.fraLokationRef, post.tilLokationRef) !== segmentNoegle(depot, maal));
    const svar = optimerDagsplan(job);
    assert.equal(svar.maalinger.efter.planlagteOpgaver, 0);
    assert.equal(harKode(svar, OPTIMERINGSKODE.MATRIXSEGMENT_MANGLER), true);
  });
});

describe("Determinisme og flerstopprojektion", () => {
  it("giver identisk resultat for identisk input", () => {
    const job = opretHjemmeplejeScenarie();
    assert.equal(scenarieChecksum(optimerDagsplan(job)), scenarieChecksum(optimerDagsplan(job)));
  });

  it("muterer ikke job, pulje, ressourcer eller matrix", () => {
    const job = opretTransportScenarie(); const foer = klon(job); optimerDagsplan(job); assert.deepEqual(job, foer);
  });

  it("er invariant over for semantisk ligegyldig inputrækkefølge", () => {
    const a = opretHjemmeplejeScenarie(); const b = klon(a);
    b.planlaegningspulje.reverse(); b.ressourcer.medarbejdere.reverse(); b.ressourcer.koeretoejer.reverse(); b.matrix.segmenter.reverse();
    assert.equal(scenarieChecksum(optimerDagsplan(a)), scenarieChecksum(optimerDagsplan(b)));
  });

  it("bruger stabilt ID som sidste tie-break", () => {
    const job = opretHjemmeplejeScenarie(); job.planlaegningspulje = job.planlaegningspulje.slice(0, 2);
    for (const segment of job.matrix.segmenter) if (segment.fraLokationRef.id !== segment.tilLokationRef.id) { segment.rejsetidMin = 5; segment.afstandMeter = 1000; }
    for (const opgave of job.planlaegningspulje) { opgave.stop[0].tidskrav = { art: TIDSFORM.FRI }; opgave.stop[0].estimeretVarighedMin = 15; opgave.kontinuitet = null; }
    const stop = optimerDagsplan(job).dagsplanskladde.ruter.flatMap((rute) => rute.stop);
    assert.deepEqual(stop.map((post) => post.sporbarhed.originalOpgaveId), [...stop.map((post) => post.sporbarhed.originalOpgaveId)].sort());
  });

  it("projekterer hvert stop til en unik intern opgaveforekomst", () => {
    const job = opretTransportScenarie(); const flerstop = job.planlaegningspulje.find((post) => post.stop.length > 1);
    const projektion = projicerPlanlaegningspulje([flerstop], job.dato);
    assert.equal(projektion.blokke[0].enheder.length, flerstop.stop.length);
    assert.equal(new Set(projektion.opgaveforekomster.map((post) => post.id)).size, flerstop.stop.length);
  });

  it("bevarer kildesporing og udførelsessnapshot", () => {
    const resultat = optimerDagsplan(opretTransportScenarie());
    const stop = resultat.dagsplanskladde.ruter.flatMap((rute) => rute.stop).find((post) => post.udfoerelsessnapshot);
    assert.ok(stop.sporbarhed.originalOpgaveId);
    assert.ok(stop.sporbarhed.originalStopId);
    assert.equal(stop.udfoerelsessnapshot.dokumentkrav[0].syntetisk, true);
  });

  it("holder en flerstop-opgave samlet, ordnet og med afhentning før levering", () => {
    const resultat = optimerDagsplan(opretTransportScenarie());
    const alle = resultat.dagsplanskladde.ruter.flatMap((rute) => rute.stop.map((stop) => ({ ruteId: rute.id, stop })));
    const gruppe = Map.groupBy(alle, (post) => post.stop.sporbarhed.originalOpgaveId);
    const flerstop = [...gruppe.values()].find((poster) => poster.length > 1);
    assert.equal(new Set(flerstop.map((post) => post.ruteId)).size, 1);
    assert.ok(flerstop[0].stop.sporbarhed.originalStopId.endsWith("-1"));
    assert.ok(flerstop[1].stop.sporbarhed.originalStopId.endsWith("-2"));
    assert.equal(flerstop[0].stop.raekkefoelge + 1, flerstop[1].stop.raekkefoelge);
  });

  it("afviser en flerstopblok med levering før afhentning", () => {
    const job = opretTransportScenarie(); const opgave = job.planlaegningspulje.find((post) => post.stop.length > 1);
    job.planlaegningspulje = [{ ...opgave, stop: [...opgave.stop].reverse() }]; job.baselineplan = null;
    assert.equal(harKode(optimerDagsplan(job), OPTIMERINGSKODE.AFHAENGIGHED_UGYLDIG), true);
  });

  it("finder ukendte og cirkulære afhængigheder før planlægning", () => {
    const job = opretHjemmeplejeScenarie(); const projektion = projicerPlanlaegningspulje(job.planlaegningspulje.slice(0, 2), job.dato);
    projektion.blokke[0].afhaengerAfOpgaveIder = [projektion.blokke[1].originalOpgaveId];
    projektion.blokke[1].afhaengerAfOpgaveIder = [projektion.blokke[0].originalOpgaveId, "ukendt"];
    const svar = topologiskSorterBlokke(projektion.blokke);
    assert.equal(svar.ok, false); assert.equal(svar.ukendte.length, 1); assert.equal(svar.cykliske.length, 2);
  });
});

describe("Ressourcer og hårde regler", () => {
  it("planlægger en opgave uden obligatorisk køretøj", () => {
    const job = enkeltOpgave(opretHjemmeplejeScenarie(), 2); job.ressourcer.koeretoejer = [];
    assert.equal(optimerDagsplan(job).maalinger.efter.planlagteOpgaver, 1);
  });

  it("forklarer manglende obligatorisk køretøj", () => {
    const job = enkeltOpgave(opretHjemmeplejeScenarie(), 4); job.ressourcer.koeretoejer = [];
    assert.equal(harKode(optimerDagsplan(job), OPTIMERINGSKODE.KOERETOEJ_MANGLER), true);
  });

  it("håndhæver køretøjstype og kapacitet", () => {
    const job = enkeltOpgave(opretTransportScenarie(), 3);
    job.ressourcer.koeretoejer = job.ressourcer.koeretoejer.filter((post) => post.koeretoej.type === "personbil");
    const svar = optimerDagsplan(job);
    assert.equal(harKode(svar, OPTIMERINGSKODE.KOERETOEJSTYPE_FORKERT), true);
    assert.equal(harKode(svar, OPTIMERINGSKODE.KAPACITET_UTILSTRAEKKELIG), true);
  });

  it("håndhæver kompetencer", () => {
    const job = enkeltOpgave(opretHjemmeplejeScenarie(), 21);
    assert.equal(harKode(optimerDagsplan(job), OPTIMERINGSKODE.KOMPETENCE_MANGLER), true);
  });

  it("skelner manglende og udløbet certifikat", () => {
    const udloebetJob = enkeltOpgave(opretHjemmeplejeScenarie(), 5);
    for (const person of udloebetJob.ressourcer.medarbejdere) for (const certifikat of person.certifikater) if (certifikat.kode === "medicin-certifikat") certifikat.udloeberMs = udloebetJob.beregningMs - 1;
    assert.equal(harKode(optimerDagsplan(udloebetJob), OPTIMERINGSKODE.CERTIFIKAT_UDLOEBET), true);
    const manglerJob = enkeltOpgave(opretHjemmeplejeScenarie(), 5);
    for (const person of manglerJob.ressourcer.medarbejdere) person.certifikater = [];
    assert.equal(harKode(optimerDagsplan(manglerJob), OPTIMERINGSKODE.CERTIFIKAT_MANGLER), true);
  });

  it("håndhæver vagt og fravær", () => {
    const vagtJob = enkeltOpgave(opretHjemmeplejeScenarie(), 2);
    for (const person of vagtJob.ressourcer.medarbejdere) person.tilgaengelighed.vagter = [{ id: "kort", fraMs: vagtJob.planStartMs, tilMs: vagtJob.planStartMs + 5 * 60000 }];
    assert.equal(harKode(optimerDagsplan(vagtJob), OPTIMERINGSKODE.VAGT_MANGLER), true);
    const fravaerJob = enkeltOpgave(opretHjemmeplejeScenarie(), 2);
    for (const person of fravaerJob.ressourcer.medarbejdere) person.tilgaengelighed.fravaer = [{ id: "blok", fraMs: fravaerJob.planStartMs, tilMs: fravaerJob.planStartMs + 8 * 3600000 }];
    assert.equal(harKode(optimerDagsplan(fravaerJob), OPTIMERINGSKODE.FRAVAER_OVERLAP), true);
  });

  it("håndhæver krævet udstyr", () => {
    const job = enkeltOpgave(opretTransportScenarie(), 5); job.ressourcer.udstyr = [];
    assert.equal(harKode(optimerDagsplan(job), OPTIMERINGSKODE.UDSTYR_MANGLER), true);
  });

  it("tillader aldrig en kontrolleret undtagelse automatisk", () => {
    const job = enkeltOpgave(opretHjemmeplejeScenarie(), 2); job.planlaegningspulje[0].kontrolleredeUndtagelser = [{ niveau: REGELNIVEAU.CONTROLLED_EXCEPTION }];
    assert.equal(harKode(optimerDagsplan(job), OPTIMERINGSKODE.KONTROLLERET_UNDTAGELSE_KRAEVER_GODKENDELSE), true);
  });

  it("holder medarbejdere og køretøjer fri for dobbeltbooking", () => {
    const resultat = optimerDagsplan(opretHjemmeplejeScenarie());
    assert.equal(new Set(resultat.dagsplanskladde.ruter.map((rute) => rute.medarbejderRefs[0].id)).size, resultat.dagsplanskladde.ruter.length);
    const biler = resultat.dagsplanskladde.ruter.flatMap((rute) => rute.koeretoejRefs.map((post) => post.id));
    assert.equal(new Set(biler).size, biler.length);
  });

  it("respekterer eksplicit blokerede ressourceintervaller", () => {
    const job = enkeltOpgave(opretHjemmeplejeScenarie(), 2);
    job.blokeredeRessourceintervaller = job.ressourcer.medarbejdere.filter((post) => post.partition === job.planlaegningspulje[0].partition).map((post, indeks) => ({ id: `blok-${indeks}`, ressourceRef: post.reference, fraMs: job.planStartMs, tilMs: job.planStartMs + 8 * 3600000 }));
    assert.equal(harKode(optimerDagsplan(job), OPTIMERINGSKODE.RESSOURCEKONFLIKT), true);
  });

  it("håndhæver hård kontinuitet, men kan vægte foretrukken kontinuitet", () => {
    const job = opretHjemmeplejeScenarie(); job.planlaegningspulje = [job.planlaegningspulje[0], job.planlaegningspulje[2]];
    for (const opgave of job.planlaegningspulje) { opgave.partition = "nord"; opgave.stop[0].tidskrav = { art: TIDSFORM.FAST, startMs: Date.UTC(2032, 4, 18, 8) }; opgave.stop[0].estimeretVarighedMin = 30; opgave.kontinuitet = { noegle: "samme", niveau: REGELNIVEAU.HARD }; }
    assert.equal(optimerDagsplan(job).maalinger.efter.planlagteOpgaver, 1);
    for (const opgave of job.planlaegningspulje) opgave.kontinuitet.niveau = REGELNIVEAU.PREFERENCE;
    assert.equal(optimerDagsplan(job).maalinger.efter.planlagteOpgaver, 2);
  });

  it("afviser et uklar adressepunkt før matrixgæt", () => {
    const job = enkeltOpgave(opretHjemmeplejeScenarie(), 2); job.planlaegningspulje[0].stop[0].adressestatus = "UKONTROLLERET";
    assert.equal(harKode(optimerDagsplan(job), OPTIMERINGSKODE.ADRESSE_IKKE_KLAR), true);
  });

  it("læser etape 4-puljen uden at gætte manglende matrixberedskab", () => {
    const demo = opretDemoIntakeData(); const klar = demo.opgaver.find((post) => post.status === INTAKESTATUS.KLAR_TIL_PLANLAEGNING);
    const pulje = sendTilDagsplan(klar, []).planlaegningspulje;
    const resultat = optimerDagsplan(opretLokaltPuljeScenarie(pulje));
    assert.equal(resultat.maalinger.efter.planlagteOpgaver, 0);
    assert.equal(resultat.ikkePlanlagte[0].originalOpgaveId, klar.id);
    assert.equal(harKode(resultat, OPTIMERINGSKODE.ADRESSE_IKKE_KLAR), true);
  });
});

describe("Tid, målfunktion og resultat", () => {
  it("dækker fast tid, tidsvindue, deadline og fri tid", () => {
    const arter = new Set(opretHjemmeplejeScenarie().planlaegningspulje.map((post) => post.stop[0].tidskrav.art));
    assert.deepEqual(arter, new Set(Object.values(TIDSFORM)));
  });

  it("medregner startkørsel, ventetid, service og hjemkørsel", () => {
    const resultat = optimerDagsplan(opretHjemmeplejeScenarie());
    const rute = resultat.dagsplanskladde.ruter.find((post) => post.stop.some((stop) => stop.ventetidMin > 0));
    assert.ok(rute.stop[0].koerselFoerMin >= 0); assert.ok(rute.maalinger.samletServiceMin > 0);
    assert.ok(rute.maalinger.samletVentetidMin > 0); assert.ok(rute.maalinger.hjemkoerselMin >= 0);
    assert.ok(rute.tilMs > rute.stop.at(-1).afgangMs);
  });

  it("planlægger ikke et umuligt tidsvindue eller deadline", () => {
    const job = enkeltOpgave(opretHjemmeplejeScenarie(), 2);
    job.planlaegningspulje[0].stop[0].tidskrav = { art: TIDSFORM.DEADLINE, deadlineMs: job.planStartMs + 1000 };
    assert.equal(harKode(optimerDagsplan(job), OPTIMERINGSKODE.TIDSRUM_MANGLER), true);
  });

  it("gætter ikke en manglende stopvarighed", () => {
    const job = enkeltOpgave(opretHjemmeplejeScenarie(), 2); job.planlaegningspulje[0].stop[0].estimeretVarighedMin = null;
    assert.equal(harKode(optimerDagsplan(job), OPTIMERINGSKODE.TIDSRUM_MANGLER), true);
  });

  it("resultatet afhænger af den eksplicitte matrix", () => {
    const a = enkeltOpgave(opretHjemmeplejeScenarie(), 2); const b = klon(a);
    for (const segment of b.matrix.segmenter) if (segment.fraLokationRef.id !== segment.tilLokationRef.id) { segment.rejsetidMin += 5; segment.afstandMeter += 500; }
    const ra = optimerDagsplan(a), rb = optimerDagsplan(b);
    assert.notEqual(ra.maalinger.efter.samletRejsetidMin, rb.maalinger.efter.samletRejsetidMin);
    assert.notEqual(ra.maalinger.efter.samletAfstandMeter, rb.maalinger.efter.samletAfstandMeter);
  });

  it("bruger samme motor med to profiler", () => {
    const pleje = optimerDagsplan(opretHjemmeplejeScenarie()); const transport = optimerDagsplan(opretTransportScenarie());
    assert.equal(pleje.algoritme.navn, transport.algoritme.navn);
    assert.notEqual(OPTIMERINGSPROFILER.HJEMMEPLEJE.vaegte.rejsetid, OPTIMERINGSPROFILER.TRANSPORT.vaegte.rejsetid);
  });

  it("giver dokumenteret forskel ved vægtændring", () => {
    const job = opretHjemmeplejeScenarie();
    const kort = optimerDagsplan({ ...job, profil: { ...job.profil, vaegte: { rejsetid: 15, afstand: 10, arbejdsbalance: 0, koeretoejer: 0, kontinuitet: 0 } } });
    const balance = optimerDagsplan({ ...job, profil: { ...job.profil, vaegte: { rejsetid: 0, afstand: 0, arbejdsbalance: 15, koeretoejer: 0, kontinuitet: 15 } } });
    assert.notEqual(scenarieChecksum(kort), scenarieChecksum(balance));
    assert.ok(kort.maalinger.efter.samletRejsetidMin < balance.maalinger.efter.samletRejsetidMin);
    assert.notEqual(balance.maalinger.efter.anvendteRuter, kort.maalinger.efter.anvendteRuter);
  });

  it("afstemmer før-, efter- og deltamålinger", () => {
    const { maalinger } = optimerDagsplan(opretTransportScenarie());
    for (const noegle of Object.keys(maalinger.efter)) assert.equal(maalinger.delta[noegle], maalinger.efter[noegle] - maalinger.foer[noegle]);
  });

  it("returnerer konkrete ikke-planlagte årsager", () => {
    const resultat = optimerDagsplan(opretTransportScenarie());
    assert.equal(resultat.ikkePlanlagte.length, 1);
    assert.ok(resultat.ikkePlanlagte[0].fund.every((fund) => fund.kode !== "KUNNE_IKKE_PLANLAEGGES" && fund.tekst.length > 10));
  });

  it("returnerer kun en gyldig begrænset plan ved operationsgrænsen", () => {
    const job = opretHjemmeplejeScenarie(); job.maksOperationer = 2;
    const resultat = optimerDagsplan(job);
    assert.equal(resultat.status, OPTIMERINGSSTATUS.BEGRAENSET); assert.equal(resultat.operationsgraenseNaaet, true);
    assert.equal(resultat.domænevalidering.ok, true); assert.equal(harKode(resultat, OPTIMERINGSKODE.OPERATIONS_GRAENSE), true);
  });

  it("validerer dagsplanskladden gennem eksisterende Planning-kontrakter", () => {
    const resultat = optimerDagsplan(opretHjemmeplejeScenarie());
    assert.equal(resultat.domænevalidering.ok, true); assert.equal(validerOptimeringsresultat(resultat).ok, true);
  });

  it("hævder aldrig global optimalitet eller frigiver resultatet", () => {
    const resultat = optimerDagsplan(opretHjemmeplejeScenarie());
    assert.equal(resultat.globaltOptimalitetsbevis, false); assert.match(resultat.forklaring, /globalt optimum er ikke bevist/);
    assert.equal(resultat.dagsplanskladde.status, "kladde");
  });

  it("placerer hvert stop præcis én gang eller forklarer det som ikke-planlagt", () => {
    const resultat = optimerDagsplan(opretTransportScenarie());
    const alle = [...resultat.dagsplanskladde.ruter.flatMap((rute) => rute.stop.map((stop) => stop.opgaveforekomstId)), ...resultat.ikkePlanlagte.flatMap((post) => post.forekomstIder)];
    assert.equal(alle.length, resultat.snapshot.opgaveforekomster.length); assert.equal(new Set(alle).size, alle.length);
  });

  it("afviser et resultat, hvor en forekomst hverken er planlagt eller forklaret", () => {
    const resultat = optimerDagsplan(opretTransportScenarie());
    const manipuleret = klon(resultat); manipuleret.ikkePlanlagte.pop();
    assert.equal(validerOptimeringsresultat(manipuleret).ok, false);
  });
});
