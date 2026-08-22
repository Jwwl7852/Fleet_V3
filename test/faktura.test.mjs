/* test/faktura.test.mjs
 * Faktura, match og kontantkøb — beslutning 83, trin 4 i Procures proces.
 *
 * ⚠ HVAD DEN HER PRØVE HOLDER FAST I:
 *
 *   1. **Kun et bestillingsnummer giver 100 %.** Alt andet er en slutning —
 *      samme leverandør, nogenlunde samme beløb, nogenlunde samme uge. En
 *      slutning må ikke kunne se ud som en kendsgerning, når tallet står ved
 *      siden af en knap der hedder "Bekræft".
 *   2. **Begge beløb er ekskl. moms.** Planchen sammenlignede fakturaens
 *      inkl.-tal med ordrens ekskl.-tal. Det er 25 % forkert, systematisk, og
 *      ser ud som om leverandøren har overfaktureret.
 *   3. **Et kontantkøb er en `indkoeb`-linje**, ikke en node ved siden af.
 *   4. **Scoren gemmes ikke.** Afgørelsen gør.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  matchForslag, matchtilstand, MATCHTILSTAND, MATCHSIGNAL, kanMatche,
  matchAfvigelseOere, MATCH_MINDSTE_SCORE, ordreSumOere,
  valideKontantkoeb, kontantkoebLinje, kontantUdenBilag, BETALINGSFORM,
} from "../src/fleet/procure.js";
import { DEMO_INDKOEBSORDRER } from "../src/fleet/demo-procure.js";
import { DEMO_FAKTURAER, DEMO_INDKOEBSLINJER } from "../src/fleet/demo-indkoeb.js";

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SKAERM = udenKommentarer(readFileSync("src/moduler/indkoeb/Fakturaer.jsx", "utf8"));
const KLIENT = udenKommentarer(readFileSync("src/fleet/faktura.js", "utf8"));
const SERVER = udenKommentarer(readFileSync("functions/index.js", "utf8"));
const REGELFIL = readFileSync("firebase.rules.json", "utf8");

function funktion(navn) {
  const start = SERVER.indexOf(`export const ${navn} =`);
  if (start < 0) throw new Error(`${navn} findes ikke i functions/index.js`);
  const slut = SERVER.indexOf("\nexport const ", start + 1);
  return SERVER.slice(start, slut < 0 ? SERVER.length : slut);
}

const DAG = 86400000;
const ordre = (o = {}) => ({
  id: "o1", nummer: "BST-2026-00041", leverandoerId: "lv-a", status: "sendt",
  oprettetMs: 1000 * DAG,
  linjer: { a: { vare: "x", antal: 2, prisPrEnhedOere: 50000 } },
  ...o,
});
const faktura = (f = {}) => ({
  id: "f1", fakturanummer: "A-1", leverandoerId: "lv-a", status: "modtaget",
  beloebOere: 100000, momsOere: 25000, fakturadatoMs: 1002 * DAG,
  ...f,
});

/* ══════════════════════════════════════════════════════════════════════════
   SCOREN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Scoren er en påstand der kan efterprøves", () => {
  /**
   * ⚠ KUN ET BESTILLINGSNUMMER GIVER 100. Det er hele grunden til at
   * `mailudkast()` beder om nummeret på fakturaen (beslutning 81): uden det
   * kan matchet kun gættes, og to bestillinger til samme firma i samme uge
   * ser ens ud.
   */
  test("⚠ KUN ET NUMMERTRÆF GIVER 100 %", () => {
    const med = matchForslag(faktura({ reference: "BST-2026-00041" }), [ordre()]);
    assert.equal(med[0].score, 100);
    assert.ok(med[0].signaler.includes("nummer"));

    /* Alt andet — leverandør, beløb, dato — kan tilsammen højst give 95. */
    const uden = matchForslag(faktura(), [ordre()]);
    assert.ok(uden[0].score <= 95,
      `en slutning fik ${uden[0].score} % og ser ud som en kendsgerning`);
    assert.ok(!uden[0].signaler.includes("nummer"));
  });

  /* Nummeret findes trods bindestreger og mellemrum — en faktura skriver det
     ikke nødvendigvis som vi gør. */
  test("nummeret findes trods anden skrivemåde", () => {
    for (const ref of ["BST 2026 00041", "bst-2026-00041", "Ordre: BST202600041"]) {
      const f = matchForslag(faktura({ reference: ref }), [ordre()]);
      assert.equal(f[0]?.score, 100, `"${ref}" blev ikke genkendt`);
    }
  });

  /**
   * ⚠ EN ANDEN LEVERANDØRS ORDRE FORESLÅS IKKE — uanset beløbet. Circle K
   * sender ikke en regning for Dækteams bestilling. Uden det led gav beløb +
   * dato alene 55 %, og et forslag på over halvdelen ser rigtigt nok ud til
   * at nogen bekræfter det for at komme videre. Det blev målt.
   */
  test("⚠ EN ANDEN LEVERANDØRS ORDRE FORESLÅS IKKE", () => {
    const f = matchForslag(faktura({ leverandoerId: "lv-b" }), [ordre()]);
    assert.deepEqual(f, []);
    /* Undtagelsen er nummeret: står vores nummer på fakturaen, er en forkert
       leverandoerId en FEJL vi skal se — ikke en grund til at skjule den. */
    const medNummer = matchForslag(
      faktura({ leverandoerId: "lv-b", reference: "BST-2026-00041" }), [ordre()]);
    assert.equal(medNummer[0].score, 100);
  });

  /**
   * ⚠ EN KLADDE ER ALDRIG ET MATCH. En bestilling der aldrig blev sendt, kan
   * ikke have udløst en faktura — og stod den på listen, kunne et tilfældigt
   * beløbssammenfald "afslutte" en kladde ingen har bestilt.
   */
  test("⚠ KLADDER, ANNULLEREDE OG AFVISTE ORDRER FORESLÅS IKKE", () => {
    for (const status of ["kladde", "annulleret", "afvist"]) {
      assert.deepEqual(matchForslag(faktura(), [ordre({ status })]), [],
        `en ordre med status "${status}" blev foreslået`);
    }
  });

  /* ⚠ EN ALLEREDE MATCHET ORDRE FORESLÅS IKKE. To fakturaer på samme
     bestilling er en dublet eller en delfakturering — begge dele skal et
     menneske tage stilling til. */
  test("⚠ EN ORDRE DER ALLEREDE ER MATCHET, FORESLÅS IKKE", () => {
    assert.deepEqual(matchForslag(faktura(), [ordre()], { matchede: ["o1"] }), []);
  });

  /* ⚠ EN FAKTURA DATERET FØR BESTILLINGEN ER IKKE "TÆT PÅ" — den er et andet
     køb. */
  test("⚠ EN FAKTURA FØR BESTILLINGEN FÅR IKKE DATOSIGNALET", () => {
    const f = matchForslag(faktura({ fakturadatoMs: 900 * DAG }), [ordre()]);
    assert.ok(!f[0].signaler.includes("dato"));
  });

  /* Et svagt forslag vises ikke — det inviterer til at nogen bekræfter det
     for at komme videre, og en dårlig match ser afsluttet ud. */
  test("⚠ FORSLAG UNDER LOFTET VISES IKKE", () => {
    const svagt = matchForslag(
      faktura({ beloebOere: 999999999, fakturadatoMs: 5000 * DAG }), [ordre()]);
    for (const f of svagt) {
      assert.ok(f.score >= MATCH_MINDSTE_SCORE, "et forslag under loftet slap igennem");
    }
  });

  /* Hvert signal skal kunne vises — et navn skærmen ikke kender, er en tom
     celle ved siden af et tal der ser præcist ud. */
  test("⚠ HVERT SIGNAL HAR EN ETIKET", () => {
    const alle = matchForslag(faktura({ reference: "BST-2026-00041" }), [ordre()]);
    for (const s of alle[0].signaler) {
      assert.ok(MATCHSIGNAL[s]?.label, `signalet "${s}" har ingen etiket`);
    }
  });

  /* Bedst først — ellers står den svageste øverst hvor øjet lander. */
  test("forslagene er sorteret bedst først", () => {
    const to = matchForslag(faktura({ reference: "BST-2026-00042" }), [
      ordre(),
      ordre({ id: "o2", nummer: "BST-2026-00042", linjer: { a: { vare: "y", antal: 1, prisPrEnhedOere: 1 } } }),
    ]);
    assert.equal(to[0].ordre.id, "o2");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   MOMSEN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Begge beløb er ekskl. moms", () => {
  /**
   * ⚠ PLANCHEN HAVDE FEJLEN SELV. Detaljeruden skriver fakturaen som
   * "23.031 kr. inkl. moms" og den matchede ordre som "23.031 kr. ekskl.
   * moms" — det samme tal med to mærkater. Sammenlignede vi dem sådan, ville
   * hver eneste beløbssammenligning være 25 % forkert, systematisk, og se ud
   * som om leverandøren havde overfaktureret.
   */
  test("⚠ BELØBSSIGNALET MÅLER EKSKL. MOD EKSKL.", () => {
    const o = ordre();                     // 2 × 500,00 = 1.000,00 ekskl.
    assert.equal(ordreSumOere(o), 100000);

    const ekskl = matchForslag(faktura({ beloebOere: 100000, momsOere: 25000 }), [o]);
    assert.ok(ekskl[0].signaler.includes("beloeb"),
      "et beløb der ER ens ekskl. moms, blev ikke genkendt");

    /* Havde vi sammenlignet med inkl.-tallet, ville 125.000 have matchet. */
    const inkl = matchForslag(faktura({ beloebOere: 125000, momsOere: 0 }), [o]);
    assert.ok(!inkl[0].signaler.includes("beloeb"),
      "et inkl.-beløb blev talt som ens — sammenligningen er 25 % forkert");
  });

  /**
   * ⚠ AFVIGELSEN ER null NÅR ET TAL MANGLER — ikke 0. Et nul betyder "de er
   * ens", hvilket er noget helt andet end "vi ved det ikke". `100 - null` er
   * 100; det er præcis den fælde CLAUDE.md kalder at regne videre på et null.
   */
  test("⚠ EN AFVIGELSE DER IKKE KAN REGNES, ER null — IKKE NUL", () => {
    assert.equal(matchAfvigelseOere(faktura(), ordre()), 0);
    assert.equal(matchAfvigelseOere({ leverandoerId: "lv-a" }, ordre()), null);
    assert.equal(matchAfvigelseOere(faktura(), null), null);
    assert.equal(matchAfvigelseOere(faktura(), ordre({ linjer: {} })), null);
    assert.equal(matchAfvigelseOere(faktura({ beloebOere: 120000 }), ordre()), 20000);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   MATCHET SOM AFGØRELSE
   ══════════════════════════════════════════════════════════════════════════ */
describe("Matchet er en afgørelse, ikke en score", () => {
  test("de tre tilstande kan alle vises", () => {
    assert.equal(matchtilstand({ ordreId: "o1" }), "matchet");
    assert.equal(matchtilstand({ ikkeMatchbar: true }), "ikkeMatchbar");
    assert.equal(matchtilstand({}), "manglerMatch");
    for (const k of Object.keys(MATCHTILSTAND)) {
      assert.ok(MATCHTILSTAND[k].label && MATCHTILSTAND[k].tone, `${k} kan ikke vises`);
    }
  });

  /**
   * ⚠ EN BOGFØRT FAKTURA MATCHES IKKE OM. Posten er sendt til regnskabet, og
   * et match der ændrer sig bagefter, gør en afstemning der stemte, til en
   * der ikke gør — uden at nogen kan se hvorfor.
   */
  test("⚠ EN BOGFØRT FAKTURA KAN IKKE MATCHES OM", () => {
    const svar = kanMatche(faktura({ status: "bogfoert" }), ordre());
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /bogført/i);
  });

  test("⚠ EN KLADDE KAN IKKE MATCHES", () => {
    const svar = kanMatche(faktura(), ordre({ status: "kladde" }));
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /aldrig sendt/);
  });

  test("det samme match to gange er ikke et match", () => {
    assert.equal(kanMatche(faktura({ ordreId: "o1" }), ordre()).ok, false);
  });

  /**
   * ⚠ SCOREN GEMMES IKKE. Et gemt tal driver fra sit grundlag første gang
   * nogen retter et beløb — og et sikkerhedstal der ser præcist ud uden at
   * være det, er værre end intet tal. Det der gemmes, er AFGØRELSEN.
   */
  test("⚠ INGEN DEMO-FAKTURA BÆRER EN GEMT MATCHSCORE", () => {
    for (const f of DEMO_FAKTURAER) {
      for (const felt of ["matchScore", "score", "matchPct"]) {
        assert.equal(f[felt], undefined, `${f.id} bærer et gemt ${felt}`);
      }
    }
    assert.ok(!/matchScore/.test(REGELFIL), "regelfilen tillader en gemt matchscore");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KONTANTKØBET
   ══════════════════════════════════════════════════════════════════════════ */
describe("Et kontantkøb er en indkøbslinje", () => {
  const godt = {
    vare: "Arbejdshandsker", leverandoerId: "lv-a", antal: 12,
    prisPrEnhedOere: 1600, udlaegAf: "uid-1", dato: 1000, betalingsform: "kontant",
  };

  test("⚠ FORMEN KRÆVER BÅDE BELØB, UDLÆGGER OG DATO", () => {
    assert.equal(valideKontantkoeb(godt).ok, true);
    assert.equal(valideKontantkoeb({ ...godt, udlaegAf: undefined }).ok, false);
    assert.equal(valideKontantkoeb({ ...godt, dato: undefined }).ok, false);
    assert.equal(valideKontantkoeb({ ...godt, prisPrEnhedOere: undefined }).ok, false);
  });

  /* ⚠ HELE ØRE SOM INTEGER. 16,00 kr er 1600, aldrig 16 og aldrig 16.5. */
  test("⚠ BELØBET SKAL VÆRE HELE ØRE", () => {
    assert.equal(valideKontantkoeb({ ...godt, prisPrEnhedOere: 16.5 }).ok, false);
    assert.equal(valideKontantkoeb({ ...godt, prisPrEnhedOere: -1 }).ok, false);
    assert.equal(valideKontantkoeb({ ...godt, momsOere: 4.5 }).ok, false);
  });

  /* ⚠ BETALINGSFORMEN ER ET FELT, IKKE EN STATUS — og den skal være sat. */
  test("⚠ EN LINJE UDEN betalingsform: kontant ER IKKE ET KONTANTKØB", () => {
    assert.equal(valideKontantkoeb({ ...godt, betalingsform: "faktura" }).ok, false);
    assert.equal(valideKontantkoeb({ ...godt, betalingsform: undefined }).ok, false);
    assert.ok(BETALINGSFORM.kontant && BETALINGSFORM.faktura);
  });

  /**
   * ⚠ HVEM DER REGISTREREDE, ER IKKE HVEM DER LAGDE UD. En kontorassistent
   * taster en kollegas bon; pengene skal til kollegaen. Samme skel som uid
   * mod personId.
   */
  test("⚠ udlaegAf OG oprettetAf ER TO FELTER", () => {
    const l = kontantkoebLinje({ ...godt, udlaegAf: "uid-michael" },
      { uid: "uid-mette", nu: 5 });
    assert.equal(l.udlaegAf, "uid-michael");
    assert.equal(l.oprettetAf, "uid-mette");
  });

  /**
   * ⚠ INGEN `fakturastatus`. Der KOMMER ingen faktura; "mangler" ville lade
   * købet stå i hver optælling af det vi venter på, og listen over manglende
   * bilag kunne aldrig tømmes.
   */
  test("⚠ LINJEN FÅR INGEN fakturastatus", () => {
    const l = kontantkoebLinje(godt, { uid: "u", nu: 5 });
    assert.equal(l.fakturastatus, undefined);
    assert.equal(l.betalingsform, "kontant");
  });

  test("⚠ DEN KASTER FREM FOR AT GEMME NOGET UGYLDIGT", () => {
    assert.throws(() => kontantkoebLinje({ ...godt, prisPrEnhedOere: undefined },
      { uid: "u", nu: 5 }));
  });

  /**
   * ⚠ MANGLEN TÆLLES FREM FOR AT SPÆRRE. Der er ingen fillagring at kræve en
   * kvittering med, og et krav man ikke kan opfylde, bliver til et felt man
   * skriver "ja" i. Uden et eksempel i demoen kan tællingen ikke ses virke.
   */
  test("⚠ ET KONTANTKØB UDEN BILAG FINDES I DEMO OG TÆLLES", () => {
    const uden = kontantUdenBilag(DEMO_INDKOEBSLINJER);
    assert.ok(uden.length >= 1,
      "intet kontantkøb uden bilag — så kan tællingen ikke ses virke");
    for (const l of uden) assert.equal(l.betalingsform, "kontant");
    /* En linje MED bilag tælles ikke. */
    assert.equal(kontantUdenBilag([{ betalingsform: "kontant", bilagId: "b1" }]).length, 0);
    /* Og en almindelig fakturalinje tælles aldrig. */
    assert.equal(kontantUdenBilag([{ betalingsform: "faktura" }]).length, 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   DEMO-SÆTTET
   ══════════════════════════════════════════════════════════════════════════ */
describe("Demo-sættet viser alle tre matchtilstande", () => {
  const matchede = DEMO_FAKTURAER.map((f) => f.ordreId).filter(Boolean);

  test("⚠ ALLE TRE TILSTANDE FINDES", () => {
    const set = new Set(DEMO_FAKTURAER.map(matchtilstand));
    for (const k of Object.keys(MATCHTILSTAND)) {
      assert.ok(set.has(k), `ingen faktura er "${k}" — tilstanden kan ikke ses`);
    }
  });

  /* ⚠ EN ikkeMatchbar UDEN GRUND ER EN TAVSHED. */
  test("⚠ EN IKKE-MATCHBAR FAKTURA HAR SIN GRUND", () => {
    for (const f of DEMO_FAKTURAER.filter((x) => x.ikkeMatchbar)) {
      assert.ok(f.ikkeMatchbarGrund, `${f.id} er ikke-matchbar uden en grund`);
    }
  });

  /* ⚠ ET ordreId SKAL RAMME. En hængende reference ser matchet ud og er det
     ikke — og den er allerede talt som afstemt. */
  test("⚠ INTET ordreId HÆNGER", () => {
    const findes = new Set(DEMO_INDKOEBSORDRER.map((o) => o.id));
    for (const f of DEMO_FAKTURAER.filter((x) => x.ordreId)) {
      assert.ok(findes.has(f.ordreId), `${f.id} peger på ordren "${f.ordreId}", som ikke findes`);
    }
  });

  /**
   * ⚠ ET MATCHET BELØB SKAL FAKTISK PASSE. Er de to uenige i demo, ser
   * afvigelsen ud som et fund — og den er vores egen.
   */
  test("⚠ EN MATCHET FAKTURA STEMMER MED SIN ORDRE", () => {
    for (const f of DEMO_FAKTURAER.filter((x) => x.ordreId)) {
      const o = DEMO_INDKOEBSORDRER.find((x) => x.id === f.ordreId);
      assert.equal(matchAfvigelseOere(f, o), 0,
        `${f.id} og ${o.nummer} er uenige om beløbet i demo`);
    }
  });

  /**
   * ⚠ BÅDE ET NUMMERTRÆF OG EN SLUTNING SKAL KUNNE SES. Findes kun det ene,
   * kan skærmen ikke vise forskellen mellem 100 % og 83 % — og den forskel er
   * hele grunden til at signalerne står under scoren.
   */
  test("⚠ DEMO HAR BÅDE ET 100 %-MATCH OG ET SVAGERE", () => {
    const scorer = DEMO_FAKTURAER
      .filter((f) => !f.ordreId && !f.ikkeMatchbar)
      .flatMap((f) => matchForslag(f, DEMO_INDKOEBSORDRER, { matchede }).map((x) => x.score));
    assert.ok(scorer.includes(100), "intet nummertræf i demo");
    assert.ok(scorer.some((s) => s < 100), "hvert forslag er et nummertræf");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SERVEREN OG SKÆRMEN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Skærmen viser, serveren håndhæver", () => {
  test("⚠ fakturamatch BRUGER SAMME kanMatche SOM SKÆRMEN", () => {
    assert.match(funktion("fakturamatch"), /kanMatche\(faktura, ordre\)/);
    assert.match(SKAERM, /kanMatche\(/);
  });

  /**
   * ⚠ SCOREN SENDES IKKE MED. Klienten siger hvilken ORDRE; serveren skriver
   * afgørelsen. Kom scoren udefra, gemte vi en påstand vi ikke kan efterprøve.
   */
  test("⚠ KLIENTEN SENDER INGEN SCORE", () => {
    assert.ok(!/score/i.test(KLIENT), "klienten sender en matchscore");
    assert.ok(!/matchScore/.test(funktion("fakturamatch")), "serveren gemmer en score");
  });

  /* ⚠ ÉN FAKTURA PR. BESTILLING. Reglen kan ikke håndhæve det — en .validate
     ser én post ad gangen — så leddet står i funktionen. */
  test("⚠ SERVEREN AFVISER TO FAKTURAER PÅ SAMME BESTILLING", () => {
    const blok = funktion("fakturamatch");
    assert.match(blok, /orderByChild\("ordreId"\)\.equalTo\(ordreId\)/);
    assert.match(blok, /allerede matchet med en anden faktura/);
  });

  /* Og forespørgslen skal have sit indeks — ellers henter RTDB hele noden ned
     og filtrerer i klienten med en advarsel i konsollen. */
  test("⚠ ordreId ER INDEKSERET PÅ fakturaer", () => {
    const i = REGELFIL.indexOf('"fakturaer": {');
    const blok = REGELFIL.slice(i, i + 2500);
    assert.match(blok, /"\.indexOn": \[[^\]]*"ordreId"/);
  });

  /* ⚠ "INGEN AF FORSLAGENE PASSER" KRÆVER EN GRUND. */
  test("⚠ ikkeMatchbar KRÆVER EN BEGRUNDELSE", () => {
    assert.match(funktion("fakturamatch"), /Skriv hvorfor ingen af bestillingerne passer/);
  });

  /**
   * ⚠ AT GODKENDE EN REGNING KRÆVER indkoeb.godkend — beslutning 82. Og er
   * `fakturagodkendelse` slået til, er det den UDPEGEDE der afgør.
   */
  test("⚠ fakturastatus HÅNDHÆVER BESLUTNING 82's ANDEN KONTAKT", () => {
    const blok = funktion("fakturastatus");
    assert.match(blok, /PERM\.indkoebGodkend/);
    assert.match(blok, /rod\.child\("godkendelsesregler"\)\.once\("value"\)/);
    assert.match(blok, /fg\.aktiv && fg\.godkenderUid && fg\.godkenderUid !== uid/);
  });

  /* ⚠ MAN BOGFØRER IKKE NOGET DER IKKE ER GODKENDT. Planchens egen fodnote
     siger det. */
  test("⚠ BOGFØRING KRÆVER EN GODKENDT FAKTURA", () => {
    const blok = funktion("fakturastatus");
    assert.match(blok, /faktura\.status !== "godkendt"/);
    assert.match(blok, /skal godkendes foer den kan bogfoeres/);
  });

  /* ⚠ EN BOGFØRT FAKTURA ER EN ENDESTATION. */
  test("⚠ EN BOGFØRT FAKTURA KAN IKKE ÆNDRES", () => {
    assert.match(funktion("fakturastatus"), /faktura\.status === "bogfoert"/);
    assert.match(funktion("fakturamatch"), /faktura\.status === "bogfoert"/);
  });

  /**
   * ⚠ KONTANTKØBET SKRIVES I `indkoeb`, IKKE I EN NODE VED SIDEN AF. En egen
   * node ville være den samme kendsgerning to steder, og hvert beløb i
   * modulet skulle huske at lægge dem sammen.
   */
  test("⚠ KONTANTKØBET BLIVER EN indkoeb-LINJE", () => {
    const blok = funktion("kontantkoebskriv");
    assert.match(blok, /rod\.child\("indkoeb"\)\.push\(\)/);
    assert.ok(!/kontantkoeb\//.test(blok), "der skrives til en node ved siden af");
    assert.ok(!/"kontantkoeb": \{/.test(REGELFIL), "der findes en kontantkoeb-node");
  });

  /* ⚠ udlaegAf SKAL VÆRE EN BRUGER I HUSET — pengene skal til nogen. */
  test("⚠ SERVEREN TJEKKER AT UDLÆGGEREN FINDES", () => {
    assert.match(funktion("kontantkoebskriv"), /brugere\/\$\{udlaegAf\}/);
  });
});

describe("Skærmen siger hvad den ikke gør", () => {
  /* ⚠ FILUPLOAD ER IKKE BYGGET, og en deaktiveret knap uden en grund er en
     attrap. */
  test("⚠ UPLOAD SIGER AT DEN IKKE ER BYGGET", () => {
    assert.match(SKAERM, /Upload er ikke bygget endnu/);
    assert.match(SKAERM, /Kvittering kan ikke vedhæftes endnu/);
  });

  /* ⚠ OG BOGFØRING SENDER IKKE NOGET. En knap der påstod det, ville få nogen
     til at holde op med at bogføre manuelt. */
  test("⚠ DER LOVES INGEN REGNSKABSINTEGRATION", () => {
    assert.match(SKAERM, /Der sendes ikke noget til et\s+regnskabssystem/);
  });

  /* ⚠ TOM STRENG ER IKKE NUL — `Number("")` er 0. */
  test("⚠ ET TØMT BELØBSFELT SENDES IKKE SOM NUL", () => {
    assert.match(SKAERM, /kontant\.belob === "" \? undefined : Math\.round\(Number\(kontant\.belob\) \* 100\)/);
  });

  test("⚠ SIGNALERNE VISES UNDER SCOREN", () => {
    assert.match(SKAERM, /MATCHSIGNAL\[s\]\.label/);
  });

  test("⚠ DEMO-SÆTTENE BRUGES KUN SOM demo:-FALDBAKKE", () => {
    for (const navn of ["DEMO_FAKTURAER", "DEMO_INDKOEBSLINJER", "DEMO_LEVERANDOERER",
      "DEMO_INDKOEBSORDRER", "DEMO_GODKENDELSESREGLER"]) {
      const alle = [...SKAERM.matchAll(new RegExp(`\\b${navn}\\b`, "g"))].length;
      const fald = [...SKAERM.matchAll(new RegExp(`demo: ${navn}\\b`, "g"))].length;
      assert.equal(alle - 1, fald, `${navn} bruges uden for demo:-faldbakken`);
    }
  });

  test("⚠ KLIENTEN KASTER IKKE", () => {
    assert.ok(!/throw/.test(KLIENT), "klienten kaster — en afvisning er et svar");
    assert.match(KLIENT, /failed-precondition/);
  });
});
