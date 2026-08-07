/* test/rules.personale.test.mjs
 * Beslutning 18: personale og flåde som entiteter.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, get, remove, update } from "firebase/database";
import { PERM, ALLE_PERMS, permStreng } from "../src/fleet/permissions.js";
import { FUNKTION, PERSONALE_STATUS, kanDisponeres as personKanDisponeres } from "../src/fleet/personale.js";
import {
  ENHEDSART, GRUPPE, kanDisponeres, samletLaengdeMm, driftPrKmOere, gruppeFor,
} from "../src/fleet/flaade.js";

const T = "tenantPers";
let miljoe;

const medPerms = (uid, perms) =>
  miljoe.authenticatedContext(uid, { tenant: T, rolle: "admin", perms: permStreng(perms) }).database();

const sti = (node, id) => `tenants/${T}/${node}/${id}`;

const PERSON = {
  navn: "Lars Aage", division: "faelles", status: "aktiv",
  ansaettelsesform: "fastansat",
  funktioner: { [FUNKTION.chauffoer]: true, [FUNKTION.mekaniker]: true },
};
const ENHED = {
  registrering: "AB 12 345", navn: "Volvo FH 500", art: "lastbil",
  status: "aktiv", division: "gods", laengdeMm: 10500, driftPrKmOere: 342,
};

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-pers",
    database: { host: "127.0.0.1", port: 9000, rules: readFileSync("firebase.rules.json", "utf8") },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${T}/_findes`), true);
    await set(ref(db, sti("personale", "p-fast")), PERSON);
    await set(ref(db, sti("koeretoejer", "k-fast")), ENHED);
    await set(ref(db, `tenants/${T}/sensitive/personale/p-fast`), { cpr: "0101801234" });
  });
});

after(async () => { await miljoe?.cleanup(); });

/* ---- Personale ------------------------------------------------------ */

describe("personale", () => {
  it("kan læses med personale.laes, som alle presets har", async () => {
    const db = medPerms("uid-laes", [PERM.personaleLaes]);
    await assertSucceeds(get(ref(db, `tenants/${T}/personale`)));
  });

  it("kun personale.skriv kan oprette — også med alle andre permissions", async () => {
    const med = medPerms("uid-skriv", [PERM.personaleSkriv]);
    await assertSucceeds(set(ref(med, sti("personale", "p-ny")), PERSON));

    const uden = medPerms("uid-uskriv", ALLE_PERMS.filter((p) => p !== PERM.personaleSkriv));
    await assertFails(set(ref(uden, sti("personale", "p-nej")), PERSON));
  });

  /* En fratraadt medarbejder bliver staaende: der haenger reservationer,
     indberetninger og bookinger paa personId'et. Reglen ligger paa $personId
     og ikke paa samlingen — paa samlingen ville newData stadig findes efter
     at een person var slettet, og saa afviser den ingenting. */
  it("kan IKKE slettes — heller ikke med alle permissions", async () => {
    const db = medPerms("uid-slet", ALLE_PERMS);
    await assertFails(remove(ref(db, sti("personale", "p-fast"))));
    await assertFails(set(ref(db, sti("personale", "p-fast")), null));
    await assertFails(update(ref(db, `tenants/${T}/personale`), { "p-fast": null }));

    /* Men man må sætte status til fratraadt. */
    await assertSucceeds(set(ref(db, sti("personale", "p-fast") + "/status"), "fratraadt"));
    await assertSucceeds(set(ref(db, sti("personale", "p-fast") + "/status"), "aktiv"));
  });

  it("afviser ukendt status og ansættelsesform", async () => {
    const db = medPerms("uid-enum", ALLE_PERMS);
    await assertFails(set(ref(db, sti("personale", "p-e1")), { ...PERSON, status: "opsagt" }));
    await assertFails(set(ref(db, sti("personale", "p-e2")), { ...PERSON, ansaettelsesform: "freelance" }));
    await assertFails(set(ref(db, sti("personale", "p-e3")), { navn: "Uden", division: "gods" }));
  });

  /* Beslutning 15: en person med C+D er faelles. Det er en ANDEN akse end
     funktioner — han kan være chauffoer OG mekaniker uafhaengigt af det. */
  it("accepterer faelles som division", async () => {
    const db = medPerms("uid-div", ALLE_PERMS);
    await assertSucceeds(set(ref(db, sti("personale", "p-div")), { ...PERSON, division: "faelles" }));
    await assertFails(set(ref(db, sti("personale", "p-div2")), { ...PERSON, division: "taxa" }));
  });

  it("CPR kan ikke stå i general — den hører i sensitive/personale", async () => {
    const db = medPerms("uid-cpr", ALLE_PERMS);
    await assertFails(set(ref(db, sti("personale", "p-cpr")), { ...PERSON, cpr: "0101801234" }));
    await assertFails(set(ref(db, sti("personale", "p-cpr")), { ...PERSON, privatAdresse: "Strandvejen 1" }));
  });
});

