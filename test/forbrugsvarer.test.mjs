/* test/forbrugsvarer.test.mjs
 * Procures EGET varelager — beslutning 85.
 *
 * ⚠ HVAD DEN HER PRØVE HOLDER FAST I:
 *
 *   1. **Det er ikke Warehouses `varer`.** Dér er godset KUNDENS, med et
 *      påkrævet `kundeId`. Blandede vi dem, ville Procure bede os bestille
 *      noget en kunde mangler.
 *   2. **Retningen kommer af ARTEN, ikke af et fortegn.** Et minus på et
 *      forbrug ville trække to gange.
 *   3. **En optælling SÆTTER, den lægger ikke til.** `antal` er det talte.
 *   4. **En negativ beholdning spærres ikke — den vises.** Den er beviset på
 *      en manglende bevægelse, ikke en fejl at afvise.
 *   5. **Rækken og tallet skrives i ÉN `update()`** (beslutning 39), og
 *      driften mellem dem vises på skærmen (beslutning 71).
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BEVAEGELSESART, ALLE_BEVAEGELSESARTER, valideForbrugsvare, valideBevaegelse,
  nyBeholdning, laveVarer, udenGraense, negativeBeholdninger,
  beholdningAfBevaegelser, beholdningsafvigelse, behovFraVare,
} from "../src/fleet/forbrugsvarer.js";
import {
  DEMO_FORBRUGSVARER, DEMO_FORBRUGSVAREBEVAEGELSER,
} from "../src/fleet/demo-forbrugsvarer.js";
import { DEMO_VARER } from "../src/fleet/demo-lager.js";
import { valideBehov } from "../src/fleet/procure.js";

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SKAERM = udenKommentarer(readFileSync("src/moduler/indkoeb/Varelager.jsx", "utf8"));
const KLIENT = udenKommentarer(readFileSync("src/fleet/varelager.js", "utf8"));
const SERVER = udenKommentarer(readFileSync("functions/index.js", "utf8"));
const REGELFIL = readFileSync("firebase.rules.json", "utf8");

function funktion(navn) {
  const start = SERVER.indexOf(`export const ${navn} =`);
  if (start < 0) throw new Error(`${navn} findes ikke i functions/index.js`);
  const slut = SERVER.indexOf("\nexport const ", start + 1);
  return SERVER.slice(start, slut < 0 ? SERVER.length : slut);
}

/* ══════════════════════════════════════════════════════════════════════════
   VORES VARER, IKKE KUNDENS
   ══════════════════════════════════════════════════════════════════════════ */
