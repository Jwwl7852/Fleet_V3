/* test/demo-referencer.test.mjs
 * Et demo-sæt der peger på noget der ikke findes, seeder en base der gør det.
 *
 * ⚠ HVORFOR FILEN FINDES. Målt i den udrullede DEV-base:
 *
 *   indberetninger → materialelinjer → lagerId = "lager-hoved"
 *   lagre                                      = lag-kolding, lag-aalborg, lag-odense
 *
 * Tre materialelinjer pegede på lagre der **ikke findes i nogen tenant**. To
 * demo-filer havde hver sin id-konvention for den samme node — `lager-*` mod
 * `lag-*` — og ingen af dem vidste det. Det er Bil 104 med to nummerplader
 * igen, denne gang på tværs af to filer.
 *
 * ⚠ OG REGLERNE FANGEDE DET IKKE. `materialelinjer.lagerId` har ingen
 * eksistenstjek — den er ét af **21 af 72 referencefelter** i
 * `firebase.rules.json` uden. Nogle af de 21 kan ikke få et: de peger på
 * noder der ikke findes endnu (`sager/`, bilag i Storage). Men et felt uden
 * tjek betyder at demo-dataene er det eneste sted fejlen kan fanges — og så
 * skal de fanges dér.
 *
 * ⚠ EN LINT DER SPRINGER ET FELT OVER, SIGER INGENTING. Derfor er kravet
 * vendt om: **hvert** felt der ender på `Id` skal enten have en målnode i
 * `PEGER_PAA` eller stå i `UDEN_MAAL` med en grund. Et nyt felt kan ikke
 * glide forbi ved at være ukendt.
 *
 * Se beslutning 92.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { SEED } from "../scripts/provisioner-dev.mjs";

/** Node → det seedede sæt. Kun det der faktisk skrives til basen. */
const SAET = Object.fromEntries(SEED.map((s) => [s.node, s.data]));

/** Alle id'er i et sæt. Sættene er arrays af poster med `id`. */
function iderI(node) {
  const data = SAET[node];
  if (!data) return null;
  const liste = Array.isArray(data) ? data : Object.values(data);
  return new Set(liste.map((p) => p?.id).filter(Boolean));
}

/**
 * Feltnavn → den node det peger på.
 *
 * ⚠ NAVNET ER AFTALEN. `personId` er hvem det HANDLER om, `uid` er hvem der
 * GJORDE noget (CLAUDE.md) — derfor står `uid`, `oprettetAf` og `afUid` ikke
 * her: de peger på et login, ikke på en post i et sæt.
 */
const PEGER_PAA = {
  koeretoejId: "koeretoejer",
  koeretoejIder: "koeretoejer",
  personId: "personale",
  ansvarligPersonId: "personale",
  lagerId: "lagre",
  leverandoerId: "leverandoerer",
  kundeId: "kunder",
  bookingId: "bookinger",
  etapeId: "etaper",
  kasseId: "kasser",
  aktivId: "facility/aktiver",
  lokationId: "facility/lokationer",
  zoneId: "facility/zoner",
  ordreId: "indkoebsordrer",
  behovId: "indkoebsbehov",
  forbrugsvareId: "forbrugsvarer",
  indkoebId: "indkoeb",
  vareId: "varer",
  carrierId: "carriers",
  fraCarrierId: "carriers",
  tilCarrierId: "carriers",
  afsendCarrierId: "carriers",
  pladsId: "reolpladser",
  hjemPladsId: "reolpladser",
  fraPladsId: "reolpladser",
  tilPladsId: "reolpladser",
  erstatterId: "grundlag",
  erstattetAfId: "grundlag",
};

/**
 * Felter der IKKE kan prøves — hvert med sin grund.
 *
 * ⚠ EN GRUND, IKKE BARE EN UNDTAGELSE. Listen er kun brugbar hvis den kan
 * blive kortere: står et felt her fordi dets node ikke findes endnu, hører
 * det i `PEGER_PAA` samme dag noden bygges.
 */
