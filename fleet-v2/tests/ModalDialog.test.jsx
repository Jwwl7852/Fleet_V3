import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useModalDialog } from "../src/components/useModalDialog";

function Dialog({ dirty, busy, onClose }) {
  const { dialogRef, requestClose, onBackdropMouseDown } = useModalDialog({
    onClose, dirty, busy,
  });
  return <div data-testid="backdrop" onMouseDown={onBackdropMouseDown}><section ref={dialogRef} tabIndex={-1} role="dialog" aria-label="Prøvedialog"><button autoFocus type="button">Første</button><button type="button" onClick={requestClose}>Annuller</button></section></div>;
}

function Fixture({ dirty = false, busy = false }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)}>Åbner</button>{open ? <Dialog dirty={dirty} busy={busy} onClose={() => setOpen(false)} /> : null}</>;
}

describe("fælles dialogadfærd", () => {
  it("lukker med Escape og returnerer fokus til åbneren", () => {
    render(<Fixture />);
    const opener = screen.getByRole("button", { name: "Åbner" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("bruger samme kassér-bekræftelse for knap og baggrund", () => {
    window.confirm.mockReturnValue(false);
    render(<Fixture dirty />);
    fireEvent.click(screen.getByRole("button", { name: "Åbner" }));
    fireEvent.click(screen.getByRole("button", { name: "Annuller" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(window.confirm).toHaveBeenCalledTimes(1);
    window.confirm.mockReturnValue(true);
    fireEvent.mouseDown(screen.getByTestId("backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.confirm).toHaveBeenCalledTimes(2);
  });

  it("blokerer alle lukkeveje mens en gemning kører", () => {
    render(<Fixture busy />);
    fireEvent.click(screen.getByRole("button", { name: "Åbner" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(screen.getByTestId("backdrop"));
    fireEvent.click(screen.getByRole("button", { name: "Annuller" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
