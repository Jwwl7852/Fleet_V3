/* test/abonnement.test.mjs
 * Abonnementstilstanden — og at klienten er enig med reglerne.
 *
 * ⚠ DEN VIGTIGSTE PRØVE HER ER "FEJLER ÅBENT". Reglerne behandler en
 * manglende abonnement-node som aktiv. Var klienten strengere, ville vi vise
 * en låseskærm oven på en database der svarer fint — og ingen kunne forklare
 * hvorfor. Var den mildere, ville vi vise shellen til en lukket kunde og lade
 * hver eneste læsning fejle. De to SKAL være enige.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ABONNEMENT, ALLE_ABONNEMENTSTATUS, erAktiv, laasetekst,
  OPBEVARING_DAGE, opbevaresTil, AARSAG, ALLE_AARSAGER,
} from "../src/fleet/abonnement.js";

const DAG = 24 * 60 * 60 * 1000;

describe("erAktiv fejler åbent — som reglerne", () => {
  it("kalder en manglende node aktiv", () => {
    /* ⚠ ALTERNATIVET VAR AT LUKKE EN BETALENDE KUNDE UDE. Enhver tenant
       oprettet før feltet fandtes har ingen node. */
    assert.equal(erAktiv(null), true);
    assert.equal(erAktiv(undefined), true);
    assert.equal(erAktiv({}), true);
  });

  it("kalder aktiv aktiv, og alt andet lukket", () => {
    assert.equal(erAktiv({ status: "aktiv" }), true);
    assert.equal(erAktiv({ status: "paused" }), false);
    assert.equal(erAktiv({ status: "opsagt" }), false);
  });

  it("lukker på en ukendt status", () => {
    /* Her fejler den LUKKET, og det er ikke en modsigelse: en status vi ikke
       kender, er ikke det samme som ingen status. Nogen har skrevet noget
       ind som koden ikke forstår, og så skal den ikke gætte på "aktiv". */
    assert.equal(erAktiv({ status: "vedIkke" }), false);
  });

  it("bruger PRÆCIS de tre statusser reglerne validerer", () => {
    /* Står de to lister forskelligt, kan en funktion skrive en status
       reglerne afviser — eller reglerne tillade en klienten ikke kan tegne. */
    const regler = readFileSync(new URL("../firebase.rules.json", import.meta.url), "utf8");
    const m = regler.match(/\^\(aktiv\|paused\|opsagt\)\$/);
    assert.ok(m, "regelfilen validerer ikke status mod de tre.");
    assert.deepEqual(ALLE_ABONNEMENTSTATUS, ["aktiv", "paused", "opsagt"]);
  });
});

describe("Låseskærmens tekst", () => {
  it("siger noget brugbart for hver lukket status", () => {
    for (const status of ["paused", "opsagt"]) {
      const t = laasetekst({ status });
      assert.ok(t.besked.length > 10, `${status} mangler en besked`);
      assert.ok(t.naeste.length > 10, `${status} mangler en vej videre`);
      assert.doesNotMatch(t.besked + t.naeste, /fejl|prøv igen/i,
        `${status} kalder det en fejl — det er det ikke, og "prøv igen" kan ikke virke.`);
    }
  });

  it("har en tekst selv til en status ingen kender", () => {
    /* En tom låseskærm er værre end en upræcis. */
    const t = laasetekst({ status: "vedIkke" });
    assert.ok(t.besked.length > 10);
    assert.ok(t.naeste.length > 10);
  });
});

describe("Opbevaring efter en opsigelse", () => {
  it("er 90 dage regnet fra opsigelsen", () => {
    const nu = 1786452792591;
    assert.equal(OPBEVARING_DAGE, 90);
    assert.equal(opbevaresTil({ status: "opsagt", aendretMs: nu }), nu + 90 * DAG);
  });

  it("er AFLEDT, ikke gemt", () => {
    /* ⚠ Et gemt sletTidligstMs ville drive fra sit grundlag i det sekund
       nogen genåbnede og opsagde igen — fejlen i bemanding.ledig.
       Reglerne må derfor ikke kende feltet. */
    const regler = readFileSync(new URL("../firebase.rules.json", import.meta.url), "utf8");
    assert.doesNotMatch(regler, /sletTidligst|opbevaresTil/,
      "opbevaringsdatoen er blevet et gemt felt — den skal regnes af aendretMs.");
  });

  it("giver null når der ikke er noget at regne på", () => {
    assert.equal(opbevaresTil(null), null);
    assert.equal(opbevaresTil({ status: "paused", aendretMs: 1 }), null,
      "en pause er ikke en opsigelse — der er ingen frist at vise.");
    assert.equal(opbevaresTil({ status: "opsagt" }), null, "uden aendretMs er der intet grundlag.");
  });

  it("lover ikke en sletning der ikke findes", () => {
    /* ⚠ DER SLETTES INTET AUTOMATISK. Skærmen skal skrive "tidligst", ikke
       "den". En lovet sletning der ikke sker, er samme slags løgn som at
       kalde en afvist læsning for en netværksfejl: den ser rigtig ud. */
    const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    assert.match(app, /slettes tidligst/,
      "låseskærmen skriver ikke 'tidligst' — så lover den en automatisk sletning.");
  });
});

describe("Årsagen er en allowliste", () => {
  it("er ikke fritekst", () => {
    /* Årsagen ender i auditloggen, og fritekst dér er præcis det
       audit-regler.js findes for at holde ude. */
    assert.deepEqual(ALLE_AARSAGER,
      ["betaling", "kundeoensket", "proeveperiodeUdloebet", "fejloprettet"]);
    for (const a of ALLE_AARSAGER) assert.ok(AARSAG[a].length > 3);
  });

  it("står med SAMME liste i reglerne", () => {
    const regler = readFileSync(new URL("../firebase.rules.json", import.meta.url), "utf8");
    const linje = regler.split(/\r?\n/).find((l) => l.includes('"aarsag"'));
    assert.ok(linje, "fandt ikke aarsag i regelfilen.");
    const m = linje.match(/\^\(([a-zA-Z|]+)\)\$/);
    assert.ok(m, "aarsag valideres ikke mod en liste — så er den fritekst.");
    assert.deepEqual(m[1].split("|"), ALLE_AARSAGER,
      "klientens årsager og reglernes er ikke de samme.");
  });
});

describe("Abonnementet er ikke en modulliste", () => {
  it("har en label og en pille til hver status", () => {
    /* Konsollen skal kunne vise en kundeliste med tilstanden på. Tonerne er
       STATUSFARVER — ok/warn/bad — ikke kategorifarver (beslutning 30). */
    for (const s of ALLE_ABONNEMENTSTATUS) {
      assert.ok(ABONNEMENT[s].label, `${s} mangler label`);
      assert.ok(["ok", "warn", "bad"].includes(ABONNEMENT[s].pill), `${s} har en kategorifarve`);
    }
  });
});
