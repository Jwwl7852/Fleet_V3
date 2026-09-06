import { useMemo, useState } from "react";
import {
  DUBLETBESLUTNING, DUBLETTYPE, IMPORTKILDE, IMPORTTRIN, INTAKESTATUS, KOLONNEFELTER, STOPTYPE,
  afvisOpgave, beslutDublet, findDubletter, foreslaaKolonnemapping, genaabnOpgave,
  godkendImportbatch, godkendOpgave, opretImportbatch, opretIntakeOpgave,
  opretOpgaveFraImportRaekke, parseCsv, parseIndsatTabel, sendTilDagsplan,
} from "../planning-input/index.js";
import { DEMO_IMPORTTID_MS, opretDemoIntakeData } from "../planning-input/demo-planning-input.js";
import {
  FOTOKATEGORI, MODTAGERMETODE, SPOERGSMAALTYPE, UDFOERELSESSKABELONSTATUS,
  deaktiverUdfoerelsesskabelon, mobilFlowForStop, opretNySkabelonVersion,
  opretUdfoerelsesskabelon, redigerUdfoerelsesskabelon,
} from "../planning-execution/index.js";

const STATUSNAVN = { MODTAGET: "Modtaget", KRAEVER_KONTROL: "Kræver kontrol", KLAR_TIL_PLANLAEGNING: "Klar til planlægning", AFVIST: "Afvist" };
const TIDSFORMER = ["Fast tidspunkt", "Tidsvindue", "Deadline", "Frit tidspunkt"];
const IMPORTTRINNAVNE = ["Vælg kilde", "Rå data", "Match kolonner", "Validér", "Fejl og dubletter", "Godkend"];
const klon = (vaerdi) => JSON.parse(JSON.stringify(vaerdi));

function Status({ status }) {
  return <span className="pu-badge" data-tone={status === INTAKESTATUS.KLAR_TIL_PLANLAEGNING ? "ok" : status === INTAKESTATUS.KRAEVER_KONTROL ? "warn" : status === INTAKESTATUS.AFVIST ? "bad" : "neutral"}>{STATUSNAVN[status]}</span>;
}

function StopForm({ stop, onChange, onRemove, index }) {
  const set = (felt, vaerdi) => onChange({ ...stop, [felt]: vaerdi });
  return <fieldset className="pi-stop-form"><legend>Stop {index + 1}</legend>
    <div className="pi-form-grid">
      <label>Stoptype<select value={stop.stoptype} onChange={(e) => set("stoptype", e.target.value)}>{Object.values(STOPTYPE).map((v) => <option key={v}>{v}</option>)}</select></label>
      <label>Navn<input value={stop.navn} onChange={(e) => set("navn", e.target.value)} /></label>
      <label className="pi-span-2">Adresse<input value={stop.adresse} onChange={(e) => set("adresse", e.target.value)} /></label>
      <label>Postnummer<input value={stop.postnummer} onChange={(e) => set("postnummer", e.target.value)} /></label>
      <label>By<input value={stop.by} onChange={(e) => set("by", e.target.value)} /></label>
      <label>Land<input value={stop.land} onChange={(e) => set("land", e.target.value)} /></label>
      <label>Dato<input value={stop.dato} onChange={(e) => set("dato", e.target.value)} /></label>
      <label>Tidsform<select value={stop.tidsform} onChange={(e) => set("tidsform", e.target.value)}>{TIDSFORMER.map((v) => <option key={v}>{v}</option>)}</select></label>
      {stop.tidsform === "Fast tidspunkt" && <label>Fast tid<input type="time" value={stop.fastTid} onChange={(e) => set("fastTid", e.target.value)} /></label>}
      {stop.tidsform === "Tidsvindue" && <><label>Fra<input type="time" value={stop.vindueFra} onChange={(e) => set("vindueFra", e.target.value)} /></label><label>Til<input type="time" value={stop.vindueTil} onChange={(e) => set("vindueTil", e.target.value)} /></label></>}
      {stop.tidsform === "Deadline" && <label>Deadline<input type="time" value={stop.deadline} onChange={(e) => set("deadline", e.target.value)} /></label>}
      <label>Stopvarighed<input value={stop.varighed} onChange={(e) => set("varighed", e.target.value)} placeholder="30 min" /></label>
    </div>
    {onRemove && <button type="button" className="pu-btn pu-btn-quiet" onClick={onRemove}>Fjern stop</button>}
  </fieldset>;
}

