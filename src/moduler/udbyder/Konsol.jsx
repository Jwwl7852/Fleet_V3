/* src/moduler/udbyder/Konsol.jsx
 * Ejerkonsollen — kundeoversigt, moduler og abonnement.
 *
 * ⚠ DEN LIGGER UDEN FOR AppShell, OG DET ER IKKE PYNT. Shellen ejer sidebar,
 * tenant-vælger og periodevælger, og alle tre hører til en KUNDEKONTEKST. En
 * ejer står ikke i en: hans konto har ingen tenant (beslutning 35), og
 * `harAdgang` i App.jsx lukker ham ude af kundeshellen. De to rutetræer er
 * sideordnede, ikke det ene en udvidelse af det andet.
 *
 * ⚠ SKÆRMEN SKRIVER IKKE ÉN BYTE. Alt går gennem de fire Cloud Functions,
 * fordi kundeposten er `.write: false` — også for en ejer (beslutning 34).
 * Falder en knap væk herfra, kan handlingen stadig ikke laves fra en browser.
 *
 * ⚠ DEN LÆSER DIREKTE FRA BASEN i stedet for gennem useListe. Det er ikke en
 * omgåelse af "én vej ind": useListe læser under `tenants/<claim>/…` og
 * filtrerer på division. Ejeren har ingen tenant og ingen division, og de tre
 * noder han må læse er præcis dem reglerne åbner for `udbyder === true`.
 * Skrivevejen er stadig én, og det er funktionerne.
 *
 * ⚠ ET FRAVALGT MODUL LUKKER KUNDENS EGNE DATA (beslutning 33). Skærmen
 * siger det, hver gang der fravælges noget — han kan ikke hente dem ud
 * gennem appen bagefter, og en eksport hører FØR fravalget.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db, auth } from "../../firebase.js";
import { dato, num, pct } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formular, Formularsvar,
  Henter, Tom, Gitter, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import {
  MODUL, VALGFRIE_MODULER, OBLIGATORISKE_MODULER, harModul,
} from "../../fleet/moduler.js";
import {
  ABONNEMENT, ALLE_ABONNEMENTSTATUS, AARSAG, ALLE_AARSAGER, opbevaresTil,
} from "../../fleet/abonnement.js";
import { nytLoesen } from "../../fleet/brugere-regler.js";
import {
  opretKunde, saetModuler, saetStatus, opretKundeadmin, saetAbonnement,
  valideNyKunde, foreslaaId,
} from "../../fleet/udbyder.js";
import { bpsTilPct, pctTilBps } from "../../fleet/beloeb.js";

/* ---- Læsning ----------------------------------------------------------- */

/**
 * Hent kundelisten.
 *
 * ⚠ INDEKSET BÆRER KUN EKSISTENS. Navn, moduler og abonnement står under
 * tenanten — ét sted. En kopi i indekset ville drive, og udbyderen ville se
 * et andet navn end kunden selv. Det koster tre opslag pr. kunde; det er
 * prisen for at der ikke findes to sandheder.
 */
async function hentKunder() {
  const indeks = (await db.ref("udbyder/kunder").once("value")).val() || {};
  const ider = Object.keys(indeks).sort((a, b) => a.localeCompare(b, "da"));
  return Promise.all(ider.map(async (id) => {
    const [v, m, a] = await Promise.all([
      db.ref(`tenants/${id}/virksomhed`).once("value"),
      db.ref(`tenants/${id}/moduler`).once("value"),
      db.ref(`tenants/${id}/abonnement`).once("value"),
    ]);
    return {
      id,
      oprettetMs: indeks[id]?.oprettetMs || null,
      virksomhed: v.val(),
      moduler: m.val(),
      abonnement: a.val(),
    };
  }));
}

/* ---- Delskærme --------------------------------------------------------- */

function Statuspille({ abonnement }) {
  const status = abonnement?.status || "aktiv";
  const a = ABONNEMENT[status];
  return <Pille tone={a?.pill || "info"}>{a?.label || status}</Pille>;
}

