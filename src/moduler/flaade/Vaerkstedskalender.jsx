/* src/moduler/flaade/Vaerkstedskalender.jsx
 * Fleet → Driftskalender. Fleets forside.
 *
 * ⚠ FILNAVNET ER GAMMELT, RUTEN ER NY. Skærmen hed Værkstedskalender og lå på
 * /flaade/vaerksted; den hedder Driftskalender og ligger på /flaade, hvor
 * Enheder lå. Filen bliver liggende under samme navn af samme grund som mappen
 * hedder flaade/ og noden koeretoejer/: et filnavn er billigt at skifte, men
 * det er også det eneste sted "Værkstedskalender" stadig kan slås op fra en
 * ældre commit. Se nav.js.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ SKÆRMEN LÆSER NODEN `opgaver` — IKKE DEMO_BESOEG.
 *
 * Indtil nu tegnede gitteret DEMO_BESOEG fra demo-vaerksted.js, mens
 * provisioneren seedede `opgaver` med DEMO_OPGAVER. To datasæt for én node,
 * og skærmen viste det ene mens nøgletallene blev regnet af det andet — det
 * er Indkøb → Fakturaer om igen, ét klik fra hinanden. De otte besøg ligger nu
 * i DEMO_OPGAVER, og DEMO_BESOEG er en afledt visning af dem.
 *
 * `useListe(node, { demo })` er vejen: sættet bruges KUN når der ingen
 * database er.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ DE FEM KASSER LIGGER IKKE I kpi/, OG DET ER UNDTAGELSEN — IKKE ET BRUD.
 * De er afledt af de lister skærmen allerede henter, og "Kommende" afhænger af
 * et interval brugeren selv sætter: et aggregeret tal ville være regnet på ét
 * vindue og stå forkert i de tre andre. Regnestykket ligger i
 * fleet/driftskalender.js — uden React, så det kan prøves. Se noten dér.
 *
 * ⚠ HVERT KORT TÆLLER PRÆCIS DEN LISTE DETS "ÅBN" VISER. driftstal() giver
 * `poster` med tilbage, og køen får dem gennem sin URL — ikke gennem sin egen
 * gentagelse af filteret. To filtre for samme spørgsmål driver.
 *
 * ⚠ SKÆRMEN SKRIVER — MEN GENNEM SERVEREN, IKKE GENNEM skriv.js.
 * "Planlæg aktivitet" kalder Cloud Function'en `opgaveplanlaeg`, som skriver
 * opgaven OG dens reservation i ÉN update(). `reservationer` er `.write: false`
 * for alle, og de to skal lande sammen eller slet ikke: en opgave uden sin
 * reservation ser FRI ud i disponeringen, hvilket er værre end en spærring man
 * kan se. Dertil kan to disponenter ramme samme sekund. Se fleet/opgaveplan.js.
 *
 * ⚠ OG DEN OVERSKRIVER IKKE EN BOOKING. Et værkstedsbesøg har prioritet 40 og
 * KUNNE slå en booking, men at annullere en er et etapeskift med årsag og
 * historik — `etapeskift`s arbejde. Serveren afviser og siger HVAD der spærrer.
 *
 * ⚠ INGEN MAIL. Mockuppens "Send bekræftelse til leverandøren" er beslutning
 * 20, og den er fase 0: `sager/` står ikke i firebase.rules.json, og der er
 * hverken modtagevej eller afsendelse. En deaktiveret radiogruppe der sagde
 * "ikke bygget", ville være en attrap der opfører sig som en kontrol —
 * formularen skriver i stedet hvad der mangler.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ SKIVE 3A — DE FEM KASSER ÅBNER ET PANEL, IKKE EN NY SIDE.
 *
 * "Åbn" navigerede væk fra kalenderen til `/flaade/koe`. Kalenderen ER
 * Fleets primære arbejdsflade (se hovedet), så et klik der forlod den for at
 * vise et tal man allerede kunne se på kortet, konkurrerede med den. Kortets
 * "Åbn" åbner nu den SAMME `ArbejdskoeIndhold` (fra Arbejdskoe.jsx) i et
 * `<Dialog>` — ét filter, ét driftstal()-kald, ingen kopi. "Åbn i nyt
 * vindue" er urørt: det er et rigtigt browservindue på den kanoniske rute,
 * og et nyt vindue arver ingen React-tilstand.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, dato, datoTid, kr, filstoerrelse } from "../../fleet/format.js";
import {
  Kort, KpiRaekke, Pille, Knap, Henter, Datatilstand,
  Gitter, MiniLinje, Faner, Dialog, Delknap, DELIKON, Ikon, Formularsvar, Tabel,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { Modulfakturaer } from "../../fleet/Modulfakturaer.jsx";
import Gitterkalender from "../../fleet/Gitterkalender.jsx";
import {
  VISNING, ALLE_VISNINGER, FREMAD, STANDARD_FREMAD,
  vindueFor, flyt, driftstal, slutter, raekkerIVindue,
} from "../../fleet/driftskalender.js";
import {
  OPGAVE_STATUS, ARBEJDSTYPE, ressourceId, reservationFraOpgave,
} from "../../fleet/opgaver.js";
import { PRIORITET, prioritetFor } from "../../fleet/prioritet.js";
import { flytOpgave, kanFlyttes } from "../../fleet/opgaveplan.js";
import Planlaegdialog from "../../fleet/Planlaegdialog.jsx";
import Statusskifte from "../../fleet/Statusskifte.jsx";
import { ArbejdskoeIndhold } from "./Arbejdskoe.jsx";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { KILDE, prioritetFor as reservationsPrioritet } from "../../fleet/reservations.js";
import { KOERETOEJ_STATUS } from "../../fleet/flaade.js";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
import { DOKUMENT_STATUS } from "../../fleet/dokumenter.js";
import {
  uploadOpgaveDokument, hentOpgaveDokumentLink, deaktiverOpgaveDokument, saetOpgaveDokumentSynlighed,
} from "../../fleet/opgavedokumenter.js";
/* ⚠ SKIVE 3C — DEN DELTE Sagsvisning, IKKE EN PARALLELKOPI. Se dens hoved. */
import Sagsvisning from "../../fleet/Sagsvisning.jsx";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { DEMO_INDBERETNINGER } from "../../fleet/demo-indberetninger.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
/* ⚠ KUN SOM FALDBAKKE I useListe. Sættet bruges når der ingen database er
   — se noten ved hentningen ovenfor. Skærmen slår IKKE op i det. */
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

