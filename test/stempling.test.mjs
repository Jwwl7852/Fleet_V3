/* test/stempling.test.mjs
 * Stempl ind og ud — og de tal der IKKE må gøres op.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Chaufførappens forside har et kort der hedder Timeregistrering, og der
 * fandtes ingen node. Det er den anden af de fire skærme i ejerens
 * specifikation.
 *
 * ⚠ OG NAVNET VAR TAGET TO GANGE. `vagter/` er reserveret til en VAGTPLAN
 * (hvad vi aftalte), `tidsregistrering` er et FELT på en indberetning
 * (ankomst og afgang på et værkstedsbesøg). Noden hedder `stemplinger`, fordi
 * navnet siger hvordan posten opstår. Tredje gang to ting var ved at hedde
 * det samme i dette repo.
 *
 * Se beslutning 107.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { udenKommentarer } from "./kode.mjs";

import {
  STEMPLING_FELTER, erAaben, aabenStempling, minutter, timerOgMin,
  ugestart, ugedage, ugesum, valideStempling,
} from "../src/fleet/stempling.js";
import { DEMO_STEMPLINGER } from "../src/fleet/demo-stemplinger.js";
import { DEMO_PERSONALE } from "../src/fleet/demo-personale.js";
import { NODE_MODUL } from "../src/fleet/moduler.js";

const REGLER = JSON.parse(
  readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "")
).rules.tenants.$tenantId;

const NODE = REGLER.stemplinger;
const POST = NODE.$personId.$id;

/** Mandag kl. 07 i en fast uge — ingen Date.now() i en prøve. */
const MAN = new Date(2026, 7, 17, 7, 0, 0, 0).getTime();
const T = 3600000;
const paa = (dag, time) => {
  const d = new Date(MAN);
  d.setDate(d.getDate() + dag);
  d.setHours(time, 0, 0, 0);
  return d.getTime();
};

describe("En åben stempling er et ubesvaret spørgsmål", () => {
  it("åben betyder indMs uden udMs", () => {
    assert.ok(erAaben({ indMs: MAN }));
    assert.ok(!erAaben({ indMs: MAN, udMs: MAN + T }));
    assert.ok(!erAaben({}));
    assert.ok(!erAaben(null));
  });

  /**
   * ⚠ ÅBEN ER IKKE "I DAG". En nattur begynder mandag kl. 22 og slutter
   * tirsdag kl. 06. Ledte vi efter en åben post på dagens dato, ville
   * chaufføren stå som ikke-stemplet-ind hele natten — og "Stempl IND" ville
   * lave en post nummer to oven i den han allerede havde.
   */
  it("⚠ EN NATTUR ER STADIG ÅBEN DAGEN EFTER", () => {
    const nat = { id: "n", indMs: paa(0, 22) };
    assert.equal(aabenStempling([nat])?.id, "n");
  });

  it("den nyeste åbne vinder", () => {
    const a = { id: "a", indMs: paa(0, 6) };
    const b = { id: "b", indMs: paa(1, 6) };
    assert.equal(aabenStempling([a, b])?.id, "b");
  });

  /**
   * ⚠ EN ÅBEN STEMPLING HAR IKKE NUL MINUTTER. Den har et ubesvaret
   * spørgsmål: vi ved hvornår han begyndte og ikke hvornår han holdt op.
   * Skrev vi 0, ville en ugeopgørelse vise en dag uden arbejde for en mand
   * der stadig kører. Samme regel som `num()` og INTET.
   */
  it("⚠ MINUTTER PÅ EN ÅBEN ER null, IKKE 0", () => {
    assert.equal(minutter({ indMs: MAN }), null);
    assert.equal(minutter({ indMs: MAN, udMs: MAN + 90 * 60000 }), 90);
  });
});

describe("Timer skrives med kolon", () => {
  /**
   * ⚠ 7,5 TIME ER IKKE 7 TIMER OG 5 MINUTTER, og et decimaltal på en
   * lønseddel bliver læst som det ene af de to af den der ikke skrev det.
   */
  it("⚠ ALDRIG ET DECIMALTAL", () => {
    assert.equal(timerOgMin(450), "7:30");
    assert.equal(timerOgMin(60), "1:00");
    assert.equal(timerOgMin(5), "0:05");
  });

  it("null bliver til INTET", () => {
    assert.equal(timerOgMin(null), "—");
    assert.equal(timerOgMin(undefined), "—");
  });
});

