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
import { permStrengFraRolle } from "../src/fleet/permissions.js";

const MIN = "tenantX";
const FREMMED = "tenantY";
/* Aldrig provisioneret — ingen _findes-markør. Et claim der peger herhen er
   enten forældet eller resultatet af en fejl i den kode der sætter claims. */
const SPOEGELSE = "tenantSpoegelse";

const RAA_REGLER = readFileSync("firebase.rules.json", "utf8");

/* Regelfilen har //-linjekommentarer og er derfor ikke gyldig JSON. Emulatoren
   tager den som den er; til nodeopslaget herunder strippes kommentarlinjerne. */
const REGLER = JSON.parse(
  RAA_REGLER.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
);
const TENANT_REGLER = REGLER.rules.tenants.$tenantId;
const NODER = Object.keys(TENANT_REGLER).filter((n) => !n.startsWith("."));

/* Noder der BEVIDST ikke kan læses af nogen klient. Står en node her, er det
   et valg; står den ingen af stederne, er det en forglemmelse. */
const LAESNING_NAEGTET = new Set(["_findes"]);

/* BEHOLDERE. De har selv ingen .read — den ville kaskadere ned over alle
   objekterne derunder og ophæve hele opdelingen — men hvert objekt inde i
   dem har sin egen. Se beslutning 17. */
const BEHOLDERE = new Set(["sensitive", "vaerdi"]);

let miljoe;

/* perms lægges automatisk på ud fra rollens preset, medmindre kaldet sætter
   det selv. Reglerne spørger efter permissions — uden dem ville hver
   skrivning herunder fejle af den forkerte grund. */
const som = (uid, claims) =>
  miljoe
    .authenticatedContext(uid, {
      ...claims,
      ...(claims.rolle && !("perms" in claims)
        ? { perms: permStrengFraRolle(claims.rolle) }
        : {}),
    })
    .database();
const udenLogin = () => miljoe.unauthenticatedContext().database();

const POST = { navn: "Prøvepost", division: "gods", aktiv: true };

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-tenant",
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
      /* Provisioneringsmarkøren. I produktion sættes den af Admin SDK; her
         af withSecurityRulesDisabled, som går uden om reglerne på samme måde.
         SPOEGELSE får den bevidst IKKE. */
      await set(ref(db, `tenants/${t}/_findes`), true);
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

  /* KASKADEBRUDDET, fastholdt.
     tenants/$tenantId må IKKE have .read. Havde den det, ville den kaskadere
     ned over alt — også over de klassificerede undertræer — og så kan ingen
     af dem beskyttes uafhængigt. Det er hele forudsætningen for punkt 5 og 6. */
  it("tenants/$tenantId har ingen .read — ellers kaskaderer den ned over alt", () => {
    assert.equal(
      TENANT_REGLER[".read"], undefined,
      "En .read på tenants/$tenantId giver læseadgang til hvert eneste undertræ, " +
      "inklusive sensitive/ og vaerdi/. Læg den på de enkelte noder i stedet."
    );
  });

  /* Uden denne kan man tilføje en node og glemme dens .read. Den ville så
     være ulæselig — hvilket fejler lukket og altså er sikkert — men det ville
     blive opdaget af en bruger frem for af en test. */
  it("hver node har enten en .read, står på nægtelisten, eller er en beholder", () => {
    for (const node of NODER) {
      const regel = TENANT_REGLER[node] || {};
      const harRead = typeof regel[".read"] === "string";

      if (BEHOLDERE.has(node)) {
        /* En beholder må IKKE have .read — den ville kaskadere. Til gengæld
           skal hvert objekt inde i den have sin egen. */
        assert.equal(regel[".read"], undefined,
          `"${node}" er en beholder og må ikke have .read — den kaskaderer ned over alt derunder.`);
        const objekter = Object.keys(regel).filter((k) => !k.startsWith("."));
        assert.ok(objekter.length > 0, `Beholderen "${node}" er tom.`);
        for (const o of objekter) {
          assert.ok(typeof regel[o]?.[".read"] === "string",
            `"${node}/${o}" mangler .read. Uden den kan objektet ikke læses af nogen.`);
        }
        continue;
      }

      const naegtet = LAESNING_NAEGTET.has(node);
      assert.ok(
        harRead !== naegtet,
        naegtet
          ? `"${node}" står på nægtelisten, men har alligevel en .read.`
          : `"${node}" har hverken .read, plads på nægtelisten eller status som beholder. Tag stilling.`
      );
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

describe("tenant-isolation — claim mod en tenant der ikke findes", () => {
  it("et opdigtet tenant-claim kan ikke læse, heller ikke en tom node", async () => {
    const db = som("uid-spoeg", { tenant: SPOEGELSE, rolle: "admin" });
    await assertFails(get(ref(db, `tenants/${SPOEGELSE}/kunder`)));
    await assertFails(get(ref(db, `tenants/${SPOEGELSE}`)));
  });

  /* Den vigtige. Uden _findes ville skrivningen HER oprette tenanten —
     databasen ville få en tenant ingen har provisioneret, og den ville være
     usynlig indtil nogen ledte. */
  it("et opdigtet tenant-claim kan ikke oprette tenanten ved at skrive", async () => {
    const db = som("uid-spoeg", { tenant: SPOEGELSE, rolle: "admin" });
    await assertFails(set(ref(db, `tenants/${SPOEGELSE}/kunder/foerste`), POST));
    await assertFails(set(ref(db, `tenants/${SPOEGELSE}/opgaver/foerste`), { division: "gods" }));
  });

  it("markøren kan ikke bootstrappes fra klienten", async () => {
    const db = som("uid-spoeg", { tenant: SPOEGELSE, rolle: "admin" });
    await assertFails(set(ref(db, `tenants/${SPOEGELSE}/_findes`), true));
  });

  it("_findes kan hverken skrives eller slettes i ens EGEN tenant", async () => {
    const db = som("uid-min", { tenant: MIN, rolle: "admin" });
    await assertFails(set(ref(db, `tenants/${MIN}/_findes`), true));
    await assertFails(set(ref(db, `tenants/${MIN}/_findes`), null));
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
