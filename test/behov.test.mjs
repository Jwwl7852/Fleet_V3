/* test/behov.test.mjs
 * Indmelding af indkøbsbehov — beslutning 78, etape 2.
 *
 * ⚠ SKÆRMEN OG SERVEREN KALDER SAMME `valideBehov()`. Serveren afviser med den
 * sætning brugeren allerede har set; to formuleringer af én spærring er to
 * forklaringer på én ting. Prøven her holder de to op mod hinanden.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DEMO_INDKOEBSBEHOV } from "../src/fleet/demo-procure.js";
import { valideBehov, ALLE_BEHOVKILDER, BEHOVSTATUS } from "../src/fleet/procure.js";

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SKAERM = udenKommentarer(readFileSync("src/moduler/indkoeb/Behov.jsx", "utf8"));
const KLIENT = udenKommentarer(readFileSync("src/fleet/behov.js", "utf8"));
const SERVER = udenKommentarer(readFileSync("functions/index.js", "utf8"));

describe("Demo-sættet kan gemmes", () => {
  test("⚠ HVER POST ER GYLDIG", () => {
    for (const b of DEMO_INDKOEBSBEHOV) {
      const r = valideBehov(b);
      assert.equal(r.ok, true,
        `${b.id}: ${Object.entries(r.fejl).map(([f, m]) => `${f}: ${m}`).join(", ")}`);
    }
  });

  /**
   * ⚠ ALLE FIRE KILDER SKAL VÆRE DER. Indbakken GRUPPERER på kilden, og en
   * tom gruppe tegner ingen overskrift — så kan man ikke se at grupperingen
   * virker, og en manglende gruppe ligner en kilde der ikke findes.
   */
  test("⚠ HVER KILDE HAR MINDST ÉT BEHOV", () => {
    const brugte = new Set(DEMO_INDKOEBSBEHOV.map((b) => b.kilde));
    for (const k of ALLE_BEHOVKILDER) {
      assert.ok(brugte.has(k), `ingen behov fra "${k}" — den gruppe kan ikke ses virke`);
    }
  });

  /**
   * ⚠ OG MINDST ÉT UDEN ANTAL. Feltet er valgfrit med vilje: den der melder
   * ind, ved hvad han mangler, ikke hvor meget der er i en pakke. Er alle
   * udfyldt, ser skærmen ud som om det altid er det.
   */
  test("⚠ MINDST ÉT BEHOV UDEN ANTAL", () => {
    assert.ok(DEMO_INDKOEBSBEHOV.some((b) => b.antal === undefined),
      "hvert behov har et antal — så kan skærmen ikke vise et ubesvaret felt");
  });

  /* ⚠ ET AFVIST BEHOV BLIVER STÅENDE MED SIN GRUND. Uden den er afvisningen
     en tavshed, og den samme mangel bliver meldt ind igen i næste uge. */
  test("⚠ ET AFVIST BEHOV HAR EN BEGRUNDELSE", () => {
    for (const b of DEMO_INDKOEBSBEHOV.filter((x) => x.status === "afvist")) {
      assert.ok(b.begrundelse, `${b.id} er afvist uden en grund`);
    }
    assert.ok(DEMO_INDKOEBSBEHOV.some((b) => b.status === "afvist"),
      "intet afvist behov — så kan skærmen ikke vise hvordan et ser ud");
  });

  test("hver status står i kataloget", () => {
    for (const b of DEMO_INDKOEBSBEHOV) {
      assert.ok(BEHOVSTATUS[b.status], `${b.id} har ukendt status "${b.status}"`);
    }
  });
});

