import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createMemoryUnitRepository } from "../src/data/unitRepository";

const renderApp = () => render(<FleetV2App repository={createMemoryUnitRepository()} />);

describe("FLEET v2 etape 1–2", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("render sidebar, topbjælke og Overblik med beregnede demodata", async () => {
    renderApp();
    expect(screen.getByRole("navigation", { name: "FLEET v2 navigation" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "God aften, Dennis" })).toBeTruthy();
    expect(screen.getByText("Fiktive demodata · ikke live")).toBeTruthy();
    expect(screen.getByText("19")).toBeTruthy();
    expect(screen.getByLabelText("Søg i FLEET v2-demodata").getAttribute("placeholder")).not.toMatch(/chauffør/i);
    expect(screen.getByText("Demokort · ikke live")).toBeTruthy();
  });

  it("åbner Enhedskartotek og markerer senere moduler som ikke implementeret", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Enheder" }));
    expect(await screen.findByRole("heading", { name: "Enhedskartotek" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Indberetninger" }));
    expect(screen.getByRole("status").textContent).toContain("Indberetninger: Ikke implementeret i denne etape");
  });

  it("viser platformshierarkiet og folder kun FLEET uden at skifte side", async () => {
    const repository = createMemoryUnitRepository();
    const { unmount } = render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "God aften, Dennis" });
    const fleetToggle = screen.getByRole("button", { name: "FLEET" });
    expect(fleetToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Overblik" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Fælles")).toBeTruthy();
    expect(screen.getByText("Driftsmoduler")).toBeTruthy();
    expect(screen.getByText("Administration")).toBeTruthy();

    fireEvent.click(fleetToggle);
    expect(fleetToggle.getAttribute("aria-expanded")).toBe("false");
    expect(fleetToggle.className).toContain("has-active-child");
    expect(screen.getByRole("heading", { name: "God aften, Dennis" })).toBeTruthy();
    expect(window.localStorage.getItem("veyro:fleet-v2:fleet-menu-open")).toBe("false");

    unmount();
    render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "God aften, Dennis" });
    expect(screen.getByRole("button", { name: "FLEET" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("markerer platformdestinationer som ikke implementeret", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "God aften, Dennis" });
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    expect(screen.getByRole("status").textContent).toContain("Dashboard: Ikke implementeret i denne etape");
  });

  it("markerer synlige, ikke-aktive dashboardhandlinger som pladsholdere", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "God aften, Dennis" });
    fireEvent.click(screen.getByRole("button", { name: "Sidste 14 dage" }));
    expect(screen.getByRole("status").textContent).toContain("Periodevalg: Ikke implementeret i denne etape");
  });

  it("viser ingen Planning- eller fakturaproces på Overblik", async () => {
    const { container } = renderApp();
    await screen.findByRole("heading", { name: "God aften, Dennis" });
    const text = container.textContent.toLowerCase();
    expect(text).not.toContain("dagens opgaver");
    expect(text).not.toContain("planlagt rute");
    expect(text).not.toContain("fakturamatch");
    expect(text).not.toContain("chaufførsøgning");
  });
});
