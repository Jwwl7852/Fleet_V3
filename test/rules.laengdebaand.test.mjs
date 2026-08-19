/* test/rules.laengdebaand.test.mjs
 * Længdebåndet mod SERVEREN — trin 3 af beslutning 18.
 *
 * ⚠ HVORFOR EN EGEN REGELPRØVE. `satser` og `omkostninger` har begge
 * `$andet: { ".validate": false }`. Et nyt felt er derfor ikke bare "ikke
 * valideret" — det er AFVIST, og afvisningen kommer fra serveren efter at
 * formularen har sagt ja. Uden de her prøver ville båndet virke i alle
 * enhedsprøverne og fejle første gang nogen trykkede Gem.
 *
 * Og det er præcis punkt 0 i den låste rækkefølge: *reglerne afprøvet i
 * emulatoren — accept og afvisning demonstreret, ikke kun læst igennem.*
 *
 * ⚠ REGLEN HÅNDHÆVER FORMEN, IKKE LÆSNINGEN. At intervallet er (fra, til]
 * kan en `.validate` ikke sige noget om — den ser én sats ad gangen og kan
 * ikke sammenligne to. Læsningen står i `satsOpslag()`, og
 * `test/laengdebaand.test.mjs` holder den. Det her er millimeter-integeren:
 * en float ved en grænse er en fejl der venter.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";

import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";

const T = "tenantLaengdebaand";
const NU = Date.UTC(2026, 0, 1);

let miljoe;

const somAdmin = () =>
  miljoe.authenticatedContext("uid-admin", {
    tenant: T, rolle: "admin", perms: permStrengFraRolle("admin"),
  }).database();

const sti = (rest) => `tenants/${T}/${rest}`;

/* De to steder båndet skal kunne stå. Formen er ÉN — videresælger vognmanden
   færgen til kunden, er det samme spørgsmål om kajmeter. */
const omkostningsSats = (id) => sti(`omkostninger/faerge:femern/satser/${id}`);
const kundeSats = (id) => sti(`satser/standard/passage-faerge/satser/${id}`);

const BASIS = { gyldigFra: NU, beloebOere: 133800, metode: "prPassage", valuta: "DKK" };

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-laengdebaand",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${T}/_findes`), true);
    /* Modulet skal være til: omkostninger er booking-gated (beslutning 33). */
    await set(ref(db, sti("moduler")), { booking: true });
    await set(ref(db, sti("omkostninger/faerge:femern/art")), "passage");
    await set(ref(db, sti("omkostninger/faerge:femern/navn")), "Færge: Femern");
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("omkostninger — færgens egen takst", () => {
  it("accepterer et bånd med begge grænser", async () => {
    const db = somAdmin();
    await assertSucceeds(set(ref(db, omkostningsSats("s-baand")),
      { ...BASIS, laengdeFraMm: 10000, laengdeTilMm: 18000 }));
  });

  it("accepterer et bånd med kun én grænse", async () => {
    /* Udeladt fra = 0, udeladt til = ingen øvre grænse. Begge er lovlige
       former — det er sådan "indtil 10 m" og "over 18 m" skrives. */
    const db = somAdmin();
    await assertSucceeds(set(ref(db, omkostningsSats("s-kun-til")),
      { ...BASIS, laengdeTilMm: 10000 }));
    await assertSucceeds(set(ref(db, omkostningsSats("s-kun-fra")),
      { ...BASIS, laengdeFraMm: 18000 }));
  });

  it("accepterer stadig en sats HELT uden bånd", async () => {
    /* Storebælt har ingen bånd endnu — vi kender kun ét af dens trin. En
       regel der krævede båndet, ville tvinge et gæt frem. */
    const db = somAdmin();
    await assertSucceeds(set(ref(db, omkostningsSats("s-uden")), BASIS));
  });

  it("⚠ AFVISER METER SOM FLOAT — det er millimeter som helt tal", async () => {
    /* Færgetaksten har sin grænse ved 10 og 18 m, og 9,998 mod 10,002 afgør
       prisen. Beslutning 2's disciplin på en måling: en float ved en grænse
       er en fejl der venter. */
    const db = somAdmin();
    await assertFails(set(ref(db, omkostningsSats("s-float")),
      { ...BASIS, laengdeTilMm: 10.5 }));
    await assertFails(set(ref(db, omkostningsSats("s-meter")),
      { ...BASIS, laengdeTilMm: "10 m" }));
  });

  it("afviser en negativ nedre grænse og en øvre grænse på nul", async () => {
    const db = somAdmin();
    await assertFails(set(ref(db, omkostningsSats("s-negativ")),
      { ...BASIS, laengdeFraMm: -1 }));
    /* Et bånd der ender ved nul, kan aldrig rammes — men gør posten
       båndopdelt, så HVER tur får "ingen takst for den længde". */
    await assertFails(set(ref(db, omkostningsSats("s-nul")),
      { ...BASIS, laengdeTilMm: 0 }));
  });

  it("⚠ ET FELT DER LIGNER, ER STADIG AFVIST", async () => {
    /* `$andet: false`. Prøven står her fordi den er grunden til at hele
       filen findes: et stavefejlet feltnavn ville ellers blive gemt og
       aldrig læst — og satsen ville se båndopdelt ud uden at være det. */
    const db = somAdmin();
    await assertFails(set(ref(db, omkostningsSats("s-stavefejl")),
      { ...BASIS, laengdeTilmm: 10000 }));
  });
});

describe("satser — den pris kunden betaler", () => {
  it("accepterer det samme bånd", async () => {
    /* ⚠ SAMME FORM BEGGE STEDER. Stod feltet kun på omkostningssiden, skulle
       kundeprisen enten gætte eller finde på sin egen model — og så ville to
       steder afgøre hvad en kajmeter er. */
    const db = somAdmin();
    await assertSucceeds(set(ref(db, kundeSats("s-baand")),
      { gyldigFra: NU, beloebOere: 275000, laengdeFraMm: 10000, laengdeTilMm: 18000 }));
  });

  it("afviser en float her ogsaa", async () => {
    const db = somAdmin();
    await assertFails(set(ref(db, kundeSats("s-float")),
      { gyldigFra: NU, beloebOere: 275000, laengdeTilMm: 9999.5 }));
  });
});
