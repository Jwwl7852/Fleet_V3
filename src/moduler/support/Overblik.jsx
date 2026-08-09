/* src/moduler/support/Overblik.jsx
 * Supportoverblik — vores skærm, på tværs af tenants
 *
 * ⚠ DEN ENESTE SKÆRM DER SER MERE END ÉN TENANT.
 *
 * Alt andet i platformen er bundet til auth.token.tenant. Her forespørges der
 * på support/sager i toppen, og det kræver `support.laes` — en permission
 * ingen kunderolle har. Tenant-isolationen er ikke brudt: kunden kan stadig
 * kun læse sine egne sager, fordi reglen på den enkelte sag sammenligner
 * sagens tenantId med claim'et.
 *
 * ⚠ DER ER INGEN SYSTEMSTATUS PÅ SKÆRMEN, og det er med vilje. Der er ingen
 * overvågning, og en statusside der altid siger grønt, bliver troet — den
 * ville være en påstand om oppetid vi ikke kan indfri. Prototypen viste
 * desuden "GPS-integration online", som beslutning 22 siger ikke findes.
 *
 * ⚠ OG INGEN AI-DIAGNOSE. Der er ingen model, og "76 % sikkerhed" er et tal
 * nogen ville handle på. Samme grund som leverandørstjernerne blev droppet:
 * en score må kun findes hvis beregningen kan vises.
 *
 * FASE 0: VISNING.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, datoTid } from "../../fleet/format.js";
import {
  Kort, Tom, Tabel, Pille, KpiKort, KpiRaekke, Fejl,
} from "../../fleet/ui.jsx";
import {
  SUPPORT_KATEGORI, SUPPORT_PRIORITET, SUPPORT_STATUS, ALLE_STATUS,
  PERM_SUPPORT_LAES, harSupportPerm, maaLaeseSag,
} from "../../fleet/support.js";
import { DEMO_SUPPORTSAGER, DEMO_TENANTS } from "../../fleet/demo-support.js";

export default function Supportoverblik() {
  const { bruger } = useFleet();
  const [status, setStatus] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");

  const maaSe = harSupportPerm(bruger, PERM_SUPPORT_LAES);

  /* Uden support.laes ser man kun sin egen tenants sager — samme funktion som
     reglen bruger, så skærmen ikke kan vise mere end serveren ville give. */
  const synlige = DEMO_SUPPORTSAGER.filter((s) => maaLaeseSag(s, bruger));

  if (!maaSe) {
    return (
      <div className="fc-grid" style={{ gap: 16 }}>
        <Kort titel="Supportoverblik">
          <Tom>
            Din rolle har ikke <b>{PERM_SUPPORT_LAES}</b>. Overblikket er
            FleetControls eget og viser sager på tværs af kunder.
          </Tom>
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Du kan se og oprette jeres egne sager under{" "}
            <Link className="fc-a" to="/support">Hjælp & Support</Link>. Du ser{" "}
            {num(synlige.length)} sag(er) på din egen tenant — reglen sammenligner
            sagens <b>tenantId</b> med dit claim.
          </p>
        </Kort>
      </div>
    );
  }

  const viste = synlige.filter(
    (s) => (!status || s.status === status) && (!tenantFilter || s.tenantId === tenantFilter)
  );

  /* Beregnet af listen — der findes ingen aggregering af supportsager, og en
     optælling af det viste er ikke et nøgletal. Labelen siger hvilket udsnit. */
  const aabne = synlige.filter((s) => SUPPORT_STATUS[s.status]?.aaben);
  const afventerKunde = synlige.filter((s) => s.status === "afventerKunde");
  const afventerIntern = synlige.filter((s) => s.status === "afventerIntern");
  const kritiske = synlige.filter((s) => s.prioritet === "kritisk" && SUPPORT_STATUS[s.status]?.aaben);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Åbne sager" vaerdi={num(aabne.length)} note="i de hentede" />
        <KpiKort label="Afventer kunde" vaerdi={num(afventerKunde.length)} />
        <KpiKort label="Afventer intern" vaerdi={num(afventerIntern.length)} />
        <KpiKort label="Kritiske" vaerdi={num(kritiske.length)} note="åbne" />
      </KpiRaekke>

      <Kort titel={`Sager på tværs af kunder (${viste.length})`}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <div className="fc-felt" style={{ flex: "0 1 220px", marginBottom: 0 }}>
            <label htmlFor="so-tenant">Kunde</label>
            <select id="so-tenant" value={tenantFilter}
                    onChange={(e) => setTenantFilter(e.target.value)}>
              <option value="">Alle kunder</option>
              {Object.entries(DEMO_TENANTS).map(([id, navn]) => (
                <option key={id} value={id}>{navn}</option>
              ))}
            </select>
          </div>
          <div className="fc-felt" style={{ flex: "0 1 220px", marginBottom: 0 }}>
            <label htmlFor="so-status">Status</label>
            <select id="so-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Alle statusser</option>
              {ALLE_STATUS.map((s) => (
                <option key={s} value={s}>{SUPPORT_STATUS[s].label}</option>
              ))}
            </select>
          </div>
        </div>

        <Tabel
          kolonner={[
            { key: "nummer", label: "Sagsnr.", render: (r) => (
                <Link className="fc-a" to={`/support/sag/${r.id}`}><b>{r.nummer}</b></Link>) },
            { key: "tenantId", label: "Kunde", render: (r) => DEMO_TENANTS[r.tenantId] || r.tenantId },
            { key: "kategori", label: "Modul", render: (r) => SUPPORT_KATEGORI[r.kategori] },
            { key: "emne", label: "Emne" },
            { key: "prioritet", label: "Prioritet", render: (r) => (
                <Pille tone={SUPPORT_PRIORITET[r.prioritet]?.pill}>
                  {SUPPORT_PRIORITET[r.prioritet]?.label.split(" —")[0]}
                </Pille>) },
            { key: "status", label: "Status", render: (r) => (
                <Pille tone={SUPPORT_STATUS[r.status]?.pill}>
                  {SUPPORT_STATUS[r.status]?.label}</Pille>) },
            { key: "oprettetMs", label: "Seneste aktivitet", render: (r) => datoTid(r.oprettetMs) },
            { key: "ansvarlig", label: "Ansvarlig",
              render: (r) => r.ansvarlig || <span className="fc-neutral">ikke tildelt</span> },
          ]}
          raekker={viste}
          tom="Ingen sager passer på filtrene."
        />

        <p className="fc-hint" style={{ marginTop: 12 }}>
          Sagerne ligger i <b>support/sager</b> i toppen — ikke under{" "}
          <b>tenants/</b>, af samme grund som auditloggen: en <b>.read</b>{" "}
          kaskaderer og kan ikke indsnævres på et barn. At forespørge på dem kræver{" "}
          <b>{PERM_SUPPORT_LAES}</b>; at læse én enkelt kræver enten den, eller at
          sagens <b>tenantId</b> matcher dit claim.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Tallene er <b>beregnet af den hentede liste</b>, ikke fra{" "}
          <code>kpi/</code> — supportsager er vores og hører ikke i kundens
          nøgletal.
        </p>
      </Kort>
    </div>
  );
}
