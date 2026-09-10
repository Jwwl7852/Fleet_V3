import { useMemo, useState } from "react";
import { iDagIsoLokal, kr, oereFraKroner } from "../../fleet/format.js";
import { MODUL, VALGFRIE_MODULER } from "../../fleet/moduler.js";
import { Felt, Henter, Knap, Kort, Pille, Tabel } from "../../fleet/ui.jsx";
import {
  FAKTURERING, TILBUD_LINJEART, TILBUD_STATUS, antalTilSkala,
  gemTilbud, registrerTilbudSendt, udstedTilbud, validerTilbud,
} from "../../fleet/ejer-tilbud.js";
import { crmVirksomhedsliste } from "../../fleet/ejer-crm-regler.js";
import { useEjerData } from "./EjerDataContext.jsx";

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
const tone = (status) => status === "accepteret" ? "ok" : status === "sendt" ? "info" : status === "afvist" || status === "udloebet" ? "bad" : "warn";

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
    forudsaetninger: k?.forudsaetninger || "", fritekst: k?.fritekst || "",
    linjer: k?.linjer?.map((l) => ({
      ...l, antal: String((l.antal || 0) / 1000).replace(".", ","),
      normalpris: kroner(l.normalprisOere), aftaltPris: l.aftaltPrisOere === null ? "" : kroner(l.aftaltPrisOere),
      linjerabat: pct(l.linjerabatBps), momssats: String(l.momssats),
    })) || [nyLinje()],
  };
}

function tilPost(f) {
  return {
    ...f, generelRabatBps: bps(f.generelRabat), introRabatBps: bps(f.introRabat),
    introMaaneder: Number(f.introMaaneder), bindingMaaneder: Number(f.bindingMaaneder),
    linjer: f.linjer.map((l) => ({
      ...l, antal: antalTilSkala(String(l.antal).replace(",", ".")),
      normalprisOere: oereFraKroner(l.normalpris),
      aftaltPrisOere: String(l.aftaltPris).trim() ? oereFraKroner(l.aftaltPris) : null,
      linjerabatBps: bps(l.linjerabat), momssats: Number(l.momssats),
    })),
  };
}

function Tilbudsformular({ aktuel, virksomheder, onGemt, onAnnuller }) {
  const [f, setF] = useState(() => tilInput(aktuel, virksomheder[0]?.id));
  const [operationId] = useState(() => crypto.randomUUID());
  const [gemmer, setGemmer] = useState(false);
  const [svar, setSvar] = useState(null);
  const resultat = validerTilbud(tilPost(f));
  const saet = (felt) => (vaerdi) => setF((x) => ({ ...x, [felt]: vaerdi }));
  const saetLinje = (id, felt, vaerdi) => setF((x) => ({
    ...x, linjer: x.linjer.map((l) => l.id === id ? { ...l, [felt]: vaerdi } : l),
  }));
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
  return <div className="fc-grid ejer-tilbudsredigering">
    <Kort titel={aktuel ? `Redigér ${aktuel.nummer}` : "Nyt tilbud"}>
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
      </div>
    </Kort>
    <Kort titel="Prislinjer" handling={<Knap onClick={() => setF((x) => ({ ...x, linjer: [...x.linjer, nyLinje()] }))}>Tilføj linje</Knap>}>
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
          </div>
          <Knap variant="fare" onClick={() => setF((x) => ({ ...x, linjer: x.linjer.filter((x) => x.id !== l.id) }))}>Fjern linje</Knap>
        </fieldset>)}
      </div>
    </Kort>
    <Kort titel="Beregning">
      {resultat.beregning ? <div className="ejer-kundekort">
        <div><span>Månedligt ekskl. moms</span><b>{kr(resultat.beregning.maanedlig.beloebOere)}</b></div>
        <div><span>Engangsbeløb ekskl. moms</span><b>{kr(resultat.beregning.engang.beloebOere)}</b></div>
        <div><span>Første år ekskl. moms</span><b>{kr(resultat.beregning.foersteAarEksklMomsOere)}</b></div>
      </div> : <p className="fc-hint">Udfyld de påkrævede oplysninger for at se beregningen.</p>}
      {svar && <p role="status" className={svar.ok ? "fc-ok" : "fc-fejltekst"}>{svar.ok ? "Tilbudskladden er gemt på serveren." : svar.besked}</p>}
      <div className="fc-actions"><Knap variant="primaer" onClick={gem} disabled={gemmer}>{gemmer ? "Gemmer…" : "Gem kladde"}</Knap><Knap onClick={onAnnuller}>Annullér</Knap></div>
    </Kort>
  </div>;
}

