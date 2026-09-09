/* Rene operationer for genbrugelige ruteskabeloner og versionsbundne dagsruter. */

import {
  AARSAGSKODE, AFHAENGIGHEDSART, GENTAGELSESART, KILDE, REFERENCEART,
  REGELNIVEAU, RUTESTATUS,
  kontrollerKompetencerOgCertifikater, kontrollerKoeretoejstypeOgKapacitet,
  kontrollerTilgaengelighed, referenceNoegle, validerGentagelse,
  validerTidskrav, validerTypedReference,
} from "./planning-basic.js";
import {
  AARSAGSKODE_V2, SKABELONSTATUS, SKABELONSTOPSTATUS, TILDELINGSMETODE,
  nytV2Fund, v2Resultat,
} from "./planning-basic-v2-kontrakt.js";

const tekst = (v) => typeof v === "string" && v.trim().length > 0;
const liste = (v) => Array.isArray(v) ? v : [];
const objekt = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const erDato = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) return false;
  const dato = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(dato.getTime()) && dato.toISOString().slice(0, 10) === v;
};
const erTidszone = (v) => {
  if (!tekst(v)) return false;
  try { new Intl.DateTimeFormat("da-DK", { timeZone: v }).format(0); return true; } catch { return false; }
};
const klon = (v) => JSON.parse(JSON.stringify(v));

function normaliserRaekkefoelge(stop) {
  return stop.map((s, i) => ({ ...s, raekkefoelge: i + 1 }));
}

function nyVersion(skabelon, stop) {
  return { ...klon(skabelon), version: skabelon.version + 1, stop: normaliserRaekkefoelge(stop) };
}

function validerStandardTildeling(tildeling, art, sti) {
  const fund = [];
  const metoder = new Set(Object.values(TILDELINGSMETODE));
  if (!objekt(tildeling) || !metoder.has(tildeling.metode)) {
    return [nytV2Fund(AARSAGSKODE_V2.TILDELINGSMETODE_UGYLDIG, "Standardtildelingen har en ukendt tildelingsmåde.", { sti })];
  }
  if (tildeling.metode === TILDELINGSMETODE.INGEN && tildeling.ressourceRef != null) {
    fund.push(nytV2Fund(AARSAGSKODE_V2.TILDELINGSREFERENCE_UVENTET, "INGEN må ikke indeholde en standardressource.", { sti: `${sti}.ressourceRef` }));
  }
  if (tildeling.metode !== TILDELINGSMETODE.INGEN && tildeling.ressourceRef == null) {
    fund.push(nytV2Fund(AARSAGSKODE_V2.TILDELINGSREFERENCE_MANGLER, `${tildeling.metode} kræver en konkret standardressource.`, { sti: `${sti}.ressourceRef` }));
  }
  if (tildeling.ressourceRef != null) {
    fund.push(...validerTypedReference(tildeling.ressourceRef, { forventetArt: art, sti: `${sti}.ressourceRef` }).fund);
  }
  return fund;
}

