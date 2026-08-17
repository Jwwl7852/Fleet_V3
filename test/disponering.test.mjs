/* test/disponering.test.mjs
 * Disponerings forudsætninger: den rene konfliktkontrol, ledige vinduer,
 * etapernes transportfelter og demo-turenes geografi.
 *
 * Ingen emulator.
 *
 * HVORFOR DEN FINDES. tjekLedigMod() er den fjerde af de fem tjek, og den
 * kunne ikke testes før nu: logikken lå inde i en async funktion der krævede
 * en database. Splittet gjorde den testbar for første gang — og en
 * konfliktkontrol man ikke kan køre, ved man ikke om virker.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  tjekLedigMod, RESSOURCE, KILDE, PRIORITET, konfliktTekst,
} from "../src/fleet/reservations.js";
import { ledigeVinduer, slots, ENHED } from "../src/fleet/gitter.js";
import {
  GRAENSEOVERGANG, ALLE_GRAENSEOVERGANGE, graenseLabel, krydserGraense,
  tjekGeografi, reservationerFraEtape,  enhedsIder,
} from "../src/fleet/etaper.js";
import { reservationFraOpgave } from "../src/fleet/opgaver.js";
import {
  DEMO_ETAPER, UDELUKKER_HINANDEN, demoAabneEtaper, demoEtaperFor,
} from "../src/fleet/demo-etaper.js";
import { DEMO_KOERETOEJER } from "../src/fleet/demo-flaade.js";
import { DEMO_PERSONALE, DEMO_KOMPETENCER } from "../src/fleet/demo-personale.js";
import { DEMO_BESOEG } from "../src/fleet/demo-vaerksted.js";
import { kraevedeKompetencer } from "../src/fleet/flaade.js";
import { tjekKompetencer } from "../src/fleet/personale.js";

const T = 3600000;
const A10 = new Date(2026, 7, 10, 6, 0).getTime();
/* id'et skal indeholde BÅDE fra og til: to reservationer med samme starttid
   ville ellers dele id, og tjekLedigMod() ville filtrere den ene fra som
   "sig selv". */
const res = (fra, til, kildeType = KILDE.booking, ekstra = {}) => ({
  id: `r-${fra}-${til}-${kildeType}`,
  ressourceType: RESSOURCE.koeretoej, ressourceId: "kt-104",
  fra: A10 + fra * T, til: A10 + til * T,
  kilde: { type: kildeType, id: "x", reference: null },
  ...ekstra,
});

describe("tjekLedigMod — den rene konfliktkontrol", () => {
  it("siger fri når der ikke er noget", () => {
    const r = tjekLedigMod([], res(0, 4));
    assert.equal(r.ok, true);
    assert.deepEqual(r.konflikter, []);
  });

  /* Den vigtigste: kalderen kan have HELE ressourcens liste i hånden, og kun
     det der overlapper må meldes. Uden filtreringen ville hver eneste
     reservation blive en konflikt. */
  it("melder kun det der overlapper, ikke hele listen", () => {
    const alle = [res(0, 2), res(10, 12), res(3, 5)];
    const r = tjekLedigMod(alle, res(3, 4));
    assert.equal(r.konflikter.length, 1);
    assert.equal(r.konflikter[0].fra, A10 + 3 * T);
  });

  it("regner kant mod kant som fri", () => {
    assert.equal(tjekLedigMod([res(0, 4)], res(4, 6)).ok, true);
    assert.equal(tjekLedigMod([res(4, 6)], res(0, 4)).ok, true);
  });

  it("ser bort fra annullerede reservationer", () => {
    const r = tjekLedigMod([res(0, 4, KILDE.booking, { annulleret: true })], res(1, 2));
    assert.equal(r.ok, true);
  });

  it("ser bort fra sig selv", () => {
    const egen = res(0, 4);
    assert.equal(tjekLedigMod([egen], egen).ok, true);
  });

  /* Prioriteten afgør om den nye kilde kan overskrive. Et værkstedsbesøg (40)
     vinder over en booking (10); det omvendte gør det ikke. */
  it("lader værksted overskrive en booking, men ikke omvendt", () => {
    const modBooking = tjekLedigMod([res(0, 4, KILDE.booking)], res(1, 3, KILDE.vaerksted));
    assert.equal(modBooking.ok, false);
    assert.equal(modBooking.kanOverskrive, true);

    const modVaerksted = tjekLedigMod([res(0, 4, KILDE.vaerksted)], res(1, 3, KILDE.booking));
    assert.equal(modVaerksted.ok, false);
    assert.equal(modVaerksted.kanOverskrive, false);
  });

  it("lader ikke samme prioritet overskrive", () => {
    const r = tjekLedigMod([res(0, 4, KILDE.booking)], res(1, 3, KILDE.booking));
    assert.equal(r.kanOverskrive, false);
  });

  it("giver en besked uden navn og uden årsag", () => {
    const r = tjekLedigMod([res(0, 4, KILDE.fravaer)], res(1, 3, KILDE.booking));
    const tekst = konfliktTekst(res(1, 3), r.konflikter[0]);
    assert.match(tekst, /fravær/i);
    assert.ok(!/sygdom|Lars/i.test(tekst));
  });

  it("kræver kapacitet på en kapacitetsressource", () => {
    assert.throws(
      () => tjekLedigMod([], { ...res(0, 4), ressourceType: RESSOURCE.lager }),
      /kapacitet/
    );
  });
});

