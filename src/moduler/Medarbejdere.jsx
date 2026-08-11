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
 *  2. `division` findes ikke på en medarbejder — beslutning 19. Feltet havde
 *     sin egen kolonne her, og `faelles` betød "kører begge dele". Det er
 *     væk: en medarbejder er defineret ved sine KOMPETENCER og virker i alle
 *     moduler tenanten har adgang til. Ulrik Bang med C/E og D er ikke
 *     `faelles` — han er en person med fire kompetencer, og de står i
 *     kompetencer/. Reglerne afviser feltet, så skærmen kan ikke skrive det
 *     tilbage ved et uheld. Skærmen reagerer derfor heller ikke på Gods/Bus:
 *     hele staben vises altid, hvilket useListe klarer af sig selv, fordi en
 *     post uden division vises i begge.
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
  funktionerAf, harFunktion, kanDisponeres, ikonFor,
  valideMedarbejder, byggMedarbejder,
} from "../fleet/personale.js";
import { KOMPETENCE_LABEL, kanBlokere } from "../fleet/flaade.js";
import { DEMO_PERSONALE, DEMO_KOMPETENCER } from "../fleet/demo-personale.js";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, Tom, Gitter, MiniLinje, Knap,
  Ikon, Felt, Feltraekke, Formular,
} from "../fleet/ui.jsx";
import { gem, nyId } from "../fleet/skriv.js";
import { AUDIT } from "../fleet/audit.js";
import { vaerste } from "../fleet/datatilstand.js";

const passerSoegning = (p, q) =>
  !q || [p.navn, p.email, p.telefon, p.stationeret]
    .some((v) => (v || "").toLowerCase().includes(q));

/* ---- Formularen -------------------------------------------------------- */

const isoFraMs = (ms) =>
  Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "";

const tomMedarbejder = () => ({
  navn: "", status: "aktiv", ansaettelsesform: "fastansat",
  funktioner: {}, stationeret: "", telefon: "", email: "",
  ansatIso: "", fratraadtIso: "",
});

const fraPerson = (p) => ({
  ...tomMedarbejder(),
  navn: p.navn ?? "", status: p.status ?? "aktiv",
  ansaettelsesform: p.ansaettelsesform ?? "fastansat",
  funktioner: { ...(p.funktioner || {}) },
  stationeret: p.stationeret ?? "", telefon: p.telefon ?? "", email: p.email ?? "",
  ansatIso: isoFraMs(p.ansatMs), fratraadtIso: isoFraMs(p.fratraadtMs),
});

/**
 * ⚠ PERSONEN ER IKKE ET LOGIN.
 *
 * Nøglen her er et personId, ikke et uid. En chauffør har måske aldrig en
 * konto, og en vikar har det sjældent — personen findes før sit login og
 * efter det: kontoen lukkes ved fratrædelse, men en reservation fra tre år
 * siden skal stadig kunne opløses til et navn. Beslutning 18.
 *
 * Formularen sender derfor ALDRIG `uid`. Det sættes af den funktion der
 * opretter loginnet, under Opsætning → Brugere & roller.
 */
