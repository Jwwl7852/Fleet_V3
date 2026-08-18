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
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harModul } from "../../fleet/moduler.js";
import { num, dato, datoTid, klokke, kr, filstoerrelse } from "../../fleet/format.js";
import {
  Kort, Tom, KpiRaekke, Tabel, Pille, Knap, Henter, Datatilstand,
  Gitter, MiniLinje, Faner, Dialog, Delknap, DELIKON, Ikon,
  Felt, Feltraekke, Formular,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import Gitterkalender from "../../fleet/Gitterkalender.jsx";
import {
  VISNING, ALLE_VISNINGER, FREMAD, STANDARD_FREMAD,
  vindueFor, flyt, driftstal, slutter, raekkerIVindue,
} from "../../fleet/driftskalender.js";
import {
  OPGAVE_STATUS, ARBEJDSTYPE, ALLE_ARBEJDSTYPER, ressourceId, reservationFraOpgave,
} from "../../fleet/opgaver.js";
import { PRIORITET, ALLE_PRIORITETER, prioritetFor } from "../../fleet/prioritet.js";
import {
  planlaegOpgave, valideOpgaveplan, PLANLAEGBAR_STATUS,
} from "../../fleet/opgaveplan.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { isoTilMs, msTilIso } from "../../fleet/format.js";
import { KILDE, prioritetFor as reservationsPrioritet } from "../../fleet/reservations.js";
import { KOERETOEJ_STATUS } from "../../fleet/flaade.js";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
import { VEDHAEFTNING_TONE, VEDHAEFTNING_LABEL } from "../../fleet/sager.js";
import { demoSagerFor } from "../../fleet/demo-sag.js";
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
  const { division, bruger, moduler } = useFleet();
  const navigate = useNavigate();
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
  /* Enhederne bærer ingen division (beslutning 19) — division:"alle" står
     eksplicit, så det ikke ser ud som om det bare var heldigt. */
  const enheder = useListe("koeretoejer", {
    vindue: "alle", division: "alle", demo: DEMO_KOERETOEJER,
  });
  /* ⚠ NODEN, IKKE DEMO-SÆTTET — og den er spærret af ET ANDET MODUL.
     `leverandoerer` er modulspærret på `indkoeb` i firebase.rules.json, og
     en kunde der har Fleet men ikke Procure, ville få en permission-denied
     hver gang han åbnede driftskalenderen. `hent: false` er præcis til det:
     en node der er spærret af et fravalgt modul, giver en TOM liste — ikke
     en fejl. Det er samme tilfælde som Warehouses lokationsskærm der tæller
     kasser hos en kunde uden Unitbooking. Se useListe.

     Formularen siger det så på skærmen frem for at tilbyde en tom vælger. */
  const harProcure = harModul(moduler, "indkoeb");
  const leverandoerer = useListe("leverandoerer", {
    vindue: "alle", division: "alle", hent: harProcure, demo: DEMO_LEVERANDOERER,
  });

  const [visning, setVisning] = useState("uge");
  const [anker, setAnker] = useState(() => Date.now());
  const [fremDage, setFremDage] = useState(STANDARD_FREMAD);
  const [valgtId, setValgtId] = useState(null);
  const [svaev, setSvaev] = useState(null);
  const [planlaegger, setPlanlaegger] = useState(false);

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

  /* ---- Åbn en kø ---- */

  const koeSti = (noegle) =>
    `/flaade/koe?vis=${noegle}&frem=${fremDage}&division=${division}`;
  const aabnHer = (noegle) => navigate(koeSti(noegle));
  /* ⚠ FULD SHELL I DET NYE VINDUE — ikke en bar visning. Vinduet er en rigtig
     rute, så en disponent kan navigere videre derfra i stedet for at sidde
     fast i én liste. Tenant, division og periode ligger i localStorage via
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
    <div className="fc-grid" style={{ gap: 16 }}>
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
              tom="Ingen driftsopgaver i perioden."
            />
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

      {planlaegger && (
        <Planlaegdialog
          enheder={enheder.data}
          leverandoerer={leverandoerer.data}
          harProcure={harProcure}
          division={division}
          onLuk={() => setPlanlaegger(false)}
          onGemt={() => { setPlanlaegger(false); opgaver.genindlaes(); }}
        />
      )}

      {valgt && (
        <Haendelsespanel
          opgave={valgt}
          lvNavn={lvNavn}
          enheder={enheder.data}
          onLuk={() => setValgtId(null)}
        />
      )}
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
       hver anden skærm. */
    <div className="fc-card" style={{ padding: "16px 17px" }}>
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

const PANEL_FANER = (sag) => [
  { key: "overblik", label: "Overblik" },
  { key: "kommunikation", label: "Kommunikation", badge: sag ? sag.beskeder.length : 0 },
  { key: "filer", label: "Filer" },
];

/**
 * Klik på en blok åbner den her. Mockuppens højre panel, som en dialog.
 *
 * ⚠ MODAL FREM FOR ET SIDEPANEL. Panelet skal kunne rumme en mailtråd og en
 * filliste, og et sidepanel i den bredde ville have klemt gitteret sammen til
 * en tredjedel — netop det gitteret blev komprimeret for at undgå.
 */
function Haendelsespanel({ opgave, lvNavn, enheder, onLuk }) {
  const [fane, setFane] = useState("overblik");
  /* ⚠ SAGEN SLÅS OP PÅ OPGAVENS sagId. `sager/` findes ikke i
     firebase.rules.json endnu (beslutning 20 er fase 0), så opslaget går i
     demo-sættet — og skærmen siger det, frem for at vise en tom fane der
     ligner en sag uden beskeder. */
  const sag = demoSagerFor("flaade").find((s) => s.id === opgave.sagId) || null;
  const enhed = enheder.find((k) => k.id === opgave.koeretoejId) || null;
  const pri = prioritetFor(opgave);

  return (
    <Dialog
      bred
      titel={opgave.beskrivelse}
      under={[enhed?.kaldenavn, ARBEJDSTYPE[opgave.arbejdstype],
              opgave.leverandoerId ? lvNavn(opgave.leverandoerId) : "Eget værksted"]
        .filter(Boolean).join(" · ")}
      handling={<Pille tone={OPGAVE_STATUS[opgave.status]?.pill}>
        {OPGAVE_STATUS[opgave.status]?.label}</Pille>}
      onLuk={onLuk}
    >
      <Faner faner={PANEL_FANER(sag)} valgt={fane} saet={setFane} label="Hændelse" />

      {fane === "overblik" && (
        <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
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
            {opgave.sagId && (
              <MiniLinje label="Sag" vaerdi={sag
                ? <code>{sag.nummer}</code>
                : <span className="fc-neutral">{opgave.sagId}</span>} />
            )}
          </div>
          <Reservationen opgave={opgave} />
        </Gitter>
      )}

      {fane === "kommunikation" && <Kommunikation sag={sag} />}
      {fane === "filer" && <Filer sag={sag} />}

      <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
        <Knap variant="primaer" disabled
              title="Skrivning er ikke bygget: en reservation skal skrives atomisk med opgaven, og to disponenter kan ramme samme sekund. Det hører i en Cloud Function.">
          Marker udført
        </Knap>
        <Knap disabled title="Samme grund — se Kendte huller i README.">Flyt</Knap>
        <Link className="fc-a" to="/flaade/indberetninger" style={{ alignSelf: "center" }}>
          Se indberetninger
        </Link>
      </div>
    </Dialog>
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

function Kommunikation({ sag }) {
  if (!sag) {
    return (
      <Tom>
        Ingen sag på den her opgave. Mailtråden hænger på en <b>sag</b>, og
        sagsnummeret sættes i emnefeltet når der skrives til værkstedet — se
        beslutning 20.
      </Tom>
    );
  }
  return (
    <div>
      <Tabel
        kolonner={[
          { key: "ms", label: "Tid", render: (b) => `${dato(b.ms)} ${klokke(b.ms)}` },
          { key: "retning", label: "", render: (b) => (
            <Pille tone={b.retning === "indgaaende" ? "info" : "ok"}>
              {b.retning === "indgaaende" ? "Ind" : "Ud"}</Pille>) },
          { key: "afsenderNavn", label: "Afsender" },
          { key: "emne", label: "Emne" },
        ]}
        raekker={sag.beskeder}
        tom="Ingen beskeder på sagen."
      />
      {sag.antalKarantaene > 0 && (
        /* ⚠ KARANTÆNE RENDERES IKKE INLINE. Ikke gråtonet, ikke sammenklappet
           — slet ikke. Renderes den i tråden, læser mennesket den og handler
           på den, og så er karantænen en dekoration. Samme regel som at en
           udløbet kompetence BLOKERER frem for at advare. */
        <p className="fc-hint fc-bad" style={{ marginTop: 12 }}>
          ⚠ <b>{num(sag.antalKarantaene)}</b> besked(er) er i karantæne og vises
          ikke her. De frigives på sagen af en der har <code>sag.karantaeneFrigiv</code>.
        </p>
      )}
      <p className="fc-hint" style={{ marginTop: 12 }}>
        Visning, ingen afsendelse. Modtagevej, parsing og scanning mangler —{" "}
        <b>sager/</b> står ikke i <b>firebase.rules.json</b> endnu. Beslutning
        20 er fase 0.
      </p>
    </div>
  );
}

function Filer({ sag }) {
  const vedhaeftninger = (sag?.beskeder || []).flatMap((b) => b.vedhaeftninger || []);
  return (
    <div>
      <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Fotos</h3>
      {/* ⚠ ATTRAPPER, OG DET STÅR PÅ SKÆRMEN. DEV har ingen Storage-bucket —
          den kræver Blaze, og DEV står på Spark. Et upload-felt der så ud til
          at virke, ville fejle først når nogen havde valgt en fil. Bucket'en
          skal oprettes i europe-west1 sammen med en budgetalarm, og regionen
          kan ikke ændres bagefter. Se README. */}
      <div className="fc-fotos">
        {[1, 2, 3].map((n) => (
          <div key={n} className="fc-foto">Foto {n}</div>
        ))}
      </div>
      <p className="fc-hint" style={{ marginTop: 10 }}>
        ⚠ <b>Billederne er attrapper.</b> Der er ingen Storage-bucket i dette
        miljø — den kræver Blaze, og regionen (<b>europe-west1</b>) kan ikke
        ændres når den først er valgt. Upload bygges sammen med bucket'en og en
        budgetalarm, ikke før.
      </p>

      <h3 style={{ fontSize: 13, margin: "18px 0 8px" }}>Dokumenter fra sagen</h3>
      {/* ⚠ FELTET HEDDER filnavn, IKKE navn. Her stod `key: "navn"`, og
          kolonnen stod TOM på skærmen mens statuspillen ved siden af så
          rigtig ud — præcis den fejlklasse CLAUDE.md advarer om: et feltnavn
          skrevet i et modul uden at blive holdt op mod dataene. Den fejler
          ikke, den bliver bare tom, og en tom celle ligner en fil uden navn.

          Statussen er heller ikke rå: VEDHAEFTNING_LABEL og _TONE står i
          sager.js, og Sagsvisning bruger de samme to. Skrev vi `v.status`
          direkte, ville skærmen sige "afventerScan" hvor sagsvisningen siger
          "Afventer scanning". */}
      <Tabel
        kolonner={[
          { key: "filnavn", label: "Fil", render: (v) => <b>{v.filnavn}</b> },
          { key: "stoerrelse", label: "Størrelse", num: true,
            render: (v) => filstoerrelse(v.stoerrelse) },
          { key: "status", label: "Scanning",
            render: (v) => <Pille tone={VEDHAEFTNING_TONE[v.status]}>
              {VEDHAEFTNING_LABEL[v.status]}</Pille> },
        ]}
        raekker={vedhaeftninger}
        tom={sag ? "Ingen vedhæftninger på sagen." : "Ingen sag på opgaven."}
      />
    </div>
  );
}

/* ---- Planlæg aktivitet ------------------------------------------------ */

/* Fejlnøgle → etiket. ⚠ SAMME ORD SOM PÅ FELTET. Skrev opsummeringen
   "koeretoejId" hvor etiketten siger "Enhed", skulle brugeren oversætte vores
   feltnavne for at finde det felt der mangler. */
const FELTNAVN = {
  koeretoejId: "Enhed",
  arbejdstype: "Aktivitetstype",
  status: "Status",
  division: "Division",
  startMs: "Startdato og -tid",
  estimeretMin: "Varighed",
  leverandoerId: "Udføres af",
  prioritet: "Prioritet",
  beskrivelse: "Beskrivelse",
  art: "Art",
  _node: "Noden afviser posten",
};

/**
 * ⚠ DEN SKRIVER GENNEM SERVEREN, IKKE GENNEM skriv.js.
 *
 * `opgaver` ER skrivbar med `opgaver.skriv` — men opgaven og dens RESERVATION
 * skal skrives sammen eller slet ikke, og `reservationer` er `.write: false`
 * for alle. Landede kun opgaven, ville enheden have et værkstedsbesøg uden at
 * være spærret, og så ser den FRI ud i disponeringen — værre end en spærring
 * man kan se. Dertil kan to disponenter ramme samme sekund.
 *
 * Hele begrundelsen står i `fleet/opgaveplan.js` og i functions/index.js.
 *
 * ⚠ VALIDERINGEN ER SERVERENS EGEN. valideOpgaveplan() ligger i delt/ og
 * kaldes begge steder. Formularen svarer HURTIGT; serveren AFGØR — og de to
 * siger det samme, fordi det er den samme funktion.
 *
 * ⚠ INGEN MAIL-BLOK. Mockuppen har "Send bekræftelse til leverandøren?".
 * Beslutning 20 er fase 0: `sager/` står ikke i firebase.rules.json, og der
 * er ingen afsendelse. En deaktiveret radiogruppe der sagde "ikke bygget",
 * ville være en attrap der opfører sig som en kontrol. Skærmen skriver i
 * stedet hvad der mangler.
 */
function Planlaegdialog({ enheder, leverandoerer, harProcure, division, onLuk, onGemt }) {
  /* Startforslag: i morgen kl. 08.00. ⚠ IKKE "nu" — en aktivitet man
     planlægger, ligger frem i tiden, og et defaultet nu ville lave en
     forsinket opgave i samme øjeblik den blev oprettet. */
  const iMorgen = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d.getTime();
  };

  const [post, saetPost] = useState(() => ({
    koeretoejId: "",
    /* ⚠ DIVISIONEN FORESLÅS AF SHELLEN, IKKE AF ENHEDEN. Beslutning 19
       forbyder feltet på koeretoejer/, og en formular der udfyldte det ud fra
       bilen, ville genindføre præcis den kobling. Shellens valgte division er
       et gæt brugeren kan se og rette — bilens ville være et gæt han ikke
       kunne se. `faelles` findes ikke i shellen og vælges derfor manuelt. */
    division,
    arbejdstype: "",
    status: "planlagt",
    leverandoerId: "",
    prioritet: "",
    beskrivelse: "",
    startIso: msTilIso(iMorgen()),
    startTid: "08:00",
    varighedMin: "",
  }));
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);
  /* ⚠ EN FEJL VISES FØRST NÅR FELTET ER RØRT — eller når man har trykket Gem.
     Uden det stod hele formularen rød i det øjeblik den blev åbnet, og en
     formular der skælder ud før man har skrevet noget, lærer man at overse.
     Samme greb som Reolpladser, Medarbejdere, Brugere og fire andre — se
     `vis()` dér. Det er repoets mønster, ikke et nyt. */
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);

  const saet = (felt) => (v) => {
    saetPost((p) => ({ ...p, [felt]: v }));
    saetRoert((r) => ({ ...r, [felt]: true }));
    /* Et svar hører til den post der blev sendt. Rører man et felt bagefter,
       beskriver svaret ikke længere det man har foran sig. */
    saetSvar(null);
  };

  /* ⚠ isoTilMs SÆTTER KLOKKEN 12, IKKE MIDNAT — se format.js. Klokkeslættet
     lægges på bagefter i lokal tid, så en dato der er valgt i en vælger, ikke
     bliver dagen før fordi et trin i kæden trak en time fra. */
  const startMs = (() => {
    const dag = isoTilMs(post.startIso);
    if (!Number.isFinite(dag)) return null;
    const [t, m] = String(post.startTid).split(":").map(Number);
    if (!Number.isFinite(t) || !Number.isFinite(m)) return null;
    const d = new Date(dag);
    d.setHours(t, m, 0, 0);
    return d.getTime();
  })();

  const udkast = {
    art: "vaerksted",
    koeretoejId: post.koeretoejId || null,
    division: post.division,
    arbejdstype: post.arbejdstype || null,
    status: post.status,
    beskrivelse: post.beskrivelse,
    startMs,
    estimeretMin: Number(post.varighedMin) || null,
    leverandoerId: post.leverandoerId || null,
    prioritet: post.prioritet || null,
  };

  const kontrol = valideOpgaveplan(udkast, {
    enheder: enheder.map((k) => k.id),
    leverandoerer: leverandoerer.map((l) => l.id),
  });
  /* ⚠ `vis()` STYRER KUN OM FEJLEN TEGNES — IKKE OM DEN GÆLDER.
     `kanGemme` læser `kontrol.ok` uændret, så en urørt formular ikke kan
     sendes bare fordi den ser pæn ud. De to spørgsmål er forskellige, og de
     skal ikke svares af den samme variabel. */
  const vis = (fejlNoegle, ...roerteNoegler) => {
    /* ⚠ FEJLNØGLEN OG FELTNAVNET ER IKKE ALTID DET SAMME. Datoen hedder
       `startIso` i formularen, men fejlen hedder `startMs`; varigheden hedder
       `varighedMin`, fejlen `estimeretMin`. Uden det her led ville de to
       felter aldrig vise deres fejl — de blev aldrig "rørt" under det navn
       fejlen bar. */
    const noegler = roerteNoegler.length ? roerteNoegler : [fejlNoegle];
    return visAlle || noegler.some((k) => roert[k]) ? kontrol.fejl[fejlNoegle] : null;
  };

  /* ⚠ SLUTTIDSPUNKTET VISES, MEN GEMMES IKKE. Noden bærer startMs og
     estimeretMin; en gemt slutning ville være det samme udsagn to steder og
     drive første gang nogen rettede varigheden. */
  const slutMs = Number.isFinite(startMs) && Number(post.varighedMin) > 0
    ? startMs + Number(post.varighedMin) * 60000
    : null;

  const gem = async () => {
    /* ⚠ FØRST NU VISES DE FELTER MAN ALDRIG RØRTE. Trykker man Gem på en halv
       formular, skal man kunne se hvad der mangler — ikke bare at knappen er
       grå. `kanGemme` har allerede stoppet kaldet; det her er forklaringen. */
    saetVisAlle(true);
    if (!kontrol.ok) return;
    saetGemmer(true);
    saetSvar(null);
    const r = await planlaegOpgave(udkast);
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) onGemt();
  };

  const enhed = enheder.find((k) => k.id === post.koeretoejId) || null;

  return (
    <Dialog
      titel="Planlæg aktivitet"
      under="Opgaven og reservationen skrives sammen — eller slet ikke."
      onLuk={onLuk}
    >
      {/* ⚠ KNAPPEN ER AKTIV, OGSÅ NÅR FORMULAREN ER UGYLDIG — OG DET ER MED
          VILJE. Deaktiverede vi den, ville `saetVisAlle(true)` i gem() aldrig
          kunne kaldes: brugeren ville se en grå knap og INGEN forklaring på
          hvilke felter der manglede. Han har rørt otte af ti; de sidste to har
          han aldrig set en fejl på.

          ⚠ De syv andre formularer i repoet (Reolpladser, Medarbejdere,
          Brugere, Varer, Bevægelser, Indkøb, Udlån) har præcis den døde gren:
          de kalder saetVisAlle(true) i en funktion knappen forhindrer dem i at
          nå. Det er ikke rettet her — det er en selvstændig oprydning — men
          mønstret kopieres ikke videre.

          gem() afviser selv: den sætter visAlle og returnerer, hvis kontrollen
          ikke er ok. Der sendes altså aldrig noget ugyldigt afsted. */}
      <Formular onGem={gem} gemmer={gemmer}
                gemLabel="Planlæg aktivitet" onAnnuller={onLuk} svar={svar}>
        <Felt id="pl-enhed" label="Enhed" kraevet
              vaerdi={post.koeretoejId} saet={saet("koeretoejId")}
              fejl={vis("koeretoejId")}
              valgmuligheder={[
                { vaerdi: "", label: "Vælg enhed" },
                ...enheder
                  /* ⚠ EN SOLGT ELLER SKROTTET ENHED KAN IKKE FÅ EN OPGAVE.
                     Serveren afviser den, og en vælger der tilbød den, ville
                     love noget der bliver sagt nej til bagefter. */
                  .filter((k) => k.status !== "solgt" && k.status !== "skrottet")
                  .map((k) => ({ vaerdi: k.id, label: `${k.kaldenavn} — ${k.navn}` })),
              ]} />

        <Feltraekke>
          <Felt id="pl-type" label="Aktivitetstype" kraevet
                vaerdi={post.arbejdstype} saet={saet("arbejdstype")}
                fejl={vis("arbejdstype")}
                valgmuligheder={[
                  { vaerdi: "", label: "Vælg type" },
                  ...ALLE_ARBEJDSTYPER.map((t) => ({ vaerdi: t, label: ARBEJDSTYPE[t] })),
                ]} />
          <Felt id="pl-status" label="Status" kraevet
                vaerdi={post.status} saet={saet("status")}
                fejl={vis("status")}
                hint="Afventende, hvis arbejdet venter på en reservedel."
                valgmuligheder={PLANLAEGBAR_STATUS.map((v) => ({
                  vaerdi: v, label: OPGAVE_STATUS[v].label,
                }))} />
        </Feltraekke>

        {/* ⚠ DIVISIONEN STÅR FOR SIG OG UDFYLDES IKKE AF ENHEDSVALGET.
            Reglerne kræver den på opgaver/, og enheden HAR den ikke
            (beslutning 19). To felter der ser ud som om det ene følger af det
            andet, er præcis den fælde beslutningen lukkede. */}
        <Felt id="pl-division" label="Division" kraevet
              vaerdi={post.division} saet={saet("division")}
              fejl={vis("division")}
              hint="Kan ikke udledes af enheden — en enhed har ingen division."
              valgmuligheder={[
                { vaerdi: "gods", label: "Gods" },
                { vaerdi: "bus", label: "Bus" },
                { vaerdi: "faelles", label: "Fælles" },
              ]} />

        <Feltraekke>
          <Felt id="pl-dato" label="Startdato" type="date" kraevet
                vaerdi={post.startIso} saet={saet("startIso")}
                fejl={vis("startMs", "startIso", "startTid")} />
          <Felt id="pl-tid" label="Starttid" type="time" kraevet
                vaerdi={post.startTid} saet={saet("startTid")} />
          <Felt id="pl-varighed" label="Varighed" type="number" kraevet
                suffiks="min" min="1"
                vaerdi={post.varighedMin} saet={saet("varighedMin")}
                fejl={vis("estimeretMin", "varighedMin")}
                hint="Så længe er enheden spærret." />
        </Feltraekke>

        <Feltraekke>
          <Felt id="pl-lev" label="Udføres af"
                vaerdi={post.leverandoerId} saet={saet("leverandoerId")}
                fejl={vis("leverandoerId")}
                valgmuligheder={[
                  { vaerdi: "", label: "Eget værksted" },
                  ...leverandoerer
                    .filter((l) => l.kategori === "vaerksted" || l.kategori === "daek")
                    .map((l) => ({ vaerdi: l.id, label: l.navn })),
                ]}
                hint={harProcure
                  ? undefined
                  : "Kun eget værksted: leverandørkartoteket hører til Procure, som ikke er aktivt."} />
          <Felt id="pl-pri" label="Prioritet"
                vaerdi={post.prioritet} saet={saet("prioritet")}
                fejl={vis("prioritet")}
                /* ⚠ TOM ER ET SVAR. En opgave uden prioritet står som ikke
                   vurderet og tælles for sig — se prioritet.js. */
                hint="Tom betyder ikke vurderet — det er et svar."
                valgmuligheder={[
                  { vaerdi: "", label: "Ikke vurderet" },
                  ...ALLE_PRIORITETER.map((v) => ({ vaerdi: v, label: PRIORITET[v].label })),
                ]} />
        </Feltraekke>

        <Felt id="pl-besk" label="Beskrivelse" kraevet
              vaerdi={post.beskrivelse} saet={saet("beskrivelse")}
              fejl={vis("beskrivelse")}
              placeholder="Hvad skal der laves?" maxLength={500} />

        {enhed && slutMs && (
          <div className="fc-sum" style={{ marginTop: 4 }}>
            <span>{enhed.kaldenavn} er spærret</span>
            <span className="fc-sum-v">
              {datoTid(startMs)} – {datoTid(slutMs)}
            </span>
          </div>
        )}

        {visAlle && !kontrol.ok && (
          /* ⚠ NAVNGIVER FELTERNE, ikke bare "udfyld formularen". Fejlene står
             også ved hvert felt, men i en dialog med ti felter kan de to der
             mangler, ligge uden for det man kigger på. */
          <p className="fc-svar fc-svar-fejl" role="alert">
            Mangler: {Object.keys(kontrol.fejl).map((k) => FELTNAVN[k] || k).join(", ")}.
          </p>
        )}

        <p className="fc-hint" style={{ marginTop: 10 }}>
          Sluttidspunktet <b>beregnes</b> og gemmes ikke. Noden bærer
          {" "}<b>startMs</b> og <b>estimeretMin</b> — et gemt sluttidspunkt
          ville være det samme udsagn to steder og drive første gang nogen
          rettede varigheden.
        </p>

        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>Der sendes ingen mail til leverandøren.</b> Mockuppens
          {" "}“Send bekræftelse” er beslutning 20, og den er fase 0:
          {" "}<b>sager/</b> står ikke i <b>firebase.rules.json</b>, og der er
          hverken modtagevej eller afsendelse. Aftalen laves stadig i telefonen
          eller i Outlook — men <b>sagsnummeret</b> kan ikke sættes herfra endnu.
        </p>

        <p className="fc-hint" style={{ marginTop: 10 }}>
          Er enheden allerede optaget, <b>afvises</b> planlægningen med
          {" "}<b>hvad</b> der spærrer. Et værkstedsbesøg har den højeste
          prioritet, men det rydder <b>ikke</b> selv en booking af vejen: turen
          skal flyttes eller annulleres først, så det kan forklares bagefter.
        </p>
      </Formular>
    </Dialog>
  );
}
