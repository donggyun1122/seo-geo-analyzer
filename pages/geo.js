import Link from "next/link";

export default function GeoPage() {
  return (
    <div className="container">
      <div className="header">
        <h1>GEO·SEO</h1>
        <p>생성형 AI 답변(챗GPT, 제미나이 등)에서의 노출도를 진단하는 기능을 준비 중이에요.</p>
      </div>
      <div className="card coming-soon-card">
        <p className="coming-soon-badge">Coming Soon</p>
        <p className="coming-soon-desc">
          GEO(Generative Engine Optimization) 점수 체크 기능은 아직 준비 중이에요. 먼저 SEO 점수
          체크를 이용해보세요.
        </p>
        <Link href="/seo" className="home-content-link">
          SEO 점수 체크하러 가기 →
        </Link>
      </div>
    </div>
  );
}
