/* src/moduler/booking/Forslag.jsx
 * Booking – forslag & reservation
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  DEN HER SKÆRM ER BESLUTNING 5 GJORT SYNLIG.
 *
 *  Disponenten laver forslagene. Disponenten må IKKE godkende dem. Det står
 *  ikke som en kommentar nogen steder — det står som et felt der MANGLER i
 *  en liste: `disponent`-presettet i permissions.js har ikke
 *  PERM.bookingGodkend.
 *
 *  Skift rolle i sidebarens demo-vælger og se knappen ændre sig. Det er hele
 *  adgangsmodellen på ét skærmbillede: knapperne er ikke hardkodede, de er
 *  genereret af tilstandsmaskinen filtreret på dine permissions.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ⚠ DER ER TO SLAGS NEJ, OG DE SKAL VISES HVER FOR SIG.
 *
 *   1. "Du mangler adgangen booking.godkend…"   — en permissionfejl
 *   2. "Vælg et forslag før godkendelse."       — en FORUDSÆTNING
 *
 * Vises kun den første, læses enhver manglende handling som et
 * rettighedsproblem — og så beder en koordinator om adgang hun allerede har,
 * i stedet for at vælge et forslag. kanSkifte() svarer på begge, og skærmen
 * viser det svar den får.
 *
 * FASE 0: VISNING. Godkendelsen skrives ikke. Den skal ske ATOMISK sammen med
 * reservationen i en Cloud Function — to klientkald kan lykkes halvt, og så
 * står der en godkendt booking uden en reservation.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, dato, datoTid } from "../../fleet/format.js";
import {
  Kort, Tom, Tabel, Pille, Fejl, Knap, Gitter, MiniLinje,
} from "../../fleet/ui.jsx";
import {
  TILSTAND, kanSkifte, byggSkifte, tilgaengeligeHandlinger,
} from "../../fleet/booking-state.js";
import { PERM } from "../../fleet/permissions.js";
import { DEMO_BOOKINGER, TRANSPORTTYPE, demoBooking } from "../../fleet/demo-bookinger.js";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_PERSONALE } from "../../fleet/demo-personale.js";

const kunde = (id) => DEMO_KUNDER.find((k) => k.id === id);
const bil = (id) => DEMO_KOERETOEJER.find((b) => b.id === id);
const person = (id) => DEMO_PERSONALE.find((p) => p.id === id);

export default function Forslag() {
  const { id } = useParams();
  const { bruger } = useFleet();
  /* Uden et id i ruten falder vi tilbage på den booking der faktisk afventer
     koordinator — ellers ville skærmen være tom for den der klikker rundt. */
  const booking = demoBooking(id)
    || DEMO_BOOKINGER.find((b) => b.tilstand === "afventerKoord" && b.forslag?.length)
    || null;

  const [valgtForslagId, setValgtForslagId] = useState(booking?.valgtForslagId || null);
  const [begrundelse, setBegrundelse] = useState("");

  if (!booking) {
    return (
      <div className="fc-grid" style={{ gap: 16 }}>
        <Kort titel="Booking – forslag & reservation">
          <Tom>
            Ingen booking valgt.{" "}
            <Link className="fc-a" to="/booking">Gå til bookingoversigten</Link>.
          </Tom>
        </Kort>
      </div>
    );
  }

  const perms = bruger?.perms;
  const k = kunde(booking.kundeId);

  /* Bookingen som kanSkifte() ser den — med det forslag brugeren har valgt
     lige nu, ikke det der ligger gemt. Ellers ville svaret ikke svare til
     det man ser på skærmen. */
  const somValgt = { ...booking, valgtForslagId };

  const muligheder = tilgaengeligeHandlinger(booking.tilstand, perms);
  const godkendSvar = kanSkifte(somValgt, "reserveret", perms, { begrundelse });

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort
        titel={`${booking.nummer} · ${booking.fraSted} → ${booking.tilSted}`}
        handling={<Pille tone={TILSTAND[booking.tilstand]?.pill}>
          {TILSTAND[booking.tilstand]?.label}
        </Pille>}
      >
        <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
          <div>
            <MiniLinje label="Kunde" vaerdi={k?.navn || booking.kundeId} />
            <MiniLinje label="Transporttype" vaerdi={TRANSPORTTYPE[booking.transporttype]} />
            <MiniLinje label="Ønsket afhentning" vaerdi={datoTid(booking.onsketAfhentningMs)} />
            <MiniLinje label="Ønsket levering" vaerdi={datoTid(booking.onsketLeveringMs)} />
          </div>
          <div>
            <MiniLinje label="Omsætning" vaerdi={kr(booking.omsaetningOere)} />
            <MiniLinje label="Krav" vaerdi={booking.krav?.length ? booking.krav.join(", ") : "—"} />
            <MiniLinje label="Kundekrav" vaerdi={booking.kundekrav || "—"} />
            <MiniLinje label="Oprettet af" vaerdi={`${booking.oprettetAf} · ${dato(booking.oprettetMs)}`} />
          </div>
        </Gitter>
      </Kort>

      <Kort titel={`Forslag (${booking.forslag?.length || 0})`}>
        <Tabel
          kolonner={[
            { key: "vaelg", label: "", render: (f) => (
                <input type="radio" name="forslag" checked={valgtForslagId === f.id}
                       onChange={() => setValgtForslagId(f.id)}
                       aria-label={`Vælg forslag ${f.nr}`} />) },
            { key: "nr", label: "#", render: (f) => <b>{f.nr}</b> },
            { key: "koeretoejId", label: "Køretøj", render: (f) => {
                const b = bil(f.koeretoejId);
                return <>{b?.kaldenavn} <span className="fc-neutral">· {b?.navn}</span></>;
              } },
            { key: "personId", label: "Chauffør", render: (f) => person(f.personId)?.navn || f.personId },
            { key: "afhentningMs", label: "Planlagt afhentning", render: (f) => datoTid(f.afhentningMs) },
            { key: "leveringMs", label: "Levering", render: (f) => datoTid(f.leveringMs) },
            { key: "transitTimer", label: "Transit", num: true, render: (f) => `${num(f.transitTimer)} t` },
            { key: "estimatOere", label: "Estimat", num: true, render: (f) => kr(f.estimatOere) },
            { key: "note", label: "Note" },
          ]}
          raekker={booking.forslag || []}
          tom="Ingen forslag på denne booking."
        />
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Mockuppen viste 1–3 forslag. Det valgte forslag er det der bliver til en
          reservation ved godkendelse — derfor kræver overgangen til{" "}
          <b>{TILSTAND.reserveret.label}</b> at et er valgt.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
        <Godkendelse
          svar={godkendSvar} muligheder={muligheder}
          rolle={bruger?.rolle} perms={perms}
          valgtForslagId={valgtForslagId}
        />
        <Skrivningen
          booking={somValgt} svar={godkendSvar}
          bruger={bruger} begrundelse={begrundelse} setBegrundelse={setBegrundelse}
        />
      </Gitter>
    </div>
  );
}

