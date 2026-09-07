import { useEffect, useMemo, useState } from "react";
import {
  LOESNINGSFORSLAGSTATUS, MOBILEVENTTYPE, REFERENCEART, REGELNIVEAU,
  TILDELINGSMETODE, aendrSkabelonStopvarighed, deaktiverSkabelonStop,
  fjernSkabelonStop, flytSkabelonStop, tilfoejSkabelonStop,
} from "../planning-basic-v2.js";
import { opretPlanningUiFixtures } from "./demo-planning-ui.js";
import PlanningIntake, { ExecutionMobilePreview } from "./PlanningIntake.jsx";
import PlanningOptimization from "./PlanningOptimization.jsx";
import VeyroLogo from "./VeyroLogo.jsx";
import {
  DAG_SLUT_MIN, DAG_START_MIN, RAEKKEVISNING,
  VISNING, afvigelsesniveau, afvisForslag, anvendGodkendtForslag,
  beregnSkabelonResume, dashboardNoegletal, danskDato, filtrerRuter,
  forslagForRute, godkendForslag, grupperKalender, minutTilTid, msTilTid,
  nytSkabelonStop, opretSyntetiskMobilevent, redigerForslag,
  ruteDatagrundlag, ruteTidsresume, skiftStandardTildeling,
  synkroniserOfflineEvent, tidslinjeSegmenter,
} from "./planning-ui-model.js";

const NAVIGATION = [
  [VISNING.OVERBLIK, "Dagens overblik", "⌂"],
  [VISNING.OPGAVER, "Opgaver", "☷"],
  [VISNING.OPTIMERING, "Optimering", "↝"],
  [VISNING.KALENDER, "Livekalender", "▦"],
  [VISNING.FASTE_RUTER, "Faste ruter", "↻"],
  [VISNING.MOBIL, "Mobilvisning", "▯"],
];
const TYPENAVNE = { service: "Service", hjemmepleje: "Hjemmepleje", transport: "Transport", renovation: "Renovation" };

function Statusmaerke({ niveau, children, title }) {
  return <span className="pu-badge" data-tone={niveau} title={title}>{children}</span>;
}

function Ikon({ children }) {
  return <span className="pu-icon" aria-hidden="true">{children}</span>;
}

function GlobalFiltre({ filtre, setFiltre, ruter, medarbejdere, koeretoejer }) {
  return (
    <div className="pu-filters" aria-label="Filtre">
      <label>Status
        <select value={filtre.status} onChange={(event) => setFiltre((nu) => ({ ...nu, status: event.target.value }))}>
          <option value="alle">Alle statusser</option>
          <option value="normal">Normal</option>
          <option value="advarsel">Advarsel</option>
          <option value="kritisk">Kritisk</option>
          <option value="konflikt">Datakonflikt</option>
        </select>
      </label>
      <label>Rute
        <select value={filtre.ruteId} onChange={(event) => setFiltre((nu) => ({ ...nu, ruteId: event.target.value }))}>
          <option value="">Alle ruter</option>
          {ruter.map((rute) => <option key={rute.id} value={rute.id}>{rute.navn}</option>)}
        </select>
      </label>
      <label>Medarbejder
        <select value={filtre.medarbejderId} onChange={(event) => setFiltre((nu) => ({ ...nu, medarbejderId: event.target.value }))}>
          <option value="">Alle medarbejdere</option>
          {medarbejdere.map((person) => <option key={person.id} value={person.id}>{person.navn}</option>)}
        </select>
      </label>
      <label>Køretøj
        <select value={filtre.koeretoejId} onChange={(event) => setFiltre((nu) => ({ ...nu, koeretoejId: event.target.value }))}>
          <option value="">Alle køretøjer</option>
          <option value="uden">Uden køretøj</option>
          {koeretoejer.map((bil) => <option key={bil.id} value={bil.id}>{bil.navn}</option>)}
        </select>
      </label>
      <button className="pu-btn pu-btn-quiet" type="button" onClick={() => setFiltre({ status: "alle", ruteId: "", medarbejderId: "", koeretoejId: "" })}>Nulstil</button>
    </div>
  );
}

function KpiKort({ label, vaerdi, note, tone = "neutral", ikon }) {
  return (
    <article className="pu-kpi" data-tone={tone}>
      <div className="pu-kpi-icon"><Ikon>{ikon}</Ikon></div>
      <div><span>{label}</span><strong>{vaerdi}</strong><small>{note}</small></div>
    </article>
  );
}

function SkematiskKort({ ruter, valgtRuteId, onVaelg }) {
  return (
    <section className="pu-card pu-map-card" aria-labelledby="kort-titel">
      <div className="pu-card-head">
        <div><span className="pu-eyebrow">Syntetisk ruteområde</span><h2 id="kort-titel">Driftens geografiske spredning</h2></div>
        <Statusmaerke niveau="neutral" title="Skematisk visning uden kortleverandør">Ikke vejberegnet</Statusmaerke>
      </div>
      <div className="pu-map-wrap">
        <svg className="pu-map" viewBox="0 0 100 100" role="img" aria-label="Skematisk kort med syntetiske rutepunkter">
          <path className="pu-map-river" d="M8 79 C 24 54, 37 69, 48 42 S 77 19, 94 30" />
          <path className="pu-map-road" d="M5 32 L93 83 M18 8 L68 95 M2 61 L96 53" />
          {ruter.map((rute, indeks) => (
            <g key={rute.id} className="pu-map-route" data-selected={rute.id === valgtRuteId} onClick={() => onVaelg(rute.id)} role="button" tabIndex="0" aria-label={`Åbn ${rute.navn}`} onKeyDown={(event) => { if (event.key === "Enter") onVaelg(rute.id); }}>
              <polyline points={rute.kortRute.map((punkt) => `${punkt.x},${punkt.y}`).join(" ")} />
              {rute.kortRute.map((punkt, stopIndeks) => <circle key={`${rute.id}-${stopIndeks}`} cx={punkt.x} cy={punkt.y} r={stopIndeks === rute.gennemfoert ? 2.4 : 1.5} />)}
              <text x={rute.kortRute[0].x + 2} y={rute.kortRute[0].y - 2}>{indeks + 1}</text>
            </g>
          ))}
        </svg>
        <div className="pu-map-note"><strong>Visuel demo</strong><span>Punkter og linjer er syntetiske og viser ikke præcise veje eller positioner.</span></div>
      </div>
    </section>
  );
}

