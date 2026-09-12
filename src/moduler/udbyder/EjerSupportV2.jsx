import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { hentSalgsplatform, opdaterSupportsag, opretSalgsnote } from "../../fleet/ejer-salgsindbakke.js";
import EjerIkon from "./EjerIkon.jsx";

const liste = (objekt) => Object.entries(objekt || {}).map(([id, post]) => ({ id, ...post }));
const STATUS = { ny: "Ny", triage: "Skal fordeles", afventer_os: "Afventer os", afventer_kunden: "Afventer kunden", loest: "Løst", lukket: "Lukket" };
const PRIORITET = { lav: "Lav", normal: "Normal", hoej: "Høj", kritisk: "Kritisk" };
const egetNavn = (bruger) => bruger?.displayName || (bruger?.navn && !bruger.navn.includes("@") ? bruger.navn : "Dennis");
const ejerNavn = (uid, bruger) => uid === bruger?.uid ? egetNavn(bruger) : uid ? "Jørn" : "Ikke registreret";
const dato = (ms) => ms ? new Date(ms).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" }) : "Tidspunkt ikke registreret";

export default function EjerSupportV2({ bruger }) {
  const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null); const [valgtId, setValgtId] = useState(""); const [besked, setBesked] = useState(""); const [arbejder, setArbejder] = useState(false);
  const [note, setNote] = useState("");
  const hent = async () => setData(await hentSalgsplatform()); useEffect(() => { hent(); }, []);
  const sager = useMemo(() => liste(data?.traade).filter((t) => t.sagstype === "support").sort((a,b)=>Number(b.senesteAktivitetMs)-Number(a.senesteAktivitetMs)||String(b.id).localeCompare(String(a.id),"da")), [data]);
  const valgt = sager.find((s)=>s.id===(valgtId || params.get("sag"))) || sager[0];
  const noter = useMemo(() => liste(valgt?.noter).sort((a,b)=>Number(b.oprettetMs || 0)-Number(a.oprettetMs || 0)||String(b.id).localeCompare(String(a.id),"da")), [valgt?.noter]);
  useEffect(() => { if (valgt?.id && params.get("sag") !== valgt.id) setParams({ sag: valgt.id }, { replace: true }); }, [valgt?.id]);
  const gem = async (status) => { if (!valgt) return; setArbejder(true); const r = await opdaterSupportsag({ traadId: valgt.id, status, type: valgt.support?.type || "andet", prioritet: valgt.support?.prioritet || "normal", modul: valgt.support?.modul || "", fristMs: valgt.support?.fristMs || null, ansvarligUid: valgt.ansvarligUid || bruger.uid, forventetRevision: valgt.revision }); setArbejder(false); setBesked(r.ok ? "Supportsagen er opdateret." : r.besked); await hent(); };
  const gemNote = async () => { if (!valgt || !note.trim()) return; setArbejder(true); const r = await opretSalgsnote({ traadId: valgt.id, tekst: note }); setArbejder(false); setBesked(r.ok ? "Den interne note er gemt og sendes ikke til kunden." : r.besked); if (r.ok) setNote(""); await hent(); };
  if (!data) return <div className="fc-empty">Henter supportsager…</div>;
  return <div className="ejer-support-v2">
    <div className="ejer-kpi-ribbon">
      {[['Kritiske',sager.filter(s=>s.support?.prioritet==='kritisk').length,'warn'],['Afventer os',sager.filter(s=>['ny','triage','afventer_os'].includes(s.support?.status)).length,'mail'],['Afventer kunden',sager.filter(s=>s.support?.status==='afventer_kunden').length,'clock'],['Løst',sager.filter(s=>s.support?.status==='loest').length,'check']].map(([label,tal,ikon])=><div className="ejer-kpi" key={label}><span className="ejer-ikonfelt"><EjerIkon navn={ikon}/></span><p><small>{label}</small><b>{tal}</b></p></div>)}
    </div>
    <div className="ejer-support-layout">
      <section className="ejer-design-kort ejer-support-liste"><h2>Fælles supportkø</h2>{sager.map((s)=><button type="button" className={valgt?.id===s.id?'aktiv':''} key={s.id} onClick={()=>setValgtId(s.id)}><span><b>{s.support?.nummer || "Nummer reserveres ved første behandling"}</b><strong>{s.virksomhedsnavn || s.kontaktNavn || s.kontaktEmail}</strong><small>{s.emne}</small></span><span className={`fc-pill ${s.support?.prioritet==='kritisk'?'error':'info'}`}>{STATUS[s.support?.status] || "Ny"}</span></button>)}</section>
      <section className="ejer-design-kort ejer-support-detalje">{valgt ? <><header><div><small>{valgt.support?.nummer || "Ny supportsag"}</small><h2>{valgt.emne}</h2></div><span className="fc-pill warn">{STATUS[valgt.support?.status] || "Ny"}</span></header><dl><div><dt>Kunde</dt><dd>{valgt.virksomhedsnavn || valgt.kontaktEmail}</dd></div><div><dt>Modul</dt><dd>{valgt.support?.modul || "Ikke afklaret"}</dd></div><div><dt>Ansvarlig</dt><dd>{valgt.ansvarligUid === bruger.uid ? egetNavn(bruger) : valgt.ansvarligUid ? "Jørn" : "Ikke fordelt"}</dd></div><div><dt>Prioritet</dt><dd>{PRIORITET[valgt.support?.prioritet] || "Normal"}</dd></div></dl><div className="ejer-support-mail">{liste(valgt.beskeder).sort((a,b)=>Number(a.sendtMs)-Number(b.sendtMs)).map(m=><article key={m.id}><header><b>{m.fra}</b><time>{new Date(m.sendtMs).toLocaleString('da-DK')}</time></header><p>{m.tekst}</p></article>)}</div><section className="ejer-intern-note"><h3>Intern note</h3><textarea value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Skriv en note til Dennis og Jørn …"/><button className="fc-btn" type="button" onClick={gemNote} disabled={arbejder || !note.trim()}>Gem intern note</button><div className="ejer-support-notehistorik"><h3>Interne noter · nyeste først</h3>{noter.map((n)=><p key={n.id} data-note-id={n.id}><b>{ejerNavn(n.oprettetAf, bruger)}</b> · <time dateTime={n.oprettetMs ? new Date(n.oprettetMs).toISOString() : undefined}>{dato(n.oprettetMs)}</time><br/>{n.tekst}</p>)}{!noter.length&&<p>Ingen interne noter endnu.</p>}</div></section><p className="ejer-infoboks"><EjerIkon navn="info" size={18}/> Eksterne svar kræver konkret menneskelig godkendelse. Interne noter sendes aldrig til kunden.</p><div className="fc-actions"><button className="fc-btn" type="button" onClick={()=>navigate(`/main/mail/indbakker?postkasse=faelles&sag=${encodeURIComponent(valgt.id)}`)}>Åbn mailtråd og svar</button><button className="fc-btn" type="button" disabled={arbejder} onClick={()=>gem('afventer_os')}>Overtag</button><button className="fc-btn" type="button" disabled={arbejder} onClick={()=>gem('afventer_kunden')}>Afventer kunden</button><button className="fc-btn fc-btn-primary" type="button" disabled={arbejder} onClick={()=>gem('loest')}>Markér løst</button></div>{besked&&<p role="status" className="ejer-handlingssvar">{besked}</p>}</> : <p>Ingen supportsager i testgrundlaget.</p>}</section>
    </div>
  </div>;
}
