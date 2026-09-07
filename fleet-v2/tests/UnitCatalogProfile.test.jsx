import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createMemoryUnitRepository } from "../src/data/unitRepository";
import { filterAndSortUnits, validateUnit } from "../src/data/unitSelectors";
import { createFixtureDataset } from "../src/data/fleetFixtures";

describe("Enhedskartotek og Enhedsprofil", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/enheder");
  });

  it("søger, filtrerer og sorterer uden chaufførfelter", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Enhedskartotek" });
    fireEvent.change(screen.getByLabelText("Søg i enheder"), { target: { value: "Silence" } });
    expect(screen.getByText("SC-104")).toBeTruthy();
    expect(screen.getByText("NB-016")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "workshop" } });
    expect(screen.getByText("SC-104")).toBeTruthy();
    expect(screen.queryByText("NB-016")).toBeNull();
    expect(document.body.textContent.toLocaleLowerCase("da")).not.toContain("chaufførfilter");
  });

  it("åbner en profil direkte og skifter mellem ID-bundne faner", async () => {
    window.history.replaceState({}, "", "/enheder/unit-sc-104");
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    expect(await screen.findByRole("heading", { name: "SC-104" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Servicebog" }));
    expect(screen.getByRole("heading", { name: "Servicebog" })).toBeTruthy();
    expect(screen.getByText("Planlagt service")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Økonomi" }));
    expect(screen.getByText(/ingen fakturabehandling/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "GPS" }));
    expect(screen.getByText(/Ingen ruter, opgaver eller chaufførplanlægning/i)).toBeTruthy();
  });

  it("opretter og redigerer en enhed med stabilt internt ID", async () => {
    const repository = createMemoryUnitRepository();
    const { unmount } = render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "Enhedskartotek" });
    fireEvent.click(screen.getByRole("button", { name: "Opret enhed" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Enhedsnummer/), { target: { value: "QA-900" } });
    fireEvent.change(within(dialog).getByLabelText(/^Mærke/), { target: { value: "Testmærke" } });
    fireEvent.change(within(dialog).getByLabelText(/^Model/), { target: { value: "Prototype" } });
    fireEvent.change(within(dialog).getByLabelText(/^Afdeling/), { target: { value: "Testafdeling" } });
    fireEvent.change(within(dialog).getByLabelText(/Målerstand/), { target: { value: "123" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Opret enhed" }));
    expect(await screen.findByText("QA-900")).toBeTruthy();
    const created = repository.inspect().units.find((unit) => unit.number === "QA-900");
    expect(created.id).toMatch(/^unit-local-/);

    fireEvent.click(screen.getByRole("button", { name: "Redigér QA-900" }));
    const editDialog = screen.getByRole("dialog");
    fireEvent.change(within(editDialog).getByLabelText(/Enhedsnummer/), { target: { value: "QA-901" } });
    fireEvent.click(within(editDialog).getByRole("button", { name: "Gem ændringer" }));
    await waitFor(() => expect(repository.inspect().units.find((unit) => unit.id === created.id).number).toBe("QA-901"));

    unmount();
    window.history.replaceState({}, "", "/enheder");
    render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "Enhedskartotek" });
    fireEvent.change(screen.getByLabelText("Søg i enheder"), { target: { value: "QA-901" } });
    expect(await screen.findByText("QA-901")).toBeTruthy();
    expect(repository.inspect().units.find((unit) => unit.number === "QA-901").id).toBe(created.id);
  });

  it("viser valideringsfejl for dublet og ugyldig målerstand", () => {
    const units = createFixtureDataset().units;
    const errors = validateUnit({ number: "SC-104", type: "scooter", make: "Silence", model: "S04", department: "Varelevering", meterType: "km", meter: "-1", status: "operation", year: "" }, units);
    expect(errors.number).toMatch(/allerede/);
    expect(errors.meter).toMatch(/positivt helt tal/);
  });

  it("viser tydelig tilstand for ukendt enheds-ID", async () => {
    window.history.replaceState({}, "", "/enheder/findes-ikke");
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    expect(await screen.findByRole("heading", { name: "Enheden findes ikke" })).toBeTruthy();
  });

  it("bevarer stabile relationer og typekorrekt målerenhed", () => {
    const dataset = createFixtureDataset();
    const machine = dataset.units.find((unit) => unit.id === "unit-nb-007");
    expect(machine.meterType).toBe("hours");
    for (const items of Object.values(dataset.relations)) {
      for (const item of items) expect(dataset.units.some((unit) => unit.id === item.unitId)).toBe(true);
    }
    const filtered = filterAndSortUnits(dataset.units, { query: "", tab: "machine", department: "", type: "", status: "", sort: "meter-desc" });
    expect(filtered.every((unit) => unit.type === "machine")).toBe(true);
  });
});
