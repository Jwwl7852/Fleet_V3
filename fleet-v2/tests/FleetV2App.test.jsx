import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createMemoryUnitRepository } from "../src/data/unitRepository";

const renderApp = () => render(<FleetV2App repository={createMemoryUnitRepository()} />);

describe("FLEET v2 navigation", () => {
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
    expect(screen.getByText("Demopositioner – ikke live")).toBeTruthy();
  });

  it("åbner Enhedskartotek og aktiverer Indberetninger uden at åbne gamle sider", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Enheder" }));
    expect(await screen.findByRole("heading", { name: "Enhedskartotek" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Indberetninger" }));
    expect(await screen.findByRole("heading", { name: "Indberetninger og triage" })).toBeTruthy();
    expect(window.location.pathname).toBe("/indberetninger");
  });

  it("åbner overblikkets nøgletal med det relevante arbejdsfilter", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "God aften, Dennis" });
    fireEvent.click(screen.getByRole("button", { name: /Åbn i drift/ }));
    expect(await screen.findByRole("heading", { name: "Enhedskartotek" })).toBeTruthy();
    expect(screen.getByLabelText("Status").value).toBe("operation");
    expect(window.location.search).toBe("?status=operation");
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

  it("ændrer driftsgrundlag og omkostningsmåned fra overblikket", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "God aften, Dennis" });
    const period = screen.getByLabelText("Driftsperiode");
    expect(period.value).toBe("week");
    fireEvent.change(period, { target: { value: "quarter" } });
    expect(period.value).toBe("quarter");
    expect(document.querySelectorAll(".operation-chart .bar-column")).toHaveLength(3);
    const month = screen.getByLabelText("Omkostningsmåned");
    fireEvent.change(month, { target: { value: "2025-02" } });
    expect(month.value).toBe("2025-02");
    expect(screen.queryByText(/Periodevalg: Ikke implementeret/)).toBeNull();
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
