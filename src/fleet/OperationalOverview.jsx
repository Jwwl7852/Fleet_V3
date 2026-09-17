const empty = "—";

function present(value) {
  return value === null || value === undefined || value === "" ? empty : value;
}

export function OverviewStatus({ children, tone = "neutral" }) {
  return <span className={`fc-overview-status fc-overview-status--${tone}`}><i />{children}</span>;
}

function Kpi({ item }) {
  const content = <>
    <span className="fc-overview-kpi-copy"><small>{item.label}</small><strong>{present(item.value)}</strong><span>{item.note}</span></span>
    <span className={`fc-overview-kpi-icon fc-overview-kpi-icon--${item.tone || "neutral"}`} aria-hidden="true">{item.icon}</span>
  </>;
  return item.onClick ? <button type="button" className="fc-overview-kpi" onClick={item.onClick} aria-label={`${item.label}: ${present(item.value)}`}>{content}</button>
    : <article className="fc-overview-kpi">{content}</article>;
}

function OverviewTable({ table }) {
  return <section className="fc-overview-table-card" aria-labelledby={`${table.id}-title`}>
    <header><div><h2 id={`${table.id}-title`}>{table.title}</h2>{table.note ? <p>{table.note}</p> : null}</div>{table.onAll ? <button type="button" className="fc-overview-link" onClick={table.onAll}>{table.allLabel || "Se alle"} <span aria-hidden="true">→</span></button> : null}</header>
    {table.rows.length ? <div className="fc-overview-table-scroll"><table><thead><tr>{table.columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{table.rows.map((row, index) => {
      const rowKey = table.rowKey ? table.rowKey(row) : row.id || index;
      return <tr key={rowKey} className={table.onRow ? "fc-overview-row-clickable" : undefined} tabIndex={table.onRow ? 0 : undefined} onClick={table.onRow ? () => table.onRow(row) : undefined} onKeyDown={table.onRow ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); table.onRow(row); } } : undefined}>{table.columns.map((column) => <td key={column.key} data-label={column.label}>{column.render ? column.render(row) : present(row[column.key])}</td>)}</tr>;
    })}</tbody></table></div> : <div className="fc-overview-empty"><strong>Ingen aktuelle poster</strong><span>{table.empty}</span></div>}
  </section>;
}

export function OperationalOverview({ module, title = "Overblik", period, source, testData = false, kpis, action, tables }) {
  return <main className="fc-operational-overview" id="main-content">
    <header className="fc-overview-heading"><div><span>{module}</span><h1>{title}</h1><p>{period}{source ? ` · ${source}` : ""}</p></div>{testData ? <strong className="fc-overview-data-label">Syntetiske testdata</strong> : null}</header>
    <section className="fc-overview-summary" aria-label={`${module} nøgletal`}>
      <div className="fc-overview-kpis">{kpis.map((item) => <Kpi key={item.label} item={item} />)}</div>
      {action ? <button type="button" className="fc-overview-primary" disabled={action.disabled} onClick={action.onClick}><span aria-hidden="true">＋</span>{action.label}</button> : null}
    </section>
    <div className="fc-overview-tables">{tables.map((table) => <OverviewTable key={table.id} table={table} />)}</div>
  </main>;
}
