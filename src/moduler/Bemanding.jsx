/* src/moduler/Bemanding.jsx
 * Bemanding
 *
 * Kapacitetsgrad BEREGNES: disponeret / planlagt. Skriv den ikke ind — det var
 * derfor Dashboard sagde 84 % og Bemanding 83 %.
 *
 * NAVNESAMMENSTØD, undgået med vilje: mockuppen kalder rækkerne "roller", men
 * `roller` er taget af adgangsmodellen (tenants/<t>/roller/ er permission-
 * definitioner, beslutning 17). Her hedder de FUNKTIONER — chauffør,
 * mekaniker, lagermedarbejder. To ting med samme navn er beslutning 11 og 14
 * om igen.
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
 * DATA: der findes ingen personale-node i ARKITEKTUR — hverken chauffører,
 * funktioner eller vagter. Ugeplanen er derfor et lokalt demo-sæt, som TILBUD
 * på Kunder. Den beslutning hører sammen med at skærmen skal SKRIVE noget.
 */
import { Link } from "react-router-dom";
import { useKpi } from "../fleet/useKpi.js";
import { useFleet } from "../fleet/FleetContext.jsx";
import { num, pct, ugedag, ugenr, serviceTone } from "../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Fejl, MiniLinje, Gitter,
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

/* [planlagt, disponeret] pr. dag. oevrige er de seks dage der ikke er i dag,
   i ugerækkefølge.

   GODS, i dag: 20+12+12+6+8 = 58 planlagt, 18+10+9+6+5 = 48 disponeret.
   Underbemandede celler: fire i dag plus to i ugen = 6, som KPI'en siger.
   BUS, i dag: 24+2 = 26 planlagt, 21+1 = 22 disponeret, to underbemandede. */
const FUNKTIONER = [
  { id: "chauffoer", navn: "Chauffør",
    gods: { iDag: [20, 18], oevrige: [[22, 22], [24, 24], [24, 24], [26, 26], [12, 12], [6, 6]] },
    bus:  { iDag: [0, 0],   oevrige: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } },

  { id: "buschauffoer", navn: "Buschauffør",
    gods: { iDag: [0, 0],   oevrige: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] },
    bus:  { iDag: [24, 21], oevrige: [[22, 22], [24, 24], [24, 24], [24, 24], [18, 18], [12, 12]] } },

  { id: "mekaniker", navn: "Mekaniker",
    gods: { iDag: [12, 10], oevrige: [[10, 10], [12, 12], [12, 12], [12, 12], [6, 6], [0, 0]] },
    bus:  { iDag: [2, 1],   oevrige: [[2, 2], [2, 2], [2, 2], [2, 2], [1, 1], [0, 0]] } },

  { id: "lager", navn: "Lagermedarbejder",
    gods: { iDag: [12, 9],  oevrige: [[10, 10], [10, 10], [10, 9], [10, 10], [4, 4], [0, 0]] },
    bus:  { iDag: [0, 0],   oevrige: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } },

  { id: "disponent", navn: "Disponent",
    gods: { iDag: [6, 6],   oevrige: [[6, 6], [6, 6], [6, 6], [6, 6], [3, 3], [2, 2]] },
    bus:  { iDag: [0, 0],   oevrige: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } },

  { id: "administration", navn: "Administration",
    gods: { iDag: [8, 5],   oevrige: [[6, 6], [6, 6], [6, 6], [6, 5], [0, 0], [0, 0]] },
    bus:  { iDag: [0, 0],   oevrige: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } },
];

const D = 86400000;
/* serviceTone() giver de samme tre trin som Flåde og Facility bruger:
   overskredet / ≤14 dage / ≤30 dage. Fem af gods' syv udløber inden for 30
   dage, som k.bemanding.kompetencerUdloeber siger. Bus: tre af fire. */
const KOMPETENCER = {
  gods: [
    { id: "g1", person: "Lars Aage", kompetence: "Chaufføruddannelse (EU-bevis)", udloeberMs: +NU - 2 * D },
    { id: "g2", person: "Rene Thomsen", kompetence: "ADR — farligt gods", udloeberMs: +NU + 9 * D },
    { id: "g3", person: "Benjamin Holm", kompetence: "Truckcertifikat B", udloeberMs: +NU + 16 * D },
    { id: "g4", person: "Mette Sørensen", kompetence: "Kran og hejs", udloeberMs: +NU + 23 * D },
    { id: "g5", person: "Peter Iversen", kompetence: "Førstehjælp", udloeberMs: +NU + 29 * D },
    { id: "g6", person: "Anne Krogh", kompetence: "Chaufføruddannelse (EU-bevis)", udloeberMs: +NU + 112 * D },
    { id: "g7", person: "Jesper Riis", kompetence: "ADR — farligt gods", udloeberMs: +NU + 240 * D },
  ],
  bus: [
    { id: "b1", person: "Kim Dalsgaard", kompetence: "Buschaufføruddannelse", udloeberMs: +NU + 5 * D },
    { id: "b2", person: "Tina Bruun", kompetence: "Førstehjælp", udloeberMs: +NU + 18 * D },
    { id: "b3", person: "Ove Nilsson", kompetence: "D-kørekort, fornyelse", udloeberMs: +NU + 27 * D },
    { id: "b4", person: "Sara Lind", kompetence: "Buschaufføruddannelse", udloeberMs: +NU + 190 * D },
  ],
};

