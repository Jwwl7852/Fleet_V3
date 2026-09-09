import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createMemoryUnitRepository } from "../src/data/unitRepository";

function start(path, repository = createMemoryUnitRepository()) {
  window.history.replaceState({}, "", path);
  render(<FleetV2App repository={repository} imageProcessor={async (file) => ({ blob: file, type: file.type, name: file.name })} />);
  return repository;
}

describe("udvidet skadesindberetning og sagsmappe", () => {
  beforeEach(() => window.localStorage.clear());

  it("viser betingede skadesfelter og gemmer en kladde med stabil reference", async () => {
    const repository = start("/indberetninger/ny");
    fireEvent.click(await screen.findByRole("button", { name: /SC-104/ }));
    fireEvent.click(screen.getByRole("button", { name: /Fortsæt/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Skade/ }));
    expect(screen.getByRole("heading", { name: "Hændelsesoplysninger" })).toBeTruthy();
    const counterparty = screen.getByRole("group", { name: "Modpart involveret?" });
    fireEvent.click(within(counterparty).getByLabelText("Ja"));
    expect(screen.getByText("Modparts navn/kontakt")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gem kladde" }));
    await waitFor(() => expect(repository.inspect().relations.reportDrafts).toHaveLength(1));
    const draft = repository.inspect().relations.reportDrafts[0];
    expect(draft.reference).toMatch(/^VYR-/);
    fireEvent.click(screen.getByRole("button", { name: "Gem kladde" }));
    await waitFor(() => expect(repository.inspect().relations.reportDrafts).toHaveLength(1));
    expect(repository.inspect().relations.reportDrafts[0].reference).toBe(draft.reference);
  });

  it("viser de syv sagsfaner og blokerer normal lukning uden kontrolleret fakturagrundlag", async () => {
    start("/sager/case-demo-001");
    expect(await screen.findByRole("heading", { name: "VYR-2025-00001" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bestilling og mails" })).toBeTruthy();
    fireEvent.click(screen.getByText("Jeg bekræfter, at sagen kan lukkes"));
    fireEvent.click(screen.getByRole("button", { name: "Luk sag" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/Alle forventede fakturaer/);
  });

  it("lukker uden faktura med begrundelse og kan genåbne eksplicit", async () => {
    const repository = start("/sager/case-demo-001");
    await screen.findByRole("heading", { name: "VYR-2025-00001" });
    fireEvent.click(screen.getByText("Luk uden faktura"));
    fireEvent.change(screen.getByLabelText("Begrundelse for lukning uden faktura"), { target: { value: "Intern udbedring uden ekstern faktura" } });
    fireEvent.click(screen.getByText("Jeg bekræfter, at sagen kan lukkes"));
    fireEvent.click(screen.getByRole("button", { name: "Luk sag" }));
    await waitFor(() => expect(repository.inspect().relations.cases[0].closureStatus).toBe("closed"));
    fireEvent.change(screen.getByText("Begrundelse for genåbning").closest("label").querySelector("textarea"), { target: { value: "Ny dokumentation" } });
    fireEvent.click(screen.getByRole("button", { name: "Genåbn sag" }));
    await waitFor(() => expect(repository.inspect().relations.cases[0].closureStatus).toBe("open"));
  });

  it("gemmer værkstedsvalg uden mail med krav om bemærkning og uden at sende", async () => {
    const repository = start("/sager/case-demo-001/bestilling");
    expect(await screen.findByRole("heading", { name: "Tildel værksted og klargør mail" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gem uden mail" }));
    expect(await screen.findByText(/kræver en kort bemærkning/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Bemærkning uden mail"), { target: { value: "Aftalt telefonisk" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem uden mail" }));
    await waitFor(() => expect(repository.inspect().relations.workshopOrders).toHaveLength(1));
    expect(repository.inspect().relations.workshopOrders[0]).toMatchObject({ deliveryState: "draft", sentAt: null, communicationMode: "no_mail" });
  });
});
