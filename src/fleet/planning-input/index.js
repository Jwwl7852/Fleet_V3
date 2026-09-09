/* Planning input — ren kontrakt for parsing, mapping, intake og dagsplanspulje.
 * Ingen React, Firebase, DOM, netværk eller persistence.
 */

import { OPGAVESTATUS as DOMAIN_OPGAVESTATUS, REFERENCEART, TIDSFORM, planningReference, validerTidskrav } from "../planning-basic.js";
import { KRAVNIVEAU, snapshotUdfoerelseskrav } from "../planning-execution/index.js";

export const IMPORTKILDE = Object.freeze({ MANUEL: "MANUEL", CSV: "CSV", INDSAT_TABEL: "INDSAT_TABEL" });
export const INTAKESTATUS = Object.freeze({ MODTAGET: "MODTAGET", KRAEVER_KONTROL: "KRAEVER_KONTROL", KLAR_TIL_PLANLAEGNING: "KLAR_TIL_PLANLAEGNING", AFVIST: "AFVIST" });
export const STOPTYPE = Object.freeze({ BESOEG: "BESOEG", LEVERING: "LEVERING", AFHENTNING: "AFHENTNING", SERVICE: "SERVICE", KONTROL: "KONTROL", ANDET: "ANDET" });
export const ADRESSESTATUS = Object.freeze({ UKONTROLLERET: "UKONTROLLERET", FORMATKONTROLLERET: "FORMATKONTROLLERET", MANUELT_BEKRAEFTET: "MANUELT_BEKRAEFTET", GEOKODET: "GEOKODET" });
export const DUBLETTYPE = Object.freeze({ INGEN: "INGEN", SIKKER: "SIKKER", MULIG: "MULIG" });
export const DUBLETBESLUTNING = Object.freeze({ SPRING_OVER: "SPRING_OVER", ERSTAT_LOKAL: "ERSTAT_LOKAL", OPRET_ALLIGEVEL: "OPRET_ALLIGEVEL", BEHOLD_TIL_KONTROL: "BEHOLD_TIL_KONTROL" });
export const IMPORTTRIN = Object.freeze({ KILDE: 1, RAA_DATA: 2, MAPPING: 3, VALIDERING: 4, FEJL_OG_DUBLETTER: 5, GODKENDELSE: 6 });
export const IMPORTGRAENSER = Object.freeze({ MAKS_BYTES: 5 * 1024 * 1024, MAKS_RAEKKER: 10000, MAKS_FELTLAENGDE: 10000 });
export const BESTILLINGSPERIODEART = Object.freeze({ DATO: "DATO", DATO_TID: "DATO_TID", TIDSVINDUE: "TIDSVINDUE", ISO_UGE: "ISO_UGE", DATO_INTERVAL: "DATO_INTERVAL", UDEN_DATO_OENSKE: "UDEN_DATO_OENSKE" });
export const BESTILLINGSPERIODENIVEAU = Object.freeze({ OENSKET: "OENSKET", SKAL_OVERHOLDES: "SKAL_OVERHOLDES" });

export const INPUTKODE = Object.freeze({
  FILTYPE_XLSX: "INPUT_FILTYPE_XLSX", FIL_FOR_STOR: "INPUT_FIL_FOR_STOR", FOR_MANGE_RAEKKER: "INPUT_FOR_MANGE_RAEKKER",
  FELT_FOR_LANGT: "INPUT_FELT_FOR_LANGT", CSV_UAFSLUTTET_CITAT: "INPUT_CSV_UAFSLUTTET_CITAT", CSV_UJAEVNE_KOLONNER: "INPUT_CSV_UJAEVNE_KOLONNER",
  MAPPING_MANGLER: "INPUT_MAPPING_MANGLER", DATO_UGYLDIG: "INPUT_DATO_UGYLDIG", TIDSFORM_UGYLDIG: "INPUT_TIDSFORM_UGYLDIG",
  VARIGHED_MANGLER: "INPUT_VARIGHED_MANGLER", VARIGHED_UGYLDIG: "INPUT_VARIGHED_UGYLDIG", STOPTYPE_UGYLDIG: "INPUT_STOPTYPE_UGYLDIG",
  OPGAVENAVN_MANGLER: "INPUT_OPGAVENAVN_MANGLER", STOP_MANGLER: "INPUT_STOP_MANGLER", PRIORITET_UGYLDIG: "INPUT_PRIORITET_UGYLDIG",
  ADRESSE_MANGLER: "INPUT_ADRESSE_MANGLER", LAND_MANGLER: "INPUT_LAND_MANGLER", RESSOURCE_UKENDT: "INPUT_RESSOURCE_UKENDT",
  DUBLET_BESLUTNING_MANGLER: "INPUT_DUBLET_BESLUTNING_MANGLER", IKKE_GODKENDT: "INPUT_IKKE_GODKENDT",
  UDFOERELSESKRAV_UGYLDIGT: "INPUT_UDFOERELSESKRAV_UGYLDIGT", UDFOERELSESSKABELON_UKENDT: "INPUT_UDFOERELSESSKABELON_UKENDT", KILDE_UGYLDIG: "INPUT_KILDE_UGYLDIG",
  FLERSTOP_ID_MANGLER: "INPUT_FLERSTOP_ID_MANGLER", STOP_ID_MANGLER: "INPUT_STOP_ID_MANGLER",
  STOP_ID_DUBLERET: "INPUT_STOP_ID_DUBLERET", STOPRAEKKEFOELGE_MANGLER: "INPUT_STOPRAEKKEFOELGE_MANGLER",
  STOPRAEKKEFOELGE_UGYLDIG: "INPUT_STOPRAEKKEFOELGE_UGYLDIG", STOPRAEKKEFOELGE_DUBLERET: "INPUT_STOPRAEKKEFOELGE_DUBLERET",
  AFHENTNING_EFTER_LEVERING: "INPUT_AFHENTNING_EFTER_LEVERING", BESTILLINGSPERIODE_UGYLDIG: "INPUT_BESTILLINGSPERIODE_UGYLDIG",
  BESTILLINGSPERIODE_MODSTRIDENDE: "INPUT_BESTILLINGSPERIODE_MODSTRIDENDE",
});

