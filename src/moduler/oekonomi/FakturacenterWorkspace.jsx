import { useState } from "react";
import {
  DUBLET_STATUS,
  effektivAflæsning,
  FAKTURAART,
  FAKTURAVINDUE,
  INDBAKKE_SEKTION,
  KONTROL_STATUS,
  MATCH_OPRINDELSE,
  validérFordeling,
} from "../../fleet/fakturacenter-intake.js";
import { MailbundlePanel } from "./FakturacenterPrototypeDele.jsx";

const STATUS_LABEL = {
  [INDBAKKE_SEKTION.indbakke]: "Ny i indbakken",
  [INDBAKKE_SEKTION.behandling]: "Kræver behandling",
  [INDBAKKE_SEKTION.match]: "Match og fordeling",
  [INDBAKKE_SEKTION.kontrol]: "Til kontrol",
  [INDBAKKE_SEKTION.kontrolleret]: "Kontrolleret",
  [INDBAKKE_SEKTION.arkiv]: "Arkiveret",
};

const MATCH_LABEL = {
  reference: "Eksakt reference",
  enhed: "Enhedsidentifikation",
  leverandoer: "Leverandørens åbne opgaver",
  manuel: "Manuel behandling",
};

const MATCH_OPRINDELSE_LABEL = {
  [MATCH_OPRINDELSE.automatisk]: "Automatisk placeret",
  [MATCH_OPRINDELSE.foreslaaet]: "Foreslået – kræver valg",
  [MATCH_OPRINDELSE.manuel]: "Manuelt valgt",
  [MATCH_OPRINDELSE.ikkePlaceret]: "Ikke placeret",
};

const ADVARSEL_LABEL = {
  "leverandoer-afviger": "Leverandøren afviger fra destinationen",
  "destination-lukket-for-faktura": "Destinationen er lukket for faktura",
  "manuel-fordeling-paakraevet": "Flere referencer kræver manuel fordeling",
  "manuel-placering-paakraevet": "Flere kandidater kræver et aktivt valg",
  "manuel-behandling-paakraevet": "Ingen sikker destination blev fundet",
};

function kroner(oere) {
  if (!Number.isSafeInteger(oere)) return "Ikke aflæst";
  return new Intl.NumberFormat("da-DK", {
    style: "currency", currency: "DKK", minimumFractionDigits: 2,
  }).format(oere / 100);
}

function datoTid(ms) {
  if (!Number.isSafeInteger(ms)) return "—";
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Copenhagen",
  }).format(ms);
}

function kortHash(hash) {
  return hash ? hash.slice(0, 8) + "…" : "—";
}

