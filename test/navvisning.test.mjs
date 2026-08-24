/* test/navvisning.test.mjs
 * navvisning.js — den rene logik. Skive 2B.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * navvisning.js's egen OMRAADER-liste er MED VILJE ikke afledt af nav.js
 * (se filens hoved: den deles til functions/delt/, og skal derfor være
 * lukket under import). Det er den samme afvejning som DASHBOARDS i
 * dashboards.js — en lille, håndholdt liste — og den slags lister DRIVER:
 * `02_TARGET_NAVIGATION.md`s Korrektion 6 fandt netop at DASHBOARDS manglede
 * et modul, fordi ingen prøve holdt de to op mod hinanden.
 *
 * Denne fil er den prøve for navvisning.js. Den sammenligner OMRAADER mod de
 * FAKTISKE konfigurerbare topniveaupunkter i nav.js (alt undtagen Dashboard
 * og gruppen "hjaelp") — ikke fordi den ene skal afledes af den anden i
 * produktionskoden, men fordi et menneske skal fange en glemt tilføjelse med
 * det samme, ikke først når en kunde spørger hvorfor et nyt punkt ikke kan
 * skjules.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  OMRAADER, erSkjultVedNavvisning, synligeOmraader, valideNavvisning,
} from "../src/fleet/navvisning.js";
import { NAV } from "../src/fleet/nav.js";
import { DELTE_FILER } from "../scripts/kopier-delt.mjs";

describe("OMRAADER holder trit med nav.js's topniveau", () => {
  /* De topniveaupunkter der ER konfigurerbare, per Skive 2B's egen
     opgavebeskrivelse: alt undtagen Dashboard og Hjælp. */
  const konfigurerbareINav = NAV
    .filter((m) => m.key !== "dashboard" && m.gruppe !== "hjaelp")
    .map((m) => m.key)
    .sort();

  it("⚠ OMRAADER ER PRÆCIS de konfigurerbare topniveaupunkter i nav.js — hverken mere eller mindre", () => {
    assert.deepEqual([...OMRAADER].sort(), konfigurerbareINav,
      "navvisning.js's OMRAADER er kommet ud af sync med nav.js's topniveau. "
      + "Tilføjet/fjernet/omdøbt et punkt i nav.js? Ret OMRAADER i navvisning.js "
      + "til at matche — se filens egen note om hvorfor listen ikke er afledt.");
  });

  it("⚠ DASHBOARD OG HJÆLP STÅR IKKE I OMRAADER", () => {
    assert.ok(!OMRAADER.includes("dashboard"), "Dashboard kan ikke skjules");
    assert.ok(!OMRAADER.includes("support"), "Hjælp (key: support) kan ikke skjules");
  });
});

describe("erSkjultVedNavvisning — kun et kendt område kan skjules", () => {
  it("et eksplicit false skjuler", () => {
    assert.equal(erSkjultVedNavvisning("warehouse", { warehouse: false }), true);
  });

  it("et eksplicit true, eller fravær af feltet, skjuler ikke", () => {
    assert.equal(erSkjultVedNavvisning("warehouse", { warehouse: true }), false);
    assert.equal(erSkjultVedNavvisning("warehouse", {}), false);
  });

  it("⚠ MANGLENDE INDSTILLING (null/undefined) SKJULER INTET", () => {
    assert.equal(erSkjultVedNavvisning("warehouse", null), false);
    assert.equal(erSkjultVedNavvisning("warehouse", undefined), false);
  });

  it("⚠ ET UKENDT NAVN KAN ALDRIG SKJULES — heller ikke dashboard/support", () => {
    assert.equal(erSkjultVedNavvisning("dashboard", { dashboard: false }), false,
      "Dashboard blev skjult — mekanismen kender det ikke, og skal ikke kunne");
    assert.equal(erSkjultVedNavvisning("support", { support: false }), false,
      "Hjælp blev skjult — mekanismen kender det ikke, og skal ikke kunne");
    assert.equal(erSkjultVedNavvisning("rumfart", { rumfart: false }), false,
      "et helt ukendt navn blev alligevel behandlet som et skjult område");
  });
});

describe("synligeOmraader — kan kun REDUCERE den liste den får ind", () => {
  it("uden indstilling: identisk med det der blev givet ind", () => {
    const tilladte = ["warehouse", "unitbooking", "opsaetning"];
    assert.deepEqual(synligeOmraader(tilladte, null), tilladte);
  });

  it("fjerner kun det eksplicit skjulte, af det der allerede var tilladt", () => {
    const tilladte = ["warehouse", "unitbooking", "opsaetning"];
    const resultat = synligeOmraader(tilladte, { unitbooking: false });
    assert.deepEqual(resultat, ["warehouse", "opsaetning"]);
  });

  it("⚠ KAN ALDRIG TILFØJE ET NAVN DER IKKE VAR I DEN INDKOMNE LISTE", () => {
    /* Selv et eksplicit `true` for noget der IKKE var i `tilladte` (fx fordi
       kunden ikke har modulet) ændrer ikke resultatet — funktionen filtrerer
       kun `tilladte`, den slår aldrig noget nyt op eller tilføjer. */
    const tilladte = ["warehouse"];
    const resultat = synligeOmraader(tilladte, { booking: true, warehouse: true });
    assert.deepEqual(resultat, ["warehouse"]);
    assert.ok(!resultat.includes("booking"),
      "et område der ikke var i den tilladte liste, dukkede op alligevel");
  });
});

