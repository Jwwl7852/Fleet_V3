/* src/moduler/indkoeb/Statistik.jsx
 * Procure — Statistik. Procure TARGET, trin 3 (produktejer-review
 * 2026-09-02).
 *
 * ⚠ TO SEKTIONER ER FLYTTET HERTIL, UÆNDREDE, FRA Oversigt.jsx (trin 1,
 * samme review): Leverandørperformance og Prisudviklingsgraffen. Al
 * regnestykke (`beregnNoegletal()`, `prisafvigelseTone()`,
 * `snitprisPrMaaned()`) er UÆNDRET — kun UI'ets kanoniske hjem er flyttet.
 *
 * ⚠ INGEN OPFUNDNE GRAFER. Produktejerens krav: "Statistik skal baseres på
 * reelle data." De nye tabeller herunder (køb pr. leverandør/kategori/vare,
 * antal ordrer) er alle SUMMER af linjer skærmen allerede henter — ingen af
 * dem gemmes, og ingen af dem er et gæt. Der er ikke tilføjet en ny graf ud
 * over den eksisterende prisudvikling: en trendlinje kræver et tidsserie-
 * grundlag (`snitprisPrMaaned()`), og det findes i dag kun for dieselkøb.
 */
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { kr, num, pct } from "../../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Gitter, Henter, Datatilstand, Linjegraf,
  ModulNav,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  LEVERANDOER_KATEGORI, MINDSTE_GRUNDLAG, leverandoerFraDb, leverandoerNavn,
  beregnNoegletal, maalTekst, mestKoebteVarer, snitprisPrMaaned,
  indkoebBeloebOere, prisafvigelseTone,
} from "../../fleet/leverandoerer.js";
import { linjeListe } from "../../fleet/procure.js";
import { PROCURE_FANER } from "../../fleet/modulfaner.js";
import { DEMO_FAKTURAER, DEMO_INDKOEBSLINJER, DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";
import { DEMO_INDKOEBSORDRER } from "../../fleet/demo-procure.js";

const MAANED = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/**
 * Et nøgletal med sit grundlag. BESLUTNING 25 — uændret fra Oversigt.jsx.
 */
function MedGrundlag({ maal, format = (v) => v, tone }) {
  if (!maal?.nokData) {
    return (
      <span className="fc-neutral"
            title={maal?.aarsag === "udsnit"
              ? "Nævneren er et hentet vindue der ramte sit loft."
              : maal?.aarsag === "ingenKilde"
                ? "Noden findes ikke endnu — se beslutning 20."
                : `${maal?.grundlag ?? 0} af mindst ${MINDSTE_GRUNDLAG} observationer`}>
        {maalTekst(maal)}
      </span>
    );
  }
  return (
    <span className={tone ? `fc-${tone}` : undefined}>
      {format(maal.vaerdi)}{" "}
      <span className="fc-neutral" style={{ fontSize: 11 }}>({num(maal.grundlag)})</span>
    </span>
  );
}

export default function IndkoebStatistik() {
  const { periode } = useFleet();

  const { data: raaLeverandoerer, henter: henterLev } = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });
  const { data: alleLinjer, henter: henterLinjer, tilstand: linjeTilstand, genindlaes: genindlaesLinjer } = useListe(
    "indkoeb", { ordnPaa: "dato", vindueDage: 400, graense: 500, demo: DEMO_INDKOEBSLINJER },
  );
  const { data: fakturaer } = useListe("fakturaer", {
    ordnPaa: "fakturadatoMs", vindueDage: 400, graense: 500, demo: DEMO_FAKTURAER,
  });
  const { data: ordrer } = useListe("indkoebsordrer", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 300, demo: DEMO_INDKOEBSORDRER,
  });

  if (henterLev || henterLinjer) return <Henter hvad="statistik" />;
  if (blokerer(linjeTilstand)) {
    return <Datatilstand tilstand={linjeTilstand} genprov={genindlaesLinjer} />;
  }

  const leverandoerer = raaLeverandoerer.map((l) => leverandoerFraDb(l, l.id));
  const lvNavn = (id) => leverandoerNavn(leverandoerer, id);

  const iPerioden = alleLinjer.filter((l) => l.dato >= periode.fra && l.dato <= periode.til);
  const forbrugIPeriodenOere = iPerioden.reduce((s, l) => s + indkoebBeloebOere(l), 0);
  const ordrerIPerioden = ordrer.filter((o) => Number.isFinite(o.oprettetMs)
    && o.oprettetMs >= periode.fra && o.oprettetMs <= periode.til
    && o.status !== "kladde" && o.status !== "annulleret");
  const ordrerSumIPeriodenOere = ordrerIPerioden.reduce(
    (s, o) => s + linjeListe(o).reduce((s2, l) => s2 + (l.antal || 0) * (l.prisPrEnhedOere || 0), 0), 0);

  /* ---- Køb pr. leverandør (perioden) ---- */
  const prLeverandoer = new Map();
  for (const l of iPerioden) {
    const key = l.leverandoerId || "ukendt";
    prLeverandoer.set(key, (prLeverandoer.get(key) || 0) + indkoebBeloebOere(l));
  }
  const koebPrLeverandoer = [...prLeverandoer.entries()]
    .map(([id, beloebOere]) => ({ id, navn: id === "ukendt" ? "Uden leverandør" : lvNavn(id), beloebOere }))
    .sort((a, b) => b.beloebOere - a.beloebOere)
    .slice(0, 10);

  /* ---- Køb pr. kategori (perioden) ---- */
  const prKategori = new Map();
  for (const l of iPerioden) {
    const key = l.kategori || "ukendt";
    prKategori.set(key, (prKategori.get(key) || 0) + indkoebBeloebOere(l));
  }
  const koebPrKategori = [...prKategori.entries()]
    .map(([id, beloebOere]) => ({ id, navn: LEVERANDOER_KATEGORI[id] || "Ukendt", beloebOere }))
    .sort((a, b) => b.beloebOere - a.beloebOere);

  const topVarer = mestKoebteVarer(iPerioden.length ? iPerioden : alleLinjer);

  const nu = Date.now();
  const seksMdr = 182 * 86400000;
  const aktuel = snitprisPrMaaned(alleLinjer, { varenummer: "DIESEL-B7", maaneder: 6, nu });
  const forrige = snitprisPrMaaned(alleLinjer, { varenummer: "DIESEL-B7", maaneder: 6, nu: nu - seksMdr });
  const prisPunkter = aktuel.map((p, i) => ({
    label: MAANED[p.maaned],
    vaerdier: [p.snitOere / 100, forrige[i] ? forrige[i].snitOere / 100 : null],
  }));

  const performance = leverandoerer
    .filter((l) => l.aktiv)
    .map((l) => ({
      leverandoer: l,
      tal: beregnNoegletal(l, {
        indkoeb: alleLinjer, fakturaer, sager: [], sagerFindes: false, indkoebAfkortet: false,
      }),
    }))
    .sort((a, b) => b.tal.omsaetningOere - a.tal.omsaetningOere);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={PROCURE_FANER} />

      <KpiRaekke>
        <KpiKort label="Forbrug i perioden" vaerdi={kr(forbrugIPeriodenOere)}
                 note={`${num(iPerioden.length)} indkøbslinjer · ekskl. moms`} />
        <KpiKort label="Bestillinger i perioden" vaerdi={num(ordrerIPerioden.length)}
                 note="sendt, godkendt eller modtaget — ikke kladder" />
        <KpiKort label="Beløb bestilt i perioden" vaerdi={kr(ordrerSumIPeriodenOere)}
                 note="ekskl. moms" />
        <KpiKort label="Aktive leverandører" vaerdi={num(leverandoerer.filter((l) => l.aktiv).length)}
                 note={`ud af ${num(leverandoerer.length)} i kartoteket`} />
      </KpiRaekke>

      <Gitter kolonner="repeat(auto-fit, minmax(310px, 1fr))">
        <Kort titel="Køb pr. leverandør">
          <Tabel
            raekker={koebPrLeverandoer}
            tom="Ingen indkøb i perioden."
            kolonner={[
              { key: "navn", label: "Leverandør", render: (r) => <b>{r.navn}</b> },
              { key: "beloeb", label: "Beløb", num: true, render: (r) => kr(r.beloebOere) },
            ]}
          />
        </Kort>

        <Kort titel="Køb pr. kategori">
          <Tabel
            raekker={koebPrKategori}
            tom="Ingen indkøb i perioden."
            kolonner={[
              { key: "navn", label: "Kategori", render: (r) => <b>{r.navn}</b> },
              { key: "beloeb", label: "Beløb", num: true, render: (r) => kr(r.beloebOere) },
            ]}
          />
        </Kort>

        <Kort titel="Mest købte varer">
          <Tabel
            kolonner={[
              { key: "vare", label: "Vare", render: (r) => <b>{r.vare}</b> },
              { key: "kategori", label: "Kategori",
                render: (r) => LEVERANDOER_KATEGORI[r.kategori] || r.kategori },
              { key: "beloebOere", label: "Køb", num: true, render: (r) => kr(r.beloebOere) },
              { key: "andelPct", label: "Andel", bredde: "26%", render: (r) => (
                  <div className="fc-udn">
                    <b>{pct(r.andelPct, 0)}</b>
                    <span className="fc-udn-spor">
                      <span className="fc-udn-fyld fc-udn-serie1"
                            style={{ width: `${Math.min(100, r.andelPct)}%` }} />
                    </span>
                  </div>
                ) },
            ]}
            raekker={topVarer}
            tom="Ingen indkøb i perioden."
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            ⚠ Andelen er af <b>de viste linjer</b>, ikke af tenantens samlede
            indkøb. Nævneren er summen af det du kan se ovenfor.
          </p>
        </Kort>

        <Kort titel="Prisudvikling — snitpris, diesel">
          <Linjegraf
            punkter={prisPunkter}
            serier={[{ navn: "Seneste 6 måneder" }, { navn: "De 6 måneder før", stiplet: true }]}
            format={(v) => `${v.toFixed(2)} kr/l`}
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            <b>Vægtet</b> snitpris: samlet beløb divideret med samlet mængde.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Vinduet er <b>tolv måneder delt i to halvår</b> og følger ikke
            periodevælgeren i toppen — en trend over 30 dage er ét punkt.
          </p>
        </Kort>
      </Gitter>

      <Kort titel="Leverandørperformance">
        <Tabel
          kolonner={[
            { key: "navn", label: "Leverandør", render: (r) => <b>{r.leverandoer.navn}</b> },
            { key: "tilTiden", label: "Til tiden", render: (r) => (
                r.tal.leveringspraecisionPct.nokData ? (
                  <div className="fc-udn">
                    <b>{pct(r.tal.leveringspraecisionPct.vaerdi, 0)}</b>
                    <span className="fc-udn-spor">
                      <span className={`fc-udn-fyld fc-udn-${
                        r.tal.leveringspraecisionPct.vaerdi >= 95 ? "ok"
                        : r.tal.leveringspraecisionPct.vaerdi >= 85 ? "warn" : "bad"}`}
                            style={{ width: `${r.tal.leveringspraecisionPct.vaerdi}%` }} />
                    </span>
                  </div>
                ) : <MedGrundlag maal={r.tal.leveringspraecisionPct} />
              ) },
            { key: "pris", label: "Prisafvigelse", num: true, render: (r) => (
                <MedGrundlag
                  maal={r.tal.prisafvigelsePct}
                  format={(v) => `${v > 0 ? "+" : ""}${num(v, 1)} %`}
                  tone={r.tal.prisafvigelsePct.nokData
                    ? prisafvigelseTone(r.leverandoer, r.tal.prisafvigelsePct.vaerdi)?.tone
                    : undefined}
                />
              ) },
            { key: "mangler", label: "Mangler faktura", num: true, render: (r) => (
                <span className={r.tal.manglendeFakturaer.vaerdi > 0 ? "fc-warn" : undefined}>
                  {num(r.tal.manglendeFakturaer.vaerdi)}
                </span>
              ) },
            { key: "omsaetning", label: "Samlet køb", num: true, render: (r) => kr(r.tal.omsaetningOere) },
          ]}
          raekker={performance}
          noegle={(r) => r.leverandoer.id}
          tom="Ingen aktive leverandører."
        />
        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>Ingen stjerner og ingen samlet score.</b> En stjerne er en
          vurdering uden regnestykke — beslutning 22.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Tallet i parentes er <b>grundlaget</b>. Under {MINDSTE_GRUNDLAG} står
          der <b>for lidt grundlag</b> og ikke en streg — beslutning 25.
        </p>
      </Kort>
    </div>
  );
}
