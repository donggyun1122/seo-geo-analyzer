import Link from "next/link";
import Icon from "../components/Icon";
import Reveal from "../components/ui/Reveal";
import TrendChart from "../components/charts/TrendChart";
import ScrollHero from "../components/home/ScrollHero";
import FeaturePreview from "../components/home/FeaturePreview";
import Delta from "../components/home/Delta";
import { QUICK_TOOLS } from "../lib/siteNav";
import { FEATURE_PREVIEWS, TODAY_INTELLIGENCE } from "../lib/demoData";

// DG MKT LAB 홈 화면.
// 순서: Hero(스크롤 연출) → Quick Analysis → Core Features → From Data to Insight → Today's Marketing Intelligence
//       → Workflow → Built by a Marketer → CTA (푸터는 _app.js에서 공통으로 붙어요)
// 대시보드·카드 안의 숫자는 화면 구성을 보여주는 예시 데이터(lib/demoData.js)예요.

const CORE_FEATURES = [
  {
    no: "01",
    key: "search",
    area: "SEARCH",
    title: "Search Intelligence",
    tags: ["SEO", "GEO", "AEO", "Keyword"],
    desc: "검색엔진과 생성형 검색 환경에서 브랜드의 노출 상태와 검색 기회를 분석합니다.",
    links: [
      { label: "SEO Analysis", href: "/seo" },
      { label: "GEO · AEO", href: "/geo" },
      { label: "Keyword Analysis", href: "/keyword" },
    ],
  },
  {
    no: "02",
    key: "advertising",
    area: "ADVERTISING",
    title: "Advertising Intelligence",
    tags: ["Search Ads", "Performance", "Creative"],
    desc: "검색광고와 광고 성과 데이터를 분석하고 개선 포인트를 발견합니다.",
    links: [
      { label: "Search Ads Analysis", href: "/search-ad-rank" },
      { label: "Ad Creative Analysis", href: "/search-ad" },
    ],
  },
  {
    no: "03",
    key: "local",
    area: "LOCAL",
    title: "Local Intelligence",
    tags: ["Place", "Ranking", "Review"],
    desc: "플레이스 검색 노출과 순위, 리뷰 데이터를 분석합니다.",
    links: [
      { label: "Place Analysis", href: "/keyword-place-list" },
      { label: "Place Ranking", href: "/place" },
    ],
  },
  {
    no: "04",
    key: "competitor",
    area: "COMPETITOR",
    title: "Competitor Intelligence",
    tags: ["Competitor", "Keyword", "Search"],
    desc: "경쟁사의 검색 및 마케팅 활동을 분석하고 변화를 확인합니다.",
    links: [{ label: "Ad Creative Analysis", href: "/search-ad" }],
    soon: "Competitor Monitoring",
  },
  {
    no: "05",
    key: "market",
    area: "MARKET",
    title: "Market Intelligence",
    tags: ["News", "Trend", "Industry"],
    desc: "시장 변화와 업계 주요 이슈를 빠르게 확인합니다.",
    links: [{ label: "News Clipping", href: "/news-clipping" }],
  },
];

const INSIGHT_STEPS = [
  { no: "01", title: "ANALYZE", ko: "데이터를 모으고 분석합니다", icon: "layers", items: ["Search", "Advertising", "Local", "Competitor", "Market"] },
  { no: "02", title: "UNDERSTAND", ko: "변화의 의미를 읽습니다", icon: "lightbulb", items: ["Trend", "Opportunity", "Risk", "Change"] },
  { no: "03", title: "ACT", ko: "다음 액션으로 연결합니다", icon: "zap", items: ["Optimize", "Plan", "Execute", "Measure"] },
];

const WORKFLOW = [
  { title: "DISCOVER", ko: "시장 탐색", icon: "compass" },
  { title: "ANALYZE", ko: "데이터 분석", icon: "lineChart" },
  { title: "IDENTIFY", ko: "기회 발견", icon: "lightbulb" },
  { title: "ACT", ko: "마케팅 실행", icon: "zap" },
  { title: "MEASURE", ko: "성과 측정", icon: "gauge" },
];

const SKILLS = ["SEO", "GEO", "AEO", "SEARCH ADS", "KEYWORD", "LOCAL", "COMPETITOR", "ANALYTICS", "MARKETING DATA"];

