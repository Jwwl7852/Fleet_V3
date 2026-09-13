import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { gemEjerMailsignatur, hentEjerMailsignatur } from "../../fleet/ejer-salgsindbakke.js";
import { bygMailsignaturTekst, tomMailsignatur } from "../../fleet/ejer-mailsignatur.js";
import VeyroLogo from "../../fleet/VeyroLogo.jsx";
import "../../fleet/ejer-mail-v7.css";

export default function EjerMailSignatur() {
  const [formular, setFormular] = useState(tomMailsignatur); const [gemt, setGemt] = useState(tomMailsignatur);
  const [status, setStatus] = useState("Henter din personlige signatur …"); const [arbejder, setArbejder] = useState(false);
  useEffect(() => { hentEjerMailsignatur().then((r) => { if (!r.ok) { setStatus(r.besked); return; } const s = { ...tomMailsignatur, ...(r.data?.signatur || {}) }; setFormular(s); setGemt(s); setStatus(""); }); }, []);
  const beskidt = useMemo(() => JSON.stringify(formular) !== JSON.stringify(gemt), [formular, gemt]);
  useEffect(() => { const beskyt = (e) => { if (!beskidt) return; e.preventDefault(); e.returnValue = ""; }; addEventListener("beforeunload", beskyt); return () => removeEventListener("beforeunload", beskyt); }, [beskidt]);
  const felt = (navn) => (e) => setFormular((g) => ({ ...g, [navn]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const gem = async () => { setArbejder(true); setStatus(""); const r = await gemEjerMailsignatur({ ...formular, forventetRevision: gemt.revision || 0 }); setArbejder(false); if (!r.ok) { setStatus(r.besked); return; } const s = { ...formular, revision: r.data.revision, opdateretMs: r.data.opdateretMs }; setFormular(s); setGemt(s); setStatus("Din personlige mailsignatur er gemt. Den bruges kun på nye kladder."); };
  const tekst = bygMailsignaturTekst(formular);
  return <div className="ejer-signatur-side">
    <Link className="ejer-tilbage" to="/main/mail/indbakker">← Tilbage til Mail</Link>
    <div className="ejer-signatur-grid"><section className="ejer-design-kort ejer-signatur-form"><header><div><small>Personlig indstilling</small><h2>Mail og signatur</h2></div><span className="fc-pill info">Kun din ejerprofil</span></header>
      <p className="ejer-infoboks">Signaturen tilhører den ejer, der skriver. Eksisterende kladder og historiske mails ændres aldrig automatisk.</p>
      <div className="ejer-signatur-felter"><label>Navn<input value={formular.navn} onChange={felt("navn")}/></label><label>Titel<input value={formular.titel} onChange={felt("titel")}/></label><label>Virksomhed<input value={formular.virksomhed} onChange={felt("virksomhed")}/></label><label>Telefon<input value={formular.telefon} onChange={felt("telefon")}/></label><label>E-mail<input type="email" value={formular.email} onChange={felt("email")}/></label><label>Link til hjemmeside<input type="url" value={formular.hjemmeside} onChange={felt("hjemmeside")} placeholder="https://…"/></label><label className="bred">Ekstra linjer<textarea rows="4" value={formular.ekstra} onChange={felt("ekstra")} placeholder="Valgfri tekst – brug linjeskift efter behov"/></label></div>
      <fieldset><legend>Formatering og logo</legend><label><input type="checkbox" checked={formular.navnFed} onChange={felt("navnFed")}/> Navn med fed</label><label><input type="checkbox" checked={formular.titelKursiv} onChange={felt("titelKursiv")}/> Titel med kursiv</label><label><input type="checkbox" checked={formular.brugLogo} onChange={felt("brugLogo")}/> Vis godkendt Veyro-logo</label></fieldset>
      <div className="fc-actions"><button className="fc-btn fc-btn-primary" type="button" onClick={gem} disabled={arbejder || !beskidt}>Gem min signatur</button></div>{status && <p role="status" className="ejer-handlingssvar">{status}</p>}
    </section><aside className="ejer-design-kort ejer-signatur-preview"><h2>Forhåndsvisning</h2><div className="ejer-signatur-visning">{formular.brugLogo && <VeyroLogo variant="sidebar"/>}<p><span className={formular.navnFed ? "fed" : ""}>{formular.navn}</span>{formular.titel && <span className={formular.titelKursiv ? "kursiv" : ""}>{formular.titel}</span>}{formular.virksomhed && <span>{formular.virksomhed}</span>}{formular.telefon && <span>{formular.telefon}</span>}{formular.email && <a href={`mailto:${formular.email}`}>{formular.email}</a>}{formular.hjemmeside && <a href={formular.hjemmeside} target="_blank" rel="noreferrer">{formular.hjemmeside}</a>}{formular.ekstra && <span>{formular.ekstra}</span>}</p></div><h3>Ren tekst</h3><pre>{tekst || "Ingen signatur er oprettet."}</pre><p className="fc-hint">Logo og enkel formatering vises i HTML-mail. Ren tekst bruges som sikker tekstvariant.</p></aside></div>
  </div>;
}
