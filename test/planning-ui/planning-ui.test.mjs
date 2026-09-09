import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AARSAGSKODE, DATAKVALITET, MOBILEVENTTYPE, REFERENCEART, REGELNIVEAU,
  TILDELINGSMETODE, sammenholdMobilOgObd, tilfoejSkabelonStop,
} from "../../src/fleet/planning-basic-v2.js";
import {
  UI_AFVIGELSESINDSTILLINGER, UI_IKKE_TILDELTE, UI_KOERETOEJER,
  UI_LOESNINGSFORSLAG, UI_MEDARBEJDERE, UI_RESSOURCESNAPSHOT, UI_RUTER,
  UI_RUTESKABELONER, UI_SKABELON_KOERETIDER, opretPlanningUiFixtures,
} from "../../src/fleet/planning-ui/demo-planning-ui.js";
import {
  DEMO_NU_MS, RAEKKEVISNING, STATUSFILTER, afvigelsesniveau,
  anvendGodkendtForslag, beregnSkabelonResume, dashboardNoegletal,
  filtrerRuter, forslagForRute, godkendForslag, graenseFor, grupperKalender,
  nytSkabelonStop, opretSyntetiskMobilevent, redigerForslag, ruteDatagrundlag,
  ruteTidsresume, skiftStandardTildeling, synkroniserOfflineEvent,
  tidslinjeSegmenter,
} from "../../src/fleet/planning-ui/planning-ui-model.js";
import { INTAKESTATUS, godkendOpgave, sendTilDagsplan } from "../../src/fleet/planning-input/index.js";
import { opretDemoIntakeData } from "../../src/fleet/planning-input/demo-planning-input.js";
import { mobilFlowForStop } from "../../src/fleet/planning-execution/index.js";

const klon = (v) => structuredClone(v);
const her = dirname(fileURLToPath(import.meta.url));
const rod = resolve(her, "../..");

describe("Syntetisk Planning-dashboard", () => {
  it("har den aftalte demomængde og et ikke-tildelt arbejde", () => {
    assert.equal(UI_RUTER.length, 8);
    assert.equal(UI_MEDARBEJDERE.length, 6);
    assert.equal(UI_KOERETOEJER.length, 7);
    assert.equal(UI_RUTER.flatMap((rute) => rute.stop).length, 40);
    assert.equal(UI_IKKE_TILDELTE.length, 1);
    assert.ok(UI_RUTER.filter((rute) => rute.fast).length >= 2);
    assert.ok(UI_RUTER.some((rute) => !rute.koeretoejId));
    assert.ok(UI_RUTER.filter((rute) => !rute.obdObservationer.length).length >= 2);
  });

  it("beregner dashboardets nøgletal af samme rutedata", () => {
    const tal = dashboardNoegletal(UI_RUTER, UI_IKKE_TILDELTE, UI_AFVIGELSESINDSTILLINGER);
    assert.equal(tal.opgaver, 41);
    assert.equal(tal.ruter, 8);
    assert.equal(tal.ikkeTildelte, 1);
    assert.ok(tal.kraeverHandling >= 3);
  });

  it("filtrerer normal, advarsel, kritisk og datakonflikt deterministisk", () => {
    for (const status of Object.values(STATUSFILTER).filter((vaerdi) => vaerdi !== STATUSFILTER.ALLE)) {
      const ruter = filtrerRuter(UI_RUTER, { status, ruteId: "", medarbejderId: "", koeretoejId: "" }, UI_AFVIGELSESINDSTILLINGER);
      assert.ok(ruter.length > 0, status);
      assert.ok(ruter.every((rute) => afvigelsesniveau(rute, UI_AFVIGELSESINDSTILLINGER) === status));
    }
  });
});

describe("Én kalender med tre grupperinger", () => {
  it("skifter mellem rute-, medarbejder- og køretøjsrækker", () => {
    for (const mode of Object.values(RAEKKEVISNING)) {
      const resultat = grupperKalender(UI_RUTER, mode, UI_MEDARBEJDERE, UI_KOERETOEJER);
      assert.ok(resultat.raekker.length > 0);
      assert.deepEqual(resultat.grupperedeRuteIder, resultat.grunddataRuteIder);
    }
  });

  it("bevarer ruter uden køretøj i en særskilt række", () => {
    const resultat = grupperKalender(UI_RUTER, RAEKKEVISNING.KOERETOEJ, UI_MEDARBEJDERE, UI_KOERETOEJER);
    assert.equal(resultat.raekker.find((r) => r.id === "uden-koeretoej").ruter.length, 1);
  });

  it("bygger startkørsel, stop, pause, mellemkørsel og slutkørsel", () => {
    const rute = UI_RUTER[0];
    const segmenter = tidslinjeSegmenter(rute);
    assert.equal(segmenter[0].art, "koersel");
    assert.equal(segmenter.at(-1).art, "koersel");
    assert.ok(segmenter.some((segment) => segment.art === "service"));
    assert.ok(segmenter.some((segment) => segment.art === "pause"));
    assert.ok(segmenter.some((segment) => segment.art === "ventetid"));
  });
});

