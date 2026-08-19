/* test/widgets.test.mjs
 * Widgetkataloget, layoutet og den ene node brugeren selv skriver.
 *
 * ⚠ HVORFOR DEN HER FIL FINDES — SAMME GRUND SOM dashboards.test.mjs.
 * En widget ER et felt i `kpi/` med en præsentation. En tastefejl i en sti
 * fejler ikke: opslaget svarer null, og kortet skriver INTET (—). Og "—" er
 * en tilstand vi har MED VILJE, nemlig "ikke aggregeret endnu". En forkert
 * sti ser altså nøjagtig ud som et felt der venter på aggregeringen — og den
 * forskel kan ingen se på skærmen.
 *
 * ⚠ OG DEN HOLDER ØJE MED SKRIVEVEJEN. `brugerlayout` er den ENESTE node
 * hvor klienten skriver sin egen post. Falder `auth.uid === $uid` ud af
 * reglen, kan enhver i virksomheden rette sine kollegers forside — det
 * lækker ingenting, men det er en ændring ingen kan forklare.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  WIDGETS, ALLE_WIDGETS, ANTAL_WIDGETS,
  widget, tilgaengeligeWidgets, standardlayout, valideLayout, layoutFor,
} from "../src/fleet/widgets.js";
import { SAMLET, ALLE_DASHBOARDS } from "../src/fleet/dashboards.js";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";
import { ALLE_MODULER, MODUL } from "../src/fleet/moduler.js";

const DIVISIONER = ["gods", "bus"];
const alle = () => true;

const slaaOp = (kpi, sti) =>
  sti.split(".").reduce((o, n) => (o == null ? o : o[n]), kpi);

/* ⚠ IKON LÆSES SOM TEKST OG IMPORTERES IKKE. ui.jsx er JSX, og `node --test`
   kan ikke indlæse den. En prøve der importerede den, ville have tvunget
   ikonlisten ud af komponentfilen bare for at kunne køre — og så lå den to
   steder. Samme greb som css-navne-prøven bruger. */
const IKONNAVNE = new Set(
  readFileSync("src/fleet/ui.jsx", "utf8")
    .split("export const IKON = {")[1]
    .split(String.fromCharCode(10) + "};")[0]
    .split(String.fromCharCode(10))
    .map((l) => (l.match(/^ {2}([a-zA-ZæøåÆØÅ0-9_]+) *:/) || [])[1])
    .filter(Boolean)
);

/* Regelfilen uden kommentarlinjer — JSON tåler dem ikke. */
const regler = () => JSON.parse(
  readFileSync("firebase.rules.json", "utf8")
    .split(String.fromCharCode(10))
    .filter((l) => !l.trim().startsWith("//"))
    .join(String.fromCharCode(10))
);

describe("⚠ HVER WIDGET PEGER PÅ ET FELT DER FINDES", () => {
  it("hver `felt` kan slås op i kpi/ for hver division", () => {
    /* Den vigtigste prøve i filen. Et felt der ikke findes, skriver "—" —
       og "—" betyder "ikke aggregeret endnu". */
    const mangler = [];
    for (const d of DIVISIONER) {
      for (const w of WIDGETS) {
        if (slaaOp(DEMO_KPI[d], w.felt) === undefined) mangler.push(`${d}: ${w.felt}`);
      }
    }
    assert.deepEqual(mangler, [],
      "felter uden en form i demo-kpi.js — definér dem DER, hardkod dem ikke");
  });

  it("nøglerne er entydige", () => {
    assert.equal(new Set(ALLE_WIDGETS).size, ALLE_WIDGETS.length);
  });

  it("hvert ikon findes i IKON", () => {
    /* Et ikonnavn der ikke findes, tegner ingenting — og kortet ser ud som om
       ikonet var glemt med vilje. */
    for (const w of WIDGETS) {
      assert.ok(IKONNAVNE.has(w.ikon), `${w.key} bruger ikonet "${w.ikon}", som ikke findes`);
    }
  });

  it("hver tone er en af de seks kategorifarver", () => {
    /* ⚠ KATEGORIFARVER, IKKE STATUSFARVER — beslutning 30. Grøn/gul/rød siger
       "godt/skidt", og et widgetikon siger ikke noget om tallet. */
    const gyldige = new Set(["ikon-1", "ikon-2", "ikon-3", "ikon-4", "ikon-5", "ikon-6"]);
    for (const w of WIDGETS) {
      assert.ok(gyldige.has(w.tone), `${w.key} har tonen "${w.tone}"`);
    }
  });

  it("hver form kan tegnes af skærmen", () => {
    /* Skærmen vælger mellem pct/kr/kr2/antal. En femte form ville falde
       igennem til num() og vise ører som et antal. */
    const kan = new Set(["antal", "pct", "kr", "kr2"]);
    for (const w of WIDGETS) assert.ok(kan.has(w.form), `${w.key}: ${w.form}`);
    const skaerm = readFileSync("src/moduler/Dashboard.jsx", "utf8");
    for (const f of kan) {
      if (f === "antal") continue;
      assert.ok(skaerm.includes(`w.form === "${f}"`),
        `skærmen kender ikke formen "${f}"`);
    }
  });

  it("⚠ ØRER FORMATERES SOM ØRER — feltnavnet og formen skal passe sammen", () => {
    /* Et felt der hedder …Oere og formateres som `antal`, ville skrive
       "1.240.000" hvor der stod 12.400,00 kr. Og omvendt: kr() på et antal
       ganger med hundrede i den forkerte retning. */
    for (const w of WIDGETS) {
      const oere = /Oere$/.test(w.felt);
      const beloeb = w.form === "kr" || w.form === "kr2";
      assert.equal(oere, beloeb,
        `${w.key}: feltet er "${w.felt}" men formen er "${w.form}"`);
    }
    for (const w of WIDGETS) {
      if (/Pct$/.test(w.felt)) assert.equal(w.form, "pct", w.key);
    }
  });
});

