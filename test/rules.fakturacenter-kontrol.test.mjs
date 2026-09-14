import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "./rules-test-claims.mjs";
import { ref, set, get, update } from "firebase/database";
import { ALLE_PERMS, PERM, permStreng } from "../src/fleet/permissions.js";

const T = "tenantFcKontrol";
let miljoe;
const somMed = (uid, perms) => miljoe.authenticatedContext(uid, {
  tenant: T, rolle: "admin", perms: permStreng(perms),
}).database();

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-fakturakontrol",
    database: { host: "127.0.0.1", port: 9000, rules: readFileSync("firebase.rules.json", "utf8") },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${T}`), {
      _findes: true,
      abonnement: { status: "aktiv" },
      fakturacenterOpsaetning: {
        model: "alle", kontrollantUids: ["u2"], revision: 1,
        opdateretAf: "u-admin", opdateretMs: 1,
        sidsteMutationId: "m1", sidsteMutationHash: "a".repeat(64),
      },
      fakturacenterKontrolOperationer: {
        u1: { r1: {
          fingeraftryk: "b".repeat(64), fakturaId: "f1", handling: "kontroller", oprettetMs: 1,
          resultat: { ok: true, fakturaId: "f1", status: "ekstra-kontrol", revision: 1 },
        } },
      },
      fakturaer: {
        f1: {
          leverandoerId: "lev-1", fakturanummer: "F1", fakturadatoMs: 1,
          status: "modtaget", beloebOere: 1000, kontrolstatus: "ekstra-kontrol", kontrolRevision: 1,
        },
      },
    });
  });
});

after(async () => miljoe?.cleanup());

describe("Fakturacenter-kontrol er kun tilgængelig gennem callables", () => {
  it("opsætning og idempotensledger kan ikke læses direkte — heller ikke med alle permissions", async () => {
    const db = somMed("u-admin", ALLE_PERMS);
    await assertFails(get(ref(db, `tenants/${T}/fakturacenterOpsaetning`)));
    await assertFails(get(ref(db, `tenants/${T}/fakturacenterKontrolOperationer`)));
  });

  it("opsætning og ledger kan ikke skrives direkte", async () => {
    const db = somMed("u-admin", ALLE_PERMS);
    await assertFails(update(ref(db, `tenants/${T}/fakturacenterOpsaetning`), { model: "ingen" }));
    await assertFails(set(ref(db, `tenants/${T}/fakturacenterKontrolOperationer/u-admin/ny`), { resultat: true }));
  });

  it("fakturaen kan læses med fakturaer.laes, men kontrolfelter kan ikke muteres direkte", async () => {
    const db = somMed("u-laeser", [PERM.fakturaerLaes, PERM.fakturaerGodkend]);
    await assertSucceeds(get(ref(db, `tenants/${T}/fakturaer/f1`)));
    await assertFails(update(ref(db, `tenants/${T}/fakturaer/f1`), { kontrolstatus: "arkiveret" }));
  });
});