describe("OBD, mobil og estimeret fremdrift", () => {
  it("viser en rute uden OBD som estimeret og aldrig live", () => {
    const rute = UI_RUTER.find((post) => post.obd === "ingen" && post.mobilevents.length);
    const data = ruteDatagrundlag(rute);
    assert.equal(data.harLiveObd, false);
    assert.equal(data.forventet.kvalitet, DATAKVALITET.ESTIMERET);
    assert.match(data.label, /Estimeret/);
  });

  it("viser kun frisk OBD som Live OBD", () => {
    const frisk = ruteDatagrundlag(UI_RUTER.find((rute) => rute.obd === "frisk"));
    const gammel = ruteDatagrundlag(UI_RUTER.find((rute) => rute.obd === "foraeldet"));
    assert.equal(frisk.fysiskPosition.kvalitet, DATAKVALITET.LIVE_OBD);
    assert.equal(frisk.label, "Live OBD");
    assert.equal(gammel.fysiskPosition.kvalitet, DATAKVALITET.FORAELDET);
    assert.notEqual(gammel.label, "Live OBD");
  });

  it("prioriterer nyere mobilhændelse som bekræftet arbejdsstatus", () => {
    const rute = UI_RUTER.find((post) => post.obd === "foraeldet");
    const data = ruteDatagrundlag(rute);
    assert.equal(data.arbejdsstatus.event.id, rute.mobilevents.at(-1).id);
    assert.ok(data.arbejdsstatus.event.mobilTidMs > data.senesteObd.tidspunktMs);
  });

  it("bevarer mobil og OBD som to separate spor ved uoverensstemmelse", () => {
    const rute = UI_RUTER.find((post) => post.datakonflikt);
    const mobilFoer = klon(rute.mobilevents);
    const obdFoer = klon(rute.obdObservationer);
    const mobil = rute.mobilevents.at(-1);
    const stop = rute.stop.find((post) => post.id === mobil.stopforekomstId);
    const svar = sammenholdMobilOgObd({ mobilevents: rute.mobilevents, observationer: rute.obdObservationer, stoppositioner: { [stop.id]: { ...stop.position, radiusMeter: 100 } }, nuMs: DEMO_NU_MS });
    assert.equal(svar.senesteMobilevent.id, mobil.id);
    assert.equal(svar.senesteObdObservation.id, rute.obdObservationer.at(-1).id);
    assert.equal(svar.konsistent, false);
    assert.deepEqual(rute.mobilevents, mobilFoer);
    assert.deepEqual(rute.obdObservationer, obdFoer);
  });
});

describe("Kundens afvigelsesgrænser", () => {
  it("anvender fælles grænser", () => {
    const rute = UI_RUTER.find((post) => post.afvigelseMin === 18);
    assert.equal(graenseFor(rute, UI_AFVIGELSESINDSTILLINGER).advarselMin, 15);
    assert.equal(afvigelsesniveau(rute, UI_AFVIGELSESINDSTILLINGER), STATUSFILTER.ADVARSEL);
  });

  it("anvender forskellige grænser pr. rutetype", () => {
    const indstillinger = { ...klon(UI_AFVIGELSESINDSTILLINGER), model: "PR_RUTETYPE" };
    const transport = UI_RUTER.find((rute) => rute.rutetype === "transport" && rute.afvigelseMin === 18);
    const service = { ...transport, rutetype: "service", datakonflikt: false };
    assert.equal(afvigelsesniveau(transport, indstillinger), STATUSFILTER.NORMAL);
    assert.equal(afvigelsesniveau(service, indstillinger), STATUSFILTER.ADVARSEL);
  });

  it("fremhæver en kritisk afvigelse efter aktiv regel", () => {
    const rute = UI_RUTER.find((post) => post.afvigelseMin === 38);
    const udenKonflikt = { ...rute, datakonflikt: false };
    assert.equal(afvigelsesniveau(udenKonflikt, UI_AFVIGELSESINDSTILLINGER), STATUSFILTER.KRITISK);
  });
});

