import {
  DAGSPLANSTATUS, FOREKOMSTSTATUS, REFERENCEART, REGELNIVEAU, RUTESTATUS, TIDSFORM,
  planningReference, referenceNoegle, validerDagsplan, validerSnapshot,
} from "../planning-basic.js";
import {
  ALGORITME, OPTIMERINGSKODE, OPTIMERINGSSTATUS, opretMatrixOpslag, optimeringsfund,
  segmentNoegle, validerOptimeringsjob, validerOptimeringsresultat,
} from "./kontrakt.js";
import { projicerPlanlaegningspulje, topologiskSorterBlokke } from "./projektion.js";

const MINUT = 60000;
const liste = (v) => Array.isArray(v) ? v : [];
const klon = (v) => structuredClone(v);
const refId = (v) => typeof v === "string" ? v : v?.id;
const prioritetPoint = Object.freeze({ AKUT: 1000, HOEJ: 100, NORMAL: 10, LAV: 1 });
const overlapper = (a, b) => a.fraMs < b.tilMs && b.fraMs < a.tilMs;
const adresseKlar = (status) => ["KLAR", "FORMATKONTROLLERET", "MANUELT_BEKRAEFTET", "GEOKODET", "valideret"].includes(status);

function unikkeFund(fund) {
  const sete = new Set();
  return fund.filter((post) => {
    const noegle = `${post.kode}:${JSON.stringify(post.detaljer || {})}`;
    if (sete.has(noegle)) return false;
    sete.add(noegle); return true;
  });
}

function segment(opslag, fraRef, tilRef) {
  return opslag.get(segmentNoegle(fraRef, tilRef)) || null;
}

function startSlutFor(job, medarbejder, partition) {
  const standard = liste(job.startSlutsteder).find((post) => post.partition === partition) || {};
  return {
    startLokationRef: medarbejder.startLokationRef || standard.startLokationRef,
    slutLokationRef: medarbejder.slutLokationRef || standard.slutLokationRef,
  };
}

function kravForBlokke(blokke) {
  return blokke.flatMap((blok) => blok.enheder.map((enhed) => enhed.opgave.krav));
}

function checkMedarbejder(medarbejder, blokke, job) {
  const fund = [];
  const kompetencer = new Set(liste(medarbejder.kompetencer));
  const certifikater = liste(medarbejder.certifikater);
  for (const krav of kravForBlokke(blokke)) {
    for (const kode of liste(krav.kompetencer)) if (!kompetencer.has(kode)) fund.push(optimeringsfund(OPTIMERINGSKODE.KOMPETENCE_MANGLER, { kode, medarbejderId: medarbejder.reference.id }));
    for (const kode of liste(krav.certifikater)) {
      const match = certifikater.filter((certifikat) => certifikat.kode === kode);
      if (!match.length) fund.push(optimeringsfund(OPTIMERINGSKODE.CERTIFIKAT_MANGLER, { kode, medarbejderId: medarbejder.reference.id }));
      else if (!match.some((certifikat) => Number.isFinite(certifikat.udloeberMs) && certifikat.udloeberMs >= job.beregningMs)) fund.push(optimeringsfund(OPTIMERINGSKODE.CERTIFIKAT_UDLOEBET, { kode, medarbejderId: medarbejder.reference.id }));
    }
  }
  return fund;
}

function checkKoeretoej(koeretoej, blokke) {
  const fund = [];
  for (const krav of kravForBlokke(blokke).map((post) => post.koeretoej || {})) {
    const harKrav = krav.paakraevet || liste(krav.typer).length || Object.keys(krav.kapacitet || {}).length;
    if (harKrav && !koeretoej) { fund.push(optimeringsfund(OPTIMERINGSKODE.KOERETOEJ_MANGLER)); continue; }
    if (!koeretoej) continue;
    if (liste(krav.typer).length && !krav.typer.includes(koeretoej.koeretoej?.type)) fund.push(optimeringsfund(OPTIMERINGSKODE.KOERETOEJSTYPE_FORKERT, { typer: krav.typer, faktisk: koeretoej.koeretoej?.type }));
    for (const [art, minimum] of Object.entries(krav.kapacitet || {})) if ((Number(koeretoej.koeretoej?.kapacitet?.[art]) || 0) < minimum) fund.push(optimeringsfund(OPTIMERINGSKODE.KAPACITET_UTILSTRAEKKELIG, { art, minimum, faktisk: Number(koeretoej.koeretoej?.kapacitet?.[art]) || 0 }));
  }
  return fund;
}

