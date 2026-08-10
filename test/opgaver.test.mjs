/* test/opgaver.test.mjs
 * Beslutning 21: opgavens art, feltskemaet og køre-hviletidsreglen.
 *
 * Ingen emulator — reglerne testes i rules.opgaver.test.mjs. Her testes
 * KATALOGET og REGLEN, som begge skal kunne køres af den Cloud Function der
 * validerer en opgave eller skriver en etape.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OPGAVE_ART, ALLE_OPGAVE_ARTER, OPGAVE_STATUS, ALLE_OPGAVE_STATUS,
  FELT, ART_FELTER, harFelt, felterFor, ressourceFor, ressourceId, opgaveMangler,
  fordelPaaSted,
} from "../src/fleet/opgaver.js";
import {
  GRAENSE, OVERTRAEDELSE, FORBEHOLD, tjekKoerehviletid, koerehviletidTekst,
} from "../src/fleet/koerehviletid.js";
import { DEMO_BESOEG } from "../src/fleet/demo-vaerksted.js";

const MIN = 60000;
const T = 60 * MIN;
/* Fast dag: mandag 10. august 2026 kl. 06.00. */
const START = new Date(2026, 7, 10, 6, 0).getTime();
const straek = (fraMin, varighedMin, ekstra = {}) => ({
  fra: START + fraMin * MIN, til: START + (fraMin + varighedMin) * MIN, ...ekstra,
});

describe("Arten er vaerksted | facility", () => {
  it("har præcis to arter", () => {
    assert.deepEqual([...ALLE_OPGAVE_ARTER].sort(), ["facility", "vaerksted"]);
  });

  /* Kernen i beslutning 21. `langtur` var README's forslag fra før beslutning
     16; da etaper kom, blev den en dublet af en etape. Bliver den gyldig igen,
     står en transportstrækning to steder. */
  it("kender IKKE langtur — en langtur er en etape", () => {
    assert.equal(OPGAVE_ART.langtur, undefined);
    assert.equal(harFelt("langtur", FELT.dato), false);
    assert.deepEqual(felterFor("langtur"), []);
    assert.equal(ressourceFor("langtur"), null);
  });

  it("binder hver art til sin ressourcetype", () => {
    assert.equal(ressourceFor("vaerksted"), "koeretoej");
    assert.equal(ressourceFor("facility"), "facilityAktiv");
  });

  it("har et statsmaskineri der ikke er etapens", () => {
    /* opgaver.status og etapens tilstand må ikke smelte sammen — ét
       status-felt med to betydninger er beslutning 11 og 14 om igen. */
    for (const etapetilstand of ["kladde", "afventerPlan", "afventerKoord", "reserveret", "aaben"]) {
      assert.equal(OPGAVE_STATUS[etapetilstand], undefined, `${etapetilstand} hører på etapen`);
    }
    assert.ok(ALLE_OPGAVE_STATUS.includes("indberettet"));
    assert.ok(ALLE_OPGAVE_STATUS.includes("udfoert"));
  });
});

