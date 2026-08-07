/* test/rules.tenant.test.mjs
 * Punkt 1 i den låste rækkefølge: tenant-isolation, permanent og obligatorisk.
 *
 * Kør ved HVER ændring i firebase.rules.json:  npm run test:rules
 *
 * Hvorfor den findes: reglerne var ugyldige fra fundamentet — de kunne slet
 * ikke indlæses — og det overlevede gennemlæsning, flere redigeringer og
 * ville have overlevet en deploy. Det blev fundet i det sekund de blev kørt.
 * Se "Låst rækkefølge" i README.
 *
 * Suiten er skrevet så den DÆKKER SIG SELV IND mod nye noder: nodelisten
 * læses ud af firebase.rules.json i stedet for at stå her. Tilføjer nogen en
 * node med en for løs regel, fejler testen uden at nogen har husket at
 * tilføje et testtilfælde.
 *
 * Bemærk: node --test kører testfiler parallelt i hver sin proces. Denne fil
 * bruger derfor sine egne tenant-id'er og kalder ALDRIG clearDatabase() —
 * ellers ville den kunne tørre rules.division.test.mjs' data væk midt i
 * dens kørsel.
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

const MIN = "tenantX";
const FREMMED = "tenantY";

const RAA_REGLER = readFileSync("firebase.rules.json", "utf8");

/* Regelfilen har //-linjekommentarer og er derfor ikke gyldig JSON. Emulatoren
   tager den som den er; til nodeopslaget herunder strippes kommentarlinjerne. */
const REGLER = JSON.parse(
  RAA_REGLER.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
);
const NODER = Object.keys(REGLER.rules.tenants.$tenantId).filter((n) => !n.startsWith("."));

let miljoe;

const som = (uid, claims) => miljoe.authenticatedContext(uid, claims).database();
const udenLogin = () => miljoe.unauthenticatedContext().database();

const POST = { navn: "Prøvepost", division: "gods", aktiv: true };

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fleetcontrol-rules-test",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: RAA_REGLER,
    },
  });

  /* Læg data i BEGGE tenants uden om reglerne, så "adgang nægtet" nedenfor
     skyldes reglerne og ikke bare at der ingenting er at hente. */
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    for (const t of [MIN, FREMMED]) {
      await set(ref(db, `tenants/${t}/kunder/seed`), { ...POST, navn: `Kunde i ${t}` });
      await set(ref(db, `tenants/${t}/opgaver/seed`), { division: "gods", art: "vaerksted" });
      await set(ref(db, `tenants/${t}/kpi/gods/current`), { kunder: { aktive: 3 } });
    }
    await set(ref(db, "brugerTenants/mig"), { tenant: MIN });
    await set(ref(db, "brugerTenants/enAnden"), { tenant: FREMMED });
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("tenant-isolation — suiten skal have noget at teste", () => {
  /* Uden denne ville en tom NODER-liste få alle løkker nedenfor til at passere
     uden at have testet noget som helst. En suite der kan lykkes vakuumt er
     værre end ingen suite. */
  it("nodelisten er læst ud af regelfilen og er ikke tom", () => {
    assert.ok(
      NODER.length >= 10,
      `Forventede mindst 10 noder under tenants/$tenantId, fandt ${NODER.length}: ${NODER.join(", ")}. ` +
      `Kan firebase.rules.json ikke parses, er hele denne suite uden værdi.`
    );
    for (const paakraevet of ["kunder", "opgaver", "kpi", "reservationer", "fakturaer"]) {
      assert.ok(NODER.includes(paakraevet), `Noden "${paakraevet}" mangler i regelfilen.`);
    }
  });
});

