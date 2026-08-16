/* test/rules.kundepriser.test.mjs
 * Kundens prisafvigelse — PRISER.md etape 3.
 *
 * `kunder/<kundeId>/priser/<ydelseId>/satser/<satsId>`
 *
 * ⚠ HELE FILEN FINDES PAA GRUND AF EN KASKADE.
 *
 * .write kaskaderer i RTDB, og `kunder` er skrivbar med kunder.skriv — som
 * casehandler, disponent og koordinator alle har gennem BASIS_DATA.
 * satser.skriv har KUN admin. Uden et ekstra led ville en pris altsaa kunne
 * saettes af flere end standardprisen kan, alene fordi den ligger i en anden
 * sti. Det er ikke en rettighed nogen har besluttet at give; det er en der
 * foelger med stien.
 *
 * Leddet er en .validate paa `priser` der ogsaa kraever satser.skriv. En
 * .validate kan laese auth, og den kan stramme dér hvor en .write ikke kan
 * loesnes fra oven. Proeverne herunder er det eneste sted det bliver
 * DEMONSTRERET frem for paastaaet — og de er skrevet foer skaermen, netop
 * fordi hele placeringen stod og faldt med om de blev groenne.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, get } from "firebase/database";
import { PERM, ALLE_PERMS, permStreng, permStrengFraRolle } from "../src/fleet/permissions.js";
import { kundeprisSti, STANDARDGRUPPE } from "../src/fleet/pricing.js";

const T = "tenantKundepris";
const KUNDE = "k-nordisk";
const YDELSE = "lager-pluk";

let miljoe;

const medPerms = (uid, perms) =>
  miljoe.authenticatedContext(uid, { tenant: T, rolle: "casehandler", perms: permStreng(perms) }).database();

const somRolle = (uid, rolle) =>
  miljoe.authenticatedContext(uid, { tenant: T, rolle, perms: permStrengFraRolle(rolle) }).database();

const sti = (rest) => `tenants/${T}/${rest}`;
const prisSti = (satsId, kundeId = KUNDE) => sti(kundeprisSti(kundeId, YDELSE, satsId));

const NU = Date.UTC(2026, 7, 1);
const EGEN_PRIS = { gyldigFra: NU, beloebOere: 32500, valuta: "DKK" };
const RABAT = { gyldigFra: NU, rabatBps: 1500 };

/* Baade kunder.skriv og satser.skriv — det er hvad admin har. */
const BEGGE = [PERM.kunderSkriv, PERM.satserSkriv];

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-kundepriser",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${T}/_findes`), true);
    await set(ref(db, sti(`kunder/${KUNDE}`)), {
      navn: "Nordisk Transport", division: "gods", aktiv: true,
    });
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("kundeprisen kraever BEGGE permissions", () => {
  it("med kunder.skriv OG satser.skriv gaar den igennem", async () => {
    const db = medPerms("uid-begge", BEGGE);
    await assertSucceeds(set(ref(db, prisSti("s-egen")), EGEN_PRIS));
    await assertSucceeds(set(ref(db, prisSti("s-rabat")), RABAT));
  });

  /* ⚠ DEN VIGTIGSTE PROEVE I FILEN.
     Falder den, er kundeprisen i praksis flyttet fra admin til casehandler
     uden at nogen har besluttet det. */
  it("⚠ MED kunder.skriv ALENE afviser serveren — ogsaa med alt andet end satser.skriv", async () => {
    const udenSatser = ALLE_PERMS.filter((p) => p !== PERM.satserSkriv);
    const db = medPerms("uid-uden-satser", udenSatser);
    await assertFails(set(ref(db, prisSti("s-forsoeg")), EGEN_PRIS));
    await assertFails(set(ref(db, prisSti("s-forsoeg2")), RABAT));
  });

  /* Og de tre driftsroller er praecis dem der har kunder.skriv uden
     satser.skriv. Proeven binder rollelisten til reglen: gives satser.skriv
     til en af dem, skal det vaere en beslutning, ikke en bivirkning. */
  it("hverken casehandler, disponent eller koordinator kan saette en kundepris", async () => {
    for (const rolle of ["casehandler", "disponent", "koordinator"]) {
      const db = somRolle(`uid-${rolle}`, rolle);
      await assertFails(set(ref(db, prisSti(`s-${rolle}`)), EGEN_PRIS)).catch(() => {
        throw new Error(`${rolle} kunne saette en kundepris`);
      });
    }
  });

  it("admin kan", async () => {
    const db = somRolle("uid-admin", "admin");
    await assertSucceeds(set(ref(db, prisSti("s-admin")), EGEN_PRIS));
  });

  /* satser.skriv alene raekker ikke: .write paa kunder-noden er stadig det
     der aabner doeren. De to led er OG, ikke ELLER. */
  it("med satser.skriv alene afviser serveren ogsaa", async () => {
    const db = medPerms("uid-kun-satser", [PERM.satserSkriv, PERM.kunderLaes]);
    await assertFails(set(ref(db, prisSti("s-kun-satser")), EGEN_PRIS));
  });

  /* ⚠ DET LED DER AFGOER OM PLACERINGEN OVERHOVEDET HOLDER.
     .validate'en staar paa `priser`, og skrivningen her rammer et felt tre
     niveauer under. Kunne man skrive udenom ved at gaa dybt nok ned, ville
     hele konstruktionen vaere pynt. */
  it("⚠ EN DYB ENKELTFELT-SKRIVNING KOMMER HELLER IKKE UDENOM", async () => {
    const db = medPerms("uid-dyb", [PERM.kunderSkriv, PERM.kunderLaes]);
    await assertFails(set(ref(db, `${prisSti("s-egen")}/beloebOere`), 1));
    await assertFails(set(ref(db, `${prisSti("s-egen")}/rabatBps`), 9000));
  });

  /* Den anden vej: prisen maa heller ikke kunne vaskes ind gennem en
     opdatering af kunden selv. Skriver man hele kundeposten med `priser`
     paa, gaelder den samme .validate. */
  it("prisen kan ikke smugles med i en skrivning af hele kunden", async () => {
    const db = medPerms("uid-hel-kunde", [PERM.kunderSkriv]);
    await assertFails(set(ref(db, sti(`kunder/${KUNDE}`)), {
      navn: "Nordisk Transport", division: "gods", aktiv: true,
      priser: { [YDELSE]: { satser: { smuglet: EGEN_PRIS } } },
    }));
  });
});

