/* src/fleet/etaper.js
 * Etapen som transportstrækning. BESLUTNING 16 og 21.
 *
 * INGEN IMPORTS ud over reservations.js — samme grund som opgaver.js og
 * fravaer.js: den Cloud Function der skriver etapen, skal kunne bruge nøjagtig
 * samme vokabular som skærmen.
 *
 * ⚠ DET MAN DISPONERER, ER EN ETAPE — ikke en booking, og ikke en opgave.
 * Beslutning 21: `langtur` er IKKE en art på opgaver. Hvert felt en langtur
 * har brug for, står her, og matchAabneEtaper() søger på denne node. Lå
 * langturen begge steder, ville koeretoejId og personId stå to steder — og så
 * er vi tilbage ved prototypens DE-QR 777 mod DE-KL 404.
 *
 * TILSTANDEN LIGGER PÅ ETAPEN, ikke på bookingen — se booking-state.js.
 * Denne fil rummer transportsiden: hvor, hvornår fremme, over hvilken grænse.
 */

import { RESSOURCE, KILDE } from "./reservations.js";

/* ---- Grænseovergange -------------------------------------------------- */

/**
 * Vokabular ét sted. Skrev hver skærm sin egen streng, hed det "Padborg" på
 * den ene og "Padborg/Frøslev" på den næste — og så kan man ikke tælle hvor
 * mange ture der gik over grænsen.
 *
 * `land` er landet man kører IND i. En tur kan have flere.
 */
export const GRAENSEOVERGANG = {
  padborg:   { label: "Padborg",            land: "DE", type: "landevej" },
  froeslev:  { label: "Frøslev",            land: "DE", type: "landevej" },
  roedby:    { label: "Rødby–Puttgarden",   land: "DE", type: "faerge"   },
  gedser:    { label: "Gedser–Rostock",     land: "DE", type: "faerge"   },
  oeresund:  { label: "Øresundsbron",       land: "SE", type: "bro"      },
};

export const ALLE_GRAENSEOVERGANGE = Object.keys(GRAENSEOVERGANG);

export const graenseLabel = (n) => GRAENSEOVERGANG[n]?.label || n;

/* ---- Etapens transportfelter ------------------------------------------ */

/**
 * Felter der kun findes på en etape — modstykket til ART_FELTER i opgaver.js.
 * De står her og ikke i reglerne: reglerne håndhæver `division`, resten er
 * formularlogik. Samme afvejning som på køretøjer og opgaver.
 */
export const FELT = {
  fraSted: "fraSted",
  tilSted: "tilSted",
  etaMs: "etaMs",                       // forventet fremme. Over døgngrænser
  graenseovergange: "graenseovergange", // [] på en indenlandsk tur
  kunDanmark: "kunDanmark",
  passager: "passager",                 // { postId: antal } — prismotorens input
  koeretoejId: "koeretoejId",
  personId: "personId",
  maengde: "maengde",                   // { m3, kg }
  senestMs: "senestMs",                 // frist på en åben etape
};

/** Krydser etapen en grænse? Udledt, aldrig gemt. */
export const krydserGraense = (e) => (e?.graenseovergange?.length || 0) > 0;

/**
 * ⚠ kunDanmark og en grænseovergang er en MODSIGELSE.
 *
 * Feltet betyder at strækningen bliver i Danmark. Står der samtidig Padborg
 * på den, er ét af de to felter forkert — og begge bliver læst: `kunDanmark`
 * af den der fordeler ture til chauffører der ikke kører udenlands, og
 * `graenseovergange` af prismotoren. En modsigelse her giver enten en tur til
 * den forkerte chauffør eller en pris uden vejafgift.
 *
 * → { ok, aarsag }
 */
export function tjekGeografi(etape) {
  if (!etape) return { ok: false, aarsag: "Ingen etape." };
  if (etape.kunDanmark && krydserGraense(etape)) {
    return {
      ok: false,
      aarsag: `Etapen er markeret "kun kørsel i Danmark", men krydser ` +
              `${etape.graenseovergange.map(graenseLabel).join(", ")}.`,
    };
  }
  const ukendte = (etape.graenseovergange || []).filter((g) => !GRAENSEOVERGANG[g]);
  if (ukendte.length) {
    return { ok: false, aarsag: `Ukendt grænseovergang: ${ukendte.join(", ")}.` };
  }
  return { ok: true };
}

/** Varighed i minutter, til køre-hviletidsberegningen. */
export const varighedMin = (e) =>
  Number.isFinite(e?.fra) && Number.isFinite(e?.til) ? (e.til - e.fra) / 60000 : 0;

/* ---- Reservationen ---------------------------------------------------- */

/**
 * En etape binder TO ressourcer: bilen og chaufføren. Derfor to reservationer,
 * ikke én — de er hver sin eksklusive ressource, og en bil kan skifte chauffør
 * midt i et forløb.
 *
 * BYGGER, SKRIVER IKKE. Beslutning 16: etapens koeretoejId og dens reservation
 * skal skrives i ÉN transaktion af en Cloud Function, netop så de ikke kan
 * være uenige. Denne funktion leverer det der skal skrives.
 *
 * Kilde `booking` med prioritet 10 — den laveste af de rigtige kilder. Et
 * værkstedsbesøg (40) og et fravær (30) vinder begge, og det er meningen: en
 * bil på værksted kan ikke køre, og en syg chauffør kan ikke disponeres,
 * uanset hvad disponenten har lovet kunden.
 */
export function reservationerFraEtape(etape) {
  if (!etape?.id) throw new Error("reservationerFraEtape: etapen mangler et id.");
  if (!Number.isFinite(etape.fra) || !Number.isFinite(etape.til) || etape.til <= etape.fra) {
    throw new Error("reservationerFraEtape: fra og til skal være konkrete tidspunkter med til > fra.");
  }

  const kilde = { type: KILDE.booking, id: etape.id, reference: etape.bookingId ?? null };
  const ud = [];
  if (etape.koeretoejId) {
    ud.push({
      ressourceType: RESSOURCE.koeretoej,
      ressourceId: etape.koeretoejId,
      fra: etape.fra, til: etape.til, kilde, maengde: null, note: null,
    });
  }
  if (etape.personId) {
    ud.push({
      ressourceType: RESSOURCE.medarbejder,
      ressourceId: etape.personId,
      fra: etape.fra, til: etape.til, kilde, maengde: null, note: null,
    });
  }
  return ud;
}