describe("Redigerbare løsningsforslag", () => {
  it("viser kun fixture-forslag på den rute, de tilhører", () => {
    assert.equal(forslagForRute(UI_LOESNINGSFORSLAG, "ui-rute-service").length, 2);
    assert.equal(forslagForRute(UI_LOESNINGSFORSLAG, "ui-rute-reserve").length, 0);
  });

  it("kræver disponent og begrundelse før godkendelse", () => {
    const gyldigt = UI_LOESNINGSFORSLAG.find((forslag) => !forslag.regelbrud.length);
    assert.equal(godkendForslag(gyldigt, {}).ok, false);
  });

  it("blokerer et forslag med et hårdt regelbrud", () => {
    const hard = UI_LOESNINGSFORSLAG.find((forslag) => forslag.regelbrud.some((brud) => brud.niveau === REGELNIVEAU.HARD));
    const svar = godkendForslag(hard, { godkendtAf: "demo-disponent", begrundelse: "Test" });
    assert.equal(svar.ok, false);
    assert.match(svar.fejl, /Kan ikke godkendes/);
  });

  it("opdaterer konsekvensvisningen ved redigering", () => {
    const gyldigt = UI_LOESNINGSFORSLAG.find((forslag) => !forslag.regelbrud.length);
    const redigeret = redigerForslag(gyldigt, { forventetAendringMin: 21 });
    assert.equal(redigeret.forventetAendringMin, 21);
    assert.equal(redigeret.aendredeAnkomsttider[0].forskydningMin, 21);
    assert.notDeepEqual(redigeret.aendredeAnkomsttider, gyldigt.aendredeAnkomsttider);
  });

  it("anvender aldrig et forslag før en gyldig godkendelse", () => {
    const gyldigt = UI_LOESNINGSFORSLAG.find((forslag) => !forslag.regelbrud.length);
    assert.equal(anvendGodkendtForslag(UI_RUTER, gyldigt).anvendt, false);
    const godkendt = godkendForslag(gyldigt, { godkendtAf: "demo-disponent", begrundelse: "Bevar dagens rute" });
    assert.equal(godkendt.ok, true);
    assert.equal(anvendGodkendtForslag(UI_RUTER, godkendt.forslag).anvendt, true);
  });
});

describe("Faste ruter og tidsberegning", () => {
  it("beregner skabelonen gennem etape 2-domænet", () => {
    const svar = beregnSkabelonResume(UI_RUTESKABELONER[0], UI_SKABELON_KOERETIDER[UI_RUTESKABELONER[0].id], UI_RESSOURCESNAPSHOT);
    assert.equal(svar.komplet, true);
    assert.ok(svar.tidsplan.samletKoeretidMin > 0);
    assert.ok(svar.tidsplan.samletStoptidMin > 0);
    assert.ok(svar.tidsplan.samletPausetidMin > 0);
    assert.equal(svar.tidsplan.samletRutetidMin, svar.tidsplan.samletKoeretidMin + svar.tidsplan.samletStoptidMin + svar.tidsplan.samletPausetidMin + svar.tidsplan.samletVentetidMin);
  });

  it("markerer manglende køretid og stopvarighed uden at gætte", () => {
    const skabelon = klon(UI_RUTESKABELONER[0]);
    delete skabelon.stop[0].estimeretVarighedMin;
    const udenStopvarighed = beregnSkabelonResume(skabelon, UI_SKABELON_KOERETIDER[skabelon.id], UI_RESSOURCESNAPSHOT);
    assert.equal(udenStopvarighed.komplet, false);
    assert.match(udenStopvarighed.mangler.join(" "), /varighed/);
    const udenKoeretid = beregnSkabelonResume(UI_RUTESKABELONER[0], [10], UI_RESSOURCESNAPSHOT);
    assert.equal(udenKoeretid.komplet, false);
    assert.ok(udenKoeretid.mangler.some((mangel) => mangel.art === "koeretid"));
  });

  it("tilføjer et gyldigt fleksibelt demostop og genberegner hele ruten", () => {
    const oprindelig = UI_RUTESKABELONER[0];
    const udvidet = tilfoejSkabelonStop(oprindelig, nytSkabelonStop(oprindelig, 1));
    const koeretider = [...UI_SKABELON_KOERETIDER[oprindelig.id], 9];
    const svar = beregnSkabelonResume(udvidet, koeretider, UI_RESSOURCESNAPSHOT);
    const foer = beregnSkabelonResume(oprindelig, UI_SKABELON_KOERETIDER[oprindelig.id], UI_RESSOURCESNAPSHOT);
    assert.equal(svar.komplet, true);
    assert.equal(svar.tidsplan.samletRutetidMin, foer.tidsplan.samletRutetidMin + 29);
    assert.equal(oprindelig.stop.length, 3);
  });

  it("lader ikke FAST omgå certifikat-, fraværs- eller køretøjskrav", () => {
    const skabelon = klon(UI_RUTESKABELONER[0]);
    skabelon.standardTildeling.medarbejder = { metode: TILDELINGSMETODE.FAST, ressourceRef: { kilde: "workforce", art: REFERENCEART.MEDARBEJDER, id: "wf-demo-004" } };
    const svar = beregnSkabelonResume(skabelon, UI_SKABELON_KOERETIDER[skabelon.id], UI_RESSOURCESNAPSHOT);
    assert.ok(svar.tildeling.fund.some((fund) => fund.kode === AARSAGSKODE.CERTIFIKAT_UDLOEBET));
    const udenBil = skiftStandardTildeling(UI_RUTESKABELONER[1], REFERENCEART.KOERETOEJ, TILDELINGSMETODE.INGEN, null);
    const bilSvar = beregnSkabelonResume(udenBil, UI_SKABELON_KOERETIDER[udenBil.id], UI_RESSOURCESNAPSHOT);
    assert.ok(bilSvar.tildeling.fund.some((fund) => fund.kode === AARSAGSKODE.KOERETOEJ_MANGLER));
  });

  it("har en synlig ufuldstændig driftsrute", () => {
    const rute = UI_RUTER.find((post) => post.manglerSlutkoersel);
    const resume = ruteTidsresume(rute);
    assert.equal(resume.komplet, false);
    assert.ok(resume.mangler.some((mangel) => /Køretid til/.test(mangel)));
  });
});

