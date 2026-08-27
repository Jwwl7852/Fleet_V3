/* test/rutedeling.test.mjs
 * Skærmene hentes når de åbnes — og lazy() fejler først når ruten besøges.
 *
 * ⚠ HVORFOR FILEN FINDES. Hver skærm stod som en almindelig import, og så lå
 * de alle sammen i ét bundt: **1.586 kB, heraf 935 kB vores egen kode.** En
 * vognmand med Fleet og Facility hentede Warehouses elleve skærme,
 * Unitbookings fire, Procures syv og ejerkonsollen — hver gang han åbnede
 * appen, over mobilnettet i en lastbil.
 *
 * Det er den samme sætning som beslutning 94 og 95 handler om, et lag længere
 * ude: **en kunde skal ikke betale for et modul han ikke har.** Dér var det
 * forespørgsler; her er det kilobytes.
 *
 * ⚠ OG `lazy()` FEJLER PÅ EN FARLIG MÅDE. En fil uden default-eksport
 * kompilerer fint, bygges fint og fejler først **når ruten åbnes** — hos
 * brugeren, på den ene skærm ingen af os klikkede på. Derfor prøven: den
 * holder rutetræet og filerne sammen uden at åbne en browser.
 *
 * Se beslutning 97.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { udenKommentarer } from "./kode.mjs";

const APP = readFileSync("src/App.jsx", "utf8");
const SHELL = readFileSync("src/fleet/AppShell.jsx", "utf8");

/* ⚠ DEN DELTE, IKKE EN LOKAL KOPI — se test/kode.mjs. Kopien her åd hele
   rutetræet: den så `/*` inde i strengen "/app/*" og strimlede resten af
   filen, så prøven meldte at hver eneste skærm manglede en rute. */
const KODE = udenKommentarer(APP);

/** `const X = lazy(() => import("./moduler/…"))` */
const DOVNE = [...KODE.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\("(\.\/moduler\/[^"]+)"\)\s*\)/g)]
  .map((m) => ({ navn: m[1], sti: m[2] }));

/** `import X from "./moduler/…"` — dem der IKKE er dovne. */
const EAGER = [...KODE.matchAll(/^import\s+([A-Za-z0-9_]+)\s+from\s+"(\.\/moduler\/[^"]+)";$/gm)]
  .map((m) => ({ navn: m[1], sti: m[2] }));

describe("Skærmene hentes når de åbnes", () => {
  it("der ER dovne skærme — ellers læser prøven ingenting", () => {
    assert.ok(DOVNE.length > 40,
      `kun ${DOVNE.length} dovne skærme fundet i App.jsx`);
  });

  /**
   * ⚠ TO EAGER SKÆRME, OG DE HAR SAMME GRUND.
   *
   * Login er den første skærm en uautentificeret bruger ser, og der er ingen
   * Suspense-grænse omkring den: den tegnes uden for AppShell. En doven Login
   * ville vise et tomt vindue dér hvor folk i forvejen er usikre på om de
   * tastede rigtigt.
   *
   * DevTesterVaelger tegnes af PRÆCIS samme grund og på samme sted i træet —
   * FØR harAdgang, altså også uden for AppShell og dermed uden en
   * Suspense-grænse. Den viser en autoriseret DEV-tester uden sin egen
   * tenant (se scripts/dev-tester.mjs) et rollevalg, ikke en tom skærm mens
   * han venter på at forstå hvorfor han ikke kom videre.
   */
  it("⚠ KUN Login OG DevTesterVaelger ER EAGER", () => {
    assert.deepEqual(EAGER.map((e) => e.navn).sort(), ["DevTesterVaelger", "Login"],
      "en skærm ligger i startbundtet uden en grund. Hver eneste kunde henter "
      + "den, også de der aldrig åbner den.");
  });

  /**
   * ⚠ DEN HER ER DEN DER BÆRER NOGET.
   *
   * `lazy()` kræver et default-eksport. Mangler det, fejler hverken build
   * eller lint — ruten kaster når den åbnes. En prøve der læser filerne, er
   * det eneste der fanger det uden at klikke sig gennem 55 skærme.
   */
  it("⚠ HVER DOVEN SKÆRM HAR ET DEFAULT-EKSPORT", () => {
    const mangler = [];
    for (const { navn, sti } of DOVNE) {
      const fil = "src/" + sti.replace("./", "");
      if (!existsSync(fil)) { mangler.push(`${navn}: ${fil} findes ikke`); continue; }
      const kode = udenKommentarer(readFileSync(fil, "utf8"));
      if (!/export\s+default\b/.test(kode)) mangler.push(`${navn}: ${fil} har intet default-eksport`);
    }
    assert.deepEqual(mangler, [],
      "lazy() på en fil uden default-eksport fejler FØRST når ruten åbnes:\n  "
      + mangler.join("\n  "));
  });

  it("hvert dovent navn bruges også i en rute", () => {
    /* Et navn der ikke tegnes, er en import der aldrig hentes — og så er
       skærmen uden for rutetræet uden at nogen kan se det. */
    const ubrugte = DOVNE
      .filter(({ navn }) => !new RegExp(`<${navn}\\b`).test(KODE))
      .map((d) => d.navn);
    assert.deepEqual(ubrugte, [],
      "en doven skærm er ikke sat på en rute:\n  " + ubrugte.join("\n  "));
  });
});

