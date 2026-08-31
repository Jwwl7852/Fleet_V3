/* test/rules.dokumenter.test.mjs
 * Fakturabilag (Skive 4C) OG opgavedokumenter (F.2) — de to RTDB-metadata-
 * noder, ikke selve blobbene.
 *
 * ⚠ SAMME MØNSTER SOM rules.opgaver.test.mjs. `fakturaer` og `opgaver` er
 * begge `.write: false`, og `dokumenter` ligger under hver deres
 * $fakturaId/$opgaveId — der findes derfor INGEN klient-skrivevej at
 * demonstrere en "gyldig post" igennem. En prøve der skrev en "gyldig" post
 * via en klient-kontekst, ville være grøn fordi skrivningen er lukket, ikke
 * fordi formen var rigtig — det er præcis den fælde rules.opgaver.test.mjs's
 * eget hoved advarer imod.
 *
 * Testene her spørger derfor om det der FAKTISK kan efterprøves med en
 * klient: at ingen kan skrive, uanset permission — og at LÆSNINGEN er
 * korrekt gated og tenant-isoleret. `.validate`-skemaet (storagePath låst
 * til den kanoniske sti, status-enum, størrelsesloftet) er den form
 * dokumentUploadInitier/-Bekraeft og opgaveDokumentUploadInitier/-Bekraeft
 * SKAL skrive — kildeteksttjekket af de funktioner står i
 * test/skive4c-dokumenter.test.mjs og test/f2-opgavedokumenter-cloud.
 * test.mjs, og de rene grænser (MAX_FILSTOERRELSE_BYTES osv.) i
 * test/dokumenter.test.mjs.
 *
 * Koer: npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { ref, set, update, get } from "firebase/database";
import { PERM, ALLE_PERMS, permStreng } from "../src/fleet/permissions.js";

const T = "tenantDok";
const ANDEN_TENANT = "tenantDokAnden";
const FAKTURA = "fa-hydra";
const DOKUMENT = "do-1";
const OPGAVE = "op-hydra";
const OP_DOKUMENT = "do-op-1";

let miljoe;

const somMed = (uid, perms, tenant = T) =>
  miljoe.authenticatedContext(uid, {
    tenant, rolle: "admin", perms: permStreng(perms),
  }).database();

const dokSti = (tenant, fakturaId, dokumentId) =>
  `tenants/${tenant}/fakturaer/${fakturaId}/dokumenter/${dokumentId}`;

const GYLDIGT_DOKUMENT = (tenant, fakturaId, dokumentId) => ({
  dokumentId, parentType: "faktura", fakturaId,
  originaltFilnavn: "Faktura marts.pdf",
  valideretMime: "application/pdf",
  stoerrelse: 128000,
  storagePath: `tenants/${tenant}/fakturaer/${fakturaId}/dokumenter/${dokumentId}`,
  uploader: "u-uploader",
  oprettetTid: 1786000000000,
  status: "aktiv",
});

const opDokSti = (tenant, opgaveId, dokumentId) =>
  `tenants/${tenant}/opgaver/${opgaveId}/dokumenter/${dokumentId}`;

const GYLDIGT_OPGAVEDOKUMENT = (tenant, opgaveId, dokumentId) => ({
  dokumentId, parentType: "opgave", opgaveId,
  originaltFilnavn: "Skade forskærm.jpg",
  valideretMime: "image/jpeg",
  stoerrelse: 64000,
  storagePath: `tenants/${tenant}/opgaver/${opgaveId}/dokumenter/${dokumentId}`,
  uploader: "u-uploader",
  oprettetTid: 1786000000000,
  status: "aktiv",
  synligForLeverandoer: false,
});

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-dokumenter",
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
      await set(ref(db, `tenants/${t}/leverandoerer/lv-hydra`), {
        navn: "Hydra-Grene Kolding", kategori: "reservedele", aktiv: true,
      });
      await set(ref(db, `tenants/${t}/fakturaer/${FAKTURA}`), {
        leverandoerId: "lv-hydra", fakturanummer: "F-1", fakturadatoMs: 1786000000000,
        status: "modtaget", beloebOere: 100000,
      });
      /* ⚠ SEEDES SOM ADMIN SDK VILLE HAVE SKREVET DEN — dokumentUploadBekraeft
         er den ENESTE reelle vej til status "aktiv". */
      await set(ref(db, dokSti(t, FAKTURA, DOKUMENT)), GYLDIGT_DOKUMENT(t, FAKTURA, DOKUMENT));
      await set(ref(db, `tenants/${t}/dokumentkvote/fakturaBilag/brugtBytes`), 128000);

      /* ⚠ F.2 */
      await set(ref(db, `tenants/${t}/opgaver/${OPGAVE}`), {
        art: "vaerksted", status: "planlagt", startMs: 1786000000000,
      });
      await set(ref(db, opDokSti(t, OPGAVE, OP_DOKUMENT)), GYLDIGT_OPGAVEDOKUMENT(t, OPGAVE, OP_DOKUMENT));
      await set(ref(db, `tenants/${t}/dokumentkvote/opgaveBilag/brugtBytes`), 64000);
    }
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("⚠ NODEN ER LUKKET — vejen ind er de fire Cloud Functions", () => {
  it("⚠ EN BRUGER MED fakturaer.skriv KAN IKKE SKRIVE ET DOKUMENT DIREKTE", async () => {
    const db = somMed("uid-kun-skriv", [PERM.fakturaerSkriv]);
    await assertFails(
      set(ref(db, dokSti(T, FAKTURA, "do-forsoeg")), GYLDIGT_DOKUMENT(T, FAKTURA, "do-forsoeg")));
  });

  it("⚠ HELLER IKKE MED ALLE PERMISSIONS", async () => {
    const db = somMed("uid-alt", ALLE_PERMS);
    await assertFails(
      set(ref(db, dokSti(T, FAKTURA, "do-admin")), GYLDIGT_DOKUMENT(T, FAKTURA, "do-admin")));
  });

  it("en opdatering af et eksisterende dokument afvises også", async () => {
    const db = somMed("uid-opdater", ALLE_PERMS);
    await assertFails(update(ref(db, dokSti(T, FAKTURA, DOKUMENT)), { status: "deaktiveret" }));
  });

  it("⚠ INGEN HARDSLET — set(null) på et eksisterende dokument afvises", async () => {
    const db = somMed("uid-slet", ALLE_PERMS);
    await assertFails(set(ref(db, dokSti(T, FAKTURA, DOKUMENT)), null));
  });

  it("⚠ REGELFILEN SIGER DET SAMME — fakturaer/.write er false, og dokumenter arver det", () => {
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10))
    );
    const faktura = regler.rules.tenants.$tenantId.fakturaer;
    assert.equal(faktura[".write"], false,
      "fakturaer er skrivbar igen — så kan et dokument skrives uden om Cloud Functions");
    assert.ok(!faktura.$fakturaId.dokumenter[".write"],
      "dokumenter har fået sin egen .write — den skal arve fakturaer/.write:false, ikke overstyre den");
  });
});