describe("ledigeVinduer — drop-felterne", () => {
  const dagFra = A10;
  const dagTil = A10 + 12 * T;

  it("giver hele vinduet når rækken er tom", () => {
    assert.deepEqual(ledigeVinduer([], dagFra, dagTil), [{ fra: dagFra, til: dagTil }]);
  });

  it("giver hullerne mellem blokkene", () => {
    const v = ledigeVinduer(
      [{ fra: A10 + 2 * T, til: A10 + 4 * T }, { fra: A10 + 7 * T, til: A10 + 9 * T }],
      dagFra, dagTil
    );
    assert.deepEqual(v, [
      { fra: dagFra, til: A10 + 2 * T },
      { fra: A10 + 4 * T, til: A10 + 7 * T },
      { fra: A10 + 9 * T, til: dagTil },
    ]);
  });

  it("giver intet når rækken er fyldt", () => {
    assert.deepEqual(ledigeVinduer([{ fra: dagFra, til: dagTil }], dagFra, dagTil), []);
  });

  /* Overlappende blokke må ikke skubbe markøren tilbage og opfinde et hul
     midt inde i noget optaget. */
  it("opfinder ikke et hul mellem to overlappende blokke", () => {
    const v = ledigeVinduer(
      [{ fra: A10, til: A10 + 6 * T }, { fra: A10 + 2 * T, til: A10 + 4 * T }],
      dagFra, dagTil
    );
    assert.deepEqual(v, [{ fra: A10 + 6 * T, til: dagTil }]);
  });

  it("klipper blokke der rækker ud over vinduet", () => {
    const v = ledigeVinduer([{ fra: dagFra - 5 * T, til: A10 + 3 * T }], dagFra, dagTil);
    assert.deepEqual(v, [{ fra: A10 + 3 * T, til: dagTil }]);
  });

  /* Drop-felterne skal kunne lægges ud af det samme gitter som blokkene —
     ellers kan de to være uenige om hvor der er plads. */
  it("kan lægges ud i det samme gitter som blokkene", () => {
    const slotListe = slots(dagFra, dagTil, ENHED.time);
    assert.equal(slotListe.length, 12);
    const v = ledigeVinduer([{ fra: A10 + 2 * T, til: A10 + 4 * T }], dagFra, dagTil);
    for (const f of v) {
      assert.ok(f.fra >= dagFra && f.til <= dagTil, "et felt ligger uden for vinduet");
    }
  });
});