describe("Der er et sted at vente", () => {
  /**
   * ⚠ GRÆNSEN LIGGER I AppShell, OM INDHOLDSFELTET.
   *
   * React venter ved den NÆRMESTE Suspense-grænse. Lå den om `<Routes>` i
   * App.jsx, ville sidebaren, topbaren og periodevælgeren forsvinde og blive
   * tegnet om ved hvert eneste skærmskift — og en shell der blinker, føles
   * som en app der genstarter.
   */
  it("⚠ AppShell HAR EN Suspense OM SIT Outlet", () => {
    /* ⚠ KOMMENTARER UD FØRST. Filhovedet siger "sidebar + topbar +
       <Outlet/>", og den sætning stod før den rigtige JSX — så prøven målte
       rækkefølgen i en beskrivelse frem for i koden. */
    const kode = udenKommentarer(SHELL);
    assert.match(kode, /<Suspense/,
      "uden en grænse i shellen kaster den første dovne rute");
    const i = kode.indexOf("<Suspense");
    const j = kode.indexOf("<Outlet");
    assert.ok(i > 0 && j > i,
      "Outlet skal ligge INDE i Suspense — ellers venter React et andet sted");
  });

  it("⚠ OG INGEN Suspense I App.jsx OMSLUTTER AppShell", () => {
    /* To grænser er ikke en fejl i sig selv, men en ydre om shellen ville
       vinde ved første skærmskift og tage sidebaren med sig.

       ⚠ PRØVEN FORBØD FØR ENHVER Suspense EFTER `{!harAdgang &&`. Det er
       bredere end begrundelsen: chaufførappen ligger SIDEORDNET med shellen,
       i sin egen ramme, og skal have sin egen grænse — ellers ville en doven
       MinTur vise et tomt vindue. Det er samme figur som ejerkonsollen, som
       prøven lige nedenfor kræver har en. Kravet er derfor ikke "ingen
       Suspense", men "ingen Suspense OM shellen". Se beslutning 103. */
    const rutetrae = KODE.slice(KODE.indexOf("{!harAdgang &&"));
    for (const blok of rutetrae.match(/<Suspense[\s\S]*?<\/Suspense>/g) || []) {
      assert.ok(!blok.includes("<AppShell"),
        "en Suspense omslutter AppShell og blanker shellen ved hvert skift");
    }
    /* Og shellen har stadig sin egen indeni — se prøven ovenfor. */
    assert.match(KODE, /<Route element=\{<AppShell \/>\}>/);
  });

  it("ejerkonsollen har sin egen — den bruger ikke AppShell", () => {
    /* Udbyderrammen er sideordnet med kundeshellen (beslutning 35), så den
       skal have sin egen grænse. Uden den kaster /main. */
    const udbyder = KODE.slice(KODE.indexOf("<Udbyderramme"), KODE.indexOf("</Udbyderramme>"));
    assert.match(udbyder, /<Suspense/,
      "ejerkonsollens ruter er dovne uden en grænse omkring sig");
  });
});