export const KOLONNEFELTER = Object.freeze({
  samletOpgaveId: ["samlet opgave-id", "samlet opgave id", "multi-stop task id", "multistop task id"],
  stopId: ["stop-id", "stop id", "stop reference"], stopRaekkefoelge: ["stoprækkefølge", "stopraekkefoelge", "stop order", "sequence"],
  eksternReference: ["ekstern reference", "ekstern id", "external reference", "external id", "reference"],
  navn: ["opgavenavn", "opgave", "task name", "name"], type: ["opgavetype", "task type", "type"],
  kunde: ["kunde", "modtager", "customer", "recipient"], adresse: ["adresse", "address"],
  postnummer: ["postnummer", "postal code", "zip"], by: ["by", "city"], land: ["land", "country"],
  dato: ["dato", "date"], tidsform: ["tidsform", "time type"], fastTid: ["fast tid", "fixed time"],
  vindueFra: ["tidsvindue fra", "window start", "fra"], vindueTil: ["tidsvindue til", "window end", "til"],
  deadline: ["deadline", "senest"], varighed: ["varighed", "stopvarighed", "duration", "duration minutes"],
  periodeart: ["bestillingsperiode", "periodeart", "request period type"], periodeniveau: ["periode-niveau", "periodeniveau", "ønske eller krav", "request level"],
  oensketDato: ["ønsket dato", "oensket dato", "requested date"], oensketTid: ["ønsket tid", "oensket tid", "requested time"],
  oensketVindueFra: ["ønsket vindue fra", "oensket vindue fra", "requested window from"], oensketVindueTil: ["ønsket vindue til", "oensket vindue til", "requested window to"],
  oensketUge: ["ønsket uge", "oensket uge", "requested week"], oensketUgeAar: ["ønsket ugeår", "ønsket ugeaar", "requested week year"],
  periodeFra: ["periode fra", "interval from"], periodeTil: ["periode til", "interval to"],
  prioritet: ["prioritet", "priority"], rutetype: ["rutetype", "route type"], medarbejderRef: ["medarbejder", "employee"],
  koeretoejRef: ["køretøj", "koeretøj", "koeretoej", "vehicle"], kompetencer: ["kompetencer", "skills"], certifikater: ["certifikater", "certificates"],
  udstyr: ["udstyr", "equipment"], kapacitet: ["kapacitet", "capacity"], notat: ["notat", "note"],
  stoptype: ["stoptype", "stop type"], udfoerelsesskabelon: ["udførelsesskabelon", "udfoerelsesskabelon", "execution template"],
  underskrift: ["underskrift", "signature required"], billeder: ["billeder", "photos required"],
  kundespoergsmaal: ["kundespørgsmål", "kundespoergsmaal", "customer questions"], materialer: ["materialeregistrering", "materials"],
});