describe("Ugen", () => {
  /**
   * ⚠ UGEN BEGYNDER MANDAG, og `getDay()` giver 0 for søndag — samme fælde
   * som gitterets ugekolonner (beslutning 65). En uge der begyndte søndag,
   * ville lægge en søndagsvagt i den forkerte uge på en lønopgørelse.
   */
  it("⚠ UGESTART ER MANDAG VED MIDNAT", () => {
    for (let d = 0; d < 7; d++) {
      const u = new Date(ugestart(paa(d, 12)));
      assert.equal(u.getDay(), 1, `dag ${d} gav ${u.toString()}`);
      assert.equal(u.getHours(), 0);
    }
    /* Og en søndag hører til ugen FØR den følgende mandag. */
    assert.equal(ugestart(paa(6, 23)), ugestart(paa(0, 7)));
  });

  /**
   * ⚠ EN NATTUR TÆLLER PÅ AFGANGSDAGEN. At dele den over midnat ville være
   * rigtigere for en lønopgørelse — men det er et spørgsmål om overenskomst,
   * ikke om kode, og et gæt ville stå som en beregning.
   */
  it("⚠ EN NATTUR LIGGER HVOR DEN BEGYNDTE", () => {
    const nat = { id: "n", indMs: paa(2, 22), udMs: paa(3, 6) };
    const dage = ugedage(ugestart(MAN), [nat]);
    assert.equal(dage[2].minutter, 480, "onsdag skal bære hele vagten");
    assert.equal(dage[3].minutter, 0, "torsdag skal ikke bære noget");
  });

  /**
   * ⚠ EN DAG MED EN ÅBEN STEMPLING HAR IKKE ET TAL, og `null` bobler op
   * gennem ugesummen. "0:00" ville påstå at han ikke arbejdede.
   */
  it("⚠ EN ÅBEN VAGT GØR DAGEN OG UGEN UOPGJORT", () => {
    const dage = ugedage(ugestart(MAN), [
      { id: "a", indMs: paa(0, 6), udMs: paa(0, 14) },
      { id: "b", indMs: paa(1, 6) },
    ]);
    assert.equal(dage[0].minutter, 480);
    assert.equal(dage[1].minutter, null);
    assert.ok(dage[1].harAaben);
    assert.equal(ugesum(dage), null, "ugen kan ikke gøres op med en åben vagt");
  });

  it("en uge uden åbne kan gøres op", () => {
    const dage = ugedage(ugestart(MAN), [
      { id: "a", indMs: paa(0, 6), udMs: paa(0, 14) },
      { id: "b", indMs: paa(1, 6), udMs: paa(1, 12) },
    ]);
    assert.equal(ugesum(dage), 480 + 360);
  });

  it("syv dage, altid", () => {
    assert.equal(ugedage(ugestart(MAN), []).length, 7);
  });
});

describe("Hvad der må skrives", () => {
  const nu = paa(4, 12);

  it("en almindelig vagt er gyldig", () => {
    assert.deepEqual(valideStempling({ indMs: paa(4, 6), udMs: paa(4, 14) }, { nu }), []);
    assert.deepEqual(valideStempling({ indMs: paa(4, 6) }, { nu }), []);
  });

  it("uden indMs afvises den", () => {
    assert.match(valideStempling({}, { nu }).join(), /starttidspunkt/);
  });

  it("⚠ UD FØR IND AFVISES", () => {
    assert.match(
      valideStempling({ indMs: paa(4, 14), udMs: paa(4, 6) }, { nu }).join(),
      /ikke stemple ud før/);
  });

  /**
   * ⚠ LOFTET ER EN AFVISNING, IKKE EN AFKORTNING. En glemt udstempling ville
   * give en vagt på hundrede timer, som står i en opgørelse som om nogen
   * arbejdede. At gætte midnat ville være en måling vi fandt på.
   */
  it("⚠ OVER ET DØGN AFVISES", () => {
    const fejl = valideStempling(
      { indMs: paa(0, 6), udMs: paa(1, 7) }, { nu: paa(1, 8) });
    assert.match(fejl.join(), /over et døgn/);
    /* Præcis et døgn går igennem. */
    assert.deepEqual(
      valideStempling({ indMs: paa(0, 6), udMs: paa(1, 6) }, { nu: paa(1, 8) }), []);
  });

  /**
   * ⚠ ET FREMTIDIGT TIDSPUNKT ER EN URFEJL. Telefonen sætter tiden (som på en
   * statusmelding, beslutning 103), og et ur der er en måned foran ville
   * lægge vagten i en fremtidig uge hvor ingen leder efter den.
   */
  it("⚠ ET UR DER ER FORAN AFVISES", () => {
    assert.match(valideStempling({ indMs: nu + 4 * T }, { nu }).join(), /fremtiden/);
    /* To timer er tilladt — en tidszone eller et ur der går lidt. */
    assert.deepEqual(valideStempling({ indMs: nu + T }, { nu }), []);
  });

  it("et ukendt felt afvises", () => {
    assert.match(valideStempling({ indMs: nu, lat: 55.4 }, { nu }).join(),
      /Ukendt felt: lat/);
  });
});

