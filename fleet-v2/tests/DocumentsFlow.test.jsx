import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createMemoryUnitRepository } from "../src/data/unitRepository";

describe("Dokumenter i FLEET v2", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/dokumenter");
  });

  it("åbner dokumentoversigten fra den aktive FLEET-menu og søger i relationer", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    expect(await screen.findByRole("heading", { name: "Dokumenter" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dokumenter" }).getAttribute("aria-current")).toBe("page");
    fireEvent.change(screen.getByLabelText("Søg i dokumenter"), { target: { value: "SC-104" } });
    expect(screen.getAllByText("Forsikringspolice 2025.pdf").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Søg i dokumenter"), { target: { value: "findes-ikke" } });
    expect(screen.getByRole("heading", { name: "Ingen dokumenter matcher" })).toBeTruthy();
  });

  it("uploader en fil med relation og åbner detaljen", async () => {
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    await screen.findByRole("heading", { name: "Dokumenter" });
    fireEvent.click(screen.getByRole("button", { name: "Upload dokumenter" }));
    const file = new File(["fake-pdf"], "ny-police.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Dokumentfiler"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("Dokumenttitel"), { target: { value: "Ny forsikringspolice" } });
    fireEvent.change(screen.getByLabelText("Dokumentkategori"), { target: { value: "insurance" } });
    fireEvent.click(screen.getByLabelText(/SC-104 · Silence S04/));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect((await screen.findByRole("status")).textContent).toContain("gemt lokalt");
    fireEvent.click(screen.getByText("Ny forsikringspolice"));
    expect(await screen.findByRole("heading", { name: "Ny forsikringspolice" })).toBeTruthy();
    expect(screen.getByText("1 versioner")).toBeTruthy();
  });

  it("opretter ny version og arkiverer uden at slette historikken", async () => {
    const repository = createMemoryUnitRepository();
    const state = await repository.uploadDocuments({ files: [new File(["v1"], "manual.pdf", { type: "application/pdf" })], title: "Manual", category: "manual", relations: [{ type: "unit", targetId: "unit-sc-104" }] }, { id: "demo-lars" });
    const id = state.documents[0].id;
    window.history.replaceState({}, "", `/dokumenter/${id}`);
    render(<FleetV2App repository={repository} />);
    expect(await screen.findByRole("heading", { name: "Manual" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ny version" }));
    fireEvent.change(screen.getByLabelText("Dokumentfiler"), { target: { files: [new File(["v2"], "manual-v2.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Opret version" }));
    expect(await screen.findByText("2 versioner")).toBeTruthy();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Arkivér dokument" }));
    expect(await screen.findByText("Dokumentet er arkiveret")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gendan" }));
    await waitFor(() => expect(screen.queryByText("Dokumentet er arkiveret")).toBeNull());
  });

  it("viser forståelig tilstand for et ukendt dokument-ID", async () => {
    window.history.replaceState({}, "", "/dokumenter/ukendt-id");
    render(<FleetV2App repository={createMemoryUnitRepository()} />);
    expect(await screen.findByRole("heading", { name: "Dokumentet findes ikke" })).toBeTruthy();
  });
});
