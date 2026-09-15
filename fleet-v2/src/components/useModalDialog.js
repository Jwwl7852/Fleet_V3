import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * FLEET-dialogernes fælles tastatur- og lukkeadfærd.
 *
 * Forretningsdialogen ejer fortsat sin gemmefunktion og fejltilstand. Hooken
 * samler kun de fire lukkeveje, fokusfælden og fokusretur, så ESC, X,
 * Annuller og baggrunden ikke kan drive fra hinanden.
 */
export function useModalDialog({
  onClose,
  dirty = false,
  busy = false,
  discardMessage = "Dine ugemte ændringer går tabt. Vil du lukke?",
}) {
  const dialogRef = useRef(null);
  const openerRef = useRef(typeof document === "undefined" ? null : document.activeElement);
  const stateRef = useRef({ onClose, dirty, busy, discardMessage });
  stateRef.current = { onClose, dirty, busy, discardMessage };

  const requestClose = useCallback(() => {
    const current = stateRef.current;
    if (current.busy) return false;
    if (current.dirty && !globalThis.confirm(current.discardMessage)) return false;
    current.onClose();
    return true;
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const initial = dialog.querySelector("[autofocus]") || dialog;
    initial.focus?.();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (event.target?.closest?.('select,[aria-expanded="true"],[role="menu"]')) return;
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll(FOCUSABLE)]
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openerRef.current?.focus?.();
    };
  }, [requestClose]);

  const onBackdropMouseDown = useCallback((event) => {
    if (event.target === event.currentTarget) requestClose();
  }, [requestClose]);

  return { dialogRef, requestClose, onBackdropMouseDown };
}

export function confirmBusinessSave(message = "Gem ændringerne?") {
  return globalThis.confirm(message);
}
