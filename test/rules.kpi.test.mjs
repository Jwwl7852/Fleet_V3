/* test/rules.kpi.test.mjs
 * `kpi/` er delt på domæne — beslutning 44.
 *
 * ⚠ HVORFOR DEN FINDES. Noden havde ÉN `.read`, og den krævede kun
 * tenant-medlemskab: ingen permission, ingen modulklausul. En kunde uden
 * Økonomi-modulet kunne læse `tenants/<id>/kpi/gods/current/oekonomi` direkte
 * — netop det tal han ikke havde købt adgang til at se en skærm for.
 * Sidebaren skjulte modulet, og widgetvælgeren skjulte kortet; ingen af
 * delene spærrede tallet.
 *
 * Det stod skrevet ned i `dashboardvisning.js` som en KENDT begrænsning, og
 * det er den her fil der lukker den:
 *
 *   "En afkrydsning SKJULER et dashboard; den spærrer det ikke. Vil man have
 *    den rigtige spærring, er det kpi/ der skal deles op — pr. domæne, med en
 *    permission eller en modulklausul på hver."
 *
 * ⚠ DEN VIGTIGSTE PRØVE I FILEN er at FORÆLDEREN er lukket. `.read`
 * kaskaderer: blev den stående på `kpi/`, ville klausulen på domænet være ren
 * dekoration — én læsning af `kpi/<division>/current` ville give alt.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, get } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";
import {
  KPI_DOMAENE, ALLE_KPI_DOMAENER, KPI_UDEN_MODUL, laesbareDomaener,
} from "../src/fleet/kpi-aggregering.js";

/* To tenants: den ene har ALT, den anden har kun basen. Forskellen mellem dem
   ER prøven — samme bruger, samme rolle, forskellige moduler. */
const ALT = "tenantKpiAlt";
const BASIS = "tenantKpiBasis";

/* Basis-tenanten har kun de obligatoriske. Ingen flaade, ingen oekonomi. */
const BASISMODULER = { dashboard: true, support: true, opsaetning: true };

let miljoe;

