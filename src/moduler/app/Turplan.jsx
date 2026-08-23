/* src/moduler/app/Turplan.jsx
 * Chaufførens turplan: dagens stop i rækkefølge.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ DEN AFLØSER "MINE TURE"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `MinTur.jsx` viste etaperne og chaufførens meldinger (beslutning 103), og
 * kortet på forsiden hed "Mine ture" netop fordi den ikke kunne vise en
 * turplan: stoppene fandtes ikke som model. Det gør de nu (beslutning 110), og
 * skærmen viser dem — med adresse, tidsvindue, kontakt og det gods der skal af
 * og på.
 *
 * ⚠ MELDINGERNE ER IKKE FORSVUNDET. De ligger på stoppet, hvor de hører til:
 * `statushaendelser.stopId` peger på et stop fra `planlagteStop()`, og et stop
 * er "nået" når der er meldt på det (beslutning 103). Skærmbilledets
 * *"Afhentning mangler scan"* er derfor ikke et nyt felt — det er fraværet af
 * en melding.
 *
 * ⚠ INGEN POSITION, INGEN SPORING. Beslutning 22 står. Rækkefølgen er planens,
 * ikke bilens, og "8 tilbage" er hvad han har meldt — ikke hvad en boks har
 * målt.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { kaldFunktion } from "../../firebase.js";
import { klokke, num, msTilIso } from "../../fleet/format.js";
import { Pille, Tom } from "../../fleet/ui.jsx";
import {
  HAENDELSE, planlagteStop, meldingerFor, foreslaaedeMeldinger,
  byggMelding, valideMelding,
} from "../../fleet/rutestatus.js";
import {
  STOP_ART, ordreListe, adresselinje, summerOrdrer, erNaaet,
  stopstatus,
} from "../../fleet/stop.js";
import { enhedsIder } from "../../fleet/etaper.js";
import { DEMO_ETAPER, DEMO_STATUS_POSTER } from "../../fleet/demo-etaper.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";

const nytKlientId = () => `k-${crypto.randomUUID()}`;

export default function Turplan() {
  const { bruger } = useFleet();
  const [dagIso, setDagIso] = useState(() => msTilIso(Date.now()));
  const [sender, setSender] = useState(false);
  const [kvittering, setKvittering] = useState(null);
  const [fejl, setFejl] = useState(null);
  const [aabenStop, setAabenStop] = useState(null);

  const brugerListe = useListe("brugere", { vindue: "alle", graense: 500 });
  const minPersonId = brugerListe.data.find((b) => b.id === bruger?.uid)?.personId || null;

  const etapeListe = useListe("etaper", {
    ordnPaa: "fra", vindue: "alle", graense: 500, demo: DEMO_ETAPER,
  });
  const meldListe = useListe("statushaendelser", {
    vindue: "alle", graense: 500, demo: DEMO_STATUS_POSTER,
  });
  const bilListe = useListe("koeretoejer", {
    vindue: "alle", graense: 500, demo: DEMO_KOERETOEJER,
  });
  const kundeListe = useListe("kunder", {
    vindue: "alle", graense: 500, demo: DEMO_KUNDER,
  });

  /* Dagens vindue — midnat til midnat, bygget med Date pga. sommertid. */
  const [aar, maaned, dagNr] = dagIso.split("-").map(Number);
  const fraDag = new Date(aar, maaned - 1, dagNr).setHours(0, 0, 0, 0);
  const tilDag = new Date(aar, maaned - 1, dagNr + 1).setHours(0, 0, 0, 0);

  /* ⚠ FILTERET ER personId, IKKE uid. Etapen bærer hvem turen HANDLER om;
     tokenet bærer hvem der er logget ind. Sammenlignede vi de to, ville intet
     matche — og skærmen ville stå tom uden at fejle. Beslutning 103. */
  const mine = etapeListe.data
    .filter((e) => e.personId === minPersonId)
    .filter((e) => e.fra < tilDag && (e.til ?? e.fra) >= fraDag)
    .sort((a, b) => a.fra - b.fra);

  const meldingerPaa = (etapeId) =>
    meldingerFor(meldListe.data.find((m) => m.id === etapeId));

  const bilNavn = (id) => {
    const b = bilListe.data.find((x) => x.id === id);
    return b ? (b.kaldenavn || b.navn || id) : null;
  };
  /* ⚠ TOM LISTE → ID'ET RÅT, ikke en anklage. Beslutning 95. */
  const kundeNavn = (id) => kundeListe.data.find((x) => x.id === id)?.navn || id;

  async function meld(etape, stopId, type) {
    setFejl(null);
    setKvittering(null);
    const melding = byggMelding({
      type, ms: Date.now(), klientId: nytKlientId(), stopId,
    });
    const problemer = valideMelding(melding, { etape });
    if (problemer.length) { setFejl(problemer.join(" ")); return; }

    setSender(true);
    try {
      await kaldFunktion("statusmelding", { etapeId: etape.id, ...melding });
      setKvittering(`${HAENDELSE[type].label} sendt kl. ${klokke(melding.ms)}`);
      setAabenStop(null);
      meldListe.genindlaes();
    } catch (e) {
      setFejl(e?.message || "Meldingen kunne ikke sendes.");
    } finally {
      setSender(false);
    }
  }

  function flytDag(retning) {
    const d = new Date(fraDag);
    d.setDate(d.getDate() + retning);
    setDagIso(msTilIso(d.getTime()));
  }

  if (brugerListe.henter || etapeListe.henter) {
    return <p className="fc-hint">Henter din turplan …</p>;
  }

  if (!minPersonId) {
    return (
      <Tom>
        Din bruger er ikke koblet til et medarbejderkort, så systemet kan ikke se
        hvilke ture der er dine. Kontakt kontoret — det rettes i Opsætning.
      </Tom>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ OPGØRELSEN LÆSER SAMME KILDE SOM LISTEN
     ══════════════════════════════════════════════════════════════════════

     Her stod `stopListe(e)` — de EKSPLICITTE stop — mens kortene nedenfor
     tegnes af `planlagteStop(e)`, som udleder en rute når etapen ingen stop
     har. På dagens tur stod der derfor **"0 tilbage · 0 færdige"** over tre
     kort hvoraf det ene var meldt.

     Det er præcis den fejl `planlagteStop()` blev lavet om for at undgå — to
     svar på hvor turen går — og jeg lavede den i skærmen alligevel. Den kunne
     kun ses ved at åbne siden: begge tal var plausible hver for sig. */
  const dagensPunkter = mine.flatMap((e) => planlagteStop(e));
  /* ⚠ GRÆNSER TÆLLER IKKE MED. De er ikke stop man laver noget ved, og en
     tur med to grænser ville ellers stå med fire punkter at nå. */
  const alleStop = dagensPunkter.filter((s) => s.rolle !== "graense");
  const alleMeldinger = mine.flatMap((e) => meldingerPaa(e.id));
  const status = stopstatus(alleStop, alleMeldinger);
  const sum = summerOrdrer(alleStop.map((s) => s.stop).filter(Boolean));
  const foersteBil = mine.length ? bilNavn(enhedsIder(mine[0])[0]) : null;

  return (
    <div className="fc-app-tur">
      <p>
        <Link to="/app" className="fc-app-tilbage">← Forside</Link>
        <b className="fc-app-sidetitel">Turplan</b>
      </p>

      {kvittering && <p className="fc-app-kvittering">{kvittering}</p>}
      {fejl && <p className="fc-app-fejl">{fejl}</p>}

      <section className="fc-app-kort">
        <h2 className="fc-app-titel">Din turplan</h2>
        <p className="fc-hint">
          Dine ture fra disponeringen — i rækkefølge efter tidspunkt.
        </p>

        <div className="fc-app-uge-top">
          <button type="button" className="fc-btn" onClick={() => flytDag(-1)}>←</button>
          <input className="fc-ctl" type="date" value={dagIso}
            onChange={(e) => e.target.value && setDagIso(e.target.value)} />
          <button type="button" className="fc-btn" onClick={() => flytDag(1)}>→</button>
        </div>

        {mine.length > 0 && (
          <p className="fc-app-dagsum">
            {foersteBil && <span className="fc-app-mrk">🚚 {foersteBil}</span>}
            {Number.isFinite(mine[0].fra) && (
              <span className="fc-app-mrk">start {klokke(mine[0].fra)}</span>
            )}
            {/* ⚠ TALLET ER HÅNDTERINGER, IKKE PALLER. De samme tolv paller op
                og af er tolv paller og fireogtyve løft — se summerOrdrer().
                Stod der "paller", ville en chauffør der læssede efter tallet,
                stå med for lidt plads. */}
            <span className="fc-app-mrk fc-app-mrk-mork">
              {status.tilbage} tilbage · {status.naaet} færdige
              {sum.kolli != null && ` · ${num(sum.kolli)} håndteringer`}
            </span>
          </p>
        )}
      </section>

      {mine.length === 0 ? (
        <Tom>Du har ingen ture den dag.</Tom>
      ) : (
        mine.map((etape) => {
          const meldinger = meldingerPaa(etape.id);
          const stop = planlagteStop(etape);

          /* ⚠ NUMMERET TÆLLER KUN DE STOP DER SKAL GØRES NOGET VED.
             Med `i` fra map'et blev en tur med én grænse til "1, (grænse), 3"
             — og chaufføren har to stop. Grænsen tegnes som en streg netop
             fordi den ikke er et stop; så skal den heller ikke have et nummer. */
          let nr = 0;
          return stop.map((s) => {
            /* ⚠ GRÆNSEOVERGANGE TEGNES SOM EN STREG, ikke som et stop. De har
                hverken adresse, kontakt eller gods — og et kort der lignede de
                andre, ville love noget der skal gøres. */
            if (s.rolle === "graense") {
              return (
                <p key={`${etape.id}-${s.id}`} className="fc-hint fc-app-graense">
                  — grænse: {s.sted} —
                </p>
              );
            }

            nr += 1;
            const naaet = erNaaet(s, meldinger);
            const art = STOP_ART[s.rolle];
            const ordrer = ordreListe(s.stop);
            const kort = s.stop || {};

            return (
              <section key={`${etape.id}-${s.id}`}
                className={naaet ? "fc-app-kort fc-app-stop-naaet" : "fc-app-kort"}>
                <div className="fc-app-stop-top">
                  <span className="fc-app-nr">{nr}</span>
                  <Pille tone={art?.pill}>{art?.label || s.rolle}</Pille>
                  {Number.isFinite(kort.fraMs) && (
                    <span className="fc-hint">
                      🕐 {klokke(kort.fraMs)}
                      {Number.isFinite(kort.tilMs) && kort.tilMs !== kort.fraMs
                        && `–${klokke(kort.tilMs)}`}
                    </span>
                  )}
                </div>

                <h2 className="fc-app-titel">{s.sted}</h2>
                {adresselinje(kort) && (
                  <p className="fc-hint">{adresselinje(kort)}</p>
                )}

                <div className="fc-app-knapper">
                  {/* ⚠ NAVIGATION ÅBNER KORTET, den viser det ikke. Vi tegner
                      ingen kort selv — beslutning 22 — og telefonens eget
                      kender vejen bedre end vi gør. Er der ingen adresse,
                      søges der på navnet: en gættet gade sender ham forkert. */}
                  <a className="fc-btn fc-btn-primaer fc-app-knap"
                    href={`https://www.google.com/maps/search/?api=1&query=${
                      encodeURIComponent(adresselinje(kort) || s.sted || "")}`}
                    target="_blank" rel="noreferrer">🧭 Naviger</a>
                  {kort.telefon && (
                    <a className="fc-btn fc-app-knap" href={`tel:${kort.telefon}`}>
                      📞 {kort.telefon}
                    </a>
                  )}
                </div>

                {ordrer.map((o) => (
                  <p key={o.id} className="fc-app-ordre">
                    <b>{kundeNavn(o.kundeId)}</b>
                    {o.nummer && <span className="fc-hint"> #{o.nummer}</span>}
                    {Number.isFinite(o.kolli) && <span> · {num(o.kolli)} kolli</span>}
                    {Number.isFinite(o.kg) && <span> · {num(o.kg)} kg</span>}
                    {o.gods && <span className="fc-app-gods">{o.gods}</span>}
                  </p>
                ))}

                {/* ⚠ "MANGLER SCAN" ER FRAVÆRET AF EN MELDING, ikke et felt.
                    En stregkodescanning bliver en anden MÅDE at sende den
                    melding på — se erNaaet() i stop.js. */}
                {naaet ? (
                  <p className="fc-app-besoeg">✓ Meldt</p>
                ) : aabenStop === `${etape.id}-${s.id}` ? (
                  <div className="fc-app-knapper">
                    {foreslaaedeMeldinger(meldinger).slice(0, 4).map((type, n) => (
                      <button key={type} type="button" disabled={sender}
                        className={n === 0
                          ? "fc-btn fc-btn-primaer fc-app-knap" : "fc-btn fc-app-knap"}
                        onClick={() => meld(etape, s.id, type)}>
                        {HAENDELSE[type].label}
                      </button>
                    ))}
                    <button type="button" className="fc-btn fc-app-knap"
                      onClick={() => setAabenStop(null)}>Fortryd</button>
                  </div>
                ) : (
                  <button type="button" className="fc-btn fc-app-meld"
                    onClick={() => { setAabenStop(`${etape.id}-${s.id}`); setFejl(null); }}>
                    {art?.label} mangler melding
                  </button>
                )}
              </section>
            );
          });
        })
      )}

      <p className="fc-hint fc-app-fod">
        Der er <b>ingen sporing</b>. Rækkefølgen er planens, og «{status.naaet} færdige»
        er hvad du har meldt — ikke hvad nogen har målt.
      </p>
    </div>
  );
}
