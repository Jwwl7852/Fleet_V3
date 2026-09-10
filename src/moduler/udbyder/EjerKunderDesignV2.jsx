import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { crmVirksomhedsliste } from "../../fleet/ejer-crm-regler.js";
import { hentKundekonto } from "../../fleet/ejer-kundekonto.js";
import { hentSalgsplatform, spoergSalgsassistent } from "../../fleet/ejer-salgsindbakke.js";
import { hentEjerOekonomi } from "../../fleet/ejer-oekonomi.js";
import { dato, kr } from "../../fleet/format.js";
import { useEjerData } from "./EjerDataContext.jsx";
import EjerIkon from "./EjerIkon.jsx";

const poster = (objekt) => Object.entries(objekt || {}).map(([id, post]) => ({ id, ...post }));
const seneste = (objekt) => poster(objekt).sort((a, b) => (b.ms || b.oprettetMs || 0) - (a.ms || a.oprettetMs || 0))[0];
const historikTitel = (post) => ({
  "henvendelse.modtaget": "Forespørgsel modtaget",
  "mail.modtaget": "Kundemail modtaget",
  "mail.sendt": "Mail sendt",
  "tilbud.udstedt": "Tilbud udstedt",
  "tilbud.accepteret": "Tilbud accepteret",
  "aftale.provisioneret": "Aftale og kundekonto oprettet",
  "invitation.oprettet": "Administratorinvitation oprettet",
  "invitation.accepteret": "Administratorinvitation accepteret",
}[post.art] || post.titel || "Registreret aktivitet");

function Assistent({ virksomhed, traad, platform, onLuk }) {
  const navigate = useNavigate();
  const [spoergsmaal, setSpoergsmaal] = useState("");
  const [svar, setSvar] = useState("");
  const [arbejder, setArbejder] = useState(false);
  const analyse = seneste(traad?.analyser);
  const noter = poster(traad?.noter);
  const aiAktiv = platform?.integrationer?.openai?.status === "aktiv";
  const spoerg = async () => {
    if (!traad || !aiAktiv || !spoergsmaal.trim()) return;
    setArbejder(true);
    const resultat = await spoergSalgsassistent({ traadId: traad.id, spoergsmaal });
    setArbejder(false);
    setSvar(resultat.ok ? resultat.data?.resultat?.svar || "Intet svar modtaget." : resultat.besked);
  };
  return <div className="ejer-sagsassistent">
    <button type="button" className="ejer-tilbage" onClick={onLuk}>← Tilbage til kunden</button>
    <div className="ejer-sagstitel"><h2>{virksomhed.stamdata?.navn}</h2><p>Salgsmulighed {traad?.links?.mulighedId || "ikke oprettet"} · Ansvarlig {traad?.ansvarlig || "Ikke fordelt"}</p></div>
    <div className="ejer-kundefaner"><button type="button" onClick={() => navigate("/main/salg/indbakke")}>Samtale</button><button type="button" onClick={onLuk}>Kundedata</button><button type="button" onClick={() => navigate("/main/salg/tilbud")}>Tilbud</button><button type="button" className="aktiv">Veyro-assistent</button></div>
    <div className="ejer-assistent-layout">
      <aside className="ejer-design-kort ejer-sagsgrundlag"><h2>Sagens grundlag</h2><p>Kun den aktuelle sags mail, interne noter og godkendte Veyro-viden bruges som kontekst.</p><article><EjerIkon navn="mail"/><span><b>Forespørgsel</b><small>{traad?.emne || "Ingen koblet mailtråd"}</small><em>{traad?.senesteFra || "—"}</em></span></article><article><EjerIkon navn="document"/><span><b>Interne noter</b><small>{noter[0]?.tekst || "Ingen interne noter"}</small><em>Kun Dennis og Jørn</em></span></article><article><EjerIkon navn="database"/><span><b>Godkendt Veyro-viden</b><small>Kun godkendte, versionerede tekster må bruges som leveringsgrundlag.</small><em>Fælles vidensbase</em></span></article></aside>
      <section className="ejer-design-kort ejer-assistent-samtale"><h2>Veyro-assistent</h2><p className="fc-hint">{aiAktiv ? "Serverbaseret AI er tilsluttet." : "Ikke tilsluttet · der sendes ingen sagsdata til OpenAI."}</p><div className="ejer-assistent-besked"><span className="ejer-avatar">V</span>{analyse ? <article><div><b>Kundens oplysninger</b><ul>{(analyse.behov || []).map((tekst) => <li key={tekst}>{tekst}</li>)}</ul></div><div><b>AI-fortolkning</b><p>{analyse.opsummering}</p></div><div><b>Uafklarede spørgsmål</b><ol>{(analyse.afklarendeSpoergsmaal || analyse.manglendeOplysninger || []).map((tekst) => <li key={tekst}>{tekst}</li>)}</ol></div><footer><EjerIkon navn="document" size={18}/>Analysen er et forslag og ændrer aldrig bekræftede kundedata.</footer></article> : <article><div><b>Ingen AI-analyse</b><p>Originalmailen er bevaret. En analyse vises først, når integrationen er tilsluttet og aktiv.</p></div></article>}</div><div className="ejer-assistent-besked"><span className="ejer-avatar">V</span><article className="ejer-svarforslag"><b>Redigerbart svarforslag</b><p>{svar || analyse?.svarudkast || "Der er endnu ikke oprettet et svarforslag."}</p><button type="button" className="ejer-primaer" disabled={!svar && !analyse?.svarudkast} onClick={() => navigate("/main/salg/indbakke")}>Åbn mailkladde</button></article></div><div className="ejer-assistent-input"><input value={spoergsmaal} onChange={(event) => setSpoergsmaal(event.target.value)} placeholder={aiAktiv ? "Spørg til denne sag..." : "OpenAI er ikke tilsluttet"} disabled={!aiAktiv}/><button type="button" onClick={spoerg} disabled={!aiAktiv || arbejder || !spoergsmaal.trim()} aria-label="Send internt spørgsmål"><EjerIkon navn="send"/></button></div><div className="ejer-assistent-genveje"><button type="button" disabled={!aiAktiv} onClick={() => setSpoergsmaal("Skriv et afklarende svar")}>Skriv et svar</button><button type="button" disabled={!aiAktiv} onClick={() => setSpoergsmaal("Lav en kundetilpasset tilbudstekst")}>Lav tilbudstekst</button><button type="button" disabled={!aiAktiv} onClick={() => setSpoergsmaal("Foreslå næste handling")}>Foreslå næste handling</button></div><small className="ejer-internmarkering">Intern samtale · sendes ikke til kunden</small></section>
    </div>
  </div>;
}

