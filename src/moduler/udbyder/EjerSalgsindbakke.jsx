import { useEffect, useMemo, useState } from "react";
import { Felt, Knap, Kort, Pille } from "../../fleet/ui.jsx";
import {
  MAILSTATUS, SALGSSTATUS, afsendSalgsopfoelgning, gemAnalyseSvarudkast, gemSalgsopfoelgning, godkendSalgsopfoelgning,
  hentSalgsplatform, hentSalgsvedhaeftning, koerSalgsanalyse, opdaterSalgstraad, opretSalgsnote,
  saetSalgsopfoelgningStatus, spoergSalgsassistent, synkroniserMicrosoft365,
} from "../../fleet/ejer-salgsindbakke.js";
import { useEjerData } from "./EjerDataContext.jsx";

const tilListe = (o) => Object.entries(o || {}).map(([id, v]) => ({ id, ...v }));
const dato = (ms) => ms ? new Date(ms).toLocaleString("da-DK") : "—";

function Besked({ besked, traadId }) {
  const hent = async (v) => { const r = await hentSalgsvedhaeftning({ traadId, beskedId: besked.id, vedhaeftningId: v.id }); if (r.ok) window.location.assign(r.data.url); };
  return <article className={`ejer-mail ${besked.retning === "udgaaende" ? "ejer-mail-ud" : ""}`}>
    <header><strong>{besked.retning === "udgaaende" ? `Til ${besked.til}` : besked.fra}</strong><time>{dato(besked.sendtMs)}</time></header>
    <p className="ejer-mail-emne">{besked.emne}</p><pre>{besked.tekst}</pre>
    {!!Object.keys(besked.vedhaeftninger || {}).length && <ul className="ejer-vedhaeftninger">{tilListe(besked.vedhaeftninger).map((v) => <li key={v.id}>📎 {v.status === "gemt" ? <button type="button" className="fc-a" onClick={() => hent(v)}>{v.navn}</button> : v.navn} · {Math.ceil((v.stoerrelse || 0) / 1024)} KB {v.status !== "gemt" && "· Kun metadata"}</li>)}</ul>}
  </article>;
}

function AnalyseResultat({ analyse, traadId, arbejder, koer }) {
  const [svarudkast, setSvarudkast] = useState(analyse.svarudkast || "");
  return <div className="ejer-ai-resultat">
    <strong>AI-fortolkning — ikke bekræftede kundedata</strong><p>{analyse.opsummering}</p>
    <strong>Udledte behov</strong><ul>{(analyse.behov || []).map((x) => <li key={x}>{x}</li>)}</ul>
    <strong>Mulige Veyro-moduler</strong><ul>{(analyse.modulforslag || []).map((x, i) => <li key={`${x.modulId}-${i}`}><b>{x.modulId}</b> · {x.leveringsstatus}: {x.begrundelse}</li>)}</ul>
    <strong>Manglende oplysninger</strong><ul>{(analyse.manglendeOplysninger || []).map((x) => <li key={x}>{x}</li>)}</ul>
    <strong>Uafklarede spørgsmål</strong><ul>{(analyse.afklarendeSpoergsmaal || []).map((x) => <li key={x}>{x}</li>)}</ul>
    <strong>Forslag til næste handling</strong><p>{analyse.naesteHandling}</p>
    {!!analyse.kildehenvisninger?.length && <><strong>Henvisninger til kundens mail</strong><ul>{analyse.kildehenvisninger.map((x, i) => <li key={`${x.beskedId}-${i}`}>“{x.citat}” — {x.understoetter}</li>)}</ul></>}
    <Felt id={`analyse-svar-${analyse.id}`} label="Redigerbart svarudkast" vaerdi={svarudkast} saet={setSvarudkast} multiline />
    <Knap onClick={() => koer(() => gemAnalyseSvarudkast({ traadId, analyseId: analyse.id, svarudkast, forventetRevision: analyse.revision || 0 }))} disabled={arbejder || svarudkast === (analyse.svarudkast || "")}>Gem redigeret svarudkast</Knap>
  </div>;
}

