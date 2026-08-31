/* src/moduler/leverandoerportal/LeverandoerPortal.jsx
 * "Mine opgaver" — leverandørportalens eneste skærm.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ BEVIDST ÉN SKÆRM, IKKE ET MODUL MED UNDERSIDER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tillægskravets §6/§17: portalen skal være meget enklere end kontor-
 * programmet — ingen sidebar, intet Dashboard, ingen administration. To
 * faner (Aktive/Afsluttede) og et detaljepanel er hele fladen. Samme
 * disciplin som chaufførappens Indberetning.jsx/Turplan.jsx: ét
 * selvstændigt skærmfil med sin egen interne tilstand, ikke en Context.
 *
 * ⚠ SIKKERHEDEN LIGGER 100% SERVER-SIDE. Denne skærm viser kun det
 * `leverandoerPortalOpgaver`/`leverandoerTilbudIndsend`/
 * `leverandoerStatusOpdater` rent faktisk svarer — den kan ikke "spørge om"
 * en anden leverandørs opgave, for der er intet klientfilter at manipulere.
 * Se leverandoerportal-regler.js og functions/index.js's kraevLeverandoerGrant().
 *
 * ⚠ KNAPPERNE FØLGER kanLeverandoerSkifte(), IKKE EN LOKAL if-KÆDE — samme
 * "skærmen tegner, funktionen håndhæver"-disciplin som Statusskifte.jsx.
 *
 * ⚠ F.2 — FILER. `o.dokumenter` kommer FÆRDIGFILTRERET fra serveren
 * (leverandoerSynligOpgave() i leverandoerportal-regler.js) — kun aktive,
 * eksplicit delte dokumenters METADATA. Denne skærm henter aldrig en fil-
 * liste selv og kender intet storagePath; ét link ad gangen, udstedt af
 * leverandoerDokumentDownloadLink når brugeren rent faktisk beder om det.
 * Se docs/v1-user-feedback-implementation/00_MASTER_STATUS.md.
 */
import { useEffect, useState } from "react";
import {
  hentPortalTenanter, hentPortalOpgaver, indsendTilbud, opdaterPortalStatus,
  hentPortalDokumentLink,
} from "../../fleet/leverandoerportal.js";
import { kanLeverandoerSkifte } from "../../fleet/leverandoerportal-regler.js";
import { OPGAVE_STATUS } from "../../fleet/opgaver.js";
import { kr, dato, oereFraKroner, isoTilMs, filstoerrelse } from "../../fleet/format.js";
import {
  Knap, Kort, Pille, Tom, Fejl, Henter, Faner, Dialog, Formular, Felt, Formularsvar,
} from "../../fleet/ui.jsx";

const VALUTA_VALG = [
  { vaerdi: "DKK", label: "DKK" }, { vaerdi: "SEK", label: "SEK" },
  { vaerdi: "NOK", label: "NOK" }, { vaerdi: "EUR", label: "EUR" },
];

