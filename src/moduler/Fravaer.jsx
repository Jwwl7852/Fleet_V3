/* src/moduler/Fravaer.jsx
 * Ferie & fravær
 *
 * Der findes INGEN mockup for denne skærm. Den er bygget på datamodellen og på
 * reglerne, ikke på en tegning — som Medarbejdere.
 *
 * DET ENE, SKÆRMEN FINDES FOR: en medarbejder der er væk, må ikke kunne
 * disponeres. Fravær skriver en reservation på MEDARBEJDEREN med kilde
 * 'fravaer' og prioritet 30 — højere end booking, lavere end værksted.
 *
 * FASE 0 ER VISNING. Reservationen skrives ikke. Panelet viser hvad den VILLE
 * blive, bygget med reservationFraFravaer(), så formen kan efterprøves før den
 * Cloud Function der skal skrive den, findes.
 *
 * FIRE TING DER ER KONTROLLER OG IKKE PYNT:
 *
 *  1. ÅRSAGEN VISES IKKE uden fravaer.sensitiveLaes. Den ligger i
 *     sensitive/fravaer/<id>, og reglerne afviser `art` i general-noden med
 *     .validate: false. Disponenten skal se AT Lars er utilgængelig 14.–18.
 *     juli — ikke hvorfor. Kun admin har permissionen i presettet.
 *
 *     Og det er ALLE årsager der skjules, ikke kun sygdom. Viste vi ferie og
 *     skjulte sygdom, ville et tomt felt betyde sygdom — delvis afsløring
 *     lækker gennem udeladelsen. Kolonnen viser derfor en hængelås på hver
 *     række, ikke kun på nogle.
 *
 *  2. personId, ikke uid og ikke chauffoerId. Og ressourcen hedder
 *     `medarbejder`: en lagermedarbejders ferie blokerer hende lige så meget
 *     som en chaufførs. Filteret er derfor på FUNKTION og ikke på "chauffør".
 *
 *  3. Datoerne vises INKLUSIVT og gemmes EKSKLUSIVT. Et fravær 14.–18. juli
 *     har til = 19. juli kl. 00.00, fordi intervallet er halvåbent. Gemmes den
 *     18., er medarbejderen ledig hele sin sidste sygedag. Skærmen bruger
 *     sidsteDag() og viser begge tal i panelet, så man kan se hvad der faktisk
 *     står i basen.
 *
 *  4. Prioriteten hentes fra reservations.js. "30" tastet ind her ville være
 *     samme regel to steder — den fejl der lå i Bookingopsætnings
 *     divisionsfilter, usynlig indtil den ene kopi drev.
 *
 * INGEN KpiRaekke. Der findes intet fraværsfelt i kpi/, og at tælle rækkerne i
 * den hentede liste og kalde det et nøgletal er præcis det beslutning 6
 * forbyder — listen er et udsnit i en periode, ikke en total.
 * `bemanding.fravaerIDag` hører i KPI-aggregeringen; se KPI-efterslæbet i
 * README. Indtil da står tallet ikke på skærmen som nøgletal.
 *
 * INGEN DIVISION. Reglerne afviser feltet: fraværet hænger på personen, og en
 * chauffør med C+D er ikke syg i gods og rask i bus.
 *
 * UDSKUDT: halve dage. Modellen bærer det — fra og til er millisekunder — men
 * skærmen viser hele dage. At bygge halvdage nu, uden at vide om nogen bruger
 * dem, ville være at gætte på et krav.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../fleet/useListe.js";
import { usePost } from "../fleet/usePost.js";
import { useFleet } from "../fleet/FleetContext.jsx";
import { dato, num } from "../fleet/format.js";
import { harPerm, PERM } from "../fleet/permissions.js";
import {
  ALLE_FUNKTIONER, FUNKTION_LABEL, funktionerAf, harFunktion
} from "../fleet/personale.js";
import {
  FRAVAER_ART, TILSTAND, fravaerTilstand, sidsteDag, varighedDage,
  reservationFraFravaer, fravaerPrioritet, erHelbredsoplysning
} from "../fleet/fravaer.js";
import { KILDE, RESSOURCE, konfliktTekst } from "../fleet/reservations.js";
import { DEMO_PERSONALE } from "../fleet/demo-personale.js";
import { DEMO_FRAVAER, DEMO_FRAVAER_SENSITIVE } from "../fleet/demo-fravaer.js";
import {
  Kort, Tabel, Pille, Henter, Fejl, Datatilstand, Tom, Gitter, MiniLinje, Knap
} from "../fleet/ui.jsx";

/* Perioden vises inklusivt: "14.08.2026 – 18.08.2026" for et fravær der er
   gemt med til = 19.08. Se sidsteDag(). */