export default function EjerSalgsindbakke() {
  const { profiler, crm, tilbud } = useEjerData();
  const [data, setData] = useState(null); const [fejl, setFejl] = useState(""); const [arbejder, setArbejder] = useState(false);
  const [valgtId, setValgtId] = useState(""); const [soeg, setSoeg] = useState(""); const [status, setStatus] = useState("alle");
  const [note, setNote] = useState(""); const [assistent, setAssistent] = useState(""); const [svar, setSvar] = useState(null);
  const indlaes = async () => { try { setData(await hentSalgsplatform()); setFejl(""); } catch (e) { setFejl(e.message); } };
  useEffect(() => { indlaes(); }, []);
  const traade = useMemo(() => tilListe(data?.traade).filter((t) => status === "alle" || (status === "mine" ? t.ansvarligUid === profiler?.[0]?.uid : t.status === status)).filter((t) => `${t.emne} ${t.senesteFra}`.toLowerCase().includes(soeg.toLowerCase())).sort((a, b) => (b.senesteAktivitetMs || 0) - (a.senesteAktivitetMs || 0)), [data, status, soeg, profiler]);
  useEffect(() => { if (!valgtId && traade[0]) setValgtId(traade[0].id); }, [traade, valgtId]);
  const valgt = data?.traade?.[valgtId];
  const [redigering, setRedigering] = useState(null);
  useEffect(() => { if (valgt) setRedigering({ status: valgt.status || "ny", ansvarligUid: valgt.ansvarligUid || "", virksomhedId: valgt.links?.virksomhedId || "", mulighedId: valgt.links?.mulighedId || "", tilbudId: valgt.links?.tilbudId || "" }); }, [valgtId, valgt?.revision]);
  const koer = async (handling) => { setArbejder(true); const r = await handling(); setArbejder(false); setSvar(r); if (r?.ok) await indlaes(); return r; };
  const firmaer = tilListe(crm).map((v) => ({ vaerdi: v.id, label: v.stamdata?.navn || v.id }));
  const muligheder = valgt?.links?.virksomhedId ? tilListe(crm?.[valgt.links.virksomhedId]?.muligheder).map((v) => ({ vaerdi: v.id, label: v.titel || v.id })) : [];
  const tilbudsliste = tilListe(tilbud).map((v) => ({ vaerdi: v.id, label: `${v.nummer || v.id} · v${v.aktuelVersion || 0}` }));
  const integration = data?.integrationer?.microsoft365 || {};
  const antalNy = tilListe(data?.traade).filter((t) => t.status === "ny").length;
  return <div className="fc-grid ejer-indbakke-side">
    <div className="ejer-indbakke-tabs" role="tablist" aria-label="Filtrér mailtråde">{[
      ["alle", "Alle"], ["ny", `Nye ${antalNy ? `(${antalNy})` : ""}`], ["afventer_os", "Afventer os"], ["afventer_kunden", "Afventer kunden"], ["mine", "Mine"],
    ].map(([v, label]) => <button type="button" role="tab" aria-selected={status === v} className={status === v ? "aktiv" : ""} key={v} onClick={() => setStatus(v)}>{label}</button>)}</div>
    <div className="ejer-integrationnote"><span className={integration.status === "aktiv" ? "aktiv" : "ikke"}>{integration.status === "aktiv" ? "Microsoft 365 tilsluttet" : "TESTADAPTER · Microsoft 365 ikke tilsluttet"}</span><Knap onClick={() => koer(synkroniserMicrosoft365)} disabled={arbejder || integration.status !== "aktiv"}>Synkronisér nu</Knap></div>
    {fejl && <p className="fc-fejltekst">{fejl}</p>}{svar && !svar.ok && <p className="fc-fejltekst">{svar.besked}</p>}
    <div className="ejer-indbakke">
      <aside className="ejer-traadliste" aria-label="Mailtråde">
        <Felt id="indbakke-soeg" label="Søg" vaerdi={soeg} saet={setSoeg} />
        <div className="ejer-traadfilter"><Felt id="indbakke-status" label="Status" vaerdi={status === "mine" ? "alle" : status} saet={setStatus} valgmuligheder={[{ vaerdi: "alle", label: "Alle" }, ...Object.entries(SALGSSTATUS).map(([vaerdi, label]) => ({ vaerdi, label }))]} /></div>
        <div>{traade.map((t) => <button type="button" className={t.id === valgtId ? "aktiv" : ""} key={t.id} onClick={() => setValgtId(t.id)}><span>{t.emne}</span><small>{t.senesteFra} · {dato(t.senesteAktivitetMs)}</small><Pille>{SALGSSTATUS[t.status] || t.status}</Pille></button>)}</div>
        {!traade.length && <p className="fc-hint">Ingen henvendelser matcher filtrene.</p>}
      </aside>
      <section className="ejer-samtale" aria-label="Samtale">
        {valgt ? <><header><h2>{valgt.emne}</h2><Pille>{SALGSSTATUS[valgt.status]}</Pille></header>
          <div className="ejer-mails">{tilListe(valgt.beskeder).sort((a, b) => a.sendtMs - b.sendtMs).map((b) => <Besked key={b.id} besked={b} traadId={valgtId} />)}</div>
          <Kort titel="Interne noter — medsendes aldrig"><div className="ejer-noter">{tilListe(valgt.noter).map((n) => <p key={n.id}><strong>Intern note · {dato(n.oprettetMs)}</strong><br />{n.tekst}</p>)}</div><Felt id="intern-note" label="Ny intern note" vaerdi={note} saet={setNote} multiline /><Knap onClick={() => koer(async () => { const r = await opretSalgsnote({ traadId: valgtId, tekst: note }); if (r.ok) setNote(""); return r; })} disabled={arbejder || !note.trim()}>Gem note</Knap></Kort>
        </> : <p>Vælg en tråd.</p>}
      </section>
      <aside className="ejer-sagspanel" aria-label="Kundedata og AI-assistent">
        {valgt && redigering && <>
          <Kort titel="Sagskobling">{(valgt.kontaktNavn || valgt.kontaktEmail || valgt.kontaktTelefon) && <p className="fc-hint"><b>Henvendelsens kontakt:</b> {[valgt.kontaktNavn, valgt.kontaktEmail, valgt.kontaktTelefon].filter(Boolean).join(" · ")}</p>}<Felt id="traad-status" label="Status" vaerdi={redigering.status} saet={(v) => setRedigering({ ...redigering, status: v })} valgmuligheder={Object.entries(SALGSSTATUS).map(([vaerdi, label]) => ({ vaerdi, label }))} /><Felt id="traad-ejer" label="Ansvarlig" vaerdi={redigering.ansvarligUid} saet={(v) => setRedigering({ ...redigering, ansvarligUid: v })} valgmuligheder={[{ vaerdi: "", label: "Ikke fordelt" }, ...(profiler || []).map((p) => ({ vaerdi: p.uid, label: p.navn }))]} /><Felt id="traad-firma" label="Virksomhed" vaerdi={redigering.virksomhedId} saet={(v) => setRedigering({ ...redigering, virksomhedId: v, mulighedId: "" })} valgmuligheder={[{ vaerdi: "", label: "Ukendt afsender / henvendelse" }, ...firmaer]} /><Felt id="traad-mulighed" label="Salgsmulighed" vaerdi={redigering.mulighedId} saet={(v) => setRedigering({ ...redigering, mulighedId: v })} valgmuligheder={[{ vaerdi: "", label: "Ikke koblet" }, ...muligheder]} /><Felt id="traad-tilbud" label="Tilbud" vaerdi={redigering.tilbudId} saet={(v) => setRedigering({ ...redigering, tilbudId: v })} valgmuligheder={[{ vaerdi: "", label: "Ikke koblet" }, ...tilbudsliste]} /><Knap onClick={() => koer(() => opdaterSalgstraad({ traadId: valgtId, forventetRevision: valgt.revision || 0, ...redigering }))} disabled={arbejder}>Gem sagskobling</Knap></Kort>
          <Kort titel="AI-analyse"><p className="fc-hint">Kundens mail bevares. Analysen er fortolkning og ændrer ikke CRM eller tilbud. Nye henvendelser analyseres automatisk, når integrationen er aktiv.</p><Knap onClick={() => koer(() => koerSalgsanalyse({ traadId: valgtId }))} disabled={arbejder || data?.integrationer?.openai?.status !== "aktiv"}>Analysér igen</Knap>{data?.integrationer?.openai?.status !== "aktiv" && <p className="fc-hint">Ikke tilsluttet.</p>}{valgt.aiAnalyseJob?.status === "fejlet" && <p className="fc-fejltekst">Automatisk analyse fejlede: {valgt.aiAnalyseJob.fejl}</p>}{tilListe(valgt.analyser).slice(-1).map((a) => <AnalyseResultat key={a.id} analyse={a} traadId={valgtId} arbejder={arbejder} koer={koer} />)}</Kort>
          <Kort titel="Veyro-salgsassistent"><p className="fc-hint">Intern samtale. Indholdet medsendes aldrig som kundemail.</p><Felt id="ai-spoerg" label="Spørg til denne sag" vaerdi={assistent} saet={setAssistent} multiline /><Knap onClick={() => koer(async () => { const r = await spoergSalgsassistent({ traadId: valgtId, spoergsmaal: assistent }); if (r.ok) setAssistent(""); return r; })} disabled={arbejder || !assistent.trim() || data?.integrationer?.openai?.status !== "aktiv"}>Send til assistent</Knap>{tilListe(valgt.aiSamtaler).slice(-3).map((a) => <div className="ejer-ai-resultat" key={a.id}><strong>Internt spørgsmål</strong><p>{a.spoergsmaal}</p><strong>Forslag</strong><p>{a.svar}</p></div>)}</Kort>
          <Opfoelgning key={valgtId} traad={valgt} traadId={valgtId} arbejder={arbejder} koer={koer} />
        </>}
      </aside>
    </div>
  </div>;
}

