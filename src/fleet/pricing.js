/* src/fleet/pricing.js
 * Prismotoren. ÉN beregning, fire forbrugere:
 *   Bookingopsætning → eksempelkortet
 *   Booking          → "Estimeret beløb"
 *   Disponering      → økonomi pr. disponeret opgave
 *   Økonomi          → estimat vs. faktisk
 *
 * To regler der skal holdes:
 *  1. Satser overskrives ALDRIG. De får gyldigFra og lægges i en historik.
 *     Ellers ændrer en rettelse i dag prisen på en booking fra sidste kvartal.
 *  2. Hver booking gemmer et snapshot af de satser den blev beregnet med.
 *     Snapshottet er sandheden — ikke det aktuelle satsark.
 *
 * Alle beløb i hele ØRE.
 */
import { kr } from "./format.js";

/* ---- Satsopslag -------------------------------------------------- */

/**
 * Finder den sats der var gyldig på et givet tidspunkt.
 * satser: [{ gyldigFra: ms, beloebOere, metode, valuta, aktiv }]
 */
export function satsPaa(satser = [], paaMs = Date.now()) {
  return (
    satser
      .filter((s) => s.aktiv !== false && s.gyldigFra <= paaMs)
      .sort((a, b) => b.gyldigFra - a.gyldigFra)[0] || null
  );
}

/** Beregningsmetoder. Metoden bestemmer hvad antal betyder. */
export const METODER = {
  fastPrBooking: { label: "Pr. booking (fast pris)", enhed: null },
  prPassage:     { label: "Pr. passage",             enhed: "passager" },
  prPassageEnVej:{ label: "Pr. passage (én vej)",    enhed: "passager" },
  prDoegn:       { label: "Pr. døgn",                enhed: "døgn" },
  prKm:          { label: "Pr. km",                  enhed: "km" },
  prLagerdoegn:  { label: "Pr. lagerdøgn (efter friperiode)", enhed: "døgn" },
};

function linjebeloeb(sats, antal) {
  if (!sats) return 0;
  const m = sats.metode;
  if (m === "fastPrBooking") return sats.beloebOere;
  if (m === "prPassageEnVej") return sats.beloebOere;   // tælles ikke dobbelt ved retur
  /* Friperioden ligger PÅ satsen, ikke i beregningen. Ændrer lageret sine
     fridage, er det en ny sats med gyldigFra — ikke en rettelse af en
     konstant et sted i koden. */
  if (m === "prLagerdoegn") {
    return sats.beloebOere * Math.max(0, (antal || 0) - (sats.friDage || 0));
  }
  return sats.beloebOere * Math.max(0, antal || 0);
}

/* ---- Beregning ---------------------------------------------------- */

/**
 * beregnBooking(booking, satsark, { paaMs })
 *
 * booking: {
 *   bilId, kmEstimeret, doegnParkering,
 *   passager: { "faerge:femern": 1, "bro:storebaelt": 1, ... },
 *   agentId, retur: false
 * }
 * satsark: {
 *   biler:  { [bilId]: { navn, registrering, kmPrisSatser: [...] } },
 *   poster: { [postId]: { navn, kategori, satser: [...] } },
 *   agenter:{ [agentId]: { navn, by, satser: [...] } }
 * }
 *
 * → { linjer, totalOere, snapshot }
 *   snapshot gemmes PÅ bookingen, så prisen kan genskabes bagefter.
 */
export function beregnBooking(booking, satsark, { paaMs = Date.now() } = {}) {
  const linjer = [];
  const snapshot = { beregnetMs: paaMs, satser: {} };

  const brug = (id, sats, navn, antal, beloeb) => {
    if (!sats || !beloeb) return;
    snapshot.satser[id] = { ...sats };
    linjer.push({ id, navn, antal, beloebOere: beloeb });
  };

  /* 1. Km-omkostning for den valgte bil (inkl. chauffør) */
  const bil = satsark.biler?.[booking.bilId];
  if (bil) {
    const s = satsPaa(bil.kmPrisSatser, paaMs);
    const km = booking.kmEstimeret || 0;
    brug(`bil:${booking.bilId}`, s, `Km-omkostning – ${bil.navn}`, km, linjebeloeb({ ...s, metode: "prKm" }, km));
  }

  /* 2. Faste poster: færger, broer, tunneller, vejafgifter, parkering.
        Antallet kommer fra ruten — ikke fra en fast antagelse om hvilke
        passager en international tur indeholder. */
  for (const [postId, post] of Object.entries(satsark.poster || {})) {
    const antal = booking.passager?.[postId] ?? (post.altidPaaBooking ? 1 : 0);
    if (!antal && !post.altidPaaBooking) continue;
    const s = satsPaa(post.satser, paaMs);
    brug(`post:${postId}`, s, post.navn, antal, linjebeloeb(s, antal));
  }

  /* 3. Agentparkering — kun hvis der er valgt en agent */
  const agent = satsark.agenter?.[booking.agentId];
  if (agent) {
    const s = satsPaa(agent.satser, paaMs);
    const doegn = booking.doegnParkering || 1;
    brug(`agent:${booking.agentId}`, s, `Agentparkering: ${agent.navn} (${agent.by})`,
         doegn, linjebeloeb({ ...s, metode: "prDoegn" }, doegn));
  }

  const totalOere = linjer.reduce((sum, l) => sum + l.beloebOere, 0);
  return { linjer, totalOere, snapshot };
}

/* ---- Forløb med flere etaper (beslutning 16) ----------------------- */

/** Påbegyndte døgn. Rundes OP: et lager fakturerer et påbegyndt døgn. */
export const lagerdoegn = (fraMs, tilMs) =>
  Math.max(0, Math.ceil((tilMs - fraMs) / 86400000));

