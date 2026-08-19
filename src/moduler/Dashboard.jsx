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
import { Link, useSearchParams } from "react-router-dom";
import { useKpi } from "../fleet/useKpi.js";
import { useFleet } from "../fleet/FleetContext.jsx";
/* ⚠ MODUL bruges til NAVNET på et modul. Et eget map her ville være det
   andet sted et modul hedder noget — og så ville Dashboardet kunne sige
   "Indkøb" hvor sidebaren siger "Procure". Se moduler.js. */
import { harModul, MODUL } from "../fleet/moduler.js";
/* ⚠ KATALOGET LIGGER UDEN FOR SKÆRMEN, så feltstierne kan prøves mod
   demo-kpi.js. Et kort der peger på et felt der ikke findes, ville skrive
   INTET (—) i tavshed — og "—" ligner et ubesvaret nøgletal frem for en
   tastefejl i en sti. Se dashboards.js. */
import {
  SAMLET, MODULKORT, kortTal, handlinger, tilgaengelige,
} from "../fleet/dashboards.js";
/* ⚠ EN VISNING, IKKE EN ADGANG — se dashboardvisning.js. Indstillingen
   skjuler et dashboard i vælgeren; den spærrer ikke tallene, som ligger i en
   kpi-node enhver i tenanten kan læse. */
import { synligeDashboards } from "../fleet/dashboardvisning.js";
import { usePost } from "../fleet/usePost.js";
import { PRIORITET } from "../fleet/prioritet.js";
import { DEMO_DASHBOARD_OPGAVER } from "../fleet/demo-dashboard.js";
import { omkostningsserie, maanedsEtiketter } from "../fleet/demo-oekonomi.js";
import { kr, num, pct, dato, deviation, deviationPct, INTET } from "../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, MiniLinje, Gitter, Donut, Soejlegraf, Tom, Fordelingsbjaelke, Ikon, Handlingsliste
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

