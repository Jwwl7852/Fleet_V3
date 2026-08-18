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
 *  ⚠ STADIG INGEN DRAG-AND-DROP — MEN TJEKKENE HÅNDHÆVES NU.
 *
 *  `etapeskift` er bygget: den udfører etapens tilstandsskift server-side og
 *  skriver reservationerne i SAMME atomiske opdatering. `etaper` og
 *  `reservationer` er stadig `.write: false` for alle — vejen ind er
 *  funktionen.
 *
 *  Det interaktive gitter mangler stadig. Det er et UI-spørgsmål nu, ikke et
 *  platformsspørgsmål: der er noget at kalde.
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
import { num, pct, dato, klokke, datoTid } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand,
  Gitter, MiniLinje,
} from "../../fleet/ui.jsx";
import Gitterkalender from "../../fleet/Gitterkalender.jsx";
import { ENHED, ledigeVinduer } from "../../fleet/gitter.js";
import { tjekDisponering } from "../../fleet/disponering.js";
import {
  KOERETOEJ_STATUS,
} from "../../fleet/flaade.js";
import { tjekKoerehviletid, koerehviletidTekst } from "../../fleet/koerehviletid.js";
import { reservationFraOpgave } from "../../fleet/opgaver.js";
import {
  reservationerFraEtape, graenseLabel, krydserGraense, tjekGeografi, enhedsIder,
  straekningFraEtape,
} from "../../fleet/etaper.js";
import { TILSTAND } from "../../fleet/booking-state.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_PERSONALE, DEMO_KOMPETENCER } from "../../fleet/demo-personale.js";
import { DEMO_BESOEG, BESOEG_STATUS, OMKOSTNINGSTYPE } from "../../fleet/demo-vaerksted.js";

/* Leverandørnavnet slås op — posterne bærer et leverandoerId, ikke en
   fritekststreng. Fem filer havde hver sin stavemåde at drive med. */
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
const lvNavn = (id) => leverandoerNavn(DEMO_LEVERANDOERER, id);

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
 * ⚠ VÆRKSTEDSBESØGENE BYGGES STADIG HER, og det er et hul der skal skrives
 * ned frem for skjules: `besoeg` har INGEN node. Prioritet 40 — den højeste,
 * højere end en booking — findes derfor kun i skærmen, og `etapeskift` kan
 * ikke se at bilen står på liften. Se README.
 */
