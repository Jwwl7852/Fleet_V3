import { useEffect, useMemo, useState } from "react";
import { kr } from "../../fleet/format.js";
import { reserveretKredit } from "../../fleet/ejer-kreditnota-regler.js";
import { Henter, Knap, Kort, Pille, Tabel, Tom } from "../../fleet/ui.jsx";
import {
  annullerKreditnota, frigivKreditnota, genererKreditnotadokument,
  hentEjerKreditnotaer, hentKreditnotadokument, koerKreditnotajob,
  opretKreditnota, synkroniserDinero,
} from "../../fleet/ejer-kreditnotaer.js";

const datoTid = (ms) => ms ? new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(ms) : "Aldrig";
const tone = (status) => ["sendt", "dokumenteret_sendt", "betalt", "ajour"].includes(status) ? "ok"
  : ["fejl", "ukendt_udfald", "handling_pakraevet"].includes(status) ? "bad"
    : ["ikke_tilsluttet", "anmodet", "delvist_betalt"].includes(status) ? "warn" : "info";
const jobId = (post) => `kreditjob_${post.id}`;

export default function EjerKreditnotaer() {
  const [data, setData] = useState(null);
  const [fejl, setFejl] = useState(null);
  const [valgtFaktura, setValgtFaktura] = useState(null);
  const [valgtKredit, setValgtKredit] = useState(null);
  const [valg, setValg] = useState({});
  const [aarsag, setAarsag] = useState("");
  const [arbejder, setArbejder] = useState(false);
  const [svar, setSvar] = useState(null);

  const hent = async () => {
    try { setData(await hentEjerKreditnotaer()); setFejl(null); }
    catch (error) { setFejl(error); setData({ grundlag: {}, fakturajobs: {}, kreditnotaer: {}, kreditjobs: {}, dinero: {} }); }
  };
  useEffect(() => { hent(); }, []);

  const fakturaer = useMemo(() => Object.entries(data?.fakturajobs || {}).filter(([, job]) =>
    ["sendt", "bogfoert"].includes(job.status) || ["sendt", "bogfoert"].includes(job.eksternStatus))
    .map(([id, job]) => ({
      id, job, grundlag: data?.grundlag?.[job.periode]?.[job.tenantId]?.frigivelse,
      kreditter: data?.kreditnotaer?.[id]?.poster || {},
    })).filter((post) => post.grundlag)
    .sort((a, b) => String(b.job.periode).localeCompare(String(a.job.periode))), [data]);
  const faktura = fakturaer.find((post) => post.id === valgtFaktura) || fakturaer[0] || null;
  const kreditter = Object.values(faktura?.kreditter || {}).sort((a, b) => (b.oprettetMs || 0) - (a.oprettetMs || 0));
  const kredit = kreditter.find((post) => post.id === valgtKredit) || kreditter[0] || null;
  const reservation = reserveretKredit(faktura?.kreditter);
  const eksternImport = Object.values(data?.dinero?.dokumenter?.faktura || {}).filter((d) =>
    !Object.values(data?.fakturajobs || {}).some((job) => job.eksternReference === d.guid));

  useEffect(() => { setValg({}); setValgtKredit(null); }, [faktura?.id]);

  const kald = async (fn, succes) => {
    setArbejder(true); setSvar(null);
    const resultat = await fn();
    setArbejder(false); setSvar({ ok: resultat.ok, besked: resultat.ok ? succes : resultat.besked });
    await hent(); return resultat;
  };
  const opret = () => kald(() => opretKreditnota({
    fakturaId: faktura.id, operationId: crypto.randomUUID(), aarsag,
    valg: Object.entries(valg).filter(([, v]) => v.valgt).map(([indeks, v]) => ({
      kildeIndeks: Number(indeks), antal: Math.round(Number(v.antal) * 1000),
    })),
  }), "Kreditkladden er oprettet og beløbet reserveret.");
  const frigiv = () => kald(() => frigivKreditnota({
    fakturaId: faktura.id, kreditId: kredit.id, forventetRevision: kredit.revision || 0,
    sendEfterFrigivelse: true, operationId: crypto.randomUUID(),
  }), "Kreditversionen er frigivet og lagt én gang i kø.");
  const annuller = () => kald(() => annullerKreditnota({
    fakturaId: faktura.id, kreditId: kredit.id, forventetRevision: kredit.revision || 0,
  }), "Kladden er annulleret, og reservationen er frigivet.");
  const dokument = () => kald(() => genererKreditnotadokument({ fakturaId: faktura.id, kreditId: kredit.id }), "PDF'en er dannet fra den frigivne kreditversion.");
  const download = async () => {
    setArbejder(true); const resultat = await hentKreditnotadokument({ fakturaId: faktura.id, kreditId: kredit.id }); setArbejder(false);
    if (resultat.ok) window.location.assign(resultat.data.url); else setSvar({ ok: false, besked: resultat.besked });
  };
  const koer = () => kald(() => koerKreditnotajob({ fakturaId: faktura.id, kreditId: kredit.id, operationId: crypto.randomUUID() }), "Kreditkøen er behandlet af den konfigurerede adapter.");
  const synk = () => kald(() => synkroniserDinero(), "Dineros returdata er hentet og afstemt.");

  if (!data) return <Henter hvad="fakturaer, kreditreservationer og Dinero-status" />;
  const integrationAktiv = data.integration?.status === "aktiv";
  return <div className="fc-grid" style={{ gap: 16 }}>
    {fejl && <div className="fc-empty fc-empty-bad"><b>Læsningen blev afvist.</b><p>{String(fejl.message || fejl)}</p></div>}
    <Kort titel="Bogførte fakturaer" handling={<div className="fc-row">
      <Pille tone={integrationAktiv ? "ok" : "warn"}>Dinero: {integrationAktiv ? data.integration.adapter : "ikke tilsluttet"}</Pille>
      <Knap disabled={arbejder || !integrationAktiv} onClick={synk}>Opdatér fra Dinero</Knap>
    </div>}>
      <p className="fc-hint">Kladder reserverer beløbet med det samme. En ukendt ekstern status frigiver aldrig reservationen automatisk.</p>
      <Tabel noegle={(r) => r.id} paaRaekke={(r) => setValgtFaktura(r.id)} erValgt={(r) => r.id === faktura?.id}
        raekker={fakturaer} tom="Der er ingen bogførte Veyro-fakturaer med verificerbart linjesnapshot."
        kolonner={[
          { key: "periode", label: "Periode", render: (r) => r.job.periode },
          { key: "kunde", label: "Kunde", render: (r) => <><b>{r.grundlag.modtager?.navn || r.job.tenantId}</b><div className="fc-hint">{r.job.dineroNummer || r.job.eksternReference}</div></> },
          { key: "betaling", label: "Betaling", render: (r) => <Pille tone={tone(r.job.betalingStatus)}>{String(r.job.betalingStatus || "ukendt").replaceAll("_", " ")}</Pille> },
          { key: "original", label: "Original", num: true, render: (r) => kr(r.grundlag.ialtOere) },
          { key: "reserveret", label: "Krediteret/reserveret", num: true, render: (r) => kr(reserveretKredit(r.kreditter).ialtOere) },
          { key: "rest", label: "Kan krediteres", num: true, render: (r) => kr(r.grundlag.ialtOere - reserveretKredit(r.kreditter).ialtOere) },
        ]} />
    </Kort>

    {faktura ? <>
      <Kort titel={`Ny kredit · ${faktura.grundlag.modtager?.navn || faktura.job.tenantId}`}>
        <div className="fc-form-grid">
          {faktura.grundlag.linjer.map((linje, indeks) => {
            const tilbage = Math.max(0, linje.antal - (reservation.perLinje[indeks] || 0));
            const aktuel = valg[indeks] || { valgt: false, antal: tilbage / 1000 };
            return <label key={linje.kildeNoegle || indeks} className="fc-field">
              <span><input type="checkbox" checked={aktuel.valgt} disabled={!tilbage} onChange={(e) => setValg((v) => ({ ...v, [indeks]: { ...aktuel, valgt: e.target.checked } }))} /> {linje.navn || linje.modulId || `Linje ${indeks + 1}`}</span>
              <span className="fc-hint">Maks. {tilbage / 1000} · {kr(linje.satsOere)} pr. {linje.enhed || "enhed"}</span>
              <input aria-label={`Antal for ${linje.navn || `linje ${indeks + 1}`}`} type="number" min="0.001" max={tilbage / 1000} step="0.001" value={aktuel.antal}
                onChange={(e) => setValg((v) => ({ ...v, [indeks]: { ...aktuel, antal: e.target.value } }))} />
            </label>;
          })}
          <label className="fc-field"><span>Årsag</span><textarea rows="3" maxLength="500" value={aarsag} onChange={(e) => setAarsag(e.target.value)} placeholder="Beskriv den forretningsmæssige årsag" /></label>
        </div>
        <div className="fc-formular-knapper"><Knap variant="primaer" disabled={arbejder || !aarsag.trim() || !Object.values(valg).some((v) => v.valgt)} onClick={opret}>Opret kreditkladde</Knap></div>
      </Kort>

      <Kort titel="Kreditnotaer">
        <Tabel noegle={(r) => r.id} paaRaekke={(r) => setValgtKredit(r.id)} erValgt={(r) => r.id === kredit?.id}
          raekker={kreditter} tom="Der er endnu ingen kreditnotaer på fakturaen."
          kolonner={[
            { key: "id", label: "Kredit", render: (r) => <><b>{data.kreditjobs?.[jobId(r)]?.dineroNummer || r.id}</b><div className="fc-hint">{r.snapshot?.aarsag}</div></> },
            { key: "status", label: "Dokument", render: (r) => <Pille tone={tone(r.status)}>{String(r.status).replaceAll("_", " ")}</Pille> },
            { key: "send", label: "Afsendelse", render: (r) => <Pille tone={tone(data.kreditjobs?.[jobId(r)]?.sendStatus || r.sendStatus)}>{String(data.kreditjobs?.[jobId(r)]?.sendStatus || r.sendStatus || "ikke køsat").replaceAll("_", " ")}</Pille> },
            { key: "afregning", label: "Afregning", render: (r) => <Pille tone={tone(data.kreditjobs?.[jobId(r)]?.afregningsStatus)}>{String(data.kreditjobs?.[jobId(r)]?.afregningsStatus || "ikke afstemt").replaceAll("_", " ")}</Pille> },
            { key: "ialt", label: "Kredit", num: true, render: (r) => kr(r.ialtOere) },
          ]} />
        {kredit && <div className="fc-grid" style={{ gap: 10, marginTop: 14 }}>
          {["betalt", "delvist_betalt"].includes(faktura.job.betalingStatus) && <div className="fc-empty fc-empty-warn"><b>Tilbagebetaling/udligning kræver handling.</b><p>Kreditnotaen markerer ikke automatisk en banktilbagebetaling som udført. Afstemningsstatus: {data.kreditjobs?.[jobId(kredit)]?.afregningsStatus || "ikke afstemt"}.</p></div>}
          <div className="fc-formular-knapper">
            {kredit.status === "kladde" && <><Knap variant="primaer" disabled={arbejder} onClick={frigiv}>Frigiv og send via Dinero</Knap><Knap disabled={arbejder} onClick={annuller}>Annullér kladde</Knap></>}
            {kredit.frigivelse && !kredit.dokument && <Knap disabled={arbejder} onClick={dokument}>Dan PDF</Knap>}
            {kredit.dokument && <Knap disabled={arbejder} onClick={download}>Hent PDF</Knap>}
            {data.kreditjobs?.[jobId(kredit)] && !["sendt", "ukendt_udfald"].includes(data.kreditjobs[jobId(kredit)].status) && <Knap disabled={arbejder} onClick={koer}>Behandl køpost</Knap>}
          </div>
        </div>}
      </Kort>
    </> : <Tom>Vælg en bogført faktura.</Tom>}

    {eksternImport.length > 0 && <Kort titel="Fakturaer fundet direkte i Dinero">
      <p className="fc-hint">De er importeret med oprindelse, men kan ikke krediteres i Veyro uden et verificerbart historisk linjesnapshot.</p>
      <Tabel noegle={(r) => r.guid} raekker={eksternImport} kolonner={[
        { key: "nummer", label: "Nummer" }, { key: "dato", label: "Dato" },
        { key: "status", label: "Status" }, { key: "origin", label: "Oprindelse", render: () => "Dinero" },
        { key: "total", label: "I alt", num: true, render: (r) => kr(r.totalInklMomsOere) },
      ]} />
    </Kort>}
    <p className="fc-hint">Seneste retursynk: {datoTid(data.dinero?.synk?.status?.samlet?.senesteSuccesMs)}. Seneste forsøg: {datoTid(data.dinero?.synk?.status?.samlet?.senesteForsoegMs)}. Manglende synkronisering fortolkes aldrig som nul.</p>
    {svar && <div className={`fc-empty ${svar.ok ? "" : "fc-empty-bad"}`}><p>{svar.besked}</p></div>}
  </div>;
}