function checkUdstyr(job, blokke, brugteUdstyr = new Set()) {
  const tilgaengelige = new Map(liste(job.ressourcer?.udstyr).map((post) => [refId(post.reference), post]));
  const kravIder = [...new Set(kravForBlokke(blokke).flatMap((krav) => liste(krav.udstyrRefs).map(refId)).filter(Boolean))];
  const fund = [];
  for (const id of kravIder) if (!tilgaengelige.has(id) || brugteUdstyr.has(id)) fund.push(optimeringsfund(OPTIMERINGSKODE.UDSTYR_MANGLER, { id }));
  return { fund, udstyr: kravIder.map((id) => tilgaengelige.get(id)).filter(Boolean) };
}

function anvendTidskrav(enhed, ankomstMs) {
  const tidskrav = enhed.opgave.tidskrav;
  const varighedMin = enhed.opgave.varighedMin;
  if (!Number.isInteger(varighedMin) || varighedMin <= 0 || !tidskrav) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.TIDSRUM_MANGLER, { enhedId: enhed.id })] };
  let startMs = ankomstMs;
  if (tidskrav.art === TIDSFORM.FAST) {
    if (!Number.isFinite(tidskrav.startMs) || ankomstMs > tidskrav.startMs) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.TIDSRUM_MANGLER, { enhedId: enhed.id, tidsform: TIDSFORM.FAST })] };
    startMs = tidskrav.startMs;
  } else if (tidskrav.art === TIDSFORM.VINDUE) {
    if (!Number.isFinite(tidskrav.fraMs) || !Number.isFinite(tidskrav.tilMs)) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.TIDSRUM_MANGLER, { enhedId: enhed.id })] };
    startMs = Math.max(ankomstMs, tidskrav.fraMs);
    if (startMs + varighedMin * MINUT > tidskrav.tilMs) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.TIDSRUM_MANGLER, { enhedId: enhed.id, tidsform: TIDSFORM.VINDUE })] };
  } else if (tidskrav.art === TIDSFORM.DEADLINE) {
    if (!Number.isFinite(tidskrav.deadlineMs) || startMs + varighedMin * MINUT > tidskrav.deadlineMs) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.TIDSRUM_MANGLER, { enhedId: enhed.id, tidsform: TIDSFORM.DEADLINE })] };
  } else if (tidskrav.art !== TIDSFORM.FRI) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.TIDSRUM_MANGLER, { enhedId: enhed.id })] };
  return { ok: true, startMs, slutMs: startMs + varighedMin * MINUT, ventetidMin: (startMs - ankomstMs) / MINUT };
}