function byggReservationer(fraNoden) {
  /* Noden er allerede på formen reservationer/<type>/<id>/<resId>;
     tjekDisponering() slår op i netop den form, og serveren læser den
     direkte fra basen. Her lægges besøgene oven i den samme form. */
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
  for (const b of DEMO_BESOEG) {
    try { laeg(`r-${b.id}`, reservationFraOpgave(b)); } catch { /* ufuldstændig demo-post */ }
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
  const { kpi: k, henter, fejl, tilstand, genindlaes } = useKpi();
  const [fane, setFane] = useState("dag");
  const [valgtId, setValgtId] = useState(null);

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
  const fraNoden = useMemo(
    () => Object.fromEntries(resv.data.map(({ id, ...prRessource }) => [id, prRessource])),
    [resv.data]);
  const reservationer = useMemo(() => byggReservationer(fraNoden), [fraNoden]);
  const personEfterId = new Map(DEMO_PERSONALE.map((p) => [p.id, p]));
  const bilEfterId = new Map(DEMO_KOERETOEJER.map((b) => [b.id, b]));

  /* --- Dagsvisning: opgaver med art vaerksted --- */
  const dagensOpgaver = DEMO_BESOEG.filter((b) => b.fra < dagTil && dagFra < b.til);
  const dagRaekker = useMemo(() => {
    const ider = new Set(dagensOpgaver.map((o) => o.koeretoejId));
    return DEMO_KOERETOEJER.filter((b) => ider.has(b.id)).map((b) => ({
      id: b.id, label: b.kaldenavn, under: b.navn,
      pille: <Pille tone={KOERETOEJ_STATUS[b.status]?.pill}>{KOERETOEJ_STATUS[b.status]?.label}</Pille>,
    }));
  }, [dagFra, dagTil]);

  const dagBlokke = dagensOpgaver.map((o) => ({
    id: o.id, raekkeId: o.koeretoejId, fra: o.fra, til: o.til,
    label: `${OMKOSTNINGSTYPE[o.type]} · ${lvNavn(o.leverandoerId)}`,
    titel: o.beskrivelse, tone: BESOEG_STATUS[o.status]?.tone,
  }));

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
    return DEMO_KOERETOEJER.filter((b) => ider.has(b.id)).map((b) => ({
      id: b.id, label: b.kaldenavn, under: b.navn,
    }));
  }, [ugeFra, ugeTil]);

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
    const kompetencer = DEMO_KOMPETENCER.filter((c) => c.personId === e.personId);
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
      person, kompetencer, reservationer, straekninger, gods: e.maengde,
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
              dropfelter={{
                felter: dagDropfelter,
                tekst: "Træk opgave hertil",
                titel: "Ikke bygget endnu. Disponering skrives af en Cloud Function der " +
                       "reserverer atomisk — to disponenter kan ramme samme sekund.",
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

        <p className="fc-hint" style={{ marginTop: 12 }}>
          ⚠ <b>Fase 0 er en visning.</b> Der er ingen drag-and-drop og ingen skrivning.
          Feltet <b>Træk opgave hertil</b> er en attrap: rigtig disponering skriver
          etapens enhed og dens reservation i <b>én transaktion</b> fra en Cloud
          Function, og <code>etaper</code> er <b>.write: false</b> indtil den findes.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Konflikter fund={fund} kpiTal={k.disponering.konflikter} />
        <div className="fc-grid">
          <Uplanlagte etaper={etaper} />
          <Detalje post={valgt} personEfterId={personEfterId} />
        </div>
      </Gitter>
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
        Det er <b>første gang de fem tjek faktisk kaldes</b>. De har været bygget og
        testet uden at nogen kaldte dem. Men de <b>blokerer ikke her</b> — de vises.
        Håndhævelsen hører i den Cloud Function der skriver etapen; ligger den i
        skærmen, kan en direkte skrivning gå uden om den.
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

function Detalje({ post, personEfterId }) {
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
    return (
      <Kort titel={post.beskrivelse}>
        <MiniLinje label="Type" vaerdi={OMKOSTNINGSTYPE[post.type]} />
        <MiniLinje label="Værksted" vaerdi={lvNavn(post.leverandoerId)} />
        <MiniLinje label="Fra" vaerdi={klokke(post.fra)} />
        <MiniLinje label="Til" vaerdi={`${klokke(post.til)} (eksklusiv)`} />
        <MiniLinje label="Art" vaerdi={<code>{post.art}</code>} />
        <MiniLinje label="Division" vaerdi={post.division} />
      </Kort>
    );
  }

  const person = personEfterId.get(post.personId);
  return (
    <Kort
      titel={`${post.fraSted} → ${post.tilSted}`}
      handling={<Pille tone={TILSTAND[post.tilstand]?.pill}>{TILSTAND[post.tilstand]?.label}</Pille>}
    >
      <MiniLinje label="Booking" vaerdi={<code>{post.bookingId}</code>} />
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
      <p className="fc-hint" style={{ marginTop: 12 }}>
        Passagerne er prismotorens input — <b>beregnForloeb()</b> regner på dem.
        De skal være geografisk mulige: Storebælt og Femern udelukker hinanden,
        for man kører den ene vej eller den anden.{" "}
        <Link className="fc-a" to="/booking/opsaetning">Se satserne</Link>.
      </p>
    </Kort>
  );
}
