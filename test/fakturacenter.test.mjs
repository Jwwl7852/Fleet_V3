/* test/fakturacenter.test.mjs
 * Ét fælles Fakturacenter — beslutning 86.
 *
 * ⚠ HVAD DEN HER PRØVE HOLDER FAST I:
 *
 *   1. **Ingen ny node.** `fakturaer/` ER den fælles node, og den har med
 *      vilje ingen modulklausul. En `fakturacenter/`-node ville være den samme
 *      kendsgerning to steder.
 *   2. **Destinationen er ÉT felt-par, ikke ét pr. modul.** `ordreId` var ét
 *      moduls svar på et fælles spørgsmål.
 *   3. **Modulerne afgør hvad der foreslås.** En kunde uden Facility ser
 *      aldrig en facility-destination.
 *   4. **Kun et nummer giver 100 %.** Alt andet er en slutning.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DESTINATIONSART, ALLE_DESTINATIONSARTER, PEGENDE_ARTER, DESTINATIONSSIGNAL,
  FAKTURAKILDE, CENTERTILSTAND, MINDSTE_SCORE,
  foreslaaDestination, centertilstand, kanSaetteDestination, destinationstekst,
  afvigelseOere, scorAf,
} from "../src/fleet/fakturacenter.js";
import { DEMO_FAKTURAER } from "../src/fleet/demo-indkoeb.js";
import { DEMO_OPGAVER } from "../src/fleet/demo-opgaver.js";
import { DEMO_KOERETOEJER } from "../src/fleet/demo-flaade.js";
import { DEMO_AKTIVER } from "../src/fleet/demo-facility.js";
import { DEMO_INDKOEBSORDRER } from "../src/fleet/demo-procure.js";
import { DEMO_FORBRUGSVARER } from "../src/fleet/demo-forbrugsvarer.js";
import { ALLE_MODULER } from "../src/fleet/moduler.js";

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SKAERM = udenKommentarer([
  "src/moduler/oekonomi/Fakturacenter.jsx",
  "src/moduler/oekonomi/FakturacenterPrototypeDele.jsx",
  "src/moduler/oekonomi/FakturacenterWorkspace.jsx",
].map((fil) => readFileSync(fil, "utf8")).join("\n"));
const KLIENT = udenKommentarer(readFileSync("src/fleet/faktura.js", "utf8"));
const SERVER = udenKommentarer(readFileSync("functions/index.js", "utf8"));
const REGELFIL = readFileSync("firebase.rules.json", "utf8");
const NAV = readFileSync("src/fleet/nav.js", "utf8");
const LOGIN = udenKommentarer(readFileSync("src/moduler/Login.jsx", "utf8"));
const APPSHELL = udenKommentarer(readFileSync("src/fleet/AppShell.jsx", "utf8"));

function funktion(navn) {
  const start = SERVER.indexOf(`export const ${navn} =`);
  if (start < 0) throw new Error(`${navn} findes ikke i functions/index.js`);
  const slut = SERVER.indexOf("\nexport const ", start + 1);
  return SERVER.slice(start, slut < 0 ? SERVER.length : slut);
}

const KONTEKST = {
  opgaver: DEMO_OPGAVER, ordrer: DEMO_INDKOEBSORDRER,
  forbrugsvarer: DEMO_FORBRUGSVARER, koeretoejer: DEMO_KOERETOEJER,
  aktiver: DEMO_AKTIVER,
};

/* ══════════════════════════════════════════════════════════════════════════
   ÉN NODE
   ══════════════════════════════════════════════════════════════════════════ */