describe("grupperne", () => {
  it("⚠ HVER WIDGET HØRER TIL ET RIGTIGT MODUL — ingen egne navne", () => {
    /* Et eget navnerum her ville betyde en oversættelsestabel mere, og den
       slags driver. Gruppens overskrift slås op i MODUL. */
    for (const w of WIDGETS) {
      assert.ok(ALLE_MODULER.includes(w.modul),
        `${w.key} hører til "${w.modul}", som ikke er et modul i moduler.js`);
    }
  });

  it("⚠ INGEN WIDGET SLIPPER UDEN OM MODULTJEKKET", () => {
    /* Her stod et særtilfælde for `oekonomi`, bygget på en påstand der var
       forkert: at Økonomi "ikke er et modul, men et KPI-domæne". Det ER et
       modul i moduler.js, det er sælgeligt, og det er ikke `altid`.
       Særtilfældet ville have tilbudt en kunde uden Økonomi to widgets med
       driftsomkostninger og ikke-faktureret beløb — netop de tal han ikke har
       købt en skærm til. Prøven her er hele grunden til at den blev fundet. */
    assert.deepEqual(tilgaengeligeWidgets(() => false), [],
      "en widget kan vælges uden at kunden har modulet");
  });

  it("et fravalgt modul tager sine widgets med", () => {
    const kun = tilgaengeligeWidgets((m) => m === "flaade").map((w) => w.modul);
    assert.deepEqual([...new Set(kun)], ["flaade"]);
  });

  it("hvert modul med widgets har en label i MODUL", () => {
    /* Uden den stod gruppen med sin nøgle — "flaade" i stedet for "Fleet". */
    for (const m of new Set(WIDGETS.map((w) => w.modul))) {
      assert.ok(MODUL[m]?.label, `modulet "${m}" har intet navn`);
    }
  });
});

describe("standardlayout", () => {
  it("⚠ ET LAYOUT DER IKKE ER SAT, ER IKKE ET TOMT LAYOUT", () => {
    /* En bruger der aldrig har rørt skærmen, skal se noget fornuftigt — ikke
       en tom side med "træk en widget hertil". */
    assert.ok(standardlayout(SAMLET, alle).length > 0);
    assert.ok(standardlayout("flaade", alle).length > 0);
  });

  it("et modul-dashboard viser kun sine egne widgets", () => {
    for (const key of standardlayout("facility", alle)) {
      assert.equal(widget(key).modul, "facility");
    }
  });

  it("det samlede tager højst to fra hvert modul", () => {
    const pr = {};
    for (const key of standardlayout(SAMLET, alle)) {
      pr[widget(key).modul] = (pr[widget(key).modul] || 0) + 1;
    }
    for (const [m, n] of Object.entries(pr)) assert.ok(n <= 2, `${m}: ${n}`);
  });

  it("⚠ STANDARDEN KAN GEMMES", () => {
    /* Ellers ville en bruger der trykker "Nulstil", få et udkast serveren
       afviser — og knappen ville se ud som om den var i stykker.

       ⚠ HER STOD OGSÅ "OVERHOLDER LOFTET". Loftet er væk: det var en
       smagsdom, ikke en kendsgerning om systemet. Det der er tilbage, er
       valideLayout() — og den er den rigtige prøve, for den er den serveren
       spejler. */
    for (const d of ALLE_DASHBOARDS) {
      const l = standardlayout(d, alle);
      assert.equal(valideLayout(l).ok, true, `${d}: ${valideLayout(l).fejl}`);
    }
  });
});