describe("Etapens transportfelter", () => {
  it("kender grænseovergangene ét sted", () => {
    assert.ok(ALLE_GRAENSEOVERGANGE.includes("padborg"));
    assert.ok(ALLE_GRAENSEOVERGANGE.includes("roedby"));
    assert.equal(graenseLabel("padborg"), "Padborg");
    assert.equal(graenseLabel("findesIkke"), "findesIkke");
  });

  it("udleder om etapen krydser en grænse", () => {
    assert.equal(krydserGraense({ graenseovergange: ["padborg"] }), true);
    assert.equal(krydserGraense({ graenseovergange: [] }), false);
    assert.equal(krydserGraense({}), false);
  });

  /* kunDanmark og en grænseovergang er en modsigelse: ét af felterne er
     forkert, og begge bliver læst. */
  it("afviser kunDanmark sammen med en grænseovergang", () => {
    const r = tjekGeografi({ kunDanmark: true, graenseovergange: ["padborg"] });
    assert.equal(r.ok, false);
    assert.match(r.aarsag, /kun kørsel i Danmark/i);
  });

  it("godtager kunDanmark uden grænseovergange", () => {
    assert.equal(tjekGeografi({ kunDanmark: true, graenseovergange: [] }).ok, true);
  });

  it("afviser en ukendt grænseovergang", () => {
    assert.equal(tjekGeografi({ graenseovergange: ["berlin"] }).ok, false);
  });

  /* En etape binder TO ressourcer — bilen og chaufføren. */
  it("bygger to reservationer med kilde booking", () => {
    const r = reservationerFraEtape({
      id: "et-x", bookingId: "bk-1", fra: A10, til: A10 + 4 * T,
      koeretoejIder: { "kt-104": true }, personId: "larsAage",
    });
    assert.equal(r.length, 2);
    assert.deepEqual(r.map((x) => x.ressourceType).sort(), ["koeretoej", "medarbejder"]);
    for (const x of r) assert.equal(x.kilde.type, KILDE.booking);
  });

  it("⚠ EN SÆTTEVOGN BINDER BEGGE ENHEDER", () => {
    /* Trækkeren OG traileren er hver sin eksklusive ressource. Bandt vi kun
       trækkeren, ville traileren se fri ud i hele turen — og en anden bil
       kunne få den. */
    const r = reservationerFraEtape({
      id: "et-z", bookingId: "bk-2", fra: A10, til: A10 + 4 * T,
      koeretoejIder: { "kt-012": true, "kt-tr41": true }, personId: "larsAage",
    });
    assert.equal(r.length, 3, "traileren fik ingen reservation");
    assert.deepEqual(
      r.filter((x) => x.ressourceType === "koeretoej").map((x) => x.ressourceId).sort(),
      ["kt-012", "kt-tr41"]);
  });

  it("enhedsIder oversætter nodens objektform", () => {
    /* ⚠ RTDB HAR INGEN ARRAYS. Feltet ligger som { <id>: true }; en liste
       ville få nøglerne 0, 1, 2, og en sletning midt i ville rykke resten.
       Oversættelsen står ét sted — se hvad to kopier kostede i grundlag.js. */
    assert.deepEqual(enhedsIder({ koeretoejIder: { a: true, b: true } }), ["a", "b"]);
    assert.deepEqual(enhedsIder({ koeretoejIder: { a: true, b: false } }), ["a"],
      "en falsk værdi er ikke en enhed");
    assert.deepEqual(enhedsIder({ koeretoejIder: ["a"] }), ["a"], "et array tåles også");
    assert.deepEqual(enhedsIder({}), []);
    assert.deepEqual(enhedsIder(null), []);
  });

  it("bygger kun det den har — en åben etape har hverken bil eller chauffør", () => {
    const r = reservationerFraEtape({ id: "et-y", fra: A10, til: A10 + T });
    assert.deepEqual(r, []);
  });

  it("nægter en etape uden id eller uden varighed", () => {
    assert.throws(() => reservationerFraEtape({ fra: A10, til: A10 + T }), /id/);
    assert.throws(() => reservationerFraEtape({ id: "x", fra: A10, til: A10 }), /til > fra/);
  });

  /* Booking taber til både værksted og fravær. Det er meningen. */
  it("har den laveste prioritet af de rigtige kilder", () => {
    assert.ok(PRIORITET.booking < PRIORITET.fravaer);
    assert.ok(PRIORITET.booking < PRIORITET.vaerksted);
  });
});

describe("reservationFraOpgave er nu delt", () => {
  it("giver en værkstedsopgave kilde vaerksted på et køretøj", () => {
    const r = reservationFraOpgave(DEMO_BESOEG[0]);
    assert.equal(r.ressourceType, RESSOURCE.koeretoej);
    assert.equal(r.kilde.type, KILDE.vaerksted);
  });

  it("giver en facility-opgave kilde facilitySag på et aktiv", () => {
    const r = reservationFraOpgave({
      id: "o-1", art: "facility", aktivId: "fa-port3", fra: A10, til: A10 + T,
    });
    assert.equal(r.ressourceType, RESSOURCE.facilityAktiv);
    assert.equal(r.kilde.type, KILDE.facilitySag);
  });

  it("nægter en ukendt art og en opgave uden ressource", () => {
    assert.throws(() => reservationFraOpgave({ art: "langtur", fra: A10, til: A10 + T }), /art/);
    assert.throws(() => reservationFraOpgave({ id: "x", art: "vaerksted", fra: A10, til: A10 + T }), /ressource/);
  });
});

