import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");

  function handleQuickCheck(e) {
    e.preventDefault();
    if (!url.trim()) return;
    router.push(`/seo?url=${encodeURIComponent(url.trim())}`);
  }

  return (
    <div>
      <section className="home-hero">
        <div className="home-hero-inner">
          <span className="home-eyebrow">SEO · GEO · 웹사이트 진단</span>
          <h1 className="home-headline">
            우리 사이트, 검색엔진에서
            <br />
            제대로 보이고 있을까요?
          </h1>
          <p className="home-subcopy">
            URL 하나만 입력하면 콘텐츠 SEO, 테크니컬 SEO, 검색엔진 친화도, 속도까지 한 번에
            점검하고 개선 방향을 알려드려요.
          </p>

          <form className="home-hero-form" onSubmit={handleQuickCheck}>
            <input
              type="text"
              placeholder="예: example.com 또는 https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button type="submit">SEO 체크하기 →</button>
          </form>
          <p className="home-hero-hint">http:// 또는 https:// 없이 입력해도 자동으로 인식돼요.</p>
        </div>
      </section>

      <section className="home-content-section">
        <div className="home-content-row">
          <div className="home-content-text">
            <h2>왜 SEO 점검이 필요할까요?</h2>
            <p>
              검색엔진과 AI 답변 엔진 모두 사이트의 구조와 콘텐츠 품질을 기준으로 노출 여부를
              판단해요. 기본적인 SEO 요소가 갖춰져 있지 않으면 아무리 좋은 콘텐츠도 검색 결과에
              묻히기 쉬워요. (이 영역은 서비스 소개 내용으로 자유롭게 채워보세요.)
            </p>
            <Link href="/seo" className="home-content-link">
              SEO 점수 체크해보기 →
            </Link>
          </div>
          <div className="home-content-image-placeholder">이미지 영역</div>
        </div>

        <div className="home-content-row reverse">
          <div className="home-content-text">
            <h2>브랜드 콘텐츠 발행 현황도 함께</h2>
            <p>
              SEO 분석과 함께, 네이버에서 브랜드 키워드가 얼마나 언급되고 있는지도 자동으로
              확인할 수 있어요. (이 영역도 자유롭게 텍스트/이미지로 채워보세요.)
            </p>
          </div>
          <div className="home-content-image-placeholder">이미지 영역</div>
        </div>
      </section>
    </div>
  );
}
