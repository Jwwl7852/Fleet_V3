/* src/fleet/Gitterkalender.jsx
 * Ressourcer som rækker, tid som kolonner, aktiviteter som blokke.
 *
 * LIGGER I fleet/ OG IKKE I ET MODUL, fordi tre skærme skal bruge nøjagtig
 * samme gitter:
 *
 *   Værkstedskalender   køretøjer × dage
 *   Servicekalender     lokationer og aktiver × dage
 *   Disponering         biler × timer (enhed: "time")
 *
 * Byggede hver skærm sit eget, ville de læse det samme interval forskelligt,
 * og et gitter der er én dag forskudt opdages ikke ved at kigge på det. Samme
 * begrundelse som Sagsvisning og Soejlegraf.
 *
 * Regnestykket ligger i gitter.js, uden React, så det kan testes.
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
} from "./gitter.js";
import { Tom } from "./ui.jsx";

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
  /* Ekstra hovedraekker over dagene: [{ navn, noegle(slot) }]. Se noten ved
     grupperSlots() — kalderen bestemmer, en uges visning har ingen brug. */
  niveauer = [],
  /* Flytter KALDERENS vindue, ikke rulningen. Uden den er pilene kun en
     rullebjaelke; med den er de ogsaa vejen til dag niogtyve. */
  onSkub = null,
}) {
  const rulRef = useRef(null);
  const slotListe = slots(fra, til, enhed);
  if (!slotListe.length || !raekker.length) return <Tom>{tom}</Tom>;

  const placerede = laegUd(blokke, slotListe);
  const perRaekke = blokkePrRaekke(placerede);
  const antalKonflikter = placerede.filter((p) => p.konflikt).length;

  /* Drop-felterne lægges ud med SAMME funktion som blokkene, så de ikke kan
     være uenige om hvor der er plads. De er attrap i fase 0 — se noten i
     Disponering. */
  const placeredeDrop = dropfelter?.felter?.length
    ? blokkePrRaekke(laegUd(dropfelter.felter, slotListe))
    : new Map();

  return (
    <div>
      <div className="fc-scroll" ref={rulRef}>
        <div className="fc-gk" style={{ "--gk-slots": slotListe.length }}>
          {/* ⚠ FLERE HOVEDRÆKKER, NÅR VINDUET ER LANGT. Otteogtyve dage giver
              otteogtyve kolonner, og datoen i hver af dem bliver ulæselig.
              `niveauer` flytter det man SJÆLDENT skifter — måneden, ugen — op i
              hver sin række, så dagen kun bærer det den ikke kan undvære.
              Kalderen bestemmer; en uges visning har ingen brug for dem. */}
          {niveauer.map((n, i) => (
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
                  {/* Baggrundsceller — så tomme dage har en kant at aflæse på */}
                  {slotListe.map((s, i) => (
                    <div key={s.fra} className={`fc-gk-celle ${erNu(s) ? "fc-gk-nu" : ""}`}
                         style={{ gridColumn: i + 1 }} />
                  ))}

                  {/* Drop-felter FØR blokkene, så en blok altid ligger
                      øverst. Feltet er ikke en knap: det kan ikke fokuseres,
                      det kan ikke klikkes, og title siger hvorfor. En attrap
                      der opfører sig som en kontrol, er værre end ingen. */}
                  {(placeredeDrop.get(r.id) || []).map((d) => (
                    <div
                      key={d.id}
                      className="fc-gk-drop"
                      aria-disabled="true"
                      style={{ gridColumn: `${d.start + 1} / ${d.slut + 2}` }}
                      title={dropfelter.titel}
                    >
                      <span className="fc-gk-tekst">{dropfelter.tekst}</span>
                    </div>
                  ))}

                  {mine.map((b, i) => (
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
                                 `${valgtId === b.id ? "fc-gk-valgt" : ""}`}
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
                        (b.titel || b.label || "")
                      }
                      onClick={() => onVaelg?.(b)}
                    >
                      {b.foerVindue && <span className="fc-gk-pil">←</span>}
                      <span className="fc-gk-tekst">
                        {b.konflikt && "⚠ "}{b.label}
                      </span>
                      {b.efterVindue && <span className="fc-gk-pil">→</span>}
                    </button>
                  ))}
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
