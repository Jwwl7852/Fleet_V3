/* src/moduler/indkoeb/Fakturaer.jsx
 * Fakturagodkendelse & afstemning
 *
 * TRE FEJL FRA MOCKUPPEN, ALLE LUKKET STRUKTURELT FREM FOR RETTET.
 *
 * ⚠ 1. AFSTEMNINGEN ER IKKE EN SUBTRAKTION.
 * Mockuppen skrev "9.842.250 − 9.781.625 = 9.765.125". Det er tre UAFHÆNGIGE
 * opgørelser stillet op som om den ene fulgte af de to andre:
 *
 *   registrerede   vores egne indkøbsregistreringer
 *   modtagne       leverandørernes fakturaer
 *   bogførte       regnskabssystemets opgørelse
 *
 * At bogført er en selvstændig kilde er hele grunden til at de tre kan være
 * uenige. Beregnede vi den af de andre, ville afstemningen altid gå op.
 *
 * De to afvigelser får HVERT SIT NAVN, fordi de kræver hver sin handling —
 * en afvigelse man ikke kan handle på, er et tal og ikke en oplysning:
 *
 *   manglendeFakturaerOere  60.625 kr  → ryk leverandøren
 *   ikkeBogfoertOere        16.500 kr  → bogfør fakturaen
 *
 * ⚠ 2. ANTALLET BEREGNES AF LISTEN.
 * KPI-kortet sagde 8 afstemningsafvigelser, tabellen 16 (8+5+3). Tallet er
 * AFLEDT af data skærmen allerede viser, så det hører ikke i kpi/ — det er
 * samme sag som aktive klimaalarmer og bemanding.ledig. Det beregnes af den
 * samme liste tabellen render, og labelen siger hvilket udsnit.
 *
 * ⚠ 3. BELØB EKSKL. MOMS PLUS momsOere.
 * Mockuppen viste ét beløb inkl. moms. Blandes de to, lægges inkl.-tal sammen
 * med ekskl.-tal i en rapport (beslutning 2). Totalen beregnes.
 *
 * ⚠ OG EN FJERDE, FUNDET UNDERVEJS: skelettet hardkodede 21 "fakturaer til
 * godkendelse", mens kpi.indkoeb.fakturaerTilGodkendelse er 7 — og Dashboard
 * viser de 7. To skærme, samme label, forskellige tal. Feltet læses nu.
 *
 * FASE 0: fakturaer/ er .write: false. Godkend-knappen viser hvad den VILLE
 * gøre via kanGodkende(), som Forslag-skærmen gør med kanSkifte().
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, dato, deviation } from "../../fleet/format.js";
import { harPerm } from "../../fleet/permissions.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Knap, Gitter, MiniLinje,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  FAKTURASTATUS, leverandoerNavn, fakturaTotalOere, kanGodkende,
  PERM_GODKEND_MIDLERTIDIG,
} from "../../fleet/leverandoerer.js";
import {
  DEMO_LEVERANDOERER, DEMO_FAKTURAER, demoAfstemning, demoUdenMatch,
} from "../../fleet/demo-indkoeb.js";

const lvNavn = (id) => leverandoerNavn(DEMO_LEVERANDOERER, id);

export default function Fakturaer() {
  const { kpi: k, henter, fejl, tilstand, genindlaes } = useKpi();
  const { bruger } = useFleet();
  const [valgtId, setValgtId] = useState(null);

  if (henter) return <Henter hvad="fakturaer" />;
  /* ⚠ INGEN BLOKERING PÅ MANGLENDE NØGLETAL. En ny kunde har ingen
     aggregerede tal, og skal alligevel kunne bruge skærmen — knappen der
     opretter hans første post sidder på en af dem. Se blokerer(). */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  const maaGodkende = harPerm(bruger?.perms, PERM_GODKEND_MIDLERTIDIG);
  const valgt = DEMO_FAKTURAER.find((f) => f.id === valgtId) || null;

  /* BEREGNET af listen — ikke et gemt tal. Det var fejl 2. */
  const udenMatch = demoUdenMatch();
  const tilGodkendelse = DEMO_FAKTURAER.filter((f) => f.status === "modtaget");
  const godkendtDenneMaaned = DEMO_FAKTURAER.filter(
    (f) => f.status === "godkendt" || f.status === "bogfoert"
  );

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {k && (
        <KpiRaekke>
          {/* Feltet fra kpi/, ikke et hardkodet 21. Dashboard viser samme tal. */}
          <KpiKort label="Fakturaer til godkendelse" vaerdi={num(k.indkoeb.fakturaerTilGodkendelse)} />
          {/* AFLEDT af den viste liste. Labelen siger det. */}
          <KpiKort label="Manglende match" vaerdi={num(udenMatch.length)} note="i de hentede" />
          <KpiKort label="Godkendt denne måned" vaerdi={num(k.indkoeb.godkendtDenneMaaned)} />
          <KpiKort label="Indkøbsprisafvigelse"
                   vaerdi={deviation(k.indkoeb.indkoebsprisafvigelseSnitPct,
                     { betterWhen: "lower", unit: "pct" }).text}
                   note="snit, leverandørsiden" />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Afstemning />

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort titel={`Fakturaer (${DEMO_FAKTURAER.length})`}>
          <Tabel
            kolonner={[
              { key: "fakturanummer", label: "Fakturanr.", render: (r) => <b>{r.fakturanummer}</b> },
              { key: "leverandoerId", label: "Leverandør", render: (r) => lvNavn(r.leverandoerId) },
              { key: "fakturadatoMs", label: "Dato", render: (r) => dato(r.fakturadatoMs) },
              { key: "forfaldMs", label: "Forfald", render: (r) => dato(r.forfaldMs) },
              /* TO KOLONNER, aldrig ét inkl.-beløb. */
              { key: "beloebOere", label: "Ekskl. moms", num: true, render: (r) => kr(r.beloebOere) },
              { key: "momsOere", label: "Moms", num: true, render: (r) => kr(r.momsOere) },
              { key: "total", label: "Total", num: true, render: (r) => kr(fakturaTotalOere(r)) },
              { key: "indkoebId", label: "Match", render: (r) => (r.indkoebId
                  ? <Pille tone="ok">Matchet</Pille>
                  : <Pille tone="warn">Intet match</Pille>) },
              /* Beslutning 20: sporet tilbage til den tråd der aftalte arbejdet. */
              { key: "sagsnummer", label: "Sag", render: (r) => (r.sagsnummer
                  ? <Link className="fc-a" to="/flaade/vaerksted"><code>{r.sagsnummer}</code></Link>
                  : <span className="fc-neutral">—</span>) },
              { key: "status", label: "Status",
                render: (r) => <Pille tone={FAKTURASTATUS[r.status]?.pill}>
                  {FAKTURASTATUS[r.status]?.label}</Pille> },
              { key: "vaelg", label: "", render: (r) => (
                  <Knap onClick={() => setValgtId(r.id)} disabled={r.id === valgtId}>
                    {r.id === valgtId ? "Vist" : "Vis"}
                  </Knap>) },
            ]}
            raekker={DEMO_FAKTURAER}
            tom="Ingen fakturaer."
          />

          <p className="fc-hint" style={{ marginTop: 12 }}>
            <b>{num(udenMatch.length)}</b> fakturaer mangler match mod et registreret
            indkøb, <b>{num(tilGodkendelse.length)}</b> afventer godkendelse, og{" "}
            <b>{num(godkendtDenneMaaned.length)}</b> er godkendt eller bogført.
            Tallene er <b>beregnet af listen ovenfor</b> — mockuppens KPI-kort sagde 8
            mens tabellen sagde 16, fordi de var to kilder til samme tal.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Beløbet står som <b>beloebOere ekskl. moms</b> med <b>momsOere</b> ved
            siden af. Totalen beregnes — ét felt med moms indeni ville betyde at en
            rapport lægger inkl.-tal sammen med ekskl.-tal.
          </p>
        </Kort>

        <Godkendelse faktura={valgt} maaGodkende={maaGodkende} rolle={bruger?.rolle} />
      </Gitter>
    </div>
  );
}

