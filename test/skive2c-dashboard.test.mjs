/* test/skive2c-dashboard.test.mjs
 * Skive 2C — Dashboardets fire-lags synlighed, 1/2+/0-landing og den
 * handlingsorienterede Samlet-sektion.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dashboard.jsx er JSX og kan ikke importeres af node:test. Samme løsning
 * som skive2b-menu.test.mjs's `renderetMenu()` for AppShell.jsx: de rene,
 * allerede eksporterede funktioner (`synligeDashboards()`, `handlinger()`,
 * `erSkjultVedNavvisning()`, `harModul()`) kaldes her i PRÆCIS samme
 * rækkefølge som Dashboard.jsx selv gør — inklusive
 * `KPI_DOMAENE_FOR_DASHBOARD`-oversættelsen — og landings-regnestykket
 * (1/2+/0 driftsmoduler → standardMaal/visVaelger) er en ordret kopi af de
 * to linjer i Dashboard.jsx, ikke en tilnærmelse. Se samme greb i
 * test/skive2a-navigation.test.mjs og test/navadgang.test.mjs.
 *
 * ⚠ MODULSYNLIGHED, IKKE SERVERADGANG. Filen her rører hverken
 * firebase.rules.json eller nogen Cloud Function — det er
 * test/dashboardvisning.test.mjs's "håndhævelsen"-beskrivelse og
 * test/navvisning.test.mjs's tilsvarende del der prøver serversiden.
 *
 * Kør: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SAMLET, ALLE_DASHBOARDS, MODULKORT, HANDLINGER, handlinger,
} from "../src/fleet/dashboards.js";
import { synligeDashboards } from "../src/fleet/dashboardvisning.js";
import { erSkjultVedNavvisning } from "../src/fleet/navvisning.js";
import { harModul, modulsaet, VALGFRIE_MODULER } from "../src/fleet/moduler.js";
import { disponeringstal } from "../src/fleet/kpi-aggregering.js";
import { standardlayout, layoutFor, valideLayout } from "../src/fleet/widgets.js";

/**
 * Samme oversættelse som Dashboard.jsx: `utilgaengelige` (fra useKpi) er
 * nøglet på KPI-DOMÆNET ("disponering"), mens DASHBOARDS/dashboardvisning/
 * navvisning alle bruger MODULETS navn ("booking"). Se Dashboard.jsx's egen
 * note og kpi-aggregering.js's KPI_DOMAENE.
 */
const KPI_DOMAENE_FOR_DASHBOARD = { booking: "disponering" };
const kanSeDashboard = (utilgaengelige, noegle) =>
  !utilgaengelige[KPI_DOMAENE_FOR_DASHBOARD[noegle] || noegle];

/**
 * Dashboard.jsx's `ALLE` — de fire lag, hvert et "OG". Se filens egen
 * kommentar ved `const ALLE = synligeDashboards(...)`.
 */
function synligALLE({ moduler, utilgaengelige = {}, dashboardvisning = null, navvisning = null }) {
  const harKundenModul = (m) => harModul(moduler, m);
  return synligeDashboards(dashboardvisning, harKundenModul,
    (noegle) => kanSeDashboard(utilgaengelige, noegle) && !erSkjultVedNavvisning(noegle, navvisning));
}

/** Dashboard.jsx's `driftsmoduler`/`visVaelger`/`standardMaal`, ordret. */
function landing(alle) {
  const driftsmoduler = alle.filter((d) => d.key !== SAMLET);
  return {
    visVaelger: driftsmoduler.length >= 2,
    standardMaal: driftsmoduler.length === 1 ? driftsmoduler[0].key : SAMLET,
  };
}

/** Dashboard.jsx's `valgt` — forespørgsels-sikkerheden ved `?db=`. */
function valgtDashboard(alle, standardMaal, forespurgt) {
  return alle.some((d) => d.key === forespurgt) ? forespurgt : standardMaal;
}

const noegler = (liste) => liste.map((d) => d.key).sort();
const FULD_TENANT = modulsaet(VALGFRIE_MODULER);

describe("Skive 2C — 1) Én synlig Planning: ingen vælger, lander direkte på Planning", () => {
  const alle = synligALLE({ moduler: modulsaet(["booking"]) });
  const { visVaelger, standardMaal } = landing(alle);

  it("visVaelger er falsk", () => assert.equal(visVaelger, false));
  it("standardMaal er booking", () => assert.equal(standardMaal, "booking"));
  it("valgt uden ?db= lander på booking", () => {
    assert.equal(valgtDashboard(alle, standardMaal, null), "booking");
  });
});

