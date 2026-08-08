/* src/moduler/Medarbejdere.jsx
 * Medarbejdere
 *
 * Der fandtes INGEN mockup for denne skærm — den manglede i hele designsættet,
 * og det var grunden til at hverken Bemanding eller Kompetencer havde noget
 * sted at hente navne fra. Datamodellen kom med beslutning 18; skærmen er
 * bygget her.
 *
 * DET HER ER STEDET HVOR EN MEDARBEJDER OPRETTES. Ikke Opsætning → Brugere &
 * roller: dér oprettes et LOGIN. En chauffør har måske aldrig et, en vikar
 * sjældent, en kontormedarbejder begge. Derfor viser detaljepanelet
 * udtrykkeligt "Intet login" frem for at lade feltet være tomt — et tomt felt
 * ligner en mangel, og det er det ikke.
 *
 *   uid       hvem der GJORDE noget   indberetninger.oprettetAf, auditloggen
 *   personId  hvem det HANDLER OM     reservationer, fravær, opgaver, etaper,
 *                                     kompetencer
 *
 * FIRE TING FRA SKELETNOTEN, OG HVOR DE STÅR I KODEN:
 *
 *  1. `funktioner` er et MAP, ikke et array. Kolonnen bruger funktionerAf()
 *     fra personale.js, så rækkefølgen er katalogets og ikke objektets. En
 *     person kan være både mekaniker og chauffør — Peter Iversen er det.
 *  2. `division` er en ANDEN AKSE end funktioner. Den har sin egen kolonne,
 *     og en `faelles` medarbejder står på begge divisioners liste med samme
 *     række. Ulrik Bang med C/E og D er ikke to personer.
 *  3. CPR, privatadresse, pårørende og baggrundskontrol står INGEN steder i
 *     denne fil. Reglerne afviser `cpr` og `privatAdresse` i general-noden
 *     med .validate: false, så en formular med dem ville fejle ved
 *     skrivningen. De hører i sensitive/personale bag personale.sensitiveLaes,
 *     og panelet fortæller hvad der ligger der frem for at lade som om det
 *     ikke findes.
 *  4. Ingen Slet-knap. Reglernes newData.exists() afviser en sletning, fordi
 *     der hænger reservationer og indberetninger på personId'et. Man sætter
 *     status til `fratraadt`, og posten bliver stående — Bjarne Toft er
 *     eksemplet i demo-sættet.
 *
 * SKRIVNING ER IKKE BYGGET. Knapperne står der, deaktiverede, med forklaringen
 * på hvorfor. Skjulte knapper ville lære brugeren at funktionen ikke findes;
 * den findes, men kræver personale.skriv, som kun admin har i presettet.
 *
 * INGEN KpiRaekke, og det er med vilje. Der findes ikke noget felt i kpi/ for
 * antal medarbejdere, og at tælle rækkerne i den hentede liste og kalde det et
 * nøgletal er præcis det beslutning 6 forbyder — listen er et udsnit, ikke en
 * total. Tallene nederst siger derfor "af N hentede", ikke "af N i alt".
 * `bemanding.medarbejdereAktive` hører i KPI-aggregeringen sammen med de
 * øvrige manglende felter; indtil det felt findes, står tallet ikke på
 * skærmen.
 *
 * TO KILDER, TO NODER. `personale` og `kompetencer` er hver sin node — ikke
 * fordi det er pænere, men fordi "hvilke kompetencer udløber inden for 30
 * dage?" ikke kan besvares under personale/<id>/kompetencer/. Samme argument
 * som etaper i beslutning 16.
 *
 * UDLØBSLISTEN HØRER PÅ KOMPETENCER. Panelet viser den valgte persons egne
 * beviser — det er ikke listen, det er personen. Kortet linker videre frem for
 * at gentage varslingen, som Kunder linker til Bookingopsætning.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../fleet/useListe.js";
import { useFleet } from "../fleet/FleetContext.jsx";
import { dato, num, serviceTone } from "../fleet/format.js";
import { harPerm, PERM } from "../fleet/permissions.js";
import {
  ALLE_FUNKTIONER, FUNKTION_LABEL, PERSONALE_STATUS, ANSAETTELSESFORM,
  funktionerAf, harFunktion, kanDisponeres,
} from "../fleet/personale.js";
import { KOMPETENCE_LABEL, kanBlokere } from "../fleet/flaade.js";
import { DEMO_PERSONALE, DEMO_KOMPETENCER } from "../fleet/demo-personale.js";
import {
  Kort, Tabel, Pille, Henter, Fejl, Tom, Gitter, MiniLinje, Knap,
} from "../fleet/ui.jsx";

const DIVISION_LABEL = { gods: "Gods", bus: "Bus", faelles: "Fælles" };

/* Fælles er ikke en tredje afdeling, men fraværet af en grænse — derfor
   info-tonen og ikke ok/warn, som ville antyde en tilstand. */