function Tilbudsdokument({ tilbud, virksomhed, onOpdater }) {
  const version = tilbud.versioner?.[tilbud.aktuelVersion];
  const s = version?.snapshot;
  const [sender, setSender] = useState(false);
  const [begrundelse, setBegrundelse] = useState("");
  const [svar, setSvar] = useState(null);
  const udsted = async () => { setSender(true); const r = await udstedTilbud({ id: tilbud.id, forventetRevision: tilbud.revision, operationId: crypto.randomUUID() }); setSender(false); setSvar(r); if (r.ok) await onOpdater(); };
  const sendt = async () => { setSender(true); const r = await registrerTilbudSendt({ id: tilbud.id, forventetRevision: tilbud.revision, begrundelse }); setSender(false); setSvar(r); if (r.ok) await onOpdater(); };
  if (tilbud.status === "kladde") return <Kort titel={`${tilbud.nummer} — kladde`}><p>Kladde gemt. Udstedelse fryser denne version; den kan derefter udskrives eller gemmes som PDF fra browseren.</p><Knap variant="primaer" onClick={udsted} disabled={sender}>{sender ? "Arbejder…" : "Udsted version 1"}</Knap>{svar && !svar.ok && <p className="fc-fejltekst">{svar.besked}</p>}</Kort>;
  return <div className="fc-grid">
    <Kort titel={`${tilbud.nummer} · version ${tilbud.aktuelVersion}`} handling={<Pille tone={tone(tilbud.status)}>{TILBUD_STATUS[tilbud.status]}</Pille>} className="ejer-tilbudsdokument">
      <h2>{virksomhed?.stamdata?.navn || tilbud.virksomhedId}</h2>
      <p>{s.kontaktNavn || "Ingen kontakt angivet"}{s.kontaktEmail ? ` · ${s.kontaktEmail}` : ""}</p>
      <p>Udstedt {s.udstedelsesdato} · gyldigt til {s.gyldigTil} · {s.valuta}</p>
      <Tabel raekker={s.beregning.linjer} kolonner={[
        { key: "navn", label: "Ydelse" }, { key: "antal", label: "Antal", num: true, render: (l) => `${l.antal / 1000} ${l.enhed}` },
        { key: "sats", label: "Pris ekskl. moms", num: true, render: (l) => kr(l.satsOere) },
        { key: "total", label: "Linjetotal", num: true, render: (l) => kr(l.linjetotalOere) },
      ]} />
      <div className="ejer-tilbudstotal"><span>Månedligt: <b>{kr(s.beregning.maanedlig.beloebOere)}</b> ekskl. moms</span><span>Engang: <b>{kr(s.beregning.engang.beloebOere)}</b> ekskl. moms</span></div>
      {s.introMaaneder > 0 && <p>Introduktion: {s.introRabatBps / 100} % i {s.introMaaneder} måneder. Derefter normal aftalt pris.</p>}
      <p>Binding: {s.bindingMaaneder} måneder · Betaling: {s.betalingsbetingelser}</p>
      {s.forudsaetninger && <p><b>Forudsætninger</b><br />{s.forudsaetninger}</p>}
    </Kort>
    <Kort titel="Dokument og afsendelse">
      <p className="fc-hint">“Udskriv / gem PDF” åbner browserens dokumentdialog. Der er endnu ingen tilsluttet tilbudsmail; manuel registrering er tydeligt markeret som manuel.</p>
      <div className="fc-actions"><Knap onClick={() => window.print()}>Udskriv / gem PDF</Knap></div>
      <Felt id="tilbud-manuel-send" label="Manuel afsendelse — kanal og dokumentation" vaerdi={begrundelse} saet={setBegrundelse} />
      <Knap variant="primaer" onClick={sendt} disabled={sender || !begrundelse.trim()}>Registrér manuelt sendt</Knap>
      {svar && <p role="status" className={svar.ok ? "fc-ok" : "fc-fejltekst"}>{svar.ok ? "Den manuelle afsendelse er registreret med audit." : svar.besked}</p>}
    </Kort>
  </div>;
}

export default function EjerTilbud() {
  const { crm, tilbud, henter, fejl, genindlaes } = useEjerData();
  const virksomheder = crmVirksomhedsliste(crm || {});
  const liste = useMemo(() => Object.entries(tilbud || {}).map(([id, x]) => ({ id, ...x })).sort((a, b) => (b.opdateretMs || 0) - (a.opdateretMs || 0)), [tilbud]);
  const [valgtId, setValgtId] = useState(null);
  const [redigerer, setRedigerer] = useState(false);
  const valgt = liste.find((x) => x.id === valgtId) || null;
  if (henter && !crm) return <Henter hvad="tilbud" />;
  if (fejl) return <Kort titel="Tilbud kunne ikke hentes"><p>{fejl.message}</p><Knap onClick={genindlaes}>Prøv igen</Knap></Kort>;
  if (redigerer) return <Tilbudsformular aktuel={valgt?.status === "kladde" ? valgt : null} virksomheder={virksomheder}
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
    {valgt && <><div className="fc-actions">{valgt.status === "kladde" && <Knap onClick={() => setRedigerer(true)}>Redigér kladde</Knap>}</div><Tilbudsdokument tilbud={valgt} virksomhed={crm?.[valgt.virksomhedId]} onOpdater={genindlaes} /></>}
  </div>;
}