describe("Skive 2C — 2) Én synlig Warehouse: ingen Samlet-vælger, Warehouse direkte", () => {
  const alle = synligALLE({ moduler: modulsaet(["warehouse"]) });
  const { visVaelger, standardMaal } = landing(alle);

  it("visVaelger er falsk", () => assert.equal(visVaelger, false));
  it("standardMaal er warehouse, ikke samlet", () => assert.equal(standardMaal, "warehouse"));
});

describe("Skive 2C — 3) Warehouse + Unitbooking: vælger = Samlet + Warehouse + Unitbooking", () => {
  const alle = synligALLE({ moduler: modulsaet(["warehouse", "unitbooking"]) });
  const { visVaelger } = landing(alle);

  it("visVaelger er sand", () => assert.equal(visVaelger, true));
  it("vælgeren er præcis {samlet, unitbooking, warehouse} — intet andet", () => {
    assert.deepEqual(noegler(alle), ["samlet", "unitbooking", "warehouse"]);
  });
});

describe("Skive 2C — 4) Fuld admin uden navvisning: Samlet + alle tilladte modul-dashboards inkl. Planning", () => {
  const alle = synligALLE({ moduler: FULD_TENANT });

  it("Planning er med", () => assert.ok(noegler(alle).includes("booking")));
  it("alle otte (Samlet + de syv driftsmoduler) er med", () => {
    assert.deepEqual(noegler(alle), [...ALLE_DASHBOARDS].sort());
  });
});

describe("Skive 2C — 5) Navvisning skjuler Fleet: Fleet mangler i selector", () => {
  const alle = synligALLE({ moduler: FULD_TENANT, navvisning: { flaade: false } });

  it("flaade er væk", () => assert.ok(!noegler(alle).includes("flaade")));
  it("resten er upåvirket", () => {
    for (const k of ["samlet", "booking", "facility", "indkoeb", "warehouse", "unitbooking", "bemanding"]) {
      assert.ok(noegler(alle).includes(k), `${k} forsvandt uden grund`);
    }
  });
});

describe("Skive 2C — 6) Dashboardvisning skjuler et admin-tilladt modul: modulet mangler i selector", () => {
  const alle = synligALLE({ moduler: FULD_TENANT, dashboardvisning: { indkoeb: false } });

  it("indkoeb er væk", () => assert.ok(!noegler(alle).includes("indkoeb")));
  it("de andre driftsmoduler er upåvirket", () => {
    assert.ok(noegler(alle).includes("booking"));
    assert.ok(noegler(alle).includes("flaade"));
  });
});

describe("Skive 2C — 7) Dashboardvisning forsøger at genåbne et navvisning-skjult modul: forbliver skjult", () => {
  it("facility forbliver skjult, selv når brugerens EGEN dashboardvisning eksplicit slår den til", () => {
    const alle = synligALLE({
      moduler: FULD_TENANT,
      navvisning: { facility: false },
      dashboardvisning: { facility: true },
    });
    assert.ok(!noegler(alle).includes("facility"),
      "et navvisning-skjult modul blev genåbnet via brugerens egen dashboardvisning");
  });
});

describe("Skive 2C — 8) Modul ikke købt: kan ikke optræde i selector", () => {
  it("flaade mangler når tenanten kun har booking, uanset ingen anden spærring", () => {
    const alle = synligALLE({ moduler: modulsaet(["booking"]) });
    assert.ok(!noegler(alle).includes("flaade"));
  });
});

describe("Skive 2C — 9) Permission udelukker modul: kan ikke optræde i selector", () => {
  it("flaade mangler når KPI-domænet flaade er permissionsspærret", () => {
    const alle = synligALLE({ moduler: FULD_TENANT, utilgaengelige: { flaade: "perm" } });
    assert.ok(!noegler(alle).includes("flaade"));
  });

  it("⚠ booking mangler når det RIGTIGE KPI-domæne (disponering) er spærret", () => {
    const alle = synligALLE({ moduler: FULD_TENANT, utilgaengelige: { disponering: "perm" } });
    assert.ok(!noegler(alle).includes("booking"),
      "KPI_DOMAENE_FOR_DASHBOARD-oversættelsen er ikke anvendt — Planning så tilgængelig ud");
  });

  it("⚠ og en spærring på den FORKERTE nøgle (booking, ikke disponering) ville IKKE virke — beviser hvorfor oversættelsen findes", () => {
    const alle = synligALLE({ moduler: FULD_TENANT, utilgaengelige: { booking: "perm" } });
    assert.ok(noegler(alle).includes("booking"),
      "denne test skal være sand: den viser netop den fejl der ville opstå UDEN KPI_DOMAENE_FOR_DASHBOARD");
  });
});

