import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createMemoryUnitRepository } from "../src/data/unitRepository";
import { createFixtureDataset } from "../src/data/fleetFixtures";

describe("Livekort", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/livekort");
  });

  it("søger og kombinerer filtre uden at skjule en enhed uden position", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    expect(await screen.findByRole("heading", { name: "Livekort" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Søg nummer/), { target: { value: "Husqvarna" } });
    fireEvent.click(screen.getByRole("button", { name: /NB-018/ }));
    expect(screen.getByText("Ingen position registreret")).toBeTruthy();
    expect(screen.getByText(/ingen fiktiv positionspost/i)).toBeTruthy();
  });

  it("synkroniserer valg og navigerer til enhedens stabile profil", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Livekort" });
    const row = screen.getByRole("button", { name: /SC-104/ });
    fireEvent.click(row);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Åbn enhedsprofil/ }));
    expect(window.location.pathname).toBe("/enheder/unit-sc-104");
    expect(await screen.findByRole("heading", { name: "SC-104" })).toBeTruthy();
  });

  it("bevarer filtre og valgt enhed, når den integrerede route genmonteres", async () => {
    const props = { repository: createMemoryUnitRepository(), onNavigate: () => {} };
    const { rerender } = render(<FleetV2App {...props} pathname="/livekort" />);
    await screen.findByRole("heading", { name: "Livekort" });
    fireEvent.change(screen.getByPlaceholderText(/Søg nummer/), { target: { value: "SC-104" } });
    fireEvent.click(screen.getAllByRole("button", { name: /SC-104/ }).find((button) => button.classList.contains("position-unit-row")));
    rerender(<FleetV2App {...props} pathname="/enheder/unit-sc-104" />);
    expect(await screen.findByRole("heading", { name: "SC-104" })).toBeTruthy();
    rerender(<FleetV2App {...props} pathname="/livekort" />);
    expect(await screen.findByRole("heading", { name: "Livekort" })).toBeTruthy();
    expect(screen.getByPlaceholderText(/Søg nummer/).value).toBe("SC-104");
    expect(screen.getAllByRole("button", { name: /SC-104/ }).find((button) => button.classList.contains("position-unit-row")).getAttribute("aria-pressed")).toBe("true");
  });

  it("åbner en kortforankret popup med enhedsdetaljer og profillink", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Livekort" });
    fireEvent.click(screen.getByRole("button", { name: /NB-010, Ustabil forbindelse/ }));
    const popup = screen.getByLabelText("Detaljer for NB-010");
    expect(within(popup).getByText("Greve")).toBeTruthy();
    expect(within(popup).getByText(/Ustabil forbindelse/)).toBeTruthy();
    fireEvent.click(within(popup).getByRole("button", { name: "Åbn enhedsprofil" }));
    expect(window.location.pathname).toBe("/enheder/unit-nb-010");
  });

  it("viser offline og forældet position adskilt fra bevægelse", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Livekort" });
    fireEvent.click(screen.getByRole("button", { name: /NB-006/ }));
    const details = screen.getByText("Seneste kontakt").closest("aside");
    expect(within(details).getAllByText("Offline").length).toBeGreaterThan(0);
    expect(within(details).getByText(/Ukendt bevægelse/)).toBeTruthy();
    expect(within(details).getByText(/Positionen er forældet/i)).toBeTruthy();
  });

  it("bevarer valgt enhed ved en demopdatering", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Livekort" });
    fireEvent.click(screen.getByRole("button", { name: /SC-104/ }));
    fireEvent.click(screen.getByRole("button", { name: "Demokontrol" }));
    fireEvent.change(screen.getByLabelText("Enhed", { selector: ".position-demo-control select" }), { target: { value: "unit-sc-104" } });
    fireEvent.click(screen.getByRole("button", { name: "Kør demo" }));
    expect(await screen.findByText(/Kortudsnit og valg er bevaret/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /SC-104/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("viser et forståeligt reservekort, hvis kortfliser fejler", async () => {
    const { container } = render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Livekort" });
    fireEvent.error(container.querySelector(".map-tiles img"));
    expect(screen.getByLabelText("Lokalt reservekort")).toBeTruthy();
  });

  it("indeholder ingen driftsplanlægning i Livekortets indhold", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    const main = await screen.findByRole("main");
    const text = main.textContent.toLocaleLowerCase("da");
    ["rutehistorik", "dagens opgaver", "planlagte stop", "besøgsrækkefølge", "chaufførplanlægning"].forEach((term) => expect(text).not.toContain(term));
  });

  it("zoomer kortet med almindeligt musehjul men overlader Shift-hjulet til arbejdsområdet", async () => {
    const { container } = render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Livekort" });
    const map = screen.getByRole("application", { name: /Geografisk kort/ });
    const before = container.querySelector(".map-tiles img")?.getAttribute("src");
    fireEvent.wheel(map, { deltaY: -100 });
    const after = container.querySelector(".map-tiles img")?.getAttribute("src");
    expect(after).not.toBe(before);
    fireEvent.wheel(map, { deltaY: -100, shiftKey: true });
    expect(container.querySelector(".map-tiles img")?.getAttribute("src")).toBe(after);
  });

  it("lader brugeren vælge hver enhed på samme position fra en klyngeliste", async () => {
    const dataset = createFixtureDataset();
    dataset.relations.positions[1].latitude = dataset.relations.positions[0].latitude;
    dataset.relations.positions[1].longitude = dataset.relations.positions[0].longitude;
    render(<FleetV2App repository={createMemoryUnitRepository(dataset)} />);
    await screen.findByRole("heading", { name: "Livekort" });
    fireEvent.click(screen.getAllByRole("button", { name: /enheder tæt på hinanden/ })[0]);
    const list = screen.getByLabelText("Vælg enhed i klynge");
    expect(within(list).getByRole("button", { name: /SC-104/ })).toBeTruthy();
    expect(within(list).getByRole("button", { name: /NB-001/ })).toBeTruthy();
    fireEvent.click(within(list).getByRole("button", { name: /NB-001/ }));
    expect(screen.getByRole("button", { name: /NB-001/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Detaljer for NB-001")).toBeTruthy();
  });
});