export function validerRuteskabelon(skabelon) {
  const fund = [];
  const basis = `ruteskabeloner.${skabelon?.id || "ukendt"}`;
  if (!objekt(skabelon) || !tekst(skabelon.id) || !tekst(skabelon.navn)) {
    return v2Resultat([nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_UGYLDIG, "Ruteskabelonen mangler stabilt id eller navn.", { sti: basis, objektId: skabelon?.id })]);
  }
  fund.push(...validerTypedReference(skabelon.reference, {
    forventetArt: REFERENCEART.RUTESKABELON, tilladteKilder: [KILDE.PLANNING],
    sti: `${basis}.reference`, objektId: skabelon.id,
  }).fund);
  if (skabelon.reference?.id !== skabelon.id) fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_UGYLDIG, "Skabelonens reference-id skal svare til dens id.", { sti: `${basis}.reference.id`, objektId: skabelon.id }));
  if (!Object.values(SKABELONSTATUS).includes(skabelon.status)) fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_UGYLDIG, "Ruteskabelonen har en ukendt status.", { sti: `${basis}.status`, objektId: skabelon.id }));
  if (!Number.isInteger(skabelon.version) || skabelon.version <= 0) fund.push(nytV2Fund(AARSAGSKODE_V2.SKABELON_VERSION_UGYLDIG, "Skabelonversionen skal være et positivt heltal.", { sti: `${basis}.version`, objektId: skabelon.id }));
  if (!erDato(skabelon.gyldigFra) || (skabelon.gyldigTil != null && (!erDato(skabelon.gyldigTil) || skabelon.gyldigTil < skabelon.gyldigFra))) {
    fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_GYLDIGHED_UGYLDIG, "Gyldighedsperioden skal bestå af gyldige lokale datoer i rigtig rækkefølge.", { sti: `${basis}.gyldighed`, objektId: skabelon.id }));
  }
  fund.push(...validerGentagelse(skabelon.gentagelse, { sti: `${basis}.gentagelse`, objektId: skabelon.id }).fund);
  fund.push(...validerTypedReference(skabelon.startLokationRef, { forventetArt: REFERENCEART.LOKATION, sti: `${basis}.startLokationRef`, objektId: skabelon.id }).fund);
  fund.push(...validerTypedReference(skabelon.slutLokationRef, { forventetArt: REFERENCEART.LOKATION, sti: `${basis}.slutLokationRef`, objektId: skabelon.id }).fund);
  fund.push(...validerStandardTildeling(skabelon.standardTildeling?.medarbejder, REFERENCEART.MEDARBEJDER, `${basis}.standardTildeling.medarbejder`));
  fund.push(...validerStandardTildeling(skabelon.standardTildeling?.koeretoej, REFERENCEART.KOERETOEJ, `${basis}.standardTildeling.koeretoej`));
  if (skabelon.standardVarighedMin != null && (!Number.isFinite(skabelon.standardVarighedMin) || skabelon.standardVarighedMin <= 0)) {
    fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_UGYLDIG, "Standardestimatet skal være et positivt antal minutter.", { sti: `${basis}.standardVarighedMin`, objektId: skabelon.id }));
  }
  for (const [i, ref] of liste(skabelon.standardKrav?.udstyrRefs).entries()) fund.push(...validerTypedReference(ref, { forventetArt: REFERENCEART.UDSTYR, sti: `${basis}.standardKrav.udstyrRefs[${i}]`, objektId: skabelon.id }).fund);

  const stopIder = new Set();
  const aktiveStopIder = new Set();
  let forrige = 0;
  for (const [i, stop] of liste(skabelon.stop).entries()) {
    const sti = `${basis}.stop[${i}]`;
    if (!objekt(stop) || !tekst(stop.id) || !Object.values(SKABELONSTOPSTATUS).includes(stop.status)) fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_STOP_UGYLDIG, "Et skabelonstop kræver stabilt id og kendt status.", { sti, objektId: stop?.id }));
    if (stopIder.has(stop?.id)) fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_STOP_DUBLET, "Skabelonstoppets id forekommer flere gange.", { sti, objektId: stop?.id }));
    stopIder.add(stop?.id);
    if (stop?.status === SKABELONSTOPSTATUS.AKTIV) aktiveStopIder.add(stop.id);
    if (!Number.isInteger(stop?.raekkefoelge) || stop.raekkefoelge <= forrige) fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_STOP_RAEKKEFOELGE, "Skabelonstop skal stå i entydigt stigende rækkefølge.", { sti: `${sti}.raekkefoelge`, objektId: stop?.id }));
    forrige = stop?.raekkefoelge;
    fund.push(...validerTypedReference(stop?.maalRef, { tilladteArter: [REFERENCEART.KUNDE, REFERENCEART.OPGAVE, REFERENCEART.LOKATION], sti: `${sti}.maalRef`, objektId: stop?.id }).fund);
    fund.push(...validerTypedReference(stop?.lokationRef, { forventetArt: REFERENCEART.LOKATION, sti: `${sti}.lokationRef`, objektId: stop?.id }).fund);
    fund.push(...validerTidskrav(stop?.tidskrav, { varighedMin: stop?.estimeretVarighedMin, sti: `${sti}.tidskrav`, objektId: stop?.id }).fund);
    for (const [j, ref] of liste(stop?.krav?.udstyrRefs).entries()) fund.push(...validerTypedReference(ref, { forventetArt: REFERENCEART.UDSTYR, sti: `${sti}.krav.udstyrRefs[${j}]`, objektId: stop?.id }).fund);
  }
  if (!aktiveStopIder.size) fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_STOP_UGYLDIG, "En aktiv ruteskabelon kræver mindst ét aktivt stop.", { sti: `${basis}.stop`, objektId: skabelon.id }));
  for (const [i, pause] of liste(skabelon.pauser).entries()) {
    if (!tekst(pause?.id) || !tekst(pause?.efterStopId) || !aktiveStopIder.has(pause.efterStopId) || !Number.isFinite(pause.varighedMin) || pause.varighedMin <= 0) {
      fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_PAUSE_UGYLDIG, "En standardpause kræver id, positiv varighed og et kendt aktivt forudgående stop.", { sti: `${basis}.pauser[${i}]`, objektId: pause?.id }));
    }
  }
  const graf = new Map(liste(skabelon.stop).map((s) => [s.id, []]));
  const tidsligeArter = new Set([AFHAENGIGHEDSART.EFTER, AFHAENGIGHEDSART.AFHENTNING_FOER_LEVERING]);
  for (const [i, stop] of liste(skabelon.stop).entries()) {
    for (const [j, afh] of liste(stop.afhaengigheder).entries()) {
      const sti = `${basis}.stop[${i}].afhaengigheder[${j}]`;
      if (!Object.values(AFHAENGIGHEDSART).includes(afh?.art)) fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_STOP_UGYLDIG, "Stopafhængigheden har en ukendt art.", { sti, objektId: stop.id }));
      if (afh?.niveau != null && !Object.values(REGELNIVEAU).includes(afh.niveau)) fund.push({ kode: AARSAGSKODE.REGELNIVEAU_UKENDT, tekst: "Stopafhængigheden har et ukendt regelniveau.", niveau: REGELNIVEAU.HARD, sti, objektId: stop.id, reference: `${AARSAGSKODE.REGELNIVEAU_UKENDT}:${stop.id}:${sti}` });
      if (afh?.art !== AFHAENGIGHEDSART.UAFHAENGIG) {
        if (!tekst(afh?.stopId) || !stopIder.has(afh.stopId)) fund.push({ kode: AARSAGSKODE.AFHAENGIGHED_UKENDT, tekst: "Stopafhængigheden peger på et ukendt skabelonstop.", niveau: REGELNIVEAU.HARD, sti, objektId: stop.id, reference: `${AARSAGSKODE.AFHAENGIGHED_UKENDT}:${stop.id}:${sti}` });
        else if (afh.stopId === stop.id) fund.push({ kode: AARSAGSKODE.AFHAENGIGHED_SELREFERENCE, tekst: "Et skabelonstop må ikke afhænge af sig selv.", niveau: REGELNIVEAU.HARD, sti, objektId: stop.id, reference: `${AARSAGSKODE.AFHAENGIGHED_SELREFERENCE}:${stop.id}:${sti}` });
        else if (stop.status === SKABELONSTOPSTATUS.AKTIV && !aktiveStopIder.has(afh.stopId)) fund.push({ kode: AARSAGSKODE.AFHAENGIGHED_UKENDT, tekst: "Et aktivt skabelonstop må ikke afhænge af et inaktivt stop.", niveau: REGELNIVEAU.HARD, sti, objektId: stop.id, reference: `${AARSAGSKODE.AFHAENGIGHED_UKENDT}:${stop.id}:${sti}` });
        else if (stop.status === SKABELONSTOPSTATUS.AKTIV && tidsligeArter.has(afh.art)) graf.get(stop.id).push(afh.stopId);
      }
    }
  }
  const besoeger = new Set();
  const besoegt = new Set();
  const harCyklus = (id) => {
    if (besoeger.has(id)) return true;
    if (besoegt.has(id)) return false;
    besoeger.add(id);
    if (liste(graf.get(id)).some(harCyklus)) return true;
    besoeger.delete(id);
    besoegt.add(id);
    return false;
  };
  if ([...graf.keys()].some(harCyklus)) fund.push({ kode: AARSAGSKODE.AFHAENGIGHED_CYKLUS, tekst: "Skabelonens stopafhængigheder indeholder en cyklus.", niveau: REGELNIVEAU.HARD, sti: `${basis}.stop.afhaengigheder`, objektId: skabelon.id, reference: `${AARSAGSKODE.AFHAENGIGHED_CYKLUS}:${skabelon.id}:stop.afhaengigheder` });
  return v2Resultat(fund);
}