function beregnRute(job, medarbejder, koeretoej, blokke, opslag) {
  const fund = [...checkMedarbejder(medarbejder, blokke, job), ...checkKoeretoej(koeretoej, blokke)];
  const { startLokationRef, slutLokationRef } = startSlutFor(job, medarbejder, blokke[0]?.partition || medarbejder.partition);
  if (!startLokationRef || !slutLokationRef) fund.push(optimeringsfund(OPTIMERINGSKODE.JOB_UGYLDIGT, { årsag: "start/slut" }));
  const enheder = blokke.flatMap((blok) => blok.enheder);
  for (const enhed of enheder) if (!adresseKlar(enhed.adressestatus)) fund.push(optimeringsfund(OPTIMERINGSKODE.ADRESSE_IKKE_KLAR, { enhedId: enhed.id }));
  if (fund.length) return { ok: false, fund };
  const vagter = liste(medarbejder.tilgaengelighed?.vagter).sort((a, b) => a.fraMs - b.fraMs);
  if (!vagter.length) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.VAGT_MANGLER, { medarbejderId: medarbejder.reference.id })] };
  let markoer = Math.max(vagter[0].fraMs, job.planStartMs || vagter[0].fraMs);
  const ruteStartMs = markoer;
  let forrigeRef = startLokationRef;
  let samletKoeretidMin = 0, samletAfstandMeter = 0, samletServiceMin = 0, samletVentetidMin = 0;
  const stop = [];
  for (const enhed of enheder) {
    const tur = segment(opslag, forrigeRef, enhed.opgave.lokationRef);
    if (!tur) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.MATRIXSEGMENT_MANGLER, { fra: referenceNoegle(forrigeRef), til: referenceNoegle(enhed.opgave.lokationRef), enhedId: enhed.id })] };
    markoer += tur.rejsetidMin * MINUT;
    const ankomstMs = markoer;
    const tid = anvendTidskrav(enhed, ankomstMs);
    if (!tid.ok) return tid;
    stop.push({ enhed, ankomstMs, serviceStartMs: tid.startMs, afgangMs: tid.slutMs, koerselFoerMin: tur.rejsetidMin, afstandFoerMeter: tur.afstandMeter, ventetidMin: tid.ventetidMin });
    markoer = tid.slutMs; forrigeRef = enhed.opgave.lokationRef;
    samletKoeretidMin += tur.rejsetidMin; samletAfstandMeter += tur.afstandMeter;
    samletServiceMin += enhed.opgave.varighedMin; samletVentetidMin += tid.ventetidMin;
  }
  const hjem = segment(opslag, forrigeRef, slutLokationRef);
  if (!hjem) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.MATRIXSEGMENT_MANGLER, { fra: referenceNoegle(forrigeRef), til: referenceNoegle(slutLokationRef), hjemkoersel: true })] };
  markoer += hjem.rejsetidMin * MINUT; samletKoeretidMin += hjem.rejsetidMin; samletAfstandMeter += hjem.afstandMeter;
  if (!vagter.some((vagt) => vagt.fraMs <= ruteStartMs && vagt.tilMs >= markoer)) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.VAGT_MANGLER, { medarbejderId: medarbejder.reference.id })] };
  if (liste(medarbejder.tilgaengelighed?.fravaer).some((fravaer) => overlapper(fravaer, { fraMs: ruteStartMs, tilMs: markoer }))) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.FRAVAER_OVERLAP, { medarbejderId: medarbejder.reference.id })] };
  const ressourceRefs = [medarbejder.reference, ...(koeretoej ? [koeretoej.reference] : [])];
  const konflikt = liste(job.blokeredeRessourceintervaller).find((post) => ressourceRefs.some((ref) => referenceNoegle(ref) === referenceNoegle(post.ressourceRef)) && overlapper(post, { fraMs: ruteStartMs, tilMs: markoer }));
  if (konflikt) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.RESSOURCEKONFLIKT, { ressource: referenceNoegle(konflikt.ressourceRef), intervalId: konflikt.id })] };
  return { ok: true, fund: [], medarbejder, koeretoej, blokke, stop, startLokationRef, slutLokationRef, fraMs: ruteStartMs, tilMs: markoer, hjemkoerselMin: hjem.rejsetidMin, hjemafstandMeter: hjem.afstandMeter, samletKoeretidMin, samletAfstandMeter, samletServiceMin, samletVentetidMin };
}

function maalinger(ruter, totalBlokke, medarbejdere = []) {
  const belastning = new Map(medarbejdere.map((post) => [referenceNoegle(post.reference), 0]));
  for (const rute of ruter) belastning.set(referenceNoegle(rute.medarbejder.reference), (rute.tilMs - rute.fraMs) / MINUT);
  const arbejdsminutter = [...belastning.values()];
  const planlagteBlokke = ruter.reduce((sum, rute) => sum + rute.blokke.length, 0);
  const prioritetspoint = ruter.flatMap((rute) => rute.blokke).reduce((sum, blok) => sum + (prioritetPoint[blok.prioritet] || 0), 0);
  return {
    planlagteOpgaver: planlagteBlokke, ikkePlanlagteOpgaver: totalBlokke - planlagteBlokke,
    planlagteStop: ruter.reduce((sum, rute) => sum + rute.stop.length, 0), prioritetspoint,
    samletRejsetidMin: ruter.reduce((sum, rute) => sum + rute.samletKoeretidMin, 0),
    samletAfstandMeter: ruter.reduce((sum, rute) => sum + rute.samletAfstandMeter, 0),
    samletServiceMin: ruter.reduce((sum, rute) => sum + rute.samletServiceMin, 0),
    samletVentetidMin: ruter.reduce((sum, rute) => sum + rute.samletVentetidMin, 0),
    anvendteRuter: ruter.length, anvendteKoeretoejer: new Set(ruter.map((rute) => referenceNoegle(rute.koeretoej?.reference)).filter(Boolean)).size,
    belastningsspredningMin: arbejdsminutter.length ? Math.max(...arbejdsminutter) - Math.min(...arbejdsminutter) : 0,
  };
}