const divisionTone = (d) => (d === "faelles" ? "info" : "ok");

const passerSoegning = (p, q) =>
  !q || [p.navn, p.email, p.telefon, p.stationeret]
    .some((v) => (v || "").toLowerCase().includes(q));

export default function Medarbejdere() {
  const { division, bruger } = useFleet();
  const [valgtId, setValgtId] = useState(null);
  const [soeg, setSoeg] = useState("");
  const [funktion, setFunktion] = useState("");
  const [visAlle, setVisAlle] = useState(false);

  /* Server-side filtreres på ét felt: status. Det er indekseret
     (".indexOn": ["uid", "status", "division"]), og `aktiv` er langt det
     almindeligste opslag — man leder efter en medarbejder man kan bruge i
     morgen, ikke efter dem der er gået.

     "Alle" skifter til vindue:"alle" frem for at tilføje et filter, fordi
     useListe kaster hvis man sender både lig og vindue. Skiftet genhenter, og
     det er ærligt: det ER en anden forespørgsel. Søgning, funktion og division
     filtreres derimod i klienten og koster ingenting. */
  const {
    data: personale, henter: henterPersonale, fejl: personaleFejl,
    genindlaes: genindlaesPersonale, afkortet,
  } = useListe("personale", {
    ordnPaa: "status",
    ...(visAlle ? { vindue: "alle" } : { lig: "aktiv" }),
    graense: 300,
    sorter: (a, b) => a.navn.localeCompare(b.navn, "da"),
    demo: DEMO_PERSONALE,
    /* Personale er personoplysninger. auditerSom hører på forespørgslen og
       ikke i skærmen — ellers blev den glemt næste gang nogen læser noden.
       Der logges ÉN post med antallet, aldrig rækkerne. Indtil Cloud
       Function'en findes, tælles fejlen og skærmen kører videre; se
       forbeholdet om klientside-læsningslogning i README. */
    auditerSom: "personale",
  });

  /* Kompetencerne hentes ÉN gang og deles ud på personerne i klienten. Et
     opslag pr. valgt person ville koste en forespørgsel for hvert klik, og
     noden er lille nok til at det ikke betaler sig. Ingen division: den arves
     fra personen, og reglerne afviser feltet med .validate: false. */
  const {
    data: kompetencer, henter: henterKompetencer, fejl: kompetenceFejl,
    genindlaes: genindlaesKompetencer,
  } = useListe("kompetencer", {
    ordnPaa: "udloeberMs",
    vindue: "alle",
    division: "alle",
    demo: DEMO_KOMPETENCER,
  });

  if (henterPersonale || henterKompetencer) return <Henter hvad="medarbejdere" />;

  const genindlaesAlt = () => { genindlaesPersonale(); genindlaesKompetencer(); };
  const maaSkrive = harPerm(bruger?.perms, PERM.personaleSkriv);
  const maaSeFoelsomt = harPerm(bruger?.perms, PERM.personaleSensitiveLaes);

  const q = soeg.trim().toLowerCase();
  const viste = personale.filter(
    (p) => (!funktion || harFunktion(p, funktion)) && passerSoegning(p, q)
  );

  /* Valget følger med, når filteret ændrer sig — ellers viser panelet en
     person der ikke længere står i tabellen ved siden af. */
  const valgt = viste.find((p) => p.id === valgtId) || null;
  const valgtesKompetencer = valgt
    ? kompetencer
        .filter((k) => k.personId === valgt.id)
        .sort((a, b) => a.udloeberMs - b.udloeberMs)
    : [];

  const statusPille = (p) => {
    const s = PERSONALE_STATUS[p.status];
    return <Pille tone={s?.pill || "info"}>{s?.label || p.status}</Pille>;
  };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {(personaleFejl || kompetenceFejl) && (
        <Fejl genprov={genindlaesAlt}>
          Viser demo-data — ingen forbindelse til databasen.
        </Fejl>
      )}

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort
          titel="Medarbejdere"
          handling={
            <Knap
              variant="primaer"
              disabled
              title={
                maaSkrive
                  ? "Oprettelse er ikke bygget endnu."
                  : "Kræver personale.skriv, som kun admin har."
              }
            >
              Ny medarbejder
            </Knap>
          }
        >
          <p className="fc-hint" style={{ marginBottom: 12 }}>
            Her oprettes <b>personen</b>. Et login oprettes under{" "}
            <Link className="fc-a" to="/opsaetning/brugere">Opsætning → Brugere &amp; roller</Link>{" "}
            — de to er ikke det samme, og en chauffør har måske aldrig et login.
            Nøglen er et <b>personId</b>, som reservationer, fravær og kompetencer hænger på;
            et <b>uid</b> er kontoen, og den kan lukkes uden at personen forsvinder.
          </p>

          <div className="fc-faner" role="tablist" aria-label="Status">
            <button type="button" role="tab" className="fc-fane" aria-selected={!visAlle}
                    onClick={() => setVisAlle(false)}>
              Aktive
            </button>
            <button type="button" role="tab" className="fc-fane" aria-selected={visAlle}
                    onClick={() => setVisAlle(true)}>
              Alle, inkl. orlov og fratrådte
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <div className="fc-felt" style={{ flex: "1 1 240px", marginBottom: 0 }}>
              <label htmlFor="mb-soeg">Søg</label>
              <input id="mb-soeg" type="search" value={soeg}
                     placeholder="Navn, e-mail, telefon eller sted"
                     onChange={(e) => setSoeg(e.target.value)} />
            </div>
            <div className="fc-felt" style={{ flex: "0 1 240px", marginBottom: 0 }}>
              <label htmlFor="mb-funktion">Funktion</label>
              <select id="mb-funktion" value={funktion}
                      onChange={(e) => setFunktion(e.target.value)}>
                <option value="">Alle funktioner</option>
                {ALLE_FUNKTIONER.map((f) => (
                  <option key={f} value={f}>{FUNKTION_LABEL[f]}</option>
                ))}
              </select>
            </div>
          </div>

          <Tabel
            kolonner={[
              { key: "navn", label: "Navn", render: (r) => (
                  <button type="button" className="fc-a"
                          style={{ background: "none", border: 0, padding: 0, cursor: "pointer",
                                   font: "inherit", fontWeight: 650, textAlign: "left" }}
                          aria-pressed={r.id === valgtId}
                          onClick={() => setValgtId(r.id === valgtId ? null : r.id)}>
                    {r.navn}
                  </button>
                ) },
              /* funktioner er et map — funktionerAf() giver dem i katalogets
                 rækkefølge, så to personer med samme to funktioner viser dem
                 i samme orden. */
              { key: "funktioner", label: "Funktioner", render: (r) => {
                  const f = funktionerAf(r);
                  if (!f.length) return <span className="fc-neutral">—</span>;
                  return f.map((k) => (
                    <span key={k} style={{ marginRight: 4 }}>
                      <Pille tone="info">{FUNKTION_LABEL[k]}</Pille>
                    </span>
                  ));
                } },
              /* Egen kolonne, ikke blandet ind i funktionerne. Det er to
                 akser, og de blev blandet sammen i mockupsene. */
              { key: "division", label: "Division", render: (r) => (
                  <Pille tone={divisionTone(r.division)}>
                    {DIVISION_LABEL[r.division] || r.division}
                  </Pille>
                ) },
              { key: "status", label: "Status", render: statusPille },
              { key: "ansaettelsesform", label: "Ansættelse",
                render: (r) => ANSAETTELSESFORM[r.ansaettelsesform] || "—" },
              { key: "telefon", label: "Telefon", render: (r) => r.telefon || "—" },
              { key: "email", label: "E-mail", render: (r) => (
                  r.email
                    ? <a className="fc-a" href={`mailto:${r.email}`}>{r.email}</a>
                    : <span className="fc-neutral">—</span>
                ) },
            ]}
            raekker={viste}
            tom={
              q || funktion
                ? "Ingen medarbejdere passer på søgningen."
                : "Ingen medarbejdere i denne division."
            }
          />

          <p className="fc-hint" style={{ marginTop: 12 }}>
            Viser {num(viste.length)} af {num(personale.length)} hentede{" "}
            {visAlle ? "medarbejdere" : "aktive medarbejdere"} i{" "}
            {division === "bus" ? "busafdelingen" : "godsafdelingen"}. Medarbejdere mærket{" "}
            <Pille tone="info">Fælles</Pille> arbejder i begge divisioner og står på begge
            lister — det er én person, ikke en dublet.
          </p>
          {afkortet && (
            <p className="fc-hint" style={{ marginTop: 8 }}>
              Der er flere end de 300 hentede. Listen er afkortet — snævr søgningen ind for
              at se resten.
            </p>
          )}
        </Kort>

        <div className="fc-grid">
          {!valgt ? (
            <Kort titel="Medarbejder">
              <Tom>Vælg et navn i listen for at se kontaktoplysninger og kompetencer.</Tom>
            </Kort>
          ) : (
            <>
              <Kort titel={valgt.navn} handling={statusPille(valgt)}>
                <MiniLinje
                  label="Funktioner"
                  vaerdi={funktionerAf(valgt).map((f) => FUNKTION_LABEL[f]).join(", ") || "—"}
                />
                <MiniLinje
                  label="Division"
                  vaerdi={DIVISION_LABEL[valgt.division] || valgt.division}
                />
                <MiniLinje
                  label="Ansættelsesform"
                  vaerdi={ANSAETTELSESFORM[valgt.ansaettelsesform] || "—"}
                />
                <MiniLinje label="Stationeret" vaerdi={valgt.stationeret || "—"} />
                <MiniLinje label="Telefon" vaerdi={valgt.telefon || "—"} />
                <MiniLinje label="E-mail" vaerdi={valgt.email || "—"} />
                <MiniLinje label="Ansat" vaerdi={valgt.ansatMs ? dato(valgt.ansatMs) : "—"} />
                {valgt.fratraadtMs && (
                  <MiniLinje label="Fratrådt" vaerdi={dato(valgt.fratraadtMs)} />
                )}

                {/* uid er kontoen, ikke personen. Et tomt felt ville ligne en
                    mangel; det er en normaltilstand for en chauffør. */}
                <MiniLinje
                  label="Login"
                  vaerdi={
                    valgt.uid
                      ? (valgt.uid === bruger?.uid ? "Ja — det er dig" : "Ja")
                      : "Intet login"
                  }
                />
                <MiniLinje
                  label="Kan disponeres"
                  vaerdi={
                    kanDisponeres(valgt)
                      ? "Ja"
                      : `Nej — ${(PERSONALE_STATUS[valgt.status]?.label || valgt.status).toLowerCase()}`
                  }
                />

                <p className="fc-hint" style={{ marginTop: 12 }}>
                  {valgt.uid
                    ? "Personen har en konto. Lukkes kontoen, bliver posten stående — reservationer og indberetninger peger på personId'et, ikke på uid'et."
                    : "Personen har ingen konto, og det er ikke en mangel. Reservationer, fravær og kompetencer hænger på personId'et og virker uden login."}
                </p>

                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <Knap
                    disabled
                    title={maaSkrive
                      ? "Redigering er ikke bygget endnu."
                      : "Kræver personale.skriv, som kun admin har."}
                  >
                    Redigér
                  </Knap>
                  <Knap
                    disabled
                    title={maaSkrive
                      ? "Fratrædelse er ikke bygget endnu."
                      : "Kræver personale.skriv, som kun admin har."}
                  >
                    Registrér fratrædelse
                  </Knap>
                </div>
                <p className="fc-hint" style={{ marginTop: 10 }}>
                  Der er ingen Slet-knap. En medarbejder kan ikke fjernes — reglerne afviser
                  det med <b>newData.exists()</b>, fordi der hænger reservationer og
                  indberetninger på personId'et. Man sætter status til <b>Fratrådt</b>, og
                  posten bliver stående.
                  {!maaSkrive && " Din rolle kan i øvrigt ikke skrive personale; knapperne " +
                    "står der, fordi serveren afviser og fejlen skal kunne forklares."}
                </p>
              </Kort>

              <Kort
                titel="Kompetencer"
                handling={
                  <Link className="fc-a" to="/bemanding/kompetencer">Se alle og varslinger</Link>
                }
              >
                <Tabel
                  kolonner={[
                    { key: "type", label: "Kompetence",
                      render: (r) => KOMPETENCE_LABEL[r.type] || r.type },
                    { key: "udloeber", label: "Udløber", render: (r) => dato(r.udloeberMs) },
                    { key: "frist", label: "Frist", render: (r) => {
                        const s = serviceTone(r.udloeberMs);
                        return <Pille tone={s.tone}>{s.tekst}</Pille>;
                      } },
                  ]}
                  raekker={valgtesKompetencer}
                  tom="Ingen kompetencer registreret på denne medarbejder."
                />
                <p className="fc-hint" style={{ marginTop: 10 }}>
                  Tærsklerne kommer fra <b>serviceTone()</b> — samme tre trin som Flåde og
                  Facility. En <b>udløbet</b> kompetence skal <b>blokere</b> disponeringen,
                  ikke advare.{" "}
                  {valgtesKompetencer.some((k) => !kanBlokere(k.type)) && (
                    <>
                      Bemærk at ikke alle typer kan blokere: førstehjælp, kran og EU-bevis
                      registreres, men kan ikke udledes af et køretøj og indgår derfor ikke i{" "}
                      <b>kraevedeKompetencer()</b>.{" "}
                    </>
                  )}
                  Håndhævelsen hører i den Cloud Function der skriver etapen — ligger den i
                  en skærm, kan en direkte skrivning gå uden om den.
                </p>
              </Kort>

              {/* Beslutning 17 gjort synlig: felterne findes, de ligger bare et
                  andet sted, og de kan ikke skrives i general-noden. */}
              <Kort titel="Følsomme oplysninger">
                <p className="fc-hint">
                  CPR, privatadresse, pårørende og baggrundskontrol ligger i{" "}
                  <b>sensitive/personale/{valgt.id}</b> — en søskendenode, ikke et barn,
                  fordi en <b>.read</b> kaskaderer og ikke kan indsnævres. De kræver{" "}
                  <b>personale.sensitiveLaes</b>, som ingen af standardrollerne har ud over
                  admin.
                </p>
                <p className="fc-hint" style={{ marginTop: 8 }}>
                  {maaSeFoelsomt
                    ? "Din rolle har adgang. Felterne hentes ikke på denne skærm — de kræver et ekstra opslag, og de hører ikke i en liste."
                    : "Din rolle har ikke adgang, og serveren afviser opslaget."}{" "}
                  Reglerne afviser desuden <b>cpr</b> og <b>privatAdresse</b> i general-noden
                  med <b>.validate: false</b>, så de kan ikke ende her ved et uheld.
                </p>
              </Kort>
            </>
          )}
        </div>
      </Gitter>

      <p className="fc-hint">
        Demo-rosteren er et <b>udsnit</b> på {num(DEMO_PERSONALE.length)} personer, ikke hele
        staben. Bemandings planlagte og disponerede kommer fra <b>kpi/</b> og er langt større
        tal — de to skal ikke gå op mod hinanden, og listen her er derfor ingen optælling af
        staben. Kompetencerne er til gengæld de samme poster som Bemanding viser: én kilde,
        to visninger. <Link className="fc-a" to="/bemanding">Se bemandingsplanen</Link>.
      </p>
    </div>
  );
}
