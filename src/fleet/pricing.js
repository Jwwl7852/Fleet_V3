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
};

function linjebeloeb(sats, antal) {
  if (!sats) return 0;
  const m = sats.metode;
  if (m === "fastPrBooking") return sats.beloebOere;
  if (m === "prPassageEnVej") return sats.beloebOere;   // tælles ikke dobbelt ved retur
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
