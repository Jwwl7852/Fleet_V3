import { useEffect, useMemo, useState } from "react";
import { gemVidenspost, hentSalgsplatform } from "../../fleet/ejer-salgsindbakke.js";
import { Dialog } from "../../fleet/ui.jsx";
import EjerIkon from "./EjerIkon.jsx";

const STATUS = {
  tilgaengelig: "Tilgængelig",
  under_udvikling: "Under udvikling",
  saerskilt_aftale: "Kræver særskilt aftale",
};
const tom = { titel: "", indhold: "", kilde: "", leveringsstatus: "tilgaengelig", godkendt: false };

export default function EjerVidensbaseDesignV2() {
  const [data, setData] = useState({});
  const [valgt, setValgt] = useState(null);
  const [fane, setFane] = useState("godkendt");
  const [soeg, setSoeg] = useState("");
  const [form, setForm] = useState(null);
  const [udgangspunkt, setUdgangspunkt] = useState(null);
  const [besked, setBesked] = useState("");

  const hent = async () => setData((await hentSalgsplatform()).viden || {});
  useEffect(() => { hent(); }, []);

  const alle = useMemo(() => Object.entries(data)
    .map(([id, v]) => ({ id, ...v }))
    .filter((x) => `${x.titel} ${x.indhold} ${x.kilde}`.toLowerCase().includes(soeg.toLowerCase()))
    .filter((x) => (fane === "historik" || fane === "godkendt" ? x.godkendt : x.godkendt !== true))
    .sort((a, b) => (b.opdateretMs || 0) - (a.opdateretMs || 0)), [data, soeg, fane]);

  useEffect(() => { if (!valgt && alle[0]) setValgt(alle[0]); }, [alle, valgt]);

  const rediger = (v) => {
    const nyForm = {
      titel: v?.titel || "", indhold: v?.indhold || "", kilde: v?.kilde || "",
      leveringsstatus: v?.leveringsstatus || "tilgaengelig", godkendt: v?.godkendt === true,
      id: v?.id, revision: v?.revision || 0,
    };
    setForm(nyForm);
    setUdgangspunkt(JSON.stringify(nyForm));
  };

  const gem = async () => {
    const r = await gemVidenspost({ ...form, id: form.id, forventetRevision: form.revision });
    setBesked(r.ok ? "Den nye, låste version er gemt." : r.besked);
    if (r.ok) { setForm(null); setUdgangspunkt(null); setValgt(null); await hent(); }
  };
  const lukForm = () => { setForm(null); setUdgangspunkt(null); };
  const ugemte = Boolean(form && JSON.stringify(form) !== udgangspunkt);

  return <div className="ejer-viden-design">
    <section className="ejer-design-kort ejer-viden-liste">
      <div className="ejer-viden-tools">
        <label><EjerIkon navn="search" size={21}/><input placeholder="Søg i beskrivelser og standardtekster..." value={soeg} onChange={(e) => setSoeg(e.target.value)}/></label>
        <button type="button" className="ejer-primaer" onClick={() => rediger(tom)}><EjerIkon navn="plus" size={19}/>Ny tekst</button>
        <button type="button" onClick={() => setBesked("Dokumentimport er ikke tilsluttet. Opret teksten manuelt og angiv en tydelig kilde.")}><EjerIkon navn="document" size={19}/>Tilføj dokument</button>
      </div>
      <div className="ejer-tabs">{[["godkendt", "Godkendt"], ["kladder", "Kladder"], ["historik", "Versionshistorik"]].map(([id, titel]) => <button type="button" className={fane === id ? "aktiv" : ""} onClick={() => { setFane(id); setValgt(null); }} key={id}>{titel}</button>)}</div>
      <table><thead><tr><th>Emne</th><th>Type</th><th>Status</th><th>Version</th><th>Ansvarlig</th><th/></tr></thead>
        <tbody>{alle.map((v) => <tr className={valgt?.id === v.id ? "aktiv" : ""} key={v.id} onClick={() => setValgt(v)}><td><b>{v.titel}</b></td><td>{v.type || "Modul"}</td><td><span className={v.godkendt ? "ok" : "warn"}>{v.godkendt ? "Godkendt" : "Kladde"}</span></td><td>v{v.aktuelVersion || 1}</td><td>{v.ansvarligNavn || "Dennis"}</td><td>›</td></tr>)}</tbody>
      </table>
    </section>
    <aside className="ejer-design-kort ejer-viden-detalje">{valgt ? <>
      <header><h2>{valgt.titel}</h2><span className={valgt.godkendt ? "ok" : "warn"}>{valgt.godkendt ? "Godkendt" : "Kladde"}</span></header>
      <dl><dt>Type</dt><dd>{valgt.type || "Modul"}</dd><dt>Version</dt><dd>{valgt.aktuelVersion || 1}</dd><dt>Tilgængelighed</dt><dd>{STATUS[valgt.leveringsstatus] || valgt.leveringsstatus}</dd><dt>Godkendt til AI-brug</dt><dd>{valgt.godkendt ? "Ja" : "Nej"}</dd><dt>Kilde</dt><dd>{valgt.kilde}</dd><dt>Ansvarlig</dt><dd>{valgt.ansvarligNavn || "Dennis Christensen"}</dd></dl>
      <hr/><h3>Godkendt tekst</h3><p className="ejer-videntekst">{valgt.indhold}</p>
      <p className="ejer-viden-advarsel"><b>Under udvikling må ikke beskrives som leveringsklart</b><span>Funktioner med denne status må ikke beskrives som tilgængelige i tilbud eller kundedialog.</span></p>
      <p className="ejer-infoboks"><EjerIkon navn="info" size={19}/><span><b>Kundeoplysninger bliver på den enkelte sag</b><br/>Vidensbasen indeholder kun generelle beskrivelser og standardtekster.</span></p>
      <div className="ejer-viden-actions"><button type="button" className="ejer-primaer" onClick={() => rediger(valgt)}><EjerIkon navn="pencil" size={18}/>Redigér som ny version</button><button type="button" onClick={() => setFane("historik")}><EjerIkon navn="clock" size={18}/>Se historik</button></div>
    </> : <p>Vælg en videnspost.</p>}</aside>
    {form && <Dialog titel={form.id ? "Redigér som ny version" : "Ny videnspost"} onLuk={lukForm} ugemte={ugemte} bred>
      <form className="ejer-viden-form" onSubmit={(e) => { e.preventDefault(); gem(); }}>
        <label>Titel<input value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })}/></label>
        <label>Godkendt tekst<textarea value={form.indhold} onChange={(e) => setForm({ ...form, indhold: e.target.value })}/></label>
        <label>Kilde<input value={form.kilde} onChange={(e) => setForm({ ...form, kilde: e.target.value })}/></label>
        <label>Leveringsstatus<select value={form.leveringsstatus} onChange={(e) => setForm({ ...form, leveringsstatus: e.target.value })}>{Object.entries(STATUS).map(([v, titel]) => <option value={v} key={v}>{titel}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={form.godkendt} onChange={(e) => setForm({ ...form, godkendt: e.target.checked })}/>Godkend denne version til AI-brug</label>
        <div className="fc-formular-knapper"><button type="button" onClick={lukForm}>Annullér</button><button type="submit" className="ejer-primaer" disabled={!form.titel || !form.indhold || !form.kilde}>Gem version</button></div>
      </form>
    </Dialog>}
    {besked && <p className="ejer-integrationbesked" role="status">{besked}</p>}
  </div>;
}
