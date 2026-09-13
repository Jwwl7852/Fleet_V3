import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryWorkforceRepository } from "../src/data/workforceRepository.js";

const moduleSource = readFileSync(new URL("../../src/moduler/workforce/WorkforceV2Module.jsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/WorkforceV2App.jsx", import.meta.url), "utf8");
const firebaseSource = readFileSync(new URL("../../src/firebase.js", import.meta.url), "utf8");
const platformSource = readFileSync(new URL("../../src/App.jsx", import.meta.url), "utf8");
const emulatorSeedSource = readFileSync(new URL("../../scripts/workforce-auth-emulator-seed.mjs", import.meta.url), "utf8");

test("integrationen vælger en eksplicit datakilde før første WORKFORCE-læsning", () => {
  assert.match(moduleSource, /demoMode\s*\?\s*createMemoryWorkforceRepository/);
  assert.match(moduleSource, /:\s*createFirebaseWorkforceRepository\(\)/);
  assert.match(moduleSource, /syntetiske demodata i hukommelsen/);
  assert.doesNotMatch(moduleSource, /catch[\s\S]{0,300}createMemoryWorkforceRepository/,
    "en backendfejl må ikke udløse skjult fallback til demo");
});

test("demo-repositoryet bruger tenantafgrænset syntetisk WORKFORCE-data", async () => {
  const repository = createMemoryWorkforceRepository({ tenantId: "demo" });
  const actor = {
    id: "demo", tenantId: "demo", employeeId: "emp-dennis",
    permissions: ["workforce.employee.read", "workforce.leave.sensitive"],
  };
  const state = await repository.getState(actor);
  assert.equal(state.tenantId, "demo");
  assert.ok(state.employees.some((employee) => employee.id === "emp-dennis"));
  await assert.rejects(
    () => repository.getState({ ...actor, tenantId: "anden-tenant" }),
    /anden kundes data/,
  );
});

test("fejlet første læsning stopper spinneren og giver et genforsøg", () => {
  assert.match(appSource, /const \[loading, setLoading\] = useState\(true\)/);
  assert.match(appSource, /finally \{ setLoading\(false\); \}/);
  assert.match(appSource, /WORKFORCE-data kunne ikke hentes/);
  assert.match(appSource, /onClick=\{reload\}/);
  assert.match(appSource, /Prøv igen/);
  assert.doesNotMatch(appSource, /!state\s*\?\s*<div className="wf-loading"/,
    "manglende state alene må ikke holde spinneren kørende");
});

test("Firebase-startfejl skifter ikke miljøet skjult til demo", () => {
  assert.match(firebaseSource, /Backend er utilgængelig; der skiftes ikke til demodata/);
  assert.match(firebaseSource, /export const firebaseStartfejl/);
  assert.doesNotMatch(firebaseSource, /console\.warn\("Firebase kunne ikke starte\. Kører demo-mode/);
  assert.match(platformSource, /!klar && firebaseStartfejl/);
  assert.match(platformSource, /Veyro skifter ikke automatisk til demodata/);
});

test("WORKFORCE-emulatorseed bruger Functions' runtime-namespace med produktregler", () => {
  assert.match(emulatorSeedSource, /DATABASE_NAMESPACE\s*=\s*PROJECT_ID/);
  assert.doesNotMatch(emulatorSeedSource, /DATABASE_NAMESPACE\s*=\s*`\$\{PROJECT_ID\}-default-rtdb`/);
  assert.match(emulatorSeedSource, /readFile\(new URL\("\.\.\/firebase\.rules\.json"/);
  assert.match(emulatorSeedSource, /\.settings\/rules\.json\?ns=\$\{DATABASE_NAMESPACE\}/);
});
