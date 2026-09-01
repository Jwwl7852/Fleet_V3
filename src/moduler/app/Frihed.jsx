/* src/moduler/app/Frihed.jsx
 * Anmod om frihed — og se svaret.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ SVARET KOMMER I APPEN, IKKE PÅ MAIL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Specifikationens kort siger *"Du får svar på mail"*. Mail er beslutning 20
 * og er **fase 0**: `sager/` står ikke i `firebase.rules.json`, og der er
 * hverken modtagevej, afsendelse eller permissions. En tekst der lovede en
 * mail, ville love noget der ikke kan sendes — og chaufføren ville vente på
 * den frem for at kigge.
 *
 * Svaret står derfor her, og teksten siger det. Mailen kan lægges ovenpå den
 * dag beslutning 20 er ude af fase 0; ansøgningen bærer allerede både svaret
 * og hvem der afgjorde det.
 *
 * ⚠ MAN ANSØGER IKKE OM SYGDOM. `art` er en helbredsoplysning og bor i
 * `sensitive/fravaer`, som kræver to permissions chaufføren ikke har. Det han
 * søger om — ferie, feriefridag, afspadsering — er ingen af delene og står som
 * `oensket` på basisnoden. Se beslutning 108.
 *
 * ⚠ OG EN ANSØGNING SPÆRRER INGENTING. Reservationen skrives når den er
 * godkendt; tre ansøgninger om den samme uge ville ellers spærre manden tre
 * gange for en frihed han ikke har fået. Beslutning 59's figur.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit-regler.js";
import { dato, msTilIso } from "../../fleet/format.js";
import { Pille, Tom } from "../../fleet/ui.jsx";
import {
  ANSOEGNING, ANSOEGBARE_ARTER, FRAVAER_ART, byggAnsoegning, valideAnsoegning,
  varighedDage, sidsteDag,
} from "../../fleet/fravaer.js";
import { DEMO_FRAVAER } from "../../fleet/demo-fravaer.js";

/**
 * "2026-10-09" → midnat den dag, eventuelt n dage senere.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ IKKE `isoTilMs()`, OG DET KOSTEDE EN DAG PÅ SKÆRMEN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `isoTilMs()` giver **kl. 12** med vilje: `new Date("2026-08-10")` er midnat
 * UTC, og trækkes der en time et sted i kæden, bliver det den 9. Til et
 * tidspunkt er det rigtigt.
 *
 * Et FRAVÆR er ikke et tidspunkt — det er hele dage, og `sidsteDag()` regner
 * `til - 1 ms`. Med kl. 12 landede "til og med den 9." som `10.10 kl. 12`, og
 * `sidsteDag()` gav den **10.** Skærmen skrev *"05.10.2026 – 10.10.2026 · 5
 * dage"* om en ansøgning på 5.–9. Datoerne modsagde antallet ved siden af.
 *
 * ⚠ OG DAGEN LÆGGES TIL MED `Date`, ikke med 86400000. Et døgn er 23 eller 25
 * timer ved sommertidsskiftet, og en uges ferie hen over skiftet ville ellers
 * ende kl. 23 eller kl. 01 — og `sidsteDag()` ville igen ramme forbi. Samme
 * grund som `slots()` i gitter.js og `traekTil()`.
 */
