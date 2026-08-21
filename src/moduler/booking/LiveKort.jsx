/* src/moduler/booking/LiveKort.jsx
 * Rute & status  (ruten hedder stadig /booking/live-kort)
 *
 * BESLUTNING 22 — INGEN GPS.
 *
 * Skærmen hed "Live-kort", og det navn lovede noget vi ikke har. Der er ingen
 * sporing: ingen GPS-boks, ingen chaufførapp, ingen position. Et kort med
 * prikker der bevæger sig, ville kræve en datakilde der ikke findes — og et
 * kort uden prikker er et kort der ser i stykker ud.
 *
 * Rute & status viser det vi faktisk ved: den planlagte rute, de stop
 * chaufføren har meldt, næste stop og de forventede tidspunkter.
 *
 * ⚠ GPS BLIVER EN DATAKILDE SENERE, IKKE ET FUNDAMENT. Bygger man skærmen
 * omkring positioner, kan den ikke vise noget før sporingen findes — og kommer
 * den aldrig, står man med en tom skærm man ikke kan sælge. Bygget omkring
 * planen og chaufførens meldinger virker den i dag, og en position bliver en
 * ekstra kolonne.
 *
 * ⚠ EN MELDING ER IKKE EN MÅLING. Den kan være forsinket, forkert eller
 * mangle. Skærmen viser derfor hvor længe siden vi hørte noget — det er den
 * ærlige erstatning for en position. "Ingen meldinger" er en oplysning; en
 * gættet placering er det ikke.
 *
 * Beslutning 13 gælder uændret: skærmen er beholdt, fordi den findes deployet
 * på /tracking. Ruten og redirect'en er urørte; kun navnet og indholdet er nyt.
 *
 * FASE 0: VISNING. Ingen skrivning.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { num, klokke, datoTid } from "../../fleet/format.js";
import {
  Kort, Tom, Tabel, Pille, Gitter, MiniLinje, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import {
  HAENDELSE, planlagteStop, seneste, naesteStop, erAfsluttet,
  afvigelseFraPlan, stilhedMin, stilhedTone,
} from "../../fleet/rutestatus.js";
import { graenseLabel, krydserGraense, enhedsIder } from "../../fleet/etaper.js";
/* ⚠ KUN SOM FALDBAKKE I useListe — undtagen `demoHaendelser`, som ikke HAR en
   node. Se noten ved opslagene nedenfor. */
import { DEMO_ETAPER, demoHaendelser } from "../../fleet/demo-etaper.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_PERSONALE } from "../../fleet/demo-personale.js";

