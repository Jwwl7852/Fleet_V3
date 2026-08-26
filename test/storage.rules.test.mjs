/* test/storage.rules.test.mjs
 * storage.rules — Skive 4C. Fakturabilag.
 *
 * ⚠ HVORFOR RESULTATET ER "AFVIST" I HVER ENESTE PRØVE, OG DET ER MENINGEN.
 * Al reel adgang går gennem fire Cloud Functions, som udsteder kortlivede
 * SIGNEREDE URL'er — og en signeret URL evalueres IKKE mod disse regler
 * (det er en selvstændig GCS-mekanisme, se storage.rules' eget hoved).
 * Reglerne her er derfor bevidst LUKKET for enhver direkte klient-SDK-
 * adgang, uanset tenant og permission — Storage Rules kan ikke slå op i
 * RTDB (kan ikke se karantænestatus) og kan ikke binde content-type/
 * størrelse som en signeret URL kan, så et tenant+perm-gate her ville
 * være en SVAGERE grænse end den korrekte: ingen direkte adgang
 * overhovedet. Se docs/security-compliance/09_FILE_STORAGE_SECURITY_
 * GATE.md §1-3 og storage.rules' egen begrundelse.
 *
 * Testene beviser derfor den PÅSTAND, ikke det modsatte: at ingen
 * kombination af gyldig tenant + gyldig permission + korrekt sti giver
 * adgang via Storage-SDK'en. Signerede URL'ers faktiske funktion (upload/
 * download gennem de fire Cloud Functions) kan ikke prøves i denne
 * emulator — v4-signering kræver en rigtig service-konto-nøgle, som
 * Storage-emulatoren ikke har. Den del er DEV-verificeret end-to-end i
 * stedet, se rapporten for Skive 4C.
 *
 * Koer: npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { ref as storageRef, uploadBytes, getBytes } from "firebase/storage";
import { PERM, ALLE_PERMS, permStreng } from "../src/fleet/permissions.js";

const T = "tenantStorage";
const ANDEN_TENANT = "tenantStorageAnden";
const FAKTURA = "fa-1";
const DOKUMENT = "do-1";

let miljoe;

const somMed = (uid, perms, tenant = T) =>
  miljoe.authenticatedContext(uid, {
    tenant, rolle: "admin", perms: permStreng(perms),
  }).storage();

const dokPath = (tenant, fakturaId, dokumentId) =>
  `tenants/${tenant}/fakturaer/${fakturaId}/dokumenter/${dokumentId}`;

const NOGLE_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-storage",
    storage: {
      rules: readFileSync("storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("⚠ INGEN DIREKTE KLIENT-SKRIVNING — heller ikke med fakturaer.skriv", () => {
  it("en bruger med fakturaer.skriv kan ikke uploade direkte", async () => {
    const storage = somMed("uid-skriv", [PERM.fakturaerSkriv]);
    const fil = storageRef(storage, dokPath(T, FAKTURA, DOKUMENT));
    await assertFails(uploadBytes(fil, NOGLE_BYTES, { contentType: "application/pdf" }));
  });

  it("heller ikke med alle permissions", async () => {
    const storage = somMed("uid-alt", ALLE_PERMS);
    const fil = storageRef(storage, dokPath(T, FAKTURA, "do-admin"));
    await assertFails(uploadBytes(fil, NOGLE_BYTES, { contentType: "application/pdf" }));
  });

  it("⚠ MANIPULERET fakturaId/dokumentId ÆNDRER IKKE UDFALDET — stien er lukket uanset id", async () => {
    const storage = somMed("uid-manipuleret", ALLE_PERMS);
    const fil = storageRef(storage, dokPath(T, "fa-findes-ikke", "do-opdigtet"));
    await assertFails(uploadBytes(fil, NOGLE_BYTES, { contentType: "application/pdf" }));
  });
});

describe("⚠ INGEN DIREKTE KLIENT-LÆSNING — heller ikke med fakturaer.laes", () => {
  it("en bruger med fakturaer.laes kan ikke downloade direkte", async () => {
    const storage = somMed("uid-laes", [PERM.fakturaerLaes]);
    const fil = storageRef(storage, dokPath(T, FAKTURA, DOKUMENT));
    await assertFails(getBytes(fil));
  });

  it("heller ikke med alle permissions", async () => {
    const storage = somMed("uid-laes-alt", ALLE_PERMS);
    const fil = storageRef(storage, dokPath(T, FAKTURA, DOKUMENT));
    await assertFails(getBytes(fil));
  });
});

describe("⚠ TENANT A KAN IKKE FÅ ADGANG TIL TENANT B's STI — heller ikke uden gate", () => {
  it("Tenant A kan ikke skrive i Tenant B's Storage-sti", async () => {
    const storage = somMed("uid-tenant-a", ALLE_PERMS, T);
    const fil = storageRef(storage, dokPath(ANDEN_TENANT, FAKTURA, DOKUMENT));
    await assertFails(uploadBytes(fil, NOGLE_BYTES, { contentType: "application/pdf" }));
  });

  it("Tenant A kan ikke læse Tenant B's Storage-sti", async () => {
    const storage = somMed("uid-tenant-a-laes", ALLE_PERMS, T);
    const fil = storageRef(storage, dokPath(ANDEN_TENANT, FAKTURA, DOKUMENT));
    await assertFails(getBytes(fil));
  });
});

describe("⚠ INGEN ANDEN STI ER ÅBEN — kun fakturabilag er defineret, og den er lukket", () => {
  it("en helt anden sti i bucket'en er også lukket", async () => {
    const storage = somMed("uid-andensti", ALLE_PERMS);
    const fil = storageRef(storage, "et/andet/sted.pdf");
    await assertFails(uploadBytes(fil, NOGLE_BYTES, { contentType: "application/pdf" }));
  });
});