function Opfoelgning({ traad, traadId, arbejder, koer }) {
  const seneste = tilListe(traad.opfoelgninger).sort((a, b) => (b.opdateretMs || 0) - (a.opdateretMs || 0))[0];
  const [f, setF] = useState({ til: traad.senesteFra || "", emne: `Opfølgning: ${traad.emne}`, tekst: "", signatur: "Venlig hilsen\nVeyro Systems", forfalder: "" });
  const [redigerId, setRedigerId] = useState(null);
  const rediger = () => { if (!seneste) return; setRedigerId(seneste.id); setF({ til: seneste.til, emne: seneste.emne, tekst: seneste.tekst, signatur: seneste.signatur || "", forfalder: new Date(seneste.forfalderMs).toISOString().slice(0, 16) }); };
  const status = (ny) => koer(() => saetSalgsopfoelgningStatus({ traadId, id: seneste.id, status: ny, forfalderMs: Date.parse(f.forfalder), forventetRevision: seneste.revision }));
  return <Kort titel="Opfølgning med godkendelse"><p className="fc-hint">Ingen mail sendes uden konkret godkendelse. Nye svar eller ændringer kræver ny godkendelse.</p>{seneste && <p>Status: <strong>{MAILSTATUS[seneste.status] || seneste.status}</strong></p>}<Felt id="opf-dato" type="datetime-local" label="Opfølgningsdato" vaerdi={f.forfalder} saet={(v) => setF({ ...f, forfalder: v })} /><Felt id="opf-til" label="Modtager" vaerdi={f.til} saet={(v) => setF({ ...f, til: v })} /><Felt id="opf-emne" label="Emne" vaerdi={f.emne} saet={(v) => setF({ ...f, emne: v })} /><Felt id="opf-tekst" label="Tekst" vaerdi={f.tekst} saet={(v) => setF({ ...f, tekst: v })} multiline /><div className="fc-actions"><Knap onClick={() => koer(async () => { const r = await gemSalgsopfoelgning({ traadId, id: redigerId || undefined, ...f, forfalderMs: Date.parse(f.forfalder), forventetRevision: redigerId ? seneste.revision : 0 }); if (r.ok) setRedigerId(null); return r; })} disabled={arbejder || !f.tekst || !f.forfalder}>{redigerId ? "Gem ændret opfølgning" : "Gem opfølgning"}</Knap>{seneste && !["annulleret", "dokumenteret_sendt", "afsender", "accepteret_af_graph", "ukendt"].includes(seneste.status) && <Knap onClick={rediger} disabled={arbejder}>Redigér</Knap>}{seneste?.status === "kladde" && <Knap onClick={() => koer(() => godkendSalgsopfoelgning({ traadId, id: seneste.id, forventetRevision: seneste.revision }))} disabled={arbejder}>Godkend konkret tekst</Knap>}{seneste?.status === "godkendt" && <Knap variant="primaer" onClick={() => koer(() => afsendSalgsopfoelgning({ traadId, id: seneste.id, forventetRevision: seneste.revision }))} disabled={arbejder}>Godkendt — send</Knap>}{seneste && !["annulleret", "dokumenteret_sendt", "afsender", "accepteret_af_graph", "ukendt"].includes(seneste.status) && <><Knap onClick={() => status("udskudt")} disabled={arbejder || !f.forfalder}>Udsæt</Knap><Knap onClick={() => status("annulleret")} disabled={arbejder}>Annullér</Knap></>}</div></Kort>;
}
