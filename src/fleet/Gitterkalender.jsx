/* src/fleet/Gitterkalender.jsx
 * Ressourcer som rækker, tid som kolonner, aktiviteter som blokke.
 *
 * LIGGER I fleet/ OG IKKE I ET MODUL, fordi FIRE skærme skal bruge nøjagtig
 * samme gitter:
 *
 *   Driftskalender      køretøjer × dage        opgaver, art vaerksted
 *   Servicekalender     lokationer og aktiver × dage   opgaver, art facility
 *   Disponering         biler × timer (enhed: "time")  opgaver + etaper
 *   Unitbookings kalender  kasser × dage        kasseudlaan
 *
 * Byggede hver skærm sit eget, ville de læse det samme interval forskelligt,
 * og et gitter der er én dag forskudt opdages ikke ved at kigge på det. Samme
 * begrundelse som Sagsvisning og Soejlegraf.
 *
 * Regnestykket ligger i gitter.js, uden React, så det kan testes.
 *
 * ⚠ GITTERET FLYTTER INGENTING SELV — beslutning 49.
 * Med `onFlyt` kan en blok trækkes, og gitteret regner ud HVOR den blev
 * sluppet: en række og et vindue. Hvad det så betyder — hvilken node, hvilken
 * funktion, hvilke tjek — er kalderens sag. Tre af de fire skærme flytter
 * `opgaver` gennem `opgaveflyt`; den fjerde flytter kasseudlån og har sin egen
 * vej ind (beslutning 37). Vidste gitteret hvilken funktion det skulle kalde,
 * ville den fjerde skærm skulle rette i noget de tre andre ejer.
 *
 * TO TING DER SKAL BLIVE STÅENDE, OGSÅ NÅR DE SER GRIMME UD:
 *
 *  1. En blok der rækker ud over vinduet får en PIL. En værkstedsblok på tre
 *     uger, klippet ved kanten, læses som et kort besøg — og så planlægger
 *     nogen en tur i en uge hvor bilen står på værksted.
 *  2. Overlap i samme række tegnes som KONFLIKT, ikke stablet i hver sin bane.
 *     På en eksklusiv ressource er et overlap noget reserver() ville afvise.
 *     Ser det pænt ud, skjuler gitteret en fejl i data.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ENHED, slots, slotLabel, slotDele, erNu, laegUd, blokkePrRaekke, grupperSlots,
  greb as grebMaal, skridt as skridtMaal, HAANDTAG_MIN,
  traekTil, maaTraekkes, nyttigeNiveauer,
} from "./gitter.js";
import { Tom } from "./ui.jsx";

/* ⚠ ET TRÆK ER IKKE ET KLIK, OG FORSKELLEN ER ET TAL.
   Blokken er en knap: den vælges med et klik og viser sine detaljer. Uden en
   tærskel ville hvert eneste klik være et træk på nul kolonner — altså en
   flytning der ikke flytter noget, sendt til serveren. Og omvendt: uden den
   ville en hånd der ryster to pixels, aldrig kunne vælge en blok. */
const TRAEK_TAERSKEL = 4;

/**
 * Rullebjaelken under gitteret.
 *
 * HVORFOR DEN FINDES. Et gitter paa otteogtyve dage er bredere end skaermen,
 * og den eneste maade at komme frem paa var et vandret hjul de faerreste
 * museum har — eller en systemrullebjaelke der foerst dukker op NAAR man
 * ruller. Skaermen sagde "Scroll til hoejre for at se laengere frem" med ord,
 * fordi den ikke sagde det med en kontrol. Nu er der en at tage fat i.
 *
 * ⚠ HAANDTAGETS BREDDE ER ET MAAL, IKKE PYNT. Den er saa stor en del af
 * banen som det synlige er af det hele. Et haandtag med fast bredde ville
 * paastaa det samme om fire uger og om ét doegn, og saa kan man ikke se paa
 * det hvor meget der er udenfor.
 *
 * ⚠ DEN ERSTATTER IKKE SYSTEMETS EGEN. .fc-scroll ruller stadig med hjul,
 * med tastatur og med to fingre; det her er ÉN vej mere til det samme.
 * Skjulte vi systemets, ville vi tage noget fra dem der bruger det.
 */
