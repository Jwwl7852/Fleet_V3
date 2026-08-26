/* test/moduler.test.mjs
 * Modulafkrydsningen — og hvad den IKKE er.
 *
 * ⚠ EN KOMMERCIEL KONTROL, IKKE EN SIKKERHEDSKONTROL.
 *
 * Det er værd at fastholde mekanisk, fordi de to bliver blandet sammen: man
 * skjuler et menupunkt og tror man har lukket noget. En kunde uden Facility
 * der taster /facility, ser SIN EGEN tomme facility-node — en salgsflade,
 * ikke et databrud. At kunder ikke kan nå HINANDENS data er en anden
 * mekanisme, prøvet i rules.tenant.test.mjs og rules.udbyder.test.mjs.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* Samme vandring som demo-kilder-linten. Den ligger her frem for i en delt
   hjælpefil, fordi to prøvefiler der deler en hjælper, skal indlæses i den
   rigtige rækkefølge — og en prøve skal kunne køres alene. */
function alleFiler(mappe) {
  const ud = [];
  for (const navn of readdirSync(mappe)) {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) ud.push(...alleFiler(sti));
    else if (/\.(js|jsx)$/.test(navn)) ud.push(sti);
  }
  return ud;
}

import {
  MODUL, ALLE_MODULER, VALGFRIE_MODULER, OBLIGATORISKE_MODULER, UDEN_SKAERM,
  harModul, modulsaet, ukendteModuler,
} from "../src/fleet/moduler.js";
import { NAV, ALLE, REDIRECTS } from "../src/fleet/nav.js";

