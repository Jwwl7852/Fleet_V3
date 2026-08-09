/* test/vaerksted.test.mjs
 * Gitterkalenderens regnestykke og værkstedsdemoens invarianter.
 *
 * Ingen emulator. Kører med `npm test`.
 *
 * HVORFOR DEN FINDES. Gitteret bruges TRE steder — Værkstedskalender,
 * Servicekalender og Disponering. En fejl i slot-beregningen er derfor ikke
 * en fejl på én skærm, men den samme fejl tre gange, og et gitter der er én
 * dag forskudt opdages ikke ved at kigge på det.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ENHED, MAX_SLOTS, slots, slotLabel, erNu, laegUd, blokkePrRaekke,
} from "../src/fleet/gitter.js";
import { oereFraKroner, kr } from "../src/fleet/format.js";
import { prioritetFor, KILDE, PRIORITET } from "../src/fleet/reservations.js";
import {
  DEMO_BESOEG, DEMO_INDKOEB, BESOEG_STATUS, OMKOSTNINGSTYPE,
  demoBesoegFor, demoBesoegNu, totalOere,
} from "../src/fleet/demo-vaerksted.js";
import { DEMO_KOERETOEJER } from "../src/fleet/demo-flaade.js";
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";
import { demoSag } from "../src/fleet/demo-sag.js";

const DAG = 86400000;
/* Fast vindue: 10.–14. august 2026, fem dage. */
const A10 = new Date(2026, 7, 10).getTime();
const A15 = new Date(2026, 7, 15).getTime();
const FEM = slots(A10, A15, ENHED.dag);

describe("Slots", () => {
  it("giver én kolonne pr. dag i et halvåbent vindue", () => {
    assert.equal(FEM.length, 5);
    assert.equal(FEM[0].fra, A10);
    assert.equal(FEM[4].til, A15);
  });

  it("starter kolonnen ved midnat, også når vinduet ikke gør", () => {
    const s = slots(A10 + 13 * 3600000, A10 + 2 * DAG, ENHED.dag);
    assert.equal(s[0].fra, A10, "første kolonne skal begynde ved midnat");
    assert.equal(s.length, 2);
  });

  it("giver 24 timer på et døgn i timevisning", () => {
    const s = slots(A10, A10 + DAG, ENHED.time);
    assert.equal(s.length, 24);
    assert.equal(s[0].fra, A10);
  });

  /* Et døgn er ikke altid 24 timer. Lagde vi 86400000 til, ville kolonnerne
     glide en time ved sommertidsskiftet, og en blok lande i den forkerte dag. */
  it("holder kolonnerne på midnat hen over sommertidsskiftet", () => {
    const marts = new Date(2026, 2, 27).getTime();   // skiftet er 29. marts
    const s = slots(marts, marts + 5 * DAG, ENHED.dag);
    for (const kolonne of s) {
      assert.equal(new Date(kolonne.fra).getHours(), 0, "kolonne begynder ikke ved midnat");
    }
  });

  it("giver ingen kolonner på et tomt eller vendt vindue", () => {
    assert.deepEqual(slots(A15, A10), []);
    assert.deepEqual(slots(A10, A10), []);
    assert.deepEqual(slots(null, A15), []);
  });

  /* Vi afkorter ikke i stilhed — samme holdning som MAX_PARTITIONER. */
  it("kaster frem for at afkorte et for bredt vindue", () => {
    assert.throws(() => slots(A10, A10 + (MAX_SLOTS + 5) * DAG, ENHED.dag), /kolonner/);
  });

  it("markerer kolonnen for nu", () => {
    assert.equal(erNu(FEM[0], A10), true);
    assert.equal(erNu(FEM[0], A10 - 1), false);
    assert.equal(erNu(FEM[0], FEM[0].til), false, "grænsen hører til næste kolonne");
  });

  it("giver en læsbar overskrift pr. enhed", () => {
    assert.ok(slotLabel(FEM[0], ENHED.dag).length > 0);
    assert.match(slotLabel({ fra: A10 + 8 * 3600000 }, ENHED.time), /^\d{2}[.:]\d{2}$/);
  });
});