function Medarbejderformular({ person, sti, paaGemt, paaLuk }) {
  const nyt = !person;
  const [f, saetF] = useState(() => (person ? fraPerson(person) : tomMedarbejder()));
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v }));
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const skiftFunktion = (fn) => {
    saetF((x) => ({ ...x, funktioner: { ...x.funktioner, [fn]: !x.funktioner[fn] } }));
    saetRoert((x) => ({ ...x, funktioner: true }));
    saetSvar(null);
  };

  const fejl = valideMedarbejder(f);
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;
  const erFratraadt = f.status === "fratraadt";

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = person?.id || nyId("pe");
    const r = await gem({
      sti: sti(id), data: byggMedarbejder(f), foer: person || null,
      objekt: "personale", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt(id);
  };

  return (
    <Kort titel={nyt ? "Ny medarbejder" : `Redigér ${person.navn}`}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Opret medarbejder" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="me-navn" label="Navn" kraevet vaerdi={f.navn} saet={saet("navn")}
                fejl={vis("navn")} />
          <Felt id="me-status" label="Status" kraevet vaerdi={f.status} saet={saet("status")}
                fejl={vis("status")}
                valgmuligheder={Object.entries(PERSONALE_STATUS)
                  .map(([v, s]) => ({ vaerdi: v, label: s.label }))} />
          <Felt id="me-form" label="Ansættelsesform" vaerdi={f.ansaettelsesform}
                saet={saet("ansaettelsesform")} fejl={vis("ansaettelsesform")}
                valgmuligheder={Object.entries(ANSAETTELSESFORM)
                  .map(([v, l]) => ({ vaerdi: v, label: l }))} />
        </Feltraekke>

        {/* ⚠ MINDST ÉN FUNKTION. En medarbejder uden funktion kan ikke
            disponeres og tælles ikke i bemandingsplanen — han står i listen
            som en person ingen kan bruge til noget. RTDB kan ikke kræve
            "mindst ét barn", så det her er den eneste kontrol. */}
        <div className={`fc-felt${vis("funktioner") ? " fc-felt-fejl" : ""}`}>
          <label>
            Funktioner
            <span className="fc-felt-kraev" aria-hidden="true"> *</span>
          </label>
          <div className="fc-afkryds">
            {ALLE_FUNKTIONER.map((fn) => (
              <label key={fn} className="fc-afkryds-punkt">
                <input type="checkbox" checked={Boolean(f.funktioner[fn])}
                       onChange={() => skiftFunktion(fn)} />
                <span className="fc-med-ikon"><Ikon navn={ikonFor(fn)} /></span>
                {FUNKTION_LABEL[fn]}
              </label>
            ))}
          </div>
          <span className="fc-felt-hint">
            Flere er tilladt — en mekaniker der også kører, har begge. Hvad han
            må køre, står i <b>kompetencer</b>, hvor det kan udløbe.
          </span>
          {vis("funktioner") && (
            <span className="fc-felt-fejltekst" role="alert">{vis("funktioner")}</span>
          )}
        </div>

        <Feltraekke>
          {/* ⚠ IKKE EN ENUM — hverken her eller i reglerne. Stederne er
              denne kundes, og et nyt depot må ikke kræve en udrulning. */}
          <Felt id="me-sted" label="Stationeret" kraevet vaerdi={f.stationeret}
                saet={saet("stationeret")} fejl={vis("stationeret")}
                hint="Frit stednavn. Bruges til at vise hvor en funktion har folk stående." />
          <Felt id="me-tlf" label="Telefon" vaerdi={f.telefon} saet={saet("telefon")}
                fejl={vis("telefon")} />
          <Felt id="me-mail" label="E-mail" type="email" vaerdi={f.email}
                saet={saet("email")} fejl={vis("email")}
                hint="Kontaktadresse — ikke et login. Loginnet oprettes under Opsætning." />
        </Feltraekke>

        <Feltraekke>
          <Felt id="me-ansat" label="Ansat fra" type="date" vaerdi={f.ansatIso}
                saet={saet("ansatIso")} fejl={vis("ansatIso")} />
          {/* Vises kun når den er relevant — et tomt fratrædelsesfelt på en
              aktiv medarbejder ligner en mangel nogen bør udfylde. */}
          {erFratraadt && (
            <Felt id="me-fratraadt" label="Fratrådt" kraevet type="date"
                  vaerdi={f.fratraadtIso} saet={saet("fratraadtIso")}
                  fejl={vis("fratraadtIso")}
                  hint="Personen slettes ikke — posten bliver stående, fordi der hænger reservationer og indberetninger på id'et." />
          )}
        </Feltraekke>
      </Formular>

      <p className="fc-hint" style={{ marginTop: 14 }}>
        ⚠ <b>Personen er ikke et login.</b> Nøglen her er et <b>personId</b>,
        ikke et uid: en chauffør har måske aldrig en konto, og en vikar har det
        sjældent. Personen findes før sit login og efter det — kontoen lukkes
        ved fratrædelse, men en reservation fra tre år siden skal stadig kunne
        opløses til et navn.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        Der er <b>ingen division</b> på en medarbejder (beslutning 19). Hun er
        defineret ved sine <b>kompetencer</b>, ikke ved en afdeling, og
        reglerne afviser feltet. <b>CPR og privatadresse</b> hører i{" "}
        <code>sensitive/personale</code> bag en egen læseregel — de kan ikke
        skrives herfra.
      </p>
    </Kort>
  );
}

