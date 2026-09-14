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

test("loginforslag E har præcis to billeder for hvert af de otte moduler", () => {
  const katalog = readFileSync("src/fleet/login-billeder.js", "utf8");
  const login = readFileSync("src/moduler/LoginE.jsx", "utf8");
  const poster = [...katalog.matchAll(/\{ id: "([^"]+)", modul: "([^"]+)", nummer: (\d)/g)]
    .map((match) => ({ id: match[1], modul: match[2], nummer: Number(match[3]) }));
  const ids = poster.map((post) => post.id);
  assert.deepEqual(ids, [
    "fleet-1", "fleet-2", "facility-1", "facility-2", "planning-1", "planning-2",
    "procure-1", "procure-2", "fakturacenter-1", "fakturacenter-2",
    "workforce-1", "workforce-2", "warehouse-1", "warehouse-2",
    "unit-booking-1", "unit-booking-2",
  ]);
  for (const modul of ["fleet", "facility", "planning", "procure", "fakturacenter", "workforce", "warehouse", "unit-booking"]) {
    assert.deepEqual(poster.filter((post) => post.modul === modul).map((post) => post.nummer), [1, 2]);
  }
  assert.match(katalog, /fleet2 from "\.\.\/assets\/login\/web\/samlet-drift\.jpg"/);
  assert.doesNotMatch(katalog.toLowerCase(), /support/);
  assert.match(login, /<VeyroLogo variant="login-hero"/);
  assert.match(login, /billede && !billedeFejl && <div className="fc-login-motiv">/);
  assert.match(login, /auth\.signInWithEmailAndPassword/);
  assert.match(login, /auth\.sendPasswordResetEmail/);
});

test("billedvalget udelukker det seneste motiv, når serien har flere billeder", () => {
  const katalog = readFileSync("src/fleet/login-billeder.js", "utf8");
  const login = readFileSync("src/moduler/LoginE.jsx", "utf8");
  assert.match(katalog, /billeder\.filter\(\(billede\) => billede\.id !== forrigeId\)/);
  assert.match(katalog, /tilfældig\(\) \* mulige\.length/);
  assert.match(login, /const \[billede, setBillede\] = useState\(null\)/);
  assert.match(login, /loginSenesteBilledeNøgle\(kontekst\.contextId\)/);
});

test("præ-login læser kun den minimale serverprojektion og fejler neutralt", () => {
  const login = readFileSync("src/moduler/LoginE.jsx", "utf8");
  const klient = readFileSync("src/fleet/login-kundekonfiguration.js", "utf8");
  const funktion = readFileSync("functions/index.js", "utf8");
  assert.match(login, /hentLoginKontekst\(\{ url: offentligLoginKontekstUrl/);
  assert.match(klient, /credentials: "omit"/);
  assert.match(klient, /status: "ukendt", moduler: \[\]/);
  assert.match(funktion, /VEYRO_OFFENTLIGE_LOGIN_KONTEKSTER_JSON/);
  assert.doesNotMatch(`${login}\n${klient}`, /tenants\/|abonnementer\/|firebase\.database|\.ref\(/);
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