/* ⚠ KATALOGET FOR "KRÆVER HANDLING" LÅ HER SOM EN LOKAL const.
   Det gør det ikke længere: Arbejdskøen og modulkortene skal vise de SAMME
   tal, og et katalog i en JSX-fil kan ikke prøves mod kpi/. Det står nu i
   fleet/dashboards.js sammen med modulkortene, og en prøve holder hver
   eneste feltsti op mod demo-kpi.js.

   ⚠ OG LISTEN ER IKKE LÆNGERE FAST. Før stod fem rækker med hver sit tal,
   uanset om tallet var 0 — "0 fakturaer til godkendelse" er ikke en
   handling, det er fraværet af en. handlinger() svarer kun med de rækker
   der faktisk kræver noget, og et UBESVARET felt giver ingen række: null
   er ikke nul, og en handling på et tal ingen har regnet, er en påstand. */
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
  const { division, moduler, bruger } = useFleet();
  const [params, saetParams] = useSearchParams();
  /* ⚠ KUN DE MODULER KUNDEN HAR. Samme svar som sidebarens — to
     forskellige svar på "hvad må jeg se" ville være to steder at være
     uenige. Billede 3's afkrydsning pr. bruger kommer i sin egen etape
     sammen med rollemodellen. */
  const harKundenModul = (m) => harModul(moduler, m);
  /* ⚠ BRUGERENS EGEN INDSTILLING, sat af en administrator. Findes den
     ikke, ser han alt det kunden har købt — præcis som før. Det er dét
     der gør ændringen sikker at udrulle: ingen mister en visning af at
     funktionen kommer. */
  const visning = usePost("dashboardvisning", bruger?.uid || null);
  /* ⚠ .post, IKKE .data. usePost returnerer { post, henter, fejl, tilstand };
     useListe returnerer { data }. Skrev man .data her, ville den vaere
     undefined, synligeDashboards() ville falde tilbage paa "alt", og
     indstillingen ville ALDRIG virke — mens skaermen saa helt rigtig ud. */
  const ALLE = synligeDashboards(visning.post, harKundenModul);
  void tilgaengelige;

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;

  /* Afledte tal BEREGNES her — de skrives ikke ind i basen to steder.
     Det er derfor kapacitetsgraden ikke længere kan være 84 % på Dashboard
     og 83 % i Bemanding.

     ⚠ KAPACITETSGRADEN STOD HER OG ER FLYTTET TIL dashboards.js.
     Modulkortet regner den nu med kapacitetsgrad(), og regnestykket lå to
     steder i det øjeblik kortet blev bygget af et katalog. Gaten fulgte med:
     `null / 58 * 100` er 0 og ikke null, og 0 % kapacitet ligner en måling
     af en flåde der står stille. */
  const budgetAfvPct = deviationPct(k.oekonomi.driftsomkostningerOere, k.oekonomi.budgetOere);

  /* Seks måneder, ikke tolv: kortet er en tredjedel bredt, og tolv søjler
     dér bliver til striber. Serien og etiketterne kommer fra demo-oekonomi,
     så Dashboard og Økonomi viser de SAMME måneder og de samme tal — lå
     regnestykket to steder, kunne de vise hver sit.
     Sidste punkt er det aktuelle tal fra kpi/, som på Økonomi. */
  /* ⚠ INDKØBSPRISAFVIGELSEN OG LEVERANCE TIL TIDEN STOD PÅ PROCURE-KORTET
     OG ER IKKE MED LÆNGERE. Modulkortene bærer TRE tal hver, som i
     mockuppen — et kort med fem linjer kan ikke skimmes, og det var derfor
     de blev lavet om. De to tal er ikke tabt: de står på Procure selv, hvor
     fortegnskonventionen fra beslutning 3 også hører hjemme.

     Skal de tilbage, hører de i MODULKORT i dashboards.js — ikke som et
     fjerde felt hardkodet her. */

  const { historik } = omkostningsserie(division);
  const serie = [...historik, k.oekonomi.driftsomkostningerOere].slice(-6);
  const maanedsPunkter = maanedsEtiketter(6).map((m, i) => ({
    label: m, vaerdier: [serie[i]]
  }));

  /* Samme visningsregel som useListe: valgt division plus fælles. */
  const opgaver = DEMO_DASHBOARD_OPGAVER.filter((o) => o.division === division || o.division === "faelles");

  /* ⚠ VALGET STÅR I URL'EN, ikke i en useState. Et dashboard man har
     indstillet, skal overleve en genindlæsning og kunne sendes til en
     kollega — og "kig på Fleet-dashboardet" er ubrugeligt uden et link.
     Samme greb som Arbejdskøens ?vis=. */
  const valgt = ALLE.some((d) => d.key === params.get("db")) ? params.get("db") : SAMLET;

  /* ⚠ HANDLINGERNE ER DE SAMME TAL SOM KORTENE — samme katalog, samme
     opslag i kpi/. Kom de fra hver sin kilde, kunne listen sige 7 og
     Fleet-kortet 6 på den SAMME skærm. Se dashboards.js. */
  const handler = handlinger(k, { harModulFn: harKundenModul })
    .filter((h) => valgt === SAMLET || h.modul === valgt);

  /* Samlet viser alle modulkort; et modul-dashboard viser sit eget. */
  const kortNoegler = (valgt === SAMLET
    ? ALLE.filter((d) => d.key !== SAMLET).map((d) => d.key)
    : [valgt]).filter((m) => MODULKORT[m]);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {/* ⚠ VÆLGEREN ER EN <select> OG IKKE FANER. Syv dashboards i en
          fanerække ville brække på en bærbar, og listen vokser med hvert
          modul vi sælger. */}
      <div className="fc-kal-top">
        <label className="fc-hint" htmlFor="db-vaelg">Vis dashboard:</label>
        <select id="db-vaelg" className="fc-ctl" value={valgt}
                onChange={(e) => saetParams(e.target.value === SAMLET
                  ? {} : { db: e.target.value })}>
          {ALLE.map((d) => (
            <option key={d.key} value={d.key}>{d.label}</option>
          ))}
        </select>
        <span className="fc-hint">
          {ALLE.find((d) => d.key === valgt)?.under}
        </span>
      </div>

      <Kort titel="Prioriterede handlinger">
        {/* ⚠ Handlingsliste ER EN PRIMITIV, OG DEN FANDTES I FORVEJEN.
            Jeg skrev min egen markup med min egen .fc-handling-txt — og
            klassenavnet var TAGET af netop den primitiv. css-navne-prøven
            fangede det: den sidste regel vinder, og den vinder et andet
            sted i appen end der hvor man arbejder.

            Prioriteten bæres af ikonets tone, og modulet står i
            underteksten — mockuppens to piller ville have krævet en
            anden primitiv til den samme slags liste.

            ⚠ KUN DE RÆKKER DER FAKTISK KRÆVER NOGET. Før stod fem rækker
            fast, uanset om tallet var 0 — og "0 fakturaer til godkendelse"
            er ikke en handling, det er fraværet af en. Et UBESVARET felt
            giver heller ingen række: null er ikke nul. Se handlinger(). */}
        <Handlingsliste
          poster={handler.map((h) => ({
            id: h.key,
            til: h.sti,
            tone: PRIORITET[h.prioritet].pill,
            ikon: h.ikon,
            tekst: h.tekst,
            under: `${MODUL[h.modul]?.label || h.modul} · ${h.hvorfor}`,
            antal: num(h.antal),
          }))}
        />
      </Kort>

      {/* ⚠ TVÆRGÅENDE TAL HØRER PÅ DET SAMLEDE DASHBOARD. På et
          modul-dashboard ville "Driftsomkostninger" og "Ikke-faktureret"
          være tal fra et andet modul end det man har valgt — og så betyder
          valget ingenting. */}
      {valgt === SAMLET && (
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
      )}

      {valgt === SAMLET && (
      /* Midterrækken. auto-fit, så kortet fylder pænt alene nu og de to
          øvrige (Omkostninger pr. måned, Største afvigelser) glider ind ved
          siden af uden endnu en layoutændring. */
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
      )}

      {/* ⚠ ET KORT PR. MODUL, BYGGET AF KATALOGET — ikke tre håndskrevne.
          Her stod Workforce, Facility og Procure som hver sit stykke JSX med
          hver sin liste af MiniLinjer. Det fjerde modul ville have fået sit
          eget, og det femte ville have set anderledes ud end de fire. */}
      <Gitter kolonner="repeat(auto-fit, minmax(300px, 1fr))">
        {kortNoegler.map((m) => (
          <Modulkort key={m} modul={m} kort={MODULKORT[m]} kpi={k} />
        ))}
      </Gitter>

      {valgt === SAMLET && (
      <Gitter kolonner="minmax(0,1fr)">
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

      </Gitter>
      )}

      <p className="fc-hint">Alle beløb er ekskl. moms, medmindre andet er angivet.</p>
    </div>
  );
}

