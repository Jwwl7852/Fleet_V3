/* src/moduler/facility/Servicekalender.jsx
 * Facility – servicekalender & reparationer
 *
 * SAMME GITTER SOM VÆRKSTEDSKALENDER OG DISPONERING. Rækkerne er lokationer
 * og aktiver i stedet for biler; alt andet er ens. Gitteret ligger i
 * fleet/Gitterkalender.jsx — byg ikke et fjerde.
 *
 * DEN FJERDE RESERVATIONSKILDE. "Reserveret fra sag #1245" i mockuppen er en
 * reservation med kilde `facilitySag` og prioritet 20 — samme node som
 * booking, værksted og fravær skriver til (beslutning 4). Den krævede INGEN
 * ny kode: reservationFraOpgave() giver den allerede, fordi et servicebesøg
 * er en opgave med art `facility` (beslutning 21).
 *
 * ⚠ ET BESØG UDEN aktivId SPÆRRER HELE LOKATIONEN. Lukker man hallen, er alle
 * porte i den også optaget — derfor er ressourcen `lokation` og ikke
 * `facilityAktiv`. De to er hver sin type i RESSOURCE.
 *
 * FASE 0: VISNING. Panelet viser hvad reservationen VILLE blive, som Værksted
 * og Fravær gør. Der skrives ingenting.
 *
 * FACILITY ER FÆLLES — skærmen reagerer ikke på Gods/Bus. Aktiverne er de
 * samme uanset hvem der kører gennem porten.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, dato, datoTid } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Fejl, Gitter, MiniLinje, Knap,
} from "../../fleet/ui.jsx";
import Gitterkalender from "../../fleet/Gitterkalender.jsx";
import { ENHED } from "../../fleet/gitter.js";
import { reservationFraOpgave } from "../../fleet/opgaver.js";
import { KILDE, prioritetFor, konfliktTekst } from "../../fleet/reservations.js";
import { AKTIV_ART, AKTIV_STATUS } from "../../fleet/facility.js";
import {
  DEMO_SERVICEBESOEG, DEMO_AKTIVER, DEMO_LOKATIONER, demoAktiv, demoLokation,
} from "../../fleet/demo-facility.js";

/* Leverandørnavnet slås op — posterne bærer et leverandoerId, ikke en
   fritekststreng. Fem filer havde hver sin stavemåde at drive med. */
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
const lvNavn = (id) => leverandoerNavn(DEMO_LEVERANDOERER, id);

const DAG = 86400000;
const VINDUE_DAGE = 10;

const BESOEG_TONE = { planlagt: "info", igang: "warn", udfoert: "ok" };

export default function Servicekalender() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  const [valgtId, setValgtId] = useState(null);

  const iDag = new Date(); iDag.setHours(0, 0, 0, 0);
  const vindueFra = iDag.getTime() - DAG;
  const vindueTil = vindueFra + VINDUE_DAGE * DAG;

  const iVindue = DEMO_SERVICEBESOEG.filter((b) => b.fra < vindueTil && vindueFra < b.til);

  /* Rækkerne er de RESSOURCER besøgene binder: et aktiv, eller en lokation når
     besøget spærrer hele stedet. Blandes de to, kan man ikke se at gulvarbejdet
     i Hal B lukker alle porte i hallen. */
  const raekker = useMemo(() => {
    const aktivIder = new Set(iVindue.filter((b) => b.aktivId).map((b) => b.aktivId));
    const lokIder = new Set(iVindue.filter((b) => !b.aktivId).map((b) => b.lokationId));
    return [
      ...DEMO_LOKATIONER.filter((l) => lokIder.has(l.id)).map((l) => ({
        id: l.id, label: l.navn, under: "Hele lokationen",
        pille: <Pille tone="warn">Lokation</Pille>,
      })),
      ...DEMO_AKTIVER.filter((a) => aktivIder.has(a.id)).map((a) => ({
        id: a.id, label: a.navn,
        under: `${AKTIV_ART[a.art]?.label} · ${demoLokation(a.lokationId)?.navn || ""}`,
        pille: <Pille tone={AKTIV_STATUS[a.status]?.pill}>{AKTIV_STATUS[a.status]?.label}</Pille>,
      })),
    ];
  }, [vindueFra, vindueTil]);

  const blokke = iVindue.map((b) => ({
    id: b.id,
    raekkeId: b.aktivId || b.lokationId,
    fra: b.fra, til: b.til,
    label: `${lvNavn(b.leverandoerId)}${b.sagsnummer ? ` · ${b.sagsnummer}` : ""}`,
    titel: b.beskrivelse,
    tone: BESOEG_TONE[b.status] || "info",
  }));

  if (henter) return <Henter hvad="servicekalenderen" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  const valgt = DEMO_SERVICEBESOEG.find((b) => b.id === valgtId) || null;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Planlagte besøg" vaerdi={num(k.facility.planlagtVedligehold)} />
        <KpiKort label="Eksterne leverandører" vaerdi={num(k.facility.eksterneLeverandoerer)} />
        <KpiKort label="Reserveret fra sager" vaerdi={num(k.facility.aabneSager)} />
        <KpiKort label="Anslået omkostning" vaerdi={kr(k.facility.anslaaetServiceOere)} note="ekskl. moms" />
      </KpiRaekke>

      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}

      <Kort titel={`Servicekalender · ${dato(vindueFra)} – ${dato(vindueTil - 1)}`}>
        <Gitterkalender
          raekker={raekker} blokke={blokke}
          fra={vindueFra} til={vindueTil} enhed={ENHED.dag}
          valgtId={valgtId} onVaelg={(b) => setValgtId(b.id === valgtId ? null : b.id)}
          tom="Ingen servicebesøg i perioden."
        />
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Rækkerne er de <b>ressourcer</b> besøgene binder. Et besøg uden et anlæg
          spærrer <b>hele lokationen</b> — gulvarbejdet i Hal B lukker også portene
          i hallen. Gitteret er det samme som Værkstedskalender og Disponering
          bruger.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
        <Reservationen besoeg={valgt} />
        <Kort titel="Servicebesøg">
          <Tabel
            kolonner={[
              { key: "fra", label: "Dato", render: (r) => dato(r.fra) },
              { key: "hvad", label: "Hvad", render: (r) => (
                  <b>{r.aktivId ? demoAktiv(r.aktivId)?.navn : demoLokation(r.lokationId)?.navn}</b>) },
              { key: "leverandoerId", label: "Leverandør", render: (r) => lvNavn(r.leverandoerId) },
              { key: "sagsnummer", label: "Sag", render: (r) => r.sagsnummer
                  ? <code>{r.sagsnummer}</code>
                  : <span className="fc-neutral">—</span> },
              { key: "estimatOere", label: "Estimat", num: true, render: (r) => kr(r.estimatOere) },
              { key: "vaelg", label: "", render: (r) => (
                  <Knap onClick={() => setValgtId(r.id)} disabled={r.id === valgtId}>
                    {r.id === valgtId ? "Vist" : "Vis"}
                  </Knap>) },
            ]}
            raekker={DEMO_SERVICEBESOEG}
            tom="Ingen servicebesøg."
          />
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Et servicebesøg er en <b>opgave med art facility</b> (beslutning 21) —
            samme form som et værkstedsbesøg, bare på et anlæg i stedet for en bil.
            Sagsnummeret kommer fra beslutning 20:{" "}
            <Link className="fc-a" to="/flaade/vaerksted">se sagsvisningen</Link>.
          </p>
        </Kort>
      </Gitter>
    </div>
  );
}

