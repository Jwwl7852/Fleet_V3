import { useEffect, useMemo, useRef, useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { harModul } from "../../fleet/moduler.js";
import { datoTid } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formularsvar,
  Henter, Datatilstand, Tom, MiniLinje,
} from "../../fleet/ui.jsx";
import { pladsnavn, KASSE_STATUS } from "../../fleet/unitbooking.js";
import { qrBredde, qrFelter, QR_STILLE_ZONE } from "../../fleet/qrkode.js";
import {
  bindendeBookingerForUnit, kanSelvstaendigUdlevere, senesteUnitBevaegelser,
  slaaUnitOp, UNIT_BEVAEGELSE_ART, valideUnitBevaegelse,
} from "../../fleet/warehouse-unit.js";
import { nyUnitOperationId, opretWarehouseUnit, skrivUnitLagerhandling } from "../../fleet/unitlager.js";
import { DEMO_KASSER, DEMO_KASSETYPER, DEMO_KASSEUDLAAN } from "../../fleet/demo-unitbooking.js";
import { DEMO_REOLPLADSER } from "../../fleet/demo-lager.js";

function UnitQr({ id }) {
  const felter = qrFelter(id);
  const bredde = qrBredde(id);
  if (!felter || !bredde) return <p className="fc-svar fc-svar-fejl">Koden er for lang til QR-mærkatet.</p>;
  return (
    <svg className="warehouse-unit-qr" viewBox={`0 0 ${bredde} ${bredde}`}
         role="img" aria-label={`QR-kode ${id}`} shapeRendering="crispEdges">
      <rect width={bredde} height={bredde} fill="var(--fc-stregkode-bund)" />
      {felter.map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={QR_STILLE_ZONE + x} y={QR_STILLE_ZONE + y} width="1" height="1" fill="var(--fc-stregkode)" />
      ))}
    </svg>
  );
}

