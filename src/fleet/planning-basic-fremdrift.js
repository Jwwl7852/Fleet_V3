/* Mobilevents, OBD-observationer, fremdrift og afvigelser uden persistence eller netværk. */

import { REFERENCEART, REGELNIVEAU, referenceNoegle, validerTypedReference } from "./planning-basic.js";
import {
  AARSAGSKODE_V2, AFVIGELSESMODEL, AFVIGELSESNIVEAU, DATAKILDE,
  DATAKVALITET, LOESNINGSFORSLAGSTATUS, MOBILEVENTTYPE, nytV2Fund, v2Resultat,
} from "./planning-basic-v2-kontrakt.js";

const liste = (v) => Array.isArray(v) ? v : [];
const tekst = (v) => typeof v === "string" && v.trim().length > 0;
const objekt = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const MINUT = 60000;

function koordinatFund(position, sti, objektId) {
  if (position == null) return [nytV2Fund(AARSAGSKODE_V2.GPS_KOORDINAT_MANGLER, "GPS-koordinater mangler.", { sti, objektId })];
  if (!Number.isFinite(position.breddegrad) || !Number.isFinite(position.laengdegrad) || position.breddegrad < -90 || position.breddegrad > 90 || position.laengdegrad < -180 || position.laengdegrad > 180) {
    return [nytV2Fund(AARSAGSKODE_V2.GPS_KOORDINAT_UGYLDIG, "GPS-koordinaterne ligger uden for det gyldige interval.", { sti, objektId })];
  }
  return [];
}