describe("Blokke lægges ud på det halvåbne interval", () => {
  const ud = (b) => laegUd([{ id: "b", raekkeId: "r", ...b }], FEM)[0];

  it("dækker de kolonner den rører", () => {
    const b = ud({ fra: A10, til: A10 + 2 * DAG });
    assert.equal(b.start, 0);
    assert.equal(b.slut, 1, "to dage = kolonne 0 og 1");
  });

  /* Fælden: en blok der slutter ved midnat fylder ikke den næste dag. */
  it("fylder ikke dagen den slutter på", () => {
    const b = ud({ fra: A10, til: A10 + DAG });
    assert.equal(b.start, 0);
    assert.equal(b.slut, 0);
  });

  it("udelader blokke helt uden for vinduet", () => {
    assert.equal(laegUd([{ id: "x", raekkeId: "r", fra: A10 - 5 * DAG, til: A10 }], FEM).length, 0,
      "slutter præcis når vinduet begynder");
    assert.equal(laegUd([{ id: "x", raekkeId: "r", fra: A15, til: A15 + DAG }], FEM).length, 0,
      "begynder præcis når vinduet slutter");
  });

  it("udelader blokke uden varighed", () => {
    assert.equal(laegUd([{ id: "x", raekkeId: "r", fra: A10, til: A10 }], FEM).length, 0);
    assert.equal(laegUd([{ id: "x", raekkeId: "r", fra: A10, til: null }], FEM).length, 0);
  });

  /* Pilen er kontrollen: en tre ugers blok klippet ved kanten læses som et
     kort besøg, og så planlægger nogen en tur i en uge hvor bilen er væk. */
  it("markerer at blokken begyndte før vinduet", () => {
    const b = ud({ fra: A10 - 10 * DAG, til: A10 + DAG });
    assert.equal(b.foerVindue, true);
    assert.equal(b.efterVindue, false);
    assert.equal(b.start, 0, "klippes til første kolonne, men markeres");
  });

  it("markerer at blokken fortsætter efter vinduet", () => {
    const b = ud({ fra: A10 + 3 * DAG, til: A15 + 20 * DAG });
    assert.equal(b.efterVindue, true);
    assert.equal(b.slut, 4);
  });

  it("markerer begge ender når blokken omslutter vinduet", () => {
    const b = ud({ fra: A10 - DAG, til: A15 + DAG });
    assert.equal(b.foerVindue, true);
    assert.equal(b.efterVindue, true);
    assert.equal(b.start, 0);
    assert.equal(b.slut, 4);
  });
});

describe("Overlap tegnes som konflikt", () => {
  it("markerer begge blokke når de overlapper i samme række", () => {
    const p = laegUd([
      { id: "a", raekkeId: "bil1", fra: A10, til: A10 + 3 * DAG },
      { id: "b", raekkeId: "bil1", fra: A10 + 2 * DAG, til: A10 + 4 * DAG },
    ], FEM);
    assert.equal(p.length, 2);
    assert.ok(p.every((x) => x.konflikt), "begge skal markeres, ikke kun den anden");
  });

  /* Halvåbent: kant mod kant er ikke overlap. Ellers ville to besøg i
     forlængelse af hinanden se ud som en fejl. */
  it("kalder ikke kant mod kant en konflikt", () => {
    const p = laegUd([
      { id: "a", raekkeId: "bil1", fra: A10, til: A10 + 2 * DAG },
      { id: "b", raekkeId: "bil1", fra: A10 + 2 * DAG, til: A10 + 4 * DAG },
    ], FEM);
    assert.ok(p.every((x) => !x.konflikt));
  });

  it("blander ikke rækker sammen", () => {
    const p = laegUd([
      { id: "a", raekkeId: "bil1", fra: A10, til: A10 + 3 * DAG },
      { id: "b", raekkeId: "bil2", fra: A10, til: A10 + 3 * DAG },
    ], FEM);
    assert.ok(p.every((x) => !x.konflikt), "samme tid på FORSKELLIGE ressourcer er ikke en konflikt");
  });

  it("grupperer og sorterer pr. række", () => {
    const kort = blokkePrRaekke(laegUd([
      { id: "sen", raekkeId: "bil1", fra: A10 + 3 * DAG, til: A10 + 4 * DAG },
      { id: "tidlig", raekkeId: "bil1", fra: A10, til: A10 + DAG },
    ], FEM));
    assert.deepEqual(kort.get("bil1").map((b) => b.id), ["tidlig", "sen"]);
  });
});

