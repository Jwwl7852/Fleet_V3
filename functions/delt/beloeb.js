/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/beloeb.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/beloeb.js
 * Beløbsaritmetikken. ÉT sted, for alle der regner i øre.
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVORFOR FILEN BLEV UDSKILT FRA grundlag.js
 *
 * Abonnementsfaktureringen (FleetControl → vognmanden) skal regne præcis som
 * kundefaktureringen (vognmanden → hans kunde): øre som integer, afrunding
 * pr. linje én gang, moms der er `null` frem for gættet.
 *
 * `grundlag.js` importerer `booking-state.js` og kan derfor ikke kopieres til
 * `functions/delt/`. Den funktion der fryser en faktureringsperiode, kører
 * server-side — så uden den her fil ville tallene skulle skrives af, og så
 * ville der være TO afrundingsregler i ét repo. Det er den fejl vi bliver ved
 * med at betale for: Bil 104 med to nummerplader, to divisionsfiltre, to
 * demo-datasæt.
 *
 * INGEN IMPORTS. Som permissions.js, moduler.js, abonnement.js og steder.js.
 * ---------------------------------------------------------------------------
 */

/**
 * Mængder som TUSINDEDELE.
 *
 * 2,5 timer er 2500. 0,333 pallepladser er 333.
 *
 * Samme grund som øre og millimeter: 0,1 + 0,2 er ikke 0,3 i en float, og et
 * grundlag der ikke stemmer med sig selv på øren, kan ikke afstemmes mod
 * regnskabet. Fejlen ville være lille nok til at overleve gennemlæsning og
 * stor nok til at en bogholder ringer.
 */
export const ANTAL_SKALA = 1000;

export const antalFraTal = (n) => Math.round((Number(n) || 0) * ANTAL_SKALA);
export const talFraAntal = (a) => (Number(a) || 0) / ANTAL_SKALA;

/**
 * Linjens beløb, ekskl. moms.
 *
 * ⚠ DER AFRUNDES PR. LINJE, ÉN GANG. Ikke på totalen.
 *
 * Det er ikke ligegyldigt hvilken vej man gør det: runder man først på
 * totalen, kan summen af de viste linjer afvige fra den viste total med et par
 * øre, og så er der et tal på skærmen der ikke kan genfindes. Kunden lægger
 * linjerne sammen i hånden — det er præcis hvad man gør, når man er uenig.
 */
export const linjeBeloebOere = (l) =>
  Math.round(((l?.antal || 0) * (l?.satsOere || 0)) / ANTAL_SKALA);

/**
 * Momsen på en linje. null hvis satsen mangler — IKKE 0, og IKKE 25.
 *
 * Et manglende tal må aldrig blive til et gæt undervejs i et regnestykke; så
 * forsvinder det, og resultatet ser færdigt ud. Se validerLinje() i
 * grundlag.js for hele begrundelsen.
 */
export function linjeMomsOere(l) {
  if (!Number.isFinite(l?.momssats)) return null;
  return Math.round((linjeBeloebOere(l) * l.momssats) / 100);
}

/**
 * Totalerne for et sæt linjer. BEREGNET, aldrig gemt — beslutning 6.
 *
 * `momsOere` er null, hvis bare én linje mangler sin sats. Et halvt momsbeløb
 * er værre end intet: det ser ud som om det er regnet ud.
 */
export function totalerAfLinjer(linjer = []) {
  const beloebOere = linjer.reduce((s, l) => s + linjeBeloebOere(l), 0);
  const momsdele = linjer.map(linjeMomsOere);
  const momsOere = momsdele.some((m) => m === null)
    ? null
    : momsdele.reduce((s, m) => s + m, 0);
  return {
    beloebOere,
    momsOere,
    /* Ekskl. moms er det tal vi arbejder i overalt. Inkl. moms findes kun for
       at kunne vises, og kun når momsen er kendt. */
    ialtOere: momsOere === null ? null : beloebOere + momsOere,
    antalLinjer: linjer.length,
  };
}

/**
 * Rabat i BASISPOINT. 1500 = 15,00 %.
 *
 * ⚠ HELTAL, IKKE PROCENT MED DECIMALER. `15.5` som float giver
 * afrundingsfejl der først dukker op på faktura nummer fyrre — samme
 * begrundelse som øre (beslutning 2) og millimeter på et køretøj.
 */
export const BPS_SKALA = 10000;

/**
 * Satsen efter rabat.
 *
 * ⚠ RABATTEN REGNES IND I SATSEN, ÉN GANG — ikke oven på linjebeløbet.
 * Lagde man den ovenpå, ville der afrundes TO gange, og summen af linjerne
 * ville holde op med at stemme med totalen. Det er nøjagtig den slags
 * uoverensstemmelse en revisor finder, og den er umulig at forklare.
 *
 * Linjen bærer stadig `listeprisOere` og `rabatBps` som dokumentation — men
 * ét tal går ind i regnestykket.
 */
export function rabatteretSatsOere(listeprisOere, rabatBps = 0) {
  const pris = Number(listeprisOere) || 0;
  const bps = Math.max(0, Math.min(BPS_SKALA, Math.round(Number(rabatBps) || 0)));
  return Math.round((pris * (BPS_SKALA - bps)) / BPS_SKALA);
}

/** 1500 → "15 %". Kun til visning; regn aldrig på den. */
export const bpsTilPct = (bps) => (Number(bps) || 0) / 100;
export const pctTilBps = (pct) => Math.round((Number(pct) || 0) * 100);