export default function EjerKunderDesignV2() {
  const { crm, tilbud, henter } = useEjerData();
  const [platform, setPlatform] = useState(null);
  const [oekonomi, setOekonomi] = useState(null);
  const [kundekonto, setKundekonto] = useState(null);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => { hentSalgsplatform().then(setPlatform); hentEjerOekonomi().then(setOekonomi).catch(() => null); }, []);
  const virksomheder = crmVirksomhedsliste(crm || {});
  const valgt = virksomheder.find((post) => post.id === params.get("kunde")) || virksomheder[0];
  const tenantId = valgt?.stamdata?.tenantId;
  useEffect(() => {
    let aktiv = true;
    if (!tenantId) { setKundekonto(null); return undefined; }
    hentKundekonto(tenantId).then((data) => { if (aktiv) setKundekonto(data); }).catch(() => { if (aktiv) setKundekonto(null); });
    return () => { aktiv = false; };
  }, [tenantId]);
  const kundetilbud = useMemo(() => poster(tilbud).filter((post) => post.virksomhedId === valgt?.id).sort((a, b) => (b.opdateretMs || 0) - (a.opdateretMs || 0))[0], [tilbud, valgt?.id]);
  const traad = poster(platform?.traade).find((post) => post.links?.virksomhedId === valgt?.id) || null;
  const aftale = poster(oekonomi?.aftaler).find((post) => post.virksomhedId === valgt?.id) || null;
  const aftaleversion = aftale?.versioner?.[aftale.aktuelVersion];
  const snapshot = aftaleversion?.prisSnapshot || aftaleversion?.snapshot || kundetilbud?.versioner?.[kundetilbud?.aktuelVersion]?.snapshot;
  const kontoversion = kundekonto?.konto?.versioner?.[kundekonto?.konto?.aktivVersion || kundekonto?.konto?.planlagtVersion || kundekonto?.konto?.senesteVersion];
  const tidslinje = valgt ? poster(valgt.tidslinje).sort((a, b) => (a.ms || 0) - (b.ms || 0)) : [];
  const invitation = kundekonto?.invitationer?.[0];
  if (henter || !platform) return <div className="fc-empty">Henter kundehistorik…</div>;
  if (!valgt) return <div className="fc-empty">Ingen CRM-kunder er oprettet endnu.</div>;
  if (params.get("fane") === "assistent") return <Assistent virksomhed={valgt} traad={traad} platform={platform} onLuk={() => setParams(tenantId ? { kunde: valgt.id } : {})}/>;
  const status = kundekonto?.konto?.status === "aktiv" ? "Aktiv kundekonto" : tenantId ? "Opsætning mangler" : "CRM-emne · ingen tenant";
  const maengder = kontoversion?.maengder || {};
  const maanedspris = kontoversion?.beregning?.maanedlig?.beloebOere ?? snapshot?.beregning?.maanedlig?.beloebOere;
  const invitationsstatus = invitation?.status === "accepteret" ? "Invitation accepteret" : invitation?.status === "afventer" ? "Afventer accept" : invitation?.status === "tilbagekaldt" ? "Tilbagekaldt" : "Ingen invitation";
  return <div className="ejer-kunde-design">
    <button type="button" className="ejer-tilbage" onClick={() => navigate("/main/salg/kunder")}>← Tilbage til kunder</button>
    <div className="ejer-kunde-titel"><h2>{valgt.stamdata?.navn}</h2><span>{status}</span></div>
    <div className="ejer-kunde-meta"><span><EjerIkon navn="building"/> {valgt.stamdata?.navn}</span><span><EjerIkon navn="users"/><b>{valgt.stamdata?.kontaktNavn || "Kontakt ikke angivet"}</b><small>Kontaktperson</small></span><span><EjerIkon navn="mail"/> {valgt.stamdata?.kontaktEmail || "E-mail ikke angivet"}</span><span><EjerIkon navn="tag"/> {[valgt.stamdata?.adresse, valgt.stamdata?.postnr, valgt.stamdata?.by].filter(Boolean).join(" ") || "Adresse ikke angivet"}</span><span><i className="ejer-avatar">DC</i><b>{valgt.ansvarlig || "Ikke fordelt"}</b><small>Ansvarlig ejer</small></span></div>
    <div className="ejer-kundefaner"><button type="button" className="aktiv">Overblik</button><button type="button" onClick={() => navigate("/main/salg/indbakke")}>Samtaler</button><button type="button" onClick={() => navigate("/main/salg/tilbud")}>Tilbud</button><button type="button" onClick={() => tenantId ? navigate(`/main/kunder/${tenantId}`, { state: { fra: "/main/salg/kunder" } }) : navigate("/main/abonnementer")}>Kundekonto</button><button type="button" onClick={() => navigate("/main/oekonomi/fakturaer")}>Fakturaer</button><button type="button" onClick={() => navigate("/main/salg/aktiviteter")}>Aktiviteter</button></div>
    <div className="ejer-kunde-layout">
      <section className="ejer-design-kort ejer-kundehistorik"><h2>Samlet kundehistorik</h2><p>Kun registrerede hændelser vises. Oprettelse af en konto markeres ikke som accepteret invitation.</p>{tidslinje.map((post) => <div className="ejer-historikpunkt" key={post.id}><span className="ejer-ikonfelt"><EjerIkon navn={post.art?.includes("mail") ? "mail" : post.art?.includes("invitation") ? "users" : "document"}/></span><p><b>{historikTitel(post)}</b><small>{post.beskrivelse || post.nummer || post.objektId || "Registreret i kundens sagsforløb"}</small></p><time>{post.ms ? dato(post.ms) : "—"}</time></div>)}{!tidslinje.length && <p className="fc-hint">Ingen registrerede kundehændelser endnu.</p>}<div className="ejer-kundehistorik-links"><Link to="/main/salg/indbakke"><EjerIkon navn="mail"/>Åbn mailtråden</Link><Link to="/main/salg/aktiviteter">Se al historik →</Link></div></section>
      <aside><section className="ejer-design-kort ejer-aftalekort"><header><h2>Aftale</h2><span>{kontoversion?.abonnement?.prislisteId?.includes("fixture") ? "Syntetisk testrateblad" : "Versioneret grundlag"}</span></header><h3>{(kontoversion?.moduler || []).map((post) => post.id.toUpperCase()).join(", ") || "Ingen aktiverede moduler"}<small>Kommercielt omfang fra kundekontoen</small></h3><dl><dt>Aftalte enheder</dt><dd>{maengder.enheder ?? "Ikke angivet"}</dd><dt>Medarbejderbrugere</dt><dd>{maengder.medarbejderbrugere ?? "Ikke angivet"}</dd><dt>Chaufførbrugere</dt><dd>{maengder.chauffoerbrugere ?? "Ikke angivet"}</dd><dt>Månedlig pris</dt><dd>{maanedspris != null ? kr(maanedspris) : "Ikke beregnet"}</dd></dl><p>FAKTURACENTER indgår i platformen og er ikke et separat betalingsmodul.</p></section><section className="ejer-design-kort ejer-adminkort"><header><h2>Administratoradgang</h2><span>{invitationsstatus}</span></header><p>Administratorinvitationer er adskilt fra aftalte brugerlicenser og giver aldrig ejeradgang.</p>{tenantId ? <Link className="fc-btn" to={`/main/kunder/${tenantId}?fane=administratorer`} state={{ fra: "/main/salg/kunder" }}>Administrér kundekonto</Link> : <button type="button" onClick={() => navigate("/main/abonnementer")}>Opret kundekonto først</button>}</section></aside>
      <section className="ejer-design-kort ejer-naestehandling"><h2>Næste handling</h2><p><EjerIkon navn="calendar"/><span><b>Planlæg næste kundetrin</b><small>Vælg en registreret aktivitet og ansvarlig.</small></span><i className="ejer-avatar">DC</i><span>{valgt.ansvarlig || "Ikke fordelt"}<small>Ansvarlig</small></span><button type="button" className="ejer-primaer" onClick={() => navigate("/main/salg/aktiviteter")}>Vælg dato</button></p></section>
      <section className="ejer-design-kort ejer-kunde-ai"><h2><EjerIkon navn="sparkles"/>Veyro-assistent</h2><p>Assistenten bruger kun den aktuelle sags kontekst. Interne samtaler sendes ikke til kunden.</p><button type="button" onClick={() => setParams(tenantId ? { kunde: valgt.id, fane: "assistent" } : { fane: "assistent" })}><EjerIkon navn="sparkles"/>Åbn assistent</button></section>
    </div>
  </div>;
}
