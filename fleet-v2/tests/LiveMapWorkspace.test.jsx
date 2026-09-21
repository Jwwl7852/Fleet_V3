import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createFixtureDataset } from "../src/data/fleetFixtures";
import { createMemoryUnitRepository } from "../src/data/unitRepository";

function modeButton(name) {
  return within(screen.getByRole("group", { name: "Vælg Live eller Historik" })).getByRole("button", { name, exact: true });
}

describe("Livekortets fælles Live- og Historikarbejdsflade", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/livekort");
  });

  it("viser syntetiske statusforskelle og bevarer filtre ved skift til historik og tilbage", async () => {
    const { container } = render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Livekort" });

    expect(screen.getByRole("button", { name: "Kører 7" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Holder 10" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Intet signal 2" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Afdeling"), { target: { value: "Transport" } });
    fireEvent.click(modeButton("Historik"));

    expect(await screen.findByLabelText("Historikpanel")).toBeTruthy();
    expect(screen.getByRole("application", { name: /Historisk rute/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Kort" }).getAttribute("aria-selected")).toBe("true");
    expect(container.querySelectorAll(".geo-route-endpoint")).toHaveLength(2);
    expect(container.querySelector(".geo-route-cursor")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Positioner" }));
    expect(await screen.findByRole("heading", { name: /Positioner ·/ })).toBeTruthy();
    expect(screen.getByLabelText("Historikpanel")).toBeTruthy();

    fireEvent.click(modeButton("Live"));
    expect((await screen.findByLabelText("Afdeling")).value).toBe("Transport");
  });

  it("kan folde samme højrepanel sammen i historikvisningen", async () => {
    const { container } = render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Livekort" });
    fireEvent.click(modeButton("Historik"));
    fireEvent.click(await screen.findByRole("button", { name: "Skjul historikpanel" }));
    expect(container.querySelector(".history-workspace").classList.contains("list-collapsed")).toBe(true);
    expect(screen.getByRole("button", { name: "Vis historikpanel" })).toBeTruthy();
  });

  it("opfinder ikke historik for en normal tenant uden historikdata", async () => {
    const repository = createMemoryUnitRepository(createFixtureDataset("tenant-without-history"));
    render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "Livekort" });
    fireEvent.click(modeButton("Historik"));
    expect(await screen.findByRole("heading", { name: "Ingen positionsdata i perioden" })).toBeTruthy();
    expect(screen.getAllByText("Enheden har ingen tilgængelig positionshistorik i den valgte periode.")).toHaveLength(2);
  });
});
