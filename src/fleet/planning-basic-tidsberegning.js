/* Deterministisk rutetidsberegning med eksplicitte, provider-neutrale køretider. */

import { TIDSFORM, kontrollerPlanlagtTid, kontrollerTilgaengelighed } from "./planning-basic.js";
import { AARSAGSKODE_V2, nytV2Fund, v2Resultat } from "./planning-basic-v2-kontrakt.js";

const liste = (v) => Array.isArray(v) ? v : [];
const MINUT = 60000;

export function koeretidssegmenterForRute(rute) {
  const stop = liste(rute?.stopforekomster);
  if (!stop.length) return [];
  const segmenter = [{ id: `START>${stop[0].id}`, fra: "START", til: stop[0].id }];
  for (let i = 1; i < stop.length; i += 1) segmenter.push({ id: `${stop[i - 1].id}>${stop[i].id}`, fra: stop[i - 1].id, til: stop[i].id });
  segmenter.push({ id: `${stop.at(-1).id}>SLUT`, fra: stop.at(-1).id, til: "SLUT" });
  return segmenter;
}

function tidligsteStart(tidskrav, ankomstMs) {
  if (tidskrav?.art === TIDSFORM.FAST && Number.isFinite(tidskrav.startMs) && ankomstMs < tidskrav.startMs) return tidskrav.startMs;
  if (tidskrav?.art === TIDSFORM.VINDUE && Number.isFinite(tidskrav.fraMs) && ankomstMs < tidskrav.fraMs) return tidskrav.fraMs;
  return ankomstMs;
}

