/* src/moduler/warehouse/Transportlabels.jsx
 * Warehouse – Transportlabels. WAREHOUSE.md etape 15, planche 3 af 3.
 *
 * ⚠ LABELEN ER IKKE EN NODE. Der gemmes intet her: typen udledes af
 * etapekæden, felterne slås op i booking, kunde og plads, og stregkoden
 * bygges af de to id'er der findes i forvejen. Et gemt mærkat ville drive fra
 * sin booking første gang nogen rettede et slutmål — og så ville papiret på
 * pallen og skærmen sige hver sit. Logikken ligger i `transportlabel.js`, ét
 * sted, så en kommende Cloud Function kan udstede den samme label.
 *
 * ⚠ ETAPERNE ER SPÆRRET AF BOOKING-MODULET, beholderne af warehouse. En kunde
 * med lager men uden booking har ingen transporter — og skærmen siger det
 * frem for at vise en tom tabel, der ligner en fejl. `hent: false` gør at der
 * ikke engang spørges; en afvisning skal betyde noget (beslutning 26).
 *
 * ⚠ EN HALV LABEL TRYKKES IKKE. `byggLabel()` svarer med `mangler`, og
 * knappen er spærret så længe der er ét felt tilbage. Et mærkat med en tom
 * modtageradresse ser ud som et helt mærkat, og godset kører efter det —
 * fejlen opdages på rampen, ikke her. Samme afvejning som momssatsen, der
 * nægter eksporten frem for at antage 25 %.
 */
import { useState } from "react";
import { Link } from "react-router-dom";

import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { harModul } from "../../fleet/moduler.js";
import { num } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Knap, Henter, Datatilstand, Tom, Sider,
} from "../../fleet/ui.jsx";
import { pladsnavn } from "../../fleet/unitbooking.js";
import { CARRIER_TYPE } from "../../fleet/warehouse.js";
import {
  LABELTYPE, ALLE_LABELTYPER, byggLabel,
} from "../../fleet/transportlabel.js";
import { bjaelker, bredde, STILLE_ZONE } from "../../fleet/stregkode128.js";

import { DEMO_CARRIERS, DEMO_REOLPLADSER } from "../../fleet/demo-lager.js";
import { DEMO_ETAPER } from "../../fleet/demo-etaper.js";
import { DEMO_BOOKINGER } from "../../fleet/demo-bookinger.js";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";

const PR_SIDE = 10;

/* Hvad hvert felt hedder i den spærring skærmen skriver. Listen står her og
   ikke i domænefilen: `mangler` er nodeord, og det her er dansk UI. */
const MANGLER_TEKST = {
  carrier: "beholderen",
  etape: "transporten",
  etapeId: "en transport på beholderen",
  bookingNummer: "bookingens nummer",
  carrierId: "beholderens id",
  kunde: "kunden",
  fraSted: "afsenderstedet",
  slutmaal: "slutmålet",
  transit: "transitstedet",
  lokation: "lokationen på lageret",
};

const manglerTekst = (n) => MANGLER_TEKST[n] || n;