/* Ingen vagt planlagt er ikke det samme som en tom vagt. */
const celleTone = (c) =>
  c.mangler <= 0 ? "ok" : c.mangler === 1 ? "warn" : "bad";

export default function Bemanding() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  const { division } = useFleet();

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  /* Ugen sættes sammen med iDag-sættet i den kolonne der faktisk ER i dag. */
  const funktioner = FUNKTIONER
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
          mangler: s.mangler + c.mangler,
        }),
        { planlagt: 0, disponeret: 0, mangler: 0 }
      );
      return { id: f.id, navn: f.navn, uge, iDag: uge[I_DAG], ialt };
    })
    /* En funktion uden planlagte timer i divisionen findes ikke der. */
    .filter((f) => f.uge.some((c) => c.planlagt > 0));

  /* Afledt — intet af det gemmes. Kapacitetsgraden er den samme formel som
     Dashboard bruger, på de samme felter. */
  const kapacitet = (k.bemanding.disponeret / k.bemanding.planlagt) * 100;
  const udnyttelse = (f) => (f.iDag.planlagt ? (f.iDag.disponeret / f.iDag.planlagt) * 100 : 0);

  const aabneVagter = funktioner
    .flatMap((f) => f.uge.filter((c) => c.mangler > 0).map((c) => ({ ...c, id: `${f.id}-${c.ms}`, funktion: f.navn })))
    .sort((a, b) => a.ms - b.ms || b.mangler - a.mangler);

  const kompetencer = (KOMPETENCER[division] || KOMPETENCER.gods)
    .map((r) => ({ ...r, tone: serviceTone(r.udloeberMs) }))
    .sort((a, b) => a.udloeberMs - b.udloeberMs);
  const udloebende = kompetencer.filter((r) => r.tone.dage <= 30);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}

      <KpiRaekke>
        <KpiKort label="Disponeret i dag"
                 vaerdi={`${num(k.bemanding.disponeret)} / ${num(k.bemanding.planlagt)}`}
                 note={`${pct(kapacitet, 0)} kapacitetsgrad`} />
        <KpiKort label="Ledig kapacitet" vaerdi={num(k.bemanding.ledig)} note="personer i dag" />
        <KpiKort label="Underbemandede vagter" vaerdi={num(k.bemanding.underbemandede)}
                 note="denne uge" />
        <KpiKort label="Kompetencer udløber" vaerdi={num(k.bemanding.kompetencerUdloeber)}
                 note="inden for 30 dage" />
      </KpiRaekke>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort titel={`Bemandingsplan — uge ${ugenr(DAGE[0].ms)}`}
              handling={
                <span className="fc-hint">
                  <Pille tone="ok">Dækket</Pille>{" "}
                  <Pille tone="warn">Mangler 1</Pille>{" "}
                  <Pille tone="bad">Mangler 2+</Pille>
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
              { key: "navn", label: "Funktion", render: (r) => <b>{r.navn}</b> },
              ...DAGE.map((dag, i) => ({
                key: `d${i}`,
                label: i === I_DAG ? `${dag.label} · i dag` : dag.label,
                num: true,
                render: (r) => {
                  const c = r.uge[i];
                  if (!c.planlagt) return <span className="fc-neutral">—</span>;
                  return <Pille tone={celleTone(c)}>{c.disponeret}/{c.planlagt}</Pille>;
                },
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
            raekker={funktioner}
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
                { key: "udnyttelse", label: "Udnyttelse", num: true,
                  render: (r) => pct(udnyttelse(r), 0) },
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
              { key: "dag", label: "Dag", render: (r) => r.label },
              { key: "funktion", label: "Funktion", render: (r) => <b>{r.funktion}</b> },
              { key: "planlagt", label: "Planlagt", num: true, render: (r) => num(r.planlagt) },
              { key: "disponeret", label: "Disponeret", num: true, render: (r) => num(r.disponeret) },
              { key: "mangler", label: "Mangler", num: true,
                render: (r) => <Pille tone={celleTone(r)}>{r.mangler}</Pille> },
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
            <b>serviceTone()</b> — de samme tre trin som Flåde og Facility bruger til
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
        Bemandingsplanen er demo-data: der findes endnu ingen personale-node i datamodellen.
        Nøgletallene ovenfor kommer fra KPI-noden og matcher Dashboard.
      </p>
    </div>
  );
}
