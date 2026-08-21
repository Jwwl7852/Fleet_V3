/* src/moduler/booking/Disponering.jsx
 * Disponering
 *
 * TO FORRETNINGER, TO NODER — beslutning 21.
 *
 *   Dagsvisning   opgaver med art 'vaerksted'. Timer, 06–18, én dag.
 *   Ugesvisning   etaper. Døgn, syv dage, ETA over døgngrænser og
 *                 grænseovergange.
 *
 * Det er ikke to zoomniveauer af samme datamodel: `opgaver.status`
 * (indberettet → planlagt → igang → udfoert) er et andet maskineri end etapens
 * `tilstand` (kladde → afventerPlan → afventerKoord → reserveret). Skærmen
 * læser derfor to noder og blander dem aldrig sammen i ét gitter.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  ⚠ DAGSGITTERET SKRIVER NU — UGESGITTERET GØR IKKE, OG DE TO GRUNDE ER
 *  IKKE DEN SAMME.
 *
 *  DAG (opgaver). Et ledigt tidsrum åbner `Planlaegdialog` med bilen og
 *  tidspunktet udfyldt; en blok kan TRÆKKES til et andet tidspunkt eller en
 *  anden bil. `opgaveplanlaeg` og `opgaveflyt` skriver opgaven OG dens
 *  reservation i én atomisk opdatering — beslutning 45 og 49.
 *
 *  UGE (etaper). Her flyttes der ingenting, og det er ikke et hul der mangler
 *  at blive lukket. Det man disponerer, er en ETAPE, og en etape bindes ved at
 *  GODKENDE ET FORSLAG — med tid, pris, enheder og chauffør. Et træk kan ikke
 *  udpege et forslag der ikke findes, og en skærm der lavede sit eget forslag
 *  ud af hvor blokken blev sluppet, ville være en anden vej til det samme felt
 *  (beslutning 40). Detaljepanelet FØRER derfor til Forslag.
 *
 *  ⚠ OG LINKET DERTIL VAR I STYKKER. Det pegede på `/booking/forslag` uden id,
 *  mens ruten er `/booking/forslag/:id` — så `path="*"` sendte brugeren til
 *  Dashboardet. Et link der lander et forkert sted, ser ud til at virke.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ⚠ OG SKÆRMEN LÆSER NU DE NODER DEN PÅSTOD AT LÆSE.
 *
 * Hovedet her har hele tiden sagt at dagsvisningen læser `opgaver` med art
 * `vaerksted`. Den læste `DEMO_BESOEG` — som selv var blevet en **afledt
 * visning** af `DEMO_OPGAVER`, altså et demo-datasæt for en node der ER
 * seedet. Og de to har ikke samme felter: besøget bar `fra`, `til` og `type`,
 * noden bærer `startMs`, `estimeretMin` og `arbejdstype`. Detaljepanelet
 * skrev derfor tomt på hver eneste rigtige opgave.
 *
 * ⚠ VÆRRE VAR RÆKKERNE. Begge gitre byggede deres rækker af
 * `DEMO_KOERETOEJER` og filtrerede dem på de id'er kundens etaper peger på.
 * Hos en rigtig kunde matcher de id'er ingenting — så **ugegitteret ville
 * stå tomt**, uden at nogen havde slettet en bil. Samme mønster som
 * Bookingopsætnings egen kopi af divisionsfilteret: usynlig indtil den ene
 * side flyttede sig.
 *
 * Chaufføren, hans kompetencer og leverandørnavnet kom samme sted fra. En
 * udløbet kompetence BLOKERER i `etapeskift`, og skærmen viste en anden
 * mands beviser. Se `test/demo-i-skaerm.test.mjs` — loftet er sat ned.
 *
 * DE FEM TJEK LIGGER I `fleet/disponering.js` — ÉT sted.
 *
 *   kanDisponeres()      en trailer kan ikke køre alene
 *   kraevedeKompetencer() + tjekKompetencer()   en udløbet kompetence blokerer
 *   kanBaere()           m³ og kg hver for sig
 *   tjekLedigMod()       reservationskonflikt på tværs af de tre kilder
 *   tjekKoerehviletid()  4,5 t før pause, 9 t i døgnet
 *
 * ⚠ SKÆRMEN VISER DEM; SERVEREN HÅNDHÆVER DEM — MED SAMME FUNKTION.
 * `tjekDisponering()` kaldes begge steder, og `etapeskift` afviser med den
 * SAMME sætning som står her. Skrev serveren sin egen udgave, ville skærmen
 * sige ja hvor serveren sagde nej, uden at nogen kunne se hvorfor.
 *
 * ⚠ OG KOMPETENCEN PRØVES MOD ETAPENS SLUTNING, ikke mod nu. Et ADR-bevis der
 * udløber på tirsdag, er gyldigt når disponenten trykker og udløbet når turen
 * kører på fredag. Det stod her som en fejl indtil en prøve satte udløbet to
 * dage ude i fremtiden og fik grønt.
 *
 * ⚠ KONFLIKTTALLET ER IKKE kpi.disponering.konflikter. KPI-tallet dækker hele
 * platformen; panelet nederst regner på det VISTE VINDUE. To tal der begge
 * hedder "konflikter" ville være beslutning 6 brudt, så panelet skriver
 * eksplicit hvilket udsnit det er.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";
import { num, pct, dato, klokke, datoTid } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand,
  Gitter, MiniLinje, Formularsvar, Knap,
} from "../../fleet/ui.jsx";
import Gitterkalender from "../../fleet/Gitterkalender.jsx";
import { ENHED, ledigeVinduer } from "../../fleet/gitter.js";
import { tjekDisponering } from "../../fleet/disponering.js";
import {
  KOERETOEJ_STATUS,
} from "../../fleet/flaade.js";
import { tjekKoerehviletid, koerehviletidTekst } from "../../fleet/koerehviletid.js";
import { reservationFraOpgave } from "../../fleet/opgaver.js";
import { flytOpgave, kanFlyttes } from "../../fleet/opgaveplan.js";
import Planlaegdialog from "../../fleet/Planlaegdialog.jsx";
import Statusskifte from "../../fleet/Statusskifte.jsx";
import Forslagsdialog from "./Forslagsdialog.jsx";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harModul } from "../../fleet/moduler.js";
import {
  reservationerFraEtape, graenseLabel, krydserGraense, tjekGeografi, enhedsIder,
  straekningFraEtape,
} from "../../fleet/etaper.js";
import {
  FORSLAGBARE_TILSTANDE, TILSTAND } from "../../fleet/booking-state.js";
import { OPGAVE_STATUS, ARBEJDSTYPE, ressourceId } from "../../fleet/opgaver.js";
import { slutter, raekkerIVindue } from "../../fleet/driftskalender.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_PERSONALE, DEMO_KOMPETENCER } from "../../fleet/demo-personale.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";

/* Leverandørnavnet slås op — posterne bærer et leverandoerId, ikke en
   fritekststreng. Fem filer havde hver sin stavemåde at drive med. */
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";