describe("Skærmen og serveren er enige", () => {
  /**
   * ⚠ SAMME FUNKTION, IKKE SAMME REGEL SKREVET TO GANGE. Serveren importerer
   * `valideBehov` fra den delte fil; en kopi ville drive, og så ville
   * formularen sige ja til noget serveren siger nej til.
   */
  test("⚠ SERVEREN BRUGER valideBehov FRA DEN DELTE FIL", () => {
    assert.match(SERVER, /import \{ valideBehov \} from "\.\/delt\/procure\.js";/,
      "behovskriv har sin egen kopi af formen");
    assert.match(SERVER, /const svar = valideBehov\(post\);/,
      "behovskriv kalder ikke valideBehov");
  });

  test("klienten prøver formen før den sender", () => {
    assert.match(KLIENT, /valideBehov\(udkast\)/,
      "klienten sender uden at have prøvet formen — så svarer serveren først");
  });

  /**
   * ⚠ INTET id OG INGEN status UDEFRA. Et id udefra kunne overskrive en andens
   * post, og en status udefra ville lade en klient springe `nyt` over. Samme
   * grund som `opretBooking()`.
   */
  test("⚠ SERVEREN SÆTTER id, status OG oprettetAf", () => {
    assert.match(SERVER, /status: "nyt",/, "status kommer ikke fra serveren");
    assert.match(SERVER, /oprettetAf: uid,/, "oprettetAf kommer ikke fra tokenet");
    assert.match(SERVER, /rod\.child\("indkoebsbehov"\)\.push\(\)/,
      "id'et kommer ikke fra push()");
  });

  /* ⚠ PERMISSIONEN, IKKE ROLLEN — og den samme reglen kræver. */
  test("⚠ FUNKTIONEN KRÆVER indkoeb.skriv", () => {
    assert.match(SERVER, /perms\.includes\("\|indkoeb\.skriv\|"\)/);
  });

  /* ⚠ ADMIN-SDK'ET GÅR UDEN OM REGLERNE, så modul- og abonnementsspærringen
     skal stå i funktionen. Uden dem var den en åben dør rundt om begge. */
  test("⚠ MODUL OG ABONNEMENT TJEKKES I FUNKTIONEN", () => {
    const blok = SERVER.slice(SERVER.indexOf("export const behovskriv"),
      SERVER.indexOf("export const behovskriv") + 4000);
    assert.match(blok, /moduler\.child\("indkoeb"\)\.val\(\) !== true/);
    assert.match(blok, /abonnement\/status/);
    assert.match(blok, /_findes/);
  });
});

describe("Skærmen viser det den skal", () => {
  /* ⚠ ET MANGLENDE ANTAL SKRIVER —, IKKE 0. Et nul ville være en påstand om
     at der ikke skal bestilles noget. */
  test("⚠ ET UBESVARET ANTAL VISES SOM INTET", () => {
    assert.match(SKAERM, /Number\.isFinite\(r\.antal\)/,
      "skærmen skelner ikke et manglende antal fra nul");
  });

  /* ⚠ TOM STRENG ER IKKE ET TAL. `Number("")` er 0, og et behov på "0 stk."
     ville blive taget imod som et svar. */
  test("⚠ EN TOM ANTALSFELT SENDES SOM undefined", () => {
    assert.match(SKAERM, /post\.antal === "" \? undefined : Number\(post\.antal\)/,
      'en tom streng bliver til 0 — "0 stk." er ikke et ubesvaret felt');
  });

  /* ⚠ GRUPPERINGEN FØLGER KATALOGET, ikke en liste i skærmen. */
  test("⚠ KILDERNE KOMMER FRA procure.js", () => {
    assert.match(SKAERM, /ALLE_BEHOVKILDER/,
      "skærmen har sin egen liste over kilder");
    assert.ok(!/"snedkeri".*"lager".*"kontor"/s.test(SKAERM.replace(/IKON_FOR_KILDE[\s\S]*?\};/, "")),
      "kilderne er skrevet af i skærmen");
  });

  /**
   * ⚠ DEN BLOKERER KUN PÅ DET DER BLOKERER. Skærmen har en tabel den læser
   * DIREKTE fra basen, så en manglende node må ikke blanke den — beslutning 73.
   */
  test("⚠ BLOKERER IKKE PÅ EN TOM NODE", () => {
    assert.match(SKAERM, /blokerer\(behovListe\.tilstand\)/);
    assert.ok(!/if \(!\w+\) return <Datatilstand/.test(SKAERM),
      "skærmen blanker på en tom liste, men den har data at tegne");
  });

  /**
   * ⚠ FILUPLOAD ER IKKE BYGGET, OG DET STÅR PÅ SKÆRMEN. Planchen viser
   * billede og taleoptagelse; der er ingen Storage sat op, og en fil ligger
   * uden for databasereglerne og har sine egne. En deaktiveret knap uden en
   * grund er en attrap — samme mønster som Opsætning → Generelt.
   */
  test("⚠ DET DER IKKE ER BYGGET, SIGER DET", () => {
    assert.match(SKAERM, /Billede og taleoptagelse er ikke bygget endnu/,
      "planchens filfelter mangler uden at skærmen siger hvorfor");
  });
});
