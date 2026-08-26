/* src/moduler/facility/Servicekalender.jsx
 * Facility – servicekalender & reparationer
 *
 * SKÆRMEN STYRER OPGAVERNE MED ART `facility`. Rækkerne er lokationer og
 * aktiver i stedet for biler; alt andet er som Driftskalenderen. Gitteret
 * ligger i fleet/Gitterkalender.jsx — byg ikke et fjerde.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ SKÆRMEN LÆSER NODEN `opgaver` — IKKE DEMO_SERVICEBESOEG.
 *
 * Indtil beslutning 49 tegnede den seks poster fra demo-facility.js, mens
 * provisioneren seedede `opgaver` med DEMO_OPGAVER's facility-opgaver — som
 * var HELT ANDRE poster. `kpi.facility.planlagtVedligehold` blev regnet af
 * noden; gitteret viste demofilen. To svar på ét spørgsmål, ét klik fra
 * hinanden — nøjagtig som Indkøb → Fakturaer, og som Driftskalenderens
 * DEMO_BESOEG før den.
 *
 * ⚠ OG DE TO HAVDE IKKE SAMME FELTER. Besøget bar `fra`, `til` og
 * `estimatOere`; noden bærer `startMs`, `estimeretMin` og `beloebOere`. Fjerde
 * gang de tre navne har kostet noget. Posterne ligger nu i DEMO_OPGAVER, og
 * DEMO_SERVICEBESOEG er en afledt visning af dem.
 *
 * `useListe(node, { demo })` er vejen: sættet bruges KUN når der ingen
 * database er.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DEN FJERDE RESERVATIONSKILDE. "Reserveret fra sag #1245" i mockuppen er en
 * reservation med kilde `facilitySag` og prioritet 20 — samme node som
 * booking, værksted og fravær skriver til (beslutning 4). Den krævede INGEN
 * ny kode: reservationFraOpgave() giver den allerede, fordi et servicebesøg
 * er en opgave med art `facility` (beslutning 21).
 *
 * ⚠ ET BESØG UDEN aktivId SPÆRRER HELE LOKATIONEN. Lukker man hallen, er alle
 * porte i den også optaget — derfor er ressourcen `lokation` og ikke
 * `facilityAktiv`. De to er hver sin type i RESSOURCE, og et træk mellem de to
 * slags rækker skifter derfor TYPE og ikke bare id. Se flytEfter().
 *
 * ⚠ SKÆRMEN FLYTTER, MEN DEN OPRETTER IKKE. `opgaveflyt` bevarer opgavens
 * egen art og kan derfor flytte et servicebesøg; `opgaveplanlaeg` SÆTTER
 * `art: "vaerksted"` og kan altså kun oprette værkstedsopgaver. At oprette en
 * facility-opgave er stadig en lukket vej der skal genåbnes med sin EGEN
 * funktion — se README. En knap her ville love noget serveren afviser.
 *
 * FACILITY ER FÆLLES — skærmen reagerer ikke på Gods/Bus. Aktiverne er de
 * samme uanset hvem der kører gennem porten.
 */
import { useMemo, useState } from "react";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, dato, datoTid, klokke } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Fejl, Datatilstand,
  Gitter, MiniLinje, Knap, Formularsvar, Kpiadgang } from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import Gitterkalender from "../../fleet/Gitterkalender.jsx";
import { ENHED, ledigeVinduer } from "../../fleet/gitter.js";
import {
  reservationFraOpgave, ressourceId, OPGAVE_STATUS,
} from "../../fleet/opgaver.js";
import { slutter } from "../../fleet/driftskalender.js";
import { flytOpgave, kanFlyttes } from "../../fleet/opgaveplan.js";
import Statusskifte from "../../fleet/Statusskifte.jsx";
import Servicedialog from "./Servicedialog.jsx";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  KILDE, prioritetFor, konfliktTekst, indeslutninger,
} from "../../fleet/reservations.js";
import { AKTIV_ART, AKTIV_STATUS } from "../../fleet/facility.js";
/* ⚠ SKIVE 3C — DEN DELTE Sagsvisning, IKKE EN EGEN FACILITY-KOPI. */
import Sagsvisning from "../../fleet/Sagsvisning.jsx";
/* ⚠ KUN SOM FALDBAKKE I useListe. Sættene bruges når der ingen database er.
   Skærmen slår IKKE op i dem — det var netop dét der gjorde
   DEMO_SERVICEBESOEG til et andet svar end noden. */
