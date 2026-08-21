/* test/dashboardvisning.test.mjs
 * Hvilke dashboards en bruger får VIST.
 *
 * ⚠ DEN VIGTIGSTE PRØVE I FILEN HANDLER OM NAVNET.
 *
 * Mockuppen kalder skærmen "Dashboardadgange". Det ville være et løfte
 * platformen ikke kan holde: `kpi/` er læsbar for enhver indlogget bruger i
 * tenanten — ingen permission, ingen modulklausul. En bruger der "nægtes"
 * Warehouse-dashboardet, kan stadig læse kpi/<division>/warehouse direkte.
 *
 * Prøven nedenfor læser regelfilen og fælder, hvis nogen tror det modsatte.
 * Kaldte vi det en adgang, ville nogen slå Økonomi fra for en chauffør og TRO
 * at tallene var utilgængelige — og det er den værste slags kontrol: den ser
 * ud som om den virker.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  synligeDashboards, valideVisning, skjulerAlt, ekstraSamlet,
} from "../src/fleet/dashboardvisning.js";
import { SAMLET, DASHBOARDS, ALLE_DASHBOARDS } from "../src/fleet/dashboards.js";
import { DELTE_FILER } from "../scripts/kopier-delt.mjs";

const alle = () => true;

describe("⚠ DET ER EN VISNING, IKKE EN ADGANG", () => {
  /* ⚠ DEN HER PRØVE HAR FYRET TO GANGE NU, OG BEGGE GANGE VAR DET MENINGEN.

     Første gang kom modulklausulen (beslutning 44). Svaret var NEJ: et modul
     gælder TENANTEN, ikke brugeren.

     Anden gang kom en PERMISSION — `kpi/.../kunder` kræver `kunder.laes`,
     fordi domænet arver sin kildes læse-permission. Prøven sagde dengang
     "så er dashboardvisningen tæt på at være en adgang". Det var forkert
     stillet, og det er værd at skrive hvorfor:

       En permission på nøgletallet siger hvad ROLLEN må. Dashboardvisningen
       siger hvad ÉN BRUGER får VIST. To brugere med samme rolle ser stadig
       nøjagtig det samme uanset afkrydsningen — den skjuler et dashboard,
       den spærrer ingenting.

     Prøven spurgte altså om noget der ikke afgør sagen. Det der VILLE afgøre
     den, er om indstillingen selv bliver læst af en regel. Sker det, er
     "skjul" blevet til "spær", og navnet er en løgn den anden vej.

     ⚠ Den vogter nu netop dét. */
  it("⚠ INGEN REGEL LÆSER dashboardvisning — så ville skjul være blevet spær", () => {
    const raa = readFileSync("firebase.rules.json", "utf8")
      .split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith("//"))
      .join(String.fromCharCode(10));
    const regler = JSON.parse(raa);

    /* Noden har sine egne regler — dem skal der se bort fra. Det er OPSLAG
       i indstillingen fra ANDRE noders regler der ville gøre den til en
       adgang. */
    const udenEgenNode = JSON.stringify({
      ...regler.rules.tenants.$tenantId, dashboardvisning: undefined,
    });
    assert.ok(!udenEgenNode.includes("child('dashboardvisning')"),
      "en regel slår op i dashboardvisning. Så SPÆRRER indstillingen, den " +
      "skjuler ikke — og både navnet og teksten på skærmen skal rettes.");
  });

  it("kpi/ er stadig delt pr. domæne, og domænet bærer klausulerne", () => {
    /* Kaskaden er den anden halvdel: en .read på kpi/ ville ophæve begge
       klausuler på én gang. */
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10))
        .filter((l) => !l.trim().startsWith("//"))
        .join(String.fromCharCode(10))
    );
    const kpi = regler.rules.tenants.$tenantId.kpi;
    assert.equal(kpi[".read"], undefined,
      "kpi/ har en .read igen — den kaskaderer og ophæver klausulen på domænet");
    const laes = kpi.$snapshot.$domaene[".read"];
    assert.ok(laes.includes("child('moduler')"),
      "domænet har ingen modulklausul — beslutning 44 er rullet tilbage");
    assert.ok(laes.includes("perms.contains"),
      "domænet arver ikke længere sin kildes læse-permission");
  });

  it("skærmen kalder det ikke en adgang", () => {
    /* Ordvalget er ikke pynt. En kontrol der hedder \"adgang\" og kun skjuler,
       lærer brugeren at stole på noget der ikke holder. */
    const skaerm = readFileSync("src/moduler/opsaetning/Brugere.jsx", "utf8");
    assert.match(skaerm, /ikke en adgang/i,
      "skærmen skriver ikke at det er en visning og ikke en adgang");
  });
});

