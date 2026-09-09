/* Deterministiske, fuldt syntetiske scenarier. Adresser fortolkes aldrig geografisk. */
import { ADRESSESTATUS, KILDE, REFERENCEART, REGELNIVEAU, TIDSFORM, planningReference } from "../planning-basic.js";
import { MATRIXKILDE } from "./kontrakt.js";

export const DEMO_OPT_DATO = "2032-05-18";
export const DEMO_OPT_BEREGNING_MS = Date.UTC(2032, 4, 17, 12, 0);
const DAG_START_MS = Date.UTC(2032, 4, 18, 0, 0);
const tid = (time, minut = 0) => DAG_START_MS + (time * 60 + minut) * 60000;
const ref = (art, id) => planningReference(art, id);
const klon = (v) => structuredClone(v);

export const OPTIMERINGSPROFILER = Object.freeze({
  HJEMMEPLEJE: Object.freeze({ id: "profil-kontinuitet-demo", navn: "Hjemmepleje-demo", version: 1, vaegte: { rejsetid: 4, afstand: 1, arbejdsbalance: 6, koeretoejer: 1, kontinuitet: 12 } }),
  TRANSPORT: Object.freeze({ id: "profil-transport-demo", navn: "Transport-demo", version: 1, vaegte: { rejsetid: 8, afstand: 5, arbejdsbalance: 2, koeretoejer: 5, kontinuitet: 1 } }),
});

function lokation(id, partition, indeks) {
  return {
    id, tenantRef: "tenant-fiktiv-optimering", reference: ref(REFERENCEART.LOKATION, id), ejerKilde: KILDE.PLANNING,
    navn: `Syntetisk matrixpunkt ${id}`, partition,
    adresse: { adresselinje: `Fiktiv Testvej ${1000 + indeks}`, postnr: "0000", by: "Demoby" },
    valideringsstatus: ADRESSESTATUS.VALIDERET, kontaktoplysninger: [], adgangsnoter: [], ekstrafelter: [],
  };
}

function medarbejder(id, partition, indeks, ekstra = {}) {
  return {
    id, tenantRef: "tenant-fiktiv-optimering", reference: ref(REFERENCEART.MEDARBEJDER, id), ejerKilde: KILDE.PLANNING,
    visningsnavn: `Fiktiv medarbejder ${String(indeks).padStart(2, "0")}`, status: "aktiv", partition,
    kompetencer: ["basis", ...(indeks % 2 === 0 ? ["medicin"] : []), ...(indeks % 3 === 0 ? ["loeft"] : [])],
    certifikater: [{ kode: "demo-certifikat", udloeberMs: tid(18) }, ...(indeks % 2 === 0 ? [{ kode: "medicin-certifikat", udloeberMs: tid(18) }] : [])],
    tilgaengelighed: { vagter: [{ id: `${id}-vagt`, fraMs: tid(6), tilMs: tid(16) }], fravaer: [] },
    ...ekstra,
  };
}

function koeretoej(id, partition, indeks, type = "personbil", kapacitet = { kg: 250, m3: 2 }) {
  return {
    id, tenantRef: "tenant-fiktiv-optimering", reference: ref(REFERENCEART.KOERETOEJ, id), ejerKilde: KILDE.PLANNING,
    visningsnavn: `DEMO-køretøj ${String(indeks).padStart(2, "0")}`, status: "aktiv", partition,
    koeretoej: { type, kapacitet },
  };
}

function udstyr(id, partition, navn) {
  return { id, tenantRef: "tenant-fiktiv-optimering", reference: ref(REFERENCEART.UDSTYR, id), ejerKilde: KILDE.PLANNING, visningsnavn: `Fiktivt ${navn}`, status: "aktiv", partition };
}

function tidskrav(indeks, variant = "blandet") {
  if (variant === "fri") return { art: TIDSFORM.FRI };
  if (indeks === 1) return { art: TIDSFORM.FAST, startMs: tid(8) };
  if (indeks % 7 === 0) return { art: TIDSFORM.DEADLINE, deadlineMs: tid(13, 30) };
  if (indeks % 4 === 0) return { art: TIDSFORM.VINDUE, fraMs: tid(8, 30), tilMs: tid(13) };
  return { art: TIDSFORM.FRI };
}

function stop(id, lokationRef, indeks, krav = {}, type = "BESOEG") {
  return {
    id, navn: `Fiktivt stop ${String(indeks).padStart(2, "0")}`, type, lokationRef,
    adressestatus: "MANUELT_BEKRAEFTET", tidskrav: tidskrav(indeks), estimeretVarighedMin: 15 + (indeks % 3) * 5,
    krav: { kompetencer: ["basis"], certifikater: [], udstyrRefs: [], koeretoej: { paakraevet: false, typer: [], kapacitet: {} }, ...krav },
  };
}