export default function RuteOgStatus() {
  const { division } = useFleet();
  const [valgtId, setValgtId] = useState(null);

  /* ⚠ NODERNE, IKKE DEMOFILERNE. Divisionsfilteret ligger i useListe — en post
     UDEN division hører til begge, ikke til ingen. */
  const etapeListe = useListe("etaper", {
    ordnPaa: "fra", vindue: "alle", graense: 500, demo: DEMO_ETAPER,
  });
  const bilListe = useListe("koeretoejer", {
    vindue: "alle", graense: 500, demo: DEMO_KOERETOEJER,
  });
  const persListe = useListe("personale", {
    vindue: "alle", graense: 500, demo: DEMO_PERSONALE,
  });

  const bil = (id) => bilListe.data.find((b) => b.id === id);
  const person = (id) => persListe.data.find((p) => p.id === id);

  /**
   * ⚠ SKÆRMEN FILTREREDE PÅ `e.koeretoejId` — ET FELT INGEN ETAPE HAR.
   *
   * Etapen bærer `koeretoejIder` (flertal) siden sættevognen kom til: en tur
   * optager trækker PLUS trailer. Målt i demo-sættet: **0 af 8** etaper har
   * `koeretoejId`, 7 har `koeretoejIder`. Filteret matchede altså ingenting,
   * og skærmen stod TOM for alle — også i demo.
   *
   * Det fejlede ikke; det viste bare ingenting. Præcis samme klasse som
   * `opgaver`' indeks der navngav `dato`, og som modulets `FELT`-katalog der
   * lovede `varighedMin`. Et forkert feltnavn er tavst.
   *
   * ⚠ OG RUTEN HØRER TIL DEN TRÆKKENDE ENHED. En trailer har ingen rute af sig
   * selv; `enhedsIder()` giver etapens enheder, og den første er den der
   * kører. Det er samme grund som `kanDisponeres()` afviser en trailer alene.
   */
  const relevante = etapeListe.data
    .filter((e) => enhedsIder(e).length)
    .sort((a, b) => a.fra - b.fra);

  const raekker = relevante.map((e) => {
    /* ⚠ MELDINGERNE HAR INGEN NODE, OG DET ER IKKE EN FORGLEMMELSE.
       `statushaendelser` findes hverken i `firebase.rules.json` eller i SEED:
       de kommer fra chaufførens meldinger, og APPEN ER IKKE BYGGET. Et tomt
       array ville få hver tur til at stå som "ingen meldinger" — og det er
       netop den oplysning skærmen giver om en tur der ER i gang. Faldbakken
       bruges KUN når der ingen database er; her er der ingen node.
       Se beslutning 22 og hovedet i denne fil. */
    const h = demoHaendelser(e.id);
    const naeste = naesteStop(e, h);
    const afsluttet = erAfsluttet(h);
    return {
      ...e, haendelser: h, naeste, afsluttet,
      sidst: seneste(h),
      stilhed: stilhedMin(h),
      afvigelse: afvigelseFraPlan(e, h),
    };
  });

  const valgt = raekker.find((r) => r.id === valgtId) || raekker[0] || null;

  /* Beregnet af det viste — ikke nøgletal. Der findes ingen aggregering af
     status, fordi der ingen sporing er at aggregere. */
  const undervejs = raekker.filter((r) => !r.afsluttet && r.haendelser.length > 0);
  const udenMelding = raekker.filter((r) => !r.afsluttet && r.haendelser.length === 0);
  const forsinkede = raekker.filter((r) => (r.afvigelse ?? 0) > 0);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Undervejs" vaerdi={num(undervejs.length)} note="meldt i gang" />
        <KpiKort label="Ikke meldt begyndt" vaerdi={num(udenMelding.length)} />
        <KpiKort label="Melder forsinkelse" vaerdi={num(forsinkede.length)} />
        <KpiKort label="Positioner" vaerdi="—" note="ingen sporing" />
      </KpiRaekke>

      <Kort titel="Der er ingen GPS">
        <p className="fc-hint">
          Skærmen hed <b>Live-kort</b>, og navnet lovede en sporing der ikke findes.
          Den viser i stedet <b>den planlagte rute og chaufførens meldinger</b> — det
          vi faktisk ved.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          <b>En melding er ikke en måling.</b> Den kan være forsinket, forkert eller
          mangle, og derfor står der hvor længe siden vi hørte noget frem for en
          gættet placering. GPS bliver en <b>datakilde senere</b>, ikke et fundament:
          bygget omkring positioner ville skærmen være tom indtil sporingen fandtes.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort titel={`Ture i ${division}`}>
          <Tabel
            kolonner={[
              { key: "rute", label: "Rute", render: (r) => (
                  <button type="button" className="fc-a"
                          style={{ background: "none", border: 0, padding: 0, cursor: "pointer",
                                   font: "inherit", fontWeight: 650, textAlign: "left" }}
                          onClick={() => setValgtId(r.id)}>
                    {r.fraSted} → {r.tilSted}
                  </button>) },
              /* ⚠ ENHEDERNE, IKKE "enheden". En sættevogn er trækker plus
                 trailer, og den der KØRER, er den første. */
              { key: "koeretoejIder", label: "Bil",
                render: (r) => bil(enhedsIder(r)[0])?.kaldenavn || "—" },
              { key: "personId", label: "Chauffør", render: (r) => person(r.personId)?.navn },
              { key: "fra", label: "Afgang", render: (r) => datoTid(r.fra) },
              { key: "etaMs", label: "Forventet fremme",
                render: (r) => (r.etaMs ? datoTid(r.etaMs) : "—") },
              { key: "naeste", label: "Næste stop", render: (r) => (r.afsluttet
                  ? <Pille tone="ok">Afsluttet</Pille>
                  : r.naeste
                    ? r.naeste.stop.rolle === "graense"
                      ? graenseLabel(r.naeste.stop.sted)
                      : r.naeste.stop.sted
                    : <span className="fc-neutral">—</span>) },
              { key: "afvigelse", label: "Afvigelse", num: true, render: (r) => {
                  if (r.afvigelse == null) return <span className="fc-neutral">ukendt</span>;
                  const tone = r.afvigelse > 0 ? "bad" : "ok";
                  return <Pille tone={tone}>{r.afvigelse > 0 ? "+" : ""}{num(r.afvigelse)} min.</Pille>;
                } },
              /* Den ærlige erstatning for en position. */
              { key: "stilhed", label: "Sidst hørt", render: (r) => {
                  const s = stilhedTone(r.stilhed);
                  return <Pille tone={s.tone}>{s.tekst}</Pille>;
                } },
            ]}
            raekker={raekker}
            tom="Ingen ture med en tildelt bil i divisionen."
          />
          <p className="fc-hint" style={{ marginTop: 12 }}>
            <b>Afvigelse</b> er <b>ukendt</b> når chaufføren ikke har meldt noget der
            kan måles mod planen. At vise "0 min." ville påstå at turen er i tide.
            Åbne etaper uden bil står ikke her — de har ingen rute at følge endnu.{" "}
            <Link className="fc-a" to="/booking/disponering">Se disponeringen</Link>.
          </p>
        </Kort>

        <Tidslinje tur={valgt} bil={bil} person={person} />
      </Gitter>
    </div>
  );
}

