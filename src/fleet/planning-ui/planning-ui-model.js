import {
  DATAKILDE, DATAKVALITET, KILDE, LOESNINGSFORSLAGSTATUS,
  REFERENCEART, REGELNIVEAU, TIDSFORM, TILDELINGSMETODE,
  beregnFremdrift, beregnRutetid, koeretidssegmenterForRute,
  opretDagsruteFraSkabelon, planningReference, validerLoesningsforslag,
  validerSkabelonTildeling,
} from "../planning-basic-v2.js";

export const VISNING = Object.freeze({ OVERBLIK: "overblik", OPGAVER: "opgaver", PLANLAEGNING: "planlaegning", OPTIMERING: "optimering", KALENDER: "kalender", FASTE_RUTER: "faste-ruter", MOBIL: "mobil" });
export const RAEKKEVISNING = Object.freeze({ RUTE: "rute", MEDARBEJDER: "medarbejder", KOERETOEJ: "koeretoej" });
export const STATUSFILTER = Object.freeze({ ALLE: "alle", NORMAL: "normal", ADVARSEL: "advarsel", KRITISK: "kritisk", KONFLIKT: "konflikt" });
export const DEMO_DATO = "2032-05-18";
export const DEMO_NU_MS = Date.UTC(2032, 4, 18, 9, 42);
export const DAG_START_MIN = 6 * 60;
export const DAG_SLUT_MIN = 18 * 60;
const MINUT = 60000;
const klon = (v) => structuredClone(v);
const liste = (v) => Array.isArray(v) ? v : [];

export const medarbejderReference = (id) => ({ kilde: KILDE.WORKFORCE, art: REFERENCEART.MEDARBEJDER, id });
export const koeretoejReference = (id) => ({ kilde: KILDE.FLEET, art: REFERENCEART.KOERETOEJ, id });

export function minutTilTid(minut) {
  if (!Number.isFinite(minut)) return "—";
  const hel = Math.round(minut);
  return `${String(Math.floor(hel / 60)).padStart(2, "0")}.${String(hel % 60).padStart(2, "0")}`;
}

export function msTilTid(ms) {
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(ms);
}

