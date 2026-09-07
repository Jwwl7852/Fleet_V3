/*
 * Fakturacenter intake v1 — lokal, synlig prototype.
 * Kun syntetiske fixtures og browserlokal tilstand; ingen eksterne kald.
 */
import { useMemo, useRef, useState } from "react";
import {
  accepterForretningsadvarsler,
  behandlLokalePrototypeFiler,
  FAKTURACENTER_SEKTIONER,
  FAKTURAART,
  FAKTURAVINDUE,
  genåbnFaktura,
  INDBAKKE_SEKTION,
  klassificérMailbundleFil,
  KONTROL_STATUS,
  MATCH_OPRINDELSE,
  markérKontrolleret,
  masseKontrollér,
  opdelMailbundleTilKladder,
  skiftFakturavindue,
  TILLADTE_FILENDELSER,
  vælgManuelDestination,
} from "../../fleet/fakturacenter-intake.js";
import {
  DEMO_DESTINATIONER,
  DEMO_FAKTURACENTER_SCENARIER,
  DEMO_KOMMENDE_OPGAVER,
  DEMO_MAILBOX,
  DEMO_NU_MS,
  DEMO_TENANT_ID,
  DEMO_VEYRO_MAIL,
} from "../../fleet/demo-fakturacenter-intake.js";
import FakturacenterWorkspace from "./FakturacenterWorkspace.jsx";
import {
  ArkivPrototypePanel,
  FakturacenterPanelnavigation,
  Filmodtagelse,
  MailForbindelserPanel,
  MasseResultat,
  SektionIntroduktion,
  Sektionsnavigation,
} from "./FakturacenterPrototypeDele.jsx";
import "./FakturacenterIntake.css";

const STATUS_LABEL = {
  [INDBAKKE_SEKTION.indbakke]: "Ny i indbakken",
  [INDBAKKE_SEKTION.behandling]: "Kræver behandling",
  [INDBAKKE_SEKTION.match]: "Match og fordeling",
  [INDBAKKE_SEKTION.kontrol]: "Til kontrol",
  [INDBAKKE_SEKTION.kontrolleret]: "Kontrolleret",
  [INDBAKKE_SEKTION.mail]: "Mail og forbindelser",
  [INDBAKKE_SEKTION.arkiv]: "Arkiveret",
};

const SEKTION_META = Object.freeze({
  [INDBAKKE_SEKTION.indbakke]: {
    eyebrow: "Modtagelse",
    titel: "Ny i indbakken",
    tekst: "Alle nyligt importerede fakturaer vises her med automatisk forslag eller placering. Åbn dokumentet og kontrollér de aflæste oplysninger og matchningen.",
    note: "Fluebenet alene ændrer ingen status. Det markerer kun en synlig faktura til massehandling.",
  },
  [INDBAKKE_SEKTION.behandling]: {
    eyebrow: "Manuel arbejdsliste",
    titel: "Kræver behandling",
    tekst: "Dubletter, ulæselige dokumenter og uafklarede match samles her sammen med flere mulige opgaver, mailbundles og ufuldstændige fordelinger.",
    note: "Se den konkrete blokering, ret eller vælg placeringen, og send først derefter fakturaen videre til kontrol.",
  },
  [INDBAKKE_SEKTION.kontrol]: {
    eyebrow: "Match og struktur",
    titel: "Til kontrol",
    tekst: "Fakturaen har et match eller en færdig fordeling. Kontrollér dokument, aflæste felter, destinationer og advarsler før låsning.",
    note: "Kontrol er ikke betalingsgodkendelse eller bogføring. Den bekræfter match, struktur og omkostningsregistrering.",
  },
  [INDBAKKE_SEKTION.kontrolleret]: {
    eyebrow: "Låst resultat",
    titel: "Kontrollerede",
    tekst: "Låste fakturaer tæller som faktiske omkostninger. Original dokumentreference, match, fordeling og historik kan fortsat ses.",
    note: "Genåbning kræver lokal demo-adgang og en begrundelse og fjerner fakturaen fra den kontrollerede statistik.",
  },
  [INDBAKKE_SEKTION.mail]: {
    eyebrow: "Valgfri opsætning",
    titel: "Mail og forbindelser",
    tekst: "Opsætning · ikke et behandlingstrin. Invoice-mail, unik Veyro-adresse og mailbox-synkronisering er demo og deaktiveret.",
    note: "Ingen mailforbindelse er aktiv, og denne lokale prototype læser eller sender ingen mails.",
  },
  [INDBAKKE_SEKTION.arkiv]: {
    eyebrow: "Fremtidig opbevaring",
    titel: "Arkiv",
    tekst: "Arkivet skal senere give struktureret genfinding af afsluttede fakturaer, dokumentreferencer, match og historik.",
    note: "Permanent opbevaring er ikke implementeret. Denne prototype simulerer ikke et fungerende dokumentarkiv.",
  },
});