const periodeTekst = (f) => `${dato(f.fra)} – ${dato(sidsteDag(f))}`;

export default function Fravaer() {
  const { bruger } = useFleet();
  const [valgtId, setValgtId] = useState(null);
  const [soeg, setSoeg] = useState("");
  const [funktion, setFunktion] = useState("");
  const [visAlle, setVisAlle] = useState(false);
  /* Hvilken post brugeren har bedt om at se årsagen på. Nulstilles ikke ved
     valg af en anden post — sammenligningen med valgtId gør det for os. */
  const [visAarsagFor, setVisAarsagFor] = useState(null);

  const maaSeAarsag = harPerm(bruger?.perms, PERM.fravaerSensitiveLaes);
  const maaSkrive = harPerm(bruger?.perms, PERM.fravaerSkriv);

  /* Server-side filtreres på ét felt: fra. Det er det eneste indekserede
     (".indexOn": ["fra"]).

     vindueDage: et fravær der STARTEDE før perioden men stadig løber, skal
     med — ellers forsvinder en langtidssygemelding fra listen præcis når den
     er mest relevant. Samme greb som maxVarighedDage i hentReservationer():
     hent et vindue der er bredt nok, og stram klientside. 120 dage dækker en
     barselsorlov, som er det længste fravær i praksis.

     division:"alle" står EKSPLICIT. Reglerne afviser feltet på fravaer/, så
     posterne har det ikke, og useListe viser divisionsløse rækker i begge
     toggles. Uden linjen ville det se ud som om skærmen bare var heldig. */
  const { data: fravaer, henter, tilstand, genindlaes, afkortet } = useListe("fravaer", {
    ordnPaa: "fra",
    vindue: visAlle ? "alle" : "fremad",
    fremDage: 180,
    vindueDage: 120,
    division: "alle",
    graense: 300,
    sorter: (a, b) => a.fra - b.fra,
    demo: DEMO_FRAVAER,
    /* Fravær er personoplysninger, også uden årsagen: at Lars var væk i seks
       dage er i sig selv en oplysning om Lars. auditerSom hører på
       forespørgslen og ikke i skærmen — ellers glemmes den. */
    auditerSom: "fravaer"
  });

  const { data: personale, henter: henterPersonale } = useListe("personale", {
    ordnPaa: "status", vindue: "alle", division: "alle",
    demo: DEMO_PERSONALE
  });

  /* ⚠ DET EKSTRA OPSLAG. Årsagen hentes fra sensitive/fravaer/<id> — én post,
     ikke hele noden. Læste vi den med useListe, hentede vi alle personers
     årsager for at vise én, og så var beslutning 17's opdeling meningsløs.

     ⚠ LÆSNINGEN GATES IKKE PÅ maaSeAarsag, OG DET ER MED VILJE.
     Serveren er autoriteten. Spurgte vi kun når frontend mente vi måtte,
     kunne afvisningen aldrig ses — og så var beslutning 26's besked død kode.
     En klients perm-streng kan desuden være forældet: får man en permission,
     skal man ikke vente på en tokenfornyelse for at kunne prøve.

     ⚠ MEN KUN PÅ KLIK. Læste vi ved hver markering, ville fem ud af seks
     roller skrive en adgangNaegtet i auditloggen bare ved at bladre — og en
     sikkerhedslog fuld af ikke-hændelser er værre end ingen. Klikker nogen
     derimod på "Vis årsag" og bliver afvist, ER det en hændelse.

     Kaldet bruger valgtId (state) og ikke det udledte valgt, så hooket står
     før skærmens tidlige return. Hooks må ikke kaldes betinget. */
  const aarsagId = visAarsagFor && visAarsagFor === valgtId ? valgtId : null;
  const {
    post: valgtFoelsom, henter: henterAarsag, tilstand: aarsagTilstand
  } = usePost("sensitive/fravaer", aarsagId, {
    demo: DEMO_FRAVAER_SENSITIVE,
    auditerSom: "fravaerSensitive"
  });

  if (henter || henterPersonale) return <Henter hvad="fravær" />;

  /* Navnet slås op i personale — fraværet gemmer et personId og ikke et navn.
     Gemte det navnet, ville en navneændring efterlade to sandheder. */
  const personEfterId = new Map(personale.map((p) => [p.id, p]));
  const navnPaa = (personId) => personEfterId.get(personId)?.navn || personId;

  const q = soeg.trim().toLowerCase();
  const viste = fravaer.filter((f) => {
    const p = personEfterId.get(f.personId);
    if (funktion && !(p && harFunktion(p, funktion))) return false;
    if (!q) return true;
    return (p?.navn || f.personId).toLowerCase().includes(q);
  });

  const valgt = viste.find((f) => f.id === valgtId) || null;
  const valgtPerson = valgt ? personEfterId.get(valgt.personId) : null;
  /* valgtFoelsom kommer nu fra usePost ovenfor — ét ægte opslag mod
     sensitive/fravaer/<id>, ikke en lokal opslagstabel. */

  /* Hvad reservationen VILLE blive. Bygges, skrives ikke. */
  let reservation = null;
  let reservationFejl = null;
  if (valgt) {
    try { reservation = reservationFraFravaer(valgt); }
    catch (e) { reservationFejl = e.message; }
  }

  const tilstandPille = (f) => {
    const t = TILSTAND[fravaerTilstand(f)];
    return <Pille tone={t.pill}>{t.label}</Pille>;
  };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort
          titel="Ferie & fravær"
          handling={
            <Knap variant="primaer" disabled
                  title={maaSkrive ? "Registrering er ikke bygget endnu."
                                   : "Kræver fravaer.skriv."}>
              Registrér fravær
            </Knap>
          }
        >
          <p className="fc-hint" style={{ marginBottom: 12 }}>
            Et fravær blokerer <b>medarbejderen</b> — ikke kun chauffører. En
            lagermedarbejders ferie skal forhindre at hun disponeres, lige så meget
            som en chaufførs. Perioder vises <b>til og med</b> den sidste dag.
          </p>

          <div className="fc-faner" role="tablist" aria-label="Periode">
            <button type="button" role="tab" className="fc-fane" aria-selected={!visAlle}
                    onClick={() => setVisAlle(false)}>
              Igangværende og kommende
            </button>
            <button type="button" role="tab" className="fc-fane" aria-selected={visAlle}
                    onClick={() => setVisAlle(true)}>
              Alle, inkl. afsluttede
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <div className="fc-felt" style={{ flex: "1 1 240px", marginBottom: 0 }}>
              <label htmlFor="fv-soeg">Søg</label>
              <input id="fv-soeg" type="search" value={soeg} placeholder="Medarbejdernavn"
                     onChange={(e) => setSoeg(e.target.value)} />
            </div>
            <div className="fc-felt" style={{ flex: "0 1 240px", marginBottom: 0 }}>
              <label htmlFor="fv-funktion">Funktion</label>
              <select id="fv-funktion" value={funktion}
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
              { key: "personId", label: "Medarbejder", render: (r) => (
                  <button type="button" className="fc-a"
                          style={{ background: "none", border: 0, padding: 0, cursor: "pointer",
                                   font: "inherit", fontWeight: 650, textAlign: "left" }}
                          aria-pressed={r.id === valgtId}
                          onClick={() => setValgtId(r.id === valgtId ? null : r.id)}>
                    {navnPaa(r.personId)}
                  </button>
                ) },
              { key: "funktioner", label: "Funktion", render: (r) => {
                  const p = personEfterId.get(r.personId);
                  const f = p ? funktionerAf(p) : [];
                  if (!f.length) return <span className="fc-neutral">—</span>;
                  return f.map((k) => (
                    <span key={k} style={{ marginRight: 4 }}>
                      <Pille tone="info">{FUNKTION_LABEL[k]}</Pille>
                    </span>
                  ));
                } },
              { key: "fra", label: "Periode", render: periodeTekst },
              { key: "dage", label: "Dage", num: true, render: (r) => num(varighedDage(r)) },
              { key: "tilstand", label: "Tilstand", render: tilstandPille },
              /* Hængelås på HVER række, ikke kun på sygdom. Viste vi arten på
                 ferie og skjulte den på sygdom, ville låsen selv være svaret. */
              { key: "art", label: "Årsag", render: (r) => {
                  if (!maaSeAarsag) return <span className="fc-neutral">🔒 Skjult</span>;
                  const a = FRAVAER_ART[DEMO_FRAVAER_SENSITIVE[r.id]?.art];
                  return a ? <Pille tone={a.pill}>{a.label}</Pille> : <span className="fc-neutral">—</span>;
                } },
            ]}
            raekker={viste}
            tom={q || funktion ? "Ingen fravær passer på søgningen." : "Intet fravær i perioden."}
          />

          <p className="fc-hint" style={{ marginTop: 12 }}>
            Viser {num(viste.length)} af {num(fravaer.length)} hentede{" "}
            {visAlle ? "fravær" : "igangværende og kommende fravær"}.{" "}
            {!maaSeAarsag && (
              <>Årsagen er skjult på <b>alle</b> rækker — ikke kun på de følsomme.
                Var låsen kun på sygdom, ville låsen være svaret. </>
            )}
            Listen er ikke delt på Gods/Bus: fraværet hænger på personen, og en
            chauffør med C+D er ikke syg i gods og rask i bus.
          </p>
          {afkortet && (
            <p className="fc-hint" style={{ marginTop: 8 }}>
              Der er flere end de 300 hentede. Listen er afkortet — snævr søgningen ind.
            </p>
          )}
        </Kort>

        <div className="fc-grid">
          {!valgt ? (
            <Kort titel="Fravær">
              <Tom>Vælg et navn i listen for at se perioden og den reservation den
                   ville skrive.</Tom>
            </Kort>
          ) : (
            <>
              <Kort titel={navnPaa(valgt.personId)} handling={tilstandPille(valgt)}>
                <MiniLinje label="Periode" vaerdi={<b>{periodeTekst(valgt)}</b>} />
                <MiniLinje label="Varighed" vaerdi={`${num(varighedDage(valgt))} dage`} />
                <MiniLinje
                  label="Funktion"
                  vaerdi={valgtPerson ? funktionerAf(valgtPerson).map((f) => FUNKTION_LABEL[f]).join(", ") || "—" : "—"}
                />
                <MiniLinje label="personId" vaerdi={<code>{valgt.personId}</code>} />

                {/* Både den viste og den gemte grænse. Mennesket siger "til og
                    med den 18."; basen siger "før den 19.". Står kun det ene,
                    gemmer nogen før eller siden den forkerte. */}
                <MiniLinje
                  label="Gemt som"
                  vaerdi={<span className="fc-neutral">
                    fra {dato(valgt.fra)} · til {dato(valgt.til)} (eksklusiv)
                  </span>}
                />
                <p className="fc-hint" style={{ marginTop: 10 }}>
                  Intervallet er <b>halvåbent</b>: [fra, til). Fraværet dækker til og
                  med <b>{dato(sidsteDag(valgt))}</b>. Gemmes sluttidspunktet som den
                  sidste fraværsdag frem for dagen efter, er medarbejderen ledig hele
                  sin sidste dag — og kan disponeres.
                </p>
              </Kort>

              <Kort titel="Årsag">
                {valgtFoelsom ? (
                  <>
                    <MiniLinje
                      label="Art"
                      vaerdi={<Pille tone={FRAVAER_ART[valgtFoelsom.art]?.pill}>
                        {FRAVAER_ART[valgtFoelsom.art]?.label || valgtFoelsom.art}
                      </Pille>}
                    />
                    {valgtFoelsom.note && <MiniLinje label="Note" vaerdi={valgtFoelsom.note} />}
                    <p className="fc-hint" style={{ marginTop: 10 }}>
                      {erHelbredsoplysning(valgtFoelsom.art)
                        ? "Dette er en helbredsoplysning — særlig kategori efter GDPR art. 9."
                        : "Denne art er ikke i sig selv en helbredsoplysning."}{" "}
                      Den ligger alligevel i <b>sensitive/fravaer/{valgt.id}</b> sammen med
                      de øvrige: skjulte vi kun sygdom, ville en synlig ferie og et tomt
                      felt tilsammen fortælle hvem der er syg.
                    </p>
                  </>
                ) : (
                  <>
                    {/* Afvist af reglerne. Beskeden kommer fra <Datatilstand> og
                        siger at det var en AFVISNING — ikke en netværksfejl — og
                        der følger ingen årsag med. Beslutning 26. */}
                    <Datatilstand tilstand={aarsagTilstand} />

                    <p className="fc-hint">
                      🔒 Årsagen ligger i <b>sensitive/fravaer/{valgt.id}</b> og kræver{" "}
                      <b>fravaer.sensitiveLaes</b>, som kun admin har i presettet — hverken
                      disponent eller koordinator. Reglerne afviser desuden <b>art</b> i
                      general-noden med <b>.validate: false</b>, så den kan ikke ende her
                      ved et uheld.
                    </p>

                    {/* ⚠ KNAPPEN VISES TIL ALLE, OGSÅ UDEN fravaer.sensitiveLaes.
                        Skjulte vi den, ville frontend afgøre adgangen, og
                        serverens afvisning ville aldrig kunne ses. Det er hele
                        forskellen på adgangskontrol og en pæn knap. */}
                    <Knap
                      onClick={() => setVisAarsagFor(valgt.id)}
                      disabled={henterAarsag || aarsagId === valgt.id}
                    >
                      {henterAarsag ? "Henter…" : "Vis årsag"}
                    </Knap>

                    <p className="fc-hint" style={{ marginTop: 8 }}>
                      Disponeringen har brug for at vide <b>at</b> medarbejderen er
                      utilgængelig — ikke hvorfor. Det er nok til at planlægge efter.
                    </p>
                  </>
                )}
              </Kort>

              <Kort titel="Reservationen der ville blive skrevet">
                {reservationFejl ? (
                  <Fejl>{reservationFejl}</Fejl>
                ) : (
                  <>
                    <MiniLinje label="Ressource" vaerdi={<code>{reservation.ressourceType}</code>} />
                    <MiniLinje label="Ressource-id" vaerdi={<code>{reservation.ressourceId}</code>} />
                    <MiniLinje label="Kilde" vaerdi={<code>{reservation.kilde.type}</code>} />
                    {/* Fra reservations.js, ikke tastet her. */}
                    <MiniLinje
                      label="Prioritet"
                      vaerdi={<><b>{fravaerPrioritet()}</b> — vinder over booking, taber til værksted</>}
                    />
                    <MiniLinje label="Fra" vaerdi={dato(reservation.fra)} />
                    <MiniLinje label="Til" vaerdi={`${dato(reservation.til)} (eksklusiv)`} />

                    <p className="fc-hint" style={{ marginTop: 12 }}>
                      Ressourcen hedder <b>{RESSOURCE.medarbejder}</b> og ikke "chauffør":
                      en mekaniker tildeles en værkstedsopgave, og en lagermedarbejders
                      ferie skal også blokere. Hed den chauffør, var halvdelen af
                      personalet usynligt for disponeringen.
                    </p>
                    <p className="fc-hint" style={{ marginTop: 8 }}>
                      <b>Hverken navn eller årsag kommer med.</b> Reservationen er synlig
                      for enhver der kan læse reservationsnoden, og den er ikke
                      klassificeret. Lå årsagen i en note, var helbredsoplysningen lækket
                      ud af <b>sensitive/</b> ad bagvejen. Disponenten får denne besked:
                    </p>
                    <p className="fc-hint" style={{ marginTop: 6, fontStyle: "italic" }}>
                      „{konfliktTekst(null, { kilde: { type: KILDE.fravaer } })}“
                    </p>
                    <p className="fc-hint" style={{ marginTop: 12 }}>
                      <b>Reservationen skrives ikke endnu.</b> Konfliktfrihed kan ikke
                      afgøres i klienten — to skrivninger kan ramme samme sekund — så den
                      hører i en Cloud Function sammen med de øvrige. Indtil da er det her
                      en visning af formen, ikke en handling.
                    </p>
                  </>
                )}
              </Kort>
            </>
          )}
        </div>
      </Gitter>

      <p className="fc-hint">
        Fraværet hænger på et <b>personId</b> — ikke på et uid. En chauffør har måske
        aldrig et login, og kontoen kan lukkes ved fratrædelse uden at et fravær fra i
        fjor forsvinder. Personerne kommer fra{" "}
        <Link className="fc-a" to="/opsaetning/medarbejdere">Medarbejdere</Link>, som er
        den ene kilde til staben. Der er endnu intet fraværsfelt i <b>kpi/</b>, så
        tallene ovenfor er "af N hentede" og ikke nøgletal.
      </p>
    </div>
  );
}