describe("valideNavvisning — samme funktion i skærmen og på serveren", () => {
  it("godtager et tomt opslag og et med kendte nøgler", () => {
    assert.equal(valideNavvisning({}).ok, true);
    assert.equal(valideNavvisning({ warehouse: false, unitbooking: true }).ok, true);
  });

  it("afviser en ukendt nøgle", () => {
    const r = valideNavvisning({ warehouse: false, rumfart: true });
    assert.equal(r.ok, false);
    assert.match(r.fejl, /rumfart/);
  });

  it("⚠ AFVISER 'dashboard' OG 'support' SOM NØGLER", () => {
    assert.equal(valideNavvisning({ dashboard: false }).ok, false);
    assert.equal(valideNavvisning({ support: false }).ok, false);
  });

  it("afviser en ikke-boolsk værdi", () => {
    const r = valideNavvisning({ warehouse: "false" });
    assert.equal(r.ok, false);
  });

  it("afviser noget der ikke er et opslag", () => {
    assert.equal(valideNavvisning(null).ok, false);
    assert.equal(valideNavvisning([]).ok, false);
    assert.equal(valideNavvisning("warehouse").ok, false);
  });
});

describe("⚠ DET ER EN VISNING, IKKE EN ADGANG — samme prøve som dashboardvisning.test.mjs", () => {
  it("⚠ INGEN REGEL LÆSER navvisning — så ville skjul være blevet spær", () => {
    const raa = readFileSync("firebase.rules.json", "utf8")
      .split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith("//"))
      .join(String.fromCharCode(10));
    const regler = JSON.parse(raa);

    /* Noden har sine egne regler — dem skal der ses bort fra. Det er OPSLAG
       i indstillingen fra ANDRE noders regler der ville gøre den til en
       adgang. */
    const udenEgenNode = JSON.stringify({
      ...regler.rules.tenants.$tenantId, navvisning: undefined,
    });
    assert.ok(!udenEgenNode.includes("child('navvisning')"),
      "en regel slår op i navvisning. Så SPÆRRER indstillingen, den skjuler " +
      "ikke — og navnet, teksten på skærmen og AppShell's filterrækkefølge " +
      "skal alle rettes.");
  });

  it("skærmen kalder det ikke en adgang", () => {
    const skaerm = readFileSync("src/moduler/opsaetning/Brugere.jsx", "utf8");
    assert.match(skaerm, /Synlige arbejdsområder/,
      "skærmen har ikke navvisning-sektionen \"Synlige arbejdsområder\"");
    assert.match(skaerm, /styrer kun hvad brugeren ser/i,
      "skærmen mangler den påkrævede forklaring: \"styrer kun hvad brugeren " +
      "ser i navigationen\"");
  });
});

describe("håndhævelsen", () => {
  const kilde = readFileSync("functions/index.js", "utf8");
  const krop = (() => {
    const i = kilde.indexOf("export const navvisningskriv = onCall");
    assert.ok(i > 0, "navvisningskriv findes ikke");
    const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", i + 1);
    return naeste < 0 ? kilde.slice(i) : kilde.slice(i, naeste);
  })();

  it("⚠ SAMME FUNKTION SOM SKÆRMEN", () => {
    /* En klientvalidering der ikke også står på serveren, er en pæn knap. */
    assert.match(krop, /valideNavvisning\(/);
    assert.ok(DELTE_FILER.includes("navvisning.js"));
  });

  it("⚠ BRUGEREN SKAL VÆRE I TENANTEN", () => {
    /* Uid'et kommer fra nyttelasten, og en admin hos kunde A må ikke kunne
       skrive en indstilling på en bruger hos kunde B. */
    assert.match(krop, /hentIEgenTenant\(/);
    assert.doesNotMatch(krop, /auth\.getUser\(/,
      "kontoen hentes direkte — så er tenant-tjekket ikke garanteret");
  });

  it("⚠ INGEN CLAIMS MINTES", () => {
    /* Til forskel fra rolleskriv/skiftrolle ændrer det her ingenting om hvad
       brugeren MÅ. Mintede vi claims om, ville brugeren blive logget ud
       fordi nogen skjulte et arbejdsområde for ham. */
    assert.doesNotMatch(krop, /setCustomUserClaims/);
    assert.doesNotMatch(krop, /revokeRefreshTokens/);
  });

  it("noden er .write: false", () => {
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10))
        .filter((l) => !l.trim().startsWith("//"))
        .join(String.fromCharCode(10))
    );
    const node = regler.rules.tenants.$tenantId.navvisning;
    assert.ok(node, "navvisning/ mangler i reglerne");
    assert.equal(node[".write"], false,
      "en bruger kan skrive sin egen visning — så betyder den ikke længere " +
      "det administratoren satte");
  });

  it("⚠ REGLEN KENDER DE SAMME OMRÅDER SOM KATALOGET", () => {
    /* Mønstret i regelfilen er en afskrift. Kommer der et område mere uden
       at reglen får det, afviser serveren noget skærmen viser som gyldigt. */
    const raa = readFileSync("firebase.rules.json", "utf8");
    const i = raa.indexOf('"navvisning"');
    const blok = raa.slice(i, i + 1600);
    const AABN = "matches(" + String.fromCharCode(47) + String.fromCharCode(94) + "(";
    const a = blok.indexOf(AABN);
    assert.ok(a >= 0, "reglen validerer ikke områdenavnet mod en ordliste");
    const trin = blok.slice(a + AABN.length, blok.indexOf(")" + String.fromCharCode(36), a));
    assert.deepEqual(trin.split("|").sort(), [...OMRAADER].sort(),
      `regelfilen kender ${trin} — navvisning.js kender ${OMRAADER}`);
  });
});
