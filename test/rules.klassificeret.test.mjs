/* test/rules.klassificeret.test.mjs
 * Punkt 5+6, trin 2: securityLevel og de klassificerede undertraeer.
 *
 * DEFINITION OF DONE:
 *   - booking.laes ALENE giver adgang til general — og til hverken
 *     sensitive/ eller vaerdi/. Den grovere permission arver ikke den finere
 *   - serveren afviser; det er ikke UI'et der skjuler
 *   - laesningen auditeres
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, get } from "firebase/database";
import {
  PERM, ALLE_PERMS, ROLLE_PERMS, permStreng, permStrengFraRolle,
} from "../src/fleet/permissions.js";

const T = "tenantKlas";
const FREMMED = "tenantKlasB";

let miljoe;

const medPerms = (uid, perms, tenant = T) =>
  miljoe
    .authenticatedContext(uid, { tenant, rolle: "casehandler", perms: permStreng(perms) })
    .database();

const somRolle = (uid, rolle) =>
  miljoe
    .authenticatedContext(uid, { tenant: T, rolle, perms: permStrengFraRolle(rolle) })
    .database();

const GENERAL = `tenants/${T}/bookinger`;
const SENSITIVE = `tenants/${T}/sensitive/bookinger`;
const VAERDI = `tenants/${T}/vaerdi/bookinger`;

const REGLER = JSON.parse(
  readFileSync("firebase.rules.json", "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
).rules.tenants.$tenantId;

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-klas",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    for (const t of [T, FREMMED]) {
      await set(ref(db, `tenants/${t}/_findes`), true);
      await set(ref(db, `tenants/${t}/bookinger/b1`), {
        nummer: "BKG-2026-00001", securityLevel: "confidential",
      });
      await set(ref(db, `tenants/${t}/sensitive/bookinger/b1`), {
        securityInformation: "Kræver følgebil",
        privatePickupAddress: "Strandvejen 123",
        sensitiveNotes: "Ejer ønsker ikke omtale",
      });
      await set(ref(db, `tenants/${t}/vaerdi/bookinger/b1`), { cargoValue: 1800000000 });
    }
  });
});

after(async () => {
  await miljoe?.cleanup();
});

/* ---- DoD: den grovere arver ikke den finere ------------------------- */

describe("booking.laes giver general — og intet mere", () => {
  /* SELVE DEFINITION OF DONE.
     Det er ikke bare at brugeren mangler den rigtige permission. Det er at
     den GROVERE permission ikke arver den finere. Det er fejlen man laver,
     naar man senere skal "goere det nemmere" for en kunde: man giver
     booking.laes og gaar ud fra at resten foelger med. */
  it("booking.laes ALENE: general ja, sensitive nej, vaerdi nej", async () => {
    const db = medPerms("uid-kunlaes", [PERM.bookingLaes]);
    await assertSucceeds(get(ref(db, GENERAL)));
    await assertFails(get(ref(db, SENSITIVE)));
    await assertFails(get(ref(db, VAERDI)));
    /* Heller ikke en enkelt post, og heller ikke et enkelt felt. */
    await assertFails(get(ref(db, `${SENSITIVE}/b1`)));
    await assertFails(get(ref(db, `${SENSITIVE}/b1/securityInformation`)));
    await assertFails(get(ref(db, `${VAERDI}/b1/cargoValue`)));
  });

  /* sensitive og vaerdi er SIDEORDNEDE, ikke trin paa en stige. */
  it("booking.sensitiveLaes giver ikke vaerdi — og omvendt", async () => {
    const kunSensitive = medPerms("uid-sens", [PERM.bookingLaes, PERM.bookingSensitiveLaes]);
    await assertSucceeds(get(ref(kunSensitive, SENSITIVE)));
    await assertFails(get(ref(kunSensitive, VAERDI)));

    const kunVaerdi = medPerms("uid-vaerdi", [PERM.bookingLaes, PERM.bookingVaerdiLaes]);
    await assertSucceeds(get(ref(kunVaerdi, VAERDI)));
    await assertFails(get(ref(kunVaerdi, SENSITIVE)));
  });

  it("uden booking.laes er selv general lukket — også med alt andet", async () => {
    const db = medPerms("uid-udenlaes", ALLE_PERMS.filter((p) => p !== PERM.bookingLaes));
    await assertFails(get(ref(db, GENERAL)));
    /* Men sensitive er stadig aaben, for den har sin egen permission.
       De to niveauer er uafhaengige — det er hele pointen. */
    await assertSucceeds(get(ref(db, SENSITIVE)));
  });
});

/* ---- Kaskaden maa ikke snige sig ind igen --------------------------- */