describe("Reglen", () => {
  it("noden hører til bemanding, i både tabellen og reglen", () => {
    assert.equal(NODE_MODUL.stemplinger, "bemanding");
    assert.match(NODE.$personId[".read"], /child\('bemanding'\)/);
    assert.match(POST[".write"], /child\('bemanding'\)/);
  });

  /**
   * ⚠ INGEN `.read` PÅ BEHOLDEREN. Den ville kaskadere, og så kunne enhver
   * chauffør se hvornår hver kollega mødte.
   */
  it("⚠ LÆSNINGEN LIGGER PÅ personId, IKKE PÅ NODEN", () => {
    assert.ok(!(".read" in NODE), "en .read på stemplinger kaskaderer");
    assert.ok(NODE.$personId[".read"], "der er ingen læsning overhovedet");
  });

  /**
   * ⚠ DET ER STIEN DER GØR REGLEN MULIG. På `statushaendelser` lå ejerskabet
   * INDE i posten, og en regel kunne ikke afgøre om etapen var chaufførens —
   * derfor en Cloud Function (beslutning 103). Her står personId i stien.
   */
  it("⚠ EJERSKABET SLÅS OP I brugere/<uid>/personId", () => {
    assert.match(NODE.$personId[".read"], /child\('brugere'\)\.child\(auth\.uid\)\.child\('personId'\)/);
    assert.match(POST[".write"], /child\('brugere'\)\.child\(auth\.uid\)\.child\('personId'\)/);
  });

  it("kontoret læser med personale.laes", () => {
    assert.match(NODE.$personId[".read"], /personale\.laes/);
  });

  /**
   * ⚠ BESLUTNING 121 — PERMISSION OVEN PÅ EJERSKAB, IKKE I STEDET FOR.
   * Ejerskabstjekket forsvinder ikke: man kan stadig kun læse/skrive sit
   * EGET ur. De to nye permissions er en ekstra spærring en tenant kan slå
   * fra pr. rolle — de erstatter intet.
   */
  it("⚠ EGEN LÆSNING KRÆVER OGSÅ stemplinger.laes", () => {
    assert.match(NODE.$personId[".read"], /stemplinger\.laes/);
    /* Ejerskabsopslaget står stadig, og det er derfor "oven på" og ikke
       "i stedet for" — begge tjek i samme udtryk. */
    assert.match(NODE.$personId[".read"],
      /personId'\)\.val\(\) === \$personId && auth\.token\.perms != null && auth\.token\.perms\.contains\('\|stemplinger\.laes\|'\)/);
  });

  it("⚠ EGEN SKRIVNING KRÆVER OGSÅ stemplinger.skriv", () => {
    assert.match(POST[".write"], /stemplinger\.skriv/);
  });

  /**
   * ⚠ EN LUKKET VAGT ER FROSSET. Ellers kunne gårsdagens timer rettes efter
   * at kontoret havde set dem. Leddet står på POSTEN og ikke på feltet:
   * `.write` kaskaderer, og en `.validate` køres slet ikke ved en sletning.
   * Samme figur som underskriften i beslutning 52.
   */
  it("⚠ EN POST MED udMs KAN IKKE SKRIVES IGEN", () => {
    assert.match(POST[".write"], /!data\.child\('udMs'\)\.exists\(\)/);
  });

  it("⚠ OG DEN KAN IKKE SLETTES", () => {
    assert.match(POST[".write"], /newData\.exists\(\)/);
  });

  it("felterne i reglen er dem modellen kender", () => {
    const iRegel = Object.keys(POST).filter((k) => !k.startsWith(".") && k !== "$andet");
    assert.deepEqual(iRegel.sort(), [...STEMPLING_FELTER].sort());
    assert.equal(POST.$andet[".validate"], false);
  });

  it("⚠ REGLEN HÅNDHÆVER OGSÅ DØGNLOFTET", () => {
    /* En klientvalidering der ikke også står i reglerne, tillader før eller
       siden noget serveren skulle have stoppet. */
    assert.match(POST.udMs[".validate"], /86400000/);
    assert.match(POST.udMs[".validate"], />= newData\.parent\(\)\.child\('indMs'\)/);
  });

  /**
   * ⚠ INGEN POSITION. Specifikationen siger at positionen registreres;
   * beslutning 22 siger INGEN GPS. Spørgsmålet er stillet og ikke besvaret,
   * og et felt reglen tillader og ingen skriver, kan fyldes med hvad som
   * helst.
   */
  it("⚠ REGLEN TILLADER INGEN KOORDINATER", () => {
    for (const felt of Object.keys(POST)) {
      assert.ok(!/lat|lon|position|gps/i.test(felt), `reglen tillader ${felt}`);
    }
    for (const felt of STEMPLING_FELTER) {
      assert.ok(!/lat|lon|position|gps/i.test(felt), `modellen kender ${felt}`);
    }
  });
});

describe("Demosættet har nodens form", () => {
  it("nøglet på personId, og hver person findes i personale", () => {
    const kendte = new Set(DEMO_PERSONALE.map((p) => p.id));
    for (const personId of Object.keys(DEMO_STEMPLINGER)) {
      assert.ok(kendte.has(personId), `${personId} står ikke i DEMO_PERSONALE`);
      assert.ok(!Array.isArray(DEMO_STEMPLINGER[personId]),
        `${personId} er en array — noden er nøglet (beslutning 76)`);
    }
  });

  /**
   * ⚠ PRÆCIS ÉN ÅBEN. Er der ingen, kan skærmens "Stemplet IND" aldrig ses i
   * demo; er der to, står den ene som en vagt der aldrig blev lukket.
   */
  it("⚠ ÉN ÅBEN STEMPLING, SÅ BEGGE TILSTANDE KAN SES", () => {
    const alle = Object.values(DEMO_STEMPLINGER).flatMap((m) => Object.values(m));
    assert.equal(alle.filter(erAaben).length, 1);
  });

  it("hver stempling er gyldig", () => {
    const nu = Date.now();
    for (const [personId, poster] of Object.entries(DEMO_STEMPLINGER)) {
      for (const [id, s] of Object.entries(poster)) {
        assert.deepEqual(valideStempling(s, { nu }), [],
          `${personId}/${id} er ikke gyldig`);
      }
    }
  });

  it("⚠ OG INGEN AF DEM BÆRER EN POSITION", () => {
    for (const poster of Object.values(DEMO_STEMPLINGER)) {
      for (const s of Object.values(poster)) {
        for (const f of Object.keys(s)) {
          assert.ok(!/lat|lon|position|gps/i.test(f),
            `demosættet ville besvare et åbent spørgsmål med feltet ${f}`);
        }
      }
    }
  });
});

describe("Skærmen", () => {
  const SKAERM = udenKommentarer(
    readFileSync("src/moduler/app/Timeregistrering.jsx", "utf8"));

  it("den skriver gennem skriv.js", () => {
    assert.match(SKAERM, /gem\(\{/);
    assert.ok(!/db\.ref\(/.test(SKAERM));
  });

  /**
   * ⚠ IND OG UD ER SAMME POST. To poster ville skulle parres bagefter, og en
   * glemt udstempling ville efterlade en post der ikke betød noget.
   */
  it("⚠ UDSTEMPLING RETTER DEN ÅBNE POST", () => {
    assert.match(SKAERM, /aaben \? \{ \.\.\.aaben, udMs: nu \} : \{ indMs: nu \}/);
    assert.match(SKAERM, /const id = aaben \? aaben\.id : nyId/);
  });

  it("⚠ OG DEN PRØVER MED SAMME valideStempling SOM REGLEN SPEJLER", () => {
    assert.match(SKAERM, /valideStempling\(post, \{ nu \}\)/);
  });

  /**
   * ⚠ TEKSTEN SIGER HVAD DER SKER. Specifikationens kort lover at positionen
   * registreres; indtil spørgsmålet er besvaret, står der det modsatte —
   * frem for ingenting, som ville lade chaufføren gætte.
   */
  it("⚠ SKÆRMEN SIGER AT DER IKKE REGISTRERES POSITION", () => {
    assert.match(SKAERM, /ingen position/);
    const forside = readFileSync("src/moduler/app/Forside.jsx", "utf8");
    assert.match(forside, /ingen position/);
  });
});
