/* src/fleet/demo-stemplinger.js
 * Chaufførens stemplinger — demo. BESLUTNING 107.
 *
 * ⚠ NØGLET PÅ personId, SOM NODEN. `stemplinger/<personId>/<id>`, og
 * `<id>` er postens egen nøgle. Et demosæt med en anden FORM end noden er
 * fælden fra beslutning 76 — dér brugte demo arrays hvor noden var nøglet, og
 * tre overgange var lukkede i produktion mens de virkede i demo.
 *
 * ⚠ OG DER ER INGEN POSITION. Beslutning 22 siger INGEN GPS, og spørgsmålet
 * om et enkelt punkt ved stempling er stillet og ikke besvaret. Et demofelt
 * ville være det første sted svaret blev givet — af en fil.
 *
 * ⚠ SIDSTE VAGT ER ÅBEN MED VILJE. Det er den tilstand skærmen skal kunne:
 * "Stemplet IND", dagen uden et tal, og ugen der ikke kan gøres op. Var alle
 * lukkede, ville halvdelen af `stempling.js` aldrig blive tegnet.
 */

import { selvkontrol } from "./selvkontrol.js";
import { DEMO_PERSONALE } from "./demo-personale.js";

/* Mandag i indeværende uge, kl. 00 — så sættet følger med kalenderen og ikke
   ligger og bliver gammelt. Samme greb som demo-etaper.js' dag(). */
const UGESTART = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
})();

/**
 * I dag kl. t — til den ÅBNE vagt.
 *
 * ⚠ EN ÅBEN VAGT SKAL KUNNE STEMPLES UD. `valideStempling()` afviser en vagt
 * over et døgn, så en åben post på en fast ugedag bliver ubrugelig sent i
 * ugen: knappen står der, og kaldet afvises. Den regnes derfor af nu.
 *
 * ⚠ OG KL. 6 ER FØR ARBEJDSDAGEN. Kigger man kl. 05, ville en vagt der begynder
 * kl. 06 ligge i fremtiden, og `valideStempling()` afviser den også. Tidspunktet
 * bindes derfor til det tidligste af de to.
 */
const idagKl = (t, m = 0) => {
  const d = new Date();
  d.setHours(t, m, 0, 0);
  return Math.min(d.getTime(), Date.now() - 60000);
};

/**
 * ⚠ SAMME FÆLDE SOM stp-aaben LØSTE — NU FOR DE LUKKEDE VAGTER.
 *
 * Her stod en `paa(n, t)`, der regnede dag n i INDEVÆRENDE uge fra
 * `UGESTART`. Dag 1 er tirsdag — og er i dag mandag, er den tirsdag i
 * MORGEN. En lukket vagt med et tidspunkt i fremtiden bliver afvist af
 * `valideStempling()`, præcis som den skal. Målt: suiten fejlede på netop
 * det, mandag den 24. august 2026 — samme fælde `stp-aaben`s egen note
 * beskriver, bare i den anden ende af ugen.
 *
 * De LUKKEDE vagter (man/tir/ons) skal ligge et sted der er garanteret
 * fortid UANSET hvilken ugedag suiten kører. Forrige uge er det: den er
 * altid forbi, uanset i dag er mandag eller søndag. `stp-aaben` bruger
 * fortsat `idagKl()`, ikke denne — den ÅBNE vagt skal jo være i dag.
 */
const FORRIGE_UGE = UGESTART - 7 * 86400000;
const iForrigeUge = (n, t, m = 0) => {
  const d = new Date(FORRIGE_UGE);
  d.setDate(d.getDate() + n);
  d.setHours(t, m, 0, 0);
  return d.getTime();
};

export const DEMO_STEMPLINGER = {
  /* Lars Aage — chaufføren DEV-kontoen er koblet til (beslutning 103). */
  larsAage: {
    "stp-man": { indMs: iForrigeUge(0, 6, 30), udMs: iForrigeUge(0, 15, 0) },
    "stp-tir": { indMs: iForrigeUge(1, 6, 15), udMs: iForrigeUge(1, 16, 45) },
    /* ⚠ EN NATTUR. Ind onsdag 22, ud torsdag 06 — den tæller på
       AFGANGSDAGEN, og det står på skærmen. At dele den over midnat er et
       spørgsmål om overenskomst, ikke om kode. */
    "stp-ons": {
      indMs: iForrigeUge(2, 22, 0), udMs: iForrigeUge(3, 6, 0), note: "Nattur til Hamburg",
    },
    /**
     * ⚠ ÅBEN, OG PÅ DAGEN I DAG. Ingen `udMs` — det er tilstanden
     * "Stemplet IND".
     *
     * Den lå først på en fast ugedag, og det var forkert på en måde der kun
     * kunne ses ved at åbne skærmen: sent i ugen var vagten **61 timer**
     * gammel, og `valideStempling()` afviser en vagt over et døgn. Demoen
     * kunne altså vise knappen "Stempl UD" og ikke bruge den.
     *
     * Den regnes derfor af NU og ikke af ugestarten — som `dag()` i
     * demo-etaper.js.
     */
    "stp-aaben": { indMs: idagKl(6, 15) },
  },
  reneThomsen: {
    "stp-r-man": { indMs: iForrigeUge(0, 7, 0), udMs: iForrigeUge(0, 15, 30) },
    "stp-r-tir": { indMs: iForrigeUge(1, 7, 0), udMs: iForrigeUge(1, 15, 15) },
  },
};

/* ⚠ SELVKONTROL — hver demo-fil med krydsreferencer skal have en.
   `test/demo-kilder.test.mjs` kræver det, fordi en drift mellem to demo-sæt
   ellers først opdages når nogen kigger: her ville en stempling på en
   medarbejder der er slettet af `demo-personale.js`, blive seedet ud og stå
   under et personId ingen skærm kan sætte navn på. */
selvkontrol("demo-stemplinger", () => {
  const kendte = new Set(DEMO_PERSONALE.map((p) => p.id));
  for (const personId of Object.keys(DEMO_STEMPLINGER)) {
    if (!kendte.has(personId)) {
      console.warn(
        `demo-stemplinger: stemplinger på "${personId}", som ikke står i ` +
        "DEMO_PERSONALE. Timerne ville blive seedet ud under et personId " +
        "ingen skærm kan sætte navn på."
      );
    }
  }
  /* ⚠ OG PRÆCIS ÉN ÅBEN. Er der ingen, kan skærmens "Stemplet IND" aldrig
     ses i demo; er der to, viser `aabenStempling()` den nyeste, og den anden
     står som en vagt der aldrig blev lukket. */
  const aabne = Object.values(DEMO_STEMPLINGER)
    .flatMap((m) => Object.values(m))
    .filter((s) => !Number.isFinite(s.udMs));
  if (aabne.length !== 1) {
    console.warn(
      `demo-stemplinger: ${aabne.length} åbne stemplinger — der skal være ` +
      "præcis én, ellers kan skærmens to tilstande ikke begge ses."
    );
  }
});
