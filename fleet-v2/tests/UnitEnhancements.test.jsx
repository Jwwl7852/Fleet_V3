import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { validateUnitImage } from "../src/data/unitImage";
import { CURRENT_DATASET_VERSION, createMemoryUnitRepository, migrateDataset } from "../src/data/unitRepository";
import { parsePositiveDanishNumber, validateUnit } from "../src/data/unitSelectors";
import { mapVehicleLookupResult, normalizeDanishRegistration, normalizeExternalLength } from "../src/data/vehicleLookup";

const fillRequired = (dialog, number = "QA-920") => {
  fireEvent.change(within(dialog).getByLabelText(/Enhedsnummer/), { target: { value: number } });
  fireEvent.change(within(dialog).getByLabelText(/^Mærke/), { target: { value: "Manuelt mærke" } });
  fireEvent.change(within(dialog).getByLabelText(/^Model/), { target: { value: "Manuel model" } });
  fireEvent.change(within(dialog).getByLabelText(/^Afdeling/), { target: { value: "Test" } });
};

const lookupPayload = (registration = "AB12345") => ({
  source: "Kontrolleret testfixture",
  lookedUpAt: "2026-09-07T12:00:00.000Z",
  registration,
  make: "Volvo",
  model: "FH 500",
  variant: "Globetrotter",
  type: "vehicle",
  modelYear: 2024,
  firstRegistrationDate: "2024-02-03",
  fuel: "Diesel",
  serialNumber: "TESTVIN123",
  color: "Hvid",
  curbWeightKg: 8200,
  grossWeightKg: 18000,
  dimensions: { length: 7.195, width: 2.49, height: 3.2, unit: "m" },
  historicalOdometer: { value: 42100, unit: "km", observedAt: "2025-11-01" },
});