describe("Mobilregistrering uden rigtig GPS", () => {
  it("registrerer deterministisk ankomst og afgang med syntetisk position", () => {
    const rute = UI_RUTER[2];
    const stop = rute.stop[2];
    const ankomst = opretSyntetiskMobilevent({ rute, stopId: stop.id, medarbejderId: rute.medarbejderId, type: MOBILEVENTTYPE.ANKOMMET, indeks: 3 });
    const afgang = opretSyntetiskMobilevent({ rute, stopId: stop.id, medarbejderId: rute.medarbejderId, type: MOBILEVENTTYPE.AFGAAET, indeks: 4 });
    assert.equal(ankomst.type, MOBILEVENTTYPE.ANKOMMET);
    assert.equal(afgang.type, MOBILEVENTTYPE.AFGAAET);
    assert.deepEqual(ankomst.position, stop.position);
    assert.equal(ankomst.syntetisk, true);
    assert.ok(afgang.mobilTidMs > ankomst.mobilTidMs);
  });

  it("synkroniserer en offlinehændelse uden datatab", () => {
    const rute = UI_RUTER[2];
    const event = opretSyntetiskMobilevent({ rute, stopId: rute.stop[2].id, medarbejderId: rute.medarbejderId, type: MOBILEVENTTYPE.ANKOMMET, offline: true });
    const foer = klon(event);
    const efter = synkroniserOfflineEvent([event], event.id)[0];
    assert.equal(foer.synkroniseret, false);
    assert.equal(efter.synkroniseret, true);
    assert.equal(efter.id, foer.id);
    assert.deepEqual(efter.position, foer.position);
  });
});