const DAG = 86400000;
const T = 3600000;

/* Dagsvisningen er 06–18. Et værksted åbner ikke kl. 00, og 24 kolonner hvoraf
   halvdelen altid er tomme gør de timer der betyder noget smallere. */
const DAG_FRA_TIME = 6;
const DAG_TIL_TIME = 18;

/* ---- Reservationer på tværs af de tre kilder -------------------------- */

/**
 * Beslutning 4 i praksis: ÉN node, tre kilder. Her bygges listen af de tre
 * demo-datasæt, så konflikttjekket kan se dem alle sammen.
 *
 * Uden det ville hver kilde have sin egen kalender, og en etape kunne lægges
 * oven på et værkstedsbesøg uden at nogen opdagede det — det er præcis den
 * fejl beslutning 4 lukkede.
 */
/* ⚠ NODEFORMEN, IKKE EN FLAD LISTE. reservationer/<type>/<id>/<resId> er
   sådan noden ser ud, og `tjekDisponering()` slår op i den form — serveren
   læser den direkte fra basen. Byggede demo-sættet en anden form, ville de
   to sider stille det samme spørgsmål på hver sin måde, og kun den ene
   ville blive rettet den dag formen ændrede sig. */
/**
 * Reservationerne fra NODEN, plus værkstedsbesøgene som ikke har en.
 *
 * ⚠ HER BLEV ALLE TRE KILDER BYGGET AF DEMO-DATA. Etaperne og fraværet ligger
 * i `reservationer` — samme node `etapeskift` håndhæver imod — så skærmen
 * stillede sit spørgsmål på sit eget grundlag og serveren på sit. To sider,
 * ét spørgsmål, hver sin liste.
 *
 * ⚠ OG DE VAR IKKE ENS. Målt på den udrullede base indeholdt noden KUN
 * bookinger: 7 køretøj + 6 medarbejder, og intet fravær. Skærmen viste en
 * konflikt på en sygemeldt chauffør som serveren ikke kendte — skærmen VISER,
 * funktionen HÅNDHÆVER, og de to var uenige i den farlige retning.
 * Provisioneringen udleder nu fraværet med den samme
 * `reservationFraFravaer()`.
 *
 * ⚠ VÆRKSTEDSOPGAVERNE HAR INGEN RESERVATION I NODEN, og det er et hul der
 * skal skrives ned frem for skjules. Prioritet 40 — den højeste, højere end
 * en booking — bygges derfor her i skærmen, og `etapeskift` kan **ikke** se
 * at bilen står på liften. Kun `opgaveplanlaeg` skriver en opgaves
 * reservation, og de opgaver der blev oprettet før den funktion fandtes, har
 * ingen. Se README.
 *
 * ⚠ MEN OPGAVERNE SELV KOMMER NU FRA NODEN. De blev bygget af `DEMO_BESOEG`,
 * som siden er blevet en AFLEDT visning af `DEMO_OPGAVER` — altså et
 * demo-datasæt for en node der er seedet. Skærmen spærrede for kundens biler
 * på grundlag af vores demoværksteds besøg.
 */
