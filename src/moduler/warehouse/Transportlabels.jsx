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
  Felt, Feltraekke, Formular,
} from "../../fleet/ui.jsx";
import { gem } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import { pladsnavn } from "../../fleet/unitbooking.js";
import { CARRIER_TYPE } from "../../fleet/warehouse.js";
import { beholdningPaaCarrier } from "../../fleet/warehouse.js";
import {
  LABELTYPE, ALLE_LABELTYPER, HAANDTERING, ALLE_HAANDTERINGER, byggLabel,
  MAKS_GODSLINJER, MAKS_GODSTEGN, godsLinjer,
  valideMaerkatfelter, gramFraKilo, kiloFraGram,
} from "../../fleet/transportlabel.js";
import { bjaelker, bredde, STILLE_ZONE } from "../../fleet/stregkode128.js";
import { qrFelter, qrBredde, QR_STILLE_ZONE } from "../../fleet/qrkode.js";

import {
  DEMO_CARRIERS, DEMO_REOLPLADSER, DEMO_BEHOLDNING,
} from "../../fleet/demo-lager.js";
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
  /* Den ene der ikke mangler, men fylder for meget. */
  godsbeskrivelse: `plads: godsbeskrivelsen fylder mere end ${MAKS_GODSLINJER} linjer`,
};

const manglerTekst = (n) => MANGLER_TEKST[n] || n;