describe("standarden er alt det kunden har købt", () => {
  it("⚠ INGEN INDSTILLING → ALT, ikke ingenting", () => {
    /* Det er dét der gør ændringen sikker at udrulle: ingen eksisterende
       bruger mister en visning af at funktionen kommer. Samme fremgangsmåde
       som roller/, hvor en tenant uden noden opfører sig som før. */
    assert.deepEqual(
      synligeDashboards(null, alle).map((d) => d.key), ALLE_DASHBOARDS);
    assert.deepEqual(
      synligeDashboards(undefined, alle).map((d) => d.key), ALLE_DASHBOARDS);
  });

  it("⚠ ET NYT MODUL BLIVER IKKE USYNLIGT FOR EN GAMMEL INDSTILLING", () => {
    /* Kun et eksplicit `false` skjuler. Var reglen "kun det der står som
       true", ville hvert modul vi sælger fremover være usynligt for hver
       bruger der havde en indstilling fra før — og fejlen ville se ud som om
       modulet ikke var købt. */
    const gammel = { samlet: true, flaade: true };
    assert.deepEqual(
      synligeDashboards(gammel, alle).map((d) => d.key), ALLE_DASHBOARDS);
  });

  it("kun false skjuler", () => {
    const ud = synligeDashboards({ warehouse: false }, alle).map((d) => d.key);
    assert.ok(!ud.includes("warehouse"));
    assert.equal(ud.length, ALLE_DASHBOARDS.length - 1);
  });

  it("et fravalgt modul har allerede skjult sit dashboard", () => {
    /* Indstillingen kan ikke give noget tilbage som kunden ikke har købt. */
    const kun = synligeDashboards(null, (m) => m === "flaade").map((d) => d.key);
    assert.deepEqual(kun, [SAMLET, "flaade"]);
  });

  it("⚠ SAMLET FORSVINDER ALDRIG AF SIG SELV", () => {
    /* Den er `altid: true` i katalogret — en kunde uden nogen valgfrie
       moduler skal stadig have en forside. Men den kan slås fra manuelt. */
    assert.ok(synligeDashboards(null, () => false).some((d) => d.key === SAMLET));
  });

  it("ekstraSamlet siger om overblikket er givet på tværs", () => {
    /* En bogholder skal kunne se det samlede overblik uden at have Fleet,
       Warehouse og Facility hver for sig. */
    assert.equal(ekstraSamlet({ [SAMLET]: true }), true);
    assert.equal(ekstraSamlet({ [SAMLET]: false }), false);
    assert.equal(ekstraSamlet(null), false);
  });
});

describe("⚠ MAN KAN IKKE SKJULE ALT", () => {
  it("svarer en grund, ikke et flag", () => {
    /* En bruger uden et eneste dashboard lander på en tom forside, og
       Dashboard er `altid: true` i modulkataloget netop fordi et system uden
       forside ikke er et system. */
    const alt = Object.fromEntries(ALLE_DASHBOARDS.map((k) => [k, false]));
    const grund = skjulerAlt(alt, alle);
    assert.ok(grund, "det lykkedes at skjule hvert eneste dashboard");
    assert.ok(grund.length > 40 && /\.$/.test(grund.trim()), grund);
  });

  it("ét tilbage er nok", () => {
    const alt = Object.fromEntries(ALLE_DASHBOARDS.map((k) => [k, false]));
    assert.equal(skjulerAlt({ ...alt, [SAMLET]: true }, alle), null);
  });

  it("og den regner med modullisten", () => {
    /* Har kunden kun Fleet, er der to dashboards at skjule — ikke syv. */
    const kunFleet = (m) => m === "flaade";
    assert.ok(skjulerAlt({ [SAMLET]: false, flaade: false }, kunFleet));
    assert.equal(skjulerAlt({ [SAMLET]: false, flaade: true }, kunFleet), null);
  });
});