/**
 * Modulafkrydsningen og rabatten pr. modul for én kunde.
 *
 * ⚠ FRAVALG ADVARES DER OM, TILVALG GØR DER IKKE. De to er ikke lige farlige:
 * et tilvalg åbner noget, et fravalg lukker kundens egne data inde. Advarslen
 * står FØR knappen, ikke som en bekræftelsesdialog bagefter — man skal kunne
 * se konsekvensen mens man vælger.
 *
 * ⚠ TO KNAPPER, OG DET ER MED VILJE.
 *
 * De to felter i en række skriver til hver sin funktion og har hver sin
 * virkning i tid: et modulskift gælder i SAMME sekund og kan lukke kunden ude
 * af sine data, mens en rabat først gælder fra NÆSTE opgørelse og aldrig
 * bagud. Én knap ville skrive begge dele, og så ville en tastet rabat udløse
 * et modulskift — eller omvendt: et fravalg udløse en rabatændring nogen ikke
 * havde til hensigt.
 *
 * Hver knap er derfor slået fra indtil netop dens egen ting er ændret. Skriver
 * man en procent, lyser kun "Gem rabatter", og "Gem moduler" bliver ved med at
 * være grå. Det er den mest ærlige tilbagemelding om hvad der lige skete: man
 * kan se på skærmen hvad der IKKE blev gemt.
 *
 * Alternativet — at lade "Gem rabat" i Rabat-kortet gemme modulrabatterne —
 * blev valgt fra: man ville redigere ét sted og gemme et andet, og de fleste
 * ville trykke "Gem moduler" og tro at rabatten fulgte med.
 */
