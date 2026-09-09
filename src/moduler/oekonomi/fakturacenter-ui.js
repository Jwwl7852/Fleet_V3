/*
 * Rene UI-afledninger for den lokale Fakturacenter-prototype.
 * Modulet ændrer ingen fakturaer og er ikke en integrations- eller autoritetsgrænse.
 */

export const MATCHFILTER = Object.freeze({
  alle: "alle",
  matchet: "matchet",
  vaelg: "vaelg-match",
  mangler: "mangler-match",
  delvis: "delvist-fordelt",
});

export const MATCHSORTERING = Object.freeze({
  nyeste: "nyeste",
  matchede: "matchede-foerst",
  uafklarede: "uafklarede-foerst",
});

export const PANEL_LAYOUT_STORAGE_KEY = "veyro:fakturacenter:panel-layout:v1";
export const STANDARD_PANEL_LAYOUT = Object.freeze({
  version: 1,
  listeProcent: 22,
  dokumentProcent: 48,
});

const MATCHFILTER_VÆRDIER = new Set(Object.values(MATCHFILTER));
const MATCHSORTERING_VÆRDIER = new Set(Object.values(MATCHSORTERING));
const PANEL_LAYOUT_FELTER = new Set(["version", "listeProcent", "dokumentProcent"]);

function summerSikkert(værdier) {
  let sum = 0;
  for (const værdi of værdier) {
    if (!Number.isSafeInteger(værdi)) return null;
    const næste = sum + værdi;
    if (!Number.isSafeInteger(næste)) return null;
    sum = næste;
  }
  return sum;
}

function problemFor(scenarie) {
  const advarsler = scenarie?.faktura?.uløsteAdvarsler || [];
  if (scenarie?.faktura?.dubletstatus === "mistænkt") {
    return Object.freeze({ id: "dublet", label: "Dublet på hold" });
  }
  if (!scenarie?.aflæsning?.original?.fakturanummer) {
    return Object.freeze({ id: "dokumentfejl", label: "Dokumentfejl" });
  }
  if (advarsler.includes("destination-lukket-for-faktura")) {
    return Object.freeze({ id: "lukket-destination", label: "Lukket destination" });
  }
  if (advarsler.length) return Object.freeze({ id: "advarsel", label: "Advarsel" });
  return null;
}

function matchforklaring(scenarie) {
  const oprindelse = scenarie?.match?.oprindelse || scenarie?.faktura?.matchOprindelse;
  if (oprindelse === "manuelt-valgt") return "Manuelt valgt";
  if (scenarie?.match?.trin === "reference") return "Eksakt reference";
  if (scenarie?.match?.trin === "enhed") return "Enhedsreference";
  if (scenarie?.match?.trin === "leverandoer") return "Leverandørmatch";
  return "Placering valgt";
}

export function udledMatchvisning(scenarie) {
  const fordelinger = scenarie?.faktura?.fordelinger || [];
  const fordeltOere = summerSikkert(fordelinger.map((post) => post?.nettoOere));
  const nettoOere = scenarie?.faktura?.nettoOere;
  const delvistFordelt = fordelinger.length > 0
    && (!Number.isSafeInteger(nettoOere) || fordeltOere !== nettoOere);
  const problem = problemFor(scenarie);

  if (delvistFordelt) {
    return Object.freeze({
      id: MATCHFILTER.delvis,
      label: "Delvist fordelt",
      forklaring: "Hele nettobeløbet er ikke fordelt",
      problem,
    });
  }
  if (scenarie?.match?.placering) {
    return Object.freeze({
      id: MATCHFILTER.matchet,
      label: "Matchet",
      forklaring: matchforklaring(scenarie),
      problem,
    });
  }
  if ((scenarie?.match?.kandidater || []).length > 0) {
    return Object.freeze({
      id: MATCHFILTER.vaelg,
      label: "Vælg match",
      forklaring: "Mulige destinationer fundet",
      problem,
    });
  }
  return Object.freeze({
    id: MATCHFILTER.mangler,
    label: "Mangler match",
    forklaring: "Ingen sikker kandidat",
    problem,
  });
}

function nyesteVærdi(scenarie) {
  const værdi = scenarie?.intake?.modtagetMs;
  return Number.isSafeInteger(værdi) ? værdi : 0;
}