export function tilfoejSkabelonStop(skabelon, stop) {
  return nyVersion(skabelon, [...klon(skabelon.stop), klon(stop)]);
}

export function fjernSkabelonStop(skabelon, stopId) {
  return {
    ...nyVersion(skabelon, klon(skabelon.stop).filter((s) => s.id !== stopId)),
    pauser: klon(skabelon.pauser).filter((p) => p.efterStopId !== stopId),
  };
}

export function deaktiverSkabelonStop(skabelon, stopId) {
  return {
    ...nyVersion(skabelon, klon(skabelon.stop).map((s) => s.id === stopId ? { ...s, status: SKABELONSTOPSTATUS.INAKTIV } : s)),
    pauser: klon(skabelon.pauser).filter((p) => p.efterStopId !== stopId),
  };
}

export function flytSkabelonStop(skabelon, stopId, nytIndeks) {
  const stop = klon(skabelon.stop);
  const gammeltIndeks = stop.findIndex((s) => s.id === stopId);
  if (gammeltIndeks < 0 || !Number.isInteger(nytIndeks) || nytIndeks < 0 || nytIndeks >= stop.length) return nyVersion(skabelon, stop);
  const [flyttet] = stop.splice(gammeltIndeks, 1);
  stop.splice(nytIndeks, 0, flyttet);
  return nyVersion(skabelon, stop);
}

