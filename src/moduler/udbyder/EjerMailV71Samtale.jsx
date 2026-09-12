import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  SAGSTYPE_LABEL, afsendKommunikationssvar, gemKommunikationsAiChat,
  gemKommunikationsSagsoplysning, gemKommunikationssvarkladde,
  godkendKommunikationssvar, opdaterKommunikationsklassifikation,
  opdaterSalgstraad, opretSalgsnote,
} from "../../fleet/ejer-salgsindbakke.js";
import {
  forslagErForældet, lokalAiChatRevision, oplysningerForSag, tekstfingeraftryk,
} from "../../fleet/ejer-mail-v7-regler.js";
import EjerIkon from "./EjerIkon.jsx";

const poster = (objekt) => Object.entries(objekt || {}).map(([id, post]) => ({ id, ...post }));
const egetNavn = (bruger) => bruger?.displayName || (bruger?.navn && !bruger.navn.includes("@") ? bruger.navn : "Dennis");
const ejerNavn = (uid, bruger) => uid === bruger?.uid ? egetNavn(bruger) : uid ? "Jørn" : "Ikke fordelt";
const dato = (ms) => ms ? new Date(ms).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" }) : "—";
const statusTekst = { ny: "Ny", afventer_os: "Afventer os", afventer_kunden: "Afventer kunden", afsluttet: "Afsluttet" };

function Testmaerke() {
  return <span className="ejer-testmaerke"><EjerIkon navn="info" size={15}/><span>Syntetiske testdata · eksterne tjenester ikke tilsluttet</span></span>;
}

function Kildetekst({ traad, bruger }) {
  const kilder = Object.values(traad?.postkasseKilder || {});
  const personlig = kilder.find((kilde) => kilde.type === "personlig");
  if (personlig) return <>Modtaget i {personlig.ejerUid === bruger?.uid ? egetNavn(bruger) : "Jørn"}s postkasse · {traad.delingsstatus === "delt" ? "Delt på sagen" : "Privat/afventer deling"}</>;
  return <>{kilder.some((kilde) => kilde.adresse === "info@veyrosystems.com") ? "Fælles · info@veyrosystems.com" : "Kilde kræver gennemgang"}</>;
}

function SvarReviewDialog({ kladde, svartekst, onLuk, onGodkend, arbejder }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const tast = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onLuk(); return; }
      if (event.key !== "Tab") return;
      const kontroller = [...(ref.current?.querySelectorAll("button:not([disabled])") || [])];
      if (!kontroller.length) return;
      const foerste = kontroller[0]; const sidste = kontroller.at(-1);
      if (event.shiftKey && document.activeElement === foerste) { event.preventDefault(); sidste.focus(); }
      else if (!event.shiftKey && document.activeElement === sidste) { event.preventDefault(); foerste.focus(); }
    };
    document.addEventListener("keydown", tast);
    return () => document.removeEventListener("keydown", tast);
  }, [onLuk]);
  return <div className="ejer-modalbaggrund"><section ref={ref} className="ejer-mail-reviewdialog" role="dialog" aria-modal="true" aria-labelledby="svar-review-titel">
    <header><div><small>Kontrol før godkendelse</small><h2 id="svar-review-titel">Gennemse svar</h2></div><button type="button" className="fc-btn" onClick={onLuk} aria-label="Luk gennemgang">Luk</button></header>
    <dl><dt>Fra</dt><dd>{kladde.fra}</dd><dt>Til</dt><dd>{kladde.til}</dd><dt>Emne</dt><dd>{kladde.emne}</dd><dt>Godkendelse</dt><dd>Afventer din konkrete godkendelse</dd></dl>
    <div className="ejer-mail-reviewtekst">{svartekst}</div>
    <div><b>Vedhæftninger</b><p>{kladde.vedhaeftninger?.length ? kladde.vedhaeftninger.map((fil) => fil.navn).join(", ") : "Ingen vedhæftninger"}</p></div>
    <p className="ejer-infoboks"><EjerIkon navn="info" size={18}/> Kun kundetekst og de viste vedhæftninger godkendes. AI-chat og interne noter indgår aldrig.</p>
    <footer><button type="button" className="fc-btn" onClick={onLuk}>Fortsæt redigering</button><button type="button" className="fc-btn fc-btn-primary" onClick={onGodkend} disabled={arbejder}>Godkend svar</button></footer>
  </section></div>;
}

