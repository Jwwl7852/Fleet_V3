import { useEffect, useState } from "react";
import {
  gemEjerleverandoer,
  hentEjerleverandoerer,
} from "../../fleet/ejer-leverandoerer.js";
import EjerIkon from "./EjerIkon.jsx";
import { Dialog } from "../../fleet/ui.jsx";

export default function EjerLeverandoerer() {
  const tom = {
    id: "",
    navn: "",
    kategori: "",
    kontakt: "",
    status: "aktiv",
    aftaleTil: "",
    noter: "",
    revision: 0,
  };
  const dato = (vaerdi) =>
    vaerdi
      ? new Date(`${vaerdi}T12:00:00`).toLocaleDateString("da-DK")
      : "Ingen slutdato";
  const tidspunkt = (ms) =>
    ms
      ? new Date(ms).toLocaleString("da-DK", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "Ikke registreret";
  const [resultat, setResultat] = useState(null);
  const [formular, setFormular] = useState(null);
  const [arbejder, setArbejder] = useState(false);
  const [besked, setBesked] = useState("");
  const [valgtId, setValgtId] = useState("");
  const [bekraeftGem, setBekraeftGem] = useState(false);
  const hent = () => hentEjerleverandoerer().then(setResultat);
  useEffect(() => {
    hent();
  }, []);
  if (!resultat)
    return <div className="fc-empty">Henter Veyros leverandører…</div>;
  if (!resultat.ok)
    return <div className="fc-empty fc-empty-bad">{resultat.besked}</div>;
  const poster = Object.values(resultat.data?.poster || {});
  const valgt = poster.find((p) => p.id === valgtId) || poster[0];
  const oprindelig = formular?.id
    ? poster.find((post) => post.id === formular.id)
    : tom;
  const aendringer = formular
    ? [
        ["navn", "Navn"],
        ["kategori", "Kategori"],
        ["kontakt", "Kontaktmail"],
        ["aftaleTil", "Aftale til"],
        ["status", "Status"],
        ["noter", "Interne noter"],
      ]
        .filter(
          ([felt]) =>
            String(oprindelig?.[felt] || "") !== String(formular?.[felt] || ""),
        )
        .map(([felt, label]) => ({
          label,
          foer: oprindelig?.[felt] || "Ikke angivet",
          efter: formular?.[felt] || "Ikke angivet",
        }))
    : [];
  const gem = async () => {
    if (!aendringer.length) return;
    setArbejder(true);
    setBesked("");
    const svar = await gemEjerleverandoer({
      ...formular,
      id: formular.id || undefined,
      forventetRevision: formular.revision || 0,
    });
    setArbejder(false);
    setBesked(
      svar.ok
        ? "Leverandøren er gemt."
        : svar.besked || "Leverandøren kunne ikke gemmes.",
    );
    if (svar.ok) {
      setFormular(null);
      setBekraeftGem(false);
      setValgtId(svar.data?.id || valgtId);
      await hent();
    }
  };
  return (
    <div className="fc-grid">
      <p className="ejer-infoboks">
        <EjerIkon navn="info" size={18} /> Dette er Veyros egne leverandører.
        Kundernes leverandørkartoteker forbliver i deres egne tenants og blandes
        ikke ind.
      </p>
      <section className="ejer-design-kort ejer-leverandoerer">
        <header>
          <h2>Leverandører og aftaler</h2>
          <div className="fc-actions">
            <span className="ejer-testmaerke">Syntetiske testdata</span>
            <button
              type="button"
              className="fc-btn fc-btn-primary"
              onClick={() => setFormular(tom)}
            >
              Ny leverandør
            </button>
          </div>
        </header>
        <div className="fc-table-wrap">
          <table className="fc-table">
            <thead>
              <tr>
                <th>Leverandør</th>
                <th>Kategori</th>
                <th>Kontakt</th>
                <th>Aftale</th>
                <th>Status</th>
                <th>Handling</th>
              </tr>
            </thead>
            <tbody>
              {poster.map((p) => (
                <tr key={p.id} className={valgt?.id === p.id ? "fc-valgt" : ""}>
                  <td>
                    <button
                      type="button"
                      className="ejer-tabel-link"
                      onClick={() => setValgtId(p.id)}
                    >
                      <b>{p.navn}</b>
                    </button>
                  </td>
                  <td>{p.kategori}</td>
                  <td>{p.kontakt}</td>
                  <td>{dato(p.aftaleTil)}</td>
                  <td>
                    <span
                      className={`fc-pill ${p.status === "aktiv" ? "ok" : "info"}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="fc-btn"
                      onClick={() => setFormular(p)}
                    >
                      Redigér
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!poster.length && (
          <p className="ejer-tomlinje">Ingen leverandører registreret.</p>
        )}
      </section>
      {valgt && (
        <section className="ejer-design-kort ejer-leverandoer-detalje">
          <header>
            <div>
              <small>Leverandørkort</small>
              <h2>{valgt.navn}</h2>
            </div>
            <button
              type="button"
              className="fc-btn"
              onClick={() => setFormular(valgt)}
            >
              Redigér
            </button>
          </header>
          <dl>
            <div>
              <dt>Kontakt</dt>
              <dd>
                <a href={`mailto:${valgt.kontakt}`}>{valgt.kontakt}</a>
              </dd>
            </div>
            <div>
              <dt>Kategori</dt>
              <dd>{valgt.kategori}</dd>
            </div>
            <div>
              <dt>Aftale</dt>
              <dd>
                {valgt.aftaleTil
                  ? `Gyldig til ${dato(valgt.aftaleTil)}`
                  : "Ingen registreret slutdato"}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{valgt.status}</dd>
            </div>
          </dl>
          <div className="ejer-leverandoer-spor">
            <section>
              <h3>Bilag</h3>
              <p>
                Dokumenter kan kobles fra bilagsindbakken. Der er endnu ikke
                knyttet et bilag til denne leverandør.
              </p>
            </section>
            <section>
              <h3>Seneste ændring</h3>
              <p>
                {tidspunkt(valgt.opdateretMs)}
                {valgt.opdateretAf ? " · registreret af en ejer" : ""}
              </p>
            </section>
          </div>
        </section>
      )}
      {formular && (
        <section className="ejer-design-kort ejer-leverandoer-form">
          <header>
            <h2>{formular.id ? "Redigér leverandør" : "Ny leverandør"}</h2>
            <button
              type="button"
              className="fc-btn"
              onClick={() => setFormular(null)}
            >
              Luk
            </button>
          </header>
          <div className="fc-form-grid">
            {[
              ["navn", "Navn"],
              ["kategori", "Kategori"],
              ["kontakt", "Kontaktmail", "email"],
              ["aftaleTil", "Aftale til", "date"],
            ].map(([felt, label, type]) => (
              <label className="fc-field" key={felt}>
                <span>{label}</span>
                <input
                  type={type || "text"}
                  value={formular[felt] || ""}
                  onChange={(event) =>
                    setFormular((aktuel) => ({
                      ...aktuel,
                      [felt]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <label className="fc-field">
              <span>Status</span>
              <select
                value={formular.status}
                onChange={(event) =>
                  setFormular((aktuel) => ({
                    ...aktuel,
                    status: event.target.value,
                  }))
                }
              >
                <option value="aktiv">Aktiv</option>
                <option value="pause">Pause</option>
                <option value="afsluttet">Afsluttet</option>
              </select>
            </label>
            <label className="fc-field ejer-leverandoer-noter">
              <span>Interne noter</span>
              <textarea
                value={formular.noter || ""}
                onChange={(event) =>
                  setFormular((aktuel) => ({
                    ...aktuel,
                    noter: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="fc-actions">
            <button
              type="button"
              className="fc-btn"
              onClick={() => setFormular(null)}
            >
              Annullér
            </button>
            <button
              type="button"
              className="fc-btn fc-btn-primary"
              disabled={arbejder || !aendringer.length}
              onClick={() => setBekraeftGem(true)}
            >
              Gem leverandør
            </button>
          </div>
        </section>
      )}
      {bekraeftGem && (
        <Dialog
          titel="Gem leverandørændringer?"
          under={`Kontrollér ændringerne for ${formular?.navn || "den nye leverandør"}.`}
          onLuk={() => setBekraeftGem(false)}
        >
          <div className="ejer-aendringsliste">
            {aendringer.map((post) => (
              <div key={post.label}>
                <b>{post.label}</b>
                <span>
                  <del>{post.foer}</del>
                  <i>→</i>
                  <ins>{post.efter}</ins>
                </span>
              </div>
            ))}
          </div>
          <div className="fc-actions">
            <button
              type="button"
              className="fc-btn"
              onClick={() => setBekraeftGem(false)}
            >
              Fortsæt redigering
            </button>
            <button
              type="button"
              className="fc-btn fc-btn-primary"
              disabled={arbejder || !aendringer.length}
              onClick={gem}
            >
              Bekræft og gem
            </button>
          </div>
        </Dialog>
      )}
      {besked && (
        <p role="status" className="ejer-handlingssvar">
          {besked}
        </p>
      )}
    </div>
  );
}