function kompletMatrix(lokationer, version) {
  const segmenter = [];
  const grupper = new Map();
  for (const post of lokationer) grupper.set(post.partition, [...(grupper.get(post.partition) || []), post]);
  for (const gruppe of grupper.values()) for (const [fraIndeks, fra] of gruppe.entries()) for (const [tilIndeks, til] of gruppe.entries()) {
    const diagonal = fraIndeks === tilIndeks;
    const rejsetidMin = diagonal ? 0 : 4 + ((fraIndeks * 7 + tilIndeks * 11) % 17);
    segmenter.push({ fraLokationRef: fra.reference, tilLokationRef: til.reference, rejsetidMin, afstandMeter: diagonal ? 0 : rejsetidMin * 575 + fraIndeks * 13 + tilIndeks, kilde: MATRIXKILDE, matrixversion: version });
  }
  return { tenantRef: "tenant-fiktiv-optimering", version, kilde: MATRIXKILDE, segmenter };
}

function baseJob(id, pulje, lokationer, ressourcer, startSlutsteder, profil, matrixversion, ekstra = {}) {
  return {
    id, tenantRef: "tenant-fiktiv-optimering", dato: DEMO_OPT_DATO, tidszone: "Europe/Copenhagen",
    beregningMs: DEMO_OPT_BEREGNING_MS, inputversion: 1, planStartMs: tid(6), planlaegningspulje: pulje,
    ressourcer, lokationer, startSlutsteder, matrix: kompletMatrix(lokationer, matrixversion),
    profil: klon(profil), maksOperationer: 30000, status: "KLAR", resultatreference: null, ...ekstra,
  };
}

export function opretHjemmeplejeScenarie() {
  const partitioner = ["nord", "syd"];
  const depoter = partitioner.map((partition, indeks) => lokation(`opt-pleje-depot-${partition}`, partition, indeks));
  const besoegLokationer = Array.from({ length: 22 }, (_, i) => lokation(`opt-pleje-lok-${String(i + 1).padStart(2, "0")}`, partitioner[i % 2], i + 10));
  const lokationer = [...depoter, ...besoegLokationer];
  const medarbejdere = Array.from({ length: 6 }, (_, i) => {
    const partition = partitioner[i % 2];
    const depot = depoter.find((post) => post.partition === partition).reference;
    return medarbejder(`opt-pleje-med-${i + 1}`, partition, i + 1, { startLokationRef: depot, slutLokationRef: depot, tilgaengelighed: { vagter: [{ id: `pleje-vagt-${i + 1}`, fraMs: tid(6), tilMs: tid(15, 30) }], fravaer: i === 5 ? [{ id: "pleje-fravaer-demo", fraMs: tid(6), tilMs: tid(16) }] : [] } });
  });
  const koeretoejer = Array.from({ length: 5 }, (_, i) => koeretoej(`opt-pleje-bil-${i + 1}`, partitioner[i % 2], i + 1));
  const pulje = besoegLokationer.map((lok, i) => {
    const indeks = i + 1;
    const krav = indeks === 22 ? { kompetencer: ["umulig-fiktiv-kompetence"] }
      : indeks % 6 === 0 ? { kompetencer: ["basis", "medicin"], certifikater: ["medicin-certifikat"] }
        : indeks % 5 === 0 ? { kompetencer: ["basis"], koeretoej: { paakraevet: true, typer: ["personbil"], kapacitet: { kg: 100 } } } : {};
    return {
      id: `opt-pleje-opgave-${String(indeks).padStart(2, "0")}`, tenantRef: "tenant-fiktiv-optimering",
      titel: `Fiktivt besøg ${String(indeks).padStart(2, "0")}`, navn: `Fiktivt besøg ${String(indeks).padStart(2, "0")}`,
      eksternReference: `DEMO-PLEJE-${String(indeks).padStart(3, "0")}`, prioritet: indeks === 3 ? "AKUT" : indeks % 7 === 0 ? "HOEJ" : "NORMAL",
      partition: lok.partition, kontinuitet: [2, 4].includes(indeks) ? { noegle: "demo-fast-kontinuitet", niveau: REGELNIVEAU.HARD } : [9, 11].includes(indeks) ? { noegle: "demo-foretrukket-kontinuitet", niveau: REGELNIVEAU.PREFERENCE } : null,
      stop: [stop(`pleje-stop-${indeks}`, lok.reference, indeks, krav)], kilde: { art: "SYNTETISK_DEMO", batchId: "pleje-demo-batch" },
      udfoerelsessnapshot: { id: `pleje-udfoerelse-${indeks}`, syntetisk: true },
    };
  });
  const startSlutsteder = depoter.map((depot) => ({ partition: depot.partition, startLokationRef: depot.reference, slutLokationRef: depot.reference }));
  const baselineplan = { ruter: medarbejdere.slice(0, 4).map((person, i) => ({ medarbejderRef: person.reference, koeretoejRef: i < 2 ? koeretoejer[i].reference : null, opgaveIder: pulje.filter((post, j) => j % 4 === i).slice(0, 3).map((post) => post.id) })) };
  return baseJob("opt-job-hjemmepleje", pulje, lokationer, { medarbejdere, koeretoejer, udstyr: [] }, startSlutsteder, OPTIMERINGSPROFILER.HJEMMEPLEJE, "matrix-pleje-v1", { baselineplan });
}

