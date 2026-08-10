/* src/moduler/indkoeb/Oversigt.jsx
 * Indkøb & vareforbrug
 *
 * ⚠ PRISER I ØRE. Mockuppen viste 18,50 kr/stk — det er `1850`, ikke `18.5`.
 * En float her ender som 1849,999 i en sum over hundrede linjer, og
 * afstemningen mod leverandørens faktura går ikke op med en øre ingen kan
 * forklare. Beslutning 2.
 *
 * ⚠ LINJENS BELØB BEREGNES af antal × pris og gemmes ikke. To kilder til det
 * samme tal kan drive fra hinanden, og så mangler en post uden at totalen
 * afslører det.
 *
 * ⚠ DIVISION ER PÅKRÆVET. Reglerne validerer hasChildren(['division']) på
 * indkoeb/$id. Værdien kan IKKE arves fra køretøjet — beslutning 19 forbyder
 * feltet dér — så den der registrerer, skal sætte den. Kolonnen står derfor
 * eksplicit i tabellen frem for at blive udledt.
 *
 * ⚠ LEVERANDØREN ER EN ENTITET. Posterne bærer `leverandoerId`, ikke en
 * fritekststreng. Modellen har hele tiden indekseret feltet — se
 * fleet/leverandoerer.js.
 *
 * FASE 0: VISNING. Ingen skrivning.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, dato } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Knap, Gitter, MiniLinje,
} from "../../fleet/ui.jsx";
import {
  LEVERANDOER_KATEGORI, AFTALETYPE, FAKTURASTATUS, leverandoerNavn,
} from "../../fleet/leverandoerer.js";
import {
  DEMO_LEVERANDOERER, DEMO_INDKOEBSLINJER, linjeBeloebOere, demoLeverandoer,
} from "../../fleet/demo-indkoeb.js";
import { demoLokation } from "../../fleet/demo-facility.js";

const DIVISIONER = { gods: "Gods", bus: "Bus", faelles: "Fælles" };
const lvNavn = (id) => leverandoerNavn(DEMO_LEVERANDOERER, id);

export default function IndkoebOversigt() {
  const { kpi: k, henter, fejl, tilstand, genindlaes } = useKpi();
  const { bruger, division } = useFleet();
  const [kategori, setKategori] = useState("");
  const [status, setStatus] = useState("");

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;

  const maaSkrive = harPerm(bruger?.perms, PERM.indkoebSkriv);

  /* Samme visningsregel som useListe: valgt division plus fælles. */
  const iDivision = DEMO_INDKOEBSLINJER.filter(
    (l) => l.division === division || l.division === "faelles"
  );
  const viste = iDivision.filter(
    (l) => (!kategori || l.kategori === kategori) && (!status || l.fakturastatus === status)
  );

  /* Beregnet af den viste liste — ikke et nøgletal. Labelen siger hvilket
     udsnit, så det ikke går op mod kpi/. */
  const vistForbrugOere = viste.reduce((s, l) => s + linjeBeloebOere(l), 0);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Åbne indkøb" vaerdi={num(k.indkoeb.aabneOrdrer)} />
        <KpiKort label="Varer til godkendelse" vaerdi={num(k.indkoeb.varerTilGodkendelse)} />
        <KpiKort label="Mangler faktura" vaerdi={num(k.indkoeb.manglerFaktura)} />
        <KpiKort label="Månedens forbrug" vaerdi={kr(k.indkoeb.maanedensForbrugOere)}
                 note="ekskl. moms" />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort
        titel="Registrerede indkøb"
        handling={
          <Knap variant="primaer" disabled
                title={maaSkrive ? "Registrering er ikke bygget endnu (fase 0)."
                                 : `Kræver ${PERM.indkoebSkriv}.`}>
            Registrér indkøb
          </Knap>
        }
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <div className="fc-felt" style={{ flex: "0 1 240px", marginBottom: 0 }}>
            <label htmlFor="ik-kat">Kategori</label>
            <select id="ik-kat" value={kategori} onChange={(e) => setKategori(e.target.value)}>
              <option value="">Alle kategorier</option>
              {Object.entries(LEVERANDOER_KATEGORI).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="fc-felt" style={{ flex: "0 1 240px", marginBottom: 0 }}>
            <label htmlFor="ik-status">Fakturastatus</label>
            <select id="ik-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Alle</option>
              {Object.entries(FAKTURASTATUS).map(([v, s]) => (
                <option key={v} value={v}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <Tabel
          kolonner={[
            { key: "dato", label: "Dato", render: (r) => dato(r.dato) },
            { key: "vare", label: "Vare", render: (r) => <b>{r.vare}</b> },
            { key: "kategori", label: "Kategori", render: (r) => LEVERANDOER_KATEGORI[r.kategori] },
            { key: "leverandoerId", label: "Leverandør", render: (r) => lvNavn(r.leverandoerId) },
            { key: "antal", label: "Antal", num: true,
              render: (r) => `${num(r.antal)} ${r.enhed}` },
            /* 18,50 kr/stk = 1850 øre. To decimaler, fordi enhedspriser er små. */
            { key: "prisPrEnhedOere", label: "Pris pr. enhed", num: true,
              render: (r) => kr(r.prisPrEnhedOere, 2) },
            /* BEREGNET — der findes intet gemt beløb på linjen. */
            { key: "beloeb", label: "Beløb", num: true,
              render: (r) => kr(linjeBeloebOere(r)) },
            { key: "lokationId", label: "Lokation",
              render: (r) => demoLokation(r.lokationId)?.navn || <span className="fc-neutral">—</span> },
            /* Division står eksplicit — den kan ikke arves fra bilen. */
            { key: "division", label: "Division",
              render: (r) => <Pille tone="info">{DIVISIONER[r.division]}</Pille> },
            { key: "fakturastatus", label: "Faktura",
              render: (r) => <Pille tone={FAKTURASTATUS[r.fakturastatus]?.pill}>
                {FAKTURASTATUS[r.fakturastatus]?.label}</Pille> },
            { key: "godkendtAf", label: "Godkendt af",
              render: (r) => (r.godkendtAf
                ? <>{r.godkendtAf} <span className="fc-neutral">· {dato(r.godkendtMs)}</span></>
                : <span className="fc-neutral">ikke godkendt</span>) },
          ]}
          raekker={viste}
          tom="Ingen indkøb passer på filtrene."
        />

        <p className="fc-hint" style={{ marginTop: 12 }}>
          Viser {num(viste.length)} af {num(iDivision.length)} hentede linjer i{" "}
          <b>{division}</b> til <b>{kr(vistForbrugOere)}</b> ekskl. moms. Det er det{" "}
          <b>viste udsnit</b> — månedens forbrug øverst kommer fra <code>kpi/</code> og
          dækker hele perioden. De to skal ikke gå op mod hinanden.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Beløbet pr. linje <b>beregnes</b> af antal × pris pr. enhed og gemmes ikke.
          Prisen står i <b>hele øre</b> — 18,50 kr/stk er <code>1850</code>. En float
          ville blive 1849,999 i en sum, og så går afstemningen ikke op med en øre
          ingen kan forklare.
        </p>
      </Kort>

      <Leverandoerkartotek division={division} />
    </div>
  );
}

/* ---- Leverandøren som entitet ------------------------------------------ */

function Leverandoerkartotek({ division }) {
  const viste = DEMO_LEVERANDOERER.filter(
    (l) => l.division === division || l.division === "faelles"
  );

  return (
    <Kort
      titel="Leverandører"
      handling={<Link className="fc-a" to="/indkoeb/leverandoerer">Se alle og performance</Link>}
    >
      <Tabel
        kolonner={[
          { key: "navn", label: "Leverandør", render: (r) => <b>{r.navn}</b> },
          { key: "cvr", label: "CVR" },
          { key: "kategori", label: "Kategori", render: (r) => LEVERANDOER_KATEGORI[r.kategori] },
          { key: "aftale", label: "Aftale",
            render: (r) => <Pille tone={AFTALETYPE[r.aftale.type]?.forventerFastPris ? "ok" : "info"}>
              {AFTALETYPE[r.aftale.type]?.label}
              {r.aftale.rabatPct ? ` · ${r.aftale.rabatPct} %` : ""}
            </Pille> },
          { key: "division", label: "Division",
            render: (r) => <Pille tone="info">{DIVISIONER[r.division]}</Pille> },
          { key: "kontaktEmail", label: "Kontakt",
            render: (r) => <a className="fc-a" href={`mailto:${r.kontaktEmail}`}>{r.kontaktEmail}</a> },
          { key: "aktiv", label: "Status",
            render: (r) => (r.aktiv ? <Pille tone="ok">Aktiv</Pille> : <Pille tone="bad">Inaktiv</Pille>) },
        ]}
        raekker={viste}
        tom="Ingen leverandører i divisionen."
      />

      <p className="fc-hint" style={{ marginTop: 12 }}>
        <b>Leverandøren er en entitet</b> — reglerne har hele tiden indekseret{" "}
        <code>leverandoerId</code> på både <code>indkoeb</code> og{" "}
        <code>fakturaer</code>, men noden fandtes ikke. Imens stod navnene som
        fritekst i tre demo-filer med hver sin stavemåde at drive med.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        <b>Division er tilladt her</b>, modsat på personale og køretøjer. Prøven er
        om feltet beskriver <b>leverandørens forretning</b> eller <b>vores
        organisation</b>: Mercedes Greve er et lastbilværksted, Crawford leverer
        porte til begge. Det er samme begrundelse som <code>faelles</code> på kunder
        — beslutning 19.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        Leverandørens e-mail bliver <b>startlisten af parter</b> på en sag
        (beslutning 20). Derefter ejer sagen listen: en frigivelse fra karantæne
        tilføjer til <b>sagen</b>, aldrig til kartoteket — ellers ville ét klik åbne
        for alle fremtidige sager.
      </p>
    </Kort>
  );
}
