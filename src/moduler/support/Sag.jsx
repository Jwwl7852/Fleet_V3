/* src/moduler/support/Sag.jsx
 * Supportsagen
 *
 * ⚠ AKTIVITETSLOGGEN ER ET UDTRÆK, IKKE EN ADGANG — BESLUTNING 24.
 *
 * Beslutning 23 sagde at sagen skulle "vise kundens auditlog". Læst som
 * skrevet ville det have betydet at support kunne læse auditloggen, og den er
 * SELV følsom: den afslører hvilke kunder der bliver kigget på, og af hvem.
 * I praksis permanent læseadgang til alle tenants' logge — det stik modsatte
 * af hvad 23 skulle opnå.
 *
 * Rettelsen: en Cloud Function henter posterne for ÉN bruger i et FAST vindue
 * omkring fejltidspunktet og skriver dem PÅ SAGEN. Support læser sagen, aldrig
 * audit/. Grænsen er ±5 minutter og højst 50 poster, og den kan ikke sættes af
 * support selv — et loft der kan hæves af den der rammer det, er ikke et loft.
 *
 * ⚠ INGEN AI-DIAGNOSE. Der er ingen model. En "sandsynlig årsag" med 76 % er
 * et tal en supporter handler på, og det ville være opdigtet. Samme grund som
 * leverandørstjernerne blev droppet: en score må kun findes hvis beregningen
 * kan vises. Checklisten er menneskeskrevet og udgiver sig ikke for andet.
 *
 * FASE 0: VISNING. Ingen beskeder sendes, ingen adgang bevilges.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, datoTid, klokke } from "../../fleet/format.js";
import {
  Kort, Tom, Tabel, Pille, Knap, Gitter, MiniLinje, Fejl,
} from "../../fleet/ui.jsx";
import {
  SUPPORT_KATEGORI, SUPPORT_PRIORITET, SUPPORT_STATUS, SUPPORT_KONTEKST,
  KONTEKSTFELTER, AUDITUDTRAEK, ADGANG_VARIGHED, ADGANG_TYPE,
  maaLaeseSag, harSupportPerm, kanGiveAdgang, byggBevilling,
  adgangAktiv, adgangResterendeMin,
  PERM_SUPPORT_LAES, PERM_SUPPORT_SKRIV, PERM_ADGANG_GIV,
} from "../../fleet/support.js";
import {
  DEMO_SUPPORTSAGER, DEMO_TENANTS, demoSupportsag, demoBeskeder,
  demoBevilling, demoUdtraek,
} from "../../fleet/demo-support.js";

export default function Supportsag() {
  const { id } = useParams();
  const { bruger } = useFleet();
  const sag = demoSupportsag(id) || DEMO_SUPPORTSAGER[0] || null;

  if (!sag) {
    return <Kort titel="Supportsag"><Tom>Ingen sag valgt.</Tom></Kort>;
  }

  /* SAMME funktion som reglen bruger. Skærmen kan ikke vise mere end serveren
     ville give. */
  if (!maaLaeseSag(sag, bruger)) {
    return (
      <div className="fc-grid" style={{ gap: 16 }}>
        <Kort titel="Ingen adgang til denne sag">
          <Tom>
            Sagen ligger i tenanten <b>{DEMO_TENANTS[sag.tenantId] || sag.tenantId}</b>,
            og dit claim hører til en anden. Du har heller ikke{" "}
            <b>{PERM_SUPPORT_LAES}</b>.
          </Tom>
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Det er tenant-isolationen: reglen på den enkelte sag sammenligner sagens{" "}
            <b>tenantId</b> med dit claim, og en kunde kan derfor aldrig læse en
            anden kundes sag.{" "}
            <Link className="fc-a" to="/support">Tilbage til Hjælp &amp; Support</Link>.
          </p>
        </Kort>
      </div>
    );
  }

  const beskeder = demoBeskeder(sag.id);
  const udtraek = demoUdtraek(sag);
  const bevilling = demoBevilling(sag.id);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort
        titel={`${sag.nummer} · ${sag.emne}`}
        handling={<Pille tone={SUPPORT_STATUS[sag.status]?.pill}>
          {SUPPORT_STATUS[sag.status]?.label}</Pille>}
      >
        <p className="fc-hint">
          {DEMO_TENANTS[sag.tenantId] || sag.tenantId} · oprettet af {sag.oprettetAf} ·{" "}
          {datoTid(sag.oprettetMs)}
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,1.4fr) minmax(0,1fr)">
        <div className="fc-grid">
          <Traad sag={sag} beskeder={beskeder} bruger={bruger} />
          <Aktivitetslog sag={sag} udtraek={udtraek} />
        </div>

        <div className="fc-grid">
          <Sagsoversigt sag={sag} />
          <Checkliste sag={sag} />
          <Adgangspanel sag={sag} bruger={bruger} bevilling={bevilling} />
        </div>
      </Gitter>
    </div>
  );
}