/* ---- Beslutning 5, synlig ---------------------------------------------- */

function Godkendelse({ svar, muligheder, rolle, perms, valgtForslagId }) {
  /* De to slags nej skilles ad. Den ene handler om HVEM du er, den anden om
     hvad der mangler på skærmen. */
  const manglerPerm = !muligheder.some((m) => m.kraeverPerm === PERM.bookingGodkend);
  const manglerValg = !valgtForslagId;

  return (
    <Kort titel={`Godkendelse — rolle: ${rolle || "ukendt"}`}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {muligheder.length === 0 ? (
          <span className="fc-hint">Din rolle har ingen handlinger på denne tilstand.</span>
        ) : muligheder.map((m) => (
          <Knap key={m.til}
                variant={m.til === "reserveret" ? "primaer" : "sekundaer"}
                disabled
                title={`Kræver ${m.kraeverPerm}. Skrivning er ikke bygget (fase 0).`}>
            {m.handling}
          </Knap>
        ))}
      </div>

      <MiniLinje
        label="kanSkifte(→ reserveret)"
        vaerdi={svar.ok
          ? <Pille tone="ok">ok</Pille>
          : <Pille tone="bad">afvist</Pille>}
      />

      {!svar.ok && (
        <p className={`fc-hint ${manglerPerm ? "fc-bad" : ""}`} style={{ marginTop: 10 }}>
          {svar.aarsag}
        </p>
      )}

      {/* Her er de to slags nej skrevet ud, så et manglende valg ikke læses
          som en manglende rettighed. */}
      <div style={{ borderTop: "1px solid var(--bc-line)", margin: "14px 0 10px" }} />
      <MiniLinje
        label="Har booking.godkend"
        vaerdi={manglerPerm
          ? <Pille tone="bad">nej</Pille>
          : <Pille tone="ok">ja</Pille>}
      />
      <MiniLinje
        label="Forslag valgt"
        vaerdi={manglerValg
          ? <Pille tone="warn">nej</Pille>
          : <Pille tone="ok">ja</Pille>}
      />

      <p className="fc-hint" style={{ marginTop: 12 }}>
        {manglerPerm ? (
          <>
            <b>Det her er beslutning 5.</b> Rollen <b>{rolle}</b> har ikke{" "}
            <code>booking.godkend</code> — og det står ikke som en regel om hvem der
            ikke må, men som et <b>felt der mangler</b> i presettet i{" "}
            <code>permissions.js</code>. Disponenten laver forslagene og må ikke
            godkende sit eget. Skift til <b>koordinator</b> i sidebaren og se knappen
            blive aktiv.
          </>
        ) : manglerValg ? (
          <>
            Du <b>har</b> adgangen — det der mangler, er et <b>valg</b>. Det er den
            anden slags nej, og den er værd at kunne skelne: uden den ville en
            koordinator bede om rettigheder hun allerede har.
          </>
        ) : (
          <>
            Både adgang og forudsætninger er på plads. <b>Men der skrives ingenting</b> —
            godkendelsen og reservationen skal ske i <b>én transaktion</b> i en Cloud
            Function. To klientkald kan lykkes halvt, og så står der en godkendt
            booking uden en reservation.
          </>
        )}
      </p>
    </Kort>
  );
}