export default function Medarbejdere() {
  /* Ingen `division` herfra: staben er ikke delt, og skærmen skal ikke
     reagere på toggle'en. Se punkt 2 i noten øverst. */
  const { bruger, path } = useFleet();
  const [valgtId, setValgtId] = useState(null);
  /* null = lukket, "ny" = opret, ellers noeglen paa den der redigeres. */
  const [form, setForm] = useState(null);
  const [soeg, setSoeg] = useState("");
  const [funktion, setFunktion] = useState("");
  const [visAlle, setVisAlle] = useState(false);

  /* Server-side filtreres på ét felt: status. Det er indekseret
     (".indexOn": ["uid", "status"]), og `aktiv` er langt det
     almindeligste opslag — man leder efter en medarbejder man kan bruge i
     morgen, ikke efter dem der er gået.

     "Alle" skifter til vindue:"alle" frem for at tilføje et filter, fordi
     useListe kaster hvis man sender både lig og vindue. Skiftet genhenter, og
     det er ærligt: det ER en anden forespørgsel. Søgning og funktion filtreres
     derimod i klienten og koster ingenting.

     division:"alle" er sat EKSPLICIT. Posterne har ingen division, og
     useListe viser divisionsløse rækker i begge toggles — så resultatet ville
     være det samme uden. Men så ville det se ud som om skærmen bare var
     heldig. Her står der at den ikke er delt, fordi staben ikke er det. */
  const {
    data: personale, henter: henterPersonale, fejl: personaleFejl,
    tilstand: personaleTilstand, genindlaes: genindlaesPersonale, afkortet,
  } = useListe("personale", {
    ordnPaa: "status",
    ...(visAlle ? { vindue: "alle" } : { lig: "aktiv" }),
    division: "alle",
    graense: 300,
    sorter: (a, b) => a.navn.localeCompare(b.navn, "da"),
    demo: DEMO_PERSONALE,
    /* Personale er personoplysninger. auditerSom hører på forespørgslen og
       ikke i skærmen — ellers blev den glemt næste gang nogen læser noden.
       Der logges ÉN post med antallet, aldrig rækkerne. Indtil Cloud
       Function'en findes, tælles fejlen og skærmen kører videre; se
       forbeholdet om klientside-læsningslogning i BESLUTNINGER.md. */
    auditerSom: "personale",
  });

  /* Kompetencerne hentes ÉN gang og deles ud på personerne i klienten. Et
     opslag pr. valgt person ville koste en forespørgsel for hvert klik, og
     noden er lille nok til at det ikke betaler sig. Ingen division her heller
     — reglerne afviser feltet på begge noder med .validate: false. */
  const {
    data: kompetencer, henter: henterKompetencer, fejl: kompetenceFejl,
    tilstand: kompetenceTilstand, genindlaes: genindlaesKompetencer,
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
      <Datatilstand tilstand={vaerste(personaleTilstand, kompetenceTilstand)}
                    genprov={genindlaesAlt} />

      {/* Formularen står OVER listen, så man ser den man netop har oprettet.
          `key` nulstiller felterne ved skift mellem personer. */}
      {form && (
        <Medarbejderformular
          key={form}
          person={form === "ny" ? null : personale.find((p) => p.id === form)}
          sti={(id) => path(`personale/${id}`)}
          paaGemt={(id) => {
            /* Listen hentes forfra: den kommer fra basen, ikke fra
               formularen, så skærmen viser hvad der FAKTISK blev gemt. */
            genindlaesPersonale();
            setForm(null);
            setValgtId(id);
          }}
          paaLuk={() => setForm(null)}
        />
      )}

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort
          titel="Medarbejdere"
          handling={
            <Knap
              variant="primaer"
              disabled={!maaSkrive}
              onClick={() => { setForm("ny"); setValgtId(null); }}
              title={
                maaSkrive
                  ? "Opret en medarbejder."
                  : "Kræver personale.skriv, som kun admin har — serveren afviser."
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
                : "Ingen medarbejdere oprettet endnu."
            }
          />

          <p className="fc-hint" style={{ marginTop: 12 }}>
            Viser {num(viste.length)} af {num(personale.length)} hentede{" "}
            {visAlle ? "medarbejdere" : "aktive medarbejdere"}. Listen er <b>ikke</b> delt
            på Gods/Bus: en medarbejder har ingen division, men er defineret ved sine
            kompetencer, og hun virker i alle moduler tenanten har adgang til. Toggle'en
            i toppen ændrer derfor ikke denne tabel.
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