export default function Transportlabels() {
  const { moduler } = useFleet();
  const [type, saetType] = useState("");
  const [soeg, saetSoeg] = useState("");
  const [side, saetSide] = useState(1);
  const [valgt, saetValgt] = useState(null);

  const harBooking = harModul(moduler, "booking");

  const {
    data: carriers, tilstand, genindlaes, henter,
  } = useListe("carriers", {
    division: "alle", graense: 2000, demo: DEMO_CARRIERS,
    sorter: (a, b) => (a.id || "").localeCompare(b.id || "", "da"),
  });
  const { data: etaper } = useListe("etaper", {
    division: "alle", graense: 2000, demo: DEMO_ETAPER, hent: harBooking,
  });
  const { data: bookinger } = useListe("bookinger", {
    division: "alle", graense: 2000, demo: DEMO_BOOKINGER, hent: harBooking,
  });
  const { data: kunder } = useListe("kunder", {
    division: "alle", graense: 2000, demo: DEMO_KUNDER,
  });
  const { data: pladser } = useListe("reolpladser", {
    division: "alle", graense: 2000, demo: DEMO_REOLPLADSER,
  });

  if (henter) return <Henter hvad="transportlabels" />;

  const etapeMap = Object.fromEntries(etaper.map((e) => [e.id, e]));
  const bookingMap = Object.fromEntries(bookinger.map((b) => [b.id, b]));
  const kundeMap = Object.fromEntries(kunder.map((k) => [k.id, k]));
  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));

  /* Kæden er ALLE etaper på den samme booking — ikke kun den beholderen står
     på. Typen kan ikke afgøres af ét led: det er netop om der er et led mere,
     der skiller "direkte" fra "via transit". */
  const kaedeFor = (etapeId) => {
    const e = etapeMap[etapeId];
    if (!e) return [];
    if (!e.bookingId) return [e];
    return etaper.filter((x) => x.bookingId === e.bookingId);
  };

  const labelFor = (c) => {
    const etape = etapeMap[c.etapeId];
    const plads = c.pladsId ? pladsMap[c.pladsId] : null;
    return byggLabel({
      carrier: c,
      etaper: kaedeFor(c.etapeId),
      booking: etape ? bookingMap[etape.bookingId] : null,
      kunde: kundeMap[c.kundeId] || null,
      plads: plads ? { id: plads.id, navn: pladsnavn(plads) } : null,
    });
  };

  const raekker = carriers.map((c) => ({ carrier: c, label: labelFor(c) }));

  const q = soeg.trim().toLowerCase();
  const viste = raekker.filter(({ carrier, label }) => {
    if (type && label.type !== type) return false;
    if (!q) return true;
    return (carrier.id || "").toLowerCase().includes(q) ||
      (label.felter.bookingNummer || "").toLowerCase().includes(q) ||
      (label.felter.slutmaal || "").toLowerCase().includes(q);
  });

  const sider = Math.max(1, Math.ceil(viste.length / PR_SIDE));
  const nuSide = Math.min(side, sider);
  const paaSiden = viste.slice((nuSide - 1) * PR_SIDE, nuSide * PR_SIDE);

  const klar = raekker.filter((r) => r.label.kanTrykkes).length;
  const udenTransport = raekker.filter((r) => !r.carrier.etapeId).length;

  const aaben = valgt ? raekker.find((r) => r.carrier.id === valgt) : null;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {/* ⚠ IKKE EN TOM TABEL. Uden Booking findes etaperne ikke, og en
          beholder kan derfor ikke bære en transport. En spærring der ikke kan
          forklare sig selv, ligner en fejl — beslutning 32. */}
      {!harBooking && (
        <Kort className="fc-ikke-print" titel="Transportlabels kræver Booking">
          <p className="fc-svar">
            En label fortæller hvilken transport godset følger, og transporten
            er en <strong>etape</strong> på en booking. Uden Booking-modulet er
            der ingen etaper at pege på, og beholderne kan ikke mærkes.
          </p>
        </Kort>
      )}

      {/* ⚠ LISTEN PRINTES IKKE. Et mærkat er ikke et skærmbillede med en label
          på — se print-reglerne i fleet.css. */}
      <Kort
        className="fc-ikke-print"
        titel={`Labels (${num(klar)} klar af ${num(raekker.length)})`}
        handling={
          <Link className="fc-a" to="/warehouse/carriers">Se beholderne</Link>
        }
      >
        {udenTransport > 0 && (
          <p className="fc-svar">
            {num(udenTransport)}{" "}
            {udenTransport === 1 ? "beholder er" : "beholdere er"} ikke knyttet
            til en transport og kan derfor ikke mærkes. En beholder får sin
            transport, når godset disponeres på en etape.
          </p>
        )}

        <div className="fc-filtre fc-ikke-print">
          <div className="fc-felt">
            <label htmlFor="tl-soeg">Søg</label>
            <input
              id="tl-soeg" type="search" value={soeg}
              placeholder="Beholder, bookingnummer eller slutmål"
              onChange={(e) => { saetSoeg(e.target.value); saetSide(1); }}
            />
          </div>
          <div className="fc-felt">
            <label htmlFor="tl-type">Transporttype</label>
            <select
              id="tl-type" value={type}
              onChange={(e) => { saetType(e.target.value); saetSide(1); }}
            >
              <option value="">Alle tre typer</option>
              {ALLE_LABELTYPER.map((t) => (
                <option key={t} value={t}>{LABELTYPE[t].label}</option>
              ))}
            </select>
          </div>
        </div>

        <Tabel
          kolonner={[
            {
              key: "carrier", label: "Beholder",
              render: ({ carrier }) => (
                <>
                  <strong>{carrier.id}</strong>{" "}
                  <span className="fc-hint">
                    {CARRIER_TYPE[carrier.type]?.label || carrier.type}
                  </span>
                </>
              ),
            },
            {
              key: "type", label: "Transporttype",
              render: ({ label }) => (
                label.type
                  ? <Pille tone="info">{label.typeLabel}</Pille>
                  : <span className="fc-hint">ingen transport</span>
              ),
            },
            {
              key: "booking", label: "Booking",
              render: ({ label }) => label.felter.bookingNummer || "—",
            },
            {
              key: "rute", label: "Rute",
              render: ({ label }) => {
                const { fraSted, transit, slutmaal } = label.felter;
                if (!fraSted && !slutmaal) return "—";
                return [fraSted, transit, slutmaal].filter(Boolean).join(" → ");
              },
            },
            {
              key: "status", label: "Kan trykkes",
              render: ({ label }) => (
                label.kanTrykkes
                  ? <Pille tone="ok">Klar</Pille>
                  : (
                    <span className="fc-hint">
                      mangler {label.mangler.map(manglerTekst).join(", ")}
                    </span>
                  )
              ),
            },
          ]}
          raekker={paaSiden}
          noegle={({ carrier }) => carrier.id}
          paaRaekke={({ carrier }) => saetValgt(carrier.id)}
          erValgt={({ carrier }) => carrier.id === valgt}
          tom="Ingen beholdere at mærke."
        />

        <Sider side={nuSide} antal={viste.length} prSide={PR_SIDE} saet={saetSide} />
      </Kort>

      {aaben && (
        <Kort
          className="fc-maerkat-kort"
          titel={`Label · ${aaben.carrier.id}`}
          handling={
            <span className="fc-ikke-print">
              <Knap
                variant="primaer"
                disabled={!aaben.label.kanTrykkes}
                onClick={() => window.print()}
              >
                Print label
              </Knap>
            </span>
          }
        >
          {!aaben.label.kanTrykkes && (
            <p className="fc-svar fc-svar-fejl" role="alert">
              ⚠ Labelen kan ikke trykkes. Der mangler{" "}
              {aaben.label.mangler.map(manglerTekst).join(", ")}. Et mærkat med
              et tomt felt ser ud som et helt mærkat, og godset kører efter det.
            </p>
          )}

          <LabelArk label={aaben.label} carrier={aaben.carrier} />
        </Kort>
      )}

      {!raekker.length && (
        <Tom>Der er ingen beholdere på lageret endnu.</Tom>
      )}
    </div>
  );
}