export function aendrSkabelonStopvarighed(skabelon, stopId, estimeretVarighedMin) {
  return nyVersion(skabelon, klon(skabelon.stop).map((s) => s.id === stopId ? { ...s, estimeretVarighedMin } : s));
}

function vaelgRessource(standard, konkret) {
  if (konkret) return konkret;
  return standard?.metode === TILDELINGSMETODE.INGEN ? null : standard?.ressourceRef || null;
}

function gentagelseMatcherDato(skabelon, dato) {
  const regel = skabelon.gentagelse;
  if (!regel || !erDato(dato) || !erDato(skabelon.gyldigFra)) return false;
  const aktuel = new Date(`${dato}T00:00:00Z`);
  const start = new Date(`${skabelon.gyldigFra}T00:00:00Z`);
  const dage = Math.floor((aktuel.getTime() - start.getTime()) / 86400000);
  const ugedag = aktuel.getUTCDay() || 7;
  if (regel.art === GENTAGELSESART.DAGLIG) return dage >= 0 && dage % regel.interval === 0;
  if (regel.art === GENTAGELSESART.UGEDAGE) return regel.ugedage.includes(ugedag);
  if (regel.art === GENTAGELSESART.HVER_N_UGE) return dage >= 0 && Math.floor(dage / 7) % regel.interval === 0 && regel.ugedage.includes(ugedag);
  if (regel.art === GENTAGELSESART.HVER_N_MAANED) {
    const maaneder = (aktuel.getUTCFullYear() - start.getUTCFullYear()) * 12 + aktuel.getUTCMonth() - start.getUTCMonth();
    return maaneder >= 0 && maaneder % regel.interval === 0 && aktuel.getUTCDate() === regel.maanedsdag;
  }
  return regel.art === GENTAGELSESART.KOPI;
}

