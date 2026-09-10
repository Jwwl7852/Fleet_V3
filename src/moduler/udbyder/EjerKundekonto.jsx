import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { dato, kr } from "../../fleet/format.js";
import { MODUL, VALGFRIE_MODULER } from "../../fleet/moduler.js";
import { bpsTilPct, pctTilBps } from "../../fleet/beloeb.js";
import { Dialog, Knap, Pille } from "../../fleet/ui.jsx";
import { genudsendKundeinvitation, opretKundeinvitation, tilbagekaldKundeinvitation } from "../../fleet/udbyder.js";
import { gemKundekonto, hentKundekonto } from "../../fleet/ejer-kundekonto.js";
import {
  kundekontoAendringer, kundekontoFraTilbudssnapshot, normaliserKundekonto,
  prislinjerTilKundekonto,
} from "../../fleet/ejer-kundekonto-regler.js";
import EjerIkon from "./EjerIkon.jsx";

const FANER = [
  ["profil", "Kundeprofil"], ["moduler", "Moduler"], ["forbrug", "Brugere og enheder"],
  ["obd", "OBD"], ["abonnement", "Abonnement og priser"],
  ["administratorer", "Administratorer"], ["historik", "Historik"],
];
const tomProfil = { navn: "", cvr: "", adresse: "", postnr: "", by: "", kontaktNavn: "", kontaktEmail: "", fakturaEmail: "", reference: "" };
const tomMaengder = { medarbejderbrugere: "", chauffoerbrugere: "", enheder: "" };
const tomObd = { hardwareAntal: "", hardwarePrisOere: "", dataabonnementAntal: "", dataabonnementPrisOere: "", leveretAntal: "", tilknyttetAntal: "" };
const isoIdag = () => new Date().toISOString().slice(0, 10);

function profilFra(data) {
  const v = data?.virksomhed || {};
  return Object.fromEntries(Object.keys(tomProfil).map((felt) => [felt, v[felt] || ""]));
}

function kontoForm(data) {
  const konto = data?.konto;
  const kontoVersion = konto?.versioner?.[konto.planlagtVersion || konto.aktivVersion || konto.senesteVersion];
  if (kontoVersion) return {
    profil: { ...tomProfil, ...profilFra(data), ...kontoVersion.profil },
    moduler: kontoVersion.moduler || [], maengder: { ...tomMaengder, ...kontoVersion.maengder },
    obd: { ...tomObd, ...kontoVersion.obd }, abonnement: kontoVersion.abonnement,
    kilde: kontoVersion.kilde || { art: "manuel" }, faerdig: kontoVersion.faerdig === true,
  };
  const aftale = data?.aftaler?.[0];
  const aftaleVersion = aftale?.versioner?.[aftale.aktuelVersion];
  if (aftaleVersion?.prisSnapshot) {
    const fraTilbud = kundekontoFraTilbudssnapshot(aftaleVersion.prisSnapshot);
    return {
      profil: profilFra(data), ...fraTilbud,
      abonnement: { ...fraTilbud.abonnement, virkningsdato: aftaleVersion.virkningsdato || isoIdag() },
      kilde: { art: "accepteret_tilbud", aftaleId: aftale.id, aftaleVersion: Number(aftale.aktuelVersion) },
      faerdig: false,
    };
  }
  return {
    profil: profilFra(data),
    moduler: VALGFRIE_MODULER.filter((id) => data?.moduler?.[id] === true).map((id) => ({ id, status: "aktiv", startdato: isoIdag() })),
    maengder: { ...tomMaengder }, obd: { ...tomObd },
    abonnement: { prislisteId: "", generelRabatBps: 0, introRabatBps: 0, introMaaneder: 0, bindingMaaneder: 0, interval: "maaned", virkningsdato: isoIdag(), linjer: [] },
    kilde: { art: "manuel" }, faerdig: false,
  };
}

function Felt({ label, value, onChange, type = "text", disabled = false, hint, error, min, step }) {
  return <label className="ejer-konto-felt"><span>{label}</span><input type={type} value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} disabled={disabled} min={min} step={step} />{hint && <small>{hint}</small>}{error && <small className="fejl">{error}</small>}</label>;
}

function Status({ status }) {
  const tone = status === "aktiv" || status === "accepteret" ? "ok" : status === "tilbagekaldt" || status === "udloebet" ? "bad" : "warn";
  const tekst = status === "opsaetning_mangler" ? "Opsætning mangler" : status === "afventer" ? "Afventer accept" : status || "Opsætning mangler";
  return <Pille tone={tone}>{tekst}</Pille>;
}