/* Selve mærkatet. Ét felt pr. linje, og et felt der mangler, står som en
   tydelig markering — ikke som en tom plads man kan overse. */
function LabelArk({ label, carrier }) {
  const f = label.felter;
  const linje = (navn, vaerdi) => (
    <div className="fc-maerkat-linje">
      <span>{navn}</span>
      <strong>{vaerdi || <span className="fc-hint">— mangler —</span>}</strong>
    </div>
  );

  return (
    <div className="fc-maerkat fc-grid" style={{ gap: 8 }}>
      <div className="fc-row" style={{ justifyContent: "space-between" }}>
        <strong>{label.typeLabel || "Ukendt transporttype"}</strong>
        <span className="fc-hint">
          {label.type ? LABELTYPE[label.type].beskrivelse : ""}
        </span>
      </div>

      {/* ⚠ SLUTMÅLET STÅR STORT. Det er det ene felt en chauffør læser på
          afstand af en palle; resten slås op, når mærkatet er i hånden. */}
      <div>
        <div className="fc-hint">Slutmål</div>
        <div className="fc-maerkat-maal">
          {f.slutmaal || <span className="fc-hint">— mangler —</span>}
        </div>
        {f.transit && (
          <div className="fc-hint">via {f.transit}</div>
        )}
      </div>

      {linje("Booking", f.bookingNummer)}
      {linje("Beholder", f.carrierId)}
      {linje("Kunde", f.kunde)}
      {linje("Fra", f.fraSted)}
      {label.type === "storage" && linje("Lokation efter transit", f.lokation)}
      {carrier?.note && linje("Note", carrier.note)}

      {/* ⚠ EN STREGKODE, IKKE KODEN SKREVET SOM TEKST. Første udgave skrev
          bogstaverne, og mærkatet så komplet ud — men et mærkat der ikke kan
          scannes, er hele grunden til at der er et mærkat. Tallet står under
          stregerne, så et menneske kan taste det, hvis koden er snavset. */}
      <Stregkode kode={f.stregkode} />
    </div>
  );
}

/* Code 128 som SVG. Bredden er moduler, ikke pixels — så mærkatet kan skaleres
   uden at et modul bliver til halvanden og koden ulæselig. */
function Stregkode({ kode }) {
  if (!kode) {
    return (
      <p className="fc-svar fc-svar-fejl" role="alert">
        ⚠ Ingen stregkode: koden kan først bygges, når booking og beholder
        begge er kendt.
      </p>
    );
  }

  const streger = bjaelker(kode);
  const bred = bredde(kode);
  if (!streger || !bred) {
    /* Kun ASCII 32–126 kan kodes i subset B. Der gættes ikke på et tegn. */
    return (
      <p className="fc-svar fc-svar-fejl" role="alert">
        ⚠ Koden «{kode}» indeholder tegn der ikke kan stregkodes.
      </p>
    );
  }

  const HOEJDE = 60;
  return (
    <div>
      <svg
        className="fc-stregkode"
        viewBox={`0 0 ${bred} ${HOEJDE}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Stregkode ${kode}`}
      >
        {streger.map((b) => (
          <rect
            key={b.fra}
            x={STILLE_ZONE + b.fra}
            y={0}
            width={b.bredde}
            height={HOEJDE}
          />
        ))}
      </svg>
      <div className="fc-stregkode-tal">{kode}</div>
    </div>
  );
}
