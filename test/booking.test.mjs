/* test/booking.test.mjs
 * Tilstandsmaskinen mod demo-bookingerne. Beslutning 5 og 16.
 *
 * Ingen emulator.
 *
 * ⚠ DEN VIGTIGSTE TEST I FILEN er "disponenten må ikke godkende sit eget
 * forslag". Beslutning 5 har hidtil været et FELT DER MANGLER i et preset —
 * `disponent` har ikke PERM.bookingGodkend. Et manglende felt er nemt at
 * tilføje i god tro, og der er ingen fejl der opstår med det samme. Testen
 * gør fraværet til noget der fejler.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TILSTAND, kanSkifteEtape, byggEtapeSkifte, forloebstilstand, tilgaengeligeEtapeHandlinger,
} from "../src/fleet/booking-state.js";
import { PERM, ROLLE_PERMS, permStrengFraRolle, harPerm } from "../src/fleet/permissions.js";
import { DEMO_ETAPER } from "../src/fleet/demo-etaper.js";
import { enhedsIder } from "../src/fleet/etaper.js";
import {
  DEMO_BOOKINGER, TRANSPORTTYPE, RUTEPRAEFERENCE, FLEKSIBILITET,
  demoBooking, demoEtaperPaa, beregnetTilstand,
} from "../src/fleet/demo-bookinger.js";
import { DEMO_KUNDER } from "../src/fleet/demo-kunder.js";
import { DEMO_KOERETOEJER } from "../src/fleet/demo-flaade.js";
import { DEMO_PERSONALE } from "../src/fleet/demo-personale.js";

const som = (rolle) => permStrengFraRolle(rolle);

/* ══════════════════════════════════════════════════════════════════════
   BESLUTNING 5
   ══════════════════════════════════════════════════════════════════════ */
/* ⚠ DET DER PRØVES, ER EN ETAPE — BESLUTNING 40. Forslaget lå på bookingen
   OG på etapen; det ligger nu kun på etapen, og godkendelsen sker dér.
   Prøverne herunder er ordret de samme spørgsmål, stillet til det rigtige
   objekt. */
