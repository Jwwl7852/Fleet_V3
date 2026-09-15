import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createMemoryUnitRepository } from "../src/data/unitRepository";

function start(path = "/service") { window.history.replaceState({}, "", path); const repository = createMemoryUnitRepository(); render(<FleetV2App repository={repository} />); return repository; }

describe("selvstændigt Service-modul", () => {
  beforeEach(() => window.localStorage.clear());

  it("åbner Service fra menuen og viser alle fire relevante tilstande", async () => {
    start("/");
    await screen.findByRole("heading", { name: "God aften, Dennis" });
    fireEvent.click(screen.getByRole("button", { name: "Service" }));
    expect(await screen.findByRole("heading", { name: "Service og compliance" })).toBeTruthy();
    expect(screen.getByText("Overskredet", { selector: ".service-kpis span" })).toBeTruthy();
    expect(screen.getByText("Mangler grundlag", { selector: ".service-kpis span" })).toBeTruthy();
    expect(window.location.pathname).toBe("/service");
  });

  it("viser kun serverens serviceprojektion og starter ikke browserautomatik i servertilstand", async () => {
    window.history.replaceState({}, "", "/service");
    const repository = createMemoryUnitRepository();
    repository.runServiceAutomation = vi.fn();
    render(<FleetV2App repository={repository} serviceBackend={{
      kind: "server",
      units: [{ id: "shared-unit-1", number: "Fælles 1", model: "Serverenhed", meterType: "km", meter: 1000 }],
      relations: { serviceRequirements: [], serviceOccurrences: [] },
      loading: false,
      error: null,
      capabilities: { saveRequirement: false, runAutomation: false, planService: false, saveHistory: false, saveSettings: false },
    }} />);
    expect(await screen.findByText("serverstyrede serviceplaner", { exact: false })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Opret servicekrav" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Serviceautomatik" })).toBeNull();
    expect(screen.getByText("Serveraktiv · skriveadgang kræves")).toBeTruthy();
    expect(repository.runServiceAutomation).not.toHaveBeenCalled();
  });

  it("lader ikke en afventende serviceprojektion blokere uafhængige FLEET-flader", async () => {
    window.history.replaceState({}, "", "/");
    render(<FleetV2App repository={createMemoryUnitRepository()} serviceBackend={{
      kind: "server",
      units: [],
      relations: { serviceRequirements: [], serviceOccurrences: [] },
      loading: true,
      error: null,
      capabilities: { saveRequirement: false, runAutomation: false, planService: false, saveHistory: false, saveSettings: false },
    }} />);
    expect(await screen.findByRole("heading", { name: "God aften, Dennis" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Service" }));
    expect(await screen.findByText("Indlæser servicekrav …")).toBeTruthy();
  });

  it("kræver et eksplicit bevar-valg før et krav med åben forekomst deaktiveres", async () => {
    window.history.replaceState({}, "", "/service");
    const saveRequirement = vi.fn(async () => ({ ok: true }));
    render(<FleetV2App repository={createMemoryUnitRepository()} serviceBackend={{
      kind: "server",
      units: [{ id: "shared-unit-1", number: "Fælles 1", model: "Serverenhed", meterType: "km", meter: 1000 }],
      relations: {
        serviceRequirements: [{
          id: "servicekrav-1", unitId: "shared-unit-1", title: "Årligt service",
          firstDueDate: "2026-09-01", active: true, activeOccurrenceId: "occ-1", revision: 2,
        }],
        serviceOccurrences: [{ id: "occ-1", requirementId: "servicekrav-1", status: "alerted" }],
      },
      loading: false,
      error: null,
      capabilities: { saveRequirement: true, runAutomation: false, planService: false, saveHistory: false, saveSettings: false },
      saveRequirement,
    }} />);
    await screen.findByText("Årligt service");
    fireEvent.click(screen.getByRole("button", { name: "Redigér Årligt service" }));
    fireEvent.click(screen.getByLabelText("Aktivt krav"));
    expect(screen.getByText("Bevar den eksisterende indberetning og sag åbne.", { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gem servicekrav" }));
    expect(await screen.findByText("Bekræft, at den eksisterende indberetning og sag skal forblive åbne.")).toBeTruthy();
    expect(saveRequirement).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Bevar den eksisterende indberetning og sag åbne.", { exact: false }));
    fireEvent.click(screen.getByRole("button", { name: "Gem servicekrav" }));
    await waitFor(() => expect(saveRequirement).toHaveBeenCalledTimes(1));
    expect(saveRequirement.mock.calls[0][0].keepOpenOccurrence).toBe(true);
  });

  it("viser serverens serviceindberetning i triage uden lokale skrivehandlinger", async () => {
    window.history.replaceState({}, "", "/indberetninger/svcrep-1");
    const repository = createMemoryUnitRepository();
    render(<FleetV2App repository={repository} serviceBackend={{
      kind: "server",
      units: [{ id: "shared-unit-1", number: "Fælles 1", model: "Serverenhed", department: "Nord", meterType: "km", meter: 1000 }],
      relations: {
        serviceRequirements: [], serviceOccurrences: [], caseEvents: [],
        reports: [{ id: "svcrep-1", number: "svcrep-1", caseId: "svccase-1", unitId: "shared-unit-1", type: "service", category: "service", title: "Årligt service", description: "Serveroprettet varsel", severity: "moderate", usability: "uncertain", reporterName: "Serviceautomatik", images: [], createdAt: "2026-09-15T08:00:00Z", origin: "service_automation", readOnly: true }],
        cases: [{ id: "svccase-1", number: "svccase-1", reference: "svccase-1", reportId: "svcrep-1", unitId: "shared-unit-1", status: "new", priority: "normal", nextAction: "Vurder automatisk servicevarsel", createdAt: "2026-09-15T08:00:00Z", readOnly: true }],
      },
      loading: false,
      error: null,
      capabilities: { saveRequirement: false, runAutomation: false, planService: false, saveHistory: false, saveSettings: false },
    }} />);
    expect(await screen.findByRole("heading", { name: "Årligt service" })).toBeTruthy();
    expect(screen.getByText("Serverstyret servicevarsel", { exact: false })).toBeTruthy();
    expect(screen.getByText("Den lokale prototype må ikke ændre den.", { exact: false })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gem vurdering" })).toBeNull();
  });

  it("opretter et kombineret krav og planlægger det uden dubletsag", async () => {
    const repository = start();
    await screen.findByRole("heading", { name: "Service og compliance" });
    fireEvent.click(screen.getByRole("button", { name: "Opret servicekrav" }));
    fireEvent.change(screen.getByLabelText("Serviceenhed"), { target: { value: "unit-nb-002" } });
    fireEvent.change(screen.getByLabelText("Servicekravets titel"), { target: { value: "Bremse- og årsservice" } });
    fireEvent.change(screen.getByLabelText("Serviceinterval måneder"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Serviceinterval måler"), { target: { value: "20000" } });
    fireEvent.change(screen.getByLabelText("Service grunddato"), { target: { value: "2026-01-31" } });
    fireEvent.change(screen.getByLabelText("Service grundmåler"), { target: { value: "90000" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem servicekrav" }));
    expect(await screen.findByText("Bremse- og årsservice")).toBeTruthy();
    const requirement = repository.inspect().relations.serviceRequirements.find((item) => item.title === "Bremse- og årsservice");
    expect(requirement).toBeTruthy();
    fireEvent.click(screen.getByText("Bremse- og årsservice").closest("article").querySelector("button.primary-button"));
    fireEvent.click(screen.getByRole("button", { name: "Opret sag og opgave" }));
    expect(await screen.findByRole("heading", { name: "Bremse- og årsservice", level: 1 })).toBeTruthy();
    expect(repository.inspect().relations.cases.filter((item) => item.serviceRequirementId === requirement.id)).toHaveLength(1);
  });

  it("registrerer historisk service i den samme servicebog", async () => {
    const repository = start("/service?unit=unit-sc-104&action=history");
    await screen.findByRole("heading", { name: "Registrér historisk service" });
    fireEvent.change(screen.getByLabelText("Historisk servicekrav"), { target: { value: "service-requirement-sc-104" } });
    fireEvent.change(screen.getByLabelText("Historisk servicedato"), { target: { value: "2026-08-31" } });
    fireEvent.change(screen.getByLabelText("Historisk servicemåler"), { target: { value: "14500" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem i servicebogen" }));
    await waitFor(() => expect(repository.inspect().relations.service.some((item) => item.title === "Serviceeftersyn" && item.date === "2026-08-31")).toBe(true));
  });

  it("viser samme automatisk oprettede forløb i Service, Indberetninger og Arbejdskø", async () => {
    const repository = start();
    await screen.findByRole("heading", { name: "Service og compliance" });
    await waitFor(() => expect(repository.inspect().relations.reports.some((item) => item.origin === "service_automation")).toBe(true));
    const report = repository.inspect().relations.reports.find((item) => item.origin === "service_automation");
    const caseItem = repository.inspect().relations.cases.find((item) => item.reportId === report.id);
    fireEvent.click(screen.getAllByRole("button", { name: "Åbn indberetning" })[0]);
    expect(await screen.findByText("Automatisk oprettet fra Service", { selector: ".integration-badge" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Arbejdskø/ }));
    expect(await screen.findByRole("heading", { name: "Arbejdskø" })).toBeTruthy();
    expect(screen.getAllByText(caseItem.number).length).toBeGreaterThan(0);
  });

  it("opretter en fælles årsskabelon med en separat forekomst pr. enhed", async () => {
    const repository = start();
    await screen.findByRole("heading", { name: "Service og compliance" });
    fireEvent.click(screen.getByRole("button", { name: "Opret servicekrav" }));
    fireEvent.click(screen.getByLabelText("Fælles skabelon til flere enheder"));
    const nb001 = [...document.querySelectorAll(".service-unit-picker label")].find((item) => item.textContent.includes("NB-001"));
    fireEvent.click(nb001.querySelector("input"));
    fireEvent.change(screen.getByLabelText("Servicekravets titel"), { target: { value: "Vinterdæk · fælles test" } });
    fireEvent.change(screen.getByLabelText("Fast servicefrist"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("Årlig servicemåned"), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem servicekrav" }));
    await waitFor(() => expect(repository.inspect().relations.serviceRequirements.filter((item) => item.title === "Vinterdæk · fælles test")).toHaveLength(2));
    const requirements = repository.inspect().relations.serviceRequirements.filter((item) => item.title === "Vinterdæk · fælles test");
    expect(new Set(requirements.map((item) => item.templateId)).size).toBe(1);
  });
});