import { DEMO_AKTIVER, DEMO_LOKATIONER } from "../../fleet/demo-facility.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";

const DAG = 86400000;
const VINDUE_DAGE = 10;

export default function Servicekalender() {
  const { kpi: k, henter, tilstand, genindlaes, utilgaengelige } = useKpi();
  const { bruger } = useFleet();
  const [valgtId, setValgtId] = useState(null);
  const [flytSvar, setFlytSvar] = useState(null);
  /* `false` = lukket, `{}` = åben uden forslag, `{aktivId|lokationId, startMs}`
     = åbnet fra et ledigt felt i gitteret. Se Servicedialog. */
  const [planlaegger, setPlanlaegger] = useState(false);

  /* ⚠ PERMISSIONEN, IKKE ROLLEN — og kun til at tegne kontrollen. Serveren
     spørger om den samme; det er dér den afgøres. */
  const maaSkrive = harPerm(bruger?.perms, PERM.opgaverSkriv);

  const iDag = new Date(); iDag.setHours(0, 0, 0, 0);
  const vindueFra = iDag.getTime() - DAG;
  const vindueTil = vindueFra + VINDUE_DAGE * DAG;

  /* ⚠ FACILITY ER FÆLLES: division "alle" står eksplicit, så det kan ses at
     det er besluttet frem for overset. Et anlæg hører ikke til Gods eller Bus
     — porten bruges af begge. Opgaven bærer feltet, aktivet gør ikke. */
  const felles = { vindue: "alle", graense: 500 };
  const lokationer = useListe("facility/lokationer", { ...felles, demo: DEMO_LOKATIONER });
  const aktiver = useListe("facility/aktiver", { ...felles, demo: DEMO_AKTIVER });
  const leverandoerer = useListe("leverandoerer", { ...felles, graense: 200, demo: DEMO_LEVERANDOERER });
  /* ⚠ SAMME OPSLAG SOM DRIFTSKALENDEREN OG DISPONERINGEN. Ét vindue, ét
     ordnPaa — tre skærme der læste den samme node forskelligt, ville vise
     hver sin dag. */
  const opgaver = useListe("opgaver", {
    ordnPaa: "startMs", vindue: "fremad", vindueDage: 120, fremDage: 365,
    graense: 500, demo: DEMO_OPGAVER,
  });

  const lvNavn = (id) => leverandoerNavn(leverandoerer.data, id);

  /* ⚠ ARTEN, IKKE ET DEMOSÆT. Noden bærer både værksted og facility
     (beslutning 21), og de to har ikke samme feltskema. Værkstedet har sin
     egen skærm på den SAMME node. */
  const facilityopgaver = useMemo(
    () => opgaver.data.filter((o) => o.art === "facility"),
    [opgaver.data]);

  /* ⚠ VINDUET REGNES AF `startMs` + `slutter()`, IKKE AF `fra`/`til`.
     Noden bærer ikke de to felter — det gjorde DEMO_SERVICEBESOEG, og det er
     netop dét der gjorde den til et andet datasæt. En opgave uden estimat får
     ét døgn, så rækken findes; den foregiver ikke en varighed nogen har
     besluttet. */
  const iVindue = useMemo(() => facilityopgaver.filter((o) => {
    if (!Number.isFinite(o.startMs)) return false;
    const slut = slutter(o) ?? o.startMs + DAG;
    return o.startMs < vindueTil && vindueFra < slut;
  }), [facilityopgaver, vindueFra, vindueTil]);

  /* Rækkerne er de RESSOURCER besøgene binder: et aktiv, eller en lokation når
     besøget spærrer hele stedet. Blandes de to, kan man ikke se at gulvarbejdet
     i Hal B lukker alle porte i hallen. */
  const lokNavn = (id) => lokationer.data.find((l) => l.id === id)?.navn || "";

  const raekker = useMemo(() => {
    const aktivIder = new Set(iVindue.filter((b) => b.aktivId).map((b) => b.aktivId));
    const lokIder = new Set(iVindue.filter((b) => !b.aktivId).map((b) => b.lokationId));
    return [
      ...lokationer.data.filter((l) => lokIder.has(l.id)).map((l) => ({
        id: l.id, label: l.navn, under: "Hele lokationen",
        pille: <Pille tone="warn">Lokation</Pille>
      })),
      ...aktiver.data.filter((a) => aktivIder.has(a.id)).map((a) => ({
        id: a.id, label: a.navn,
        under: `${AKTIV_ART[a.art]?.label} · ${lokNavn(a.lokationId)}`,
        pille: <Pille tone={AKTIV_STATUS[a.status]?.pill}>{AKTIV_STATUS[a.status]?.label}</Pille>
      })),
    ];
  }, [iVindue, lokationer.data, aktiver.data]);

  /* Hvilken slags række et id er. ⚠ GITTERET KENDER KUN ET id, og de to
     ressourcetyper skal skilles ad: et træk fra en port til en hal skifter
     TYPE, ikke bare id. */
  const typeFor = (raekkeId) =>
    aktiver.data.some((a) => a.id === raekkeId) ? "facilityAktiv" : "lokation";

  const egneBlokke = iVindue.map((o) => ({
    id: o.id,
    raekkeId: ressourceId(o),
    fra: o.startMs,
    til: slutter(o) ?? o.startMs + DAG,
    label: [o.leverandoerId ? lvNavn(o.leverandoerId) : "eget personale", o.beskrivelse]
      .filter(Boolean).join(" · "),
    titel: o.beskrivelse,
    tone: OPGAVE_STATUS[o.status]?.pill || "info"
  }));

  /* ---- Indeslutningen: hallen og porten er det samme rum — beslutning 90 -- */

  /**
   * ⚠ SKÆRMEN SKAL VISE DET SERVEREN HÅNDHÆVER.
   *
   * `facilityplanlaeg` og `opgaveflyt` afviser nu et besøg på Port 3 mens Hal
   * B er lukket — de to reservationer er to STIER og ét fysisk rum. Regnede
   * gitteret stadig hver række for sig, ville det tilbyde et ledigt felt
   * serveren afviser, og det er den værste af de to fejl: man har allerede
   * lovet håndværkeren en tid.
   *
   * Blokken TEGNES som en skygge på de rækker den lukker, frem for at feltet
   * bare forsvinder. En plads man ikke kan bruge og ikke kan se hvorfor,
   * bliver ikke forstået — den bliver rapporteret som en fejl.
   */
  const aktiverMap = useMemo(
    () => Object.fromEntries(aktiver.data.map((a) => [a.id, { lokationId: a.lokationId }])),
    [aktiver.data]);

  const navnFor = (id) =>
    lokationer.data.find((l) => l.id === id)?.navn
    || aktiver.data.find((a) => a.id === id)?.navn
    || id;

  const skygger = useMemo(() => raekker.flatMap((r) => {
    const ider = indeslutninger(
      { ressourceType: typeFor(r.id), ressourceId: r.id }, { aktiver: aktiverMap }
    ).map((x) => x.ressourceId);
    return egneBlokke
      .filter((b) => ider.includes(b.raekkeId))
      .map((b) => ({
        id: `skygge-${r.id}-${b.id}`,
        raekkeId: r.id,
        fra: b.fra, til: b.til,
        label: `Optaget: ${navnFor(b.raekkeId)}`,
        titel: `${navnFor(b.raekkeId)} er lukket i perioden — ${b.titel || "servicebesøg"}`,
        tone: "info",
        skygge: navnFor(b.raekkeId),
      }));
  }), [raekker, egneBlokke, aktiverMap]);

  const blokke = [...egneBlokke, ...skygger];

  /* ---- Træk: flyt et servicebesøg — beslutning 49 ---- */

  const kanFlytteBlok = (b) => {
    if (!maaSkrive) return "Kræver opgaver.skriv.";
    /* ⚠ EN SKYGGE ER IKKE EN BLOK MAN KAN TAGE FAT I. Den står på den række
       den LUKKER, ikke på den række besøget hører til — og en flytning her
       ville skulle gætte hvilken af de to der var ment. Grunden siges frem
       for et tavst nej: uden den ligner skyggen en blok der er gået i stå. */
    if (b.skygge) return `Besøget hører til ${b.skygge} — flyt det dér.`;
    const o = facilityopgaver.find((x) => x.id === b.id);
    if (!o) return "Opgaven kunne ikke findes igen.";
    const svar = kanFlyttes(o);
    return svar.ok ? true : svar.aarsag;
  };

  /**
   * ⚠ RÆKKENS TYPE SENDES MED, IKKE KUN DENS ID.
   * Trækkes et besøg fra Port 3 til Hal B, skifter reservationen fra
   * `facilityAktiv` til `lokation` — og så spærrer den hele hallen frem for én
   * port. Sendte vi kun id'et, skulle serveren gætte hvilken slags række det
   * var, og et gæt her er forskellen på at lukke en port og at lukke en hal.
   */
  const paaFlyt = async (b, { raekkeId, fra }) => {
    const o = facilityopgaver.find((x) => x.id === b.id);
    if (!o) return;
    setFlytSvar(await flytOpgave({
      opgaveId: o.id, foer: o, startMs: fra,
      ressourceType: typeFor(raekkeId), ressourceId: raekkeId,
    }));
    opgaver.genindlaes();
  };

  /* ---- Klik på et ledigt felt: planlæg her — beslutning 51 ---- */

  /* ⚠ SAMME REGNESTYKKE SOM BLOKKENE. `ledigeVinduer()` læser de blokke der
     allerede er lagt ud, så feltet og blokken ikke kan være uenige om hvor der
     er plads. Ét regnestykke, to visninger — som i Disponering. */
  const dropfelter = useMemo(() => {
    const felter = [];
    for (const r of raekker) {
      /* ⚠ SKYGGERNE TÆLLER MED. De ligger allerede i `blokke` med rækkens
         eget id, så et ledigt felt kan ikke opstå oven på en hal der er
         lukket — og skærmen tilbyder dermed ikke en tid serveren afviser.
         Det er hele pointen med at skyggen er en BLOK og ikke en klasse på
         en celle: ét regnestykke bærer både tegningen og ledigheden. */
      const mine = blokke.filter((b) => b.raekkeId === r.id);
      for (const [i, v] of ledigeVinduer(mine, vindueFra, vindueTil).entries()) {
        felter.push({ id: `drop-${r.id}-${i}`, raekkeId: r.id, fra: v.fra, til: v.til });
      }
    }
    return felter;
  }, [vindueFra, vindueTil, raekker.length, blokke.length]);

  /**
   * ⚠ ET DØGN HAR INGEN KLOKKE, OG MIDNAT ER IKKE ET SVAR.
   *
   * Gitteret her tæller i DAGE, så feltets `fra` er lokal midnat. Sendte vi
   * den videre, ville formularen foreslå kl. 00.00 for et servicebesøg —
   * et tidspunkt ingen har valgt, som ser ud som en beslutning. Klokken
   * lægges derfor på her, og den er den samme som formularens eget forslag
   * for en tom dag. Disponerings dagsgitter har problemet ikke: dér er en
   * kolonne en TIME, og klikket peger på et rigtigt klokkeslæt.
   */
  const paaLedigtFelt = (d) => {
    const start = new Date(d.fra);
    start.setHours(8, 0, 0, 0);
    /* ⚠ RÆKKENS TYPE, IKKE KUN DENS ID — samme skel som i paaFlyt. Et felt på
       en lokationsrække planlægger et besøg der spærrer HELE stedet. */
    const type = typeFor(d.raekkeId);
    setPlanlaegger({
      ...(type === "facilityAktiv" ? { aktivId: d.raekkeId } : { lokationId: d.raekkeId }),
      startMs: start.getTime(),
    });
  };

  if (henter || opgaver.henter) return <Henter hvad="servicekalenderen" />;
  /* ⚠ INGEN BLOKERING PÅ MANGLENDE NØGLETAL. En ny kunde har ingen
     aggregerede tal, og skal alligevel kunne bruge skærmen — knappen der
     opretter hans første post sidder på en af dem. Se blokerer(). */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;
  /* En AFVIST læsning af selve noden er derimod ikke en tom kalender. */
  if (blokerer(opgaver.tilstand)) {
    return <Datatilstand tilstand={opgaver.tilstand} genprov={opgaver.genindlaes} />;
  }

  const valgt = facilityopgaver.find((o) => o.id === valgtId) || null;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kpiadgang utilgaengelige={utilgaengelige} />
      {k && (
        <KpiRaekke>
          <KpiKort label="Planlagte besøg" vaerdi={num(k.facility.planlagtVedligehold)} />
          <KpiKort label="Eksterne leverandører" vaerdi={num(k.facility.eksterneLeverandoerer)} />
          <KpiKort label="Reserveret fra sager" vaerdi={num(k.facility.aabneSager)} />
          <KpiKort label="Anslået omkostning" vaerdi={kr(k.facility.anslaaetServiceOere)} note="ekskl. moms" />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort
        titel={`Servicekalender · ${dato(vindueFra)} – ${dato(vindueTil - 1)}`}
        handling={
          <Knap variant="primaer" onClick={() => setPlanlaegger({})}
                disabled={!maaSkrive}
                title={maaSkrive ? undefined : "Kræver opgaver.skriv."}>
            Planlæg service
          </Knap>
        }
      >
        <Gitterkalender
          raekker={raekker} blokke={blokke}
          fra={vindueFra} til={vindueTil} enhed={ENHED.dag}
          valgtId={valgtId} onVaelg={(b) => setValgtId(b.id === valgtId ? null : b.id)}
          onFlyt={paaFlyt}
          kanFlytte={kanFlytteBlok}
          dropfelter={{
            felter: dropfelter,
            tekst: maaSkrive ? "+ Planlæg her" : "Ledigt",
            titel: maaSkrive
              ? "Åbner Planlæg service med anlægget og dagen udfyldt. " +
                "facilityplanlaeg skriver besøget og dets reservation i én " +
                "atomisk opdatering."
              : "Ledigt tidsrum. At planlægge her kræver opgaver.skriv.",
            /* ⚠ INGEN KNAP UDEN PERMISSION. Uden `paaFelt` er feltet hverken
               fokuserbart eller klikbart, og `titel` siger hvorfor. En knap
               serveren afviser, er en pæn knap. */
            paaFelt: maaSkrive ? paaLedigtFelt : undefined,
          }}
          tom="Ingen servicebesøg i perioden."
        />
        <Formularsvar svar={flytSvar} okTekst="Flyttet." />
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Rækkerne er de <b>ressourcer</b> besøgene binder. Et besøg uden et anlæg
          spærrer <b>hele lokationen</b> — gulvarbejdet i Hal B lukker også portene
          i hallen. Gitteret er det samme som Driftskalender og Disponering
          bruger.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          <b>Gitteret opretter nu også.</b> Et ledigt felt åbner <b>Planlæg
          service</b> med anlægget og dagen udfyldt — og et felt på en
          lokationsrække planlægger et besøg der spærrer <b>hele stedet</b>.
          ⚠ Rækkerne er kun de ressourcer der allerede har et besøg; et anlæg
          uden besøg planlægges med knappen foroven.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          ⚠ <b>Trækker du et besøg fra et anlæg til en lokationsrække, skifter
          reservationen TYPE</b> — fra <code>facilityAktiv</code> til{" "}
          <code>lokation</code>. Så spærrer den hele hallen i stedet for én port.
          Det er ikke en detalje: det er forskellen på at lukke en port og at
          lukke stedet.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
        <Reservationen
          besoeg={valgt} lvNavn={lvNavn}
          maaSkrive={maaSkrive}
          onSkiftet={() => opgaver.genindlaes()}
        />
        <Kort titel="Servicebesøg">
          <Tabel
            kolonner={[
              { key: "startMs", label: "Dato", render: (r) => (
                  Number.isFinite(r.startMs)
                    ? `${dato(r.startMs)} ${klokke(r.startMs)}`
                    : <span className="fc-bad">mangler</span>) },
              { key: "hvad", label: "Hvad", render: (r) => (
                  <b>{r.aktivId
                    ? aktiver.data.find((a) => a.id === r.aktivId)?.navn || r.aktivId
                    : lokNavn(r.lokationId) || r.lokationId}</b>) },
              { key: "leverandoerId", label: "Udføres af", render: (r) => (
                  r.leverandoerId ? lvNavn(r.leverandoerId) : "eget personale") },
              { key: "status", label: "Status", render: (r) => (
                  <Pille tone={OPGAVE_STATUS[r.status]?.pill}>
                    {OPGAVE_STATUS[r.status]?.label || r.status}
                  </Pille>) },
              /* ⚠ beloebOere, IKKE estimatOere. Feltet på noden er en
                 OMKOSTNING — værkstedet og facility servicerer vores egen
                 bygning, og et beløb her kan ikke faktureres videre.
                 `estimatOere` var demofilens navn, og det var netop dét der
                 gjorde den til et andet datasæt. */
              { key: "beloebOere", label: "Estimat", num: true, render: (r) => kr(r.beloebOere) },
              { key: "vaelg", label: "", render: (r) => (
                  <Knap onClick={() => setValgtId(r.id)} disabled={r.id === valgtId}>
                    {r.id === valgtId ? "Vist" : "Vis"}
                  </Knap>) },
            ]}
            raekker={facilityopgaver}
            tom="Ingen servicebesøg."
          />
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Et servicebesøg er en <b>opgave med art facility</b> (beslutning 21) —
            samme form som et værkstedsbesøg, bare på et anlæg i stedet for en bil.
            Tabellen viser <b>noden</b>, ikke et demosæt: den og gitteret læser
            den samme liste.
          </p>
        </Kort>
      </Gitter>

      {/* ⚠ SKIVE 3C — DEN DELTE Sagsvisning, IKKE EN EGEN FACILITY-KOPI. Her
          stod et link til "/flaade" med "sagen er fase 0" — sagen findes nu,
          og genbruger nøjagtig den samme komponent som Driftskalenderen. */}
      {valgt && (
        <Kort titel="Sag">
          <Sagsvisning
            sagId={valgt.sagId || null}
            objektType="opgave"
            objektId={valgt.id}
            art="facility"
            objektLabel={valgt.aktivId
              ? aktiver.data.find((a) => a.id === valgt.aktivId)?.navn || valgt.aktivId
              : lokNavn(valgt.lokationId) || valgt.lokationId}
            emneForslag={valgt.beskrivelse}
            modpartNavnForslag={valgt.leverandoerId ? lvNavn(valgt.leverandoerId) : ""}
            onGenindlaes={() => opgaver.genindlaes()}
          />
        </Kort>
      )}

      {planlaegger && (
        <Servicedialog
          aktiver={aktiver.data}
          lokationer={lokationer.data}
          leverandoerer={leverandoerer.data}
          foraf={planlaegger}
          onLuk={() => setPlanlaegger(false)}
          onGemt={() => { setPlanlaegger(false); opgaver.genindlaes(); genindlaes(); }}
        />
      )}
    </div>
  );
}

/* ---- Den fjerde reservationskilde ------------------------------------- */

/**
 * ⚠ DEN LÆSTE BESØGETS `fra`, `til` OG `sagsnummer` — FELTER NODEN IKKE HAR.
 *
 * Præcis samme fejl som Disponerings detaljepanel havde, og det er tredje gang
 * de navne koster noget. Da skærmen tegnede DEMO_SERVICEBESOEG, virkede det;
 * på en rigtig post ville panelet have skrevet "Invalid Date" i begge ender og
 * ingen sag. Noden bærer `startMs` og `estimeretMin`, og slutningen REGNES.
 *
 * ⚠ OG `lvNavn` KOM UDEFRA SOM EN MODUL-KONST bygget af demofilen. Den er nu
 * en parameter, bygget af den hentede leverandørliste — en underkomponent kan
 * ikke se den ydre komponents variabler, og en modul-konst der slog op i et
 * demosæt, ville vise vores demoværksteds navne hos en rigtig kunde.
 */
function Reservationen({ besoeg, lvNavn, maaSkrive, onSkiftet }) {
  if (!besoeg) {
    return (
      <Kort titel="Reservation">
        <Tom>Vælg et besøg for at se hvilken reservation det ville skrive.</Tom>
      </Kort>
    );
  }

  let r = null, byggefejl = null;
  try { r = reservationFraOpgave(besoeg); } catch (e) { byggefejl = e.message; }
  const pri = prioritetFor(KILDE.facilitySag);
  const heleStedet = !besoeg.aktivId;
  const slut = slutter(besoeg);

  return (
    <Kort titel="Reservationen der ville blive skrevet">
      {byggefejl ? <Fejl>{byggefejl}</Fejl> : (
        <>
          <MiniLinje label="Arbejde" vaerdi={besoeg.beskrivelse} />
          <MiniLinje
            label="Udføres af"
            vaerdi={besoeg.leverandoerId ? lvNavn(besoeg.leverandoerId) : "eget personale"}
          />
          <MiniLinje label="Fra" vaerdi={datoTid(besoeg.startMs)} />
          {/* ⚠ EN OPGAVE UDEN ESTIMAT HAR INGEN SLUTNING, og det er ikke det
              samme som at den slutter med det samme. Gitteret giver den et
              synligt minimum for at kunne tegne den; panelet siger sandheden. */}
          <MiniLinje
            label="Til"
            vaerdi={slut
              ? `${datoTid(slut)} (eksklusiv)`
              : <span className="fc-bad">intet estimat</span>}
          />

          <div style={{ borderTop: "1px solid var(--bc-line)", margin: "12px 0" }} />

          <MiniLinje label="Ressource" vaerdi={<code>{r.ressourceType}</code>} />
          <MiniLinje label="Ressource-id" vaerdi={<code>{r.ressourceId}</code>} />
          <MiniLinje label="Kilde" vaerdi={<code>{r.kilde.type}</code>} />
          <MiniLinje
            label="Prioritet"
            vaerdi={<><b>{pri}</b> — taber til værksted (40) og fravær (30), vinder over booking (10)</>}
          />

          {heleStedet && (
            <p className="fc-hint" style={{ marginTop: 12 }}>
              ⚠ Besøget har <b>intet anlæg</b> og spærrer derfor <b>hele lokationen</b>.
              Ressourcen er <code>lokation</code> og ikke <code>facilityAktiv</code> —
              lukker man hallen, er alle porte i den også optaget.
            </p>
          )}

          <p className="fc-hint" style={{ marginTop: 12, fontStyle: "italic" }}>
            {/* ⚠ REFERENCEN ER OPGAVENS id, IKKE ET SAGSNUMMER. Nummeret stod
                på demofilens poster; noden bærer det ikke, og `sager/` findes
                ikke i firebase.rules.json endnu (beslutning 20 er fase 0). Et
                nummer skrevet af på opgaven ville drive fra sagen. */}
            „{konfliktTekst(r, { kilde: { type: KILDE.facilitySag, reference: besoeg.id } })}“
          </p>
          <p className="fc-hint" style={{ marginTop: 12 }}>
            <b>Den fjerde kilde krævede ingen ny kode.</b> Et servicebesøg er en opgave
            med art <b>facility</b>, og <code>reservationFraOpgave()</code> giver
            allerede kilde <b>facilitySag</b>. Beslutning 4 er én node, fire kilder.
          </p>
          {/* ⚠ HER STOD "Reservationen skrives ikke endnu — konfliktfriheden
              hører i en Cloud Function". Den findes: `opgaveflyt` flytter
              besøget og dets reservation atomisk (beslutning 49), og
              `opgavestatus` skifter status og reservationens følge
              (beslutning 50). Begge prøver ledigheden server-side, hvor to
              skrivninger i samme sekund kan afgøres. */}
          <div style={{ marginTop: 14 }}>
            <Statusskifte opgave={besoeg} maaSkrive={maaSkrive} onSkiftet={onSkiftet} />
          </div>
          <p className="fc-hint" style={{ marginTop: 10 }}>
            <b>Flyt</b> besøget ved at <b>trække blokken</b> i kalenderen. Slippes
            den på en <b>lokationsrække</b>, spærrer den hele stedet i stedet for
            ét anlæg — og det er ikke en detalje, det er forskellen på at lukke en
            port og at lukke en hal.
          </p>
        </>
      )}
    </Kort>
  );
}
