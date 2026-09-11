import { useEffect, useMemo, useState } from "react";
import { kr } from "../../fleet/format.js";
import { Henter, Knap, Kort, Pille, Tabel, Tom } from "../../fleet/ui.jsx";
import {
  gemBilagsmetadata, hentEjerBilag, hentOriginalBilag, klargoerBilagTilDinero,
  koerBilagsocr, saetBilagsstatus, uploadEjerBilag,
} from "../../fleet/ejer-bilag.js";

const tomMetadata = { leverandoer: "", dokumentnummer: "", dato: "", forfaldsdato: "", valuta: "DKK", beloebEksklMomsOere: "", momsOere: "", totalOere: "", kategori: "", betalingsreference: "" };
const tone = (s) => ["godkendt", "matchet_dinero"].includes(s) ? "ok" : ["afvist", "arkiveret"].includes(s) ? "bad" : ["mulig_dublet", "klar_til_dinero"].includes(s) ? "warn" : "info";
const fraOere = (v) => Number.isSafeInteger(v) ? String(v / 100).replace(".", ",") : "";
const tilOere = (v) => {
  if (v === "") return null;
  const tal = Number(String(v).replace(",", "."));
  return Number.isFinite(tal) ? Math.round(tal * 100) : "ugyldigt";
};