describe("Skive 2C — 10) Manipuleret ?db=: skjult/ikke-tilladt dashboard kan ikke åbnes", () => {
  it("et navvisning-skjult modul kan ikke åbnes via ?db=, falder tilbage til standardMaal", () => {
    const alle = synligALLE({ moduler: FULD_TENANT, navvisning: { flaade: false } });
    const { standardMaal } = landing(alle);
    assert.equal(standardMaal, SAMLET); // stadig 6 andre driftsmoduler synlige
    assert.equal(valgtDashboard(alle, standardMaal, "flaade"), SAMLET);
  });

  it("et ikke-købt modul kan ikke åbnes via ?db=, falder tilbage til det ene synlige driftsmodul", () => {
    const alle = synligALLE({ moduler: modulsaet(["booking"]) });
    const { standardMaal } = landing(alle);
    assert.equal(standardMaal, "booking");
    assert.equal(valgtDashboard(alle, standardMaal, "flaade"), "booking",
      "et ikke-tilgængeligt ?db=flaade genåbnede ikke bare fordi det blev tastet i URL'en");
  });
});

describe("Skive 2C — 11) 0 synlige driftsmoduler: ærlig fallback, ingen crash/loop", () => {
  const alle = synligALLE({ moduler: modulsaet([]) }); // kun obligatoriske moduler, intet driftsmodul
  const { visVaelger, standardMaal } = landing(alle);

  it("Samlet er den eneste synlige — den kan ikke fjernes, den er altid: true", () => {
    assert.deepEqual(noegler(alle), [SAMLET]);
  });
  it("ingen vælger tilbydes", () => assert.equal(visVaelger, false));
  it("standardMaal er Samlet, ikke en tom/ugyldig værdi", () => assert.equal(standardMaal, SAMLET));
  it("et forsøg på ?db=flaade ændrer intet", () => {
    assert.equal(valgtDashboard(alle, standardMaal, "flaade"), SAMLET);
  });
});