function kanonisk(v) {
  if (Array.isArray(v)) return `[${v.map(kanonisk).join(",")}]`;
  if (objekt(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${kanonisk(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

export function validerMobilevent(event, {
  tenantRef, rute, maksAfstandFraRuteMin = 720, forsinketEfterMin = 5,
} = {}) {
  const fund = [];
  const basis = `mobilevents.${event?.id || "ukendt"}`;
  if (!objekt(event) || !tekst(event.id) || !tekst(event.tenantRef) || !tekst(event.dagsruteId) || !tekst(event.stopforekomstId) || !Number.isFinite(event.mobilTidMs) || !Number.isFinite(event.modtagetMs) || event.kilde !== DATAKILDE.MOBIL || !Object.values(MOBILEVENTTYPE).includes(event.type)) {
    fund.push(nytV2Fund(AARSAGSKODE_V2.MOBILEVENT_UGYLDIG, "Mobileventet mangler id, tenant, rute, stop, type, kilde eller eksplicitte tidsstempler.", { sti: basis, objektId: event?.id }));
  }
  fund.push(...validerTypedReference(event?.medarbejderRef, { forventetArt: REFERENCEART.MEDARBEJDER, sti: `${basis}.medarbejderRef`, objektId: event?.id }).fund);
  fund.push(...koordinatFund(event?.position, `${basis}.position`, event?.id));
  if (event?.gpsNoejagtighedMeter != null && (!Number.isFinite(event.gpsNoejagtighedMeter) || event.gpsNoejagtighedMeter < 0)) fund.push(nytV2Fund(AARSAGSKODE_V2.GPS_KOORDINAT_UGYLDIG, "GPS-nøjagtigheden skal være et ikke-negativt antal meter.", { sti: `${basis}.gpsNoejagtighedMeter`, objektId: event?.id }));
  if (!tekst(tenantRef)) fund.push(nytV2Fund(AARSAGSKODE_V2.TENANT_REFERENCE_MANGLER, "Valideringen kræver en eksplicit tenantreference.", { sti: "tenantRef", objektId: event?.id }));
  else if (event?.tenantRef !== tenantRef) fund.push(nytV2Fund(AARSAGSKODE_V2.MOBILEVENT_TENANT_AFVIGER, "Mobileventet tilhører en anden tenant.", { sti: `${basis}.tenantRef`, objektId: event?.id }));
  if (!rute || event?.dagsruteId !== rute.id) fund.push(nytV2Fund(AARSAGSKODE_V2.MOBILEVENT_RUTE_UKENDT, "Mobileventet peger ikke på den valgte dagsrute.", { sti: `${basis}.dagsruteId`, objektId: event?.id }));
  if (rute && !liste(rute.stopforekomster).some((s) => s.id === event?.stopforekomstId)) fund.push(nytV2Fund(AARSAGSKODE_V2.MOBILEVENT_STOP_UKENDT, "Mobileventet peger på et ukendt stop på dagsruten.", { sti: `${basis}.stopforekomstId`, objektId: event?.id }));
  const tildelte = new Set(liste(rute?.medarbejderRefs).map(referenceNoegle));
  if (rute && !tildelte.has(referenceNoegle(event?.medarbejderRef))) fund.push(nytV2Fund(AARSAGSKODE_V2.MOBILEVENT_MEDARBEJDER_IKKE_TILDELT, "Medarbejderen er ikke tildelt dagsruten.", { sti: `${basis}.medarbejderRef`, objektId: event?.id, objektReference: event?.medarbejderRef }));
  const ruteFra = rute?.fraMs ?? rute?.planlagtStartMs;
  const ruteTil = rute?.tilMs ?? ruteFra;
  if (Number.isFinite(event?.mobilTidMs) && Number.isFinite(ruteFra) && Number.isFinite(ruteTil) && (event.mobilTidMs < ruteFra - maksAfstandFraRuteMin * MINUT || event.mobilTidMs > ruteTil + maksAfstandFraRuteMin * MINUT)) fund.push(nytV2Fund(AARSAGSKODE_V2.MOBILEVENT_TID_UREALISTISK, "Mobilens tidspunkt ligger urimeligt langt fra rutens planlagte dato.", { sti: `${basis}.mobilTidMs`, objektId: event?.id }));
  if (Number.isFinite(event?.modtagetMs) && Number.isFinite(event?.mobilTidMs) && event.modtagetMs < event.mobilTidMs) fund.push(nytV2Fund(AARSAGSKODE_V2.MOBILEVENT_UGYLDIG, "Modtagelsestidspunktet må ikke ligge før mobilens tidspunkt.", { sti: `${basis}.modtagetMs`, objektId: event?.id }));
  const forsinket = Number.isFinite(event?.modtagetMs) && Number.isFinite(event?.mobilTidMs) && event.modtagetMs - event.mobilTidMs > forsinketEfterMin * MINUT;
  if (forsinket) fund.push(nytV2Fund(AARSAGSKODE_V2.MOBILEVENT_FORSINKET_SYNKRONISERING, "Mobileventet er modtaget efter den konfigurerede synkroniseringsgrænse.", { niveau: REGELNIVEAU.PREFERENCE, sti: `${basis}.modtagetMs`, objektId: event?.id, detaljer: { forsinkelseMin: (event.modtagetMs - event.mobilTidMs) / MINUT } }));
  return v2Resultat(fund, { event: event ? { ...event, forsinketSynkronisering: forsinket || event.offlineSynkronisering === true } : null });
}

export function behandlMobilevents(events, kontekst = {}) {
  const fund = [];
  const unikke = new Map();
  const dubletIder = [];
  const dubletKonflikter = [];
  for (const event of liste(events)) {
    if (!event?.id || !unikke.has(event.id)) unikke.set(event?.id, event);
    else if (kanonisk(unikke.get(event.id)) === kanonisk(event)) dubletIder.push(event.id);
    else {
      dubletKonflikter.push({ eventId: event.id, bevaret: unikke.get(event.id), afvigende: event });
      fund.push(nytV2Fund(AARSAGSKODE_V2.MOBILEVENT_DUBLET_KONFLIKT, "Samme event-id er modtaget med forskelligt indhold.", { sti: "mobilevents", objektId: event.id }));
    }
  }
  const normaliserede = [];
  const ugyldige = new Set();
  for (const event of unikke.values()) {
    const svar = validerMobilevent(event, kontekst);
    fund.push(...svar.fund);
    normaliserede.push(svar.event);
    if (!svar.ok) ugyldige.add(event?.id);
  }
  normaliserede.sort((a, b) => a.mobilTidMs - b.mobilTidMs || a.modtagetMs - b.modtagetMs || a.id.localeCompare(b.id));
  const senesteStatus = new Map();
  for (const event of normaliserede) {
    if (ugyldige.has(event.id)) continue;
    if (event.type === MOBILEVENTTYPE.AFGAAET && senesteStatus.get(event.stopforekomstId) !== MOBILEVENTTYPE.ANKOMMET) {
      fund.push(nytV2Fund(AARSAGSKODE_V2.MOBILEVENT_AFGANG_UDEN_ANKOMST, "Afgang mangler en tidligere gyldig ankomst til samme stop.", { sti: "mobilevents", objektId: event.id }));
      ugyldige.add(event.id);
    } else senesteStatus.set(event.stopforekomstId, event.type);
  }
  const gyldigeEvents = normaliserede.filter((e) => !ugyldige.has(e.id));
  return v2Resultat(fund, { events: normaliserede, gyldigeEvents, dubletIder, dubletKonflikter, senesteEvent: gyldigeEvents.at(-1) || null });
}

export function validerObdObservation(observation, { tenantRef, rute = null } = {}) {
  const fund = [];
  const basis = `obdObservationer.${observation?.id || "ukendt"}`;
  if (!objekt(observation) || !tekst(observation.id) || !tekst(observation.tenantRef) || !Number.isFinite(observation.tidspunktMs) || !Number.isFinite(observation.modtagetMs) || observation.kilde !== DATAKILDE.OBD) fund.push(nytV2Fund(AARSAGSKODE_V2.OBD_OBSERVATION_UGYLDIG, "OBD-observationen mangler id, tenant, kilde eller eksplicitte tidsstempler.", { sti: basis, objektId: observation?.id }));
  fund.push(...validerTypedReference(observation?.koeretoejRef, { forventetArt: REFERENCEART.KOERETOEJ, sti: `${basis}.koeretoejRef`, objektId: observation?.id }).fund);
  fund.push(...koordinatFund(observation?.position, `${basis}.position`, observation?.id));
  if (observation?.hastighedKmt != null && (!Number.isFinite(observation.hastighedKmt) || observation.hastighedKmt < 0)) fund.push(nytV2Fund(AARSAGSKODE_V2.OBD_OBSERVATION_UGYLDIG, "OBD-hastigheden skal være et ikke-negativt tal.", { sti: `${basis}.hastighedKmt`, objektId: observation?.id }));
  if (Number.isFinite(observation?.modtagetMs) && Number.isFinite(observation?.tidspunktMs) && observation.modtagetMs < observation.tidspunktMs) fund.push(nytV2Fund(AARSAGSKODE_V2.OBD_OBSERVATION_UGYLDIG, "OBD-modtagelsestidspunktet må ikke ligge før observationstidspunktet.", { sti: `${basis}.modtagetMs`, objektId: observation?.id }));
  if (observation?.fremdriftsmarkoer != null && (!objekt(observation.fremdriftsmarkoer) || !Object.values(MOBILEVENTTYPE).includes(observation.fremdriftsmarkoer.type) || !tekst(observation.fremdriftsmarkoer.stopforekomstId) || (rute && !liste(rute.stopforekomster).some((s) => s.id === observation.fremdriftsmarkoer.stopforekomstId)))) fund.push(nytV2Fund(AARSAGSKODE_V2.OBD_OBSERVATION_UGYLDIG, "OBD-fremdriftsmarkøren skal have kendt eventtype og stopforekomst.", { sti: `${basis}.fremdriftsmarkoer`, objektId: observation?.id }));
  if (!tekst(tenantRef)) fund.push(nytV2Fund(AARSAGSKODE_V2.TENANT_REFERENCE_MANGLER, "Valideringen kræver en eksplicit tenantreference.", { sti: "tenantRef", objektId: observation?.id }));
  else if (observation?.tenantRef !== tenantRef) fund.push(nytV2Fund(AARSAGSKODE_V2.OBD_TENANT_AFVIGER, "OBD-observationen tilhører en anden tenant.", { sti: `${basis}.tenantRef`, objektId: observation?.id }));
  if (rute && observation?.dagsruteId != null && observation.dagsruteId !== rute.id) fund.push(nytV2Fund(AARSAGSKODE_V2.OBD_RUTE_AFVIGER, "OBD-observationen er knyttet til en anden dagsrute.", { sti: `${basis}.dagsruteId`, objektId: observation?.id }));
  if (rute && observation?.dagsruteId === rute.id && !new Set(liste(rute.koeretoejRefs).map(referenceNoegle)).has(referenceNoegle(observation?.koeretoejRef))) fund.push(nytV2Fund(AARSAGSKODE_V2.OBD_KOERETOEJ_IKKE_TILDELT, "OBD-observationens køretøj er ikke tildelt dagsruten.", { sti: `${basis}.koeretoejRef`, objektId: observation?.id, objektReference: observation?.koeretoejRef }));
  return v2Resultat(fund);
}

function afstandMeter(a, b) {
  const rad = (grader) => grader * Math.PI / 180;
  const dLat = rad(b.breddegrad - a.breddegrad);
  const dLon = rad(b.laengdegrad - a.laengdegrad);
  const lat1 = rad(a.breddegrad);
  const lat2 = rad(b.breddegrad);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function sammenholdMobilOgObd({ mobilevents = [], observationer = [], stoppositioner = {}, nuMs, obdForældetEfterMin = 10 } = {}) {
  const senesteMobilevent = [...liste(mobilevents)].sort((a, b) => a.mobilTidMs - b.mobilTidMs).at(-1) || null;
  const senesteObdObservation = [...liste(observationer)].sort((a, b) => a.tidspunktMs - b.tidspunktMs).at(-1) || null;
  const fund = [];
  if (!senesteObdObservation) fund.push(nytV2Fund(AARSAGSKODE_V2.OBD_MANGLER, "Ruten har ingen OBD-observation; mobilsporet bevares og kan anvendes alene.", { niveau: REGELNIVEAU.PREFERENCE, sti: "observationer" }));
  if (senesteObdObservation && Number.isFinite(nuMs) && nuMs - senesteObdObservation.tidspunktMs > obdForældetEfterMin * MINUT) fund.push(nytV2Fund(AARSAGSKODE_V2.OBD_FORAELDET, "Seneste OBD-observation er forældet.", { niveau: REGELNIVEAU.PREFERENCE, sti: "observationer", objektId: senesteObdObservation.id }));
  if (senesteMobilevent && senesteObdObservation && senesteMobilevent.mobilTidMs > senesteObdObservation.tidspunktMs) fund.push(nytV2Fund(AARSAGSKODE_V2.MOBIL_NYERE_END_OBD, "Mobilregistreringen er nyere end seneste OBD-observation.", { niveau: REGELNIVEAU.PREFERENCE, sti: "datakilder", objektId: senesteMobilevent.id }));
  const zone = senesteMobilevent ? stoppositioner[senesteMobilevent.stopforekomstId] : null;
  const afstand = zone && senesteObdObservation?.position ? afstandMeter(zone, senesteObdObservation.position) : null;
  const radius = zone?.radiusMeter ?? 100;
  if (senesteMobilevent?.type === MOBILEVENTTYPE.ANKOMMET && Number.isFinite(afstand) && afstand > radius) fund.push(nytV2Fund(AARSAGSKODE_V2.MOBIL_ANKOMMET_OBD_UDEN_FOR_STOPZONE, "Mobilstatus er ankommet, men køretøjet er uden for stopzonen.", { sti: "datakilder", objektId: senesteMobilevent.id, detaljer: { afstandMeter: Math.round(afstand), radiusMeter: radius } }));
  if (senesteMobilevent?.type === MOBILEVENTTYPE.AFGAAET && Number.isFinite(afstand) && afstand <= radius && senesteObdObservation.tidspunktMs >= senesteMobilevent.mobilTidMs) fund.push(nytV2Fund(AARSAGSKODE_V2.MOBIL_AFGAAET_OBD_STADIG_VED_STOP, "Mobilstatus er afgået, men køretøjet er fortsat i stopzonen.", { sti: "datakilder", objektId: senesteMobilevent.id, detaljer: { afstandMeter: Math.round(afstand), radiusMeter: radius } }));
  if (senesteMobilevent?.type === MOBILEVENTTYPE.ANKOMMET && senesteObdObservation?.tidspunktMs >= senesteMobilevent.mobilTidMs && senesteObdObservation.hastighedKmt > 5) fund.push(nytV2Fund(AARSAGSKODE_V2.OBD_BEVAEGELSE_MENS_MOBIL_ANKOMMET, "OBD viser bevægelse, mens mobilstatus fortsat er ankommet.", { sti: "datakilder", objektId: senesteObdObservation.id, detaljer: { hastighedKmt: senesteObdObservation.hastighedKmt } }));
  const uoverensstemmelser = fund.filter((f) => f.kode !== AARSAGSKODE_V2.OBD_MANGLER);
  return v2Resultat(fund, {
    senesteMobilevent, senesteObdObservation,
    tidsforskelMs: senesteMobilevent && senesteObdObservation ? senesteMobilevent.mobilTidMs - senesteObdObservation.tidspunktMs : null,
    konsistent: senesteMobilevent && senesteObdObservation ? uoverensstemmelser.length === 0 : null,
    arbejdsstatusKilde: DATAKILDE.MOBIL, fysiskPlaceringKilde: senesteObdObservation ? DATAKILDE.OBD : null,
    uoverensstemmelser,
  });
}

function forventetStatus(tidsplan, nuMs) {
  const stop = liste(tidsplan?.stop).filter((s) => Number.isFinite(s.ankomstMs) && Number.isFinite(s.afgangMs));
  if (!stop.length || !Number.isFinite(nuMs)) return { art: "ukendt", stopforekomstId: null, forventetAnkomstMs: null };
  for (let i = 0; i < stop.length; i += 1) {
    const s = stop[i];
    if (nuMs < s.ankomstMs) return { art: "paaVejTilStop", stopforekomstId: s.stopforekomstId, forventetAnkomstMs: s.ankomstMs };
    if (nuMs <= s.afgangMs) return { art: "vedStop", stopforekomstId: s.stopforekomstId, forventetAfgangMs: s.afgangMs };
  }
  return { art: nuMs < tidsplan.planlagtSlutMs ? "paaVejTilSlut" : "forventetAfsluttet", stopforekomstId: stop.at(-1).stopforekomstId, forventetSlutMs: tidsplan.planlagtSlutMs };
}

function forskydTidsplanFraBekraeftelse(tidsplan, event) {
  if (!event) return { tidsplan, afvigelseMin: null };
  const indeks = liste(tidsplan?.stop).findIndex((s) => s.stopforekomstId === event.stopforekomstId);
  if (indeks < 0) return { tidsplan, afvigelseMin: null };
  const planlagt = event.type === MOBILEVENTTYPE.AFGAAET ? tidsplan.stop[indeks].afgangMs : tidsplan.stop[indeks].ankomstMs;
  if (!Number.isFinite(planlagt) || !Number.isFinite(event.mobilTidMs)) return { tidsplan, afvigelseMin: null };
  const forskydningMs = event.mobilTidMs - planlagt;
  const stop = tidsplan.stop.map((s, i) => i < indeks ? s : {
    ...s,
    ankomstMs: Number.isFinite(s.ankomstMs) ? s.ankomstMs + forskydningMs : null,
    serviceStartMs: Number.isFinite(s.serviceStartMs) ? s.serviceStartMs + forskydningMs : null,
    afgangMs: Number.isFinite(s.afgangMs) ? s.afgangMs + forskydningMs : null,
  });
  return {
    tidsplan: { ...tidsplan, stop, planlagtSlutMs: Number.isFinite(tidsplan.planlagtSlutMs) ? tidsplan.planlagtSlutMs + forskydningMs : null },
    afvigelseMin: forskydningMs / MINUT,
  };
}

export function beregnFremdrift({ rute, tidsplan, mobilevents = [], observationer = [], nuMs, forældetEfterMin = 15 } = {}) {
  const senesteMobilevent = [...liste(mobilevents)].sort((a, b) => a.mobilTidMs - b.mobilTidMs).at(-1) || null;
  const senesteObd = [...liste(observationer)].sort((a, b) => a.tidspunktMs - b.tidspunktMs).at(-1) || null;
  const harEksplicitNu = Number.isFinite(nuMs);
  const mobilForældet = senesteMobilevent && (!harEksplicitNu || nuMs - senesteMobilevent.mobilTidMs > forældetEfterMin * MINUT);
  const obdForældet = senesteObd && (!harEksplicitNu || nuMs - senesteObd.tidspunktMs > forældetEfterMin * MINUT);
  const arbejdsstatus = {
    kilde: DATAKILDE.MOBIL, event: senesteMobilevent,
    kvalitet: !senesteMobilevent ? DATAKVALITET.UKENDT : mobilForældet ? DATAKVALITET.FORAELDET : DATAKVALITET.BEKRAEFTET_MOBIL,
  };
  const fysiskPosition = senesteObd
    ? { kilde: DATAKILDE.OBD, observation: senesteObd, position: senesteObd.position, kvalitet: obdForældet ? DATAKVALITET.FORAELDET : DATAKVALITET.LIVE_OBD }
    : senesteMobilevent
      ? { kilde: DATAKILDE.MOBIL, event: senesteMobilevent, position: senesteMobilevent.position, kvalitet: mobilForældet ? DATAKVALITET.FORAELDET : DATAKVALITET.BEKRAEFTET_MOBIL }
      : { kilde: null, position: null, kvalitet: DATAKVALITET.UKENDT };
  const genberegnet = forskydTidsplanFraBekraeftelse(tidsplan, senesteMobilevent);
  const forventet = {
    ...forventetStatus(genberegnet.tidsplan, nuMs), kvalitet: DATAKVALITET.ESTIMERET,
    beregningsbasis: { ruteId: rute?.id || null, tidsplanBeregnetFraMs: tidsplan?.planlagtStartMs || null, senesteMobileventId: senesteMobilevent?.id || null, anvendtAfvigelseMin: genberegnet.afvigelseMin, beregnetVedMs: nuMs },
    senesteBekraeftelseMs: senesteMobilevent?.mobilTidMs || null,
    erLivePosition: false,
  };
  return { arbejdsstatus, fysiskPosition, forventet, harLiveObd: fysiskPosition.kvalitet === DATAKVALITET.LIVE_OBD };
}

export function validerAfvigelsesregler(regler) {
  const fund = [];
  if (!objekt(regler) || !Object.values(AFVIGELSESMODEL).includes(regler.model)) return v2Resultat([nytV2Fund(AARSAGSKODE_V2.AFVIGELSESREGEL_UGYLDIG, "Afvigelsesregler kræver en kendt model.", { sti: "afvigelsesregler" })]);
  const kontroller = (regel, sti) => {
    if (!objekt(regel) || !tekst(regel.id) || !Number.isFinite(regel.advarselMin) || !Number.isFinite(regel.kritiskMin) || regel.advarselMin <= 0 || regel.kritiskMin < regel.advarselMin) fund.push(nytV2Fund(AARSAGSKODE_V2.AFVIGELSESREGEL_UGYLDIG, "Afvigelsesgrænser kræver id, positiv advarselsgrænse og en kritisk grænse, der mindst svarer til advarselsgrænsen.", { sti }));
  };
  if (regler.model === AFVIGELSESMODEL.FAELLES) kontroller(regler.faelles, "afvigelsesregler.faelles");
  else {
    if (!objekt(regler.prRutetype) || !Object.keys(regler.prRutetype).length) fund.push(nytV2Fund(AARSAGSKODE_V2.AFVIGELSESREGEL_UGYLDIG, "Modellen pr. rutetype kræver mindst én regel.", { sti: "afvigelsesregler.prRutetype" }));
    for (const [type, regel] of Object.entries(regler.prRutetype || {})) kontroller(regel, `afvigelsesregler.prRutetype.${type}`);
  }
  return v2Resultat(fund);
}

function regelFor(rute, regler) {
  return regler?.model === AFVIGELSESMODEL.FAELLES ? regler.faelles : regler?.prRutetype?.[rute?.rutetype];
}

export function beregnAfvigelse({ rute, tidsplan, mobilevents = [], observationer = [], regler, estimeretGrundlag = null, nuMs = null, obdForældetEfterMin = 10 } = {}) {
  const fund = [...validerAfvigelsesregler(regler).fund];
  const regel = regelFor(rute, regler);
  if (!regel) fund.push(nytV2Fund(AARSAGSKODE_V2.AFVIGELSESREGEL_UGYLDIG, "Der findes ingen afvigelsesregel for rutetypen.", { sti: "afvigelsesregler", objektId: rute?.rutetype }));
  const mobil = [...liste(mobilevents)].sort((a, b) => a.mobilTidMs - b.mobilTidMs).at(-1) || null;
  const obd = [...liste(observationer)].filter((o) => o.fremdriftsmarkoer?.stopforekomstId).sort((a, b) => a.tidspunktMs - b.tidspunktMs).at(-1) || null;
  let grundlag = null;
  if (mobil && (!obd || mobil.mobilTidMs >= obd.tidspunktMs)) grundlag = { stopforekomstId: mobil.stopforekomstId, type: mobil.type, faktiskMs: mobil.mobilTidMs, kilde: DATAKILDE.MOBIL, kvalitet: DATAKVALITET.BEKRAEFTET_MOBIL, bekræftet: true };
  else if (obd) {
    const frisk = Number.isFinite(nuMs) && nuMs - obd.tidspunktMs <= obdForældetEfterMin * MINUT;
    grundlag = { stopforekomstId: obd.fremdriftsmarkoer.stopforekomstId, type: obd.fremdriftsmarkoer.type, faktiskMs: obd.tidspunktMs, kilde: DATAKILDE.OBD, kvalitet: frisk ? DATAKVALITET.LIVE_OBD : DATAKVALITET.FORAELDET, bekræftet: true };
  }
  else if (estimeretGrundlag) grundlag = { ...estimeretGrundlag, kilde: "BEREGNING", kvalitet: DATAKVALITET.ESTIMERET, bekræftet: false };
  if (!grundlag) fund.push(nytV2Fund(AARSAGSKODE_V2.AFVIGELSESGRUNDLAG_MANGLER, "Afvigelsen kan ikke beregnes uden mobil-, OBD- eller eksplicit estimatgrundlag.", { niveau: REGELNIVEAU.PREFERENCE, sti: "afvigelsesgrundlag", objektId: rute?.id }));
  const stopplan = liste(tidsplan?.stop).find((s) => s.stopforekomstId === grundlag?.stopforekomstId);
  const planlagtMs = grundlag?.type === MOBILEVENTTYPE.AFGAAET ? stopplan?.afgangMs : stopplan?.ankomstMs;
  let afvigelseMin = null;
  if (Number.isFinite(grundlag?.afvigelseMin)) afvigelseMin = grundlag.afvigelseMin;
  else if (Number.isFinite(grundlag?.faktiskMs) && Number.isFinite(planlagtMs)) afvigelseMin = (grundlag.faktiskMs - planlagtMs) / MINUT;
  if (grundlag && !Number.isFinite(afvigelseMin)) fund.push(nytV2Fund(AARSAGSKODE_V2.AFVIGELSESGRUNDLAG_MANGLER, "Grundlaget peger ikke på et beregnet stop eller tidspunkt.", { sti: "afvigelsesgrundlag", objektId: grundlag.stopforekomstId }));
  const absolut = Math.abs(afvigelseMin || 0);
  const niveau = !regel || !Number.isFinite(afvigelseMin) ? AFVIGELSESNIVEAU.INGEN : absolut >= regel.kritiskMin ? AFVIGELSESNIVEAU.KRITISK : absolut >= regel.advarselMin ? AFVIGELSESNIVEAU.ADVARSEL : AFVIGELSESNIVEAU.INGEN;
  const indeks = liste(tidsplan?.stop).findIndex((s) => s.stopforekomstId === grundlag?.stopforekomstId);
  const paavirkedeStop = indeks < 0 || !Number.isFinite(afvigelseMin) ? [] : liste(tidsplan.stop).slice(indeks + 1).map((s) => ({
    stopforekomstId: s.stopforekomstId,
    oprindeligAnkomstMs: s.ankomstMs,
    forventetAnkomstMs: Number.isFinite(s.ankomstMs) ? s.ankomstMs + afvigelseMin * MINUT : null,
  }));
  return v2Resultat(fund, { afvigelse: {
    ruteId: rute?.id || null, stopforekomstId: grundlag?.stopforekomstId || null,
    type: grundlag?.type || null, afvigelseMin, niveau, kilde: grundlag?.kilde || null,
    kvalitet: grundlag?.kvalitet || DATAKVALITET.UKENDT, bekræftet: grundlag?.bekræftet || false,
    regelId: regel?.id || null, regelmodel: regler?.model || null, paavirkedeStop,
  } });
}

export function validerLoesningsforslag(forslag) {
  const fund = [];
  const basis = `loesningsforslag.${forslag?.id || "ukendt"}`;
  if (!objekt(forslag) || !tekst(forslag.id) || !tekst(forslag.tenantRef) || !tekst(forslag.ruteId) || !objekt(forslag.udloesendeAfvigelse) || forslag.udloesendeAfvigelse.ruteId !== forslag.ruteId || !liste(forslag.berørteStopIder).length || !liste(forslag.foreslaaedeAendringer).length || !Array.isArray(forslag.aendredeAnkomsttider) || !Number.isFinite(forslag.ekstraKoeretidMin) || !Number.isFinite(forslag.reduceretKoeretidMin) || !Array.isArray(forslag.berørteMedarbejderRefs) || !Array.isArray(forslag.berørteKoeretoejRefs) || !Array.isArray(forslag.regelbrud) || !Object.values(LOESNINGSFORSLAGSTATUS).includes(forslag.status) || forslag.redigerbar !== true || forslag.kraeverDisponentGodkendelse !== true) fund.push(nytV2Fund(AARSAGSKODE_V2.LOESNINGSFORSLAG_UGYLDIGT, "Løsningsforslaget mangler kontraktens id, tenant, rute, afvigelse, stop, ændringer, tider, kørsel, ressourcer, regelbrud, status eller redigerbarhed.", { sti: basis, objektId: forslag?.id }));
  for (const [i, ref] of liste(forslag.berørteMedarbejderRefs).entries()) fund.push(...validerTypedReference(ref, { forventetArt: REFERENCEART.MEDARBEJDER, sti: `${basis}.berørteMedarbejderRefs[${i}]`, objektId: forslag?.id }).fund);
  for (const [i, ref] of liste(forslag.berørteKoeretoejRefs).entries()) fund.push(...validerTypedReference(ref, { forventetArt: REFERENCEART.KOERETOEJ, sti: `${basis}.berørteKoeretoejRefs[${i}]`, objektId: forslag?.id }).fund);
  if (forslag?.status === LOESNINGSFORSLAGSTATUS.GODKENDT && (!objekt(forslag.disponentGodkendelse) || !forslag.disponentGodkendelse.godkendt || !tekst(forslag.disponentGodkendelse.godkendtAf) || !Number.isFinite(forslag.disponentGodkendelse.tidspunktMs))) fund.push(nytV2Fund(AARSAGSKODE_V2.LOESNINGSFORSLAG_GODKENDELSE_MANGLER, "Et godkendt forslag kræver en eksplicit disponentgodkendelse med aktør og tidspunkt.", { sti: `${basis}.disponentGodkendelse`, objektId: forslag?.id }));
  if (forslag?.frigivet === true && forslag?.status !== LOESNINGSFORSLAGSTATUS.GODKENDT) fund.push(nytV2Fund(AARSAGSKODE_V2.LOESNINGSFORSLAG_GODKENDELSE_MANGLER, "Et forslag må ikke frigives før disponentgodkendelse.", { sti: `${basis}.frigivet`, objektId: forslag?.id }));
  return v2Resultat(fund);
}
