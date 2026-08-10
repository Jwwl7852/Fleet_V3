/* src/moduler/flaade/Oversigt.jsx
 * Flåde – køretøjer
 *
 * DET HER ER STEDET HVOR EN ENHED OPRETTES. Datamodellen kom med beslutning 18.
 *
 * FLÅDEN ER IKKE EN LISTE AF BILER. NI arter i to grupper — se fleet/flaade.js:
 *
 *   motoriseret  traekker, lastbil, varevogn, bus, minibus, scooter, truck
 *   paahaengt    trailer, paahaeng — eget registreringsnummer, egen synsfrist,
 *                egne dæk, men ingen motor
 *
 * (Skeletnoten sagde "syv arter" og listede fem motoriserede. Den var skrevet
 * før bus og minibus kom til, og den ville have vildledt den næste.)
 *
 * `art` STYRER FELTSKEMAET. Det er ikke en talemåde her: detaljepanelet bygges
 * af felterFor(art), så en trailer ikke får en kilometerstand og en scooter
 * ikke får en tachograf. ET FELT DER IKKE FINDES ER IKKE ET TOMT FELT — vises
 * det som "—", ligner det en mangel nogen bør udfylde, og så bliver den
 * udfyldt. Rækken udelades helt.
 *
 * FIRE TING FRA SKELETNOTEN, OG HVOR DE STÅR I KODEN:
 *
 *  1. laengdeMm er MILLIMETER som integer. Færgetakster har grænser ved 10 og
 *     20 m, og 9,998 mod 10,002 afgør prisen. Tabellen viser meter med
 *     meter(), og millimetertallet står i panelet — så man kan se hvad der
 *     faktisk er gemt. Samme disciplin som øre i beslutning 2.
 *  2. En trailer kan reserveres selvstændigt, men ikke disponeres alene.
 *     Panelet spørger kanDisponeres() frem for at skrive reglen her — ellers
 *     står reglen to steder, og Disponering får sit eget svar.
 *  3. En solgt bil kan ikke slettes. Der er INGEN Slet-knap: reglernes
 *     newData.exists() afviser en sletning, fordi der hænger indberetninger og
 *     omkostningshistorik på id'et. Man sætter status til `solgt`, og posten
 *     bliver stående. Bil 77 og Påhæng 7 er eksemplerne i demo-sættet.
 *  4. liveGPS hører i sensitive/koeretoejer bag koeretoejer.sensitiveLaes.
 *     Panelet fortæller hvad der ligger der frem for at lade som om det ikke
 *     findes — beslutning 17 gjort synlig.
 *
 * INGEN DIVISION. Et køretøj har ingen (beslutning 19), og reglerne afviser
 * feltet. Byg ikke et divisionsfelt ind i en formular — det ville fejle ved
 * skrivningen. Skærmen reagerer derfor heller ikke på Gods/Bus-toggle'en;
 * division:"alle" står eksplicit, så det ikke ser ud som om den bare var heldig.
 *
 * SKRIVNING ER IKKE BYGGET. Knapperne står der, deaktiverede, med forklaringen.
 *
 * ⚠ Rosteren er et UDSNIT. kpi/ siger 42 aktive i gods og 18 i bus; demo-sættet
 * har 16 enheder i alt og kan ikke ramme nogen af de to tal, fordi et køretøj
 * ikke har en division at deles op på. Nøgletallene øverst kommer fra kpi/ —
 * tabellen tæller sig selv og skriver "af N hentede". At lade tabellen fodre
 * et KpiKort ville være beslutning 6 brudt.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, km, meter, dato, serviceTone } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  ENHEDSART, ALLE_ARTER, KOERETOEJ_STATUS, GRUPPE, FELT,
  felterFor, harFelt, gruppeFor, erPaahaengt, kanDisponeres, kraevedeKompetencer,
  KOMPETENCE_LABEL,
} from "../../fleet/flaade.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, Tom, Gitter, MiniLinje, Knap,
  KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import { vaerste } from "../../fleet/datatilstand.js";

const passerSoegning = (k, q) =>
  !q || [k.kaldenavn, k.navn, k.registrering, k.tachografNr]
    .some((v) => (v || "").toLowerCase().includes(q));

/* Feltetiketterne ét sted. Skriver hver skærm sine egne, hedder det
   "Målerstand" her og "Km-stand" på næste. */
