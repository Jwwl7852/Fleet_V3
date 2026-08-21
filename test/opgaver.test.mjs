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
import { DEMO_OPGAVER } from "../src/fleet/demo-opgaver.js";
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
    assert.equal(harFelt("langtur", FELT.startMs), false);
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

  /**
   * ⚠ HER STOD DET MODSATTE, OG DET VAR FORKERT.
   *
   * Prøven hed "giver kun værkstedsopgaven en varighed i minutter" og slog
   * fast at `harFelt("facility", estimeretMin)` var FALSK, med begrundelsen
   * "dagsvisningen er timer, ikke døgn". Målt i demo-sættet: alle ni
   * facility-opgaver bærer feltet, Servicekalenderen regner hver eneste blok
   * af `slutter(o)` — som læser netop estimatet — og
   * `reservationFraOpgave()` KASTER uden det, uanset art.
   *
   * Et felt reservationen regnes af, kan ikke stå uden for artens skema: uden
   * det kan et servicebesøg ikke spærre sit anlæg, og så ser anlægget FRIT ud
   * mens der bliver arbejdet på det. Det er beslutning 4's fejl.
   */
  it("giver BEGGE arter en varighed — reservationen regnes af den", () => {
    for (const a of ALLE_OPGAVE_ARTER) {
      assert.equal(harFelt(a, FELT.estimeretMin), true, `${a} mangler estimeretMin`);
      assert.equal(harFelt(a, FELT.faktiskMin), true, `${a} mangler faktiskMin`);
    }
  });

  /* ⚠ `opgavestatus` SKRIVER `faktiskMin` UANSET ART (beslutning 50). Var
     feltet uden for facilitys skema, ville funktionen skrive et felt arten
     ikke har — og `kpi.opgaver.udenTidsregistrering` tæller på tværs. */
  it("giver kun værkstedsopgaven en arbejdstype", () => {
    assert.equal(harFelt("vaerksted", FELT.arbejdstype), true);
    /* Ingen af de ni facility-opgaver bærer den, og ordlisten er værkstedets
       — den deles med Procures omkostningstype. Et felt tilføjet fordi det
       KUNNE give mening, er et gæt. */
    assert.equal(harFelt("facility", FELT.arbejdstype), false);
  });

  it("giver begge arter de fælles felter", () => {
    for (const f of [FELT.startMs, FELT.beskrivelse, FELT.personId, FELT.beloebOere]) {
      for (const a of ALLE_OPGAVE_ARTER) assert.equal(harFelt(a, f), true, `${a} mangler ${f}`);
    }
  });

  it("giver felterne i katalogets rækkefølge", () => {
    const f = felterFor("vaerksted");
    assert.ok(f.indexOf(FELT.startMs) < f.indexOf(FELT.beloebOere));
    assert.deepEqual(f, felterFor("vaerksted"), "rækkefølgen skal være stabil");
  });

  /**
   * ⚠ OG DEN OMVENDTE RETNING — den der manglede.
   *
   * Prøven nedenfor spørger "lover kataloget noget ingen post har". Den
   * modsatte — "bærer posterne noget kataloget ikke lover" — fandtes for
   * flåden (demo-flaade.js' selvkontrol) og ikke for opgaver, og derfor
   * overlevede det at facility-skemaet manglede `estimeretMin`,
   * `leverandoerId` og `faktiskMin`, mens begge arter bar `sagId`.
   *
   * Et katalog der ikke matcher dataene, er værre end intet katalog: skærmen
   * spørger `harFelt()` og får NEJ til et felt der står på hver eneste post.
   */
  it("⚠ INGEN POST BÆRER ET FELT DENS ART IKKE HAR", () => {
    /* Nøgler der ikke er felter: id'et er postens eget, arten er skemaet
       selv, og divisionen kræves af reglerne for begge arter. */
    const IKKE_FELTER = new Set(["id", "art", "division", "oprettetAf", "oprettetMs"]);
    for (const o of DEMO_OPGAVER) {
      for (const [felt, v] of Object.entries(o)) {
        if (v == null || IKKE_FELTER.has(felt)) continue;
        assert.ok(harFelt(o.art, felt),
          `${o.id} (${o.art}) bærer "${felt}", som arten ikke har. Se ART_FELTER.`);
      }
    }
  });

  it("⚠ KATALOGET NAVNGIVER FELTER OPGAVERNE FAKTISK HAR", () => {
    /* Her stod `dato`, `varighedMin` og `estimatOere` — tre navne ingen post
       bærer. Noden har `startMs`, `estimeretMin` og `beloebOere`, og det er
       nodens navne der gælder: de står i firebase.rules.json, i .indexOn og på
       hver eneste række.

       Det var anden halvdel af en fejl der allerede var rettet én gang:
       `opgaver`s indeks navngav `dato`, og da jeg rettede indekset, opdagede
       jeg ikke at MODULET sagde det samme forkerte. Et katalog der ikke
       matcher dataene, er værre end intet: skærmen spørger harFelt() og får ja
       til et felt der er tomt. */
    const post = DEMO_OPGAVER.find((o) => o.art === "vaerksted");
    assert.ok(post, "ingen værkstedsopgave i demo-sættet");
    const paakraevede = felterFor("vaerksted")
      /* ⚠ TRE FELTER ER VALGFRIE, OG DE ER DET AF HVER SIN GRUND.
         besoegId: ikke alle opgaver kom fra et besøg.
         leverandoerId: en opgave UDEN leverandør udføres på VORES egen lift af
         vores egen mekaniker — feltet er netop det der skiller intern
         vedligehold fra et eksternt værkstedsbesøg, så et krav om det ville
         gøre den ene halvdel af sættet ugyldig.
         sagId: en opgave kan komme fra en sag (beslutning 20) eller fra en
         værkfører der planlægger direkte. Feltet stod på posterne før det stod
         i kataloget — det var netop dét den omvendte prøve ovenfor fandt. */
      .filter((f) => f !== FELT.besoegId && f !== FELT.leverandoerId
                  && f !== FELT.sagId);
    for (const f of paakraevede) {
      assert.ok(f in post, `kataloget lover "${f}", som ingen opgave har`);
    }
  });

  /* ⚠ SAMME PRØVE FOR FACILITY. Den fandtes kun for værksted, og det er derfor
     facility-skemaet kunne love mindre end posterne bar uden at nogen så det. */
  it("⚠ KATALOGET NAVNGIVER OGSÅ FACILITY-OPGAVENS FELTER", () => {
    const poster = DEMO_OPGAVER.filter((o) => o.art === "facility");
    assert.ok(poster.length, "ingen facility-opgave i demo-sættet");
    /* ⚠ `leverandoerId` OG `personId` ER SVAR PÅ DET SAMME SPØRGSMÅL — hvem
       udfører arbejdet — og en post bærer det ene eller det andet. Et krav om
       begge ville betyde at hvert eksternt servicebesøg også skulle udpege en
       af vores egne. `aktivId`/`lokationId` er enten-eller af samme slags og
       prøves for sig nedenfor. */
    const valgfri = new Set([FELT.leverandoerId, FELT.personId, FELT.sagId,
                             FELT.sted, FELT.faktiskMin,
                             FELT.lokationId, FELT.aktivId]);
    for (const f of felterFor("facility")) {
      if (valgfri.has(f)) continue;
      assert.ok(poster.every((o) => f in o),
        `kataloget lover "${f}", som en facility-opgave ikke har`);
    }
    /* Ressourcen er enten-eller, men den ENE af de to skal stå på hver post. */
    for (const o of poster) {
      assert.ok(o.aktivId || o.lokationId, `${o.id} har hverken aktiv eller lokation`);
    }
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
    assert.deepEqual(opgaveMangler({ art: "vaerksted", koeretoejId: "kt-104" }), []);
    assert.deepEqual(opgaveMangler({ art: "facility", aktivId: "fa-port3" }), []);
  });

  it("afviser en ukendt art frem for at gætte", () => {
    assert.ok(opgaveMangler({ art: "langtur", koeretoejId: "x" }).includes("art"));
    assert.ok(opgaveMangler({}).includes("art"));
  });

  /* Division kan ikke arves fra bilen (beslutning 19) — den skal stå på
     opgaven selv. */
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
