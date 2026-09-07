import {
  beskrivMasseResultat,
  MAILFIL_ROLLE,
  MAKS_LOKAL_FILSTOERRELSE,
} from "../../fleet/fakturacenter-intake.js";

export function Sektionsnavigation({ sektioner, aktiv, antalFor, onSkift }) {
  return (
    <nav className="fic-tabs" aria-label="Fakturacentersektioner">
      {sektioner.map((fane) => (
        <button
          key={fane.id}
          type="button"
          className={aktiv === fane.id ? "fic-tab fic-tab-active" : "fic-tab"}
          aria-current={aktiv === fane.id ? "page" : undefined}
          onClick={() => onSkift(fane.id)}
        >
          {fane.label}<span>{antalFor(fane.id)}</span>
        </button>
      ))}
    </nav>
  );
}

const ARBEJDSPANELER = Object.freeze([
  { id: "liste", label: "Liste" },
  { id: "dokument", label: "Dokument" },
  { id: "behandling", label: "Behandling" },
]);

export function FakturacenterPanelnavigation({ aktivtPanel, onSkift }) {
  return (
    <nav className="fic-panel-switcher" aria-label="Vælg arbejdsområde">
      {ARBEJDSPANELER.map((panel) => (
        <button key={panel.id} type="button"
                aria-pressed={aktivtPanel === panel.id}
                onClick={() => onSkift(panel.id)}>
          {panel.label}
        </button>
      ))}
    </nav>
  );
}

export function SektionIntroduktion({ eyebrow, titel, tekst, note }) {
  return (
    <section className="fic-section-intro" aria-labelledby="fic-section-title">
      <div>
        <span className="fic-kicker">{eyebrow}</span>
        <h2 id="fic-section-title">{titel}</h2>
        <p>{tekst}</p>
      </div>
      {note && <p className="fic-section-note">{note}</p>}
    </section>
  );
}

export function Filmodtagelse({
  dropAktiv,
  onDropAktiv,
  onFiler,
  filer,
  inputRef,
}) {
  const håndtérInput = (event) => {
    onFiler(event.target.files);
    event.target.value = "";
  };
  return (
    <div className="fic-intake-primary">
      <div
        className={dropAktiv ? "fic-drop fic-drop-active" : "fic-drop"}
        onDragEnter={(event) => { event.preventDefault(); onDropAktiv(true); }}
        onDragOver={(event) => { event.preventDefault(); onDropAktiv(true); }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onDropAktiv(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDropAktiv(false);
          onFiler(event.dataTransfer.files);
        }}
      >
        <div className="fic-drop-icon" aria-hidden="true">⇧</div>
        <div>
          <b>Træk syntetiske fakturafiler hertil</b>
          <span>PDF · JPG/JPEG · PNG · XML · OIOUBL · maks. 25 MB pr. fil</span>
        </div>
        <button type="button" className="fic-primary fic-upload-button"
                onClick={() => inputRef.current?.click()}>
          Vælg lokale testfiler
        </button>
        <input ref={inputRef} type="file" multiple className="fic-sr"
               aria-label="Vælg lokale syntetiske fakturafiler"
               accept=".pdf,.jpg,.jpeg,.png,.xml,application/pdf,image/jpeg,image/png,application/xml,text/xml,application/oioubl+xml"
               onChange={håndtérInput} />
      </div>
      <details className="fic-local-disclosure">
        <summary>Om lokal filkontrol</summary>
        <p className="fic-local-note">
          Lokal prototypekontrol af filtype, browser-MIME, størrelse og SHA-256.
          Filen gemmes ikke permanent. Magic bytes, malware, karantæne og
          servervalidering er ikke implementeret. Brug aldrig rigtige fakturaer her.
        </p>
      </details>
      {filer.length > 0 && (
        <div className="fic-local-files" aria-live="polite" aria-label="Lokal filkontrol">
          {filer.map((fil, index) => (
            <div key={`${fil.filnavn}-${index}`}
                 className={fil.status === "klar-lokal-prototype"
                   ? "fic-local-file" : "fic-local-file fic-local-file-bad"}>
              <b>{fil.filnavn}</b>
              <span>{fil.visning}</span>
            </div>
          ))}
        </div>
      )}
      <span className="fic-sr">Maksimal filstørrelse {MAKS_LOKAL_FILSTOERRELSE} bytes</span>
    </div>
  );
}

export function KanalKort({ titel, mærke, tekst, fod }) {
  return (
    <article className="fic-channel" aria-disabled="true">
      <span className="fic-channel-badge">{mærke}</span>
      <h3>{titel}</h3>
      <p>{tekst}</p>
      <small>{fod}</small>
      <span className="fic-channel-disabled">Kommer i en senere etape</span>
    </article>
  );
}

