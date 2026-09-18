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
    expect(await screen.findByRole("heading", { name: "FLEET – overblik" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enheder: 19" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Kommende service" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Åbne sager" })).toBeTruthy();
    expect(screen.getByLabelText("Søg i FLEET v2-demodata").getAttribute("placeholder")).not.toMatch(/chauffør/i);
  });

  it("åbner Enheder og aktiverer Indberetninger uden at åbne gamle sider", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Enheder" }));
    expect(await screen.findByRole("heading", { name: "Enheder" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Indberetninger" }));
    expect(await screen.findByRole("heading", { name: "Indberetninger", level: 1 })).toBeTruthy();
    expect(window.location.pathname).toBe("/indberetninger");
  });

  it("åbner Enheder fra overblikkets nøgletal", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "FLEET – overblik" });
    fireEvent.click(screen.getByRole("button", { name: "Enheder: 19" }));
    expect(await screen.findByRole("heading", { name: "Enheder" })).toBeTruthy();
    expect(window.location.pathname).toBe("/enheder");
  });

  it("viser platformshierarkiet og folder kun FLEET uden at skifte side", async () => {
    const repository = createMemoryUnitRepository();
    const { unmount } = render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "FLEET – overblik" });
    const fleetToggle = screen.getByRole("button", { name: "FLEET" });
    expect(fleetToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Overblik" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Fælles")).toBeTruthy();
    expect(screen.getByText("Driftsmoduler")).toBeTruthy();
    expect(screen.getByText("Administration")).toBeTruthy();

    fireEvent.click(fleetToggle);
    expect(fleetToggle.getAttribute("aria-expanded")).toBe("false");
    expect(fleetToggle.className).toContain("has-active-child");
    expect(screen.getByRole("heading", { name: "FLEET – overblik" })).toBeTruthy();
    expect(window.localStorage.getItem("veyro:fleet-v2:fleet-menu-open")).toBe("false");

    unmount();
    render(<FleetV2App repository={repository} />);
    await screen.findByRole("heading", { name: "FLEET – overblik" });
    expect(screen.getByRole("button", { name: "FLEET" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("markerer platformdestinationer som ikke implementeret", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "FLEET – overblik" });
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    expect(screen.getByRole("status").textContent).toContain("Dashboard: Ikke implementeret i denne etape");
  });

  it("viser de tre aftalte nøgletal og de to handlingslister", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "FLEET – overblik" });
    expect(screen.getByRole("button", { name: "Enheder: 19" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Åbne sager: 14" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Service snart: 4" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Kommende service" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Åbne sager" })).toBeTruthy();
  });

  it("viser ingen Planning- eller fakturaproces på Overblik", async () => {
    const { container } = renderApp();
    await screen.findByRole("heading", { name: "FLEET – overblik" });
    const text = container.textContent.toLowerCase();
    expect(text).not.toContain("dagens opgaver");
    expect(text).not.toContain("planlagt rute");
    expect(text).not.toContain("fakturamatch");
    expect(text).not.toContain("chaufførsøgning");
  });
});