describe("Forbrugsvarer er ikke Warehouses varer", () => {
  /**
   * ⚠ FJERDE GANG ET LAGERNAVN SKAL SKILLES FRA ET ANDET. `varer` er
   * Warehouses 3PL-gods med et PÅKRÆVET `kundeId`; `lagre` er
   * reservedelslageret; `warehouse` er reserveret til et kommende modul. Det
   * her er vores egne handsker og strækfilm.
   */
  test("⚠ INGEN FORBRUGSVARE BÆRER ET kundeId", () => {
    for (const v of DEMO_FORBRUGSVARER) {
      assert.equal(v.kundeId, undefined,
        `${v.id} bærer et kundeId — så er det kundens gods, ikke vores`);
    }
    /* Og omvendt: Warehouses varer bærer det ALLE. De to sæt kan ikke byttes. */
    for (const v of DEMO_VARER) {
      assert.ok(v.kundeId, `${v.id} mangler kundeId — Warehouse er 3PL`);
    }
  });

  /* ⚠ OG NODERNE ER TO. En regel der delte dem, ville dele adgangen til
     kundens gods med vores eget indkøb. */
  test("⚠ forbrugsvarer OG varer ER TO NODER I REGLERNE", () => {
    assert.ok(REGELFIL.includes('"forbrugsvarer": {'));
    assert.ok(REGELFIL.includes('"forbrugsvarebevaegelser": {'));
    /* Warehouses egen node findes stadig, uændret. */
    assert.ok(REGELFIL.includes('"beholdning": {'));
  });

  test("⚠ BEGGE NODER ER .write: false", () => {
    for (const navn of ["forbrugsvarer", "forbrugsvarebevaegelser"]) {
      const i = REGELFIL.indexOf(`"${navn}": {`);
      const blok = REGELFIL.slice(i, i + 1200);
      assert.match(blok, /"\.write": false/, `${navn} kan skrives direkte`);
      /* Modulklausulen — en kunde uden Procure skal ikke kunne læse den. */
      assert.match(blok, /child\('indkoeb'\)\.val\(\) === true/);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ARTEN BÆRER RETNINGEN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Retningen kommer af arten, ikke af et fortegn", () => {
  const vare = { id: "v1", navn: "Handsker", enhed: "par", beholdning: 10 };

  test("⚠ ANTALLET ER ALTID POSITIVT", () => {
    const grund = { forbrugsvareId: "v1", ms: 1, uid: "u" };
    assert.equal(valideBevaegelse({ ...grund, art: "forbrug", antal: -3 }).ok, false,
      "et negativt antal blev taget imod — det ville trække to gange");
    assert.equal(valideBevaegelse({ ...grund, art: "forbrug", antal: 3 }).ok, true);
  });

  test("⚠ HVER ART HAR EN RETNING OG EN ETIKET", () => {
    for (const a of ALLE_BEVAEGELSESARTER) {
      assert.ok(BEVAEGELSESART[a].label, `${a} har ingen etiket`);
      assert.ok(BEVAEGELSESART[a].tone, `${a} har ingen tone`);
      assert.ok(Number.isFinite(BEVAEGELSESART[a].retning), `${a} har ingen retning`);
    }
    assert.equal(BEVAEGELSESART.modtaget.retning, 1);
    assert.equal(BEVAEGELSESART.forbrug.retning, -1);
    assert.equal(BEVAEGELSESART.svind.retning, -1);
    /* Optællingen har retning 0 — den SÆTTER. */
    assert.equal(BEVAEGELSESART.optaelling.retning, 0);
  });

  /**
   * ⚠ EN OPTÆLLING SÆTTER, DEN LÆGGER IKKE TIL. `antal` er det TALTE.
   *
   * Uden arten skulle den der tæller, taste "korrektion −2" og regne
   * forskellen i hovedet — og en fejl i det hovedregnestykke ser bagefter ud
   * som svind.
   */
  test("⚠ EN OPTÆLLING SÆTTER BEHOLDNINGEN", () => {
    assert.equal(nyBeholdning(vare, { art: "modtaget", antal: 5 }), 15);
    assert.equal(nyBeholdning(vare, { art: "forbrug", antal: 4 }), 6);
    assert.equal(nyBeholdning(vare, { art: "svind", antal: 2 }), 8);
    assert.equal(nyBeholdning(vare, { art: "optaelling", antal: 3 }), 3,
      "optællingen blev lagt til frem for at sætte");
  });

  /* En optælling til nul er et svar; en modtagelse af nul er en tastefejl. */
  test("⚠ NUL ER GYLDIGT FOR EN OPTÆLLING, IKKE FOR DE ANDRE", () => {
    const grund = { forbrugsvareId: "v1", ms: 1, uid: "u", antal: 0 };
    assert.equal(valideBevaegelse({ ...grund, art: "optaelling" }).ok, true);
    assert.equal(valideBevaegelse({ ...grund, art: "modtaget" }).ok, false);
    assert.equal(valideBevaegelse({ ...grund, art: "forbrug" }).ok, false);
  });

  /**
   * ⚠ SVIND KRÆVER EN GRUND. Et tal der forsvinder uden forklaring, bliver
   * ikke undersøgt — og svind er netop dét man skal undersøge. Forbrug kræver
   * ingen: det er hvad varen er til.
   */
  test("⚠ SVIND KRÆVER EN NOTE, FORBRUG GØR IKKE", () => {
    const grund = { forbrugsvareId: "v1", antal: 2, ms: 1, uid: "u" };
    assert.equal(valideBevaegelse({ ...grund, art: "svind" }).ok, false);
    assert.equal(valideBevaegelse({ ...grund, art: "svind", note: "Væltede." }).ok, true);
    assert.equal(valideBevaegelse({ ...grund, art: "forbrug" }).ok, true);
  });

  /* ⚠ SKÆRMEN OG SERVEREN REGNER MED SAMME nyBeholdning(). To regnestykker
     ville kunne blive uenige om en optælling. */
  test("⚠ SKÆRM OG SERVER BRUGER SAMME nyBeholdning()", () => {
    assert.match(SKAERM, /nyBeholdning\(/);
    assert.match(funktion("forbrugsvarebevaegelse"), /nyBeholdning\(vare, post\)/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   MINIMUM ER VALGFRIT
   ══════════════════════════════════════════════════════════════════════════ */
describe("En vare uden grænse har ingen lav-tilstand", () => {
  /**
   * ⚠ SATTES MINIMUM TIL 0 SOM STANDARD, ville varen ALDRIG være lav; sattes
   * det til et tal, havde vi opfundet en indkøbspolitik på kundens vegne.
   * Begge er værre end at spørge.
   */
  test("⚠ MINIMUM ER VALGFRIT", () => {
    assert.equal(valideForbrugsvare({ navn: "X", enhed: "stk" }).ok, true);
    assert.equal(valideForbrugsvare({ navn: "X", enhed: "stk", minimumBeholdning: 0 }).ok, true);
    assert.equal(valideForbrugsvare({ navn: "X", enhed: "stk", minimumBeholdning: -1 }).ok, false);
  });

  /* En vare uden grænse tælles hverken som lav eller som fyldt op. */
  test("⚠ EN VARE UDEN GRÆNSE ER HVERKEN LAV ELLER FYLDT OP", () => {
    const varer = [
      { id: "a", beholdning: 0, minimumBeholdning: 5 },
      { id: "b", beholdning: 0 },
      { id: "c", beholdning: 99, minimumBeholdning: 5 },
    ];
    assert.deepEqual(laveVarer(varer).map((v) => v.id), ["a"]);
    assert.deepEqual(udenGraense(varer).map((v) => v.id), ["b"]);
  });

  /* ⚠ PÅ GRÆNSEN ER LAV. "Vi har præcis minimum" er tidspunktet at bestille,
     ikke tidspunktet efter. */
  test("⚠ PRÆCIS PÅ MINIMUM TÆLLER SOM LAV", () => {
    assert.equal(laveVarer([{ id: "a", beholdning: 5, minimumBeholdning: 5 }]).length, 1);
    assert.equal(laveVarer([{ id: "a", beholdning: 6, minimumBeholdning: 5 }]).length, 0);
  });

  /* ⚠ TOM STRENG BLIVER null — "ingen grænse" — og ikke 0. `Number("")` er 0,
     og en grænse på nul betyder at varen ALDRIG er lav. */
  test("⚠ ET TØMT MINIMUMSFELT BLIVER null, IKKE 0", () => {
    assert.match(SKAERM, /udkast\.minimum === "" \? null : Number\(udkast\.minimum\)/);
  });

  /* ⚠ OG null SKAL KUNNE SENDES. Uden den skelnen kunne en grænse aldrig
     fjernes igen — og en grænse man ikke kan fjerne, bliver sat til et højt
     tal i stedet, hvor den ligner en beslutning. */
  test("⚠ KLIENTEN SKELNER null FRA undefined", () => {
    assert.match(KLIENT, /minimumBeholdning === null/);
    assert.match(funktion("forbrugsvareskriv"), /d\.minimumBeholdning === null/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   MINUS ER ET BEVIS, IKKE EN FEJL
   ══════════════════════════════════════════════════════════════════════════ */
describe("En negativ beholdning spærres ikke", () => {
  /**
   * ⚠ FRISTELSEN ER AT AFVISE ET FORBRUG DER BRINGER TALLET UNDER NUL.
   *
   * Men det SKETE jo: nogen tog de sidste fem handsker, og tallet var forkert
   * i forvejen. Afviste vi bevægelsen, ville den rigtige hændelse gå tabt for
   * at beskytte et tal der allerede var galt — og den der står med en tom
   * kasse, får at vide at han tager fejl. Svaret er en OPTÆLLING.
   */
  test("⚠ REGLEN TILLADER EN NEGATIV BEHOLDNING", () => {
    const i = REGELFIL.indexOf('"forbrugsvarer": {');
    const blok = REGELFIL.slice(i, REGELFIL.indexOf('"forbrugsvarebevaegelser": {'));
    const linje = blok.split(/\r?\n/).find((l) => l.includes('"beholdning":'));
    assert.ok(linje, "beholdningen har ingen regel");
    assert.ok(!linje.includes(">= 0"),
      "beholdningen kan ikke gå i minus — så går den rigtige hændelse tabt");
  });

  test("⚠ nyBeholdning() REGNER VIDERE UNDER NUL", () => {
    assert.equal(nyBeholdning({ beholdning: 3 }, { art: "forbrug", antal: 5 }), -2);
  });

  /* ⚠ OG DEN VISES. En drift der ikke kan ses, bliver ikke rettet. */
  test("⚠ DEMO HAR EN NEGATIV, OG SKÆRMEN TEGNER DEN", () => {
    const neg = negativeBeholdninger(DEMO_FORBRUGSVARER);
    assert.ok(neg.length >= 1,
      "ingen negativ beholdning i demo — så kan skærmen ikke vise hvordan den ser ud");
    assert.match(SKAERM, /negativeBeholdninger\(/);
    assert.match(SKAERM, /Svaret er en optælling/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   RÆKKEN OG TALLET
   ══════════════════════════════════════════════════════════════════════════ */
describe("Bevægelsen og beholdningen skrives sammen", () => {
  /**
   * ⚠ ÉN update(). De to bærer den SAMME kendsgerning — det ene som et tal,
   * det andet som en række — og deler man skrivningen i to kald, kan halvdelen
   * lande. Så er uenigheden vores egen. Samme ordning som `enheder`/
   * `beholdning` (beslutning 39).
   */
  test("⚠ RÆKKEN OG TALLET LANDER I ÉN update()", () => {
    const blok = funktion("forbrugsvarebevaegelse");
    assert.match(blok, /await db\.ref\(\)\.update\(\{/);
    assert.match(blok, /forbrugsvarebevaegelser\/\$\{ref\.key\}/);
    assert.match(blok, /forbrugsvarer\/\$\{forbrugsvareId\}\/beholdning/);
    assert.equal((blok.match(/\.update\(|\.set\(/g) || []).length, 1,
      "der er mere end én skrivning — halvdelen kan lande");
  });

  /* ⚠ STAMDATA RØRER IKKE BEHOLDNINGEN. Et felt en formular kunne sætte,
     ville være en femte bevægelsesart ingen har besluttet — og den ville ikke
     stå i historikken. */
  test("⚠ forbrugsvareskriv SÆTTER IKKE BEHOLDNINGEN PÅ EN RETTELSE", () => {
    const blok = funktion("forbrugsvareskriv");
    /* Kun ved OPRETTELSE sættes den, og da til nul. */
    assert.match(blok, /post\.beholdning = 0;/);
    assert.ok(!/d\.beholdning/.test(blok),
      "beholdningen kan sættes fra klienten — det er en usporet rettelse");
    assert.ok(!/beholdning/.test(KLIENT),
      "klienten sender en beholdning");
  });

  /**
   * ⚠ DET GEMTE TAL PRØVES MOD BEVÆGELSERNE. Beholdningen er gemt fordi en
   * skærm ikke kan summere historikken for hver vare hver gang — men et gemt
   * afledt tal driver (beslutning 71), og forskellen vises PÅ SKÆRMEN.
   */
  test("⚠ DEMO-SÆTTET STEMMER MED SIG SELV", () => {
    const drift = beholdningsafvigelse(DEMO_FORBRUGSVARER, DEMO_FORBRUGSVAREBEVAEGELSER);
    assert.deepEqual(drift, [],
      "demo-sættet er uenigt med sig selv — skærmen ville vise en drift vi selv har lavet");
  });

  test("⚠ OG SKÆRMEN VISER DRIFTEN", () => {
    assert.match(SKAERM, /beholdningsafvigelse\(/);
    assert.match(SKAERM, /manglende bevægelse/);
  });

  /* En optælling midt i historikken nulstiller summen — det er hele arten. */
  test("⚠ beholdningAfBevaegelser() RESPEKTERER EN OPTÆLLING", () => {
    assert.equal(beholdningAfBevaegelser([
      { art: "modtaget", antal: 20, ms: 1 },
      { art: "forbrug", antal: 5, ms: 2 },
      { art: "optaelling", antal: 12, ms: 3 },
      { art: "forbrug", antal: 2, ms: 4 },
    ]), 10);
  });

  /* ⚠ OG DEN SORTERER SELV. Kommer rækkerne i vilkårlig orden fra RTDB, ville
     en optælling ellers kunne lande før den modtagelse den rettede. */
  test("⚠ REKKEFØLGEN AFGØRES AF ms, IKKE AF LISTEN", () => {
    const bagvendt = [
      { art: "forbrug", antal: 2, ms: 4 },
      { art: "optaelling", antal: 12, ms: 3 },
      { art: "modtaget", antal: 20, ms: 1 },
    ];
    assert.equal(beholdningAfBevaegelser(bagvendt), 10);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   LAVT LAGER BLIVER TIL ET BEHOV
   ══════════════════════════════════════════════════════════════════════════ */
describe("Et lavt lager bliver til et indkøbsbehov", () => {
  /**
   * ⚠ UDEN ET ANTAL. Vi ved at varen er lav; vi ved ikke hvor meget der skal
   * købes. Antallet er valgfrit på et behov netop af den grund (beslutning
   * 80), og et gæt — "op til minimum", "en pakke" — ville gå med i en
   * bestilling.
   */
  test("⚠ BEHOVET BÆRER INTET ANTAL", () => {
    const b = behovFraVare(DEMO_FORBRUGSVARER[0]);
    assert.equal(b.antal, undefined, "et gættet antal ville gå med i en bestilling");
    assert.equal(b.kilde, "lager");
    assert.ok(b.vare);
  });

  /* Og det skal kunne gemmes — ellers er knappen en fælde. */
  test("⚠ BEHOVET KAN FAKTISK GEMMES", () => {
    for (const v of laveVarer(DEMO_FORBRUGSVARER)) {
      const udkast = {
        ...behovFraVare(v),
        status: "nyt", oprettetAf: "uid-x", oprettetMs: Date.now(),
      };
      const r = valideBehov(udkast);
      assert.equal(r.ok, true,
        `${v.id}: ${Object.entries(r.fejl).map(([f, m]) => `${f}: ${m}`).join(", ")}`);
    }
  });

  /* ⚠ KNAPPEN STÅR KUN PÅ DE LAVE. En "meld ind"-knap på hver række ville
     gøre indbakken til en indkøbsliste over alt vi ejer. */
  test("⚠ KNAPPEN STÅR KUN PÅ DE LAVE", () => {
    assert.match(SKAERM, /v\.beholdning <= v\.minimumBeholdning && \(/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   DEMO-SÆTTET
   ══════════════════════════════════════════════════════════════════════════ */
describe("Demo-sættet kan vise hver tilstand", () => {
  test("⚠ HVER VARE ER GYLDIG", () => {
    for (const v of DEMO_FORBRUGSVARER) {
      const r = valideForbrugsvare(v);
      assert.equal(r.ok, true,
        `${v.id}: ${Object.entries(r.fejl).map(([f, m]) => `${f}: ${m}`).join(", ")}`);
    }
  });

  test("⚠ HVER BEVÆGELSE ER GYLDIG OG PEGER PÅ EN VARE", () => {
    const ider = new Set(DEMO_FORBRUGSVARER.map((v) => v.id));
    for (const b of DEMO_FORBRUGSVAREBEVAEGELSER) {
      assert.ok(ider.has(b.forbrugsvareId),
        `${b.id} peger på varen "${b.forbrugsvareId}", som ikke findes`);
      const r = valideBevaegelse(b);
      assert.equal(r.ok, true,
        `${b.id}: ${Object.entries(r.fejl).map(([f, m]) => `${f}: ${m}`).join(", ")}`);
    }
  });

  /* ⚠ HVER ART SKAL VÆRE BRUGT — især optællingen, som er den der er svær at
     forstå uden et eksempel. */
  test("⚠ HVER ART HAR ET EKSEMPEL", () => {
    const brugte = new Set(DEMO_FORBRUGSVAREBEVAEGELSER.map((b) => b.art));
    for (const a of ALLE_BEVAEGELSESARTER) {
      assert.ok(brugte.has(a), `ingen bevægelse med arten "${a}" — den kan ikke ses virke`);
    }
  });

  /* ⚠ OG BÅDE LAVE OG UDEN GRÆNSE. Uden begge betyder "0 under minimum" både
     "alt er fyldt op" og "ingen har sat en grænse". */
  test("⚠ BÅDE LAVE VARER OG VARER UDEN GRÆNSE", () => {
    assert.ok(laveVarer(DEMO_FORBRUGSVARER).length >= 1);
    assert.ok(udenGraense(DEMO_FORBRUGSVARER).length >= 1);
  });

  /* ⚠ FØR OG EFTER STÅR PÅ RÆKKEN. Uden dem kan en enkelt bevægelse ikke
     læses alene — man skulle summere hele historikken for at vide hvad den
     betød. */
  test("⚠ HVER BEVÆGELSE BÆRER foer OG efter", () => {
    for (const b of DEMO_FORBRUGSVAREBEVAEGELSER) {
      assert.ok(Number.isFinite(b.foer), `${b.id} mangler foer`);
      assert.ok(Number.isFinite(b.efter), `${b.id} mangler efter`);
    }
  });
});