/* ---- Hvad der ville blive skrevet -------------------------------------- */

function Skrivningen({ booking, svar, bruger, begrundelse, setBegrundelse }) {
  const opdatering = byggSkifte(booking, "reserveret", {
    rolle: bruger?.rolle, bruger: bruger?.uid,
    begrundelse, valgtForslagId: booking.valgtForslagId,
  });
  const historikNoegle = Object.keys(opdatering).find((n) => n.startsWith("historik/"));

  return (
    <Kort titel="Hvad godkendelsen ville skrive">
      <div className="fc-felt">
        <label htmlFor="fs-begrund">Begrundelse (kræves ved returnér og afvis)</label>
        <textarea id="fs-begrund" rows={2} value={begrundelse}
                  placeholder="Fx: forslag 2 er billigst og leverer inden fristen"
                  onChange={(e) => setBegrundelse(e.target.value)} />
      </div>

      <MiniLinje label="tilstand" vaerdi={<code>{opdatering.tilstand}</code>} />
      <MiniLinje label="valgtForslagId" vaerdi={<code>{String(opdatering.valgtForslagId)}</code>} />
      <MiniLinje label="sidstAendretAf" vaerdi={<code>{String(opdatering.sidstAendretAf)}</code>} />
      <MiniLinje label="historik" vaerdi={<code>{historikNoegle}</code>} />

      <p className="fc-hint" style={{ marginTop: 12 }}>
        <b>Der skrives altid til historik.</b> En afvist eller returneret booking skal
        kunne forklares et halvt år senere, og begrundelsen står i objektets egen
        historik — ikke i auditloggen, hvor fritekst ikke kommer med som værdi.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        Reservationen bygges <b>ikke</b> her. Den skal skrives atomisk sammen med
        tilstandsskiftet, og konfliktfriheden kan ikke afgøres i klienten — to
        koordinatorer kan ramme samme sekund.{" "}
        <Link className="fc-a" to="/booking/disponering">Se disponeringen</Link>.
      </p>
      {!svar.ok && (
        <Fejl>Overgangen er afvist — posten herover ville aldrig blive skrevet.</Fejl>
      )}
    </Kort>
  );
}