describe("Læsningen — fakturaer.laes, samme cascade som resten af fakturaen", () => {
  it("⚠ MED fakturaer.laes KAN DOKUMENTET LÆSES", async () => {
    const db = somMed("uid-laeser", [PERM.fakturaerLaes]);
    const snap = await get(ref(db, dokSti(T, FAKTURA, DOKUMENT)));
    assert.equal(snap.val()?.status, "aktiv");
  });

  it("⚠ UDEN fakturaer.laes AFVISES LÆSNINGEN — også med alt andet", async () => {
    const uden = ALLE_PERMS.filter((p) => p !== PERM.fakturaerLaes);
    const db = somMed("uid-uden-laes", uden);
    await assertFails(get(ref(db, dokSti(T, FAKTURA, DOKUMENT))));
  });

  it("indkoeb.laes alene giver IKKE adgang til fakturabilaget", async () => {
    const db = somMed("uid-kun-indkoeb", [PERM.indkoebLaes]);
    await assertFails(get(ref(db, dokSti(T, FAKTURA, DOKUMENT))));
  });
});

describe("⚠ TENANT-ISOLATION — samme mønster som resten af basen", () => {
  it("Tenant A kan ikke læse Tenant B's fakturadokument", async () => {
    const somA = somMed("uid-tenant-a", [PERM.fakturaerLaes], T);
    await assertFails(get(ref(somA, dokSti(ANDEN_TENANT, FAKTURA, DOKUMENT))));
  });

  it("Tenant A kan ikke skrive i Tenant B's Storage-metadata-sti", async () => {
    const somA = somMed("uid-tenant-a-skriv", ALLE_PERMS, T);
    await assertFails(
      set(ref(somA, dokSti(ANDEN_TENANT, FAKTURA, "do-fra-a")),
        GYLDIGT_DOKUMENT(ANDEN_TENANT, FAKTURA, "do-fra-a")));
  });
});