/* ---- Tre totaler, to navngivne afvigelser ------------------------------ */

function Afstemning() {
  const a = demoAfstemning();

  return (
    <Kort titel="Afstemning">
      <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
        <div>
          {/* TRE UAFHÆNGIGE OPGØRELSER — ikke et regnestykke. */}
          <MiniLinje label="Registrerede indkøb" vaerdi={<b>{kr(a.registreredeIndkoebOere)}</b>} />
          <MiniLinje label="Modtagne fakturaer" vaerdi={<b>{kr(a.modtagneFakturaerOere)}</b>} />
          <MiniLinje label="Bogført i regnskabet" vaerdi={<b>{kr(a.bogfoertOere)}</b>} />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Tre <b>uafhængige</b> opgørelser. Mockuppen skrev dem som
            "9.842.250 − 9.781.625 = 9.765.125", men bogført er regnskabets egen
            optælling og ikke afledt af de to andre — det er netop derfor de kan
            være uenige.
          </p>
        </div>

        <div>
          {/* HVER AFVIGELSE MED SIT EGET NAVN OG SIN EGEN HANDLING. */}
          <div className="fc-linje">
            <span>
              <b>Manglende fakturaer</b>
              <br /><span className="fc-hint">registrerede − modtagne · ryk leverandøren</span>
            </span>
            <b className={deviation(a.manglendeFakturaerOere, { betterWhen: "lower" }).tone === "bad"
              ? "fc-bad" : ""}>{kr(a.manglendeFakturaerOere)}</b>
          </div>
          <div className="fc-linje">
            <span>
              <b>Ikke bogført</b>
              <br /><span className="fc-hint">modtagne − bogførte · bogfør fakturaen</span>
            </span>
            <b className="fc-bad">{kr(a.ikkeBogfoertOere)}</b>
          </div>

          <p className="fc-hint" style={{ marginTop: 12 }}>
            To afvigelser, to navne, <b>to forskellige handlinger</b>. Ét felt der hed
            "afvigelse" ville blive læst som ét tal, og så handler ingen på nogen af
            dem — det er beslutning 11 og 14 om igen.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Begge beregnes af de tre totaler og gemmes ikke.
          </p>
        </div>
      </Gitter>
    </Kort>
  );
}