describe("Fakturacenteret er en skærm, ikke en node", () => {
  test("login og AppShell bruger det samme Veyro-logo", () => {
    assert.match(LOGIN, /import VeyroLogo from "\.\.\/fleet\/VeyroLogo\.jsx"/);
    assert.match(LOGIN, /<VeyroLogo variant="login" \/>/);
    assert.match(APPSHELL, /<VeyroLogo variant="sidebar" \/>/);
    assert.doesNotMatch(LOGIN, /Fleet<b>Control<\/b>/);
  });

  test("⚠ DIREKTE URL KRÆVER fakturaer.laes FØR PROTOTYPEN TEGNES", () => {
    assert.match(SKAERM, /useFleet\(\)/);
    assert.match(SKAERM, /harPerm\(bruger\?\.perms, PERM\.fakturaerLaes\)/);
    assert.match(SKAERM, /if \(!harLæseadgang\)/);
    assert.match(SKAERM, /role="alert"/);
    assert.match(SKAERM, /return <FakturacenterPrototype \/>/);
  });

  /**
   * ⚠ `fakturaer/` ER ALLEREDE DEN FÆLLES NODE, og regelfilen siger hvorfor:
   * den er en af de tre tvetydige noder der står i basen, fordi den røres af
   * to skærme. En `fakturacenter/`-node ved siden af ville være den samme
   * kendsgerning to steder — og hver skærm skulle huske at lægge dem sammen.
   */
  test("⚠ DER FINDES INGEN fakturacenter-NODE", () => {
    assert.ok(!/"fakturacenter": \{/.test(REGELFIL),
      "der er lagt en node ved siden af den der findes");
    assert.ok(REGELFIL.includes('"fakturaer": {'), "den fælles node mangler");
  });

  /**
   * ⚠ OG DEN HAR INGEN MODULKLAUSUL — det er dét der gør den fælles. En
   * faktura kan høre til et hvilket som helst modul, så den må ikke ligge bag
   * ét af dem.
   */
  test("⚠ fakturaer HAR INGEN MODULKLAUSUL", () => {
    const i = REGELFIL.indexOf('"fakturaer": {');
    const blok = REGELFIL.slice(i, i + 30000);
    const laes = blok.split(/\r?\n/).find((l) => l.includes('".read"'));
    assert.ok(laes, "noden har ingen læseregel");
    assert.ok(!/child\('moduler'\)/.test(laes),
      "fakturaer er gatet på ét modul — så kan de andre ikke se deres egne fakturaer");
  });

  /**
   * ⚠ NODEN ER FÆLLES — SKÆRMEN HØRER TIL ØKONOMI-MODULET.
   *
   * Her stod at Økonomi & Rapporter var BASE. **Det var forkert, og det blev
   * målt frem for antaget:** `oekonomi` er et modul, og et VALGFRIT et —
   * nordvest har det ikke.
   *
   * Forskellen betyder noget. `fakturaer/` har ingen modulklausul, så en
   * kunde uden Økonomi kan stadig SE sine fakturaer — gennem Procures egen
   * linse. Det han mangler, er den TVÆRGÅENDE visning, og den er dét
   * modulet sælger. Havde noden fulgt modulet, ville hans Procure-skærm
   * være blevet tom af at han ikke købte Økonomi.
   */
  test("⚠ SKÆRMEN FØLGER oekonomi — MEN NODEN GØR IKKE", () => {
    assert.ok(NAV.includes('"/oekonomi/fakturacenter"'), "ruten findes ikke i nav.js");
    assert.ok(ALLE_MODULER.includes("oekonomi"),
      "oekonomi er ikke længere et modul — så skal skærmens placering tages op igen");
    /* Og noden må ikke følge med — det er hele pointen. */
    const i = REGELFIL.indexOf('"fakturaer": {');
    const laes = REGELFIL.slice(i, i + 30000).split(/\r?\n/).find((l) => l.includes('".read"'));
    assert.ok(!/child\('moduler'\)\.child\('oekonomi'\)/.test(laes),
      "fakturaer følger Økonomi-modulet — så mister en Procure-kunde sine egne fakturaer");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ÉT FELT-PAR, IKKE ÉT PR. MODUL
   ══════════════════════════════════════════════════════════════════════════ */
describe("Destinationen er ét spørgsmål med ét svar", () => {
  /**
   * ⚠ `ordreId` VAR ÉT MODULS SVAR PÅ ET FÆLLES SPØRGSMÅL. Med et felt pr.
   * modul ville "hvor hører fakturaen hen" være fire steder at spørge.
   */
  test("⚠ ordreId FINDES IKKE LÆNGERE PÅ FAKTURAEN", () => {
    const i = REGELFIL.indexOf('"fakturaer": {');
    const blok = REGELFIL.slice(i, REGELFIL.indexOf('"kassetyper": {', i));
    assert.ok(!/"ordreId":/.test(blok), "det gamle felt står stadig i reglen");
    assert.match(blok, /"destinationArt":/);
    assert.match(blok, /"destinationId":/);
  });

  /* ⚠ FLADE FELTER, IKKE ET OBJEKT: `.indexOn` kan kun pege på et DIREKTE
     barn, og `fakturamatch` skal kunne spørge "er den her ordre taget". */
  test("⚠ destinationId ER INDEKSERET", () => {
    const i = REGELFIL.indexOf('"fakturaer": {');
    const blok = REGELFIL.slice(i, i + 30000);
    assert.match(blok, /"\.indexOn": \[[^\]]*"destinationId"/);
  });

  /**
   * ⚠ HVAD ID'ET SKAL RAMME, AFHÆNGER AF ARTEN. En hængende reference er
   * værre end ingen: den ser placeret ud og er det ikke. Fleet og Facility
   * peger begge på `opgaver` — samme node med hver sin art.
   */
  test("⚠ REGLEN TJEKKER MÅLET PR. ART", () => {
    const i = REGELFIL.indexOf('"destinationId":');
    const linje = REGELFIL.slice(i, REGELFIL.indexOf("\n", i));
    for (const node of ["indkoebsordrer", "opgaver", "forbrugsvarer"]) {
      assert.ok(linje.includes(node), `arten peger ikke på ${node}`);
    }
  });

  test("hver art har etiket, ikon og en node — undtagen ingen", () => {
    for (const a of ALLE_DESTINATIONSARTER) {
      assert.ok(DESTINATIONSART[a].label, `${a} har ingen etiket`);
      assert.ok(DESTINATIONSART[a].ikon, `${a} har intet ikon`);
    }
    assert.equal(DESTINATIONSART.ingen.node, null);
    assert.deepEqual(PEGENDE_ARTER, ["fleet", "facility", "procure", "lager"]);
  });

  /**
   * ⚠ DER ER INGEN `warehouse`-DESTINATION, SELV OM PLANCHEN TEGNER EN.
   *
   * Warehouse er 3PL: kundens gods, som VI fakturerer for. Der kommer ingen
   * leverandørfaktura ind på den forretning — pengene går den anden vej. Det
   * der findes, er vores eget forbrugslager, og det hedder `lager`. At kalde
   * arten "warehouse" ville være femte gang et lagernavn dækkede et andet.
   */
  test("⚠ ARTEN HEDDER lager, IKKE warehouse", () => {
    assert.ok(DESTINATIONSART.lager, "lager-destinationen mangler");
    assert.ok(!DESTINATIONSART.warehouse,
      "arten hedder warehouse — det navn er 3PL-modulets, og der kommer ingen leverandørfaktura ind på det");
    assert.equal(DESTINATIONSART.lager.node, "forbrugsvarer");
  });

  /* ⚠ KILDEN ER IKKE DESTINATIONEN. Planchen siger det selv. */
  test("⚠ KILDE OG DESTINATION ER TO FELTER", () => {
    for (const k of Object.keys(FAKTURAKILDE)) {
      assert.ok(FAKTURAKILDE[k].label, `${k} har ingen etiket`);
      assert.equal(typeof FAKTURAKILDE[k].bygget, "boolean");
    }
    /* ⚠ KUN ÉN KILDE ER BYGGET, og resten siger det. En kilde der stod som
       bygget uden at være det, er et løfte systemet ikke holder. */
    const byggede = Object.keys(FAKTURAKILDE).filter((k) => FAKTURAKILDE[k].bygget);
    assert.deepEqual(byggede, ["registreret"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   MODULERNE AFGØR
   ══════════════════════════════════════════════════════════════════════════ */
describe("En kunde ser kun sine egne destinationer", () => {
  const faktura = DEMO_FAKTURAER.find((f) => f.id === "fa-9012");

  /**
   * ⚠ MÅLT PÅ nordvest: facility, flåde og indkøb — men hverken booking,
   * unitbooking eller warehouse. Et forslag mod et modul kunden ikke har,
   * ville pege på en node hans regler afviser, og "kan ikke læses" ligner
   * "findes ikke".
   */
  test("⚠ UDEN flaade FORESLÅS INGEN FLEET-DESTINATION", () => {
    const med = foreslaaDestination(faktura, { ...KONTEKST, moduler: { flaade: true } });
    assert.ok(med.some((f) => f.art === "fleet"), "fleet blev ikke foreslået med modulet");

    const uden = foreslaaDestination(faktura, { ...KONTEKST, moduler: { indkoeb: true } });
    assert.ok(!uden.some((f) => f.art === "fleet"),
      "fleet blev foreslået til en kunde uden flåde-modulet");
  });

  /**
   * ⚠ FRAVÆRENDE NODE = ALLE MODULER. Præcis som reglen læser den
   * (`!moduler.exists() || …`). En filterkopi der er 90 % rigtig, afviser
   * præcis dét reglen tillader — det er beslutning 56's fund.
   */
  test("⚠ EN TENANT UDEN moduler-NODE HAR ALLE MODULER", () => {
    const alle = foreslaaDestination(faktura, { ...KONTEKST, moduler: null });
    assert.ok(alle.length > 0);
    const arter = new Set(foreslaaDestination(
      DEMO_FAKTURAER.find((f) => f.id === "fa-9014"), { ...KONTEKST, moduler: null })
      .map((f) => f.art));
    assert.ok(arter.has("lager"), "en tenant uden moduler-node mistede en destination");
  });

  /* Og serveren håndhæver det samme — den læser modulerne af NODEN. */
  test("⚠ SERVEREN LÆSER MODULERNE AF NODEN", () => {
    const blok = funktion("fakturadestination");
    assert.match(blok, /rod\.child\("moduler"\)\.once\("value"\)/);
    assert.match(blok, /kanSaetteDestination\(faktura, \{ art, id, begrundelse \}, \{ moduler \}\)/);
    assert.ok(!/d\.moduler/.test(blok), "modulerne kommer fra klienten");
  });

  test("⚠ kanSaetteDestination AFVISER ET MODUL KUNDEN IKKE HAR", () => {
    const svar = kanSaetteDestination({ id: "f" }, { art: "facility", id: "x" },
      { moduler: { indkoeb: true } });
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /ikke facility-modulet/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SCOREN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Scoren kan efterprøves", () => {
  /* ⚠ KUN ET NUMMER GIVER 100. Alt andet er en slutning, og en slutning må
     ikke se ud som en kendsgerning ved siden af "Godkend match". */
  test("⚠ KUN ET NUMMERTRÆF GIVER 100 %", () => {
    assert.equal(scorAf(["nummer"]), 100);
    assert.equal(scorAf(["nummer", "leverandoer", "beloeb", "dato"]), 100);
    assert.ok(scorAf(["leverandoer", "koeretoej", "beloeb", "dato"]) <= 95);
  });

  test("hvert signal har en etiket og en vægt", () => {
    for (const s of Object.keys(DESTINATIONSSIGNAL)) {
      assert.ok(DESTINATIONSSIGNAL[s].label, `${s} har ingen etiket`);
      assert.ok(Number.isFinite(DESTINATIONSSIGNAL[s].vaegt), `${s} har ingen vægt`);
    }
  });

  /**
   * ⚠ EN ANDEN LEVERANDØRS SAG FORESLÅS IKKE — uanset beløbet. Mercedes
   * sender ikke en regning for Crawfords portarbejde. Undtagelsen er den
   * fysiske genkendelse: står bilen eller anlægget på fakturaen, er en forkert
   * leverandør en fejl vi skal SE.
   */
  test("⚠ HVERT FORSLAG HAR ET STÆRKT SIGNAL", () => {
    for (const f of DEMO_FAKTURAER) {
      for (const bud of foreslaaDestination(f, KONTEKST)) {
        const staerkt = ["nummer", "koeretoej", "aktiv", "vare", "leverandoer"]
          .some((s) => bud.signaler.includes(s));
        assert.ok(staerkt,
          `${f.id} → ${bud.art} bygger kun på beløb og dato: ${bud.signaler}`);
      }
    }
  });

  test("⚠ INTET FORSLAG UNDER LOFTET", () => {
    for (const f of DEMO_FAKTURAER) {
      for (const bud of foreslaaDestination(f, KONTEKST)) {
        assert.ok(bud.score >= MINDSTE_SCORE, `${f.id} → ${bud.score} %`);
      }
    }
  });

  /* Bedst først, på tværs af arter — ellers står den svageste hvor øjet lander. */
  test("forslagene er sorteret bedst først på tværs af arter", () => {
    for (const f of DEMO_FAKTURAER) {
      const bud = foreslaaDestination(f, KONTEKST);
      for (let i = 1; i < bud.length; i += 1) {
        assert.ok(bud[i - 1].score >= bud[i].score, `${f.id} er ikke sorteret`);
      }
    }
  });

  /**
   * ⚠ EN ANNULLERET OPGAVE HAR IKKE UDLØST EN REGNING. Stod den på listen,
   * kunne et tilfældigt beløbssammenfald "afslutte" en opgave ingen har
   * udført. Samme led som kladder får i `matchForslag()`.
   */
  test("⚠ EN ANNULLERET OPGAVE FORESLÅS IKKE", () => {
    const o = {
      id: "op-x", art: "vaerksted", status: "annulleret",
      leverandoerId: "lv-scania", beloebOere: 1000, startMs: Date.now() - 86400000,
    };
    const f = { id: "f", leverandoerId: "lv-scania", beloebOere: 1000, fakturadatoMs: Date.now() };
    assert.deepEqual(foreslaaDestination(f, { ...KONTEKST, opgaver: [o] })
      .filter((x) => x.art === "fleet"), []);
  });

  /* ⚠ REGNINGEN KOMMER EFTER ARBEJDET. En faktura dateret før opgaven er ikke
     "tæt på" — den er et andet køb. */
  test("⚠ EN FAKTURA FØR OPGAVEN FÅR IKKE DATOSIGNALET", () => {
    const o = {
      id: "op-y", art: "vaerksted", status: "planlagt",
      leverandoerId: "lv-scania", startMs: Date.now(),
    };
    const f = { id: "f", leverandoerId: "lv-scania", fakturadatoMs: Date.now() - 90 * 86400000 };
    const bud = foreslaaDestination(f, { ...KONTEKST, opgaver: [o] })
      .find((x) => x.art === "fleet");
    assert.ok(!bud?.signaler.includes("dato"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TILSTANDEN OG AFVIGELSEN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Placering og godkendelse er to spørgsmål", () => {
  test("de tre centertilstande kan alle vises", () => {
    assert.equal(centertilstand({ destinationArt: "fleet", destinationId: "x" }), "placeret");
    assert.equal(centertilstand({ destinationArt: "ingen" }), "afklaretUdenMatch");
    assert.equal(centertilstand({}), "udenMatch");
    for (const k of Object.keys(CENTERTILSTAND)) {
      assert.ok(CENTERTILSTAND[k].label && CENTERTILSTAND[k].tone, `${k} kan ikke vises`);
    }
  });

  /* ⚠ "INGEN DESTINATION" ER ET SVAR, ikke en tom tilstand — og det kræver en
     grund. Uden den begynder den næste forfra på det samme opslag. */
  test("⚠ INGEN DESTINATION KRÆVER EN GRUND", () => {
    assert.equal(kanSaetteDestination({ id: "f" }, { art: "ingen" }).ok, false);
    assert.equal(kanSaetteDestination({ id: "f" }, { art: "ingen", begrundelse: "Abonnement." }).ok, true);
    assert.match(KLIENT, /Skriv hvorfor ingen af destinationerne passer/);
  });

  /**
   * ⚠ EN BOGFØRT FAKTURA FLYTTES IKKE. Posten er sendt til regnskabet, og en
   * kontering der ændrer sig bagefter, gør en afstemning der stemte, til en
   * der ikke gør.
   */
  test("⚠ EN BOGFØRT FAKTURA KAN IKKE OMPLACERES", () => {
    const svar = kanSaetteDestination({ id: "f", status: "bogfoert" },
      { art: "fleet", id: "op-1" });
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /bogført/i);
  });

  /* ⚠ AFVIGELSEN ER null NÅR ET TAL MANGLER — ikke 0. */
  test("⚠ EN AFVIGELSE DER IKKE KAN REGNES, ER null", () => {
    const f = { beloebOere: 120000 };
    assert.equal(afvigelseOere(f, { art: "fleet", maal: { beloebOere: 100000 } }), 20000);
    assert.equal(afvigelseOere(f, { art: "fleet", maal: {} }), null);
    assert.equal(afvigelseOere({}, { art: "fleet", maal: { beloebOere: 100000 } }), null);
    assert.equal(afvigelseOere(f, null), null);
  });

  /* ⚠ ET RÅT ID ER IKKE ET SVAR i en destinationskolonne. */
  test("⚠ DESTINATIONEN SKRIVES SOM NOGET MAN KAN LÆSE", () => {
    const t = destinationstekst(
      { destinationArt: "procure", destinationId: "ord-003" },
      { ordrer: DEMO_INDKOEBSORDRER });
    assert.match(t.under, /BST-2026-00040/);
    assert.equal(destinationstekst({}, {}), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   DEMO-SÆTTET
   ══════════════════════════════════════════════════════════════════════════ */
describe("Demo kan vise hver destination", () => {
  /**
   * ⚠ ALLE FIRE PEGENDE ARTER SKAL FORESLÅS ET STED I SÆTTET. Uden dem kan
   * skærmen kun vise Procure-destinationen — og hele pointen er at ÉN faktura
   * kan høre til fire forskellige steder.
   */
  test("⚠ HVER PEGENDE ART FORESLÅS MINDST ÉN GANG", () => {
    const arter = new Set(
      DEMO_FAKTURAER.flatMap((f) => foreslaaDestination(f, KONTEKST).map((x) => x.art)));
    for (const a of PEGENDE_ARTER) {
      assert.ok(arter.has(a), `ingen faktura foreslår "${a}" — arten kan ikke ses virke`);
    }
  });

  /* ⚠ OG BÅDE ET 100 %-TRÆF OG EN SLUTNING. Findes kun det ene, kan
     forskellen mellem kendsgerning og slutning ikke ses på skærmen. */
  test("⚠ BÅDE ET NUMMERTRÆF OG EN SLUTNING I DEMO", () => {
    const scorer = DEMO_FAKTURAER
      .flatMap((f) => foreslaaDestination(f, KONTEKST).map((x) => x.score));
    assert.ok(scorer.includes(100), "intet nummertræf i demo");
    assert.ok(scorer.some((s) => s < 100), "hvert forslag er et nummertræf");
  });

  /* ⚠ EN AFKLARET FAKTURA UDEN DESTINATION HAR SIN GRUND. */
  test("⚠ EN FAKTURA MED destinationArt ingen HAR EN GRUND", () => {
    const uden = DEMO_FAKTURAER.filter((f) => f.destinationArt === "ingen");
    assert.ok(uden.length >= 1, "ingen afklaret-uden-destination i demo");
    for (const f of uden) assert.ok(f.destinationGrund, `${f.id} mangler sin grund`);
  });

  /* ⚠ DET GAMLE FLAG ER VÆK. To felter for ét svar driver. */
  test("⚠ INGEN DEMO-FAKTURA BÆRER ikkeMatchbar", () => {
    for (const f of DEMO_FAKTURAER) {
      assert.equal(f.ikkeMatchbar, undefined,
        `${f.id} bærer det gamle flag ved siden af destinationen`);
    }
  });

  /* ⚠ ET destinationId SKAL RAMME. En hængende reference ser placeret ud. */
  test("⚠ INTET destinationId HÆNGER", () => {
    const findes = {
      procure: new Set(DEMO_INDKOEBSORDRER.map((o) => o.id)),
      fleet: new Set(DEMO_OPGAVER.map((o) => o.id)),
      facility: new Set(DEMO_OPGAVER.map((o) => o.id)),
      lager: new Set(DEMO_FORBRUGSVARER.map((v) => v.id)),
    };
    for (const f of DEMO_FAKTURAER.filter((x) => x.destinationId)) {
      assert.ok(findes[f.destinationArt]?.has(f.destinationId),
        `${f.id} peger på "${f.destinationId}", som ikke findes i ${f.destinationArt}`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SKÆRMEN OG SERVEREN
   ══════════════════════════════════════════════════════════════════════════ */
describe("Eksisterende serverkontrol og den lokale intake-prototype", () => {
  test("⚠ PROTOTYPEN UDFØRER INGEN SERVERMUTATIONER", () => {
    assert.doesNotMatch(SKAERM, /\bsaetDestination\b|\bskiftFaktura\b|useListe\(/);
    assert.match(SKAERM, /eksterneKald:\s*false/);
    assert.match(funktion("fakturadestination"), /kanSaetteDestination\(/);
  });

  /**
   * ⚠ ARTEN SKAL PASSE MED OPGAVENS EGEN ART. Fleet og Facility deler noden
   * `opgaver`; uden det led kunne en værkstedsopgave placeres som en
   * facility-sag, og modulfilteret ville være omgået i ét hop.
   */
  test("⚠ SERVEREN TJEKKER OPGAVENS ART", () => {
    const blok = funktion("fakturadestination");
    assert.match(blok, /DESTINATIONSART\[art\]\.opgaveart/);
    assert.match(blok, /maal\.child\("art"\)\.val\(\) !== forventet/);
  });

  /* ⚠ MÅLET SKAL FINDES. Admin-SDK'et gaar uden om .validate, saa leddet skal
     ogsaa staa i funktionen. */
  test("⚠ SERVEREN TJEKKER AT MÅLET FINDES", () => {
    assert.match(funktion("fakturadestination"), /maal\.exists\(\)/);
  });

  /* ⚠ DET GAMLE FLAG RYDDES. To felter for ét svar driver. */
  test("⚠ SERVEREN RYDDER ikkeMatchbar", () => {
    assert.match(funktion("fakturadestination"), /ikkeMatchbar`\]: null/);
  });

  /* ⚠ MATCH OG KONTROL ER SEPARATE. Fakturacenteret er ikke et betalings-
     eller bogføringssystem. */
  test("⚠ PLACERING KRÆVER IKKE indkoeb.godkend", () => {
    const blok = funktion("fakturadestination");
    assert.ok(!/indkoebGodkend/.test(blok),
      "placeringen kræver godkendelsespermissionen — det er to handlinger");
    assert.match(SKAERM, /Markér som kontrolleret/);
    assert.match(SKAERM, /ikke betalingsgodkendelse eller bogføring/i);
    assert.doesNotMatch(SKAERM, /Markér som (betalt|bogført)|Godkend betaling/i);
  });

  test("⚠ DRAG-AND-DROP ER LOKAL, OG EKSTERNE INDGANGE ER DEAKTIVEREDE", () => {
    assert.match(SKAERM, /onDrop=/);
    assert.match(SKAERM, /Lokal prototype · kun syntetiske data/);
    assert.match(SKAERM, /Valgfri integration · deaktiveret/);
    assert.doesNotMatch(SKAERM, /from ["']firebase|uploadBytes|httpsCallable/i);
  });

  test("⚠ MATCHBEGRUNDELSE OG KANDIDATER ER SYNLIGE", () => {
    assert.match(SKAERM, /scenarie\.match\.årsag/);
    assert.match(SKAERM, /kandidat\.referencer/);
    assert.match(SKAERM, /kandidat\.leverandoer\.navn/);
  });

  test("⚠ PROTOTYPEN BRUGER KUN DET NYE SYNTHETISKE SCENARIESÆT", () => {
    assert.match(SKAERM, /FAKTURACENTER_SCENARIER/);
    assert.doesNotMatch(SKAERM, /DEMO_FAKTURAER|DEMO_INDKOEBSORDRER|DEMO_OPGAVER/);
  });
});