const UDEN_MAAL = {
  sagId: "`sager/` findes ikke i regelfilen — beslutning 20 er stadig fase 0",
  besoegId: "et besøg BLEV en opgave i beslutning 21; feltet er kun et spor bagud",
  bilagId: "et bilag ligger i Storage, og DEV har ingen bucket (Spark-planen)",
  bevaegelseId: "`bevaegelser` skrives af bevaegelseskriv og står ikke i SEED",
  lagertraekId: "lagertrækket er materialelinjens ANDEN postering (beslutning 11), "
    + "og den node findes ikke endnu",
  grundlagslinjeId: "peger på en linje INDE i et grundlag, ikke på en post i en node",
  valgtForslagId: "peger på en nøgle INDE i etapen — beslutning 58",
  destinationId: "målnoden afgøres af `destinationArt`; fakturacenter.test.mjs dækker den",
  anmoderId: "et login (`uid`), ikke en post nogen node bærer",
  bestillerId: "et login (`uid`), ikke en post nogen node bærer",
  tenantId: "tenanten selv, ikke en post under den",
  prislisteId: "`udbyder/prisliste` er vores egen node, ikke kundens",
};

/** Hvert felt der ender på Id, i en post og i dens underlister. */
function referencerI(post, sti = "") {
  const ud = [];
  if (!post || typeof post !== "object") return ud;
  for (const [k, v] of Object.entries(post)) {
    if (v === null || v === undefined) continue;
    if (/Id$|Ider$/.test(k)) {
      ud.push({ felt: k, vaerdi: v, sti: `${sti}${k}` });
      continue;
    }
    if (Array.isArray(v)) {
      for (const [i, e] of v.entries()) ud.push(...referencerI(e, `${sti}${k}[${i}].`));
    } else if (typeof v === "object") {
      ud.push(...referencerI(v, `${sti}${k}.`));
    }
  }
  return ud;
}

const ALLE = SEED.flatMap((s) => {
  const liste = Array.isArray(s.data) ? s.data : Object.values(s.data || {});
  return liste.flatMap((p) => referencerI(p, `${s.node}/${p?.id || "?"}.`));
});

describe("Demo-sættene peger på noget der findes", () => {
  it("der ER referencer at prøve — ellers læser prøven ingenting", () => {
    assert.ok(ALLE.length > 20, `kun ${ALLE.length} referencer fundet i SEED`);
  });

  /**
   * ⚠ DEN HER ER KRAVET. Et felt der hverken har en målnode eller en grund,
   * er et felt ingen har taget stilling til — og så er det tilfældigt om det
   * peger på noget.
   */
  it("⚠ HVERT REFERENCEFELT ER ENTEN KENDT ELLER BEGRUNDET", () => {
    const ukendte = [...new Set(
      ALLE.filter((r) => !PEGER_PAA[r.felt] && !UDEN_MAAL[r.felt]).map((r) => r.felt)
    )];
    assert.deepEqual(ukendte, [],
      "referencefelter uden målnode og uden begrundelse:\n  " + ukendte.join("\n  "));
  });

  /**
   * ⚠ OG DEN HER ER DEN DER FANGEDE `lager-hoved`.
   *
   * Tre materialelinjer pegede på lagre der ikke fandtes i noget sæt, og de
   * blev seedet ud i to tenants. Reglen for feltet har intet eksistenstjek,
   * så der var ingen anden vej det kunne opdages på end ved at kigge.
   */
  it("⚠ HVER REFERENCE MED EN MÅLNODE RAMMER EN POST DER FINDES", () => {
    const hul = [];
    for (const r of ALLE) {
      const node = PEGER_PAA[r.felt];
      if (!node) continue;
      const ider = iderI(node);
      if (!ider) continue;                 /* noden seedes ikke — intet at prøve */
      const vaerdier = Array.isArray(r.vaerdi) ? r.vaerdi : [r.vaerdi];
      for (const v of vaerdier) {
        if (typeof v !== "string" || !v) continue;
        if (!ider.has(v)) hul.push(`${r.sti} = "${v}" findes ikke i ${node}`);
      }
    }
    assert.deepEqual(hul, [],
      "et demo-sæt peger på en post der ikke findes. Seedes det, står "
      + "referencen og peger på ingenting i den udrullede base:\n  " + hul.join("\n  "));
  });

  it("⚠ UNDTAGELSESLISTEN ER IKKE EN LOSSEPLADS", () => {
    /* Hver grund skal være en sætning, ikke et ord. En liste hvor der står
       "senere" ud for hvert felt, er en liste ingen læser igen. */
    for (const [felt, grund] of Object.entries(UDEN_MAAL)) {
      assert.ok(grund.length > 15, `${felt} har ingen rigtig begrundelse: "${grund}"`);
    }
    /* Og et felt må ikke stå begge steder — så ville det være tilfældigt
       hvilken af de to der gjaldt. */
    const begge = Object.keys(UDEN_MAAL).filter((f) => PEGER_PAA[f]);
    assert.deepEqual(begge, [], "et felt står både som kendt og som undtaget");
  });
});