const FELT_LABEL = {
  [FELT.kmStand]: "Kilometerstand",
  [FELT.driftPrKmOere]: "Driftsomkostning pr. km",
  [FELT.kapacitet]: "Kapacitet",
  [FELT.saeder]: "Sæder",
  [FELT.naesteServiceMs]: "Næste service",
  [FELT.synMs]: "Syn",
  [FELT.tachografNr]: "Tachograf",
};

function feltVaerdi(enhed, felt) {
  switch (felt) {
    case FELT.kmStand: return km(enhed.kmStand);
    /* driftPrKmOere er UDEN chauffør — beslutning 11's 3,42 kr.
       Kalkulationsprisen inkl. chauffør ligger i Bookingopsætning. */
    case FELT.driftPrKmOere: return kr(enhed.driftPrKmOere, 2);
    case FELT.kapacitet:
      return `${num(enhed.kapacitet?.m3 || 0)} m³ · ${num(enhed.kapacitet?.kg || 0)} kg`;
    case FELT.saeder: return num(enhed.saeder);
    case FELT.tachografNr: return enhed.tachografNr || "—";
    default: return null;
  }
}

/* Service og syn er datoer med en frist — samme tre trin som Facility og
   Kompetencer bruger. serviceTone() ét sted, ikke tre tærskler i tre filer. */
function FristLinje({ label, ms }) {
  if (ms == null) return null;
  const s = serviceTone(ms);
  return (
    <MiniLinje
      label={label}
      vaerdi={<>{dato(ms)} <Pille tone={s.tone}>{s.tekst}</Pille></>}
    />
  );
}