function profilOmkostning(maal, profil, kontinuitetsbrud = 0) {
  const v = profil.vaegte;
  return maal.samletRejsetidMin * (v.rejsetid || 0) + (maal.samletAfstandMeter / 1000) * (v.afstand || 0)
    + maal.belastningsspredningMin * (v.arbejdsbalance || 0) + maal.anvendteKoeretoejer * (v.koeretoejer || 0)
    + kontinuitetsbrud * (v.kontinuitet || 0);
}

function kontinuitetskontrol(ruter) {
  const grupper = new Map();
  for (const rute of ruter) for (const blok of rute.blokke) if (blok.kontinuitet?.noegle) {
    const listeVaerdi = grupper.get(blok.kontinuitet.noegle) || [];
    listeVaerdi.push({ blok, medarbejderId: rute.medarbejder.reference.id }); grupper.set(blok.kontinuitet.noegle, listeVaerdi);
  }
  let praferencebrud = 0;
  for (const gruppe of grupper.values()) {
    const antal = new Set(gruppe.map((post) => post.medarbejderId)).size;
    if (antal <= 1) continue;
    if (gruppe.some((post) => [REGELNIVEAU.HARD, REGELNIVEAU.CONTROLLED_EXCEPTION].includes(post.blok.kontinuitet.niveau))) return { ok: false, praferencebrud, fund: [optimeringsfund(OPTIMERINGSKODE.KONTINUITET_UGYLDIG)] };
    praferencebrud += antal - 1;
  }
  return { ok: true, praferencebrud, fund: [] };
}

function afhaengighedskontrol(ruter) {
  const placering = new Map();
  for (const rute of ruter) for (const blok of rute.blokke) {
    const stop = rute.stop.filter((post) => post.enhed.originalOpgaveId === blok.originalOpgaveId);
    placering.set(blok.originalOpgaveId, { startMs: stop[0]?.serviceStartMs, slutMs: stop.at(-1)?.afgangMs });
  }
  for (const rute of ruter) for (const blok of rute.blokke) for (const afhId of blok.afhaengerAfOpgaveIder) {
    const foran = placering.get(afhId); const efter = placering.get(blok.originalOpgaveId);
    if (!foran || !efter || foran.slutMs > efter.startMs) return { ok: false, fund: [optimeringsfund(OPTIMERINGSKODE.AFHAENGIGHED_UGYLDIG, { foran: afhId, efter: blok.originalOpgaveId })] };
  }
  return { ok: true, fund: [] };
}

function sammenlignKandidater(a, b) {
  return a.omkostning - b.omkostning || a.signatur.localeCompare(b.signatur, "da");
}

function koeretoejsmuligheder(job, rute, blok, brugteKoeretoejer) {
  if (rute?.koeretoej) return [rute.koeretoej];
  const krav = kravForBlokke([...(rute?.blokke || []), blok]).map((post) => post.koeretoej || {});
  const harKrav = krav.some((post) => post.paakraevet || liste(post.typer).length || Object.keys(post.kapacitet || {}).length);
  if (!harKrav) return [null];
  return liste(job.ressourcer?.koeretoejer).filter((bil) => bil.partition === blok.partition && !brugteKoeretoejer.has(referenceNoegle(bil.reference))).sort((a, b) => referenceNoegle(a.reference).localeCompare(referenceNoegle(b.reference), "da"));
}