export default function EjerBilagsindbakke() {
  const [data, setData] = useState(null); const [valgtId, setValgtId] = useState(null);
  const [metadata, setMetadata] = useState(tomMetadata); const [arbejder, setArbejder] = useState(false);
  const [svar, setSvar] = useState(null); const [soeg, setSoeg] = useState("");
  const [fejledeFiler, setFejledeFiler] = useState([]);
  const hent = async () => setData(await hentEjerBilag());
  useEffect(() => { hent().catch((e) => setSvar({ ok: false, besked: e.message })); }, []);
  const poster = useMemo(() => Object.values(data?.poster || {}).filter((p) => !soeg || JSON.stringify(p).toLowerCase().includes(soeg.toLowerCase())).sort((a, b) => (b.modtagetMs || 0) - (a.modtagetMs || 0)), [data, soeg]);
  const valgt = data?.poster?.[valgtId] || poster[0] || null;
  useEffect(() => {
    const m = valgt?.metadata?.aktuel; const o = valgt?.ocr?.felter;
    const kilde = m || o || {};
    setMetadata({ ...tomMetadata, ...kilde, beloebEksklMomsOere: fraOere(kilde.beloebEksklMomsOere), momsOere: fraOere(kilde.momsOere), totalOere: fraOere(kilde.totalOere) });
  }, [valgt?.id, valgt?.metadata?.version, valgt?.ocr?.oprettetMs]);
  const kald = async (fn, besked) => { setArbejder(true); const r = await fn(); setArbejder(false); setSvar({ ok: r.ok, besked: r.ok ? besked : r.besked }); await hent(); return r; };
  const filer = async (liste, kildeArt = "filupload") => {
    const fejl = [];
    for (const file of Array.from(liste || [])) { const r = await kald(() => uploadEjerBilag(file, kildeArt), `${file.name} er modtaget og verificeret af serveren.`); if (!r.ok) fejl.push({ file, kildeArt }); }
    setFejledeFiler(fejl);
  };
  const statusLabel = (post) => post.status === "matchet_dinero" ? "Matchet i Dinero-testadapter" : String(post.status).replaceAll("_", " ");
  const gem = () => kald(() => gemBilagsmetadata({ id: valgt.id, forventetRevision: valgt.revision || 0, metadata: {
    ...metadata, beloebEksklMomsOere: tilOere(metadata.beloebEksklMomsOere), momsOere: tilOere(metadata.momsOere), totalOere: tilOere(metadata.totalOere),
  } }), "Metadata er gemt som en ny version.");
  const status = (ny) => kald(() => saetBilagsstatus({ id: valgt.id, forventetRevision: valgt.revision || 0, status: ny }), `Bilaget er sat til ${ny.replaceAll("_", " ")}.`);
  const hentFil = async () => { const r = await hentOriginalBilag({ id: valgt.id }); if (r.ok) window.location.assign(r.data.url); else setSvar(r); };
  if (!data) return <Henter hvad="Veyros bilagsindbakke" />;
  const bilagIntegration = data.integrationer?.bilag || {};
  return <div className="fc-grid" style={{ gap: 16 }}>
    <Kort titel="Modtag bilag">
      <div className="ejer-bilag-upload" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); filer(e.dataTransfer.files); }}>
        <label className="ejer-bilag-valg"><b>Upload bilag</b><input className="ejer-visuelt-skjult" type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={(e) => filer(e.target.files)} disabled={arbejder} /><strong>Vælg filer fra computer</strong><span>PDF, JPEG eller PNG</span></label>
        <label className="ejer-bilag-valg"><b>Foto af bilag</b><input className="ejer-visuelt-skjult" type="file" accept="image/jpeg,image/png" capture="environment" onChange={(e) => filer(e.target.files, "mobilkamera")} disabled={arbejder} /><strong>Vælg eller tag billede</strong><span>På en fysisk mobil kan systemets kamera tilbydes af enheden</span></label>
        <p><b>eller træk filer hertil</b><span>Maks. 20 MB · original og indholdssignatur bevares</span></p>
      </div>
      {arbejder && <p className="ejer-handlingssvar" role="status">Uploader og afventer serverens bekræftelse…</p>}
      {fejledeFiler.length > 0 && <p className="fc-fejltekst" role="alert">Uploaden blev ikke bekræftet. <button type="button" className="fc-btn" onClick={()=>filer(fejledeFiler.map((x)=>x.file),fejledeFiler[0].kildeArt)}>Prøv igen</button></p>}
      <div className="ejer-statuslinjer">
        <div><Pille tone="ok">Aktiv</Pille><span>Filvælger og drag & drop</span></div>
        <div><Pille tone={bilagIntegration.invoiceMail?.status === "aktiv" ? "ok" : "warn"}>{bilagIntegration.invoiceMail?.status === "aktiv" ? "Aktiv" : "Ikke tilsluttet"}</Pille><span>Invoice-mail/mappe</span></div>
        <div><Pille tone={bilagIntegration.inboundMail?.status === "aktiv" ? "ok" : "warn"}>{bilagIntegration.inboundMail?.status === "aktiv" ? "Aktiv" : "Ikke tilsluttet"}</Pille><span>Bilagsadresse ikke opsat</span></div>
        <div><Pille tone={bilagIntegration.ocr?.status === "aktiv" ? "ok" : "warn"}>{bilagIntegration.ocr?.status === "aktiv" ? "Aktiv" : "Ikke tilsluttet"}</Pille><span>OCR-forslag</span></div>
      </div>
    </Kort>
    <Kort titel="Bilagsindbakke" handling={<input aria-label="Søg i bilag" placeholder="Søg leverandør, nummer…" value={soeg} onChange={(e) => setSoeg(e.target.value)} />}>
      <Tabel noegle={(r) => r.id} paaRaekke={(r) => setValgtId(r.id)} erValgt={(r) => r.id === valgt?.id} raekker={poster} tom="Der er ingen modtagne bilag."
        kolonner={[
          { key: "dato", label: "Modtaget", render: (r) => new Date(r.modtagetMs).toLocaleDateString("da-DK") },
          { key: "leverandoer", label: "Leverandør", render: (r) => r.metadata?.aktuel?.leverandoer || r.ocr?.felter?.leverandoer || "Ikke udtrukket" },
          { key: "nummer", label: "Dokumentnr.", render: (r) => r.metadata?.aktuel?.dokumentnummer || "—" },
          { key: "kilde", label: "Kilde", render: (r) => r.kilde?.art || "ukendt" },
          { key: "status", label: "Status", render: (r) => <Pille tone={tone(r.status)}>{statusLabel(r)}</Pille> },
          { key: "total", label: "Total", num: true, render: (r) => Number.isSafeInteger(r.metadata?.aktuel?.totalOere) ? kr(r.metadata.aktuel.totalOere) : "Ukendt" },
        ]} />
    </Kort>
    {valgt ? <Kort titel={valgt.fil?.filnavn || valgt.id} handling={valgt.dublet && <Pille tone="warn">{valgt.dublet.art.replaceAll("_", " ")} · {valgt.dublet.score || 100}%</Pille>}>
      {valgt.dublet && <div className="fc-empty fc-empty-warn"><b>Mulig dublet — ikke slettet</b><p>{(valgt.dublet.grunde || []).join(" · ")} {valgt.dublet.andetBilagId && `· ${valgt.dublet.andetBilagId}`}</p></div>}
      <div className="fc-form-grid">
        {[["leverandoer", "Leverandør"], ["dokumentnummer", "Dokumentnummer"], ["dato", "Dato", "date"], ["forfaldsdato", "Forfald", "date"], ["valuta", "Valuta"], ["beloebEksklMomsOere", "Ekskl. moms (kr.)"], ["momsOere", "Moms (kr.)"], ["totalOere", "Total (kr.)"], ["kategori", "Kategori"], ["betalingsreference", "Betalingsreference"]].map(([felt, label, type]) => <label className="fc-field" key={felt}><span>{label}{valgt.ocr?.sikkerhed?.[felt] != null && <small> · OCR {valgt.ocr.sikkerhed[felt]}%</small>}</span><input type={type || "text"} value={metadata[felt] ?? ""} onChange={(e) => setMetadata((m) => ({ ...m, [felt]: e.target.value }))} /></label>)}
      </div>
      <div className="fc-formular-knapper">
        <Knap disabled={arbejder} onClick={hentFil}>Hent original</Knap>
        <Knap disabled={arbejder || bilagIntegration.ocr?.status !== "aktiv"} onClick={() => kald(() => koerBilagsocr({ id: valgt.id }), "OCR-forslaget er klar til gennemgang.")}>Kør OCR</Knap>
        <Knap variant="primaer" disabled={arbejder || !["ny", "under_behandling", "til_gennemgang", "mulig_dublet"].includes(valgt.status)} onClick={gem}>Gem ny metadataversion</Knap>
        {valgt.metadata?.aktuel && !["godkendt", "klar_til_dinero", "matchet_dinero"].includes(valgt.status) && <Knap disabled={arbejder} onClick={() => status("godkendt")}>Godkend gennemgang</Knap>}
        {valgt.status === "godkendt" && <Knap disabled={arbejder} onClick={() => kald(() => klargoerBilagTilDinero({ id: valgt.id }), "Bilaget er klargjort; overførsel er ikke tilsluttet.")}>Klargør til Dinero</Knap>}
        {!["arkiveret", "matchet_dinero"].includes(valgt.status) && <Knap disabled={arbejder} onClick={() => status("arkiveret")}>Arkivér</Knap>}
      </div>
    </Kort> : <Tom>Vælg et bilag.</Tom>}
    {svar && <div className={`fc-empty ${svar.ok ? "" : "fc-empty-bad"}`}><p>{svar.besked}</p></div>}
  </div>;
}
