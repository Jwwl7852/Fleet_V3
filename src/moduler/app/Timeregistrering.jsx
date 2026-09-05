/* src/moduler/app/Timeregistrering.jsx
 * Stempl ind og ud, og se ugen.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HAN SKRIVER DIREKTE — OG DET ER EN ANDEN SITUATION END STATUSMELDINGEN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `statushaendelser` er `.write: false` med en Cloud Function foran, fordi
 * ejerskabet lå INDE i posten: en regel kunne ikke afgøre om etapen var
 * chaufførens (beslutning 103).
 *
 * Her står `personId` i STIEN — `stemplinger/<personId>/<id>` — så reglen kan
 * slå `brugere/<uid>/personId` op og sammenligne. Den kan gøre arbejdet, og
 * så skal der ikke stå en funktion imellem der ikke gør andet.
 *
 * ⚠ EN LUKKET VAGT ER FROSSET, og det håndhæves i reglen: `.write` afvises når
 * posten har et `udMs`. Ellers kunne gårsdagens timer rettes efter at kontoret
 * havde set dem.
 *
 * ⚠ INGEN POSITION. Kortet i specifikationen siger at positionen registreres;
 * beslutning 22 siger INGEN GPS. Spørgsmålet er stillet og ikke besvaret, og
 * teksten på skærmen siger hvad der faktisk sker frem for hvad vi kunne
 * komme til at love. Se beslutning 107.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit-regler.js";
import { klokke, dato } from "../../fleet/format.js";
import { Tom, Dialog, Knap, Datatilstand } from "../../fleet/ui.jsx";
import {
  aabenStempling, timerOgMin, ugestart, ugedage, ugesum,
  valideStempling,
} from "../../fleet/stempling.js";

const UGEDAG = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];

export default function Timeregistrering() {
  const { path: sti, bruger } = useFleet();
  const [uge, setUge] = useState(() => ugestart(Date.now()));
  const [gemmer, setGemmer] = useState(false);
  const [fejl, setFejl] = useState(null);
  /* ⚠ V1-BRUGERTEST §10.1 — BEKRÆFT KUN VED UDSTEMPLING. En lukket vagt er
     frosset (kan ikke rettes fra telefonen, se filens hoved), så et
     fejltryk her koster mere end ved indstempling. Ind kræver ingen
     bekræftelse — kun ud. */
  const [bekraeftUd, setBekraeftUd] = useState(false);

  /* ⚠ KOBLINGEN LÆSES, DEN GÆTTES IKKE — som i chaufførappens turplan.
     `brugere/<uid>/personId` er det ene sted et login bliver til en
     medarbejder, og noden er `.write: false`. Se beslutning 103. */
  const brugerListe = useListe("brugere", { vindue: "alle", graense: 500 });
  const minPersonId = brugerListe.data.find((b) => b.id === bruger?.uid)?.personId || null;

  /* ⚠ HELE HANS EGEN NODE, IKKE ET VINDUE. Ugevælgeren går bagud, og en
     stempling fra i forgårs skal kunne ses. Loftet er hans egne vagter — en
     chauffør har omkring 250 om året. */
  /* ⚠ NODENAVNET SKAL KUNNE LÆSES. `useListe(node)` med en variabel kan
     hverken hooken eller `test/modulopslag.test.mjs` slå op før den kører —
     jeg skrev først en ternær, og linten fangede den. Literalen begynder
     derfor med nodenavnet, og `hent` styrer om der spørges.

     ⚠ Og `hent` er her IKKE til at dæmpe en afvisning (beslutning 94): der er
     ingen sti at spørge på, før koblingen er læst. */
  const stemplinger = useListe(`stemplinger/${minPersonId || "_"}`,
    { ordnPaa: "indMs", vindue: "alle", graense: 500, hent: Boolean(minPersonId) });

  const aaben = aabenStempling(stemplinger.data);
  const dage = ugedage(uge, stemplinger.data);
  const sum = ugesum(dage);

  /* Den seneste lukkede — "Sidst ud 20.27" på kortet. */
  const sidsteUd = [...stemplinger.data]
    .filter((s) => Number.isFinite(s.udMs))
    .sort((a, b) => b.udMs - a.udMs)[0] || null;

  async function stempl() {
    setFejl(null);
    const nu = Date.now();

    /* ⚠ IND OG UD ER SAMME POST, ikke to. En vagt er ét tidsrum; to poster
       ville skulle parres bagefter, og en glemt udstempling ville efterlade
       en post der ikke betød noget. */
    const post = aaben ? { ...aaben, udMs: nu } : { indMs: nu };
    delete post.id;

    const problemer = valideStempling(post, { nu });
    if (problemer.length) { setFejl(problemer.join(" ")); return; }

    const id = aaben ? aaben.id : nyId("stp");
    setGemmer(true);
    const r = await gem({
      sti: sti(`stemplinger/${minPersonId}/${id}`),
      data: post,
      foer: aaben || null,
      objekt: "stemplinger",
      objektId: id,
      handling: aaben ? AUDIT.aendre : AUDIT.opret,
      note: aaben ? "stemplet ud" : "stemplet ind",
    });
    setGemmer(false);
    if (r.ok) stemplinger.genindlaes();
    else setFejl(r.besked);
  }

  function flytUge(retning) {
    const d = new Date(uge);
    d.setDate(d.getDate() + retning * 7);
    setUge(d.getTime());
  }

  const iDenneUge = uge >= ugestart(Date.now());

  if (brugerListe.henter) return <p className="fc-hint">Henter …</p>;

  /* ⚠ SAMME TO SVAR SOM PÅ TURPLANEN. "Du har ingen timer" og "din bruger er
     ikke koblet til et medarbejderkort" rettes to forskellige steder. */
  if (!minPersonId) {
    return (
      <Tom>
        Din bruger er ikke koblet til et medarbejderkort, så der er ingen at
        registrere timer på. Kontakt kontoret — det rettes i Opsætning.
      </Tom>
    );
  }

  return (
    <div className="fc-app-tur">
      {/* ⚠ BESLUTNING 121 — en afvist stemplingerLaes skal SIGES, ikke tavst
          blive til en tom uge. Se noten ved `stemplinger` ovenfor. */}
      <Datatilstand tilstand={stemplinger.tilstand} genprov={stemplinger.genindlaes} />

      <p>
        <Link to="/app" className="fc-app-tilbage">← Forside</Link>
        <b className="fc-app-sidetitel">Timeregistrering</b>
      </p>

      {fejl && <p className="fc-app-fejl">{fejl}</p>}

      <section className="fc-app-kort fc-app-stempel">
        <p className="fc-app-status">
          {aaben ? "🟢 Stemplet IND" : "⚪ Stemplet UD"}
        </p>
        <p className="fc-hint">
          {aaben
            ? `Ind ${klokke(aaben.indMs)} — ${timerOgMin(
              Math.round((Date.now() - aaben.indMs) / 60000))} indtil nu`
            : sidsteUd
              ? `Sidst ud ${klokke(sidsteUd.udMs)}`
              : "Du har ikke stemplet endnu"}
        </p>
        {/* ⚠ ÉN KNAP, IKKE TO. To knapper hvoraf den ene altid er forkert,
            bliver trykket forkert — og en fejlstempling kan ikke rettes fra
            telefonen, fordi en lukket vagt er frosset. */}
        <button type="button" disabled={gemmer}
          className={aaben ? "fc-btn fc-app-stempl fc-app-stempl-ud"
            : "fc-btn fc-app-stempl fc-app-stempl-ind"}
          onClick={() => (aaben ? setBekraeftUd(true) : stempl())}>
          {gemmer ? "Sender …" : aaben ? "Stempl UD" : "Stempl IND"}
        </button>
      </section>

      {bekraeftUd && (
        <Dialog titel="Stempl ud" onLuk={() => setBekraeftUd(false)}>
          <p>Er du sikker på, at du vil stemple ud?</p>
          <div className="fc-row" style={{ gap: 8, marginTop: 12 }}>
            <Knap variant="primaer" disabled={gemmer}
                  onClick={() => { setBekraeftUd(false); stempl(); }}>
              Ja, stempel ud
            </Knap>
            <Knap onClick={() => setBekraeftUd(false)}>Annuller</Knap>
          </div>
        </Dialog>
      )}

      <section className="fc-app-kort">
        <div className="fc-app-uge-top">
          <button type="button" className="fc-btn" onClick={() => flytUge(-1)}>
            ← Forrige
          </button>
          <b>Uge {ugenummer(uge)} · {dato(uge)}–{dato(dage[6].fra)}</b>
          <button type="button" className="fc-btn" disabled={iDenneUge}
            onClick={() => flytUge(1)}>Næste →</button>
        </div>

        <ol className="fc-app-dage">
          {dage.map((d, i) => (
            <li key={d.fra} className="fc-app-dag">
              <div>
                <b>{UGEDAG[i]}</b>
                <span className="fc-hint"> {dato(d.fra)}</span>
              </div>
              <div className="fc-app-dagtal">
                {/* ⚠ EN ÅBEN VAGT GIVER "—", IKKE "0:00". Har vi ikke hørt
                    hvornår han holdt op, kan dagen ikke gøres op — og 0:00
                    ville påstå at han ikke arbejdede. */}
                <b>{d.minutter == null ? "—" : timerOgMin(d.minutter)}</b>
                {d.stemplinger.length > 0 && (
                  <span className="fc-hint">
                    {d.stemplinger.map((s) => (
                      `${klokke(s.indMs)}–${Number.isFinite(s.udMs) ? klokke(s.udMs) : "…"}`
                    )).join("  ")}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>

        <p className="fc-app-ugesum">
          <b>Ugen i alt</b>
          <b>{sum == null ? "—" : timerOgMin(sum)}</b>
        </p>
        {sum == null && (
          <p className="fc-hint">
            En vagt er ikke stemplet ud, så ugen kan ikke gøres op endnu.
          </p>
        )}
      </section>

      <p className="fc-hint fc-app-fod">
        Der registreres <b>ingen position</b>. Kontoret ser hvornår du stemplede,
        ikke hvor du var. En vagt kan ikke rettes efter at du har stemplet ud —
        ring til kontoret.
      </p>
    </div>
  );
}

/**
 * ISO-ugenummer.
 *
 * ⚠ IKKE "dagen i året / 7". Uge 1 er den uge der indeholder årets første
 * torsdag, og en uge der løber over nytår hører til ét af årene — ikke til
 * begge. Et forkert ugenummer på en lønopgørelse er den slags fejl der først
 * ses når nogen skal betale for den forkerte uge.
 */
function ugenummer(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  /* Torsdagen i samme uge afgør året. */
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const foersteTorsdag = new Date(d.getFullYear(), 0, 4);
  foersteTorsdag.setDate(
    foersteTorsdag.getDate() + 3 - ((foersteTorsdag.getDay() + 6) % 7));
  return 1 + Math.round((d - foersteTorsdag) / (7 * 86400000));
}
