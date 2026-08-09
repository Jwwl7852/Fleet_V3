/* test/flaade.test.mjs
 * Beslutning 18 og 19 på flåden, plus demo-rosterens invarianter.
 *
 * Ingen emulator herinde — filen tester KATALOGET og DEMO-DATA, ikke reglerne.
 * Den kører alligevel med `npm test`, fordi node --test tager hele test/.
 *
 * HVORFOR DEN FINDES. demo-personale.js virkede, fordi den kontrollerede sig
 * selv mod DEMO_KPI. Uden det havde Bemanding kunnet vise et nøgletal der
 * modsagde tabellen under det, uden at nogen opdagede det. Den kontrol hører
 * i hver demo-fil herfra — og som TEST og ikke kun som en console.warn, så den
 * også fanges af .githooks/pre-commit og ikke kun af en udvikler der tilfældigt
 * har konsollen åben.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ENHEDSART, ALLE_ARTER, ALLE_STATUS, GRUPPE, KOERETOEJ_STATUS,
  FELT, ART_FELTER, harFelt, felterFor, gruppeFor,
  kanDisponeres, samletLaengdeMm, samletKapacitet, kanBaere,
  kraevedeKompetencer, KOMPETENCE,
} from "../src/fleet/flaade.js";
import {
  DEMO_KOERETOEJER, demoKoeretoej, demoAntal, demoServiceInden30,
} from "../src/fleet/demo-flaade.js";
/* Fra demo-kpi.js og ikke fra useKpi.js: sidstnævnte importerer
   FleetContext.jsx, og node kan ikke indlæse .jsx. Det var derfor datasættet
   blev flyttet ud — en selvkontrol der kun kan køre i en browser, kan ikke
   fanges af pre-commit-hooken. */
import { DEMO_KPI } from "../src/fleet/demo-kpi.js";

/* Navne som ANDRE skærme hardkoder. Ændrer nogen et kaldenavn i rosteren,
   skal det fejle her frem for at give en tom celle på Dashboard. */
const BRUGT_AF_DASHBOARD = ["Bil 155", "Bil 104", "Lastbil 106", "Truck 2", "Bus 12"];

/* Navn + registrering som Bookingopsætnings satsark bruger. To filer der
   beskriver samme bil skal beskrive den ens — det var her Bil 104 havde to
   nummerplader. */
const I_BOOKINGOPSAETNING = [
  ["Volvo FH 500", "DE 12 345"],
  ["Mercedes Actros 1845", "DE 45 678"],
  ["Scania R 450", "DE 78 901"],
  ["MAN TGX 18.480", "DE 34 567"],
  ["DAF XF 480", "DE 90 123"],
  ["Iveco S-Way 460", "DE 56 789"],
  ["Volvo 9700 turistbus", "DE 22 111"],
  ["Setra S 516 HDH", "DE 33 222"],
];

describe("Arterne", () => {
  it("er ni, og bus og minibus er hver sin", () => {
    assert.equal(ALLE_ARTER.length, 9);
    assert.ok(ENHEDSART.bus);
    assert.ok(ENHEDSART.minibus);
    /* Minibus må ikke rundes til bus: D1 og ikke D, og en færgetakst der
       ligger imellem varevogn og bus. */
    assert.notDeepEqual(
      kraevedeKompetencer([{ art: "minibus" }]),
      kraevedeKompetencer([{ art: "bus" }])
    );
    assert.deepEqual(kraevedeKompetencer([{ art: "minibus" }]), [KOMPETENCE.d1]);
  });

  it("deler sig i motoriseret og påhængt", () => {
    for (const a of ALLE_ARTER) {
      assert.ok([GRUPPE.motoriseret, GRUPPE.paahaengt].includes(gruppeFor(a)), `${a} mangler gruppe`);
    }
    assert.equal(gruppeFor("trailer"), GRUPPE.paahaengt);
    assert.equal(gruppeFor("paahaeng"), GRUPPE.paahaengt);
  });

  it("har fem statusser, og kun aktiv kan disponeres", () => {
    assert.equal(ALLE_STATUS.length, 5);
    const disponerbare = ALLE_STATUS.filter((s) => KOERETOEJ_STATUS[s].disponerbar);
    assert.deepEqual(disponerbare, ["aktiv"]);
  });
});