function byggReservationer(fraNoden, vaerkstedsopgaver = []) {
  /* Noden er allerede på formen reservationer/<type>/<id>/<resId>;
     tjekDisponering() slår op i netop den form, og serveren læser den
     direkte fra basen. Her lægges opgaverne oven i den samme form. */
  const ud = {};
  for (const [type, prRessource] of Object.entries(fraNoden || {})) {
    ud[type] = {};
    for (const [resId, poster] of Object.entries(prRessource || {})) {
      ud[type][resId] = Object.entries(poster || {}).map(([id, r]) => ({ id, ...r }));
    }
  }
  const laeg = (id, r) => {
    ud[r.ressourceType] ??= {};
    ud[r.ressourceType][r.ressourceId] ??= [];
    ud[r.ressourceType][r.ressourceId].push({ id, ...r });
  };
  for (const o of vaerkstedsopgaver) {
    /* ⚠ EN OPGAVE UDEN VINDUE SPRINGES OVER — den kaster. `startMs` uden
       `estimeretMin` er ikke et besøg af nul længde; det er et besøg vi ikke
       kender længden på, og et gættet vindue ville spærre en bil i et
       tidsrum ingen har besluttet. Se slutter() i driftskalender.js. */
    try { laeg(`r-${o.id}`, reservationFraOpgave(o)); } catch { /* uden vindue */ }
  }
  return ud;
}

/* ⚠ DE FEM TJEK LIGGER IKKE HER LÆNGERE.

   De stod som en lokal `tjekAlt()` i denne fil, indtil `etapeskift` skulle
   håndhæve dem. Serveren skal stille NØJAGTIG de samme spørgsmål, og en
   afskrift ville betyde at skærmen sagde ja hvor serveren sagde nej — uden
   at nogen kunne se hvorfor. De bor nu i `fleet/disponering.js`, som
   kopieres til `functions/delt/`.

   Skærmen VISER dem stadig; den afgør stadig ingenting. Se hovedet. */

/* ---- Skærmen ---------------------------------------------------------- */