function ManuelDialog({ skabeloner, materialer, onClose, onSave }) {
  const tomtStop = () => ({ stoptype: STOPTYPE.BESOEG, navn: "", adresse: "", postnummer: "0000", by: "Demoby", land: "DK", dato: "18-05-2032", tidsform: "Frit tidspunkt", fastTid: "", vindueFra: "", vindueTil: "", deadline: "", varighed: "" });
  const [form, setForm] = useState({ eksternReference: "", navn: "", kunde: "Demo-modtager", prioritet: "NORMAL", rutetype: "Service", medarbejderRef: "", koeretoejRef: "", skabelonId: "", stop: [tomtStop()] });
  const gem = () => {
    let nummer = 0;
    const skabelon = skabeloner.find((post) => post.id === form.skabelonId) || null;
    const opgave = opretIntakeOpgave(form, { tenantRef: "tenant-fiktiv-ui-demo", kilde: IMPORTKILDE.MANUEL, importeretMs: DEMO_IMPORTTID_MS + 120000, idGenerator: (p) => `manuel-${p}-${++nummer}`, kendteRessourcer: [{ id: "med-demo-1" }, { id: "bil-demo-1" }], udfoerelsesskabelon: skabelon, materialer });
    onSave(opgave);
  };
  return <div className="pu-overlay" role="presentation"><section className="pu-modal pi-large-modal" role="dialog" aria-modal="true" aria-labelledby="manuel-titel">
    <div className="pu-drawer-head"><div><span className="pu-eyebrow">Samme validering som import</span><h2 id="manuel-titel">Opret opgave</h2></div><button className="pu-btn pu-btn-quiet" type="button" onClick={onClose}>Luk</button></div>
    <div className="pi-form-grid"><label>Ekstern reference<input value={form.eksternReference} onChange={(e) => setForm({ ...form, eksternReference: e.target.value })} /></label><label>Opgavenavn<input value={form.navn} onChange={(e) => setForm({ ...form, navn: e.target.value })} /></label><label>Kunde/modtager<input value={form.kunde} onChange={(e) => setForm({ ...form, kunde: e.target.value })} /></label><label>Rutetype<input value={form.rutetype} onChange={(e) => setForm({ ...form, rutetype: e.target.value })} /></label><label>Udførelsesskabelon<select value={form.skabelonId} onChange={(e) => setForm({ ...form, skabelonId: e.target.value })}><option value="">Ingen</option>{skabeloner.map((s) => <option key={s.id} value={s.id}>{s.navn} · v{s.version}</option>)}</select></label><label>Prioritet<select value={form.prioritet} onChange={(e) => setForm({ ...form, prioritet: e.target.value })}><option>NORMAL</option><option>HOEJ</option><option>AKUT</option></select></label><label>Medarbejderreference<select value={form.medarbejderRef} onChange={(e) => setForm({ ...form, medarbejderRef: e.target.value })}><option value="">Ingen</option><option value="med-demo-1">Fiktiv medarbejder</option><option value="ukendt-demo">Ukendt reference (kontrol)</option></select></label><label>Køretøjsreference<select value={form.koeretoejRef} onChange={(e) => setForm({ ...form, koeretoejRef: e.target.value })}><option value="">Intet køretøj</option><option value="bil-demo-1">DEMO-BIL-01</option><option value="ukendt-demo">Ukendt reference (kontrol)</option></select></label></div>
    {form.stop.map((stop, index) => <StopForm key={index} stop={stop} index={index} onChange={(naeste) => setForm({ ...form, stop: form.stop.map((v, i) => i === index ? naeste : v) })} onRemove={form.stop.length > 1 ? () => setForm({ ...form, stop: form.stop.filter((_, i) => i !== index) }) : null} />)}
    <button type="button" className="pu-btn pu-btn-quiet" onClick={() => setForm({ ...form, stop: [...form.stop, { ...tomtStop(), stoptype: STOPTYPE.LEVERING }] })}>+ Tilføj stop</button>
    <p className="pu-help">En ufuldstændig opgave gemmes som Kræver kontrol. Den sendes ikke automatisk til en rute.</p>
    <div className="pu-drawer-actions"><button className="pu-btn pu-btn-quiet" type="button" onClick={onClose}>Annuller</button><button className="pu-btn pu-btn-primary" type="button" onClick={gem}>Gem lokal opgave</button></div>
  </section></div>;
}