export default function FakturacenterWorkspace({
  scenarie,
  begrundelse,
  aktivtPanel,
  setBegrundelse,
  onVælgKandidat,
  onAccepterAdvarsler,
  onKontrollér,
  onGenåbn,
  onGenåbnDestination,
  onKlassificérMailfil,
  onOpdelMailbundle,
  onKørBlandetMasseEksempel,
}) {
  const [dokumentZoom, setDokumentZoom] = useState(100);
  const data = effektivAflæsning(scenarie.aflæsning);
  const fordeling = validérFordeling(
    scenarie.faktura.nettoOere,
    scenarie.faktura.fordelinger,
    scenarie.faktura.fakturaart,
  );
  const erUlæselig = !data.fakturanummer;
  const erLåst = scenarie.faktura.kontrolstatus === KONTROL_STATUS.kontrolleret;
  const harAdvarsler = scenarie.faktura.uløsteAdvarsler?.length > 0;

  return (
    <div className="fic-detail" data-active-panel={aktivtPanel}>
      <div className="fic-detail-head">
        <div>
          <span className="fic-kicker">Scenarie {scenarie.nummer} af 20</span>
          <h2>{scenarie.titel}</h2>
          <p>{scenarie.beskrivelse}</p>
        </div>
        <div className="fic-detail-badges">
          <StatusPill sektion={scenarie.sektion} />
          {erLåst && <span className="fic-lock">Låst</span>}
        </div>
      </div>

      <div className="fic-document-layout">
        <section className="fic-document-panel" role="region" tabIndex="0"
                 aria-label="Originaldokument · internt scrollområde">
          <div className="fic-subhead fic-document-toolbar">
            <div>
              <span className="fic-kicker">Originaldokument</span>
              <b>{scenarie.intake.original.filnavn}</b>
            </div>
            <div className="fic-document-tools" aria-label="Lokal dokumentzoom">
              <button type="button" aria-label="Zoom ud"
                      disabled={dokumentZoom === 80}
                      onClick={() => setDokumentZoom((zoom) => Math.max(80, zoom - 20))}>−</button>
              <output aria-live="polite">{dokumentZoom} %</output>
              <button type="button" aria-label="Zoom ind"
                      disabled={dokumentZoom === 120}
                      onClick={() => setDokumentZoom((zoom) => Math.min(120, zoom + 20))}>+</button>
            </div>
          </div>
          <div className="fic-paper-stage">
            <div className={erUlæselig ? "fic-paper fic-paper-unreadable" : "fic-paper"}
                 style={{ "--fic-document-zoom": dokumentZoom / 100 }}>
            <div className="fic-paper-brand">
              <span className="fic-paper-mark">V</span>
              <div>
                <b>{data.leverandoernavn || "Ulæseligt dokument"}</b>
                <small>{data.leverandoerCvr || "Ingen leverandør identificeret"}</small>
              </div>
            </div>
            {erUlæselig ? (
              <div className="fic-noise" aria-label="Syntetisk ulæseligt dokument">
                <i /><i /><i /><i /><i />
                <b>Automatisk aflæsning mislykkedes</b>
                <span>Originalen bevares til manuel behandling.</span>
              </div>
            ) : (
              <>
                <div className="fic-paper-title">FAKTURA</div>
                <div className="fic-paper-grid">
                  <span>Fakturanummer</span><b>{data.fakturanummer}</b>
                  <span>Fakturadato</span><b>{data.fakturadato}</b>
                  <span>Forfaldsdato</span><b>{data.forfaldsdato}</b>
                  <span>Reference</span><b>{data.ordreOpgaveNumre?.join(", ") || "—"}</b>
                </div>
                <div className="fic-paper-lines">
                  <span>Beskrivelse</span><span>Netto</span>
                  <b>Syntetiske fakturalinjer</b><b>{kroner(data.nettoOere)}</b>
                </div>
                <div className="fic-paper-total">
                  <span>Netto</span><b>{kroner(data.nettoOere)}</b>
                  <span>Moms</span><b>{kroner(data.momsOere)}</b>
                  <span>I alt</span><strong>{kroner(data.totalOere)}</strong>
                </div>
              </>
            )}
            </div>
          </div>
          <dl className="fic-file-meta">
            <div><dt>Kilde</dt><dd>{scenarie.intake.kilde}</dd></div>
            <div><dt>Type</dt><dd>{scenarie.intake.dokumenttype}</dd></div>
            <div><dt>SHA-256</dt><dd>{kortHash(scenarie.intake.original.sha256)}</dd></div>
            <div><dt>Modtaget</dt><dd>{datoTid(scenarie.intake.modtagetMs)}</dd></div>
          </dl>
        </section>

        <section className="fic-review-panel" role="region" tabIndex="0"
                 aria-label="Behandling · internt scrollområde">
          <InfoSektion nummer="1" titel="Aflæste oplysninger"
                       status={erUlæselig ? "Manuel behandling" : "Syntetisk aflæst"}>
            <div className="fic-field-grid">
              <Felt label="Leverandør" værdi={data.leverandoernavn} />
              <Felt label="CVR" værdi={data.leverandoerCvr} />
              <Felt label="Fakturanummer" værdi={data.fakturanummer} />
              {data.fakturaart === FAKTURAART.kreditnota && (
                <Felt label="Kreditnota for faktura" værdi={data.kreditForFakturanummer} />
              )}
              <Felt label="Valuta / land" værdi={(data.valuta || "—") + " / " + (data.land || "—")} />
              <Felt label="Nettobeløb" værdi={kroner(data.nettoOere)} />
              <Felt label="Moms" værdi={kroner(data.momsOere)} />
              <Felt label="Samlet beløb" værdi={kroner(data.totalOere)} />
              <Felt label="Enhed / aktiv" værdi={[
                ...(data.enhedsnumre || []),
                ...(data.registreringsnumre || []),
                ...(data.stelSerieNumre || []),
              ].join(", ") || "—"} />
            </div>
            <p className="fic-origin-note">
              Den oprindelige aflæsning bevares. Rettelser tilføjes med bruger,
              tidspunkt og ændringshistorik.
            </p>
          </InfoSektion>

          <InfoSektion nummer="2" titel="Match" status={MATCH_LABEL[scenarie.match.trin] || "Manuel"}>
            <div className="fic-match-reason">
              <b>{scenarie.match.årsag.replaceAll("-", " ")}</b>
              <strong>{MATCH_OPRINDELSE_LABEL[scenarie.match.oprindelse
                || scenarie.faktura.matchOprindelse] || "Ikke placeret"}</strong>
              <span>Beløb bruges kun til rangering og statistik, aldrig som blokering.</span>
            </div>
            {scenarie.match.fundetEnhed && (
              <div className="fic-found-unit">
                <span>Fundet enhed</span>
                <b>{scenarie.match.fundetEnhed.navn}</b>
                <small>{scenarie.match.fundetEnhed.interntNummer}</small>
              </div>
            )}
            {scenarie.match.kandidater.length > 0 ? (
              <div className="fic-candidates" role="listbox" aria-label="Matchkandidater">
                {scenarie.match.kandidater.map((kandidat) => {
                  const valgt = scenarie.match.placering?.destinationId === kandidat.destinationId;
                  return (
                    <article key={kandidat.modul + kandidat.destinationId} role="option"
                             aria-selected={valgt}
                             className={valgt ? "fic-candidate fic-candidate-selected" : "fic-candidate"}>
                      <span className={"fic-module fic-module-" + kandidat.modul.toLowerCase()}>
                        {kandidat.modul}
                      </span>
                      <div>
                        <b>{kandidat.navn}</b>
                        <span>{kandidat.enhed?.navn || kandidat.lokation || "Ingen enhed"}
                          {" · "}{kandidat.fakturastatus.replaceAll("-", " ")}</span>
                        <small>{kandidat.leverandoer.navn || "Leverandør ikke angivet"}
                          {" · "}{kandidat.referencer.join(", ")}</small>
                        <small>Estimat (neutral statistik): {kroner(kandidat.forventetNettoOere)}</small>
                      </div>
                      {valgt ? (
                        <span className="fic-selected-mark">
                          {MATCH_OPRINDELSE_LABEL[scenarie.match.oprindelse] || "Placeret"}
                        </span>
                      ) : kandidat.fakturastatus === FAKTURAVINDUE.lukket ? (
                        <button type="button" className="fic-link-button"
                                onClick={() => onGenåbnDestination(kandidat)}>
                          Genåbn med begrundelse
                        </button>
                      ) : (
                        <button type="button" className="fic-link-button"
                                onClick={() => onVælgKandidat(kandidat)}>Vælg manuelt</button>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="fic-empty-inline">Ingen sikker kandidat. Dokumentet bevares til manuel behandling.</p>
            )}
          </InfoSektion>

          <MailbundlePanel bundle={scenarie.mailbundle} kladder={scenarie.mailKladder}
                           onKlassificér={onKlassificérMailfil} onOpdel={onOpdelMailbundle} />

          <InfoSektion nummer="3" titel="Fordeling"
                       status={fordeling.ok ? "Hele nettobeløbet fordelt" : "Ufuldstændig"}>
            <div className="fic-allocation-bar" aria-label={fordeling.ok ? "100 procent fordelt" : "Ufuldstændig fordeling"}>
              <span style={{ width: fordeling.ok ? "100%" : "42%" }} />
            </div>
            <div className="fic-allocations">
              {scenarie.faktura.fordelinger?.map((post) => (
                <div key={post.fordelingId}>
                  <span><i className={"fic-module-dot fic-module-" + post.modul.toLowerCase()} />
                    {post.modul} · {post.destinationId}</span>
                  <b>{kroner(post.nettoOere)}</b>
                </div>
              ))}
              {!scenarie.faktura.fordelinger?.length && <p className="fic-empty-inline">Ingen fordeling endnu.</p>}
            </div>
            <div className="fic-allocation-total">
              <span>Fordelt netto</span>
              <b>{kroner(fordeling.fordeltOere)} / {kroner(scenarie.faktura.nettoOere)}</b>
            </div>
          </InfoSektion>

          <InfoSektion nummer="4" titel="Kontrol"
                       status={erLåst ? "Kontrolleret og låst" : "Afventer handling"}>
            {scenarie.faktura.dubletstatus === DUBLET_STATUS.mistænkt && (
              <Advarsel tekst="Mistænkt dublet er sat på hold. Ingen filer slettes eller sammenlægges." />
            )}
            {harAdvarsler && (
              <>
                {scenarie.faktura.uløsteAdvarsler.map((advarsel) => (
                  <Advarsel key={advarsel} tekst={ADVARSEL_LABEL[advarsel] || advarsel} />
                ))}
                <label className="fic-reason">
                  <span>Obligatorisk begrundelse ved accept eller genåbning</span>
                  <textarea value={begrundelse} onChange={(event) => setBegrundelse(event.target.value)}
                            placeholder="Skriv en syntetisk begrundelse…" />
                </label>
                {scenarie.faktura.uløsteAdvarsler.every((advarsel) =>
                  advarsel !== "destination-lukket-for-faktura") && (
                  <button type="button" className="fic-secondary" onClick={onAccepterAdvarsler}>
                    Acceptér forretningsadvarsel i demo
                  </button>
                )}
              </>
            )}
            {!erLåst && !harAdvarsler && (
              <button type="button" className="fic-primary fic-control-button" onClick={onKontrollér}>
                Markér som kontrolleret
              </button>
            )}
            {erLåst && (
              <>
                <p className="fic-lock-copy">Oplysninger og fordeling er låst. Den fordelte nettodel tæller
                  nu i den syntetiske omkostningsstatistik.</p>
                <label className="fic-reason">
                  <span>Begrundelse for genåbning</span>
                  <textarea value={begrundelse} onChange={(event) => setBegrundelse(event.target.value)}
                            placeholder="Skriv en syntetisk begrundelse…" />
                </label>
                <button type="button" className="fic-secondary" onClick={onGenåbn}>Genåbn i demo</button>
              </>
            )}
            {scenarie.masseEksempel && (
              <button type="button" className="fic-secondary fic-demo-example-button"
                      onClick={onKørBlandetMasseEksempel}>Kør blandet massekontrol-eksempel</button>
            )}
          </InfoSektion>

          <details className="fic-history" open={scenarie.nummer === 19}>
            <summary>Historik <span>{scenarie.faktura.historik?.length || 0}</span></summary>
            {scenarie.faktura.historik?.length ? (
              <ol>{scenarie.faktura.historik.map((post, index) => (
                <li key={post.handling + index}>
                  <b>{post.handling.replaceAll("-", " ")}</b>
                  <span>{post.brugerId} · {datoTid(post.tidspunktMs)}</span>
                  {post.begrundelse && <small>{post.begrundelse}</small>}
                </li>
              ))}</ol>
            ) : <p>Ingen lokale demohændelser endnu.</p>}
          </details>
        </section>
      </div>
    </div>
  );
}

function InfoSektion({ nummer, titel, status, children }) {
  return (
    <section className="fic-info-section">
      <header><span className="fic-step">{nummer}</span><div><h3>{titel}</h3><small>{status}</small></div></header>
      <div className="fic-info-body">{children}</div>
    </section>
  );
}

function Felt({ label, værdi }) {
  return <div className="fic-field"><span>{label}</span><b>{værdi || "—"}</b></div>;
}

function StatusPill({ sektion }) {
  return <span className={"fic-status fic-status-" + sektion}>{STATUS_LABEL[sektion]}</span>;
}

function Advarsel({ tekst }) {
  return <div className="fic-warning"><span aria-hidden="true">!</span><p>{tekst}</p></div>;
}