describe("tenant-isolation — uden gyldigt claim", () => {
  it("ikke-logget-ind kan hverken læse eller skrive", async () => {
    const db = udenLogin();
    await assertFails(get(ref(db, `tenants/${MIN}/kunder`)));
    await assertFails(set(ref(db, `tenants/${MIN}/kunder/anon`), POST));
  });

  it("en bruger UDEN tenant-claim afvises", async () => {
    const db = som("uid-uden", { rolle: "admin" });
    await assertFails(get(ref(db, `tenants/${MIN}/kunder`)));
    await assertFails(set(ref(db, `tenants/${MIN}/kunder/utenant`), POST));
  });

  it("et tomt tenant-claim giver ingen adgang", async () => {
    const db = som("uid-tom", { tenant: "", rolle: "admin" });
    await assertFails(get(ref(db, `tenants/${MIN}/kunder`)));
    await assertFails(set(ref(db, `tenants/${MIN}/kunder/tom`), POST));
  });

  it("rollen alene giver ingenting — admin uden tenant er stadig ude", async () => {
    const db = som("uid-admin", { rolle: "admin" });
    for (const node of NODER) {
      await assertFails(get(ref(db, `tenants/${MIN}/${node}`)));
    }
  });
});

describe("tenant-isolation — på tværs af tenants", () => {
  it("læsning på tværs er afvist på HVER node i regelfilen", async () => {
    const db = som("uid-min", { tenant: MIN, rolle: "admin" });
    for (const node of NODER) {
      await assertFails(get(ref(db, `tenants/${FREMMED}/${node}`)));
    }
  });

  it("skrivning på tværs er afvist på HVER node i regelfilen", async () => {
    const db = som("uid-min", { tenant: MIN, rolle: "admin" });
    for (const node of NODER) {
      await assertFails(set(ref(db, `tenants/${FREMMED}/${node}/indtrængen`), POST));
    }
  });

  it("en enkelt post i en fremmed tenant kan ikke læses, selvom den findes", async () => {
    const db = som("uid-min", { tenant: MIN, rolle: "admin" });
    await assertFails(get(ref(db, `tenants/${FREMMED}/kunder/seed`)));
  });

  /* En multi-path update rammer flere stier i én atomisk skrivning. Rører den
     to tenants, skal HELE skrivningen afvises — ikke kun den fremmede halvdel.
     Ellers kunne man smugle en lovlig skrivning igennem sammen med en ulovlig
     og bruge resultatet til at udlede, hvad der findes i den anden tenant. */
  it("en multi-path update der rører to tenants afvises HELT", async () => {
    const db = som("uid-min", { tenant: MIN, rolle: "admin" });
    await assertFails(
      update(ref(db, "/"), {
        [`tenants/${MIN}/kunder/lovlig-halvdel`]: POST,
        [`tenants/${FREMMED}/kunder/ulovlig-halvdel`]: POST,
      })
    );

    const kontrol = som("uid-min2", { tenant: MIN, rolle: "admin" });
    const snap = await get(ref(kontrol, `tenants/${MIN}/kunder/lovlig-halvdel`));
    assert.equal(
      snap.exists(), false,
      "Den lovlige halvdel af en afvist multi-path update må ikke lande — skrivningen skal være atomisk."
    );
  });
});

describe("tenant-isolation — egen tenant virker stadig", () => {
  it("læsning i egen tenant er tilladt", async () => {
    const db = som("uid-min", { tenant: MIN, rolle: "admin" });
    const snap = await assertSucceeds(get(ref(db, `tenants/${MIN}/kunder/seed`)));
    assert.equal(snap.val().navn, `Kunde i ${MIN}`);
  });

  it("skrivning i egen tenant er tilladt", async () => {
    const db = som("uid-min", { tenant: MIN, rolle: "admin" });
    await assertSucceeds(set(ref(db, `tenants/${MIN}/kunder/egen`), POST));
  });
});

describe("roden og brugerTenants", () => {
  it("roden kan ikke læses", async () => {
    const db = som("uid-min", { tenant: MIN, rolle: "admin" });
    await assertFails(get(ref(db, "/")));
  });

  it("listen over tenants kan ikke hentes", async () => {
    const db = som("uid-min", { tenant: MIN, rolle: "admin" });
    await assertFails(get(ref(db, "tenants")));
  });

  it("brugerTenants: egen post kan læses, andres kan ikke, og ingen kan skrive", async () => {
    const db = som("mig", { tenant: MIN, rolle: "admin" });
    await assertSucceeds(get(ref(db, "brugerTenants/mig")));
    await assertFails(get(ref(db, "brugerTenants/enAnden")));
    await assertFails(set(ref(db, "brugerTenants/mig"), { tenant: FREMMED }));
  });
});