export default function Transportlabels() {
  const { moduler, path } = useFleet();
  const [type, saetType] = useState("");
  const [soeg, saetSoeg] = useState("");
  const [side, saetSide] = useState(1);
  const [valgt, saetValgt] = useState(null);
  const [redigerer, saetRedigerer] = useState(false);

  const harBooking = harModul(moduler, "booking");

  const {
    data: carriers, tilstand, genindlaes, henter,
  } = useListe("carriers", {
    graense: 2000, demo: DEMO_CARRIERS,
    sorter: (a, b) => (a.id || "").localeCompare(b.id || "", "da"),
  });
  const { data: etaper } = useListe("etaper", {
    graense: 2000, demo: DEMO_ETAPER, hent: harBooking,
  });
  const { data: bookinger } = useListe("bookinger", {
    graense: 2000, demo: DEMO_BOOKINGER, hent: harBooking,
  });
  const { data: kunder } = useListe("kunder", {
    graense: 2000, demo: DEMO_KUNDER,
  });
  const { data: pladser } = useListe("reolpladser", {
    graense: 2000, demo: DEMO_REOLPLADSER,
  });
  /* ⚠ SERIENUMMER OG BATCH ER IKKE FELTER PÅ BEHOLDEREN. De står på det gods
     der ligger i den, og udledes derfor af beholdningen — to steder til samme
     kendsgerning ville drive. */
  const { data: beholdning } = useListe("beholdning", {
    graense: 5000, demo: DEMO_BEHOLDNING,
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
      beholdning: beholdningPaaCarrier(beholdning, c.id),
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
                /* ⚠ BYERNE, IKKE ADRESSEBLOKKENE. `transit` er et objekt med
                   navn, gade og postnr — sat i en streng bliver den til
                   "[object Object]", og det stod på skærmen. */
                const { fraSted, transitSted, slutmaal } = label.felter;
                if (!fraSted && !slutmaal) return "—";
                return [fraSted, transitSted, slutmaal].filter(Boolean).join(" → ");
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
          paaRaekke={({ carrier }) => { saetValgt(carrier.id); saetRedigerer(false); }}
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
            <span className="fc-ikke-print fc-med-ikon" style={{ gap: 8 }}>
              <Knap onClick={() => saetRedigerer((v) => !v)}>
                {redigerer ? "Skjul felter" : "Redigér felter"}
              </Knap>
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

      {aaben && redigerer && (
        <Maerkatformular
          carrier={aaben.carrier}
          sti={path}
          paaGemt={() => { saetRedigerer(false); genindlaes(); }}
          paaLuk={() => saetRedigerer(false)}
        />
      )}

      {!raekker.length && (
        <Tom>Der er ingen beholdere på lageret endnu.</Tom>
      )}
    </div>
  );
}


/* ---- Selve mærkatet ---------------------------------------------------- */

/**
 * Mærkatet, bygget efter planchen: farvet bånd med transporttypen, tre numre,
 * kunde og mængde, ruten i to eller tre celler, vægt/mål/sporing,
 * godsbeskrivelsen i egen ramme, rutelogikken, QR + stregkode, og til sidst
 * håndteringsmærkerne.
 *
 * ⚠ ET FELT UDEN KILDE STÅR SOM "—", IKKE SOM TOMT. Et tomt felt på et mærkat
 * læses som en fejl i trykket; en streg siger at ingen har svaret. Og et felt
 * mærkatet ikke kan undvære, spærrer trykket — se `mangler`.
 */
function LabelArk({ label, carrier }) {
  const f = label.felter;

  const celle = (etiket, indhold, under) => (
    <div className="fc-maerkat-celle">
      <span className="fc-maerkat-etiket">{etiket}</span>
      <div className="fc-maerkat-vaerdi">
        {indhold || <span className="fc-maerkat-tom">—</span>}
      </div>
      {under}
    </div>
  );

  const adresse = (a) => {
    if (!a) return null;
    return (
      <div className="fc-maerkat-under">
        {a.gade && <div>{a.gade}</div>}
        {a.postnrBy && <div>{a.postnrBy}</div>}
      </div>
    );
  };

  const kolonner = (n) => ({ gridTemplateColumns: `repeat(${n}, 1fr)` });
  const rute = f.transit ? 3 : 2;

  return (
    <div className={`fc-maerkat fc-maerkat-${label.type || "viaTransit"}`}>
      <div className="fc-maerkat-band">
        <TypeIkon type={label.type} />
        {label.typeLabel || "Ukendt transporttype"}
      </div>

      {/* De tre numre. Kundens ref er hans eget — det er DET modtageren søger
          på, og derfor står det ved siden af vores bookingnummer. */}
      <div className="fc-maerkat-raekke" style={kolonner(3)}>
        {celle("Booking ID", f.bookingNummer)}
        {celle("Carrier ID", f.carrierId)}
        {celle("Kundens ref.nr.", f.kundeRef)}
      </div>

      <div className="fc-maerkat-raekke" style={{ gridTemplateColumns: "2fr 1fr" }}>
        {celle("Kunde", f.kunde, adresse(f.kundeAdresse))}
        {celle("Antal kolli / enheder", f.kolli)}
      </div>

      {/* Ruten. Den direkte label har to celler; de to andre har transitten
          imellem — og storage slutter på en hylde frem for hos en modtager. */}
      <div className="fc-maerkat-raekke" style={kolonner(rute)}>
        {celle("Fra (A)", f.fra?.navn || f.fraSted, adresse(f.fra))}
        {f.transit && celle(
          "Transit hub", f.transit.navn || f.transitSted, adresse(f.transit),
        )}
        {label.type === "storage"
          ? celle("Storage (lager / zone)", f.lokation, adresse(f.til))
          : celle("Til (B)", f.til?.navn || f.slutmaal, adresse(f.til))}
      </div>

      <div className="fc-maerkat-raekke" style={kolonner(3)}>
        {celle("Vægt", f.vaegtGram === null ? null : `${kg(f.vaegtGram)} kg`)}
        {celle("Mål / dimensioner", f.maal,
          f.maal ? <div className="fc-maerkat-under">(L x B x H)</div> : null)}
        {/* ⚠ PLANCHEN SKRIVER "N/A" HER, OG DET GØR VI IKKE. Huset har ÉN
            markør for "intet svar" — em-dashen i format.js — og en prøve
            håndhæver det: den næste ville tro der var forskel på "N/A" og
            "—", og ingen af dem kunne søges frem. */}
        {celle(
          "Serienr. / batch",
          null,
          (f.serienr || f.batch) && (
            <div className="fc-maerkat-under">
              {f.serienr && <div>SN: {f.serienr}</div>}
              {f.batch && <div>Batch: {f.batch}</div>}
            </div>
          ),
        )}
      </div>

      <div className="fc-maerkat-gods">
        <span className="fc-maerkat-etiket">
          Goods detaljer / beskrivelse af indhold
        </span>
        {f.godsbeskrivelse
          ? <p>{f.godsbeskrivelse}</p>
          : (
            <p className="fc-maerkat-tom">
              Ingen godsbeskrivelse på beholderen.
            </p>
          )}
      </div>

      <div className="fc-maerkat-status">
        <span className="fc-maerkat-etiket">Status / rutelogik</span>
        <span>{label.rutelogik || "—"}</span>
      </div>

      {/* ⚠ TO KODER, ÉN NYTTELAST. QR'en læses af en telefon, stregkoden af
          terminalens håndscanner. Bar de hver sit, ville mærkatet sige to
          ting om den samme palle. */}
      <div className="fc-maerkat-koder">
        <QrKode kode={f.stregkode} />
        <Stregkode kode={f.stregkode} />
      </div>

      {label.haandtering.length > 0 && (
        <div
          className="fc-maerkat-maerker"
          style={kolonner(label.haandtering.length)}
        >
          {label.haandtering.map((m) => (
            <div key={m} className="fc-maerkat-maerke" title={HAANDTERING[m].dansk}>
              <MaerkeIkon maerke={m} />
              <span>{HAANDTERING[m].label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Gram er nodens enhed; kilo er mærkatets. Ét decimal, og kun når der er et. */
function kg(gram) {
  const v = gram / 1000;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
}

/* ---- Stregerne og firkanterne ------------------------------------------ */

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

  const HOEJDE = 46;
  return (
    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
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
      <div className="fc-stregkode-tal" style={{ textAlign: "center" }}>{kode}</div>
    </div>
  );
}

/* QR som SVG — samme nyttelast som stregkoden. */
function QrKode({ kode }) {
  if (!kode) return null;
  const felter = qrFelter(kode);
  const bred = qrBredde(kode);
  if (!felter || !bred) return null;

  return (
    <svg
      className="fc-qrkode"
      viewBox={`0 0 ${bred} ${bred}`}
      role="img"
      aria-label={`QR-kode ${kode}`}
    >
      {felter.map(({ x, y }) => (
        <rect
          key={`${x}-${y}`}
          x={QR_STILLE_ZONE + x}
          y={QR_STILLE_ZONE + y}
          width={1}
          height={1}
        />
      ))}
    </svg>
  );
}

/* ---- Ikonerne ----------------------------------------------------------
   Tegnet som streger frem for hentet: mærkatet skal kunne printes i sort/hvid
   uden at et ikon forsvinder, og huset har ingen ikonpakke. */

const TypeIkon = ({ type }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    {type === "direkte" && (
      <>
        <path d="M2 16V7h10v9" /><path d="M12 10h4l4 3v3h-8" />
        <circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" />
      </>
    )}
    {type === "viaTransit" && (
      <>
        <path d="M3 20V9l9-5 9 5v11" /><path d="M8 20v-6h8v6" />
        <path d="M10 11h4" />
      </>
    )}
    {type === "storage" && (
      <>
        <path d="M3 20V9l9-5 9 5v11z" /><path d="M7 20v-7h10v7" />
        <path d="M7 16h10" />
      </>
    )}
  </svg>
);

const MaerkeIkon = ({ maerke }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    {maerke === "fragile" && (
      <>
        <path d="M8 3h8l-1 6a3 3 0 0 1-6 0z" /><path d="M12 12v7" />
        <path d="M8 21h8" />
      </>
    )}
    {maerke === "denneSideOp" && (
      <>
        <path d="M8 20V6" /><path d="M5 9l3-3 3 3" />
        <path d="M16 20V6" /><path d="M13 9l3-3 3 3" />
      </>
    )}
    {maerke === "holdToer" && (
      <>
        <path d="M3 13a9 9 0 0 1 18 0z" /><path d="M12 13v6a2 2 0 0 0 4 0" />
      </>
    )}
    {maerke === "gaffeltruck" && (
      <>
        <path d="M3 5v11h8" /><path d="M11 16V9h5l3 4v3" />
        <circle cx="7" cy="19" r="1.6" /><circle cx="16" cy="19" r="1.6" />
        <path d="M20 4v10" />
      </>
    )}
    {maerke === "temperatur" && (
      <>
        <path d="M10 14V5a2 2 0 0 1 4 0v9" />
        <circle cx="12" cy="17" r="3" /><path d="M16 7h4" /><path d="M16 11h4" />
      </>
    )}
  </svg>
);

/* ---- Formularen -------------------------------------------------------- */

/**
 * Mærkatets felter på beholderen.
 *
 * ⚠ DEN LIGGER HER OG IKKE PÅ BEHOLDER-SKÆRMEN, og det er et valg. Felterne
 * hører til carrieren, men GRUNDEN til at udfylde dem er mærkatet: man ser
 * hvad der mangler, og retter det uden at skifte skærm. Beholder-skærmen viser
 * beholderens drift — indhold, placering, seneste bevægelse — og de to
 * spørgsmål er ikke det samme.
 *
 * ⚠ TRE AF PLANCHENS FELTER KAN IKKE STÅ HER, og det er ikke en forglemmelse:
 *
 *   · kundens ref.nr.        `bookinger` er .write: false
 *   · fra- og til-adresse    `etaper` er .write: false
 *
 * Begge noder skrives kun af `etapeskift`, fordi en tilstand og dens
 * reservation skal skrives atomisk (beslutning 16 og 40). En formular her
 * ville blive afvist af reglerne — og en knap der altid fejler, er værre end
 * ingen knap. De kræver hver sin Cloud Function.
 *
 * Kundens adresse kan derimod skrives (`kunder` er åben med kunder.skriv), men
 * den hører i kundekartoteket, som i dag slet ikke har en redigeringsformular.
 */
function Maerkatformular({ carrier, sti, paaGemt, paaLuk }) {
  const [f, saetF] = useState(() => ({
    kolli: Number.isFinite(carrier.kolli) ? String(carrier.kolli) : "",
    loesEnheder: Number.isFinite(carrier.loesEnheder) ? String(carrier.loesEnheder) : "",
    vaegtKg: kiloFraGram(carrier.vaegtGram),
    godsbeskrivelse: carrier.godsbeskrivelse || "",
    haandtering: { ...(carrier.haandtering || {}) },
  }));
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v }));
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const skiftMaerke = (m) => {
    saetF((x) => {
      const naeste = { ...x.haandtering };
      /* Et fravalgt mærke SLETTES frem for at stå som false. Reglen tager kun
         booleans, og en node fuld af false ville se ud som fem beslutninger,
         hvor der kun er truffet nul. */
      if (naeste[m]) delete naeste[m];
      else naeste[m] = true;
      return { ...x, haandtering: naeste };
    });
    saetSvar(null);
  };

  const fejl = valideMaerkatfelter(f);
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;

  /* ⚠ ADVARSEL, IKKE EN FEJL. Teksten er lovlig data; det er MÆRKATET der kun
     har plads til syv linjer. Kunne den ikke gemmes, ville folk forkorte den —
     og så mister lageret oplysningen, ikke bare papiret. */
  const linjer = godsLinjer(f.godsbeskrivelse);
  const forLang = linjer > MAKS_GODSLINJER;

  const heltalEller = (v) => {
    if (v === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const r = await gem({
      sti: sti(`carriers/${carrier.id}`),
      data: {
        kolli: heltalEller(f.kolli),
        loesEnheder: heltalEller(f.loesEnheder),
        vaegtGram: gramFraKilo(f.vaegtKg),
        godsbeskrivelse: f.godsbeskrivelse.trim() || null,
        /* Tom node frem for et objekt uden nøgler — RTDB gemmer ikke et tomt
           objekt, og null siger det samme tydeligere. */
        haandtering: Object.keys(f.haandtering).length ? f.haandtering : null,
      },
      /* ⚠ FLET. Beholderen bærer også type, status, plads og mål, som den her
         formular ikke kender. Med set() ville et gemt mærkatfelt slette dem. */
      flet: true,
      foer: carrier, objekt: "carriers", objektId: carrier.id,
      handling: AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  return (
    <Kort className="fc-ikke-print" titel={`Mærkatets felter · ${carrier.id}`}>
      <Formular
        onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
        gemLabel="Gem mærkatfelter" onAnnuller={paaLuk} svar={svar}
      >
        <Feltraekke>
          <Felt
            id="mf-kolli" label="Antal kolli" type="number" min="0" step="1"
            vaerdi={f.kolli} saet={saet("kolli")} fejl={vis("kolli")}
            hint="Pakker man kan tælle — ikke varelinjer."
          />
          <Felt
            id="mf-loese" label="Løse enheder" type="number" min="0" step="1"
            vaerdi={f.loesEnheder} saet={saet("loesEnheder")}
            fejl={vis("loesEnheder")}
            hint="Det der ikke er pakket i noget. Står som «+ 1 stk.»."
          />
          <Felt
            id="mf-vaegt" label="Vægt" vaerdi={f.vaegtKg} saet={saet("vaegtKg")}
            fejl={vis("vaegtKg")} suffiks="kg"
            hint="Bruttovægt med beholderen."
          />
        </Feltraekke>

        <div className={`fc-felt${vis("godsbeskrivelse") ? " fc-felt-fejl" : ""}`}>
          <label htmlFor="mf-gods">Godsbeskrivelse</label>
          <textarea
            id="mf-gods" rows={6} value={f.godsbeskrivelse}
            onChange={(e) => saet("godsbeskrivelse")(e.target.value)}
            aria-invalid={vis("godsbeskrivelse") ? "true" : undefined}
            aria-describedby="mf-gods-hint"
          />
          <span className="fc-felt-hint" id="mf-gods-hint">
            {`${linjer} af ${MAKS_GODSLINJER} linjer på mærkatet · `}
            {`${f.godsbeskrivelse.length} af ${MAKS_GODSTEGN} tegn`}
          </span>
          {vis("godsbeskrivelse") && (
            <span className="fc-felt-fejltekst" role="alert">
              {vis("godsbeskrivelse")}
            </span>
          )}
        </div>

        {forLang && (
          <p className="fc-svar fc-svar-fejl" role="alert">
            ⚠ Beskrivelsen fylder {linjer} linjer, og mærkatet har plads til{" "}
            {MAKS_GODSLINJER}. Den kan godt gemmes — men labelen kan ikke
            trykkes, før den er kortere. Der klippes ikke: «Må ikke vendes» kan
            stå i den linje der ville forsvinde.
          </p>
        )}

        <fieldset className="fc-felt" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="fc-felt-hint" style={{ padding: 0 }}>
            Håndteringsmærker — de trykkes nederst på mærkatet
          </legend>
          <div className="fc-row" style={{ flexWrap: "wrap", gap: 14, marginTop: 6 }}>
            {ALLE_HAANDTERINGER.map((m) => (
              <label key={m} className="fc-med-ikon" style={{ gap: 6 }}>
                <input
                  type="checkbox" checked={Boolean(f.haandtering[m])}
                  onChange={() => skiftMaerke(m)}
                />
                {HAANDTERING[m].dansk}
                <span className="fc-hint">({HAANDTERING[m].label})</span>
              </label>
            ))}
          </div>
        </fieldset>
      </Formular>

      {/* ⚠ DE TRE FELTER DER IKKE KAN STÅ HER. Skrives de ikke frem, ligner
          mærkatet bare ufuldstændigt — og nogen leder efter en knap der ikke
          findes. Se hovedet. */}
      <p className="fc-svar">
        <strong>Ikke herfra:</strong> kundens ref.nr. hører på bookingen, og
        fra-/til-adresserne på etapen. Begge noder er lukket for klienten, fordi
        en tilstand og dens reservation skal skrives sammen — de kræver hver sin
        server-funktion. Kundens adresse hører i kundekartoteket.
      </p>
    </Kort>
  );
}
