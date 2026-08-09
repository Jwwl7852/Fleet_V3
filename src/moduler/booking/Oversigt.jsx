/* src/moduler/booking/Oversigt.jsx
 * Booking & Opgaver
 *
 * ⚠ TABELLEN VISER BOOKINGENS TILSTAND FRA booking-state.js — ikke en fri
 * statusstreng. Mockuppen havde tekster som "Afventer" og "Booket" skrevet i
 * hånden; her kommer både label og farve fra TILSTAND, så to skærme ikke kan
 * kalde samme tilstand noget forskelligt.
 *
 * ⚠ OG TILSTANDEN GENBEREGNES AF ETAPERNE (beslutning 16).
 * En booking er et forløb med N etaper, og tilstanden ligger på ETAPEN. Feltet
 * på bookingen er denormaliseret — det skrives af den Cloud Function der
 * skifter en etapetilstand, i samme transaktion. Skærmen viser derfor
 * forloebstilstand() og markerer det, hvis det lagrede felt er drevet fra sit
 * grundlag. Et felt der er forkert uden at nogen ser det, er den værste
 * fejltilstand: den ser ud som om den lykkedes.
 *
 * `delvist` er værdien der findes fordi et halvfærdigt forløb hverken må
 * læses som færdigt eller være usynligt. BKG-2026-00317 har en udført etape
 * og en åben — den er delvist.
 *
 * FASE 0: VISNING. Ingen tilstandsskift skrives.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, dato } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Fejl, Knap,
} from "../../fleet/ui.jsx";
import { TILSTAND, forloebstilstand, tilgaengeligeHandlinger } from "../../fleet/booking-state.js";
import { DEMO_BOOKINGER, TRANSPORTTYPE, demoEtaperPaa } from "../../fleet/demo-bookinger.js";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";

const kundeNavn = (id) => DEMO_KUNDER.find((k) => k.id === id)?.navn || id;

export default function BookingOversigt() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  const { bruger, division } = useFleet();
  const [visAlle, setVisAlle] = useState(false);

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  /* Samme visningsregel som useListe: valgt division plus fælles, og en post
     uden division vises i begge. */
  const iDivision = DEMO_BOOKINGER.filter(
    (b) => b.division == null || b.division === division || b.division === "faelles"
  );

  /* Tilstanden GENBEREGNES. Det lagrede felt er en denormalisering. */
  const raekker = iDivision.map((b) => {
    const etaper = demoEtaperPaa(b.id);
    const afledt = etaper.length ? forloebstilstand(etaper) : null;
    return {
      ...b,
      etaper,
      vist: afledt?.tilstand || b.tilstand,
      antal: afledt?.antal || null,
      harAabne: afledt?.harAabneEtaper || false,
      drevet: Boolean(afledt && afledt.tilstand !== b.tilstand),
    };
  });

  const FAERDIGE = new Set(["udfoert", "afvist", "annulleret"]);
  const viste = visAlle ? raekker : raekker.filter((r) => !FAERDIGE.has(r.vist));
  const drevne = raekker.filter((r) => r.drevet);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Nye bookinger" vaerdi={num(k.opgaver.nyeBookinger)} />
        <KpiKort label="I gang i dag" vaerdi={num(k.opgaver.igangIDag)} />
        <KpiKort label="Forsinkede" vaerdi={num(k.opgaver.forsinkede)} />
        <KpiKort label="Ikke-faktureret" vaerdi={kr(k.oekonomi.ikkeFaktureretOere)}
                 note="kun færdige forløb" />
      </KpiRaekke>

      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}

      {/* Er det denormaliserede felt drevet, skal det siges — ikke skjules bag
          det genberegnede tal. */}
      {drevne.length > 0 && (
        <Fejl>
          {drevne.length} booking(er) har en lagret tilstand der ikke passer med
          etaperne. Feltet er denormaliseret og skrives af en Cloud Function; er
          det drevet, ser en fejl ud som om den lykkedes.
        </Fejl>
      )}

      <Kort
        titel="Bookinger"
        handling={<Link className="fc-a" to="/booking/ny">Ny forespørgsel</Link>}
      >
        <div className="fc-faner" role="tablist" aria-label="Udsnit">
          <button type="button" role="tab" className="fc-fane" aria-selected={!visAlle}
                  onClick={() => setVisAlle(false)}>
            Åbne forløb
          </button>
          <button type="button" role="tab" className="fc-fane" aria-selected={visAlle}
                  onClick={() => setVisAlle(true)}>
            Alle, inkl. udførte og afviste
          </button>
        </div>

        <Tabel
          kolonner={[
            { key: "nummer", label: "Nummer", render: (r) => <b>{r.nummer}</b> },
            { key: "kundeId", label: "Kunde", render: (r) => kundeNavn(r.kundeId) },
            { key: "rute", label: "Rute", render: (r) => `${r.fraSted} → ${r.tilSted}` },
            { key: "transporttype", label: "Type", render: (r) => TRANSPORTTYPE[r.transporttype] },
            { key: "onsketAfhentningMs", label: "Ønsket afhentning",
              render: (r) => dato(r.onsketAfhentningMs) },
            /* Etaper: antal og hvor mange der er åbne. En booking med åbne
               etaper må ikke se ud som en helt almindelig booking. */
            { key: "etaper", label: "Etaper", num: true, render: (r) => (r.antal
                ? <>{num(r.antal.ialt)}{r.antal.aabne > 0 && (
                    <> <Pille tone="warn">{r.antal.aabne} åbne</Pille></>)}</>
                : <span className="fc-neutral">—</span>) },
            /* TILSTAND, ikke en fri streng. Label og farve fra samme kilde. */
            { key: "vist", label: "Tilstand", render: (r) => (
                <>
                  <Pille tone={TILSTAND[r.vist]?.pill}>{TILSTAND[r.vist]?.label || r.vist}</Pille>
                  {r.drevet && (
                    <> <Pille tone="bad">lagret: {TILSTAND[r.tilstand]?.label}</Pille></>
                  )}
                </>) },
            { key: "omsaetningOere", label: "Omsætning", num: true,
              render: (r) => kr(r.omsaetningOere) },
            { key: "aabn", label: "", render: (r) => (r.forslag?.length
                ? <Link className="fc-a" to={`/booking/forslag/${r.id}`}>Se forslag</Link>
                : <span className="fc-neutral">—</span>) },
          ]}
          raekker={viste}
          tom="Ingen bookinger i udsnittet."
        />

        <p className="fc-hint" style={{ marginTop: 12 }}>
          Tilstanden er <b>genberegnet af etaperne</b> med <code>forloebstilstand()</code> —
          ikke læst af bookingens eget felt. Et forløb er først <b>udført</b> når hver
          eneste etape er det; er noget i hus og noget ikke, er det{" "}
          <Pille tone="warn">{TILSTAND.delvist.label}</Pille>.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Viser {num(viste.length)} af {num(raekker.length)} hentede bookinger i{" "}
          <b>{division}</b>. Tallene øverst kommer fra <code>kpi/</code> og dækker hele
          platformen — de skal ikke gå op mod tabellen.
        </p>
      </Kort>

      <Handlinger raekker={viste} perms={bruger?.perms} rolle={bruger?.rolle} />
    </div>
  );
}