export default function Disponering() {
  const { kpi: k, henter, tilstand, genindlaes } = useKpi();
  const { division, bruger, moduler } = useFleet();
  const [fane, setFane] = useState("dag");
  const [valgtId, setValgtId] = useState(null);
  /* `null` = lukket. Ellers etapen der foreslås på. */
  const [foreslaar, setForeslaar] = useState(null);
  /* `null` = lukket. Et objekt = åben med gitterets forslag i hånden. */
  const [planlaegger, setPlanlaegger] = useState(null);
  const [flytSvar, setFlytSvar] = useState(null);

  /* ⚠ PERMISSIONEN, IKKE ROLLEN — og KUN til at tegne kontrollen. Serveren
     spørger om den samme, og det er dér den afgøres. */
  const maaPlanlaegge = harPerm(bruger?.perms, PERM.opgaverSkriv);
  /* ⚠ EN ANDEN PERMISSION END GODKENDELSEN — beslutning 5. Disponenten
     laver forslagene og må ikke godkende sit eget. */
  const maaForeslaa = harPerm(bruger?.perms, PERM.bookingForeslaa);

  const iDag = new Date(); iDag.setHours(0, 0, 0, 0);
  const D0 = iDag.getTime();

  const dagFra = D0 + DAG_FRA_TIME * T;
  const dagTil = D0 + DAG_TIL_TIME * T;
  const ugeFra = D0;
  const ugeTil = D0 + 7 * DAG;

  /* ⚠ NODEN, IKKE EN KOPI. `reservationer` er et TRÆ — type → ressource →
     reservation — og ikke en liste af poster. useListe giver derfor rækker
     der ER ressourcetyperne ("koeretoej", "medarbejder"), med ressourcerne
     som krop; træet samles igen nedenfor. Formen er nodens, ikke skærmens:
     `tjekDisponering()` slår op i netop den, og serveren læser den direkte. */
  const resv = useListe("reservationer", {
    vindue: "alle", division: "alle", graense: 50,
  });

  /* ⚠ ETAPERNE ER OGSÅ EN NODE. De blev læst fra demo-sættet mens
     `etapeskift` skrev til noden — så en etape man lige havde flyttet, stod
     uændret i gitteret. division: "alle": gitteret viser hele flåden, og en
     bus-etape hører på kalenderen også når Gods er valgt.

     vindueDage dækker bagud; `fremDage` frem, fordi en disponeringskalender
     per definition kigger FREM. useListe kaster hvis man sender både lig og
     vindue, så det er det ene felt der bruges på tid. */
  const etaperListe = useListe("etaper", {
    ordnPaa: "fra", vindue: "fremad", fremDage: 60, vindueDage: 60,
    division: "alle", graense: 500,
  });
  const etaper = etaperListe.data;

  /* ⚠ FIRE NODER MERE — OG DE VAR ALLE FIRE DEMOFILEN.
     Gitterets RÆKKER blev bygget af `DEMO_KOERETOEJER`, chaufføren og hans
     kompetencer af `demo-personale.js`, og dagsvisningen af `DEMO_BESOEG`.
     Alle fire noder er seedet, så en rigtig kunde så vores demoflåde som
     rækker — og fordi rækkerne filtreres på de id'er hans etaper peger på,
     ville ugegitteret stå TOMT uden at nogen havde slettet en bil.

     `division: "alle"`: gitteret viser hele flåden. Stamdata bærer i øvrigt
     ikke feltet (beslutning 19), og en bus-etape hører på kalenderen også
     når Gods er valgt. */
  const koeretoejer = useListe("koeretoejer", {
    division: "alle", vindue: "alle", graense: 500, demo: DEMO_KOERETOEJER,
  });
  const personale = useListe("personale", {
    division: "alle", vindue: "alle", graense: 500, demo: DEMO_PERSONALE,
  });
  const kompetencer = useListe("kompetencer", {
    division: "alle", vindue: "alle", graense: 500, demo: DEMO_KOMPETENCER,
  });
  const leverandoerer = useListe("leverandoerer", {
    division: "alle", vindue: "alle", graense: 200, demo: DEMO_LEVERANDOERER,
  });
  /* ⚠ SAMME OPSLAG SOM DRIFTSKALENDEREN. Ét vindue, ét ordnPaa — to skærme
     der læste den samme node forskelligt, ville vise hver sin dag. */
  const opgaver = useListe("opgaver", {
    ordnPaa: "startMs", vindue: "fremad", vindueDage: 120, fremDage: 365,
    division: "alle", graense: 500, demo: DEMO_OPGAVER,
  });

  const lvNavn = (id) => leverandoerNavn(leverandoerer.data, id);

  const fraNoden = useMemo(
    () => Object.fromEntries(resv.data.map(({ id, ...prRessource }) => [id, prRessource])),
    [resv.data]);

  /* --- Dagsvisning: opgaver med art vaerksted --- */
  /* ⚠ ARTEN, IKKE ET DEMOSÆT. `opgaver` bærer både værksted og facility
     (beslutning 21), og de to har ikke samme feltskema. Dagsvisningen er
     værkstedet; facility har sin egen skærm på den SAMME node. */
  const vaerkstedsopgaver = useMemo(
    () => opgaver.data.filter((o) => o.art === "vaerksted"),
    [opgaver.data]);

  const reservationer = useMemo(
    () => byggReservationer(fraNoden, vaerkstedsopgaver),
    [fraNoden, vaerkstedsopgaver]);
  const personEfterId = useMemo(
    () => new Map(personale.data.map((p) => [p.id, p])), [personale.data]);
  const bilEfterId = useMemo(
    () => new Map(koeretoejer.data.map((b) => [b.id, b])), [koeretoejer.data]);

  /* ⚠ VINDUET REGNES AF `startMs` + `slutter()`, IKKE AF `fra`/`til`.
     Noden bærer ikke de to felter — det var `DEMO_BESOEG`, som er en afledt
     visning. `slutter()` svarer `null` for en opgave uden estimat frem for at
     regne videre på startMs; en opgave uden vindue kan ikke tegnes, men den
     forsvinder ikke — `raekkerIVindue()` giver den et døgn så rækken findes,
     og blokken får et synligt minimum. */
  const dagensOpgaver = useMemo(() => vaerkstedsopgaver.filter((o) => {
    if (!Number.isFinite(o.startMs)) return false;
    const slut = slutter(o) ?? o.startMs + T;
    return o.startMs < dagTil && dagFra < slut;
  }), [vaerkstedsopgaver, dagFra, dagTil]);

  const dagRaekker = useMemo(
    () => raekkerIVindue(dagensOpgaver, dagFra, dagTil, koeretoejer.data).map((b) => ({
      id: b.id, label: b.kaldenavn, under: b.navn,
      pille: <Pille tone={KOERETOEJ_STATUS[b.status]?.pill}>{KOERETOEJ_STATUS[b.status]?.label}</Pille>,
    })),
    [dagensOpgaver, dagFra, dagTil, koeretoejer.data]);

  const dagBlokke = useMemo(() => dagensOpgaver
    .filter((o) => ressourceId(o))
    .map((o) => ({
      id: o.id, raekkeId: ressourceId(o), fra: o.startMs,
      /* Én time er nok til at blokken kan ses og klikkes; den foregiver ikke
         at være en varighed nogen har besluttet. Samme greb som gitteret i
         Driftskalenderen. */
      til: slutter(o) ?? o.startMs + T,
      label: [ARBEJDSTYPE[o.arbejdstype], o.leverandoerId ? lvNavn(o.leverandoerId) : null]
        .filter(Boolean).join(" · ") || o.beskrivelse,
      titel: o.beskrivelse, tone: OPGAVE_STATUS[o.status]?.pill,
    })), [dagensOpgaver, leverandoerer.data]);

  /* ---- Træk: flyt en værkstedsopgave — beslutning 49 ---- */

  /**
   * ⚠ SAMME FUNKTION SOM SERVEREN AFVISER MED. `kanFlyttes()` ligger i
   * `opgaveplan-regler.js` og kopieres til `functions/delt/`; skærmen sætter
   * markøren efter den, serveren afgør efter den. Skrev skærmen sin egen
   * udgave, ville en blok se ud til at kunne trækkes og blive afvist i det
   * øjeblik man slap den.
   */
  const kanFlytteBlok = (b) => {
    if (!maaPlanlaegge) return "Kræver opgaver.skriv.";
    const o = vaerkstedsopgaver.find((x) => x.id === b.id);
    if (!o) return "Opgaven kunne ikke findes igen.";
    const svar = kanFlyttes(o);
    return svar.ok ? true : svar.aarsag;
  };

  /**
   * ⚠ KUN STARTEN FLYTTES — VARIGHEDEN ER OPGAVENS EGEN.
   * Blokkens `til` er ikke altid opgavens slutning: `dagBlokke` giver en
   * opgave uden estimat ÉN TIME, så den kan ses og klikkes. Sendte vi
   * `estimeretMin` regnet af blokken, ville den time blive et rigtigt estimat,
   * og bilen ville være spærret i et tidsrum ingen har besluttet. `kanFlyttes`
   * afviser i øvrigt sådan en opgave helt — af samme grund.
   */
  const paaFlyt = async (b, { raekkeId, fra }) => {
    const o = vaerkstedsopgaver.find((x) => x.id === b.id);
    if (!o) return;
    setFlytSvar(await flytOpgave({
      opgaveId: o.id, foer: o, startMs: fra,
      ressourceType: "koeretoej", ressourceId: raekkeId,
    }));
    /* Genindlæs uanset udfaldet: lykkedes den, står gitteret ellers med den
       gamle placering; blev den afvist, kan en anden have skrevet imens. */
    opgaver.genindlaes();
  };

  /* Drop-felterne beregnes af SAMME data som blokkene — se ledigeVinduer(). */
  const dagDropfelter = useMemo(() => {
    const felter = [];
    for (const r of dagRaekker) {
      const mine = dagBlokke.filter((b) => b.raekkeId === r.id);
      for (const [i, v] of ledigeVinduer(mine, dagFra, dagTil).entries()) {
        /* Under en time er der ikke plads til en værkstedsopgave. */
        if (v.til - v.fra < T) continue;
        felter.push({ id: `drop-${r.id}-${i}`, raekkeId: r.id, fra: v.fra, til: v.til });
      }
    }
    return felter;
  }, [dagFra, dagTil, dagRaekker.length]);

  /* --- Ugesvisning: etaper --- */
  const ugensEtaper = etaper.filter(
    (e) => enhedsIder(e).length && e.fra < ugeTil && ugeFra < e.til
  );
  const ugeRaekker = useMemo(() => {
    /* ⚠ ALLE ETAPENS ENHEDER FÅR EN RÆKKE. En sættevognstur optager både
       trækkeren og traileren, og tegnede gitteret kun trækkeren, ville
       traileren se fri ud i hele turen — præcis den fejl reservationen på
       begge enheder findes for at undgå. */
    const ider = new Set(ugensEtaper.flatMap(enhedsIder));
    return koeretoejer.data.filter((b) => ider.has(b.id)).map((b) => ({
      id: b.id, label: b.kaldenavn, under: b.navn,
    }));
  }, [ugeFra, ugeTil, koeretoejer.data]);

  /* Én blok pr. (etape, enhed): turen tegnes på hver af sine enheders rækker. */
  const ugeBlokke = ugensEtaper.flatMap((e) => enhedsIder(e).map((raekkeId) => ({
    id: `${e.id}__${raekkeId}`, raekkeId, fra: e.fra, til: e.til,
    label: `${e.fraSted} → ${e.tilSted}`,
    titel: `${e.fraSted} → ${e.tilSted} · ETA ${e.etaMs ? datoTid(e.etaMs) : "ukendt"}` +
           (krydserGraense(e) ? ` · ${e.graenseovergange.map(graenseLabel).join(", ")}` : " · kun Danmark"),
    tone: e.tilstand === "reserveret" ? "ok" : e.tilstand === "afventerKoord" ? "warn" : "info",
  })));

  if (henter) return <Henter hvad="disponering" />;
  if (!k) return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;

  /* --- Tjekkene, kørt på det viste vindue --- */
  const fund = [];
  for (const e of ugensEtaper) {
    const enheder = enhedsIder(e).map((id) => bilEfterId.get(id)).filter(Boolean);
    const person = personEfterId.get(e.personId);
    /* ⚠ KUNDENS BEVISER, IKKE DEMOSÆTTETS. En udløbet kompetence BLOKERER i
       `etapeskift`, og skærmen skal vise det samme svar som serveren giver —
       med demofilen viste den en anden chaufførs beviser. */
    const hansKompetencer = kompetencer.data.filter((c) => c.personId === e.personId);
    /* Chaufførens strækninger i vinduet — køre-hviletid gælder personen, ikke
       turen, så alle hans ture skal med. */
    /* ⚠ ALLE HANS TURE, OGSÅ DEM UDEN FOR VINDUET. Køre-hviletid gælder
       PERSONEN, ikke turen — men listen her er den hentede, og et vindue på
       60 dage er bredere end døgn- og ugereglerne rækker. Hentede vi kun
       ugen, ville en tur fra i søndags falde ud af ugesummen. */
    const straekninger = etaper
      .filter((x) => x.personId === e.personId)
      .map(straekningFraEtape);

    const resv = reservationerFraEtape(e).map((r, i) => ({ id: `r-${e.id}-${i}`, ...r }));
    for (const f of tjekDisponering({
      reservationerForEtapen: resv,
      enheder,
      person, kompetencer: hansKompetencer, reservationer, straekninger,
      gods: e.maengde,
    })) {
      fund.push({ ...f, id: `${e.id}-${fund.length}`, hvor: `${e.id} · ${e.fraSted} → ${e.tilSted}` });
    }

    const geo = tjekGeografi(e);
    if (!geo.ok) fund.push({ id: `${e.id}-geo`, tjek: "Geografi", tone: "bad", tekst: geo.aarsag, hvor: e.id });
  }

  const valgt = ugensEtaper.find((e) => e.id === valgtId)
    || dagensOpgaver.find((o) => o.id === valgtId) || null;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Planlagte opgaver" vaerdi={num(k.disponering.planlagteOpgaver)} />
        <KpiKort label="Uplanlagte" vaerdi={num(k.opgaver.uplanlagte)} />
        <KpiKort label="Ledig kapacitet" vaerdi={pct(k.disponering.ledigKapacitetPct)} />
        <KpiKort label="Konflikter" vaerdi={num(k.disponering.konflikter)} note="hele platformen" />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Disponering">
        <div className="fc-faner" role="tablist" aria-label="Visning">
          <button type="button" role="tab" className="fc-fane" aria-selected={fane === "dag"}
                  onClick={() => setFane("dag")}>
            Dag — værksted
          </button>
          <button type="button" role="tab" className="fc-fane" aria-selected={fane === "uge"}
                  onClick={() => setFane("uge")}>
            Uge — langtur
          </button>
        </div>

        {fane === "dag" ? (
          <>
            <p className="fc-hint" style={{ marginBottom: 12 }}>
              <b>{dato(D0)}</b>, kl. {DAG_FRA_TIME}–{DAG_TIL_TIME}. Dagsvisningen læser{" "}
              <b>opgaver</b> med art <b>vaerksted</b> — varighed i timer. Ugesvisningen
              læser en anden node.
            </p>
            <Gitterkalender
              raekker={dagRaekker} blokke={dagBlokke}
              fra={dagFra} til={dagTil} enhed={ENHED.time}
              valgtId={valgtId} onVaelg={(b) => setValgtId(b.id === valgtId ? null : b.id)}
              onFlyt={paaFlyt}
              kanFlytte={kanFlytteBlok}
              dropfelter={{
                felter: dagDropfelter,
                tekst: maaPlanlaegge ? "+ Planlæg her" : "Ledigt",
                titel: maaPlanlaegge
                  ? "Åbner Planlæg aktivitet med bilen og tidspunktet udfyldt. " +
                    "opgaveplanlaeg skriver opgaven og dens reservation i én " +
                    "atomisk opdatering."
                  : "Ledigt tidsrum. At planlægge her kræver opgaver.skriv.",
                /* ⚠ INGEN KNAP UDEN PERMISSION. Uden `paaFelt` er feltet ikke
                   fokuserbart og har ingen klik-handler — og `titel` siger
                   hvorfor. En knap der afvises af serveren, er en pæn knap. */
                paaFelt: maaPlanlaegge
                  ? (d) => setPlanlaegger({ koeretoejId: d.raekkeId, startMs: d.fra })
                  : undefined,
              }}
              tom="Ingen værkstedsopgaver i dag."
            />
          </>
        ) : (
          <>
            <p className="fc-hint" style={{ marginBottom: 12 }}>
              <b>{dato(ugeFra)} – {dato(ugeTil - 1)}</b>. Ugesvisningen læser <b>etaper</b> —
              ETA over døgngrænser og grænseovergange. Det man disponerer er en{" "}
              <b>etape</b>, ikke en booking.
            </p>
            <Gitterkalender
              raekker={ugeRaekker} blokke={ugeBlokke}
              fra={ugeFra} til={ugeTil} enhed={ENHED.dag}
              valgtId={valgtId} onVaelg={(b) => setValgtId(b.id === valgtId ? null : b.id)}
              tom="Ingen etaper i perioden."
            />
          </>
        )}

        <Formularsvar svar={flytSvar} okTekst="Flyttet." />

        <p className="fc-hint" style={{ marginTop: 12 }}>
          <b>Dagsgitteret skriver.</b> Et ledigt tidsrum åbner{" "}
          <b>Planlæg aktivitet</b> med bilen og tidspunktet udfyldt, og en blok kan{" "}
          <b>trækkes</b> til et andet tidspunkt eller en anden bil.{" "}
          <code>opgaveplanlaeg</code> og <code>opgaveflyt</code> skriver opgaven{" "}
          <b>og</b> dens reservation i én atomisk opdatering — <code>opgaver</code>{" "}
          og <code>reservationer</code> er <b>.write: false</b> for alle, og de to
          bærer den samme kendsgerning.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          ⚠ <b>Ugesgitteret skriver ikke, og det er ikke et hul.</b> Det man
          disponerer dér, er en <b>etape</b>, og en etape bindes ved at godkende et{" "}
          <b>forslag</b> — med tid, pris, enheder og chauffør. Et træk kan ikke
          udpege et forslag der ikke findes, og en skærm der lavede sit eget, ville
          være en anden vej til det samme felt (beslutning 40). Vælg en blok, og gå
          videre til <b>Forslag</b> fra panelet.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Konflikter fund={fund} kpiTal={k.disponering.konflikter} />
        <div className="fc-grid">
          <Uplanlagte etaper={etaper} />
          <Detalje
            post={valgt} personEfterId={personEfterId} lvNavn={lvNavn}
            maaSkrive={maaPlanlaegge}
            onSkiftet={() => opgaver.genindlaes()}
            maaForeslaa={maaForeslaa}
            onForeslaa={() => setForeslaar(valgt)}
          />
        </div>
      </Gitter>

      {foreslaar && (
        <Forslagsdialog
          etape={foreslaar}
          biler={koeretoejer.data}
          personale={personale.data}
          onLuk={() => setForeslaar(null)}
          onGemt={() => { setForeslaar(null); etaper.genindlaes?.(); }}
        />
      )}

      {/* ⚠ SAMME DIALOG SOM DRIFTSKALENDEREN BRUGER. Den lå inde i
          Vaerkstedskalender.jsx indtil beslutning 49; to formularer til den
          SAMME node ville være to steder at være uenige om feltskemaet, og den
          ene ville før eller siden glemme valideOpgaveplan(). */}
      {planlaegger && (
        <Planlaegdialog
          enheder={koeretoejer.data}
          leverandoerer={leverandoerer.data}
          harProcure={harModul(moduler, "indkoeb")}
          division={division}
          foraf={planlaegger}
          onLuk={() => setPlanlaegger(null)}
          onGemt={() => { setPlanlaegger(null); opgaver.genindlaes(); }}
        />
      )}
    </div>
  );
}