function Administratorer({ data, genindlaes }) {
  const [aaben, setAaben] = useState(false); const [navn, setNavn] = useState(""); const [email, setEmail] = useState("");
  const [arbejder, setArbejder] = useState(false); const [svar, setSvar] = useState(null); const [token, setToken] = useState(null);
  const opret = async () => { setArbejder(true); const r = await opretKundeinvitation({ tenantId: data.tenantId, navn, email, rolle: "admin" }); setArbejder(false); if (r.ok) { setToken(r.data); setAaben(false); await genindlaes(); } else setSvar(r); };
  const koer = async (handling) => { setArbejder(true); const r = await handling(); setArbejder(false); if (r.ok) { if (r.data?.token) setToken(r.data); await genindlaes(); } else setSvar(r); };
  return <section className="ejer-konto-kort"><div className="ejer-konto-korthoved"><div><h2>Administratorinvitationer</h2><p>Invitationer giver kun kundens administratorrolle. Medarbejderlicenser administreres særskilt.</p></div><Knap variant="primaer" onClick={() => setAaben(true)}><EjerIkon navn="plus" size={18}/>Invitér administrator</Knap></div>
    {token && <div className="ejer-konto-info"><b>Invitation oprettet — ikke sendt</b><p>Mail er ikke tilsluttet. Tokenet vises kun i den lokale testsession og lagres kun som hash. Kopiér linket gennem den sikre lokale gennemgang, og luk derefter denne besked.</p><Knap onClick={() => setToken(null)}>Skjul testlink</Knap></div>}
    <div className="ejer-konto-tabel"><table><thead><tr><th>Navn</th><th>E-mail</th><th>Status</th><th>Udløber</th><th>Handling</th></tr></thead><tbody>{data.invitationer.map((i) => <tr key={i.id}><td>{i.navn || "—"}</td><td>{i.email}</td><td><Status status={i.status === "afventer" && i.udloeberMs <= Date.now() ? "udloebet" : i.status}/></td><td>{dato(i.udloeberMs)}</td><td>{i.status !== "accepteret" && <span className="ejer-konto-raekkehandlinger"><Knap disabled={arbejder} onClick={() => koer(() => genudsendKundeinvitation({ id: i.id }))}>Genudsend</Knap>{i.status !== "tilbagekaldt" && <Knap variant="fare" disabled={arbejder} onClick={() => koer(() => tilbagekaldKundeinvitation({ id: i.id }))}>Tilbagekald</Knap>}</span>}</td></tr>)}{!data.invitationer.length && <tr><td colSpan="5">Ingen invitationer er oprettet.</td></tr>}</tbody></table></div>
    {svar && <p className="fc-fejltekst">{svar.besked}</p>}
    {aaben && <Dialog titel="Invitér kundeadministrator" under="Invitationen giver aldrig ejeradgang." onLuk={() => setAaben(false)} ugemte={Boolean(navn || email)}><div className="ejer-konto-formgrid"><Felt label="Navn" value={navn} onChange={setNavn}/><Felt label="E-mail" type="email" value={email} onChange={setEmail}/></div><p className="fc-hint">Microsoft 365 er ikke tilsluttet. Oprettelsen sender derfor ingen mail.</p><div className="fc-formular-knapper"><Knap onClick={() => setAaben(false)}>Annullér</Knap><Knap variant="primaer" disabled={arbejder || !navn.trim() || !email.includes("@")} onClick={opret}>{arbejder ? "Opretter…" : "Opret invitation"}</Knap></div></Dialog>}
  </section>;
}

function Historik({ data }) {
  const versioner = Object.values(data.konto?.versioner || {}).sort((a, b) => b.version - a.version);
  return <section className="ejer-konto-kort"><h2>Ændringshistorik</h2><p>Hver kontoændring er en ny version. Accepterede tilbud, aftaleversioner og låste fakturagrundlag ændres ikke.</p><div className="ejer-konto-tabel"><table><thead><tr><th>Version</th><th>Status</th><th>Ikrafttrædelse</th><th>Kilde</th><th>Ændringer</th><th>Ansvarlig</th><th>Oprettet</th></tr></thead><tbody>{versioner.map((v) => <tr key={v.version}><td>v{v.version}</td><td><Status status={v.status}/></td><td>{v.virkningsdato || "—"}</td><td>{v.kilde?.art === "accepteret_tilbud" ? `Tilbud ${v.kilde.tilbudId || ""} · v${v.kilde.tilbudsversion}` : "Manuel opsætning"}</td><td>{v.aendringer?.join(" · ") || "Første version"}</td><td>{v.oprettetAf || "—"}</td><td>{dato(v.oprettetMs)}</td></tr>)}{!versioner.length && <tr><td colSpan="7">Ingen kontoændringer endnu.</td></tr>}</tbody></table></div></section>;
}

