import { useEffect, useMemo, useState } from "react";
import { iDagIsoLokal, kr, oereFraKroner } from "../../fleet/format.js";
import { MODUL, VALGFRIE_MODULER } from "../../fleet/moduler.js";
import { Felt, Henter, Knap, Kort, Pille, Tabel } from "../../fleet/ui.jsx";
import {
  FAKTURERING, TILBUD_LINJEART, TILBUD_STATUS, TILBUDSTYPE, antalTilSkala, tilfoejKalendermaaneder,
  gemTilbud, genererTilbudsPdf, hentTilbudsPdf, ratebladFraPrisliste,
  registrerTilbudSendt, registrerTilbudsaccept,
  startTilbudsrevision, udstedTilbud, validerTilbud,
} from "../../fleet/ejer-tilbud.js";
import { gaeldendePrisliste } from "../../fleet/priser.js";
import { provisionerAftale } from "../../fleet/udbyder.js";
import { crmVirksomhedsliste } from "../../fleet/ejer-crm-regler.js";
import { useEjerData } from "./EjerDataContext.jsx";
import { afsendSalgsmail, hentSalgsplatform, opretTilbudMailkladde, spoergSalgsassistent } from "../../fleet/ejer-salgsindbakke.js";
import EjerIkon from "./EjerIkon.jsx";
import { foreslaaPilotEvaluering, lokaltTilbudsforslag, pilotEvalueringAdvarsel } from "../../fleet/ejer-v6-regler.js";

