import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { num, pct } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, Tom, Ikon,
  KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import {
  beholdningPrVare, forfaldneOptaellinger, plukkoe, underMinimum, udenLokation,
} from "../../fleet/warehouse.js";
import { belaegningPrPlads } from "../../fleet/reolplads.js";
import { lagerBelægningPrOmraade, vareEjer } from "../../fleet/warehouse-unit.js";
import {
  DEMO_BEHOLDNING, DEMO_CARRIERS, DEMO_REOLPLADSER, DEMO_VARER,
} from "../../fleet/demo-lager.js";
import { DEMO_KASSER } from "../../fleet/demo-unitbooking.js";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";

const linkKnap = (til, tekst, primaer = false) => (
  <Link className={`fc-btn${primaer ? " fc-btn-primaer" : ""}`} to={til}>{tekst}</Link>
);

export default function WarehouseOverblik() {
  const { data: varer, henter, tilstand, genindlaes } = useListe("varer", {
    graense: 2000, demo: DEMO_VARER,
  });
  const { data: beholdning } = useListe("beholdning", { graense: 5000, demo: DEMO_BEHOLDNING });
  const { data: carriers } = useListe("carriers", { graense: 2000, demo: DEMO_CARRIERS });
  const { data: pladser } = useListe("reolpladser", { graense: 2000, demo: DEMO_REOLPLADSER });
  const { data: kasser } = useListe("kasser", { graense: 2000, demo: DEMO_KASSER });
  const { data: ordrer } = useListe("plukordrer", { graense: 2000, demo: [] });
  const { data: optaellinger } = useListe("optaellinger", { graense: 5000, demo: [] });
  const { data: kunder } = useListe("kunder", { graense: 500, demo: DEMO_KUNDER });

  if (henter) return <Henter hvad="WAREHOUSE-overblikket" />;

  const lave = underMinimum(varer, beholdning);
  const pluk = plukkoe(ordrer);
  const forfaldne = forfaldneOptaellinger(beholdning, optaellinger, Date.now());
  const modtagelser = carriers.filter((c) => c.status === "iTransit" || udenLokation(c));
  const unitTilPlacering = kasser.filter((k) => k.status !== "udlaant" && !k.pladsId);
  const afvigelser = optaellinger.filter((o) => Number(o.afvigelse) !== 0);
  const belaegning = belaegningPrPlads({ beholdning, carriers, kasser });
  const omraader = lagerBelægningPrOmraade(pladser, belaegning);
  const total = beholdningPrVare(beholdning);

  const opgaver = [
    {
      id: "modtag", label: "Modtag og placér", antal: modtagelser.length + unitTilPlacering.length,
      tone: modtagelser.length + unitTilPlacering.length ? "warn" : "ok",
      note: `${modtagelser.length} beholdere · ${unitTilPlacering.length} units`, til: "/warehouse/modtagelse",
    },
    {
      id: "pluk", label: "Pluk og udlever", antal: pluk.length,
      tone: pluk.length ? "warn" : "ok", note: "frigivne ordrer", til: "/warehouse/pluk",
    },
    {
      id: "minimum", label: "Under minimum", antal: lave.length,
      tone: lave.length ? "bad" : "ok", note: "varer kræver handling", til: "/warehouse/varer",
    },
    {
      id: "optael", label: "Optælling", antal: forfaldne.length,
      tone: forfaldne.length ? "warn" : "ok", note: `${afvigelser.length} registrerede afvigelser`, til: "/warehouse/optaelling",
    },
  ];

  return (
    <div className="fc-grid warehouse-workspace">
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <div className="warehouse-hero">
        <div>
          <p className="warehouse-eyebrow">Dagens lagerarbejde</p>
          <h2>WAREHOUSE-overblik</h2>
          <p className="fc-hint">Modtagelser, pluk, afvigelser og faktisk belægning samlet ét sted.</p>
        </div>
        <div className="warehouse-hero-actions">
          {linkKnap("/warehouse/scan", "Scan unit", true)}
          {linkKnap("/warehouse/modtagelse", "Ny modtagelse")}
        </div>
      </div>

      <KpiRaekke>
        {opgaver.map((o, index) => (
          <KpiKort key={o.id} label={o.label} vaerdi={num(o.antal)} note={o.note}
                   ikon={index === 0 ? <Ikon navn="kasse" /> : undefined}
                   tone={index === 0 ? "ikon-5" : undefined} rund={index === 0}
                   til={o.til} />
        ))}
      </KpiRaekke>

      <div className="warehouse-overview-grid">
        <Kort titel="Kræver handling">
          {opgaver.some((o) => o.antal > 0) ? (
            <div className="warehouse-task-list">
              {opgaver.filter((o) => o.antal > 0).map((o) => (
                <Link key={o.id} to={o.til} className="warehouse-task-row">
                  <span><b>{o.label}</b><span className="fc-hint">{o.note}</span></span>
                  <Pille tone={o.tone}>{num(o.antal)}</Pille>
                </Link>
              ))}
            </div>
          ) : (
            <Tom handling={linkKnap("/warehouse/scan", "Scan næste unit", true)}>
              Ingen åbne lageropgaver. Start en scanning, når næste unit ankommer.
            </Tom>
          )}
        </Kort>

        <Kort titel="Belægning pr. lager og zone">
          <Tabel
            kolonner={[
              { key: "lager", label: "Lager", render: (r) => <b>{r.lager}</b> },
              { key: "zone", label: "Zone", render: (r) => r.zone },
              { key: "belaegning", label: "Belægning", render: (r) => `${pct(r.belaegningPct, 0)} · ${r.optaget}/${r.pladser}` },
              { key: "spaerret", label: "Spærret", num: true, render: (r) => num(r.spaerret) },
            ]}
            raekker={omraader}
            noegle={(r) => `${r.lager}-${r.zone}`}
            tom="Opret en lagerlokation for at se belægningen."
          />
          <div className="warehouse-card-action">{linkKnap("/ressourcer/lagerlokationer", "Administrér lokationer")}</div>
        </Kort>
      </div>

      <Kort titel="Beholdning under minimum">
        {lave.length ? (
          <Tabel
            kolonner={[
              { key: "varenummer", label: "Varenr.", render: (r) => <b>{r.vare.varenummer}</b> },
              { key: "vare", label: "Vare", render: (r) => r.vare.navn },
              { key: "ejer", label: "Ejer", render: (r) => vareEjer(r.vare, kunder).label },
              { key: "saldo", label: "På lager", num: true, render: (r) => num((total[r.vare.id] || 0) / 1000) },
              { key: "minimum", label: "Minimum", num: true, render: (r) => num(r.vare.minimum) },
            ]}
            raekker={lave.slice(0, 8)}
            noegle={(r) => r.vare.id}
          />
        ) : (
          <Tom handling={linkKnap("/warehouse/varer", "Åbn varer")}>Ingen varer er under minimum.</Tom>
        )}
      </Kort>
    </div>
  );
}
