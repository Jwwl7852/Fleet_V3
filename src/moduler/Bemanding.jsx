/* src/moduler/Bemanding.jsx
 * Bemanding
 *
 * Kapacitetsgrad BEREGNES: disponeret / planlagt. Skriv den ikke ind — det var
 * derfor Dashboard sagde 84 % og Bemanding 83 %.
 *
 * NAVNESAMMENSTØD, undgået med vilje: mockuppen kalder rækkerne "roller", men
 * `roller` er taget af adgangsmodellen (tenants/<t>/roller/ er permission-
 * definitioner, beslutning 17). Her hedder de FUNKTIONER — chauffør, mekaniker,
 * lagermedarbejder. To ting med samme navn er beslutning 11 og 14 om igen.
 *
 * Selve ugeplanen ligger i fleet/demo-bemanding.js som DEMO_BEMANDINGSPLAN.
 * Den lå her, og begrundelsen for at lade den blive var at ingen anden skærm
 * brugte den — den begrundelse har holdt fem gange før, indtil nogen fik brug
 * for tallene og lavede sin egen kopi.
 *
 * TRE TAL DELES MED DASHBOARD, og alle tre kan komme til at modsige det:
 *
 *  1. Kapacitetsgraden. Begge skærme regner disponeret/planlagt. Ingen af dem
 *     gemmer den.
 *  2. Dagens kolonne summerer til k.bemanding.planlagt og .disponeret.
 *  3. Chauffør-rækken i dag er 20/18, fordi Dashboard viser
 *     chauffoerDisponeret / chauffoerPlanlagt = 18/20. Vælger man frit her,
 *     siger de to skærme forskellige ting om de samme chauffører.
 *
 * KENDT HUL: bemanding.ledig er præcis planlagt − disponeret og altså et
 * afledt tal, der er gemt. Jeg LÆSER det, fordi Dashboard læser det — regner
 * de to skærme hver sin vej, har vi 84-mod-83 igen i ny forklædning. Det bør
 * fjernes fra aggregeringen, når Cloud Functions skrives, og så beregnes
 * begge steder.
 *
 * DATA: ugeplanen er stadig et lokalt demo-sæt, som TILBUD på Kunder — der
 * findes ingen vagtnode i ARKITEKTUR. Den beslutning hører sammen med at
 * skærmen skal SKRIVE noget.
 *
 * KOMPETENCERNE ER FLYTTET UD. De stod her som elleve hardkodede navne, og de
 * var det eneste sted personalet fandtes — Medarbejdere ville have fået sit
 * eget sæt, og så havde vi haft to stabe der ikke kendte hinanden. De ligger
 * nu i fleet/demo-personale.js sammen med personerne selv, og både denne skærm
 * og Medarbejdere læser derfra. Filen kontrollerer selv sit tal mod DEMO_KPI
 * i dev.
 *
 * KOMPETENCETABELLEN SKIFTER IKKE MED GODS/BUS — beslutning 19. Personalet har
 * ingen division, så der er ét sæt kompetencer og ét nøgletal (8), ikke fem og
 * tre. Bemandingsplanen ovenfor skifter stadig: den er vagter, altså
 * transaktioner, og de har en division. Det er ikke en inkonsekvens på skærmen
 * — det er forskellen på stamdata og transaktioner.
 */
import { Link } from "react-router-dom";
import { useKpi } from "../fleet/useKpi.js";
import { useFleet } from "../fleet/FleetContext.jsx";
import { useListe } from "../fleet/useListe.js";
/* ⚠ KUN SOM FALDBAKKE I useListe. `personale` er en seedet node. */
import { demoKompetencerMedNavn, DEMO_PERSONALE } from "../fleet/demo-personale.js";
import { stationeringerFor, ikonFor } from "../fleet/personale.js";
import { DEMO_BEMANDINGSPLAN } from "../fleet/demo-bemanding.js";
import { num, pct, dato, ugedag, ugenr, serviceTone } from "../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, MiniLinje, Gitter, Ikon, Knap
} from "../fleet/ui.jsx";

