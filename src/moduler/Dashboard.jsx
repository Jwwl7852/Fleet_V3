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
import { DEMO_DASHBOARD_OPGAVER } from "../fleet/demo-dashboard.js";
import { omkostningsserie, maanedsEtiketter } from "../fleet/demo-oekonomi.js";
import { kr, num, pct, dato, deviation, deviationPct, INTET } from "../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, MiniLinje, Gitter, Donut, Soejlegraf, Tom, Fordelingsbjaelke, Ikon
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

/* ⚠ TONERNE HER ER IKONACCENTER, IKKE STATUS- ELLER SERIEFARVER.
   Farven forstærker; tallet, teksten og linket bærer betydningen alene.
   Derfor må de fem ikke genbruges i en graf — mockuppens rød og orange
   ligger ΔE 7,1 fra hinanden og ville dumpe validatorens gulv, netop fordi
   farven dér ER encodingen. Se beslutning 30. */
const HANDLINGER = (k) => [
  /* ⚠ HER STOD n: 3 — ET HARDKODET TAL. Kortet sagde "3 nye indberetninger"
     uanset hvad basen indeholdt, og det gjorde det i hver eneste tenant.
     Reglen i CLAUDE.md er klar: mangler feltet i kpi/, defineres det i
     demo-kpi.js — det hardkodes ikke i en skærm. Hardkoder man, har man to
     opgaver senere i stedet for én, og imens står der et tal ingen kan spore.

     ⚠ OG NODEN FINDES. `indberetninger` har regler og et indeks, men INTET
     seeder den — den sjette node i den tilstand. Feltet er derfor null her og
     får sin kilde samtidig med seedet. */
  { n: k.flaade.nyeIndberetninger, t: "nye indberetninger", til: "/flaade/indberetninger", link: "Se indberetninger", tone: "ikon-1", ikon: "dokument" },
  { n: k.flaade.udeAfDrift, t: "enheder ude af drift", til: "/opsaetning/enheder", link: "Se enheder", tone: "ikon-2", ikon: "lastbil" },
  { n: k.opgaver.forsinkede, t: "opgaver forsinket", til: "/booking", link: "Se opgaver", tone: "ikon-3", ikon: "ur" },
  { n: k.indkoeb.fakturaerTilGodkendelse, t: "fakturaer til godkendelse", til: "/indkoeb/fakturaer", link: "Se fakturaer", tone: "ikon-4", ikon: "seddel" },
  { n: k.facility.servicepunkterForfalder, t: "servicepunkter forfalder", til: "/facility/servicekalender", link: "Se servicekalender", tone: "ikon-5", ikon: "skruenoegle" },
];


/**
 * Et beløb — eller INTET hvis det ikke er regnet.
 *
 * ⚠ kr() SKELNER IKKE MELLEM NUL OG UBESVARET, og det er en beslutning:
 * `kr(0)` er "0 kr." og et rigtigt beløb, så kun kalderen kan vide om nul er
 * et svar. Her er det ikke — og uden den her gate stod Dashboardet med
 * "0 kr." i driftsomkostninger for en base hvor tallet aldrig var regnet.
 *
 * ⚠ DEN BLEV FØRST SYNLIG DA kpi/ HOLDT OP MED AT VÆRE SEEDET. Så længe
 * provisioneringen skrev DEMO_KPI, havde hvert felt en værdi, og forskellen
 * mellem "nul" og "ikke regnet" fandtes ikke på skærmen.
 */
const beloebEllerIntet = (oere, dec) =>
  (Number.isFinite(oere) ? kr(oere, dec) : INTET);