export function MasseResultat({ resultater }) {
  if (!resultater.length) return null;
  return (
    <section className="fic-bulk-results" aria-live="polite" aria-label="Resultat af massekontrol">
      <h3>Massekontrol · resultat pr. faktura</h3>
      <ul>
        {resultater.map((resultat) => {
          const visning = beskrivMasseResultat(resultat);
          return (
            <li key={resultat.fakturaId}>
              <b>{resultat.fakturanummer || resultat.fakturaId}</b>
              <span className={resultat.ok ? "fic-result-ok" : "fic-result-rejected"}>
                {visning.status}
              </span>
              <small>{visning.forklaring}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function MailForbindelserPanel({ veyroMail, mailbox }) {
  return (
    <section className="fic-setup-grid" aria-label="Deaktiverede mailforbindelser">
      <KanalKort titel="Unik Veyro-fakturaadresse" mærke="Tilkøb · demo · ikke forbundet"
        tekst="Registrerede afsendere kan senere videresende til en tenant-routet adresse. Adressen er routing, ikke autentifikation."
        fod={veyroMail.ukendtAfsender === "karantaene"
          ? "Ukendt afsender: syntetisk karantænevalg" : "Ukendt afsender: syntetisk afvisningsvalg"} />
      <KanalKort titel="Kundens invoice-mail" mærke="Valgfri integration · deaktiveret"
        tekst="Kunden vælger senere mapper og godkender forbindelsen. Kun nye mails efter aktivering må behandles."
        fod={mailbox.ændrerMailbox ? "Mailboxændringer aktiveret"
          : "Read-only kontrakt · ændrer ikke mailbox"} />
      <article className="fic-setup-explainer">
        <span className="fic-channel-badge">Prototypekontrakt</span>
        <h3>Ingen aktiv mailmodtagelse</h3>
        <p>Der oprettes ingen forbindelse, og ingen mail sendes, læses, flyttes eller gemmes.
          Denne visning demonstrerer kun fremtidige opsætningsvalg.</p>
        <dl>
          <div><dt>Tenant-routing</dt><dd>Forberedt som valideret kontrakt</dd></div>
          <div><dt>Ukendte afsendere</dt><dd>Afvisning eller karantæne</dd></div>
          <div><dt>Mailboxadfærd</dt><dd>Read-only som standard</dd></div>
        </dl>
      </article>
    </section>
  );
}

export function ArkivPrototypePanel() {
  return (
    <section className="fic-archive-panel" aria-label="Arkivprototype">
      <div className="fic-archive-icon" aria-hidden="true">□</div>
      <div>
        <span className="fic-channel-badge">Kommende funktion</span>
        <h3>Struktureret genfinding og opbevaring</h3>
        <p>Arkivet skal senere samle kontrollerede fakturaer, original dokumentreference,
          match, fordeling og historik under kundens lovlige opbevaringsvalg.</p>
        <p><b>Permanent opbevaring er ikke implementeret.</b> Intet i denne lokale
          prototype er gemt eller kan genfindes efter genindlæsning.</p>
      </div>
    </section>
  );
}

const ROLLER = [MAILFIL_ROLLE.faktura, MAILFIL_ROLLE.bilag, MAILFIL_ROLLE.ignoreret];

export function MailbundlePanel({ bundle, kladder, onKlassificér, onOpdel }) {
  if (!bundle) return null;
  return (
    <section className="fic-mailbundle" aria-label="Lokal klassificering af mailfiler">
      <h3>Én syntetisk mailbundle</h3>
      <p>Veyro gætter ikke filernes rolle. Klassificér alle filer før lokale kladder oprettes.</p>
      <ul>
        {bundle.filer.map((fil) => (
          <li key={fil.filId}>
            <span>{fil.filnavn}</span>
            <label>
              <span className="fic-sr">Rolle for {fil.filnavn}</span>
              <select value={fil.rolle} onChange={(event) => onKlassificér(fil.filId, event.target.value)}>
                <option value={MAILFIL_ROLLE.uafklaret}>Vælg rolle</option>
                {ROLLER.map((rolle) => <option key={rolle} value={rolle}>{rolle}</option>)}
              </select>
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="fic-secondary" onClick={onOpdel}>
        Opret separate lokale kladder
      </button>
      {kladder?.length > 0 && (
        <p role="status">
          {kladder.length} lokal(e) kladde(r) oprettet med reference til {bundle.mailbundleId}.
        </p>
      )}
    </section>
  );
}