function kandidaterForBlok(job, ruter, blok, opslag, operationer) {
  const kandidater = [], fund = [];
  if (blok.kontrolleredeUndtagelser.length) return { kandidater, fund: [optimeringsfund(OPTIMERINGSKODE.KONTROLLERET_UNDTAGELSE_KRAEVER_GODKENDELSE)], begraenset: false };
  const stoptyper = blok.enheder.map((enhed) => enhed.stoptype);
  if (stoptyper.includes("AFHENTNING") && stoptyper.includes("LEVERING") && stoptyper.indexOf("AFHENTNING") > stoptyper.indexOf("LEVERING")) return { kandidater, fund: [optimeringsfund(OPTIMERINGSKODE.AFHAENGIGHED_UGYLDIG, { årsag: "Afhentning skal ligge før levering" })], begraenset: false };
  const brugteKoeretoejer = new Set(ruter.map((rute) => referenceNoegle(rute.koeretoej?.reference)).filter(Boolean));
  const medarbejdere = liste(job.ressourcer?.medarbejdere).filter((post) => post.partition === blok.partition).sort((a, b) => referenceNoegle(a.reference).localeCompare(referenceNoegle(b.reference), "da"));
  if (!medarbejdere.length) fund.push(optimeringsfund(OPTIMERINGSKODE.MEDARBEJDER_MANGLER, { partition: blok.partition }));
  for (const medarbejder of medarbejdere) {
    const ruteIndeks = ruter.findIndex((post) => referenceNoegle(post.medarbejder.reference) === referenceNoegle(medarbejder.reference));
    const eksisterende = ruteIndeks >= 0 ? ruter[ruteIndeks] : null;
    const positioner = Array.from({ length: (eksisterende?.blokke.length || 0) + 1 }, (_, indeks) => indeks);
    const biler = koeretoejsmuligheder(job, eksisterende, blok, brugteKoeretoejer);
    if (!biler.length) fund.push(...checkKoeretoej(null, [...(eksisterende?.blokke || []), blok]));
    for (const koeretoej of biler) for (const position of positioner) {
      if (operationer.antal >= job.maksOperationer) return { kandidater, fund, begraenset: true };
      operationer.antal += 1;
      const blokke = [...(eksisterende?.blokke || [])]; blokke.splice(position, 0, blok);
      const udstyrSvar = checkUdstyr(job, blokke, new Set(ruter.filter((_, i) => i !== ruteIndeks).flatMap((rute) => rute.udstyr.map((post) => post.reference.id))));
      if (udstyrSvar.fund.length) { fund.push(...udstyrSvar.fund); continue; }
      const beregnet = beregnRute(job, medarbejder, koeretoej, blokke, opslag);
      if (!beregnet.ok) { fund.push(...beregnet.fund); continue; }
      beregnet.udstyr = udstyrSvar.udstyr;
      const udstyrKonflikt = liste(job.blokeredeRessourceintervaller).find((post) => beregnet.udstyr.some((enhed) => referenceNoegle(enhed.reference) === referenceNoegle(post.ressourceRef)) && overlapper(post, beregnet));
      if (udstyrKonflikt) { fund.push(optimeringsfund(OPTIMERINGSKODE.RESSOURCEKONFLIKT, { ressource: referenceNoegle(udstyrKonflikt.ressourceRef), intervalId: udstyrKonflikt.id })); continue; }
      const nyeRuter = ruteIndeks >= 0 ? ruter.map((rute, i) => i === ruteIndeks ? beregnet : rute) : [...ruter, beregnet];
      const kontinuitet = kontinuitetskontrol(nyeRuter);
      if (!kontinuitet.ok) { fund.push(...kontinuitet.fund); continue; }
      const afhaengighed = afhaengighedskontrol(nyeRuter);
      if (!afhaengighed.ok) { fund.push(...afhaengighed.fund); continue; }
      const maal = maalinger(nyeRuter, job.planlaegningspulje.length, job.ressourcer.medarbejdere);
      kandidater.push({ ruter: nyeRuter, omkostning: profilOmkostning(maal, job.profil, kontinuitet.praferencebrud), signatur: `${referenceNoegle(medarbejder.reference)}|${referenceNoegle(koeretoej?.reference) || "uden"}|${blokke.map((post) => post.id).join(",")}` });
    }
  }
  return { kandidater, fund, begraenset: false };
}