describe("Demo-etaperne", () => {
  const biler = new Set(DEMO_KOERETOEJER.map((k) => k.id));
  const folk = new Set(DEMO_PERSONALE.map((p) => p.id));

  it("peger kun på biler og folk der findes", () => {
    for (const e of DEMO_ETAPER) {
      if (e.koeretoejId) assert.ok(biler.has(e.koeretoejId), `${e.id}: ukendt bil`);
      if (e.personId) assert.ok(folk.has(e.personId), `${e.id}: ukendt person`);
    }
  });

  it("har division på hver etape — reglerne kræver den", () => {
    for (const e of DEMO_ETAPER) {
      assert.ok(["gods", "bus", "faelles"].includes(e.division), `${e.id}: ugyldig division`);
    }
  });

  it("er geografisk konsistente", () => {
    for (const e of DEMO_ETAPER) {
      const r = tjekGeografi(e);
      assert.equal(r.ok, true, `${e.id}: ${r.aarsag}`);
    }
  });

  /* Uden en indenlandsk tur er kunDanmark et felt ingen kan se virke. */
  it("har mindst én indenlandsk og flere internationale ture", () => {
    assert.ok(DEMO_ETAPER.some((e) => e.kunDanmark === true), "ingen indenlandsk tur");
    assert.ok(DEMO_ETAPER.filter((e) => krydserGraense(e)).length >= 5);
  });

  it("giver enhver udenlandsk tur en grænseovergang", () => {
    for (const e of DEMO_ETAPER) {
      if (!e.kunDanmark) {
        assert.ok(krydserGraense(e), `${e.id} går til ${e.tilSted} uden grænseovergang`);
      }
    }
  });

  /* Prismotoren lægger sammen hvad den får. Storebælt og Femern på samme tur
     mod syd er geografisk umuligt — man kører den ene vej eller den anden. */
  it("har ingen geografisk umulige passagekombinationer", () => {
    for (const e of DEMO_ETAPER) {
      for (const par of UDELUKKER_HINANDEN) {
        assert.ok(
          !par.every((p) => e.passager?.[p]),
          `${e.id} har både ${par.join(" og ")}`
        );
      }
    }
  });

  it("dækker de fem internationale destinationer fra mockuppen", () => {
    const byer = new Set(DEMO_ETAPER.map((e) => e.tilSted));
    for (const by of ["Hamburg", "Berlin", "Amsterdam", "Paris", "München"]) {
      assert.ok(byer.has(by), `mangler ${by}`);
    }
  });

  it("har en tur der løber over en døgngrænse", () => {
    assert.ok(
      DEMO_ETAPER.some((e) => new Date(e.fra).getDate() !== new Date(e.til).getDate()),
      "ugesvisningen har intet at vise over en døgngrænse"
    );
  });

  it("giver åbne etaper en frist og ingen bil", () => {
    const aabne = demoAabneEtaper();
    assert.ok(aabne.length > 0, "ingen åben etape — matchningen kan ikke ses virke");
    for (const e of aabne) {
      assert.ok(e.senestMs, `${e.id} er åben uden frist`);
      assert.deepEqual(enhedsIder(e), [], `${e.id} er åben, men har en bil`);
      assert.equal(e.personId, null);
    }
  });

  it("sætter ingen bil på to ture samtidig", () => {
    for (const id of new Set(DEMO_ETAPER.flatMap(enhedsIder))) {
      const mine = demoEtaperFor(id);
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

  /* Ellers viser Disponerings kompetencetjek en fejl der kommer fra demo-data
     og ikke fra modellen. */
  it("tildeler kun ture til chauffører med de krævede kompetencer", () => {
    const bilEfterId = new Map(DEMO_KOERETOEJER.map((b) => [b.id, b]));
    for (const e of DEMO_ETAPER.filter((x) => x.personId && x.koeretoejId)) {
      const krav = kraevedeKompetencer([bilEfterId.get(e.koeretoejId)], e.maengde);
      const mine = DEMO_KOMPETENCER.filter((c) => c.personId === e.personId);
      const svar = tjekKompetencer(mine, krav);
      assert.equal(
        svar.ok, true,
        `${e.id}: ${e.personId} mangler ${svar.mangler.join(", ")} / udløbet ${svar.udloebne.join(", ")}`
      );
    }
  });
});

/* De tre kilder skriver til ÉN node. Kan de ikke se hinanden, kan en etape
   lægges oven på et værkstedsbesøg — beslutning 4's fejl. */
describe("De tre kilder deler én reservationsnode", () => {
  it("bygger reservationer fra alle tre uden at kaste", () => {
    const typer = new Set();
    for (const b of DEMO_BESOEG) typer.add(reservationFraOpgave(b).kilde.type);
    for (const e of DEMO_ETAPER) {
      for (const r of reservationerFraEtape(e)) typer.add(r.kilde.type);
    }
    assert.ok(typer.has(KILDE.vaerksted));
    assert.ok(typer.has(KILDE.booking));
  });

  it("giver kilderne den rangorden modellen lover", () => {
    assert.deepEqual(
      Object.entries(PRIORITET).sort((a, b) => b[1] - a[1]).map(([k]) => k),
      ["vaerksted", "fravaer", "facilitySag", "booking", "manuel"]
    );
  });
});
