import { useEffect, useMemo, useState } from "react";
import { afsendSalgsopfoelgning, godkendSalgsopfoelgning, hentSalgsplatform, saetSalgsopfoelgningStatus } from "../../fleet/ejer-salgsindbakke.js";
import EjerIkon from "./EjerIkon.jsx";

const liste = (o) => Object.entries(o || {}).map(([id, v]) => ({ id, ...v }));
const kortDato = (ms) => ms ? new Date(ms).toLocaleDateString("da-DK") : "—";
const egetNavn = (bruger) => bruger?.displayName || (bruger?.navn && !bruger.navn.includes("@") ? bruger.navn : "Dennis");
const ejerNavn = (uid, bruger) => uid === bruger?.uid ? egetNavn(bruger) : uid ? "Jørn" : "Ikke fordelt";

export default function EjerOpfoelgninger({ bruger }) {
  const [data, setData] = useState(null); const [valgt, setValgt] = useState(""); const [fane, setFane] = useState("klar");
  const [arbejder, setArbejder] = useState(false); const [besked, setBesked] = useState(""); const [udsaetTil, setUdsaetTil] = useState(""); const [omfang, setOmfang] = useState("mine");
  const hent = async () => setData(await hentSalgsplatform());
  useEffect(() => { hent(); }, []);
  const poster = useMemo(() => liste(data?.traade).flatMap((t) => liste(t.opfoelgninger).map((o) => ({ ...o, traadId: t.id, traad: t, virksomhed: t.virksomhedsnavn || t.kontaktNavn || t.senesteFra || "Ukendt kunde" }))).sort((a,b)=>(b.opdateretMs||0)-(a.opdateretMs||0)), [data]);
  const grupper = { klar: poster.filter((o) => ["kladde","godkendt","ikke_tilsluttet","fejlet"].includes(o.status)), udskudt: poster.filter((o)=>o.status==="udskudt"), pauset: poster.filter((o)=>["pauset","annulleret"].includes(o.status)) };
  const viste = (grupper[fane] || []).filter((o) => omfang === "delte" || o.traad?.ansvarligUid === bruger?.uid); const aktuel = poster.find((o) => o.id === valgt) || viste[0];
  useEffect(() => { if (viste.length && !viste.some((x)=>x.id===valgt)) setValgt(viste[0].id); }, [fane, data, omfang]);
  const koer = async (handling) => { setArbejder(true); setBesked(""); const r = await handling(); setArbejder(false); setBesked(r.ok ? "Handlingen er registreret." : r.besked || "Handlingen kunne ikke gennemføres."); await hent(); return r; };
  const godkendOgSend = async () => {
    if (!aktuel) return; setArbejder(true); setBesked(""); let revision = aktuel.revision;
    if (aktuel.status !== "godkendt") { const g = await godkendSalgsopfoelgning({ traadId: aktuel.traadId, id: aktuel.id, forventetRevision: revision }); if (!g.ok) { setArbejder(false); setBesked(g.besked); return; } revision = g.data.revision; }
    const r = await afsendSalgsopfoelgning({ traadId: aktuel.traadId, id: aktuel.id, forventetRevision: revision }); setArbejder(false); setBesked(r.ok ? "Afsendelsesprocessen er startet." : r.besked || "Intet blev sendt."); await hent();
  };
  if (!data) return <div className="fc-empty">Henter opfølgningskladder…</div>;
  return <div className="ejer-opfoelgning-side">
    <div className="ejer-segmenter ejer-opfoelgning-omfang"><button type="button" className={omfang==="mine"?"aktiv":""} onClick={()=>setOmfang("mine")}>Mine</button><button type="button" className={omfang==="delte"?"aktiv":""} onClick={()=>setOmfang("delte")}>Alle delte</button><span>Ansvarlig: {omfang === "mine" ? egetNavn(bruger) : "Dennis / Jørn"}</span></div>
    <div className="ejer-tabs ejer-opfoelgning-tabs">{[["klar","Klar til gennemgang"],["udskudt","Udsat"],["pauset","På pause"]].map(([id,label])=><button type="button" className={fane===id?"aktiv":""} key={id} onClick={()=>setFane(id)}>{label}{grupper[id].length ? <b>{grupper[id].length}</b> : null}</button>)}</div>
    <div className="ejer-opfoelgning-layout">
      <aside className="ejer-design-kort ejer-opfoelgning-liste"><h2>{fane === "klar" ? "Klar til gennemgang" : fane === "udskudt" ? "Udsat" : "På pause"} ({viste.length})</h2>{viste.map((o)=><button type="button" className={aktuel?.id===o.id?"aktiv":""} key={o.id} onClick={()=>setValgt(o.id)}><span className="ejer-avatar">{o.virksomhed.slice(0,2).toUpperCase()}</span><span><b>{o.virksomhed}</b><small>{o.traad?.links?.tilbudId ? `Tilbud ${o.traad.links.tilbudId}` : o.emne}</small><em>{o.traad?.status === "afventer_kunden" ? "Ingen registreret kundebesvarelse" : "Kontrollér seneste svar"}</em></span><time>{kortDato(o.forfalderMs)}</time></button>)}{!viste.length&&<p className="ejer-tomlinje">Ingen opfølgninger i denne status.</p>}</aside>
      <section className="ejer-design-kort ejer-opfoelgning-editor">{aktuel ? <><header><h2>Forslag til opfølgningsmail</h2><span><EjerIkon navn="clock" size={18}/> {aktuel.status === "godkendt" ? "Godkendt — klar til send" : "Afventer godkendelse"}</span></header><dl><div><dt>Kunde</dt><dd>{aktuel.virksomhed}</dd></div><div><dt>Tilbud</dt><dd>{aktuel.traad?.links?.tilbudId || "Ikke koblet"}</dd></div><div><dt>Kundeansvarlig</dt><dd>{ejerNavn(aktuel.traad?.ansvarligUid, bruger)}</dd></div></dl><p className="ejer-infoboks"><EjerIkon navn="info" size={18}/> Kundesvar og tilbudsstatus kontrolleres igen umiddelbart før afsendelse.</p><div className="ejer-mailkladde"><small>TESTADAPTER-udkast · ingen ekstern AI · kan redigeres</small><label>Fra<input value="info@veyrosystems.com" readOnly /></label><label>Til<input value={aktuel.til || ""} readOnly /></label><label>Emne<input value={aktuel.emne || ""} readOnly /></label><label>Besked<textarea value={aktuel.tekst || ""} readOnly /></label></div><div className="ejer-opfoelgning-actions"><button type="button" className="ejer-primaer" onClick={godkendOgSend} disabled={arbejder}><EjerIkon navn="send" size={20}/> Godkend og send</button><button type="button" onClick={()=>setBesked("Åbn opfølgningen fra Salgsindbakken for at redigere; ændringer kræver ny godkendelse.")}><EjerIkon navn="pencil" size={19}/> Redigér</button><button type="button" onClick={()=>{const d=new Date(Date.now()+86400000);setUdsaetTil(d.toISOString().slice(0,16));}}><EjerIkon navn="clock" size={19}/> Udsæt</button><button type="button" onClick={()=>koer(()=>saetSalgsopfoelgningStatus({traadId:aktuel.traadId,id:aktuel.id,status:"annulleret",forventetRevision:aktuel.revision}))}><EjerIkon navn="close" size={19}/> Annullér</button></div>{udsaetTil&&<div className="ejer-udsaet"><input type="datetime-local" value={udsaetTil} onChange={(e)=>setUdsaetTil(e.target.value)}/><button type="button" onClick={()=>koer(()=>saetSalgsopfoelgningStatus({traadId:aktuel.traadId,id:aktuel.id,status:"udskudt",forfalderMs:Date.parse(udsaetTil),forventetRevision:aktuel.revision}))}>Bekræft udsættelse</button></div>}{besked&&<p role="status" className="ejer-handlingssvar">{besked}</p>}</> : <p className="ejer-tomlinje">Vælg en opfølgning.</p>}</section>
    </div>
  </div>;
}
