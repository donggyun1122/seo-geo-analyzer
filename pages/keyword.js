import { useState, useRef } from "react";

const BLOG_ENRICH_LIMIT = 15;

const COMP_STYLE = { 낮음: "low", 중간: "mid", 높음: "high" };

function formatNum(n) {
  if (typeof n !== "number") return "0";
  return n.toLocaleString("ko-KR");
}

function unavailableText(section) {
  if (!section) return "데이터를 가져오지 못했어요.";
  if (section.reason === "NOT_CONFIGURED") return "관련 API 키가 아직 설정되지 않았어요.";
  if (section.reason === "NO_DATA") return "데이터를 찾지 못했어요.";
  return "일시적으로 데이터를 가져오지 못했어요.";
}

// ---------- 통계 카드 ----------
function StatCard({ icon, label, unavailable, reason, children }) {
  return (
    <div className="card kw-stat-card">
      <div className="kw-stat-label">
        {icon} {label}
      </div>
      {unavailable ? (
        <div className="kw-stat-unavailable">{unavailableText(reason)}</div>
      ) : (
        children
      )}
    </div>
  );
}

// ---------- 검색량 트렌드 (12개월, 라인 차트 + 마우스오버 크로스헤어) ----------
function TrendLineChart({ data }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);
  const W = 640;
  const H = 200;
  const PAD_X = 20;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 28;
  const n = data.length;
  const maxRatio = Math.max(1, ...data.map((d) => d.ratio));

  const xAt = (i) => PAD_X + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD_X * 2));
  const yAt = (v) => H - PAD_BOTTOM - (v / maxRatio) * (H - PAD_TOP - PAD_BOTTOM);
  const points = data.map((d, i) => `${xAt(i)},${yAt(d.ratio)}`).join(" ");

  function handleMove(e) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    setHoverIdx(idx);
  }

  const hovered = hoverIdx !== null ? data[hoverIdx] : null;
  const hoveredX = hoverIdx !== null ? xAt(hoverIdx) : null;
  const tooltipLeftPct = hoveredX !== null ? Math.min(85, Math.max(15, (hoveredX / W) * 100)) : null;

  return (
    <div className="kw-linechart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="kw-linechart-svg"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="최근 12개월 검색량 트렌드"
      >
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={PAD_TOP + t * (H - PAD_TOP - PAD_BOTTOM)}
            y2={PAD_TOP + t * (H - PAD_TOP - PAD_BOTTOM)}
            className="kw-chart-grid"
          />
        ))}
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent-blue)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((d, i) => (
          <circle
            key={d.period}
            cx={xAt(i)}
            cy={yAt(d.ratio)}
            r={hoverIdx === i ? 5 : 0}
            fill="var(--accent-blue)"
            stroke="#fff"
            strokeWidth="2"
          />
        ))}
        {hoverIdx !== null && (
          <line x1={hoveredX} x2={hoveredX} y1={PAD_TOP} y2={H - PAD_BOTTOM} className="kw-chart-crosshair" />
        )}
      </svg>
      <div className="kw-linechart-xaxis">
        {data.map((d, i) => (
          <span key={d.period} className={i === hoverIdx ? "active" : ""}>
            {d.monthLabel}
          </span>
        ))}
      </div>
      {hovered && (
        <div className="kw-chart-tooltip" style={{ left: `${tooltipLeftPct}%` }}>
          <div className="kw-chart-tooltip-value">{hovered.ratio.toFixed(1)}</div>
          <div className="kw-chart-tooltip-label">{hovered.label} 상대 검색비율(최고월=100)</div>
        </div>
      )}
    </div>
  );
}