/* ---- Tidslinjen: plan og meldinger ved siden af hinanden --------------- */

/* ⚠ OPSLAGENE KOMMER IND. De var modul-konstanter bygget af demofilerne; nu
   bygges de af de hentede lister, og en underkomponent kan ikke se den ydres
   variable. Syvende gang den note skrives i dette repo. */
function Tidslinje({ tur, bil, person }) {
  if (!tur) {
    return <Kort titel="Rute"><Tom>Vælg en tur i listen.</Tom></Kort>;
  }

  const stop = planlagteStop(tur);
  const naaede = new Set(tur.haendelser.filter((h) => h.stopId).map((h) => h.stopId));

  return (
    <div className="fc-grid">
      <Kort
        titel={`${tur.fraSted} → ${tur.tilSted}`}
        handling={tur.afsluttet
          ? <Pille tone="ok">Afsluttet</Pille>
          : <Pille tone="warn">Undervejs</Pille>}
      >
        <MiniLinje label="Bil"
                   vaerdi={enhedsIder(tur).map((id) => bil(id)?.kaldenavn || id).join(" + ") || "—"} />
        <MiniLinje label="Chauffør" vaerdi={person(tur.personId)?.navn || "—"} />
        <MiniLinje label="Afgang" vaerdi={datoTid(tur.fra)} />
        <MiniLinje label="Forventet fremme" vaerdi={tur.etaMs ? datoTid(tur.etaMs) : "—"} />
        <MiniLinje
          label="Grænse"
          vaerdi={krydserGraense(tur)
            ? tur.graenseovergange.map(graenseLabel).join(", ")
            : <Pille tone="info">Kun kørsel i Danmark</Pille>}
        />
      </Kort>

      <Kort titel="Planlagt rute">
        {stop.map((s) => (
          <MiniLinje
            key={s.id}
            label={s.rolle === "graense" ? graenseLabel(s.sted) : s.sted}
            vaerdi={naaede.has(s.id)
              ? <Pille tone="ok">Passeret</Pille>
              : <span className="fc-neutral">
                  {s.planlagtMs ? klokke(s.planlagtMs) : "afventer"}
                </span>}
          />
        ))}
        <p className="fc-hint" style={{ marginTop: 10 }}>
          Ruten er <b>udledt af etapen</b> og gemmes ikke som sin egen liste — så kan
          den ikke drive fra afhentnings- og leveringsstedet.
        </p>
      </Kort>

      <Kort titel={`Chaufførens meldinger (${tur.haendelser.length})`}>
        {tur.haendelser.length === 0 ? (
          <Tom>
            Chaufføren har ikke meldt noget endnu. Det betyder <b>ikke</b> at turen
            ikke er begyndt — det betyder at vi ikke ved det.
          </Tom>
        ) : (
          <Tabel
            kolonner={[
              { key: "ms", label: "Tid", render: (h) => klokke(h.ms) },
              { key: "type", label: "Melding", render: (h) => (
                  <Pille tone={HAENDELSE[h.type]?.pill}>{HAENDELSE[h.type]?.label || h.type}</Pille>) },
              { key: "sted", label: "Sted", render: (h) => h.sted || "—" },
              { key: "note", label: "Note", render: (h) => h.note || <span className="fc-neutral">—</span> },
            ]}
            raekker={[...tur.haendelser].sort((a, b) => a.ms - b.ms)}
            noegle={(h, i) => `${h.ms}-${i}`}
          />
        )}
        <p className="fc-hint" style={{ marginTop: 10 }}>
          Meldingerne sorteres på <b>tidspunkt</b>, ikke på hvornår de kom ind — en
          chauffør uden dækning melder først når han har signal igen.
        </p>
      </Kort>
    </div>
  );
}
