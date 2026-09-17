import { useState, useRef } from "react";

const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
};

const CATEGORY_META = {
  contentSeo: { label: "콘텐츠 SEO", max: 50 },
  technicalSeo: { label: "테크니컬 SEO", max: 20 },
  searchFriendliness: { label: "검색엔진 친화도", max: 20 },
  speedOptimization: { label: "속도 최적화", max: 10 },
};

// 카테고리별 소점수(0~100)에 쓰는 상태 색상 기준 (기존 그대로 유지)
function statusOf(score) {
  if (score >= 80) return "good";
  if (score >= 50) return "warning";
  return "critical";
}

function pillStyle(score) {
  const s = statusOf(score);
  if (s === "good") return { background: "#e7f7e7", color: STATUS.good };
  if (s === "warning") return { background: "#fef3dd", color: "#b9790a" };
  return { background: "#fbe9e8", color: STATUS.critical };
}

// 종합 점수 등급 (90~100 최우수 / 70~89 우수 / 50~69 보완 필요 / 0~49 위험)
function overallGrade(score) {
  if (score >= 90) return { label: "최우수", color: STATUS.good };
  if (score >= 70) return { label: "우수", color: STATUS.good };
  if (score >= 50) return { label: "보완 필요", color: STATUS.warning };
  return { label: "위험", color: STATUS.critical };
}

function ScoreRing({ score, size = 168, stroke = 14 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - progress);
  const grade = overallGrade(score);

  return (
    <div className="score-ring-block">
      <div className="score-ring-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#3a3a3c" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={grade.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="score-ring-center">
          <div className="score-ring-num">{score}</div>
          <div className="score-ring-max">/ 100</div>
        </div>
      </div>
      <span className="grade-badge-ring" style={{ borderColor: grade.color, color: grade.color }}>
        {grade.label}
      </span>
    </div>
  );
}

function CategoryMeter({ label, score, max }) {
  const points = Math.round((score / 100) * max);
  const fillColor = STATUS[statusOf(score)];
  return (
    <div className="meter-row">
      <div className="meter-labels">
        <span className="name">{label}</span>
        <span className="value">
          {points}/{max}점
        </span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${score}%`, background: fillColor }} />
      </div>
    </div>
  );
}

function CheckList({ checks }) {
  return (
    <div>
      {checks.map((c) => (
        <div className="check-item" key={c.id}>
          <div className={`check-icon ${c.pass ? "pass" : "fail"}`}>{c.pass ? "✓" : "✕"}</div>
          <div className="check-text">
            <div className="check-label">{c.label}</div>
            <div className="check-detail">{c.detail}</div>
            {!c.pass && c.recommendation && (
              <div className="check-recommendation">💡 추천: {c.recommendation}</div>
            )}
            {!c.pass && c.evidence && <pre className="check-code">{c.evidence}</pre>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PrioritySection({ priorityFixes }) {
  return (
    <div className="card priority-card">
      <div className="priority-title">🎯 우선 개선 Top 5</div>
      {(!priorityFixes || priorityFixes.length === 0) ? (
        <p className="priority-empty">모든 주요 항목이 양호합니다. 특별히 시급한 개선사항이 없어요.</p>
      ) : (
        <>
          <p className="priority-subtitle">
            전체 점검 항목 중 중요도가 높으면서 아직 안 되어 있는 항목이에요. 이것부터 고치시는 걸 추천드려요.
          </p>
          {priorityFixes.map((c, idx) => (
            <div className="priority-item" key={c.id}>
              <div className="priority-rank">{idx + 1}</div>
              <div className="check-text">
                <div className="check-label">
                  <span className="priority-category">[{c.category}]</span> {c.label}
                </div>
                <div className="check-detail">{c.detail}</div>
                {c.recommendation && (
                  <div className="check-recommendation">💡 추천: {c.recommendation}</div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function CategorySection({ title, score, max, checks }) {
  const pill = pillStyle(score);
  const points = Math.round((score / 100) * max);
  return (
    <div className="card category-card">
      <div className="card-header">
        <h2>{title}</h2>
        <span className="score-pill" style={{ background: pill.background, color: pill.color }}>
          {points}/{max}점
        </span>
      </div>
      <CheckList checks={checks} />
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  async function handleAnalyze(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
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

  function handleReset() {
    setResult(null);
    setError("");
    setUrl("");
    if (inputRef.current) inputRef.current.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="container">
      <div className="header">
        <h1>SEO 사이트 분석기</h1>
        <p>URL을 입력하면 콘텐츠 SEO, 테크니컬 SEO, 검색엔진 친화도, 속도, 보안을 점검해드려요.</p>
      </div>

      <form className="search-box" onSubmit={handleAnalyze}>
        <input
          ref={inputRef}
          type="text"
          placeholder="예: example.com 또는 https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "분석 중..." : "분석하기"}
        </button>
      </form>
      <p className="search-hint">http:// 또는 https:// 없이 입력해도 자동으로 인식돼요.</p>

      {error && <div className="error-box">{error}</div>}

      {result && (
        <div className="content-col">
          <div className="hero-card">
            <ScoreRing score={result.overallScore} />
            <div className="hero-divider" />
            <div className="meter-card-inline">
              <p className="meter-title">카테고리별 점수</p>
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <CategoryMeter
                  key={key}
                  label={meta.label}
                  score={result.categories[key].score}
                  max={meta.max}
                />
              ))}
            </div>
          </div>

          <div className="hero-footer">
            <span className="score-url">{result.finalUrl}</span>
            <button className="reset-link-btn" onClick={handleReset} type="button">
              새로 분석하기 ↻
            </button>
          </div>

          <PrioritySection priorityFixes={result.priorityFixes} />

          <CategorySection
            title="1. 콘텐츠 SEO"
            score={result.categories.contentSeo.score}
            max={CATEGORY_META.contentSeo.max}
            checks={result.categories.contentSeo.checks}
          />
          <CategorySection
            title="2. 테크니컬 SEO"
            score={result.categories.technicalSeo.score}
            max={CATEGORY_META.technicalSeo.max}
            checks={result.categories.technicalSeo.checks}
          />
          <CategorySection
            title="3. 검색엔진 친화도"
            score={result.categories.searchFriendliness.score}
            max={CATEGORY_META.searchFriendliness.max}
            checks={result.categories.searchFriendliness.checks}
          />
          <CategorySection
            title="4. 속도 최적화"
            score={result.categories.speedOptimization.score}
            max={CATEGORY_META.speedOptimization.max}
            checks={result.categories.speedOptimization.checks}
          />

          <div className="card category-card">
            <div className="card-header">
              <h2>보안 권장사항</h2>
              <span
                className="score-pill"
                style={{
                  background: pillStyle(result.security.score).background,
                  color: pillStyle(result.security.score).color,
                }}
              >
                {result.security.score}점
              </span>
            </div>
            <CheckList checks={result.security.checks} />
          </div>

          <div className="footer-note">
            분석 시각: {new Date(result.fetchedAt).toLocaleString("ko-KR")}
          </div>
        </div>
      )}
    </div>
  );
}