describe("modulkataloget svarer til menuen", () => {
  it("hvert modul peger på et navKey der findes", () => {
    /* Ellers filtrerer AppShell på et navn ingen menupunkt har, og modulet
       kan hverken skjules eller vises.

       ⚠ UDEN_SKAERM ER UNDTAGET, OG DET ER EN SYNLIG UNDTAGELSE. Et modul
       kan sælges og prissættes før dets skærme findes — men det må ikke
       tegnes i sidebaren, for et menupunkt der fører til ingenting, lover
       noget produktet ikke kan. Navnet står i moduler.js, ikke her, så det
       er koden der siger hvad der mangler. */
    /* ⚠ MINDST ÉT MENUPUNKT — IKKE NØDVENDIGVIS ET ØVERST.
       Prøven så før kun på topniveauet. Da kundekartoteket og de to
       prisskærme flyttede til Opsætning som stamdata, blev `kunder` det
       første modul uden et hovedpunkt — og en prøve der insisterede på
       topniveauet, ville have tvunget et tomt menupunkt frem bare for at
       blive grøn. Kravet der betyder noget, er at navKey PEGER PÅ NOGET:
       gør den ikke det, kan modulet hverken vises eller skjules, og fejlen
       kaster ikke — punktet forsvinder bare, for alle. */
    const navKeys = new Set(NAV.flatMap((m) => [m.key, ...(m.born || []).map((b) => b.key)]));
    for (const m of ALLE_MODULER) {
      if (UDEN_SKAERM.includes(m)) {
        assert.ok(!navKeys.has(MODUL[m].navKey),
          `${m} står i UDEN_SKAERM, men har et menupunkt. Fjern det ene af de to.`);
        continue;
      }
      assert.ok(navKeys.has(MODUL[m].navKey), `${m} peger på "${MODUL[m].navKey}"`);
    }
  });

  /* ⚠ FAKTURAER & BILAG ER MED VILJE UDEN MODUL — Skive 2A. Se punktets
     egen kommentar i nav.js: `fakturaer/` har bevidst ingen modulklausul, så
     en kunde UDEN Økonomi-modulet stadig kan se sine fakturaer gennem
     Procures linse (beslutning 86). Adgangen afgøres udelukkende af
     `kraeverPerm: "indkoeb.laes"` — en prøve for netop det står i
     navadgang.test.mjs. Dette er IKKE en glemt modulklausul; det er samme
     bevidste undtagelse som noden selv har i firebase.rules.json.

     ⚠ SKIVE 4B — leverandoerer ER SAMME MØNSTER. Noden mistede sin
     modulklausul og fik `kraeverPerm: "leverandoerer.laes"` i stedet — den
     læses af elleve skærme uden for Procure, og adgangen afgøres udelukkende
     af permissionen, ikke af et modul. */
  const UDEN_MODUL_MED_GRUND = new Set(["fakturacenter", "leverandoerer"]);

  it("hvert HOVEDpunkt har et modul", () => {
    /* Et menupunkt uden modul kan ikke sælges — og kan heller ikke skjules
       for den kunde der ikke har købt det. Det gælder topniveauet, som
       AppShell filtrerer på `m.kraeverModul || m.key` (Skive 2A — se
       AppShell.jsx); et BARN filtreres på `kraeverModul`, og det har sin
       egen prøve længere nede. */
    const modulNav = new Set(ALLE_MODULER.map((m) => MODUL[m].navKey));
    for (const m of NAV) {
      if (UDEN_MODUL_MED_GRUND.has(m.key)) continue;
      assert.ok(modulNav.has(m.key) || ALLE_MODULER.includes(m.key),
        `menupunktet "${m.key}" har intet modul`);
    }
  });

  it("⚠ UDEN_MODUL_MED_GRUND STÅR IKKE FOR EVIGT", () => {
    /* Hver undtagelse skal pege på et punkt der faktisk findes, og faktisk
       mangler et modul — ellers samler listen sig med aftaler ingen læser. */
    for (const k of UDEN_MODUL_MED_GRUND) {
      const punkt = NAV.find((m) => m.key === k);
      assert.ok(punkt, `UDEN_MODUL_MED_GRUND peger på "${k}", som ikke findes i NAV`);
      const modulNav = new Set(ALLE_MODULER.map((m) => MODUL[m].navKey));
      assert.ok(!modulNav.has(k) && !ALLE_MODULER.includes(k),
        `"${k}" har fået et modul — fjern undtagelsen`);
    }
  });

  it("⚠ ET MODUL UDEN HOVEDPUNKT SKJULES AF SINE BØRN", () => {
    /* Det konkrete tilfælde skrevet ud. AppShell filtrerer topniveauet på
       `m.key` og børnene på `kraeverModul`. Har et modul ingen af delene,
       er der intet der skjuler det for den kunde der ikke har købt det —
       og et menupunkt i Opsætning, som er `altid: true`, ville åbne en
       afvist læsning hos enhver. */
    const topKeys = new Set(NAV.map((m) => m.key));
    const alleBoern = NAV.flatMap((m) => m.born || []);
    for (const m of ALLE_MODULER) {
      if (MODUL[m].altid || topKeys.has(MODUL[m].navKey)) continue;
      const boern = alleBoern.filter((b) => b.kraeverModul === m);
      assert.ok(boern.length > 0,
        `modulet "${m}" har hverken et hovedpunkt eller et barn med ` +
        `kraeverModul — intet i menuen kan skjules for den der ikke har det`);
      /* Og så SKAL hvert eneste af modulets punkter bære leddet. Glemmes det
         på ét, er netop dét punkt synligt for alle. */
      const modulets = alleBoern.filter((b) => b.sti.startsWith("/opsaetning/")
        && boern.some((x) => x.key === b.key));
      assert.equal(modulets.length, boern.length);
    }
  });
});

describe("de obligatoriske moduler kan ikke fravælges", () => {
  it("dashboard, support og opsætning er altid med", () => {
    /* Et system uden forside er ikke et system, og en kunde der har fravalgt
       Opsætning kan ikke se sine egne brugere. */
    for (const m of ["dashboard", "support", "opsaetning"]) {
      assert.equal(MODUL[m].altid, true, m);
      assert.ok(OBLIGATORISKE_MODULER.includes(m));
      assert.ok(!VALGFRIE_MODULER.includes(m));
    }
  });

  it("harModul siger ja til dem selv når modullisten siger nej", () => {
    assert.equal(harModul({ dashboard: false }, "dashboard"), true);
    assert.equal(harModul({}, "opsaetning"), true);
  });

  it("modulsaet tager dem altid med", () => {
    const s = modulsaet(["flaade"]);
    for (const m of OBLIGATORISKE_MODULER) assert.equal(s[m], true, m);
    assert.equal(s.flaade, true);
    assert.equal(s.facility, undefined);
  });
});

