import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { GEO_CHECK_CATALOG, GEO_GRADE_LEGEND } from "../lib/geoCheckCatalog";

const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
};

const CATEGORY_META = {
  coreEntity: { label: "핵심 엔티티 구성", max: 55 },
  attributeCompleteness: { label: "속성 완성도", max: 30 },
  entityConnectivity: { label: "엔티티 연결성", max: 15 },
};

// 카테고리별 소점수(0~100)에 쓰는 상태 색상 기준
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

const GRADE_TINTS = {
  good: { background: "#e7f7e7", color: STATUS.good },
  warning: { background: "#fef3dd", color: "#b9790a" },
  critical: { background: "#fbe9e8", color: STATUS.critical },
};

function overallGrade(score) {
  if (score >= 90) return { label: "최우수", status: "good" };
  if (score >= 70) return { label: "우수", status: "good" };
  if (score >= 50) return { label: "보완 필요", status: "warning" };
  return { label: "위험", status: "critical" };
}

function ScoreRing({ score, size = 168, stroke = 14 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - progress);
  const grade = overallGrade(score);
  const ringColor = STATUS[grade.status];
  const tint = GRADE_TINTS[grade.status];

  return (
    <div className="score-ring-block">
      <div className="score-ring-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e8e8ed" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
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
      <span className="grade-badge-ring" style={{ background: tint.background, color: tint.color }}>
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
      {!priorityFixes || priorityFixes.length === 0 ? (
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
                {c.recommendation && <div className="check-recommendation">💡 추천: {c.recommendation}</div>}
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

// ---- 분석 전 미리보기: 어떤 항목들을 점검하는지 소개 ----
function PreviewSection() {
  return (
    <div className="seo-preview">
      <div className="seo-preview-heading">
        <h2>GEO 엔티티 점수 분석 항목</h2>
        <p>
          총 <strong>100점 만점</strong>으로, AI 검색엔진(챗GPT·제미나이·퍼플렉시티 등)이 사이트를 하나의
          엔티티로 정확히 이해할 수 있는지 진단해요.
        </p>
      </div>

      <div className="seo-preview-grid">
        {Object.entries(GEO_CHECK_CATALOG).map(([key, cat]) => (
          <div className="seo-preview-card" key={key}>
            <div className="seo-preview-card-header">
              <span>
                {cat.icon} {cat.label}
              </span>
              <span className="seo-preview-weight">{cat.weight}점</span>
            </div>
            <div className="seo-preview-card-body">
              {cat.items.map((item) => (
                <div className="seo-preview-item" key={item.label}>
                  <div className="seo-preview-item-label">{item.label}</div>
                  <div className="seo-preview-item-desc">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card seo-structure-card">
        <p className="seo-structure-title">점수 구조 (100점 만점)</p>
        {Object.entries(GEO_CHECK_CATALOG).map(([key, cat]) => (
          <div className="meter-row" key={key}>
            <div className="meter-labels">
              <span className="name">{cat.label}</span>
              <span className="value">{cat.weight}점</span>
            </div>
            <div className="meter-track">
              <div
                className="meter-fill"
                style={{ width: `${cat.weight}%`, background: "var(--accent-blue)" }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="seo-grade-legend">
        {GEO_GRADE_LEGEND.map((g) => {
          const tint = GRADE_TINTS[g.status];
          return (
            <div className="seo-grade-legend-item" key={g.range} style={{ background: tint.background }}>
              <div className="seo-grade-legend-range" style={{ color: tint.color }}>
                {g.range}
              </div>
              <div className="seo-grade-legend-label">{g.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GeoEntityPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  async function runAnalyze(rawUrl) {
    const u = (rawUrl || "").trim();
    if (!u) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/geo-entity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
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

  function handleAnalyze(e) {
    e.preventDefault();
    runAnalyze(url);
  }

  // 홈 화면 등에서 "?url=" 파라미터로 넘어온 경우 자동으로 분석을 실행합니다.
  useEffect(() => {
    if (!router.isReady) return;
    const queryUrl = router.query.url;
    if (typeof queryUrl === "string" && queryUrl.trim()) {
      setUrl(queryUrl);
      runAnalyze(queryUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

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
        <h1>GEO 엔티티 점수 체크</h1>
        <p>URL을 입력하면 핵심 엔티티 구성, 속성 완성도, 엔티티 연결성을 점검해드려요.</p>
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

      {!result && !loading && <PreviewSection />}

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
            title="1. 핵심 엔티티 구성"
            score={result.categories.coreEntity.score}
            max={CATEGORY_META.coreEntity.max}
            checks={result.categories.coreEntity.checks}
          />
          <CategorySection
            title="2. 속성 완성도"
            score={result.categories.attributeCompleteness.score}
            max={CATEGORY_META.attributeCompleteness.max}
            checks={result.categories.attributeCompleteness.checks}
          />
          <CategorySection
            title="3. 엔티티 연결성"
            score={result.categories.entityConnectivity.score}
            max={CATEGORY_META.entityConnectivity.max}
            checks={result.categories.entityConnectivity.checks}
          />

          <div className="footer-note">분석 시각: {new Date(result.fetchedAt).toLocaleString("ko-KR")}</div>
        </div>
      )}
    </div>
  );
}
