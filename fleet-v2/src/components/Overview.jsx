import { useMemo, useState } from "react";
import { fleetDemo } from "../demoData";
import { Icon } from "./Icon";
import { MiniBarChart, MiniLineChart, OperationChart } from "./OverviewCharts";
import { GeoMap } from "./GeoMap";
import { useFleetData } from "../data/FleetDataContext";
import { deriveOverview } from "../data/unitSelectors";
import { OPERATION_PERIODS } from "../data/overviewWorkflow";

const formatNumber = new Intl.NumberFormat("da-DK");

function LinkButton({ children, onClick }) {
  return <button className="link-button" onClick={onClick} type="button">{children}<Icon name="chevron" size={14} /></button>;
}

function CardHeader({ title, children }) {
  return <div className="card-header"><h2>{title}</h2>{children}</div>;
}

function KpiCard({ icon, tone, value, label, percent, change, changeTone, caption, progress, onClick }) {
  return (
    <button type="button" className={`kpi-card ${tone}`} onClick={onClick} aria-label={`Åbn ${label}: ${value}`}>
      <span className="kpi-icon"><Icon name={icon} size={30} strokeWidth={2} /></span>
      <div className="kpi-main">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
      {percent ? <span className="kpi-percent">{percent}</span> : null}
      <span className={`kpi-change ${changeTone || "positive"}`}>{change}</span>
      <small>{caption}</small>
      {progress ? <span className="progress-track"><i style={{ width: progress }} /></span> : null}
    </button>
  );
}

function ActionList({ items, total, onNavigate }) {
  return (
    <section className="card action-card">
      <CardHeader title="Kræver handling nu"><LinkButton onClick={() => onNavigate("/arbejdsko")}>Se alle ({total})</LinkButton></CardHeader>
      <div className="action-list">
        {items.map((item) => (
          <button type="button" key={`${item.unit}-${item.reportId}`} className={`action-row ${item.level}`} onClick={() => item.reportId ? onNavigate(`/indberetninger/${item.reportId}`) : onNavigate("/arbejdsko")}>
            <span className="action-icon"><Icon name="warning" size={16} strokeWidth={2.3} /></span>
            <span className="action-copy"><strong>{item.unit}</strong><small>{item.title}</small></span>
            <time>{item.time}</time>
          </button>
        ))}
      </div>
      <small className="action-scope">Viser {items.length} af {total} åbne sager med status Ny eller Under vurdering.</small>
    </section>
  );
}

function ServiceCard({ data, onNavigate, total }) {
  return (
    <section className="card table-card service-card">
      <CardHeader title="Kommende service og syn"><LinkButton onClick={() => onNavigate("/service")}>Se alle ({total})</LinkButton></CardHeader>
      <div className="table-head service-grid"><span>Enhed</span><span>Type</span><span>Dato</span><span>Km</span><span>Status</span></div>
      {data.map((item) => (
        <button className="table-row service-grid" type="button" key={`${item.unit}-${item.type}`} onClick={() => onNavigate("/service")}>
          <strong>{item.unit}</strong><span>{item.type}</span><span>{item.date}</span><span>{item.meter}</span><span className="due"><i />{item.status}</span>
        </button>
      ))}
    </section>
  );
}

function ReportsCard({ data, onNavigate, total }) {
  return (
    <section className="card table-card reports-card">
      <CardHeader title="Åbne indberetninger"><LinkButton onClick={() => onNavigate("/indberetninger")}>Se alle ({total})</LinkButton></CardHeader>
      <div className="table-head report-grid"><span>Type</span><span>Antal</span><span>Seneste</span></div>
      {data.map((item) => (
        <button className="table-row report-grid" type="button" key={item.label} onClick={() => onNavigate("/indberetninger")}>
          <span className="report-type"><i className={item.color}><Icon name={item.icon} size={15} /></i>{item.label}</span>
          <strong>{item.count}</strong><span>{item.latest}</span>
        </button>
      ))}
    </section>
  );
}

const monthLabel = (month, long = false) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString("da-DK", {
  timeZone: "UTC", month: long ? "long" : "short", year: long ? "numeric" : undefined,
}).replace(".", "");

function comparisonText(current, lastYear, unit = "") {
  if (!Number.isFinite(current) || !Number.isFinite(lastYear)) return "Samme måned sidste år: mangler data";
  const delta = current - lastYear;
  const sign = delta > 0 ? "+" : "";
  return `Samme måned sidste år: ${sign}${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 }).format(delta)}${unit}`;
}

