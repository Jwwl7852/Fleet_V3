import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { hentEjerMailsignatur } from "../../fleet/ejer-salgsindbakke.js";
import { ejerSupportAdapter } from "../../fleet/ejer-support-adapter.js";
import { supportStatusVisning } from "../../fleet/ejer-support-kontrakt.js";
import { tomMailsignatur } from "../../fleet/ejer-mailsignatur.js";
import EjerIkon from "./EjerIkon.jsx";
import EjerMailV71Samtale from "./EjerMailV71Samtale.jsx";
import "../../fleet/ejer-mail-v7.css";

const liste = (objekt) => Object.entries(objekt || {}).map(([id, post]) => ({ id, ...post }));
const PRIORITET = { lav: "Lav", normal: "Normal", hoej: "Høj", kritisk: "Kritisk" };
const egetNavn = (bruger) => bruger?.displayName || (bruger?.navn && !bruger.navn.includes("@") ? bruger.navn : "Dennis");

export default function EjerSupportV2({ bruger }) {
  const [params, setParams] = useSearchParams(); const listeRef = useRef(null); const aabnerRef = useRef(null); const scrollRef = useRef(0);
  const [data, setData] = useState(null); const [fejl, setFejl] = useState(""); const [besked, setBesked] = useState(""); const [arbejder, setArbejder] = useState(false);
  const [lokaleKladder, setLokaleKladder] = useState({}); const [mailsignatur, setMailsignatur] = useState(tomMailsignatur);
  const [soegning, setSoegning] = useState(""); const [statusfilter, setStatusfilter] = useState("aabne");
  const hent = async () => { try { setFejl(""); setData(await ejerSupportAdapter.hentPlatform()); } catch (aarsag) { setFejl(aarsag?.message || "Support kunne ikke indlæses."); } };
  useEffect(() => { hent(); hentEjerMailsignatur().then((r) => r.ok && setMailsignatur({ ...tomMailsignatur, ...(r.data?.signatur || {}) })); }, []);
  const alleSager = useMemo(() => liste(data?.traade).filter((traad) => traad.sagstype === "support").sort((a, b) => Number(b.senesteAktivitetMs) - Number(a.senesteAktivitetMs) || String(b.id).localeCompare(String(a.id), "da")), [data]);
  const sager = useMemo(() => alleSager.filter((sag) => {
    const status = sag.support?.status || "ny"; const matcherStatus = statusfilter === "alle" || (statusfilter === "aabne" ? !["loest", "lukket"].includes(status) : status === statusfilter);
    const ord = soegning.trim().toLowerCase(); const matcherSoegning = !ord || `${sag.support?.nummer || ""} ${sag.virksomhedsnavn || ""} ${sag.kontaktNavn || ""} ${sag.emne || ""} ${sag.support?.modul || ""}`.toLowerCase().includes(ord);
    return matcherStatus && matcherSoegning;
  }), [alleSager, soegning, statusfilter]);
  const valgtId = params.get("sag") || ""; const valgt = valgtId ? alleSager.find((sag) => sag.id === valgtId) : null;
  const aaben = (id, element) => { scrollRef.current = listeRef.current?.scrollTop || window.scrollY; aabnerRef.current = element; setParams({ sag: id }); };
  const tilbage = (beskidt = false) => { if (beskidt && !window.confirm("Kassér ændringerne i svarudkastet?")) return; setParams({}); requestAnimationFrame(() => requestAnimationFrame(() => { if (listeRef.current) listeRef.current.scrollTop = scrollRef.current; aabnerRef.current?.focus?.(); })); };
  const skiftStatus = async (status) => {
    if (!valgt) return; setArbejder(true); setBesked("");
    const r = await ejerSupportAdapter.opdaterStatus({ traadId: valgt.id, status, type: valgt.support?.type || "andet", prioritet: valgt.support?.prioritet || "normal", modul: valgt.support?.modul || "", fristMs: valgt.support?.fristMs || null, ansvarligUid: valgt.ansvarligUid || bruger.uid, forventetRevision: valgt.revision, kildeAdapter: valgt.kilde?.adapter || "" });
    setArbejder(false); setBesked(r.ok ? `Supportstatus er ændret til ${supportStatusVisning(status, valgt.ansvarligUid || bruger.uid).label}.` : r.besked); await hent();
  };
  if (fejl) return <div className="ejer-design-kort fc-empty"><h2>Support kunne ikke indlæses</h2><p>{fejl}</p><button type="button" className="fc-btn" onClick={hent}>Prøv igen</button></div>;
  if (!data) return <div className="fc-empty">Henter fælles supportsager…</div>;
  if (valgtId && !valgt) return <div className="ejer-design-kort fc-empty"><h2>Sagen kan ikke åbnes</h2><p>Den findes ikke, er ikke en supportsag eller er ikke tilgængelig for denne ejer.</p><button type="button" className="fc-btn" onClick={() => tilbage()}>Tilbage til supportkø</button></div>;
  if (valgt) return <div className="ejer-support-v8-arbejdsrum" data-note-visning="Interne noter · nyeste først">
    <EjerMailV71Samtale valgt={valgt} bruger={bruger} mailsignatur={mailsignatur} hent={hent} params={params} lokaleKladder={lokaleKladder} setLokaleKladder={setLokaleKladder} tilbage={tilbage} supportVisning supportAdapter={ejerSupportAdapter} supportKontroller={{ arbejder, besked, skiftStatus, prioritetLabel: PRIORITET[valgt.support?.prioritet] || "Normal" }}/>
  </div>;
  return <div className="ejer-support-v2 ejer-support-v8">
    <header className="ejer-support-v8-top"><div><h2>Fælles supportkø</h2><p>Én sag, ét fælles arbejdsrum for Dennis og Jørn · syntetiske reviewdata</p></div><span className="ejer-testmaerke"><EjerIkon navn="info" size={15}/> Eksterne AI- og mailtjenester er ikke tilsluttet</span></header>
    <div className="ejer-kpi-ribbon">{[["Kritiske", alleSager.filter((s) => s.support?.prioritet === "kritisk" && !["loest", "lukket"].includes(s.support?.status)).length, "warn"], ["Afventer os", alleSager.filter((s) => ["ny", "triage", "afventer_os"].includes(s.support?.status)).length, "mail"], ["Afventer kunden", alleSager.filter((s) => s.support?.status === "afventer_kunden").length, "clock"], ["Løst", alleSager.filter((s) => s.support?.status === "loest").length, "check"]].map(([label, tal, ikon]) => <div className="ejer-kpi" key={label}><span className="ejer-ikonfelt"><EjerIkon navn={ikon}/></span><p><small>{label}</small><b>{tal}</b></p></div>)}</div>
    <section className="ejer-support-v8-filtre ejer-design-kort"><label className="ejer-mail-soeg"><EjerIkon navn="search" size={19}/><input value={soegning} onChange={(event) => setSoegning(event.target.value)} placeholder="Søg i supportnummer, kunde, emne eller modul"/></label><div className="ejer-segmenter kompakt">{[["aabne", "Åbne"], ["afventer_os", "Afventer os"], ["afventer_kunden", "Afventer kunden"], ["loest", "Løst"], ["alle", "Alle"]].map(([id, label]) => <button type="button" key={id} className={statusfilter === id ? "aktiv" : ""} onClick={() => setStatusfilter(id)}>{label}</button>)}</div></section>
    <section className="ejer-design-kort ejer-support-liste ejer-support-v8-liste" ref={listeRef}><header><span>Support / kunde</span><span>Modul</span><span>Ansvarlig</span><span>Status</span></header>{sager.map((sag) => <button type="button" key={sag.id} onClick={(event) => aaben(sag.id, event.currentTarget)} data-support-id={sag.id}><span><b>{sag.support?.nummer || "Nummer reserveres ved behandling"}</b><strong>{sag.virksomhedsnavn || sag.kontaktNavn || sag.kontaktEmail}</strong><small>{sag.emne}</small></span><span>{sag.support?.modul || "Ukendt"}</span><span>{sag.ansvarligUid === bruger.uid ? egetNavn(bruger) : sag.ansvarligUid ? "Jørn" : "Ikke fordelt"}</span><span className={`fc-pill ${sag.support?.prioritet === "kritisk" ? "error" : ["ny", "triage", "afventer_os"].includes(sag.support?.status) ? "warn" : "info"}`}>{supportStatusVisning(sag.support?.status, sag.ansvarligUid).label}</span></button>)}{!sager.length && <p className="ejer-tomlinje">Ingen supportsager matcher filtrene.</p>}</section>
  </div>;
}
