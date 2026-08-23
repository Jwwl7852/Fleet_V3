/* src/moduler/app/MinTur.jsx
 * Chaufførens app: mine ture, og knapperne han melder med.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ IKKE AppShell — OG DET ER IKKE ET BRUD PÅ REGLEN.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * CLAUDE.md forbyder et MODUL at lave sin egen sidebar, tenant-vælger eller
 * periodevælger. Det her er ikke et modul i sidebaren; det er en anden RAMME
 * om den samme database, af samme slags som `Udbyderramme` i App.jsx.
 *
 * Grunden er den samme som dér: en sidebar med tolv moduler på en telefon i
 * en lastbil er ikke et overblik, det er en forhindring. Og en chauffør har
 * seks permissions — elleve af de tolv punkter ville føre til en afvist
 * læsning. En menu der mest består af døre der ikke kan åbnes, er værre end
 * ingen menu.
 *
 * ⚠ INGEN PERIODEVÆLGER. Chaufføren har ét tidsrum: i dag og i morgen. En
 * vælger ville tilbyde ham at kigge på april.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVAD DEN IKKE ER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **Den er ikke offline.** Trykker han uden dækning, fejler kaldet, og det
 * står på skærmen. Modellen kan bære en kø — meldingen har sit eget `ms` fra
 * telefonen og sit eget `klientId`, så en gensendelse rammer den samme post —
 * men køen er ikke bygget. Det er valgt: en kø der taber en melding uden at
 * sige det, er værre end en fejl han kan se med det samme.
 *
 * **Den skifter ikke turens tilstand.** At melde "aflæsset" er at fortælle
 * hvad der skete; etapens tilstand skiftes af `etapeskift` og kun dér
 * (beslutning 40).
 *
 * **Den viser ingen position.** Beslutning 22 står: der er ingen GPS. Stedet
 * kommer fra det planlagte stop han peger på — ellers ved vi det ikke.
 *
 * Se beslutning 103.
 */
import { useState, useMemo } from "react";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { kaldFunktion } from "../../firebase.js";
import { klokke, datoTid } from "../../fleet/format.js";
import { Pille, Tom } from "../../fleet/ui.jsx";
import {
  HAENDELSE, planlagteStop, meldingerFor, foreslaaedeMeldinger, seneste,
  erAfsluttet, byggMelding, valideMelding,
} from "../../fleet/rutestatus.js";
import { graenseLabel } from "../../fleet/etaper.js";
import { DEMO_ETAPER, DEMO_STATUS_POSTER } from "../../fleet/demo-etaper.js";

const DOEGN = 24 * 60 * 60 * 1000;

/**
 * ⚠ ET klientId PR. TRYK, IKKE PR. MELDING I FORVEJEN. Trykker han to gange
 * på den samme knap, er det to meldinger — han holdt måske to pauser. Det
 * feltet forhindrer, er at ÉN afsendelse bliver til to poster fordi svaret
 * forsvandt undervejs.
 *
 * `crypto.randomUUID` findes i enhver browser der kan køre resten af appen.
 */
const nytKlientId = () => `k-${crypto.randomUUID()}`;