function CostsCard({ data, costMonths, selectedMonth, onMonthChange }) {
  const months = data.chartMonths.map((month) => monthLabel(month));
  return (
    <section className="card cost-card">
      <CardHeader title="Omkostninger og nedetid"><label className="period-picker"><span className="sr-only">Omkostningsmåned</span><select aria-label="Omkostningsmåned" value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)}>{costMonths.map((month) => <option key={month} value={month}>{monthLabel(month, true)}</option>)}</select></label></CardHeader>
      <div className="cost-columns">
        <div className="cost-section">
          <span>Registrerede faktiske flådeomkostninger</span>
          <div className="cost-number">{Number.isFinite(data.totals.monthlyCost) ? `DKK ${formatNumber.format(data.totals.monthlyCost)}` : "Mangler data"}</div>
          <p>{comparisonText(data.totals.monthlyCost, data.costLastYear, " DKK")}</p>
          <MiniBarChart values={data.costByMonth} />
          <div className="chart-months">{months.map((month) => <span key={`cost-${month}`}>{month}</span>)}</div>
        </div>
        <div className="cost-section downtime">
          <span>Nedetid fra registrerede statusintervaller</span>
          <div className="cost-number">{Number.isFinite(data.totals.downtimePct) ? `${String(data.totals.downtimePct).replace(".", ",")} %` : "Mangler data"}</div>
          <p>{comparisonText(data.totals.downtimePct, data.downtimeLastYear, " procentpoint")}</p>
          <MiniLineChart values={data.downtimeByMonth} />
          <div className="chart-months">{months.map((month) => <span key={`down-${month}`}>{month}</span>)}</div>
        </div>
      </div>
    </section>
  );
}

export function Overview({ onNavigate }) {
  const { units, relations, loading } = useFleetData();
  const costMonths = useMemo(() => [...new Set((relations.costs || []).map((item) => item.month || item.date?.slice(0, 7)).filter(Boolean))].sort(), [relations.costs]);
  const [operationPeriod, setOperationPeriod] = useState("week");
  const [selectedMonth, setSelectedMonth] = useState(() => costMonths.at(-1) || "2025-03");
  const effectiveMonth = costMonths.includes(selectedMonth) ? selectedMonth : costMonths.at(-1) || selectedMonth;
  const derived = deriveOverview(units, relations, { operationPeriod, costMonth: effectiveMonth });
  const data = { ...fleetDemo, ...derived, totals: derived.totals };
  const pct = (value) => data.totals.units ? `${Math.round(value / data.totals.units * 100)} %` : "0 %";
  if (loading) return <main className="dashboard loading-state" id="main-content"><span className="loading-spinner" /><p>Indlæser lokale demodata …</p></main>;
  return (
    <main className="dashboard" id="main-content">
      <section className="dashboard-heading">
        <div><h1>God aften, Dennis</h1><p>Her er status på din flåde i dag, {data.meta.dateLabel}</p></div>
        <div className="weather-block"><Icon name="weather" size={34} /><strong>6°</strong><span><b>København</b><small>Let skyet · demo</small></span></div>
        <div className="sustainability"><span className="trend-mark">╱╱</span><span>Vi holder din flåde<br />kørende længere</span></div>
        <span className="demo-badge">{data.meta.demoLabel}</span>
      </section>

      <section className="kpi-grid" aria-label="Flådens nøgletal">
        <KpiCard icon="unit" tone="blue" value={data.totals.units} label="enheder" change="Lokalt" caption="beregnet fra prototypens enhedsregister" onClick={() => onNavigate("/enheder")} />
        <KpiCard icon="check" tone="green" value={data.totals.inOperation} label="i drift" percent={pct(data.totals.inOperation)} change="Demo" caption="åbn enhedsregisteret og vælg status I drift" progress={pct(data.totals.inOperation)} onClick={() => onNavigate("/enheder?status=operation")} />
        <KpiCard icon="wrench" tone="red" value={data.totals.workshop} label="på værksted" percent={pct(data.totals.workshop)} change="Demo" changeTone="negative" caption="åbn værkstedsforløb" progress={pct(data.totals.workshop)} onClick={() => onNavigate("/vaerksted")} />
        <KpiCard icon="warning" tone="orange" value={data.totals.needsAction} label="kræver handling" percent={pct(data.totals.needsAction)} change="Demo" changeTone="negative" caption="åbn samlet arbejdskø" progress={pct(data.totals.needsAction)} onClick={() => onNavigate("/arbejdsko")} />
      </section>

      <section className="middle-grid">
        <section className="card operation-card">
          <CardHeader title="Flådens driftsstatus"><label className="period-picker"><span className="sr-only">Driftsperiode</span><select aria-label="Driftsperiode" value={operationPeriod} onChange={(event) => setOperationPeriod(event.target.value)}>{Object.entries(OPERATION_PERIODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></CardHeader>
          <OperationChart days={data.operationDays} />
          <div className="legend"><span><i className="green" />I drift</span><span><i className="red" />På værksted</span><span><i className="blue" />Kræver handling</span><small>Datadækning {data.operationCoverage.pct} % · syntetisk registreret historik</small></div>
        </section>
        <section className="card map-card">
          <CardHeader title="Livekort"><span className="map-count"><i />{(relations.positions || []).length} positioner</span><button className="map-link" type="button" onClick={() => onNavigate("/livekort")}>Åbn livekort <Icon name="external" size={14} /></button></CardHeader>
          <GeoMap positions={relations.positions || []} units={units} compact controls={false} onSelect={(unitId) => onNavigate(`/enheder/${unitId}`)} />
        </section>
        <ActionList items={data.actionItems} total={data.totals.needsAction} onNavigate={onNavigate} />
      </section>

      <section className="bottom-grid">
        <ServiceCard data={data.serviceItems} total={data.totals.upcomingService} onNavigate={onNavigate} />
        <ReportsCard data={data.reportItems} total={data.totals.reports} onNavigate={onNavigate} />
        <CostsCard data={data} costMonths={costMonths} selectedMonth={effectiveMonth} onMonthChange={setSelectedMonth} />
      </section>
    </main>
  );
}
