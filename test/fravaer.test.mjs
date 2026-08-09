/* test/fravaer.test.mjs
 * Ferie & fravær: det halvåbne interval, reservationen, og demo-sættets
 * invarianter.
 *
 * Ingen emulator herinde. Kører alligevel med `npm test`.
 *
 * HVORFOR DEN FINDES. To ting i denne skærm kan gå galt uden at det ses:
 * en fravær-til-dato der er én dag for tidlig gør en syg chauffør disponerbar
 * på sin sidste sygedag, og et navn eller en årsag der smutter med i
 * reservationen lækker en helbredsoplysning ud af sensitive/. Ingen af delene
 * giver en fejlmeddelelse — de giver et forkert resultat.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FRAVAER_ART, ALLE_FRAVAER_ARTER, TILSTAND,
  fravaerTilstand, erAktivt, sidsteDag, varighedDage, overlapper,
  reservationFraFravaer, fravaerPrioritet, erHelbredsoplysning,
} from "../src/fleet/fravaer.js";
import { PRIORITET, prioritetFor, RESSOURCE, KILDE, konfliktTekst } from "../src/fleet/reservations.js";
import { DEMO_FRAVAER, DEMO_FRAVAER_SENSITIVE, demoFravaerFor } from "../src/fleet/demo-fravaer.js";
import { DEMO_PERSONALE } from "../src/fleet/demo-personale.js";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";

const DAG = 86400000;
/* Fast nulpunkt: 14. juli 2026 kl. 00.00. Eksemplet fra kravet — Lars er væk
   14.–18. juli, altså til = den 19. */
const T14 = new Date(2026, 6, 14).getTime();
const T19 = new Date(2026, 6, 19).getTime();
const FRAVAER = { id: "fv-x", personId: "larsAage", fra: T14, til: T19 };

describe("Det halvåbne interval [fra, til)", () => {
  /* Fælden: gemmes til som den 18. i stedet for den 19., er Lars ledig hele
     sin sidste fraværsdag — og kan disponeres. */
  it("dækker til og med dagen før til", () => {
    assert.equal(new Date(sidsteDag(FRAVAER)).getDate(), 18);
    assert.equal(new Date(FRAVAER.til).getDate(), 19);
  });

  it("er aktivt på første dag og på sidste dag", () => {
    assert.equal(erAktivt(FRAVAER, T14), true, "første dag kl. 00.00");
    assert.equal(erAktivt(FRAVAER, T19 - 1), true, "sidste millisekund af den 18.");
  });

  it("er ikke aktivt i millisekundet før og på til-tidspunktet", () => {
    assert.equal(erAktivt(FRAVAER, T14 - 1), false);
    assert.equal(erAktivt(FRAVAER, T19), false, "kl. 00.00 den 19. er han tilbage");
  });

  it("afleder tilstanden frem for at gemme den", () => {
    assert.equal(fravaerTilstand(FRAVAER, T14 - DAG), "kommende");
    assert.equal(fravaerTilstand(FRAVAER, T14), "igangvaerende");
    assert.equal(fravaerTilstand(FRAVAER, T19 - 1), "igangvaerende");
    assert.equal(fravaerTilstand(FRAVAER, T19), "afsluttet");
    for (const t of Object.keys(TILSTAND)) assert.ok(TILSTAND[t].label);
  });

  it("tæller 14.–18. som fem dage", () => {
    assert.equal(varighedDage(FRAVAER), 5);
    assert.equal(varighedDage({ fra: T14, til: T14 + DAG }), 1);
    /* Et fravær kortere end et døgn er stadig én dag — modellen bærer
       halvdage, skærmen viser dem ikke. Se noten i Fravaer.jsx. */
    assert.equal(varighedDage({ fra: T14, til: T14 + 3600000 }), 1);
  });

  it("bruger samme overlapsregel som reservationsmodellen", () => {
    const a = { fra: T14, til: T19 };
    assert.equal(overlapper(a, { fra: T19, til: T19 + DAG }), false, "grænse til grænse er ikke overlap");
    assert.equal(overlapper(a, { fra: T19 - 1, til: T19 + DAG }), true);
    assert.equal(overlapper(a, { fra: T14 - DAG, til: T14 }), false);
  });
});