export function danskDato(dato = DEMO_DATO) {
  return new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${dato}T12:00:00Z`));
}

export function tidslinjeSegmenter(rute) {
  const segmenter = [];
  let markoer = rute.startMinut;
  for (const [indeks, stop] of rute.stop.entries()) {
    if (stop.koerselFoerMin != null) {
      segmenter.push({ id: `${stop.id}:koersel`, art: "koersel", fraMinut: markoer, tilMinut: markoer + stop.koerselFoerMin, label: indeks ? "Kørsel" : `Fra ${rute.startsted}` });
      markoer += stop.koerselFoerMin;
    }
    if (stop.ventetidMin) {
      segmenter.push({ id: `${stop.id}:ventetid`, art: "ventetid", fraMinut: markoer, tilMinut: markoer + stop.ventetidMin, label: "Ventetid" });
      markoer += stop.ventetidMin;
    }
    const varighed = stop.varighedMin;
    segmenter.push({
      id: `${stop.id}:service`, art: "service", stopId: stop.id,
      fraMinut: markoer, tilMinut: Number.isFinite(varighed) ? markoer + varighed : null,
      label: stop.navn, status: stop.status, ufuldstaendig: !Number.isFinite(varighed),
    });
    if (!Number.isFinite(varighed)) return segmenter;
    markoer += varighed;
    if (stop.pauseEfterMin) {
      segmenter.push({ id: `${stop.id}:pause`, art: "pause", fraMinut: markoer, tilMinut: markoer + stop.pauseEfterMin, label: "Pause" });
      markoer += stop.pauseEfterMin;
    }
  }
  if (rute.koerselTilSlutMin != null) {
    segmenter.push({ id: `${rute.id}:slut`, art: "koersel", fraMinut: markoer, tilMinut: markoer + rute.koerselTilSlutMin, label: `Til ${rute.slutsted}` });
  }
  return segmenter;
}

export function ruteTidsresume(rute) {
  const segmenter = tidslinjeSegmenter(rute);
  const mangler = [];
  for (const stop of rute.stop) {
    if (!Number.isFinite(stop.varighedMin)) mangler.push(`Stopvarighed: ${stop.navn}`);
    if (!Number.isFinite(stop.koerselFoerMin)) mangler.push(`Køretid før: ${stop.navn}`);
  }
  if (!Number.isFinite(rute.koerselTilSlutMin)) mangler.push(`Køretid til: ${rute.slutsted}`);
  const summer = (art) => segmenter.filter((s) => s.art === art && Number.isFinite(s.tilMinut)).reduce((sum, s) => sum + s.tilMinut - s.fraMinut, 0);
  const slut = segmenter.length && Number.isFinite(segmenter.at(-1).tilMinut) && !mangler.length ? segmenter.at(-1).tilMinut : null;
  return {
    komplet: mangler.length === 0,
    mangler,
    koerselMin: summer("koersel"),
    serviceMin: summer("service"),
    pauseMin: summer("pause"),
    ventetidMin: summer("ventetid"),
    samletMin: Number.isFinite(slut) ? slut - rute.startMinut : null,
    slutMinut: slut,
  };
}

export function graenseFor(rute, indstillinger) {
  if (indstillinger.model === "FAELLES") return indstillinger.faelles;
  return indstillinger.prRutetype[rute.rutetype] || indstillinger.faelles;
}

export function afvigelsesniveau(rute, indstillinger) {
  if (rute.datakonflikt) return STATUSFILTER.KONFLIKT;
  const graense = graenseFor(rute, indstillinger);
  const absolut = Math.abs(rute.afvigelseMin || 0);
  if (absolut >= graense.kritiskMin) return STATUSFILTER.KRITISK;
  if (absolut >= graense.advarselMin) return STATUSFILTER.ADVARSEL;
  return STATUSFILTER.NORMAL;
}

export function filtrerRuter(ruter, filtre, indstillinger) {
  return ruter.filter((rute) => {
    if (filtre.status !== STATUSFILTER.ALLE && afvigelsesniveau(rute, indstillinger) !== filtre.status) return false;
    if (filtre.ruteId && rute.id !== filtre.ruteId) return false;
    if (filtre.medarbejderId && rute.medarbejderId !== filtre.medarbejderId) return false;
    if (filtre.koeretoejId === "uden" && rute.koeretoejId) return false;
    if (filtre.koeretoejId && filtre.koeretoejId !== "uden" && rute.koeretoejId !== filtre.koeretoejId) return false;
    return true;
  });
}

export function grupperKalender(ruter, raekkevisning, medarbejdere, koeretoejer) {
  const alleRuteIder = ruter.map((rute) => rute.id).sort();
  let raekker;
  if (raekkevisning === RAEKKEVISNING.MEDARBEJDER) {
    raekker = [...medarbejdere.map((person) => ({ id: person.id, label: person.navn, type: "medarbejder", ruter: ruter.filter((rute) => rute.medarbejderId === person.id) })), { id: "uden-medarbejder", label: "Ikke tildelt", type: "medarbejder", ruter: ruter.filter((rute) => !rute.medarbejderId) }];
  } else if (raekkevisning === RAEKKEVISNING.KOERETOEJ) {
    raekker = [...koeretoejer.map((bil) => ({ id: bil.id, label: bil.navn, type: "koeretoej", ruter: ruter.filter((rute) => rute.koeretoejId === bil.id) })), { id: "uden-koeretoej", label: "Uden køretøj", type: "koeretoej", ruter: ruter.filter((rute) => !rute.koeretoejId) }];
  } else {
    raekker = ruter.map((rute) => ({ id: rute.id, label: rute.navn, type: "rute", ruter: [rute] }));
  }
  const medIndhold = raekker.filter((raekke) => raekke.ruter.length);
  return { raekker: medIndhold, grunddataRuteIder: alleRuteIder, grupperedeRuteIder: medIndhold.flatMap((raekke) => raekke.ruter.map((rute) => rute.id)).sort() };
}

function seneste(listeVaerdi, felt) {
  return [...liste(listeVaerdi)].sort((a, b) => a[felt] - b[felt]).at(-1) || null;
}

export function ruteDatagrundlag(rute, nuMs = DEMO_NU_MS) {
  const resume = ruteTidsresume(rute);
  const domainRute = {
    id: rute.id,
    medarbejderRefs: rute.medarbejderId ? [medarbejderReference(rute.medarbejderId)] : [],
    koeretoejRefs: rute.koeretoejId ? [koeretoejReference(rute.koeretoejId)] : [],
    stopforekomster: rute.stop.map((stop) => ({ id: stop.id })),
  };
  const tidsplan = {
    planlagtStartMs: rute.datoStartMs,
    planlagtSlutMs: resume.komplet ? rute.datoStartMs + (resume.slutMinut - rute.startMinut) * MINUT : null,
    stop: rute.stop.map((stop) => ({
      stopforekomstId: stop.id,
      ankomstMs: rute.datoStartMs + (stop.planlagtMinut - rute.startMinut) * MINUT,
      serviceStartMs: rute.datoStartMs + (stop.planlagtMinut - rute.startMinut + (stop.ventetidMin || 0)) * MINUT,
      afgangMs: rute.datoStartMs + (stop.planlagtMinut - rute.startMinut + (stop.ventetidMin || 0) + (stop.varighedMin || 0)) * MINUT,
    })),
  };
  const fremdrift = beregnFremdrift({ rute: domainRute, tidsplan, mobilevents: rute.mobilevents, observationer: rute.obdObservationer, nuMs });
  const mobil = seneste(rute.mobilevents, "mobilTidMs");
  const obd = seneste(rute.obdObservationer, "tidspunktMs");
  let label = "Estimeret";
  if (fremdrift.fysiskPosition.kvalitet === DATAKVALITET.LIVE_OBD) label = "Live OBD";
  else if (obd && fremdrift.fysiskPosition.kvalitet === DATAKVALITET.FORAELDET) label = "OBD ikke opdateret";
  else if (mobil) label = "Estimeret efter mobilstatus";
  return { ...fremdrift, label, senesteMobil: mobil, senesteObd: obd };
}

export function dashboardNoegletal(ruter, ikkeTildelteOpgaver, indstillinger) {
  const niveauer = ruter.map((rute) => afvigelsesniveau(rute, indstillinger));
  return {
    opgaver: ruter.reduce((sum, rute) => sum + rute.stop.length, 0) + ikkeTildelteOpgaver.length,
    ruter: ruter.length,
    gennemfoerte: ruter.flatMap((rute) => rute.stop).filter((stop) => stop.status === "gennemfoert").length,
    aktive: ruter.filter((rute) => rute.status === "aktiv").length,
    ikkeTildelte: ikkeTildelteOpgaver.length,
    vaesentligAfvigelse: niveauer.filter((niveau) => niveau === STATUSFILTER.ADVARSEL || niveau === STATUSFILTER.KRITISK).length,
    udenObd: ruter.filter((rute) => !rute.obdObservationer.length).length,
    kraeverHandling: niveauer.filter((niveau) => niveau !== STATUSFILTER.NORMAL).length + ikkeTildelteOpgaver.length,
  };
}

export function opretSyntetiskMobilevent({ rute, stopId, medarbejderId, type, offline = false, indeks = 0 }) {
  const stop = rute.stop.find((post) => post.id === stopId);
  const tidspunkt = DEMO_NU_MS + (indeks + 1) * 2 * MINUT;
  return {
    id: `ui-mobil-${rute.id}-${stopId}-${type.toLowerCase()}-${indeks + 1}`,
    tenantRef: "tenant-fiktiv-ui-demo", dagsruteId: rute.id, stopforekomstId: stopId,
    medarbejderRef: medarbejderReference(medarbejderId), type,
    mobilTidMs: tidspunkt, modtagetMs: offline ? tidspunkt + 18 * MINUT : tidspunkt,
    position: { breddegrad: stop.position.breddegrad, laengdegrad: stop.position.laengdegrad },
    gpsNoejagtighedMeter: 12, kilde: DATAKILDE.MOBIL,
    offlineSynkronisering: offline, synkroniseret: !offline, syntetisk: true,
  };
}

export function synkroniserOfflineEvent(events, eventId) {
  return events.map((event) => event.id === eventId ? { ...event, synkroniseret: true } : event);
}

export function redigerForslag(forslag, aendringer) {
  const naeste = { ...klon(forslag), ...aendringer, status: LOESNINGSFORSLAGSTATUS.REDIGERET };
  const minutDelta = Number(naeste.forventetAendringMin) || 0;
  naeste.aendredeAnkomsttider = naeste.berørteStopIder.map((stopforekomstId, indeks) => ({ stopforekomstId, forskydningMin: minutDelta + indeks * 2 }));
  naeste.ekstraKoeretidMin = naeste.foreslaaedeAendringer[0]?.art === "flytStop" ? 6 : 0;
  return naeste;
}

export function forslagForRute(forslag, ruteId) {
  return liste(forslag).filter((post) => post.ruteId === ruteId);
}

export function godkendForslag(forslag, { godkendtAf, begrundelse, tidspunktMs = DEMO_NU_MS } = {}) {
  const hard = liste(forslag.regelbrud).filter((brud) => brud.niveau === REGELNIVEAU.HARD);
  if (hard.length) return { ok: false, fejl: `Kan ikke godkendes: ${hard.map((brud) => brud.tekst).join(" · ")}`, forslag };
  if (!godkendtAf || !begrundelse?.trim()) return { ok: false, fejl: "Disponent og begrundelse er påkrævet før godkendelse.", forslag };
  const godkendt = {
    ...klon(forslag), status: LOESNINGSFORSLAGSTATUS.GODKENDT,
    begrundelse: begrundelse.trim(), frigivet: true,
    disponentGodkendelse: { godkendt: true, godkendtAf, tidspunktMs },
  };
  const validering = validerLoesningsforslag(godkendt);
  return validering.ok ? { ok: true, forslag: godkendt } : { ok: false, fejl: validering.fund.map((fund) => fund.tekst).join(" · "), forslag };
}

export function afvisForslag(forslag, begrundelse = "Afvist i lokal demo") {
  return { ...klon(forslag), status: LOESNINGSFORSLAGSTATUS.AFVIST, begrundelse, frigivet: false };
}

export function anvendGodkendtForslag(ruter, forslag) {
  if (forslag.status !== LOESNINGSFORSLAGSTATUS.GODKENDT || forslag.frigivet !== true || !forslag.disponentGodkendelse?.godkendtAf) return { anvendt: false, ruter };
  const aendring = forslag.foreslaaedeAendringer[0];
  if (aendring?.art === "flytStop") {
    const kilde = ruter.find((rute) => rute.id === forslag.ruteId);
    const flyttet = kilde?.stop.find((stop) => stop.id === aendring.stopforekomstId);
    if (!flyttet) return { anvendt: false, ruter };
    return {
      anvendt: true,
      ruter: ruter.map((rute) => {
        if (rute.id === kilde.id) return { ...rute, stop: rute.stop.filter((stop) => stop.id !== flyttet.id), planAendret: true };
        if (rute.id === aendring.maalRuteId) return { ...rute, stop: [...rute.stop, { ...flyttet, id: `${flyttet.id}-flyttet`, status: "fremtidig" }], planAendret: true };
        return rute;
      }),
    };
  }
  return { anvendt: true, ruter: ruter.map((rute) => rute.id === forslag.ruteId ? { ...rute, afvigelseMin: Number(forslag.forventetAendringMin) || 0, planAendret: true } : rute) };
}

export function beregnSkabelonResume(skabelon, koeretiderMin, ressourcer = [], beregningMs = DEMO_NU_MS) {
  const oprettet = opretDagsruteFraSkabelon(skabelon, {
    id: `ui-dagsrute-${skabelon.id}-v${skabelon.version}`,
    dagsplanId: "ui-dagsplan-fiktiv", tenantRef: "tenant-fiktiv-ui-demo",
    dato: DEMO_DATO, tidszone: "Europe/Copenhagen", planlagtStartMs: Date.UTC(2032, 4, 18, 6),
  });
  if (!oprettet.rute) return { komplet: false, mangler: oprettet.fund.map((fund) => fund.tekst), tidsplan: null, tildeling: oprettet };
  const segmenter = koeretidssegmenterForRute(oprettet.rute);
  const koeretider = segmenter.flatMap((segment, indeks) => Number.isFinite(koeretiderMin[indeks]) ? [{ segmentId: segment.id, varighedMin: koeretiderMin[indeks] }] : []);
  const beregning = beregnRutetid(oprettet.rute, { koeretider });
  const tildeling = validerSkabelonTildeling(oprettet.rute, ressourcer, beregningMs);
  return { ...beregning, tildeling, rute: oprettet.rute };
}

export function skiftStandardTildeling(skabelon, art, metode, standardRef) {
  const felt = art === REFERENCEART.MEDARBEJDER ? "medarbejder" : "koeretoej";
  return {
    ...klon(skabelon), version: skabelon.version + 1,
    standardTildeling: {
      ...klon(skabelon.standardTildeling),
      [felt]: metode === TILDELINGSMETODE.INGEN ? { metode } : { metode, ressourceRef: klon(standardRef) },
    },
  };
}

export function nytSkabelonStop(skabelon, indeks) {
  const id = `ui-stop-${skabelon.id}-${skabelon.version + 1}-${indeks}`;
  return {
    id, raekkefoelge: skabelon.stop.length + 1,
    maalRef: planningReference(REFERENCEART.OPGAVE, `ui-opgave-${id}`),
    lokationRef: planningReference(REFERENCEART.LOKATION, `ui-lokation-${id}`),
    estimeretVarighedMin: 20, tidskrav: { art: TIDSFORM.FRI },
    krav: { kompetencer: [], certifikater: [], udstyrRefs: [], koeretoej: { paakraevet: false, typer: [], kapacitet: {} } },
    afhaengigheder: [], status: "aktiv", uiNavn: `Fiktivt ekstrastop ${indeks}`,
  };
}