describe("dokumentkvote — tenantens forbrugte fakturabilag-lager", () => {
  it("⚠ LÆSES MED fakturaer.laes", async () => {
    const db = somMed("uid-kvote-laes", [PERM.fakturaerLaes]);
    const snap = await get(ref(db, `tenants/${T}/dokumentkvote/fakturaBilag/brugtBytes`));
    assert.equal(snap.val(), 128000);
  });

  it("⚠ INGEN KAN SKRIVE DEN DIREKTE — kun dokumentUploadBekraeft, transaktionelt", async () => {
    const db = somMed("uid-kvote-skriv", ALLE_PERMS);
    await assertFails(set(ref(db, `tenants/${T}/dokumentkvote/fakturaBilag/brugtBytes`), 0));
  });

  it("⚠ TENANT-ISOLERET SOM ALT ANDET", async () => {
    const somA = somMed("uid-kvote-a", [PERM.fakturaerLaes], T);
    await assertFails(get(ref(somA, `tenants/${ANDEN_TENANT}/dokumentkvote/fakturaBilag/brugtBytes`)));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   F.2 — OPGAVEDOKUMENTER. Samme figur som fakturabilagene ovenfor, med ÉN
   forskel der er værd at fremhæve: LÆSNINGEN kræver ingen permission ud
   over tenant+aktivt abonnement, fordi `opgaver` selv ikke kræver en
   `.laes`-permission — se opgaveDokumentDownloadLink's egen note i
   functions/index.js.
   ══════════════════════════════════════════════════════════════════════════ */

describe("⚠ F.2 — NODEN ER LUKKET, SAMME SOM FAKTURABILAGENE", () => {
  it("⚠ EN BRUGER MED opgaver.skriv KAN IKKE SKRIVE ET OPGAVEDOKUMENT DIREKTE", async () => {
    const db = somMed("uid-op-kun-skriv", [PERM.opgaverSkriv]);
    await assertFails(
      set(ref(db, opDokSti(T, OPGAVE, "do-forsoeg")), GYLDIGT_OPGAVEDOKUMENT(T, OPGAVE, "do-forsoeg")));
  });

  it("⚠ HELLER IKKE MED ALLE PERMISSIONS", async () => {
    const db = somMed("uid-op-alt", ALLE_PERMS);
    await assertFails(
      set(ref(db, opDokSti(T, OPGAVE, "do-admin")), GYLDIGT_OPGAVEDOKUMENT(T, OPGAVE, "do-admin")));
  });

  it("en opdatering af et eksisterende opgavedokument afvises også", async () => {
    const db = somMed("uid-op-opdater", ALLE_PERMS);
    await assertFails(update(ref(db, opDokSti(T, OPGAVE, OP_DOKUMENT)), { status: "deaktiveret" }));
  });

  it("⚠ HELLER IKKE synligForLeverandoer KAN SÆTTES DIREKTE — kun opgaveDokumentSynlighedSaet", async () => {
    const db = somMed("uid-op-synlig", ALLE_PERMS);
    await assertFails(update(ref(db, opDokSti(T, OPGAVE, OP_DOKUMENT)), { synligForLeverandoer: true }));
  });

  it("⚠ INGEN HARDSLET — set(null) på et eksisterende opgavedokument afvises", async () => {
    const db = somMed("uid-op-slet", ALLE_PERMS);
    await assertFails(set(ref(db, opDokSti(T, OPGAVE, OP_DOKUMENT)), null));
  });

  it("⚠ REGELFILEN SIGER DET SAMME — opgaver/.write er false, og dokumenter arver det", () => {
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10))
    );
    const opgaver = regler.rules.tenants.$tenantId.opgaver;
    assert.equal(opgaver[".write"], false,
      "opgaver er skrivbar igen — så kan et dokument skrives uden om Cloud Functions");
    assert.ok(!opgaver.$opgaveId.dokumenter[".write"],
      "opgaver/$opgaveId/dokumenter har fået sin egen .write — den skal arve opgaver/.write:false");
  });
});

describe("⚠ F.2 — LÆSNINGEN KRÆVER INGEN EKSTRA PERMISSION, SAMME SOM opgaver SELV", () => {
  it("enhver tenant-medlem kan læse et opgavedokument uden nogen specifik permission", async () => {
    const db = somMed("uid-op-laeser", []);
    const snap = await get(ref(db, opDokSti(T, OPGAVE, OP_DOKUMENT)));
    assert.equal(snap.val()?.status, "aktiv");
  });
});

describe("⚠ F.2 — TENANT-ISOLATION, SAMME MØNSTER SOM RESTEN AF BASEN", () => {
  it("Tenant A kan ikke læse Tenant B's opgavedokument", async () => {
    const somA = somMed("uid-op-tenant-a", [], T);
    await assertFails(get(ref(somA, opDokSti(ANDEN_TENANT, OPGAVE, OP_DOKUMENT))));
  });

  it("Tenant A kan ikke skrive i Tenant B's opgavedokument-sti", async () => {
    const somA = somMed("uid-op-tenant-a-skriv", ALLE_PERMS, T);
    await assertFails(
      set(ref(somA, opDokSti(ANDEN_TENANT, OPGAVE, "do-fra-a")),
        GYLDIGT_OPGAVEDOKUMENT(ANDEN_TENANT, OPGAVE, "do-fra-a")));
  });
});

describe("dokumentkvote/opgaveBilag — EGEN, UAFHÆNGIG KVOTE AF fakturaBilag", () => {
  it("⚠ LÆSES UDEN EKSTRA PERMISSION, SAMME SOM opgavedokumentet SELV", async () => {
    const db = somMed("uid-op-kvote-laes", []);
    const snap = await get(ref(db, `tenants/${T}/dokumentkvote/opgaveBilag/brugtBytes`));
    assert.equal(snap.val(), 64000);
  });

  it("⚠ INGEN KAN SKRIVE DEN DIREKTE — kun opgaveDokumentUploadBekraeft, transaktionelt", async () => {
    const db = somMed("uid-op-kvote-skriv", ALLE_PERMS);
    await assertFails(set(ref(db, `tenants/${T}/dokumentkvote/opgaveBilag/brugtBytes`), 0));
  });

  it("⚠ TENANT-ISOLERET SOM ALT ANDET", async () => {
    const somA = somMed("uid-op-kvote-a", [], T);
    await assertFails(get(ref(somA, `tenants/${ANDEN_TENANT}/dokumentkvote/opgaveBilag/brugtBytes`)));
  });

  it("⚠ EN SEPARAT TÆLLER FRA fakturaBilag — de to lofter er ikke den samme node", async () => {
    const db = somMed("uid-op-kvote-adskilt", [PERM.fakturaerLaes]);
    const opgaveKvote = (await get(ref(db, `tenants/${T}/dokumentkvote/opgaveBilag/brugtBytes`))).val();
    const fakturaKvote = (await get(ref(db, `tenants/${T}/dokumentkvote/fakturaBilag/brugtBytes`))).val();
    assert.notEqual(opgaveKvote, fakturaKvote);
  });
});