describe("valideLayout", () => {
  it("godtager et almindeligt layout", () => {
    assert.equal(valideLayout([]).ok, true);
    assert.equal(valideLayout(["nedetid", "aabneOpgaver"]).ok, true);
  });

  it("afviser en ukendt widget — og navngiver den", () => {
    const r = valideLayout(["findesIkke"]);
    assert.equal(r.ok, false);
    assert.match(r.fejl, /findesIkke/);
  });

  it("afviser den samme widget to gange", () => {
    /* To ens kort ved siden af hinanden ligner en fejl i tallet, ikke i
       layoutet. */
    assert.equal(valideLayout(["nedetid", "nedetid"]).ok, false);
  });

  it("⚠ TAGER HELE KATALOGET — der er intet loft på antallet", () => {
    /* Det er brugerens egen skærm. En grænse han ikke kan hæve, er en
       beslutning taget på hans vegne uden anden begrundelse end smag —
       og den stod håndhævet både her og i firebase.rules.json. */
    assert.equal(valideLayout(ALLE_WIDGETS).ok, true,
      valideLayout(ALLE_WIDGETS).fejl);
    assert.equal(ALLE_WIDGETS.length, ANTAL_WIDGETS);
  });

  it("⚠ OG KATALOGET ER STADIG GRÆNSEN", () => {
    /* Uden loft er det dubletreglen og navnetjekket der binder: et layout
       kan ikke blive længere end der er widgets. En ubegrænset liste af
       gyldige nøgler findes ikke. */
    assert.equal(valideLayout([...ALLE_WIDGETS, ALLE_WIDGETS[0]]).ok, false);
    assert.equal(valideLayout([...ALLE_WIDGETS, "findesIkke"]).ok, false);
  });

  it("afviser noget der ikke er en liste", () => {
    for (const v of [null, undefined, {}, "nedetid", 7]) {
      assert.equal(valideLayout(v).ok, false, String(v));
    }
  });
});

describe("⚠ null OG [] ER IKKE DET SAMME", () => {
  it("aldrig gemt → standarden", () => {
    assert.deepEqual(layoutFor(null, "flaade", alle), standardlayout("flaade", alle));
    assert.deepEqual(layoutFor(undefined, "flaade", alle), standardlayout("flaade", alle));
  });

  it("gemt tomt → tomt", () => {
    /* Kom standarden tilbage næste gang man besøgte siden, ville
       gemmeknappen se ud som om den ikke virkede. */
    assert.deepEqual(layoutFor([], "flaade", alle), []);
  });

  it("en widget fra et fravalgt modul springes over", () => {
    /* Et gemt layout kan bære en widget fra et modul der siden er fravalgt —
       og den ville ellers vise et tal fra noget kunden ikke har købt. */
    const ud = layoutFor(["nedetid", "aabneFejl"], SAMLET, (m) => m === "flaade");
    assert.deepEqual(ud, ["nedetid"]);
  });

  it("en widget vi har fjernet, efterlader ikke et hul", () => {
    assert.deepEqual(layoutFor(["nedetid", "fandtesEngang"], SAMLET, alle), ["nedetid"]);
  });

  it("rækkefølgen er brugerens, ikke katalogets", () => {
    /* Hele pointen med at kunne bygge sit eget layout. Sorterede vi efter
       kataloget, ville trækket ikke gøre noget der overlevede et gensyn. */
    assert.deepEqual(layoutFor(["nedetid", "aabneOpgaver"], SAMLET, alle),
      ["nedetid", "aabneOpgaver"]);
    assert.deepEqual(layoutFor(["aabneOpgaver", "nedetid"], SAMLET, alle),
      ["aabneOpgaver", "nedetid"]);
  });
});