describe("sensitive/personale", () => {
  it("kræver personale.sensitiveLaes — også med alle andre permissions", async () => {
    const med = medPerms("uid-sens", [PERM.personaleSensitiveLaes]);
    await assertSucceeds(get(ref(med, `tenants/${T}/sensitive/personale`)));

    const uden = medPerms("uid-usens", ALLE_PERMS.filter((p) => p !== PERM.personaleSensitiveLaes));
    await assertFails(get(ref(uden, `tenants/${T}/sensitive/personale`)));
  });

  /* personale.laes giver general — ikke det klassificerede. Samme regel som
     booking.laes i beslutning 17: den grovere arver ikke den finere. */
  it("personale.laes ALENE giver ikke sensitive", async () => {
    const db = medPerms("uid-kun", [PERM.personaleLaes]);
    await assertSucceeds(get(ref(db, `tenants/${T}/personale`)));
    await assertFails(get(ref(db, `tenants/${T}/sensitive/personale`)));
    await assertFails(get(ref(db, `tenants/${T}/sensitive/personale/p-fast/cpr`)));
  });
});

/* ---- Kompetencer ---------------------------------------------------- */

describe("kompetencer", () => {
  const KOMP = { personId: "p-fast", type: "adr", udloeberMs: 1790000000000 };

  it("er en egen node, indekseret på udløbsdato på tværs af personer", () => {
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    ).rules.tenants.$tenantId;
    assert.ok(regler.kompetencer, "kompetencer skal være en egen node, ikke under personale");
    assert.ok(
      regler.kompetencer[".indexOn"].includes("udloeberMs"),
      "uden indeks på udloeberMs kan 'hvad udløber inden for 30 dage' ikke forespørges"
    );
  });

  it("kræver kompetencer.skriv, og kan ikke slettes", async () => {
    const med = medPerms("uid-komp", [PERM.kompetencerSkriv]);
    await assertSucceeds(set(ref(med, sti("kompetencer", "kmp1")), KOMP));
    await assertFails(remove(ref(med, sti("kompetencer", "kmp1"))));

    const uden = medPerms("uid-ukomp", ALLE_PERMS.filter((p) => p !== PERM.kompetencerSkriv));
    await assertFails(set(ref(uden, sti("kompetencer", "kmp2")), KOMP));
  });

  it("har ingen division — den arves fra personen", async () => {
    const db = medPerms("uid-kdiv", ALLE_PERMS);
    await assertFails(set(ref(db, sti("kompetencer", "kmp3")), { ...KOMP, division: "gods" }));
  });
});

/* ---- Flåden --------------------------------------------------------- */

