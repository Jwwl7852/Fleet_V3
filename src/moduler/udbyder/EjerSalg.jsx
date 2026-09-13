import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { iDagIsoLokal, kr, oereFraKroner } from "../../fleet/format.js";
import { MODUL, VALGFRIE_MODULER } from "../../fleet/moduler.js";
import {
  Dialog, Felt, Feltraekke, Formular, Henter, Knap, Kort, Pille, Tabel,
} from "../../fleet/ui.jsx";
import {
  CRM_AKTIVITETSART, CRM_AKTIVITETSSTATUS, CRM_FASE, CRM_KILDE,
  crmAktiviteter, crmMuligheder, crmVirksomhedsliste, erAabenMulighed,
  erForfaldenAktivitet, gemCrmAktivitet, gemCrmMulighed, gemCrmVirksomhed,
  harValideringsfejl, validerCrmAktivitet, validerCrmMulighed, validerCrmVirksomhed,
} from "../../fleet/ejer-crm.js";
import { useEjerData } from "./EjerDataContext.jsx";
import { beregnHitrate } from "../../fleet/ejer-kommunikation-regler.js";

const valg = (objekt) => Object.entries(objekt).map(([vaerdi, label]) => ({ vaerdi, label }));

function Tekstomraade({ id, label, vaerdi, saet, hint, fejl }) {
  const beskrivelse = [hint && `${id}-hint`, fejl && `${id}-fejl`].filter(Boolean).join(" ");
  return (
    <div className={`fc-felt${fejl ? " fc-felt-fejl" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows="4" value={vaerdi || ""} onChange={(e) => saet(e.target.value)}
        aria-invalid={fejl ? "true" : undefined} aria-describedby={beskrivelse || undefined} />
      {hint && <span className="fc-felt-hint" id={`${id}-hint`}>{hint}</span>}
      {fejl && <span className="fc-felt-fejltekst" id={`${id}-fejl`} role="alert">{fejl}</span>}
    </div>
  );
}

const kronerFelt = (oere) => Number.isInteger(oere) && oere ? String(oere / 100).replace(".", ",") : "";
const feltOere = (tekst) => String(tekst || "").trim() === "" ? 0 : oereFraKroner(tekst);

function Virksomhedsformular({ aktuel, profiler, bruger, onLuk, onGemt }) {
  const s = aktuel?.stamdata || {};
  const [f, setF] = useState({
    navn: s.navn || "", cvr: s.cvr || "", adresse: s.adresse || "",
    postnr: s.postnr || "", by: s.by || "", kontaktNavn: s.kontaktNavn || "",
    kontaktEmail: s.kontaktEmail || "", fakturaEmail: s.fakturaEmail || "",
    ean: s.ean || "", afsendelseskanal: s.afsendelseskanal || "email",
    ansvarligUid: s.ansvarligUid || bruger.uid, noter: s.noter || "",
  });
  const [visFejl, setVisFejl] = useState(false);
  const [gemmer, setGemmer] = useState(false);
  const [svar, setSvar] = useState(null);
  const resultat = validerCrmVirksomhed(f);
  const saet = (felt) => (vaerdi) => { setF((x) => ({ ...x, [felt]: vaerdi })); setSvar(null); };

  const gem = async () => {
    setVisFejl(true);
    if (harValideringsfejl(resultat)) return;
    setGemmer(true);
    const response = await gemCrmVirksomhed({
      ...resultat.post,
      id: aktuel?.id,
      forventetRevision: s.revision || 0,
    });
    setGemmer(false);
    setSvar(response);
    if (response.ok) await onGemt(response.data?.id);
  };

  return (
    <Dialog titel={aktuel ? "Redigér CRM-virksomhed" : "Ny CRM-virksomhed"}
      under="En CRM-virksomhed bliver ikke automatisk en kundetenant." onLuk={onLuk} bred>
      <Formular onGem={gem} gemmer={gemmer} kanGemme={!harValideringsfejl(resultat)}
        gemLabel={aktuel ? "Gem ændringer" : "Opret virksomhed"} onAnnuller={onLuk} svar={svar}>
        <Feltraekke>
          <Felt id="crm-navn" label="Virksomhedsnavn" vaerdi={f.navn} saet={saet("navn")}
            fejl={visFejl && resultat.fejl.navn} kraevet />
          <Felt id="crm-cvr" label="CVR" vaerdi={f.cvr} saet={saet("cvr")}
            fejl={visFejl && resultat.fejl.cvr} inputMode="numeric" />
          <Felt id="crm-ansvarlig" label="Ansvarlig ejer" vaerdi={f.ansvarligUid}
            saet={saet("ansvarligUid")} fejl={visFejl && resultat.fejl.ansvarligUid}
            valgmuligheder={profiler.map((p) => ({ vaerdi: p.uid, label: p.navn }))} kraevet />
        </Feltraekke>
        <Feltraekke>
          <Felt id="crm-adresse" label="Adresse" vaerdi={f.adresse} saet={saet("adresse")} />
          <Felt id="crm-postnr" label="Postnr." vaerdi={f.postnr} saet={saet("postnr")} />
          <Felt id="crm-by" label="By" vaerdi={f.by} saet={saet("by")} />
        </Feltraekke>
        <Feltraekke>
          <Felt id="crm-kontakt" label="Kontaktperson" vaerdi={f.kontaktNavn} saet={saet("kontaktNavn")} />
          <Felt id="crm-kontaktmail" label="Kontaktmail" type="email" vaerdi={f.kontaktEmail}
            saet={saet("kontaktEmail")} fejl={visFejl && resultat.fejl.kontaktEmail} />
          <Felt id="crm-fakturamail" label="Fakturamodtager" type="email" vaerdi={f.fakturaEmail}
            saet={saet("fakturaEmail")} fejl={visFejl && resultat.fejl.fakturaEmail} />
        </Feltraekke>
        <Feltraekke>
          <Felt id="crm-kanal" label="Foretrukken fakturakanal" vaerdi={f.afsendelseskanal}
            saet={saet("afsendelseskanal")} valgmuligheder={[
              { vaerdi: "email", label: "E-mail" }, { vaerdi: "ean", label: "EAN/GLN" },
              { vaerdi: "manuel", label: "Manuel" },
            ]} />
          <Felt id="crm-ean" label="EAN/GLN" vaerdi={f.ean} saet={saet("ean")}
            fejl={visFejl && resultat.fejl.ean} inputMode="numeric" />
        </Feltraekke>
        <Tekstomraade id="crm-noter" label="Interne noter" vaerdi={f.noter} saet={saet("noter")}
          hint="Noter er ejerdata og deles ikke med kundens tenant." />
      </Formular>
    </Dialog>
  );
}

function Mulighedsformular({ aktuel, virksomheder, profiler, bruger, fastVirksomhedId, onLuk, onGemt }) {
  const [f, setF] = useState({
    virksomhedId: fastVirksomhedId || aktuel?.virksomhedId || virksomheder[0]?.id || "",
    titel: aktuel?.titel || "", kontaktNavn: aktuel?.kontaktNavn || "",
    kontaktEmail: aktuel?.kontaktEmail || "", ansvarligUid: aktuel?.ansvarligUid || bruger.uid,
    kilde: aktuel?.kilde || "indgaaende", behov: aktuel?.behov || "",
    moduler: aktuel?.moduler || [], forventetLukDato: aktuel?.forventetLukDato || "",
    fase: aktuel?.fase || "ny", naesteAktivitet: aktuel?.naesteAktivitet || "",
    naesteAktivitetDato: aktuel?.naesteAktivitetDato || "",
    maanedlig: kronerFelt(aktuel?.maanedligVaerdiOere),
    engangs: kronerFelt(aktuel?.engangsVaerdiOere),
    tabtAarsag: aktuel?.tabtAarsag || "", konkurrent: aktuel?.konkurrent || "",
    pilotFra: aktuel?.pilotFra || "", pilotTil: aktuel?.pilotTil || "",
  });
  const [visFejl, setVisFejl] = useState(false);
  const [gemmer, setGemmer] = useState(false);
  const [svar, setSvar] = useState(null);
  const payload = {
    ...f,
    maanedligVaerdiOere: feltOere(f.maanedlig),
    engangsVaerdiOere: feltOere(f.engangs),
  };
  const resultat = validerCrmMulighed(payload, f.virksomhedId);
  const saet = (felt) => (vaerdi) => { setF((x) => ({ ...x, [felt]: vaerdi })); setSvar(null); };
  const skiftModul = (modul) => setF((x) => ({
    ...x, moduler: x.moduler.includes(modul) ? x.moduler.filter((m) => m !== modul) : [...x.moduler, modul],
  }));

  const gem = async () => {
    setVisFejl(true);
    if (harValideringsfejl(resultat)) return;
    setGemmer(true);
    const response = await gemCrmMulighed({
      ...resultat.post, id: aktuel?.id, forventetRevision: aktuel?.revision || 0,
    });
    setGemmer(false);
    setSvar(response);
    if (response.ok) await onGemt();
  };

  return (
    <Dialog titel={aktuel ? "Redigér salgsmulighed" : "Ny salgsmulighed"}
      under="Månedsværdi og engangsbeløb holdes adskilt." onLuk={onLuk} bred>
      <Formular onGem={gem} gemmer={gemmer} kanGemme={!harValideringsfejl(resultat)}
        gemLabel={aktuel ? "Gem mulighed" : "Opret mulighed"} onAnnuller={onLuk} svar={svar}>
        <Feltraekke>
          <Felt id="mul-virksomhed" label="Virksomhed" vaerdi={f.virksomhedId}
            saet={saet("virksomhedId")} disabled={Boolean(fastVirksomhedId)} kraevet
            valgmuligheder={virksomheder.map((v) => ({ vaerdi: v.id, label: v.stamdata?.navn || v.id }))}
            fejl={visFejl && resultat.fejl.virksomhedId} />
          <Felt id="mul-titel" label="Titel" vaerdi={f.titel} saet={saet("titel")}
            fejl={visFejl && resultat.fejl.titel} kraevet />
          <Felt id="mul-ejer" label="Ansvarlig ejer" vaerdi={f.ansvarligUid}
            saet={saet("ansvarligUid")} valgmuligheder={profiler.map((p) => ({ vaerdi: p.uid, label: p.navn }))}
            fejl={visFejl && resultat.fejl.ansvarligUid} kraevet />
        </Feltraekke>
        <Feltraekke>
          <Felt id="mul-fase" label="Fase" vaerdi={f.fase} saet={saet("fase")}
            valgmuligheder={valg(CRM_FASE)} fejl={visFejl && resultat.fejl.fase} />
          <Felt id="mul-kilde" label="Kilde" vaerdi={f.kilde} saet={saet("kilde")}
            valgmuligheder={valg(CRM_KILDE)} fejl={visFejl && resultat.fejl.kilde} />
          <Felt id="mul-luk" label="Forventet afslutning" type="date" vaerdi={f.forventetLukDato}
            saet={saet("forventetLukDato")} fejl={visFejl && resultat.fejl.forventetLukDato} />
        </Feltraekke>
        <Feltraekke>
          <Felt id="mul-kontakt" label="Kontaktperson" vaerdi={f.kontaktNavn} saet={saet("kontaktNavn")} />
          <Felt id="mul-mail" label="Kontaktmail" type="email" vaerdi={f.kontaktEmail}
            saet={saet("kontaktEmail")} fejl={visFejl && resultat.fejl.kontaktEmail} />
        </Feltraekke>
        <fieldset className="ejer-modulvalg">
          <legend>Interesserede moduler</legend>
          {VALGFRIE_MODULER.map((modul) => (
            <label key={modul}>
              <input type="checkbox" checked={f.moduler.includes(modul)} onChange={() => skiftModul(modul)} />
              <span>{MODUL[modul]?.label || modul}</span>
            </label>
          ))}
        </fieldset>
        <Feltraekke>
          <Felt id="mul-maaned" label="Månedlig aftaleværdi" vaerdi={f.maanedlig}
            saet={saet("maanedlig")} suffiks="kr. ekskl. moms"
            fejl={visFejl && resultat.fejl.maanedligVaerdiOere} inputMode="decimal" />
          <Felt id="mul-engangs" label="Engangsbeløb" vaerdi={f.engangs}
            saet={saet("engangs")} suffiks="kr. ekskl. moms"
            fejl={visFejl && resultat.fejl.engangsVaerdiOere} inputMode="decimal" />
        </Feltraekke>
        <Feltraekke>
          <Felt id="mul-naeste" label="Næste handling" vaerdi={f.naesteAktivitet}
            saet={saet("naesteAktivitet")} />
          <Felt id="mul-naeste-dato" label="Dato for næste handling" type="date"
            vaerdi={f.naesteAktivitetDato} saet={saet("naesteAktivitetDato")}
            fejl={visFejl && resultat.fejl.naesteAktivitetDato} />
        </Feltraekke>
        {f.fase === "demo" && <Feltraekke>
          <Felt id="mul-pilot-fra" label="Pilot fra" type="date" vaerdi={f.pilotFra}
            saet={saet("pilotFra")} fejl={visFejl && resultat.fejl.pilotFra} />
          <Felt id="mul-pilot-til" label="Pilot til" type="date" vaerdi={f.pilotTil}
            saet={saet("pilotTil")} fejl={visFejl && resultat.fejl.pilotTil} />
        </Feltraekke>}
        {f.fase === "tabt" && <Feltraekke>
          <Felt id="mul-tabt" label="Tabt årsag" vaerdi={f.tabtAarsag} saet={saet("tabtAarsag")} />
          <Felt id="mul-konkurrent" label="Konkurrent" vaerdi={f.konkurrent} saet={saet("konkurrent")} />
        </Feltraekke>}
        <Tekstomraade id="mul-behov" label="Behov og noter" vaerdi={f.behov} saet={saet("behov")} />
      </Formular>
    </Dialog>
  );
}

function Aktivitetsformular({ aktuel, virksomheder, muligheder, profiler, bruger, fastVirksomhedId, onLuk, onGemt }) {
  const [f, setF] = useState({
    virksomhedId: fastVirksomhedId || aktuel?.virksomhedId || virksomheder[0]?.id || "",
    mulighedId: aktuel?.mulighedId || "", titel: aktuel?.titel || "",
    art: aktuel?.art || "opgave", ansvarligUid: aktuel?.ansvarligUid || bruger.uid,
    fristDato: aktuel?.fristDato || iDagIsoLokal(), notat: aktuel?.notat || "",
    status: aktuel?.status || "aaben", resultat: aktuel?.resultat || "",
  });
  const [visFejl, setVisFejl] = useState(false);
  const [gemmer, setGemmer] = useState(false);
  const [svar, setSvar] = useState(null);
  const resultat = validerCrmAktivitet(f, f.virksomhedId);
  const saet = (felt) => (vaerdi) => { setF((x) => ({ ...x, [felt]: vaerdi })); setSvar(null); };
  const relevante = muligheder.filter((m) => m.virksomhedId === f.virksomhedId);

  const gem = async () => {
    setVisFejl(true);
    if (harValideringsfejl(resultat)) return;
    setGemmer(true);
    const response = await gemCrmAktivitet({
      ...resultat.post, id: aktuel?.id, forventetRevision: aktuel?.revision || 0,
    });
    setGemmer(false);
    setSvar(response);
    if (response.ok) await onGemt();
  };

  return (
    <Dialog titel={aktuel ? "Redigér aktivitet" : "Ny aktivitet"}
      under="En registreret mailaktivitet er ikke dokumentation for teknisk afsendelse." onLuk={onLuk} bred>
      <Formular onGem={gem} gemmer={gemmer} kanGemme={!harValideringsfejl(resultat)}
        gemLabel={aktuel ? "Gem aktivitet" : "Opret aktivitet"} onAnnuller={onLuk} svar={svar}>
        <Feltraekke>
          <Felt id="akt-virksomhed" label="Virksomhed" vaerdi={f.virksomhedId}
            saet={(v) => { saet("virksomhedId")(v); setF((x) => ({ ...x, virksomhedId: v, mulighedId: "" })); }}
            disabled={Boolean(fastVirksomhedId)} kraevet
            valgmuligheder={virksomheder.map((v) => ({ vaerdi: v.id, label: v.stamdata?.navn || v.id }))}
            fejl={visFejl && resultat.fejl.virksomhedId} />
          <Felt id="akt-mulighed" label="Salgsmulighed" vaerdi={f.mulighedId} saet={saet("mulighedId")}
            valgmuligheder={[{ vaerdi: "", label: "Ingen" }, ...relevante.map((m) => ({ vaerdi: m.id, label: m.titel }))]}
            fejl={visFejl && resultat.fejl.mulighedId} />
          <Felt id="akt-art" label="Type" vaerdi={f.art} saet={saet("art")}
            valgmuligheder={valg(CRM_AKTIVITETSART)} fejl={visFejl && resultat.fejl.art} />
        </Feltraekke>
        <Feltraekke>
          <Felt id="akt-titel" label="Aktivitet" vaerdi={f.titel} saet={saet("titel")}
            fejl={visFejl && resultat.fejl.titel} kraevet />
          <Felt id="akt-frist" label="Frist" type="date" vaerdi={f.fristDato} saet={saet("fristDato")}
            fejl={visFejl && resultat.fejl.fristDato} />
          <Felt id="akt-ejer" label="Ansvarlig ejer" vaerdi={f.ansvarligUid} saet={saet("ansvarligUid")}
            valgmuligheder={profiler.map((p) => ({ vaerdi: p.uid, label: p.navn }))}
            fejl={visFejl && resultat.fejl.ansvarligUid} kraevet />
        </Feltraekke>
        <Feltraekke>
          <Felt id="akt-status" label="Status" vaerdi={f.status} saet={saet("status")}
            valgmuligheder={valg(CRM_AKTIVITETSSTATUS)} fejl={visFejl && resultat.fejl.status} />
          {f.status === "afsluttet" && <Felt id="akt-resultat" label="Resultat" vaerdi={f.resultat}
            saet={saet("resultat")} />}
        </Feltraekke>
        <Tekstomraade id="akt-notat" label="Notat" vaerdi={f.notat} saet={saet("notat")} />
      </Formular>
    </Dialog>
  );
}

const profilnavn = (profiler, uid) => profiler.find((p) => p.uid === uid)?.navn || "Ukendt ejer";

export default function EjerSalg({ visning, bruger }) {
  const { crm, profiler: hentedeProfiler, fejl, henter, genindlaes } = useEjerData();
  const [dialog, setDialog] = useState(null);
  const [valgtVirksomhed, setValgtVirksomhed] = useState(null);
  const [ejerfilter, setEjerfilter] = useState(bruger.uid);
  const [pipelineSide, setPipelineSide] = useState(1);
  const [searchParams] = useSearchParams();
  const profiler = useMemo(() => hentedeProfiler?.length
    ? hentedeProfiler
    : [{ uid: bruger.uid, navn: bruger.navn || bruger.email, email: bruger.email }],
  [hentedeProfiler, bruger]);

  if (henter && crm === null) return <Henter hvad="CRM-data" />;
  if (fejl && crm === null) return (
    <div className="fc-empty fc-empty-bad"><b>CRM-data kunne ikke hentes.</b><p>{String(fejl.message || fejl)}</p>
      <Knap onClick={genindlaes}>Prøv igen</Knap></div>
  );

  const virksomheder = crmVirksomhedsliste(crm);
  const muligheder = crmMuligheder(crm);
  const aktiviteter = crmAktiviteter(crm);
  const valgt = virksomheder.find((v) => v.id === valgtVirksomhed) || null;
  const lukOgGenindlaes = async (id) => { await genindlaes(); if (id) setValgtVirksomhed(id); setDialog(null); };

  const formular = dialog?.art === "virksomhed" ? (
    <Virksomhedsformular aktuel={dialog.aktuel} profiler={profiler} bruger={bruger}
      onLuk={() => setDialog(null)} onGemt={lukOgGenindlaes} />
  ) : dialog?.art === "mulighed" ? (
    <Mulighedsformular aktuel={dialog.aktuel} virksomheder={virksomheder} profiler={profiler}
      bruger={bruger} fastVirksomhedId={dialog.virksomhedId}
      onLuk={() => setDialog(null)} onGemt={lukOgGenindlaes} />
  ) : dialog?.art === "aktivitet" ? (
    <Aktivitetsformular aktuel={dialog.aktuel} virksomheder={virksomheder} muligheder={muligheder}
      profiler={profiler} bruger={bruger} fastVirksomhedId={dialog.virksomhedId}
      onLuk={() => setDialog(null)} onGemt={lukOgGenindlaes} />
  ) : null;

  if (visning === "pipeline") {
    const udenNaeste = searchParams.get("filter") === "uden-naeste";
    const viste = muligheder.filter((m) => !udenNaeste || (erAabenMulighed(m) && !m.naesteAktivitetDato));
    const hitrate = beregnHitrate(muligheder);
    return <>
      {formular}
      <div className="ejer-handlingslinje">
        <p className="fc-hint">Månedsværdi og engangsbeløb summeres hver for sig. Hitrate: {hitrate.procent == null ? "ikke beregnelig" : `${hitrate.procent}% (${hitrate.vundet} af ${hitrate.afsluttede} afsluttede)`}.</p>
        <Knap variant="primaer" disabled={!virksomheder.length}
          onClick={() => setDialog({ art: "mulighed" })}>Ny salgsmulighed</Knap>
      </div>
      {!virksomheder.length ? <Kort><div className="fc-empty">Opret først en CRM-virksomhed under Kunder.</div></Kort> : (
        <div className="ejer-pipeline" aria-label="Salgspipeline">
          {Object.entries(CRM_FASE).map(([fase, label]) => {
            const poster = viste.filter((m) => m.fase === fase);
            const sidestoerrelse = 25; const antalSider = Math.max(1, Math.ceil(poster.length / sidestoerrelse));
            const vistePoster = fase === "vundet" ? poster.slice((Math.min(pipelineSide, antalSider) - 1) * sidestoerrelse, Math.min(pipelineSide, antalSider) * sidestoerrelse) : poster;
            const maaned = poster.reduce((s, m) => s + (m.maanedligVaerdiOere || 0), 0);
            const engangs = poster.reduce((s, m) => s + (m.engangsVaerdiOere || 0), 0);
            return <section className="ejer-pipeline-kolonne" key={fase}>
              <header><strong>{label}</strong><span>{poster.length}</span></header>
              <p>{kr(maaned)}/md. · {kr(engangs)} engang</p>
              <div>
                {vistePoster.map((m) => <button type="button" className="ejer-mulighed" key={m.id}
                  onClick={() => setDialog({ art: "mulighed", aktuel: m })}>
                  <strong>{m.titel}</strong><span>{m.virksomhedsnavn}</span>
                  <span>{kr(m.maanedligVaerdiOere)}/md.</span>
                  <small>{m.naesteAktivitetDato ? `${m.naesteAktivitetDato} · ${m.naesteAktivitet || "Opfølgning"}` : "Mangler næste handling"}</small>
                </button>)}
                {!poster.length && <div className="ejer-pipeline-tom">Ingen muligheder</div>}
                {fase === "vundet" && antalSider > 1 && <div className="ejer-pipeline-sider"><button type="button" disabled={pipelineSide <= 1} onClick={() => setPipelineSide((s) => Math.max(1, s - 1))}>Forrige</button><span>Side {Math.min(pipelineSide, antalSider)} af {antalSider}</span><button type="button" disabled={pipelineSide >= antalSider} onClick={() => setPipelineSide((s) => Math.min(antalSider, s + 1))}>Næste</button></div>}
              </div>
            </section>;
          })}
        </div>
      )}
    </>;
  }

  if (visning === "aktiviteter") {
    const iDag = iDagIsoLokal();
    const filter = searchParams.get("filter");
    const viste = aktiviteter
      .filter((a) => ejerfilter === "alle" || a.ansvarligUid === ejerfilter)
      .filter((a) => filter === "forfaldne" ? erForfaldenAktivitet(a, iDag) : filter === "idag" ? a.fristDato === iDag : true)
      .sort((a, b) => String(a.fristDato || "9999").localeCompare(String(b.fristDato || "9999")));
    const afslut = async (aktivitet) => {
      const response = await gemCrmAktivitet({ ...aktivitet, status: "afsluttet", forventetRevision: aktivitet.revision });
      if (response.ok) await genindlaes();
    };
    return <>
      {formular}
      <div className="ejer-handlingslinje">
        <label>Vis <select value={ejerfilter} onChange={(e) => setEjerfilter(e.target.value)}>
          <option value={bruger.uid}>Mine</option>
          {profiler.filter((p) => p.uid !== bruger.uid).map((p) => <option key={p.uid} value={p.uid}>{p.navn}</option>)}
          <option value="alle">Alle</option>
        </select></label>
        <Knap variant="primaer" disabled={!virksomheder.length}
          onClick={() => setDialog({ art: "aktivitet" })}>Ny aktivitet</Knap>
      </div>
      <Kort>
        <Tabel raekker={viste} tom="Ingen aktiviteter matcher filteret." kolonner={[
          { label: "Frist", render: (a) => <span className={erForfaldenAktivitet(a, iDag) ? "fc-bad" : ""}>{a.fristDato || "—"}</span> },
          { label: "Virksomhed", felt: "virksomhedsnavn" },
          { label: "Aktivitet", render: (a) => <><b>{a.titel}</b><div className="fc-hint">{CRM_AKTIVITETSART[a.art]}</div></> },
          { label: "Ansvarlig", render: (a) => profilnavn(profiler, a.ansvarligUid) },
          { label: "Status", render: (a) => <Pille tone={a.status === "afsluttet" ? "ok" : erForfaldenAktivitet(a, iDag) ? "bad" : "info"}>{CRM_AKTIVITETSSTATUS[a.status]}</Pille> },
          { label: "Handling", render: (a) => <span className="ejer-tabelhandlinger">
            <Knap onClick={() => setDialog({ art: "aktivitet", aktuel: a })}>Redigér</Knap>
            {a.status !== "afsluttet" && <Knap onClick={() => afslut(a)}>Afslut</Knap>}
          </span> },
        ]} />
      </Kort>
    </>;
  }

  const tidslinje = valgt
    ? Object.entries(valgt.tidslinje || {}).map(([id, post]) => ({ id, ...post })).sort((a, b) => b.ms - a.ms)
    : [];
  return <>
    {formular}
    <div className="ejer-handlingslinje">
      <p className="fc-hint">CRM-virksomheder kan eksistere uden tenant og uden abonnement.</p>
      <Knap variant="primaer" onClick={() => setDialog({ art: "virksomhed" })}>Ny CRM-virksomhed</Knap>
    </div>
    <div className="ejer-kundelayout">
      <Kort titel="Virksomheder">
        <Tabel raekker={virksomheder} tom="Ingen CRM-virksomheder endnu." paaRaekke={(v) => setValgtVirksomhed(v.id)}
          erValgt={(v) => v.id === valgtVirksomhed} kolonner={[
            { label: "Virksomhed", render: (v) => <><b>{v.stamdata?.navn}</b><div className="fc-hint">{v.stamdata?.cvr ? `CVR ${v.stamdata.cvr}` : "CVR ikke angivet"}</div></> },
            { label: "Kontakt", render: (v) => v.stamdata?.kontaktNavn || v.stamdata?.kontaktEmail || "—" },
            { label: "Ansvarlig", render: (v) => profilnavn(profiler, v.stamdata?.ansvarligUid) },
            { label: "Tenant", render: (v) => v.stamdata?.tenantId ? <Pille tone="ok">Provisioneret</Pille> : <Pille tone="info">Kun CRM</Pille> },
          ]} />
      </Kort>
      <Kort titel={valgt?.stamdata?.navn || "Kundekort"}>
        {!valgt ? <div className="fc-empty">Vælg en virksomhed for at se kundekort og historik.</div> : <div className="fc-grid">
          <div className="ejer-kundekort">
            <div><span>Kontakt</span><b>{valgt.stamdata?.kontaktNavn || "Ikke angivet"}</b><small>{valgt.stamdata?.kontaktEmail}</small></div>
            <div><span>Adresse</span><b>{valgt.stamdata?.adresse || "Ikke angivet"}</b><small>{[valgt.stamdata?.postnr, valgt.stamdata?.by].filter(Boolean).join(" ")}</small></div>
            <div><span>Fakturering</span><b>{valgt.stamdata?.fakturaEmail || "Ikke angivet"}</b><small>{valgt.stamdata?.afsendelseskanal || "email"}</small></div>
          </div>
          <div className="ejer-handlingslinje">
            <Knap onClick={() => setDialog({ art: "virksomhed", aktuel: valgt })}>Redigér kundekort</Knap>
            <Knap onClick={() => setDialog({ art: "mulighed", virksomhedId: valgt.id })}>Ny salgsmulighed</Knap>
            <Knap onClick={() => setDialog({ art: "aktivitet", virksomhedId: valgt.id })}>Ny aktivitet</Knap>
          </div>
          <h3>Tidslinje</h3>
          <ul className="ejer-tidslinje">
            {tidslinje.map((post) => <li key={post.id}><time>{new Date(post.ms).toLocaleString("da-DK")}</time><b>{post.art}</b><span>{profilnavn(profiler, post.uid)}</span></li>)}
            {!tidslinje.length && <li>Ingen historik endnu.</li>}
          </ul>
        </div>}
      </Kort>
    </div>
  </>;
}
