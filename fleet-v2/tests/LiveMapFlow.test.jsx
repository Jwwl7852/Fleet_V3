import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createMemoryUnitRepository } from "../src/data/unitRepository";

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
});
