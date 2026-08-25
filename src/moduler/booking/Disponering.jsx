/* src/moduler/booking/Disponering.jsx
 * Disponering
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ⚠ SKIVE 3A — DAGSVISNINGEN (VÆRKSTEDET) ER FLYTTET TIL FLEET.
 *
 * Skærmen viste indtil nu TO forretninger på to noder: opgaver med art
 * `vaerksted` i et dagsgitter (06–18, én dag), og etaper i et ugesgitter
 * (syv dage, ETA over døgngrænser). De var aldrig samme datamodel —
 * `opgaver.status` er et andet maskineri end etapens `tilstand` — men de
 * stod på samme skærm, som om Planning ejede begge.
 *
 * Det gjorde det ikke. Værkstedsplanlægning har sit KANONISKE hjem i Fleet
 * → Driftskalenderen (`flaade/Vaerkstedskalender.jsx`), som allerede havde
 * det SAMME gitter med det SAMME `Planlaegdialog`/`flytOpgave()`/
 * `kanFlyttes()` — to steder at planlægge den samme opgave er to steder at
 * være uenige om den. Disponering fokuserer nu på det ordet faktisk betyder
 * her: TRANSPORTETAPER — ruter, forslag, køretøj/trailer, chauffør,
 * konflikter og advarsler.
 *
 * ⚠ MEN DEN VISER STADIG VÆRKSTEDET — SOM EN SPÆRRING, IKKE ET GITTER.
 * En bil på løftet kan ikke køre en tur, uanset hvad disponenten har lovet.
 * `byggReservationer()` nedenfor bygger derfor stadig værkstedsopgavernes
 * reservationer (prioritet 40, den højeste) af `reservationFraOpgave()` —
 * den SAMME funktion Driftskalenderen bruger — og lægger dem ind i
 * konflikttjekket for ugens etaper. Det er ikke en rest af dagsgitteret;
 * det er selve grunden til at de fem tjek her kan stole på om en bil er
 * ledig. Se README's Canonical-home-regel.
 *
 * ⚠ OG FORSLAG & GODKENDELSE ER NU ET PANEL, IKKE ET LINK VÆK.
 * `<ForslagOgReservation>` — den samme komponent som ruten
 * `/booking/forslag/:id` — åbnes i et `<Dialog>` fra en valgt etapes
 * detaljepanel. Deep link'et virker uændret; se Forslag.jsx's egen note.
 * ═══════════════════════════════════════════════════════════════════════
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
import { num, pct, dato, datoTid } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand,
  Gitter, MiniLinje, Formularsvar, Knap, Dialog, Kpiadgang } from "../../fleet/ui.jsx";
import Gitterkalender from "../../fleet/Gitterkalender.jsx";
import { ENHED } from "../../fleet/gitter.js";
import { tjekDisponering } from "../../fleet/disponering.js";
import { tjekKoerehviletid, koerehviletidTekst } from "../../fleet/koerehviletid.js";
import { reservationFraOpgave } from "../../fleet/opgaver.js";
import Forslagsdialog from "./Forslagsdialog.jsx";
import { ForslagOgReservation } from "./Forslag.jsx";
import { traekForslag } from "../../fleet/disponer.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import {
  reservationerFraEtape, graenseLabel, krydserGraense, tjekGeografi, enhedsIder,
  straekningFraEtape,
} from "../../fleet/etaper.js";
import {
  FORSLAGBARE_TILSTANDE, aktiveForslag, kanTraekkeForslag, MAKS_FORSLAG, TILSTAND } from "../../fleet/booking-state.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_PERSONALE, DEMO_KOMPETENCER } from "../../fleet/demo-personale.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { blokerer } from "../../fleet/datatilstand.js";

const DAG = 86400000;

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
  const { kpi: k, henter, tilstand, genindlaes, utilgaengelige } = useKpi();
  const { bruger } = useFleet();
  const [valgtId, setValgtId] = useState(null);
  /* `null` = lukket. Ellers etapen der foreslås på. */
  const [foreslaar, setForeslaar] = useState(null);
  /* Id'et på det forslag der trækkes lige nu — så knappen kan sige det. */
  const [traekker, setTraekker] = useState(null);
  const [traekSvar, setTraekSvar] = useState(null);
  /* ⚠ SKIVE 3A — `null` = lukket, ellers et bookingId. Panelet der ÅBNER
     `ForslagOgReservation` uden at forlade Disponering — se Forslag.jsx's
     egen note om hvorfor det er den SAMME komponent som deep link'et. */
  const [forslagPanel, setForslagPanel] = useState(null);

  /* ⚠ EN ANDEN PERMISSION END GODKENDELSEN — beslutning 5. Disponenten
     laver forslagene og må ikke godkende sit eget. */
  const maaForeslaa = harPerm(bruger?.perms, PERM.bookingForeslaa);

  const iDag = new Date(); iDag.setHours(0, 0, 0, 0);
  const D0 = iDag.getTime();
  const ugeFra = D0;
  const ugeTil = D0 + 7 * DAG;

  /* ⚠ NODEN, IKKE EN KOPI. `reservationer` er et TRÆ — type → ressource →
     reservation — og ikke en liste af poster. useListe giver derfor rækker
     der ER ressourcetyperne ("koeretoej", "medarbejder"), med ressourcerne
     som krop; træet samles igen nedenfor. Formen er nodens, ikke skærmens:
     `tjekDisponering()` slår op i netop den, og serveren læser den direkte. */
  const resv = useListe("reservationer", {
    vindue: "alle", graense: 50,
  });

  /* ⚠ ETAPERNE ER OGSÅ EN NODE. De blev læst fra demo-sættet mens
     `etapeskift` skrev til noden — så en etape man lige havde flyttet, stod
     uændret i gitteret. Gitteret viser hele flåden — der er ingen division
     at dele den på længere (beslutning 70).

     vindueDage dækker bagud; `fremDage` frem, fordi en disponeringskalender
     per definition kigger FREM. useListe kaster hvis man sender både lig og
     vindue, så det er det ene felt der bruges på tid. */
  const etaperListe = useListe("etaper", {
    ordnPaa: "fra", vindue: "fremad", fremDage: 60, vindueDage: 60,
    graense: 500,
  });
  const etaper = etaperListe.data;

  /* ⚠ FIRE NODER MERE — OG DE VAR ALLE FIRE DEMOFILEN.
     Gitterets RÆKKER blev bygget af `DEMO_KOERETOEJER`, chaufføren og hans
     kompetencer af `demo-personale.js`, og dagsvisningen af `DEMO_BESOEG`.
     Alle fire noder er seedet, så en rigtig kunde så vores demoflåde som
     rækker — og fordi rækkerne filtreres på de id'er hans etaper peger på,
     ville ugegitteret stå TOMT uden at nogen havde slettet en bil.

     Gitteret viser hele flåden. Stamdata bar i forvejen ikke feltet
     (beslutning 19), og aksen findes ikke længere (70). */
  const koeretoejer = useListe("koeretoejer", {
    vindue: "alle", graense: 500, demo: DEMO_KOERETOEJER,
  });
  const personale = useListe("personale", {
    vindue: "alle", graense: 500, demo: DEMO_PERSONALE,
  });
  const kompetencer = useListe("kompetencer", {
    vindue: "alle", graense: 500, demo: DEMO_KOMPETENCER,
  });
  /* ⚠ SAMME OPSLAG SOM DRIFTSKALENDEREN. Ét vindue, ét ordnPaa — to skærme
     der læste den samme node forskelligt, ville vise hver sin dag. */
  const opgaver = useListe("opgaver", {
    ordnPaa: "startMs", vindue: "fremad", vindueDage: 120, fremDage: 365,
    graense: 500, demo: DEMO_OPGAVER,
  });

  const fraNoden = useMemo(
    () => Object.fromEntries(resv.data.map(({ id, ...prRessource }) => [id, prRessource])),
    [resv.data]);

  /* --- Værkstedsopgaver: kun til konflikttjekket, se hovedets Skive 3A-note --- */
  /* ⚠ ARTEN, IKKE ET DEMOSÆT. `opgaver` bærer både værksted og facility
     (beslutning 21), og de to har ikke samme feltskema. Fleet har sin egen
     skærm til værkstedet; facility har sin egen skærm på den SAMME node. */
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

  /* Én blok pr. (etape, enhed): turen tegnes på hver af sine enheders rækker.
     ⚠ SKIVE 3A — FUNDET UNDERVEJS, IKKE INDFØRT HER. `id` er et SAMMENSAT
     `${etapeId}__${raekkeId}`, fordi en sættevogn giver etapen to blokke (en
     pr. enhed) og Gitterkalender bruger `id` som både React-key og som
     `valgtId`-sammenligning — to blokke med samme id ville krascht React.
     Men "Detaljer"-panelet slog altid op med DEN SAMME sammensatte streng
     mod `ugensEtaper`s rene etape-id'er, som aldrig kunne matche — så
     panelet nedenfor kunne IKKE åbnes ved at klikke en blok i ugegitteret,
     for INGEN etape nogensinde. Det var derfor jeg ikke kunne verificere
     forslags-panelet: fejlen laa foran det, ikke i det. `etapeId` er tilføjet
     som sit eget felt, adskilt fra det sammensatte `id` som stadig styrer
     key/highlight uændret — se `valgt` nedenfor. */
  const ugeBlokke = ugensEtaper.flatMap((e) => enhedsIder(e).map((raekkeId) => ({
    id: `${e.id}__${raekkeId}`, etapeId: e.id, raekkeId, fra: e.fra, til: e.til,
    label: `${e.fraSted} → ${e.tilSted}`,
    titel: `${e.fraSted} → ${e.tilSted} · ETA ${e.etaMs ? datoTid(e.etaMs) : "ukendt"}` +
           (krydserGraense(e) ? ` · ${e.graenseovergange.map(graenseLabel).join(", ")}` : " · kun Danmark"),
    tone: e.tilstand === "reserveret" ? "ok" : e.tilstand === "afventerKoord" ? "warn" : "info",
  })));

  if (henter) return <Henter hvad="disponering" />;
  /**
   * ⚠ BLOKÉR KUN PÅ DET DER FAKTISK BLOKERER.
   *
   * Her stod `if (!k) return …` — og skærmen blankede når nøgletallene
   * manglede, selv om tabellerne nedenunder læses DIREKTE fra basen og havde
   * indhold. En kunde med data i basen så en tom skærm.
   *
   * `blokerer()` er sand for en AFVISNING og for manglende forbindelse — der
   * er intet at tegne — og falsk for "ikke aggregeret endnu", som er en
   * oplysning. Nøgletallene bærer da null og skriver INTET (—), og
   * `<Datatilstand>` siger hvorfor ÉN gang. Se beslutning 73.
   */
  if (blokerer(tilstand)) {
    return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;
  }

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

  /* ⚠ `valgtId` ER STADIG DET SAMMENSATTE blok-id — uændret, så Gitterkalenderens
     egen fremhævning (`valgtId === b.id`) rammer præcis den klikkede blok, ikke
     begge en sættevogns rækker. Etapen slås op i ÉT ekstra led, via blokkens
     `etapeId`. Se noten ved ugeBlokke. */
  const valgtBlok = ugeBlokke.find((b) => b.id === valgtId) || null;
  const valgt = valgtBlok ? ugensEtaper.find((e) => e.id === valgtBlok.etapeId) || null : null;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kpiadgang utilgaengelige={utilgaengelige} />
      <KpiRaekke>
        <KpiKort label="Planlagte opgaver" vaerdi={num(k.disponering.planlagteOpgaver)} />
        <KpiKort label="Uplanlagte" vaerdi={num(k.opgaver.uplanlagte)} />
        {/* ⚠ LEDIG KAPACITET STÅR MED EN STREG, OG DEN BLIVER STÅENDE.
            Det er ikke et manglende seed: "ledig kapacitet i hvilken periode,
            og målt i hvad" er et spørgsmål der ikke er stillet færdigt.
            Vogntimer, m³ og antal enheder peger forskellige veje. En streg er
            et ubesvaret spørgsmål; et tal ville være et gæt der ser ud som en
            måling. Se beslutning 60. */}
        <KpiKort label="Ledig kapacitet" vaerdi={pct(k.disponering.ledigKapacitetPct)}
                 note="definitionen mangler" />
        {/* ⚠ HULLET STÅR VED SIDEN AF TALLET. En etape uden ETA eller uden
            frist kan ikke vurderes, og uden tællingen ville et lavt tal se ud
            som et rent hus. Samme greb som opgaver.udenTidsregistrering. */}
        <KpiKort label="Forsinkelsesrisiko" vaerdi={num(k.disponering.forsinkelsesrisiko)}
                 note={k.disponering.udenEtaEllerFrist
                   ? `${k.disponering.udenEtaEllerFrist} kan ikke vurderes`
                   : "ETA efter frist"} />
        <KpiKort label="Konflikter" vaerdi={num(k.disponering.konflikter)} note="hele platformen" />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Disponering">
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          <b>{dato(ugeFra)} – {dato(ugeTil - 1)}</b>. Skærmen læser <b>etaper</b> —
          ETA over døgngrænser og grænseovergange. Det man disponerer er en{" "}
          <b>etape</b>, ikke en booking.
        </p>
        <Gitterkalender
          raekker={ugeRaekker} blokke={ugeBlokke}
          fra={ugeFra} til={ugeTil} enhed={ENHED.dag}
          valgtId={valgtId} onVaelg={(b) => setValgtId(b.id === valgtId ? null : b.id)}
          tom="Ingen etaper i perioden."
        />

        <p className="fc-hint" style={{ marginTop: 12 }}>
          ⚠ <b>Gitteret skriver ikke, og det er ikke et hul.</b> Det man
          disponerer her, er en <b>etape</b>, og en etape bindes ved at godkende et{" "}
          <b>forslag</b> — med tid, pris, enheder og chauffør. Et træk kan ikke
          udpege et forslag der ikke findes, og en skærm der lavede sit eget, ville
          være en anden vej til det samme felt (beslutning 40). Vælg en blok, og gå
          videre til <b>Forslag</b> fra panelet.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          ⚠ <b>Værkstedsopgaver planlægges i Fleet.</b> Deres kanoniske hjem er{" "}
          <Link className="fc-a" to="/flaade">Driftskalenderen</Link> — skærmen her
          viser stadig at en bil på værksted er spærret (se konflikttjekket
          nedenfor), men opretter og flytter den ikke.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Konflikter fund={fund} kpiTal={k.disponering.konflikter} />
        <div className="fc-grid">
          <Uplanlagte etaper={etaper} />
          <Detalje
            post={valgt} personEfterId={personEfterId}
            maaForeslaa={maaForeslaa}
            onForeslaa={() => setForeslaar(valgt)}
            onAabnForslag={(bookingId) => setForslagPanel(bookingId)}
            traekker={traekker}
            onTraek={async (f) => {
              setTraekker(f.id);
              const r = await traekForslag({ etapeId: valgt.id, forslagId: f.id });
              setTraekker(null);
              setTraekSvar(r);
              if (r.ok) etaper.genindlaes?.();
            }}
          />
        </div>
      </Gitter>

      <Formularsvar svar={traekSvar} okTekst="Forslaget er trukket tilbage." />

      {foreslaar && (
        <Forslagsdialog
          etape={foreslaar}
          biler={koeretoejer.data}
          personale={personale.data}
          onLuk={() => setForeslaar(null)}
          onGemt={() => { setForeslaar(null); etaper.genindlaes?.(); }}
        />
      )}

      {/* ⚠ SKIVE 3A — DEN KANONISKE FORSLAG-/GODKENDELSESOPLEVELSE, I ET
          PANEL. Samme `ForslagOgReservation` som ruten `/booking/forslag/:id`
          — se Forslag.jsx's egen note. Et deep link til den underliggende
          booking virker uændret; det her er blot en KONTEKSTUEL indgang fra
          den etape man allerede kigger på. */}
      {forslagPanel && (
        <Dialog bred titel="Forslag & reservation" onLuk={() => setForslagPanel(null)}>
          <ForslagOgReservation bookingId={forslagPanel} />
        </Dialog>
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

/**
 * ⚠ SKIVE 3A — KUN ETAPER. Panelet viste før ENTEN en etape ELLER en
 * værkstedsopgave, fordi gitteret ovenfor kunne vælge begge dele. Nu
 * vælger gitteret kun etaper, og en gren der aldrig kan rammes, er værre
 * end ingen — den ser ud som dækning. Værkstedsopgavens eget detaljepanel
 * (arbejdstype, værksted, `Statusskifte`) hører nu i Fleet →
 * Driftskalenderen, som allerede havde sit eget (`Haendelsespanel`).
 */
function Detalje({ post, personEfterId, maaForeslaa, onForeslaa,
                   onAabnForslag, onTraek, traekker }) {
  if (!post) {
    return (
      <Kort titel="Detaljer">
        <Tom>Vælg en blok i gitteret.</Tom>
      </Kort>
    );
  }

  const person = personEfterId.get(post.personId);
  return (
    <Kort
      titel={`${post.fraSted} → ${post.tilSted}`}
      handling={<Pille tone={TILSTAND[post.tilstand]?.pill}>{TILSTAND[post.tilstand]?.label}</Pille>}
    >
      {/* ⚠ SKIVE 3A — ÅBNER PANELET, NAVIGERER IKKE VÆK. Linket herunder
          pegede før på `/booking/forslag/:id` og forlod Disponering; nu
          åbner den SAMME `ForslagOgReservation` (se hovedets note) i et
          `<Dialog>` uden at man mister sit sted i gitteret. Deep link'et er
          uændret for den der kommer udefra. */}
      <MiniLinje
        label="Booking"
        vaerdi={post.bookingId
          ? <button type="button" className="fc-a"
                    style={{ background: "none", border: 0, padding: 0, cursor: "pointer",
                             font: "inherit", fontWeight: 650, textAlign: "left" }}
                    onClick={() => onAabnForslag(post.bookingId)}>
              <code>{post.bookingId}</code> — se forslag
            </button>
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
          {/* ⚠ DE AKTIVE FORSLAG STÅR HER, MED EN VEJ TILBAGE.
              Loftet er tre, og uden en tilbagetrækning var en etape med tre
              forslag LÅST: koordinatoren kan returnere den og bede om nye, og
              disponenten kunne ikke lave dem. Beslutning 59. */}
          {aktiveForslag(post).length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {aktiveForslag(post).map((f) => {
                const maa = kanTraekkeForslag(post, f.id);
                return (
                  <div key={f.id} className="fc-sum">
                    <span>Forslag {f.nr} · {datoTid(f.afhentningMs)}</span>
                    <Knap disabled={!maaForeslaa || !maa.ok || traekker === f.id}
                          title={maaForeslaa ? maa.aarsag || undefined
                                             : `Kræver ${PERM.bookingForeslaa}.`}
                          onClick={() => onTraek(f)}>
                      {traekker === f.id ? "Trækker …" : "Træk tilbage"}
                    </Knap>
                  </div>
                );
              })}
              <p className="fc-hint">
                {aktiveForslag(post).length} af {MAKS_FORSLAG} aktive. Et trukket
                forslag <b>slettes ikke</b> — det bliver liggende med et
                tidspunkt, for koordinatoren har måske set det.
              </p>
            </div>
          )}
          <Knap variant="primaer" onClick={onForeslaa}
                disabled={!maaForeslaa || aktiveForslag(post).length >= MAKS_FORSLAG}
                title={!maaForeslaa ? `Kræver ${PERM.bookingForeslaa}.`
                  : aktiveForslag(post).length >= MAKS_FORSLAG
                    ? `Der er ${MAKS_FORSLAG} aktive forslag. Træk et tilbage.`
                    : undefined}>
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