describe("Beløb: øre som integer, moms for sig", () => {
  it("omregner danske kroner til hele øre", () => {
    assert.equal(oereFraKroner("8420,50"), 842050);
    assert.equal(oereFraKroner("8.420,50"), 842050, "punktum er tusindtalsseparator");
    assert.equal(oereFraKroner("12 345,00"), 1234500);
    assert.equal(oereFraKroner("100"), 10000);
  });

  /* 84,20 * 100 giver 8419.999999999999 i flydende komma. Uden afrunding ville
     fakturaen mangle en øre — og den mangler først synligt i en afstemning. */
  it("afrunder frem for at tabe en øre i flydende komma", () => {
    assert.equal(oereFraKroner("84,20"), 8420);
    assert.equal(oereFraKroner("0,07"), 7);
    assert.equal(oereFraKroner("1042,10"), 104210);
    for (const kroner of ["1,10", "2,20", "8,40", "16,80", "70,70"]) {
      assert.ok(Number.isInteger(oereFraKroner(kroner)), `${kroner} gav ikke et integer`);
    }
  });

  it("giver null på noget der ikke er et tal", () => {
    assert.equal(oereFraKroner(""), null);
    assert.equal(oereFraKroner(null), null);
    assert.equal(oereFraKroner("otte"), null);
  });

  it("holder moms adskilt og beregner totalen frem for at gemme den", () => {
    for (const i of DEMO_INDKOEB) {
      assert.ok(Number.isInteger(i.beloebOere), `${i.id}: beloebOere er ikke integer`);
      assert.ok(Number.isInteger(i.momsOere), `${i.id}: momsOere er ikke integer`);
      assert.equal("totalOere" in i, false, `${i.id} har en gemt total`);
      assert.equal(totalOere(i), i.beloebOere + i.momsOere);
    }
    assert.equal(kr(842050), "8.421 kr.");
  });

  /* 25 % dansk moms. Fanger et demo-beløb hvor moms og beløb er byttet om. */
  it("har moms der svarer til 25 % af beløbet", () => {
    for (const i of DEMO_INDKOEB) {
      assert.equal(i.momsOere, Math.round(i.beloebOere * 0.25), `${i.id}: moms passer ikke`);
    }
  });
});

describe("Værkstedsbesøget og reservationen", () => {
  it("har prioritet 40 — den højeste", () => {
    assert.equal(prioritetFor(KILDE.vaerksted), 40);
    assert.ok(PRIORITET.vaerksted > PRIORITET.fravaer);
    assert.ok(PRIORITET.vaerksted > PRIORITET.booking);
    assert.equal(Math.max(...Object.values(PRIORITET)), PRIORITET.vaerksted);
  });
});