/* Ugen regnes fra mandag. Hvilken kolonne der er "i dag" afhænger af hvornår
   koden kører, så demo-tallene kan ikke ligge på en fast plads i et array:
   hver funktion har et iDag-sæt og seks øvrige dage, og ugen sættes sammen
   nedenfor. Ellers ville dagens kolonne kun matche KPI'en om fredagen. */
const NU = new Date();
const I_DAG = (NU.getDay() + 6) % 7;          // man = 0 … søn = 6
const MANDAG = new Date(NU);
MANDAG.setHours(0, 0, 0, 0);
MANDAG.setDate(MANDAG.getDate() - I_DAG);

const DAGE = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(MANDAG);
  d.setDate(d.getDate() + i);
  return { ms: d.getTime(), label: ugedag(d.getTime()) };
});



/* Ingen vagt planlagt er ikke det samme som en tom vagt. */
const celleTone = (c) =>
  c.mangler <= 0 ? "ok" : c.mangler === 1 ? "warn" : "bad";


export default function Bemanding() {
  /* ⚠ STATIONERINGERNE BLEV SLÅET OP I DEMOFILEN. Hos en rigtig kunde ville
     kolonnen "Steder" stå tom på hver funktion — og en tom kolonne ligner en
     medarbejderstab uden hjemsted frem for et opslag der peger det forkerte
     sted. */
  const personale = useListe("personale", {
    vindue: "alle", division: "alle", graense: 500, demo: DEMO_PERSONALE,
  });
  const { kpi: k, henter, tilstand, genindlaes } = useKpi();
  const { division } = useFleet();

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;

  /* Ugen sættes sammen med iDag-sættet i den kolonne der faktisk ER i dag. */
  const funktioner = DEMO_BEMANDINGSPLAN
    .map((f) => {
      const saet = f[division] || f.gods;
      let j = 0;
      const uge = DAGE.map((dag, i) => {
        const [planlagt, disponeret] = i === I_DAG ? saet.iDag : saet.oevrige[j++];
        return { ...dag, planlagt, disponeret, mangler: planlagt - disponeret };
      });
      const ialt = uge.reduce(
        (s, c) => ({
          planlagt: s.planlagt + c.planlagt,
          disponeret: s.disponeret + c.disponeret,
          mangler: s.mangler + c.mangler
        }),
        { planlagt: 0, disponeret: 0, mangler: 0 }
      );
      return { id: f.id, navn: f.navn, uge, iDag: uge[I_DAG], ialt,
               steder: stationeringerFor(personale.data, f.id) };
    })
    /* En funktion uden planlagte timer i divisionen findes ikke der. */
    .filter((f) => f.uge.some((c) => c.planlagt > 0));

  /* Afledt — intet af det gemmes. Kapacitetsgraden er den samme formel som
     Dashboard bruger, på de samme felter. */
  const kapacitet = (k.bemanding.disponeret / k.bemanding.planlagt) * 100;
  const udnyttelse = (f) => (f.iDag.planlagt ? (f.iDag.disponeret / f.iDag.planlagt) * 100 : 0);

  const aabneVagter = funktioner
    .flatMap((f) => f.uge.filter((c) => c.mangler > 0).map((c) => ({ ...c, id: `${f.id}-${c.ms}`, funktion: f.navn, steder: f.steder })))
    .sort((a, b) => a.ms - b.ms || b.mangler - a.mangler);

  /* Personerne og deres beviser kommer fra demo-personale.js — samme kilde som
     Medarbejdere læser. Listen er IKKE divisionsopdelt (beslutning 19):
     stamdata har ingen division, staben er én, og tallet i KPI-kortet er det
     samme uanset toggle. serviceTone() giver de samme tre trin som Flåde og
     Facility. */
  const kompetencer = demoKompetencerMedNavn()
    .map((r) => ({ ...r, tone: serviceTone(r.udloeberMs) }))
    .sort((a, b) => a.udloeberMs - b.udloeberMs);
  const udloebende = kompetencer.filter((r) => r.tone.dage <= 30);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <KpiRaekke>
        {/* Runde ikoner og chevron som på Booking. Tonerne er IKONACCENTER —
            farven forstærker, tallet og teksten bærer betydningen alene. */}
        <KpiKort label="Disponeret i dag" vaerdi={num(k.bemanding.disponeret)}
                 ikon={<Ikon navn="personer" />} tone="ikon-5" rund
                 note={`af ${num(k.bemanding.planlagt)} planlagte · ${pct(kapacitet, 0)} kapacitet`} />
        {/* ⚠ ledig er et GEMT afledt tal og et kendt hul — se noten i toppen.
            Det læses her fordi Dashboard læser det; regner de to skærme hver
            sin vej, har vi 84-mod-83 igen i ny forklædning. */}
        <KpiKort label="Ledig kapacitet" vaerdi={num(k.bemanding.ledig)}
                 ikon={<Ikon navn="afspil" />} tone="ikon-6" rund note="personer i dag" />
        <KpiKort label="Underbemandede vagter" vaerdi={num(k.bemanding.underbemandede)}
                 ikon={<Ikon navn="advarsel" />} tone="ikon-2" rund note="denne uge" />
        <KpiKort label="Kompetencer udløber snart" vaerdi={num(k.bemanding.kompetencerUdloeber)}
                 ikon={<Ikon navn="skjold" />} tone="ikon-3" rund
                 note="inden for 30 dage" til="/bemanding/kompetencer" />
      </KpiRaekke>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort className="fc-plan" titel={`Bemandingsplan — uge ${ugenr(DAGE[0].ms)}`}
              handling={
                /* Legenden med prikker, som mockuppen. Farven bærer ikke
                   betydningen alene — hver celle viser også tallet og
                   procenten. */
                <span className="fc-legende">
                  <i className="fc-prik fc-prik-ok" /> Dækket
                  <i className="fc-prik fc-prik-warn" /> Mangler 1
                  <i className="fc-prik fc-prik-bad" /> Mangler 2+
                  <span className="fc-neutral">— Fri / ikke planlagt</span>
                </span>
              }>
          <p className="fc-hint" style={{ marginBottom: 12 }}>
            Hver celle er <b>disponeret / planlagt</b>. Dagens kolonne summerer til
            nøgletallet ovenfor — {num(k.bemanding.disponeret)} af {num(k.bemanding.planlagt)} —
            og kapacitetsgraden beregnes af de to tal. Den gemmes ikke, hverken her eller på
            Dashboard. <b>I alt</b> er rækkens sum over de syv viste dage og hører derfor
            ikke sammen med nøgletallene, som er for i dag.
          </p>
          <Tabel
            kolonner={[
              /* Lokationen UDLEDES af personalets `stationeret` — mockuppens
                 "Greve" og "Taastrup" findes ikke i data. Se
                 stationeringerFor() om hvorfor den ikke opfindes. */
              { key: "navn", label: "Funktion", render: (r) => (
                  <div className="fc-funk">
                    {/* Ikonet kommer fra FUNKTION_IKON i personale.js — ikke
                        fra en tabel her, saa Medarbejdere kan bruge det samme. */}
                    <span className="fc-funk-ico"><Ikon navn={ikonFor(r.id)} /></span>
                    <span className="fc-funk-txt">
                      <b>{r.navn}</b>
                      <span>{r.steder.length ? r.steder.join(" + ") : "Ingen stationering"}</span>
                    </span>
                  </div>) },
              ...DAGE.map((dag, i) => ({
                key: `d${i}`,
                label: i === I_DAG ? `${dag.label} · i dag` : dag.label,
                /* CENTRERET, ikke højrestillet. Cellen er en FLADE og ikke et
                   tal i en talkolonne — højrestilling ville skubbe firkanterne
                   ud mod hver sin kant og ødelægge gitteret. Se `midt` i
                   Tabel: `num` gælder stadig for Kapacitet og I alt. */
                midt: true,
                render: (r) => {
                  const c = r.uge[i];
                  /* Ingen vagt planlagt er ikke en tom vagt — derfor en streg
                     og ikke "0/0", som ville se ud som en fejl i planen. */
                  if (!c.planlagt) return <span className="fc-neutral">—</span>;
                  const grad = Math.round((c.disponeret / c.planlagt) * 100);
                  const tone = celleTone(c);
                  return (
                    /* Firkanten bærer farven tre gange: tonet flade, ramme og
                       dækningsbjælke. Men ALDRIG farven alene — tallet og
                       procenten står i feltet, så den der ikke skelner grøn
                       fra rød kan læse det samme. */
                    <div className={`fc-celle fc-celle-${tone}${i === I_DAG ? " fc-celle-idag" : ""}`}>
                      <b>{c.disponeret} / {c.planlagt}</b>
                      <span>{grad} %</span>
                      <span className="fc-celle-spor" aria-hidden="true">
                        <span className="fc-celle-fyld" style={{ width: `${Math.min(100, grad)}%` }} />
                      </span>
                    </div>
                  );
                }
              })),
              /* Rækkesummen over de syv viste dage. Den hører ikke sammen med
                 nøgletallene ovenfor, som er "i dag" — derfor står den til
                 sidst og ikke som et femte KPI-kort. */
              { key: "ialt", label: "I alt", num: true,
                render: (r) => (
                  <b className={r.ialt.mangler > 0 ? "fc-bad" : "fc-good"}>
                    {r.ialt.disponeret}/{r.ialt.planlagt}
                  </b>
                ) },
            ]}
            raekker={funktioner.filter((f) => f.ialt.planlagt > 0)}
            tom="Ingen funktioner planlagt i denne division."
          />
        </Kort>

        <div className="fc-grid">
          <Kort titel="Kapacitet pr. funktion">
            <p className="fc-hint" style={{ marginBottom: 12 }}>I dag.</p>
            <Tabel
              kolonner={[
                { key: "navn", label: "Funktion" },
                { key: "planlagt", label: "Planl.", num: true, render: (r) => num(r.iDag.planlagt) },
                { key: "disponeret", label: "Disp.", num: true, render: (r) => num(r.iDag.disponeret) },
                { key: "ledig", label: "Ledig", num: true, render: (r) => num(r.iDag.mangler) },
                /* Bjaelken er andelen af planlagt — 100 % er fuldt disponeret.
                   Tallet staar ved siden af: en bjaelke alene kan ikke aflaeses. */
                { key: "udnyttelse", label: "Udnyttelse", bredde: "34%",
                  render: (r) => (
                    <div className="fc-udn">
                      <b>{pct(udnyttelse(r), 0)}</b>
                      <span className="fc-udn-spor">
                        <span className={`fc-udn-fyld fc-udn-${celleTone(r.iDag)}`}
                              style={{ width: `${Math.min(100, udnyttelse(r))}%` }} />
                      </span>
                    </div>) },
              ]}
              raekker={funktioner.filter((f) => f.iDag.planlagt > 0)}
              tom="Ingen vagter planlagt i dag."
            />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Udnyttelsen regnes pr. funktion af de to kolonner til venstre — den er ikke
              et felt i basen.
            </p>
          </Kort>

          <Kort titel="Nøgletal"
                handling={<Link className="fc-a" to="/bemanding/fravaer">Ferie &amp; fravær</Link>}>
            <MiniLinje label="Planlagt i dag" vaerdi={num(k.bemanding.planlagt)} />
            <MiniLinje label="Disponeret i dag" vaerdi={num(k.bemanding.disponeret)} />
            <MiniLinje label="Kapacitetsgrad" vaerdi={pct(kapacitet, 0)} />
            <MiniLinje label="Chauffører"
                       vaerdi={`${num(k.bemanding.chauffoerDisponeret)} / ${num(k.bemanding.chauffoerPlanlagt)}`} />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Chaufførtallet er samme felt som Dashboard viser, og det er derfor
              chauffør-rækken ovenfor står på netop de tal.
            </p>
          </Kort>
        </div>
      </Gitter>

      <Gitter kolonner="repeat(auto-fit, minmax(340px, 1fr))">
        <Kort titel="Åbne vagter og opgaver der mangler bemanding">
          <p className="fc-hint" style={{ marginBottom: 12 }}>
            {num(aabneVagter.length)} vagter i ugen mangler folk. Listen udledes af planen
            til venstre — den vedligeholdes ikke ved siden af, så de to kan ikke komme til
            at sige hver sit.
          </p>
          <Tabel
            kolonner={[
              { key: "dag", label: "Dato", render: (r) => `${r.label} ${dato(r.ms)}` },
              { key: "funktion", label: "Funktion", render: (r) => <b>{r.funktion}</b> },
              { key: "sted", label: "Lokation",
                render: (r) => (r.steder?.length
                  ? r.steder.join(" + ")
                  : <span className="fc-neutral">—</span>) },
              { key: "besk", label: "Beskrivelse",
                render: (r) => `${r.disponeret} af ${r.planlagt} disponeret` },
              /* PRIORITET udledes af hvor mange der mangler — den er ikke et
                 felt nogen har tastet. Ét hul er noget andet end tre. */
              { key: "prioritet", label: "Prioritet",
                render: (r) => (
                  <Pille tone={r.mangler >= 3 ? "bad" : r.mangler === 2 ? "warn" : "ok"}>
                    {r.mangler >= 3 ? "Høj" : r.mangler === 2 ? "Mellem" : "Lav"}
                  </Pille>) },
              { key: "status", label: "Status",
                render: (r) => (
                  <Pille tone={celleTone(r)}>
                    {r.mangler >= 2 ? "Underbemandet" : "Delvist dækket"}
                  </Pille>) },
              /* ⚠ DEAKTIVERET MED EN BEGRUNDELSE. Fase 0 er visning, og der
                 findes ingen vagtnode at skrive til. En knap der ikke gør
                 noget uden at sige hvorfor, er værre end ingen knap. */
              { key: "tildel", label: "", render: () => (
                  <Knap disabled title="Kræver en vagtnode i datamodellen — se noten i toppen af filen">
                    Tildel
                  </Knap>) },
            ]}
            raekker={aabneVagter}
            tom="Alle vagter er dækket i denne uge."
          />
        </Kort>

        <Kort titel="Kompetencer og certifikater"
              handling={<Link className="fc-a" to="/bemanding/kompetencer">Se alle</Link>}>
          <p className="fc-hint" style={{ marginBottom: 12 }}>
            Viser de {num(udloebende.length)} der udløber inden for 30 dage, af{" "}
            {num(kompetencer.length)} registrerede. Tærsklerne kommer fra{" "}
            <b>serviceTone()</b> — de samme tre trin som Fleet og Facility bruger til
            servicevarsling. En udløbet kompetence skal blokere chaufføren i disponeringen.
          </p>
          <Tabel
            kolonner={[
              { key: "person", label: "Person", render: (r) => <b>{r.person}</b> },
              { key: "kompetence", label: "Kompetence" },
              { key: "udloeber", label: "Frist",
                render: (r) => <Pille tone={r.tone.tone}>{r.tone.tekst}</Pille> },
            ]}
            raekker={udloebende}
            tom="Ingen kompetencer udløber inden for 30 dage."
          />
        </Kort>
      </Gitter>

      <p className="fc-hint">
        Bemandingsplanen er demo-data: der findes ingen vagtnode i datamodellen endnu.
        Personerne og deres kompetencer er derimod rigtige poster i <b>personale/</b> og{" "}
        <b>kompetencer/</b> — de vedligeholdes på{" "}
        <Link className="fc-a" to="/opsaetning/medarbejdere">Medarbejdere</Link>.
        Nøgletallene ovenfor kommer fra KPI-noden og matcher Dashboard.
      </p>
    </div>
  );
}