export function opretTransportScenarie() {
  const partition = "transport-depot";
  const depot = lokation("opt-transport-depot", partition, 1);
  const stopLokationer = Array.from({ length: 20 }, (_, i) => lokation(`opt-transport-lok-${String(i + 1).padStart(2, "0")}`, partition, i + 20));
  const lokationer = [depot, ...stopLokationer];
  const medarbejdere = Array.from({ length: 4 }, (_, i) => medarbejder(`opt-transport-med-${i + 1}`, partition, i + 10, { startLokationRef: depot.reference, slutLokationRef: depot.reference }));
  const koeretoejer = [
    koeretoej("opt-transport-varevogn-1", partition, 1, "varevogn", { kg: 1200, m3: 8 }),
    koeretoej("opt-transport-varevogn-2", partition, 2, "varevogn", { kg: 900, m3: 6 }),
    koeretoej("opt-transport-lastbil-1", partition, 3, "lastbil", { kg: 5000, m3: 28 }),
    koeretoej("opt-transport-personbil-1", partition, 4, "personbil", { kg: 200, m3: 1 }),
  ];
  const lift = udstyr("opt-udstyr-lift", partition, "løfteudstyr");
  let lokIndex = 0;
  const pulje = Array.from({ length: 15 }, (_, i) => {
    const indeks = i + 1;
    const flerstop = indeks % 5 === 0;
    const antalStop = flerstop ? 2 : 1;
    const krav = indeks === 15
      ? { koeretoej: { paakraevet: true, typer: ["kranbil"], kapacitet: { kg: 7000 } } }
      : { koeretoej: { paakraevet: true, typer: indeks % 4 === 0 ? ["lastbil"] : ["varevogn", "lastbil"], kapacitet: { kg: indeks % 4 === 0 ? 2500 : 500 } }, udstyrRefs: indeks % 6 === 0 ? [lift.reference] : [] };
    const stopListe = Array.from({ length: antalStop }, (_, stopIndeks) => {
      const lok = stopLokationer[lokIndex++];
      const post = stop(`transport-stop-${indeks}-${stopIndeks + 1}`, lok.reference, indeks + stopIndeks, krav, stopIndeks === 0 && flerstop ? "AFHENTNING" : "LEVERING");
      post.tidskrav = tidskrav(indeks, indeks % 3 === 0 ? "blandet" : "fri");
      post.estimeretVarighedMin = 20 + stopIndeks * 10;
      return post;
    });
    return {
      id: `opt-transport-opgave-${String(indeks).padStart(2, "0")}`, tenantRef: "tenant-fiktiv-optimering",
      titel: `Fiktiv transportopgave ${String(indeks).padStart(2, "0")}`, navn: `Fiktiv transportopgave ${String(indeks).padStart(2, "0")}`,
      eksternReference: `DEMO-TRANSPORT-${String(indeks).padStart(3, "0")}`, prioritet: indeks % 6 === 0 ? "HOEJ" : "NORMAL", partition,
      stop: stopListe, kilde: { art: "SYNTETISK_DEMO", batchId: "transport-demo-batch" },
      udfoerelsessnapshot: { id: `transport-udfoerelse-${indeks}`, dokumentkrav: [{ syntetisk: true }] },
    };
  });
  const startSlutsteder = [{ partition, startLokationRef: depot.reference, slutLokationRef: depot.reference }];
  const baselineplan = { ruter: medarbejdere.slice(0, 3).map((person, i) => ({ medarbejderRef: person.reference, koeretoejRef: koeretoejer[i].reference, opgaveIder: pulje.filter((_, j) => j % 3 === i).slice(0, 3).reverse().map((post) => post.id) })) };
  return baseJob("opt-job-transport", pulje, lokationer, { medarbejdere, koeretoejer, udstyr: [lift] }, startSlutsteder, OPTIMERINGSPROFILER.TRANSPORT, "matrix-transport-v1", { baselineplan });
}

