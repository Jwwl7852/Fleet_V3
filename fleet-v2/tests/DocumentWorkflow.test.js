import { describe, expect, it } from "vitest";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import {
  applyDocumentArchive,
  applyDocumentRelationRemoval,
  applyDocumentUpdate,
  applyDocumentUpload,
  applyDocumentVersion,
  documentValidity,
  documentsForRelation,
  ensureDocumentRegistry,
  resolveDocumentVersion,
  validateDocumentFile,
} from "../src/data/documentWorkflow";

const actor = { id: "demo-lars", name: "Lars Hansen" };
const options = () => {
  let count = 0;
  return { now: () => "2026-09-08T10:00:00.000Z", uuid: () => `test-${++count}` };
};
const pdf = (name = "police.pdf", body = "pdf") => new File([body], name, { type: "application/pdf" });

describe("fælles dokumentregister", () => {
  it("migrerer gamle metadata uden at opfinde filer og er idempotent", () => {
    const first = ensureDocumentRegistry(createFixtureDataset());
    const legacy = first.relations.documents.find((item) => item.id === "doc-sc-1");
    expect(legacy.relations).toEqual(expect.arrayContaining([expect.objectContaining({ type: "unit", targetId: "unit-sc-104" })]));
    expect(resolveDocumentVersion(legacy, first).available).toBe(false);
    const second = ensureDocumentRegistry(first);
    expect(second.relations.documents.map((item) => item.id)).toEqual(first.relations.documents.map((item) => item.id));
  });

  it("uploader én Blob og knytter samme dokument til flere poster", () => {
    const dataset = ensureDocumentRegistry(createFixtureDataset());
    const result = applyDocumentUpload(dataset, { files: [pdf()], title: "Forsikringspolice", category: "insurance", relations: [{ type: "unit", targetId: "unit-sc-104" }, { type: "case", targetId: "case-demo-001" }] }, actor, options());
    const document = result.documents[0];
    expect(document.relations).toHaveLength(2);
    expect(document.versions).toHaveLength(1);
    expect(document.versions[0].blob).toBeInstanceOf(Blob);
    expect(documentsForRelation(result.dataset.relations.documents, "case", "case-demo-001")).toContainEqual(document);
  });

  it("afviser en ugyldig eller for stor fil før noget gemmes", () => {
    const dataset = ensureDocumentRegistry(createFixtureDataset());
    const before = dataset.relations.documents.length;
    expect(() => applyDocumentUpload(dataset, { files: [new File(["<script>"], "x.html", { type: "text/html" })], category: "other" }, actor, options())).toThrow(/understøttes ikke/i);
    expect(dataset.relations.documents).toHaveLength(before);
    expect(() => validateDocumentFile({ name: "stor.pdf", type: "application/pdf", size: 21 * 1024 * 1024 })).toThrow(/20 MB/);
  });

  it("fjerner kun én relation og bevarer dokument og øvrige links", () => {
    const uploaded = applyDocumentUpload(ensureDocumentRegistry(createFixtureDataset()), { files: [pdf()], category: "insurance", relations: [{ type: "unit", targetId: "unit-sc-104" }, { type: "case", targetId: "case-demo-001" }] }, actor, options());
    const document = uploaded.documents[0];
    const result = applyDocumentRelationRemoval(uploaded.dataset, document.id, document.relations[0].id, options());
    expect(result.document.relations).toHaveLength(1);
    expect(result.document.versions[0].blob).toBeInstanceOf(Blob);
  });

  it("opretter en ny filversion og bevarer tidligere version og metadata", () => {
    const uploaded = applyDocumentUpload(ensureDocumentRegistry(createFixtureDataset()), { files: [pdf("v1.pdf")], title: "Police", category: "insurance", note: "Original", relations: [] }, actor, options());
    const document = uploaded.documents[0];
    const updated = applyDocumentUpdate(uploaded.dataset, document.id, { title: "Police 2026", category: "insurance", note: "Rettet", relations: [] }, actor, options());
    const versioned = applyDocumentVersion(updated.dataset, document.id, pdf("v2.pdf", "new"), actor, options());
    expect(versioned.document.versions).toHaveLength(2);
    expect(versioned.document.versions[0].metadata.note).toBe("Original");
    expect(versioned.version.metadata.note).toBe("Rettet");
    expect(resolveDocumentVersion(versioned.document, versioned.dataset, versioned.document.versions[0].id).available).toBe(true);
  });

  it("arkiverer og gendanner uden permanent sletning", () => {
    const uploaded = applyDocumentUpload(ensureDocumentRegistry(createFixtureDataset()), { files: [pdf()], category: "other", relations: [] }, actor, options());
    const document = uploaded.documents[0];
    const archived = applyDocumentArchive(uploaded.dataset, document.id, true, actor, options());
    expect(archived.document.archivedAt).toBeTruthy();
    const restored = applyDocumentArchive(archived.dataset, document.id, false, actor, options());
    expect(restored.document.archivedAt).toBeNull();
    expect(restored.document.versions).toHaveLength(1);
  });

  it("beregner gyldighed på datogrænser", () => {
    const today = new Date("2026-09-08T12:00:00");
    expect(documentValidity({ expiresAt: null }, today).key).toBe("none");
    expect(documentValidity({ validFrom: "2026-09-09", expiresAt: "2027-01-01" }, today).key).toBe("future");
    expect(documentValidity({ expiresAt: "2026-09-07" }, today).key).toBe("expired");
    expect(documentValidity({ expiresAt: "2026-09-08", reminderDays: 0 }, today).key).toBe("expiring");
    expect(documentValidity({ expiresAt: "2027-09-08", reminderDays: 30 }, today).key).toBe("valid");
  });

  it("indekserer eksisterende sags- og værkstedsbilag via reference uden Blob-kopi", () => {
    const sourceBlob = new Blob(["image"], { type: "image/png" });
    const dataset = createFixtureDataset();
    dataset.relations.reports[0].images = [{ id: "image-source", name: "skade.png", type: "image/png", size: sourceBlob.size, blob: sourceBlob, addedAt: "2026-09-08T09:00:00.000Z" }];
    dataset.relations.workshopTasks[0].afterImages = [{ id: "after-source", name: "efter.png", type: "image/png", size: sourceBlob.size, blob: sourceBlob, addedAt: "2026-09-08T09:30:00.000Z" }];
    const migrated = ensureDocumentRegistry(dataset);
    const reportDocument = migrated.relations.documents.find((item) => item.sourceKey === "report-report-demo-001-image-source");
    const taskDocument = migrated.relations.documents.find((item) => item.sourceKey?.includes("after-source"));
    expect(reportDocument.versions[0].blob).toBeNull();
    expect(resolveDocumentVersion(reportDocument, migrated).blob).toBe(sourceBlob);
    expect(taskDocument.relations.map((item) => item.type)).toEqual(expect.arrayContaining(["unit", "case", "workshopTask"]));
  });
});