/* ---- De fem kasser ---------------------------------------------------- */

/**
 * ⚠ KASSERNE ER DEFINERET ÉT STED, OG DEFINITIONEN FØLGER MED.
 *
 * `noegle` er den samme streng som Arbejdskøen tager i sin URL. Skrev skærmen
 * "nye" i kortet og køen "ny" i sit filter, ville knappen åbne en tom liste
 * ved siden af et tal der sagde 6 — og det ville ligne et datahul.
 *
 * `hvad` står PÅ skærmen, ikke kun her. Tre af de fem overlapper (kommende og
 * forsinkede er begge udsnit af planlagte), og to tal der begge lyder som
 * totaler, er beslutning 11 og 14 om igen.
 */
const KASSER = [
  { noegle: "nye", label: "Nye indberetninger", tone: "ikon-1", ikon: "dokument",
    hvad: "Meldt af en chauffør og endnu ikke vurderet af en værkfører." },
  { noegle: "afventer", label: "Afventer planlægning", tone: "ikon-3", ikon: "ur",
    hvad: "Opgaver med status indberettet eller afventer — de har et tidspunkt, " +
          "men det er en pladsholder indtil nogen har taget stilling." },
  { noegle: "planlagt", label: "Planlagte aktiviteter", tone: "ikon-5", ikon: "kalender",
    hvad: "Planlagte og igangværende opgaver i alt." },
  { noegle: "kommende", label: "Kommende aktiviteter", tone: "ikon-4", ikon: "afspil",
    hvad: "Heraf dem der starter inden for det valgte vindue. Et UDSNIT af de " +
          "planlagte, ikke et tal ved siden af." },
  { noegle: "forsinkede", label: "Forsinkede aktiviteter", tone: "ikon-2", ikon: "advarsel",
    hvad: "Heraf dem hvis slutning ligger bag os. Også et udsnit." },
];

