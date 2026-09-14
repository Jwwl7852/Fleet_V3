import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signOut } = vi.hoisted(() => ({
  signOut: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../src/firebase.js", () => ({
  auth: { signOut },
  demoMode: false,
}));

vi.mock("../../src/fleet/ui.jsx", () => ({
  Dialog: ({ titel, onLuk, children }) => (
    <div role="dialog" aria-label={titel}>
      <button type="button" onClick={onLuk} aria-label="Luk">×</button>
      {children}
    </div>
  ),
  Knap: ({ children, onClick }) => <button type="button" onClick={onClick}>{children}</button>,
}));

import Inaktivitetsvagt from "../../src/fleet/Inaktivitetsvagt.jsx";
import {
  aktivitetsNøgle,
  inaktivitetsScope,
  INAKTIVITET_LOGOUT_BESKED_NOGLE,
  INAKTIVITET_TIMEOUT_MS,
  INAKTIVITET_VARSEL_MS,
} from "../../src/fleet/inaktivitet.js";

const bruger = {
  uid: "kunde-bruger-1",
  tenantId: "tenant-a",
  sessionAuthTime: "2026-09-14T08:00:00.000Z",
};

class TestBroadcastChannel {
  static instanser = [];

  constructor(navn) {
    this.navn = navn;
    this.onmessage = null;
    this.postMessage = vi.fn();
    this.close = vi.fn();
    TestBroadcastChannel.instanser.push(this);
  }
}

function gemSenesteAktivitet(forloebetMs) {
  const nøgle = aktivitetsNøgle(inaktivitetsScope(bruger));
  window.localStorage.setItem(nøgle, String(Date.now() - forloebetMs));
  return nøgle;
}

describe("Inaktivitetsvagt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T09:00:00.000Z"));
    window.localStorage.clear();
    window.sessionStorage.clear();
    signOut.mockClear();
    TestBroadcastChannel.instanser = [];
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
  });

  it("viser varsel efter 43 minutter og fortsætter kun ved en tydelig handling", () => {
    const nøgle = gemSenesteAktivitet(INAKTIVITET_VARSEL_MS);
    render(<Inaktivitetsvagt bruger={bruger}><main>Beskyttet indhold</main></Inaktivitetsvagt>);

    expect(screen.getByRole("dialog", { name: "Du bliver snart logget ud" })).toBeTruthy();
    expect(screen.getByText("Du har været inaktiv. Du bliver automatisk logget ud om 2 minutter.")).toBeTruthy();
    expect(screen.getByText("2:00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fortsæt arbejdet" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(Number(window.localStorage.getItem(nøgle))).toBe(Date.now());
    expect(signOut).not.toHaveBeenCalled();
  });

  it("afslutter den rigtige auth-session efter 45 minutters inaktivitet", () => {
    gemSenesteAktivitet(INAKTIVITET_TIMEOUT_MS);
    render(<Inaktivitetsvagt bruger={bruger}><main>Beskyttet indhold</main></Inaktivitetsvagt>);

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(INAKTIVITET_LOGOUT_BESKED_NOGLE)).toBe("inaktivitet");
    expect(TestBroadcastChannel.instanser[0].postMessage).toHaveBeenCalledWith({
      art: "logout",
      scope: inaktivitetsScope(bruger),
      årsag: "inaktivitet",
    });
  });

  it("deler aktivitet i samme sessionsscope og ignorerer en anden sikkerhedskontekst", () => {
    const nøgle = gemSenesteAktivitet(INAKTIVITET_VARSEL_MS);
    render(<Inaktivitetsvagt bruger={bruger}><main>Beskyttet indhold</main></Inaktivitetsvagt>);
    const kanal = TestBroadcastChannel.instanser[0];

    act(() => kanal.onmessage({
      data: { art: "aktivitet", scope: "anden-bruger|anden-tenant|anden-session", tidspunkt: Date.now() },
    }));
    expect(screen.getByRole("dialog", { name: "Du bliver snart logget ud" })).toBeTruthy();

    act(() => kanal.onmessage({
      data: { art: "aktivitet", scope: inaktivitetsScope(bruger), tidspunkt: Date.now() },
    }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(Number(window.localStorage.getItem(nøgle))).toBe(Date.now() - INAKTIVITET_VARSEL_MS);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("modtager logout fra en anden fane uden at sende beskeden rundt igen", () => {
    render(<Inaktivitetsvagt bruger={bruger}><main>Beskyttet indhold</main></Inaktivitetsvagt>);
    const kanal = TestBroadcastChannel.instanser[0];

    act(() => kanal.onmessage({
      data: { art: "logout", scope: inaktivitetsScope(bruger), årsag: "inaktivitet" },
    }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(kanal.postMessage).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(INAKTIVITET_LOGOUT_BESKED_NOGLE)).toBe("inaktivitet");
  });

  it("lader faktisk brugeraktivitet nulstille tiden, men ikke baggrundsrequests", () => {
    const nøgle = gemSenesteAktivitet(INAKTIVITET_VARSEL_MS - 1000);
    render(<Inaktivitetsvagt bruger={bruger}><main>Beskyttet indhold</main></Inaktivitetsvagt>);

    vi.setSystemTime(Date.now() + 10_000);
    fireEvent.pointerDown(window);
    expect(Number(window.localStorage.getItem(nøgle))).toBe(Date.now());

    const efterKlik = Number(window.localStorage.getItem(nøgle));
    window.dispatchEvent(new Event("veyro-baggrundsrequest"));
    expect(Number(window.localStorage.getItem(nøgle))).toBe(efterKlik);
  });
});