export function beregnRutetid(rute, {
  koeretider = [], medarbejdere = [],
} = {}) {
  const fund = [];
  const mangler = [];
  const stop = liste(rute?.stopforekomster);
  const startMs = rute?.planlagtStartMs;
  if (!rute || !Number.isFinite(startMs) || !rute.startLokationRef || !rute.slutLokationRef || !stop.length) {
    return v2Resultat([nytV2Fund(AARSAGSKODE_V2.TIDSBEREGNING_INPUT_UGYLDIG, "Tidsberegningen kræver rute, starttid, start-/slutsted og mindst ét stop.", { sti: "rute", objektId: rute?.id })], {
      komplet: false, mangler: [{ art: "input", id: rute?.id || null }], tidsplan: null,
    });
  }
  const segmenter = koeretidssegmenterForRute(rute);
  const koeretidsMap = new Map();
  for (const [i, k] of liste(koeretider).entries()) {
    if (!k || typeof k.segmentId !== "string" || !Number.isFinite(k.varighedMin) || k.varighedMin < 0) {
      fund.push(nytV2Fund(AARSAGSKODE_V2.KOERETID_UGYLDIG, "En køretid kræver segment-id og et ikke-negativt minutantal.", { sti: `koeretider[${i}]`, objektId: rute.id }));
    } else if (koeretidsMap.has(k.segmentId)) {
      fund.push(nytV2Fund(AARSAGSKODE_V2.KOERETID_UGYLDIG, "Et køretidssegment må kun forekomme én gang.", { sti: `koeretider[${i}]`, objektId: k.segmentId }));
    } else koeretidsMap.set(k.segmentId, k.varighedMin);
  }
  for (const segment of segmenter) if (!koeretidsMap.has(segment.id)) {
    mangler.push({ art: "koeretid", id: segment.id, fra: segment.fra, til: segment.til });
    fund.push(nytV2Fund(AARSAGSKODE_V2.KOERETID_MANGLER, `Køretiden mangler for segmentet ${segment.id}.`, { sti: "koeretider", objektId: segment.id, detaljer: segment }));
  }
  for (const s of stop) {
    if (s.estimeretVarighedMin == null) {
      mangler.push({ art: "stopvarighed", id: s.id });
      fund.push(nytV2Fund(AARSAGSKODE_V2.STOPVARIGHED_MANGLER, `Stopvarigheden mangler for ${s.id}.`, { sti: "stopforekomster.estimeretVarighedMin", objektId: s.id }));
    } else if (!Number.isFinite(s.estimeretVarighedMin) || s.estimeretVarighedMin <= 0) {
      fund.push(nytV2Fund(AARSAGSKODE_V2.STOPVARIGHED_UGYLDIG, `Stopvarigheden er ugyldig for ${s.id}.`, { sti: "stopforekomster.estimeretVarighedMin", objektId: s.id }));
    }
  }
  const pauser = liste(rute.pauser);
  const ugyldigePauser = new Set();
  for (const [i, p] of pauser.entries()) if (!Number.isFinite(p?.varighedMin) || p.varighedMin <= 0 || !stop.some((s) => s.id === p.efterStopforekomstId)) {
    ugyldigePauser.add(p?.id);
    fund.push(nytV2Fund(AARSAGSKODE_V2.PAUSE_UGYLDIG, "En pause kræver positiv varighed og et kendt stopforekomst-id.", { sti: `pauser[${i}]`, objektId: p?.id }));
  }

  let markoerMs = startMs;
  let tidslinjeKomplet = true;
  let samletKoeretidMin = 0;
  let samletStoptidMin = 0;
  let samletPausetidMin = 0;
  let samletVentetidMin = 0;
  const stopplan = [];
  for (let i = 0; i < stop.length; i += 1) {
    const s = stop[i];
    const segment = segmenter[i];
    const koeretidMin = koeretidsMap.get(segment.id);
    if (!Number.isFinite(koeretidMin) || !tidslinjeKomplet) tidslinjeKomplet = false;
    if (!Number.isFinite(s.estimeretVarighedMin) || s.estimeretVarighedMin <= 0) tidslinjeKomplet = false;
    if (!tidslinjeKomplet) {
      stopplan.push({ stopforekomstId: s.id, raekkefoelge: s.raekkefoelge, ankomstMs: null, serviceStartMs: null, afgangMs: null, ventetidMin: null });
      continue;
    }
    markoerMs += koeretidMin * MINUT;
    samletKoeretidMin += koeretidMin;
    const ankomstMs = markoerMs;
    const serviceStartMs = tidligsteStart(s.tidskrav, ankomstMs);
    const ventetidMin = (serviceStartMs - ankomstMs) / MINUT;
    samletVentetidMin += ventetidMin;
    const afgangMs = serviceStartMs + s.estimeretVarighedMin * MINUT;
    samletStoptidMin += s.estimeretVarighedMin;
    fund.push(...kontrollerPlanlagtTid({ id: s.id, varighedMin: s.estimeretVarighedMin, tidskrav: s.tidskrav }, serviceStartMs, afgangMs).fund);
    const stopPauser = pauser.filter((p) => p.efterStopforekomstId === s.id && !ugyldigePauser.has(p.id));
    const pauseMin = stopPauser.reduce((sum, p) => sum + p.varighedMin, 0);
    samletPausetidMin += pauseMin;
    markoerMs = afgangMs + pauseMin * MINUT;
    if (pauser.some((p) => p.efterStopforekomstId === s.id && ugyldigePauser.has(p.id))) tidslinjeKomplet = false;
    stopplan.push({
      stopforekomstId: s.id, raekkefoelge: s.raekkefoelge, ankomstMs,
      serviceStartMs, afgangMs, ventetidMin, pauseEfterMin: pauseMin,
    });
  }
  const sidsteSegment = segmenter.at(-1);
  const slutKoeretidMin = koeretidsMap.get(sidsteSegment?.id);
  if (tidslinjeKomplet && Number.isFinite(slutKoeretidMin)) {
    samletKoeretidMin += slutKoeretidMin;
    markoerMs += slutKoeretidMin * MINUT;
  } else tidslinjeKomplet = false;
  if (tidslinjeKomplet && medarbejdere.length) fund.push(...kontrollerTilgaengelighed(medarbejdere, startMs, markoerMs).fund);
  const komplet = tidslinjeKomplet && mangler.length === 0 && !fund.some((f) => [AARSAGSKODE_V2.KOERETID_UGYLDIG, AARSAGSKODE_V2.STOPVARIGHED_UGYLDIG, AARSAGSKODE_V2.PAUSE_UGYLDIG].includes(f.kode));
  const tidsplan = {
    ruteId: rute.id, planlagtStartMs: startMs, stop: stopplan,
    planlagtSlutMs: komplet ? markoerMs : null,
    samletKoeretidMin, samletStoptidMin, samletPausetidMin, samletVentetidMin,
    samletRutetidMin: komplet ? (markoerMs - startMs) / MINUT : null,
  };
  return v2Resultat(fund, { komplet, mangler, tidsplan });
}
