import { useEffect, useMemo, useState } from "react";
import { kr } from "../../fleet/format.js";
import { Henter, Knap, Kort, Pille, Tabel, Tom } from "../../fleet/ui.jsx";
import {
  fakturastatus, frigivFakturagrundlag, genererFakturagrundlagsdokumenter,
  hentEjerFakturering, hentFakturagrundlagsdokument, koerFakturajob,
} from "../../fleet/ejer-fakturering.js";
import { useEjerData } from "./EjerDataContext.jsx";

const jobId = (periode, tenantId) => `faktura_${periode.replace("-", "")}_${tenantId}`;
const datoTid = (ms) => ms ? new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(ms) : "—";
const tone = (status) => status === "sendt" || status === "frigivet" ? "ok"
  : status === "fejl" || status === "ukendt_udfald" || status === "handling_pakraevet" ? "bad"
    : status === "ikke_tilsluttet" ? "warn" : "info";

export default function EjerFakturaer() {
  const { crm } = useEjerData();
  const [data, setData] = useState(null);
  const [fejl, setFejl] = useState(null);
  const [valgt, setValgt] = useState(null);
  const [arbejder, setArbejder] = useState(false);
  const [svar, setSvar] = useState(null);

  const hent = async () => {
    try { setData(await hentEjerFakturering()); setFejl(null); }
    catch (e) { setFejl(e); setData({ grundlag: {}, jobs: {}, integration: null }); }
  };
  useEffect(() => { hent(); }, []);

  const raekker = useMemo(() => Object.entries(data?.grundlag || {}).flatMap(([periode, kunder]) =>
    Object.entries(kunder || {}).map(([tenantId, grundlag]) => {
      const job = data?.jobs?.[jobId(periode, tenantId)] || null;
      const firma = Object.values(crm || {}).find((v) => v?.stamdata?.tenantId === tenantId)?.stamdata;
      return { periode, tenantId, grundlag, job, navn: grundlag.frigivelse?.modtager?.navn || firma?.navn || tenantId };
    })).sort((a, b) => b.periode.localeCompare(a.periode) || a.navn.localeCompare(b.navn, "da")), [data, crm]);
  const aktuel = raekker.find((r) => `${r.periode}/${r.tenantId}` === valgt) || raekker[0] || null;

  const kald = async (fn, succes) => {
    setArbejder(true); setSvar(null);
    const r = await fn();
    setArbejder(false);
    setSvar(r.ok ? { ok: true, besked: succes } : { ok: false, besked: r.besked || "Handlingen kunne ikke gennemføres." });
    await hent();
    return r;
  };
  const frigiv = (sendEfterFrigivelse) => kald(() => frigivFakturagrundlag({
    periode: aktuel.periode, tenantId: aktuel.tenantId,
    forventetRevision: aktuel.grundlag.revision || 0,
    sendEfterFrigivelse, operationId: crypto.randomUUID(),
  }), sendEfterFrigivelse ? "Grundlaget er frigivet og lagt én gang i kø." : "Grundlaget er frigivet uden afsendelse.");
  const dokumenter = () => kald(() => genererFakturagrundlagsdokumenter({
    periode: aktuel.periode, tenantId: aktuel.tenantId,
  }), "PDF og CSV er dannet af den frigivne version.");
  const download = async (art) => {
    setArbejder(true);
    const r = await hentFakturagrundlagsdokument({ periode: aktuel.periode, tenantId: aktuel.tenantId, art });
    setArbejder(false);
    if (r.ok) window.location.assign(r.data.url);
    else setSvar({ ok: false, besked: r.besked });
  };
  const koer = () => kald(() => koerFakturajob({
    periode: aktuel.periode, tenantId: aktuel.tenantId, operationId: crypto.randomUUID(),
  }), "Køposten er behandlet af den konfigurerede adapter.");

  if (!data) return <Henter hvad="fakturagrundlag og køstatus" />;
  return <div className="fc-grid" style={{ gap: 16 }}>
    {fejl && <div className="fc-empty fc-empty-bad"><b>Læsningen blev afvist.</b><p>{String(fejl.message || fejl)}</p></div>}
    <Kort titel="Faktureringskø" handling={<Pille tone={data.integration?.status === "aktiv" ? "ok" : "warn"}>
      Dinero: {data.integration?.status === "aktiv" ? data.integration.adapter : "ikke tilsluttet"}
    </Pille>}>
      <p className="fc-hint">Dokument, afsendelse og betaling har hver sin status. “Frigivet” betyder ikke, at en faktura findes i Dinero.</p>
      <Tabel noegle={(r) => `${r.periode}/${r.tenantId}`} paaRaekke={(r) => setValgt(`${r.periode}/${r.tenantId}`)}
        erValgt={(r) => aktuel?.periode === r.periode && aktuel?.tenantId === r.tenantId}
        raekker={raekker} tom="Der er endnu ingen frosne fakturagrundlag."
        kolonner={[
          { key: "periode", label: "Periode" },
          { key: "kunde", label: "Kunde", render: (r) => <><b>{r.navn}</b><div className="fc-hint">{r.tenantId}</div></> },
          { key: "dokument", label: "Dokument", render: (r) => { const s = fakturastatus(r.grundlag, r.job).dokument; return <Pille tone={tone(s)}>{s}</Pille>; } },
          { key: "send", label: "Afsendelse", render: (r) => { const s = fakturastatus(r.grundlag, r.job).afsendelse; return <Pille tone={tone(s)}>{s.replaceAll("_", " ")}</Pille>; } },
          { key: "betaling", label: "Betaling", render: (r) => { const s = fakturastatus(r.grundlag, r.job).betaling; return <Pille tone={tone(s)}>{s.replaceAll("_", " ")}</Pille>; } },
          { key: "ialt", label: "I alt", num: true, render: (r) => kr(r.grundlag.ialtOere) },
        ]} />
    </Kort>

    {aktuel ? <Kort titel={`${aktuel.navn} · ${aktuel.periode}`}>
      <div className="fc-grid" style={{ gap: 12 }}>
        <div className="fc-form-grid">
          <div><span className="fc-hint">Forretningsnøgle</span><div><code>{aktuel.grundlag.forretningsnoegle || `faktura:${aktuel.periode}:${aktuel.tenantId}:ordinaer`}</code></div></div>
          <div><span className="fc-hint">Pris-/aftalekilde</span><div>{aktuel.grundlag.prislisteId || "—"} · {aktuel.grundlag.aftaleId || "ingen aftalereference"}</div></div>
          <div><span className="fc-hint">Modtager</span><div>{aktuel.grundlag.frigivelse?.modtager?.email || "valideres ved frigivelse"}</div></div>
          <div><span className="fc-hint">Frigivet</span><div>{datoTid(aktuel.grundlag.frigivelse?.frigivetMs)}</div></div>
        </div>
        <Tabel noegle={(l, i) => `${l.modul || l.akse || "linje"}-${i}`} raekker={aktuel.grundlag.linjer || []} tom="Ingen linjer."
          kolonner={[
            { key: "linje", label: "Linje", render: (l) => l.navn || [l.modul, l.akse, l.brugerart].filter(Boolean).join(" · ") },
            { key: "antal", label: "Antal", num: true, render: (l) => (Number(l.antal || 0) / 1000).toLocaleString("da-DK") },
            { key: "sats", label: "Sats", num: true, render: (l) => kr(l.satsOere) },
            { key: "beloeb", label: "Beløb", num: true, render: (l) => kr(Math.round((l.antal || 0) * (l.satsOere || 0) / 1000)) },
          ]} />
        <div className="fc-formular-knapper">
          {!aktuel.grundlag.frigivelse && <>
            <Knap disabled={arbejder} onClick={() => frigiv(false)}>Frigiv uden afsendelse</Knap>
            <Knap variant="primaer" disabled={arbejder} onClick={() => frigiv(true)}>Frigiv og læg i kø</Knap>
          </>}
          {aktuel.grundlag.frigivelse && !aktuel.job && <Knap variant="primaer" disabled={arbejder} onClick={() => frigiv(true)}>Læg frigivet version i kø</Knap>}
          {aktuel.grundlag.frigivelse && !(aktuel.grundlag.dokumenter?.pdf && aktuel.grundlag.dokumenter?.csv)
            && <Knap disabled={arbejder} onClick={dokumenter}>Dan PDF og CSV</Knap>}
          {aktuel.grundlag.dokumenter?.pdf && <Knap disabled={arbejder} onClick={() => download("pdf")}>Hent PDF</Knap>}
          {aktuel.grundlag.dokumenter?.csv && <Knap disabled={arbejder} onClick={() => download("csv")}>Hent CSV</Knap>}
          {aktuel.job && !["sendt", "ukendt_udfald"].includes(aktuel.job.status)
            && <Knap disabled={arbejder} onClick={koer}>Behandl køpost</Knap>}
        </div>
        {aktuel.job?.eksternReference && <p className="fc-hint">Ekstern reference: <code>{aktuel.job.eksternReference}</code>. Status: {aktuel.job.eksternStatus || aktuel.job.status}.</p>}
        {svar && <div className={`fc-empty ${svar.ok ? "" : "fc-empty-bad"}`}><p>{svar.besked}</p></div>}
      </div>
    </Kort> : <Tom>Vælg et fakturagrundlag.</Tom>}
  </div>;
}
