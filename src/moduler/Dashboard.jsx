/* src/moduler/Dashboard.jsx
 * REFERENCEMODUL. Sådan ser et modul ud i v3.
 *
 * Læg mærke til hvad der IKKE er her: ingen sidebar, ingen tenant-vælger,
 * ingen periodevælger, ingen egen Firebase-init, ingen egne farver, ingen
 * håndskrevne afvigelsesstrenge, ingen egne nøgletal.
 *
 * Alle tal på Dashboard er de SAMME felter som modulerne selv læser. Derfor
 * kan Dashboard ikke længere sige "3 servicepunkter forfalder" mens Facility
 * siger 18 — det var tilfældet i mockupsene.
 */
import { Link } from "react-router-dom";
import { useKpi } from "../fleet/useKpi.js";
import { useFleet } from "../fleet/FleetContext.jsx";
import { kr, num, pct, dato, deviation, deviationPct } from "../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, MiniLinje, Gitter, Donut,
} from "../fleet/ui.jsx";

/* Fordelingen af opgaver på tilstand. Felterne findes i kpi/ — de tælles ikke
   ud af en hentet liste, for en liste er et udsnit i en periode og ikke en
   total (beslutning 6). Rækkefølgen er forløbets, ikke størrelsens: farven
   følger tilstanden, så den ikke skifter når tallene gør.
   'aabne' er IKKE summen af de fem — den tæller de uafsluttede. Totalen
   udregnes derfor af delene. */
const STATUSFORDELING = (k) => [
  { navn: "Indberettet", antal: k.opgaver.indberettet },
  { navn: "Planlagt", antal: k.opgaver.planlagt },
  { navn: "I gang", antal: k.opgaver.igang },
  { navn: "Afventer", antal: k.opgaver.afventer },
  { navn: "Udført", antal: k.opgaver.udfoert },
];

/* ⚠ MASSIVE IKONER, IKKE STREGTEGNEDE. Mockuppens glyffer er fyldte —
   sidebarens ICO i AppShell er konturer, og de to skal ikke forveksles: her
   sidder ikonet på en farvet flade og skal have vægt, dér står det på mørk
   bund ved siden af tekst og skal være let.
   Detaljerne — linjer i dokumentet, hjulnav, urets visere — er HULLER
   (fill-rule evenodd), så de viser feltets tone igennem frem for at være
   malet i en farve der skulle kende sit felt. */
const IKON = {
  dokument: "M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.8V8h4.2L14 3.8zM8 12.4h8v1.7H8zm0 3.6h5.4v1.7H8z",
  lastbil: "M2 6h12v9.2H2zm13 3h3.6l2.6 3.1v3.1H15zM6.8 20.4a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2zm0-1.7a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8zm11.4 1.7a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2zm0-1.7a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8z",
  ur: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm1 4.4h-2v6.7l4.7 2.8 1-1.7-3.7-2.2z",
  seddel: "M2 5h20v14H2zm10 10.4a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8zM5 7.6h2.2v1.7H5zm11.8 7.1H19v1.7h-2.2z",
  skruenoegle: "M15.4 2a6 6 0 0 0-5.6 8.1l-7 7a2.6 2.6 0 0 0 3.7 3.7l7-7A6 6 0 0 0 21.4 8l-3.2 3.2-2.5-.7-.7-2.5L18.2 4.8A6 6 0 0 0 15.4 2z",
  personer: "M9.2 11.4a4.1 4.1 0 1 1 0-8.2 4.1 4.1 0 0 1 0 8.2zm0 1.5c3.1 0 6.2 1.6 6.2 4.1V20H3v-3c0-2.5 3.1-4.1 6.2-4.1zm8.3-1.2a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6zm-.6 2c2.4 0 4.1 1.3 4.1 3.3V20h-4v-3c0-1.2-.5-2.2-1.3-3 .4-.2.8-.3 1.2-.3z",
  bygning: "M4 21.5V4.2L12.4 2v19.5H4zm3-13h2.4v2.2H7zm0 4.2h2.4v2.2H7zm0 4.2h2.4v2.2H7zM13.8 21.5V7.4l6.6 2.1v12H13.8zm2-9.4h2.4v2.2h-2.4zm0 4.2h2.4v2.2h-2.4z",
  vogn: "M1.6 2.6h3.6l.7 2.6h16.5l-2.6 9.2H7.7l.2.9h12v2.1H6.2L3.5 4.7H1.6zM9.4 21.4a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm8.4 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z",
};

