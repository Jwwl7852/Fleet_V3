/* src/moduler/support/Hjaelp.jsx
 * Hjælp & Support — kundens skærm
 *
 * BESLUTNING 23. Kunden opretter en sag; vi ser den i supportoverblikket.
 *
 * ⚠ "DET HER SENDES MED" ER IKKE ET LØFTE.
 *
 * Prototypen skrev "Ingen personlige data deles uden dit samtykke" ved siden
 * af et kort der viste IP-adresse, bruger-id og mail. Det ER personoplysninger,
 * og sætningen var derfor ikke bare upræcis — den var forkert, og den stod
 * netop dér hvor brugeren ville tro på den.
 *
 * Kortet herunder LISTER hvad der sendes, og hvad der ikke gør. Ingen
 * forsikring, intet "uden dit samtykke". Listen er allowlisten i support.js,
 * så skærmen ikke kan komme til at love noget andet end det systemet gør.
 *
 * IP-adresse og mail er væk: de stod i prototypen, men ikke i beslutning 23.
 *
 * FASE 0: VISNING. Der oprettes ingen sag.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { dato, datoTid } from "../../fleet/format.js";
import {
  Kort, Tom, Tabel, Pille, Knap, Gitter, MiniLinje,
} from "../../fleet/ui.jsx";
import {
  SUPPORT_KATEGORI, ALLE_KATEGORIER, SUPPORT_PRIORITET, ALLE_PRIORITETER,
  SUPPORT_STATUS, SUPPORT_KONTEKST, KONTEKSTFELTER, kontekstFilter,
  PERM_SUPPORT_OPRET, harSupportPerm,
} from "../../fleet/support.js";
import { DEMO_SUPPORTSAGER, demoIndeksFor } from "../../fleet/demo-support.js";

export default function Hjaelp() {
  const { bruger, tenantId, tenant } = useFleet();
  const [kategori, setKategori] = useState("virkerIkke");
  const [prioritet, setPrioritet] = useState("medium");
  const [beskrivelse, setBeskrivelse] = useState("");

  const maaOprette = harSupportPerm(bruger, PERM_SUPPORT_OPRET);

  /* Konteksten som den ville blive sendt — filtreret mod allowlisten, så
     skærmen viser det systemet faktisk gør og ikke det den lover. */
  const raaKontekst = {
    kunde: tenant?.navn || tenantId,
    side: "/support",
    modul: "Support",
    browser: typeof navigator !== "undefined" ? navigator.userAgent.split(") ").pop() : "—",
    version: "FleetControl 3.0.0",
    brugerId: bruger?.uid || "—",
    tidspunkt: datoTid(Date.now()),
    fejlId: null,
  };
  const { tilladt } = kontekstFilter(raaKontekst);

  /* Kundens egne sager. I drift kommer listen fra indeksnoden
     tenants/<t>/supportsager — kunden kan ikke forespørge på support/sager. */
  const mineIder = demoIndeksFor(tenantId);
  const mine = DEMO_SUPPORTSAGER.filter((s) => mineIder.includes(s.id));

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort titel="Opret en supportsag">
          <p className="fc-hint" style={{ marginBottom: 14 }}>
            Beskriv hvad du forsøgte at gøre, hvad du forventede, og hvad der skete.
          </p>

          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            1. Hvad handler henvendelsen om?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {ALLE_KATEGORIER.map((k) => (
              <Knap key={k} variant={kategori === k ? "primaer" : "sekundaer"}
                    onClick={() => setKategori(k)}>
                {SUPPORT_KATEGORI[k]}
              </Knap>
            ))}
          </div>

          <div className="fc-felt">
            <label htmlFor="sup-pri">2. Prioritet</label>
            <select id="sup-pri" value={prioritet} onChange={(e) => setPrioritet(e.target.value)}>
              {ALLE_PRIORITETER.map((p) => (
                <option key={p} value={p}>{SUPPORT_PRIORITET[p].label}</option>
              ))}
            </select>
          </div>

          <div className="fc-felt">
            <label htmlFor="sup-besk">3. Beskriv problemet</label>
            <textarea id="sup-besk" rows={5} value={beskrivelse}
                      onChange={(e) => setBeskrivelse(e.target.value)}
                      placeholder="Hvad forsøgte du? Hvad forventede du? Hvad skete der?" />
          </div>

          <div className="fc-felt">
            <label>4. Vedhæft filer</label>
            <div className="fc-gk-drop" style={{ position: "static", padding: 22, margin: 0 }}
                 aria-disabled="true"
                 title="Upload er ikke bygget endnu (fase 0). Vedhæftninger scannes før de gemmes.">
              Træk skærmbillede eller PDF hertil — ikke bygget endnu
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <Knap variant="primaer" disabled
                  title={maaOprette
                    ? "Oprettelse er ikke bygget endnu (fase 0)."
                    : `Kræver ${PERM_SUPPORT_OPRET}.`}>
              Opret supportsag
            </Knap>
          </div>
          {!beskrivelse.trim() && (
            <p className="fc-hint" style={{ marginTop: 10 }}>Mangler: en beskrivelse.</p>
          )}
        </Kort>

        <div className="fc-grid">
          {/* ⚠ INGEN FORSIKRING. Kun hvad der sendes, og hvad der ikke gør. */}
          <Kort titel="Det her sendes med">
            {KONTEKSTFELTER.map((f) => (
              <MiniLinje key={f} label={SUPPORT_KONTEKST[f]}
                         vaerdi={tilladt[f] ?? <span className="fc-neutral">—</span>} />
            ))}
            <p className="fc-hint" style={{ marginTop: 12 }}>
              Det er hele listen. <b>Der sendes ikke</b> passwords, tokens eller
              værdier fra dine felter — hverken kundenavne, adresser, beløb eller
              noter.
            </p>
            <p className="fc-hint" style={{ marginTop: 8 }}>
              Bruger-id og tidspunkt <b>er personoplysninger</b>. De sendes, fordi de
              er det der gør en fejl mulig at finde. Vi skriver det frem for at love
              at der ikke deles noget.
            </p>
          </Kort>

          <Kort titel="Hvis vi får brug for at se i jeres data">
            <p className="fc-hint">
              FleetControl-personale har <b>ingen adgang</b> til jeres data som
              udgangspunkt. Skal vi undersøge noget i jeres eget miljø, giver{" "}
              <b>jeres administrator</b> en tidsbegrænset adgang med et formål og et
              sagsnummer.
            </p>
            <p className="fc-hint" style={{ marginTop: 8 }}>
              Adgangen <b>udløber af sig selv</b> — ikke fordi nogen husker at lukke
              den. Hvem der åbnede hvad og hvornår, bliver logget.
            </p>
          </Kort>
        </div>
      </Gitter>

      <Kort titel={`Jeres sager (${mine.length})`}>
        <Tabel
          kolonner={[
            { key: "nummer", label: "Sagsnr.", render: (r) => (
                <Link className="fc-a" to={`/support/sag/${r.id}`}>{r.nummer}</Link>) },
            { key: "emne", label: "Emne", render: (r) => <b>{r.emne}</b> },
            { key: "kategori", label: "Kategori", render: (r) => SUPPORT_KATEGORI[r.kategori] },
            { key: "prioritet", label: "Prioritet", render: (r) => (
                <Pille tone={SUPPORT_PRIORITET[r.prioritet]?.pill}>
                  {SUPPORT_PRIORITET[r.prioritet]?.label.split(" —")[0]}
                </Pille>) },
            { key: "status", label: "Status", render: (r) => (
                <Pille tone={SUPPORT_STATUS[r.status]?.pill}>
                  {SUPPORT_STATUS[r.status]?.label}</Pille>) },
            { key: "oprettetMs", label: "Oprettet", render: (r) => dato(r.oprettetMs) },
          ]}
          raekker={mine}
          tom="I har ingen supportsager."
        />
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Listen kommer fra <b>jeres egen tenant</b> — en indeksnode med sagsnumrene.
          Selve sagen læses derefter én ad gangen, og reglen sammenligner sagens
          <b> tenantId</b> med jeres. I kan ikke se andre kunders sager, og de kan
          ikke se jeres.
        </p>
      </Kort>
    </div>
  );
}
