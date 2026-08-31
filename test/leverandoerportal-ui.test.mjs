/* test/leverandoerportal-ui.test.mjs
 * Leverandørportalens skærme — samme "skærmen tegner, maskinen afgør"-
 * disciplin som test/opgavestatus.test.mjs's "Statusskifte er ét sted" og
 * test/indberetningsarter.test.mjs's "Chaufførappen skriver dem".
 *
 * Selve DEV-adfærden (rigtig login, rigtigt prisoverslag, rigtigt
 * statusskift, rigtig Log ud) er verificeret i en rigtig browser mod de
 * udrullede DEV-functions — se commit-teksten. Denne fil beviser kun at
 * kildeteksten følger de mønstre resten af appen holder sig til.
 *
 * Kør: npm test
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PORTAL = readFileSync("src/moduler/leverandoerportal/LeverandoerPortal.jsx", "utf8");
const LOGIN = readFileSync("src/moduler/leverandoerportal/LeverandoerLogin.jsx", "utf8");
const KLIENT = readFileSync("src/fleet/leverandoerportal.js", "utf8");
const APP = readFileSync("src/App.jsx", "utf8");

describe("LeverandoerPortal.jsx", () => {
  test("⚠ KNAPPERNE FØLGER kanLeverandoerSkifte(), IKKE EN LOKAL if-KÆDE", () => {
    assert.match(PORTAL, /import \{ kanLeverandoerSkifte \} from "\.\.\/\.\.\/fleet\/leverandoerportal-regler\.js"/);
    assert.match(PORTAL, /kanLeverandoerSkifte\(o\.status, "igang"\)/);
    assert.match(PORTAL, /kanLeverandoerSkifte\(o\.status, "klar_til_afhentning"\)/);
  });

  test("⚠ INGEN RÅ status === \"udfoert\" / \"annulleret\"-SAMMENLIGNING", () => {
    /* En hardkodet undtagelse for de to endestationer ville drive fra
       kanLeverandoerSkifte() den dag maskinen ændrer sig — se samme
       begrundelse i opgavestatus.test.mjs' "MASKINEN LIGGER IKKE I
       FUNKTIONEN". erAfsluttet-tjekket er en VISNINGS-beslutning (skjul
       handlingsknapperne), ikke en gentagelse af hvilke skift der er
       lovlige — det er stadig kanLeverandoerSkifte()'s alene. */
    assert.match(PORTAL, /erAfsluttet = o\.status === "udfoert" \|\| o\.status === "annulleret"/);
  });

  test("⚠ BEKRÆFTELSEN FØR \"klar til afhentning\" HAR PRÆCIS DEN KRÆVEDE ORDLYD", () => {
    assert.match(PORTAL, /Er arbejdet udført, og er enheden klar til afhentning\?/);
  });

  test("kalder den delte klient (leverandoerportal.js), ikke kaldFunktion direkte", () => {
    assert.match(PORTAL, /from "\.\.\/\.\.\/fleet\/leverandoerportal\.js"/);
    assert.doesNotMatch(PORTAL, /kaldFunktion\(/,
      "skærmen kalder Cloud Functions direkte i stedet for gennem leverandoerportal.js");
  });

  test("⚠ tenantId KOMMER FRA hentPortalTenanter()'s SVAR, IKKE ET GÆT/KONSTANT", () => {
    assert.doesNotMatch(PORTAL, /tenantId:\s*["'`]/,
      "et hardkodet tenantId ville sende brugeren til en tilfældig virksomhed");
  });
});

describe("LeverandoerLogin.jsx", () => {
  test("⚠ SAMME Firebase Auth-KALD SOM DEN INTERNE Login.jsx", () => {
    assert.match(LOGIN, /auth\.signInWithEmailAndPassword\(email\.trim\(\), kode\)/);
  });

  test("ingen navigation efter login — App.jsx's onAuthStateChanged gør det", () => {
    assert.doesNotMatch(LOGIN, /navigate\(|useNavigate/i);
  });
});

describe("src/fleet/leverandoerportal.js", () => {
  test("hver funktion går gennem kaldFunktion() fra firebase.js — samme mønster som resten af appen", () => {
    assert.match(KLIENT, /import \{ kaldFunktion \} from "\.\.\/firebase\.js"/);
    for (const fn of [
      "leverandoerPortalTenanter", "leverandoerPortalOpgaver",
      "leverandoerTilbudIndsend", "leverandoerStatusOpdater",
    ]) {
      assert.match(KLIENT, new RegExp(`kaldFunktion\\("${fn}"`), `${fn} kaldes ikke via kaldFunktion()`);
    }
  });
});

describe("App.jsx — leverandørportalen er sideordnet, ikke en udvidelse af harAdgang", () => {
  test("⚠ GRENEN AFGØRES FØR harAdgang BEREGNES", () => {
    const iPortal = APP.indexOf("/leverandoerportal");
    const iHarAdgang = APP.indexOf("const harAdgang = Boolean(bruger?.tenant)");
    assert.ok(iPortal >= 0 && iHarAdgang >= 0, "en af de to markører findes ikke længere i App.jsx");
    assert.ok(iPortal < iHarAdgang,
      "leverandørportal-grenen er flyttet til efter harAdgang — den skal afgøres uafhængigt af tenant-claimet");
  });

  test("Leverandoerramme er IKKE AppShell og IKKE Chauffoerramme", () => {
    assert.match(APP, /function Leverandoerramme\(/);
    const start = APP.indexOf("function Leverandoerramme(");
    const slut = APP.indexOf("\nexport default function App", start);
    const krop = APP.slice(start, slut);
    assert.doesNotMatch(krop, /<AppShell/);
    assert.doesNotMatch(krop, /tenant-vælger|periodevælger/i);
  });
});