export default function EjerMailV71Samtale({ valgt, bruger, hent, params, lokaleKladder, setLokaleKladder, tilbage }) {
  const navigate = useNavigate();
  const [besked, setBesked] = useState(""); const [internNote, setInternNote] = useState("");
  const [arbejder, setArbejder] = useState(false); const [aktivFane, setAktivFane] = useState("svarudkast");
  const [aiInstruks, setAiInstruks] = useState(""); const [mobilpanel, setMobilpanel] = useState("samtale"); const [visHeleSenesteForslag, setVisHeleSenesteForslag] = useState(false);
  const [visReview, setVisReview] = useState(false); const reviewKnapRef = useRef(null);
  const mails = poster(valgt.beskeder).sort((a, b) => Number(a.sendtMs) - Number(b.sendtMs));
  const analyse = poster(valgt.analyser).sort((a, b) => Number(b.oprettetMs) - Number(a.oprettetMs))[0];
  const kladde = poster(valgt.svarKladder).sort((a, b) => Number(b.opdateretMs) - Number(a.opdateretMs))[0];
  const svartekst = lokaleKladder[valgt.id] ?? kladde?.tekst ?? analyse?.svarudkast ?? "";
  const beskidt = Object.hasOwn(lokaleKladder, valgt.id) && lokaleKladder[valgt.id] !== (kladde?.tekst ?? analyse?.svarudkast ?? "");
  const oplysninger = oplysningerForSag(valgt); const aiRum = valgt.aiArbejdsrum || {};
  const aiForslag = aiRum.aktivtForslag || null; const aiHistorik = poster(aiRum.chat).sort((a, b) => Number(a.oprettetMs) - Number(b.oprettetMs));
  const saelgerBaggrund = oplysninger.find((post) => post.id === "saelgerBaggrund");
  const kundebekraeftet = oplysninger.filter((post) => post.id !== "saelgerBaggrund" && post.tilstand !== "mangler");
  const mangler = oplysninger.filter((post) => post.tilstand === "mangler");
  const [baggrund, setBaggrund] = useState(saelgerBaggrund?.vaerdi || "");
  useEffect(() => setBaggrund(saelgerBaggrund?.vaerdi || ""), [valgt.id, saelgerBaggrund?.revision]);
  const forslagForældet = forslagErForældet(aiForslag, { senesteAktivitetMs: valgt.senesteAktivitetMs, kladdeRevision: kladde?.revision || 0, kladdetekst: svartekst });

  const udfoer = async (handling, succes = "Ændringen er gemt.") => {
    setArbejder(true); setBesked("");
    const resultat = await handling();
    setArbejder(false); setBesked(resultat.ok ? succes : resultat.besked || "Handlingen kunne ikke gennemføres.");
    await hent(); return resultat;
  };
  const overtag = () => udfoer(() => opdaterSalgstraad({ traadId: valgt.id, status: valgt.status, ansvarligUid: bruger.uid, forventetRevision: valgt.revision, ...(valgt.links || {}) }), "Sagen er overtaget af " + egetNavn(bruger) + ".");
  const gemNote = () => internNote.trim() && udfoer(async () => { const r = await opretSalgsnote({ traadId: valgt.id, tekst: internNote }); if (r.ok) setInternNote(""); return r; }, "Den interne note er gemt og sendes aldrig til kunden.");
  const supportHandling = async () => {
    if (valgt.sagstype === "support") { navigate("/main/support?sag=" + encodeURIComponent(valgt.id)); return; }
    const r = await udfoer(() => opdaterKommunikationsklassifikation({ traadId: valgt.id, sagstype: "support", delingsstatus: "delt", forventetRevision: valgt.revision }));
    if (r.ok) navigate("/main/support?sag=" + encodeURIComponent(valgt.id));
  };
  const gemSvar = async () => {
    const r = await udfoer(() => gemKommunikationssvarkladde({
      traadId: valgt.id, id: kladde?.id, fra: kladde?.fra || "info@veyrosystems.com",
      til: kladde?.til || valgt.kontaktEmail, emne: kladde?.emne || "Re: " + valgt.emne,
      tekst: svartekst, signatur: "Venlig hilsen\n" + egetNavn(bruger),
      vedhaeftninger: kladde?.vedhaeftninger || [], basisAktivitetMs: valgt.senesteAktivitetMs,
      forventetRevision: kladde?.revision || 0,
    }), "Svarudkastet er gemt. Det er ikke sendt.");
    if (r.ok) setLokaleKladder((gammel) => { const ny = { ...gammel }; delete ny[valgt.id]; return ny; });
    return r;
  };
  const godkendSvar = async () => {
    if (!kladde) return;
    const r = await udfoer(() => godkendKommunikationssvar({ traadId: valgt.id, id: kladde.id, forventetRevision: kladde.revision }), "Det viste svar er godkendt og afventer særskilt afsendelse.");
    if (r.ok) { setVisReview(false); requestAnimationFrame(() => reviewKnapRef.current?.focus()); }
  };
  const afsendSvar = () => kladde && udfoer(() => afsendKommunikationssvar({ traadId: valgt.id, id: kladde.id, forventetRevision: kladde.revision }));
  const gemBaggrund = () => udfoer(() => gemKommunikationsSagsoplysning({ traadId: valgt.id, vaerdi: baggrund, forventetRevision: saelgerBaggrund?.revision || 0 }), "Oplysningen er gemt internt på den delte sag.");
  const foreslaaSvar = async ({ blivPaaFane = false } = {}) => {
    if (!aiInstruks.trim()) return;
    const instruktioner = [...aiHistorik.filter((post) => post.rolle === "ejer").map((post) => post.tekst), aiInstruks.trim()];
    const forslag = lokalAiChatRevision({ navn: valgt.kontaktNavn, oplysninger, instruktioner, signatur: egetNavn(bruger) });
    const r = await udfoer(() => gemKommunikationsAiChat({
      traadId: valgt.id, operationId: crypto.randomUUID(), instruktion: aiInstruks.trim(), forslag: forslag.tekst,
      forventetRevision: aiRum.revision || 0, basisAktivitetMs: valgt.senesteAktivitetMs,
      basisKladdeRevision: kladde?.revision || 0, basisKladdeFingeraftryk: tekstfingeraftryk(svartekst),
    }), "AI-forslaget er gemt i det fælles, interne arbejdsrum. Det er ikke indsat eller sendt.");
    if (r.ok) { setAiInstruks(""); setVisHeleSenesteForslag(false); if (!blivPaaFane) setAktivFane("ai-chat"); }
  };
  const indsætForslag = () => {
    if (!aiForslag || forslagForældet) { setBesked("Forslaget bygger på en ældre mail eller kladde. Lav et nyt forslag først."); return; }
    setLokaleKladder((gammel) => ({ ...gammel, [valgt.id]: aiForslag.tekst }));
    setAktivFane("svarudkast"); setBesked("Forslaget er indsat lokalt i svarudkastet. Gem kladden for at dele ændringen.");
  };
  useEffect(() => {
    const tast = (event) => { if (event.key === "Escape" && !visReview) { event.preventDefault(); tilbage(beskidt); } };
    document.addEventListener("keydown", tast); return () => document.removeEventListener("keydown", tast);
  });
  useEffect(() => {
    const beskyt = (event) => { if (!beskidt) return; event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beskyt); return () => window.removeEventListener("beforeunload", beskyt);
  }, [beskidt]);
  const internSag = valgt.sagstype === "intern";
  const modpart = internSag ? (valgt.modpartNavn || valgt.kontaktNavn || valgt.kontaktEmail) : (valgt.virksomhedsnavn || valgt.kontaktNavn || valgt.kontaktEmail);
  const faner = [["svarudkast", "Svarudkast"], ["ai-chat", "AI-chat"], ["oplysninger", "Oplysninger"]];

  return <div className="ejer-mail-v7-detalje">
    <div className="ejer-mail-detaljetop"><button type="button" className="ejer-tilbage" onClick={() => tilbage(beskidt)}>← Tilbage til {params.get("fra") === "sager" ? "sager og mapper" : "indbakke"}</button><Testmaerke/></div>
    <header className="ejer-mail-sagshoved"><div><small>{SAGSTYPE_LABEL[valgt.sagstype] || "Kræver gennemgang"} · <Kildetekst traad={valgt} bruger={bruger}/></small><h2>{valgt.emne}</h2><div className="ejer-mail-chips"><span>{modpart}</span><span>Ansvarlig: {ejerNavn(valgt.ansvarligUid, bruger)}</span><span>{statusTekst[valgt.status] || valgt.status}</span><span>{valgt.delingsstatus === "delt" ? "Delt med Dennis og Jørn" : "Personlig/afventer deling"}</span></div></div><div className="fc-actions"><button type="button" className="fc-btn" onClick={overtag} disabled={arbejder}>Overtag sag</button>{!internSag && valgt.links?.virksomhedId && <Link className="fc-btn" to="/main/kunder">Åbn kundekort</Link>}{!internSag && <button type="button" className="fc-btn" onClick={supportHandling}>{valgt.sagstype === "support" ? "Åbn Support" : "Knyt til Support"}</button>}</div></header>
    <div className="ejer-mail-mobilpaneler"><button type="button" className={mobilpanel === "samtale" ? "aktiv" : ""} onClick={() => setMobilpanel("samtale")}>Samtale</button><button type="button" className={mobilpanel === "svar" ? "aktiv" : ""} onClick={() => setMobilpanel("svar")}>Svar og AI</button></div>
    <div className={"ejer-mail-fokus mobil-" + mobilpanel}>
      <section className="ejer-design-kort ejer-mail-traadfokus"><header><h2>Samtale</h2><span>{mails.length} mails</span></header><div className="ejer-mail-beskeder">{mails.map((mail) => <article key={mail.id} className={mail.retning === "udgaaende" ? "udgaaende" : "indgaaende"}><header><div><b>{mail.retning === "udgaaende" ? (mail.sagsbehandlerNavn || "Veyro") : mail.fra}</b><small>{mail.retning === "udgaaende" ? "Fra " + (mail.fra || "info@veyrosystems.com") : "Til " + mail.til}</small></div><time>{dato(mail.sendtMs)}</time></header><h3>{mail.emne || valgt.emne}</h3><p>{mail.tekst}</p>{mail.vedhaeftninger?.length ? <div className="ejer-mail-vedhaeftninger"><EjerIkon navn="attachment" size={18}/>{mail.vedhaeftninger.map((fil) => <span key={fil.id || fil.navn}>{fil.navn} · {fil.status === "gemt" ? "tilgængelig" : "testmetadata"}</span>)}</div> : null}</article>)}</div><section className="ejer-intern-note"><h3>Interne noter · sendes aldrig til kunden</h3>{poster(valgt.noter).map((note) => <p key={note.id}><b>{ejerNavn(note.oprettetAf, bruger)}</b> · {dato(note.oprettetMs)}<br/>{note.tekst}</p>)}<textarea value={internNote} onChange={(event) => setInternNote(event.target.value)} placeholder="Skriv en intern note til sagen …"/><button type="button" className="fc-btn" onClick={gemNote} disabled={arbejder || !internNote.trim()}>Gem intern note</button></section></section>
      <aside className="ejer-design-kort ejer-mail-svarfokus"><header><span className="ejer-ikonfelt"><EjerIkon navn="sparkles"/></span><div><h2>Svar og AI</h2><small>Fælles internt arbejdsrum · eksterne tjenester ikke tilsluttet</small></div></header>
        <nav className="ejer-mail-ai-faner" role="tablist" aria-label="Svar og AI">{faner.map(([id, label]) => <button key={id} id={"fane-" + id} type="button" role="tab" aria-selected={aktivFane === id} aria-controls={"panel-" + id} className={aktivFane === id ? "aktiv" : ""} onClick={() => setAktivFane(id)}>{label}</button>)}</nav>
        <div className="ejer-mail-ai-paneler">
          {aktivFane === "svarudkast" && <section id="panel-svarudkast" role="tabpanel" aria-labelledby="fane-svarudkast" className="ejer-mail-ai-panel">
            <div className="ejer-svarmeta"><span><b>Fra</b>{kladde?.fra || "info@veyrosystems.com"}</span><span><b>Til</b>{kladde?.til || valgt.kontaktEmail || "—"}</span><span><b>Emne</b>{kladde?.emne || "Re: " + valgt.emne}</span></div>
            <section className="ejer-svarfakta"><header><b>Bekræftet og mangler</b><button type="button" onClick={() => setAktivFane("oplysninger")}>Se alle i Oplysninger</button></header><dl><dt>Bekræftet</dt><dd>{kundebekraeftet.map((post) => post.vaerdi).join(" · ") || "Ingen registrerede oplysninger"}</dd><dt>Mangler</dt><dd>{mangler.map((post) => post.label).join(", ") || "Ingen registrerede afklaringer"}</dd></dl></section>
            <div className="ejer-mail-editor"><div className="ejer-mail-formatlinje" aria-label="Tekstformatering"><button type="button" aria-label="Fed">B</button><button type="button" aria-label="Kursiv"><i>I</i></button><button type="button" aria-label="Understreget"><u>U</u></button><span/><button type="button" aria-label="Punktopstilling">☷</button></div><textarea aria-label="Svarudkast" value={svartekst} onChange={(event) => setLokaleKladder((gammel) => ({ ...gammel, [valgt.id]: event.target.value }))} rows="12"/></div>
            {beskidt && <small className="ejer-mail-ugemt">Ugemte ændringer · en tidligere godkendelse gælder ikke. Gem kladden, og gennemse den igen før afsendelse.</small>}
            {aiForslag && <section className={"ejer-ai-seneste " + (forslagForældet ? "foraeldet" : "")}><header><b>Seneste AI-revision</b><span>{forslagForældet ? "Grundlaget er ændret" : "Ikke indsat"}</span></header><p className={visHeleSenesteForslag ? "aaben" : ""}>{aiForslag.tekst}</p><div><button type="button" className="fc-btn" onClick={() => setVisHeleSenesteForslag((vis) => !vis)}>{visHeleSenesteForslag ? "Skjul hele forslaget" : "Vis hele forslaget"}</button><button type="button" className="fc-btn fc-btn-primary" onClick={indsætForslag} disabled={forslagForældet}>Indsæt i svarudkast</button></div></section>}
            <section className="ejer-mail-hurtiginstruks"><label>Bed AI ændre eller uddybe teksten<input value={aiInstruks} onChange={(event) => setAiInstruks(event.target.value)} placeholder="Fx: Gør tonen mere personlig, og forklar næste skridt"/></label><button type="button" className="fc-btn" onClick={() => foreslaaSvar({ blivPaaFane: true })} disabled={arbejder || !aiInstruks.trim()}>Lav ny revision</button><small>Fortsætter samme fælles AI-chat. Forslaget overskriver aldrig kladden automatisk.</small></section>
            <p className="ejer-mail-vedhaeftningslinje"><EjerIkon navn="attachment" size={17}/> {kladde?.vedhaeftninger?.length ? kladde.vedhaeftninger.map((fil) => fil.navn).join(", ") : "Ingen vedhæftninger"}</p><div className="ejer-svarhandlinger"><button type="button" className="fc-btn" onClick={gemSvar} disabled={arbejder || !svartekst.trim()}>Gem kladde</button>{valgt.sagstype === "salg" && <Link className="fc-btn" to="/main/tilbud">Opret tilbud</Link>}{kladde?.status === "godkendt" && !beskidt ? <button data-testid="afsend-godkendt-svar" type="button" className="fc-btn fc-btn-primary" onClick={afsendSvar} disabled={arbejder}>Afsend godkendt svar</button> : <button ref={reviewKnapRef} data-testid="gennemse-svar" type="button" className="fc-btn fc-btn-primary" onClick={() => setVisReview(true)} disabled={arbejder || beskidt || !kladde || kladde.status !== "kladde"}>{kladde?.status === "godkendt" && beskidt ? "Gem og gennemse igen" : "Gennemse og send"}</button>}</div><p className="fc-hint">Gennemgang godkender kun den viste kundetekst. Afsendelse er en særskilt handling og er blokeret, når Microsoft 365 ikke er tilsluttet.</p>
          </section>}
          {aktivFane === "ai-chat" && <section id="panel-ai-chat" role="tabpanel" aria-labelledby="fane-ai-chat" className="ejer-mail-ai-panel"><div className="ejer-ai-chatintro"><EjerIkon navn="info" size={18}/><span>Kun Dennis og Jørn kan se samtalen. Den kan aldrig medsendes til kunden.</span></div><div className="ejer-ai-chathistorik">{aiHistorik.map((post) => <article key={post.id} className={post.rolle === "ai" ? "ai" : "ejer"}><header><b>{post.rolle === "ai" ? "Lokal AI-testadapter" : post.aktorNavn}</b><time>{dato(post.oprettetMs)}</time></header><p>{post.tekst}</p></article>)}{!aiHistorik.length && <p className="ejer-tomlinje">Ingen intern AI-chat endnu. Skriv den første instruktion nedenfor.</p>}</div>{aiForslag && <section className={"ejer-ai-forslag " + (forslagForældet ? "foraeldet" : "")}><header><b>Forslag før indsættelse</b><span>{forslagForældet ? "Forældet grundlag" : "Ikke indsat"}</span></header><p>{aiForslag.tekst}</p><button type="button" className="fc-btn fc-btn-primary" onClick={indsætForslag} disabled={forslagForældet}>Indsæt i svarudkast</button></section>}<section className="ejer-mail-aiinstruks"><label>Fortsæt den fælles AI-chat<input value={aiInstruks} onChange={(event) => setAiInstruks(event.target.value)} placeholder="Fx: Gør forslaget kortere, men behold alle fakta"/></label><button type="button" className="fc-btn fc-btn-primary" onClick={foreslaaSvar} disabled={arbejder || !aiInstruks.trim()}>Lav nyt forslag</button></section><p className="fc-hint">Forslaget dannes af en deterministisk lokal testadapter. OpenAI kaldes ikke.</p></section>}
          {aktivFane === "oplysninger" && <section id="panel-oplysninger" role="tabpanel" aria-labelledby="fane-oplysninger" className="ejer-mail-ai-panel"><div className="ejer-oplysningstabel">{oplysninger.filter((post) => post.id !== "saelgerBaggrund").map((post) => <article key={post.id}><span className={"ejer-oplysning-status " + post.tilstand}><EjerIkon navn={post.tilstand === "mangler" ? "question" : "check"} size={16}/></span><div><b>{post.label}</b><strong>{post.vaerdi}</strong><small>Kilde: {post.kilde || "Ikke registreret"}</small></div></article>)}</div><label className="ejer-sagsbaggrund">Sælgerens ekstra baggrund<textarea rows="5" value={baggrund} onChange={(event) => setBaggrund(event.target.value)} placeholder="Tilføj intern kontekst uden at ændre kundens oplysninger"/><small>Intern sagsoplysning · sendes aldrig til kunden</small></label><button type="button" className="fc-btn" onClick={gemBaggrund} disabled={arbejder || baggrund === (saelgerBaggrund?.vaerdi || "")}>Gem intern baggrund</button>{valgt.dokumenter && <div className="ejer-oplysningsdokumenter"><b>Kilder og dokumenter</b>{poster(valgt.dokumenter).map((dokument) => <span key={dokument.id}><EjerIkon navn="document" size={17}/>{dokument.navn || dokument.id}</span>)}</div>}{internSag && <section className="ejer-intern-struktur"><h3>Intern sag og mappe</h3><p>Modpart: <b>{modpart}</b>. Sagen opretter ikke en kunde.</p><p>Foreslået mappe: <b>{valgt.foreslaaetMappe || "Domicil"}</b> · gælder kun denne sag.</p><div className="fc-actions"><button type="button" className="fc-btn" onClick={() => udfoer(() => opdaterKommunikationsklassifikation({ traadId: valgt.id, sagstype: "intern", delingsstatus: valgt.delingsstatus, internMappe: valgt.foreslaaetMappe || "Domicil", forventetRevision: valgt.revision }))}>Godkend sortering</button><button type="button" className="fc-btn" onClick={() => udfoer(() => opdaterKommunikationsklassifikation({ traadId: valgt.id, sagstype: "intern", delingsstatus: valgt.delingsstatus === "delt" ? "privat" : "delt", internMappe: valgt.internMappe || "", forventetRevision: valgt.revision }))}>{valgt.delingsstatus === "delt" ? "Gør personlig" : "Del med Jørn"}</button></div></section>}</section>}
        </div>
        {besked && <p className="ejer-handlingssvar" role="status">{besked}</p>}
      </aside>
    </div>
    {visReview && kladde && <SvarReviewDialog kladde={{ ...kladde, fra: kladde.fra || "info@veyrosystems.com", til: kladde.til || valgt.kontaktEmail, emne: kladde.emne || "Re: " + valgt.emne }} svartekst={svartekst} onLuk={() => { setVisReview(false); requestAnimationFrame(() => reviewKnapRef.current?.focus()); }} onGodkend={godkendSvar} arbejder={arbejder}/>}
  </div>;
}