function DagensOverblik({ ruter, filtreredeRuter, ikkeTildelte, medarbejdere, koeretoejer, indstillinger, aabnRute, aabnForslag }) {
  const noegletal = dashboardNoegletal(ruter, ikkeTildelte, indstillinger);
  const handlinger = [
    ...ruter.filter((rute) => afvigelsesniveau(rute, indstillinger) !== "normal").map((rute) => ({ id: rute.id, rute, tone: afvigelsesniveau(rute, indstillinger), titel: rute.datakonflikt ? "Mobilstatus og OBD afviger" : `${Math.abs(rute.afvigelseMin)} min. afvigelse`, tekst: rute.navn })),
    ...ikkeTildelte.map((opgave) => ({ id: opgave.id, tone: "advarsel", titel: "Ikke tildelt", tekst: `${opgave.navn} · ${opgave.tidsvindue}` })),
  ];
  return (
    <div className="pu-view" data-view="overblik">
      <div className="pu-view-title"><div><span className="pu-eyebrow">Driftsbillede · {danskDato()}</span><h1>Dagens overblik</h1><p>Et roligt øjebliksbillede af ruter, afvigelser og datakvalitet.</p></div></div>
      <div className="pu-kpi-grid">
        <KpiKort label="Opgaver i dag" vaerdi={noegletal.opgaver} note="40 planlagte · 1 åben" ikon="✓" />
        <KpiKort label="Ruter i dag" vaerdi={noegletal.ruter} note="2 faste ruter" ikon="↝" />
        <KpiKort label="Gennemførte stop" vaerdi={noegletal.gennemfoerte} note="Bekræftet via mobil" tone="ok" ikon="✓" />
        <KpiKort label="Aktive ruter" vaerdi={noegletal.aktive} note="Lige nu i demoen" tone="info" ikon="▶" />
        <KpiKort label="Ikke tildelt" vaerdi={noegletal.ikkeTildelte} note="Kræver disponering" tone="warn" ikon="!" />
        <KpiKort label="Væsentlig afvigelse" vaerdi={noegletal.vaesentligAfvigelse} note="Efter aktive grænser" tone="warn" ikon="↗" />
        <KpiKort label="Ruter uden OBD" vaerdi={noegletal.udenObd} note="Planlægning fortsætter" ikon="○" />
        <KpiKort label="Kræver handling" vaerdi={noegletal.kraeverHandling} note="Forsinkelse eller konflikt" tone="bad" ikon="!" />
      </div>
      <div className="pu-dashboard-grid">
        <section className="pu-card pu-actions" aria-labelledby="handling-titel">
          <div className="pu-card-head"><div><span className="pu-eyebrow">Prioriteret kø</span><h2 id="handling-titel">Kræver handling</h2></div><span className="pu-count">{handlinger.length}</span></div>
          <div className="pu-action-list">
            {handlinger.map((post) => (
              <article key={post.id} className="pu-action" data-tone={post.tone}>
                <span className="pu-action-dot" aria-hidden="true" />
                <div><strong>{post.titel}</strong><span>{post.tekst}</span></div>
                {post.rute && <button type="button" className="pu-link" onClick={() => post.tone === "kritisk" || post.tone === "konflikt" ? aabnForslag(post.rute.id) : aabnRute(post.rute.id)}>Åbn <span aria-hidden="true">→</span></button>}
              </article>
            ))}
          </div>
        </section>
        <SkematiskKort ruter={filtreredeRuter} valgtRuteId={filtreredeRuter[0]?.id} onVaelg={aabnRute} />
      </div>
      <section className="pu-card pu-route-overview" aria-labelledby="ruteoversigt-titel">
        <div className="pu-card-head"><div><span className="pu-eyebrow">{filtreredeRuter.length} af {ruter.length} ruter</span><h2 id="ruteoversigt-titel">Ruteoversigt</h2></div></div>
        <div className="pu-table-wrap">
          <table><thead><tr><th>Rute</th><th>Medarbejder</th><th>Køretøj</th><th>Fremdrift</th><th>Afvigelse</th><th>Datagrundlag</th><th><span className="pu-sr-only">Handling</span></th></tr></thead>
            <tbody>{filtreredeRuter.map((rute) => {
              const person = medarbejdere.find((post) => post.id === rute.medarbejderId);
              const bil = koeretoejer.find((post) => post.id === rute.koeretoejId);
              const data = ruteDatagrundlag(rute);
              const niveau = afvigelsesniveau(rute, indstillinger);
              return <tr key={rute.id} data-tone={niveau}><td><strong>{rute.navn}</strong><small>{TYPENAVNE[rute.rutetype]} · {rute.stop.length} stop</small></td><td>{person?.navn || "Ikke tildelt"}</td><td>{bil?.navn || "Intet køretøj"}</td><td>{rute.gennemfoert}/{rute.stop.length} stop</td><td><Statusmaerke niveau={niveau}>{rute.afvigelseMin > 0 ? "+" : ""}{rute.afvigelseMin} min.</Statusmaerke></td><td><Statusmaerke niveau={data.label === "Live OBD" ? "live" : data.label.includes("ikke") ? "stale" : "estimated"}>{data.label}</Statusmaerke></td><td><button className="pu-icon-btn" type="button" aria-label={`Åbn ${rute.navn} i livekalender`} onClick={() => aabnRute(rute.id)}>→</button></td></tr>;
            })}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KalenderForklaring({ indstillinger }) {
  const graenser = indstillinger.model === "FAELLES"
    ? `Aktive grænser: advarsel ${indstillinger.faelles.advarselMin} min. · kritisk ${indstillinger.faelles.kritiskMin} min.`
    : `Aktive grænser: ${Object.entries(indstillinger.prRutetype).map(([type, regel]) => `${TYPENAVNE[type] || type} ${regel.advarselMin}/${regel.kritiskMin} min.`).join(" · ")}`;
  return (
    <div className="pu-legend" aria-label="Kalenderforklaring">
      {[["koersel", "Kørsel"], ["service", "Stop/service"], ["pause", "Pause"], ["ventetid", "Ventetid"], ["gennemfoert", "Gennemført"], ["estimated", "Estimeret"], ["live", "Live OBD"]].map(([tone, label]) => <span key={tone}><i data-tone={tone} />{label}</span>)}
      <strong>{graenser}</strong>
    </div>
  );
}

function KalenderLanes({ rute, indstillinger, onAabnRute }) {
  const segmenter = tidslinjeSegmenter(rute);
  const resume = ruteTidsresume(rute);
  const datagrundlag = ruteDatagrundlag(rute);
  const niveau = afvigelsesniveau(rute, indstillinger);
  const total = DAG_SLUT_MIN - DAG_START_MIN;
  const position = (minut) => `${Math.max(0, Math.min(100, ((minut - DAG_START_MIN) / total) * 100))}%`;
  return (
    <button type="button" className="pu-calendar-lane" data-tone={niveau} onClick={() => onAabnRute(rute.id)} aria-label={`Åbn detaljer for ${rute.navn}`}>
      <span className="pu-original-plan" title="Oprindeligt planlagt forløb" />
      {segmenter.map((segment) => <span key={segment.id} className="pu-segment" data-kind={segment.art} data-status={segment.status || "planlagt"} data-critical={niveau === "kritisk" && segment.stopId === rute.stop[rute.gennemfoert]?.id} style={{ "--pu-left": position(segment.fraMinut), "--pu-width": segment.tilMinut == null ? "1.2%" : `${Math.max(0.7, ((segment.tilMinut - segment.fraMinut) / total) * 100)}%` }} title={`${segment.label} · ${minutTilTid(segment.fraMinut)}–${minutTilTid(segment.tilMinut)}`}><span>{segment.label}</span></span>)}
      {rute.afvigelseMin !== 0 && <span className="pu-expected-line" style={{ "--pu-left": position((resume.slutMinut || rute.startMinut) + rute.afvigelseMin) }} title={`Senest beregnede forventning: ${minutTilTid((resume.slutMinut || rute.startMinut) + rute.afvigelseMin)}`} />}
      {datagrundlag.senesteMobil && <span className="pu-progress-marker" data-source="mobil" style={{ "--pu-left": position(rute.stop.find((stop) => stop.id === datagrundlag.senesteMobil.stopforekomstId)?.forventetMinut || rute.startMinut) }} title={`Bekræftet mobilstatus ${msTilTid(datagrundlag.senesteMobil.mobilTidMs)}`}>M</span>}
      {datagrundlag.fysiskPosition.kvalitet === "LIVE_OBD" && <span className="pu-progress-marker" data-source="obd" style={{ "--pu-left": position(rute.stop[Math.min(rute.gennemfoert, rute.stop.length - 1)].forventetMinut) }} title={`Frisk OBD ${msTilTid(datagrundlag.senesteObd.tidspunktMs)}`}>O</span>}
      {!datagrundlag.harLiveObd && datagrundlag.forventet.stopforekomstId && <span className="pu-progress-marker" data-source="estimat" style={{ "--pu-left": position(rute.stop.find((stop) => stop.id === datagrundlag.forventet.stopforekomstId)?.forventetMinut || rute.startMinut) }} title="Estimeret fremdrift — ikke en liveposition">E</span>}
      {!resume.komplet && <span className="pu-incomplete">Ufuldstændig: {resume.mangler.join(" · ")}</span>}
    </button>
  );
}

function KalenderIndhold({ ruter, medarbejdere, koeretoejer, indstillinger, raekkevisning, setRaekkevisning, onAabnRute, fullscreen, setFullscreen }) {
  const grupperet = grupperKalender(ruter, raekkevisning, medarbejdere, koeretoejer);
  const timer = Array.from({ length: 13 }, (_, indeks) => 6 + indeks);
  const nuMinut = 9 * 60 + 42;
  const nuPosition = `${((nuMinut - DAG_START_MIN) / (DAG_SLUT_MIN - DAG_START_MIN)) * 100}%`;
  return (
    <section className={`pu-card pu-calendar-card${fullscreen ? " pu-calendar-fullscreen" : ""}`} aria-label="Livekalender">
      <div className="pu-calendar-toolbar">
        <div className="pu-segmented" aria-label="Skift rækkevisning">
          {Object.values(RAEKKEVISNING).map((mode) => <button type="button" key={mode} aria-pressed={raekkevisning === mode} onClick={() => setRaekkevisning(mode)}>{mode === "rute" ? "Rute" : mode === "medarbejder" ? "Medarbejder" : "Køretøj"}</button>)}
        </div>
        <button className="pu-btn" type="button" onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? "Luk fuld skærm" : "Åbn i fuld skærm"}</button>
      </div>
      <KalenderForklaring indstillinger={indstillinger} />
      <div className="pu-calendar-scroll" tabIndex="0" aria-label="Vandret kalender, kan rulles">
        <div className="pu-calendar-grid">
          <div className="pu-calendar-corner">{raekkevisning === "rute" ? "Rute" : raekkevisning === "medarbejder" ? "Medarbejder" : "Køretøj"}</div>
          <div className="pu-calendar-hours">{timer.map((time) => <span key={time} style={{ "--pu-left": `${((time * 60 - DAG_START_MIN) / (DAG_SLUT_MIN - DAG_START_MIN)) * 100}%` }}>{String(time).padStart(2, "0")}.00</span>)}<i className="pu-now-line" style={{ "--pu-left": nuPosition }}><b>Nu 09.42</b></i></div>
          {grupperet.raekker.map((raekke) => <div className="pu-calendar-row" key={raekke.id}><div className="pu-calendar-label"><strong>{raekke.label}</strong><span>{raekke.ruter.length} {raekke.ruter.length === 1 ? "rute" : "ruter"}</span></div><div className="pu-calendar-track">{raekke.ruter.map((rute) => <KalenderLanes key={rute.id} rute={rute} indstillinger={indstillinger} onAabnRute={onAabnRute} />)}<i className="pu-now-line" style={{ "--pu-left": nuPosition }} /></div></div>)}
        </div>
      </div>
    </section>
  );
}

function Livekalender({ ruter, medarbejdere, koeretoejer, indstillinger, raekkevisning, setRaekkevisning, onAabnRute, fullscreen, setFullscreen }) {
  return <div className="pu-view" data-view="kalender"><div className="pu-view-title"><div><span className="pu-eyebrow">Planlagt, bekræftet og forventet</span><h1>Livekalender</h1><p>Samme dagsdata grupperet efter rute, medarbejder eller køretøj.</p></div></div><KalenderIndhold {...{ ruter, medarbejdere, koeretoejer, indstillinger, raekkevisning, setRaekkevisning, onAabnRute, fullscreen, setFullscreen }} /></div>;
}

function RuteDetalje({ rute, medarbejdere, koeretoejer, indstillinger, harForslag, onClose, onForslag }) {
  if (!rute) return null;
  const data = ruteDatagrundlag(rute);
  const resume = ruteTidsresume(rute);
  const mobil = data.senesteMobil;
  const obd = data.senesteObd;
  return (
    <div className="pu-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="pu-drawer" role="dialog" aria-modal="true" aria-labelledby="rutedetalje-titel">
        <div className="pu-drawer-head"><div><span className="pu-eyebrow">Rutedetalje</span><h2 id="rutedetalje-titel">{rute.navn}</h2></div><button className="pu-icon-btn" type="button" aria-label="Luk rutedetalje" onClick={onClose}>×</button></div>
        <div className="pu-badge-row"><Statusmaerke niveau={afvigelsesniveau(rute, indstillinger)}>{rute.afvigelseMin > 0 ? "+" : ""}{rute.afvigelseMin} min.</Statusmaerke><Statusmaerke niveau={data.label === "Live OBD" ? "live" : data.label.includes("ikke") ? "stale" : "estimated"}>{data.label}</Statusmaerke>{rute.datakonflikt && <Statusmaerke niveau="konflikt">Mobilstatus og OBD afviger</Statusmaerke>}</div>
        <dl className="pu-detail-grid"><div><dt>Medarbejder</dt><dd>{medarbejdere.find((p) => p.id === rute.medarbejderId)?.navn}</dd></div><div><dt>Køretøj</dt><dd>{koeretoejer.find((b) => b.id === rute.koeretoejId)?.navn || "Intet køretøj"}</dd></div><div><dt>Start / slut</dt><dd>{rute.startsted} → {rute.slutsted}</dd></div><div><dt>Forventet slut</dt><dd>{resume.komplet ? minutTilTid(resume.slutMinut + rute.afvigelseMin) : "Ufuldstændig"}</dd></div></dl>
        <section className="pu-observation-tracks"><h3>Separate dataspor</h3><article><Ikon>▣</Ikon><div><strong>Mobil · arbejdsstatus</strong>{mobil ? <><span>{mobil.type === "ANKOMMET" ? "Ankommet" : "Afgået"} {msTilTid(mobil.mobilTidMs)}</span><small>Syntetisk GPS gemt · {mobil.synkroniseret ? "synkroniseret" : "offline"}</small></> : <span>Ingen mobilhændelse endnu</span>}</div></article><article><Ikon>◎</Ikon><div><strong>OBD · fysisk placering</strong>{obd ? <><span>{data.label} · {msTilTid(obd.tidspunktMs)}</span><small>Historisk observation bevares separat</small></> : <span>Ingen OBD — planlægning fortsætter via mobil og estimat</span>}</div></article></section>
        {rute.datakonflikt && <div className="pu-conflict-callout"><strong>Mobilstatus og OBD afviger</strong><p>Chaufføren har registreret ankomst kl. {msTilTid(mobil?.mobilTidMs)} og mobilens syntetiske GPS-position er gemt. OBD-observationen bekræfter ikke stopzonen. Det er en datakonflikt, ikke et bevis på fejl.</p></div>}
        <div className="pu-stop-list"><h3>Stop og forventning</h3>{rute.stop.map((stop) => <div key={stop.id} data-status={stop.status}><span>{stop.status === "gennemfoert" ? "✓" : stop.status === "igang" ? "▶" : "○"}</span><div><strong>{stop.navn}</strong><small>{stop.adresse}</small></div><time>{minutTilTid(stop.planlagtMinut)} <b>→ {minutTilTid(stop.forventetMinut)}</b></time></div>)}</div>
        {harForslag && (afvigelsesniveau(rute, indstillinger) === "kritisk" || rute.datakonflikt) && <button className="pu-btn pu-btn-block" type="button" onClick={() => onForslag(rute.id)}>Åbn løsningsforslag</button>}
      </aside>
    </div>
  );
}

function ForslagPanel({ forslag, ruter, setForslag, setRuter, onClose }) {
  const [valgtId, setValgtId] = useState(forslag[0]?.id || "");
  const [begrundelse, setBegrundelse] = useState("");
  const [besked, setBesked] = useState("");
  const valgt = forslag.find((post) => post.id === valgtId) || forslag[0];
  if (!valgt) return null;
  const hard = valgt.regelbrud.some((brud) => brud.niveau === REGELNIVEAU.HARD);
  const opdater = (aendringer) => setForslag((alle) => alle.map((post) => post.id === valgt.id ? redigerForslag(post, aendringer) : post));
  const godkend = () => {
    const resultat = godkendForslag(valgt, { godkendtAf: "demo-disponent", begrundelse });
    if (!resultat.ok) { setBesked(resultat.fejl); return; }
    setForslag((alle) => alle.map((post) => post.id === valgt.id ? resultat.forslag : post));
    const anvendt = anvendGodkendtForslag(ruter, resultat.forslag);
    if (anvendt.anvendt) setRuter(anvendt.ruter);
    setBesked("Forslaget er godkendt og anvendt i den lokale demo. Ingen data er gemt eksternt.");
  };
  const afvis = () => { setForslag((alle) => alle.map((post) => post.id === valgt.id ? afvisForslag(post, begrundelse) : post)); setBesked("Forslaget er afvist i den lokale demo."); };
  return (
    <div className="pu-overlay" role="presentation">
      <aside className="pu-drawer pu-proposal" role="dialog" aria-modal="true" aria-labelledby="forslag-titel">
        <div className="pu-drawer-head"><div><span className="pu-eyebrow">Deterministiske demo-fixtures</span><h2 id="forslag-titel">Redigerbart løsningsforslag</h2></div><button className="pu-icon-btn" type="button" aria-label="Luk løsningsforslag" onClick={onClose}>×</button></div>
        <div className="pu-proposal-tabs">{forslag.map((post, indeks) => <button key={post.id} type="button" aria-pressed={post.id === valgt.id} onClick={() => { setValgtId(post.id); setBesked(""); }}>{indeks + 1}. {post.titel}</button>)}</div>
        <div className="pu-proposal-intro"><Statusmaerke niveau={hard ? "kritisk" : "normal"}>{hard ? "Hårdt regelbrud" : "Gyldigt alternativ"}</Statusmaerke><h3>{valgt.titel}</h3><p>{valgt.forklaring}</p><small>{valgt.datagrundlag} · Ikke solver-output</small></div>
        {hard && <div className="pu-hard-rule"><strong>Kan ikke godkendes</strong><p>{valgt.regelbrud.map((brud) => brud.tekst).join(" · ")}</p></div>}
        <div className="pu-form-grid">
          <label>Målrute<select value={valgt.foreslaaedeAendringer[0]?.maalRuteId || ""} onChange={(event) => opdater({ foreslaaedeAendringer: [{ ...valgt.foreslaaedeAendringer[0], maalRuteId: event.target.value }] })}>{ruter.filter((rute) => rute.id !== valgt.ruteId).map((rute) => <option key={rute.id} value={rute.id}>{rute.navn}</option>)}</select></label>
          <label>Forventet forskydning (min.)<input type="number" min="0" max="120" value={valgt.forventetAendringMin} onChange={(event) => opdater({ forventetAendringMin: Number(event.target.value) })} /></label>
          <label className="pu-span-2">Begrundelse<textarea value={begrundelse} onChange={(event) => setBegrundelse(event.target.value)} placeholder="Skriv en lokal demo-begrundelse" /></label>
        </div>
        <section className="pu-consequence"><h3>Konsekvens</h3><div><span>Berørte stop<strong>{valgt.berørteStopIder.length}</strong></span><span>Ændret kørsel<strong>+{valgt.ekstraKoeretidMin} min.</strong></span><span>Forventet tidsændring<strong>{valgt.forventetAendringMin} min.</strong></span><span>Tidsvinduer<strong>{hard ? "1 brud" : "Ingen hårde brud"}</strong></span></div></section>
        {besked && <div className="pu-inline-message" role="status">{besked}</div>}
        <div className="pu-drawer-actions"><button className="pu-btn pu-btn-quiet" type="button" onClick={afvis}>Afvis forslag</button><button className="pu-btn" type="button" disabled={hard || valgt.status === LOESNINGSFORSLAGSTATUS.GODKENDT} title={hard ? "Forslaget bryder et HARD-krav" : "Kræver begrundelse og disponentgodkendelse"} onClick={godkend}>{valgt.status === LOESNINGSFORSLAGSTATUS.GODKENDT ? "Godkendt" : "Godkend ændring"}</button></div>
      </aside>
    </div>
  );
}

function FasteRuter({ skabeloner, setSkabeloner, koeretider, setKoeretider, ressourcer, medarbejdere, koeretoejer }) {
  const [valgtId, setValgtId] = useState(skabeloner[0]?.id);
  const [sekvens, setSekvens] = useState(1);
  const valgt = skabeloner.find((skabelon) => skabelon.id === valgtId) || skabeloner[0];
  const opdater = (naeste, nyeKoeretider = null) => {
    setSkabeloner((alle) => alle.map((skabelon) => skabelon.id === valgt.id ? naeste : skabelon));
    if (nyeKoeretider) setKoeretider((alle) => ({ ...alle, [valgt.id]: nyeKoeretider }));
  };
  const resume = beregnSkabelonResume(valgt, koeretider[valgt.id] || [], ressourcer);
  const plan = resume.tidsplan;
  const tildelingsfund = resume.tildeling.fund.filter((fund) => fund.niveau === REGELNIVEAU.HARD);
  const medarbejderRef = medarbejdere.find((person) => ressourcer.some((ressource) => ressource.reference?.id === person.id))?.id || "wf-demo-001";
  const bilRef = koeretoejer.find((bil) => ressourcer.some((ressource) => ressource.reference?.id === bil.id))?.id || "fleet-demo-001";
  const tilfoej = () => {
    const naeste = tilfoejSkabelonStop(valgt, nytSkabelonStop(valgt, sekvens));
    setSekvens((tal) => tal + 1);
    opdater(naeste, [...(koeretider[valgt.id] || []), 9]);
  };
  return (
    <div className="pu-view" data-view="faste-ruter">
      <div className="pu-view-title"><div><span className="pu-eyebrow">Versionsbundne skabeloner</span><h1>Faste ruter</h1><p>Redigering foregår kun i lokal tilstand. En genindlæsning gendanner fixtures.</p></div><button className="pu-btn" type="button" onClick={tilfoej}>+ Tilføj stop</button></div>
      <div className="pu-template-layout">
        <aside className="pu-template-nav" aria-label="Ruteskabeloner">{skabeloner.map((skabelon) => <button key={skabelon.id} type="button" aria-pressed={skabelon.id === valgt.id} onClick={() => setValgtId(skabelon.id)}><span>{skabelon.navn}</span><small>{TYPENAVNE[skabelon.rutetype] || skabelon.rutetype} · version {skabelon.version}</small></button>)}</aside>
        <section className="pu-card pu-template-editor">
          <div className="pu-card-head"><div><span className="pu-eyebrow">Version {valgt.version} · {valgt.status}</span><h2>{valgt.navn}</h2></div><Statusmaerke niveau={resume.komplet && !tildelingsfund.length ? "normal" : "kritisk"}>{resume.komplet && !tildelingsfund.length ? "Gyldig lokal beregning" : "Kræver kontrol"}</Statusmaerke></div>
          <dl className="pu-template-meta"><div><dt>Rutetype</dt><dd>{TYPENAVNE[valgt.rutetype] || valgt.rutetype}</dd></div><div><dt>Gyldighed</dt><dd>{valgt.gyldigFra} – {valgt.gyldigTil || "uden slutdato"}</dd></div><div><dt>Gentagelse</dt><dd>{valgt.gentagelse.art}</dd></div><div><dt>Start / slut</dt><dd>{valgt.startLokationRef.id} → {valgt.slutLokationRef.id}</dd></div></dl>
          <div className="pu-assignments">
            <label>Standardmedarbejder<select value={valgt.standardTildeling.medarbejder.metode} onChange={(event) => opdater(skiftStandardTildeling(valgt, REFERENCEART.MEDARBEJDER, event.target.value, { kilde: "workforce", art: "medarbejder", id: medarbejderRef }))}>{Object.values(TILDELINGSMETODE).map((metode) => <option key={metode}>{metode}</option>)}</select></label>
            <label>Standardkøretøj<select value={valgt.standardTildeling.koeretoej.metode} onChange={(event) => opdater(skiftStandardTildeling(valgt, REFERENCEART.KOERETOEJ, event.target.value, { kilde: "fleet", art: "koeretoej", id: bilRef }))}>{Object.values(TILDELINGSMETODE).map((metode) => <option key={metode}>{metode}</option>)}</select></label>
          </div>
          {tildelingsfund.length > 0 && <div className="pu-hard-rule"><strong>Fast tildeling omgår ikke regler</strong><p>{tildelingsfund.map((fund) => fund.tekst).join(" · ")}</p></div>}
          <div className="pu-template-stops"><div className="pu-template-stop pu-template-stop-head"><span>#</span><span>Stop</span><span>Varighed</span><span>Handlinger</span></div>{valgt.stop.map((stop, indeks) => <div className="pu-template-stop" data-inactive={stop.status === "inaktiv"} key={stop.id}><span>{stop.raekkefoelge}</span><div><strong>{stop.uiNavn || stop.id}</strong><small>{stop.uiAdresse || "Fiktiv lokation"} · {stop.status}</small></div><label><span className="pu-sr-only">Varighed for {stop.uiNavn || stop.id}</span><input type="number" min="5" max="180" value={stop.estimeretVarighedMin ?? ""} onChange={(event) => opdater(aendrSkabelonStopvarighed(valgt, stop.id, event.target.value === "" ? null : Number(event.target.value)))} /> min.</label><div><button type="button" className="pu-mini-btn" disabled={indeks === 0} aria-label={`Flyt ${stop.uiNavn || stop.id} op`} onClick={() => opdater(flytSkabelonStop(valgt, stop.id, indeks - 1))}>↑</button><button type="button" className="pu-mini-btn" disabled={indeks === valgt.stop.length - 1} aria-label={`Flyt ${stop.uiNavn || stop.id} ned`} onClick={() => opdater(flytSkabelonStop(valgt, stop.id, indeks + 1))}>↓</button><button type="button" className="pu-mini-btn" onClick={() => opdater(deaktiverSkabelonStop(valgt, stop.id))}>Deaktivér</button><button type="button" className="pu-mini-btn" onClick={() => opdater(fjernSkabelonStop(valgt, stop.id), (koeretider[valgt.id] || []).slice(0, -1))}>Fjern</button></div></div>)}</div>
          <div className="pu-time-summary"><span><small>Samlet kørsel</small><strong>{plan ? `${plan.samletKoeretidMin} min.` : "—"}</strong></span><span><small>Stop/service</small><strong>{plan ? `${plan.samletStoptidMin} min.` : "—"}</strong></span><span><small>Pause</small><strong>{plan ? `${plan.samletPausetidMin} min.` : "—"}</strong></span><span><small>Ventetid</small><strong>{plan ? `${plan.samletVentetidMin} min.` : "—"}</strong></span><span><small>Samlet rutetid</small><strong>{plan?.samletRutetidMin != null ? `${plan.samletRutetidMin} min.` : "Ufuldstændig"}</strong></span><span><small>Forventet slut</small><strong>{plan?.planlagtSlutMs ? msTilTid(plan.planlagtSlutMs) : "—"}</strong></span></div>
          {!resume.komplet && <div className="pu-inline-message" role="status">Der gættes ikke: {resume.mangler.map((mangel) => mangel.id || mangel).join(" · ")}</div>}
        </section>
      </div>
    </div>
  );
}

function Mobilvisning({ ruter, setRuter, medarbejdere, onAabnKalender }) {
  const [medarbejderId, setMedarbejderId] = useState(medarbejdere[0].id);
  const medarbejderRuter = ruter.filter((rute) => rute.medarbejderId === medarbejderId);
  const [valgtRuteId, setValgtRuteId] = useState("");
  const rute = medarbejderRuter.find((post) => post.id === valgtRuteId) || medarbejderRuter[0] || ruter[0];
  const naesteStop = rute.stop[Math.min(rute.gennemfoert, rute.stop.length - 1)];
  const [stopId, setStopId] = useState(naesteStop.id);
  const [offline, setOffline] = useState(false);
  const [besked, setBesked] = useState("");
  const valgteStop = rute.stop.find((stop) => stop.id === stopId) || naesteStop;
  const senesteLokale = [...rute.mobilevents].sort((a, b) => a.mobilTidMs - b.mobilTidMs).at(-1);
  const kanAfgang = senesteLokale?.stopforekomstId === valgteStop.id && senesteLokale.type === MOBILEVENTTYPE.ANKOMMET;
  const registrer = (type, konflikt = false) => {
    const event = opretSyntetiskMobilevent({ rute, stopId: valgteStop.id, medarbejderId: rute.medarbejderId, type, offline, indeks: rute.mobilevents.length });
    setRuter((alle) => alle.map((post) => post.id === rute.id ? { ...post, mobilevents: [...post.mobilevents, event], datakonflikt: konflikt || post.datakonflikt, gennemfoert: type === MOBILEVENTTYPE.AFGAAET ? Math.min(post.stop.length, post.gennemfoert + 1) : post.gennemfoert } : post));
    setBesked(`${type === MOBILEVENTTYPE.ANKOMMET ? "Ankomst" : "Afgang"} registreret kl. ${msTilTid(event.mobilTidMs)} med syntetisk GPS · ${offline ? "ligger offline" : "synkroniseret"}.`);
  };
  const fremkaldKonflikt = () => {
    const konfliktRute = ruter.find((post) => post.id === "ui-rute-service");
    const stop = konfliktRute.stop[Math.min(konfliktRute.gennemfoert, konfliktRute.stop.length - 1)];
    const event = opretSyntetiskMobilevent({ rute: konfliktRute, stopId: stop.id, medarbejderId: konfliktRute.medarbejderId, type: MOBILEVENTTYPE.ANKOMMET, indeks: konfliktRute.mobilevents.length });
    setRuter((alle) => alle.map((post) => post.id === konfliktRute.id ? { ...post, datakonflikt: true, mobilevents: [...post.mobilevents, event] } : post));
    setBesked("Mobilankomst er registreret, mens den separate OBD-observation er uden for stopzonen.");
  };
  const synkroniser = (eventId) => setRuter((alle) => alle.map((post) => post.id === rute.id ? { ...post, mobilevents: synkroniserOfflineEvent(post.mobilevents, eventId) } : post));
  return (
    <div className="pu-view" data-view="mobil"><div className="pu-view-title"><div><span className="pu-eyebrow">Smal lokal arbejdsgang</span><h1>Mobilvisning</h1><p>Ingen rigtig GPS, baggrundssporing eller ekstern synkronisering.</p></div></div>
      <div className="pu-mobile-workspace">
        <section className="pu-card pu-mobile-controls"><h2>Demosimulator</h2><label>Medarbejder<select value={medarbejderId} onChange={(event) => { setMedarbejderId(event.target.value); setValgtRuteId(""); }}>{medarbejdere.map((person) => <option key={person.id} value={person.id}>{person.navn}</option>)}</select></label><label>Rute<select value={rute.id} onChange={(event) => { setValgtRuteId(event.target.value); const ny = ruter.find((post) => post.id === event.target.value); setStopId(ny.stop[Math.min(ny.gennemfoert, ny.stop.length - 1)].id); }}>{medarbejderRuter.map((post) => <option key={post.id} value={post.id}>{post.navn}</option>)}</select></label><label>Næste stop<select value={valgteStop.id} onChange={(event) => setStopId(event.target.value)}>{rute.stop.map((stop) => <option key={stop.id} value={stop.id}>{stop.navn}</option>)}</select></label><label className="pu-check"><input type="checkbox" checked={offline} onChange={(event) => setOffline(event.target.checked)} /> Simulér forsinket/offline synkronisering</label><button className="pu-btn pu-btn-quiet" type="button" onClick={fremkaldKonflikt}>Fremkald mobil/OBD-uoverensstemmelse</button>{besked && <div className="pu-inline-message" role="status">{besked}</div>}</section>
        <div><section className="pu-phone" aria-label="Mobilprototype"><div className="pu-phone-top"><span>Veyro Planning</span><Statusmaerke niveau={rute.planAendret ? "advarsel" : "normal"}>{rute.planAendret ? "Plan ændret" : "Plan ajour"}</Statusmaerke></div><div className="pu-phone-body"><span className="pu-eyebrow">Næste stop · {rute.navn}</span><h2>{valgteStop.navn}</h2><p>{valgteStop.adresse}</p><div className="pu-mobile-time"><span><small>Planlagt</small><strong>{minutTilTid(valgteStop.planlagtMinut)}</strong></span><span><small>Forventet</small><strong>{minutTilTid(valgteStop.forventetMinut)}</strong></span><span><small>Varighed</small><strong>{valgteStop.varighedMin} min.</strong></span></div><div className="pu-sync-state"><span className="pu-action-dot" /><div><strong>{offline ? "Offline demo" : "Synkroniseret"}</strong><small>Syntetiske positionsdata</small></div></div><div className="pu-mobile-buttons"><button type="button" onClick={() => registrer(MOBILEVENTTYPE.ANKOMMET)}>Ankommet</button><button type="button" disabled={!kanAfgang} title={!kanAfgang ? "Registrér ankomst til dette stop først" : "Registrér afgang"} onClick={() => registrer(MOBILEVENTTYPE.AFGAAET)}>Afgået</button></div><button className="pu-link pu-phone-link" type="button" onClick={() => onAabnKalender(rute.id)}>Se i livekalender →</button><div className="pu-mobile-events"><h3>Seneste hændelser</h3>{[...rute.mobilevents].reverse().slice(0, 4).map((event) => <article key={event.id}><span>{event.type === "ANKOMMET" ? "↓" : "↑"}</span><div><strong>{event.type === "ANKOMMET" ? "Ankommet" : "Afgået"} · {msTilTid(event.mobilTidMs)}</strong><small>{event.synkroniseret ? "Synkroniseret" : "Offline · afventer"}</small></div>{!event.synkroniseret && <button type="button" onClick={() => synkroniser(event.id)}>Synkronisér</button>}</article>)}</div></div></section><ExecutionMobilePreview /></div>
      </div>
    </div>
  );
}

function Indstillingsdialog({ indstillinger, setIndstillinger, onClose }) {
  const opdaterGraense = (felt, vaerdi, type = null) => setIndstillinger((nu) => type ? { ...nu, prRutetype: { ...nu.prRutetype, [type]: { ...nu.prRutetype[type], [felt]: Number(vaerdi) } } } : { ...nu, faelles: { ...nu.faelles, [felt]: Number(vaerdi) } });
  return (
    <div className="pu-overlay" role="presentation"><section className="pu-modal" role="dialog" aria-modal="true" aria-labelledby="indstillinger-titel"><div className="pu-drawer-head"><div><span className="pu-eyebrow">Kun lokal tilstand</span><h2 id="indstillinger-titel">Afvigelsesgrænser</h2></div><button className="pu-icon-btn" type="button" aria-label="Luk indstillinger" onClick={onClose}>×</button></div><div className="pu-segmented pu-wide"><button type="button" aria-pressed={indstillinger.model === "FAELLES"} onClick={() => setIndstillinger((nu) => ({ ...nu, model: "FAELLES" }))}>Fælles grænser</button><button type="button" aria-pressed={indstillinger.model === "PR_RUTETYPE"} onClick={() => setIndstillinger((nu) => ({ ...nu, model: "PR_RUTETYPE" }))}>Pr. rutetype</button></div>{indstillinger.model === "FAELLES" ? <div className="pu-form-grid"><label>Advarsel (min.)<input type="number" min="1" value={indstillinger.faelles.advarselMin} onChange={(event) => opdaterGraense("advarselMin", event.target.value)} /></label><label>Kritisk (min.)<input type="number" min={indstillinger.faelles.advarselMin} value={indstillinger.faelles.kritiskMin} onChange={(event) => opdaterGraense("kritiskMin", event.target.value)} /></label></div> : <div className="pu-threshold-grid">{Object.entries(indstillinger.prRutetype).map(([type, regel]) => <fieldset key={type}><legend>{TYPENAVNE[type]}</legend><label>Advarsel<input type="number" min="1" value={regel.advarselMin} onChange={(event) => opdaterGraense("advarselMin", event.target.value, type)} /></label><label>Kritisk<input type="number" min={regel.advarselMin} value={regel.kritiskMin} onChange={(event) => opdaterGraense("kritiskMin", event.target.value, type)} /></label></fieldset>)}</div>}<p className="pu-help">Ændringer opdaterer fremhævelsen straks og gemmes ikke uden for denne browsertilstand.</p><button className="pu-btn pu-btn-block" type="button" onClick={onClose}>Anvend lokalt</button></section></div>
  );
}

export default function PlanningDemo() {
  const fixtures = useMemo(() => opretPlanningUiFixtures(), []);
  const [visning, setVisning] = useState(VISNING.OVERBLIK);
  const [ruter, setRuter] = useState(fixtures.ruter);
  const [forslag, setForslag] = useState(fixtures.forslag);
  const [skabeloner, setSkabeloner] = useState(fixtures.ruteskabeloner);
  const [skabelonKoeretider, setSkabelonKoeretider] = useState(fixtures.skabelonKoeretider);
  const [indstillinger, setIndstillinger] = useState(fixtures.afvigelsesindstillinger);
  const [filtre, setFiltre] = useState({ status: "alle", ruteId: "", medarbejderId: "", koeretoejId: "" });
  const [raekkevisning, setRaekkevisning] = useState(RAEKKEVISNING.RUTE);
  const [fullscreen, setFullscreen] = useState(false);
  const [valgtRuteId, setValgtRuteId] = useState(null);
  const [forslagAaben, setForslagAaben] = useState(false);
  const [indstillingerAabne, setIndstillingerAabne] = useState(false);
  const [planlaegningspulje, setPlanlaegningspulje] = useState([]);
  const filtreredeRuter = filtrerRuter(ruter, filtre, indstillinger);
  const valgtRute = ruter.find((rute) => rute.id === valgtRuteId);
  const datagrundlag = filtreredeRuter.some((rute) => ruteDatagrundlag(rute).harLiveObd) ? "OBD + mobil + estimat" : "Mobil + estimat";
  const filtertekst = Object.values(filtre).some(Boolean) && filtre.status !== "alle" ? `${filtreredeRuter.length} filtrerede ruter` : filtre.ruteId || filtre.medarbejderId || filtre.koeretoejId ? `${filtreredeRuter.length} filtrerede ruter` : "Alle ruter";
  const aabnRute = (ruteId) => { setValgtRuteId(ruteId); setVisning(VISNING.KALENDER); };
  const aabnForslag = (ruteId) => {
    setValgtRuteId(ruteId);
    if (forslagForRute(forslag, ruteId).length) setForslagAaben(true);
    else setVisning(VISNING.KALENDER);
  };
  useEffect(() => {
    const luk = (event) => { if (event.key === "Escape") { setFullscreen(false); setValgtRuteId(null); setForslagAaben(false); setIndstillingerAabne(false); } };
    window.addEventListener("keydown", luk);
    return () => window.removeEventListener("keydown", luk);
  }, []);
  return (
    <div className="pu-app">
      <a className="pu-skip" href="#planning-indhold">Gå til indhold</a>
      <aside className="pu-sidebar"><div className="pu-brand"><VeyroLogo variant="sidebar" /><small>Planning Basic</small></div><nav aria-label="Planning-demo navigation">{NAVIGATION.map(([id, label, ikon]) => <button type="button" key={id} aria-current={visning === id ? "page" : undefined} onClick={() => setVisning(id)}><Ikon>{ikon}</Ikon><span>{label}</span></button>)}</nav><div className="pu-sidebar-note"><Statusmaerke niveau="estimated">Demodata</Statusmaerke><p>Lokal prototype uden persistence og eksterne tjenester.</p></div></aside>
      <div className="pu-shell"><header className="pu-topbar"><div className="pu-context"><Statusmaerke niveau="demo">Syntetiske demodata</Statusmaerke><span><b>Dato</b> 18. maj 2032</span><span><b>Opdateret</b> 09.42</span><span><b>Filter</b> {visning === VISNING.OPGAVER ? "Opgaveindbakke" : visning === VISNING.OPTIMERING ? "Dagsoptimering" : filtertekst}</span><span><b>Datagrundlag</b> {visning === VISNING.OPGAVER ? "Lokal intake" : visning === VISNING.OPTIMERING ? "Syntetisk matrix" : datagrundlag}</span></div>{![VISNING.OPGAVER, VISNING.OPTIMERING].includes(visning) && <button className="pu-btn pu-btn-quiet" type="button" onClick={() => setIndstillingerAabne(true)}>⚙ Afvigelsesgrænser</button>}</header>{![VISNING.OPGAVER, VISNING.OPTIMERING].includes(visning) && <div className="pu-filterbar"><GlobalFiltre {...{ filtre, setFiltre, ruter, medarbejdere: fixtures.medarbejdere, koeretoejer: fixtures.koeretoejer }} /></div>}<main id="planning-indhold">{visning === VISNING.OVERBLIK && <DagensOverblik ruter={ruter} filtreredeRuter={filtreredeRuter} ikkeTildelte={fixtures.ikkeTildelte} medarbejdere={fixtures.medarbejdere} koeretoejer={fixtures.koeretoejer} indstillinger={indstillinger} aabnRute={aabnRute} aabnForslag={aabnForslag} />}{visning === VISNING.OPGAVER && <PlanningIntake planlaegningspulje={planlaegningspulje} setPlanlaegningspulje={setPlanlaegningspulje} />}{visning === VISNING.OPTIMERING && <PlanningOptimization planlaegningspulje={planlaegningspulje} />}{visning === VISNING.KALENDER && <Livekalender ruter={filtreredeRuter} medarbejdere={fixtures.medarbejdere} koeretoejer={fixtures.koeretoejer} indstillinger={indstillinger} raekkevisning={raekkevisning} setRaekkevisning={setRaekkevisning} onAabnRute={(id) => setValgtRuteId(id)} fullscreen={fullscreen} setFullscreen={setFullscreen} />}{visning === VISNING.FASTE_RUTER && <FasteRuter skabeloner={skabeloner} setSkabeloner={setSkabeloner} koeretider={skabelonKoeretider} setKoeretider={setSkabelonKoeretider} ressourcer={fixtures.ressourceSnapshot} medarbejdere={fixtures.medarbejdere} koeretoejer={fixtures.koeretoejer} />}{visning === VISNING.MOBIL && <Mobilvisning ruter={ruter} setRuter={setRuter} medarbejdere={fixtures.medarbejdere} onAabnKalender={aabnRute} />}</main></div>
      {valgtRute && !forslagAaben && <RuteDetalje rute={valgtRute} medarbejdere={fixtures.medarbejdere} koeretoejer={fixtures.koeretoejer} indstillinger={indstillinger} harForslag={forslagForRute(forslag, valgtRute.id).length > 0} onClose={() => setValgtRuteId(null)} onForslag={aabnForslag} />}
      {forslagAaben && <ForslagPanel forslag={forslagForRute(forslag, valgtRuteId)} ruter={ruter} setForslag={setForslag} setRuter={setRuter} onClose={() => setForslagAaben(false)} />}
      {indstillingerAabne && <Indstillingsdialog indstillinger={indstillinger} setIndstillinger={setIndstillinger} onClose={() => setIndstillingerAabne(false)} />}
    </div>
  );
}
