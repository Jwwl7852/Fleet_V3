import { useEffect, useState } from "react";
import { gemEjerleverandoer, hentEjerleverandoerer } from "../../fleet/ejer-leverandoerer.js";
import EjerIkon from "./EjerIkon.jsx";

export default function EjerLeverandoerer() {
  const tom = { id: "", navn: "", kategori: "", kontakt: "", status: "aktiv", aftaleTil: "", noter: "", revision: 0 };
  const [resultat, setResultat] = useState(null); const [formular, setFormular] = useState(null); const [arbejder, setArbejder] = useState(false); const [besked, setBesked] = useState("");
  const hent = () => hentEjerleverandoerer().then(setResultat);
  useEffect(() => { hent(); }, []);
  if (!resultat) return <div className="fc-empty">Henter Veyros leverandører…</div>;
  if (!resultat.ok) return <div className="fc-empty fc-empty-bad">{resultat.besked}</div>;
  const poster = Object.values(resultat.data?.poster || {});
  const gem = async () => {
    setArbejder(true); setBesked("");
    const svar = await gemEjerleverandoer({ ...formular, id: formular.id || undefined, forventetRevision: formular.revision || 0 });
    setArbejder(false); setBesked(svar.ok ? "Leverandøren er gemt." : svar.besked || "Leverandøren kunne ikke gemmes.");
    if (svar.ok) { setFormular(null); await hent(); }
  };
  return <div className="fc-grid"><p className="ejer-infoboks"><EjerIkon navn="info" size={18}/> Dette er Veyros egne leverandører. Kundernes leverandørkartoteker forbliver i deres egne tenants og blandes ikke ind.</p><section className="ejer-design-kort ejer-leverandoerer"><header><h2>Leverandører og aftaler</h2><div className="fc-actions"><span className="ejer-testmaerke">Syntetiske testdata</span><button type="button" className="fc-btn fc-btn-primary" onClick={() => setFormular(tom)}>Ny leverandør</button></div></header><div className="fc-table-wrap"><table className="fc-table"><thead><tr><th>Leverandør</th><th>Kategori</th><th>Kontakt</th><th>Aftale</th><th>Status</th><th>Handling</th></tr></thead><tbody>{poster.map((p)=><tr key={p.id}><td><b>{p.navn}</b></td><td>{p.kategori}</td><td>{p.kontakt}</td><td>{p.aftaleTil || "Ingen slutdato"}</td><td><span className={`fc-pill ${p.status==='aktiv'?'ok':'info'}`}>{p.status}</span></td><td><button type="button" className="fc-btn" onClick={() => setFormular(p)}>Redigér</button></td></tr>)}</tbody></table></div>{!poster.length&&<p className="ejer-tomlinje">Ingen leverandører registreret.</p>}</section>{formular && <section className="ejer-design-kort ejer-leverandoer-form"><header><h2>{formular.id ? "Redigér leverandør" : "Ny leverandør"}</h2><button type="button" className="fc-btn" onClick={() => setFormular(null)}>Luk</button></header><div className="fc-form-grid">{[["navn","Navn"],["kategori","Kategori"],["kontakt","Kontaktmail","email"],["aftaleTil","Aftale til","date"]].map(([felt,label,type])=><label className="fc-field" key={felt}><span>{label}</span><input type={type || "text"} value={formular[felt] || ""} onChange={(event)=>setFormular((aktuel)=>({...aktuel,[felt]:event.target.value}))}/></label>)}<label className="fc-field"><span>Status</span><select value={formular.status} onChange={(event)=>setFormular((aktuel)=>({...aktuel,status:event.target.value}))}><option value="aktiv">Aktiv</option><option value="pause">Pause</option><option value="afsluttet">Afsluttet</option></select></label><label className="fc-field ejer-leverandoer-noter"><span>Interne noter</span><textarea value={formular.noter || ""} onChange={(event)=>setFormular((aktuel)=>({...aktuel,noter:event.target.value}))}/></label></div><div className="fc-actions"><button type="button" className="fc-btn" onClick={()=>setFormular(null)}>Annullér</button><button type="button" className="fc-btn fc-btn-primary" disabled={arbejder} onClick={gem}>Gem leverandør</button></div></section>}{besked&&<p role="status" className="ejer-handlingssvar">{besked}</p>}</div>;
}