function forbedrRuter(job, ruter, opslag, operationer) {
  let aktuelle = ruter, runder = 0;
  for (let ruteIndeks = 0; ruteIndeks < aktuelle.length && operationer.antal < job.maksOperationer; ruteIndeks += 1) {
    const rute = aktuelle[ruteIndeks];
    let bedste = rute;
    for (let indeks = 0; indeks < rute.blokke.length - 1 && operationer.antal < job.maksOperationer; indeks += 1) {
      operationer.antal += 1;
      const byttet = [...rute.blokke]; [byttet[indeks], byttet[indeks + 1]] = [byttet[indeks + 1], byttet[indeks]];
      const beregnet = beregnRute(job, rute.medarbejder, rute.koeretoej, byttet, opslag);
      if (beregnet.ok) {
        beregnet.udstyr = rute.udstyr;
        const foreslaaedeRuter = aktuelle.map((post, i) => i === ruteIndeks ? beregnet : post);
        if (!afhaengighedskontrol(foreslaaedeRuter).ok) continue;
        const foerRuter = aktuelle.map((post, i) => i === ruteIndeks ? bedste : post);
        const efterRuter = aktuelle.map((post, i) => i === ruteIndeks ? beregnet : post);
        const foer = profilOmkostning(maalinger(foerRuter, job.planlaegningspulje.length, job.ressourcer.medarbejdere), job.profil);
        const efter = profilOmkostning(maalinger(efterRuter, job.planlaegningspulje.length, job.ressourcer.medarbejdere), job.profil);
        if (efter < foer) { bedste = beregnet; runder += 1; }
      }
    }
    aktuelle = aktuelle.map((post, i) => i === ruteIndeks ? bedste : post);
  }
  return { ruter: aktuelle, runder };
}

function tilDomaene(job, projektion, ruter, ikkePlanlagte) {
  const dagsplanId = `${job.id}--dagsplan`;
  const planlagteIder = new Set(ruter.flatMap((rute) => rute.stop.map((stop) => stop.enhed.forekomst.id)));
  const domaeneRuter = ruter.map((rute, indeks) => {
    const id = `${job.id}--rute-${String(indeks + 1).padStart(3, "0")}`;
    const ressourceRefs = [rute.medarbejder.reference, ...(rute.koeretoej ? [rute.koeretoej.reference] : []), ...rute.udstyr.map((post) => post.reference)];
    return {
      id, reference: planningReference(REFERENCEART.RUTE, id), dagsplanId, status: RUTESTATUS.KLADDE,
      fraMs: rute.fraMs, tilMs: rute.tilMs, medarbejderRefs: [rute.medarbejder.reference],
      koeretoejRefs: rute.koeretoej ? [rute.koeretoej.reference] : [], udstyrRefs: rute.udstyr.map((post) => post.reference),
      startLokationRef: rute.startLokationRef, slutLokationRef: rute.slutLokationRef,
      stop: rute.stop.map((post, stopIndeks) => ({
        id: `${id}--stop-${String(stopIndeks + 1).padStart(3, "0")}`, raekkefoelge: stopIndeks + 1,
        opgaveforekomstId: post.enhed.forekomst.id, opgaveRef: post.enhed.opgave.reference, lokationRef: post.enhed.opgave.lokationRef,
        fraMs: post.serviceStartMs, tilMs: post.afgangMs,
        forventetAnkomstMs: post.ankomstMs, serviceStartMs: post.serviceStartMs, afgangMs: post.afgangMs,
        koerselFoerMin: post.koerselFoerMin, afstandFoerMeter: post.afstandFoerMeter, ventetidMin: post.ventetidMin,
        sporbarhed: { originalOpgaveId: post.enhed.originalOpgaveId, originalStopId: post.enhed.originalStopId, eksternReference: post.enhed.eksternReference, batchId: post.enhed.batchId },
        udfoerelsessnapshot: klon(post.enhed.udfoerelsessnapshot),
      })),
      ressourcebrug: ressourceRefs.map((ref, ressourceIndeks) => ({ id: `${id}--ressource-${ressourceIndeks + 1}`, ressourceRef: ref, fraMs: rute.fraMs, tilMs: rute.tilMs })),
      maalinger: { samletKoeretidMin: rute.samletKoeretidMin, samletAfstandMeter: rute.samletAfstandMeter, samletServiceMin: rute.samletServiceMin, samletVentetidMin: rute.samletVentetidMin, hjemkoerselMin: rute.hjemkoerselMin },
      blokIder: rute.blokke.map((blok) => blok.id),
    };
  });
  const ikkeTildelteForekomstIder = projektion.opgaveforekomster.filter((forekomst) => !planlagteIder.has(forekomst.id)).map((forekomst) => forekomst.id);
  const dagsplan = { id: dagsplanId, dato: job.dato, tidszone: job.tidszone, version: Number(job.inputversion) || 1, status: DAGSPLANSTATUS.KLADDE, beregnetMs: job.beregningMs, ruter: domaeneRuter, ikkeTildelteForekomstIder };
  const snapshot = { opgaver: projektion.opgaver, opgaveforekomster: projektion.opgaveforekomster.map((forekomst) => ({ ...forekomst, status: planlagteIder.has(forekomst.id) ? FOREKOMSTSTATUS.PLANLAGT : FOREKOMSTSTATUS.IKKE_PLANLAGT })), ressourcer: [...liste(job.ressourcer.medarbejdere), ...liste(job.ressourcer.koeretoejer), ...liste(job.ressourcer.udstyr)], kunder: [], lokationer: job.lokationer, dagsplaner: [dagsplan] };
  const snapshotSvar = validerSnapshot(snapshot, { beregningMs: job.beregningMs });
  const dagsplanSvar = validerDagsplan(dagsplan, { snapshot, beregningMs: job.beregningMs });
  return { dagsplan, snapshot, domænevalidering: { ok: snapshotSvar.ok && dagsplanSvar.ok, fund: unikkeFund([...snapshotSvar.fund, ...dagsplanSvar.fund]) }, ikkePlanlagte };
}

