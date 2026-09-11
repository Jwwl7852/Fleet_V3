import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SAGSTYPE_LABEL, gemKommunikationssvarkladde, godkendKommunikationssvar,
  hentSalgsplatform, opdaterKommunikationsklassifikation, opdaterSalgstraad,
} from "../../fleet/ejer-salgsindbakke.js";
import EjerIkon from "./EjerIkon.jsx";

const poster = (objekt) => Object.entries(objekt || {}).map(([id, post]) => ({ id, ...post }));
const egetNavn = (bruger) => bruger?.displayName || (bruger?.navn && !bruger.navn.includes("@") ? bruger.navn : "Dennis");
const ejerNavn = (uid, bruger) => uid === bruger?.uid ? egetNavn(bruger) : uid ? "Jørn" : "Ikke fordelt";
const dato = (ms) => ms ? new Date(ms).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" }) : "—";
const statusTekst = { ny: "Ny", afventer_os: "Afventer os", afventer_kunden: "Afventer kunden", afsluttet: "Afsluttet" };

function Testmaerke() {
  return <span className="ejer-testmaerke"><EjerIkon navn="info" size={15} /> Syntetiske testdata · virkelige postkasser ikke tilsluttet</span>;
}

export default function EjerMailV2({ bruger, visning = "indbakker" }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("aabne");
  const [postkasse, setPostkasse] = useState("faelles");
  const [kunMineSager, setKunMineSager] = useState(false);
  const [soegning, setSoegning] = useState("");
  const [besked, setBesked] = useState("");
  const [arbejder, setArbejder] = useState(false);
  const [params, setParams] = useSearchParams();
  const hent = async () => setData(await hentSalgsplatform());
  useEffect(() => { hent(); }, []);

  const traade = useMemo(() => poster(data?.traade).filter((traad) => {
    if (visning === "sager" && !["intern", "leverandoer"].includes(traad.sagstype)) return false;
    if (visning === "sendt" && traad.senesteRetning !== "udgaaende") return false;
    if (visning === "indbakker" && ["intern", "leverandoer"].includes(traad.sagstype)) return false;
    if (filter === "nye" && traad.status !== "ny") return false;
    if (filter === "afventer_os" && traad.status !== "afventer_os") return false;
    if (filter === "afventer_kunden" && traad.status !== "afventer_kunden") return false;
    if (filter === "aabne" && traad.status === "afsluttet") return false;
    if (postkasse === "mine" && !Object.values(traad.postkasseKilder || {}).some((k) => k.type === "personlig" && k.ejerUid === bruger?.uid)) return false;
    if (postkasse === "faelles" && traad.delingsstatus !== "delt") return false;
    if (postkasse === "info" && !Object.values(traad.postkasseKilder || {}).some((k) => k.adresse === "info@veyrosystems.com")) return false;
    if (kunMineSager && traad.ansvarligUid !== bruger?.uid) return false;
    const q = soegning.trim().toLowerCase();
    return !q || `${traad.emne} ${traad.virksomhedsnavn} ${traad.kontaktNavn} ${traad.kontaktEmail}`.toLowerCase().includes(q);
  }).sort((a, b) => Number(b.senesteAktivitetMs || 0) - Number(a.senesteAktivitetMs || 0)), [data, filter, postkasse, kunMineSager, soegning, visning, bruger?.uid]);

  const valgtId = params.get("sag") || traade[0]?.id || "";
  const valgt = poster(data?.traade).find((t) => t.id === valgtId) || traade[0];
  const aaben = (id) => setParams((gamle) => { const naeste = new URLSearchParams(gamle); naeste.set("sag", id); return naeste; });
  const udfoer = async (fn) => {
    setArbejder(true); setBesked(""); const resultat = await fn(); setArbejder(false);
    setBesked(resultat.ok ? "Ændringen er gemt." : resultat.besked || "Handlingen kunne ikke gennemføres.");
    await hent(); return resultat;
  };
  const overtag = () => valgt && udfoer(() => opdaterSalgstraad({ traadId: valgt.id, status: valgt.status, ansvarligUid: bruger.uid, forventetRevision: valgt.revision, ...(valgt.links || {}) }));
  const delSom = (sagstype) => valgt && udfoer(() => opdaterKommunikationsklassifikation({ traadId: valgt.id, sagstype, delingsstatus: sagstype === "intern" ? "afklaring" : "delt", forventetRevision: valgt.revision }));

  if (!data) return <div className="fc-empty">Henter fælles kundekorrespondance…</div>;
  const beskeder = poster(valgt?.beskeder).sort((a, b) => Number(a.sendtMs) - Number(b.sendtMs));
  const analyse = poster(valgt?.analyser).sort((a, b) => Number(b.oprettetMs) - Number(a.oprettetMs))[0];
  const kladde = poster(valgt?.svarKladder).sort((a, b) => Number(b.opdateretMs) - Number(a.opdateretMs))[0];
  const senesteInd = [...beskeder].reverse().find((m) => m.retning === "indgaaende");

  return <div className="ejer-mail-v2">
    <div className="ejer-mail-toolbar">
      <div className="ejer-segmenter" role="tablist" aria-label="Postkassevisning">
        {[['mine','Min postkasse'],['faelles','Fælles kundekorrespondance'],['info','Fælles · info@']].map(([id,label]) => <button key={id} type="button" className={postkasse === id ? "aktiv" : ""} onClick={() => setPostkasse(id)}>{label}</button>)}
      </div>
      <Testmaerke />
    </div>
    <div className="ejer-mail-filterlinje">
      <div className="ejer-segmenter kompakt">{[['aabne','Alle åbne'],['nye','Nye'],['afventer_os','Afventer os'],['afventer_kunden','Afventer kunden']].map(([id,label]) => <button key={id} type="button" className={filter === id ? "aktiv" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div>
      <label className="ejer-mail-mine"><input type="checkbox" checked={kunMineSager} onChange={(event) => setKunMineSager(event.target.checked)} /> Kun mine sager</label>
      <label className="ejer-mail-soeg"><EjerIkon navn="search" size={19}/><input value={soegning} onChange={(e) => setSoegning(e.target.value)} placeholder="Søg i kunde, sag eller mail" /></label>
    </div>
    <div className="ejer-mail-arbejdsflade">
      <aside className="ejer-mail-mapper">
        <h2>Mapper</h2>
        {[['inbox','Indbakke',traade.length],['users','Kunder',poster(data?.traade).filter(t=>t.links?.virksomhedId).length],['document','Interne sager',poster(data?.traade).filter(t=>t.sagstype==='intern').length],['building','Leverandører',poster(data?.traade).filter(t=>t.sagstype==='leverandoer').length],['layers','Arkiv',poster(data?.traade).filter(t=>t.status==='afsluttet').length]].map(([ikon,label,antal]) => <button type="button" key={label}><EjerIkon navn={ikon} size={20}/><span>{label}</span><b>{antal}</b></button>)}
      </aside>
      <section className="ejer-mail-liste" aria-label="Sager">
        <header><b>Fra / Emne</b><span>Ansvarlig</span><span>Status</span></header>
        {traade.map((traad) => <button type="button" className={valgt?.id === traad.id ? "aktiv" : ""} key={traad.id} onClick={() => aaben(traad.id)}>
          <span><b>{traad.virksomhedsnavn || traad.kontaktNavn || traad.kontaktEmail || "Ukendt afsender"}</b><strong>{traad.emne}</strong><small>{SAGSTYPE_LABEL[traad.sagstype] || "Kræver gennemgang"} · {dato(traad.senesteAktivitetMs)}</small></span>
          <span className="ejer-person"><i>{ejerNavn(traad.ansvarligUid, bruger).slice(0,2).toUpperCase()}</i>{ejerNavn(traad.ansvarligUid, bruger)}</span>
          <span className={`fc-pill ${traad.status === 'ny' ? 'info' : traad.status === 'afventer_os' ? 'warn' : 'ok'}`}>{statusTekst[traad.status] || traad.status}</span>
        </button>)}
        {!traade.length && <p className="ejer-tomlinje">Ingen sager matcher filtrene.</p>}
        {valgt && <div className="ejer-mail-samtale" aria-label="Valgt kundekorrespondance">
          <header><div><small>Samtale</small><h2>{valgt.emne}</h2></div><span className={`fc-pill ${valgt.status === 'afventer_os' ? 'warn' : 'info'}`}>{statusTekst[valgt.status] || valgt.status}</span></header>
          {beskeder.map((mail) => <article key={mail.id} className={mail.retning === "udgaaende" ? "udgaaende" : "indgaaende"}>
            <header><b>{mail.retning === "udgaaende" ? `Veyro · ${mail.fra || "info@veyrosystems.com"}` : mail.fra}</b><time>{dato(mail.sendtMs)}</time></header>
            <p>{mail.tekst}</p>
            {Array.isArray(mail.vedhaeftninger) && mail.vedhaeftninger.length > 0 && <small>{mail.vedhaeftninger.length} vedhæftning(er) · syntetisk testgrundlag</small>}
          </article>)}
          <footer><EjerIkon navn="info" size={17}/> Interne noter og AI-samtaler medsendes aldrig i kundekorrespondancen.</footer>
        </div>}
      </section>
      <aside className="ejer-mail-ai">
        {valgt ? <>
          <header><span className="ejer-ikonfelt"><EjerIkon navn="sparkles"/></span><div><h2>AI holder øje</h2><small>{data.integrationer?.openai?.status === "aktiv" ? "Tilsluttet" : "Ikke tilsluttet · testadapter vises"}</small></div></header>
          <section><h3>{valgt.emne}</h3><p>{analyse?.opsummering || senesteInd?.tekst?.slice(0, 240) || "Ingen analyse endnu."}</p></section>
          {analyse && <section className="ejer-ai-fakta"><h3>Udledt fra kundens mail</h3><dl><dt>Bekræftet</dt><dd>{(analyse.behov || []).slice(0,2).join(" · ") || "—"}</dd><dt>Mangler</dt><dd>{(analyse.manglendeOplysninger || []).join(", ") || "Ingen registreret"}</dd></dl></section>}
          <section><h3>Sagsstyring</h3><p><b>{SAGSTYPE_LABEL[valgt.sagstype] || "Kræver gennemgang"}</b> · {valgt.delingsstatus === "delt" ? "Synlig for Dennis og Jørn" : "Afventer delingsafklaring"}</p><div className="fc-actions"><button className="fc-btn" type="button" onClick={overtag} disabled={arbejder}>Overtag sag</button><button className="fc-btn" type="button" onClick={() => delSom("support")} disabled={arbejder}>Vis i Support</button></div></section>
          <section><h3>Svarudkast</h3><textarea aria-label="Svarudkast" value={kladde?.tekst || analyse?.svarudkast || ""} readOnly rows="7"/><div className="fc-actions"><button className="fc-btn" type="button" disabled={arbejder || !analyse?.svarudkast || Boolean(kladde)} onClick={() => udfoer(() => gemKommunikationssvarkladde({ traadId: valgt.id, fra: "info@veyrosystems.com", til: valgt.kontaktEmail, emne: `Re: ${valgt.emne}`, tekst: analyse.svarudkast, signatur: "Venlig hilsen\nVeyro Systems", vedhaeftninger: [], basisAktivitetMs: valgt.senesteAktivitetMs, forventetRevision: 0 }))}>Gem kladde</button><button className="fc-btn fc-btn-primary" type="button" disabled={arbejder || !kladde || kladde.status !== "kladde"} onClick={() => udfoer(() => godkendKommunikationssvar({ traadId: valgt.id, id: kladde.id, forventetRevision: kladde.revision }))}>Gennemse og godkend</button></div><small>Intet sendes automatisk. Ændringer efter godkendelse kræver ny godkendelse.</small></section>
          {besked && <p className="ejer-handlingssvar" role="status">{besked}</p>}
        </> : <p>Vælg en sag.</p>}
      </aside>
    </div>
  </div>;
}
