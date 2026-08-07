/* test/rules.division.test.mjs
 * Punkt 0 i den låste rækkefølge: .validate for beslutning 15.
 *
 * Kravet er at reglerne er AFPRØVET, ikke læst igennem. Derfor kører de her
 * mod databaseemulatoren med rigtige custom claims (tenant + rolle), præcis
 * som reglerne læser dem.
 *
 * Kør:  npm run test:rules
 *       (firebase emulators:exec starter og stopper emulatoren selv)
 *
 * Testene er skrevet så de også fanger det de IKKE må tillade. En regel der
 * kun bliver bekræftet i sit lykkelige tilfælde, er ikke afprøvet.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, update, get } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";

/* Egne tenant-id'er: node --test kører testfiler parallelt, og
   rules.tenant.test.mjs bruger sine egne. */
const TENANT = "vognmandA";

let miljoe;

/** Bruger i TENANT med en given rolle. Claims matcher dem firebase.js sætter.
 *  perms udledes af rollens preset — reglerne spørger efter permissions, ikke
 *  efter rollen. Se permissions.js. */
const som = (uid, rolle, tenant = TENANT) =>
  miljoe
    .authenticatedContext(uid, { tenant, rolle, perms: permStrengFraRolle(rolle) })
    .database();

const sti = (node, id, tenant = TENANT) => `tenants/${tenant}/${node}/${id}`;

/** En gyldig kunde uden division — divisionen lægges på pr. test. */
const kunde = (ekstra = {}) => ({
  navn: "Kolding Kommune",
  aktiv: true,
  aftaleUdloeberMs: 1786000000000,
  ...ekstra,
});

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-division",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });

  /* Reglerne kræver at tenanten er provisioneret — se _findes i
     firebase.rules.json. Uden markøren ville hver eneste skrivning herunder
     blive afvist, og divisionstestene ville fejle af den forkerte grund. */
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), `tenants/${TENANT}/_findes`), true);
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("beslutning 15 — division som felt", () => {
  it("accepterer gods, bus og faelles på en kunde", async () => {
    const db = som("admin1", "admin");
    for (const division of ["gods", "bus", "faelles"]) {
      await assertSucceeds(
        set(ref(db, sti("kunder", `k-${division}`)), kunde({ division }))
      );
    }
  });

  it("afviser en kunde HELT uden division", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, sti("kunder", "k-mangler")), kunde()));
  });

  it("afviser en ukendt divisionsværdi", async () => {
    const db = som("admin1", "admin");
    for (const vaerdi of ["Gods", "GODS", "taxa", "", "faelles ", "gods,bus"]) {
      await assertFails(
        set(ref(db, sti("kunder", "k-ugyldig")), kunde({ division: vaerdi }))
      );
    }
  });

  it("afviser division som noget andet end en streng", async () => {
    const db = som("admin1", "admin");
    for (const vaerdi of [true, 1, null]) {
      await assertFails(
        set(ref(db, sti("kunder", "k-type")), kunde({ division: vaerdi }))
      );
    }
  });

  it("kræver division på opgaver, køretøjer, indberetninger og indkøb", async () => {
    const db = som("admin1", "admin");
    const noder = [
      ["opgaver", { art: "vaerksted", dato: 1786000000000 }],
      ["koeretoejer", { navn: "Volvo FH 500", status: "aktiv" }],
      ["indberetninger", { type: "braendstof", km: 184320, oprettetAf: "admin1" }],
      ["indkoeb", { beloebOere: 450000, momsOere: 112500, dato: 1786000000000 }],
    ];
    for (const [node, post] of noder) {
      await assertFails(set(ref(db, sti(node, "uden")), post));
      await assertSucceeds(set(ref(db, sti(node, "med")), { ...post, division: "gods" }));
    }
  });

  it("afviser division på fravær — det arver fra chaufføren", async () => {
    const db = som("admin1", "admin");
    const fravaer = { chauffoerId: "lars", fra: 1786000000000, til: 1786600000000, art: "sygdom" };
    await assertSucceeds(set(ref(db, sti("fravaer", "f1")), fravaer));
    await assertFails(set(ref(db, sti("fravaer", "f2")), { ...fravaer, division: "gods" }));
  });
});

describe("smuthuller", () => {
  /* Det klassiske hul i RTDB: .validate på $id evalueres ikke nødvendigvis
     når man skriver til et BARN af $id. Kan man skrive kunden i to trin og
     ende med en post uden division, er reglen kun pynt. */
  it("kan man snige sig uden om ved at skrive felt for felt?", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, `${sti("kunder", "k-smutvej")}/navn`), "Snydekunde"));
  });

  it("kan man fjerne division fra en eksisterende post?", async () => {
    const db = som("admin1", "admin");
    const p = sti("kunder", "k-fjern");
    await assertSucceeds(set(ref(db, p), kunde({ division: "gods" })));
    await assertFails(update(ref(db, p), { division: null }));
  });

  /* Modprøven til smutvejen ovenfor. Hvis forældrereglen
     hasChildren(['division']) kigger på det SKREVNE undertræ frem for det
     flettede resultat, ville en helt almindelig navneretning på en gyldig
     kunde også blive afvist — og så var reglen ubrugelig i praksis. */
  it("men en almindelig feltopdatering på en gyldig post går stadig igennem", async () => {
    const db = som("admin1", "admin");
    const p = sti("kunder", "k-redigér");
    await assertSucceeds(set(ref(db, p), kunde({ division: "gods" })));
    await assertSucceeds(set(ref(db, `${p}/navn`), "Kolding Kommune, Teknik & Miljø"));
    await assertSucceeds(update(ref(db, p), { navn: "Kolding Kommune", aktiv: false }));
  });

  it("kan man ændre division til noget ugyldigt bagefter?", async () => {
    const db = som("admin1", "admin");
    const p = sti("kunder", "k-aendre");
    await assertSucceeds(set(ref(db, p), kunde({ division: "gods" })));
    await assertFails(set(ref(db, `${p}/division`), "taxa"));
    await assertSucceeds(set(ref(db, `${p}/division`), "faelles"));
  });
});

/* Tenant-isolation ligger i rules.tenant.test.mjs — punkt 1. Her holder vi os
   til rolle og division, så de to suiter ikke overlapper. */
describe("rolle og division i samme skrivning", () => {
  it("en chauffør må ikke skrive kunder, uanset gyldig division", async () => {
    const db = som("chauffoer1", "chauffoer");
    await assertFails(set(ref(db, sti("kunder", "k-chauffoer")), kunde({ division: "gods" })));
  });

  it("kpi-noden er skrivebeskyttet for alle — kun Cloud Functions", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, `tenants/${TENANT}/kpi/gods/current`), { kunder: { aktive: 51 } }));
  });
});