export function opretDagsruteFraSkabelon(skabelon, {
  id, dagsplanId, tenantRef, dato, tidszone, planlagtStartMs,
  medarbejderRef = null, koeretoejRef = null,
} = {}) {
  const fund = [...validerRuteskabelon(skabelon).fund];
  if (!tekst(id) || !tekst(dagsplanId) || !tekst(tenantRef) || !erDato(dato) || !erTidszone(tidszone) || !Number.isFinite(planlagtStartMs)) {
    fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_UGYLDIG, "Oprettelse af dagsrute kræver id, dagsplan, tenant, dato, tidszone og eksplicit starttid.", { sti: "dagsrute", objektId: id }));
  }
  if (erDato(dato) && (dato < skabelon.gyldigFra || (skabelon.gyldigTil && dato > skabelon.gyldigTil))) fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_DATO_UDEN_FOR_GYLDIGHED, "Dagsrutens dato ligger uden for skabelonens gyldighedsperiode.", { sti: "dagsrute.dato", objektId: id }));
  if (erDato(dato) && !gentagelseMatcherDato(skabelon, dato)) fund.push(nytV2Fund(AARSAGSKODE_V2.RUTESKABELON_GENTAGELSE_MATCHER_IKKE, "Dagsrutens dato matcher ikke skabelonens gentagelsesregel.", { sti: "dagsrute.dato", objektId: id }));
  if (fund.some((f) => f.niveau !== REGELNIVEAU.PREFERENCE)) return v2Resultat(fund, { rute: null });
  const snapshot = klon(skabelon);
  const medarbejder = vaelgRessource(snapshot.standardTildeling.medarbejder, medarbejderRef);
  const koeretoej = vaelgRessource(snapshot.standardTildeling.koeretoej, koeretoejRef);
  const stopforekomster = snapshot.stop.filter((s) => s.status === SKABELONSTOPSTATUS.AKTIV).map((s, i) => ({
    id: `${id}:${s.id}`, skabelonStopId: s.id, raekkefoelge: i + 1,
    maalRef: s.maalRef, lokationRef: s.lokationRef,
    estimeretVarighedMin: s.estimeretVarighedMin, tidskrav: s.tidskrav,
    krav: s.krav || {}, afhaengigheder: liste(s.afhaengigheder).map((a) => a.stopId ? { ...a, stopforekomstId: `${id}:${a.stopId}` } : a),
  }));
  const pauser = snapshot.pauser.filter((p) => stopforekomster.some((s) => s.skabelonStopId === p.efterStopId)).map((p) => ({
    ...p, efterStopforekomstId: `${id}:${p.efterStopId}`,
  }));
  const rute = {
    id, reference: { kilde: KILDE.PLANNING, art: REFERENCEART.RUTE, id }, dagsplanId,
    tenantRef, dato, tidszone, status: RUTESTATUS.KLADDE, rutetype: snapshot.rutetype || null,
    planlagtStartMs, fraMs: planlagtStartMs,
    tilMs: Number.isFinite(snapshot.standardVarighedMin) ? planlagtStartMs + snapshot.standardVarighedMin * 60000 : null,
    startLokationRef: snapshot.startLokationRef, slutLokationRef: snapshot.slutLokationRef,
    medarbejderRefs: medarbejder ? [medarbejder] : [], koeretoejRefs: koeretoej ? [koeretoej] : [],
    udstyrRefs: klon(snapshot.standardKrav?.udstyrRefs || []), stopforekomster, pauser,
    skabelonBinding: { skabelonRef: snapshot.reference, version: snapshot.version, snapshot },
  };
  return v2Resultat(fund, { rute });
}

export function validerSkabelonDagsrute(rute) {
  const fund = [];
  const binding = rute?.skabelonBinding;
  if (!objekt(binding) || !objekt(binding.snapshot)) return v2Resultat([nytV2Fund(AARSAGSKODE_V2.SKABELON_SNAPSHOT_MANGLER, "Dagsruten mangler sit versionsbundne skabelonsnapshot.", { sti: "skabelonBinding", objektId: rute?.id })]);
  if (binding.version !== binding.snapshot.version || referenceNoegle(binding.skabelonRef) !== referenceNoegle(binding.snapshot.reference)) {
    fund.push(nytV2Fund(AARSAGSKODE_V2.SKABELON_SNAPSHOT_UOVERENSSTEMMELSE, "Skabelonbindingens reference eller version svarer ikke til snapshotet.", { sti: "skabelonBinding", objektId: rute?.id }));
  }
  const forventede = binding.snapshot.stop.filter((s) => s.status === SKABELONSTOPSTATUS.AKTIV).map((s) => s.id);
  const faktiske = liste(rute.stopforekomster).map((s) => s.skabelonStopId);
  if (JSON.stringify(forventede) !== JSON.stringify(faktiske)) fund.push(nytV2Fund(AARSAGSKODE_V2.SKABELON_SNAPSHOT_UOVERENSSTEMMELSE, "Dagsrutens stop svarer ikke til det bundne skabelonsnapshot.", { sti: "stopforekomster", objektId: rute?.id }));
  return v2Resultat(fund);
}