function Moduler({ kunde, paaGemt }) {
  const nuHar = VALGFRIE_MODULER.filter((m) => kunde.moduler?.[m] === true);
  const nuRabat = kunde.abonnement?.rabatModulBps || {};
  const generel = Number.isInteger(kunde.abonnement?.rabatBps) ? kunde.abonnement.rabatBps : 0;

  const [valgte, saetValgte] = useState(() => nuHar);
  const [rabat, saetRabat] = useState(() =>
    Object.fromEntries(VALGFRIE_MODULER.map((m) =>
      [m, nuRabat[m] ? String(bpsTilPct(nuRabat[m])) : ""])));

  const [gemmerModuler, saetGemmerModuler] = useState(false);
  const [gemmerRabat, saetGemmerRabat] = useState(false);
  const [svarModuler, saetSvarModuler] = useState(null);
  const [svarRabat, saetSvarRabat] = useState(null);

  const fjernet = nuHar.filter((m) => !valgte.includes(m));
  const tilfoejet = valgte.filter((m) => !nuHar.includes(m));
  const modulerAendret = fjernet.length > 0 || tilfoejet.length > 0;

  const tilBps = (v) => {
    if (String(v).trim() === "") return 0;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n >= 0 && n <= 100 ? pctTilBps(n) : null;
  };
  const bps = Object.fromEntries(VALGFRIE_MODULER.map((m) => [m, tilBps(rabat[m])]));
  const ugyldige = VALGFRIE_MODULER.filter((m) => bps[m] === null);
  /* ⚠ NUL GEMMES IKKE. Et modul med 0 % er et modul uden rabat, og en node
     fuld af nuller ville se ud som aftaler der ikke findes. */
  const rene = Object.fromEntries(
    VALGFRIE_MODULER.filter((m) => bps[m] > 0).map((m) => [m, bps[m]]));
  const gemte = Object.fromEntries(Object.entries(nuRabat).filter(([, v]) => v > 0));
  const rabatAendret = ugyldige.length === 0 &&
    JSON.stringify(rene) !== JSON.stringify(gemte);

  const skift = (m) => {
    saetSvarModuler(null);
    saetValgte((v) => (v.includes(m) ? v.filter((x) => x !== m) : [...v, m]));
  };

  const gemModuler = async () => {
    saetGemmerModuler(true);
    const r = await saetModuler({ id: kunde.id, moduler: valgte });
    saetGemmerModuler(false);
    saetSvarModuler(r.ok ? { ok: true } : { ok: false, art: r.art, besked: r.besked });
    if (r.ok) paaGemt();
  };

  const gemRabat = async () => {
    saetGemmerRabat(true);
    const r = await saetAbonnement({ id: kunde.id, rabatModulBps: rene });
    saetGemmerRabat(false);
    saetSvarRabat(r.ok ? { ok: true } : { ok: false, art: r.art, besked: r.besked });
    if (r.ok) paaGemt();
  };

  return (
    <div>
      <div className="fc-scroll">
        <table className="fc-table">
          <thead>
            <tr>
              <th>Modul</th>
              <th className="fc-num">Rabat</th>
            </tr>
          </thead>
          <tbody>
            {VALGFRIE_MODULER.map((m) => {
              const til = valgte.includes(m);
              return (
                <tr key={m}>
                  <td>
                    {/* ⚠ DÆMPET NAVN FREM FOR "(ikke tilvalgt)". Rækken er
                        smal nu, og en parentes efter hvert fravalgt modul
                        ville fylde mere end den forklarer. Feltet er stadig
                        udfyldeligt: en aftalt sats kan stå klar til den dag
                        modulet tilvælges. */}
                    <label className="fc-med-ikon" style={{ gap: 8 }}>
                      <input type="checkbox" checked={til} onChange={() => skift(m)} />
                      <span className={til ? undefined : "fc-neutral"}>
                        <b>{MODUL[m].label}</b>{" "}
                        <span className="fc-hint">{MODUL[m].hvad}</span>
                      </span>
                    </label>
                  </td>
                  <td className="fc-num">
                    <span className="fc-med-suffiks">
                      <input className="fc-input-tal fc-input-pct" inputMode="decimal"
                             size={3} value={rabat[m]}
                             aria-label={`Rabat på ${MODUL[m].label} i procent`}
                             onChange={(e) => {
                               const v = e.target.value;
                               saetRabat((x) => ({ ...x, [m]: v }));
                               saetSvarRabat(null);
                             }} />
                      <span className="fc-hint">%</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="fc-hint" style={{ marginTop: 10 }}>
        {OBLIGATORISKE_MODULER.map((m) => MODUL[m].label).join(", ")} kan ikke
        fravælges — et system uden forside er ikke et system, og en kunde uden
        Opsætning kan ikke se sine egne brugere.
      </p>

      {/* ---- Moduler ---- */}
      {fjernet.length > 0 && (
        <div className="fc-empty fc-empty-warn" style={{ marginTop: 12 }}>
          <p><b>Du fravælger {fjernet.map((m) => MODUL[m].label).join(", ")}.</b></p>
          <p className="fc-hint" style={{ marginTop: 6 }}>
            Kunden kan derefter <b>hverken læse eller skrive</b> i modulet — heller
            ikke det han selv har lagt ind. Data slettes ikke, men eneste vej til
            dem går gennem os. <b>En eksport hører før fravalget</b>, ikke efter.
          </p>
        </div>
      )}

      <div className="fc-formular-knapper" style={{ marginTop: 12 }}>
        <Knap variant="primaer" disabled={!modulerAendret || gemmerModuler}
              onClick={gemModuler}
              title="Gælder med det samme.">
          {gemmerModuler ? "Gemmer …" : "Gem moduler"}
        </Knap>
        {modulerAendret && (
          <Knap onClick={() => { saetValgte(nuHar); saetSvarModuler(null); }}
                disabled={gemmerModuler}>
            Fortryd moduler
          </Knap>
        )}
      </div>
      <Formularsvar svar={svarModuler} />

      {/* ---- Rabat pr. modul ---- */}
      {generel > 0 && (
        <div className="fc-empty fc-empty-warn" style={{ marginTop: 12 }}>
          <p><b>Rabat på alt ({pct(bpsTilPct(generel))}) overruler satserne herover.</b></p>
          <p className="fc-hint" style={{ marginTop: 6 }}>
            Hver linje får {pct(bpsTilPct(generel))} — også et modul med sin egen
            sats. Satserne bliver stående og træder i kraft igen, når{" "}
            <b>Rabat på alt</b> sættes til 0.
          </p>
        </div>
      )}

      <p className="fc-hint" style={{ marginTop: 12 }}>
        ⚠ <b>En rabat virker først på næste opgørelse.</b> Et frosset
        fakturagrundlag regnes <b>aldrig</b> igen — det er hele pointen med at
        det er frosset. En ændring her gælder ikke bagud.
      </p>
      <p className="fc-hint" style={{ marginTop: 6 }}>
        Tom rubrik = ingen rabat. Et modul kunden ikke har, kan godt have en
        aftalt sats — den træder i kraft den dag modulet tilvælges.
      </p>
      {ugyldige.length > 0 && (
        <p className="fc-hint" style={{ marginTop: 6 }}>
          Ugyldig procent: {ugyldige.map((m) => MODUL[m].label).join(", ")}. Mellem 0 og 100.
        </p>
      )}

      <div className="fc-formular-knapper" style={{ marginTop: 10 }}>
        <Knap disabled={!rabatAendret || gemmerRabat} onClick={gemRabat}
              title="Gælder fra næste opgørelse.">
          {gemmerRabat ? "Gemmer …" : "Gem rabatter"}
        </Knap>
        {rabatAendret && (
          <Knap disabled={gemmerRabat}
                onClick={() => {
                  saetRabat(Object.fromEntries(VALGFRIE_MODULER.map((m) =>
                    [m, nuRabat[m] ? String(bpsTilPct(nuRabat[m])) : ""])));
                  saetSvarRabat(null);
                }}>
            Fortryd rabatter
          </Knap>
        )}
      </div>
      <Formularsvar svar={svarRabat} />
    </div>
  );
}

/**
 * Abonnementstilstanden.
 *
 * ⚠ INGEN "SLET"-KNAP, OG DER KOMMER IKKE EN. `opsagt` er ikke en sletning —
 * egentlig sletning er en manuel proces med en kontrakt bag (beslutning 32).
 * En knap der findes, bliver trykket på; det er samme begrundelse som at
 * skriv.js ikke har en slet().
 */
function Abonnement({ kunde, paaGemt }) {
  const nu = kunde.abonnement?.status || "aktiv";
  const [status, saetStatusVal] = useState(nu);
  const [aarsag, saetAarsag] = useState(kunde.abonnement?.aarsag || "");
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const aendret = status !== nu;
  const til = opbevaresTil(kunde.abonnement);

  const gem = async () => {
    saetGemmer(true);
    const r = await saetStatus({ id: kunde.id, status, aarsag: aarsag || undefined });
    saetGemmer(false);
    saetSvar(r.ok ? { ok: true } : { ok: false, art: r.art, besked: r.besked });
    if (r.ok) paaGemt();
  };

  return (
    <div>
      <Feltraekke>
        <Felt id={`st-${kunde.id}`} label="Tilstand" vaerdi={status}
              saet={(v) => { saetStatusVal(v); saetSvar(null); }}
              valgmuligheder={ALLE_ABONNEMENTSTATUS.map((s) => ({
                vaerdi: s, label: ABONNEMENT[s].label,
              }))} />
        {/* ⚠ ALLOWLISTE, IKKE ET FRITEKSTFELT. Årsagen ender i auditloggen. */}
        <Felt id={`aa-${kunde.id}`} label="Årsag" vaerdi={aarsag}
              saet={(v) => { saetAarsag(v); saetSvar(null); }}
              valgmuligheder={[{ vaerdi: "", label: "—" },
                ...ALLE_AARSAGER.map((a) => ({ vaerdi: a, label: AARSAG[a] }))]}
              hint="Står i auditloggen hos kunden. Vises ikke for ham." />
      </Feltraekke>

      <p className="fc-hint">{ABONNEMENT[status]?.hvad}</p>

      {status !== "aktiv" && (
        <div className="fc-empty fc-empty-warn" style={{ marginTop: 10 }}>
          <p><b>Kunden kan logge ind, men kommer ikke ind.</b></p>
          <p className="fc-hint" style={{ marginTop: 6 }}>
            Hver læsning og skrivning afvises af reglerne, og han møder en
            låseskærm der siger hvorfor. <b>Ingen konto røres</b> — genåbning er
            ét klik, og de brugere der er spærret hver for sig, bliver ved med
            at være det.
          </p>
          {/* ⚠ DEN HER SÆTNING ER IKKE KOSMETIK. Beslutning 32 gjorde pause
              TEKNISK og gratis at rulle tilbage. Da faktureringen kom til at
              tælle dage (højeste antal aktive pr. periode), blev den
              KOMMERCIEL — og dermed betyder knappen noget andet end den
              gjorde. Teksten er det eneste der står mellem et fejlklik og en
              faktura der er forkert. */}
          <p className="fc-hint" style={{ marginTop: 8 }}>
            ⚠ <b>Det koster penge fra i dag.</b> Dage hvor kunden ikke er aktiv,
            tælles ikke med på fakturagrundlaget. Sætter du ham på pause ved en
            fejl og åbner igen i morgen, mangler dagen i dag på hans regning —
            og den kan ikke tilføjes bagud, fordi målingen for dagen allerede
            er skrevet.
          </p>
        </div>
      )}

      {til && (
        <p className="fc-hint" style={{ marginTop: 10 }}>
          Kunden får at vide at data slettes <b>tidligst {dato(til)}</b>.
          Der slettes intet automatisk — det er en manuel proces.
        </p>
      )}

      <div className="fc-formular-knapper" style={{ marginTop: 12 }}>
        <Knap variant={status === "aktiv" ? "primaer" : undefined}
              disabled={!aendret || gemmer} onClick={gem}>
          {gemmer ? "Gemmer …" : `Sæt til ${ABONNEMENT[status]?.label?.toLowerCase()}`}
        </Knap>
        {aendret && (
          <Knap onClick={() => { saetStatusVal(nu); saetSvar(null); }} disabled={gemmer}>
            Fortryd
          </Knap>
        )}
      </div>
      <Formularsvar svar={svar} />
    </div>
  );
}

/**
 * Rabat på ALT — den generelle.
 *
 * ⚠ RABAT PR. MODUL STÅR IKKE HER. Den bor i Moduler-kortet, på samme linje
 * som modulets afkrydsningsfelt: de samme ti moduler listet to gange på én
 * skærm er en liste man skal holde styr på med øjnene. Det her felt er en
 * ANDEN slags rabat — den gælder alt, uanset hvilke moduler kunden har — og
 * derfor hører den ikke i modullisten.
 *
 * ⚠ DEN OVERRULER MODULERNES. Står der en procent her, gælder den på hver
 * eneste linje — også på et modul der har sin egen, og også når modulets er
 * større. Modulsatserne bliver stående og træder i kraft igen, når den her
 * sættes til nul.
 *
 * Reglen står i `rabatFor()` i priser.js og INGEN andre steder. Skrev skærmen
 * sin egen udgave, ville den vise ét tal og serveren fakturere et andet — og
 * det ville først blive opdaget når kunden lagde linjerne sammen.
 */
function Rabat({ kunde, paaGemt }) {
  const nuBps = Number.isInteger(kunde.abonnement?.rabatBps) ? kunde.abonnement.rabatBps : 0;
  const paaModuler = Object.entries(kunde.abonnement?.rabatModulBps || {})
    .filter(([, v]) => v > 0);

  const [felt, saetFelt] = useState(String(bpsTilPct(nuBps)));
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const tal = String(felt).trim() === "" ? 0 : Number(String(felt).replace(",", "."));
  const gyldig = Number.isFinite(tal) && tal >= 0 && tal <= 100;
  const bps = gyldig ? pctTilBps(tal) : null;
  const aendret = gyldig && bps !== nuBps;

  const gem = async () => {
    saetGemmer(true);
    const r = await saetAbonnement({ id: kunde.id, rabatBps: bps });
    saetGemmer(false);
    saetSvar(r.ok ? { ok: true } : { ok: false, art: r.art, besked: r.besked });
    if (r.ok) paaGemt();
  };

  return (
    <div>
      <Feltraekke>
        <Felt id={`rb-${kunde.id}`} label="Rabat på alt (%)" vaerdi={felt}
              saet={(v) => { saetFelt(v); saetSvar(null); }}
              fejl={!gyldig ? "Mellem 0 og 100." : null}
              hint="Tom eller 0 betyder ingen generel rabat." />
      </Feltraekke>

      {gyldig && bps > 0 && paaModuler.length > 0 && (
        <div className="fc-empty fc-empty-warn">
          <p><b>Den overruler {paaModuler.length} modulsats{paaModuler.length === 1 ? "" : "er"}.</b></p>
          <p className="fc-hint" style={{ marginTop: 6 }}>
            {paaModuler.map(([m]) => MODUL[m]?.label || m).join(", ")} har egne
            satser i <b>Moduler</b>. De bliver stående og træder i kraft igen,
            når det her felt sættes til <b>0</b>.
          </p>
        </div>
      )}

      {gyldig && bps > 0 && (
        <p className="fc-hint">
          Gemmes som <b>{num(bps)}</b> basispoint. Heltal, ikke decimaler — en
          float ville give afrundingsfejl der først dukker op på faktura nummer
          fyrre.
        </p>
      )}

      <p className="fc-hint" style={{ marginTop: 8 }}>
        ⚠ <b>Virker først på næste opgørelse.</b> Et frosset grundlag regnes
        aldrig igen. En ændring her gælder ikke bagud.
      </p>

      <div className="fc-formular-knapper" style={{ marginTop: 10 }}>
        <Knap variant="primaer" disabled={!aendret || gemmer} onClick={gem}>
          {gemmer ? "Gemmer …" : "Gem rabat"}
        </Knap>
        {aendret && (
          <Knap onClick={() => { saetFelt(String(bpsTilPct(nuBps))); saetSvar(null); }}
                disabled={gemmer}>
            Fortryd
          </Knap>
        )}
      </div>
      <Formularsvar svar={svar} />
    </div>
  );
}

/** Kundens første administrator. Løsenet vises én gang. */
function Foersteadmin({ kunde }) {
  const [aaben, saetAaben] = useState(false);
  const [f, saetF] = useState({ navn: "", email: "" });
  const [kode] = useState(() => nytLoesen());
  const [vist, saetVist] = useState("");
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const kanGemme = Boolean(f.navn.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim()));

  const gem = async () => {
    saetGemmer(true);
    const r = await opretKundeadmin({ id: kunde.id, ...f, kode });
    saetGemmer(false);
    if (r.ok) { saetVist(kode); saetAaben(false); saetSvar(null); }
    else saetSvar({ ok: false, art: r.art, besked: r.besked });
  };

  if (vist) {
    return (
      <div className="fc-empty fc-empty-info">
        <p><b>Administratoren er oprettet. Adgangskoden vises kun nu:</b></p>
        <p><code style={{ fontSize: 16, letterSpacing: ".04em" }}>{vist}</code></p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Den kan ikke hentes frem igen — Firebase gemmer kun et hash. Giv den
          videre, og bed ham skifte den.
        </p>
        <Knap onClick={() => saetVist("")}>Jeg har noteret den</Knap>
      </div>
    );
  }

  if (!aaben) {
    return (
      <div>
        <Knap onClick={() => saetAaben(true)}>Opret administrator</Knap>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Kunden kan først selv oprette brugere, når han har én administrator.
          Derefter sker det hos ham, under Opsætning → Brugere &amp; roller.
        </p>
        <Formularsvar svar={svar} />
      </div>
    );
  }

  return (
    <Formular onGem={gem} gemmer={gemmer} kanGemme={kanGemme}
              gemLabel="Opret administrator" onAnnuller={() => saetAaben(false)} svar={svar}>
      <Feltraekke>
        <Felt id={`an-${kunde.id}`} label="Navn" kraevet vaerdi={f.navn}
              saet={(v) => saetF((x) => ({ ...x, navn: v }))} />
        <Felt id={`ae-${kunde.id}`} label="E-mail" kraevet type="email" vaerdi={f.email}
              saet={(v) => saetF((x) => ({ ...x, email: v }))}
              hint="Bliver hans login. Adressen kan ikke bruges hos to virksomheder." />
      </Feltraekke>
      <Felt id={`ak-${kunde.id}`} label="Adgangskode" vaerdi={kode} readOnly
            hint="Genereret. Vises kun én gang efter oprettelsen." />
    </Formular>
  );
}

/** Ny kunde. */
function Nykunde({ paaOprettet, paaLuk }) {
  const [f, saetF] = useState({ navn: "", id: "", cvr: "" });
  const [idRoert, saetIdRoert] = useState(false);
  const [moduler, saetModulerVal] = useState([]);
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  /* ⚠ FORSLAGET FORSVINDER I DET ØJEBLIK NOGEN RØRER FELTET. Id'et er
     permanent — det står i hver eneste sti under tenants/ — og et navn kan
     ændre sig. En afledning ville binde de to sammen for altid. */
  const saetNavn = (v) => {
    saetSvar(null);
    saetF((x) => ({ ...x, navn: v, id: idRoert ? x.id : foreslaaId(v) }));
  };

  const fejl = valideNyKunde({ ...f, moduler });
  const kanGemme = Object.keys(fejl).length === 0;
  const vis = (felt) => (visAlle ? fejl[felt] : null);

  const gem = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const r = await opretKunde({ ...f, moduler });
    saetGemmer(false);
    if (r.ok) paaOprettet(f.id);
    else saetSvar({ ok: false, art: r.art, besked: r.besked });
  };

  return (
    <Kort titel="Ny kunde">
      <Formular onGem={gem} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel="Opret kunde" onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="nk-navn" label="Virksomhedsnavn" kraevet vaerdi={f.navn}
                saet={saetNavn} fejl={vis("navn")} />
          <Felt id="nk-id" label="Kunde-id" kraevet vaerdi={f.id}
                saet={(v) => { saetIdRoert(true); saetF((x) => ({ ...x, id: v })); saetSvar(null); }}
                fejl={vis("id")}
                hint="Permanent. Står i hver sti under tenants/ og kan ikke laves om." />
          <Felt id="nk-cvr" label="CVR" vaerdi={f.cvr}
                saet={(v) => saetF((x) => ({ ...x, cvr: v }))} fejl={vis("cvr")}
                hint="Otte cifre. Valgfrit." />
        </Feltraekke>

        <p className="fc-hint" style={{ marginTop: 4 }}><b>Moduler</b></p>
        <div className="fc-grid" style={{ gap: 6 }}>
          {VALGFRIE_MODULER.map((m) => (
            <label key={m} className="fc-med-ikon" style={{ gap: 8 }}>
              <input type="checkbox" checked={moduler.includes(m)}
                     onChange={() => saetModulerVal((v) =>
                       v.includes(m) ? v.filter((x) => x !== m) : [...v, m])} />
              <span><b>{MODUL[m].label}</b> <span className="fc-hint">{MODUL[m].hvad}</span></span>
            </label>
          ))}
        </div>

        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>Der seedes ingen data.</b> Kunden får et tomt system — det er
          meningen. Han skal taste den første bil ind og se hvad tomme
          tilstande faktisk siger.
        </p>
      </Formular>
    </Kort>
  );
}

/* ---- Skærmen ----------------------------------------------------------- */

export default function Konsol({ bruger }) {
  const [kunder, saetKunder] = useState(null);
  const [fejl, saetFejl] = useState(null);
  const [ny, saetNy] = useState(false);
  const [aabenId, saetAabenId] = useState(null);

  const genindlaes = async () => {
    try { saetKunder(await hentKunder()); saetFejl(null); }
    catch (e) { saetFejl(e); saetKunder([]); }
  };

  useEffect(() => { genindlaes(); }, []);

  if (kunder === null) return <Henter hvad="kunderne" />;

  const aktive = kunder.filter((k) => (k.abonnement?.status || "aktiv") === "aktiv");
  const lukkede = kunder.filter((k) => (k.abonnement?.status || "aktiv") !== "aktiv");
  const aaben = kunder.find((k) => k.id === aabenId) || null;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Kunder" vaerdi={num(kunder.length)} />
        <KpiKort label="Aktive" vaerdi={num(aktive.length)} />
        <KpiKort label="Lukkede" vaerdi={num(lukkede.length)}
                 note={lukkede.length ? "på pause eller opsagt" : "ingen"} />
      </KpiRaekke>

      {fejl && (
        <div className="fc-empty fc-empty-bad">
          <p><b>Kundelisten kunne ikke hentes.</b></p>
          <p className="fc-hint" style={{ marginTop: 6 }}>
            Har kontoen udbyderadgang? Den gives med <code>npm run ejer:giv</code>{" "}
            og kan ikke sættes herfra — se beslutning 35.
          </p>
          <Knap onClick={genindlaes}>Prøv igen</Knap>
        </div>
      )}

      {ny
        ? <Nykunde paaLuk={() => saetNy(false)}
                   paaOprettet={(id) => { saetNy(false); saetAabenId(id); genindlaes(); }} />
        : null}

      <Kort
        titel={`Kunder (${num(kunder.length)})`}
        handling={
          <span className="fc-med-ikon" style={{ gap: 10 }}>
            {/* ⚠ KONSOLLEN HAR INGEN SIDEBAR (beslutning 35: en ejer staar
                ikke i en kundekontekst), saa uden det her link findes
                prisskaermen kun for den der kender adressen. */}
            <Link className="fc-a" to="/main/priser">Priser &amp; fakturagrundlag →</Link>
            <Knap variant="primaer" onClick={() => saetNy(true)}>Ny kunde</Knap>
          </span>
        }
      >
        <Tabel
          kolonner={[
            { key: "navn", label: "Virksomhed",
              render: (k) => <b>{k.virksomhed?.navn || k.id}</b> },
            { key: "id", label: "Kunde-id", render: (k) => <code>{k.id}</code> },
            { key: "cvr", label: "CVR", render: (k) => k.virksomhed?.cvr || "—" },
            { key: "status", label: "Abonnement",
              render: (k) => <Statuspille abonnement={k.abonnement} /> },
            { key: "moduler", label: "Moduler", render: (k) => (
                <span className="fc-hint">
                  {VALGFRIE_MODULER.filter((m) => harModul(k.moduler, m) && k.moduler)
                    .map((m) => MODUL[m].label).join(", ") || "kun basen"}
                </span>
              ) },
            { key: "oprettet", label: "Oprettet", render: (k) => dato(k.oprettetMs) },
            { key: "handling", label: "", render: (k) => (
                <Knap onClick={() => saetAabenId(aabenId === k.id ? null : k.id)}>
                  {aabenId === k.id ? "Luk" : "Åbn"}
                </Knap>
              ) },
          ]}
          raekker={kunder}
          tom="Ingen kunder endnu. Opret den første ovenfor."
        />
      </Kort>

      {aaben && (
        <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
          <Kort titel={`Moduler & rabat — ${aaben.virksomhed?.navn || aaben.id}`}>
            <Moduler kunde={aaben} paaGemt={genindlaes} />
          </Kort>
          <div className="fc-grid" style={{ gap: 16 }}>
            {/* ⚠ SIDE OM SIDE, IKKE STABLET. De to er begge korte — to felter
                og ét felt — og stablet skubbede de "Første administrator" så
                langt ned at man skulle rulle for at finde den knap man leder
                efter på en ny kunde. */}
            <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
              <Kort titel="Abonnement">
                <Abonnement kunde={aaben} paaGemt={genindlaes} />
              </Kort>
              <Kort titel="Rabat på alt">
                <Rabat kunde={aaben} paaGemt={genindlaes} />
              </Kort>
            </Gitter>
            <Kort titel="Første administrator">
              <Foersteadmin kunde={aaben} />
            </Kort>
          </div>
        </Gitter>
      )}

      <p className="fc-hint">
        Konsollen skriver ikke selv — alt går gennem fire Cloud Functions med
        et ejertjek som første handling, og kundeposten er <b>.write: false</b>{" "}
        også for en ejer. Hver handling står i <b>kundens</b> auditlog, ikke i
        en ejerlog: det er hans abonnement. Se beslutning 34.
      </p>
    </div>
  );
}
