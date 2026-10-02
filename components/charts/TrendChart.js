import { useMemo, useRef, useState } from "react";

// 선(영역) 그래프 — 홈 화면 대시보드 미리보기와 기능 카드에서 함께 써요.
// values 배열만 바꾸면 실제 데이터로 교체할 수 있어요.
//
//  values   숫자 배열(필수)
//  labels   각 지점 이름(선택 — 마우스를 올렸을 때 보여줘요)
//  height   그래프 높이(px)
//  mini     true면 축·눈금·마우스 반응 없이 선만 그려요(스파크라인)
//  invert   true면 값이 작을수록 위로(순위 그래프용)
//  step     true면 계단형 선
//  format   값 표시 형식 함수
export default function TrendChart({
  values,
  labels,
  height = 180,
  mini = false,
  invert = false,
  step = false,
  area = true,
  format = (v) => String(v),
  ariaLabel = "추이 그래프",
}) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 600;
  const H = 200;

  const geo = useMemo(() => {
    const n = values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.18 || 1;
    const lo = min - pad;
    const hi = max + pad;
    const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v) => {
      const t = (v - lo) / (hi - lo);
      return invert ? t * H : H - t * H;
    };
    const pts = values.map((v, i) => [x(i), y(v)]);
    let d = "";
    pts.forEach(([px, py], i) => {
      if (i === 0) d += `M${px.toFixed(1)},${py.toFixed(1)}`;
      else if (step) d += ` H${px.toFixed(1)} V${py.toFixed(1)}`;
      else d += ` L${px.toFixed(1)},${py.toFixed(1)}`;
    });
    const areaD = `${d} L${W},${H} L0,${H} Z`;
    return { pts, d, areaD };
  }, [values, invert, step]);

  function onMove(e) {
    if (mini || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const i = Math.max(0, Math.min(values.length - 1, Math.round((cx / rect.width) * (values.length - 1))));
    setHover(i);
  }

  const last = geo.pts[geo.pts.length - 1];
  const hp = hover != null ? geo.pts[hover] : null;

  return (
    <div
      ref={wrapRef}
      className={`trend-chart${mini ? " trend-chart-mini" : ""}`}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
      onTouchStart={onMove}
      onTouchMove={onMove}
      onTouchEnd={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {!mini &&
          [0.25, 0.5, 0.75].map((t) => (
            <line key={t} x1="0" x2={W} y1={H * t} y2={H * t} className="trend-chart-grid" vectorEffect="non-scaling-stroke" />
          ))}
        <g className="trend-chart-plot">
          {area && <path d={geo.areaD} className="trend-chart-area" />}
          <path d={geo.d} className="trend-chart-line" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      {/* 끝점 표시(가장 최근 값) */}
      <span className="trend-chart-dot" style={{ left: `${(last[0] / W) * 100}%`, top: `${(last[1] / H) * 100}%` }} />
      {hp && (
        <>
          <span className="trend-chart-cross" style={{ left: `${(hp[0] / W) * 100}%` }} />
          <span className="trend-chart-dot trend-chart-dot-hover" style={{ left: `${(hp[0] / W) * 100}%`, top: `${(hp[1] / H) * 100}%` }} />
          <span
            className="trend-chart-tip"
            style={{ left: `${Math.min(88, Math.max(12, (hp[0] / W) * 100))}%`, top: `${(hp[1] / H) * 100}%` }}
          >
            {labels && labels[hover] ? <em>{labels[hover]}</em> : null}
            <strong>{format(values[hover])}</strong>
          </span>
        </>
      )}
    </div>
  );
}
