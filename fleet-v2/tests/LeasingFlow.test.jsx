import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createMemoryUnitRepository } from "../src/data/unitRepository";

describe("Leasing i FLEET v2", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/leasing");
    vi.restoreAllMocks();
  });

  it("åbner leasingoverblikket fra den aktive menu og bruger samme beregnede aftaledata", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    expect(await screen.findByRole("heading", { name: "Leasing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leasing" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByText("LS-2024-018").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Nord Leasing/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Søg i leasingaftaler"), { target: { value: "findes-ikke" } });
    expect(screen.getByRole("heading", { name: "Ingen aftaler matcher" })).toBeTruthy();
  });

  it("åbner aftalen og kilometervisningen via stabile ruter", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Leasing" });
    fireEvent.click(screen.getByRole("row", { name: /NB-001.*LS-2024-018/ }));
    expect(await screen.findByRole("heading", { name: /NB-001 · Leasingaftale/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kilometer" }));
    expect(await screen.findByRole("heading", { name: /Kilometer og prognose · NB-001/ })).toBeTruthy();
    expect(screen.getByText(/OBD-tilvalg.*ikke tilsluttet/)).toBeTruthy();
  });

  it("viser den syntetiske kontrakt og anvender kun et eksplicit valgt forslag", async () => {
    window.history.replaceState({}, "", "/leasing/lease-demo-nb-001/kontraktgennemgang");
    const repository = createMemoryUnitRepository();
    render(<FleetV2App repository={repository} />);
    expect(await screen.findByRole("heading", { name: /Gennemgå aflæst leasingaftale/ })).toBeTruthy();
    expect(await screen.findByText("NORD LEASING")).toBeTruthy();
    const monthly = screen.getByLabelText("Forslag Månedlig ydelse");
    fireEvent.change(monthly, { target: { value: "4775" } });
    fireEvent.click(screen.getByRole("button", { name: "Anvend valgte oplysninger" }));
    expect(await screen.findByText(/valgte oplysninger er anvendt/i)).toBeTruthy();
    expect(repository.inspect().relations.leases[0].payment.recurringMinor).toBe(477500);
  });

  it("viser afleveringssagen uden at fremstille slutafregningen som kontrolleret", async () => {
    window.history.replaceState({}, "", "/leasing/lease-demo-nb-001/aflevering");
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    expect(await screen.findByRole("heading", { name: "NB-001 · Afleveringssag" })).toBeTruthy();
    expect(screen.getAllByText("Slutafregning")[0].parentElement.textContent).toContain("Afventer");
    expect(screen.getAllByText(/Fakturacenter er ikke tilsluttet/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Registrér fysisk aflevering" }).disabled).toBe(true);
  });

  it("uploader afleveringsdokumentation med relationer til enhed, aftale og sag", async () => {
    window.history.replaceState({}, "", "/leasing/lease-demo-nb-001/aflevering");
    const repository = createMemoryUnitRepository();
    render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "NB-001 · Afleveringssag" });
    const file = new File(["photo"], "aflevering.png", { type: "image/png" });
    const upload = screen.getAllByLabelText("Før-afleveringsbilleder").find((element) => element.type === "file");
    fireEvent.change(upload, { target: { files: [file] } });
    expect(await screen.findByText(/før-afleveringsfil/)).toBeTruthy();
    const document = repository.inspect().relations.documents.find((item) => item.versions?.some((version) => version.fileName === "aflevering.png"));
    expect(document.relations.map((item) => item.type).sort()).toEqual(["case", "lease", "unit"]);
  });

  it("opretter en ny kladde med validering og uden at ændre enheds-ID", async () => {
    const repository = createMemoryUnitRepository();
    render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "Leasing" });
    fireEvent.click(screen.getByRole("button", { name: "Opret leasingaftale" }));
    const dialog = screen.getByRole("form", { name: "Opret leasingaftale" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Gem aftale" }));
    expect(await within(dialog).findByText("Angiv aftalenummer.")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Aftalenummer"), { target: { value: "LS-LOCAL-101" } });
    fireEvent.change(within(dialog).getByLabelText("Leasingens enhed"), { target: { value: "unit-nb-002" } });
    fireEvent.change(within(dialog).getByLabelText("Leasingselskab"), { target: { value: "Demo Leasing" } });
    fireEvent.change(within(dialog).getByLabelText(/^Startdato/), { target: { value: "2026-01-01" } });
    fireEvent.change(within(dialog).getByLabelText(/^Kontraktudløb/), { target: { value: "2028-12-31" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Gem aftale" }));
    await waitFor(() => expect(repository.inspect().relations.leases.some((item) => item.agreementNumber === "LS-LOCAL-101" && item.unitId === "unit-nb-002")).toBe(true));
  });

  it("bevarer en valgt kontrakt ved faneskift og understøtter forhåndsvisning, udskiftning og fjernelse", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Leasing" });
    fireEvent.click(screen.getByRole("button", { name: "Opret leasingaftale" }));
    const dialog = screen.getByRole("form", { name: "Opret leasingaftale" });
    const first = new File(["første"], "første-kontrakt.pdf", { type: "application/pdf" });
    fireEvent.change(within(dialog).getByLabelText("Vælg leasingkontrakt"), { target: { files: [first] } });
    expect(within(dialog).getByText("første-kontrakt.pdf")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Betaling & km" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Aftale" }));
    expect(within(dialog).getByText("første-kontrakt.pdf")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Forhåndsvis" }));
    expect(within(dialog).getByLabelText("Forhåndsvisning af første-kontrakt.pdf")).toBeTruthy();
    const replacement = new File(["andet"], "anden-kontrakt.png", { type: "image/png" });
    fireEvent.change(within(dialog).getByLabelText("Udskift leasingkontrakt"), { target: { files: [replacement] } });
    expect(within(dialog).getByText("anden-kontrakt.png")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fjern" }));
    expect(within(dialog).getByLabelText("Vælg leasingkontrakt")).toBeTruthy();
  });

  it("håndterer drag-and-drop og gemmer samme kontrakt på aftale og enhed efter genindlæsning", async () => {
    const repository = createMemoryUnitRepository();
    const view = render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "Leasing" });
    fireEvent.click(screen.getByRole("button", { name: "Opret leasingaftale" }));
    const dialog = screen.getByRole("form", { name: "Opret leasingaftale" });
    const contract = new File(["aftale"], "LS-LOCAL-202.pdf", { type: "application/pdf" });
    fireEvent.drop(within(dialog).getByTestId("lease-contract-dropzone"), { dataTransfer: { files: [contract] } });
    fireEvent.change(within(dialog).getByLabelText("Aftalenummer"), { target: { value: "LS-LOCAL-202" } });
    fireEvent.change(within(dialog).getByLabelText("Leasingens enhed"), { target: { value: "unit-nb-002" } });
    fireEvent.change(within(dialog).getByLabelText("Leasingselskab"), { target: { value: "Lokal Leasing" } });
    fireEvent.change(within(dialog).getByLabelText(/^Startdato/), { target: { value: "2026-01-01" } });
    fireEvent.change(within(dialog).getByLabelText(/^Kontraktudløb/), { target: { value: "2028-12-31" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Gem aftale" }));
    await waitFor(() => expect(repository.inspect().relations.leases.some((item) => item.agreementNumber === "LS-LOCAL-202")).toBe(true));
    const lease = repository.inspect().relations.leases.find((item) => item.agreementNumber === "LS-LOCAL-202");
    const document = repository.inspect().relations.documents.find((item) => item.versions.some((version) => version.fileName === contract.name));
    expect(document.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "lease", targetId: lease.id }),
      expect.objectContaining({ type: "unit", targetId: "unit-nb-002" }),
    ]));
    expect(lease.documentIds).toContain(document.id);
    view.unmount();
    window.history.replaceState({}, "", `/leasing/${lease.id}/dokumenter`);
    const leaseView = render(<FleetV2App repository={repository} />);
    expect(await screen.findByText("LS-LOCAL-202.pdf")).toBeTruthy();
    leaseView.unmount();
    window.history.replaceState({}, "", "/enheder/unit-nb-002");
    render(<FleetV2App repository={repository} />);
    const profileTabs = await screen.findByRole("tablist", { name: "Enhedsprofilfaner" });
    fireEvent.click(within(profileTabs).getByRole("tab", { name: "Dokumenter" }));
    expect(await screen.findByText("LS-LOCAL-202.pdf")).toBeTruthy();
  });

  it("bevarer filen ved valideringsfejl og efterlader intet dokument ved annullering", async () => {
    const repository = createMemoryUnitRepository();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "Leasing" });
    fireEvent.click(screen.getByRole("button", { name: "Opret leasingaftale" }));
    const dialog = screen.getByRole("form", { name: "Opret leasingaftale" });
    const contract = new File(["aftale"], "ikke-gemt.pdf", { type: "application/pdf" });
    fireEvent.change(within(dialog).getByLabelText("Vælg leasingkontrakt"), { target: { files: [contract] } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Gem aftale" }));
    expect(await within(dialog).findByText("Angiv aftalenummer.")).toBeTruthy();
    expect(within(dialog).getByText("ikke-gemt.pdf")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Udskift leasingkontrakt"), { target: { files: [new File(["x"], "farlig.html", { type: "text/html" })] } });
    expect(within(dialog).getByRole("alert").textContent).toMatch(/Filtypen understøttes ikke/);
    expect(within(dialog).getByText("ikke-gemt.pdf")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuller" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("form", { name: "Opret leasingaftale" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuller" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(repository.inspect().relations.documents.some((item) => item.versions.some((version) => version.fileName === "ikke-gemt.pdf"))).toBe(false);
  });
});
