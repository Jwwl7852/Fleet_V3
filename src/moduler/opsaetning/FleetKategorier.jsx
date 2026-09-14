import { useMemo, useState } from "react";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { Datatilstand, Henter, Knap, Kort, Pille } from "../../fleet/ui.jsx";
import { DEFAULT_FLEET_CATEGORIES, fleetCategoryRecord, normalizeFleetCategory, sortFleetCategories, validateFleetCategory } from "../../../fleet-v2/src/data/fleetCategories.js";

const blank = { id: "", name: "", active: true, order: 100, usages: { report: true, cost: true } };
const demoCategories = DEFAULT_FLEET_CATEGORIES.map((item) => ({
  id: item.id, navn: item.name, aktiv: item.active, sortering: item.order,
  brugIndberetning: item.usages.report, brugOmkostning: item.usages.cost,
}));

export default function FleetKategorier() {
  const { bruger, path } = useFleet();
  const mayWrite = harPerm(bruger?.perms, PERM.koeretoejerSkriv);
  const list = useListe("fleetKategorier", { ordnPaa: "sortering", vindue: "alle", graense: 500, demo: demoCategories });
  const categories = useMemo(() => sortFleetCategories(list.data), [list.data]);
  const [editing, setEditing] = useState(blank);
  const [errors, setErrors] = useState({});
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const previous = list.data.find((item) => item.id === editing.id) || null;

  const edit = (category) => { setEditing(normalizeFleetCategory(category)); setErrors({}); setAnswer(null); };
  const create = () => { setEditing({ ...blank, usages: { ...blank.usages }, order: (categories.at(-1)?.order || 0) + 10 }); setErrors({}); setAnswer(null); };
  const save = async (event) => {
    event.preventDefault();
    const found = validateFleetCategory(editing);
    if (Object.keys(found).length) { setErrors(found); return; }
    setBusy(true); setAnswer(null);
    const id = editing.id || nyId("fleet-kategori");
    const data = fleetCategoryRecord({ ...editing, id }, previous, bruger?.uid || "ukendt");
    const result = await gem({ sti: path(`fleetKategorier/${id}`), data, foer: previous, objekt: "fleetKategori", objektId: id, handling: previous ? AUDIT.aendre : AUDIT.opret });
    setBusy(false); setAnswer(result);
    if (result.ok) { setEditing({ ...editing, id }); list.genindlaes(); }
  };
  const toggle = async (category) => {
    if (!mayWrite) return;
    const raw = list.data.find((item) => item.id === category.id);
    const data = fleetCategoryRecord({ ...category, active: !category.active }, raw, bruger?.uid || "ukendt");
    setBusy(true); setAnswer(null);
    const result = await gem({ sti: path(`fleetKategorier/${category.id}`), data, foer: raw, objekt: "fleetKategori", objektId: category.id, handling: AUDIT.tilstandsskift });
    setBusy(false); setAnswer(result); if (result.ok) list.genindlaes();
  };

  if (list.henter) return <Henter tekst="Henter FLEET-kategorier …" />;
  if (list.fejl) return <Datatilstand tilstand={list.tilstand} genprov={list.genindlaes} />;
  return <div className="fc-grid" style={{ gap: 16 }}>
    <Kort titel="FLEET-kategorier" handling={<Knap onClick={create} disabled={!mayWrite}>Ny kategori</Knap>}>
      <p className="fc-hint">Én fælles kategorikilde bruges af både indberetninger og økonomi. En kategori deaktiveres i stedet for at blive slettet, så historiske poster beholder deres reference og navne-snapshot.</p>
      {!mayWrite ? <p className="fc-advarsel">Din rolle kan se kategorierne, men kræver <code>{PERM.koeretoejerSkriv}</code> for at ændre dem.</p> : null}
      <div className="fc-tabel-wrap fleet-category-table-wrap" style={{ marginTop: 12 }}>
        <table className="fc-tabel fleet-category-table">
          <thead><tr><th>Sortering</th><th>Kategori</th><th>Bruges til</th><th>Status</th><th>Handling</th></tr></thead>
          <tbody>{categories.map((category) => <tr key={category.id}>
            <td data-label="Sortering">{category.order}</td>
            <td data-label="Kategori"><b>{category.name}</b><br /><small className="fc-hint">{category.id}</small></td>
            <td data-label="Bruges til">{[category.usages.report && "Indberetninger", category.usages.cost && "Økonomi"].filter(Boolean).join(" · ")}</td>
            <td data-label="Status"><Pille tone={category.active ? "ok" : "neutral"}>{category.active ? "Aktiv" : "Inaktiv"}</Pille></td>
            <td data-label="Handling"><span className="fc-med-ikon"><Knap onClick={() => edit(category)}>Redigér</Knap><Knap onClick={() => toggle(category)} disabled={!mayWrite || busy}>{category.active ? "Deaktivér" : "Genaktivér"}</Knap></span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </Kort>
    <Kort titel={editing.id ? `Redigér ${editing.name}` : "Opret kategori"}>
      <form onSubmit={save} className="fc-form-grid">
        <label className="fc-felt"><span>Navn</span><input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} maxLength="80" />{errors.name ? <small className="fc-fejl">{errors.name}</small> : null}</label>
        <label className="fc-felt"><span>Sortering</span><input type="number" min="0" max="9999" step="1" value={editing.order} onChange={(event) => setEditing({ ...editing, order: Number(event.target.value) })} />{errors.order ? <small className="fc-fejl">{errors.order}</small> : null}</label>
        <fieldset className="fc-felt"><legend>Anvendelse</legend><label><input type="checkbox" checked={editing.usages.report} onChange={(event) => setEditing({ ...editing, usages: { ...editing.usages, report: event.target.checked } })} /> Indberetninger</label><label><input type="checkbox" checked={editing.usages.cost} onChange={(event) => setEditing({ ...editing, usages: { ...editing.usages, cost: event.target.checked } })} /> Økonomi og rapporter</label>{errors.usages ? <small className="fc-fejl">{errors.usages}</small> : null}</fieldset>
        <label className="fc-felt"><span>Status</span><select value={editing.active ? "active" : "inactive"} onChange={(event) => setEditing({ ...editing, active: event.target.value === "active" })}><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></select></label>
        {answer?.besked ? <p className="fc-advarsel" role="status">{answer.besked}</p> : null}
        {answer?.ok ? <p className="fc-succes" role="status">Kategorien er gemt i kundens fælles stamdata.</p> : null}
        <div><Knap type="submit" disabled={!mayWrite || busy}>{busy ? "Gemmer …" : "Gem kategori"}</Knap></div>
      </form>
    </Kort>
  </div>;
}
