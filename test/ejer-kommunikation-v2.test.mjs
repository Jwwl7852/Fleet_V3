import test from "node:test";
import assert from "node:assert/strict";
import {
  anvendRabatter, beregnHitrate, fletPostkasseKilder, klassificerKommunikation,
  normaliserSupport,
  ejerMaaSeKommunikation,
} from "../src/fleet/ejer-kommunikation-regler.js";

test("samme mail kan have flere postkassekilder uden at blive dubleret", () => {
  const en = fletPostkasseKilder({}, { mailboxId: "dennis", adresse: "dennis@veyrosystems.com", mappe: "inbox", type: "personlig" });
  const to = fletPostkasseKilder(en, { mailboxId: "info", adresse: "info@veyrosystems.com", mappe: "inbox", type: "delt" });
  const tre = fletPostkasseKilder(to, { mailboxId: "info", adresse: "info@veyrosystems.com", mappe: "inbox", type: "delt" });
  assert.equal(Object.keys(tre).length, 2);
});

test("support fra kendt kunde deles, mens uklar personlig mail kræver gennemgang", () => {
  const support = klassificerKommunikation({ fra: "kunde@example.com", til: "dennis@veyrosystems.com", emne: "FLEET virker ikke", kendtKunde: true, mailboxType: "personlig" });
  assert.deepEqual([support.sagstype, support.delingsstatus, support.kraeverGennemgang], ["support", "delt", false]);
  const privat = klassificerKommunikation({ fra: "privat@example.com", til: "dennis@veyrosystems.com", emne: "Frokost", mailboxType: "personlig" });
  assert.deepEqual([privat.sagstype, privat.delingsstatus, privat.kraeverGennemgang], ["uafklaret", "afklaring", true]);
});

test("private personlige tråde filtreres server-side pr. ejer", () => {
  const personlig = { delingsstatus: "afklaring", postkasseKilder: { a: { type: "personlig", ejerUid: "dennis" } } };
  assert.equal(ejerMaaSeKommunikation(personlig, "dennis"), true);
  assert.equal(ejerMaaSeKommunikation(personlig, "joern"), false);
  assert.equal(ejerMaaSeKommunikation({ ...personlig, delingsstatus: "delt" }, "joern"), true);
  assert.equal(ejerMaaSeKommunikation({ delingsstatus: "privat", ansvarligUid: "joern" }, "joern"), true);
});

test("supportfelter har lukkede kataloger", () => {
  assert.deepEqual(normaliserSupport({ type: "fejl", status: "triage", prioritet: "kritisk", modul: "FLEET" }, 42), {
    nummer: "", type: "fejl", status: "triage", prioritet: "kritisk", modul: "FLEET", ansvarligUid: "", fristMs: null, opdateretMs: 42,
  });
});

test("hitrate bruger kun afsluttede muligheder", () => {
  assert.deepEqual(beregnHitrate([{ fase: "vundet" }, { fase: "vundet" }, { fase: "tabt" }, { fase: "tilbud" }]), { vundet: 2, afsluttede: 3, procent: 66.7 });
});

test("104 vundne og 26 tabte giver 80 procent uanset åbne salg", () => {
  const muligheder = [...Array.from({ length: 104 }, () => ({ fase: "vundet" })), ...Array.from({ length: 26 }, () => ({ fase: "tabt" })), ...Array.from({ length: 250 }, () => ({ fase: "tilbud" }))];
  assert.deepEqual(beregnHitrate(muligheder), { vundet: 104, afsluttede: 130, procent: 80 });
});

test("rabatter anvendes sekventielt og kun på valgte linjer", () => {
  const [a, b] = anvendRabatter([{ id: "a", beloebOere: 10000 }, { id: "b", beloebOere: 10000 }], [
    { id: "alle", procent: 10 }, { id: "kun-a", procent: 20, linjeIder: ["a"] },
  ]);
  assert.equal(a.beloebOere, 7200);
  assert.equal(b.beloebOere, 9000);
});