export default function Driftskalender() {
  const { bruger } = useFleet();
  /* ⚠ PERMISSIONEN, IKKE ROLLEN. Og den er KUN til at tegne knappen —
     serveren spørger om den samme, og det er dér den afgøres. En kontrol der
     kun findes i frontend, er en pæn knap. */
  const maaPlanlaegge = harPerm(bruger?.perms, PERM.opgaverSkriv);

  /* ⚠ VINDUET ER BREDT, FORDI KALENDEREN KAN BLADRES. Gitteret flytter sig
     klientside; hentningen gør ikke. Rækker man ud over det hentede interval,
     står gitteret tomt — og det SIGES nedenfor frem for at ligne en tom uge.
     useListe giver intervallet med tilbage netop til det. */
  const opgaver = useListe("opgaver", {
    ordnPaa: "startMs", vindue: "fremad", vindueDage: 120, fremDage: 365,
    graense: 500, demo: DEMO_OPGAVER,
  });
  const indberetninger = useListe("indberetninger", {
    ordnPaa: "oprettetMs", vindue: "fremad", vindueDage: 180, fremDage: 30,
    graense: 500, demo: DEMO_INDBERETNINGER,
  });
  /* Enhederne bærer ingen division (beslutning 19), og aksen er fjernet
     (70) — hele kartoteket hentes. */
  const enheder = useListe("koeretoejer", {
    vindue: "alle", demo: DEMO_KOERETOEJER,
  });
  /* ⚠ SKIVE 4B — NODEN ER IKKE LÆNGERE MODULSPÆRRET. Her stod `hent:
     harProcure`, fordi `leverandoerer` var spærret på `indkoeb` — en kunde
     med Fleet men uden Procure fik en permission-denied. Det er rettet ved
     kilden: `leverandoerer` er nu fælles masterdata uden modulklausul
     (Model B, `04_DATA_AND_PERMISSION_IMPACT.md` §28), gated på
     `leverandoerer.laes` alene. Et `hent: false` her ville nu være præcis
     det CLAUDE.md advarer mod: en dæmpet afvisning på en node der ikke har
     nogen modulklausul at dæmpe. */
  const leverandoerer = useListe("leverandoerer", {
    vindue: "alle", demo: DEMO_LEVERANDOERER,
  });

  const [visning, setVisning] = useState("uge");
  const [anker, setAnker] = useState(() => Date.now());
  const [fremDage, setFremDage] = useState(STANDARD_FREMAD);
  const [valgtId, setValgtId] = useState(null);
  const [svaev, setSvaev] = useState(null);
  const [planlaegger, setPlanlaegger] = useState(false);
  /* `null` = lukket. En streng = åben, og den ER udsnittets nøgle — samme
     nøgle som ArbejdskoeIndhold's `vis`. Se Skive 3A-noten øverst. */
  const [koeVis, setKoeVis] = useState(null);
  /* Serverens svar paa en flytning. ⚠ EN AFVISNING ER ET SVAR, ikke en fejl:
     "bilen er optaget" og "du maa ikke" er to forskellige ting, og de skal
     kunne laeses. Se PLANSVAR i opgaveplan-regler.js. */
  const [flytSvar, setFlytSvar] = useState(null);

  /* ⚠ KUN art "vaerksted". Fleets driftskalender er FLÅDENS arbejde.
     `opgaver` rummer også facility-opgaver — en port der skal repareres, et
     ventilationsfilter — og de har deres egen skærm i Facility →
     Servicekalender, der læser den SAMME node. Talte begge moduler dem med,
     ville det samme arbejde stå i to tal, og en vognmand der lagde dem sammen,
     ville tælle sit filterskift to gange. Det er beslutning 11 og 14's fejl på
     tværs af moduler.

     Filteret ligger i SKÆRMEN og ikke i driftstal(): funktionen er den samme
     for begge moduler, og Facility skal kunne kalde den med sin egen art frem
     for at få sin egen kopi. */
  const flaadeopgaver = useMemo(
    () => opgaver.data.filter((o) => o.art === "vaerksted"), [opgaver.data]);

  const nu = Date.now();
  const vindue = useMemo(() => vindueFor(visning, anker), [visning, anker]);

  const tal = useMemo(
    () => driftstal({
      opgaver: flaadeopgaver, indberetninger: indberetninger.data, nu, fremDage,
    }),
    [flaadeopgaver, indberetninger.data, nu, fremDage]);

  const lvNavn = (id) => leverandoerNavn(leverandoerer.data, id);

  /* ---- Gitterets rækker og blokke ---- */

  const raekker = useMemo(() => {
    const brugte = raekkerIVindue(flaadeopgaver, vindue.fra, vindue.til, enheder.data);
    return brugte.map((kt) => ({
      id: kt.id,
      label: kt.kaldenavn,
      under: kt.navn,
      pille: <Pille tone={KOERETOEJ_STATUS[kt.status]?.pill}>
        {KOERETOEJ_STATUS[kt.status]?.label}
      </Pille>,
    }));
  }, [flaadeopgaver, enheder.data, vindue.fra, vindue.til]);

  /* Samme liste som kasserne taeller — gitteret og tallene maa ikke vise
     hver sit udsnit. */
  const blokke = useMemo(() => flaadeopgaver
    .filter((o) => Number.isFinite(o.startMs) && ressourceId(o))
    .map((o) => {
      const slut = slutter(o);
      return {
        id: o.id,
        raekkeId: ressourceId(o),
        fra: o.startMs,
        /* ⚠ EN OPGAVE UDEN ESTIMAT FÅR ET SYNLIGT MINIMUM, IKKE ET GÆTTET
           VINDUE. Én time er nok til at blokken kan ses og klikkes; den
           foregiver ikke at være en varighed nogen har besluttet, og
           `udenVarighed` tæller den for sig nedenfor. */
        til: slut ?? o.startMs + 3600000,
        label: [ARBEJDSTYPE[o.arbejdstype], o.leverandoerId ? lvNavn(o.leverandoerId) : null]
          .filter(Boolean).join(" · ") || o.beskrivelse,
        titel: o.beskrivelse,
        tone: OPGAVE_STATUS[o.status]?.pill,
      };
    }), [flaadeopgaver]);

  const valgt = flaadeopgaver.find((o) => o.id === valgtId) || null;

  /* ---- Træk: flyt en opgave i gitteret — beslutning 49 ---- */

  /**
   * ⚠ SPØRGSMÅLET STILLES FØR TRÆKKET, IKKE EFTER.
   * En blok der ser ud til at kunne trækkes, og som afvises i det øjeblik man
   * slipper den, lover noget. `kanFlyttes()` er den SAMME funktion serveren
   * afviser med, så markøren og afvisningen ikke kan blive uenige.
   */
  const kanFlytteBlok = (b) => {
    if (!maaPlanlaegge) return "Kræver opgaver.skriv.";
    const o = flaadeopgaver.find((x) => x.id === b.id);
    if (!o) return "Opgaven kunne ikke findes igen.";
    const svar = kanFlyttes(o);
    return svar.ok ? true : svar.aarsag;
  };

  /**
   * ⚠ VARIGHEDEN SENDES IKKE MED, OG DET ER HELE POINTEN.
   * Blokkens `til` er ikke altid opgavens slutning: en opgave uden estimat
   * tegnes som ÉN TIME, så den kan ses og klikkes. Regnede vi `estimeretMin`
   * ud af blokkens tegning, ville den time blive til et rigtigt estimat, og
   * bilen ville være spærret i et tidsrum ingen har besluttet. Vi flytter
   * STARTEN; varigheden er opgavens egen og bliver hvor den er.
   */
  const paaFlyt = async (b, { raekkeId, fra }) => {
    const o = flaadeopgaver.find((x) => x.id === b.id);
    if (!o) return;
    const r = await flytOpgave({
      opgaveId: o.id, foer: o, startMs: fra,
      ressourceType: "koeretoej", ressourceId: raekkeId,
    });
    setFlytSvar(r);
    /* ⚠ GENINDLÆS UANSET UDFALDET. Lykkedes den, står gitteret ellers med den
       gamle placering; blev den afvist, kan en ANDEN have skrevet imens, og
       så er det den friske virkelighed der skal tegnes. */
    opgaver.genindlaes();
  };

  /* ---- Åbn en kø ---- */

  /* ⚠ `&division=…` STOD I URL'EN, OG INGEN LÆSTE DEN. Arbejdskøen har
     aldrig spurgt efter parameteren, og efter beslutning 70 var værdien
     `undefined` — så linket sagde bogstaveligt `division=undefined`. En
     parameter ingen læser, er ikke en parameter; den er en påstand om at
     modtageren gør noget. Se beslutning 87. */
  const koeSti = (noegle) =>
    `/flaade/koe?vis=${noegle}&frem=${fremDage}`;
  /* ⚠ SKIVE 3A — "Åbn" ÅBNER ET PANEL, IKKE LÆNGERE ET NYT SIDESKIFTE. Se
     hovedets note. `koeVis` er selve udsnittets nøgle, og `fremDage` er
     kalenderens EGEN — samme variabel som kortet "Kommende" allerede
     bruger, så panelet og kortene aldrig kan vise hvert sit vindue. */
  const aabnHer = (noegle) => setKoeVis(noegle);
  /* ⚠ FULD SHELL I DET NYE VINDUE — ikke en bar visning. Vinduet er en rigtig
     rute, så en disponent kan navigere videre derfra i stedet for at sidde
     fast i én liste. Tenant og periode ligger i localStorage via
     FleetContext og følger derfor med over. */
  const aabnNytVindue = (noegle) =>
    window.open(koeSti(noegle), `fc-koe-${noegle}`, "width=1280,height=900");

  if (opgaver.henter || indberetninger.henter) return <Henter hvad="driftsopgaver" />;
  /* En AFVIST læsning er ikke en tom liste. */
  if (blokerer(opgaver.tilstand)) {
    return <Datatilstand tilstand={opgaver.tilstand} genprov={opgaver.genindlaes} />;
  }
  if (blokerer(indberetninger.tilstand)) {
    return <Datatilstand tilstand={indberetninger.tilstand} genprov={indberetninger.genindlaes} />;
  }

  /* ⚠ ER VI BLADRET UD AF DET HENTEDE? Så er gitteret tomt uden at noget er
     tomt. Tavs afkortning med et ekstra trin. */
  const udenfor = opgaver.interval &&
    (vindue.fra < opgaver.interval.fra || vindue.til > opgaver.interval.til);

  return (
    <div className="fc-grid" style={{ gap: 11 }}>
      <Datatilstand tilstand={opgaver.tilstand} genprov={opgaver.genindlaes} />

      {/* ---- De fem kasser ---- */}
      <KpiRaekke>
        {KASSER.map((k) => (
          <Kasse
            key={k.noegle}
            kasse={k}
            data={tal[k.noegle]}
            fremDage={fremDage}
            saetFremDage={setFremDage}
            paaAabn={() => aabnHer(k.noegle)}
            paaNytVindue={() => aabnNytVindue(k.noegle)}
          />
        ))}
      </KpiRaekke>

      {/* ---- Kalenderen ---- */}
      <Kort
        titel="Driftskalender"
        handling={
          <div style={{ display: "flex", gap: 8 }}>
            <Knap onClick={() => window.open(
              "/flaade/koe?vis=planlagt", "fc-kalender", "width=1440,height=980")}>
              Åbn i nyt vindue
            </Knap>
            <Knap variant="primaer" onClick={() => setPlanlaegger(true)}
                  disabled={!maaPlanlaegge}
                  title={maaPlanlaegge ? undefined : "Kræver opgaver.skriv."}>
              Planlæg aktivitet
            </Knap>
          </div>
        }
      >
        <div className="fc-kal-top">
          <div className="fc-seg" role="group" aria-label="Tidsinterval">
            {ALLE_VISNINGER.map((v) => (
              <button key={v} type="button" aria-pressed={visning === v}
                      onClick={() => setVisning(v)}>
                {VISNING[v].label}
              </button>
            ))}
          </div>
          <div className="fc-kal-spring">
            <Knap onClick={() => setAnker((a) => flyt(visning, a, -1))} aria-label="Forrige">←</Knap>
            <span className="fc-kal-periode">
              {visning === "dag"
                ? dato(vindue.fra)
                : `${dato(vindue.fra)} – ${dato(vindue.til - 1)}`}
            </span>
            <Knap onClick={() => setAnker((a) => flyt(visning, a, 1))} aria-label="Næste">→</Knap>
            <Knap onClick={() => setAnker(Date.now())}>I dag</Knap>
          </div>
        </div>

        {udenfor && (
          <p className="fc-hint fc-bad" style={{ marginBottom: 10 }}>
            ⚠ Du er bladret uden for det hentede interval
            ({dato(opgaver.interval.fra)} – {dato(opgaver.interval.til)}).
            Gitteret er tomt <b>fordi der ikke er hentet noget</b> — ikke fordi
            der ikke er noget. Hentningen følger perioden, ikke kalenderens
            pile.
          </p>
        )}

        {/* ⚠ LODRET SCROLL PÅ EN MODIFIKATOR, ikke på .fc-scroll selv: den er
            vandret og bruges af hver tabel i appen. Hovedet og navnekolonnen
            klæber, så man ikke skal tælle kolonner for at finde dagen. */}
        <div className="fc-gk-lodret">
          <div
            onMouseLeave={() => setSvaev(null)}
            onMouseMove={(e) => {
              const knap = e.target.closest?.("[data-blok]");
              if (!knap) { setSvaev(null); return; }
              const o = flaadeopgaver.find((x) => x.id === knap.dataset.blok);
              if (o) setSvaev({ x: e.clientX, y: e.clientY, opgave: o });
            }}
          >
            <Gitterkalender
              raekker={raekker}
              blokke={blokke}
              fra={vindue.fra}
              til={vindue.til}
              enhed={vindue.enhed}
              valgtId={valgtId}
              onVaelg={(b) => setValgtId(b.id)}
              onFlyt={paaFlyt}
              kanFlytte={kanFlytteBlok}
              tom="Ingen driftsopgaver i perioden."
            />
            {/* Serverens svar paa en flytning. En afvisning er et SVAR — se
                PLANSVAR: "bilen er optaget" og "du maa ikke" er ikke det
                samme, og de skal kunne skelnes. */}
            <Formularsvar svar={flytSvar} okTekst="Flyttet." />
          </div>
        </div>

        <p className="fc-hint" style={{ marginTop: 12 }}>
          Kun enheder med aktivitet i perioden vises —{" "}
          <b>{num(raekker.length)} af {num(enheder.data.length)}</b>. Et gitter
          med tredive rækker hvoraf femogtyve er tomme, skjuler de fem der
          betyder noget. Gitteret ligger i <b>fleet/Gitterkalender.jsx</b> og
          bruges også af Facility → Servicekalender og af Disponering.
          {tal.udenVarighed.antal > 0 && (
            <>
              {" "}⚠ <b>{num(tal.udenVarighed.antal)}</b> planlagte opgaver har
              intet estimat. De tegnes som én time, så de kan ses og klikkes —
              men varigheden er <b>ikke</b> besluttet, og de kan hverken være
              forsinkede eller til tiden.
            </>
          )}
        </p>
      </Kort>

      {svaev && <Svaevekort svaev={svaev} lvNavn={lvNavn} />}

      {/* ⚠ HER BLEV `division` SENDT MED SOM PROP OG ALDRIG LÆST.
          Planlaegdialog nævner den ikke med ét ord. En prop der ikke bruges,
          er en aftale der ikke findes. Se beslutning 87. */}
      {planlaegger && (
        <Planlaegdialog
          enheder={enheder.data}
          leverandoerer={leverandoerer.data}
          onLuk={() => setPlanlaegger(false)}
          onGemt={() => { setPlanlaegger(false); opgaver.genindlaes(); }}
        />
      )}

      {valgt && (
        <Haendelsespanel
          opgave={valgt}
          lvNavn={lvNavn}
          enheder={enheder.data}
          maaSkrive={maaPlanlaegge}
          /* ⚠ PANELET LUKKES IKKE AF SIG SELV EFTER ET SKIFT. Et statusskifte
             er ikke nødvendigvis det sidste man gør ved en opgave — man kan
             sætte den i gang og derefter kigge på reservationen. Men listen
             SKAL genindlæses, ellers står pillen på den gamle status mens
             serveren har den nye. */
          onSkiftet={() => opgaver.genindlaes()}
          onLuk={() => setValgtId(null)}
        />
      )}

      {/* ⚠ SKIVE 3A — SAMME ArbejdskoeIndhold SOM /flaade/koe, I ET PANEL.
          Ingen kopi af filteret, driftstal() eller pagineringen: kortenes
          "Åbn" sætter kun `koeVis`, og komponenten herunder er den ENESTE
          der ved hvordan et udsnit bliver til en tabel. */}
      {koeVis && (
        <Dialog bred titel="Arbejdskø" onLuk={() => setKoeVis(null)}>
          <ArbejdskoeIndhold
            vis={koeVis}
            saetVis={setKoeVis}
            fremDage={fremDage}
            saetFremDage={setFremDage}
          />
        </Dialog>
      )}

      {/* ⚠ MODULETS FORSIDE ER `/flaade` — DEN HER SKAERM. Kortet laa
          foerst i `flaade/Oversigt.jsx`, som TRODS NAVNET er routet til
          Opsaetning → Enheder: koeretoejsregistret, stamdata. En liste over
          vaerkstedsfakturaer hoerer hvor arbejdet er, ikke i et register.
          Et filnavn er ikke en placering.

          ⚠ SAMME FAKTURAER SOM FAKTURACENTERET — ikke et andet saet.
          Modulet ejer sagen; centeret ejer fakturaen (beslutning 86). */}
      <Modulfakturaer art="fleet" />
    </div>
  );
}