/* ---- Hvad rollen må lige nu -------------------------------------------- */

/**
 * Knapperne GENERERES af tilstandsmaskinen plus permissions. Ingen håndskreven
 * knaprække — skifter man rolle i demo-vælgeren, ændrer listen sig af sig selv.
 */
function Handlinger({ raekker, perms, rolle }) {
  const grupper = raekker
    .map((r) => ({ r, muligheder: tilgaengeligeHandlinger(r.vist, perms) }))
    .filter((g) => g.muligheder.length > 0);

  return (
    <Kort titel={`Hvad du må lige nu — rolle: ${rolle || "ukendt"}`}>
      {grupper.length === 0 ? (
        <Tom>
          Din rolle har ingen tilgængelige tilstandsskift på de viste forløb.
          Det er ikke en fejl — en chauffør må hverken foreslå, godkende eller afvise.
        </Tom>
      ) : (
        <Tabel
          kolonner={[
            { key: "nummer", label: "Booking", render: (g) => <b>{g.r.nummer}</b> },
            { key: "tilstand", label: "Tilstand",
              render: (g) => <Pille tone={TILSTAND[g.r.vist]?.pill}>{TILSTAND[g.r.vist]?.label}</Pille> },
            { key: "handlinger", label: "Tilgængelige handlinger", render: (g) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {g.muligheder.map((m) => (
                    <Knap key={m.til} disabled
                          title={`Kræver ${m.kraeverPerm}. Skrivning er ikke bygget (fase 0).`}>
                      {m.handling}
                    </Knap>
                  ))}
                </div>) },
          ]}
          raekker={grupper}
          noegle={(g) => g.r.id}
        />
      )}
      <p className="fc-hint" style={{ marginTop: 12 }}>
        Listen er <b>genereret</b> af <code>tilgaengeligeHandlinger()</code> — tilstandens
        lovlige overgange, filtreret på dine permissions. Der findes ingen håndskreven
        knaprække, så en rolle kan ikke komme til at se en knap den ikke må bruge.
        Skift rolle i sidebaren og se listen ændre sig.
      </p>
    </Kort>
  );
}