const valg = (o) => Object.entries(o).map(([vaerdi, label]) => ({ vaerdi, label }));
const kroner = (oere) => Number.isInteger(oere) ? String(oere / 100).replace(".", ",") : "";
const pct = (bps) => String((Number(bps) || 0) / 100).replace(".", ",");
const bps = (v) => Math.round(Number(String(v || "0").replace(",", ".")) * 100);
const plusDage = (dato, dage) => {
  const d = new Date(`${dato}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dage);
  return d.toISOString().slice(0, 10);
};
const nyLinje = () => ({
  id: crypto.randomUUID(), art: "andet", navn: "", beskrivelse: "", modulId: "",
  enhed: "stk.", fakturering: "maanedlig", antal: "1", normalpris: "",
  aftaltPris: "", linjerabat: "0", momssats: "25", rabatberettiget: true,
  priskilde: "Manuelt aftalt i tilbudskladde",
});
const linjeTilInput = (l) => ({
  ...l, antal: String((l.antal || 1000) / 1000).replace(".", ","),
  normalpris: kroner(l.normalprisOere),
  aftaltPris: l.aftaltPrisOere == null ? "" : kroner(l.aftaltPrisOere),
  linjerabat: pct(l.linjerabatBps), momssats: String(l.momssats),
});
const tone = (status) => status === "accepteret" ? "ok" : status === "sendt" ? "info" : status === "afvist" || status === "udloebet" ? "bad" : "warn";
const ratebladTitel = (liste) => {
  if (!liste) return "Ikke valgt";
  const navn = liste.navn || (String(liste.id || "").includes("fixture") ? "Syntetisk testrateblad" : "Veyro-rateblad");
  const version = liste.version || (liste.gyldigFraMs ? new Date(liste.gyldigFraMs).toLocaleDateString("da-DK", { month: "long", year: "numeric" }) : "uden versionsdato");
  return `${navn} · ${version}`;
};

function tilInput(tilbud, virksomhedId) {
  const k = tilbud?.kladde;
  const iDag = iDagIsoLokal();
  return {
    virksomhedId: k?.virksomhedId || tilbud?.virksomhedId || virksomhedId || "",
    mulighedId: k?.mulighedId || tilbud?.mulighedId || "", kontaktNavn: k?.kontaktNavn || "",
    kontaktEmail: k?.kontaktEmail || "", udstedelsesdato: k?.udstedelsesdato || iDag,
    gyldigTil: k?.gyldigTil || plusDage(iDag, 30), valuta: "DKK",
    generelRabat: pct(k?.generelRabatBps), introRabat: pct(k?.introRabatBps),
    introMaaneder: String(k?.introMaaneder || 0), bindingMaaneder: String(k?.bindingMaaneder ?? 3),
    betalingsbetingelser: k?.betalingsbetingelser || "Efter aftale",
    tilbudstype: k?.tilbudstype || "almindelig", pilotStart: k?.pilotStart || iDag,
    pilotMaaneder: String(k?.pilotMaaneder || 3), pilotEvaluering: k?.pilotEvaluering || foreslaaPilotEvaluering(k?.pilotStart || iDag, k?.pilotMaaneder || 3),
    generelRabatAlle: k?.linjer ? k.linjer.every((l)=>l.rabatberettiget !== false) : true,
    indledning: k?.indledning || "", behovstekst: k?.behovstekst || "", loesningsbeskrivelse: k?.loesningsbeskrivelse || "",
    forudsaetninger: k?.forudsaetninger || "", fritekst: k?.fritekst || "",
    prislisteId: k?.prislisteId || "",
    linjer: k?.linjer?.map(linjeTilInput) || [],
  };
}

function tilPost(f) {
  return {
    ...f, generelRabatBps: bps(f.generelRabat), introRabatBps: bps(f.introRabat),
    introMaaneder: Number(f.introMaaneder), bindingMaaneder: Number(f.bindingMaaneder), pilotMaaneder: Number(f.pilotMaaneder),
    linjer: f.linjer.map((l) => ({
      ...l, antal: antalTilSkala(String(l.antal).replace(",", ".")),
      normalprisOere: oereFraKroner(l.normalpris),
      aftaltPrisOere: String(l.aftaltPris).trim() ? oereFraKroner(l.aftaltPris) : null,
      linjerabatBps: bps(l.linjerabat), momssats: Number(l.momssats),
    })),
  };
}

function Tilbudsformular({ aktuel, virksomheder, prisliste, onGemt, onAnnuller }) {
  const [f, setF] = useState(() => tilInput(aktuel, virksomheder[0]?.id));
  const [operationId] = useState(() => crypto.randomUUID());
  const [gemmer, setGemmer] = useState(false);
  const [svar, setSvar] = useState(null);
  const [aiForslag, setAiForslag] = useState(null);
  const [aiInstruks, setAiInstruks] = useState("");
  const [aktivFane, setAktivFane] = useState("sammensaetning");
  const [tekstPanel, setTekstPanel] = useState("tekst");
  const [evalueringManuel, setEvalueringManuel] = useState(Boolean(aktuel?.kladde?.pilotEvaluering));
  const resultat = validerTilbud(tilPost(f));
  const pilotSlut = f.tilbudstype === "almindelig" ? null : tilfoejKalendermaaneder(f.pilotStart, Number(f.pilotMaaneder));
  const rateblad = useMemo(() => ratebladFraPrisliste(prisliste), [prisliste]);
  const kundeNavn = virksomheder.find((v) => v.id === f.virksomhedId)?.stamdata?.navn || "Ikke valgt";
  const evalAdvarsel = evalueringManuel ? pilotEvalueringAdvarsel(f.pilotStart, pilotSlut, f.pilotEvaluering) : "";
  const saet = (felt) => (vaerdi) => setF((x) => ({ ...x, [felt]: vaerdi }));
  const saetLinje = (id, felt, vaerdi) => setF((x) => ({
    ...x, linjer: x.linjer.map((l) => l.id === id ? { ...l, [felt]: vaerdi } : l),
  }));
  const vaelgRatebladslinje = (linje, valgt) => setF((x) => ({
    ...x,
    prislisteId: valgt ? prisliste?.id || x.prislisteId : x.prislisteId,
    linjer: valgt
      ? (x.linjer.some((l) => l.id === linje.id) ? x.linjer : [...x.linjer, linjeTilInput(linje)])
      : x.linjer.filter((l) => l.id !== linje.id),
  }));
  const saetPilot = (felt, vaerdi) => setF((x) => {
    const naeste = { ...x, [felt]: vaerdi };
    if (!evalueringManuel) naeste.pilotEvaluering = foreslaaPilotEvaluering(naeste.pilotStart, Number(naeste.pilotMaaneder));
    return naeste;
  });
  const gem = async () => {
    if (Object.keys(resultat.fejl).length) { setSvar({ ok: false, besked: Object.values(resultat.fejl)[0] }); return; }
    setGemmer(true);
    const response = await gemTilbud({
      ...resultat.post, id: aktuel?.id, operationId,
      forventetRevision: aktuel?.revision || 0,
    });
    setGemmer(false); setSvar(response);
    if (response.ok) await onGemt(response.data.id);
  };
  const foreslaa = async (felt, spoergsmaal) => {
    setGemmer(true);
    try {
      const platform = await hentSalgsplatform();
      const traad = Object.values(platform.traade || {}).find((t) => (f.mulighedId && t.links?.mulighedId === f.mulighedId) || (!f.mulighedId && t.links?.virksomhedId === f.virksomhedId));
      if (!traad || platform.integrationer?.openai?.status !== "aktiv") {
        const tekst = lokaltTilbudsforslag({ felt, kunde: kundeNavn, instruks: aiInstruks, pilot: f.tilbudstype !== "almindelig" });
        setAiForslag({ felt, tekst, basisTekst: f[felt] || "" });
        setSvar({ ok: true, besked: "Forslaget er lavet af den lokale testadapter. Ingen data er sendt til OpenAI." });
        return;
      }
      const r = await spoergSalgsassistent({ traadId: traad.id, spoergsmaal });
      setSvar(r); if (r.ok) setAiForslag({ felt, tekst: r.data?.resultat?.svar || "", basisTekst: f[felt] || "" });
    } finally { setGemmer(false); }
  };
  return <div className="fc-grid ejer-tilbudsredigering">
    <header className="ejer-tilbud-redigerhoved"><div><small>Tilbudskladde · {aktuel ? `næste version ${Number(aktuel.aktuelVersion || 0) + 1}` : "nyt tilbud"}</small><h2>{aktuel?.nummer || "Nyt tilbud"} · {kundeNavn}</h2><span>{aktuel?.accept ? "Separat kladde — accepteret version er fortsat låst" : "Kladde · ikke sendt"}</span></div><div><small>Rateblad</small><b>{ratebladTitel(prisliste)}</b><details><summary>Tekniske detaljer</summary><code>{f.prislisteId || prisliste?.id || "ingen nøgle"}</code></details></div></header>
    <nav className="ejer-tilbud-redigerfaner" aria-label="Tilbudsredigering">{[["sammensaetning","Sammensæt løsning"],["tekst","Tilbudstekst"],["dokument","Dokument"]].map(([id,label])=><button type="button" className={aktivFane===id?"aktiv":""} onClick={()=>setAktivFane(id)} key={id}>{label}</button>)}</nav>
    <section className="ejer-tilbud-kompaktsum"><div><span>Månedligt</span><b>{resultat.beregning ? kr(resultat.beregning.maanedlig.beloebOere) : "—"}</b></div><div><span>Engangsbeløb</span><b>{resultat.beregning ? kr(resultat.beregning.engang.beloebOere) : "—"}</b></div><small>Ekskl. moms · beregnet af Veyros prismotor</small></section>
    {aktivFane==="sammensaetning"&&<><Kort titel={aktuel ? `Redigér ${aktuel.nummer}` : "Nyt tilbud"}>
      <p className="fc-hint">Alle beløb genberegnes på serveren. Et kundespecifikt tilbud ændrer aldrig den officielle prisliste.</p>
      <div className="fc-form-grid">
        <Felt id="tilbud-kunde" label="CRM-virksomhed" vaerdi={f.virksomhedId} saet={saet("virksomhedId")}
          valgmuligheder={virksomheder.map((v) => ({ vaerdi: v.id, label: v.stamdata?.navn || v.id }))} />
        <Felt id="tilbud-kontakt" label="Kontaktperson" vaerdi={f.kontaktNavn} saet={saet("kontaktNavn")} />
        <Felt id="tilbud-mail" label="Kontaktmail" type="email" vaerdi={f.kontaktEmail} saet={saet("kontaktEmail")} />
        <Felt id="tilbud-udstedt" label="Udstedelsesdato" type="date" vaerdi={f.udstedelsesdato} saet={saet("udstedelsesdato")} />
        <Felt id="tilbud-gyldig" label="Gyldigt til" type="date" vaerdi={f.gyldigTil} saet={saet("gyldigTil")} />
        <Felt id="tilbud-binding" label="Binding, måneder" type="number" vaerdi={f.bindingMaaneder} saet={saet("bindingMaaneder")} />
        <Felt id="tilbud-rabat" label="Generel rabat, %" vaerdi={f.generelRabat} saet={saet("generelRabat")} />
        <Felt id="tilbud-intro" label="Introduktionsrabat, %" vaerdi={f.introRabat} saet={saet("introRabat")} />
        <Felt id="tilbud-intro-maaneder" label="Introduktion, måneder" type="number" vaerdi={f.introMaaneder} saet={saet("introMaaneder")} />
        <Felt id="tilbud-type" label="Tilbudstype" vaerdi={f.tilbudstype} saet={saet("tilbudstype")} valgmuligheder={valg(TILBUDSTYPE)} />
        {f.tilbudstype !== "almindelig" && <><Felt id="tilbud-pilot-start" label="Pilotstart" type="date" vaerdi={f.pilotStart} saet={(v)=>saetPilot("pilotStart",v)} /><Felt id="tilbud-pilot-maaneder" label="Pilotvarighed · kalendermåneder" type="number" vaerdi={f.pilotMaaneder} saet={(v)=>saetPilot("pilotMaaneder",v)} /><Felt id="tilbud-pilot-slut" label="Beregnet pilotslut" type="date" vaerdi={pilotSlut || ""} saet={()=>{}} disabled /><Felt id="tilbud-pilot-evaluering" label="Evalueringsaktivitet" type="date" vaerdi={f.pilotEvaluering} saet={(v)=>{setEvalueringManuel(true);saet("pilotEvaluering")(v);}} hint={evalueringManuel ? "Manuelt valgt" : "Automatisk: 14 dage før pilotslut"}/></>}
      </div>
      {f.tilbudstype === "pilot_med_drift" && <p className="ejer-infoboks"><EjerIkon navn="info" size={18}/> Fase 1 er den bindende pilot. Fase 2 er et vejledende driftstilbud og aktiveres aldrig automatisk ved pilotens udløb.</p>}
      {evalAdvarsel&&<p className="ejer-advarsel"><EjerIkon navn="info" size={18}/>{evalAdvarsel}</p>}
    </Kort>
    <Kort titel="Rateblad">
      <label className="ejer-rabat-alle"><input type="checkbox" checked={f.generelRabatAlle} onChange={(e)=>setF((x)=>({...x,generelRabatAlle:e.target.checked,linjer:x.linjer.map((l)=>({...l,rabatberettiget:e.target.checked}))}))}/> Rabat på alle valgte prislinjer <b>{f.generelRabat || "0"} %</b></label>
      {!f.generelRabatAlle && <p className="fc-hint">Vælg “Omfattet af generel rabat” på de konkrete linjer nedenfor.</p>}
      {rateblad.length ? <><p className="fc-hint">Kilde: <b>{ratebladTitel(prisliste)}</b>. Antal, aftalt pris og rabat ændres kun i denne kladde.</p><details className="ejer-rateblad-detaljer"><summary>Vis teknisk ratebladsnøgle</summary><code>{prisliste?.id}</code></details><div className="fc-scroll"><table className="fc-table"><thead><tr><th>Valgt</th><th>Produkt</th><th>Enhed</th><th>Interval</th><th className="fc-num">Normalpris</th></tr></thead><tbody>{rateblad.map((l) => { const valgt = f.linjer.some((x) => x.id === l.id); return <tr key={l.id}><td><input type="checkbox" checked={valgt} aria-label={`Vælg ${l.navn}`} onChange={(e) => vaelgRatebladslinje(l, e.target.checked)} /></td><td><b>{l.navn}</b></td><td>{l.enhed}</td><td>{FAKTURERING[l.fakturering]}</td><td className="fc-num">{kr(l.normalprisOere)}</td></tr>; })}</tbody></table></div></> : <p className="fc-hint">Ratebladet har endnu ingen positive tilbudssatser.</p>}
    </Kort>
    <Kort titel="Prislinjer" handling={<Knap onClick={() => setF((x) => ({ ...x, linjer: [...x.linjer, nyLinje()] }))}>Tilføj linje</Knap>}>
      <div className="ejer-tilbudslinjer">{f.linjer.map((l, indeks) => <fieldset key={l.id} className="ejer-tilbudslinje"><legend>Linje {indeks + 1} · {l.navn || "ny ydelse"}</legend><div className="fc-form-grid"><Felt id={`tl-navn-${l.id}`} label="Ydelse" vaerdi={l.navn} saet={(v) => saetLinje(l.id, "navn", v)} /><Felt id={`tl-art-${l.id}`} label="Art" vaerdi={l.art} saet={(v) => saetLinje(l.id, "art", v)} valgmuligheder={valg(TILBUD_LINJEART)} /><Felt id={`tl-modul-${l.id}`} label="Modul (valgfrit)" vaerdi={l.modulId || ""} saet={(v) => saetLinje(l.id, "modulId", v)} valgmuligheder={[{ vaerdi: "", label: "Intet modul" }, ...VALGFRIE_MODULER.map((m) => ({ vaerdi: m, label: MODUL[m].label }))]} /><Felt id={`tl-form-${l.id}`} label="Interval" vaerdi={l.fakturering} saet={(v) => saetLinje(l.id, "fakturering", v)} valgmuligheder={valg(FAKTURERING)} /><Felt id={`tl-antal-${l.id}`} label="Antal" vaerdi={l.antal} saet={(v) => saetLinje(l.id, "antal", v)} /><Felt id={`tl-enhed-${l.id}`} label="Enhed" vaerdi={l.enhed} saet={(v) => saetLinje(l.id, "enhed", v)} /><Felt id={`tl-normal-${l.id}`} label="Normalpris, kr." vaerdi={l.normalpris} saet={(v) => saetLinje(l.id, "normalpris", v)} /><Felt id={`tl-aftalt-${l.id}`} label="Aftalt pris, kr." vaerdi={l.aftaltPris} saet={(v) => saetLinje(l.id, "aftaltPris", v)} /><Felt id={`tl-rabat-${l.id}`} label="Linjerabat, %" vaerdi={l.linjerabat} saet={(v) => saetLinje(l.id, "linjerabat", v)} /><Felt id={`tl-moms-${l.id}`} label="Moms, %" vaerdi={l.momssats} saet={(v) => saetLinje(l.id, "momssats", v)} /></div><Knap variant="fare" onClick={() => setF((x) => ({ ...x, linjer: x.linjer.filter((x) => x.id !== l.id) }))}>Fjern linje</Knap></fieldset>)}</div>
    </Kort></>}
    {aktivFane==="tekst"&&<>
      <nav className="ejer-tilbud-mobilpaneler" aria-label="Tilbudstekst på mobil"><button type="button" className={tekstPanel==="tekst"?"aktiv":""} onClick={()=>setTekstPanel("tekst")}>Tilbudstekst</button><button type="button" className={tekstPanel==="ai"?"aktiv":""} onClick={()=>setTekstPanel("ai")}>Veyro-assistent</button></nav>
      <div className={`ejer-tilbud-tekstlayout panel-${tekstPanel}`}>
        <section className="ejer-design-kort ejer-tilbud-teksteditor"><h2>Tilbudstekst</h2><p className="fc-hint">Teksten stammer fra den seneste låste version og gemmes kun i den nye kladde.</p><Felt id="tilbud-indledning" label="Indledning" vaerdi={f.indledning} saet={saet("indledning")} multiline /><Knap onClick={() => foreslaa("indledning", "Skriv en kort, kundetilpasset tilbudsindledning uden priser eller udokumenterede løfter.")} disabled={gemmer}>Foreslå indledning</Knap><Felt id="tilbud-behov" label="Kundens behov" vaerdi={f.behovstekst} saet={saet("behovstekst")} multiline /><Knap onClick={() => foreslaa("behovstekst", "Beskriv kundens bekræftede behov. Markér uafklarede forhold og opfind intet.")} disabled={gemmer}>Beskriv kundens behov</Knap><Felt id="tilbud-loesning" label="Løsningsbeskrivelse" vaerdi={f.loesningsbeskrivelse} saet={saet("loesningsbeskrivelse")} multiline /><Knap onClick={() => foreslaa("loesningsbeskrivelse", "Foreslå en Veyro-løsningsbeskrivelse ud fra godkendt viden og respekter leveringsstatus. Medtag ingen priser.")} disabled={gemmer}>Foreslå løsningsbeskrivelse</Knap></section>
        <aside className="ejer-design-kort ejer-tilbud-ai"><h2><EjerIkon navn="sparkles" size={26}/> Veyro-assistent</h2><p className="fc-hint">Lokal testadapter. Forslag ændrer intet før indsættelse; Priser og totaler berøres aldrig.</p><Felt id="tilbud-ai-instruks" label="Sælgerens anvisning til næste forslag" vaerdi={aiInstruks} saet={setAiInstruks} multiline hint="Fx: Gør teksten kortere og fremhæv pilotens afgrænsning. Anvisningen sendes ikke til kunden." />{aiForslag ? <div className="ejer-ai-resultat"><strong>AI-forslag · gennemgå før indsættelse</strong><p>{aiForslag.tekst}</p>{f[aiForslag.felt]!==aiForslag.basisTekst&&<p className="ejer-advarsel">Feltet er ændret efter forslaget blev lavet. Lav et nyt forslag for at undgå at overskrive nyere tekst.</p>}<div className="fc-actions"><Knap variant="primaer" disabled={f[aiForslag.felt]!==aiForslag.basisTekst} onClick={() => { setF((x) => ({ ...x, [aiForslag.felt]: aiForslag.tekst })); setAiForslag(null); }}>Indsæt i tilbud</Knap><Knap onClick={() => foreslaa(aiForslag.felt, `Revidér forslaget efter sælgerens anvisning: ${aiInstruks || "gør teksten mere konkret"}`)} disabled={gemmer}>Lav revideret forslag</Knap><Knap onClick={() => setAiForslag(null)}>Forkast</Knap></div></div> : <div className="ejer-ai-tom"><EjerIkon navn="sparkles" size={30}/><b>Vælg en teksthandling</b><p>Det første forslag vises her. Tilføj derefter en anvisning og lav en revideret version.</p></div>}{svar?.besked&&<p role="status" className={svar.ok?"fc-ok":"fc-fejltekst"}>{svar.besked}</p>}</aside>
      </div>
    </>}
    {aktivFane==="dokument"&&<Kort titel="Dokument"><div className="ejer-tilbud-dokumentkladde"><small>Forhåndsvisning · kladde · ikke sendt</small><h2>{aktuel?.nummer || "Nyt tilbud"}</h2><h3>{kundeNavn}</h3><p>{f.indledning || "Indledning er ikke skrevet endnu."}</p><h3>Kundens behov</h3><p>{f.behovstekst || "Behovstekst er ikke skrevet endnu."}</p><h3>Løsning</h3><p>{f.loesningsbeskrivelse || "Løsningsbeskrivelse er ikke skrevet endnu."}</p><footer><b>Månedligt: {resultat.beregning ? kr(resultat.beregning.maanedlig.beloebOere) : "—"}</b><b>Engangsbeløb: {resultat.beregning ? kr(resultat.beregning.engang.beloebOere) : "—"}</b></footer></div></Kort>}
    {false&&<Kort titel="Rateblad">
      <label className="ejer-rabat-alle"><input type="checkbox" checked={f.generelRabatAlle} onChange={(e)=>setF((x)=>({...x,generelRabatAlle:e.target.checked,linjer:x.linjer.map((l)=>({...l,rabatberettiget:e.target.checked}))}))}/> Rabat på alle valgte prislinjer <b>{f.generelRabat || "0"} %</b></label>
      {!f.generelRabatAlle && <p className="fc-hint">Vælg “Omfattet af generel rabat” på de konkrete linjer nedenfor.</p>}
      {rateblad.length ? <>
        <p className="fc-hint">Afkrydsning indsætter den gældende listes pris som en tilbudslinje. Antal, særpris og rabat ændres kun i kladden; prislisten forbliver uændret.</p>
        <div className="fc-scroll"><table className="fc-table"><thead><tr><th>Valgt</th><th>Produkt</th><th>Enhed</th><th>Fakturering</th><th className="fc-num">Normalpris</th></tr></thead><tbody>
          {rateblad.map((l) => {
            const valgt = f.linjer.some((x) => x.id === l.id);
            return <tr key={l.id}>
              <td><input type="checkbox" checked={valgt} aria-label={`Vælg ${l.navn}`} onChange={(e) => vaelgRatebladslinje(l, e.target.checked)} /></td>
              <td><b>{l.navn}</b></td><td>{l.enhed}</td><td>{FAKTURERING[l.fakturering]}</td><td className="fc-num">{kr(l.normalprisOere)}</td>
            </tr>;
          })}
        </tbody></table></div>
      </> : <p className="fc-hint">Den gældende officielle prisliste har endnu ingen positive tilbudssatser. Tilføj kun manuelle linjer, hvis prisen er særskilt aftalt og dokumenteret.</p>}
    </Kort>}
    {false&&<Kort titel="Prislinjer" handling={<Knap onClick={() => setF((x) => ({ ...x, linjer: [...x.linjer, nyLinje()] }))}>Tilføj linje</Knap>}>
      <div className="ejer-tilbudslinjer">
        {f.linjer.map((l, indeks) => <fieldset key={l.id} className="ejer-tilbudslinje">
          <legend>Linje {indeks + 1}</legend>
          <div className="fc-form-grid">
            <Felt id={`tl-navn-${l.id}`} label="Ydelse" vaerdi={l.navn} saet={(v) => saetLinje(l.id, "navn", v)} />
            <Felt id={`tl-art-${l.id}`} label="Art" vaerdi={l.art} saet={(v) => saetLinje(l.id, "art", v)} valgmuligheder={valg(TILBUD_LINJEART)} />
            <Felt id={`tl-modul-${l.id}`} label="Modul (valgfrit)" vaerdi={l.modulId || ""} saet={(v) => saetLinje(l.id, "modulId", v)} valgmuligheder={[{ vaerdi: "", label: "Intet modul" }, ...VALGFRIE_MODULER.map((m) => ({ vaerdi: m, label: MODUL[m].label }))]} />
            <Felt id={`tl-form-${l.id}`} label="Fakturering" vaerdi={l.fakturering} saet={(v) => saetLinje(l.id, "fakturering", v)} valgmuligheder={valg(FAKTURERING)} />
            <Felt id={`tl-antal-${l.id}`} label="Antal" vaerdi={l.antal} saet={(v) => saetLinje(l.id, "antal", v)} />
            <Felt id={`tl-enhed-${l.id}`} label="Enhed" vaerdi={l.enhed} saet={(v) => saetLinje(l.id, "enhed", v)} />
            <Felt id={`tl-normal-${l.id}`} label="Normalpris, kr." vaerdi={l.normalpris} saet={(v) => saetLinje(l.id, "normalpris", v)} />
            <Felt id={`tl-aftalt-${l.id}`} label="Aftalt pris, kr. (valgfri)" vaerdi={l.aftaltPris} saet={(v) => saetLinje(l.id, "aftaltPris", v)} />
            <Felt id={`tl-rabat-${l.id}`} label="Linjerabat, %" vaerdi={l.linjerabat} saet={(v) => saetLinje(l.id, "linjerabat", v)} />
            <Felt id={`tl-moms-${l.id}`} label="Moms, %" vaerdi={l.momssats} saet={(v) => saetLinje(l.id, "momssats", v)} />
            {!f.generelRabatAlle && <label className="fc-field"><span>Generel rabat</span><span><input type="checkbox" checked={l.rabatberettiget !== false} onChange={(e)=>saetLinje(l.id,"rabatberettiget",e.target.checked)}/> Omfattet af generel rabat</span></label>}
          </div>
          <Knap variant="fare" onClick={() => setF((x) => ({ ...x, linjer: x.linjer.filter((x) => x.id !== l.id) }))}>Fjern linje</Knap>
        </fieldset>)}
      </div>
    </Kort>}
    <Kort titel="Beregning">
      {resultat.beregning ? <div className="ejer-kundekort">
        <div><span>Månedligt ekskl. moms</span><b>{kr(resultat.beregning.maanedlig.beloebOere)}</b></div>
        <div><span>Engangsbeløb ekskl. moms</span><b>{kr(resultat.beregning.engang.beloebOere)}</b></div>
        <div><span>Første år ekskl. moms</span><b>{kr(resultat.beregning.foersteAarEksklMomsOere)}</b></div>
      </div> : <p className="fc-hint">Udfyld de påkrævede oplysninger for at se beregningen.</p>}
      {svar && <p role="status" className={svar.ok ? "fc-ok" : "fc-fejltekst"}>{svar.ok ? (svar.besked || "Tilbudskladden er gemt på serveren.") : svar.besked}</p>}
      <div className="fc-actions"><Knap variant="primaer" onClick={gem} disabled={gemmer}>{gemmer ? "Gemmer…" : "Gem kladde"}</Knap><Knap onClick={onAnnuller}>Annullér</Knap></div>
    </Kort>
  </div>;
}

function Tilbudsdokument({ tilbud, virksomhed, onOpdater, onRedigerRevision }) {
  const accepteretVersion = Number(tilbud.accept?.version || 0) || null;
  const [vistVersion, setVistVersion] = useState(accepteretVersion || tilbud.aktuelVersion);
  const version = tilbud.versioner?.[vistVersion];
  const s = version?.snapshot;
  const laastVersion = Boolean(s);
  const [sender, setSender] = useState(false);
  const [begrundelse, setBegrundelse] = useState("");
  const [acceptMetode, setAcceptMetode] = useState("email");
  const [acceptDokumentation, setAcceptDokumentation] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [eksisterendeAftaleId, setEksisterendeAftaleId] = useState(
    virksomhed?.stamdata?.aftaleId || "",
  );
  const [virkningsdato, setVirkningsdato] = useState(iDagIsoLokal());
  const [svar, setSvar] = useState(null);
  const [viserMail, setViserMail] = useState(false);
  const [tekstFane, setTekstFane] = useState("tekst");
  const [mail, setMail] = useState({ til: s?.kontaktEmail || "", emne: `Tilbud ${tilbud.nummer} fra Veyro Systems`, tekst: `Hej ${s?.kontaktNavn || ""}\n\nVedhæftet finder du tilbud ${tilbud.nummer}, version ${vistVersion}.\n\nDu er meget velkommen til at kontakte os med spørgsmål.`, signatur: "Venlig hilsen\nVeyro Systems" });
  const [mailjob, setMailjob] = useState(null);
  const udsted = async () => { setSender(true); const r = await udstedTilbud({ id: tilbud.id, forventetRevision: tilbud.revision, operationId: crypto.randomUUID() }); setSender(false); setSvar({ ...r, succes: `Version ${r.data?.version} er udstedt og låst.` }); if (r.ok) await onOpdater(); };
  const sendt = async () => { setSender(true); const r = await registrerTilbudSendt({ id: tilbud.id, forventetRevision: tilbud.revision, begrundelse }); setSender(false); setSvar({ ...r, succes: "Den manuelle afsendelse er registreret med audit." }); if (r.ok) await onOpdater(); };
  const opretMail = async () => { setSender(true); let r = await genererTilbudsPdf({ id: tilbud.id, version: vistVersion }); if (r.ok) r = await opretTilbudMailkladde({ tilbudId: tilbud.id, version: vistVersion, ...mail }); setSender(false); setSvar({ ...r, succes: "Mailkladden er gemt med den præcise tilbudsversion og PDF." }); if (r.ok) { setMailjob(r.data); await onOpdater(); } };
  const sendMail = async () => { setSender(true); const r = await afsendSalgsmail({ jobId: mailjob.jobId, forventetRevision: mailjob.revision }); setSender(false); setSvar({ ...r, succes: "Microsoft Graph har accepteret anmodningen. Afsendelsen dokumenteres først ved Sendt post-synk." }); if (r.ok) await onOpdater(); };
  const revision = async () => { setSender(true); const r = await startTilbudsrevision({ id: tilbud.id, forventetRevision: tilbud.revision }); setSender(false); setSvar({ ...r, succes: `Kladde til version ${r.data?.naesteVersion} er oprettet.` }); if (r.ok) await onRedigerRevision(true); };
  const accepter = async () => { setSender(true); const r = await registrerTilbudsaccept({ id: tilbud.id, version: tilbud.aktuelVersion, forventetRevision: tilbud.revision, metode: acceptMetode, dokumentation: acceptDokumentation }); setSender(false); setSvar({ ...r, succes: `Accept af version ${tilbud.aktuelVersion} er registreret.` }); if (r.ok) await onOpdater(); };
  const pdf = async () => {
    setSender(true);
    const genereret = await genererTilbudsPdf({ id: tilbud.id, version: vistVersion });
    if (!genereret.ok) { setSender(false); setSvar(genereret); return; }
    const download = await hentTilbudsPdf({ id: tilbud.id, version: vistVersion });
    setSender(false); setSvar({ ...download, succes: `PDF for version ${vistVersion} er klar.` });
    if (download.ok) { window.location.assign(download.data.url); await onOpdater(); }
  };
  const provisioner = async () => {
    setSender(true);
    const r = await provisionerAftale({
      tilbudId: tilbud.id, version: accepteretVersion,
      tenantId: tenantId.trim() || undefined, virkningsdato,
      eksisterendeAftaleId: eksisterendeAftaleId.trim() || undefined,
      operationId: crypto.randomUUID(),
    });
    setSender(false); setSvar({ ...r, succes: r.data?.status === "planlagt" ? "Aftalen er planlagt til virkningsdatoen." : "Aftaleprocessen er gennemført." });
    if (r.ok) await onOpdater();
  };
  if (tilbud.status === "kladde" && !accepteretVersion) return <Kort titel={`${tilbud.nummer} — kladde`}><p>Kladde gemt. Udstedelse fryser version {Number(tilbud.aktuelVersion || 0) + 1}; tidligere versioner ændres ikke.</p><Knap variant="primaer" onClick={udsted} disabled={sender}>{sender ? "Arbejder…" : `Udsted version ${Number(tilbud.aktuelVersion || 0) + 1}`}</Knap>{svar && !svar.ok && <p className="fc-fejltekst">{svar.besked}</p>}</Kort>;
  if (viserMail) return (
    <div className="ejer-send-tilbud">
      <button type="button" className="ejer-tilbage" onClick={() => setViserMail(false)}>← Tilbage til tilbud</button>
      <div className="ejer-send-layout">
        <section className="ejer-design-kort ejer-email-kunde">
          <header><h2>E-mail til kunde</h2><span>Kladde · ikke sendt</span><small>Gemmes automatisk</small></header>
          <label>Fra<input value="info@veyrosystems.com" readOnly /></label>
          <label>Til<input type="email" value={mail.til} onChange={(e) => setMail({ ...mail, til: e.target.value })} /><i>Cc&nbsp;&nbsp;&nbsp; Bcc</i></label>
          <label>Emne<input value={mail.emne} onChange={(e) => setMail({ ...mail, emne: e.target.value })} /></label>
          <textarea value={`${mail.tekst}\n\n${mail.signatur}`} onChange={(e) => setMail({ ...mail, tekst: e.target.value })} />
          <div className="ejer-pdf-vedhaeftning">
            <b>Vedhæftet fil</b><span>PDF</span>
            <p><strong>{`${tilbud.nummer}_v${vistVersion}.pdf`}</strong><small>Gemt tilbudsversion {vistVersion} · permanent versionsdokument</small></p>
            <button type="button" onClick={pdf}>Åbn PDF</button>
          </div>
        </section>
        <aside>
          <section className="ejer-design-kort ejer-foer-send">
            <h2>Før du sender</h2>
            <p><span>✓</span><b>Korrekt modtager</b><small>{mail.til}</small></p>
            <p><span>✓</span><b>Korrekt version</b><small>Version {vistVersion} ({tilbud.nummer}) er vedhæftet</small></p>
            <p><EjerIkon navn="info" size={22} /><b>Ekstern afsendelse er ikke tilsluttet</b><small>Microsoft 365 skal være verificeret før afsendelse.</small></p>
          </section>
          <section className="ejer-design-kort ejer-plan-opfoelgning">
            <h2>Planlæg opfølgning</h2>
            <label>Dato<input type="date" defaultValue={plusDage(iDagIsoLokal(), 7)} /></label>
            <label>Ansvarlig<select defaultValue="dennis"><option value="dennis">Dennis Christensen</option><option value="joern">Jørn</option></select></label>
            <p><span>✓</span>Opret mailkladde, hvis kunden ikke svarer</p>
            <small><EjerIkon navn="info" size={18} /> Opfølgningen kræver din godkendelse.</small>
          </section>
          <div className="ejer-send-actions">
            <button type="button" onClick={opretMail} disabled={sender || !mail.til || !mail.emne || !mail.tekst}>Gem kladde</button>
            <button type="button" className="ejer-primaer" onClick={mailjob ? sendMail : opretMail} disabled={sender}><EjerIkon navn="send" size={21} />Send via Microsoft 365</button>
          </div>
          <section className="ejer-manuel-afsendelse">
            <label>Dokumentation for ekstern afsendelse<input value={begrundelse} onChange={(e) => setBegrundelse(e.target.value)} placeholder="Fx Outlook-reference eller journalnote" /></label>
            <button type="button" onClick={sendt} disabled={sender || !begrundelse.trim()}>Registrér manuelt sendt</button>
            <small>Bruges kun, når afsendelsen er dokumenteret uden for Veyro. Handlingen sender ikke en mail.</small>
          </section>
          {svar && <p className={svar.ok ? "fc-ok" : "fc-fejltekst"}>{svar.ok ? svar.succes : svar.besked}</p>}
        </aside>
      </div>
    </div>
  );
  return <div className="fc-grid ejer-tilbud-design">
    <section className="ejer-tilbud-identitet"><div><h2>{tilbud.nummer}</h2><span className={tilbud.accept ? "ok" : "warn"}>{Number(vistVersion) === accepteretVersion ? `Version ${vistVersion} · accepteret og låst` : tilbud.status === "kladde" && tilbud.accept ? `Separat kladde · version ${Number(tilbud.aktuelVersion || 0) + 1}` : TILBUD_STATUS[tilbud.status]}</span><label>Vis version <select value={vistVersion} onChange={(e)=>setVistVersion(Number(e.target.value))}>{Object.keys(tilbud.versioner || {}).sort((a,b)=>Number(b)-Number(a)).map((v)=><option key={v} value={v}>Version {v}{Number(v)===accepteretVersion ? " · accepteret og låst" : " · låst"}</option>)}</select></label></div><p>{virksomhed?.stamdata?.navn || tilbud.virksomhedId}</p>{tilbud.status === "kladde" && tilbud.accept && <small>En nyere kladde er et separat arbejdsdokument. Den accepterede version og dens PDF ændres ikke.</small>}</section>
    <section className="ejer-design-kort ejer-tilbud-summering"><div><span className="ejer-ikonfelt">◇</span><p><small>Abonnement</small><b>{kr(s.beregning.maanedlig.beloebOere)}/md.</b></p></div><div><span className="ejer-ikonfelt">▤</span><p><small>Engangsydelser</small><b>{kr(s.beregning.engang.beloebOere)}</b></p></div><p><b>Eksempelpriser · ekskl. moms</b><small>Priserne hentes fra ratebladet. AI redigerer kun tekst.</small></p></section>
    <div className="ejer-tilbud-layout"><section className="ejer-design-kort ejer-tilbud-tekst"><div className="ejer-tabs">{[["rate","Rateblad"],["tekst","Tilbudstekst"],["dokument","Dokument"]].map(([id,label])=><button type="button" key={id} className={tekstFane===id?"aktiv":""} onClick={()=>setTekstFane(id)}>{label}</button>)}</div>{tekstFane==="rate"?<><h2>Prislinjer fra ratebladet</h2><p className="ejer-laast-note">Låst versionsgrundlag · priser og antal kan ikke redigeres her.</p><Tabel raekker={s.beregning.linjer} kolonner={[{key:"navn",label:"Ydelse"},{key:"antal",label:"Antal",render:l=>`${l.antal/1000} ${l.enhed}`},{key:"total",label:"Linjetotal",num:true,render:l=>kr(l.linjetotalOere)}]}/></>:tekstFane==="dokument"?<><h2>Permanent versionsdokument</h2><p>PDF'en er bundet til version {vistVersion} og SHA-256-kontrolleres før afsendelse.</p><button type="button" className="ejer-primaer" onClick={pdf}>Åbn PDF</button></>:<><h2>Kundetilpasset indledning</h2>{laastVersion && <div className="ejer-laast-note"><EjerIkon navn="lock" size={17}/> Låst version · teksten er skrivebeskyttet</div>}<div className="ejer-editorfelt ejer-editorfelt-laast">{s.indledning||s.behovstekst||"Tilbuddet tager udgangspunkt i kundens bekræftede behov og den aftalte løsning."}</div><h2>Løsningsbeskrivelse</h2><div className="ejer-editorfelt ejer-editorfelt-laast">{s.loesningsbeskrivelse||"Omfang, arbejdsproces og introduktion gennemgås sammen med kunden."}</div><div className="ejer-prislinjer"><h2>⌄ Prislinjer fra ratebladet <button type="button" onClick={()=>setTekstFane("rate")}>Se låste prislinjer ↗</button></h2>{s.beregning.linjer.slice(0,5).map(l=><p key={l.id||l.navn}><span>✓</span>{l.navn}</p>)}</div></>}</section><aside className="ejer-design-kort ejer-tilbud-assistent"><h2><EjerIkon navn="sparkles" size={30}/>Veyro-assistent</h2><div className="ejer-laast-panel"><EjerIkon navn="lock" size={23}/><div><b>Denne tilbudsversion er låst</b><p>AI kan ikke indsætte eller ændre tekst, priser, rabatter eller totaler i et udstedt tilbud.</p></div></div><p className="fc-hint">Opret en separat ny kladde for at arbejde videre. Den accepterede version og dens permanente PDF forbliver uændrede.</p><div className="ejer-tilbud-hovedactions ejer-tilbud-hovedactions-laast"><button type="button" onClick={pdf}>Se PDF</button>{tilbud.status !== "kladde" && <button type="button" className="ejer-primaer" onClick={revision}>Opret ny kladde</button>}</div>{svar&&<p className={svar.ok?"fc-ok":"fc-fejltekst"}>{svar.ok?svar.succes:svar.besked}</p>}</aside></div>
    {tilbud.status === "sendt" && <Kort titel="Registrér kundens accept">
      <p className="fc-hint">Accepten bindes til version {tilbud.aktuelVersion}. Den opretter hverken aftale, tenant, invitation eller faktura automatisk.</p>
      <Felt id="tilbud-accept-metode" label="Metode" vaerdi={acceptMetode} saet={setAcceptMetode} valgmuligheder={[
        { vaerdi: "email", label: "E-mail" }, { vaerdi: "underskrevet_pdf", label: "Underskrevet PDF" },
        { vaerdi: "moede", label: "Møde" }, { vaerdi: "telefon", label: "Telefon" }, { vaerdi: "andet", label: "Andet" },
      ]} />
      <Felt id="tilbud-accept-dokumentation" label="Dokumentation / reference" vaerdi={acceptDokumentation} saet={setAcceptDokumentation} />
      <Knap variant="primaer" onClick={accepter} disabled={sender || !acceptDokumentation.trim()}>Registrér accept af version {tilbud.aktuelVersion}</Knap>
    </Kort>}
    {tilbud.accept && <Kort titel="Aktivér kundeaftale">
      <p className="fc-hint">Den accepterede version {accepteretVersion} er låst og bruges som aftalegrundlag. En eventuel nyere kladde ændrer ikke aftalen. Processen kan genoptages sikkert efter fejl.</p>
      <Felt id="aftale-virkning" label="Virkningsdato" type="date" vaerdi={virkningsdato} saet={setVirkningsdato} />
      <Felt id="aftale-eksisterende" label="Eksisterende aftale-id (valgfrit)" vaerdi={eksisterendeAftaleId} saet={setEksisterendeAftaleId}
        hint="Udfyld for at føje en ny, uforanderlig aftaleversion til kundens eksisterende aftale." />
      <Felt id="aftale-tenant" label="Permanent tenant-id (valgfrit ved første kørsel)" vaerdi={tenantId} saet={setTenantId} hint="Små bogstaver, tal og bindestreg. Lad feltet stå tomt for kun at oprette aftalen." />
      <Knap variant="primaer" onClick={provisioner} disabled={sender || !virkningsdato}>Gennemgå og aktivér kundeaftale</Knap>
      {tilbud.accept && <p className="fc-hint">Accepteret version {tilbud.accept.version} den {new Date(tilbud.accept.ms).toLocaleString("da-DK")} via {tilbud.accept.metode}.</p>}
    </Kort>}
  </div>;
}

export default function EjerTilbud() {
  const { crm, tilbud, prislister, henter, fejl, genindlaes } = useEjerData();
  const virksomheder = crmVirksomhedsliste(crm || {});
  const liste = useMemo(() => Object.entries(tilbud || {}).map(([id, x]) => ({ id, ...x })).sort((a, b) => (b.opdateretMs || 0) - (a.opdateretMs || 0)), [tilbud]);
  const [valgtId, setValgtId] = useState(null);
  const [redigerer, setRedigerer] = useState(false);
  const valgt = liste.find((x) => x.id === valgtId) || null;
  useEffect(() => { if (!valgtId && liste[0]) setValgtId(liste[0].id); }, [liste, valgtId]);
  const prisliste = gaeldendePrisliste(prislister || {}, Date.now());
  const kladdePrislisteId = valgt?.status === "kladde" ? valgt?.kladde?.prislisteId : null;
  const redigeringsPrisliste = kladdePrislisteId && prislister?.[kladdePrislisteId]
    ? { id: kladdePrislisteId, ...prislister[kladdePrislisteId] }
    : prisliste;
  if (henter && !crm) return <Henter hvad="tilbud" />;
  if (fejl) return <Kort titel="Tilbud kunne ikke hentes"><p>{fejl.message}</p><Knap onClick={genindlaes}>Prøv igen</Knap></Kort>;
  if (redigerer) return <Tilbudsformular aktuel={valgt?.status === "kladde" ? valgt : null} virksomheder={virksomheder} prisliste={redigeringsPrisliste}
    onAnnuller={() => setRedigerer(false)} onGemt={async (id) => { await genindlaes(); setValgtId(id); setRedigerer(false); }} />;
  return <div className="fc-grid">
    <div className="ejer-handlingslinje"><p>Nummererede tilbud med serverberegning og uforanderlige udstedte versioner.</p><Knap variant="primaer" onClick={() => { setValgtId(null); setRedigerer(true); }} disabled={!virksomheder.length}>Nyt tilbud</Knap></div>
    {!virksomheder.length && <Kort titel="Opret først en CRM-virksomhed"><p>Et tilbud skal være knyttet til en vedvarende CRM-virksomhed.</p></Kort>}
    <Kort titel="Tilbud">
      <Tabel raekker={liste} paaRaekke={(r) => setValgtId(r.id)} erValgt={(r) => r.id === valgtId} tom="Ingen tilbud endnu." kolonner={[
        { key: "nummer", label: "Nummer" }, { key: "kunde", label: "Kunde", render: (r) => crm?.[r.virksomhedId]?.stamdata?.navn || r.virksomhedId },
        { key: "status", label: "Status", render: (r) => <Pille tone={tone(r.status)}>{TILBUD_STATUS[r.status] || r.status}</Pille> },
        { key: "version", label: "Version", num: true, render: (r) => r.aktuelVersion || "—" },
      ]} />
    </Kort>
    {valgt && <><div className="fc-actions">{valgt.status === "kladde" && <Knap onClick={() => setRedigerer(true)}>{valgt.accept ? "Redigér separat kladde" : "Redigér kladde"}</Knap>}</div><Tilbudsdokument tilbud={valgt} virksomhed={crm?.[valgt.virksomhedId]} onOpdater={genindlaes} onRedigerRevision={async (alleredeStartet = false) => { if (!alleredeStartet && valgt.status !== "kladde") { const r = await startTilbudsrevision({ id: valgt.id, forventetRevision: valgt.revision }); if (!r.ok) return; } await genindlaes(); setRedigerer(true); }} /></>}
  </div>;
}