function ImportDialog({ demo, eksisterende, onClose, onImport }) {
  const [kilde, setKilde] = useState(IMPORTKILDE.CSV);
  const [tekst, setTekst] = useState(demo.csvEksempel);
  const [filnavn, setFilnavn] = useState("fiktive-opgaver.csv");
  const [trin, setTrin] = useState(IMPORTTRIN.KILDE);
  const [parser, setParser] = useState(null);
  const [mapping, setMapping] = useState({});
  const [batch, setBatch] = useState(null);
  const parserKald = () => kilde === IMPORTKILDE.INDSAT_TABEL ? parseIndsatTabel(tekst) : parseCsv(tekst, { filnavn });
  const parse = () => { const p = parserKald(); setParser(p); setMapping(foreslaaKolonnemapping(p.overskrifter || [])); setTrin(IMPORTTRIN.RAA_DATA); };
  const valider = () => {
    let nummer = 0;
    const opgaver = (parser?.raekker || []).map((raekke) => opretOpgaveFraImportRaekke(raekke, mapping, { tenantRef: "tenant-fiktiv-ui-demo", kilde, batchId: "batch-lokal-preview", filnavn, importeretMs: DEMO_IMPORTTID_MS + 180000, idGenerator: (p) => `import-${p}-${++nummer}`, udfoerelsesskabeloner: demo.skabeloner, materialer: demo.materialer }));
    const medDubletter = findDubletter(opgaver, eksisterende);
    const b = opretImportbatch({ id: "batch-lokal-preview", kilde, filnavn, importeretMs: DEMO_IMPORTTID_MS + 180000, mapping, parserResultat: parser, opgaver: medDubletter });
    setBatch(b); setTrin(IMPORTTRIN.FEJL_OG_DUBLETTER);
  };
  const godkend = () => {
    const forberedt = { ...batch, opgaver: batch.opgaver.map((post) => post.dublet.type === DUBLETTYPE.INGEN ? post : beslutDublet(post, post.dublet.beslutning || DUBLETBESLUTNING.BEHOLD_TIL_KONTROL)) };
    const resultat = godkendImportbatch(forberedt, forberedt.opgaver.map((post) => post.id), { tidspunktMs: DEMO_IMPORTTID_MS + 240000 });
    setBatch(resultat); setTrin(IMPORTTRIN.GODKENDELSE); onImport(resultat.opgaver);
  };
  const laesFil = async (event) => {
    const fil = event.target.files?.[0]; if (!fil) return;
    setFilnavn(fil.name);
    if (/\.xlsx$/i.test(fil.name)) { setTekst(""); setParser(parseCsv("", { filnavn: fil.name })); setTrin(IMPORTTRIN.RAA_DATA); return; }
    setTekst(await fil.text());
  };
  return <div className="pu-overlay" role="presentation"><section className="pu-modal pi-import-modal" role="dialog" aria-modal="true" aria-labelledby="import-titel">
    <div className="pu-drawer-head"><div><span className="pu-eyebrow">Lokal browserbehandling</span><h2 id="import-titel">Importér opgaver</h2></div><button className="pu-btn pu-btn-quiet" type="button" onClick={onClose}>Luk</button></div>
    <p className="pi-safety-note"><strong>Lokal prototype – brug kun syntetiske testdata.</strong> Filer forlader ikke din browser.</p>
    <ol className="pi-steps">{IMPORTTRINNAVNE.map((navn, i) => <li key={navn} data-active={trin === i + 1} data-done={trin > i + 1}>{i + 1}. {navn}</li>)}</ol>
    {trin === IMPORTTRIN.KILDE && <div className="pi-source-grid"><button type="button" aria-pressed={kilde === IMPORTKILDE.CSV} onClick={() => { setKilde(IMPORTKILDE.CSV); setTekst(demo.csvEksempel); }}>CSV-fil</button><button type="button" aria-pressed={kilde === IMPORTKILDE.INDSAT_TABEL} onClick={() => { setKilde(IMPORTKILDE.INDSAT_TABEL); setTekst(demo.indsatEksempel); }}>Kopiér/indsæt fra Excel</button><label className="pi-span-2">{kilde === IMPORTKILDE.CSV ? "CSV-indhold" : "Indsat tabel"}<textarea rows="8" value={tekst} onChange={(e) => setTekst(e.target.value)} /></label>{kilde === IMPORTKILDE.CSV && <label className="pi-span-2">Vælg lokal fil<input type="file" accept=".csv,.txt,.xlsx" onChange={laesFil} /><small>.xlsx læses ikke: gem som CSV eller indsæt tabellen.</small></label>}<button className="pu-btn pu-btn-primary pi-span-2" type="button" onClick={parse}>Forhåndsvis rå data</button></div>}
    {trin === IMPORTTRIN.RAA_DATA && <div><h3>Rå forhåndsvisning</h3>{parser?.fund?.map((f) => <p className="pi-finding" key={f.kode}>{f.tekst}</p>)}<div className="pi-raw-preview"><table><thead><tr>{parser?.overskrifter?.map((h) => <th key={h}>{h || "Tom kolonne"}</th>)}</tr></thead><tbody>{parser?.raekker?.slice(0, 5).map((r) => <tr key={r.raekkenummer}>{r.celler.map((c, i) => <td key={i}>{c.vaerdi}</td>)}</tr>)}</tbody></table></div><button className="pu-btn pu-btn-primary" type="button" disabled={!parser?.ok} onClick={() => setTrin(IMPORTTRIN.MAPPING)}>Match kolonner</button></div>}
    {trin === IMPORTTRIN.MAPPING && <div><h3>Kolonnemapping</h3><p className="pu-help">Forslag bygger på danske og engelske overskrifter—not på kolonneplacering. Alle understøttede felter kan ændres.</p><div className="pi-mapping">{Object.keys(KOLONNEFELTER).map((felt) => <label key={felt}>{felt}<select value={mapping[felt] || ""} onChange={(e) => setMapping({ ...mapping, [felt]: e.target.value })}><option value="">Ikke mappet</option>{parser.overskrifter.map((h) => <option key={h}>{h}</option>)}</select></label>)}</div><button className="pu-btn pu-btn-primary" type="button" onClick={() => setTrin(IMPORTTRIN.VALIDERING)}>Validér mapping</button></div>}
    {trin === IMPORTTRIN.VALIDERING && <div><h3>Klar til validering</h3><p>{parser.raekker.length} rækker behandles med den samme normalisering som manuel oprettelse.</p><button className="pu-btn pu-btn-primary" type="button" onClick={valider}>Kør lokal validering</button></div>}
    {trin === IMPORTTRIN.FEJL_OG_DUBLETTER && <div><h3>Fejl og dubletter</h3><div className="pi-batch-summary"><span><strong>{batch.opgaver.length}</strong> rækker</span><span><strong>{batch.opgaver.filter((o) => o.valideringsfund.length).length}</strong> med fund</span><span><strong>{batch.opgaver.filter((o) => o.dublet.type !== DUBLETTYPE.INGEN).length}</strong> dubletter</span></div><div className="pi-review-list">{batch.opgaver.map((o) => <article key={o.id}><div><strong>{o.navn || "Navn mangler"}</strong><small>{o.kunde} · række {o.kildeMetadata.raekkenummer}</small></div><Status status={o.status} />{o.dublet.type !== DUBLETTYPE.INGEN && <select aria-label={`Dubletvalg for ${o.navn}`} value={o.dublet.beslutning || ""} onChange={(e) => setBatch({ ...batch, opgaver: batch.opgaver.map((x) => x.id === o.id ? beslutDublet(x, e.target.value) : x) })}><option value="">Vælg dubletbehandling</option>{Object.values(DUBLETBESLUTNING).map((v) => <option key={v}>{v}</option>)}</select>}<small>{o.valideringsfund.map((f) => f.tekst).join(" · ") || "Ingen hårde fund"}</small></article>)}</div><button className="pu-btn pu-btn-primary" type="button" onClick={godkend}>Godkend gyldige opgaver</button></div>}
    {trin === IMPORTTRIN.GODKENDELSE && <div><h3>Batch behandlet lokalt</h3><div className="pi-batch-summary">{Object.entries(batch.opsummering).map(([status, antal]) => <span key={status}><strong>{antal}</strong>{STATUSNAVN[status]}</span>)}</div><p className="pu-help">Ingen række er forsvundet. Kræver kontrol er bevaret i indbakken.</p><button className="pu-btn pu-btn-primary" type="button" onClick={onClose}>Til indbakken</button></div>}
  </section></div>;
}