/* ---- Den fjerde reservationskilde ------------------------------------- */

function Reservationen({ besoeg }) {
  if (!besoeg) {
    return (
      <Kort titel="Reservation">
        <Tom>Vælg et besøg for at se hvilken reservation det ville skrive.</Tom>
      </Kort>
    );
  }

  let r = null, byggefejl = null;
  try { r = reservationFraOpgave(besoeg); } catch (e) { byggefejl = e.message; }
  const pri = prioritetFor(KILDE.facilitySag);
  const heleStedet = !besoeg.aktivId;

  return (
    <Kort titel="Reservationen der ville blive skrevet">
      {byggefejl ? <Fejl>{byggefejl}</Fejl> : (
        <>
          <MiniLinje label="Arbejde" vaerdi={besoeg.beskrivelse} />
          <MiniLinje label="Leverandør" vaerdi={lvNavn(besoeg.leverandoerId)} />
          {besoeg.sagsnummer && <MiniLinje label="Sag" vaerdi={<code>{besoeg.sagsnummer}</code>} />}
          <MiniLinje label="Fra" vaerdi={datoTid(besoeg.fra)} />
          <MiniLinje label="Til" vaerdi={`${datoTid(besoeg.til)} (eksklusiv)`} />

          <div style={{ borderTop: "1px solid var(--bc-line)", margin: "12px 0" }} />

          <MiniLinje label="Ressource" vaerdi={<code>{r.ressourceType}</code>} />
          <MiniLinje label="Ressource-id" vaerdi={<code>{r.ressourceId}</code>} />
          <MiniLinje label="Kilde" vaerdi={<code>{r.kilde.type}</code>} />
          <MiniLinje
            label="Prioritet"
            vaerdi={<><b>{pri}</b> — taber til værksted (40) og fravær (30), vinder over booking (10)</>}
          />

          {heleStedet && (
            <p className="fc-hint" style={{ marginTop: 12 }}>
              ⚠ Besøget har <b>intet anlæg</b> og spærrer derfor <b>hele lokationen</b>.
              Ressourcen er <code>lokation</code> og ikke <code>facilityAktiv</code> —
              lukker man hallen, er alle porte i den også optaget.
            </p>
          )}

          <p className="fc-hint" style={{ marginTop: 12, fontStyle: "italic" }}>
            „{konfliktTekst(r, { kilde: { type: KILDE.facilitySag, reference: besoeg.sagsnummer || besoeg.id } })}“
          </p>
          <p className="fc-hint" style={{ marginTop: 12 }}>
            <b>Den fjerde kilde krævede ingen ny kode.</b> Et servicebesøg er en opgave
            med art <b>facility</b>, og <code>reservationFraOpgave()</code> giver
            allerede kilde <b>facilitySag</b>. Beslutning 4 er én node, fire kilder.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            <b>Reservationen skrives ikke endnu.</b> Konfliktfriheden hører i en Cloud
            Function — to skrivninger kan ramme samme sekund.
          </p>
        </>
      )}
    </Kort>
  );
}
