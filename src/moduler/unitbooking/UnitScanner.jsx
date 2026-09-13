import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { datoTid } from "../../fleet/format.js";
import { KASSE_ID_MOENSTER, KASSE_STATUS, pladsnavn } from "../../fleet/unitbooking.js";
import { skiftUdlaan } from "../../fleet/udlaan.js";
import { unitlagerhandling } from "../../fleet/unitlager.js";
import { qrBredde, qrFelter, QR_STILLE_ZONE } from "../../fleet/qrkode.js";
import { DEMO_KASSER, DEMO_KASSEUDLAAN } from "../../fleet/demo-unitbooking.js";
import { DEMO_REOLPLADSER } from "../../fleet/demo-lager.js";
import { Datatilstand, Henter, Knap, Kort, MiniLinje, Pille } from "../../fleet/ui.jsx";
import "./unitbooking.css";

const operationId = () => globalThis.crypto?.randomUUID?.() || `unit-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function unitIdFraQr(vaerdi) {
  const ra = String(vaerdi || "").trim();
  if (!ra) return "";
  let kandidat = ra.replace(/^VEYRO-UNIT:/i, "");
  try {
    const url = new URL(ra, window.location.origin);
    const m = url.pathname.match(/\/unitbooking\/scan\/([^/]+)\/?$/);
    if (m) kandidat = decodeURIComponent(m[1]);
  } catch { /* rå QR-nyttelast prøves nedenfor */ }
  return KASSE_ID_MOENSTER.test(kandidat) ? kandidat : "";
}

function Qr({ kode }) {
  const felter = qrFelter(kode) || [];
  const bredde = qrBredde(kode) || 33;
  return (
    <svg className="ub-unit-qr" viewBox={`0 0 ${bredde} ${bredde}`} aria-label={`QR-kode for ${kode}`}>
      <rect width={bredde} height={bredde} className="ub-qr-bund" />
      {felter.map(({ x, y }) => <rect key={`${x}-${y}`} x={QR_STILLE_ZONE + x} y={QR_STILLE_ZONE + y} width="1" height="1" className="ub-qr-felt" />)}
    </svg>
  );
}

function Scanner({ onScan }) {
  const videoRef = useRef(null);
  const sporRef = useRef([]);
  const frameRef = useRef(0);
  const [kode, saetKode] = useState("");
  const [kamera, saetKamera] = useState("lukket");
  const [fejl, saetFejl] = useState("");
  const stop = () => {
    cancelAnimationFrame(frameRef.current);
    sporRef.current.forEach((s) => s.stop()); sporRef.current = [];
    saetKamera("lukket");
  };
  useEffect(() => stop, []);
  const indsend = (vaerdi) => {
    const id = unitIdFraQr(vaerdi);
    if (!id) { saetFejl("Koden er ikke et gyldigt Veyro unit-id."); return; }
    saetFejl(""); onScan(id);
  };
  const start = async () => {
    saetFejl("");
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.BarcodeDetector) {
      saetKamera("ikke-understoettet");
      saetFejl("Kamera-QR er ikke understøttet i denne browser. Brug håndscanner eller manuel indtastning.");
      return;
    }
    try {
      const detector = new globalThis.BarcodeDetector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      sporRef.current = stream.getTracks(); videoRef.current.srcObject = stream;
      await videoRef.current.play(); saetKamera("aktiv");
      const laes = async () => {
        if (!sporRef.current.length) return;
        try {
          const fund = await detector.detect(videoRef.current);
          if (fund[0]?.rawValue) { stop(); indsend(fund[0].rawValue); return; }
        } catch { /* næste billede prøves */ }
        frameRef.current = requestAnimationFrame(laes);
      };
      frameRef.current = requestAnimationFrame(laes);
    } catch (e) {
      stop(); saetFejl(e?.name === "NotAllowedError" ? "Kameraadgang blev afvist. Brug håndscanner eller manuel kode." : "Kameraet kunne ikke startes.");
    }
  };
  return (
    <div className="ub-scanner">
      <div className={`ub-kamera ${kamera === "aktiv" ? "ub-kamera-aktiv" : ""}`}>
        <video ref={videoRef} playsInline muted aria-label="Kamerabillede til QR-scanning" />
        {kamera !== "aktiv" && <span aria-hidden="true">⌗</span>}
        {kamera === "aktiv" && <i aria-hidden="true" />}
      </div>
      <div className="ub-scanner-knapper">
        {kamera === "aktiv" ? <Knap onClick={stop}>Stop kamera</Knap> : <Knap variant="primaer" onClick={start}>Åbn kamera</Knap>}
      </div>
      <form className="ub-scan-manuel" onSubmit={(e) => { e.preventDefault(); indsend(kode); }}>
        <label htmlFor="ub-unit-kode">Unit-id eller QR-indhold</label>
        <input id="ub-unit-kode" autoFocus autoCapitalize="none" value={kode} onChange={(e) => saetKode(e.target.value)} placeholder="Fx MDT-101" />
        <Knap variant="primaer" onClick={() => indsend(kode)}>Slå op</Knap>
      </form>
      <p className="fc-hint">En håndscanner, der skriver som tastatur, virker i feltet og afslutter med Enter.</p>
      {fejl && <p className="ub-intet-match" role="alert">{fejl}</p>}
    </div>
  );
}

export default function UnitScanner() {
  const { unitId } = useParams();
  const { bruger } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.kasseudlaanSkriv);
  const [id, saetId] = useState(() => unitIdFraQr(unitId));
  const [pladsId, saetPladsId] = useState("");
  const [arbejder, saetArbejder] = useState(false);
  const [svar, saetSvar] = useState(null);
  const { data: kasser, henter, tilstand, genindlaes: genindlaesKasser } = useListe("kasser", { graense: 1000, demo: DEMO_KASSER });
  const { data: pladser } = useListe("reolpladser", { graense: 500, demo: DEMO_REOLPLADSER });
  const { data: udlaan, genindlaes: genindlaesUdlaan } = useListe("kasseudlaan", { graense: 2000, demo: DEMO_KASSEUDLAAN });
  const { data: bevaegelser, genindlaes: genindlaesBevaegelser } = useListe("unitbevaegelser", { graense: 1000, demo: [] });
  const unit = kasser.find((k) => k.id === id);
  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));
  const booking = udlaan.find((u) => u.kasseId === id && u.tilstand === "udlaant");
  const historik = useMemo(() => bevaegelser.filter((b) => b.unitId === id).sort((a, b) => b.tidspunktMs - a.tidspunktMs), [bevaegelser, id]);
  const art = booking ? "retur" : unit?.pladsId ? "flytning" : "modtagelse";
  const udfoer = async () => {
    if (!unit || !pladsId || !maaSkrive) return;
    saetArbejder(true); saetSvar(null);
    const r = booking
      ? await skiftUdlaan({ udlaanId: booking.id, til: "returneret", modtagelsesPladsId: pladsId, operationId: operationId() })
      : await unitlagerhandling({ operationId: operationId(), unitId: unit.id, art, tilPladsId: pladsId, kilde: "unitbooking" });
    saetArbejder(false); saetSvar(r);
    if (r.ok) {
      saetPladsId("");
      genindlaesKasser(); genindlaesUdlaan(); genindlaesBevaegelser();
    }
  };
  if (henter) return <Henter hvad="units" />;
  return (
    <div className="fc-grid ub-side">
      <div className="ub-sidehoved"><div><h1>Scan, modtag og flyt</h1><p>QR-koden identificerer enheden. Dine moduler, rettigheder og virksomhed afgør adgangen.</p></div></div>
      <Datatilstand tilstand={tilstand} genprov={genindlaesKasser} />
      <div className="ub-scan-layout">
        <Kort titel="Scan unit"><Scanner onScan={(nyId) => { saetId(nyId); saetPladsId(""); saetSvar(null); }} /></Kort>
        <Kort titel={id ? `Opslag · ${id}` : "Unitopslag"}>
          {!id ? <p className="fc-hint">Scan eller indtast et id for at se den fælles enhed.</p> : !unit ? (
            <div className="ub-intet-match" role="alert"><b>Ukendt QR-kode</b><span>Der oprettes ikke automatisk en ny enhed. Kontrollér koden eller gå til enhedsregisteret.</span></div>
          ) : (
            <>
              <div className="ub-unit-top"><Qr kode={unit.id} /><div><MiniLinje label="Unit-id" vaerdi={<b>{unit.id}</b>} /><MiniLinje label="Type" vaerdi={`${unit.type}${unit.undertype ? ` · ${unit.undertype}` : ""}`} /><MiniLinje label="Tilstand" vaerdi={<Pille tone={KASSE_STATUS[unit.status]?.pill || "info"}>{KASSE_STATUS[unit.status]?.label || unit.status}</Pille>} /><MiniLinje label="Aktuel placering" vaerdi={unit.pladsId ? pladsnavn(pladsMap[unit.pladsId]) : "Ude / ikke placeret"} /><MiniLinje label="Hjemplads (forslag)" vaerdi={pladsnavn(pladsMap[unit.hjemPladsId])} /></div></div>
              {booking && <div className="ub-advarsel ub-advarsel-info"><b>Aktivt udlån · sag {booking.sagsnummer}</b><span>Modtagelsen afslutter bookingen og registrerer den valgte faktiske placering atomisk.</span></div>}
              <div className="ub-scan-handling">
                <label htmlFor="ub-destination">{art === "flytning" ? "Ny placering" : "Modtagelseslokation"}</label>
                <select id="ub-destination" value={pladsId} onChange={(e) => saetPladsId(e.target.value)}><option value="">Vælg eller scan destination …</option>{pladser.filter((p) => p.id !== unit.pladsId).map((p) => <option key={p.id} value={p.id}>{pladsnavn(p)}</option>)}</select>
                <Knap variant="primaer" disabled={!pladsId || !maaSkrive || arbejder} onClick={udfoer}>{arbejder ? "Gemmer …" : art === "flytning" ? "Registrér flytning" : "Modtag på valgt lokation"}</Knap>
              </div>
              {svar && <p className={svar.ok ? "ub-succes" : "ub-intet-match"}>{svar.ok ? "Placering og bevægelseshistorik er opdateret." : svar.besked}</p>}
            </>
          )}
        </Kort>
      </div>
      {unit && <Kort titel="Fælles bevægelseshistorik">{historik.length ? <div className="ub-bevaegelser">{historik.map((b) => <div key={b.id}><b>{b.art}</b><span>{b.fraPladsId ? pladsnavn(pladsMap[b.fraPladsId]) : "Ude"} → {b.tilPladsId ? pladsnavn(pladsMap[b.tilPladsId]) : "Ude"}</span><span>{datoTid(b.tidspunktMs)}{b.reference ? ` · ${b.reference}` : ""}</span></div>)}</div> : <p className="fc-hint">Ingen registrerede bevægelser endnu.</p>}</Kort>}
    </div>
  );
}