/* farve er valgfri og peger paa et token — korttitlernes ikoner er farvede i
   mockuppen, ikke daempede. Uden farve arver ikonet .fc-card-h svg. */
const Ikon = ({ navn, farve }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" style={farve ? { color: farve } : undefined}>
    <path d={IKON[navn]} fillRule="evenodd" />
  </svg>
);

/* ⚠ TONERNE HER ER IKONACCENTER, IKKE STATUS- ELLER SERIEFARVER.
   Farven forstærker; tallet, teksten og linket bærer betydningen alene.
   Derfor må de fem ikke genbruges i en graf — mockuppens rød og orange
   ligger ΔE 7,1 fra hinanden og ville dumpe validatorens gulv, netop fordi
   farven dér ER encodingen. Se beslutning 30. */
const HANDLINGER = (k) => [
  { n: 3, t: "nye indberetninger", til: "/flaade/indberetninger", link: "Se indberetninger", tone: "ikon-1", ikon: "dokument" },
  { n: k.flaade.udeAfDrift, t: "køretøjer ude af drift", til: "/flaade", link: "Se køretøjer", tone: "ikon-2", ikon: "lastbil" },
  { n: k.opgaver.forsinkede, t: "opgaver forsinket", til: "/booking", link: "Se opgaver", tone: "ikon-3", ikon: "ur" },
  { n: k.indkoeb.fakturaerTilGodkendelse, t: "fakturaer til godkendelse", til: "/indkoeb/fakturaer", link: "Se fakturaer", tone: "ikon-4", ikon: "seddel" },
  { n: k.facility.servicepunkterForfalder, t: "servicepunkter forfalder", til: "/facility/servicekalender", link: "Se servicekalender", tone: "ikon-5", ikon: "skruenoegle" },
];

/* division står eksplicit på hver post — ingen arver en default.
   Port 3 er "faelles": porten er den samme uanset om det er en lastbil
   eller en bus der skal igennem den, så opgaven står på begge lister.
   Fælles omkostninger skal fordeles før de kan læses som divisionens egne —
   fordelingsnøglen er udskudt, se beslutning 15. */
const OPGAVER = [
  { id: 1, ms: Date.now() - 3 * 864e5, division: "gods", enhed: "Bil 155", type: "Reparation", besk: "Palleløfter vil ikke løfte", ansv: "Lars Aage", status: "Indberettet", tone: "warn", est: 650000, alvor: "hoej" },
  { id: 2, ms: Date.now() - 4 * 864e5, division: "gods", enhed: "Bil 104", type: "Service", besk: "Serviceeftersyn 30.000 km", ansv: "Rene Thomsen", status: "Planlagt", tone: "info", est: 320000, alvor: "mellem" },
  { id: 3, ms: Date.now() - 5 * 864e5, division: "faelles", enhed: "Porte – Port 3", type: "Facility", besk: "Port lukker langsomt", ansv: "Benjamin", status: "Afventer", tone: "warn", est: 480000, alvor: "hoej" },
  { id: 4, ms: Date.now() - 6 * 864e5, division: "gods", enhed: "Lastbil 106", type: "Reparation", besk: "Motorlampe lyser", ansv: "Lars Aage", status: "I gang", tone: "ok", est: 1200000, alvor: "hoej" },
  { id: 5, ms: Date.now() - 7 * 864e5, division: "gods", enhed: "Truck 2", type: "Service", besk: "Gaffeljustering og smøring", ansv: "Benjamin", status: "Planlagt", tone: "info", est: 180000, alvor: "lav" },
  { id: 6, ms: Date.now() - 8 * 864e5, division: "bus", enhed: "Bus 12", type: "Reparation", besk: "Fordør lukker ikke i", ansv: "Rene Thomsen", status: "Indberettet", tone: "warn", est: 540000, alvor: "hoej" },
];

