/* test/rules.braendstofmatch.test.mjs
 * Brændstofmatch — G.2. RTDB-noden der forbinder en indkøbslinje med en
 * tankning.
 *
 * ⚠ SAMME MØNSTER SOM rules.dokumenter.test.mjs. `braendstofmatch` er
 * `.write: false` — vejen ind er `braendstofAutomatch`/
 * `braendstofMatchBekraeft` (Admin SDK) alene, se deres egen note i
 * functions/index.js for HVORFOR feltet ikke bare ligger nestet under den
 * i forvejen skrivbare `indkoeb/$id`. Testene her spørger derfor om det
 * der FAKTISK kan efterprøves med en klient: at ingen kan skrive, uanset
 * permission, og at læsningen er korrekt gated og tenant-isoleret.
 * Kildeteksttjekket af selve funktionerne står i
 * test/g2-braendstofmatch-cloud.test.mjs, og de rene match-funktioner i
 * test/braendstofmatch.test.mjs.
 *
 * Koer: npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { ref, set, update, get } from "firebase/database";
import { PERM, ALLE_PERMS, permStreng } from "../src/fleet/permissions.js";

const T = "tenantBmatch";
const ANDEN_TENANT = "tenantBmatchAnden";
const INDKOEB = "ik-diesel-1";
const TANKNING = "ind-tankning-1";
const KOERETOEJ = "kt-1";

let miljoe;

const somMed = (uid, perms, tenant = T) =>
  miljoe.authenticatedContext(uid, {
    tenant, rolle: "admin", perms: permStreng(perms),
  }).database();

const matchSti = (tenant, indkoebId) => `tenants/${tenant}/braendstofmatch/${indkoebId}`;

const GYLDIGT_MATCH = (indkoebId, tankningId) => ({
  indkoebId, tilstand: "matchet", tankningId,
  automatisk: false, afgjortAf: "u-kontor", afgjortMs: 1786000000000,
});

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-braendstofmatch",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    for (const t of [T, ANDEN_TENANT]) {
      await set(ref(db, `tenants/${t}/_findes`), true);
      await set(ref(db, `tenants/${t}/leverandoerer/lv-fuel`), {
        navn: "Circle K", kategori: "braendstof", aktiv: true,
      });
      await set(ref(db, `tenants/${t}/koeretoejer/${KOERETOEJ}`), {
        art: "lastbil", status: "aktiv",
      });
      await set(ref(db, `tenants/${t}/indkoeb/${INDKOEB}`), {
        dato: 1786000000000, leverandoerId: "lv-fuel", vare: "Diesel",
        antal: 450, prisPrEnhedOere: 1195, fakturastatus: "modtaget", kategori: "braendstof",
      });
      await set(ref(db, `tenants/${t}/indberetninger/${TANKNING}`), {
        art: "braendstof", oprettetAf: "u-chauffoer", oprettetMs: 1786000000000,
        koeretoejId: KOERETOEJ, dato: "2026-08-20", liter: 45,
      });
      /* ⚠ SEEDES SOM ADMIN SDK VILLE HAVE SKREVET DEN — braendstofMatch
         Bekraeft/-Automatch er de ENESTE reelle veje til en post her. */
      await set(ref(db, matchSti(t, INDKOEB)), GYLDIGT_MATCH(INDKOEB, TANKNING));
    }
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("⚠ NODEN ER LUKKET — vejen ind er braendstofAutomatch/braendstofMatchBekraeft", () => {
  it("⚠ EN BRUGER MED indkoeb.skriv KAN IKKE SKRIVE ET MATCH DIREKTE", async () => {
    const db = somMed("uid-kun-skriv", [PERM.indkoebSkriv]);
    await assertFails(set(ref(db, matchSti(T, "ik-forsoeg")), GYLDIGT_MATCH("ik-forsoeg", TANKNING)));
  });

  it("⚠ HELLER IKKE MED ALLE PERMISSIONS", async () => {
    const db = somMed("uid-alt", ALLE_PERMS);
    await assertFails(set(ref(db, matchSti(T, "ik-admin")), GYLDIGT_MATCH("ik-admin", TANKNING)));
  });

  it("en opdatering af et eksisterende match afvises også", async () => {
    const db = somMed("uid-opdater", ALLE_PERMS);
    await assertFails(update(ref(db, matchSti(T, INDKOEB)), { tilstand: "ikkeMatchbar" }));
  });

  it("⚠ INGEN HARDSLET FRA KLIENTEN — set(null) på et eksisterende match afvises", async () => {
    const db = somMed("uid-slet", ALLE_PERMS);
    await assertFails(set(ref(db, matchSti(T, INDKOEB)), null));
  });

  it("⚠ REGELFILEN SIGER DET SAMME — braendstofmatch/.write er false", () => {
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10))
    );
    const node = regler.rules.tenants.$tenantId.braendstofmatch;
    assert.equal(node[".write"], false,
      "braendstofmatch er skrivbar — så kan et match skrives uden om Cloud Functions");
  });
});