/**
 * Hvornår forlader godset lageret? Rangorden — og den er hele rettelsen af
 * prototypens systematiske undervurdering:
 *
 *   1. faktisk afgang     næste etape er udført
 *   2. planlagt afgang    næste etape er reserveret
 *   3. FRISTEN (senestMs) etapen er stadig åben
 *
 * Punkt 3 er det vigtige. Prototypen regnede planner-estimatet UDEN
 * lagerdage og den endelige faktura MED, så estimatet var systematisk for
 * lavt. Ved at bruge fristen fejler estimatet nu for HØJT — den rigtige
 * retning for et omkostningsestimat.
 *
 * Der er ingen fjerde mulighed. Mangler alle tre, er det en modelfejl, og
 * så kaster vi frem for at returnere nul lagerdage — nul er lige præcis den
 * fejl vi er ved at lukke.
 */
export function lagerUd(ophold) {
  if (ophold.udMs) return { ms: ophold.udMs, grundlag: "faktisk", estimeret: false };
  if (ophold.udPlanlagtMs) return { ms: ophold.udPlanlagtMs, grundlag: "planlagt", estimeret: true };
  if (ophold.senestMs) return { ms: ophold.senestMs, grundlag: "frist", estimeret: true };
  throw new Error(
    "lagerUd: lagerophold uden udMs, udPlanlagtMs eller senestMs. " +
    "Et ophold uden ende kan ikke prissættes, og nul lagerdage er ikke svaret."
  );
}

/**
 * beregnForloeb(forloeb, satsark, { paaMs })
 *
 * forloeb: {
 *   etaper: [ <samme form som booking i beregnBooking()> ],
 *   lagerophold: [{ lagerId, efterEtape, indMs, udMs?, udPlanlagtMs?, senestMs, maengde }]
 * }
 * satsark.lagre: { [lagerId]: { navn, kapacitet, satser: [...], haandteringSatser: [...] } }
 *
 * → { etaper, lagerlinjer, totalOere, estimeret, snapshot }
 *
 * estimeret er sandt hvis mindst én lagerlinje hviler på et estimat. Så ved
 * forbrugeren at tallet kan flytte sig, og kan skrive det — i stedet for at
 * vise et estimat som var det en faktura.
 */
export function beregnForloeb(forloeb, satsark, { paaMs = Date.now() } = {}) {
  const snapshot = { beregnetMs: paaMs, satser: {} };

  const etaper = (forloeb.etaper || []).map((e) => {
    const r = beregnBooking(e, satsark, { paaMs });
    Object.assign(snapshot.satser, r.snapshot.satser);
    return { etapeId: e.id ?? null, nr: e.nr ?? null, ...r };
  });

  const lagerlinjer = [];
  for (const ophold of forloeb.lagerophold || []) {
    const lager = satsark.lagre?.[ophold.lagerId];
    if (!lager) continue;

    const ud = lagerUd(ophold);
    const doegn = lagerdoegn(ophold.indMs, ud.ms);

    const haandtering = satsPaa(lager.haandteringSatser, paaMs);
    if (haandtering) {
      const id = `lager:${ophold.lagerId}:haandtering`;
      snapshot.satser[id] = { ...haandtering };
      lagerlinjer.push({
        id, navn: `Lagerhåndtering ind/ud – ${lager.navn}`,
        antal: 1, beloebOere: linjebeloeb(haandtering, 1), estimeret: false,
      });
    }

    /* Lagerdagslinjen udelades ALDRIG. Der findes ingen kodesti hvor et
       estimat regnes uden den. */
    const doegnsats = satsPaa(lager.satser, paaMs);
    if (doegnsats) {
      const id = `lager:${ophold.lagerId}:doegn`;
      snapshot.satser[id] = { ...doegnsats };
      const fri = doegnsats.friDage || 0;
      lagerlinjer.push({
        id,
        navn: `Lagerdage – ${lager.navn}`,
        antal: doegn,
        friDage: fri,
        fakturerbareDage: Math.max(0, doegn - fri),
        beloebOere: linjebeloeb(doegnsats, doegn),
        estimeret: ud.estimeret,
        grundlag: ud.grundlag,
        udMs: ud.ms,
      });
    }
  }

  const totalOere =
    etaper.reduce((s, e) => s + e.totalOere, 0) +
    lagerlinjer.reduce((s, l) => s + l.beloebOere, 0);

  return {
    etaper,
    lagerlinjer,
    totalOere,
    estimeret: lagerlinjer.some((l) => l.estimeret),
    snapshot,
  };
}

/**
 * Genberegning af en gemt booking. Bruger snapshottet, ikke det aktuelle
 * satsark — så en faktura fra sidste kvartal kan altid forklares.
 */
export function beregnFraSnapshot(booking) {
  if (!booking.prisSnapshot) return null;
  return booking.prisLinjer.reduce((sum, l) => sum + l.beloebOere, 0);
}

/** Overstyring på den enkelte booking. Gemmes som linje, ikke ved at
 *  ændre satsen — så det fremgår hvem der afveg fra standardprisen. */
export function medOverstyring(resultat, { id, navn, beloebOere, af, begrundelse }) {
  const linjer = resultat.linjer.map((l) =>
    l.id === id ? { ...l, beloebOere, overstyret: { af, begrundelse, oprindelig: l.beloebOere } } : l
  );
  return { ...resultat, linjer, totalOere: linjer.reduce((s, l) => s + l.beloebOere, 0) };
}

export const formatLinje = (l) => `${l.navn}: ${kr(l.beloebOere, 2)}`;