function SectionHead({ eyebrow, title, sub, align = "center" }) {
  return (
    <Reveal className={`section-head section-head-${align}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </Reveal>
  );
}

function QuickCard({ tool, index }) {
  const inner = (
    <>
      <span className="quick-card-top">
        <span className="quick-card-icon">
          <Icon name={tool.icon} size={20} />
        </span>
        <span className="quick-card-tag">{tool.tag}</span>
      </span>
      <strong>{tool.label}</strong>
      <span className="quick-card-desc">{tool.desc}</span>
      <span className="quick-card-foot">
        {tool.soon ? <span className="gnb-soon">Soon</span> : <span className="quick-card-go">바로가기</span>}
        {!tool.soon && (
          <span className="quick-card-arrow">
            <Icon name="arrowRight" size={18} />
          </span>
        )}
      </span>
    </>
  );
  return (
    <Reveal delay={(index % 4) * 60}>
      {tool.soon ? (
        <div className="quick-card quick-card-disabled" aria-disabled="true">
          {inner}
        </div>
      ) : (
        <Link href={tool.href} className="quick-card">
          {inner}
        </Link>
      )}
    </Reveal>
  );
}

export default function Home() {
  const today = TODAY_INTELLIGENCE;
  return (
    <div className="home">
      {/* ── HERO (스크롤 연출: 큰 글자 → 영상 전체 화면 → 카피) ── */}
      <ScrollHero />

      {/* ── QUICK ANALYSIS ───────────────────────────────── */}
      <section className="section section-white" id="tools">
        <div className="wrap">
          <SectionHead eyebrow="QUICK ANALYSIS" title="Marketing Tools" sub="필요한 분석을 바로 시작하세요." />
          <div className="quick-grid">
            {QUICK_TOOLS.map((tool, i) => (
              <QuickCard key={tool.tag} tool={tool} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CORE FEATURES ────────────────────────────────── */}
      <section className="section">
        <div className="wrap">
          <SectionHead eyebrow="CORE FEATURES" title="마케팅에 필요한 분석을 한 곳에서" sub="Everything marketers need to analyze." />
          <div className="core-list">
            {CORE_FEATURES.map((f, i) => (
              <Reveal key={f.key} className={`core-row${i % 2 === 1 ? " core-row-reverse" : ""}`}>
                <div className="core-copy">
                  <span className="core-no">
                    {f.no} <b>{f.area}</b>
                  </span>
                  <h3>{f.title}</h3>
                  <div className="core-tags">
                    {f.tags.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p>{f.desc}</p>
                  <div className="core-links">
                    {f.links.map((l) => (
                      <Link key={l.label} href={l.href} className="text-link">
                        {l.label}
                        <Icon name="arrowRight" size={16} />
                      </Link>
                    ))}
                    {f.soon && (
                      <span className="text-link text-link-soon">
                        {f.soon}
                        <span className="gnb-soon">Soon</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="core-visual">
                  <FeaturePreview data={FEATURE_PREVIEWS[f.key]} />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FROM DATA TO INSIGHT ─────────────────────────── */}
      <section className="section section-white">
        <div className="wrap">
          <SectionHead
            eyebrow="MARKETING INTELLIGENCE"
            title="From Data to Insight."
            sub={
              <>
                데이터를 수집하는 것에서 끝나지 않습니다.
                <br />
                변화를 발견하고 다음 액션까지 연결합니다.
              </>
            }
          />
          <div className="insight-flow">
            {INSIGHT_STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 90} className="insight-step-wrap">
                <div className="insight-step">
                  <span className="insight-step-icon">
                    <Icon name={s.icon} size={22} />
                  </span>
                  <span className="insight-step-no">{s.no}</span>
                  <h3>{s.title}</h3>
                  <p>{s.ko}</p>
                  <ul>
                    {s.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </div>
                {i < INSIGHT_STEPS.length - 1 && (
                  <span className="insight-arrow" aria-hidden="true">
                    <Icon name="arrowRight" size={20} />
                  </span>
                )}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── TODAY'S MARKETING INTELLIGENCE ───────────────── */}
      <section className="section">
        <div className="wrap">
          <SectionHead
            eyebrow="TODAY"
            title="Today's Marketing Intelligence"
            sub="오늘 주목해야 할 검색·시장·경쟁사 변화를 확인하세요."
          />
          <Reveal className="today-note">
            <span className="chip chip-muted">DEMO DATA</span>
            화면 구성을 보여주는 예시 데이터입니다.
          </Reveal>
          <div className="today-grid">
            <Reveal className="today-card">
              <div className="today-card-head">
                <span className="today-card-tag">SEARCH TREND</span>
                <h3>오늘의 검색 트렌드</h3>
              </div>
              <ol className="today-rank">
                {today.searchTrend.map((k) => (
                  <li key={k.rank}>
                    <span className="today-rank-no">{k.rank}</span>
                    <span className="today-rank-name">{k.name}</span>
                    <Delta value={k.change} />
                  </li>
                ))}
              </ol>
              <Link href="/keyword" className="text-link">
                Keyword Analysis
                <Icon name="arrowRight" size={16} />
              </Link>
            </Reveal>

            <Reveal delay={60} className="today-card">
              <div className="today-card-head">
                <span className="today-card-tag">KEYWORD</span>
                <h3>주목할 키워드</h3>
              </div>
              <div className="today-table" role="table" aria-label="주목할 키워드(예시)">
                <div className="today-table-row today-table-head" role="row">
                  <span role="columnheader">Keyword</span>
                  <span role="columnheader">Volume</span>
                  <span role="columnheader">Comp.</span>
                  <span role="columnheader">Trend</span>
                </div>
                {today.keywords.map((k) => (
                  <div className="today-table-row" role="row" key={k.name}>
                    <span role="cell">{k.name}</span>
                    <span role="cell">{k.volume}</span>
                    <span role="cell">{k.competition}</span>
                    <span role="cell" className="today-spark">
                      <TrendChart values={k.trend} height={24} mini area={false} ariaLabel={`${k.name} 추이`} />
                    </span>
                  </div>
                ))}
              </div>
              <Link href="/keyword" className="text-link">
                Keyword Analysis
                <Icon name="arrowRight" size={16} />
              </Link>
            </Reveal>

            <Reveal delay={120} className="today-card">
              <div className="today-card-head">
                <span className="today-card-tag">COMPETITOR</span>
                <h3>Competitor Alert</h3>
              </div>
              <ul className="today-alerts">
                {today.competitor.map((c) => (
                  <li key={c.label}>
                    <span>
                      <strong>{c.label}</strong>
                      <small>{c.note}</small>
                    </span>
                    <b>{c.value}</b>
                  </li>
                ))}
              </ul>
              <span className="text-link text-link-soon">
                Competitor Monitoring
                <span className="gnb-soon">Soon</span>
              </span>
            </Reveal>

            <Reveal delay={180} className="today-card">
              <div className="today-card-head">
                <span className="today-card-tag">NEWS</span>
                <h3>Marketing News</h3>
              </div>
              <ul className="today-news">
                {today.news.map((n) => (
                  <li key={n.tag}>
                    <span className="chip">{n.tag}</span>
                    <span>{n.title}</span>
                  </li>
                ))}
              </ul>
              <Link href="/news-clipping" className="text-link">
                News Clipping
                <Icon name="arrowRight" size={16} />
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── WORKFLOW ─────────────────────────────────────── */}
      <section className="section section-white">
        <div className="wrap">
          <SectionHead eyebrow="WORKFLOW" title="One workflow for better marketing." sub="탐색부터 성과 측정까지, 하나의 흐름으로 연결합니다." />
          <ol className="workflow">
            {WORKFLOW.map((w, i) => (
              <Reveal as="li" key={w.title} delay={i * 70} className="workflow-step">
                <span className="workflow-icon">
                  <Icon name={w.icon} size={22} />
                </span>
                <span className="workflow-text">
                  <small>STEP {String(i + 1).padStart(2, "0")}</small>
                  <strong>{w.title}</strong>
                  <span>{w.ko}</span>
                </span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── BUILT BY A MARKETER ──────────────────────────── */}
      <section className="section">
        <div className="wrap about">
          <Reveal className="about-copy">
            <span className="eyebrow">ABOUT</span>
            <h2>Built by a Marketer.</h2>
            <p>실무에서 반복되는 데이터 분석과 리서치 업무를 더 빠르고 효율적으로 수행하기 위해 만들었습니다.</p>
          </Reveal>
          <Reveal delay={100} className="about-skills">
            <span className="about-skills-label">Marketing · Technology</span>
            <div className="about-chips">
              {SKILLS.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────── */}
      <section className="cta-section">
        <div className="wrap">
          <Reveal className="cta">
            <h2>Ready to turn data into action?</h2>
            <p>데이터를 다음 마케팅으로 연결해보세요.</p>
            <div className="cta-actions">
              <a href="#tools" className="btn btn-primary btn-lg">
                분석 시작하기
                <Icon name="arrowRight" size={18} />
              </a>
              <Link href="/dashboard" className="btn btn-outline-light btn-lg">
                Dashboard 보기
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