describe("harModul fejler ÅBENT — modsat permissions", () => {
  it("en manglende modulliste giver alt", () => {
    /* ⚠ MED VILJE, og forskellen på de to er hvad et hul BETYDER.
       En manglende permission betyder "du må ikke" — fejler den åbent,
       giver man adgang til noget nogen skulle have stoppet.
       En manglende modulliste betyder "vi ved ikke hvad kunden har købt",
       typisk fordi noden ikke er skrevet endnu. Fejler den lukket, står en
       betalende kunde med en tom sidebar og tror systemet er væk. */
    assert.equal(harModul(null, "facility"), true);
    assert.equal(harModul(undefined, "flaade"), true);
  });

  it("men en liste der findes, gælder", () => {
    const kun = { dashboard: true, flaade: true };
    assert.equal(harModul(kun, "flaade"), true);
    assert.equal(harModul(kun, "facility"), false);
    assert.equal(harModul(kun, "indkoeb"), false);
  });

  it("et ukendt modulnavn er ikke købt", () => {
    assert.equal(harModul({ flaade: true }, "rumfart"), false);
  });
});

describe("ukendte moduler afvises ved oprettelse", () => {
  it("navngiver dem der ikke findes", () => {
    assert.deepEqual(ukendteModuler(["flaade", "rumfart", "facility"]), ["rumfart"]);
    assert.deepEqual(ukendteModuler([]), []);
  });

  it("modulsaet tager kun dem der findes med", () => {
    /* Ellers ville en tastefejl i --moduler lande i basen som et modul
       ingen skærm kender, og det ville se ud som om kunden havde købt det. */
    const s = modulsaet(["flaade", "rumfart"]);
    assert.equal(s.rumfart, undefined);
    assert.equal(s.flaade, true);
  });
});

describe("moduler.js kan deles", () => {
  it("har ingen imports", () => {
    /* Som permissions.js og steder.js: baade klienten, provisioneren og en
       fremtidig udbyderfunktion skal bruge samme katalog, og en delt fil med
       imports kan ikke kopieres ind i functions/. */
    const kilde = readFileSync(new URL("../src/fleet/moduler.js", import.meta.url), "utf8");
    assert.doesNotMatch(kilde, /^\s*import\s/m, "moduler.js har et import");
  });
});

describe("hvert menupunkt har et ikon", () => {
  /* ⚠ HVORFOR DEN HER FILDEL BLEV SKREVET.
     Unitbooking stod i sidebaren i tre etaper UDEN ikon. Alle de andre punkter
     havde et, og det manglende så ud som en tom plads — men intet fejlede,
     fordi `<path d={undefined} />` er gyldig SVG der bare tegner ingenting.

     Fælden er at ikonerne ligger i TO forskellige maps: `IKON` i ui.jsx er
     FYLDTE ikoner til kort og nøgletal, mens `ICO` i AppShell.jsx er
     STREGTEGNEDE til sidebaren. At have lagt et ikon i det ene siger intet
     om det andet, og navnet er ikke engang det samme.

     Prøven læser AppShell.jsx som tekst, fordi filen er JSX og importerer
     React-ting der ikke kan indlæses i Node. */
  const kilde = readFileSync("src/fleet/AppShell.jsx", "utf8");
  const blok = kilde.slice(kilde.indexOf("const ICO = {"));
  const noegler = new Set(
    [...blok.slice(0, blok.indexOf("};")).matchAll(/^\s{2}([a-zA-Z]+):/gm)]
      .map((m) => m[1]));

  it("kender hvert hovedpunkt i NAV", () => {
    for (const m of NAV) {
      assert.ok(noegler.has(m.key),
        `ICO i AppShell.jsx mangler "${m.key}" — menupunktet tegnes uden ikon, ` +
        `og en tom <path d={undefined}> fejler ikke af sig selv`);
    }
  });

  it("har ingen ikoner tilovers", () => {
    /* Den anden vej: et ikon til et punkt der er fjernet, er en rest ingen
       opdager — idébanken efterlod netop sådan en (beslutning 22). */
    const navKeys = new Set(NAV.map((m) => m.key));
    for (const k of noegler) {
      assert.ok(navKeys.has(k), `ICO har "${k}", som ikke er et menupunkt`);
    }
  });
});