export default function MinTur() {
  const { bruger } = useFleet();
  const [aaben, setAaben] = useState(null);   // etapeId der meldes på
  const [sender, setSender] = useState(false);
  const [kvittering, setKvittering] = useState(null);
  const [fejl, setFejl] = useState(null);

  /* ⚠ KOBLINGEN LÆSES, DEN GÆTTES IKKE. `brugere/<uid>/personId` er det ene
     sted et login bliver til en medarbejder, og noden er `.write: false` —
     hverken chaufføren eller appen kan flytte den. Se beslutning 103. */
  const brugerListe = useListe("brugere", { vindue: "alle", graense: 500 });
  const minPersonId = brugerListe.data.find((b) => b.id === bruger?.uid)?.personId || null;

  const etapeListe = useListe("etaper", {
    ordnPaa: "fra", vindue: "alle", graense: 500, demo: DEMO_ETAPER,
  });
  const meldListe = useListe("statushaendelser", {
    vindue: "alle", graense: 500, demo: DEMO_STATUS_POSTER,
  });

  /**
   * ⚠ FILTERET ER personId, IKKE uid. Etapen bærer hvem turen HANDLER om;
   * tokenet bærer hvem der er logget ind. Sammenlignede vi de to direkte,
   * ville intet nogensinde matche — og skærmen ville stå tom uden at fejle.
   * Det er den tavse fejlklasse CLAUDE.md advarer mod.
   */
  const nu = Date.now();
  const mine = useMemo(() => {
    if (!minPersonId) return [];
    return etapeListe.data
      .filter((e) => e.personId === minPersonId)
      .filter((e) => e.fra < nu + 3 * DOEGN && (e.til ?? e.fra) > nu - 2 * DOEGN)
      .sort((a, b) => a.fra - b.fra);
  }, [etapeListe.data, minPersonId, nu]);

  const meldingerPaa = (etapeId) =>
    meldingerFor(meldListe.data.find((m) => m.id === etapeId));

  async function meld(etape, type) {
    setFejl(null);
    setKvittering(null);

    /* ⚠ SAMME valideMelding() SOM SERVEREN AFVISER MED. Skærmen SVARER
       hurtigt; funktionen HÅNDHÆVER. Var de to uenige, ville en knap være
       grøn og kaldet rødt, og chaufføren ville tro appen var i stykker. */
    const melding = byggMelding({ type, ms: Date.now(), klientId: nytKlientId() });
    const problemer = valideMelding(melding, { etape });
    if (problemer.length) { setFejl(problemer.join(" ")); return; }

    setSender(true);
    try {
      await kaldFunktion("statusmelding", { etapeId: etape.id, ...melding });
      setKvittering(`${HAENDELSE[type].label} sendt kl. ${klokke(melding.ms)}`);
      setAaben(null);
    } catch (e) {
      /* ⚠ EN AFVIST SKRIVNING ER IKKE EN NETVÆRKSFEJL. "Prøv igen" på en
         permission-denied lærer chaufføren at systemet er i stykker. */
      setFejl(e?.message || "Meldingen kunne ikke sendes.");
    } finally {
      setSender(false);
    }
  }

  /* ---- Tilstande der ikke er en tur ------------------------------------ */

  if (brugerListe.henter || etapeListe.henter) {
    return <p className="fc-hint">Henter dine ture …</p>;
  }

  /**
   * ⚠ TO GRUNDE TIL EN TOM SKÆRM, TO SVAR. "Du har ingen ture" og "din bruger
   * er ikke koblet til en medarbejder" ser ens ud og rettes to forskellige
   * steder — det ene i disponeringen, det andet i Opsætning. Ét svar til
   * begge ville sende chaufføren det forkerte sted hen.
   */
  if (!minPersonId) {
    return (
      <Tom>
        Din bruger er ikke koblet til et medarbejderkort, så systemet kan ikke se
        hvilke ture der er dine. Kontakt kontoret — det rettes i Opsætning.
      </Tom>
    );
  }

  if (!mine.length) {
    return <Tom>Du har ingen ture de næste tre dage.</Tom>;
  }

  return (
    <div className="fc-app-tur">
      {kvittering && <p className="fc-app-kvittering">{kvittering}</p>}
      {fejl && <p className="fc-app-fejl">{fejl}</p>}

      {mine.map((e) => {
        const h = meldingerPaa(e.id);
        const sidst = seneste(h);
        const faerdig = erAfsluttet(h);
        const stop = planlagteStop(e);
        const stedFor = (m) => {
          const s = stop.find((x) => x.id === m.stopId);
          if (!s) return null;
          return s.rolle === "graense" ? graenseLabel(s.sted) : s.sted;
        };

        return (
          <section key={e.id} className="fc-app-kort">
            <header className="fc-app-hoved">
              <div>
                <h2 className="fc-app-titel">
                  {stop[0]?.sted} → {stop[stop.length - 1]?.sted}
                </h2>
                <p className="fc-hint">{datoTid(e.fra)}</p>
              </div>
              {faerdig
                ? <Pille tone="ok">Afsluttet</Pille>
                : <Pille tone={h.length ? "info" : "neutral"}>
                    {h.length ? "Undervejs" : "Ikke meldt"}
                  </Pille>}
            </header>

            {sidst && (
              <p className="fc-hint">
                Sidst meldt: <b>{HAENDELSE[sidst.type]?.label}</b> kl. {klokke(sidst.ms)}
                {stedFor(sidst) ? ` — ${stedFor(sidst)}` : ""}
              </p>
            )}

            {/* ⚠ KNAPPERNE ER SORTERET, IKKE SPÆRRET. Virkeligheden kommer
                ikke i rækkefølge: han kan holde pause før afgang, eller melde
                forsinkelse tre gange. En knap der er væk, tvinger ham til at
                melde noget der ikke passer. Se foreslaaedeMeldinger(). */}
            {aaben === e.id ? (
              <div className="fc-app-knapper">
                {foreslaaedeMeldinger(h).map((type, i) => (
                  <button
                    key={type}
                    type="button"
                    className={i === 0 ? "fc-btn fc-btn-primaer fc-app-knap" : "fc-btn fc-app-knap"}
                    disabled={sender}
                    onClick={() => meld(e, type)}
                  >
                    {HAENDELSE[type].label}
                  </button>
                ))}
                <button type="button" className="fc-btn fc-app-knap"
                  onClick={() => setAaben(null)}>Fortryd</button>
              </div>
            ) : (
              <button type="button" className="fc-btn fc-btn-primaer fc-app-meld"
                onClick={() => { setAaben(e.id); setFejl(null); setKvittering(null); }}>
                Meld status
              </button>
            )}

            {h.length > 0 && (
              <ol className="fc-app-tidslinje">
                {h.map((m) => (
                  <li key={m.id}>
                    <span className="fc-app-tid">{klokke(m.ms)}</span>
                    <span>{HAENDELSE[m.type]?.label || m.type}</span>
                    {stedFor(m) && <span className="fc-hint"> — {stedFor(m)}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}

      {/* ⚠ FORBEHOLDET STÅR PÅ SKÆRMEN, som på tjekKoerehviletid(). En melding
          er ikke en måling, og appen må ikke give indtryk af at kontoret ved
          hvor han er. */}
      <p className="fc-hint fc-app-fod">
        Der er <b>ingen sporing</b>. Kontoret ser kun det du melder — og hvor
        længe siden det er.
      </p>
    </div>
  );
}