function baselineMaalinger(job, projektion, opslag) {
  if (!job.baselineplan?.ruter) return maalinger([], projektion.blokke.length, job.ressourcer.medarbejdere);
  const blokMap = new Map(projektion.blokke.map((blok) => [blok.originalOpgaveId, blok]));
  const medMap = new Map(liste(job.ressourcer.medarbejdere).map((post) => [refId(post.reference), post]));
  const bilMap = new Map(liste(job.ressourcer.koeretoejer).map((post) => [refId(post.reference), post]));
  const ruter = [];
  for (const planrute of job.baselineplan.ruter) {
    const blokke = liste(planrute.opgaveIder).map((id) => blokMap.get(id)).filter(Boolean);
    const udstyrSvar = checkUdstyr(job, blokke);
    if (udstyrSvar.fund.length) continue;
    const beregnet = beregnRute(job, medMap.get(refId(planrute.medarbejderRef)), bilMap.get(refId(planrute.koeretoejRef)) || null, blokke, opslag);
    if (beregnet.ok) { beregnet.udstyr = udstyrSvar.udstyr; ruter.push(beregnet); }
  }
  return maalinger(ruter, projektion.blokke.length, job.ressourcer.medarbejdere);
}

export function optimerDagsplan(jobInput) {
  const job = klon(jobInput);
  const jobSvar = validerOptimeringsjob(job);
  if (!jobSvar.ok) return { jobId: job?.id || null, inputversion: job?.inputversion || null, status: OPTIMERINGSSTATUS.UGYLDIG, fund: jobSvar.fund, globaltOptimalitetsbevis: false, algoritme: ALGORITME };
  const projektion = projicerPlanlaegningspulje(job.planlaegningspulje, job.dato);
  const topo = topologiskSorterBlokke(projektion.blokke);
  const opslag = opretMatrixOpslag(job.matrix);
  const operationer = { antal: 0 };
  let ruter = [];
  const ikkePlanlagte = [];
  const afhaengighedsfejl = new Set([...topo.ukendte.map((post) => post.blokId), ...topo.cykliske.map((post) => post.id)]);
  for (const blok of projektion.blokke.filter((post) => afhaengighedsfejl.has(post.id))) ikkePlanlagte.push({ blok, fund: [optimeringsfund(OPTIMERINGSKODE.AFHAENGIGHED_UGYLDIG)] });
  const niveau = new Map();
  for (const blok of topo.blokke) niveau.set(blok.id, blok.afhaengerAfOpgaveIder.reduce((max, id) => Math.max(max, (niveau.get(`blok:${id}`) || 0) + 1), 0));
  const ressourceMuligheder = (blok) => liste(job.ressourcer.medarbejdere).filter((medarbejder) => medarbejder.partition === blok.partition && checkMedarbejder(medarbejder, [blok], job).length === 0).length;
  const tidsstramhed = (blok) => {
    const krav = blok.enheder[0]?.opgave.tidskrav;
    if (krav?.art === TIDSFORM.FAST) return 0;
    if (krav?.art === TIDSFORM.VINDUE) return krav.tilMs - krav.fraMs;
    if (krav?.art === TIDSFORM.DEADLINE) return krav.deadlineMs - (job.planStartMs || 0);
    return Number.MAX_SAFE_INTEGER;
  };
  const ordnede = [...topo.blokke].sort((a, b) => (niveau.get(a.id) - niveau.get(b.id)) || (prioritetPoint[b.prioritet] || 0) - (prioritetPoint[a.prioritet] || 0) || ressourceMuligheder(a) - ressourceMuligheder(b) || tidsstramhed(a) - tidsstramhed(b) || a.id.localeCompare(b.id, "da"));
  let begraenset = false;
  for (let indeks = 0; indeks < ordnede.length; indeks += 1) {
    const blok = ordnede[indeks];
    const svar = kandidaterForBlok(job, ruter, blok, opslag, operationer);
    if (svar.begraenset) {
      begraenset = true;
      for (const rest of ordnede.slice(indeks)) ikkePlanlagte.push({ blok: rest, fund: [optimeringsfund(OPTIMERINGSKODE.OPERATIONS_GRAENSE)] });
      break;
    }
    if (!svar.kandidater.length) ikkePlanlagte.push({ blok, fund: unikkeFund(svar.fund.length ? svar.fund : [optimeringsfund(OPTIMERINGSKODE.MEDARBEJDER_MANGLER)]) });
    else ruter = svar.kandidater.sort(sammenlignKandidater)[0].ruter;
  }
  const forbedring = forbedrRuter(job, ruter, opslag, operationer); ruter = forbedring.ruter;
  if (operationer.antal >= job.maksOperationer) begraenset = true;
  const domaene = tilDomaene(job, projektion, ruter, ikkePlanlagte);
  const foer = baselineMaalinger(job, projektion, opslag);
  const efter = maalinger(ruter, projektion.blokke.length, job.ressourcer.medarbejdere);
  const resultat = {
    id: `${job.id}--resultat`, jobId: job.id, inputversion: job.inputversion, beregnetMs: job.beregningMs,
    status: begraenset ? OPTIMERINGSSTATUS.BEGRAENSET : OPTIMERINGSSTATUS.BEREGNET,
    algoritme: ALGORITME, globaltOptimalitetsbevis: false,
    forklaring: "Bedste fundne plan – globalt optimum er ikke bevist.",
    dagsplanskladde: domaene.dagsplan, snapshot: domaene.snapshot, domænevalidering: domaene.domænevalidering,
    ikkePlanlagte: ikkePlanlagte.map(({ blok, fund }) => ({ blokId: blok.id, originalOpgaveId: blok.originalOpgaveId, forekomstIder: blok.enheder.map((enhed) => enhed.forekomst.id), stopIder: blok.enheder.map((enhed) => enhed.originalStopId), fund })),
    maalinger: { foer, efter, delta: Object.fromEntries(Object.keys(efter).map((noegle) => [noegle, efter[noegle] - (foer[noegle] || 0)])) },
    antalEvalueringer: operationer.antal, antalForbedringsrunder: forbedring.runder, operationsgraenseNaaet: begraenset,
    fund: begraenset ? [optimeringsfund(OPTIMERINGSKODE.OPERATIONS_GRAENSE)] : [],
  };
  const resultatSvar = validerOptimeringsresultat(resultat);
  if (!resultatSvar.ok || !domaene.domænevalidering.ok) return { ...resultat, status: OPTIMERINGSSTATUS.UGYLDIG, fund: unikkeFund([...resultatSvar.fund, ...domaene.domænevalidering.fund]) };
  return resultat;
}
