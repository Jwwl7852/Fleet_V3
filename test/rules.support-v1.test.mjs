/* Supportdata er server-ejet. Kunde og ejer bruger callable endpoints. */
import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails } from "./rules-test-claims.mjs";
import { get, ref, set } from "firebase/database";

const TENANT = "supportKontraktTenantA";
const ANDEN = "supportKontraktTenantB";
let miljoe;

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fleetcontrol-rules-test",
    database: { rules: readFileSync("firebase.rules.json", "utf8") },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${TENANT}/_findes`), true);
    await set(ref(db, `tenants/${ANDEN}/_findes`), true);
    await set(ref(db, "support/sager/sag-a"), { id: "sag-a", tenantId: TENANT, oprettetAfUid: "kunde-a" });
    await set(ref(db, "support/beskeder/sag-a/m-1"), { synlighed: "kunde", afsenderType: "kunde", tekst: "syntetisk" });
    await set(ref(db, `tenants/${TENANT}/supportsager/sag-a`), { oprettetAfUid: "kunde-a", status: "aiDialog", opdateretMs: 1 });
  });
});

after(async () => { await miljoe?.cleanup(); });

const kunde = (uid = "kunde-a", tenant = TENANT) => miljoe.authenticatedContext(uid, { tenant, rolle: "admin", perms: "|" }).database();
const ejer = () => miljoe.authenticatedContext("ejer-a", { udbyder: true }).database();

describe("Support V1 går kun gennem serverfunktionerne", () => {
  it("kunden kan ikke læse eller skrive support/sager direkte", async () => {
    await assertFails(get(ref(kunde(), "support/sager/sag-a")));
    await assertFails(set(ref(kunde(), "support/sager/sag-a/emne"), "ændret"));
  });

  it("en anden tenant og en anden bruger kan heller ikke læse direkte", async () => {
    await assertFails(get(ref(kunde("kunde-b", ANDEN), "support/sager/sag-a")));
    await assertFails(get(ref(kunde("kollega-a", TENANT), "support/beskeder/sag-a")));
  });

  it("udbyder-claimet giver ikke browseren direkte adgang", async () => {
    await assertFails(get(ref(ejer(), "support/sager")));
    await assertFails(set(ref(ejer(), "support/interneNoter/sag-a/n-1"), { tekst: "nej" }));
  });

  it("tenantindekset er ikke en klientgenvej", async () => {
    await assertFails(get(ref(kunde(), `tenants/${TENANT}/supportsager`)));
    await assertFails(set(ref(kunde(), `tenants/${TENANT}/supportsager/sag-b`), true));
  });
});