function midnat(iso, plusDage = 0) {
  if (!iso) return NaN;
  const [aar, maaned, dag] = iso.split("-").map(Number);
  const d = new Date(aar, maaned - 1, dag + plusDage);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function Frihed() {
  const { path: sti, bruger } = useFleet();
  const [oensket, setOensket] = useState(ANSOEGBARE_ARTER[0]);
  const [fra, setFra] = useState("");
  const [til, setTil] = useState("");
  const [note, setNote] = useState("");
  const [gemmer, setGemmer] = useState(false);
  const [kvittering, setKvittering] = useState(null);
  const [fejl, setFejl] = useState(null);

  const brugerListe = useListe("brugere", { vindue: "alle", graense: 500 });
  const minPersonId = brugerListe.data.find((b) => b.id === bruger?.uid)?.personId || null;

  const fravaer = useListe("fravaer", {
    ordnPaa: "fra", vindue: "alle", graense: 500, demo: DEMO_FRAVAER,
  });

  /* ⚠ KUN HANS EGNE. Reglen lader ham LÆSE hele listen — `fravaer.laes` har
     alle seks roller — men det er hans egne ansøgninger han skal se svaret på.
     Kollegaens ferie hører ikke her. */
  const mine = fravaer.data
    .filter((f) => f.personId === minPersonId)
    .sort((a, b) => (b.fra || 0) - (a.fra || 0));

  async function send() {
    setFejl(null);
    setKvittering(null);
    const nu = Date.now();

    /* ⚠ TIL ER EKSKLUSIV I BASEN, INKLUSIV PÅ SKÆRMEN. Han vælger "til og med
       den 9."; noden gemmer "før den 10.". Gemte vi den 9. kl. 00, ville han
       være ledig hele den 9. — se sidsteDag() i fravaer.js. */
    const post = byggAnsoegning({
      personId: minPersonId,
      fra: midnat(fra),
      til: midnat(til, 1),
      oensket,
      note,
      nu,
    });

    const problemer = valideAnsoegning(post, { nu });
    if (problemer.length) { setFejl(problemer.join(" ")); return; }

    const id = nyId("frv");
    setGemmer(true);
    const r = await gem({
      sti: sti(`fravaer/${id}`),
      data: post,
      objekt: "fravaer",
      objektId: id,
      handling: AUDIT.opret,
      note: `ansøgning om ${FRAVAER_ART[oensket].label.toLowerCase()}`,
    });
    setGemmer(false);

    if (r.ok) {
      setKvittering("Ansøgningen er sendt. Du får svar her i appen.");
      setFra(""); setTil(""); setNote("");
      fravaer.genindlaes();
    } else {
      setFejl(r.besked);
    }
  }

  if (brugerListe.henter) return <p className="fc-hint">Henter …</p>;

  if (!minPersonId) {
    return (
      <Tom>
        Din bruger er ikke koblet til et medarbejderkort, så der er ingen at
        søge fri for. Kontakt kontoret — det rettes i Opsætning.
      </Tom>
    );
  }

  const kanSende = fra && til && !gemmer;
  /* Sidste dag man kan vælge som "til" — visningen er inklusiv. */
  const idag = msTilIso(Date.now());

  return (
    <div className="fc-app-tur">
      <p>
        <Link to="/app" className="fc-app-tilbage">← Forside</Link>
        <b className="fc-app-sidetitel">Anmod om frihed</b>
      </p>

      {kvittering && <p className="fc-app-kvittering">{kvittering}</p>}
      {fejl && <p className="fc-app-fejl">{fejl}</p>}

      <section className="fc-app-kort">
        <h2 className="fc-app-titel">Ny ansøgning</h2>

        {/* ⚠ TRE MULIGHEDER, IKKE OTTE. Sygdom, barsel og barns sygedag er
            helbredsoplysninger og kan ikke ansøges om; kursus og andet er
            kontorets. Listen er UDLEDT af `helbred`, ikke skrevet her. */}
        <div className="fc-app-knapper">
          {ANSOEGBARE_ARTER.map((a) => (
            <button key={a} type="button"
              className={a === oensket ? "fc-btn fc-btn-primaer fc-app-knap" : "fc-btn fc-app-knap"}
              onClick={() => setOensket(a)}>
              {FRAVAER_ART[a].label}
            </button>
          ))}
        </div>

        <label className="fc-app-felt">
          <span>Fra</span>
          <input className="fc-ctl" type="date" value={fra} min={idag}
            onChange={(e) => setFra(e.target.value)} />
        </label>
        <label className="fc-app-felt">
          <span>Til og med</span>
          <input className="fc-ctl" type="date" value={til} min={fra || idag}
            onChange={(e) => setTil(e.target.value)} />
        </label>
        <label className="fc-app-felt">
          <span>Besked til kontoret (valgfri)</span>
          <textarea className="fc-ctl" rows={3} value={note}
            onChange={(e) => setNote(e.target.value)} />
        </label>

        <button type="button" className="fc-btn fc-btn-primaer fc-app-meld"
          disabled={!kanSende} onClick={send}>
          {gemmer ? "Sender …" : "Send ansøgning"}
        </button>
      </section>

      <section className="fc-app-kort">
        <h2 className="fc-app-titel">Dine ansøgninger</h2>
        {mine.length === 0 ? (
          <Tom>Du har ikke søgt om frihed endnu.</Tom>
        ) : (
          <ol className="fc-app-dage">
            {mine.map((f) => (
              <li key={f.id} className="fc-app-dag">
                <div>
                  <b>{dato(f.fra)} – {dato(sidsteDag(f))}</b>
                  <span className="fc-hint"> · {varighedDage(f)} dage</span>
                  {/* ⚠ `oensket` ER HVAD HAN BAD OM. Årsagen ligger i
                      `sensitive/fravaer`, som han ikke må læse — og skal
                      heller ikke: den er hans egen, men noden er kontorets.
                      Uden en ansøgning er posten kontorets registrering, og
                      så er der ingenting at vise ud over datoerne. */}
                  {f.ansoegning?.oensket && (
                    <span className="fc-hint">
                      {" "}· {FRAVAER_ART[f.ansoegning.oensket]?.label}
                    </span>
                  )}
                  {f.ansoegning?.svar && (
                    <p className="fc-hint">{f.ansoegning.svar}</p>
                  )}
                </div>
                <div className="fc-app-dagtal">
                  {f.ansoegning ? (
                    <Pille tone={ANSOEGNING[f.ansoegning.status]?.pill}>
                      {ANSOEGNING[f.ansoegning.status]?.label || f.ansoegning.status}
                    </Pille>
                  ) : (
                    /* ⚠ ET FRAVÆR UDEN ANSØGNING ER KONTORETS EGEN
                       REGISTRERING — og det er allerede aftalt. En "Ansøgt"-
                       pille dér ville påstå at nogen mangler at svare. */
                    <Pille tone="ok">Registreret</Pille>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="fc-hint fc-app-fod">
        Kontoret svarer <b>her i appen</b> — ikke på mail. En ansøgning spærrer
        ingenting, før den er godkendt.
      </p>
    </div>
  );
}