export default function Dashboard() {
  const { kpi: k, henter, tilstand, genindlaes } = useKpi();
  const { division } = useFleet();

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;

  /* Afledte tal BEREGNES her — de skrives ikke ind i basen to steder.
     Det er derfor kapacitetsgraden ikke længere kan være 84 % på Dashboard
     og 83 % i Bemanding. */
  const budgetAfvPct = deviationPct(k.oekonomi.driftsomkostningerOere, k.oekonomi.budgetOere);
  const kapacitet = (k.bemanding.disponeret / k.bemanding.planlagt) * 100;

  /* Seks måneder, ikke tolv: kortet er en tredjedel bredt, og tolv søjler
     dér bliver til striber. Serien og etiketterne kommer fra demo-oekonomi,
     så Dashboard og Økonomi viser de SAMME måneder og de samme tal — lå
     regnestykket to steder, kunne de vise hver sit.
     Sidste punkt er det aktuelle tal fra kpi/, som på Økonomi. */
  /* Beregnes ÉN gang — både farven og pilen skal komme fra samme deviation(),
     ellers kan tallet være rødt og pilen pege den anden vej. */
  const prisafv = deviation(k.indkoeb.indkoebsprisafvigelseSnitPct, { betterWhen: "lower", unit: "pct" });

  const { historik } = omkostningsserie(division);
  const serie = [...historik, k.oekonomi.driftsomkostningerOere].slice(-6);
  const maanedsPunkter = maanedsEtiketter(6).map((m, i) => ({
    label: m, vaerdier: [serie[i]]
  }));

  /* Samme visningsregel som useListe: valgt division plus fælles. */
  const opgaver = DEMO_DASHBOARD_OPGAVER.filter((o) => o.division === division || o.division === "faelles");

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Kræver handling">
        <KpiRaekke>
          {HANDLINGER(k).map((h) => (
            <div key={h.t} className="fc-card fc-kpi" style={{ boxShadow: "none" }}>
              <div className={`fc-kpi-ico fc-tone-${h.tone}`}><Ikon navn={h.ikon} /></div>
              <div className="fc-kpi-txt">
                {/* ⚠ {null} RENDERER INGENTING. Kortet stod med "køretøjer
                    ude af drift" og INTET tal foran — ikke en streg, ikke et
                    nul, bare et hul hvor tallet skulle være. React skriver
                    ingenting for null, og teksten så ud som en overskrift.
                    num() er den ene markør; se format.js. */}
                <div style={{ fontWeight: 650 }}>{num(h.n)} {h.t}</div>
                <Link className="fc-a" style={{ fontSize: 12.5 }} to={h.til}>{h.link}</Link>
              </div>
            </div>
          ))}
        </KpiRaekke>
      </Kort>

      <KpiRaekke>
        <KpiKort label="Åbne opgaver" vaerdi={num(k.opgaver.aabne)} />
        {/* ⚠ HER STOD deviation(-0.6, …) — ET HARDKODET DELTA. Kortet viste
            "↘ −0,6 %-point" under en nedetid der var UBESVARET: en pil der
            pegede et sted ingen kunne genfinde, og som pegede samme vej i hver
            eneste tenant. Værre end det hardkodede antal ovenfor, fordi en
            afvigelse LIGNER en måling af noget der har ændret sig. */}
        <KpiKort label="Nedetid" vaerdi={pct(k.flaade.nedetidPct, 1)}
                 afvigelse={deviation(k.flaade.nedetidDeltaPoint, { betterWhen: "lower", unit: "pct" })}
                 note="%-point" />
        {/* ⚠ kr() SKELNER IKKE — og det er med vilje: kun KALDEREN ved om nul
            er et svar. Her er det ikke. Uden gaten stod der "0 kr." for et
            tal ingen har regnet, og nul kroner i driftsomkostninger er en
            påstand om en vognmand der ikke bruger penge. Se format.js. */}
        <KpiKort label="Driftsomkostninger" vaerdi={beloebEllerIntet(k.oekonomi.driftsomkostningerOere)}
                 afvigelse={deviation(budgetAfvPct, { betterWhen: "lower", unit: "pct" })} note="vs. budget" />
        {/* ⚠ null / 100 ER 0, IKKE null. Divisionen gik uden om deviation()s
            gate, og kortet skrev "0,00 vs. sidste periode" for et delta der
            aldrig var regnet. Regnestykker paa null giver STILLE et tal —
            se noten ved deviationPct() i format.js. */}
        <KpiKort label="Omkostning pr. km" vaerdi={beloebEllerIntet(k.flaade.omkostningPrKmOere, 2)}
                 afvigelse={deviation(
                   Number.isFinite(k.flaade.omkostningPrKmDeltaOere)
                     ? k.flaade.omkostningPrKmDeltaOere / 100 : null,
                   { betterWhen: "lower", dec: 2 })}
                 note="vs. sidste periode" />
        {/* Planlagt vs. akut vedligehold — feltet fandtes i kpi/ hele tiden.
            Budgetafvigelsen er ikke tabt: den beregnes ÉN gang og vises på
            Økonomi, hvor fortegnskonventionen fra beslutning 3 hører hjemme.
            Her stod den som det femte kort uden at være i mockuppen. */}
        {/* ⚠ 100 − null ER 100, IKKE NaN. null bliver til 0 i et minusstykke,
            og kortet skrev derfor "— / 100 %": den ene halvdel ubesvaret, den
            anden skråsikker. To tal der summerer til 100 skal mangle SAMMEN.
            En JSX-kommentar kan i øvrigt ikke stå MELLEM to attributter — den
            læses som et spread, og byggeriet siger 'Expected "..."'. */}
        <KpiKort label="Planlagt vs. akut vedligehold"
                 vaerdi={`${pct(k.oekonomi.planlagtVedligeholdPct)} / ${
                   Number.isFinite(k.oekonomi.planlagtVedligeholdPct)
                     ? pct(100 - k.oekonomi.planlagtVedligeholdPct) : INTET}`}
                 ekstra={<Fordelingsbjaelke pct={k.oekonomi.planlagtVedligeholdPct} />}
                 note={`Mål ${pct(70)} / ${pct(30)}`} />
        <KpiKort label="Ikke-faktureret" vaerdi={beloebEllerIntet(k.oekonomi.ikkeFaktureretOere)}
                 note="ekskl. moms" />
      </KpiRaekke>

      {/* Midterrækken. auto-fit, så kortet fylder pænt alene nu og de to
          øvrige (Omkostninger pr. måned, Største afvigelser) glider ind ved
          siden af uden endnu en layoutændring. */}
      <Gitter kolonner="repeat(auto-fit, minmax(320px, 1fr))">
        <Kort titel="Omkostninger pr. måned">
          <Soejlegraf
            punkter={maanedsPunkter}
            serier={[{ navn: "Driftsomkostninger", tone: "brand" }]}
            maal={{ vaerdi: k.oekonomi.budgetOere, navn: "Budget" }}
            format={(v) => kr(v)}
            hoejde={148}
          />
        </Kort>

        <Kort titel="Status på opgaver"
              handling={<Link className="fc-a" to="/booking">Se alle opgaver</Link>}>
          <Donut dele={STATUSFORDELING(k)} format={num} midteTekst="i alt" />
        </Kort>

        {/* ⚠ FELTET KAN MANGLE, OG SKÆRMEN SKAL TÅLE DET.
            `afvigelser` står på KPI-efterslæbet: aggregeringen er ikke bygget,
            så en ægte kpi/-node har det ikke endnu. useKpi returnerer nodens
            værdi når den findes — og så er demo-sættets felt ikke med.
            Det gælder ethvert efterslæbsfelt: definér det i demo-kpi.js, OG
            lad skærmen kunne stå uden det. Et .map() på undefined giver en
            hvid skærm, ikke et manglende kort. */}
        <Kort titel="Største afvigelser"
              handling={<Link className="fc-a" to="/oekonomi">Se alle afvigelser</Link>}>
          {!k.afvigelser?.length ? (
            <Tom>Afvigelser aggregeres endnu ikke. Se KPI-efterslæbet i README.</Tom>
          ) : (
          <ol className="fc-afvig">
            {k.afvigelser.map((a) => (
              <li key={a.id}>
                <div className="fc-afvig-txt">
                  <b>{a.emne}</b>
                  <span>{a.kilde}</span>
                </div>
                {/* Afvigelsen skrives ALDRIG som en håndlavet streng — så ville
                    + være rødt her og grønt et andet sted. betterWhen 'lower':
                    en overskridelse er dårlig, uanset om det er kroner eller
                    procent. */}
                {a.beloebOere != null && (
                  <span className="fc-afvig-tal fc-bad">
                    {deviation(a.beloebOere, { betterWhen: "lower", unit: "kr" }).text}
                  </span>
                )}
                {a.pct != null && (
                  <span className="fc-afvig-tal fc-bad">
                    {deviation(a.pct, { betterWhen: "lower", unit: "pct" }).text}
                  </span>
                )}
                <Pille tone={a.alvor === "hoej" ? "bad" : a.alvor === "mellem" ? "warn" : "ok"}>
                  {a.alvor === "hoej" ? "Høj" : a.alvor === "mellem" ? "Mellem" : "Lav"}
                </Pille>
              </li>
            ))}
          </ol>
          )}
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

        <Kort titel={<><Ikon navn="personer" farve="var(--fc-ikon-5)" /> Workforce i dag</>}
              handling={<Link className="fc-a" to="/bemanding">Se Workforce</Link>}>
          {/* Bjælke KUN hvor der findes en nævner. "10 personer ledig" har
              ingen helhed at være en andel af, og en bjælke uden nævner ville
              være pynt der ligner en måling. */}
          {/* ⚠ EN TEMPLATE-STRENG SKRIVER ORDET "null". Linjerne stod med
              "null / null" og "null personer" i det øjeblik aggregeringen holdt
              op med at gætte. num() er den ene markør — se format.js. */}
          <MiniLinje label="Chauffører disponeret"
                     vaerdi={`${num(k.bemanding.chauffoerDisponeret)} / ${num(k.bemanding.chauffoerPlanlagt)}`}
                     andel={k.bemanding.chauffoerDisponeret / k.bemanding.chauffoerPlanlagt} />
          <MiniLinje label="Underbemandede vagter" vaerdi={k.bemanding.underbemandede}
                     prik={k.bemanding.underbemandede ? "bad" : "ok"} />
          <MiniLinje label="Ledig kapacitet"
                     vaerdi={Number.isFinite(k.bemanding.ledig)
                       ? `${num(k.bemanding.ledig)} personer` : INTET} />
          <MiniLinje label="Kapacitetsgrad" vaerdi={pct(kapacitet, 0)}
                     andel={kapacitet / 100} />
        </Kort>

        <Kort titel={<><Ikon navn="bygning" /> Facility</>}
              handling={<Link className="fc-a" to="/facility">Gå til Facility</Link>}>
          {/* Prikken siger hvor slemt tallet er — den er STATUS og bæres
              altid sammen med tekst og tal. Tærsklerne er de samme som
              Facility selv bruger. */}
          <MiniLinje label="Servicepunkter forfalder" vaerdi={k.facility.servicepunkterForfalder}
                     prik={k.facility.servicepunkterForfalder > 10 ? "bad" : k.facility.servicepunkterForfalder ? "warn" : "ok"} />
          <MiniLinje label="Åbne facility-sager" vaerdi={k.facility.aabneSager}
                     prik={k.facility.aabneSager > 5 ? "warn" : "ok"} />
          <MiniLinje label="Planlagt vedligehold" vaerdi={k.facility.planlagtVedligehold} prik="ok" />
          <MiniLinje label="Aktiver i drift" vaerdi={num(k.facility.aktiver)} prik="info" />
        </Kort>

        <Kort titel={<><Ikon navn="vogn" farve="var(--fc-ikon-2)" /> Procure</>}
              handling={<Link className="fc-a" to="/indkoeb">Gå til Procure</Link>}>
          <MiniLinje label="Fakturaer til godkendelse" vaerdi={k.indkoeb.fakturaerTilGodkendelse}
                     prik={k.indkoeb.fakturaerTilGodkendelse > 5 ? "bad" : "ok"} />
          <MiniLinje label="Åbne ordrer" vaerdi={k.indkoeb.aabneOrdrer} prik="info" />
          {/* Indkøbsprisafvigelse — leverandørsiden, betterWhen 'lower'. Ikke det
              samme tal som salgsprisafvigelsen på Kunder & Priser.
              Værdien farves af deviation()s egen tone — ikke af en farve valgt
              her, som kunne blive grøn for en overskridelse. */}
          <MiniLinje label="Indkøbsprisafvigelse (snit)"
                     vaerdi={
                       <span className={`fc-${prisafv.tone}`}>{prisafv.pil} {prisafv.text}</span>
                     } />
          <MiniLinje label="Leverance til tiden" vaerdi={pct(k.indkoeb.leveranceTilTidenPct)}
                     prik={k.indkoeb.leveranceTilTidenPct >= 90 ? "ok" : "warn"} />
        </Kort>
      </Gitter>

      <p className="fc-hint">Alle beløb er ekskl. moms, medmindre andet er angivet.</p>
    </div>
  );
}