function KameraScanner({ aktiv, onKode, onStop }) {
  const videoRef = useRef(null);
  const [fejl, saetFejl] = useState("");

  useEffect(() => {
    if (!aktiv) return undefined;
    let stream;
    let frame;
    let stoppet = false;

    const start = async () => {
      if (!("BarcodeDetector" in globalThis) || !navigator.mediaDevices?.getUserMedia) {
        saetFejl("Kamerascanning understøttes ikke i denne browser. Brug scannerfeltet eller manuel indtastning.");
        return;
      }
      try {
        const detector = new globalThis.BarcodeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!videoRef.current || stoppet) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const laes = async () => {
          if (stoppet || !videoRef.current) return;
          try {
            const fund = await detector.detect(videoRef.current);
            if (fund[0]?.rawValue) {
              onKode(fund[0].rawValue);
              onStop();
              return;
            }
          } catch {
            // Et enkelt ulæseligt videobillede er normalt; næste frame prøves.
          }
          frame = requestAnimationFrame(laes);
        };
        frame = requestAnimationFrame(laes);
      } catch {
        saetFejl("Kameraet kunne ikke åbnes. Tillad kameraadgang, eller brug scannerfeltet.");
      }
    };
    start();
    return () => {
      stoppet = true;
      if (frame) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [aktiv, onKode, onStop]);

  if (!aktiv) return null;
  return (
    <div className="warehouse-camera">
      <video ref={videoRef} muted playsInline aria-label="Kameravisning til QR-scanning" />
      {fejl && <p className="fc-svar fc-svar-fejl" role="alert">{fejl}</p>}
      <Knap onClick={onStop}>Luk kamera</Knap>
    </div>
  );
}

export default function WarehouseUnits() {
  const { bruger, moduler } = useFleet();
  const maaFlytte = harPerm(bruger?.perms, PERM.bevaegelserSkriv);
  const [kode, saetKode] = useState("");
  const [resultat, saetResultat] = useState(null);
  const [kamera, saetKamera] = useState(false);
  const [art, saetArt] = useState("flytning");
  const [tilPladsId, saetTilPladsId] = useState("");
  const [reference, saetReference] = useState("");
  const [operationId, saetOperationId] = useState(() => nyUnitOperationId());
  const [arbejder, saetArbejder] = useState(false);
  const [svar, saetSvar] = useState(null);
  const [visOpret, saetVisOpret] = useState(false);
  const [nytId, saetNytId] = useState("");
  const [typevalg, saetTypevalg] = useState("");
  const [nyTypeId, saetNyTypeId] = useState("");
  const [nyTypeNavn, saetNyTypeNavn] = useState("");
  const [hjemPladsId, saetHjemPladsId] = useState("");
  const [modtagelsesPladsId, saetModtagelsesPladsId] = useState("");
  const [opretReference, saetOpretReference] = useState("");
  const [opretNote, saetOpretNote] = useState("");
  const [opretOperationId, saetOpretOperationId] = useState(() => nyUnitOperationId());
  const [opretter, saetOpretter] = useState(false);
  const [opretSvar, saetOpretSvar] = useState(null);

  const { data: units, henter, tilstand, genindlaes } = useListe("kasser", {
    graense: 3000, demo: DEMO_KASSER,
    sorter: (a, b) => (a.id || "").localeCompare(b.id || "", "da"),
  });
  const { data: pladser } = useListe("reolpladser", { graense: 3000, demo: DEMO_REOLPLADSER });
  const { data: typer } = useListe("kassetyper", { graense: 1000, demo: DEMO_KASSETYPER });
  const { data: bookinger } = useListe("kasseudlaan", {
    graense: 3000, demo: DEMO_KASSEUDLAAN, hent: harModul(moduler, "unitbooking"),
  });
  const { data: bevaegelser, genindlaes: genBevaegelser } = useListe("unitbevaegelser", {
    graense: 5000, demo: [], sorter: (a, b) => (b.tidspunktMs || 0) - (a.tidspunktMs || 0),
  });

  const unit = resultat?.ok ? units.find((u) => u.id === resultat.unit.id) || resultat.unit : null;
  const pladsMap = useMemo(() => Object.fromEntries(pladser.map((p) => [p.id, p])), [pladser]);
  const historik = unit ? senesteUnitBevaegelser(bevaegelser, unit.id) : [];
  const aktiveBookinger = unit ? bindendeBookingerForUnit(bookinger, unit.id) : [];
  const udlevering = unit ? kanSelvstaendigUdlevere(unit, bookinger) : { ok: false };
  const aktivBooking = aktiveBookinger.find((b) => b.tilstand === "udlaant") || null;

  useEffect(() => {
    if (!unit) return;
    if (!unit.pladsId) saetArt(aktivBooking ? "retur" : "modtagelse");
    else saetArt("flytning");
    saetTilPladsId("");
    saetReference("");
    saetSvar(null);
    saetOperationId(nyUnitOperationId());
  }, [unit?.id, unit?.pladsId, aktivBooking?.id]);

  if (henter) return <Henter hvad="unitregisteret" />;

  const opslag = (vaerdi = kode) => {
    const fund = slaaUnitOp(units, vaerdi);
    saetKode(vaerdi.trim());
    saetResultat(fund);
    saetSvar(null);
  };

  const valgtTypeId = typevalg === "__ny__" ? nyTypeId.trim() : typevalg;
  const kanOprette = maaFlytte && nytId.trim() && valgtTypeId
    && hjemPladsId && modtagelsesPladsId
    && (typevalg !== "__ny__" || nyTypeNavn.trim());

  const opretNu = async () => {
    if (!kanOprette) return;
    saetOpretter(true);
    const r = await opretWarehouseUnit({
      unitId: nytId.trim(), typeId: valgtTypeId,
      typeNavn: typevalg === "__ny__" ? nyTypeNavn : null,
      hjemPladsId, modtagelsesPladsId,
      reference: opretReference, note: opretNote,
      operationId: opretOperationId,
    });
    saetOpretter(false);
    saetOpretSvar(r);
    if (r.ok) {
      await Promise.all([genindlaes(), genBevaegelser()]);
      saetKode(nytId.trim());
      saetResultat({ ok: true, art: "fundet", unit: r.data?.unit || {
        id: nytId.trim(), type: valgtTypeId, status: "ledig", pladsId: modtagelsesPladsId, hjemPladsId,
      } });
      saetVisOpret(false);
      saetOpretOperationId(nyUnitOperationId());
    }
  };

  const fejl = unit ? valideUnitBevaegelse({
    unitId: unit.id,
    art,
    fraPladsId: unit.pladsId || null,
    tilPladsId: art === "udlevering" ? null : tilPladsId,
    bookingId: art === "retur" ? aktivBooking?.id || null : null,
    reference: reference || null,
    operationId,
  }, { units: units.map((u) => u.id), pladser: pladser.map((p) => p.id) }) : {};
  const reservationSpaerrer = art === "udlevering" && !udlevering.ok;
  const kanGemme = unit && maaFlytte && !reservationSpaerrer && Object.keys(fejl).length === 0;

  const udfoer = async () => {
    if (!kanGemme) return;
    saetArbejder(true);
    const r = await skrivUnitLagerhandling({
      unitId: unit.id,
      art,
      tilPladsId: art === "udlevering" ? null : tilPladsId,
      bookingId: art === "retur" ? aktivBooking?.id : null,
      reference,
      operationId,
    });
    saetArbejder(false);
    saetSvar(r);
    if (r.ok) {
      await Promise.all([genindlaes(), genBevaegelser()]);
      saetOperationId(nyUnitOperationId());
      opslag(unit.id);
    }
  };

  return (
    <div className="fc-grid warehouse-workspace">
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />
      <Kort titel="Scan eller indtast unit">
        <form className="warehouse-scan-row" onSubmit={(e) => { e.preventDefault(); opslag(); }}>
          <div className="fc-felt warehouse-scan-input">
            <label htmlFor="unit-scan">QR-kode / unit-id</label>
            <input id="unit-scan" autoFocus autoComplete="off" value={kode}
                   placeholder="Fx MDT-101" onChange={(e) => saetKode(e.target.value)} />
            <span className="fc-hint">Håndscanner virker som tastatur: scan og tryk Enter.</span>
          </div>
          <Knap type="submit" variant="primaer">Slå op</Knap>
          <Knap type="button" onClick={() => saetKamera(true)}>Brug kamera</Knap>
          <Knap type="button" onClick={() => { saetVisOpret((v) => !v); saetOpretSvar(null); }}>
            {visOpret ? "Luk oprettelse" : "Opret unit"}
          </Knap>
        </form>
        <KameraScanner aktiv={kamera} onKode={opslag} onStop={() => saetKamera(false)} />
        {resultat && !resultat.ok && (
          <p className="fc-svar fc-svar-fejl" role="alert">{resultat.besked}</p>
        )}
      </Kort>

      {visOpret && (
        <Kort titel="Opret og modtag unit">
          <p className="fc-hint">
            Unitten får sit stabile id og registreres på den faktiske modtagelsesplads i samme serverhandling.
          </p>
          <Feltraekke>
            <Felt id="ny-unit-id" label="Unit-id / QR-kode" kraevet vaerdi={nytId} saet={saetNytId}
                  hint="2–30 tegn: bogstaver, tal og bindestreg. Kan ikke ændres senere." />
            <Felt id="ny-unit-typevalg" label="Unittype" kraevet vaerdi={typevalg} saet={saetTypevalg}
                  valgmuligheder={[{ vaerdi: "", label: "— vælg type —" },
                    ...typer.map((t) => ({ vaerdi: t.id, label: t.navn || t.id })),
                    { vaerdi: "__ny__", label: "Opret ny type" }]} />
            {typevalg === "__ny__" && (
              <>
                <Felt id="ny-unit-type-id" label="Nyt type-id" kraevet vaerdi={nyTypeId} saet={saetNyTypeId}
                      hint="Fx udstyr eller plastkasse." />
                <Felt id="ny-unit-type-navn" label="Typenavn" kraevet vaerdi={nyTypeNavn} saet={saetNyTypeNavn} />
              </>
            )}
          </Feltraekke>
          <Feltraekke>
            <Felt id="ny-unit-modtagelse" label="Faktisk modtagelsesplads" kraevet
                  vaerdi={modtagelsesPladsId} saet={saetModtagelsesPladsId}
                  valgmuligheder={[{ vaerdi: "", label: "— vælg lokation —" },
                    ...pladser.map((p) => ({ vaerdi: p.id, label: pladsnavn(p) }))]} />
            <Felt id="ny-unit-hjem" label="Foreslået hjemplads" kraevet
                  vaerdi={hjemPladsId} saet={saetHjemPladsId}
                  valgmuligheder={[{ vaerdi: "", label: "— vælg lokation —" },
                    ...pladser.map((p) => ({ vaerdi: p.id, label: pladsnavn(p) }))]}
                  hint="Forslag til senere placering; ændrer aldrig fysisk placering automatisk." />
          </Feltraekke>
          <Feltraekke>
            <Felt id="ny-unit-reference" label="Modtagelsesreference" vaerdi={opretReference} saet={saetOpretReference} />
            <Felt id="ny-unit-note" label="Note" vaerdi={opretNote} saet={saetOpretNote} />
          </Feltraekke>
          <Formularsvar svar={opretSvar} okTekst="Unitten er oprettet og fysisk modtaget én gang." />
          {!maaFlytte && <p className="fc-svar fc-svar-naegtet">Du mangler retten til lagerbevægelser.</p>}
          <div className="warehouse-card-action">
            <Knap variant="primaer" disabled={!kanOprette || opretter} onClick={opretNu}>
              {opretter ? "Opretter …" : "Opret og modtag"}
            </Knap>
            <Knap onClick={() => saetVisOpret(false)}>Annullér</Knap>
          </div>
        </Kort>
      )}

      {unit ? (
        <div className="warehouse-unit-layout">
          <Kort titel={`Unit ${unit.id}`}>
            <div className="warehouse-unit-summary">
              <UnitQr id={unit.id} />
              <div>
                <MiniLinje label="Identitet" vaerdi={unit.id} />
                <MiniLinje label="Type" vaerdi={unit.type || "Ikke angivet"} />
                <MiniLinje label="Status" vaerdi={KASSE_STATUS[unit.status]?.label || unit.status} />
                <MiniLinje label="Aktuel placering" vaerdi={unit.pladsId ? pladsnavn(pladsMap[unit.pladsId]) : "Ude / ikke placeret"} />
                <MiniLinje label="Hjemplads" vaerdi={unit.hjemPladsId ? pladsnavn(pladsMap[unit.hjemPladsId]) : "Ikke angivet"} />
                <MiniLinje label="Aktiv reservation" vaerdi={aktiveBookinger.length ? aktiveBookinger.map((b) => b.nr || b.id).join(", ") : "Ingen"} />
              </div>
            </div>
            <div className="warehouse-card-action">
              <Knap onClick={() => window.print()}>Udskriv unitlabel</Knap>
              <Knap onClick={() => { saetVisOpret(true); setTimeout(() => document.getElementById("ny-unit-id")?.focus(), 0); }}>
                Opret endnu en unit
              </Knap>
            </div>
          </Kort>

          <Kort titel="Registrér fysisk handling">
            <div className="warehouse-action-choices" role="radiogroup" aria-label="Lagerhandling">
              {Object.entries(UNIT_BEVAEGELSE_ART).map(([id, meta]) => (
                <button key={id} type="button" className={`warehouse-action-choice${art === id ? " is-active" : ""}`}
                        onClick={() => { saetArt(id); saetSvar(null); }}>
                  {meta.label}
                </button>
              ))}
            </div>

            {art === "udlevering" ? (
              reservationSpaerrer && <p className="fc-svar fc-svar-naegtet" role="alert">{udlevering.besked}</p>
            ) : (
              <Feltraekke>
                <Felt id="unit-destination" label={art === "retur" ? "Modtagelsesplads" : "Ny lokation"}
                      kraevet vaerdi={tilPladsId} saet={saetTilPladsId}
                      fejl={tilPladsId ? fejl.tilPladsId : null}
                      valgmuligheder={[{ vaerdi: "", label: "— vælg eller scan lokation —" },
                        ...pladser.map((p) => ({ vaerdi: p.id, label: pladsnavn(p) }))]}
                      hint={art === "retur" ? "Returen registreres dér, hvor unitten faktisk sættes af." : undefined} />
              </Feltraekke>
            )}
            <Felt id="unit-reference" label="Reference" vaerdi={reference} saet={saetReference}
                  fejl={fejl.reference} hint="Fx følgeseddel, sag eller udleveringsreference." />
            {!maaFlytte && <p className="fc-svar fc-svar-naegtet">Du mangler retten til at registrere lagerbevægelser.</p>}
            <Formularsvar svar={svar} okTekst="Den fysiske handling er registreret én gang." />
            <div className="warehouse-card-action">
              <Knap variant="primaer" disabled={!kanGemme || arbejder} onClick={udfoer}>
                {arbejder ? "Registrerer …" : UNIT_BEVAEGELSE_ART[art]?.label || "Registrér"}
              </Knap>
            </div>
          </Kort>
        </div>
      ) : (
        <Tom handling={<Knap variant="primaer" onClick={() => document.getElementById("unit-scan")?.focus()}>Klar til scanning</Knap>}>
          Scan en kendt unit for at se placering, reservation og handlinger. Ukendte koder opretter aldrig en unit automatisk.
        </Tom>
      )}

      {unit && (
        <Kort titel="Fysisk historik">
          <Tabel
            kolonner={[
              { key: "tid", label: "Tidspunkt", render: (b) => datoTid(b.tidspunktMs) },
              { key: "art", label: "Handling", render: (b) => <Pille tone="info">{UNIT_BEVAEGELSE_ART[b.art]?.label || b.art}</Pille> },
              { key: "fra", label: "Fra", render: (b) => b.fraPladsId ? pladsnavn(pladsMap[b.fraPladsId]) : "—" },
              { key: "til", label: "Til", render: (b) => b.tilPladsId ? pladsnavn(pladsMap[b.tilPladsId]) : "—" },
              { key: "ref", label: "Reference", render: (b) => b.bookingId || b.reference || "—" },
            ]}
            raekker={historik}
            tom="Ingen fysiske bevægelser er registreret i den fælles historik endnu. Historiske UNIT-bookinger bevares separat."
          />
        </Kort>
      )}
    </div>
  );
}
