import { useNavigate } from "react-router-dom";
import { OperationalOverview, OverviewStatus } from "../../fleet/OperationalOverview.jsx";
import { useListe } from "../../fleet/useListe.js";
import { Henter, Datatilstand } from "../../fleet/ui.jsx";
import { underMinimum, udenLokation } from "../../fleet/warehouse.js";
import { demoMode } from "../../firebase.js";
import { DEMO_BEHOLDNING, DEMO_CARRIERS, DEMO_VARER } from "../../fleet/demo-lager.js";

const date = (value) => Number.isFinite(value) ? new Intl.DateTimeFormat("da-DK", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Copenhagen" }).format(value) : "Dato mangler";

export default function WarehouseOverblik() {
  const navigate = useNavigate();
  const varer = useListe("varer", { graense: 2000, demo: DEMO_VARER });
  const beholdning = useListe("beholdning", { graense: 5000, demo: DEMO_BEHOLDNING });
  const carriers = useListe("carriers", { graense: 2000, demo: DEMO_CARRIERS });
  const ordrer = useListe("plukordrer", { graense: 2000, demo: [] });
  if (varer.henter || beholdning.henter || carriers.henter || ordrer.henter) return <Henter hvad="WAREHOUSE-overblikket" />;
  const failed = [varer, beholdning, carriers, ordrer].find((source) => source.fejl);
  if (failed) return <Datatilstand tilstand={failed.tilstand} genprov={failed.genindlaes} />;
  const today = new Date(); today.setHours(0, 0, 0, 0); const tomorrow = today.getTime() + 86400000;
  const incoming = carriers.data.filter((item) => item.status === "iTransit");
  const outgoing = ordrer.data.filter((item) => !["afsendt", "annulleret"].includes(item.tilstand));
  const outgoingToday = outgoing.filter((item) => Number.isFinite(item.afgangMs) && item.afgangMs >= today.getTime() && item.afgangMs < tomorrow);
  const movements = [
    ...incoming.map((item) => ({ id: `in-${item.id}`, dateMs: item.forventetModtagelseMs || null, reference: item.etapeId || item.id, type: "Modtagelse", party: item.kundeId || "Ikke angivet", units: item.kolli ?? 1, status: item.forventetModtagelseMs ? "Forventet" : "Dato mangler", tone: item.forventetModtagelseMs ? "warn" : "neutral", to: "/warehouse/modtagelse" })),
    ...outgoing.map((item) => ({ id: `out-${item.id}`, dateMs: item.afgangMs || null, reference: item.nummer || item.id, type: "Udlevering", party: item.kundeId || "Ikke angivet", units: Object.keys(item.linjer || {}).length, status: item.tilstand || "Ikke angivet", tone: item.tilstand === "frigivet" ? "warn" : "info", to: "/warehouse/pluk" })),
  ].sort((left, right) => (left.dateMs ?? Number.MAX_SAFE_INTEGER) - (right.dateMs ?? Number.MAX_SAFE_INTEGER)).slice(0, 5);
  const low = underMinimum(varer.data, beholdning.data);
  const tasks = [
    ...carriers.data.filter((item) => item.status === "paaLager" && udenLokation(item)).map((item) => ({ id: `place-${item.id}`, task: "Placér carrier", object: item.id, priority: "Høj", status: "Mangler lokation", tone: "warn", to: "/warehouse/modtagelse" })),
    ...low.map((item) => ({ id: `low-${item.vare.id}`, task: "Beholdning under minimum", object: `${item.vare.varenummer} · ${item.vare.navn}`, priority: "Høj", status: "Kræver handling", tone: "bad", to: "/warehouse/varer" })),
    ...outgoing.filter((item) => ["frigivet", "plukker"].includes(item.tilstand)).map((item) => ({ id: `pick-${item.id}`, task: "Pluk og udlever", object: item.nummer || item.id, priority: item.prioritet === "høj" ? "Høj" : "Normal", status: item.tilstand, tone: "info", to: "/warehouse/pluk" })),
  ].slice(0, 5);
  return <OperationalOverview
    module="WAREHOUSE" title="WAREHOUSE – overblik"
    period="I dag og kommende registrerede hændelser · Europe/Copenhagen" source="WAREHOUSE-noder" testData={demoMode}
    kpis={[
      { label: "Items på lager", value: beholdning.data.length, note: "beholdningsposter; units og lokationer tælles ikke", icon: "▦", onClick: () => navigate("/warehouse/varer") },
      { label: "Forventede modtagelser i dag", value: incoming.some((item) => !Number.isFinite(item.forventetModtagelseMs)) ? "Mangler dato" : incoming.filter((item) => item.forventetModtagelseMs >= today.getTime() && item.forventetModtagelseMs < tomorrow).length, note: "i transit; manglende forventet dato vises særskilt", icon: "↓", tone: "warn", onClick: () => navigate("/warehouse/modtagelse") },
      { label: "Udleveringer i dag", value: outgoingToday.length, note: "åbne plukordrer med afgang i dag", icon: "↑", tone: "warn", onClick: () => navigate("/warehouse/pluk") },
    ]}
    tables={[
      { id: "warehouse-movements", title: "Kommende modtagelser og udleveringer", note: "Registreret dato først; manglende dato til sidst · højst 5", onAll: () => navigate("/warehouse/bevaegelser"), rows: movements, onRow: (row) => navigate(row.to), columns: [
        { key: "date", label: "Dato", render: (row) => date(row.dateMs) }, { key: "reference", label: "Reference", render: (row) => <strong>{row.reference}</strong> }, { key: "type", label: "Type" }, { key: "party", label: "Kunde / leverandør" }, { key: "units", label: "Antal items" }, { key: "status", label: "Status", render: (row) => <OverviewStatus tone={row.tone}>{row.status}</OverviewStatus> }, { key: "action", label: "Handling", render: () => <span className="fc-overview-link">Se detaljer →</span> },
      ], empty: "Der er ingen registrerede modtagelser eller udleveringer. En hændelse uden dato gættes ikke." },
      { id: "warehouse-tasks", title: "Lageropgaver til behandling", note: "Placering og minimumsafvigelser før almindelige pluk · højst 5", onAll: () => navigate("/warehouse/pluk"), rows: tasks, onRow: (row) => navigate(row.to), columns: [
        { key: "task", label: "Opgave", render: (row) => <strong>{row.task}</strong> }, { key: "object", label: "Item / unit" }, { key: "priority", label: "Prioritet" }, { key: "status", label: "Status", render: (row) => <OverviewStatus tone={row.tone}>{row.status}</OverviewStatus> }, { key: "action", label: "Handling", render: () => <span className="fc-overview-link">Åbn arbejdsflade →</span> },
      ], empty: "Der er ingen lageropgaver, som kræver behandling." },
    ]}
  />;
}
