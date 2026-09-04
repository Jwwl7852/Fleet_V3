/* src/moduler/indkoeb/Arkiv.jsx
 * Procure — Arkiv. Procure TARGET, trin 6 (produktejer-review 2026-09-02).
 *
 * ⚠ READ-ONLY HISTORIK, INGEN NY DATAMODEL. Arkivet er en FILTRERET visning
 * af de samme `indkoebsbehov`/`indkoebsordrer`/`indkoeb`-poster Bestillinger
 * og Varer allerede henter — afsluttede i stedet for åbne. Der kopieres
 * intet: en "arkivpost" ville være den samme kendsgerning to steder, og den
 * ene ville stå tilbage når den anden blev rettet (samme fejl som
 * `bemanding.ledig`, beslutning 71).
 *
 * ⚠ "AFSLUTTET" BETYDER NOGET FORSKELLIGT FOR DE TO TYPER.
 *   Behov:   `bestilt` (det blev til en ordre) eller `afvist`.
 *   Ordre:   `modtaget`, `afvist` eller `annulleret` — ORDRE_OVERGANGE i
 *            procure.js har ingen overgange ud af nogen af de tre, så det
 *            er de faktiske sluttilstande, ikke en gættet liste.
 * Et `kladde`/`afventerGodkendelse`/`godkendt`/`sendt` behov eller ordre er
 * stadig i arbejde og hører til i Bestillinger, ikke her.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { dato, kr, num } from "../../fleet/format.js";
import {
  Kort, Tom, Tabel, Pille, Henter, Datatilstand, Knap, ModulNav,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
import {
  BEHOVSTATUS, ORDRESTATUS, ordreSumOere, linjeListe, BETALINGSFORM,
} from "../../fleet/procure.js";
import { PROCURE_FANER } from "../../fleet/modulfaner.js";
import { DEMO_INDKOEBSBEHOV, DEMO_INDKOEBSORDRER } from "../../fleet/demo-procure.js";
import { DEMO_INDKOEBSLINJER, DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

const AFSLUTTEDE_ORDRESTATUS = ["modtaget", "afvist", "annulleret"];
const AFSLUTTEDE_BEHOVSTATUS = ["bestilt", "afvist"];

export default function Arkiv() {
  const [ordreFilter, setOrdreFilter] = useState("");
  const [behovFilter, setBehovFilter] = useState("");

  const behov = useListe("indkoebsbehov", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 500, demo: DEMO_INDKOEBSBEHOV,
  });
  const ordrer = useListe("indkoebsordrer", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 300, demo: DEMO_INDKOEBSORDRER,
  });
  const historik = useListe("indkoeb", {
    ordnPaa: "dato", vindueDage: 400, graense: 1000, demo: DEMO_INDKOEBSLINJER,
  });
  const leverandoerer = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });

  const henterNoget = behov.henter || ordrer.henter || historik.henter;
  if (henterNoget) return <Henter hvad="arkivet" />;
  if (blokerer(ordrer.tilstand)) {
    return <Datatilstand tilstand={ordrer.tilstand} genprov={ordrer.genindlaes} />;
  }
  if (blokerer(behov.tilstand)) {
    return <Datatilstand tilstand={behov.tilstand} genprov={behov.genindlaes} />;
  }

  const lvNavn = (id) => leverandoerNavn(leverandoerer.data, id);

  const afsluttedeOrdrer = ordrer.data
    .filter((o) => AFSLUTTEDE_ORDRESTATUS.includes(o.status))
    .filter((o) => !ordreFilter || o.status === ordreFilter)
    .sort((a, b) => (b.oprettetMs || 0) - (a.oprettetMs || 0));
  const afsluttedeBehov = behov.data
    .filter((b) => AFSLUTTEDE_BEHOVSTATUS.includes(b.status))
    .filter((b) => !behovFilter || b.status === behovFilter)
    .sort((a, b) => (b.oprettetMs || 0) - (a.oprettetMs || 0));
  const kontantkoeb = historik.data
    .filter((l) => l.betalingsform === "kontant")
    .sort((a, b) => (b.dato || 0) - (a.dato || 0));

  const modtagneOrdrer = afsluttedeOrdrer.filter((o) => o.status === "modtaget");
  const modtagetSumOere = modtagneOrdrer.reduce((s, o) => s + ordreSumOere(o), 0);
  const kontantSumOere = kontantkoeb.reduce((s, l) => s + (l.antal || 0) * (l.prisPrEnhedOere || 0), 0);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={PROCURE_FANER} />

      <Kort
        titel={`Afsluttede bestillinger (${num(afsluttedeOrdrer.length)})`}
      >
        <div className="fc-filtre" role="group" aria-label="Filtrér på tilstand">
          <Knap variant={ordreFilter === "" ? "primaer" : "sekundaer"} onClick={() => setOrdreFilter("")}>
            Alle
          </Knap>
          {AFSLUTTEDE_ORDRESTATUS.map((s) => (
            <Knap key={s} variant={ordreFilter === s ? "primaer" : "sekundaer"}
                  onClick={() => setOrdreFilter(ordreFilter === s ? "" : s)}>
              {ORDRESTATUS[s]?.label || s}
            </Knap>
          ))}
        </div>
        <Tabel
          raekker={afsluttedeOrdrer}
          tom="Ingen afsluttede bestillinger endnu."
          kolonner={[
            { key: "nummer", label: "Nummer", render: (o) => <code>{o.nummer}</code> },
            { key: "lev", label: "Leverandør", render: (o) => lvNavn(o.leverandoerId) },
            { key: "linjer", label: "Linjer", num: true, render: (o) => num(linjeListe(o).length) },
            { key: "sum", label: "Beløb", num: true, render: (o) => kr(ordreSumOere(o)) },
            { key: "status", label: "Tilstand", render: (o) => (
                <Pille tone={ORDRESTATUS[o.status]?.tone}>{ORDRESTATUS[o.status]?.label || o.status}</Pille>
              ) },
            { key: "dato", label: "Oprettet", render: (o) => dato(o.oprettetMs) },
            { key: "afsluttet", label: "Afsluttet", render: (o) => (
                dato(o.modtagetMs || o.afvistMs || o.aendretMs || o.oprettetMs)
              ) },
          ]}
        />
        <p className="fc-hint" style={{ marginTop: 10 }}>
          {num(modtagneOrdrer.length)} modtagne bestillinger for <b>{kr(modtagetSumOere)}</b> ekskl. moms i alt.
          Beløbet er summen af de viste linjer — ikke et gemt totaltal.
        </p>
      </Kort>

      <Kort titel={`Afsluttede behov (${num(afsluttedeBehov.length)})`}>
        <div className="fc-filtre" role="group" aria-label="Filtrér på tilstand">
          <Knap variant={behovFilter === "" ? "primaer" : "sekundaer"} onClick={() => setBehovFilter("")}>
            Alle
          </Knap>
          {AFSLUTTEDE_BEHOVSTATUS.map((s) => (
            <Knap key={s} variant={behovFilter === s ? "primaer" : "sekundaer"}
                  onClick={() => setBehovFilter(behovFilter === s ? "" : s)}>
              {BEHOVSTATUS[s]?.label || s}
            </Knap>
          ))}
        </div>
        <Tabel
          raekker={afsluttedeBehov}
          tom="Ingen afsluttede behov endnu."
          kolonner={[
            { key: "vare", label: "Vare", render: (b) => (
                <>
                  <b>{b.vare}</b>
                  {b.varenummer && <div className="fc-hint">{b.varenummer}</div>}
                </>
              ) },
            { key: "status", label: "Status", render: (b) => (
                <Pille tone={BEHOVSTATUS[b.status]?.tone}>{BEHOVSTATUS[b.status]?.label || b.status}</Pille>
              ) },
            { key: "dato", label: "Meldt ind", render: (b) => dato(b.oprettetMs) },
            { key: "grund", label: "Begrundelse (afvisning)",
              render: (b) => b.afvistBegrundelse || b.begrundelse || <span className="fc-hint">—</span> },
          ]}
        />
      </Kort>

      <Kort titel={`Kontantkøb (${num(kontantkoeb.length)})`}>
        {!kontantkoeb.length ? (
          <Tom>Ingen kontantkøb registreret endnu. Registreres i Match &amp; kontantkøb.</Tom>
        ) : (
          <>
            <Tabel
              raekker={kontantkoeb}
              tom="Ingen kontantkøb registreret endnu."
              kolonner={[
                { key: "vare", label: "Vare", render: (l) => <b>{l.vare}</b> },
                { key: "lev", label: "Sted", render: (l) => lvNavn(l.leverandoerId) },
                { key: "antal", label: "Antal", num: true, render: (l) => `${num(l.antal)} ${l.enhed || ""}`.trim() },
                { key: "beloeb", label: "Beløb", num: true,
                  render: (l) => kr((l.antal || 0) * (l.prisPrEnhedOere || 0)) },
                { key: "dato", label: "Dato", render: (l) => dato(l.dato) },
                { key: "form", label: "Betalt", render: () => (
                    <Pille tone={BETALINGSFORM.kontant.tone}>{BETALINGSFORM.kontant.label}</Pille>
                  ) },
              ]}
            />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              {num(kontantkoeb.length)} kontantkøb for <b>{kr(kontantSumOere)}</b> ekskl. moms i alt.
            </p>
          </>
        )}
      </Kort>
    </div>
  );
}