export function filtrerOgSorterFakturaer(scenarier, {
  søgning = "",
  matchfilter = MATCHFILTER.alle,
  sortering = MATCHSORTERING.nyeste,
} = {}) {
  const filterVærdi = MATCHFILTER_VÆRDIER.has(matchfilter) ? matchfilter : MATCHFILTER.alle;
  const sorteringsVærdi = MATCHSORTERING_VÆRDIER.has(sortering)
    ? sortering : MATCHSORTERING.nyeste;
  const søg = String(søgning || "").trim().toLocaleLowerCase("da-DK");
  const rækker = scenarier.map((scenarie, indeks) => ({
    scenarie,
    indeks,
    match: udledMatchvisning(scenarie),
  })).filter(({ scenarie, match }) => {
    if (filterVærdi !== MATCHFILTER.alle && match.id !== filterVærdi) return false;
    if (!søg) return true;
    const tekst = [
      scenarie.titel,
      scenarie.faktura?.fakturanummer,
      scenarie.aflæsning?.original?.fakturanummer,
      scenarie.aflæsning?.original?.leverandoernavn,
    ].filter(Boolean).join(" ").toLocaleLowerCase("da-DK");
    return tekst.includes(søg);
  });

  const gruppe = ({ match }) => {
    if (sorteringsVærdi === MATCHSORTERING.matchede) {
      return match.id === MATCHFILTER.matchet ? 0 : 1;
    }
    if (sorteringsVærdi === MATCHSORTERING.uafklarede) {
      return match.id === MATCHFILTER.matchet ? 1 : 0;
    }
    return 0;
  };
  rækker.sort((a, b) => gruppe(a) - gruppe(b)
    || nyesteVærdi(b.scenarie) - nyesteVærdi(a.scenarie)
    || a.indeks - b.indeks
    || String(a.scenarie.id).localeCompare(String(b.scenarie.id), "da"));
  return rækker.map(({ scenarie }) => scenarie);
}

export function opdaterMassevalg(valgte, fakturaId, markeret) {
  if (typeof fakturaId !== "string" || !fakturaId) return [...valgte];
  if (markeret) return valgte.includes(fakturaId) ? [...valgte] : [...valgte, fakturaId];
  return valgte.filter((id) => id !== fakturaId);
}

export function afgrænsMassevalg(valgte, listesætIder) {
  const tilladte = new Set(listesætIder);
  return valgte.filter((id) => tilladte.has(id));
}

function gyldigtPanelLayout(layout) {
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) return false;
  if (Object.keys(layout).some((felt) => !PANEL_LAYOUT_FELTER.has(felt))) return false;
  return layout.version === 1
    && Number.isFinite(layout.listeProcent)
    && Number.isFinite(layout.dokumentProcent)
    && layout.listeProcent >= 18 && layout.listeProcent <= 40
    && layout.dokumentProcent >= 35 && layout.dokumentProcent <= 65;
}

function panelLayoutForm(layout) {
  return layout && typeof layout === "object" && !Array.isArray(layout)
    && Object.keys(layout).every((felt) => PANEL_LAYOUT_FELTER.has(felt))
    && layout.version === 1
    && Number.isFinite(layout.listeProcent)
    && Number.isFinite(layout.dokumentProcent);
}

function heltProcenttal(værdi) {
  return Math.round(værdi * 10) / 10;
}

export function tilpasPanelLayout(layout, arbejdsbredde = null) {
  const grundlag = panelLayoutForm(layout) ? layout : STANDARD_PANEL_LAYOUT;
  if (!Number.isFinite(arbejdsbredde) || arbejdsbredde < 900) {
    return Object.freeze({ ...grundlag });
  }
  const listeMin = Math.max(18, Math.ceil((230 / arbejdsbredde) * 100));
  const listeMaks = Math.min(40,
    Math.floor(((arbejdsbredde - 8 - 300 - 8 - 310) / arbejdsbredde) * 100));
  const listeProcent = Math.min(Math.max(grundlag.listeProcent, listeMin), listeMaks);
  const detaljebredde = arbejdsbredde * (1 - listeProcent / 100) - 8;
  const dokumentMin = Math.max(35, Math.ceil((300 / detaljebredde) * 100));
  const dokumentMaks = Math.min(65,
    Math.floor(((detaljebredde - 8 - 310) / detaljebredde) * 100));
  return Object.freeze({
    version: 1,
    listeProcent: heltProcenttal(listeProcent),
    dokumentProcent: heltProcenttal(Math.min(
      Math.max(grundlag.dokumentProcent, dokumentMin), dokumentMaks,
    )),
  });
}

export function læsPanelLayout(storage, arbejdsbredde = null) {
  try {
    const rå = storage?.getItem?.(PANEL_LAYOUT_STORAGE_KEY);
    if (!rå) return tilpasPanelLayout(STANDARD_PANEL_LAYOUT, arbejdsbredde);
    const layout = JSON.parse(rå);
    return tilpasPanelLayout(gyldigtPanelLayout(layout) ? layout : STANDARD_PANEL_LAYOUT,
      arbejdsbredde);
  } catch {
    return tilpasPanelLayout(STANDARD_PANEL_LAYOUT, arbejdsbredde);
  }
}

export function gemPanelLayout(storage, layout) {
  const gyldigt = gyldigtPanelLayout(layout);
  if (!gyldigt) return false;
  try {
    storage?.setItem?.(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify({
      version: 1,
      listeProcent: layout.listeProcent,
      dokumentProcent: layout.dokumentProcent,
    }));
    return Boolean(storage?.setItem);
  } catch {
    return false;
  }
}

export function nulstilPanelLayout() {
  return Object.freeze({ ...STANDARD_PANEL_LAYOUT });
}