/* ---- Kassen ----------------------------------------------------------- */

/**
 * ⚠ ET KpiKort MED EN KNAP INDENI VAR IKKE MULIGT. KpiKort er SELV et link
 * (`til`), og et link inde i et link er ugyldigt markup — noten står allerede
 * i Fleet → Enheder. Kassen her er derfor sin egen, med knapperne som
 * knapper.
 */
function Kasse({ kasse, data, fremDage, saetFremDage, paaAabn, paaNytVindue }) {
  const erKommende = kasse.noegle === "kommende";
  return (
    /* Samme skal som KpiKort — fc-card. Klassenavnene er delte, så kassen
       ikke ser anderledes ud end de nøgletalskort den står ved siden af på
       hver anden skærm.
       ⚠ SKIVE 3A — KOMPAKTERE PADDING. Kortet er en HANDLINGSINDGANG til
       kalenderen, ikke længere en side for sig, og skal derfor fylde
       mindre: samme klasse, samme token, kun det inline-tal er strammet —
       ingen nye tokens, ingen ny klasse. */
    <div className="fc-card" style={{ padding: "12px 14px" }}>
      {/* Ikonet øverst, handlingen modsat. Tallet står så alene i midten og
          kan læses på et sekund — det var pointen med at forenkle kassen. */}
      <div className="fc-kasse-top">
        <div className={`fc-kpi-ico fc-kpi-rund fc-tone-${kasse.tone}`}>
          <Ikon navn={kasse.ikon} />
        </div>
        {/* ⚠ ÉN KNAP, IKKE TO. Her stod "Åbn" og "Åbn i nyt vindue" side om
            side — ti knapper på fem kort, hvor to af dem gør næsten det
            samme. Den hyppige handling er knappen; varianten kommer frem
            når man beder om den. Se Delknap i ui.jsx. */}
        <Delknap
          label="Åbn"
          onKlik={paaAabn}
          titel={`Åbn ${kasse.label.toLowerCase()} i arbejdskøen`}
          poster={[
            { key: "her", label: "Åbn her", ikon: DELIKON.vindue, onVaelg: paaAabn },
            { key: "nyt", label: "Åbn i nyt vindue", ikon: DELIKON.nytVindue,
              onVaelg: paaNytVindue },
          ]}
        />
      </div>

      <div className="fc-kasse-l">{kasse.label}</div>
      <div className="fc-kasse-v">{num(data.antal)}</div>

      {kasse.noegle === "nye" && <Prioritetsprikker fordeling={data} />}

      {erKommende && (
        /* ⚠ VINDUET ER BRUGERENS EGET, OG DET ER DERFOR TALLET IKKE KAN
           AGGREGERES. Skifter man her, skifter både tallet og den liste
           "Åbn" viser — de kan ikke komme ud af trit, fordi de er ét
           regnestykke. */
        <div className="fc-seg" role="group" aria-label="Vis frem" style={{ marginTop: 4 }}>
          {FREMAD.map((f) => (
            <button key={f.dage} type="button" aria-pressed={fremDage === f.dage}
                    onClick={() => saetFremDage(f.dage)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      <p className="fc-hint" style={{ marginTop: 10 }}>{kasse.hvad}</p>
    </div>
  );
}

/**
 * ⚠ FIRE TAL, IKKE TRE. `uvurderet` tælles og VISES. En indberetning uden
 * prioritet er ikke lavt prioriteret — den er ikke set af nogen endnu, og det
 * er præcis det tal en værkfører skal handle på. Skjulte vi den, ville tre tal
 * der summer til mindre end totalen, se ud som en regnefejl.
 */
function Prioritetsprikker({ fordeling }) {
  return (
    <div className="fc-pri">
      {["lav", "normal", "hoej"].map((p) => (
        <span key={p} className={`fc-pri-et fc-pri-${p}`}>
          <span className="fc-pri-prik" />
          {PRIORITET[p].label} {num(fordeling[p])}
        </span>
      ))}
      {fordeling.uvurderet > 0 && (
        <span className="fc-pri-et" title="Ikke set af en værkfører endnu">
          <span className="fc-pri-prik" />
          Ikke vurderet {num(fordeling.uvurderet)}
        </span>
      )}
    </div>
  );
}

/* ---- Svævekortet ------------------------------------------------------ */

/**
 * ⚠ ET title-ATTRIBUT VAR IKKE NOK, og blokken har stadig sit.
 *
 * Browserens egen boble kommer efter halvandet sekund, forsvinder efter fem,
 * kan ikke rumme en tabel og findes slet ikke på en berøringsskærm. Kortet
 * her svarer på "hvad sker der på den blok" uden at man mister sin plads i
 * gitteret ved at klikke. `title` bliver stående, fordi den er den eneste der
 * virker uden mus.
 */
function Svaevekort({ svaev, lvNavn }) {
  const o = svaev.opgave;
  const pri = prioritetFor(o);
  const slut = slutter(o);
  /* Holdes inden for vinduet: et kort der stikker ud over højre kant, kan
     ikke læses, og et der lægger sig under musen, blinker. */
  const x = Math.min(svaev.x + 16, (window.innerWidth || 1200) - 340);
  const y = Math.min(svaev.y + 16, (window.innerHeight || 800) - 220);

  return (
    <div className="fc-svaev" style={{ left: x, top: y }} role="tooltip">
      <div className="fc-svaev-t">{o.beskrivelse}</div>
      <div className="fc-svaev-r"><span>Type</span><span>{ARBEJDSTYPE[o.arbejdstype] || "—"}</span></div>
      {o.leverandoerId && (
        <div className="fc-svaev-r"><span>Værksted</span><span>{lvNavn(o.leverandoerId)}</span></div>
      )}
      <div className="fc-svaev-r"><span>Start</span><span>{datoTid(o.startMs)}</span></div>
      <div className="fc-svaev-r">
        <span>Slut</span>
        {/* ⚠ INTET, IKKE EN GÆTTET SLUTNING. Uden estimat er der ikke noget
            sluttidspunkt — og "—" er svaret, ikke starttidspunktet igen. */}
        <span>{slut ? datoTid(slut) : "— (intet estimat)"}</span>
      </div>
      <div className="fc-svaev-r">
        <span>Status</span>
        <span><Pille tone={OPGAVE_STATUS[o.status]?.pill}>{OPGAVE_STATUS[o.status]?.label}</Pille></span>
      </div>
      <div className="fc-svaev-r">
        <span>Prioritet</span>
        <span>{pri
          ? <Pille tone={pri.pill}>{pri.label}</Pille>
          : <span className="fc-neutral">— ikke vurderet</span>}</span>
      </div>
    </div>
  );
}

/* ---- Hændelsespanelet ------------------------------------------------- */

/* ⚠ SKIVE 3C — "Kommunikation" OG "Filer" ER VÆK HERFRA. De var en PARALLEL
   sagsvisning bygget direkte ind i denne skærm — samme demo-sag.js, samme
   VEDHAEFTNING_*, men sin egen kopi af faner og komponenter. "Sag" åbner nu
   den DELTE Sagsvisning (fleet/Sagsvisning.jsx), som Facility bruger
   uændret. Se hovedet i Sagsvisning.jsx. */
const PANEL_FANER = [
  { key: "overblik", label: "Overblik" },
  { key: "sag", label: "Sag" },
];

/**
 * Klik på en blok åbner den her. Mockuppens højre panel, som en drawer.
 *
 * ⚠ IKKE LÆNGERE `bred` (centreret, 1020px). Den tidligere begrundelse —
 * "et sidepanel ville klemme gitteret sammen til en tredjedel" — gjaldt et
 * panel der er en del af LAYOUT-FLOWET og derfor skubber gitteret til side.
 * `variant="drawer"` (§1 V1 visuel konsolidering) er et OVERLAY, samme
 * `position:fixed` som den centrerede dialog — gitteret klemmes slet ikke,
 * det forbliver forklarligt og synligt bag panelet. Mailtråden og fillisten
 * i fanen "Sag" får dermed en smallere, fast bredde end før i stedet for
 * 1020px — samme afvejning som resten af drawer-princippet: mindre plads,
 * til gengæld beholdt kontekst.
 */
function Haendelsespanel({ opgave, lvNavn, enheder, onLuk, maaSkrive, onSkiftet }) {
  const [fane, setFane] = useState("overblik");
  const enhed = enheder.find((k) => k.id === opgave.koeretoejId) || null;
  const pri = prioritetFor(opgave);

  return (
    <Dialog
      variant="drawer"
      titel={opgave.beskrivelse}
      under={[enhed?.kaldenavn, ARBEJDSTYPE[opgave.arbejdstype],
              opgave.leverandoerId ? lvNavn(opgave.leverandoerId) : "Eget værksted"]
        .filter(Boolean).join(" · ")}
      handling={<Pille tone={OPGAVE_STATUS[opgave.status]?.pill}>
        {OPGAVE_STATUS[opgave.status]?.label}</Pille>}
      onLuk={onLuk}
    >
      <Faner faner={PANEL_FANER} valgt={fane} saet={setFane} label="Hændelse" />

      {fane === "overblik" && (
        /* ⚠ ÉN KOLONNE, IKKE TO. Drawerens 420px er for smal til at give
           enhedsinfo og Reservationens påvirkning hver sin halvdel uden at
           MiniLinje-labels og -værdier ombrækker på hvert eneste ord. */
        <Gitter>
          <div>
            <MiniLinje label="Enhed" vaerdi={<b>{enhed?.kaldenavn || opgave.koeretoejId}</b>} />
            {enhed?.registrering && <MiniLinje label="Reg.nr." vaerdi={enhed.registrering} />}
            <MiniLinje label="Type" vaerdi={ARBEJDSTYPE[opgave.arbejdstype] || "—"} />
            <MiniLinje label="Udføres af" vaerdi={opgave.leverandoerId
              ? lvNavn(opgave.leverandoerId)
              : "Eget værksted"} />
            <MiniLinje label="Start" vaerdi={datoTid(opgave.startMs)} />
            <MiniLinje
              label="Slut"
              vaerdi={slutter(opgave)
                ? datoTid(slutter(opgave))
                : <span className="fc-neutral">— intet estimat</span>} />
            <MiniLinje label="Prioritet" vaerdi={pri
              ? <Pille tone={pri.pill}>{pri.label}</Pille>
              : <span className="fc-neutral">— ikke vurderet</span>} />
            {Number.isFinite(opgave.beloebOere) && (
              <MiniLinje label="Estimeret omkostning" vaerdi={kr(opgave.beloebOere)} />
            )}
            <MiniLinje label="Sag" vaerdi={opgave.sagId
              ? <Pille tone="info">Findes — se fanen "Sag"</Pille>
              : <span className="fc-neutral">Ingen</span>} />
          </div>
          <Reservationen opgave={opgave} />
        </Gitter>
      )}

      {/* ⚠ SKIVE 3C — DEN DELTE Sagsvisning, IKKE EN PARALLELKOPI. Samme
          komponent som Facilitys Servicekalender bruger; se dens hoved. */}
      {fane === "sag" && (
        <Sagsvisning
          sagId={opgave.sagId || null}
          objektType="opgave"
          objektId={opgave.id}
          art="fleet"
          objektLabel={enhed?.kaldenavn || opgave.koeretoejId}
          emneForslag={opgave.beskrivelse}
          modpartNavnForslag={opgave.leverandoerId ? lvNavn(opgave.leverandoerId) : ""}
          onGenindlaes={onSkiftet}
        />
      )}

      {/* ⚠ F.2 — SAMME PLADS SOM Statusskifte, IKKE INDE I EN FANE. Bilag
          hører hverken under "Overblik" (som er DATA om opgaven) eller
          "Sag" (som er kommunikationssporet) — det er en tredje, altid
          synlig handling, samme figur som statusknapperne nedenfor. */}
      <div style={{ marginTop: 18 }}>
        <OpgaveBilag opgave={opgave} lvNavn={lvNavn} maaSkrive={maaSkrive} onAendret={onSkiftet} />
      </div>

      {/* ⚠ HER STOD TO DEAKTIVEREDE KNAPPER — "Marker udført" og "Flyt" — med
          begrundelsen at skrivningen hørte i en Cloud Function. Den findes nu:
          `opgavestatus` skifter status OG reservationens følge i én atomisk
          opdatering (beslutning 50), og flytningen er `opgaveflyt`, som kaldes
          fra gitteret ved at trække blokken (beslutning 49).
          Knapperne tegnes af maskinen i `OPGAVE_OVERGANGE`, ikke af en liste
          her — en knap uden en overgang er en pæn knap, og en overgang uden en
          knap er en vej ingen kan finde. */}
      <div style={{ marginTop: 18 }}>
        <Statusskifte opgave={opgave} maaSkrive={maaSkrive} onSkiftet={onSkiftet} />
        <p className="fc-hint" style={{ marginTop: 10 }}>
          <b>Flyt</b> opgaven ved at <b>trække blokken</b> i kalenderen — til et
          andet tidspunkt eller en anden enhed. <b>Shift + piletast</b> gør det
          samme.{" "}
          <Link className="fc-a" to="/flaade/indberetninger">Se indberetninger</Link>
        </p>
      </div>
    </Dialog>
  );
}

/* ---- Bilag — F.2, samme fundament som Fakturacenter.jsx's Bilag -------- */

/**
 * ⚠ SAMME SKABELON SOM Bilag I Fakturacenter.jsx — se dens hoved for
 * begrundelsen om hvorfor dokumenterne kommer MED opgaven i stedet for at
 * blive hentet separat. Forskellen her: `onAendret` kalder eksplicit
 * `opgaver.genindlaes()` (se Haendelsespanels `onSkiftet`), fordi
 * `useListe("opgaver", …)` ikke er `live: true` — uden det ville et
 * uploadet dokument først dukke op efter et helsides genindlæs.
 *
 * ⚠ DELINGSTOGGLEN VISES KUN NÅR OPGAVEN HAR EN leverandoerId. Uden en
 * tildelt leverandør er der intet at dele MED — en synlig, men virkningsløs
 * knap ville se ud som en funktion der ikke virkede.
 */
function OpgaveBilag({ opgave, lvNavn, maaSkrive, onAendret }) {
  const [arbejder, setArbejder] = useState(false);
  const [svar, setSvar] = useState(null);

  const dokumenter = Object.entries(opgave.dokumenter || {})
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => (b.oprettetTid || 0) - (a.oprettetTid || 0));

  const paaVaelgFil = async (e) => {
    const fil = e.target.files?.[0];
    /* ⚠ NULSTIL FELTET STRAKS — samme grund som Fakturacenters Bilag. */
    e.target.value = "";
    if (!fil) return;
    setArbejder(true);
    setSvar(null);
    const r = await uploadOpgaveDokument({ opgaveId: opgave.id, fil });
    setSvar(r);
    setArbejder(false);
    if (r.ok) onAendret?.();
  };

  const paaAaben = async (d) => {
    setSvar(null);
    const r = await hentOpgaveDokumentLink({ opgaveId: opgave.id, dokumentId: d.id });
    if (r.ok && r.data?.url) {
      window.open(r.data.url, "_blank", "noopener,noreferrer");
    } else {
      setSvar(r);
    }
  };

  const paaDeaktiver = async (d) => {
    setArbejder(true);
    setSvar(null);
    const r = await deaktiverOpgaveDokument({ opgaveId: opgave.id, dokumentId: d.id });
    setSvar(r);
    setArbejder(false);
    if (r.ok) onAendret?.();
  };

  const paaSkifteSynlighed = async (d, synlig) => {
    setArbejder(true);
    setSvar(null);
    const r = await saetOpgaveDokumentSynlighed({ opgaveId: opgave.id, dokumentId: d.id, synlig });
    setSvar(r);
    setArbejder(false);
    if (r.ok) onAendret?.();
  };

  return (
    <>
      <h3 className="fc-underoverskrift">Bilag</h3>
      <Formularsvar svar={svar} okTekst="Gemt." />

      {maaSkrive && (
        <div className="fc-row" style={{ marginBottom: 8 }}>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                 aria-label="Upload bilag" disabled={arbejder}
                 onChange={paaVaelgFil} />
          {arbejder && <span className="fc-hint">Overfører…</span>}
        </div>
      )}

      {dokumenter.length === 0 ? (
        <p className="fc-hint">Ingen bilag endnu.</p>
      ) : (
        <Tabel
          raekker={dokumenter}
          noegle={(d) => d.id}
          tom="Ingen bilag endnu."
          kolonner={[
            {
              key: "fil", label: "Fil",
              render: (d) => (
                <>
                  <b>{d.originaltFilnavn}</b>
                  <div className="fc-hint">
                    {filstoerrelse(d.stoerrelse)} · {d.valideretMime}
                  </div>
                </>
              ),
            },
            {
              key: "status", label: "Status",
              render: (d) => (
                <>
                  <Pille tone={DOKUMENT_STATUS[d.status]?.pill}>
                    {DOKUMENT_STATUS[d.status]?.label || d.status}
                  </Pille>
                  {d.status === "afvist" && d.afvistGrund && (
                    <div className="fc-hint">{d.afvistGrund}</div>
                  )}
                </>
              ),
            },
            /* ⚠ HELE KOLONNEN ER VÆK, IKKE BARE TOM, UDEN EN LEVERANDØR —
               se komponentens hoved. */
            ...(opgave.leverandoerId ? [{
              key: "deling", label: "Leverandørportal",
              render: (d) => (
                d.status === "aktiv" ? (
                  <label className="fc-afkryds-punkt">
                    <input type="checkbox" checked={d.synligForLeverandoer === true}
                           disabled={!maaSkrive || arbejder}
                           onChange={(e) => paaSkifteSynlighed(d, e.target.checked)} />
                    Delt
                  </label>
                ) : <span className="fc-hint">—</span>
              ),
            }] : []),
            {
              key: "handling", label: "",
              render: (d) => (
                <span className="fc-med-ikon" style={{ gap: 8 }}>
                  {d.status === "aktiv" && (
                    <Knap onClick={() => paaAaben(d)}>Åbn</Knap>
                  )}
                  {d.status === "aktiv" && maaSkrive && (
                    <Knap disabled={arbejder} onClick={() => paaDeaktiver(d)}>
                      Deaktivér
                    </Knap>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}
      {opgave.leverandoerId && dokumenter.some((d) => d.status === "aktiv") && (
        <p className="fc-hint" style={{ marginTop: 8 }}>
          "Delt" gør bilaget synligt for {lvNavn(opgave.leverandoerId)} i leverandørportalen —
          ikke resten af FleetControl. Fjern fluebenet for at skjule det igen.
        </p>
      )}
    </>
  );
}

/**
 * Reservationsmodellen gjort synlig. Kortet svarer på ét spørgsmål: hvorfor
 * kan disponenten ikke bruge enheden i den periode?
 */
function Reservationen({ opgave }) {
  let r = null;
  let fejl = null;
  try {
    r = reservationFraOpgave(opgave);
  } catch (e) {
    /* ⚠ FEJLEN VISES, DEN SLUGES IKKE. reservationFraOpgave() kaster når der
       ikke er noget vindue at reservere — og det er det rigtige svar: en
       standardlængde ville spærre enheden i et tidsrum ingen har besluttet.
       Fangede vi den i stilhed, ville panelet bare mangle et afsnit. */
    fejl = e.message;
  }

  if (fejl) {
    return (
      <div>
        <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Reservationens påvirkning</h3>
        <p className="fc-hint fc-bad">
          Opgaven kan <b>ikke</b> reservere sin enhed: {fejl}
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Så længe den ikke kan, ser enheden <b>fri</b> ud i disponeringen — og
          det er værre end en spærring man kan se.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Reservationens påvirkning</h3>
      <MiniLinje label="Ressource" vaerdi={<code>{r.ressourceType}</code>} />
      <MiniLinje label="Spærret fra" vaerdi={datoTid(r.fra)} />
      <MiniLinje label="Spærret til" vaerdi={`${datoTid(r.til)} (eksklusiv)`} />
      <MiniLinje label="Kilde" vaerdi={<code>{r.kilde.type}</code>} />
      <MiniLinje
        label="Prioritet"
        vaerdi={<><b>{reservationsPrioritet(r.kilde.type)}</b>
          {r.kilde.type === KILDE.vaerksted && " — den højeste"}</>} />
      <p className="fc-hint" style={{ marginTop: 10 }}>
        En enhed på værksted kan ikke køre, <b>uanset hvad disponenten har
        lovet</b>. En booking der overlapper, bliver overskrevet og annulleret
        med årsag — ikke slettet, så man kan forklare hvorfor en tur blev
        flyttet.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        <b>Reservationen skrives ikke endnu.</b> To disponenter kan ramme samme
        sekund, så konfliktfriheden hører i en Cloud Function. Det her er
        <b> formen</b>, ikke en handling.
      </p>
    </div>
  );
}