export function validerSkabelonTildeling(rute, ressourcer, beregningMs) {
  const fund = [...validerSkabelonDagsrute(rute).fund];
  const skabelon = rute?.skabelonBinding?.snapshot;
  if (!skabelon) return v2Resultat(fund);
  const ressourceMap = new Map(liste(ressourcer).map((r) => [referenceNoegle(r.reference), r]));
  const medarbejderRefs = liste(rute.medarbejderRefs);
  const koeretoejRefs = liste(rute.koeretoejRefs);
  const udstyrRefs = liste(rute.udstyrRefs);
  const kontrollerStandard = (navn, standard, faktiskeRefs) => {
    const noegle = referenceNoegle(standard?.ressourceRef);
    const faktiske = new Set(faktiskeRefs.map(referenceNoegle));
    if (standard?.metode === TILDELINGSMETODE.FAST && !faktiske.has(noegle)) fund.push(nytV2Fund(AARSAGSKODE_V2.FAST_TILDELING_BRUD, `Rutens faste ${navn} er ikke tildelt.`, { sti: `${navn}Refs`, objektId: rute.id, objektReference: standard.ressourceRef }));
    if (standard?.metode === TILDELINGSMETODE.FORETRUKKET && !faktiske.has(noegle)) fund.push(nytV2Fund(AARSAGSKODE_V2.FORETRUKKET_TILDELING_AFVIGER, `Rutens foretrukne ${navn} er fravalgt.`, { niveau: REGELNIVEAU.PREFERENCE, sti: `${navn}Refs`, objektId: rute.id, objektReference: standard.ressourceRef }));
  };
  kontrollerStandard("medarbejder", skabelon.standardTildeling.medarbejder, medarbejderRefs);
  kontrollerStandard("koeretoej", skabelon.standardTildeling.koeretoej, koeretoejRefs);
  const medarbejdere = medarbejderRefs.map((ref) => ressourceMap.get(referenceNoegle(ref))).filter(Boolean);
  const koeretoejer = koeretoejRefs.map((ref) => ressourceMap.get(referenceNoegle(ref))).filter(Boolean);
  for (const [i, ref] of medarbejderRefs.entries()) fund.push(...validerTypedReference(ref, { forventetArt: REFERENCEART.MEDARBEJDER, sti: `medarbejderRefs[${i}]`, objektId: rute.id }).fund);
  for (const [i, ref] of koeretoejRefs.entries()) fund.push(...validerTypedReference(ref, { forventetArt: REFERENCEART.KOERETOEJ, sti: `koeretoejRefs[${i}]`, objektId: rute.id }).fund);
  for (const [i, ref] of udstyrRefs.entries()) fund.push(...validerTypedReference(ref, { forventetArt: REFERENCEART.UDSTYR, sti: `udstyrRefs[${i}]`, objektId: rute.id }).fund);
  for (const ref of [...medarbejderRefs, ...koeretoejRefs, ...udstyrRefs]) if (!ressourceMap.has(referenceNoegle(ref))) fund.push(nytV2Fund(AARSAGSKODE_V2.RESSOURCE_REFERENCE_UKENDT, "Den tildelte ressource findes ikke i providersnapshotet.", { sti: "ressourcer", objektId: rute.id, objektReference: ref }));
  if (Number.isFinite(rute.fraMs) && Number.isFinite(rute.tilMs) && medarbejdere.length) fund.push(...kontrollerTilgaengelighed(medarbejdere, rute.fraMs, rute.tilMs).fund);
  const tildeltUdstyr = new Set(udstyrRefs.map(referenceNoegle));
  const kontrollerKrav = (krav, objektId) => {
    const kravObjekt = { id: objektId, krav: krav || {} };
    fund.push(...kontrollerKompetencerOgCertifikater(kravObjekt, medarbejdere, beregningMs).fund);
    fund.push(...kontrollerKoeretoejstypeOgKapacitet(kravObjekt, koeretoejer).fund);
    for (const ref of liste(krav?.udstyrRefs)) if (!tildeltUdstyr.has(referenceNoegle(ref))) fund.push({
      kode: AARSAGSKODE.UDSTYR_MANGLER, tekst: "Ruteskabelonens krævede udstyr er ikke tildelt.", niveau: REGELNIVEAU.HARD,
      sti: "udstyrRefs", objektId, objektReference: ref,
      reference: `${AARSAGSKODE.UDSTYR_MANGLER}:${referenceNoegle(ref)}:udstyrRefs`,
    });
  };
  kontrollerKrav(skabelon.standardKrav, rute.id);
  for (const stop of skabelon.stop.filter((s) => s.status === SKABELONSTOPSTATUS.AKTIV)) kontrollerKrav(stop.krav, `${rute.id}:${stop.id}`);
  return v2Resultat(fund);
}