function SkabelonVaerksted({ skabeloner, setSkabeloner, materialer, setMaterialer }) {
  const [valgtId, setValgtId] = useState(skabeloner[0]?.id);
  const valgt = skabeloner.find((s) => s.id === valgtId) || skabeloner[0];
  const opdater = (naeste) => setSkabeloner((alle) => alle.map((s) => s.id === valgt.id ? naeste : s));
  const ny = () => { const nummer = skabeloner.length + 1; const s = opretUdfoerelsesskabelon({ id: `demo-skabelon-${nummer}`, navn: "Ny fiktiv skabelon", stopprofiler: [{ id: `demo-profil-${nummer}`, stopId: `demo-stopprofil-${nummer}`, stoptype: STOPTYPE.BESOEG, dokumenter: [], fotos: [], spoergsmaal: [], materialeIder: [], ekstraMaterialeTilladt: false }] }, { idGenerator: (p) => `${p}-${nummer}`, tidspunktMs: DEMO_IMPORTTID_MS }); setSkabeloner([...skabeloner, s]); setValgtId(s.id); };
  if (!valgt) return null;
  const profil = valgt.stopprofiler[0];
  const tilfoejKrav = (art) => {
    if (!profil) return;
    const naesteProfil = klon(profil);
    const nummer = (naesteProfil[art]?.length || 0) + 1;
    if (art === "dokumenter") naesteProfil.dokumenter.push({ id: `demo-dok-${nummer}`, dokumentRef: `demo-dokument-${nummer}`, dokumentnavn: "Nyt fiktivt dokument", dokumentversion: 1, stopId: profil.stopId, underskrift: { paakraevet: false, forventetUnderskriver: "Modtager", kopiKanSendes: true, modtagermetode: MODTAGERMETODE.CHAUFFOER_INDTASTER_MAIL } });
    if (art === "fotos") naesteProfil.fotos.push({ id: `demo-foto-${nummer}`, navn: "Nyt fiktivt fotokrav", kategori: FOTOKATEGORI.ANDET, paakraevet: false, minimumAntal: 0, maksimumAntal: 3, kommentarPaakraevet: false, ekstraTilladt: true });
    if (art === "spoergsmaal") naesteProfil.spoergsmaal.push({ id: `demo-sp-${nummer}`, tekst: "Nyt fiktivt kundespørgsmål", type: SPOERGSMAALTYPE.KORT_TEKST, paakraevet: false, hjaelpetekst: "Lokal prototype", svarmuligheder: [], raekkefoelge: naesteProfil.spoergsmaal.length + 1, skabelonversion: valgt.version + 1 });
    opdater(opretNySkabelonVersion(valgt, { stopprofiler: [naesteProfil, ...valgt.stopprofiler.slice(1)] }, DEMO_IMPORTTID_MS + 4000 + nummer));
  };
  return <section className="pu-card pi-template-workshop">
    <div className="pu-card-head"><div><span className="pu-eyebrow">Versionerede kundekrav</span><h2>Udførelsesskabeloner</h2></div><button type="button" className="pu-btn pu-btn-quiet" onClick={ny}>+ Ny skabelon</button></div>
    <div className="pi-template-grid">
      <nav aria-label="Udførelsesskabeloner">{skabeloner.map((s) => <button type="button" key={s.id} aria-current={s.id === valgt.id ? "true" : undefined} onClick={() => setValgtId(s.id)}><strong>{s.navn}</strong><small>v{s.version} · {s.status}</small></button>)}</nav>
      <div className="pi-template-editor">
        <div className="pi-form-grid"><label>Navn<input value={valgt.navn} onChange={(e) => opdater(redigerUdfoerelsesskabelon(valgt, { navn: e.target.value }, DEMO_IMPORTTID_MS + 1000))} /></label><label>Status<input value={valgt.status} readOnly /></label></div>
        <div className="pi-inline-actions"><button type="button" className="pu-btn pu-btn-quiet" onClick={() => opdater(opretNySkabelonVersion(valgt, {}, DEMO_IMPORTTID_MS + 2000))}>Opret ny version</button><button type="button" className="pu-btn pu-btn-quiet" disabled={valgt.status === UDFOERELSESSKABELONSTATUS.INAKTIV} onClick={() => opdater(deaktiverUdfoerelsesskabelon(valgt, DEMO_IMPORTTID_MS + 3000))}>Deaktivér</button></div>
        {profil ? <><h3>Krav på {profil.stopId}</h3><div className="pi-requirement-cards">
          <article><strong>Dokument og kvittering</strong><span>{profil.dokumenter.length} dokumentkrav</span><small>{profil.dokumenter.some((d) => d.underskrift?.paakraevet) ? "Modtagers underskrift kræves" : "Ingen obligatorisk underskrift"}</small><small>Modtagelse: {MODTAGERMETODE.CHAUFFOER_INDTASTER_MAIL}</small></article>
          <article><strong>Fotokrav</strong><span>{profil.fotos.length} krav</span><small>{[...new Set(profil.fotos.map((f) => FOTOKATEGORI[f.kategori] || f.kategori))].join(" · ")}</small></article>
          <article><strong>Kundespørgsmål</strong><span>{profil.spoergsmaal.length} spørgsmål</span><small>{profil.spoergsmaal.some((q) => q.type === SPOERGSMAALTYPE.MATERIALEFORBRUG) ? "Betinget materialeregistrering" : "Ingen materialeflow"}</small></article>
          <article><strong>Materialekatalog</strong><span>{materialer.filter((m) => m.aktiv).length} aktive typer</span><small>{materialer.map((m) => `${m.navn} (${m.enhed})`).join(" · ")}</small></article>
        </div></> : <p className="pu-help">Tilføj stopkrav i en senere lokal redigering. Skabelonen har allerede en stabil version.</p>}
        {profil && <div className="pi-inline-actions"><button type="button" className="pu-btn pu-btn-quiet" onClick={() => tilfoejKrav("dokumenter")}>+ Dokumentkrav</button><button type="button" className="pu-btn pu-btn-quiet" onClick={() => tilfoejKrav("fotos")}>+ Fotokrav</button><button type="button" className="pu-btn pu-btn-quiet" onClick={() => tilfoejKrav("spoergsmaal")}>+ Kundespørgsmål</button><button type="button" className="pu-btn pu-btn-quiet" onClick={() => setMaterialer([...materialer, { id: `demo-materiale-${materialer.length + 1}`, navn: "Nyt fiktivt materiale", reference: `DEMO-MAT-${materialer.length + 1}`, enhed: "stk.", aktiv: true }])}>+ Materialetype</button></div>}
      </div>
    </div>
  </section>;
}