const som = (tenantId, rolle = "disponent") =>
  miljoe.authenticatedContext(`uid-${tenantId}-${rolle}`, {
    tenant: tenantId, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const dom = (tenantId, domaene) =>
  `tenants/${tenantId}/kpi/gods/current/${domaene}`;

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-kpi",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    /* ⚠ EN GANG. ctx.database() kalder useEmulator() under motorhjelmen, og
       et kald nummer to på samme kontekst er en FATAL fejl i SDK'en. Den står
       skrevet i rules.opgaver.test.mjs, og jeg gik i den alligevel. */
    const db = ctx.database();
    for (const t of [ALT, BASIS]) {
      await db.ref(`tenants/${t}/_findes`).set(true);
      /* Et tal i hvert domæne, så en accept kan skelnes fra en tom node. */
      for (const d of ALLE_KPI_DOMAENER) {
        await db.ref(dom(t, d)).set({ etTal: 1 });
      }
    }
    await db.ref(`tenants/${ALT}/moduler`).set(
      Object.fromEntries(ALLE_KPI_DOMAENER.map((d) => [KPI_DOMAENE[d] || "dashboard", true])));
    await db.ref(`tenants/${BASIS}/moduler`).set(BASISMODULER);
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("⚠ FORÆLDEREN ER LUKKET — ellers er klausulen dekoration", () => {
  it("ingen kan læse hele kpi/<division>/current", async () => {
    /* `.read` kaskaderer. Stod den stadig på `kpi/`, ville ét kald give alle
       ti domæner, og modulklausulen nedenunder ville aldrig blive nået. */
    for (const rolle of ["admin", "disponent", "chauffoer"]) {
      const db = som(ALT, rolle);
      await assertFails(get(ref(db, `tenants/${ALT}/kpi/gods/current`)));
      await assertFails(get(ref(db, `tenants/${ALT}/kpi`)));
    }
  });

  it("⚠ HELLER IKKE ADMIN — det er ikke en rettighed, det er en vej", async () => {
    const db = som(ALT, "admin");
    await assertFails(get(ref(db, `tenants/${ALT}/kpi/gods`)));
  });

  it("regelfilen har ingen .read på selve kpi-noden", () => {
    /* Læst som tekst, fordi en genindført `.read` her ville få hver eneste
       prøve ovenfor til at gå fra "afvist" til "accepteret" i ét hug — og de
       ville så sige det modsatte af deres navne. */
    const regler = JSON.parse(readFileSync("firebase.rules.json", "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"));
    const kpi = regler.rules.tenants.$tenantId.kpi;
    assert.equal(kpi[".read"], undefined, "kpi/ har fået en .read igen");
    assert.equal(kpi[".write"], false);
    assert.ok(kpi.$division.$snapshot.$domaene[".read"], "domænet har ingen .read");
  });
});

describe("modulet afgør domænet", () => {
  it("en kunde med alle moduler kan læse hvert domæne", async () => {
    const db = som(ALT);
    for (const d of ALLE_KPI_DOMAENER) {
      await assertSucceeds(get(ref(db, dom(ALT, d)))).catch(() => {
        throw new Error(`${d} blev afvist for en kunde der har modulet`);
      });
    }
  });

  it("⚠ EN KUNDE UDEN MODULET KAN IKKE LÆSE TALLET", async () => {
    /* Det er hele ærindet. Før kunne han det — sidebaren skjulte bare
       skærmen. Et skjult modul med et åbent tal er en kommerciel kontrol der
       udgiver sig for at være en spærring. */
    const db = som(BASIS);
    for (const d of ALLE_KPI_DOMAENER) {
      if (KPI_UDEN_MODUL.includes(d)) continue;
      await assertFails(get(ref(db, dom(BASIS, d)))).catch(() => {
        throw new Error(`${d} kunne læses uden modulet ${KPI_DOMAENE[d]}`);
      });
    }
  });

  it("⚠ TO DOMÆNER ER ÅBNE, OG DET ER EN CARVE-OUT MED EN GRUND", async () => {
    /* `opgaver` spænder værksted (flaade) OG facility; `afvigelser` spænder
       indkøbs- og salgsprisafvigelse. En klausul på ét modul ville lukke
       tallet for en kunde der har det andet. Samme carve-out som noderne
       opgaver/satser/fakturaer i beslutning 33. */
    assert.deepEqual([...KPI_UDEN_MODUL].sort(), ["afvigelser", "opgaver"]);
    const db = som(BASIS);
    for (const d of KPI_UDEN_MODUL) {
      await assertSucceeds(get(ref(db, dom(BASIS, d))));
    }
  });

  it("⚠ disponering HØRER TIL booking — domænet og modulet hedder ikke det samme", async () => {
    /* De ni andre klarer sig med `moduler.child($domaene)`. Den her er
       undtagelsen, og den står eksplicit i reglen. Falder prøven, er
       undtagelsen faldet ud. */
    assert.equal(KPI_DOMAENE.disponering, "booking");
    const db = som(BASIS);
    await assertFails(get(ref(db, dom(BASIS, "disponering"))));
  });

  it("et ukendt domæne er lukket — modulet findes ikke", async () => {
    /* `moduler.child('detFindesIkke')` er null, ikke true. En tastefejl i et
       domænenavn giver derfor en afvisning frem for en åben dør. */
    const db = som(ALT);
    await assertFails(get(ref(db, dom(ALT, "opfundet"))));
  });
});

describe("kataloget og reglen beskriver det samme", () => {
  it("⚠ HVERT DOMÆNE I NODEN STÅR I KPI_DOMAENE", async () => {
    /* Et domæne aggregeringen skriver, men kataloget ikke kender, ville
       blive skrevet af serveren og aldrig hentet af klienten — og hullet
       ville ligne et felt der ventede på at blive regnet. */
    const { DEMO_KPI } = await import("../src/fleet/demo-kpi.js");
    assert.deepEqual(Object.keys(DEMO_KPI.gods).sort(), [...ALLE_KPI_DOMAENER].sort());
  });

  it("laesbareDomaener() svarer det samme som reglen", () => {
    const harBasis = (m) => Boolean(BASISMODULER[m]);
    assert.deepEqual(laesbareDomaener(harBasis).sort(), [...KPI_UDEN_MODUL].sort());
    assert.deepEqual(laesbareDomaener().sort(), [...ALLE_KPI_DOMAENER].sort());
  });

  it("⚠ SKÆRMEN BEDER KUN OM DEM DEN MÅ FÅ", () => {
    /* Ellers ville hver sideindlæsning udløse en håndfuld permission-denied i
       konsollen, og en afvisning skal betyde noget. */
    const kilde = readFileSync("src/fleet/useKpi.js", "utf8");
    assert.match(kilde, /laesbareDomaener\(/);
    assert.doesNotMatch(kilde, /kpi\/\$\{division\}\/current`/,
      "useKpi henter stadig hele snapshottet — reglen afviser det");
  });
});