describe("valideVisning", () => {
  it("godtager kendte dashboards med boolske værdier", () => {
    assert.equal(valideVisning({ [SAMLET]: true, flaade: false }).ok, true);
    assert.equal(valideVisning({}).ok, true);
  });

  it("afviser et ukendt dashboard — og navngiver det", () => {
    const r = valideVisning({ findesIkke: true });
    assert.equal(r.ok, false);
    assert.match(r.fejl, /findesIkke/);
  });

  it("afviser en værdi der ikke er sand eller falsk", () => {
    assert.equal(valideVisning({ flaade: "ja" }).ok, false);
    assert.equal(valideVisning({ flaade: 1 }).ok, false);
  });

  it("afviser noget der ikke er et opslag", () => {
    for (const v of [null, undefined, [], "flaade", 7]) {
      assert.equal(valideVisning(v).ok, false, String(v));
    }
  });
});

describe("håndhævelsen", () => {
  const kilde = readFileSync("functions/index.js", "utf8");
  const krop = (() => {
    const i = kilde.indexOf("export const dashboardvisningskriv = onCall");
    assert.ok(i > 0, "dashboardvisningskriv findes ikke");
    const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", i + 1);
    return naeste < 0 ? kilde.slice(i) : kilde.slice(i, naeste);
  })();

  it("⚠ SAMME FUNKTIONER SOM SKÆRMEN", () => {
    /* En klientvalidering der ikke også står på serveren, er en pæn knap. */
    assert.match(krop, /valideVisning\(/);
    assert.match(krop, /skjulerAlt\(/);
    assert.ok(DELTE_FILER.includes("dashboardvisning.js"));
    /* dashboardvisning.js importerer dashboards.js — listen er lukket under
       import. */
    assert.ok(DELTE_FILER.includes("dashboards.js"));
  });

  it("⚠ BRUGEREN SKAL VÆRE I TENANTEN", () => {
    /* Uid'et kommer fra nyttelasten, og en admin hos kunde A må ikke kunne
       skrive en indstilling på en bruger hos kunde B. */
    assert.match(krop, /hentIEgenTenant\(/);
    assert.doesNotMatch(krop, /auth\.getUser\(/,
      "kontoen hentes direkte — så er tenant-tjekket ikke garanteret");
  });

  it("⚠ INGEN CLAIMS MINTES", () => {
    /* Til forskel fra rolleskriv ændrer det her ingenting om hvad brugeren
       MÅ. Mintede vi claims om, ville brugeren blive logget ud fordi nogen
       slog et dashboard fra. */
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
    const node = regler.rules.tenants.$tenantId.dashboardvisning;
    assert.ok(node, "dashboardvisning/ mangler i reglerne");
    assert.equal(node[".write"], false,
      "en bruger kan skrive sin egen visning — så betyder den ikke længere " +
      "det administratoren satte");
  });

  it("⚠ REGLEN KENDER DE SAMME DASHBOARDS SOM KATALOGET", () => {
    /* Mønstret i regelfilen er en afskrift. Kommer der et dashboard mere uden
       at reglen får det, afviser serveren noget skærmen viser som gyldigt. */
    const raa = readFileSync("firebase.rules.json", "utf8");
    const i = raa.indexOf('"dashboardvisning"');
    const blok = raa.slice(i, i + 1400);
    const AABN = "matches(" + String.fromCharCode(47) + String.fromCharCode(94) + "(";
    const a = blok.indexOf(AABN);
    assert.ok(a >= 0, "reglen validerer ikke dashboardnavnet mod en ordliste");
    const trin = blok.slice(a + AABN.length, blok.indexOf(")" + String.fromCharCode(36), a));
    assert.deepEqual(trin.split("|").sort(), [...ALLE_DASHBOARDS].sort(),
      `regelfilen kender ${trin} — dashboards.js kender ${ALLE_DASHBOARDS}`);
  });

  it("hvert dashboard i kataloget har en label og en beskrivelse", () => {
    /* Panelet viser begge. Et dashboard uden beskrivelse ville stå som en
       afkrydsning uden at sige hvad man slår fra. */
    for (const d of DASHBOARDS) {
      assert.ok(d.label && d.under, d.key);
    }
  });
});