/* ---- Konflikter og advarsler ------------------------------------------ */

function Konflikter({ fund, kpiTal }) {
  return (
    <Kort titel={`Konflikter og advarsler i det viste vindue (${fund.length})`}>
      {/* Beslutning 6: to tal der begge hedder "konflikter" må ikke kunne
          forveksles. KPI-kortet øverst er hele platformen; det her er vinduet. */}
      <p className="fc-hint" style={{ marginBottom: 12 }}>
        Det her er <b>et andet udsnit</b> end KpiKortet øverst.{" "}
        <b>{num(kpiTal)}</b> er platformens samlede tal fra <code>kpi/</code>;{" "}
        <b>{num(fund.length)}</b> er hvad de fem tjek finder i den viste periode.
        De skal ikke gå op mod hinanden.
      </p>

      <Tabel
        kolonner={[
          { key: "tjek", label: "Tjek", render: (r) => (
              <Pille tone={r.tone}>{r.tjek}</Pille>) },
          { key: "hvor", label: "Hvor" },
          { key: "tekst", label: "Hvad" },
        ]}
        raekker={fund}
        tom="Ingen af de fem tjek finder noget i perioden."
      />

      <p className="fc-hint" style={{ marginTop: 12 }}>
        De fem tjek <b>blokerer ikke her</b> — de vises. Håndhævelsen ligger i{" "}
        <code>etapeskift</code>, som kalder <b>den samme</b>{" "}
        <code>tjekDisponering()</code> og afviser med den samme sætning. Lå
        kontrollen i skærmen, kunne en direkte skrivning gå uden om den.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        {koerehviletidTekst(tjekKoerehviletid([]))}
      </p>
    </Kort>
  );
}

