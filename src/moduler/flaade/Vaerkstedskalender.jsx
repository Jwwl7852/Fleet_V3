/* src/moduler/flaade/Vaerkstedskalender.jsx
 * Fleet → Driftskalender.
 *
 * ⚠ FILNAVNET ER GAMMELT, RUTEN ER NY (TO GANGE NU). Skærmen hed
 * Værkstedskalender og lå på /flaade/vaerksted; den blev Driftskalender på
 * /flaade, hvor Enheder lå. Fleet TARGET-restruktureringen (masterbrief §1,
 * produktejer-review 2026-09-01) gjorde Driftskalenderen til ÉN fane blandt
 * flere i stedet for hele modulets forside — se `fleet/modulfaner.js` — og
 * flyttede den derfor videre til `/flaade/driftskalender`. Modulets forside
 * er nu Overblik.jsx, som overtog de fem "kasser"/arbejdskøen. Filen bliver
 * liggende under samme navn af samme grund som mappen hedder flaade/ og
 * noden koeretoejer/: et filnavn er billigt at skifte, men det er også det
 * eneste sted en ældre commit stadig kan finde den under. Se nav.js.
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
 * ⚠ DE FEM KASSER OG ARBEJDSKØEN BOR IKKE HER LÆNGERE — se Overblik.jsx.
 * Fleet TARGET §9.1/§9.6: arbejdskøen skal være modulets PRIMÆRE, altid
 * synlige arbejdsflade, ikke et panel man åbner fra et KPI-kort ovenpå
 * kalenderen. Kalenderen er stadig vigtig (§9.5 — "stor central
 * arbejdsflade"), men er ikke længere alene informationsarkitekturen.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useMemo, useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, dato, datoTid } from "../../fleet/format.js";
import {
  Kort, Pille, Knap, Henter, Datatilstand, Formularsvar, ModulNav,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { Modulfakturaer } from "../../fleet/Modulfakturaer.jsx";
import Gitterkalender from "../../fleet/Gitterkalender.jsx";
import {
  VISNING, ALLE_VISNINGER, vindueFor, flyt, slutter, raekkerIVindue,
} from "../../fleet/driftskalender.js";
import { OPGAVE_STATUS, ARBEJDSTYPE, ressourceId } from "../../fleet/opgaver.js";
import { prioritetFor } from "../../fleet/prioritet.js";
import { flytOpgave, kanFlyttes } from "../../fleet/opgaveplan.js";
import Planlaegdialog from "../../fleet/Planlaegdialog.jsx";
import Haendelsespanel from "../../fleet/Haendelsespanel.jsx";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { KOERETOEJ_STATUS } from "../../fleet/flaade.js";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
import { FLEET_FANER } from "../../fleet/modulfaner.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
/* ⚠ KUN SOM FALDBAKKE I useListe. Sættet bruges når der ingen database er
   — se noten ved hentningen ovenfor. Skærmen slår IKKE op i det. */
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

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
  const [valgtId, setValgtId] = useState(null);
  /* ⚠ FLEET TARGET §9.3 — se Planlaegdialog.jsx's egen note. Sat sammen med
     `valgtId` lige efter en planlægning med en ekstern leverandør, så
     Haendelsespanel åbner direkte på Sag-fanen i stedet for at kræve et
     ekstra klik senere. */
  const [aabnPaaSag, setAabnPaaSag] = useState(false);
  const [svaev, setSvaev] = useState(null);
  const [planlaegger, setPlanlaegger] = useState(false);
  /* Serverens svar paa en flytning. ⚠ EN AFVISNING ER ET SVAR, ikke en fejl:
     "bilen er optaget" og "du maa ikke" er to forskellige ting, og de skal
     kunne laeses. Se PLANSVAR i opgaveplan-regler.js. */
  const [flytSvar, setFlytSvar] = useState(null);
  /* Fleet TARGET §9.5 — "fakturaområdet kan foldes sammen". Samme mønster
     som Dashboard.jsx's "Ekstra nøgletal" (.fc-sammenklap). Standard lukket:
     kalenderen er den centrale arbejdsflade, fakturaer er en genvej ved
     siden af, ikke noget der skal fylde ved hvert besøg på siden. */
  const [fakturaAaben, setFakturaAaben] = useState(false);

  /* ⚠ KUN art "vaerksted". Fleets driftskalender er FLÅDENS arbejde.
     `opgaver` rummer også facility-opgaver — en port der skal repareres, et
     ventilationsfilter — og de har deres egen skærm i Facility →
     Servicekalender, der læser den SAMME node. Talte begge moduler dem med,
     ville det samme arbejde stå i to tal, og en vognmand der lagde dem sammen,
     ville tælle sit filterskift to gange. Det er beslutning 11 og 14's fejl på
     tværs af moduler. */
  const flaadeopgaver = useMemo(
    () => opgaver.data.filter((o) => o.art === "vaerksted"), [opgaver.data]);

  const vindue = useMemo(() => vindueFor(visning, anker), [visning, anker]);

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

  if (opgaver.henter) return <Henter hvad="driftsopgaver" />;
  /* En AFVIST læsning er ikke en tom liste. */
  if (blokerer(opgaver.tilstand)) {
    return <Datatilstand tilstand={opgaver.tilstand} genprov={opgaver.genindlaes} />;
  }

  /* ⚠ ER VI BLADRET UD AF DET HENTEDE? Så er gitteret tomt uden at noget er
     tomt. Tavs afkortning med et ekstra trin. */
  const udenfor = opgaver.interval &&
    (vindue.fra < opgaver.interval.fra || vindue.til > opgaver.interval.til);

  return (
    <div className="fc-grid" style={{ gap: 11 }}>
      <ModulNav punkter={FLEET_FANER} />
      <Datatilstand tilstand={opgaver.tilstand} genprov={opgaver.genindlaes} />

      {/* ---- Kalenderen ---- */}
      <Kort
        titel="Driftskalender"
        handling={
          <Knap variant="primaer" onClick={() => setPlanlaegger(true)}
                disabled={!maaPlanlaegge}
                title={maaPlanlaegge ? undefined : "Kræver opgaver.skriv."}>
            Planlæg aktivitet
          </Knap>
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
            klæber, så man ikke skal tælle kolonner for at finde dagen.
            ⚠ FLEET TARGET COMPLETION (produktejer-review 2026-09-01) —
            "gør kalenderområdet markant højere og mere dominerende". Standard
            i fleet.css er `--gk-maks: 430px`, sat da gitteret delte skærmen
            med de fem kasser og arbejdskøen nedenunder. De bor nu i
            Overblik.jsx; Driftskalenderen er sin egen arbejdsflade uden andet
            under sig, og kan derfor bruge resten af vinduets højde. */}
        <div className="fc-gk-lodret" style={{ "--gk-maks": "calc(100vh - 300px)" }}>
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
        </p>
      </Kort>

      {svaev && <Svaevekort svaev={svaev} lvNavn={lvNavn} />}

      {planlaegger && (
        <Planlaegdialog
          enheder={enheder.data}
          leverandoerer={leverandoerer.data}
          onLuk={() => setPlanlaegger(false)}
          onGemt={(res) => {
            setPlanlaegger(false);
            opgaver.genindlaes();
            /* ⚠ FLEET TARGET §9.3 — åbn straks på Sag-fanen når opgaven fik
               en ekstern leverandør. Samme Haendelsespanel som et klik på
               blokken ville åbne — kun fanevalget er forudsat. */
            if (res?.harEksternLeverandoer && res.opgaveId) {
              setValgtId(res.opgaveId);
              setAabnPaaSag(true);
            }
          }}
        />
      )}

      {valgt && (
        <Haendelsespanel
          opgave={valgt}
          lvNavn={lvNavn}
          enheder={enheder.data}
          maaSkrive={maaPlanlaegge}
          initialFane={aabnPaaSag ? "sag" : "overblik"}
          /* ⚠ PANELET LUKKES IKKE AF SIG SELV EFTER ET SKIFT. Et statusskifte
             er ikke nødvendigvis det sidste man gør ved en opgave — man kan
             sætte den i gang og derefter kigge på reservationen. Men listen
             SKAL genindlæses, ellers står pillen på den gamle status mens
             serveren har den nye. */
          onSkiftet={() => opgaver.genindlaes()}
          onLuk={() => { setValgtId(null); setAabnPaaSag(false); }}
        />
      )}

      {/* ⚠ FLEET TARGET §9.5 — FAKTURAOMRÅDET KAN FOLDES SAMMEN. Samme
          .fc-sammenklap-mønster som Dashboard.jsx's "Ekstra nøgletal".
          ⚠ SAMME FAKTURAER SOM FAKTURACENTERET — ikke et andet sæt.
          Modulet ejer sagen; centeret ejer fakturaen (beslutning 86). */}
      <details className="fc-sammenklap" open={fakturaAaben}
                onToggle={(e) => setFakturaAaben(e.target.open)}>
        <summary>
          <span aria-hidden="true" className="fc-sammenklap-pil">{"›"}</span>
          Fakturaer på Fleet
        </summary>
        <div className="fc-sammenklap-b">
          <Modulfakturaer art="fleet" />
        </div>
      </details>
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
