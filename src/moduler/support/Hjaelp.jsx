/* Kundens fælles Hjælp og support. Serveren afgør identitet og adgang. */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Kort, Knap, Pille } from "../../fleet/ui.jsx";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { demoMode } from "../../firebase.js";
import { opretSupportKundeAdapter } from "../../fleet/support-kunde-adapter.js";
import { SUPPORT_SAMTALE_STATUS } from "../../fleet/support.js";
import JusterbarePaneler from "../../fleet/JusterbarePaneler.jsx";

const GUIDER = [
  ["Find en opgave eller booking", "Brug søgning og filtre i den relevante arbejdsflade. Send ikke uvedkommende driftsdata med til support."],
  ["Ret adgang og roller", "Opsætning → Brugere & roller viser den aktuelle adgang. Support kan ikke give sig selv adgang til jeres data."],
  ["Fakturaer og bilag", "Økonomi → Fakturacenter samler Indbakke, Til kontrol og Kontrollerede."],
];

const MODULER = ["FLEET", "FACILITY", "PLANNING", "FAKTURACENTER", "FÆLLES"];
const statusTone = (status) => status === "loest" ? "ok" : status === "afventerSupport" ? "warn" : "info";
const dato = (ms) => new Date(ms).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" });
const nyId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, "_")}`;

function modulFraSide(side) {
  if (side.startsWith("/fleet-v2")) return "FLEET";
  if (side.startsWith("/facility-v2")) return "FACILITY";
  if (side.startsWith("/planning-v2")) return "PLANNING";
  if (side.startsWith("/oekonomi/fakturacenter")) return "FAKTURACENTER";
  return "FÆLLES";
}

async function lokalVedhaeftning(file) {
  if (!file) return [];
  if (file.size > 1_000_000) throw new Error("Den lokale prototype accepterer højst 1 MB pr. fil.");
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Filen kunne ikke læses lokalt."));
    reader.readAsDataURL(file);
  });
  return [{ id: nyId("fil"), navn: file.name, mime: file.type || "application/octet-stream", stoerrelse: file.size, dataUrl }];
}

function Besked({ besked }) {
  const navn = besked.afsenderType === "kunde" ? "Dig" : besked.afsenderType === "ai" ? "Veyro AI" : "Veyro Support";
  return (
    <article className={`fc-support-besked fc-support-besked-${besked.afsenderType}`}>
      <header><b>{navn}</b><time dateTime={new Date(besked.oprettetMs).toISOString()}>{dato(besked.oprettetMs)}</time></header>
      <p>{besked.tekst}</p>
      {besked.kilde && <small>Kilde: {besked.kilde.titel} · v{besked.kilde.version} · {besked.kilde.kilde}</small>}
      {(besked.vedhaeftninger || []).map((vedhaeftning) => (
        <a key={vedhaeftning.id} className="fc-support-fil" href={vedhaeftning.dataUrl || undefined} download={vedhaeftning.navn}>
          {vedhaeftning.navn} · {Math.ceil(vedhaeftning.stoerrelse / 1024)} KB
        </a>
      ))}
    </article>
  );
}

export default function Hjaelp() {
  const { bruger, tenant, tenantId } = useFleet();
  const [params, setParams] = useSearchParams();
  const adapter = useMemo(() => opretSupportKundeAdapter(bruger), [bruger?.uid, bruger?.tenant, tenantId]);
  const sidsteSide = window.sessionStorage.getItem("veyro:support:seneste-side") || "/";
  const [sager, setSager] = useState([]);
  const [traad, setTraad] = useState(null);
  const [emne, setEmne] = useState("");
  const [problem, setProblem] = useState("");
  const [modul, setModul] = useState(() => modulFraSide(sidsteSide));
  const [svar, setSvar] = useState("");
  const [fil, setFil] = useState(null);
  const [fane, setFane] = useState("chat");
  const [nySamtale, setNySamtale] = useState(false);
  const [arbejder, setArbejder] = useState(false);
  const [fejl, setFejl] = useState("");

  const indlaes = async (sagId = params.get("sag")) => {
    const liste = await adapter.list();
    setSager(liste);
    const id = sagId && liste.some((sag) => sag.id === sagId) ? sagId : liste[0]?.id;
    if (id) {
      const hentet = await adapter.hent(id);
      setTraad(hentet);
      if (params.get("sag") !== id) setParams({ sag: id }, { replace: true });
    } else {
      setTraad(null);
      if (params.has("sag")) setParams({}, { replace: true });
    }
  };

  useEffect(() => { indlaes().catch((e) => setFejl(e.message)); }, [adapter]);
  useEffect(() => {
    const id = params.get("sag");
    if (id && id !== traad?.sag?.id) adapter.hent(id).then(setTraad).catch((e) => setFejl(e.message));
  }, [params]);

  const koer = async (handling) => {
    setArbejder(true); setFejl("");
    try {
      const resultat = await handling();
      await indlaes(resultat?.sag?.id || params.get("sag"));
    }
    catch (e) { setFejl(e.message || "Handlingen kunne ikke gennemføres."); }
    finally { setArbejder(false); }
  };

  const start = () => koer(async () => {
    const vedhaeftninger = demoMode ? await lokalVedhaeftning(fil) : [];
    const resultat = await adapter.start({
      anmodningId: nyId("start"), emne, tekst: problem, vedhaeftninger,
      kontekst: {
        side: sidsteSide, modul, version: "3.0.0", brugerId: bruger.uid,
        tidspunkt: new Date().toISOString(), browser: navigator.userAgent.slice(0, 200),
      },
    });
    setEmne(""); setProblem(""); setFil(null); setTraad(resultat);
    setNySamtale(false);
    setParams({ sag: resultat.sag.id });
    return resultat;
  });

  const send = () => koer(async () => {
    const vedhaeftninger = demoMode ? await lokalVedhaeftning(fil) : [];
    const resultat = await adapter.send({ sagId: traad.sag.id, anmodningId: nyId("besked"), tekst: svar, vedhaeftninger });
    setSvar(""); setFil(null); setTraad(resultat);
    return resultat;
  });

  const vaelg = async (sagId) => {
    setFane("chat"); setNySamtale(false);
    setParams({ sag: sagId }); setFejl("");
    try { setTraad(await adapter.hent(sagId)); } catch (e) { setFejl(e.message); }
  };

  return (
    <div className="fc-support">
      <div className="fc-support-toolbar">
        <nav className="fc-support-faner" role="tablist" aria-label="Hjælp og support">
          {[["chat", "Supportchat"], ["sager", "Mine sager"], ["guider", "Vejledninger"]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={fane === id} onClick={() => setFane(id)}>{label}</button>
          ))}
        </nav>
        <Knap variant="primaer" onClick={() => { setFane("chat"); setNySamtale(true); }}>+ Ny samtale</Knap>
      </div>

      <div className="fc-support-intro" role="note">
        <b>{adapter.lokalPrototype ? "Lokal supportprototype" : "Veyro Support"}</b>
        <span>{adapter.lokalPrototype
          ? "Syntetiske samtaler gemmes kun i denne browsers afgrænsede demo-lager. Ingen ekstern AI eller mail bruges."
          : "Samtaler håndteres via Veyros serverfunktioner. Vedhæftningstransport aktiveres først efter en særskilt sikkerhedsgate."}</span>
      </div>

      {fane === "sager" && <Kort titel="Mine supportsager">
        <div className="fc-support-sagsliste">
          {sager.map((sag) => (
            <button type="button" key={sag.id} onClick={() => vaelg(sag.id)}>
              <span><b>{sag.emne}</b><small>{sag.nummer || "Lokal prototype"} · {sag.modul || "FÆLLES"} · {dato(sag.opdateretMs)}</small></span>
              <Pille tone={statusTone(sag.status)}>{SUPPORT_SAMTALE_STATUS[sag.status] || sag.status}</Pille>
            </button>
          ))}
          {!sager.length && <p className="fc-hint">Du har ingen supportsamtaler endnu.</p>}
        </div>
      </Kort>}

      {fane === "guider" && <Kort titel="Vejledninger">
        <div className="fc-grid">{GUIDER.map(([titel, tekst]) => <section key={titel}><b>{titel}</b><p className="fc-hint">{tekst}</p></section>)}</div>
        <p className="fc-hint">Kan du ikke logge ind, skal du bruge den kontaktvej, I fik ved onboarding. Der vises ikke en ubekræftet supportadresse.</p>
      </Kort>}

      {fane === "chat" && (nySamtale || !traad) && <div className="fc-support-opret">
        <Kort titel="Start en ny supportsamtale">
          <div className="fc-felt"><label htmlFor="support-modul">Modul</label><div className="fc-felt-ind"><select id="support-modul" value={modul} onChange={(e) => setModul(e.target.value)}>{MODULER.map((navn) => <option key={navn}>{navn}</option>)}</select></div></div>
          <div className="fc-felt"><label htmlFor="support-emne">Emne *</label><div className="fc-felt-ind"><input id="support-emne" value={emne} maxLength={140} onChange={(e) => setEmne(e.target.value)} /></div></div>
          <div className="fc-felt"><label htmlFor="support-problem">Beskriv problemet *</label><div className="fc-felt-ind"><textarea id="support-problem" value={problem} maxLength={8000} onChange={(e) => setProblem(e.target.value)} /></div></div>
          <p className="fc-hint">Sendes med: side {sidsteSide}, modul {modul}, version 3.0.0, tidspunkt, browser og dit bruger-id. Ingen feltværdier eller skærmbilleder indsamles automatisk.</p>
          <div className="fc-felt"><label htmlFor="support-fil">Frivillig fil</label><div className="fc-felt-ind"><input id="support-fil" type="file" disabled={!demoMode} accept="image/*,.pdf" onChange={(e) => setFil(e.target.files?.[0] || null)} /></div><span className="fc-felt-hint">{demoMode ? "Højst 1 MB; gemmes kun i dette lokale demo-lager." : "Fælles sikker upload er ikke aktiveret endnu."}</span></div>
          <div className="fc-actions"><Knap variant="primaer" disabled={arbejder || !emne.trim() || !problem.trim()} onClick={start}>Start samtale</Knap>{traad && <Knap onClick={() => setNySamtale(false)}>Annuller</Knap>}</div>
        </Kort>
        <Kort titel="Det følger med sagen">
          <ul className="fc-support-tjek"><li>Din samtale med AI</li><li>Det, du allerede har prøvet</li><li>Frivillige vedhæftninger</li></ul>
        </Kort>
      </div>}

      {fane === "chat" && !nySamtale && traad && <JusterbarePaneler className="fc-support-layout"
        brugerId={bruger?.uid} kontekst={tenantId} skaerm="/support" standard={66} minimum={46} maksimum={74}>
        <main className="fc-support-main">
          <Kort>
            <div className="fc-support-sagshoved"><div><h2>{traad.sag.emne}</h2><span>{traad.sag.nummer || "Lokal prototype"}</span></div><Pille tone={statusTone(traad.sag.status)}>{SUPPORT_SAMTALE_STATUS[traad.sag.status]}</Pille></div>
            <div className="fc-support-traad" aria-live="polite">
              {traad.beskeder.map((besked) => <Besked key={besked.id} besked={besked} />)}
              {traad.sag.status === "afventerSupport" && <div className="fc-support-overdragelse"><b>Din sag er sendt til Veyro Support.</b><span>Samtalen følger med. Du kan tilføje flere oplysninger her.</span></div>}
            </div>
            {traad.sag.status !== "loest" ? <>
              <div className="fc-felt"><label htmlFor="support-svar">Tilføj en besked til sagen</label><div className="fc-felt-ind"><textarea id="support-svar" placeholder="Skriv flere oplysninger til support…" value={svar} maxLength={8000} onChange={(e) => setSvar(e.target.value)} /></div></div>
              <div className="fc-actions">
                <Knap variant="primaer" disabled={arbejder || !svar.trim()} onClick={send}>Send besked</Knap>
                {traad.sag.status === "aiDialog" && <Knap disabled={arbejder} onClick={() => koer(() => adapter.eskaler({ sagId: traad.sag.id, anmodningId: nyId("eskaler") }))}>Kontakt support</Knap>}
                <Knap disabled={arbejder} onClick={() => koer(() => adapter.loes({ sagId: traad.sag.id, anmodningId: nyId("loes") }))}>Det løste problemet</Knap>
              </div>
            </> : <Knap variant="primaer" disabled={arbejder} onClick={() => koer(() => adapter.genaabn({ sagId: traad.sag.id, anmodningId: nyId("genaabn") }))}>Jeg har stadig brug for hjælp</Knap>}
          </Kort>
        </main>

        <aside className="fc-support-side">
          <Kort titel="Din supportsag">
            <dl className="fc-support-detaljer"><div><dt>Sagsnummer</dt><dd>{traad.sag.nummer || "Lokal prototype"}</dd></div><div><dt>Status</dt><dd><Pille tone={statusTone(traad.sag.status)}>{SUPPORT_SAMTALE_STATUS[traad.sag.status]}</Pille></dd></div><div><dt>Virksomhed</dt><dd>{tenant?.navn || tenantId}</dd></div><div><dt>Modul</dt><dd>{traad.sag.modul || "FÆLLES"}</dd></div><div><dt>Kontaktperson</dt><dd>{bruger?.navn || bruger?.email}</dd></div></dl>
          </Kort>
          <Kort titel="Det følger med sagen"><ul className="fc-support-tjek"><li>Din samtale med AI</li><li>Det, du allerede har prøvet</li><li>Vedhæftninger: {traad.beskeder.some((b) => b.vedhaeftninger?.length) ? "ja" : "ingen endnu"}</li></ul></Kort>
          <Kort titel="Hvad sker der nu?"><p>Veyro gennemgår sagen og svarer i den samme samtale. Du behøver ikke starte forfra.</p></Kort>
          <Knap onClick={() => setFane("sager")}>Se mine supportsager →</Knap>
        </aside>
      </JusterbarePaneler>}

      {fejl && <p className="fc-svar fc-svar-fejl" role="alert">{fejl}</p>}
    </div>
  );
}
