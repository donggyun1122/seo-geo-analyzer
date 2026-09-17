import { useState } from "react";

function scoreColor(score) {
  if (score >= 80) return { bg: "#dcfce7", fg: "#16a34a" };
  if (score >= 50) return { bg: "#fef9c3", fg: "#ca8a04" };
  return { bg: "#fee2e2", fg: "#dc2626" };
}

function ScoreCircle({ score, label }) {
  const c = scoreColor(score);
  return (
    <div className="score-circle" style={{ background: c.bg, color: c.fg }}>
      <div className="num">{score}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function MiniScore({ score, label }) {
  const c = scoreColor(score);
  return (
    <div className="mini-score">
      <div className="mini-num" style={{ color: c.fg }}>
        {score}점
      </div>
      <div className="mini-label">{label}</div>
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
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, score, checks }) {
  const c = scoreColor(score);
  return (
    <div className="section">
      <div className="section-header">
        <h2>{title}</h2>
        <span className="section-score" style={{ background: c.bg, color: c.fg }}>
          {score}점
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

  return (
    <div className="container">
      <div className="header">
        <h1>SEO 사이트 분석기</h1>
        <p>URL을 입력하면 콘텐츠 SEO, 테크니컬 SEO, 검색엔진 친화도, 속도, 보안을 점검해드려요.</p>
      </div>

      <form className="search-box" onSubmit={handleAnalyze}>
        <input
          type="text"
          placeholder="예: example.com 또는 https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "분석 중..." : "분석하기"}
        </button>
      </form>

      {error && <div className="error-box">{error}</div>}

      {result && (
        <>
          <div className="summary-card">
            <ScoreCircle score={result.overallScore} label="종합 SEO 점수" />
            <div className="summary-url">{result.finalUrl}</div>
          </div>

          <div className="category-grid">
            <MiniScore score={result.categories.contentSeo.score} label="콘텐츠 SEO" />
            <MiniScore score={result.categories.technicalSeo.score} label="테크니컬 SEO" />
            <MiniScore score={result.categories.searchFriendliness.score} label="검색엔진 친화도" />
            <MiniScore score={result.categories.speedOptimization.score} label="속도 최적화" />
          </div>

          <Section
            title="1. 콘텐츠 SEO"
            score={result.categories.contentSeo.score}
            checks={result.categories.contentSeo.checks}
          />
          <Section
            title="2. 테크니컬 SEO"
            score={result.categories.technicalSeo.score}
            checks={result.categories.technicalSeo.checks}
          />
          <Section
            title="3. 검색엔진 친화도"
            score={result.categories.searchFriendliness.score}
            checks={result.categories.searchFriendliness.checks}
          />
          <Section
            title="4. 속도 최적화"
            score={result.categories.speedOptimization.score}
            checks={result.categories.speedOptimization.checks}
          />
          <Section
            title="보안 권장사항"
            score={result.security.score}
            checks={result.security.checks}
          />

          <div className="footer-note">
            분석 시각: {new Date(result.fetchedAt).toLocaleString("ko-KR")}
          </div>
        </>
      )}
    </div>
  );
}