const klon = (vaerdi) => vaerdi == null ? vaerdi : JSON.parse(JSON.stringify(vaerdi));
const liste = (vaerdi) => Array.isArray(vaerdi) ? vaerdi : [];
const fund = (kode, tekst, sti, niveau = KRAVNIVEAU.HARD) => ({ kode, niveau, tekst, sti });
const rens = (vaerdi) => String(vaerdi ?? "").trim();
const fold = (vaerdi) => rens(vaerdi).toLocaleLowerCase("da-DK").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function utf8Bytes(tekst) {
  let bytes = 0;
  for (const tegn of String(tekst)) {
    const kode = tegn.codePointAt(0);
    bytes += kode <= 0x7f ? 1 : kode <= 0x7ff ? 2 : kode <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function foreslaaSkilletegn(tekst) {
  const linje = String(tekst).replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
  const antal = (tegn) => [...linje].filter((post) => post === tegn).length;
  return [["\t", antal("\t")], [";", antal(";")], [",", antal(",")]].sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsv(tekst, { filnavn = "", skilletegn, maksBytes = IMPORTGRAENSER.MAKS_BYTES, maksRaekker = IMPORTGRAENSER.MAKS_RAEKKER, maksFeltlaengde = IMPORTGRAENSER.MAKS_FELTLAENGDE } = {}) {
  if (/\.xlsx$/i.test(filnavn)) return { ok: false, fund: [fund(INPUTKODE.FILTYPE_XLSX, "Gem filen som CSV, eller kopier rækkerne fra Excel og indsæt dem her.", "filnavn")], raekker: [] };
  let kilde = String(tekst ?? "").replace(/^\uFEFF/, "");
  if (utf8Bytes(kilde) > maksBytes) return { ok: false, fund: [fund(INPUTKODE.FIL_FOR_STOR, "Filen er større end 5 MB.", "fil")], raekker: [] };
  const delimiter = skilletegn || foreslaaSkilletegn(kilde);
  const raekker = [];
  const parserfund = [];
  let raekke = [];
  let felt = "";
  let iCitater = false;
  for (let indeks = 0; indeks < kilde.length; indeks += 1) {
    const tegn = kilde[indeks];
    if (iCitater) {
      if (tegn === '"' && kilde[indeks + 1] === '"') { felt += '"'; indeks += 1; }
      else if (tegn === '"') iCitater = false;
      else felt += tegn;
    } else if (tegn === '"' && felt === "") iCitater = true;
    else if (tegn === delimiter) { raekke.push(felt); felt = ""; }
    else if (tegn === "\n" || tegn === "\r") {
      if (tegn === "\r" && kilde[indeks + 1] === "\n") indeks += 1;
      raekke.push(felt); felt = "";
      if (raekke.some((celle) => celle !== "")) raekker.push(raekke);
      raekke = [];
    } else felt += tegn;
    if (felt.length > maksFeltlaengde) return { ok: false, fund: [fund(INPUTKODE.FELT_FOR_LANGT, `Et felt overstiger ${maksFeltlaengde} tegn.`, `tegn[${indeks}]`)], raekker: [] };
  }
  if (iCitater) parserfund.push(fund(INPUTKODE.CSV_UAFSLUTTET_CITAT, "CSV-filen indeholder et uafsluttet citeret felt.", "fil"));
  if (felt !== "" || raekke.length) { raekke.push(felt); if (raekke.some((celle) => celle !== "")) raekker.push(raekke); }
  if (!raekker.length) return { ok: parserfund.length === 0, fund: parserfund, overskrifter: [], raekker: [], skilletegn: delimiter };
  const overskrifter = raekker[0].map(rens);
  const data = raekker.slice(1);
  if (data.length > maksRaekker) parserfund.push(fund(INPUTKODE.FOR_MANGE_RAEKKER, `Importen overstiger ${maksRaekker} datarækker.`, "raekker"));
  const normaliserede = data.slice(0, maksRaekker).map((celler, indeks) => {
    if (celler.length !== overskrifter.length) parserfund.push(fund(INPUTKODE.CSV_UJAEVNE_KOLONNER, `Række ${indeks + 2} har ${celler.length} kolonner; forventet ${overskrifter.length}.`, `raekker[${indeks}]`, KRAVNIVEAU.ADVARSEL));
    return { raekkenummer: indeks + 2, celler: overskrifter.map((overskrift, kolonne) => ({ overskrift, vaerdi: celler[kolonne] ?? "" })), ukendteEkstraFelter: celler.slice(overskrifter.length) };
  });
  return { ok: !parserfund.some((post) => post.niveau === KRAVNIVEAU.HARD), fund: parserfund, overskrifter, raekker: normaliserede, skilletegn: delimiter };
}

export function parseIndsatTabel(tekst, indstillinger = {}) {
  return parseCsv(tekst, { ...indstillinger, skilletegn: indstillinger.skilletegn || "\t", filnavn: "indsat-tabel.txt" });
}

export function foreslaaKolonnemapping(overskrifter) {
  const mapping = {};
  for (const [felt, aliaser] of Object.entries(KOLONNEFELTER)) {
    const fundet = overskrifter.find((overskrift) => aliaser.map(fold).includes(fold(overskrift)));
    if (fundet) mapping[felt] = fundet;
  }
  return mapping;
}

export function mapRaekke(raekke, mapping) {
  const celler = Object.fromEntries(raekke.celler.map((celle) => [celle.overskrift, celle.vaerdi]));
  return Object.fromEntries(Object.entries(mapping).map(([felt, overskrift]) => [felt, celler[overskrift] ?? ""]));
}

export function normaliserVarighed(raavaerdi) {
  const original = String(raavaerdi ?? "");
  const tekst = rens(original).toLowerCase();
  if (!tekst) return { original, minutter: null, kode: INPUTKODE.VARIGHED_MANGLER };
  const klokkeslaet = tekst.match(/^(\d{1,3}):(\d{2})$/);
  let minutter;
  if (klokkeslaet) minutter = Number(klokkeslaet[1]) * 60 + Number(klokkeslaet[2]);
  else if (/^\d+(?:[.,]\d+)?\s*(?:min|m|minutter)?$/.test(tekst)) minutter = Number(tekst.replace(/\s*(?:min|m|minutter)$/i, "").replace(",", "."));
  if (!Number.isInteger(minutter) || minutter <= 0) return { original, minutter: null, kode: INPUTKODE.VARIGHED_UGYLDIG };
  return { original, minutter };
}

export function normaliserDato(vaerdi) {
  const tekst = rens(vaerdi);
  let dele;
  if (/^\d{4}-\d{2}-\d{2}$/.test(tekst)) dele = tekst.split("-").map(Number);
  else {
    const match = tekst.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) dele = [Number(match[3]), Number(match[2]), Number(match[1])];
  }
  if (!dele) return null;
  const [aar, maaned, dag] = dele;
  const dato = new Date(Date.UTC(aar, maaned - 1, dag));
  return dato.getUTCFullYear() === aar && dato.getUTCMonth() === maaned - 1 && dato.getUTCDate() === dag ? `${aar}-${String(maaned).padStart(2, "0")}-${String(dag).padStart(2, "0")}` : null;
}

function tidspunktMs(dato, tid) {
  const match = rens(tid).match(/^(\d{1,2})[:.](\d{2})$/);
  if (!dato || !match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  const [aar, maaned, dag] = dato.split("-").map(Number);
  return Date.UTC(aar, maaned - 1, dag, Number(match[1]), Number(match[2]));
}

export function normaliserTidskrav(data) {
  const dato = normaliserDato(data.dato);
  const artTekst = fold(data.tidsform);
  const art = artTekst === "fast tidspunkt" || artTekst === "fast" ? TIDSFORM.FAST
    : artTekst === "tidsvindue" || artTekst === "vindue" ? TIDSFORM.VINDUE
      : artTekst === "deadline" ? TIDSFORM.DEADLINE
        : artTekst === "frit tidspunkt" || artTekst === "fri" || artTekst === "fleksibel" ? TIDSFORM.FRI : null;
  if (!art) return { dato, tidskrav: null, fund: [fund(INPUTKODE.TIDSFORM_UGYLDIG, "Tidsformen er ukendt.", "tidsform")] };
  const tidskrav = { art };
  if (art === TIDSFORM.FAST) tidskrav.startMs = tidspunktMs(dato, data.fastTid);
  if (art === TIDSFORM.VINDUE) { tidskrav.fraMs = tidspunktMs(dato, data.vindueFra); tidskrav.tilMs = tidspunktMs(dato, data.vindueTil); }
  if (art === TIDSFORM.DEADLINE) tidskrav.deadlineMs = tidspunktMs(dato, data.deadline);
  return { dato, tidskrav, fund: dato ? [] : [fund(INPUTKODE.DATO_UGYLDIG, "Datoen er ugyldig.", "dato")] };
}

function normaliserStop(stop, indeks) {
  const varighed = normaliserVarighed(stop.varighed);
  const tidsdata = normaliserTidskrav(stop);
  const type = Object.values(STOPTYPE).includes(rens(stop.stoptype).toUpperCase()) ? rens(stop.stoptype).toUpperCase() : null;
  const fundVaerdi = [...tidsdata.fund];
  if (varighed.kode) fundVaerdi.push(fund(varighed.kode, varighed.kode === INPUTKODE.VARIGHED_MANGLER ? "Stopvarigheden mangler." : "Stopvarigheden skal være positive hele minutter.", `stop[${indeks}].varighed`));
  if (!type) fundVaerdi.push(fund(INPUTKODE.STOPTYPE_UGYLDIG, "Stoptypen er ugyldig.", `stop[${indeks}].stoptype`));
  if (!rens(stop.adresse)) fundVaerdi.push(fund(INPUTKODE.ADRESSE_MANGLER, "Stopadressen mangler.", `stop[${indeks}].adresse`));
  if (!rens(stop.land)) fundVaerdi.push(fund(INPUTKODE.LAND_MANGLER, "Stopland mangler.", `stop[${indeks}].land`));
  if (tidsdata.tidskrav) fundVaerdi.push(...validerTidskrav(tidsdata.tidskrav, { varighedMin: varighed.minutter }).fund.map((post) => ({ ...post, sti: `stop[${indeks}].${post.sti || "tidskrav"}` })));
  return {
    stop: {
      id: stop.id, raekkefoelge: stop.raekkefoelge == null ? indeks + 1 : stop.raekkefoelge, type, navn: rens(stop.navn), dato: tidsdata.dato,
      lokation: { adresse: rens(stop.adresse), postnummer: rens(stop.postnummer), by: rens(stop.by), land: rens(stop.land), status: stop.adressestatus === ADRESSESTATUS.GEOKODET ? ADRESSESTATUS.UKONTROLLERET : stop.adressestatus || ADRESSESTATUS.UKONTROLLERET },
      tidskrav: tidsdata.tidskrav, estimeretVarighedMin: varighed.minutter,
      originalVarighed: varighed.original, krav: klon(stop.krav || {}), udfoerelsesprofilId: stop.udfoerelsesprofilId || null,
    }, fund: fundVaerdi,
  };
}

export function opretIntakeOpgave(input, { tenantRef, kilde, batchId = null, filnavn = "", raekkenummer = null, importeretMs, idGenerator, kendteRessourcer = [], udfoerelsesskabelon = null, materialer = [] } = {}) {
  if (!Object.values(IMPORTKILDE).includes(kilde)) throw new TypeError("Importkilden er ugyldig.");
  if (!Number.isFinite(importeretMs) || typeof idGenerator !== "function") throw new TypeError("importeretMs og idGenerator skal injiceres.");
  const opgaveId = input.id || idGenerator("intake-opgave");
  const stopResultater = liste(input.stop).map((stop, indeks) => normaliserStop({ ...stop, id: stop.id || idGenerator(`stop-${indeks + 1}`) }, indeks));
  const periodeResultat = normaliserBestillingsperiode(input.bestillingsperiode || input);
  const valideringsfund = [...stopResultater.flatMap((post) => post.fund), ...periodeResultat.fund];
  if (!rens(input.navn)) valideringsfund.push(fund(INPUTKODE.OPGAVENAVN_MANGLER, "Opgavenavnet mangler.", "navn"));
  if (!stopResultater.length) valideringsfund.push(fund(INPUTKODE.STOP_MANGLER, "Opgaven skal have mindst ét stop.", "stop"));
  if (!["LAV", "NORMAL", "HOEJ", "AKUT"].includes(rens(input.prioritet || "NORMAL").toUpperCase())) valideringsfund.push(fund(INPUTKODE.PRIORITET_UGYLDIG, "Prioriteten er ukendt.", "prioritet"));
  const ressourceIder = new Set(kendteRessourcer.map((post) => post.id));
  for (const [felt, ref] of [["medarbejderRef", input.medarbejderRef], ["koeretoejRef", input.koeretoejRef]]) if (ref && !ressourceIder.has(ref)) valideringsfund.push(fund(INPUTKODE.RESSOURCE_UKENDT, `${felt} peger på en ukendt ressource.`, felt));
  let udfoerelsessnapshot = null;
  if (udfoerelsesskabelon) {
    const snapshot = snapshotUdfoerelseskrav(udfoerelsesskabelon, stopResultater.map((post) => post.stop), materialer, importeretMs);
    if (snapshot.ok) udfoerelsessnapshot = snapshot.snapshot;
    else valideringsfund.push(...snapshot.fund.map((post) => ({ ...post, kode: INPUTKODE.UDFOERELSESKRAV_UGYLDIGT })));
  }
  return {
    id: opgaveId, tenantRef, status: valideringsfund.some((post) => post.niveau === KRAVNIVEAU.HARD) ? INTAKESTATUS.KRAEVER_KONTROL : INTAKESTATUS.MODTAGET,
    eksternReference: rens(input.eksternReference), navn: rens(input.navn), type: rens(input.type), kunde: rens(input.kunde),
    prioritet: rens(input.prioritet || "NORMAL").toUpperCase(), rutetype: rens(input.rutetype), notat: rens(input.notat),
    medarbejderRef: input.medarbejderRef || null, koeretoejRef: input.koeretoejRef || null,
    stop: stopResultater.map((post) => post.stop), valideringsfund, bestillingsperiode: periodeResultat.periode,
    kilde, kildeMetadata: { batchId, filnavn: filnavn.split(/[\\/]/).at(-1), raekkenummer, importeretMs, kolonnemapping: klon(input.kolonnemapping || {}), parseradvarsler: klon(input.parseradvarsler || []) },
    raavaerdier: klon(input.raavaerdier || input), normaliseredeVaerdier: { stop: stopResultater.map((post) => post.stop) },
    dublet: { type: DUBLETTYPE.INGEN, beslutning: null, eksisterendeId: null }, udfoerelsessnapshot,
    importeredeUdfoerelsesvalg: klon(input.importeredeUdfoerelsesvalg || null),
  };
}

export function opretOpgaveFraImportRaekke(raekke, mapping, kontekst) {
  const data = mapRaekke(raekke, mapping);
  const { udfoerelsesvalg, skabelonNoegle, skabelon } = importeredeUdfoerelseskrav(data, kontekst);
  const stop = [{
    id: rens(data.stopId) || undefined, raekkefoelge: rens(data.stopRaekkefoelge) ? Number(rens(data.stopRaekkefoelge)) : 1,
    navn: data.navn, stoptype: data.stoptype || STOPTYPE.BESOEG, adresse: data.adresse, postnummer: data.postnummer,
    by: data.by, land: data.land || "DK", dato: data.dato, tidsform: data.tidsform || "Frit tidspunkt", fastTid: data.fastTid,
    vindueFra: data.vindueFra, vindueTil: data.vindueTil, deadline: data.deadline, varighed: data.varighed,
    krav: { kompetencer: rens(data.kompetencer).split(/[,;]/).filter(Boolean), certifikater: rens(data.certifikater).split(/[,;]/).filter(Boolean), udstyr: rens(data.udstyr).split(/[,;]/).filter(Boolean), kapacitet: rens(data.kapacitet) },
  }];
  const opgave = opretIntakeOpgave({ ...data, stop, importeredeUdfoerelsesvalg: udfoerelsesvalg, raavaerdier: Object.fromEntries(raekke.celler.map((celle) => [celle.overskrift, celle.vaerdi])), kolonnemapping: mapping }, { ...kontekst, udfoerelsesskabelon: skabelon, raekkenummer: raekke.raekkenummer });
  opgave.importFlerstopId = rens(data.samletOpgaveId) || null;
  if (skabelonNoegle && !skabelon) opgave.valideringsfund.push(fund(INPUTKODE.UDFOERELSESSKABELON_UKENDT, "Udførelsesskabelonen findes ikke.", "udfoerelsesskabelon"));
  if (Object.values(udfoerelsesvalg).some(Boolean) && !skabelon) opgave.valideringsfund.push(fund(INPUTKODE.UDFOERELSESKRAV_UGYLDIGT, "Importerede udførelseskrav kræver en kendt versioneret skabelon.", "udfoerelseskrav"));
  if (opgave.valideringsfund.some((post) => post.niveau === KRAVNIVEAU.HARD)) opgave.status = INTAKESTATUS.KRAEVER_KONTROL;
  return opgave;
}

function gyldigIsoUge(aar, uge) {
  if (!Number.isInteger(aar) || !Number.isInteger(uge) || uge < 1 || uge > 53) return false;
  const fourth = new Date(Date.UTC(aar, 0, 4));
  const monday = new Date(fourth); monday.setUTCDate(fourth.getUTCDate() - ((fourth.getUTCDay() + 6) % 7) + (uge - 1) * 7);
  const thursday = new Date(monday); thursday.setUTCDate(monday.getUTCDate() + 3);
  return thursday.getUTCFullYear() === aar;
}

export function normaliserBestillingsperiode(data = {}) {
  const hasExplicitPeriod = ["art", "niveau", "periodeart", "periodeniveau", "oensketDato", "oensketTid", "oensketVindueFra", "oensketVindueTil", "oensketUge", "oensketUgeAar", "periodeFra", "periodeTil"].some((key) => rens(data[key]));
  const hasNestedPeriodValues = rens(data.art) && ["dato", "tid", "fra", "til", "uge", "aar", "fraDato", "tilDato"].some((key) => rens(data[key]));
  const hasValues = hasExplicitPeriod || hasNestedPeriodValues;
  if (!hasValues) return { periode: { art: BESTILLINGSPERIODEART.UDEN_DATO_OENSKE, niveau: BESTILLINGSPERIODENIVEAU.OENSKET }, fund: [] };
  const foldEnum = (value) => rens(value).toUpperCase().replaceAll("Æ", "AE").replaceAll("Ø", "OE").replaceAll("Å", "AA").replaceAll(" ", "_");
  const art = foldEnum(data.art || data.periodeart || "DATO");
  const niveau = foldEnum(data.niveau || data.periodeniveau || "OENSKET");
  const periode = { art, niveau };
  const findings = [];
  if (!Object.values(BESTILLINGSPERIODEART).includes(art) || !Object.values(BESTILLINGSPERIODENIVEAU).includes(niveau)) findings.push(fund(INPUTKODE.BESTILLINGSPERIODE_UGYLDIG, "Bestillingsperiodens type eller niveau er ugyldigt.", "bestillingsperiode"));
  if (art === BESTILLINGSPERIODEART.ISO_UGE) { periode.uge = Number(data.uge || data.oensketUge); periode.aar = Number(data.aar || data.oensketUgeAar); if (!gyldigIsoUge(periode.aar, periode.uge)) findings.push(fund(INPUTKODE.BESTILLINGSPERIODE_UGYLDIG, "ISO-uge og årstal er ugyldigt.", "bestillingsperiode.uge")); }
  if ([BESTILLINGSPERIODEART.DATO, BESTILLINGSPERIODEART.DATO_TID, BESTILLINGSPERIODEART.TIDSVINDUE].includes(art)) { periode.dato = normaliserDato(data.dato || data.oensketDato); if (!periode.dato) findings.push(fund(INPUTKODE.BESTILLINGSPERIODE_UGYLDIG, "Den ønskede dato er ugyldig.", "bestillingsperiode.dato")); }
  if (art === BESTILLINGSPERIODEART.DATO_TID) { periode.tid = rens(data.tid || data.oensketTid); if (tidspunktMs(periode.dato, periode.tid) == null) findings.push(fund(INPUTKODE.BESTILLINGSPERIODE_UGYLDIG, "Det ønskede klokkeslæt er ugyldigt.", "bestillingsperiode.tid")); }
  if (art === BESTILLINGSPERIODEART.TIDSVINDUE) { periode.fra = rens(data.fra || data.oensketVindueFra); periode.til = rens(data.til || data.oensketVindueTil); const fra = tidspunktMs(periode.dato, periode.fra); const til = tidspunktMs(periode.dato, periode.til); if (fra == null || til == null || fra >= til) findings.push(fund(INPUTKODE.BESTILLINGSPERIODE_UGYLDIG, "Det ønskede tidsvindue er ugyldigt.", "bestillingsperiode.tidsvindue")); }
  if (art === BESTILLINGSPERIODEART.DATO_INTERVAL) { periode.fraDato = normaliserDato(data.fraDato || data.periodeFra); periode.tilDato = normaliserDato(data.tilDato || data.periodeTil); if (!periode.fraDato || !periode.tilDato || periode.fraDato > periode.tilDato) findings.push(fund(INPUTKODE.BESTILLINGSPERIODE_UGYLDIG, "Bestillerens datointerval er ugyldigt.", "bestillingsperiode.interval")); }
  const populated = [data.oensketTid, data.oensketVindueFra, data.oensketVindueTil, data.oensketUge, data.oensketUgeAar, data.periodeFra, data.periodeTil].filter((value) => rens(value)).length;
  const expected = art === BESTILLINGSPERIODEART.DATO_TID ? 1 : [BESTILLINGSPERIODEART.TIDSVINDUE, BESTILLINGSPERIODEART.ISO_UGE, BESTILLINGSPERIODEART.DATO_INTERVAL].includes(art) ? 2 : 0;
  if (populated > expected) findings.push(fund(INPUTKODE.BESTILLINGSPERIODE_MODSTRIDENDE, "Bestillingsperioden indeholder modstridende dato- eller tidsangivelser.", "bestillingsperiode"));
  return { periode: klon(periode), fund: findings };
}

function importeredeUdfoerelseskrav(data, kontekst) {
  const udfoerelsesvalg = Object.fromEntries(["underskrift", "billeder", "kundespoergsmaal", "materialer"].map((felt) => [felt, ["ja", "yes", "true", "1"].includes(fold(data[felt]))]));
  const skabelonNoegle = fold(data.udfoerelsesskabelon);
  const skabelon = liste(kontekst.udfoerelsesskabeloner).find((post) => [post.id, post.navn].map(fold).includes(skabelonNoegle)) || kontekst.udfoerelsesskabelon || null;
  return { udfoerelsesvalg, skabelonNoegle, skabelon };
}

function tilfoejImporteredeUdfoerelsesfund(opgave, { udfoerelsesvalg, skabelonNoegle, skabelon }) {
  if (skabelonNoegle && !skabelon) opgave.valideringsfund.push(fund(INPUTKODE.UDFOERELSESSKABELON_UKENDT, "Udførelsesskabelonen findes ikke.", "udfoerelsesskabelon"));
  if (Object.values(udfoerelsesvalg).some(Boolean) && !skabelon) opgave.valideringsfund.push(fund(INPUTKODE.UDFOERELSESKRAV_UGYLDIGT, "Importerede udførelseskrav kræver en kendt versioneret skabelon.", "udfoerelseskrav"));
  if (opgave.valideringsfund.some((post) => post.niveau === KRAVNIVEAU.HARD)) opgave.status = INTAKESTATUS.KRAEVER_KONTROL;
}

function raekkeSomStop(data) {
  return {
    id: rens(data.stopId) || undefined, raekkefoelge: Number(rens(data.stopRaekkefoelge)),
    navn: data.navn, stoptype: data.stoptype || STOPTYPE.BESOEG, adresse: data.adresse, postnummer: data.postnummer,
    by: data.by, land: data.land || "DK", dato: data.dato, tidsform: data.tidsform || "Frit tidspunkt", fastTid: data.fastTid,
    vindueFra: data.vindueFra, vindueTil: data.vindueTil, deadline: data.deadline, varighed: data.varighed,
    krav: { kompetencer: rens(data.kompetencer).split(/[,;]/).filter(Boolean), certifikater: rens(data.certifikater).split(/[,;]/).filter(Boolean), udstyr: rens(data.udstyr).split(/[,;]/).filter(Boolean), kapacitet: rens(data.kapacitet) },
  };
}

function flerstopFund(mappedRows) {
  const fundVaerdi = [];
  const stopIder = new Set();
  const raekkefoelger = new Set();
  for (const { data, raekke } of mappedRows) {
    const stopId = rens(data.stopId);
    const raekkefoelgeTekst = rens(data.stopRaekkefoelge);
    const sti = `raekke[${raekke.raekkenummer}]`;
    if (!stopId) fundVaerdi.push(fund(INPUTKODE.STOP_ID_MANGLER, "Stop-ID mangler i flerstop-opgaven.", `${sti}.stopId`));
    else if (stopIder.has(stopId)) fundVaerdi.push(fund(INPUTKODE.STOP_ID_DUBLERET, `Stop-ID ${stopId} er dubleret i flerstop-opgaven.`, `${sti}.stopId`));
    else stopIder.add(stopId);
    if (!raekkefoelgeTekst) fundVaerdi.push(fund(INPUTKODE.STOPRAEKKEFOELGE_MANGLER, "Stoprækkefølgen mangler i flerstop-opgaven.", `${sti}.stopRaekkefoelge`));
    else if (!/^\d+$/.test(raekkefoelgeTekst) || Number(raekkefoelgeTekst) < 1) fundVaerdi.push(fund(INPUTKODE.STOPRAEKKEFOELGE_UGYLDIG, "Stoprækkefølgen skal være et positivt heltal.", `${sti}.stopRaekkefoelge`));
    else if (raekkefoelger.has(Number(raekkefoelgeTekst))) fundVaerdi.push(fund(INPUTKODE.STOPRAEKKEFOELGE_DUBLERET, `Stoprækkefølge ${raekkefoelgeTekst} er dubleret i flerstop-opgaven.`, `${sti}.stopRaekkefoelge`));
    else raekkefoelger.add(Number(raekkefoelgeTekst));
  }
  const sorterede = mappedRows.filter(({ data }) => /^\d+$/.test(rens(data.stopRaekkefoelge))).sort((a, b) => Number(a.data.stopRaekkefoelge) - Number(b.data.stopRaekkefoelge));
  const afhentning = sorterede.findIndex(({ data }) => rens(data.stoptype).toUpperCase() === STOPTYPE.AFHENTNING);
  const levering = sorterede.findIndex(({ data }) => rens(data.stoptype).toUpperCase() === STOPTYPE.LEVERING);
  if (afhentning >= 0 && levering >= 0 && afhentning > levering) fundVaerdi.push(fund(INPUTKODE.AFHENTNING_EFTER_LEVERING, "Afhentning skal ligge før levering i flerstop-opgaven.", "stop"));
  return fundVaerdi;
}

export function opretOpgaverFraImportRaekker(raekker, mapping, kontekst) {
  const mapped = liste(raekker).map((raekke) => ({ raekke, data: mapRaekke(raekke, mapping) }));
  const grupper = new Map();
  const resultater = [];
  for (const post of mapped) {
    const gruppeId = rens(post.data.samletOpgaveId);
    const harStopmetadata = Boolean(rens(post.data.stopId) || rens(post.data.stopRaekkefoelge));
    if (!gruppeId) {
      const opgave = opretOpgaveFraImportRaekke(post.raekke, mapping, kontekst);
      if (harStopmetadata) {
        opgave.valideringsfund.push(fund(INPUTKODE.FLERSTOP_ID_MANGLER, "Samlet opgave-ID mangler for rækken med eksplicit stopidentitet eller stoprækkefølge.", `raekke[${post.raekke.raekkenummer}].samletOpgaveId`));
        opgave.status = INTAKESTATUS.KRAEVER_KONTROL;
      }
      resultater.push(opgave);
    } else {
      if (!grupper.has(gruppeId)) grupper.set(gruppeId, []);
      grupper.get(gruppeId).push(post);
    }
  }
  for (const [gruppeId, poster] of [...grupper.entries()].sort(([a], [b]) => a.localeCompare(b, "da"))) {
    const sorterede = [...poster].sort((a, b) => Number(a.data.stopRaekkefoelge || Number.MAX_SAFE_INTEGER) - Number(b.data.stopRaekkefoelge || Number.MAX_SAFE_INTEGER) || rens(a.data.stopId).localeCompare(rens(b.data.stopId), "da"));
    const base = sorterede[0].data;
    const udfoerelse = importeredeUdfoerelseskrav(base, kontekst);
    const stop = sorterede.map(({ data }) => raekkeSomStop(data));
    const raavaerdier = sorterede.map(({ raekke }) => Object.fromEntries(raekke.celler.map((celle) => [celle.overskrift, celle.vaerdi])));
    const opgave = opretIntakeOpgave({ ...base, stop, importeredeUdfoerelsesvalg: udfoerelse.udfoerelsesvalg, raavaerdier, kolonnemapping: mapping }, { ...kontekst, udfoerelsesskabelon: udfoerelse.skabelon, raekkenummer: sorterede[0].raekke.raekkenummer });
    opgave.importFlerstopId = gruppeId;
    opgave.kildeMetadata.raekkenumre = sorterede.map(({ raekke }) => raekke.raekkenummer);
    opgave.valideringsfund.push(...flerstopFund(poster));
    tilfoejImporteredeUdfoerelsesfund(opgave, udfoerelse);
    resultater.push(opgave);
  }
  return klon(resultater);
}

export function findDubletter(nyeOpgaver, eksisterendeOpgaver) {
  const alle = liste(eksisterendeOpgaver).map((opgave) => ({ opgave, eksisterende: true }));
  return nyeOpgaver.map((opgave) => {
    const sikker = alle.find(({ opgave: post, eksisterende }) => post.tenantRef === opgave.tenantRef && opgave.eksternReference && post.eksternReference === opgave.eksternReference && (eksisterende || !opgave.importFlerstopId || post.importFlerstopId !== opgave.importFlerstopId));
    const muligt = sikker ? null : alle.find(({ opgave: post }) => post.tenantRef === opgave.tenantRef && fold(post.kunde) === fold(opgave.kunde) && fold(post.stop?.[0]?.lokation?.adresse) === fold(opgave.stop?.[0]?.lokation?.adresse) && post.stop?.[0]?.dato === opgave.stop?.[0]?.dato && post.stop?.[0]?.type === opgave.stop?.[0]?.type);
    const dublet = sikker ? { type: DUBLETTYPE.SIKKER, beslutning: null, eksisterendeId: sikker.opgave.id } : muligt ? { type: DUBLETTYPE.MULIG, beslutning: null, eksisterendeId: muligt.opgave.id } : { type: DUBLETTYPE.INGEN, beslutning: null, eksisterendeId: null };
    alle.push({ opgave, eksisterende: false });
    return { ...klon(opgave), dublet, status: dublet.type === DUBLETTYPE.INGEN ? opgave.status : INTAKESTATUS.KRAEVER_KONTROL };
  });
}

export function opretImportbatch({ id, kilde, filnavn = "", importeretMs, mapping, parserResultat, opgaver }) {
  return { id, kilde, filnavn: filnavn.split(/[\\/]/).at(-1), importeretMs, mapping: klon(mapping), parserfund: klon(parserResultat.fund), trin: IMPORTTRIN.FEJL_OG_DUBLETTER, opgaver: klon(opgaver), oprindeligtSnapshot: klon(opgaver) };
}

export function beslutDublet(opgave, beslutning) {
  if (!Object.values(DUBLETBESLUTNING).includes(beslutning)) throw new TypeError("Dubletbeslutningen er ugyldig.");
  return { ...klon(opgave), dublet: { ...opgave.dublet, beslutning } };
}

export function godkendOpgave(opgave, { udfoerelsesskabelon = null, materialer = [], tidspunktMs } = {}) {
  const naeste = klon(opgave);
  if (udfoerelsesskabelon) {
    const snapshot = snapshotUdfoerelseskrav(udfoerelsesskabelon, naeste.stop, materialer, tidspunktMs);
    if (!snapshot.ok) return { ...naeste, status: INTAKESTATUS.KRAEVER_KONTROL, valideringsfund: [...naeste.valideringsfund, ...snapshot.fund] };
    naeste.udfoerelsessnapshot = snapshot.snapshot;
  }
  const harHard = naeste.valideringsfund.some((post) => post.niveau === KRAVNIVEAU.HARD);
  const dubletMangler = naeste.dublet.type !== DUBLETTYPE.INGEN && !naeste.dublet.beslutning;
  const behold = naeste.dublet.beslutning === DUBLETBESLUTNING.BEHOLD_TIL_KONTROL;
  if (harHard || dubletMangler || behold) return { ...naeste, status: INTAKESTATUS.KRAEVER_KONTROL };
  if (naeste.dublet.beslutning === DUBLETBESLUTNING.SPRING_OVER) return { ...naeste, status: INTAKESTATUS.AFVIST };
  return { ...naeste, status: INTAKESTATUS.KLAR_TIL_PLANLAEGNING, godkendtMs: tidspunktMs };
}

export function godkendImportbatch(batch, valgteIder, kontekst = {}) {
  const valgte = new Set(valgteIder);
  const opgaver = batch.opgaver.map((opgave) => valgte.has(opgave.id) ? godkendOpgave(opgave, kontekst) : klon(opgave));
  return { ...klon(batch), trin: IMPORTTRIN.GODKENDELSE, opgaver, opsummering: opsummerBatch(opgaver) };
}

export function annullerImportbatch(batch) {
  return { ...klon(batch), trin: IMPORTTRIN.FEJL_OG_DUBLETTER, opgaver: klon(batch.oprindeligtSnapshot), annulleret: true };
}

export function opsummerBatch(opgaver) {
  return Object.fromEntries(Object.values(INTAKESTATUS).map((status) => [status, opgaver.filter((post) => post.status === status).length]));
}

export function afvisOpgave(opgave, begrundelse) {
  return { ...klon(opgave), status: INTAKESTATUS.AFVIST, afvisningsbegrundelse: rens(begrundelse) };
}

export function genaabnOpgave(opgave) {
  return { ...klon(opgave), status: opgave.valideringsfund.some((post) => post.niveau === KRAVNIVEAU.HARD) ? INTAKESTATUS.KRAEVER_KONTROL : INTAKESTATUS.MODTAGET, afvisningsbegrundelse: null };
}

export function tilPlanningOpgave(opgave) {
  if (opgave.status !== INTAKESTATUS.KLAR_TIL_PLANLAEGNING) return { ok: false, fund: [fund(INPUTKODE.IKKE_GODKENDT, "Kun opgaver i KLAR_TIL_PLANLAEGNING kan sendes til dagsplan.", "status")], opgave: null };
  return {
    ok: true, fund: [], opgave: {
      id: opgave.id, reference: planningReference(REFERENCEART.OPGAVE, opgave.id), eksternReference: opgave.eksternReference,
      kundeRef: planningReference(REFERENCEART.KUNDE, `intake-kunde-${fold(opgave.kunde).replace(/ /g, "-") || "ukendt"}`),
      lokationRef: planningReference(REFERENCEART.LOKATION, `${opgave.id}-${opgave.stop[0].id}`),
      titel: opgave.navn, navn: opgave.navn, varighedMin: opgave.stop.reduce((sum, stop) => sum + stop.estimeretVarighedMin, 0), prioritet: opgave.prioritet.toLowerCase(),
      tidskrav: klon(opgave.stop[0].tidskrav), status: DOMAIN_OPGAVESTATUS.AKTIV,
      krav: { kompetencer: [], certifikater: [], udstyrRefs: [], koeretoej: { paakraevet: false, typer: [], kapacitet: {} } },
      stop: opgave.stop.map((stop) => ({ ...klon(stop), lokationRef: planningReference(REFERENCEART.LOKATION, `${opgave.id}-${stop.id}`) })),
      kilde: { art: opgave.kilde, batchId: opgave.kildeMetadata.batchId, raekkenummer: opgave.kildeMetadata.raekkenummer },
      udfoerelsessnapshot: klon(opgave.udfoerelsessnapshot), tildeling: { medarbejderRef: null, koeretoejRef: null }, ruteId: null,
    },
  };
}

export function sendTilDagsplan(opgave, planlaegningspulje) {
  const konverteret = tilPlanningOpgave(opgave);
  if (!konverteret.ok) return { ...konverteret, planlaegningspulje };
  return { ...konverteret, planlaegningspulje: [...klon(planlaegningspulje), konverteret.opgave] };
}
