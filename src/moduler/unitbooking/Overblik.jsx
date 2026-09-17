import { useNavigate } from "react-router-dom";
import { OperationalOverview, OverviewStatus } from "../../fleet/OperationalOverview.jsx";
import { useListe } from "../../fleet/useListe.js";
import { demoMode } from "../../firebase.js";
import { DEMO_KASSER, DEMO_KASSEUDLAAN } from "../../fleet/demo-unitbooking.js";
import { BINDENDE, UDLAAN_TILSTAND, ledigeKasser } from "../../fleet/unitbooking.js";
import { Henter, Datatilstand } from "../../fleet/ui.jsx";

const date = (value) => Number.isFinite(value) ? new Intl.DateTimeFormat("da-DK", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Copenhagen" }).format(value) : "—";

export default function UnitbookingOverblik() {
  const navigate = useNavigate();
  const kasser = useListe("kasser", { graense: 2000, demo: DEMO_KASSER });
  const udlaan = useListe("kasseudlaan", { graense: 2000, demo: DEMO_KASSEUDLAAN });
  const importer = useListe("unitbookingImporter", { graense: 500, demo: [] });
  if (kasser.henter || udlaan.henter || importer.henter) return <Henter hvad="UNITBOOKING-overblikket" />;
  const failed = [kasser, udlaan, importer].find((source) => source.fejl);
  if (failed) return <Datatilstand tilstand={failed.tilstand} genprov={failed.genindlaes} />;
  const now = Date.now(); const horizon = now + 90 * 86400000;
  const active = udlaan.data.filter((item) => BINDENDE.includes(item.tilstand));
  const unitMap = Object.fromEntries(kasser.data.map((item) => [item.id, item]));
  const availableNextDay = ledigeKasser(unitMap, udlaan.data, { fra: now, til: now + 86400000 });
  const events = active.flatMap((item) => {
    const rows = [];
    if (item.tilstand !== "udlaant") rows.push({ ...item, eventId: `${item.id}-out`, eventAt: item.fra, activity: "Udlevering" });
    rows.push({ ...item, eventId: `${item.id}-return`, eventAt: item.til, activity: "Retur" });
    return rows;
  }).filter((item) => item.eventAt >= now - 86400000 && item.eventAt <= horizon).sort((left, right) => left.eventAt - right.eventAt).slice(0, 5);
  const drafts = importer.data.filter((item) => item.status !== "bekraeftet").sort((left, right) => Number(left.oprettetMs || 0) - Number(right.oprettetMs || 0)).slice(0, 5);
  return <OperationalOverview
    module="UNITBOOKING" title="UNITBOOKING – overblik"
    period="Aktive bookinger og kommende 90 dage · Europe/Copenhagen" source="Kasser, udlån og bookingimport" testData={demoMode}
    kpis={[
      { label: "Ledige units", value: availableNextDay.length, note: "brugbare uden reservationskonflikt næste 24 timer", icon: "▥", onClick: () => navigate("/ressourcer/units") },
      { label: "Aktive bookinger", value: active.length, note: "booket, klargjort eller udlånt", icon: "▦", tone: "warn", onClick: () => navigate("/unitbooking/kalender") },
      { label: "Bestillinger til kontrol", value: importer.data.filter((item) => item.status !== "bekraeftet").length, note: "gemte importudkast, ikke parsing-gæt", icon: "▤", tone: "warn", onClick: () => navigate("/unitbooking/import") },
    ]}
    action={{ label: "Opret booking", onClick: () => navigate("/unitbooking/import") }}
    tables={[
      { id: "unit-events", title: "Kommende udleveringer og returer", note: "Nærmeste hændelse først · højst 5", onAll: () => navigate("/unitbooking/kalender"), rows: events, rowKey: (row) => row.eventId, onRow: (row) => navigate(`/unitbooking/kalender?booking=${encodeURIComponent(row.id)}`), columns: [
        { key: "date", label: "Dato", render: (row) => date(row.eventAt) }, { key: "booking", label: "Bookingnr.", render: (row) => <strong>{row.sagsnummer || row.id}</strong> }, { key: "customer", label: "Kunde", render: (row) => row.kunde || "Ikke angivet" }, { key: "unit", label: "Unit", render: (row) => row.kasseId }, { key: "activity", label: "Aktivitet" }, { key: "status", label: "Status", render: (row) => <OverviewStatus tone={row.eventAt < now ? "bad" : "warn"}>{UDLAAN_TILSTAND[row.tilstand]?.label || row.tilstand}</OverviewStatus> }, { key: "action", label: "Handling", render: () => <span className="fc-overview-link">Se booking →</span> },
      ], empty: "Der er ingen bindende udleveringer eller returer i de kommende 90 dage." },
      { id: "unit-imports", title: "Bestillinger til behandling", note: "Kun servergemte importudkast · højst 5", onAll: () => navigate("/unitbooking/import"), rows: drafts, onRow: () => navigate("/unitbooking/import"), columns: [
        { key: "received", label: "Modtaget", render: (row) => date(row.oprettetMs) }, { key: "reference", label: "Reference", render: (row) => <strong>{row.kladde?.eksternReference || row.eksternReference || row.id}</strong> }, { key: "customer", label: "Kunde", render: (row) => row.kladde?.kunde || row.kunde || "Ikke angivet" }, { key: "file", label: "Bestillingsfil", render: (row) => row.original?.filnavn || (row.original?.art === "tekst" ? "Indsat tekst" : "Originalmateriale") }, { key: "read", label: "Aflæsning", render: (row) => row.status === "gennemgang" ? "Kræver gennemgang" : row.status }, { key: "status", label: "Status", render: (row) => <OverviewStatus tone="warn">{row.status || "Udkast"}</OverviewStatus> }, { key: "action", label: "Handling", render: () => <span className="fc-overview-link">Se bestilling →</span> },
      ], empty: "Der er ingen gemte bookingimporter, som afventer kontrol." },
    ]}
  />;
}