export default function Dashboard() {
  const { kpi: k, henter, fejl, tilstand, genindlaes } = useKpi();
  const { division } = useFleet();

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;

  /* Afledte tal BEREGNES her — de skrives ikke ind i basen to steder.
     Det er derfor kapacitetsgraden ikke længere kan være 84 % på Dashboard
     og 83 % i Bemanding. */
  const budgetAfvPct = deviationPct(k.oekonomi.driftsomkostningerOere, k.oekonomi.budgetOere);
  const kapacitet = (k.bemanding.disponeret / k.bemanding.planlagt) * 100;

  /* Samme visningsregel som useListe: valgt division plus fælles. */
  const opgaver = OPGAVER.filter((o) => o.division === division || o.division === "faelles");

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Kræver handling">
        <KpiRaekke>
          {HANDLINGER(k).map((h) => (
            <div key={h.t} className="fc-card fc-kpi" style={{ boxShadow: "none" }}>
              <div className={`fc-kpi-ico fc-tone-${h.tone}`}><Ikon navn={h.ikon} /></div>
              <div className="fc-kpi-txt">
                <div style={{ fontWeight: 650 }}>{h.n} {h.t}</div>
                <Link className="fc-a" style={{ fontSize: 12.5 }} to={h.til}>{h.link}</Link>
              </div>
            </div>
          ))}
        </KpiRaekke>
      </Kort>

      <KpiRaekke>
        <KpiKort label="Åbne opgaver" vaerdi={num(k.opgaver.aabne)} />
        <KpiKort label="Nedetid" vaerdi={pct(k.flaade.nedetidPct, 1)}
                 afvigelse={deviation(-0.6, { betterWhen: "lower", unit: "pct" })} note="%-point" />
        <KpiKort label="Driftsomkostninger" vaerdi={kr(k.oekonomi.driftsomkostningerOere)}
                 afvigelse={deviation(budgetAfvPct, { betterWhen: "lower", unit: "pct" })} note="vs. budget" />
        <KpiKort label="Omkostning pr. km" vaerdi={kr(k.flaade.omkostningPrKmOere, 2)}
                 afvigelse={deviation(k.flaade.omkostningPrKmDeltaOere / 100, { betterWhen: "lower", dec: 2 })}
                 note="vs. sidste periode" />
        {/* Planlagt vs. akut vedligehold — feltet fandtes i kpi/ hele tiden.
            Budgetafvigelsen er ikke tabt: den beregnes ÉN gang og vises på
            Økonomi, hvor fortegnskonventionen fra beslutning 3 hører hjemme.
            Her stod den som det femte kort uden at være i mockuppen. */}
        <KpiKort label="Planlagt vs. akut vedligehold"
                 vaerdi={`${pct(k.oekonomi.planlagtVedligeholdPct)} / ${pct(100 - k.oekonomi.planlagtVedligeholdPct)}`}
                 note={`Mål ${pct(70)} / ${pct(30)}`} />
        <KpiKort label="Ikke-faktureret" vaerdi={kr(k.oekonomi.ikkeFaktureretOere)}
                 note="ekskl. moms" />
      </KpiRaekke>

      {/* Midterrækken. auto-fit, så kortet fylder pænt alene nu og de to
          øvrige (Omkostninger pr. måned, Største afvigelser) glider ind ved
          siden af uden endnu en layoutændring. */}
      <Gitter kolonner="repeat(auto-fit, minmax(320px, 1fr))">
        <Kort titel="Status på opgaver"
              handling={<Link className="fc-a" to="/booking">Se alle opgaver</Link>}>
          <Donut dele={STATUSFORDELING(k)} format={num} midteTekst="i alt" />
        </Kort>
      </Gitter>

      <Gitter kolonner="minmax(0,2fr) repeat(3, minmax(0,1fr))">
        <Kort titel="Åbne opgaver der kræver opfølgning"
              handling={<Link className="fc-a" to="/booking">Se alle opgaver</Link>}>
          <Tabel
            kolonner={[
              { key: "ms", label: "Dato", render: (r) => dato(r.ms) },
              { key: "enhed", label: "Enhed", render: (r) => <b>{r.enhed}</b> },
              { key: "type", label: "Type" },
              { key: "besk", label: "Beskrivelse" },
              { key: "ansv", label: "Ansvarlig" },
              { key: "status", label: "Status", render: (r) => <Pille tone={r.tone}>{r.status}</Pille> },
              { key: "est", label: "Estimat", num: true, render: (r) => kr(r.est) },
              { key: "alvor", label: "Prioritet", render: (r) => (
                  <Pille tone={r.alvor === "hoej" ? "bad" : r.alvor === "mellem" ? "warn" : "ok"}>
                    {r.alvor === "hoej" ? "Høj" : r.alvor === "mellem" ? "Mellem" : "Lav"}
                  </Pille>) },
            ]}
            raekker={opgaver}
            tom="Ingen åbne opgaver i perioden."
          />
        </Kort>

        <Kort titel={<><Ikon navn="personer" farve="var(--fc-ikon-5)" /> Bemanding i dag</>}
              handling={<Link className="fc-a" to="/bemanding">Se bemanding</Link>}>
          <MiniLinje label="Chauffører disponeret"
                     vaerdi={`${k.bemanding.chauffoerDisponeret} / ${k.bemanding.chauffoerPlanlagt}`} />
          <MiniLinje label="Underbemandede vagter" vaerdi={k.bemanding.underbemandede} />
          <MiniLinje label="Ledig kapacitet" vaerdi={`${k.bemanding.ledig} personer`} />
          <MiniLinje label="Kapacitetsgrad" vaerdi={pct(kapacitet, 0)} />
        </Kort>

        <Kort titel={<><Ikon navn="bygning" /> Facility</>}
              handling={<Link className="fc-a" to="/facility">Gå til Facility</Link>}>
          <MiniLinje label="Servicepunkter forfalder" vaerdi={k.facility.servicepunkterForfalder} />
          <MiniLinje label="Åbne facility-sager" vaerdi={k.facility.aabneSager} />
          <MiniLinje label="Planlagt vedligehold" vaerdi={k.facility.planlagtVedligehold} />
          <MiniLinje label="Aktiver i drift" vaerdi={num(k.facility.aktiver)} />
        </Kort>

        <Kort titel={<><Ikon navn="vogn" farve="var(--fc-ikon-2)" /> Indkøb</>}
              handling={<Link className="fc-a" to="/indkoeb">Gå til Indkøb</Link>}>
          <MiniLinje label="Fakturaer til godkendelse" vaerdi={k.indkoeb.fakturaerTilGodkendelse} />
          <MiniLinje label="Åbne ordrer" vaerdi={k.indkoeb.aabneOrdrer} />
          {/* Indkøbsprisafvigelse — leverandørsiden, betterWhen 'lower'. Ikke det
              samme tal som salgsprisafvigelsen på Kunder & Priser. */}
          <MiniLinje label="Indkøbsprisafvigelse (snit)"
                     vaerdi={deviation(k.indkoeb.indkoebsprisafvigelseSnitPct, { betterWhen: "lower", unit: "pct" }).text} />
          <MiniLinje label="Leverance til tiden" vaerdi={pct(k.indkoeb.leveranceTilTidenPct)} />
        </Kort>
      </Gitter>

      <p className="fc-hint">Alle beløb er ekskl. moms, medmindre andet er angivet.</p>
    </div>
  );
}