function Rullebjaelke({ maalRef, onSkub }) {
  const [maal, setMaal] = useState({ venstre: 0, synlig: 0, ialt: 0 });
  const banenRef = useRef(null);
  const traekRef = useRef(null);

  const maal_op = useCallback(() => {
    const e = maalRef.current;
    if (!e) return;
    setMaal({ venstre: e.scrollLeft, synlig: e.clientWidth, ialt: e.scrollWidth });
  }, [maalRef]);

  useEffect(() => {
    const e = maalRef.current;
    if (!e) return undefined;
    maal_op();
    e.addEventListener("scroll", maal_op, { passive: true });
    /* Bredden aendrer sig ogsaa uden at nogen ruller: vinduet, sidebaren,
       eller et andet interval med flere kolonner. */
    const ro = new ResizeObserver(maal_op);
    ro.observe(e);
    if (e.firstElementChild) ro.observe(e.firstElementChild);
    return () => { e.removeEventListener("scroll", maal_op); ro.disconnect(); };
  }, [maalRef, maal_op]);

  const { venstre, synlig, ialt } = maal;
  const skjult = ialt - synlig;
  /* Under én px forskel er der intet at rulle, og en bjaelke der ikke kan
     bruges er en knap der lyver.

     ⚠ MEN KAN KALDEREN FLYTTE SELVE PERIODEN, er der stadig noget at gaa
     efter. Unitbookings vindue er otteogtyve dage og passer paa en bred
     skaerm — der er intet at RULLE i, og alligevel var der ingen vej til dag
     niogtyve. En bjaelke der kun kan rulle, ville vaere skjult netop dér hvor
     man mangler den mest. */
  const { kanRulle, del, andel } = grebMaal(venstre, synlig, ialt);
  if (!synlig || (!kanRulle && !onSkub)) return null;

  const rulTil = (px) => maalRef.current?.scrollTo({ left: px, behavior: "smooth" });

  /* Fra et sted paa banen til en rulleposition. Haandtaget har bredde, saa
     banen man kan lande paa er kortere end banen selv — ellers kan man ikke
     naa helt ud i hoejre side. */
  const fraBane = (klientX, medHaandtag) => {
    const b = banenRef.current?.getBoundingClientRect();
    if (!b || !b.width) return 0;
    const hb = Math.max(HAANDTAG_MIN, b.width * del);
    const plads = b.width - hb;
    const x = medHaandtag
      ? klientX - b.left - traekRef.current.greb
      : klientX - b.left - hb / 2;
    return plads <= 0 ? 0 : Math.max(0, Math.min(1, x / plads)) * skjult;
  };

  const grebNed = (ev) => {
    const b = banenRef.current.getBoundingClientRect();
    const hb = Math.max(HAANDTAG_MIN, b.width * del);
    const plads = b.width - hb;
    traekRef.current = { greb: ev.clientX - b.left - (plads * (venstre / skjult)) };
    ev.currentTarget.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  };
  const grebFlyt = (ev) => {
    if (!traekRef.current || !ev.currentTarget.hasPointerCapture(ev.pointerId)) return;
    /* Under et traek foelger den fingeren UDEN blød rulning: en animation
       oveni et traek foeles som forsinkelse, og saa retter man for meget. */
    maalRef.current.scrollLeft = fraBane(ev.clientX, true);
  };
  const grebOp = (ev) => {
    traekRef.current = null;
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    }
  };

  /* Beslutningen — rul eller flyt perioden — ligger i gitter.js og er proevet
     der. Her er kun det der roerer DOM en. */
  const gaa = (retning) => {
    const s = skridtMaal(venstre, synlig, ialt, retning, !!onSkub);
    if (s.slags === "skub") onSkub(s.til);
    else rulTil(s.til);
  };

  return (
    <div className="fc-gk-rul">
      <button type="button" className="fc-gk-rul-pil"
              aria-label={onSkub ? "Tilbage" : "Én skærm tilbage"}
              disabled={!onSkub && venstre <= 1} onClick={() => gaa(-1)}>‹</button>

      {/* Banen er klikbar: et klik ved siden af haandtaget springer derhen,
          som en rullebjaelke gør. */}
      <div ref={banenRef} className={`fc-gk-rul-bane ${kanRulle ? "" : "fc-gk-rul-fuld"}`}
           onPointerDown={(e) => {
             if (kanRulle && e.target === e.currentTarget) rulTil(fraBane(e.clientX, false));
           }}>
        {!kanRulle ? (
          /* ⚠ ET HAANDTAG DER FYLDER HELE BANEN ER IKKE ET HAANDTAG. Hele
             perioden er synlig, saa der er intet at traekke i — og en kontrol
             man kan gribe fat i uden at der sker noget, er værre end ingen.
             Fyldet siger "du ser det hele"; pilene siger hvor man kommer hen. */
          <div className="fc-gk-rul-alt" aria-hidden="true" />
        ) : (
        <div
          className="fc-gk-rul-greb"
          role="scrollbar"
          aria-orientation="horizontal"
          aria-label="Rul kalenderen frem og tilbage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(andel * 100)}
          tabIndex={0}
          style={{ width: `${del * 100}%`, minWidth: HAANDTAG_MIN, left: `calc((100% - max(${HAANDTAG_MIN}px, ${del * 100}%)) * ${andel})` }}
          onPointerDown={grebNed}
          onPointerMove={grebFlyt}
          onPointerUp={grebOp}
          onPointerCancel={grebOp}
          onKeyDown={(e) => {
            /* Tastaturet ogsaa. Et haandtag man kun kan tage fat i med en mus,
               er en kontrol halvdelen af skaermlaeserne ikke har. */
            const en = Math.max(1, Math.round(synlig * 0.8));
            const k = { ArrowLeft: -en / 4, ArrowRight: en / 4,
                        PageUp: -en, PageDown: en,
                        Home: -ialt, End: ialt }[e.key];
            if (k === undefined) return;
            e.preventDefault();
            rulTil(Math.max(0, Math.min(skjult, venstre + k)));
          }}
        />
        )}
      </div>

      <button type="button" className="fc-gk-rul-pil"
              aria-label={onSkub ? "Frem" : "Én skærm frem"}
              disabled={!onSkub && venstre >= skjult - 1} onClick={() => gaa(1)}>›</button>
    </div>
  );
}