describe("⚠ DEN ENESTE NODE BRUGEREN SELV SKRIVER", () => {
  const node = () => regler().rules.tenants.$tenantId.brugerlayout;

  it("brugerlayout findes i reglerne", () => {
    assert.ok(node(), "brugerlayout/ mangler i firebase.rules.json");
  });

  it("⚠ auth.uid === $uid — ikke bare tenant-medlemskab", () => {
    /* Uden det led kunne enhver i virksomheden rette sine kollegers forside.
       Det lækker ingenting, men det er en ændring ingen kan forklare. */
    const w = node().$uid[".write"];
    assert.equal(typeof w, "string", "der er ingen skriveregel på $uid");
    assert.ok(w.includes("auth.uid === $uid"),
      "skrivereglen binder ikke posten til brugeren selv: " + w);
  });

  it("skrivningen ligger på $uid og ikke på noden", () => {
    /* En .write på noden selv ville kaskadere: én bruger kunne skrive HELE
       brugerlayout/, og $uid-reglen ville aldrig blive spurgt. */
    assert.equal(node()[".write"], undefined,
      "der står en .write på brugerlayout/ — den kaskaderer ned over alle uid'er");
  });

  it("reglen kræver login, tenant og aktivt abonnement", () => {
    const w = node().$uid[".write"];
    assert.ok(w.includes("auth != null"));
    assert.ok(w.includes("auth.token.tenant === $tenantId"));
    assert.ok(w.includes("abonnement"));
  });

  it("⚠ REGLEN KENDER DE SAMME DASHBOARDS SOM KATALOGET", () => {
    /* Mønstret i regelfilen er en afskrift. Kommer der et dashboard mere uden
       at reglen får det, afviser serveren et layout skærmen tilbyder. */
    const m = node().$uid.$dashboard[".validate"];
    const inder = m.slice(m.indexOf("^(") + 2, m.indexOf(")$"));
    assert.deepEqual(inder.split("|").sort(), [...ALLE_DASHBOARDS].sort(),
      `regelfilen kender ${inder} — dashboards.js kender ${ALLE_DASHBOARDS}`);
  });

  it("⚠ REGLEN HAR HELLER INTET LOFT PÅ PLADSEN", () => {
    /* Loftet stod BEGGE steder, og reglen var den der bandt: pladserne var
       talt til elleve i et mønster. Havde vi kun fjernet tallet i widgets.js,
       ville serveren have afvist en widget skærmen lod brugeren sætte ind —
       og fejlen ville komme ved GEM, ikke ved klikket. */
    const v = node().$uid.$dashboard.$i[".validate"];
    const m = /\$i\.matches\(\/([^/]+)\//.exec(v);
    assert.ok(m, "reglen prøver ikke pladsen længere");
    const re = new RegExp(m[1]);
    /* Hver plads kataloget kan fylde — og et stykke over, for at vise at
       det ikke er et loft men en FORM. */
    for (const i of [0, 5, 11, 12, ANTAL_WIDGETS, ANTAL_WIDGETS + 50]) {
      assert.ok(re.test(String(i)), `reglen afviser plads ${i}`);
    }
    /* Men det skal stadig VÆRE en plads — ikke et navn. */
    for (const ikke of ["a", "-1", "1.5", ""]) {
      assert.ok(!re.test(ikke), `reglen tager "${ikke}" som en plads`);
    }
  });
});

describe("skærmen", () => {
  const skaerm = readFileSync("src/moduler/Dashboard.jsx", "utf8");

  it("⚠ SKRIVER GENNEM skriv.js, IKKE db.ref()", () => {
    /* Én vej ind, som der er én vej ud i useListe. Ellers bygger hver skærm
       sin egen fejlhåndtering, og en afvist skrivning bliver til "prøv igen"
       i stedet for en forklaring. */
    assert.match(skaerm, /import \{ gem \} from "\.\.\/fleet\/skriv\.js"/);
    /* ⚠ IMPORTEN, IKKE ORDET. En prøve på selve strengen "db.ref(" fældede
       min egen kommentar om ikke at bruge db.ref() — og en prøve der fejler
       på en advarsel mod fejlen, lærer den næste at slette advarslen. */
    assert.doesNotMatch(skaerm, /from "\.\.\/firebase\.js"/,
      "skærmen henter databasen direkte og går uden om skriv.js");
  });

  it("⚠ VALIDERER MED DEN SAMME FUNKTION SOM SERVEREN PRØVER FORMEN MED", () => {
    assert.match(skaerm, /valideLayout\(/);
  });

  it("⚠ TASTATURET KAN DET SAMME SOM MUSEN", () => {
    /* Træk-og-slip alene er ubrugeligt for den der ikke kan bruge en mus, og
       et layout man ikke kan rette, er et layout man ikke har. Begge veje
       kalder den SAMME flytWidget — to flytterutiner ville før eller siden
       flytte forskelligt. */
    assert.match(skaerm, /onDrop=/, "der er ingen træk-og-slip");
    assert.match(skaerm, /paaFlyt\(nr, nr - 1\)/, "der er ingen knap til venstre");
    assert.match(skaerm, /paaFlyt\(nr, nr \+ 1\)/, "der er ingen knap til højre");
    assert.match(skaerm, /aria-label=\{"Flyt "/, "knapperne har ingen navne");
  });

  it("kortene har ikke deres egne tal", () => {
    /* Dashboardet henter ingen moduldata. Regnede en widget sit eget tal,
       måtte skærmen hente den nodes data ned for hver valgt widget. */
    assert.match(skaerm, /kpiVaerdi\(kpi, w\.felt\)/);
  });
});