describe("formen paa en kundesats", () => {
  const skriv = (satsId, post) => set(ref(medPerms("uid-form", BEGGE), prisSti(satsId)), post);

  /* ⚠ ENTEN EN EGEN PRIS ELLER EN RABAT — ALDRIG BEGGE.
     To felter der begge kan saette prisen, er to svar paa samme spoergsmaal,
     og saa bliver det tilfaeldigt hvilket der vinder. */
  it("afviser baade beloeb og rabat paa samme post", async () => {
    await assertFails(skriv("s-begge-felter", { gyldigFra: NU, beloebOere: 100, rabatBps: 1500 }));
  });

  it("afviser en post med hverken beloeb eller rabat", async () => {
    await assertFails(skriv("s-tom", { gyldigFra: NU, valuta: "DKK" }));
  });

  it("afviser en post uden gyldigFra", async () => {
    /* Uden datoen kan satsPaa() ikke svare paa hvad der gjaldt hvornaar — og
       saa er beslutning 7 sat ud af kraft for netop den kunde. */
    await assertFails(skriv("s-uden-dato", { beloebOere: 100 }));
  });

  it("afviser et beloeb der ikke er hele oerer", async () => {
    await assertFails(skriv("s-float", { gyldigFra: NU, beloebOere: 45.5 }));
    await assertFails(skriv("s-negativ", { gyldigFra: NU, beloebOere: -1 }));
  });

  it("afviser en rabat uden for 0–100 %", async () => {
    await assertFails(skriv("s-over", { gyldigFra: NU, rabatBps: 10001 }));
    await assertFails(skriv("s-under", { gyldigFra: NU, rabatBps: -1 }));
    await assertFails(skriv("s-bps-float", { gyldigFra: NU, rabatBps: 1500.5 }));
    /* 100 % er en gyldig rabat — nogen kan have besluttet at en ydelse er
       gratis for netop den kunde. Det er den MANGLENDE pris der er problemet. */
    await assertSucceeds(skriv("s-hel", { gyldigFra: NU, rabatBps: 10000 }));
  });

  it("afviser et ukendt felt", async () => {
    await assertFails(skriv("s-ukendt", { gyldigFra: NU, beloebOere: 100, note: "aftalt i telefonen" }));
  });

  /* ⚠ ARVET FRA $kundeId. Reglen paa kunden kraever `division`, og den
     gaelder ogsaa en skrivning dybt nede i undertraeet: efter fletningen
     mangler feltet, fordi kunden slet ikke findes. Prisen kan altsaa ikke
     komme til at haenge paa et kundeId der er tastet forkert. */
  it("⚠ EN PRIS PAA EN KUNDE DER IKKE FINDES, AFVISES", async () => {
    const db = medPerms("uid-fantom", BEGGE);
    await assertFails(set(ref(db, prisSti("s-fantom", "k-findes-ikke")), EGEN_PRIS));
  });
});

describe("standardprisen tager ikke en rabat", () => {
  /* Rabatten er kundens afvigelse FRA standarden. En rabat paa standarden
     selv ville vaere en rabat paa ingenting — og to steder der begge kunne
     saette den samme pris. */
  it("satser/standard afviser rabatBps", async () => {
    const db = medPerms("uid-std", [PERM.satserSkriv]);
    await assertFails(set(
      ref(db, sti(`satser/${STANDARDGRUPPE}/${YDELSE}/satser/s-rabat`)),
      { gyldigFra: NU, rabatBps: 1500 }));
    await assertSucceeds(set(
      ref(db, sti(`satser/${STANDARDGRUPPE}/${YDELSE}/satser/s-ok`)),
      { gyldigFra: NU, beloebOere: 37500 }));
  });
});

describe("laesningen foelger kunden", () => {
  /* ⚠ PRISEN PAA KUNDEN LAESES MED kunder.laes, IKKE MED EN EGEN PERMISSION.
     .read kaskaderer, og det er den anden side af den afvejning der ligger i
     placeringen: enhver der maa se kunden, ser ogsaa hendes rabat. I dag
     betyder det ingen forskel — kunder.laes ligger i BASIS_LAES, saa alle
     roller har den — men forskellen skal staa skrevet frem for at blive
     opdaget. */
  it("en chauffoer kan laese kundens priser", async () => {
    const db = somRolle("uid-chauffoer", "chauffoer");
    await assertSucceeds(get(ref(db, sti(`kunder/${KUNDE}/priser`))));
  });

  it("uden kunder.laes kan hun ikke", async () => {
    const db = medPerms("uid-uden-laes", ALLE_PERMS.filter((p) => p !== PERM.kunderLaes));
    await assertFails(get(ref(db, sti(`kunder/${KUNDE}/priser`))));
  });
});
