import { Icon } from "./Icon";

export function OperationChart({ days }) {
  const max = Math.max(10, ...days.map((day) => day.operation + day.workshop + day.action)) * 1.1;
  return (
    <div className="operation-chart" aria-label="Flådens driftsstatus de seneste 14 dage">
      <div className="y-labels"><span>150</span><span>100</span><span>50</span><span>0</span></div>
      <div className="plot-grid">
        {[0, 1, 2, 3].map((line) => <span className="grid-line" key={line} />)}
        <div className="bars">
          {days.map((day) => (
            <div className="bar-column" key={day.label} title={`${day.label}: ${day.operation} i drift, ${day.workshop} på værksted, ${day.action} kræver handling`}>
              <div className="bar-stack" style={{ height: `${((day.operation + day.workshop + day.action) / max) * 100}%` }}>
                <span className="bar-action" style={{ flex: day.action }} />
                <span className="bar-workshop" style={{ flex: day.workshop }} />
                <span className="bar-operation" style={{ flex: day.operation }} />
              </div>
              <small>{day.label}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DemoMap({ points, onUnavailable }) {
  return (
    <div className="demo-map" aria-label="Demokort over fiktive enhedspositioner">
      <svg viewBox="0 0 500 300" role="img" aria-label="Illustreret kort over Danmark med fiktive positioner">
        <defs>
          <linearGradient id="water" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b9ddf4" /><stop offset="1" stopColor="#86bfe3" /></linearGradient>
          <pattern id="map-grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0v44" fill="none" stroke="#fff" strokeOpacity=".2" /></pattern>
        </defs>
        <rect width="500" height="300" fill="url(#water)" />
        <rect width="500" height="300" fill="url(#map-grid)" />
        <path className="land" d="M0 8L93 0l10 25 36 16-8 27 30 17-9 37 34 18-19 21 16 33-34 18-9 37-57-5-31 28L0 257z" />
        <path className="land" d="M250 0l15 27-13 26 18 30-24 31 16 22-31 25 21 32-12 31 25 28-12 48h247V0z" />
        <path className="island" d="M225 158l19 7-3 33-27 18-34-4-9-24 24-21z" />
        <path className="island" d="M290 180l31-10 28 13 15 29-17 31-34 11-28-19-8-31z" />
        <path className="road" d="M95 25c34 48 48 82 38 128s23 72 50 86M259 25c24 49 15 90 52 116s37 65 42 109M171 187c55 8 94 13 167 32" />
      </svg>
      {points.map((point, index) => (
        <span className={`map-pin ${point.status}`} key={`${point.x}-${point.y}`} style={{ left: `${point.x}%`, top: `${point.y}%` }}>
          {index === 2 ? <Icon name="warning" size={11} strokeWidth={2.5} /> : null}
          {point.label ? <em>{point.label}</em> : null}
        </span>
      ))}
      <div className="map-cluster cluster-one">3</div>
      <div className="map-cluster cluster-two">2</div>
      <div className="map-controls"><button type="button" aria-label="Zoom ind" onClick={() => onUnavailable("Kortzoom")}>+</button><button type="button" aria-label="Zoom ud" onClick={() => onUnavailable("Kortzoom")}>−</button></div>
      <span className="map-demo-label">Demokort · ikke live</span>
    </div>
  );
}

export function MiniBarChart({ values }) {
  const max = Math.max(...values);
  return (
    <div className="mini-bars" aria-label="Månedlige flådeomkostninger">
      {values.map((value, index) => <span key={value} className={index === values.length - 1 ? "current" : ""} style={{ height: `${(value / max) * 100}%` }} />)}
    </div>
  );
}

export function MiniLineChart({ values }) {
  const width = 190;
  const height = 70;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${height - (value / 6) * height}`).join(" ");
  return (
    <svg className="mini-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Månedlig nedetid">
      <path d="M0 20h190M0 55h190" />
      <polyline points={points} />
      {values.map((value, index) => <circle key={`${value}-${index}`} cx={(index / (values.length - 1)) * width} cy={height - (value / 6) * height} r="3" />)}
    </svg>
  );
}