describe("køretøjer", () => {
  it("kræver art og status, og afviser ukendte værdier", async () => {
    const db = medPerms("uid-art", ALLE_PERMS);
    await assertSucceeds(set(ref(db, sti("koeretoejer", "k-ok")), ENHED));
    await assertFails(set(ref(db, sti("koeretoejer", "k-1")), { ...ENHED, art: "helikopter" }));
    await assertFails(set(ref(db, sti("koeretoejer", "k-2")), { ...ENHED, status: "istykker" }));
    const { art, ...udenArt } = ENHED;
    await assertFails(set(ref(db, sti("koeretoejer", "k-3")), udenArt));
  });

  it("accepterer alle syv arter", async () => {
    const db = medPerms("uid-arter", ALLE_PERMS);
    for (const art of Object.keys(ENHEDSART)) {
      await assertSucceeds(set(ref(db, sti("koeretoejer", `k-${art}`)), { ...ENHED, art }));
    }
  });

  it("en solgt bil kan ikke slettes — der hænger historik på id'et", async () => {
    const db = medPerms("uid-kslet", ALLE_PERMS);
    await assertSucceeds(set(ref(db, sti("koeretoejer", "k-fast") + "/status"), "solgt"));
    await assertFails(remove(ref(db, sti("koeretoejer", "k-fast"))));
  });

  it("afviser negativ eller manglende længde som tal", async () => {
    const db = medPerms("uid-laengde", ALLE_PERMS);
    await assertFails(set(ref(db, sti("koeretoejer", "k-l1")), { ...ENHED, laengdeMm: 0 }));
    await assertFails(set(ref(db, sti("koeretoejer", "k-l2")), { ...ENHED, laengdeMm: "10,5 m" }));
  });
});

/* ---- Flådelogikken, uden emulator ----------------------------------- */

describe("flaade.js", () => {
  const traekker = { id: "t1", art: "traekker", status: "aktiv", laengdeMm: 6000, driftPrKmOere: 342 };
  const trailer = { id: "tr1", art: "trailer", status: "aktiv", laengdeMm: 13600, driftPrKmOere: 88 };
  const scooter = { id: "s1", art: "scooter", status: "aktiv", laengdeMm: 1900, driftPrKmOere: 41 };

  it("en trailer kan ikke disponeres alene", () => {
    assert.equal(kanDisponeres([trailer]).ok, false);
    assert.equal(kanDisponeres([traekker, trailer]).ok, true);
    assert.equal(kanDisponeres([scooter]).ok, true);
  });

  it("en enhed der ikke er aktiv kan ikke disponeres", () => {
    const paaVaerksted = { ...traekker, status: "vaerksted" };
    const svar = kanDisponeres([paaVaerksted, trailer]);
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /værksted/i);
  });

  /* 6,0 m + 13,6 m = 19,6 m. Under 20 m — og det er dét der afgoer
     faergetaksten. En float ved graensen er en fejl der venter. */
  it("samlet længde summeres i millimeter", () => {
    assert.equal(samletLaengdeMm([traekker, trailer]), 19600);
    assert.equal(samletLaengdeMm([scooter]), 1900);
    assert.equal(samletLaengdeMm([]), 0);
  });

  it("driftsomkostningen summeres over enhederne — ét feltnavn, ikke to", () => {
    assert.equal(driftPrKmOere([traekker, trailer]), 430);
    assert.equal(driftPrKmOere([scooter]), 41);
  });

  it("grupperne er rigtige", () => {
    assert.equal(gruppeFor("trailer"), GRUPPE.paahaengt);
    assert.equal(gruppeFor("paahaeng"), GRUPPE.paahaengt);
    for (const a of ["traekker", "lastbil", "varevogn", "scooter", "truck"]) {
      assert.equal(gruppeFor(a), GRUPPE.motoriseret, `${a} skal være motoriseret`);
    }
  });

  it("en scooter har hverken tachograf eller køre-hviletid", () => {
    assert.equal(ENHEDSART.scooter.tachograf, false);
    assert.equal(ENHEDSART.scooter.koereHviletid, false);
    assert.equal(ENHEDSART.traekker.tachograf, true);
  });
});

describe("personale.js", () => {
  it("kun aktive kan disponeres", () => {
    assert.equal(personKanDisponeres({ status: "aktiv" }), true);
    assert.equal(personKanDisponeres({ status: "orlov" }), false);
    assert.equal(personKanDisponeres({ status: "fratraadt" }), false);
    assert.equal(personKanDisponeres({}), false);
  });

  it("statusværdierne i koden og i reglerne er de samme", () => {
    const regler = readFileSync("firebase.rules.json", "utf8");
    for (const s of Object.keys(PERSONALE_STATUS)) {
      assert.ok(regler.includes(s), `status "${s}" mangler i reglernes enum`);
    }
  });
});