describe("Isolation, syntetiske data og fungerende UI-kontrakt", () => {
  it("gendanner de oprindelige fixtures ved ny initialisering", () => {
    const a = opretPlanningUiFixtures();
    a.ruter[0].navn = "lokal ændring";
    const b = opretPlanningUiFixtures();
    assert.notEqual(b.ruter[0].navn, a.ruter[0].navn);
    assert.deepEqual(b.ruter, UI_RUTER);
  });

  it("bruger kun tydeligt fiktive identiteter, adresser og registreringer", () => {
    assert.ok(UI_MEDARBEJDERE.every((person) => /Demo|Fiktiv/.test(person.navn)));
    assert.ok(UI_KOERETOEJER.every((bil) => /DEMO/.test(bil.navn)));
    assert.ok(UI_RUTER.flatMap((rute) => rute.stop).every((stop) => /Testvej|Demoby/.test(stop.adresse)));
    assert.ok(UI_RUTER.flatMap((rute) => [...rute.mobilevents, ...rute.obdObservationer]).every((observation) => observation.syntetisk === true));
  });

  it("indeholder alle lokale visninger og aktive kontroltekster", () => {
    const demo = readFileSync(resolve(rod, "src/fleet/planning-ui/PlanningDemo.jsx"), "utf8");
    const drift = readFileSync(resolve(rod, "src/fleet/planning-ui/PlanningOperations.jsx"), "utf8");
    const jsx = `${demo}\n${drift}`;
    for (const tekst of ["Dagens drift", "Optimering", "Livekalender", "Faste ruter", "Mobilvisning", "Fuld skærm", "Ankommet", "Afgået", "Godkend ændring", "Afvis"]) assert.match(jsx, new RegExp(tekst));
  });

  it("tilføjer opgaveindbakken uden at duplikere den eksisterende rute-UI", () => {
    const jsx = readFileSync(resolve(rod, "src/fleet/planning-ui/PlanningIntake.jsx"), "utf8");
    for (const tekst of ["Opgaver", "Opret opgave", "Importér opgaver", "Match kolonner", "Send til dagsplan", "Udførelsesskabeloner"]) assert.match(jsx, new RegExp(tekst));
    assert.match(jsx, /Ny fiktiv skabelon[\s\S]*stopprofiler:\s*\[\{/);
    assert.match(readFileSync(resolve(rod, "src/fleet/planning-ui/PlanningDemo.jsx"), "utf8"), /VISNING\.OPGAVER/);
  });

  it("holder planlægningspuljen lokal og kræver godkendelse", () => {
    const demo = opretDemoIntakeData();
    const modtaget = demo.opgaver.find((post) => post.status === INTAKESTATUS.MODTAGET);
    assert.equal(sendTilDagsplan(modtaget, []).ok, false);
    const klar = godkendOpgave(modtaget, { tidspunktMs: Date.UTC(2032, 4, 17, 15) });
    const svar = sendTilDagsplan(klar, []);
    assert.equal(svar.ok, true);
    assert.equal(svar.planlaegningspulje.length, 1);
    assert.equal(svar.opgave.ruteId, null);
  });

  it("løfter én lokal planlægningspulje til Opgaver og Optimering", () => {
    const demo = readFileSync(resolve(rod, "src/fleet/planning-ui/PlanningDemo.jsx"), "utf8");
    const intake = readFileSync(resolve(rod, "src/fleet/planning-ui/PlanningIntake.jsx"), "utf8");
    assert.match(demo, /\[planlaegningspulje, setPlanlaegningspulje\]/);
    assert.match(demo, /<PlanningIntake planlaegningspulje=\{planlaegningspulje\} setPlanlaegningspulje=\{setPlanlaegningspulje\}/);
    assert.match(demo, /<PlanningOptimization planlaegningspulje=\{planlaegningspulje\}/);
    assert.match(intake, /planlaegningspulje \?\? lokalPulje/);
  });

  it("viser en ærlig lokal optimeringskontrakt uden lagring eller frigivelse", () => {
    const jsx = readFileSync(resolve(rod, "src/fleet/planning-ui/PlanningOptimization.jsx"), "utf8");
    for (const tekst of ["Optimér dagsplan", "Syntetisk rejsetidsmatrix", "globalt optimum er ikke bevist", "Hjemmepleje-demo", "Transport-demo", "Lokal planlægningspulje", "Ikke-planlagte opgaver"]) assert.match(jsx, new RegExp(tekst));
    assert.doesNotMatch(jsx, /Gem plan|Frigiv plan|Publicér/);
  });

  it("viser et betinget materialeflow uden kamera, signatur eller mailafsendelse", () => {
    const demo = opretDemoIntakeData();
    const profil = demo.skabeloner[0].stopprofiler[0];
    const skjult = mobilFlowForStop(profil, { "sp-materialer": false });
    const vist = mobilFlowForStop(profil, { "sp-materialer": true });
    assert.equal(skjult.includes("Registrér materialer"), false);
    assert.equal(vist.includes("Registrér materialer"), true);
    assert.ok(vist.filter((trin) => trin.includes("Ikke tilsluttet endnu")).length >= 3);
  });

  it("holder UI-importgrafen fri for Firebase, netværk og persistence", () => {
    const mappe = resolve(rod, "src/fleet/planning-ui");
    const filer = readdirSync(mappe).map((navn) => join(mappe, navn)).filter((fil) => statSync(fil).isFile() && /\.(js|jsx)$/.test(fil));
    for (const fil of filer) {
      const kilde = readFileSync(fil, "utf8");
      assert.doesNotMatch(kilde, /fleet\.css|firebase|httpsCallable|initializeApp|getDatabase|fetch\s*\(|XMLHttpRequest|navigator\.geolocation|dangerouslySetInnerHTML|\beval\s*\(/i, fil);
      assert.doesNotMatch(kilde, /localStorage|sessionStorage|indexedDB/, fil);
    }
  });
});
