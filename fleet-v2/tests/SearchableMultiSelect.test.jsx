import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import SearchableMultiSelect from "../../src/fleet/SearchableMultiSelect.jsx";

const options = [
  { value: "maintenance", label: "Vedligeholdelse" },
  { value: "inspection", label: "Eftersyn" },
  { value: "documentation", label: "Dokumentation" },
];

function Harness() {
  const [selected, setSelected] = useState([]);
  return <SearchableMultiSelect
    label="Kategori"
    allLabel="Alle kategorier"
    options={options}
    selected={selected}
    onChange={setSelected}
    singular="kategori"
    plural="kategorier"
  />;
}

describe("SearchableMultiSelect", () => {
  it("søger, vælger flere værdier og vender entydigt tilbage til Alle", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Alle kategorier/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Søg i kategori" }), { target: { value: "efter" } });
    expect(screen.getByText("Eftersyn")).toBeTruthy();
    expect(screen.queryByText("Vedligeholdelse")).toBeNull();

    fireEvent.change(screen.getByRole("searchbox", { name: "Søg i kategori" }), { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("Vedligeholdelse"));
    fireEvent.click(screen.getByLabelText("Eftersyn"));
    expect(screen.getByRole("button", { name: /2 kategorier/ })).toBeTruthy();
    expect(screen.getByLabelText("Alle kategorier").checked).toBe(false);

    fireEvent.click(screen.getByLabelText("Alle kategorier"));
    expect(screen.getByRole("button", { name: /Alle kategorier/ })).toBeTruthy();
  });

  it("lukker ved Escape og ved klik udenfor", () => {
    render(<><Harness /><button type="button">Udenfor</button></>);
    const trigger = screen.getByRole("button", { name: /Alle kategorier/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("searchbox", { name: "Søg i kategori" })).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Udenfor" }));
    expect(screen.queryByRole("searchbox", { name: "Søg i kategori" })).toBeNull();
  });
});