const TONE_KLASSE = {
  ok: "fc-gk-ok",
  warn: "fc-gk-warn",
  bad: "fc-gk-bad",
  info: "fc-gk-info",
  brand: "fc-gk-brand",
};

/**
 * Gitterkalender({ raekker, fra, til, enhed, blokke, valgtId, onVaelg, tom })
 *
 *   raekker   [{ id, label, under, pille }]
 *   niveauer  [{ navn, noegle(slot) }] — ekstra hovedraekker (maaned, uge)
 *   onSkub    (retning) => void — flytter kalderens vindue frem/tilbage
 *   blokke   [{ id, raekkeId, fra, til, label, tone }]
 *   enhed    "dag" (standard) | "time"
 *
 * fra/til er halvåbent [fra, til) — samme regel som reservationsmodellen.
 */
export default function Gitterkalender({
  raekker = [], blokke = [], fra, til, enhed = ENHED.dag,
  valgtId = null, onVaelg, tom = "Ingen aktiviteter i perioden.",
  dropfelter = null,
  /* Ekstra hovedraekker over dagene: [{ navn, noegle(slot) }].
     ⚠ KALDEREN SIGER HVILKE GRUPPERINGER DER GIVER MENING FOR HANS DATA; det
     er stadig hans valg (UNITBOOKING.md 6.8). Men om en af dem har noget at
     VISE, afhaenger af det vindue der er valgt lige nu — og kolonnerne kender
     kun gitteret. En raekke med ét felt der spaender hele vinduet, siger
     "august" én gang og koster en hel raekke; se niveauErNyttigt(). */
  niveauer = [],
  /* Flytter KALDERENS vindue, ikke rulningen. Uden den er pilene kun en
     rullebjaelke; med den er de ogsaa vejen til dag niogtyve. */
  onSkub = null,
  /* ⚠ TRÆK ER TILVALG, IKKE STANDARD. Gitteret bruges af fire skaerme, og de
     tre af dem flytter opgaver — den fjerde, Unitbookings kalender, flytter
     KASSEUDLAAN, som har sin egen vej ind (`kasseudlaanskriv`, beslutning 37).
     Et gitter der altid kunne traekke, ville love noget den skaerm ikke kan
     holde. Uden `onFlyt` opfoerer blokkene sig praecis som foer.
       onFlyt(blok, { raekkeId, fra, til })
       kanFlytte(blok) → false spaerrer den ENKELTE blok, med en grund. */
  onFlyt = null,
  kanFlytte = null,
}) {
  const rulRef = useRef(null);
  /* ⚠ HOOKS FØR DEN TIDLIGE RETURN. `slotListe` beregnes nedenfor, men et tomt
     gitter returnerer tidligt — og en useState efter den return ville aendre
     antallet af hooks mellem to renders. Derfor staar traekket her. */
  const [traek, setTraek] = useState(null);
  const traekRef = useRef(null);
  const varTraekRef = useRef(false);

  const slotListe = slots(fra, til, enhed);
  if (!slotListe.length || !raekker.length) return <Tom>{tom}</Tom>;

  const placerede = laegUd(blokke, slotListe);
  const perRaekke = blokkePrRaekke(placerede);
  const antalKonflikter = placerede.filter((p) => p.konflikt).length;

  /* Drop-felterne lægges ud med SAMME funktion som blokkene, så de ikke kan
     være uenige om hvor der er plads. Ét regnestykke, to visninger. */
  const placeredeDrop = dropfelter?.felter?.length
    ? blokkePrRaekke(laegUd(dropfelter.felter, slotListe))
    : new Map();

  /* ---- Træk ---------------------------------------------------------- */

  /** Kan DENNE blok flyttes? Tre ting skal passe, og de siger hver sit. */
  const flytbar = (p) =>
    Boolean(onFlyt) && maaTraekkes(p) && (!kanFlytte || kanFlytte(p) === true);

  /** Hvorfor ikke — sætningen står på blokken, ikke i en konsol. */
  const spaerring = (p) => {
    if (!onFlyt) return null;
    if (!maaTraekkes(p)) {
      return "Blokken rækker ud over perioden og kan ikke trækkes — man kan " +
             "ikke se hvor den begynder. Udvid perioden først.";
    }
    const svar = kanFlytte?.(p);
    return typeof svar === "string" ? svar : null;
  };

  /* ⚠ HVILKEN CELLE ER PEGEREN OVER? Cellerne bærer sit rækkeid og sit
     kolonneindeks som data-attributter, og opslaget sker med
     elementFromPoint. Alternativet — at regne x/y om til en kolonne ud fra
     gitterets bredde — ville være et ANDET regnestykke end det CSS bruger til
     at tegne kolonnerne, og de to ville være uenige i kanten. Her spørger vi
     browseren hvor den rent faktisk tegnede. */
  const celleUnder = (x, y) => {
    const e = document.elementFromPoint(x, y)?.closest?.("[data-raekke][data-slot]");
    if (!e) return null;
    return { raekkeId: e.dataset.raekke, indeks: Number(e.dataset.slot) };
  };

  const grebNed = (ev, p) => {
    if (!flytbar(p)) return;
    /* Kun den primære knap. Højreklik åbner en menu, og et træk der begyndte
       under den, ville hænge fast. */
    if (ev.button !== 0) return;
    traekRef.current = { id: p.id, x0: ev.clientX, y0: ev.clientY, flyttet: false };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  const grebFlyt = (ev) => {
    const t = traekRef.current;
    if (!t || !ev.currentTarget.hasPointerCapture(ev.pointerId)) return;
    if (!t.flyttet) {
      const langt = Math.abs(ev.clientX - t.x0) + Math.abs(ev.clientY - t.y0);
      if (langt < TRAEK_TAERSKEL) return;
      t.flyttet = true;
    }
    setTraek({ id: t.id, over: celleUnder(ev.clientX, ev.clientY) });
  };

  const grebSlip = (ev, p) => {
    const t = traekRef.current;
    traekRef.current = null;
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    }
    setTraek(null);
    /* Bevægede den sig ikke, var det et klik. onClick tager over. */
    if (!t || !t.flyttet) return;
    /* ⚠ ET TRÆK DER BLEV SLUPPET, ER IKKE ET KLIK — OG preventDefault() PÅ
       pointerup STOPPER IKKE KLIKKET. Browseren sender `click` bagefter
       alligevel, så flaget her er det eneste der virker: onClick spørger om
       det og nulstiller det. Uden det ville blokken også blive VALGT hver gang
       den blev flyttet, og detaljepanelet ville skifte under hånden på den der
       lige har flyttet noget andet. */
    varTraekRef.current = true;

    const maal = celleUnder(ev.clientX, ev.clientY);
    if (!maal) return;
    slipPaa(p, maal.raekkeId, maal.indeks);
  };

  /** Ét sted for både musen og tastaturet — de to må ikke regne forskelligt. */
  const slipPaa = (p, raekkeId, indeks) => {
    const ny = traekTil(p, slotListe, p.start, indeks);
    if (!ny) return;
    if (raekkeId === p.raekkeId && ny.fra === p.fra) return;   // slap hvor den lå
    onFlyt(p, { raekkeId, fra: ny.fra, til: ny.til });
  };

  /**
   * ⚠ TASTATURET KAN DET SAMME SOM MUSEN.
   *
   * Rullebjælken fik det af samme grund: en kontrol man kun kan tage fat i med
   * en mus, er en kontrol halvdelen af skærmlæserne ikke har. Shift + pil
   * flytter — vandret i tid, lodret til en anden ressource. Uden Shift ruller
   * og navigerer pilene som de plejer, så den almindelige brug ikke ændrer sig.
   */
  const tastFlyt = (ev, p) => {
    if (!ev.shiftKey || !flytbar(p)) return;
    const raekkeIndeks = raekker.findIndex((r) => r.id === p.raekkeId);
    const skridt = { ArrowLeft: -1, ArrowRight: 1 }[ev.key];
    const spring = { ArrowUp: -1, ArrowDown: 1 }[ev.key];
    if (skridt === undefined && spring === undefined) return;
    ev.preventDefault();

    if (skridt !== undefined) {
      slipPaa(p, p.raekkeId, p.start + skridt);
      return;
    }
    const naeste = raekker[raekkeIndeks + spring];
    if (naeste) slipPaa(p, naeste.id, p.start);
  };

  return (
    <div>
      <div className="fc-scroll" ref={rulRef}>
        <div className="fc-gk" style={{ "--gk-slots": slotListe.length }}>
          {/* ⚠ FLERE HOVEDRÆKKER, NÅR VINDUET ER LANGT. Otteogtyve dage giver
              otteogtyve kolonner, og datoen i hver af dem bliver ulæselig.
              `niveauer` flytter det man SJÆLDENT skifter — måneden, ugen — op i
              hver sin række, så dagen kun bærer det den ikke kan undvære.
              Kalderen bestemmer; en uges visning har ingen brug for dem. */}
          {nyttigeNiveauer(slotListe, niveauer).map((n, i) => (
            <Fragment key={n.navn || i}>
              <div className="fc-gk-navn fc-gk-hj fc-gk-niveau">{n.navn || ""}</div>
              <div className="fc-gk-band fc-gk-hoved fc-gk-niveau">
                {grupperSlots(slotListe, n.noegle).map((g) => (
                  <div key={g.fra} className="fc-gk-kol fc-gk-gruppe"
                       style={{ gridColumn: `span ${g.antal}` }}>
                    {g.noegle}
                  </div>
                ))}
              </div>
            </Fragment>
          ))}

          {/* Hoved */}
          <div className="fc-gk-navn fc-gk-hj" />
          <div className="fc-gk-band fc-gk-hoved">
            {slotListe.map((s) => {
              /* ⚠ TO LINJER: ugedagen over datoen. "ons 19.08" på én linje
                 bliver til "ons 19…" så snart vinduet er langt — altså mister
                 man netop datoen. `title` bærer den fulde tekst. */
              const { over, under } = slotDele(s, enhed);
              return (
              <div key={s.fra} className={`fc-gk-kol ${erNu(s) ? "fc-gk-nu" : ""}`}
                   title={slotLabel(s, enhed)}>
                {over && <span className="fc-gk-kol-dag">{over}</span>}
                <span className="fc-gk-kol-dato">{under}</span>
              </div>
              );
            })}
          </div>

          {raekker.map((r) => {
            const mine = perRaekke.get(r.id) || [];
            return (
              <div key={r.id} className="fc-gk-raekkepar">
                {/* ⚠ TO LINJER, IKKE TRE. Navn, undertekst og pille stod
                    stablet lodret, og rækken blev 68 px — mens selve
                    blokbåndet kun er 30. Det var navnekolonnen der bestemte
                    højden, ikke indholdet. Pillen står nu ved siden af navnet.
                    Se noten i fleet.css. */}
                <div className="fc-gk-navn">
                  <span className="fc-gk-navn-linje">
                    <span className="fc-gk-navn-t">{r.label}</span>
                    {r.pille}
                  </span>
                  {r.under && <span className="fc-gk-navn-u">{r.under}</span>}
                </div>
                <div className="fc-gk-band">
                  {/* Baggrundsceller — så tomme dage har en kant at aflæse på.
                      ⚠ OG DE BÆRER DERES ADRESSE. `data-raekke` og `data-slot`
                      er det elementFromPoint slår op i, når en blok slippes.
                      Uden dem skulle et træk regne x/y om til en kolonne med
                      et ANDET regnestykke end det CSS tegner efter — og de to
                      ville være uenige netop i kanten mellem to kolonner. */}
                  {slotListe.map((s, i) => (
                    <div key={s.fra}
                         data-raekke={r.id} data-slot={i}
                         className={`fc-gk-celle ${erNu(s) ? "fc-gk-nu" : ""} ` +
                                    `${traek?.over?.raekkeId === r.id && traek?.over?.indeks === i
                                      ? "fc-gk-maal" : ""}`}
                         style={{ gridColumn: i + 1 }} />
                  ))}

                  {/* Drop-felter FØR blokkene, så en blok altid ligger øverst.
                      ⚠ FELTET ER EN KNAP NÅR DER ER NOGET AT KALDE, OG ELLERS
                      IKKE. Gav kalderen ingen `paaFelt`, kan det hverken
                      fokuseres eller klikkes, og `title` siger hvorfor — en
                      attrap der opfører sig som en kontrol, er værre end
                      ingen. Med `paaFelt` er det en rigtig knap med et rigtigt
                      tastaturfokus. */}
                  {(placeredeDrop.get(r.id) || []).map((d) => (
                    dropfelter.paaFelt ? (
                      <button
                        key={d.id}
                        type="button"
                        className="fc-gk-drop fc-gk-drop-kan"
                        style={{ gridColumn: `${d.start + 1} / ${d.slut + 2}` }}
                        title={dropfelter.titel}
                        onClick={() => dropfelter.paaFelt(d)}
                      >
                        <span className="fc-gk-tekst">{dropfelter.tekst}</span>
                      </button>
                    ) : (
                      <div
                        key={d.id}
                        className="fc-gk-drop"
                        aria-disabled="true"
                        style={{ gridColumn: `${d.start + 1} / ${d.slut + 2}` }}
                        title={dropfelter.titel}
                      >
                        <span className="fc-gk-tekst">{dropfelter.tekst}</span>
                      </div>
                    )
                  ))}

                  {mine.map((b, i) => {
                    const kan = flytbar(b);
                    const hvorfor = spaerring(b);
                    return (
                    <button
                      key={b.id}
                      type="button"
                      /* ⚠ ID'ET PAA ELEMENTET, saa en forbruger kan finde
                         blokken under musen uden at gitteret skal kende til
                         svaevekort. Gitteret bruges af tre skaerme, og et
                         onHover-kald med sin egen tilstand ville have vaeret
                         en fjerde ting de tre skulle vaere enige om. */
                      data-blok={b.id}
                      className={`fc-gk-blok ${TONE_KLASSE[b.tone] || TONE_KLASSE.info} ` +
                                 `${b.konflikt ? "fc-gk-konflikt" : ""} ` +
                                 `${valgtId === b.id ? "fc-gk-valgt" : ""} ` +
                                 `${kan ? "fc-gk-kan-flyttes" : ""} ` +
                                 `${traek?.id === b.id ? "fc-gk-traekkes" : ""}`}
                      style={{
                        gridColumn: `${b.start + 1} / ${b.slut + 2}`,
                        /* Konfliktende blokke forskydes NETOP SÅ MEGET at man
                           kan se der er to. De lægges ikke i hver sin bane —
                           så ville det se rigtigt ud. */
                        marginTop: b.konflikt ? i * 7 : 0,
                      }}
                      title={
                        (b.konflikt ? "⚠ Overlapper en anden blok på samme ressource. " : "") +
                        (b.foerVindue ? "Begyndte før perioden. " : "") +
                        (b.efterVindue ? "Fortsætter efter perioden. " : "") +
                        (b.titel || b.label || "") +
                        (kan ? "\n\nTræk for at flytte. Shift + piletast gør det samme." : "") +
                        (hvorfor ? `\n\n${hvorfor}` : "")
                      }
                      onPointerDown={(ev) => grebNed(ev, b)}
                      onPointerMove={grebFlyt}
                      onPointerUp={(ev) => grebSlip(ev, b)}
                      onPointerCancel={(ev) => grebSlip(ev, b)}
                      onKeyDown={(ev) => tastFlyt(ev, b)}
                      onClick={() => {
                        /* Se noten i grebSlip: et sluppet traek sender ogsaa
                           et klik, og blokken maa ikke ogsaa blive VALGT. */
                        if (varTraekRef.current) { varTraekRef.current = false; return; }
                        onVaelg?.(b);
                      }}
                    >
                      {b.foerVindue && <span className="fc-gk-pil">←</span>}
                      <span className="fc-gk-tekst">
                        {b.konflikt && "⚠ "}{b.label}
                      </span>
                      {b.efterVindue && <span className="fc-gk-pil">→</span>}
                    </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Rullebjaelke maalRef={rulRef} onSkub={onSkub} />

      {/* Skrives ud, ikke kun tegnet. En pil man ikke lægger mærke til, er
          tavs afkortning med ekstra trin. */}
      {placerede.some((p) => p.foerVindue || p.efterVindue) && (
        <p className="fc-hint" style={{ marginTop: 10 }}>
          <b>←</b> og <b>→</b> betyder at aktiviteten strækker sig ud over den viste
          periode. Blokken er <b>ikke</b> så kort som den ser ud — udvid perioden for
          at se hele forløbet.
        </p>
      )}
      {/* ⚠ TRÆK ER USYNLIGT INDTIL MAN PRØVER. En blok der kan flyttes, ser ud
          som en blok. Musemarkøren siger det til den der allerede har hånden
          på den; linjen her siger det til den der ikke har — og den nævner
          tastaturet, fordi en kontrol man kun kan nå med en mus, ikke er en
          kontrol for alle. */}
      {onFlyt && placerede.some(flytbar) && (
        <p className="fc-hint" style={{ marginTop: 10 }}>
          <b>Træk en blok</b> for at flytte den — til et andet tidspunkt eller en
          anden række. <b>Shift + piletast</b> gør det samme fra tastaturet.
          Serveren kører de samme tjek igen og afviser hvis pladsen er optaget.
        </p>
      )}
      {antalKonflikter > 0 && (
        <p className="fc-hint fc-bad" style={{ marginTop: 8 }}>
          ⚠ {antalKonflikter} blokke overlapper på samme ressource. Det er en
          konflikt reservationsmodellen ville afvise — de tegnes oven i hinanden
          med vilje, så det ikke ligner noget der er i orden.
        </p>
      )}
    </div>
  );
}