describe("Skive 2C — 12) Samlet: primær sektion har maks. 3–6 reelle handlinger, ingen permanent demodata", () => {
  const HANDLING_LOFT = 6; // ⚠ SAMME TAL SOM Dashboard.jsx — se filens egen kommentar der.

  it("uden nogen ubesvarede/nul-felter giver INGEN handlinger — ikke opdigtede rækker", () => {
    const ud = handlinger({}, { harModulFn: () => true });
    assert.deepEqual(ud, []);
  });

  it("med alle ni HANDLINGER-kilder aktive, skæres listen ved 6 og resten annonceres, ikke skjules stille", () => {
    const kpiAlleHandlinger = {
      flaade: { udeAfDrift: 1, nyeIndberetninger: 1 },
      facility: { klimaalarmerIDag: 1, servicepunkterForfalder: 1 },
      opgaver: { forsinkede: 1 },
      disponering: { konflikter: 1, forsinkelsesrisiko: 1, aabneEtaper: 1 },
      indkoeb: { fakturaerTilGodkendelse: 1 },
    };
    const alle = handlinger(kpiAlleHandlinger, { harModulFn: () => true });
    assert.equal(alle.length, HANDLINGER.length, "fixturen skal ramme alle katalogets rækker");
    assert.ok(alle.length > HANDLING_LOFT, "testens forudsætning: der skal være flere end loftet");

    const handler = alle.slice(0, HANDLING_LOFT);
    const skaaret = alle.length - handler.length;
    assert.equal(handler.length, HANDLING_LOFT);
    assert.ok(skaaret > 0, "der er noget at annoncere som skåret væk");
  });

  it("dashboards.js importerer ingen demo-*.js — hverken kortene eller handlingerne kan læse et demosæt", () => {
    const kilde = readFileSync("src/fleet/dashboards.js", "utf8");
    assert.doesNotMatch(kilde, /from\s+["'][^"']*demo-/,
      "dashboards.js importerer et demosæt — Samlet/Planning kan da ikke garanteres fri for permanent demodata");
  });
});

describe("Skive 2C — 13) Planning: ingen permanent demodata, kun verificerede eksisterende kilder", () => {
  it("MODULKORT.booking's tre felter findes alle som ægte nøgler i disponeringstal()'s retur", () => {
    const tomtSvar = disponeringstal([], {});
    for (const post of MODULKORT.booking.tal) {
      const [domaene, felt] = post.felt.split(".");
      assert.equal(domaene, "disponering");
      assert.ok(Object.prototype.hasOwnProperty.call(tomtSvar, felt),
        `MODULKORT.booking peger på "${felt}", som ikke findes i disponeringstal()'s retur`);
    }
  });

  it("ledigKapacitetPct (altid null) er MED VILJE ikke blandt MODULKORT.booking's felter", () => {
    const brugteFelter = MODULKORT.booking.tal.map((p) => p.felt.split(".")[1]);
    assert.ok(!brugteFelter.includes("ledigKapacitetPct"),
      "et felt der ALTID er null, ville ikke være et nøgletal — det ville påstå en måling der aldrig regnes");
  });

  it("Planning-kortet er ikke et 'mangler'-kort — kilden findes allerede", () => {
    assert.ok(!MODULKORT.booking.mangler, "booking skulle IKKE stå med et mangler-kort som warehouse/unitbooking");
    assert.ok(Array.isArray(MODULKORT.booking.tal) && MODULKORT.booking.tal.length > 0);
  });

  it("de to Planning-HANDLINGER-rækker bruger samme, allerede-verificerede felter", () => {
    const planningHandlinger = HANDLINGER.filter((h) => h.modul === "booking");
    assert.ok(planningHandlinger.length >= 2, "Planning skal have mindst disponeringskonflikter og forsinkelsesrisiko");
    const tomtSvar = disponeringstal([], {});
    for (const h of planningHandlinger) {
      const [domaene, felt] = h.felt.split(".");
      assert.equal(domaene, "disponering");
      assert.ok(Object.prototype.hasOwnProperty.call(tomtSvar, felt),
        `HANDLINGER "${h.key}" peger på "${felt}", som ikke findes i disponeringstal()'s retur`);
    }
  });
});

describe("Skive 2C — 14) Tilpas forside / eksisterende brugerlayout: fortsat fungerende og backward-compatible", () => {
  it("standardlayout() for et EKSISTERENDE dashboard (flaade) er uændret af at booking blev tilføjet", () => {
    const layout = standardlayout("flaade", () => true);
    assert.ok(layout.length > 0);
    assert.ok(layout.every((k) => typeof k === "string"));
  });

  it("standardlayout('booking', …) fejler ikke og giver et ærligt, tomt layout — der findes endnu ingen Planning-widgets", () => {
    const layout = standardlayout("booking", () => true);
    assert.deepEqual(layout, [],
      "der er bevidst ingen widgets i WIDGETS-kataloget for modul 'booking' endnu — et opdigtet layout ville være demodata");
  });

  it("layoutFor() håndterer et gemt layout for 'booking' uden at kaste, og filtrerer det samme som altid", () => {
    assert.deepEqual(layoutFor(null, "booking", () => true), []); // aldrig gemt → standarden (tom)
    assert.deepEqual(layoutFor([], "booking", () => true), []); // eksplicit tomt → forbliver tomt
    assert.deepEqual(layoutFor(["udeAfDrift"], "booking", () => true), ["udeAfDrift"]); // en gyldig, om end 'fremmed', nøgle overlever filtreringen uændret
  });

  it("valideLayout() er upåvirket — kender stadig kun WIDGETS, ikke DASHBOARDS", () => {
    assert.equal(valideLayout([]).ok, true);
    assert.equal(valideLayout(["ikkeEnWidget"]).ok, false);
  });

  it("⚠ SKIVE 2C.2 LUKKEDE HULLET: brugerlayout/$uid/$dashboard kender nu 'booking' på SERVEREN", () => {
    /* Stod tidligere som en dokumenteret afvigelse: firebase.rules.json
       måtte ikke røres i Skive 2C, så reglens hardkodede regex-allowlist
       over dashboardnavne manglede "booking" — "Tilpas forside" kunne VISES
       på Planning, men GEM blev afvist af reglerne. Skive 2C.2 er netop den
       isolerede rettelse af dét. Den matchende undtagelse
       ("SKIVE_2C_UNDTAGET") er fjernet fra test/widgets.test.mjs. Denne
       test er nu den omvendte vagtprøve: falder den, er "booking" forsvundet
       fra reglen igen. */
    const raa = readFileSync("firebase.rules.json", "utf8");
    const i = raa.indexOf('"brugerlayout"');
    const blok = raa.slice(i, i + 1200);
    assert.match(blok, /\bbooking\b/,
      "firebase.rules.json's brugerlayout-regel har mistet 'booking' igen");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * SKIVE 2C.1 — KORREKTION: "Kræver handling" og <Kpiadgang> respekterer nu
 * den SAMME endelige firelags-synlighed som vælgeren og modulkortene, og
 * Warehouse/Unitbookings "ikke aggregeret"-kort viser ikke længere interne
 * feltstier/nodenavne. Se Dashboard.jsx's kommentarer "SKIVE 2C.1 —
 * KORREKTION 1/2/3".
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Dashboard.jsx's `endeligSynligeModuler`-filter på "Kræver handling"
 * (KORREKTION 1), ordret — samme opbygning som `landing()` ovenfor, blot
 * videreført ét skridt til handlinger().
 */
function endeligeHandlinger(alle, kpi, { harModulFn, valgt }) {
  const driftsmoduler = alle.filter((d) => d.key !== SAMLET);
  const endeligSynligeModuler = new Set(driftsmoduler.map((d) => d.key));
  return handlinger(kpi, { harModulFn })
    .filter((h) => !h.modul || endeligSynligeModuler.has(h.modul))
    .filter((h) => valgt === SAMLET || h.modul === valgt);
}

/** Dashboard.jsx's `kpiadgangRelevant` (KORREKTION 2), ordret. */
function kpiadgangRelevant(alle, utilgaengelige, navvisningPost) {
  const driftsmoduler = alle.filter((d) => d.key !== SAMLET);
  const endeligSynligeModuler = new Set(driftsmoduler.map((d) => d.key));
  const relevanteKpiDomaener = new Set(
    [...endeligSynligeModuler].map((m) => KPI_DOMAENE_FOR_DASHBOARD[m] || m));
  if (!erSkjultVedNavvisning("oekonomi", navvisningPost)) relevanteKpiDomaener.add("oekonomi");
  return Object.fromEntries(
    Object.entries(utilgaengelige).filter(([d]) => relevanteKpiDomaener.has(d)));
}

/* Fixture der udløser ALLE ni HANDLINGER-poster (flaade, facility, indkoeb,
   booking) — samme fixture som Skive 2C's egen "Samlet: maks. 3–6"-test. */
const KPI_ALLE_HANDLINGER = {
  flaade: { udeAfDrift: 1, nyeIndberetninger: 1 },
  facility: { klimaalarmerIDag: 1, servicepunkterForfalder: 1 },
  opgaver: { forsinkede: 1 },
  disponering: { konflikter: 1, forsinkelsesrisiko: 1, aabneEtaper: 1 },
  indkoeb: { fakturaerTilGodkendelse: 1 },
};

describe("Skive 2C.1 — 1) Navvisning = Warehouse + Unitbooking: 'Kræver handling' er tom for de andre moduler", () => {
  const alle = synligALLE({
    moduler: FULD_TENANT,
    navvisning: { flaade: false, facility: false, indkoeb: false, booking: false, bemanding: false },
  });
  const { standardMaal } = landing(alle);

  it("standardMaal er Samlet (2 driftsmoduler tilbage)", () => {
    assert.equal(standardMaal, SAMLET);
  });
  it("'Kræver handling' indeholder INGEN Fleet-, Planning-, Facility-, Procure- eller Workforce-handling", () => {
    const resultat = endeligeHandlinger(alle, KPI_ALLE_HANDLINGER,
      { harModulFn: () => true, valgt: standardMaal });
    for (const h of resultat) {
      assert.ok(!["flaade", "facility", "indkoeb", "booking", "bemanding"].includes(h.modul),
        `"${h.key}" (modul ${h.modul}) burde være filtreret væk af navvisning`);
    }
  });
});

describe("Skive 2C.1 — 2) Navvisning = kun Warehouse: ingen handling fra andre moduler, ingen skjult-domæne-støj", () => {
  const navvisning = {
    flaade: false, facility: false, indkoeb: false, booking: false,
    bemanding: false, unitbooking: false, oekonomi: false,
  };
  const alle = synligALLE({ moduler: FULD_TENANT, navvisning });
  const { standardMaal, visVaelger } = landing(alle);

  it("lander direkte på warehouse, ingen vælger", () => {
    assert.equal(visVaelger, false);
    assert.equal(standardMaal, "warehouse");
  });
  it("'Kræver handling' er tom — warehouse har ingen HANDLINGER-poster, og intet andet modul er synligt", () => {
    const resultat = endeligeHandlinger(alle, KPI_ALLE_HANDLINGER,
      { harModulFn: () => true, valgt: standardMaal });
    assert.deepEqual(resultat, []);
  });
  it("ingen Kpiadgang-besked om Økonomi/Fleet/Facility/Procure, selvom de reelt er utilgængelige", () => {
    const utilgaengelige = {
      oekonomi: "perm", flaade: "perm", facility: "modul", indkoeb: "perm",
    };
    const relevant = kpiadgangRelevant(alle, utilgaengelige, navvisning);
    assert.deepEqual(relevant, {},
      `støj om skjulte domæner: ${Object.keys(relevant).join(", ")}`);
  });
});

describe("Skive 2C.1 — 3) Fuld admin: relevante handlinger fra alle synlige moduler vises fortsat", () => {
  it("alle ni HANDLINGER-poster overlever filteret når intet er skjult", () => {
    const alle = synligALLE({ moduler: FULD_TENANT });
    const { standardMaal } = landing(alle);
    assert.equal(standardMaal, SAMLET);
    const resultat = endeligeHandlinger(alle, KPI_ALLE_HANDLINGER,
      { harModulFn: () => true, valgt: standardMaal });
    assert.equal(resultat.length, HANDLINGER.length);
  });
});

describe("Skive 2C.1 — 4) Dashboardvisning skjuler et ellers nav-synligt modul: dets handlinger forsvinder også", () => {
  it("indkoeb (Procure) sine handlinger er væk, resten er upåvirket", () => {
    const alle = synligALLE({ moduler: FULD_TENANT, dashboardvisning: { indkoeb: false } });
    const { standardMaal } = landing(alle);
    assert.equal(standardMaal, SAMLET);
    const resultat = endeligeHandlinger(alle, KPI_ALLE_HANDLINGER,
      { harModulFn: () => true, valgt: standardMaal });
    assert.ok(!resultat.some((h) => h.modul === "indkoeb"),
      "en dashboardvisning-skjult moduls handling overlevede filteret");
    assert.ok(resultat.some((h) => h.modul === "flaade"), "flaade forsvandt uden grund");
    assert.ok(resultat.some((h) => h.modul === "booking"), "booking forsvandt uden grund");
    assert.ok(resultat.some((h) => h.modul === "facility"), "facility forsvandt uden grund");
  });
});

describe("Skive 2C.1 — 5) Warehouse/Unitbooking ikkeAggregeret: ingen interne felt-/node-/kpi-navne i bruger-UI", () => {
  const KILDE = readFileSync("src/moduler/Dashboard.jsx", "utf8");
  const start = KILDE.indexOf("kort.mangler ? (");
  const slut = KILDE.indexOf(") : (", start);
  const gren = KILDE.slice(start, slut);

  it("mangler-grenen findes og er ikke tom (testens egen forudsætning)", () => {
    assert.ok(start > 0 && slut > start);
  });
  it("kort.hvorfor renderes IKKE til brugeren", () => {
    assert.doesNotMatch(gren, /kort\.hvorfor/);
  });
  it("kort.mangler's rå feltstier renderes IKKE til brugeren", () => {
    assert.doesNotMatch(gren, /kort\.mangler\.map/);
    assert.doesNotMatch(gren, /<code>/);
  });
  it("kataloget selv (dev-data til README/test) er UÆNDRET — kun visningen er rettet", () => {
    assert.ok(MODULKORT.warehouse.hvorfor && MODULKORT.warehouse.mangler.length > 0);
    assert.ok(MODULKORT.unitbooking.hvorfor && MODULKORT.unitbooking.mangler.length > 0);
  });
});