export default function FlaadeOversigt() {
  const { bruger } = useFleet();
  const { kpi: k, henter: henterKpi, fejl: kpiFejl, tilstand: kpiTilstand, genindlaes: genindlaesKpi } = useKpi();
  const [valgtId, setValgtId] = useState(null);
  const [soeg, setSoeg] = useState("");
  const [art, setArt] = useState("");
  const [visAlle, setVisAlle] = useState(false);

  /* Server-side filtreres på ét felt: status. Det er indekseret
     (".indexOn": ["status", "art", "naesteServiceMs"]), og `aktiv` er langt
     det almindeligste opslag — man leder efter en bil man kan bruge i morgen,
     ikke efter dem der er solgt.

     "Alle" skifter til vindue:"alle" frem for at tilføje et filter, fordi
     useListe kaster hvis man sender både lig og vindue. Arten filtreres
     klientside: RTDB kan kun filtrere på ét felt, og status er det rigtige at
     bruge det på. */
  const { data: flaade, henter, fejl, tilstand, genindlaes, afkortet } = useListe("koeretoejer", {
    ordnPaa: "status",
    ...(visAlle ? { vindue: "alle" } : { lig: "aktiv" }),
    /* EKSPLICIT. Posterne har ingen division (beslutning 19), og useListe
       viser divisionsløse rækker i begge toggles — så resultatet ville være
       det samme uden. Men så ville det se ud som om skærmen var heldig. */
    division: "alle",
    graense: 300,
    sorter: (a, b) => (a.kaldenavn || a.navn).localeCompare(b.kaldenavn || b.navn, "da"),
    demo: DEMO_KOERETOEJER,
  });

  if (henterKpi || henter) return <Henter hvad="flåden" />;
  if (!k) return <Datatilstand tilstand={kpiTilstand} genprov={genindlaesKpi} tom="Nøgletallene kunne ikke hentes." />;

  const maaSkrive = harPerm(bruger?.perms, PERM.koeretoejerSkriv);
  const maaSeFoelsomt = harPerm(bruger?.perms, PERM.koeretoejerSensitiveLaes);

  const q = soeg.trim().toLowerCase();
  const viste = flaade.filter((e) => (!art || e.art === art) && passerSoegning(e, q));

  /* Valget følger med, når filteret ændrer sig — ellers viser panelet en enhed
     der ikke længere står i tabellen ved siden af. */
  const valgt = viste.find((e) => e.id === valgtId) || null;

  const statusPille = (e) => {
    const s = KOERETOEJ_STATUS[e.status];
    return <Pille tone={s?.pill || "info"}>{s?.label || e.status}</Pille>;
  };

  /* kanDisponeres() frem for at skrive reglen her. Den svarer på ÉN enhed for
     sig; en trailer alene giver derfor "nej", og det er hele pointen. */
  const disponerbar = valgt ? kanDisponeres([valgt]) : null;
  const kompetencekrav = valgt ? kraevedeKompetencer([valgt]) : [];

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Aktive køretøjer" vaerdi={num(k.flaade.aktive)} />
        <KpiKort label="Ude af drift" vaerdi={num(k.flaade.udeAfDrift)} />
        <KpiKort label="Service inden 30 dage" vaerdi={num(k.flaade.serviceInden30)} />
        {/* Driftsomkostning UDEN chauffør. Kalkulationsprisen inkl. chauffør
            er 8,40 kr og ligger i Bookingopsætning — beslutning 11. */}
        <KpiKort label="Driftsomk. pr. km" vaerdi={kr(k.flaade.omkostningPrKmOere, 2)}
                 note="uden chauffør" />
      </KpiRaekke>

      <Datatilstand tilstand={vaerste(tilstand, kpiTilstand)}
                    genprov={() => { genindlaes(); genindlaesKpi(); }} />

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort
          titel="Køretøjer"
          handling={
            <Knap variant="primaer" disabled
                  title={maaSkrive ? "Oprettelse er ikke bygget endnu."
                                   : "Kræver koeretoejer.skriv."}>
              Ny enhed
            </Knap>
          }
        >
          <p className="fc-hint" style={{ marginBottom: 12 }}>
            Flåden er ikke en liste af biler. <b>Ni arter</b> i to grupper, og{" "}
            <b>arten styrer feltskemaet</b>: en trailer har eget syn og egne dæk,
            men ingen motor og ingen kilometerstand. En påhængt enhed kan
            reserveres alene, men ikke disponeres alene.
          </p>

          <div className="fc-faner" role="tablist" aria-label="Status">
            <button type="button" role="tab" className="fc-fane" aria-selected={!visAlle}
                    onClick={() => setVisAlle(false)}>
              Aktive
            </button>
            <button type="button" role="tab" className="fc-fane" aria-selected={visAlle}
                    onClick={() => setVisAlle(true)}>
              Alle, inkl. solgte og skrottede
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <div className="fc-felt" style={{ flex: "1 1 240px", marginBottom: 0 }}>
              <label htmlFor="fl-soeg">Søg</label>
              <input id="fl-soeg" type="search" value={soeg}
                     placeholder="Kaldenavn, model, nummerplade eller tachograf"
                     onChange={(e) => setSoeg(e.target.value)} />
            </div>
            <div className="fc-felt" style={{ flex: "0 1 220px", marginBottom: 0 }}>
              <label htmlFor="fl-art">Art</label>
              <select id="fl-art" value={art} onChange={(e) => setArt(e.target.value)}>
                <option value="">Alle arter</option>
                {ALLE_ARTER.map((a) => (
                  <option key={a} value={a}>{ENHEDSART[a].label}</option>
                ))}
              </select>
            </div>
          </div>

          <Tabel
            kolonner={[
              { key: "kaldenavn", label: "Enhed", render: (r) => (
                  <button type="button" className="fc-a"
                          style={{ background: "none", border: 0, padding: 0, cursor: "pointer",
                                   font: "inherit", fontWeight: 650, textAlign: "left" }}
                          aria-pressed={r.id === valgtId}
                          onClick={() => setValgtId(r.id === valgtId ? null : r.id)}>
                    {r.kaldenavn || r.navn}
                  </button>
                ) },
              { key: "navn", label: "Model" },
              { key: "registrering", label: "Reg.nr." },
              { key: "art", label: "Art", render: (r) => (
                  <Pille tone={gruppeFor(r.art) === GRUPPE.paahaengt ? "warn" : "info"}>
                    {ENHEDSART[r.art]?.label || r.art}
                  </Pille>
                ) },
              /* Meter til visning, millimeter i basen. Panelet viser rå-tallet. */
              { key: "laengdeMm", label: "Længde", num: true, render: (r) => meter(r.laengdeMm) },
              { key: "status", label: "Status", render: statusPille },
              { key: "naesteServiceMs", label: "Næste service", render: (r) => {
                  if (r.naesteServiceMs == null) return <span className="fc-neutral">—</span>;
                  const s = serviceTone(r.naesteServiceMs);
                  return <Pille tone={s.tone}>{s.tekst}</Pille>;
                } },
            ]}
            raekker={viste}
            tom={q || art ? "Ingen enheder passer på søgningen." : "Ingen enheder oprettet endnu."}
          />

          <p className="fc-hint" style={{ marginTop: 12 }}>
            Viser {num(viste.length)} af {num(flaade.length)} hentede{" "}
            {visAlle ? "enheder" : "aktive enheder"}. Tabellen er <b>ikke</b> delt på
            Gods/Bus: et køretøj har ingen division, men er defineret ved sin{" "}
            <b>art</b> — en påhængsvogn kan tilhøre både en gods- og en busvognmand.
            Toggle'en i toppen ændrer derfor ikke denne tabel.
          </p>
          {afkortet && (
            <p className="fc-hint" style={{ marginTop: 8 }}>
              Der er flere end de 300 hentede. Listen er afkortet — snævr søgningen ind.
            </p>
          )}
        </Kort>

        <div className="fc-grid">
          {!valgt ? (
            <Kort titel="Enhed">
              <Tom>Vælg en enhed i listen for at se stamdata og feltskemaet for dens art.</Tom>
            </Kort>
          ) : (
            <>
              <Kort titel={valgt.kaldenavn || valgt.navn} handling={statusPille(valgt)}>
                <MiniLinje label="Model" vaerdi={valgt.navn} />
                <MiniLinje label="Registrering" vaerdi={valgt.registrering || "—"} />
                <MiniLinje label="Art" vaerdi={ENHEDSART[valgt.art]?.label || valgt.art} />
                <MiniLinje
                  label="Gruppe"
                  vaerdi={gruppeFor(valgt.art) === GRUPPE.paahaengt ? "Påhængt" : "Motoriseret"}
                />
                {/* Både meter og millimeter. Meter er til mennesket, millimeter
                    er hvad der faktisk står i basen — og det er millimetertallet
                    en færgetakst afgøres på. */}
                <MiniLinje
                  label="Længde"
                  vaerdi={<>{meter(valgt.laengdeMm)} <span className="fc-neutral">
                    ({num(valgt.laengdeMm)} mm)</span></>}
                />

                {/* HER er "art styrer skemaet" konkret: rækkerne kommer fra
                    felterFor(), ikke fra en håndskrevet liste. */}
                {felterFor(valgt.art)
                  .filter((f) => f !== FELT.naesteServiceMs && f !== FELT.synMs)
                  .map((f) => (
                    <MiniLinje key={f} label={FELT_LABEL[f]} vaerdi={feltVaerdi(valgt, f)} />
                  ))}

                {harFelt(valgt.art, FELT.naesteServiceMs) && (
                  <FristLinje label="Næste service" ms={valgt.naesteServiceMs} />
                )}
                {harFelt(valgt.art, FELT.synMs) && (
                  <FristLinje label="Syn" ms={valgt.synMs} />
                )}

                {valgt.afgangMs && (
                  <MiniLinje label="Afgang" vaerdi={`${dato(valgt.afgangMs)} — ${valgt.afgangAarsag}`} />
                )}

                <p className="fc-hint" style={{ marginTop: 12 }}>
                  Feltskemaet kommer fra <b>arten</b>, ikke fra hvad der er udfyldt.{" "}
                  {ENHEDSART[valgt.art]?.tachograf
                    ? "Denne art har tachograf og køre-hviletid."
                    : "Denne art har hverken tachograf eller køre-hviletid, så felterne findes ikke."}{" "}
                  Et felt der ikke findes, vises ikke som tomt — et tomt felt bliver udfyldt.
                </p>
              </Kort>

              <Kort titel="Disponering">
                <MiniLinje
                  label="Kan disponeres"
                  vaerdi={disponerbar.ok
                    ? "Ja"
                    : <span className="fc-bad">Nej</span>}
                />
                {!disponerbar.ok && (
                  <p className="fc-hint" style={{ marginTop: 8 }}>{disponerbar.aarsag}</p>
                )}
                {erPaahaengt(valgt) && (
                  <p className="fc-hint" style={{ marginTop: 8 }}>
                    Enheden kan <b>reserveres</b> alene — den er en helt almindelig
                    eksklusiv ressource, og to biler kan ikke få den samme. Den kan
                    bare ikke <b>disponeres</b> alene, og det er en disponeringsregel
                    frem for en reservationsegenskab.
                  </p>
                )}
                <MiniLinje
                  label="Kræver af føreren"
                  vaerdi={kompetencekrav.length
                    ? kompetencekrav.map((c) => KOMPETENCE_LABEL[c] || c).join(", ")
                    : "Ingen"}
                />
                <p className="fc-hint" style={{ marginTop: 10 }}>
                  Kravet kommer fra <b>kraevedeKompetencer()</b> — samme kilde som
                  Disponering og den Cloud Function der skal skrive etapen. ADR
                  kommer fra <b>lasten</b> og kan derfor ikke udledes af enheden
                  alene. En <b>udløbet</b> kompetence skal blokere, ikke advare.
                </p>
              </Kort>

              <Kort titel="Stamdata og sletning">
                <p className="fc-hint">
                  Der er <b>ingen Slet-knap</b>. Reglernes <b>newData.exists()</b> afviser
                  en sletning, fordi der hænger indberetninger, service- og
                  omkostningshistorik på id'et. Man sætter status til <b>Solgt</b> eller{" "}
                  <b>Skrottet</b>, og posten bliver stående — ellers kan en faktura fra
                  sidste kvartal ikke forklares.
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <Knap disabled title={maaSkrive ? "Redigering er ikke bygget endnu."
                                                  : "Kræver koeretoejer.skriv."}>
                    Redigér
                  </Knap>
                  <Knap disabled title={maaSkrive ? "Afgang er ikke bygget endnu."
                                                  : "Kræver koeretoejer.skriv."}>
                    Registrér afgang
                  </Knap>
                </div>
                {!maaSkrive && (
                  <p className="fc-hint" style={{ marginTop: 10 }}>
                    Din rolle kan ikke skrive køretøjer. Knapperne står der, fordi
                    serveren afviser og fejlen skal kunne forklares — en skjult knap
                    lærer brugeren at funktionen ikke findes.
                  </p>
                )}
              </Kort>

              {/* Beslutning 17 gjort synlig, som på Medarbejdere. */}
              <Kort titel="Følsomme oplysninger">
                <p className="fc-hint">
                  <b>liveGPS</b> ligger i <b>sensitive/koeretoejer/{valgt.id}</b> — en
                  søskendenode, ikke et barn, fordi en <b>.read</b> kaskaderer og ikke
                  kan indsnævres på et barn. Den kræver{" "}
                  <b>koeretoejer.sensitiveLaes</b>, som disponent, koordinator og admin
                  har: man kan ikke disponere uden at vide hvor bilerne er.
                </p>
                <p className="fc-hint" style={{ marginTop: 8 }}>
                  {maaSeFoelsomt
                    ? "Din rolle har adgang. Positionen hentes ikke her — den kræver et ekstra opslag og hører ikke i en liste."
                    : "Din rolle har ikke adgang, og serveren afviser opslaget."}{" "}
                  <Link className="fc-a" to="/booking/live-kort">Se live-kortet</Link>.
                </p>
              </Kort>
            </>
          )}
        </div>
      </Gitter>

      <p className="fc-hint">
        Demo-flåden er et <b>udsnit</b> på {num(DEMO_KOERETOEJER.length)} enheder, ikke hele
        flåden — nøgletallene øverst kommer fra <b>kpi/</b> og er langt større tal. De to
        skal ikke gå op mod hinanden: tabellen tæller sig selv og siger "af N hentede",
        og en optælling af hentede rækker er ikke et nøgletal. Alle beløb er ekskl. moms.
      </p>
    </div>
  );
}
