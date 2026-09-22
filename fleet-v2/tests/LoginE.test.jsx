import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-router-dom", () => ({ useLocation: () => ({ state: null }) }));
vi.mock("../../src/firebase.js", () => ({
  auth: null,
  brugerLokaleEmulatorer: false,
  miljoe: "test",
  offentligLoginKontekstUrl: "https://login.example/kontekst",
  projektId: "demo-login-test",
}));
vi.mock("../../src/fleet/ui.jsx", () => ({ Knap: ({ children, ...props }) => <button {...props}>{children}</button> }));
vi.mock("../../src/fleet/VeyroLogo.jsx", () => ({ default: () => <img src="/originalt-veyro-logo.png" alt="Veyro Systems" /> }));
vi.mock("../../src/fleet/login-billeder.js", () => {
  const billeder = [
    { id: "fleet-1", modul: "fleet", motiv: "FLEET", tekst: "Overblik over flåden.", src: "/fleet.jpg", fokus: "50% 50%" },
    { id: "facility-1", modul: "facility", motiv: "FACILITY", tekst: "Teknik og installationer.", src: "/facility.jpg", fokus: "50% 50%" },
  ];
  return {
    loginBillederForModuler: (moduler) => billeder.filter((billede) => moduler.includes(billede.modul)),
    loginSenesteBilledeNøgle: (contextId) => `veyro:login:seneste-billede:v2:${contextId}`,
    vaelgLoginBillede: ({ billeder: tilladte }) => tilladte[0] || null,
  };
});

vi.mock("../../src/fleet/login-kundekonfiguration.js", () => ({
  hentOffentligLoginKontekst: vi.fn(),
  lokalSyntetiskLoginKontekst: () => null,
}));

import LoginE from "../../src/moduler/LoginE.jsx";
import { INAKTIVITET_LOGOUT_BESKED_NOGLE } from "../../src/fleet/inaktivitet.js";

const kendtFleet = () => Promise.resolve({ status: "kendt", contextId: "kunde_public", moduler: ["fleet"] });
const ukendt = () => Promise.resolve({ status: "ukendt", moduler: [] });

describe("Loginforslag E", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("starter neutralt og viser intet modulmotiv for en ukendt kunde", async () => {
    const { container } = render(<LoginE hentLoginKontekst={ukendt} />);
    expect(container.querySelector(".fc-login-hero-billede")).toBeNull();
    expect(container.querySelector(".fc-login-motiv")).toBeNull();
    expect(screen.getByAltText("Veyro Systems")).toBeTruthy();
    await waitFor(() => expect(container.querySelector(".fc-login-hero-billede")).toBeNull());
  });

  it("bevarer et fuldt login ved billedfejl og går tilbage til neutral flade", async () => {
    const { container } = render(<LoginE hentLoginKontekst={kendtFleet} />);
    await screen.findByText("Overblik over flåden.");
    fireEvent.error(container.querySelector(".fc-login-hero-billede"));
    expect(container.querySelector(".fc-login-hero").classList.contains("har-fejl")).toBe(true);
    expect(container.querySelector(".fc-login-hero-billede")).toBeNull();
    expect(container.querySelector(".fc-login-motiv")).toBeNull();
    expect(screen.getByRole("button", { name: "Log ind" })).toBeTruthy();
  });

  it("understøtter vis/skjul uden at skifte det validerede motiv", async () => {
    const { container } = render(<LoginE hentLoginKontekst={kendtFleet} />);
    await screen.findByText("Overblik over flåden.");
    const kode = screen.getByLabelText("Adgangskode");
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "bruger@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Vis adgangskode" }));
    expect(kode.type).toBe("text");
    expect(container.querySelector(".fc-login-motiv-navn").textContent).toBe("FLEET");
    expect(container.querySelectorAll(".fc-login-hero-billede")).toHaveLength(1);
  });

  it("viser en neutral timeoutbesked én gang uden kundeoplysninger", async () => {
    window.sessionStorage.setItem(INAKTIVITET_LOGOUT_BESKED_NOGLE, "inaktivitet");
    render(<LoginE hentLoginKontekst={ukendt} />);
    expect(screen.getByRole("status").textContent).toBe("Du er blevet logget ud efter 45 minutters inaktivitet.");
    expect(window.sessionStorage.getItem(INAKTIVITET_LOGOUT_BESKED_NOGLE)).toBeNull();
  });
});
