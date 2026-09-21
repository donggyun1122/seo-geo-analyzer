import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { CHECK_CATALOG, GRADE_LEGEND } from "../lib/checkCatalog";

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

// 종합 점수 등급 (90~100 최우수 / 70~89 우수 / 50~69 보완 필요 / 0~49 위험)
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

const BRAND_SOURCE_META = {
  blog: { label: "블로그", color: "#0071e3" },
  news: { label: "뉴스", color: "#5e5ce6" },
  cafearticle: { label: "카페", color: "#8e8e93" },
};

function formatCount(n) {
  if (typeof n !== "number") return "0";
  return n.toLocaleString("ko-KR");
}

function BrandTrendChart({ trend }) {
  const maxVal = Math.max(1, ...trend.map((d) => Math.max(d.blog, d.news)));
  return (
    <div className="brand-trend">
      <div className="brand-trend-legend">
        <span className="brand-legend-item">
          <span className="brand-legend-dot" style={{ background: BRAND_SOURCE_META.blog.color }} />
          블로그
        </span>
        <span className="brand-legend-item">
          <span className="brand-legend-dot" style={{ background: BRAND_SOURCE_META.news.color }} />
          뉴스
        </span>
      </div>
      <div className="brand-trend-chart">
        {trend.map((d) => (
          <div className="brand-trend-col" key={d.key}>
            <div className="brand-trend-bars">
              <div
                className="brand-trend-bar"
                style={{
                  height: `${Math.max(d.blog > 0 ? 4 : 0, (d.blog / maxVal) * 100)}px`,
                  background: BRAND_SOURCE_META.blog.color,
                }}
                title={`블로그 ${d.blog}건`}
              />
              <div
                className="brand-trend-bar"
                style={{
                  height: `${Math.max(d.news > 0 ? 4 : 0, (d.news / maxVal) * 100)}px`,
                  background: BRAND_SOURCE_META.news.color,
                }}
                title={`뉴스 ${d.news}건`}
              />
            </div>
            <div className="brand-trend-daylabel">{d.label}</div>
          </div>
        ))}
      </div>
      <p className="brand-trend-note">최근 14일 · 블로그/뉴스만 표시돼요 (카페글 검색 API는 발행일 정보를 제공하지 않아요).</p>
    </div>
  );
}

function BrandItemList({ items }) {
  if (!items || items.length === 0) {
    return <p className="brand-empty">최근 게시물을 찾지 못했어요.</p>;
  }
  return (
    <div>
      {items.map((it, idx) => (
        <div className="brand-item" key={`${it.link}-${idx}`}>
          <a className="brand-item-title" href={it.link} target="_blank" rel="noopener noreferrer">
            {it.title}
          </a>
          {it.dateLabel && <div className="brand-item-date">{it.dateLabel}</div>}
          {it.description && <div className="brand-item-desc">{it.description}</div>}
        </div>
      ))}
    </div>
  );
}

function BrandSourceCard({ sourceKey, source }) {
  const meta = BRAND_SOURCE_META[sourceKey];
  return (
    <div className="card brand-source-card">
      <div className="card-header">
        <h2>{meta.label}</h2>
        <span className="score-pill" style={{ background: "#f0f7ff", color: meta.color }}>
          약 {formatCount(source.total)}건
        </span>
      </div>
      {source.hasDates ? (
        <p className="brand-source-sub">최근 7일 {source.count7d}건 · 최근 30일 {source.count30d}건 (표시 중인 {source.fetchedCount}건 기준)</p>
      ) : (
        <p className="brand-source-sub">발행일 정보가 제공되지 않아 최근 {source.fetchedCount}건만 표시돼요.</p>
      )}
      <BrandItemList items={source.items} />
    </div>
  );
}

// 점수 섹션 하단 2단 레이아웃의 우측 카드 — 키워드 수정 + 요약 수치
function BrandSummaryCard({ keyword, onKeywordChange, onSubmit, loading, error, result }) {
  return (
    <div className="card brand-summary-compact">
      <div className="priority-title">📌 발행 분석 요약</div>
      <form className="brand-keyword-form" onSubmit={onSubmit}>
        <input
          type="text"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          placeholder="브랜드 키워드"
        />
        <button type="submit" disabled={loading || !keyword.trim()}>
          {loading ? "분석 중..." : "재분석"}
        </button>
      </form>
      <p className="brand-keyword-hint">사이트에서 자동으로 추정한 키워드예요. 다르면 수정 후 재분석해보세요.</p>

      {error && <p className="brand-summary-error">{error}</p>}

      {!error && !result && loading && <p className="brand-empty">네이버에서 관련 콘텐츠를 찾는 중이에요...</p>}
      {!error && !result && !loading && <p className="brand-empty">키워드를 확인하고 분석해보세요.</p>}

      {result && (
        <>
          <p className="brand-summary-total">
            <span className="brand-summary-total-num">약 {formatCount(result.totalMentions)}건</span>
            <span className="brand-summary-total-label">전체 추정 발행량</span>
          </p>
          <div className="brand-summary-rows">
            {["blog", "news", "cafearticle"].map((key) => {
              const s = result.sources[key];
              const meta = BRAND_SOURCE_META[key];
              return (
                <div className="brand-summary-row" key={key}>
                  <span className="brand-summary-row-label">
                    <span className="brand-legend-dot" style={{ background: meta.color }} />
                    {meta.label}
                  </span>
                  <span className="brand-summary-row-value">
                    약 {formatCount(s.total)}건{s.hasDates ? ` · 최근 7일 ${s.count7d}건` : ""}
                  </span>
                </div>
              );
            })}
          </div>
          <a className="brand-summary-link" href="#brand-detail">
            아래에서 게시물 목록 보기 ↓
          </a>
        </>
      )}
    </div>
  );
}