describe("Skemaet — samme spærringer som firebase.rules.json beskriver", () => {
  /* ⚠ NODEN ER .write: false, SÅ EN "FORKERT POST" KAN IKKE SKRIVES AF EN
     KLIENT FOR AT BEVISE AT SKEMAET AFVISER DEN — vejen er allerede lukket
     før skemaet overhovedet kommer i spil. Det .validate FAKTISK siger,
     kan derfor kun efterprøves som tekst her; den reelle håndhævelse (at
     Cloud Function'en selv aldrig SKRIVER en post der bryder skemaet) er
     dækket af test/g2-braendstofmatch-cloud.test.mjs. */
  it("⚠ tankningId SKAL PEGE PÅ EN INDBERETNING MED art braendstof", () => {
    const regler = readFileSync("firebase.rules.json", "utf8");
    assert.match(regler, /child\('art'\)\.val\(\) === 'braendstof'/);
  });

  it("⚠ EN 'ikkeMatchbar'-POST UDEN ikkeMatchbarGrund ER UGYLDIG (per skemaets tekst)", () => {
    const regler = readFileSync("firebase.rules.json", "utf8");
    assert.match(regler, /tilstand'\)\.val\(\) !== 'ikkeMatchbar' \|\| newData\.hasChild\('ikkeMatchbarGrund'\)/);
  });
});

describe("Læsningen — indkoeb.laes, samme modulklausul som indkoeb", () => {
  it("⚠ MED indkoeb.laes KAN MATCHET LÆSES", async () => {
    const db = somMed("uid-laeser", [PERM.indkoebLaes]);
    const snap = await get(ref(db, matchSti(T, INDKOEB)));
    assert.equal(snap.val()?.tilstand, "matchet");
  });

  it("⚠ UDEN indkoeb.laes AFVISES LÆSNINGEN — også med alt andet", async () => {
    const uden = ALLE_PERMS.filter((p) => p !== PERM.indkoebLaes);
    const db = somMed("uid-uden-laes", uden);
    await assertFails(get(ref(db, matchSti(T, INDKOEB))));
  });

  it("fakturaer.laes alene giver IKKE adgang til brændstofmatchet", async () => {
    const db = somMed("uid-kun-fakturaer", [PERM.fakturaerLaes]);
    await assertFails(get(ref(db, matchSti(T, INDKOEB))));
  });
});

describe("⚠ TENANT-ISOLATION — samme mønster som resten af basen", () => {
  it("Tenant A kan ikke læse Tenant B's match", async () => {
    const somA = somMed("uid-tenant-a", [PERM.indkoebLaes], T);
    await assertFails(get(ref(somA, matchSti(ANDEN_TENANT, INDKOEB))));
  });

  it("Tenant A kan ikke skrive i Tenant B's braendstofmatch-sti", async () => {
    const somA = somMed("uid-tenant-a-skriv", ALLE_PERMS, T);
    await assertFails(
      set(ref(somA, matchSti(ANDEN_TENANT, "ik-fra-a")), GYLDIGT_MATCH("ik-fra-a", TANKNING)));
  });
});
