import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { beregnHitrate } from "../../fleet/ejer-kommunikation-regler.js";
import { crmMuligheder, crmVirksomhedsliste } from "../../fleet/ejer-crm.js";
import { hentSalgsplatform } from "../../fleet/ejer-salgsindbakke.js";
import { kr } from "../../fleet/format.js";
import { useEjerData } from "./EjerDataContext.jsx";
import EjerIkon from "./EjerIkon.jsx";
import { grupperSolgteModuler, solgteModulerFraTilbud } from "../../fleet/ejer-v6-regler.js";
import { hentKundekontiMedMaalinger } from "../../fleet/ejer-kundekonto.js";

const liste = (objekt) => Object.entries(objekt || {}).map(([id, post]) => ({ id, ...post }));

function HitrateDiagram({ hitrate }) {
  if (hitrate.procent === null) return <div className="ejer-rapport-tom"><b>Ingen afsluttede salg endnu</b><span>Hitrate vises, når mindst én mulighed er vundet eller tabt.</span></div>;
  const radius = 46; const omkreds = 2 * Math.PI * radius; const vundet = omkreds * (hitrate.procent / 100);
  return <figure className="ejer-donut"><svg viewBox="0 0 120 120" role="img" aria-label={`${hitrate.vundet} vundne af ${hitrate.afsluttede} afsluttede salg, ${hitrate.procent} procent`}><circle cx="60" cy="60" r={radius} className="baggrund"/><circle cx="60" cy="60" r={radius} className="vundet" strokeDasharray={`${vundet} ${omkreds-vundet}`}/><text x="60" y="65">{hitrate.procent}%</text></svg><figcaption><b>{hitrate.vundet} vundet</b><span>{hitrate.afsluttede-hitrate.vundet} tabt · åbne tælles ikke</span></figcaption></figure>;
}

function StatusSojler({ traade }) {
  const serier = [["Afventer os",traade.filter((t)=>t.status==="afventer_os").length],["Afventer kunden",traade.filter((t)=>t.status==="afventer_kunden").length],["Nye",traade.filter((t)=>t.status==="ny").length]];
  const maks = Math.max(1,...serier.map(([,tal])=>tal));
  return <figure className="ejer-soejler" aria-label="Mailstatus fordelt på åbne sager">{serier.map(([label,tal])=><div key={label}><span>{label}</span><i style={{"--andel":`${Math.max(4,(tal/maks)*100)}%`}}/><b>{tal}</b></div>)}<figcaption>Antal sager i det lokale reviewgrundlag</figcaption></figure>;
}