describe("undertræerne har selv ingen .read", () => {
  it("hverken sensitive eller vaerdi har .read på sig selv", () => {
    for (const undertrae of ["sensitive", "vaerdi"]) {
      assert.equal(
        REGLER[undertrae][".read"], undefined,
        `En .read på "${undertrae}" kaskaderer ned over hvert objekt derunder, ` +
        `og så er hele opdelingen væk. Læg den på ${undertrae}/<objekt> i stedet.`
      );
    }
  });

  it("selv med alle 28 permissions kan undertræet ikke læses som helhed", async () => {
    const db = medPerms("uid-alt", ALLE_PERMS);
    await assertFails(get(ref(db, `tenants/${T}/sensitive`)));
    await assertFails(get(ref(db, `tenants/${T}/vaerdi`)));
    /* Men objekterne under kan. */
    await assertSucceeds(get(ref(db, SENSITIVE)));
    await assertSucceeds(get(ref(db, VAERDI)));
  });

  it("tenant A kan ikke læse tenant B's klassificerede data", async () => {
    const db = medPerms("uid-a", ALLE_PERMS);
    await assertFails(get(ref(db, `tenants/${FREMMED}/sensitive/bookinger`)));
    await assertFails(get(ref(db, `tenants/${FREMMED}/vaerdi/bookinger`)));
  });
});

/* ---- Fordelingen ---------------------------------------------------- */

describe("rolle-presets efter beslutning 17", () => {
  it("disponenten ser følgebilskravet, men ikke vurderingen", async () => {
    const db = somRolle("uid-disp", "disponent");
    await assertSucceeds(get(ref(db, GENERAL)));
    await assertSucceeds(get(ref(db, SENSITIVE)));
    await assertFails(get(ref(db, VAERDI)));
  });

  it("koordinatoren ser begge dele", async () => {
    const db = somRolle("uid-koord", "koordinator");
    await assertSucceeds(get(ref(db, SENSITIVE)));
    await assertSucceeds(get(ref(db, VAERDI)));
  });

  it("chaufføren ser hverken sensitive eller vaerdi", async () => {
    const db = somRolle("uid-ch", "chauffoer");
    await assertSucceeds(get(ref(db, GENERAL)));
    await assertFails(get(ref(db, SENSITIVE)));
    await assertFails(get(ref(db, VAERDI)));
  });

  /* Revisor er den bredeste rolle paa loggen og den smalleste paa data. */
  it("revisoren ser general, men intet klassificeret", async () => {
    const db = somRolle("uid-rev", "revisor");
    await assertSucceeds(get(ref(db, GENERAL)));
    await assertFails(get(ref(db, SENSITIVE)));
    await assertFails(get(ref(db, VAERDI)));
  });

  it("kun admin ser fraværets årsag — helbredsoplysning, GDPR art. 9", () => {
    for (const rolle of ["chauffoer", "casehandler", "disponent", "koordinator", "revisor"]) {
      assert.ok(
        !ROLLE_PERMS[rolle].includes(PERM.fravaerSensitiveLaes),
        `"${rolle}" har fravaer.sensitiveLaes — disponeringen skal vide AT chaufføren ` +
        `er utilgængelig, ikke hvorfor.`
      );
    }
    assert.ok(ROLLE_PERMS.admin.includes(PERM.fravaerSensitiveLaes));
  });

  it("ingen preset har vaerdiLaes uden også at have sensitiveLaes", () => {
    for (const [rolle, perms] of Object.entries(ROLLE_PERMS)) {
      if (perms.includes(PERM.bookingVaerdiLaes)) {
        assert.ok(
          perms.includes(PERM.bookingSensitiveLaes),
          `"${rolle}" ser vurderingen men ikke sikkerhedsinformationen. ` +
          `Teknisk lovligt — de er sideordnede — men næsten altid en fejl.`
        );
      }
    }
  });
});

/* ---- securityLevel -------------------------------------------------- */

describe("securityLevel", () => {
  const kunde = (niveau) => ({
    navn: "Kunde", aktiv: true,
    ...(niveau === undefined ? {} : { securityLevel: niveau }),
  });

  it("accepterer de fire niveauer", async () => {
    const db = medPerms("uid-lvl", ALLE_PERMS);
    for (const n of ["normal", "internal", "confidential", "restricted"]) {
      await assertSucceeds(set(ref(db, `tenants/${T}/kunder/k-${n}`), kunde(n)));
    }
  });

  it("afviser ukendte niveauer", async () => {
    const db = medPerms("uid-lvl2", ALLE_PERMS);
    for (const n of ["Normal", "SECRET", "hemmelig", "", "confidential ", 3, true]) {
      await assertFails(set(ref(db, `tenants/${T}/kunder/k-ugyldig`), kunde(n)));
    }
  });

  /* Feltet er valgfrit: mangler det, er posten normal. Ellers ville hver
     eksisterende post skulle migreres for at kunne skrives. */
  it("er valgfrit — uden feltet er posten normal", async () => {
    const db = medPerms("uid-lvl3", ALLE_PERMS);
    await assertSucceeds(set(ref(db, `tenants/${T}/kunder/k-uden`), kunde(undefined)));
  });

  /* securityLevel staar paa GENERAL, saa en liste kan vise en haengelaas
     uden at hente noget klassificeret. */
  it("kan læses med kun booking.laes — det er derfor det står på general", async () => {
    const db = medPerms("uid-lvl4", [PERM.bookingLaes]);
    const snap = await assertSucceeds(get(ref(db, `${GENERAL}/b1/securityLevel`)));
    assert.equal(snap.val(), "confidential");
  });
});