function kroner(oere) {
  if (!Number.isSafeInteger(oere)) return "Ikke aflæst";
  return new Intl.NumberFormat("da-DK", {
    style: "currency", currency: "DKK", minimumFractionDigits: 2,
  }).format(oere / 100);
}

function sektionMatcher(scenarie, sektion) {
  if (sektion === INDBAKKE_SEKTION.indbakke) {
    return scenarie.sektion !== INDBAKKE_SEKTION.kontrolleret
      && scenarie.sektion !== INDBAKKE_SEKTION.arkiv;
  }
  if (sektion === INDBAKKE_SEKTION.behandling) {
    return scenarie.sektion === INDBAKKE_SEKTION.behandling
      || scenarie.sektion === INDBAKKE_SEKTION.match;
  }
  return scenarie.sektion === sektion;
}

function erArbejdslisteSektion(sektion) {
  return [INDBAKKE_SEKTION.indbakke, INDBAKKE_SEKTION.behandling,
    INDBAKKE_SEKTION.kontrol, INDBAKKE_SEKTION.kontrolleret].includes(sektion);
}

function kortHash(hash) {
  return hash ? hash.slice(0, 8) + "…" : "—";
}

export default function Fakturacenter() {
  const [sektion, setSektion] = useState(INDBAKKE_SEKTION.indbakke);
  const [scenarier, setScenarier] = useState(() =>
    DEMO_FAKTURACENTER_SCENARIER.map((scenarie) => ({
      ...scenarie,
      faktura: { ...scenarie.faktura },
    })));
  const [valgtId, setValgtId] = useState(DEMO_FAKTURACENTER_SCENARIER[0].id);
  const [valgteTilMasse, setValgteTilMasse] = useState([]);
  const [filter, setFilter] = useState("");
  const [masseResultater, setMasseResultater] = useState([]);
  const [dropAktiv, setDropAktiv] = useState(false);
  const [lokaleFiler, setLokaleFiler] = useState([]);
  const [lokalBesked, setLokalBesked] = useState(null);
  const [begrundelse, setBegrundelse] = useState("");
  const [aktivtPanel, setAktivtPanel] = useState("liste");
  const inputRef = useRef(null);

  const synlige = useMemo(() => scenarier
    .filter((scenarie) => sektionMatcher(scenarie, sektion))
    .filter((scenarie) => {
      const søg = filter.trim().toLocaleLowerCase("da-DK");
      return !søg || `${scenarie.titel} ${scenarie.faktura.fakturanummer || ""}`
        .toLocaleLowerCase("da-DK").includes(søg);
    }), [filter, scenarier, sektion]);
  const valgt = synlige.find((scenarie) => scenarie.id === valgtId) || synlige[0] || null;

  const aktuelleDestinationer = useMemo(() => {
    const prId = new Map(DEMO_DESTINATIONER.map((destination) => [
      `${destination.modul}:${destination.destinationId}`, destination,
    ]));
    for (const scenarie of scenarier) {
      for (const destination of scenarie.match.kandidater || []) {
        prId.set(`${destination.modul}:${destination.destinationId}`, destination);
      }
    }
    return [...prId.values()];
  }, [scenarier]);

  const opdatérScenarie = (id, opdatering) => {
    setScenarier((nuværende) => nuværende.map((scenarie) =>
      scenarie.id === id ? opdatering(scenarie) : scenarie));
  };

  // Lokalt simuleret. En senere serverfunktion skal levere tenant og adgang
  // autoritativt; fakturaens egne felter er aldrig kilde til denne kontekst.
  const handlingskontekst = (ekstra = {}) => ({
    aktuelTenantId: DEMO_TENANT_ID,
    brugerId: "demo-aktuel-bruger",
    tidspunktMs: Date.now(),
    harAdgang: true,
    harModulSkriveadgang: true,
    destinationer: aktuelleDestinationer,
    ...ekstra,
  });

  const rydMassevalg = () => {
    setValgteTilMasse([]);
    setMasseResultater([]);
  };

  const håndtérFiler = async (fileList) => {
    const filer = [...fileList];
    if (!filer.length) return;
    let resultater;
    try {
      resultater = await behandlLokalePrototypeFiler(filer,
        lokaleFiler.map((fil) => fil.sha256).filter(Boolean));
    } catch {
      resultater = filer.map((fil) => ({
        filnavn: fil.name, status: "afvist", fejl: "LOCAL_SHA256_UNAVAILABLE", sha256: null,
      }));
    }
    const medVisning = resultater.map((fil) => ({
      ...fil,
      visning: fil.status === "klar-lokal-prototype"
        ? `${fil.dokumenttype} · ${kortHash(fil.sha256)} · ikke gemt`
        : fil.status === "mulig-dublet"
          ? "Mulig dublet · på hold til manuel kontrol"
          : `Afvist lokalt · ${fil.fejl}`,
    }));
    setLokaleFiler((nuværende) => [...medVisning, ...nuværende].slice(0, 20));
    setLokalBesked(resultater.every((resultat) => resultat.status === "klar-lokal-prototype")
      ? "Filerne blev kun valideret lokalt i browserfanen. Ingen ekstern aflæsning er kørt."
      : "Mindst én fil blev afvist eller sat på dublethold lokalt. Intet er uploadet.");
  };

  const vælgKandidat = (destination) => {
    if (!valgt) return;
    const resultat = vælgManuelDestination(valgt.faktura, destination, handlingskontekst());
    if (!resultat.ok) {
      setLokalBesked(resultat.fejl === "DESTINATION_CLOSED"
        ? "Destinationen er lukket for faktura og skal genåbnes med begrundelse først."
        : `Matchændringen blev afvist: ${resultat.fejl}`);
      return;
    }
    opdatérScenarie(valgt.id, (scenarie) => ({
      ...scenarie,
      sektion: INDBAKKE_SEKTION.kontrol,
      match: {
        ...scenarie.match,
        placering: destination,
        automatiskPlaceret: false,
        oprindelse: MATCH_OPRINDELSE.manuel,
        kontrolstatus: KONTROL_STATUS.tilKontrol,
      },
      faktura: {
        ...resultat.faktura,
        uløsteAdvarsler: (scenarie.faktura.uløsteAdvarsler || [])
          .filter((advarsel) => !advarsel.startsWith("manuel-")),
      },
    }));
    setBegrundelse("");
  };

  const accepterAdvarsler = () => {
    if (!valgt) return;
    const resultat = accepterForretningsadvarsler(valgt.faktura,
      handlingskontekst({ begrundelse }));
    if (!resultat.ok) {
      setLokalBesked(`Advarslen blev ikke accepteret: ${resultat.fejl}`);
      return;
    }
    opdatérScenarie(valgt.id, (scenarie) => ({ ...scenarie, faktura: resultat.faktura }));
    setBegrundelse("");
    setLokalBesked("Forretningsadvarslen blev accepteret i den lokale demo.");
  };

  const kontrollér = () => {
    if (!valgt) return;
    const resultat = markérKontrolleret(valgt.faktura, handlingskontekst());
    if (!resultat.ok) {
      setLokalBesked(`Kan ikke markeres Kontrolleret: ${resultat.blokeringer.join(", ")}`);
      return;
    }
    opdatérScenarie(valgt.id, (scenarie) => ({
      ...scenarie, sektion: INDBAKKE_SEKTION.kontrolleret, faktura: resultat.faktura,
    }));
    setLokalBesked("Fakturaen blev låst og markeret Kontrolleret i den lokale demo.");
  };

  const genåbn = () => {
    if (!valgt) return;
    const resultat = genåbnFaktura(valgt.faktura, handlingskontekst({ begrundelse }));
    if (!resultat.ok) {
      setLokalBesked(`Fakturaen blev ikke genåbnet: ${resultat.fejl}`);
      return;
    }
    opdatérScenarie(valgt.id, (scenarie) => ({
      ...scenarie, sektion: INDBAKKE_SEKTION.match, faktura: resultat.faktura,
    }));
    setBegrundelse("");
    setLokalBesked("Fakturaen blev genåbnet lokalt; statistikken genberegnes af kontrakten.");
  };

  const masseKontrol = () => {
    const fakturaer = scenarier.map((scenarie) => scenarie.faktura);
    const synligeIder = synlige.map((scenarie) => scenarie.faktura.fakturaId);
    const resultat = masseKontrollér(fakturaer, valgteTilMasse,
      () => handlingskontekst(), { synligeIder });
    const prId = new Map(resultat.fakturaer.map((faktura) => [faktura.fakturaId, faktura]));
    setScenarier((nuværende) => nuværende.map((scenarie) => {
      const faktura = prId.get(scenarie.faktura.fakturaId);
      const delresultat = resultat.resultater.find((post) => post.fakturaId === faktura.fakturaId);
      return delresultat?.ok
        ? { ...scenarie, sektion: INDBAKKE_SEKTION.kontrolleret, faktura }
        : { ...scenarie, faktura };
    }));
    const bestået = resultat.resultater.filter((post) => post.ok).length;
    setMasseResultater(resultat.resultater);
    setLokalBesked(`Massekontrol: ${bestået} lykkedes, ${resultat.resultater.length - bestået} afvist.`);
    setValgteTilMasse([]);
  };

  const genåbnDestination = (destination) => {
    if (!valgt) return;
    const resultat = skiftFakturavindue(destination, FAKTURAVINDUE.aaben,
      handlingskontekst({ begrundelse }));
    if (!resultat.ok) {
      setLokalBesked(`Fakturavinduet blev ikke genåbnet: ${resultat.fejl}`);
      return;
    }
    setScenarier((nuværende) => nuværende.map((scenarie) => {
      const harDestination = scenarie.match.kandidater.some((kandidat) =>
        kandidat.destinationId === destination.destinationId
        && kandidat.modul === destination.modul);
      if (!harDestination) return scenarie;
      return {
        ...scenarie,
        match: {
          ...scenarie.match,
          kandidater: scenarie.match.kandidater.map((kandidat) =>
            kandidat.destinationId === destination.destinationId
              && kandidat.modul === destination.modul ? resultat.destination : kandidat),
        },
        faktura: {
          ...scenarie.faktura,
          uløsteAdvarsler: (scenarie.faktura.uløsteAdvarsler || [])
            .filter((advarsel) => advarsel !== "destination-lukket-for-faktura"),
        },
      };
    }));
    setBegrundelse("");
    setLokalBesked("Destinationens fakturavindue blev genåbnet i den lokale prototype.");
  };

  const klassificérMailfil = (filId, rolle) => {
    if (!valgt?.mailbundle) return;
    const resultat = klassificérMailbundleFil(valgt.mailbundle, filId, rolle,
      handlingskontekst());
    if (!resultat.ok) {
      setLokalBesked(`Mailfilen blev ikke klassificeret: ${resultat.fejl}`);
      return;
    }
    opdatérScenarie(valgt.id, (scenarie) => ({
      ...scenarie, mailbundle: resultat.bundle, mailKladder: [],
    }));
  };

  const opdelMailbundle = () => {
    if (!valgt?.mailbundle) return;
    const resultat = opdelMailbundleTilKladder(valgt.mailbundle, handlingskontekst());
    if (!resultat.ok) {
      setLokalBesked(`Mailbundlen blev ikke opdelt: ${resultat.fejl}`);
      return;
    }
    opdatérScenarie(valgt.id, (scenarie) => ({ ...scenarie, mailKladder: resultat.kladder }));
    setLokalBesked(`${resultat.kladder.length} lokal(e) kladde(r) oprettet. Intet er gemt.`);
  };

  const kørBlandetMasseEksempel = () => {
    if (!valgt?.masseEksempel) return;
    const ider = valgt.masseEksempel.map((faktura) => faktura.fakturaId);
    const resultat = masseKontrollér(valgt.masseEksempel, ider,
      () => handlingskontekst(), { synligeIder: ider });
    setMasseResultater(resultat.resultater);
    setLokalBesked("Det syntetiske blandede masseeksempel blev kørt uden lagring.");
  };

  return (
    <div className="fic-shell">
      <section className="fic-demo-banner" aria-label="Prototypeafgrænsning">
        <span className="fic-demo-dot" aria-hidden="true" />
        <div><b>Lokal prototype · kun syntetiske data</b>
          <span>Ingen Firebase, Storage, mail, OCR eller malwaretjeneste kontaktes.</span></div>
        <span className="fic-demo-chip">Etape 1</span>
      </section>

      <header className="fic-hero">
        <div><p className="fic-eyebrow">Dokumenter, match og omkostningsstruktur</p>
          <h1>Fakturacenter</h1>
          <p>Modtag dokumentet, kontrollér de aflæste oplysninger, og placér nettobeløbet
            på den rigtige opgave eller bestilling.</p></div>
        <div className="fic-hero-stats">
          <Stat label="I indbakken" værdi={scenarier.filter((s) => sektionMatcher(s, INDBAKKE_SEKTION.indbakke)).length} />
          <Stat label="Kræver behandling" værdi={scenarier.filter((s) => s.sektion === INDBAKKE_SEKTION.behandling).length} />
          <Stat label="Mine opgaver · demo" værdi={DEMO_KOMMENDE_OPGAVER.mineOpgaver} />
        </div>
      </header>

      <Sektionsnavigation sektioner={FAKTURACENTER_SEKTIONER} aktiv={sektion}
        antalFor={(id) => id === INDBAKKE_SEKTION.mail
          ? 2 : scenarier.filter((scenarie) => sektionMatcher(scenarie, id)).length}
        onSkift={(id) => {
          setSektion(id);
          setFilter("");
          setAktivtPanel("liste");
          rydMassevalg();
        }} />

      <main className="fic-workbench">
        <SektionIntroduktion {...SEKTION_META[sektion]} />

        {lokalBesked && (
          <div className="fic-message" role="status" aria-live="polite">
            {lokalBesked}
            <button type="button" onClick={() => setLokalBesked(null)} aria-label="Luk besked">×</button>
          </div>
        )}

        {sektion === INDBAKKE_SEKTION.mail && (
          <div className="fic-section-viewport fic-section-viewport-mail"
               role="region" aria-label="Mailopsætning · internt scrollområde" tabIndex="0">
            <MailForbindelserPanel veyroMail={DEMO_VEYRO_MAIL} mailbox={DEMO_MAILBOX} />
          </div>
        )}

        {sektion === INDBAKKE_SEKTION.arkiv && (
          <div className="fic-section-viewport fic-section-viewport-archive"
               role="region" aria-label="Arkivprototype · internt scrollområde" tabIndex="0">
            <ArkivPrototypePanel />
          </div>
        )}

        {erArbejdslisteSektion(sektion) && (
          <section className="fic-workspace" data-active-panel={aktivtPanel}>
            <FakturacenterPanelnavigation aktivtPanel={aktivtPanel} onSkift={setAktivtPanel} />
            <aside className="fic-inbox" aria-label={`${STATUS_LABEL[sektion]} · arbejdsliste`}>
          <div className="fic-panel-head">
            <div><span className="fic-kicker">Syntetiske scenarier</span><h2>{STATUS_LABEL[sektion]}</h2></div>
            <span className="fic-count">{synlige.length}</span>
          </div>
          {sektion === INDBAKKE_SEKTION.indbakke && (
            <div className="fic-inbox-intake">
              <Filmodtagelse dropAktiv={dropAktiv} onDropAktiv={setDropAktiv}
                onFiler={håndtérFiler} filer={lokaleFiler} inputRef={inputRef} />
            </div>
          )}
          <label className="fic-filter"><span>Søg i synlig arbejdsliste</span>
            <input value={filter} placeholder="Syntetisk nummer eller titel"
              onChange={(event) => { setFilter(event.target.value); rydMassevalg(); }} /></label>

          <div className="fic-inbox-list" role="region" tabIndex="0"
               aria-label={`Synlige fakturaer · ${STATUS_LABEL[sektion]} · internt scrollområde`}>
            {synlige.length === 0 && <p className="fic-empty">Ingen scenarier i denne sektion.</p>}
            {synlige.map((scenarie) => (
              <article key={scenarie.id}
                className={scenarie.id === valgt?.id ? "fic-invoice fic-invoice-active" : "fic-invoice"}>
                <label className="fic-check" title="Vælg eksplicit til massekontrol">
                  <input type="checkbox" checked={valgteTilMasse.includes(scenarie.faktura.fakturaId)}
                    onChange={(event) => setValgteTilMasse((valgte) => event.target.checked
                      ? [...new Set([...valgte, scenarie.faktura.fakturaId])]
                      : valgte.filter((id) => id !== scenarie.faktura.fakturaId))} />
                  <span className="fic-sr">Vælg {scenarie.titel}</span>
                </label>
                <button type="button" className="fic-invoice-main"
                  aria-pressed={scenarie.id === valgt?.id}
                  aria-label={`Åbn ${scenarie.aflæsning.original.fakturanummer || "ikke aflæst faktura"}: ${scenarie.titel}`}
                  onClick={() => {
                    setValgtId(scenarie.id);
                    setBegrundelse("");
                    setAktivtPanel("dokument");
                    rydMassevalg();
                  }}>
                  <span className="fic-invoice-top"><b>{scenarie.aflæsning.original.fakturanummer || "Ikke aflæst"}</b>
                    <StatusPill sektion={scenarie.sektion} /></span>
                  <span className="fic-invoice-title" title={scenarie.titel}>{scenarie.titel}</span>
                  <span className="fic-invoice-meta">
                    <span className="fic-invoice-supplier"
                      title={scenarie.aflæsning.original.leverandoernavn || "Leverandør ukendt"}>
                      {scenarie.aflæsning.original.leverandoernavn || "Leverandør ukendt"}
                    </span>
                    <span className="fic-invoice-amount">{kroner(scenarie.faktura.nettoOere)}</span>
                  </span>
                </button>
              </article>
            ))}
          </div>

          {valgteTilMasse.length > 0 && (
            <div className="fic-bulk" role="region" aria-label="Massehandling for synlige fakturaer">
              <div><b>{valgteTilMasse.length} valgt{valgteTilMasse.length === 1 ? "" : "e"}</b>
                <span>Kun synlige, aktivt markerede fakturaer behandles.</span></div>
              <div className="fic-bulk-actions">
                <button type="button" className="fic-primary" onClick={masseKontrol}>
                  Markér valgte som kontrolleret
                </button>
                <button type="button" className="fic-secondary" onClick={rydMassevalg}>
                  Ryd valg
                </button>
              </div>
            </div>
          )}
          <MasseResultat resultater={masseResultater} />
            </aside>

            {valgt ? (
              <FakturacenterWorkspace scenarie={valgt} begrundelse={begrundelse}
                aktivtPanel={aktivtPanel}
                setBegrundelse={setBegrundelse} onVælgKandidat={vælgKandidat}
                onAccepterAdvarsler={accepterAdvarsler} onKontrollér={kontrollér}
                onGenåbn={genåbn} onGenåbnDestination={genåbnDestination}
                onKlassificérMailfil={klassificérMailfil} onOpdelMailbundle={opdelMailbundle}
                onKørBlandetMasseEksempel={kørBlandetMasseEksempel} />
            ) : <div className="fic-empty fic-empty-workspace">Vælg en faktura i indbakken.</div>}
          </section>
        )}

        <footer className="fic-coming"><b>Kommende kontrakter</b>
          <span>Menutæller · Mine opgaver · dashboardfrister · in-app-notifikationer</span>
          <span>E-mailpåmindelser: {DEMO_KOMMENDE_OPGAVER.mail}</span></footer>
      </main>
    </div>
  );
}

function StatusPill({ sektion }) {
  return <span className={"fic-status fic-status-" + sektion}>{STATUS_LABEL[sektion]}</span>;
}

function Stat({ label, værdi }) {
  return <div className="fic-stat"><b>{værdi}</b><span>{label}</span></div>;
}

export const FAKTURACENTER_PROTOTYPE = Object.freeze({
  data: "kun-syntetisk",
  eksterneKald: false,
  standardSektion: INDBAKKE_SEKTION.indbakke,
  filendelser: TILLADTE_FILENDELSER,
  markering: "lokal-prototype",
  demoTidspunktMs: DEMO_NU_MS,
  fakturaart: [FAKTURAART.faktura, FAKTURAART.kreditnota],
});