describe("Reservationen fravær ville skrive", () => {
  const r = reservationFraFravaer(FRAVAER);

  it("rammer MEDARBEJDEREN, ikke chaufføren", () => {
    assert.equal(r.ressourceType, RESSOURCE.medarbejder);
    assert.equal(r.ressourceType, "medarbejder");
  });

  it("bruger personId som ressource-id", () => {
    assert.equal(r.ressourceId, "larsAage");
  });

  it("har kilde fravaer med prioritet 30", () => {
    assert.equal(r.kilde.type, KILDE.fravaer);
    assert.equal(fravaerPrioritet(), 30);
    assert.equal(prioritetFor(KILDE.fravaer), 30);
  });

  /* En bil på værksted kan ikke køre; en syg chauffør kan ikke disponeres;
     begge slår en booking. Rækkefølgen er hele pointen med prioriteterne. */
  it("vinder over booking og taber til værksted", () => {
    assert.ok(PRIORITET.fravaer > PRIORITET.booking);
    assert.ok(PRIORITET.fravaer > PRIORITET.manuel);
    assert.ok(PRIORITET.fravaer < PRIORITET.vaerksted);
  });

  it("en ukendt kilde kan overskrive ingenting", () => {
    assert.equal(prioritetFor("findesIkke"), 0);
  });

  /* Reservationsnoden er ikke klassificeret. Kom navnet eller årsagen med,
     var helbredsoplysningen lækket ud af sensitive/ ad bagvejen. */
  it("bærer hverken navn eller årsag", () => {
    const tekst = JSON.stringify(r);
    for (const laek of ["Lars", "sygdom", "Sygdom", "sygemeldt"]) {
      assert.ok(!tekst.includes(laek), `reservationen indeholder "${laek}"`);
    }
    assert.equal(r.kilde.reference, null);
    assert.equal(r.note, null);
  });

  it("giver disponenten en besked uden hvem og hvorfor", () => {
    const t = konfliktTekst(null, { kilde: { type: KILDE.fravaer } });
    assert.match(t, /fravær/i);
    assert.ok(!/sygdom|ferie|Lars/i.test(t));
  });

  it("nægter at bygge på et fravær uden personId eller uden varighed", () => {
    assert.throws(() => reservationFraFravaer({ fra: T14, til: T19 }), /personId/);
    assert.throws(() => reservationFraFravaer({ personId: "x", fra: T19, til: T14 }), /til > fra/);
    assert.throws(() => reservationFraFravaer({ personId: "x", fra: T14, til: T14 }), /til > fra/);
    assert.throws(() => reservationFraFravaer({ personId: "x", fra: T14, til: null }), /til > fra/);
  });
});

describe("Årsagen er klassificeret — hele feltet, ikke halvdelen", () => {
  it("kender sygdom, barns sygedag og barsel som helbredsoplysninger", () => {
    for (const a of ["sygdom", "barnSyg", "barsel"]) {
      assert.equal(erHelbredsoplysning(a), true, `${a} burde være helbredsoplysning`);
    }
    for (const a of ["ferie", "kursus", "andet"]) {
      assert.equal(erHelbredsoplysning(a), false);
    }
  });

  /* Den vigtige: ALLE arter ligger samme sted. Lå ferie i general og sygdom i
     sensitive, ville et manglende felt betyde sygdom — delvis afsløring
     lækker gennem udeladelsen. */
  it("lægger hver eneste art i sensitive, også dem der ikke er følsomme", () => {
    const iSensitive = new Set(Object.values(DEMO_FRAVAER_SENSITIVE).map((s) => s.art));
    assert.ok(iSensitive.has("ferie"), "ferie skal også ligge i sensitive");
    for (const f of DEMO_FRAVAER) {
      assert.equal("art" in f, false, `${f.id} har art i general-noden`);
      assert.ok(DEMO_FRAVAER_SENSITIVE[f.id], `${f.id} mangler sin sensitive-post`);
    }
  });

  /* Samme logik et niveau op: varierer klassifikationen med det klassificerede,
     er klassifikationen selv kanalen. */
  it("giver hvert fravær samme securityLevel", () => {
    const niveauer = new Set(DEMO_FRAVAER.map((f) => f.securityLevel));
    assert.equal(niveauer.size, 1, `securityLevel varierer: ${[...niveauer].join(", ")}`);
  });

  it("bruger kun kendte arter", () => {
    for (const [id, s] of Object.entries(DEMO_FRAVAER_SENSITIVE)) {
      assert.ok(FRAVAER_ART[s.art], `${id} har ukendt art "${s.art}"`);
    }
    assert.equal(ALLE_FRAVAER_ARTER.length, 6);
  });
});

