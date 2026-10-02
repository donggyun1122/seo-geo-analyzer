import TrendChart from "../charts/TrendChart";
import CountUp from "../ui/CountUp";
import Delta from "./Delta";

// 홈 Hero 오른쪽의 대시보드 미리보기.
// data 모양: { title, period, kpis: [{label, value, prefix, suffix, decimals, delta, deltaSuffix, neutral}],
//              chart: { title, labels, values } }
// 지금은 예시 데이터(lib/demoData.js)를 넣고 있고, 나중에 실제 데이터를 같은 모양으로 넘기면 그대로 동작해요.
export default function HeroDashboard({ data, sample = true }) {
  return (
    <div className="hero-dash" aria-label="대시보드 미리보기(예시 화면)">
      <div className="hero-dash-bar">
        <div className="hero-dash-title">
          <span className="hero-dash-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <strong>{data.title}</strong>
        </div>
        <div className="hero-dash-meta">
          <span className="chip">{data.period}</span>
          {sample && <span className="chip chip-muted">Sample</span>}
        </div>
      </div>

      <div className="hero-dash-kpis">
        {data.kpis.map((k) => (
          <div className="kpi-tile" key={k.label}>
            <span className="kpi-tile-label">{k.label}</span>
            <span className="kpi-tile-value">
              <CountUp value={k.value} decimals={k.decimals || 0} prefix={k.prefix || ""} suffix={k.suffix || ""} />
            </span>
            <Delta value={k.delta} suffix={k.deltaSuffix} neutral={k.neutral} />
          </div>
        ))}
      </div>

      <div className="hero-dash-chart">
        <div className="hero-dash-chart-head">
          <strong>{data.chart.title}</strong>
          <span>{data.period}</span>
        </div>
        <TrendChart values={data.chart.values} labels={data.chart.labels} height={170} ariaLabel={`${data.chart.title} 추이`} />
      </div>
    </div>
  );
}