export default function LeverandoerPortal({ logUd }) {
  const [tenanter, setTenanter] = useState(null); // null = ikke hentet (endnu, eller fejlet)
  const [tenantFejl, setTenantFejl] = useState(null);
  const [tenantForsoeg, setTenantForsoeg] = useState(0); // ⚠ TVINGER useEffect TIL AT KØRE IGEN — se "Prøv igen"
  const [valgtTenant, setValgtTenant] = useState(null); // { tenantId, leverandoerNavn }
  const [data, setData] = useState(null); // { aktive, afsluttede }
  const [henterOpgaver, setHenterOpgaver] = useState(false);
  const [fane, setFane] = useState("aktive");
  const [aabenId, setAabenId] = useState(null);
  const [hentefejl, setHentefejl] = useState(null);

  /* ---- 1) Hvilke(n) tenant(s) har denne konto et grant til? -------------
     Uundgåeligt et ekstra kald: leverandoerPortalAdgang kan ikke læses af
     klienten, så der er intet andet sted at spørge. Se funktionens egen
     note.
     ⚠ tenanter ER null BÅDE UNDER HENTNING OG EFTER EN FEJL — de to
     tilstande skal derfor holdes ADSKILT i egne felter (tenantFejl), ikke
     forsøges skelnet ud fra tenanter alene. Første udgave havde kun
     hentefejl og intet retur-check på den — en fejlet forespørgsel gav en
     "Henter din adgang…"-skærm der aldrig blev til andet, for fejlteksten
     lå i et felt skærmens tidlige return aldrig nåede at læse. */
  useEffect(() => {
    let aktiv = true;
    setTenantFejl(null);
    hentPortalTenanter()
      .then((liste) => {
        if (!aktiv) return;
        setTenanter(liste);
        if (liste.length === 1) setValgtTenant(liste[0]);
      })
      .catch((e) => { if (aktiv) setTenantFejl(e?.message || "Kunne ikke hente din adgang."); });
    return () => { aktiv = false; };
  }, [tenantForsoeg]);

  /* ---- 2) Opgaverne for den valgte tenant ------------------------------- */
  function genindlaesOpgaver(tenantId) {
    setHenterOpgaver(true);
    setHentefejl(null);
    hentPortalOpgaver(tenantId)
      .then((svar) => setData(svar))
      .catch((e) => setHentefejl(e?.message || "Kunne ikke hente opgaverne."))
      .finally(() => setHenterOpgaver(false));
  }

  useEffect(() => {
    if (valgtTenant?.tenantId) genindlaesOpgaver(valgtTenant.tenantId);
  }, [valgtTenant?.tenantId]);

  if (tenanter === null) {
    if (tenantFejl) {
      return <Fejl genprov={() => setTenantForsoeg((n) => n + 1)}>{tenantFejl}</Fejl>;
    }
    return <Henter hvad="din adgang" />;
  }

  if (tenanter.length === 0) {
    return (
      <Tom handling={<Knap onClick={logUd}>Log ud</Knap>}>
        Denne konto har ingen aktiv portaladgang. Kontakt den virksomhed der
        inviterede dig.
      </Tom>
    );
  }

  if (!valgtTenant) {
    /* Flere tenants — samme konto arbejder for flere FleetControl-kunder.
       Ingen vælger nødvendig med kun ét grant (se useEffect ovenfor). */
    return (
      <Kort titel="Vælg virksomhed">
        {tenanter.map((t) => (
          <button key={t.tenantId} type="button" className="fc-btn fc-app-knap"
                  style={{ display: "block", width: "100%", marginBottom: 8 }}
                  onClick={() => setValgtTenant(t)}>
            {t.leverandoerNavn || t.tenantId}
          </button>
        ))}
      </Kort>
    );
  }

  const liste = data ? (fane === "aktive" ? data.aktive : data.afsluttede) : [];
  const aabenOpgave = aabenId
    ? [...(data?.aktive || []), ...(data?.afsluttede || [])].find((o) => o.id === aabenId)
    : null;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {hentefejl && <p className="fc-empty-bad" role="alert">{hentefejl}</p>}

      <Faner
        label="Opgaver"
        valgt={fane} saet={setFane}
        faner={[
          { key: "aktive", label: "Aktive", badge: data?.aktive.length ?? undefined },
          { key: "afsluttede", label: "Afsluttede", badge: data?.afsluttede.length ?? undefined },
        ]}
      />

      {henterOpgaver ? (
        <Henter hvad="opgaver" />
      ) : liste.length === 0 ? (
        <Tom>
          {fane === "aktive" ? "Ingen aktive opgaver lige nu." : "Ingen afsluttede opgaver endnu."}
        </Tom>
      ) : (
        <div className="fc-grid" style={{ gap: 10 }}>
          {liste.map((o) => (
            <OpgaveKort key={o.id} opgave={o} onAaben={() => setAabenId(o.id)} />
          ))}
        </div>
      )}

      {aabenOpgave && (
        <OpgaveDetalje
          opgave={aabenOpgave}
          tenantId={valgtTenant.tenantId}
          onLuk={() => setAabenId(null)}
          onAendret={() => genindlaesOpgaver(valgtTenant.tenantId)}
        />
      )}
    </div>
  );
}

/* ---- Ét kort i listen --------------------------------------------------- */