describe("Art styrer feltskemaet", () => {
  it("giver hver art et skema", () => {
    for (const a of ALLE_ARTER) assert.ok(ART_FELTER[a], `${a} mangler i ART_FELTER`);
  });

  /* En trailer har ingen motor. Feltet findes ikke — det er ikke et tomt felt
     nogen har glemt at udfylde. */
  it("giver ikke påhængt materiel en kilometerstand", () => {
    assert.equal(harFelt("trailer", FELT.kmStand), false);
    assert.equal(harFelt("paahaeng", FELT.kmStand), false);
    assert.equal(harFelt("lastbil", FELT.kmStand), true);
  });

  it("giver påhængt materiel sit eget syn", () => {
    assert.equal(harFelt("trailer", FELT.synMs), true);
    assert.equal(harFelt("paahaeng", FELT.synMs), true);
  });

  it("giver kun arter med tachograf et tachografnummer", () => {
    for (const a of ALLE_ARTER) {
      assert.equal(
        harFelt(a, FELT.tachografNr), Boolean(ENHEDSART[a].tachograf),
        `${a}: tachografNr og ENHEDSART.tachograf er uenige`
      );
    }
  });

  /* Passagerer, ikke m³. En turistbus' bagagerum er ikke det man disponerer
     efter, og et kapacitetstal på den ville blive lagt sammen med en trailers. */
  it("giver bus og minibus sæder frem for kapacitet", () => {
    for (const a of ["bus", "minibus"]) {
      assert.equal(harFelt(a, FELT.saeder), true, `${a} mangler saeder`);
      assert.equal(harFelt(a, FELT.kapacitet), false, `${a} burde ikke have kapacitet`);
    }
    assert.equal(harFelt("lastbil", FELT.saeder), false);
    assert.equal(harFelt("lastbil", FELT.kapacitet), true);
  });

  it("giver felterne i katalogets rækkefølge, ikke objektets", () => {
    const a = felterFor("lastbil");
    const b = felterFor("traekker");
    assert.deepEqual(a, b);
    assert.ok(a.indexOf(FELT.kmStand) < a.indexOf(FELT.naesteServiceMs));
  });
});

describe("Demo-flåden overholder reglernes skema", () => {
  it("har ingen division nogen steder — beslutning 19", () => {
    for (const k of DEMO_KOERETOEJER) {
      assert.equal("division" in k, false, `${k.id} har division; reglerne afviser feltet`);
    }
  });

  /* Millimeter som integer, aldrig meter som float. 9,998 mod 10,002 afgør en
     færgetakst, og forskellen er over tusind kroner på Rødby–Puttgarden. */
  it("har laengdeMm som positivt integer", () => {
    for (const k of DEMO_KOERETOEJER) {
      assert.ok(Number.isInteger(k.laengdeMm), `${k.id}: laengdeMm er ikke et integer`);
      assert.ok(k.laengdeMm > 0, `${k.id}: laengdeMm skal være > 0`);
    }
  });

  it("bruger kun gyldige arter og statusser", () => {
    for (const k of DEMO_KOERETOEJER) {
      assert.ok(ENHEDSART[k.art], `${k.id}: ukendt art "${k.art}"`);
      assert.ok(KOERETOEJ_STATUS[k.status], `${k.id}: ukendt status "${k.status}"`);
    }
  });

  it("har ingen felter arten ikke har", () => {
    for (const k of DEMO_KOERETOEJER) {
      for (const felt of [FELT.kmStand, FELT.saeder, FELT.kapacitet, FELT.tachografNr, FELT.synMs]) {
        if (k[felt] != null) {
          assert.ok(harFelt(k.art, felt), `${k.id} (${k.art}) har ${felt}, men arten har ikke feltet`);
        }
      }
    }
  });

  it("dækker alle ni arter og alle fem statusser", () => {
    for (const a of ALLE_ARTER) {
      assert.ok(DEMO_KOERETOEJER.some((k) => k.art === a), `ingen enhed med arten ${a}`);
    }
    for (const s of ALLE_STATUS) {
      assert.ok(DEMO_KOERETOEJER.some((k) => k.status === s), `ingen enhed med status ${s}`);
    }
  });

  it("har unikke id'er og registreringsnumre", () => {
    assert.equal(new Set(DEMO_KOERETOEJER.map((k) => k.id)).size, DEMO_KOERETOEJER.length);
    assert.equal(new Set(DEMO_KOERETOEJER.map((k) => k.registrering)).size, DEMO_KOERETOEJER.length);
    assert.equal(new Set(DEMO_KOERETOEJER.map((k) => k.kaldenavn)).size, DEMO_KOERETOEJER.length);
  });

  /* En afgået enhed slettes ikke — den får en status og en årsag. */
  it("begrunder hver afgang frem for at slette posten", () => {
    for (const k of DEMO_KOERETOEJER.filter((e) => ["solgt", "skrottet"].includes(e.status))) {
      assert.ok(k.afgangMs, `${k.id} er ${k.status} uden afgangMs`);
      assert.ok(k.afgangAarsag, `${k.id} er ${k.status} uden afgangAarsag`);
    }
  });
});

describe("Demo-flåden er én kilde for de andre skærme", () => {
  it("har hver bil Dashboard nævner", () => {
    for (const navn of BRUGT_AF_DASHBOARD) {
      assert.ok(demoKoeretoej(navn), `Dashboard bruger "${navn}", som ikke findes i rosteren`);
    }
  });

  /* Det var her Bil 104 havde to nummerplader: AB 12 345 i demo-sag.js og
     DE 45 678 i Bookingopsætning. Beslutning 6's 84-mod-83 på en nummerplade. */
  it("beskriver Bookingopsætnings biler med samme model og nummerplade", () => {
    for (const [navn, registrering] of I_BOOKINGOPSAETNING) {
      const fundet = DEMO_KOERETOEJER.find((k) => k.navn === navn);
      assert.ok(fundet, `Bookingopsætning bruger "${navn}", som ikke findes i rosteren`);
      assert.equal(
        fundet.registrering, registrering,
        `"${navn}" har ${fundet.registrering} i rosteren og ${registrering} i Bookingopsætning`
      );
    }
  });

  it("giver Bil 104 præcis ét registreringsnummer", () => {
    const b104 = demoKoeretoej("Bil 104");
    assert.equal(b104.id, "kt-104");
    assert.equal(b104.registrering, "DE 45 678");
    assert.equal(b104.navn, "Mercedes Actros 1845");
  });
});