describe("FLEET v2 enhedsforbedringer", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/enheder");
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:test-image"), revokeObjectURL: vi.fn() });
  });

  it("normaliserer danske nummerplader bredt uden en snæver formatregel", () => {
    expect(normalizeDanishRegistration("  ab 12-345 ")).toBe("AB12345");
    expect(normalizeDanishRegistration("ø 12 345")).toBe("Ø12345");
  });

  it("viser frakoblet opslag og tillader fortsat manuel oprettelse", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Enhedskartotek" });
    fireEvent.click(screen.getByRole("button", { name: "Opret enhed" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Registreringsnummer"), { target: { value: "ab 12 345" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hent køretøjsdata" }));
    expect(await within(dialog).findByText(/Nummerpladeopslag er ikke tilsluttet/)).toBeTruthy();
    expect(within(dialog).getByLabelText("Registreringsnummer").value).toBe("AB12345");
  });

  it("viser opslag til gennemgang og beskytter manuelt udfyldte felter", async () => {
    const lookup = { lookup: vi.fn(async () => lookupPayload()) };
    render(<FleetV2App repository={createMemoryUnitRepository()} vehicleLookup={lookup} />);
    await screen.findByRole("heading", { name: "Enhedskartotek" });
    fireEvent.click(screen.getByRole("button", { name: "Opret enhed" }));
    const dialog = screen.getByRole("dialog");
    fillRequired(dialog);
    fireEvent.change(within(dialog).getByLabelText("Registreringsnummer"), { target: { value: "ab 12 345" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hent køretøjsdata" }));
    expect(await within(dialog).findByRole("heading", { name: "Fundne køretøjsoplysninger" })).toBeTruthy();
    expect(lookup.lookup).toHaveBeenCalledWith("AB12345");
    const review = within(dialog).getByRole("heading", { name: "Fundne køretøjsoplysninger" }).closest(".lookup-review");
    const makeChoice = within(review).getByText("Mærke").closest("label").querySelector("input");
    const variantChoice = within(review).getByText("Variant").closest("label").querySelector("input");
    expect(makeChoice.checked).toBe(false);
    expect(variantChoice.checked).toBe(true);
    expect(within(dialog).getByText(/Historisk målerstand/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Anvend valgte oplysninger" }));
    expect(within(dialog).getByLabelText(/^Mærke/).value).toBe("Manuelt mærke");
    expect(within(dialog).getByLabelText("Variant").value).toBe("Globetrotter");
  });

  it("ignorerer et forældet opslagssvar efter ændring af nummerpladen", async () => {
    let resolveFirst;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    const lookup = { lookup: vi.fn(() => first) };
    render(<FleetV2App repository={createMemoryUnitRepository()} vehicleLookup={lookup} />);
    await screen.findByRole("heading", { name: "Enhedskartotek" });
    fireEvent.click(screen.getByRole("button", { name: "Opret enhed" }));
    const dialog = screen.getByRole("dialog");
    const registration = within(dialog).getByLabelText("Registreringsnummer");
    fireEvent.change(registration, { target: { value: "AB12345" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hent køretøjsdata" }));
    fireEvent.change(registration, { target: { value: "CD67890" } });
    resolveFirst(lookupPayload("AB12345"));
    await Promise.resolve();
    expect(within(dialog).queryByRole("heading", { name: "Fundne køretøjsoplysninger" })).toBeNull();
    expect(registration.value).toBe("CD67890");
  });

  it("bevarer manglende opslagfelter tomme og konverterer eksterne mål til centimeter", () => {
    const mapped = mapVehicleLookupResult({ source: "Test", registration: "AB 12 345", make: "Volvo", dimensions: { length: 5995, width: 2490, unit: "mm" } });
    expect(mapped.fields.model).toBe("");
    expect(mapped.fields.lengthCm).toBe(599.5);
    expect(mapped.fields.widthCm).toBe(249);
    expect(mapped.fields.heightCm).toBeNull();
    expect(normalizeExternalLength(3.2, "m")).toBe(320);
  });

  it("gemmer decimalkomma som strukturerede valgfrie centimetermål og viser dem på profilen", async () => {
    const repository = createMemoryUnitRepository();
    render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "Enhedskartotek" });
    fireEvent.click(screen.getByRole("button", { name: "Opret enhed" }));
    const dialog = screen.getByRole("dialog");
    fillRequired(dialog, "QA-921");
    fireEvent.click(within(dialog).getByLabelText(/Tilføj udvendige mål/));
    fireEvent.change(within(dialog).getByLabelText("Længde i cm"), { target: { value: "599,5" } });
    fireEvent.change(within(dialog).getByLabelText("Bredde i cm"), { target: { value: "210" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Opret enhed" }));
    const created = await waitFor(() => repository.inspect().units.find((item) => item.number === "QA-921"));
    expect(created.dimensions).toEqual({ unit: "cm", lengthCm: 599.5, widthCm: 210, heightCm: null });
    act(() => {
      window.history.pushState({}, "", `/enheder/${created.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByText("Udvendig længde")).toBeTruthy();
    expect(screen.getByText("599,5 cm")).toBeTruthy();
  });

  it("validerer negative mål og bekræfter før eksisterende mål fjernes", async () => {
    const dataset = createFixtureDataset();
    const target = dataset.units.find((item) => item.number === "NB-001");
    target.dimensions = { unit: "cm", lengthCm: 500, widthCm: null, heightCm: null };
    const repository = createMemoryUnitRepository(dataset);
    render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "Enhedskartotek" });
    fireEvent.click(screen.getByRole("button", { name: `Redigér ${target.number}` }));
    const dialog = screen.getByRole("dialog");
    const toggle = within(dialog).getByLabelText(/Tilføj udvendige mål/);
    globalThis.confirm.mockReturnValueOnce(false);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    globalThis.confirm.mockReturnValueOnce(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(globalThis.confirm).toHaveBeenCalledTimes(2);
    expect(parsePositiveDanishNumber("12,5")).toBe(12.5);
    expect(Number.isNaN(parsePositiveDanishNumber("-1"))).toBe(true);
    const errors = validateUnit({ ...target, number: "X", make: "M", model: "M", department: "D", meter: "0", dimensionsEnabled: true, lengthCm: "-1", widthCm: "", heightCm: "" }, [], null);
    expect(errors.lengthCm).toMatch(/positivt/);
  });

  it("uploader, erstatter og fjerner et Blob-billede med lokal genindlæsning", async () => {
    const repository = createMemoryUnitRepository();
    const imageProcessor = vi.fn(async (file) => ({ blob: file, type: file.type, name: file.name, width: 100, height: 60, source: "user-upload", updatedAt: "2026-09-07T12:00:00Z" }));
    render(<FleetV2App repository={repository} imageProcessor={imageProcessor} />);
    await screen.findByRole("heading", { name: "Enhedskartotek" });
    fireEvent.click(screen.getByRole("button", { name: "Opret enhed" }));
    let dialog = screen.getByRole("dialog");
    fillRequired(dialog, "QA-922");
    fireEvent.change(dialog.querySelector('input[type="file"]'), { target: { files: [new File(["one"], "one.png", { type: "image/png" })] } });
    expect(await within(dialog).findByAltText("Forhåndsvisning af enhedsbillede")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Opret enhed" }));
    await waitFor(() => expect(repository.inspect().units.find((item) => item.number === "QA-922")?.image?.type).toBe("image/png"));
    expect(repository.inspect().units.find((item) => item.number === "QA-922").image.blob).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Redigér QA-922" }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByAltText("Forhåndsvisning af enhedsbillede")).toBeTruthy();
    fireEvent.change(dialog.querySelector('input[type="file"]'), { target: { files: [new File(["two"], "two.webp", { type: "image/webp" })] } });
    await waitFor(() => expect(imageProcessor).toHaveBeenCalledTimes(2));
    fireEvent.click(within(dialog).getByRole("button", { name: "Fjern billede" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Gem ændringer" }));
    await waitFor(() => expect(repository.inspect().units.find((item) => item.number === "QA-922").image).toBeNull());
  });

  it("afviser ugyldige billeder og viser forståelig lagringsfejl", async () => {
    expect(() => validateUnitImage(new File(["x"], "note.txt", { type: "text/plain" }))).toThrow(/JPG/);
    const tooLarge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" });
    expect(() => validateUnitImage(tooLarge)).toThrow(/10 MB/);
    const repository = createMemoryUnitRepository();
    repository.saveUnit = vi.fn(async () => { throw new Error("IndexedDB er fuld"); });
    render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "Enhedskartotek" });
    fireEvent.click(screen.getByRole("button", { name: "Opret enhed" }));
    const dialog = screen.getByRole("dialog");
    fillRequired(dialog, "QA-923");
    fireEvent.click(within(dialog).getByRole("button", { name: "Opret enhed" }));
    expect(await within(dialog).findByText("IndexedDB er fuld")).toBeTruthy();
  });

  it("annullerer uden at gemme billede, mål eller øvrige rettelser", async () => {
    const repository = createMemoryUnitRepository();
    const original = repository.inspect().units.find((item) => item.number === "NB-001");
    render(<FleetV2App repository={repository} imageProcessor={async (file) => ({ blob: file, type: file.type, name: file.name })} />);
    await screen.findByRole("heading", { name: "Enhedskartotek" });
    fireEvent.click(screen.getByRole("button", { name: `Redigér ${original.number}` }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Mærke/), { target: { value: "Må ikke gemmes" } });
    fireEvent.click(within(dialog).getByLabelText(/Tilføj udvendige mål/));
    fireEvent.change(within(dialog).getByLabelText("Længde i cm"), { target: { value: "450" } });
    fireEvent.change(dialog.querySelector('input[type="file"]'), { target: { files: [new File(["x"], "x.png", { type: "image/png" })] } });
    await within(dialog).findByAltText("Forhåndsvisning af enhedsbillede");
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuller" }));
    expect(repository.inspect().units.find((item) => item.id === original.id)).toEqual(original);
  });

  it("migrerer ældre lokale datasæt tabsfrit og bevarer stabile ID'er og relationer", () => {
    const legacy = createFixtureDataset();
    legacy.version = 2;
    legacy.units[0].legacyField = "bevares";
    const migrated = migrateDataset(legacy);
    expect(migrated.version).toBe(CURRENT_DATASET_VERSION);
    expect(migrated.units[0].id).toBe(legacy.units[0].id);
    expect(migrated.units[0].legacyField).toBe("bevares");
    expect(migrated.units[0].image).toBeNull();
    expect(migrated.relations.activities).toEqual(legacy.relations.activities);
    expect(migrated.relations.documents.map((item) => item.id)).toEqual([...legacy.relations.documents.map((item) => item.id), "document-lease-demo-contract"]);
    expect(migrated.relations.documents[0].relations).toEqual(expect.arrayContaining([expect.objectContaining({ type: "unit", targetId: legacy.relations.documents[0].unitId })]));
    expect(migrated.relations.documents[0].versions[0].blob).toBeNull();
    expect(migrated.relations.reports).toHaveLength(legacy.relations.reports.length);
    expect(migrated.relations.reportDrafts).toEqual([]);
  });
});