export function ExecutionMobilePreview({ compact = false }) {
  const demo = useMemo(() => opretDemoIntakeData(), []);
  const opgave = demo.opgaver.find((o) => o.udfoerelsessnapshot) || demo.opgaver[0];
  const stop = opgave.stop[0];
  const profil = opgave.udfoerelsessnapshot?.stopprofiler?.[0] || demo.skabeloner[0].stopprofiler[0];
  const [materialer, setMaterialer] = useState(false);
  const flow = mobilFlowForStop(profil, { "sp-materialer": materialer });
  return <section className={`pi-mobile-preview ${compact ? "pi-mobile-compact" : ""}`} aria-label="Lokal mobilforhåndsvisning"><div className="pu-phone-top"><span>Udførelse · {stop.navn}</span><span className="pu-badge" data-tone="estimated">Forhåndsvisning</span></div><div className="pi-mobile-flow"><ol>{flow.map((trin, indeks) => { const [navn] = trin.split(" · "); return <li key={`${navn}-${indeks}`}><span>{indeks + 1}</span><div><strong>{navn}</strong>{trin.includes("Ikke tilsluttet endnu") && <small>Ikke tilsluttet endnu</small>}</div></li>; })}</ol><label className="pu-check"><input type="checkbox" checked={materialer} onChange={(e) => setMaterialer(e.target.checked)} />Har du brugt materialer på opgaven?</label>{materialer && <div className="pi-material-entry"><label>Materiale<select defaultValue={demo.materialer[0].id}>{demo.materialer.filter((m) => m.aktiv).map((m) => <option key={m.id} value={m.id}>{m.navn} · {m.enhed}</option>)}</select></label><label>Antal<input type="number" min="0.1" step="0.1" defaultValue="2" /></label><label>Kommentar<input defaultValue="Syntetisk registrering" /></label></div>}<p className="pu-help">Kamera, filupload, signaturfelt, dokumentgenerering, mailafsendelse og persistence er ikke tilsluttet endnu.</p></div></section>;
}

