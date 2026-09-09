import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { createMemoryUnitRepository } from "../src/data/unitRepository";

function start(path, dataset) {
  window.history.replaceState({}, "", path);
  const repository = createMemoryUnitRepository(dataset);
  render(<FleetV2App repository={repository} />);
  return repository;
}

describe("Værksted og kalender", () => {
  beforeEach(() => window.localStorage.clear());

  it("viser værkstedsoversigt og åbner eksempelopgaven direkte", async () => {
    start("/vaerksted");
    expect(await screen.findByRole("heading", { name: "Værksted" })).toBeTruthy();
    expect(screen.getByText("VO-00001")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /VO-00001/ }));
    expect(await screen.findByRole("heading", { name: "Udskift beskadiget strømkabel" })).toBeTruthy();
    expect(screen.getByText("Beskadiget strømkabel", { exact: true })).toBeTruthy();
  });

  it("opretter værkstedsopgaven eksplicit fra en klar sag uden dublet", async () => {
    const dataset = createFixtureDataset();
    dataset.relations.workshopTasks = [];
    dataset.relations.bookings = [];
    dataset.relations.workshopEvents = [];
    const repository = start("/arbejdsko/case-demo-003", dataset);
    await screen.findByRole("heading", { name: "Arbejdskø" });
    fireEvent.click(screen.getByRole("button", { name: "Opret værkstedsopgave" }));
    fireEvent.change(screen.getByLabelText("Opgavetitel"), { target: { value: "Udskift kabel sikkert" } });
    fireEvent.click(screen.getByRole("button", { name: "Opret opgave" }));
    expect(await screen.findByRole("heading", { name: "Udskift kabel sikkert" })).toBeTruthy();
    expect(repository.inspect().relations.workshopTasks.filter((item) => item.caseId === "case-demo-003")).toHaveLength(1);
  });

  it("starter en opgave akut og kræver fulde afslutningsdata", async () => {
    const repository = start("/vaerksted/workshop-task-demo-001");
    await screen.findByRole("heading", { name: "Udskift beskadiget strømkabel" });
    fireEvent.change(screen.getByLabelText("Værkstedsstatus"), { target: { value: "in_progress" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem opgave" }));
    await waitFor(() => expect(repository.inspect().relations.workshopTasks[0].status).toBe("in_progress"));
    expect(repository.inspect().relations.cases.find((item) => item.id === "case-demo-003").status).toBe("workshop");
    fireEvent.change(screen.getByLabelText("Værkstedsstatus"), { target: { value: "completed" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem opgave" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/udførte arbejde/i);
  });

  it("viser kalender og forståelige ikke-fundet-tilstande", async () => {
    start("/vaerksted/kalender");
    expect(await screen.findByRole("heading", { name: "Værkstedskalender" })).toBeTruthy();
    expect(screen.getAllByText(/VO-00001/).length).toBeGreaterThan(0);
    window.history.replaceState({}, "", "/vaerksted/ukendt-opgave");
    fireEvent.popState(window);
    expect(await screen.findByRole("heading", { name: "Værkstedsopgaven findes ikke" })).toBeTruthy();
  });
});