// ---------- 월별 / 요일별 검색 비율 (막대 차트 + 마우스오버 툴팁) ----------
function RatioBarChart({ data }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.percent));

  return (
    <div className="kw-barchart">
      {data.map((d, i) => (
        <div
          key={d.label}
          className={`kw-bar-col${hoverIdx === i ? " hover" : ""}`}
          onMouseEnter={() => setHoverIdx(i)}
          onMouseLeave={() => setHoverIdx(null)}
          onFocus={() => setHoverIdx(i)}
          onBlur={() => setHoverIdx(null)}
          tabIndex={0}
        >
          {hoverIdx === i && (
            <div className="kw-bar-tooltip">
              <div className="kw-chart-tooltip-value">{d.percent}%</div>
              <div className="kw-chart-tooltip-label">{d.label}</div>
            </div>
          )}
          <div className="kw-bar-track">
            <div className="kw-bar-fill" style={{ height: `${Math.max(4, (d.percent / max) * 100)}%` }} />
          </div>
          <div className="kw-bar-axislabel">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- 연관 키워드 테이블 ----------
function RelatedKeywordTable({ related, totalFound }) {
  if (!related || related.length === 0) {
    return <p className="brand-empty">연관 키워드를 찾지 못했어요.</p>;
  }
  return (
    <div>
      <div className="kw-table-wrap">
        <table className="kw-table">
          <thead>
            <tr>
              <th>연관 키워드</th>
              <th>PC 검색량</th>
              <th>모바일 검색량</th>
              <th>합계</th>
              <th>광고 경쟁정도</th>
              <th>블로그 누적발행량</th>
              <th>철자 유사도</th>
            </tr>
          </thead>
          <tbody>
            {related.map((r) => (
              <tr key={r.keyword}>
                <td className="kw-table-keyword">{r.keyword}</td>
                <td>{r.pcLabel}</td>
                <td>{r.mobileLabel}</td>
                <td>{formatNum(r.totalCount)}</td>
                <td>
                  <span className={`kw-comp-badge kw-comp-${COMP_STYLE[r.compIdx] || "unknown"}`}>
                    {r.compIdx}
                  </span>
                </td>
                <td>
                  {r.blogTotal === undefined
                    ? "-"
                    : r.blogTotal === null
                    ? "조회 실패"
                    : `${formatNum(r.blogTotal)}건`}
                </td>
                <td>{r.similarity}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="kw-table-note">
        검색광고 API 기준 연관 키워드 {formatNum(totalFound)}개 중 검색량 상위 {related.length}개를
        표시했어요. 블로그 누적발행량은 상위 {BLOG_ENRICH_LIMIT}개 키워드까지만 추가로 조회돼요. &lsquo;광고
        경쟁정도&rsquo;는 검색광고 입찰 경쟁 수준이며, 실제 SEO(자연 검색) 경쟁도와는 다를 수 있어요.
      </p>
    </div>
  );
}

export default function KeywordPage() {
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  async function runAnalyze(rawKeyword) {
    const kw = (rawKeyword || "").trim();
    if (!kw) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/keyword-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "분석에 실패했습니다.");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError("분석 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runAnalyze(keyword);
  }

  function handleReset() {
    setResult(null);
    setError("");
    setKeyword("");
    if (inputRef.current) inputRef.current.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const content = result && result.content;
  const searchVolume = result && result.searchVolume;
  const saturation = result && result.saturation;
  const trend = result && result.trend;

  const monthlyTotalLabel =
    searchVolume && searchVolume.available
      ? `${formatNum(searchVolume.seed.totalCount)}회`
      : null;

  return (
    <div className="container">
      <div className="header">
        <h1>키워드 분석</h1>
        <p>네이버 기준으로 키워드의 검색량, 연관 키워드, 콘텐츠 발행 현황과 검색 트렌드를 분석해드려요.</p>
      </div>

      <form className="search-box" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          placeholder="분석할 키워드를 입력하세요"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button type="submit" disabled={loading || !keyword.trim()}>
          {loading ? "분석 중..." : "분석하기"}
        </button>
      </form>

      {error && <div className="error-box">{error}</div>}

      {loading && <p className="brand-empty kw-loading">네이버에서 키워드 데이터를 가져오는 중이에요...</p>}

      {result && (
        <div className="content-col">
          <div className="hero-footer kw-hero-footer">
            <span className="score-url">&ldquo;{result.keyword}&rdquo; 분석 결과</span>
            <button className="reset-link-btn" onClick={handleReset} type="button">
              새로 분석하기 ↻
            </button>
          </div>

          <div className="kw-stat-grid">
            <StatCard
              icon="🔍"
              label="월간 검색량 (PC + 모바일)"
              unavailable={!searchVolume || !searchVolume.available}
              reason={searchVolume}
            >
              {searchVolume && searchVolume.available && (
                <>
                  <div className="kw-stat-value">{monthlyTotalLabel}</div>
                  <div className="kw-stat-sub">
                    PC {searchVolume.seed.pcLabel}회 · 모바일 {searchVolume.seed.mobileLabel}회
                  </div>
                </>
              )}
            </StatCard>

            <StatCard
              icon="📈"
              label="이번 달 예상 검색량"
              unavailable={!searchVolume || !searchVolume.available}
              reason={searchVolume}
            >
              {searchVolume && searchVolume.available && (
                <>
                  <div className="kw-stat-value">{monthlyTotalLabel}</div>
                  <div className="kw-stat-sub">네이버 검색광고 API의 최근 집계 기준 추정치예요.</div>
                </>
              )}
            </StatCard>

            <StatCard
              icon="📝"
              label="월간 콘텐츠 발행량"
              unavailable={!content || !content.available}
              reason={content}
            >
              {content && content.available && (
                <>
                  <div className="kw-stat-value">
                    블로그 최근 30일 {formatNum(content.blogRecent30d)}건{content.blogRecent30dCapped ? "+" : ""}
                  </div>
                  <div className="kw-stat-sub">
                    블로그 누적 {formatNum(content.blogTotal)}건 · 카페 누적 {formatNum(content.cafeTotal)}건
                  </div>
                </>
              )}
            </StatCard>

            <StatCard
              icon="🌡️"
              label="콘텐츠 포화지수"
              unavailable={!saturation || !saturation.available}
              reason={
                !content || !content.available
                  ? content
                  : !searchVolume || !searchVolume.available
                  ? searchVolume
                  : { reason: "NO_DATA" }
              }
            >
              {saturation && saturation.available && (
                <>
                  <div className="kw-stat-value">
                    {saturation.label}
                    <span
                      className="score-pill kw-saturation-pill"
                      style={{
                        background:
                          saturation.status === "good"
                            ? "#e7f7e7"
                            : saturation.status === "warning"
                            ? "#fef3dd"
                            : "#fbe9e8",
                        color:
                          saturation.status === "good"
                            ? "var(--status-good)"
                            : saturation.status === "warning"
                            ? "var(--status-warning)"
                            : "var(--status-critical)",
                      }}
                    >
                      {saturation.ratio}
                    </span>
                  </div>
                  <div className="kw-stat-sub">블로그 누적발행량 ÷ 월간 검색량으로 직접 계산한 참고 지수예요.</div>
                </>
              )}
            </StatCard>
          </div>

          <div className="card kw-chart-card">
            <div className="card-header">
              <h2>검색량 트렌드 (최근 12개월)</h2>
            </div>
            {trend && trend.available ? (
              <TrendLineChart data={trend.trend} />
            ) : (
              <p className="kw-stat-unavailable">{unavailableText(trend)}</p>
            )}
          </div>

          <div className="split-row">
            <div className="card kw-chart-card">
              <div className="card-header">
                <h2>월별 검색 비율</h2>
              </div>
              {trend && trend.available ? (
                <RatioBarChart data={trend.byMonth} />
              ) : (
                <p className="kw-stat-unavailable">{unavailableText(trend)}</p>
              )}
            </div>
            <div className="card kw-chart-card">
              <div className="card-header">
                <h2>요일별 검색 비율</h2>
              </div>
              {trend && trend.available ? (
                <RatioBarChart data={trend.byWeekday} />
              ) : (
                <p className="kw-stat-unavailable">{unavailableText(trend)}</p>
              )}
            </div>
          </div>

          <div className="split-row">
            <div className="card kw-chart-card">
              <div className="card-header">
                <h2>연령별 검색 비율</h2>
              </div>
              {trend && trend.available ? (
                <RatioBarChart data={trend.byAge} />
              ) : (
                <p className="kw-stat-unavailable">{unavailableText(trend)}</p>
              )}
            </div>
            <div className="card kw-chart-card">
              <div className="card-header">
                <h2>성별 검색 비율</h2>
              </div>
              {trend && trend.available ? (
                <RatioBarChart data={trend.byGender} />
              ) : (
                <p className="kw-stat-unavailable">{unavailableText(trend)}</p>
              )}
            </div>
          </div>

          <div className="card category-card">
            <div className="card-header">
              <h2>연관 키워드</h2>
            </div>
            {searchVolume && searchVolume.available ? (
              <RelatedKeywordTable related={searchVolume.related} totalFound={searchVolume.totalRelatedFound} />
            ) : (
              <p className="kw-stat-unavailable">{unavailableText(searchVolume)}</p>
            )}
          </div>

          <div className="footer-note">분석 시각: {new Date(result.fetchedAt).toLocaleString("ko-KR")}</div>
        </div>
      )}
    </div>
  );
}