describe("Art styrer feltskemaet", () => {
  it("giver hver art et skema", () => {
    for (const a of ALLE_OPGAVE_ARTER) assert.ok(ART_FELTER[a], `${a} mangler skema`);
  });

  it("giver kun værkstedsopgaven et køretøj", () => {
    assert.equal(harFelt("vaerksted", FELT.koeretoejId), true);
    assert.equal(harFelt("facility", FELT.koeretoejId), false);
  });

  it("giver kun facility-opgaven et aktiv og en lokation", () => {
    assert.equal(harFelt("facility", FELT.aktivId), true);
    assert.equal(harFelt("facility", FELT.lokationId), true);
    assert.equal(harFelt("vaerksted", FELT.aktivId), false);
  });

  /* Dagsvisningen er timer, ikke døgn — varigheden hører på værkstedsopgaven. */
  it("giver kun værkstedsopgaven en varighed i minutter", () => {
    assert.equal(harFelt("vaerksted", FELT.varighedMin), true);
    assert.equal(harFelt("facility", FELT.varighedMin), false);
  });

  it("giver begge arter de fælles felter", () => {
    for (const f of [FELT.dato, FELT.beskrivelse, FELT.personId, FELT.estimatOere]) {
      for (const a of ALLE_OPGAVE_ARTER) assert.equal(harFelt(a, f), true, `${a} mangler ${f}`);
    }
  });

  it("giver felterne i katalogets rækkefølge", () => {
    const f = felterFor("vaerksted");
    assert.ok(f.indexOf(FELT.dato) < f.indexOf(FELT.estimatOere));
    assert.deepEqual(f, felterFor("vaerksted"), "rækkefølgen skal være stabil");
  });

  it("finder ressource-id'et uanset art", () => {
    assert.equal(ressourceId({ art: "vaerksted", koeretoejId: "kt-104" }), "kt-104");
    assert.equal(ressourceId({ art: "facility", aktivId: "fa-port3" }), "fa-port3");
    assert.equal(ressourceId({ art: "facility", lokationId: "lok-halB" }), "lok-halB");
    assert.equal(ressourceId({ art: "langtur", koeretoejId: "kt-104" }), null);
    assert.equal(ressourceId(null), null);
  });
});

describe("opgaveMangler fejler lukket", () => {
  it("godtager en fuld opgave", () => {
    assert.deepEqual(opgaveMangler({ art: "vaerksted", division: "gods", koeretoejId: "kt-104" }), []);
    assert.deepEqual(opgaveMangler({ art: "facility", division: "faelles", aktivId: "fa-port3" }), []);
  });

  it("kræver art, division og en ressource", () => {
    assert.ok(opgaveMangler({ division: "gods", koeretoejId: "x" }).includes("art"));
    assert.ok(opgaveMangler({ art: "vaerksted", koeretoejId: "x" }).includes("division"));
    assert.ok(opgaveMangler({ art: "vaerksted", division: "gods" }).includes("koeretoejId"));
  });

  it("afviser en ukendt art frem for at gætte", () => {
    assert.ok(opgaveMangler({ art: "langtur", division: "gods", koeretoejId: "x" }).includes("art"));
    assert.ok(opgaveMangler({}).includes("art"));
  });

  /* Division kan ikke arves fra bilen (beslutning 19) — den skal stå på
     opgaven selv. */
  it("accepterer ikke en opgave uden division, heller ikke med et køretøj", () => {
    assert.ok(opgaveMangler({ art: "vaerksted", koeretoejId: "kt-104" }).includes("division"));
  });
});

describe("Køre-hviletid: 4,5 timer før pause", () => {
  it("godtager kørsel op til grænsen", () => {
    const r = tjekKoerehviletid([straek(0, GRAENSE.koerselFoerPauseMin)]);
    assert.equal(r.ok, true);
  });

  it("blokerer sammenhængende kørsel over grænsen", () => {
    const r = tjekKoerehviletid([straek(0, GRAENSE.koerselFoerPauseMin + 1)]);
    assert.equal(r.ok, false);
    assert.equal(r.overtraedelser[0].type, OVERTRAEDELSE.pause);
  });

  /* En pause på 45 minutter nulstiller. To ture på 2,5 time med pause imellem
     er lovligt; uden pause er de 5 timers sammenhængende kørsel. */
  it("nulstiller efter 45 minutters pause", () => {
    const medPause = tjekKoerehviletid([straek(0, 150), straek(195, 150)]);
    assert.equal(medPause.ok, true);
  });

  it("nulstiller ikke efter en for kort pause", () => {
    const kort = tjekKoerehviletid([straek(0, 150), straek(180, 150)]);
    assert.equal(kort.ok, false);
    assert.equal(kort.overtraedelser[0].type, OVERTRAEDELSE.pause);
  });

  /* koerselMin lader en strækning være længere end kørslen — læsning og
     losning er ikke kørsel. Udelades feltet, regnes HELE strækningen som
     kørsel: det strenge gæt, fordi et mildt gæt giver et grønt lys der ikke
     holder. */
  it("regner hele strækningen som kørsel når koerselMin mangler", () => {
    const uden = tjekKoerehviletid([straek(0, 300)]);
    const med = tjekKoerehviletid([straek(0, 300, { koerselMin: 240 })]);
    assert.equal(uden.ok, false);
    assert.equal(med.ok, true);
  });
});