describe("hvert menupunkt fører et sted hen", () => {
  /* ⚠ HVORFOR DEN HER FILDEL BLEV SKREVET.
     Warehouse stod i sidebaren med fem undermenupunkter, og INGEN af dem
     havde en rute i App.jsx. Klikkede man, kom der en tom side.

     Hverken `npm run build` eller de 1096 prøver kunne se det: komponenterne
     var gyldige filer, de blev bare aldrig importeret, og en manglende rute
     er ikke en syntaksfejl. Fejlen opstod fordi fem `String.replace()`-ankre
     pegede på et komponentnavn der var omdøbt i en tidligere omgang — og
     replace() fejler TAVST når ankeret ikke findes.

     nav.js er ment som ÉN kilde til sidebar og ruter (se filens eget hoved).
     Prøven her er dét løfte, gjort mekanisk. */
  const app = readFileSync("src/App.jsx", "utf8");
  const ruter = new Set(
    [...app.matchAll(/<Route\s+path="([^"]*)"/g)].map((m) => m[1]));

  /* ⚠ FORSIDEN ER EN <Route index>, IKKE EN path="". React Router skelner, og
     en prøve der ikke gjorde det, ville kræve at nogen skrev path="" for at
     blive grøn — hvilket ville være forkert. */
  const harIndeks = /<Route\s+index/.test(app);
  const somRute = (sti) => sti.replace(/^\//, "");
  const harRute = (sti) => (sti === "/" ? harIndeks : ruter.has(somRute(sti)));

  const alleNavpunkter = NAV.flatMap((m) => [m, ...(m.born || [])]);

  it("hvert nav-punkt har en Route", () => {
    const mangler = [];
    for (const p of alleNavpunkter) {
      /* Parametriserede stier står med :id både i nav og i ruten. */
      if (!harRute(p.sti)) mangler.push(`${p.key} → ${p.sti}`);
    }
    assert.deepEqual(mangler, [],
      "menupunkter uden rute — de giver en tom side når man klikker");
  });

  it("hvert modul med skærm har en rute", () => {
    /* Den grovere kontrol ved siden af: står et modul i UDEN_SKAERM, må det
       ikke have et menupunkt; står det ikke, SKAL hovedpunktet føre et sted
       hen. */
    for (const m of NAV) {
      if (UDEN_SKAERM.includes(m.key)) continue;
      assert.ok(harRute(m.sti), `App.jsx har ingen rute til modulet ${m.key}`);
    }
  });
});


describe("et underpunkt der låner en anden modulnode", () => {
  /* ⚠ HVORFOR DEN HER BLEV SKREVET.
     Enheder flyttede fra Fleet til Opsætning, fordi Fleets menu kun skal vise
     det personalet ARBEJDER i. Men noden er stadig `koeretoejer`, som er
     modulspærret på `flaade` i firebase.rules.json — og Opsætning er
     `altid: true` og kan ikke fravælges. Uden `kraeverModul` ville en kunde
     der ALDRIG har købt Fleet, få et menupunkt i sin egen opsætning der åbner
     en afvist læsning.

     En permission-denied er reglerne der VIRKER. Den skal bare ikke
     fremprovokeres af en menu vi selv har tegnet. */
  const alleBoern = NAV.flatMap((m) => m.born || []);

  it("kraeverModul peger på et modul der findes", () => {
    /* Samme fejlklasse som navKey ovenfor: et filter på et navn ingen modul
       har, er ikke en fejl der kaster — punktet forsvinder bare, for ALLE, og
       ingen ser hvornår det skete. */
    for (const b of alleBoern) {
      if (!b.kraeverModul) continue;
      assert.ok(ALLE_MODULER.includes(b.kraeverModul),
        `nav-punktet "${b.key}" kræver modulet "${b.kraeverModul}", som ikke findes i moduler.js`);
    }
  });

  it("⚠ ENHEDER KRÆVER FLEET, SELV OM DET LIGGER UNDER OPSÆTNING", () => {
    /* Det konkrete tilfælde skrevet ud. Flytter nogen punktet tilbage — eller
       fjerner leddet under en oprydning — falder prøven her og ikke først hos
       den kunde der ikke har Fleet. */
    const enheder = alleBoern.find((b) => b.key === "enheder");
    assert.ok(enheder, "nav-punktet \"enheder\" findes ikke længere");
    assert.equal(enheder.kraeverModul, "flaade");
    assert.equal(enheder.sti, "/opsaetning/enheder");
  });

  it("et punkt under sit EGET modul kræver ikke et led", () => {
    /* Den anden vej. `kraeverModul` på et barn der allerede ligger under det
       modul, er støj: hovedpunktet er filtreret i forvejen, og et led der
       aldrig kan være falsk, læses som om det betød noget. */
    for (const m of NAV) {
      for (const b of m.born || []) {
        if (!b.kraeverModul) continue;
        assert.notEqual(b.kraeverModul, m.key,
          `"${b.key}" kræver "${b.kraeverModul}", som er dets eget modul — leddet kan aldrig være falsk`);
      }
    }
  });
});

describe("topbaren har ingen kontroller", () => {
  /* ⚠ HER STOD EN PRØVE OM skjulFirma/skjulPeriode.
     De to flag skjulte firma- og periodevælgeren på Fleets skærme. Nu er de
     tre kontroller — firmavælger, periodevælger og "Opdateret 22.43" —
     fjernet fra HVER side, og et flag der altid er sandt, er en mekanisme
     uden variation.

     Prøven vender derfor: den holder fast i at de ikke kommer igen, og især
     at de ikke kommer igen ET STED. Reglen fra CLAUDE.md står ved magt — et
     modul må ikke bygge sin egen sidebar, tenant-vælger eller periodevælger
     — og den er nu lettere at bryde, fordi shellen ikke længere har en at
     kopiere fra. */
  const shell = readFileSync("src/fleet/AppShell.jsx", "utf8");

  it("⚠ SHELLEN TEGNER HVERKEN FIRMA- ELLER PERIODEVÆLGER", () => {
    assert.doesNotMatch(shell, /aria-label="Virksomhed"/,
      "firmavælgeren er tilbage i topbaren");
    assert.doesNotMatch(shell, /aria-label="Periode"/,
      "periodevælgeren er tilbage i topbaren");
    assert.doesNotMatch(shell, /fc-stamp/,
      "\"Opdateret\"-stemplet er tilbage i topbaren");
  });

  it("⚠ OG INGEN SKÆRM BYGGER SIN EGEN", () => {
    /* Det er den fejl reglen findes for. Shellen har ikke længere en vælger
       at kopiere, og så er fristelsen til at bygge en i et modul større. */
    const moduler = alleFiler("src/moduler");
    const synder = [];
    for (const sti of moduler) {
      const kilde = readFileSync(sti, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of kilde.matchAll(/aria-label="(Virksomhed|Periode)"/g)) {
        /* ⚠ DET ER <select>EN DER ER SHELLENS, IKKE ORDET.
           Foerste udgave ledte efter etiketten hvor som helst — og faeldede
           Fravaer, som har en FANERAEKKE med det navn (role="tablist"). En
           proeve der faelder noget rigtigt, bliver slaaet fra. Og
           Dashboardets egen dashboard-vaelger er ogsaa en <select> med
           className="fc-ctl", saa stylingen er heller ikke signalet. Det er
           KOMBINATIONEN af et select og shellens to etiketter. */
        const foer = kilde.slice(Math.max(0, m.index - 200), m.index);
        const sidsteTag = foer.lastIndexOf("<");
        if (sidsteTag >= 0 && foer.slice(sidsteTag).startsWith("<select")) {
          synder.push(`${sti} (${m[1]})`);
        }
      }
    }
    assert.deepEqual(synder, [],
      "et modul tegner sin egen tenant- eller periodevælger — shellen ejer dem");
  });

  it("⚠ FLAGENE ER VÆK FRA nav.js — ikke bare sat til false", () => {
    /* Et flag ingen læser, er en mekanisme der ser ud som om den virker. */
    const nav = readFileSync("src/fleet/nav.js", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(nav, /skjulFirma|skjulPeriode/,
      "nav.js bærer stadig et flag AppShell ikke læser");
  });
});

describe("⚠ EN FLYTNING MÅ IKKE SLÅ ET LINK IHJEL", () => {
  /* ⚠ HVORFOR DEN HER BLEV SKREVET.
     REDIRECTS havde ingen prøve. Tabellen findes for at v1.4-links, bogmærker
     og stier i gamle mails overlever en menuomlægning — og den blev brugt
     tre gange på én uge: Live-kort → Rute & status, Enheder → Opsætning, og
     nu kundekartoteket og de to prisskærme.

     En redirect fejler tavst i begge retninger. Peger `til` et sted der ikke
     findes, lander brugeren på catch-all'en og dermed på forsiden — det ser
     ud som et forældet link. Og lever `fra` stadig som en RIGTIG rute, når
     redirecten aldrig frem, fordi den første match vinder. Ingen af delene
     kaster. */
  const app = readFileSync("src/App.jsx", "utf8");
  const ruter = new Set(
    [...app.matchAll(/<Route\s+path="([^"]*)"/g)].map((m) => m[1]));
  const stier = new Set(ALLE.map((m) => m.sti));

  it("hver redirect peger på en sti der findes i nav.js", () => {
    for (const r of REDIRECTS) {
      assert.ok(stier.has(r.til),
        `redirecten ${r.fra} peger på "${r.til}", som ikke er et menupunkt — ` +
        `brugeren lander på catch-all'en og dermed på forsiden`);
    }
  });

  it("⚠ OG DEN GAMLE STI ER IKKE OGSÅ EN RIGTIG RUTE", () => {
    /* Var den det, ville skærmen kunne nås ad TO veje — og så er der to
       steder at rette den dag stien flytter igen. Det var netop grunden til
       at /flaade/vaerksted blev en redirect og ikke fik lov at blive
       stående som rute. */
    for (const r of REDIRECTS) {
      assert.ok(!stier.has(r.fra),
        `"${r.fra}" er både en redirect og et menupunkt i nav.js`);
      /* Redirecterne LÆGGES af REDIRECTS.map() og står derfor ikke som
         literal <Route path="…"> i filen. Gør en af dem det alligevel, er
         den skrevet i hånden ved siden af — og den vinder, fordi den første
         match tæller. */
      assert.ok(!ruter.has(r.fra.replace(/^\//, "")),
        `"${r.fra}" står som en håndskrevet rute i App.jsx OGSÅ — den vinder ` +
        `over redirecten, og så er skærmen nået ad to veje`);
    }
  });

  it("⚠ ET ID I DEN ENE ENDE SKAL VÆRE I DEN ANDEN", () => {
    /* <Navigate to="/opsaetning/aftalepriser"> ville sende hvert eneste
       kundeprislink til den TOMME oversigt, og fejlen ville se ud som et
       forældet link frem for en redirect der tabte noget. Videresend() i
       App.jsx bygger målet af de samme parametre — så skal de også hedde
       det samme i begge ender. */
    const params = (sti) => sti.split("/").filter((d) => d.startsWith(":")).sort();
    for (const r of REDIRECTS) {
      assert.deepEqual(params(r.til), params(r.fra),
        `${r.fra} → ${r.til} taber eller opfinder en parameter`);
    }
    assert.match(app, /function Videresend\(/,
      "App.jsx bruger <Navigate> direkte — en redirect med et id taber det");
  });

  it("de gamle stamdatastier lever", () => {
    /* Det konkrete tilfælde skrevet ud. De fem stier har stået i sidebaren
       siden v3.0 og ligger i bogmærker og i mindst én supportsags kontekst. */
    const fra = new Set(REDIRECTS.map((r) => r.fra));
    for (const gammel of [
      "/bemanding/medarbejdere", "/kunder", "/kunder/priser",
      "/kunder/aftalepriser", "/kunder/aftalepriser/:kundeId",
    ]) {
      assert.ok(fra.has(gammel), `${gammel} er død — der er ingen redirect`);
    }
  });
});