/* ---- Modulkortet ------------------------------------------------------ */

/**
 * Tre tal fra kpi/, eller en ærlig besked om hvad der mangler.
 *
 * ⚠ ET MODUL UDEN TAL FÅR ET KORT ALLIGEVEL. Warehouse har ét felt i kpi/
 * og UnitBooking ingen. Udelod vi kortene, ville de to moduler se ud som
 * noget der ikke findes; fyldte vi dem med tal, ville de se ud som
 * målinger. Kortet skriver i stedet hvilke felter der skal beregnes — så
 * står efterslæbet på skærmen frem for kun i README.
 */
function Modulkort({ modul, kort, kpi }) {
  const navn = MODUL[modul]?.label || modul;
  return (
    <Kort
      titel={<><Ikon navn={kort.ikon} farve={`var(--fc-${kort.tone})`} /> {navn}</>}
      handling={<Link className="fc-a" to={kort.sti}>Gå til {navn}</Link>}
    >
      {kort.mangler ? (
        <>
          <Tom>Tallene aggregeres ikke endnu.</Tom>
          <p className="fc-hint" style={{ marginTop: 10 }}>
            {kort.hvorfor}
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Felter der mangler:{" "}
            {kort.mangler.map((f, i) => (
              <span key={f}>{i > 0 ? ", " : ""}<code>{f}</code></span>
            ))}
          </p>
        </>
      ) : (
        kort.tal.map((post) => {
          const t = kortTal(kpi, post);
          /* ⚠ INTET (—) FOR ET UBESVARET TAL, ikke 0. num() og pct() bærer
             gaten; her vælges kun hvilken af dem. Se format.js. */
          const vist = t.form === "pct" ? pct(t.vaerdi, 0) : num(t.vaerdi);
          return <MiniLinje key={post.label} label={t.label} vaerdi={vist} />;
        })
      )}
    </Kort>
  );
}