export default function EjerRapporter() {
  const { crm, tilbud, profiler, henter } = useEjerData();
  const [kommunikation, setKommunikation] = useState(null);
  const [periode, setPeriode] = useState("seneste_12");
  const [ansvarlig, setAnsvarlig] = useState("alle");
  const [forloeb, setForloeb] = useState("drift");
  const [valgtModul, setValgtModul] = useState(null);
  const [kundekonti, setKundekonti] = useState([]);
  useEffect(() => {
    hentSalgsplatform().then(setKommunikation);
    hentKundekontiMedMaalinger().then(setKundekonti).catch(() => setKundekonti([]));
  }, []);
  const virksomheder = useMemo(() => crmVirksomhedsliste(crm), [crm]);
  const alleMuligheder = useMemo(() => crmMuligheder(crm), [crm]);
  const ejerNavn = (uid) => `${profiler?.[uid]?.navn || profiler?.[uid]?.displayName || ""}`.toLowerCase();
  const matcherAnsvarlig = (post) => ansvarlig === "alle" || ejerNavn(post?.ansvarligUid).includes(ansvarlig);
  const periodeStart = periode === "maaned" ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
    : periode === "kvartal" ? new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3, 1).getTime()
      : Date.now() - 366 * 86_400_000;
  const muligheder = alleMuligheder.filter((post) => matcherAnsvarlig(post) && Number(post.opdateretMs || post.oprettetMs || Date.now()) >= periodeStart);
  const hitrate = beregnHitrate(muligheder);
  const aabne = muligheder.filter((m) => !["vundet", "tabt"].includes(m.fase));
  const pilot = muligheder.filter((m) => m.fase === "demo" || m.pilotFra || m.pilotTil);
  const tilbudsliste = liste(tilbud);
  const traade = liste(kommunikation?.traade).filter((post) => matcherAnsvarlig(post) && Number(post.senesteAktivitetMs || Date.now()) >= periodeStart);
  const support = traade.filter((t) => t.sagstype === "support");
  const ubesvarede = traade.filter((t) => t.status === "afventer_os");
  const pipelineOere = aabne.reduce((sum, m) => sum + Number(m.maanedligVaerdiOere || 0), 0);
  const solgte = solgteModulerFraTilbud(tilbud || {}, { fraMs: periodeStart, tilMs: Date.now(), forloeb });
  const topModuler = grupperSolgteModuler(solgte).slice(0, 5);
  const accepteretSnapshot = tilbudsliste.map((post) => post.versioner?.[post.accept?.version]?.snapshot).find(Boolean);
  const aftaltAntal = (ord) => accepteretSnapshot?.beregning?.linjer?.filter((linje) => ord.some((o) => `${linje.navn}`.toLowerCase().includes(o))).reduce((sum, linje) => sum + Number(linje.antal || 0) / 1000, 0) || null;
  const maalteKonti = kundekonti.filter((konto) => konto.senesteMaaling);
  const maalSum = (hent) => {
    const kendte = maalteKonti.map((konto) => hent(konto.senesteMaaling)).filter(Number.isFinite);
    return kendte.length ? kendte.reduce((sum, tal) => sum + tal, 0) : null;
  };
  const maaleDato = maalteKonti.map((konto) => konto.senesteMaaling?.id).filter(Boolean).sort().at(-1);
  const maaleNote = maalteKonti.length
    ? `Målt hos ${maalteKonti.length} af ${kundekonti.length} kundekonti · senest ${new Date(`${maaleDato}T12:00:00`).toLocaleDateString("da-DK")}`
    : `Ingen af ${kundekonti.length} kundekonti har en tilgængelig måling`;
  if (henter || !crm || !kommunikation) return <div className="fc-empty">Henter rapportgrundlag…</div>;
  return <div className="ejer-rapporter">
    <div className="ejer-rapport-filtre"><label>Periode<select value={periode} onChange={(e)=>setPeriode(e.target.value)}><option value="seneste_12">Seneste 12 måneder</option><option value="maaned">Denne måned</option><option value="kvartal">Dette kvartal</option></select></label><label>Ansvarlig<select value={ansvarlig} onChange={(e)=>setAnsvarlig(e.target.value)}><option value="alle">Alle ansvarlige</option><option value="dennis">Dennis</option><option value="joern">Jørn</option></select></label><label>Forløb<select value={forloeb} onChange={(e)=>{setForloeb(e.target.value);setValgtModul(null);}}><option value="drift">Driftsaftaler</option><option value="pilot">Pilotforløb</option></select></label><span>Opdateret fra lokal testadapter · {new Date().toLocaleDateString("da-DK")}</span></div>
    <p className="ejer-infoboks"><EjerIkon navn="info" size={18}/> Rapporten bruger kun lokale, syntetiske reviewdata. Periode og ansvarlig filtrerer de viste salg og mails; Microsoft 365, OpenAI og Dinero er ikke tilsluttet.</p>
    <div className="ejer-kpi-ribbon">
      <div className="ejer-kpi"><span className="ejer-ikonfelt"><EjerIkon navn="pipeline"/></span><p><small>Hitrate · afsluttede</small><b>{hitrate.procent === null ? "Ukendt" : `${hitrate.procent.toLocaleString("da-DK")} %`}</b></p></div>
      <div className="ejer-kpi"><span className="ejer-ikonfelt"><EjerIkon navn="chart"/></span><p><small>Åben månedsværdi</small><b>{kr(pipelineOere)}</b></p></div>
      <div className="ejer-kpi"><span className="ejer-ikonfelt"><EjerIkon navn="document"/></span><p><small>Tilbud</small><b>{tilbudsliste.length}</b></p></div>
      <div className="ejer-kpi"><span className="ejer-ikonfelt"><EjerIkon navn="mail"/></span><p><small>Afventer vores svar</small><b>{ubesvarede.length}</b></p></div>
    </div>
    <div className="ejer-rapport-grid">
      <section className="ejer-design-kort"><header><h2>Hitrate og salgsudfald</h2><Link to="/main/salg/pipeline">Se underliggende salg</Link></header><HitrateDiagram hitrate={hitrate}/><dl className="ejer-rapport-definitioner"><div><dt>Virksomheder i CRM</dt><dd>{virksomheder.length}</dd></div><div><dt>Åbne muligheder</dt><dd>{aabne.length}</dd></div><div><dt>Vundne / afsluttede</dt><dd>{hitrate.vundet} / {hitrate.afsluttede}</dd></div><div><dt>Pilotforløb</dt><dd>{pilot.length}</dd></div></dl><p className="fc-hint">Hitrate beregnes kun som vundne divideret med vundne plus tabte. Åbne muligheder, tilbudsversioner og sidetal påvirker ikke tallet.</p></section>
      <section className="ejer-design-kort"><header><h2>Mail og support</h2><Link to="/main/mail/indbakker">Åbn kundekorrespondance</Link></header><StatusSojler traade={traade}/><dl className="ejer-rapport-definitioner"><div><dt>Fælles sager</dt><dd>{traade.filter((t) => t.delingsstatus === "delt").length}</dd></div><div><dt>Supportsager</dt><dd>{support.length}</dd></div><div><dt>Support afventer os</dt><dd>{support.filter((t) => ["ny", "triage", "afventer_os"].includes(t.support?.status)).length}</dd></div><div><dt>Kræver klassifikation</dt><dd>{traade.filter((t) => t.kraeverKlassifikationsgennemgang).length}</dd></div></dl><p className="fc-hint">Ansvarlig styrer arbejdsfordeling, ikke hvem af de godkendte ejere der kan se en delt kundesag.</p></section>
      <section className="ejer-design-kort"><header><h2>Mest solgte moduler</h2><span>{forloeb === "drift" ? "Accepterede driftsaftaler" : "Accepterede pilotforløb"}</span></header>{topModuler.length ? <><ol className="ejer-rapport-moduler ejer-rapport-soejler">{topModuler.map((post) => <li key={post.modulId}><button type="button" onClick={()=>setValgtModul(post.modulId)}><b>{post.label}</b><i style={{"--andel":`${Math.max(12,(post.antal/topModuler[0].antal)*100)}%`}}/><span>{post.antal} kunde{post.antal === 1 ? "" : "r"}</span></button></li>)}</ol>{valgtModul && <div className="ejer-rapport-drilldown"><b>Grundlag · {topModuler.find((p)=>p.modulId===valgtModul)?.label}</b>{solgte.filter((p)=>p.modulId===valgtModul).map((p)=><p key={`${p.tilbudId}-${p.virksomhedId}`}>{crm?.[p.virksomhedId]?.stamdata?.navn || p.virksomhedId}<span>{new Date(p.acceptMs).toLocaleDateString("da-DK")}</span></p>)}</div>}</> : <div className="ejer-rapport-tom"><b>Ingen accepterede moduler i perioden</b><span>Åbne, tabte og rådgivende muligheder tælles ikke.</span></div>}<p className="fc-hint">Kilden er modul-linjer i den accepterede, låste tilbudsversion. Samme kunde og modul tælles kun én gang i perioden.</p></section>
      <section className="ejer-design-kort"><header><h2>Aftalt og registreret forbrug</h2><Link to="/main/abonnementer">Åbn kundekonti</Link></header><div className="ejer-rapport-forbrug"><div><span>Administrative brugere · aftalt</span><b>{aftaltAntal(["administrativ", "medarbejderbruger"]) ?? "Ukendt"}</b><small>Registreret: {maalSum((m) => Number(m.brugere?.desktop)) ?? "Ikke tilgængeligt"}</small></div><div><span>Operative brugere · aftalt</span><b>{aftaltAntal(["operativ", "chaufførbruger"]) ?? "Ukendt"}</b><small>Registreret: {maalSum((m) => Number(m.brugere?.chauffoer)) ?? "Ikke tilgængeligt"}</small></div><div><span>Enheder · aftalt</span><b>{aftaltAntal(["enhed"]) ?? "Ukendt"}</b><small>Registreret: {maalSum((m) => Number(m.koeretoejer)) ?? "Ikke tilgængeligt"}</small></div></div><p className="fc-hint">{maaleNote}. Aftalegrundlag og målinger vises hver for sig; ukendte værdier bliver ikke til nul. Unikke personer: {maalSum((m) => Number(m.brugere?.unikkePersoner)) ?? "Ikke tilgængeligt"}; administratorroller: {maalSum((m) => Number(m.brugere?.administratorer)) ?? "Ikke tilgængeligt"} og lægges ikke oveni persontallet.</p></section>
    </div>
  </div>;
}
