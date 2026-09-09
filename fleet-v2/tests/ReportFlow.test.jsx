import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createMemoryUnitRepository } from "../src/data/unitRepository";

function start(path, repository = createMemoryUnitRepository(), props = {}) {
  window.history.replaceState({}, "", path);
  render(<FleetV2App repository={repository} {...props} />);
  return repository;
}

async function fillWizard({ withImage = false } = {}) {
  await screen.findByRole("heading", { name: "Ny indberetning" });
  fireEvent.click(screen.getByRole("button", { name: /SC-104/ }));
  fireEvent.click(screen.getByRole("button", { name: /Fortsæt/ }));
  await screen.findByRole("heading", { name: "Beskriv problemet" });
  fireEvent.click(screen.getByRole("button", { name: /Skade/ }));
  fireEvent.change(screen.getByLabelText("Kategori"), { target: { value: "Karrosseri" } });
  fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "Skade ved spejl" } });
  fireEvent.change(screen.getByLabelText("Beskrivelse"), { target: { value: "Spejlet er beskadiget og sidder løst." } });
  fireEvent.click(screen.getByRole("button", { name: /Fortsæt/ }));
  await screen.findByRole("heading", { name: "Dokumentation og anvendelighed" });
  if (withImage) {
    fireEvent.change(document.querySelector('.image-drop input[type="file"]'), { target: { files: [new File(["image"], "damage.png", { type: "image/png" })] } });
    await screen.findByAltText("Vedhæftet billede 1");
  }
  fireEvent.change(screen.getByLabelText(/^Kilometertal/), { target: { value: "12460" } });
  fireEvent.click(screen.getByLabelText("Kan ikke bruges"));
  fireEvent.click(screen.getByRole("button", { name: /Fortsæt/ }));
}

describe("indberetning, triage og Arbejdskø", () => {
  beforeEach(() => window.localStorage.clear());

  it("indberetter med billede og korrekt typeafhængig målerobservation uden dobbeltindsendelse", async () => {
    const repository = createMemoryUnitRepository();
    const submit = vi.spyOn(repository, "submitReport");
    start("/indberetninger/ny", repository, { imageProcessor: async (file) => ({ blob: file, type: file.type, name: file.name }) });
    await fillWizard({ withImage: true });
    const submitButton = screen.getByRole("button", { name: "Indsend indberetning" });
    fireEvent.click(submitButton); fireEvent.click(submitButton);
    expect(await screen.findByRole("heading", { name: "Tak for din indberetning" })).toBeTruthy();
    expect(submit).toHaveBeenCalledTimes(1);
    const latest = repository.inspect().relations.reports.at(-1);
    expect(latest.meterObservation).toMatchObject({ value: 12460, unit: "km" });
    expect(latest.images).toHaveLength(1);
  });

  it("bevarer formularen ved validerings- og lagringsfejl", async () => {
    const repository = createMemoryUnitRepository();
    repository.submitReport = vi.fn(async () => { throw new Error("Lokal lagring fejlede"); });
    start("/indberetninger/ny", repository);
    fireEvent.click(await screen.findByRole("button", { name: /Fortsæt/ }));
    expect(screen.getByText("Vælg en enhed.")).toBeTruthy();
    await fillWizard();
    fireEvent.click(screen.getByRole("button", { name: "Indsend indberetning" }));
    expect(await screen.findByText(/Lokal lagring fejlede/)).toBeTruthy();
    expect(screen.getByText("Skade ved spejl")).toBeTruthy();
  });

  it("opdaterer triage og viser samme sag i kanban og tabel", async () => {
    const repository = start("/indberetninger/report-demo-002");
    await screen.findByRole("heading", { name: "AdBlue-advarsel" });
    fireEvent.change(screen.getByLabelText("Vurderet prioritet"), { target: { value: "high" } });
    fireEvent.change(screen.getByLabelText("Ansvarlig"), { target: { value: "demo-lars" } });
    fireEvent.change(screen.getByLabelText("Flyt status"), { target: { value: "assessing" } });
    fireEvent.change(screen.getByLabelText("Intern note"), { target: { value: "Diagnose ønskes" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem vurdering" }));
    await waitFor(() => expect(repository.inspect().relations.cases.find((item) => item.id === "case-demo-002")).toMatchObject({ priority: "high", assigneeId: "demo-lars", status: "assessing" }));
    fireEvent.click(screen.getByRole("button", { name: /Arbejdskø/ }));
    expect(await screen.findByRole("heading", { name: "Arbejdskø" })).toBeTruthy();
    expect(screen.getAllByText("AdBlue-advarsel").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Tabel/ }));
    expect(screen.getByRole("table")).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("SAG-00002")).toBeTruthy();
  });

  it("viser forståelige tilstande for ukendte direkte ID-ruter", async () => {
    start("/indberetninger/ukendt");
    expect(await screen.findByRole("heading", { name: "Indberetningen findes ikke" })).toBeTruthy();
  });
});
