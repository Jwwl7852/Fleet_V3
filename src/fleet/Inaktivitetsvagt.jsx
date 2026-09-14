import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth, demoMode } from "../firebase.js";
import { Dialog, Knap } from "./ui.jsx";
import {
  aktivitetsNøgle,
  inaktivitetsScope,
  inaktivitetsstatus,
  INAKTIVITET_AKTIVITET_THROTTLE_MS,
  INAKTIVITET_LOGOUT_BESKED_NOGLE,
  nedtællingSekunder,
} from "./inaktivitet.js";

const KANAL = "veyro:session:aktivitet:v1";
const AKTIVITETSHÆNDELSER = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"];

/**
 * Klientens inaktivitetsvagt. Den afslutter den rigtige Firebase-session,
 * men erstatter ikke tokenrevocation, Rules, claims eller serverpermissions.
 */
export default function Inaktivitetsvagt({ bruger, children }) {
  const scope = useMemo(() => inaktivitetsScope(bruger), [bruger]);
  const nøgle = useMemo(() => aktivitetsNøgle(scope), [scope]);
  const [tilstand, setTilstand] = useState(() => ({ fase: "aktiv", resterendeMs: 0 }));
  const senesteRef = useRef(Date.now());
  const senesteRegistreringRef = useRef(0);
  const varselÅbentRef = useRef(false);
  const logoutIgangRef = useRef(false);
  const kanalRef = useRef(null);

  const udførLogout = useCallback(async (årsag = "inaktivitet", del = true) => {
    if (logoutIgangRef.current || !auth) return;
    logoutIgangRef.current = true;
    if (årsag === "inaktivitet") {
      window.sessionStorage.setItem(INAKTIVITET_LOGOUT_BESKED_NOGLE, "inaktivitet");
    }
    if (del) kanalRef.current?.postMessage({ art: "logout", scope, årsag });
    await auth.signOut();
  }, [scope]);

  const vurder = useCallback((nu = Date.now()) => {
    const næste = inaktivitetsstatus(senesteRef.current, nu);
    setTilstand(næste);
    varselÅbentRef.current = næste.fase === "varsel";
    if (næste.fase === "udløbet") udførLogout("inaktivitet");
  }, [udførLogout]);

  const registrer = useCallback((nu = Date.now(), del = true) => {
    if (!nøgle || varselÅbentRef.current) return;
    if (nu - senesteRegistreringRef.current < INAKTIVITET_AKTIVITET_THROTTLE_MS) return;
    senesteRegistreringRef.current = nu;
    senesteRef.current = nu;
    setTilstand({ fase: "aktiv", forløbetMs: 0, resterendeMs: 0 });
    window.localStorage.setItem(nøgle, String(nu));
    if (del) kanalRef.current?.postMessage({ art: "aktivitet", scope, tidspunkt: nu });
  }, [nøgle, scope]);

  const fortsæt = useCallback(() => {
    varselÅbentRef.current = false;
    senesteRegistreringRef.current = 0;
    registrer(Date.now(), true);
  }, [registrer]);

  useEffect(() => {
    if (demoMode || !auth || !scope || !nøgle) return undefined;
    logoutIgangRef.current = false;
    const gemt = Number(window.localStorage.getItem(nøgle));
    senesteRef.current = Number.isFinite(gemt) && gemt > 0 ? gemt : Date.now();
    if (!gemt) window.localStorage.setItem(nøgle, String(senesteRef.current));

    const kanal = typeof BroadcastChannel === "function" ? new BroadcastChannel(KANAL) : null;
    kanalRef.current = kanal;
    if (kanal) {
      kanal.onmessage = (event) => {
        const besked = event.data;
        if (!besked || besked.scope !== scope) return;
        if (besked.art === "aktivitet") {
          const tidspunkt = Number(besked.tidspunkt);
          if (Number.isFinite(tidspunkt) && tidspunkt > senesteRef.current) {
            senesteRef.current = tidspunkt;
            varselÅbentRef.current = false;
            vurder();
          }
        } else if (besked.art === "logout") {
          if (besked.årsag === "inaktivitet") {
            window.sessionStorage.setItem(INAKTIVITET_LOGOUT_BESKED_NOGLE, "inaktivitet");
          }
          udførLogout(besked.årsag, false);
        }
      };
    }

    const aktivitet = () => registrer(Date.now(), true);
    const lager = (event) => {
      if (event.key !== nøgle) return;
      const tidspunkt = Number(event.newValue);
      if (Number.isFinite(tidspunkt) && tidspunkt > senesteRef.current) {
        senesteRef.current = tidspunkt;
        varselÅbentRef.current = false;
        vurder();
      }
    };
    const genoptag = () => {
      if (document.visibilityState === "visible") vurder();
    };
    for (const navn of AKTIVITETSHÆNDELSER) {
      window.addEventListener(navn, aktivitet, { passive: true, capture: navn === "scroll" });
    }
    window.addEventListener("storage", lager);
    window.addEventListener("focus", genoptag);
    document.addEventListener("visibilitychange", genoptag);
    const interval = window.setInterval(() => vurder(), 1000);
    vurder();

    return () => {
      window.clearInterval(interval);
      for (const navn of AKTIVITETSHÆNDELSER) {
        window.removeEventListener(navn, aktivitet, { capture: navn === "scroll" });
      }
      window.removeEventListener("storage", lager);
      window.removeEventListener("focus", genoptag);
      document.removeEventListener("visibilitychange", genoptag);
      kanal?.close();
      kanalRef.current = null;
    };
  }, [nøgle, registrer, scope, udførLogout, vurder]);

  if (demoMode || !auth || !scope) return children;

  const sekunder = nedtællingSekunder(tilstand.resterendeMs);
  const minutter = Math.floor(sekunder / 60);
  const restSekunder = sekunder % 60;
  return (
    <>
      {children}
      {tilstand.fase === "varsel" && (
        <Dialog titel="Du bliver snart logget ud" onLuk={fortsæt}>
          <div className="fc-session-varsel">
            <p>Du har været inaktiv. Du bliver automatisk logget ud om 2 minutter.</p>
            <p className="fc-session-nedtælling" aria-live="polite" role="timer">
              {minutter}:{String(restSekunder).padStart(2, "0")}
            </p>
            <p className="fc-hint">Ikke-gemte ændringer kan gå tabt ved logout.</p>
            <div className="fc-formular-knapper">
              <Knap variant="primaer" onClick={fortsæt}>Fortsæt arbejdet</Knap>
              <Knap onClick={() => udførLogout("manuel")}>Log ud nu</Knap>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
