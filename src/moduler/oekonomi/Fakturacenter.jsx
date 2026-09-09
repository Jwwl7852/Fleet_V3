/*
 * Fakturacenter intake v1 — lokal, synlig prototype.
 * Kun syntetiske fixtures og browserlokal tilstand; ingen eksterne kald.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import {
  accepterForretningsadvarsler,
  behandlLokalePrototypeFiler,
  effektivAflæsning,
  FAKTURACENTER_SEKTIONER,
  FAKTURAART,
  FAKTURAVINDUE,
  genåbnFaktura,
  INDBAKKE_SEKTION,
  klassificérMailbundleFil,
  KONTROL_STATUS,
  kontrolleretOmkostning,
  MATCH_OPRINDELSE,
  markérKontrolleret,
  masseKontrollér,
  opdatérFordeling,
  opdelMailbundleTilKladder,
  retAflæsning,
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
  opretSyntetiskTestfaktura,
} from "../../fleet/demo-fakturacenter-intake.js";
import FakturacenterWorkspace from "./FakturacenterWorkspace.jsx";
import { Dialog } from "../../fleet/ui.jsx";
import {
  ArkivPrototypePanel,
  FakturacenterPanelnavigation,
  Filmodtagelse,
  MailForbindelserPanel,
  MasseResultat,
  PanelSeparator,
} from "./FakturacenterPrototypeDele.jsx";
import {
  afgrænsMassevalg,
  filtrerOgSorterFakturaer,
  gemPanelLayout,
  læsPanelLayout,
  MATCHFILTER,
  MATCHSORTERING,
  nulstilPanelLayout,
  opdaterMassevalg,
  tilpasPanelLayout,
  udledMatchvisning,
} from "./fakturacenter-ui.js";
import "./FakturacenterIntake.css";

const STATUS_LABEL = {
  [INDBAKKE_SEKTION.indbakke]: "Indbakke",
  [INDBAKKE_SEKTION.behandling]: "Kræver behandling",
  [INDBAKKE_SEKTION.match]: "Match og fordeling",
  [INDBAKKE_SEKTION.kontrol]: "Til kontrol",
  [INDBAKKE_SEKTION.kontrolleret]: "Kontrolleret",
  [INDBAKKE_SEKTION.mail]: "Mail og forbindelser",
  [INDBAKKE_SEKTION.arkiv]: "Arkiveret",
};

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

function browserLager() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export default function Fakturacenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const outletContext = useOutletContext();
  const setFakturacenterAntal = outletContext?.setFakturacenterAntal;
  const ønsketSektion = searchParams.get("sektion");
  const sektion = FAKTURACENTER_SEKTIONER.some(({ id }) => id === ønsketSektion)
    ? ønsketSektion : INDBAKKE_SEKTION.indbakke;
  const [scenarier, setScenarier] = useState(() =>
    DEMO_FAKTURACENTER_SCENARIER.map((scenarie) => ({
      ...scenarie,
      faktura: { ...scenarie.faktura },
    })));
  const [valgtId, setValgtId] = useState(DEMO_FAKTURACENTER_SCENARIER[0].id);
  const [valgteTilMasse, setValgteTilMasse] = useState([]);
  const [filter, setFilter] = useState("");
  const [matchfilter, setMatchfilter] = useState(MATCHFILTER.alle);
  const [sortering, setSortering] = useState(MATCHSORTERING.nyeste);
  const [masseResultater, setMasseResultater] = useState([]);
  const [dropAktiv, setDropAktiv] = useState(false);
  const [lokaleFiler, setLokaleFiler] = useState([]);
  const [lokalBesked, setLokalBesked] = useState(null);
  const [begrundelse, setBegrundelse] = useState("");
  const [aktivtPanel, setAktivtPanel] = useState("liste");
  const [modtagAaben, setModtagAaben] = useState(false);
  const [panelLayout, setPanelLayout] = useState(() => læsPanelLayout(browserLager()));
  const [panelTræk, setPanelTræk] = useState(null);
  const inputRef = useRef(null);
  const modtagKnapRef = useRef(null);
  const syntetiskSekvensRef = useRef(0);
  const workspaceRef = useRef(null);
  const panelLayoutRef = useRef(panelLayout);
  const panelTrækRef = useRef(null);

  const sektionsScenarier = useMemo(() => scenarier
    .filter((scenarie) => sektionMatcher(scenarie, sektion)), [scenarier, sektion]);
  const synlige = useMemo(() => filtrerOgSorterFakturaer(sektionsScenarier, {
    søgning: filter,
    matchfilter,
    sortering,
  }), [filter, matchfilter, sektionsScenarier, sortering]);
  const valgt = synlige.find((scenarie) => scenarie.id === valgtId) || synlige[0] || null;
  const synligeFakturaIder = useMemo(() => synlige
    .map((scenarie) => scenarie.faktura.fakturaId), [synlige]);
  const aktiveValgte = useMemo(() => afgrænsMassevalg(
    valgteTilMasse, synligeFakturaIder,
  ), [synligeFakturaIder, valgteTilMasse]);

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
  const kontrolleretNettoOere = useMemo(() =>
    kontrolleretOmkostning(scenarier.map((scenarie) => scenarie.faktura)), [scenarier]);
  const sektionsAntal = useMemo(() => Object.fromEntries(
    FAKTURACENTER_SEKTIONER.map(({ id }) => [id, id === INDBAKKE_SEKTION.mail
      ? [DEMO_VEYRO_MAIL, DEMO_MAILBOX].length
      : scenarier.filter((scenarie) => sektionMatcher(scenarie, id)).length]),
  ), [scenarier]);

  useEffect(() => {
    setFakturacenterAntal?.(sektionsAntal);
  }, [sektionsAntal, setFakturacenterAntal]);

  useEffect(() => {
    setFilter("");
    setMatchfilter(MATCHFILTER.alle);
    setAktivtPanel("liste");
    setValgteTilMasse([]);
    setMasseResultater([]);
  }, [sektion]);

  useEffect(() => {
    if (synlige.length > 0 && !synlige.some((scenarie) => scenarie.id === valgtId)) {
      setValgtId(synlige[0].id);
    }
  }, [synlige, valgtId]);

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry?.contentRect?.width) return;
      const næste = tilpasPanelLayout(panelLayoutRef.current, entry.contentRect.width);
      panelLayoutRef.current = næste;
      setPanelLayout(næste);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!modtagAaben) return undefined;
    const holdFokusIDialog = (event) => {
      if (event.key !== "Tab") return;
      const dialog = document.querySelector(".fic-receive-dialog")?.closest("[role='dialog']");
      if (!dialog) return;
      const fokusfelter = [...dialog.querySelectorAll(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
      )].filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (!fokusfelter.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const første = fokusfelter[0];
      const sidste = fokusfelter.at(-1);
      if (event.shiftKey && (document.activeElement === første || document.activeElement === dialog)) {
        event.preventDefault();
        sidste.focus();
      } else if (!event.shiftKey && document.activeElement === sidste) {
        event.preventDefault();
        første.focus();
      }
    };
    document.addEventListener("keydown", holdFokusIDialog);
    return () => document.removeEventListener("keydown", holdFokusIDialog);
  }, [modtagAaben]);

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

  const rydMassevalg = (besked = null) => {
    if (besked && valgteTilMasse.length > 0) setLokalBesked(besked);
    setValgteTilMasse([]);
    setMasseResultater([]);
  };

  const anvendPanelLayout = (layout) => {
    const næste = tilpasPanelLayout(layout, workspaceRef.current?.getBoundingClientRect().width);
    panelLayoutRef.current = næste;
    setPanelLayout(næste);
    return næste;
  };

  const begyndPaneltræk = (panel, event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panelTrækRef.current = { panel, pointerId: event.pointerId };
    setPanelTræk(panel);
  };

  const flytPanel = (panel, event) => {
    if (panelTrækRef.current?.panel !== panel
      || panelTrækRef.current.pointerId !== event.pointerId) return;
    const reference = panel === "liste"
      ? workspaceRef.current : event.currentTarget.parentElement;
    const rect = reference?.getBoundingClientRect();
    if (!rect?.width) return;
    const procent = ((event.clientX - rect.left) / rect.width) * 100;
    anvendPanelLayout({
      ...panelLayoutRef.current,
      [panel === "liste" ? "listeProcent" : "dokumentProcent"]: procent,
    });
  };

  const afslutPaneltræk = (event) => {
    if (panelTrækRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panelTrækRef.current = null;
    setPanelTræk(null);
    gemPanelLayout(browserLager(), panelLayoutRef.current);
  };

  const håndtérPanelTast = (panel, event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const retning = event.key === "ArrowLeft" ? -1 : 1;
    const trin = event.shiftKey ? 5 : 1;
    const felt = panel === "liste" ? "listeProcent" : "dokumentProcent";
    const næste = anvendPanelLayout({
      ...panelLayoutRef.current,
      [felt]: panelLayoutRef.current[felt] + retning * trin,
    });
    gemPanelLayout(browserLager(), næste);
  };

  const nulstilPanelbredder = () => {
    const næste = anvendPanelLayout(nulstilPanelLayout());
    gemPanelLayout(browserLager(), næste);
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

  const skiftSektion = (id) => {
    const næsteParams = new URLSearchParams(searchParams);
    næsteParams.set("sektion", id);
    setSearchParams(næsteParams);
    rydMassevalg();
  };

  const lukModtagelse = () => {
    setModtagAaben(false);
    requestAnimationFrame(() => modtagKnapRef.current?.focus());
  };

  const indlæsSyntetiskTestfaktura = () => {
    syntetiskSekvensRef.current += 1;
    const resultat = opretSyntetiskTestfaktura({
      sekvens: syntetiskSekvensRef.current,
      modtagetMs: Date.now(),
    });
    if (!resultat.ok) {
      setLokalBesked(`Testsagen kunne ikke indlæses: ${resultat.fejl}`);
      return;
    }
    setScenarier((nuværende) => [resultat.scenarie, ...nuværende]);
    setValgtId(resultat.scenarie.id);
    skiftSektion(INDBAKKE_SEKTION.indbakke);
    setAktivtPanel("dokument");
    rydMassevalg();
    setLokalBesked("En kendt syntetisk testfaktura blev indlæst lokalt med fixturedata. Ingen fil blev aflæst.");
    lukModtagelse();
  };

  const retOplysninger = (ændringer) => {
    if (!valgt) return;
    if (valgt.faktura.låst) {
      setLokalBesked("Den kontrollerede faktura er låst og skal genåbnes før rettelser.");
      return;
    }
    const resultat = retAflæsning(valgt.aflæsning, ændringer, handlingskontekst());
    if (!resultat.ok) {
      setLokalBesked(`Rettelsen blev afvist: ${resultat.fejl}`);
      return;
    }
    const data = effektivAflæsning(resultat.aflæsning);
    opdatérScenarie(valgt.id, (scenarie) => ({
      ...scenarie,
      aflæsning: resultat.aflæsning,
      faktura: {
        ...scenarie.faktura,
        fakturaart: data.fakturaart,
        fakturanummer: data.fakturanummer,
        leverandoerId: data.leverandoerId,
        leverandoernavn: data.leverandoernavn,
        leverandoerCvr: data.leverandoerCvr,
        nettoOere: data.nettoOere,
        momsOere: data.momsOere,
        totalOere: data.totalOere,
        valuta: data.valuta,
        kreditForFakturanummer: data.kreditForFakturanummer,
      },
    }));
    setLokalBesked("De syntetiske oplysninger blev rettet. Den oprindelige aflæsning er bevaret.");
  };

  const fordelHeleNetto = (destinationer) => {
    if (!valgt || !destinationer?.length) return;
    const nettoOere = valgt.faktura.nettoOere;
    if (!Number.isSafeInteger(nettoOere)) {
      setLokalBesked("Nettobeløbet skal være et gyldigt ørebeløb før fordeling.");
      return;
    }
    const grundbeløb = Math.trunc(nettoOere / destinationer.length);
    const rest = nettoOere - grundbeløb * destinationer.length;
    const fordelinger = destinationer.map((destination, index) => ({
      fordelingId: `lokal-${valgt.faktura.fakturaId}-${destination.modul}-${destination.destinationId}`,
      destinationId: destination.destinationId,
      modul: destination.modul,
      nettoOere: grundbeløb + (index === 0 ? rest : 0),
      koststed: destination.koststeder?.[0] || null,
    }));
    const resultat = opdatérFordeling(valgt.faktura, fordelinger, handlingskontekst());
    if (!resultat.ok) {
      setLokalBesked(`Fordelingen blev afvist: ${resultat.fejl}`);
      return;
    }
    opdatérScenarie(valgt.id, (scenarie) => ({
      ...scenarie,
      sektion: resultat.fordeling.ok ? INDBAKKE_SEKTION.kontrol : INDBAKKE_SEKTION.match,
      faktura: resultat.faktura,
    }));
    if (resultat.fordeling.ok) {
      setValgtId(valgt.id);
      skiftSektion(INDBAKKE_SEKTION.kontrol);
      setAktivtPanel("behandling");
    }
    setLokalBesked(resultat.fordeling.ok
      ? "Hele nettobeløbet blev fordelt i den lokale prototype."
      : "Fordelingen er gemt som en ufuldstændig lokal kladde.");
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
    setValgtId(valgt.id);
    skiftSektion(INDBAKKE_SEKTION.kontrol);
    setAktivtPanel("behandling");
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
    setValgtId(valgt.id);
    skiftSektion(INDBAKKE_SEKTION.kontrolleret);
    setAktivtPanel("behandling");
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
    setValgtId(valgt.id);
    skiftSektion(INDBAKKE_SEKTION.behandling);
    setAktivtPanel("behandling");
    setLokalBesked("Fakturaen blev genåbnet lokalt; statistikken genberegnes af kontrakten.");
  };

  const masseKontrol = () => {
    const fakturaer = scenarier.map((scenarie) => scenarie.faktura);
    const resultat = masseKontrollér(fakturaer, aktiveValgte,
      () => handlingskontekst(), { synligeIder: synligeFakturaIder });
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
            på den rigtige opgave eller bestilling. Kontrol er ikke betalingsgodkendelse eller bogføring.</p></div>
        <div className="fic-hero-actions">
          <button ref={modtagKnapRef} type="button" className="fic-primary fic-receive-button"
            onClick={() => setModtagAaben(true)}>Modtag faktura</button>
          <div className="fic-hero-stats">
            <Stat label="I indbakken" værdi={scenarier.filter((s) => sektionMatcher(s, INDBAKKE_SEKTION.indbakke)).length} />
            <Stat label="Kræver behandling" værdi={scenarier.filter((s) => s.sektion === INDBAKKE_SEKTION.behandling).length} />
            <Stat label="Kontrolleret netto · demo" værdi={kroner(kontrolleretNettoOere)} />
          </div>
        </div>
      </header>

      {modtagAaben && (
        <Dialog titel="Modtag faktura" onLuk={lukModtagelse} bred
          under="Vælg mellem lokal filkontrol og en kendt syntetisk testsag.">
          <div className="fic-receive-dialog">
            <Filmodtagelse dropAktiv={dropAktiv} onDropAktiv={setDropAktiv}
              onFiler={håndtérFiler} filer={lokaleFiler} inputRef={inputRef}
              onIndlæsSyntetisk={indlæsSyntetiskTestfaktura} />
          </div>
        </Dialog>
      )}

      <main className="fic-workbench">
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
          <section ref={workspaceRef} className="fic-workspace" data-active-panel={aktivtPanel}
                   data-resizing={panelTræk || undefined}
                   style={{
                     "--fic-list-width": `${panelLayout.listeProcent}%`,
                     "--fic-document-width": `${panelLayout.dokumentProcent}%`,
                   }}>
            <FakturacenterPanelnavigation aktivtPanel={aktivtPanel} onSkift={setAktivtPanel} />
            <aside className="fic-inbox" aria-label={`${STATUS_LABEL[sektion]} · arbejdsliste`}>
          <div className="fic-panel-head">
            <div><span className="fic-kicker">Syntetiske scenarier</span><h2>{STATUS_LABEL[sektion]}</h2></div>
            <div className="fic-panel-head-actions">
              <span className="fic-count">{synlige.length}</span>
              <button type="button" className="fic-panel-reset" onClick={nulstilPanelbredder}
                      aria-label="Nulstil panelbredder" title="Nulstil panelbredder">
                Nulstil
              </button>
            </div>
          </div>
          <div className="fic-list-tools">
            <label className="fic-filter"><span>Søg i synlig arbejdsliste</span>
              <input value={filter} placeholder="Nummer, titel eller leverandør"
                onChange={(event) => {
                  setFilter(event.target.value);
                  rydMassevalg("Valget blev ryddet, fordi søgningen ændrede arbejdsliste-sættet.");
                }} /></label>
            <div className="fic-list-controls">
              <label><span>Matchfilter</span>
                <select value={matchfilter} onChange={(event) => {
                  setMatchfilter(event.target.value);
                  rydMassevalg("Valget blev ryddet, fordi matchfilteret ændrede arbejdsliste-sættet.");
                }}>
                  <option value={MATCHFILTER.alle}>Alle</option>
                  <option value={MATCHFILTER.matchet}>Matchet</option>
                  <option value={MATCHFILTER.vaelg}>Vælg match</option>
                  <option value={MATCHFILTER.mangler}>Mangler match</option>
                  <option value={MATCHFILTER.delvis}>Delvist fordelt</option>
                </select>
              </label>
              <label><span>Sortering</span>
                <select value={sortering} onChange={(event) => setSortering(event.target.value)}>
                  <option value={MATCHSORTERING.nyeste}>Nyeste først</option>
                  <option value={MATCHSORTERING.matchede}>Matchede først</option>
                  <option value={MATCHSORTERING.uafklarede}>Uafklarede først</option>
                </select>
              </label>
            </div>
          </div>

          <div className="fic-inbox-list" role="region" tabIndex="0"
               aria-label={`Synlige fakturaer · ${STATUS_LABEL[sektion]} · internt scrollområde`}>
            {synlige.length === 0 && <p className="fic-empty">Ingen scenarier i denne sektion.</p>}
            {synlige.map((scenarie) => {
              const matchvisning = udledMatchvisning(scenarie);
              return (
              <article key={scenarie.id}
                className={scenarie.id === valgt?.id ? "fic-invoice fic-invoice-active" : "fic-invoice"}>
                <label className="fic-check" title="Vælg eksplicit til massekontrol">
                  <input type="checkbox" checked={aktiveValgte.includes(scenarie.faktura.fakturaId)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setValgteTilMasse((valgte) => opdaterMassevalg(
                      valgte, scenarie.faktura.fakturaId, event.target.checked,
                    ))} />
                  <span className="fic-sr">Vælg {scenarie.titel}</span>
                </label>
                <button type="button" className="fic-invoice-main"
                  aria-pressed={scenarie.id === valgt?.id}
                  aria-label={`Åbn ${scenarie.aflæsning.original.fakturanummer || "ikke aflæst faktura"}: ${scenarie.titel}`}
                  onClick={() => {
                    setValgtId(scenarie.id);
                    setBegrundelse("");
                    setAktivtPanel("dokument");
                  }}>
                  <span className="fic-invoice-top"><b>{scenarie.aflæsning.original.fakturanummer || "Ikke aflæst"}</b>
                    <MatchStatusPill visning={matchvisning} /></span>
                  <span className="fic-invoice-title" title={scenarie.titel}>{scenarie.titel}</span>
                  <span className="fic-invoice-matchline">
                    <span>{matchvisning.forklaring}</span>
                    {matchvisning.problem && (
                      <span className="fic-invoice-problem">{matchvisning.problem.label}</span>
                    )}
                  </span>
                  <span className="fic-invoice-meta">
                    <span className="fic-invoice-supplier"
                      title={scenarie.aflæsning.original.leverandoernavn || "Leverandør ukendt"}>
                      {scenarie.aflæsning.original.leverandoernavn || "Leverandør ukendt"}
                    </span>
                    <span className="fic-invoice-amount">{kroner(scenarie.faktura.nettoOere)}</span>
                  </span>
                </button>
              </article>
              );
            })}
          </div>

          {aktiveValgte.length > 0 && (
            <div className="fic-bulk" role="region" aria-label="Massehandling for synlige fakturaer">
              <div><b>{aktiveValgte.length} valgt{aktiveValgte.length === 1 ? "" : "e"}</b>
                <span>Fluebenet vælger kun til denne massehandling. Kun synlige poster behandles.</span></div>
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

            <PanelSeparator label="Juster bredde mellem fakturaliste og dokument"
              værdi={panelLayout.listeProcent} min={18} maks={40}
              onPointerDown={(event) => begyndPaneltræk("liste", event)}
              onPointerMove={(event) => flytPanel("liste", event)}
              onPointerUp={afslutPaneltræk} onPointerCancel={afslutPaneltræk}
              onKeyDown={(event) => håndtérPanelTast("liste", event)} />

            {valgt ? (
              <FakturacenterWorkspace key={valgt.id} scenarie={valgt} begrundelse={begrundelse}
                aktivtPanel={aktivtPanel}
                panelLayout={panelLayout}
                panelSeparatorHandlers={{
                  onPointerDown: (event) => begyndPaneltræk("dokument", event),
                  onPointerMove: (event) => flytPanel("dokument", event),
                  onPointerUp: afslutPaneltræk,
                  onPointerCancel: afslutPaneltræk,
                  onKeyDown: (event) => håndtérPanelTast("dokument", event),
                }}
                setBegrundelse={setBegrundelse} onVælgKandidat={vælgKandidat}
                onRetOplysninger={retOplysninger}
                onFordelSamlet={() => fordelHeleNetto(valgt.match.placering
                  ? [valgt.match.placering] : [])}
                onFordelLigeligt={() => fordelHeleNetto(valgt.match.kandidater)}
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

function MatchStatusPill({ visning }) {
  return <span className={`fic-match-status fic-match-status-${visning.id}`}>{visning.label}</span>;
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