describe("Demo-fraværet hænger sammen med demo-personalet", () => {
  const kendte = new Set(DEMO_PERSONALE.map((p) => p.id));

  it("peger kun på personer der findes", () => {
    for (const f of DEMO_FRAVAER) {
      assert.ok(kendte.has(f.personId), `${f.id} peger på ukendt personId "${f.personId}"`);
    }
  });

  it("har ingen division — reglerne afviser feltet", () => {
    for (const f of DEMO_FRAVAER) assert.equal("division" in f, false, `${f.id} har division`);
  });

  it("har til > fra overalt", () => {
    for (const f of DEMO_FRAVAER) assert.ok(f.til > f.fra, `${f.id} har til <= fra`);
  });

  /* To fravær på samme person i samme periode er en konflikt på en eksklusiv
     ressource — reserver() ville afvise den anden. */
  it("lader ingen medarbejder være fraværende to gange samtidig", () => {
    for (const personId of new Set(DEMO_FRAVAER.map((f) => f.personId))) {
      const hans = demoFravaerFor(personId);
      for (let i = 0; i < hans.length; i++) {
        for (let j = i + 1; j < hans.length; j++) {
          assert.equal(
            overlapper(hans[i], hans[j]), false,
            `${hans[i].id} og ${hans[j].id} overlapper på ${personId}`
          );
        }
      }
    }
  });

  it("har mindst én person med to fravær, så overlapstjekket betyder noget", () => {
    const antalPr = new Map();
    for (const f of DEMO_FRAVAER) antalPr.set(f.personId, (antalPr.get(f.personId) || 0) + 1);
    assert.ok([...antalPr.values()].some((n) => n > 1));
  });

  /* Skærmen skal kunne vise alle tre tilstande. Er de ikke i datasættet, kan
     fravaerTilstand() ikke ses virke. */
  it("dækker alle tre tilstande lige nu", () => {
    const nu = Date.now();
    for (const t of ["kommende", "igangvaerende", "afsluttet"]) {
      assert.ok(
        DEMO_FRAVAER.some((f) => fravaerTilstand(f, nu) === t),
        `intet fravær er "${t}" lige nu`
      );
    }
  });

  it("har en sygdom blandt de igangværende, så hængelåsen sidder på noget aktuelt", () => {
    const nu = Date.now();
    const igang = DEMO_FRAVAER.filter((f) => fravaerTilstand(f, nu) === "igangvaerende");
    assert.ok(igang.some((f) => DEMO_FRAVAER_SENSITIVE[f.id]?.art === "sygdom"));
  });

  /* Fravær rammer alle medarbejdere. Er der kun chauffører i sættet, er det
     ikke synligt på skærmen at en lagermedarbejders ferie også blokerer. */
  it("rammer andre end chauffører", () => {
    const personEfterId = new Map(DEMO_PERSONALE.map((p) => [p.id, p]));
    const funktioner = new Set(
      DEMO_FRAVAER.flatMap((f) => Object.keys(personEfterId.get(f.personId)?.funktioner || {}))
    );
    assert.ok(funktioner.has("lager"), "ingen lagermedarbejder har fravær");
    assert.ok(funktioner.has("administration"), "ingen fra administrationen har fravær");
    assert.ok(funktioner.size >= 4, `kun ${funktioner.size} funktioner ramt`);
  });
});

/* Loft, ikke lighed — se noten i demo-fravaer.js. planlagt og disponeret er
   vagter og ikke hoveder, så kontrollen fanger en grov modsigelse og ikke en
   præcis uenighed. Den præcise kræver bemanding.fravaerIDag, som mangler. */
describe("Demo-fraværet modsiger ikke kpi/", () => {
  it("har færre fraværende i dag end der er ubesatte vagter", () => {
    const gab = ["gods", "bus"].reduce((s, d) => {
      const b = DEMO_KPI[d]?.bemanding || {};
      return s + Math.max(0, (b.planlagt || 0) - (b.disponeret || 0));
    }, 0);
    const iDag = DEMO_FRAVAER.filter((f) => erAktivt(f)).length;
    assert.ok(iDag <= gab, `${iDag} fraværende i dag mod ${gab} ubesatte vagter`);
  });
});