/* ---- Godkendelse: hvad knappen VILLE gøre ------------------------------ */

function Godkendelse({ faktura, maaGodkende, rolle }) {
  if (!faktura) {
    return (
      <Kort titel="Godkendelse">
        <Tom>Vælg en faktura for at se hvad godkendelsen ville gøre.</Tom>
      </Kort>
    );
  }

  const svar = kanGodkende(faktura, maaGodkende);
  const manglerPerm = !maaGodkende;

  return (
    <Kort titel={`Godkendelse — rolle: ${rolle || "ukendt"}`}>
      <MiniLinje label="Faktura" vaerdi={<b>{faktura.fakturanummer}</b>} />
      <MiniLinje label="Leverandør" vaerdi={lvNavn(faktura.leverandoerId)} />
      <MiniLinje label="Ekskl. moms" vaerdi={kr(faktura.beloebOere)} />
      <MiniLinje label="Moms" vaerdi={kr(faktura.momsOere)} />
      <div className="fc-sum">
        <span>Total inkl. moms</span>
        <span className="fc-sum-v">{kr(fakturaTotalOere(faktura))}</span>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "14px 0", flexWrap: "wrap" }}>
        <Knap variant="primaer" disabled
              title={`fakturaer/ er .write: false — godkendelse skrives af en Cloud Function.`}>
          Godkend
        </Knap>
        <Knap disabled title="Skrivning er ikke bygget endnu (fase 0).">Afvis</Knap>
      </div>

      <MiniLinje label="kanGodkende()" vaerdi={svar.ok
        ? <Pille tone="ok">ok</Pille>
        : <Pille tone="bad">afvist</Pille>} />
      {!svar.ok && (
        <p className={`fc-hint ${manglerPerm ? "fc-bad" : ""}`} style={{ marginTop: 8 }}>
          {svar.aarsag}
        </p>
      )}

      <p className="fc-hint" style={{ marginTop: 12 }}>
        Knappen bruger <code>{PERM_GODKEND_MIDLERTIDIG}</code> — <b>midlertidigt</b>.
        Der findes ingen <code>fakturaer.godkend</code>, fordi noden er{" "}
        <b>.write: false</b> og der derfor ikke har været noget at kontrollere.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        <b>Den skal skilles ud, når reglerne åbnes.</b> At godkende en faktura er en
        anden handling end at registrere et indkøb: den der bestiller varen, og den
        der godkender regningen, er i en virksomhed med adskilte funktioner{" "}
        <b>bevidst to personer</b>. Deler de én permission, kan samme medarbejder
        bestille hos sin svoger og godkende sin egen faktura. Det er nøjagtig samme
        argument som beslutning 5 —{" "}
        <Link className="fc-a" to="/booking/forslag/bk-2026-00314">disponent og
        koordinator</Link>.
      </p>
    </Kort>
  );
}