describe("Demo-værkstedet hænger sammen med demo-flåden", () => {
  const kendte = new Set(DEMO_KOERETOEJER.map((k) => k.id));

  it("peger kun på biler der findes", () => {
    for (const b of DEMO_BESOEG) {
      assert.ok(kendte.has(b.koeretoejId), `${b.id} peger på ukendt bil "${b.koeretoejId}"`);
    }
    for (const i of DEMO_INDKOEB) {
      assert.ok(kendte.has(i.koeretoejId), `${i.id} peger på ukendt bil "${i.koeretoejId}"`);
    }
  });

  it("bruger kun kendte statusser og typer, og har varighed", () => {
    for (const b of DEMO_BESOEG) {
      assert.ok(BESOEG_STATUS[b.status], `${b.id}: ukendt status`);
      assert.ok(OMKOSTNINGSTYPE[b.type], `${b.id}: ukendt type`);
      assert.ok(b.til > b.fra, `${b.id}: til <= fra`);
    }
  });

  /* Flåde siger "på værksted", kalenderen siger hvornår. Siger de hver sit,
     er det beslutning 6's fejl et niveau nede. */
  it("er enig med flåden om hvem der står på værksted i dag", () => {
    const nu = Date.now();
    const paaVaerksted = new Set(demoBesoegNu(nu).map((b) => b.koeretoejId));
    for (const k of DEMO_KOERETOEJER) {
      assert.equal(
        k.status === "vaerksted", paaVaerksted.has(k.id),
        `${k.kaldenavn}: status "${k.status}" mod ${paaVaerksted.has(k.id) ? "" : "intet "}besøg i dag`
      );
    }
  });

  it("har ingen overlappende besøg på samme bil", () => {
    for (const id of new Set(DEMO_BESOEG.map((b) => b.koeretoejId))) {
      const mine = demoBesoegFor(id);
      for (let i = 0; i < mine.length; i++) {
        for (let j = i + 1; j < mine.length; j++) {
          assert.equal(
            mine[i].fra < mine[j].til && mine[j].fra < mine[i].til, false,
            `${mine[i].id} og ${mine[j].id} overlapper på ${id}`
          );
        }
      }
    }
  });

  /* Uden et langt besøg kan pilen ikke ses virke på skærmen. */
  it("har et besøg der rækker ud over et to-ugers vindue", () => {
    const iDag = new Date(); iDag.setHours(0, 0, 0, 0);
    const fra = iDag.getTime() - DAG;
    const til = fra + 14 * DAG;
    assert.ok(
      DEMO_BESOEG.some((b) => b.fra < til && fra < b.til && (b.fra < fra || b.til > til)),
      "intet besøg rækker ud over vinduet — pilen kan ikke ses"
    );
  });

  it("har højst kpi/'s antal biler på værksted", () => {
    const iAlt = (DEMO_KPI.gods?.flaade?.paaVaerksted || 0) + (DEMO_KPI.bus?.flaade?.paaVaerksted || 0);
    assert.ok(demoBesoegNu().length <= iAlt);
  });
});

/* Sagsvisningen og kalenderen skal beskrive samme arbejde. Ellers har vi to
   aftaler med samme værksted om samme bil — 84-mod-83 på et klokkeslæt. */
describe("Aftalen fra beslutning 20 er besøget i kalenderen", () => {
  const sag = demoSag("FLT-2026-00381");
  const besoeg = DEMO_BESOEG.find((b) => b.sagId === sag.id);

  it("findes som et planlagt besøg", () => {
    assert.ok(besoeg, "sagens aftale står ikke i kalenderen");
    assert.equal(besoeg.status, "planlagt");
  });

  it("står på samme bil og samme tidspunkter som aftalen", () => {
    assert.equal(besoeg.koeretoejId, sag.objektId);
    assert.equal(besoeg.fra, sag.aftale.fra);
    assert.equal(besoeg.til, sag.aftale.til);
    assert.equal(besoeg.fra, sag.aftaleFraMs, "general-feltet er også enigt");
  });

  it("bærer sagsnummeret, så man kan gå tilbage til tråden", () => {
    assert.equal(besoeg.sagsnummer, sag.nummer);
  });
});

describe("Indkøbene bærer det reglerne kræver", () => {
  it("har en division på hver post — den kan ikke arves fra bilen", () => {
    for (const i of DEMO_INDKOEB) {
      assert.ok(["gods", "bus", "faelles"].includes(i.division), `${i.id}: ugyldig division`);
    }
  });

  /* Bilen må ikke bære en division, heller ikke indirekte gennem indkøbet. */
  it("lader bilen være uden division", () => {
    for (const k of DEMO_KOERETOEJER) assert.equal("division" in k, false);
  });

  it("peger på et besøg der findes", () => {
    const besoeg = new Set(DEMO_BESOEG.map((b) => b.id));
    for (const i of DEMO_INDKOEB) {
      assert.ok(besoeg.has(i.besoegId), `${i.id} peger på ukendt besøg "${i.besoegId}"`);
    }
  });
});