export default function PlanningIntake() {
  const demo = useMemo(() => opretDemoIntakeData(), []);
  const [opgaver, setOpgaver] = useState(() => [...demo.eksisterende, ...demo.opgaver]);
  const [skabeloner, setSkabeloner] = useState(demo.skabeloner);
  const [materialer, setMaterialer] = useState(demo.materialer);
  const [pulje, setPulje] = useState([]);
  const [status, setStatus] = useState("ALLE");
  const [soegning, setSoegning] = useState("");
  const [sortering, setSortering] = useState("dato");
  const [valgtId, setValgtId] = useState(null);
  const [valgte, setValgte] = useState([]);
  const [dialog, setDialog] = useState(null);
  const filtrerede = opgaver.filter((o) => (status === "ALLE" || o.status === status) && `${o.navn} ${o.kunde} ${o.eksternReference}`.toLocaleLowerCase("da-DK").includes(soegning.toLocaleLowerCase("da-DK"))).sort((a, b) => sortering === "navn" ? a.navn.localeCompare(b.navn, "da") : (a.stop[0]?.dato || "").localeCompare(b.stop[0]?.dato || ""));
  const valgt = opgaver.find((o) => o.id === valgtId);
  const opdater = (naeste) => setOpgaver((alle) => alle.map((o) => o.id === naeste.id ? naeste : o));
  const masseGodkend = () => setOpgaver((alle) => alle.map((o) => valgte.includes(o.id) ? godkendOpgave(o, { tidspunktMs: DEMO_IMPORTTID_MS + 300000 }) : o));
  const send = (opgave) => { const svar = sendTilDagsplan(opgave, pulje); if (svar.ok) setPulje(svar.planlaegningspulje); };
  return <div className="pu-view pi-view" data-view="opgaver"><div className="pu-view-title"><div><span className="pu-eyebrow">Intake og datakontrol</span><h1>Opgaver</h1><p>Lokal prototype – brug kun syntetiske testdata. Filer forlader ikke din browser.</p></div><div className="pi-inline-actions"><button type="button" className="pu-btn pu-btn-quiet" onClick={() => setDialog("import")}>Importér opgaver</button><button type="button" className="pu-btn pu-btn-primary" onClick={() => setDialog("manuel")}>Opret opgave</button></div></div>
    <div className="pi-kpis">{["ALLE", ...Object.values(INTAKESTATUS)].map((s) => <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}><strong>{s === "ALLE" ? opgaver.length : opgaver.filter((o) => o.status === s).length}</strong><span>{s === "ALLE" ? "Alle" : STATUSNAVN[s]}</span></button>)}<div><strong>{pulje.length}</strong><span>I lokal planlægningspulje</span></div></div>
    <section className="pu-card pi-inbox"><div className="pi-toolbar"><label>Søg<input type="search" value={soegning} onChange={(e) => setSoegning(e.target.value)} placeholder="Opgave, kunde eller reference" /></label><label>Sortér<select value={sortering} onChange={(e) => setSortering(e.target.value)}><option value="dato">Dato</option><option value="navn">Opgavenavn</option></select></label><button type="button" className="pu-btn pu-btn-quiet" disabled={!valgte.length} onClick={masseGodkend}>Godkend valgte</button></div><div className="pi-table-wrap"><table><thead><tr><th><span className="pu-sr-only">Vælg</span></th><th>Status</th><th>Dato og tid</th><th>Opgave</th><th>Kunde/modtager</th><th>Stop</th><th>Krav</th><th>Kilde</th><th>Fund</th></tr></thead><tbody>{filtrerede.map((o) => <tr key={o.id} onDoubleClick={() => setValgtId(o.id)}><td><input aria-label={`Vælg ${o.navn}`} type="checkbox" checked={valgte.includes(o.id)} onChange={(e) => setValgte(e.target.checked ? [...valgte, o.id] : valgte.filter((id) => id !== o.id))} /></td><td><Status status={o.status} /></td><td>{o.stop[0]?.dato}<small>{o.stop[0]?.tidskrav?.art || "ukendt"}</small></td><td><button className="pu-link" type="button" onClick={() => setValgtId(o.id)}>{o.navn || "Navn mangler"}</button><small>{o.eksternReference}</small></td><td>{o.kunde}</td><td>{o.stop.length}<small>{o.stop.map((s) => `${s.type} · ${s.lokation.by}`).join(" / ")}</small></td><td>{o.udfoerelsessnapshot ? `Skabelon v${o.udfoerelsessnapshot.skabelonVersion}` : "Ingen"}<small>{o.udfoerelsessnapshot ? "Dokument · foto · spørgsmål" : "—"}</small></td><td>{o.kilde}<small>{o.kildeMetadata.batchId || "Manuel"}</small></td><td>{o.valideringsfund.length + (o.dublet.type !== DUBLETTYPE.INGEN ? 1 : 0)}</td></tr>)}</tbody></table></div></section>
    <SkabelonVaerksted skabeloner={skabeloner} setSkabeloner={setSkabeloner} materialer={materialer} setMaterialer={setMaterialer} />
    {valgt && <div className="pu-overlay" role="presentation"><aside className="pu-drawer" role="dialog" aria-modal="true" aria-labelledby="opgave-detalje"><div className="pu-drawer-head"><div><span className="pu-eyebrow">{valgt.eksternReference}</span><h2 id="opgave-detalje">{valgt.navn || "Ufuldstændig opgave"}</h2></div><button type="button" className="pu-btn pu-btn-quiet" onClick={() => setValgtId(null)}>Luk</button></div><div className="pu-badge-row"><Status status={valgt.status} /><span className="pu-badge" data-tone="neutral">{valgt.kilde}</span>{valgt.dublet.type !== DUBLETTYPE.INGEN && <span className="pu-badge" data-tone="warn">{valgt.dublet.type} dublet</span>}</div><dl className="pu-detail-grid"><div><dt>Kunde</dt><dd>{valgt.kunde}</dd></div><div><dt>Rutetype</dt><dd>{valgt.rutetype || "Ikke angivet"}</dd></div><div><dt>Stop</dt><dd>{valgt.stop.length}</dd></div><div><dt>Varighed</dt><dd>{valgt.stop.reduce((s, x) => s + (x.estimeretVarighedMin || 0), 0)} min.</dd></div></dl><h3>Stop og lokation</h3><div className="pi-review-list">{valgt.stop.map((s) => <article key={s.id}><div><strong>{s.type} · {s.navn}</strong><small>{s.lokation.adresse}, {s.lokation.postnummer} {s.lokation.by}, {s.lokation.land}</small></div><span>{s.originalVarighed || "Varighed mangler"}</span><small>{s.lokation.status} · ikke geokodet</small></article>)}</div><h3>Valideringsfund</h3>{valgt.valideringsfund.length ? valgt.valideringsfund.map((f) => <p className="pi-finding" key={`${f.kode}-${f.sti}`}>{f.tekst}</p>) : <p className="pu-help">Ingen hårde strukturelle fund.</p>}{valgt.udfoerelsessnapshot && <ExecutionMobilePreview compact />}<div className="pu-drawer-actions">{valgt.status === INTAKESTATUS.AFVIST ? <button type="button" className="pu-btn pu-btn-quiet" onClick={() => opdater(genaabnOpgave(valgt))}>Genåbn</button> : <button type="button" className="pu-btn pu-btn-quiet" onClick={() => opdater(afvisOpgave(valgt, "Afvist i lokal prototype"))}>Afvis</button>}<button type="button" className="pu-btn pu-btn-quiet" disabled={valgt.valideringsfund.length > 0} onClick={() => opdater(godkendOpgave(valgt, { tidspunktMs: DEMO_IMPORTTID_MS + 360000 }))}>Godkend</button><button type="button" className="pu-btn pu-btn-primary" disabled={valgt.status !== INTAKESTATUS.KLAR_TIL_PLANLAEGNING || pulje.some((p) => p.id === valgt.id)} onClick={() => send(valgt)}>Send til dagsplan</button></div></aside></div>}
    {dialog === "manuel" && <ManuelDialog skabeloner={skabeloner} materialer={materialer} onClose={() => setDialog(null)} onSave={(opgave) => { setOpgaver([opgave, ...opgaver]); setDialog(null); setValgtId(opgave.id); }} />}
    {dialog === "import" && <ImportDialog demo={demo} eksisterende={opgaver} onClose={() => setDialog(null)} onImport={(nye) => setOpgaver([...nye, ...opgaver])} />}
  </div>;
}
