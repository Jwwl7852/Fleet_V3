import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ state: null }),
}));

vi.mock("../../src/firebase.js", () => ({
  auth: null,
  miljoe: "test",
  projektId: "demo-login-test",
}));

vi.mock("../../src/fleet/ui.jsx", () => ({
  Knap: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

vi.mock("../../src/fleet/VeyroLogo.jsx", () => ({
  default: () => <img src="/originalt-veyro-logo.png" alt="Veyro Systems" />,
}));

vi.mock("../../src/fleet/login-billeder.js", () => ({
  LOGIN_BILLEDER: [{ id: "fleet", motiv: "FLEET", tekst: "Overblik over flåden.", src: "/fleet.jpg", fokus: "50% 50%" }],
  LOGIN_SENESTE_BILLEDE_NOGLE: "veyro:login:seneste-billede:v1",
  vaelgLoginBillede: ({ billeder }) => billeder[0],
}));

import LoginE from "../../src/moduler/LoginE.jsx";
import { INAKTIVITET_LOGOUT_BESKED_NOGLE } from "../../src/fleet/inaktivitet.js";

function visLogin() {
  return render(<LoginE />);
}

describe("Loginforslag E", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("bevarer et fuldt login ved billedfejl og viser den lokale fallbackflade", () => {
    const { container } = visLogin();
    expect(screen.getByRole("heading", { name: "Velkommen tilbage" })).toBeTruthy();
    expect(screen.getByText("Overblik over flåden.")).toBeTruthy();
    expect(screen.getByText("AI-genereret illustration")).toBeTruthy();

    fireEvent.error(container.querySelector(".fc-login-hero-billede"));

    expect(container.querySelector(".fc-login-hero").classList.contains("har-fejl")).toBe(true);
    expect(container.querySelector(".fc-login-hero-billede")).toBeNull();
    expect(screen.getByRole("button", { name: "Log ind" })).toBeTruthy();
  });

  it("understøtter vis/skjul og lokal validering uden at skifte motiv", () => {
    const { container } = visLogin();
    const kode = screen.getByLabelText("Adgangskode");
    expect(kode.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Vis adgangskode" }));
    expect(kode.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Glemt adgangskode?" }));
    expect(screen.getByRole("alert").textContent).toContain("Indtast din e-mailadresse først.");
    expect(container.querySelector(".fc-login-motiv-navn").textContent).toBe("FLEET");
  });

  it("viser en neutral timeoutbesked én gang uden kundeoplysninger", () => {
    window.sessionStorage.setItem(INAKTIVITET_LOGOUT_BESKED_NOGLE, "inaktivitet");
    visLogin();

    expect(screen.getByRole("status").textContent).toBe(
      "Du er blevet logget ud efter 45 minutters inaktivitet.",
    );
    expect(window.sessionStorage.getItem(INAKTIVITET_LOGOUT_BESKED_NOGLE)).toBeNull();
  });
});