describe("Køre-hviletid: daglig og ugentlig", () => {
  /* Tre ture à 4 timer med rigelige pauser: ingen pauseovertrædelse, men
     12 timers kørsel på ét døgn. */
  const langDag = [straek(0, 240), straek(300, 240), straek(600, 240)];

  it("blokerer over ti timers kørsel på ét døgn", () => {
    const r = tjekKoerehviletid(langDag);
    assert.equal(r.ok, false);
    assert.ok(r.overtraedelser.some((o) => o.type === OVERTRAEDELSE.dagligKoersel));
    assert.ok(!r.overtraedelser.some((o) => o.type === OVERTRAEDELSE.pause), "pausen er overholdt");
  });

  it("godtager ni timer", () => {
    const r = tjekKoerehviletid([straek(0, 240), straek(300, 240), straek(600, 60)]);
    assert.equal(r.ok, true);
    assert.equal(r.minutter.ugentlig, 540);
  });

  /* 9,5 timer er lovligt to gange om ugen. Tre gange er det ikke. */
  it("tillader højst to forlængede døgn om ugen", () => {
    const dag = (n) => {
      const f = n * 24 * 60;
      return [straek(f, 240), straek(f + 300, 240), straek(f + 600, 90)];
    };
    const to = tjekKoerehviletid([...dag(0), ...dag(1)]);
    assert.equal(to.ok, true, "to forlængede døgn er lovligt");

    const tre = tjekKoerehviletid([...dag(0), ...dag(1), ...dag(2)]);
    assert.equal(tre.ok, false);
    assert.ok(tre.overtraedelser.some((o) => o.type === OVERTRAEDELSE.forlaengedeDage));
  });

  it("blokerer over 56 timers kørsel på en uge", () => {
    const straekninger = [];
    for (let d = 0; d < 7; d++) {
      const f = d * 24 * 60;
      straekninger.push(straek(f, 240), straek(f + 300, 240), straek(f + 600, 60));
    }
    const r = tjekKoerehviletid(straekninger);        // 7 x 9 t = 63 t
    assert.equal(r.ok, false);
    assert.ok(r.overtraedelser.some((o) => o.type === OVERTRAEDELSE.ugentligKoersel));
  });

  it("ser bort fra strækninger uden varighed", () => {
    const r = tjekKoerehviletid([
      { fra: START, til: START }, { fra: START, til: null }, null, straek(0, 60),
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.minutter.ugentlig, 60);
  });
});

/* Det vigtigste i hele filen. Fjernes forbeholdet, står der et grønt flueben
   ved siden af en bøde — og så er kontrollen værre end ingen kontrol. */
describe("Forbeholdet kan ikke klikkes væk", () => {
  it("følger med på ethvert svar, også de grønne", () => {
    const grøn = tjekKoerehviletid([straek(0, 60)]);
    const rød = tjekKoerehviletid([straek(0, 600)]);
    assert.equal(grøn.ok, true);
    assert.ok(grøn.forbehold, "et ok-svar mangler forbeholdet");
    assert.ok(rød.forbehold);
    assert.equal(grøn.forbehold.taeller, true);
  });

  it("siger hvad det er vi ikke kan se", () => {
    assert.match(FORBEHOLD.kort, /tachograf/i);
    assert.match(FORBEHOLD.kort, /planen/i);
    assert.match(FORBEHOLD.lang, /tachograf/i);
  });

  it("står i den tekst skærmen viser — også når planen er ren", () => {
    const grøn = koerehviletidTekst(tjekKoerehviletid([straek(0, 60)]));
    assert.match(grøn, /tachograf/i,
      "den grønne tekst mangler forbeholdet, og det er præcis den der læses forkert");

    const rød = koerehviletidTekst(tjekKoerehviletid([straek(0, 600)]));
    assert.match(rød, /tachograf/i);
    assert.match(rød, /[Bb]lokerer/, "en overtrædelse skal blokere, ikke advare");
  });

  it("lover ikke at chaufføren er lovlig", () => {
    const grøn = koerehviletidTekst(tjekKoerehviletid([straek(0, 60)]));
    assert.ok(!/lovlig|overholder reglerne|compliant/i.test(grøn),
      "teksten påstår mere end vi kan vide");
  });
});

describe("Demo-besøgene har opgavens form", () => {
  it("kunne gemmes i opgaver/", () => {
    for (const b of DEMO_BESOEG) {
      assert.deepEqual(opgaveMangler(b), [], `${b.id} kunne ikke gemmes som opgave`);
    }
  });

  it("er alle af arten vaerksted", () => {
    for (const b of DEMO_BESOEG) assert.equal(b.art, "vaerksted");
  });

  /* Divisionen står på besøget, ikke på bilen. */
  it("bærer en division der ikke kommer fra bilen", () => {
    for (const b of DEMO_BESOEG) {
      assert.ok(["gods", "bus", "faelles"].includes(b.division), `${b.id}: ugyldig division`);
    }
  });
});

describe("Hvor arbejdet ligger — fordelPaaSted", () => {
  /* Panelet erstattede et håndtegnet Danmarkskort. For et dusin opgaver siger
     et kort ikke noget en liste ikke også siger — men listen skal så være
     rigtig, og det er derfor regnestykket ligger her og ikke i .jsx-filen. */
  it("samler stop på sted og tæller dem", () => {
    const ud = fordelPaaSted([
      { sted: "Kolding" }, { sted: "Aarhus" }, { sted: "Kolding" },
    ]);
    assert.deepEqual(ud.map((s) => [s.sted, s.antal]), [["Kolding", 2], ["Aarhus", 1]]);
  });

  /* To steder med lige mange skal stå i samme rækkefølge hver gang — ellers
     hopper listen mellem renders, og man tror der er sket noget.
     ⚠ OG SORTERINGEN ER DANSK, IKKE ASCII. localeCompare(…, "da") sætter
     Aa og Å SIDST i alfabetet, så Aalborg kommer efter Odense. Det ser
     forkert ud for den der forventer A først — men det er rigtigt dansk, og
     en sortering der er "næsten rigtig" er den man aldrig får meldt. */
  it("sorterer flest først, derefter dansk alfabetisk", () => {
    const ud = fordelPaaSted([
      { sted: "Odense" }, { sted: "Aalborg" }, { sted: "Esbjerg" }, { sted: "Esbjerg" },
    ]);
    assert.deepEqual(ud.map((s) => s.sted), ["Esbjerg", "Odense", "Aalborg"]);
  });

  it("bærer tonerne med, så prikkerne kan tegnes", () => {
    const ud = fordelPaaSted([{ sted: "Kolding", tone: "bad" }, { sted: "Kolding" }]);
    assert.deepEqual(ud[0].toner, ["bad", "info"]);
  });

  /* Et stop uden sted må ikke forsvinde — det ville få listen til at vise
     færre opgaver end der er, uden at nogen kan se hvorfor. */
  it("samler stop uden sted under Ukendt frem for at tabe dem", () => {
    const ud = fordelPaaSted([{ sted: "Kolding" }, {}, { sted: null }]);
    assert.equal(ud.reduce((s, x) => s + x.antal, 0), 3);
    assert.ok(ud.some((s) => s.sted === "Ukendt"));
  });

  it("tåler en tom liste", () => {
    assert.deepEqual(fordelPaaSted([]), []);
    assert.deepEqual(fordelPaaSted(), []);
  });
});
