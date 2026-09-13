import { useEffect, useMemo, useState } from "react";
import { kr } from "../../fleet/format.js";
import { beregnBogfoerteOmkostninger } from "../../fleet/ejer-bilag-regler.js";
import { Henter, Knap, Kort, KpiKort, KpiRaekke, Pille, Tabel } from "../../fleet/ui.jsx";
import { gemDineroKontomapping, hentEjerBilag, matchBilagTilDinero } from "../../fleet/ejer-bilag.js";

export default function EjerOmkostninger() {
  const [data, setData] = useState(null); const [valgt, setValgt] = useState(null); const [bilagId, setBilagId] = useState("");
  const [kategori, setKategori] = useState(""); const [koefficient, setKoefficient] = useState(1); const [svar, setSvar] = useState(null);
  const hent = async () => setData(await hentEjerBilag()); useEffect(() => { hent().catch((e) => setSvar({ ok: false, besked: e.message })); }, []);
  const beregning = useMemo(() => beregnBogfoerteOmkostninger(data?.dinero?.posteringer, data?.dinero?.kontomapping), [data]);
  const alle = Object.values(data?.dinero?.posteringer || {}).sort((a, b) => String(b.dato).localeCompare(String(a.dato)));
  const aktuel = alle.find((p) => p.id === valgt) || alle[0] || null;
  const afventer = Object.values(data?.poster || {}).filter((p) => ["godkendt", "klar_til_dinero"].includes(p.status));
  const ukendtBeloeb = afventer.filter((p) => !Number.isSafeInteger(p.metadata?.aktuel?.totalOere)).length;
  const koer = async (fn, besked) => { const r = await fn(); setSvar({ ok: r.ok, besked: r.ok ? besked : r.besked }); if (r.ok) await hent(); };
  if (!data) return <Henter hvad="bogførte omkostninger og bilagsmatch" />;
  return <div className="fc-grid" style={{ gap: 16 }}>
    <KpiRaekke><KpiKort label="Bogførte omkostninger" vaerdi={kr(beregning.ialtOere)} note="kun eksplicit mappede resultatkonti" /><KpiKort label="Afventer bogføring" vaerdi={afventer.length} note={`${ukendtBeloeb} med ukendt beløb`} /><KpiKort label="Umappede posteringer" vaerdi={beregning.umappede.length} note="udeladt af summen" /></KpiRaekke>
    <Kort titel="Dinero-posteringer"><p className="fc-hint">Dinero er autoritativ. Moms, bank, lån, aktiver og periodisering medregnes ikke, før kontoen eksplicit er klassificeret som resultatkonto.</p>
      <Tabel noegle={(r) => r.id} paaRaekke={(r) => setValgt(r.id)} erValgt={(r) => r.id === aktuel?.id} raekker={alle} tom="Ingen posteringer er synkroniseret fra Dinero."
        kolonner={[{ key: "dato", label: "Dato" }, { key: "leverandoer", label: "Tekst", render: (r) => r.tekst || "—" }, { key: "bilag", label: "Bilagsnr.", render: (r) => r.bilagsnummer || "—" }, { key: "konto", label: "Konto", render: (r) => `${r.kontonummer || "?"} · ${r.kontonavn || "ikke navngivet"}` }, { key: "kategori", label: "Kategori", render: (r) => data.dinero?.kontomapping?.[r.kontonummer]?.kategori || <Pille tone="warn">Kræver mapping</Pille> }, { key: "beløb", label: "Beløb", num: true, render: (r) => kr(r.beloebOere) }, { key: "match", label: "Bilag", render: (r) => Object.keys(r.bilagMatch || {}).length ? <Pille tone="ok">Matchet</Pille> : <Pille tone="warn">Mangler</Pille> }]} />
    </Kort>
    {aktuel && <Kort titel={`Afstem postering ${aktuel.bilagsnummer || aktuel.id}`}>
      <div className="fc-form-grid"><label className="fc-field"><span>Kategori for konto {aktuel.kontonummer}</span><input value={kategori} onChange={(e) => setKategori(e.target.value)} /></label><label className="fc-field"><span>Fortegn</span><select value={koefficient} onChange={(e) => setKoefficient(Number(e.target.value))}><option value={1}>Dinero-beløb som vist</option><option value={-1}>Omvendt fortegn</option></select></label><label className="fc-field"><span>Godkendt bilag</span><select value={bilagId} onChange={(e) => setBilagId(e.target.value)}><option value="">Vælg bilag</option>{afventer.map((b) => <option key={b.id} value={b.id}>{b.metadata?.aktuel?.leverandoer || b.fil?.filnavn} · {Number.isSafeInteger(b.metadata?.aktuel?.totalOere) ? kr(b.metadata.aktuel.totalOere) : "ukendt"}</option>)}</select></label></div>
      <div className="fc-formular-knapper"><Knap disabled={!kategori.trim() || !aktuel.kontonummer} onClick={() => koer(() => gemDineroKontomapping({ kontonummer: aktuel.kontonummer, kategori, resultatkonto: true, koefficient }), "Kontomappingen er gemt og summen genberegnet.")}>Gem som resultatkonto</Knap><Knap variant="primaer" disabled={!bilagId} onClick={() => koer(() => matchBilagTilDinero({ id: bilagId, posteringId: aktuel.id }), "Bilaget er koblet til Dinero-posteringen uden at oprette en ny udgift.")}>Match bilag</Knap></div>
    </Kort>}
    <Kort titel="Godkendte bilag, som ikke er bogført"><Tabel noegle={(r) => r.id} raekker={afventer} tom="Ingen godkendte bilag afventer bogføring." kolonner={[{ key: "leverandoer", label: "Leverandør", render: (r) => r.metadata?.aktuel?.leverandoer || "—" }, { key: "nummer", label: "Dokumentnr.", render: (r) => r.metadata?.aktuel?.dokumentnummer || "—" }, { key: "status", label: "Status", render: (r) => <Pille tone="warn">{r.status.replaceAll("_", " ")}</Pille> }, { key: "total", label: "Total", num: true, render: (r) => Number.isSafeInteger(r.metadata?.aktuel?.totalOere) ? kr(r.metadata.aktuel.totalOere) : "Ukendt" }]} /></Kort>
    {svar && <div className={`fc-empty ${svar.ok ? "" : "fc-empty-bad"}`}><p>{svar.besked}</p></div>}
  </div>;
}

