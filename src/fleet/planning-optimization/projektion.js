import {
  AFHAENGIGHEDSART, FOREKOMSTSTATUS, OPGAVESTATUS, REFERENCEART, REGELNIVEAU,
  planningReference,
} from "../planning-basic.js";

const klon = (v) => structuredClone(v);
const liste = (v) => Array.isArray(v) ? v : [];

function normaliserKrav(opgave, stop) {
  const kilde = { ...(opgave.krav || {}), ...(stop.krav || {}) };
  const koeretoej = kilde.koeretoej || {};
  return {
    kompetencer: liste(kilde.kompetencer),
    certifikater: liste(kilde.certifikater),
    udstyrRefs: liste(kilde.udstyrRefs || kilde.udstyr),
    koeretoej: {
      paakraevet: Boolean(koeretoej.paakraevet || kilde.koeretoejPaakraevet),
      typer: liste(koeretoej.typer || kilde.koeretoejstyper),
      kapacitet: klon(koeretoej.kapacitet || kilde.kapacitet || {}),
    },
  };
}

export function projicerPlanlaegningspulje(planlaegningspulje, dato) {
  const blokke = [];
  const opgaver = [];
  const opgaveforekomster = [];
  for (const samlet of [...liste(planlaegningspulje)].sort((a, b) => a.id.localeCompare(b.id, "da"))) {
    const stop = liste(samlet.stop);
    const enheder = stop.map((kildestop, indeks) => {
      const enhedsId = `${samlet.id}--${kildestop.id}`;
      const forekomstId = `${enhedsId}--${dato}`;
      const reference = planningReference(REFERENCEART.OPGAVE, enhedsId);
      const tidskrav = klon(kildestop.tidskrav || samlet.tidskrav);
      const varighedMin = kildestop.estimeretVarighedMin ?? kildestop.varighedMin ?? (stop.length === 1 ? samlet.varighedMin : null);
      const afhaengigheder = indeks === 0 ? [] : [{ art: AFHAENGIGHEDSART.EFTER, opgaveRef: planningReference(REFERENCEART.OPGAVE, `${samlet.id}--${stop[indeks - 1].id}`), niveau: REGELNIVEAU.HARD }];
      const opgave = {
        id: enhedsId, reference, titel: kildestop.navn || samlet.titel || samlet.navn || enhedsId,
        kundeRef: samlet.kundeRef || null, lokationRef: kildestop.lokationRef || samlet.lokationRef,
        varighedMin, prioritet: String(samlet.prioritet || "normal").toLowerCase(), tidskrav,
        status: OPGAVESTATUS.AKTIV, krav: normaliserKrav(samlet, kildestop), afhaengigheder,
        gentagelse: null, kontinuitet: klon(samlet.kontinuitet || null), praktiskeNoter: [], ekstrafelter: [],
      };
      const forekomst = { id: forekomstId, opgaveRef: reference, dato, status: FOREKOMSTSTATUS.IKKE_PLANLAGT };
      opgaver.push(opgave); opgaveforekomster.push(forekomst);
      return {
        id: `${samlet.id}::${kildestop.id}`, opgave, forekomst,
        originalOpgaveId: samlet.id, originalStopId: kildestop.id,
        eksternReference: samlet.eksternReference || null, batchId: samlet.kilde?.batchId || samlet.kildeMetadata?.batchId || null,
        kildedata: klon(samlet.kilde || samlet.kildeMetadata || null),
        udfoerelsessnapshot: klon(kildestop.udfoerelsessnapshot || samlet.udfoerelsessnapshot || null),
        stoptype: kildestop.type || kildestop.stoptype || "ANDET", partition: samlet.partition || kildestop.partition || "standard",
        adressestatus: kildestop.adressestatus || kildestop.lokation?.status || samlet.adressestatus || "KLAR",
      };
    });
    blokke.push({
      id: `blok:${samlet.id}`, originalOpgaveId: samlet.id, eksternReference: samlet.eksternReference || null,
      prioritet: String(samlet.prioritet || "NORMAL").toUpperCase(), partition: samlet.partition || enheder[0]?.partition || "standard",
      enheder, afhaengerAfOpgaveIder: liste(samlet.afhaengerAfOpgaveIder), kontinuitet: klon(samlet.kontinuitet || null),
      kontrolleredeUndtagelser: liste(samlet.kontrolleredeUndtagelser),
      kilde: klon(samlet.kilde || null), udfoerelsessnapshot: klon(samlet.udfoerelsessnapshot || null),
    });
  }
  return { blokke, opgaver, opgaveforekomster };
}

export function topologiskSorterBlokke(blokke) {
  const efterId = new Map(blokke.map((blok) => [blok.originalOpgaveId, blok]));
  const grader = new Map(blokke.map((blok) => [blok.id, 0]));
  const ud = new Map(blokke.map((blok) => [blok.id, []]));
  const ukendte = [];
  for (const blok of blokke) for (const afhId of blok.afhaengerAfOpgaveIder) {
    const foran = efterId.get(afhId);
    if (!foran) { ukendte.push({ blokId: blok.id, afhId }); continue; }
    grader.set(blok.id, grader.get(blok.id) + 1); ud.get(foran.id).push(blok.id);
  }
  const koe = blokke.filter((blok) => grader.get(blok.id) === 0).sort((a, b) => a.id.localeCompare(b.id, "da"));
  const resultat = [];
  while (koe.length) {
    const blok = koe.shift(); resultat.push(blok);
    for (const naesteId of ud.get(blok.id).sort()) {
      grader.set(naesteId, grader.get(naesteId) - 1);
      if (grader.get(naesteId) === 0) { koe.push(blokke.find((post) => post.id === naesteId)); koe.sort((a, b) => a.id.localeCompare(b.id, "da")); }
    }
  }
  const cykliske = blokke.filter((blok) => !resultat.some((post) => post.id === blok.id));
  return { ok: ukendte.length === 0 && cykliske.length === 0, blokke: resultat, ukendte, cykliske };
}
