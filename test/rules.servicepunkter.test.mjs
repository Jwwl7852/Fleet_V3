/* test/rules.servicepunkter.test.mjs
 * Fleet §9.10 Servicebog — den nestede .validate under
 * koeretoejer/$id/servicepunkter/$id i firebase.rules.json.
 *
 * ⚠ INGEN NY NODE, INGEN NY PERMISSION. Punkterne skrives med den samme
 * koeretoejer.skriv-rettighed som resten af enhedens stamdata — se
 * fleet/servicepunkter.js's eget hoved. Det denne fil beviser er derfor
 * smalt og konkret: at skemaet faktisk håndhæves, og at den flade
 * "historik/<id>"-nøgle i et update() rammer den rigtige understi uden at
 * overskrive punktets øvrige felter — det er selve mekanismen
 * Servicebog.jsx's "Meld udført" bygger på.
 *
 * Kør:  npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "./rules-test-claims.mjs";
import { ref, set, update, get } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";

const TENANT = "vognmandServicepunkter";

let miljoe;

const som = (uid, rolle, tenant = TENANT) =>
  miljoe
    .authenticatedContext(uid, { tenant, rolle, perms: permStrengFraRolle(rolle) })
    .database();

const koeretoejSti = (id) => `tenants/${TENANT}/koeretoejer/${id}`;

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-servicepunkter",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });

  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${TENANT}/_findes`), true);
    await set(ref(db, koeretoejSti("kt-sp-1")), { art: "traekker", status: "aktiv" });
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("servicepunkter — skema", () => {
  it("en admin kan tilføje et gyldigt servicepunkt", async () => {
    const db = som("admin1", "admin");
    await assertSucceeds(set(ref(db, `${koeretoejSti("kt-sp-1")}/servicepunkter/sp-1`), {
      type: "daek", label: "Dækskift", intervalKm: 40000, aktiv: true,
    }));
  });

  it("afviser en ukendt type", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, `${koeretoejSti("kt-sp-1")}/servicepunkter/sp-bad-type`), {
      type: "olieskift", label: "X",
    }));
  });

  it("afviser et negativt interval", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, `${koeretoejSti("kt-sp-1")}/servicepunkter/sp-bad-interval`), {
      type: "service", label: "Service", intervalMaaneder: -6,
    }));
  });

  it("afviser et punkt uden label", async () => {
    const db = som("admin1", "admin");
    await assertFails(set(ref(db, `${koeretoejSti("kt-sp-1")}/servicepunkter/sp-bad-label`), {
      type: "syn",
    }));
  });

  it("⚠ EN CHAUFFØR UDEN koeretoejer.skriv AFVISES", async () => {
    const db = som("chauf1", "chauffoer");
    await assertFails(set(ref(db, `${koeretoejSti("kt-sp-1")}/servicepunkter/sp-2`), {
      type: "syn", label: "Syn", intervalMaaneder: 12,
    }));
  });

  it("⚠ 'historik/<id>' SOM FLAD NØGLE I update() RAMMER UNDERSTIEN — søskende overlever", async () => {
    const admin = som("admin2", "admin");
    const punktSti = `${koeretoejSti("kt-sp-1")}/servicepunkter/sp-3`;
    await assertSucceeds(set(ref(admin, punktSti), {
      type: "lovpligtigt", label: "Bremseeftersyn", intervalMaaneder: 12, aktiv: true,
    }));

    /* Selve mekanismen Servicebog.jsx's "Meld udført" bruger: ét update() på
       punktets egen sti, med en historikpost adresseret via en flad
       "historik/<id>"-nøgle — ikke et nested objekt der ville SÆTTE (og
       dermed tømme) hele historik-noden. */
    await assertSucceeds(update(ref(admin, punktSti), {
      senestUdfoertMs: 1786000000000,
      "historik/u-1": { udfoertMs: 1786000000000, kommentar: "Godkendt" },
    }));

    const efter = (await get(ref(admin, punktSti))).val();
    assert.equal(efter.label, "Bremseeftersyn", "label må ikke forsvinde ved en delvis update");
    assert.equal(efter.senestUdfoertMs, 1786000000000);
    assert.equal(efter.historik["u-1"].kommentar, "Godkendt");

    /* En SENERE udførelse må ikke overskrive den første — samme "ny post i
       stedet for at overskrive"-disciplin som resten af filen. */
    await assertSucceeds(update(ref(admin, punktSti), {
      senestUdfoertMs: 1786100000000,
      "historik/u-2": { udfoertMs: 1786100000000 },
    }));
    const efter2 = (await get(ref(admin, punktSti))).val();
    assert.equal(Object.keys(efter2.historik).length, 2, "den første historikpost skal stadig stå");
  });

  it("historik kræver udfoertMs", async () => {
    const db = som("admin3", "admin");
    const punktSti = `${koeretoejSti("kt-sp-1")}/servicepunkter/sp-4`;
    await assertSucceeds(set(ref(db, punktSti), { type: "egen", label: "X", intervalKm: 1000 }));
    await assertFails(update(ref(db, punktSti), { "historik/u-bad": { kommentar: "uden dato" } }));
  });
});