/* Rosteren er et UDSNIT og kan ikke ramme kpi/, fordi et køretøj ikke har en
   division at deles op på (beslutning 19) mens kpi/ er delt. Det der kan
   fastholdes, er at udsnittet aldrig påstår mere end platformen. */
describe("Demo-flåden modsiger ikke kpi/", () => {
  const total = (felt) =>
    (DEMO_KPI.gods?.flaade?.[felt] || 0) + (DEMO_KPI.bus?.flaade?.[felt] || 0);

  for (const [felt, taeller] of [
    ["aktive", () => demoAntal("aktiv")],
    ["udeAfDrift", () => demoAntal("udeAfDrift")],
    ["paaVaerksted", () => demoAntal("vaerksted")],
    ["serviceInden30", () => demoServiceInden30()],
  ]) {
    it(`har højst kpi/'s ${felt}`, () => {
      const iRosteren = taeller();
      const iAlt = total(felt);
      assert.ok(
        iRosteren <= iAlt,
        `rosteren har ${iRosteren} i "${felt}", men kpi/ siger ${iAlt} i hele flåden`
      );
    });
  }

  it("er mindre end flåden — ellers er 'udsnit' en påstand og ikke et faktum", () => {
    assert.ok(DEMO_KOERETOEJER.length < total("aktive"));
  });
});

describe("Disponeringsreglerne på rosteren", () => {
  it("nægter at disponere påhængt materiel alene", () => {
    const trailer = demoKoeretoej("Trailer 41");
    assert.equal(kanDisponeres([trailer]).ok, false);
    assert.match(kanDisponeres([trailer]).aarsag, /kan ikke disponeres uden en trækkende enhed/);
  });

  it("tillader trækker + trailer", () => {
    assert.equal(kanDisponeres([demoKoeretoej("Bil 12"), demoKoeretoej("Trailer 41")]).ok, true);
  });

  it("nægter en enhed der ikke er aktiv", () => {
    const paaVaerksted = demoKoeretoej("Lastbil 106");
    assert.equal(paaVaerksted.status, "vaerksted");
    assert.equal(kanDisponeres([paaVaerksted]).ok, false);
    assert.equal(kanDisponeres([demoKoeretoej("Bil 77")]).ok, false); // solgt
  });

  /* En trækker bærer næsten intet — lasten ligger på traileren. Det er summen
     der tæller, og derfor er nul den rigtige værdi på trækkeren. */
  it("lader trækkeren bære ingenting og traileren bære lasten", () => {
    const traekker = demoKoeretoej("Bil 12");
    const trailer = demoKoeretoej("Trailer 41");
    assert.deepEqual(samletKapacitet([traekker]), { m3: 0, kg: 0 });
    assert.equal(kanBaere([traekker], { m3: 40, kg: 8000 }).ok, false);
    assert.equal(kanBaere([traekker, trailer], { m3: 40, kg: 8000 }).ok, true);
  });

  it("summerer længden i millimeter", () => {
    const sum = samletLaengdeMm([demoKoeretoej("Bil 12"), demoKoeretoej("Trailer 41")]);
    assert.equal(sum, 6200 + 13620);
    assert.ok(Number.isInteger(sum));
    /* Vogntoget er over 16 m og ligger dermed i et andet færgetakstinterval
       end trækkeren alene. Det er hele grunden til at længden er et integer. */
    assert.ok(sum > 16000);
  });

  it("kræver C/E når der er påhæng med, og D af en bus", () => {
    assert.deepEqual(
      kraevedeKompetencer([demoKoeretoej("Bil 12"), demoKoeretoej("Trailer 41")]),
      [KOMPETENCE.c, KOMPETENCE.ce, KOMPETENCE.tachografkort].sort()
    );
    assert.deepEqual(
      kraevedeKompetencer([demoKoeretoej("Bus 12")]),
      [KOMPETENCE.d, KOMPETENCE.tachografkort].sort()
    );
  });

  /* ADR kommer fra LASTEN, ikke fra bilen — derfor tager funktionen både
     enheder og gods. */
  it("kræver ADR af farligt gods, uanset bilen", () => {
    assert.ok(kraevedeKompetencer([demoKoeretoej("Bil 104")], { farligt: true }).includes(KOMPETENCE.adr));
    assert.ok(!kraevedeKompetencer([demoKoeretoej("Bil 104")]).includes(KOMPETENCE.adr));
  });
});
