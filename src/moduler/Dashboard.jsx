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

/* Stregikoner, 24×24, samme streg som sidebarens ICO i AppShell.
   Tegnene "!", "▲", "kr" var pladsholdere — mockuppen har rigtige ikoner. */
const IKON = {
  dokument: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4",
  lastbil: "M3 16V7h11v9M14 10h4l3 3v3h-7M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4m11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  ur: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18",
  seddel: "M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 9h.01M18 15h.01",
  skruenoegle: "M14.7 6.3a4 4 0 0 1 5 5l-9.4 9.4a2 2 0 0 1-2.8-2.8l9.4-9.4M14.7 6.3 11 2.6a4 4 0 0 0-5 5l3.7 3.7",
  personer: "M16 20v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 20v-2a3 3 0 0 0-2-2.8",
  bygning: "M4 21V5l8-3v19M12 21h8V9l-8-3M7 9h1m-1 4h1m-1 4h1",
  vogn: "M3 4h2l2.5 11h10L21 7H6M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2m8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
};

const Ikon = ({ navn }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={IKON[navn]} /></svg>
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

        <Kort titel={<><Ikon navn="personer" /> Bemanding i dag</>}
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

        <Kort titel={<><Ikon navn="vogn" /> Indkøb</>}
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