describe("Beslutning 5 — disponenten godkender ikke sit eget forslag", () => {
  /* Etapen med forslagene — ikke bookingen. Bookingen bærer ingen mere. */
  const etape = DEMO_ETAPER.find((e) => e.forslag?.length);
  const medValg = { ...etape, valgtForslagId: etape.forslag[0].id };

  it("afviser disponenten på PRÆCIS den booking koordinatoren får ok på", () => {
    const disponent = kanSkifteEtape(medValg, "reserveret", som("disponent"));
    const koordinator = kanSkifteEtape(medValg, "reserveret", som("koordinator"));

    assert.equal(disponent.ok, false, "disponenten må ikke godkende");
    assert.equal(koordinator.ok, true, "koordinatoren skal kunne godkende");
    /* Samme booking, samme forslag, samme kald — kun rollen skiller. */
    assert.match(disponent.aarsag, /booking\.godkend/);
  });

  it("mangler permissionen i presettet, ikke i en regel om hvem der ikke må", () => {
    assert.equal(ROLLE_PERMS.disponent.includes(PERM.bookingGodkend), false);
    assert.ok(ROLLE_PERMS.koordinator.includes(PERM.bookingGodkend));
    assert.ok(ROLLE_PERMS.admin.includes(PERM.bookingGodkend));
  });

  it("giver disponenten de handlinger han FAKTISK har", () => {
    /* Han er ikke uden magt — han må foreslå og afvise. Han må bare ikke
       godkende. */
    assert.ok(ROLLE_PERMS.disponent.includes(PERM.bookingForeslaa));
    assert.ok(ROLLE_PERMS.disponent.includes(PERM.bookingAfvis));
  });

  it("viser ingen godkend-knap for disponenten", () => {
    const dis = tilgaengeligeEtapeHandlinger("afventerKoord", som("disponent"));
    const koo = tilgaengeligeEtapeHandlinger("afventerKoord", som("koordinator"));
    assert.equal(dis.some((h) => h.kraeverPerm === PERM.bookingGodkend), false);
    assert.ok(koo.some((h) => h.kraeverPerm === PERM.bookingGodkend));
  });

  it("giver en chauffør ingen handlinger overhovedet", () => {
    for (const tilstand of Object.keys(TILSTAND)) {
      assert.deepEqual(
        tilgaengeligeEtapeHandlinger(tilstand, som("chauffoer")), [],
        `chaufføren fik en handling på "${tilstand}"`
      );
    }
  });

  /* Revisor må læse loggen og skrive intet. Presettet indeholder bevidst ikke
     én eneste .skriv. */
  it("giver revisor ingen tilstandsskift", () => {
    for (const tilstand of Object.keys(TILSTAND)) {
      assert.deepEqual(tilgaengeligeEtapeHandlinger(tilstand, som("revisor")), []);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════
   DE TO SLAGS NEJ
   ══════════════════════════════════════════════════════════════════════ */
describe("kanSkifte skelner mellem manglende adgang og manglende forudsætning", () => {
  const booking = demoBooking("bk-2026-00314");

  it("siger 'du mangler adgangen' når det er permissionen", () => {
    const svar = kanSkifteEtape({ ...booking, valgtForslagId: "fs-a" }, "reserveret", som("disponent"));
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /mangler adgangen/i);
  });

  /* Vises kun permissionfejlen, beder en koordinator om adgang hun allerede
     har, i stedet for at vælge et forslag. */
  it("siger 'vælg et forslag' når adgangen er i orden", () => {
    const svar = kanSkifteEtape({ ...booking, valgtForslagId: null }, "reserveret", som("koordinator"));
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /Vælg et forslag/i);
    assert.ok(!/mangler adgangen/i.test(svar.aarsag), "det er ikke en rettighedsfejl");
  });

  it("kræver en begrundelse ved returnér og afvis", () => {
    const medValg = { ...booking, valgtForslagId: "fs-a" };
    assert.match(
      kanSkifteEtape(medValg, "returneret", som("koordinator")).aarsag, /begrundelse/i
    );
    assert.equal(
      kanSkifteEtape(medValg, "returneret", som("koordinator"), { begrundelse: "For dyrt" }).ok, true
    );
  });

  it("afviser en overgang der slet ikke findes", () => {
    const svar = kanSkifteEtape({ tilstand: "kladde" }, "udfoert", som("admin"));
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /Kan ikke gå fra/i);
  });

  /* En åben etape uden frist fylder lageret med gods ingen henter. */
  it("kræver en frist på vej til aaben", () => {
    const etape = { tilstand: "afventerPlan", forslag: [{ id: "f" }], senestMs: null };
    const svar = kanSkifteEtape(etape, "aaben", som("disponent"), { begrundelse: "Venter på tur" });
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /frist/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   BESLUTNING 16 — tilstanden er afledt af etaperne
   ══════════════════════════════════════════════════════════════════════ */
describe("Forløbstilstanden udledes af etaperne", () => {
  it("har mindst ét delvist forløb i demo-sættet", () => {
    const delvise = DEMO_BOOKINGER.filter((b) => beregnetTilstand(b).tilstand === "delvist");
    assert.ok(delvise.length >= 1,
      "uden et delvist forløb kan beslutning 16's vigtigste værdi ikke ses");
  });

  it("gør bk-2026-00317 delvist: én udført etape og én åben", () => {
    const etaper = demoEtaperPaa("bk-2026-00317");
    assert.equal(etaper.length, 2);
    assert.deepEqual(etaper.map((e) => e.tilstand).sort(), ["aaben", "udfoert"]);
    const svar = forloebstilstand(etaper);
    assert.equal(svar.tilstand, "delvist");
    assert.equal(svar.harAabneEtaper, true);
  });

  /* Det denormaliserede felt skrives af én ting og kan altid genberegnes.
     Er de to uenige, ser en fejl ud som om den lykkedes. */
  it("har et lagret tilstandsfelt der stemmer med etaperne", () => {
    for (const b of DEMO_BOOKINGER) {
      const etaper = demoEtaperPaa(b.id);
      if (!etaper.length) {
        assert.equal(b.tilstand, "kladde",
          `${b.nummer} er "${b.tilstand}" uden en eneste etape`);
        continue;
      }
      assert.equal(
        forloebstilstand(etaper).tilstand, b.tilstand,
        `${b.nummer}: lagret felt er drevet fra etaperne`
      );
    }
  });

  it("er først udført når hver eneste etape er det", () => {
    assert.equal(forloebstilstand([
      { tilstand: "udfoert" }, { tilstand: "udfoert" },
    ]).tilstand, "udfoert");
    assert.equal(forloebstilstand([
      { tilstand: "udfoert" }, { tilstand: "reserveret" },
    ]).tilstand, "delvist");
  });

  it("regner en booking uden etaper som kladde", () => {
    assert.equal(forloebstilstand([]).tilstand, "kladde");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   byggSkifte
   ══════════════════════════════════════════════════════════════════════ */
describe("byggSkifte bygger posten uden at skrive den", () => {
  const booking = { tilstand: "kladde", valgtForslagId: null };

  it("skriver altid til historik", () => {
    const u = byggEtapeSkifte(booking, "afventerPlan", { rolle: "casehandler", bruger: "uid-1" });
    const noegle = Object.keys(u).find((n) => n.startsWith("historik/"));
    assert.ok(noegle, "en afvist booking skal kunne forklares et halvt år senere");
    assert.equal(u[noegle].fra, "kladde");
    assert.equal(u[noegle].til, "afventerPlan");
    assert.equal(u[noegle].af, "uid-1");
  });

  it("bruger uid og ikke personId på sidstAendretAf", () => {
    const u = byggEtapeSkifte(booking, "afventerPlan", { rolle: "casehandler", bruger: "uid-1" });
    assert.equal(u.sidstAendretAf, "uid-1");
  });

  it("bevarer et valgt forslag når der ikke gives et nyt", () => {
    const u = byggEtapeSkifte({ tilstand: "afventerKoord", valgtForslagId: "fs-b" },
      "reserveret", { rolle: "koordinator", bruger: "uid-2" });
    assert.equal(u.valgtForslagId, "fs-b");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Demo-bookingerne
   ══════════════════════════════════════════════════════════════════════ */
describe("Demo-bookingerne hænger sammen", () => {
  const kundeIder = new Set(DEMO_KUNDER.map((k) => k.id));
  const bilIder = new Set(DEMO_KOERETOEJER.map((b) => b.id));
  const folkIder = new Set(DEMO_PERSONALE.map((p) => p.id));

  it("peger kun på kunder der findes", () => {
    for (const b of DEMO_BOOKINGER) {
      assert.ok(kundeIder.has(b.kundeId), `${b.nummer}: ukendt kunde "${b.kundeId}"`);
    }
  });

  it("bruger kendte tilstande, typer og præferencer", () => {
    for (const b of DEMO_BOOKINGER) {
      assert.ok(TILSTAND[b.tilstand], `${b.nummer}: ukendt tilstand`);
      assert.ok(TRANSPORTTYPE[b.transporttype], `${b.nummer}: ukendt transporttype`);
      assert.ok(RUTEPRAEFERENCE[b.rutepraeference], `${b.nummer}: ukendt rutepræference`);
      assert.ok(FLEKSIBILITET[b.afhentningFleks], `${b.nummer}: ukendt fleksibilitet`);
    }
  });

  it("følger nummerformatet fra beslutning 8", () => {
    for (const b of DEMO_BOOKINGER) {
      assert.match(b.nummer, /^BKG-\d{4}-\d{5}$/, `${b.nummer} bryder formatet`);
    }
  });

  it("gemmer omsætning i hele øre", () => {
    for (const b of DEMO_BOOKINGER) {
      assert.ok(Number.isInteger(b.omsaetningOere), `${b.nummer}: ikke hele øre`);
    }
  });

  it("giver hver etape en booking der findes", () => {
    const ider = new Set(DEMO_BOOKINGER.map((b) => b.id));
    for (const e of DEMO_ETAPER) {
      assert.ok(ider.has(e.bookingId), `etape ${e.id}: ukendt booking`);
    }
  });

  /* 1-3 forslag, som mockuppen viser — og de skal pege på noget der findes. */
  it("⚠ BOOKINGEN BÆRER INGEN FORSLAG — de ligger på etapen", () => {
    /* Beslutning 40. De lå begge steder: her tid og pris, dér enheder og
       chauffør. For et forløb med én etape var det det samme løfte skrevet to
       steder — det mønster demo-kilder.test.mjs findes for at fange. */
    for (const b of DEMO_BOOKINGER) {
      assert.equal(b.forslag, undefined, `${b.nummer} har stadig forslag`);
      assert.equal(b.valgtForslagId, undefined, `${b.nummer} har stadig et valgtForslagId`);
    }
  });

  it("har 1–3 forslag på den etape der afventer koordinator", () => {
    const afventer = DEMO_ETAPER.filter((e) => e.tilstand === "afventerKoord");
    assert.ok(afventer.length >= 1, "uden den kan Forslag-skærmen ikke vise beslutning 5");
    for (const e of afventer) {
      const n = e.forslag?.length || 0;
      assert.ok(n >= 1 && n <= 3, `${e.id}: ${n} forslag`);
      for (const f of e.forslag) {
        /* ⚠ ET FORSLAG KAN VÆRE EN SÆTTEVOGN. Et forslag der kun kunne pege
           på trækkeren, ville foreslå noget kanDisponeres() afviser. */
        const ider = enhedsIder(f);
        assert.ok(ider.length, `${f.id}: ingen bil`);
        for (const id of ider) assert.ok(bilIder.has(id), `${f.id}: ukendt bil ${id}`);
        assert.ok(folkIder.has(f.personId), `${f.id}: ukendt person`);
        assert.ok(f.leveringMs > f.afhentningMs, `${f.id}: leverer før den henter`);
        assert.ok(Number.isInteger(f.estimatOere), `${f.id}: estimat ikke i hele øre`);
      }
    }
  });

  it("⚠ ET FORSLAG SKAL VÆRE VALGT AF KOORDINATOREN, ikke sat på forhånd", () => {
    /* Stod der et valg i demo-sættet, kunne man ikke se at "Vælg et forslag"
       er en FORUDSÆTNING og ikke en manglende rettighed — og de to slags nej
       er hele pointen med Forslag-skærmen. */
    for (const e of DEMO_ETAPER.filter((x) => x.tilstand === "afventerKoord")) {
      assert.equal(e.valgtForslagId, null, `${e.id} har allerede valgt et forslag`);
    }
  });

  it("har en kladde, så Ny forespørgsel kan vise sit udgangspunkt", () => {
    assert.ok(DEMO_BOOKINGER.some((b) => b.tilstand === "kladde"));
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Rollevælgerens grundlag
   ══════════════════════════════════════════════════════════════════════ */
describe("Rollerne giver forskellige knapper", () => {
  it("giver hver rolle et preset", () => {
    for (const rolle of ["chauffoer", "casehandler", "disponent", "koordinator", "revisor", "admin"]) {
      assert.ok(ROLLE_PERMS[rolle], `${rolle} mangler et preset`);
    }
  });

  /* Perms udledes af presettet — skrives de i hånden et sted, kan demoen vise
     en anden adgang end den man leverer. */
  it("udleder perms af presettet", () => {
    for (const rolle of Object.keys(ROLLE_PERMS)) {
      const streng = permStrengFraRolle(rolle);
      for (const p of ROLLE_PERMS[rolle]) {
        assert.ok(harPerm(streng, p), `${rolle} mistede ${p} i claim-strengen`);
      }
    }
  });

  it("giver ukendt rolle adgang til ingenting", () => {
    assert.equal(permStrengFraRolle("chef"), "");
    assert.deepEqual(tilgaengeligeEtapeHandlinger("afventerKoord", permStrengFraRolle("chef")), []);
  });

  it("giver flere handlinger til koordinator end til disponent på afventerKoord", () => {
    const dis = tilgaengeligeEtapeHandlinger("afventerKoord", som("disponent")).length;
    const koo = tilgaengeligeEtapeHandlinger("afventerKoord", som("koordinator")).length;
    assert.ok(koo > dis, "rollevælgeren skal kunne ses gøre en forskel");
  });
});