// 페이지 하단 — 브랜드 콘텐츠 발행 현황 상세(추이 그래프 + 소스별 목록)
function BrandDetailSection({ keyword, result }) {
  return (
    <div id="brand-detail">
      <div className="header brand-detail-header">
        <h2>브랜드 콘텐츠 발행 현황 — &ldquo;{keyword}&rdquo;</h2>
        <p>네이버 블로그·뉴스·카페 검색 기준이에요.</p>
      </div>
      <div className="card brand-trend-card">
        <BrandTrendChart trend={result.trend} />
      </div>
      <BrandSourceCard sourceKey="blog" source={result.sources.blog} />
      <BrandSourceCard sourceKey="news" source={result.sources.news} />
      <BrandSourceCard sourceKey="cafearticle" source={result.sources.cafearticle} />
      <div className="footer-note">분석 시각: {new Date(result.fetchedAt).toLocaleString("ko-KR")}</div>
    </div>
  );
}

// ---- 분석 전 미리보기: 어떤 항목들을 점검하는지 소개 ----
function PreviewSection() {
  return (
    <div className="seo-preview">
      <div className="seo-preview-heading">
        <h2>SEO 점수 분석 항목</h2>
        <p>
          총 <strong>100점 만점</strong>으로 웹사이트의 SEO 상태를 진단해요.
        </p>
      </div>

      <div className="seo-preview-grid">
        {Object.entries(CHECK_CATALOG).map(([key, cat]) => (
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
        {Object.entries(CHECK_CATALOG).map(([key, cat]) => (
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
        {GRADE_LEGEND.map((g) => {
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

export default function SeoCheckPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const [brandKeyword, setBrandKeyword] = useState("");
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandError, setBrandError] = useState("");
  const [brandResult, setBrandResult] = useState(null);

  async function runAnalyze(rawUrl) {
    const u = (rawUrl || "").trim();
    if (!u) return;
    setLoading(true);
    setError("");
    setResult(null);
    setBrandKeyword("");
    setBrandResult(null);
    setBrandError("");
    try {
      const res = await fetch("/api/analyze", {
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

  // 홈 화면에서 "?url=" 파라미터로 넘어온 경우 자동으로 분석을 실행합니다.
  useEffect(() => {
    if (!router.isReady) return;
    const queryUrl = router.query.url;
    if (typeof queryUrl === "string" && queryUrl.trim()) {
      setUrl(queryUrl);
      runAnalyze(queryUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  async function runBrandAnalyze(rawKeyword) {
    const kw = (rawKeyword || "").trim();
    if (!kw) return;
    setBrandLoading(true);
    setBrandError("");
    setBrandResult(null);
    try {
      const res = await fetch("/api/brand-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw }),
      });
      const data = await res.json();
      if (!data.ok) {
        setBrandError(data.error || "분석에 실패했습니다.");
      } else {
        setBrandResult(data);
      }
    } catch (err) {
      setBrandError("분석 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBrandLoading(false);
    }
  }

  function handleBrandSubmit(e) {
    e.preventDefault();
    runBrandAnalyze(brandKeyword);
  }

  // SEO 분석이 끝나면, 사이트에서 추정한 브랜드 키워드로 발행 현황도 자동 분석합니다.
  useEffect(() => {
    if (result && result.suggestedBrandKeyword) {
      setBrandKeyword(result.suggestedBrandKeyword);
      runBrandAnalyze(result.suggestedBrandKeyword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function handleReset() {
    setResult(null);
    setError("");
    setUrl("");
    setBrandKeyword("");
    setBrandResult(null);
    setBrandError("");
    if (inputRef.current) inputRef.current.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="container">
      <div className="header">
        <h1>SEO 점수 체크</h1>
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

          <div className="split-row">
            <PrioritySection priorityFixes={result.priorityFixes} />
            <BrandSummaryCard
              keyword={brandKeyword}
              onKeywordChange={setBrandKeyword}
              onSubmit={handleBrandSubmit}
              loading={brandLoading}
              error={brandError}
              result={brandResult}
            />
          </div>

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

          {brandResult && (
            <>
              <div className="section-divider" />
              <BrandDetailSection keyword={brandResult.keyword} result={brandResult} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
