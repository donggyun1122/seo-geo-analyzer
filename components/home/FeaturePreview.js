import TrendChart from "../charts/TrendChart";
import Delta from "./Delta";

// 핵심 기능 영역의 화면 미리보기 카드.
// data 모양: { question, metrics?: [{label, value, meter?, delta?, good?, sub?, deltaLabel?}],
//              rows?: [{name, note, value}], chart: { title, values, invert?, step? } }
export default function FeaturePreview({ data }) {
  return (
    <div className="fp-card" aria-label="화면 미리보기(예시)">
      <div className="fp-head">
        <span className="fp-question">{data.question}</span>
        <span className="chip chip-muted">Sample</span>
      </div>

      {data.metrics && (
        <ul className="fp-metrics">
          {data.metrics.map((m) => (
            <li key={m.label}>
              <span className="fp-metric-label">{m.label}</span>
              {typeof m.meter === "number" && (
                <span className="fp-meter" aria-hidden="true">
                  <i style={{ width: `${m.meter}%` }} />
                </span>
              )}
              <span className="fp-metric-value">
                {m.value}
                {m.sub && <small>{m.sub}</small>}
              </span>
              {typeof m.delta === "number" && <Delta value={m.delta} good={m.good} label={m.deltaLabel} />}
            </li>
          ))}
        </ul>
      )}

      {data.rows && (
        <ul className="fp-rows">
          {data.rows.map((r) => (
            <li key={r.name}>
              <span className="fp-row-name">{r.name}</span>
              <span className="fp-row-note">{r.note}</span>
              <span className="fp-row-value">{r.value}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="fp-chart">
        <span className="fp-chart-title">{data.chart.title}</span>
        <TrendChart values={data.chart.values} height={84} mini invert={data.chart.invert} step={data.chart.step} ariaLabel={data.chart.title} />
      </div>
    </div>
  );
}
