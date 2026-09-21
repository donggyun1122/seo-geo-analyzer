import Link from "next/link";

export default function KeywordPage() {
  return (
    <div className="container">
      <div className="header">
        <h1>키워드 분석</h1>
        <p>브랜드/제품 키워드의 검색량과 트렌드를 분석하는 기능을 준비 중이에요.</p>
      </div>
      <div className="card coming-soon-card">
        <p className="coming-soon-badge">Coming Soon</p>
        <p className="coming-soon-desc">
          키워드 분석 기능은 아직 준비 중이에요. 지금은 SEO 점수 체크 페이지에서 브랜드 콘텐츠
          발행 현황(네이버 블로그·뉴스·카페)을 확인하실 수 있어요.
        </p>
        <Link href="/seo" className="home-content-link">
          SEO 점수 체크하러 가기 →
        </Link>
      </div>
    </div>
  );
}
