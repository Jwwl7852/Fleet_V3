import test from "node:test";
import assert from "node:assert/strict";

import {
  EJER_CLAIM_VERSION,
  byggEjerClaims,
  erEjerClaims,
  erTokenEfterRevocation,
} from "../src/fleet/ejeradgang.js";

test("nyt ejerclaim er tenantløst og kræver ingen kunstige permissions", () => {
  assert.deepEqual(byggEjerClaims({}), { udbyder: true, ev: EJER_CLAIM_VERSION });
  assert.deepEqual(byggEjerClaims({ devTester: true }), {
    udbyder: true, ev: EJER_CLAIM_VERSION, devTester: true,
  });
});

test("normal ejeroprettelse afviser en eksisterende tenantidentitet", () => {
  assert.throws(
    () => byggEjerClaims({ tenant: "kunde-a", rolle: "admin", perms: "|x|" }),
    /separat, tenantløs ejeridentitet/,
  );
});

test("legacy-ejerclaim accepteres, men ukendt version afvises", () => {
  assert.equal(erEjerClaims({ udbyder: true }), true);
  assert.equal(erEjerClaims({ udbyder: true, ev: EJER_CLAIM_VERSION }), true);
  assert.equal(erEjerClaims({ udbyder: true, ev: 99 }), false);
  assert.equal(erEjerClaims({ udbyder: false, ev: EJER_CLAIM_VERSION }), false);
});

test("revocation sammenlignes i sekunder og kræver et nyere token", () => {
  assert.equal(erTokenEfterRevocation(101, 100), true);
  assert.equal(erTokenEfterRevocation(100, 100), false);
  assert.equal(erTokenEfterRevocation(99, 100), false);
  assert.equal(erTokenEfterRevocation(undefined, 100), false);
  assert.equal(erTokenEfterRevocation(undefined, undefined), true);
});