function AbonnementOgPriser({
  form, setForm, data, prisliste, katalog, accepteret, saetFelt,
}) {
  const vaelgKilde = (art) => {
    if (art === "manuel") {
      setForm((x) => ({ ...x, kilde: { art: "manuel" } }));
      return;
    }
    const aftale = data.aftaler[0];
    const version = aftale?.versioner?.[aftale.aktuelVersion];
    if (!version?.prisSnapshot) return;
    const fraTilbud = kundekontoFraTilbudssnapshot(version.prisSnapshot);
    setForm((x) => ({
      ...x,
      ...fraTilbud,
      profil: x.profil,
      abonnement: { ...fraTilbud.abonnement, virkningsdato: version.virkningsdato },
      kilde: {
        art: "accepteret_tilbud",
        aftaleId: aftale.id,
        aftaleVersion: Number(aftale.aktuelVersion),
      },
    }));
  };
  const opdaterLinje = (indeks, aendring) => setForm((x) => ({
    ...x,
    abonnement: {
      ...x.abonnement,
      linjer: x.abonnement.linjer.map((linje, i) => i === indeks ? { ...linje, ...aendring } : linje),
    },
  }));
  const skiftLinje = (linje, valgt) => setForm((x) => ({
    ...x,
    abonnement: {
      ...x.abonnement,
      linjer: valgt
        ? x.abonnement.linjer.filter((post) => post.id !== linje.id)
        : [...x.abonnement.linjer, linje],
    },
  }));

  return (
    <section className="ejer-konto-kort">
      <div className="ejer-konto-korthoved">
        <div>
          <h2>Abonnement og priser</h2>
          <p>Månedlige abonnementer og engangsbeløb beregnes hver for sig i den fælles prismotor.</p>
        </div>
        {form.kilde.art === "manuel" && (
          <Knap
            disabled={!prisliste}
            onClick={() => setForm((x) => ({
              ...x,
              abonnement: { ...x.abonnement, linjer: prislinjerTilKundekonto(prisliste, x) },
            }))}
          >
            Opdatér linjer fra rateblad
          </Knap>
        )}
      </div>
      <div className="ejer-konto-formgrid">
        <label className="ejer-konto-felt">
          <span>Kilde</span>
          <select value={form.kilde.art} onChange={(event) => vaelgKilde(event.target.value)}>
            <option value="manuel">Manuel opsætning</option>
            {data.aftaler.length > 0 && <option value="accepteret_tilbud">Accepteret aftale/tilbud</option>}
          </select>
        </label>
        <label className="ejer-konto-felt">
          <span>Versioneret rateblad</span>
          <select
            value={form.abonnement.prislisteId || ""}
            disabled={accepteret}
            onChange={(event) => saetFelt("abonnement", "prislisteId", event.target.value)}
          >
            <option value="">Vælg rateblad</option>
            {data.prislister.map((post) => (
              <option key={post.id} value={post.id}>{post.id} · gyldig {dato(post.gyldigFraMs)}</option>
            ))}
          </select>
          <small>Testfixtures er tydeligt mærket og er ikke officielle Veyro-priser.</small>
        </label>
        <Felt label="Generel rabat (%)" type="number" min="0" step="0.01" value={bpsTilPct(form.abonnement.generelRabatBps || 0)} disabled={accepteret} onChange={(v) => saetFelt("abonnement", "generelRabatBps", pctTilBps(Number(v) || 0))} />
        <Felt label="Introduktionsrabat (%)" type="number" min="0" step="0.01" value={bpsTilPct(form.abonnement.introRabatBps || 0)} disabled={accepteret} onChange={(v) => saetFelt("abonnement", "introRabatBps", pctTilBps(Number(v) || 0))} />
        <Felt label="Introduktionsperiode (måneder)" type="number" min="0" value={form.abonnement.introMaaneder} disabled={accepteret} onChange={(v) => saetFelt("abonnement", "introMaaneder", Number(v))} />
        <Felt label="Binding (måneder)" type="number" min="0" value={form.abonnement.bindingMaaneder} disabled={accepteret} onChange={(v) => saetFelt("abonnement", "bindingMaaneder", Number(v))} />
        <label className="ejer-konto-felt">
          <span>Faktureringsinterval</span>
          <select value={form.abonnement.interval} disabled={accepteret} onChange={(event) => saetFelt("abonnement", "interval", event.target.value)}>
            <option value="maaned">Månedligt</option>
          </select>
          <small>Andre intervaller er ikke implementeret.</small>
        </label>
        <Felt label="Ikrafttrædelsesdato" type="date" value={form.abonnement.virkningsdato} disabled={accepteret} onChange={(v) => saetFelt("abonnement", "virkningsdato", v)} />
      </div>
      {form.kilde.art === "manuel" && prisliste && (
        <div className="ejer-konto-ratevalg">
          <h3>Ratebladslinjer</h3>
          {katalog.map((linje) => {
            const valgt = form.abonnement.linjer.some((post) => post.id === linje.id);
            return (
              <label key={linje.id}>
                <input type="checkbox" checked={valgt} onChange={() => skiftLinje(linje, valgt)} />
                <span><b>{linje.navn}</b><small>{linje.fakturering === "maanedlig" ? "Månedligt" : "Engangsbeløb"} · {kr(linje.normalprisOere)}</small></span>
              </label>
            );
          })}
        </div>
      )}
      {accepteret && <div className="ejer-konto-info"><b>Beløbene er låst til den accepterede version.</b><p>En senere kontoændring omskriver aldrig tilbuddet eller det låste fakturagrundlag.</p></div>}
      <div className="ejer-konto-tabel">
        <table>
          <thead><tr><th>Ydelse</th><th>Type</th><th>Antal</th><th>Listepris</th><th>Aftalt pris</th><th>Linjerabat</th></tr></thead>
          <tbody>
            {form.abonnement.linjer.map((linje, indeks) => (
              <tr key={linje.id}>
                <td>{linje.navn}</td>
                <td>{linje.fakturering === "maanedlig" ? "Månedligt" : "Engang"}</td>
                <td><input aria-label={`Antal for ${linje.navn}`} type="number" min="1" value={linje.antal / 1000} disabled={accepteret} onChange={(event) => opdaterLinje(indeks, { antal: Math.max(1, Number(event.target.value) || 1) * 1000 })} /></td>
                <td>{kr(linje.normalprisOere)}</td>
                <td><input aria-label={`Aftalt pris for ${linje.navn}`} type="number" min="0" step="0.01" value={(linje.aftaltPrisOere ?? linje.normalprisOere) / 100} disabled={accepteret} onChange={(event) => opdaterLinje(indeks, { aftaltPrisOere: Math.round((Number(event.target.value) || 0) * 100) })} /></td>
                <td><input aria-label={`Linjerabat for ${linje.navn}`} type="number" min="0" step="0.01" value={bpsTilPct(linje.linjerabatBps || 0)} disabled={accepteret} onChange={(event) => opdaterLinje(indeks, { linjerabatBps: pctTilBps(Number(event.target.value) || 0) })} /></td>
              </tr>
            ))}
            {!form.abonnement.linjer.length && <tr><td colSpan="6">Vælg et rateblad og mindst én prislinje.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function EjerKundekonto() {
  const { tenantId } = useParams(); const navigate = useNavigate(); const location = useLocation(); const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null); const [form, setForm] = useState(null); const [oprindelig, setOprindelig] = useState("");
  const [fejl, setFejl] = useState(null); const [svar, setSvar] = useState(null); const [arbejder, setArbejder] = useState(false);
  const [visKassering, setVisKassering] = useState(false); const frigivTilbage = useRef(false);
  const fane = FANER.some(([id]) => id === params.get("fane")) ? params.get("fane") : "profil";
  const genindlaes = async () => { try { const naeste = await hentKundekonto(tenantId); const naesteForm = kontoForm(naeste); setData(naeste); setForm(naesteForm); setOprindelig(JSON.stringify(naesteForm)); setFejl(null); } catch (e) { setFejl(e); } };
  useEffect(() => { genindlaes(); }, [tenantId]);
  const dirty = Boolean(form && JSON.stringify(form) !== oprindelig);
  useEffect(() => { const handler = (e) => { if (!dirty) return; e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [dirty]);
  useEffect(() => { const pop = () => { if (!dirty || frigivTilbage.current) return; window.history.go(1); setVisKassering(true); }; window.addEventListener("popstate", pop); return () => window.removeEventListener("popstate", pop); }, [dirty]);
  const gaaTilbage = () => { if (dirty) { setVisKassering(true); return; } if (location.state?.fra) navigate(-1); else navigate("/main/abonnementer"); };
  const kasserOgGaa = () => { frigivTilbage.current = true; setVisKassering(false); if (location.state?.fra || window.history.state?.idx > 0) navigate(-1); else navigate("/main/abonnementer", { replace: true }); };
  const sæt = (gruppe, felt, value) => setForm((x) => ({ ...x, [gruppe]: { ...x[gruppe], [felt]: value } }));
  const kontoNu = data?.konto?.versioner?.[data?.konto?.aktivVersion || data?.konto?.planlagtVersion] || {};
  const normal = useMemo(() => form ? normaliserKundekonto(form) : null, [form]);
  const aendringer = form ? kundekontoAendringer(kontoNu, form) : [];
  const accepteret = form?.kilde?.art === "accepteret_tilbud";
  const valgteModuler = new Set((form?.moduler || []).filter((m) => m.status !== "inaktiv").map((m) => m.id));
  const prisliste = data?.prislister?.find((p) => p.id === form?.abonnement?.prislisteId);
  const katalog = prisliste && form ? prislinjerTilKundekonto(prisliste, form) : [];
  const gem = async (aktiver, faerdig) => { setArbejder(true); setSvar(null); const payload = { ...form, faerdig }; const valideret = normaliserKundekonto(payload); if (Object.keys(valideret.fejl).length) { setSvar({ ok: false, besked: Object.values(valideret.fejl).join(" ") }); setArbejder(false); return; } const r = await gemKundekonto({ id: tenantId, operationId: crypto.randomUUID(), forventetRevision: data?.konto?.revision || 0, aktiver, kilde: form.kilde, profil: form.profil, opsaetning: payload }); setArbejder(false); setSvar(r.ok ? { ok: true, besked: `${r.data.status === "aktiv" ? "Kontoændringen er aktiveret" : r.data.status === "planlagt" ? "Ændringen er gemt som planlagt" : "Kontoen er gemt med Opsætning mangler"} i version ${r.data.version}.` } : r); if (r.ok) await genindlaes(); };
  if (fejl) return <div className="fc-empty fc-empty-bad"><b>Kundekontoen kunne ikke hentes.</b><p>{fejl.message}</p><Knap onClick={genindlaes}>Prøv igen</Knap></div>;
  if (!data || !form) return <div className="fc-empty">Henter kundekonto…</div>;
  const maaling = data.senesteMaaling;
  const antalFelt = (felt, label, maalt) => <div className="ejer-konto-maengderaekke"><Felt label={label} type="number" min="0" value={form.maengder[felt]} onChange={(v) => sæt("maengder", felt, v)}/><div><span>Registreret forbrug</span><b>{maaling ? (maalt ?? "Ikke tilgængeligt") : "Ikke målt"}</b><small>{maaling ? `Seneste måling ${maaling.id}` : "Der findes ingen servermåling"}</small></div><div><span>Håndhævet grænse</span><b>Ikke håndhævet</b><small>Det aftalte antal er ikke en teknisk spærring</small></div></div>;
  return <div className="ejer-konto-side">
    <button type="button" className="ejer-tilbage" onClick={gaaTilbage}>← Tilbage til kunder og abonnementer</button>
    <header className="ejer-konto-titel"><div><p>Kundekonto · permanent tenant-id: <code>{tenantId}</code></p><h2>{form.profil.navn || tenantId}</h2><span><Status status={data.konto?.status || "opsaetning_mangler"}/>{form.kilde.art === "accepteret_tilbud" ? <Pille tone="info">Fra accepteret tilbud</Pille> : <Pille tone="info">Manuel opsætning</Pille>}</span></div><div className="ejer-konto-pris"><small>Fremtidig abonnementspris</small><b>{normal?.beregning ? `${kr(normal.beregning.maanedlig.beloebOere)} / md.` : "Ikke beregnet"}</b><span>Engangsbeløb: {normal?.beregning ? kr(normal.beregning.engang.beloebOere) : "—"}</span></div></header>
    <nav className="ejer-konto-faner" aria-label="Kundekontoens områder">{FANER.map(([id, label]) => <button type="button" key={id} className={fane === id ? "aktiv" : ""} onClick={() => setParams({ fane: id })}>{label}</button>)}</nav>
    {fane === "profil" && <section className="ejer-konto-kort"><h2>Kundeprofil</h2><p>Profilen er fælles for den permanente tenant. Kundens egne driftsdata redigeres ikke her.</p><div className="ejer-konto-formgrid"><Felt label="Virksomhedsnavn" value={form.profil.navn} onChange={(v) => sæt("profil", "navn", v)} error={normal?.fejl["profil.navn"]}/><Felt label="CVR" value={form.profil.cvr} onChange={(v) => sæt("profil", "cvr", v)} error={normal?.fejl["profil.cvr"]}/><Felt label="Adresse" value={form.profil.adresse} onChange={(v) => sæt("profil", "adresse", v)}/><Felt label="Postnummer" value={form.profil.postnr} onChange={(v) => sæt("profil", "postnr", v)}/><Felt label="By" value={form.profil.by} onChange={(v) => sæt("profil", "by", v)}/><Felt label="Kontaktperson" value={form.profil.kontaktNavn} onChange={(v) => sæt("profil", "kontaktNavn", v)}/><Felt label="Kontakt-e-mail" type="email" value={form.profil.kontaktEmail} onChange={(v) => sæt("profil", "kontaktEmail", v)} error={normal?.fejl["profil.kontaktEmail"]}/><Felt label="Faktureringsmail" type="email" value={form.profil.fakturaEmail} onChange={(v) => sæt("profil", "fakturaEmail", v)} error={normal?.fejl["profil.fakturaEmail"]}/><Felt label="Fakturareference" value={form.profil.reference} onChange={(v) => sæt("profil", "reference", v)}/></div></section>}
    {fane === "moduler" && <section className="ejer-konto-kort"><h2>Købte moduler og adgang</h2><p>Aktivering ændrer kundens reelle moduladgang. FAKTURACENTER er en del af platformen og oprettes ikke som et særskilt betalingsmodul.</p><div className="ejer-konto-moduler">{VALGFRIE_MODULER.map((id) => { const valgt = valgteModuler.has(id); const post = form.moduler.find((m) => m.id === id); return <article key={id} className={valgt ? "valgt" : ""}><label><input type="checkbox" checked={valgt} disabled={accepteret} onChange={() => setForm((x) => ({ ...x, moduler: valgt ? x.moduler.filter((m) => m.id !== id) : [...x.moduler, { id, status: "aktiv", startdato: x.abonnement.virkningsdato }] }))}/><span><b>{MODUL[id].label}</b><small>{MODUL[id].hvad}</small></span></label>{valgt && <div><select value={post?.status || "aktiv"} disabled={accepteret} onChange={(e) => setForm((x) => ({ ...x, moduler: x.moduler.map((m) => m.id === id ? { ...m, status: e.target.value } : m) }))}><option value="aktiv">Aktiv</option><option value="planlagt">Planlagt</option><option value="inaktiv">Ikke aktiv</option></select><input aria-label={`Startdato for ${MODUL[id].label}`} type="date" value={post?.startdato || form.abonnement.virkningsdato} disabled={accepteret} onChange={(e) => setForm((x) => ({ ...x, moduler: x.moduler.map((m) => m.id === id ? { ...m, startdato: e.target.value } : m) }))}/></div>}</article>; })}</div>{accepteret && <p className="ejer-konto-info"><b>Låst til accepteret tilbud.</b> Opret en ny aftale-/kontoændring, hvis det kommercielle omfang skal ændres.</p>}</section>}
    {fane === "forbrug" && <section className="ejer-konto-kort"><h2>Brugere og enheder</h2><p>Aftalt antal, målt forbrug og servermæssigt håndhævet grænse er tre forskellige oplysninger.</p>{antalFelt("medarbejderbrugere", "Aftalte medarbejderbrugere", maaling?.brugere?.desktop)}{antalFelt("chauffoerbrugere", "Aftalte chaufførbrugere", maaling?.brugere?.chauffoer)}{antalFelt("enheder", "Aftalte enheder", maaling?.koeretoejer)}</section>}
    {fane === "obd" && <section className="ejer-konto-kort"><h2>OBD-hardware og data</h2><p>Hardware er et engangsbeløb; SIM/data er en løbende tjeneste. Antal køretøjer, købte OBD-enheder og aktive forbindelser er ikke det samme.</p><div className="ejer-konto-formgrid"><Felt label="Aftalt OBD-hardware" type="number" min="0" value={form.obd.hardwareAntal} disabled={accepteret} onChange={(v) => sæt("obd", "hardwareAntal", v)} hint="Købte fysiske enheder"/><Felt label="Hardwarepris pr. stk. (øre)" type="number" min="0" value={form.obd.hardwarePrisOere} disabled={accepteret} onChange={(v) => sæt("obd", "hardwarePrisOere", v)} hint="Engangsbeløb fra rateblad/tilbud"/><Felt label="Aftalte dataabonnementer" type="number" min="0" value={form.obd.dataabonnementAntal} disabled={accepteret} onChange={(v) => sæt("obd", "dataabonnementAntal", v)}/><Felt label="Dataabonnement pr. måned (øre)" type="number" min="0" value={form.obd.dataabonnementPrisOere} disabled={accepteret} onChange={(v) => sæt("obd", "dataabonnementPrisOere", v)}/><Felt label="Registreret leveret antal" type="number" min="0" value={form.obd.leveretAntal} onChange={(v) => sæt("obd", "leveretAntal", v)} hint="Manuelt registreret; ikke telemetri"/><Felt label="Registreret tilknyttet antal" type="number" min="0" value={form.obd.tilknyttetAntal} onChange={(v) => sæt("obd", "tilknyttetAntal", v)} hint="Manuelt registreret; siger ikke online"/></div><div className="ejer-konto-info"><b>Aktive OBD-forbindelser: Ikke tilgængeligt</b><p>Der er ingen tilsluttet telemetrikilde. Konsollen viser derfor hverken online-status eller nul aktive forbindelser.</p></div></section>}
    {/* Den tidligere komprimerede prisprototype er erstattet af komponenten ovenfor.
    {fane === "abonnement" && <section className="ejer-konto-kort"><div className="ejer-konto-korthoved"><div><h2>Abonnement og priser</h2><p>Månedlige abonnementer og engangsbeløb beregnes hver for sig i den fælles prismotor.</p></div>{form.kilde.art === "manuel" && <Knap onClick={() => setForm((x) => ({ ...x, abonnement: { ...x.abonnement, linjer: prislinjerTilKundekonto(prisliste, x) } }))} disabled={!prisliste}>Opdatér linjer fra rateblad</Knap>}</div><div className="ejer-konto-formgrid"><label className="ejer-konto-felt"><span>Kilde</span><select value={form.kilde.art} onChange={(e) => { if (e.target.value === "manuel") setForm((x) => ({ ...x, kilde: { art: "manuel" } })); else { const a = data.aftaler[0]; const v = a?.versioner?.[a.aktuelVersion]; if (v?.prisSnapshot) { const fra = kundekontoFraTilbudssnapshot(v.prisSnapshot); setForm((x) => ({ ...x, ...fra, profil: x.profil, abonnement: { ...fra.abonnement, virkningsdato: v.virkningsdato }, kilde: { art: "accepteret_tilbud", aftaleId: a.id, aftaleVersion: Number(a.aktuelVersion) } })); } }}><option value="manuel">Manuel opsætning</option>{data.aftaler.length > 0 && <option value="accepteret_tilbud">Accepteret aftale/tilbud</option>}</select></label><label className="ejer-konto-felt"><span>Versioneret rateblad</span><select value={form.abonnement.prislisteId || ""} disabled={accepteret} onChange={(e) => sæt("abonnement", "prislisteId", e.target.value)}><option value="">Vælg rateblad</option>{data.prislister.map((p) => <option key={p.id} value={p.id}>{p.id} · gyldig {dato(p.gyldigFraMs)}</option>)}</select><small>Eksempel-/fixturepris er ikke en officiel Veyro-pris.</small></label><Felt label="Generel rabat (%)" type="number" min="0" step="0.01" value={bpsTilPct(form.abonnement.generelRabatBps || 0)} disabled={accepteret} onChange={(v) => sæt("abonnement", "generelRabatBps", pctTilBps(Number(v) || 0))}/><Felt label="Introduktionsrabat (%)" type="number" min="0" step="0.01" value={bpsTilPct(form.abonnement.introRabatBps || 0)} disabled={accepteret} onChange={(v) => sæt("abonnement", "introRabatBps", pctTilBps(Number(v) || 0))}/><Felt label="Introduktionsperiode (måneder)" type="number" min="0" value={form.abonnement.introMaaneder} disabled={accepteret} onChange={(v) => sæt("abonnement", "introMaaneder", Number(v))}/><Felt label="Binding (måneder)" type="number" min="0" value={form.abonnement.bindingMaaneder} disabled={accepteret} onChange={(v) => sæt("abonnement", "bindingMaaneder", Number(v))}/><label className="ejer-konto-felt"><span>Faktureringsinterval</span><select value={form.abonnement.interval} disabled={accepteret} onChange={(e) => sæt("abonnement", "interval", e.target.value)}><option value="maaned">Månedligt</option></select><small>Andre intervaller er ikke implementeret.</small></label><Felt label="Ikrafttrædelsesdato" type="date" value={form.abonnement.virkningsdato} disabled={accepteret} onChange={(v) => sæt("abonnement", "virkningsdato", v)}/></div>
      {form.kilde.art === "manuel" && prisliste && <div className="ejer-konto-ratevalg"><h3>Ratebladslinjer</h3>{katalog.map((linje) => { const valgt = form.abonnement.linjer.some((l) => l.id === linje.id); return <label key={linje.id}><input type="checkbox" checked={valgt} onChange={() => setForm((x) => ({ ...x, abonnement: { ...x.abonnement, linjer: valgt ? x.abonnement.linjer.filter((l) => l.id !== linje.id) : [...x.abonnement.linjer, linje] } }))}/><span><b>{linje.navn}</b><small>{linje.fakturering === "maanedlig" ? "Månedligt" : "Engangsbeløb"} · {kr(linje.normalprisOere)}</small></span></label>; })}</div>}
      <div className="ejer-konto-tabel"><table><thead><tr><th>Ydelse</th><th>Type</th><th>Antal</th><th>Listepris</th><th>Aftalt pris</th><th>Linjerabat</th></tr></thead><tbody>{form.abonnement.linjer.map((linje, i) => <tr key={linje.id}><td>{linje.navn}</td><td>{linje.fakturering === "maanedlig" ? "Månedligt" : "Engang"}</td><td><input aria-label={`Antal for ${linje.navn}`} type="number" min="1" value={linje.antal / 1000} disabled={accepteret} onChange={(e) => setForm((x) => ({ ...x, abonnement: { ...x.abonnement, linjer: x.abonnement.linjer.map((l, j) => j === i ? { ...l, antal: Math.max(1, Number(e.target.value) || 1) * 1000 } : l) } }))}/></td><td>{kr(linje.normalprisOere)}</td><td><input aria-label={`Aftalt pris for ${linje.navn}`} type="number" min="0" step="0.01" value={(linje.aftaltPrisOere ?? linje.normalprisOere) / 100} disabled={accepteret} onChange={(e) => setForm((x) => ({ ...x, abonnement: { ...x.abonnement, linjer: x.abonnement.linjer.map((l, j) => j === i ? { ...l, aftaltPrisOere: Math.round((Number(e.target.value) || 0) * 100) } : l) } }))}/></td><td><input aria-label={`Linjerabat for ${linje.navn}`} type="number" min="0" step="0.01" value={bpsTilPct(linje.linjerabatBps || 0)} disabled={accepteret} onChange={(e) => setForm((x) => ({ ...x, abonnement: { ...x.abonnement, linjer: x.abonnement.linjer.map((l, j) => j === i ? { ...l, linjerabatBps: pctTilBps(Number(e.target.value) || 0) } : l) } }))}/></td></tr>)}{!form.abonnement.linjer.length && <tr><td colSpan="6">Vælg et rateblad og mindst én prislinje.</td></tr>}</tbody></table></div></section>}
    */}
    {fane === "abonnement" && <AbonnementOgPriser form={form} setForm={setForm} data={data} prisliste={prisliste} katalog={katalog} accepteret={accepteret} saetFelt={sæt} />}
    {fane === "administratorer" && <Administratorer data={data} genindlaes={genindlaes}/>} {fane === "historik" && <Historik data={data}/>} 
    {!["administratorer", "historik"].includes(fane) && <footer className="ejer-konto-gem"><div><b>{dirty ? "Ikke-gemte ændringer" : "Kontoen er ajour"}</b><span>{aendringer.length ? aendringer.join(" · ") : "Ingen kommercielle forskelle i denne version."}</span></div><div><Knap disabled={arbejder || !dirty} onClick={() => gem(false, false)}>Gem med Opsætning mangler</Knap><Knap variant="primaer" disabled={arbejder || !dirty} onClick={() => gem(true, true)}>{form.abonnement.virkningsdato > isoIdag() ? "Planlæg ændring" : "Kontrollér og aktivér"}</Knap></div></footer>}
    {svar && <div className={svar.ok ? "ejer-konto-besked ok" : "ejer-konto-besked fejl"}>{svar.besked}</div>}
    {visKassering && <Dialog titel="Forlad kundekontoen?" onLuk={() => setVisKassering(false)}><p>Du har ændringer, der ikke er gemt.</p><div className="fc-formular-knapper"><Knap onClick={() => setVisKassering(false)}>Fortsæt redigering</Knap><Knap variant="fare" onClick={kasserOgGaa}>Kassér ændringer og gå tilbage</Knap></div></Dialog>}
  </div>;
}