/* ---- Uplanlagt: åbne etaper ------------------------------------------- */

function Uplanlagte({ etaper }) {
  /* ⚠ ETAPERNE KOMMER IND. De blev hentet i den ydre komponent, og en
     underkomponent kan ikke se den variabel — praecis som KILDER i
     Leverandoerer.jsx og sensitivt i Indberetninger.jsx. Byggeriet siger
     ingenting: en ReferenceError ved rendering er ikke en byggefejl. */
  /* ⚠ DE AABNE ETAPER KOM FRA demoAabneEtaper(), som filtrerer DEMO_ETAPER.
     En AABEN etape venter paa en passende tur — det er hele grunden til at
     skaermen findes — og den stod med demo-saettets, ikke kundens. */
  const aabne = etaper.filter((e) => e.tilstand === "aaben");
  return (
    <Kort titel={`Uplanlagt (${aabne.length})`}>
      <Tabel
        kolonner={[
          { key: "rute", label: "Rute", render: (r) => <b>{r.fraSted} → {r.tilSted}</b> },
          { key: "senestMs", label: "Frist", render: (r) => (r.senestMs
              ? dato(r.senestMs)
              : <span className="fc-bad">mangler</span>) },
          { key: "maengde", label: "Gods", num: true,
            render: (r) => `${num(r.maengde?.m3)} m³` },
        ]}
        raekker={aabne}
        tom="Ingen åbne etaper."
      />
      <p className="fc-hint" style={{ marginTop: 10 }}>
        <b>aaben</b> er en tilstand, ikke fravær af planlægning — den kan forespørges
        og bærer en <b>frist</b>. Uden frist fyldes lageret med gods ingen henter.
        Et match bliver et <b>forslag</b>, aldrig en reservation: koordinatoren
        godkender stadig.
      </p>
    </Kort>
  );
}

