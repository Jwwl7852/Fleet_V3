import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GeoMap } from "../src/components/GeoMap";

const NOW = "2026-09-21T12:00:00.000Z";
const units = [
  { id: "unit-1", number: "TEST-101", make: "Veyro", model: "Servicebil", registration: "AB 12 345" },
  { id: "unit-2", number: "TEST-202", make: "Veyro", model: "Trailer", registration: null },
];

const position = (unitId, extra = {}) => ({
  id: `position-${unitId}`,
  unitId,
  latitude: 55.6761,
  longitude: 12.5683,
  label: "København",
  measuredAt: "2026-09-21T11:58:00.000Z",
  receivedAt: "2026-09-21T11:58:02.000Z",
  movementState: "moving",
  connectionStatus: "online",
  speedKph: 36,
  ...extra,
});

describe("Livekortets kompakte enhedsmarkører", () => {
  it("viser retningspil uden permanent enhedstekst og giver tooltip ved fokus", () => {
    render(<GeoMap controls={false} now={NOW} positions={[position("unit-1", { heading: 90 })]} units={units} />);
    const marker = screen.getByRole("button", { name: /TEST-101, Veyro Servicebil, Kører/ });
    expect(marker.querySelector(".geo-direction")).toBeTruthy();
    expect(marker.querySelector(".geo-direction-dot")).toBeNull();
    const tooltip = within(marker).getByRole("tooltip");
    expect(tooltip.textContent).toContain("TEST-101 · Veyro Servicebil");
    expect(tooltip.textContent).toContain("Nummerplade: AB 12 345");
    expect(tooltip.textContent).toContain("Seneste position");
  });

  it("bruger en rund ring ved stilstand, selv når en gammel retning findes", () => {
    render(<GeoMap controls={false} now={NOW} positions={[position("unit-2", { heading: 270, movementState: "stationary", speedKph: 0 })]} units={units} />);
    const marker = screen.getByRole("button", { name: /TEST-202, Veyro Trailer, Holder/ });
    expect(marker.classList.contains("holding")).toBe(true);
    expect(marker.querySelector(".geo-direction-ring")).toBeTruthy();
    expect(marker.querySelector(".geo-direction")).toBeNull();
  });

  it("falder tilbage til en prik, når en kørende enhed ikke har en retning", () => {
    render(<GeoMap controls={false} now={NOW} positions={[position("unit-1", { heading: null })]} units={units} />);
    const marker = screen.getByRole("button", { name: /TEST-101, Veyro Servicebil, Kører/ });
    expect(marker.querySelector(".geo-direction-dot")).toBeTruthy();
    expect(marker.querySelector(".geo-direction")).toBeNull();
  });

  it("vælger enheden ved klik og viser det eksisterende informationspanel", () => {
    const onSelect = vi.fn();
    render(<GeoMap controls={false} now={NOW} onSelect={onSelect} positions={[position("unit-1", { heading: 45 })]} units={units} />);
    fireEvent.click(screen.getByRole("button", { name: /TEST-101, Veyro Servicebil/ }));
    expect(onSelect).toHaveBeenCalledWith("unit-1");
    expect(screen.getByRole("region", { name: "Detaljer for TEST-101" })).toBeTruthy();
  });

  it("isolerer og fremhæver den fundne enhed fra en tæt markørgruppe", () => {
    const positions = [position("unit-1", { heading: 45 }), position("unit-2", { heading: null })];
    const { rerender } = render(<GeoMap controls={false} now={NOW} positions={positions} units={units} />);
    expect(screen.getByRole("button", { name: "2 enheder tæt på hinanden – zoom ind" })).toBeTruthy();
    rerender(<GeoMap controls={false} focusRequestId={1} focusUnitId="unit-1" now={NOW} positions={positions} units={units} />);
    const located = screen.getByRole("button", { name: /TEST-101, Veyro Servicebil/ });
    expect(located.classList.contains("located")).toBe(true);
    expect(screen.queryByRole("button", { name: /2 enheder tæt på hinanden/ })).toBeNull();
  });

  it("zoomer direkte ind på en klynge, så de enkelte enheder bliver synlige", () => {
    const positions = [position("unit-1", { longitude: 12.5683 }), position("unit-2", { longitude: 12.5693 })];
    render(<GeoMap controls={false} now={NOW} positions={positions} units={units} />);
    fireEvent.click(screen.getByRole("button", { name: "2 enheder tæt på hinanden – zoom ind" }));
    expect(screen.queryByRole("button", { name: /enheder tæt på hinanden/ })).toBeNull();
    expect(screen.getByRole("button", { name: /TEST-101, Veyro Servicebil/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /TEST-202, Veyro Trailer/ })).toBeTruthy();
  });

  it("markerer en gammel position tydeligt i tooltippen", () => {
    render(<GeoMap controls={false} now={NOW} positions={[position("unit-1", { measuredAt: "2026-09-20T08:00:00.000Z", heading: null })]} units={units} />);
    const marker = screen.getByRole("button", { name: /TEST-101, Veyro Servicebil, Intet signal/ });
    expect(marker.classList.contains("stale")).toBe(true);
    expect(within(marker).getByRole("tooltip").textContent).toContain("timer gammel");
  });
});
