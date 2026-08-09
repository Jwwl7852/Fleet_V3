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
import { ENHED, slots, slotLabel, erNu, laegUd, blokkePrRaekke } from "./gitter.js";
import { Tom } from "./ui.jsx";

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
 *   raekker  [{ id, label, under, pille }]
 *   blokke   [{ id, raekkeId, fra, til, label, tone }]
 *   enhed    "dag" (standard) | "time"
 *
 * fra/til er halvåbent [fra, til) — samme regel som reservationsmodellen.
 */
export default function Gitterkalender({
  raekker = [], blokke = [], fra, til, enhed = ENHED.dag,
  valgtId = null, onVaelg, tom = "Ingen aktiviteter i perioden.",
}) {
  const slotListe = slots(fra, til, enhed);
  if (!slotListe.length || !raekker.length) return <Tom>{tom}</Tom>;

  const placerede = laegUd(blokke, slotListe);
  const perRaekke = blokkePrRaekke(placerede);
  const antalKonflikter = placerede.filter((p) => p.konflikt).length;

  return (
    <div>
      <div className="fc-scroll">
        <div className="fc-gk" style={{ "--gk-slots": slotListe.length }}>
          {/* Hoved */}
          <div className="fc-gk-navn fc-gk-hj" />
          <div className="fc-gk-band fc-gk-hoved">
            {slotListe.map((s) => (
              <div key={s.fra} className={`fc-gk-kol ${erNu(s) ? "fc-gk-nu" : ""}`}>
                {slotLabel(s, enhed)}
              </div>
            ))}
          </div>

          {raekker.map((r) => {
            const mine = perRaekke.get(r.id) || [];
            return (
              <div key={r.id} className="fc-gk-raekkepar">
                <div className="fc-gk-navn">
                  <span className="fc-gk-navn-t">{r.label}</span>
                  {r.under && <span className="fc-gk-navn-u">{r.under}</span>}
                  {r.pille}
                </div>
                <div className="fc-gk-band">
                  {/* Baggrundsceller — så tomme dage har en kant at aflæse på */}
                  {slotListe.map((s, i) => (
                    <div key={s.fra} className={`fc-gk-celle ${erNu(s) ? "fc-gk-nu" : ""}`}
                         style={{ gridColumn: i + 1 }} />
                  ))}

                  {mine.map((b, i) => (
                    <button
                      key={b.id}
                      type="button"
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