/* ---- Detaljepanel ------------------------------------------------------ */

function Detalje({ post, personEfterId, lvNavn, maaSkrive, onSkiftet,
                   maaForeslaa, onForeslaa }) {
  if (!post) {
    return (
      <Kort titel="Detaljer">
        <Tom>Vælg en blok i gitteret.</Tom>
      </Kort>
    );
  }

  /* En etape har fraSted; en værkstedsopgave har et værksted. */
  const erEtape = Boolean(post.fraSted);
  if (!erEtape) {
    /* ⚠ NODENS FELTNAVNE. Her stod `type`, `fra` og `til` — de tre felter
       `DEMO_BESOEG` bar, og som noden IKKE har. Panelet skrev derfor tomt på
       hver eneste rigtige opgave. Se noten ved FELT i opgaver.js: det er
       tredje gang de navne har kostet noget. */
    const slut = slutter(post);
    return (
      <Kort titel={post.beskrivelse}>
        <MiniLinje label="Arbejdstype" vaerdi={ARBEJDSTYPE[post.arbejdstype] || "—"} />
        <MiniLinje label="Værksted" vaerdi={post.leverandoerId ? lvNavn(post.leverandoerId) : "eget værksted"} />
        <MiniLinje label="Start" vaerdi={Number.isFinite(post.startMs) ? klokke(post.startMs) : "—"} />
        {/* ⚠ EN OPGAVE UDEN ESTIMAT HAR INGEN SLUTNING — og det er ikke det
            samme som at den slutter med det samme. Gitteret giver den et
            synligt minimum for at kunne tegne den; panelet siger sandheden. */}
        <MiniLinje
          label="Slut"
          vaerdi={slut ? `${klokke(slut)} (eksklusiv)` : <span className="fc-bad">intet estimat</span>}
        />
        <MiniLinje label="Status" vaerdi={
          <Pille tone={OPGAVE_STATUS[post.status]?.pill}>
            {OPGAVE_STATUS[post.status]?.label || post.status}
          </Pille>} />
        <MiniLinje label="Art" vaerdi={<code>{post.art}</code>} />
        <MiniLinje label="Division" vaerdi={post.division} />
        {/* ⚠ SAMME KNAPPER SOM DRIFTSKALENDEREN OG SERVICEKALENDEREN.
            Komponenten tegner dem af `OPGAVE_OVERGANGE`, så de tre skærme ikke
            kan blive uenige om hvilke skift der findes — og serveren afviser
            med den SAMME maskine. Beslutning 50. */}
        <div style={{ marginTop: 14 }}>
          <Statusskifte opgave={post} maaSkrive={maaSkrive} onSkiftet={onSkiftet} />
        </div>
      </Kort>
    );
  }

  const person = personEfterId.get(post.personId);
  return (
    <Kort
      titel={`${post.fraSted} → ${post.tilSted}`}
      handling={<Pille tone={TILSTAND[post.tilstand]?.pill}>{TILSTAND[post.tilstand]?.label}</Pille>}
    >
      {/* ⚠ LINKET NEDERST PÅ SKÆRMEN PEGEDE PÅ `/booking/forslag` UDEN ID.
          Ruten er `/booking/forslag/:id`, så `path="*"` sendte brugeren stille
          og roligt til Dashboardet — et link der aldrig har virket, og som
          ingen kunne se var i stykker, fordi det LANDEDE et sted.
          Vejen til godkendelsen hører desuden her, ved den etape man har valgt,
          og ikke i en fodnote: gitteret skal FØRE til Forslag frem for at få
          sin egen kopi af handlingen. */}
      <MiniLinje
        label="Booking"
        vaerdi={post.bookingId
          ? <Link className="fc-a" to={`/booking/forslag/${post.bookingId}`}>
              <code>{post.bookingId}</code> — se forslag
            </Link>
          : <span className="fc-bad">mangler</span>}
      />
      <MiniLinje label="Etape" vaerdi={`nr. ${post.nr}`} />
      <MiniLinje label="Afgang" vaerdi={datoTid(post.fra)} />
      <MiniLinje label="ETA" vaerdi={post.etaMs ? datoTid(post.etaMs) : "—"} />
      <MiniLinje label="Chauffør" vaerdi={person?.navn || "—"} />
      <MiniLinje label="Gods" vaerdi={`${num(post.maengde?.m3)} m³ · ${num(post.maengde?.kg)} kg`} />
      <MiniLinje
        label="Grænseovergange"
        vaerdi={krydserGraense(post)
          ? post.graenseovergange.map(graenseLabel).join(", ")
          : <Pille tone="info">Kun kørsel i Danmark</Pille>}
      />
      <MiniLinje
        label="Passager"
        vaerdi={Object.keys(post.passager || {}).length
          ? Object.entries(post.passager).map(([p, n]) => `${p} ×${n}`).join(", ")
          : "—"}
      />
      {/* ⚠ HER STOPPEDE FLOWET. Panelet FØRTE til Forslag — men Forslag
          VÆLGER mellem forslag, og ingenting kunne lave et. Overgangen
          `afventerPlan → afventerKoord` kræver `kraeverForslag`, altså en
          forudsætning ingen kunne opfylde. Se beslutning 58. */}
      {FORSLAGBARE_TILSTANDE.includes(post.tilstand) && (
        <div style={{ marginTop: 14 }}>
          <Knap variant="primaer" onClick={onForeslaa} disabled={!maaForeslaa}
                title={maaForeslaa ? undefined : `Kræver ${PERM.bookingForeslaa}.`}>
            Foreslå tur
          </Knap>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Et forslag <b>spærrer ingenting</b> — reservationen skrives når
            koordinatoren godkender. Og det må <b>du ikke selv</b>
            (beslutning 5).
          </p>
        </div>
      )}

      <p className="fc-hint" style={{ marginTop: 12 }}>
        Passagerne er prismotorens input — <b>beregnForloeb()</b> regner på dem.
        De skal være geografisk mulige: Storebælt og Femern udelukker hinanden,
        for man kører den ene vej eller den anden.{" "}
        <Link className="fc-a" to="/booking/opsaetning">Se satserne</Link>.
      </p>
    </Kort>
  );
}