export function opretLokaltPuljeScenarie(planlaegningspulje) {
  const job = opretHjemmeplejeScenarie();
  job.id = "opt-job-lokal-pulje";
  job.planlaegningspulje = klon(planlaegningspulje).map((opgave) => ({ ...opgave, kundeRef: null, tenantRef: job.tenantRef, partition: "nord" }));
  const lokaleLokationer = job.planlaegningspulje.flatMap((opgave, opgaveIndeks) => opgave.stop.map((post, stopIndeks) => ({
    id: post.lokationRef.id, tenantRef: job.tenantRef, reference: post.lokationRef, ejerKilde: post.lokationRef.kilde,
    navn: `Ukontrolleret syntetisk puljepunkt ${opgaveIndeks + 1}.${stopIndeks + 1}`,
    adresse: { adresselinje: post.lokation?.adresse || "Fiktiv ukontrolleret adresse", postnr: post.lokation?.postnummer || "0000", by: post.lokation?.by || "Demoby" },
    valideringsstatus: ADRESSESTATUS.KRAEVER_KONTROL, kontaktoplysninger: [], adgangsnoter: [], ekstrafelter: [], partition: "nord",
  })));
  job.lokationer = [...job.lokationer, ...lokaleLokationer];
  job.baselineplan = null;
  return job;
}

export function opretBenchmarkScenarie({ antalOpgaver = 2000, antalKoeretoejer = 190, maksOperationer = 6000 } = {}) {
  const partitionsantal = 100;
  const depoter = Array.from({ length: partitionsantal }, (_, i) => lokation(`bench-depot-${i}`, `bench-${i}`, i));
  const stopLokationer = Array.from({ length: antalOpgaver }, (_, i) => lokation(`bench-lok-${i}`, `bench-${i % partitionsantal}`, i + 1000));
  const lokationer = [...depoter, ...stopLokationer];
  const medarbejdere = Array.from({ length: 200 }, (_, i) => {
    const partition = `bench-${i % partitionsantal}`; const depot = depoter[i % partitionsantal];
    return medarbejder(`bench-med-${i}`, partition, i + 100, { startLokationRef: depot.reference, slutLokationRef: depot.reference, kompetencer: ["basis"], certifikater: [], tilgaengelighed: { vagter: [{ id: `bench-vagt-${i}`, fraMs: tid(6), tilMs: tid(23) }], fravaer: [] } });
  });
  const koeretoejer = Array.from({ length: antalKoeretoejer }, (_, i) => koeretoej(`bench-bil-${i}`, `bench-${i % partitionsantal}`, i + 100, "personbil", { kg: 500 }));
  const pulje = stopLokationer.map((lok, i) => ({
    id: `bench-opgave-${String(i).padStart(4, "0")}`, tenantRef: "tenant-fiktiv-optimering", titel: `Fiktiv benchmarkopgave ${i}`, prioritet: "NORMAL", partition: lok.partition,
    stop: [{ ...stop(`bench-stop-${i}`, lok.reference, i, {}, "SERVICE"), tidskrav: { art: TIDSFORM.FRI }, estimeretVarighedMin: 5 }], kilde: { art: "SYNTETISK_BENCHMARK" },
  }));
  const startSlutsteder = depoter.map((depot) => ({ partition: depot.partition, startLokationRef: depot.reference, slutLokationRef: depot.reference }));
  return baseJob("opt-job-benchmark", pulje, lokationer, { medarbejdere, koeretoejer, udstyr: [] }, startSlutsteder, OPTIMERINGSPROFILER.HJEMMEPLEJE, "matrix-benchmark-v1", { maksOperationer });
}

export function scenarieChecksum(resultat) {
  const tekst = resultat.dagsplanskladde.ruter.map((rute) => `${rute.medarbejderRefs[0].id}:${rute.stop.map((stop) => stop.sporbarhed.originalStopId).join(",")}`).sort().join("|")
    + `#${resultat.ikkePlanlagte.map((post) => post.originalOpgaveId).sort().join(",")}`;
  let hash = 2166136261;
  for (let i = 0; i < tekst.length; i += 1) { hash ^= tekst.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function opretOptimeringsDemoFixtures() {
  return { hjemmepleje: opretHjemmeplejeScenarie(), transport: opretTransportScenarie() };
}
