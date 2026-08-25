/* test/rules.brugerlayout.test.mjs
 * brugerlayout/$uid/$dashboard mod den UDRULLEDE regelfil — Skive 2C.2.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * test/widgets.test.mjs holder regelfilens `.validate`-mønster op mod
 * dashboards.js SOM TEKST — den ser at strengen "booking" står i mønstret.
 * Den her fil prøver noget andet: at EMULATOREN faktisk håndhæver det, mod
 * ægte skrivninger og læsninger. Det er samme skel som beslutning 29 gør op
 * med — "prøverne siger noget om FILEN; databasen håndhæver det UDRULLEDE."
 *
 * Skive 2C tilføjede "booking" som dashboardnøgle i dashboards.js, men
 * firebase.rules.json måtte ikke røres i den skive — reglens
 * `$dashboard`-regex kendte derfor ikke nøglen, og en bruger kunne se
 * "Tilpas forside" på Planning-dashboardet uden at kunne GEMME det. Skive
 * 2C.2 er den isolerede rettelse: ét ord tilføjet til ÉT eksisterende
 * mønster, ingen ny node, ingen ændret skrivevej, ingen ændret permission.
 *
 * Koer: npm run test:rules (eller npm test, som kører den samme suite)
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, get } from "firebase/database";
import { permStreng, permStrengFraRolle } from "../src/fleet/permissions.js";
import { ALLE_DASHBOARDS } from "../src/fleet/dashboards.js";

const T = "tenantBrugerlayout";
let miljoe;

const somBruger = (uid, rolle, perms = permStreng([])) =>
  miljoe.authenticatedContext(uid, { tenant: T, rolle, perms }).database();

const sti = (rest) => `tenants/${T}/${rest}`;

const GYLDIGT_LAYOUT = ["udeAfDrift", "nedetid"];

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-brugerlayout",
    database: {
      host: "127.0.0.1", port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), `tenants/${T}/_findes`), true);
  });
});

after(async () => { await miljoe?.cleanup(); });

describe("⚠ SKIVE 2C.2 — Planning ('booking') på niveau med de øvrige dashboards", () => {
  /* ⚠ CHAUFFØREN, MED VILJE. Det er den mindst betroede rolle i huset, og
     ROLLER.md's egen pointe er at "brugerlayout (sin egen)" er den ENESTE
     node hvor han kan skrive noget som helst. Kan han ikke engang redde sit
     eget Planning-layout, er rettelsen ikke fuldført. */
  it("ejeren kan gemme et gyldigt layout på brugerlayout/<egen uid>/booking", async () => {
    const db = somBruger("u-ejer", "chauffoer");
    await assertSucceeds(set(ref(db, sti("brugerlayout/u-ejer/booking")), GYLDIGT_LAYOUT));
  });

  it("layoutet kan læses igen, med de samme værdier", async () => {
    const skriver = somBruger("u-laes-skriv", "lagermedarbejder");
    await assertSucceeds(
      set(ref(skriver, sti("brugerlayout/u-laes-skriv/booking")), GYLDIGT_LAYOUT));

    /* ⚠ .read ER HELE TENANTEN, IKKE KUN EJEREN — med vilje, se
       firebase.rules.json's egen note: en administrator skal kunne se hvad
       en bruger har gjort ved sin forside. En ANDEN bruger i samme tenant
       må derfor gerne læse den her, blot ikke skrive den. */
    const laeser = somBruger("u-anden-laeser", "admin", permStrengFraRolle("admin"));
    const snap = await assertSucceeds(get(ref(laeser, sti("brugerlayout/u-laes-skriv/booking"))));
    assert.deepEqual(Object.values(snap.val()), GYLDIGT_LAYOUT);
  });

  it("en ANDEN bruger kan ikke skrive brugerens layout", async () => {
    const ejer = somBruger("u-offer", "lagermedarbejder");
    await assertSucceeds(set(ref(ejer, sti("brugerlayout/u-offer/booking")), GYLDIGT_LAYOUT));

    const angriber = somBruger("u-angriber", "admin", permStrengFraRolle("admin"));
    /* ⚠ SELV EN ADMINISTRATOR KAN IKKE. auth.uid === $uid kender ingen rolle
       — det er hele pointen ved at binde skrivningen til PERSONEN og ikke
       til en permission. En admin der kunne rette kollegers forside, ville
       være en ændring ingen kunne forklare, se firebase.rules.json's note. */
    await assertFails(
      set(ref(angriber, sti("brugerlayout/u-offer/booking")), ["noget helt andet"]));
  });

  it("et UKENDT dashboard-navn afvises fortsat", async () => {
    const db = somBruger("u-ukendt", "admin", permStrengFraRolle("admin"));
    for (const ukendt of ["oekonomi", "planning", "disponering", "tilpasforside"]) {
      await assertFails(
        set(ref(db, sti(`brugerlayout/u-ukendt/${ukendt}`)), GYLDIGT_LAYOUT),
        `"${ukendt}" burde stadig være afvist`);
    }
  });

  it("EKSISTERENDE dashboardnøgler virker fortsat, mekanisk — hele kataloget", async () => {
    const db = somBruger("u-alle-dashboards", "admin", permStrengFraRolle("admin"));
    for (const d of ALLE_DASHBOARDS) {
      await assertSucceeds(
        set(ref(db, sti(`brugerlayout/u-alle-dashboards/${d}`)), GYLDIGT_LAYOUT),
        `"${d}" burde stadig være accepteret`);
    }
  });

  it("et UGYLDIGT widget-layout afvises fortsat, efter de eksisterende regler", async () => {
    const db = somBruger("u-ugyldigt", "admin", permStrengFraRolle("admin"));
    /* ⚠ SAMME TO REGLER SOM FØR RETTELSEN — de er ikke rørt. En plads er en
       kort, ikke-tom streng, og der er intet loft på ANTALLET (se
       widgets.js's egen note om at loftet var en smagsdom). */
    await assertFails(
      set(ref(db, sti("brugerlayout/u-ugyldigt/booking")), [""]),
      "en tom streng skulle afvises");
    await assertFails(
      set(ref(db, sti("brugerlayout/u-ugyldigt/booking")), ["x".repeat(41)]),
      "en plads over 40 tegn skulle afvises");
    await assertFails(
      set(ref(db, sti("brugerlayout/u-ugyldigt/booking")), { ikkeEtTal: "nedetid" }),
      "en ikke-numerisk plads-nøgle skulle afvises");
  });

  it("⚠ OG DET GJALT KUN booking — de øvrige felter på $uid.$dashboard er urørte", () => {
    /* Selve REGELÆNDRINGEN prøves som tekst ét sted, ikke i emulatoren:
       ét ord tilføjet til ét eksisterende mønster. Se
       test/widgets.test.mjs's "REGLEN KENDER DE SAMME DASHBOARDS SOM
       KATALOGET" og test/skive2c-dashboard.test.mjs's tilsvarende prøve. */
    const raa = readFileSync("firebase.rules.json", "utf8");
    const i = raa.indexOf('"brugerlayout"');
    const j = raa.indexOf("\"dashboardvisning\"");
    const blok = raa.slice(i, j);
    assert.match(blok, /auth\.uid === \$uid/, "skrivevejen er ikke rørt");
    assert.doesNotMatch(blok, /PERM|perms\.split|harPerm/,
      "der er indført en permission på brugerlayout — det må der ikke være");
  });
});
