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
import { kr, num, dato, klokke } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Fejl, Datatilstand, Knap,
  Gitter, Handlingsliste, Ikon,
} from "../../fleet/ui.jsx";
import Stopoversigt from "../../fleet/Stopoversigt.jsx";
import { OPGAVE_STATUS } from "../../fleet/opgaver.js";
import {
  DEMO_OPGAVER, opgavePerson, opgaveEnhed,
} from "../../fleet/demo-opgaver.js";
import { TILSTAND, forloebstilstand, tilgaengeligeHandlinger } from "../../fleet/booking-state.js";
import { DEMO_BOOKINGER, TRANSPORTTYPE, demoEtaperPaa } from "../../fleet/demo-bookinger.js";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";

const kundeNavn = (id) => DEMO_KUNDER.find((k) => k.id === id)?.navn || id;

export default function BookingOversigt() {
  const { kpi: k, henter, fejl, tilstand, genindlaes } = useKpi();
  const { bruger, division } = useFleet();
  const [visAlle, setVisAlle] = useState(false);
  const [fane, setFane] = useState("opgaver");
  const [enhedFilter, setEnhedFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;

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

  /* ⚠ SAMME DIVISIONSREGEL SOM BOOKINGERNE, og den kommer fra shellen.
     Mockuppen havde et "Afdeling"-dropdown i skærmen; divisionen er shellens
     Gods/Bus (beslutning 9), og to steder at vælge den er to sandheder.
     En post uden division vises i BEGGE — se useListe. */
  const opgaverIDivision = DEMO_OPGAVER.filter(
    (o) => o.division == null || o.division === division || o.division === "faelles"
  );

  /* Skærmens EGNE filtre. Periode står ikke her — shellen ejer periodevælgeren,
     og den står allerede i topbaren. */
  const opgaver = opgaverIDivision
    .filter((o) => !enhedFilter || o.koeretoejId === enhedFilter)
    .filter((o) => !statusFilter || o.status === statusFilter)
    .sort((a, b) => a.startMs - b.startMs);

  /* Enheder der FAKTISK har en opgave i den valgte division — ikke hele
     flåden. Et filter med tomme valg lærer brugeren at filtre ikke virker.
     Filteret er på ENHED og ikke på kunde: en opgave hænger på et køretøj,
     fordi værkstedet servicerer egen flåde. */
  const enhedsvalg = [...new Set(opgaverIDivision.map((o) => o.koeretoejId).filter(Boolean))]
    .map((id) => ({ id, navn: opgaveEnhed(id) }))
    .sort((a, b) => a.navn.localeCompare(b.navn, "da"));

  /* Dagens plan udledes af opgaverne — det er ikke et nyt datasæt. */
  const dagStart = new Date(); dagStart.setHours(0, 0, 0, 0);
  const dagSlut = dagStart.getTime() + 86400000;
  const dagensPlan = opgaverIDivision
    .filter((o) => o.startMs >= dagStart.getTime() && o.startMs < dagSlut)
    .sort((a, b) => a.startMs - b.startMs);

  /* Stoppene er de steder arbejdet er PLANLAGT — ikke positioner. Beslutning 22.
     Byen kommer fra køretøjets stationering, som er det eneste sted vi ved
     hvor arbejdet foregår. */
  const stop = dagensPlan.map((o, i) => ({
    id: o.id, nr: i + 1,
    sted: o.sted || "Kolding",
    tekst: o.beskrivelse,
    tone: OPGAVE_STATUS[o.status]?.pill || "info",
  }));

  const KRAEVER = [
    { id: "forsinket", ikon: "ur", tone: "ikon-1", antal: k.opgaver.forsinkede,
      tekst: `${k.opgaver.forsinkede} forsinkede opgaver`,
      under: "Overskredet planlagt tid", til: "/booking" },
    { id: "dele", ikon: "kasse", tone: "ikon-2", antal: k.opgaver.afventer,
      tekst: `${k.opgaver.afventer} afventer dele`,
      under: "Kan først færdiggøres ved levering", til: "/indkoeb" },
    { id: "tid", ikon: "dokument", tone: "ikon-3", antal: k.opgaver.udenTidsregistrering,
      tekst: `${k.opgaver.udenTidsregistrering} uden tidsregistrering`,
      under: "Uden den er omkostningen stadig et estimat", til: "/booking" },
    { id: "faktura", ikon: "seddel", tone: "ikon-4", antal: k.opgaver.klarTilFakturering,
      /* ⚠ FORLØB, ikke opgaver. klarTilFakturering tæller afsluttede
         BOOKINGER — se Økonomi, hvor rækkerne er BKG-numre. Opgaver
         faktureres ikke; de er egen flådes omkostning. */
      tekst: `${k.opgaver.klarTilFakturering} forløb klar til fakturering`,
      under: "Afsluttede bookinger uden grundlag", til: "/oekonomi/fakturering" },
  ];

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        {/* Runde ikoner her, afrundede firkanter på Dashboard — det er
            mockuppernes egen forskel, og den er bevaret. Tonerne er
            IKONACCENTER: farven forstærker, tallet og teksten bærer. */}
        <KpiKort label="Nye bookinger" vaerdi={num(k.opgaver.nyeBookinger)}
                 ikon={<Ikon navn="kalender" />} tone="ikon-5" rund til="/booking/ny" />
        <KpiKort label="I gang i dag" vaerdi={num(k.opgaver.igangIDag)}
                 ikon={<Ikon navn="afspil" />} tone="ikon-6" rund
                 note={`${k.opgaver.planlagt} planlagt i dag`} />
        <KpiKort label="Forsinkede" vaerdi={num(k.opgaver.forsinkede)}
                 ikon={<Ikon navn="ur" />} tone="ikon-3" rund note="kræver opmærksomhed" />
        <KpiKort label="Ikke-faktureret" vaerdi={kr(k.oekonomi.ikkeFaktureretOere)}
                 ikon={<Ikon navn="seddel" />} tone="ikon-4" rund
                 note="kun færdige forløb" til="/oekonomi/fakturering" />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {/* Er det denormaliserede felt drevet, skal det siges — ikke skjules bag
          det genberegnede tal. */}
      {drevne.length > 0 && (
        <Fejl>
          {drevne.length} booking(er) har en lagret tilstand der ikke passer med
          etaperne. Feltet er denormaliseret og skrives af en Cloud Function; er
          det drevet, ser en fejl ud som om den lykkedes.
        </Fejl>
      )}

      {/* ⚠ FILTRE: KUNDE OG STATUS. Mockuppen havde også Periode og Afdeling.
          Periodevælgeren ejes af shellen og står i topbaren; divisionen er
          shellens Gods/Bus (beslutning 9). To steder at vælge det samme er to
          sandheder om hvad man ser. */}
      <Kort>
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="bo-enhed">Enhed</label>
            <select id="bo-enhed" value={enhedFilter} onChange={(e) => setEnhedFilter(e.target.value)}>
              <option value="">Alle enheder</option>
              {enhedsvalg.map((e2) => <option key={e2.id} value={e2.id}>{e2.navn}</option>)}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="bo-status">Status</label>
            <select id="bo-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Alle</option>
              {Object.entries(OPGAVE_STATUS).map(([v, s]) => (
                <option key={v} value={v}>{s.label}</option>
              ))}
            </select>
          </div>
          <Knap onClick={() => { setEnhedFilter(""); setStatusFilter(""); }}>Nulstil</Knap>
          <p className="fc-hint" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            Periode og afdeling vælges i topbaren — de gælder hele platformen.
          </p>
        </div>
      </Kort>

      <Kort
        titel={fane === "opgaver" ? `Alle opgaver (${opgaver.length})` : "Bookinger"}
        handling={fane === "opgaver"
          ? <Link className="fc-a" to="/oekonomi/fakturering">Til fakturagrundlag</Link>
          : <Link className="fc-a" to="/booking/ny">Ny forespørgsel</Link>}
      >
        {/* To modeller, to faner. En booking er et transportforløb med etaper
            (beslutning 16); en opgave er værksteds- eller facilityarbejde
            (beslutning 21). At vise dem i én tabel ville kræve en tredje
            model der ikke findes. */}
        <div className="fc-faner" role="tablist" aria-label="Udsnit">
          <button type="button" role="tab" className="fc-fane" aria-selected={fane === "opgaver"}
                  onClick={() => setFane("opgaver")}>
            Opgaver
          </button>
          <button type="button" role="tab" className="fc-fane" aria-selected={fane === "bookinger"}
                  onClick={() => setFane("bookinger")}>
            Bookinger
          </button>
        </div>

        {fane === "opgaver" ? (
          <Tabel
            raekker={opgaver}
            tom="Ingen opgaver med de valgte filtre."
            kolonner={[
              { key: "startMs", label: "Dato",
                render: (o) => `${dato(o.startMs)} ${klokke(o.startMs)}` },
              { key: "beskrivelse", label: "Opgave" },
              { key: "personId", label: "Chauffør / tekniker",
                render: (o) => opgavePerson(o.personId) },
              { key: "koeretoejId", label: "Enhed",
                render: (o) => opgaveEnhed(o.koeretoejId) || <span className="fc-neutral">—</span> },
              /* Status fra OPGAVE_STATUS — label OG farve fra samme kilde, så
                 to skærme ikke kan kalde samme tilstand noget forskelligt. */
              { key: "status", label: "Status", render: (o) => (
                  <Pille tone={OPGAVE_STATUS[o.status]?.pill}>
                    {OPGAVE_STATUS[o.status]?.label || o.status}
                  </Pille>) },
              { key: "estimeretMin", label: "Estimeret tid", num: true,
                render: (o) => timer(o.estimeretMin) },
              /* Mangler faktisk tid er ikke "0" — det er ikke registreret endnu,
                 og det er præcis det "uden tidsregistrering" tæller. */
              { key: "faktiskMin", label: "Faktisk tid", num: true,
                render: (o) => (o.faktiskMin == null
                  ? <span className="fc-neutral">—</span> : timer(o.faktiskMin)) },
              /* OMKOSTNING, ikke beløb. Værkstedet servicerer egen flåde, så
                 arbejdet er en udgift — ikke noget der faktureres videre. To
                 tal der begge hed "beløb" ville blive lagt sammen; det er
                 beslutning 11's fejl i en tabel. */
              { key: "beloebOere", label: "Estimeret omkostning", num: true,
                render: (o) => kr(o.beloebOere) },
            ]}
          />
        ) : (
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
        )}

        {fane === "opgaver" && (
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Opgaver er arbejde på <b>egen flåde</b> — derfor ingen kunde og ingen
            fakturerbarhed. Beløbet er en <b>omkostning</b>. Det der faktureres, er{" "}
            <b>bookinger</b>; de står i fanen ved siden af med deres egen omsætning.
          </p>
        )}

        {fane === "bookinger" && (
        <>
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
        </>
        )}
      </Kort>

      <Gitter kolonner="minmax(0,1fr) minmax(0,1.6fr) minmax(0,1fr)">
        <Kort titel="Kræver handling"
              handling={<Link className="fc-a" to="/booking">Se alle</Link>}>
          <Handlingsliste poster={KRAEVER} />
        </Kort>

        <Kort titel="Dagens plan — overblik"
              handling={<Link className="fc-a" to="/booking/disponering">Se fuld plan</Link>}>
          {dagensPlan.length === 0 ? (
            <Tom>Ingen opgaver planlagt i dag.</Tom>
          ) : (
            <ul className="fc-plan">
              {dagensPlan.map((o) => (
                <li key={o.id}>
                  <span className="fc-plan-tid">{klokke(o.startMs)}</span>
                  <span className="fc-plan-kunde">{opgaveEnhed(o.koeretoejId) || "Facility"}</span>
                  <span className="fc-plan-opgave">{o.beskrivelse}</span>
                  <span className="fc-plan-person">{opgavePerson(o.personId)}</span>
                  <Pille tone={OPGAVE_STATUS[o.status]?.pill}>
                    {OPGAVE_STATUS[o.status]?.label || o.status}
                  </Pille>
                </li>
              ))}
            </ul>
          )}
        </Kort>

        <Kort titel="Hvor arbejdet ligger i dag">
          <Stopoversigt stop={stop} />
        </Kort>
      </Gitter>

      <Handlinger raekker={viste} perms={bruger?.perms} rolle={bruger?.rolle} />
    </div>
  );
}

/* Minutter som timer med én decimal — "1,5 t", som mockuppen. Tiden gemmes i
   minutter; visningsformatet hører her og ikke i datasættet. */
const timer = (min) => (min == null ? "—" : `${(min / 60).toFixed(1).replace(".", ",")} t`);

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