function OpgaveKort({ opgave: o, onAaben }) {
  return (
    <Kort>
      <div className="fc-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <b>{o.koeretoejNavn || "Ukendt enhed"}</b>
          {o.koeretoejRegistrering && <span className="fc-hint"> · {o.koeretoejRegistrering}</span>}
          {o.arbejdstype && <div className="fc-hint">{o.arbejdstype}</div>}
        </div>
        <Pille tone={OPGAVE_STATUS[o.status]?.pill || "info"}>
          {OPGAVE_STATUS[o.status]?.label || o.status}
        </Pille>
      </div>
      {o.beskrivelse && <p style={{ margin: "8px 0" }}>{o.beskrivelse}</p>}
      {o.startMs != null && <p className="fc-hint">{dato(o.startMs)}</p>}
      <Knap onClick={onAaben}>Se opgave</Knap>
    </Kort>
  );
}

/* ---- Detaljepanelet ------------------------------------------------------
   ⚠ ÉT Dialog-PANEL, IKKE TO STABLEDE. Bekræftelsen på "klar til afhentning"
   (§11) er et internt tilstandsskifte i SAMME panel — visArt: "detalje" |
   "prisoverslag" | "bekraeft-klar" — frem for en anden Dialog oven på den
   første. */
function OpgaveDetalje({ opgave: o, tenantId, onLuk, onAendret }) {
  const [visArt, setVisArt] = useState("detalje");
  const [sender, setSender] = useState(false);
  const [svar, setSvar] = useState(null);

  const [beloeb, setBeloeb] = useState("");
  const [valuta, setValuta] = useState("DKK");
  const [kommentar, setKommentar] = useState("");
  const [faerdigDato, setFaerdigDato] = useState("");

  const [aabnerFilId, setAabnerFilId] = useState(null);
  const [filFejl, setFilFejl] = useState(null);

  async function aabenFil(dokumentId) {
    setFilFejl(null);
    setAabnerFilId(dokumentId);
    try {
      const svarLink = await hentPortalDokumentLink(tenantId, o.id, dokumentId);
      if (svarLink?.url) {
        window.open(svarLink.url, "_blank", "noopener,noreferrer");
      } else {
        setFilFejl("Linket kunne ikke udstedes.");
      }
    } catch (e) {
      setFilFejl(e?.message || "Filen kunne ikke åbnes.");
    } finally {
      setAabnerFilId(null);
    }
  }

  async function sendTilbud() {
    const beloebOere = oereFraKroner(beloeb);
    if (!Number.isFinite(beloebOere) || beloebOere < 0) {
      setSvar({ ok: false, besked: "Angiv et gyldigt beløb." });
      return;
    }
    setSender(true);
    try {
      await indsendTilbud(tenantId, o.id, {
        beloebOere, valuta,
        kommentar: kommentar.trim() || undefined,
        forventetFaerdigMs: faerdigDato ? isoTilMs(faerdigDato) : undefined,
      });
      setSvar({ ok: true });
      setVisArt("detalje");
      setBeloeb(""); setKommentar(""); setFaerdigDato("");
      onAendret();
    } catch (e) {
      setSvar({ ok: false, besked: e?.message || "Prisoverslaget kunne ikke sendes." });
    } finally {
      setSender(false);
    }
  }

  async function skiftStatus(tilStatus) {
    setSender(true);
    setSvar(null);
    try {
      await opdaterPortalStatus(tenantId, o.id, tilStatus);
      onAendret();
      onLuk();
    } catch (e) {
      setSvar({ ok: false, besked: e?.message || "Status kunne ikke ændres." });
      setSender(false);
    }
  }

  const kanPaabegynde = kanLeverandoerSkifte(o.status, "igang");
  const kanMeldeKlar = kanLeverandoerSkifte(o.status, "klar_til_afhentning");
  const erAfsluttet = o.status === "udfoert" || o.status === "annulleret";

  return (
    <Dialog titel={o.koeretoejNavn || "Opgave"} under={o.arbejdstype} onLuk={onLuk} bred>
      {visArt === "prisoverslag" ? (
        <Formular
          onGem={sendTilbud} gemmer={sender} gemLabel="Send prisoverslag"
          onAnnuller={() => setVisArt("detalje")} svar={svar}
        >
          <Felt id="lp-beloeb" label="Beløb" type="text" inputMode="decimal"
                vaerdi={beloeb} saet={setBeloeb} kraevet />
          <Felt id="lp-valuta" label="Valuta" vaerdi={valuta} saet={setValuta}
                valgmuligheder={VALUTA_VALG} />
          <Felt id="lp-faerdig" label="Forventet færdig (valgfrit)" type="date"
                vaerdi={faerdigDato} saet={setFaerdigDato} />
          <Felt id="lp-kommentar" label="Kommentar (valgfrit)" type="text"
                vaerdi={kommentar} saet={setKommentar} />
        </Formular>
      ) : visArt === "bekraeft-klar" ? (
        <div className="fc-grid" style={{ gap: 12 }}>
          <p>Er arbejdet udført, og er enheden klar til afhentning?</p>
          <Formularsvar svar={svar} />
          <div className="fc-row" style={{ gap: 8 }}>
            <Knap variant="primaer" disabled={sender} onClick={() => skiftStatus("klar_til_afhentning")}>
              {sender ? "Sender …" : "Ja, klar til afhentning"}
            </Knap>
            <Knap disabled={sender} onClick={() => setVisArt("detalje")}>Annullér</Knap>
          </div>
        </div>
      ) : (
        <div className="fc-grid" style={{ gap: 12 }}>
          <div className="fc-row" style={{ justifyContent: "space-between" }}>
            <Pille tone={OPGAVE_STATUS[o.status]?.pill || "info"}>
              {OPGAVE_STATUS[o.status]?.label || o.status}
            </Pille>
            {o.koeretoejRegistrering && <span className="fc-hint">{o.koeretoejRegistrering}</span>}
          </div>

          {o.beskrivelse && <p>{o.beskrivelse}</p>}
          {o.startMs != null && <p className="fc-hint">Planlagt {dato(o.startMs)}</p>}

          <div>
            <b className="fc-hint" style={{ display: "block", marginBottom: 4 }}>Prisoverslag</b>
            {o.tilbud.length === 0 ? (
              <p className="fc-hint">Intet prisoverslag sendt endnu.</p>
            ) : (
              <ul className="fc-grid" style={{ gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
                {o.tilbud.map((t) => (
                  <li key={t.id} className="fc-row" style={{ justifyContent: "space-between" }}>
                    <span>{kr(t.beloebOere)} {t.valuta}{t.kommentar ? ` — ${t.kommentar}` : ""}</span>
                    <Pille tone={
                      t.status === "accepteret" ? "ok" : t.status === "afvist" ? "bad" : "info"
                    }>
                      {t.status === "accepteret" ? "Accepteret" : t.status === "afvist" ? "Afvist"
                        : t.status === "kraeverAfklaring" ? "Kræver afklaring" : "Afventer"}
                    </Pille>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {o.dokumenter.length > 0 && (
            <div>
              <b className="fc-hint" style={{ display: "block", marginBottom: 4 }}>Filer</b>
              {filFejl && <p className="fc-empty-bad" role="alert">{filFejl}</p>}
              <ul className="fc-grid" style={{ gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
                {o.dokumenter.map((d) => (
                  <li key={d.id} className="fc-row" style={{ justifyContent: "space-between" }}>
                    <span>
                      {d.originaltFilnavn}
                      <span className="fc-hint"> · {filstoerrelse(d.stoerrelse)}</span>
                    </span>
                    <Knap disabled={aabnerFilId === d.id} onClick={() => aabenFil(d.id)}>
                      {aabnerFilId === d.id ? "Åbner …" : "Åbn"}
                    </Knap>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!erAfsluttet && <Formularsvar svar={svar} />}

          {!erAfsluttet && (
            <div className="fc-row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Knap onClick={() => setVisArt("prisoverslag")}>Send prisoverslag</Knap>
              {kanPaabegynde && (
                <Knap disabled={sender} onClick={() => skiftStatus("igang")}>
                  Arbejde påbegyndt
                </Knap>
              )}
              {kanMeldeKlar && (
                <Knap variant="primaer" disabled={sender} onClick={() => setVisArt("bekraeft-klar")}>
                  Klar til afhentning
                </Knap>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
