import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  aktivitetsNøgle,
  inaktivitetsScope,
  inaktivitetsstatus,
  INAKTIVITET_TIMEOUT_MS,
  INAKTIVITET_VARSEL_MS,
  læsAktivitet,
  nedtællingSekunder,
} from "../src/fleet/inaktivitet.js";

test("produktionsgrænsen er 43 minutters varsel og 45 minutters logout", () => {
  assert.equal(INAKTIVITET_VARSEL_MS, 43 * 60 * 1000);
  assert.equal(INAKTIVITET_TIMEOUT_MS, 45 * 60 * 1000);
  assert.equal(inaktivitetsstatus(0, INAKTIVITET_VARSEL_MS - 1).fase, "aktiv");
  assert.equal(inaktivitetsstatus(0, INAKTIVITET_VARSEL_MS).fase, "varsel");
  assert.equal(inaktivitetsstatus(0, INAKTIVITET_TIMEOUT_MS - 1).fase, "varsel");
  assert.equal(inaktivitetsstatus(0, INAKTIVITET_TIMEOUT_MS).fase, "udløbet");
});

test("nedtællingen afrunder op og ender ved nul", () => {
  assert.equal(nedtællingSekunder(120_000), 120);
  assert.equal(nedtællingSekunder(1_001), 2);
  assert.equal(nedtællingSekunder(0), 0);
});

test("aktivitet er afgrænset efter bruger, sikkerhedskontekst og login-session", () => {
  const a = inaktivitetsScope({ uid: "u1", tenant: "t1", sessionAuthTime: "a1" });
  const andenTenant = inaktivitetsScope({ uid: "u1", tenant: "t2", sessionAuthTime: "a1" });
  const nySession = inaktivitetsScope({ uid: "u1", tenant: "t1", sessionAuthTime: "a2" });
  const ejer = inaktivitetsScope({ uid: "u1", udbyder: true, sessionAuthTime: "a1" });
  assert.notEqual(a, andenTenant);
  assert.notEqual(a, nySession);
  assert.notEqual(a, ejer);
  assert.match(aktivitetsNøgle(a), /^veyro:session:aktivitet:v1:/);
});

test("kun gyldige positive aktivitetstidsstempler genbruges", () => {
  assert.equal(læsAktivitet("123"), 123);
  assert.equal(læsAktivitet("0"), null);
  assert.equal(læsAktivitet("ikke-et-tal"), null);
});

test("loginforslag E har de ni godkendte generelle motivpar og det originale logo", () => {
  const katalog = readFileSync("src/fleet/login-billeder.js", "utf8");
  const login = readFileSync("src/moduler/LoginE.jsx", "utf8");
  const ids = [...katalog.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, [
    "fleet", "facility", "planning", "procure", "fakturacenter",
    "workforce", "warehouse", "unit-booking", "samlet-drift",
  ]);
  for (const tekst of [
    "Overblik over flåden.", "Struktur omkring dine bygninger.",
    "Overblik over næste opgave.", "Fra behov til levering.",
    "Overblik over bilag og omkostninger.", "Mennesker og opgaver i balance.",
    "Plads til overblik.", "Styr på enhedernes vej.",
    "Din arbejdsdag samlet ét sted.",
  ]) assert.match(katalog, new RegExp(tekst.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(login, /<VeyroLogo variant="login-hero"/);
  assert.match(login, /AI-genereret illustration/);
  assert.match(login, /auth\.signInWithEmailAndPassword/);
  assert.match(login, /auth\.sendPasswordResetEmail/);
});

test("billedvalget udelukker det seneste motiv, når serien har flere billeder", () => {
  const katalog = readFileSync("src/fleet/login-billeder.js", "utf8");
  const login = readFileSync("src/moduler/LoginE.jsx", "utf8");
  assert.match(katalog, /billeder\.filter\(\(billede\) => billede\.id !== forrigeId\)/);
  assert.match(katalog, /tilfældig\(\) \* mulige\.length/);
  assert.match(login, /const \[billede\] = useState\(hentFørsteBillede\)/);
});

test("vagten reagerer kun på brugerhændelser og afslutter Firebase-sessionen", () => {
  const vagt = readFileSync("src/fleet/Inaktivitetsvagt.jsx", "utf8");
  assert.match(vagt, /pointerdown.*keydown.*touchstart.*wheel.*scroll/s);
  assert.doesNotMatch(vagt, /mousemove/);
  assert.match(vagt, /visibilitychange/);
  assert.match(vagt, /BroadcastChannel/);
  assert.match(vagt, /await auth\.signOut\(\)/);
  assert.match(vagt, /Ikke-gemte ændringer kan gå tabt/);
});
