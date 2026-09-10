import { useEffect, useMemo, useState } from "react";
import { kr } from "../../fleet/format.js";
import { EJER_KPI_DEFINITIONER, beregnEjerKpi } from "../../fleet/ejer-kpi.js";
import { hentEjerOekonomi } from "../../fleet/ejer-oekonomi.js";
import { Henter, Kort, KpiKort, KpiRaekke, Pille, Tabel } from "../../fleet/ui.jsx";

const denneMaaned = () => new Date().toISOString().slice(0, 7);
const Definition = ({ navn }) => { const d = EJER_KPI_DEFINITIONER[navn]; return <p className="fc-hint"><b>{d.grundlag}</b> · {d.kilde}</p>; };

export default function EjerOekonomiOverblik() {
  const [data, setData] = useState(null); const [fejl, setFejl] = useState(null); const [maaned, setMaaned] = useState(denneMaaned());
  const [kundeId, setKundeId] = useState(""); const [modulId, setModulId] = useState(""); const [kategori, setKategori] = useState("");
  useEffect(() => { hentEjerOekonomi().then(setData).catch(setFejl); }, []);
  const kpi = useMemo(() => data ? beregnEjerKpi({ ...data, periode: maaned, kundeId, modulId, kategori }) : null, [data, maaned, kundeId, modulId, kategori]);
  if (!data && !fejl) return <Henter hvad="afstemte ejer-KPI'er" />;
  if (fejl) return <div className="fc-empty fc-empty-bad"><b>Økonomidata kunne ikke hentes.</b><p>{fejl.message}</p></div>;
  const alder = kpi.betaling.aldersgrupper;
  const kunder = Object.entries(data.crm || {}).map(([id, v]) => ({ id, navn: v.stamdata?.navn || id }));
  const moduler = [...new Set(Object.values(data.crm || {}).flatMap((v) => Object.values(v.muligheder || {}).flatMap((m) => m.moduler || [])))].sort();
  const kategorier = [...new Set(Object.values(data.dinero?.kontomapping || {}).map((m) => m.kategori).filter(Boolean))].sort();
  return <div className="fc-grid" style={{ gap: 16 }}>
    <Kort titel="Periode, filtre og datadækning">
      <div className="fc-form-grid"><label className="fc-field"><span>Periode</span><input type="month" aria-label="KPI-periode" value={maaned} onChange={(e) => setMaaned(e.target.value)} /></label><label className="fc-field"><span>Kunde</span><select value={kundeId} onChange={(e) => setKundeId(e.target.value)}><option value="">Alle kunder</option>{kunder.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}</select></label><label className="fc-field"><span>Modul</span><select value={modulId} onChange={(e) => setModulId(e.target.value)}><option value="">Alle moduler</option>{moduler.map((m) => <option key={m}>{m}</option>)}</select></label><label className="fc-field"><span>Omkostningskategori</span><select value={kategori} onChange={(e) => setKategori(e.target.value)}><option value="">Alle kategorier</option>{kategorier.map((k) => <option key={k}>{k}</option>)}</select></label></div>
      <div className="ejer-statuslinjer"><div><Pille tone={kpi.salg.dataKomplet ? "ok" : "warn"}>{kpi.salg.dataKomplet ? "Dinero-data" : "Begrænset"}</Pille><span>Salgskilde: {kpi.salg.datakilde}</span></div><div><Pille tone={kpi.omkostning.dataKomplet ? "ok" : "warn"}>{kpi.omkostning.dataKomplet ? "Ajour" : "Ikke fuldt afstemt"}</Pille><span>Posteringer · {kpi.omkostning.umappede.length} umappede</span></div></div>
    </Kort>
    <KpiRaekke>
      <KpiKort label="Faktureret salg, netto" vaerdi={kpi.salg.dataKomplet ? kr(kpi.salg.faktureretNettoOere) : "Ikke tilstrækkelige data"} note="ekskl. moms" til="/main/oekonomi/fakturaer" />
      <KpiKort label="Registrerede betalinger" vaerdi={kr(kpi.betaling.registreretOere)} note="inkl. moms · efter betalingsdato" til="/main/oekonomi/fakturaer" />
      <KpiKort label="Restbeløb" vaerdi={!kpi.salg.dataKomplet || kpi.betaling.restUkendt ? "Ikke fuldt kendt" : kr(kpi.betaling.restOere)} note={`${kpi.betaling.restUkendt} fakturaer uden restdata`} til="/main/oekonomi/fakturaer" />
      <KpiKort label="Bogførte omkostninger" vaerdi={kpi.omkostning.dataKomplet ? kr(kpi.omkostning.ialtOere) : "Ikke tilstrækkelige data"} note="kun mappede resultatkonti" til="/main/oekonomi/omkostninger" />
      <KpiKort label="Foreløbig difference" vaerdi={kpi.salg.dataKomplet && kpi.omkostning.dataKomplet ? kr(kpi.salg.faktureretNettoOere - kpi.omkostning.ialtOere) : "Ikke tilstrækkelige data"} note="ikke likviditet eller årsresultat" />
    </KpiRaekke>
    <div className="ejer-overblik-grid">
      <Kort titel="Salg og kreditering"><Definition navn="faktureretNetto" /><Tabel raekker={[...kpi.salg.fakturaer.map((x) => ({ ...x, art: "Faktura", beloeb: x.totalEksklMomsOere ?? x.beloebOere })), ...kpi.salg.kreditter.map((x) => ({ ...x, art: "Kreditnota", beloeb: -Math.abs(x.totalEksklMomsOere ?? x.beloebOere) }))]} tom="Ingen dokumenter indgår i periodens nettoomsætning." kolonner={[{ label: "Dato", felt: "dato" }, { label: "Art", felt: "art" }, { label: "Nr.", render: (r) => r.nummer || r.guid }, { label: "Ekskl. moms", num: true, render: (r) => kr(r.beloeb) }]} /></Kort>
      <Kort titel="Alder på tilgodehavender"><Definition navn="restbeloeb" /><Tabel raekker={[{ gruppe: "Ikke forfalden", oere: alder.ikkeForfalden }, { gruppe: "1–30 dage", oere: alder.dage1_30 }, { gruppe: "31–60 dage", oere: alder.dage31_60 }, { gruppe: "61–90 dage", oere: alder.dage61_90 }, { gruppe: "Over 90 dage", oere: alder.over90 }, { gruppe: "Ukendt forfald", oere: alder.ukendt }]} kolonner={[{ label: "Alder", felt: "gruppe" }, { label: "Rest inkl. moms", num: true, render: (r) => kr(r.oere) }]} /></Kort>
    </div>
    <KpiRaekke>
      <KpiKort label="Aktive aftaler" vaerdi={kpi.abonnement.aktive} note={`aktuel månedsværdi ${kr(kpi.abonnement.introMaanedligOere)}`} til="/main/abonnementer" />
      <KpiKort label="Normal månedsværdi" vaerdi={kr(kpi.abonnement.maanedligOere)} note="engangsbeløb udeladt" til="/main/abonnementer" />
      <KpiKort label="Åben pipeline" vaerdi={kr(kpi.pipeline.aabenMaanedligOere)} note={`engang ${kr(kpi.pipeline.aabenEngangOere)}`} til="/main/salg/pipeline" />
      <KpiKort label="Vinderate" vaerdi={kpi.pipeline.vinderate == null ? "Ikke tilstrækkelige data" : `${Math.round(kpi.pipeline.vinderate * 100)} %`} note={`${kpi.pipeline.vundne} vundet af ${kpi.pipeline.afsluttede} afsluttede`} til="/main/salg/pipeline" />
      <KpiKort label="Forfaldne opgaver" vaerdi={kpi.opfoelgning.forfaldne} note={`${kpi.pipeline.udenNaeste} muligheder uden næste handling`} til="/main/salg/aktiviteter" />
    </KpiRaekke>
    <KpiRaekke>
      <KpiKort label="Afventer frigivelse" vaerdi={kpi.fakturaarbejde.afventerFrigivelse} note="indgår ikke i sendt salg" til="/main/oekonomi/fakturaer" />
      <KpiKort label="Afventer afsendelse" vaerdi={kpi.fakturaarbejde.afventerAfsendelse} note={`${kpi.fakturaarbejde.afsendelsesfejl} fejl/ukendte udfald`} til="/main/oekonomi/fakturaer" />
      <KpiKort label="Nye bilag" vaerdi={kpi.bilagsarbejde.nye} note={`${kpi.bilagsarbejde.ukendtBeloeb} med ukendt beløb`} til="/main/oekonomi/bilag" />
      <KpiKort label="Mulige dubletter" vaerdi={kpi.bilagsarbejde.muligeDubletter} note="kræver manuel afgørelse" til="/main/oekonomi/bilag" />
      <KpiKort label="Bogført uden bilag" vaerdi={kpi.bilagsarbejde.bogfoertUdenBilag} note="afstemningsopgaver" til="/main/oekonomi/omkostninger" />
    </KpiRaekke>
  </div>;
}
