/* src/moduler/booking/NyForespoergsel.jsx
 * Booking – ny transportforespørgsel
 *
 * Rolle: casehandler. Det er her forløbet begynder — en forespørgsel oprettes
 * som `kladde` og sendes til planlægning med overgangen til `afventerPlan`.
 *
 * ⚠ GEM VISER HVAD byggSkifte() VILLE SKRIVE. Der skrives ingenting (fase 0).
 * Knappen er gated på kanSkifte(), så en rolle uden `booking.opret` får det
 * samme nej som serveren ville give — skift rolle i sidebaren og se.
 *
 * ⚠ BOOKINGNUMMERET KOMMER FRA EN COUNTER, ALDRIG FRA EN OPTÆLLING.
 * naesteBookingnummer() kører en transaction mod countere/booking/<år>
 * (beslutning 8). At tælle eksisterende bookinger ville give to bookinger
 * samme nummer i det sekund to casehandlere opretter samtidig. Funktionen
 * kræver en database og kaldes derfor ikke her — feltet viser formatet.
 *
 * FLEKSIBILITET ER IKKE PYNT. Uden et spænd på afhentning og levering kan
 * matchningen ikke lægge to forsendelser sammen, og hver forespørgsel bliver
 * sin egen tur.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, oereFraKroner } from "../../fleet/format.js";
import {
  Kort, Tom, Pille, Knap, Gitter, MiniLinje, Fejl,
} from "../../fleet/ui.jsx";
import { TILSTAND, kanSkifte, byggSkifte } from "../../fleet/booking-state.js";
import { PERM } from "../../fleet/permissions.js";
import { harPerm } from "../../fleet/permissions.js";
import {
  TRANSPORTTYPE, RUTEPRAEFERENCE, FLEKSIBILITET,
} from "../../fleet/demo-bookinger.js";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";

const TOM = {
  kundeId: "", fraSted: "", tilSted: "",
  transporttype: "fuldlast", rutepraeference: "hurtigst",
  omsaetning: "",
  onsketAfhentning: "", afhentningFleks: "timer2",
  onsketLevering: "", leveringFleks: "halvdag",
  krav: "", kundekrav: "",
};

const tilMs = (v) => (v ? new Date(v).getTime() : null);

export default function NyForespoergsel() {
  const { bruger, division } = useFleet();
  const [f, setF] = useState(TOM);
  const saet = (n) => (e) => setF((x) => ({ ...x, [n]: e.target.value }));

  const omsaetningOere = oereFraKroner(f.omsaetning);

  /* Kladden som tilstandsmaskinen ser den. Overgangen kladde → afventerPlan
     kræver booking.opret og har ingen andre forudsætninger — men de felter
     forespørgslen skal bære, kontrolleres her, så man ikke sender en tom sag
     til planlægning. */
  const kladde = { tilstand: "kladde", forslag: [], valgtForslagId: null };
  const svar = kanSkifte(kladde, "afventerPlan", bruger?.perms);
  const maaOprette = harPerm(bruger?.perms, PERM.bookingOpret);

  const mangler = [
    !f.kundeId && "kunde",
    !f.fraSted && "afhentningssted",
    !f.tilSted && "leveringssted",
    !tilMs(f.onsketAfhentning) && "ønsket afhentning",
    omsaetningOere == null && "omsætning",
  ].filter(Boolean);

  const opdatering = byggSkifte(kladde, "afventerPlan", {
    rolle: bruger?.rolle, bruger: bruger?.uid, begrundelse: null,
  });
  const historikNoegle = Object.keys(opdatering).find((n) => n.startsWith("historik/"));

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort
          titel="Ny transportforespørgsel"
          handling={<Pille tone={TILSTAND.kladde.pill}>{TILSTAND.kladde.label}</Pille>}
        >
          <p className="fc-hint" style={{ marginBottom: 14 }}>
            Forespørgslen oprettes som <b>kladde</b> og sendes til planlægning.
            Disponenten laver derefter 1–3 forslag, og koordinatoren godkender —
            <b> ikke</b> disponenten selv.{" "}
            <Link className="fc-a" to="/booking/forslag/bk-2026-00314">Se forslagstrinnet</Link>.
          </p>

          <Gitter kolonner="1fr 1fr">
            <div className="fc-felt">
              <label htmlFor="nf-kunde">Kunde *</label>
              <select id="nf-kunde" value={f.kundeId} onChange={saet("kundeId")}>
                <option value="">Vælg kunde</option>
                {DEMO_KUNDER
                  .filter((k) => k.division === division || k.division === "faelles")
                  .map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
              </select>
            </div>
            <div className="fc-felt">
              <label htmlFor="nf-type">Transporttype</label>
              <select id="nf-type" value={f.transporttype} onChange={saet("transporttype")}>
                {Object.entries(TRANSPORTTYPE).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </Gitter>

          <Gitter kolonner="1fr 1fr">
            <div className="fc-felt">
              <label htmlFor="nf-fra">Afhentningssted *</label>
              <input id="nf-fra" value={f.fraSted} onChange={saet("fraSted")} placeholder="By eller adresse" />
            </div>
            <div className="fc-felt">
              <label htmlFor="nf-til">Leveringssted *</label>
              <input id="nf-til" value={f.tilSted} onChange={saet("tilSted")} placeholder="By eller adresse" />
            </div>
          </Gitter>

          <div className="fc-felt">
            <label htmlFor="nf-rute">Rutepræference</label>
            <select id="nf-rute" value={f.rutepraeference} onChange={saet("rutepraeference")}>
              {Object.entries(RUTEPRAEFERENCE).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Tidspunkt OG fleksibilitet ved siden af hinanden. Et ønsket
              tidspunkt uden et spænd er i praksis "fast", og så kan
              matchningen ikke lægge to forsendelser sammen. */}
          <Gitter kolonner="1fr 1fr">
            <div className="fc-felt">
              <label htmlFor="nf-afh">Ønsket afhentning *</label>
              <input id="nf-afh" type="datetime-local" value={f.onsketAfhentning}
                     onChange={saet("onsketAfhentning")} />
            </div>
            <div className="fc-felt">
              <label htmlFor="nf-afhf">Fleksibilitet</label>
              <select id="nf-afhf" value={f.afhentningFleks} onChange={saet("afhentningFleks")}>
                {Object.entries(FLEKSIBILITET).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </Gitter>

          <Gitter kolonner="1fr 1fr">
            <div className="fc-felt">
              <label htmlFor="nf-lev">Ønsket levering</label>
              <input id="nf-lev" type="datetime-local" value={f.onsketLevering}
                     onChange={saet("onsketLevering")} />
            </div>
            <div className="fc-felt">
              <label htmlFor="nf-levf">Fleksibilitet</label>
              <select id="nf-levf" value={f.leveringFleks} onChange={saet("leveringFleks")}>
                {Object.entries(FLEKSIBILITET).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </Gitter>

          <div className="fc-felt">
            <label htmlFor="nf-oms">Aftalt omsætning ekskl. moms (kr.) *</label>
            <input id="nf-oms" inputMode="decimal" value={f.omsaetning}
                   onChange={saet("omsaetning")} placeholder="0,00" />
          </div>

          <div className="fc-felt">
            <label htmlFor="nf-krav">Krav til udstyr</label>
            <input id="nf-krav" value={f.krav} onChange={saet("krav")}
                   placeholder="Bagsmæklift, palleløfter, køl 2–6 °C …" />
          </div>

          <div className="fc-felt">
            <label htmlFor="nf-kkrav">Kundekrav</label>
            <textarea id="nf-kkrav" rows={2} value={f.kundekrav} onChange={saet("kundekrav")}
                      placeholder="Fx: ring 30 min. før ankomst" />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <Knap variant="primaer" disabled
                  title={maaOprette
                    ? "Skrivning er ikke bygget endnu (fase 0)."
                    : `Kræver ${PERM.bookingOpret}.`}>
              Send til planlægning
            </Knap>
            <Knap disabled title="Skrivning er ikke bygget endnu (fase 0).">
              Gem som kladde
            </Knap>
          </div>
          {mangler.length > 0 && (
            <p className="fc-hint" style={{ marginTop: 10 }}>Mangler: {mangler.join(", ")}.</p>
          )}
        </Kort>

        <div className="fc-grid">
          <Kort titel={`Overgangen — rolle: ${bruger?.rolle || "ukendt"}`}>
            <MiniLinje label="Fra" vaerdi={<Pille tone={TILSTAND.kladde.pill}>{TILSTAND.kladde.label}</Pille>} />
            <MiniLinje label="Til" vaerdi={<Pille tone={TILSTAND.afventerPlan.pill}>{TILSTAND.afventerPlan.label}</Pille>} />
            <MiniLinje label="Kræver" vaerdi={<code>{PERM.bookingOpret}</code>} />
            <MiniLinje label="kanSkifte()" vaerdi={svar.ok
              ? <Pille tone="ok">ok</Pille>
              : <Pille tone="bad">afvist</Pille>} />
            {!svar.ok && <p className="fc-hint fc-bad" style={{ marginTop: 8 }}>{svar.aarsag}</p>}
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Både <b>casehandler</b>, <b>koordinator</b> og <b>admin</b> har{" "}
              <code>booking.opret</code>. En <b>chauffør</b> har den ikke — skift rolle i
              sidebaren og se knappen og svaret ændre sig.
            </p>
          </Kort>

          <Kort titel="Hvad Gem ville skrive">
            <MiniLinje label="tilstand" vaerdi={<code>{opdatering.tilstand}</code>} />
            <MiniLinje label="sidstAendretAf" vaerdi={<code>{String(opdatering.sidstAendretAf)}</code>} />
            <MiniLinje label="historik" vaerdi={<code>{historikNoegle}</code>} />
            <MiniLinje label="omsaetningOere"
                       vaerdi={<code>{omsaetningOere == null ? "—" : omsaetningOere}</code>} />
            <MiniLinje label="division" vaerdi={<code>{division}</code>} />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Beløbet gemmes i <b>hele øre, ekskl. moms</b> — {kr(omsaetningOere || 0)} bliver{" "}
              <code>{omsaetningOere ?? 0}</code>. Aldrig en float, og aldrig ét felt med
              moms indeni.
            </p>
          </Kort>

          <Kort titel="Bookingnummeret">
            <MiniLinje label="Format" vaerdi={<code>BKG-ÅÅÅÅ-NNNNN</code>} />
            <MiniLinje label="Kilde" vaerdi={<code>countere/booking/&lt;år&gt;</code>} />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Nummeret kommer fra en <b>counter i en transaction</b>, aldrig fra en
              optælling af eksisterende bookinger — to casehandlere der opretter samtidig
              ville ellers få samme nummer. Det tildeles af den Cloud Function der
              skriver posten, og derfor er feltet tomt indtil da.
            </p>
          </Kort>
        </div>
      </Gitter>
    </div>
  );
}
