import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { iDagIsoLokal } from "../../fleet/format.js";
import { Henter } from "../../fleet/ui.jsx";
import { crmAktiviteter, crmMuligheder, erAabenMulighed, erForfaldenAktivitet } from "../../fleet/ejer-crm-regler.js";
import { useEjerData } from "./EjerDataContext.jsx";
import { hentSalgsplatform } from "../../fleet/ejer-salgsindbakke.js";
import EjerIkon from "./EjerIkon.jsx";

const profilnavn = (profiler, uid) => profiler?.find((p) => p.uid === uid)?.navn || "Ikke fordelt";
const initialer = (navn = "") => navn.split(/\s+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "—";

function Kpi({ ikon, label, vaerdi, til }) {
  return <Link className="ejer-design-kpi" to={til}><span className="ejer-ikonfelt"><EjerIkon navn={ikon} size={31} /></span><span><small>{label}</small><b>{vaerdi}</b></span><EjerIkon navn="chevron" size={18} /></Link>;
}

export default function EjerOverblikDesign({ bruger }) {
  const { crm, profiler, fejl, henter, genindlaes, ansvarligFilter } = useEjerData();
  const [salgsplatform, setSalgsplatform] = useState(null);
  const [visMine, setVisMine] = useState(false);
  useEffect(() => { hentSalgsplatform().then(setSalgsplatform).catch(() => setSalgsplatform(null)); }, []);
  if (henter && crm === null) return <Henter hvad="ejerdata" />;
  if (fejl && crm === null) return <div className="fc-empty fc-empty-bad"><b>Ejerdata kunne ikke hentes.</b><p>{String(fejl.message || fejl)}</p><button type="button" className="fc-btn" onClick={genindlaes}>Prøv igen</button></div>;

  const iDag = iDagIsoLokal();
  const aktiviteter = crmAktiviteter(crm);
  const muligheder = crmMuligheder(crm);
  const aabne = aktiviteter.filter((a) => a.status !== "afsluttet");
  const traade = Object.entries(salgsplatform?.traade || {}).map(([id, v]) => ({ id, ...v }));
  const nye = traade.filter((t) => t.status === "ny");
  const afventerOs = traade.filter((t) => ["ny", "afventer_os"].includes(t.status));
  const opfoelgninger = traade.flatMap((t) => Object.values(t.opfoelgninger || {}).map((o) => ({ ...o, traad: t }))).filter((o) => ["kladde", "godkendt"].includes(o.status));
  const handlinger = [
    ...traade.filter((t) => ["ny", "afventer_os", "afventer_kunden"].includes(t.status)).slice(0, 3).map((t) => ({ id: `t-${t.id}`, firma: t.virksomhedsnavn || t.kontaktNavn || t.senesteFra || "Ukendt henvendelse", emne: t.emne, uid: t.ansvarligUid, knap: t.status === "afventer_kunden" ? "Åbn samtale" : "Læs forespørgsel", til: "/main/salg/indbakke" })),
    ...aabne.filter((a) => erForfaldenAktivitet(a, iDag) || a.fristDato === iDag).slice(0, 2).map((a) => ({ id: `a-${a.id}`, firma: a.virksomhedsnavn, emne: a.titel, uid: a.ansvarligUid, knap: "Planlæg", til: "/main/salg/aktiviteter" })),
  ].slice(0, 4);
  const ansvarligAfgrænsede = ansvarligFilter === "Alle" ? handlinger : handlinger.filter((h) => profilnavn(profiler, h.uid).startsWith(ansvarligFilter));
  const synligeHandlinger = visMine ? ansvarligAfgrænsede.filter((h) => !h.uid || h.uid === bruger?.uid) : ansvarligAfgrænsede;

  return <div className="ejer-overblik-design">
    <section className="ejer-kpi-ribbon">
      <Kpi ikon="mail" label="Nye henvendelser" vaerdi={nye.length} til="/main/salg/indbakke" />
      <Kpi ikon="document" label="Afventer vores svar" vaerdi={afventerOs.length} til="/main/salg/indbakke" />
      <Kpi ikon="mail" label="Mails til godkendelse" vaerdi={opfoelgninger.length} til="/main/salg/aktiviteter?filter=godkendelser" />
      <Kpi ikon="calendar" label="Opgaver i dag" vaerdi={aabne.filter((a) => a.fristDato === iDag).length} til="/main/salg/aktiviteter?filter=idag" />
    </section>
    <div className="ejer-overblik-hoved">
      <section className="ejer-design-kort ejer-opmaerksomhed"><h2>Det kræver din opmærksomhed</h2><div className="ejer-tabs"><button type="button" className={visMine ? "aktiv" : ""} onClick={() => setVisMine(true)}>Mine</button><button type="button" className={!visMine ? "aktiv" : ""} onClick={() => setVisMine(false)}>Alle</button></div><div className="ejer-opmaerksomhed-tabel"><header><span>Kunde</span><span>Emne</span><span>Ansvarlig</span><span>Handling</span><span /></header>
        {synligeHandlinger.map((h) => { const navn = profilnavn(profiler, h.uid); return <div key={h.id}><strong>{h.firma}</strong><span>{h.emne}</span><span className="ejer-ansvarlig"><i>{initialer(navn)}</i>{navn.split(" ")[0]}</span><Link className="ejer-primaer" to={h.til}>{h.knap}</Link><EjerIkon navn="chevron" size={17} /></div>; })}
        {!synligeHandlinger.length && <p className="ejer-tomlinje">Ingen henvendelser eller opgaver kræver handling lige nu.</p>}
      </div></section>
      <aside className="ejer-design-kort ejer-assistentkort"><h2><EjerIkon navn="sparkles" size={30} /> Veyro-assistent</h2><div className="ejer-assistentbody"><small>TESTADAPTER · ingen ekstern AI</small><strong>{nye.length || afventerOs.length} nye forespørgsler er opsummeret</strong><p>Vi har samlet de seneste henvendelser og fremhæver, hvad der kræver din opmærksomhed.</p><hr /><p><EjerIkon navn="check" size={14} /> Se kundens behov</p><p><EjerIkon navn="check" size={14} /> Afklar manglende oplysninger</p><Link className="ejer-primaer" to="/main/salg/indbakke">Åbn salgsindbakken <EjerIkon navn="chevron" size={16} /></Link></div><small className="ejer-infoboks"><EjerIkon navn="info" size={18} /> Assistenten er et værktøj til at samle information. Alle henvendelser gennemgås og behandles af dig.</small></aside>
    </div>
    <div className="ejer-overblik-bund">
      <section className="ejer-design-kort ejer-salgkort"><h2>Salg og økonomi · September 2026</h2><div>
        <Link to="/main/salg/tilbud"><span className="ejer-ikonfelt"><EjerIkon navn="document" /></span><small>Tilbud uden svar</small><b>{muligheder.filter(erAabenMulighed).length}</b><em>Se alle tilbud <EjerIkon navn="chevron" size={15} /></em></Link>
        <Link to="/main/oekonomi/fakturaer"><span className="ejer-ikonfelt"><EjerIkon navn="document" /></span><small>Fakturaer til frigivelse</small><b>2</b><em>Gå til fakturaer <EjerIkon navn="chevron" size={15} /></em></Link>
        <Link to="/main/oekonomi/bilag"><span className="ejer-ikonfelt"><EjerIkon navn="link" /></span><small>Bilag til gennemgang</small><b>5</b><em>Gå til bilagsindbakke <EjerIkon navn="chevron" size={15} /></em></Link>
      </div></section>
      <section className="ejer-design-kort ejer-seneste"><h2>Seneste aktivitet <Link to="/main/salg/aktiviteter">Se alle</Link></h2>{traade.slice(0,3).map((t,i)=><div key={t.id}><span className="ejer-ikonfelt"><EjerIkon navn={i===1?"mail":"document"} /></span><p><b>{i===0?"Tilbudsversion gemt":i===1?"Svar registreret fra Outlook":"Opfølgning sat på pause"}</b><small>{t.virksomhedsnavn || t.kontaktNavn || t.emne}</small></p><time>{t.senesteAktivitetMs ? new Date(t.senesteAktivitetMs).toLocaleString("da-DK",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "I dag"}<small>{profilnavn(profiler,t.ansvarligUid).split(" ")[0]}</small></time></div>)}</section>
    </div>
  </div>;
}