/* ---- Kommunikation ----------------------------------------------------- */

function Traad({ sag, beskeder, bruger }) {
  const [svar, setSvar] = useState("");
  const maaSkrive = harSupportPerm(bruger, PERM_SUPPORT_SKRIV);

  return (
    <Kort titel={`Kommunikation (${beskeder.length})`}>
      <div className="fc-traad">
        {beskeder.map((b) => (
          <article key={b.id}
                   className={`fc-besked ${b.fra === "support" ? "fc-besked-ud" : "fc-besked-ind"}`}>
            <header className="fc-besked-h">
              <Pille tone={b.fra === "support" ? "info" : "ok"}>
                {b.fra === "support" ? "FleetControl" : "Kunde"}
              </Pille>
              <span className="fc-besked-hvem">{b.navn}</span>
              <span className="fc-besked-tid">{datoTid(b.ms)}</span>
            </header>
            <div className="fc-besked-b">{b.tekst}</div>
            {b.vedhaeftning && (
              <div className="fc-besked-emne">
                📎 {b.vedhaeftning} <Pille tone="warn">Afventer scanning</Pille>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="fc-felt" style={{ marginTop: 14 }}>
        <label htmlFor="sup-svar">Svar til kunden</label>
        <textarea id="sup-svar" rows={3} value={svar} onChange={(e) => setSvar(e.target.value)}
                  placeholder="Skriv et svar…" />
      </div>
      <Knap variant="primaer" disabled
            title={maaSkrive ? "Afsendelse er ikke bygget endnu (fase 0)."
                             : `Kræver ${PERM_SUPPORT_SKRIV}.`}>
        Send svar
      </Knap>
      <p className="fc-hint" style={{ marginTop: 10 }}>
        Vedhæftninger scannes før de gemmes, og der tegnes intet downloadlink før
        de er rene — samme regel som på sagstråden i beslutning 20.
      </p>
    </Kort>
  );
}

/* ---- Aktivitetsloggen: udtrækket --------------------------------------- */

function Aktivitetslog({ sag, udtraek }) {
  if (!sag.fejlMs) {
    return (
      <Kort titel="Kundens aktivitet omkring fejlen">
        <Tom>
          Sagen har intet fejltidspunkt, og der kan derfor ikke laves et udtræk.
          Et vindue skal have et midtpunkt.
        </Tom>
      </Kort>
    );
  }

  return (
    <Kort titel="Kundens aktivitet omkring fejlen">
      <Tabel
        kolonner={[
          { key: "ms", label: "Tid", render: (r) => klokke(r.ms) },
          { key: "handling", label: "Handling", render: (r) => <b>{r.handling}</b> },
          { key: "objekt", label: "Objekt", render: (r) => (
              <>{r.objekt}{r.objektId && <span className="fc-neutral"> · {r.objektId}</span>}</>) },
          { key: "aendrede", label: "Ændrede felter",
            render: (r) => (r.aendrede?.length
              ? r.aendrede.join(", ")
              : <span className="fc-neutral">—</span>) },
          { key: "resultat", label: "Resultat", render: (r) => (
              <Pille tone={r.resultat === "ok" ? "ok" : "bad"}>{r.resultat}</Pille>) },
        ]}
        raekker={udtraek.poster}
        noegle={(r, i) => `${r.ms}-${i}`}
        tom="Ingen poster i vinduet."
      />

      <p className="fc-hint" style={{ marginTop: 12 }}>
        <b>Det her er et udtræk, ikke en adgang.</b> Posterne er hentet for{" "}
        <b>én bruger</b> i vinduet{" "}
        <b>{klokke(udtraek.vindue.fra)}–{klokke(udtraek.vindue.til)}</b> —{" "}
        {AUDITUDTRAEK.minutterFoer} minutter før og {AUDITUDTRAEK.minutterEfter} efter
        fejltidspunktet, højst {num(AUDITUDTRAEK.maksPoster)} poster. Udtrækket ligger
        på sagen; support læser aldrig <code>audit/</code>.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        <b>Grænsen kan ikke sættes herfra.</b> Et vindue "omkring fejlen" bliver to
        timer den dag nogen har brug for lidt mere, og så er udtrækket de facto hele
        loggen for den bruger. Skal den ændres, er det en ændring i koden.
      </p>
      {udtraek.afkortet && (
        <Fejl>
          Udtrækket ramte loftet på {num(AUDITUDTRAEK.maksPoster)} poster og er
          afkortet. Det er ikke hele billedet.
        </Fejl>
      )}
      <p className="fc-hint" style={{ marginTop: 8 }}>
        Uden udtrækket ville de fleste sager kræve supportadgang. Det er hele
        pointen med beslutning 23: gør fejlsøgningen mulig uden at åbne kundens
        data.
      </p>
    </Kort>
  );
}

/* ---- Sagsoversigt ------------------------------------------------------ */

function Sagsoversigt({ sag }) {
  return (
    <Kort titel="Sagsoversigt">
      <MiniLinje label="Kunde" vaerdi={DEMO_TENANTS[sag.tenantId] || sag.tenantId} />
      <MiniLinje label="Kategori" vaerdi={SUPPORT_KATEGORI[sag.kategori]} />
      <MiniLinje label="Prioritet" vaerdi={
        <Pille tone={SUPPORT_PRIORITET[sag.prioritet]?.pill}>
          {SUPPORT_PRIORITET[sag.prioritet]?.label.split(" —")[0]}</Pille>} />
      <MiniLinje label="Ansvarlig" vaerdi={sag.ansvarlig || "ikke tildelt"} />

      <div style={{ borderTop: "1px solid var(--bc-line)", margin: "12px 0" }} />

      {/* Konteksten. Præcis allowlisten — hverken mere eller mindre. */}
      {KONTEKSTFELTER.map((f) => (
        <MiniLinje key={f} label={SUPPORT_KONTEKST[f]}
                   vaerdi={sag.kontekst?.[f] ?? <span className="fc-neutral">—</span>} />
      ))}

      <p className="fc-hint" style={{ marginTop: 12 }}>
        Det er hele konteksten. En supportsag er en <b>ny kanal ud af systemet</b>,
        så felterne er en <b>allowliste</b> og ikke en blokliste — passwords, tokens
        og værdier fra kundens felter kommer aldrig med.
      </p>
    </Kort>
  );
}

/* ---- Løsningsforslag --------------------------------------------------- */

function Checkliste({ sag }) {
  const klaret = sag.checkliste.filter((c) => c.klaret).length;
  return (
    <Kort titel={`Løsningsforslag (${klaret}/${sag.checkliste.length})`}>
      {sag.checkliste.map((c) => (
        <MiniLinje key={c.id} label={c.tekst}
                   vaerdi={c.klaret ? <Pille tone="ok">klaret</Pille>
                                    : <span className="fc-neutral">☐</span>} />
      ))}
      <p className="fc-hint" style={{ marginTop: 10 }}>
        Checklisten er <b>skrevet af et menneske</b>. Der er ingen model der
        foreslår en årsag, og derfor heller ingen procent — et tal en supporter
        ville handle på, skal kunne begrundes.
      </p>
    </Kort>
  );
}

/* ---- Supportadgang ----------------------------------------------------- */

function Adgangspanel({ sag, bruger, bevilling }) {
  const [varighed, setVarighed] = useState("t4");
  const [type, setType] = useState("readOnly");
  const [formaal, setFormaal] = useState("");

  const svar = kanGiveAdgang(bruger, sag);
  const aktiv = adgangAktiv(bevilling);

  let forhaandsvisning = null;
  if (svar.ok && formaal.trim()) {
    try { forhaandsvisning = byggBevilling({ sag, bruger, varighed, type, formaal }); }
    catch { /* ufuldstændig — knappen er alligevel slået fra */ }
  }

  return (
    <Kort
      titel="Supportadgang"
      handling={aktiv
        ? <Pille tone="warn">Aktiv · {num(adgangResterendeMin(bevilling))} min. tilbage</Pille>
        : <Pille tone="ok">Ingen adgang</Pille>}
    >
      <p className="fc-hint" style={{ marginBottom: 12 }}>
        FleetControl-personale har <b>ingen adgang</b> til kundens data som
        udgangspunkt. Kundens administrator bevilger den — tidsbegrænset, med et
        formål og et sagsnummer.
      </p>

      {bevilling && (
        <>
          <MiniLinje label="Givet af" vaerdi={bevilling.givetAf} />
          <MiniLinje label="Givet" vaerdi={datoTid(bevilling.givetMs)} />
          <MiniLinje label="Udløber" vaerdi={datoTid(bevilling.udloeberMs)} />
          <MiniLinje label="Type" vaerdi={ADGANG_TYPE[bevilling.type]?.label} />
          <MiniLinje label="Formål" vaerdi={bevilling.formaal} />
          <p className="fc-hint" style={{ marginTop: 8 }}>
            {aktiv
              ? "Adgangen udløber af sig selv — ikke fordi nogen husker at lukke den."
              : "Adgangen er udløbet. Bevillingen bliver stående som spor; den slettes ikke."}
          </p>
          <div style={{ borderTop: "1px solid var(--bc-line)", margin: "12px 0" }} />
        </>
      )}

      <Gitter kolonner="1fr 1fr">
        <div className="fc-felt">
          <label htmlFor="ad-var">Varighed</label>
          <select id="ad-var" value={varighed} onChange={(e) => setVarighed(e.target.value)}>
            {Object.entries(ADGANG_VARIGHED).map(([v, o]) => (
              <option key={v} value={v}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="fc-felt">
          <label htmlFor="ad-type">Adgangstype</label>
          <select id="ad-type" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(ADGANG_TYPE).map(([v, o]) => (
              <option key={v} value={v}>{o.label}</option>
            ))}
          </select>
        </div>
      </Gitter>
      <div className="fc-felt">
        <label htmlFor="ad-formaal">Formål *</label>
        <input id="ad-formaal" value={formaal} onChange={(e) => setFormaal(e.target.value)}
               placeholder="Hvad skal support undersøge?" />
      </div>

      <Knap variant="primaer" disabled
            title={svar.ok ? "Bevilling er ikke bygget endnu (fase 0)." : svar.aarsag}>
        Giv midlertidig adgang
      </Knap>

      <MiniLinje label="kanGiveAdgang()" vaerdi={svar.ok
        ? <Pille tone="ok">ok</Pille> : <Pille tone="bad">afvist</Pille>} />
      {!svar.ok && <p className="fc-hint fc-bad" style={{ marginTop: 8 }}>{svar.aarsag}</p>}

      {forhaandsvisning && (
        <p className="fc-hint" style={{ marginTop: 10 }}>
          Ville skrive: udløber <b>{datoTid(forhaandsvisning.udloeberMs)}</b>, type{" "}
          <code>{forhaandsvisning.type}</code>, sag <code>{forhaandsvisning.sagsnummer}</code>.
        </p>
      )}

      <p className="fc-hint" style={{ marginTop: 12 }}>
        <b>Support kan ikke give sig selv adgang.</b> Den der har brug for den, må
        ikke være den der bevilger den — samme argument som beslutning 5, hvor
        disponenten ikke godkender sit eget forslag.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        Kræver <code>{PERM_ADGANG_GIV}</code> hos kundens administrator. Hvem der
        åbnede hvad og hvornår, logges — og bevillingen udløber automatisk.
      </p>
    </Kort>
  );
}
